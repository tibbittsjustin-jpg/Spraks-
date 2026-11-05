# Audience column: migrate, deploy, then tag

This change adds `activities.audience` and the Discover chips Family Friendly, Friends, Date, Group Date, and Solo. It does not retag live rows. Do not run the proposal SQL in `filters` plans as a migration, and do not run `npm run db:seed` against a live database.

## Contract

| Stored `audience` | What a filter does |
|---|---|
| Column missing, SQL `NULL`, or `'{}'` | No chips. A selected audience chip does not match. An empty audience filter still returns the row. |
| One or more of the five chips | OR overlap, the same way vibe and season match. |
| `Family Friendly` on a row with `age21 = true` | That chip is ignored, even if Hide 21+ is off. Other chips on that row still count. |
| `Good with kids` | Read as Family Friendly. The check constraint rejects that label on write. Store `Family Friendly`. |

`stage` and `date_type` stay in the database. The new Discover sheet does not send them. Older clients may still pass them, and the API still honors those parameters. Saved phone filters that still have Date Stage or Double or Group Date are dropped on the next open. They are not copied onto audience. `Solo/Couple` is not Solo.

Family Friendly help, under that chip only:

> For adults 18+. Means the activity works when you bring kids, not that Jaderoo is for children.

New submissions may include `audience`. Family Friendly is rejected when `age21` is true or the title and description match the alcohol or kids-only exclusions (21+, bar, brewery, cocktail, kids only, youth recital, and the same list as the plan). Keyword hits such as zoo or playground are not tags. A person reviews those before any write.

## Order

1. **Snapshot** the live database. Keep a restore point before any audience writes.
2. **Apply** `db/migrations/020_audience.sql` with this repo's runner, pointed at the database you mean to change:

   `DATABASE_URL=... npm run db:migrate`

   The runner records `schema_migrations`. If Supabase already lists `020_audience` or `020_audience.sql` in `supabase_migrations.schema_migrations`, the file is skipped. This repo does not use `supabase db push` for these files. Apply it on a disposable database first. Do not point `DATABASE_URL` at production from a laptop session that also has seed scripts.
3. **Deploy the app** after the migration when you can. The app selects `audience`. If the column is not there yet, list and detail requests catch Postgres `42703`, retry without the column, and apply the audience filter in process. With no column, a selected chip matches nothing, because there are no stored tags to overlap. An empty audience filter still returns rows. A page can come back short until the column exists, because the limit is applied before that in-memory pass. Preferred order is migration, then app.
4. **Do not backfill in the deploy.** Empty arrays stay empty. They do not match a selected chip.
5. **Tag after the app is live**, from the snapshot, in a reviewed write. Filters owns that pass. Map a reviewed "Good with kids" value to `Family Friendly`. Do not auto-apply the proposal's keyword candidates. Never write Family Friendly on `age21` rows, alcohol-signaled rows, or kids-only rows. Unclear rows that you choose to tag get Friends and Date, not Family Friendly and not Group Date. This pull request does not write those tags.
6. **Rollback:** snapshot again if tags exist and you still need them. Deploy the previous app, or leave this app up (it tolerates a missing column). Then run `db/rollbacks/020_audience.sql` as the owner. That drops the index, the check, and the column. `stage` and `date_type` stay.

## Supabase

Checked against the Row Level Security and Column Level Security guides (fetched 2026-11-05). RLS is row filters, not a column list. `activities` already has RLS enabled and no policies, and `anon` / `authenticated` are revoked. Migration 020 enables RLS again and repeats that revoke. It grants nothing and creates no policy. A table-level revoke covers columns added later, so the new column is not exposed through the Data API. The Node server connects as the owner and bypasses RLS. Do not add a permissive select policy for this column.
