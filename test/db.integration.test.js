/* Postgres + PostGIS. Skips cleanly unless TEST_DATABASE_URL is set.
   Never points at production. Counts always come from IDEAS_DATA. */
"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { Pool } = require("pg");
const filters = require("../shared/filters");
const { migrate } = require("../db/migrate");
const { seed, loadIdeas } = require("../db/seed");
const { closePool } = require("../db");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}

function request(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ port: port, path: urlPath }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    }).on("error", reject);
  });
}

function matchesFilters(idea, f) {
  if (f.duration.length && f.duration.indexOf(idea.duration) === -1) return false;
  if (f.cost.length && f.cost.indexOf(idea.cost) === -1) return false;
  if (f.time.length && !idea.time.some(function (t) { return f.time.indexOf(t) !== -1; })) return false;
  if (f.setting.length) {
    var ok = idea.setting === "Both" || f.setting.indexOf(idea.setting) !== -1;
    if (!ok) return false;
  }
  if (f.vibe.length && !idea.vibe.some(function (v) { return f.vibe.indexOf(v) !== -1; })) return false;
  if (f.season.length && !idea.season.some(function (s) { return f.season.indexOf(s) !== -1; })) return false;
  if (f.stage.length && !idea.stage.some(function (s) { return f.stage.indexOf(s) !== -1; })) return false;
  if (f.dateType.length && !idea.dateType.some(function (d) { return f.dateType.indexOf(d) !== -1; })) return false;
  if (f.food !== null && idea.food !== f.food) return false;
  if (f.hide21 && idea.age21 === true) return false;
  return true;
}

