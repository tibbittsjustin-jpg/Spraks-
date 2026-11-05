/* Happening tonight is a Denver schedule. Anytime ideas never count.
   Evening/Night tags and openNow (on the Denver evening clock) are the
   separate "Also good tonight" list. */
"use strict";

const fs = require("fs");
const path = require("path");
const util = require("../public/util");
const occ = require("../public/occurrences");
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

/* Oct 31, 2026 is still MDT (UTC-6). These are UTC instants, not local hours. */
const NOON_DENVER = new Date("2026-10-31T18:00:00.000Z");
const FOUR_59_DENVER = new Date("2026-10-31T22:59:00.000Z");
const FIVE_PM_DENVER = new Date("2026-10-31T23:00:00.000Z");
const ELEVEN_30_DENVER = new Date("2026-11-01T05:30:00.000Z");
const HALF_PAST_MIDNIGHT = new Date("2026-11-01T06:30:00.000Z");
const LABELS = { Evening: true, Night: true, Tonight: true };

function walk(node, acc) {
  acc = acc || [];
  if (!node || typeof node !== "object") return acc;
  acc.push(node);
  (node.children || []).forEach(child => walk(child, acc));
  return acc;
}
function textOf(node) {
  return walk(node).map(item => (item.innerHTML || "") + "\n" + (item.textContent || "")).join("\n");
}
function dated(date, start, end, extra) {
  const entry = { date: date };
  if (start) entry.start = start;
  if (end) entry.end = end;
  return idea(Object.assign({
    occurrences: { kind: "dates", dates: [entry] }
  }, extra));
}

function idea(partial) {
  return Object.assign({
    title: "Sample", time: [], isReal: false, unavailable: false, openNow: null
  }, partial);
}

section("anytime ideas never suit tonight", () => {
  check("Evening at noon is not a tonight event", util.suitsTonight(idea({ time: ["Evening"] }), NOON_DENVER) === false);
  check("Night at noon is not a tonight event", util.suitsTonight(idea({ time: ["Night"] }), NOON_DENVER) === false);
  check("Evening and Night are not a tonight event", util.suitsTonight(idea({ time: ["Night", "Evening"] }), NOON_DENVER) === false);
  check("Morning and Afternoon are not a tonight event", util.suitsTonight(idea({ time: ["Morning", "Afternoon"] }), NOON_DENVER) === false);
  check("all four tags are not a tonight event", util.suitsTonight(idea({ time: ["Morning", "Afternoon", "Evening", "Night"] }), NOON_DENVER) === false);
  check("empty time does not", util.suitsTonight(idea({ time: [] }), FIVE_PM_DENVER) === false);
  check("missing time does not", util.suitsTonight(idea({ time: undefined }), FIVE_PM_DENVER) === false);
  check("a lowercase tag does not", util.suitsTonight(idea({ time: ["evening", "Dusk"] }), FIVE_PM_DENVER) === false);
  check("duplicate Evening tags do not", util.suitsTonight(idea({ time: ["Evening", "Evening"] }), NOON_DENVER) === false);
  check("unavailable ideas do not match", util.suitsTonight(idea({ time: ["Night"], unavailable: true }), FIVE_PM_DENVER) === false);
  check("null idea does not match", util.suitsTonight(null, FIVE_PM_DENVER) === false);
  check("a closing-time string is not a tonight signal",
    util.suitsTonight(idea({ time: ["Morning"], closesAt: "10 pm" }), FIVE_PM_DENVER) === false);
  check("a dated evening on another day does not suit tonight",
    util.suitsTonight(dated("2026-11-02", "19:00", "21:00", { time: ["Evening"] }), ELEVEN_30_DENVER) === false);
  check("a date-only event today suits tonight even with a Morning tag",
    util.suitsTonight(dated("2026-10-31", null, null, { time: ["Morning"] }), NOON_DENVER) === true);
  check("an unavailable dated event does not suit tonight",
    util.suitsTonight(dated("2026-10-31", null, null, { unavailable: true }), NOON_DENVER) === false);
});

