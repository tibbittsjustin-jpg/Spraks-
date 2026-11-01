/* POST /api/submissions and the on-device idea form.
   No database. The route gets a fake insert. */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const express = require("express");
const submit = require("../public/submit");
const { latestDob } = require("../public/util");

function shiftIso(iso, days) {
  const parts = iso.split("-");
  const dt = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + days));
  const p = n => (n < 10 ? "0" : "") + n;
  return dt.getUTCFullYear() + "-" + p(dt.getUTCMonth() + 1) + "-" + p(dt.getUTCDate());
}
const { validateSourceUrl } = require("../lib/validate-url");
const { createEmailLimiter } = require("../lib/rate-limit");
const { createSubmissionsRouter, createIpLimiter, LIMITS } = require("../routes/submissions");
const { loadApp } = require("./harness");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
async function section(title, fn) {
  console.log("\n" + title);
  try { await fn(); }
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 400)); }
}

const FORBIDDEN = ["lat", "lng", "location", "localId", "submittedBy", "deviceId", "dob", "email", "status"];
const KEY = "spark_state_v1";

function validBody(extra) {
  return Object.assign({
    email: "Person@Example.com",
    ageConfirmed: true,
    title: "Sunset picnic",
    description: "Pack a blanket and watch the sky fade over the river.",
    category: "Picnics & Parks",
    setting: "Outdoor",
    season: ["Summer", "Summer"],
    cost: "Free",
    duration: "Short (1-2 hrs)",
    time: ["Evening"],
    vibe: ["Chill", "Romantic"],
    stage: ["First Date"],
    dateType: ["Solo/Couple"],
    food: true,
    age21: false,
    venueName: "River Park",
    city: "Provo",
    sourceUrl: "https://example.com/picnic"
  }, extra || {});
}

