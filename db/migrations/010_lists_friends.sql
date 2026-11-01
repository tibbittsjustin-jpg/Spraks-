-- P1: friends, lists, members, items, favorites, and the v4 S1 social tables.
-- Schema only. No push tables (those are P10). 005 stays reserved for
-- Subscriptions and is not used here.
--
-- Idempotent. Depends on 006: citext lives in extensions, and every
-- function pins search_path. RLS is on and there are no policies. anon
-- and authenticated are revoked. The Express server (DATABASE_URL) is
-- the only reader and writer.
--
-- Does not create or alter profiles. Live usernames are not stored here.
-- P2 adds that table beside username_holds. Expected shape, which P2
-- owns and this file does not create:
--
--   public.usernames (
--     user_id    uuid primary key references auth.users(id) on delete cascade,
--     username   extensions.citext not null unique,
--     changed_at timestamptz
--   )
--
-- username_holds.username is extensions.citext primary key, so P2 can
-- compare with citext equality and may reference username_holds(username).
-- A hold is a released name, not the live row, so usernames should not
-- foreign-key into username_holds. user_id becomes null when the account
-- is deleted and the hold remains.
--
-- Visibility is private or friends, default private, for every kind
-- including favorites and done. Group lists are members-only: is_group
-- requires visibility private and kind plan.
--
-- Limits (triggers are authoritative; the count functions are the
-- pre-check routes should call):
--   list_occupying_member_count(list) >= 12  -> list_members_max_12
--   user_group_list_count(user) >= 50        -> user_group_lists_max_50
--   user_list_favorite_count(list, user) >= 3, or that rank is taken
-- Items per list are not capped.
-- Occupying members are status invited or active. The owner row counts.
-- Group-list memberships count whether the user owns the list or was
-- invited. Left and removed rows do not count. Deleted lists do not count.
-- Member caps lock the list row, then pg_advisory_xact_lock(10050, hashtext(user_id))
-- so two sessions cannot both pass the count. Favorite ranks are unique
-- per (list, user) for 1..3, which caps a member at 3 without a count.

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

-- Snapshot items on a shared plan: activity ref, title, category, icon,
-- expires_at. Any other key (address, coordinates, members, stars) fails.
create or replace function public.shared_plan_items_ok(items jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, extensions, pg_catalog
as $body$
declare
  elem jsonb;
  key text;
begin
  if items is null or jsonb_typeof(items) <> 'array' then
    return false;
  end if;
  for elem in select value from jsonb_array_elements(items)
  loop
    if jsonb_typeof(elem) <> 'object' then
      return false;
    end if;
    if jsonb_typeof(elem->'activity_ref') <> 'string'
       or (elem->>'activity_ref') !~ '^(b|a|p):[A-Za-z0-9_.:-]{1,80}$' then
      return false;
    end if;
    if jsonb_typeof(elem->'title') <> 'string'
       or char_length(elem->>'title') < 1
       or char_length(elem->>'title') > 200 then
      return false;
    end if;
    if elem ? 'category' and (
      jsonb_typeof(elem->'category') <> 'string'
      or char_length(elem->>'category') > 120
    ) then
      return false;
    end if;
    if elem ? 'icon' and (
      jsonb_typeof(elem->'icon') <> 'string'
      or char_length(elem->>'icon') > 32
    ) then
      return false;
    end if;
    if elem ? 'expires_at'
       and jsonb_typeof(elem->'expires_at') <> 'null'
       and (
         jsonb_typeof(elem->'expires_at') <> 'string'
         or (elem->>'expires_at') !~ '^\d{4}-\d{2}-\d{2}$'
       ) then
      return false;
    end if;
    for key in select jsonb_object_keys(elem)
    loop
      if key not in ('activity_ref', 'title', 'category', 'icon', 'expires_at') then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end
$body$;

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('plan', 'favorites', 'done')),
  name text not null check (char_length(name) between 1 and 60 and char_length(btrim(name)) >= 1),
  plan_date date,
  visibility text not null default 'private' check (visibility in ('private', 'friends')),
  is_group boolean not null default false,
  client_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint lists_group_is_private check (
    is_group = false or (visibility = 'private' and kind = 'plan')
  ),
  constraint lists_plan_date_kind check (
    plan_date is null or kind = 'plan'
  ),
  constraint lists_client_id_format check (
    client_id is null or client_id ~ '^[A-Za-z0-9_.:-]{1,80}$'
  )
);

