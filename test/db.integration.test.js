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

async function applyMigrationFiles(pool, filenames) {
  const client = await pool.connect();
  try {
    await client.query(
      "create table if not exists schema_migrations (" +
      "filename text primary key, applied_at timestamptz not null default now())"
    );
    for (const filename of filenames) {
      const sql = fs.readFileSync(path.join(__dirname, "..", "db", "migrations", filename), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (filename) values ($1)", [filename]);
        await client.query("COMMIT");
      } catch (err) {
        try { await client.query("ROLLBACK"); } catch (e) { /* already aborted */ }
        throw err;
      }
    }
  } finally {
    client.release();
  }
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
    await applyMigrationFiles(pool, ["001_init.sql", "002_over100_age21.sql"]);
    await seed({ pool: pool, connectionString: connectionString, coordsDir: emptyDir });
    const beforeUpgrade = await pool.query(
      "select id, title, description, category, age21, status, source from activities order by id"
    );
    const upgrade = await migrate({ pool: pool, connectionString: connectionString });
    const afterUpgrade = await pool.query(
      "select id, title, description, category, age21, status, source, source_url, city from activities order by id"
    );
    check("upgrade applies only 003",
      upgrade.applied.length === 1 && upgrade.applied[0] === "003_source_url_city.sql" &&
      upgrade.skipped.indexOf("001_init.sql") !== -1 &&
      upgrade.skipped.indexOf("002_over100_age21.sql") !== -1,
      upgrade.applied.join(",") + " / " + upgrade.skipped.join(","));
    const upgradedSame = beforeUpgrade.rows.length === ideas.length &&
      afterUpgrade.rows.length === ideas.length &&
      beforeUpgrade.rows.every((row, i) => {
        const next = afterUpgrade.rows[i];
        return next && row.id === next.id && row.title === next.title &&
          row.description === next.description && row.category === next.category &&
          row.age21 === next.age21 && row.status === next.status && row.source === next.source &&
          next.source_url == null && next.city == null;
      });
    check("003 on a seeded database leaves rows untouched", upgradedSame, String(afterUpgrade.rows.length));

    await resetDatabase(pool);
    const first = await migrate({ pool: pool, connectionString: connectionString });
    const second = await migrate({ pool: pool, connectionString: connectionString });
    check("migration applied", first.applied.indexOf("001_init.sql") !== -1, first.applied.join(","));
    check("migration 002 applied", first.applied.indexOf("002_over100_age21.sql") !== -1, first.applied.join(","));
    check("migration 003 applied", first.applied.indexOf("003_source_url_city.sql") !== -1, first.applied.join(","));
    check("second migrate is a no-op",
      second.applied.length === 0 &&
      second.skipped.indexOf("001_init.sql") !== -1 &&
      second.skipped.indexOf("002_over100_age21.sql") !== -1 &&
      second.skipped.indexOf("003_source_url_city.sql") !== -1);
    let reran = true;
    try {
      await pool.query(fs.readFileSync(path.join(__dirname, "..", "db", "migrations", "003_source_url_city.sql"), "utf8"));
    } catch (err) {
      reran = false;
    }
    check("003 sql can run again", reran);

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
    const addedCols = await pool.query(
      "select column_name, is_nullable from information_schema.columns " +
      "where table_schema = 'public' and table_name = 'activities' and column_name in ('source_url', 'city')"
    );
    const nullable = {};
    addedCols.rows.forEach(row => { nullable[row.column_name] = row.is_nullable; });
    check("source_url and city are nullable", nullable.source_url === "YES" && nullable.city === "YES", JSON.stringify(nullable));
    const cityIdx = await pool.query(
      "select indexdef from pg_indexes where schemaname = 'public' and indexname = 'activities_city_idx'"
    );
    const indexdef = cityIdx.rows[0] ? cityIdx.rows[0].indexdef : "";
    check("city index is case-insensitive and partial",
      /lower/i.test(indexdef) && /city/i.test(indexdef) && /is not null/i.test(indexdef),
      indexdef);
    async function sourceUrlCode(url) {
      try {
        const inserted = await pool.query(
          "insert into activities (title, category, setting, cost, duration, source_url) " +
          "values ('Link', 'Hiking & Nature', 'Outdoor', 'Free', 'Quick (under 1 hr)', $1) returning id",
          [url]
        );
        await pool.query("delete from activities where id = $1", [inserted.rows[0].id]);
        return null;
      } catch (err) {
        return err.code;
      }
    }
    check("http source_url is rejected", await sourceUrlCode("http://x") === "23514");
    check("source_url with a space is rejected", await sourceUrlCode("https://a b") === "23514");
    check("javascript: source_url is rejected", await sourceUrlCode("javascript:") === "23514");
    const urlPrefix = "https://getoutgames.com/";
    const maxUrl = urlPrefix + "a".repeat(2048 - urlPrefix.length);
    check("source_url longer than 2048 is rejected", await sourceUrlCode(maxUrl + "b") === "23514");
    const acceptedUrl = await pool.query(
      "insert into activities (title, category, setting, cost, duration, source_url) " +
      "values ('Link', 'Hiking & Nature', 'Outdoor', 'Free', 'Quick (under 1 hr)', $1) returning id, source_url",
      ["https://getoutgames.com/provo/"]
    );
    const nullUrl = await pool.query(
      "insert into activities (title, category, setting, cost, duration, source_url, city) " +
      "values ('No link', 'Hiking & Nature', 'Outdoor', 'Free', 'Quick (under 1 hr)', null, null) returning id, source_url, city"
    );
    const maxAccepted = await pool.query(
      "insert into activities (title, category, setting, cost, duration, source_url) " +
      "values ('Max', 'Hiking & Nature', 'Outdoor', 'Free', 'Quick (under 1 hr)', $1) returning id, source_url",
      [maxUrl]
    );
    check("https source_url is accepted",
      acceptedUrl.rows[0].source_url === "https://getoutgames.com/provo/" && maxAccepted.rows[0].source_url.length === 2048);
    check("null source_url and city are accepted",
      nullUrl.rows[0].source_url === null && nullUrl.rows[0].city === null);
    await pool.query("delete from activities where id = any($1::int[])", [[
      overCost.rows[0].id, acceptedUrl.rows[0].id, nullUrl.rows[0].id, maxAccepted.rows[0].id
    ]]);

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
    const afterSeedMigrate = await migrate({ pool: pool, connectionString: connectionString });
    const curatedAfter = await pool.query(
      "select count(*)::int as n from activities where status = 'approved' and source = 'curated'"
    );
    const freshCols = await pool.query(
      "select count(*) filter (where source_url is not null)::int as urls, " +
      "count(*) filter (where city is not null)::int as cities, " +
      "count(*) filter (where age21 is null)::int as null_age " +
      "from activities where source = 'curated'"
    );
    check("migrate after seed is a no-op",
      afterSeedMigrate.applied.length === 0 && afterSeedMigrate.skipped.indexOf("003_source_url_city.sql") !== -1);
    check("re-running migrate keeps the curated count",
      curatedAfter.rows[0].n === ideas.length, String(curatedAfter.rows[0].n));
    check("seed without coords leaves source_url and city null",
      freshCols.rows[0].urls === 0 && freshCols.rows[0].cities === 0 && freshCols.rows[0].null_age === 0,
      JSON.stringify(freshCols.rows[0]));

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
    const mappedCities = await pool.query(
      "select id, city, source_url from activities where id = any($1::int[])",
      [[12, 105, 187, 350, 361, 500, 1876]]
    );
    const cityById = {};
    mappedCities.rows.forEach(row => { cityById[row.id] = row; });
    check("coords city is stored for every status and source notes are not",
      cityById[187] && cityById[187].city === "Sundance" && cityById[187].source_url == null &&
      cityById[350] && cityById[350].city === "Salt Lake City" && cityById[350].source_url == null &&
      cityById[361] && cityById[361].city == null &&
      cityById[500] && cityById[500].city === "Provo" &&
      cityById[105] && cityById[105].city === "Provo" && cityById[105].source_url == null &&
      cityById[12] && cityById[12].city === "Provo" &&
      cityById[1876] && cityById[1876].city === "Provo" && cityById[1876].source_url == null,
      JSON.stringify(mappedCities.rows));
    check("id missing from the catalog is counted unknown",
      fixtureResult.coords && fixtureResult.coords.unknown_id >= 1, JSON.stringify(fixtureResult.coords));
    const nearFalls = await request(port, "/api/activities?lat=40.39&lng=-111.60&radiusMiles=5&limit=50");
    const nearIds = JSON.parse(nearFalls.body).items.map(item => item.id);
    check("confident pin shows up in a radius query", nearFalls.status === 200 && nearIds.indexOf(187) !== -1, nearIds.join(","));

    sample["1876"].lat = 41.5;
    sample["1876"].city = "Other City";
    fs.writeFileSync(path.join(fixtureDir, "utah.json"), JSON.stringify(sample));
    await pool.query("update activities set city = $1 where id = 1876", ["Kept City"]);
    const relock = await seed({ pool: pool, connectionString: connectionString, coordsDir: fixtureDir });
    const lockedAfter = await pool.query("select ST_Y(location::geometry) as lat, city from activities where id = 1876");
    check("reseeding coords does not move a locked pin",
      Math.abs(Number(lockedAfter.rows[0].lat) - lockedLat) < 0.00001 &&
      relock.coords && relock.coords.skipped_locked >= 1,
      JSON.stringify(relock.coords));
    check("a locked row keeps its city across a re-seed",
      lockedAfter.rows[0].city === "Kept City", lockedAfter.rows[0].city);
    const raised = await expectFail(pool.query(
      "update activities set location = ST_MakePoint(-111.8, 40.7)::geography where id = 1876"
    ));
    check("a direct location update on a locked row is rejected", raised);
    await pool.query(
      "update activities set city = $2, source_url = $3 where id = $1",
      [187, "Admin City", "https://getoutgames.com/provo/"]
    );
    const beforeContent = await pool.query(
      "select ST_AsText(location::geometry) as g, address, coords_locked, city, source_url from activities where id = 187"
    );
    await seed({ pool: pool, connectionString: connectionString, coordsDir: emptyDir });
    const afterContent = await pool.query(
      "select ST_AsText(location::geometry) as g, address, coords_locked, city, source_url from activities where id = 187"
    );
    check("re-seeding content does not touch coordinates",
      beforeContent.rows[0].g === afterContent.rows[0].g &&
      beforeContent.rows[0].address === afterContent.rows[0].address &&
      beforeContent.rows[0].coords_locked === afterContent.rows[0].coords_locked);
    check("re-seeding content keeps city and source_url",
      afterContent.rows[0].city === "Admin City" &&
      afterContent.rows[0].source_url === "https://getoutgames.com/provo/" &&
      beforeContent.rows[0].city === afterContent.rows[0].city &&
      beforeContent.rows[0].source_url === afterContent.rows[0].source_url);

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

    const utah = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "coords", "utah.json"), "utf8"));
    const seededCity = await pool.query("select city, source_url, coords_locked from activities where id = 187");
    const expectedCity = (typeof utah["187"].city === "string" && utah["187"].city.trim()) ? utah["187"].city.trim() : null;
    check("a seeded utah id gets its city from the coords file",
      seededCity.rows[0] && seededCity.rows[0].city === expectedCity && seededCity.rows[0].coords_locked === false,
      seededCity.rows[0] && seededCity.rows[0].city);
    check("coords re-seed does not clear an admin source_url",
      seededCity.rows[0] && seededCity.rows[0].source_url === "https://getoutgames.com/provo/");
    const areaCity = await pool.query(
      "select city, location is null as empty from activities where id = 350"
    );
    const expectedArea = (typeof utah["350"].city === "string" && utah["350"].city.trim()) ? utah["350"].city.trim() : null;
    check("an unpinned status still gets city from the coords file",
      areaCity.rows[0] && areaCity.rows[0].empty === true && areaCity.rows[0].city === expectedArea,
      areaCity.rows[0] && areaCity.rows[0].city);
    const noteUrls = [];
    Object.keys(utah).forEach(key => {
      if (utah[key] && utah[key].source_url) noteUrls.push(utah[key].source_url);
    });
    const copiedNotes = await pool.query(
      "select id from activities where source_url = any($1::text[])",
      [noteUrls]
    );
    check("coords source notes are never stored on source_url", copiedNotes.rows.length === 0, String(copiedNotes.rows.length));
    const dbCities = await pool.query(
      "select id, city, coords_locked from activities where source = 'curated'"
    );
    const dbById = {};
    dbCities.rows.forEach(row => { dbById[row.id] = row; });
    let cityMismatch = 0;
    Object.keys(utah).forEach(key => {
      const entry = utah[key];
      const row = dbById[entry.id];
      if (!row || row.coords_locked) return;
      const expected = (typeof entry.city === "string" && entry.city.trim()) ? entry.city.trim() : null;
      if (row.city !== expected) cityMismatch++;
    });
    check("unlocked rows take city from the coords file", cityMismatch === 0, String(cityMismatch));

    const provo = await fetchAll(port, "city=provo");
    const provoUpper = await fetchAll(port, "city=PROVO");
    const provoDb = await pool.query(
      "select count(*)::int as n from activities where status = 'approved' and tier = 'free' and lower(city) = 'provo'"
    );
    check("city=provo returns only Provo rows",
      provo.length > 0 && provo.every(item => item.city && item.city.toLowerCase() === "provo" &&
        Object.prototype.hasOwnProperty.call(item, "sourceUrl") && Object.prototype.hasOwnProperty.call(item, "age21")));
    check("city filter is case-insensitive",
      provo.length === provoDb.rows[0].n &&
      provoUpper.map(item => item.id).join(",") === provo.map(item => item.id).join(","),
      provo.length + " vs " + (provoDb.rows[0] && provoDb.rows[0].n));
    const provoDetail = await request(port, "/api/activities/" + provo[0].id);
    const provoBody = JSON.parse(provoDetail.body);
    check("detail returns sourceUrl, city, and age21",
      provoDetail.status === 200 && provoBody.city === provo[0].city &&
      Object.prototype.hasOwnProperty.call(provoBody, "sourceUrl") && typeof provoBody.age21 === "boolean" &&
      !Object.prototype.hasOwnProperty.call(provoBody, "source_url"));
    const ageIdea = ideas.find(idea => idea.age21 === true);
    const ageDefault = await request(port, "/api/activities/" + ageIdea.id);
    const ageDefaultBody = JSON.parse(ageDefault.body);
    const ageCategory = "category=" + encodeURIComponent(ageIdea.category);
    const ageShown = await fetchAll(port, ageCategory);
    const ageShownFalse = await fetchAll(port, ageCategory + "&hide21=false");
    const ageHidden = await fetchAll(port, ageCategory + "&hide21=true");
    check("a seeded age21 row is returned by default",
      ageDefault.status === 200 && ageDefaultBody.age21 === true && ageDefaultBody.id === ageIdea.id &&
      ageShown.some(item => item.id === ageIdea.id && item.age21 === true));
    check("hide21=false still returns that age21 row",
      ageShownFalse.some(item => item.id === ageIdea.id && item.age21 === true));
    check("hide21=true excludes that age21 row",
      ageHidden.every(item => item.id !== ageIdea.id && item.age21 !== true));

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
