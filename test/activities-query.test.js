/* buildListQuery is pure SQL: filters, clamps, and parameterization.
   No database. */
"use strict";

const { buildListQuery, mapRow, METERS_PER_MILE } = require("../db/activities-repo");

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
  check("omitting hide21 leaves 21+ rows included", q.text.indexOf("age21 = false") === -1);
  check("materials is selected", q.text.indexOf("materials") !== -1);
  check("source_url is selected for approved rows only",
    q.text.indexOf("source_url") !== -1 && q.text.indexOf("status = 'approved'") !== -1);
  check("occurrences are selected for approved rows only",
    q.text.indexOf("occurrences") !== -1 && q.text.indexOf("status = 'approved'") !== -1);
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
  const city = buildListQuery({ city: "Provo,orem" });
  const cityValues = city.values.find(value => Array.isArray(value) && value.indexOf("provo") !== -1);
  check("city filter compares lower(city)", city.text.indexOf("lower(city) = ANY(") !== -1);
  check("city values are lowercased parameters",
    !!cityValues && cityValues.length === 2 && cityValues[0] === "provo" && cityValues[1] === "orem");
  check("city names stay out of the SQL",
    city.text.toLowerCase().indexOf("provo") === -1 && city.text.toLowerCase().indexOf("orem") === -1);
  check("city is free text", buildListQuery({ city: "Not A Real City" }).text.indexOf("lower(city) = ANY(") !== -1);
  check("80-char city is accepted", buildListQuery({ city: "p".repeat(80) }).text.indexOf("lower(city) = ANY(") !== -1);
  check("81-char city throws", throwsFilter({ city: "p".repeat(81) }, "city"));
  check("one 81-char city in a list throws", throwsFilter({ city: "Provo," + "q".repeat(81) }, "city"));
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
  check("within distance of the point",
    q.text.indexOf("ST_DWithin") !== -1 && q.located === true);
  check("free near-me keeps general ideas and sorts pins first",
    q.text.indexOf("(location IS NULL OR ST_DWithin") !== -1 &&
    q.text.indexOf("ORDER BY CASE WHEN location IS NULL THEN 1 ELSE 0 END, location <->") !== -1 &&
    q.text.indexOf("NULLS LAST, id") !== -1 &&
    q.text.indexOf("location IS NOT NULL") === -1 &&
    q.localOnly === false);
  check("distance_miles is null for general ideas",
    q.text.indexOf("CASE WHEN location IS NULL THEN NULL ELSE ROUND((ST_Distance") !== -1);
  check("one limit and offset page both groups",
    q.text.split(" LIMIT ").length === 2 && q.text.split(" OFFSET ").length === 2 &&
    q.limit === 200 && q.offset === 0);
  check("limit clamped to 200", q.limit === 200);
  check("offset clamped to 0", q.offset === 0);
  const page = buildListQuery({ limit: "0", offset: "999999", cursor: "3" });
  check("offset wins over cursor and clamps to 10000", page.offset === 10000);
  check("limit below 1 clamps to 1", page.limit === 1);
  const cursor = buildListQuery({ cursor: "25" });
  check("cursor is the offset when offset is absent", cursor.offset === 25);
  const defRadius = buildListQuery({ lat: 40.76, lng: -111.89 });
  check("radius defaults to 25 miles", defRadius.values.indexOf(25 * METERS_PER_MILE) !== -1);
  const paged = buildListQuery({ lat: 40.76, lng: -111.89, limit: "10", offset: "15" });
  check("located limit and offset stay the last parameters",
    paged.values[paged.values.length - 2] === 10 && paged.values[paged.values.length - 1] === 15 &&
    paged.text.indexOf("LIMIT $" + (paged.values.length - 1)) !== -1 &&
    paged.text.indexOf("OFFSET $" + paged.values.length) !== -1);
});

