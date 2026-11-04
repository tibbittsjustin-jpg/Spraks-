/* Decide when a staged coordinate is only an area, not an exact pin.

   Legal R8.5 condition 4: a geocoded match more than 100 m off, a street-only
   or ZIP-only match, or a geocoded match whose uncertainty cannot be
   estimated is area level. A dataset's own geometry, with none of that
   match metadata, is left alone. This module does not touch a database. */
"use strict";

const AREA_LEVEL_THRESHOLD_M = 100;

const STREET_OR_ZIP = new Set([
  "street", "street_only", "street_centerline", "street_segment",
  "zip", "zip_only", "zip_centroid"
]);

const NEIGHBOR_SNAP = new Set([
  "nearest_address_point", "nearest_address_point_to_intersection", "intersection",
  "neighbor", "neighbour", "neighbor_address_point", "representative_address_point",
  "route_midpoint", "campus_representative_point"
]);

const SNAP_TEXT = /\bnearest (?:ugrc )?address point\b|\bintersection\b|\bneighbou?r(?:ing|'s)? (?:address|point|building)|\brepresentative (?:ugrc )?address point\b|\bsnapp?ed to\b/i;

const UNCERTAINTY_KEYS = ["uncertainty_m", "uncertaintyM", "accuracy_m", "accuracyM", "error_m"];
const SPREAD_KEYS = ["spread_m", "spreadM"];
const QUALITY_KEYS = ["match_quality_method", "match_method", "quality", "geocode_quality"];
const BASIS_KEYS = ["match_basis", "pin_basis"];
const NOTE_KEYS = ["geocode_note", "pin_note", "note"];
const PRECISION_KEYS = ["location_precision", "precision"];

function pick(record, keys) {
  for (let i = 0; i < keys.length; i++) {
    const value = record[keys[i]];
    if (value != null && value !== "") return value;
  }
  return null;
}

function hasKey(record, keys) {
  for (let i = 0; i < keys.length; i++) {
    if (Object.prototype.hasOwnProperty.call(record, keys[i])) return true;
  }
  return false;
}

function label(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/* Finite metres, or null when the value is missing or not a distance.
   A negative number is not a usable bound. */
function metres(value) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value === "string" && value.trim()) {
    const text = value.trim();
    if (/^(unknown|n\/a|na|unestimable|unestimated)$/i.test(text)) return null;
    const n = Number(text);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

/* True when the row carries geocode-match metadata. Dataset geometry that
   only has lat/lng (and ordinary place fields) is not a geocoded match. */
function geocodeMatch(record) {
  if (pick(record, QUALITY_KEYS) != null) return true;
  if (pick(record, BASIS_KEYS) != null) return true;
  if (pick(record, ["geocode_note", "pin_note"]) != null) return true;
  if (pick(record, PRECISION_KEYS) != null) return true;
  if (record.area_level === true || record.area_based === true) return true;
  if (hasKey(record, UNCERTAINTY_KEYS) || hasKey(record, SPREAD_KEYS)) return true;
  return false;
}

/* record is the dataset row. coordSource is coordinateProvenance(). */
function areaLevelDecision(record, coordSource) {
  const row = record || {};
  const reasons = [];
  const uncertainty = metres(pick(row, UNCERTAINTY_KEYS));
  const spread = metres(pick(row, SPREAD_KEYS));
  if (uncertainty != null && uncertainty > AREA_LEVEL_THRESHOLD_M) {
    reasons.push("uncertainty " + Math.round(uncertainty) + " m > 100 m");
  }
  if (spread != null && spread > AREA_LEVEL_THRESHOLD_M && spread !== uncertainty) {
    reasons.push("spread " + Math.round(spread) + " m > 100 m");
  }

  const quality = label(pick(row, QUALITY_KEYS));
  const basis = label(pick(row, BASIS_KEYS));
  if (STREET_OR_ZIP.has(quality) || STREET_OR_ZIP.has(basis)) {
    reasons.push("street/ZIP-only match");
  }
  if (NEIGHBOR_SNAP.has(basis)) {
    reasons.push("neighbour/intersection snap (" + basis + ")");
  } else if (quality !== "nearest_house_number" && SNAP_TEXT.test(String(pick(row, NOTE_KEYS) || ""))) {
    reasons.push("note says nearest/neighbouring/intersection address point");
  }

  const precision = label(pick(row, PRECISION_KEYS));
  if (precision === "area" || row.area_level === true || row.area_based === true) {
    reasons.push("source marks the point area level");
  }

  /* A geocoded match with no finite uncertainty and no spread is unestimable.
     Street, ZIP, snap and source-marked rows already have their own reason. */
  if (!reasons.length && geocodeMatch(row) && uncertainty == null && spread == null) {
    reasons.push("uncertainty unknown");
  }

  const source = coordSource == null ? "" : String(coordSource).trim();
  return {
    areaLevel: reasons.length > 0,
    reasons: reasons,
    geoSource: source || null
  };
}

module.exports = {
  AREA_LEVEL_THRESHOLD_M: AREA_LEVEL_THRESHOLD_M,
  areaLevelDecision: areaLevelDecision
};
