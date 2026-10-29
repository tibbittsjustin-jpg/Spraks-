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

function poolConfig(connectionString) {
  return {
    connectionString: connectionString,
    max: 5,
    ssl: sslFor(connectionString)
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

module.exports = { getPool, closePool, isConfigured, poolConfig, sslFor };
