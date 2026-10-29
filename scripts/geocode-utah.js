#!/usr/bin/env node
// Rerunnable Utah geocoder (OSM Nominatim only, <=1 req/s, cached).
//
// From the repo root:
//   node scripts/geocode-utah.js
//
// Reads:
//   data/geo/place_queries.json   per-idea place, city, and query hints
//   data/geo/overrides.json       manual addresses, variants, and closures
//   data/geo/geocode_cache.json   Nominatim responses; a cached query makes no network call
//   data/coords/utah.json         published pins; entries with locked:true are copied through
//   data/geo/utah_coords.json     full previous run, if present (gitignored)
//   public/data.js                idea titles and categories (browser bundle)
//
// Writes:
//   data/coords/utah.json         confident, area_based, route_unpinned, flagged, pending
//                                 object keyed by idea id (same shape as a full coords file)
//                                 out_of_state and retired ideas are left out
//   data/geo/geocode_cache.json   updated cache
//   data/geo/place_queries.json   place map with overrides merged back in
//   data/geo/utah_coords.json     every status, including unresolved (gitignored)
//   data/geo/utah_geocoded.json   row dump (gitignored)
//   data/geo/utah_geocoded.csv    same rows as CSV (gitignored)
//
// User-Agent: SparkUtahBot/0.1 (+https://github.com/tibbittsjustin-jpg/Spraks-)
// Rate limit: at most one Nominatim request per second.
// An entry with locked:true is never overwritten. A confident pin whose override
// carries a source URL is locked and marked source "manual" so the hand-verified
// address survives the next run. To move one of those, set locked to false first.
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const GEO = path.join(ROOT, "data", "geo");
const CACHE = path.join(GEO, "geocode_cache.json");
const PUBLISHED = path.join(ROOT, "data", "coords", "utah.json");
const FULL = path.join(GEO, "utah_coords.json");
const UA = "SparkUtahBot/0.1 (+https://github.com/tibbittsjustin-jpg/Spraks-)";
const VIEWBOX = "-114.6,42.6,-108.5,36.5"; // a bit wider than Utah so Bear Lake/Idaho edges show
const BB = {minLat:37, maxLat:42, minLng:-114.05, maxLng:-109.04};
// out_of_state stays out of the published file. flagged and pending stay in,
// with null coordinates, so the hand-pin backlog is visible in the data.
const KEEP = new Set(["confident", "area_based", "route_unpinned", "flagged", "pending"]);

