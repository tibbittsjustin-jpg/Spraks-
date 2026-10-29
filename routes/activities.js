/* Read-only activities API. Approved free-tier rows only.
   Pending, rejected, archived, and paid rows all look like a 404. */
"use strict";

const express = require("express");
const repo = require("../db/activities-repo");

function sendError(res, err) {
  if (err && err.code === "invalid_filter") {
    return res.status(400).json({ error: "invalid_filter", field: err.field });
  }
  console.error("[activities]", err && err.code ? err.code : "UNKNOWN");
  return res.status(500).json({ error: "db_error" });
}

function createActivitiesRouter(opts) {
  opts = opts || {};
  const router = express.Router({ mergeParams: true });
  const configured = opts.isConfigured || function () { return require("../db").isConfigured(); };
  function database() {
    return opts.db || require("../db").getPool();
  }

  router.get("/", async (req, res) => {
    if (!configured()) return res.status(503).json({ error: "db_not_configured" });
    try {
      const query = Object.assign({}, req.query);
      delete query.includePaid;
      const located = query.lat != null && query.lat !== "" && query.lng != null && query.lng !== "";
      const body = await repo.listActivities(query, database());
      res.set("Cache-Control", located ? "private, max-age=60" : "public, max-age=300");
      res.json(body);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/:id", async (req, res) => {
    if (!configured()) return res.status(503).json({ error: "db_not_configured" });
    if (!/^\d{1,9}$/.test(req.params.id)) return res.status(400).json({ error: "invalid_id" });
    try {
      const item = await repo.getActivity(Number(req.params.id), database());
      if (!item) return res.status(404).json({ error: "not_found" });
      res.set("Cache-Control", "public, max-age=300");
      res.json(item);
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}

module.exports = { createActivitiesRouter };
