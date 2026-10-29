/* Apply db/migrations/*.sql in filename order. Each file is one transaction.

   Applied names are recorded in schema_migrations so a second run is a no-op.
   A file is also treated as applied when supabase_migrations.schema_migrations
   exists and its name column matches the filename or the filename without
   ".sql" (Supabase records "001_init", not "001_init.sql"). Those rows are
   not copied into schema_migrations; only migrations this runner applies are
   inserted there.

   Numbers do not have to be contiguous. 005 may be absent; 006 still runs
   when its turn in filename order arrives. */
"use strict";

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { poolConfig } = require("./index");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

const SUPABASE_TABLE_SQL =
  "select 1 as ok from information_schema.tables " +
  "where table_schema = 'supabase_migrations' and table_name = 'schema_migrations'";

const SUPABASE_NAMES_SQL =
  "select name from supabase_migrations.schema_migrations";

function migrationStem(filename) {
  return filename.replace(/\.sql$/i, "");
}

function supabaseHas(names, filename) {
  if (!names) return false;
  return names.has(filename) || names.has(migrationStem(filename));
}

async function loadSupabaseNames(client) {
  const found = await client.query(SUPABASE_TABLE_SQL);
  if (!found.rowCount) return null;
  const rows = await client.query(SUPABASE_NAMES_SQL);
  const names = new Set();
  rows.rows.forEach(row => {
    if (row.name != null && String(row.name).trim()) names.add(String(row.name).trim());
  });
  return names;
}

async function migrate(opts) {
  opts = opts || {};
  const connectionString = opts.connectionString || process.env.DATABASE_URL;
  const migrationsDir = opts.migrationsDir || MIGRATIONS_DIR;
  if (!connectionString && !opts.pool && !opts.client) {
    console.error("DATABASE_URL is not set");
    return { applied: [], skipped: [], missing: true };
  }
  const ownPool = !opts.pool && !opts.client;
  const pool = opts.client ? null : (opts.pool || new Pool(poolConfig(connectionString)));
  const client = opts.client || await pool.connect();
  const applied = [];
  const skipped = [];
  try {
    await client.query(
      "create table if not exists schema_migrations (" +
      "filename text primary key, applied_at timestamptz not null default now())"
    );
    const supabaseNames = await loadSupabaseNames(client);
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
    for (const file of files) {
      const seen = await client.query(
        "select 1 from schema_migrations where filename = $1",
        [file]
      );
      if (seen.rowCount || supabaseHas(supabaseNames, file)) {
        skipped.push(file);
        console.log("skip " + file);
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (filename) values ($1)", [file]);
        await client.query("COMMIT");
        applied.push(file);
        console.log("applied " + file);
      } catch (err) {
        try { await client.query("ROLLBACK"); } catch (e) { /* already aborted */ }
        throw err;
      }
    }
  } finally {
    if (!opts.client) client.release();
    if (ownPool) await pool.end();
  }
  return { applied, skipped };
}

if (require.main === module) {
  migrate().then(result => {
    if (result && result.missing) process.exit(1);
  }).catch(err => {
    console.error("migrate failed:", err.code || "error");
    process.exit(1);
  });
}

module.exports = { migrate, migrationStem, supabaseHas };
