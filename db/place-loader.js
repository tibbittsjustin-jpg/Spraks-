/* Load licensed place files into place_staging.

   Dry-run is the default: it plans every row and, when a local database is
   set, rolls the SQL dedupe and pin check back. It never writes production.

   node db/place-loader.js --dir /path/to/json
   node db/place-loader.js --dir /path/to/json --apply
   node db/place-loader.js --promote --dataset ugrc_parks
*/
"use strict";

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { poolConfig } = require("./index");
const { migrate } = require("./migrate");
const rulesLib = require("./place-rules");
const seeds = require("./place-seeds");
const norm = require("./place-normalize");
const pinQa = require("./place-pin-qa");
const dedupeConfig = require("./place-dedupe-config");

const RULES_FILE = path.join(__dirname, "place-rules-017.json");
const GENERIC_TIGHT_M = norm.GENERIC_TIGHT_M;

const CITIES = [
  ["Salt Lake City", 40.7608, -111.8910],
  ["Provo", 40.2338, -111.6585],
  ["Ogden", 41.2230, -111.9738],
  ["Orem", 40.2969, -111.6946],
  ["Sandy", 40.5649, -111.8389],
  ["West Jordan", 40.6097, -111.9391],
  ["West Valley City", 40.6916, -112.0011],
  ["South Jordan", 40.5622, -111.9297],
  ["Lehi", 40.3916, -111.8508],
  ["Draper", 40.5247, -111.8638],
  ["Logan", 41.7370, -111.8338],
  ["St. George", 37.0965, -113.5684],
  ["Moab", 38.5733, -109.5498],
  ["Park City", 40.6461, -111.4980],
  ["Cedar City", 37.6775, -113.0619]
];

function assertLocalDatabase(connectionString) {
  let host = "";
  try { host = new URL(connectionString).hostname; } catch (err) { host = ""; }
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!local || /supabase\.co|amazonaws\.com|render\.com|neon\.tech/i.test(connectionString)) {
    const err = new Error("refusing database host; the place loader only runs on localhost");
    err.code = "refusing_remote_database";
    throw err;
  }
}

function loadRules(file) {
  const list = JSON.parse(fs.readFileSync(file || RULES_FILE, "utf8"));
  return rulesLib.prepareRules(list);
}

function readInputs(dir) {
  const files = fs.readdirSync(dir).filter(name => name.endsWith(".json")).sort();
  const groups = {};
  files.forEach(name => {
    const key = seeds.detectDatasetKey(name);
    if (!key) return;
    const records = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    if (!Array.isArray(records)) return;
    groups[key] = records;
  });
  return groups;
}

function planInputs(groups, rules) {
  const rows = [];
  const blocked = [];
  Object.keys(groups).forEach(key => {
    const dataset = seeds.datasetByKey(key);
    try {
      seeds.assertCanLoad(dataset);
    } catch (err) {
      blocked.push({ datasetKey: key, code: err.code, message: err.message });
      return;
    }
    const planned = norm.normalizeDataset(dataset, groups[key], rules);
    rows.push.apply(rows, planned);
  });
  const fees = norm.inheritTrailheadParkFees(rows, false);
  const pins = pinQa.qaBatch(rows, {
    refs: {
      cities: CITIES.map(city => ({ name: city[0], lat: city[1], lng: city[2] }))
    }
  });
  return {
    rows: rows,
    blocked: blocked,
    feeInheritance: fees,
    pinQa: {
      counts: pins.counts,
      handPinQueue: pins.handPinQueue,
      handPinDeferred: pins.handPinDeferred
    },
    round8Dedupe: dedupeConfig.ROUND8_DEDUPE
  };
}

