/* Turn one source record into a staging row. No database and no geocoding.
   Credit always comes from the dataset row. The file's source_credit is ignored. */
"use strict";

const { validateSourceUrl } = require("../lib/validate-url");
const rulesLib = require("./place-rules");
const seeds = require("./place-seeds");

const GENERIC_TIGHT_M = 50;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/* activities.expires_at is a date: the last valid America/Denver day.
   A bare YYYY-MM-DD is already that day. A timestamp is an instant, and
   the Denver calendar date of that instant is what gets stored. */
function denverCalendarDate(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string" && DATE_ONLY.test(value.trim())) return value.trim();
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(instant);
  const pick = (type) => parts.filter(part => part.type === type)[0].value;
  return pick("year") + "-" + pick("month") + "-" + pick("day");
}
const OUT_OF_STATE = /,\s*(AZ|CO|ID|NM|NV|WY|Arizona|Colorado|Idaho|New Mexico|Nevada|Wyoming)\b/i;

function httpsUrl(value) {
  const checked = validateSourceUrl(value);
  if (!checked.ok || checked.empty || !checked.value) return null;
  return checked.value;
}

function sameUrl(a, b) {
  if (!a || !b) return false;
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
}

function isNpsPage(url) {
  let parsed;
  try { parsed = new URL(url); } catch (err) { return false; }
  const host = parsed.hostname.toLowerCase();
  if (host !== "www.nps.gov" && host !== "nps.gov") return false;
  if (/^api\./.test(host) || /developer/.test(host)) return false;
  if (/\/api\//i.test(parsed.pathname)) return false;
  return parsed.protocol === "https:";
}

function isCountyName(value) {
  return typeof value === "string" && /\bcounty\b/i.test(value);
}

/* "Logan, Cache County, UT" → Logan. A county in the city slot is not a city. */
function parsePlace(location) {
  const text = typeof location === "string" ? location.trim() : "";
  if (!text || /^ut$/i.test(text) || /^utah$/i.test(text)) {
    return { city: null, address: null, countyAsCity: false, outsideUtah: false };
  }
  const parts = text.split(",").map(part => part.trim()).filter(Boolean);
  let city = null;
  let address = null;
  if (/^\d/.test(text)) {
    address = text;
    const stateIdx = parts.findIndex(part => /^(Utah|UT)\b/i.test(part));
    if (stateIdx > 0) city = parts[stateIdx - 1];
  } else if (parts.length >= 3 && /^(UT|Utah)$/i.test(parts[parts.length - 1])) {
    city = parts[0];
  } else if (parts.length === 2 && /^(UT|Utah)$/i.test(parts[1])) {
    city = parts[0];
  }
  const countyAsCity = isCountyName(city);
  if (countyAsCity) city = null;
  const outsideUtah = OUT_OF_STATE.test(text) || (/,\s*[A-Z]{2}$/.test(text) && !/,\s*UT$/i.test(text) && !/utah/i.test(text));
  return { city: city, address: address, countyAsCity: countyAsCity, outsideUtah: outsideUtah };
}

function explicitCity(record) {
  if (!record) return null;
  const keys = ["CITY", "city", "City"];
  for (let i = 0; i < keys.length; i++) {
    if (record[keys[i]] != null && String(record[keys[i]]).trim()) return String(record[keys[i]]).trim();
  }
  return null;
}

function nameKey(title, generic) {
  let text = String(title || "").toLowerCase();
  text = text.normalize ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : text;
  text = text.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (generic) return text;
  const stripped = text.replace(/\b(park|parks|trailhead|trailheads|the|a|an)\b/g, " ").replace(/\s+/g, " ").trim();
  return stripped || text;
}

function cleanTitle(title) {
  return String(title || "")
    .replace(/\s*--\s*/g, " - ")
    .replace(/\s*\/\s*/g, " - ")
    .replace(/,?\s+inc\.?$/i, "")
    .replace(/\bDUP\b/g, "Daughters of Utah Pioneers")
    .replace(/\(\s*Daughters of Utah Pioneers\s*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function expandAbbrev(title) {
  return String(title || "")
    .replace(/\bBST\b/g, "Bonneville Shoreline Trail")
    .replace(/\bJRP\b/g, "Jordan River Parkway");
}

function roundedAcres(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 10) return String(Math.round(n * 10) / 10);
  return String(Math.round(n));
}

function describe(datasetKey, title, city, type, acres) {
  const where = city ? " in " + city : "";
  if (datasetKey === "ugrc_parks") {
    const kind = type ? String(type).toLowerCase() : "park";
    const size = roundedAcres(acres);
    const sizeText = size ? " of about " + size + " acres" : "";
    return title + " is a " + kind + where + sizeText + ". The pin is an approximate location, not an entrance. Check conditions before you go.";
  }
  if (datasetKey === "ugrc_trailheads") {
    return title + " is a trailhead. Check conditions before you go.";
  }
  if (datasetKey === "museums") return "Visit " + title + where + ".";
  if (datasetKey === "stateparks") {
    return "Spend time at " + title + ". Check the park's official page for hours and fees before you go.";
  }
  if (datasetKey === "nps") {
    return "Visit " + title + (city ? " near " + city : "") + ". Check the park's nps.gov page for current conditions before you go.";
  }
  return title + where + ".";
}

function resolveLink(record, dataset, actions) {
  const recordUrl = httpsUrl(record && record.source_url);
  const infoUrl = httpsUrl(record && (record.InfoURL || record.infoUrl));
  const datasetUrl = httpsUrl(dataset.sourceUrl);
  if (dataset.npsPagesOnly) {
    if (recordUrl && isNpsPage(recordUrl) && actions.indexOf("hold_link_not_nps_gov") === -1) {
      return { link: recordUrl, linkFlag: "official", sourceUrl: recordUrl };
    }
    return { link: null, linkFlag: "missing", sourceUrl: null };
  }
  if (actions.indexOf("use_infourl_as_link") !== -1 && infoUrl) {
    return { link: infoUrl, linkFlag: "official", sourceUrl: infoUrl };
  }
  if (recordUrl && datasetUrl && sameUrl(recordUrl, datasetUrl)) {
    return { link: recordUrl, linkFlag: "dataset", sourceUrl: recordUrl };
  }
  if (recordUrl) return { link: recordUrl, linkFlag: "official", sourceUrl: recordUrl };
  if (datasetUrl) return { link: datasetUrl, linkFlag: "dataset", sourceUrl: datasetUrl };
  return { link: null, linkFlag: "missing", sourceUrl: null };
}

function sourceRecordId(datasetKey, record, seen) {
  const explicit = record && (record.objectId || record.OBJECTID || record.GlobalID || record.source_record_id);
  if (explicit != null && String(explicit).trim()) return String(explicit).trim();
  const url = httpsUrl(record && record.source_url);
  if (url && seen.uniqueUrls[url]) return "url:" + url;
  const base = [
    slug(record && record.name),
    slug(record && record.location),
    slug(record && (record.type || record.kind)),
    record && record.lat == null ? "na" : Number(record.lat).toFixed(6),
    record && record.lng == null ? "na" : Number(record.lng).toFixed(6)
  ].join("|");
  seen.ids[base] = (seen.ids[base] || 0) + 1;
  return seen.ids[base] === 1 ? base : base + "#" + seen.ids[base];
}

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
}

function countUrls(records) {
  const counts = {};
  records.forEach(record => {
    const url = httpsUrl(record && record.source_url);
    if (!url) return;
    counts[url] = (counts[url] || 0) + 1;
  });
  const unique = {};
  Object.keys(counts).forEach(url => { if (counts[url] === 1) unique[url] = 1; });
  return unique;
}

function featureFor(dataset, record) {
  if (dataset.datasetKey === "ugrc_parks" && record && /campground/i.test(String(record.type || ""))) return "campground";
  return dataset.featureType;
}

function normalizeRecord(dataset, record, rules, seen) {
  const explicit = explicitCity(record);
  const parsed = parsePlace(record && record.location);
  let city = explicit || parsed.city;
  let countyAsCity = parsed.countyAsCity;
  if (isCountyName(explicit)) {
    city = null;
    countyAsCity = true;
  }
  const trailhead = dataset.datasetKey === "ugrc_trailheads";
  if (trailhead) city = null;
  const derived = {
    city: city,
    fieldAllowlist: dataset.fieldAllowlist || [],
    star: "*"
  };
  const tagged = rulesLib.applyRules(rules, record || {}, dataset.datasetKey, derived);
  const actions = tagged.actions.slice();
  const status = rulesLib.statusValue(record);
  const flags = {
    statusMissing: dataset.datasetKey === "ugrc_parks" && rulesLib.statusIsMissing(record),
    statusBlank: dataset.datasetKey === "ugrc_parks" && !rulesLib.statusIsMissing(record) && String(status || "").trim() === "",
    statusFuture: false,
    countyAsCity: countyAsCity,
    needsCity: trailhead,
    cityLookup: actions.indexOf("city_polygon_lookup") === -1 ? null : "not_cleared"
  };
  if (status != null && /^future$/i.test(String(status).trim()) && actions.indexOf("exclude") === -1) {
    flags.statusFuture = true;
    if (actions.indexOf("hold") === -1) actions.push("hold");
    tagged.review = true;
  }
  let title = record && record.name ? String(record.name).trim() : "";
  const sourceName = title;
  if (actions.indexOf("clean_title") !== -1) title = cleanTitle(title);
  if (actions.indexOf("expand_title_abbreviation") !== -1) title = expandAbbrev(title);
  const generic = tagged.genericName || seeds.GENERIC_NAME.test(sourceName);
  if (generic && city) title = sourceName + " (" + city + ")";
  const link = resolveLink(record, dataset, actions);
  const outside = parsed.outsideUtah;
  if (outside) tagged.review = true;
  const lat = record && typeof record.lat === "number" ? record.lat : null;
  const lng = record && typeof record.lng === "number" ? record.lng : null;
  const coordsOk = lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return {
    datasetKey: dataset.datasetKey,
    sourceRecordId: sourceRecordId(dataset.datasetKey, record, seen),
    featureType: featureFor(dataset, record),
    odbl: dataset.odbl === true,
    raw: record,
    title: title,
    sourceName: sourceName,
    description: describe(dataset.datasetKey, title, city, record && record.type, record && record.acres),
    category: tagged.mapped.category,
    icon: "",
    setting: tagged.mapped.setting,
    season: tagged.mapped.season,
    food: tagged.mapped.food === true,
    cost: tagged.mapped.cost,
    costUnit: tagged.costUnit,
    costRequested: tagged.costRequested,
    duration: tagged.mapped.duration,
    time: tagged.mapped.time,
    vibe: tagged.mapped.vibe,
    stage: tagged.mapped.stage,
    dateType: tagged.mapped.dateType,
    materials: [],
    age21: tagged.mapped.age21 === true,
    address: parsed.address,
    city: city,
    sourceUrl: link.sourceUrl,
    sourceCredit: dataset.creditLine,
    expiresAt: denverCalendarDate(record && record.expires_at),
    occurrences: null,
    occurrencesFlag: false,
    mappedFilters: tagged.mapped,
    tagConfidence: minCritical(tagged.confidenceByField),
    confidenceByField: tagged.confidenceByField,
    tagReview: tagged.review,
    actions: actions,
    excluded: tagged.excluded,
    nameKey: nameKey(generic ? sourceName : title, generic),
    dedupeRadiusM: generic ? GENERIC_TIGHT_M : dataset.dedupeRadiusM,
    genericName: generic,
    sameNameKeepBoth: false,
    lat: coordsOk ? lat : null,
    lng: coordsOk ? lng : null,
    needsHandPin: !coordsOk,
    outOfUtah: outside,
    link: link.link,
    linkFlag: link.linkFlag,
    status: tagged.excluded ? "excluded" : "pending",
    flags: flags,
    age21Gate: tagged.age21Gate
  };
}

function minCritical(scores) {
  const keys = ["category", "setting", "cost", "age21"];
  let min = null;
  keys.forEach(key => {
    const score = scores[key];
    if (score == null) return;
    if (min == null || score < min) min = score;
  });
  return min == null ? 0 : min;
}

function markDuplicateTrailheads(rows) {
  const groups = {};
  rows.forEach(row => {
    if (row.datasetKey !== "ugrc_trailheads" || row.excluded) return;
    const key = String(row.sourceName || "").toLowerCase();
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  });
  Object.keys(groups).forEach(key => {
    const group = groups[key];
    if (group.length < 2) return;
    const points = group.map(row => row.lat + "," + row.lng);
    const distinct = new Set(points).size > 1;
    if (!distinct) return;
    group.forEach(row => {
      row.sameNameKeepBoth = true;
      row.flags.duplicateTrailheadName = true;
      row.tagReview = true;
    });
  });
}

/* Park-boundary fee inheritance is not cleared. The flag defaults off and
   does not copy a park fee or cost_unit onto a trailhead. */
function inheritTrailheadParkFees(rows, enabled) {
  if (enabled !== true) {
    return { applied: false, reason: "park boundary data is not cleared; fee inheritance is off" };
  }
  return { applied: false, reason: "enabled, but no cleared park-boundary layer is loaded" };
}

function normalizeDataset(dataset, records, rules) {
  seeds.assertCanLoad(dataset);
  const seen = { ids: {}, uniqueUrls: countUrls(records) };
  const rows = records.map(record => normalizeRecord(dataset, record, rules, seen));
  rows.forEach(row => seeds.assertFeatureAllowed(dataset, row.featureType));
  if (dataset.datasetKey === "ugrc_trailheads") markDuplicateTrailheads(rows);
  return rows;
}

module.exports = {
  GENERIC_TIGHT_M: GENERIC_TIGHT_M,
  denverCalendarDate: denverCalendarDate,
  parsePlace: parsePlace,
  isCountyName: isCountyName,
  isNpsPage: isNpsPage,
  nameKey: nameKey,
  normalizeRecord: normalizeRecord,
  normalizeDataset: normalizeDataset,
  inheritTrailheadParkFees: inheritTrailheadParkFees,
  markDuplicateTrailheads: markDuplicateTrailheads
};
