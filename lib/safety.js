/* Blocks, reports, and the shared-list rules from the friends plan §6.2.
   The tables stay deny-all. This process uses DATABASE_URL.
   isBlockedEitherWay(a, b) is the check P4 and P7 call before a request
   or an invite. Pass a db as the third argument in tests. */
"use strict";

const { validateUsername } = require("../public/util");

const REASONS = [
  "spam",
  "harassment",
  "impersonation",
  "inappropriate_username",
  "under_18",
  "other"
];
const TARGETS = ["user", "list", "list_item", "list_invite"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE_MAX = 500;

const SQL = {
  selectUserByName: "select user_id, username from public.usernames where username = $1",
  selectEither: "select blocker_id, blocked_id from public.blocks where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1) limit 1",
  selectBlock: "select blocker_id, blocked_id from public.blocks where blocker_id = $1 and blocked_id = $2",
  insertBlock: "insert into public.blocks (blocker_id, blocked_id) values ($1, $2) on conflict (blocker_id, blocked_id) do nothing",
  deleteBlock: "delete from public.blocks where blocker_id = $1 and blocked_id = $2",
  listBlocks: "select b.blocked_id, b.created_at, u.username from public.blocks b join public.usernames u on u.user_id = b.blocked_id where b.blocker_id = $1 order by b.created_at desc, u.username asc",
  deleteFriendship: "delete from public.friendships where (requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1)",
  selectSharedMemberships: "select l.id as list_id, l.name, l.owner_id, m.user_id, m.status from public.list_members m join public.lists l on l.id = m.list_id where l.deleted_at is null and m.status in ('invited', 'active') and m.user_id in ($1, $2)",
  updateMemberStatus: "update public.list_members set status = $3, left_at = now() where list_id = $1 and user_id = $2 and status in ('invited', 'active')",
  selectIdentical: "select id from public.reports where reporter_id = $1 and target_type = $2 and target_id = $3 and reason = $4 and list_id is not distinct from $5 and note is not distinct from $6 limit 1",
  insertReport: "insert into public.reports (reporter_id, target_type, target_id, list_id, reason, note) values ($1, $2, $3, $4, $5, $6) returning id",
  listReports: "select id, reporter_id, target_type, target_id, list_id, reason, note, status, created_at from public.reports order by created_at desc limit 200",
  deleteBlocksForUser: "delete from public.blocks where blocker_id = $1 or blocked_id = $1",
  nullReportsForUser: "update public.reports set reporter_id = null where reporter_id = $1"
};

function unavailable() {
  const err = new Error("unavailable");
  err.code = "unavailable";
  return err;
}

function sameId(a, b) {
  return String(a || "") === String(b || "");
}

function isUniqueViolation(err) {
  return !!(err && (err.code === "23505" || err.constraint === "reports_identical_reporter_uidx"));
}

function defaultDb() {
  return require("../db").getPool();
}

function invalid(message) {
  return { ok: false, error: "invalid", message: message || "Check that and try again." };
}

function publicBody(result) {
  const body = { ok: true };
  if (result && Array.isArray(result.promptLeave) && result.promptLeave.length) {
    body.promptLeave = result.promptLeave;
  }
  return body;
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

/* Either direction. a and b are user ids. */
async function isBlockedEitherWay(a, b, db) {
  if (!a || !b || sameId(a, b)) return false;
  const database = db || defaultDb();
  if (!database) throw unavailable();
  const result = await database.query(SQL.selectEither, [String(a), String(b)]);
  return !!(result.rows && result.rows.length);
}

/* Blocker's view only. The blocked person still sees the real username. */
function memberShownAs(viewerId, memberId, ownerId, viewerBlockedMember) {
  if (!viewerBlockedMember) return null;
  if (sameId(viewerId, memberId)) return null;
  if (sameId(viewerId, ownerId) || sameId(memberId, ownerId)) return null;
  return "a member";
}

function starCountsForViewer(viewerId, starUserId, viewerBlockedMember) {
  if (sameId(viewerId, starUserId)) return true;
  return !viewerBlockedMember;
}

function additionsCollapsedForViewer(viewerId, addedBy, viewerBlockedMember) {
  if (!addedBy || sameId(viewerId, addedBy)) return false;
  return !!viewerBlockedMember;
}

async function applyBlock(client, blockerId, blockedId) {
  await client.query(SQL.insertBlock, [String(blockerId), String(blockedId)]);
  await client.query(SQL.deleteFriendship, [String(blockerId), String(blockedId)]);
  const memberships = await client.query(SQL.selectSharedMemberships, [String(blockerId), String(blockedId)]);
  const byList = new Map();
  (memberships.rows || []).forEach(row => {
    const id = String(row.list_id);
    if (!byList.has(id)) {
      byList.set(id, {
        id: id,
        name: row.name == null ? "" : String(row.name),
        ownerId: String(row.owner_id),
        members: new Set()
      });
    }
    byList.get(id).members.add(String(row.user_id));
  });
  const promptLeave = [];
  for (const list of byList.values()) {
    if (!list.members.has(String(blockerId)) || !list.members.has(String(blockedId))) continue;
    if (sameId(list.ownerId, blockerId)) {
      await client.query(SQL.updateMemberStatus, [list.id, String(blockedId), "removed"]);
    } else if (sameId(list.ownerId, blockedId)) {
      await client.query(SQL.updateMemberStatus, [list.id, String(blockerId), "left"]);
    } else {
      promptLeave.push({ listId: list.id, name: list.name });
    }
  }
  return { promptLeave: promptLeave };
}

async function blockUser(db, blockerId, rawUsername) {
  const format = validateUsername(rawUsername == null ? "" : String(rawUsername));
  if (!format.ok) return invalid("Check the username and try again.");
  if (!db || typeof db.connect !== "function") throw unavailable();
  const target = await findUser(db, format.username);
  if (!target) return { ok: true };
  if (sameId(target.user_id, blockerId)) {
    return { ok: false, error: "self", message: "You can't block your own username." };
  }
  return withTx(db, async client => {
    const applied = await applyBlock(client, blockerId, target.user_id);
    return { ok: true, promptLeave: applied.promptLeave };
  });
}

async function unblockUser(db, blockerId, rawUsername) {
  const format = validateUsername(rawUsername == null ? "" : String(rawUsername));
  if (!format.ok) return invalid("Check the username and try again.");
  if (!db || typeof db.connect !== "function") throw unavailable();
  const target = await findUser(db, format.username);
  if (!target || sameId(target.user_id, blockerId)) return { ok: true };
  return withTx(db, async client => {
    await client.query(SQL.deleteBlock, [String(blockerId), String(target.user_id)]);
    return { ok: true };
  });
}

async function listBlocks(db, blockerId) {
  if (!db) throw unavailable();
  const result = await db.query(SQL.listBlocks, [String(blockerId)]);
  const blocks = [];
  (result.rows || []).forEach(row => {
    if (!row || row.username == null || !String(row.username)) return;
    const item = { username: String(row.username).toLowerCase() };
    if (row.created_at) {
      const at = new Date(row.created_at);
      if (isFinite(at.getTime())) item.blockedAt = at.toISOString();
    }
    blocks.push(item);
  });
  return { ok: true, blocks: blocks };
}

function cleanNote(note) {
  if (note == null || note === "") return null;
  if (typeof note !== "string") return invalid("Check that and try again.");
  const trimmed = note.trim();
  if (!trimmed) return null;
  if (trimmed.length > NOTE_MAX) {
    return { ok: false, error: "note", message: "Keep the note to 500 characters." };
  }
  return trimmed;
}

function parseReport(input) {
  input = input || {};
  const targetType = typeof input.targetType === "string" ? input.targetType : "";
  if (TARGETS.indexOf(targetType) === -1) return invalid("Check that and try again.");
  const reason = typeof input.reason === "string" ? input.reason : "";
  if (REASONS.indexOf(reason) === -1) return invalid("Pick a reason and try again.");
  const note = cleanNote(input.note);
  if (note && typeof note === "object" && note.ok === false) return note;
  const alsoBlock = input.alsoBlock === true && targetType === "user";
  if (targetType === "user") {
    const format = validateUsername(input.username == null ? "" : String(input.username));
    if (!format.ok) return invalid("Check the username and try again.");
    return {
      ok: true,
      targetType: targetType,
      username: format.username,
      reason: reason,
      note: note,
      alsoBlock: alsoBlock
    };
  }
  const targetId = typeof input.targetId === "string" ? input.targetId.trim() : "";
  if (!UUID_RE.test(targetId)) return invalid("Check that and try again.");
  let listId = typeof input.listId === "string" ? input.listId.trim() : "";
  if (targetType === "list") {
    if (!listId) listId = targetId;
    if (!UUID_RE.test(listId)) return invalid("Check that and try again.");
  } else if (!UUID_RE.test(listId)) {
    return invalid("Check that and try again.");
  }
  return {
    ok: true,
    targetType: targetType,
    targetId: targetId,
    listId: listId,
    reason: reason,
    note: note,
    alsoBlock: false
  };
}

async function createReport(db, reporterId, input) {
  const parsed = parseReport(input);
  if (!parsed.ok) return parsed;
  if (!db || typeof db.connect !== "function") throw unavailable();
  let targetId = parsed.targetId || null;
  let listId = parsed.listId || null;
  if (parsed.targetType === "user") {
    const target = await findUser(db, parsed.username);
    if (!target) return { ok: true };
    if (sameId(target.user_id, reporterId)) {
      return { ok: false, error: "self", message: "You can't report your own username." };
    }
    targetId = String(target.user_id);
    listId = null;
  }
  return withTx(db, async client => {
    const existing = await client.query(SQL.selectIdentical, [
      String(reporterId),
      parsed.targetType,
      targetId,
      parsed.reason,
      listId,
      parsed.note
    ]);
    if (!existing.rows || !existing.rows.length) {
      try {
        await client.query(SQL.insertReport, [
          String(reporterId),
          parsed.targetType,
          targetId,
          listId,
          parsed.reason,
          parsed.note
        ]);
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    let promptLeave = [];
    if (parsed.alsoBlock) {
      const applied = await applyBlock(client, reporterId, targetId);
      promptLeave = applied.promptLeave;
    }
    return { ok: true, promptLeave: promptLeave };
  });
}

async function listAdminReports(db) {
  if (!db) throw unavailable();
  const result = await db.query(SQL.listReports, []);
  const reports = (result.rows || []).map(row => ({
    id: row.id,
    reporterId: row.reporter_id == null ? null : String(row.reporter_id),
    targetType: row.target_type,
    targetId: row.target_id == null ? null : String(row.target_id),
    listId: row.list_id == null ? null : String(row.list_id),
    reason: row.reason,
    note: row.note == null ? null : String(row.note),
    status: row.status,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
  }));
  return { ok: true, reports: reports };
}

/* Account deletion. Blocks go away. Report rows stay, with the
   reporter cleared, so the queue still has them. */
async function deleteAccountSafety(db, userId) {
  if (!db || typeof db.query !== "function") throw unavailable();
  await db.query(SQL.deleteBlocksForUser, [String(userId)]);
  await db.query(SQL.nullReportsForUser, [String(userId)]);
  return { ok: true };
}

module.exports = {
  SQL,
  REASONS,
  TARGETS,
  NOTE_MAX,
  isBlockedEitherWay,
  memberShownAs,
  starCountsForViewer,
  additionsCollapsedForViewer,
  blockUser,
  unblockUser,
  listBlocks,
  createReport,
  listAdminReports,
  deleteAccountSafety,
  parseReport,
  publicBody
};