function tally(rows) {
  const by = {};
  function bucket(key) {
    if (!by[key]) {
      by[key] = {
        rows: 0, excluded: 0, review: 0, liveReady: 0,
        dedupe: { new: 0, merge: 0, review: 0 },
        linkFlags: {}, pinFailures: {}, needsHandPin: 0, needsCity: 0,
        countyAsCity: 0, statusMissing: 0, statusBlank: 0, statusFuture: 0,
        statusDrop: { Future: 0, Proposed: 0, Planned: 0, Closed: 0 },
        genericNames: 0, tagConfidence: {}, costRequested: {}, outOfUtah: 0
      };
    }
    return by[key];
  }
  rows.forEach(row => {
    const slot = bucket(row.datasetKey);
    slot.rows++;
    if (row.excluded) slot.excluded++;
    else if (row.tagReview || row.outOfUtah) slot.review++;
    else slot.liveReady++;
    slot.dedupe[row.dedupeResult || "new"]++;
    slot.linkFlags[row.linkFlag] = (slot.linkFlags[row.linkFlag] || 0) + 1;
    if (row.needsHandPin) slot.needsHandPin++;
    if (row.flags && row.flags.needsCity) slot.needsCity++;
    if (row.flags && row.flags.countyAsCity) slot.countyAsCity++;
    if (row.flags && row.flags.statusMissing) slot.statusMissing++;
    if (row.flags && row.flags.statusBlank) slot.statusBlank++;
    if (row.flags && row.flags.statusFuture) slot.statusFuture++;
    if (row.flags && row.flags.statusDrop && Object.prototype.hasOwnProperty.call(slot.statusDrop, row.flags.statusDrop)) {
      slot.statusDrop[row.flags.statusDrop]++;
    }
    if (row.genericName) slot.genericNames++;
    if (row.outOfUtah) slot.outOfUtah++;
    const conf = row.tagConfidence == null ? "none" : String(row.tagConfidence);
    slot.tagConfidence[conf] = (slot.tagConfidence[conf] || 0) + 1;
    if (row.costRequested) {
      slot.costRequested[row.costRequested] = (slot.costRequested[row.costRequested] || 0) + 1;
    }
    const pin = row.pinCheck || {};
    Object.keys(pin).forEach(name => {
      if (pin[name] === true) slot.pinFailures[name] = (slot.pinFailures[name] || 0) + 1;
    });
  });
  return by;
}

function summarize(planned) {
  return {
    feeInheritance: planned.feeInheritance,
    blocked: planned.blocked,
    datasets: tally(planned.rows),
    ruleColumns: [
      "id", "rule_code", "dataset", "match_field", "match_value", "match_type",
      "filter_values", "confidence_score", "confidence_level", "always_review",
      "priority", "notes"
    ]
  };
}

async function syncCostBandsLive(client, mode) {
  const live = rulesLib.liveCostMode(mode);
  await client.query(
    "insert into place_loader_config (key, value, note) values ('cost_bands_live', to_jsonb($1::text), $2) " +
    "on conflict (key) do update set value = excluded.value",
    [live, "COST_BANDS_LIVE. legacy writes the old activities band. new writes the $20 band."]
  );
  return live;
}

async function assertActivityCostReady(client) {
  const col = await client.query(
    "select 1 from information_schema.columns " +
    "where table_schema = 'public' and table_name = 'activities' and column_name = 'cost_unit'"
  );
  const checks = await client.query(
    "select pg_get_constraintdef(oid) as def from pg_constraint " +
    "where conrelid = 'public.activities'::regclass and contype = 'c'"
  );
  const def = checks.rows.map(row => row.def).join("\n");
  const needed = ["$1-$20", "$21-$40", "$41-$60", "$61-$80", "$81-$100", "Over $100"];
  const missing = needed.filter(band => def.indexOf(band) === -1);
  if (!col.rowCount || missing.length) {
    const err = new Error(
      "migration 018 must add activities.cost_unit and accept the $20-step cost bands before the loader writes" +
      (missing.length ? " (missing " + missing.join(", ") + ")" : " (missing cost_unit)")
    );
    err.code = "migration_018_required";
    throw err;
  }
}

