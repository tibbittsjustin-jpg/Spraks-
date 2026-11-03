/* Place loader: rules, credits, source-field facts, and the ODbL wall.
   SQL dedupe runs only when TEST_DATABASE_URL points at localhost. */
"use strict";

const fs = require("fs");
const path = require("path");
const filters = require("../shared/filters");
const rulesLib = require("../db/place-rules");
const seeds = require("../db/place-seeds");
const norm = require("../db/place-normalize");
const loader = require("../db/place-loader");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (typeof cond === "function") {
    try { cond = cond(); }
    catch (err) { extra = err.message; cond = false; }
  }
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}

const rules = loader.loadRules();
const parks = seeds.datasetByKey("ugrc_parks");
const trails = seeds.datasetByKey("ugrc_trailheads");
const museums = seeds.datasetByKey("museums");
const nps = seeds.datasetByKey("nps");

function one(dataset, record) {
  return norm.normalizeRecord(dataset, record, rules, { ids: {}, uniqueUrls: {} });
}

check("192 rules compile", rules.length === 192);
check("filters.js cost list is unchanged",
  filters.cost.join("|") === "Free|$1-$10|$20-$30|$100 and under|Over $100");
check("Justin bands are the mapping keys",
  rulesLib.COST_BANDS.join("|") === "Free|$1-$20|$21-$40|$41-$60|$61-$80|$81-$100|Over $100");
check("$20 is the top of the first paid band", rulesLib.bandFee(20) === "$1-$20" && rulesLib.bandFee(21) === "$21-$40");
check("$100 is $81-$100 and $101 is Over $100",
  rulesLib.bandFee(100) === "$81-$100" && rulesLib.bandFee(101) === "Over $100");
check("a $15 per-car fee asks for $1-$20 and is not stored yet", () => {
  const row = one(nps, {
    name: "Sample Monument", private_vehicle_fee: "15", location: "Moab, UT",
    lat: 38.7, lng: -109.5, source_url: "https://www.nps.gov/arch/index.htm"
  });
  return row.cost == null && row.costRequested === "$1-$20" && row.costUnit === "per car" && row.tagReview === true;
});
check("a free fee stores Free and no cost unit", () => {
  const row = one(nps, {
    name: "Sample National Historical Park", private_vehicle_fee: "0",
    location: "Brigham City, UT", lat: 41.6, lng: -112.5,
    source_url: "https://www.nps.gov/gosp/index.htm"
  });
  return row.cost === "Free" && row.costUnit == null;
});
check("a per-person fee is labeled per person", () => {
  const tagged = rulesLib.applyRules(rules, { name: "Hall", location: "Provo, Utah", per_person_fee: "50" }, "museums", { city: "Provo", fieldAllowlist: [] });
  return tagged.costRequested === "$1-$20" && tagged.costUnit === "per person";
});

check("dog parks are excluded", one(parks, {
  name: "Rover Dog Park", type: "Park", acres: 3, location: "Ogden, Weber County, UT", lat: 41.22, lng: -111.97
}).excluded === true);
check("a college campus park is not held", () => {
  const row = one(parks, {
    name: "University Park", type: "Park", acres: 4, location: "Logan, Cache County, UT", lat: 41.74, lng: -111.83
  });
  return row.excluded === false && row.actions.indexOf("hold") === -1;
});
check("a children's museum is not held", () => {
  const row = one(museums, {
    name: "Discovery Gateway", location: "Salt Lake City, Utah 84101",
    lat: 40.76, lng: -111.89, source_url: "https://artsandmuseums.utah.gov/utah-museums-directory/listing/discovery/"
  });
  return row.excluded === false && row.actions.indexOf("hold") === -1 && row.category === "Culture, Community & Local Attractions";
});

