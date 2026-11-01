/* Username claim. Supabase auth.getUser and Postgres are faked the same
   way the other route tests fake a db: the router receives the stand-in.
   No database and no network. */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const express = require("express");
const util = require("../public/util");
const { WORDS, containsProfanity } = require("../lib/profanity");
const { createWindowLimiter } = require("../lib/rate-limit");
const { createSupabaseAuth } = require("../lib/auth");
const { SQL, COOLDOWN_MS, classifyUsername } = require("../lib/username");
const { createUsernameRouter } = require("../routes/username");
const { loadApp } = require("./harness");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
async function section(title, fn) {
  console.log("\n" + title);
  try { await fn(); }
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 500)); }
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const USER_C = "33333333-3333-4333-8333-333333333333";
const KEY = "spark_state_v1";
const DAY = "2026-06-01T00:00:00.000Z";

function same(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

function memoryDb() {
  const state = { names: [], holds: [], failUnique: false, released: 0 };
  let snap = null;
  function snapshot() {
    return {
      names: state.names.map(row => Object.assign({}, row)),
      holds: state.holds.map(row => Object.assign({}, row))
    };
  }
  async function query(sql, params) {
    const text = String(sql);
    params = params || [];
    if (text === "BEGIN") { snap = snapshot(); return { rows: [] }; }
    if (text === "COMMIT") { snap = null; return { rows: [] }; }
    if (text === "ROLLBACK") {
      if (snap) { state.names = snap.names; state.holds = snap.holds; }
      snap = null;
      return { rows: [] };
    }
    if (text === SQL.lockUser || text === SQL.lockName) return { rows: [] };
    if (text === SQL.selectMine || text === SQL.selectMe) {
      const row = state.names.filter(item => String(item.user_id) === String(params[0]))[0];
      return { rows: row ? [Object.assign({}, row)] : [] };
    }
    if (text === SQL.selectHold || text === SQL.checkHold) {
      const row = state.holds.filter(item => same(item.username, params[0]))[0];
      return { rows: row ? [Object.assign({}, row)] : [] };
    }
    if (text === SQL.selectLive || text === SQL.checkLive) {
      const row = state.names.filter(item => same(item.username, params[0]))[0];
      return { rows: row ? [{ user_id: row.user_id }] : [] };
    }
    if (text === SQL.upsertHold) {
      const existing = state.holds.filter(item => same(item.username, params[0]))[0];
      if (existing) {
        existing.username = String(params[0]).toLowerCase();
        existing.user_id = params[1];
        existing.held_until = params[2];
      } else {
        state.holds.push({
          username: String(params[0]).toLowerCase(),
          user_id: params[1],
          held_until: params[2]
        });
      }
      return { rows: [] };
    }
    if (text === SQL.insertName || text === SQL.updateName) {
      if (state.failUnique) {
        const err = new Error('duplicate key value violates unique constraint "usernames_username_key"');
        err.code = "23505";
        err.constraint = "usernames_username_key";
        throw err;
      }
    }
    if (text === SQL.insertName) {
      state.names.push({ user_id: params[0], username: params[1], changed_at: params[2] });
      return { rows: [] };
    }
    if (text === SQL.updateName) {
      const row = state.names.filter(item => String(item.user_id) === String(params[0]))[0];
      if (row) {
        row.username = params[1];
        row.changed_at = params[2];
      }
      return { rows: [] };
    }
    if (text === SQL.deleteHold) {
      state.holds = state.holds.filter(item => !same(item.username, params[0]));
      return { rows: [] };
    }
    throw new Error("unexpected sql: " + text);
  }
  return {
    state: state,
    query: query,
    async connect() {
      return {
        query: query,
        release() { state.released++; }
      };
    }
  };
}

function authFor(tokens) {
  const seen = [];
  return {
    seen: seen,
    auth: {
      async getUser(token) {
        seen.push(token);
        const id = tokens[token];
        if (!id) return { data: { user: null }, error: { message: "bad" } };
        return { data: { user: { id: id, email: "hidden@example.com" } }, error: null };
      }
    }
  };
}

function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}
function close(server) {
  return new Promise(resolve => server.close(resolve));
}
function request(port, method, urlPath, body, headers) {
  const data = body == null ? null : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = http.request({
      port: port,
      host: "127.0.0.1",
      path: urlPath,
      method: method,
      headers: Object.assign({}, data ? {
        "Content-Type": "application/json",
        "Content-Length": data.length
      } : {}, headers || {})
    }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch (err) { json = null; }
        resolve({ status: res.statusCode, headers: res.headers, text: text, json: json });
      });
    });
    req.on("error", reject);
    if (data) req.end(data);
    else req.end();
  });
}

