/* Radius map, pick a spot, licenses, and the no-tile fallback.
   Map tiles are not proxied. A picked spot is rounded before it leaves
   the device. Search uses only the GNIS and Census places we already have. */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const radiusMap = require("../public/radius-map");
const placeSearch = require("../public/place-search");
const mapConfig = require("../public/map-config");
const licensesPage = require("../public/licenses-page");
const { loadApp } = require("./harness");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
function section(title, fn) {
  console.log("\n" + title);
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.catch(e => {
        check("section ran without throwing", false, String(e.stack || e.message).slice(0, 500));
      });
    }
  } catch (e) {
    check("section ran without throwing", false, String(e.stack || e.message).slice(0, 500));
  }
}

const ROOT = path.join(__dirname, "..");
const PRECISE_LAT = 40.233843;
const PRECISE_LNG = -111.658531;
const CORNER = "Basemap: U.S. Geological Survey, The National Map";
const CREDITS = "Map rendering: MapLibre GL JS (BSD-3-Clause), © MapLibre contributors; includes code © 2020 Mapbox (BSD-3-Clause).";
const USGS_TILE = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}";
const FALLBACK = "The map didn't load. Search and the radius still work.";

function walk(node, acc) {
  acc = acc || [];
  if (!node || typeof node !== "object") return acc;
  acc.push(node);
  (node.children || []).forEach(child => walk(child, acc));
  return acc;
}
function attr(node, name) {
  return node && node.getAttribute ? node.getAttribute(name) : null;
}
function installGeo(t) {
  const calls = [];
  t.navigator.geolocation = {
    getCurrentPosition(success, error, options) {
      calls.push({ success: success, error: error, options: options });
    }
  };
  return calls;
}
function decodePre(html) {
  const match = String(html || "").match(/<pre id="maplibre-license">([\s\S]*?)<\/pre>/);
  if (!match) return "";
  return match[1].replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
}
function request(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ port: port, path: urlPath }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    }).on("error", reject);
  });
}
function listJs(dir, acc) {
  acc = acc || [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "vendor" || entry.name === "node_modules") return;
      listJs(full, acc);
      return;
    }
    if (entry.name.endsWith(".js")) acc.push(full);
  });
  return acc;
}

section("the circle follows the radius", () => {
  const center = { lat: 40.2338, lng: -111.6585 };
  const near = radiusMap.haversineMeters(center, {
    lat: radiusMap.circleRing(center, 10)[0][1],
    lng: radiusMap.circleRing(center, 10)[0][0]
  });
  const far = radiusMap.haversineMeters(center, {
    lat: radiusMap.circleRing(center, 50)[0][1],
    lng: radiusMap.circleRing(center, 50)[0][0]
  });
  check("10 miles is the circle's own radius", Math.abs(near - radiusMap.circleRadiusMeters(10)) < 1, String(near));
  check("50 miles is the circle's own radius", Math.abs(far - radiusMap.circleRadiusMeters(50)) < 1, String(far));
  check("a wider slider draws a wider circle", far > near * 4);
  check("the blank-map circle grows with the slider",
    radiusMap.fallbackRadiusPx(50) > radiusMap.fallbackRadiusPx(10) &&
    radiusMap.fallbackRadiusPx(1) < radiusMap.fallbackRadiusPx(10));

  const t = loadApp({});
  t.state.location = { lat: center.lat, lng: center.lng, mode: "approximate", stale: false };
  t.state.filters.radiusMiles = 10;
  t.state.filters.localOnly = false;
  const screen = t.buildDiscoverScreen();
  const nodes = walk(screen);
  const panel = nodes.filter(node => node.className === "radius-map-panel")[0];
  const circle = nodes.filter(node => node.tagName === "CIRCLE" || (node.getAttribute && node.getAttribute("cx") === "100"))[0];
  check("the map panel is on Discover", !!panel);
  const r10 = circle ? Number(attr(circle, "r")) : 0;
  check("the drawn circle starts at 10 miles",
    t.radiusMapHandle.radiusMiles() === 10 && attr(panel, "data-radius-miles") === "10" && r10 > 0);
  const next = t.setDiscoverRadius(50);
  check("moving the slider to 50 updates the circle",
    next === 50 &&
    t.state.filters.radiusMiles === 50 &&
    t.radiusMapHandle.radiusMiles() === 50 &&
    attr(panel, "data-radius-miles") === "50" &&
    Number(attr(circle, "r")) > r10);
});

