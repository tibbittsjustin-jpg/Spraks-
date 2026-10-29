/* Pure coordinate normalization, plus a check of the real Utah file when it is present.
   No database. */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { normalizeCoords, readCoordsFile, loadCoordsFromDir, applyCoords, KNOWN_STATUSES } = require("../db/coords");
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
    confident.address.indexOf("Stewart Falls") !== -1 && confident.city === "Sundance");

  const locked = byId[1876];
  check("locked manual hand pin is applied and locked",
    locked && locked.kind === "apply" && locked.pin && locked.coordsLocked === true &&
    locked.geoSource === "manual" && locked.address.indexOf("101 W 100 N") !== -1);

  check("area_based is metadata only",
    byId[350] && byId[350].kind === "metadata" && byId[350].pin === false && byId[350].lat == null &&
    byId[350].geoStatus === "area_based" && byId[350].city === "Salt Lake City");
  check("route_unpinned is metadata only",
    byId[361] && byId[361].kind === "metadata" && byId[361].pin === false && byId[361].geoStatus === "route_unpinned");
  check("flagged locked row stores the lock and no point",
    byId[105] && byId[105].kind === "metadata" && byId[105].pin === false && byId[105].coordsLocked === true &&
    byId[105].lat == null && byId[105].geoStatus === "flagged" && byId[105].geoSource === "manual");
  check("pending is accepted and not pinned",
    byId[500] && byId[500].kind === "metadata" && byId[500].pin === false && byId[500].geoStatus === "pending" &&
    byId[500].city === "Provo");
  check("null city stays null", byId[361] && byId[361].city === null);
  const fixtureBlob = JSON.stringify(norm);
  check("fixture source notes never appear in the normalized output",
    fixtureBlob.indexOf("source_url") === -1 &&
    fixtureBlob.indexOf("sourceUrl") === -1 &&
    fixtureBlob.indexOf("slateprovo.com") === -1 &&
    fixtureBlob.indexOf("provo-river-tubing") === -1);
  check("normalized entries have no source_url field",
    norm.entries.every(entry => !Object.prototype.hasOwnProperty.call(entry, "source_url") &&
      !Object.prototype.hasOwnProperty.call(entry, "sourceUrl")));

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