async function seedReference(client, rules) {
  for (const dataset of seeds.DATASETS) {
    await client.query(
      "insert into place_datasets (" +
      "dataset_key, title, owner, license_code, license_url, credit_line, credit_url, " +
      "sources_page_text, disclaimer, user_caution, source_url, legal_ref, cleared_on, " +
      "approval_status, auto_publish, refresh_cadence, license_checked_on, license_info_seen, " +
      "load_enabled, excluded, exclusion_reason, odbl, odbl_approved, priority, " +
      "dedupe_radius_m, centroid_exempt, field_allowlist, nps_pages_only, feature_type" +
      ") values (" +
      "$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29" +
      ") on conflict (dataset_key) do update set " +
      "credit_line = excluded.credit_line, sources_page_text = excluded.sources_page_text, " +
      "disclaimer = excluded.disclaimer, user_caution = excluded.user_caution, " +
      "license_code = excluded.license_code, license_url = excluded.license_url, " +
      "license_info_seen = excluded.license_info_seen, license_checked_on = excluded.license_checked_on, " +
      "field_allowlist = excluded.field_allowlist, excluded = excluded.excluded, " +
      "load_enabled = excluded.load_enabled, odbl = excluded.odbl " +
      "where place_datasets.approval_status = 'pending'",
      [
        dataset.datasetKey, dataset.title, dataset.owner, dataset.licenseCode, dataset.licenseUrl,
        dataset.creditLine, dataset.creditUrl, dataset.sourcesPageText, dataset.disclaimer,
        dataset.userCaution, dataset.sourceUrl, dataset.legalRef, dataset.clearedOn,
        dataset.approvalStatus, dataset.autoPublish, dataset.refreshCadence,
        dataset.licenseCheckedOn, dataset.licenseInfoSeen, dataset.loadEnabled, dataset.excluded,
        dataset.exclusionReason, dataset.odbl, dataset.odblApproved, dataset.priority,
        dataset.dedupeRadiusM, dataset.centroidExempt, dataset.fieldAllowlist,
        dataset.npsPagesOnly, dataset.featureType
      ]
    );
  }
  for (const owner of seeds.FEATURE_OWNERSHIP) {
    await client.query(
      "insert into place_feature_ownership (feature_type, osm_allowed, owner_dataset, notes) " +
      "values ($1,$2,$3,$4) on conflict (feature_type) do update set " +
      "osm_allowed = excluded.osm_allowed, notes = excluded.notes",
      [owner.featureType, owner.osmAllowed, owner.ownerDataset, owner.notes]
    );
  }
  for (const rule of rules) {
    await client.query(
      "insert into place_filter_rules (" +
      "rule_code, dataset, match_field, match_value, match_type, filter_values, " +
      "confidence_score, confidence_level, always_review, priority, notes" +
      ") values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11) " +
      "on conflict (rule_code) do update set " +
      "match_field = excluded.match_field, match_value = excluded.match_value, " +
      "match_type = excluded.match_type, filter_values = excluded.filter_values, " +
      "confidence_score = excluded.confidence_score, confidence_level = excluded.confidence_level, " +
      "always_review = excluded.always_review, priority = excluded.priority, notes = excluded.notes",
      [
        rule.ruleCode, rule.dataset, rule.matchField, rule.matchValue, rule.matchType,
        JSON.stringify(rule.filterValues), rule.confidenceScore, rule.confidenceLevel,
        rule.alwaysReview, rule.priority, rule.notes
      ]
    );
  }
  for (const city of CITIES) {
    await client.query(
      "insert into place_city_centroids (name, geom) values ($1, ST_MakePoint($3, $2)::geography) " +
      "on conflict (name) do nothing",
      city
    );
  }
}

async function insertRows(client, rows, batchIds) {
  const sql =
    "insert into place_staging (" +
    "dataset_key, source_record_id, feature_type, odbl, raw, title, source_name, description, " +
    "category, setting, season, food, cost, cost_unit, cost_requested, duration, time_of_day, " +
    "vibe, stage, date_type, age21, address, city, source_url, source_credit, occurrences, " +
    "occurrences_flag, mapped_filters, tag_confidence, confidence_by_field, tag_review, actions, " +
    "name_key, dedupe_radius_m, generic_name, same_name_keep_both, geom, needs_hand_pin, needs_city, " +
    "county_as_city, out_of_utah, link, link_flag, status, flags, approval_batch_id, " +
    "hours, entrance_fee, fee_display, fee_url, fee_as_of, notice, vehicle_fee, more_info_url, " +
    "source_activity, source_season, open_status, fee_fact, source_activities, reservable, " +
    "cost_band_new" +
    ") values (" +
    "$1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11::text[],$12,$13,$14,$15,$16,$17::text[]," +
    "$18::text[],$19::text[],$20::text[],$21,$22,$23,$24,$25,$26::jsonb,$27,$28::jsonb,$29,$30::jsonb," +
    "$31,$32::text[],$33,$34,$35,$36," +
    "case when $37::float8 is null then null else ST_SetSRID(ST_MakePoint($38,$37),4326)::geography end," +
    "$39,$40,$41,$42,$43,$44,$45,$46::jsonb,$47," +
    "$48,$49,$50,$51,$52,$53,$54,$55,$56,$57,$58,$59,$60,$61,$62" +
    ") on conflict (dataset_key, source_record_id) do update set " +
    "title = excluded.title, source_credit = excluded.source_credit, tag_review = excluded.tag_review, " +
    "status = excluded.status, flags = excluded.flags, city = excluded.city, " +
    "needs_city = excluded.needs_city, county_as_city = excluded.county_as_city, " +
    "cost = excluded.cost, cost_unit = excluded.cost_unit, cost_band_new = excluded.cost_band_new, geom = excluded.geom, " +
    "hours = excluded.hours, entrance_fee = excluded.entrance_fee, vehicle_fee = excluded.vehicle_fee";
  for (const row of rows) {
    await client.query(sql, [
      row.datasetKey, row.sourceRecordId, row.featureType, row.odbl, JSON.stringify(row.raw),
      row.title, row.sourceName, row.description, row.category, row.setting, row.season, row.food,
      row.cost, row.costUnit, row.costRequested, row.duration, row.time, row.vibe, row.stage,
      row.dateType, row.age21, row.address, row.city, row.sourceUrl, row.sourceCredit, null,
      row.occurrencesFlag, JSON.stringify(row.mappedFilters), row.tagConfidence,
      JSON.stringify(row.confidenceByField), row.tagReview, row.actions, row.nameKey,
      row.dedupeRadiusM, row.genericName, row.sameNameKeepBoth, row.lat, row.lng,
      row.needsHandPin, !!(row.flags && row.flags.needsCity),
      !!(row.flags && row.flags.countyAsCity), row.outOfUtah, row.link, row.linkFlag,
      row.status, JSON.stringify(row.flags), batchIds[row.datasetKey],
      row.hours, row.entranceFee, row.feeDisplay, row.feeUrl, row.feeAsOf, row.notice,
      row.vehicleFee, row.moreInfoUrl, row.sourceActivity, row.sourceSeason,
      row.openStatus, row.feeFact, row.sourceActivities, row.reservable, row.costBandNew
    ]);
  }
}

