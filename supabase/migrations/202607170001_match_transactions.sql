-- Move match mutations into PostgreSQL transactions.
-- Run this once in Supabase SQL Editor before deploying the API changes.

begin;

-- Keep one participant row per user per match. This makes join retries and
-- concurrent joins deterministic.
with duplicate_participants as (
    select
        id,
        row_number() over (
            partition by match_id, user_id
            order by
                case status when '已加入' then 0 else 1 end,
                updated_at desc nulls last,
                id desc
        ) as row_number
    from public.match_participants
)
delete from public.match_participants participant
using duplicate_participants duplicate
where participant.id = duplicate.id
  and duplicate.row_number > 1;

create unique index if not exists match_participants_match_user_unique
    on public.match_participants (match_id, user_id);

-- Recreate participant foreign keys with cascade delete, while preserving
-- unknown project-generated constraint names.
do $$
declare
    match_fk_name text;
    user_fk_name text;
begin
    select constraint_name
      into match_fk_name
      from information_schema.referential_constraints
     where constraint_schema = 'public'
       and constraint_name in (
           select conname
             from pg_constraint
            where conrelid = 'public.match_participants'::regclass
              and confrelid = 'public.matches'::regclass
              and contype = 'f'
       )
     limit 1;

    if match_fk_name is not null then
        execute format(
            'alter table public.match_participants drop constraint %I',
            match_fk_name
        );
    end if;

    alter table public.match_participants
        add constraint match_participants_match_id_fkey
        foreign key (match_id)
        references public.matches(id)
        on update cascade
        on delete cascade;

    select constraint_name
      into user_fk_name
      from information_schema.referential_constraints
     where constraint_schema = 'public'
       and constraint_name in (
           select conname
             from pg_constraint
            where conrelid = 'public.match_participants'::regclass
              and confrelid = 'public.users'::regclass
              and contype = 'f'
       )
     limit 1;

    if user_fk_name is not null then
        execute format(
            'alter table public.match_participants drop constraint %I',
            user_fk_name
        );
    end if;

    alter table public.match_participants
        add constraint match_participants_user_id_fkey
        foreign key (user_id)
        references public.users(id)
        on update cascade
        on delete cascade;
end $$;

create or replace function public.sync_match_joined_players(p_match_id uuid)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
    active_count integer;
    synced_match public.matches;
begin
    select count(*)::integer
      into active_count
      from public.match_participants
     where match_id = p_match_id
       and status = '已加入';

    update public.matches
       set joined_players = active_count,
           status = case
               when status = '已結束' then '已結束'
               when active_count >= required_players then '已滿團'
               else '徵求中'
           end
     where id = p_match_id
     returning * into synced_match;

    return synced_match;
end;
$$;

create or replace function public.prevent_match_overbooking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    target_match public.matches;
    active_count integer;
begin
    if new.status is distinct from '已加入' then
        return new;
    end if;

    select *
      into target_match
      from public.matches
     where id = new.match_id
     for update;

    if not found then
        raise exception '找不到指定的球局。';
    end if;

    if target_match.status = '已結束' then
        raise exception '此球局目前無法加入。';
    end if;

    select count(*)::integer
      into active_count
      from public.match_participants
     where match_id = new.match_id
       and status = '已加入'
       and id is distinct from new.id;

    if active_count + 1 > target_match.required_players then
        raise exception '此球局已滿團。';
    end if;

    return new;
end;
$$;

create or replace function public.sync_match_joined_players_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    target_match_id uuid;
begin
    target_match_id := coalesce(new.match_id, old.match_id);
    perform public.sync_match_joined_players(target_match_id);
    return null;
end;
$$;

drop trigger if exists match_participants_prevent_overbooking
    on public.match_participants;

create trigger match_participants_prevent_overbooking
before insert or update of status, match_id
on public.match_participants
for each row
execute function public.prevent_match_overbooking();

drop trigger if exists match_participants_sync_joined_players
    on public.match_participants;

create trigger match_participants_sync_joined_players
after insert or update of status, match_id or delete
on public.match_participants
for each row
execute function public.sync_match_joined_players_trigger();

