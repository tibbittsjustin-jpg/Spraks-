/* Discover card: full-bleed photo (H1) when idea.photo.url is set,
   and the existing cover-art card when it isn't. */

const { loadApp } = require("./harness.js");

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

function copyIdea(t, id) {
  const src = t.IDEAS_BY_ID[id];
  const idea = {};
  Object.keys(src).forEach(k => { idea[k] = src[k]; });
  return idea;
}

function cardOf(t, idea) {
  const card = t.buildSwipeCard(idea, false);
  return { className: card.className, html: card.innerHTML, id: card.dataset.id };
}

const HINT = "Tap for details · swipe up to save · down to pass";

section("No photo keeps the cover-art card", () => {
  const t = loadApp({});
  check("catalog idea 2 has a photo from the approved map", t.ideaPhoto(copyIdea(t, 2)) !== null);
  const idea = copyIdea(t, 2);
  delete idea.photo;
  check("clearing the photo field falls back", t.ideaPhoto(idea) === null);
  const card = cardOf(t, idea);
  check("class is the plain swipe card", card.className === "swipe-card", card.className);
  check("draws the generated cover", card.html.indexOf('class="card-media"') !== -1 && card.html.indexOf("background-image:") !== -1);
  check("keeps the body, full duration, and hint",
        card.html.indexOf('class="card-body"') !== -1 &&
        card.html.indexOf("Half-day (2-5 hrs)") !== -1 &&
        card.html.indexOf(">Free<") !== -1 &&
        card.html.indexOf(">Outdoor<") !== -1 &&
        card.html.indexOf(HINT) !== -1);
  check("does not render the photo frame or tiles",
        card.html.indexOf("card-photo") === -1 &&
        card.html.indexOf("card-stat") === -1 &&
        card.html.indexOf("Open now") === -1 &&
        card.html.indexOf("has-photo") === -1);
  check("still carries both swipe stamps",
        card.html.indexOf('class="stamp yes"') !== -1 && card.html.indexOf('class="stamp no"') !== -1);
  check("keeps the category badge", card.html.indexOf("Winter &amp; Snow Adventures") !== -1);
});

section("A photo url switches to the H1 card", () => {
  const t = loadApp({});
  const idea = copyIdea(t, 2);
  idea.photo = { url: "https://example.com/ridge.jpg", credit: "Photo: Eric Ward, CC BY-SA 2.0" };
  idea.distanceMiles = 6.4;
  idea.closesAt = "10 pm";
  idea.conditions = "❄ Fresh snow last night · clear until 9 pm";
  idea.openNow = true;

  const parsed = t.ideaPhoto(idea);
  check("photo field normalizes url and credit",
        parsed && parsed.url === "https://example.com/ridge.jpg" && parsed.credit.indexOf("Eric Ward") !== -1);

  const card = cardOf(t, idea);
  check("card is marked has-photo", card.className === "swipe-card has-photo", card.className);
  check("photo fills the card", card.html.indexOf("card-photo") !== -1 && card.html.indexOf("https://example.com/ridge.jpg") !== -1);
  check("photo image declares 800 by 1000",
        card.html.indexOf('width="800"') !== -1 && card.html.indexOf('height="1000"') !== -1);
  const top = t.buildSwipeCard(idea, true, 0);
  check("the front card loads its photo now", top.innerHTML.indexOf('loading="eager"') !== -1 && top.innerHTML.indexOf('fetchpriority="high"') !== -1);
  const buried = t.buildSwipeCard(idea, false, 2);
  check("a card two back waits to load", buried.innerHTML.indexOf('loading="lazy"') !== -1);
  check("scrim is present", card.html.indexOf("card-photo-scrim") !== -1);
  check("title sits in the overlay", card.html.indexOf("Palisades After the Powder") !== -1 && card.html.indexOf("card-photo-overlay") !== -1);
  check("no cover-art media and no hint",
        card.html.indexOf('class="card-media"') === -1 && card.html.indexOf(HINT) === -1);

  const dist = card.html.indexOf('data-stat="distance"');
  const hours = card.html.indexOf('data-stat="hours"');
  const cost = card.html.indexOf('data-stat="cost"');
  check("three stat tiles, distance then closing time then cost",
        dist !== -1 && hours > dist && cost > hours, card.html.slice(card.html.indexOf("card-stat-tiles"), card.html.indexOf("card-stat-tiles") + 500));
  check("distance tile is 6.4 mi from you",
        card.html.indexOf(">6.4 mi<") !== -1 && card.html.indexOf(">from you<") !== -1);
  check("closing tile is 10 pm / lot closes",
        card.html.indexOf(">10 pm<") !== -1 && card.html.indexOf(">lot closes<") !== -1);
  check("cost tile is Free / half-day",
        card.html.indexOf(">Free<") !== -1 && card.html.indexOf(">half-day<") !== -1);
  check("chips are setting, scene, and vibe — not the stats repeated",
        card.html.indexOf(">Outdoor<") !== -1 &&
        card.html.indexOf(">Snow<") !== -1 &&
        card.html.indexOf(">Adventurous<") !== -1 &&
        card.html.indexOf(">Half-day (2-5 hrs)<") === -1);
  check("coral conditions line", card.html.indexOf("Fresh snow last night") !== -1);
  check("photo credit", card.html.indexOf("Photo: Eric Ward, CC BY-SA 2.0") !== -1);
  check("category and Open now badges",
        card.html.indexOf("Winter &amp; Snow Adventures") !== -1 && card.html.indexOf("Open now") !== -1);
  check("swipe stamps still in the photo card",
        card.html.indexOf('class="stamp yes"') !== -1 && card.html.indexOf('class="stamp no"') !== -1);
  var threw = false;
  try { t.buildSwipeCard(idea, true); }
  catch (e) { threw = true; }
  check("attaching swipe handlers does not throw", threw === false);
});

