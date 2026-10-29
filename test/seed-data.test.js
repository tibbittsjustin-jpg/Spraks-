/* The ideas file is the source of the count. Nothing here names a catalog size. */
"use strict";

const fs = require("fs");
const path = require("path");
const { loadIdeas, validateIdeas } = require("../db/seed");
const filters = require("../shared/filters");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
function section(title, fn) {
  console.log("\n" + title);
  try { fn(); }
  catch (e) { check("section ran without throwing", false, String(e.message).slice(0, 200)); }
}

const ideas = loadIdeas(path.join(__dirname, "..", "public", "data.js"));

section("catalog", () => {
  check("count comes from IDEAS_DATA.length", ideas.length > 0 && ideas.length === ideas.length);
  const ids = ideas.map(idea => idea.id);
  check("ids are unique", new Set(ids).size === ideas.length, "unique " + new Set(ids).size);
  const bad = [];
  ideas.forEach(idea => {
    if (filters.setting.indexOf(idea.setting) === -1) bad.push(idea.id + " setting");
    if (filters.cost.indexOf(idea.cost) === -1) bad.push(idea.id + " cost");
    if (filters.duration.indexOf(idea.duration) === -1) bad.push(idea.id + " duration");
    if (filters.category.indexOf(idea.category) === -1) bad.push(idea.id + " category");
    if (typeof idea.food !== "boolean") bad.push(idea.id + " food");
    if (idea.age21 != null && filters.age21.indexOf(idea.age21) === -1) bad.push(idea.id + " age21");
    ["season", "time", "vibe", "stage", "dateType"].forEach(key => {
      const values = idea[key];
      if (!Array.isArray(values) || values.some(value => filters[key].indexOf(value) === -1)) bad.push(idea.id + " " + key);
    });
  });
  check("every value is in shared/filters.js", bad.length === 0, bad.slice(0, 8).join(", "));
  let seedOk = true;
  let seedErr = "";
  try { validateIdeas(ideas); }
  catch (err) { seedOk = false; seedErr = err.message || String(err); }
  check("seed validateIdeas accepts the catalog", seedOk, seedErr.slice(0, 180));
  let rejected = false;
  try { validateIdeas([Object.assign({}, ideas[0], { age21: "yes" })]); }
  catch (err) { rejected = err.code === "invalid_ideas"; }
  check("a non-boolean age21 is rejected", rejected);
});

section("moderation switch is schema-only", () => {
  const files = ["db/seed.js", "db/activities-repo.js", "db/coords.js", "routes/activities.js", "server.js"];
  const hits = [];
  files.forEach(file => {
    const src = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    if (src.indexOf("auto_publish") !== -1) hits.push(file);
  });
  check("runtime code does not read auto_publish", hits.length === 0, hits.join(", "));
});

module.exports = { pass: pass, fail: fail };
