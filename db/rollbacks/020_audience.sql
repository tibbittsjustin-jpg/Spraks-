-- Roll back 020_audience.sql. Not applied by db/migrate.js.
--
-- Run this only after a snapshot. Dropping the column deletes every
-- audience tag, including tags written by the later review pass.
--
-- Preferred order: deploy the previous app first, then run this file.
-- The audience app also tolerates a missing column (it stops filtering
-- in SQL and treats every row as untagged), so the column can be dropped
-- while that app is still up. Paging is incomplete in that window.
-- stage and date_type are left in place.

drop index if exists public.activities_audience_gin;

alter table public.activities drop constraint if exists activities_audience_check;

alter table public.activities drop column if exists audience;
