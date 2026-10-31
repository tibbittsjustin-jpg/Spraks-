-- Ongoing weekly patterns have a start and weekdays and no end date.
-- 008 required end. A missing end means the weekdays continue, and
-- expires_at (or a dates list) decides when the public list drops the row.

alter table activities drop constraint if exists activities_occurrences_shape;

alter table activities add constraint activities_occurrences_shape
  check (
    occurrences is null
    or (
      jsonb_typeof(occurrences) = 'object'
      and (
        (
          occurrences->>'kind' = 'dates'
          and jsonb_typeof(occurrences->'dates') = 'array'
        )
        or (
          occurrences->>'kind' = 'weekly'
          and occurrences->>'start' ~ '^\d{4}-\d{2}-\d{2}$'
          and (
            occurrences->>'end' is null
            or occurrences->>'end' ~ '^\d{4}-\d{2}-\d{2}$'
          )
          and jsonb_typeof(occurrences->'weekdays') = 'array'
        )
      )
    )
  );

comment on column activities.occurrences is
  'NULL = anytime. kind dates: list of {date, optional start, optional end}. kind weekly: start, optional end, weekdays Sun-Sat. A missing end is ongoing.';
