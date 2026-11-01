-- P4 review: one report per reporter, target, and reason.
-- A different note does not open a second row. 011 is not used.
-- No new columns. public.reports already has deny-all RLS.

drop index if exists public.reports_identical_reporter_uidx;

create unique index reports_identical_reporter_uidx
  on public.reports (
    reporter_id,
    target_type,
    target_id,
    coalesce(list_id, '00000000-0000-0000-0000-000000000000'::uuid),
    reason
  )
  where reporter_id is not null;

-- Deny-all again. 010 and 013 already did this. No policies.
do $body$
begin
  execute 'alter table public.reports enable row level security';
  execute 'revoke all on table public.reports from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.reports from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.reports from authenticated';
  end if;
end
$body$;