section("map corner credit and the no-tile state", () => {
  check("the corner credit is Legal's shorter line", mapConfig.MAP_CORNER_CREDIT === CORNER && radiusMap.MAP_CORNER_CREDIT === CORNER);
  const t = loadApp({});
  t.openPickMode();
  const screen = t.buildDiscoverScreen();
  const nodes = walk(screen);
  const panel = nodes.filter(node => node.className === "radius-map-panel")[0];
  const credit = nodes.filter(node => node.className === "radius-map-credit")[0];
  const note = nodes.filter(node => node.className === "radius-map-note")[0];
  const query = nodes.filter(node => node.className && String(node.className).indexOf("radius-map-query") !== -1)[0];
  const pin = nodes.filter(node => node.className === "radius-map-pin")[0];
  check("without MapLibre the panel says the map didn't load",
    attr(panel, "data-tiles") === "off" && note && note.textContent === FALLBACK);
  check("the fallback still has a circle, a pin, and search",
    nodes.some(node => attr(node, "cx") === "100") && pin && query && attr(panel, "data-search") === "open");
  check("the corner credit links to Sources and is not a logo",
    credit && credit.textContent === CORNER && attr(credit, "href") === "/sources" &&
    nodes.every(node => String(node.tagName || "").toLowerCase() !== "img" || String(node.className || "").indexOf("radius-map") === -1));
  const hits = t.radiusMapHandle.runSearch("provo");
  check("search still returns a census place when tiles are off",
    hits[0] && hits[0].name === "Provo" && hits[0].source === "census");
  check("the Protomaps fallback hook is present and unused",
    mapConfig.protomapsPmtilesUrl == null &&
    mapConfig.protomapsFallbackStyle() == null &&
    fs.readFileSync(path.join(ROOT, "public/map-config.js"), "utf8").indexOf("protomapsFallbackStyle") !== -1);
  const style = radiusMap.basemapStyle();
  check("the only basemap is the USGSTopo tile template",
    style.sources.usgs.tiles.length === 1 && style.sources.usgs.tiles[0] === USGS_TILE && style.sources.usgs.tileSize === 256);
  const styleText = JSON.stringify(style);
  ["mapbox", "openstreetmap", "googleapis", "maptiler", "stadiamaps", "apple"].forEach(name => {
    check("the style does not name " + name, styleText.toLowerCase().indexOf(name) === -1);
  });
});

section("place search is GNIS and Census only", () => {
  const provo = placeSearch.searchPlaces("provo");
  check("Provo is the census center",
    provo[0].name === "Provo" && provo[0].source === "census" &&
    provo[0].lat === 40.24573 && provo[0].lng === -111.64572);
  check("a canyon that starts with Provo is a separate GNIS place",
    provo.some(place => place.name === "Provo Canyon" && place.source === "gnis"));
  const stewart = placeSearch.searchPlaces("stewart");
  check("Stewart Falls comes from GNIS",
    stewart.length === 1 && stewart[0].name === "Stewart Falls" && stewart[0].source === "gnis");
  check("Salt Lake City is not in this list", placeSearch.searchPlaces("salt lake").length === 0);
  check("an empty or one-letter query returns nothing",
    placeSearch.searchPlaces("").length === 0 && placeSearch.searchPlaces("p").length === 0);
  const bad = placeSearch.PLACES.filter(place => place.source !== "census" && place.source !== "gnis");
  check("every stored place is census or gnis", bad.length === 0 && placeSearch.PLACES.length > 10);
  const src = fs.readFileSync(path.join(ROOT, "public/place-search.js"), "utf8");
  ["nominatim", "openstreetmap", "googleapis", "mapbox", "fetch(", "tile.openstreetmap"].forEach(needle => {
    check("place search does not mention " + needle, src.toLowerCase().indexOf(needle) === -1);
  });
});

section("a tap coordinate is only the projection", () => {
  const coord = radiusMap.coordinateFromProjection({
    lat: PRECISE_LAT,
    lng: PRECISE_LNG,
    features: [{ name: "from a tile" }],
    properties: { name: "label" }
  });
  check("the projection result keeps lat and lng",
    coord.lat === PRECISE_LAT && coord.lng === PRECISE_LNG);
  check("tile fields are not part of the coordinate",
    Object.keys(coord).sort().join(",") === "lat,lng");
  check("a missing projection is ignored", radiusMap.coordinateFromProjection(null) === null);
});

