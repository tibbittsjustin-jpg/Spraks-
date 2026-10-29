/* User location is coarsened to ~1 km before it leaves the server.
   Outbound Google calls and the Claude prompt are checked with fakes.
   Upstream error text is not returned or logged. */
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
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 300)); }
}

const PRECISE_LAT = 40.233843;
const PRECISE_LNG = -111.658531;
const ROUNDED_LAT = 40.23;
const ROUNDED_LNG = -111.66;

function post(port, urlPath, payload) {
  const data = Buffer.from(JSON.stringify(payload));
  return new Promise((resolve, reject) => {
    const req = http.request({
      port: port, path: urlPath, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": data.length }
    }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(data);
  });
}

function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ port: port, path: urlPath }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    }).on("error", reject);
  });
}

function spyConsole() {
  const logs = [];
  const orig = {};
  ["log", "info", "warn", "error", "debug"].forEach(method => {
    orig[method] = console[method];
    console[method] = (...args) => {
      logs.push(args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      orig[method].apply(console, args);
    };
  });
  return {
    logs: logs,
    text() { return logs.join("\n"); },
    restore() { Object.keys(orig).forEach(method => { console[method] = orig[method]; }); }
  };
}

function installAnthropic(create) {
  const id = require.resolve("@anthropic-ai/sdk");
  const previous = require.cache[id];
  require.cache[id] = {
    id: id,
    filename: id,
    loaded: true,
    exports: function Anthropic() {
      this.messages = { create: create };
    }
  };
  return function restore() {
    if (previous) require.cache[id] = previous;
    else delete require.cache[id];
  };
}

async function main() {
  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = "test-places-key";
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  const app = require("../server");
  const server = await new Promise(resolve => {
    const listening = app.listen(0, () => resolve(listening));
  });
  const port = server.address().port;
  const originalFetch = global.fetch;

  try {
    await section("only rounded coordinates are sent outward", async () => {
      const urls = [];
      let prompt = "";
      global.fetch = async (url) => {
        urls.push(String(url));
        return {
          ok: true,
          json: async () => ({
            status: "OK",
            results: [{
              place_id: "abc",
              name: "Cafe",
              formatted_address: "1 Main St",
              rating: 4.2,
              user_ratings_total: 9,
              opening_hours: { open_now: true }
            }]
          })
        };
      };
      const restoreAi = installAnthropic(async (req) => {
        prompt = req.messages[0].content;
        return { content: [{ text: JSON.stringify([{
          placeIndex: 1, title: "Coffee Date", description: "A cup.", icon: "☕",
          cost: "$1-$10", setting: "Indoor", vibe: ["Chill"], food: true,
          durationGuess: "Short (1-2 hrs)"
        }]) }] };
      });
      const spy = spyConsole();
      try {
        const res = await post(port, "/api/nearby-ideas", {
          lat: PRECISE_LAT, lng: PRECISE_LNG, count: 1, filters: {}
        });
        const body = JSON.parse(res.body);
        check("nearby ideas returns a card", res.status === 200 && body.ideas && body.ideas.length === 1, res.body.slice(0, 180));
        check("Google was called", urls.length > 0, String(urls.length));
        urls.forEach(url => {
          const loc = url.split("location=")[1].split("&")[0];
          check("places location is rounded to 2 decimals", loc === ROUNDED_LAT + "," + ROUNDED_LNG, loc);
          check("places url omits the precise latitude", url.indexOf(String(PRECISE_LAT)) === -1);
          check("places url omits the precise longitude", url.indexOf(String(PRECISE_LNG)) === -1);
        });
        check("Claude prompt omits precise coordinates",
          prompt.indexOf(String(PRECISE_LAT)) === -1 && prompt.indexOf(String(PRECISE_LNG)) === -1, prompt.slice(0, 120));
        check("Claude prompt omits rounded coordinates too",
          prompt.indexOf(String(ROUNDED_LAT)) === -1 && prompt.indexOf(String(ROUNDED_LNG)) === -1);
        check("logs omit precise coordinates",
          spy.text().indexOf(String(PRECISE_LAT)) === -1 && spy.text().indexOf(String(PRECISE_LNG)) === -1,
          spy.text().slice(0, 160));
      } finally {
        spy.restore();
        restoreAi();
      }
    });

    await section("upstream errors stay generic", async () => {
      global.fetch = async () => ({
        ok: true,
        json: async () => ({ status: "REQUEST_DENIED", error_message: "secret " + PRECISE_LAT + "," + PRECISE_LNG })
      });
      const restoreAi = installAnthropic(async () => {
        throw new Error("upstream secret " + PRECISE_LAT + "," + PRECISE_LNG);
      });
      const spy = spyConsole();
      try {
        const empty = await post(port, "/api/nearby-ideas", { lat: PRECISE_LAT, lng: PRECISE_LNG });
        check("places failure does not return upstream text",
          empty.body.indexOf("secret") === -1 && empty.body.indexOf(String(PRECISE_LAT)) === -1 &&
          empty.body.indexOf("REQUEST_DENIED") === -1,
          empty.body.slice(0, 180));

        global.fetch = async () => ({
          ok: true,
          json: async () => ({
            status: "OK",
            results: [{ place_id: "abc", name: "Cafe", formatted_address: "1 Main St", rating: 4 }]
          })
        });
        const blown = await post(port, "/api/nearby-ideas", { lat: PRECISE_LAT, lng: PRECISE_LNG });
        const blownBody = JSON.parse(blown.body);
        check("model failure is a generic error", blownBody.reason === "error" && blownBody.ideas && blownBody.ideas.length === 0, blown.body);
        check("model failure body omits upstream text",
          blown.body.indexOf("upstream secret") === -1 && blown.body.indexOf(String(PRECISE_LAT)) === -1);
        check("model failure log omits coordinates and upstream text",
          spy.text().indexOf(String(PRECISE_LAT)) === -1 && spy.text().indexOf("upstream secret") === -1,
          spy.text().slice(0, 160));
      } finally {
        spy.restore();
        restoreAi();
      }
    });

    await section("activities query uses rounded coordinates and does not log them", async () => {
      let seen = null;
      const db = {
        async query(text, values) {
          seen = values;
          const err = new Error("driver leaked " + PRECISE_LAT + "," + PRECISE_LNG);
          err.code = "XX000";
          throw err;
        }
      };
      const activities = express();
      activities.use("/api/activities", createActivitiesRouter({ db: db, isConfigured: () => true }));
      const listening = await new Promise(resolve => {
        const s = activities.listen(0, () => resolve(s));
      });
      const spy = spyConsole();
      try {
        const res = await get(listening.address().port, "/api/activities?lat=" + PRECISE_LAT + "&lng=" + PRECISE_LNG);
        const body = JSON.parse(res.body);
        check("activities error is generic", res.status === 500 && body.error === "db_error", res.body);
        check("activities error omits the precise coordinates", res.body.indexOf(String(PRECISE_LAT)) === -1);
        check("query values are rounded",
          seen && seen.indexOf(ROUNDED_LAT) !== -1 && seen.indexOf(ROUNDED_LNG) !== -1 &&
          seen.indexOf(PRECISE_LAT) === -1 && seen.indexOf(PRECISE_LNG) === -1,
          JSON.stringify(seen));
        check("activities log omits the precise coordinates",
          spy.text().indexOf(String(PRECISE_LAT)) === -1 && spy.text().indexOf("driver leaked") === -1,
          spy.text().slice(0, 160));
      } finally {
        spy.restore();
        await new Promise(resolve => listening.close(resolve));
      }
    });
  } finally {
    global.fetch = originalFetch;
    if (placesKey == null) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = placesKey;
    if (anthropicKey == null) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = anthropicKey;
    await new Promise(resolve => server.close(resolve));
  }

  return { pass: pass, fail: fail };
}

module.exports = main();
