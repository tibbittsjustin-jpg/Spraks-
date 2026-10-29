/* Ideas removed from the catalog are gone, and they leave no coordinate
   or place-query row behind. A saved list that still names one still boots. */
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
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 300)); }
}

const REMOVED = [336, 778, 1424, 1548];
const KEY = "spark_state_v1";
const ROOT = path.join(__dirname, "..");

section("removed ideas are absent", () => {
  const ideas = loadIdeas(path.join(ROOT, "public", "data.js"));
  const ids = new Set(ideas.map(idea => idea.id));
  REMOVED.forEach(id => {
    check("#" + id + " is not in the catalog", !ids.has(id));
  });
  const t = loadApp({});
  check("IDEAS_BY_ID matches the catalog length",
    Object.keys(t.IDEAS_BY_ID).length === ideas.length, String(Object.keys(t.IDEAS_BY_ID).length));
  REMOVED.forEach(id => {
    check("#" + id + " is not in IDEAS_BY_ID", !t.IDEAS_BY_ID[id]);
  });

  const coords = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "coords", "utah.json"), "utf8"));
  const queries = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "geo", "place_queries.json"), "utf8"));
  const queryIds = new Set(queries.map(row => row.id));
  REMOVED.forEach(id => {
    check("#" + id + " has no coordinate entry", coords[String(id)] == null && !Object.values(coords).some(entry => entry.id === id));
    check("#" + id + " has no place-query entry", !queryIds.has(id));
  });
  check("retired #340 is still absent from coordinates", coords["340"] == null);
});

section("a saved list naming a removed id still loads", () => {
  const storage = {};
  storage[KEY] = JSON.stringify({
    onboarded: true,
    somedayIds: [1548, 2],
    doneIds: [{ id: 1548, date: "2026-01-01" }, { id: 2, date: "2026-01-02" }],
    datePlans: [{
      id: "p1",
      name: "Friday",
      date: "",
      createdAt: 0,
      ideaIds: [2, 1548]
    }]
  });
  const t = loadApp(storage);
  check("a real id still resolves", !!t.IDEAS_BY_ID[2]);
  check("the removed id is not in the catalog", !t.IDEAS_BY_ID[1548]);
  check("the saved list itself still loaded",
    t.state.somedayIds.length === 2 && t.state.doneIds.length === 2 && t.state.datePlans[0].ideaIds.length === 2);
  const rendered = t.state.somedayIds.filter(id => !!t.IDEAS_BY_ID[id]);
  check("the removed id drops out of the rendered saved list", rendered.length === 1 && rendered[0] === 2);
});

module.exports = { pass: pass, fail: fail };
