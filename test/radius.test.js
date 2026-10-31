/* Radius shared by the Discover slider and the Filters panel.
   Catalog ideas have no coordinates of their own. Confident pins in
   public/pins.js are the points the deck can measure. */
"use strict";

const fs = require("fs");
const path = require("path");
const radius = require("../public/radius.js");
const { loadApp } = require("./harness");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
function section(title, fn) {
  console.log("\n" + title);
  try { fn(); }
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 400)); }
}

const PROVO = { lat: 40.2338, lng: -111.6585 };
const KEY = "spark_state_v1";

section("clamp and slider stops", () => {
  check("default is 10 miles", radius.clampRadiusMiles(undefined) === 10 && radius.clampRadiusMiles(null) === 10);
  check("blank and garbage stay at 10", radius.clampRadiusMiles("") === 10 && radius.clampRadiusMiles("nope") === 10);
  check("numeric strings clamp", radius.clampRadiusMiles("12") === 12 && radius.clampRadiusMiles(" 25 ") === 25);
  check("below 1 becomes 1 and above 50 becomes 50",
    radius.clampRadiusMiles(0) === 1 && radius.clampRadiusMiles(-4) === 1 && radius.clampRadiusMiles(80) === 50);
  check("values round to the nearest mile", radius.clampRadiusMiles(10.4) === 10 && radius.clampRadiusMiles(10.6) === 11);
  check("label", radius.radiusLabel(10) === "10 mi" && radius.radiusLabel(80) === "50 mi");

  [1, 5, 10, 25, 50].forEach(miles => {
    const pos = radius.milesToSlider(miles);
    check(miles + " mi round-trips through the slider", radius.sliderToMiles(pos) === miles, String(pos));
  });
  check("the labeled stops are evenly spaced",
    radius.milesToSlider(1) === 0 &&
    radius.milesToSlider(5) === 250 &&
    radius.milesToSlider(10) === 500 &&
    radius.milesToSlider(25) === 750 &&
    radius.milesToSlider(50) === 1000);
  check("a position between 10 and 25 stays inside that span",
    radius.sliderToMiles(625) > 10 && radius.sliderToMiles(625) < 25);
  check("out of range slider positions clamp",
    radius.sliderToMiles(-20) === 1 && radius.sliderToMiles(5000) === 50 && radius.sliderToMiles("nope") === 10);
});

section("distance", () => {
  const same = radius.haversineMiles(PROVO, PROVO);
  check("identical points are 0 miles", same === 0, String(same));
  const provoToSlc = radius.haversineMiles(PROVO, { lat: 40.7608, lng: -111.8910 });
  check("Provo to Salt Lake is about 38 miles", provoToSlc > 36 && provoToSlc < 41, String(provoToSlc));

  const near = { id: 1, lat: 40.237206, lng: -111.658938 };
  const far = { id: 2, lat: 40.7608, lng: -111.8910 };
  const plain = { id: 3, title: "No place" };
  check("a point inside 10 miles stays", radius.withinRadius(near, PROVO, 10) === true);
  check("a point outside 10 miles drops", radius.withinRadius(far, PROVO, 10) === false);
  check("the same point stays at 50 miles", radius.withinRadius(far, PROVO, 50) === true);
  check("an idea with no location stays at every radius",
    radius.withinRadius(plain, PROVO, 1) === true && radius.withinRadius(plain, null, 1) === true);
  check("no user position keeps a coordinate idea", radius.withinRadius(far, null, 1) === true);
  check("a denied position with no point keeps the idea",
    radius.withinRadius(far, { lat: null, lng: null }, 1) === true);
  check("an out-of-range point is not a point",
    radius.ideaPoint({ lat: 999, lng: 0 }) === null);

  const milesOnly = { distanceMiles: 40 };
  check("distanceMiles outside the radius drops when there is no point",
    radius.withinRadius(milesOnly, null, 10) === false);
  check("distanceMiles inside the radius stays",
    radius.withinRadius({ distanceMiles: 6.4 }, PROVO, 10) === true);
  check("negative distanceMiles is ignored",
    radius.withinRadius({ distanceMiles: -2 }, PROVO, 1) === true);
  const both = { lat: 40.237206, lng: -111.658938, distanceMiles: 40 };
  check("coordinates win over a farther distanceMiles",
    radius.withinRadius(both, PROVO, 10) === true);
  check("distanceMiles is used when the user position is missing",
    radius.withinRadius(both, null, 10) === false);

  const nested = { location: { lat: 40.7608, lng: -111.8910 } };
  check("location.lat/lng is a point", radius.withinRadius(nested, PROVO, 10) === false);
  const asArray = { coordinates: [40.237206, -111.658938] };
  check("coordinates [lat, lng] is a point", radius.withinRadius(asArray, PROVO, 10) === true);
  check("a string pair is not a point", radius.ideaPoint({ lat: "40.2", lng: "-111.6" }) === null);

  const pins = {
    a: { lat: 40.233947, lng: -111.659172, city: "  Provo " },
    b: { lat: 40.7608, lng: -111.8910, city: "Salt Lake City" }
  };
  check("nearest pin city within 15 miles", radius.nearestPlaceLabel(PROVO, pins, 15) === "Provo");
  check("a fix with no nearby pin has no city",
    radius.nearestPlaceLabel({ lat: 0, lng: 0 }, pins, 15) === null);
  check("no fix has no city", radius.nearestPlaceLabel(null, pins, 15) === null);
});

