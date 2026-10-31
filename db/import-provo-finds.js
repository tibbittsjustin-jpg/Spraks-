/* Load Research's Utah County finds into activities as pending AI rows.

   Does not approve anything. Public routes only return status = 'approved',
   so these rows stay out of the app until a person approves them.

   Usage (from the repo root, after npm run db:migrate):

     node db/import-provo-finds.js --dry-run
     DATABASE_URL="postgres://..." node db/import-provo-finds.js --dry-run
     DATABASE_URL="postgres://..." node db/import-provo-finds.js

   --dry-run prints counts and writes nothing. When DATABASE_URL is set, a
   dry run also reads existing activities so the counts include rows already
   in that database. Add --file-only to ignore DATABASE_URL and compare only
   against the curated ideas file. The write path refuses to run without
   DATABASE_URL.

   Point DATABASE_URL at the database you intend to update. This script does
   not pick a database on its own. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { Pool } = require("pg");
const filters = require("../shared/filters");
const radius = require("../public/radius");
const occurrences = require("../public/occurrences");
const { loadIdeas } = require("./seed");
const { poolConfig } = require("./index");

const RESEARCH_DIR = path.join(__dirname, "..", "data", "research");
const IDEAS_FILE = path.join(__dirname, "..", "public", "data.js");
const PINS_FILE = path.join(__dirname, "..", "public", "pins.js");

const PROXIMITY_MILES = 0.5;
const SOURCE_URL_RE = /^https:\/\/[^\s]+$/;
const SOURCE_URL_MAX = 2048;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const COST_BANDS = [
  { cost: "Free", lo: 0, hi: 0 },
  { cost: "$1-$10", lo: 1, hi: 10 },
  { cost: "$20-$30", lo: 20, hi: 30 },
  { cost: "$100 and under", lo: 31, hi: 100 },
  { cost: "Over $100", lo: 101, hi: Infinity }
];

const INSERT_SQL =
  "insert into activities (" +
  "title, description, category, icon, setting, season, food, cost, duration, " +
  "time, vibe, stage, date_type, scene, motif, materials, age21, " +
  "status, source, tier, address, city, source_url, expires_at, occurrences, " +
  "location, coords_locked, geo_status, geo_confidence, geo_source, geo_resolved_at" +
  ") select " +
  "$1, $2, $3, $4, $5, $6::text[], $7, $8, $9, " +
  "$10::text[], $11::text[], $12::text[], $13::text[], $14, $15, $16::text[], $17, " +
  "'pending', 'ai', 'free', $18, $19, $20, $21::date, $22::jsonb, " +
  "case when $23::double precision is null or $24::double precision is null then null " +
  "else ST_SetSRID(ST_MakePoint($24::double precision, $23::double precision), 4326)::geography end, " +
  "$25, $26, $27, $28, $29::date " +
  "where not exists (" +
  "select 1 from activities existing " +
  "where existing.source = 'ai' " +
  "and lower(btrim(existing.title)) = lower(btrim($1)) " +
  "and existing.source_url is not distinct from $20" +
  ")";

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeSourceUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    url.hash = "";
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = url.pathname.replace(/\/+$/, "");
    return url.protocol.toLowerCase() + "//" + host + pathname + url.search;
  } catch (err) {
    return trimmed.toLowerCase().replace(/\/+$/, "");
  }
}

function finiteCoord(value, limit) {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}

function milesApart(a, b) {
  if (!a || !b) return null;
  if (!finiteCoord(a.lat, 90) || !finiteCoord(a.lng, 180)) return null;
  if (!finiteCoord(b.lat, 90) || !finiteCoord(b.lng, 180)) return null;
  return radius.haversineMiles({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
}

/* Same title, plus either a shared source page, a nearby point, or no way
   to show they are different places. A shared page with a different title
   is a different activity (several events can cite one venue page). */
