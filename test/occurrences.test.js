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
  check("11:30pm Denver is not past on the expires_at day",
    occ.isPast({ expires_at: "2026-10-31" }, elevenThirty) === false);
  check("just after Denver midnight that day is past",
    occ.isPast({ expires_at: "2026-10-31" }, new Date("2026-11-01T06:00:00.000Z")) === true);
  check("an anytime idea is not past", occ.isPast(ANYTIME, elevenThirty) === false);
  check("a finished date list is past in Denver",
    occ.isPast({
      expires_at: null,
      occurrences: { kind: "dates", dates: [{ date: "2026-10-30" }] }
    }, elevenThirty) === true);
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
  check("an open weekday range keeps its clock times",
    ongoing.ok && ongoing.value.start_time === "21:00" && ongoing.value.end_time === "00:00");
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
  check("clearing the plan keeps the one-time game in the mixed list",
    t.matchesFilters(Object.assign({}, GAME, { expires_at: "2099-01-01" }), open) === true);
});

function onDay(date, start, end) {
  const entry = { date: date };
  if (start) entry.start = start;
  if (end) entry.end = end;
  return { title: "Show", occurrences: { kind: "dates", dates: [entry] } };
}

section("occurs tonight uses the Denver civil day and clock", () => {
  const late = new Date("2026-11-01T05:30:00.000Z");
  const localDay = late.getFullYear() + "-" + String(late.getMonth() + 1).padStart(2, "0") + "-" +
    String(late.getDate()).padStart(2, "0");
  check("11:30pm Denver is still October 31", occ.denverToday(late) === "2026-10-31" && occ.denverClock(late).hour === 23);
  check("a date-only event today matches", occ.occursTonight(onDay("2026-10-31"), late) === true);
  check("a date-only event on the UTC day does not", occ.occursTonight(onDay("2026-11-01"), late) === false);
  check("a dated event with no time matches at noon Denver",
    occ.occursTonight(onDay("2026-10-31"), new Date("2026-10-31T18:00:00.000Z")) === true);
  check("anytime is not tonight", occ.occursTonight({ title: "Walk", occurrences: null }, late) === false);
  check("a missing schedule is not tonight", occ.occursTonight({ title: "Walk" }, late) === false);

  const noEnd = onDay("2026-10-31", "19:00");
  check("just inside the three-hour grace is still tonight",
    occ.occursTonight(noEnd, new Date("2026-11-01T03:59:00.000Z")) === true);
  check("three hours past a start with no end is over",
    occ.occursTonight(noEnd, new Date("2026-11-01T04:00:00.000Z")) === false);
  check("a 4:00pm start with no end is tonight",
    occ.occursTonight(onDay("2026-10-31", "16:00"), new Date("2026-10-31T22:00:00.000Z")) === true);
  check("a 4:00pm start is over three hours later",
    occ.occursTonight(onDay("2026-10-31", "16:00"), new Date("2026-11-01T01:00:00.000Z")) === false);
  check("an afternoon start with no end is not tonight",
    occ.occursTonight(onDay("2026-10-31", "15:00"), new Date("2026-10-31T23:00:00.000Z")) === false);

  const ended = onDay("2026-10-31", "19:00", "21:00");
  check("a show still running at 8:30pm is tonight",
    occ.occursTonight(ended, new Date("2026-11-01T02:30:00.000Z")) === true);
  check("a show is over once the end time has passed",
    occ.occursTonight(ended, new Date("2026-11-01T03:30:00.000Z")) === false);
  const afternoon = onDay("2026-10-31", "14:00", "18:00");
  check("an event that runs until 6pm is tonight at noon",
    occ.occursTonight(afternoon, new Date("2026-10-31T18:00:00.000Z")) === true);
  check("that event is over at 6:30pm",
    occ.occursTonight(afternoon, new Date("2026-11-01T00:30:00.000Z")) === false);
  check("a morning event is not tonight",
    occ.occursTonight(onDay("2026-10-31", "09:00", "12:00"), new Date("2026-10-31T18:00:00.000Z")) === false);
  check("a later show the same day keeps the idea tonight",
    occ.occursTonight({
      occurrences: { kind: "dates", dates: [
        { date: "2026-10-31", start: "13:00", end: "15:00" },
        { date: "2026-10-31", start: "19:00", end: "21:00" }
      ] }
    }, new Date("2026-11-01T02:00:00.000Z")) === true);

  const weekly = {
    title: "Late skate",
    occurrences: {
      kind: "weekly",
      start: "2026-01-01",
      weekdays: ["Thu"],
      start_time: "19:00",
      end_time: "22:00"
    }
  };
  check("a Thursday weekly show is tonight on Thursday",
    occ.occursTonight(weekly, new Date("2026-10-30T02:00:00.000Z")) === true);
  check("that weekly show is over after it ends",
    occ.occursTonight(weekly, new Date("2026-10-30T04:30:00.000Z")) === false);
  check("that weekly show is not tonight on Friday",
    occ.occursTonight(weekly, new Date("2026-10-30T20:00:00.000Z")) === false);
  check("a weekly rule with no clock time is not tonight",
    occ.occursTonight({
      occurrences: { kind: "weekly", start: "2026-01-01", weekdays: ["Thu"] }
    }, new Date("2026-10-30T02:00:00.000Z")) === false);
  check("a weekly end of midnight is still running at 11pm",
    occ.occursTonight({
      occurrences: {
        kind: "weekly",
        start: "2026-01-01",
        weekdays: ["Thu"],
        start_time: "21:00",
        end_time: "00:00"
      }
    }, new Date("2026-10-30T05:00:00.000Z")) === true);
  check("a daytime weekly rule is not tonight",
    occ.occursTonight({
      occurrences: {
        kind: "weekly",
        start: "2026-01-01",
        weekdays: ["Thu"],
        start_time: "10:00",
        end_time: "14:00"
      }
    }, new Date("2026-10-30T02:00:00.000Z")) === false);
  const research = {
    occurrences: [{
      start_date: "2026-01-01",
      end_date: null,
      weekdays: ["Thu"],
      start: "19:00",
      end: "22:00"
    }]
  };
  check("a research weekly range keeps its hours and matches Thursday night",
    occ.occursTonight(research, new Date("2026-10-30T02:00:00.000Z")) === true);

  if (localDay !== "2026-10-31") {
    check("this process calendar day is not the Denver day", localDay === "2026-11-01" && late.getHours() !== 23);
  }
});

