/* Five time-window buttons. Legacy tags and dated start hours.
   The client and the server predicate pick the same rows.
   Read-only, except a temp table when TEST_DATABASE_URL is set. */
"use strict";

const { Pool } = require("pg");
const tw = require("../public/time-windows");
const filters = require("../shared/filters");
const { buildListQuery } = require("../db/activities-repo");
const { validateSubmission } = require("../lib/submission");
const { poolConfig } = require("../db");
const { loadApp } = require("./harness");

let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) { pass++; console.log("  \x1b[32mPASS\x1b[0m " + name); }
  else { fail++; console.log("  \x1b[31mFAIL\x1b[0m " + name + (info ? "  (" + info + ")" : "")); }
}

const EN = tw.EN_DASH;
const BUTTONS = ["morning", "midday", "afternoon", "evening", "late_night"];
const LABELS = [
  "Morning 6" + EN + "10 AM",
  "Midday 10 AM" + EN + "2 PM",
  "Afternoon 2" + EN + "5 PM",
  "Evening 5" + EN + "9 PM",
  "Late Night 9 PM" + EN + "1 AM"
];
const LEGACY = ["Morning", "Afternoon", "Evening", "Night"];

function buttonsFor(row) {
  return BUTTONS.filter(function (id) { return tw.timeMatches(row, [id]); });
}

// The server query's two branches, using the same hour table and stored-tag
// expansion the SQL is generated from. Dated starts ignore tags.
function serverPicks(row, selected) {
  const resolved = tw.selectionFromQuery(selected);
  if (resolved.invalid || !resolved.windows.length) return false;
  const hours = startHours(row && row.occurrences);
  if (hours) {
    return hours.some(function (hour) {
      const id = tw.windowForHour(hour);
      return !!id && resolved.windows.indexOf(id) !== -1;
    });
  }
  const stored = tw.storedValuesForWindows(resolved.windows);
  const tags = row && Array.isArray(row.time) ? row.time : [];
  return tags.some(function (tag) { return stored.indexOf(tag) !== -1; });
}

function startHours(occurrences) {
  if (!occurrences || occurrences.kind !== "dates" || !Array.isArray(occurrences.dates)) return null;
  const hours = [];
  for (let i = 0; i < occurrences.dates.length; i++) {
    const entry = occurrences.dates[i];
    if (!entry || typeof entry.start !== "string") continue;
    const hour = tw.parseStartHour(entry.start);
    if (hour == null) continue;
    hours.push(hour);
  }
  return hours.length ? hours : null;
}

function sameButtons(row, selected) {
  return BUTTONS.every(function (id) {
    const query = selected || [id];
    return tw.timeMatches(row, query) === serverPicks(row, query);
  });
}

function dates(starts) {
  return {
    kind: "dates",
    dates: starts.map(function (start, i) {
      return { date: "2027-06-" + (10 + i), start: start };
    })
  };
}

check("buttons are the five windows in order", tw.TIME_WINDOWS.join("|") === BUTTONS.join("|"));
check("server filter list is those slugs", filters.time.slice().join("|") === BUTTONS.join("|"));
check("labels are the word, an en dash, and the hours",
  BUTTONS.map(tw.displayLabel).join("|") === LABELS.join("|") &&
  LABELS.join("").indexOf("-") === -1 &&
  LABELS[0].indexOf(EN) !== -1);

BUTTONS.forEach(function (id, i) {
  const parts = tw.displayParts(id);
  check(id + " splits into a word and hours",
    !!parts && parts.word + " " + parts.hours === LABELS[i] &&
    parts.hours.indexOf(EN) !== -1 && parts.word.indexOf(EN) === -1);
});

const hourWindow = {};
tw.WINDOWS.forEach(function (w) {
  w.hours24.forEach(function (hour) { hourWindow[hour] = w.id; });
});
for (let hour = 0; hour <= 23; hour++) {
  const expected = Object.prototype.hasOwnProperty.call(hourWindow, hour) ? hourWindow[hour] : null;
  check("hour " + hour + " is " + (expected || "uncovered"), tw.windowForHour(hour) === expected);
}
check("1 AM through 5 AM are uncovered",
  [1, 2, 3, 4, 5].every(function (hour) { return tw.windowForHour(hour) == null; }));

