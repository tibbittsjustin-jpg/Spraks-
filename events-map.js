/* ===================== Spark events-map.js =====================
 * Translates one Ticketmaster Discovery API event into a Spark idea card.
 *
 * Deliberately table-driven rather than AI-driven. Ticketmaster's taxonomy is
 * a small, stable, closed set (five segments, a few dozen genres), so a lookup
 * is free, instant, deterministic and debuggable — when a mapping feels wrong
 * you fix one line instead of tuning a prompt. Claude is worth spending on
 * blurb copy, not on classification.
 *
 * Two layers:
 *   1. Derived facts — time of day, season, price band, distance. These come
 *      straight off the event's own fields and are never guessed.
 *   2. Judgement calls — vibe, date stage, group-friendliness, rough length.
 *      These come from CLASSIFICATION_MAP, keyed on segment and genre.
 *
 * Pure functions only: no network, no keys, no clock beyond what's passed in.
 * That keeps the whole thing testable without touching Ticketmaster.
 * ============================================================ */

"use strict";

/* ---------- Spark's own vocabularies ----------
 * These MUST stay in step with FILTER_DEFS in app.js. assertVocabulary() below
 * checks every table entry against them at load time, so a typo like "Chil"
 * fails loudly at startup instead of quietly producing a card that no filter
 * can ever match. */
const SPARK = {
  duration: ["Quick (under 1 hr)", "Short (1-2 hrs)", "Half-day (2-5 hrs)", "Full day", "Overnight"],
  cost: ["Free", "$1-$10", "$20-$30", "$100 and under"],
  time: ["Morning", "Afternoon", "Evening", "Night"],
  setting: ["Indoor", "Outdoor", "Both"],
  vibe: ["Chill", "Romantic", "Active", "Adventurous", "Creative", "Silly", "Cozy", "Spontaneous"],
  season: ["Spring", "Summer", "Fall", "Winter"],
  stage: ["First Date", "Second/Third Date", "Serious Relationship"],
  dateType: ["Solo/Couple", "Double Date", "Group Date"],
  scene: ["mountains", "forest", "water", "snow", "park", "field", "city", "citynight",
          "stage", "cinema", "kitchen", "indoor", "sunset", "confetti"]
};

const ALL_STAGES = SPARK.stage.slice();
const NOT_A_FIRST_DATE = ["Second/Third Date", "Serious Relationship"];
const ANY_GROUP = SPARK.dateType.slice();
const JUST_THE_TWO = ["Solo/Couple", "Double Date"];

/* ============================================================
 * Layer 1 — facts derived from the event's own fields
 * ============================================================ */

/* Ticketmaster gives local wall-clock time as "HH:MM:SS". Bands match the
 * Time of Day filter. Events with no start time are nearly always multi-day
 * festivals or all-day listings, so those are treated as spanning the daytime
 * rather than being assigned a single band we'd be inventing. */
function timeOfDayFor(localTime) {
  if (!localTime || typeof localTime !== "string") return ["Morning", "Afternoon", "Evening"];
  const hour = parseInt(localTime.slice(0, 2), 10);
  if (isNaN(hour)) return ["Morning", "Afternoon", "Evening"];
  if (hour >= 5 && hour < 12) return ["Morning"];
  if (hour >= 12 && hour < 17) return ["Afternoon"];
  if (hour >= 17 && hour < 21) return ["Evening"];
  return ["Night"];
}

/* An event happens on one date, so unlike the evergreen built-in ideas it gets
 * exactly one season — a real statement rather than a catch-all. */
function seasonFor(localDate) {
  if (!localDate || typeof localDate !== "string") return SPARK.season.slice();
  const month = parseInt(localDate.slice(5, 7), 10);
  if (month >= 3 && month <= 5) return ["Spring"];
  if (month >= 6 && month <= 8) return ["Summer"];
  if (month >= 9 && month <= 11) return ["Fall"];
  if (month === 12 || month === 1 || month === 2) return ["Winter"];
  return SPARK.season.slice();
}

/* Spark's budget bands were written for evergreen ideas and don't tile the
 * number line: there's a gap between $10 and $20, and nothing at all above
 * $100. Rather than file a $250 arena show under "$100 and under" — which
 * would be a straightforward lie to anyone filtering on budget — anything
 * above the top band returns null, meaning "no honest band for this". Callers
 * should show priceText instead. See the note in README-EVENTS.md: adding a
 * "$100+" band to FILTER_DEFS is the real fix. */
