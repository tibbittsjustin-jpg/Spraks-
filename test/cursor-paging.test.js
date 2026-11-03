/* Cursor pages, radius scope, and the client catalog size. No database.
   The walk below is the same keyset the SQL uses: pins by distance then
   id, then general ideas by id. */
"use strict";

const fs = require("fs");
const path = require("path");
const {
  buildListQuery,
  encodeCursor,
  decodeCursor,
  compareActivityRows,
  rowPassesKeyset,
  STILL_SHOWING_SQL,
  METERS_PER_MILE
} = require("../db/activities-repo");
const occ = require("../public/occurrences");
const { loadIdeas } = require("../db/seed");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
function section(title, fn) {
  console.log("\n" + title);
  try { fn(); }
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 400)); }
}

function throwsFilter(params, field) {
  try {
    buildListQuery(params);
    return false;
  } catch (err) {
    return err.code === "invalid_filter" && err.field === field;
  }
}

function takePage(sorted, cursor, limit) {
  const out = [];
  if (!cursor || cursor.p === "n") {
    for (let i = 0; i < sorted.length; i++) {
      const row = sorted[i];
      if (row.dist == null) continue;
      if (cursor && cursor.p === "n" && !rowPassesKeyset(row, cursor)) continue;
      out.push(row);
      if (out.length === limit) return out;
    }
  }
  const genCursor = cursor && cursor.p === "g" ? cursor : null;
  for (let j = 0; j < sorted.length; j++) {
    const row = sorted[j];
    if (row.dist != null) continue;
    if (genCursor && !rowPassesKeyset(row, genCursor)) continue;
    out.push(row);
    if (out.length === limit) return out;
  }
  return out;
}

function cursorFrom(row) {
  if (row.dist == null) return { p: "g", id: row.id };
  return { p: "n", id: row.id, d: String(row.dist) };
}

section("keyset pages stay stable past 10k rows", () => {
  const rows = [];
  for (let id = 1; id <= 12000; id++) {
    if (id % 3 === 0) rows.push({ id: id, dist: null });
    else rows.push({ id: id, dist: (id * 17) % 500 });
  }
  const sorted = rows.slice().sort(compareActivityRows);
  check("pins sort ahead of general ideas", sorted[0].dist != null && sorted[sorted.length - 1].dist == null);
  check("distance ties break by id", (function () {
    const tie = sorted.filter(row => row.dist === sorted.find(item => item.dist != null).dist);
    for (let i = 1; i < tie.length; i++) if (tie[i].id < tie[i - 1].id) return false;
    return tie.length > 1;
  })());
  const seen = new Set();
  const got = [];
  let cursor = null;
  let pages = 0;
  const limit = 17;
  for (let guard = 0; guard < 2000; guard++) {
    const page = takePage(sorted, cursor, limit);
    pages += 1;
    if (!page.length) break;
    for (let i = 0; i < page.length; i++) {
      if (seen.has(page[i].id)) return check("no duplicate ids", false, String(page[i].id));
      seen.add(page[i].id);
      got.push(page[i]);
    }
    if (page.length < limit) {
      cursor = null;
      break;
    }
    const token = encodeCursor(cursorFrom(page[page.length - 1]));
    const next = decodeCursor(token);
    if (cursor && next.p === cursor.p && next.id === cursor.id && next.d === cursor.d) {
      return check("cursor advances", false);
    }
    cursor = next;
  }
  check("every row is returned once", got.length === sorted.length && seen.size === 12000, String(got.length));
  let orderOk = got.length === sorted.length;
  for (let i = 0; orderOk && i < got.length; i++) {
    if (got[i].id !== sorted[i].id) orderOk = false;
  }
  check("pages match the full order with no gaps", orderOk);
  check("a short page size still reaches ids past 10000", got.some(row => row.id > 10000) && pages > (10000 / limit));
  const late = encodeCursor({ p: "i", id: 10001 });
  const lateQuery = buildListQuery({ cursor: late, limit: "25" });
  check("an id past 10000 is a bound parameter",
    lateQuery.values.indexOf(10001) !== -1 && lateQuery.text.indexOf("id > $") !== -1 &&
    lateQuery.text.indexOf("10001") === -1 && lateQuery.text.indexOf("OFFSET") === -1);
});