const legacyExpect = {
  Morning: ["morning", "midday"],
  Afternoon: ["midday", "afternoon"],
  Evening: ["evening"],
  Night: ["late_night"]
};
LEGACY.forEach(function (tag) {
  const got = buttonsFor({ time: [tag] });
  check(tag + " matches " + legacyExpect[tag].join(" and "),
    got.join("|") === legacyExpect[tag].join("|"), got.join(","));
  check(tag + " is still a stored value", filters.time.indexOf(tag) !== -1);
});
BUTTONS.forEach(function (id) {
  const got = buttonsFor({ time: [id] });
  check("stored " + id + " matches only itself", got.join("|") === id, got.join(","));
  check(id + " is a stored value", filters.time.indexOf(id) !== -1);
});
check("a plain slice does not treat Morning as a new button",
  filters.time.slice().indexOf("Morning") === -1 && filters.time.slice().indexOf("morning") === 0);
check("Dusk is not a stored time", filters.time.indexOf("Dusk") === -1);

const combos = [];
for (let mask = 1; mask < 16; mask++) {
  combos.push(LEGACY.filter(function (_, i) { return mask & (1 << i); }));
}
check("every non-empty legacy combination is covered", combos.length === 15);
combos.forEach(function (tags) {
  const row = { id: tags.join("+"), time: tags };
  const got = buttonsFor(row);
  check(tags.join("+") + " lands under at least one button", got.length > 0, got.join(","));
  check(tags.join("+") + " client and server pick the same buttons",
    got.join("|") === BUTTONS.filter(function (id) { return serverPicks(row, [id]); }).join("|") &&
    sameButtons(row, null),
    got.join(","));
});

const rows = [
  { id: "tags-morning", time: ["Morning"], expect: ["morning", "midday"] },
  { id: "tags-afternoon-evening", time: ["Afternoon", "Evening"], expect: ["midday", "afternoon", "evening"] },
  { id: "tags-all", time: LEGACY.slice(), expect: BUTTONS.slice() },
  { id: "tags-empty", time: [], expect: [] },
  { id: "slug-mix", time: ["morning", "evening"], expect: ["morning", "evening"] },
  { id: "slug-and-legacy", time: ["Night", "midday"], expect: ["midday", "late_night"] },
  { id: "show-7pm", time: ["Morning"], occurrences: dates(["19:00"]), expect: ["evening"] },
  { id: "show-2pm-and-9pm", time: ["Evening"], occurrences: dates(["14:00", "21:30"]), expect: ["afternoon", "late_night"] },
  { id: "show-midnight", time: ["Morning"], occurrences: dates(["00:15"]), expect: ["late_night"] },
  { id: "show-659", time: ["Evening"], occurrences: dates(["06:59"]), expect: ["morning"] },
  { id: "show-1000", time: ["Night"], occurrences: dates(["10:00"]), expect: ["midday"] },
  { id: "show-1359", time: ["Night"], occurrences: dates(["13:59"]), expect: ["midday"] },
  { id: "show-1400", time: ["Morning"], occurrences: dates(["14:00"]), expect: ["afternoon"] },
  { id: "show-1659", time: ["Morning"], occurrences: dates(["16:59"]), expect: ["afternoon"] },
  { id: "show-1700", time: ["Morning"], occurrences: dates(["17:00"]), expect: ["evening"] },
  { id: "show-2059", time: ["Morning"], occurrences: dates(["20:59"]), expect: ["evening"] },
  { id: "show-2100", time: ["Morning"], occurrences: dates(["21:00"]), expect: ["late_night"] },
  { id: "show-gap", time: ["Morning", "Evening"], occurrences: dates(["01:00", "05:59"]), expect: [] },
  { id: "show-gap-and-noon", time: ["Night"], occurrences: dates(["03:00", "12:00"]), expect: ["midday"] },
  { id: "dated-no-start", time: ["Afternoon"], occurrences: { kind: "dates", dates: [{ date: "2027-06-10" }] }, expect: ["midday", "afternoon"] },
  { id: "weekly", time: ["Evening", "Night"], occurrences: { kind: "weekly", start: "2027-06-01", weekdays: ["Fri"], start_time: "14:00" }, expect: ["evening", "late_night"] },
  { id: "anytime", time: ["Night"], occurrences: null, expect: ["late_night"] }
];

