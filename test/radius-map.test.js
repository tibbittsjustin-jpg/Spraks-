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
const CORNER = "Map services and data available from U.S. Geological Survey, National Geospatial Program.";
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
  const discover = t.buildDiscoverScreen();
  check("Discover has no map above Filters",
    !walk(discover).some(node => node.className === "radius-map-panel" || node.className === "radius-map-slot" || node.id === "radius-map-slot"));
  t.ui.filterDraft = Object.assign({}, t.state.filters);
  const group = t.buildWhereGroup();
  const nodes = walk(group);
  const panel = nodes.filter(node => node.className === "radius-map-panel")[0];
  const circle = nodes.filter(node => node.tagName === "CIRCLE" || (node.getAttribute && node.getAttribute("cx") === "100"))[0];
  const stage = nodes.filter(node => node.className === "radius-map-stage")[0];
  check("the map panel is in Filters", !!panel && nodes.some(node => node.className === "choose-spot"));
  const r10 = circle ? Number(attr(circle, "r")) : 0;
  check("the drawn circle starts at 10 miles",
    t.radiusMapHandle.radiusMiles() === 10 && attr(panel, "data-radius-miles") === "10" && r10 > 0);
  check("without tiles the empty stage stays hidden", stage && stage.hidden === true);
  const next = t.setDiscoverRadius(50);
  check("moving the slider to 50 updates the circle",
    next === 50 &&
    t.state.filters.radiusMiles === 50 &&
    t.radiusMapHandle.radiusMiles() === 50 &&
    attr(panel, "data-radius-miles") === "50" &&
    Number(attr(circle, "r")) > r10);
});

function attribEl(tag) {
  const attrs = Object.create(null);
  const classes = new Set();
  const children = [];
  const el = {
    tagName: String(tag).toUpperCase(),
    children,
    style: {},
    attributes: [],
    classList: {
      contains(name) { return classes.has(name); },
      add() { for (let i = 0; i < arguments.length; i++) classes.add(arguments[i]); },
      remove() { for (let i = 0; i < arguments.length; i++) classes.delete(arguments[i]); }
    },
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    removeAttribute(name) { delete attrs[name]; },
    appendChild(child) { children.push(child); return child; },
    addEventListener() {},
    remove() {},
    querySelectorAll() { return []; }
  };
  Object.defineProperty(el, "className", {
    get() { return Array.from(classes).join(" "); },
    set(value) {
      classes.clear();
      String(value || "").split(/\s+/).filter(Boolean).forEach(name => classes.add(name));
    }
  });
  Object.defineProperty(el, "innerHTML", {
    get() { return el._html || ""; },
    set(value) { el._html = String(value); }
  });
  return el;
}

function installMapLibreDom() {
  if (!installMapLibreDom.saved) {
    installMapLibreDom.saved = {
      window: global.window,
      document: global.document,
      Blob: global.Blob,
      DOMParser: global.DOMParser
    };
  }
  const doc = {
    createElement: attribEl,
    documentElement: attribEl("html"),
    body: attribEl("body")
  };
  global.window = {
    document: doc,
    addEventListener() {},
    removeEventListener() {},
    URL: { createObjectURL() { return "blob:maplibre-test"; } }
  };
  global.document = doc;
  global.Blob = global.Blob || function Blob() {};
  global.DOMParser = function DOMParser() {};
  global.DOMParser.prototype.parseFromString = function (html) {
    const body = attribEl("body");
    body.innerHTML = String(html || "");
    return { body: body };
  };
}

function attributionMap(width) {
  return {
    style: { stylesheet: {}, tileManagers: {} },
    _getUIString() { return "Toggle attribution"; },
    getCanvasContainer() { return { offsetWidth: width }; },
    on() {},
    off() {}
  };
}