section("cursor tokens are opaque and bounded", () => {
  const attack = "1 OR 1=1; DROP TABLE activities;--";
  check("a raw offset is rejected", throwsFilter({ cursor: "25" }, "cursor"));
  check("sql text in the cursor is rejected", throwsFilter({ cursor: attack }, "cursor"));
  const token = encodeCursor({ p: "n", id: 42, d: "15.5" });
  check("a near cursor round-trips", (function () {
    const back = decodeCursor(token);
    return back.p === "n" && back.id === 42 && back.d === "15.5" && token.indexOf("15.5") === -1;
  })());
  const q = buildListQuery({ lat: 40.76, lng: -111.89, cursor: token, radiusMiles: "10000", limit: "99999" });
  check("cursor distance is a parameter",
    q.near.values.indexOf("15.5") !== -1 && q.near.text.indexOf("15.5") === -1 && q.near.text.indexOf(attack) === -1);
  check("radius and page size stay bounded", q.radiusMiles === 100 && q.limit === 200 && q.values.indexOf(100 * METERS_PER_MILE) !== -1);
  check("a general cursor is rejected on a pinned-only query",
    throwsFilter({ lat: 40, lng: -111, localOnly: "1", cursor: encodeCursor({ p: "g", id: 3 }) }, "cursor"));
  check("a pin cursor is rejected when there is no location",
    throwsFilter({ cursor: token }, "cursor"));
  let hugeRejected = false;
  try { encodeCursor({ p: "n", id: 1, d: "999999999" }); }
  catch (err) { hugeRejected = err.field === "cursor"; }
  check("a huge distance is rejected", hugeRejected);
});

section("nearby sql can use the location index", () => {
  const q = buildListQuery({ lat: 40.23, lng: -111.66, radiusMiles: 10 });
  check("pinned rows are a KNN scan inside the radius",
    q.near.text.indexOf("ORDER BY location <->") !== -1 &&
    q.near.text.indexOf("ST_DWithin") !== -1 &&
    q.near.text.indexOf("location IS NOT NULL") !== -1 &&
    q.near.text.indexOf("ORDER BY CASE WHEN") === -1 &&
    q.near.text.indexOf("OFFSET") === -1);
  check("general ideas are a separate id keyset",
    q.general.text.indexOf("AND location IS NULL") !== -1 &&
    q.general.text.indexOf("ORDER BY id") !== -1 &&
    q.general.text.indexOf("ST_DWithin") === -1);
  check("finished rows stay in the predicate",
    q.near.text.indexOf(STILL_SHOWING_SQL) !== -1 && q.general.text.indexOf(STILL_SHOWING_SQL) !== -1);
  const migration = fs.readFileSync(path.join(__dirname, "..", "db", "migrations", "016_nearby_keyset.sql"), "utf8");
  check("016 adds the partial gist and id indexes",
    migration.indexOf("create index if not exists activities_approved_free_location_gix") !== -1 &&
    migration.indexOf("using gist (location)") !== -1 &&
    migration.indexOf("activities_approved_free_unlocated_id_idx") !== -1 &&
    migration.indexOf("activities_approved_free_id_idx") !== -1);
  check("016 keeps deny-all and does not add a policy",
    migration.indexOf("enable row level security") !== -1 &&
    migration.indexOf("revoke all") !== -1 &&
    migration.toLowerCase().indexOf("create policy") === -1 &&
    migration.toLowerCase().indexOf("drop table") === -1);
});

