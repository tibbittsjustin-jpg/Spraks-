/* Server-only Postgres access. The browser never receives DATABASE_URL. */
"use strict";

const { Pool } = require("pg");

let pool = null;

function sslFor(connectionString) {
  if (process.env.PGSSLMODE === "disable") return false;
  let host = "";
  try { host = new URL(connectionString).hostname; } catch (e) { host = ""; }
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
  // TODO(before production): pin Supabase's CA cert (ssl.ca from SUPABASE_CA_CERT / downloaded root cert) and set rejectUnauthorized: true.
  return { rejectUnauthorized: false };
}

/* citext moves to `extensions` in 006. public stays first so unqualified app
   tables still resolve, including 004_materials.sql's text[] column on
   activities. A schema named here that does not exist yet is ignored, so
   001-003 can run on a fresh database before `extensions` is created. */
const SEARCH_PATH = "public,extensions,pg_catalog";

function poolConfig(connectionString) {
  return {
    connectionString: connectionString,
    max: 5,
    ssl: sslFor(connectionString),
    options: "-c search_path=" + SEARCH_PATH
  };
}

function isConfigured() {
  return !!process.env.DATABASE_URL;
}

function getPool() {
  if (!isConfigured()) return null;
  if (!pool) pool = new Pool(poolConfig(process.env.DATABASE_URL));
  return pool;
}

async function closePool() {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}

module.exports = { getPool, closePool, isConfigured, poolConfig, sslFor, SEARCH_PATH };
