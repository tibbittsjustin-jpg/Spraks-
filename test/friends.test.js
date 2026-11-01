/* Real friends. Supabase auth.getUser and Postgres are faked.
   No database and no network. */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const express = require("express");
const { loadApp } = require("./harness");
const { createFriendsRouter } = require("../routes/friends");
const { SQL, NOT_FOUND_MESSAGE, deleteAccountFriends } = require("../lib/friends");
const { SQL: SAFETY_SQL } = require("../lib/safety");
const { LIMIT_MESSAGES, SAFETY_LIMITS } = require("../lib/safety-limits");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
async function section(title, fn) {
  console.log("\n" + title);
  try { await fn(); }
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 800)); }
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const USER_C = "33333333-3333-4333-8333-333333333333";
const USER_D = "44444444-4444-4444-8444-444444444444";
const KEY = "spark_state_v1";
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function same(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}
function pairKey(left, right) {
  return [String(left), String(right)].sort().join(":");
}

function memoryDb() {
  const state = {
    users: [
      { user_id: USER_A, username: "ada" },
      { user_id: USER_B, username: "river_day" },
      { user_id: USER_C, username: "casey" },
      { user_id: USER_D, username: "solo_name" }
    ],
    friendships: [],
    blocks: [],
    queryLog: [],
    released: 0
  };
  let snap = null;
  let seq = 1;
  function snapshot() {
    return JSON.parse(JSON.stringify({ friendships: state.friendships, blocks: state.blocks }));
  }
  function restore(saved) {
    if (!saved) return;
    state.friendships = saved.friendships;
    state.blocks = saved.blocks;
  }
  function rowCount(n) {
    return { rows: [], rowCount: n };
  }
  function findPair(a, b) {
    const key = pairKey(a, b);
    return state.friendships.filter(item => pairKey(item.requester_id, item.addressee_id) === key)[0] || null;
  }
  async function query(sql, params) {
    const text = String(sql);
    params = params || [];
    if (text !== "BEGIN" && text !== "COMMIT" && text !== "ROLLBACK") state.queryLog.push(text);
    if (text === "BEGIN") { snap = snapshot(); return { rows: [] }; }
    if (text === "COMMIT") { snap = null; return { rows: [] }; }
    if (text === "ROLLBACK") { restore(snap); snap = null; return { rows: [] }; }
    if (text === SQL.selectUserByName) {
      const row = state.users.filter(item => same(item.username, params[0]))[0];
      return { rows: row ? [Object.assign({}, row)] : [] };
    }
    if (text === SQL.lockUser) return { rows: [] };
    if (text === SAFETY_SQL.selectEither) {
      const rows = state.blocks.filter(item => {
        const forward = String(item.blocker_id) === String(params[0]) && String(item.blocked_id) === String(params[1]);
        const back = String(item.blocker_id) === String(params[1]) && String(item.blocked_id) === String(params[0]);
        return forward || back;
      });
      return { rows: rows.slice(0, 1) };
    }
    if (text === SQL.selectFriendship) {
      const row = findPair(params[0], params[1]);
      return { rows: row ? [Object.assign({}, row)] : [] };
    }
    if (text === SQL.countPending) {
      const n = state.friendships.filter(item => String(item.requester_id) === String(params[0]) && item.status === "pending").length;
      return { rows: [{ n: n }] };
    }
    if (text === SQL.insertPending) {
      if (findPair(params[0], params[1])) {
        const err = new Error("duplicate");
        err.code = "23505";
        err.constraint = "friendships_pair_uidx";
        throw err;
      }
      state.friendships.push({
        id: "f-" + seq++,
        requester_id: params[0],
        addressee_id: params[1],
        status: "pending"
      });
      return rowCount(1);
    }
    if (text === SQL.acceptIncoming || text === SQL.declineIncoming) {
      const row = state.friendships.filter(item =>
        String(item.requester_id) === String(params[1]) &&
        String(item.addressee_id) === String(params[0]) &&
        item.status === "pending")[0];
      if (!row) return rowCount(0);
      row.status = text === SQL.acceptIncoming ? "accepted" : "declined";
      row.responded_at = "2026-06-01T00:00:00.000Z";
      return rowCount(1);
    }
    if (text === SQL.cancelOutgoing) {
      const before = state.friendships.length;
      state.friendships = state.friendships.filter(item => !(
        String(item.requester_id) === String(params[0]) &&
        String(item.addressee_id) === String(params[1]) &&
        item.status === "pending"
      ));
      return rowCount(before - state.friendships.length);
    }
    if (text === SQL.reopen) {
      const row = findPair(params[0], params[1]);
      if (!row) return rowCount(0);
      row.requester_id = params[0];
      row.addressee_id = params[1];
      row.status = "pending";
      row.responded_at = null;
      return rowCount(1);
    }
    if (text === SQL.unfriend) {
      const before = state.friendships.length;
      state.friendships = state.friendships.filter(item => {
        if (item.status !== "accepted") return true;
        return pairKey(item.requester_id, item.addressee_id) !== pairKey(params[0], params[1]);
      });
      return rowCount(before - state.friendships.length);
    }
    if (text === SQL.listMine) {
      const rows = [];
      state.friendships.forEach(item => {
        if (item.status !== "pending" && item.status !== "accepted") return;
        const mine = String(item.requester_id) === String(params[0]) || String(item.addressee_id) === String(params[0]);
        if (!mine) return;
        const otherId = String(item.requester_id) === String(params[0]) ? item.addressee_id : item.requester_id;
        const user = state.users.filter(row => String(row.user_id) === String(otherId))[0];
        if (!user) return;
        rows.push({
          requester_id: item.requester_id,
          addressee_id: item.addressee_id,
          status: item.status,
          username: user.username
        });
      });
      rows.sort((a, b) => String(a.username).localeCompare(String(b.username)));
      return { rows: rows };
    }
    if (text === SQL.listBlockIds) {
      const rows = state.blocks.filter(item => String(item.blocker_id) === String(params[0]) || String(item.blocked_id) === String(params[0]));
      return { rows: rows.map(item => Object.assign({}, item)) };
    }
    if (text === SQL.deleteForUser) {
      state.friendships = state.friendships.filter(item => String(item.requester_id) !== String(params[0]) && String(item.addressee_id) !== String(params[0]));
      return rowCount(1);
    }
    throw new Error("unexpected sql: " + text);
  }
  return {
    state: state,
    query: query,
    async connect() {
      return { query: query, release() { state.released++; } };
    }
  };
}

