/* Local events switch. Off (the default) shows every activity and hides
   the radius. On keeps ideas with a known place inside radiusMiles and
   drops the rest. The choice is filters.localOnly. */
"use strict";

const fs = require("fs");
const path = require("path");
const { loadApp } = require("./harness");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
function section(title, fn) {
  console.log("\n" + title);
  try { fn(); }
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 500)); }
}

const KEY = "spark_state_v1";
const PROVO = { lat: 40.2338, lng: -111.6585, city: "Provo" };

function saved(filters) {
  const store = {};
  store[KEY] = JSON.stringify({
    onboarded: true,
    profile: { ageConfirmedAt: "2026-01-01T00:00:00.000Z" },
    filters: filters
  });
  return loadApp(store);
}

function walk(node, acc) {
  acc = acc || [];
  if (!node || typeof node !== "object") return acc;
  acc.push(node);
  (node.children || []).forEach(child => walk(child, acc));
  return acc;
}
function blob(node) {
  let out = "";
  walk(node).forEach(n => {
    if (n.className) out += "\n." + n.className;
    if (n.innerHTML) out += "\n" + n.innerHTML;
    if (n.textContent) out += "\n" + n.textContent;
    if (n.checked === true) out += "\n[checked]";
    if (n.checked === false) out += "\n[unchecked]";
  });
  return out;
}
function copyIdea(t, id) {
  const src = t.IDEAS_BY_ID[id];
  const idea = {};
  Object.keys(src).forEach(k => { idea[k] = src[k]; });
  return idea;
}

section("saved filter state migrates localOnly", () => {
  const fresh = loadApp({});
  check("a new state stores localOnly false", fresh.state.filters.localOnly === false);
  const legacy = saved({
    radiusMiles: 25,
    duration: [], cost: [], time: [], setting: [], vibe: [], season: [], stage: [], dateType: [],
    food: null, hide21: false
  });
  check("a save from before the switch stays off", legacy.state.filters.localOnly === false);
  check("that save keeps its radius", legacy.state.filters.radiusMiles === 25);
  const on = saved({ localOnly: true, radiusMiles: 8 });
  check("an explicit true stays on", on.state.filters.localOnly === true && on.state.filters.radiusMiles === 8);
  const off = saved({ localOnly: false, radiusMiles: 10 });
  check("an explicit false stays off", off.state.filters.localOnly === false);
  ["yes", "true", 1, "1", null].forEach(value => {
    const junk = saved({ localOnly: value });
    check("localOnly " + JSON.stringify(value) + " does not turn the switch on", junk.state.filters.localOnly === false);
  });

  const storage = {};
  const t = loadApp(storage);
  t.state.filters.localOnly = true;
  t.state.filters.radiusMiles = 12;
  t.saveState();
  const again = loadApp(storage);
  check("saving and loading keeps local on and the radius",
    again.state.filters.localOnly === true && again.state.filters.radiusMiles === 12);
});