section("map corner credit and the no-tile state", () => {
  check("the corner credit is the USGS acknowledgement sentence",
    mapConfig.MAP_CORNER_CREDIT === CORNER && radiusMap.MAP_CORNER_CREDIT === CORNER);
  const options = radiusMap.attributionOptions();
  check("the attribution control is only that sentence, linked to Sources",
    options.customAttribution === '<a href="/sources">' + CORNER + "</a>" &&
    options.customAttribution.indexOf("endorses") === -1 &&
    options.customAttribution.indexOf("Basemap:") === -1 &&
    options.customAttribution.toLowerCase().indexOf("logo") === -1);
  const t = loadApp({});
  const discover = t.buildDiscoverScreen();
  check("a closed Filters sheet leaves Discover without a map",
    !walk(discover).some(node => node.className === "radius-map-panel" || node.id === "radius-map-slot"));
  t.openPickMode();
  const panel = t.radiusMapHandle && t.radiusMapHandle.element;
  const nodes = walk(panel);
  const credit = nodes.filter(node => node.className === "radius-map-credit")[0];
  const note = nodes.filter(node => node.className === "radius-map-note")[0];
  const query = nodes.filter(node => node.className && String(node.className).indexOf("radius-map-query") !== -1)[0];
  const stage = nodes.filter(node => node.className === "radius-map-stage")[0];
  const search = nodes.filter(node => node.className === "radius-map-search")[0];
  check("opening Filters is what shows the chooser", t.filterSheetOpen === true && !!panel);
  check("without MapLibre the panel says the map didn't load",
    attr(panel, "data-tiles") === "off" && note && note.textContent === FALLBACK);
  check("the fallback keeps search and hides the empty stage",
    query && search && search.hidden !== true && stage && stage.hidden === true && attr(panel, "data-search") === "open");
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

section("compact attribution toggle", () => {
  installMapLibreDom();
  const maplibre = require("maplibre-gl");
  const narrow = new maplibre.AttributionControl(radiusMap.attributionOptions());
  const collapsed = narrow.onAdd(attributionMap(320));
  const inner = collapsed.children.filter(node => node.className === "maplibregl-ctrl-attrib-inner")[0];
  const button = collapsed.children.filter(node => node.className === "maplibregl-ctrl-attrib-button")[0];
  check("a narrow map uses the compact (i) control",
    collapsed.className.indexOf("maplibregl-compact") !== -1 && !!button);
  check("the compact control holds the full USGS sentence",
    inner && inner.innerHTML === '<a href="/sources">' + CORNER + "</a>");
  const shownBefore = collapsed.className.indexOf("maplibregl-compact-show") !== -1;
  narrow._toggleAttribution();
  const shownAfter = collapsed.className.indexOf("maplibregl-compact-show") !== -1;
  check("the (i) toggle changes whether the sentence is expanded",
    shownBefore !== shownAfter && inner.innerHTML.indexOf(CORNER) !== -1);
  narrow._toggleAttribution();
  check("toggling again restores the previous compact state",
    (collapsed.className.indexOf("maplibregl-compact-show") !== -1) === shownBefore);

  const wideCtrl = new maplibre.AttributionControl(radiusMap.attributionOptions());
  const wide = wideCtrl.onAdd(attributionMap(800));
  const wideInner = wide.children.filter(node => node.className === "maplibregl-ctrl-attrib-inner")[0];
  check("a wide map shows the sentence without the compact toggle",
    wide.className.indexOf("maplibregl-compact") === -1 &&
    wide.getAttribute("open") === "" &&
    wideInner.innerHTML === '<a href="/sources">' + CORNER + "</a>");
  const saved = installMapLibreDom.saved;
  if (saved.window === undefined) delete global.window;
  else global.window = saved.window;
  if (saved.document === undefined) delete global.document;
  else global.document = saved.document;
  if (saved.Blob === undefined) delete global.Blob;
  else global.Blob = saved.Blob;
  if (saved.DOMParser === undefined) delete global.DOMParser;
  else global.DOMParser = saved.DOMParser;
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

section("blocked location still chooses a spot in Filters", () => {
  const t = loadApp({});
  const calls = installGeo(t);
  t.requestLocation({ silent: true });
  calls[0].error({ code: 1, message: "denied" });
  check("the blocked message stays on the location bar",
    t.locationStatusText().indexOf("Location is blocked in this browser") !== -1);
  const bar = walk(t.buildLocationBar()).map(node => [node.textContent, node.innerHTML, node.className].join("\n")).join("\n");
  check("Use my exact location stays available", bar.indexOf("Use my exact location") !== -1);
  check("the map picker is not on the Discover location bar",
    bar.indexOf("Pick a spot") === -1 && bar.indexOf("radius-map") === -1);
  t.ui.filterDraft = Object.assign({}, t.state.filters, { localOnly: false, radiusMiles: 10 });
  const group = t.buildWhereGroup();
  const nodes = walk(group);
  const query = nodes.filter(node => node.className && String(node.className).indexOf("radius-map-query") !== -1)[0];
  const note = nodes.filter(node => node.className === "radius-map-note")[0];
  const stage = nodes.filter(node => node.className === "radius-map-stage")[0];
  const status = nodes.filter(node => node.className === "choose-spot-status")[0];
  check("Filters still offers place search", !!query && query.disabled !== true);
  check("Filters repeats the blocked message without an empty map box",
    status && status.textContent.indexOf("Location is blocked") !== -1 &&
    note && note.textContent === FALLBACK &&
    stage && stage.hidden === true);
  check("a blocked fix does not remove How far's absence until a spot exists",
    !nodes.some(node => node.className === "how-far"));
  t.applyPickedSpot({ lat: 40.2338, lng: -111.6585, name: "Provo" }, "Provo");
  check("picking a spot still wins after a block",
    t.state.location.mode === "picked" && t.state.location.label === "Provo" && t.locationPhase === "ready");
});

section("Filters can close and open again", () => {
  const t = loadApp({});
  t.openFilterOverlay();
  const first = t.radiusMapHandle;
  check("the first open mounts a chooser", !!first && first.tilesState() === "off");
  t.closeFilterOverlay();
  const discover = t.buildDiscoverScreen();
  check("closing Filters removes the map from Discover",
    t.filterSheetOpen === false && t.radiusMapHandle === null &&
    !walk(discover).some(node => node.className === "radius-map-panel"));
  t.openFilterOverlay();
  check("opening again mounts a new chooser",
    !!t.radiusMapHandle && t.radiusMapHandle !== first && t.radiusMapHandle.element !== first.element);
  const sliderNodes = walk(t.buildWhereGroup()).filter(node => node.className && String(node.className).indexOf("radius-slider-panel") !== -1);
  t.state.location = { lat: 40.2338, lng: -111.6585, mode: "approximate", stale: false };
  t.ui.filterDraft = Object.assign({}, t.state.filters, { localOnly: false, radiusMiles: 10 });
  const located = t.buildWhereGroup();
  const slider = walk(located).filter(node => node.className && String(node.className).indexOf("radius-slider-panel") !== -1)[0];
  check("a fix still shows the radius slider beside the map", !!slider && sliderNodes);
  if (slider && slider._listeners && slider._listeners.input && slider._listeners.input[0]) {
    slider.value = "1000";
    slider._listeners.input[0]();
    check("the filter slider moves the radius circle", t.radiusMapHandle.radiusMiles() === 50);
  } else {
    check("the filter slider moves the radius circle", false, "no input listener");
  }
});

function miniMapDocument() {
  function node(tag) {
    const attrs = Object.create(null);
    const children = [];
    const el = {
      tagName: String(tag).toUpperCase(),
      children,
      style: {},
      clientWidth: 320,
      offsetWidth: 320,
      clientHeight: 220,
      offsetHeight: 220,
      hidden: false,
      appendChild(child) { children.push(child); return child; },
      setAttribute(name, value) { attrs[name] = String(value); },
      getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
      addEventListener() {},
      removeEventListener() {},
      querySelectorAll() { return []; }
    };
    Object.defineProperty(el, "className", {
      get() { return el._class || ""; },
      set(value) { el._class = String(value || ""); }
    });
    Object.defineProperty(el, "textContent", {
      get() { return el._text || ""; },
      set(value) { el._text = String(value == null ? "" : value); }
    });
    return el;
  }
  return { createElement: node, createElementNS: function (_ns, tag) { return node(tag); } };
}

section("an open filter sheet resizes the map", () => {
  const savedDocument = global.document;
  const savedWindow = global.window;
  const doc = miniMapDocument();
  global.document = doc;
  global.window = global.window || {};
  const maps = [];
  const markerOpts = [];
  function FakeMap() { this.resizeCount = 0; this.removed = false; maps.push(this); }
  FakeMap.prototype.resize = function () { this.resizeCount += 1; };
  FakeMap.prototype.remove = function () { this.removed = true; };
  FakeMap.prototype.on = function () {};
  FakeMap.prototype.getSource = function () { return { setData() {} }; };
  FakeMap.prototype.fitBounds = function () {};
  function Marker(opts) {
    markerOpts.push(opts);
    this.setLngLat = function () { return this; };
    this.addTo = function () { return this; };
    this.on = function () {};
  }
  const parent = doc.createElement("div");
  const handle = radiusMap.mount(parent, {
    center: { lat: 40.23, lng: -111.66 },
    radiusMiles: 10,
    pickMode: true,
    maplibre: { Map: FakeMap, Marker: Marker }
  });
  const stage = walk(handle.element).filter(node => node.className === "radius-map-stage")[0];
  check("tiles on keep the map stage", handle.tilesState() === "on" && stage && stage.hidden === false);
  check("pick mode makes the pin draggable", markerOpts[0] && markerOpts[0].draggable === true);
  handle.resize();
  check("resize asks MapLibre to measure the sheet", maps[0].resizeCount === 1);
  stage.clientWidth = 0;
  stage.offsetWidth = 0;
  handle.resize();
  check("a hidden sheet does not freeze a zero size", maps[0].resizeCount === 1);
  handle.destroy();
  check("closing releases the map", maps[0].removed === true);
  if (savedDocument === undefined) delete global.document;
  else global.document = savedDocument;
  if (savedWindow === undefined) delete global.window;
  else global.window = savedWindow;
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
      t.ui.filterDraft = Object.assign({}, t.state.filters);
      t.buildWhereGroup();
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