function findDuplicate(row, others) {
  const title = normalizeTitle(row.title);
  const url = normalizeSourceUrl(row.source_url);
  for (let i = 0; i < others.length; i++) {
    const other = others[i];
    if (normalizeTitle(other.title) !== title) continue;
    const otherUrl = normalizeSourceUrl(other.source_url);
    const urlMatch = !!(url && otherUrl && url === otherUrl);
    const miles = milesApart(row, other);
    if (urlMatch) {
      return { title: other.title, reason: "same title and source page", origin: other.origin || null };
    }
    if (miles != null && miles <= PROXIMITY_MILES) {
      return {
        title: other.title,
        reason: "same title within " + PROXIMITY_MILES + " miles",
        origin: other.origin || null
      };
    }
    if (miles != null && miles > PROXIMITY_MILES) continue;
    if (url && otherUrl && url !== otherUrl) continue;
    return {
      title: other.title,
      reason: "same title and no coordinates to separate them",
      origin: other.origin || null
    };
  }
  return null;
}

function singlePlace(label) {
  if (typeof label !== "string") return null;
  const text = label.trim().replace(/\s+/g, " ");
  if (!text || text.length > 80) return null;
  const wrapped = text.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (wrapped) {
    const outside = wrapped[1].trim();
    const inside = wrapped[2].trim();
    if (/canyon|county/i.test(outside)) {
      if (inside && inside.indexOf(",") === -1 && inside.length <= 80 && !/\d/.test(inside)) return inside;
      return null;
    }
    if (outside && outside.indexOf(",") === -1 && outside.length <= 80) return outside;
    return null;
  }
  if (text.indexOf(",") !== -1) return null;
  return text;
}

function cityFromAddress(address) {
  if (typeof address !== "string") return null;
  const parts = address.split(",").map(part => part.trim()).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    if (!/^(UT|Utah)(\b|\s|$)/i.test(parts[i])) continue;
    const city = parts[i - 1];
    if (!city) return null;
    if (/\d/.test(city)) return null;
    if (/county|canyon|trailhead|loop|pullout|highway|\bsr-|\bus-/i.test(city)) return null;
    if (city.length > 80) return null;
    return city;
  }
  return null;
}

function cityFromCoords(lat, lng, placePins) {
  if (!placePins || !finiteCoord(lat, 90) || !finiteCoord(lng, 180)) return null;
  const label = radius.nearestPlaceLabel({ lat: lat, lng: lng }, placePins, radius.NEAREST_LABEL_MILES);
  return singlePlace(label);
}

function closestCost(price) {
  let best = COST_BANDS[0];
  let bestDist = Infinity;
  for (let i = 0; i < COST_BANDS.length; i++) {
    const band = COST_BANDS[i];
    let dist;
    if (price >= band.lo && price <= band.hi) dist = 0;
    else if (price < band.lo) dist = band.lo - price;
    else dist = price - band.hi;
    const closer = dist < bestDist - 1e-9;
    const tieHigher = Math.abs(dist - bestDist) <= 1e-9 && band.lo > best.lo;
    if (closer || tieHigher) {
      best = band;
      bestDist = dist;
    }
  }
  return best.cost;
}

function extractPrices(text) {
  if (typeof text !== "string") return [];
  const prices = [];
  const consumed = [];
  const range = /\$(\d+(?:\.\d+)?)\s*[–—-]\s*\$?(\d+(?:\.\d+)?)/g;
  let match;
  while ((match = range.exec(text))) {
    prices.push(Number(match[1]), Number(match[2]));
    consumed.push([match.index, match.index + match[0].length]);
  }
  const single = /\$(\d+(?:\.\d+)?)/g;
  while ((match = single.exec(text))) {
    const at = match.index;
    let inside = false;
    for (let i = 0; i < consumed.length; i++) {
      if (at >= consumed[i][0] && at < consumed[i][1]) inside = true;
    }
    if (!inside) prices.push(Number(match[1]));
  }
  return prices.filter(price => Number.isFinite(price));
}

function representativePrice(proposed, evidence) {
  if (typeof evidence === "string") {
    const summed = evidence.match(/=\s*\$(\d+(?:\.\d+)?)/);
    if (summed) return Number(summed[1]);
  }
  const prices = extractPrices(evidence);
  if (!prices.length) return null;
  if (/split/i.test(proposed || "") && prices.length === 1) return prices[0] / 2;
  if (prices.length === 1) return prices[0];
  return (Math.min.apply(null, prices) + Math.max.apply(null, prices)) / 2;
}

