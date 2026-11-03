# Place staging loader

Loads already-licensed place files into `place_staging`. It does not publish them. Dry-run is the default, and it only talks to a localhost database.

```
node db/place-loader.js --dir /path/to/json
PLACE_DATABASE_URL=postgres://place_loader@127.0.0.1/place_staging_test node db/place-loader.js --dir /path/to/json
```

`--apply` commits the staging rows on that local database. `--promote --dataset <key>` is refused unless that dataset's `approval_status` is `approved` (or the batch is approved). Promoted rows land in `activities` as `pending`. Review rows, excluded rows, rows that need a hand pin, and rows outside Utah stay in staging.

`015` and `016` are not used.

## Rule table

`place_filter_rules` columns: `id`, `rule_code`, `dataset` (null means any dataset), `match_field`, `match_value`, `match_type` (`exact`, `keyword`, `regex`), `filter_values`, `confidence_score`, `confidence_level` (`high` or `low`), `always_review`, `priority`, `notes`.

Priority is parsed from the notes. The highest priority match wins for each filter, then the higher score. Regexes run in Node, so `\b` and `(?i)` keep their JavaScript meaning.

`match_field` is not a closed list. `primary_use` reads a trailhead use code, and only `MTB`, `HIKE`, and `MULTI` are kept. `categories` matches when any element matches. `entrance_fee` and `vehicle_fee` are fee text with `$` and commas removed. A blank fee is unknown, not free. Park and NPS vehicle fees use `cost_unit` `per car`. Every other priced row uses `per person`.

Parks Local rows whose `STATUS` is `Future` are excluded. The attached file has no status column, so this dry run drops none. A county in the city slot, or a location that is only a county, is not a city: all 143 of those parks are `needs_city` (53 county-only, 90 county-in-the-city-field).

## Dates

`activities.expires_at` is a date, the last valid day in America/Denver. The loader writes `YYYY-MM-DD`. A bare date is stored as given. A timestamp is converted to the Denver calendar date of that instant, so UTC midnight does not move the day earlier. These place rows are anytime, so `expires_at` is null. The existing event import is unchanged.

## Cost

Justin's bands are `Free`, `$1-$20`, `$21-$40`, `$41-$60`, `$61-$80`, `$81-$100`, `Over $100`. A per-car or per-person fee is banded with `bandFee()` in `db/place-rules.js`.

`COST_BAND_MAP` is the wiring list. `filters.js` does not have the $20-step bands yet (a separate PR adds them). Until then only `Free` and `Over $100` can be stored. Any other band stays null and the row stays in review. Do not edit `filters.js` here. There is no unknown-cost value.

`cost_unit` (`per car` or `per person`) is display-only. It is copied onto `activities` at promote time. Free places have a null unit. Trailhead fees inherited from a park boundary stay off: that layer is not cleared.

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
