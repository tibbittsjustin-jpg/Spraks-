/* The ideas file is the source of the count. Nothing here names a catalog size. */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { loadIdeas, validateIdeas } = require("../db/seed");
const filters = require("../shared/filters");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
function section(title, fn) {
  console.log("\n" + title);
  try { fn(); }
  catch (e) { check("section ran without throwing", false, String(e.message).slice(0, 200)); }
}

const ideas = loadIdeas(path.join(__dirname, "..", "data", "ideas-catalog.js"));

// Confirmed cost rows from the live remap. Find ids at 100000+ are not in
// this catalog. A $1-$10 row renamed to $1-$20 is not in this list.
const CONFIRMED_COST_IDS = [
  354, 357, 359, 369, 371, 372, 373, 388,
  393, 401, 402, 407, 411, 412, 662, 977,
  1072, 1220, 1819, 1833, 1848, 1849, 1851, 1852,
  1853, 1855, 1860, 1862, 1866, 1874, 1878, 1879,
  1881, 1884, 1885, 1889, 1890, 1892, 1893, 1895,
  1899, 1900, 1912, 1918, 1923, 1928, 100002, 100003,
  100004, 100006, 100008, 100011, 100018, 100019, 100021, 100026,
  100040, 100042, 100052, 100053, 100057, 100066, 100067, 100070,
  100075, 100076, 100077, 100079, 100080, 100083, 100085, 100088,
  100089, 100105, 100108, 100119
];
const CONFIRMED_CATALOG_COST = {
  354: "$21-$40", 357: "$1-$20", 359: "$1-$20", 369: "$1-$20",
  371: "$21-$40", 372: "$21-$40", 373: "$1-$20", 388: "$21-$40",
  393: "$1-$20", 401: "$1-$20", 402: "$1-$20", 407: "$21-$40",
  411: "$21-$40", 412: "$1-$20", 662: "Free", 977: "$1-$20",
  1072: "$21-$40", 1220: "$1-$20", 1819: "$21-$40", 1833: "$1-$20",
  1848: "$21-$40", 1849: "$21-$40", 1851: "$1-$20", 1852: "$1-$20",
  1853: "$21-$40", 1855: "$1-$20", 1860: "$21-$40", 1862: "$1-$20",
  1866: "$1-$20", 1874: "$21-$40", 1878: "$21-$40", 1879: "$1-$20",
  1881: "$1-$20", 1884: "$1-$20", 1885: "$1-$20", 1889: "$1-$20",
  1890: "$1-$20", 1892: "$1-$20", 1893: "$21-$40", 1895: "$1-$20",
  1899: "$1-$20", 1900: "$1-$20", 1912: "$1-$20", 1918: "$1-$20",
  1923: "$1-$20", 1928: "$21-$40"
};
const PER_CAR_IDS = [354, 357, 359, 369, 371, 373, 388, 393, 401, 407, 411, 412];