check("Future parks are held and not excluded", () => {
  const row = one(parks, {
    name: "Tomorrow Park", type: "Park", acres: 5, STATUS: "Future",
    location: "Provo, Utah County, UT", lat: 40.23, lng: -111.66
  });
  return row.flags.statusFuture === true && row.excluded === false && row.tagReview === true && row.status === "pending";
});
check("a blank status is counted and is not a Future hold", () => {
  const row = one(parks, {
    name: "Liberty Park", type: "Neighborhood Park", acres: 80, STATUS: "",
    location: "Salt Lake City, Salt Lake County, UT", lat: 40.74, lng: -111.87
  });
  return row.flags.statusBlank === true && row.flags.statusMissing === false && row.flags.statusFuture === false && row.excluded === false;
});
check("a missing status field is counted separately", () => {
  const row = one(parks, {
    name: "Liberty Park", type: "Neighborhood Park", acres: 80,
    location: "Salt Lake City, Salt Lake County, UT", lat: 40.74, lng: -111.87
  });
  return row.flags.statusMissing === true && row.flags.statusBlank === false && row.excluded === false;
});
check("Proposed still excludes when the field is present",
  one(parks, { name: "Someday Park", type: "Park", acres: 2, STATUS: "Proposed", location: "Provo, Utah County, UT", lat: 40.2, lng: -111.6 }).excluded === true);

check("a county in the city slot is not stored as a city", () => {
  const row = one(parks, {
    name: "County Seat Park", type: "Park", acres: 4,
    location: "Utah County, UT", lat: 40.1, lng: -111.6
  });
  return row.city == null && row.flags.countyAsCity === true;
});
check("Logan stays a city when the county is only the second part",
  one(parks, { name: "Lundstrom Park", type: "Neighborhood Park", acres: 19, location: "Logan, Cache County, UT", lat: 41.75, lng: -111.79 }).city === "Logan");

check("trailheads with location UT need a city and skip a city claim", () => {
  const row = one(trails, {
    name: "Deer Creek Parkway North", location: "UT", lat: 40.48, lng: -111.48,
    source_url: "https://opendata.gis.utah.gov/datasets/9c21cc1f95ba40468deb36bb6fd94943_0"
  });
  return row.flags.needsCity === true && row.city == null && row.needsHandPin === false && row.flags.cityLookup === "not_cleared";
});
check("Comments are ignored until the allowlist says so", () => {
  const off = one(trails, { name: "Mill Canyon", location: "UT", lat: 37.4, lng: -113.4, Comments: "MTB" });
  const onRules = rules.concat([rulesLib.prepareRule({
    dataset: "ugrc_trailheads", match_field: "Comments", match_value: "^MTB$", match_type: "regex",
    filter_values: ["category:Outdoor Adventure & Extreme Sports"],
    confidence_score: 0.8, confidence_level: "high", always_review: false,
    notes: "rule comments-001 priority 40"
  })]);
  trails.fieldAllowlist = ["Comments"];
  const on = norm.normalizeRecord(trails, { name: "Mill Canyon", location: "UT", lat: 37.4, lng: -113.4, Comments: "MTB" }, onRules, { ids: {}, uniqueUrls: {} });
  trails.fieldAllowlist = [];
  return off.category === "Hiking & Nature" && on.category === "Outdoor Adventure & Extreme Sports";
});
check("museum type is gated the same way", () => {
  const off = one(museums, { name: "Art Hall", location: "Provo, Utah 84601", museum_type: "Art", source_url: "https://artsandmuseums.utah.gov/utah-museums-directory/listing/art-hall/" });
  return off.vibe.indexOf("Creative") === -1;
});

check("file credit text is ignored", () => {
  const row = one(trails, {
    name: "Deer Creek", location: "UT", lat: 40.4, lng: -111.4,
    source_credit: "Trailhead data geocoded",
    source_url: "https://opendata.gis.utah.gov/datasets/9c21cc1f95ba40468deb36bb6fd94943_0"
  });
  return row.sourceCredit === trails.creditLine && row.sourceCredit.indexOf("geocod") === -1;
});
check("NPS rows without coordinates need a hand pin",
  one(nps, { name: "Arches National Park", location: "Moab, UT", lat: null, lng: null, source_url: "https://www.nps.gov/arch/index.htm" }).needsHandPin === true);