function costBandForPrice(min) {
  if (typeof min !== "number" || isNaN(min) || min < 0) return null;
  if (min === 0) return "Free";
  if (min <= 10) return "$1-$10";
  if (min <= 30) return "$20-$30";
  if (min <= 100) return "$100 and under";
  return null;
}

/* Ticketmaster omits priceRanges on a large share of listings (resale,
 * sold-out, and most non-ticketed community events), so "unknown" is a normal
 * outcome here and not an error. */
function priceInfoFor(priceRanges) {
  if (!Array.isArray(priceRanges) || !priceRanges.length) {
    return { min: null, max: null, currency: null, band: null, text: "Price not listed" };
  }
  let min = Infinity, max = -Infinity, currency = null;
  priceRanges.forEach(function (p) {
    if (typeof p.min === "number" && p.min < min) min = p.min;
    if (typeof p.max === "number" && p.max > max) max = p.max;
    if (!currency && p.currency) currency = p.currency;
  });
  if (min === Infinity) {
    return { min: null, max: null, currency: currency, band: null, text: "Price not listed" };
  }
  if (max === -Infinity) max = min;
  const sym = currency === "USD" || !currency ? "$" : currency + " ";
  const round = function (n) { return Number.isInteger(n) ? String(n) : n.toFixed(2); };
  const text = min === 0 && max === 0 ? "Free"
    : min === max ? sym + round(min)
    : sym + round(min) + "–" + sym + round(max);
  return { min: min, max: max, currency: currency || "USD", band: costBandForPrice(min), text: text };
}

const EARTH_RADIUS_MILES = 3958.8;

