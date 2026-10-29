/* Load public/data.js into activities. Idempotent.

   Content upsert never touches address, location, coords_locked, or geo_*.
   Coordinates come only from data/coords/*.json (optional). A curated id that
   disappears from the ideas file is archived, not deleted, and comes back to
   approved if the id returns. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { Pool } = require("pg");
const filters = require("../shared/filters");
const { poolConfig } = require("./index");
const coords = require("./coords");

const DEFAULT_IDEAS = path.join(__dirname, "..", "public", "data.js");
const DEFAULT_COORDS = path.join(__dirname, "..", "data", "coords");
const BATCH = 500;

const INSERT_COLS = [
  "id", "title", "description", "category", "icon", "setting", "season", "food",
  "cost", "duration", "time", "vibe", "stage", "date_type", "scene", "motif", "affiliate_url"
];

function loadIdeas(file) {
  const src = fs.readFileSync(file, "utf8");
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src + "\nglobalThis.__IDEAS_DATA = IDEAS_DATA;", sandbox, { filename: file });
  if (!Array.isArray(sandbox.__IDEAS_DATA)) {
    throw new Error("IDEAS_DATA missing in " + file);
  }
  return sandbox.__IDEAS_DATA;
}

function validateIdeas(ideas) {
  const bad = [];
  ideas.forEach(idea => {
    const problems = [];
    if (!Number.isInteger(idea.id)) problems.push("id");
    if (typeof idea.title !== "string" || !idea.title.trim()) problems.push("title");
    if (typeof idea.description !== "string") problems.push("description");
    if (typeof idea.category !== "string" || filters.category.indexOf(idea.category) === -1) problems.push("category");
    if (typeof idea.icon !== "string") problems.push("icon");
    if (filters.setting.indexOf(idea.setting) === -1) problems.push("setting");
    if (filters.cost.indexOf(idea.cost) === -1) problems.push("cost");
    if (filters.duration.indexOf(idea.duration) === -1) problems.push("duration");
    ["season", "time", "vibe", "stage", "dateType"].forEach(key => {
      const values = idea[key];
      if (!Array.isArray(values) || values.some(value => filters[key].indexOf(value) === -1)) problems.push(key);
    });
    if (typeof idea.food !== "boolean") problems.push("food");
    if (problems.length) bad.push(String(idea.id) + " (" + problems.join(", ") + ")");
  });
  if (bad.length) {
    const err = new Error(
      "seed validation failed for " + bad.length + " idea(s): " + bad.slice(0, 40).join("; ")
    );
    err.code = "invalid_ideas";
    err.badIds = bad;
    throw err;
  }
}

function ideaValues(idea) {
  return [
    idea.id,
    idea.title,
    idea.description,
    idea.category,
    idea.icon,
    idea.setting,
    idea.season,
    idea.food,
    idea.cost,
    idea.duration,
    idea.time,
    idea.vibe,
    idea.stage,
    idea.dateType,
    idea.scene == null ? null : idea.scene,
    idea.motif == null ? null : idea.motif,
    null
  ];
}

async function upsertBatch(client, batch) {
  const values = [];
  const tuples = batch.map((idea, index) => {
    const placeholders = INSERT_COLS.map((_, col) => "$" + (index * INSERT_COLS.length + col + 1));
    ideaValues(idea).forEach(value => values.push(value));
    return "(" + placeholders.join(", ") + ", 'approved', 'curated', 'free', now(), NULL)";
  });
  const updateCols = [
    "title", "description", "category", "icon", "setting", "season", "food", "cost",
    "duration", "time", "vibe", "stage", "date_type", "scene", "motif"
  ];
  const assignments = updateCols.map(col => col + " = EXCLUDED." + col).concat([
    "affiliate_url = NULL",
    "status = 'approved'",
    "source = 'curated'",
    "tier = 'free'",
    "approved_at = now()",
    "retired_at = NULL",
    "updated_at = now()"
  ]);
  const sql = "insert into activities (" +
    INSERT_COLS.join(", ") + ", status, source, tier, approved_at, retired_at) values " +
    tuples.join(", ") +
    " on conflict (id) do update set " + assignments.join(", ");
  await client.query(sql, values);
}

async function seed(opts) {
  opts = opts || {};
  const connectionString = opts.connectionString || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    return { missing: true };
  }
  const ideasFile = opts.ideasFile || process.env.SPARK_IDEAS_FILE || DEFAULT_IDEAS;
  const coordsDir = opts.coordsDir || process.env.SPARK_COORDS_DIR || DEFAULT_COORDS;
  const ideas = loadIdeas(ideasFile);
  validateIdeas(ideas);
  if (!ideas.length) throw new Error("IDEAS_DATA is empty; refusing to retire every curated row");

  const knownIds = new Set(ideas.map(idea => idea.id));
  const loadedCoords = coords.loadCoordsFromDir(coordsDir, { knownIds: knownIds });

  const own = !opts.pool;
  const pool = opts.pool || new Pool(poolConfig(connectionString));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < ideas.length; i += BATCH) {
      await upsertBatch(client, ideas.slice(i, i + BATCH));
    }
    const ids = ideas.map(idea => idea.id);
    const retired = await client.query(
      "update activities set status = 'archived', retired_at = now() " +
      "where source = 'curated' and status = 'approved' and id <> all($1::int[]) " +
      "returning id",
      [ids]
    );
    await client.query(
      "select setval(pg_get_serial_sequence('activities','id'), " +
      "greatest((select max(id) from activities), 99999))"
    );
    let coordCounts = null;
    if (loadedCoords.missing || !loadedCoords.files.length) {
      console.log("no coords files, skipping");
    } else {
      loadedCoords.warnings.forEach(warning => {
        console.warn(
          "coords warning:",
          warning.reason,
          warning.id != null ? warning.id : "",
          warning.detail || ""
        );
      });
      coordCounts = await coords.applyCoords(loadedCoords.entries, client);
      console.log(coords.formatCounts(coordCounts));
    }
    await client.query("COMMIT");
    console.log("seeded " + ideas.length + " activities");
    console.log("retired " + retired.rowCount);
    return {
      seeded: ideas.length,
      retired: retired.rowCount,
      coords: coordCounts,
      ids: knownIds
    };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (e) { /* already aborted */ }
    throw err;
  } finally {
    client.release();
    if (own) await pool.end();
  }
}

if (require.main === module) {
  seed().then(result => {
    if (result && result.missing) process.exit(1);
  }).catch(err => {
    if (err && err.code === "invalid_ideas") console.error(err.message);
    else if (err && err.code === "invalid_coords") console.error(err.message);
    else console.error("seed failed:", err.code || "error");
    process.exit(1);
  });
}

module.exports = { seed, loadIdeas, validateIdeas, DEFAULT_IDEAS, DEFAULT_COORDS };