check("an NPS API url is not kept", () => {
  const row = one(nps, { name: "Arches National Park", location: "Moab, UT", source_url: "https://developer.nps.gov/api/v1/parks?parkCode=arch" });
  return row.link == null && row.linkFlag === "missing";
});
check("a non-Utah NPS address is review",
  one(nps, { name: "Old Spanish National Historic Trail", location: "Santa Fe, NM", source_url: "https://www.nps.gov/olsp/index.htm" }).excluded === true ||
  one(nps, { name: "Glen Canyon National Recreation Area", location: "Page, AZ", source_url: "https://www.nps.gov/glca/index.htm" }).tagReview === true);
check("a generic park keeps its source name and a city display title", () => {
  const row = one(parks, { name: "City Park", type: "City Park", acres: 3, location: "Ogden, Weber County, UT", lat: 41.22, lng: -111.97 });
  return row.title === "City Park (Ogden)" && row.sourceName === "City Park" && row.genericName === true && row.dedupeRadiusM === 50 && row.tagReview === true;
});

check("schools are excluded and cannot load", () => {
  let code = "";
  try { seeds.assertCanLoad(seeds.datasetByKey("ugrc_schools")); }
  catch (err) { code = err.code; }
  return code === "dataset_excluded";
});
check("an OSM park is refused", () => {
  let code = "";
  try { seeds.assertFeatureAllowed(seeds.datasetByKey("osm_osp"), "park"); }
  catch (err) { code = err.code; }
  return code === "odbl_feature_conflict" && seeds.osmFeatureAllowed("viewpoint") === true;
});
check("ODbL stays disabled until Justin approves it", () => {
  let code = "";
  const osm = Object.assign({}, seeds.datasetByKey("osm_osp"), { loadEnabled: true, excluded: false });
  try { seeds.assertCanLoad(osm); } catch (err) { code = err.code; }
  return code === "odbl_not_approved";
});
check("fee inheritance stays off", norm.inheritTrailheadParkFees([], false).applied === false);
check("a bare expires_at date is kept as a Denver day",
  norm.denverCalendarDate("2026-11-03") === "2026-11-03");
check("a UTC midnight timestamp uses the Denver calendar date",
  norm.denverCalendarDate("2026-11-03T00:00:00Z") === "2026-11-02");
check("anytime places write a null expires_at",
  one(parks, { name: "Liberty Park", type: "Park", acres: 5, location: "Provo, Utah County, UT", lat: 40.23, lng: -111.66 }).expiresAt === null);

const migration = fs.readFileSync(path.join(__dirname, "..", "db", "migrations", "017_place_staging.sql"), "utf8");
check("migration 017 has the rule columns and priority",
  ["dataset", "match_field", "match_value", "match_type", "filter_values", "confidence_score", "confidence_level", "always_review", "priority", "notes"].every(name => migration.indexOf(name) !== -1));
check("migration refuses an ODbL cross match", migration.indexOf("ODbL isolation") !== -1 && migration.indexOf("coalesce(a.odbl, false) = s.odbl") !== -1);
check("promote refuses an unapproved dataset", migration.indexOf("refusing to promote unapproved dataset") !== -1);
check("cost_unit is on activities and staging", migration.indexOf("cost_unit") !== -1);
check("015 and 016 are not migration files",
  fs.readdirSync(path.join(__dirname, "..", "db", "migrations")).every(name => name.indexOf("015_") !== 0 && name.indexOf("016_") !== 0));
check("the loader refuses a remote database", () => {
  let code = "";
  try { loader.assertLocalDatabase("postgres://user:pw@db.supabase.co:5432/postgres"); }
  catch (err) { code = err.code; }
  return code === "refusing_remote_database";
});

