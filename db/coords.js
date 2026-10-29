/* Normalize per-state coordinate files and apply them to activities.

   Real Utah file (data/coords/utah.json) is an object keyed by idea id.
   Statuses in that file: confident, area_based, route_unpinned, flagged.
   `pending` is accepted too (the publisher's vocabulary) even when the file
   has none. Any other status is stored as metadata only: a warning, and no pin.

   A point is written only when lat/lng are in range AND the status is a known
   one AND (status === "confident" OR locked === true). */
"use strict";

const fs = require("fs");
const path = require("path");

const KNOWN_STATUSES = new Set([
  "confident", "area_based", "route_unpinned", "flagged", "pending"
]);

function listCoordsFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => name.endsWith(".json"))
    .sort((a, b) => {
      if (a === "utah.json") return -1;
      if (b === "utah.json") return 1;
      return a.localeCompare(b);
    })
    .map(name => path.join(dir, name));
}

function asPairs(json) {
  if (Array.isArray(json)) return json.map(entry => ({ key: null, entry: entry }));
  if (json && typeof json === "object") {
    return Object.keys(json).map(key => ({ key: key, entry: json[key] }));
  }
  const err = new Error("coords JSON must be an object or an array");
  err.code = "invalid_coords";
  throw err;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/* Display city only. Blank and non-strings become null. source_url in the
   file is provenance text and is never copied. */
function normalizeCity(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/* Pure. `knownIds` (a Set) is optional; when present, an id outside it is
   unknown_id and not applied. */
function normalizeCoords(json, options) {
  options = options || {};
  const knownIds = options.knownIds || null;
  const entries = [];
  const warnings = [];

  for (const pair of asPairs(json)) {
    const entry = pair.entry;
    const key = pair.key;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      warnings.push({ reason: "invalid", detail: "entry is not an object", key: key });
      entries.push({ kind: "invalid" });
      continue;
    }
    const id = entry.id;
    if (key != null && String(id) !== String(key)) {
      warnings.push({ id: id, reason: "key_mismatch", detail: "key " + key + " != id " + id });
      entries.push({ kind: "invalid", id: id });
      continue;
    }
    if (typeof id !== "number" || !Number.isInteger(id)) {
      warnings.push({ id: id, reason: "invalid", detail: "id is not an integer" });
      entries.push({ kind: "invalid", id: id });
      continue;
    }
    if (knownIds && !knownIds.has(id)) {
      warnings.push({ id: id, reason: "unknown_id" });
      entries.push({ kind: "unknown_id", id: id });
      continue;
    }

    const lat = entry.lat;
    const lng = entry.lng;
    const latAbsent = lat == null;
    const lngAbsent = lng == null;
    const hasPoint = finiteNumber(lat) && finiteNumber(lng);
    const coordsTouched = !latAbsent || !lngAbsent;
    if (coordsTouched && (!hasPoint || lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
      warnings.push({ id: id, reason: "out_of_range" });
      entries.push({ kind: "invalid", id: id });
      continue;
    }

    const status = entry.status == null ? null : String(entry.status);
    const known = KNOWN_STATUSES.has(status);
    if (!known) warnings.push({ id: id, reason: "unknown_status", detail: status });
    const locked = entry.locked === true;
    // Unknown statuses never get a pin, even when locked or when lat/lng are present.
    const pin = known && hasPoint && (status === "confident" || locked);
    const address = typeof entry.address === "string" ? entry.address : null;

    entries.push({
      kind: pin ? "apply" : "metadata",
      id: id,
      pin: pin,
      address: address,
      setAddress: pin || address != null,
      lat: hasPoint ? lat : null,
      lng: hasPoint ? lng : null,
      coordsLocked: locked,
      geoStatus: status,
      geoConfidence: entry.confidence == null ? null : String(entry.confidence),
      geoSource: entry.source == null ? null : String(entry.source),
      geoResolvedAt: entry.resolvedAt == null ? null : entry.resolvedAt,
      city: normalizeCity(entry.city)
    });
  }

  return { entries: entries, warnings: warnings };
}

function readCoordsFile(file, options) {
  if (!file || !fs.existsSync(file)) {
    return { entries: [], warnings: [], missing: true, file: file || null };
  }
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    const err = new Error("invalid JSON in " + file);
    err.code = "invalid_coords";
    err.cause = e;
    throw err;
  }
  const norm = normalizeCoords(json, options);
  norm.file = file;
  norm.missing = false;
  return norm;
}

function loadCoordsFromDir(dir, options) {
  if (!dir || !fs.existsSync(dir)) {
    return { entries: [], warnings: [], files: [], missing: true };
  }
  const files = listCoordsFiles(dir);
  if (!files.length) return { entries: [], warnings: [], files: [], missing: true };
  const entries = [];
  const warnings = [];
  for (const file of files) {
    const norm = readCoordsFile(file, options);
    norm.entries.forEach(entry => entries.push(entry));
    norm.warnings.forEach(warning => {
      warning.file = file;
      warnings.push(warning);
    });
  }
  return { entries: entries, warnings: warnings, files: files, missing: false };
}

async function applyCoords(entries, db) {
  const counts = { applied: 0, metadata: 0, skipped_locked: 0, skipped_invalid: 0, unknown_id: 0 };
  for (const entry of entries) {
    if (entry.kind === "invalid") { counts.skipped_invalid++; continue; }
    if (entry.kind === "unknown_id") { counts.unknown_id++; continue; }
    // City is display metadata. It updates even when coordinates are locked.
    // The locked-coords trigger ignores a city-only change. Location, address,
    // coords_locked, and geo_* stay behind the coords_locked guard below, and
    // a locked row still counts as skipped_locked for those fields.
    const city = entry.city == null ? null : entry.city;
    await db.query(
      "update activities set city = $2 where id = $1 and city is distinct from $2",
      [entry.id, city]
    );
    const result = await db.query(
      "update activities set " +
      "location = case when $2::boolean then ST_MakePoint($3, $4)::geography else null end, " +
      "address = case when $5::boolean then $6 else address end, " +
      "coords_locked = $7, " +
      "geo_status = $8, " +
      "geo_confidence = $9, " +
      "geo_source = $10, " +
      "geo_resolved_at = $11 " +
      "where id = $1 and coords_locked = false",
      [
        entry.id,
        entry.pin === true,
        entry.lng,
        entry.lat,
        entry.setAddress === true,
        entry.address,
        entry.coordsLocked === true,
        entry.geoStatus,
        entry.geoConfidence,
        entry.geoSource,
        entry.geoResolvedAt
      ]
    );
    if (result.rowCount > 0) {
      if (entry.kind === "apply") counts.applied++;
      else counts.metadata++;
      continue;
    }
    const existing = await db.query("select coords_locked from activities where id = $1", [entry.id]);
    if (!existing.rowCount) counts.unknown_id++;
    else if (existing.rows[0].coords_locked) counts.skipped_locked++;
    else counts.skipped_invalid++;
  }
  return counts;
}

function formatCounts(counts) {
  return "coords: applied " + counts.applied +
    ", metadata-only " + counts.metadata +
    ", skipped_locked " + counts.skipped_locked +
    ", skipped_invalid " + counts.skipped_invalid +
    ", unknown_id " + counts.unknown_id;
}

module.exports = {
  KNOWN_STATUSES,
  listCoordsFiles,
  normalizeCoords,
  readCoordsFile,
  loadCoordsFromDir,
  applyCoords,
  formatCounts
};
