-- Catalog cost band "Over $100", and a flag for alcohol-centered ideas.
-- 001 declared the cost CHECK inline, so Postgres names it activities_cost_check.
-- Look the constraint up by definition in case that name differs.

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'activities'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%cost%'
      and pg_get_constraintdef(con.oid) not like '%Over $100%'
  loop
    execute format('alter table activities drop constraint %I', r.conname);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'activities'
      and con.conname = 'activities_cost_check'
  ) then
    alter table activities add constraint activities_cost_check
      check (cost in ('Free', '$1-$10', '$20-$30', '$100 and under', 'Over $100'));
  end if;
end $$;

alter table activities add column if not exists age21 boolean not null default false;

create index if not exists activities_age21_idx on activities (age21) where age21;