section("also good tonight is tags and open now, not the chip", () => {
  check("an anytime Evening idea is also good tonight",
    util.alsoGoodTonight(idea({ time: ["Evening"] }), NOON_DENVER) === true);
  check("an anytime Night idea is also good tonight",
    util.alsoGoodTonight(idea({ time: ["Night"] }), NOON_DENVER) === true);
  check("Morning and Afternoon are not also good tonight",
    util.alsoGoodTonight(idea({ time: ["Morning", "Afternoon"] }), NOON_DENVER) === false);
  check("a dated Evening event is not also good tonight",
    util.alsoGoodTonight(dated("2026-10-31", "19:00", "21:00", { time: ["Evening"] }), NOON_DENVER) === false);
  const open = idea({ time: ["Morning"], openNow: true, isReal: true });
  check("open now at 4:59pm Denver is not also good tonight",
    util.alsoGoodTonight(open, FOUR_59_DENVER) === false && FOUR_59_DENVER.getUTCHours() === 22);
  check("open now at 5:00pm Denver is also good tonight",
    util.alsoGoodTonight(open, FIVE_PM_DENVER) === true);
  check("open now at 11:30pm Denver is also good tonight",
    util.alsoGoodTonight(open, ELEVEN_30_DENVER) === true && ELEVEN_30_DENVER.getUTCHours() === 5);
  check("open now at 12:30am Denver is not also good tonight",
    util.alsoGoodTonight(open, HALF_PAST_MIDNIGHT) === false);
  check("open now never suits tonight", util.suitsTonight(open, FIVE_PM_DENVER) === false);
  check("openNow false never matches", util.alsoGoodTonight(idea({ openNow: false, isReal: true }), FIVE_PM_DENVER) === false);
  check("openNow null never matches", util.alsoGoodTonight(idea({ openNow: null, isReal: true }), FIVE_PM_DENVER) === false);
  check("the string true is not the flag", util.alsoGoodTonight(idea({ openNow: "true", isReal: true }), FIVE_PM_DENVER) === false);
  const placeholder = idea({
    isReal: true,
    time: ["Morning", "Afternoon", "Evening", "Night"],
    openNow: null
  });
  check("a real idea's placeholder tags are not also good tonight",
    util.alsoGoodTonight(placeholder, FIVE_PM_DENVER) === false);
  check("a real idea tagged only Evening is not also good tonight",
    util.alsoGoodTonight(idea({ isReal: true, time: ["Evening"] }), NOON_DENVER) === false);
  if (ELEVEN_30_DENVER.getHours() !== 23) {
    check("a non-Denver process clock still uses 11:30pm Denver for open now",
      util.alsoGoodTonight(open, ELEVEN_30_DENVER) === true && ELEVEN_30_DENVER.getHours() < 17);
  }
});

section("time badges stay inside the real tags", () => {
  check("Evening only", util.timeBadgeLabel(idea({ time: ["Evening"] })) === "Evening");
  check("Night only", util.timeBadgeLabel(idea({ time: ["Night"] })) === "Night");
  check("Evening and Night read Tonight", util.timeBadgeLabel(idea({ time: ["Evening", "Night"] })) === "Tonight");
  check("a daytime tag suppresses the pill", util.timeBadgeLabel(idea({ time: ["Afternoon", "Evening"] })) === null);
  check("Morning only has no pill", util.timeBadgeLabel(idea({ time: ["Morning"] })) === null);
  check("real ideas get no time pill from placeholder tags",
    util.timeBadgeLabel(idea({ isReal: true, time: ["Evening", "Night"] })) === null);
  check("closesAt does not become a clock badge",
    util.timeBadgeLabel(idea({ time: ["Morning"], closesAt: "8 pm" })) === null);
  const openEvening = idea({ time: ["Evening"], openNow: true });
  const badge = util.ideaStatusBadge(openEvening);
  check("Open now wins over a time pill", badge && badge.kind === "open" && badge.label === "Open now");
  check("no badge without a signal", util.ideaStatusBadge(idea({ time: ["Afternoon"] })) === null);
  check("unavailable suppresses Open now", util.ideaStatusBadge(idea({ openNow: true, unavailable: true })) === null);

  const t = loadApp({});
  const seen = {};
  const bad = [];
  Object.keys(t.IDEAS_BY_ID).forEach(id => {
    const label = util.timeBadgeLabel(t.IDEAS_BY_ID[id]);
    if (label) seen[label] = true;
    if (label != null && LABELS[label] !== true) bad.push(id + ":" + label);
    if (label && /pm|am|sat|weekend|monday|tuesday|wednesday|thursday|friday|sunday/i.test(label)) bad.push(id + " clock " + label);
  });
  check("every catalog badge is Evening, Night, Tonight, or nothing", bad.length === 0, bad.slice(0, 6).join(", "));
  check("the catalog produces Evening, Night, and Tonight pills",
    seen.Evening === true && seen.Night === true && seen.Tonight === true);
});

