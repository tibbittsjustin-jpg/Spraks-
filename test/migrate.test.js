/* migrate.js skip rules, with a fake query layer. No database. */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { migrate } = require("../db/migrate");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}

function writeMigrations(dir, files) {
  fs.mkdirSync(dir, { recursive: true });
  Object.keys(files).forEach(name => {
    fs.writeFileSync(path.join(dir, name), files[name]);
  });
}

function mockClient(state) {
  state.own = state.own || new Set();
  state.executed = [];
  state.calls = [];
  state.failOn = state.failOn || null;
  return {
    async query(sql, params) {
      const text = String(sql);
      state.calls.push({ text: text, params: params || null });
      if (text.indexOf("create table if not exists schema_migrations") !== -1) {
        return { rowCount: 0, rows: [] };
      }
      if (text.indexOf("information_schema.tables") !== -1) {
        return state.supabaseExists
          ? { rowCount: 1, rows: [{ ok: 1 }] }
          : { rowCount: 0, rows: [] };
      }
      if (text.indexOf("select name from supabase_migrations.schema_migrations") !== -1) {
        if (!state.supabaseExists) {
          const err = new Error("relation supabase_migrations.schema_migrations does not exist");
          err.code = "42P01";
          throw err;
        }
        const rows = Array.from(state.supabaseNames || []).map(name => ({ name: name }));
        return { rowCount: rows.length, rows: rows };
      }
      if (text.indexOf("from schema_migrations where filename") !== -1) {
        const hit = state.own.has(params[0]);
        return { rowCount: hit ? 1 : 0, rows: hit ? [{ ok: 1 }] : [] };
      }
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
        return { rowCount: 0, rows: [] };
      }
      if (text.indexOf("insert into schema_migrations") !== -1) {
        state.own.add(params[0]);
        return { rowCount: 1, rows: [] };
      }
      state.executed.push(text);
      if (state.failOn && text.indexOf(state.failOn) !== -1) {
        const err = new Error("migration failed");
        err.code = "42601";
        throw err;
      }
      return { rowCount: 0, rows: [] };
    },
    release() { state.released = true; }
  };
}