section("picked spot, rounding, clear, and share links", () => {
  const t = loadApp({});
  t.state.filters.localOnly = false;
  t.state.filters.radiusMiles = 10;
  t.applyPickedSpot({ lat: 40.2338, lng: -111.6585, name: "Provo" }, "Provo");
  check("the picked spot is the saved center",
    t.state.location.mode === "picked" && t.state.location.label === "Provo" && t.state.locationMode === "approximate");
  check("the deck measures from the picked spot",
    t.matchesFilters(t.IDEAS_BY_ID[1854], t.state.filters) === true &&
    t.matchesFilters(t.IDEAS_BY_ID[187], t.state.filters) === false);
  const tonight = Object.assign({}, t.state.filters, { tonight: true });
  check("Tonight uses the same picked center",
    t.matchesFilters(t.IDEAS_BY_ID[187], tonight) === false);
  check("the status names the place and not the coordinates",
    t.locationStatusText() === "Picked spot, Provo. Saved on this device." &&
    t.locationStatusText().indexOf("40.2338") === -1);
  check("clear location removes the picked spot", t.state.location !== null);
  t.clearLocation();
  check("clear forgets the spot and exact mode",
    t.state.location === null && t.state.locationMode === "approximate" && t.pickMode === false &&
    t.locationStatusText().indexOf("Picked") === -1);

  const kept = loadApp({
    spark_state_v1: JSON.stringify({
      locationMode: "approximate",
      location: { lat: PRECISE_LAT, lng: PRECISE_LNG, mode: "picked", label: "Provo" }
    })
  });
  check("a saved pick reloads as a pick, not a stale GPS fix",
    kept.state.location.mode === "picked" && kept.state.location.stale === false &&
    kept.state.location.lat === PRECISE_LAT && kept.savedCenterIsPicked() === true);
  const calls = installGeo(kept);
  kept.enterApp();
  check("opening does not replace a picked spot with GPS",
    calls.length === 0 && kept.state.location.lat === PRECISE_LAT && kept.state.location.mode === "picked");
});

