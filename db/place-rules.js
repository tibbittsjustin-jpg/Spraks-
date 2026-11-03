/* Filter rules for the place loader.

   The seed file is the Filters reviewer's rules-017 list. Each rule maps a
   source field to filters.js values, or to an action. Priority is parsed out
   of the notes (the reviewer had no priority column). For each filter, the
   highest priority match wins and then the highest score, and that winner
   replaces the dataset default.

   Regexes are the reviewer's JS/Python patterns, including (?i) and \\b.
   They are compiled and applied here, not in Postgres. */
"use strict";

const filters = require("../shared/filters");

const FILTER_KEYS = [
  "category", "setting", "season", "cost", "duration", "time", "vibe",
  "stage", "dateType", "food", "age21"
];

const ARRAY_KEYS = { season: true, time: true, vibe: true, stage: true, dateType: true };
const BOOL_KEYS = { food: true, age21: true };

const REVIEW_SCORE_KEYS = ["category", "setting", "cost", "age21"];
const REVIEW_BELOW = 0.7;

/* Justin's bands, in $20 steps. They replace $1-$10, $11-$19, $20-$30,
   $31-$99, and the old "$100 and under" band.
   TODO(filters.js): a separate PR adds these strings to shared/filters.js.
   Until that merges, storedCost() writes a band only when filters.js already
   lists it (Free and Over $100 today). The $20-step bands stay null and the
   row is reviewed. Do not edit filters.js in this change. */
const COST_BANDS = [
  "Free",
  "$1-$20",
  "$21-$40",
  "$41-$60",
  "$61-$80",
  "$81-$100",
  "Over $100"
];
const COST_BAND_MAP = {
  "Free": "Free",
  "$1-$20": null,
  "$21-$40": null,
  "$41-$60": null,
  "$61-$80": null,
  "$81-$100": null,
  "Over $100": "Over $100"
};
/* Current rules still say the old labels. A label that sits inside one new
   band folds into it. A label that crosses a $20 step needs the fee number. */
const LEGACY_COST_BANDS = {
  "Free": "Free",
  "$1-$10": "$1-$20",
  "$11-$19": "$1-$20",
  "$20-$30": null,
  "$31-$99": null,
  "$100 and under": null,
  "Over $100": "Over $100"
};
const PER_CAR_FEE_FIELDS = [
  "private_vehicle_fee",
  "vehicle_fee",
  "day_use_fee",
  "entrance_fee",
  "day_use_fee (park 'Park Fees' page)"
];
const PER_PERSON_FEE_FIELDS = [
  "per_person_fee",
  "admission_per_person",
  "fee_per_person"
];

const ACTIONS = new Set([
  "exclude",
  "hold",
  "hold_generic_name",
  "clean_title",
  "expand_title_abbreviation",
  "dedupe_prefer_stateparks_nps",
  "city_polygon_lookup",
  "hold_link_not_nps_gov",
  "season_from_text",
  "use_infourl_as_link"
]);

/* city_polygon_lookup is the only action that does not, by itself, queue the row. */
const REVIEW_ACTIONS = new Set([
  "exclude",
  "hold",
  "hold_generic_name",
  "clean_title",
  "expand_title_abbreviation",
  "dedupe_prefer_stateparks_nps",
  "hold_link_not_nps_gov",
  "season_from_text",
  "use_infourl_as_link"
]);

function valueSet(key) {
  const list = filters[key];
  if (!list) return null;
  const set = new Set();
  list.forEach(value => set.add(String(value)));
  return set;
}

const ALLOWED = {};
FILTER_KEYS.forEach(key => { ALLOWED[key] = valueSet(key); });

function parsePriority(notes) {
  const match = String(notes || "").match(/priority\s+(\d+)/i);
  if (!match) return null;
  return Number(match[1]);
}

function parseRuleCode(notes) {
  const match = String(notes || "").match(/rule\s+([a-z0-9_]+-\d+)/i);
  return match ? match[1] : null;
}

