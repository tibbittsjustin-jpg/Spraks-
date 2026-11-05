-- Place staging for licensed bulk datasets. 015 and 016 are reserved.
-- Nothing here is approved, and ODbL rows cannot reference any other source.

create extension if not exists pg_trgm;

alter type activity_source add value if not exists 'dataset';

alter table activities add column if not exists dataset_key text;
alter table activities add column if not exists source_record_id text;
alter table activities add column if not exists odbl boolean not null default false;

comment on column activities.odbl is
  'True only for an ODbL row. Those rows must not be matched to a non-ODbL activity.';

-- cost_unit and the $20-step cost bands belong to migration 018. This file
-- does not add them. place_assert_activity_cost_ready() refuses a promote
-- until 018 has widened activities.cost and added activities.cost_unit.

create unique index if not exists activities_dataset_record_uidx
  on activities (dataset_key, source_record_id)
  where dataset_key is not null and source_record_id is not null;

create table if not exists place_datasets (
  dataset_key text primary key,
  title text not null,
  owner text not null,
  license_code text not null,
  license_url text,
  credit_line text not null,
  credit_url text,
  sources_page_text text not null default '',
  disclaimer text,
  user_caution text,
  source_url text,
  legal_ref text not null,
  cleared_on date,
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  auto_publish boolean not null default false,
  refresh_cadence text not null default 'monthly'
    check (refresh_cadence in ('daily', 'monthly')),
  license_checked_on date,
  license_info_seen text,
  load_enabled boolean not null default false,
  excluded boolean not null default false,
  exclusion_reason text,
  odbl boolean not null default false,
  odbl_approved boolean not null default false,
  priority integer not null,
  dedupe_radius_m integer not null,
  centroid_exempt boolean not null default false,
  field_allowlist text[] not null default '{}',
  nps_pages_only boolean not null default false,
  feature_type text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column place_datasets.field_allowlist is
  'Gated source fields (Comments, museum_type) that Legal has confirmed. Empty means those rules do not run.';
comment on column place_datasets.license_info_seen is
  'The licenseInfo text that was read before this dataset may be loaded. Null blocks the loader.';

create table if not exists place_feature_ownership (
  feature_type text primary key,
  osm_allowed boolean not null,
  owner_dataset text references place_datasets (dataset_key),
  notes text not null default ''
);

create table if not exists place_filter_rules (
  id bigint generated always as identity primary key,
  rule_code text not null unique,
  dataset text references place_datasets (dataset_key),
  match_field text not null,
  match_value text not null,
  match_type text not null check (match_type in ('exact', 'keyword', 'regex')),
  filter_values jsonb not null,
  confidence_score numeric(4,3) not null check (confidence_score >= 0 and confidence_score <= 1),
  confidence_level text not null check (confidence_level in ('high', 'low')),
  always_review boolean not null default false,
  priority integer not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists place_filter_rules_dataset_idx
  on place_filter_rules (dataset, priority desc);

create table if not exists place_approval_batches (
  id uuid primary key,
  dataset_key text not null references place_datasets (dataset_key),
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  row_count integer,
  summary jsonb,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create table if not exists place_staging (
  id bigint generated always as identity primary key,
  dataset_key text not null references place_datasets (dataset_key),
  source_record_id text not null,
  feature_type text,
  odbl boolean not null default false,
  raw jsonb not null default '{}',
  title text not null,
  source_name text,
  description text not null default '',
  category text,
  icon text not null default '',
  setting text,
  season text[] not null default '{}',
  food boolean not null default false,
  cost text,
  cost_unit text,
  cost_requested text,
  cost_band_new text,
  duration text,
  time_of_day text[] not null default '{}',
  vibe text[] not null default '{}',
  stage text[] not null default '{}',
  date_type text[] not null default '{}',
  materials text[] not null default '{}',
  age21 boolean not null default false,
  address text,
  city text,
  source_url text,
  source_credit text not null,
  expires_at date,
  hours text,
  entrance_fee text,
  fee_display text,
  fee_url text,
  fee_as_of text,
  notice text,
  vehicle_fee text,
  more_info_url text,
  source_activity text,
  source_season text,
  open_status text,
  fee_fact text,
  source_activities text,
  reservable text,
  occurrences jsonb,
  occurrences_flag boolean not null default false,
  mapped_filters jsonb not null default '{}',
  tag_confidence numeric(4,3),
  confidence_by_field jsonb not null default '{}',
  tag_review boolean not null default true,
  actions text[] not null default '{}',
  name_key text not null default '',
  dedupe_radius_m integer not null,
  generic_name boolean not null default false,
  same_name_keep_both boolean not null default false,
  dedupe_result text not null default 'new'
    check (dedupe_result in ('new', 'merge', 'review')),
  match_activity_id integer references activities (id) on delete set null,
  match_staging_id bigint,
  match_score numeric(6,3),
  match_reason text,
  geom geography(Point, 4326),
  pin_check jsonb not null default '{}',
  needs_hand_pin boolean not null default false,
  needs_city boolean not null default false,
  county_as_city boolean not null default false,
  out_of_utah boolean not null default false,
  link text,
  link_flag text not null check (link_flag in ('official', 'dataset', 'missing')),
  status text not null default 'pending'
    check (status in ('pending', 'excluded', 'promoted', 'rejected')),
  flags jsonb not null default '{}',
  approval_batch_id uuid references place_approval_batches (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dataset_key, source_record_id)
);

alter table place_staging
  drop constraint if exists place_staging_match_staging_fk;
alter table place_staging
  add constraint place_staging_match_staging_fk
  foreign key (match_staging_id) references place_staging (id) on delete set null;

create index if not exists place_staging_geom_gix on place_staging using gist (geom);
create index if not exists place_staging_name_trgm on place_staging using gin (name_key gin_trgm_ops);
create index if not exists place_staging_batch_idx on place_staging (approval_batch_id);
create index if not exists place_staging_dataset_status_idx on place_staging (dataset_key, status);

create table if not exists place_source_credits (
  id bigint generated always as identity primary key,
  activity_id integer references activities (id) on delete cascade,
  staging_id bigint references place_staging (id) on delete set null,
  dataset_key text not null,
  source_record_id text not null,
  source_credit text not null,
  link text,
  link_flag text,
  role text not null check (role in ('primary', 'secondary')),
  odbl boolean not null default false,
  unique (dataset_key, source_record_id)
);

create table if not exists place_loader_config (
  key text primary key,
  value jsonb not null,
  note text not null default ''
);

insert into place_loader_config (key, value, note) values
  ('dedupe_merge_at', '0.85', 'Auto-merge at this similarity or higher.'),
  ('dedupe_review_at', '0.60', 'Review from this similarity up to the merge line.'),
  ('generic_name_match_m', '50', 'Generic park names only match inside this many meters.'),
  ('city_near_m', '25000', 'Claimed city must be at least this close to its centroid.'),
  ('centroid_exclusion_m', '200', 'Polygon pins this close to a city centroid need a hand pin.'),
  ('duplicate_coord_min', '4', 'Flag a coordinate shared by this many rows.'),
  ('tag_review_below', '0.70', 'category, setting, cost, or age21 under this is review.'),
  ('inherit_trailhead_fees', 'false', 'Off until a cleared park-boundary layer exists.'),
  ('cost_bands_live', '"legacy"', 'COST_BANDS_LIVE. legacy writes the old activities band. new writes the $20 band. Default legacy.')
on conflict (key) do nothing;

comment on column place_staging.cost is
  'The $20-step band from the rules. Staging does not store the old filters.js band.';
comment on column place_staging.cost_band_new is
  'Same $20-step band as cost. Promote reads this. 018 did not add an activities side column, so the new band stays here.';

create table if not exists place_boundaries (
  name text primary key,
  kind text not null,
  geom geography(MultiPolygon, 4326) not null
);

insert into place_boundaries (name, kind, geom)
select 'Utah', 'state',
  ST_GeogFromText('SRID=4326;MULTIPOLYGON(((-114.0528 36.997, -109.041 36.997, -109.041 40.998, -111.046 40.998, -111.046 41.999, -114.0528 41.999, -114.0528 36.997)))')
where not exists (select 1 from place_boundaries where name = 'Utah');

create table if not exists place_city_centroids (
  name text primary key,
  geom geography(Point, 4326) not null
);

create or replace function place_name_key(raw text) returns text
language plpgsql immutable as $$
declare
  s text;
begin
  s := lower(translate(coalesce(raw, ''),
    'ÁÀÂÄÃÅáàâäãåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÖÕóòôöõÚÙÛÜúùûüÑñÇç',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc'));
  s := trim(regexp_replace(regexp_replace(s, '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g'));
  if s ~ '^(park|ball park|sports park|public park|city park|open space|green space)$' then
    return s;
  end if;
  s := trim(regexp_replace(regexp_replace(s, '\m(park|parks|trailhead|trailheads|the|a|an)\M', ' ', 'g'), '\s+', ' ', 'g'));
  if s = '' then
    return trim(regexp_replace(lower(coalesce(raw, '')), '[^a-z0-9]+', ' ', 'g'));
  end if;
  return s;
end $$;

create index if not exists activities_name_key_trgm
  on activities using gin (place_name_key(title) gin_trgm_ops);

create or replace function place_refuse_odbl_cross() returns trigger
language plpgsql as $$
declare
  other boolean;
  allowed boolean;
begin
  if new.odbl and new.feature_type is not null then
    select osm_allowed into allowed
    from place_feature_ownership
    where feature_type = new.feature_type;
    if found and allowed = false then
      raise exception 'refusing ODbL row for feature type %', new.feature_type
        using errcode = 'P0001';
    end if;
  end if;
  if new.match_staging_id is not null then
    select odbl into other from place_staging where id = new.match_staging_id;
    if other is distinct from new.odbl then
      raise exception 'ODbL isolation: staging % cannot match staging %', new.id, new.match_staging_id
        using errcode = 'P0001';
    end if;
  end if;
  if new.match_activity_id is not null then
    select coalesce(odbl, false) into other from activities where id = new.match_activity_id;
    if other is distinct from new.odbl then
      raise exception 'ODbL isolation: staging row cannot match activity %', new.match_activity_id
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists place_staging_odbl on place_staging;
create trigger place_staging_odbl
  before insert or update on place_staging
  for each row execute function place_refuse_odbl_cross();

create or replace function place_assert_dataset_loadable(p_key text) returns void
language plpgsql as $$
declare
  d place_datasets;
begin
  select * into d from place_datasets where dataset_key = p_key;
  if not found then
    raise exception 'unknown dataset %', p_key using errcode = 'P0001';
  end if;
  if d.excluded then
    raise exception 'dataset % is excluded', p_key using errcode = 'P0001';
  end if;
  if not d.load_enabled then
    raise exception 'dataset % is not enabled', p_key using errcode = 'P0001';
  end if;
  if d.license_checked_on is null or d.license_info_seen is null or btrim(d.license_info_seen) = '' then
    raise exception 'dataset % has no license check', p_key using errcode = 'P0001';
  end if;
  if d.odbl and not d.odbl_approved then
    raise exception 'dataset % is ODbL and is not approved', p_key using errcode = 'P0001';
  end if;
end $$;

create or replace function place_staging_dedupe(p_batch uuid) returns void
language plpgsql as $$
declare
  merge_at numeric := 0.85;
  review_at numeric := 0.60;
begin
  select coalesce((value #>> '{}')::numeric, merge_at) into merge_at
    from place_loader_config where key = 'dedupe_merge_at';
  select coalesce((value #>> '{}')::numeric, review_at) into review_at
    from place_loader_config where key = 'dedupe_review_at';
  perform set_config('pg_trgm.similarity_threshold', review_at::text, true);

  update place_staging
  set dedupe_result = 'new', match_activity_id = null, match_staging_id = null,
      match_score = null, match_reason = null
  where approval_batch_id = p_batch and status <> 'excluded';

  with candidates as (
    select s.id as sid,
           a.id as activity_id,
           null::bigint as staging_id,
           similarity(s.name_key, place_name_key(a.title)) as score
    from place_staging s
    join activities a
      on a.location is not null
     and s.geom is not null
     and coalesce(a.odbl, false) = s.odbl
     and ST_DWithin(s.geom, a.location, s.dedupe_radius_m)
     and s.name_key % place_name_key(a.title)
    where s.approval_batch_id = p_batch
      and s.status <> 'excluded'
      and char_length(s.name_key) >= 4
    union all
    select s.id,
           null::integer,
           o.id,
           similarity(s.name_key, o.name_key) as score
    from place_staging s
    join place_staging o
      on o.id <> s.id
     and o.geom is not null
     and s.geom is not null
     and o.odbl = s.odbl
     and o.status <> 'excluded'
     and ST_DWithin(
       s.geom,
       o.geom,
       case when s.generic_name then s.dedupe_radius_m
            else greatest(s.dedupe_radius_m, o.dedupe_radius_m) end
     )
     and s.name_key % o.name_key
     and not (
       s.same_name_keep_both and o.same_name_keep_both
       and s.dataset_key = o.dataset_key
       and s.name_key = o.name_key
     )
    join place_datasets sd on sd.dataset_key = s.dataset_key
    join place_datasets od on od.dataset_key = o.dataset_key
    where s.approval_batch_id = p_batch
      and s.status <> 'excluded'
      and char_length(s.name_key) >= 4
      and (
        od.priority < sd.priority
        or (od.priority = sd.priority and o.id < s.id)
      )
  ),
  best as (
    select distinct on (sid) sid, activity_id, staging_id, score
    from candidates
    where score >= review_at
    order by sid, score desc, activity_id nulls last
  )
  update place_staging s
  set dedupe_result = case when b.score >= merge_at then 'merge' else 'review' end,
      match_activity_id = b.activity_id,
      match_staging_id = b.staging_id,
      match_score = round(b.score, 3),
      match_reason = case when b.activity_id is not null then 'activity' else 'staging' end
  from best b
  where s.id = b.sid;
end $$;

create or replace function place_staging_pin_check(p_batch uuid) returns void
language plpgsql as $$
declare
  near_m numeric := 25000;
  centroid_m numeric := 200;
  dup_min integer := 4;
begin
  select coalesce((value #>> '{}')::numeric, near_m) into near_m
    from place_loader_config where key = 'city_near_m';
  select coalesce((value #>> '{}')::numeric, centroid_m) into centroid_m
    from place_loader_config where key = 'centroid_exclusion_m';
  select coalesce((value #>> '{}')::integer, dup_min) into dup_min
    from place_loader_config where key = 'duplicate_coord_min';

  with shared as (
    select id, count(*) over (
      partition by ST_SnapToGrid(geom::geometry, 0.00001)
    ) as n
    from place_staging
    where geom is not null and approval_batch_id = p_batch
  ),
  checked as (
    select s.id,
      (s.geom is null) as coords_missing,
      (s.geom is not null and not exists (
         select 1 from place_boundaries b
         where b.name = 'Utah' and ST_Covers(b.geom, s.geom)
       )) as outside_utah,
      case
        when s.needs_city or s.city is null or s.geom is null then false
        when c.geom is null then false
        else ST_Distance(s.geom, c.geom) > near_m
      end as far_from_city,
      case
        when d.centroid_exempt or s.needs_city or s.city is null or s.geom is null then false
        else exists (
          select 1 from place_city_centroids any_city
          where ST_DWithin(s.geom, any_city.geom, centroid_m)
        )
      end as city_centroid,
      coalesce(sh.n, 1) >= dup_min as shared_coord
    from place_staging s
    join place_datasets d on d.dataset_key = s.dataset_key
    left join place_city_centroids c on lower(c.name) = lower(s.city)
    left join shared sh on sh.id = s.id
    where s.approval_batch_id = p_batch
  )
  update place_staging s
  set needs_hand_pin = c.coords_missing or c.outside_utah or c.far_from_city or c.city_centroid or c.shared_coord,
      out_of_utah = s.out_of_utah or c.outside_utah,
      tag_review = s.tag_review or c.outside_utah,
      pin_check = jsonb_build_object(
        'coords_missing', c.coords_missing,
        'outside_utah', c.outside_utah,
        'far_from_city', c.far_from_city,
        'city_centroid', c.city_centroid,
        'shared_coord', c.shared_coord,
        'city_check', case when s.needs_city or s.city is null then 'skipped' else 'ran' end
      )
  from checked c
  where s.id = c.id;
end $$;

-- 018 (Website & Admin) widens activities.cost and adds cost_unit.
-- Promote refuses until that migration is present.
create or replace function place_assert_activity_cost_ready() returns void
language plpgsql as $$
declare
  has_unit boolean;
  def text;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activities' and column_name = 'cost_unit'
  ) into has_unit;
  select string_agg(pg_get_constraintdef(oid), ' ') into def
  from pg_constraint
  where conrelid = 'public.activities'::regclass and contype = 'c';
  if not has_unit
     or def is null
     or def not like '%$1-$20%'
     or def not like '%$21-$40%'
     or def not like '%$41-$60%'
     or def not like '%$61-$80%'
     or def not like '%$81-$100%'
     or def not like '%Over $100%' then
    raise exception 'migration 018 is required before place rows are written to activities'
      using errcode = 'P0001';
  end if;
end $$;

-- Old live bands, from the ranges in db/import-provo-finds.js.
-- $1-$20 and $21-$40 cross two live bands, so they return null.
create or replace function place_legacy_cost(band text) returns text
language sql immutable as $$
  select case band
    when 'Free' then 'Free'
    when '$41-$60' then '$100 and under'
    when '$61-$80' then '$100 and under'
    when '$81-$100' then '$100 and under'
    when 'Over $100' then 'Over $100'
    else null
  end
$$;

create or replace function place_staging_promote(p_dataset text, p_batch uuid)
returns jsonb
language plpgsql as $$
declare
  ds_status text;
  batch_status text;
  batch_dataset text;
  mismatch_id bigint;
  mismatch_dataset text;
  live_mode text;
  inserted integer := 0;
  refused jsonb := '[]'::jsonb;
begin
  perform place_assert_activity_cost_ready();
  if p_dataset is null and p_batch is null then
    raise exception 'promote needs a dataset or a batch' using errcode = 'P0001';
  end if;
  if p_dataset is not null then
    select approval_status into ds_status from place_datasets where dataset_key = p_dataset;
    if ds_status is distinct from 'approved' then
      raise exception 'refusing to promote unapproved dataset %', p_dataset using errcode = 'P0001';
    end if;
  end if;
  if p_batch is not null then
    select approval_status, dataset_key into batch_status, batch_dataset
      from place_approval_batches where id = p_batch;
    if batch_status is distinct from 'approved' then
      raise exception 'refusing to promote unapproved batch' using errcode = 'P0001';
    end if;
    select approval_status into ds_status from place_datasets where dataset_key = batch_dataset;
    if ds_status is distinct from 'approved' then
      raise exception 'refusing to promote unapproved dataset %', batch_dataset using errcode = 'P0001';
    end if;
    if p_dataset is not null and p_dataset is distinct from batch_dataset then
      raise exception 'refusing to promote batch %: dataset % does not match batch dataset %',
        p_batch, p_dataset, batch_dataset using errcode = 'P0001';
    end if;
    select s.id, s.dataset_key into mismatch_id, mismatch_dataset
      from place_staging s
      where s.approval_batch_id = p_batch
        and s.dataset_key is distinct from batch_dataset
      limit 1;
    if mismatch_id is not null then
      raise exception 'refusing to promote batch %: staging row % belongs to dataset % not %',
        p_batch, mismatch_id, mismatch_dataset, batch_dataset using errcode = 'P0001';
    end if;
  end if;

  select coalesce(value #>> '{}', 'legacy') into live_mode
    from place_loader_config where key = 'cost_bands_live';
  if live_mode is null or btrim(live_mode) = '' then
    live_mode := 'legacy';
  end if;
  if live_mode not in ('legacy', 'new') then
    raise exception 'COST_BANDS_LIVE must be legacy or new' using errcode = 'P0001';
  end if;

  drop table if exists place_promote_candidates;
  create temp table place_promote_candidates on commit drop as
  select s.*,
    coalesce(s.cost_band_new, s.cost) as new_band,
    case
      when live_mode = 'new' and coalesce(s.cost_band_new, s.cost) in (
        'Free', '$1-$20', '$21-$40', '$41-$60', '$61-$80', '$81-$100', 'Over $100'
      ) then coalesce(s.cost_band_new, s.cost)
      when live_mode = 'legacy' then place_legacy_cost(coalesce(s.cost_band_new, s.cost))
      else null
    end as live_cost
  from place_staging s
  where s.status = 'pending'
    and s.dedupe_result = 'new'
    and s.tag_review = false
    and s.needs_hand_pin = false
    and s.out_of_utah = false
    and coalesce(s.cost_band_new, s.cost) is not null
    and s.category is not null
    and s.setting is not null
    and s.duration is not null
    and (p_dataset is null or s.dataset_key = p_dataset)
    and (p_batch is null or (s.approval_batch_id = p_batch and s.dataset_key = batch_dataset))
    and not exists (
      select 1 from activities a
      where a.dataset_key = s.dataset_key and a.source_record_id = s.source_record_id
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'dataset_key', c.dataset_key,
    'source_record_id', c.source_record_id,
    'title', c.title,
    'cost_band_new', c.new_band
  ) order by c.id), '[]'::jsonb)
  into refused
  from place_promote_candidates c
  where c.live_cost is null;

  with inserted_rows as (
    insert into activities (
      title, description, category, icon, setting, season, food, cost, duration,
      time, vibe, stage, date_type, materials, age21, status, source, tier,
      address, city, source_url, expires_at, occurrences, location,
      coords_locked, geo_status, geo_confidence, geo_source,
      dataset_key, source_record_id, odbl, cost_unit
    )
    select
      c.title, c.description, c.category, c.icon, c.setting, c.season, c.food, c.live_cost, c.duration,
      c.time_of_day, c.vibe, c.stage, c.date_type, c.materials, c.age21, 'pending', 'dataset', 'free',
      c.address, c.city, c.source_url, null, null, c.geom,
      false, 'dataset', 'high', c.dataset_key,
      c.dataset_key, c.source_record_id, c.odbl,
      case when c.cost_unit = 'per car' then 'per car' else null end
    from place_promote_candidates c
    where c.live_cost is not null
    returning id, dataset_key, source_record_id
  ),
  credited as (
    insert into place_source_credits (
      activity_id, dataset_key, source_record_id, source_credit, link, link_flag, role, odbl
    )
    select i.id, i.dataset_key, i.source_record_id, s.source_credit, s.link, s.link_flag, 'primary', s.odbl
    from inserted_rows i
    join place_staging s
      on s.dataset_key = i.dataset_key and s.source_record_id = i.source_record_id
    returning activity_id
  )
  select count(*)::integer into inserted from inserted_rows;

  update place_staging s
  set status = 'promoted'
  where s.id in (
    select c.id from place_promote_candidates c where c.live_cost is not null
  )
  and exists (
    select 1 from activities a
    where a.dataset_key = s.dataset_key and a.source_record_id = s.source_record_id
  );

  return jsonb_build_object(
    'inserted', inserted,
    'cost_bands_live', live_mode,
    'refused', refused
  );
end $$;

drop trigger if exists place_datasets_updated_at on place_datasets;
create trigger place_datasets_updated_at before update on place_datasets
  for each row execute function set_updated_at();
drop trigger if exists place_staging_updated_at on place_staging;
create trigger place_staging_updated_at before update on place_staging
  for each row execute function set_updated_at();

alter table place_datasets enable row level security;
alter table place_feature_ownership enable row level security;
alter table place_filter_rules enable row level security;
alter table place_approval_batches enable row level security;
alter table place_staging enable row level security;
alter table place_source_credits enable row level security;
alter table place_loader_config enable row level security;
alter table place_boundaries enable row level security;
alter table place_city_centroids enable row level security;

do $body$
declare
  t text;
begin
  foreach t in array array[
    'place_datasets', 'place_feature_ownership', 'place_filter_rules',
    'place_approval_batches', 'place_staging', 'place_source_credits',
    'place_loader_config', 'place_boundaries', 'place_city_centroids'
  ]
  loop
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
