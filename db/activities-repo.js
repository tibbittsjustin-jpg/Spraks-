/* Parameterized activities queries. User input only ever lands in `values`.

   Nearby pages are two index-friendly statements, not one ORDER BY that
   wraps the distance in CASE and ORs in rows with no location. Pinned rows
   use the GiST KNN operator (`location <-> point`) plus ST_DWithin. General
   ideas (location IS NULL) follow, ordered by id. Pages use a keyset cursor,
   never OFFSET. */
"use strict";

const filters = require("../shared/filters");
const costBands = require("../public/cost-bands");
const timeWindows = require("../public/time-windows");
const occurrences = require("../public/occurrences");
const sources = require("../public/data-sources");
const feed = require("../public/feed");

const METERS_PER_MILE = 1609.344;
const MAX_RADIUS_MILES = 100;
const MAX_PAGE = 200;
const MAX_CURSOR_CHARS = 256;
const MAX_ID = 2147483647;
const DISTANCE_RE = /^[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;

const EQ_FIELDS = { duration: "duration", cost: "cost", category: "category" };
const OVERLAP_FIELDS = {
  time: "time",
  vibe: "vibe",
  season: "season",
  stage: "stage",
  dateType: "date_type"
};

const SELECT_COLUMNS =
  "id, title, description, materials, category, icon, setting, season, food, age21, cost, cost_unit, duration, " +
  "time, vibe, stage, date_type, scene, motif, source, tier, address, city, source_url, source_key, source_credit, " +
  "to_char(expires_at, 'YYYY-MM-DD') AS expires_at, occurrences, affiliate_url, updated_at, " +
  "ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng";

// A date column compared in America/Denver. now()::date would follow the
// session clock, so 11:30pm in Denver would already look like tomorrow in UTC.
const DENVER_TODAY = "(now() AT TIME ZONE 'America/Denver')::date";
const STILL_SHOWING_SQL =
  "(expires_at IS NULL OR expires_at >= " + DENVER_TODAY + ") AND (" +
  "expires_at IS NOT NULL OR occurrences IS NULL OR occurrences->>'kind' IS DISTINCT FROM 'dates' OR (" +
  "SELECT max(item->>'date') FROM jsonb_array_elements(" +
  "CASE WHEN jsonb_typeof(occurrences->'dates') = 'array' THEN occurrences->'dates' ELSE '[]'::jsonb END" +
  ") AS item WHERE item->>'date' ~ '^\\d{4}-\\d{2}-\\d{2}$'" +
  ") >= to_char(" + DENVER_TODAY + ", 'YYYY-MM-DD'))";

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

function distanceText(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 40 || !DISTANCE_RE.test(text)) return null;
  const n = Number(text);
  const maxMeters = MAX_RADIUS_MILES * METERS_PER_MILE + 1;
  if (!Number.isFinite(n) || n < 0 || n > maxMeters) return null;
  return text;
}

// Opaque page token. The client sends it back unchanged. Fields are
// validated and bound as parameters; nothing in the token is concatenated
// into SQL. The token holds a row id and, for a pin, the distance text
// Postgres already returned. It does not hold the user's coordinates.
const RANK_PHASES = { h: 1, nn: 1, ng: 1, on: 1, og: 1, ni: 1, oi: 1 };

function isRankPhase(phase) {
  return !!RANK_PHASES[phase];
}

function encodeCursor(cursor) {
  if (cursor && cursor.v === 2) return encodeRankCursor(cursor);
  if (!cursor || (cursor.p !== "n" && cursor.p !== "g" && cursor.p !== "i")) throw invalidFilter("cursor");
  const id = cursor.id;
  if (!Number.isInteger(id) || id < 1 || id > MAX_ID) throw invalidFilter("cursor");
  const body = { v: 1, p: cursor.p, id: id };
  if (cursor.p === "n") {
    const d = distanceText(cursor.d);
    if (!d) throw invalidFilter("cursor");
    body.d = d;
  } else if (cursor.d != null) {
    throw invalidFilter("cursor");
  }
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
}

