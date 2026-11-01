/* Signed-in username claim. Check is public and rate-limited.
   Claim and the current-name read require a Supabase access token.
   The tables stay deny-all; this process uses DATABASE_URL. */
"use strict";

const express = require("express");
const { createWindowLimiter } = require("../lib/rate-limit");
const { bearerToken, createSupabaseAuth, userFromToken } = require("../lib/auth");
const {
  classifyUsername,
  checkAvailability,
  currentUsername,
  claimUsername
} = require("../lib/username");

const CHECK_LIMIT = 30;
const CHECK_WINDOW_MS = 60 * 1000;

function sendFailure(res, err) {
  if (err && err.code === "unavailable") {
    return res.status(503).json({ ok: false, error: "unavailable" });
  }
  console.error("[username] request_failed");
  return res.status(500).json({ ok: false, error: "request_failed" });
}

function statusCode(result) {
  if (!result || result.ok) return 200;
  if (result.error === "taken" || result.error === "held" || result.error === "cooldown") return 409;
  return 400;
}

function createUsernameRouter(opts) {
  opts = opts || {};
  const router = express.Router();
  const configured = opts.isConfigured || function () { return require("../db").isConfigured(); };
  function database() {
    if (opts.db) return opts.db;
    return require("../db").getPool();
  }
  function authClient() {
    return opts.auth || createSupabaseAuth();
  }
  function clock() {
    return opts.now ? opts.now() : new Date();
  }
  const limitCheck = opts.limitCheck || createWindowLimiter({
    limit: CHECK_LIMIT,
    windowMs: CHECK_WINDOW_MS
  }).check;

  async function optionalUser(req) {
    const token = bearerToken(req);
    if (!token) return null;
    return userFromToken(token, authClient());
  }

  async function requireUser(req, res) {
    const token = bearerToken(req);
    if (!token) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return null;
    }
    const user = await userFromToken(token, authClient());
    if (!user) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return null;
    }
    return user;
  }

  router.get("/username/check", async (req, res) => {
    const ip = req.ip || req.socket && req.socket.remoteAddress || "unknown";
    const limited = limitCheck(ip);
    if (limited.limited) {
      res.set("Retry-After", String(limited.retryAfter));
      return res.status(429).json({ ok: false, error: "rate_limited" });
    }
    res.set("Cache-Control", "no-store");
    const raw = Array.isArray(req.query.u) ? req.query.u[0] : req.query.u;
    const classified = classifyUsername(raw == null ? "" : String(raw));
    if (!classified.ok) return res.status(200).json(classified);
    if (!configured() && !opts.db) {
      return res.status(503).json({ ok: false, error: "unavailable" });
    }
    try {
      const user = await optionalUser(req);
      const result = await checkAvailability(database(), raw, user && user.id, clock());
      return res.status(200).json(result);
    } catch (err) {
      return sendFailure(res, err);
    }
  });

  router.get("/me/username", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const user = await requireUser(req, res);
    if (!user) return;
    if (!configured() && !opts.db) {
      return res.status(503).json({ ok: false, error: "unavailable" });
    }
    try {
      const result = await currentUsername(database(), user.id, clock());
      return res.status(200).json(result);
    } catch (err) {
      return sendFailure(res, err);
    }
  });

  router.post("/username", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const user = await requireUser(req, res);
    if (!user) return;
    const raw = req.body && typeof req.body.username === "string" ? req.body.username : "";
    const classified = classifyUsername(raw);
    if (!classified.ok) return res.status(statusCode(classified)).json(classified);
    if (!configured() && !opts.db) {
      return res.status(503).json({ ok: false, error: "unavailable" });
    }
    try {
      const result = await claimUsername(database(), user.id, raw, clock());
      return res.status(statusCode(result)).json(result);
    } catch (err) {
      return sendFailure(res, err);
    }
  });

  return router;
}

module.exports = { createUsernameRouter, CHECK_LIMIT, CHECK_WINDOW_MS };