rows.forEach(function (row) {
  const got = buttonsFor(row);
  check(row.id + " windows", got.join("|") === row.expect.join("|"), got.join(","));
  BUTTONS.forEach(function (id) {
    const client = tw.timeMatches(row, [id]);
    const server = serverPicks(row, [id]);
    check(row.id + " client and server agree on " + id, client === server && client === (row.expect.indexOf(id) !== -1));
  });
  LEGACY.forEach(function (tag) {
    check(row.id + " agrees on old query " + tag,
      tw.timeMatches(row, [tag]) === serverPicks(row, [tag]));
  });
});

check("no button selected matches a row", tw.timeMatches({ time: ["Night"] }, []) === true);
check("an unknown filter matches nothing", tw.timeMatches({ time: ["Night"] }, ["Dusk"]) === false);

const migrated = tw.migrateFilterSelection(["Morning", "Night"]);
check("a saved Morning and Night become morning, midday, and late night",
  migrated.changed === true && migrated.values.join("|") === "morning|midday|late_night",
  migrated.values.join(","));
check("Afternoon and Evening expand without a duplicate midday",
  tw.migrateFilterSelection(["Afternoon", "Evening"]).values.join("|") === "midday|afternoon|evening");
const kept = tw.migrateFilterSelection(["evening", "late_night"]);
check("new slugs are not rewritten", kept.changed === false && kept.values.join("|") === "evening|late_night");
check("an empty save stays empty", tw.migrateFilterSelection([]).changed === false);

function queryArrays(params) {
  const q = buildListQuery(params);
  return { q: q, arrays: q.values.filter(function (value) { return Array.isArray(value); }) };
}
const morning = queryArrays({ time: "Morning" });
check("?time=Morning is the Morning and Midday windows",
  morning.arrays.length >= 2 && morning.arrays[0].join("|") === "morning|midday",
  JSON.stringify(morning.arrays[0]));
check("?time=Morning overlaps Morning, not Evening or Night",
  morning.arrays[1].indexOf("Morning") !== -1 &&
  morning.arrays[1].indexOf("Afternoon") !== -1 &&
  morning.arrays[1].indexOf("morning") !== -1 &&
  morning.arrays[1].indexOf("midday") !== -1 &&
  morning.arrays[1].indexOf("Evening") === -1 &&
  morning.arrays[1].indexOf("Night") === -1,
  JSON.stringify(morning.arrays[1]));
const onlyMorning = queryArrays({ time: "morning" });
check("?time=morning is only the Morning window",
  onlyMorning.arrays[0].join("|") === "morning" &&
  onlyMorning.arrays[1].indexOf("Morning") !== -1 &&
  onlyMorning.arrays[1].indexOf("Afternoon") === -1,
  JSON.stringify(onlyMorning.arrays));
const night = queryArrays({ time: "Night,Evening" });
check("?time=Night,Evening is Late Night and Evening",
  night.arrays[0].join("|") === "evening|late_night" &&
  night.arrays[1].indexOf("Night") !== -1 &&
  night.arrays[1].indexOf("Evening") !== -1 &&
  night.arrays[1].indexOf("Morning") === -1);
check("the time predicate matches dated starts or stored tags",
  morning.q.text.indexOf("time && ") !== -1 &&
  morning.q.text.indexOf("occurrences->>'kind' = 'dates'") !== -1 &&
  morning.q.text.indexOf("Evening") === -1);
tw.WINDOWS.forEach(function (w) {
  const clause = "WHEN h IN (" + w.hours24.join(", ") + ") THEN '" + w.id + "'";
  check("SQL hour list for " + w.id + " matches the button", morning.q.text.indexOf(clause) !== -1, clause);
});

function throwsTime(value) {
  try {
    buildListQuery({ time: value });
    return false;
  } catch (err) {
    return err.code === "invalid_filter" && err.field === "time";
  }
}
check("?time=Night is accepted", throwsTime("Night") === false);
check("?time=late_night is accepted", throwsTime("late_night") === false);
check("?time=Dusk is rejected", throwsTime("Dusk") === true);
check("?time=Late Night is rejected", throwsTime("Late Night") === true);
check("a legacy name mixed with junk is rejected", throwsTime("Morning,Nope") === true);

