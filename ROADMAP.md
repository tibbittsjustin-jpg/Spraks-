# Spark roadmap

Priorities below come from the current code, not from a product backlog. Items marked **Suggestion** are reasonable next steps the code does not already commit to. Anything else is a gap or a piece of debt that is visible in the repo today.

Owners: product, frontend, backend/integrations, and QA/infra. Stay inside your area unless the change cannot (filter vocabularies, for example, are named in more than one file).

## Product

1. **The deck is not shuffled.** `computeDeck()` walks `IDEAS_DATA` in file order and inserts a real place or event about every eight built-in cards (`EXTRAS_EVERY`). The catalog is grouped by category, and it starts with winter ideas, so a new user meets a long run of snow dates first. `state.deckOrder` is documented as a cached shuffle and is never read. `passedIds` is written on a down-swipe and cleared when a new plan starts, and nothing else reads it. **Suggestion:** shuffle the built-in ids once per filter set, store that order, and decide whether a pass should do something a "seen" flag does not already do.

2. **Bring `SETUP.md` in line with the app.** The "How to use the new feature" section still says to tap "Find Real Ideas Near You" and then look for a "Near You" block on the detail screen. `enterApp()` requests location with no button, and nearby cards are mixed into the deck. The detail block is titled "Real Nearby Spot" or "Local Event."

3. **Budget bands do not cover real prices.** Bands are Free, $1–$10, $20–$30, and $100 and under. There is a gap between $10 and $20, and nothing above $100. `events-map.js` refuses to label a more expensive event with a band (`cost` stays `null`) and tells the UI to show `priceText` instead. Those events then fail a budget filter. The file points at a `README-EVENTS.md` for the "$100+" fix. That file does not exist. Adding a top band means touching `FILTER_DEFS`, `SPARK`, and `work/apply_patches.js` together.

4. **The birthday-coupon line is unimplemented.** Onboarding says the birthday month will be flagged so the user does not miss a participating spot's coupon. Birthday is stored on the profile and mixed into the invite-code hash. No coupon, no month flag, and no "participating spot" data exists.

5. **Idea submissions never leave the device.** "Got an Idea?" appends to `state.submittedIdeas` and shows a thank-you toast. There is no review queue and no endpoint.

6. **Friends, invites, and sharing are a demo.** `DEMO_FRIENDS` is four fixed people. `MOCK_CONTACTS` is six fixed phone numbers. Share and "Send Link" only toast. The plan-share flow writes a `friendPicks` entry locally so the detail screen can say that friend picked a favorite. The QR code encodes `https://spark-dates.app/invite/...`, and "Copy Invite Link" does not call the clipboard. **Suggestion:** a real accounts-and-sharing backend is a large product decision; until then, the UI should not imply a message was sent or a link was copied.

7. **Event blurbs are assembled, not written.** `eventDescription()` joins genre, venue, and date. The comment in `app.js` says that is the honest sentence until per-event copy exists. Nearby-place cards already get a one-sentence Claude description. **Suggestion:** the same treatment for events, or leave the factual sentence and drop the "until" comment once that choice is made.

8. **The catalog's audience is local even when the user is not.** 171 ideas are "Local Provo/Utah County Business Dates" and 98 are "Local Utah/Idaho Spots & Day Trips." Events and Places work for any lat/lng or US zip. **Suggestion:** either say Spark is a Utah County date app that also shows local events, or split the national catalog from the local one so other cities are not swiping Provo businesses first.

## Frontend

1. **Split `app.js`.** It is one ~2,780-line IIFE: icons, state, location, events, deck, filters, plans, detail gestures, friends, profile, and theme. Screens already have natural seams (`buildDiscoverScreen`, `buildEventsScreen`, `buildSavedScreen`, `buildFriendsScreen`, the subpages). **Suggestion:** extract those without changing behavior, and export the cover-art helpers so `motif-preview.html` can stop reimplementing the framing.

2. **Real nearby cards inherit the active filters.** `hydrateRealIdea()` copies the current season, time, stage, and date-type filters onto the card (or "all of them" when the filter is empty), and it uses the first selected duration rather than only Claude's `durationGuess`. A card can match filters it was never classified for. Events go through `events-map.js` and do not do this.

3. **"Start Over" only forgets built-in ids.** The empty-deck reset keeps a seen id unless it is in the current `IDEAS_DATA` filter match. Seen real-place and event ids stay seen, so those cards do not come back when the user starts over.

4. **Favorites are `somedayIds` in state and "Favorites" in the UI.** Comments still say "Someday." New code should use the name the screen uses, or rename the field in one migration. `loadState()` already migrates the older `savedIds` array into `somedayIds`.

