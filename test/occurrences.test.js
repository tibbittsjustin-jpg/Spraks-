/* Plan-date visibility. Dates are America/Denver civil days, not UTC
   and not the device clock. No database. */
"use strict";

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
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 400)); }
}

const GAME = {
  title: "Basketball",
  time: [], vibe: [], season: [], stage: [], dateType: [],
  food: false, setting: "Indoor",
  occurrences: { kind: "dates", dates: [{ date: "2026-10-27", start: "19:00", end: "21:00" }] }
};
const WEEKLY = {
  title: "Market",
  time: [], vibe: [], season: [], stage: [], dateType: [],
  food: false, setting: "Outdoor",
  occurrences: { kind: "weekly", start: "2026-10-01", end: "2026-10-31", weekdays: ["Mon"] }
};
const ANYTIME = {
  title: "Walk",
  time: [], vibe: [], season: [], stage: [], dateType: [],
  food: false, setting: "Outdoor",
  occurrences: null
};

section("calendar days do not follow UTC", () => {
  check("October 26 2026 is a Monday", occ.weekdayName("2026-10-26") === "Mon");
  check("October 27 2026 is a Tuesday", occ.weekdayName("2026-10-27") === "Tue");
  const late = new Date("2026-07-15T05:30:00.000Z");
  check("11:30pm Denver is still the previous civil day", occ.denverToday(late) === "2026-07-14", occ.denverToday(late));
  const midnight = new Date("2026-07-15T06:00:00.000Z");
  check("midnight Denver is the new civil day", occ.denverToday(midnight) === "2026-07-15", occ.denverToday(midnight));
});

section("a plan date keeps only events that occur that day", () => {
  check("a plan on the 26th hides a game on the 27th", occ.visibleOnPlan(GAME, "2026-10-26", new Date()) === false);
  check("the same game shows on the 27th", occ.visibleOnPlan(GAME, "2026-10-27", new Date()) === true);
  check("a Monday market shows on Monday", occ.visibleOnPlan(WEEKLY, "2026-10-26", new Date()) === true);
  check("a Monday market is hidden on Tuesday", occ.visibleOnPlan(WEEKLY, "2026-10-27", new Date()) === false);
  check("a Monday market is hidden outside its range", occ.visibleOnPlan(WEEKLY, "2026-11-02", new Date()) === false);
  check("an anytime idea shows on a plan date", occ.visibleOnPlan(ANYTIME, "2026-10-26", new Date()) === true);
  check("an idea with no occurrences field shows on a plan date",
    occ.visibleOnPlan({ title: "Picnic" }, "2026-10-27", new Date()) === true);
});

section("with no plan date, events show until expires_at in Denver", () => {
  const late = new Date("2026-07-15T05:30:00.000Z");
  check("an idea ending today in Denver still shows just before midnight",
    occ.visibleOnPlan({ expires_at: "2026-07-14", occurrences: null }, "", late) === true);
  check("an idea that ended yesterday in Denver is hidden",
    occ.visibleOnPlan({ expires_at: "2026-07-13", occurrences: { kind: "dates", dates: [{ date: "2026-07-13" }] } }, "", late) === false);
  check("just after Denver midnight the previous end date is over",
    occ.visibleOnPlan({ expires_at: "2026-07-14" }, "", new Date("2026-07-15T06:00:00.000Z")) === false);
  check("no end date stays visible", occ.visibleOnPlan(ANYTIME, "", late) === true);
  check("an anytime idea still shows on a plan date after its end date",
    occ.visibleOnPlan({ occurrences: null, expires_at: "2020-01-01" }, "2026-10-26", late) === true);
});

section("the discover deck uses the active plan date", () => {
  const t = loadApp({});
  const open = {
    duration: [], cost: [], time: [], setting: [], vibe: [], season: [], stage: [], dateType: [],
    food: null, hide21: false, localOnly: false, tonight: false, radiusMiles: 10
  };
  t.state.datePlans.push({
    id: "p26", name: "Monday", date: "2026-10-26", createdAt: "2026-10-01", ideaIds: [], friendPicks: []
  });
  t.ui.activePlanId = "p26";
  check("a plan on the 26th hides a game on the 27th", t.matchesFilters(GAME, open) === false);
  check("a weekly Monday event stays in that plan", t.matchesFilters(WEEKLY, open) === true);
  check("an anytime idea stays in that plan", t.matchesFilters(ANYTIME, open) === true);
  t.ui.activePlanId = null;
  check("clearing the plan shows the game again when it has not expired",
    t.matchesFilters(Object.assign({}, GAME, { expires_at: "2099-01-01" }), open) === true);
});

module.exports = { pass: pass, fail: fail };