/* (?i) is Python. Node rejects it, so it becomes the i flag. \\b stays \\b. */
function compileRegex(source) {
  let body = String(source);
  let flags = "";
  if (body.indexOf("(?i)") !== -1) {
    flags += "i";
    body = body.replace(/\(\?i\)/g, "");
  }
  return new RegExp(body, flags);
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* Keyword patterns are tags, not regexes. "a / b" is OR, "a + b" is AND,
   and * is a glob. A trailing parenthetical note is not part of the tag. */
function compileKeyword(pattern) {
  const alternatives = String(pattern).split(/\s+\/\s+/).map(part => part.trim()).filter(Boolean);
  if (!alternatives.length) throw new Error("empty keyword");
  const compiled = alternatives.map(alt => {
    return alt.split(/\s+\+\s+/).map(piece => {
      const cleaned = piece.replace(/\s+\([^)]*\)\s*$/, "").trim();
      if (!cleaned) throw new Error("empty keyword piece in " + pattern);
      const body = escapeRegex(cleaned).replace(/\\\*/g, ".*");
      return new RegExp(body, "i");
    });
  });
  return function keywordTest(hay) {
    const text = hay == null ? "" : String(hay);
    return compiled.some(parts => parts.every(re => re.test(text)));
  };
}

function storedCost(band) {
  if (!band || filters.cost.indexOf(band) === -1) return null;
  return band;
}

/* Whole dollars. $0 is Free, $1 through $20 is the first paid band, then
   every $20, and anything over $100 is Over $100. $20 is in $1-$20. */
function bandFee(amount) {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n === 0) return "Free";
  if (n <= 20) return "$1-$20";
  if (n <= 40) return "$21-$40";
  if (n <= 60) return "$41-$60";
  if (n <= 80) return "$61-$80";
  if (n <= 100) return "$81-$100";
  return "Over $100";
}

function parseFeeAmount(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  if (/does not charge|^\s*free\s*$/i.test(text)) return 0;
  const n = Number(text.replace(/[$,]/g, ""));
  if (!Number.isFinite(n)) return null;
  return n;
}

function readFee(record) {
  if (!record) return null;
  const specs = PER_CAR_FEE_FIELDS.map(field => ({ field: field, unit: "per car" }))
    .concat(PER_PERSON_FEE_FIELDS.map(field => ({ field: field, unit: "per person" })));
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    if (!Object.prototype.hasOwnProperty.call(record, spec.field)) continue;
    const amount = parseFeeAmount(record[spec.field]);
    if (amount == null) continue;
    return { amount: amount, unit: amount > 0 ? spec.unit : null, field: spec.field };
  }
  return null;
}

function resolveRuleCost(raw) {
  let target = null;
  let needsFee = false;
  if (Object.prototype.hasOwnProperty.call(COST_BAND_MAP, raw)) {
    target = raw;
  } else if (Object.prototype.hasOwnProperty.call(LEGACY_COST_BANDS, raw)) {
    target = LEGACY_COST_BANDS[raw];
    needsFee = target == null;
  } else {
    return null;
  }
  const stored = storedCost(target);
  return {
    target: target,
    stored: stored,
    requested: target || raw,
    unwired: target != null && stored == null,
    needsFee: needsFee
  };
}

function parseFilterToken(token) {
  const text = String(token);
  if (text.indexOf("action:") === 0) {
    const name = text.slice("action:".length);
    if (!ACTIONS.has(name)) {
      const err = new Error("unknown action " + name);
      err.code = "unknown_action";
      throw err;
    }
    return { kind: "action", action: name };
  }
  const splitAt = text.indexOf(":");
  if (splitAt <= 0) {
    const err = new Error("filter value needs a filter:value form: " + text);
    err.code = "bad_filter_value";
    throw err;
  }
  const key = text.slice(0, splitAt);
  const raw = text.slice(splitAt + 1);
  /* Display label only. Not a filters.js filter and not checked by the API. */
  if (key === "cost_unit") {
    if (!raw.trim()) {
      const err = new Error("cost_unit needs a value");
      err.code = "bad_filter_value";
      throw err;
    }
    return { kind: "cost_unit", value: raw.trim() };
  }
  if (key === "cost") {
    const resolved = resolveRuleCost(raw);
    if (!resolved) {
      const err = new Error("cost value is not a known band: " + raw);
      err.code = "bad_filter_value";
      throw err;
    }
    return {
      kind: "filter",
      key: "cost",
      value: resolved.stored,
      requested: resolved.requested,
      unwired: resolved.unwired,
      needsFee: resolved.needsFee,
      provisional: false
    };
  }
  if (!ALLOWED[key]) {
    const err = new Error("unknown filter " + key);
    err.code = "bad_filter_value";
    throw err;
  }
  let value = raw;
  if (BOOL_KEYS[key]) {
    if (raw !== "true" && raw !== "false") {
      const err = new Error(key + " must be true or false");
      err.code = "bad_filter_value";
      throw err;
    }
    value = raw === "true";
  }
  if (!ALLOWED[key].has(String(value))) {
    const err = new Error(key + " value is not in filters.js: " + raw);
    err.code = "bad_filter_value";
    throw err;
  }
  return { kind: "filter", key: key, value: value };
}

