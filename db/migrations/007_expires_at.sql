-- Last valid calendar day for a dated activity (America/Denver).
-- Null means ongoing. The research import fills this from the find files.
-- 005 is still absent; filename order runs this after 006.

alter table activities add column if not exists expires_at date;

comment on column activities.expires_at is
  'Last calendar day the activity is valid, or null when it is ongoing';

-- Natural key for the research import. A second run of the same pending
-- AI row (same title and source page) cannot insert another copy.
-- Curated rows use a different source, so they are not part of this key.
create unique index if not exists activities_ai_natural_key
  on activities (lower(btrim(title)), source_url)
  where source = 'ai';
