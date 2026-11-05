/* Audience chips, OR matching, 21+ exclusion, untagged fallback, stale filters. */
"use strict";

const fs = require("fs");
const path = require("path");
const audience = require("../public/audience");
const filters = require("../shared/filters");
const { validateSubmission } = require("../lib/submission");
const submit = require("../public/submit");
const { buildListQuery, mapRow, listActivities } = require("../db/activities-repo");
const { loadApp } = require("./harness");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
function section(title, fn) {
  console.log("\n" + title);
  try {
    const result = fn();
    if (result && typeof result.then === "function") return result;
  } catch (e) {
    check("section ran without throwing", false, String(e.stack || e.message).slice(0, 500));
  }
  return Promise.resolve();
}

const HELP = "For adults 18+. Means the activity works when you bring kids, not that Jaderoo is for children.";

function throwsFilter(params, field) {
  try {
    buildListQuery(params);
    return false;
  } catch (err) {
    return err.code === "invalid_filter" && err.field === field;
  }
}

function idea(extra) {
  return Object.assign({
    title: "Walk",
    description: "A short walk.",
    age21: false,
    setting: "Outdoor",
    food: false,
    cost: "Free",
    duration: "Short (1-2 hrs)",
    time: [],
    vibe: [],
    season: []
  }, extra || {});
}

section("vocabulary", () => {
  check("five chips in product order",
    audience.AUDIENCE.join("|") === "Family Friendly|Friends|Date|Group Date|Solo");
  check("filters.js uses that same list", filters.audience.join("|") === audience.AUDIENCE.join("|"));
  check("help line is the approved sentence", audience.FAMILY_HELP === HELP);
  check("Good with kids canonicalizes to Family Friendly",
    audience.canonicalStored(["Good with kids", "Solo"]).join("|") === "Family Friendly|Solo");
  check("Solo/Couple is not Solo",
    audience.canonicalStored(["Solo/Couple"]).join("|") === "" &&
    audience.normalizeFilterSelection(["Solo/Couple", "Double Date"]).length === 0);
  check("stage values are not audience",
    audience.normalizeFilterSelection(["First Date", "Date"]).join("|") === "Date");
});

section("OR match, 21+, and untagged fallback", () => {
  const untagged = idea({});
  const empty = idea({ audience: [] });
  const absent = idea({ audience: null });
  check("a missing audience matches Friends and Date",
    audience.effectiveAudience(untagged).join("|") === "Friends|Date" &&
    audience.effectiveAudience(empty).join("|") === "Friends|Date" &&
    audience.effectiveAudience(absent).join("|") === "Friends|Date");
  check("untagged does not match Family Friendly, Group Date, or Solo",
    audience.matchesAudience(untagged, ["Family Friendly"]) === false &&
    audience.matchesAudience(untagged, ["Group Date"]) === false &&
    audience.matchesAudience(untagged, ["Solo"]) === false &&
    audience.matchesAudience(untagged, ["Friends"]) === true &&
    audience.matchesAudience(untagged, ["Date"]) === true);
  check("an empty filter allows every row",
    audience.matchesAudience(idea({ age21: true, audience: ["Family Friendly"] }), []) === true &&
    audience.matchesAudience(untagged, null) === true);

  const onlyFamily = idea({ age21: true, audience: ["Family Friendly"] });
  const both = idea({ age21: true, audience: ["Family Friendly", "Friends"] });
  const legacy = idea({ age21: true, audience: ["Good with kids", "Date"] });
  check("21+ tagged only Family Friendly matches nothing",
    audience.effectiveAudience(onlyFamily).length === 0 &&
    audience.matchesAudience(onlyFamily, ["Family Friendly"]) === false &&
    audience.matchesAudience(onlyFamily, ["Friends"]) === false &&
    audience.matchesAudience(onlyFamily, ["Family Friendly", "Friends"]) === false);
  check("21+ tagged Friends still matches Friends inside an OR",
    audience.matchesAudience(both, ["Friends"]) === true &&
    audience.matchesAudience(both, ["Family Friendly"]) === false &&
    audience.matchesAudience(both, ["Family Friendly", "Friends"]) === true &&
    audience.matchesAudience(both, ["Date"]) === false);
  check("21+ Good with kids is Family Friendly and still excluded",
    audience.matchesAudience(legacy, ["Family Friendly"]) === false &&
    audience.matchesAudience(legacy, ["Date"]) === true &&
    audience.matchesAudience(legacy, ["Family Friendly", "Date"]) === true);
  const ok = idea({ age21: false, audience: ["Family Friendly", "Solo"] });
  check("a non-21 row matches Family Friendly or Solo",
    audience.matchesAudience(ok, ["Family Friendly"]) === true &&
    audience.matchesAudience(ok, ["Solo"]) === true &&
    audience.matchesAudience(ok, ["Friends"]) === false);
  check("stripping Family Friendly does not invent the untagged fallback",
    audience.effectiveAudience(onlyFamily).join("|") === "");
  check("Solo on a couple-shaped dateType is not implied",
    audience.matchesAudience(idea({ dateType: ["Solo/Couple"], audience: ["Date"] }), ["Solo"]) === false &&
    audience.matchesAudience(idea({ dateType: ["Solo/Couple"] }), ["Solo"]) === false);
});

