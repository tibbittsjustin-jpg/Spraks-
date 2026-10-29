# Spark roadmap

Priorities below come from the current code, not from a product backlog. Items marked **Suggestion** are reasonable next steps the code does not already commit to. Anything else is a gap or a piece of debt that is visible in the repo today.

Owners: product, frontend, backend/integrations, and QA/infra. Stay inside your area unless the change cannot (filter vocabularies, for example, are named in more than one file).

## Product

1. **The deck is not shuffled.** `computeDeck()` walks `IDEAS_DATA` in file order and inserts a real place about every eight built-in cards (`EXTRAS_EVERY`). The catalog is grouped by category, and it starts with winter ideas, so a new user meets a long run of snow dates first. `state.deckOrder` is documented as a cached shuffle and is never read. `passedIds` is written on a down-swipe and cleared when a new plan starts, and nothing else reads it. **Suggestion:** shuffle the built-in ids once per filter set, store that order, and decide whether a pass should do something a "seen" flag does not already do.

2. **Bring `SETUP.md` in line with the app.** The "How to use the new feature" section still says to tap "Find Real Ideas Near You" and then look for a "Near You" block on the detail screen. `enterApp()` requests location with no button, and nearby cards are mixed into the deck. The detail block is titled "Real Nearby Spot."

3. **Budget bands do not cover real prices.** Bands are Free, $1–$10, $20–$30, and $100 and under. There is a gap between $10 and $20, and nothing above $100. Adding a top band means touching `FILTER_DEFS`, `shared/filters.js`, and `work/apply_patches.js` together.

4. **The birthday-coupon line is gone.** Onboarding used to promise a birthday-month flag. The date of birth is now only an 18+ check (`POST /api/age-check`) and is not stored. The profile keeps `ageConfirmedAt` instead. No coupon data exists.

5. **Idea submissions never leave the device.** "Got an Idea?" appends to `state.submittedIdeas` and shows a thank-you toast. There is no review queue and no endpoint.

6. **Friends, invites, and sharing are a demo.** `DEMO_FRIENDS` is four fixed people. `MOCK_CONTACTS` is six fixed phone numbers. Share and "Send Link" only toast. The plan-share flow writes a `friendPicks` entry locally so the detail screen can say that friend picked a favorite. The QR code encodes `https://spark-dates.app/invite/...`, and "Copy Invite Link" does not call the clipboard. **Suggestion:** a real accounts-and-sharing backend is a large product decision; until then, the UI should not imply a message was sent or a link was copied.

7. **The catalog's audience is local even when the user is not.** 171 ideas are "Local Provo/Utah County Business Dates" and 98 are "Local Utah/Idaho Spots & Day Trips." Places search works for any lat/lng. **Suggestion:** either say Spark is a Utah County date app, or split the national catalog from the local one so other cities are not swiping Provo businesses first.

## Frontend

1. **Split `app.js`.** It is one IIFE (icons, state, location, deck, filters, plans, detail gestures, friends, profile, and theme). The ordered, behavior-preserving plan is below. Step 1 (`util.js`) has landed. Screens already have natural seams (`buildDiscoverScreen`, `buildSavedScreen`, `buildFriendsScreen`, the subpages). Cover-art extraction is step 6, which is also what lets `motif-preview.html` stop reimplementing the framing.

### Module approach

Classic `<script src>` files, in order, with no build step and no `type="module"`. Each extracted file is a classic script. When a browser (or the test sandbox) loads it, it assigns one namespace global (`SparkUtil`, and later `SparkIcons`, and so on). When Node `require`s it, the same file assigns `module.exports` instead. `app.js` stays the composition root and keeps thin same-named wrappers (`function escapeHtml(s){ return SparkUtil.escapeHtml(s); }`) so call sites and the harness hook do not change in the same pull request as a move.