function prepareRule(raw) {
  const priority = parsePriority(raw.notes);
  if (priority == null) {
    const err = new Error("rule is missing priority in notes");
    err.code = "missing_priority";
    throw err;
  }
  const ruleCode = parseRuleCode(raw.notes);
  if (!ruleCode) {
    const err = new Error("rule is missing a rule code in notes");
    err.code = "missing_rule_code";
    throw err;
  }
  const tokens = (raw.filter_values || []).map(parseFilterToken);
  let test;
  if (raw.match_type === "regex") {
    const re = compileRegex(raw.match_value);
    test = function (value) {
      if (value == null) return false;
      return re.test(String(value));
    };
  } else if (raw.match_type === "exact") {
    const expected = String(raw.match_value);
    test = function (value) {
      if (value == null) return false;
      return String(value) === expected;
    };
  } else if (raw.match_type === "keyword") {
    test = compileKeyword(raw.match_value);
  } else {
    const err = new Error("unknown match_type " + raw.match_type);
    err.code = "bad_match_type";
    throw err;
  }
  return {
    ruleCode: ruleCode,
    dataset: raw.dataset == null || raw.dataset === "" ? null : String(raw.dataset),
    matchField: String(raw.match_field),
    matchValue: String(raw.match_value),
    matchType: String(raw.match_type),
    filterValues: raw.filter_values.slice(),
    tokens: tokens,
    confidenceScore: Number(raw.confidence_score),
    confidenceLevel: raw.confidence_level === "low" ? "low" : "high",
    alwaysReview: raw.always_review === true,
    notes: raw.notes == null ? "" : String(raw.notes),
    priority: priority,
    test: test
  };
}

function prepareRules(list) {
  const prepared = list.map(prepareRule);
  const seen = new Set();
  prepared.forEach(rule => {
    if (seen.has(rule.ruleCode)) {
      const err = new Error("duplicate rule code " + rule.ruleCode);
      err.code = "duplicate_rule";
      throw err;
    }
    seen.add(rule.ruleCode);
  });
  return prepared;
}

/* Source field for a rule. null means the field is absent on the record
   (distinct from an empty string). STATUS is absent when the pull has no
   status key at all; the Proposed/Planned/Closed rule must not fire then. */
/* Fee regexes are written for plain numbers. "$20" and "$1,000" must match. */
function feeMatchText(value) {
  if (value == null) return "";
  return String(value).replace(/[$,]/g, "").trim();
}

const FEE_MATCH_FIELDS = new Set([
  "private_vehicle_fee",
  "vehicle_fee",
  "day_use_fee",
  "entrance_fee",
  "day_use_fee (park 'Park Fees' page)",
  "per_person_fee",
  "admission_per_person",
  "fee_per_person",
  "fee_fact"
]);

function blankFeeField(record) {
  if (!record) return false;
  return PER_CAR_FEE_FIELDS.concat(["per_person_fee", "fee_fact", "admission_per_person"]).some(field =>
    Object.prototype.hasOwnProperty.call(record, field) && feeMatchText(record[field]) === ""
  );
}

