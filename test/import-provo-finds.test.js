/* Research import mapping, hand pins, dedupe, and idempotency.
   No database. The real find files and the curated catalog are read from disk. */
"use strict";

const {
  INSERT_SQL,
  PROXIMITY_MILES,
  normalizeTitle,
  closestCost,
  mapProposedCost,
  cityFromAddress,
  singlePlace,
  findDuplicate,
  planImport,
  loadDefaultInputs
} = require("../db/import-provo-finds");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
function section(title, fn) {
  console.log("\n" + title);
  try { fn(); }
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 400)); }
}

function find(extra) {
  return Object.assign({
    title: "Sample Find",
    description: "A real place to try together.",
    category: "Hiking & Nature",
    setting: "Outdoor",
    season: ["Spring"],
    cost: "Free",
    duration: "Short (1-2 hrs)",
    time: ["Afternoon"],
    vibe: ["Chill"],
    stage: ["First Date"],
    dateType: ["Solo/Couple"],
    food: false,
    age21: false,
    address: "1 N University Ave, Provo, UT 84601",
    lat: 40.23,
    lng: -111.66,
    source_url: "https://example.com/sample",
    expires_at: null,
    status: "pending",
    localId: "device-should-not-be-stored",
    deviceId: "phone-should-not-be-stored"
  }, extra || {});
}

const inputs = loadDefaultInputs();
const plan = planImport(inputs);

section("cost bands", () => {
  check("11.99 is closer to $1-$10 than to $20-$30", closestCost(11.99) === "$1-$10");
  check("16 is closer to $20-$30", closestCost(16) === "$20-$30");
  check("a tie above $10 uses the higher band", closestCost(15) === "$20-$30");
  check("40 stays in $100 and under", closestCost(40) === "$100 and under");
  check("an exact enum is kept",
    mapProposedCost("$20-$30", "Over $100", "$124").cost === "Over $100" &&
    mapProposedCost("$20-$30", "Over $100", "$124").unmapped == null);
  check("no change keeps the find cost",
    mapProposedCost("$20-$30", "no change (a $30–$100 band would fit)", "").cost === "$20-$30");
  const unsure = mapProposedCost("$100 and under", "unknown; possibly Over $100", "price TBA");
  check("an unknown note leaves the valid cost and is reported",
    unsure.cost === "$100 and under" && unsure.unmapped && unsure.unmapped.from.indexOf("unknown") === 0);
});

section("city labels", () => {
  check("a street address yields the city", cityFromAddress("283 N University Ave, Provo, UT 84601") === "Provo");
  check("a county is not a city", cityFromAddress("US-6 pullout near Thistle, Utah County, UT") == null);
  check("a parenthetical city list is not one city",
    singlePlace("Utah County (American Fork, Lehi, Lindon, Pleasant Grove, Springville)") == null);
  check("a resort note keeps the city before the parenthesis",
    singlePlace("Provo (Provo Canyon, Vivian Park/Riverbend)") === "Provo");
  check("a canyon parenthesis keeps the place inside",
    singlePlace("Spanish Fork Canyon (Thistle)") === "Thistle");
});

section("dedupe rules", () => {
  const curated = {
    title: "Hike to the Y",
    source_url: null,
    lat: 40.25,
    lng: -111.65,
    origin: "curated"
  };
  const near = find({
    title: "Hike to the Y",
    lat: 40.2502,
    lng: -111.6502,
    source_url: "https://example.com/y"
  });
  const far = find({
    title: "Hike to the Y",
    lat: 37.1,
    lng: -113.5,
    source_url: "https://example.com/other-y"
  });
  const samePage = find({
    title: "Hike to the Y!",
    lat: 37.1,
    lng: -113.5,
    source_url: "https://www.example.com/y/"
  });
  const otherTitle = find({
    title: "Picnic at the Y Trailhead",
    lat: 40.2502,
    lng: -111.6502,
    source_url: "https://example.com/y"
  });
  check("same title nearby is a duplicate", !!findDuplicate(near, [curated]));
  check("same title far away with a different page is kept", findDuplicate(far, [curated]) == null);
  check("same title and the same page is a duplicate even when far", !!findDuplicate(samePage, [near]));
  check("a different title on the same page is not a duplicate", findDuplicate(otherTitle, [near]) == null);
  check("normalization ignores punctuation and case",
    normalizeTitle("Hike to the Y!") === normalizeTitle("hike to the y"));
  check("proximity window is half a mile", PROXIMITY_MILES === 0.5);
});