section("the date rule and the Denver day boundary", () => {
  const dated = { occurrences: { kind: "dates", dates: [{ date: "2026-12-01", start: "19:00" }] } };
  const anytime = { occurrences: null };
  const expired = { expires_at: "2020-01-01", occurrences: null };
  const endingToday = { expires_at: "2026-10-31", occurrences: null };
  // 05:30 UTC is 11:30pm the previous evening in Denver (MDT, UTC-6).
  const denverLate = new Date("2026-11-01T05:30:00.000Z");
  const denverNextMorning = new Date("2026-11-01T07:00:00.000Z");
  check("a plan date keeps an event on that day", occ.visibleOnPlan(dated, "2026-12-01", new Date()) === true);
  check("a plan date hides an event on another day", occ.visibleOnPlan(dated, "2026-11-02", new Date()) === false);
  check("an anytime idea stays on a plan date", occ.visibleOnPlan(anytime, "2026-11-02", new Date()) === true);
  check("a finished event is hidden with no plan date",
    occ.visibleOnPlan(expired, "", new Date("2026-11-03T18:00:00Z")) === false && occ.isPast(expired, new Date("2026-11-03T18:00:00Z")) === true);
  check("11:30pm Denver is still the event's last day",
    occ.denverToday(denverLate) === "2026-10-31" &&
    occ.visibleOnPlan(endingToday, "", denverLate) === true &&
    occ.isPast(endingToday, denverLate) === false);
  check("the same event is finished after Denver midnight",
    occ.denverToday(denverNextMorning) === "2026-11-01" &&
    occ.visibleOnPlan(endingToday, "", denverNextMorning) === false);
  const denverCmp = "(expires_at IS NULL OR expires_at >= (now() AT TIME ZONE 'America/Denver')::date)";
  const shapes = [
    buildListQuery({}),
    buildListQuery({ cursor: encodeCursor({ p: "i", id: 10 }) }),
    buildListQuery({ lat: 40.23, lng: -111.66, radiusMiles: 25 }),
    buildListQuery({ lat: 40.23, lng: -111.66, cursor: encodeCursor({ p: "n", id: 12, d: "10.5" }) }),
    buildListQuery({ lat: 40.23, lng: -111.66, cursor: encodeCursor({ p: "g", id: 12 }) }),
    buildListQuery({ lat: 40.23, lng: -111.66, localOnly: "1" }),
    buildListQuery({ lat: 40.23, lng: -111.66, localOnly: "1", cursor: encodeCursor({ p: "n", id: 4, d: "1" }) })
  ];
  shapes.forEach((query, index) => {
    check("query " + index + " compares expires_at to the Denver date",
      query.text.indexOf(denverCmp) !== -1 && query.text.indexOf(STILL_SHOWING_SQL) !== -1 &&
      query.text.indexOf("expires_at >= now()") === -1);
  });
});

section("the browser does not load the full catalog", () => {
  const root = path.join(__dirname, "..");
  const pubPath = path.join(root, "public", "data.js");
  const catPath = path.join(root, "data", "ideas-catalog.js");
  const pubBytes = fs.statSync(pubPath).size;
  const catBytes = fs.statSync(catPath).size;
  const starter = loadIdeas(pubPath);
  const catalog = loadIdeas(catPath);
  const starterIds = new Set(starter.map(idea => idea.id));
  check("the starter is a few kilobytes", pubBytes < 64 * 1024, String(pubBytes));
  check("the full catalog stays off public/", catBytes > 1000000 && catBytes > pubBytes * 20, String(catBytes));
  check("the starter is a small subset of the catalog",
    starter.length >= 8 && starter.length <= 32 && catalog.length > 1500 &&
    starter.every(idea => catalog.some(row => row.id === idea.id)));
  check("each starter idea matches the catalog row",
    starter.every(idea => {
      const row = catalog.find(item => item.id === idea.id);
      return row && JSON.stringify(row) === JSON.stringify(idea);
    }));
  check("removed ideas are in neither file", !starterIds.has(340) && !catalog.some(idea => idea.id === 340));
  const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
  check("the page loads the starter script", html.indexOf('src="data.js"') !== -1 && html.indexOf("ideas-catalog") === -1);
  const remoteSrc = fs.readFileSync(path.join(root, "public", "remote-activities.js"), "utf8");
  const appSrc = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
  check("the client asks for a cursor page",
    remoteSrc.indexOf("cursor=") !== -1 && remoteSrc.indexOf("offset=") === -1 && appSrc.indexOf("ideas-catalog") === -1);
  check("activity cache version moved to 6", remoteSrc.indexOf('API_VERSION = "6"') !== -1);
});

module.exports = { pass: pass, fail: fail };
