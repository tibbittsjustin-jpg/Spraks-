/* Per-email limiter. The map key is a SHA-256 of the normalized address.
   The address itself is not stored. One process only.
   TODO: move this and the IP limiter to Postgres or Redis before running
   more than one instance. */
"use strict";

const crypto = require("crypto");

const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL_LIMIT = 10;

function hashEmail(email) {
  return crypto.createHash("sha256").update(String(email)).digest("hex");
}

function createEmailLimiter(options) {
  options = options || {};
  const limit = options.limit == null ? EMAIL_LIMIT : options.limit;
  const windowMs = options.windowMs == null ? DAY_MS : options.windowMs;
  const now = options.now || function () { return Date.now(); };
  const hits = new Map();

  function prune(list, t) {
    const cutoff = t - windowMs;
    const kept = [];
    for (let i = 0; i < list.length; i++) {
      if (list[i] > cutoff) kept.push(list[i]);
    }
    return kept;
  }

  function check(email) {
    const key = hashEmail(String(email).toLowerCase());
    const t = now();
    const list = prune(hits.get(key) || [], t);
    if (list.length >= limit) {
      const retryAfter = Math.max(1, Math.ceil((list[0] + windowMs - t) / 1000));
      hits.set(key, list);
      return { limited: true, retryAfter: retryAfter };
    }
    list.push(t);
    hits.set(key, list);
    return { limited: false, retryAfter: 0 };
  }

  return {
    check: check,
    hasRaw: function (email) { return hits.has(String(email).toLowerCase()); },
    hasHash: function (email) { return hits.has(hashEmail(String(email).toLowerCase())); }
  };
}

/* Fixed window, keyed by whatever the caller passes (an IP for the
   username check). One process only, same as the email limiter. */
function createWindowLimiter(options) {
  options = options || {};
  const limit = options.limit == null ? 30 : options.limit;
  const windowMs = options.windowMs == null ? 60 * 1000 : options.windowMs;
  const now = options.now || function () { return Date.now(); };
  const hits = new Map();

  function prune(list, t) {
    const cutoff = t - windowMs;
    const kept = [];
    for (let i = 0; i < list.length; i++) {
      if (list[i] > cutoff) kept.push(list[i]);
    }
    return kept;
  }

  function check(key) {
    const id = String(key);
    const t = now();
    const list = prune(hits.get(id) || [], t);
    if (list.length >= limit) {
      const retryAfter = Math.max(1, Math.ceil((list[0] + windowMs - t) / 1000));
      hits.set(id, list);
      return { limited: true, retryAfter: retryAfter };
    }
    list.push(t);
    hits.set(id, list);
    return { limited: false, retryAfter: 0 };
  }

  return { check: check };
}

module.exports = { createEmailLimiter, createWindowLimiter, hashEmail, DAY_MS, EMAIL_LIMIT };