function rng(seed) {
  let state = seed >>> 0;
  return function () {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pickSome(rand, options) {
  if (rand() < 0.4) return [];
  const copy = options.slice();
  const n = 1 + Math.floor(rand() * Math.min(2, copy.length));
  const out = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
}

async function expectFail(promise) {
  try {
    await promise;
    return false;
  } catch (err) {
    return true;
  }
}

async function fetchAll(port, query) {
  const items = [];
  let offset = 0;
  for (let guard = 0; guard < 40; guard++) {
    const joiner = query ? "&" : "";
    const res = await request(port, "/api/activities?" + query + joiner + "limit=200&offset=" + offset);
    if (res.status !== 200) throw new Error("list failed " + res.status + " " + res.body.slice(0, 180));
    const body = JSON.parse(res.body);
    items.push.apply(items, body.items);
    if (body.nextOffset == null) return items;
    offset = body.nextOffset;
  }
  throw new Error("pagination did not end");
}

function encodeFilters(f) {
  const parts = [];
  ["duration", "cost", "time", "setting", "vibe", "season", "stage", "dateType"].forEach(key => {
    if (f[key] && f[key].length) parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(f[key].join(",")));
  });
  if (f.food !== null && f.food !== undefined) parts.push("food=" + (f.food ? "true" : "false"));
  if (f.hide21) parts.push("hide21=true");
  return parts.join("&");
}

async function resetDatabase(pool) {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await pool.query("GRANT ALL ON SCHEMA public TO public");
  const roles = await pool.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')");
  const have = new Set(roles.rows.map(row => row.rolname));
  if (!have.has("anon")) await pool.query("CREATE ROLE anon NOLOGIN");
  if (!have.has("authenticated")) await pool.query("CREATE ROLE authenticated NOLOGIN");
}

async function main() {
  if (!process.env.TEST_DATABASE_URL) {
    console.log("  SKIP db integration (TEST_DATABASE_URL unset)");
    return { pass: 0, fail: 0 };
  }

  const previousUrl = process.env.DATABASE_URL;
  const previousSsl = process.env.PGSSLMODE;
  process.env.PGSSLMODE = "disable";
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const connectionString = process.env.TEST_DATABASE_URL;
  const pool = new Pool({ connectionString: connectionString, ssl: false, max: 5, connectionTimeoutMillis: 8000 });
  const ideas = loadIdeas(path.join(__dirname, "..", "public", "data.js"));
  const byId = {};
  ideas.forEach(idea => { byId[idea.id] = idea; });
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "spark-no-coords-"));
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "spark-fixture-coords-"));
  let server = null;

  try {
    await resetDatabase(pool);
    const first = await migrate({ pool: pool, connectionString: connectionString });
    const second = await migrate({ pool: pool, connectionString: connectionString });
    check("migration applied", first.applied.indexOf("001_init.sql") !== -1, first.applied.join(","));
    check("migration 002 applied", first.applied.indexOf("002_over100_age21.sql") !== -1, first.applied.join(","));
    check("second migrate is a no-op",
      second.applied.length === 0 &&
      second.skipped.indexOf("001_init.sql") !== -1 &&
      second.skipped.indexOf("002_over100_age21.sql") !== -1);

    const overCost = await pool.query(
      "insert into activities (title, category, setting, cost, duration, status, source, tier) " +
      "values ('Over', 'Hiking & Nature', 'Outdoor', 'Over $100', 'Full day', 'approved', 'community', 'free') " +
      "returning id, age21, cost"
    );
    check("Over $100 is allowed and age21 defaults to false",
      overCost.rows[0] && overCost.rows[0].cost === "Over $100" && overCost.rows[0].age21 === false);
    let costCode = null;
    try {
      await pool.query(
        "insert into activities (title, category, setting, cost, duration) " +
        "values ('Too much', 'Hiking & Nature', 'Outdoor', '$500', 'Quick (under 1 hr)')"
      );
    } catch (err) {
      costCode = err.code;
    }
    check("a cost outside the check is rejected", costCode === "23514", costCode);
    const ageCol = await pool.query(
      "select is_nullable, column_default from information_schema.columns " +
      "where table_schema = 'public' and table_name = 'activities' and column_name = 'age21'"
    );
    check("age21 is boolean not null default false",
      ageCol.rows[0] && ageCol.rows[0].is_nullable === "NO" &&
      String(ageCol.rows[0].column_default).indexOf("false") !== -1,
      JSON.stringify(ageCol.rows[0]));
    await pool.query("delete from activities where id = $1", [overCost.rows[0].id]);

    const app = require("../server");
    server = await new Promise(resolve => {
      const listening = app.listen(0, () => resolve(listening));
    });
    const port = server.address().port;

    await seed({ pool: pool, connectionString: connectionString, coordsDir: emptyDir });
    await seed({ pool: pool, connectionString: connectionString, coordsDir: emptyDir });
    const approved = await pool.query(
      "select id from activities where status = 'approved' and source = 'curated' order by id"
    );
    const ideaIds = ideas.map(idea => idea.id).sort((a, b) => a - b);
    check("approved curated count matches IDEAS_DATA",
      approved.rows.length === ideas.length && approved.rows.every((row, i) => row.id === ideaIds[i]),
      approved.rows.length + " rows");
    const located = await pool.query(
      "select count(*)::int as n from activities where location is not null or coords_locked"
    );
    check("seed without coords leaves every location empty and unlocked", located.rows[0].n === 0, String(located.rows[0].n));

    const center = { lat: 40.76, lng: -111.89 };
    const pins = [
      { id: 910001, miles: 1 },
      { id: 910002, miles: 10 },
      { id: 910003, miles: 40 }
    ];
    for (const pin of pins) {
      const lat = center.lat + pin.miles / 69;
      await pool.query(
        "insert into activities (id, title, description, category, icon, setting, cost, duration, status, source, tier, location, address) " +
        "values ($1, $2, '', 'Hiking & Nature', '', 'Outdoor', 'Free', 'Short (1-2 hrs)', 'approved', 'community', 'free', " +
        "ST_MakePoint($3, $4)::geography, 'Salt Lake City')",
        [pin.id, "Pin " + pin.miles, center.lng, lat]
      );
    }
    const radius = await request(port, "/api/activities?lat=40.76&lng=-111.89&radiusMiles=25&limit=50");
    const radiusBody = JSON.parse(radius.body);
    const radiusIds = radiusBody.items.map(item => item.id);
    check("radius 25 returns the two nearer pins in distance order",
      radius.status === 200 && radiusIds.length === 2 && radiusIds[0] === 910001 && radiusIds[1] === 910002,
      radius.status + " " + radiusIds.join(","));
    check("distanceMiles is present and ordered",
      radiusBody.items.length === 2 &&
      radiusBody.items[0].distanceMiles < radiusBody.items[1].distanceMiles &&
      radiusBody.items[0].distanceMiles < 5 && radiusBody.items[1].distanceMiles < 20);
    check("the 40 mile pin is outside the radius", radiusIds.indexOf(910003) === -1);
    await pool.query("delete from activities where id = any($1::int[])", [pins.map(pin => pin.id)]);

    const sample = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "coords", "utah.sample.json"), "utf8"));
    sample["340"] = {
      id: 340, status: "confident", lat: 40.2, lng: -111.7, locked: false,
      address: "gone", source: "nominatim", confidence: "high", resolvedAt: "2026-10-29T19:24:23.915Z"
    };
    fs.writeFileSync(path.join(fixtureDir, "utah.json"), JSON.stringify(sample));
    const fixtureResult = await seed({ pool: pool, connectionString: connectionString, coordsDir: fixtureDir });
    const confident = await pool.query(
      "select address, coords_locked, ST_Y(location::geometry) as lat from activities where id = 187"
    );
    check("confident row has a location and address",
      confident.rows[0] && confident.rows[0].lat != null && String(confident.rows[0].address).indexOf("Stewart Falls") !== -1 &&
      confident.rows[0].coords_locked === false);
    const area = await pool.query("select geo_status, location is null as empty from activities where id = 350");
    check("area_based row keeps geo_status and no location",
      area.rows[0] && area.rows[0].geo_status === "area_based" && area.rows[0].empty === true);
    const locked = await pool.query(
      "select coords_locked, ST_Y(location::geometry) as lat, address from activities where id = 1876"
    );
    const lockedLat = Number(locked.rows[0].lat);
    check("locked row is pinned and coords_locked",
      locked.rows[0].coords_locked === true && lockedLat > 40 && locked.rows[0].address.indexOf("101 W 100 N") !== -1);
    const unknown = await pool.query("select geo_status, location is null as empty from activities where id = 12");
    check("unknown status is metadata only",
      unknown.rows[0] && unknown.rows[0].geo_status === "ambiguous" && unknown.rows[0].empty === true);
    check("id missing from the catalog is counted unknown",
      fixtureResult.coords && fixtureResult.coords.unknown_id >= 1, JSON.stringify(fixtureResult.coords));
    const nearFalls = await request(port, "/api/activities?lat=40.39&lng=-111.60&radiusMiles=5&limit=50");
    const nearIds = JSON.parse(nearFalls.body).items.map(item => item.id);
    check("confident pin shows up in a radius query", nearFalls.status === 200 && nearIds.indexOf(187) !== -1, nearIds.join(","));

    sample["1876"].lat = 41.5;
    fs.writeFileSync(path.join(fixtureDir, "utah.json"), JSON.stringify(sample));
    const relock = await seed({ pool: pool, connectionString: connectionString, coordsDir: fixtureDir });
    const lockedAfter = await pool.query("select ST_Y(location::geometry) as lat from activities where id = 1876");
    check("reseeding coords does not move a locked pin",
      Math.abs(Number(lockedAfter.rows[0].lat) - lockedLat) < 0.00001 &&
      relock.coords && relock.coords.skipped_locked >= 1,
      JSON.stringify(relock.coords));
    const raised = await expectFail(pool.query(
      "update activities set location = ST_MakePoint(-111.8, 40.7)::geography where id = 1876"
    ));
    check("a direct location update on a locked row is rejected", raised);
    const beforeContent = await pool.query(
      "select ST_AsText(location::geometry) as g, address, coords_locked from activities where id = 187"
    );
    await seed({ pool: pool, connectionString: connectionString, coordsDir: emptyDir });
    const afterContent = await pool.query(
      "select ST_AsText(location::geometry) as g, address, coords_locked from activities where id = 187"
    );
    check("re-seeding content does not touch coordinates",
      beforeContent.rows[0].g === afterContent.rows[0].g &&
      beforeContent.rows[0].address === afterContent.rows[0].address &&
      beforeContent.rows[0].coords_locked === afterContent.rows[0].coords_locked);

    const pending = await pool.query(
      "insert into activities (title, category, setting, cost, duration) " +
      "values ('Unreviewed', 'Hiking & Nature', 'Outdoor', 'Free', 'Quick (under 1 hr)') returning id, status, source"
    );
    check("omitted status and source default to pending community",
      pending.rows[0].status === "pending" && pending.rows[0].source === "community");
    const pendingGet = await request(port, "/api/activities/" + pending.rows[0].id);
    check("pending row is 404", pendingGet.status === 404);
    const paid = await pool.query(
      "insert into activities (title, category, setting, cost, duration, status, tier, source) " +
      "values ('Paid', 'Hiking & Nature', 'Indoor', '$20-$30', 'Short (1-2 hrs)', 'approved', 'paid', 'business') returning id"
    );
    const paidGet = await request(port, "/api/activities/" + paid.rows[0].id);
    const paidList = await fetchAll(port, "");
    check("approved paid row is not returned",
      paidGet.status === 404 && paidList.every(item => item.id !== paid.rows[0].id && item.id !== pending.rows[0].id));
    const sources = await pool.query("select source, auto_publish from sources order by source");
    check("five sources all default auto_publish off",
      sources.rows.length === 5 && sources.rows.every(row => row.auto_publish === false),
      sources.rows.map(row => row.source + ":" + row.auto_publish).join(","));

    check("submission without email fails", await expectFail(pool.query(
      "insert into submissions (payload) values ('{}'::jsonb)"
    )));
    await pool.query("insert into submissions (payload, submitter_email) values ('{}'::jsonb, 'Bob@Example.COM')");
    const email = await pool.query(
      "select (submitter_email = 'bob@example.com') as same from submissions where submitter_email = 'bob@example.com'"
    );
    check("citext treats Bob@Example.COM as bob@example.com", email.rows[0] && email.rows[0].same === true);
    check("submission email format is checked", await expectFail(pool.query(
      "insert into submissions (payload, submitter_email) values ('{}'::jsonb, 'not-an-email')"
    )));

    const anon = await pool.connect();
    try {
      await anon.query("BEGIN");
      await anon.query("SET LOCAL ROLE anon");
      let hidden = false;
      try {
        const visible = await anon.query("select id from activities limit 1");
        hidden = visible.rows.length === 0;
      } catch (err) {
        hidden = true;
      }
      check("anon cannot read activities", hidden);
      await anon.query("ROLLBACK");
    } finally {
      anon.release();
    }

    await pool.query(
      "insert into activities (id, title, category, setting, cost, duration, status, source, tier) " +
      "values (930001, 'Biz', 'Hiking & Nature', 'Indoor', 'Free', 'Quick (under 1 hr)', 'approved', 'business', 'free')"
    );
    const removed = ideas[0];
    const reduced = ideas.filter(idea => idea.id !== removed.id);
    const reducedFile = path.join(os.tmpdir(), "spark-ideas-reduced-" + process.pid + ".js");
    fs.writeFileSync(reducedFile, "const IDEAS_DATA = " + JSON.stringify(reduced) + ";\n");
    await seed({ pool: pool, connectionString: connectionString, ideasFile: reducedFile, coordsDir: emptyDir });
    const archived = await pool.query(
      "select status, retired_at is not null as retired, title from activities where id = $1",
      [removed.id]
    );
    check("removed curated id is archived and still present",
      archived.rows.length === 1 && archived.rows[0].status === "archived" && archived.rows[0].retired === true);
    const others = await pool.query(
      "select count(*)::int as n from activities where source = 'curated' and status = 'approved'"
    );
    check("other curated rows stay approved", others.rows[0].n === reduced.length, String(others.rows[0].n));
    const biz = await pool.query("select status, retired_at from activities where id = 930001");
    check("non-curated approved rows are not retired",
      biz.rows[0].status === "approved" && biz.rows[0].retired_at == null);
    const gone = await request(port, "/api/activities/" + removed.id);
    const goneList = await fetchAll(port, "category=" + encodeURIComponent(removed.category));
    check("archived id is 404 and absent from the list",
      gone.status === 404 && goneList.every(item => item.id !== removed.id));
    await seed({ pool: pool, connectionString: connectionString, coordsDir: emptyDir });
    const restored = await pool.query("select status, retired_at from activities where id = $1", [removed.id]);
    check("returning id is approved again",
      restored.rows[0].status === "approved" && restored.rows[0].retired_at == null);

    await pool.query("delete from activities where id in (930001, $1, $2)", [pending.rows[0].id, paid.rows[0].id]);
    // The fixture locked #1876. Clear that lock so the real utah.json is what pins it.
    await pool.query("update activities set coords_locked = false where id = 1876");

    await seed({ pool: pool, connectionString: connectionString });
    check("#340 is absent from IDEAS_DATA", !byId[340]);
    const trafalga = await request(port, "/api/activities/340");
    check("GET /api/activities/340 is 404", trafalga.status === 404 && JSON.parse(trafalga.body).error === "not_found");
    const ageCount = await pool.query(
      "select count(*)::int as n from activities where source = 'curated' and status = 'approved' and age21"
    );
    check("seeded age21 ideas are the 16 alcohol-centered rows", ageCount.rows[0].n === 16, String(ageCount.rows[0].n));
    for (const goneId of [336, 778, 1424, 1548]) {
      const goneRes = await request(port, "/api/activities/" + goneId);
      check("removed #" + goneId + " is 404", goneRes.status === 404 && JSON.parse(goneRes.body).error === "not_found");
    }
    for (const id of [1854, 1876]) {
      const row = await pool.query("select title, description, setting from activities where id = $1", [id]);
      const idea = byId[id];
      check("#" + id + " matches data.js",
        !!idea && row.rows[0] && row.rows[0].title === idea.title &&
        row.rows[0].description === idea.description && row.rows[0].setting === idea.setting,
        idea ? idea.title : "missing idea");
    }
    const realLocked = await pool.query(
      "select coords_locked, geo_source, location is not null as pinned from activities where id = 1876"
    );
    check("real utah file locks the hand pin",
      realLocked.rows[0] && realLocked.rows[0].coords_locked === true && realLocked.rows[0].pinned === true &&
      realLocked.rows[0].geo_source === "manual");

    const rand = rng(0x5e1);
    let parityBad = 0;
    const combos = [];
    for (let i = 0; i < 20; i++) {
      combos.push({
        duration: pickSome(rand, filters.duration),
        cost: pickSome(rand, filters.cost),
        time: pickSome(rand, filters.time),
        setting: pickSome(rand, filters.setting),
        vibe: pickSome(rand, filters.vibe),
        season: pickSome(rand, filters.season),
        stage: pickSome(rand, filters.stage),
        dateType: pickSome(rand, filters.dateType),
        food: rand() < 0.33 ? null : rand() < 0.5,
        hide21: rand() < 0.5
      });
    }
    for (const combo of combos) {
      const expected = ideas.filter(idea => matchesFilters(idea, combo)).map(idea => idea.id).sort((a, b) => a - b);
      const got = (await fetchAll(port, encodeFilters(combo))).map(item => item.id).sort((a, b) => a - b);
      if (expected.length !== got.length || expected.some((id, i) => id !== got[i])) parityBad++;
    }
    check("20 filter combos match matchesFilters", parityBad === 0, parityBad + " differed");
    const leaked = (await fetchAll(port, "")).some(item => item.status || JSON.stringify(item).indexOf("submitter_email") !== -1);
    check("public items never include status or submitter_email", !leaked);
  } catch (err) {
    check("integration suite", false, (err && (err.stack || err.message) || String(err)).slice(0, 500));
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await closePool();
    await pool.end();
    if (previousUrl == null) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousSsl == null) delete process.env.PGSSLMODE;
    else process.env.PGSSLMODE = previousSsl;
  }
  return { pass: pass, fail: fail };
}

module.exports = main();
