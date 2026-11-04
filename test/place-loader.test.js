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

const coords = require("../db/place-coordinates");
const migrateLib = require("../db/migrate");
const rules = loader.loadRules();
const parks = seeds.datasetByKey("ugrc_parks");
const trails = seeds.datasetByKey("ugrc_trailheads");
const museums = seeds.datasetByKey("museums");
const nps = seeds.datasetByKey("nps");

function one(dataset, record) {
  return norm.normalizeRecord(dataset, record, rules, { ids: {}, uniqueUrls: {} });
}

check("213 rules compile", rules.length === 213);
check("filters.js cost list is unchanged",
  filters.cost.join("|") === "Free|$1-$10|$20-$30|$100 and under|Over $100");
check("Justin bands are the mapping keys",
  rulesLib.COST_BANDS.join("|") === "Free|$1-$20|$21-$40|$41-$60|$61-$80|$81-$100|Over $100");
check("$20 is the top of the first paid band", rulesLib.bandFee(20) === "$1-$20" && rulesLib.bandFee(21) === "$21-$40");
check("$100 is $81-$100 and $101 is Over $100",
  rulesLib.bandFee(100) === "$81-$100" && rulesLib.bandFee(101) === "Over $100");
check("a $15 fee stays on the new band in staging", () => {
  const row = one(nps, {
    name: "Sample Monument", private_vehicle_fee: "15", location: "Moab, UT",
    lat: 38.7, lng: -109.5, source_url: "https://www.nps.gov/arch/index.htm"
  });
  return row.cost === "$1-$20" && row.costBandNew === "$1-$20" && row.costRequested === "$1-$20" &&
    row.costUnit === "per car" && row.tagReview === true &&
    rulesLib.activityCostForPromote(row.costBandNew, "legacy") == null;
});
check("legacy promote maps only bands that sit inside one old band", () => {
  const previous = process.env.COST_BANDS_LIVE;
  delete process.env.COST_BANDS_LIVE;
  const mode = rulesLib.liveCostMode();
  if (previous == null) delete process.env.COST_BANDS_LIVE;
  else process.env.COST_BANDS_LIVE = previous;
  const map = {
    "Free": "Free",
    "$1-$20": null,
    "$21-$40": null,
    "$41-$60": "$100 and under",
    "$61-$80": "$100 and under",
    "$81-$100": "$100 and under",
    "Over $100": "Over $100"
  };
  const pairs = Object.keys(map).every(band => rulesLib.activityCostForPromote(band, "legacy") === map[band]);
  const asNew = rulesLib.activityCostForPromote("$1-$20", "new") === "$1-$20" &&
    rulesLib.activityCostForPromote("$21-$40", "new") === "$21-$40";
  let bad = "";
  try { rulesLib.liveCostMode("both"); }
  catch (err) { bad = err.code; }
  const sql = fs.readFileSync(path.join(__dirname, "..", "db", "migrations", "017_place_staging.sql"), "utf8");
  return mode === "legacy" && pairs && asNew && bad === "bad_cost_bands_live" &&
    sql.indexOf("cost_band_new") !== -1 &&
    sql.indexOf("add column if not exists cost_band") === -1 &&
    sql.indexOf("alter table public.activities add column") === -1 &&
    sql.indexOf("'$41-$60' then '$100 and under'") !== -1 &&
    sql.indexOf("'refused', refused") !== -1;
});
check("NPS is Free only when fee_display says No entrance fee listed", () => {
  const listed = one(nps, {
    name: "Timpanogos Cave National Monument", fee_display: "No entrance fee listed",
    vehicle_fee: "0", location: "American Fork, UT", lat: 40.44, lng: -111.71,
    source_url: "https://www.nps.gov/tica/index.htm"
  });
  const zeroOnly = one(nps, {
    name: "Sample National Historical Park", private_vehicle_fee: "0",
    location: "Brigham City, UT", lat: 41.6, lng: -112.5,
    source_url: "https://www.nps.gov/gosp/index.htm"
  });
  const otherDisplay = one(nps, {
    name: "Sample National Historical Park", vehicle_fee: "0",
    fee_display: "Entrance fee $0", location: "Brigham City, UT", lat: 41.6, lng: -112.5,
    source_url: "https://www.nps.gov/gosp/index.htm"
  });
  return listed.cost === "Free" && listed.costUnit == null &&
    zeroOnly.cost == null && zeroOnly.costRequested == null &&
    otherDisplay.cost == null && otherDisplay.costRequested == null &&
    zeroOnly.tagReview === true;
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

check("Future parks are excluded", () => {
  const row = one(parks, {
    name: "Tomorrow Park", type: "Park", acres: 5, STATUS: "Future",
    location: "Provo, Utah County, UT", lat: 40.23, lng: -111.66
  });
  return row.flags.statusFuture === true && row.excluded === true && row.status === "excluded" && row.tagReview === false;
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
check("Proposed, Planned, and Closed parks are excluded", () => {
  const rows = ["Proposed", "Planned", "Closed"].map(status => one(parks, {
    name: status + " Park", type: "Park", acres: 2, STATUS: status,
    location: "Provo, Utah County, UT", lat: 40.2, lng: -111.6
  }));
  return rows.every(row => row.excluded === true && row.status === "excluded") &&
    rows[0].flags.statusDrop === "Proposed" &&
    rows[1].flags.statusDrop === "Planned" &&
    rows[2].flags.statusDrop === "Closed";
});

check("a county in the city slot is not stored as a city", () => {
  const row = one(parks, {
    name: "County Seat Park", type: "Park", acres: 4,
    location: "Utah County, UT", lat: 40.1, lng: -111.6
  });
  return row.city == null && row.flags.cityBlank === true && row.flags.needsCity === true;
});
check("a repeated county name is not a city", () => {
  const row = one(parks, {
    name: "Cache Park", type: "Park", acres: 4,
    location: "Cache County, Cache County, UT", lat: 41.7, lng: -111.8
  });
  return row.city == null && row.flags.countyAsCity === true && row.flags.needsCity === true;
});
check("the attached parks file flags 143 rows needs_city", () => {
  const file = "/home/ubuntu/.cursor/projects/workspace/uploads/ugrc_parks_8e5b.json";
  if (!fs.existsSync(file)) return true;
  const rows = norm.normalizeDataset(parks, JSON.parse(fs.readFileSync(file, "utf8")), rules);
  const needs = rows.filter(row => row.flags.needsCity);
  return needs.length === 143 &&
    needs.filter(row => row.flags.cityBlank).length === 53 &&
    needs.filter(row => row.flags.countyAsCity).length === 90 &&
    needs.every(row => row.city == null);
});
check("a categories list matches when any element matches", () => {
  const rule = rulesLib.prepareRule({
    dataset: "museums", match_field: "categories", match_value: "^Art$", match_type: "regex",
    filter_values: ["vibe:Creative"], confidence_score: 0.8, confidence_level: "high",
    always_review: false, notes: "rule categories-001 priority 40"
  });
  const hit = rulesLib.applyRules(rules.concat([rule]), {
    name: "Hall", location: "Provo, Utah", categories: ["History", "Art"]
  }, "museums", { city: "Provo", fieldAllowlist: [] });
  const miss = rulesLib.applyRules(rules.concat([rule]), {
    name: "Hall", location: "Provo, Utah", categories: ["History"]
  }, "museums", { city: "Provo", fieldAllowlist: [] });
  return hit.mapped.vibe.indexOf("Creative") !== -1 && miss.mapped.vibe.indexOf("Creative") === -1;
});
check("primary_use matches Hiking, Mountain biking, and Multi-use", () => {
  trails.fieldAllowlist = ["primary_use", "Comments"];
  const hike = one(trails, { name: "Mill", location: "UT", lat: 40.4, lng: -111.5, primary_use: "Hiking" });
  const bike = one(trails, { name: "Mill", location: "UT", lat: 40.4, lng: -111.5, primary_use: "Mountain biking" });
  const multi = one(trails, { name: "Mill", location: "UT", lat: 40.4, lng: -111.5, primary_use: "Multi-use" });
  const coded = one(trails, { name: "Mill", location: "UT", lat: 40.4, lng: -111.5, primary_use: "MTB" });
  const junk = one(trails, { name: "Mill", location: "UT", lat: 40.4, lng: -111.5, primary_use: "closed for mud" });
  return hike.category === "Hiking & Nature" &&
    bike.category === "Outdoor Adventure & Extreme Sports" &&
    multi.category === "Hiking & Nature" &&
    coded.category === "Outdoor Adventure & Extreme Sports" &&
    junk.actions.indexOf("hold") !== -1;
});
check("a blank fee is unknown, not free", () => {
  const row = one(seeds.datasetByKey("stateparks"), {
    name: "Yuba State Park", location: "Utah", lat: 39.37, lng: -112.02,
    entrance_fee: "", source_url: "https://stateparks.utah.gov/parks/yuba/"
  });
  return row.cost == null && row.costRequested == null && row.costUnit == null && row.tagReview === true;
});
check("a vehicle fee is per car and a museum fee is per person", () => {
  const npsRow = one(nps, {
    name: "Arches National Park", vehicle_fee: "$20", location: "Moab, UT",
    lat: 38.7, lng: -109.5, source_url: "https://www.nps.gov/arch/index.htm"
  });
  const museum = one(museums, {
    name: "Town Museum", location: "Provo, Utah 84601", per_person_fee: "12",
    lat: 40.23, lng: -111.66, source_url: "https://artsandmuseums.utah.gov/utah-museums-directory/listing/town/"
  });
  return npsRow.costUnit === "per car" && npsRow.costRequested === "$1-$20" && museum.costUnit === "per person";
});
check("staging keeps the optional source fields", () => {
  const sql = fs.readFileSync(path.join(__dirname, "..", "db", "migrations", "017_place_staging.sql"), "utf8");
  return ["hours", "entrance_fee", "fee_display", "fee_url", "fee_as_of", "notice", "vehicle_fee", "more_info_url", "source_activity", "source_season", "open_status", "fee_fact", "source_activities", "reservable"].every(name => sql.indexOf(name) !== -1);
});
check("a GNIS spring is excluded", () => {
  const row = one(seeds.datasetByKey("ugrc_gnis"), { name: "Cold Spring", type: "Spring", lat: 40.1, lng: -111.5 });
  return row.excluded === true && row.flags.gnisSpring === true;
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
  const off = one(trails, { name: "Mill Canyon", location: "UT", lat: 37.4, lng: -113.4, Comments: "Mountain biking" });
  const saved = trails.fieldAllowlist.slice();
  trails.fieldAllowlist = [];
  const gatedOff = norm.normalizeRecord(trails, { name: "Mill Canyon", location: "UT", lat: 37.4, lng: -113.4, Comments: "Mountain biking" }, rules, { ids: {}, uniqueUrls: {} });
  trails.fieldAllowlist = saved;
  return off.category === "Outdoor Adventure & Extreme Sports" && gatedOff.category === "Hiking & Nature";
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
check("016 is main's nearby index migration",
  fs.existsSync(path.join(__dirname, "..", "db", "migrations", "016_nearby_keyset.sql")));
check("the loader does not accept promote or approve flags", () => {
  let promote = "";
  let approve = "";
  try { loader.parseArgs(["--promote", "--dataset", "ugrc_parks"]); }
  catch (err) { promote = err.code; }
  try { loader.parseArgs(["--approve-dataset", "ugrc_parks"]); }
  catch (err) { approve = err.code; }
  const readme = fs.readFileSync(path.join(__dirname, "..", "db", "place-loader", "README.md"), "utf8");
  const cli = fs.readFileSync(path.join(__dirname, "..", "db", "place-loader.js"), "utf8");
  return promote === "cli_flag_removed" && approve === "cli_flag_removed" &&
    readme.indexOf("--promote") === -1 && readme.indexOf("--approve-dataset") === -1 &&
    cli.indexOf('arg === "--promote"') !== -1;
});
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
check("museum and pool prices stay in review, and a state park fee is per car", () => {
  const museum = one(museums, {
    name: "Town Museum", location: "Provo, Utah 84601", lat: 40.23, lng: -111.66,
    source_url: "https://artsandmuseums.utah.gov/utah-museums-directory/listing/town/"
  });
  const pool = one(parks, {
    name: "City Aquatic Center", type: "Park", acres: 4,
    location: "Ogden, Weber County, UT", lat: 41.22, lng: -111.97
  });
  const missingFee = one(seeds.datasetByKey("stateparks"), {
    name: "Yuba State Park", location: "Utah", lat: 39.37, lng: -112.02,
    source_url: "https://stateparks.utah.gov/parks/yuba/"
  });
  const dayUse = one(seeds.datasetByKey("stateparks"), {
    name: "Yuba State Park", location: "Utah", lat: 39.37, lng: -112.02,
    entrance_fee: "$15", source_url: "https://stateparks.utah.gov/parks/yuba/"
  });
  return museum.costRequested === "$1-$20" && museum.costUnit === "per person" && museum.tagReview === true &&
    pool.costRequested === "$1-$20" && pool.tagReview === true &&
    missingFee.costRequested == null && missingFee.tagReview === true &&
    dayUse.costRequested === "$1-$20" && dayUse.costUnit === "per car";
});
check("Bingham Canyon is not a Bing source, and Bing Maps and bing.com are refused", () => {
  const canyon = coords.acceptCoordinates(40.52, -112.15, "Bingham Canyon");
  const gate = coords.acceptCoordinates(40.3, -111.7, "Applegate");
  const ville = coords.acceptCoordinates(40.3, -111.7, "Googleville");
  let maps = "";
  let host = "";
  let earth = "";
  try { coords.acceptCoordinates(40.5, -112.1, "Bing Maps"); }
  catch (err) { maps = err.code; }
  try { coords.acceptCoordinates(40.5, -112.1, "bing.com"); }
  catch (err) { host = err.code; }
  try { coords.acceptCoordinates(40.5, -112.1, "virtualearth"); }
  catch (err) { earth = err.code; }
  return canyon.lat === 40.52 && canyon.suspiciousPin === false &&
    gate.lat === 40.3 && ville.lat === 40.3 &&
    maps === "rejected_coordinate_source" &&
    host === "rejected_coordinate_source" &&
    earth === "rejected_coordinate_source" &&
    coords.bannedCoordinateSource("Bingham Canyon") == null &&
    coords.bannedCoordinateSource("Bing Maps") === "bing" &&
    coords.bannedCoordinateSource("bing.com") === "bing";
});
check("an OSM or Nominatim coordinate is refused", () => {
  let osm = "";
  let nomi = "";
  let google = "";
  try { coords.acceptCoordinates(40.2, -111.6, "OpenStreetMap"); }
  catch (err) { osm = err.code; }
  try { coords.acceptCoordinates(40.2, -111.6, "Nominatim cache"); }
  catch (err) { nomi = err.code; }
  try { coords.acceptCoordinates(40.2, -111.6, "Google"); }
  catch (err) { google = err.code; }
  const rejected = one(museums, {
    name: "Hall", location: "Provo, Utah 84601", lat: 40.23, lng: -111.66,
    geo_source: "nominatim", suggested_lat: 40.3, suggested_lng: -111.7,
    suggested_why: "OpenStreetMap",
    source_url: "https://artsandmuseums.utah.gov/utah-museums-directory/listing/hall/"
  });
  const kept = one(parks, {
    name: "Liberty Park", type: "Park", acres: 80, lat: 40.74, lng: -111.87,
    location: "Salt Lake City, Salt Lake County, UT",
    suggested_lat: 40.1, suggested_lng: -111.1, suggested_why: "osm name disagree"
  });
  const ugrc = coords.acceptCoordinates(40.7, -111.8, "ugrc_address_point");
  return osm === "rejected_coordinate_source" && nomi === "rejected_coordinate_source" &&
    google === "rejected_coordinate_source" &&
    rejected.lat == null && rejected.lng == null && rejected.flags.coordinateRejected === "nominatim" &&
    rejected.flags.suspiciousPin === true && rejected.raw.suggested_lat == null &&
    kept.lat === 40.74 && kept.lng === -111.87 && kept.flags.suspiciousPin === true &&
    ugrc.lat === 40.7 && ugrc.suspiciousPin === false &&
    fs.readFileSync(path.join(__dirname, "..", "db", "place-coordinates.js"), "utf8").indexOf("cap") === -1;
});
check("a museum category string is renamed and is not a match field", () => {
  const row = one(museums, {
    name: "Art Hall", location: "Provo, Utah 84601", category: "History",
    categories: ["Art"], lat: 40.23, lng: -111.66,
    source_url: "https://artsandmuseums.utah.gov/utah-museums-directory/listing/art-hall/"
  });
  const tagged = rulesLib.applyRules(rules, {
    name: "Art Hall", location: "Provo, Utah", source_primary_category: "History", categories: ["Art"]
  }, "museums", { city: "Provo", fieldAllowlist: [] });
  const blocked = rules.filter(rule => rule.matchField === "source_primary_category" || rule.matchField === "category");
  return row.sourcePrimaryCategory === "History" && row.raw.category == null &&
    row.vibe.indexOf("Creative") !== -1 &&
    tagged.matched.every(rule => rule.matchField !== "source_primary_category") &&
    blocked.length === 0;
});
check("migration 017 is applied after 018", () => {
  const files = migrateLib.migrationFiles(path.join(__dirname, "..", "db", "migrations"));
  return files.indexOf("016_nearby_keyset.sql") !== -1 &&
    files.indexOf("016_nearby_keyset.sql") < files.indexOf("018_cost_bands_20.sql") &&
    files.indexOf("018_cost_bands_20.sql") < files.indexOf("017_place_staging.sql");
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

function refusal(source) {
  try {
    coords.acceptCoordinates(40.2, -111.6, source);
    return { code: "", source: null };
  } catch (err) {
    return { code: err.code, source: err.source };
  }
}
check("separator and camelCase coordinate labels are refused", () => {
  const cases = [
    ["osm_nominatim", ["osm", "nominatim"]],
    ["nominatim_geocode", ["nominatim"]],
    ["google_places", ["google"]],
    ["google-maps", ["google"]],
    ["maps.googleapis.com", ["google"]],
    ["gmaps", ["google"]],
    ["GooglePlaces", ["google"]],
    ["apple_maps", ["apple"]],
    ["apple-maps", ["apple"]],
    ["MapKit", ["apple"]],
    ["bing_maps", ["bing"]],
    ["bing-maps", ["bing"]],
    ["bing.com", ["bing"]],
    ["virtualearth.net", ["bing"]],
    ["BingMaps", ["bing"]],
    ["openstreetmap.org", ["osm"]],
    ["osm-derived", ["osm"]],
    ["OSMNominatim", ["osm", "nominatim"]],
    ["photon.komoot.io", ["osm"]],
    ["photon", ["osm"]],
    ["komoot", ["osm"]],
    ["reserveamerica", ["reserveamerica"]],
    ["reserveamerica.com", ["reserveamerica"]],
    ["ReserveAmerica", ["reserveamerica"]],
    ["utahstateparks.reserveamerica.com", ["reserveamerica"]],
    ["https://utahstateparks.reserveamerica.com/camping/x", ["reserveamerica"]],
    ["RESERVEAMERICA", ["reserveamerica"]],
    ["reserve_america", ["reserveamerica"]],
    ["reserve-america", ["reserveamerica"]],
    ["Reserve America GPS Info", ["reserveamerica"]]
  ];
  for (let i = 0; i < cases.length; i++) {
    const got = refusal(cases[i][0]);
    if (got.code !== "rejected_coordinate_source" || cases[i][1].indexOf(got.source) === -1) {
      throw new Error(cases[i][0] + " -> " + got.code + " " + got.source);
    }
  }
  return true;
});
check("place names and allowed coordinate labels still pass", () => {
  const labels = [
    "Bingham Canyon", "Bingham_Canyon", "bingham-canyon-trailhead",
    "Applegate", "Googleville", "Snapple Center",
    "UGRC Address Points", "ugrc_address_point", "ugrc_address_points_local_export",
    "Utah Parks Local", "nps_api",
    "stateparks.utah.gov", "Utah State Parks park page", "UGRC State Park Points",
    "USGS GNIS Domestic Names", "America First Event Center", "Reserve at Lake Point",
    "reserve the pavilion"
  ];
  for (let i = 0; i < labels.length; i++) {
    const row = coords.acceptCoordinates(40.2, -111.6, labels[i]);
    if (coords.bannedCoordinateSource(labels[i]) != null || row.lat !== 40.2 || row.suspiciousPin !== false) {
      throw new Error(labels[i] + " was refused");
    }
  }
  return coords.sourceTokens("GooglePlaces").join(" ") === "google places" &&
    coords.sourceTokens("OSMNominatim").join(" ") === "osm nominatim" &&
    coords.bannedCoordinateSource("MapKit") === "apple";
});
check("an ODbL dataset's own geometry is still refused", () => {
  const row = one(seeds.datasetByKey("osm_osp"), {
    name: "OSM Viewpoint", location: "Moab, UT", lat: 38.57, lng: -109.55
  });
  const noCity = one(seeds.datasetByKey("osm_osp"), {
    name: "OSM Viewpoint", location: "UT", lat: 38.57, lng: -109.55
  });
  return row.lat == null && row.lng == null && row.flags.coordinateRejected === "osm" &&
    row.city === "Moab" && row.geoStatus === "area_based" && row.geoSource === "osm_osp" &&
    row.needsHandPin === false && row.flags.geoSource !== "openstreetmap" &&
    noCity.lat == null && noCity.needsHandPin === true && noCity.geoStatus == null &&
    noCity.flags.areaLevelNeedsCity === true;
});

const areaLib = require("../db/place-area-level");
function placed(extra) {
  return one(parks, Object.assign({
    name: "Liberty Park", type: "Park", acres: 80,
    city: "Salt Lake City", location: "Salt Lake City, Salt Lake County, UT",
    lat: 40.746321, lng: -111.873654
  }, extra || {}));
}
function isArea(row, source) {
  const flags = JSON.stringify(row.flags);
  return row.lat == null && row.lng == null &&
    row.geoStatus === "area_based" && row.flags.geoStatus === "area_based" &&
    row.geoSource === source && row.flags.geoSource === source &&
    row.city === "Salt Lake City" && row.needsHandPin === false &&
    Array.isArray(row.flags.areaLevel) && row.flags.areaLevel.length > 0 &&
    flags.indexOf("40.746321") === -1 && flags.indexOf("-111.873654") === -1;
}
check("a geocode within 100 m keeps the pin", () => {
  const exact = placed({ uncertainty_m: 100, spread_m: 10, geo_source: "ugrc_address_point" });
  const sixty = placed({ uncertainty_m: 60, geo_source: "ugrc_address_point" });
  const house = placed({
    match_method: "nearest_house_number", uncertainty_m: 48, geo_source: "ugrc_address_point"
  });
  const spread = placed({ spread_m: 100, geo_source: "ugrc_address_point" });
  return exact.lat === 40.746321 && exact.lng === -111.873654 && exact.geoStatus == null &&
    exact.needsHandPin === false && exact.flags.areaLevel == null &&
    sixty.lat === 40.746321 && house.lat === 40.746321 && spread.lat === 40.746321 &&
    areaLib.AREA_LEVEL_THRESHOLD_M === 100;
});
check("a match more than 100 m off is area level", () => {
  const uncertainty = placed({ uncertainty_m: 150, geo_source: "ugrc_address_point" });
  const spread = placed({ spread_m: 120, geo_source: "ugrc_address_point" });
  const justOver = placed({ uncertainty_m: "100.4", geo_source: "ugrc_address_points_local_export" });
  const both = placed({ uncertainty_m: 40, spread_m: 180, geo_source: "ugrc_address_point" });
  return isArea(uncertainty, "ugrc_address_point") &&
    uncertainty.flags.areaLevel.some(reason => reason.indexOf("uncertainty") !== -1) &&
    isArea(spread, "ugrc_address_point") &&
    spread.flags.areaLevel.some(reason => reason.indexOf("spread") !== -1) &&
    isArea(justOver, "ugrc_address_points_local_export") &&
    isArea(both, "ugrc_address_point");
});
check("a street-only or ZIP-only match is area level", () => {
  const street = placed({ match_method: "street_only", geo_source: "ugrc_address_point" });
  const streetBasis = placed({ match_basis: "street", geo_source: "ugrc_address_point" });
  const dashed = placed({ match_method: "street-only", geo_source: "ugrc_address_point" });
  const zip = placed({ match_basis: "ZIP", geo_source: "ugrc_address_point" });
  const zipOnly = placed({ match_method: "zip_only", geo_source: "ugrc_address_point" });
  return isArea(street, "ugrc_address_point") && isArea(streetBasis, "ugrc_address_point") &&
    isArea(dashed, "ugrc_address_point") && isArea(zip, "ugrc_address_point") &&
    isArea(zipOnly, "ugrc_address_point");
});
check("unknown uncertainty on a geocoded match is area level", () => {
  const missing = placed({ match_method: "address_point", uncertainty_m: null, geo_source: "ugrc_address_point" });
  const unknown = placed({ match_method: "interpolated", uncertainty_m: "unknown", geo_source: "ugrc_address_point" });
  const rooftop = placed({ geocode_quality: "rooftop", geo_source: "ugrc_address_point" });
  const blank = placed({ uncertainty_m: "", match_method: "parcel", geo_source: "ugrc_address_point" });
  return isArea(missing, "ugrc_address_point") &&
    missing.flags.areaLevel.indexOf("uncertainty unknown") !== -1 &&
    isArea(unknown, "ugrc_address_point") && isArea(rooftop, "ugrc_address_point") &&
    isArea(blank, "ugrc_address_point");
});
check("dataset geometry with no geocode metadata keeps its pin", () => {
  const own = placed({});
  const named = placed({ geo_source: "Utah Parks Local" });
  const parksPage = placed({ geo_source: "stateparks.utah.gov" });
  const gnis = placed({ geo_source: "USGS GNIS Domestic Names" });
  const ugrc = placed({ geo_source: "UGRC State Park Points" });
  return own.lat === 40.746321 && own.lng === -111.873654 && own.geoStatus == null &&
    own.flags.areaLevel == null && own.needsHandPin === false &&
    named.lat === 40.746321 && parksPage.lat === 40.746321 &&
    gnis.lat === 40.746321 && ugrc.lat === 40.746321 &&
    coords.bannedCoordinateSource("Utah Parks Local") == null;
});
check("an area-level row without a city is not promotable", () => {
  const row = one(parks, {
    name: "Edge Park", type: "Park", acres: 2, location: "UT",
    lat: 40.21, lng: -111.61, uncertainty_m: 250, geo_source: "ugrc_address_point"
  });
  return row.lat == null && row.lng == null && row.city == null &&
    row.needsHandPin === true && row.geoStatus == null &&
    row.flags.areaLevelNeedsCity === true &&
    Array.isArray(row.flags.areaLevel) && row.flags.geoStatus == null;
});
check("a neighbour snap or source-marked area drops the pin", () => {
  const intersection = placed({
    match_basis: "nearest_address_point_to_intersection", geo_source: "ugrc_address_point"
  });
  const neighbor = placed({ match_basis: "neighbor_address_point", uncertainty_m: 12, geo_source: "ugrc_address_point" });
  const note = placed({
    note: "Start area 22nd St & Washington Blvd; nearest UGRC address point.",
    geo_source: "ugrc_address_point"
  });
  const marked = placed({ location_precision: "area", geo_source: "ugrc_address_point" });
  return isArea(intersection, "ugrc_address_point") && isArea(neighbor, "ugrc_address_point") &&
    isArea(note, "ugrc_address_point") && isArea(marked, "ugrc_address_point");
});
check("a ReserveAmerica coordinate is area level when the city is known", () => {
  const labeled = placed({ geo_source: "utahstateparks.reserveamerica.com GPS Info" });
  const url = placed({
    geo_source: "ugrc_address_point",
    coord_source_url: "https://utahstateparks.reserveamerica.com/camping/x"
  });
  const noCity = one(parks, {
    name: "Edge Park", type: "Park", acres: 2, location: "UT",
    lat: 40.21, lng: -111.61, geo_source: "ReserveAmerica"
  });
  const flags = JSON.stringify(labeled.flags) + JSON.stringify(url.flags);
  return labeled.lat == null && labeled.lng == null &&
    labeled.flags.coordinateRejected === "reserveamerica" &&
    labeled.geoStatus === "area_based" && labeled.geoSource === "ugrc_parks" &&
    labeled.needsHandPin === false && labeled.city === "Salt Lake City" &&
    url.flags.coordinateRejected === "reserveamerica" &&
    url.geoStatus === "area_based" && url.geoSource === "ugrc_address_point" &&
    url.needsHandPin === false &&
    noCity.lat == null && noCity.needsHandPin === true && noCity.geoStatus == null &&
    noCity.flags.coordinateRejected === "reserveamerica" &&
    noCity.flags.areaLevelNeedsCity === true &&
    flags.indexOf("40.746321") === -1 && flags.indexOf("reserveamerica.com") === -1;
});
check("pin QA leaves an area-level city row unpinned and not a hand pin", () => {
  const row = placed({ uncertainty_m: 150, geo_source: "ugrc_address_point" });
  const batch = pinQa.qaBatch([row], { refs: { cities: [] } });
  return row.lat == null && row.needsHandPin === false &&
    row.pinQa.status === "area_based" && batch.handPinQueue.length === 0;
});

console.log("\n" + pass + " passed, " + fail + " failed");
module.exports = { pass: pass, fail: fail };
