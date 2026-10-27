/* Front-end behaviour for local events: stable ids, persistence across a
   reload, expiry, budget display, and how many reach the swipe deck. */

const { loadApp } = require("./harness.js");
const map = require("../events-map");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
function section(title, fn) {
  console.log("\n" + title);
  try { fn(); }
  catch (e) { check("section ran without throwing", false, String(e.message).slice(0, 110)); }
}

/* Local calendar dates, so these tests don't drift with the clock or break in
   a non-UTC timezone. */
function localISO(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + (offsetDays || 0));
  const p = n => (n < 10 ? "0" : "") + n;
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/* Runs a raw Ticketmaster payload through the real server-side mapper, so
   these tests exercise the same shape the API actually returns. */
function serverEvent(over) {
  over = over || {};
  return map.mapEvent({
    id: over.id || "G5vTM001",
    name: over.name || "Neon Owls Live",
    url: "https://www.ticketmaster.com/event/" + (over.id || "G5vTM001"),
    dates: {
      start: { localDate: over.localDate || localISO(3), localTime: over.localTime || "19:30:00" },
      status: { code: "onsale" }
    },
    classifications: [{ primary: true, segment: { name: "Music" }, genre: { name: over.genre || "Country" } }],
    priceRanges: over.priceRanges === null ? undefined : (over.priceRanges || [{ currency: "USD", min: 25, max: 40 }]),
    _embedded: { venues: [{ name: over.venue || "The Alpine Room", city: { name: "Provo" },
      state: { stateCode: "UT" }, location: { latitude: "40.2338", longitude: "-111.6585" } }] }
  }, { lat: 40.2338, lng: -111.6585 });
}

const store = {};

section("Events get stable ids", () => {
  const a = loadApp({}), b = loadApp({});
  const raw = serverEvent();
  const id1 = a.hydrateEventIdea(raw).id;
  // b meets a different event first — a counter would drift, a stable key won't.
  b.hydrateEventIdea(serverEvent({ id: "G5vOTHER", name: "Someone Else" }));
  const id2 = b.hydrateEventIdea(raw).id;
  check("same event -> same id regardless of order", id1 === id2, id1 + " vs " + id2);
  check("id is numeric so cover art still seeds", typeof id1 === "number" && Number.isFinite(id1 * 2654435761));
  check("id sits in the reserved external range", a.isRealId(id1), String(id1));
  check("different events -> different ids",
        id1 !== a.hydrateEventIdea(serverEvent({ id: "G5vOTHER" })).id);
  check("key is namespaced to Ticketmaster", raw.stableKey.indexOf("tm:") === 0, raw.stableKey);
  check("marked as an event", a.hydrateEventIdea(raw).isEvent === true);
  check("gets a description for the card",
        a.hydrateEventIdea(raw).description.length > 0, "empty");
});

section("A saved event survives a reload", () => {
  const s1 = loadApp(store);
  const idea = s1.hydrateEventIdea(serverEvent());
  s1.IDEAS_BY_ID[idea.id] = idea;
  s1.addIdeaToBucket(idea.id, { type: "someday" });
  s1.saveState();
  check("snapshotted into state", !!(s1.state.realIdeas || {})[idea.id]);

  const s2 = loadApp(store);
  const savedId = s2.state.somedayIds[0];
  const found = s2.IDEAS_BY_ID[savedId];
  check("still resolves after reload", !!found, "id " + savedId + " resolved to nothing");
  check("resolves to the same event", !!found && found.title === "Neon Owls Live",
        found ? found.title : "nothing");
  check("keeps its ticket link for attribution",
        !!found && String(found.ticketUrl).indexOf("ticketmaster.com") !== -1);
  check("folder count matches what renders",
        s2.totalSavedCount() === s2.state.somedayIds.filter(id => !!s2.IDEAS_BY_ID[id]).length);
  check("not re-dealt into the deck on reload", s2.EVENT_IDEAS_RUNTIME.length === 0,
        String(s2.EVENT_IDEAS_RUNTIME.length));
});

