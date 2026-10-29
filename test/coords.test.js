/* Pure coordinate normalization, plus a check of the real Utah file when it is present.
   No database. */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { normalizeCoords, readCoordsFile, loadCoordsFromDir, KNOWN_STATUSES } = require("../db/coords");
const { loadIdeas } = require("../db/seed");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
function section(title, fn) {
  console.log("\n" + title);
  try { fn(); }
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 300)); }
}

const samplePath = path.join(__dirname, "fixtures", "coords", "utah.sample.json");
const sample = JSON.parse(fs.readFileSync(samplePath, "utf8"));

section("fixture mirrors the Utah file", () => {
  const norm = normalizeCoords(sample);
  const byId = {};
  norm.entries.forEach(entry => { if (entry.id != null) byId[entry.id] = entry; });

  const confident = byId[187];
  check("confident nominatim pin is applied",
    confident && confident.kind === "apply" && confident.pin && confident.coordsLocked === false &&
    confident.geoSource === "nominatim" && confident.geoConfidence === "high" &&
    confident.address.indexOf("Stewart Falls") !== -1);

  const locked = byId[1876];
  check("locked manual hand pin is applied and locked",
    locked && locked.kind === "apply" && locked.pin && locked.coordsLocked === true &&
    locked.geoSource === "manual" && locked.address.indexOf("101 W 100 N") !== -1);

  check("area_based is metadata only",
    byId[350] && byId[350].kind === "metadata" && byId[350].pin === false && byId[350].lat == null &&
    byId[350].geoStatus === "area_based");
  check("route_unpinned is metadata only",
    byId[361] && byId[361].kind === "metadata" && byId[361].pin === false && byId[361].geoStatus === "route_unpinned");
  check("flagged locked row stores the lock and no point",
    byId[105] && byId[105].kind === "metadata" && byId[105].pin === false && byId[105].coordsLocked === true &&
    byId[105].lat == null && byId[105].geoStatus === "flagged" && byId[105].geoSource === "manual");
  check("pending is accepted and not pinned",
    byId[500] && byId[500].kind === "metadata" && byId[500].pin === false && byId[500].geoStatus === "pending");

  const unknown = byId[12];
  check("unknown status is metadata only even with coordinates",
    unknown && unknown.kind === "metadata" && unknown.pin === false && unknown.geoStatus === "ambiguous");
  check("unknown status warns",
    norm.warnings.some(w => w.id === 12 && w.reason === "unknown_status"));
  check("key mismatch is skipped",
    norm.entries.some(e => e.kind === "invalid" && e.id === 14) &&
    norm.warnings.some(w => w.reason === "key_mismatch"));
  check("lat out of range is skipped",
    byId[15] && byId[15].kind === "invalid" &&
    norm.warnings.some(w => w.id === 15 && w.reason === "out_of_range"));
  check("known status set is the publisher's set",
    ["confident", "area_based", "route_unpinned", "flagged", "pending"].every(s => KNOWN_STATUSES.has(s)) &&
    !KNOWN_STATUSES.has("ambiguous") && !KNOWN_STATUSES.has("not_found") &&
    !KNOWN_STATUSES.has("venue_closed") && !KNOWN_STATUSES.has("out_of_state"));
});

section("array form, missing file, malformed file", () => {
  const asArray = normalizeCoords([
    sample["187"],
    { id: 350, status: "area_based", lat: null, lng: null, locked: false, source: "nominatim" }
  ]);
  check("array form is accepted",
    asArray.entries.length === 2 && asArray.entries[0].kind === "apply" && asArray.entries[1].kind === "metadata");

  const missing = readCoordsFile(path.join(os.tmpdir(), "spark-coords-missing-" + process.pid + ".json"));
  check("missing file is an empty result", missing.missing === true && missing.entries.length === 0);

  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "spark-coords-empty-"));
  const none = loadCoordsFromDir(emptyDir);
  check("empty directory does not throw", none.missing === true && none.entries.length === 0);

  const badDir = fs.mkdtempSync(path.join(os.tmpdir(), "spark-coords-bad-"));
  const badFile = path.join(badDir, "utah.json");
  fs.writeFileSync(badFile, "{");
  let message = "";
  try { loadCoordsFromDir(badDir); }
  catch (err) { message = err.message; }
  check("malformed JSON names the file", message.indexOf("utah.json") !== -1, message);
});

section("real data/coords/utah.json", () => {
  const file = path.join(__dirname, "..", "data", "coords", "utah.json");
  if (!fs.existsSync(file)) {
    console.log("  (no utah.json, skipping real-file checks)");
    return;
  }
  const ideas = loadIdeas(path.join(__dirname, "..", "public", "data.js"));
  const ids = new Set(ideas.map(idea => idea.id));
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const norm = normalizeCoords(json, { knownIds: ids });
  const byId = {};
  norm.entries.forEach(entry => { if (entry.id != null) byId[entry.id] = entry; });

  let badRange = 0;
  let unknownStatus = 0;
  Object.keys(json).forEach(key => {
    const entry = json[key];
    if (String(entry.id) !== key) badRange++;
    if (!ids.has(entry.id)) badRange++;
    const lat = entry.lat, lng = entry.lng;
    const absent = lat == null && lng == null;
    const ok = absent || (typeof lat === "number" && typeof lng === "number" &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180);
    if (!ok) badRange++;
    if (!KNOWN_STATUSES.has(entry.status)) unknownStatus++;
  });
  check("every real entry id is in the ideas file and lat/lng are null or in range", badRange === 0, String(badRange));
  check("real file only uses the known status set", unknownStatus === 0, String(unknownStatus));
  check("loader skips nothing in the real file",
    norm.entries.every(entry => entry.kind === "apply" || entry.kind === "metadata") &&
    norm.warnings.every(w => w.reason !== "unknown_id" && w.reason !== "out_of_range" && w.reason !== "unknown_status"));
  check("retired #340 is not in the coords file", json["340"] == null && !ids.has(340));

  const unpinned = ["area_based", "route_unpinned", "flagged", "pending"];
  let pinMistakes = 0;
  norm.entries.forEach(entry => {
    if (entry.kind !== "apply" && entry.kind !== "metadata") return;
    const source = json[String(entry.id)];
    if (!source) { pinMistakes++; return; }
    const hasPoint = typeof source.lat === "number" && typeof source.lng === "number";
    const shouldPin = hasPoint && (source.status === "confident" || source.locked === true) && KNOWN_STATUSES.has(source.status);
    if (shouldPin !== entry.pin) pinMistakes++;
    if (!shouldPin && entry.kind === "apply") pinMistakes++;
    if (unpinned.indexOf(source.status) !== -1 && !hasPoint && entry.pin) pinMistakes++;
  });
  check("only confident or locked entries with coordinates are pins", pinMistakes === 0, String(pinMistakes));

  const hands = [1837, 1848, 1854, 1868, 1876, 1887, 1908];
  const handBad = hands.filter(id => {
    const entry = byId[id];
    return !entry || entry.kind !== "apply" || entry.coordsLocked !== true || entry.geoSource !== "manual";
  });
  check("locked hand pins become points", handBad.length === 0, handBad.join(","));
});

module.exports = { pass: pass, fail: fail };
