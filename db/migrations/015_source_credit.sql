-- Per-activity attribution for outside datasets and event feeds.
-- 005 and 011 are reserved and are not used.
-- activities.source_url already exists (003). activities.source is the
-- activity_source enum (curated, ai, business, community, affiliate),
-- not the dataset or feed name. These columns hold that name.
-- Idempotent. Adds no policy. RLS stays deny-all.

alter table public.activities add column if not exists source_key text;
alter table public.activities add column if not exists source_credit text;

do $$ begin
  alter table public.activities add constraint activities_source_key_check
    check (
      source_key is null
      or source_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.activities add constraint activities_source_credit_check
    check (
      source_credit is null
      or (
        char_length(source_credit) between 1 and 500
        and char_length(btrim(source_credit)) >= 1
        and source_credit !~ '[[:cntrl:]]'
      )
    );
exception when duplicate_object then null; end $$;

comment on column public.activities.source_key is
  'Dataset or feed key, e.g. ugrc_trailheads or stateparks. Not the activity_source enum.';
comment on column public.activities.source_credit is
  'Plain-text credit for this row, e.g. the UGRC line or via Utah State Parks.';

create index if not exists activities_source_key_idx
  on public.activities (source_key)
  where source_key is not null;

-- Deny-all again. 001 already enabled RLS and revoked anon and authenticated.
-- No policies. The server uses DATABASE_URL only.
do $body$
begin
  execute 'alter table public.activities enable row level security';
  execute 'revoke all on table public.activities from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.activities from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.activities from authenticated';
  end if;
end
$body$;
