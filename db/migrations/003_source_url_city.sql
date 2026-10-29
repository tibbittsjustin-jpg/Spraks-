-- Guard only: Filters' 002 normally adds this. Missing/absent = false.
alter table activities add column if not exists age21 boolean not null default false;
create index if not exists activities_age21_idx on activities (age21) where age21;

alter table activities add column if not exists source_url text;
alter table activities add column if not exists city text;

do $$ begin
  alter table activities add constraint activities_source_url_https
    check (source_url is null or (source_url ~ '^https://[^\s]+$' and length(source_url) <= 2048));
exception when duplicate_object then null; end $$;

-- City is a likely admin/API filter ("everything in Provo"); case-insensitive lookup.
create index if not exists activities_city_idx on activities (lower(city)) where city is not null;

comment on column activities.source_url is 'Public https page the activity was verified on; shown to users';
comment on column activities.city is 'Display/filter city, e.g. Provo. From coords file or ingest; not used for distance math';