async function main() {
  await section("activities requests and share links stay rounded", async () => {
    const t = loadApp({});
    const urls = [];
    const bodies = [];
    t.setFetch(function (url, options) {
      urls.push(String(url));
      if (options && options.body != null) bodies.push(String(options.body));
      if (String(url).indexOf("/api/status") !== -1) {
        return Promise.resolve({
          ok: true,
          json: function () { return Promise.resolve({ placesConfigured: false, aiConfigured: false, offline: false }); }
        });
      }
      return Promise.resolve({
        ok: true,
        json: function () { return Promise.resolve({ items: [], nextCursor: null }); }
      });
    });
    const logs = [];
    const methods = ["log", "info", "warn", "error", "debug"];
    const orig = {};
    methods.forEach(method => {
      orig[method] = console[method];
      console[method] = function () {
        logs.push(Array.prototype.join.call(arguments, " "));
        orig[method].apply(console, arguments);
      };
    });
    let share = "";
    try {
      t.state.filters.radiusMiles = 25;
      t.state.filters.localOnly = false;
      t.buildDiscoverScreen();
      t.radiusMapHandle.runSearch("provo");
      t.applyPickedSpot({ lat: PRECISE_LAT, lng: PRECISE_LNG }, "");
      for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve));
      share = t.planShareUrl({
        name: "Friday",
        date: "2026-06-05",
        ideaIds: [2],
        lat: PRECISE_LAT,
        lng: PRECISE_LNG,
        origin: { lat: PRECISE_LAT, lng: PRECISE_LNG }
      });
    } finally {
      methods.forEach(method => { console[method] = orig[method]; });
    }
    const activity = urls.filter(url => url.indexOf("/api/activities") !== -1);
    const wire = urls.join("\n") + "\n" + bodies.join("\n");
    check("a picked spot asks for activities", activity.length >= 1, urls.join(" | "));
    activity.forEach(url => {
      const query = new URL(url, "http://local");
      check("the activities latitude is rounded to 2 decimals", query.searchParams.get("lat") === "40.23", url);
      check("the activities longitude is rounded to 2 decimals", query.searchParams.get("lng") === "-111.66", url);
      check("the slider radius goes with the picked spot", query.searchParams.get("radiusMiles") === "25", url);
    });
    check("no request carries the unrounded coordinates",
      wire.indexOf(String(PRECISE_LAT)) === -1 && wire.indexOf(String(PRECISE_LNG)) === -1, wire.slice(0, 500));
    check("logs do not contain the coordinates",
      logs.join("\n").indexOf(String(PRECISE_LAT)) === -1 && logs.join("\n").indexOf(String(PRECISE_LNG)) === -1);
    check("a shared plan link has no origin",
      share.indexOf(String(PRECISE_LAT)) === -1 && share.indexOf(String(PRECISE_LNG)) === -1 &&
      share.indexOf("lat=") === -1 && share.indexOf("lng=") === -1, share);
  });

  await section("licenses page and shipped MapLibre", async () => {
    const licensePath = path.join(ROOT, "public/vendor/maplibre/LICENSE.txt");
    const jsPath = path.join(ROOT, "public/vendor/maplibre/maplibre-gl.js");
    const licenseText = fs.readFileSync(licensePath, "utf8");
    const header = fs.readFileSync(jsPath, "utf8").slice(0, 240);
    const pkg = require(path.join(ROOT, "node_modules/maplibre-gl/package.json"));
    check("MapLibre is v5.24.0 BSD-3", pkg.version === "5.24.0" && pkg.license === "BSD-3-Clause");
    check("the shipped JS keeps its header comment",
      header.indexOf("MapLibre GL JS") !== -1 &&
      header.indexOf("v5.24.0") !== -1 &&
      header.indexOf("3-Clause BSD") !== -1);
    check("the shipped JS matches the package build",
      fs.readFileSync(jsPath).equals(fs.readFileSync(path.join(ROOT, "node_modules/maplibre-gl/dist/maplibre-gl.js"))));
    check("the shipped license matches the package",
      licenseText === fs.readFileSync(path.join(ROOT, "node_modules/maplibre-gl/LICENSE.txt"), "utf8"));
    check("the credits line is Legal's sentence", licensesPage.CREDITS_LINE === CREDITS);

    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";
    delete require.cache[require.resolve("../server")];
    const app = require("../server");
    const server = await new Promise(resolve => {
      const listening = app.listen(0, () => resolve(listening));
    });
    try {
      const page = await request(server.address().port, "/licenses");
      check("/licenses is 200", page.status === 200, String(page.status));
      check("the page shows the credits line", page.body.indexOf(CREDITS) !== -1);
      check("the page shows LICENSE.txt verbatim", decodePre(page.body) === licenseText, decodePre(page.body).slice(0, 80));
      const home = await request(server.address().port, "/");
      check("settings and the footer link to licenses",
        home.status === 200 &&
        home.body.indexOf('data-action="licenses"') !== -1 &&
        home.body.indexOf('href="/licenses"') !== -1 &&
        home.body.indexOf('src="vendor/maplibre/maplibre-gl.js"') !== -1 &&
        home.body.indexOf("jsdelivr") === -1 &&
        home.body.indexOf("unpkg.com") === -1 &&
        home.body.toLowerCase().indexOf("mapbox-gl") === -1);
      check("the privacy draft is not on the site",
        home.body.indexOf("privacy-location-maps-draft") === -1 &&
        home.body.indexOf("DRAFT FOR ATTORNEY REVIEW") === -1);
    } finally {
      if (previous == null) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
      await new Promise(resolve => server.close(resolve));
    }
  });

  section("tile reads and tile proxying stay out", () => {
    const files = listJs(path.join(ROOT, "public")).concat(listJs(path.join(ROOT, "routes")));
    files.push(path.join(ROOT, "server.js"));
    const hits = [];
    files.forEach(file => {
      const text = fs.readFileSync(file, "utf8");
      if (text.indexOf("queryRenderedFeatures") !== -1) hits.push(path.relative(ROOT, file));
    });
    check("queryRenderedFeatures is never called", hits.length === 0, hits.join(", "));
    const server = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
    const mapSrc = fs.readFileSync(path.join(ROOT, "public/radius-map.js"), "utf8");
    check("the server does not proxy USGS tiles", server.indexOf("basemap.nationalmap.gov") === -1);
    check("the map module does not prefetch tiles or register a worker",
      mapSrc.indexOf("prefetch") === -1 && mapSrc.indexOf("serviceWorker") === -1 && mapSrc.indexOf("fetch(") === -1);
    const draft = fs.readFileSync(path.join(ROOT, "legal/privacy-location-maps-draft.md"), "utf8");
    check("the privacy draft is marked for attorney review",
      draft.indexOf("# DRAFT FOR ATTORNEY REVIEW. NOT LEGAL ADVICE.") === 0 &&
      draft.indexOf("We use your approximate location, or a spot you pick, to show activities within the radius you choose. We don't store your exact location on our servers.") !== -1 &&
      draft.indexOf("U.S. Geological Survey's National Map") !== -1);
    const published = files.some(file => fs.readFileSync(file, "utf8").indexOf("privacy-location-maps-draft") !== -1);
    check("the draft is not referenced by the app or the server", published === false);
  });
}

module.exports = main().then(() => ({ pass: pass, fail: fail }));
