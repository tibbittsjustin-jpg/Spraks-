-- Indexes for radius-scoped nearby pages.
-- 005 and 011 are reserved and are not used.
-- 017 is reserved for a bulk loader. 018 is reserved for a cost-band change.
-- Idempotent. Adds no policy. RLS stays deny-all.
--
-- The nearby read is two statements:
--   pinned rows inside the radius, ordered by location <-> point
--   then rows with no location, ordered by id
-- A partial GiST index matches the pinned predicate (approved, free, has a
-- point) so the planner can use KNN without walking pending or paid rows.
-- The id indexes serve the keyset on general ideas and on the unlocated list.

create index if not exists activities_approved_free_location_gix
  on public.activities using gist (location)
  where status = 'approved'
    and tier = 'free'
    and location is not null;

create index if not exists activities_approved_free_unlocated_id_idx
  on public.activities (id)
  where status = 'approved'
    and tier = 'free'
    and location is null;

create index if not exists activities_approved_free_id_idx
  on public.activities (id)
  where status = 'approved'
    and tier = 'free';

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