section("city is trimmed and source notes are ignored", () => {
  const padded = {
    "187": Object.assign({}, sample["187"], {
      city: "  Sundance  ",
      source_url: "https://example.com/secret-note"
    }),
    "188": {
      id: 188,
      status: "area_based",
      city: "   ",
      source_url: "OSM Bridal Veil Falls View Area",
      lat: null,
      lng: null
    },
    "189": {
      id: 189,
      status: "pending",
      city: "",
      source_url: "https://provo.com/a ; https://provo.com/b",
      lat: null,
      lng: null
    },
    "190": {
      id: 190,
      status: "flagged",
      city: "  Orem",
      lat: null,
      lng: null,
      locked: true
    }
  };
  const norm = normalizeCoords(padded);
  const byId = {};
  norm.entries.forEach(entry => { if (entry.id != null) byId[entry.id] = entry; });
  check("padded city is trimmed", byId[187] && byId[187].city === "Sundance" && byId[187].kind === "apply");
  check("whitespace city becomes null", byId[188] && byId[188].city === null && byId[188].kind === "metadata");
  check("empty city becomes null", byId[189] && byId[189].city === null && byId[189].pin === false);
  check("city is kept for a flagged row", byId[190] && byId[190].city === "Orem" && byId[190].pin === false);
  const blob = JSON.stringify(norm);
  check("source notes never appear in normalized output",
    blob.indexOf("https://example.com/secret-note") === -1 &&
    blob.indexOf("OSM Bridal Veil Falls View Area") === -1 &&
    blob.indexOf("https://provo.com/a") === -1 &&
    blob.indexOf("source_url") === -1 &&
    blob.indexOf("sourceUrl") === -1);
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
  let cityMismatch = 0;
  let leakedNotes = 0;
  norm.entries.forEach(entry => {
    if (entry.kind !== "apply" && entry.kind !== "metadata") return;
    if (Object.prototype.hasOwnProperty.call(entry, "source_url") ||
        Object.prototype.hasOwnProperty.call(entry, "sourceUrl")) leakedNotes++;
    const raw = json[String(entry.id)];
    if (!raw) { cityMismatch++; return; }
    const expected = (typeof raw.city === "string" && raw.city.trim()) ? raw.city.trim() : null;
    if (entry.city !== expected) cityMismatch++;
    if (raw.source_url && JSON.stringify(entry).indexOf(raw.source_url) !== -1) leakedNotes++;
  });
  check("real file cities are trimmed onto entries", cityMismatch === 0, String(cityMismatch));
  check("real file source notes never leak into normalized entries", leakedNotes === 0, String(leakedNotes));
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

function lockedEntry(city) {
  return {
    kind: "apply",
    id: 1876,
    pin: true,
    address: "101 W 100 N, Provo, UT",
    setAddress: true,
    lat: 40.233,
    lng: -111.658,
    coordsLocked: true,
    geoStatus: "confident",
    geoConfidence: "manual",
    geoSource: "manual",
    geoResolvedAt: "2026-10-29T00:00:00.000Z",
    city: city
  };
}

function mockDb(rows) {
  const calls = [];
  return {
    calls: calls,
    async query(sql, params) {
      calls.push({ sql: sql, params: params });
      if (sql.indexOf("set city") !== -1) {
        const id = params[0];
        if (!rows[id]) return { rowCount: 0, rows: [] };
        rows[id].city = params[1];
        return { rowCount: 1, rows: [] };
      }
      if (sql.indexOf("coords_locked = false") !== -1) {
        const id = params[0];
        const row = rows[id];
        if (!row || row.coords_locked) return { rowCount: 0, rows: [] };
        row.location = params;
        return { rowCount: 1, rows: [] };
      }
      if (sql.indexOf("select coords_locked") !== -1) {
        const row = rows[params[0]];
        if (!row) return { rowCount: 0, rows: [] };
        return { rowCount: 1, rows: [{ coords_locked: row.coords_locked }] };
      }
      throw new Error("unexpected sql " + sql);
    }
  };
}

async function applySection() {
  console.log("\nlocked row city update");
  const lockedRows = { 1876: { coords_locked: true, city: "Old City" } };
  const lockedDb = mockDb(lockedRows);
  const lockedCounts = await applyCoords([lockedEntry("Provo")], lockedDb);
  const cityCall = lockedDb.calls.find(call => call.sql.indexOf("set city") !== -1);
  const coordCall = lockedDb.calls.find(call => call.sql.indexOf("coords_locked = false") !== -1);
  check("locked entry updates city by id",
    cityCall && cityCall.params[0] === 1876 && cityCall.params[1] === "Provo" &&
    cityCall.sql.indexOf("city is distinct from") !== -1 &&
    lockedRows[1876].city === "Provo");
  check("locked entry skips the coordinate update",
    coordCall && coordCall.sql.indexOf("city") === -1 &&
    coordCall.params[0] === 1876 && lockedCounts.skipped_locked === 1 &&
    lockedCounts.applied === 0 && lockedCounts.metadata === 0,
    JSON.stringify(lockedCounts));

  const openRows = { 187: { coords_locked: false, city: null } };
  const openDb = mockDb(openRows);
  const openEntry = lockedEntry("Sundance");
  openEntry.id = 187;
  openEntry.coordsLocked = false;
  const openCounts = await applyCoords([openEntry], openDb);
  const openCoord = openDb.calls.find(call => call.sql.indexOf("coords_locked = false") !== -1);
  check("unlocked entry still applies coordinates and city",
    openRows[187].city === "Sundance" && openCoord && openCounts.applied === 1 &&
    openCounts.skipped_locked === 0);

  const missingDb = mockDb({});
  const missingCounts = await applyCoords([lockedEntry("Provo")], missingDb);
  check("missing id stays unknown_id after the city statement",
    missingCounts.unknown_id === 1 && missingCounts.skipped_locked === 0 &&
    missingDb.calls.some(call => call.sql.indexOf("set city") !== -1));
}

module.exports = (async function () {
  try {
    await applySection();
  } catch (e) {
    check("applyCoords unit tests", false, String(e.stack || e.message).slice(0, 400));
  }
  return { pass: pass, fail: fail };
})();
