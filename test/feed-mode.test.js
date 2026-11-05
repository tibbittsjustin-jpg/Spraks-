/* Local Activities vs Happening, the Denver date window, the card bar,
   and new-first order. No database. */
"use strict";

const { loadApp } = require("./harness");
const occ = require("../public/occurrences");
const feed = require("../public/feed");
const sources = require("../public/data-sources");
const { buildListQuery, encodeCursor } = require("../db/activities-repo");

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

const SIX_PM = new Date("2026-11-01T00:00:00.000Z");
const TEN_PM = new Date("2026-11-01T04:00:00.000Z");
const BEFORE_MIDNIGHT = new Date("2026-11-01T05:30:00.000Z");
const AFTER_MIDNIGHT = new Date("2026-11-01T06:30:00.000Z");
const BEFORE_SPRING = new Date("2026-03-08T08:30:00.000Z");
const AFTER_SPRING = new Date("2026-03-08T09:30:00.000Z");

function dated(date, start, end, extra) {
  const entry = { date: date };
  if (start) entry.start = start;
  if (end) entry.end = end;
  return Object.assign({
    id: 1,
    title: "Show",
    time: [], vibe: [], season: [], stage: [], dateType: [],
    food: false, setting: "Indoor", cost: "Free",
    occurrences: { kind: "dates", dates: [entry] }
  }, extra || {});
}

function baseFilters(extra) {
  return Object.assign({
    duration: [], cost: [], time: [], setting: [], vibe: [], season: [], stage: [], dateType: [],
    food: null, hide21: false, localOnly: false, radiusMiles: 10,
    feedMode: "local", when: ""
  }, extra || {});
}

section("isDatedEvent", () => {
  check("a one-time dated row is dated",
    occ.isDatedEvent(dated("2026-11-15", "19:00", "21:00")) === true);
  check("a weekly row is anytime",
    occ.isDatedEvent({
      occurrences: { kind: "weekly", start: "2026-01-01", weekdays: ["Fri"], start_time: "19:00" }
    }) === false);
  check("a missing date is anytime", occ.isDatedEvent({ title: "Walk" }) === false);
  check("null occurrences are anytime", occ.isDatedEvent({ occurrences: null }) === false);
  check("a past one-time date is still dated",
    occ.isDatedEvent(dated("2020-01-01", "19:00")) === true);
  check("an end date without a start date is not dated",
    occ.isDatedEvent({
      occurrences: { kind: "weekly", end: "2026-12-01", weekdays: ["Fri"] }
    }) === false);
  check("a null row is not dated", occ.isDatedEvent(null) === false);
});

