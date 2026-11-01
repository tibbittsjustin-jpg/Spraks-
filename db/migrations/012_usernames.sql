-- P2: the live username for an account. 011 is reserved and is not
-- this file. Depends on 010 for auth.users and username_holds.
--
-- Idempotent. citext stays in extensions, the same place 010 put it.
-- RLS is on and there are no policies. anon and authenticated are
-- revoked. The Express server (DATABASE_URL) is the only reader and
-- writer.
--
-- A hold is a released name, not the live row. This table does not
-- foreign-key to username_holds. P2 writes a hold when a name changes.

create schema if not exists extensions;

do $body$
declare
  ext_schema name;
begin
  select n.nspname into ext_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'citext';

  if ext_schema is null then
    create extension citext schema extensions;
  elsif ext_schema <> 'extensions' then
    alter extension citext set schema extensions;
  end if;
end
$body$;

-- Local and CI databases have no Supabase auth schema. On Supabase the
-- real auth.users already exists and this block does not touch it.
create schema if not exists auth;

do $body$
begin
  if to_regclass('auth.users') is null then
    create table auth.users (
      id uuid primary key
    );
  end if;
end
$body$;

create table if not exists public.usernames (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username extensions.citext not null unique,
  changed_at timestamptz not null default now()
);

comment on table public.usernames is
  'Live username for one account. Released names are written to username_holds. No foreign key to username_holds.';
comment on column public.usernames.changed_at is
  'When the name last changed. The first claim stores this one cooldown window in the past so the claim itself does not start the 30-day clock.';

-- Deny-all, same posture as 010. No policies are created.
do $body$
declare
  t text;
  tables text[] := array['usernames'];
begin
  foreach t in array tables
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table public.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on table public.%I from authenticated', t);
    end if;
  end loop;
end
$body$;
