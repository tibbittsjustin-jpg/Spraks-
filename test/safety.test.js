/* Block, report, shared-list rules, and the §6.4 limits.
   Supabase auth.getUser and Postgres are faked. No database and no network. */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const express = require("express");
const { loadApp } = require("./harness");
const { createSafetyRouter } = require("../routes/safety");
const {
  SQL,
  REASONS,
  isBlockedEitherWay,
  memberShownAs,
  starCountsForViewer,
  additionsCollapsedForViewer,
  deleteAccountSafety
} = require("../lib/safety");
const {
  SAFETY_LIMITS,
  LIMIT_MESSAGES,
  safetyLimitKey,
  createSafetyLimiters
} = require("../lib/safety-limits");

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
const LIST_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LIST_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LIST_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ITEM_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const KEY = "spark_state_v1";

function same(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}
function pair(left, right) {
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
    blocks: [],
    friendships: [],
    lists: [
      { id: LIST_A, owner_id: USER_A, name: "Ada's hike", deleted_at: null },
      { id: LIST_B, owner_id: USER_B, name: "River's dinner", deleted_at: null },
      { id: LIST_C, owner_id: USER_C, name: "Casey's list", deleted_at: null }
    ],
    members: [
      { list_id: LIST_A, user_id: USER_A, status: "active" },
      { list_id: LIST_A, user_id: USER_B, status: "invited" },
      { list_id: LIST_B, user_id: USER_B, status: "active" },
      { list_id: LIST_B, user_id: USER_A, status: "active" },
      { list_id: LIST_C, user_id: USER_C, status: "active" },
      { list_id: LIST_C, user_id: USER_A, status: "active" },
      { list_id: LIST_C, user_id: USER_B, status: "active" }
    ],
    favorites: [
      { list_id: LIST_A, user_id: USER_B, item_id: ITEM_A },
      { list_id: LIST_C, user_id: USER_B, item_id: ITEM_A },
      { list_id: LIST_C, user_id: USER_A, item_id: ITEM_A }
    ],
    reports: [],
    queryLog: [],
    activityWrites: 0,
    forceUnique: false,
    released: 0
  };
  let snap = null;
  let reportSeq = 1;
  function snapshot() {
    return JSON.parse(JSON.stringify({
      blocks: state.blocks,
      friendships: state.friendships,
      members: state.members,
      favorites: state.favorites,
      reports: state.reports
    }));
  }
  function restore(saved) {
    if (!saved) return;
    state.blocks = saved.blocks;
    state.friendships = saved.friendships;
    state.members = saved.members;
    state.favorites = saved.favorites;
    state.reports = saved.reports;
  }
  async function query(sql, params) {
    const text = String(sql);
    params = params || [];
    if (text !== "BEGIN" && text !== "COMMIT" && text !== "ROLLBACK") state.queryLog.push(text);
    if (/insert\s+into\s+public\.activity_items/i.test(text)) {
      state.activityWrites++;
      throw new Error("activity write");
    }
    if (text === "BEGIN") { snap = snapshot(); return { rows: [] }; }
    if (text === "COMMIT") { snap = null; return { rows: [] }; }
    if (text === "ROLLBACK") { restore(snap); snap = null; return { rows: [] }; }
    if (text === SQL.selectUserByName) {
      const row = state.users.filter(item => same(item.username, params[0]))[0];
      return { rows: row ? [Object.assign({}, row)] : [] };
    }
    if (text === SQL.selectEither || text === SQL.selectBlock) {
      const rows = state.blocks.filter(item => {
        const forward = String(item.blocker_id) === String(params[0]) && String(item.blocked_id) === String(params[1]);
        if (text === SQL.selectBlock) return forward;
        const back = String(item.blocker_id) === String(params[1]) && String(item.blocked_id) === String(params[0]);
        return forward || back;
      });
      return { rows: rows.slice(0, 1) };
    }
    if (text === SQL.insertBlock) {
      const exists = state.blocks.some(item => String(item.blocker_id) === String(params[0]) && String(item.blocked_id) === String(params[1]));
      if (!exists) {
        state.blocks.push({ blocker_id: params[0], blocked_id: params[1], created_at: "2026-06-01T00:00:00.000Z" });
      }
      return { rows: [] };
    }
    if (text === SQL.deleteBlock) {
      state.blocks = state.blocks.filter(item => !(String(item.blocker_id) === String(params[0]) && String(item.blocked_id) === String(params[1])));
      return { rows: [] };
    }
    if (text === SQL.listBlocks) {
      const rows = state.blocks.filter(item => String(item.blocker_id) === String(params[0])).map(item => {
        const user = state.users.filter(row => String(row.user_id) === String(item.blocked_id))[0];
        return {
          blocked_id: item.blocked_id,
          created_at: item.created_at,
          username: user ? user.username : null
        };
      });
      return { rows: rows };
    }
    if (text === SQL.deleteFriendship) {
      const key = pair(params[0], params[1]);
      state.friendships = state.friendships.filter(item => pair(item.requester_id, item.addressee_id) !== key);
      return { rows: [] };
    }
    if (text === SQL.selectSharedMemberships) {
      const ids = [String(params[0]), String(params[1])];
      const rows = [];
      state.members.forEach(member => {
        if (ids.indexOf(String(member.user_id)) === -1) return;
        if (member.status !== "invited" && member.status !== "active") return;
        const list = state.lists.filter(item => String(item.id) === String(member.list_id))[0];
        if (!list || list.deleted_at) return;
        rows.push({
          list_id: list.id,
          name: list.name,
          owner_id: list.owner_id,
          user_id: member.user_id,
          status: member.status
        });
      });
      return { rows: rows };
    }
    if (text === SQL.updateMemberStatus) {
      state.members.forEach(member => {
        if (String(member.list_id) !== String(params[0]) || String(member.user_id) !== String(params[1])) return;
        if (member.status !== "invited" && member.status !== "active") return;
        member.status = params[2];
        if (params[2] === "left" || params[2] === "removed") {
          state.favorites = state.favorites.filter(star => !(String(star.list_id) === String(params[0]) && String(star.user_id) === String(params[1])));
        }
      });
      return { rows: [] };
    }
    if (text === SQL.selectIdentical) {
      const rows = state.reports.filter(item => {
        return String(item.reporter_id) === String(params[0]) &&
          item.target_type === params[1] &&
          String(item.target_id) === String(params[2]) &&
          item.reason === params[3] &&
          String(item.list_id || "") === String(params[4] || "");
      });
      return { rows: rows.slice(0, 1).map(item => ({ id: item.id })) };
    }
    if (text === SQL.selectListVisible) {
      const list = state.lists.filter(item => String(item.id) === String(params[0]) && !item.deleted_at)[0];
      if (!list) return { rows: [] };
      const owner = String(list.owner_id) === String(params[1]);
      const active = state.members.some(member =>
        String(member.list_id) === String(list.id) &&
        String(member.user_id) === String(params[1]) &&
        member.status === "active");
      return { rows: (owner || active) ? [{ id: list.id }] : [] };
    }
    if (text === SQL.insertReport) {
      if (state.forceUnique) {
        const err = new Error("duplicate");
        err.code = "23505";
        err.constraint = "reports_identical_reporter_uidx";
        throw err;
      }
      const id = "report-" + reportSeq++;
      state.reports.push({
        id: id,
        reporter_id: params[0],
        target_type: params[1],
        target_id: params[2],
        list_id: params[3],
        reason: params[4],
        note: params[5],
        status: "open",
        created_at: "2026-06-01T00:00:00.000Z"
      });
      return { rows: [{ id: id }] };
    }
    if (text === SQL.listReports) {
      return { rows: state.reports.map(item => Object.assign({}, item)) };
    }
    if (text === SQL.deleteBlocksForUser) {
      state.blocks = state.blocks.filter(item => String(item.blocker_id) !== String(params[0]) && String(item.blocked_id) !== String(params[0]));
      return { rows: [] };
    }
    if (text === SQL.nullReportsForUser) {
      state.reports.forEach(item => {
        if (String(item.reporter_id) === String(params[0])) item.reporter_id = null;
      });
      return { rows: [] };
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

function mount(options) {
  options = options || {};
  const db = options.db || memoryDb();
  const auth = options.auth || authFor({ "good-a": USER_A, "good-b": USER_B, "good-c": USER_C, "good-d": USER_D });
  const app = express();
  app.use(express.json());
  app.use("/api", createSafetyRouter({
    db: db,
    isConfigured: () => true,
    auth: auth,
    adminIds: options.adminIds || [USER_C],
    limiters: options.limiters || {
      blocks: options.limitBlocks || allowAll,
      reports: options.limitReports || allowAll
    }
  }));
  return { app: app, db: db };
}

function member(db, listId, userId) {
  return db.state.members.filter(item => String(item.list_id) === String(listId) && String(item.user_id) === String(userId))[0];
}

async function main() {
  await section("migration 013", () => {
    const dir = path.join(__dirname, "..", "db", "migrations");
    const files = fs.readdirSync(dir).filter(name => name.endsWith(".sql")).sort();
    check("013 exists and 011 is still absent",
      files.indexOf("013_safety_reports.sql") !== -1 &&
      files.every(name => name.indexOf("011_") !== 0),
      files.join(","));
    const sql = fs.readFileSync(path.join(dir, "013_safety_reports.sql"), "utf8");
    check("list_item is allowed and the note cap is 500",
      sql.indexOf("'list_item'") !== -1 &&
      /char_length\(note\) <= 500/.test(sql));
    check("identical reports are unique per reporter",
      sql.indexOf("reports_identical_reporter_uidx") !== -1 &&
      sql.indexOf("where reporter_id is not null") !== -1);
    check("RLS stays deny-all, with no policy and no grant",
      /enable row level security/.test(sql) &&
      /revoke all on table public\.reports from public/.test(sql) &&
      /revoke all on table public\.reports from anon/.test(sql) &&
      /revoke all on table public\.reports from authenticated/.test(sql) &&
      /create\s+policy/i.test(sql) === false &&
      /^\s*grant\s+/im.test(sql) === false);
  });

  await section("limits for this phase and later ones", () => {
    check("reports are 20 a day and friend requests stay 30 a day with 100 pending",
      SAFETY_LIMITS.reportsPerDay === 20 &&
      SAFETY_LIMITS.friendRequestsPerDay === 30 &&
      SAFETY_LIMITS.friendRequestsPending === 100);
    check("invites, items, stars, and push match §6.4",
      SAFETY_LIMITS.listInvitesPerDay === 30 &&
      SAFETY_LIMITS.itemsAddedPerDay === 500 &&
      SAFETY_LIMITS.starsPerHour === 300 &&
      SAFETY_LIMITS.pushPerPairPer10Min === 1 &&
      SAFETY_LIMITS.pushPairWindowMs === 10 * 60 * 1000 &&
      SAFETY_LIMITS.pushPerRecipientPerDay === 20 &&
      SAFETY_LIMITS.blocksPerDay === 30);
    let clock = 1_000_000;
    const limiters = createSafetyLimiters({ now: () => clock });
    let friendOk = true;
    for (let i = 0; i < 30; i++) if (limiters.friendRequests("user:a").limited) friendOk = false;
    const friendStop = limiters.friendRequests("user:a");
    check("friend request limiter allows 30 then stops", friendOk && friendStop.limited === true && friendStop.retryAfter > 0);
    let inviteOk = true;
    for (let i = 0; i < 30; i++) if (limiters.listInvites("user:a").limited) inviteOk = false;
    check("list invite limiter allows 30 then stops", inviteOk && limiters.listInvites("user:a").limited === true);
    check("a signed-in key is the user id and a signed-out key is the IP",
      safetyLimitKey({ id: USER_A }, "1.2.3.4") === "user:" + USER_A &&
      safetyLimitKey(null, "1.2.3.4") === "ip:1.2.3.4");
    check("friendly copy is ready for the routes that reuse these limiters",
      LIMIT_MESSAGES.blocks.indexOf("tomorrow") !== -1 &&
      LIMIT_MESSAGES.reports.indexOf("tomorrow") !== -1 &&
      LIMIT_MESSAGES.friendRequests.indexOf("tomorrow") !== -1 &&
      LIMIT_MESSAGES.listInvites.indexOf("tomorrow") !== -1);
  });

  const ctx = mount();
  const server = await listen(ctx.app);
  const port = server.address().port;
  try {
    await section("blocking is silent and ends the friendship", async () => {
      ctx.db.state.friendships.push({
        requester_id: USER_B,
        addressee_id: USER_A,
        status: "pending"
      });
      const denied = await request(port, "POST", "/api/blocks", { username: "river_day" });
      check("signed-out block is 401 and writes nothing",
        denied.status === 401 && ctx.db.state.blocks.length === 0 && ctx.db.state.friendships.length === 1);

      const self = await request(port, "POST", "/api/blocks", { username: "ada" }, bearer("good-a"));
      check("blocking yourself is refused",
        self.status === 400 && self.json && self.json.ok === false && ctx.db.state.blocks.length === 0);

      const missing = await request(port, "POST", "/api/blocks", { username: "nobody_1" }, bearer("good-a"));
      const solo = await request(port, "POST", "/api/blocks", { username: "solo_name" }, bearer("good-a"));
      const soloGone = await request(port, "DELETE", "/api/blocks/solo_name", null, bearer("good-a"));
      check("a missing username and a block with nothing shared answer the same way",
        missing.status === 200 && solo.status === 200 && soloGone.status === 200 &&
        JSON.stringify(missing.json) === JSON.stringify({ ok: true }) &&
        JSON.stringify(solo.json) === JSON.stringify({ ok: true }) &&
        ctx.db.state.blocks.length === 0,
        JSON.stringify(solo.json));
      const quiet = await request(port, "POST", "/api/blocks", { username: "River_Day" }, bearer("good-a"));
      check("a real block stays a plain success, plus a leave prompt when a shared list needs one",
        quiet.status === 200 && quiet.json && quiet.json.ok === true &&
        quiet.json.promptLeave && quiet.json.promptLeave.length === 1,
        JSON.stringify(quiet.json));
      check("the block response does not name the account or say a row was new",
        quiet.text.indexOf(USER_B) === -1 &&
        quiet.text.indexOf("already") === -1 &&
        quiet.text.indexOf("reporter") === -1);
      check("the friendship row is gone, including a request the other person sent",
        ctx.db.state.friendships.length === 0);
      check("one block row exists and no activity item was written",
        ctx.db.state.blocks.length === 1 &&
        ctx.db.state.blocks[0].blocker_id === USER_A &&
        ctx.db.state.blocks[0].blocked_id === USER_B &&
        ctx.db.state.activityWrites === 0);
      check("either direction counts as blocked",
        await isBlockedEitherWay(USER_A, USER_B, ctx.db) === true &&
        await isBlockedEitherWay(USER_B, USER_A, ctx.db) === true &&
        await isBlockedEitherWay(USER_A, USER_A, ctx.db) === false &&
        await isBlockedEitherWay(USER_A, USER_C, ctx.db) === false);

      const again = await request(port, "POST", "/api/blocks", { username: "river_day" }, bearer("good-a"));
      check("blocking again is the same success and does not add a row",
        again.status === 200 && JSON.stringify(again.json) === JSON.stringify(quiet.json) &&
        ctx.db.state.blocks.length === 1 && ctx.db.state.friendships.length === 0);

      const mine = await request(port, "GET", "/api/blocks", null, bearer("good-a"));
      const theirs = await request(port, "GET", "/api/blocks", null, bearer("good-b"));
      check("only the blocker sees the list, and it is usernames only",
        mine.status === 200 && mine.json.blocks.length === 1 &&
        mine.json.blocks[0].username === "river_day" &&
        mine.text.indexOf(USER_B) === -1 &&
        theirs.status === 200 && theirs.json.blocks.length === 0,
        JSON.stringify(theirs.json) + " " + mine.text);

      const notBlocked = await request(port, "DELETE", "/api/blocks/casey", null, bearer("good-a"));
      const unblocked = await request(port, "DELETE", "/api/blocks/river_day", null, bearer("good-a"));
      check("unblocking someone who is not blocked answers the same as a real unblock",
        notBlocked.status === 200 && unblocked.status === 200 &&
        JSON.stringify(notBlocked.json) === JSON.stringify({ ok: true }) &&
        JSON.stringify(unblocked.json) === JSON.stringify({ ok: true }));
      check("unblocking does not bring the friendship back",
        ctx.db.state.blocks.length === 0 &&
        ctx.db.state.friendships.length === 0 &&
        await isBlockedEitherWay(USER_A, USER_B, ctx.db) === false);

      function lookups(log) {
        return log.filter(sql =>
          sql === SQL.selectUserByName ||
          sql === SQL.selectEither ||
          sql === SQL.selectSharedMemberships);
      }
      ctx.db.state.queryLog = [];
      const timedMiss = await request(port, "POST", "/api/blocks", { username: "nobody_zz" }, bearer("good-a"));
      const missLog = ctx.db.state.queryLog.slice();
      ctx.db.state.queryLog = [];
      const timedReal = await request(port, "POST", "/api/blocks", { username: "solo_name" }, bearer("good-a"));
      const realLog = ctx.db.state.queryLog.slice();
      const missLook = lookups(missLog);
      const realLook = lookups(realLog);
      check("a missing username takes the same lookups as one that exists",
        timedMiss.status === 200 && timedReal.status === 200 &&
        JSON.stringify(timedMiss.json) === JSON.stringify({ ok: true }) &&
        missLook.length >= 3 &&
        missLook.join("\n") === realLook.slice(0, missLook.length).join("\n") &&
        missLog.indexOf(SQL.insertBlock) === -1 &&
        realLog.indexOf(SQL.insertBlock) !== -1,
        missLook.length + " vs " + realLook.length);
      ctx.db.state.blocks = ctx.db.state.blocks.filter(item => item.blocked_id !== USER_D);
    });

    await section("shared lists follow the block rules", async () => {
      ctx.db.state.friendships.push({
        requester_id: USER_A,
        addressee_id: USER_B,
        status: "accepted"
      });
      const blocked = await request(port, "POST", "/api/blocks", { username: "river_day" }, bearer("good-a"));
      check("a list neither person owns is returned for the blocker to leave",
        blocked.status === 200 &&
        blocked.json.promptLeave.length === 1 &&
        blocked.json.promptLeave[0].listId === LIST_C &&
        blocked.json.promptLeave[0].name === "Casey's list" &&
        Object.keys(blocked.json.promptLeave[0]).sort().join(",") === "listId,name",
        JSON.stringify(blocked.json));
      check("the blocker owns the list, so the other person is removed",
        member(ctx.db, LIST_A, USER_B).status === "removed" &&
        member(ctx.db, LIST_A, USER_A).status === "active");
      check("the other person owns the list, so the blocker leaves",
        member(ctx.db, LIST_B, USER_A).status === "left" &&
        member(ctx.db, LIST_B, USER_B).status === "active");
      check("neither owns it, so both memberships stay",
        member(ctx.db, LIST_C, USER_A).status === "active" &&
        member(ctx.db, LIST_C, USER_B).status === "active");
      check("removal drops that person's stars and a stayed list keeps them",
        ctx.db.state.favorites.some(star => star.list_id === LIST_A && star.user_id === USER_B) === false &&
        ctx.db.state.favorites.some(star => star.list_id === LIST_C && star.user_id === USER_B) === true &&
        ctx.db.state.favorites.some(star => star.list_id === LIST_C && star.user_id === USER_A) === true);
      check("the blocker sees them as a member, and they still see the blocker",
        memberShownAs(USER_A, USER_B, USER_C, true) === "a member" &&
        memberShownAs(USER_B, USER_A, USER_C, false) === null);
      check("their stars do not count for the blocker and their additions collapse",
        starCountsForViewer(USER_A, USER_B, true) === false &&
        starCountsForViewer(USER_B, USER_A, false) === true &&
        additionsCollapsedForViewer(USER_A, USER_B, true) === true &&
        additionsCollapsedForViewer(USER_B, USER_A, false) === false);
      check("the accepted friendship is deleted too", ctx.db.state.friendships.length === 0);
    });

    await section("reports stay with the reporter and dedupe", async () => {
      const note = "quiet-note-xyz";
      const filed = await request(port, "POST", "/api/reports", {
        targetType: "user",
        username: "river_day",
        reason: "harassment",
        note: "  " + note + "  "
      }, bearer("good-a"));
      check("a user report is accepted and the response hides the reporter",
        filed.status === 200 && filed.json && filed.json.ok === true &&
        filed.text.indexOf(USER_A) === -1 && filed.text.indexOf("reporter") === -1,
        filed.text);
      check("the row keeps the reporter, the user, and the trimmed note",
        ctx.db.state.reports.length === 1 &&
        ctx.db.state.reports[0].reporter_id === USER_A &&
        ctx.db.state.reports[0].target_type === "user" &&
        ctx.db.state.reports[0].target_id === USER_B &&
        ctx.db.state.reports[0].list_id == null &&
        ctx.db.state.reports[0].note === note);

      const repeat = await request(port, "POST", "/api/reports", {
        targetType: "user",
        username: "river_day",
        reason: "harassment",
        note: note
      }, bearer("good-a"));
      check("the same report again does not add a row and looks the same",
        repeat.status === 200 && JSON.stringify(repeat.json) === JSON.stringify({ ok: true }) &&
        ctx.db.state.reports.length === 1);

      const otherNote = await request(port, "POST", "/api/reports", {
        targetType: "user",
        username: "river_day",
        reason: "harassment",
        note: note + " more"
      }, bearer("good-a"));
      check("a different note is still the same report",
        otherNote.status === 200 && JSON.stringify(otherNote.json) === JSON.stringify({ ok: true }) &&
        ctx.db.state.reports.length === 1 &&
        ctx.db.state.reports[0].note === note);

      const longNote = "x".repeat(501);
      const tooLong = await request(port, "POST", "/api/reports", {
        targetType: "user",
        username: "river_day",
        reason: "other",
        note: longNote
      }, bearer("good-a"));
      check("a note over 500 characters is refused",
        tooLong.status === 400 && tooLong.json && tooLong.json.error === "note" &&
        ctx.db.state.reports.length === 1);
      const maxNote = await request(port, "POST", "/api/reports", {
        targetType: "user",
        username: "river_day",
        reason: "other",
        note: "y".repeat(500)
      }, bearer("good-a"));
      check("a 500 character note is kept",
        maxNote.status === 200 && ctx.db.state.reports.some(item => item.note && item.note.length === 500));

      const badReason = await request(port, "POST", "/api/reports", {
        targetType: "user",
        username: "river_day",
        reason: "bored"
      }, bearer("good-a"));
      check("an unknown reason is refused", badReason.status === 400 && badReason.json.ok === false);

      const invite = await request(port, "POST", "/api/reports", {
        targetType: "list_invite",
        targetId: USER_B,
        listId: LIST_C,
        reason: "spam"
      }, bearer("good-a"));
      const inviteRow = ctx.db.state.reports.filter(item => item.target_type === "list_invite")[0];
      check("a list invite stores the invited user and the list",
        invite.status === 200 && inviteRow &&
        inviteRow.target_id === USER_B && inviteRow.list_id === LIST_C &&
        invite.text.indexOf(USER_A) === -1);

      const item = await request(port, "POST", "/api/reports", {
        targetType: "list_item",
        targetId: ITEM_A,
        listId: LIST_C,
        reason: "spam"
      }, bearer("good-a"));
      const itemRow = ctx.db.state.reports.filter(row => row.target_type === "list_item")[0];
      check("a list item stores the item and the list",
        item.status === 200 && itemRow && itemRow.target_id === ITEM_A && itemRow.list_id === LIST_C);

      const listOnly = await request(port, "POST", "/api/reports", {
        targetType: "list",
        targetId: LIST_C,
        reason: "inappropriate_username"
      }, bearer("good-a"));
      const listRow = ctx.db.state.reports.filter(row => row.target_type === "list")[0];
      check("a list report can omit list id and still keeps the list",
        listOnly.status === 200 && listRow && listRow.target_id === LIST_C && listRow.list_id === LIST_C);

      const beforeHidden = ctx.db.state.reports.length;
      const hiddenList = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
      const invited = await request(port, "POST", "/api/reports", {
        targetType: "list",
        targetId: LIST_A,
        reason: "spam"
      }, bearer("good-b"));
      const outsider = await request(port, "POST", "/api/reports", {
        targetType: "list",
        targetId: LIST_A,
        reason: "spam"
      }, bearer("good-d"));
      const missingList = await request(port, "POST", "/api/reports", {
        targetType: "list",
        targetId: hiddenList,
        reason: "spam"
      }, bearer("good-a"));
      const hiddenItem = await request(port, "POST", "/api/reports", {
        targetType: "list_item",
        targetId: ITEM_A,
        listId: LIST_A,
        reason: "spam"
      }, bearer("good-d"));
      check("a list you only have an invite for is not reportable",
        invited.status === 200 && JSON.stringify(invited.json) === JSON.stringify({ ok: true }));
      check("an unseen list or item answers like a missing list and stores nothing",
        outsider.status === 200 && missingList.status === 200 && hiddenItem.status === 200 &&
        JSON.stringify(outsider.json) === JSON.stringify(missingList.json) &&
        JSON.stringify(hiddenItem.json) === JSON.stringify({ ok: true }) &&
        ctx.db.state.reports.length === beforeHidden &&
        ctx.db.state.reports.every(row => String(row.list_id) !== String(LIST_A) || row.target_type === "list_invite"),
        JSON.stringify(outsider.json) + " rows " + ctx.db.state.reports.length);

      const missingItemList = await request(port, "POST", "/api/reports", {
        targetType: "list_item",
        targetId: ITEM_A,
        reason: "spam"
      }, bearer("good-a"));
      check("a list item without its list is refused", missingItemList.status === 400);

      REASONS.forEach(reason => {
        check("reason " + reason + " is one of the six", [
          "spam", "harassment", "impersonation", "inappropriate_username", "under_18", "other"
        ].indexOf(reason) !== -1);
      });

      const before = ctx.db.state.reports.length;
      ctx.db.state.forceUnique = true;
      const raced = await request(port, "POST", "/api/reports", {
        targetType: "user",
        username: "casey",
        reason: "under_18",
        note: "race"
      }, bearer("good-a"));
      ctx.db.state.forceUnique = false;
      check("a unique collision still answers ok and does not add a second row",
        raced.status === 200 && raced.json.ok === true && ctx.db.state.reports.length === before);

      const friendshipsBefore = ctx.db.state.friendships.length;
      ctx.db.state.friendships.push({
        requester_id: USER_B,
        addressee_id: USER_A,
        status: "pending"
      });
      const withBlock = await request(port, "POST", "/api/reports", {
        targetType: "user",
        username: "river_day",
        reason: "impersonation",
        note: "also",
        alsoBlock: true
      }, bearer("good-a"));
      check("reporting a user can also block, and the response still hides the reporter",
        withBlock.status === 200 && withBlock.json.ok === true &&
        withBlock.text.indexOf(USER_A) === -1 &&
        ctx.db.state.blocks.some(item => item.blocker_id === USER_A && item.blocked_id === USER_B) &&
        ctx.db.state.friendships.length === friendshipsBefore);

      const targetRead = await request(port, "GET", "/api/admin/reports", null, bearer("good-b"));
      check("the reported person cannot read the queue",
        targetRead.status === 403 && targetRead.json && targetRead.json.error === "forbidden" &&
        targetRead.text.indexOf(note) === -1 && targetRead.text.indexOf(USER_A) === -1);

      const adminRead = await request(port, "GET", "/api/admin/reports", null, bearer("good-c"));
      check("an allowed admin can read reports, including who filed them",
        adminRead.status === 200 && adminRead.json.reports.some(item => item.reporterId === USER_A && item.note === note),
        JSON.stringify(adminRead.json && adminRead.json.reports && adminRead.json.reports[0]));

      const stranger = await request(port, "GET", "/api/reports", null, bearer("good-b"));
      check("there is no public report list", stranger.status === 404);
    });

    await section("account deletion removes blocks and keeps the report", async () => {
      const before = ctx.db.state.reports.length;
      await deleteAccountSafety(ctx.db, USER_A);
      check("blocks involving the account are gone",
        ctx.db.state.blocks.every(item => item.blocker_id !== USER_A && item.blocked_id !== USER_A));
      check("report rows stay and the reporter is cleared",
        ctx.db.state.reports.length === before &&
        ctx.db.state.reports.every(item => item.reporter_id == null) &&
        ctx.db.state.reports.some(item => item.note === "quiet-note-xyz"));
    });
  } finally {
    await close(server);
  }

  await section("429 uses the friendly copy", async () => {
    const { createWindowLimiter } = require("../lib/rate-limit");
    const blocks = createWindowLimiter({ limit: 1, windowMs: 60 * 1000 });
    const reports = createWindowLimiter({ limit: 1, windowMs: 60 * 1000 });
    const limited = mount({
      limiters: {
        blocks: blocks.check,
        reports: reports.check
      }
    });
    const limitedServer = await listen(limited.app);
    const limitedPort = limitedServer.address().port;
    try {
      const first = await request(limitedPort, "POST", "/api/blocks", { username: "ab" });
      const second = await request(limitedPort, "POST", "/api/blocks", { username: "ab" });
      check("a signed-out block is limited by IP after the window fills",
        first.status === 401 && second.status === 429 &&
        second.json && second.json.error === "rate_limited" &&
        second.json.message === LIMIT_MESSAGES.blocks &&
        Number(second.headers["retry-after"]) > 0,
        second.status + " " + second.text);

      const userOne = await request(limitedPort, "POST", "/api/blocks", { username: "river_day" }, bearer("good-a"));
      const userAgain = await request(limitedPort, "POST", "/api/blocks", { username: "river_day" }, bearer("good-a"));
      check("a signed-in block returns 429 with the block copy",
        userOne.status === 200 && userAgain.status === 429 && userAgain.json.message === LIMIT_MESSAGES.blocks,
        userAgain.status + " " + userAgain.text);
      const other = await request(limitedPort, "POST", "/api/blocks", { username: "ada" }, bearer("good-b"));
      check("someone else's block budget is separate", other.status !== 429, String(other.status));

      const reportOk = await request(limitedPort, "POST", "/api/reports", {
        targetType: "user",
        username: "ada",
        reason: "spam"
      }, bearer("good-b"));
      const reportLimited = await request(limitedPort, "POST", "/api/reports", {
        targetType: "user",
        username: "ada",
        reason: "spam"
      }, bearer("good-b"));
      check("reports return 429 with the report copy",
        reportOk.status === 200 && reportLimited.status === 429 &&
        reportLimited.json.message === LIMIT_MESSAGES.reports,
        reportLimited.status + " " + reportLimited.text);
    } finally {
      await close(limitedServer);
    }
  });

  await section("the app server mounts the routes", async () => {
    const app = require("../server");
    const httpServer = await listen(app);
    const mountedPort = httpServer.address().port;
    try {
      const blocks = await request(mountedPort, "POST", "/api/blocks", { username: "river_day" });
      const reports = await request(mountedPort, "POST", "/api/reports", { targetType: "user", username: "river_day", reason: "spam" });
      const list = await request(mountedPort, "GET", "/api/blocks");
      const admin = await request(mountedPort, "GET", "/api/admin/reports");
      check("the app requires a signed-in user for blocks, reports, and the queue",
        blocks.status === 401 && reports.status === 401 && list.status === 401 && admin.status === 401,
        [blocks.status, reports.status, list.status, admin.status].join(","));
    } finally {
      await close(httpServer);
    }
  });

  await section("signed-out screens stay the same", async () => {
    const storage = {};
    storage[KEY] = JSON.stringify({
      onboarded: true,
      profile: { name: "Ada", gender: "Woman", ageConfirmedAt: "2026-01-02T00:00:00.000Z" },
      identity: { localId: "loc_keep", username: "ada", userId: null }
    });
    const app = loadApp(storage);
    const before = app.fetchCalls.length;
    app.renderProfileHeader();
    const panel = app.buildBlockedPeoplePanel();
    const card = app.buildSwipeCard({
      id: 2,
      title: "Walk",
      category: "Picnics & Parks",
      photo: { url: "https://example.com/ridge.jpg", credit: "Photo by @river_day" }
    }, true, 0);
    check("signed-out profile has no blocked-people row", app.blockedPeopleButtonHtml() === "");
    check("signed-out safety menu is absent",
      app.buildUsernameSafetyMenu("river_day") == null && app.openUsernameSafety("river_day") === false);
    check("signed-out blocked list does not fetch",
      app.fetchCalls.length === before &&
      panel.innerHTML.indexOf("/api/blocks") === -1);
    check("a credit line does not grow a safety button while signed out",
      card.innerHTML.indexOf("data-safety-open") === -1 &&
      card.innerHTML.indexOf("Photo by @river_day") !== -1,
      card.innerHTML.slice(0, 400));
  });

  await section("signed-in menus and the blocked list", async () => {
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
      calls.push({
        url: String(url),
        method: opts.method || "GET",
        headers: opts.headers || {},
        body: opts.body || ""
      });
      if (String(url).indexOf("/api/blocks") !== -1 && (opts.method || "GET") === "GET") {
        return json({ ok: true, blocks: [{ username: "river_day" }] }, 200);
      }
      if (opts.method === "DELETE") return json({ ok: true }, 200);
      const sent = opts.body ? JSON.parse(opts.body) : {};
      if (sent.username === "rate_limited_name") {
        return json({ ok: false, error: "rate_limited", message: LIMIT_MESSAGES.blocks }, 429);
      }
      return json({ ok: true }, 200);
    });

    const before = calls.length;
    app.renderProfileHeader();
    check("opening the profile while signed in does not fetch blocks",
      calls.length === before && app.blockedPeopleButtonHtml().indexOf("Blocked people") !== -1 &&
      app.blockedPeopleButtonHtml().indexOf("They are not told") !== -1);

    const own = app.buildUsernameSafetyMenu("ada");
    const menu = app.buildUsernameSafetyMenu("river_day");
    check("your own username has no block or report menu", own == null);
    check("someone else's username has Block and Report",
      menu && menu.innerHTML.indexOf(">Block<") !== -1 && menu.innerHTML.indexOf(">Report<") !== -1);

    const plain = app.buildSwipeCard({
      id: 2,
      title: "Walk",
      category: "Picnics & Parks",
      photo: { url: "https://example.com/ridge.jpg", credit: "Photo: Eric Ward" }
    }, true, 0);
    const credited = app.buildSwipeCard({
      id: 3,
      title: "Walk",
      category: "Picnics & Parks",
      photo: { url: "https://example.com/ridge.jpg", credit: "Photo by @river_day" }
    }, true, 0);
    check("an ordinary credit line is unchanged",
      plain.innerHTML.indexOf("data-safety-open") === -1 && plain.innerHTML.indexOf("Photo: Eric Ward") !== -1);
    check("a credit line with a username offers Safety",
      credited.innerHTML.indexOf("Photo by @river_day") !== -1 &&
      credited.innerHTML.indexOf('data-username="river_day"') !== -1);

    check("the menu opens only for someone else", app.openUsernameSafety("river_day") === true && app.openUsernameSafety("ada") === false);
    const sheet = app.buildSafetyMenuPanel();
    const sheetText = sheet.children.map(child => child.innerHTML || child.className || "").join("\n");
    check("the safety menu is calm about who is told",
      sheetText.indexOf("@river_day") !== -1 && sheetText.indexOf("They won't be told who did this.") !== -1 &&
      sheetText.indexOf(">Block<") !== -1 && sheetText.indexOf(">Report<") !== -1);

    const blockSheet = app.buildBlockPanel();
    const blockText = blockSheet.children.map(child => child.innerHTML || "").join("\n");
    check("the block sheet tells you they won't be told",
      blockText.indexOf("Block @river_day?") !== -1 && blockText.indexOf("They won't be told.") !== -1);

    const reportSheet = app.buildReportPanel();
    const reportText = reportSheet.children.map(child => (child.innerHTML || "") + (child.className || "")).join("\n");
    const form = reportSheet.children.filter(child => child.className === "safety-form")[0];
    check("the report sheet offers every reason and also block",
      !!form &&
      reportText.indexOf("not told it was you") !== -1 &&
      form.innerHTML.indexOf("value=\"spam\"") !== -1 &&
      form.innerHTML.indexOf("value=\"harassment\"") !== -1 &&
      form.innerHTML.indexOf("value=\"impersonation\"") !== -1 &&
      form.innerHTML.indexOf("value=\"inappropriate_username\"") !== -1 &&
      form.innerHTML.indexOf("value=\"under_18\"") !== -1 &&
      form.innerHTML.indexOf("value=\"other\"") !== -1 &&
      form.innerHTML.indexOf("Also block @river_day") !== -1 &&
      form.innerHTML.indexOf("maxlength=\"500\"") !== -1);

    const list = app.buildBlockedPeoplePanel();
    await new Promise(resolve => setTimeout(resolve, 0));
    const listNode = list.children.filter(child => child.className === "blocked-list")[0];
    const listCall = calls.filter(call => call.url.indexOf("/api/blocks") !== -1 && call.method === "GET")[0];
    check("the blocked list loads with the token and shows Unblock",
      !!listCall && listCall.headers.Authorization === "Bearer tok-1" &&
      listNode && listNode.innerHTML.indexOf("@river_day") !== -1 &&
      listNode.innerHTML.indexOf(">Unblock<") !== -1 &&
      listNode.innerHTML.indexOf(">Safety<") !== -1,
      listNode && listNode.innerHTML);

    const blocked = await app.submitBlock("river_day");
    const blockCall = calls.filter(call => call.method === "POST" && call.url.indexOf("/api/blocks") !== -1)[0];
    check("block sends only the username",
      blocked.ok === true && blockCall &&
      Object.keys(JSON.parse(blockCall.body)).join(",") === "username" &&
      JSON.parse(blockCall.body).username === "river_day");

    const reported = await app.submitReport({
      targetType: "user",
      username: "river_day",
      reason: "spam",
      note: "hello",
      alsoBlock: true
    });
    const reportCall = calls.filter(call => call.url.indexOf("/api/reports") !== -1)[0];
    const reportBody = reportCall ? JSON.parse(reportCall.body) : {};
    check("report sends the reason, the note, and also block",
      reported.ok === true &&
      reportBody.targetType === "user" &&
      reportBody.username === "river_day" &&
      reportBody.reason === "spam" &&
      reportBody.note === "hello" &&
      reportBody.alsoBlock === true &&
      reportBody.reporterId == null);

    const unblocked = await app.submitUnblock("river_day");
    check("unblock calls delete for that username",
      unblocked.ok === true &&
      calls.some(call => call.method === "DELETE" && call.url.indexOf("/api/blocks/river_day") !== -1));

    const limited = await app.submitBlock("rate_limited_name");
    check("the client shows the 429 copy",
      limited.ok === false && limited.error === LIMIT_MESSAGES.blocks);
  });

  return { pass: pass, fail: fail };
}

module.exports = main();