section("family candidates are not auto-tagged", () => {
  const zoo = audience.reviewFamilyCandidate({
    title: "Utah's Hogle Zoo",
    description: "Visit the zoo and the playground.",
    age21: false
  });
  check("a zoo visit is not promoted", zoo.promote === false && zoo.tag == null && zoo.blocked == null);
  check("age21 blocks Family Friendly",
    audience.blocksFamilyFriendly({ age21: true, title: "Park", description: "Playground" }) === "age21");
  check("alcohol wording blocks Family Friendly",
    audience.blocksFamilyFriendly({ title: "Taproom flight", description: "A cocktail at the brewery." }) === "alcohol");
  check("kids-only wording blocks Family Friendly",
    audience.blocksFamilyFriendly({ title: "Youth recital", description: "Kids only." }) === "kids_only");
  check("unclear text is not given Group Date or Family Friendly",
    audience.effectiveAudience(idea({ title: "Hike to a Rope Swing", description: "Walk the trail." })).join("|") === "Friends|Date");
});

section("saved filters and serialization", () => {
  const storage = {};
  storage.spark_state_v1 = JSON.stringify({
    onboarded: true,
    profile: { name: "Alex", ageConfirmedAt: "2026-01-15T00:00:00.000Z" },
    filters: {
      duration: [], cost: [], time: [], setting: [], vibe: ["Chill"], season: [],
      stage: ["First Date"],
      dateType: ["Solo/Couple", "Group Date"],
      audience: ["Good with kids", "Solo/Couple", "Friends"],
      food: null, hide21: false
    }
  });
  const t = loadApp(storage);
  check("stale stage and date type are dropped",
    t.state.filters.stage == null && t.state.filters.dateType == null);
  check("Good with kids becomes Family Friendly and Solo/Couple is dropped",
    t.state.filters.audience.join("|") === "Family Friendly|Friends");
  check("other saved filters stay", t.state.filters.vibe.join("|") === "Chill" && t.state.filters.hide21 === false);
  const saved = JSON.parse(storage.spark_state_v1);
  check("the rewritten save does not keep stage or dateType",
    saved.filters.stage == null && saved.filters.dateType == null &&
    saved.filters.audience.join("|") === "Family Friendly|Friends");

  const couple = idea({ stage: ["Serious Relationship"], dateType: ["Double Date"], audience: ["Date"] });
  const stale = Object.assign({}, t.state.filters, { vibe: [], audience: [] });
  check("a dropped stage selection does not filter the deck", t.matchesFilters(couple, stale) === true);
  const soloOnly = Object.assign({}, stale, { audience: ["Solo"] });
  check("Solo does not match a Date row or an untagged catalog idea",
    t.matchesFilters(couple, soloOnly) === false &&
    t.matchesFilters(t.IDEAS_BY_ID[2], soloOnly) === false);
  const friends = Object.assign({}, stale, { audience: ["Friends"] });
  check("an untagged catalog idea matches Friends", t.matchesFilters(t.IDEAS_BY_ID[2], friends) === true);
  const family = Object.assign({}, stale, { audience: ["Family Friendly"] });
  check("an untagged catalog idea does not match Family Friendly",
    t.matchesFilters(t.IDEAS_BY_ID[2], family) === false);

  t.state.filters.audience = ["Date", "Group Date"];
  const params = t.remoteFilterParams();
  check("the activities query sends audience and not stage or dateType",
    params.audience === "Date,Group Date" && params.stage == null && params.dateType == null);
  const scope = JSON.parse(t.remoteScopeKey());
  check("the cache scope stores audience and not the old keys",
    scope.audience.join("|") === "Date|Group Date" && scope.stage == null && scope.dateType == null);

  const body = submit.buildSubmissionBody({
    title: "Sunset picnic",
    description: "Pack a blanket and watch the sky.",
    category: "Picnics & Parks",
    audience: ["Friends", "Friends", "Date"],
    stage: ["First Date"],
    age21: false,
    ageConfirmed: true,
    email: "ada@example.com"
  });
  check("submission body keeps audience and can still carry a legacy stage",
    body.audience.join("|") === "Friends|Date" && body.stage.join("|") === "First Date");
});