function gapFiles() {
  return {
    "001_init.sql": "-- apply 001",
    "002_over100_age21.sql": "-- apply 002",
    "003_source_url_city.sql": "-- apply 003",
    "006_security_hardening.sql": "-- apply 006"
  };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spark-migrate-"));

  const gapDir = path.join(root, "gap");
  writeMigrations(gapDir, gapFiles());
  const gapState = { supabaseExists: false };
  const gapClient = mockClient(gapState);
  const gap = await migrate({ client: gapClient, migrationsDir: gapDir });
  check("a missing 004 and 005 does not block 006",
    gap.applied.join(",") === "001_init.sql,002_over100_age21.sql,003_source_url_city.sql,006_security_hardening.sql" &&
    gap.skipped.length === 0 &&
    gapState.executed.join("|") === "-- apply 001|-- apply 002|-- apply 003|-- apply 006",
    gap.applied.join(",") + " exec " + gapState.executed.join("|"));
  check("006 ran inside its own transaction",
    gapState.calls.filter(call => call.text === "BEGIN").length === 4 &&
    gapState.calls.filter(call => call.text === "COMMIT").length === 4);
  const gapAgain = await migrate({ client: gapClient, migrationsDir: gapDir });
  check("a second run skips every file already in schema_migrations",
    gapAgain.applied.length === 0 && gapAgain.skipped.length === 4 &&
    gapState.executed.length === 4);

  const supabaseDir = path.join(root, "supabase");
  writeMigrations(supabaseDir, gapFiles());
  const supabaseState = {
    supabaseExists: true,
    supabaseNames: ["001_init", "002_over100_age21", "003_source_url_city"]
  };
  const supabaseClient = mockClient(supabaseState);
  const supabaseRun = await migrate({ client: supabaseClient, migrationsDir: supabaseDir });
  check("supabase names skip 001-003 and 006 still applies",
    supabaseRun.skipped.join(",") === "001_init.sql,002_over100_age21.sql,003_source_url_city.sql" &&
    supabaseRun.applied.join(",") === "006_security_hardening.sql" &&
    supabaseState.executed.join("|") === "-- apply 006" &&
    !supabaseState.own.has("001_init.sql") &&
    supabaseState.own.has("006_security_hardening.sql"),
    supabaseRun.applied.join(",") + " / " + supabaseRun.skipped.join(","));
  check("supabase history is read once",
    supabaseState.calls.filter(call => call.text.indexOf("select name from supabase_migrations.schema_migrations") !== -1).length === 1);

  const namedDir = path.join(root, "named");
  writeMigrations(namedDir, { "006_security_hardening.sql": "-- apply 006" });
  const namedState = { supabaseExists: true, supabaseNames: ["006_security_hardening.sql"] };
  const namedRun = await migrate({ client: mockClient(namedState), migrationsDir: namedDir });
  check("a supabase name equal to the filename also skips",
    namedRun.applied.length === 0 && namedRun.skipped[0] === "006_security_hardening.sql" &&
    namedState.executed.length === 0);

  const absentDir = path.join(root, "absent");
  writeMigrations(absentDir, { "006_security_hardening.sql": "-- apply 006" });
  const absentState = { supabaseExists: false };
  const absentClient = mockClient(absentState);
  await migrate({ client: absentClient, migrationsDir: absentDir });
  check("a missing supabase table is not queried",
    absentState.executed.join("|") === "-- apply 006" &&
    absentState.calls.every(call => call.text.indexOf("select name from supabase_migrations.schema_migrations") === -1));

  const ownDir = path.join(root, "own");
  writeMigrations(ownDir, gapFiles());
  const ownState = { supabaseExists: false, own: new Set(["001_init.sql", "006_security_hardening.sql"]) };
  const ownRun = await migrate({ client: mockClient(ownState), migrationsDir: ownDir });
  check("local tracking skips without re-running SQL",
    ownRun.skipped.indexOf("001_init.sql") !== -1 &&
    ownRun.skipped.indexOf("006_security_hardening.sql") !== -1 &&
    ownRun.applied.join(",") === "002_over100_age21.sql,003_source_url_city.sql" &&
    ownState.executed.join("|") === "-- apply 002|-- apply 003");

  const failDir = path.join(root, "fail");
  writeMigrations(failDir, {
    "001_init.sql": "-- apply 001",
    "006_security_hardening.sql": "-- fail 006"
  });
  const failState = { supabaseExists: false, failOn: "-- fail 006" };
  let threw = false;
  let message = "";
  try {
    await migrate({ client: mockClient(failState), migrationsDir: failDir });
  } catch (err) {
    threw = true;
    message = err.message;
  }
  check("a failed migration rolls back and is not recorded",
    threw && message === "migration failed" &&
    failState.own.has("001_init.sql") &&
    !failState.own.has("006_security_hardening.sql") &&
    failState.calls.some(call => call.text === "ROLLBACK") &&
    failState.calls.filter(call => call.text === "COMMIT").length === 1,
    message);

  const materialsDir = path.join(root, "materials");
  writeMigrations(materialsDir, {
    "001_init.sql": "-- apply 001",
    "004_materials.sql": "-- apply 004_materials",
    "006_security_hardening.sql": "-- apply 006"
  });
  const materialsState = { supabaseExists: false };
  const materialsRun = await migrate({ client: mockClient(materialsState), migrationsDir: materialsDir });
  check("005 can be missing while 004_materials and 006 both apply",
    materialsRun.applied.join(",") === "001_init.sql,004_materials.sql,006_security_hardening.sql" &&
    materialsState.executed.join("|") === "-- apply 001|-- apply 004_materials|-- apply 006",
    materialsRun.applied.join(","));

  const previousUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const missing = await migrate({});
  if (previousUrl == null) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousUrl;
  check("migrate without DATABASE_URL reports missing",
    missing && missing.missing === true && missing.applied.length === 0 && missing.skipped.length === 0);

  return { pass: pass, fail: fail };
}

module.exports = main();