section("localOnly restores pinned-only", () => {
  const free = buildListQuery({ lat: 40.76, lng: -111.89 });
  check("omitted localOnly includes general ideas",
    free.localOnly === false && free.text.indexOf("(location IS NULL OR ST_DWithin") !== -1);
  const off = buildListQuery({ lat: 40.76, lng: -111.89, localOnly: "0" });
  check("localOnly=0 matches the free near-me query",
    off.localOnly === false && off.text === free.text);
  check("localOnly false and 0 stay off",
    buildListQuery({ lat: 1, lng: 2, localOnly: false }).localOnly === false &&
    buildListQuery({ lat: 1, lng: 2, localOnly: 0 }).localOnly === false);
  const only = buildListQuery({ lat: "40.76049", lng: "-111.891", localOnly: "1" });
  check("localOnly=1 requires a pin inside the radius",
    only.localOnly === true && only.located === true &&
    only.text.indexOf("location IS NOT NULL") !== -1 &&
    only.text.indexOf("ST_DWithin") !== -1 &&
    only.text.indexOf("location IS NULL OR") === -1);
  check("localOnly=1 orders by distance the old way",
    only.text.indexOf("ORDER BY location <->") !== -1 &&
    only.text.indexOf("CASE WHEN location IS NULL THEN 1 ELSE 0 END") === -1);
  check("localOnly flag is not interpolated",
    only.text.indexOf("localOnly") === -1 && only.values.indexOf("1") === -1 && only.values.indexOf(1) === -1);
  check("boolean localOnly true is the same predicate",
    buildListQuery({ lat: 40.76, lng: -111.89, localOnly: true }).text.indexOf("location IS NOT NULL") !== -1);
  const bare = buildListQuery({ localOnly: "1" });
  check("localOnly without a point stays an unlocated catalog query",
    bare.located === false && bare.localOnly === true && bare.text.indexOf("ST_DWithin") === -1 &&
    bare.text.indexOf("ORDER BY id") !== -1);
  ["2", "true", "yes", "1.0", " 1", "01", 1.5, ["1"]].forEach(value => {
    check("localOnly " + JSON.stringify(value) + " is rejected", throwsFilter({ localOnly: value, lat: 40, lng: -111 }, "localOnly"));
  });
  check("invalid localOnly is rejected without coordinates", throwsFilter({ localOnly: "yes" }, "localOnly"));
});

section("pending status cannot be requested", () => {
  const q = buildListQuery({ status: "pending", source: "ai" });
  check("a status query param does not remove the approved filter",
    q.text.indexOf("status = 'approved'") !== -1 && q.text.indexOf("pending") === -1);
  check("a status query param is not bound", q.values.indexOf("pending") === -1 && q.values.indexOf("ai") === -1);
});

section("paid rows stay gated", () => {
  check("query string cannot include paid", buildListQuery({ includePaid: "true" }).text.indexOf("tier = 'free'") !== -1);
  check("boolean includePaid drops the free clause", buildListQuery({ includePaid: true }).text.indexOf("tier = 'free'") === -1);
});

section("mapRow materials", () => {
  const base = {
    id: 2, title: "T", description: "D", category: "Hiking & Nature", icon: "",
    setting: "Outdoor", season: [], food: false, cost: "Free", duration: "Short (1-2 hrs)",
    time: [], vibe: [], stage: [], date_type: [], scene: null, motif: null,
    source: "curated", tier: "free", address: null, lat: null, lng: null,
    affiliate_url: null, updated_at: null
  };
  check("null materials becomes []",
    JSON.stringify(mapRow(Object.assign({}, base, { materials: null }), false).materials) === "[]");
  check("missing materials becomes []",
    JSON.stringify(mapRow(base, false).materials) === "[]");
  check("materials pass through",
    JSON.stringify(mapRow(Object.assign({}, base, { materials: ["Boots", "Water"] }), false).materials) ===
    JSON.stringify(["Boots", "Water"]));
  const general = mapRow(Object.assign({}, base, { distance_miles: null, lat: null, lng: null }), true);
  check("null distance_miles stays off a general idea", general.distanceMiles === undefined && general.lat == null);
  const pin = mapRow(Object.assign({}, base, { distance_miles: "4.2", lat: 40.2, lng: -111.6 }), true);
  check("a pin distance is copied", pin.distanceMiles === 4.2 && pin.lat === 40.2);
  const linked = mapRow(Object.assign({}, base, { source_url: "https://example.com/place" }), false);
  check("mapRow returns source_url for the row",
    linked.source_url === "https://example.com/place" && linked.sourceUrl === linked.source_url);
  const blank = mapRow(base, false);
  check("a missing source_url maps to null", blank.source_url === null && blank.sourceUrl === null);
  const sched = mapRow(Object.assign({}, base, {
    occurrences: { kind: "dates", dates: [{ date: "2026-10-27", start: "19:00" }] }
  }), false);
  check("occurrences pass through for an approved row",
    sched.occurrences && sched.occurrences.kind === "dates" && sched.occurrences.dates[0].date === "2026-10-27");
  check("a missing occurrences map to null", mapRow(base, false).occurrences === null);
});

module.exports = { pass: pass, fail: fail };
