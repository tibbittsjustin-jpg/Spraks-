/* Liked activities inside a planning list. Missing likes means not liked.
   The sort and the migrate helpers are the ones a group list can call. */

const fs = require("fs");
const path = require("path");
const util = require("../public/util.js");
const { loadApp } = require("./harness.js");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
function section(title, fn) {
  console.log("\n" + title);
  try { fn(); }
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 500)); }
}

function textOf(node) {
  if (!node) return "";
  let out = node.innerHTML || "";
  (node.children || []).forEach(child => { out += "\n" + textOf(child); });
  return out;
}

function walk(node, out) {
  if (!node) return;
  out.push(node);
  (node.children || []).forEach(child => walk(child, out));
}

function savedCards(screen) {
  const nodes = [];
  walk(screen, nodes);
  return nodes.filter(node => String(node.className || "").split(/\s+/).indexOf("saved-card") !== -1);
}

function cardTitles(screen) {
  const nodes = [];
  walk(screen, nodes);
  return nodes
    .filter(node => String(node.className || "").indexOf("saved-card-title") !== -1)
    .map(node => node.innerHTML);
}

function likeButtons(screen) {
  const nodes = [];
  walk(screen, nodes);
  return nodes.filter(node => String(node.className || "").indexOf("saved-like-btn") !== -1);
}

function classBlob(node) {
  const nodes = [];
  walk(node, nodes);
  return nodes.map(item => item.className || "").join(" ");
}

function storedPlan(extra) {
  return {
    onboarded: true,
    hasSeenTutorial: true,
    profile: { name: "A", gender: "Woman", photo: null, ageConfirmedAt: "2026-01-15T00:00:00.000Z" },
    somedayIds: [],
    doneIds: [],
    settings: { autoDarkMode: false },
    datePlans: [{
      id: "plan_sat",
      name: "Saturday",
      date: "2026-11-07",
      createdAt: "2026-10-01",
      ideaIds: [2, 3, 5, 8],
      friendPicks: []
    }],
    ...extra
  };
}

function openPlan(app, planId) {
  app.ui.savedBucket = { type: "plan", planId: planId || "plan_sat" };
  return app.buildSavedScreen();
}

section("sort puts the most recently liked activity first and leaves the rest", () => {
  const ids = [2, 3, 5, 8];
  const plain = util.orderSavedActivities(ids, null, []).map(row => row.id);
  check("with no likes, newest saved stays first", plain.join(",") === "8,5,3,2", plain.join(","));

  const liked = util.orderSavedActivities(ids, { "3": 1000, "2": 2000 }, []).map(row => row.id);
  check("liked rows lead, latest like first", liked.join(",") === "2,3,8,5", liked.join(","));

  const tied = util.sortLikedItems([
    { id: "a", likedAt: 5, order: 1 },
    { id: "b", likedAt: 5, order: 0 },
    { id: "c", likedAt: null, order: 2 }
  ]).map(row => row.id);
  check("an equal like keeps the earlier place", tied.join(",") === "b,a,c", tied.join(","));

  const picks = util.orderSavedActivities(ids, { "2": 50 }, [
    { ideaId: 5, friendName: "Emma R." }
  ]).map(row => row.id);
  check("a like sits above a friend's pick, and that pick stays above the rest",
    picks.join(",") === "2,5,8,3", picks.join(","));

  const fromItems = util.orderSavedActivities(
    [{ id: 2, likedAt: 10 }, { id: 8, likedAt: "nope" }, 3],
    null,
    []
  ).map(row => row.id);
  check("a likedAt on the row itself sorts, and a bad one does not",
    fromItems.join(",") === "2,3,8", fromItems.join(","));

  const view = util.likedItemPresentation({ id: 2, likedAt: 10 }, { past: false });
  const pastView = util.likedItemPresentation({ id: 2, likedAt: 10 }, { past: true });
  const plainView = util.likedItemPresentation({ id: 2 }, {});
  check("the shared accent is a top-pick badge",
    view.liked === true && view.badge === "Top pick" && view.className === "is-liked" && view.muted === false);
  check("a liked past row keeps both flags and is muted",
    pastView.className === "is-liked is-past" && pastView.muted === true && pastView.badge === "Top pick");
  check("a missing like is not a top pick",
    plainView.liked === false && plainView.badge === "" && plainView.className === "");
});

