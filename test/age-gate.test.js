/* 18+ gate: date of birth is checked, then dropped.
   The server never stores or logs it. The browser keeps only ageConfirmedAt. */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { loadApp } = require("./harness.js");
const { checkAge, latestDob, MINIMUM_AGE, ageOkCookie } = require("../public/util");

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

function shiftIso(iso, days) {
  const parts = iso.split("-");
  const dt = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + days));
  const p = n => (n < 10 ? "0" : "") + n;
  return dt.getUTCFullYear() + "-" + p(dt.getUTCMonth() + 1) + "-" + p(dt.getUTCDate());
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
        headers: res.headers,
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
  await section("calendar age in America/Denver", () => {
    // 8:30pm MST on Nov 1, 2026. UTC has already rolled to Nov 2.
    const evening = new Date("2026-11-02T03:30:00.000Z");
    check("exactly 18 on that Denver evening is allowed", checkAge("2008-11-01", evening).ok === true);
    check("17 years and 364 days on that Denver evening is blocked",
      checkAge("2008-11-02", evening).blocked === true && checkAge("2008-11-02", evening).ok === false);
    check("that instant is already the next UTC day", evening.toISOString().slice(0, 10) === "2026-11-02");
    check("latest birth date on that evening is the 18th birthday", latestDob(evening) === "2008-11-01");

    // 6:00pm MDT on Oct 28, 2026. UTC is already Oct 29.
    const dusk = new Date("2026-10-29T00:00:00.000Z");
    check("Denver birthday that UTC already passed is allowed", checkAge("2008-10-28", dusk).ok === true);
    check("the next Denver day is still 17", checkAge("2008-10-29", dusk).blocked === true);
    check("the day before is already 18", checkAge("2008-10-27", dusk).ok === true);

    check("malformed date is invalid", checkAge("13", evening).error === "invalid_date");
    check("impossible day is invalid", checkAge("2000-02-31", evening).error === "invalid_date");
    check("future date is blocked", checkAge("2027-01-01", evening).blocked === true);
    const today = new Date();
    const turns = latestDob(today);
    const still17 = shiftIso(turns, 1);
    check("18th birthday today is allowed", checkAge(turns, today).ok === true);
    check("birthday tomorrow is blocked", checkAge(still17, today).blocked === true);
    check("the shared minimum is 18", MINIMUM_AGE === 18);

    const utilSrc = fs.readFileSync(path.join(__dirname, "../public/util.js"), "utf8");
    const appSrc = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
    check("client and server share one minimum",
      utilSrc.indexOf("var MINIMUM_AGE = 18;") !== -1 &&
      utilSrc.indexOf("if(age < MINIMUM_AGE)") !== -1 &&
      appSrc.indexOf("var MINIMUM_AGE = SparkUtil.MINIMUM_AGE;") !== -1 &&
      appSrc.indexOf("var MINIMUM_AGE = 18;") === -1);
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

      const setCookie = allowed.headers["set-cookie"];
      check("pass sets spark_age_ok with the existing attributes",
        Array.isArray(setCookie) && setCookie.indexOf(ageOkCookie(false)) !== -1 &&
        setCookie.join("").indexOf(ADULT) === -1,
        JSON.stringify(setCookie));
      check("blocked response does not set the cookie", !blocked.headers["set-cookie"]);

      const turns = latestDob(new Date());
      const still17 = shiftIso(turns, 1);
      const boundaryNo = await post(port, "/api/age-check", { dob: still17 });
      const boundaryYes = await post(port, "/api/age-check", { dob: turns });
      const boundaryNoBody = JSON.parse(boundaryNo.body);
      const boundaryYesBody = JSON.parse(boundaryYes.body);
      check("server rejects 17 years and 364 days",
        boundaryNo.status === 200 && boundaryNoBody.ok === false && boundaryNoBody.blocked === true &&
        !boundaryNo.headers["set-cookie"] && boundaryNo.body.indexOf(still17) === -1,
        boundaryNo.status + " " + boundaryNo.body);
      check("server accepts exactly 18",
        boundaryYes.status === 200 && boundaryYesBody.ok === true && !boundaryYesBody.blocked &&
        Array.isArray(boundaryYes.headers["set-cookie"]) &&
        boundaryYes.headers["set-cookie"].indexOf(ageOkCookie(false)) !== -1 &&
        boundaryYes.body.indexOf(turns) === -1,
        boundaryYes.status + " " + boundaryYes.body);

      const bad = await post(port, "/api/age-check", { dob: "not-a-date" });
      check("bad date is invalid_date", bad.status === 400 && JSON.parse(bad.body).error === "invalid_date", bad.body);
      check("invalid response does not echo the input", bad.body.indexOf("not-a-date") === -1);
      check("invalid date does not set the cookie", !bad.headers["set-cookie"]);
      check("server exports checkAge for a later sign-up", app.checkAge === checkAge && app.MINIMUM_AGE === MINIMUM_AGE);

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

  await section("onboarding boundary in America/Denver", async () => {
    const today = new Date();
    const turns = latestDob(today);
    const still17 = shiftIso(turns, 1);
    const store = {};
    const t = loadApp(store);
    let calls = 0;
    t.setFetch((url, opts) => {
      calls++;
      const sent = JSON.parse(opts.body);
      check("exactly 18 is posted to the age route", url === "/api/age-check" && sent.dob === turns);
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    const blocked = await t.finishOnboarding({ name: "Casey", dob: still17, gender: "Woman" });
    check("17 years and 364 days is blocked before the server",
      blocked === false && calls === 0 && t.state.onboarded === false);
    check("that date is not stored", JSON.stringify(store).indexOf(still17) === -1);
    const ok = await t.finishOnboarding({ name: "Casey", dob: turns, gender: "Woman" });
    check("exactly 18 completes onboarding", ok === true && t.state.onboarded === true && calls === 1);
    check("the accepted date is not stored",
      JSON.stringify(store).indexOf(turns) === -1 && !t.state.profile.dob);
    const appSrc = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
    check("onboarding date max is today minus 18 years",
      appSrc.indexOf('getElementById("ob-dob")') !== -1 &&
      appSrc.indexOf("SparkUtil.latestDob(new Date())") !== -1 &&
      appSrc.indexOf('setAttribute("max", max)') !== -1);
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
