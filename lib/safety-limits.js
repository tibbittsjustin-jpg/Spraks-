/* §6.4 starting numbers. In-memory, one process, same as the username
   window. Key with safetyLimitKey: user id when signed in, IP otherwise.
   Blocks are not given their own number in §6.4. 30 a day matches
   friend requests, so a block burst stops at the same pace.
   P4 reuses friendRequests. P7 reuses listInvites. */
"use strict";

const { createWindowLimiter, DAY_MS } = require("./rate-limit");

const HOUR_MS = 60 * 60 * 1000;

const SAFETY_LIMITS = {
  blocksPerDay: 30,
  reportsPerDay: 20,
  friendRequestsPerDay: 30,
  friendRequestsPending: 100,
  listInvitesPerDay: 30,
  itemsAddedPerDay: 500,
  groupListsPerUser: 50,
  starsPerHour: 300,
  pushPerPairPer10Min: 1,
  pushPairWindowMs: 10 * 60 * 1000,
  pushPerRecipientPerDay: 20
};

const LIMIT_MESSAGES = {
  blocks: "You've reached today's block limit. Try again tomorrow.",
  reports: "You've reached today's report limit. Try again tomorrow.",
  friendRequests: "You've sent a lot of friend requests today. Try again tomorrow.",
  friendRequestsPending: "You have a lot of friend requests waiting. Cancel one, then try again.",
  listInvites: "You've sent a lot of invites today. Try again tomorrow.",
  itemsAdded: "You've added a lot of ideas today. Try again tomorrow.",
  stars: "You've starred a lot this hour. Try again in a little while.",
  push: "That's enough notices for now."
};

function safetyLimitKey(user, ip) {
  if (user && user.id) return "user:" + String(user.id);
  return "ip:" + String(ip || "unknown");
}

function windowCheck(limit, windowMs, now) {
  return createWindowLimiter({ limit: limit, windowMs: windowMs, now: now }).check;
}

function createSafetyLimiters(options) {
  options = options || {};
  const now = options.now;
  return {
    blocks: windowCheck(SAFETY_LIMITS.blocksPerDay, DAY_MS, now),
    reports: windowCheck(SAFETY_LIMITS.reportsPerDay, DAY_MS, now),
    friendRequests: windowCheck(SAFETY_LIMITS.friendRequestsPerDay, DAY_MS, now),
    listInvites: windowCheck(SAFETY_LIMITS.listInvitesPerDay, DAY_MS, now),
    itemsAdded: windowCheck(SAFETY_LIMITS.itemsAddedPerDay, DAY_MS, now),
    stars: windowCheck(SAFETY_LIMITS.starsPerHour, HOUR_MS, now),
    pushPair: windowCheck(SAFETY_LIMITS.pushPerPairPer10Min, SAFETY_LIMITS.pushPairWindowMs, now),
    pushRecipient: windowCheck(SAFETY_LIMITS.pushPerRecipientPerDay, DAY_MS, now)
  };
}

module.exports = {
  SAFETY_LIMITS,
  LIMIT_MESSAGES,
  safetyLimitKey,
  createSafetyLimiters,
  DAY_MS,
  HOUR_MS
};