check("promote waits for migration 018", migration.indexOf("migration 018 is required") !== -1);
check("017 does not add activities.cost_unit", migration.indexOf("add column if not exists cost_unit") === -1);
check("$20 and $25-$35 land on the new bands after stripping $ and commas", () => {
  const twenty = one(nps, {
    name: "Arches National Park", private_vehicle_fee: "$20", location: "Moab, UT",
    lat: 38.7, lng: -109.5, source_url: "https://www.nps.gov/arch/index.htm"
  });
  const thirty = one(nps, {
    name: "Zion National Park", private_vehicle_fee: "$35", location: "Springdale, UT",
    lat: 37.2, lng: -113.0, source_url: "https://www.nps.gov/zion/index.htm"
  });
  const thousand = one(nps, {
    name: "Sample National Park", private_vehicle_fee: "$1,000", location: "Moab, UT",
    lat: 38.6, lng: -109.6, source_url: "https://www.nps.gov/cany/index.htm"
  });
  return twenty.costRequested === "$1-$20" && twenty.costUnit === "per car" &&
    thirty.costRequested === "$21-$40" && thirty.costUnit === "per car" &&
    thousand.costRequested === "Over $100";
});
check("museum, pool and state park defaults are low-confidence $1-$20 and review", () => {
  const museum = one(museums, {
    name: "Town Museum", location: "Provo, Utah 84601", lat: 40.23, lng: -111.66,
    source_url: "https://artsandmuseums.utah.gov/utah-museums-directory/listing/town/"
  });
  const pool = one(parks, {
    name: "City Aquatic Center", type: "Park", acres: 4,
    location: "Ogden, Weber County, UT", lat: 41.22, lng: -111.97
  });
  const statePark = one(seeds.datasetByKey("stateparks"), {
    name: "Yuba State Park", location: "Utah", lat: 39.37, lng: -112.02,
    source_url: "https://stateparks.utah.gov/parks/yuba/"
  });
  return museum.costRequested === "$1-$20" && museum.tagReview === true &&
    pool.costRequested === "$1-$20" && pool.tagReview === true &&
    statePark.costRequested === "$1-$20" && statePark.tagReview === true;
});
const pinQa = require("../db/place-pin-qa");
const dedupeConfig = require("../db/place-dedupe-config");
check("a gateway town beyond 40 km fails", () => {
  const result = pinQa.checkRow({
    datasetKey: "ugrc_trailheads", title: "Far Trail", sourceName: "Far Trail",
    city: "Moab", lat: 41.7, lng: -111.8, odbl: false
  }, { cities: [{ name: "Moab", lat: 38.57, lng: -109.55 }] });
  return result.checks.some(item => item.code === "GATEWAY_FAR" && item.severity === "fail");
});
check("a non-Utah ZIP fails and a temple-grid address fails", () => {
  const zip = pinQa.addressChecks("Granary Arts, Helper, UT 85662");
  const grid = pinQa.addressChecks("301 S West Temple, Salt Lake City, UT 84101");
  return zip.some(item => item.code === "ZIP_NOT_UTAH") && grid.some(item => item.code === "GRID_TEMPLE_AXIS");
});
check("the hand-pin queue keeps 40 groups", () => {
  const rows = [];
  for (let i = 0; i < 45; i++) {
    rows.push({
      datasetKey: "museums", title: "Hall " + i, sourceName: "Hall " + i, city: "Town" + i,
      lat: 40.2, lng: -111.6 - i * 0.05, address: (i + 1) + " N " + (100 + i) + " E", odbl: false, flags: {}
    });
  }
  rows.forEach(row => { row.pinQa = { status: "needs_hand_pin", placeType: "venue", checks: [] }; });
  const hand = pinQa.handPinQueue(rows, 40);
  return hand.queue.length === 40 && hand.deferred.length === 5;
});
check("pin QA does not call Nominatim",
  fs.readFileSync(path.join(__dirname, "..", "db", "place-pin-qa.js"), "utf8").indexOf("nominatim.openstreetmap.org") === -1);
check("trail segments collapse by trail name before dedupe", () => {
  const trails = dedupeConfig.aggregateTrailSegments([
    { trail_name: "Shoreline", lat: 40.7, lng: -111.8 },
    { trail_name: "Shoreline", lat: 40.8, lng: -111.7 },
    { name: "Other" }
  ]);
  return trails.length === 2 && trails[0].segmentCount === 2;
});
check("Round 8 dedupe keeps OSM isolated and prefers a federal trailhead page",
  dedupeConfig.dedupeRuleFor("osm_osp").length === 0 &&
  dedupeConfig.dedupeRuleFor("ugrc_trailheads").some(rule => rule.keep === "usfs or blm") &&
  dedupeConfig.ROUND8_DEDUPE.some(rule => rule.id === "peaks" && rule.match.indexOf("1000") !== -1));

console.log("\n" + pass + " passed, " + fail + " failed");
module.exports = { pass: pass, fail: fail };
