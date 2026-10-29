# Utah geocoding inputs

These files feed the two rerunnable scripts. Published pins are `data/coords/utah.json`, an object keyed by idea id. The app does not read that file.

From the repo root:

```
node scripts/geocode-utah.js
node scripts/pin_utah.js
```

Both call Nominatim at most once per second with User-Agent `SparkUtahBot/0.1 (+https://github.com/tibbittsjustin-jpg/Spraks-)`. A query already in `geocode_cache.json` makes no network call. An entry with `locked: true` in `data/coords/utah.json` is copied through and never overwritten. Set `locked` to false before rerunning if you mean to move one.

`place_queries.json` is the per-idea place and city, including source links on the hand-verified addresses. `overrides.json` holds manual addresses, query variants, and closures. `hand_pins_src.json` is the source list for `scripts/pin_utah.js` (a URL, a query, a flag, or a copy of another pin). `hand_pins.json` is the pin list that script writes.

`data/coords/utah.json` keeps `confident`, `area_based`, `route_unpinned`, `flagged`, and `pending`. It leaves out `out_of_state` and retired ideas. `flagged` and `pending` entries have null coordinates so the backlog stays visible. The geocoder also writes `utah_coords.json`, `utah_geocoded.json`, and `utah_geocoded.csv` here. Those dumps include unresolved ideas and are gitignored.
