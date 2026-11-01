/* Server username rules. Character shape comes from SparkUtil.validateUsername
   so the signed-in client and this process share one format check.
   Reserved names live on that same helper. Profanity is lib/profanity.js.
   Taken, held, and the 30-day clock are decided here, against Postgres. */
"use strict";

const { validateUsername, reservedUsername } = require("../public/util");
const { containsProfanity } = require("./profanity");

const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

const SQL = {
  lockUser: "select pg_advisory_xact_lock(10013, hashtext($1::text))",
  lockName: "select pg_advisory_xact_lock(10012, hashtext($1::text))",
  selectMine: "select username, changed_at from public.usernames where user_id = $1 for update",
  selectHold: "select user_id, held_until from public.username_holds where username = $1 for update",
  selectLive: "select user_id from public.usernames where username = $1 for update",
  upsertHold: "insert into public.username_holds (username, user_id, held_until) values ($1, $2, $3) on conflict (username) do update set user_id = excluded.user_id, held_until = excluded.held_until",
  insertName: "insert into public.usernames (user_id, username, changed_at) values ($1, $2, $3)",
  updateName: "update public.usernames set username = $2, changed_at = $3 where user_id = $1",
  deleteHold: "delete from public.username_holds where username = $1",
  checkLive: "select user_id from public.usernames where username = $1",
  checkHold: "select user_id, held_until from public.username_holds where username = $1",
  selectMe: "select username, changed_at from public.usernames where user_id = $1"
};

const TAKEN_MESSAGE = "That username is taken.";
const RESERVED_MESSAGE = "That username is reserved.";
const PROFANITY_MESSAGE = "Choose a different username.";

function utcDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function cooldownMessage(next) {
  return "You can change your username again on " + utcDay(next) + ".";
}

function heldMessage(until) {
  return "That username is held until " + utcDay(until) + ".";
}

