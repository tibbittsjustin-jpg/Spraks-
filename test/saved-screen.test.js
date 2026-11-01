/* Saved screen cards: photo, meta, and the open-now badge follow the idea.
   Folder pills map to date plans, Favorites, and Done. */

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

function classesOf(node) {
  let out = node && node.className ? node.className + "\n" : "";
  (node && node.children || []).forEach(child => { out += classesOf(child); });
  return out;
}

function copyIdea(t, id) {
  const src = t.IDEAS_BY_ID[id];
  const idea = {};
  Object.keys(src).forEach(k => { idea[k] = src[k]; });
  return idea;
}

section("A catalog idea uses its photo and cost, and no invented status", () => {
  const t = loadApp({});
  const idea = copyIdea(t, 2);
  check("idea 2 has a mapped photo", !!(idea.photo && idea.photo.url));
  const card = t.buildSavedCard(idea);
  const html = textOf(card);
  const classes = classesOf(card);
  check("card is a saved card", card.className.indexOf("saved-card") !== -1, card.className);
  check("thumbnail uses the photos map", html.indexOf(idea.photo.url) !== -1, html.slice(0, 240));
  check("title is the idea title", html.indexOf("Palisades After the Powder") !== -1);
  check("meta includes the cost", html.indexOf("Free") !== -1);
  check("no distance is invented", html.indexOf(" mi") === -1, html);
  check("bookmark is present", classes.indexOf("saved-bookmark") !== -1 && html.indexOf("<svg") !== -1);
  check("open now is absent without the flag", html.indexOf("Open now") === -1 && classes.indexOf("saved-badge") === -1);
  check("no tonight or weekend chip is invented", html.indexOf("Tonight") === -1 && html.indexOf("Weekend") === -1);
});

section("Missing photo gets a placeholder; distance and open now render when set", () => {
  const t = loadApp({});
  const plain = copyIdea(t, 3);
  delete plain.photo;
  const plainCard = t.buildSavedCard(plain);
  const plainHtml = textOf(plainCard);
  check("placeholder class with no image",
    classesOf(plainCard).indexOf("is-placeholder") !== -1 && plainHtml.indexOf("<img") === -1);
  check("cost still shows", plainHtml.indexOf("$1-$10") !== -1);

  const rich = copyIdea(t, 2);
  rich.distanceMiles = 3.2;
  rich.openNow = true;
  rich.cost = "Free";
  const richCard = t.buildSavedCard(rich);
  const richHtml = textOf(richCard);
  check("meta joins distance and cost", richHtml.indexOf("3.2 mi · Free") !== -1, richHtml);
  check("open now badge uses the open style",
    richHtml.indexOf("Open now") !== -1 && classesOf(richCard).indexOf("saved-badge-open") !== -1);
});

section("Unavailable ideas stay unlabeled as a live place", () => {
  const t = loadApp({});
  const idea = copyIdea(t, 2);
  idea.unavailable = true;
  idea.openNow = true;
  idea.distanceMiles = 4;
  idea.photo = { url: "https://example.test/secret.jpg", credit: "" };
  const html = textOf(t.buildSavedCard(idea));
  check("says it is no longer available", html.indexOf("No longer available") !== -1);
  check("does not show open now or the distance", html.indexOf("Open now") === -1 && html.indexOf("4 mi") === -1);
  check("does not add a link out", html.indexOf("<a ") === -1 && html.indexOf("href=") === -1);
});

section("Pills are the real folders, Favorites, and Done", () => {
  const store = {
    spark_state_v1: JSON.stringify({
      onboarded: true,
      hasSeenTutorial: true,
      profile: { name: "A", gender: "Woman", photo: null, ageConfirmedAt: "2026-01-15T00:00:00.000Z" },
      datePlans: [{
        id: "plan_sat", name: "Saturday", date: "2026-10-31", createdAt: "2026-10-01",
        ideaIds: [2, 3], friendPicks: [{ friendName: "Emma R.", avatarEmoji: "E", ideaId: 2 }]
      }],
      somedayIds: [5],
      doneIds: [{ id: 8, date: "2026-10-04" }],
      settings: { autoDarkMode: false }
    })
  };
  const t = loadApp(store);
  let html = textOf(t.buildSavedScreen());
  check("favorites pill has its count", html.indexOf("Favorites · 1") !== -1, html.slice(0, 400));
  check("plan pill uses the plan name and count", html.indexOf("Saturday · 2") !== -1);
  check("done pill is present", html.indexOf("Done · 1") !== -1);
  check("new plan stays available", html.indexOf("Plan a New Date") !== -1);
  check("does not invent a This week folder", html.indexOf("This week") === -1);
  check("the index does not open a list on its own",
    html.indexOf("Get Pulled by a Snow Kite") === -1 && html.indexOf("All lists") === -1);
  check("the index has no share-plan button", html.indexOf("Share plan") === -1);
  const satAt = html.indexOf("Saturday · 2");
  const favAt = html.indexOf("Favorites · 1");
  const doneAt = html.indexOf("Done · 1");
  check("unpinned plan sits after Favorites and Done is last",
    satAt !== -1 && favAt !== -1 && doneAt !== -1 && favAt < satAt && satAt < doneAt,
    [favAt, satAt, doneAt].join(","));

  t.ui.savedBucket = { type: "someday" };
  html = textOf(t.buildSavedScreen());
  check("opening Favorites shows its idea and a way back",
    html.indexOf("Get Pulled by a Snow Kite") !== -1 && html.indexOf("All lists") !== -1);
  check("favorites view has no share-plan button", html.indexOf("Share plan") === -1);

  t.ui.savedBucket = { type: "plan", planId: "plan_sat" };
  html = textOf(t.buildSavedScreen());
  check("plan view keeps Share plan", html.indexOf("Share plan") !== -1 && html.indexOf("Share with Friends") !== -1);
  check("plan view keeps delete", html.indexOf("Delete plan") !== -1);
  check("plan date is still shown", html.indexOf("2026") !== -1);
  check("friend pick still renders", html.indexOf("picked this!") !== -1 && html.indexOf("Emma R.") !== -1);
  check("plan ideas render as cards", html.indexOf("saved-card-title") !== -1 || html.indexOf("Palisades After the Powder") !== -1);

  t.ui.savedBucket = { type: "done" };
  html = textOf(t.buildSavedScreen());
  check("done list shows the completed idea and date",
    html.indexOf("Snowshoe Out and Camp in the Snow") !== -1 && html.indexOf("Done ") !== -1, html.slice(0, 500));
});

