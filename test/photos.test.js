/* Approved photo map: every photos.json id is a real idea. The four
   ideas removed from the catalog (336, 778, 1424, 1548) are not in the
   map. Every url points at a file under public/photos, and the deck
   attaches that photo. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
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
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 500)); }
}

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const PHOTOS_ROOT = path.join(PUBLIC, "photos");
/* Same ids as test/removed-ids.test.js. They are not in the map.
   Id 340 was already absent. */
const REMOVED = [336, 778, 1424, 1548];

function loadPhotoMap() {
  const sandbox = {};
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(PUBLIC, "photos.js"), "utf8");
  vm.runInContext(src + "\nglobalThis.__P = IDEA_PHOTOS;", sandbox, { filename: "photos.js" });
  return sandbox.__P;
}

function resolvePhoto(url) {
  if (typeof url !== "string" || url.indexOf("photos/") !== 0 || url.indexOf("..") !== -1) return null;
  const abs = path.resolve(PUBLIC, url);
  if (abs !== PHOTOS_ROOT && abs.indexOf(PHOTOS_ROOT + path.sep) !== 0) return null;
  return abs;
}

function walkFiles(dir, acc) {
  fs.readdirSync(dir).forEach(name => {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walkFiles(p, acc);
    else acc.push(p);
  });
  return acc;
}

section("every idea id exists and every photo file resolves", () => {
  const ideas = loadIdeas(path.join(PUBLIC, "data.js"));
  const ideaIds = new Set(ideas.map(idea => idea.id));
  const json = JSON.parse(fs.readFileSync(path.join(PUBLIC, "photos.json"), "utf8"));
  const fromJs = loadPhotoMap();
  check("photos.js is the photos.json map", JSON.stringify(fromJs) === JSON.stringify(json));

  const ids = Object.keys(json);
  check("the approved map covers the catalog", ids.length >= ideas.length, String(ids.length));

  const unknown = [];
  const missingFiles = [];
  const unsafe = [];
  const referenced = new Set();
  ids.forEach(key => {
    const id = Number(key);
    const entry = json[key];
    if (!Number.isInteger(id) || String(id) !== key) unknown.push(key);
    else if (!ideaIds.has(id)) unknown.push(key);
    const url = entry && entry.url;
    const abs = resolvePhoto(url);
    if (!abs) unsafe.push(key + " " + url);
    else {
      referenced.add(abs);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) missingFiles.push(url);
    }
    if (!entry || typeof entry.credit !== "string" || !entry.credit.trim()) unsafe.push(key + " credit");
  });
  check("removed idea ids are gone from photos.json",
    REMOVED.every(id => !json[String(id)]));
  check("every photos.json id exists in the catalog",
    unknown.length === 0, unknown.slice(0, 8).join(","));

  const uncovered = ideas.filter(idea => !json[String(idea.id)]).map(idea => idea.id);
  check("every catalog idea has a photos.json entry", uncovered.length === 0, uncovered.slice(0, 8).join(","));
  check("every photo url is a file under public/photos",
    missingFiles.length === 0 && unsafe.length === 0,
    missingFiles.slice(0, 4).concat(unsafe.slice(0, 4)).join(","));

  const onDisk = walkFiles(PHOTOS_ROOT, []);
  const extra = onDisk.filter(p => !referenced.has(p));
  check("every file in public/photos is used by the map", extra.length === 0, extra.slice(0, 4).join(","));
  check("377 images in the approved set", referenced.size === 377 && onDisk.length === 377,
    "referenced " + referenced.size + " disk " + onDisk.length);

  const credits = fs.readFileSync(path.join(PUBLIC, "CREDITS.md"), "utf8");
  const aiLines = credits.split("\n").filter(line => line.indexOf("AI-generated image") !== -1 && line.indexOf("photos/") !== -1);
  check("seven AI-generated images are credited", aiLines.length === 7, String(aiLines.length));
  const page = fs.readFileSync(path.join(PUBLIC, "credits.html"), "utf8");
  check("credits page is linked from the app and names a license",
    page.indexOf("AI-generated image") !== -1 &&
    page.indexOf("creativecommons.org") !== -1 &&
    page.indexOf('href="./"') !== -1);
});

section("the deck shows each idea photo and its short credit", () => {
  const t = loadApp({});
  const ideas = loadIdeas(path.join(PUBLIC, "data.js"));
  const missing = [];
  const mismatched = [];
  ideas.forEach(idea => {
    const live = t.IDEAS_BY_ID[idea.id];
    const photo = t.ideaPhoto(live);
    if (!photo) missing.push(idea.id);
    else if (!live.photo || live.photo.url !== photo.url || live.photo.credit !== photo.credit) mismatched.push(idea.id);
  });
  check("every catalog idea gets a usable photo through idea.photo", missing.length === 0, missing.slice(0, 8).join(","));
  check("the attached field is the { url, credit } the card reads", mismatched.length === 0, mismatched.slice(0, 8).join(","));

  const sample = t.IDEAS_BY_ID[2];
  const card = t.buildSwipeCard(sample, true, 0);
  check("idea 2 renders the photo card", card.className === "swipe-card has-photo", card.className);
  check("idea 2 shows its file and short credit",
    card.innerHTML.indexOf(sample.photo.url) !== -1 && card.innerHTML.indexOf(sample.photo.credit) !== -1,
    sample.photo.credit);
  check("idea 2 image has explicit dimensions and loads now",
    card.innerHTML.indexOf('width="800"') !== -1 &&
    card.innerHTML.indexOf('height="1000"') !== -1 &&
    card.innerHTML.indexOf('loading="eager"') !== -1);

  const bare = {};
  Object.keys(sample).forEach(k => { bare[k] = sample[k]; });
  delete bare.photo;
  const cover = t.buildSwipeCard(bare, true, 0);
  check("an idea without a photo still uses the cover", cover.className === "swipe-card" && cover.innerHTML.indexOf('class="card-media"') !== -1);

  const before = t.matchesFilters(sample, t.state.filters);
  check("a photo does not change the default filter result", before === true);
});

module.exports = { pass, fail };
