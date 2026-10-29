#!/usr/bin/env node
// Hand-pin pass for the Utah slice. Nominatim only, shared cache, <=1 req/s,
// same User-Agent as scripts/geocode-utah.js.
//
// From the repo root:
//   node scripts/pin_utah.js
//
// Reads:
//   data/geo/hand_pins_src.json   per-idea source URL, query, flag, or copied pin
//   data/geo/geocode_cache.json   shared Nominatim cache (a hit makes no network call)
//   data/coords/utah.json         published pins; locked:true is copied through
//   data/geo/utah_coords.json     full working file, if present (gitignored)
//   data/geo/utah_geocoded.json   geocoder row dump, if present (gitignored)
//
// Writes:
//   data/geo/hand_pins.json       just the hand pins
//   data/coords/utah.json         published file (confident, area_based, route_unpinned,
//                                 flagged, pending). Drops out_of_state and retired.
//   data/geo/utah_coords.json     full working file, including statuses the publish step drops
//   data/geo/geocode_cache.json   updated only when a query was not cached
//
// An entry with locked:true is never overwritten. Set locked to false before
// rerunning if you mean to move one.
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const GEO = path.join(ROOT, "data", "geo");
const PUBLISHED = path.join(ROOT, "data", "coords", "utah.json");
const FULL = path.join(GEO, "utah_coords.json");
const CACHE_PATH = path.join(GEO, "geocode_cache.json");
const SRC_PATH = path.join(GEO, "hand_pins_src.json");
const UA = "SparkUtahBot/0.1 (+https://github.com/tibbittsjustin-jpg/Spraks-)";
const KEEP = new Set(["confident", "area_based", "route_unpinned", "flagged", "pending"]);

function readJson(p, fallback) {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : fallback;
}
const cache = readJson(CACHE_PATH, {});
const norm = q => q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
let last = 0, net = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function search(q) {
  const k = norm(q);
  if (k in cache) return cache[k].results;
  const w = 1100 - (Date.now() - last);
  if (w > 0) await sleep(w);
  last = Date.now();
  net++;
  const u = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams({q, format:"jsonv2", addressdetails:"1", countrycodes:"us", limit:"5", viewbox:"-114.6,42.6,-108.5,36.5", bounded:"0"});
  const r = await fetch(u, {headers:{"User-Agent":UA, "Accept-Language":"en"}});
  if (!r.ok) throw new Error(r.status + " " + q);
  const res = await r.json();
  cache[k] = {query:q, fetchedAt:new Date().toISOString(), results:res};
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 1));
  return res;
}
const inUT = (la, ln) => la >= 37 && la <= 42 && ln >= -114.05 && ln <= -109.04;
const km = (a, b, c, d) => {
  const R = 6371, t = x => x * Math.PI / 180;
  const h = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const src = readJson(SRC_PATH, {});
// Full working file first; a locked pin in the published file wins, so a hand
// edit to data/coords/utah.json is not clobbered by an older dump.
const coords = readJson(FULL, {});
const publishedPrev = readJson(PUBLISHED, {});
for (const id of Object.keys(publishedPrev)) {
  if (publishedPrev[id].locked || coords[id] == null) coords[id] = publishedPrev[id];
}
const geoRows = readJson(path.join(GEO, "utah_geocoded.json"), []);
const G = Object.fromEntries(geoRows.map(r => [r.id, r]));
for (const id of Object.keys(coords)) {
  const r = coords[id];
  if (r && r.lat != null && !G[r.id]) G[r.id] = {id:r.id, lat:r.lat, lng:r.lng, osm_type:r.osm_type, osm_id:r.osm_id};
}

(async () => {
  const out = {};
  const now = new Date().toISOString();
  for (const id of Object.keys(src)) {
    const s = src[id];
    const prev = coords[id] || {};
    if (prev.locked) { out[id] = {...prev, id:+id}; continue; }
    if (s.same) continue;
    const base = {...prev, id:+id, place:s.place || prev.place, state:"UT", source:"manual", locked:true, resolvedAt:now, source_url:s.url, address_source:"manual"};
    if (s.flag) { out[id] = {...base, status:"flagged", lat:null, lng:null, address:null, osm_type:null, osm_id:null, confidence:null, notes:s.flag}; continue; }
    let la, ln, osm = null, addr = s.address || null;
    if (s.ll) { [la, ln] = s.ll; }
    else if (typeof s.from === "number") {
      const r = G[s.from];
      if (!r) throw new Error("pin " + id + " copies id " + s.from + " but that row has no coordinates");
      la = +r.lat; ln = +r.lng; osm = r.osm_type && {t:r.osm_type, i:r.osm_id};
    } else {
      let res = [];
      const qs = s.q || [];
      for (const q of qs) { res = (await search(q)).filter(x => (x.address || {}).state === "Utah"); if (res.length) break; }
      if (!res.length && s.from) res = cache[s.from.slice(6)].results;
      if (!res.length && s.fallback) res = cache[s.fallback.slice(6)].results;
      if (s.from && !s.q) res = cache[s.from.slice(6)].results;
      if (s.osmpick) res = res.filter(x => (x.address || {}).county && x.address.county.includes(s.osmpick));
      const r = res[0];
      if (!r) { out[id] = {...base, status:"flagged", lat:null, lng:null, notes:"Verified source but Nominatim couldn't geocode it: " + (s.address || s.place)}; continue; }
      la = +r.lat; ln = +r.lon; osm = {t:r.osm_type, i:r.osm_id}; if (!addr) addr = r.display_name; base.geo_display = r.display_name;
    }
    const c = s.near ? (await search(s.near + ", Utah")).find(x => (x.address || {}).state === "Utah") : null;
    const d = c ? km(la, ln, +c.lat, +c.lon) : null;
    const ok = inUT(la, ln);
    out[id] = {...base, status:ok ? "confident" : "flagged", lat:la, lng:ln, address:addr, city:s.near, osm_type:osm && osm.t, osm_id:osm && osm.i, confidence:"manual", km_from_hint:d && +d.toFixed(1), notes:(s.notes || "") + (ok ? "" : " OUT OF UTAH BBOX")};
  }
  for (const id of Object.keys(src)) {
    if (!src[id].same || (out[id] && out[id].locked)) continue;
    out[id] = {...out[src[id].same], id:+id};
  }
  fs.mkdirSync(GEO, {recursive:true});
  fs.writeFileSync(path.join(GEO, "hand_pins.json"), JSON.stringify(out, null, 1) + "\n");
  for (const id in out) {
    if (coords[id] && coords[id].locked) continue;
    coords[id] = out[id];
  }
  if (coords[340]) coords[340] = {...coords[340], status:"retired", locked:true, notes:"Trafalga retired; removed from the catalog"};
  fs.writeFileSync(FULL, JSON.stringify(coords, null, 1));
  const published = {};
  for (const id of Object.keys(coords)) {
    if (String(id) === "340") continue;
    if (KEEP.has(coords[id].status)) published[id] = coords[id];
  }
  fs.mkdirSync(path.dirname(PUBLISHED), {recursive:true});
  fs.writeFileSync(PUBLISHED, JSON.stringify(published, null, 1) + "\n");
  const t = {};
  for (const v of Object.values(published)) t[v.status] = (t[v.status] || 0) + 1;
  console.log(JSON.stringify({net, published:Object.keys(published).length, published_counts:t, hand_pins:Object.keys(out).length}));
})().catch(e => { console.error(e); process.exit(1); });
