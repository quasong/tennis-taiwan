-- Hotfix for databases created before the baseline migration existed.
-- The updated_at triggers require these columns to exist on existing tables.

begin;

alter table public.users
    add column if not exists updated_at timestamptz not null default now();

alter table public.matches
    add column if not exists updated_at timestamptz not null default now();

alter table public.match_participants
    add column if not exists updated_at timestamptz not null default now();

commit;
