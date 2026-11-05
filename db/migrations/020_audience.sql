-- Additive audience tags for Discover. No backfill.
--
-- activities.audience is a closed set of five chips:
--   Family Friendly, Friends, Date, Group Date, Solo
-- An empty array means "not tagged yet". The application reads an empty
-- or missing value as Friends and Date. It does not write that fallback,
-- and it never treats an empty value as Family Friendly.
--
-- This file does not UPDATE existing rows. Tagging is a later reviewed
-- pass, after a database snapshot. The column default is '{}' only.
--
-- RLS stays enabled. No policy is added. anon, authenticated, and public
-- stay revoked. Table privileges already cover columns added later, so
-- this column is not granted to the Data API. The app server connects as
-- the table owner.

alter table public.activities
  add column if not exists audience text[] not null default '{}';

do $$
begin
  if not exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'activities'
      and con.conname = 'activities_audience_check'
  ) then
    alter table public.activities
      add constraint activities_audience_check
      check (
        array_position(audience, null) is null
        and audience <@ array[
          'Family Friendly',
          'Friends',
          'Date',
          'Group Date',
          'Solo'
        ]::text[]
      );
  end if;
end $$;

create index if not exists activities_audience_gin
  on public.activities using gin (audience);

comment on column public.activities.audience is
  'Who the activity is for: Family Friendly, Friends, Date, Group Date, Solo. Empty means not tagged yet. Readers treat empty as Friends and Date, never Family Friendly. Solo is one person alone. Do not tag 21+ rows Family Friendly.';

alter table public.activities enable row level security;
revoke all on table public.activities from public;
revoke all on table public.activities from anon;
revoke all on table public.activities from authenticated;
