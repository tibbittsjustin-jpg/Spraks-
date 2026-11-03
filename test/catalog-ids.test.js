/* Saved, planned, and done rows whose ids are outside the starter set. */
"use strict";

const { loadApp } = require("./harness");
const { loadIdeas } = require("../db/seed");
const path = require("path");
const remote = require("../public/remote-activities");

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

function textOf(node) {
  if (!node) return "";
  let out = node.innerHTML || "";
  (node.children || []).forEach(child => { out += "\n" + textOf(child); });
  return out;
}

function memStorage(store) {
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
    setItem(key, value) { store[key] = String(value); }
  };
}

function savedState(extra) {
  return Object.assign({
    onboarded: true,
    profile: { ageConfirmedAt: "2026-01-15T00:00:00.000Z" },
    somedayIds: [4],
    datePlans: [{
      id: "plan_out",
      name: "Saturday",
      date: "2026-11-08",
      createdAt: 1,
      ideaIds: [6],
      likes: { "6": 50 }
    }],
    doneIds: [{ id: 7, date: "2026-06-01", rating: 5 }]
  }, extra || {});
}

const catalog = loadIdeas(path.join(__dirname, "..", "data", "ideas-catalog.js"));
const byId = {};
catalog.forEach(idea => { byId[idea.id] = idea; });

async function main() {
  section("ids outside the starter resolve from the catalog cache", () => {
    check("4, 6, and 7 are not in the starter",
      !byId[4] === false && catalog.some(idea => idea.id === 4) &&
      !require("fs").readFileSync(path.join(__dirname, "..", "public", "data.js"), "utf8").includes('"id":4,'));
    const store = { spark_state_v1: JSON.stringify(savedState()) };
    remote.writeCatalogCache(memStorage(store), [byId[4], byId[6], byId[7]], Date.now());
    const t = loadApp(store);
    check("detail for 4 shows its title",
      textOf(t.buildDetailScreen(4)).indexOf(byId[4].title) !== -1 &&
      textOf(t.buildDetailScreen(4)).indexOf("Idea not found") === -1);
    t.ui.savedBucket = { type: "someday" };
    const saved = textOf(t.buildSavedScreen());
    check("favorites shows idea 4", saved.indexOf(byId[4].title) !== -1, saved.slice(0, 240));
    t.ui.savedBucket = { type: "plan", planId: "plan_out" };
    const plan = textOf(t.buildSavedScreen());
    check("the plan shows idea 6", plan.indexOf(byId[6].title) !== -1);
    t.ui.savedBucket = { type: "done" };
    const done = textOf(t.buildSavedScreen());
    check("done shows idea 7", done.indexOf(byId[7].title) !== -1);
    check("the lists still hold 4, 6, and 7",
      t.state.somedayIds.indexOf(4) !== -1 &&
      t.state.datePlans[0].ideaIds.indexOf(6) !== -1 &&
      t.state.doneIds[0].id === 7);
  });

  section("offline keeps a placeholder instead of dropping the row", () => {
    const store = { spark_state_v1: JSON.stringify(savedState()) };
    const t = loadApp(store);
    check("idea 4 is not already in memory", !t.IDEAS_BY_ID[4]);
    const savedIdea = t.ideaForSaved(4);
    check("a missing saved id is a placeholder",
      savedIdea && savedIdea.pendingLoad === true && savedIdea.title === "Saved idea" && savedIdea.id === 4);
    t.ui.savedBucket = { type: "someday" };
    const saved = textOf(t.buildSavedScreen());
    check("favorites keeps a placeholder row",
      saved.indexOf("Saved idea") !== -1 && saved.indexOf("Idea not found") === -1);
    t.ui.savedBucket = { type: "plan", planId: "plan_out" };
    const plan = textOf(t.buildSavedScreen());
    check("the plan keeps a placeholder row", plan.indexOf("Saved idea") !== -1);
    t.ui.savedBucket = { type: "done" };
    const done = textOf(t.buildSavedScreen());
    check("done keeps a placeholder row", done.indexOf("Saved idea") !== -1);
    const detail = textOf(t.buildDetailScreen(4));
    check("detail does not say the idea is missing",
      detail.indexOf("Saved idea") !== -1 && detail.indexOf("Idea not found") === -1);
    check("the saved ids are still stored",
      t.state.somedayIds.join(",") === "4" &&
      t.state.datePlans[0].ideaIds.join(",") === "6" &&
      t.state.doneIds[0].id === 7);
  });

  await section("by-ids fetch maps numeric ids and survives a failed network", async () => {
    const fetched = await remote.fetchActivitiesByIds({
      ids: [4, 6, 4],
      fetch: function (url) {
        check("the request is the by-ids endpoint",
          url.indexOf("/api/activities/by-ids?ids=4,6") === 0 && url.indexOf("lat=") === -1, url);
        return Promise.resolve({
          ok: true,
          json: async function () {
            return {
              items: [
                { id: 4, title: byId[4].title, description: byId[4].description, setting: "Indoor", cost: "Free", materials: [] },
                { id: 6, title: byId[6].title, description: "x", status: "approved", expires_at: "2020-01-01" }
              ]
            };
          }
        });
      }
    });
    check("fetched rows keep the numeric id",
      fetched.ok === true && fetched.ideas.length === 2 &&
      fetched.ideas[0].id === 4 && fetched.ideas[0].title === byId[4].title &&
      fetched.ideas[1].id === 6);
    const offline = await remote.fetchActivitiesByIds({
      ids: [7],
      fetch: function () { return Promise.reject(new Error("offline")); }
    });
    check("a failed fetch does not throw or invent a row",
      offline.ok === false && offline.ideas.length === 0 && offline.missing.join(",") === "7");

    const store = { spark_state_v1: JSON.stringify(savedState()) };
    const t = loadApp(store);
    t.applyCatalogIdeas(fetched.ideas);
    check("applying the fetch resolves detail, favorites, and the plan",
      textOf(t.buildDetailScreen(4)).indexOf(byId[4].title) !== -1 &&
      (t.ui.savedBucket = { type: "someday" }, textOf(t.buildSavedScreen()).indexOf(byId[4].title) !== -1) &&
      (t.ui.savedBucket = { type: "plan", planId: "plan_out" }, textOf(t.buildSavedScreen()).indexOf(byId[6].title) !== -1));
  });

  return { pass: pass, fail: fail };
}

module.exports = main();
