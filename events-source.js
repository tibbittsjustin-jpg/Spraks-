/* ===================== Spark events-source.js =====================
 * Talks to the Ticketmaster Discovery API and caches the results.
 *
 * Why this lives on the server rather than in the browser:
 *   - The API key stays out of the shipped app. A key in client JS is a
 *     published key.
 *   - Ticketmaster rate-limits per key (roughly 5 requests/second and a daily
 *     quota). One server making one request per neighbourhood is sustainable;
 *     every device making its own is not.
 *
 * The cache key deliberately rounds coordinates to ~1km before using them.
 * That collapses everyone in a neighbourhood onto a single cache entry — a
 * real privacy property, not just a hit-rate trick, since nothing here ever
 * records or forwards a user's precise position.
 * ============================================================ */

"use strict";

const eventsMap = require("./events-map");

const TM_BASE = "https://app.ticketmaster.com/discovery/v2/events.json";

/* Ticketmaster caps radius at 19,999 and `size` at 200 per page. Spark's own
 * radius picker offers 5/10/25 miles; anything outside that is clamped rather
 * than rejected so a malformed client request degrades instead of failing. */
const MAX_RADIUS_MILES = 500;
const MAX_SIZE = 200;
const DEFAULT_SIZE = 100;
const DEFAULT_WINDOW_DAYS = 60;

/* How long a cached search stays fresh. Event listings don't move quickly, so
 * hours rather than minutes. Override with EVENTS_CACHE_TTL_MINUTES. */
const DEFAULT_TTL_MINUTES = 180;

/* ---------- Cache ----------
 * In-memory and therefore per-process: it empties on restart, which is fine
 * for a single small server. If Spark ever runs more than one instance this
 * is the piece to move to Redis. */
const cache = new Map();

function ttlMs() {
  const mins = parseInt(process.env.EVENTS_CACHE_TTL_MINUTES || "", 10);
  return (isNaN(mins) || mins <= 0 ? DEFAULT_TTL_MINUTES : mins) * 60 * 1000;
}

/* Coarsens a coordinate to 2 decimal places (~1.1km). Everyone in a
 * neighbourhood shares one cache entry, and no precise location is ever used
 * as a lookup key. */
function coarsen(n) {
  return Math.round(n * 100) / 100;
}

function cacheKeyFor(params) {
  const where = params.postalCode
    ? "zip:" + params.postalCode
    : "geo:" + coarsen(params.lat) + "," + coarsen(params.lng);
  return [where, params.radiusMiles + "mi", params.windowDays + "d"].join("|");
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs()) { cache.delete(key); return null; }
  return hit.value;
}