This matches how the app is loaded today. `public/index.html` lists `qrcode.lib.js`, `data.js`, `motifs.js`, `util.js`, then `app.js`. `data.js` and `motifs.js` are globals (`IDEAS_DATA`, `MOTIFS`), and `app.js` reads them. The README says opening `public/index.html` directly still swipes, saves, and plans. A native ES module (`<script type="module">` plus `import`) does not run from `file://` — browsers block those imports — so that switch would drop a path the app currently has. A bundler is also a poor fit for the current tests: `test/harness.js` reads the source, runs it with `vm.runInContext` in a fake DOM, and splices a `window.__t` hook onto the single anchor `\n  boot();\n})();`. A bundle would hide that anchor, add a dependency, and raise the question of whether tests load source or output. Revisit a concat step only if the script list itself becomes the problem. Do not introduce it in order to move one file.

Tests reach moved code two ways. Pure files are `require`d from `test/*.test.js`. Anything the page still calls through `app.js` is loaded by the harness, which must `vm.runInContext` every new script in `index.html` order before `app.js`. Stateful files have to be re-run per `loadApp()`. Node caches `require`, and a cached id map would leak across the "fresh page load" tests.

### Shared state that makes later steps risky

Almost every screen closes over the same mutable bindings inside the IIFE. A move that copies the binding instead of sharing it will look fine on one screen and desync the others.

- `state` — the persisted object (`spark_state_v1`). Assigned once from `loadState()`. Mutated everywhere. `saveState()` also runs `syncRealIdeaSnapshots()` before `localStorage.setItem`, and it swallows a quota error.
- `ui` — not persisted. `tab`, `screen`, `detailIdeaId`, `detailFriendId`, `filterDraft`, `activePlanId`, `savedBucket`, `planDraft`.
- `IDEAS_BY_ID` — built-in ideas plus every real place hydrated this session, plus snapshots put back by `rehydrateRealIdeas()`.
- Real-place session: `REAL_IDEAS_RUNTIME` (pushed, not reassigned), `realIdeasLoading`, `realKeyToId`, `realIdToKey`, `apiStatusPromise`.
- Deck session: `deckOrderCache`. The cache is the bugfix that keeps an interleaved real spot from sitting forever N cards ahead. Recomputing the interleave after every swipe brings that bug back.
- `artCache`, `toastTimer`, `openSwipeRowReset` (only one swipe-to-delete row stays open), `shareTargetIdeaId`, `planShareState`, `obPhotoData`, `tutorialIndex`.

Globals from other scripts: `IDEAS_DATA`, `DEMO_FRIENDS`, `DATING_TIPS`, `MOTIFS`, `qrcode`. `loadState()` duplicates the real-id window as the literals `9000000` and `10000000` because `REAL_ID_MIN` is assigned later in the source. A move must not change that migration.

The harness exports, and therefore the names that must keep working until a step says it updates `test/harness.js`: `state`, `IDEAS_BY_ID`, `REAL_IDEAS_RUNTIME`, `hydrateRealIdea`, `saveState`, `addIdeaToBucket`, `removeIdeaFromBucket`, `totalSavedCount`, `isRealId`, `displayCost`, `localDateISO`, `computeDeck`, `matchesFilters`, `buildIdeaRow`, `finishOnboarding`, `ageGateSatisfied`.

### Ordered split

Each step is its own pull request. Behavior stays the same. `npm test` stays green. Leave the `boot();` anchor intact until the shell step, and change the harness in the same commit as any anchor or export change.

1. **`util.js` — done.** Moved `escapeHtml`, `fmtDate`, `todayISO`, `pad2`, `localDateISO`, `hashStr`, `mulberry32`. No dependencies. `pad2` is only used by `localDateISO`, so it has no wrapper. The other six are wrappers in `app.js`. Risk: low. `hashStr` is load-bearing: external ids, cover-art seeds, and the invite code all use it, so the tests lock golden hash and mulberry32 values plus the existing place id `9775047`.

2. **`icons.js`.** Move `ICONS`, `icon`, `CATEGORY_ICON_MAP`, `categoryIcon`, `ideaIcon`. No dependencies. Wrappers stay in `app.js`. Risk: low. The SVG strings are the UI; copy them, do not redraw them. `ideaIcon` prefers `idea.icon` when that name exists in `ICONS`.

3. **`filters.js`.** Move `FILTER_DEFS`, `matchesFilters`, `activeFilterCount`. No state. Risk: low-medium. `FILTER_DEFS` is the vocabulary `shared/filters.js` and `work/apply_patches.js` are checked against. This step moves the array; it does not retune options. `matchesFilters` treats `setting: "Both"` as matching Indoor or Outdoor, and it assumes `time`, `vibe`, `season`, `stage`, and `dateType` are arrays. Empty selections still mean "any".