section("mapping, hand pins, and idempotency on fixtures", () => {
  const finds = [
    find({
      title: "Locked Ride",
      lat: 40.1,
      lng: -111.5,
      source_url: "https://example.com/ride",
      cost: "$20-$30"
    }),
    find({
      title: "Unlocked Pin",
      lat: 40.3,
      lng: -111.7,
      source_url: "https://example.com/pin",
      address: "1 Main St, Orem, UT 84057"
    }),
    find({
      title: "No Fixed Launch",
      lat: 40.376806,
      lng: -111.795915,
      source_url: "https://example.com/balloon",
      address: "Launch site set at booking (American Fork area), UT",
      city: "Should Not Win"
    }),
    find({
      title: "Rejected Idea",
      source_url: "https://example.com/nope"
    }),
    find({ title: "Held Idea", source_url: "https://example.com/hold", expires_at: "2026-12-09" })
  ];
  const reviews = {
    "Locked Ride": {
      geo: { lat: 40.11, lng: -111.51, coords_locked: true },
      cost_mapping: { current: "$20-$30", proposed: "$10-$20", evidence: "Fall special $11.99." }
    },
    "Unlocked Pin": { geo: { coords_locked: false }, city: "Orem" },
    "No Fixed Launch": { geo: { lat: 40.376806, lng: -111.795915, coords_locked: false }, city: "American Fork" },
    "Rejected Idea": { decision: "rejected" },
    "Held Idea": { hold: { status: "hold", note: "wait until spring" } }
  };
  const pins = [
    { research_item: "Locked Ride", lat: 40.163866, lng: -111.50108, city: "Springville", locked: true, status: "confident", address: "Junction, Springville, UT", resolvedAt: "2026-10-29" },
    { research_item: "Unlocked Pin", lat: 40.36245, lng: -111.7487, city: "Pleasant Grove", locked: true, status: "confident", resolvedAt: "2026-10-29" },
    { research_item: "No Fixed Launch", lat: null, lng: null, city: "Utah County (American Fork, Lehi)", locked: true, status: "area_based", resolvedAt: "2026-10-29" }
  ];
  const dropped = new Map();
  const first = planImport({ finds: finds, reviews: reviews, pins: pins, curated: [], dropped: dropped, placePins: null });
  const byTitle = {};
  first.rows.forEach(row => { byTitle[row.title] = row; });

  check("rejected review is skipped",
    first.skippedReview.length === 1 && first.skippedReview[0].title === "Rejected Idea");
  check("a hold is still inserted", !!byTitle["Held Idea"] && byTitle["Held Idea"].expires_at === "2026-12-09");
  const ride = byTitle["Locked Ride"];
  check("hand pin replaces research coordinates",
    ride && ride.lat === 40.163866 && ride.lng === -111.50108);
  check("coords_locked follows the review, and the hand pin city is used",
    ride && ride.coords_locked === true && ride.city === "Springville" && ride.address.indexOf("Junction") === 0);
  check("$10-$20 maps to the closest real band", ride && ride.cost === "$1-$10");
  const unlocked = byTitle["Unlocked Pin"];
  check("a hand pin can move the point without locking it",
    unlocked && unlocked.lat === 40.36245 && unlocked.lng === -111.7487 && unlocked.coords_locked === false &&
    unlocked.city === "Pleasant Grove");
  const balloon = byTitle["No Fixed Launch"];
  check("a hand pin with no coordinates clears the research centroid",
    balloon && balloon.lat == null && balloon.lng == null && balloon.coords_locked === false &&
    balloon.city === "American Fork" && balloon.geo_status === "area_based");
  check("every fixture row is pending AI with the find's page",
    first.rows.every(row => row.status === "pending" && row.source === "ai" && row.source_url.indexOf("https://") === 0));
  check("device ids are not fields on the row",
    first.rows.every(row => !Object.prototype.hasOwnProperty.call(row, "localId") &&
      !Object.prototype.hasOwnProperty.call(row, "deviceId") &&
      JSON.stringify(row).indexOf("device-should-not-be-stored") === -1 &&
      JSON.stringify(row).indexOf("phone-should-not-be-stored") === -1));

  const second = planImport({
    finds: finds,
    reviews: reviews,
    pins: pins,
    curated: [],
    dropped: dropped,
    placePins: null,
    existing: first.rows.map(row => Object.assign({}, row, { origin: "existing" }))
  });
  check("planning again inserts nothing",
    second.rows.length === 0 && second.skippedDuplicate.length === first.rows.length,
    "rows " + second.rows.length + " skips " + second.skippedDuplicate.length);
});

