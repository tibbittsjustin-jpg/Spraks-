/* Signed-in blocks and reports. Admin queue is read-only.
   GET /api/admin/reports allows user ids in ADMIN_USER_IDS
   (comma-separated). There is no admin UI here. Website & Admin
   renders the queue and must not show reporterId to the reported person.
   The tables stay deny-all. This process uses DATABASE_URL. */
"use strict";

const express = require("express");
const { bearerToken, createSupabaseAuth, userFromToken } = require("../lib/auth");
const {
  createSafetyLimiters,
  safetyLimitKey,
  SAFETY_LIMITS,
  LIMIT_MESSAGES
} = require("../lib/safety-limits");
const {
  blockUser,
  unblockUser,
  listBlocks,
  createReport,
  listAdminReports,
  publicBody,
  isBlockedEitherWay,
  memberShownAs,
  starCountsForViewer,
  additionsCollapsedForViewer,
  deleteAccountSafety
} = require("../lib/safety");

function createSafetyRouter(opts) {
  opts = opts || {};
  const router = express.Router();
  const configured = opts.isConfigured || function () { return require("../db").isConfigured(); };
  const limiters = opts.limiters || createSafetyLimiters();
  function database() {
    if (opts.db) return opts.db;
    return require("../db").getPool();
  }
  function authClient() {
    return opts.auth || createSupabaseAuth();
  }
  function adminIds() {
    if (Array.isArray(opts.adminIds)) return opts.adminIds;
    return String(process.env.ADMIN_USER_IDS || "")
      .split(",")
      .map(part => part.trim())
      .filter(Boolean);
  }
  function clientAddress(req) {
    return req.ip || (req.socket && req.socket.remoteAddress) || "unknown";
  }
  async function optionalUser(req) {
    const token = bearerToken(req);
    if (!token) return null;
    return userFromToken(token, authClient());
  }
  function sendFailure(res, err) {
    if (err && err.code === "unavailable") {
      return res.status(503).json({ ok: false, error: "unavailable" });
    }
    console.error("[safety] request_failed");
    return res.status(500).json({ ok: false, error: "request_failed" });
  }
  async function guard(req, res, limiter, message) {
    res.set("Cache-Control", "no-store");
    const user = await optionalUser(req);
    const limited = limiter(safetyLimitKey(user, clientAddress(req)));
    if (limited.limited) {
      res.set("Retry-After", String(limited.retryAfter));
      res.status(429).json({
        ok: false,
        error: "rate_limited",
        message: message
      });
      return null;
    }
    if (!user) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return null;
    }
    if (!configured() && !opts.db) {
      res.status(503).json({ ok: false, error: "unavailable" });
      return null;
    }
    return user;
  }
  function sendResult(res, result) {
    if (!result || result.ok === false) {
      return res.status(400).json({
        ok: false,
        error: result && result.error ? result.error : "invalid",
        message: result && result.message ? result.message : "Check that and try again."
      });
    }
    return res.status(200).json(publicBody(result));
  }

  router.get("/blocks", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const user = await optionalUser(req);
    if (!user) return res.status(401).json({ ok: false, error: "unauthorized" });
    if (!configured() && !opts.db) {
      return res.status(503).json({ ok: false, error: "unavailable" });
    }
    try {
      const result = await listBlocks(database(), user.id);
      return res.status(200).json(result);
    } catch (err) {
      return sendFailure(res, err);
    }
  });

  router.post("/blocks", async (req, res) => {
    const user = await guard(req, res, limiters.blocks, LIMIT_MESSAGES.blocks);
    if (!user) return;
    const raw = req.body && typeof req.body.username === "string" ? req.body.username : "";
    try {
      const result = await blockUser(database(), user.id, raw);
      return sendResult(res, result);
    } catch (err) {
      return sendFailure(res, err);
    }
  });

  router.delete("/blocks/:username", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const user = await optionalUser(req);
    if (!user) return res.status(401).json({ ok: false, error: "unauthorized" });
    if (!configured() && !opts.db) {
      return res.status(503).json({ ok: false, error: "unavailable" });
    }
    try {
      const result = await unblockUser(database(), user.id, req.params.username);
      return sendResult(res, result);
    } catch (err) {
      return sendFailure(res, err);
    }
  });

  router.post("/reports", async (req, res) => {
    const user = await guard(req, res, limiters.reports, LIMIT_MESSAGES.reports);
    if (!user) return;
    try {
      const result = await createReport(database(), user.id, req.body || {});
      return sendResult(res, result);
    } catch (err) {
      return sendFailure(res, err);
    }
  });

  /* Read-only queue for Website & Admin. reporterId is for the reviewer.
     Do not show it to the reported person. */
  router.get("/admin/reports", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const user = await optionalUser(req);
    if (!user) return res.status(401).json({ ok: false, error: "unauthorized" });
    const allowed = adminIds();
    if (!allowed.some(id => String(id) === String(user.id))) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }
    if (!configured() && !opts.db) {
      return res.status(503).json({ ok: false, error: "unavailable" });
    }
    try {
      const result = await listAdminReports(database());
      return res.status(200).json(result);
    } catch (err) {
      return sendFailure(res, err);
    }
  });

  return router;
}

module.exports = {
  createSafetyRouter,
  isBlockedEitherWay,
  memberShownAs,
  starCountsForViewer,
  additionsCollapsedForViewer,
  deleteAccountSafety,
  createSafetyLimiters,
  safetyLimitKey,
  SAFETY_LIMITS,
  LIMIT_MESSAGES
};
