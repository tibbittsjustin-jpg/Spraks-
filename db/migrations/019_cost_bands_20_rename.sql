-- 019_cost_bands_20_rename.sql
-- Rename only. $1-$10 always sits inside $1-$20.
-- No update for '$20-$30' or '$100 and under'. Those stay until a
-- separately reviewed remap. This file does not raise if they remain.
-- Idempotent: a second run updates zero rows.
-- 017 is reserved for another loader and is not used here.
-- Hyphens are ASCII U+002D.

update public.activities
set cost = '$1-$20'
where cost = '$1-$10';

-- Deny-all again. 001, 015, and 018 already enabled RLS and revoked
-- anon and authenticated. No policies. The server uses DATABASE_URL only.
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