/* Review cost notes sometimes name a band the database does not have
   ($10-$20, a $30-$100 band). Store the nearest real band, or leave the
   find's own valid cost when the note is unsure. */
function mapProposedCost(current, proposed, evidence) {
  const stored = filters.cost.indexOf(current) === -1 ? null : current;
  const text = typeof proposed === "string" ? proposed.trim() : "";
  if (!text || /^no change\b/i.test(text)) {
    return { cost: stored, unmapped: null };
  }
  if (filters.cost.indexOf(text) !== -1) {
    return { cost: text, unmapped: null };
  }
  if (/^(unconfirmed|unknown)\b/i.test(text)) {
    return {
      cost: stored,
      unmapped: { from: text, to: stored, detail: "review could not confirm a band" }
    };
  }
  const price = representativePrice(text, evidence);
  if (price != null) {
    const cost = closestCost(price);
    return {
      cost: cost,
      unmapped: {
        from: text,
        to: cost,
        detail: "closest band to $" + (Math.round(price * 100) / 100)
      }
    };
  }
  for (let i = 0; i < filters.cost.length; i++) {
    if (text.indexOf(filters.cost[i]) !== -1) {
      return {
        cost: filters.cost[i],
        unmapped: { from: text, to: filters.cost[i], detail: "review named this band inside a longer note" }
      };
    }
  }
  return {
    cost: stored,
    unmapped: { from: text, to: stored, detail: "no price and no known band" }
  };
}

function cleanList(values, vocab) {
  if (!Array.isArray(values)) return { values: [], dropped: values == null ? [] : [values] };
  const kept = [];
  const dropped = [];
  values.forEach(value => {
    if (vocab.indexOf(value) !== -1 && kept.indexOf(value) === -1) kept.push(value);
    else dropped.push(value);
  });
  return { values: kept, dropped: dropped };
}

function choiceOrNull(value, vocab) {
  if (vocab.indexOf(value) !== -1) return value;
  if (typeof value !== "string") return null;
  const lower = value.trim().toLowerCase();
  for (let i = 0; i < vocab.length; i++) {
    if (vocab[i].toLowerCase() === lower) return vocab[i];
  }
  return null;
}

function isReviewDrop(review) {
  if (!review || typeof review !== "object") return null;
  if (review.rejected === true || review.drop === true) return "rejected";
  const decision = review.decision || review.verdict;
  if (typeof decision === "string" && /reject|drop/i.test(decision)) return decision;
  const hold = review.hold;
  if (hold && typeof hold.status === "string" && /reject|drop/i.test(hold.status)) return hold.status;
  return null;
}

function knownGeoStatus(status) {
  if (status === "confident" || status === "area_based" || status === "route_unpinned" ||
      status === "flagged" || status === "pending") return status;
  return null;
}

function pushUnmapped(list, title, field, from, to, detail) {
  list.push({ title: title, field: field, from: from, to: to, detail: detail || null });
}

function resolveCity(find, review, pin, lat, lng, placePins) {
  if (pin) {
    const fromPin = singlePlace(pin.city);
    if (fromPin) return { city: fromPin, source: "hand_pin" };
  }
  if (review) {
    const fromReview = singlePlace(review.city);
    if (fromReview) return { city: fromReview, source: "review" };
  }
  const fromFind = singlePlace(find.city);
  if (fromFind) return { city: fromFind, source: "find" };
  const fromAddress = cityFromAddress(find.address);
  if (fromAddress) return { city: fromAddress, source: "address" };
  const fromCoords = cityFromCoords(lat, lng, placePins);
  if (fromCoords) return { city: fromCoords, source: "nearest_pin" };
  return { city: null, source: "missing" };
}

/* One find becomes one activities row. This is the only function that reads
   find fields. expires_at is the last valid day. occurrences is the schedule
   (specific dates, or a weekday range) and is null when the find has none. */
function scheduleFromFind(find, title, unmapped) {
  if (!find || !Object.prototype.hasOwnProperty.call(find, "occurrences")) return null;
  const parsed = occurrences.normalizeOccurrences(find.occurrences);
  if (!parsed.ok) {
    pushUnmapped(unmapped, title, "occurrences", find.occurrences, null, "not a date list or a weekday range");
    return null;
  }
  return parsed.value;
}