const shifted = buildListQuery({ cost: "Free", time: "evening" });
check("time parameters follow the cost parameter",
  shifted.text.indexOf("cost = ANY($1::text[])") !== -1 &&
  shifted.text.indexOf("= ANY($2::text[])") !== -1 &&
  shifted.text.indexOf("time && $3::text[]") !== -1);

function submission(time) {
  return validateSubmission({
    email: "Person@Example.com",
    ageConfirmed: true,
    title: "Sunset picnic",
    description: "Pack a blanket and watch the sky fade over the river.",
    category: "Picnics & Parks",
    setting: "Outdoor",
    cost: "Free",
    duration: "Short (1-2 hrs)",
    time: time,
    age21: false
  }, { cookie: "spark_age_ok=1" });
}
const newTime = submission(["late_night", "evening"]);
check("a submission can store the new slugs",
  newTime.ok === true && newTime.payload.time.join("|") === "late_night|evening",
  JSON.stringify(newTime.fields || newTime));
const oldTime = submission(["Evening", "Night"]);
check("a submission can still store the legacy tags",
  oldTime.ok === true && oldTime.payload.time.join("|") === "Evening|Night");
const badTime = submission(["Dusk"]);
check("a submission rejects an unknown time",
  badTime.ok === false && badTime.fields.indexOf("time") !== -1);

function walk(node, fn) {
  if (!node) return;
  fn(node);
  const kids = node.children || [];
  for (let i = 0; i < kids.length; i++) walk(kids[i], fn);
}
function textOf(node) {
  if (!node || typeof node !== "object") return "";
  let out = String(node.innerHTML || "");
  const kids = node.children || [];
  for (let i = 0; i < kids.length; i++) out += " " + textOf(kids[i]);
  return out;
}

const app = loadApp({});
const timeDef = app.FILTER_DEFS.filter(function (def) { return def.key === "time"; })[0];
check("the filter options are the five slugs",
  !!timeDef && timeDef.options.join("|") === BUTTONS.join("|") && timeDef.label === "Time of Day");

const body = app.document.createElement("div");
const previousQuery = app.document.querySelector;
app.document.querySelector = function (sel) {
  if (sel === "#filter-body") return body;
  return previousQuery.apply(this, arguments);
};
app.ui.filterDraft = JSON.parse(JSON.stringify(app.state.filters));
app.renderFilterBody();
app.document.querySelector = previousQuery;

let timeChips = [];
walk(body, function (node) {
  const kids = node.children || [];
  if (kids[0] && kids[0].innerHTML === "Time of Day" && kids[1]) timeChips = kids[1].children || [];
});
check("five time buttons", timeChips.length === 5, String(timeChips.length));
timeChips.forEach(function (chip, i) {
  const html = String(chip.innerHTML || "");
  const parts = tw.displayParts(BUTTONS[i]);
  check("button " + (i + 1) + " is " + LABELS[i],
    String(chip.className || "").indexOf("chip-time") !== -1 &&
    html.indexOf("chip-time-word") !== -1 &&
    html.indexOf("chip-time-hours") !== -1 &&
    html.indexOf(parts.word) !== -1 &&
    html.indexOf(parts.hours) !== -1 &&
    chip.getAttribute("data-value") === BUTTONS[i] &&
    chip.getAttribute("aria-label") === LABELS[i],
    html);
});

const idea = app.IDEAS_BY_ID[2];
const savedTime = idea.time;
const savedOcc = idea.occurrences;
check("idea 2 still shows under Morning, Midday, and Afternoon",
  app.matchesFilters(idea, Object.assign({}, app.state.filters, { time: ["morning"] })) === true &&
  app.matchesFilters(idea, Object.assign({}, app.state.filters, { time: ["midday"] })) === true &&
  app.matchesFilters(idea, Object.assign({}, app.state.filters, { time: ["afternoon"] })) === true &&
  app.matchesFilters(idea, Object.assign({}, app.state.filters, { time: ["evening"] })) === false &&
  app.matchesFilters(idea, Object.assign({}, app.state.filters, { time: ["Morning"] })) === true);