function cacheSet(key, value) {
  cache.set(key, { at: Date.now(), value: value });
  // Bound the map so a long-running server can't grow without limit.
  if (cache.size > 500) {
    const oldest = Array.from(cache.entries()).sort(function (a, b) { return a[1].at - b[1].at; })[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

function clearCache() { cache.clear(); }

/* ---------- Request shaping ---------- */

function clampRadius(miles) {
  const n = parseInt(miles, 10);
  if (isNaN(n) || n <= 0) return 25;
  return Math.min(n, MAX_RADIUS_MILES);
}

/* Ticketmaster wants ISO-8601 in UTC with no milliseconds. */
function tmDateTime(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function buildQuery(params, apiKey) {
  const q = new URLSearchParams();
  q.set("apikey", apiKey);
  q.set("unit", "miles");
  q.set("radius", String(params.radiusMiles));
  q.set("sort", "date,asc");
  q.set("size", String(Math.min(params.size || DEFAULT_SIZE, MAX_SIZE)));

  if (params.postalCode) q.set("postalCode", String(params.postalCode));
  else q.set("latlong", params.lat + "," + params.lng);

  const now = new Date();
  const end = new Date(now.getTime() + params.windowDays * 24 * 60 * 60 * 1000);
  q.set("startDateTime", tmDateTime(now));
  q.set("endDateTime", tmDateTime(end));

  return q;
}

/* ---------- Errors ----------
 * Distinguishes "you haven't configured this" and "Ticketmaster is throttling
 * us" from genuine faults, so the route can respond usefully instead of
 * collapsing everything into a 500. */
function sourceError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function callTicketmaster(params, apiKey) {
  const url = TM_BASE + "?" + buildQuery(params, apiKey).toString();
  let resp;
  try {
    resp = await fetch(url);
  } catch (e) {
    throw sourceError("TM_UNREACHABLE", "Could not reach Ticketmaster: " + e.message);
  }

  if (resp.status === 401 || resp.status === 403) {
    throw sourceError("TM_AUTH", "Ticketmaster rejected the API key (HTTP " + resp.status + ")");
  }
  if (resp.status === 429) {
    throw sourceError("TM_RATE_LIMIT", "Ticketmaster rate limit reached — try again shortly");
  }
  if (!resp.ok) {
    throw sourceError("TM_HTTP_" + resp.status, "Ticketmaster returned HTTP " + resp.status);
  }

  let data;
  try {
    data = await resp.json();
  } catch (e) {
    throw sourceError("TM_BAD_JSON", "Ticketmaster returned a response we couldn't parse");
  }
  return data;
}

/* Ticketmaster occasionally returns the same event more than once across
 * classifications, so dedupe on its id. */
function dedupeById(events) {
  const seen = Object.create(null);
  const out = [];
  events.forEach(function (e) {
    if (!e || seen[e.eventId]) return;
    seen[e.eventId] = true;
    out.push(e);
  });
  return out;
}

function sortByStart(events) {
  return events.slice().sort(function (a, b) {
    const ad = a.startsAt || (a.localDate + "T" + (a.localTime || "00:00:00"));
    const bd = b.startsAt || (b.localDate + "T" + (b.localTime || "00:00:00"));
    return ad < bd ? -1 : ad > bd ? 1 : 0;
  });
}

/* ---------- Public entry point ----------
 * Resolves to { events, cached, source } and throws a coded error on failure.
 * Location is either {lat, lng} or {postalCode} — Ticketmaster searches by
 * either, which is what makes the zip-code fallback cheap. */
async function fetchEvents(opts) {
  opts = opts || {};
  const apiKey = process.env.TICKETMASTER_API_KEY || "";
  if (!apiKey) throw sourceError("NOT_CONFIGURED", "TICKETMASTER_API_KEY is not set");

  const hasGeo = typeof opts.lat === "number" && typeof opts.lng === "number" &&
                 !isNaN(opts.lat) && !isNaN(opts.lng);
  const postalCode = opts.postalCode ? String(opts.postalCode).trim() : "";
  if (!hasGeo && !postalCode) {
    throw sourceError("NO_LOCATION", "Need either lat/lng or a postal code");
  }

  const params = {
    lat: hasGeo ? opts.lat : null,
    lng: hasGeo ? opts.lng : null,
    postalCode: postalCode || null,
    radiusMiles: clampRadius(opts.radiusMiles),
    windowDays: parseInt(opts.windowDays, 10) > 0 ? parseInt(opts.windowDays, 10) : DEFAULT_WINDOW_DAYS,
    size: opts.size
  };

  const key = cacheKeyFor(params);
  const cached = cacheGet(key);
  if (cached) return { events: cached, cached: true, source: "ticketmaster" };

  const data = await callTicketmaster(params, apiKey);
  const raw = (data && data._embedded && Array.isArray(data._embedded.events))
    ? data._embedded.events : [];

  // Distance is measured from the user's real position when we have one.
  // Coarsening applies to the cache key only, never to what we show back.
  const origin = hasGeo ? { lat: opts.lat, lng: opts.lng } : null;
  const mapped = raw
    .map(function (ev) { return eventsMap.mapEvent(ev, origin); })
    .filter(Boolean);

  const events = sortByStart(dedupeById(mapped));
  cacheSet(key, events);
  return { events: events, cached: false, source: "ticketmaster" };
}

function isConfigured() {
  return !!process.env.TICKETMASTER_API_KEY;
}

module.exports = {
  fetchEvents: fetchEvents,
  isConfigured: isConfigured,
  clearCache: clearCache,
  // exported for tests
  cacheKeyFor: cacheKeyFor,
  buildQuery: buildQuery,
  clampRadius: clampRadius,
  dedupeById: dedupeById,
  sortByStart: sortByStart,
  DEFAULT_WINDOW_DAYS: DEFAULT_WINDOW_DAYS
};
