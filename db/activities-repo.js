/* Parameterized activities queries. User input only ever lands in `values`. */
"use strict";

const filters = require("../shared/filters");

const METERS_PER_MILE = 1609.344;

const EQ_FIELDS = { duration: "duration", cost: "cost", category: "category" };
const OVERLAP_FIELDS = {
  time: "time",
  vibe: "vibe",
  season: "season",
  stage: "stage",
  dateType: "date_type"
};

const SELECT_COLUMNS =
  "id, title, description, materials, category, icon, setting, season, food, age21, cost, duration, " +
  "time, vibe, stage, date_type, scene, motif, source, tier, address, city, source_url, occurrences, affiliate_url, updated_at, " +
  "ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng";

function invalidFilter(field) {
  const err = new Error("invalid_filter");
  err.code = "invalid_filter";
  err.field = field;
  return err;
}

function splitList(value) {
  if (value == null || value === "") return [];
  const parts = Array.isArray(value) ? value : [value];
  const out = [];
  parts.forEach(part => {
    String(part).split(",").forEach(piece => {
      const trimmed = piece.trim();
      if (trimmed) out.push(trimmed);
    });
  });
  return out;
}

function assertAllowed(field, values, allowed) {
  values.forEach(value => {
    if (allowed.indexOf(value) === -1) throw invalidFilter(field);
  });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Reserved for a future paid "local events only" filter. Off unless the
// value is exactly 1. Not subscription-gated yet.
// TODO: subscription-gate localOnly before any UI exposes it.
function localOnlyFlag(value) {
  if (value == null || value === "") return false;
  if (Array.isArray(value)) throw invalidFilter("localOnly");
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  throw invalidFilter("localOnly");
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function asNumber(value) {
  if (typeof value === "number") return value;
  const n = Number(value);
  return n;
}

function buildListQuery(params) {
  params = params || {};
  const values = [];
  const where = ["status = 'approved'"];
  // Only an actual boolean opts into paid rows. The query string cannot.
  if (params.includePaid !== true) where.push("tier = 'free'");

  Object.keys(EQ_FIELDS).forEach(key => {
    const list = splitList(params[key]);
    if (!list.length) return;
    assertAllowed(key, list, filters[key]);
    values.push(list);
    where.push(EQ_FIELDS[key] + " = ANY($" + values.length + "::text[])");
  });

  Object.keys(OVERLAP_FIELDS).forEach(key => {
    const list = splitList(params[key]);
    if (!list.length) return;
    assertAllowed(key, list, filters[key]);
    values.push(list);
    where.push(OVERLAP_FIELDS[key] + " && $" + values.length + "::text[]");
  });

  const setting = splitList(params.setting);
  if (setting.length) {
    assertAllowed("setting", setting, filters.setting);
    values.push(setting);
    where.push("(setting = 'Both' OR setting = ANY($" + values.length + "::text[]))");
  }

  if (params.food != null && params.food !== "") {
    const raw = String(params.food).toLowerCase();
    if (raw !== "true" && raw !== "false") throw invalidFilter("food");
    values.push(raw === "true");
    where.push("food = $" + values.length);
  }

  if (params.hide21 != null && params.hide21 !== "") {
    const raw = String(params.hide21).toLowerCase();
    if (raw !== "true" && raw !== "false") throw invalidFilter("hide21");
    if (raw === "true") where.push("age21 = false");
  }

  const cities = splitList(params.city);
  if (cities.length) {
    if (cities.some(city => city.length > 80)) throw invalidFilter("city");
    values.push(cities.map(city => city.toLowerCase()));
    where.push("lower(city) = ANY($" + values.length + "::text[])");
  }

  const latMissing = params.lat == null || params.lat === "";
  const lngMissing = params.lng == null || params.lng === "";
  if (latMissing !== lngMissing) throw invalidFilter(latMissing ? "lat" : "lng");

  const localOnly = localOnlyFlag(params.localOnly);

  let located = false;
  let lngIdx = null;
  let latIdx = null;
  let pointSql = "";
  if (!latMissing) {
    let lat = asNumber(params.lat);
    let lng = asNumber(params.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw invalidFilter("lat");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw invalidFilter("lng");
    // Rounded before they are bound. Never interpolated into the SQL text.
    lat = round2(lat);
    lng = round2(lng);
    let radiusMiles;
    if (params.radiusMiles == null || params.radiusMiles === "") radiusMiles = 25;
    else {
      radiusMiles = asNumber(params.radiusMiles);
      if (!Number.isFinite(radiusMiles)) throw invalidFilter("radiusMiles");
    }
    radiusMiles = clamp(radiusMiles, 1, 100);
    values.push(lng);
    lngIdx = values.length;
    values.push(lat);
    latIdx = values.length;
    values.push(radiusMiles * METERS_PER_MILE);
    const metersIdx = values.length;
    pointSql = "ST_MakePoint($" + lngIdx + ", $" + latIdx + ")::geography";
    if (localOnly) {
      where.push("location IS NOT NULL");
      where.push("ST_DWithin(location, " + pointSql + ", $" + metersIdx + ")");
    } else {
      where.push("(location IS NULL OR ST_DWithin(location, " + pointSql + ", $" + metersIdx + "))");
    }
    located = true;
  }

  let limit;
  if (params.limit == null || params.limit === "") limit = 50;
  else {
    limit = asNumber(params.limit);
    if (!Number.isFinite(limit)) throw invalidFilter("limit");
  }
  limit = clamp(Math.trunc(limit), 1, 200);

  const offsetSource = (params.offset != null && params.offset !== "") ? params.offset : params.cursor;
  let offset;
  if (offsetSource == null || offsetSource === "") offset = 0;
  else {
    offset = asNumber(offsetSource);
    if (!Number.isFinite(offset)) throw invalidFilter("offset");
  }
  offset = clamp(Math.trunc(offset), 0, 10000);

  let order = "ORDER BY id";
  let distanceSql = "";
  if (located) {
    // One LIMIT/OFFSET follows this order, so a page can start on pins and
    // continue into general ideas. <-> stays a bare sort key (GiST KNN);
    // NULLS LAST keeps a null distance from sorting ahead of a real one.
    if (localOnly) {
      order = "ORDER BY location <-> " + pointSql + ", id";
    } else {
      order = "ORDER BY CASE WHEN location IS NULL THEN 1 ELSE 0 END, location <-> " + pointSql + " NULLS LAST, id";
    }
    distanceSql = ", CASE WHEN location IS NULL THEN NULL ELSE ROUND((ST_Distance(location, " + pointSql +
      ") / 1609.344)::numeric, 1) END AS distance_miles";
  }

  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  const text = "SELECT " + SELECT_COLUMNS + distanceSql +
    " FROM activities WHERE " + where.join(" AND ") +
    " " + order +
    " LIMIT $" + limitIdx + " OFFSET $" + offsetIdx;

  return { text: text, values: values, limit: limit, offset: offset, located: located, localOnly: localOnly };
}

function mapRow(row, located) {
  const sourceUrl = row.source_url == null ? null : row.source_url;
  const item = {
    id: row.id,
    title: row.title,
    description: row.description,
    materials: row.materials || [],
    category: row.category,
    icon: row.icon,
    setting: row.setting,
    season: row.season || [],
    food: row.food,
    age21: row.age21 === true,
    cost: row.cost,
    duration: row.duration,
    time: row.time || [],
    vibe: row.vibe || [],
    stage: row.stage || [],
    dateType: row.date_type || [],
    scene: row.scene,
    motif: row.motif,
    source: row.source,
    tier: row.tier,
    address: row.address,
    city: row.city == null ? null : row.city,
    sourceUrl: sourceUrl,
    source_url: sourceUrl,
    occurrences: row.occurrences == null ? null : row.occurrences,
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
    affiliateUrl: row.affiliate_url == null ? null : row.affiliate_url,
    updatedAt: row.updated_at
  };
  if (located && row.distance_miles != null && row.distance_miles !== "") {
    item.distanceMiles = Number(row.distance_miles);
  }
  return item;
}

async function listActivities(params, db) {
  const built = buildListQuery(params);
  const runner = db || require("./index").getPool();
  const result = await runner.query(built.text, built.values);
  const items = result.rows.map(row => mapRow(row, built.located));
  return {
    items: items,
    limit: built.limit,
    offset: built.offset,
    nextOffset: items.length === built.limit ? built.offset + built.limit : null
  };
}

async function getActivity(id, db) {
  const runner = db || require("./index").getPool();
  const result = await runner.query(
    "SELECT " + SELECT_COLUMNS + " FROM activities WHERE id = $1 AND status = 'approved' AND tier = 'free'",
    [id]
  );
  if (!result.rows.length) return null;
  return mapRow(result.rows[0], false);
}

module.exports = {
  METERS_PER_MILE,
  buildListQuery,
  listActivities,
  getActivity,
  mapRow
};
