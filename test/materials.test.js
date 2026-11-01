/* Materials lists on every curated idea, on the detail screen, and on
   nearby cards. Titles and descriptions come from the rewrite file via
   scripts/apply-rewrites.js. These checks follow the data: they do not
   name a title. */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { loadIdeas, validateIdeas } = require("../db/seed");
const { loadApp } = require("./harness");
const { escapeHtml } = require("../public/util");
const nearby = require("../server");

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

const ROOT = path.join(__dirname, "..");
const ideas = loadIdeas(path.join(ROOT, "public", "data.js"));

// Snapshot of every field except title, description, and materials, taken
// before the rewrite. Applying a new rewrites file does not change it.
const FIELDS_HASH = "190f414afc0c764708e0bb1b556a54afd0a312e0e8dfd9743b9fe5cbca30d754";
const TAIL_HASH = "a0640c4922256cb7a9a086ce8c8a3afad5755221571f91faa890490c2dfe64bd";

function fieldsExceptCopy(idea) {
  const out = {};
  Object.keys(idea).sort().forEach(key => {
    if (key === "title" || key === "description" || key === "materials") return;
    out[key] = idea[key];
  });
  return out;
}

function byClass(node, cls) {
  const found = [];
  (function walk(n) {
    if (!n || typeof n !== "object") return;
    if (n.className === cls) found.push(n);
    (n.children || []).forEach(walk);
  })(node);
  return found;
}

function rejected(materials) {
  try {
    validateIdeas([Object.assign({}, ideas[0], { materials: materials })]);
    return false;
  } catch (err) {
    return err.code === "invalid_ideas" && String(err.message).indexOf("materials") !== -1;
  }
}

section("every idea has a materials list", () => {
  const bad = [];
  const titles = new Map();
  ideas.forEach(idea => {
    const keys = Object.keys(idea);
    if (keys[keys.indexOf("description") + 1] !== "materials") bad.push(idea.id + " order");
    if (!Array.isArray(idea.materials)) bad.push(idea.id + " type");
    else if (idea.materials.length > 6) bad.push(idea.id + " count");
    else {
      idea.materials.forEach(item => {
        if (typeof item !== "string" || item.length === 0 || item.length > 60 || item !== item.trim()) {
          bad.push(idea.id + " item");
        }
      });
    }
    if (typeof idea.title !== "string" || idea.title.length === 0 || idea.title.length > 40) bad.push(idea.id + " title");
    if (titles.has(idea.title)) bad.push(idea.id + " duplicate");
    else titles.set(idea.title, idea.id);
    if (typeof idea.description === "string" && /[—–]/.test(idea.description)) bad.push(idea.id + " dash");
  });
  check("materials is an array of at most 6 short strings, placed after description", bad.length === 0, bad.slice(0, 8).join(", "));
  check("titles are unique and at most 40 characters",
    titles.size === ideas.length && bad.every(item => item.indexOf("title") === -1 && item.indexOf("duplicate") === -1));
  check("no description contains an em or en dash", bad.every(item => item.indexOf("dash") === -1));
  const hash = crypto.createHash("sha256").update(JSON.stringify(ideas.map(fieldsExceptCopy))).digest("hex");
  check("category, cost, tags, scene, motif, and the other non-text fields are unchanged", hash === FIELDS_HASH, hash);
  const src = fs.readFileSync(path.join(ROOT, "public", "data.js"), "utf8");
  const tail = crypto.createHash("sha256").update(src.slice(src.indexOf("\n"))).digest("hex");
  check("lines after the ideas catalog are unchanged", tail === TAIL_HASH, tail);
  const withItems = ideas.filter(idea => idea.materials.length > 0).length;
  const withNone = ideas.filter(idea => idea.materials.length === 0).length;
  check("some ideas list materials and some need nothing", withItems > 0 && withNone > 0, withItems + " / " + withNone);
});

section("seed validation", () => {
  let accepted = true;
  try { validateIdeas(ideas); }
  catch (err) { accepted = false; }
  check("the catalog passes validateIdeas", accepted);
  check("a string is rejected", rejected("x"));
  check("seven items are rejected", rejected(["a", "b", "c", "d", "e", "f", "g"]));
  check("an empty item is rejected", rejected([""]));
  check("an untrimmed item is rejected", rejected([" boots"]));
  check("a 61-character item is rejected", rejected(["a".repeat(61)]));
  let missingOk = false;
  try {
    const copy = Object.assign({}, ideas[0]);
    delete copy.materials;
    validateIdeas([copy]);
    validateIdeas([Object.assign({}, ideas[0], { materials: null })]);
    missingOk = true;
  } catch (err) { missingOk = false; }
  check("omitted materials are allowed", missingOk);
});