function authFor(tokens) {
  return {
    auth: {
      async getUser(token) {
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
function bearer(token) {
  return { Authorization: "Bearer " + token };
}
function allowAll() {
  return { limited: false, retryAfter: 0 };
}
function names(list) {
  return (list || []).map(item => item.username).join(",");
}
function textOf(node) {
  if (!node) return "";
  let out = node.innerHTML || "";
  (node.children || []).forEach(child => { out += "\n" + textOf(child); });
  return out;
}

function mount(options) {
  options = options || {};
  const db = options.db || memoryDb();
  const auth = options.auth || authFor({ "good-a": USER_A, "good-b": USER_B, "good-c": USER_C, "good-d": USER_D });
  const app = express();
  app.use(express.json());
  app.use("/api", createFriendsRouter({
    db: db,
    isConfigured: () => true,
    auth: auth,
    limiters: options.limiters || { friendRequests: options.limitRequests || allowAll }
  }));
  return { app: app, db: db };
}

async function main() {
  await section("migration 014 keeps one report per target and reason", () => {
    const dir = path.join(__dirname, "..", "db", "migrations");
    const files = fs.readdirSync(dir).filter(name => name.endsWith(".sql")).sort();
    check("014 exists and 011 is still absent",
      files.indexOf("014_report_identity.sql") !== -1 &&
      files.every(name => name.indexOf("011_") !== 0),
      files.join(","));
    const sql = fs.readFileSync(path.join(dir, "014_report_identity.sql"), "utf8");
    const indexAt = sql.indexOf("create unique index");
    const indexSql = indexAt < 0 ? "" : sql.slice(indexAt, sql.indexOf(";", indexAt));
    check("the note is not part of the report identity",
      indexSql.indexOf("reports_identical_reporter_uidx") !== -1 &&
      indexSql.indexOf("reason") !== -1 &&
      indexSql.indexOf("note") === -1);
    check("RLS stays deny-all, with no policy and no grant",
      /enable row level security/.test(sql) &&
      /revoke all on table public\.reports from public/.test(sql) &&
      /revoke all on table public\.reports from anon/.test(sql) &&
      /revoke all on table public\.reports from authenticated/.test(sql) &&
      /create\s+policy/i.test(sql) === false &&
      /^\s*grant\s+/im.test(sql) === false);
    const friendsSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "friends.js"), "utf8") +
      fs.readFileSync(path.join(__dirname, "..", "routes", "friends.js"), "utf8");
    check("friend routes do not send push or email",
      /web-push|nodemailer|sendMail|mailto:|activity_items/i.test(friendsSrc) === false);
  });

  const ctx = mount();
  const server = await listen(ctx.app);
  const port = server.address().port;
  try {
    await section("exact username, case-insensitive, with no search", async () => {
      const denied = await request(port, "POST", "/api/friends/requests", { username: "river_day" });
      check("signed-out request is 401 and writes nothing",
        denied.status === 401 && ctx.db.state.friendships.length === 0);

      const created = await request(port, "POST", "/api/friends/requests", { username: "River_Day" }, bearer("good-a"));
      check("River_Day matches river_day and stays pending",
        created.status === 200 && created.json && created.json.ok === true && created.json.status === "pending" &&
        ctx.db.state.friendships.length === 1 &&
        ctx.db.state.friendships[0].requester_id === USER_A &&
        ctx.db.state.friendships[0].addressee_id === USER_B &&
        ctx.db.state.friendships[0].status === "pending",
        created.text);
      check("the success body has no user id", created.text.indexOf(USER_B) === -1 && UUID_RE.test(created.text) === false);

      const partial = await request(port, "POST", "/api/friends/requests", { username: "river" }, bearer("good-a"));
      const longer = await request(port, "POST", "/api/friends/requests", { username: "river_day_x" }, bearer("good-a"));
      check("a prefix or a longer name is not a match and suggests nobody",
        partial.status === 404 && longer.status === 404 &&
        partial.json && partial.json.error === "not_found" &&
        partial.json.message === NOT_FOUND_MESSAGE &&
        Array.isArray(partial.json.friends) === false &&
        partial.text.indexOf("suggest") === -1 &&
        ctx.db.state.friendships.length === 1,
        partial.text + " " + longer.status);

      const search = await request(port, "GET", "/api/friends/search?q=river", null, bearer("good-a"));
      check("there is no search route", search.status === 404);
    });

    await section("self and duplicate requests", async () => {
      const self = await request(port, "POST", "/api/friends/requests", { username: "ada" }, bearer("good-a"));
      check("you can't friend yourself",
        self.status === 400 && self.json && self.json.error === "self" &&
        ctx.db.state.friendships.length === 1);
      const again = await request(port, "POST", "/api/friends/requests", { username: "river_day" }, bearer("good-a"));
      check("a second request to the same person is a duplicate",
        again.status === 400 && again.json && again.json.error === "duplicate" &&
        again.json.message.indexOf("already sent") !== -1 &&
        ctx.db.state.friendships.length === 1,
        again.text);
    });

    await section("a request the other person already sent is accepted", async () => {
      ctx.db.state.friendships = [{
        requester_id: USER_C,
        addressee_id: USER_A,
        status: "pending"
      }];
      const back = await request(port, "POST", "/api/friends/requests", { username: "casey" }, bearer("good-a"));
      check("sending one back accepts the single row",
        back.status === 200 && back.json && back.json.status === "accepted" &&
        ctx.db.state.friendships.length === 1 &&
        ctx.db.state.friendships[0].status === "accepted" &&
        ctx.db.state.friendships[0].requester_id === USER_C,
        back.text + " rows " + ctx.db.state.friendships.length);
    });

    await section("accept, decline, cancel, and unfriend", async () => {
      ctx.db.state.friendships = [{
        requester_id: USER_A,
        addressee_id: USER_B,
        status: "pending"
      }];
      const accepted = await request(port, "POST", "/api/friends/requests/ada/accept", {}, bearer("good-b"));
      check("the addressee can accept",
        accepted.status === 200 && accepted.json.status === "accepted" &&
        ctx.db.state.friendships[0].status === "accepted");
      const removed = await request(port, "DELETE", "/api/friends/ada", null, bearer("good-b"));
      check("unfriend deletes the row",
        removed.status === 200 && removed.json.status === "removed" &&
        ctx.db.state.friendships.length === 0,
        removed.text);

      const sent = await request(port, "POST", "/api/friends/requests", { username: "solo_name" }, bearer("good-a"));
      const declined = await request(port, "POST", "/api/friends/requests/ada/decline", {}, bearer("good-d"));
      check("decline keeps one declined row and it is not still pending",
        sent.status === 200 && declined.status === 200 && declined.json.status === "decline" &&
        ctx.db.state.friendships.length === 1 &&
        ctx.db.state.friendships[0].status === "declined");
      const list = await request(port, "GET", "/api/friends", null, bearer("good-a"));
      check("a declined request is not incoming or outgoing",
        list.status === 200 && names(list.json.incoming) === "" && names(list.json.outgoing) === "" && names(list.json.friends) === "");

      const reopened = await request(port, "POST", "/api/friends/requests", { username: "solo_name" }, bearer("good-a"));
      check("a declined pair can be requested again",
        reopened.status === 200 && reopened.json.status === "pending" &&
        ctx.db.state.friendships.length === 1 &&
        ctx.db.state.friendships[0].status === "pending" &&
        ctx.db.state.friendships[0].requester_id === USER_A);
      const canceled = await request(port, "POST", "/api/friends/requests/solo_name/cancel", {}, bearer("good-a"));
      check("cancel deletes the outgoing request",
        canceled.status === 200 && canceled.json.status === "cancel" &&
        ctx.db.state.friendships.length === 0);
      const strangerCancel = await request(port, "POST", "/api/friends/requests/river_day/cancel", {}, bearer("good-a"));
      check("cancel with no request does not invent one",
        strangerCancel.status === 404 && ctx.db.state.friendships.length === 0);
    });

    await section("a block looks the same as a missing username", async () => {
      ctx.db.state.blocks.push({ blocker_id: USER_A, blocked_id: USER_B });
      ctx.db.state.queryLog = [];
      const missing = await request(port, "POST", "/api/friends/requests", { username: "nobody_zz" }, bearer("good-a"));
      const missLog = ctx.db.state.queryLog.slice();
      ctx.db.state.queryLog = [];
      const blocked = await request(port, "POST", "/api/friends/requests", { username: "river_day" }, bearer("good-a"));
      const blockLog = ctx.db.state.queryLog.slice();
      ctx.db.state.queryLog = [];
      const reverse = await request(port, "POST", "/api/friends/requests", { username: "ada" }, bearer("good-b"));
      check("blocked and missing share status, body, and lookups",
        missing.status === blocked.status &&
        missing.text === blocked.text &&
        missing.json.error === "not_found" &&
        missing.json.message === NOT_FOUND_MESSAGE &&
        missLog.join("\n") === blockLog.join("\n") &&
        missLog.indexOf(SQL.selectUserByName) !== -1 &&
        missLog.indexOf(SAFETY_SQL.selectEither) !== -1 &&
        missLog.indexOf(SQL.selectFriendship) !== -1 &&
        missLog.indexOf(SQL.insertPending) === -1 &&
        ctx.db.state.friendships.length === 0,
        missing.status + " " + missing.text + " logs " + missLog.length + "/" + blockLog.length);
      check("the blocked person gets that same response when they try",
        reverse.status === missing.status && reverse.text === missing.text);
      ctx.db.state.blocks = [];
    });

    await section("the friends list is only yours, and only usernames", async () => {
      ctx.db.state.friendships = [
        { requester_id: USER_A, addressee_id: USER_B, status: "accepted" },
        { requester_id: USER_B, addressee_id: USER_C, status: "accepted" },
        { requester_id: USER_D, addressee_id: USER_A, status: "pending" }
      ];
      const mine = await request(port, "GET", "/api/friends", null, bearer("good-a"));
      check("friends, incoming, and outgoing are usernames only",
        mine.status === 200 &&
        mine.headers["cache-control"] === "no-store" &&
        names(mine.json.friends) === "river_day" &&
        names(mine.json.incoming) === "solo_name" &&
        names(mine.json.outgoing) === "" &&
        Object.keys(mine.json.friends[0]).join(",") === "username" &&
        mine.text.indexOf(USER_B) === -1 &&
        mine.text.indexOf(USER_C) === -1 &&
        mine.text.indexOf("casey") === -1,
        mine.text);
      const theirs = await request(port, "GET", "/api/friends", null, bearer("good-b"));
      check("the other person does not receive your whole list",
        names(theirs.json.friends) === "ada,casey" &&
        names(theirs.json.incoming) === "" &&
        theirs.text.indexOf("solo_name") === -1,
        theirs.text);
    });

    await section("account deletion removes friendships", async () => {
      const before = ctx.db.state.friendships.length;
      await deleteAccountFriends(ctx.db, USER_A);
      check("rows touching the account are gone and other pairs stay",
        before > 0 &&
        ctx.db.state.friendships.every(item => item.requester_id !== USER_A && item.addressee_id !== USER_A) &&
        ctx.db.state.friendships.some(item => item.requester_id === USER_B && item.addressee_id === USER_C));
    });
  } finally {
    await close(server);
  }

  await section("429 uses the friend-request copy", async () => {
    const { createWindowLimiter } = require("../lib/rate-limit");
    const limitedDb = memoryDb();
    const window = createWindowLimiter({ limit: 1, windowMs: 60 * 1000 });
    const limited = mount({
      db: limitedDb,
      limiters: { friendRequests: window.check }
    });
    const limitedServer = await listen(limited.app);
    const limitedPort = limitedServer.address().port;
    try {
      const first = await request(limitedPort, "POST", "/api/friends/requests", { username: "river_day" }, bearer("good-a"));
      const second = await request(limitedPort, "POST", "/api/friends/requests", { username: "casey" }, bearer("good-a"));
      check("the daily limiter returns 429 with the friendly copy",
        first.status === 200 && second.status === 429 &&
        second.json && second.json.error === "rate_limited" &&
        second.json.message === LIMIT_MESSAGES.friendRequests &&
        Number(second.headers["retry-after"]) > 0 &&
        limitedDb.state.friendships.length === 1,
        second.status + " " + second.text);
      const other = await request(limitedPort, "POST", "/api/friends/requests", { username: "ada" }, bearer("good-b"));
      check("someone else's request budget is separate", other.status === 200, String(other.status));
    } finally {
      await close(limitedServer);
    }

    const pendingDb = memoryDb();
    for (let i = 0; i < SAFETY_LIMITS.friendRequestsPending; i++) {
      const id = "55555555-5555-4555-8555-" + String(i).padStart(12, "0");
      pendingDb.state.users.push({ user_id: id, username: "pend_" + i });
      pendingDb.state.friendships.push({ requester_id: USER_A, addressee_id: id, status: "pending" });
    }
    const capped = mount({ db: pendingDb });
    const cappedServer = await listen(capped.app);
    const cappedPort = cappedServer.address().port;
    try {
      const extraId = "66666666-6666-4666-8666-666666666666";
      pendingDb.state.users.push({ user_id: extraId, username: "one_more" });
      const stopped = await request(cappedPort, "POST", "/api/friends/requests", { username: "one_more" }, bearer("good-a"));
      check("100 pending requests returns 429 and does not add another",
        stopped.status === 429 && stopped.json && stopped.json.message === LIMIT_MESSAGES.friendRequestsPending &&
        pendingDb.state.friendships.length === SAFETY_LIMITS.friendRequestsPending,
        stopped.status + " " + stopped.text + " rows " + pendingDb.state.friendships.length);
    } finally {
      await close(cappedServer);
    }
  });

  await section("the app server mounts the routes", async () => {
    const app = require("../server");
    const httpServer = await listen(app);
    const mountedPort = httpServer.address().port;
    try {
      const list = await request(mountedPort, "GET", "/api/friends");
      const send = await request(mountedPort, "POST", "/api/friends/requests", { username: "river_day" });
      check("the app requires a signed-in user for friends",
        list.status === 401 && send.status === 401,
        [list.status, send.status].join(","));
    } finally {
      await close(httpServer);
    }
  });

  await section("the friends tab", async () => {
    const needle = "DEMO_" + "FRIENDS";
    const hits = [];
    function walk(dir) {
      fs.readdirSync(dir).forEach(name => {
        if (name === "node_modules" || name === ".git") return;
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full);
        else if (/\.(js|css|html|md|sql)$/.test(name)) {
          if (fs.readFileSync(full, "utf8").indexOf(needle) !== -1) hits.push(path.relative(path.join(__dirname, ".."), full));
        }
      });
    }
    walk(path.join(__dirname, ".."));
    check("no " + needle + " references remain", hits.length === 0, hits.join(","));

    const signedOutStore = {};
    signedOutStore[KEY] = JSON.stringify({
      onboarded: true,
      profile: { name: "Ada", gender: "Woman", ageConfirmedAt: "2026-01-02T00:00:00.000Z" },
      identity: { localId: "loc_keep", username: "ada", userId: null },
      datePlans: [{ id: "p1", name: "Friday", date: "", createdAt: 0, ideaIds: [2], friendPicks: [null, { friendName: "Emma R.", ideaId: 2 }] }]
    });
    const signedOut = loadApp(signedOutStore);
    const before = signedOut.fetchCalls.length;
    const card = signedOut.buildFriendsScreen();
    const cardText = textOf(card);
    check("signed-out friends tab is the sign-in card",
      cardText.indexOf("Sign in to add friends") !== -1 &&
      cardText.indexOf("Accept") === -1 &&
      cardText.indexOf("Add a friend") === -1);
    check("signed-out friends tab does not fetch",
      signedOut.fetchCalls.length === before &&
      signedOut.fetchCalls.slice(before).every(call => String(call[0]).indexOf("/api/friends") === -1));
    check("a leftover friend pick does not throw",
      signedOut.state.datePlans[0].friendPicks.length === 1 &&
      signedOut.state.datePlans[0].friendPicks[0].friendName === "Emma R.");
    const quiet = await signedOut.submitFriendRequest("river_day");
    check("signed-out add does not fetch",
      quiet.ok === false && signedOut.fetchCalls.length === before);

    const storage = {};
    storage[KEY] = JSON.stringify({
      onboarded: true,
      profile: { name: "Ada", gender: "Woman", ageConfirmedAt: "2026-01-02T00:00:00.000Z" },
      identity: { localId: "loc_keep", username: "ada", userId: USER_A }
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
      calls.push({ url: String(url), method: opts.method || "GET", headers: opts.headers || {}, body: opts.body || "" });
      if (String(url).indexOf("/api/friends/requests") !== -1 && opts.method === "POST") {
        const sent = opts.body ? JSON.parse(opts.body) : {};
        if (sent.username === "rate_me") {
          return json({ ok: false, error: "rate_limited", message: LIMIT_MESSAGES.friendRequests }, 429);
        }
        if (sent.username === "nobody_zz") {
          return json({ ok: false, error: "not_found", message: NOT_FOUND_MESSAGE }, 404);
        }
        if (sent.username === "casey") return json({ ok: true, status: "accepted" }, 200);
        return json({ ok: true, status: "pending" }, 200);
      }
      if (String(url) === "/api/friends" || String(url).indexOf("/api/friends?") === 0) {
        return json({
          ok: true,
          friends: [{ username: "river_day" }],
          incoming: [{ username: "casey" }, { username: "solo_name" }],
          outgoing: [{ username: "quinn_q" }]
        }, 200);
      }
      return json({ ok: true }, 200);
    });
    const screen = app.buildFriendsScreen();
    await app.loadFriends();
    const html = textOf(screen);
    const listCall = calls.filter(call => call.url.indexOf("/api/friends") !== -1 && call.method === "GET")[0];
    check("signed-in friends tab loads requests and friends",
      !!listCall && listCall.headers.Authorization === "Bearer tok-1" &&
      html.indexOf("Add a friend") !== -1 &&
      html.indexOf("Requests (2)") !== -1 &&
      html.indexOf(">Accept<") !== -1 &&
      html.indexOf(">Decline<") !== -1 &&
      html.indexOf(">Cancel<") !== -1 &&
      html.indexOf(">Unfriend<") !== -1 &&
      html.indexOf(">Block<") !== -1 &&
      html.indexOf(">Report<") !== -1 &&
      html.indexOf("@river_day") !== -1 &&
      html.indexOf("@casey") !== -1 &&
      html.indexOf("@quinn_q") !== -1 &&
      html.indexOf("Emma") === -1,
      html.slice(0, 500));
    check("the badge count is the incoming requests", app.friendsBadgeCount() === 2);

    const sent = await app.submitFriendRequest("@River_Day");
    const post = calls.filter(call => call.method === "POST" && call.url.indexOf("/api/friends/requests") !== -1)[0];
    check("add sends the exact username and nothing else",
      sent.ok === true && sent.status === "pending" &&
      post && Object.keys(JSON.parse(post.body)).join(",") === "username" &&
      JSON.parse(post.body).username === "River_Day");
    const missing = await app.submitFriendRequest("nobody_zz");
    check("a missing username is shown as no such user",
      missing.ok === false && missing.error === NOT_FOUND_MESSAGE &&
      app.friendResultMessage(missing) === NOT_FOUND_MESSAGE);
    const friendsNow = await app.submitFriendRequest("casey");
    check("an accepted request says you're friends",
      friendsNow.ok === true && app.friendResultMessage(friendsNow) === "You're now friends.");
    const limited = await app.submitFriendRequest("rate_me");
    check("the client shows the 429 copy",
      limited.ok === false && limited.error === LIMIT_MESSAGES.friendRequests &&
      app.friendResultMessage(limited) === LIMIT_MESSAGES.friendRequests);
  });

  return { pass: pass, fail: fail };
}

module.exports = main();
