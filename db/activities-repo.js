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
  "id, title, description, category, icon, setting, season, food, age21, cost, duration, " +
  "time, vibe, stage, date_type, scene, motif, source, tier, address, affiliate_url, updated_at, " +
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

  const latMissing = params.lat == null || params.lat === "";
  const lngMissing = params.lng == null || params.lng === "";
  if (latMissing !== lngMissing) throw invalidFilter(latMissing ? "lat" : "lng");

  let located = false;
  let lngIdx = null;
  let latIdx = null;
  if (!latMissing) {
    let lat = asNumber(params.lat);
    let lng = asNumber(params.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw invalidFilter("lat");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw invalidFilter("lng");
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
    where.push("location IS NOT NULL");
    where.push(
      "ST_DWithin(location, ST_MakePoint($" + lngIdx + ", $" + latIdx + ")::geography, $" + metersIdx + ")"
    );
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
    order = "ORDER BY location <-> ST_MakePoint($" + lngIdx + ", $" + latIdx + ")::geography, id";
    distanceSql = ", ROUND((ST_Distance(location, ST_MakePoint($" + lngIdx + ", $" + latIdx +
      ")::geography) / 1609.344)::numeric, 1) AS distance_miles";
  }

  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  const text = "SELECT " + SELECT_COLUMNS + distanceSql +
    " FROM activities WHERE " + where.join(" AND ") +
    " " + order +
    " LIMIT $" + limitIdx + " OFFSET $" + offsetIdx;

  return { text: text, values: values, limit: limit, offset: offset, located: located };
}

function mapRow(row, located) {
  const item = {
    id: row.id,
    title: row.title,
    description: row.description,
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