section("Expiry", () => {
  const t = loadApp({});
  const past = t.hydrateEventIdea(serverEvent({ id: "P1", localDate: localISO(-2) }));
  const today = t.hydrateEventIdea(serverEvent({ id: "T1", localDate: localISO(0), localTime: "08:00:00" }));
  const future = t.hydrateEventIdea(serverEvent({ id: "F1", localDate: localISO(5) }));

  check("yesterday's event is past", t.isPastEvent(past) === true);
  check("a future event is not", t.isPastEvent(future) === false);
  // Day-granular on purpose: an 8am event shouldn't disappear at 8:01am while
  // someone is still deciding, and UTC rollover must not retire it early.
  check("today's event is NOT past, even a morning one", t.isPastEvent(today) === false);
  check("built-in ideas are never 'past'", t.isPastEvent(t.IDEAS_BY_ID[2]) === false);
  check("handles junk without throwing", t.isPastEvent(null) === false);

  t.EVENT_IDEAS_RUNTIME = [past, today, future];
  const upcoming = t.upcomingEvents().map(e => e.eventId);
  check("past events drop out of the list", upcoming.indexOf("P1") === -1, upcoming.join(","));
  check("today and future stay", upcoming.length === 2, upcoming.join(","));
});

section("Local calendar day, not UTC", () => {
  const t = loadApp({});
  const d = new Date(2026, 9, 14, 23, 30);   // 11:30pm local on 14 Oct
  check("uses the local date at 11:30pm", t.localDateISO(d) === "2026-10-14", t.localDateISO(d));
  check("pads single digits", t.localDateISO(new Date(2026, 0, 5)) === "2026-01-05",
        t.localDateISO(new Date(2026, 0, 5)));
});

section("Budget display never lies", () => {
  const t = loadApp({});
  const cheap = t.hydrateEventIdea(serverEvent({ priceRanges: [{ currency: "USD", min: 25, max: 40 }] }));
  check("a banded event shows its band", t.displayCost(cheap) === "$20-$30", t.displayCost(cheap));

  // Above $100 there is no honest Spark band, so the real figure is shown.
  const pricey = t.hydrateEventIdea(serverEvent({ id: "EXP", priceRanges: [{ currency: "USD", min: 250, max: 600 }] }));
  check("an expensive event has no band", pricey.cost === null, String(pricey.cost));
  check("and shows the real price instead", t.displayCost(pricey) === "$250–$600", t.displayCost(pricey));
  check("so it is never mislabelled '$100 and under'",
        t.displayCost(pricey).indexOf("100 and under") === -1);

  const unknown = t.hydrateEventIdea(serverEvent({ id: "UNK", priceRanges: null }));
  check("an unpriced event says so", t.displayCost(unknown) === "Price not listed", t.displayCost(unknown));
  check("built-in ideas are unaffected", t.displayCost(t.IDEAS_BY_ID[2]) === t.IDEAS_BY_ID[2].cost);

  // The filter must stay truthful even though the label is friendly.
  const withBudget = Object.assign({}, t.state.filters, { cost: ["Free", "$1-$10"] });
  check("an unbanded event is excluded when filtering on budget",
        t.matchesFilters(pricey, withBudget) === false);
});

section("Only a taste of events reaches the swipe deck", () => {
  const t = loadApp({});
  t.state.postalCode = "84601";          // locatable without GPS
  const many = [];
  for (let i = 0; i < 40; i++) {
    const e = t.hydrateEventIdea(serverEvent({ id: "BULK" + i, localDate: localISO(i + 1) }));
    t.IDEAS_BY_ID[e.id] = e;
    many.push(e);
  }
  t.EVENT_IDEAS_RUNTIME = many;

  const deck = t.computeDeck();
  const eventIdsInDeck = deck.remaining.filter(id => {
    const idea = t.IDEAS_BY_ID[id];
    return idea && idea.isEvent;
  });
  check("deck caps events at EVENTS_IN_DECK",
        eventIdsInDeck.length === t.EVENTS_IN_DECK, eventIdsInDeck.length + " of " + many.length);
  check("the rest of the deck is still the built-in ideas",
        deck.remaining.length > 1900, String(deck.remaining.length));
  check("it takes the SOONEST events, not a random slice",
        eventIdsInDeck.indexOf(many[0].id) !== -1 && eventIdsInDeck.indexOf(many[39].id) === -1);

  // Without any location at all there's nothing to search from.
  const t2 = loadApp({});
  t2.EVENT_IDEAS_RUNTIME = many;
  const noLoc = t2.computeDeck().remaining.filter(id => {
    const idea = t2.IDEAS_BY_ID[id];
    return idea && idea.isEvent;
  });
  check("no location and no zip -> no events in the deck", noLoc.length === 0, String(noLoc.length));
});

