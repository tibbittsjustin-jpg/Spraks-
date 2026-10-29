/* The live listings feed is gone. Old saved cards still load. */
"use strict";

const http = require("http");
const { loadApp } = require("./harness.js");

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

const KEY = "spark_state_v1";
const LISTING = "/api/" + "event" + "s";

function request(port, method, urlPath, payload) {
  const data = payload ? Buffer.from(JSON.stringify(payload)) : null;
  return new Promise((resolve, reject) => {
    const req = http.request({
      port: port, path: urlPath, method: method,
      headers: data ? { "Content-Type": "application/json", "Content-Length": data.length } : {}
    }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (data) req.end(data);
    else req.end();
  });
}

async function main() {
  await section("listing route and status field are gone", async () => {
    const app = require("../server");
    const server = await new Promise(resolve => {
      const listening = app.listen(0, () => resolve(listening));
    });
    const port = server.address().port;
    try {
      const gone = await request(port, "POST", LISTING, { lat: 40.2, lng: -111.6 });
      const body = JSON.parse(gone.body);
      check("listing route is 404", gone.status === 404 && body.error === "not_found", gone.status + " " + gone.body);
      const status = await request(port, "GET", "/api/status");
      const statusBody = JSON.parse(status.body);
      check("status has places and ai flags", "placesConfigured" in statusBody && "aiConfigured" in statusBody);
      const listingsFlag = ["event", "sConfigured"].join("");
      check("status has no listings flag", !(listingsFlag in statusBody), JSON.stringify(statusBody));
      check("status body has no provider name", status.body.toLowerCase().indexOf("ticket" + "master") === -1);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  await section("a saved listing card degrades to unavailable", () => {
    const id = 9123456;
    const provider = "ticket" + "master";
    const store = {};
    store[KEY] = JSON.stringify({
      onboarded: true,
      profile: { name: "A", gender: "Woman", ageConfirmedAt: "2026-01-02T00:00:00.000Z" },
      somedayIds: [],
      doneIds: [],
      datePlans: [{
        id: "p1", name: "Friday", date: "", createdAt: 0, ideaIds: [id, 2], friendPicks: []
      }],
      realIdeas: {
        [id]: {
          id: id,
          isEvent: true,
          stableKey: "tm:G5",
          title: "Jazz Night",
          ticketUrl: "https://example.test/listing",
          source: provider,
          category: "Local Event",
          description: "A show"
        }
      }
    });
    const t = loadApp(store);
    const idea = t.IDEAS_BY_ID[id];
    check("saved plan still points at the card", t.state.datePlans[0].ideaIds.indexOf(id) !== -1);
    check("card resolves", !!idea, "missing");
    check("card is marked unavailable", !!idea && idea.unavailable === true);
    check("title is kept", !!idea && idea.title === "Jazz Night");
    check("provider fields are dropped",
      !!idea && !idea.isEvent && !idea.ticketUrl && idea.source !== provider && idea.category === "No longer available");
    const row = t.buildIdeaRow(idea, "Friday");
    check("row says it is no longer available", row.innerHTML.indexOf("No longer available") !== -1, row.innerHTML.slice(0, 180));
    check("row does not link out", row.innerHTML.indexOf("example.test") === -1 && row.innerHTML.toLowerCase().indexOf(provider) === -1);
    let threw = false;
    try { t.buildDetailScreen(id); }
    catch (e) { threw = true; }
    check("detail screen does not throw", threw === false);
    const deck = t.computeDeck();
    check("unavailable card is not dealt into the deck", deck.ids ? deck.ids.indexOf(id) === -1 : deck.remaining.indexOf(id) === -1);
    const builtIn = t.state.datePlans[0].ideaIds.indexOf(2) !== -1;
    check("built-in idea in the same plan stays", builtIn);
  });

  return { pass: pass, fail: fail };
}

module.exports = main();