section("filter sheet chips and help", () => {
  const t = loadApp({});
  const body = t.document.createElement("div");
  const previous = t.document.querySelector;
  t.document.querySelector = function (sel) {
    if (sel === "#filter-body") return body;
    return previous.apply(this, arguments);
  };
  t.ui.filterDraft = JSON.parse(JSON.stringify(t.state.filters));
  t.renderFilterBody();
  t.document.querySelector = previous;

  function walk(node, acc) {
    if (!node || typeof node !== "object") return;
    acc.push(node);
    (node.children || []).forEach(child => walk(child, acc));
  }
  function textOf(node) {
    let out = String(node && node.innerHTML || "");
    (node && node.children || []).forEach(child => { out += " " + textOf(child); });
    return out;
  }
  const nodes = [];
  walk(body, nodes);
  const group = nodes.filter(node => node.getAttribute && node.getAttribute("data-filter") === "audience")[0];
  check("the sheet has one Audience group", !!group);
  const chips = (group && group.children || []).filter(node => String(node.className || "").indexOf("chip-select") !== -1)[0];
  const labels = (chips && chips.children || []).map(node => String(node.innerHTML || "").replace(/<[^>]+>/g, ""));
  check("chips are Family Friendly, then the help, then the other four",
    labels[0] === "Family Friendly" &&
    labels[1] === HELP &&
    labels.slice(2).join("|") === "Friends|Date|Group Date|Solo",
    labels.join(" || "));
  const sheet = textOf(body);
  check("Date Stage and Double or Group Date are gone",
    sheet.indexOf("Date Stage") === -1 && sheet.indexOf("Double or Group Date?") === -1 &&
    sheet.indexOf("First Date") === -1 && sheet.indexOf("Solo/Couple") === -1);
  check("unrelated filters stay on the sheet",
    sheet.indexOf("Budget") !== -1 && sheet.indexOf("Food Involved?") !== -1 &&
    sheet.indexOf("Hide 21+") !== -1 && sheet.indexOf("Where") !== -1 &&
    sheet.indexOf("Local Activities") !== -1 && sheet.indexOf("Time of Day") !== -1);

  const familyChip = chips.children[0];
  check("Family Friendly points at the help",
    familyChip.getAttribute("aria-describedby") === "audience-family-help");
  familyChip._listeners.click[0]();
  check("selecting Family Friendly records that chip",
    t.ui.filterDraft.audience.join("|") === "Family Friendly");
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  check("the page loads audience.js before the app",
    html.indexOf('src="audience.js"') !== -1 && html.indexOf('src="audience.js"') < html.indexOf('src="app.js"'));
});