const detail = textOf(app.buildDetailScreen(2));
check("a Morning and Afternoon idea prints the three window labels",
  detail.indexOf(LABELS[0]) !== -1 &&
  detail.indexOf(LABELS[1]) !== -1 &&
  detail.indexOf(LABELS[2]) !== -1 &&
  detail.indexOf(LABELS[3]) === -1);
idea.occurrences = dates(["19:00", "10:30"]);
idea.time = ["Morning"];
const placed = textOf(app.buildDetailScreen(2));
check("a dated idea prints the windows of its Denver start times",
  placed.indexOf(LABELS[1]) !== -1 &&
  placed.indexOf(LABELS[3]) !== -1 &&
  placed.indexOf(LABELS[0]) === -1 &&
  app.matchesFilters(idea, Object.assign({}, app.state.filters, { time: ["evening"] })) === true &&
  app.matchesFilters(idea, Object.assign({}, app.state.filters, { time: ["morning"] })) === false);
idea.time = savedTime;
idea.occurrences = savedOcc;

const oldSave = loadApp({
  spark_state_v1: JSON.stringify({
    onboarded: true,
    hasSeenTutorial: true,
    profile: { ageConfirmedAt: "2026-01-01T00:00:00.000Z" },
    filters: { time: ["Afternoon", "Night"] }
  })
});
check("a saved Afternoon and Night filter is translated",
  oldSave.state.filters.time.join("|") === "midday|afternoon|late_night",
  oldSave.state.filters.time.join(","));
const stored = JSON.parse(oldSave.localStorage.getItem("spark_state_v1"));
check("the translated filter is written back",
  stored.filters.time.join("|") === "midday|afternoon|late_night");

const formNode = app.buildIdeaSubmitSubpanel();
const form = textOf(formNode);
const formValues = [];
walk(formNode, function (node) {
  const value = node.getAttribute && node.getAttribute("data-value");
  if (value && String(node.className || "").indexOf("chip-time") !== -1) formValues.push(value);
});
check("the idea form offers the five windows and submits slugs",
  formValues.join("|") === BUTTONS.join("|") &&
  form.indexOf("chip-time-hours") !== -1 &&
  form.indexOf("9 PM" + EN + "1 AM") !== -1 &&
  formValues.indexOf("Morning") === -1,
  formValues.join("|"));

async function sqlAgrees() {
  if (!process.env.TEST_DATABASE_URL) {
    console.log("  SKIP sql row agreement (TEST_DATABASE_URL unset)");
    return;
  }
  const pool = new Pool(Object.assign({}, poolConfig(process.env.TEST_DATABASE_URL), { connectionTimeoutMillis: 8000 }));
  const client = await pool.connect();
  try {
    await client.query(
      "CREATE TEMP TABLE time_window_fixtures (" +
      "id int primary key, time text[] not null default '{}', occurrences jsonb)"
    );
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      await client.query(
        "INSERT INTO time_window_fixtures (id, time, occurrences) VALUES ($1, $2, $3::jsonb)",
        [i + 1, row.time, row.occurrences ? JSON.stringify(row.occurrences) : null]
      );
    }
    const queries = BUTTONS.map(function (id) { return [id]; }).concat(
      [["Morning"], ["Night", "Evening"], ["morning", "midday"]]
    );
    for (let q = 0; q < queries.length; q++) {
      const selected = queries[q];
      const resolved = tw.selectionFromQuery(selected);
      const pred = tw.sqlPredicate(resolved.windows, 1);
      const result = await client.query(
        "SELECT id FROM time_window_fixtures WHERE " + pred.sql + " ORDER BY id",
        pred.values
      );
      const got = result.rows.map(function (row) { return rows[row.id - 1].id; });
      const expected = rows.filter(function (row) { return tw.timeMatches(row, selected); }).map(function (row) { return row.id; });
      check("SQL and the client pick the same rows for " + selected.join("+"),
        got.join("|") === expected.join("|"),
        "sql " + got.join(",") + " client " + expected.join(","));
    }
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = sqlAgrees().then(function () {
  return { pass: pass, fail: fail };
}).catch(function (err) {
  check("sql row agreement", false, err && (err.stack || err.message));
  return { pass: pass, fail: fail };
});