section("local on is the only time the radius filters", () => {
  const t = loadApp({});
  t.state.location = { lat: PROVO.lat, lng: PROVO.lng };
  const off = Object.assign({}, t.state.filters, { localOnly: false, radiusMiles: 1 });
  check("local off keeps a far pin", t.matchesFilters(t.IDEAS_BY_ID[187], off) === true);
  check("local off keeps an idea with no place", t.matchesFilters(t.IDEAS_BY_ID[2], off) === true);
  check("local off keeps a near pin", t.matchesFilters(t.IDEAS_BY_ID[1854], off) === true);

  const on = Object.assign({}, t.state.filters, { localOnly: true, radiusMiles: 10 });
  check("local on keeps the Provo pin", t.matchesFilters(t.IDEAS_BY_ID[1854], on) === true);
  check("local on drops Sundance at 10 miles", t.matchesFilters(t.IDEAS_BY_ID[187], on) === false);
  check("local on drops an idea with no place", t.matchesFilters(t.IDEAS_BY_ID[2], on) === false);
  check("a negative distance is not a place", t.ideaHasKnownPlace({ distanceMiles: -2 }) === false);
  check("a pin is a place", t.ideaHasKnownPlace(t.IDEAS_BY_ID[1854]) === true);
  check("distanceMiles is a place", t.ideaHasKnownPlace({ distanceMiles: 4 }) === true);

  const milesOnly = Object.assign({}, t.IDEAS_BY_ID[2], { distanceMiles: 3.2 });
  delete milesOnly.lat;
  delete milesOnly.lng;
  check("a measured distance inside the radius stays", t.matchesFilters(milesOnly, on) === true);
  const farMiles = Object.assign({}, milesOnly, { distanceMiles: 40 });
  check("a measured distance outside the radius drops", t.matchesFilters(farMiles, on) === false);
  const both = Object.assign({}, t.IDEAS_BY_ID[1854], { distanceMiles: 40 });
  check("coordinates win over a farther distanceMiles", t.matchesFilters(both, on) === true);

  t.state.filters = on;
  const deck = t.computeDeck();
  check("the local deck drops the unpinned idea and keeps the Provo idea",
    deck.remaining.indexOf(2) === -1 && deck.remaining.indexOf(1854) !== -1 && deck.total < 1994);
  check("the show-count matches that deck", t.countIdeasMatching(on) === deck.total);

  check("local on counts as a filter at 10 miles", t.activeFilterCount(on) === 1);
  check("local on plus a custom radius counts as two",
    t.activeFilterCount(Object.assign({}, on, { radiusMiles: 5 })) === 2);
  check("local off does not count the radius", t.activeFilterCount(off) === 0);
  check("the show label uses a thousands separator",
    t.formatShowIdeas(1412) === "Show 1,412 ideas" && t.formatShowIdeas(1) === "Show 1 idea" && t.formatShowIdeas(38) === "Show 38 ideas");
});

section("the place line follows the radius label", () => {
  const t = loadApp({});
  check("no fix stays on Near you", t.placeLabel() === "Near you" && t.nearYouLabel() === "Near you");
  t.state.location = { lat: PROVO.lat, lng: PROVO.lng };
  check("a Provo fix reads Near you · Provo", t.nearYouLabel() === "Near you · Provo", t.nearYouLabel());
  t.state.location = { lat: PROVO.lat, lng: PROVO.lng, city: "Orem" };
  check("a stored city wins", t.nearYouLabel() === "Near you · Orem");
  t.state.location = null;
  check("clearing the fix returns to Near you", t.nearYouLabel() === "Near you");
});

section("filters sheet shows the switch and the radius only when local is on", () => {
  const t = loadApp({});
  t.state.location = PROVO;
  t.ui.filterDraft = Object.assign({}, t.state.filters, { localOnly: false, radiusMiles: 10 });
  const off = blob(t.buildWhereGroup());
  check("the where section names Local events", off.indexOf("Where") !== -1 && off.indexOf("Local events") !== -1);
  check("off subtitle and note",
    off.indexOf("Off · showing everything") !== -1 &&
    off.indexOf("All activities show. Turn on to pick a distance.") !== -1);
  check("off hides How far and leaves the switch unchecked",
    off.indexOf("how-far") === -1 && off.indexOf("is-on") === -1 && off.indexOf("[unchecked]") !== -1);

  t.ui.filterDraft = Object.assign({}, t.state.filters, { localOnly: true, radiusMiles: 10 });
  const on = blob(t.buildWhereGroup());
  check("on subtitle replaces the note",
    on.indexOf("Only ideas near you") !== -1 &&
    on.indexOf("All activities show") === -1 &&
    on.indexOf("Off · showing everything") === -1);
  check("on expands How far under the switch",
    on.indexOf("is-on") !== -1 && on.indexOf("how-far") !== -1 && on.indexOf("How far?") !== -1 &&
    on.indexOf("[checked]") !== -1);
  check("the how far place line is in the panel", on.indexOf("how-far-place") !== -1);
});

