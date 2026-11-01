/* Exact-username friends. One friendships row per unordered pair.
   The tables stay deny-all. This process uses DATABASE_URL.
   A block in either direction answers like a missing username. */
"use strict";

const { validateUsername } = require("../public/util");
const { isBlockedEitherWay } = require("./safety");
const { SAFETY_LIMITS, LIMIT_MESSAGES } = require("./safety-limits");

const NIL_USER = "00000000-0000-0000-0000-000000000000";
const NOT_FOUND_MESSAGE = "No one has that username.";

const SQL = {
  selectUserByName: "select user_id, username from public.usernames where username = $1",
  lockUser: "select pg_advisory_xact_lock(10040, hashtext($1::text))",
  selectFriendship: "select requester_id, addressee_id, status from public.friendships where (requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1) limit 1",
  countPending: "select count(*)::int as n from public.friendships where requester_id = $1 and status = 'pending'",
  insertPending: "insert into public.friendships (requester_id, addressee_id, status) values ($1, $2, 'pending')",
  acceptIncoming: "update public.friendships set status = 'accepted', responded_at = now() where requester_id = $2 and addressee_id = $1 and status = 'pending'",
  declineIncoming: "update public.friendships set status = 'declined', responded_at = now() where requester_id = $2 and addressee_id = $1 and status = 'pending'",
  cancelOutgoing: "delete from public.friendships where requester_id = $1 and addressee_id = $2 and status = 'pending'",
  reopen: "update public.friendships set requester_id = $1, addressee_id = $2, status = 'pending', created_at = now(), responded_at = null where (requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1)",
  unfriend: "delete from public.friendships where status = 'accepted' and ((requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1))",
  listMine: "select f.requester_id, f.addressee_id, f.status, u.username from public.friendships f join public.usernames u on u.user_id = case when f.requester_id = $1 then f.addressee_id else f.requester_id end where (f.requester_id = $1 or f.addressee_id = $1) and f.status in ('pending', 'accepted') order by u.username asc",
  listBlockIds: "select blocker_id, blocked_id from public.blocks where blocker_id = $1 or blocked_id = $1",
  deleteForUser: "delete from public.friendships where requester_id = $1 or addressee_id = $1"
};

function unavailable() {
  const err = new Error("unavailable");
  err.code = "unavailable";
  return err;
}

function sameId(a, b) {
  return String(a || "") === String(b || "");
}

function notFound() {
  return { ok: false, error: "not_found", message: NOT_FOUND_MESSAGE };
}

function invalid(message) {
  return { ok: false, error: "invalid", message: message || "Check that and try again." };
}

function isUniqueViolation(err) {
  return !!(err && (err.code === "23505" || err.constraint === "friendships_pair_uidx"));
}

async function withTx(db, fn) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    if (result && result.ok === false) {
      await client.query("ROLLBACK");
      return result;
    }
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (rollbackErr) { /* already closed */ }
    throw err;
  } finally {
    client.release();
  }
}

async function findUser(db, username) {
  const result = await db.query(SQL.selectUserByName, [username]);
  return result.rows && result.rows[0] ? result.rows[0] : null;
}

async function lockPair(client, a, b) {
  const ids = [String(a), String(b)].sort();
  await client.query(SQL.lockUser, [ids[0]]);
  if (ids[0] !== ids[1]) await client.query(SQL.lockUser, [ids[1]]);
}

/* Same reads when the name is missing and when a block hides it. */
async function lookupTarget(client, userId, username) {
  const target = await findUser(client, username);
  const otherId = target ? String(target.user_id) : NIL_USER;
  await lockPair(client, userId, otherId);
  const blocked = await isBlockedEitherWay(String(userId), otherId, client);
  const found = await client.query(SQL.selectFriendship, [String(userId), otherId]);
  const row = found.rows && found.rows[0] ? found.rows[0] : null;
  return { target: target, otherId: otherId, blocked: blocked, row: row };
}

function hidden(found, userId) {
  if (!found.target || found.blocked) return true;
  return false;
}

async function pendingRoom(client, userId) {
  const count = await client.query(SQL.countPending, [String(userId)]);
  const n = count.rows && count.rows[0] ? Number(count.rows[0].n) : 0;
  if (n >= SAFETY_LIMITS.friendRequestsPending) {
    return { ok: false, error: "rate_limited", message: LIMIT_MESSAGES.friendRequestsPending };
  }
  return null;
}