section("Events surface early enough to be seen", () => {
  const t = loadApp({});
  t.state.postalCode = "84601";
  const evs = [];
  for (let i = 0; i < 8; i++) {
    const e = t.hydrateEventIdea(serverEvent({ id: "POS" + i, localDate: localISO(i + 1) }));
    t.IDEAS_BY_ID[e.id] = e;
    evs.push(e);
  }
  t.EVENT_IDEAS_RUNTIME = evs;

  const deck = t.computeDeck().remaining;
  const positions = deck
    .map((id, i) => [id, i])
    .filter(x => t.IDEAS_BY_ID[x[0]] && t.IDEAS_BY_ID[x[0]].isEvent)
    .map(x => x[1]);

  // Spread evenly across ~2000 built-in ideas, the first event would land at
  // position ~222 — past any plausible swiping session, so the feature would
  // effectively not exist.
  check("first event is reachable in a few swipes", positions[0] <= 10, "position " + positions[0]);
  check("events keep a steady rhythm, not one clump",
        positions[1] - positions[0] <= 12, "gap " + (positions[1] - positions[0]));
  check("built-in ideas still dominate the deck",
        deck.length - positions.length > 1900, String(deck.length));
});

section("Swiping actually reaches an event", () => {
  // The subtle one. Recomputing the interleave from whatever is LEFT after each
  // swipe re-inserts the extras N cards deep every time, so the first event
  // stays perpetually N cards ahead and is never reached however long you
  // swipe. The order has to be computed once and then held still.
  const t = loadApp({});
  t.state.postalCode = "84601";
  const evs = [];
  for (let i = 0; i < 8; i++) {
    const e = t.hydrateEventIdea(serverEvent({ id: "REACH" + i, localDate: localISO(i + 1) }));
    t.IDEAS_BY_ID[e.id] = e;
    evs.push(e);
  }
  t.EVENT_IDEAS_RUNTIME = evs;

  let reachedAfter = -1;
  const gaps = [];
  for (let swipe = 0; swipe < 40; swipe++) {
    const deck = t.computeDeck().remaining;
    const top = t.IDEAS_BY_ID[deck[0]];
    gaps.push(deck.findIndex(id => t.IDEAS_BY_ID[id] && t.IDEAS_BY_ID[id].isEvent));
    if (top && top.isEvent) { reachedAfter = swipe; break; }
    t.state.seenIds.push(deck[0]);
  }
  check("an event card is actually reached by swiping", reachedAfter !== -1,
        "never arrived in 40 swipes");
  check("and within a sensible number of swipes", reachedAfter >= 0 && reachedAfter <= 12,
        "took " + reachedAfter);
  check("the gap counts DOWN rather than staying fixed",
        gaps[0] > gaps[1] && gaps[1] > gaps[2], gaps.slice(0, 4).join(" -> "));

  // Order must survive a re-render that changes nothing.
  const a = t.computeDeck().remaining.slice(0, 20).join(",");
  const b = t.computeDeck().remaining.slice(0, 20).join(",");
  check("repeated renders give the same order", a === b);
});

section("Events flow through the normal filters", () => {
  const t = loadApp({});
  const jazz = t.hydrateEventIdea(serverEvent({ id: "JZ", genre: "Jazz" }));
  const metal = t.hydrateEventIdea(serverEvent({ id: "MT", genre: "Metal" }));

  const firstDate = Object.assign({}, t.state.filters, { stage: ["First Date"] });
  check("jazz survives a First Date filter", t.matchesFilters(jazz, firstDate) === true);
  check("metal does not", t.matchesFilters(metal, firstDate) === false);

  const evening = Object.assign({}, t.state.filters, { time: ["Evening"] });
  check("a 7:30pm show matches an Evening filter", t.matchesFilters(jazz, evening) === true);
  const morning = Object.assign({}, t.state.filters, { time: ["Morning"] });
  check("and not a Morning one", t.matchesFilters(jazz, morning) === false);
});

module.exports = { pass: pass, fail: fail };