section("occurs tonight ignores a non-Denver process timezone", () => {
  const { spawnSync } = require("child_process");
  const script = `
    const occ = require(${JSON.stringify(require("path").join(__dirname, "../public/occurrences.js"))});
    const late = new Date("2026-11-01T05:30:00.000Z");
    const inside = new Date("2026-11-01T03:59:00.000Z");
    const outside = new Date("2026-11-01T04:00:00.000Z");
    const pad = (n) => String(n).padStart(2, "0");
    const localDay = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    const noEnd = { occurrences: { kind: "dates", dates: [{ date: "2026-10-31", start: "19:00" }] } };
    process.stdout.write(JSON.stringify({
      localDay: localDay(late),
      localHour: late.getHours(),
      outsideHour: outside.getHours(),
      denverToday: occ.denverToday(late),
      today: occ.occursTonight({ occurrences: { kind: "dates", dates: [{ date: "2026-10-31" }] } }, late),
      utcDay: occ.occursTonight({ occurrences: { kind: "dates", dates: [{ date: "2026-11-01" }] } }, late),
      inside: occ.occursTonight(noEnd, inside),
      outside: occ.occursTonight(noEnd, outside)
    }));
  `;
  const run = spawnSync(process.execPath, ["-e", script], {
    env: Object.assign({}, process.env, { TZ: "Pacific/Auckland" }),
    encoding: "utf8"
  });
  let parsed = null;
  try { parsed = JSON.parse(run.stdout || ""); } catch (err) { parsed = null; }
  check("Auckland reports a different calendar day than Denver",
    run.status === 0 && parsed && parsed.localDay === "2026-11-01" && parsed.denverToday === "2026-10-31" &&
    parsed.localHour !== 23,
    run.stderr || run.stdout);
  check("the Denver date matches and the Auckland date does not",
    parsed && parsed.today === true && parsed.utcDay === false);
  check("the grace window follows Denver even when Auckland reads 5pm",
    parsed && parsed.inside === true && parsed.outside === false && parsed.outsideHour === 17);
});

module.exports = { pass: pass, fail: fail };
