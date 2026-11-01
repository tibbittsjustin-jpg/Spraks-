/* Approved activities join the swipe deck. No database. */
"use strict";

const fs = require("fs");
const path = require("path");
const util = require("../public/util");
const occ = require("../public/occurrences");
const radius = require("../public/radius");
const remote = require("../public/remote-activities");
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
    check("section ran without throwing", false, String(e.stack || e.message).slice(0, 400));
  }
}

function row(id, extra) {
  return Object.assign({
    id: id,
    title: "Activity " + id,
    description: "Do this together.",
    materials: ["Shoes"],
    category: "Hiking & Nature",
    icon: "mountain",
    setting: "Outdoor",
    season: ["Fall"],
    food: false,
    age21: false,
    cost: "Free",
    duration: "Short (1-2 hrs)",
    time: ["Afternoon", "Evening"],
    vibe: ["Chill", "Adventurous"],
    stage: ["First Date"],
    dateType: ["Solo/Couple"],
    scene: "park",
    motif: "tree",
    source_url: "https://example.com/place",
    expires_at: null,
    occurrences: null,
    lat: 40.24,
    lng: -111.66,
    distanceMiles: 1.2,
    address: "1 Main St",
    city: "Provo"
  }, extra || {});
}

function memStorage() {
  const data = Object.create(null);
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; }
  };
}

function jsonPage(items, limit, offset, nextOffset) {
  return {
    ok: true,
    json: async function () {
      return { items: items, limit: limit, offset: offset, nextOffset: nextOffset };
    }
  };
}

function pageItems(offset, limit, total) {
  const items = [];
  for (let i = 0; i < limit && offset + i < total; i++) {
    items.push(row(100000 + offset + i, { title: "Paged " + (offset + i), lat: null, lng: null, distanceMiles: null }));
  }
  const nextOffset = offset + items.length < total && items.length === limit ? offset + items.length : null;
  return { items: items, nextOffset: nextOffset };
}

function queryOf(url) {
  return new URL(url, "http://localhost");
}

function walk(node, acc) {
  if (!node || typeof node !== "object") return;
  acc.push(node);
  (node.children || []).forEach(child => walk(child, acc));
}

function visitLinks(screen) {
  const nodes = [];
  walk(screen, nodes);
  return nodes.filter(node => node.textContent === "Visit website");
}