section("both modes, the default, and a saved choice", () => {
  const tonight = dated("2026-10-31", "19:00", "21:00", { id: 10, cost: "Free" });
  const otherDay = dated("2026-11-02", "19:00", "21:00", { id: 11, cost: "Free" });
  const morning = dated("2026-10-31", "10:00", "11:00", { id: 12, cost: "$20-$30" });
  const anytime = { id: 13, title: "Park", occurrences: null, cost: "Free", time: [], vibe: [], season: [], stage: [], dateType: [], food: false, setting: "Outdoor" };
  const weekly = {
    id: 14, title: "Market", cost: "Free", time: [], vibe: [], season: [], stage: [], dateType: [], food: false, setting: "Outdoor",
    occurrences: { kind: "weekly", start: "2026-01-01", weekdays: ["Sat"], start_time: "19:00", end_time: "21:00" }
  };
  const local = baseFilters();
  const happening = baseFilters({ feedMode: "happening", when: "tonight" });
  check("local hides a one-time event", feed.matchesFeed(tonight, local, SIX_PM) === false);
  check("local keeps an anytime place", feed.matchesFeed(anytime, local, SIX_PM) === true);
  check("local keeps a weekly row", feed.matchesFeed(weekly, local, SIX_PM) === true);
  check("tonight keeps the 7pm show", feed.matchesFeed(tonight, happening, SIX_PM) === true);
  check("tonight hides another day", feed.matchesFeed(otherDay, happening, SIX_PM) === false);
  check("tonight hides a weekly row", feed.matchesFeed(weekly, happening, SIX_PM) === false);
  check("tonight hides an anytime place", feed.matchesFeed(anytime, happening, SIX_PM) === false);
  check("a morning show that already ended stays out of tonight",
    feed.matchesFeed(morning, happening, SIX_PM) === false);
  check("a show whose end has passed stays out of tonight",
    feed.matchesFeed(tonight, happening, TEN_PM) === false);
  check("today still hides that ended show",
    feed.matchesFeed(tonight, baseFilters({ feedMode: "happening", when: "today" }), TEN_PM) === false);
  check("a later show is still tonight",
    feed.matchesFeed(dated("2026-10-31", "21:00", "23:00"), happening, TEN_PM) === true);
  const todayLocal = baseFilters({ when: "today" });
  check("a chosen day in local keeps every anytime place",
    feed.matchesFeed(anytime, todayLocal, SIX_PM) === true &&
    feed.matchesFeed(Object.assign({}, anytime, { openNow: false, closesAt: "5 pm" }), todayLocal, SIX_PM) === true);
  check("a chosen day in local adds that day's event",
    feed.matchesFeed(tonight, todayLocal, SIX_PM) === true);
  check("a chosen day in local skips another day's event",
    feed.matchesFeed(otherDay, todayLocal, SIX_PM) === false);

  const t = loadApp({});
  check("Local Activities is the default", t.state.filters.feedMode === "local" && t.state.filters.when === "");
  check("a morning catalog idea stays in the default deck", t.matchesFilters(t.IDEAS_BY_ID[2], t.state.filters) === true);
  const paid = Object.assign({}, t.IDEAS_BY_ID[2], { cost: "$20-$30" });
  check("cost still applies on top of the mode",
    t.matchesFilters(paid, Object.assign({}, t.state.filters, { cost: ["Free"] })) === false &&
    t.matchesFilters(t.IDEAS_BY_ID[2], Object.assign({}, t.state.filters, { feedMode: "happening", when: "tonight", cost: ["Free"] })) === false);

  const held = {};
  const chosen = occ.addDays(occ.denverToday(new Date()), 10);
  const first = loadApp(held);
  first.state.filters.feedMode = "happening";
  first.state.filters.when = chosen;
  first.state.location = { lat: 40.23, lng: -111.66 };
  first.saveState();
  const saved = JSON.parse(held.spark_state_v1);
  check("the saved mode is happening on the chosen day",
    saved.filters.feedMode === "happening" && saved.filters.when === chosen);
  check("the mode does not store a location",
    saved.filters.lat == null && saved.filters.lng == null && saved.filters.location == null);
  const again = loadApp(held);
  check("reloading restores the mode",
    again.state.filters.feedMode === "happening" && again.state.filters.when === chosen);
  again.ui.filterDraft = JSON.parse(JSON.stringify(again.state.filters));
  const toggle = again.buildFeedModeToggle();
  const labels = (toggle.children[0].children || []).map(node => node.innerHTML);
  check("the filters toggle offers Local Activities and Happening on that day",
    labels.indexOf("Local Activities") !== -1 && labels.join(" ").indexOf("Happening") !== -1,
    labels.join(" | "));
  function walk(node, acc) {
    acc = acc || [];
    if (!node || typeof node !== "object" || acc.indexOf(node) !== -1) return acc;
    acc.push(node);
    (node.children || []).forEach(child => walk(child, acc));
    return acc;
  }
  const pickerNodes = walk(again.buildWhenPicker());
  const pickerText = pickerNodes.map(node => (node.innerHTML || "") + "\n" + (node.className || "")).join("\n");
  const input = pickerNodes.filter(node => node.className === "when-date")[0];
  check("the date picker offers Tonight and Today",
    pickerText.indexOf("Tonight") !== -1 && pickerText.indexOf("Today") !== -1);
  check("the date input stops 14 days out",
    !!input && input.getAttribute("max") === feed.maxDate(new Date()) &&
    input.getAttribute("min") === occ.denverToday(new Date()));
});