4. **`deck.js`, interleave only.** Move `EXTRAS_EVERY` and `interleaveIds`. No state. Risk: low. `computeDeck` stays in `app.js` and calls the moved function. The step size of 8 and the "append the leftovers" tail are the behavior. Do not fold `computeDeck` in here: it reads `state`, both runtime pools, `IDEAS_DATA`, `seenIds`, and `deckOrderCache`.

6. **`cover-art.js`.** Move `artCache`, `SCENE_THEMES`, `VALID_SCENES`, `HORIZON`, `SCENE_MOTIFS`, `motifFor`, `motifMarkup`, `getSceneTheme`, `getCoverArtStyle`, and the scene-drawing helpers those close over. Depends on `SparkUtil.hashStr` / `mulberry32` and the `MOTIFS` global. Risk: medium. The SVG is user-visible; a one-character change shows up on every card. `artCache` is per page load, so the harness must run this file inside the sandbox rather than `require` it once. Leave `motif-preview.html` alone in this step. A follow-up can point the preview at the shared helpers and check a few motifs against the card. Doing that in the same pull request mixes a visual change into the move.

7. **`ids.js`.** Move `REAL_ID_MIN`, `REAL_ID_SPAN`, `isRealId`, `stableKeyForReal`, `realIdForKey`, and the maps `realKeyToId` / `realIdToKey`. Depends on `SparkUtil.hashStr`. Risk: medium-high. The maps have to start empty on every page load, including every `loadApp()`. A `require` cache here would reuse ids across tests and hide collisions. `rehydrateRealIdeas()` must still write the maps before any new batch is hashed, or a saved place can lose its id. Keep the literals inside `loadState()` in agreement with the constants.