function buildRow(find, review, pin, placePins, unmapped, handPinsApplied) {
  const title = typeof find.title === "string" ? find.title.trim() : "";
  if (!title) return { error: "title" };

  const sourceUrl = typeof find.source_url === "string" ? find.source_url.trim() : "";
  if (!SOURCE_URL_RE.test(sourceUrl) || sourceUrl.length > SOURCE_URL_MAX) return { error: "source_url" };

  const category = choiceOrNull(find.category, filters.category);
  const setting = choiceOrNull(find.setting, filters.setting);
  const duration = choiceOrNull(find.duration, filters.duration);
  if (!category) return { error: "category" };
  if (!setting) return { error: "setting" };
  if (!duration) return { error: "duration" };

  let cost = choiceOrNull(find.cost, filters.cost);
  if (!cost) return { error: "cost" };
  if (review && review.cost_mapping) {
    const mapped = mapProposedCost(cost, review.cost_mapping.proposed, review.cost_mapping.evidence);
    if (!mapped.cost) return { error: "cost" };
    if (mapped.unmapped) {
      pushUnmapped(unmapped, title, "cost", mapped.unmapped.from, mapped.unmapped.to, mapped.unmapped.detail);
    }
    cost = mapped.cost;
  }

  const season = cleanList(find.season, filters.season);
  const time = cleanList(find.time, filters.time);
  const vibe = cleanList(find.vibe, filters.vibe);
  const stage = cleanList(find.stage, filters.stage);
  const dateType = cleanList(find.dateType, filters.dateType);
  [["season", season], ["time", time], ["vibe", vibe], ["stage", stage], ["dateType", dateType]].forEach(pair => {
    if (pair[1].dropped.length) {
      pushUnmapped(unmapped, title, pair[0], pair[1].dropped, pair[1].values, "dropped values outside the list");
    }
  });

  let lat = finiteCoord(find.lat, 90) ? find.lat : null;
  let lng = finiteCoord(find.lng, 180) ? find.lng : null;
  if (review && review.geo && finiteCoord(review.geo.lat, 90) && finiteCoord(review.geo.lng, 180)) {
    lat = review.geo.lat;
    lng = review.geo.lng;
  }

  let address = typeof find.address === "string" && find.address.trim() ? find.address.trim() : null;
  let geoStatus = null;
  let geoConfidence = null;
  let geoSource = null;
  let geoResolvedAt = null;

  if (pin) {
    const resolved = typeof pin.resolvedAt === "string" && DATE_RE.test(pin.resolvedAt) ? pin.resolvedAt : null;
    if (finiteCoord(pin.lat, 90) && finiteCoord(pin.lng, 180)) {
      lat = pin.lat;
      lng = pin.lng;
      if (typeof pin.address === "string" && pin.address.trim()) address = pin.address.trim();
      geoStatus = knownGeoStatus(pin.status) || "confident";
      geoConfidence = "manual";
      geoSource = "hand_pin";
      geoResolvedAt = resolved;
      handPinsApplied.push({ title: title, lat: lat, lng: lng, cleared: false });
    } else {
      lat = null;
      lng = null;
      geoStatus = knownGeoStatus(pin.status) || "area_based";
      geoConfidence = "low";
      geoSource = "hand_pin";
      geoResolvedAt = resolved;
      handPinsApplied.push({ title: title, lat: null, lng: null, cleared: true });
    }
  }

  const city = resolveCity(find, review, pin, lat, lng, placePins);

  let expiresAt = null;
  if (find.expires_at != null && find.expires_at !== "") {
    if (typeof find.expires_at === "string" && DATE_RE.test(find.expires_at)) expiresAt = find.expires_at;
    else pushUnmapped(unmapped, title, "expires_at", find.expires_at, null, "not a YYYY-MM-DD date");
  }
  const schedule = scheduleFromFind(find, title, unmapped);

  let age21 = false;
  if (typeof find.age21 === "boolean") age21 = find.age21;
  else if (find.age21 != null) pushUnmapped(unmapped, title, "age21", find.age21, false, "not a boolean");

  let food = false;
  if (typeof find.food === "boolean") food = find.food;
  else if (find.food != null) pushUnmapped(unmapped, title, "food", find.food, false, "not a boolean");

  const coordsLocked = !!(review && review.geo && review.geo.coords_locked === true);

  return {
    row: {
      title: title,
      description: typeof find.description === "string" ? find.description : "",
      category: category,
      icon: typeof find.icon === "string" ? find.icon : "",
      setting: setting,
      season: season.values,
      food: food,
      cost: cost,
      duration: duration,
      time: time.values,
      vibe: vibe.values,
      stage: stage.values,
      date_type: dateType.values,
      scene: null,
      motif: null,
      materials: [],
      age21: age21,
      status: "pending",
      source: "ai",
      tier: "free",
      address: address,
      city: city.city,
      city_source: city.source,
      source_url: sourceUrl,
      expires_at: expiresAt,
      occurrences: schedule,
      lat: lat,
      lng: lng,
      coords_locked: coordsLocked,
      geo_status: geoStatus,
      geo_confidence: geoConfidence,
      geo_source: geoSource,
      geo_resolved_at: geoResolvedAt,
      origin: "batch"
    }
  };
}

