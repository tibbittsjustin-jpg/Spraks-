/* Alcohol-centered ideas carry age21, and Hide 21+ drops them. */
"use strict";

const fs = require("fs");
const path = require("path");
const { loadApp } = require("./harness");
const { loadIdeas } = require("../db/seed");

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

const AGE21 = [505, 606, 653, 908, 940, 1021, 1145, 1390, 1556, 1576, 1604, 1811, 1818, 1948, 1958, 1971];
const KEY = "spark_state_v1";

section("age21 flags and the Hide 21+ toggle", () => {
  const ideas = loadIdeas(path.join(__dirname, "..", "public", "data.js"));
  const expected = new Set(AGE21);
  const flagged = ideas.filter(idea => idea.age21 === true).map(idea => idea.id);
  const missing = AGE21.filter(id => flagged.indexOf(id) === -1);
  const extra = flagged.filter(id => !expected.has(id));
  const bad = ideas.filter(idea => idea.age21 != null && idea.age21 !== true && idea.age21 !== false);
  check("exactly the 16 alcohol-centered ideas are age21",
    missing.length === 0 && extra.length === 0 && flagged.length === 16,
    "missing " + missing.join(",") + " extra " + extra.join(","));
  check("every other age21 is absent or false", bad.length === 0, bad.map(idea => idea.id).join(","));

  const t = loadApp({});
  const hide = Object.assign({}, t.state.filters, { hide21: true });
  const show = Object.assign({}, t.state.filters, { hide21: false });
  check("Hide 21+ hides #1604", t.matchesFilters(t.IDEAS_BY_ID[1604], hide) === false);
  check("Hide 21+ still shows #2", t.matchesFilters(t.IDEAS_BY_ID[2], hide) === true);
  check("Hide 21+ off shows #1604", t.matchesFilters(t.IDEAS_BY_ID[1604], show) === true);
  check("Hide 21+ off shows #2", t.matchesFilters(t.IDEAS_BY_ID[2], show) === true);
  check("the toggle counts as an active filter", t.activeFilterCount(hide) === t.activeFilterCount(show) + 1);

  const hidden = ideas.filter(idea => !t.matchesFilters(idea, hide)).map(idea => idea.id);
  check("Hide 21+ hides exactly the flagged ideas when nothing else is set",
    hidden.length === AGE21.length && hidden.every(id => expected.has(id)));

  const card = t.buildSwipeCard(t.IDEAS_BY_ID[1604], false);
  const plain = t.buildSwipeCard(t.IDEAS_BY_ID[2], false);
  check("the activity card shows a 21+ badge", card.innerHTML.indexOf('class="badge-21"') !== -1);
  const withPhoto = Object.assign({}, t.IDEAS_BY_ID[1604], { photo: { url: "https://example.com/wine.jpg" } });
  const photoCard = t.buildSwipeCard(withPhoto, false);
  check("the photo card shows a 21+ badge",
    photoCard.className.indexOf("has-photo") !== -1 && photoCard.innerHTML.indexOf('class="badge-21"') !== -1);
  check("a card that is not 21+ has no badge", plain.innerHTML.indexOf("badge-21") === -1);
  const detail = t.buildDetailScreen(1604);
  const title = (detail.children || []).filter(node => node.className === "detail-title")[0];
  const plainDetail = t.buildDetailScreen(2);
  const plainTitle = (plainDetail.children || []).filter(node => node.className === "detail-title")[0];
  check("the detail screen shows a 21+ badge",
    !!title && title.innerHTML.indexOf('class="badge-21"') !== -1, title && title.innerHTML);
  check("another detail screen has no 21+ badge",
    !!plainTitle && plainTitle.innerHTML.indexOf("badge-21") === -1);
  const appSrc = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  check("the filter sheet has a Hide 21+ chip", appSrc.indexOf('el("button", "chip", "Hide 21+")') !== -1);
});

section("older saved filters gain hide21", () => {
  const storage = {};
  storage[KEY] = JSON.stringify({
    onboarded: true,
    filters: { duration: [], cost: [], time: [], setting: [], vibe: [], season: [], stage: [], dateType: [], food: null }
  });
  const t = loadApp(storage);
  check("a saved state without hide21 loads as off", t.state.filters.hide21 === false);
  check("Hide 21+ off still shows an age21 idea after load",
    t.matchesFilters(t.IDEAS_BY_ID[1604], t.state.filters) === true);
});

module.exports = { pass: pass, fail: fail };