section("API validation", () => {
  check("an unknown audience value is rejected", throwsFilter({ audience: "Friends'; drop table activities;--" }, "audience"));
  check("Solo/Couple is not an audience query", throwsFilter({ audience: "Solo/Couple" }, "audience"));
  const q = buildListQuery({ audience: "Good with kids,Friends", hide21: "false" });
  check("the alias is bound as Family Friendly",
    q.values.some(value => Array.isArray(value) && value.join("|") === "Family Friendly|Friends"));
  check("Family Friendly is excluded with age21, not by hide21",
    q.text.indexOf("age21 IS NOT TRUE") !== -1 &&
    q.text.indexOf("age21 = false") === -1 &&
    q.text.indexOf("ARRAY['Friends','Date']") !== -1 &&
    q.text.indexOf("'Good with kids'") !== -1);
  check("the chip text is not concatenated into the SQL",
    q.text.indexOf("Good with kids,Friends") === -1);
  const hidden = buildListQuery({ audience: "Family Friendly", hide21: "true" });
  check("hide21 still adds its own predicate beside the audience rule",
    hidden.text.indexOf("age21 = false") !== -1 && hidden.text.indexOf("age21 IS NOT TRUE") !== -1);
  const bare = buildListQuery({});
  check("queries select audience and do not filter it when no chip is chosen",
    bare.text.indexOf(", audience") !== -1 && bare.text.indexOf("cardinality(audience)") === -1);
  const degraded = buildListQuery({ audience: "Solo" }, { audienceColumn: false });
  check("a missing column is not referenced",
    degraded.text.indexOf("audience") === -1 && degraded.values.every(value => value !== "Solo" && !(Array.isArray(value) && value.indexOf("Solo") !== -1)));
  const legacy = buildListQuery({ stage: "First Date", dateType: "Double Date" });
  check("older stage and dateType parameters still overlap",
    legacy.text.indexOf("stage && ") !== -1 && legacy.text.indexOf("date_type && ") !== -1);

  const base = {
    id: 2, title: "T", description: "D", category: "Hiking & Nature", icon: "",
    setting: "Outdoor", season: [], food: false, age21: true, cost: "Free", duration: "Short (1-2 hrs)",
    time: [], vibe: [], stage: [], date_type: [], scene: null, motif: null,
    source: "curated", tier: "free", address: null, lat: null, lng: null,
    affiliate_url: null, updated_at: null
  };
  check("a missing audience column maps to null", mapRow(base, false).audience === null);
  const tagged = mapRow(Object.assign({}, base, { audience: ["Good with kids", "Friends"], age21: true }), false);
  check("mapRow keeps the canonical tag so 21+ exclusion stays in the matcher",
    tagged.audience.join("|") === "Family Friendly|Friends" && tagged.age21 === true &&
    audience.matchesAudience(tagged, ["Family Friendly"]) === false &&
    audience.matchesAudience(tagged, ["Friends"]) === true);

  const cookie = "spark_age_ok=1";
  const accepted = validateSubmission({
    email: "ada@example.com",
    ageConfirmed: true,
    title: "Playground picnic",
    description: "Bring a blanket and eat sandwiches by the playground.",
    category: "Picnics & Parks",
    audience: ["Good with kids", "Friends"],
    age21: false
  }, { cookie: cookie });
  check("a submission stores Family Friendly, not Good with kids",
    accepted.ok === true && accepted.payload.audience.join("|") === "Family Friendly|Friends",
    JSON.stringify(accepted));
  const barred = validateSubmission({
    email: "ada@example.com",
    ageConfirmed: true,
    title: "Cocktail hour",
    description: "Meet at the brewery for a flight.",
    category: "Cooking, Food & Eating Challenges",
    audience: ["Family Friendly"],
    age21: false
  }, { cookie: cookie });
  check("alcohol text rejects Family Friendly",
    barred.ok === false && barred.fields.indexOf("audience") !== -1);
  const tooOld = validateSubmission({
    email: "ada@example.com",
    ageConfirmed: true,
    title: "Wine bar",
    description: "Share a bottle and talk.",
    category: "Themed Nights & Dinners",
    audience: ["Family Friendly", "Date"],
    age21: true
  }, { cookie: cookie });
  check("age21 rejects Family Friendly and keeps the submission invalid",
    tooOld.ok === false && tooOld.fields.indexOf("audience") !== -1);
  const friends21 = validateSubmission({
    email: "ada@example.com",
    ageConfirmed: true,
    title: "Wine bar",
    description: "Share a bottle and talk.",
    category: "Themed Nights & Dinners",
    audience: ["Friends"],
    age21: true
  }, { cookie: cookie });
  check("a 21+ submission can still be Friends",
    friends21.ok === true && friends21.payload.audience.join("|") === "Friends" && friends21.payload.age21 === true);
  const legacyStage = validateSubmission({
    email: "ada@example.com",
    ageConfirmed: true,
    title: "Sunset picnic",
    description: "Pack a blanket and watch the sky fade.",
    category: "Picnics & Parks",
    stage: ["First Date"],
    dateType: ["Solo/Couple"],
    age21: false
  }, { cookie: cookie });
  check("an older client can still send stage and dateType",
    legacyStage.ok === true && legacyStage.payload.stage[0] === "First Date" &&
    legacyStage.payload.dateType[0] === "Solo/Couple" && legacyStage.payload.audience == null);
});