section("14 Denver days, midnight, and the spring-forward hour", () => {
  check("the last allowed day is 14 days after Denver today",
    feed.dateAllowed(occ.addDays("2026-10-31", 14), BEFORE_MIDNIGHT) === true &&
    feed.maxDate(BEFORE_MIDNIGHT) === "2026-11-14");
  check("day 15 is outside the window",
    feed.dateAllowed("2026-11-15", BEFORE_MIDNIGHT) === false);
  check("just before Denver midnight is still October 31",
    occ.denverToday(BEFORE_MIDNIGHT) === "2026-10-31" && feed.maxDate(BEFORE_MIDNIGHT) === "2026-11-14");
  check("just after Denver midnight is November 1",
    occ.denverToday(AFTER_MIDNIGHT) === "2026-11-01" &&
    occ.denverClock(AFTER_MIDNIGHT).hour === 0 &&
    feed.maxDate(AFTER_MIDNIGHT) === "2026-11-15");
  check("the repeated 1:30am and the 3:30am after spring forward are the same civil day",
    occ.denverToday(BEFORE_SPRING) === "2026-03-08" &&
    occ.denverClock(BEFORE_SPRING).hour === 1 &&
    occ.denverToday(AFTER_SPRING) === "2026-03-08" &&
    occ.denverClock(AFTER_SPRING).hour === 3 &&
    feed.maxDate(BEFORE_SPRING) === "2026-03-22" &&
    feed.maxDate(AFTER_SPRING) === "2026-03-22");
  check("a date saved from yesterday drops off after midnight",
    feed.storedWhen("2026-10-31", AFTER_MIDNIGHT, "local") === "" &&
    feed.storedWhen("2026-10-31", AFTER_MIDNIGHT, "happening") === "tonight");
});

section("the happening bar", () => {
  const tonight = dated("2026-10-31", "19:00", "21:00");
  check("tonight uses the shared bar",
    feed.barText(tonight, SIX_PM) === "Happening Tonight \u00b7 7 PM");
  const future = dated("2026-11-15", "19:00", "21:00");
  check("a later date names the weekday and start",
    feed.barText(future, SIX_PM) === "Happening Sun, Nov 15 \u00b7 7 PM");
  check("a date with no clock leaves the time out",
    feed.barText(dated("2026-11-15"), SIX_PM) === "Happening Sun, Nov 15");
  check("an anytime card has no bar", feed.barText({ occurrences: null }, SIX_PM) === "");
  const t = loadApp({});
  const card = t.buildSwipeCard(future, false);
  check("a dated swipe card renders that bar",
    card.innerHTML.indexOf("happening-bar") !== -1 &&
    card.innerHTML.indexOf(feed.barText(future, new Date())) !== -1);
  function classText(node) {
    let out = node && node.className ? node.className + "\n" : "";
    (node && node.children || []).forEach(child => { out += classText(child); });
    return out;
  }
  const saved = t.buildSavedCard(future);
  check("a dated saved card renders that bar", classText(saved).indexOf("happening-bar") !== -1);
  const plain = t.buildSwipeCard(t.IDEAS_BY_ID[2], false);
  check("an anytime card does not render the bar", plain.innerHTML.indexOf("happening-bar") === -1);
});

