-- $20-step cost bands. Widen only: old and new values are both accepted,
-- and no row is updated. 016 and 017 are reserved and are not required.
-- db/migrate.js applies this file in filename order when it is unapplied.
--
-- After 001 through 015, activities has one cost check, named
-- activities_cost_check:
--   cost in ('Free', '$1-$10', '$20-$30', '$100 and under', 'Over $100')
-- 001 declared that check inline. 002 drops a check whose definition
-- mentions cost and does not mention 'Over $100', then creates
-- activities_cost_check only when that name is missing. A check that
-- already allows 'Over $100' under any other name is left in place.
-- Drop every check on the cost column, by the known name or by the
-- column and definition, then add one check with both sets of values.
-- Hyphens are ASCII U+002D.
--
-- cost_unit is nullable text. NULL or 'per car'. The check is named
-- activities_cost_unit_check.
-- Idempotent. Adds no policy. RLS stays deny-all.

do $$
declare
  names text[];
  rname text;
begin
  select array_agg(distinct con.conname) into names
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'activities'
    and con.contype = 'c'
    and (
      con.conname = 'activities_cost_check'
      or exists (
        select 1
        from pg_attribute att
        where att.attrelid = rel.oid
          and att.attnum = any (con.conkey)
          and att.attname = 'cost'
          and not att.attisdropped
      )
      or (
        pg_get_constraintdef(con.oid) ~ '\mcost\M'
        and pg_get_constraintdef(con.oid) !~ '\mcost_unit\M'
      )
    );

  if names is not null then
    foreach rname in array names loop
      execute format('alter table public.activities drop constraint %I', rname);
    end loop;
  end if;
end $$;

alter table public.activities add constraint activities_cost_check
  check (cost in (
    'Free',
    '$1-$10',
    '$20-$30',
    '$100 and under',
    'Over $100',
    '$1-$20',
    '$21-$40',
    '$41-$60',
    '$61-$80',
    '$81-$100'
  ));

alter table public.activities add column if not exists cost_unit text;

do $$
declare
  names text[];
  rname text;
begin
  select array_agg(distinct con.conname) into names
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'activities'
    and con.contype = 'c'
    and (
      con.conname = 'activities_cost_unit_check'
      or exists (
        select 1
        from pg_attribute att
        where att.attrelid = rel.oid
          and att.attnum = any (con.conkey)
          and att.attname = 'cost_unit'
          and not att.attisdropped
      )
      or pg_get_constraintdef(con.oid) ~ '\mcost_unit\M'
    );

  if names is not null then
    foreach rname in array names loop
      execute format('alter table public.activities drop constraint %I', rname);
    end loop;
  end if;
end $$;

alter table public.activities add constraint activities_cost_unit_check
  check (cost_unit is null or cost_unit = 'per car');

comment on column public.activities.cost_unit is
  'Display label for the fee. NULL, or per car for a vehicle fee. Not a filter.';

-- Deny-all again. 001 and 015 already enabled RLS and revoked anon and authenticated.
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
