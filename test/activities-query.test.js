/* buildListQuery is pure SQL: filters, clamps, and parameterization.
   No database. */
"use strict";

const { buildListQuery, METERS_PER_MILE } = require("../db/activities-repo");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
function section(title, fn) {
  console.log("\n" + title);
  try { fn(); }
  catch (e) { check("section ran without throwing", false, String(e.message).slice(0, 160)); }
}

function throwsFilter(params, field) {
  try {
    buildListQuery(params);
    return false;
  } catch (err) {
    return err.code === "invalid_filter" && err.field === field;
  }
}

section("defaults", () => {
  const q = buildListQuery({});
  check("approved and free are required",
    q.text.indexOf("status = 'approved'") !== -1 && q.text.indexOf("tier = 'free'") !== -1);
  check("default limit and offset", q.limit === 50 && q.offset === 0);
  check("unordered by distance", q.text.indexOf("ORDER BY id") !== -1 && q.located === false);
  check("limit and offset are parameters",
    q.values[q.values.length - 2] === 50 && q.values[q.values.length - 1] === 0);
});

section("filters become parameters", () => {
  const attack = "Free'; DROP TABLE activities;--";
  check("unknown cost throws invalid_filter", throwsFilter({ cost: attack }, "cost"));
  const q = buildListQuery({
    cost: "Free",
    duration: "Quick (under 1 hr),Full day",
    setting: "Indoor",
    time: "Evening",
    vibe: "Chill,Cozy",
    season: "Winter",
    stage: "First Date",
    dateType: "Solo/Couple",
    food: "true",
    category: "Hiking & Nature"
  });
  check("equality uses ANY", q.text.indexOf("cost = ANY(") !== -1 && q.text.indexOf("duration = ANY(") !== -1);
  check("arrays overlap", q.text.indexOf("time && ") !== -1 && q.text.indexOf("date_type && ") !== -1);
  check("setting keeps Both", q.text.indexOf("setting = 'Both'") !== -1);
  check("food is a parameter", q.values.indexOf(true) !== -1 && q.text.indexOf("food = ") !== -1);
  const flat = JSON.stringify(q.values);
  check("user strings are in values",
    flat.indexOf("Free") !== -1 && flat.indexOf("Indoor") !== -1 && flat.indexOf("Hiking & Nature") !== -1);
  check("user strings are not in the SQL text",
    q.text.indexOf("Free") === -1 && q.text.indexOf("Indoor") === -1 &&
    q.text.indexOf("Hiking") === -1 && q.text.indexOf(attack) === -1 &&
    q.text.indexOf("Evening") === -1 && q.text.indexOf("Quick") === -1);
  check("bad vibe throws", throwsFilter({ vibe: "Chill,Nope" }, "vibe"));
  check("bad food throws", throwsFilter({ food: "yes" }, "food"));
  check("bad category throws", throwsFilter({ category: "Not A Category" }, "category"));
  const over = buildListQuery({ cost: "Over $100" });
  check("Over $100 is an accepted cost",
    over.text.indexOf("cost = ANY(") !== -1 && JSON.stringify(over.values).indexOf("Over $100") !== -1);
  check("Over $100 stays out of the SQL text", over.text.indexOf("Over $100") === -1);
  const hidden = buildListQuery({ hide21: "true" });
  check("hide21=true keeps age21 rows out", hidden.text.indexOf("age21 = false") !== -1);
  check("hide21=true does not interpolate the query string", hidden.text.indexOf("true") === -1);
  check("hide21=false does not add the age21 predicate", buildListQuery({ hide21: "false" }).text.indexOf("age21 = false") === -1);
  check("hide21=maybe throws", throwsFilter({ hide21: "maybe" }, "hide21"));
});

section("location, radius, page clamps", () => {
  check("lat without lng throws", throwsFilter({ lat: "40.76" }, "lng"));
  check("lng without lat throws", throwsFilter({ lng: "-111.89" }, "lat"));
  check("lat out of range throws", throwsFilter({ lat: "91", lng: "0" }, "lat"));
  check("lng out of range throws", throwsFilter({ lat: "0", lng: "181" }, "lng"));
  const q = buildListQuery({
    lat: "40.76049",
    lng: "-111.891",
    radiusMiles: "500",
    limit: "9999",
    offset: "-4"
  });
  check("lat/lng rounded to 2 decimals", q.values.indexOf(40.76) !== -1 && q.values.indexOf(-111.89) !== -1);
  check("rounded values are not written into the SQL",
    q.text.indexOf("40.76") === -1 && q.text.indexOf("-111.89") === -1);
  check("radius clamped to 100 miles", q.values.indexOf(100 * METERS_PER_MILE) !== -1);
  check("within distance and order by distance",
    q.text.indexOf("ST_DWithin") !== -1 && q.text.indexOf("ORDER BY location <->") !== -1 && q.located === true);
  check("limit clamped to 200", q.limit === 200);
  check("offset clamped to 0", q.offset === 0);
  const page = buildListQuery({ limit: "0", offset: "999999", cursor: "3" });
  check("offset wins over cursor and clamps to 10000", page.offset === 10000);
  check("limit below 1 clamps to 1", page.limit === 1);
  const cursor = buildListQuery({ cursor: "25" });
  check("cursor is the offset when offset is absent", cursor.offset === 25);
  const defRadius = buildListQuery({ lat: 40.76, lng: -111.89 });
  check("radius defaults to 25 miles", defRadius.values.indexOf(25 * METERS_PER_MILE) !== -1);
});

section("paid rows stay gated", () => {
  check("query string cannot include paid", buildListQuery({ includePaid: "true" }).text.indexOf("tier = 'free'") !== -1);
  check("boolean includePaid drops the free clause", buildListQuery({ includePaid: true }).text.indexOf("tier = 'free'") === -1);
});

module.exports = { pass: pass, fail: fail };