function sourceField(record, field, derived) {
  if (field === "*") return derived && derived.star != null ? derived.star : "*";
  const derivedCity = derived && Object.prototype.hasOwnProperty.call(derived, "city")
    ? derived.city
    : undefined;
  if (field === "CITY") return derivedCity == null ? "" : String(derivedCity);
  if (field === "STATUS") return statusValue(record);
  if (field === "NAME" || field === "name" || field === "PrimaryName") {
    return record && record.name != null ? String(record.name) : "";
  }
  if (field === "TYPE") return record && record.type != null ? String(record.type) : "";
  if (field === "ACRES") {
    if (!record || record.acres == null || record.acres === "") return "";
    return String(record.acres);
  }
  if (field === "lat") {
    if (!record || record.lat == null || record.lat === "") return "";
    return String(record.lat);
  }
  if (field === "primary_use" || field === "Comments" || field === "comments") {
    if (!record) return "";
    const raw = record.primary_use != null ? record.primary_use : (record.Comments != null ? record.Comments : record.comments);
    if (raw == null) return "";
    const text = String(raw).trim();
    if (/^(MTB|HIKE|MULTI)$/i.test(text)) return text.toUpperCase();
    if (field === "primary_use" && record.primary_use != null) return text;
    return "";
  }
  if (field === "categories") {
    return categoriesOf(record);
  }
  if (field === "category" && record && record.category != null && !Array.isArray(record.category)) {
    return String(record.category);
  }
  if (field === "location" || field === "source_url") {
    if (!record || record[field] == null) return "";
    return String(record[field]);
  }
  if (field === "private_vehicle_fee" || field === "vehicle_fee") {
    const raw = record && record.vehicle_fee != null ? record.vehicle_fee : (record && record.private_vehicle_fee);
    return feeMatchText(raw);
  }
  if (field === "day_use_fee" || field === "entrance_fee" || field === "day_use_fee (park 'Park Fees' page)") {
    const raw = record && record.entrance_fee != null ? record.entrance_fee : (record && record.day_use_fee);
    return feeMatchText(raw);
  }
  if (!record || !Object.prototype.hasOwnProperty.call(record, field) || record[field] == null) {
    return "";
  }
  if (FEE_MATCH_FIELDS.has(field)) return feeMatchText(record[field]);
  return String(record[field]);
}

function statusValue(record) {
  if (!record) return null;
  const keys = ["STATUS", "status", "Status", "park_status", "ParkStatus"];
  for (let i = 0; i < keys.length; i++) {
    if (Object.prototype.hasOwnProperty.call(record, keys[i]) && record[keys[i]] != null) {
      return String(record[keys[i]]).trim();
    }
  }
  return null;
}

function statusIsMissing(record) {
  if (!record) return true;
  const keys = ["STATUS", "status", "Status", "park_status", "ParkStatus"];
  return !keys.some(key => Object.prototype.hasOwnProperty.call(record, key) && record[key] != null);
}

/* Comments and museum_type stay off until Legal confirms them. A dataset
   allowlist is the only switch. Other match fields are always eligible. */
const GATED_MATCH_FIELDS = new Set(["Comments", "comments", "museum_type"]);

function fieldAllowed(field, allowlist) {
  if (!GATED_MATCH_FIELDS.has(field)) return true;
  return Array.isArray(allowlist) && allowlist.indexOf(field) !== -1;
}

function categoriesOf(record) {
  if (!record || record.categories == null) return [];
  if (Array.isArray(record.categories)) {
    return record.categories.map(item => String(item).trim()).filter(Boolean);
  }
  return String(record.categories).split(/[|;]/).map(item => item.trim()).filter(Boolean);
}

function ruleMatches(rule, record, datasetKey, derived) {
  if (rule.dataset != null && rule.dataset !== datasetKey) return false;
  const allowlist = derived && derived.fieldAllowlist;
  if (!fieldAllowed(rule.matchField, allowlist)) return false;
  if (rule.matchField === "categories") {
    const list = categoriesOf(record);
    if (!list.length) return false;
    return list.some(item => rule.test(item));
  }
  const value = sourceField(record, rule.matchField, derived);
  if (value == null) return false;
  return rule.test(value);
}

function betterRule(candidate, current) {
  if (!current) return true;
  if (candidate.priority !== current.priority) return candidate.priority > current.priority;
  if (candidate.confidenceScore !== current.confidenceScore) {
    return candidate.confidenceScore > current.confidenceScore;
  }
  return candidate.ruleCode < current.ruleCode;
}

function blankFilters() {
  return {
    category: null,
    setting: null,
    season: [],
    cost: null,
    duration: null,
    time: [],
    vibe: [],
    stage: [],
    dateType: [],
    food: null,
    age21: null
  };
}

/* Apply every matching rule. Returns the mapped filters, the winning rule
   per filter, the actions that fired, and whether the row is review or excluded. */