section("published pins match confident rows", () => {
  const file = fs.readFileSync(path.join(__dirname, "..", "public", "pins.js"), "utf8");
  check("pins.js does not publish addresses or provenance",
    file.indexOf("source_url") === -1 && file.indexOf("http") === -1 &&
    file.indexOf("address") === -1 && !/"notes"/.test(file) && file.indexOf("locked") === -1);
  const sandbox = {};
  require("vm").createContext(sandbox);
  require("vm").runInContext(file + "\nglobalThis.PINS = IDEA_PINS;", sandbox, { filename: "pins.js" });
  const pins = sandbox.PINS;
  const coords = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "coords", "utah.json"), "utf8"));
  const known = new Set(["confident", "area_based", "route_unpinned", "flagged", "pending"]);
  const expected = {};
  Object.keys(coords).forEach(key => {
    const entry = coords[key];
    const has = typeof entry.lat === "number" && typeof entry.lng === "number";
    const publish = known.has(entry.status) && has && (entry.status === "confident" || entry.locked === true);
    if (publish) expected[String(entry.id)] = entry;
  });
  const pinIds = Object.keys(pins);
  const expectedIds = Object.keys(expected);
  check("every confident pin is published and nothing else is",
    pinIds.length === expectedIds.length && expectedIds.every(id => pins[id]),
    pinIds.length + " vs " + expectedIds.length);
  let drift = 0;
  expectedIds.forEach(id => {
    const pin = pins[id];
    const entry = expected[id];
    const city = (typeof entry.city === "string" && entry.city.trim()) ? entry.city.trim() : undefined;
    if (!pin || pin.lat !== entry.lat || pin.lng !== entry.lng || pin.city !== city) drift++;
    if (pin && (pin.address || pin.notes || pin.source_url || pin.status)) drift++;
  });
  check("published lat, lng, and city match the coordinate file", drift === 0, String(drift));
});

