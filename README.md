# Spark

Spark is a swipe-based date idea finder. It is for people planning a date — just the two of you, a double date, or a group — who want a large catalog of ideas they can filter, save into named plans, and mark done after they try them. A lot of the built-in catalog is written around Provo, Utah County, and nearby Utah/Idaho day trips. Optional server features add real venues and ticketed events wherever the user is.

The app is a vanilla JavaScript frontend. A small Node/Express server is only required for Google Places, Claude, and Ticketmaster. Swiping, saving, plans, and sharing work without API keys, and they also work if you open `public/index.html` directly. Keys stay in a local `.env` file and are never sent to the browser.

## Features

- **Onboarding and profile.** Name, age (13–120), gender, birthday, and an optional photo. A five-slide tutorial runs once. Profile data, plans, and saves live in `localStorage` under `spark_state_v1`. There is no account and no server-side user store.
- **Discover.** A stacked deck of idea cards. Swipe up to save, swipe down to pass, tap for details. The deck shows three cards at a time and remembers what you have already seen. "Start Over" clears seen ids for the current filters. Starting a new date plan clears seen and passed ids so the catalog is available again.
- **Filters.** Date length, budget, time of day, indoor/outdoor, vibe, season, date stage, solo/double/group, and whether food is involved. Empty selections mean "any."
- **Built-in catalog.** `public/data.js` holds 1,998 ideas, with ids 2 through 2000 except 340. Id 340 (Trafalga mini golf) was removed after the venue was demolished in 2015. There is no retired-idea flag; an idea that is not in the array is not in the deck. Each idea has a title, description, one of 22 categories, an emoji icon, and tags for setting, season, food, cost, duration, time, vibe, stage, and date type, plus a `scene` and a `motif` used to draw the cover.
- **Cover art.** `public/motifs.js` is a library of hand-drawn SVG motifs. `public/app.js` paints a scene (sky, ground, time of day) and plants the idea's motif on the horizon. `public/motif-preview.html` is a dark-page gallery for judging that art; it is not part of the app.
- **Plans and Favorites.** "Plan a Date" starts or resumes a named plan with an optional date. Swipe-saves while a plan is active go into that plan. The Saved tab is a folder list: **Favorites** (the `somedayIds` array — ideas with no plan) plus one folder per plan. An idea can sit in a plan and in Favorites at the same time. Plans can be swipe-deleted. Past events stay in saved lists and are labeled as passed.
- **Done.** Mark an idea done from its detail screen. The Done tab and the profile "What You've Done" list show them with the date.
- **Local events.** With `TICKETMASTER_API_KEY`, the Events tab (top bar title "Near You") lists upcoming Ticketmaster events, grouped by day, within 5, 10, or 25 miles. Location is requested automatically on launch. If it is denied, the user can type a US zip code. The twelve soonest upcoming events are mixed into the swipe deck (one external card about every eight built-in ideas). Detail screens link to Ticketmaster for tickets and credit Ticketmaster as the source. Spark does not sell tickets. Events past their calendar day leave the deck and the list, but stay in saved plans.
- **Real nearby places.** With both `GOOGLE_PLACES_API_KEY` and `ANTHROPIC_API_KEY`, the server searches Google Places and asks Claude to turn a handful of venues into Spark-shaped cards. Those cards are mixed into the deck the same way events are. Detail screens show the place name, address, rating, and a Maps link. Search radius follows the Date Length filter (about 5 miles for a quick date, up to about 50 miles for overnight).
- **Friends and sharing (local demo only).** The Friends tab shows four hardcoded demo friends and their saved/done idea ids. Sharing an idea, sharing a plan, the invite QR code, and "Add From Contacts" update on-screen state or show a toast. Nothing is sent to another device. The invite URL is built in the browser (`https://spark-dates.app/invite/...`); there is no route behind it. "Copy Invite Link" shows a toast and does not write the clipboard.
- **Submit an idea and tips.** "Got an Idea?" stores a title, category, description, and vibes in `submittedIdeas` on this device only. "Tips of Dating" is a static list in `public/data.js`.
- **Night mode.** Optional auto dark theme from 9pm to 6am, checked about once a minute. The layout is a 400×820 phone frame on a desktop browser and full-screen below 460px wide.

`SETUP.md` still tells you to tap "Find Real Ideas Near You" and then open a detail screen for a "Near You" section. That button is gone. Location is requested automatically, and real places and events are mixed into the deck. The detail screen still has a "Real Nearby Spot" or "Local Event" block when the card is one of those.

## Quick start

Install, keys, and `npm start` are in [SETUP.md](SETUP.md). Short version:

```
npm install
cp .env.example .env   # optional; every key can stay blank
npm start              # http://localhost:3000
```

Node 18 or newer. Every key in `.env` is optional. Without them the matching feature stays off and the built-in catalog still works. Do not commit `.env`.

## Project structure