create unique index if not exists lists_one_favorites_uidx
  on public.lists (owner_id)
  where kind = 'favorites' and deleted_at is null;

create unique index if not exists lists_one_done_uidx
  on public.lists (owner_id)
  where kind = 'done' and deleted_at is null;

create unique index if not exists lists_owner_client_uidx
  on public.lists (owner_id, client_id)
  where client_id is not null and deleted_at is null;

create index if not exists lists_owner_open_idx
  on public.lists (owner_id)
  where deleted_at is null;

create table if not exists public.list_members (
  list_id uuid not null references public.lists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  status text not null check (status in ('invited', 'active', 'left', 'removed')),
  color_idx smallint not null check (color_idx between 0 and 11),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz,
  joined_at timestamptz,
  left_at timestamptz,
  last_seen_at timestamptz,
  pinned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

-- Colors stay unique among people still on the list. Left and removed
-- rows keep their color_idx but do not block reuse.
create unique index if not exists list_members_color_active_uidx
  on public.list_members (list_id, color_idx)
  where status in ('invited', 'active');

create index if not exists list_members_user_status_idx
  on public.list_members (user_id, status);

create table if not exists public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  activity_ref text not null,
  title text not null check (char_length(title) between 1 and 200),
  category text not null default '' check (char_length(category) <= 120),
  icon text not null default '' check (char_length(icon) <= 32),
  expires_at date,
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  done_on date,
  removed_at timestamptz,
  constraint list_items_id_list_key unique (id, list_id),
  constraint list_items_activity_ref_format check (
    activity_ref ~ '^(b|a|p):[A-Za-z0-9_.:-]{1,80}$'
  )
);

create unique index if not exists list_items_active_ref_uidx
  on public.list_items (list_id, activity_ref)
  where removed_at is null;

create index if not exists list_items_list_open_idx
  on public.list_items (list_id)
  where removed_at is null;

create table if not exists public.list_item_favorites (
  item_id uuid not null,
  list_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  rank smallint not null check (rank between 1 and 3),
  created_at timestamptz not null default now(),
  primary key (item_id, user_id),
  constraint list_item_favorites_rank_uidx unique (list_id, user_id, rank),
  constraint list_item_favorites_item_list_fkey
    foreign key (item_id, list_id)
    references public.list_items (id, list_id)
    on delete cascade
);

create index if not exists list_item_favorites_list_user_idx
  on public.list_item_favorites (list_id, user_id);

create table if not exists public.username_holds (
  username extensions.citext primary key,
  user_id uuid references auth.users(id) on delete set null,
  held_until timestamptz not null,
  created_at timestamptz not null default now(),
  constraint username_holds_len check (char_length(username::text) between 1 and 64)
);

create index if not exists username_holds_user_idx
  on public.username_holds (user_id);

create index if not exists username_holds_until_idx
  on public.username_holds (held_until);

create table if not exists public.friendships (
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  constraint friendships_distinct check (requester_id <> addressee_id)
);

