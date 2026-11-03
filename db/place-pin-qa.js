/* Offline pin QA. Thresholds match Utah's bulk-pin-qa-rules spec and can be
   replaced from place_loader_config. This module never calls Nominatim.
   Coordinates come from the source row. A geocode cache may be passed in;
   nothing is fetched. County and city polygons are used when a caller
   supplies them. Without those files the state ring, gateway distance,
   centroid traps, address text and shared-pin checks still run. */
"use strict";

const STATE_RING = [
  [-114.0528, 36.997],
  [-109.041, 36.997],
  [-109.041, 40.998],
  [-111.046, 40.998],
  [-111.046, 41.999],
  [-114.0528, 41.999],
  [-114.0528, 36.997]
];

const DEFAULTS = {
  stateBorderM: 300,
  gatewayM: 40000,
  stateCentroidM: 2000,
  countyCentroidM: 750,
  cityCentroidCensusM: 120,
  cityCentroidOsmM: 25,
  sharedPinM: 15,
  sharedPinMin: 3,
  handPinCap: 40,
  gridTolM: 600,
  zipMin: 84001,
  zipMax: 84791,
  types: {
    venue: { agreeM: 150, failM: 500, countyM: 250, cityM: 500 },
    event_at_venue: { agreeM: 150, failM: 500, countyM: 250, cityM: 500 },
    trailhead: { agreeM: 300, failM: 1000, countyM: 500, cityM: null },
    park: { agreeM: 500, failM: 1500, countyM: 500, cityM: 1000 },
    area: { agreeM: 5000, failM: 15000, countyM: 2000, cityM: null },
    route: { agreeM: 1000, failM: 3000, countyM: 1000, cityM: null }
  }
};

