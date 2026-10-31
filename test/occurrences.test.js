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
  const elevenThirty = new Date("2026-11-01T05:30:00.000Z");
  check("11:30pm Denver is still today even though UTC is already tomorrow",
    occ.denverToday(elevenThirty) === "2026-10-31", occ.denverToday(elevenThirty));
  check("an idea ending today in Denver still shows at 11:30pm",
    occ.visibleOnPlan({ expires_at: "2026-10-31", occurrences: null }, "", elevenThirty) === true);
  check("an idea that ended yesterday is hidden at 11:30pm Denver",
    occ.visibleOnPlan({ expiresAt: "2026-10-30" }, "", elevenThirty) === false);
  check("just after Denver midnight that end date is over",
    occ.visibleOnPlan({ expires_at: "2026-10-31" }, "", new Date("2026-11-01T06:00:00.000Z")) === false);
  check("a past list of dates with no end date is hidden",
    occ.visibleOnPlan({
      expires_at: null,
      occurrences: { kind: "dates", dates: [{ date: "2026-10-30", start: "19:00" }] }
    }, "", elevenThirty) === false);
  check("a date list whose last day is today still shows at 11:30pm Denver",
    occ.visibleOnPlan({
      expires_at: null,
      occurrences: { kind: "dates", dates: [{ date: "2026-10-30" }, { date: "2026-10-31" }] }
    }, "", elevenThirty) === true);
  check("an ongoing weekday pattern with no end date stays visible",
    occ.visibleOnPlan({
      expires_at: null,
      occurrences: { kind: "weekly", start: "2026-01-01", weekdays: ["Thu"] }
    }, "", elevenThirty) === true);
  check("a finished weekday range still relies on expires_at when that is empty",
    occ.visibleOnPlan({
      expires_at: null,
      occurrences: { kind: "weekly", start: "2026-01-01", end: "2026-02-01", weekdays: ["Mon"] }
    }, "", elevenThirty) === true);
  check("an anytime idea still shows on a plan date after its end date",
    occ.visibleOnPlan({ occurrences: null, expires_at: "2020-01-01" }, "2026-10-26", late) === true);
});

section("research ranges become a stored schedule", () => {
  const ongoing = occ.normalizeOccurrences([{
    start_date: "2026-10-31",
    end_date: null,
    weekdays: ["Thu", "Sat"],
    start: "21:00",
    end: "00:00",
    exclude: ["2026-12-24", "2026-12-26"]
  }]);
  check("an open weekday range stays weekly and keeps days off",
    ongoing.ok && ongoing.value.kind === "weekly" && ongoing.value.end == null &&
    ongoing.value.weekdays.join(",") === "Thu,Sat" &&
    ongoing.value.exclude.join(",") === "2026-12-24,2026-12-26");
  check("a day off is not a show day", occ.occursOn(ongoing.value, "2026-12-24") === false);
  check("a later Thursday still happens", occ.occursOn(ongoing.value, "2026-12-17") === true);
  const firstFriday = occ.normalizeOccurrences([{
    start_date: "2026-10-31",
    end_date: null,
    weekdays: ["Fri"],
    week_of_month: [1],
    start: "18:00",
    end: "21:00"
  }]);
  check("the first Friday of November happens",
    firstFriday.ok && occ.occursOn(firstFriday.value, "2026-11-06") === true);
  check("the second Friday does not", occ.occursOn(firstFriday.value, "2026-11-13") === false);
  const gap = occ.normalizeOccurrences([
    { start_date: "2026-11-21", end_date: "2026-12-19", weekdays: ["Sat"], start: "10:00", end: "15:00" },
    { start_date: "2027-01-09", end_date: "2027-01-09", weekdays: ["Sat"], start: "10:00", end: "15:00" }
  ]);
  check("two bounded ranges become the show days, not the gap",
    gap.ok && gap.value.kind === "dates" &&
    gap.value.dates.map(item => item.date).join(",") === "2026-11-21,2026-11-28,2026-12-05,2026-12-12,2026-12-19,2027-01-09");
  const shows = occ.normalizeOccurrences([
    { date: "2026-12-04", start: "19:00", end: null },
    { date: "2026-12-04", start: "13:00", end: null }
  ]);
  check("two times on one date are both kept, earliest first",
    shows.ok && shows.value.dates.map(item => item.start).join(",") === "13:00,19:00");
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