create unique index if not exists friendships_pair_uidx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create index if not exists friendships_addressee_idx
  on public.friendships (addressee_id, status);

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_distinct check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocked_idx
  on public.blocks (blocked_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  target_type text not null check (target_type in ('user', 'list', 'list_name', 'list_invite')),
  target_id uuid not null,
  list_id uuid references public.lists(id) on delete set null,
  reason text not null check (reason in (
    'spam', 'harassment', 'impersonation', 'inappropriate_username', 'under_18', 'other'
  )),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists reports_status_idx
  on public.reports (status, created_at);

create index if not exists reports_target_idx
  on public.reports (target_type, target_id);

-- In-app badge rows. Push delivery is not this table.
-- P3 and P4 extend activity_items_kind_check by dropping and re-adding it.
create table if not exists public.activity_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in (
    'friend_request',
    'list_invite',
    'list_joined',
    'list_items_added',
    'list_star'
  )),
  actor_id uuid references auth.users(id) on delete set null,
  list_id uuid references public.lists(id) on delete cascade,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

create index if not exists activity_items_user_idx
  on public.activity_items (user_id, created_at desc);

create table if not exists public.shared_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  list_id uuid references public.lists(id) on delete set null,
  slug text not null unique check (slug ~ '^[A-Za-z0-9_-]{8,128}$'),
  name text not null check (char_length(name) between 1 and 60),
  plan_date date,
  items jsonb not null default '[]'::jsonb check (public.shared_plan_items_ok(items)),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists shared_plans_owner_idx
  on public.shared_plans (owner_id);

create index if not exists shared_plans_list_idx
  on public.shared_plans (list_id);

comment on table public.lists is
  'Plans, Favorites, and Done. visibility private is the default for every kind. is_group lists are members-only.';
comment on column public.lists.client_id is
  'Local plan id from import, unique per owner among lists that are not deleted.';
comment on column public.lists.visibility is
  'private or friends. Group lists cannot be friends.';
comment on table public.list_members is
  'Owner is always an active member row. Invitees stay invited until they join.';
comment on column public.list_members.pinned_at is
  'Personal pin. Pinning a group list does not pin it for anyone else.';
comment on column public.list_members.color_idx is
  '0..11, unique among invited and active members of the list. Owner is 0.';
comment on table public.list_items is
  'Activity ref plus a title, category, icon, and expires_at snapshot. No address and no coordinates.';
comment on column public.list_items.added_by is
  'Null after the author deletes their account. The item stays.';
comment on column public.list_items.done_on is
  'Set only on a done list.';
comment on table public.list_item_favorites is
  'At most 3 per member per list, ranks 1..3, one row per rank.';
comment on table public.username_holds is
  'Released usernames. P2 writes this when a name changes. username is extensions.citext.';
comment on table public.shared_plans is
  'Snapshot served to a /p/ link. items cannot carry an address, coordinates, members, or stars.';

create or replace function public.list_occupying_member_count(p_list_id uuid)
returns integer
language sql
stable
set search_path = public, extensions, pg_catalog
as $body$
  select count(*)::integer
  from public.list_members
  where list_id = p_list_id
    and status in ('invited', 'active');
$body$;

create or replace function public.user_group_list_count(p_user_id uuid)
returns integer
language sql
stable
set search_path = public, extensions, pg_catalog
as $body$
  select count(*)::integer
  from public.list_members m
  join public.lists l on l.id = m.list_id
  where m.user_id = p_user_id
    and m.status in ('invited', 'active')
    and l.is_group = true
    and l.deleted_at is null;
$body$;

create or replace function public.user_list_favorite_count(p_list_id uuid, p_user_id uuid)
returns integer
language sql
stable
set search_path = public, extensions, pg_catalog
as $body$
  select count(*)::integer
  from public.list_item_favorites
  where list_id = p_list_id
    and user_id = p_user_id;
$body$;

comment on function public.list_occupying_member_count(uuid) is
  'Invited plus active members, owner included. A group list rejects another occupying member when this is already 12.';
comment on function public.user_group_list_count(uuid) is
  'Active plus invited memberships on group lists that are not deleted, owned or joined. Reject another when this is already 50.';
