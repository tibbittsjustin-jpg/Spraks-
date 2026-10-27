/* Tests for the Ticketmaster -> Spark translation and the fetch/cache layer.
   Everything here is offline: mapping is pure, and the one network-shaped test
   stubs global.fetch. */

const map = require("../events-map");
const source = require("../events-source");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
async function section(title, fn) {
  console.log("\n" + title);
  try { await fn(); }
  catch (e) { check("section ran without throwing", false, String(e.message).slice(0, 110)); }
}

/* A realistic Discovery API event. Shape mirrors what Ticketmaster actually
   returns, trimmed to the fields events-map reads. */
function tmEvent(over) {
  return Object.assign({
    id: "G5vYZ9abc123",
    name: "The Turnpike Troubadours",
    url: "https://www.ticketmaster.com/event/G5vYZ9abc123",
    images: [
      { ratio: "3_2", width: 305, height: 203, url: "https://img/small.jpg" },
      { ratio: "16_9", width: 1024, height: 576, url: "https://img/wide-1024.jpg" },
      { ratio: "16_9", width: 2048, height: 1152, url: "https://img/wide-2048.jpg" }
    ],
    dates: {
      start: { localDate: "2026-10-14", localTime: "19:30:00", dateTime: "2026-10-15T01:30:00Z" },
      timezone: "America/Denver",
      status: { code: "onsale" }
    },
    classifications: [{
      primary: true,
      segment: { id: "KZFzniwnSyZfZ7v7nJ", name: "Music" },
      genre: { id: "KnvZfZ7vAv1", name: "Country" },
      subGenre: { id: "KZazBEonSMnZfZ7v6F1", name: "Country" },
      family: false
    }],
    priceRanges: [{ type: "standard", currency: "USD", min: 45, max: 89.5 }],
    _embedded: {
      venues: [{
        name: "Rooftop Concert Series",
        city: { name: "Provo" },
        state: { stateCode: "UT" },
        address: { line1: "100 N University Ave" },
        postalCode: "84601",
        location: { latitude: "40.2338", longitude: "-111.6585" }
      }]
    }
  }, over || {});
}

const PROVO = { lat: 40.2338, lng: -111.6585 };