function haversineMiles(lat1, lng1, lat2, lng2) {
  const nums = [lat1, lng1, lat2, lng2];
  if (nums.some(function (n) { return typeof n !== "number" || isNaN(n); })) return null;
  const toRad = function (d) { return d * Math.PI / 180; };
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ============================================================
 * Layer 2 — the classification table
 * ============================================================
 * Keyed "Segment" for a whole segment, "Segment/Genre" for a specific genre;
 * the more specific key wins. Genre names are Ticketmaster's own spellings.
 *
 * The judgement worth explaining is `stage`: a first date benefits from being
 * able to hear each other talk, so deafening genres drop "First Date" while
 * comedy, theatre and jazz keep it. That's the whole editorial opinion encoded
 * here — everything else is fairly mechanical.
 */
function row(vibe, opts) {
  opts = opts || {};
  return {
    vibe: vibe,
    stage: opts.stage || ALL_STAGES,
    dateType: opts.dateType || ANY_GROUP,
    duration: opts.duration || "Short (1-2 hrs)",
    setting: opts.setting || "Both",
    scene: opts.scene || "stage",
    motif: opts.motif || "concert",
    icon: opts.icon || "music"
  };
}

const CLASSIFICATION_MAP = {
  /* ---- Music ---- */
  "Music": row(["Active", "Chill"], { motif: "concert" }),
  "Music/Rock": row(["Active", "Spontaneous"], { motif: "guitar" }),
  "Music/Alternative": row(["Active", "Chill"], { motif: "guitar" }),
  "Music/Pop": row(["Active", "Silly"], { motif: "concert" }),
  "Music/Country": row(["Active", "Chill"], { motif: "guitar" }),
  "Music/Folk": row(["Chill", "Cozy"], { motif: "guitar" }),
  "Music/Hip-Hop/Rap": row(["Active", "Adventurous"], { stage: NOT_A_FIRST_DATE, motif: "concert" }),
  "Music/R&B": row(["Romantic", "Chill"], { motif: "concert" }),
  "Music/Jazz": row(["Romantic", "Chill"], { motif: "piano", scene: "citynight", icon: "music" }),
  "Music/Blues": row(["Chill", "Cozy"], { motif: "guitar", scene: "citynight" }),
  "Music/Classical": row(["Romantic", "Chill"], { motif: "piano", setting: "Indoor" }),
  "Music/Dance/Electronic": row(["Active", "Adventurous"], { stage: NOT_A_FIRST_DATE, motif: "discoball", scene: "citynight" }),
  "Music/Metal": row(["Active", "Adventurous"], { stage: NOT_A_FIRST_DATE, motif: "guitar" }),
  "Music/Reggae": row(["Chill", "Silly"], { motif: "guitar" }),
  "Music/Latin": row(["Romantic", "Active"], { motif: "dancing" }),
  "Music/World": row(["Creative", "Chill"], { motif: "dancing" }),
  "Music/Religious": row(["Chill", "Cozy"], { motif: "concert" }),
  "Music/Holiday": row(["Cozy", "Romantic"], { motif: "concert", season: ["Winter"] }),

  /* ---- Sports ---- */
  "Sports": row(["Active", "Silly"], { duration: "Half-day (2-5 hrs)", scene: "field", motif: "trophy", icon: "activity" }),
  "Sports/Basketball": row(["Active", "Silly"], { duration: "Half-day (2-5 hrs)", scene: "field", motif: "basketball", setting: "Indoor", icon: "activity" }),
  "Sports/Football": row(["Active", "Silly"], { duration: "Half-day (2-5 hrs)", scene: "field", motif: "trophy", icon: "activity" }),
  "Sports/Baseball": row(["Chill", "Silly"], { duration: "Half-day (2-5 hrs)", scene: "field", motif: "baseball", setting: "Outdoor", icon: "activity" }),
  "Sports/Hockey": row(["Active", "Adventurous"], { duration: "Half-day (2-5 hrs)", scene: "field", motif: "iceskates", setting: "Indoor", icon: "activity" }),
  "Sports/Soccer": row(["Active", "Silly"], { duration: "Half-day (2-5 hrs)", scene: "field", motif: "soccer", setting: "Outdoor", icon: "activity" }),
  "Sports/Tennis": row(["Active", "Chill"], { duration: "Half-day (2-5 hrs)", scene: "field", motif: "tennis", icon: "activity" }),
  "Sports/Golf": row(["Chill", "Active"], { duration: "Full day", scene: "field", motif: "golf", setting: "Outdoor", icon: "activity" }),
  "Sports/Motorsports/Racing": row(["Adventurous", "Active"], { duration: "Half-day (2-5 hrs)", scene: "field", motif: "trophy", setting: "Outdoor", icon: "activity" }),
  "Sports/Wrestling": row(["Adventurous", "Silly"], { stage: NOT_A_FIRST_DATE, duration: "Half-day (2-5 hrs)", scene: "field", motif: "trophy", icon: "activity" }),
  "Sports/Boxing": row(["Adventurous", "Active"], { stage: NOT_A_FIRST_DATE, duration: "Half-day (2-5 hrs)", scene: "field", motif: "trophy", icon: "activity" }),
  "Sports/Rodeo": row(["Adventurous", "Silly"], { duration: "Half-day (2-5 hrs)", scene: "field", motif: "horse", setting: "Outdoor", icon: "activity" }),

  /* ---- Arts & Theatre ---- */
  "Arts & Theatre": row(["Creative", "Chill"], { setting: "Indoor", motif: "concert", icon: "palette" }),
  "Arts & Theatre/Theatre": row(["Creative", "Romantic"], { setting: "Indoor", motif: "concert", icon: "palette" }),
  "Arts & Theatre/Comedy": row(["Silly", "Chill"], { setting: "Indoor", motif: "karaoke", icon: "smile" }),
  "Arts & Theatre/Dance": row(["Creative", "Romantic"], { setting: "Indoor", motif: "dancing", icon: "palette" }),
  "Arts & Theatre/Opera": row(["Romantic", "Creative"], { setting: "Indoor", motif: "piano", icon: "palette" }),
  "Arts & Theatre/Classical": row(["Romantic", "Chill"], { setting: "Indoor", motif: "piano", icon: "music" }),
  "Arts & Theatre/Magic & Illusion": row(["Silly", "Creative"], { setting: "Indoor", motif: "costume", icon: "smile" }),
  "Arts & Theatre/Circus & Specialty Acts": row(["Silly", "Creative"], { setting: "Indoor", motif: "costume", scene: "confetti", icon: "smile" }),
  "Arts & Theatre/Cultural": row(["Creative", "Chill"], { motif: "museum", scene: "city", icon: "landmark" }),
  "Arts & Theatre/Fine Art": row(["Creative", "Chill"], { setting: "Indoor", motif: "painting", scene: "indoor", icon: "palette" }),
  "Arts & Theatre/Children's Theatre": row(["Silly", "Creative"], { setting: "Indoor", motif: "costume", scene: "confetti", icon: "smile" }),
  "Arts & Theatre/Family": row(["Silly", "Chill"], { setting: "Indoor", motif: "costume", scene: "confetti", icon: "smile" }),
  "Arts & Theatre/Spectacular": row(["Creative", "Adventurous"], { setting: "Indoor", motif: "costume", scene: "confetti", icon: "palette" }),

  /* ---- Film ---- */
  "Film": row(["Cozy", "Chill"], { setting: "Indoor", scene: "cinema", motif: "movie", icon: "film" }),
  "Film/Film Festivals": row(["Creative", "Chill"], { duration: "Half-day (2-5 hrs)", setting: "Indoor", scene: "cinema", motif: "popcorn", icon: "film" }),
  "Film/Movie Screenings": row(["Cozy", "Romantic"], { setting: "Indoor", scene: "cinema", motif: "movie", icon: "film" }),

  /* ---- Miscellaneous ----
   * This is where Ticketmaster keeps the closest thing it has to the local
   * fairs and community events Spark eventually wants. Coverage is thin
   * compared with concerts, but it isn't empty, so it's mapped properly. */
  "Miscellaneous": row(["Spontaneous", "Chill"], { scene: "city", motif: "market", icon: "map-pin" }),
  "Miscellaneous/Fairs & Festivals": row(["Adventurous", "Silly", "Spontaneous"], {
    duration: "Full day", setting: "Outdoor", scene: "confetti", motif: "ferriswheel", icon: "star" }),
  "Miscellaneous/Community/Civic": row(["Chill", "Spontaneous"], {
    duration: "Half-day (2-5 hrs)", scene: "city", motif: "market", icon: "map-pin" }),
  "Miscellaneous/Family": row(["Silly", "Chill"], { scene: "confetti", motif: "partypopper", icon: "smile" }),
  "Miscellaneous/Holiday": row(["Cozy", "Silly"], { scene: "confetti", motif: "fireworks", icon: "star" }),
  "Miscellaneous/Health/Wellness": row(["Chill", "Active"], { motif: "yoga", scene: "park", icon: "activity" }),
  "Miscellaneous/Lecture/Seminar": row(["Creative", "Chill"], { setting: "Indoor", scene: "indoor", motif: "books", icon: "book-open" }),
  "Miscellaneous/Casino/Gaming": row(["Adventurous", "Spontaneous"], {
    stage: NOT_A_FIRST_DATE, dateType: JUST_THE_TWO, setting: "Indoor", scene: "citynight", motif: "dice", icon: "star" }),
  "Miscellaneous/Sport & Fitness": row(["Active", "Adventurous"], { scene: "park", motif: "gym", icon: "activity" })
};

const FALLBACK = row(["Spontaneous", "Chill"], { scene: "city", motif: "market", icon: "map-pin" });

/* Most specific key wins: "Music/Jazz" before "Music" before the fallback. */
function classify(segmentName, genreName) {
  if (segmentName && genreName) {
    const specific = CLASSIFICATION_MAP[segmentName + "/" + genreName];
    if (specific) return specific;
  }
  if (segmentName && CLASSIFICATION_MAP[segmentName]) return CLASSIFICATION_MAP[segmentName];
  return FALLBACK;
}

/* ============================================================
 * Assembling the card
 * ============================================================ */

function firstClassification(ev) {
  const list = Array.isArray(ev.classifications) ? ev.classifications : [];
  // Ticketmaster marks one classification primary when an event carries more
  // than one; fall back to the first if none is flagged.
  const primary = list.find(function (c) { return c && c.primary; }) || list[0] || {};
  return {
    segment: primary.segment && primary.segment.name ? primary.segment.name : null,
    genre: primary.genre && primary.genre.name ? primary.genre.name : null,
    subGenre: primary.subGenre && primary.subGenre.name ? primary.subGenre.name : null,
    family: !!primary.family
  };
}

function pickVenue(ev) {
  const venues = ev._embedded && Array.isArray(ev._embedded.venues) ? ev._embedded.venues : [];
  const v = venues[0];
  if (!v) return null;
  const city = v.city && v.city.name ? v.city.name : "";
  const stateCode = v.state && v.state.stateCode ? v.state.stateCode : "";
  return {
    name: v.name || "",
    city: city,
    state: stateCode,
    address: v.address && v.address.line1 ? v.address.line1 : "",
    postalCode: v.postalCode || "",
    lat: v.location && v.location.latitude != null ? parseFloat(v.location.latitude) : null,
    lng: v.location && v.location.longitude != null ? parseFloat(v.location.longitude) : null,
    label: [v.name, [city, stateCode].filter(Boolean).join(", ")].filter(Boolean).join(" · ")
  };
}

/* Widest 16:9 image, which is the shape the Spark card and detail hero want. */
function pickImage(ev) {
  const imgs = Array.isArray(ev.images) ? ev.images : [];
  const wide = imgs.filter(function (i) { return i.ratio === "16_9" && i.url; });
  const pool = wide.length ? wide : imgs.filter(function (i) { return i.url; });
  if (!pool.length) return null;
  return pool.slice().sort(function (a, b) { return (b.width || 0) - (a.width || 0); })[0].url;
}

function formatEventDate(localDate, localTime) {
  if (!localDate) return "Date TBA";
  const parts = localDate.split("-");
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(d.getTime())) return "Date TBA";
  const out = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  if (!localTime) return out;
  const hour = parseInt(localTime.slice(0, 2), 10);
  const min = localTime.slice(3, 5);
  if (isNaN(hour)) return out;
  const ampm = hour >= 12 ? "pm" : "am";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return out + " · " + h12 + (min === "00" ? "" : ":" + min) + ampm;
}

