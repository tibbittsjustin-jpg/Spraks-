-- When an activity happens. NULL means anytime.
-- 005 stays reserved for Subscriptions and is not used.
--
-- dates:  {"kind":"dates","dates":[{"date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM"}]}
--         start and end are optional 24-hour times.
-- weekly: {"kind":"weekly","start":"YYYY-MM-DD","end":"YYYY-MM-DD","weekdays":["Tue","Thu"]}
--         weekdays are Sun Mon Tue Wed Thu Fri Sat. The range is inclusive.
-- Array contents are checked by the import. A CHECK cannot subquery jsonb arrays.

alter table activities add column if not exists occurrences jsonb;

comment on column activities.occurrences is
  'NULL = anytime. kind dates: list of {date, optional start, optional end}. kind weekly: inclusive start/end plus weekdays Sun-Sat.';

do $$ begin
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
            and occurrences->>'end' ~ '^\d{4}-\d{2}-\d{2}$'
            and jsonb_typeof(occurrences->'weekdays') = 'array'
          )
        )
      )
    );
exception when duplicate_object then null; end $$;