function holdLabel(review) {
  if (!review || !review.hold || typeof review.hold !== "object") return null;
  if (typeof review.hold.status === "string" && review.hold.status) return review.hold.status;
  if (review.hold.hold === true) return "hold";
  return null;
}

function planImport(input) {
  const finds = input.finds || [];
  const reviews = input.reviews || {};
  const pins = input.pins || [];
  const curated = input.curated || [];
  const existing = input.existing || [];
  const placePins = input.placePins || null;
  const dropped = input.dropped || new Map();

  const pinByTitle = new Map();
  pins.forEach(pin => {
    if (pin && pin.research_item) pinByTitle.set(normalizeTitle(pin.research_item), pin);
  });

  const occupied = curated.concat(existing);
  const rows = [];
  const skippedDuplicate = [];
  const skippedReview = [];
  const skippedInvalid = [];
  const unmapped = [];
  const handPinsApplied = [];
  const held = [];
  const citySources = { hand_pin: 0, review: 0, find: 0, address: 0, nearest_pin: 0, missing: 0 };

  finds.forEach(find => {
    const title = find && typeof find.title === "string" ? find.title.trim() : "";
    const review = title && reviews[title] ? reviews[title] : null;
    const droppedReason = title ? dropped.get(normalizeTitle(title)) : null;
    const reviewReason = isReviewDrop(review);
    if (droppedReason || reviewReason) {
      skippedReview.push({
        title: title || "(untitled)",
        reason: droppedReason || reviewReason
      });
      return;
    }

    const built = buildRow(find, review, pinByTitle.get(normalizeTitle(title)) || null, placePins, unmapped, handPinsApplied);
    if (!built.row) {
      skippedInvalid.push({ title: title || "(untitled)", field: built.error });
      return;
    }
    const dup = findDuplicate(built.row, occupied);
    if (dup) {
      skippedDuplicate.push({ title: built.row.title, matchedTitle: dup.title, reason: dup.reason, origin: dup.origin });
      return;
    }
    const label = holdLabel(review);
    if (label) held.push({ title: built.row.title, status: label });
    citySources[built.row.city_source] = (citySources[built.row.city_source] || 0) + 1;
    rows.push(built.row);
    occupied.push(built.row);
  });

  return {
    input: finds.length,
    rows: rows,
    skippedDuplicate: skippedDuplicate,
    skippedReview: skippedReview,
    skippedInvalid: skippedInvalid,
    unmapped: unmapped,
    handPinsApplied: handPinsApplied,
    held: held,
    citySources: citySources,
    coordsLocked: rows.filter(row => row.coords_locked).map(row => row.title)
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadIdeaPins(file) {
  const src = fs.readFileSync(file, "utf8");
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src + "\nglobalThis.__PINS = IDEA_PINS;", sandbox, { filename: file });
  if (!sandbox.__PINS || typeof sandbox.__PINS !== "object") throw new Error("IDEA_PINS missing in " + file);
  return sandbox.__PINS;
}

function collectDropped(reviewObjects) {
  const dropped = new Map();
  reviewObjects.forEach(review => {
    Object.keys(review).forEach(key => {
      if (!/^_dropped/i.test(key) && key.indexOf("dropped") === -1) return;
      const bucket = review[key];
      if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) return;
      Object.keys(bucket).forEach(title => {
        const reason = bucket[title];
        dropped.set(normalizeTitle(title), typeof reason === "string" ? reason : "dropped");
      });
    });
  });
  return dropped;
}