async function main() {
  await section("row maps onto a deck idea", async () => {
    const idea = remote.mapActivityToIdea(row(100001, {
      date_type: ["Group Date"],
      dateType: null,
      distance_miles: 4.5,
      distanceMiles: null,
      sourceUrl: "https://example.com/ignored",
      occurrences: { kind: "dates", dates: [{ date: "2026-12-01", start: "19:00" }] },
      expires_at: "2026-12-01"
    }));
    check("id is namespaced", idea.id === "db:100001" && idea.dbId === 100001);
    check("filter fields are copied",
      idea.category === "Hiking & Nature" &&
      idea.setting === "Outdoor" &&
      idea.cost === "Free" &&
      idea.duration === "Short (1-2 hrs)" &&
      idea.food === false &&
      idea.age21 === false &&
      idea.time.join() === "Afternoon,Evening" &&
      idea.vibe.join() === "Chill,Adventurous" &&
      idea.season.join() === "Fall" &&
      idea.stage.join() === "First Date" &&
      idea.dateType.join() === "Group Date" &&
      idea.materials.join() === "Shoes" &&
      idea.scene === "park" &&
      idea.motif === "tree");
    check("occurrences and expires_at are kept",
      idea.occurrences.kind === "dates" &&
      idea.occurrences.dates[0].date === "2026-12-01" &&
      idea.expires_at === "2026-12-01" &&
      idea.expiresAt === "2026-12-01");
    check("https source_url is the visit link", util.activityWebsite(idea) === "https://example.com/place");
    check("pin and distance are copied from distance_miles",
      idea.lat === 40.24 && idea.lng === -111.66 && idea.distanceMiles === 4.5);
    check("device fields are not copied", idea.deviceId == null && idea.localId == null);

    const hidden = remote.mapActivityToIdea(row(100002, {
      title: "Secret page",
      source_url: "http://example.com/place",
      sourceUrl: "https://example.com/fallback"
    }));
    check("an http page is not a visit link", util.activityWebsite(hidden) === "");
    check("javascript and empty pages are dropped",
      util.activityWebsite(remote.mapActivityToIdea(row(100003, { source_url: "javascript:alert(1)" }))) === "" &&
      util.activityWebsite(remote.mapActivityToIdea(row(100004, { source_url: "" }))) === "");
    check("a bad row is skipped", remote.mapActivityToIdea({ id: "nope", title: "X" }) == null);
    check("the same database id always maps to the same deck id",
      remote.ideaId(100000) === "db:100000" && remote.ideaId("100000") === remote.ideaId(100000));
  });

  await section("ids do not collide with built-ins", async () => {
    const t = loadApp({});
    let collision = false;
    Object.keys(t.IDEAS_BY_ID).forEach(key => {
      const builtin = t.IDEAS_BY_ID[key];
      if (!builtin || typeof builtin.id !== "number") return;
      const namespaced = remote.ideaId(builtin.id);
      if (namespaced === builtin.id || namespaced === String(builtin.id)) collision = true;
      if (t.IDEAS_BY_ID[namespaced]) collision = true;
    });
    check("db:<id> is never a built-in id", collision === false);
    const builtin = t.IDEAS_BY_ID[2];
    const sameId = remote.mapActivityToIdea(row(builtin.id, { title: "Totally Different Observatory Night" }));
    const sameTitle = remote.mapActivityToIdea(row(100333, { title: "  " + builtin.title.toUpperCase() + "  " }));
    const twinA = remote.mapActivityToIdea(row(100334, { title: "Shared   Remote Title" }));
    const twinB = remote.mapActivityToIdea(row(100335, { title: "shared remote title" }));
    const fresh = remote.mapActivityToIdea(row(100336, { title: "A brand new night market" }));
    const kept = remote.dedupeAgainstBuiltins([sameId, sameTitle, twinA, twinB, fresh], [builtin]);
    check("duplicate id and normalized title are dropped",
      kept.length === 2 && kept[0].id === "db:100334" && kept[1].id === "db:100336",
      kept.map(idea => idea.id).join(","));
    t.applyRemoteIdeas([sameId, sameTitle, fresh]);
    check("a built-in keeps its own title", t.IDEAS_BY_ID[builtin.id].title === builtin.title);
    check("the namespaced duplicate is not stored on the built-in id", t.IDEAS_BY_ID["db:" + builtin.id] == null);
    check("a new title is stored under its namespaced id", t.IDEAS_BY_ID[fresh.id].title === fresh.title);
  });

  await section("cache hit, miss, and TTL", async () => {
    const storage = memStorage();
    const idea = remote.mapActivityToIdea(row(100401, { title: "Cached lantern walk" }));
    const t0 = 1_700_000_000_000;
    check("a missing bucket is a miss", remote.readCache(storage, "none", t0).hit === false);
    remote.writeCache(storage, "none", [idea], t0);
    const hit = remote.readCache(storage, "none", t0 + remote.CACHE_TTL_MS - 1);
    check("a fresh bucket is a hit", hit.hit === true && hit.fresh === true && hit.ideas[0].id === idea.id);
    check("a different bucket is a miss", remote.readCache(storage, "40.23,-111.66", t0 + 10).hit === false);
    check("the key includes the version and the bucket",
      remote.cacheKey(remote.API_VERSION, "none") !== remote.cacheKey("2", "none") &&
      remote.cacheKey(remote.API_VERSION, "none") !== remote.cacheKey(remote.API_VERSION, "40.23,-111.66"));
    const stale = remote.readCache(storage, "none", t0 + remote.CACHE_TTL_MS);
    check("six hours is no longer fresh", stale.hit === true && stale.fresh === false && stale.ideas.length === 1);

    let fetches = 0;
    const fetchFn = () => {
      fetches += 1;
      return Promise.resolve(jsonPage([], 100, 0, null));
    };
    const again = await remote.syncActivities({
      storage: storage, fetch: fetchFn, now: () => t0 + 1000, deviceId: "device-should-not-send", localId: "loc_secret"
    });
    check("a fresh cache does not refetch", fetches === 0 && again.fromCache === true && again.ideas.length === 1);
    const expired = await remote.syncActivities({
      storage: storage, fetch: fetchFn, now: () => t0 + remote.CACHE_TTL_MS + 5
    });
    check("an expired cache refetches", fetches === 1 && expired.ok === true && expired.fromCache === false);

    fetches = 0;
    const moved = await remote.syncActivities({
      storage: storage,
      lat: 40.233843,
      lng: -111.658531,
      fetch: fetchFn,
      now: () => t0 + 2000,
      deviceId: "device-abc"
    });
    check("a new location bucket refetches", fetches === 1 && moved.bucket === "40.23,-111.66");
    fetches = 0;
    await remote.syncActivities({
      storage: storage, lat: 40.234, lng: -111.661, fetch: fetchFn, now: () => t0 + 3000
    });
    check("a small move inside the same bucket does not refetch", fetches === 0);
  });

  await section("timeout or offline keeps the built-in deck", async () => {
    const warns = [];
    const orig = console.warn;
    console.warn = function () {
      warns.push(Array.prototype.join.call(arguments, " "));
      return orig.apply(console, arguments);
    };
    try {
      let thrown = false;
      let offline;
      try {
        offline = await remote.syncActivities({
          storage: memStorage(),
          builtins: [{ id: 2, title: "Palisades After the Powder" }],
          fetch: function () { return Promise.reject(new Error("offline")); }
        });
      } catch (err) {
        thrown = true;
      }
      check("offline does not throw", thrown === false);
      check("offline returns no remote ideas", offline && offline.ok === false && offline.ideas.length === 0);
      check("offline logs one quiet warning", warns.length === 1 && warns[0].indexOf("40.") === -1, warns.join(" | "));

      const before = warns.length;
      let timed;
      thrown = false;
      try {
        timed = await remote.fetchApprovedActivities({
          timeoutMs: 30,
          lat: 40.233843,
          lng: -111.658531,
          deviceId: "device-abc",
          fetch: function (_url, opts) {
            return new Promise(function (_resolve, reject) {
              if (opts && opts.signal) {
                opts.signal.addEventListener("abort", function () {
                  const err = new Error("aborted");
                  err.name = "AbortError";
                  reject(err);
                });
              }
            });
          }
        });
      } catch (err) {
        thrown = true;
      }
      check("a timeout does not throw", thrown === false && timed && timed.ok === false && timed.reason === "timeout");
      check("a timeout logs one more quiet warning", warns.length === before + 1);
    } finally {
      console.warn = orig;
    }
  });

  await section("pages through every result", async () => {
    const urls = [];
    const total = 5;
    const result = await remote.fetchApprovedActivities({
      limit: 2,
      maxItems: 100,
      lat: 40.233843,
      lng: -111.658531,
      deviceId: "device-abc",
      localId: "loc_secret",
      fetch: function (url) {
        urls.push(String(url));
        const query = queryOf(url);
        const offset = Number(query.searchParams.get("offset") || 0);
        const limit = Number(query.searchParams.get("limit"));
        const page = pageItems(offset, limit, total);
        return Promise.resolve(jsonPage(page.items, limit, offset, page.nextOffset));
      }
    });
    check("three pages cover five rows", urls.length === 3 && result.ok === true && result.ideas.length === 5, String(urls.length));
    const offsets = urls.map(url => queryOf(url).searchParams.get("offset"));
    check("offsets advance", offsets.join() === "0,2,4", offsets.join());
    urls.forEach(url => {
      const query = queryOf(url);
      const keys = [];
      query.searchParams.forEach((_value, key) => keys.push(key));
      keys.sort();
      check("only limit, offset, rounded location, and radius are sent",
        keys.join() === "lat,limit,lng,offset,radiusMiles", keys.join());
      check("latitude is rounded", query.searchParams.get("lat") === "40.23");
      check("longitude is rounded", query.searchParams.get("lng") === "-111.66");
      check("the precise location is not in the url",
        url.indexOf("40.233843") === -1 && url.indexOf("-111.658531") === -1);
      check("no device id is in the url", url.indexOf("device") === -1 && url.indexOf("loc_secret") === -1);
    });

    const cappedUrls = [];
    const capped = await remote.fetchApprovedActivities({
      limit: 2,
      maxItems: 3,
      fetch: function (url) {
        cappedUrls.push(String(url));
        const query = queryOf(url);
        const offset = Number(query.searchParams.get("offset") || 0);
        const limit = Number(query.searchParams.get("limit"));
        const page = pageItems(offset, limit, 10);
        return Promise.resolve(jsonPage(page.items, limit, offset, page.nextOffset));
      }
    });
    check("a cap stops the pages", capped.ideas.length === 3 && cappedUrls.length === 2, capped.ideas.length + " / " + cappedUrls.length);

    const plain = [];
    await remote.fetchApprovedActivities({
      fetch: function (url) {
        plain.push(String(url));
        return Promise.resolve(jsonPage([], 100, 0, null));
      }
    });
    const plainKeys = [];
    queryOf(plain[0]).searchParams.forEach((_value, key) => plainKeys.push(key));
    check("without a location only the page is sent", plainKeys.sort().join() === "limit,offset", plainKeys.join());
    check("a missing fix is not sent as the Gulf of Guinea",
      remote.locationBucket(null, null) === "none" && remote.roundPair(null, null) == null);
  });

  await section("plan dates, anytime ideas, and expired rows", async () => {
    const dated = remote.mapActivityToIdea(row(100501, {
      title: "December concert",
      occurrences: { kind: "dates", dates: [{ date: "2026-12-01", start: "19:00" }] },
      expires_at: null
    }));
    const anytime = remote.mapActivityToIdea(row(100502, {
      title: "Anytime pottery",
      occurrences: null,
      expires_at: null,
      lat: null,
      lng: null,
      distanceMiles: null
    }));
    const expired = remote.mapActivityToIdea(row(100503, {
      title: "Last year's fair",
      occurrences: null,
      expires_at: "2020-01-01"
    }));
    const milesOnly = remote.mapActivityToIdea(row(100504, {
      title: "Measured walk",
      lat: null,
      lng: null,
      distanceMiles: 3
    }));
    const far = remote.mapActivityToIdea(row(100505, {
      title: "Far canyon",
      lat: 37.1,
      lng: -113.5,
      distanceMiles: null
    }));

    check("a plan date hides a concert on another day", occ.visibleOnPlan(dated, "2026-11-02", new Date()) === false);
    check("that concert shows on its own day", occ.visibleOnPlan(dated, "2026-12-01", new Date()) === true);
    check("an anytime idea shows on a plan date", occ.visibleOnPlan(anytime, "2026-11-02", new Date()) === true);
    check("an expired row is not visible", occ.visibleOnPlan(expired, "", new Date("2026-10-31T18:00:00Z")) === false);
    const retained = remote.retainSavedIdeas([anytime, dated], [expired, anytime]);
    check("a feed merge keeps a saved row the feed dropped",
      retained.length === 1 && retained[0].id === expired.id && retained[0].title === "Last year's fair");
    check("a saved row that is still in the feed is not duplicated",
      remote.retainSavedIdeas([expired], [expired]).length === 0);
    const someday = ["db:100503"];
    remote.retainSavedIdeas([], [expired]);
    check("retaining a snapshot does not remove saved ids", someday.join() === "db:100503");

    const t = loadApp({});
    const before = t.computeDeck();
    const first = before.remaining[0];
    const countBefore = t.countIdeasMatching(t.state.filters);
    const added = t.applyRemoteIdeas([anytime]);
    const after = t.computeDeck();
    check("the current card stays when activities arrive", after.remaining[0] === first, String(after.remaining[0]));
    check("the new idea is appended", added.length === 1 && after.remaining.indexOf(anytime.id) !== -1);
    const withRemote = t.countIdeasMatching(t.state.filters);
    check("the filter count includes it", withRemote === countBefore + 1, withRemote + " vs " + countBefore);
    t.applyRemoteIdeas([expired]);
    check("an expired row is not a match", t.matchesFilters(expired, t.state.filters) === false);
    check("an expired row is not in the deck", t.computeDeck().remaining.indexOf(expired.id) === -1);
    check("an expired row does not raise the count", t.countIdeasMatching(t.state.filters) === withRemote);

    t.state.datePlans.push({ id: "plan1", name: "Tuesday", date: "2026-11-02", createdAt: 1, ideaIds: [], friendPicks: [] });
    t.ui.activePlanId = "plan1";
    t.computeDeck();
    t.applyRemoteIdeas([dated]);
    const planned = t.computeDeck();
    check("the deck hides the concert on this plan date",
      t.matchesFilters(dated, t.state.filters) === false && planned.remaining.indexOf(dated.id) === -1);
    check("an anytime idea still shows on that plan date",
      t.matchesFilters(anytime, t.state.filters) === true && planned.remaining.indexOf(anytime.id) !== -1);

    t.ui.activePlanId = null;
    t.state.location = { lat: 40.2338, lng: -111.6585 };
    const local = Object.assign({}, t.state.filters, { localOnly: true, radiusMiles: 10 });
    check("a close pin matches Local events", t.matchesFilters(dated, local) === true);
    check("a far pin is outside the radius", t.matchesFilters(far, local) === false);
    check("a measured distance inside the radius stays", t.matchesFilters(milesOnly, local) === true);
    check("an idea with no place is hidden when Local events is on", t.matchesFilters(anytime, local) === false);
    check("the radius helper sees the pin",
      radius.withinRadius(dated, t.state.location, 10) === true &&
      radius.withinRadius(far, t.state.location, 10) === false);

    const screen = t.buildDetailScreen(dated.id);
    const links = visitLinks(screen);
    check("Visit website uses the https page",
      links.length === 1 && links[0].getAttribute("href") === "https://example.com/place");

    const cardA = t.buildSwipeCard(t.IDEAS_BY_ID[dated.id], true, 0);
    const cardB = t.buildSwipeCard(t.IDEAS_BY_ID[anytime.id], true, 0);
    check("each activity still gets its own cover",
      cardA.innerHTML.indexOf("NaN") === -1 && cardA.innerHTML !== cardB.innerHTML);

    const src = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
    const swipe = src.slice(src.indexOf("function finishSwipe"), src.indexOf("function openFilterOverlay"));
    check("a swipe does not fetch activities",
      swipe.indexOf("refreshRemoteActivities") === -1 && swipe.indexOf("/api/activities") === -1);
  });

  await section("saved and planned activities resolve after reload", async () => {
    const store = {};
    const first = loadApp(store);
    const idea = remote.mapActivityToIdea(row(100600, { title: "Saved kiln night" }));
    first.applyRemoteIdeas([idea]);
    first.addIdeaToBucket(idea.id, { type: "someday" });
    first.state.datePlans.push({
      id: "p1", name: "Friday", date: "", createdAt: 1, ideaIds: [idea.id], friendPicks: []
    });
    first.saveState();

    const second = loadApp(store);
    const resolved = second.IDEAS_BY_ID[idea.id];
    check("the saved id resolves after reload", resolved && resolved.title === "Saved kiln night");
    check("the plan still points at that id",
      second.state.somedayIds.indexOf(idea.id) !== -1 &&
      second.state.datePlans[0].ideaIds.indexOf(idea.id) !== -1);
    let detailThrew = false;
    try { second.buildDetailScreen(idea.id); } catch (err) { detailThrew = true; }
    check("the saved activity still opens", detailThrew === false);
  });

  await section("a saved copy is used on the next open", async () => {
    const store = {};
    const storage = {
      getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
      setItem(key, value) { store[key] = String(value); }
    };
    const idea = remote.mapActivityToIdea(row(100700, { title: "Offline orchard visit" }));
    remote.writeCache(storage, "none", [idea], Date.now());
    const t = loadApp(store);
    check("the cached activity is in the deck without a network call",
      t.REMOTE_IDEAS.some(item => item.id === idea.id) &&
      t.computeDeck().remaining.indexOf(idea.id) !== -1);
  });

  return { pass: pass, fail: fail };
}

module.exports = main();