async function applySql(client, rows, rules) {
  await seedReference(client, rules);
  const batchIds = {};
  const datasets = [...new Set(rows.map(row => row.datasetKey))];
  for (const key of datasets) {
    const id = (await client.query("select gen_random_uuid() as id")).rows[0].id;
    await client.query(
      "insert into place_approval_batches (id, dataset_key, row_count) values ($1,$2,$3)",
      [id, key, rows.filter(row => row.datasetKey === key).length]
    );
    batchIds[key] = id;
  }
  await insertRows(client, rows, batchIds);
  for (const id of Object.values(batchIds)) {
    await client.query("select place_staging_dedupe($1)", [id]);
    await client.query("select place_staging_pin_check($1)", [id]);
  }
  const result = await client.query(
    "select dataset_key, source_record_id, dedupe_result, match_score, needs_hand_pin, " +
    "out_of_utah, tag_review, pin_check from place_staging"
  );
  const byId = {};
  result.rows.forEach(row => { byId[row.dataset_key + "\t" + row.source_record_id] = row; });
  rows.forEach(row => {
    const sqlRow = byId[row.datasetKey + "\t" + row.sourceRecordId];
    if (!sqlRow) return;
    row.dedupeResult = sqlRow.dedupe_result;
    row.matchScore = sqlRow.match_score;
    row.needsHandPin = sqlRow.needs_hand_pin;
    row.outOfUtah = sqlRow.out_of_utah;
    row.tagReview = sqlRow.tag_review;
    row.pinCheck = sqlRow.pin_check;
  });
  return batchIds;
}

async function run(options) {
  options = options || {};
  const rules = options.rules || loadRules(options.rulesFile);
  const groups = options.groups || readInputs(options.dir);
  const planned = planInputs(groups, rules);
  const connectionString = options.connectionString || process.env.PLACE_DATABASE_URL || process.env.TEST_DATABASE_URL;
  let sql = false;
  if (connectionString && options.skipSql !== true) {
    assertLocalDatabase(connectionString);
    const pool = new Pool(poolConfig(connectionString));
    const client = await pool.connect();
    try {
      await migrate({ client: client, connectionString: connectionString });
      if (options.apply || options.promote) await assertActivityCostReady(client);
      await client.query("BEGIN");
      await syncCostBandsLive(client);
      await applySql(client, planned.rows, rules);
      sql = true;
      if (options.apply) await client.query("COMMIT");
      else await client.query("ROLLBACK");
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch (e) { /* already closed */ }
      throw err;
    } finally {
      client.release();
      await pool.end();
    }
  }
  const report = summarize(planned);
  report.sql = sql;
  report.applied = options.apply === true && sql;
  return report;
}

function parseArgs(argv) {
  const args = { apply: false, promote: false, dir: null, dataset: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--promote") args.promote = true;
    else if (arg === "--dir") args.dir = argv[++i];
    else if (arg === "--dataset") args.dataset = argv[++i];
    else if (arg === "--approve-dataset") args.approve = argv[++i];
  }
  return args;
}

async function main(argv) {
  const args = parseArgs(argv);
  if (!args.dir) {
    console.error("Pass --dir with the place JSON files. Dry-run is the default.");
    process.exit(1);
  }
  const report = await run({ dir: args.dir, apply: args.apply });
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(err => {
    console.error(err.code || "error", err.message);
    process.exit(1);
  });
}

module.exports = {
  assertLocalDatabase: assertLocalDatabase,
  loadRules: loadRules,
  planInputs: planInputs,
  summarize: summarize,
  run: run,
  assertActivityCostReady: assertActivityCostReady,
  syncCostBandsLive: syncCostBandsLive,
  GENERIC_TIGHT_M: GENERIC_TIGHT_M
};