section("Pinned planning lists sit above Favorites, and old saves still load", () => {
  const store = {
    spark_state_v1: JSON.stringify({
      onboarded: true,
      hasSeenTutorial: true,
      profile: { name: "A", gender: "Woman", photo: null, ageConfirmedAt: "2026-01-15T00:00:00.000Z" },
      datePlans: [
        { id: "plan_old", name: "Anniversary", date: "2026-02-14", createdAt: "2026-01-01", ideaIds: [2], pinned: true },
        { id: "plan_new", name: "Friday night", date: "2026-11-06", createdAt: "2026-10-02", ideaIds: [3, 5] }
      ],
      somedayIds: [8],
      doneIds: [{ id: 4, date: "2026-09-01" }],
      settings: { autoDarkMode: false }
    })
  };
  const t = loadApp(store);
  check("a legacy pinned flag migrates into the pin list",
    t.state.pinnedPlanIds.join(",") === "plan_old" && t.state.datePlans[0].pinned == null);
  let folders = t.listSavedFolders().map(folder => folder.label);
  check("order is pinned, Favorites, other plans, Done",
    folders.join("|") === "Anniversary|Favorites|Friday night|Done", folders.join("|"));
  check("pinning moves a plan to the top", t.pinPlan("plan_new") === true);
  folders = t.listSavedFolders().map(folder => folder.label);
  check("the newest pin is first and Favorites stays second",
    folders.join("|") === "Friday night|Anniversary|Favorites|Done", folders.join("|"));
  check("unpin puts it back with the other plans", t.unpinPlan("plan_new") === true);
  folders = t.listSavedFolders().map(folder => folder.label);
  check("unpinned order is newest plan first",
    folders.join("|") === "Anniversary|Favorites|Friday night|Done", folders.join("|"));

  const reloaded = loadApp(store);
  check("pins survive a reload", reloaded.state.pinnedPlanIds.join(",") === "plan_old");

  const bare = {
    spark_state_v1: JSON.stringify({
      onboarded: true,
      hasSeenTutorial: true,
      profile: { name: "A", gender: "Woman", photo: null, ageConfirmedAt: "2026-01-15T00:00:00.000Z" },
      savedIds: [2],
      datePlans: [{ id: "plan_keep", name: "Picnic", date: "", createdAt: "2026-01-01", ideaIds: [3] }],
      settings: { autoDarkMode: false }
    })
  };
  const old = loadApp(bare);
  check("an older save with no pin list still opens",
    Array.isArray(old.state.pinnedPlanIds) && old.state.pinnedPlanIds.length === 0 &&
    old.state.somedayIds.indexOf(2) !== -1 && old.state.datePlans[0].name === "Picnic");
  check("deleting a plan asks with the Jaderoo name in the message",
    old.planDeleteMessage(old.state.datePlans[0]).indexOf("Jaderoo") !== -1 &&
    old.planDeleteMessage(old.state.datePlans[0]).indexOf("Picnic") !== -1);
  old.deletePlan("plan_keep");
  check("delete removes the plan and any pin",
    old.state.datePlans.length === 0 && old.state.pinnedPlanIds.indexOf("plan_keep") === -1);
});