comment on function public.user_list_favorite_count(uuid, uuid) is
  'Favorites this member has on this list. 3 is the cap, also enforced by unique (list_id, user_id, rank) for ranks 1..3.';

create or replace function public.lists_before_update()
returns trigger
language plpgsql
set search_path = public, extensions, pg_catalog
as $body$
declare
  m record;
  v_members integer;
  v_groups integer;
  v_newly boolean;
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'list owner cannot be reassigned'
      using errcode = '23514', constraint = 'lists_owner_immutable';
  end if;
  if new.kind is distinct from old.kind then
    raise exception 'list kind cannot change'
      using errcode = '23514', constraint = 'lists_kind_immutable';
  end if;
  if old.is_group and not new.is_group and exists (
    select 1
    from public.list_members
    where list_id = new.id
      and user_id <> new.owner_id
      and status in ('invited', 'active')
  ) then
    raise exception 'a list with other members stays a group list'
      using errcode = '23514', constraint = 'lists_group_stays_group';
  end if;

  v_newly := new.is_group and new.deleted_at is null
    and (not old.is_group or old.deleted_at is not null);
  if not v_newly then
    return new;
  end if;

  -- This UPDATE already holds the list row, so the member count is stable.
  -- Lock occupying users in user_id order before the per-user cap so two
  -- conversions cannot deadlock.
  v_members := public.list_occupying_member_count(new.id);
  if v_members > 12 then
    raise exception 'group list member limit is 12'
      using errcode = '23514', constraint = 'list_members_max_12';
  end if;

  for m in
    select user_id
    from public.list_members
    where list_id = new.id
      and status in ('invited', 'active')
    order by user_id
  loop
    perform pg_advisory_xact_lock(10050, hashtext(m.user_id::text));
  end loop;

  for m in
    select user_id
    from public.list_members
    where list_id = new.id
      and status in ('invited', 'active')
    order by user_id
  loop
    v_groups := public.user_group_list_count(m.user_id);
    if v_groups + 1 > 50 then
      raise exception 'group list limit is 50 per user'
        using errcode = '23514', constraint = 'user_group_lists_max_50';
    end if;
  end loop;

  return new;
end
$body$;

create or replace function public.lists_after_insert()
returns trigger
language plpgsql
set search_path = public, extensions, pg_catalog
as $body$
begin
  insert into public.list_members (
    list_id, user_id, role, status, color_idx, invited_by, joined_at
  ) values (
    new.id, new.owner_id, 'owner', 'active', 0, null, now()
  );
  return new;
end
$body$;

create or replace function public.lists_before_delete()
returns trigger
language plpgsql
set search_path = public, extensions, pg_catalog
as $body$
begin
  -- Visible to the cascade that removes list_members, so the owner row
  -- can leave with the list. Local to this transaction.
  perform set_config('jaderoo.deleting_list_id', old.id::text, true);
  return old;
end
$body$;

create or replace function public.list_members_before_write()
returns trigger
language plpgsql
set search_path = public, extensions, pg_catalog
as $body$
declare
  v_is_group boolean;
  v_deleted timestamptz;
  v_owner uuid;
  v_members integer;
  v_groups integer;
  v_old_counts boolean := false;
  v_new_counts boolean;
