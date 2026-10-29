/* A saved list that names a curated id no longer in the catalog still boots.
   The missing id is not rendered; a real id next to it still resolves.
   An archived API row is a 404. No database for the route half. */
"use strict";

const http = require("http");
const express = require("express");
const { loadApp } = require("./harness");
const { loadIdeas } = require("../db/seed");
const { createActivitiesRouter } = require("../routes/activities");

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

const KEY = "spark_state_v1";
const ideas = loadIdeas(require("path").join(__dirname, "..", "public", "data.js"));
const ids = ideas.map(idea => idea.id);
const idSet = new Set(ids);
const absent = idSet.has(340) ? Math.max.apply(null, ids) + 1 : 340;
const valid = idSet.has(2) ? 2 : ids[0];

section("saved list with a retired id still loads", () => {
  check("fixture id is actually absent", !idSet.has(absent), String(absent));
  const storage = {};
  storage[KEY] = JSON.stringify({
    onboarded: true,
    somedayIds: [absent, valid],
    doneIds: [{ id: absent, date: "2026-01-01" }, { id: valid, date: "2026-01-02" }],
    datePlans: [{
      id: "p1",
      name: "Friday",
      date: "",
      createdAt: 0,
      ideaIds: [valid, absent],
      friendPicks: [
        { id: "fp1", friendName: "Emma R.", avatarEmoji: "E", avatarColor: "#FF9F6B", ideaId: absent },
        { id: "fp2", friendName: "Sam", avatarEmoji: "S", avatarColor: "#7EB6FF", ideaId: valid }
      ]
    }]
  });
  const app = loadApp(storage);
  check("valid id still resolves", !!app.IDEAS_BY_ID[valid] && app.IDEAS_BY_ID[valid].id === valid);
  check("absent id is not in the catalog", !app.IDEAS_BY_ID[absent]);
  check("valid id survives in saved state", app.state.somedayIds.indexOf(valid) !== -1);
  check("valid id survives in the plan and friend picks",
    app.state.datePlans[0].ideaIds.indexOf(valid) !== -1 &&
    app.state.datePlans[0].friendPicks.some(pick => pick.ideaId === valid));
  const renderedSomeday = app.state.somedayIds.filter(id => !!app.IDEAS_BY_ID[id]);
  const renderedDone = app.state.doneIds.filter(entry => !!app.IDEAS_BY_ID[entry.id]);
  const renderedPlan = app.state.datePlans[0].ideaIds.filter(id => !!app.IDEAS_BY_ID[id]);
  check("absent id is dropped from rendered saved counts",
    renderedSomeday.length === 1 && renderedSomeday[0] === valid &&
    renderedDone.length === 1 && renderedDone[0].id === valid &&
    renderedPlan.length === 1 && renderedPlan[0] === valid,
    "someday " + renderedSomeday.join(",") + " done " + renderedDone.map(d => d.id).join(","));
  check("the saved list itself still loaded",
    app.state.somedayIds.length === 2 && app.state.doneIds.length === 2);
});

function request(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ port: port, path: urlPath }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    }).on("error", reject);
  });
}

async function main() {
  const archived = {
    id: absent,
    title: "Retired",
    description: "",
    category: "Hiking & Nature",
    icon: "",
    setting: "Outdoor",
    season: [],
    food: false,
    cost: "Free",
    duration: "Short (1-2 hrs)",
    time: [],
    vibe: [],
    stage: [],
    date_type: [],
    scene: null,
    motif: null,
    source: "curated",
    tier: "free",
    address: null,
    lat: null,
    lng: null,
    affiliate_url: null,
    updated_at: null,
    status: "archived"
  };
  const db = {
    async query(text, values) {
      const hidesUnapproved = text.indexOf("status = 'approved'") !== -1;
      if (values && Number(values[0]) === absent) {
        return { rows: hidesUnapproved ? [] : [archived] };
      }
      return { rows: [] };
    }
  };
  const app = express();
  app.use("/api/activities", createActivitiesRouter({ db: db, isConfigured: () => true }));
  const server = await new Promise(resolve => {
    const listening = app.listen(0, () => resolve(listening));
  });
  try {
    const res = await request(server.address().port, "/api/activities/" + absent);
    check("archived row is 404", res.status === 404 && JSON.parse(res.body).error === "not_found", res.status + " " + res.body);
    check("archived 404 does not contain submitter_email", res.body.indexOf("submitter_email") === -1);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  return { pass: pass, fail: fail };
}

module.exports = main();