section("Missing photo facts are omitted, not invented", () => {
  const t = loadApp({});
  const idea = copyIdea(t, 2);
  idea.photo = { url: "photos/local.jpg" };
  const card = cardOf(t, idea);
  check("relative photo path is accepted", card.className.indexOf("has-photo") !== -1);
  check("no credit element without a credit", card.html.indexOf("card-photo-credit") === -1);
  check("no distance or closing tile without those facts",
        card.html.indexOf('data-stat="distance"') === -1 && card.html.indexOf('data-stat="hours"') === -1);
  check("cost tile still renders from the idea", card.html.indexOf('data-stat="cost"') !== -1 && card.html.indexOf(">Free<") !== -1);
  check("no conditions line and no Open now badge",
        card.html.indexOf("card-conditions") === -1 && card.html.indexOf("Open now") === -1);
  check("whitespace credit is dropped", t.ideaPhoto({ photo: { url: "https://example.com/a.jpg", credit: "   " } }).credit === "");
});

section("Unsafe or empty photos fall back to the cover", () => {
  const t = loadApp({});
  const idea = copyIdea(t, 2);
  ["", "   ", "javascript:alert(1)", "data:text/html,hi", "https://x.test/a\".jpg", "../secret.jpg"].forEach(url => {
    idea.photo = { url: url, credit: "nope" };
    const card = cardOf(t, idea);
    check("rejected url stays on the cover: " + JSON.stringify(url).slice(0, 40),
          card.className === "swipe-card" && card.html.indexOf(HINT) !== -1 && card.html.indexOf("nope") === -1);
  });
  idea.photo = "https://example.com/a.jpg";
  check("a string photo is not a photo", cardOf(t, idea).className === "swipe-card");
  idea.photo = null;
  check("null photo is not a photo", t.ideaPhoto(idea) === null);

  const stray = copyIdea(t, 2);
  delete stray.photo;
  stray.imageUrl = "https://example.test/not-a-photo.jpg";
  const ev = cardOf(t, stray);
  check("an imageUrl without photo.url does not hotlink",
        ev.className === "swipe-card" && ev.html.indexOf("example.test") === -1 && ev.html.indexOf('class="card-media"') !== -1);
});

section("Photo does not change filtering", () => {
  const t = loadApp({});
  const idea = copyIdea(t, 2);
  const before = t.matchesFilters(idea, t.state.filters);
  idea.photo = { url: "https://example.com/ridge.jpg", credit: "c" };
  idea.distanceMiles = 6.4;
  idea.closesAt = "10 pm";
  idea.openNow = true;
  idea.conditions = "Clear";
  check("same filter result with photo facts attached", t.matchesFilters(idea, t.state.filters) === before);
  const narrow = Object.assign({}, t.state.filters, { cost: ["$100 and under"] });
  check("a budget filter still excludes this free idea", t.matchesFilters(idea, narrow) === false);
});

section("Duration caption", () => {
  const t = loadApp({});
  const idea = copyIdea(t, 3);
  idea.photo = { url: "https://example.com/ice.jpg" };
  const card = cardOf(t, idea);
  check("parenthetical duration shortens to the tile caption", card.html.indexOf(">half-day<") !== -1, idea.duration);
  check("closing tile stays absent without closesAt", card.html.indexOf('data-stat="hours"') === -1);
});

module.exports = { pass, fail };