function readJson(p, fallback) {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : fallback;
}
function loadIdeas() {
  const src = fs.readFileSync(path.join(ROOT, "public", "data.js"), "utf8");
  const marker = "const IDEAS_DATA = ";
  const start = src.indexOf(marker);
  if (start !== 0 && !src.startsWith(marker)) throw new Error("IDEAS_DATA not found at the start of data.js");
  const lineEnd = src.indexOf("\n", start);
  const line = src.slice(start + marker.length, lineEnd < 0 ? src.length : lineEnd).replace(/;\s*$/, "");
  return JSON.parse(line);
}
// Full working file first, then any locked pin in the published file wins,
// so a hand edit to data/coords/utah.json is not clobbered by an older dump.
const prevCoords = readJson(FULL, {});
const publishedPrev = readJson(PUBLISHED, {});
for (const id of Object.keys(publishedPrev)) {
  if (publishedPrev[id].locked || prevCoords[id] == null) prevCoords[id] = publishedPrev[id];
}
const slice = loadIdeas();
const byId = Object.fromEntries(slice.map(d => [d.id, d]));
const map = readJson(path.join(GEO, "place_queries.json"), []).map(m => ({id:+m.id, h:m.h, place:m.place, city:m.city}));
const OV = readJson(path.join(GEO, "overrides.json"), {});
const cache = readJson(CACHE, {});
let net = 0, hits = 0, last = 0;
const norm = q => q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function search(q) {
  const k = norm(q);
  if (k in cache) { hits++; return cache[k].results; }
  const w = 1100 - (Date.now() - last); if (w > 0) await sleep(w); last = Date.now();
  const u = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams({q, format:"jsonv2", addressdetails:"1", countrycodes:"us", limit:"5", viewbox:VIEWBOX, bounded:"0"});
  net++;
  const r = await fetch(u, {headers:{"User-Agent":UA, "Accept-Language":"en"}});
  if (!r.ok) throw new Error("HTTP " + r.status + " for " + q);
  const results = await r.json();
  cache[k] = {query:q, fetchedAt:new Date().toISOString(), results};
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
  return results;
}
const STOP = new Set(["the", "at", "of", "and", "a", "on", "park", "state", "utah"]);
const BIZ_IDS = new Set([335, 339, 341, 348, 349, 337]);
const isBiz = (m, d) => d.category === "Local Provo/Utah County Business Dates" || BIZ_IDS.has(m.id);
const cityOf = r => { const a = r.address || {}; return [a.city, a.town, a.village, a.hamlet, a.suburb, a.county].filter(Boolean).map(x => x.toLowerCase()); };
const cnorm = x => (x || "").toLowerCase().replace(/ city$/, "").replace(/ canyon$/, "").trim();
// business city check: if OSM gives a municipality, it must match the hint; unincorporated results (no city/town/village) can't contradict it
const CENTERS = {};
async function center(hint) {
  if (hint in CENTERS) return CENTERS[hint];
  const res = await search(hint + ", Utah");
  const p = res.find(x => (x.category || x.class) === "place" || (x.category || x.class) === "boundary") || res[0];
  return CENTERS[hint] = p ? {lat:+p.lat, lon:+p.lon} : null;
}
const cityOK = (r, hint) => {
  const h = cnorm(hint.split(",")[0]);
  const a = r.address || {};
  const c = cnorm(a.city || a.town || a.village);
  if (!c) { const ce = CENTERS[hint]; return !!ce && km(ce, {lat:+r.lat, lon:+r.lon}) <= 20; }
  return c === h || r.display_name.toLowerCase().includes(", " + h + ",");
};
const toks = s => norm(s).split(" ").filter(t => t && !STOP.has(t));
function score(place, r) {
  const a = toks(place);
  const b = new Set(toks((r.name || "") + " " + r.display_name.split(",")[0]));
  if (!a.length) return 0;
  return a.filter(t => b.has(t) || [...b].some(x => x.startsWith(t) || t.startsWith(x))).length / a.length;
}
const inUT = r => {
  const la = +r.lat, lo = +r.lon;
  if (r.address && r.address.state && r.address.state !== "Utah") return false;
  return la >= BB.minLat && la <= BB.maxLat && lo >= BB.minLng && lo <= BB.maxLng;
};
const km = (a, b) => {
  const R = 6371, t = x => x * Math.PI / 180, dl = t(b.lat - a.lat), dg = t(b.lon - a.lon);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dg / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
(async () => {
  const out = [];
  for (const m of map) {
    const d = byId[m.id];
    if (!d || m.h === "X") continue;
    const ov = OV[m.id] || {};
    const row = {id:m.id, title:d.title, category:d.category, place:m.place, city_hint:m.city, query:"", status:"", display_name:"", address:ov.address || "", lat:"", lng:"", osm_class:"", osm_type:"", osm_id:"", address_source:ov.source || "", notes:ov.notes || ""};
    const prev = prevCoords[m.id];
    if (prev && prev.locked) {
      Object.assign(row, {status:prev.status, address:prev.address, lat:prev.lat, lng:prev.lng, notes:"LOCKED manual entry; " + (prev.notes || "")});
      row.locked = prev;
      out.push(row);
      continue;
    }
    if (m.h === "M") {
      row.status = /generic/.test(m.place) || ["puppy barn", "country dancing", "swing dancing", "roadside", "Salt Lake City bike rental"].includes(m.place) ? "area_based" : "route_unpinned";
      row.notes = row.status === "area_based" ? "generic venue type; use user's area at runtime" : "crawl/route/multi-stop: " + m.place;
      out.push(row);
      continue;
    }
    if (ov.status === "venue_closed" || (ov.status === "ambiguous" && !ov.variants)) { row.status = ov.status; out.push(row); continue; }
    const biz = isBiz(m, d);
    const state = m.h === "I" ? "" : ", Utah";
    const variants = ov.variants || [...new Set([m.city && m.city !== "Utah" ? `${m.place}, ${m.city}${/Idaho|Nevada/.test(m.city) ? "" : state}` : null, `${m.place}${m.h === "I" ? "" : ", Utah"}`, m.place].filter(Boolean))];
    let best = null, tried = [], cityMiss = null;
    for (const q of variants) {
      const res = await search(q);
      tried.push(q);
      const isAddrQ = /^\d/.test(q);
      let sc = res.map(r => ({r, s:isAddrQ ? 1 : score(m.place, r), ut:inUT(r), cls:(r.category || r.class) + "/" + r.type})).filter(x => m.h === "I" || x.ut);
      if (ov.accept) sc = sc.filter(x => ov.accept.includes(x.cls));
      if (biz && m.city !== "Utah") {
        await center(m.city);
        const bad = sc.filter(x => x.s >= 0.75 && !cityOK(x.r, m.city));
        if (bad.length && !cityMiss) cityMiss = bad[0];
        sc = sc.filter(x => cityOK(x.r, m.city));
      }
      sc.sort((a, b) => b.s - a.s || (+b.r.importance || 0) - (+a.r.importance || 0));
      if (sc.length && (!best || sc[0].s > best.top.s)) best = {q, top:sc[0], all:sc, addr:isAddrQ};
      if (best && best.top.s >= 0.75) break;
    }
    row.query = best ? best.q : tried.join(" || ");
    if (!best && cityMiss) {
      const r = cityMiss.r;
      Object.assign(row, {status:"ambiguous", query:tried.join(" || "), display_name:r.display_name, lat:(+r.lat).toFixed(6), lng:(+r.lon).toFixed(6), osm_class:r.category || r.class, osm_type:r.type, osm_id:r.osm_type + "/" + r.osm_id});
      row.notes = (row.notes ? row.notes + "; " : "") + "only match is outside hinted city " + m.city;
      out.push(row);
      continue;
    }
    if (!best) {
      row.status = m.h === "I" ? "out_of_state" : "not_found";
      row.notes = (row.notes ? row.notes + "; " : "") + (m.h === "I" ? "not in Utah; " : "") + "no in-bbox result for: " + tried.join(" || ");
      out.push(row);
      continue;
    }
    const r = best.top.r;
    Object.assign(row, {display_name:r.display_name, lat:(+r.lat).toFixed(6), lng:(+r.lon).toFixed(6), osm_class:r.category || r.class, osm_type:r.type, osm_id:r.osm_type + "/" + r.osm_id});
    const strong = best.all.filter(x => x.s >= 0.75);
    const spread = !best.addr && strong.some(x => km({lat:+r.lat, lon:+r.lon}, {lat:+x.r.lat, lon:+x.r.lon}) > 10);
    const cityLevel = !ov.accept && (row.osm_class === "place" || row.osm_class === "boundary") && best.top.s < 1;
    const add = t => row.notes = (row.notes ? row.notes + "; " : "") + t;
    if (m.h === "I") { row.status = "out_of_state"; add(`resolved outside Utah (match ${best.top.s.toFixed(2)})`); }
    else if (best.top.s < 0.75) { row.status = "ambiguous"; add(`weak name match (${best.top.s.toFixed(2)})`); }
    else if (cityLevel) { row.status = "ambiguous"; add("city/area-level only"); }
    else if (spread) { row.status = "ambiguous"; add(`${strong.length} strong matches >10km apart`); }
    else { row.status = "confident"; add(best.addr ? "matched verified street address" : `name match ${best.top.s.toFixed(2)}` + (tried.length > 1 ? `; variant ${tried.length}` : "") + (biz ? "; city verified" : "")); }
    out.push(row);
  }
  fs.mkdirSync(GEO, {recursive:true});
  fs.writeFileSync(path.join(GEO, "utah_geocoded.json"), JSON.stringify(out, null, 1));
  const now = new Date().toISOString();
  const coords = {};
  for (const r of out) {
    if (r.locked) { coords[r.id] = r.locked; delete r.locked; continue; }
    const prev = prevCoords[r.id];
    const sameFix = prev && prev.lat === (r.lat === "" ? null : +r.lat) && prev.status === r.status;
    const a = (() => { try { const c = cache[norm(r.query)]; const hit = c && c.results.find(x => x.osm_type + "/" + x.osm_id === r.osm_id); return hit ? hit.address : {}; } catch (e) { return {}; } })();
    coords[r.id] = {
      id:r.id,
      status:r.status,
      place:r.place,
      address:r.address || (r.display_name || null),
      lat:r.lat === "" ? null : +r.lat,
      lng:r.lng === "" ? null : +r.lng,
      city:a.city || a.town || a.village || (r.city_hint !== "Utah" ? r.city_hint : null),
      state:a.state || (r.status === "out_of_state" ? null : "Utah"),
      source:"nominatim",
      osm_type:r.osm_id ? r.osm_id.split("/")[0] : null,
      osm_id:r.osm_id ? +r.osm_id.split("/")[1] : null,
      osm_class_type:r.osm_class ? r.osm_class + "/" + r.osm_type : null,
      confidence:{confident:"high", ambiguous:"low", out_of_state:"high"}[r.status] || null,
      locked:false,
      resolvedAt:sameFix ? prev.resolvedAt : now,
      address_source:r.address_source || null,
      notes:r.notes
    };
    // Hand-verified street addresses carry a source URL. Lock those confident
    // pins and record source "manual" so a later run cannot move them.
    if (r.address_source && coords[r.id].status === "confident") {
      coords[r.id].locked = true;
      coords[r.id].source = "manual";
    }
  }
  fs.writeFileSync(FULL, JSON.stringify(coords, null, 1));
  const published = {};
  for (const id of Object.keys(coords)) {
    if (KEEP.has(coords[id].status)) published[id] = coords[id];
  }
  fs.mkdirSync(path.dirname(PUBLISHED), {recursive:true});
  fs.writeFileSync(PUBLISHED, JSON.stringify(published, null, 1) + "\n");
  const pq = map.map(m => Object.assign({}, m, OV[m.id] || {}));
  const cols = Object.keys(out[0]);
  const esc = v => `"${String(v).replace(/"/g, '""')}"`;
  fs.writeFileSync(path.join(GEO, "utah_geocoded.csv"), [cols.join(","), ...out.map(r => cols.map(c => esc(r[c])).join(","))].join("\n"));
  fs.writeFileSync(path.join(GEO, "place_queries.json"), JSON.stringify(pq, null, 1));
  const c = {};
  out.forEach(r => c[r.status] = (c[r.status] || 0) + 1);
  const publishedCounts = {};
  Object.values(published).forEach(r => publishedCounts[r.status] = (publishedCounts[r.status] || 0) + 1);
  console.log(JSON.stringify({rows:out.length, counts:c, published:Object.keys(published).length, published_counts:publishedCounts, network_calls:net, cache_hits:hits, cache_entries:Object.keys(cache).length}));
})().catch(e => { console.error(e); process.exit(1); });
