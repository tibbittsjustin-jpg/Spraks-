/* Signed-in friends. Exact username only. No search and no suggestions.
   GET /api/friends is the caller's own list. It is never someone else's.
   The tables stay deny-all. This process uses DATABASE_URL. */
"use strict";

const express = require("express");
const { bearerToken, createSupabaseAuth, userFromToken } = require("../lib/auth");
const {
  createSafetyLimiters,
  safetyLimitKey,
  LIMIT_MESSAGES
} = require("../lib/safety-limits");
const {
  sendFriendRequest,
  changeFriend,
  listFriends,
  deleteAccountFriends
} = require("../lib/friends");

function createFriendsRouter(opts) {
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
    console.error("[friends] request_failed");
    return res.status(500).json({ ok: false, error: "request_failed" });
  }
  async function requireReady(req, res) {
    res.set("Cache-Control", "no-store");
    const user = await optionalUser(req);
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
    if (result && result.error === "rate_limited") {
      return res.status(429).json({
        ok: false,
        error: "rate_limited",
        message: result.message || LIMIT_MESSAGES.friendRequests
      });
    }
    if (result && result.error === "not_found") {
      return res.status(404).json({
        ok: false,
        error: "not_found",
        message: result.message
      });
    }
    if (!result || result.ok === false) {
      return res.status(400).json({
        ok: false,
        error: result && result.error ? result.error : "invalid",
        message: result && result.message ? result.message : "Check that and try again."
      });
    }
    const body = { ok: true };
    if (result.status) body.status = result.status;
    return res.status(200).json(body);
  }

  router.get("/friends", async (req, res) => {
    const user = await requireReady(req, res);
    if (!user) return;
    try {
      const result = await listFriends(database(), user.id);
      return res.status(200).json({
        ok: true,
        friends: result.friends,
        incoming: result.incoming,
        outgoing: result.outgoing
      });
    } catch (err) {
      return sendFailure(res, err);
    }
  });

  router.post("/friends/requests", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const user = await optionalUser(req);
    const limited = limiters.friendRequests(safetyLimitKey(user, clientAddress(req)));
    if (limited.limited) {
      res.set("Retry-After", String(limited.retryAfter));
      return res.status(429).json({
        ok: false,
        error: "rate_limited",
        message: LIMIT_MESSAGES.friendRequests
      });
    }
    if (!user) return res.status(401).json({ ok: false, error: "unauthorized" });
    if (!configured() && !opts.db) {
      return res.status(503).json({ ok: false, error: "unavailable" });
    }
    const raw = req.body && typeof req.body.username === "string" ? req.body.username : "";
    try {
      const result = await sendFriendRequest(database(), user.id, raw);
      return sendResult(res, result);
    } catch (err) {
      return sendFailure(res, err);
    }
  });

  async function respond(req, res, action) {
    const user = await requireReady(req, res);
    if (!user) return;
    try {
      const result = await changeFriend(database(), user.id, req.params.username, action);
      return sendResult(res, result);
    } catch (err) {
      return sendFailure(res, err);
    }
  }

  router.post("/friends/requests/:username/accept", (req, res) => respond(req, res, "accept"));
  router.post("/friends/requests/:username/decline", (req, res) => respond(req, res, "decline"));
  router.post("/friends/requests/:username/cancel", (req, res) => respond(req, res, "cancel"));

  router.delete("/friends/:username", (req, res) => respond(req, res, "unfriend"));

  return router;
}

module.exports = {
  createFriendsRouter,
  deleteAccountFriends,
  sendFriendRequest,
  changeFriend,
  listFriends
};