create or replace function public.assert_match_actor(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    jwt_role text;
begin
    jwt_role := current_setting('request.jwt.claim.role', true);

    if jwt_role = 'service_role' then
        return;
    end if;

    if auth.uid() is null then
        raise exception '請先登入後再操作球局。';
    end if;

    if auth.uid() <> p_user_id then
        raise exception '登入狀態與操作使用者不一致。';
    end if;
end;
$$;

create or replace function public.create_match_with_host(
    p_host_user_id uuid,
    p_court_id uuid,
    p_play_time timestamptz,
    p_required_players integer,
    p_estimated_fee_per_person numeric,
    p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    new_match public.matches;
    new_participant public.match_participants;
    synced_match public.matches;
begin
    perform public.assert_match_actor(p_host_user_id);

    if p_required_players <= 1 then
        raise exception 'maxPlayers 必須是大於 1 的整數。';
    end if;

    if p_estimated_fee_per_person < 0 then
        raise exception 'fee 必須是大於或等於 0 的數字。';
    end if;

    if not exists (select 1 from public.users where id = p_host_user_id) then
        raise exception '找不到指定的使用者。';
    end if;

    if not exists (select 1 from public.courts where id = p_court_id) then
        raise exception '找不到指定的球場。';
    end if;

    insert into public.matches (
        host_user_id,
        court_id,
        play_time,
        required_players,
        joined_players,
        estimated_fee_per_person,
        note,
        status
    )
    values (
        p_host_user_id,
        p_court_id,
        p_play_time,
        p_required_players,
        0,
        p_estimated_fee_per_person,
        p_note,
        '徵求中'
    )
    returning * into new_match;

    insert into public.match_participants (
        match_id,
        user_id,
        role,
        status,
        updated_at
    )
    values (
        new_match.id,
        p_host_user_id,
        '創建者',
        '已加入',
        now()
    )
    returning * into new_participant;

    select * into synced_match
      from public.matches
     where id = new_match.id;

    return jsonb_build_object(
        'message', '約球建立成功。',
        'match', to_jsonb(synced_match),
        'participant', to_jsonb(new_participant)
    );
end;
$$;

create or replace function public.join_match_transaction(
    p_match_id uuid,
    p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    target_match public.matches;
    participant public.match_participants;
    synced_match public.matches;
    active_count integer;
begin
    perform public.assert_match_actor(p_user_id);

    select *
      into target_match
      from public.matches
     where id = p_match_id
     for update;

    if not found then
        raise exception '找不到指定的球局。';
    end if;

    if target_match.host_user_id = p_user_id then
        return jsonb_build_object(
            'message', '創建者已經在此球局中。',
            'match', to_jsonb(target_match)
        );
    end if;

    if target_match.status <> '徵求中' then
        raise exception '此球局目前無法加入。';
    end if;

    if not exists (select 1 from public.users where id = p_user_id) then
        raise exception '找不到指定的使用者。';
    end if;

    select *
      into participant
      from public.match_participants
     where match_id = p_match_id
       and user_id = p_user_id;

    if found and participant.status = '已加入' then
        return jsonb_build_object(
            'message', '你已經加入此球局。',
            'match', to_jsonb(target_match),
            'participant', to_jsonb(participant)
        );
    end if;

    select count(*)::integer
      into active_count
      from public.match_participants
     where match_id = p_match_id
       and status = '已加入';

    if active_count >= target_match.required_players then
        raise exception '此球局已滿團。';
    end if;

    insert into public.match_participants (
        match_id,
        user_id,
        role,
        status,
        updated_at
    )
    values (
        p_match_id,
        p_user_id,
        '參與者',
        '已加入',
        now()
    )
    on conflict (match_id, user_id)
    do update
       set role = '參與者',
           status = '已加入',
           updated_at = now()
    returning * into participant;

    select * into synced_match
      from public.matches
     where id = p_match_id;

    return jsonb_build_object(
        'message', '已加入球局。',
        'match', to_jsonb(synced_match),
        'participant', to_jsonb(participant)
    );
end;
$$;

create or replace function public.leave_match_transaction(
    p_match_id uuid,
    p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    target_match public.matches;
    deleted_participant public.match_participants;
    synced_match public.matches;
begin
    perform public.assert_match_actor(p_user_id);

    select *
      into target_match
      from public.matches
     where id = p_match_id
     for update;

    if not found then
        raise exception '找不到指定的球局。';
    end if;

    if target_match.host_user_id = p_user_id then
        raise exception '創建者請使用取消球局。';
    end if;

    if target_match.status not in ('徵求中', '已滿團') then
        raise exception '此球局目前無法退出。';
    end if;

    delete from public.match_participants
     where match_id = p_match_id
       and user_id = p_user_id
       and status = '已加入'
     returning * into deleted_participant;

    select * into synced_match
      from public.matches
     where id = p_match_id;

    if deleted_participant.id is null then
        return jsonb_build_object(
            'message', '你尚未加入此球局。',
            'match', to_jsonb(synced_match)
        );
    end if;

    return jsonb_build_object(
        'message', '已退出球局。',
        'match', to_jsonb(synced_match)
    );
end;
$$;

create or replace function public.cancel_match_transaction(
    p_match_id uuid,
    p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    target_match public.matches;
    synced_match public.matches;
begin
    perform public.assert_match_actor(p_user_id);

    select *
      into target_match
      from public.matches
     where id = p_match_id
     for update;

    if not found then
        raise exception '找不到指定的球局。';
    end if;

    if target_match.host_user_id <> p_user_id then
        raise exception '只有球局創建者可以取消此球局。';
    end if;

    if target_match.status = '已結束' then
        return jsonb_build_object(
            'message', '球局已經結束。',
            'match', to_jsonb(target_match)
        );
    end if;

    update public.matches
       set status = '已結束'
     where id = p_match_id;

    update public.match_participants
       set status = '已取消',
           updated_at = now()
     where match_id = p_match_id;

    select * into synced_match
      from public.matches
     where id = p_match_id;

    return jsonb_build_object(
        'message', '球局已取消。',
        'match', to_jsonb(synced_match)
    );
end;
$$;

create or replace function public.delete_match_transaction(
    p_match_id uuid,
    p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    target_match public.matches;
    deleted_match_id uuid;
begin
    perform public.assert_match_actor(p_user_id);

    select *
      into target_match
      from public.matches
     where id = p_match_id
     for update;

    if not found then
        raise exception '找不到指定的球局。';
    end if;

    if target_match.host_user_id <> p_user_id then
        raise exception '只有球局創建者可以刪除此球局。';
    end if;

    if target_match.status <> '已結束' then
        raise exception '只有已結束的球局可以刪除。';
    end if;

    delete from public.match_participants
     where match_id = p_match_id;

    delete from public.matches
     where id = p_match_id
     returning id into deleted_match_id;

    return jsonb_build_object(
        'message', '球局已刪除。',
        'match', jsonb_build_object('id', deleted_match_id)
    );
end;
$$;

revoke all on function public.sync_match_joined_players(uuid)
    from public, anon, authenticated;
revoke all on function public.prevent_match_overbooking()
    from public, anon, authenticated;
revoke all on function public.sync_match_joined_players_trigger()
    from public, anon, authenticated;
revoke all on function public.assert_match_actor(uuid)
    from public, anon, authenticated;
revoke all on function public.create_match_with_host(uuid, uuid, timestamptz, integer, numeric, text)
    from public, anon, authenticated;
revoke all on function public.join_match_transaction(uuid, uuid)
    from public, anon, authenticated;
revoke all on function public.leave_match_transaction(uuid, uuid)
    from public, anon, authenticated;
revoke all on function public.cancel_match_transaction(uuid, uuid)
    from public, anon, authenticated;
revoke all on function public.delete_match_transaction(uuid, uuid)
    from public, anon, authenticated;

grant execute on function public.create_match_with_host(uuid, uuid, timestamptz, integer, numeric, text)
    to authenticated, service_role;
grant execute on function public.join_match_transaction(uuid, uuid)
    to authenticated, service_role;
grant execute on function public.leave_match_transaction(uuid, uuid)
    to authenticated, service_role;
grant execute on function public.cancel_match_transaction(uuid, uuid)
    to authenticated, service_role;
grant execute on function public.delete_match_transaction(uuid, uuid)
    to authenticated, service_role;

commit;