function encodeRankCursor(cursor) {
  if (!isRankPhase(cursor.p)) throw invalidFilter("cursor");
  const id = cursor.id;
  if (!Number.isInteger(id) || id < 1 || id > MAX_ID) throw invalidFilter("cursor");
  const body = { v: 2, p: cursor.p, id: id };
  if (cursor.p === "h") {
    if (cursor.n !== 0 && cursor.n !== 1) throw invalidFilter("cursor");
    if (!Number.isInteger(cursor.s) || cursor.s < 0 || cursor.s > feed.NO_START) throw invalidFilter("cursor");
    body.n = cursor.n;
    body.s = cursor.s;
  } else if (cursor.p === "nn" || cursor.p === "on") {
    const d = distanceText(cursor.d);
    if (!d) throw invalidFilter("cursor");
    body.d = d;
  } else if (cursor.d != null) {
    throw invalidFilter("cursor");
  }
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
}

function decodeCursor(token) {
  if (token == null || token === "") return null;
  if (typeof token !== "string" || token.length > MAX_CURSOR_CHARS || !/^[A-Za-z0-9_-]+$/.test(token)) {
    throw invalidFilter("cursor");
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch (err) {
    throw invalidFilter("cursor");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw invalidFilter("cursor");
  if (parsed.v === 2) return decodeRankCursor(parsed);
  if (parsed.v !== 1 || (parsed.p !== "n" && parsed.p !== "g" && parsed.p !== "i")) throw invalidFilter("cursor");
  if (!Number.isInteger(parsed.id) || parsed.id < 1 || parsed.id > MAX_ID) throw invalidFilter("cursor");
  if (parsed.p === "n") {
    const d = distanceText(parsed.d);
    if (!d) throw invalidFilter("cursor");
    return { p: "n", id: parsed.id, d: d };
  }
  if (parsed.d != null) throw invalidFilter("cursor");
  return { p: parsed.p, id: parsed.id, d: null };
}

function decodeRankCursor(parsed) {
  if (!isRankPhase(parsed.p)) throw invalidFilter("cursor");
  if (!Number.isInteger(parsed.id) || parsed.id < 1 || parsed.id > MAX_ID) throw invalidFilter("cursor");
  if (parsed.p === "h") {
    if (parsed.n !== 0 && parsed.n !== 1) throw invalidFilter("cursor");
    if (!Number.isInteger(parsed.s) || parsed.s < 0 || parsed.s > feed.NO_START) throw invalidFilter("cursor");
    return { v: 2, p: "h", id: parsed.id, n: parsed.n, s: parsed.s };
  }
  if (parsed.p === "nn" || parsed.p === "on") {
    const d = distanceText(parsed.d);
    if (!d) throw invalidFilter("cursor");
    return { v: 2, p: parsed.p, id: parsed.id, d: d };
  }
  if (parsed.d != null) throw invalidFilter("cursor");
  return { v: 2, p: parsed.p, id: parsed.id, d: null };
}

function feedFlag(value) {
  if (value == null || value === "") return "";
  if (value === "local" || value === "happening") return value;
  throw invalidFilter("feed");
}

function whenFlag(value) {
  if (value == null || value === "") return "";
  if (value === "tonight" || value === "today") return value;
  if (typeof value === "string" && occurrences.parseISODate(value.trim())) return value.trim();
  throw invalidFilter("when");
}

function rankFlag(value) {
  if (value == null || value === "") return "";
  if (value === "new") return "new";
  throw invalidFilter("rank");
}

function resolveFeedParams(params, now) {
  const feedName = feedFlag(params.feed);
  let when = whenFlag(params.when);
  const today = occurrences.denverToday(now || new Date());
  if (!feedName) return { feed: "", when: "", kind: "none", date: null, today: today };
  if (feedName === "happening" && !when) when = "tonight";
  if (when === "tonight") return { feed: feedName, when: when, kind: "tonight", date: today, today: today };
  if (when === "today") return { feed: feedName, when: when, kind: "day", date: today, today: today };
  if (when) {
    if (!feed.dateAllowed(when, now || new Date())) throw invalidFilter("when");
    return { feed: feedName, when: when, kind: "day", date: when, today: today };
  }
  return { feed: feedName, when: "", kind: "none", date: null, today: today };
}

function dateMatchSql(idx) {
  return "EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(occurrences->'dates') = 'array' THEN occurrences->'dates' ELSE '[]'::jsonb END) AS item WHERE item->>'date' = $" + idx + ")";
}

function appendFeedSql(where, values, selection) {
  if (!selection.feed) return null;
  let dateIdx = null;
  if (selection.date) {
    values.push(selection.date);
    dateIdx = values.length;
  }
  const dated = "occurrences->>'kind' = 'dates'";
  const anytime = "(occurrences IS NULL OR occurrences->>'kind' IS DISTINCT FROM 'dates')";
  if (selection.feed === "happening") {
    where.push(dated);
    if (dateIdx) where.push(dateMatchSql(dateIdx));
    return dateIdx;
  }
  if (!dateIdx) {
    where.push(anytime);
    return null;
  }
  where.push("(" + anytime + " OR (" + dated + " AND " + dateMatchSql(dateIdx) + "))");
  return dateIdx;
}

function newFlagSql() {
  return "(CASE WHEN " + sources.newRowSql() + " THEN 0 ELSE 1 END)";
}

function startKeySql(dateIdx) {
  return "COALESCE((SELECT min((split_part(item->>'start', ':', 1)::int * 60) + split_part(item->>'start', ':', 2)::int) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(occurrences->'dates') = 'array' THEN occurrences->'dates' ELSE '[]'::jsonb END) AS item WHERE item->>'date' = $" + dateIdx + " AND item->>'start' ~ '^[0-9]{2}:[0-9]{2}$'), " + feed.NO_START + ")";
}

function readPoint(params) {
  const latMissing = params.lat == null || params.lat === "";
  const lngMissing = params.lng == null || params.lng === "";
  if (latMissing !== lngMissing) throw invalidFilter(latMissing ? "lat" : "lng");
  if (latMissing) return { located: false, lat: null, lng: null, radiusMiles: null };
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
  return { located: true, lat: lat, lng: lng, radiusMiles: clamp(radiusMiles, 1, MAX_RADIUS_MILES) };
}

// Same order the SQL uses: pinned rows by distance then id, then general
// rows (dist == null) by id. Keyset checks use the same comparison so a
// walk cannot skip or repeat a row.
function compareActivityRows(a, b) {
  const aPinned = a.dist != null;
  const bPinned = b.dist != null;
  if (aPinned !== bPinned) return aPinned ? -1 : 1;
  if (aPinned && a.dist !== b.dist) return a.dist < b.dist ? -1 : 1;
  return a.id - b.id;
}

function rowPassesKeyset(row, cursor) {
  if (!cursor) return true;
  if (cursor.p === "i") return row.id > cursor.id;
  if (cursor.p === "g") return row.dist == null && row.id > cursor.id;
  if (cursor.p === "n") {
    if (row.dist == null) return false;
    const dist = Number(cursor.d);
    if (row.dist > dist) return true;
    return row.dist === dist && row.id > cursor.id;
  }
  return false;
}

function sharedFilters(params) {
  const values = [];
  const where = ["status = 'approved'", STILL_SHOWING_SQL];
  // Only an actual boolean opts into paid rows. The query string cannot.
  if (params.includePaid !== true) where.push("tier = 'free'");

  Object.keys(EQ_FIELDS).forEach(key => {
    const list = splitList(params[key]);
    if (!list.length) return;
    if (key === "cost") {
      // Chips are the seven new bands. Each expands to the stored strings
      // that can fall in it, including a legacy label kept on a flagged row.
      assertAllowed(key, list, filters.cost.slice());
      values.push(costBands.storedCostsForBands(list));
    } else {
      assertAllowed(key, list, filters[key]);
      values.push(list);
    }
    where.push(EQ_FIELDS[key] + " = ANY($" + values.length + "::text[])");
  });

  Object.keys(OVERLAP_FIELDS).forEach(key => {
    const list = splitList(params[key]);
    if (!list.length) return;
    if (key === "time") {
      // Chips are the five windows. An old URL or saved name (Morning,
      // Afternoon, Evening, Night) expands to those windows first.
      // Dated rows with a start clock are matched on that hour. Everyone
      // else overlaps the stored tags that can fall in the windows.
      const resolved = timeWindows.selectionFromQuery(list);
      if (resolved.invalid || !resolved.windows.length) throw invalidFilter("time");
      const pred = timeWindows.sqlPredicate(resolved.windows, values.length + 1);
      pred.values.forEach(value => values.push(value));
      where.push(pred.sql);
      return;
    }
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

  return { where: where, values: values };
}

function pageLimit(params) {
  let limit;
  if (params.limit == null || params.limit === "") limit = 50;
  else {
    limit = asNumber(params.limit);
    if (!Number.isFinite(limit)) throw invalidFilter("limit");
  }
  return clamp(Math.trunc(limit), 1, MAX_PAGE);
}

function copyFilters(shared) {
  return { where: shared.where.slice(), values: shared.values.slice() };
}

function finishQuery(where, values, order, limit) {
  values.push(limit);
  const limitIdx = values.length;
  const text = "SELECT " + SELECT_COLUMNS + where.distanceSql +
    " FROM activities WHERE " + where.clauses.join(" AND ") +
    " " + order + " LIMIT $" + limitIdx;
  return { text: text, values: values, limit: limit };
}

function bindPoint(part, point) {
  part.values.push(point.lng);
  const lngIdx = part.values.length;
  part.values.push(point.lat);
  const latIdx = part.values.length;
  part.values.push(point.radiusMiles * METERS_PER_MILE);
  const metersIdx = part.values.length;
  return {
    pointSql: "ST_MakePoint($" + lngIdx + ", $" + latIdx + ")::geography",
    metersIdx: metersIdx
  };
}

function buildHappeningRankQuery(params, shared, selection, limit, cursor, localOnly, dateIdx) {
  if (cursor && cursor.p !== "h") throw invalidFilter("cursor");
  if (!dateIdx) throw invalidFilter("when");
  const point = readPoint(params);
  const part = copyFilters(shared);
  let distanceSql = ", NULL::numeric AS distance_miles, NULL::text AS distance_meters";
  if (point.located) {
    const bound = bindPoint(part, point);
    if (localOnly) {
      part.where.push("location IS NOT NULL");
      part.where.push("ST_DWithin(location, " + bound.pointSql + ", $" + bound.metersIdx + ")");
    } else {
      part.where.push("(location IS NULL OR ST_DWithin(location, " + bound.pointSql + ", $" + bound.metersIdx + "))");
    }
    distanceSql = ", CASE WHEN location IS NULL THEN NULL ELSE ROUND((ST_Distance(location, " + bound.pointSql +
      ") / 1609.344)::numeric, 1) END AS distance_miles, CASE WHEN location IS NULL THEN NULL ELSE (location <-> " +
      bound.pointSql + ")::text END AS distance_meters";
  }
  const flag = newFlagSql();
  const start = startKeySql(dateIdx);
  if (cursor) {
    part.values.push(cursor.n);
    const nIdx = part.values.length;
    part.values.push(cursor.s);
    const sIdx = part.values.length;
    part.values.push(cursor.id);
    const idIdx = part.values.length;
    part.where.push("((" + flag + ") > $" + nIdx + "::int OR ((" + flag + ") = $" + nIdx +
      "::int AND (" + start + ") > $" + sIdx + "::int) OR ((" + flag + ") = $" + nIdx +
      "::int AND (" + start + ") = $" + sIdx + "::int AND id > $" + idIdx + "::int))");
  }
  const query = finishQuery(
    { clauses: part.where, distanceSql: distanceSql },
    part.values,
    "ORDER BY " + flag + ", " + start + ", id",
    limit
  );
  return {
    mode: "ranked",
    rank: "happening",
    text: query.text,
    values: query.values,
    queries: [query],
    limit: limit,
    located: point.located,
    localOnly: !!localOnly,
    cursor: cursor,
    radiusMiles: point.radiusMiles,
    feed: selection.feed,
    whenToken: selection.when,
    whenDate: selection.date
  };
}

function buildLocalRankQuery(params, shared, selection, limit, cursor, localOnly) {
  const point = readPoint(params);
  const names = !point.located ? ["ni", "oi"] : (localOnly ? ["nn", "on"] : ["nn", "ng", "on", "og"]);
  if (cursor && names.indexOf(cursor.p) === -1) throw invalidFilter("cursor");
  const phases = names.map(name => {
    const fresh = name.charAt(0) === "n";
    const pinned = name.charAt(1) === "n";
    const part = copyFilters(shared);
    part.where.push(fresh ? sources.newRowSql() : ("NOT " + sources.newRowSql()));
    let distanceSql = ", NULL::numeric AS distance_miles, NULL::text AS distance_meters";
    let order = "ORDER BY id";
    if (pinned) {
      const bound = bindPoint(part, point);
      part.where.push("location IS NOT NULL");
      part.where.push("ST_DWithin(location, " + bound.pointSql + ", $" + bound.metersIdx + ")");
      distanceSql = ", CASE WHEN location IS NULL THEN NULL ELSE ROUND((ST_Distance(location, " + bound.pointSql +
        ") / 1609.344)::numeric, 1) END AS distance_miles, (location <-> " + bound.pointSql + ")::text AS distance_meters";
      order = "ORDER BY location <-> " + bound.pointSql + ", id";
      if (cursor && cursor.p === name) {
        part.values.push(cursor.d);
        const distIdx = part.values.length;
        part.values.push(cursor.id);
        const idIdx = part.values.length;
        part.where.push("((location <-> " + bound.pointSql + ") > $" + distIdx + "::double precision OR ((" +
          "location <-> " + bound.pointSql + ") = $" + distIdx + "::double precision AND id > $" + idIdx + "::integer))");
      }
    } else {
      if (point.located) part.where.push("location IS NULL");
      if (cursor && cursor.p === name) {
        part.values.push(cursor.id);
        part.where.push("id > $" + part.values.length + "::integer");
      }
    }
    const query = finishQuery({ clauses: part.where, distanceSql: distanceSql }, part.values, order, limit);
    query.name = name;
    return query;
  });
  return {
    mode: "phases",
    rank: "local",
    text: phases.map(phase => phase.text).join("\n"),
    values: phases[0].values,
    phases: phases,
    queries: phases,
    limit: limit,
    located: point.located,
    localOnly: !!localOnly,
    cursor: cursor,
    radiusMiles: point.radiusMiles,
    feed: selection.feed,
    whenToken: selection.when,
    whenDate: selection.date
  };
}

function buildListQuery(params) {
  params = params || {};
  if (params.offset != null && params.offset !== "") throw invalidFilter("offset");

  const limit = pageLimit(params);
  const cursor = decodeCursor(params.cursor);
  const shared = sharedFilters(params);
  const localOnly = localOnlyFlag(params.localOnly);
  const selection = resolveFeedParams(params);
  const dateIdx = appendFeedSql(shared.where, shared.values, selection);
  const rank = rankFlag(params.rank);
  if (rank === "new") {
    if (cursor && !isRankPhase(cursor.p)) throw invalidFilter("cursor");
    if (selection.feed === "happening") {
      return buildHappeningRankQuery(params, shared, selection, limit, cursor, localOnly, dateIdx);
    }
    return buildLocalRankQuery(params, shared, selection, limit, cursor, localOnly);
  }
  if (cursor && isRankPhase(cursor.p)) throw invalidFilter("cursor");

  const latMissing = params.lat == null || params.lat === "";
  const lngMissing = params.lng == null || params.lng === "";
  if (latMissing !== lngMissing) throw invalidFilter(latMissing ? "lat" : "lng");

  if (latMissing) {
    if (cursor && cursor.p !== "i") throw invalidFilter("cursor");
    const part = copyFilters(shared);
    if (cursor) {
      part.values.push(cursor.id);
      part.where.push("id > $" + part.values.length + "::integer");
    }
    const query = finishQuery(
      { clauses: part.where, distanceSql: "" },
      part.values,
      "ORDER BY id",
      limit
    );
    return {
      mode: "id",
      text: query.text,
      values: query.values,
      queries: [query],
      limit: limit,
      located: false,
      localOnly: localOnly,
      cursor: cursor,
      radiusMiles: null
    };
  }

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
  radiusMiles = clamp(radiusMiles, 1, MAX_RADIUS_MILES);

  function bindPoint(part) {
    part.values.push(lng);
    const lngIdx = part.values.length;
    part.values.push(lat);
    const latIdx = part.values.length;
    part.values.push(radiusMiles * METERS_PER_MILE);
    const metersIdx = part.values.length;
    const pointSql = "ST_MakePoint($" + lngIdx + ", $" + latIdx + ")::geography";
    return { pointSql: pointSql, metersIdx: metersIdx };
  }

  // Pinned rows only. ST_DWithin limits the GiST scan to the radius, and
  // `location <-> point` is the leading ORDER BY so the KNN index can
  // order that scan. A secondary id makes ties stable for the keyset.
  function pinnedQuery(partCursor) {
    const part = copyFilters(shared);
    const point = bindPoint(part);
    part.where.push("location IS NOT NULL");
    part.where.push("ST_DWithin(location, " + point.pointSql + ", $" + point.metersIdx + ")");
    if (partCursor && partCursor.p === "n") {
      part.values.push(partCursor.d);
      const distIdx = part.values.length;
      part.values.push(partCursor.id);
      const idIdx = part.values.length;
      part.where.push(
        "((location <-> " + point.pointSql + ") > $" + distIdx + "::double precision OR " +
        "((location <-> " + point.pointSql + ") = $" + distIdx + "::double precision AND id > $" + idIdx + "::integer))"
      );
    }
    const distanceSql = ", CASE WHEN location IS NULL THEN NULL ELSE ROUND((ST_Distance(location, " + point.pointSql +
      ") / 1609.344)::numeric, 1) END AS distance_miles, (location <-> " + point.pointSql + ")::text AS distance_meters";
    return finishQuery(
      { clauses: part.where, distanceSql: distanceSql },
      part.values,
      "ORDER BY location <-> " + point.pointSql + ", id",
      limit
    );
  }

  function generalQuery(partCursor) {
    const part = copyFilters(shared);
    part.where.push("location IS NULL");
    if (partCursor && partCursor.p === "g") {
      part.values.push(partCursor.id);
      part.where.push("id > $" + part.values.length + "::integer");
    }
    return finishQuery(
      { clauses: part.where, distanceSql: ", NULL::numeric AS distance_miles, NULL::text AS distance_meters" },
      part.values,
      "ORDER BY id",
      limit
    );
  }

  if (localOnly) {
    if (cursor && cursor.p !== "n") throw invalidFilter("cursor");
    const near = pinnedQuery(cursor);
    return {
      mode: "near",
      text: near.text,
      values: near.values,
      queries: [near],
      near: near,
      limit: limit,
      located: true,
      localOnly: true,
      cursor: cursor,
      radiusMiles: radiusMiles
    };
  }

  if (cursor && cursor.p !== "n" && cursor.p !== "g") throw invalidFilter("cursor");
  const near = pinnedQuery(cursor && cursor.p === "n" ? cursor : null);
  const general = generalQuery(cursor && cursor.p === "g" ? cursor : null);
  return {
    mode: "split",
    text: near.text + "\n" + general.text,
    values: near.values,
    queries: [near, general],
    near: near,
    general: general,
    limit: limit,
    located: true,
    localOnly: false,
    cursor: cursor,
    radiusMiles: radiusMiles
  };
}

function replaceLimit(query, limit) {
  const values = query.values.slice();
  values[values.length - 1] = limit;
  return { text: query.text, values: values };
}

function cursorFromRow(row, located, built) {
  const id = Number(row.id);
  if (!Number.isInteger(id) || id < 1) return null;
  if (built && built.rank === "happening") {
    return {
      v: 2,
      p: "h",
      n: sources.isNewRow(row) ? 0 : 1,
      s: feed.startSortKey(row, built.whenDate),
      id: id
    };
  }
  if (built && built.rank === "local") {
    const fresh = sources.isNewRow(row);
    if (!built.located) return { v: 2, p: fresh ? "ni" : "oi", id: id };
    const meters = row.distance_meters;
    if (meters != null && String(meters).trim() !== "") {
      const d = distanceText(String(meters).trim());
      if (!d) return null;
      return { v: 2, p: fresh ? "nn" : "on", id: id, d: d };
    }
    if (row.lat != null && row.lng != null) return { v: 2, p: fresh ? "nn" : "on", id: id, d: "0" };
    return { v: 2, p: fresh ? "ng" : "og", id: id };
  }
  if (!located) return { p: "i", id: id };
  const meters = row.distance_meters;
  if (meters != null && String(meters).trim() !== "") {
    const d = distanceText(String(meters).trim());
    if (d) return { p: "n", id: id, d: d };
  }
  if (row.lat != null && row.lng != null) return { p: "n", id: id, d: "0" };
  return { p: "g", id: id };
}

// expires_at is a date, not a timestamp. A string keeps the calendar day.
// A Date from the driver is read with local fields, which is how node-pg
// builds a DATE (local midnight), so the day is not shifted into UTC.
function calendarDate(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    return match ? match[1] : null;
  }
  if (value instanceof Date && !isNaN(value.getTime())) {
    const month = value.getMonth() + 1;
    const day = value.getDate();
    return value.getFullYear() + "-" +
      (month < 10 ? "0" : "") + month + "-" +
      (day < 10 ? "0" : "") + day;
  }
  return null;
}

function mapRow(row, located) {
  const sourceUrl = row.source_url == null ? null : row.source_url;
  const expiresAt = calendarDate(row.expires_at);
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
    cost: costBands.storedLabel(row.cost),
    costUnit: row.cost_unit == null ? null : row.cost_unit,
    cost_unit: row.cost_unit == null ? null : row.cost_unit,
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
    sourceKey: row.source_key == null ? null : row.source_key,
    source_key: row.source_key == null ? null : row.source_key,
    sourceCredit: row.source_credit == null ? null : row.source_credit,
    source_credit: row.source_credit == null ? null : row.source_credit,
    expiresAt: expiresAt,
    expires_at: expiresAt,
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
  let rows = [];
  if (built.mode === "phases") {
    let start = 0;
    if (built.cursor) {
      start = built.phases.findIndex(phase => phase.name === built.cursor.p);
      if (start < 0) throw invalidFilter("cursor");
    }
    for (let i = start; i < built.phases.length && rows.length < built.limit; i++) {
      const phase = replaceLimit(built.phases[i], built.limit - rows.length);
      const result = await runner.query(phase.text, phase.values);
      rows = rows.concat(result.rows);
    }
  } else if (built.mode === "ranked") {
    const result = await runner.query(built.text, built.values);
    rows = result.rows;
  } else if (built.mode === "split") {
    if (!built.cursor || built.cursor.p === "n") {
      const near = await runner.query(built.near.text, built.near.values);
      rows = near.rows;
    }
    if (rows.length < built.limit) {
      const general = replaceLimit(built.general, built.limit - rows.length);
      const gen = await runner.query(general.text, general.values);
      rows = rows.concat(gen.rows);
    }
  } else if (built.mode === "near") {
    const near = await runner.query(built.near.text, built.near.values);
    rows = near.rows;
  } else {
    const result = await runner.query(built.text, built.values);
    rows = result.rows;
  }
  let items = rows.map(row => mapRow(row, built.located));
  const selection = built.feed
    ? { feed: built.feed, when: built.whenToken || "" }
    : resolveFeedParams(params || {});
  if (selection.feed) {
    items = items.filter(item => feed.matchesFeed(item, {
      feedMode: selection.feed,
      when: selection.when
    }, new Date()));
  }
  let nextCursor = null;
  if (rows.length === built.limit) {
    const cursor = cursorFromRow(rows[rows.length - 1], built.located, built);
    if (cursor) nextCursor = encodeCursor(cursor);
  }
  return {
    items: items,
    limit: built.limit,
    nextCursor: nextCursor
  };
}

const MAX_ID_BATCH = 200;

function parseIdList(value) {
  const parts = splitList(value);
  if (!parts.length) throw invalidFilter("ids");
  const ids = [];
  const seen = new Set();
  parts.forEach(part => {
    if (!/^\d{1,9}$/.test(part)) throw invalidFilter("ids");
    const id = Number(part);
    if (!Number.isInteger(id) || id < 1) throw invalidFilter("ids");
    if (seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  if (ids.length > MAX_ID_BATCH) throw invalidFilter("ids");
  return ids;
}

// Approved free rows that are still showing, by id. No location, no paging.
// Ids the caller asked for that are pending, paid, or finished are omitted.
function activitiesByIdsQuery(ids) {
  const list = parseIdList(ids);
  return {
    text: "SELECT " + SELECT_COLUMNS + " FROM activities WHERE id = ANY($1::int[]) AND status = 'approved' AND tier = 'free' AND " +
      STILL_SHOWING_SQL + " ORDER BY id",
    values: [list],
    ids: list
  };
}

async function listActivitiesByIds(ids, db) {
  const built = activitiesByIdsQuery(ids);
  const runner = db || require("./index").getPool();
  const result = await runner.query(built.text, built.values);
  return { items: result.rows.map(row => mapRow(row, false)) };
}

async function getActivity(id, db) {
  const runner = db || require("./index").getPool();
  const result = await runner.query(
    "SELECT " + SELECT_COLUMNS + " FROM activities WHERE id = $1 AND status = 'approved' AND tier = 'free' AND " +
    STILL_SHOWING_SQL,
    [id]
  );
  if (!result.rows.length) return null;
  return mapRow(result.rows[0], false);
}

module.exports = {
  METERS_PER_MILE,
  DENVER_TODAY,
  STILL_SHOWING_SQL,
  buildListQuery,
  listActivities,
  listActivitiesByIds,
  activitiesByIdsQuery,
  parseIdList,
  MAX_ID_BATCH,
  getActivity,
  mapRow,
  calendarDate,
  encodeCursor,
  decodeCursor,
  compareActivityRows,
  rowPassesKeyset
};
