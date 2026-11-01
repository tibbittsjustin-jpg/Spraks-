-- P3: list_item reports, notes of at most 500 characters, and one
-- identical report per reporter. public.reports already has deny-all
-- RLS from 010. This file adds no policy and grants nothing.
-- 011 is not used.

do $body$
declare
  c name;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'reports'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%target_type%'
  loop
    execute format('alter table public.reports drop constraint %I', c);
  end loop;

  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'reports'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%note%'
  loop
    execute format('alter table public.reports drop constraint %I', c);
  end loop;
end
$body$;

alter table public.reports add constraint reports_target_type_check
  check (target_type in ('user', 'list', 'list_name', 'list_item', 'list_invite'));

alter table public.reports add constraint reports_note_check
  check (note is null or char_length(note) <= 500);

-- Same reporter, target, list, reason, and note. Null list and note
-- match another null. Closed rows count, so a repeat does not pile up.
create unique index if not exists reports_identical_reporter_uidx
  on public.reports (
    reporter_id,
    target_type,
    target_id,
    coalesce(list_id, '00000000-0000-0000-0000-000000000000'::uuid),
    reason,
    coalesce(note, '')
  )
  where reporter_id is not null;

-- Deny-all again. 010 already did this. No policies.
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