section("migration is additive", () => {
  const sql = fs.readFileSync(path.join(__dirname, "..", "db", "migrations", "020_audience.sql"), "utf8");
  const rollback = fs.readFileSync(path.join(__dirname, "..", "db", "rollbacks", "020_audience.sql"), "utf8");
  check("020 adds the column, check, and gin index",
    /add column if not exists audience text\[\] not null default '\{\}'/i.test(sql) &&
    sql.indexOf("activities_audience_check") !== -1 &&
    sql.indexOf("activities_audience_gin") !== -1 &&
    sql.indexOf("Family Friendly") !== -1);
  check("020 does not update or insert activities",
    /update\s+(public\.)?activities/i.test(sql) === false &&
    /insert\s+into\s+(public\.)?activities/i.test(sql) === false);
  check("020 keeps RLS and grants nothing",
    /enable row level security/i.test(sql) &&
    /revoke all on table public\.activities from anon/i.test(sql) &&
    /create policy/i.test(sql) === false &&
    /\bgrant\b/i.test(sql) === false);
  check("rollback drops only the audience objects",
    /drop column if exists audience/i.test(rollback) &&
    /drop column if exists date_type/i.test(rollback) === false &&
    /drop column if exists stage/i.test(rollback) === false &&
    /update\s+(public\.)?activities/i.test(rollback) === false);
});

module.exports = (async () => {
  await section("missing audience column does not 500", () => {
    const row = {
      id: 2, title: "Hike", description: "Trail", category: "Hiking & Nature", icon: "",
      setting: "Outdoor", season: [], food: false, age21: false, cost: "Free",
      duration: "Short (1-2 hrs)", time: [], vibe: [], stage: [], date_type: [],
      scene: null, motif: null, source: "curated", tier: "free", address: null,
      city: null, source_url: null, expires_at: null, occurrences: null,
      lat: null, lng: null, affiliate_url: null, updated_at: null, materials: []
    };
    let calls = 0;
    const db = {
      async query(text) {
        calls += 1;
        if (String(text).indexOf("audience") !== -1) {
          const err = new Error('column "audience" does not exist');
          err.code = "42703";
          throw err;
        }
        return { rows: [row] };
      }
    };
    return listActivities({ audience: "Family Friendly", limit: "5" }, db).then(family => {
      check("Family Friendly matches nothing while the column is absent", family.items.length === 0 && calls === 2);
      calls = 0;
      return listActivities({ audience: "Friends", limit: "5" }, db);
    }).then(friends => {
      check("Friends still matches an untagged row while the column is absent",
        friends.items.length === 1 && friends.items[0].audience === null && calls === 2);
    }).catch(err => {
      check("missing-column lookup succeeded", false, String(err.stack || err.message).slice(0, 400));
    });
  });
  return { pass: pass, fail: fail };
})();
