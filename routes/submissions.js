/* POST /api/submissions. Pending community ideas only.
   Email is written to submitter_email and nowhere else. The insert does
   not set status, so the row stays the database default: pending. */
"use strict";

const express = require("express");
const { rateLimit, MemoryStore } = require("express-rate-limit");
const { createEmailLimiter, DAY_MS } = require("../lib/rate-limit");
const { validateSubmission, honeypotFilled } = require("../lib/submission");

const TEN_MINUTES_MS = 10 * 60 * 1000;
const LIMITS = {
  ipBurst: 5,
  ipBurstWindowMs: TEN_MINUTES_MS,
  ipDay: 20,
  ipDayWindowMs: DAY_MS,
  emailDay: 10,
  emailDayWindowMs: DAY_MS
};

function retryAfterSeconds(req, windowMs) {
  const reset = req.rateLimit && req.rateLimit.resetTime;
  if (reset instanceof Date) {
    return Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000));
  }
  return Math.max(1, Math.ceil(windowMs / 1000));
}

function sendRateLimited(req, res, windowMs) {
  res.set("Retry-After", String(retryAfterSeconds(req, windowMs)));
  res.status(429).json({ ok: false, error: "rate_limited" });
}

function createIpLimiter(windowMs, limit) {
  return rateLimit({
    windowMs: windowMs,
    limit: limit,
    standardHeaders: false,
    legacyHeaders: false,
    store: new MemoryStore(),
    handler: function (req, res) { sendRateLimited(req, res, windowMs); }
  });
}

function requireJson(req, res, next) {
  const header = String(req.headers["content-type"] || "");
  if (!/^application\/json\s*(;|$)/i.test(header)) {
    return res.status(415).json({ ok: false, error: "unsupported_media_type" });
  }
  next();
}

function parseBody(limit) {
  const parser = express.json({ limit: limit || "16kb" });
  return function (req, res, next) {
    parser(req, res, function (err) {
      if (!err) return next();
      if (err.type === "entity.too.large" || err.status === 413 || err.statusCode === 413) {
        return res.status(413).json({ ok: false, error: "too_large" });
      }
      return res.status(400).json({ ok: false, error: "invalid_submission" });
    });
  };
}

async function defaultInsert(payload, email) {
  const pool = require("../db").getPool();
  if (!pool) {
    const err = new Error("unavailable");
    err.code = "unavailable";
    throw err;
  }
  // No type cast. The column already has its type, and a later migration may
  // move that extension out of public. Status is the column default.
  await pool.query(
    "insert into submissions (payload, submitter_email) values ($1, $2)",
    [payload, email]
  );
}

function createSubmissionsRouter(opts) {
  opts = opts || {};
  const router = express.Router();
  const configured = opts.isConfigured || function () { return require("../db").isConfigured(); };
  const insert = opts.insert || defaultInsert;
  const ipBurst = opts.ipBurst || createIpLimiter(LIMITS.ipBurstWindowMs, LIMITS.ipBurst);
  const ipDay = opts.ipDay || createIpLimiter(LIMITS.ipDayWindowMs, LIMITS.ipDay);
  const emailLimiter = opts.emailLimiter || createEmailLimiter({
    limit: LIMITS.emailDay,
    windowMs: LIMITS.emailDayWindowMs
  });

  router.post(
    "/",
    requireJson,
    parseBody(opts.bodyLimit),
    function honeypot(req, res, next) {
      if (honeypotFilled(req.body)) return res.status(200).json({ ok: true, status: "pending" });
      next();
    },
    function unavailable(req, res, next) {
      // Before the rate limiters so a server with no database keeps answering
      // 503 and the form can fall back on this device instead of "try later".
      if (!configured()) return res.status(503).json({ ok: false, error: "unavailable" });
      next();
    },
    ipBurst,
    ipDay,
    function validate(req, res, next) {
      const result = validateSubmission(req.body);
      if (!result.ok) {
        const body = { ok: false, error: result.error };
        if (result.fields && result.fields.length) body.fields = result.fields;
        return res.status(result.status).json(body);
      }
      req.submission = { payload: result.payload, email: result.email };
      next();
    },
    function limitEmail(req, res, next) {
      const result = emailLimiter.check(req.submission.email);
      if (result.limited) {
        res.set("Retry-After", String(result.retryAfter));
        return res.status(429).json({ ok: false, error: "rate_limited" });
      }
      next();
    },
    async function insertSubmission(req, res) {
      try {
        await insert(req.submission.payload, req.submission.email);
        return res.status(201).json({ ok: true, status: "pending" });
      } catch (err) {
        console.error("[submissions] request_failed");
        return res.status(500).json({ ok: false, error: "request_failed" });
      }
    }
  );

  return router;
}

module.exports = { createSubmissionsRouter, createIpLimiter, LIMITS };