section("older saves migrate, and a missing like field stays not liked", () => {
  const untouched = { ideaIds: [2, 3, 5] };
  check("a plan with no likes field is left alone", util.migrateListLikes(untouched) === false && untouched.likes == null);

  const junk = { ideaIds: [2, 3, 5, 8], likes: { "2": "nope", "3": 0, "5": "1700000000000", "99": 42, "8": -4 } };
  check("migration rewrites junk likes", util.migrateListLikes(junk) === true);
  check("only a real timestamp for an id still on the list remains",
    JSON.stringify(junk.likes) === JSON.stringify({ "5": 1700000000000 }) && junk.ideaIds.join(",") === "2,3,5,8");

  const empty = { ideaIds: [2], likes: [] };
  check("a likes array is dropped", util.migrateListLikes(empty) === true && empty.likes == null);

  const objects = { ideaIds: [{ id: 2, likedAt: 10 }, { id: 8, likedAt: "no" }, 3] };
  check("item objects flatten back to ids", util.migrateListLikes(objects) === true);
  check("the liked flag moved onto the plan and the ids are plain",
    objects.ideaIds.join(",") === "2,8,3" && objects.ideaIds.indexOf(2) !== -1 &&
    JSON.stringify(objects.likes) === JSON.stringify({ "2": 10 }));
  check("running migration again changes nothing", util.migrateListLikes(objects) === false);

  const plan = { ideaIds: [2, 3], likes: {} };
  check("toggle on stores a timestamp without reordering ids",
    util.toggleListLike(plan, 3, 1000) === true && plan.ideaIds.join(",") === "2,3" && plan.likes["3"] === 1000);
  check("a second like is independent",
    util.toggleListLike(plan, 2, 2000) === true && plan.likes["2"] === 2000 && plan.likes["3"] === 1000);
  check("toggling again clears just that one",
    util.toggleListLike(plan, 2, 3000) === true && plan.likes["2"] == null && plan.likes["3"] === 1000);
  check("an id that is not on the list cannot be liked",
    util.toggleListLike(plan, 99, 4000) === false && plan.likes["99"] == null);
  check("removing the activity forgets its like",
    util.forgetListLike(plan, 3) === true && plan.likes == null);
});