function postRaw(port, urlPath, body, headers) {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      port: port,
      host: "127.0.0.1",
      path: urlPath,
      method: "POST",
      headers: Object.assign({ "Content-Length": data.length }, headers || {})
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

function postJson(port, urlPath, payload, headers) {
  return postRaw(port, urlPath, JSON.stringify(payload), Object.assign({
    "Content-Type": "application/json",
    "Cookie": "spark_age_ok=1"
  }, headers || {}));
}

function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
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

function mount(opts) {
  const calls = [];
  const app = express();
  if (opts && opts.trustProxy) app.set("trust proxy", opts.trustProxy);
  const insert = (opts && opts.insert) || (async (payload, email) => { calls.push({ payload: payload, email: email }); });
  app.use("/api/submissions", createSubmissionsRouter({
    isConfigured: opts && opts.isConfigured ? opts.isConfigured : () => true,
    insert: insert,
    ipBurst: opts && opts.ipBurst ? opts.ipBurst : createIpLimiter(LIMITS.ipBurstWindowMs, 1000),
    ipDay: opts && opts.ipDay ? opts.ipDay : createIpLimiter(LIMITS.ipDayWindowMs, 1000),
    emailLimiter: opts && opts.emailLimiter ? opts.emailLimiter : createEmailLimiter({ limit: 1000, windowMs: LIMITS.emailDayWindowMs })
  }));
  return { app: app, calls: calls };
}

function collectText(node) {
  if (!node || typeof node !== "object") return "";
  let out = String(node.innerHTML || "") + " " + String(node.className || "");
  const kids = node.children || [];
  for (let i = 0; i < kids.length; i++) out += " " + collectText(kids[i]);
  return out;
}

function payloadHasForbidden(payload) {
  if (!payload || typeof payload !== "object") return true;
  return FORBIDDEN.some(key => Object.prototype.hasOwnProperty.call(payload, key));
}

async function main() {
  await section("saved-idea helpers", () => {
    const dirty = {
      title: " Sunset picnic ",
      description: " Pack a blanket and watch the sky fade. ",
      category: "Picnics & Parks",
      email: "Ada@Example.com",
      ageConfirmed: true,
      ageConfirmedAt: "2026-01-01T00:00:00.000Z",
      lat: 40.2,
      lng: -111.6,
      location: { lat: 1, lng: 2 },
      localId: "local-1",
      submittedBy: "phone",
      deviceId: "device-1",
      dob: "1990-01-01",
      status: "approved",
      vibe: ["Chill", "Chill"]
    };
    const body = submit.buildSubmissionBody(dirty);
    check("body lowercases email and confirms age", body.email === "ada@example.com" && body.ageConfirmed === true);
    check("body trims title and dedupes vibes", body.title === "Sunset picnic" && body.vibe.length === 1 && body.vibe[0] === "Chill");
    FORBIDDEN.concat(["ageConfirmedAt", "submittedBy"]).forEach(key => {
      if (key === "email") return;
      check("built body omits " + key, !Object.prototype.hasOwnProperty.call(body, key));
    });
    check("built body has no coordinates or device id",
      JSON.stringify(body).indexOf("40.2") === -1 && JSON.stringify(body).indexOf("local-1") === -1 &&
      JSON.stringify(body).indexOf("device-1") === -1 && JSON.stringify(body).indexOf("1990-01-01") === -1);
    check("pending copy", submit.submissionStatusCopy("pending") === "Pending review");
    check("on-device copy", submit.submissionStatusCopy("not_sent") === "Saved on this device" &&
      submit.submissionStatusCopy(undefined) === "Saved on this device");
    const offline = submit.submissionOutcome(0);
    const down = submit.submissionOutcome(503);
    check("offline and 503 stay on the device until a tap",
      offline.save === "not_sent" && down.save === "not_sent" &&
      offline.message.indexOf("Tap Send") !== -1 && down.message.indexOf("next time you open") === -1);
    check("201 copy stays pending",
      submit.submissionOutcome(201).save === "pending" &&
      submit.submissionOutcome(201).message.indexOf("pending review") !== -1);
    check("honeypot 200 uses the same thanks",
      submit.submissionOutcome(200).save === "pending" &&
      submit.submissionOutcome(200).message === submit.submissionOutcome(201).message);
    check("400 and 429 do not save",
      submit.submissionOutcome(400).save == null && submit.submissionOutcome(400).highlight === true &&
      submit.submissionOutcome(429).message.indexOf("Try again later") !== -1);
    const legacy = submit.normalizeStoredIdea({
      title: "Old idea", category: "Hiking & Nature", description: "Already on the phone.",
      vibe: ["Chill"], localId: "abc", lat: 1, lng: 2, email: "secret@example.com", submittedBy: "phone"
    });
    check("legacy idea becomes not_sent without ids or email",
      legacy.status === "not_sent" && legacy.title === "Old idea" && legacy.vibe[0] === "Chill" &&
      !legacy.localId && !legacy.email && !legacy.lat && !legacy.submittedBy);
    check("banner shows for an unsent idea", submit.shouldShowIdeaSendBanner({
      submittedIdeas: [legacy], ideaSendBannerDismissed: false
    }) === true);
    check("dismissed banner stays dismissed", submit.shouldShowIdeaSendBanner({
      submittedIdeas: [legacy], ideaSendBannerDismissed: true
    }) === false);
    check("banner hides when every idea is pending", submit.shouldShowIdeaSendBanner({
      submittedIdeas: [{ status: "pending", title: "In" }], ideaSendBannerDismissed: false
    }) === false);
    const httpsUrl = "https://example.com/picnic";
    check("https source link is accepted", validateSourceUrl(httpsUrl).value === httpsUrl);
    check("http source link is rejected", validateSourceUrl("http://example.com").ok === false);
    check("javascript source link is rejected", validateSourceUrl("javascript:alert(1)").ok === false);
    check("credentialed source link is rejected",
      validateSourceUrl("https://user:pass@example.com/a").ok === false &&
      validateSourceUrl("https://user@example.com/a").ok === false);
    const prefix = "https://example.com/";
    const maxUrl = prefix + "a".repeat(2048 - prefix.length);
    check("2048-character https link is accepted", validateSourceUrl(maxUrl).ok === true && validateSourceUrl(maxUrl).value.length === 2048);
    check("2049-character link is rejected", validateSourceUrl(maxUrl + "b").ok === false);
  });

  await section("route accepts a valid idea and drops private fields", async () => {
    const mounted = mount();
    const server = await listen(mounted.app);
    const port = server.address().port;
    const spy = spyConsole();
    try {
      const res = await postJson(port, "/api/submissions", validBody({
        lat: 40.23,
        lng: -111.66,
        location: { lat: 40.23, lng: -111.66 },
        localId: "local-9",
        submittedBy: "phone",
        deviceId: "device-9",
        dob: "1990-05-05",
        status: "approved",
        submitter_email: "other@example.com",
        note: "ignore me"
      }));
      const body = JSON.parse(res.body);
      check("valid body is 201 pending", res.status === 201 && body.ok === true && body.status === "pending" && !body.id,
        res.status + " " + res.body);
      check("response does not echo the email or the date of birth",
        res.body.indexOf("person@example.com") === -1 && res.body.indexOf("Person@Example.com") === -1 &&
        res.body.indexOf("1990-05-05") === -1);
      check("repo called once with a lowercased email and no status",
        mounted.calls.length === 1 && mounted.calls[0].email === "person@example.com" &&
        !Object.prototype.hasOwnProperty.call(mounted.calls[0].payload, "status"));
      const payload = mounted.calls[0].payload;
      check("payload is schema 1 and dedupes season",
        payload.schemaVersion === 1 && payload.season.length === 1 && payload.season[0] === "Summer" &&
        payload.age21 === false && payload.food === true && payload.city === "Provo" &&
        payload.sourceUrl === "https://example.com/picnic");
      check("payload has no email, coordinates, or device ids",
        !payloadHasForbidden(payload) && JSON.stringify(payload).indexOf("person@example.com") === -1 &&
        JSON.stringify(payload).indexOf("local-9") === -1 && JSON.stringify(payload).indexOf("device-9") === -1 &&
        !payload.note && !payload.submitter_email);
      check("request log does not contain the email, date, or address",
        spy.logs.join("\n").indexOf("person@example.com") === -1 &&
        spy.logs.join("\n").indexOf("1990-05-05") === -1 &&
        spy.logs.join("\n").indexOf("40.23") === -1);
      const both = await postJson(port, "/api/submissions", validBody({ email: "both@example.com", setting: "Both" }));
      check("setting Both is accepted", both.status === 201 && mounted.calls[1].payload.setting === "Both", both.body);
    } finally {
      spy.restore();
      await close(server);
    }
  });

  await section("validation errors stay generic", async () => {
    const mounted = mount();
    const server = await listen(mounted.app);
    const port = server.address().port;
    try {
      const bad = await postJson(port, "/api/submissions", {
        ageConfirmed: true,
        email: "nope",
        title: "ab",
        description: "short",
        category: "Nope",
        season: ["Spring", "Monsoon"],
        sourceUrl: "http://example.com",
        city: "x".repeat(81),
        food: "yes"
      });
      const badBody = JSON.parse(bad.body);
      check("invalid submission is 400", bad.status === 400 && badBody.error === "invalid_submission", bad.body);
      ["email", "title", "description", "category", "season", "sourceUrl", "city", "food"].forEach(name => {
        check("fields lists " + name, Array.isArray(badBody.fields) && badBody.fields.indexOf(name) !== -1, bad.body);
      });
      check("400 does not echo the bad values",
        bad.body.indexOf("nope") === -1 && bad.body.indexOf("Monsoon") === -1 && bad.body.indexOf("http://example.com") === -1);
      check("invalid body does not insert", mounted.calls.length === 0);

      const noAge = await postJson(port, "/api/submissions", validBody({ ageConfirmed: false }));
      const droppedAge = Object.assign(validBody(), {});
      delete droppedAge.ageConfirmed;
      const missing = await postJson(port, "/api/submissions", droppedAge);
      const stringAge = await postJson(port, "/api/submissions", validBody({ ageConfirmed: "true" }));
      check("missing or false age is 403",
        noAge.status === 403 && JSON.parse(noAge.body).error === "age_required" &&
        missing.status === 403 && stringAge.status === 403,
        noAge.body + " " + missing.body + " " + stringAge.body);
      check("age rejection does not insert", mounted.calls.length === 0);

      const dob = "1991-02-03";
      const spy = spyConsole();
      const withDob = await postJson(port, "/api/submissions", validBody({ email: "dob@example.com", dob: dob }));
      const logged = spy.logs.join("\n");
      spy.restore();
      check("a date of birth is dropped and not logged",
        withDob.status === 201 && !mounted.calls[0].payload.dob && logged.indexOf(dob) === -1 && withDob.body.indexOf(dob) === -1);

      const noProof = await postJson(port, "/api/submissions", validBody({ email: "noproof@example.com" }), { Cookie: "" });
      const badCookie = await postJson(port, "/api/submissions", validBody({ email: "badcookie@example.com" }), { Cookie: "spark_age_ok=0" });
      check("a missing or invalid age cookie is its own rejection",
        noProof.status === 403 && JSON.parse(noProof.body).error === "age_cookie_required" &&
        badCookie.status === 403 && JSON.parse(badCookie.body).error === "age_cookie_required" &&
        noProof.body.indexOf("noproof@example.com") === -1 && badCookie.body.indexOf("badcookie@example.com") === -1,
        noProof.status + " " + noProof.body + " " + badCookie.body);
      check("a missing age check does not insert",
        mounted.calls.every(call => call.email !== "noproof@example.com" && call.email !== "badcookie@example.com"));

      const tooYoung = shiftIso(latestDob(new Date()), 1);
      const youngSpy = spyConsole();
      const youngSubmit = await postJson(port, "/api/submissions", validBody({ email: "young@example.com", dob: tooYoung }));
      const youngLogged = youngSpy.logs.join("\n");
      youngSpy.restore();
      check("an under-18 date of birth is rejected even with the age cookie",
        youngSubmit.status === 403 && JSON.parse(youngSubmit.body).error === "age_required" &&
        youngSubmit.body.indexOf(tooYoung) === -1 && youngLogged.indexOf(tooYoung) === -1 &&
        mounted.calls.every(call => call.email !== "young@example.com" && !call.payload.dob),
        youngSubmit.status + " " + youngSubmit.body);

      const urls = [
        ["http://example.com/a", "http"],
        ["javascript:alert(1)", "javascript"],
        ["https://user:pass@example.com/a", "credentials"],
        ["https://example.com/" + "a".repeat(2040), "too long"]
      ];
      for (const pair of urls) {
        const res = await postJson(port, "/api/submissions", validBody({ email: pair[1].replace(/\W/g, "") + "@example.com", sourceUrl: pair[0] }));
        const body = JSON.parse(res.body);
        check(pair[1] + " source link is 400",
          res.status === 400 && body.fields && body.fields.indexOf("sourceUrl") !== -1 && res.body.indexOf(pair[0].slice(0, 24)) === -1,
          res.body.slice(0, 180));
      }
      const prefix = "https://example.com/";
      const maxUrl = prefix + "a".repeat(2048 - prefix.length);
      const maxOk = await postJson(port, "/api/submissions", validBody({ email: "longurl@example.com", sourceUrl: maxUrl }));
      check("2048-character https link is stored",
        maxOk.status === 201 && mounted.calls[mounted.calls.length - 1].payload.sourceUrl.length === 2048,
        maxOk.body);

      const city = "c".repeat(80);
      const cityOk = await postJson(port, "/api/submissions", validBody({ email: "city@example.com", city: "  " + city + "  " }));
      check("an 80-character city is kept and optional whitespace is trimmed",
        cityOk.status === 201 && mounted.calls[mounted.calls.length - 1].payload.city === city);
      const noCity = await postJson(port, "/api/submissions", validBody({ email: "nocity@example.com", city: "   " }));
      check("a blank city is omitted",
        noCity.status === 201 && !Object.prototype.hasOwnProperty.call(mounted.calls[mounted.calls.length - 1].payload, "city"));
    } finally {
      await close(server);
    }
  });

  await section("honeypot, size, and content type", async () => {
    const mounted = mount();
    const server = await listen(mounted.app);
    const port = server.address().port;
    try {
      const trap = await postJson(port, "/api/submissions", validBody({ website: "https://spam.example" }));
      check("filled honeypot is 200 and not stored",
        trap.status === 200 && JSON.parse(trap.body).ok === true && JSON.parse(trap.body).status === "pending" &&
        mounted.calls.length === 0, trap.body);
      const raw = await postRaw(port, "/api/submissions", "title=nope", { "Content-Type": "text/plain" });
      check("non-JSON is 415", raw.status === 415 && JSON.parse(raw.body).error === "unsupported_media_type", raw.body);
      const broken = await postRaw(port, "/api/submissions", "{", { "Content-Type": "application/json" });
      check("broken JSON is 400", broken.status === 400 && JSON.parse(broken.body).error === "invalid_submission", broken.body);
      const huge = await postRaw(port, "/api/submissions", "{" + "a".repeat(20 * 1024), {
        "Content-Type": "application/json"
      });
      check("body over 16kb is 413", huge.status === 413 && JSON.parse(huge.body).error === "too_large", huge.status + " " + huge.body.slice(0, 120));
      check("rejected bodies were not inserted", mounted.calls.length === 0);
    } finally {
      await close(server);
    }
  });

  await section("rate limits", async () => {
    check("limits are 5 per 10 minutes, 20 per day, and 10 emails per day",
      LIMITS.ipBurst === 5 && LIMITS.ipBurstWindowMs === 10 * 60 * 1000 &&
      LIMITS.ipDay === 20 && LIMITS.ipDayWindowMs === 24 * 60 * 60 * 1000 &&
      LIMITS.emailDay === 10);

    const burst = mount({
      ipBurst: createIpLimiter(LIMITS.ipBurstWindowMs, LIMITS.ipBurst),
      ipDay: createIpLimiter(LIMITS.ipDayWindowMs, 1000)
    });
    const burstServer = await listen(burst.app);
    try {
      let last = null;
      for (let i = 0; i < 6; i++) {
        last = await postJson(burstServer.address().port, "/api/submissions", validBody({ email: "burst" + i + "@example.com" }));
        if (i < 5) check("burst request " + (i + 1) + " is allowed", last.status === 201, last.status + " " + last.body.slice(0, 120));
      }
      check("sixth request from one IP is 429",
        last.status === 429 && JSON.parse(last.body).error === "rate_limited" && Number(last.headers["retry-after"]) >= 1,
        last.status + " " + last.body + " retry " + last.headers["retry-after"]);
      check("the blocked burst request was not inserted", burst.calls.length === 5);
    } finally {
      await close(burstServer);
    }

    const day = mount({
      ipBurst: createIpLimiter(LIMITS.ipBurstWindowMs, 1000),
      ipDay: createIpLimiter(LIMITS.ipDayWindowMs, LIMITS.ipDay)
    });
    const dayServer = await listen(day.app);
    try {
      let last = null;
      for (let i = 0; i < 21; i++) {
        last = await postJson(dayServer.address().port, "/api/submissions", validBody({ email: "day" + i + "@example.com" }));
      }
      check("21st request from one IP in a day is 429",
        last.status === 429 && JSON.parse(last.body).error === "rate_limited" && day.calls.length === 20,
        last.status + " " + day.calls.length);
    } finally {
      await close(dayServer);
    }

    const emailLimiter = createEmailLimiter({ limit: LIMITS.emailDay, windowMs: LIMITS.emailDayWindowMs });
    const emails = mount({
      trustProxy: 1,
      ipBurst: createIpLimiter(LIMITS.ipBurstWindowMs, 1000),
      ipDay: createIpLimiter(LIMITS.ipDayWindowMs, 1000),
      emailLimiter: emailLimiter
    });
    const emailServer = await listen(emails.app);
    const address = "Repeat@Example.com";
    try {
      let last = null;
      for (let i = 1; i <= 11; i++) {
        last = await postJson(emailServer.address().port, "/api/submissions", validBody({ email: address }), {
          "X-Forwarded-For": "198.51.100." + i
        });
        if (i <= 10) check("email request " + i + " from a new IP is allowed", last.status === 201, last.status + " " + last.body.slice(0, 160));
      }
      check("11th request for one email is 429",
        last.status === 429 && JSON.parse(last.body).error === "rate_limited" && Number(last.headers["retry-after"]) >= 1 &&
        emails.calls.length === 10,
        last.status + " " + last.body);
      check("email limiter stores a hash, not the address",
        emailLimiter.hasRaw(address) === false && emailLimiter.hasRaw(address.toLowerCase()) === false &&
        emailLimiter.hasHash(address) === true);
      check("stored emails are lowercase", emails.calls.every(call => call.email === address.toLowerCase()));
    } finally {
      await close(emailServer);
    }
  });

  await section("failures stay generic", async () => {
    const email = "secret-submitter@example.com";
    const mounted = mount({
      insert: async () => { throw new Error(email + " database blew up"); }
    });
    const server = await listen(mounted.app);
    const spy = spyConsole();
    try {
      const res = await postJson(server.address().port, "/api/submissions", validBody({ email: email }));
      const logged = spy.logs.join("\n");
      check("insert failure is 500 request_failed",
        res.status === 500 && JSON.parse(res.body).error === "request_failed" && res.body.indexOf(email) === -1,
        res.body);
      check("log line has no email and no error detail",
        logged.indexOf("[submissions] request_failed") !== -1 && logged.indexOf(email) === -1 &&
        logged.indexOf("database blew up") === -1,
        logged.slice(0, 300));
    } finally {
      spy.restore();
      await close(server);
    }

    const off = mount({ isConfigured: () => false });
    const offServer = await listen(off.app);
    try {
      const res = await postJson(offServer.address().port, "/api/submissions", validBody());
      check("unconfigured database is 503", res.status === 503 && JSON.parse(res.body).error === "unavailable", res.body);
      check("unconfigured database does not insert", off.calls.length === 0);
    } finally {
      await close(offServer);
    }
  });

  await section("real server wiring", async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";
    const app = require("../server");
    const server = await listen(app);
    const port = server.address().port;
    try {
      const missing = await new Promise((resolve, reject) => {
        http.get({ port: port, host: "127.0.0.1", path: "/api/submissions" }, res => {
          const chunks = [];
          res.on("data", c => chunks.push(c));
          res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
        }).on("error", reject);
      });
      check("GET /api/submissions is 404 JSON", missing.status === 404 && JSON.parse(missing.body).error === "not_found", missing.body);
      const huge = await postRaw(port, "/api/submissions", "{" + "b".repeat(20 * 1024), { "Content-Type": "application/json" });
      check("the mounted route still rejects a 20kb body", huge.status === 413 && JSON.parse(huge.body).error === "too_large", huge.status + " " + huge.body.slice(0, 80));
      const plain = await postRaw(port, "/api/submissions", "nope", { "Content-Type": "text/plain" });
      check("the mounted route still rejects non-JSON", plain.status === 415, plain.status + " " + plain.body.slice(0, 80));
      const down = await postJson(port, "/api/submissions", validBody({ email: "offline@example.com" }));
      check("the mounted route is 503 when DATABASE_URL is empty",
        down.status === 503 && JSON.parse(down.body).error === "unavailable" && down.body.indexOf("offline@example.com") === -1,
        down.status + " " + down.body);
    } finally {
      if (previous == null) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
      await close(server);
    }
  });

  await section("ideas on this device are not sent by themselves", async () => {
    const store = {};
    const stamp = "2026-02-02T15:04:05.000Z";
    store[KEY] = JSON.stringify({
      onboarded: true,
      profile: { name: "Riley", gender: "Woman", ageConfirmedAt: stamp },
      submittedIdeas: [{
        title: "Already here",
        category: "Hiking & Nature",
        description: "Saved on the phone before the form could send.",
        vibe: ["Chill"],
        localId: "phone-1",
        lat: 40.2,
        lng: -111.6,
        submittedBy: "phone",
        deviceId: "device-phone",
        email: "old@example.com"
      }]
    });
    const t = loadApp(store);
    const idea = t.state.submittedIdeas[0];
    check("opening the app leaves the old idea unsent",
      idea && idea.title === "Already here" && idea.status !== "pending");
    const calls = t.fetchCalls || [];
    check("opening the app does not post a submission",
      calls.every(call => String(call[0]).indexOf("/api/submissions") === -1),
      JSON.stringify(calls.map(call => call[0])));
    const posted = submit.buildSubmissionBody(Object.assign({}, idea, { email: "ada@example.com", ageConfirmed: true }));
    check("a send body drops the device fields",
      posted.email === "ada@example.com" && posted.ageConfirmed === true &&
      !posted.localId && !posted.lat && !posted.lng && !posted.submittedBy && !posted.deviceId &&
      JSON.stringify(posted).indexOf("phone-1") === -1 && JSON.stringify(posted).indexOf("old@example.com") === -1);
    let formText = "";
    let formThrew = false;
    try {
      formText = collectText(t.buildIdeaSubmitSubpanel());
    } catch (err) {
      formThrew = true;
      formText = String(err && err.message || err);
    }
    check("the idea form builds", formThrew === false, formText.slice(0, 240));
    check("the form explains the email and offers Send",
      formText.indexOf("Never shown publicly.") !== -1 &&
      formText.indexOf("21+ (alcohol-centered)") !== -1 &&
      formText.indexOf("Saved on this device") !== -1 &&
      formText.indexOf("btn-outline") !== -1 &&
      formText.indexOf("Nothing is sent unless you tap Send") !== -1,
      formText.slice(0, 500));

    const migrations = fs.readdirSync(path.join(__dirname, "..", "db", "migrations")).filter(name => name.endsWith(".sql")).sort();
    check("known migration files",
      migrations.join(",") === "001_init.sql,002_over100_age21.sql,003_source_url_city.sql,004_materials.sql,006_security_hardening.sql,007_expires_at.sql,008_occurrences.sql,009_weekly_open_end.sql,010_lists_friends.sql",
      migrations.join(","));
    const routeSrc = fs.readFileSync(path.join(__dirname, "..", "routes", "submissions.js"), "utf8");
    check("insert writes payload and email only", routeSrc.indexOf("insert into submissions (payload, submitter_email) values ($1, $2)") !== -1);
    check("new SQL does not name citext", /citext/i.test(routeSrc) === false);
    const libSql = ["validate-url.js", "rate-limit.js", "submission.js"].map(name => {
      return fs.readFileSync(path.join(__dirname, "..", "lib", name), "utf8");
    }).join("\n");
    check("helpers do not name citext", /citext/i.test(libSql) === false);
  });

  await section("an onboarded person without the age cookie confirms in place", async () => {
    function textOf(node) {
      return collectText(node);
    }
    function findPrompt(node) {
      if (!node) return null;
      if (node.getAttribute && node.getAttribute("data-age-prompt") === "birthday") return node;
      const kids = node.children || [];
      for (let i = 0; i < kids.length; i++) {
        const found = findPrompt(kids[i]);
        if (found) return found;
      }
      return null;
    }
    function jsonResponse(status, body) {
      return { status: status, json: () => Promise.resolve(body) };
    }
    const draft = {
      title: "Sunset picnic",
      description: "Pack a blanket and watch the sky fade over the river.",
      category: "Picnics & Parks",
      email: "ada@example.com",
      ageConfirmed: true,
      vibe: ["Chill"]
    };
    const plan = { id: "plan_keep", name: "Friday Night", date: "2026-06-05", ideaIds: [2], friendPicks: [] };
    const stamp = "2026-02-02T15:04:05.000Z";
    function savedProfile() {
      const store = {};
      store[KEY] = JSON.stringify({
        onboarded: true,
        hasSeenTutorial: true,
        profile: { name: "Riley", gender: "Woman", ageConfirmedAt: stamp },
        datePlans: [plan]
      });
      return loadApp(store);
    }

    const blocked = savedProfile();
    const parent = blocked.document.createElement("div");
    const beforePlans = JSON.stringify(blocked.state.datePlans);
    const beforeIdeas = blocked.state.submittedIdeas.length;
    blocked.finishSubmission(
      { status: 403, payload: { ok: false, error: "age_cookie_required" } },
      draft,
      { form: parent }
    );
    const prompt = findPrompt(parent);
    const promptText = textOf(parent);
    const dateInput = prompt && (prompt.children || []).filter(node => node && node.tagName === "INPUT")[0];
    check("a missing-cookie 403 shows the birthday prompt",
      prompt != null && promptText.indexOf("Quick check: confirm your birthday") !== -1 &&
      dateInput && dateInput.type === "date",
      promptText.slice(0, 240));
    check("the prompt does not restart onboarding",
      blocked.onboardingRestarts === 0 && blocked.state.onboarded === true &&
      blocked.state.profile.name === "Riley" && blocked.state.profile.ageConfirmedAt === stamp);
    check("the prompt keeps the plans and the unsent draft",
      JSON.stringify(blocked.state.datePlans) === beforePlans &&
      blocked.state.submittedIdeas.length === beforeIdeas);

    blocked.finishSubmission(
      { status: 403, payload: { ok: false, error: "age_required" } },
      draft,
      { form: blocked.document.createElement("div") }
    );
    check("an under-18 rejection still opens onboarding", blocked.onboardingRestarts === 1);

    const young = shiftIso(latestDob(new Date()), 1);
    let youngPosts = 0;
    blocked.setFetch((url) => {
      youngPosts++;
      if (url === "/api/age-check") return Promise.resolve(jsonResponse(200, { ok: false, blocked: true }));
      return Promise.resolve(jsonResponse(500, { ok: false }));
    });
    const failed = await blocked.confirmSubmissionBirthday(young);
    check("a birthday that is under 18 does not wipe the profile or the draft",
      failed && failed.ok === false && failed.blocked === true &&
      blocked.lastToastMessage.indexOf("18 or older") !== -1 &&
      youngPosts === 0 && blocked.onboardingRestarts === 1 &&
      blocked.state.profile.name === "Riley" && blocked.state.profile.ageConfirmedAt === stamp &&
      JSON.stringify(blocked.state.datePlans) === beforePlans &&
      blocked.state.submittedIdeas.length === beforeIdeas &&
      JSON.stringify(blocked.state).indexOf(young) === -1);

    const fresh = savedProfile();
    const host = fresh.document.createElement("div");
    const keptPlans = JSON.stringify(fresh.state.datePlans);
    fresh.finishSubmission(
      { status: 403, payload: { error: "age_cookie_required" } },
      draft,
      { form: host }
    );
    const adult = "1990-05-05";
    const posts = [];
    fresh.setFetch((url, opts) => {
      const sent = opts && opts.body ? JSON.parse(opts.body) : null;
      posts.push({ url: url, body: sent });
      if (url === "/api/age-check") return Promise.resolve(jsonResponse(200, { ok: true }));
      if (url === "/api/submissions") return Promise.resolve(jsonResponse(201, { ok: true, status: "pending" }));
      return Promise.resolve(jsonResponse(500, { ok: false }));
    });
    const passed = await fresh.confirmSubmissionBirthday(adult);
    const submissionPosts = posts.filter(call => call.url === "/api/submissions");
    const agePosts = posts.filter(call => call.url === "/api/age-check");
    check("a passing birthday retries the same draft",
      passed && passed.ok === true && agePosts.length === 1 && agePosts[0].body.dob === adult &&
      submissionPosts.length === 1 && submissionPosts[0].body.title === draft.title &&
      submissionPosts[0].body.description === draft.description &&
      submissionPosts[0].body.email === draft.email &&
      !Object.prototype.hasOwnProperty.call(submissionPosts[0].body, "dob"),
      JSON.stringify(posts.map(call => call.url)));
    check("the retry keeps the profile and the plan and does not store the date",
      fresh.onboardingRestarts === 0 && fresh.state.onboarded === true &&
      fresh.state.profile.name === "Riley" && fresh.state.profile.ageConfirmedAt === stamp &&
      JSON.stringify(fresh.state.datePlans) === keptPlans &&
      fresh.state.submittedIdeas.length === 1 && fresh.state.submittedIdeas[0].title === draft.title &&
      JSON.stringify(fresh.state).indexOf(adult) === -1 &&
      fresh.document.cookie.indexOf("spark_age_ok=1") === 0);
  });

  return { pass: pass, fail: fail };
}

module.exports = main();
