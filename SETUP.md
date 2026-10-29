# Running Spark with real nearby-place matching

Spark now has an optional "Near You" feature: when you enable location and open
a date idea's details, it can show REAL nearby restaurants, hiking trails,
movie theaters, museums, and more — matched to the idea and to how much time
you have (via the "Date Length" filter) using Google Places + Claude (AI).

Because this calls real external APIs with real API keys, it can no longer run
as a plain double-clicked HTML file — it now runs as a tiny local web server.
**The rest of the app (swiping, saving, Favorites, plans, sharing) works
exactly like before either way.**

## One-time setup

1. Install [Node.js](https://nodejs.org/) (v18 or newer) if you don't have it.
2. Open a terminal in this folder and run:
   ```
   npm install
   ```
3. Copy the example environment file and add your own keys:
   ```
   cp .env.example .env
   ```
   Then open `.env` in a text editor and fill in whichever keys you want.
   Every one of them is optional and each feature stays off until its key is
   present:
   - `TICKETMASTER_API_KEY` — from the [Ticketmaster developer portal](https://developer-acct.ticketmaster.com/). Powers the **local events** list. Free tier.
   - `GOOGLE_PLACES_API_KEY` — from the [Google Cloud Console](https://console.cloud.google.com/), with the **Places API** enabled for your project.
   - `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com/).

   Don't have keys yet, or don't want to set this up right now? That's fine —
   skip straight to step 4. The app runs great without them; it just won't
   show real nearby places.

## Running it

```
npm start
```

Then open **http://localhost:3000** in your browser. That's the app.

## How to use the new feature

1. On the Discover screen, tap **"📍 Find Real Ideas Near You"** and allow
   location access when your browser asks.
2. Tap into any date idea to open its details.
3. If the idea has a real-world equivalent nearby (a trail, restaurant,
   theater, etc.) and your API keys are set up, you'll see a **"Near You"**
   section with real places, matched to the "Date Length" filter you've set
   (e.g. a couple-hours hike vs. an all-day one).
4. No keys yet? You'll instead see a small note letting you know real
   nearby matching isn't turned on yet — everything else still works normally.

## What's on near you (events)

Once `TICKETMASTER_API_KEY` is set, the server exposes:

    POST /api/events
    { "lat": 40.2338, "lng": -111.6585, "radiusMiles": 25 }

or, for anyone who declines location access:

    POST /api/events
    { "postalCode": "84601", "radiusMiles": 10 }

It returns real events near that location, already translated into Spark's own
shape (vibe, date stage, budget band, time of day, season) and sorted
soonest-first. `radiusMiles` is the 5 / 10 / 25 the radius picker offers.

It's a POST rather than a GET on purpose: the body carries the user's
coordinates, and keeping them out of the URL keeps them out of proxy logs,
browser history and `Referer` headers.

Without a key the route replies `{ "events": [], "reason": "not_configured" }`
rather than failing, so the rest of the app carries on as normal.

## Notes

- Your API keys stay on your own computer, in your own `.env` file — never
  commit that file or share it with anyone.
- Every Google Places + Claude call happens on your local server, not in the
  browser, so your keys are never exposed to the page or to Google/Anthropic's
  JS.
- Google Places and Anthropic API usage may incur costs on your account
  depending on your plan — check their pricing pages before heavy use.
- Event searches are cached on the server for a few hours (tune with
  `EVENTS_CACHE_TTL_MINUTES`). The cache is keyed on a coordinate rounded to
  about a kilometre, so everyone in a neighbourhood shares one entry and no
  precise location is ever used as a lookup key.
- Ticketmaster's terms require crediting them as the source and linking back to
  their listing for tickets. Spark does both, and never sells tickets itself.

## Database (optional)

The swipe deck still reads `public/data.js` in the browser. Postgres is only
for `GET /api/activities` and `GET /api/activities/:id`, and only the server
connects. The app works without it: leave `DATABASE_URL` empty and those two
routes answer `{ "error": "db_not_configured" }` while everything else stays
the same.

To turn it on with Supabase:

1. Create a project in a region near Utah (for example `us-west-1` or
   `us-west-2`) so the later map queries stay close to the catalog.
2. In the Supabase SQL editor, enable PostGIS:
   `create extension if not exists postgis;`
   The migration also runs that statement, so this is just to confirm the
   project allows it.
3. Copy the connection string from Project Settings → Database → Connection
   string → URI, "Session pooler", port 5432. Put it only in the server
   environment as `DATABASE_URL`. Do not put it in the browser, in git, or in
   a `NEXT_PUBLIC` / `VITE_` variable. The anon key is not used.
4. From this folder:

   ```
   npm run db:migrate && npm run db:seed
   ```

`npm run db:seed` loads `public/data.js` and, when `data/coords/*.json` is
present, the coordinate files. It is safe to run again. Curated ideas that
were removed from `data.js` are archived, not deleted.

For a local Postgres without TLS, set `PGSSLMODE=disable`. Integration tests
use `TEST_DATABASE_URL` and never point at the Supabase project.
