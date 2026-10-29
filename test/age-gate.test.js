/* 18+ gate: date of birth is checked, then dropped.
   The server never stores or logs it. The browser keeps only ageConfirmedAt. */
"use strict";

const http = require("http");
const { loadApp } = require("./harness.js");
const { checkAge } = require("../public/util");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
function section(title, fn) {
  console.log("\n" + title);
  try { return Promise.resolve(fn()); }
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 240)); return Promise.resolve(); }
}

const KEY = "spark_state_v1";
const ADULT = "1990-05-05";
const CHILD = "2015-06-15";

function ymd(d) {
  const p = n => (n < 10 ? "0" : "") + n;
  return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
}

function jsonResponse(body, status) {
  return {
    status: status || 200,
    json: () => Promise.resolve(body)
  };
}

function post(port, urlPath, payload) {
  const data = Buffer.from(JSON.stringify(payload));
  return new Promise((resolve, reject) => {
    const req = http.request({
      port: port, path: urlPath, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": data.length }
    }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    req.on("error", reject);
    req.end(data);
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
    restore() { Object.keys(orig).forEach(method => { console[method] = orig[method]; }); }
  };
}

async function main() {
  await section("calendar age", () => {
    const now = new Date(Date.UTC(2026, 9, 29));
    check("turns 18 on this UTC day", checkAge("2008-10-29", now).ok === true);
    check("still 17 the next day", checkAge("2008-10-30", now).blocked === true && checkAge("2008-10-30", now).ok === false);
    check("already 18 the day before", checkAge("2008-10-28", now).ok === true);
    check("malformed date is invalid", checkAge("13", now).error === "invalid_date");
    check("impossible day is invalid", checkAge("2000-02-31", now).error === "invalid_date");
    check("future date is blocked", checkAge(ymd(new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1))), now).blocked === true);
    const today = new Date();
    const turns = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()));
    const still17 = new Date(turns.getTime() + 24 * 60 * 60 * 1000);
    check("18th birthday today is allowed", checkAge(ymd(turns), today).ok === true);
    check("birthday tomorrow is blocked", checkAge(ymd(still17), today).blocked === true);
  });

  await section("server blocks under 18 and does not keep the date", async () => {
    const app = require("../server");
    const server = await new Promise(resolve => {
      const listening = app.listen(0, () => resolve(listening));
    });
    const port = server.address().port;
    const spy = spyConsole();
    try {
      const blocked = await post(port, "/api/age-check", { dob: CHILD });
      const blockedBody = JSON.parse(blocked.body);
      check("under 18 is blocked", blocked.status === 200 && blockedBody.ok === false && blockedBody.blocked === true,
        blocked.status + " " + blocked.body);
      check("blocked response does not echo the date", blocked.body.indexOf(CHILD) === -1, blocked.body);

      const allowed = await post(port, "/api/age-check", { dob: ADULT });
      const allowedBody = JSON.parse(allowed.body);
      check("adult is allowed", allowed.status === 200 && allowedBody.ok === true && !allowedBody.blocked, allowed.body);
      check("allowed response does not echo the date", allowed.body.indexOf(ADULT) === -1);

      const bad = await post(port, "/api/age-check", { dob: "not-a-date" });
      check("bad date is invalid_date", bad.status === 400 && JSON.parse(bad.body).error === "invalid_date", bad.body);
      check("invalid response does not echo the input", bad.body.indexOf("not-a-date") === -1);

      const logged = spy.logs.join("\n");
      check("server logs omit the date of birth",
        logged.indexOf(CHILD) === -1 && logged.indexOf(ADULT) === -1 && logged.indexOf("not-a-date") === -1,
        logged.slice(0, 200));
    } finally {
      spy.restore();
      await new Promise(resolve => server.close(resolve));
    }
  });

  await section("client drops the date and stores the confirmation time", async () => {
    const store = {};
    const t = loadApp(store);
    let calls = 0;
    t.setFetch(() => { calls++; return Promise.resolve(jsonResponse({ ok: true })); });
    const blocked = await t.finishOnboarding({ name: "Casey", dob: CHILD, gender: "Woman" });
    check("client blocks under 18", blocked === false && t.state.onboarded === false);
    check("client does not ask the server after its own block", calls === 0);
    check("under 18 stores no confirmation", !t.state.profile.ageConfirmedAt);
    check("under 18 date is not in storage", JSON.stringify(store).indexOf(CHILD) === -1);

    t.setFetch((url, opts) => {
      calls++;
      const sent = JSON.parse(opts.body);
      check("adult check is posted to the age route", url === "/api/age-check" && sent.dob === ADULT);
      return Promise.resolve(jsonResponse({ ok: false, blocked: true }));
    });
    const serverNo = await t.finishOnboarding({ name: "Casey", dob: ADULT, gender: "Woman" });
    check("server block stops onboarding", serverNo === false && t.state.onboarded === false);
    check("server block stores no confirmation", !t.state.profile.ageConfirmedAt);
    check("server block does not keep the date", JSON.stringify(t.state).indexOf(ADULT) === -1);

    t.setFetch(() => Promise.resolve(jsonResponse({ ok: true })));
    const before = Date.now();
    const ok = await t.finishOnboarding({ name: "Casey", dob: ADULT, gender: "Woman", photo: null });
    const after = Date.now();
    const stamped = Date.parse(t.state.profile.ageConfirmedAt);
    check("adult onboarding succeeds", ok === true && t.state.onboarded === true);
    check("confirmation timestamp is stored",
      typeof t.state.profile.ageConfirmedAt === "string" && stamped >= before - 1000 && stamped <= after + 1000,
      t.state.profile.ageConfirmedAt);
    const saved = store[KEY] || "";
    check("saved profile has the timestamp", saved.indexOf(t.state.profile.ageConfirmedAt) !== -1);
    check("saved profile has no date of birth",
      saved.indexOf(ADULT) === -1 && !t.state.profile.dob && !t.state.profile.birthday && !t.state.profile.age,
      saved.slice(0, 240));
  });

  await section("older saves without a confirmation go through the gate again", () => {
    const dob = "2004-08-08";
    const legacy = {};
    legacy[KEY] = JSON.stringify({
      onboarded: true,
      profile: { name: "Riley", age: "16", birthday: dob, gender: "Woman", ageConfirmedMinimum: 13 }
    });
    const t = loadApp(legacy);
    check("stored under-18 age is gated", t.state.onboarded === false && t.ageGateSatisfied(t.state) === false);
    check("legacy date of birth is removed from state", !t.state.profile.birthday && !t.state.profile.age && !t.state.profile.ageConfirmedMinimum);
    check("legacy date of birth is removed from storage",
      (legacy[KEY] || "").indexOf(dob) === -1 && (legacy[KEY] || "").indexOf('"age"') === -1,
      legacy[KEY]);
    check("no confirmation timestamp was invented", !t.state.profile.ageConfirmedAt);

    const adult = {};
    adult[KEY] = JSON.stringify({
      onboarded: true,
      profile: { name: "Riley", age: "25", birthday: "1999-01-01", gender: "Woman" }
    });
    const t2 = loadApp(adult);
    check("age without a confirmation timestamp is gated", t2.state.onboarded === false);
    check("that date of birth is not kept", (adult[KEY] || "").indexOf("1999-01-01") === -1);

    const confirmed = {};
    const stamp = "2026-02-02T15:04:05.000Z";
    confirmed[KEY] = JSON.stringify({
      onboarded: true,
      profile: { name: "Riley", gender: "Woman", ageConfirmedAt: stamp }
    });
    const t3 = loadApp(confirmed);
    check("a stored confirmation timestamp can pass", t3.state.onboarded === true && t3.state.profile.ageConfirmedAt === stamp);
  });

  return { pass: pass, fail: fail };
}

module.exports = main();
