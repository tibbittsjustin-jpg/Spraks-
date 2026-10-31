/* Visit website: https-only check, and the detail link's target and rel.
   No database. */
"use strict";

const fs = require("fs");
const path = require("path");
const util = require("../public/util");
const { loadApp } = require("./harness");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
function section(title, fn) {
  console.log("\n" + title);
  try { fn(); }
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 400)); }
}

function walk(node, acc) {
  if (!node || typeof node !== "object") return;
  acc.push(node);
  (node.children || []).forEach(child => walk(child, acc));
}

function visitLinks(screen) {
  const nodes = [];
  walk(screen, nodes);
  return nodes.filter(node => node.textContent === "Visit website");
}

function innerHtmlBlob(screen) {
  const nodes = [];
  walk(screen, nodes);
  return nodes.map(node => String(node.innerHTML || "")).join("\n");
}

section("https-only check", () => {
  check("accepts https", util.httpsPageUrl("https://example.com/place") === "https://example.com/place");
  check("accepts https with a query", util.httpsPageUrl("https://example.com/place?q=1") === "https://example.com/place?q=1");
  check("rejects http", util.httpsPageUrl("http://example.com") === "");
  check("rejects javascript:", util.httpsPageUrl("javascript:alert(1)") === "" && util.httpsPageUrl("JavaScript:alert(1)") === "");
  check("rejects data:", util.httpsPageUrl("data:text/html,hi") === "");
  check("rejects empty", util.httpsPageUrl("") === "" && util.httpsPageUrl("   ") === "" && util.httpsPageUrl(null) === "");
  check("rejects malformed",
    util.httpsPageUrl("not a url") === "" &&
    util.httpsPageUrl("https://") === "" &&
    util.httpsPageUrl("https:example.com") === "");
  check("rejects a website with a password in it", util.httpsPageUrl("https://user:pass@example.com") === "");
  const page = "https://example.com/curated";
  check("source_url wins when it is https", util.activityWebsite({ source_url: page, url: "https://other.example/" }) === page);
  check("an http source_url does not fall through to url",
    util.activityWebsite({ source_url: "http://example.com", url: page }) === "");
  check("a built-in idea can use url", util.activityWebsite({ url: page }) === page);
  check("the activities API name sourceUrl is accepted", util.activityWebsite({ sourceUrl: page }) === page);
  check("a photo address is not a website", util.activityWebsite({ photo: { url: page } }) === "");
});

section("detail link", () => {
  const t = loadApp({});
  const baseId = Object.keys(t.IDEAS_BY_ID)[0];
  const base = t.IDEAS_BY_ID[baseId];
  check("a catalog idea with no website has no link", visitLinks(t.buildDetailScreen(base.id)).length === 0);

  function screenFor(extra) {
    const idea = Object.assign({}, base, extra);
    t.IDEAS_BY_ID[idea.id] = idea;
    return t.buildDetailScreen(idea.id);
  }

  const href = "https://example.com/place";
  const shown = screenFor({ id: 880101, source_url: href });
  const links = visitLinks(shown);
  check("https source_url renders one Visit website link", links.length === 1, String(links.length));
  const link = links[0];
  check("link uses the outline button classes",
    link && link.className === "btn-outline" && link.tagName === "A");
  check("link target and rel are set",
    link && link.getAttribute("href") === href &&
    link.getAttribute("target") === "_blank" &&
    link.getAttribute("rel") === "noopener noreferrer");
  check("the address is not written with innerHTML",
    link && link.innerHTML === "" && innerHtmlBlob(shown).indexOf(href) === -1);

  ["http://example.com", "javascript:alert(1)", "data:text/html,hi", "not a url", "https://"].forEach(bad => {
    const hidden = screenFor({ id: 880200 + bad.length, source_url: bad, url: href });
    check("no link for " + JSON.stringify(bad), visitLinks(hidden).length === 0);
  });
  const empty = screenFor({ id: 880210, source_url: "" });
  check("no link for an empty source_url", visitLinks(empty).length === 0);

  const curated = screenFor({ id: 880301, url: href });
  const curatedLinks = visitLinks(curated);
  check("a built-in idea with url renders the link",
    curatedLinks.length === 1 && curatedLinks[0].getAttribute("href") === href &&
    curatedLinks[0].getAttribute("target") === "_blank" &&
    curatedLinks[0].getAttribute("rel") === "noopener noreferrer");

  const apiShape = screenFor({ id: 880302, sourceUrl: href });
  check("sourceUrl from the activities API renders the link",
    visitLinks(apiShape).length === 1 && visitLinks(apiShape)[0].getAttribute("href") === href);

  const photoOnly = screenFor({ id: 880303, photo: { url: "https://example.com/photo.jpg", credit: "Photo" } });
  check("a photo url does not render Visit website", visitLinks(photoOnly).length === 0);

  const src = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const fn = src.slice(src.indexOf("function visitWebsiteLink"), src.indexOf("function buildDetailScreen"));
  check("the link builder uses setAttribute and not innerHTML",
    fn.indexOf('setAttribute("href"') !== -1 &&
    fn.indexOf('setAttribute("target", "_blank")') !== -1 &&
    fn.indexOf('setAttribute("rel", "noopener noreferrer")') !== -1 &&
    fn.indexOf("innerHTML") === -1);
});

module.exports = { pass: pass, fail: fail };