section("the chip filters the deck and keeps its count honest", () => {
  const t = loadApp({});
  const tonightIdeas = Object.keys(t.IDEAS_BY_ID).filter(id => util.suitsTonight(t.IDEAS_BY_ID[id], NOON_DENVER));
  check("anytime catalog ideas are not tonight events", tonightIdeas.length === 0, tonightIdeas.slice(0, 6).join(", "));
  check("the chip count ignores anytime ideas", t.tonightMatchCount() === 0, String(t.tonightMatchCount()));
  check("tonight starts off", t.state.filters.tonight === false);
  check("a morning idea stays in the unfiltered deck", t.matchesFilters(t.IDEAS_BY_ID[2], t.state.filters) === true);

  const on = Object.assign({}, t.state.filters, { tonight: true });
  check("Evening idea 54 does not match the chip", t.matchesFilters(t.IDEAS_BY_ID[54], on) === false);
  check("Night idea 23 does not match the chip", t.matchesFilters(t.IDEAS_BY_ID[23], on) === false);
  check("Tonight idea 26 does not match the chip", t.matchesFilters(t.IDEAS_BY_ID[26], on) === false);
  check("Afternoon and Evening idea 67 does not match the chip", t.matchesFilters(t.IDEAS_BY_ID[67], on) === false);
  check("Morning idea 2 does not match the chip", t.matchesFilters(t.IDEAS_BY_ID[2], on) === false);

  const morningOnly = Object.assign({}, on, { time: ["Morning"] });
  check("a Morning filter still excludes an Evening-only idea", t.matchesFilters(t.IDEAS_BY_ID[54], morningOnly) === false);
  const withCost = Object.assign({}, t.state.filters, { cost: ["Free"] });
  t.state.filters = withCost;
  const freeTonight = t.tonightMatchCount();
  let expectedFree = 0;
  Object.keys(t.IDEAS_BY_ID).forEach(id => {
    const item = t.IDEAS_BY_ID[id];
    if (item.cost === "Free" && util.suitsTonight(item, NOON_DENVER)) expectedFree++;
  });
  check("the count honors the other filters", freeTonight === expectedFree, freeTonight + " vs " + expectedFree);
  const withTonight = t.activeFilterCount(Object.assign({}, withCost, { tonight: true }));
  check("the Filters badge does not count the tonight chip", withTonight === t.activeFilterCount(withCost));

  t.state.filters = Object.assign({}, t.state.filters, { cost: [], tonight: false });
  check("toggling on returns true", t.toggleTonightFilter() === true && t.state.filters.tonight === true);
  const deck = t.computeDeck();
  check("the filtered deck drops the morning idea", deck.remaining.indexOf(2) === -1);
  check("the filtered deck drops an anytime evening idea", deck.remaining.indexOf(54) === -1);
  check("toggling off returns false", t.toggleTonightFilter() === false && t.state.filters.tonight === false);

  function findChip(node, acc) {
    acc = acc || [];
    if (!node) return acc;
    if (node.className && String(node.className).indexOf("tonight-chip") !== -1) acc.push(node);
    (node.children || []).forEach(child => findChip(child, acc));
    return acc;
  }
  const offScreen = t.buildDiscoverScreen();
  const offChip = findChip(offScreen)[0];
  const offCount = offChip && (offChip.innerHTML.match(/tonight-count">(\d+)</) || [])[1];
  const chipCount = "0";
  check("the chip shows the count and not the words Happening tonight",
    !!offChip && offCount === chipCount && offChip.innerHTML.indexOf("Happening tonight") === -1,
    offChip && offChip.innerHTML);
  check("tonight off does not list Also good tonight", textOf(offScreen).indexOf("Also good tonight") === -1);
  check("the chip keeps a moon icon and no check mark",
    !!offChip && offChip.innerHTML.indexOf("icon-inline") !== -1 && offChip.innerHTML.indexOf("\u2713") === -1);
  check("the chip has an accessible happening-tonight label",
    !!offChip && offChip.getAttribute("aria-label") === "Happening tonight, " + chipCount + " ideas" &&
    offChip.getAttribute("aria-pressed") === "false",
    offChip && offChip.getAttribute("aria-label"));
  t.state.filters.tonight = true;
  const onChip = findChip(t.buildDiscoverScreen())[0];
  const onCount = onChip && (onChip.innerHTML.match(/tonight-count">(\d+)</) || [])[1];
  check("a pressed chip keeps the count, the yellow on-state, and the label",
    !!onChip && onChip.className.indexOf("is-on") !== -1 &&
    onCount === chipCount &&
    onChip.innerHTML.indexOf("Happening tonight") === -1 &&
    onChip.getAttribute("aria-pressed") === "true" &&
    onChip.getAttribute("aria-label") === "Happening tonight, " + chipCount + " ideas",
    onChip && onChip.getAttribute("aria-label"));
});

section("badges render on cards and lists only when the data supports them", () => {
  const t = loadApp({});
  function card(id, extra) {
    const src = t.IDEAS_BY_ID[id];
    const copy = {};
    Object.keys(src).forEach(k => { copy[k] = src[k]; });
    if (extra) Object.keys(extra).forEach(k => { copy[k] = extra[k]; });
    return t.buildSwipeCard(copy, false);
  }
  const evening = card(54);
  check("an Evening photo card shows the yellow pill",
    evening.innerHTML.indexOf('class="badge-time"') !== -1 && evening.innerHTML.indexOf(">Evening<") !== -1);
  check("that pill is not a fabricated clock",
    evening.innerHTML.indexOf("8 pm") === -1 && evening.innerHTML.indexOf("Weekend") === -1 && evening.innerHTML.indexOf(">Sat<") === -1);
  const night = card(23);
  check("a Night card says Night", night.innerHTML.indexOf(">Night<") !== -1 && night.innerHTML.indexOf(">Tonight<") === -1);
  const both = card(26);
  check("Evening and Night say Tonight", both.innerHTML.indexOf(">Tonight<") !== -1);
  const day = card(2);
  check("a daytime card has no time pill and no Open now",
    day.innerHTML.indexOf("badge-time") === -1 && day.innerHTML.indexOf("badge-open") === -1 && day.innerHTML.indexOf("Open now") === -1);
  const mixed = card(67);
  check("Afternoon and Evening gets no time pill", mixed.innerHTML.indexOf("badge-time") === -1);
  const open = card(2, { openNow: true });
  check("Open now uses the jade badge",
    open.innerHTML.indexOf('class="badge-open"') !== -1 && open.innerHTML.indexOf("Open now") !== -1 &&
    open.innerHTML.indexOf("badge-time") === -1);

  const row = t.buildIdeaRow(t.IDEAS_BY_ID[54], "Winter & Snow Adventures");
  check("a saved row shows the Evening pill",
    row.innerHTML.indexOf('class="badge-time"') !== -1 && row.innerHTML.indexOf(">Evening<") !== -1);
  const plain = t.buildIdeaRow(t.IDEAS_BY_ID[2], "Winter & Snow Adventures");
  check("a daytime saved row has no pill", plain.innerHTML.indexOf("badge-time") === -1 && plain.innerHTML.indexOf("badge-open") === -1);
  const friend = t.buildFriendIdeaRow(t.IDEAS_BY_ID[23]);
  check("a friend row shows Night", friend.innerHTML.indexOf(">Night<") !== -1);

  const real = t.hydrateRealIdea({
    placeId: "gp-tonight", title: "Night cafe", placeName: "Night cafe", address: "1 Main", openNow: true
  }, t.state.filters);
  check("hydrate keeps a true openNow", real.openNow === true && real.isReal === true);
  check("hydrate does not treat the placeholder times as tonight at noon", util.suitsTonight(real, NOON_DENVER) === false);
  const closed = t.hydrateRealIdea({
    placeId: "gp-closed", title: "Closed cafe", placeName: "Closed cafe", address: "2 Main", openNow: false
  }, t.state.filters);
  check("hydrate keeps a false openNow", closed.openNow === false);
  const unknown = t.hydrateRealIdea({
    placeId: "gp-unknown", title: "Cafe", placeName: "Cafe", address: "3 Main"
  }, t.state.filters);
  check("hydrate leaves a missing openNow null", unknown.openNow === null);
  const realCard = t.buildSwipeCard(real, false);
  check("an open real place shows Open now rather than a time pill",
    realCard.innerHTML.indexOf("Open now") !== -1 && realCard.innerHTML.indexOf("badge-time") === -1 &&
    realCard.innerHTML.indexOf("Real spot") === -1);
  const unknownCard = t.buildSwipeCard(unknown, false);
  check("a real place without hours keeps the real-spot marker",
    unknownCard.innerHTML.indexOf("Real spot") !== -1 && unknownCard.innerHTML.indexOf("Open now") === -1);
});

section("saved cards keep one Open now and add the time pill beside it", () => {
  const t = loadApp({});
  function textOf(node) {
    let out = node.innerHTML || "";
    (node.children || []).forEach(child => { out += "\n" + textOf(child); });
    return out;
  }
  function classesOf(node) {
    let out = node && node.className ? node.className + "\n" : "";
    (node && node.children || []).forEach(child => { out += classesOf(child); });
    return out;
  }
  const day = t.buildSavedCard(t.IDEAS_BY_ID[2]);
  check("a daytime saved card invents neither pill",
    textOf(day).indexOf("Tonight") === -1 && textOf(day).indexOf("Evening") === -1 &&
    textOf(day).indexOf("Open now") === -1 && classesOf(day).indexOf("saved-badge") === -1);
  const evening = t.buildSavedCard(t.IDEAS_BY_ID[54]);
  const eveningHtml = textOf(evening);
  check("an Evening saved card shows one yellow pill",
    eveningHtml.indexOf("Evening") !== -1 && eveningHtml.indexOf("Open now") === -1 &&
    classesOf(evening).indexOf("saved-badge-time") !== -1);
  const bothIdea = {};
  Object.keys(t.IDEAS_BY_ID[54]).forEach(k => { bothIdea[k] = t.IDEAS_BY_ID[54][k]; });
  bothIdea.openNow = true;
  const both = t.buildSavedCard(bothIdea);
  const bothHtml = textOf(both);
  const openCount = bothHtml.split("Open now").length - 1;
  check("Open now and Evening sit together once each",
    openCount === 1 && bothHtml.split("Evening").length - 1 === 1 &&
    classesOf(both).indexOf("saved-badge-open") !== -1 &&
    classesOf(both).indexOf("saved-badge-time") !== -1);
  const photo = t.buildSwipeCard(t.IDEAS_BY_ID[54], false);
  check("Discover cards have no category pill",
    photo.innerHTML.indexOf("card-cat-tag") === -1 && photo.innerHTML.indexOf(">Evening<") !== -1);
});

section("nearby cards copy openNow and do not invent hours", () => {
  const nearby = require("../server");
  const place = { name: "Cafe", placeId: "abc", address: "1 Main", mapsUrl: "https://example.com", rating: 4 };
  const open = nearby.mapNearbyCard({ title: "Coffee" }, Object.assign({ openNow: true }, place));
  const shut = nearby.mapNearbyCard({ title: "Coffee" }, Object.assign({ openNow: false }, place));
  const missing = nearby.mapNearbyCard({ title: "Coffee" }, place);
  check("mapNearbyCard copies open now", open.openNow === true && shut.openNow === false && missing.openNow === null);
  check("mapNearbyCard does not add a clock", open.closesAt == null && open.time == null);
  const serverSrc = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  check("the nearby prompt still refuses invented hours",
    serverSrc.indexOf("Never invent prices, hours, or phone numbers.") !== -1);
});

section("older saves and the theme tokens", () => {
  const storage = {};
  storage.spark_state_v1 = JSON.stringify({
    onboarded: true,
    profile: { name: "Alex", ageConfirmedAt: "2026-01-15T00:00:00.000Z" },
    filters: { duration: [], cost: [], time: [], setting: [], vibe: [], season: [], stage: [], dateType: [], food: null, hide21: false }
  });
  const t = loadApp(storage);
  check("a saved state without tonight loads as off", t.state.filters.tonight === false);
  check("that state still shows a morning idea", t.matchesFilters(t.IDEAS_BY_ID[2], t.state.filters) === true);

  const css = fs.readFileSync(path.join(__dirname, "..", "public", "style.css"), "utf8");
  const chip = css.slice(css.indexOf(".tonight-chip{"), css.indexOf(".tonight-chip{") + 360);
  const open = css.slice(css.indexOf(".badge-open{"), css.indexOf(".badge-open{") + 280);
  const time = css.slice(css.indexOf(".badge-time{"), css.indexOf(".badge-time{") + 220);
  check("the chip uses the yellow tokens",
    chip.indexOf("var(--color-yellow)") !== -1 && chip.indexOf("var(--color-on-yellow)") !== -1);
  check("Open now uses deep jade and white",
    open.indexOf("var(--color-jade)") !== -1 && open.indexOf("color:#fff") !== -1);
  check("time pills use the yellow tokens",
    time.indexOf("var(--color-yellow)") !== -1 && time.indexOf("var(--color-on-yellow)") !== -1);
  check("these rules do not use coral",
    (chip + open + time).indexOf("coral") === -1 && (chip + open + time).indexOf("#FF5A5F") === -1);
  check("night yellow stays #F2C94C with forest ink",
    css.indexOf("--color-yellow:#F2C94C") !== -1 && css.indexOf("--color-on-yellow:#0F4D3A") !== -1);
});

function scheduledIdea(id, title, cost, today) {
  return {
    id: "db:" + id,
    dbId: id,
    title: title,
    description: "A show tonight.",
    materials: [],
    category: "Dancing & Live Entertainment",
    setting: "Indoor",
    season: ["Fall"],
    food: false,
    age21: false,
    cost: cost,
    duration: "Short (1-2 hrs)",
    time: ["Morning"],
    vibe: ["Chill"],
    stage: ["First Date"],
    dateType: ["Solo/Couple"],
    occurrences: { kind: "dates", dates: [{ date: today }] },
    expires_at: today
  };
}

section("the Tonight view lists scheduled events, then anytime ideas", () => {
  const today = occ.denverToday(new Date());
  const emptyApp = loadApp({});
  emptyApp.state.filters.tonight = true;
  const evening = emptyApp.IDEAS_BY_ID[54];
  check("the evening catalog idea is anytime", evening.occurrences == null && util.alsoGoodTonight(evening, new Date()) === true);
  check("that idea is not on the chip", emptyApp.tonightMatchCount() === 0);
  const emptyScreen = textOf(emptyApp.buildDiscoverScreen());
  const nothingAt = emptyScreen.indexOf("Nothing scheduled near you tonight");
  const alsoAt = emptyScreen.indexOf("Also good tonight");
  const eveningAt = emptyScreen.indexOf(evening.title);
  check("zero tonight events use the scheduled empty state",
    nothingAt !== -1 && emptyScreen.indexOf("No matches yet") === -1 && emptyScreen.indexOf("Clear Filters") === -1);
  check("the empty state offers widen radius", emptyScreen.indexOf("Widen radius") !== -1);
  check("Also good tonight follows the empty state and lists the anytime idea",
    alsoAt !== -1 && nothingAt < alsoAt && eveningAt > alsoAt);
  check("widen radius steps to the next stop",
    emptyApp.state.filters.radiusMiles === 10 && emptyApp.widenTonightRadius() === 25 &&
    emptyApp.state.filters.radiusMiles === 25);
  emptyApp.state.filters.radiusMiles = 50;
  check("widen radius stays at the widest stop", emptyApp.widenTonightRadius() === 50);

  const t = loadApp({});
  const added = t.applyRemoteIdeas([
    scheduledIdea(88001, "Scheduled Tonight Concert", "Free", today),
    scheduledIdea(88002, "Scheduled Paid Show", "$20-$30", today)
  ]);
  check("the scheduled events join the deck", added.length === 2);
  t.state.filters.tonight = true;
  check("the chip counts both scheduled events and not the anytime idea",
    t.tonightMatchCount() === 2 && util.suitsTonight(t.IDEAS_BY_ID[54], new Date()) === false);
  t.state.filters.cost = ["Free"];
  check("the chip count still honors the other filters", t.tonightMatchCount() === 1);
  t.state.filters.cost = [];
  const screen = textOf(t.buildDiscoverScreen());
  const split = screen.indexOf("Also good tonight");
  const before = split === -1 ? screen : screen.slice(0, split);
  const after = split === -1 ? "" : screen.slice(split);
  check("scheduled events show before Also good tonight",
    split !== -1 &&
    before.indexOf("Scheduled Tonight Concert") !== -1 &&
    before.indexOf("Scheduled Paid Show") !== -1 &&
    before.indexOf("Nothing scheduled near you tonight") === -1);
  check("the anytime evening idea is only in Also good tonight",
    after.indexOf(evening.title) !== -1 && before.indexOf(evening.title) === -1);
  check("a scheduled event is not repeated under Also good tonight",
    after.indexOf("Scheduled Tonight Concert") === -1);
});

module.exports = { pass: pass, fail: fail };
