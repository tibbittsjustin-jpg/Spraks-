# Place staging loader

Loads already-licensed place files into `place_staging`. It does not publish them. Dry-run is the default, and it only talks to a localhost database.

```
node db/place-loader.js --dir /path/to/json
PLACE_DATABASE_URL=postgres://place_loader@127.0.0.1/place_staging_test node db/place-loader.js --dir /path/to/json
```

`--apply` commits the staging rows on that local database. The loader does not promote and does not approve a dataset. Promotion is a SQL call, `place_staging_promote(dataset, batch)`. It refuses an unapproved dataset. A batch call also refuses when that batch's dataset is unapproved, and when any staging row in the batch belongs to a different dataset. Promoted rows land in `activities` as `pending`. Review rows, excluded rows, rows that need a hand pin, and rows outside Utah stay in staging.

`016_nearby_keyset.sql` is main's nearby index migration and is left as main wrote it. `015_source_credit.sql` and `018_cost_bands_20.sql` are already on main. `db/migrate.js` applies `017_place_staging.sql` after `018`, even though the filename sorts earlier. `017` does not add `activities.cost_unit` and does not change the activities cost check.

## Rule table

`place_filter_rules` columns: `id`, `rule_code`, `dataset` (null means any dataset), `match_field`, `match_value`, `match_type` (`exact`, `keyword`, `regex`), `filter_values`, `confidence_score`, `confidence_level` (`high` or `low`), `always_review`, `priority`, `notes`.

Priority is parsed from the notes. The highest priority match wins for each filter, then the higher score. Regexes run in Node, so `\b` and `(?i)` keep their JavaScript meaning.

`match_field` is not a closed list. Trailhead `primary_use` is `Hiking`, `Mountain biking`, or `Multi-use`, the strings the puller writes. `categories` matches when any label matches. An incoming museum `category` string is renamed to `source_primary_category` and is not a match field. `entrance_fee` (state parks, the Day-Use Standard Entrance Fee) and `vehicle_fee` (NPS) are fee text with `$` and commas removed. A blank or missing fee is unknown, not free, and the row stays in review. The loader does not guess a band. NPS is `Free` only when `fee_display` is exactly `No entrance fee listed`. Park and NPS vehicle fees use `cost_unit` `per car`. Every other priced row uses `per person`.

Parks Local rows whose `STATUS` is `Future`, `Proposed`, `Planned`, or `Closed` are excluded, and those four counts are logged. The attached file has no status column, so this dry run drops none for status. A county in the city slot, or a location that is only a county, is not a city: `needs_city` matches on `location`. All 143 of those parks are `needs_city` (53 county-only, 90 county-in-the-city-field).

Coordinates from OpenStreetMap, Nominatim, Google, Apple, Bing, or ReserveAmerica are refused. Labels are matched as whole tokens after splitting on separators (`_`, `-`, `.`) and camelCase humps, so `osm_nominatim`, `google_places`, `MapKit`, and `ReserveAmerica` are refused and place names such as Bingham Canyon still pass. There is no allowance and no tally. OSM may only set `suspiciousPin`. UGRC Address Points is the geocoder, and this loader does not call it.

A geocoded match that is more than 100 m off (uncertainty or spread), street-only, ZIP-only, or missing an estimable uncertainty is area level at normalize time: `lat`/`lng` are null, `flags.geoStatus` is `area_based`, and `flags.geoSource` keeps the real source when the row has a city. A refused coordinate source with a city is the same shape, and `flags.geoSource` is the dataset key rather than the refused label. A row with no city stays `needs_hand_pin`. Dataset geometry with no geocode-match metadata is unchanged. `place_staging_promote()` still copies `geom` and writes `geo_status` `dataset`. Teaching it to publish `area_based` would need a new migration, so this loader does not change that function. `place_staging_pin_check()` still marks a null geom as `needs_hand_pin`, which keeps the approximate row out of `activities` until that migration exists.

## Dates

`activities.expires_at` is a date, the last valid day in America/Denver. The loader writes `YYYY-MM-DD`. A bare date is stored as given. A timestamp is converted to the Denver calendar date of that instant, so UTC midnight does not move the day earlier. These place rows are anytime, so `expires_at` is null. The existing event import is unchanged.

## Cost

Justin's bands are `Free`, `$1-$20`, `$21-$40`, `$41-$60`, `$61-$80`, `$81-$100`, `Over $100`. A per-car or per-person fee is banded with `bandFee()` in `db/place-rules.js`. Staging stores that new band on `place_staging.cost` and `place_staging.cost_band_new`.

`shared/filters.js` and the price hint in `server.js` still list the old bands (`Free`, `$1-$10`, `$20-$30`, `$100 and under`, `Over $100`). Do not edit them here. `COST_BANDS_LIVE` chooses what promote writes to `activities.cost`:

- `legacy` (default): the old-band equivalent. A new band with no clean mapping is not promoted. The report lists those rows, and they stay `pending`. The new band stays on `cost_band_new`.
- `new`: write the $20 band. Migration 018 already accepts those strings. There is still no new activities column; 018 did not add one.

Clean legacy mapping, using the dollar ranges in `db/import-provo-finds.js` (`$1-$10` is 1–10, `$20-$30` is 20–30, `$100 and under` is 31–100):

| New band | `activities.cost` when `COST_BANDS_LIVE=legacy` |
| --- | --- |
| Free | Free |
| $1-$20 | refused (crosses `$1-$10`, the $11–$19 gap, and $20) |
| $21-$40 | refused (crosses `$20-$30` and `$100 and under`) |
| $41-$60 | $100 and under |
| $61-$80 | $100 and under |
| $81-$100 | $100 and under |
| Over $100 | Over $100 |

Set the flag with `COST_BANDS_LIVE=legacy` or `COST_BANDS_LIVE=new`. The loader copies it into `place_loader_config.cost_bands_live` before promote. Anything else is refused. An unknown price is still review, and the loader does not invent a band.

`cost_unit` (`per car` or `per person`) is display-only and stays on the staging row. Promote copies `per car` onto `activities`. Migration 018 allows only null or `per car` there, so a per-person price is stored as a null unit on `activities` until that check is widened. Free places have a null unit. Trailhead fees inherited from a park boundary stay off: that layer is not cleared.

## Credits

Each dataset row holds `credit_line`, `credit_url`, `sources_page_text`, `disclaimer`, `license_code`, and `user_caution`. The loader copies `credit_line` onto every staging row and ignores `source_credit` inside the file. The loaded layers keep the Section 9 lines (trailheads are not described as geocoded; parks record that proposed, planned, and closed parks were removed). USFS, BLM, GNIS, Wikidata, and the other UGRC layers are stored for later and are not ingested.

GNIS `user_caution` is `Check access and conditions before you go.`

## Other gates

- `Future` park status is a hold (review, not live). Blank status is counted and is not a hold. A missing status field is counted separately. `Proposed`, `Planned`, and `Closed` are still excluded.
- A county name in the city slot is flagged `county_as_city` and is not stored as the city.
- Trailheads whose location is only `UT` get `needs_city`. The pin check uses Utah bounds only. Nothing is geocoded, and city polygons are not used.
- NPS pages with no coordinates get `needs_hand_pin`. Only `https://www.nps.gov/` page links are kept.
- ODbL rows never match a non-ODbL row, in either direction. Parks, trailheads, museums, and campgrounds reject ODbL rows. ODbL datasets stay disabled until `odbl_approved` is set.
- Schools PreK-12 are `excluded`.
- A dataset needs `license_checked_on` and `license_info_seen` before it can load. Cadence is `daily` or `monthly`.