const AREA_WORDS = /state park|national (park|monument|recreation|forest)|recreation area|reservoir|wilderness|canyon|overlook/i;
const CITY_ONLY = /^\s*[A-Za-z .'-]+,?\s*(UT|Utah)\.?\s*(\d{5})?\s*(,?\s*(USA|United States))?\s*$/i;
const ZIP_RE = /\b(?:UT|Utah)\.?,?\s*(\d{3,6})(?:-\d{4})?\b/i;

function hav(aLat, aLng, bLat, bLng) {
  const r = 6371008.8;
  const p1 = aLat * Math.PI / 180;
  const p2 = bLat * Math.PI / 180;
  const dp = p2 - p1;
  const dl = (bLng - aLng) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pip(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-15) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function ringDistM(lng, lat, ring) {
  if (pip(lng, lat, ring)) return 0;
  const kx = 111320 * Math.cos(lat * Math.PI / 180);
  const ky = 110540;
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const ax = (ring[i][0] - lng) * kx;
    const ay = (ring[i][1] - lat) * ky;
    const bx = (ring[i + 1][0] - lng) * kx;
    const by = (ring[i + 1][1] - lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const d = px * px + py * py;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

function placeType(row) {
  if (row.placeType) return row.placeType;
  if (row.datasetKey === "ugrc_trailheads") return "trailhead";
  if (row.datasetKey === "stateparks" || row.datasetKey === "nps") return "area";
  if (row.datasetKey === "museums") return "venue";
  if (AREA_WORDS.test(row.sourceName || row.title || "")) return "area";
  return "park";
}

function addressChecks(addr) {
  const out = [];
  if (!addr) return out;
  const zip = String(addr).match(ZIP_RE);
  if (zip) {
    const z = zip[1];
    if (z.length !== 5) out.push({ code: "ZIP_MALFORMED", severity: "warn", msg: "ZIP " + z + " is not 5 digits" });
    else if (!z.startsWith("84")) out.push({ code: "ZIP_NOT_UTAH", severity: "fail", msg: "ZIP " + z + " is not a Utah ZIP" });
    else if (Number(z) < DEFAULTS.zipMin || Number(z) > DEFAULTS.zipMax) {
      out.push({ code: "ZIP_RANGE", severity: "warn", msg: "ZIP " + z + " is outside 84001-84791" });
    }
  }
  if (/,\s*,/.test(addr)) out.push({ code: "ADDR_EMPTY_SEGMENT", severity: "warn", msg: "empty comma segment" });
  if (/\b[NSEW]\d{5,}\b|\b\d{7,}\b/i.test(addr)) {
    out.push({ code: "ADDR_FUSED_NUMBER", severity: "warn", msg: "fused street number" });
  }
  const grid = String(addr).match(/\b(\d{1,5})\s+(N|S|E|W|North|South|East|West)\.?\s+(\d{1,5})\s+(N|S|E|W|North|South|East|West)\b/i);
  if (grid) {
    const axis = (word) => (/^[ns]/i.test(word) ? "NS" : "EW");
    if (axis(grid[2]) === axis(grid[4])) {
      out.push({ code: "GRID_SAME_AXIS", severity: "fail", msg: "grid address uses one axis twice" });
    }
  }
  const temple = String(addr).match(/\b(\d{1,5})\s+(N|S|E|W|North|South|East|West)\.?\s+(North|South|East|West)\s+Temple\b/i);
  if (temple) {
    const numNS = /^[ns]/i.test(temple[2]);
    const templeNS = /^[ns]/i.test(temple[3]);
    // North/South Temple take E/W numbers. "301 S West Temple" is the swapped,
    // impossible form of "301 W South Temple".
    if (numNS === templeNS || numNS) {
      out.push({ code: "GRID_TEMPLE_AXIS", severity: "fail", msg: temple[0] + " is impossible on the Salt Lake grid" });
    }
  }
  return out;
}

function nearest(lat, lng, points) {
  let best = null;
  points.forEach(point => {
    const d = hav(lat, lng, point.lat, point.lng);
    if (!best || d < best.d) best = { d: d, point: point };
  });
  return best;
}

function decide(checks, type, authoritative) {
  const fail = (code) => checks.some(item => item.code === code && item.severity === "fail");
  const has = (code) => checks.some(item => item.code === code);
  if (fail("NO_COORDS") || fail("ZERO_COORDS") || fail("SWAPPED_COORDS") || fail("OUTSIDE_UTAH") || fail("STATE_CENTROID") || fail("ZIP_NOT_UTAH")) {
    return { status: "reject", action: "drop", reason: "hard failure" };
  }
  if (fail("COUNTY_CENTROID") && type !== "area") {
    return { status: "needs_hand_pin", action: "hold_hand_pin", reason: "county centroid" };
  }
  if (checks.some(item => item.severity === "fail" && item.code !== "GEOCODE_DISAGREE")) {
    return { status: "needs_hand_pin", action: "hold_hand_pin", reason: "failed check" };
  }
  if (has("SHARED_PIN") && type !== "area") {
    return { status: "needs_hand_pin", action: "hold_hand_pin", reason: "shared pin" };
  }
  if (has("CITY_CENTROID") && checks.some(item => item.streetAddress) && !has("GEOCODE_AGREE")) {
    return { status: "needs_hand_pin", action: "hold_hand_pin", reason: "city centroid with a street number" };
  }
  if (type === "route") return { status: "route_unpinned", action: "publish_area", reason: "route" };
  if (type === "area" || has("PRECISION_OVERCLAIM") || has("CITY_CENTROID") || has("CITY_MAILING")) {
    return { status: "area_based", action: "publish_area", reason: "area or centroid warning" };
  }
  /* OSM name agreement is a flag only. It never makes a pin confident. */
  if (authoritative || has("GEOCODE_AGREE")) {
    return { status: "confident", action: "publish", reason: "authoritative coordinates" };
  }
  if (checks.some(item => item.severity === "warn")) {
    return { status: "area_based", action: "publish_area", reason: "warnings without agreement" };
  }
  return { status: "confident", action: "publish", reason: "no warnings" };
}

function checkRow(row, refs, thresholds) {
  const cfg = thresholds || DEFAULTS;
  const type = placeType(row);
  const typeCfg = (cfg.types && cfg.types[type]) || DEFAULTS.types[type] || DEFAULTS.types.park;
  const checks = [];
  const lat = row.lat;
  const lng = row.lng;
  if (lat == null || lng == null) {
    checks.push({ code: "NO_COORDS", severity: "fail", msg: "no coordinates" });
  } else if (lat === 0 || lng === 0) {
    checks.push({ code: "ZERO_COORDS", severity: "fail", msg: "0,0 coordinates" });
  } else if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat < 0 && lng > 0 && Math.abs(lat) < 90)) {
    checks.push({ code: "SWAPPED_COORDS", severity: "fail", msg: "lat/lng look invalid" });
  } else {
    const ring = (refs && refs.stateRing) || STATE_RING;
    const dist = ringDistM(lng, lat, ring);
    if (dist > 0 && dist <= cfg.stateBorderM) {
      checks.push({ code: "STATE_BORDER", severity: "warn", msg: Math.round(dist) + " m outside Utah" });
    } else if (dist > cfg.stateBorderM) {
      checks.push({ code: "OUTSIDE_UTAH", severity: "fail", msg: (dist / 1000).toFixed(1) + " km outside Utah" });
    }
    const cities = (refs && refs.cities) || [];
    const gateway = typeCfg.cityM == null;
    if (row.city && lat != null) {
      const hit = nearest(lat, lng, cities.filter(city => city.name.toLowerCase() === String(row.city).toLowerCase().replace(/ city$/, "")));
      if (!hit) {
        checks.push({ code: "CITY_UNKNOWN", severity: "info", msg: row.city + " has no loaded place polygon or centroid" });
      } else if (gateway && hit.d > cfg.gatewayM) {
        checks.push({ code: "GATEWAY_FAR", severity: "fail", msg: Math.round(hit.d / 1000) + " km from " + row.city });
      } else if (gateway) {
        checks.push({ code: "CITY_IS_GATEWAY", severity: "info", msg: (hit.d / 1000).toFixed(1) + " km from " + row.city });
      }
    } else if (row.flags && row.flags.needsCity) {
      checks.push({ code: "CITY_UNKNOWN", severity: "info", msg: "no city on the record; city polygons are not cleared" });
    }
    (refs && refs.stateCentroids || [{ name: "Utah", lat: 39.4225192, lng: -111.7143584 }]).forEach(point => {
      if (lat != null && hav(lat, lng, point.lat, point.lng) < cfg.stateCentroidM) {
        checks.push({ code: "STATE_CENTROID", severity: "fail", msg: "pin is a state centroid" });
      }
    });
    (refs && refs.countyCentroids || []).forEach(point => {
      const d = hav(lat, lng, point.lat, point.lng);
      if (d < cfg.countyCentroidM) {
        checks.push({ code: "COUNTY_CENTROID", severity: type === "area" ? "warn" : "fail", msg: Math.round(d) + " m from " + point.name });
      }
    });
    (refs && refs.cityCentroids || cities).forEach(point => {
      const d = hav(lat, lng, point.lat, point.lng);
      if (d < cfg.cityCentroidCensusM) {
        checks.push({ code: "CITY_CENTROID", severity: "warn", msg: Math.round(d) + " m from " + point.name, streetAddress: /^\d/.test(row.address || "") });
      }
    });
  }
  addressChecks(row.address).forEach(item => checks.push(item));
  if (row.address && CITY_ONLY.test(row.address) && type === "venue") {
    checks.push({ code: "PRECISION_OVERCLAIM", severity: "warn", msg: "city-only address claimed as a venue" });
  }
  const authoritative = row.odbl !== true;
  const decision = decide(checks, type, authoritative && lat != null && lng != null);
  return {
    placeType: type,
    status: decision.status,
    statusReason: decision.reason,
    action: decision.action,
    checks: checks
  };
}

function venueKey(row) {
  if (row.address && /\d/.test(row.address)) return String(row.address).toLowerCase().replace(/\s+/g, " ").trim();
  return String(row.sourceName || row.title || "").toLowerCase() + "|" + String(row.city || "");
}

function applySharedPins(rows, thresholds) {
  const cfg = thresholds || DEFAULTS;
  const buckets = new Map();
  rows.forEach(row => {
    if (row.lat == null || row.lng == null) return;
    const key = row.lat.toFixed(4) + "," + row.lng.toFixed(4);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  });
  buckets.forEach(group => {
    const keys = new Set(group.map(venueKey));
    if (group.length >= cfg.sharedPinMin && keys.size >= cfg.sharedPinMin) {
      group.forEach(row => {
        row.pinQa.checks.push({ code: "SHARED_PIN", severity: "warn", msg: group.length + " rows share this pin" });
        if (row.pinQa.placeType !== "area" && row.pinQa.status !== "reject") {
          row.pinQa.status = "needs_hand_pin";
          row.pinQa.action = "hold_hand_pin";
          row.pinQa.statusReason = "shared pin";
        }
      });
    }
  });
}

function handPinQueue(rows, cap) {
  const groups = new Map();
  rows.forEach(row => {
    if (!row.pinQa || row.pinQa.status !== "needs_hand_pin") return;
    const key = venueKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const limit = cap == null ? DEFAULTS.handPinCap : cap;
  return {
    queue: ordered.slice(0, limit).map(([key, items]) => ({ venueKey: key, count: items.length })),
    deferred: ordered.slice(limit).map(([key, items]) => ({ venueKey: key, count: items.length }))
  };
}

function qaBatch(rows, options) {
  const thresholds = Object.assign({}, DEFAULTS, (options && options.thresholds) || {});
  const refs = (options && options.refs) || { cities: [] };
  rows.forEach((row, index) => {
    const result = checkRow(row, refs, thresholds);
    row.placeType = result.placeType;
    row.pinQa = Object.assign({ index: index, title: row.title, lat: row.lat, lng: row.lng, city: row.city }, result);
    row.needsHandPin = result.status === "needs_hand_pin" || result.status === "reject";
    if (result.status === "reject") row.pinQa.action = "drop";
  });
  applySharedPins(rows, thresholds);
  rows.forEach(row => {
    if (row.pinQa && row.pinQa.status === "needs_hand_pin") row.needsHandPin = true;
    if (row.pinQa && row.pinQa.status === "reject") row.needsHandPin = true;
  });
  const hand = handPinQueue(rows, thresholds.handPinCap);
  const counts = {};
  rows.forEach(row => {
    const status = row.pinQa.status;
    counts[status] = (counts[status] || 0) + 1;
  });
  return { counts: counts, handPinQueue: hand.queue, handPinDeferred: hand.deferred, thresholds: thresholds };
}

module.exports = {
  DEFAULTS: DEFAULTS,
  STATE_RING: STATE_RING,
  hav: hav,
  addressChecks: addressChecks,
  checkRow: checkRow,
  qaBatch: qaBatch,
  handPinQueue: handPinQueue,
  placeType: placeType
};
