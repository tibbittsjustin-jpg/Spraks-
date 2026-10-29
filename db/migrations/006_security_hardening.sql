-- Security advisor follow-up. Idempotent. Safe on a database that already has data.
--
-- citext moves to schema `extensions`. PostGIS stays in `public`.
-- ALTER EXTENSION postgis SET SCHEMA is not used: PostGIS is not relocatable
-- (relocatable = false on PostGIS 3.x), and dropping it would destroy geography
-- columns and their data. The extension_in_public warning for postgis is accepted.
--
-- spatial_ref_sys stays with PostGIS. Privileges are revoked from anon,
-- authenticated, and PUBLIC when this role can still read SRID 4326 afterwards.
-- ENABLE ROW LEVEL SECURITY is attempted and rolled back if this role cannot
-- read the table, or skipped on insufficient_privilege (supabase_admin owns
-- the table on Supabase). If RLS stays off, rls_disabled_in_public for
-- spatial_ref_sys remains a known, accepted finding, mitigated by the revokes.
--
-- rls_enabled_no_policy on activities, sources, and submissions is accepted.
-- RLS stays on and there are still no policies. The server uses DATABASE_URL
-- only; anon and authenticated are not granted access.
--
-- search_path on the connection and database keeps `public` ahead of
-- `extensions`, so unqualified public names still resolve. That includes
-- 001-003 and 004_materials.sql (`alter table activities add column ... text[]`),
-- which does not use citext. pg_catalog stays on the path so text[] does too.
-- A missing migration number (005 is not in this repo) does not affect this file.

create schema if not exists extensions;

do $$
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
end $$;

-- New sessions pick this up. The node pool also sends it at connect time,
-- because ALTER DATABASE does not change connections that are already open
-- and may be rejected inside a transaction or without privilege.
do $$
begin
  execute format(
    'alter database %I set search_path to public, extensions, pg_catalog',
    current_database()
  );
exception
  when insufficient_privilege or invalid_transaction_state then
    raise notice 'database search_path unchanged (%)', sqlerrm;
end $$;

alter function public.protect_locked_coords() set search_path = public, extensions, pg_catalog;
alter function public.set_updated_at() set search_path = public, extensions, pg_catalog;

-- st_estimatedextent is SECURITY DEFINER and is not used by the app.
-- PUBLIC holds the default EXECUTE grant, so revoking only anon/authenticated
-- would leave the Data API callable. Revoking PUBLIC is safe: the owner keeps
-- the grant made to the owner, and geography casts do not call this function.
do $$
declare
  fn text;
begin
  for fn in
    select format(
      '%I.%I(%s)',
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid)
    )
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'st_estimatedextent'
  loop
    begin
      execute format('revoke execute on function %s from public', fn);
    exception
      when insufficient_privilege or undefined_function or undefined_object then
        raise notice 'st_estimatedextent: revoke from public skipped for % (%)', fn, sqlerrm;
    end;
    if exists (select 1 from pg_roles where rolname = 'anon') then
      begin
        execute format('revoke execute on function %s from anon', fn);
      exception
        when insufficient_privilege or undefined_function or undefined_object then
          raise notice 'st_estimatedextent: revoke from anon skipped for % (%)', fn, sqlerrm;
      end;
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      begin
        execute format('revoke execute on function %s from authenticated', fn);
      exception
        when insufficient_privilege or undefined_function or undefined_object then
          raise notice 'st_estimatedextent: revoke from authenticated skipped for % (%)', fn, sqlerrm;
      end;
    end if;
  end loop;
end $$;

do $$
begin
  if to_regclass('public.spatial_ref_sys') is null then
    raise notice 'spatial_ref_sys is absent; postgis revoke skipped';
    return;
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    begin
      revoke all on table public.spatial_ref_sys from anon;
    exception
      when insufficient_privilege then
        raise notice 'spatial_ref_sys: revoke from anon skipped (%)', sqlerrm;
    end;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    begin
      revoke all on table public.spatial_ref_sys from authenticated;
    exception
      when insufficient_privilege then
        raise notice 'spatial_ref_sys: revoke from authenticated skipped (%)', sqlerrm;
    end;
  end if;

  -- Roll back the PUBLIC revoke when it would leave this role unable to read
  -- SRID 4326. Geography input checks that row.
  begin
    revoke all on table public.spatial_ref_sys from public;
    perform 1 from public.spatial_ref_sys where srid = 4326;
    if not found then
      raise exception 'spatial_ref_sys not readable after revoking PUBLIC'
        using errcode = 'insufficient_privilege';
    end if;
  exception
    when insufficient_privilege then
      raise notice 'spatial_ref_sys: revoke from PUBLIC skipped (%)', sqlerrm;
  end;

  begin
    alter table public.spatial_ref_sys enable row level security;
    perform 1 from public.spatial_ref_sys where srid = 4326;
    if not found then
      raise exception 'spatial_ref_sys not readable after enabling RLS'
        using errcode = 'insufficient_privilege';
    end if;
  exception
    when insufficient_privilege then
      raise notice 'spatial_ref_sys: RLS left disabled (%)', sqlerrm;
  end;
end $$;