section("a planning list shows the star, sorts liked rows up, and remembers it", () => {
  const store = { spark_state_v1: JSON.stringify(storedPlan()) };
  const t = loadApp(store);
  const title = {};
  [2, 3, 5, 8].forEach(id => { title[id] = t.IDEAS_BY_ID[id].title; });

  let screen = openPlan(t);
  check("an older list is newest-first and nothing is a top pick",
    cardTitles(screen).join("|") === [title[8], title[5], title[3], title[2]].join("|"),
    cardTitles(screen).join("|"));
  const buttons = likeButtons(screen);
  check("each activity has a star button", buttons.length === 4, String(buttons.length));
  check("the star is a button, not a swipe",
    buttons.every(btn => btn.tagName === "BUTTON" && btn.getAttribute("type") === "button" && btn.getAttribute("aria-pressed") === "false"));
  check("nothing is badged yet", textOf(screen).indexOf("Top pick") === -1);

  check("liking two activities persists",
    t.togglePlanLike("plan_sat", 3, 1000) === true && t.togglePlanLike("plan_sat", 2, 2000) === true);
  const saved = JSON.parse(store.spark_state_v1);
  check("the like timestamps are on the saved plan",
    saved.datePlans[0].likes["2"] === 2000 && saved.datePlans[0].likes["3"] === 1000);
  check("saving a like does not reorder the stored ids",
    saved.datePlans[0].ideaIds.join(",") === "2,3,5,8");

  const reloaded = loadApp(store);
  screen = openPlan(reloaded);
  check("after a reload the latest like is on top",
    cardTitles(screen).join("|") === [title[2], title[3], title[8], title[5]].join("|"),
    cardTitles(screen).join("|"));
  const cards = savedCards(screen);
  check("the top two cards carry the liked accent",
    cards[0].className.indexOf("is-liked") !== -1 && cards[1].className.indexOf("is-liked") !== -1 &&
    cards[2].className.indexOf("is-liked") === -1);
  check("liked cards say Top pick and the star is pressed",
    textOf(cards[0]).indexOf("Top pick") !== -1 &&
    likeButtons(screen)[0].getAttribute("aria-pressed") === "true" &&
    likeButtons(screen)[2].getAttribute("aria-pressed") === "false");
  check("a liked planning card uses the star instead of the plain bookmark",
    classBlob(cards[0]).indexOf("saved-bookmark") === -1 && String(likeButtons(screen)[0].className).indexOf("is-on") !== -1);

  check("unliking the top one persists too", reloaded.togglePlanLike("plan_sat", 2, 3000) === true);
  const again = loadApp(store);
  screen = openPlan(again);
  check("the remaining like stays first and the cleared one returns to the old order",
    cardTitles(screen).join("|") === [title[3], title[8], title[5], title[2]].join("|"),
    cardTitles(screen).join("|"));

  again.removeIdeaFromBucket(3, { type: "plan", planId: "plan_sat" });
  again.saveState();
  const afterRemove = JSON.parse(store.spark_state_v1);
  check("taking an activity off the list drops its like",
    afterRemove.datePlans[0].likes == null && afterRemove.datePlans[0].ideaIds.join(",") === "2,5,8");

  const shared = again.encodePlanShare(again.state.datePlans[0]);
  const decoded = again.decodePlanShare(shared);
  check("a shared link still follows stored id order",
    decoded && decoded.ideaIds.join(",") === "2,5,8", decoded && decoded.ideaIds.join(","));
});

section("old on-device plans open, and Favorites and Done stay as they were", () => {
  const legacyStore = {
    spark_state_v1: JSON.stringify(storedPlan({
      datePlans: [{
        id: "plan_sat", name: "Saturday", date: "2026-11-07", createdAt: "2026-10-01",
        ideaIds: [2, 3, 5]
      }],
      somedayIds: [5],
      doneIds: [{ id: 8, date: "2026-10-04" }]
    }))
  };
  const legacy = loadApp(legacyStore);
  check("a saved plan from before likes has no likes field", legacy.state.datePlans[0].likes == null);
  const legacySaved = JSON.parse(legacyStore.spark_state_v1);
  check("loading that plan does not invent a likes field",
    legacySaved.datePlans[0].likes == null && legacySaved.datePlans[0].ideaIds.join(",") === "2,3,5");
  const title = {};
  [2, 3, 5].forEach(id => { title[id] = legacy.IDEAS_BY_ID[id].title; });
  let screen = openPlan(legacy);
  check("the old list still opens newest first",
    cardTitles(screen).join("|") === [title[5], title[3], title[2]].join("|"),
    cardTitles(screen).join("|"));

  const messy = loadApp({
    spark_state_v1: JSON.stringify(storedPlan({
      datePlans: [{
        id: "plan_sat", name: "Saturday", date: "2026-11-07", createdAt: "2026-10-01",
        ideaIds: [{ id: 2, likedAt: 10 }, { id: 8, likedAt: "no" }, 3, 5],
        likes: { "5": "1700000000000", "99": 42, "3": "nope" }
      }]
    }))
  });
  check("object rows become ids and only real likes survive",
    messy.state.datePlans[0].ideaIds.join(",") === "2,8,3,5" &&
    messy.state.datePlans[0].ideaIds.indexOf(2) !== -1 &&
    JSON.stringify(messy.state.datePlans[0].likes) === JSON.stringify({ "2": 10, "5": 1700000000000 }));
  const messyTitles = cardTitles(openPlan(messy));
  check("the migrated likes sort latest first",
    messyTitles[0] === messy.IDEAS_BY_ID[5].title && messyTitles[1] === messy.IDEAS_BY_ID[2].title,
    messyTitles.join("|"));

  legacy.ui.savedBucket = { type: "someday" };
  screen = legacy.buildSavedScreen();
  check("Favorites has no like control",
    likeButtons(screen).length === 0 && classBlob(screen).indexOf("saved-bookmark") !== -1 &&
    textOf(screen).indexOf(title[5]) !== -1);

  legacy.ui.savedBucket = { type: "done" };
  screen = legacy.buildSavedScreen();
  check("Done keeps ratings and has no like control",
    likeButtons(screen).length === 0 && textOf(screen).indexOf("Snowshoe Out and Camp in the Snow") !== -1 &&
    textOf(screen).indexOf("Top pick") === -1);
});

