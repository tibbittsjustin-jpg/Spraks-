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
  check("default folder shows the favorites idea", html.indexOf("Get Pulled by a Snow Kite") !== -1);
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

const result = { pass: pass, fail: fail };
module.exports = result;