8. **`storage.js`.** Move `STORAGE_KEY`, `defaultState`, `loadState`, and the migration inside it (`savedIds` → `somedayIds`, missing filter and settings keys, `friendPicks`, dropping unresolvable real ids). `saveState()` stays next to `syncRealIdeaSnapshots()` until that snapshot function has a single owner (step 7's maps plus `keptIdeaIds()`). Risk: high. `var state = loadState()` remains in `app.js`, because the rest of the file closes over that binding. Initialization order is the hazard: several listeners and `rehydrateRealIdeas()` run while the script is evaluating, not from `boot()`.

9. **`plans.js`.** Move `genId`, `getPlanById`, `getActivePlan`, `findIdeaBucket`, `isIdeaSaved`, `isIdeaInBucket`, `addIdeaToBucket`, `removeIdeaFromBucket`, `removeIdeaEverywhere`, `bucketLabel`, `saveIdeaToActiveBucket`, `totalSavedCount`, `getFriendPicksForIdea`. Depends on `state` and `ui.activePlanId`. Risk: high. Pass `state` (and the active plan id) in, and keep the harness-facing wrappers' signatures. These mutate `somedayIds` and `plan.ideaIds` in place. `findIdeaBucket` prefers the active plan; `isIdeaInBucket` is the membership test that allows a plan and Favorites at once. `bucketLabel` returns the plan name or `"Favorites"`.

10. **`dom.js`.** Move `$`, `$all`, `el`, `showToast`, `openOverlay`, `closeOverlay`. Depends on `document`. Risk: medium. `$` resolves `document` when it is called, so this file has to run in the page and in the harness sandbox. `require`ing it from Node's own global and injecting the function would see the wrong `document`. `showToast` owns `toastTimer` (2200ms). Small payoff on its own; it is here so the screen steps stop copying the three DOM helpers.

11. **`theme.js`.** Move `isNightHours` and `applyTheme`, and the one `setInterval(applyTheme, 60000)` plus the night-mode checkbox listener. Depends on `state.settings` and `document.documentElement`. Risk: low-medium. Night is 9pm–6am local, and only when `autoDarkMode` is on. One owner of the interval, or the theme flips twice a minute for no reason.

12. **`gestures.js`.** Move `attachSwipeHandlers`, `finishSwipe`, `attachDetailHeroSwipeUp`, `attachDetailEdgeSwipeBack`, `attachEdgeSwipeBack`, `buildSwipeToDeleteRow`, and the constants `EDGE_SWIPE_ZONE` (24) and `EDGE_SWIPE_THRESHOLD` (70). Depends on `state` (`seenIds`, `passedIds`), the plan helpers, `showToast`, and the discover re-render. Risk: high. Up-swipe saves past 100px, down-swipe passes past 100px, a tap with less than ~6px of movement opens detail. `openSwipeRowReset` is the shared "only one row open" slot. The edge swipe measures from `.phone`, not the viewport, so the desktop frame still lines up. Do not tidy the pointer math.

13. **`discover.js`.** Move `buildDiscoverScreen`, `buildLocationBar`, `renderDeckCards`, `updateResultCount`, `buildSwipeCard`, `openFilterOverlay`, `renderFilterBody`, and the filter-overlay button listeners. Depends on deck, filters, gestures, icons, cover art, plans, location. Risk: high. "Start Over" still clears `seenIds` only for built-in ids that match the current filters (real-place ids stay seen). That quirk stays until a product change says otherwise. The filter draft is a deep copy on `ui.filterDraft`; chips mutate the draft, and only Apply writes `state.filters`.

14. **`computeDeck` into `deck.js`.** Move `computeDeck` and `deckOrderCache` once the pools can be passed in (`builtinIds` are already filtered here, real pool only with `state.location`). Risk: high, which is why it is not the interleave step. The signature is `JSON.stringify(filters) + "|" + builtinIds.length + "|" + extraIds.join(",")`. Seen ids are hidden after the order is fixed. A wrong cache key either reshuffles under the user or never picks up a new batch of real spots.

15. **`detail.js`.** Move `buildDetailScreen`, `openShareOverlay`, `openPlanShareOverlay`, `commitFriendPick`, and their step state (`shareTargetIdeaId`, `planShareState`). Depends on plans, cover art, icons, `DEMO_FRIENDS`. Risk: high. Mark-as-done pushes `{ id, date: todayISO() }`. The hero swipe-up saves to the active plan, or Favorites when no plan is active, and then goes back. Share still only toasts.

16. **`saved.js`, `done.js`, `friends.js`, `profile.js` — one screen per pull request, in that order.** Saved: folder list, bucket screen, `deletePlan`, swipe-to-delete. Done: `buildDoneScreen` and `buildDoneSubpanel`. Friends: `buildFriendsScreen`, `buildFriendDetailScreen`, invite link (`hashStr` of the name), QR, `MOCK_CONTACTS`. Profile: overlay header, subpage router, tips, idea submit, edit profile, onboarding submit, and the tutorial. Risk: medium. Onboarding and nav listeners are bound while the script evaluates, once. Moving them must not bind them again on every render, and must not bind them before `state` exists. Idea submit still only appends to `state.submittedIdeas`.

17. **`app.js` as the shell only.** What remains: `state` and `ui`, `renderContent` / `switchTab` / `goToDetail` / `goBackFromDetail`, `enterApp`, `boot`, and the permanent listeners (nav, profile, reset, plan overlay open/close). The harness anchor moves in this same pull request, with the hook pointed at whatever the shell exports. Risk: medium. After this, a screen change should not have to open a 2,000-line file.

Nearby-place fetch (`fetchApiStatus`, `requestLocation`, `clearLocation`, `hydrateRealIdea`, `fetchNearbyIdeas`, `updateLocationBar`, `rehydrateRealIdeas`, `syncRealIdeaSnapshots`, `keptIdeaIds`) stays in `app.js` until steps 7 and 8 land, then moves as one `places-client.js` pull request. Keep that fetch in one file rather than inventing a second client. `hydrateRealIdea` still copies the active season, time, stage, and date-type filters onto the card (or all of them when the filter is empty) and still takes the first selected duration. That is existing behavior; changing it is a product fix, not a refactor.

### Other frontend gaps

2. **Real nearby cards inherit the active filters.** `hydrateRealIdea()` copies the current season, time, stage, and date-type filters onto the card (or "all of them" when the filter is empty), and it uses the first selected duration rather than only Claude's `durationGuess`. A card can match filters it was never classified for.

3. **"Start Over" only forgets built-in ids.** The empty-deck reset keeps a seen id unless it is in the current `IDEAS_DATA` filter match. Seen real-place ids stay seen, so those cards do not come back when the user starts over.

4. **Favorites are `somedayIds` in state and "Favorites" in the UI.** Comments still say "Someday." New code should use the name the screen uses, or rename the field in one migration. `loadState()` already migrates the older `savedIds` array into `somedayIds`.

5. **Profile photos are data URLs in `localStorage`.** A large photo can throw on `setItem`. `saveState()` swallows that error, so a failed write looks like success.

6. **Duplicated vocabularies.** The same duration, cost, vibe, stage, and scene strings live in `app.js`, `shared/filters.js`, and `work/apply_patches.js`. They have already drifted once in spirit: the client filter chips offer Indoor and Outdoor, while ideas may be `Both`, which the matcher treats as matching either. **Suggestion:** one shared list, imported by the server files and written into the browser bundle, so a typo cannot ship a card no filter will match.

## Backend / integrations

1. **Nearby places need both keys, and failures are quiet.** `/api/nearby-ideas` returns `{ ideas: [], reason: "not_configured" }` unless both `GOOGLE_PLACES_API_KEY` and `ANTHROPIC_API_KEY` are set. Each category search swallows its own error and becomes `[]`. Claude is called as `claude-sonnet-5` with a JSON-only prompt. Google is the legacy Places Text Search (`maps.googleapis.com/maps/api/place/textsearch/json`), up to six categories and six results each, then twenty candidates. **Suggestion:** surface a per-request reason in the location chip when Places or Claude fails, instead of leaving the chip on "Location on."

2. **Places results are not cached.** Nearby-place search hits Google and Anthropic on every session. The user's coordinates are rounded to about 1 km before that call. **Suggestion:** cache place cards before this is hosted for more than one person. Text Search is called out in `.env.example` as a pricey SKU.

3. **There is no user backend.** Profiles, plans, friend picks, and submitted ideas exist only in the browser. Routes are `GET /api/status`, `GET /api/activities`, `GET /api/activities/:id`, `POST /api/nearby-ideas`, and `POST /api/age-check`. Static files come only from `public/`. **Suggestion:** if this is ever deployed, keep the API key off the instance's public filesystem listing. Dotfiles are ignored by Express's default `dotfiles: "ignore"`, so `.env` is not served today.

## QA / infra

1. **CI runs `npm test`.** `.github/workflows/ci.yml` checks out the repo, sets up Node 22 (`package.json` engines is `>=18`; there is no `.nvmrc`), caches npm, installs with `npm ci` from `package-lock.json`, and runs the hand-rolled runner (`test/run.js`) on every push and pull request. There are still no dev dependencies. The suite is offline and does not need secrets. **Done.**

2. **Tests cover external-id persistence, the age gate, coordinate coarsening, and the removed listings feed, and little of the rest of the app.** Stable ids and reload behavior are in `test/ids.test.js`. `test/age-gate.test.js`, `test/nearby-privacy.test.js`, and `test/feed-removed.test.js` cover the 18+ check, rounded outbound coordinates, and saved cards from the old feed. Nothing asserts the built-in catalog's filter matrix, swipe direction, or friends. The harness's DOM is a stub, so it cannot catch a broken render.

3. **`data.js` cannot be reviewed as a diff.** 1,999 ideas are one JSON line inside a `const`. A one-idea edit rewrites the whole line. **Suggestion:** only if someone is willing to touch the loader — pretty-print or split the catalog. That is a behavior-adjacent change and should be its own pull request with `npm test` green.

4. **Treat `work/` as a record unless the input dump comes back.** `apply_patches.js` can still dry-run against the committed `data.js` and the JSONL files. `motif_build.js` and `motif_view.js` read gitignored `work/ideas_input.json` and will not run from a clone. The `motif_ovr_*.txt` files and `motif_auto.json` are inputs to that historical build, not a supported authoring tool.

5. **`SETUP.md` and code comments disagree about the location UX** (see Product). A short test or a comment next to `enterApp()` is enough to keep the next edit from restoring the removed button by following the old doc.