function applyRules(rules, record, datasetKey, derived) {
  const matched = [];
  for (let i = 0; i < rules.length; i++) {
    if (ruleMatches(rules[i], record, datasetKey, derived)) matched.push(rules[i]);
  }

  const winners = {};
  const actions = [];
  matched.forEach(rule => {
    const seenAction = new Set();
    rule.tokens.forEach(token => {
      if (token.kind === "action") {
        if (!seenAction.has(token.action)) {
          seenAction.add(token.action);
          actions.push(token.action);
        }
        return;
      }
      const slot = token.kind === "cost_unit" ? "cost_unit" : token.key;
      const current = winners[slot];
      if (betterRule(rule, current)) winners[slot] = rule;
    });
  });

  const mapped = blankFilters();
  const confidenceByField = {};
  let costUnit = null;
  let costRequested = null;
  let costUnwired = false;
  let costProvisional = false;
  Object.keys(winners).forEach(key => {
    const rule = winners[key];
    if (key === "cost_unit") {
      rule.tokens.forEach(token => {
        if (token.kind === "cost_unit") costUnit = token.value;
      });
      return;
    }
    const values = [];
    rule.tokens.forEach(token => {
      if (token.kind === "filter" && token.key === key) {
        values.push(token.value);
        if (key === "cost") {
          costRequested = token.requested;
          costUnwired = token.unwired === true;
          costProvisional = token.provisional === true;
        }
      }
    });
    if (ARRAY_KEYS[key]) mapped[key] = values.slice();
    else mapped[key] = values.length ? values[values.length - 1] : null;
    confidenceByField[key] = rule.confidenceScore;
  });

  const alwaysReview = matched.some(rule => rule.alwaysReview);
  const lowCritical = REVIEW_SCORE_KEYS.some(key => {
    const score = confidenceByField[key];
    return score == null || score < REVIEW_BELOW;
  });
  const reviewAction = actions.some(name => REVIEW_ACTIONS.has(name));
  const excluded = actions.indexOf("exclude") !== -1;
  /* No unknown-cost value. A row with no band at all is review. A $20-step
     band that filters.js cannot store yet still counts as a price; migration
     018 has to accept it before anything is written to activities. */
  const fee = readFee(record);
  if (blankFeeField(record)) {
    mapped.cost = null;
    costRequested = null;
    costUnit = null;
    costUnwired = false;
  } else if (fee && fee.amount > 0 && !costUnit) {
    costUnit = fee.unit;
  }
  if (!costUnit) {
    const price = mapped.cost || costRequested;
    if (price && price !== "Free") {
      costUnit = datasetKey === "ugrc_parks" || datasetKey === "stateparks" || datasetKey === "nps"
        ? "per car"
        : "per person";
    }
  }
  const noPrice = (mapped.cost == null && costRequested == null) || blankFeeField(record);
  const review = !excluded && (alwaysReview || lowCritical || reviewAction || noPrice);

  return {
    matched: matched,
    winners: winners,
    mapped: mapped,
    confidenceByField: confidenceByField,
    actions: actions,
    excluded: excluded,
    review: review,
    noPrice: noPrice,
    alwaysReview: alwaysReview,
    genericName: actions.indexOf("hold_generic_name") !== -1,
    age21Gate: mapped.age21 === true,
    costUnit: costUnit,
    costRequested: costRequested,
    costUnwired: costUnwired,
    costProvisional: costProvisional
  };
}

module.exports = {
  FILTER_KEYS: FILTER_KEYS,
  ACTIONS: ACTIONS,
  REVIEW_BELOW: REVIEW_BELOW,
  COST_BANDS: COST_BANDS,
  COST_BAND_MAP: COST_BAND_MAP,
  LEGACY_COST_BANDS: LEGACY_COST_BANDS,
  storedCost: storedCost,
  bandFee: bandFee,
  readFee: readFee,
  resolveRuleCost: resolveRuleCost,
  parsePriority: parsePriority,
  parseRuleCode: parseRuleCode,
  compileRegex: compileRegex,
  prepareRule: prepareRule,
  prepareRules: prepareRules,
  sourceField: sourceField,
  statusValue: statusValue,
  statusIsMissing: statusIsMissing,
  GATED_MATCH_FIELDS: GATED_MATCH_FIELDS,
  fieldAllowed: fieldAllowed,
  categoriesOf: categoriesOf,
  blankFeeField: blankFeeField,
  applyRules: applyRules
};