| Path | What it is |
| --- | --- |
| `public/index.html` | App shell: onboarding, tutorial, phone frame, tab bar, overlays. Loads the scripts below. |
| `public/app.js` | All UI and client state. One IIFE, about 2,800 lines. Not a module. |
| `public/style.css` | Layout and theme for that shell, including the design-token block. |
| `public/util.js` | Pure helpers (`escapeHtml`, dates, hash/RNG) loaded before `app.js`. |
| `public/data.js` | `IDEAS_DATA` (one very large line, about 1.1 MB), `DEMO_FRIENDS`, and `DATING_TIPS`. |
| `data/coords/utah.json` | Per-idea Utah coordinates, keyed by idea id. Not read by the app. |
| `data/geo/` | Nominatim cache, place queries, and overrides for `scripts/geocode-utah.js`. |
| `scripts/geocode-utah.js` | Rerunnable Utah geocoder. Usage is in the file header. |
| `scripts/pin_utah.js` | Rerunnable hand-pin pass. Never overwrites a locked entry. |
| `public/motifs.js` | `MOTIFS` drawing library. 117 drawings; the catalog uses 115 of them. |
| `public/motif-preview.html` | Standalone art preview. Reimplements framing because `app.js` does not export it. |
| `public/qrcode.lib.js` | Vendored MIT QR Code generator (Kazuhiko Arase). Used only for the invite QR. |
| `server.js` | Express static server plus `GET /api/status`, `POST /api/nearby-ideas`, and `POST /api/events`. |
| `events-source.js` | Ticketmaster Discovery client, in-memory cache, coordinate coarsening. |
| `events-map.js` | Pure Ticketmaster → Spark card translation and the classification table. |
| `test/` | `npm test` runner, a Node VM harness for `app.js`, and the current test files. |
| `work/` | One-off scripts and JSONL patches from the catalog rewrite. Not used at runtime. |
| `.env.example` | Documents every optional environment variable. |
| `SETUP.md` | How to install, add keys, and run the server. |
| `.claude/launch.json` | Local launch config that runs `npm start` on port 3000. |

### `work/`

These files record how the catalog was rewritten (filters, scenes, motifs, titles, descriptions). They are not imported by the app.

- `apply_patches.js` reads `patch_scene.jsonl`, `patch_motif.jsonl`, `patch_motif_gapfill.jsonl`, `patch_filters.jsonl`, and `patch_text.jsonl`, checks every value against the app's vocabularies and `public/motifs.js`, then rewrites `public/data.js`. `node work/apply_patches.js --dry` validates without writing. The first successful write copies the previous `data.js` to `work/data.js.before_agents` (only if that file is missing) and `work/data.js.prev`. Both backup names are gitignored.
- `motif_helper.js` is an ordered keyword classifier that proposes a motif from an idea's text. `motif_auto.json` is its output. `motif_ovr_001.txt`–`motif_ovr_020.txt` are hand overrides (`id motif`). `motif_build.js` merges those into `patch_motif.jsonl`. It reads `work/ideas_input.json`, which is gitignored, so it does not run from a fresh clone.
- `motif_view.js` prints which ideas received a given motif. It also needs `ideas_input.json`.

`.gitignore` also skips `*.bak_pre2000`, `node_modules/`, and `.env`.

### `test/`

| File | What it checks |
| --- | --- |
| `run.js` | Loads every `*.test.js`, sums pass/fail, exits 1 if anything failed. No test framework and no dev dependencies. |
| `harness.js` | Loads the real `app.js` inside a Node `vm` with a fake DOM and `localStorage`, then returns the functions the IIFE exports for tests. `fetch` never resolves. |
| `ids.test.js` | Stable numeric ids for Google-place cards, snapshots across a reload, and cleanup of orphaned legacy ids in the 9000000–9999999 range. |
| `events-map` via `events.test.js` | Time of day, season, price bands, classification, and the Ticketmaster fetch/cache layer with `fetch` stubbed. |
| `events-ui.test.js` | Event ids, reload persistence, expiry, budget display, and how many events reach the deck. |
| `geo.test.js` | `data/coords/utah.json`: ids exist in `public/data.js`, pinned lat/lng sit inside Utah, statuses are valid. |

Real-place and event ids are numeric on purpose: cover art seeds its random generator from `idea.id`.

## Tests

```
npm test
```

That is `node test/run.js`. Run it before opening a pull request.

## Contributing

Several people (and bots) will be changing this repo at once.

- One branch and one pull request per change. Do not pile unrelated work onto someone else's branch.
- Keep `npm test` passing. If you change filter vocabularies, update them together: `FILTER_DEFS` in `public/app.js`, `SPARK` in `events-map.js`, and the lists at the top of `work/apply_patches.js`. `events-map.js` checks its own classification table against `SPARK` at load time.
- Never commit `.env` or real API keys. Commit `.env.example` when you add a new variable.
- Do not re-run `work/apply_patches.js` against `public/data.js` unless you mean to rewrite the catalog. Reviewing a `data.js` diff is painful because the array is a single line.
- Ticketmaster's terms require the attribution line and the outbound ticket link. Leave both in place.
- User coordinates are sent in a POST body (`/api/nearby-ideas`, `/api/events`) so they do not land in URLs, history, or `Referer` headers. Keep it that way.
