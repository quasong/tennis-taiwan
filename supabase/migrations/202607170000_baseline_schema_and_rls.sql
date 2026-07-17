-- Baseline schema for Tennis Taiwan.
-- This migration creates the core tables, indexes, constraints, profile trigger,
-- and row-level security policies needed to rebuild the database.

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.courts (
    id uuid primary key default extensions.gen_random_uuid(),
    name text not null,
    city text not null,
    district text,
    address text,
    surface text,
    created_at timestamptz not null default now(),
    constraint courts_name_city_district_address_unique
        unique (name, city, district, address)
);

comment on table public.courts is '台灣網球場資料，用於建立與篩選球局。';
comment on column public.courts.name is '球場名稱。';
comment on column public.courts.city is '城市，例如台北、新北、桃園、台中、台南、高雄。';
comment on column public.courts.district is '行政區，可為空。';
comment on column public.courts.address is '球場地址，可用於 Google Maps 導航。';
comment on column public.courts.surface is '球場材質，例如紅土、硬地。';

create table if not exists public.users (
    id uuid primary key references auth.users(id) on update cascade on delete cascade,
    email text unique,
    nickname text not null,
    ntrp_level numeric(2, 1),
    preferred_court_id uuid references public.courts(id) on update cascade on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint users_nickname_min_length check (char_length(trim(nickname)) >= 2),
    constraint users_ntrp_level_range check (
        ntrp_level is null or (ntrp_level >= 1.0 and ntrp_level <= 7.0)
    )
);

alter table public.users
    add column if not exists updated_at timestamptz not null default now();

comment on table public.users is '使用者公開 profile。id 對應 auth.users.id。';
comment on column public.users.email is '使用者 email，目前球局卡片與個人頁會顯示。';
comment on column public.users.nickname is '使用者暱稱。';
comment on column public.users.ntrp_level is '使用者 NTRP 程度，範圍 1.0 到 7.0。';
comment on column public.users.preferred_court_id is '偏好的網球場，可為空。';

create table if not exists public.matches (
    id uuid primary key default extensions.gen_random_uuid(),
    host_user_id uuid not null references public.users(id) on update cascade on delete cascade,
    court_id uuid not null references public.courts(id) on update cascade on delete restrict,
    play_time timestamptz not null,
    required_players integer not null,
    joined_players integer not null default 0,
    estimated_fee_per_person numeric(10, 2) not null default 0,
    note text,
    status text not null default '徵求中',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint matches_required_players_check check (required_players > 0),
    constraint matches_joined_players_check check (joined_players >= 0),
    constraint matches_joined_players_limit check (joined_players <= required_players),
    constraint matches_estimated_fee_per_person_check check (estimated_fee_per_person >= 0),
    constraint matches_status_check check (status in ('徵求中', '已滿團', '已結束'))
);

alter table public.matches
    add column if not exists updated_at timestamptz not null default now();

comment on table public.matches is '網球約球資料。joined_players 由 match_participants 同步。';
comment on column public.matches.host_user_id is '球局創建者。';
comment on column public.matches.court_id is '球局所在球場。';
comment on column public.matches.play_time is '開打時間。';
comment on column public.matches.required_players is '球局最大人數。';
comment on column public.matches.joined_players is '目前已加入人數，透過 trigger 從參與名單同步。';
comment on column public.matches.estimated_fee_per_person is '預估每人費用。';
comment on column public.matches.note is '球局備註。';
comment on column public.matches.status is '球局狀態：徵求中、已滿團、已結束。';

create table if not exists public.match_participants (
    id uuid primary key default extensions.gen_random_uuid(),
    match_id uuid not null references public.matches(id) on update cascade on delete cascade,
    user_id uuid not null references public.users(id) on update cascade on delete cascade,
    role text not null default '參與者',
    status text not null default '已加入',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint match_participants_role_check check (role in ('創建者', '參與者')),
    constraint match_participants_status_check check (status in ('已加入', '已取消')),
    constraint match_participants_match_user_unique unique (match_id, user_id)
);

alter table public.match_participants
    add column if not exists updated_at timestamptz not null default now();

comment on table public.match_participants is '球局參與名單，一個使用者在一個球局只能有一筆紀錄。';
comment on column public.match_participants.match_id is '參與的球局。';
comment on column public.match_participants.user_id is '參與者。';
comment on column public.match_participants.role is '球局角色：創建者或參與者。';
comment on column public.match_participants.status is '參與狀態：已加入或已取消。';

create index if not exists idx_courts_city_district
    on public.courts (city, district);

create index if not exists idx_courts_name
    on public.courts (name);

create index if not exists idx_users_preferred_court_id
    on public.users (preferred_court_id);

create index if not exists idx_matches_host_user_id
    on public.matches (host_user_id);

create index if not exists idx_matches_court_id
    on public.matches (court_id);

create index if not exists idx_matches_play_time
    on public.matches (play_time);

create index if not exists idx_matches_status
    on public.matches (status);

create index if not exists idx_matches_status_play_time
    on public.matches (status, play_time);

create index if not exists idx_match_participants_match_id
    on public.match_participants (match_id);

create index if not exists idx_match_participants_user_id
    on public.match_participants (user_id);

create index if not exists idx_match_participants_user_status
    on public.match_participants (user_id, status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists matches_set_updated_at on public.matches;
create trigger matches_set_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

drop trigger if exists match_participants_set_updated_at on public.match_participants;
create trigger match_participants_set_updated_at
before update on public.match_participants
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.users (
        id,
        email,
        nickname,
        ntrp_level
    )
    values (
        new.id,
        lower(new.email),
        coalesce(nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''), split_part(new.email, '@', 1)),
        nullif(new.raw_user_meta_data ->> 'ntrp_level', '')::numeric
    )
    on conflict (id) do update
       set email = excluded.email,
           nickname = excluded.nickname,
           ntrp_level = excluded.ntrp_level,
           updated_at = now();

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.courts enable row level security;
alter table public.users enable row level security;
alter table public.matches enable row level security;
alter table public.match_participants enable row level security;

drop policy if exists "Courts are readable by everyone" on public.courts;
create policy "Courts are readable by everyone"
on public.courts
for select
to anon, authenticated
using (true);

drop policy if exists "Profiles are readable by everyone" on public.users;
create policy "Profiles are readable by everyone"
on public.users
for select
to anon, authenticated
using (true);

drop policy if exists "Users can update their own profile" on public.users;
create policy "Users can update their own profile"
on public.users
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Matches are readable by everyone" on public.matches;
create policy "Matches are readable by everyone"
on public.matches
for select
to anon, authenticated
using (true);

drop policy if exists "Participants are readable by everyone" on public.match_participants;
create policy "Participants are readable by everyone"
on public.match_participants
for select
to anon, authenticated
using (true);

grant usage on schema public to anon, authenticated;
grant select on public.courts to anon, authenticated;
grant select on public.users to anon, authenticated;
grant update (nickname, ntrp_level, preferred_court_id) on public.users to authenticated;
grant select on public.matches to anon, authenticated;
grant select on public.match_participants to anon, authenticated;

commit;