section("Plan rows reuse swipe-left Delete; Favorites and Done do not", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  check("saved rows still use the shared direction lock", src.split("SparkUtil.lockSwipeAxis").length - 1 === 1);
  check("there is still one swipe-to-delete handler", src.split("function buildSwipeToDeleteRow").length - 1 === 1);

  const store = {
    spark_state_v1: JSON.stringify({
      onboarded: true,
      hasSeenTutorial: true,
      profile: { name: "A", gender: "Woman", photo: null, ageConfirmedAt: "2026-01-15T00:00:00.000Z" },
      datePlans: [{
        id: "plan_sat", name: "Saturday", date: "2026-10-31", createdAt: "2026-10-01", ideaIds: [2]
      }],
      somedayIds: [5],
      doneIds: [{ id: 8, date: "2026-10-04" }],
      settings: { autoDarkMode: false }
    })
  };
  const t = loadApp(store);
  const screen = t.buildSavedScreen();
  const nodes = [];
  (function walk(node){
    if (!node) return;
    nodes.push(node);
    (node.children || []).forEach(walk);
  })(screen);
  const swipes = nodes.filter(node => {
    const name = String(node.className || "");
    return name === "swipeable-row" || name.indexOf("swipeable-row ") === 0;
  });
  check("only the planning list swipes", swipes.length === 1, String(swipes.length));
  const swipeHtml = textOf(swipes[0]);
  check("a left swipe reveals Delete on the plan", swipeHtml.indexOf("Delete") !== -1 && swipeHtml.indexOf("Saturday") !== -1);
  check("the plan menu can pin and delete without a swipe",
    swipeHtml.indexOf("Pin list") !== -1 && swipeHtml.indexOf("Delete list") !== -1);
  const labels = nodes.map(node => node.getAttribute && node.getAttribute("aria-label")).filter(Boolean);
  check("the plan menu button has an accessible name", labels.indexOf("Actions for Saturday") !== -1);
  check("Favorites and Done are not inside the swipe row",
    swipeHtml.indexOf("Favorites ·") === -1 && swipeHtml.indexOf("Done ·") === -1);
  const screenHtml = textOf(screen);
  check("Favorites and Done are still on the index",
    screenHtml.indexOf("Favorites · 1") !== -1 && screenHtml.indexOf("Done · 1") !== -1);
});

section("A past saved activity stays in the list and reads as past", () => {
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
  const live = {
    id: "db:4243",
    dbId: 4243,
    title: "Morning market",
    description: "Stalls and coffee.",
    materials: [],
    season: ["Fall"],
    time: ["Morning"],
    vibe: ["Chill"],
    stage: ["First Date"],
    dateType: ["Solo/Couple"],
    food: false,
    cost: "Free",
    setting: "Outdoor",
    category: "Hiking & Nature",
    expires_at: null,
    expiresAt: null,
    occurrences: null
  };
  const store = {
    spark_state_v1: JSON.stringify({
      onboarded: true,
      hasSeenTutorial: true,
      profile: { name: "A", gender: "Woman", photo: null, ageConfirmedAt: "2026-01-15T00:00:00.000Z" },
      somedayIds: [past.id],
      doneIds: [{ id: past.id, date: "2020-01-01" }],
      remoteIdeas: { "db:4242": past },
      datePlans: [{ id: "plan_keep", name: "Winter", date: "", createdAt: "2026-01-01", ideaIds: [past.id], friendPicks: [] }],
      settings: { autoDarkMode: false }
    })
  };
  const t = loadApp(store);
  delete t.IDEAS_BY_ID[past.id];
  t.REMOTE_IDEAS.length = 0;
  t.applyRemoteIdeas([live]);
  check("the feed merge keeps the saved id", t.state.somedayIds.indexOf(past.id) !== -1);
  check("the plan still holds the saved id", t.state.datePlans[0].ideaIds.indexOf(past.id) !== -1);
  check("the snapshot is back after the feed drops it", t.IDEAS_BY_ID[past.id] && t.IDEAS_BY_ID[past.id].title === "Lantern walk");
  check("the expired activity is not dealt into the deck", t.computeDeck().remaining.indexOf(past.id) === -1);
  const elevenThirty = new Date("2026-11-01T05:30:00.000Z");
  check("Denver still counts the expires_at day as current at 11:30pm",
    t.ideaIsPast({ expires_at: "2026-10-31", occurrences: null }, elevenThirty) === false);
  check("the saved lantern walk is past", t.ideaIsPast(t.IDEAS_BY_ID[past.id]) === true);

  t.ui.savedBucket = { type: "someday" };
  const fav = textOf(t.buildSavedScreen());
  const favClasses = classesOf(t.buildSavedScreen());
  check("Favorites still shows the past activity", fav.indexOf("Lantern walk") !== -1);
  check("the past card is marked and still has its title",
    favClasses.indexOf("is-past") !== -1 && fav.indexOf("Past") !== -1 && fav.indexOf("Open now") === -1);

  t.ui.savedBucket = { type: "done" };
  const doneScreen = t.buildSavedScreen();
  const done = textOf(doneScreen);
  const doneClasses = classesOf(doneScreen);
  check("Done keeps its own list and still shows the past activity",
    done.indexOf("Lantern walk") !== -1 && done.indexOf("Past") !== -1 && done.indexOf("Done ") !== -1);
  check("a past Done card stays gray and can still be rated",
    doneClasses.indexOf("is-past") !== -1 && done.indexOf("Rate this") !== -1);
});

const result = { pass: pass, fail: fail };
module.exports = result;