section("deck uses one persisted radius", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const radiusAt = html.indexOf('src="radius.js"');
  const pinsAt = html.indexOf('src="pins.js"');
  const appAt = html.indexOf('src="app.js"');
  check("the page loads radius and pins before the app",
    radiusAt > 0 && pinsAt > radiusAt && appAt > pinsAt);

  const fresh = loadApp({});
  check("a new state defaults to 10 miles", fresh.state.filters.radiusMiles === 10);
  check("10 miles is not an extra badge", fresh.activeFilterCount(fresh.state.filters) === 0);
  const tight = Object.assign({}, fresh.state.filters, { radiusMiles: 5 });
  check("a non-default radius counts as a filter",
    fresh.activeFilterCount(tight) === fresh.activeFilterCount(fresh.state.filters) + 1);
  check("idea 2 has no pin", fresh.IDEAS_BY_ID[2].lat == null && fresh.IDEAS_BY_ID[2].lng == null);
  check("a Provo pin is attached",
    fresh.IDEAS_BY_ID[1854].lat === 40.237206 && fresh.IDEAS_BY_ID[1854].lng === -111.658938);
  check("a Sundance pin is attached", fresh.IDEAS_BY_ID[187].lat === 40.386169);

  fresh.state.location = { lat: PROVO.lat, lng: PROVO.lng };
  fresh.state.filters.radiusMiles = 10;
  check("10 miles keeps the Provo idea", fresh.matchesFilters(fresh.IDEAS_BY_ID[1854], fresh.state.filters) === true);
  check("10 miles drops Sundance", fresh.matchesFilters(fresh.IDEAS_BY_ID[187], fresh.state.filters) === false);
  check("an idea without a pin stays", fresh.matchesFilters(fresh.IDEAS_BY_ID[2], fresh.state.filters) === true);
  const deck = fresh.computeDeck();
  check("the deck is smaller than the full catalog and still includes the unpinned idea",
    deck.total < 1994 && deck.total > 1994 - 164 && deck.remaining.indexOf(2) !== -1,
    String(deck.total));
  check("Sundance is not in the 10 mile deck", deck.remaining.indexOf(187) === -1);

  fresh.state.filters.radiusMiles = 11;
  check("11 miles keeps Sundance", fresh.matchesFilters(fresh.IDEAS_BY_ID[187], fresh.state.filters) === true);
  fresh.state.location = null;
  fresh.state.filters.radiusMiles = 1;
  check("clearing location brings Sundance back", fresh.matchesFilters(fresh.IDEAS_BY_ID[187], fresh.state.filters) === true);

  const milesOnly = Object.assign({}, fresh.IDEAS_BY_ID[2], { distanceMiles: 40 });
  check("distanceMiles filters an idea that has no pin",
    fresh.matchesFilters(milesOnly, Object.assign({}, fresh.state.filters, { radiusMiles: 10 })) === false);
  check("the label is Near you without a fix", fresh.placeLabel() === "Near you");
  fresh.state.location = { lat: PROVO.lat, lng: PROVO.lng };
  check("a Provo fix is labeled Provo", fresh.placeLabel() === "Provo");
  fresh.state.location = { lat: PROVO.lat, lng: PROVO.lng, city: "Orem" };
  check("a stored city wins over the nearest pin", fresh.placeLabel() === "Orem");
  fresh.state.location = { lat: 0, lng: 0 };
  check("a fix far from every pin stays Near you", fresh.placeLabel() === "Near you");

  const wide = {};
  wide[KEY] = JSON.stringify({
    onboarded: true,
    profile: { ageConfirmedAt: "2026-01-01T00:00:00.000Z" },
    filters: { radiusMiles: 80, duration: [], cost: [], time: [], setting: [], vibe: [], season: [], stage: [], dateType: [], food: null, hide21: false }
  });
  const clamped = loadApp(wide);
  check("a saved radius above 50 loads as 50", clamped.state.filters.radiusMiles === 50);

  const legacy = {};
  legacy[KEY] = JSON.stringify({
    onboarded: true,
    profile: { ageConfirmedAt: "2026-01-01T00:00:00.000Z" },
    filters: { duration: [], cost: [], time: [], setting: [], vibe: [], season: [], stage: [], dateType: [], food: null }
  });
  const backfilled = loadApp(legacy);
  check("an older save gains the 10 mile default", backfilled.state.filters.radiusMiles === 10);

  const zero = {};
  zero[KEY] = JSON.stringify({
    filters: { radiusMiles: 0 }
  });
  const floored = loadApp(zero);
  check("a saved 0 loads as 1 mile", floored.state.filters.radiusMiles === 1);
});

module.exports = { pass: pass, fail: fail };
