/* HTTP shape of the activities routes, with a fake db injected.
   No database. */
"use strict";

const http = require("http");
const express = require("express");
const { createActivitiesRouter } = require("../routes/activities");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
async function section(title, fn) {
  console.log("\n" + title);
  try { await fn(); }
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 240)); }
}

function row(id, extra) {
  return Object.assign({
    id: id,
    title: "Idea " + id,
    description: "A date.",
    category: "Hiking & Nature",
    icon: "🌲",
    setting: "Outdoor",
    season: ["Spring"],
    food: false,
    cost: "Free",
    duration: "Short (1-2 hrs)",
    time: ["Afternoon"],
    vibe: ["Chill"],
    stage: ["First Date"],
    date_type: ["Solo/Couple"],
    scene: "park",
    motif: "tree",
    source: "curated",
    tier: "free",
    address: null,
    lat: 40.23,
    lng: -111.66,
    affiliate_url: "https://example.com/out",
    updated_at: "2026-10-29T00:00:00.000Z",
    status: "approved",
    submitter_email: "hidden@example.com"
  }, extra || {});
}

function request(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ port: port, path: urlPath }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    }).on("error", reject);
  });
}

function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function main() {
  const rows = [row(2), row(3)];
  const db = {
    async query() { return { rows: rows }; }
  };
  const app = express();
  app.use("/api/activities", createActivitiesRouter({
    db: db,
    isConfigured: () => true
  }));
  const server = await listen(app);
  const port = server.address().port;

  try {
    await section("response shape", async () => {
      const res = await request(port, "/api/activities?limit=2");
      check("200", res.status === 200, String(res.status));
      const body = JSON.parse(res.body);
      check("two items", body.items.length === 2);
      const item = body.items[0];
      check("date_type maps to dateType", Array.isArray(item.dateType) && item.dateType[0] === "Solo/Couple");
      check("affiliate_url maps to affiliateUrl", item.affiliateUrl === "https://example.com/out");
      check("status is not exposed", !Object.prototype.hasOwnProperty.call(item, "status") && res.body.indexOf("\"status\"") === -1);
      check("submitter_email is not exposed", res.body.indexOf("submitter_email") === -1);
      check("snake_case columns are not exposed",
        !Object.prototype.hasOwnProperty.call(item, "date_type") &&
        !Object.prototype.hasOwnProperty.call(item, "affiliate_url"));
      check("nextOffset advances by a full page", body.nextOffset === 2 && body.limit === 2 && body.offset === 0);
      check("public cache without coordinates", res.headers["cache-control"] === "public, max-age=300");
    });

    await section("short page and located cache", async () => {
      const res = await request(port, "/api/activities?limit=5&lat=40.76&lng=-111.89");
      const body = JSON.parse(res.body);
      check("nextOffset is null when the page is short", body.nextOffset === null, JSON.stringify(body.nextOffset));
      check("private cache when lat/lng are present", res.headers["cache-control"] === "private, max-age=60");
    });

    await section("single activity", async () => {
      const missingDb = {
        async query(text, values) {
          const approvedOnly = text.indexOf("status = 'approved'") !== -1;
          if (values && values[0] === 340) return { rows: approvedOnly ? [] : [row(340, { status: "archived" })] };
          if (values && values[0] === 2) return { rows: [row(2)] };
          return { rows: [] };
        }
      };
      const oneApp = express();
      oneApp.use("/api/activities", createActivitiesRouter({ db: missingDb, isConfigured: () => true }));
      const one = await listen(oneApp);
      try {
        const ok = await request(one.address().port, "/api/activities/2");
        const okBody = JSON.parse(ok.body);
        check("approved id is 200", ok.status === 200 && okBody.id === 2 && okBody.dateType[0] === "Solo/Couple");
        check("detail does not leak status", ok.body.indexOf("submitter_email") === -1 && !okBody.status);
        const missing = await request(one.address().port, "/api/activities/999999");
        check("missing id is 404", missing.status === 404 && JSON.parse(missing.body).error === "not_found");
        const archived = await request(one.address().port, "/api/activities/340");
        check("archived id is 404", archived.status === 404 && JSON.parse(archived.body).error === "not_found");
        const bad = await request(one.address().port, "/api/activities/nope");
        check("non-numeric id is 400", bad.status === 400);
        const longId = await request(one.address().port, "/api/activities/1234567890");
        check("too-long id is 400", longId.status === 400);
      } finally {
        await new Promise(resolve => one.close(resolve));
      }
    });

    await section("database not configured", async () => {
      const off = express();
      off.use("/api/activities", createActivitiesRouter({
        db: db,
        isConfigured: () => false
      }));
      const offServer = await listen(off);
      try {
        const res = await request(offServer.address().port, "/api/activities");
        check("503 db_not_configured", res.status === 503 && JSON.parse(res.body).error === "db_not_configured");
      } finally {
        await new Promise(resolve => offServer.close(resolve));
      }
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  return { pass: pass, fail: fail };
}

module.exports = main();