section("discover hides the slider until local is on", () => {
  const t = loadApp({});
  t.state.location = PROVO;
  t.state.filters.localOnly = false;
  t.state.filters.radiusMiles = 10;
  const off = blob(t.buildDiscoverScreen());
  check("local off hides the discover slider and the pill",
    off.indexOf("radius-row") === -1 && off.indexOf("local-pill") === -1);
  check("local off does not count on the Filters button", off.indexOf('class="badge"') === -1);
  check("the result line stays ideas", off.indexOf(" ideas") !== -1 && off.indexOf("nearby ideas") === -1);

  t.state.filters.localOnly = true;
  const on = blob(t.buildDiscoverScreen());
  check("local on shows the slider and the jade pill",
    on.indexOf("radius-row") !== -1 && on.indexOf("local-pill") !== -1);
  check("the pill reads Local · 10 mi and offers a way to turn it off",
    on.indexOf("Local · 10 mi") !== -1 && on.indexOf("local-pill-x") !== -1);
  check("the Filters button counts Local", on.indexOf('class="badge"') !== -1 && on.indexOf(">1<") !== -1);
  check("the result line says nearby ideas", on.indexOf("nearby ideas") !== -1);

  t.state.filters.radiusMiles = 25;
  const wide = blob(t.buildDiscoverScreen());
  check("the pill follows the radius", wide.indexOf("Local · 25 mi") !== -1);
  check("a custom radius adds a second count", wide.indexOf(">2<") !== -1);
});

section("cards badge a distance only while local is on", () => {
  const t = loadApp({});
  const plain = copyIdea(t, 2);
  delete plain.photo;
  plain.distanceMiles = 3.24;
  t.state.filters.localOnly = false;
  const hidden = t.buildSwipeCard(plain, false);
  check("local off draws no away badge", hidden.innerHTML.indexOf("mi away") === -1 && hidden.innerHTML.indexOf("distance-badge") === -1);

  t.state.filters.localOnly = true;
  t.state.location = null;
  check("3.24 miles rounds to one decimal", t.distanceAwayLabel(3.24) === "3.2 mi away" && t.distanceAwayLabel(3.25) === "3.3 mi away");
  const shown = t.buildSwipeCard(plain, false);
  check("a distanceMiles card reads 3.2 mi away",
    shown.innerHTML.indexOf("distance-badge") !== -1 && shown.innerHTML.indexOf("3.2 mi away") !== -1);

  const nowhere = copyIdea(t, 2);
  delete nowhere.photo;
  delete nowhere.lat;
  delete nowhere.lng;
  delete nowhere.distanceMiles;
  const blank = t.buildSwipeCard(nowhere, false);
  check("a card with no distance has no badge", blank.innerHTML.indexOf("distance-badge") === -1);

  t.state.location = { lat: PROVO.lat, lng: PROVO.lng };
  const pinned = copyIdea(t, 1854);
  const miles = t.ideaDistanceMiles(pinned);
  const label = t.distanceAwayLabel(miles);
  check("a pin is measured from the fix", typeof miles === "number" && miles < 10 && /^\d+\.\d mi away$/.test(label), label);
  const card = t.buildSwipeCard(pinned, false);
  check("the pinned card shows that badge", card.innerHTML.indexOf(label) !== -1 && card.innerHTML.indexOf("distance-badge") !== -1);

  const stale = Object.assign({}, pinned, { distanceMiles: 40 });
  check("the badge uses coordinates when both exist",
    Math.abs(t.ideaDistanceMiles(stale) - miles) < 0.001);
});

section("the filters radius thumb stays white with a jade ring", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "style.css"), "utf8");
  const panel = css.slice(css.indexOf(".radius-slider-panel::-webkit-slider-thumb{"), css.indexOf(".radius-slider-panel::-moz-range-thumb{"));
  check("the filters thumb is still white with a jade ring",
    panel.indexOf("background:#fff") !== -1 && panel.indexOf("border:3px solid var(--color-accent)") !== -1, panel.trim());
  const discover = css.slice(css.indexOf(".radius-slider-discover::-webkit-slider-thumb{"), css.indexOf(".radius-slider-discover::-moz-range-thumb{"));
  check("the discover thumb is still coral", discover.indexOf("var(--color-coral)") !== -1);
  const row = css.slice(css.indexOf(".local-events{"), css.indexOf(".local-events-icon{"));
  check("the local row uses a soft shadow",
    row.indexOf("var(--shadow-soft)") !== -1 && !/\d+px\s+\d+px\s+0(?:px)?\b/.test(row), row.trim());
  check("local reuses the existing switch", css.indexOf(".toggle-switch input:checked + .toggle-slider{ background:var(--accent); }") !== -1);
});

module.exports = { pass: pass, fail: fail };
