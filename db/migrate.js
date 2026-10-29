/* Apply db/migrations/*.sql in filename order. Each file is one transaction.
   Applied names are recorded in schema_migrations so a second run is a no-op. */
"use strict";

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { poolConfig } = require("./index");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function migrate(opts) {
  opts = opts || {};
  const connectionString = opts.connectionString || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    return { applied: [], skipped: [], missing: true };
  }
  const own = !opts.pool;
  const pool = opts.pool || new Pool(poolConfig(connectionString));
  const client = await pool.connect();
  const applied = [];
  const skipped = [];
  try {
    await client.query(
      "create table if not exists schema_migrations (" +
      "filename text primary key, applied_at timestamptz not null default now())"
    );
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort();
    for (const file of files) {
      const seen = await client.query("select 1 from schema_migrations where filename = $1", [file]);
      if (seen.rowCount) {
        skipped.push(file);
        console.log("skip " + file);
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
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
    client.release();
    if (own) await pool.end();
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

module.exports = { migrate };