function mount(options) {
  options = options || {};
  const db = options.db || memoryDb();
  const clock = options.clock || { now: new Date(DAY) };
  const auth = options.auth || authFor({ "good-a": USER_A, "good-b": USER_B, "good-c": USER_C });
  const app = express();
  app.use(express.json());
  app.use("/api", createUsernameRouter({
    db: db,
    isConfigured: () => true,
    auth: auth,
    now: () => clock.now,
    limitCheck: options.limitCheck || function () { return { limited: false, retryAfter: 0 }; },
    limitClaim: options.limitClaim || function () { return { limited: false, retryAfter: 0 }; }
  }));
  return { app: app, db: db, clock: clock, auth: auth };
}

function bearer(token) {
  return { Authorization: "Bearer " + token };
}

async function main() {
  await section("migration 012", () => {
    const dir = path.join(__dirname, "..", "db", "migrations");
    const files = fs.readdirSync(dir).filter(name => name.endsWith(".sql")).sort();
    check("012 exists and 011 is not in the folder",
      files.indexOf("012_usernames.sql") !== -1 &&
      files.indexOf("011_usernames.sql") === -1 &&
      files.every(name => name.indexOf("011_") !== 0),
      files.join(","));
    const sql = fs.readFileSync(path.join(dir, "012_usernames.sql"), "utf8");
    const body = sql.slice(sql.indexOf("create table if not exists public.usernames ("));
    check("columns match the agreed shape",
      /user_id uuid primary key references auth\.users\(id\) on delete cascade/.test(sql) &&
      /username extensions\.citext not null unique/.test(sql) &&
      /changed_at timestamptz not null default now\(\)/.test(sql));
    check("citext is referenced the same way 010 references it",
      sql.indexOf("extensions.citext") !== -1 &&
      sql.indexOf("create extension citext schema extensions") !== -1);
    check("RLS is deny-all, with no policy and no grant",
      /enable row level security/.test(sql) &&
      /revoke all on table public\.%I from public/.test(sql) &&
      /revoke all on table public\.%I from anon/.test(sql) &&
      /revoke all on table public\.%I from authenticated/.test(sql) &&
      /rolname = 'anon'/.test(sql) &&
      /rolname = 'authenticated'/.test(sql) &&
      /create\s+policy/i.test(sql) === false &&
      /^\s*grant\s+/im.test(sql) === false);
    check("usernames does not foreign-key to username_holds",
      /references\s+public\.username_holds/i.test(sql) === false &&
      /username_holds\s*\(/i.test(sql) === false);
    check("the table body is only those three columns",
      body.indexOf("user_id") !== -1 && body.indexOf("email") === -1 &&
      body.indexOf("phone") === -1 && body.indexOf("location") === -1);
  });

  await section("validation, reserved names, and profanity", () => {
    check("format helper still accepts admin for a local name",
      util.validateUsername("admin").ok === true && util.validateUsername("admin").username === "admin");
    check("MySparkle is reserved",
      util.reservedUsername("MySparkle") === true &&
      classifyUsername("MySparkle").status === "reserved" &&
      classifyUsername("MySparkle").error === "reserved");
    check("jaderoo_fan is reserved",
      util.reservedUsername("jaderoo_fan") === true &&
      classifyUsername("JADEROO_fan").status === "reserved");
    ["spark", "admin", "support", "help", "official", "mod", "moderator", "jaderoo", "sparkle"].forEach(name => {
      check(name + " is reserved", classifyUsername(name).status === "reserved");
    });
    ["5park", "sp_ark", "jader00", "admin1", "support_team", "0fficial", "mod", "m0d", "mod1", "help_", "he1p", "adm1n"].forEach(name => {
      check(name + " is a reserved lookalike",
        util.reservedUsername(name) === true && classifyUsername(name).status === "reserved",
        JSON.stringify(classifyUsername(name)));
    });
    ["modern_mike", "model", "helpful_hannah", "helpful", "mods"].forEach(name => {
      check(name + " is not reserved",
        util.reservedUsername(name) === false && classifyUsername(name).status === "available",
        JSON.stringify(classifyUsername(name)));
    });
    check("a Denver calendar day is used for hold and change dates",
      util.denverDay("2026-07-01T00:00:00.000Z") === "2026-06-30" &&
      util.denverDay("2026-07-01T06:00:00.000Z") === "2026-07-01");
    check("too short is invalid and makes no uniqueness claim",
      classifyUsername("ab").status === "invalid" && classifyUsername("ab").error === "too_short" &&
      classifyUsername("no").message.indexOf("taken") === -1);
    const word = WORDS[0];
    check("profanity list is a small module", Array.isArray(WORDS) && WORDS.length >= 8 && WORDS.length <= 40 && word.length >= 3);
    check("underscores and digits are stripped before the substring check",
      containsProfanity("oh_" + word) === true &&
      containsProfanity("sh1t") === false);
    const profane = classifyUsername("xx_" + word + "_1");
    check("profanity is invalid and does not echo the word",
      profane.status === "invalid" && profane.error === "profanity" &&
      profane.message.toLowerCase().indexOf(word) === -1);
  });

  const ctx = mount();
  const server = await listen(ctx.app);
  const port = server.address().port;
  try {
    await section("check and claim", async () => {
      const sparkle = await request(port, "GET", "/api/username/check?u=MySparkle");
      check("check reports MySparkle reserved",
        sparkle.status === 200 && sparkle.json && sparkle.json.status === "reserved",
        sparkle.text);
      const fan = await request(port, "GET", "/api/username/check?u=jaderoo_fan");
      check("check reports jaderoo_fan reserved",
        fan.status === 200 && fan.json && fan.json.status === "reserved");
      const bad = await request(port, "GET", "/api/username/check?u=no");
      check("check reports a short name invalid",
        bad.status === 200 && bad.json && bad.json.status === "invalid");
      const profane = await request(port, "GET", "/api/username/check?u=" + encodeURIComponent("xx_" + WORDS[0]));
      check("check reports profanity as invalid",
        profane.status === 200 && profane.json && profane.json.status === "invalid" && profane.json.error === "profanity");
      check("reserved check does not ask Supabase who you are", ctx.auth.seen.length === 0);

      const first = await request(port, "POST", "/api/username", { username: "Ada_One", email: "a@b.c", phone: "555", lat: 1 }, bearer("good-a"));
      check("first claim is free",
        first.status === 200 && first.json && first.json.ok === true && first.json.username === "ada_one",
        first.text);
      check("first claim stores changed_at one window in the past",
        ctx.db.state.names.length === 1 &&
        new Date(ctx.db.state.names[0].changed_at).getTime() === ctx.clock.now.getTime() - COOLDOWN_MS);
      check("first claim does not write a hold", ctx.db.state.holds.length === 0);
      check("claim response drops email, phone, and location",
        first.text.indexOf("a@b.c") === -1 && first.text.indexOf("555") === -1 && first.text.indexOf("lat") === -1);
      const me = await request(port, "GET", "/api/me/username", null, bearer("good-a"));
      check("me returns the claim and no cooldown yet",
        me.status === 200 && me.json && me.json.username === "ada_one" && me.json.nextChangeAt === null,
        me.text);

      const renamed = await request(port, "POST", "/api/username", { username: "ada_two" }, bearer("good-a"));
      check("the first rename is allowed",
        renamed.status === 200 && renamed.json && renamed.json.ok === true && renamed.json.username === "ada_two",
        renamed.text);
      const blocked = await request(port, "POST", "/api/username", { username: "ada_three" }, bearer("good-a"));
      check("a second rename inside 30 days is refused with the date",
        blocked.status === 409 && blocked.json && blocked.json.error === "cooldown" &&
        blocked.json.message === "You can change your username again on 2026-06-30." &&
        blocked.json.nextChangeAt === "2026-07-01T00:00:00.000Z",
        blocked.text);
      check("the refused rename did not change the row",
        ctx.db.state.names[0].username === "ada_two");

      ctx.db.state.names.push({
        user_id: USER_C,
        username: "CoolCat",
        changed_at: new Date("2026-01-01T00:00:00.000Z")
      });
      const taken = await request(port, "POST", "/api/username", { username: "COOLCAT" }, bearer("good-b"));
      check("a different case of a live name is taken",
        taken.status === 409 && taken.json && taken.json.error === "taken" &&
        taken.json.message === "That username is taken.",
        taken.text);
      const checked = await request(port, "GET", "/api/username/check?u=CoolCat");
      check("check is case-insensitive taken",
        checked.status === 200 && checked.json && checked.json.status === "taken");
      const own = await request(port, "GET", "/api/username/check?u=coolcat", null, bearer("good-c"));
      check("the owner checking their own name is not told it is taken",
        own.status === 200 && own.json && own.json.status === "available",
        own.text);
    });

    await section("holds", async () => {
      const hold = ctx.db.state.holds.filter(row => same(row.username, "ada_one"))[0];
      check("the released name is held for the original owner",
        !!hold && String(hold.user_id) === USER_A &&
        new Date(hold.held_until).toISOString() === "2026-07-01T00:00:00.000Z",
        JSON.stringify(hold));
      const other = await request(port, "POST", "/api/username", { username: "ada_one" }, bearer("good-b"));
      check("someone else cannot take a held name",
        other.status === 409 && other.json && other.json.error === "held" &&
        other.json.message === "That username is held until 2026-06-30.",
        other.text);
      const looked = await request(port, "GET", "/api/username/check?u=ada_one");
      check("check reports the held name",
        looked.status === 200 && looked.json && looked.json.status === "held");

      // The change limit and the hold are both 30 days. Age only the
      // change clock so the hold is still active when the owner comes back.
      const mine = ctx.db.state.names.filter(row => String(row.user_id) === USER_A)[0];
      mine.changed_at = new Date(ctx.clock.now.getTime() - COOLDOWN_MS - 1000);
      const back = await request(port, "POST", "/api/username", { username: "ada_one" }, bearer("good-a"));
      check("the original owner can take the held name back",
        back.status === 200 && back.json && back.json.ok === true && back.json.username === "ada_one",
        back.text);
      check("taking it back clears that hold and holds the name they left",
        !ctx.db.state.holds.some(row => same(row.username, "ada_one")) &&
        ctx.db.state.holds.some(row => same(row.username, "ada_two") && String(row.user_id) === USER_A));
      const takenBack = await request(port, "POST", "/api/username", { username: "ada_one" }, bearer("good-b"));
      check("the live name is taken, not held, once the owner has it",
        takenBack.json && takenBack.json.error === "taken",
        takenBack.text);

      ctx.db.state.holds.push({
        username: "old_name",
        user_id: USER_A,
        held_until: new Date("2026-05-01T00:00:00.000Z")
      });
      const expired = await request(port, "GET", "/api/username/check?u=old_name");
      check("an expired hold is available",
        expired.status === 200 && expired.json && expired.json.status === "available",
        expired.text);
    });

    await section("unique violation maps to taken", async () => {
      ctx.db.state.failUnique = true;
      const before = JSON.stringify(ctx.db.state.names);
      const raced = await request(port, "POST", "/api/username", { username: "brand_new" }, bearer("good-b"));
      check("unique violation is a friendly taken error",
        raced.status === 409 && raced.json && raced.json.error === "taken" &&
        raced.json.message === "That username is taken." &&
        raced.text.indexOf("usernames_username_key") === -1 &&
        raced.text.indexOf("duplicate") === -1,
        raced.text);
      check("the failed claim did not keep a row", JSON.stringify(ctx.db.state.names) === before);
      ctx.db.state.failUnique = false;
    });

    await section("401 without a valid user", async () => {
      const seen = ctx.auth.seen.length;
      const noHeader = await request(port, "POST", "/api/username", { username: "someone" });
      const me = await request(port, "GET", "/api/me/username");
      const empty = await request(port, "POST", "/api/username", { username: "someone" }, { Authorization: "Bearer " });
      check("no token is 401 and does not call getUser",
        noHeader.status === 401 && noHeader.json && noHeader.json.error === "unauthorized" &&
        me.status === 401 && empty.status === 401 &&
        ctx.auth.seen.length === seen,
        noHeader.text + " / " + me.text);
      const bad = await request(port, "POST", "/api/username", { username: "someone" }, bearer("nope"));
      check("a rejected token is 401",
        bad.status === 401 && bad.json && bad.json.error === "unauthorized" &&
        ctx.auth.seen[ctx.auth.seen.length - 1] === "nope",
        bad.text);
      check("401 body has no email", bad.text.indexOf("hidden@example.com") === -1 && bad.text.indexOf("email") === -1);
    });
  } finally {
    await close(server);
  }

  await section("claim rate limit", async () => {
    const limiter = createWindowLimiter({ limit: 2, windowMs: 60 * 1000 });
    const keys = [];
    const limited = mount({
      limitClaim: function (key) {
        keys.push(key);
        return limiter.check(key);
      }
    });
    const httpServer = await listen(limited.app);
    const limitedPort = httpServer.address().port;
    try {
      const first = await request(limitedPort, "POST", "/api/username", { username: "ada_one" }, bearer("good-a"));
      const second = await request(limitedPort, "POST", "/api/username", { username: "ada_two" }, bearer("good-a"));
      const third = await request(limitedPort, "POST", "/api/username", { username: "ada_three" }, bearer("good-a"));
      check("the third claim in the window is 429",
        first.status !== 429 && second.status !== 429 &&
        third.status === 429 && third.json && third.json.error === "rate_limited" &&
        third.json.message === "Too many tries. Wait a minute and try that username again." &&
        Number(third.headers["retry-after"]) >= 1,
        third.status + " " + third.text);
      const other = await request(limitedPort, "POST", "/api/username", { username: "fresh_bb" }, bearer("good-b"));
      check("a different user is not limited by the first user's claims",
        other.status !== 429 && keys.filter(key => key === "user:" + USER_B).length === 1,
        other.status + " " + keys.join(","));
      const open1 = await request(limitedPort, "POST", "/api/username", { username: "someone" });
      const open2 = await request(limitedPort, "POST", "/api/username", { username: "someone" });
      const open3 = await request(limitedPort, "POST", "/api/username", { username: "someone" });
      check("an anonymous claim is limited by address",
        open1.status === 401 && open2.status === 401 &&
        open3.status === 429 && open3.json && open3.json.message === "Too many tries. Wait a minute and try that username again." &&
        keys.some(key => key.indexOf("ip:") === 0) &&
        keys.every(key => key.indexOf("user:") === 0 || key.indexOf("ip:") === 0),
        open3.status + " " + keys.join(","));
    } finally {
      await close(httpServer);
    }
  });

  await section("check rate limit", async () => {
    const limiter = createWindowLimiter({ limit: 2, windowMs: 60 * 1000 });
    const limited = mount({ limitCheck: function (key) { return limiter.check(key); } });
    const httpServer = await listen(limited.app);
    const limitedPort = httpServer.address().port;
    try {
      const first = await request(limitedPort, "GET", "/api/username/check?u=ab");
      const second = await request(limitedPort, "GET", "/api/username/check?u=ab");
      const third = await request(limitedPort, "GET", "/api/username/check?u=ab");
      check("the third check in the window is rate limited",
        first.status === 200 && second.status === 200 &&
        third.status === 429 && third.json && third.json.error === "rate_limited" &&
        Number(third.headers["retry-after"]) >= 1,
        third.status + " " + third.text);
    } finally {
      await close(httpServer);
    }
  });

  await section("auth.getUser", async () => {
    const calls = [];
    const client = createSupabaseAuth({
      url: "https://example.supabase.co/",
      key: "anon-key",
      fetch: async function (url, init) {
        calls.push({ url: url, init: init });
        return { ok: true, json: async function () { return { id: USER_A, email: "hidden@example.com" }; } };
      }
    });
    const result = await client.auth.getUser("tok-1");
    check("getUser hits the Supabase user endpoint with the bearer token",
      result.data.user.id === USER_A &&
      calls.length === 1 &&
      calls[0].url === "https://example.supabase.co/auth/v1/user" &&
      calls[0].init.headers.Authorization === "Bearer tok-1" &&
      calls[0].init.headers.apikey === "anon-key");
    const missing = createSupabaseAuth({ url: "", key: "", fetch: async function () { throw new Error("should not fetch"); } });
    const none = await missing.auth.getUser("tok-1");
    check("a server without Supabase config does not fetch",
      none.data.user === null && none.error && none.error.message === "not_configured");
  });

  await section("signed-out client makes no fetch", async () => {
    const storage = {};
    storage[KEY] = JSON.stringify({
      profile: { name: "Ada", gender: "Woman" },
      identity: { localId: "loc_keep", username: null, userId: null }
    });
    const app = loadApp(storage);
    const before = app.fetchCalls.length;
    const saved = await app.submitProfileEdits({ name: "Ada", gender: "Woman", username: "  Ada_1 " });
    const panel = app.buildEditProfileSubpanel();
    const form = panel.children.filter(child => child.className === "idea-form")[0];
    check("signed-out save stays on this device",
      saved.ok === true && app.state.identity.username === "ada_1" && app.state.identity.userId === null);
    check("signed-out username screen makes no fetch",
      app.fetchCalls.length === before &&
      app.fetchCalls.every(call => String(call[0]).indexOf("/api/username") === -1 && String(call[0]).indexOf("/api/me/username") === -1),
      JSON.stringify(app.fetchCalls));
    check("signed-out editor copy is unchanged",
      form.innerHTML.indexOf("Saved on this device only for now.") !== -1 &&
      form.innerHTML.indexOf("It is not reserved or unique yet.") !== -1);

    const future = {};
    future[KEY] = JSON.stringify({
      profile: { name: "Ada", gender: "Woman" },
      identity: { localId: "loc_keep", username: null, userId: "future-user" }
    });
    const noToken = loadApp(future);
    const futureBefore = noToken.fetchCalls.length;
    const local = await noToken.submitProfileEdits({ name: "Ada", gender: "Woman", username: "local_name" });
    check("a user id without a token stays local and does not fetch",
      local.ok === true && noToken.state.identity.username === "local_name" &&
      noToken.fetchCalls.length === futureBefore);
  });

  await section("signed-in client uses check and claim", async () => {
    const storage = {};
    storage[KEY] = JSON.stringify({
      profile: { name: "Ada", gender: "Woman" },
      identity: { localId: "loc_keep", username: null, userId: USER_A }
    });
    storage.spark_access_token = "tok-1";
    const app = loadApp(storage);
    const calls = [];
    function json(body, status) {
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status: status,
        json: function () { return Promise.resolve(body); }
      });
    }
    app.setFetch(function (url, opts) {
      opts = opts || {};
      calls.push({
        url: String(url),
        method: opts.method || "GET",
        headers: opts.headers || {},
        body: opts.body || ""
      });
      if (String(url).indexOf("/api/me/username") !== -1) {
        return json({ ok: true, username: null, nextChangeAt: "2026-12-01T00:00:00.000Z" }, 200);
      }
      if (String(url).indexOf("u=admin") !== -1) {
        return json({ ok: false, status: "reserved", error: "reserved", message: "That username is reserved." }, 200);
      }
      if (String(url).indexOf("u=taken_name") !== -1) {
        return json({ ok: false, status: "taken", error: "taken", message: "That username is taken." }, 200);
      }
      if (String(url).indexOf("/api/username/check") !== -1) {
        return json({ ok: true, status: "available" }, 200);
      }
      const sent = opts.body ? JSON.parse(opts.body) : {};
      if (sent.username === "cooldown_name") {
        return json({
          ok: false,
          error: "cooldown",
          nextChangeAt: "2026-12-01T00:00:00.000Z",
          message: "You can change your username again on 2026-12-01."
        }, 409);
      }
      return json({ ok: true, username: sent.username }, 200);
    });

    const reserved = await app.submitProfileEdits({ name: "Ada", gender: "Woman", username: "Admin" });
    check("reserved claim shows the server error and does not save",
      reserved.ok === false && reserved.error === "That username is reserved." &&
      app.state.identity.username === null);
    const taken = await app.submitProfileEdits({ name: "Ada", gender: "Woman", username: "taken_name" });
    check("taken check is shown and does not post a claim",
      taken.ok === false && taken.error === "That username is taken." &&
      !calls.some(call => call.method === "POST" && call.body.indexOf("taken_name") !== -1));
    const cooled = await app.submitProfileEdits({ name: "Ada", gender: "Woman", username: "cooldown_name" });
    check("cooldown error includes the next date and does not save",
      cooled.ok === false && cooled.error.indexOf("2026-12-01") !== -1 &&
      app.state.identity.username === null,
      cooled.error);
    const saved = await app.submitProfileEdits({ name: "Ada B", gender: "Woman", username: "New_Name" });
    check("a free claim is saved onto identity",
      saved.ok === true && app.state.identity.username === "new_name" && app.state.profile.name === "Ada B");
    const post = calls.filter(call => call.method === "POST" && call.body.indexOf("new_name") !== -1)[0];
    check("claim posts only the username with the bearer token",
      !!post && post.url.indexOf("/api/username") !== -1 &&
      post.headers.Authorization === "Bearer tok-1" &&
      Object.keys(JSON.parse(post.body)).join(",") === "username" &&
      post.body.indexOf("email") === -1 && post.body.indexOf("phone") === -1 &&
      post.body.indexOf("lat") === -1,
      JSON.stringify(post));
    check("check was called for the signed-in edit",
      calls.some(call => call.url.indexOf("/api/username/check?u=") !== -1));

    const panelCalls = calls.length;
    app.buildEditProfileSubpanel();
    check("opening the signed-in editor reads the account username",
      calls.slice(panelCalls).some(call => call.url.indexOf("/api/me/username") !== -1 && call.headers.Authorization === "Bearer tok-1"));
  });

  await section("mounted on the server", async () => {
    const app = require("../server");
    const httpServer = await listen(app);
    const mountedPort = httpServer.address().port;
    try {
      const denied = await request(mountedPort, "POST", "/api/username", { username: "someone" });
      const me = await request(mountedPort, "GET", "/api/me/username");
      check("the app rejects a username claim with no token",
        denied.status === 401 && denied.json && denied.json.error === "unauthorized" &&
        me.status === 401,
        denied.status + " " + denied.text);
    } finally {
      await close(httpServer);
    }
  });

  return { pass: pass, fail: fail };
}

module.exports = main();