begin
  if tg_op = 'UPDATE' and new.list_id is distinct from old.list_id then
    raise exception 'list membership cannot move between lists'
      using errcode = '23514', constraint = 'list_members_list_immutable';
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'list membership cannot move between users'
      using errcode = '23514', constraint = 'list_members_user_immutable';
  end if;

  select is_group, deleted_at, owner_id
    into v_is_group, v_deleted, v_owner
  from public.lists
  where id = new.list_id
  for update;

  -- Account deletion can null invited_by after the owned list is already
  -- gone and before this membership row is cascaded away. Let that through.
  if not found then
    return new;
  end if;

  if new.user_id = v_owner then
    if new.role <> 'owner' or new.status <> 'active' or new.invited_by is not null then
      raise exception 'list owner membership must stay role owner and status active'
        using errcode = '23514', constraint = 'list_members_owner_shape';
    end if;
  else
    if new.role <> 'member' then
      raise exception 'only the list owner has role owner'
        using errcode = '23514', constraint = 'list_members_owner_shape';
    end if;
    if not v_is_group then
      raise exception 'only a group list can have members besides the owner'
        using errcode = '23514', constraint = 'list_members_group_only';
    end if;
    if v_deleted is not null and new.status in ('invited', 'active') then
      raise exception 'cannot add a member to a deleted list'
        using errcode = '23514', constraint = 'list_members_not_deleted';
    end if;
    if tg_op = 'INSERT' and new.invited_by is distinct from v_owner then
      raise exception 'only the list owner can add people'
        using errcode = '23514', constraint = 'list_members_invited_by_owner';
    end if;
    if tg_op = 'UPDATE' and new.invited_by is not null and new.invited_by <> v_owner then
      raise exception 'only the list owner can add people'
        using errcode = '23514', constraint = 'list_members_invited_by_owner';
    end if;
  end if;

  v_new_counts := new.status in ('invited', 'active')
    and v_is_group
    and v_deleted is null;
  if tg_op = 'UPDATE'
     and old.status in ('invited', 'active')
     and v_is_group
     and v_deleted is null then
    v_old_counts := true;
  end if;

  if v_new_counts and not v_old_counts then
    -- List row is already locked above. The user lock serializes the
    -- per-user group-list cap across different lists.
    perform pg_advisory_xact_lock(10050, hashtext(new.user_id::text));

    v_members := public.list_occupying_member_count(new.list_id);
    if v_members + 1 > 12 then
      raise exception 'group list member limit is 12'
        using errcode = '23514', constraint = 'list_members_max_12';
    end if;

    v_groups := public.user_group_list_count(new.user_id);
    if v_groups + 1 > 50 then
      raise exception 'group list limit is 50 per user'
        using errcode = '23514', constraint = 'user_group_lists_max_50';
    end if;
  end if;

  return new;
end
$body$;

create or replace function public.list_members_before_delete()
returns trigger
language plpgsql
set search_path = public, extensions, pg_catalog
as $body$
declare
  v_owner uuid;
begin
  if current_setting('jaderoo.deleting_list_id', true) is not distinct from old.list_id::text then
    return old;
  end if;
  select owner_id into v_owner from public.lists where id = old.list_id;
  if v_owner is not null and old.user_id = v_owner then
    raise exception 'list owner membership cannot be removed'
      using errcode = '23514', constraint = 'list_members_owner_required';
  end if;
  return old;
end
$body$;

create or replace function public.list_members_after_status()
returns trigger
language plpgsql
set search_path = public, extensions, pg_catalog
as $body$
begin
  if new.status in ('left', 'removed') and old.status not in ('left', 'removed') then
    delete from public.list_item_favorites f
    using public.list_items i
    where f.item_id = i.id
      and i.list_id = new.list_id
      and f.user_id = new.user_id;
  end if;
  return new;
end
$body$;

create or replace function public.list_items_before_write()
returns trigger
language plpgsql
set search_path = public, extensions, pg_catalog
as $body$
declare
  v_kind text;
begin
  if new.done_on is not null then
    select kind into v_kind from public.lists where id = new.list_id;
    if v_kind is distinct from 'done' then
      raise exception 'done_on is only allowed on a done list'
        using errcode = '23514', constraint = 'list_items_done_on_kind';
    end if;
  end if;
  return new;
end
$body$;

create or replace function public.list_items_after_remove()
returns trigger
language plpgsql
set search_path = public, extensions, pg_catalog
as $body$
begin
  if new.removed_at is not null and old.removed_at is null then
    delete from public.list_item_favorites where item_id = new.id;
  end if;
  return new;