section("a liked past activity stays gray and still sorts to the top", () => {
  const past = {
    id: "db:4242",
    dbId: 4242,
    title: "Lantern walk",
    description: "A night walk.",
    materials: [],
    season: ["Fall"],
    time: ["Evening"],
    vibe: ["Chill"],
    stage: ["First Date"],
    dateType: ["Solo/Couple"],
    food: false,
    cost: "Free",
    setting: "Outdoor",
    category: "Hiking & Nature",
    expires_at: "2020-01-01",
    expiresAt: "2020-01-01",
    occurrences: null,
    openNow: true
  };
  const store = {
    spark_state_v1: JSON.stringify(storedPlan({
      remoteIdeas: { "db:4242": past },
      datePlans: [{
        id: "plan_sat", name: "Saturday", date: "", createdAt: "2026-01-01",
        ideaIds: [past.id, 2, 3],
        likes: { "db:4242": 5000 },
        friendPicks: [{ id: "fp1", friendName: "Emma R.", avatarEmoji: "E", avatarColor: "#FF9F6B", ideaId: 2 }]
      }]
    }))
  };
  const t = loadApp(store);
  check("the past activity is still past", t.ideaIsPast(t.IDEAS_BY_ID[past.id]) === true);
  const screen = openPlan(t);
  const cards = savedCards(screen);
  const titles = cardTitles(screen);
  check("the liked past row is first, then the friend's pick, then the rest",
    titles.join("|") === ["Lantern walk", t.IDEAS_BY_ID[2].title, t.IDEAS_BY_ID[3].title].join("|"),
    titles.join("|"));
  check("the past like keeps Past and a muted top-pick badge",
    cards[0].className.indexOf("is-past") !== -1 && cards[0].className.indexOf("is-liked") !== -1 &&
    textOf(cards[0]).indexOf("Past") !== -1 && textOf(cards[0]).indexOf("Top pick") !== -1 &&
    textOf(cards[0]).indexOf("Open now") === -1);
  check("the friend pick is still marked and is not itself liked",
    textOf(cards[1]).indexOf("picked this!") !== -1 && cards[1].className.indexOf("is-liked") === -1);
  check("the live unliked row has no accent",
    cards[2].className.indexOf("is-liked") === -1 && cards[2].className.indexOf("is-past") === -1);
});

section("the accent uses the orange tokens and does not add a second swipe", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "style.css"), "utf8");
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  check("day and night orange tokens are both set",
    css.indexOf("--color-orange:#E07A2F") !== -1 && css.indexOf("--color-orange-ink:#8A3E08") !== -1 &&
    css.indexOf("--color-orange:#F0A05A") !== -1 && css.indexOf("--color-orange-soft:#3A2A1E") !== -1);
  check("a liked card uses the orange edge",
    css.indexOf(".saved-card.is-liked") !== -1 && css.indexOf("border-top:3px solid var(--color-orange)") !== -1);
  check("a past liked card keeps the gray ground",
    css.indexOf(".saved-card.is-past.is-liked") !== -1 && css.indexOf("background:var(--surface-soft)") !== -1);
  check("there is still one swipe direction lock", src.split("SparkUtil.lockSwipeAxis").length - 1 === 1);
  check("there is still one swipe-to-delete handler", src.split("function buildSwipeToDeleteRow").length - 1 === 1);
});

const result = { pass: pass, fail: fail };
module.exports = result;