5. **Profile photos are data URLs in `localStorage`.** A large photo can throw on `setItem`. `saveState()` swallows that error, so a failed write looks like success.

6. **Duplicated vocabularies.** The same duration, cost, vibe, stage, and scene strings live in `app.js`, `events-map.js`, and `work/apply_patches.js`. They have already drifted once in spirit: the client filter chips offer Indoor and Outdoor, while ideas and events may be `Both`, which the matcher treats as matching either. **Suggestion:** one shared list, imported by the server files and written into the browser bundle, so a typo cannot ship a card no filter will match.

## Backend / integrations

1. **Nearby places need both keys, and failures are quiet.** `/api/nearby-ideas` returns `{ ideas: [], reason: "not_configured" }` unless both `GOOGLE_PLACES_API_KEY` and `ANTHROPIC_API_KEY` are set. Each category search swallows its own error and becomes `[]`. Claude is called as `claude-sonnet-5` with a JSON-only prompt. Google is the legacy Places Text Search (`maps.googleapis.com/maps/api/place/textsearch/json`), up to six categories and six results each, then twenty candidates. **Suggestion:** surface a per-request reason in the location chip when Places or Claude fails, instead of leaving the chip on "Location on."

2. **Places results are not cached.** Events are: `events-source.js` keeps an in-memory map (default 180 minutes, `EVENTS_CACHE_TTL_MINUTES`), keyed on zip or coordinates rounded to two decimal places (~1 km), capped at 500 entries, and emptied on restart. The file says to move that map to Redis if Spark ever runs more than one process. Nearby-place search hits Google and Anthropic on every session. **Suggestion:** cache place cards the same way before this is hosted for more than one person. Text Search is called out in `.env.example` as a pricey SKU.

3. **There is no user backend.** Profiles, plans, friend picks, and submitted ideas exist only in the browser. `/api/status`, `/api/nearby-ideas`, and `/api/events` are the only routes. `express.static` serves the whole project directory (including `server.js`, `test/`, and `work/`). That is fine on localhost. **Suggestion:** if this is ever deployed, serve only the client files and keep the API key off the instance's public filesystem listing. Dotfiles are ignored by Express's default `dotfiles: "ignore"`, so `.env` is not served today.

4. **Ticketmaster constraints to preserve.** Radius is clamped (Spark offers 5/10/25; the client code allows up to 500). Default window is 60 days, page size up to 100. Cancelled events are dropped. `POST /api/events` returns `{ events: [], reason: "not_configured" }` with no key, 400 when there is no lat/lng and no postal code, and 502 on upstream failures (`TM_RATE_LIMIT`, `TM_AUTH`, and so on). Attribution text and URL are attached on success. Do not switch this route to GET.

5. **Event descriptions and images stop at the mapper.** `mapEvent()` keeps a Ticketmaster image URL, segment, genre, venue, distance, and price text. The deck still draws generated cover art. **Suggestion:** use the photo on event cards only if product wants real imagery; the classification table is intentionally not AI.

## QA / infra

1. **CI runs `npm test`.** `.github/workflows/ci.yml` checks out the repo, sets up Node 22 (`package.json` engines is `>=18`; there is no `.nvmrc`), caches npm, installs with `npm ci` from `package-lock.json`, and runs the hand-rolled runner (`test/run.js`) on every push and pull request. There are still no dev dependencies. The suite is offline and does not need secrets. **Done.**

2. **Tests cover the events pipeline and external-id persistence, and little of the rest of the app.** Offline mapping, a stubbed Ticketmaster fetch, stable ids, reload behavior, deck interleaving, and a few event filter cases (date stage, time of day, budget) are in `test/events.test.js`, `test/events-ui.test.js`, and `test/ids.test.js`. Nothing asserts the built-in catalog's filter matrix, swipe direction, plans, Favorites, the nearby-ideas route, onboarding, or friends. The harness's DOM is a stub, so it cannot catch a broken render.

3. **`data.js` cannot be reviewed as a diff.** 1,999 ideas are one JSON line inside a `const`. A one-idea edit rewrites the whole line. **Suggestion:** only if someone is willing to touch the loader — pretty-print or split the catalog. That is a behavior-adjacent change and should be its own pull request with `npm test` green.

4. **Treat `work/` as a record unless the input dump comes back.** `apply_patches.js` can still dry-run against the committed `data.js` and the JSONL files. `motif_build.js` and `motif_view.js` read gitignored `work/ideas_input.json` and will not run from a clone. The `motif_ovr_*.txt` files and `motif_auto.json` are inputs to that historical build, not a supported authoring tool.

5. **`SETUP.md` and code comments disagree about the location UX** (see Product). A short test or a comment next to `enterApp()` is enough to keep the next edit from restoring the removed button by following the old doc.
