/* Coordinate intake. UGRC Address Points is the only geocoder this loader
   will accept later. OpenStreetMap, Nominatim, Google, Apple, Bing and
   ReserveAmerica coordinates are refused. OSM may only raise a suspicious-pin flag.

   Labels are split on every character that is not a letter or digit, and on
   camelCase humps, then matched as whole tokens. A word-boundary test treats
   "_" as a word character, so osm_nominatim and GooglePlaces used to pass.
   Bingham, Applegate and Googleville stay one token and still pass. */
"use strict";

const BANNED = [
  { code: "osm", tokens: ["openstreetmap", "osm", "photon", "komoot"] },
  { code: "nominatim", tokens: ["nominatim"] },
  { code: "google", tokens: ["google", "googleapis", "gmaps"] },
  { code: "apple", tokens: ["apple", "mapkit"] },
  { code: "bing", tokens: ["bing", "virtualearth"] },
  /* "Reserve America" splits into two tokens. The joined form is its own code. */
  { code: "reserveamerica", tokens: ["reserveamerica"], pairs: [["reserve", "america"]] }
];

const EXTRA_SOURCE_KEYS = [
  "coord_source_url", "geocode_source", "geo_source_url", "pin_source_url"
];

function sourceTokens(source) {
  const text = source == null ? "" : String(source);
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function plainTokens(source) {
  const text = source == null ? "" : String(source);
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/* Whole tokens from both splits. Pairs stay on one split so camelCase order
   is not mixed with the unsplit lowercase form. */
function bannedCoordinateSource(source) {
  const camelList = sourceTokens(source);
  const plainList = plainTokens(source);
  const tokens = new Set(camelList.concat(plainList));
  for (let i = 0; i < BANNED.length; i++) {
    const banned = BANNED[i];
    if (banned.tokens.some(token => tokens.has(token))) return banned.code;
    if (!banned.pairs) continue;
    const lists = [camelList, plainList];
    for (let l = 0; l < lists.length; l++) {
      const list = lists[l];
      for (let n = 0; n + 1 < list.length; n++) {
        const hit = banned.pairs.some(pair => list[n] === pair[0] && list[n + 1] === pair[1]);
        if (hit) return banned.code;
      }
    }
  }
  return null;
}

/* A clean geo_source can still carry a banned host on the coordinate URL. */
function bannedRecordSource(record) {
  if (!record) return null;
  for (let i = 0; i < EXTRA_SOURCE_KEYS.length; i++) {
    const value = record[EXTRA_SOURCE_KEYS[i]];
    if (value == null || String(value).trim() === "") continue;
    const code = bannedCoordinateSource(value);
    if (code) return code;
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
   Apple, Bing, or ReserveAmerica label is not. ODbL rows are OpenStreetMap. */
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
  bannedRecordSource: bannedRecordSource,
  coordinateProvenance: coordinateProvenance,
  noteSuspiciousSuggestion: noteSuspiciousSuggestion,
  sourceTokens: sourceTokens
};