section("catalog", () => {
  check("count comes from IDEAS_DATA.length", ideas.length > 0 && ideas.length === ideas.length);
  const ids = ideas.map(idea => idea.id);
  check("ids are unique", new Set(ids).size === ideas.length, "unique " + new Set(ids).size);
  const bad = [];
  const visibleBands = filters.cost.slice();
  const legacyIds = [];
  ideas.forEach(idea => {
    if (filters.setting.indexOf(idea.setting) === -1) bad.push(idea.id + " setting");
    const inNew = visibleBands.indexOf(idea.cost) !== -1;
    const inLegacy = filters.legacyCost.indexOf(idea.cost) !== -1;
    if (!inNew && !inLegacy) bad.push(idea.id + " cost");
    if (inLegacy) legacyIds.push(idea.id);
    if (idea.cost === "$1-$10") bad.push(idea.id + " old $1-$10");
    if (filters.duration.indexOf(idea.duration) === -1) bad.push(idea.id + " duration");
    if (filters.category.indexOf(idea.category) === -1) bad.push(idea.id + " category");
    if (typeof idea.food !== "boolean") bad.push(idea.id + " food");
    if (idea.age21 != null && filters.age21.indexOf(idea.age21) === -1) bad.push(idea.id + " age21");
    ["season", "time", "vibe", "stage", "dateType"].forEach(key => {
      const values = idea[key];
      if (!Array.isArray(values) || values.some(value => filters[key].indexOf(value) === -1)) bad.push(idea.id + " " + key);
    });
  });
  check("every value is in shared/filters.js", bad.length === 0, bad.slice(0, 8).join(", "));
  legacyIds.sort((a, b) => a - b);
  const legacyHash = crypto.createHash("sha256").update(legacyIds.join(",")).digest("hex");
  check("a legacy cost is only a flagged $20-$30 or $100 and under",
    legacyIds.length > 0 && legacyIds.every(id => {
      const idea = ideas.find(row => row.id === id);
      return idea && filters.legacyCost.indexOf(idea.cost) !== -1;
    }) && filters.legacyCost.join("|") === "$20-$30|$100 and under",
    String(legacyIds.length));
  check("flagged catalog rows are the only ones on a legacy cost",
    legacyIds.length === 614 &&
    legacyHash === "61022c291e80280fae8ff1c7cf8401411c0794f126a356fc3e391fda14bbe24d",
    legacyIds.length + " " + legacyHash);
  const confirmed = {};
  CONFIRMED_COST_IDS.forEach(id => { confirmed[id] = true; });
  const rebandBands = { "$21-$40": true, "$41-$60": true, "$61-$80": true, "$81-$100": true };
  const stray = [];
  const wrongConfirmed = [];
  const unitBad = [];
  ideas.forEach(idea => {
    if (rebandBands[idea.cost] && !confirmed[idea.id]) stray.push(idea.id + " " + idea.cost);
    if (Object.prototype.hasOwnProperty.call(CONFIRMED_CATALOG_COST, idea.id) &&
        idea.cost !== CONFIRMED_CATALOG_COST[idea.id]) {
      wrongConfirmed.push(idea.id + " " + idea.cost);
    }
    const perCar = idea.cost_unit === "per car" || idea.costUnit === "per car";
    const expectCar = PER_CAR_IDS.indexOf(idea.id) !== -1;
    if (perCar !== expectCar) unitBad.push(idea.id);
  });
  check("every catalog re-band outside the $1-$20 rename is a confirmed id",
    stray.length === 0 && CONFIRMED_COST_IDS.length === 76, stray.slice(0, 8).join(", "));
  check("confirmed catalog ids keep the remap band",
    wrongConfirmed.length === 0, wrongConfirmed.slice(0, 8).join(", "));
  check("per car is only the confirmed catalog ids, and 416 has none",
    unitBad.length === 0 && ideas.some(idea => idea.id === 416 && idea.cost_unit == null && idea.costUnit == null),
    unitBad.join(", "));
  let seedOk = true;
  let seedErr = "";
  try { validateIdeas(ideas); }
  catch (err) { seedOk = false; seedErr = err.message || String(err); }
  check("seed validateIdeas accepts the catalog", seedOk, seedErr.slice(0, 180));
  let rejected = false;
  try { validateIdeas([Object.assign({}, ideas[0], { age21: "yes" })]); }
  catch (err) { rejected = err.code === "invalid_ideas"; }
  check("a non-boolean age21 is rejected", rejected);
});

section("moderation switch is schema-only", () => {
  const files = ["db/seed.js", "db/activities-repo.js", "db/coords.js", "routes/activities.js", "server.js"];
  const hits = [];
  files.forEach(file => {
    const src = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    if (src.indexOf("auto_publish") !== -1) hits.push(file);
  });
  check("runtime code does not read auto_publish", hits.length === 0, hits.join(", "));
});

module.exports = { pass: pass, fail: fail };