async function sendFriendRequest(db, userId, rawUsername) {
  const format = validateUsername(rawUsername == null ? "" : String(rawUsername));
  if (!format.ok) return { ok: false, error: format.error, message: format.message };
  if (!db || typeof db.connect !== "function") throw unavailable();
  return withTx(db, async client => {
    const found = await lookupTarget(client, userId, format.username);
    if (hidden(found, userId)) return notFound();
    if (sameId(found.target.user_id, userId)) {
      return { ok: false, error: "self", message: "You can't add yourself." };
    }
    const row = found.row;
    if (row && row.status === "accepted") {
      return { ok: false, error: "duplicate", message: "You're already friends." };
    }
    if (row && row.status === "pending" && sameId(row.requester_id, userId)) {
      return { ok: false, error: "duplicate", message: "You already sent a request to that username." };
    }
    if (row && row.status === "pending" && sameId(row.addressee_id, userId)) {
      const accepted = await client.query(SQL.acceptIncoming, [String(userId), found.otherId]);
      if (!accepted || !accepted.rowCount) return { ok: false, error: "not_found", message: "That request isn't there." };
      return { ok: true, status: "accepted" };
    }
    const room = await pendingRoom(client, userId);
    if (room) return room;
    if (row && row.status === "declined") {
      const reopened = await client.query(SQL.reopen, [String(userId), found.otherId]);
      if (!reopened || !reopened.rowCount) {
        return { ok: false, error: "duplicate", message: "You already sent a request to that username." };
      }
      return { ok: true, status: "pending" };
    }
    try {
      await client.query(SQL.insertPending, [String(userId), found.otherId]);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return { ok: false, error: "duplicate", message: "You already sent a request to that username." };
      }
      throw err;
    }
    return { ok: true, status: "pending" };
  });
}

async function changeFriend(db, userId, rawUsername, action) {
  const format = validateUsername(rawUsername == null ? "" : String(rawUsername));
  if (!format.ok) return { ok: false, error: format.error, message: format.message };
  if (!db || typeof db.connect !== "function") throw unavailable();
  return withTx(db, async client => {
    const found = await lookupTarget(client, userId, format.username);
    if (hidden(found, userId)) return notFound();
    if (sameId(found.target.user_id, userId)) {
      return { ok: false, error: "self", message: "You can't add yourself." };
    }
    let result = null;
    if (action === "accept") result = await client.query(SQL.acceptIncoming, [String(userId), found.otherId]);
    else if (action === "decline") result = await client.query(SQL.declineIncoming, [String(userId), found.otherId]);
    else if (action === "cancel") result = await client.query(SQL.cancelOutgoing, [String(userId), found.otherId]);
    else if (action === "unfriend") result = await client.query(SQL.unfriend, [String(userId), found.otherId]);
    else return invalid("Check that and try again.");
    if (!result || !result.rowCount) {
      if (action === "unfriend") {
        return { ok: false, error: "not_found", message: "You're not friends with that username." };
      }
      return { ok: false, error: "not_found", message: "That request isn't there." };
    }
    if (action === "accept") return { ok: true, status: "accepted" };
    if (action === "unfriend") return { ok: true, status: "removed" };
    return { ok: true, status: action };
  });
}

function blockedSet(rows, userId) {
  const blocked = new Set();
  (rows || []).forEach(row => {
    if (!row) return;
    const other = sameId(row.blocker_id, userId) ? row.blocked_id : row.blocker_id;
    if (other) blocked.add(String(other));
  });
  return blocked;
}

function pushName(list, username) {
  const name = String(username || "").toLowerCase();
  if (!name) return;
  if (list.some(item => item.username === name)) return;
  list.push({ username: name });
}

async function listFriends(db, userId) {
  if (!db || typeof db.query !== "function") throw unavailable();
  const rel = await db.query(SQL.listMine, [String(userId)]);
  const blocks = await db.query(SQL.listBlockIds, [String(userId)]);
  const blocked = blockedSet(blocks.rows, userId);
  const friends = [];
  const incoming = [];
  const outgoing = [];
  (rel.rows || []).forEach(row => {
    if (!row || !row.username) return;
    if (!sameId(row.requester_id, userId) && !sameId(row.addressee_id, userId)) return;
    const other = sameId(row.requester_id, userId) ? row.addressee_id : row.requester_id;
    if (!other || blocked.has(String(other)) || sameId(other, userId)) return;
    if (row.status === "accepted") pushName(friends, row.username);
    else if (row.status === "pending" && sameId(row.addressee_id, userId)) pushName(incoming, row.username);
    else if (row.status === "pending" && sameId(row.requester_id, userId)) pushName(outgoing, row.username);
  });
  friends.sort((a, b) => a.username.localeCompare(b.username));
  incoming.sort((a, b) => a.username.localeCompare(b.username));
  outgoing.sort((a, b) => a.username.localeCompare(b.username));
  return { ok: true, friends: friends, incoming: incoming, outgoing: outgoing };
}

async function deleteAccountFriends(db, userId) {
  if (!db || typeof db.query !== "function") throw unavailable();
  await db.query(SQL.deleteForUser, [String(userId)]);
  return { ok: true };
}

module.exports = {
  SQL,
  NIL_USER,
  NOT_FOUND_MESSAGE,
  sendFriendRequest,
  changeFriend,
  listFriends,
  deleteAccountFriends
};
