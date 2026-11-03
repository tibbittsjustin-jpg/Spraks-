/* Coordinate intake. UGRC Address Points is the only geocoder this loader
   will accept later. OpenStreetMap, Nominatim, Google, Apple and Bing
   coordinates are refused. OSM may only raise a suspicious-pin flag. */
"use strict";

const BANNED = [
  { code: "osm", test: /openstreetmap|\bosm\b/i },
  { code: "nominatim", test: /nominatim/i },
  { code: "google", test: /google/i },
  { code: "apple", test: /apple/i },
  { code: "bing", test: /bing/i }
];

function bannedCoordinateSource(source) {
  const text = source == null ? "" : String(source);
  for (let i = 0; i < BANNED.length; i++) {
    if (BANNED[i].test.test(text)) return BANNED[i].code;
  }
  return null;
}

function acceptCoordinates(lat, lng, source) {
  const banned = bannedCoordinateSource(source);
  if (banned) {
    const err = new Error("refusing coordinates from " + banned);
    err.code = "rejected_coordinate_source";
    err.source = banned;
    throw err;
  }
  return {
    lat: lat == null ? null : lat,
    lng: lng == null ? null : lng,
    source: source || "source",
    suspiciousPin: false
  };
}

/* The dataset's own geometry is allowed. An explicit OSM, Nominatim, Google,
   Apple, or Bing label is not. ODbL rows are OpenStreetMap. */
function coordinateProvenance(dataset, record) {
  const explicit = record && (
    record.geo_source || record.coord_source || record.pin_source ||
    record.coordinate_source || record.source_type
  );
  if (explicit != null && String(explicit).trim()) return String(explicit);
  if (dataset && (dataset.odbl === true || dataset.datasetKey === "osm_osp")) return "openstreetmap";
  return "";
}

/* An OSM or Nominatim suggestion sets a flag and is never copied onto lat/lng. */
function noteSuspiciousSuggestion(row, suggestion) {
  const text = suggestion == null ? "" : String(suggestion);
  if (!bannedCoordinateSource(text)) return row;
  row.suspiciousPin = true;
  if (!row.flags) row.flags = {};
  row.flags.suspiciousPin = true;
  delete row.osm_id;
  delete row.osmId;
  delete row.osm_source;
  delete row.suggested_lat;
  delete row.suggested_lng;
  delete row.suggestedLat;
  delete row.suggestedLng;
  return row;
}

module.exports = {
  acceptCoordinates: acceptCoordinates,
  bannedCoordinateSource: bannedCoordinateSource,
  coordinateProvenance: coordinateProvenance,
  noteSuspiciousSuggestion: noteSuspiciousSuggestion
};
