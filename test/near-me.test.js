/* Free near-me deck rule on top of the radius slider.
   Unpinned ideas stay. Pins farther than filters.radiusMiles drop.
   The slider already stores that radius (default 10). No second filter. */
"use strict";

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

section("withinRadius keeps general ideas and drops far pins", () => {
  const general = { id: 2 };
  const near = { id: 1854, lat: 40.237206, lng: -111.658938 };
  const far = { id: 187, lat: 40.386169, lng: -111.604634 };
  check("helper takes idea, location, and radius", typeof radius.withinRadius === "function");
  check("no coordinates stays", radius.withinRadius(general, PROVO, 25) === true);
  check("null lat stays", radius.withinRadius({ lat: null, lng: -111.89 }, PROVO, 25) === true);
  check("near pin stays", radius.withinRadius(near, PROVO, 10) === true);
  check("far pin drops", radius.withinRadius(far, PROVO, 10) === false);
  check("unknown location keeps a far pin", radius.withinRadius(far, null, 10) === true);
  check("blank location keeps a far pin", radius.withinRadius(far, {}, 10) === true);
  check("a wider radius keeps the far pin", radius.withinRadius(far, PROVO, 25) === true);
});

section("computeDeck reads the radius already in state", () => {
  const t = loadApp({});
  check("built-in without a pin has no coordinates",
    t.IDEAS_BY_ID[2].lat == null && t.IDEAS_BY_ID[2].lng == null);
  check("a pinned built-in carries lat/lng from the pin table",
    t.IDEAS_BY_ID[187].lat === 40.386169 && t.IDEAS_BY_ID[187].lng === -111.604634);
  check("the slider default is the radius in state", t.state.filters.radiusMiles === radius.RADIUS_DEFAULT);
  t.state.location = { lat: PROVO.lat, lng: PROVO.lng };
  let deck = t.computeDeck();
  check("default radius keeps an idea with no coordinates", deck.remaining.indexOf(2) !== -1);
  check("default radius drops the far pin", deck.remaining.indexOf(187) === -1);
  t.state.filters.radiusMiles = 25;
  deck = t.computeDeck();
  check("filters.radiusMiles keeps that pin", deck.remaining.indexOf(187) !== -1 && deck.remaining.indexOf(2) !== -1);
  t.state.location = null;
  t.state.filters.radiusMiles = 1;
  deck = t.computeDeck();
  check("unknown location shows the far pin", deck.remaining.indexOf(187) !== -1 && deck.remaining.indexOf(2) !== -1);
});

module.exports = { pass: pass, fail: fail };