section("new rows lead, with a stable id tiebreak", () => {
  function row(id, extra) {
    return Object.assign({
      id: id,
      title: "Row " + id,
      occurrences: { kind: "dates", dates: [{ date: "2026-11-15", start: "19:00" }] }
    }, extra || {});
  }
  const freshEarly = row(30, { source_key: "uofu", occurrences: { kind: "dates", dates: [{ date: "2026-11-15", start: "19:00" }] } });
  const freshLate = row(10, { source: "business", occurrences: { kind: "dates", dates: [{ date: "2026-11-15", start: "21:00" }] } });
  const freshTie = row(12, { source_key: "byu", occurrences: { kind: "dates", dates: [{ date: "2026-11-15", start: "19:00" }] } });
  const older = row(4, { source_key: "ugrc_trailheads", occurrences: { kind: "dates", dates: [{ date: "2026-11-15", start: "18:00" }] } });
  const ordered = [older, freshLate, freshEarly, freshTie].sort((a, b) => feed.compareHappening(a, b, "2026-11-15"));
  check("new rows come before an older place",
    ordered.map(item => item.id).join(",") === "12,30,10,4",
    ordered.map(item => item.id).join(","));
  check("the same start time breaks ties by id",
    feed.compareHappening(freshTie, freshEarly, "2026-11-15") < 0 &&
    feed.compareHappening(freshEarly, freshTie, "2026-11-15") > 0);
  const localIds = feed.partitionNewFirst([4, 30, 10, 12], id => ({ id: id, source_key: id >= 10 ? "uofu" : "ugrc_trailheads" }));
  check("local mode keeps today's order inside each group",
    localIds.join(",") === "30,10,12,4");

  const page = ordered.slice(0, 2);
  const cursor = {
    p: "h",
    n: sources.isNewRow(page[1]) ? 0 : 1,
    s: feed.startSortKey(page[1], "2026-11-15"),
    id: page[1].id
  };
  const rest = ordered.filter(item => feed.passesHappeningKeyset(item, cursor, "2026-11-15"));
  check("a happening page continues without overlap",
    rest.map(item => item.id).join(",") === "10,4",
    rest.map(item => item.id).join(","));
  const located = [
    { id: 2, source_key: "ugrc_parks", dist: 1 },
    { id: 8, source_key: "uofu", dist: 3 },
    { id: 9, source_key: "uofu", dist: null },
    { id: 3, source_key: "ugrc_parks", dist: null }
  ];
  located.sort((a, b) => {
    const phases = ["nn", "ng", "on", "og"];
    return phases.indexOf(feed.localPhase(a, true)) - phases.indexOf(feed.localPhase(b, true)) ||
      (Number(a.dist) || 0) - (Number(b.dist) || 0) || a.id - b.id;
  });
  const first = located[0];
  const localCursor = { p: feed.localPhase(first, true), id: first.id, d: String(first.dist) };
  const after = located.filter(item => feed.passesLocalKeyset(item, localCursor, true));
  check("a local distance page continues in phase order",
    feed.localPhase(first, true) === "nn" && after.map(item => item.id).join(",") === located.slice(1).map(item => item.id).join(","),
    after.map(item => item.id).join(","));

  const sql = buildListQuery({
    feed: "happening",
    when: "today",
    rank: "new",
    limit: 2
  });
  check("happening SQL orders new rows, then start, then id",
    sql.rank === "happening" &&
    sql.text.indexOf(sources.newRowSql()) !== -1 &&
    sql.text.indexOf("1441") !== -1 &&
    sql.text.indexOf("ORDER BY") !== -1);
  const pageToken = encodeCursor({ v: 2, p: "h", n: 0, s: 19 * 60, id: 30 });
  const next = buildListQuery({
    feed: "happening",
    when: "today",
    rank: "new",
    limit: 2,
    cursor: pageToken
  });
  check("the next happening page keeps the same order expression",
    next.text.indexOf("ORDER BY") !== -1 && next.text.indexOf(sources.newRowSql()) !== -1 &&
    next.values.indexOf(0) !== -1 && next.values.indexOf(19 * 60) !== -1 && next.values.indexOf(30) !== -1);
  const localSql = buildListQuery({ feed: "local", rank: "new", limit: 2 });
  check("local SQL asks for new rows before older rows",
    localSql.mode === "phases" &&
    localSql.phases.map(phase => phase.name).join(",") === "ni,oi" &&
    localSql.text.indexOf(sources.newRowSql()) !== -1);
  check("the read-only newness count uses that same predicate",
    sources.newRowCountSql().indexOf(sources.newRowSql()) !== -1 &&
    sources.newRowCountSql().indexOf("status = 'approved'") !== -1);
  check("openOnDay does not hide a place", feed.openOnDay({ title: "Park" }, "2026-11-15") === true);
});

module.exports = { pass: pass, fail: fail };