/* Turns one Ticketmaster event into a Spark-shaped idea. Returns null for
 * anything unusable — cancelled shows, or listings with no name or date —
 * so callers can filter without special-casing.
 *
 * `origin` is {lat, lng} when known, used only to compute distance. */
function mapEvent(ev, origin) {
  if (!ev || !ev.id || !ev.name) return null;

  const dates = ev.dates || {};
  const start = dates.start || {};
  const statusCode = dates.status && dates.status.code ? dates.status.code : "";
  if (statusCode === "cancelled" || statusCode === "canceled") return null;
  if (!start.localDate) return null;

  const cls = firstClassification(ev);
  const shape = classify(cls.segment, cls.genre);
  const venue = pickVenue(ev);
  const price = priceInfoFor(ev.priceRanges);
  const distance = origin && venue
    ? haversineMiles(origin.lat, origin.lng, venue.lat, venue.lng)
    : null;

  return {
    // --- identity -------------------------------------------------------
    eventId: ev.id,
    stableKey: "tm:" + ev.id,

    // --- what it is -----------------------------------------------------
    title: ev.name,
    category: "Local Event",
    segment: cls.segment,
    genre: cls.genre,
    subGenre: cls.subGenre,

    // --- when -----------------------------------------------------------
    localDate: start.localDate,
    localTime: start.localTime || null,
    startsAt: start.dateTime || null,          // UTC instant, for sorting
    dateLabel: formatEventDate(start.localDate, start.localTime),
    status: statusCode || "onsale",

    // --- where ----------------------------------------------------------
    venue: venue,
    distanceMiles: distance == null ? null : Math.round(distance * 10) / 10,

    // --- cost -----------------------------------------------------------
    priceMin: price.min,
    priceMax: price.max,
    priceText: price.text,
    cost: price.band,                          // null when no honest band fits

    // --- Spark filter dimensions ----------------------------------------
    duration: shape.duration,
    setting: shape.setting,
    time: timeOfDayFor(start.localTime),
    season: seasonFor(start.localDate),
    vibe: shape.vibe.slice(),
    stage: shape.stage.slice(),
    dateType: shape.dateType.slice(),
    food: false,

    // --- presentation ---------------------------------------------------
    scene: shape.scene,
    motif: shape.motif,
    icon: shape.icon,
    imageUrl: pickImage(ev),

    // --- attribution (Ticketmaster's terms require linking back) ---------
    ticketUrl: ev.url || null,
    source: "ticketmaster"
  };
}