section("detail screen", () => {
  const t = loadApp({});
  const listed = ideas.filter(idea => idea.materials.length > 0)[0];
  const empty = ideas.filter(idea => idea.materials.length === 0)[0];
  const listedScreen = t.buildDetailScreen(listed.id);
  const list = byClass(listedScreen, "detail-materials-list")[0];
  const listedClasses = (listedScreen.children || []).map(node => node.className);
  check("a stocked idea shows Materials needed under the description",
    listedClasses.indexOf("detail-materials") === listedClasses.indexOf("detail-desc") + 1 &&
    byClass(listedScreen, "detail-materials-title")[0].innerHTML === "Materials needed" &&
    list && list.children.length === listed.materials.length &&
    list.children[0].innerHTML === escapeHtml(listed.materials[0]));
  const emptyScreen = t.buildDetailScreen(empty.id);
  check("an empty list says Nothing needed",
    byClass(emptyScreen, "detail-materials-none")[0].innerHTML === "Nothing needed" &&
    byClass(emptyScreen, "detail-materials-list").length === 0);
  const bare = JSON.parse(JSON.stringify(listed));
  delete bare.materials;
  bare.id = 880001;
  bare.isEvent = true;
  t.IDEAS_BY_ID[bare.id] = bare;
  const hidden = t.buildDetailScreen(bare.id);
  check("a missing materials field hides the section",
    byClass(hidden, "detail-materials").length === 0);
  const escaped = JSON.parse(JSON.stringify(listed));
  escaped.id = 880002;
  escaped.materials = ["<b>rope</b>"];
  t.IDEAS_BY_ID[escaped.id] = escaped;
  const escapedList = byClass(t.buildDetailScreen(escaped.id), "detail-materials-list")[0];
  check("material items are HTML-escaped",
    escapedList && escapedList.children.length === 1 &&
    escapedList.children[0].innerHTML === "&lt;b&gt;rope&lt;/b&gt;" &&
    escapedList.children[0].innerHTML.indexOf("<b>") === -1);
  const card = t.buildSwipeCard(t.IDEAS_BY_ID[listed.id], false);
  check("the swipe card does not list materials",
    byClass(card, "detail-materials").length === 0 && String(card.innerHTML).indexOf("Materials needed") === -1);

  const kept = t.hydrateRealIdea({
    placeId: "gp-test", title: "Cafe stop", placeName: "Cafe", address: "1 Main", materials: [" A cup "]
  }, t.state.filters);
  check("hydrateRealIdea keeps an array of materials", JSON.stringify(kept.materials) === JSON.stringify([" A cup "]));
  const older = t.hydrateRealIdea({
    placeId: "gp-old", title: "Park walk", placeName: "Park", address: "2 Main"
  }, t.state.filters);
  check("hydrateRealIdea uses [] when materials is missing", JSON.stringify(older.materials) === "[]");
  delete older.materials;
  t.IDEAS_BY_ID[older.id] = older;
  check("an older saved nearby idea with no materials hides the section",
    byClass(t.buildDetailScreen(older.id), "detail-materials").length === 0);
});

section("nearby card mapping", () => {
  const messy = ["  Boots  ", "", "   ", 4, null, "a".repeat(80), "Water", "Snack", "Map", "Light", "Extra"];
  const cleaned = nearby.normalizeNearbyMaterials(messy);
  check("non-array materials become []",
    JSON.stringify(nearby.normalizeNearbyMaterials(undefined)) === "[]" &&
    JSON.stringify(nearby.normalizeNearbyMaterials(null)) === "[]" &&
    JSON.stringify(nearby.normalizeNearbyMaterials("rope")) === "[]");
  check("items are trimmed, clipped to 60 characters, and capped at 6",
    cleaned.length === 6 && cleaned[0] === "Boots" && cleaned[1] === "a".repeat(60) &&
    cleaned[5] === "Light" && cleaned.indexOf("Extra") === -1);
  const place = { name: "Cafe", placeId: "abc", address: "1 Main", mapsUrl: "https://example.com", rating: 4 };
  const card = nearby.mapNearbyCard({ title: "Coffee", materials: messy }, place);
  check("mapNearbyCard keeps the cleaned list", JSON.stringify(card.materials) === JSON.stringify(cleaned));
  const missing = nearby.mapNearbyCard({ title: "Coffee" }, place);
  check("mapNearbyCard uses [] when materials is missing", JSON.stringify(missing.materials) === "[]");
  check("mapNearbyCard drops a card with no place", nearby.mapNearbyCard({ materials: ["Cup"] }, null) === null);
  const serverSrc = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
  check("the nearby prompt asks for a short materials list",
    serverSrc.indexOf("2-3 friendly sentences on how to do this date at this venue") !== -1 &&
    serverSrc.indexOf("0-4 short items to bring, [] if nothing") !== -1 &&
    serverSrc.indexOf("Never invent prices, hours, or phone numbers.") !== -1 &&
    serverSrc.indexOf("max_tokens: 2500") !== -1);
});

section("migration file", () => {
  const sql = fs.readFileSync(path.join(ROOT, "db", "migrations", "004_materials.sql"), "utf8");
  check("004 adds a non-null materials text array",
    /alter table activities add column if not exists materials text\[\] not null default '\{\}';/.test(sql));
  const css = fs.readFileSync(path.join(ROOT, "public", "style.css"), "utf8");
  check("detail materials use the text tokens",
    css.indexOf(".detail-materials{") !== -1 &&
    css.indexOf("color:var(--color-text)") !== -1 &&
    css.indexOf("color:var(--color-text-soft)") !== -1);
});

module.exports = { pass: pass, fail: fail };