function sameName(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

function classifyUsername(value) {
  const format = validateUsername(value);
  if (!format.ok) {
    return { ok: false, status: "invalid", error: format.error, message: format.message };
  }
  if (reservedUsername(format.username)) {
    return { ok: false, status: "reserved", error: "reserved", message: RESERVED_MESSAGE };
  }
  if (containsProfanity(format.username)) {
    return { ok: false, status: "invalid", error: "profanity", message: PROFANITY_MESSAGE };
  }
  return { ok: true, status: "available", username: format.username };
}

function changeAllowed(changedAt, now) {
  const t = new Date(changedAt).getTime();
  if (!isFinite(t)) return true;
  return now.getTime() >= t + COOLDOWN_MS;
}

function nextChangeAt(changedAt) {
  const t = new Date(changedAt).getTime();
  if (!isFinite(t)) return null;
  return new Date(t + COOLDOWN_MS);
}

function holdBlocks(row, userId, now) {
  if (!row) return false;
  const until = new Date(row.held_until).getTime();
  if (!isFinite(until) || until <= now.getTime()) return false;
  if (userId && row.user_id && String(row.user_id) === String(userId)) return false;
  return true;
}

function unavailable() {
  const err = new Error("unavailable");
  err.code = "unavailable";
  return err;
}

async function checkAvailability(db, raw, userId, now) {
  const classified = classifyUsername(raw);
  if (!classified.ok) return classified;
  if (!db) throw unavailable();
  const username = classified.username;
  const at = now || new Date();
  const live = await db.query(SQL.checkLive, [username]);
  const owner = live.rows[0];
  if (owner) {
    if (userId && String(owner.user_id) === String(userId)) {
      return { ok: true, status: "available", username: username };
    }
    return { ok: false, status: "taken", error: "taken", username: username, message: TAKEN_MESSAGE };
  }
  const hold = await db.query(SQL.checkHold, [username]);
  const row = hold.rows[0];
  if (holdBlocks(row, userId, at)) {
    return {
      ok: false,
      status: "held",
      error: "held",
      username: username,
      heldUntil: new Date(row.held_until).toISOString(),
      message: heldMessage(row.held_until)
    };
  }
  return { ok: true, status: "available", username: username };
}

async function currentUsername(db, userId, now) {
  if (!db) throw unavailable();
  const at = now || new Date();
  const mine = await db.query(SQL.selectMe, [userId]);
  const row = mine.rows[0];
  if (!row) return { ok: true, username: null, changedAt: null, nextChangeAt: null };
  const changedAt = new Date(row.changed_at);
  const next = nextChangeAt(changedAt);
  const allowed = changeAllowed(changedAt, at);
  return {
    ok: true,
    username: String(row.username).toLowerCase(),
    changedAt: isFinite(changedAt.getTime()) ? changedAt.toISOString() : null,
    nextChangeAt: allowed || !next ? null : next.toISOString()
  };
}

async function claimInTransaction(client, userId, username, now) {
  await client.query(SQL.lockUser, [String(userId)]);
  const mine = await client.query(SQL.selectMine, [userId]);
  const current = mine.rows[0] || null;
  if (current && sameName(current.username, username)) {
    return { ok: true, username: username, unchanged: true };
  }
  if (current && !changeAllowed(current.changed_at, now)) {
    const next = nextChangeAt(current.changed_at);
    return {
      ok: false,
      status: "cooldown",
      error: "cooldown",
      nextChangeAt: next.toISOString(),
      message: cooldownMessage(next)
    };
  }

  const lockNames = [username];
  if (current && current.username) lockNames.push(String(current.username).toLowerCase());
  lockNames.sort();
  const seen = Object.create(null);
  for (let i = 0; i < lockNames.length; i++) {
    if (seen[lockNames[i]]) continue;
    seen[lockNames[i]] = true;
    await client.query(SQL.lockName, [lockNames[i]]);
  }

  const hold = await client.query(SQL.selectHold, [username]);
  const holdRow = hold.rows[0];
  if (holdBlocks(holdRow, userId, now)) {
    return {
      ok: false,
      status: "held",
      error: "held",
      heldUntil: new Date(holdRow.held_until).toISOString(),
      message: heldMessage(holdRow.held_until)
    };
  }

  const live = await client.query(SQL.selectLive, [username]);
  if (live.rows[0] && String(live.rows[0].user_id) !== String(userId)) {
    return { ok: false, status: "taken", error: "taken", message: TAKEN_MESSAGE };
  }

  if (current) {
    const heldUntil = new Date(now.getTime() + COOLDOWN_MS);
    await client.query(SQL.upsertHold, [String(current.username).toLowerCase(), userId, heldUntil]);
    await client.query(SQL.updateName, [userId, username, now]);
  } else {
    // The first claim is not a change. changed_at sits one window in the
    // past so the next rename is allowed immediately, and that rename
    // starts the 30-day clock.
    const changedAt = new Date(now.getTime() - COOLDOWN_MS);
    await client.query(SQL.insertName, [userId, username, changedAt]);
  }
  await client.query(SQL.deleteHold, [username]);
  return { ok: true, username: username };
}

function isUniqueViolation(err) {
  return !!(err && (err.code === "23505" || err.constraint === "usernames_username_key"));
}

async function claimUsername(db, userId, raw, now) {
  const classified = classifyUsername(raw);
  if (!classified.ok) return classified;
  if (!db || typeof db.connect !== "function") throw unavailable();
  const at = now || new Date();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await claimInTransaction(client, userId, classified.username, at);
    if (!result.ok) {
      await client.query("ROLLBACK");
      return result;
    }
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (rollbackErr) { /* already closed */ }
    if (isUniqueViolation(err)) {
      return { ok: false, status: "taken", error: "taken", message: TAKEN_MESSAGE };
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  COOLDOWN_MS,
  SQL,
  classifyUsername,
  checkAvailability,
  currentUsername,
  claimUsername,
  changeAllowed,
  holdBlocks
};