/* ============================================================
 * Load-time self-check
 * ============================================================ */

function assertVocabulary() {
  const problems = [];
  const check = function (key, values, dim) {
    values.forEach(function (v) {
      if (SPARK[dim].indexOf(v) === -1) problems.push(key + ": " + dim + ' "' + v + '" is not a Spark ' + dim);
    });
  };
  Object.keys(CLASSIFICATION_MAP).concat(["<fallback>"]).forEach(function (key) {
    const r = key === "<fallback>" ? FALLBACK : CLASSIFICATION_MAP[key];
    check(key, r.vibe, "vibe");
    check(key, r.stage, "stage");
    check(key, r.dateType, "dateType");
    check(key, [r.duration], "duration");
    check(key, [r.setting], "setting");
    check(key, [r.scene], "scene");
  });
  if (problems.length) {
    throw new Error("events-map.js classification table is invalid:\n  " + problems.join("\n  "));
  }
}
assertVocabulary();

module.exports = {
  SPARK: SPARK,
  CLASSIFICATION_MAP: CLASSIFICATION_MAP,
  classify: classify,
  timeOfDayFor: timeOfDayFor,
  seasonFor: seasonFor,
  costBandForPrice: costBandForPrice,
  priceInfoFor: priceInfoFor,
  haversineMiles: haversineMiles,
  formatEventDate: formatEventDate,
  mapEvent: mapEvent,
  assertVocabulary: assertVocabulary
};
