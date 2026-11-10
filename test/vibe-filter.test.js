/* Spontaneous is not a vibe. The closed list, the Discover chips, and the
   catalog all omit it. An unknown vibe query is rejected, and Spontaneous
   takes that same path. */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const express = require("express");
const filters = require("../shared/filters");
const { loadIdeas } = require("../db/seed");
const { createActivitiesRouter } = require("../routes/activities");
const { buildListQuery } = require("../db/activities-repo");
const { loadApp } = require("./harness");

const VIBES = ["Chill", "Romantic", "Active", "Adventurous", "Creative", "Silly", "Cozy"];

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
async function asyncSection(title, fn) {
  console.log("\n" + title);
  try { await fn(); }
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 300)); }
}

function rejection(params) {
  try {
    buildListQuery(params);
    return null;
  } catch (err) {
    return { code: err.code, field: err.field };
  }
}

function walk(node, fn) {
  if (!node) return;
  fn(node);
  const kids = node.children || [];
  for (let i = 0; i < kids.length; i++) walk(kids[i], fn);
}

function request(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: "127.0.0.1", port: port, path: urlPath }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    }).on("error", reject);
  });
}

section("vibe vocabulary", () => {
  check("filters.vibe does not include Spontaneous",
    filters.vibe.indexOf("Spontaneous") === -1);
  check("filters.vibe is the remaining seven vibes",
    filters.vibe.join("|") === VIBES.join("|"));
});

section("Discover vibe chips", () => {
  const appSrc = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const def = /key:"vibe"[\s\S]*?options:\[([^\]]*)\]/.exec(appSrc);
  const listed = def ? def[1].split(",").map(part => part.replace(/["\s]/g, "")).filter(Boolean) : [];
  check("the FILTER_DEFS vibe options do not include Spontaneous",
    !!def && listed.indexOf("Spontaneous") === -1 && listed.join("|") === VIBES.join("|"),
    listed.join("|"));

  const app = loadApp({});
  const vibeDef = app.FILTER_DEFS.filter(item => item.key === "vibe")[0];
  check("loaded Discover vibe options omit Spontaneous",
    !!vibeDef && vibeDef.options.indexOf("Spontaneous") === -1 &&
    vibeDef.options.join("|") === VIBES.join("|") && vibeDef.label === "Vibe");

  const body = app.document.createElement("div");
  const previousQuery = app.document.querySelector;
  app.document.querySelector = function (sel) {
    if (sel === "#filter-body") return body;
    return previousQuery.apply(this, arguments);
  };
  app.ui.filterDraft = JSON.parse(JSON.stringify(app.state.filters));
  app.renderFilterBody();
  app.document.querySelector = previousQuery;

  let vibeChips = [];
  walk(body, function (node) {
    const kids = node.children || [];
    if (kids[0] && kids[0].innerHTML === "Vibe" && kids[1]) vibeChips = kids[1].children || [];
  });
  const labels = vibeChips.map(chip => String(chip.innerHTML || ""));
  check("rendered Discover vibe chips omit Spontaneous",
    labels.length === VIBES.length && labels.join("|") === VIBES.join("|") &&
    labels.indexOf("Spontaneous") === -1,
    labels.join("|"));
});

section("catalog ideas", () => {
  const ideas = loadIdeas(path.join(__dirname, "..", "data", "ideas-catalog.js"));
  const tagged = ideas.filter(idea =>
    Array.isArray(idea.vibe) && idea.vibe.indexOf("Spontaneous") !== -1
  );
  check("no catalog idea has Spontaneous in its vibe array",
    tagged.length === 0, tagged.slice(0, 8).map(idea => idea.id).join(","));
  const empty = ideas.filter(idea => !Array.isArray(idea.vibe) || idea.vibe.length === 0);
  check("removing the tag did not leave an empty vibe array",
    empty.length === 0, empty.slice(0, 8).map(idea => idea.id).join(","));
});

section("unknown vibe query", () => {
  const spontaneous = rejection({ vibe: "Spontaneous" });
  const unknown = rejection({ vibe: "Nope" });
  const mixed = rejection({ vibe: "Chill,Spontaneous" });
  const mixedUnknown = rejection({ vibe: "Chill,Nope" });
  let knownOk = false;
  try {
    const q = buildListQuery({ vibe: "Chill" });
    knownOk = q.text.indexOf("vibe && ") !== -1 &&
      JSON.stringify(q.values).indexOf("Chill") !== -1 &&
      JSON.stringify(q.values).indexOf("Spontaneous") === -1;
  } catch (err) {
    knownOk = false;
  }
  check("a known vibe is still accepted", knownOk);
  check("?vibe=Spontaneous is rejected like any other unknown vibe",
    !!spontaneous && !!unknown &&
    spontaneous.code === "invalid_filter" && spontaneous.field === "vibe" &&
    spontaneous.code === unknown.code && spontaneous.field === unknown.field);
  check("a list that includes Spontaneous is rejected like any other unknown vibe",
    !!mixed && !!mixedUnknown &&
    mixed.code === mixedUnknown.code && mixed.field === mixedUnknown.field &&
    mixed.code === "invalid_filter" && mixed.field === "vibe");
});

function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  await asyncSection("GET /api/activities?vibe=Spontaneous", async () => {
    const calls = [];
    const db = {
      async query(text, values) {
        calls.push({ text: text, values: values });
        return { rows: [] };
      }
    };
    const app = express();
    app.use("/api/activities", createActivitiesRouter({ db: db, isConfigured: () => true }));
    const server = await listen(app);
    const port = server.address().port;
    try {
      const spontaneous = await request(port, "/api/activities?vibe=Spontaneous");
      const unknown = await request(port, "/api/activities?vibe=Nope");
      const rejectedCalls = calls.length;
      const known = await request(port, "/api/activities?vibe=Chill");
      const spontaneousBody = JSON.parse(spontaneous.body);
      const unknownBody = JSON.parse(unknown.body);
      const knownBody = JSON.parse(known.body);
      check("Spontaneous is a 400 invalid_filter on vibe",
        spontaneous.status === 400 && spontaneousBody.error === "invalid_filter" &&
        spontaneousBody.field === "vibe",
        spontaneous.status + " " + spontaneous.body);
      check("an unknown vibe gets the same status and body",
        unknown.status === spontaneous.status &&
        JSON.stringify(unknownBody) === JSON.stringify(spontaneousBody),
        unknown.status + " " + unknown.body);
      check("the rejected vibe never reaches the database", rejectedCalls === 0, String(rejectedCalls));
      check("a known vibe is not rejected",
        known.status === 200 && Array.isArray(knownBody.items),
        known.status + " " + known.body.slice(0, 120));
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  return { pass: pass, fail: fail };
}

module.exports = main();