function loadDefaultInputs() {
  const findFiles = ["provo-finds-v1.json", "provo-finds-v2.json", "provo-finds-v3.json"];
  const reviewFiles = ["provo-finds-v1-review.json", "provo-finds-v2-review.json", "provo-finds-v3-review.json"];
  const finds = [];
  findFiles.forEach(name => {
    const batch = readJson(path.join(RESEARCH_DIR, name));
    if (!Array.isArray(batch)) throw new Error(name + " is not a list");
    batch.forEach(find => finds.push(find));
  });
  const reviewObjects = reviewFiles.map(name => readJson(path.join(RESEARCH_DIR, name)));
  const reviews = {};
  reviewObjects.forEach(review => {
    Object.keys(review).forEach(key => {
      if (key.charAt(0) === "_") return;
      reviews[key] = review[key];
    });
  });
  const pins = readJson(path.join(RESEARCH_DIR, "research-hand-pins.json"));
  const ideas = loadIdeas(IDEAS_FILE);
  const placePins = loadIdeaPins(PINS_FILE);
  const curated = ideas.map(idea => {
    const pin = placePins[String(idea.id)];
    return {
      title: idea.title,
      source_url: null,
      lat: pin && typeof pin.lat === "number" ? pin.lat : null,
      lng: pin && typeof pin.lng === "number" ? pin.lng : null,
      origin: "curated"
    };
  });
  return {
    finds: finds,
    reviews: reviews,
    pins: pins,
    curated: curated,
    placePins: placePins,
    dropped: collectDropped(reviewObjects),
    ideaCount: ideas.length
  };
}

function rowValues(row) {
  return [
    row.title,
    row.description,
    row.category,
    row.icon,
    row.setting,
    row.season,
    row.food,
    row.cost,
    row.duration,
    row.time,
    row.vibe,
    row.stage,
    row.date_type,
    row.scene,
    row.motif,
    row.materials,
    row.age21,
    row.address,
    row.city,
    row.source_url,
    row.expires_at,
    row.occurrences == null ? null : JSON.stringify(row.occurrences),
    row.lat,
    row.lng,
    row.coords_locked,
    row.geo_status,
    row.geo_confidence,
    row.geo_source,
    row.geo_resolved_at
  ];
}

function printPlan(plan, ideaCount) {
  console.log("Utah County research import");
  console.log("curated ideas compared: " + ideaCount);
  console.log("finds read: " + plan.input);
  console.log("rows to insert: " + plan.rows.length);
  console.log("skipped as duplicates: " + plan.skippedDuplicate.length);
  console.log("skipped by review: " + plan.skippedReview.length);
  console.log("skipped as invalid: " + plan.skippedInvalid.length);
  console.log("hand pins applied: " + plan.handPinsApplied.length);
  console.log("coordinates cleared by a hand pin: " + plan.handPinsApplied.filter(pin => pin.cleared).length);
  console.log("coords locked: " + plan.coordsLocked.length);
  console.log("review notes, still inserted as pending: " + plan.held.length);
  console.log("occurrences set: " + plan.rows.filter(function (row) { return row.occurrences != null; }).length);
  console.log("cities: " + JSON.stringify(plan.citySources));
  const examples = plan.skippedDuplicate.slice(0, 12);
  if (!examples.length) console.log("duplicate examples: none");
  examples.forEach(example => {
    console.log("duplicate: " + example.title + " — " + example.reason +
      (example.matchedTitle && example.matchedTitle !== example.title ? " (matched " + example.matchedTitle + ")" : "") +
      (example.origin ? " [" + example.origin + "]" : ""));
  });
  if (!plan.skippedReview.length) console.log("review skips: none");
  plan.skippedReview.forEach(skip => console.log("review skip: " + skip.title));
  plan.skippedInvalid.forEach(skip => console.log("invalid: " + skip.title + " (" + skip.field + ")"));
  if (!plan.unmapped.length) console.log("unmapped values: none");
  plan.unmapped.forEach(item => {
    console.log("unmapped " + item.field + ": " + item.title +
      " — " + JSON.stringify(item.from) + " stored as " + JSON.stringify(item.to) +
      (item.detail ? " (" + item.detail + ")" : ""));
  });
  const derived = plan.rows.filter(row => row.city_source === "nearest_pin" || row.city_source === "missing");
  derived.forEach(row => {
    console.log("city " + row.city_source + ": " + row.title + (row.city ? " → " + row.city : ""));
  });
}