section("the 134 Utah County finds", () => {
  check("three files are 134 finds", inputs.finds.length === 134, String(inputs.finds.length));
  check("curated catalog is 1994 ideas", inputs.ideaCount === 1994, String(inputs.ideaCount));
  check("no find is skipped by review", plan.skippedReview.length === 0, JSON.stringify(plan.skippedReview.slice(0, 3)));
  check("no find is invalid", plan.skippedInvalid.length === 0, JSON.stringify(plan.skippedInvalid));
  check("no find duplicates a curated title or another find",
    plan.skippedDuplicate.length === 0, JSON.stringify(plan.skippedDuplicate.slice(0, 5)));
  check("every kept row is pending, from AI, and has a source page",
    plan.rows.length === 134 && plan.rows.every(row =>
      row.status === "pending" && row.source === "ai" &&
      typeof row.source_url === "string" && row.source_url.indexOf("https://") === 0));

  const ride = plan.rows.find(row => row.title === "Backcountry Horseback Ride in Hobble Creek Canyon");
  check("Hobble Creek uses the hand pin and is locked",
    ride && ride.lat === 40.163866 && ride.lng === -111.50108 && ride.coords_locked === true &&
    ride.city === "Springville" && ride.geo_source === "hand_pin");

  const fencing = plan.rows.find(row => row.title === "Try Fencing at Valkyrie Fencing Club");
  check("fencing uses the hand pin and stays unlocked",
    fencing && fencing.lat === 40.36245 && fencing.lng === -111.7487 && fencing.coords_locked === false &&
    fencing.city === "Pleasant Grove");

  const balloon = plan.rows.find(row => row.title === "Private Sunrise Hot Air Balloon Flight with Nemesis Balloon Team");
  check("the balloon centroid is not stored",
    balloon && balloon.lat == null && balloon.lng == null && balloon.city === "American Fork" &&
    balloon.coords_locked === false);

  const skate = plan.rows.find(row => row.title === "16+ Late Skate at Classic Fun Center");
  check("late skate $11.99 is stored as $1-$10", skate && skate.cost === "$1-$10");
  const ravioli = plan.rows.find(row => row.title === "Christmas Ravioli Night Cooking Class");
  check("ravioli keeps its last day and the $20-$30 band",
    ravioli && ravioli.expires_at === "2026-12-09" && ravioli.cost === "$20-$30");
  const concert = plan.rows.find(row => row.title === "BYU Celebration of Christmas Concert");
  check("the Christmas concert maps onto $20-$30", concert && concert.cost === "$20-$30");
  const pottery = plan.rows.find(row => row.title === "Paint Pottery at Color Me Mine Provo");
  check("pottery at $16 stays $20-$30", pottery && pottery.cost === "$20-$30");

  const football = plan.rows.find(row => row.title === "BYU Football at LaVell Edwards Stadium");
  check("a dated find keeps expires_at", football && football.expires_at === "2026-11-28");
  const ongoing = plan.rows.find(row => row.title === "Getout Games Escape Room");
  check("an ongoing find leaves expires_at empty and fills the city from the address",
    ongoing && ongoing.expires_at == null && ongoing.city === "Provo" && ongoing.coords_locked === false);

  check("hand pins that match a find are applied, including the cleared balloon",
    plan.handPinsApplied.length === 16 && plan.handPinsApplied.filter(pin => pin.cleared).length === 1,
    String(plan.handPinsApplied.length) + " cleared " + plan.handPinsApplied.filter(pin => pin.cleared).length);
  check("nine reviews lock coordinates", plan.coordsLocked.length === 9, plan.coordsLocked.join("; "));
  check("the dropped Owl Bar night is not inserted",
    !plan.rows.some(row => row.title.indexOf("Owl Bar") !== -1));
  check("rows do not carry a device id",
    plan.rows.every(row => JSON.stringify(row).indexOf("localId") === -1 && JSON.stringify(row).indexOf("deviceId") === -1));
  check("these find files have no occurrences yet, so every row is anytime",
    plan.rows.every(row => row.occurrences == null));

  const again = planImport(Object.assign({}, inputs, {
    existing: plan.rows.map(row => Object.assign({}, row, { origin: "existing" }))
  }));
  check("a second plan against the inserted rows inserts nothing",
    again.rows.length === 0 && again.skippedDuplicate.length === 134,
    "rows " + again.rows.length + " dupes " + again.skippedDuplicate.length);

  const keys = {};
  let unique = true;
  plan.rows.forEach(row => {
    const key = normalizeTitle(row.title) + "\n" + row.source_url;
    if (keys[key]) unique = false;
    keys[key] = true;
  });
  check("natural keys are unique", unique);
});

