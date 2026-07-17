-- Restrict public profile data and expose participant email addresses only to
-- authenticated users who actively belong to the same match.

begin;

revoke select on public.users from anon, authenticated;
grant select (id, nickname, ntrp_level) on public.users to anon, authenticated;

comment on column public.users.email is
    '私密 Email；僅本人或同一球局的已加入玩家可透過受控 API 取得。';

drop policy if exists "Participants are readable by everyone"
    on public.match_participants;
drop policy if exists "Users can read their own participation"
    on public.match_participants;

create policy "Users can read their own participation"
on public.match_participants
for select
to authenticated
using (auth.uid() = user_id);

revoke select on public.match_participants from anon, authenticated;
grant select on public.match_participants to authenticated;

create or replace function public.get_visible_match_participant_contacts(
    p_match_ids uuid[]
)
returns table (
    match_id uuid,
    user_id uuid,
    email text
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        participant.match_id,
        participant.user_id,
        profile.email::text
    from public.match_participants as viewer
    join public.match_participants as participant
      on participant.match_id = viewer.match_id
     and participant.status = '已加入'
    join public.users as profile
      on profile.id = participant.user_id
    where auth.uid() is not null
      and viewer.user_id = auth.uid()
      and viewer.status = '已加入'
      and p_match_ids is not null
      and viewer.match_id = any (p_match_ids);
$$;

comment on function public.get_visible_match_participant_contacts(uuid[]) is
    '回傳目前登入者已參加球局的參與者 Email；未參加的球局不會回傳資料。';

revoke all on function public.get_visible_match_participant_contacts(uuid[])
    from public, anon, authenticated;
grant execute on function public.get_visible_match_participant_contacts(uuid[])
    to authenticated;

commit;
