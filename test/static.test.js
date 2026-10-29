/* The HTTP server only publishes public/. No database. */
"use strict";

const http = require("http");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}

const MUST_404 = [
  "/server.js",
  "/package.json",
  "/package-lock.json",
  "/.env",
  "/.env.example",
  "/work/apply_patches.js",
  "/test/run.js",
  "/README.md",
  "/.claude/launch.json",
  "/db/migrations/001_init.sql",
  "/data/coords/utah.json"
];
const MUST_200 = ["/", "/app.js", "/data.js", "/style.css", "/motifs.js", "/qrcode.lib.js", "/util.js", "/photos.js", "/photos.json", "/CREDITS.md", "/credits.html", "/api/status"];

function request(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ port: port, path: urlPath }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    }).on("error", reject);
  });
}

async function main() {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "";
  const app = require("../server");
  const server = await new Promise(resolve => {
    const listening = app.listen(0, () => resolve(listening));
  });
  const port = server.address().port;
  try {
    for (const urlPath of MUST_404) {
      const res = await request(port, urlPath);
      check(urlPath + " is 404", res.status === 404, String(res.status));
      check(urlPath + " does not contain submitter_email", res.body.indexOf("submitter_email") === -1);
    }
    for (const urlPath of MUST_200) {
      const res = await request(port, urlPath);
      check(urlPath + " is 200", res.status === 200, String(res.status));
      check(urlPath + " does not contain submitter_email", res.body.indexOf("submitter_email") === -1);
    }
    const activities = await request(port, "/api/activities");
    const activitiesBody = JSON.parse(activities.body);
    check("/api/activities is 503 db_not_configured",
      activities.status === 503 && activitiesBody.error === "db_not_configured",
      activities.status + " " + activities.body);
    check("activities 503 does not contain submitter_email", activities.body.indexOf("submitter_email") === -1);

    const status = await request(port, "/api/status");
    const statusBody = JSON.parse(status.body);
    check("/api/status dbConfigured is false", statusBody.dbConfigured === false, JSON.stringify(statusBody));

    const missing = await request(port, "/api/foo");
    check("unknown /api/foo is 404 JSON",
      missing.status === 404 && JSON.parse(missing.body).error === "not_found",
      missing.status + " " + missing.body);

    const home = await request(port, "/");
    check("home page still loads the browser scripts",
      home.body.indexOf('src="util.js"') !== -1 && home.body.indexOf('src="app.js"') !== -1 &&
      home.body.indexOf('src="data.js"') !== -1 && home.body.indexOf('src="photos.js"') !== -1);
    check("profile links to photo credits", home.body.indexOf('data-action="credits"') !== -1);
    const creditsPage = await request(port, "/credits.html");
    check("credits page names the AI images and links licenses",
      creditsPage.status === 200 &&
      creditsPage.body.indexOf("AI-generated image") !== -1 &&
      creditsPage.body.indexOf("creativecommons.org") !== -1);
    const sample = await request(port, "/photos/aquarium/aquarium-1.webp");
    check("a catalog photo is served", sample.status === 200 && sample.headers["content-type"] && sample.headers["content-type"].indexOf("image/webp") !== -1,
      sample.status + " " + (sample.headers["content-type"] || ""));
  } finally {
    if (previous == null) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
    await new Promise(resolve => server.close(resolve));
  }
  return { pass: pass, fail: fail };
}

module.exports = main();