section("occurrences are stored when present and null when absent", () => {
  const dated = [
    { date: "2026-12-09", start: "6:30pm" },
    { date: "2026-12-02", start: "18:00", end: "20:00" }
  ];
  const range = { start: "2026-11-21", end: "2027-03-27", weekdays: ["Saturday"] };
  const batch = planImport({
    finds: [
      find({ title: "Dated Class", source_url: "https://example.com/dated", occurrences: dated, expires_at: "2026-12-09" }),
      find({ title: "Seasonal Market", source_url: "https://example.com/range", occurrences: range, expires_at: "2027-03-27" }),
      find({ title: "Anytime Walk", source_url: "https://example.com/anytime", occurrences: null, expires_at: null }),
      find({ title: "No Schedule Field", source_url: "https://example.com/none" }),
      find({ title: "Odd Schedule", source_url: "https://example.com/odd", occurrences: "not-a-schedule", expires_at: "2026-12-01" })
    ],
    reviews: {},
    pins: [],
    curated: [],
    dropped: new Map(),
    placePins: null
  });
  const byTitle = {};
  batch.rows.forEach(row => { byTitle[row.title] = row; });
  check("a bad schedule does not drop the idea",
    batch.rows.length === 5 && batch.skippedInvalid.length === 0,
    "rows " + batch.rows.length);
  const klass = byTitle["Dated Class"];
  check("a date list is normalized and sorted, with times in 24-hour form",
    klass && klass.occurrences.kind === "dates" &&
    klass.occurrences.dates[0].date === "2026-12-02" &&
    klass.occurrences.dates[0].start === "18:00" &&
    klass.occurrences.dates[0].end === "20:00" &&
    klass.occurrences.dates[1].date === "2026-12-09" &&
    klass.occurrences.dates[1].start === "18:30" &&
    !klass.occurrences.dates[1].end);
  check("expires_at stays beside a date list", klass && klass.expires_at === "2026-12-09");
  const market = byTitle["Seasonal Market"];
  check("a weekday range is stored",
    market && market.occurrences.kind === "weekly" &&
    market.occurrences.start === "2026-11-21" &&
    market.occurrences.end === "2027-03-27" &&
    market.occurrences.weekdays.join(",") === "Sat" &&
    market.expires_at === "2027-03-27");
  check("null and a missing field stay anytime",
    byTitle["Anytime Walk"].occurrences == null && byTitle["No Schedule Field"].occurrences == null);
  check("a schedule that is not a date list or a range is reported and stored as anytime",
    byTitle["Odd Schedule"].occurrences == null &&
    byTitle["Odd Schedule"].expires_at === "2026-12-01" &&
    batch.unmapped.some(item => item.field === "occurrences" && item.title === "Odd Schedule"));
  check("the insert writes occurrences", INSERT_SQL.indexOf("occurrences") !== -1 && INSERT_SQL.indexOf("$22::jsonb") !== -1);
});

section("insert statement", () => {
  check("the write is pending AI and idempotent",
    INSERT_SQL.indexOf("'pending'") !== -1 &&
    INSERT_SQL.indexOf("'ai'") !== -1 &&
    INSERT_SQL.indexOf("not exists") !== -1 &&
    INSERT_SQL.indexOf("activities_ai_natural_key") === -1 &&
    INSERT_SQL.indexOf("lower(btrim(existing.title))") !== -1 &&
    INSERT_SQL.indexOf("source_url") !== -1);
  check("the write does not mention a device id",
    INSERT_SQL.indexOf("localId") === -1 && INSERT_SQL.indexOf("device") === -1 &&
    INSERT_SQL.indexOf("local_id") === -1);
  check("expires_at and city are written",
    INSERT_SQL.indexOf("expires_at") !== -1 && INSERT_SQL.indexOf("city") !== -1);
});

module.exports = { pass: pass, fail: fail };