end
$body$;

create or replace function public.list_item_favorites_before_write()
returns trigger
language plpgsql
set search_path = public, extensions, pg_catalog
as $body$
declare
  v_removed timestamptz;
  v_list uuid;
begin
  select removed_at, list_id
    into v_removed, v_list
  from public.list_items
  where id = new.item_id
  for update;

  if not found then
    raise exception 'list item % does not exist', new.item_id
      using errcode = '23503';
  end if;
  if v_removed is not null then
    raise exception 'cannot favorite a removed list item'
      using errcode = '23514', constraint = 'list_item_favorites_removed';
  end if;
  if new.list_id is distinct from v_list then
    raise exception 'favorite list_id must match the item'
      using errcode = '23514', constraint = 'list_item_favorites_list';
  end if;
  if not exists (
    select 1
    from public.list_members
    where list_id = new.list_id
      and user_id = new.user_id
      and status = 'active'
  ) then
    raise exception 'only an active member can favorite an item'
      using errcode = '23514', constraint = 'list_item_favorites_member';
  end if;
  return new;
end
$body$;

drop trigger if exists lists_before_update on public.lists;
create trigger lists_before_update
  before update on public.lists
  for each row execute function public.lists_before_update();

drop trigger if exists lists_updated_at on public.lists;
create trigger lists_updated_at
  before update on public.lists
  for each row execute function public.set_updated_at();

drop trigger if exists lists_after_insert_owner on public.lists;
create trigger lists_after_insert_owner
  after insert on public.lists
  for each row execute function public.lists_after_insert();

drop trigger if exists lists_before_delete on public.lists;
create trigger lists_before_delete
  before delete on public.lists
  for each row execute function public.lists_before_delete();

drop trigger if exists list_members_before_write on public.list_members;
create trigger list_members_before_write
  before insert or update of role, status, user_id, invited_by, list_id, color_idx
  on public.list_members
  for each row execute function public.list_members_before_write();

drop trigger if exists list_members_updated_at on public.list_members;
create trigger list_members_updated_at
  before update on public.list_members
  for each row execute function public.set_updated_at();

drop trigger if exists list_members_before_delete on public.list_members;
create trigger list_members_before_delete
  before delete on public.list_members
  for each row execute function public.list_members_before_delete();

drop trigger if exists list_members_after_status on public.list_members;
create trigger list_members_after_status
  after update of status on public.list_members
  for each row execute function public.list_members_after_status();

drop trigger if exists list_items_before_write on public.list_items;
create trigger list_items_before_write
  before insert or update on public.list_items
  for each row execute function public.list_items_before_write();

drop trigger if exists list_items_after_remove on public.list_items;
create trigger list_items_after_remove
  after update of removed_at on public.list_items
  for each row execute function public.list_items_after_remove();

drop trigger if exists list_item_favorites_before_write on public.list_item_favorites;
create trigger list_item_favorites_before_write
  before insert or update on public.list_item_favorites
  for each row execute function public.list_item_favorites_before_write();

-- Deny-all, same posture as 001 and 006. No policies are created.
do $body$
declare
  t text;
  tables text[] := array[
    'lists',
    'list_members',
    'list_items',
    'list_item_favorites',
    'username_holds',
    'friendships',
    'blocks',
    'reports',
    'activity_items',
    'shared_plans'
  ];
  fn regprocedure;
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

  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'shared_plan_items_ok',
        'list_occupying_member_count',
        'user_group_list_count',
        'user_list_favorite_count',
        'lists_before_update',
        'lists_after_insert',
        'lists_before_delete',
        'list_members_before_write',
        'list_members_before_delete',
        'list_members_after_status',
        'list_items_before_write',
        'list_items_after_remove',
        'list_item_favorites_before_write'
      )
  loop
    execute format('revoke all on function %s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', fn);
    end if;
  end loop;
end
$body$;