async function main() {
  /* ============================================================ */

  await section("Time of day", async () => {
    check("morning", map.timeOfDayFor("09:00:00")[0] === "Morning");
    check("afternoon", map.timeOfDayFor("14:30:00")[0] === "Afternoon");
    check("evening", map.timeOfDayFor("19:30:00")[0] === "Evening");
    check("late night", map.timeOfDayFor("22:45:00")[0] === "Night");
    check("after midnight is Night", map.timeOfDayFor("01:15:00")[0] === "Night");
    check("boundary 17:00 is Evening not Afternoon", map.timeOfDayFor("17:00:00")[0] === "Evening");
    const untimed = map.timeOfDayFor(null);
    check("untimed listing spans the day, not Night",
          untimed.length === 3 && untimed.indexOf("Night") === -1, untimed.join(","));
  });

  await section("Season", async () => {
    check("October is Fall", map.seasonFor("2026-10-14")[0] === "Fall");
    check("January is Winter", map.seasonFor("2027-01-05")[0] === "Winter");
    check("July is Summer", map.seasonFor("2026-07-04")[0] === "Summer");
    check("April is Spring", map.seasonFor("2026-04-01")[0] === "Spring");
    check("an event gets exactly one season", map.seasonFor("2026-10-14").length === 1);
  });

  await section("Cost bands", async () => {
    check("zero is Free", map.costBandForPrice(0) === "Free");
    check("$8 -> $1-$10", map.costBandForPrice(8) === "$1-$10");
    check("$25 -> $20-$30", map.costBandForPrice(25) === "$20-$30");
    check("$75 -> $100 and under", map.costBandForPrice(75) === "$100 and under");
    // The honesty case: Spark has no band above $100, so an expensive show must
    // not be filed under "$100 and under".
    check("$250 refuses to claim a band it doesn't fit", map.costBandForPrice(250) === null,
          String(map.costBandForPrice(250)));
    check("unknown price has no band", map.costBandForPrice(null) === null);

    const none = map.priceInfoFor(undefined);
    check("missing priceRanges is handled, not thrown", none.band === null && none.text === "Price not listed");
    const range = map.priceInfoFor([{ currency: "USD", min: 45, max: 89.5 }]);
    check("range text reads naturally", range.text === "$45–$89.50", range.text);
    check("band comes from the LOW end", range.band === "$100 and under", String(range.band));
    const flat = map.priceInfoFor([{ currency: "USD", min: 30, max: 30 }]);
    check("single price isn't shown as a range", flat.text === "$30", flat.text);
    const multi = map.priceInfoFor([{ min: 80, max: 120 }, { min: 35, max: 60 }]);
    check("spans every price tier", multi.min === 35 && multi.max === 120, multi.text);
  });

  await section("Classification lookup", async () => {
    check("genre beats segment", map.classify("Music", "Jazz").motif === "piano");
    check("segment used when genre is unknown to us",
          map.classify("Music", "Klezmer Fusion").motif === "concert");
    check("unknown segment falls back", map.classify("Nonsense", "Whatever").scene === "city");
    check("no classification at all still returns a shape",
          !!map.classify(null, null).vibe.length);

    // The one real editorial opinion in the table.
    check("comedy is first-date friendly",
          map.classify("Arts & Theatre", "Comedy").stage.indexOf("First Date") !== -1);
    check("metal is not first-date friendly",
          map.classify("Music", "Metal").stage.indexOf("First Date") === -1);
    check("jazz is first-date friendly",
          map.classify("Music", "Jazz").stage.indexOf("First Date") !== -1);
    check("fairs & festivals read as a full day outdoors",
          map.classify("Miscellaneous", "Fairs & Festivals").duration === "Full day" &&
          map.classify("Miscellaneous", "Fairs & Festivals").setting === "Outdoor");
  });

  await section("Mapping a whole event", async () => {
    const idea = map.mapEvent(tmEvent(), PROVO);
    check("title carried over", idea.title === "The Turnpike Troubadours");
    check("stable key namespaced to the source", idea.stableKey === "tm:G5vYZ9abc123");
    check("category is Local Event", idea.category === "Local Event");
    check("country show classified off genre", idea.motif === "guitar", idea.motif);
    check("evening slot derived from start time", idea.time.join(",") === "Evening");
    check("season derived from date", idea.season.join(",") === "Fall");
    check("price band from the low end", idea.cost === "$100 and under", String(idea.cost));
    check("readable price text kept for display", idea.priceText === "$45–$89.50", idea.priceText);
    check("venue label built", idea.venue.label === "Rooftop Concert Series · Provo, UT", idea.venue.label);
    check("widest 16:9 image chosen", idea.imageUrl === "https://img/wide-2048.jpg", idea.imageUrl);
    check("ticket link preserved for attribution", idea.ticketUrl.indexOf("ticketmaster.com") !== -1);
    check("date label is human", idea.dateLabel === "Wed, Oct 14 · 7:30pm", idea.dateLabel);
    check("distance computed from venue", idea.distanceMiles === 0, String(idea.distanceMiles));
  });

  await section("Events we should not show", async () => {
    check("cancelled event dropped",
          map.mapEvent(tmEvent({ dates: { start: { localDate: "2026-10-14" }, status: { code: "cancelled" } } }), PROVO) === null);
    check("event with no date dropped",
          map.mapEvent(tmEvent({ dates: { start: {}, status: { code: "onsale" } } }), PROVO) === null);
    check("event with no name dropped", map.mapEvent(tmEvent({ name: "" }), PROVO) === null);
    check("garbage input returns null, not a throw", map.mapEvent(null, PROVO) === null);
    check("postponed events are still shown",
          map.mapEvent(tmEvent({ dates: { start: { localDate: "2026-10-14", localTime: "19:30:00" }, status: { code: "postponed" } } }), PROVO) !== null);
  });

  await section("Missing fields degrade instead of crashing", async () => {
    const bare = map.mapEvent({ id: "X1", name: "Mystery Show",
      dates: { start: { localDate: "2026-12-01" }, status: {} } }, null);
    check("maps with no venue, price, images or classification", !!bare, "returned null");
    check("no venue -> null rather than a fake one", bare && bare.venue === null);
    check("no distance without an origin", bare && bare.distanceMiles === null);
    check("price falls back to a readable note", bare && bare.priceText === "Price not listed");
    check("still gets a usable shape from the fallback row",
          bare && bare.vibe.length > 0 && !!bare.duration);
  });

  await section("Every table row produces filterable output", async () => {
    // A card whose vibe is "Chil" would silently never match any filter. Walk the
    // whole table and confirm each row maps to values app.js's filters recognise.
    const V = map.SPARK;
    let bad = [];
    Object.keys(map.CLASSIFICATION_MAP).forEach(key => {
      const parts = key.split("/");
      const segment = parts[0];
      const genre = parts.length > 1 ? parts.slice(1).join("/") : null;
      const idea = map.mapEvent(tmEvent({
        id: "id-" + key,
        classifications: [{ primary: true, segment: { name: segment },
                            genre: genre ? { name: genre } : undefined }]
      }), PROVO);
      if (!idea) { bad.push(key + ": produced no card"); return; }
      idea.vibe.forEach(v => { if (V.vibe.indexOf(v) === -1) bad.push(key + ": vibe " + v); });
      idea.stage.forEach(s => { if (V.stage.indexOf(s) === -1) bad.push(key + ": stage " + s); });
      idea.dateType.forEach(d => { if (V.dateType.indexOf(d) === -1) bad.push(key + ": dateType " + d); });
      if (V.duration.indexOf(idea.duration) === -1) bad.push(key + ": duration " + idea.duration);
      if (V.setting.indexOf(idea.setting) === -1) bad.push(key + ": setting " + idea.setting);
      if (V.scene.indexOf(idea.scene) === -1) bad.push(key + ": scene " + idea.scene);
    });
    check(Object.keys(map.CLASSIFICATION_MAP).length + " rows all emit valid Spark values",
          bad.length === 0, bad.slice(0, 3).join(" | "));
    check("the table is actually substantial", Object.keys(map.CLASSIFICATION_MAP).length >= 25,
          String(Object.keys(map.CLASSIFICATION_MAP).length) + " rows");
  });

  await section("Distance", async () => {
    // Provo -> Salt Lake City is roughly 38 miles as the crow flies.
    const d = map.haversineMiles(40.2338, -111.6585, 40.7608, -111.8910);
    check("Provo to SLC is about 38 miles", d > 35 && d < 42, d && d.toFixed(1));
    check("zero distance to itself", map.haversineMiles(40, -111, 40, -111) === 0);
    check("missing coords -> null, not NaN", map.haversineMiles(40, -111, null, undefined) === null);
  });

  await section("Cache key coarsens location", async () => {
    // The privacy property: two people a few hundred metres apart must share one
    // cache entry, so no precise position is ever used as a lookup key.
    const a = source.cacheKeyFor({ lat: 40.23381, lng: -111.65852, radiusMiles: 25, windowDays: 60 });
    const b = source.cacheKeyFor({ lat: 40.23420, lng: -111.65790, radiusMiles: 25, windowDays: 60 });
    check("nearby users share a cache key", a === b, a + " vs " + b);
    check("key carries no full-precision coordinates", a.indexOf("40.23381") === -1, a);

    const far = source.cacheKeyFor({ lat: 40.76, lng: -111.89, radiusMiles: 25, windowDays: 60 });
    check("a different city does not", a !== far);
    const wider = source.cacheKeyFor({ lat: 40.23381, lng: -111.65852, radiusMiles: 5, windowDays: 60 });
    check("radius is part of the key", a !== wider);
    const zip = source.cacheKeyFor({ postalCode: "84601", radiusMiles: 25, windowDays: 60 });
    check("zip search keys separately", zip.indexOf("zip:84601") === 0, zip);
  });

  await section("Request shaping", async () => {
    const q = source.buildQuery({ lat: 40.2338, lng: -111.6585, radiusMiles: 25, windowDays: 60 }, "KEY123");
    check("searches by latlong", q.get("latlong") === "40.2338,-111.6585", String(q.get("latlong")));
    check("radius in miles", q.get("radius") === "25" && q.get("unit") === "miles");
    check("sorted by date ascending", q.get("sort") === "date,asc", String(q.get("sort")));
    check("window has both ends", !!q.get("startDateTime") && !!q.get("endDateTime"));
    check("timestamps have no milliseconds (Ticketmaster rejects them)",
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(q.get("startDateTime")), String(q.get("startDateTime")));

    const zq = source.buildQuery({ postalCode: "84601", radiusMiles: 10, windowDays: 30 }, "KEY123");
    check("zip search sends postalCode and no latlong",
          zq.get("postalCode") === "84601" && zq.get("latlong") === null);

    check("absurd radius is clamped, not rejected", source.clampRadius(99999) === 500);
    check("junk radius falls back to 25", source.clampRadius("abc") === 25);
    check("size stays within Ticketmaster's cap",
          source.buildQuery({ lat: 1, lng: 1, radiusMiles: 5, windowDays: 30, size: 9999 }, "K").get("size") === "200");
  });

  await section("Dedupe and ordering", async () => {
    const deduped = source.dedupeById([
      { eventId: "A", localDate: "2026-10-14" },
      { eventId: "A", localDate: "2026-10-14" },
      { eventId: "B", localDate: "2026-10-01" }
    ]);
    check("duplicate ids collapsed", deduped.length === 2, String(deduped.length));

    const sorted = source.sortByStart([
      { eventId: "late", startsAt: "2026-12-01T00:00:00Z" },
      { eventId: "soon", startsAt: "2026-10-01T00:00:00Z" },
      { eventId: "mid", startsAt: "2026-11-01T00:00:00Z" }
    ]);
    check("soonest first", sorted.map(e => e.eventId).join(",") === "soon,mid,late",
          sorted.map(e => e.eventId).join(","));

    const noInstant = source.sortByStart([
      { eventId: "b", localDate: "2026-10-20", localTime: null },
      { eventId: "a", localDate: "2026-10-02", localTime: "20:00:00" }
    ]);
    check("falls back to local date when there's no UTC instant",
          noInstant.map(e => e.eventId).join(",") === "a,b");
  });

  await section("fetchEvents end to end (stubbed network)", async () => {
    const realFetch = global.fetch;
    const realKey = process.env.TICKETMASTER_API_KEY;
    let calls = 0;
    const stubOk = async function () {
      calls++;
      return { ok: true, status: 200, json: async () => ({ _embedded: { events: [
        tmEvent({ id: "E2", name: "Later Show", dates: { start: { localDate: "2026-11-20", localTime: "20:00:00", dateTime: "2026-11-21T03:00:00Z" }, status: { code: "onsale" } } }),
        tmEvent({ id: "E1", name: "Sooner Show" }),
        tmEvent({ id: "E1", name: "Sooner Show (dupe)" }),
        tmEvent({ id: "E3", name: "Cancelled Show", dates: { start: { localDate: "2026-10-20" }, status: { code: "cancelled" } } })
      ] } }) };
    };
    async function expectCode(label, code, opts) {
      try { await source.fetchEvents(opts); check(label, false, "resolved instead of throwing"); }
      catch (e) { check(label, e.code === code, "got " + e.code); }
    }

    try {
      global.fetch = stubOk;
      process.env.TICKETMASTER_API_KEY = "TEST_KEY";
      source.clearCache();

      const first = await source.fetchEvents({ lat: 40.2338, lng: -111.6585, radiusMiles: 25 });
      check("returns mapped Spark ideas", first.events.length === 2, String(first.events.length));
      check("cancelled show filtered out", !first.events.some(e => e.title.indexOf("Cancelled") !== -1));
      check("duplicate collapsed", first.events.filter(e => e.eventId === "E1").length === 1);
      check("sorted soonest first",
            first.events.map(e => e.title).join(" | ") === "Sooner Show | Later Show",
            first.events.map(e => e.title).join(" | "));
      check("first call is not cached", first.cached === false);

      const second = await source.fetchEvents({ lat: 40.2339, lng: -111.6586, radiusMiles: 25 });
      check("a near-identical request is served from cache", second.cached === true);
      check("and made no extra network call", calls === 1, calls + " calls");

      delete process.env.TICKETMASTER_API_KEY;
      source.clearCache();
      await expectCode("missing key raises NOT_CONFIGURED", "NOT_CONFIGURED",
                       { lat: 40.1, lng: -111.1, radiusMiles: 5 });

      process.env.TICKETMASTER_API_KEY = "TEST_KEY";
      await expectCode("no location raises NO_LOCATION", "NO_LOCATION", { radiusMiles: 5 });

      global.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
      source.clearCache();
      await expectCode("rate limiting surfaces as TM_RATE_LIMIT", "TM_RATE_LIMIT",
                       { lat: 40.1, lng: -111.1, radiusMiles: 5 });

      global.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
      source.clearCache();
      await expectCode("a bad key surfaces as TM_AUTH", "TM_AUTH",
                       { lat: 40.1, lng: -111.1, radiusMiles: 5 });

      global.fetch = async () => { throw new Error("socket hang up"); };
      source.clearCache();
      await expectCode("a dead network surfaces as TM_UNREACHABLE", "TM_UNREACHABLE",
                       { lat: 40.1, lng: -111.1, radiusMiles: 5 });
    } finally {
      global.fetch = realFetch;
      if (realKey === undefined) delete process.env.TICKETMASTER_API_KEY;
      else process.env.TICKETMASTER_API_KEY = realKey;
      source.clearCache();
    }
  });

  await section("Vocabulary guard", async () => {
    // Proves the load-time check would actually catch a typo rather than just
    // being decorative.
    const saved = map.CLASSIFICATION_MAP["Music/Jazz"].vibe;
    map.CLASSIFICATION_MAP["Music/Jazz"].vibe = ["Chil"];
    let threw = false;
    try { map.assertVocabulary(); } catch (e) { threw = /Chil/.test(e.message); }
    map.CLASSIFICATION_MAP["Music/Jazz"].vibe = saved;
    check("a misspelled vibe fails loudly", threw);
    check("and the table is valid once restored", (() => {
      try { map.assertVocabulary(); return true; } catch (e) { return false; }
    })());
  });


  return { pass: pass, fail: fail };
}

module.exports = main();