async function loadExisting(connectionString) {
  const pool = new Pool(poolConfig(connectionString));
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const result = await client.query(
      "select title, source_url, source, " +
      "ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng " +
      "from activities"
    );
    await client.query("ROLLBACK");
    return result.rows.map(row => ({
      title: row.title,
      source_url: row.source_url,
      lat: row.lat == null ? null : Number(row.lat),
      lng: row.lng == null ? null : Number(row.lng),
      origin: row.source === "curated" ? "curated" : "existing"
    }));
  } finally {
    client.release();
    await pool.end();
  }
}

async function assertSchema(client) {
  const column = await client.query(
    "select column_name from information_schema.columns " +
    "where table_schema = 'public' and table_name = 'activities' " +
    "and column_name in ('expires_at', 'occurrences')"
  );
  const names = {};
  column.rows.forEach(function (row) { names[row.column_name] = true; });
  if (!names.expires_at || !names.occurrences) {
    const err = new Error("activities.expires_at or occurrences is missing; run npm run db:migrate first");
    err.code = "schema_not_ready";
    throw err;
  }
  const index = await client.query(
    "select 1 from pg_indexes where schemaname = 'public' and indexname = 'activities_ai_natural_key'"
  );
  if (!index.rowCount) {
    const err = new Error("activities_ai_natural_key is missing; run npm run db:migrate first");
    err.code = "schema_not_ready";
    throw err;
  }
}

async function writePlan(plan, connectionString) {
  const pool = new Pool(poolConfig(connectionString));
  const client = await pool.connect();
  let inserted = 0;
  let alreadyThere = 0;
  try {
    await assertSchema(client);
    await client.query("BEGIN");
    for (let i = 0; i < plan.rows.length; i++) {
      const result = await client.query(INSERT_SQL, rowValues(plan.rows[i]));
      if (result.rowCount) inserted += 1;
      else alreadyThere += 1;
    }
    await client.query("COMMIT");
    console.log("inserted: " + inserted);
    console.log("already present (not inserted again): " + alreadyThere);
    return { inserted: inserted, alreadyThere: alreadyThere };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (rollbackErr) { /* already aborted */ }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const dryRun = process.argv.indexOf("--dry-run") !== -1;
  const fileOnly = process.argv.indexOf("--file-only") !== -1;
  const inputs = loadDefaultInputs();
  let existing = [];
  const connectionString = process.env.DATABASE_URL;
  if (connectionString && !fileOnly) {
    existing = await loadExisting(connectionString);
  }
  const plan = planImport(Object.assign({}, inputs, { existing: existing }));
  printPlan(plan, inputs.ideaCount);
  if (existing.length) console.log("existing database rows compared: " + existing.length);
  else if (dryRun) console.log("no database read; counts are against the curated ideas file only");
  if (dryRun) return { dryRun: true, plan: plan };
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    return { missing: true, plan: plan };
  }
  const written = await writePlan(plan, connectionString);
  return { dryRun: false, plan: plan, written: written };
}

if (require.main === module) {
  main().then(result => {
    if (result && result.missing) process.exit(1);
  }).catch(err => {
    if (err && (err.code === "schema_not_ready" || err.code === "invalid_ideas")) console.error(err.message);
    else console.error("import failed:", err.code || "error");
    process.exit(1);
  });
}

module.exports = {
  PROXIMITY_MILES,
  INSERT_SQL,
  SOURCE_URL_RE,
  normalizeTitle,
  normalizeSourceUrl,
  closestCost,
  mapProposedCost,
  cityFromAddress,
  singlePlace,
  findDuplicate,
  planImport,
  loadDefaultInputs,
  rowValues,
  main
};
