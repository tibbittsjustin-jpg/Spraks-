/* The Over $100 budget band matches the ideas that were moved there,
   and no other idea. */
"use strict";

const path = require("path");
const { loadApp } = require("./harness");
const { loadIdeas } = require("../db/seed");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
function section(title, fn) {
  console.log("\n" + title);
  try { fn(); }
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 300)); }
}

const OVER_100 = [
  254, 255, 365, 1567, 1590,
  1689, 1691, 1692, 1693, 1694, 1695, 1696, 1697, 1699,
  1700, 1701, 1702, 1703, 1704, 1706, 1707, 1709,
  1710, 1711, 1712, 1713, 1714, 1715, 1716, 1717, 1719,
  1720, 1721, 1722, 1723, 1724, 1725, 1726, 1727, 1728, 1729,
  1730, 1731, 1732, 1733, 1735, 1736, 1737, 1738, 1739,
  1741, 1742, 1744, 1745, 1746, 1747, 1748,
  1750, 1751
];

section("Over $100 cost filter", () => {
  const ideas = loadIdeas(path.join(__dirname, "..", "public", "data.js"));
  const byId = {};
  ideas.forEach(idea => { byId[idea.id] = idea; });
  const expected = new Set(OVER_100);
  const actual = ideas.filter(idea => idea.cost === "Over $100").map(idea => idea.id);
  const missing = OVER_100.filter(id => !byId[id] || byId[id].cost !== "Over $100");
  const extra = actual.filter(id => !expected.has(id));
  check("the approved ids are Over $100", missing.length === 0, missing.join(","));
  check("no other idea is Over $100", extra.length === 0, extra.join(","));
  check("that set is 59 ideas", actual.length === 59 && OVER_100.length === 59, String(actual.length));

  const t = loadApp({});
  const costDef = t.FILTER_DEFS.filter(def => def.key === "cost")[0];
  check("the budget filter offers Over $100",
    !!costDef && costDef.options[costDef.options.length - 1] === "Over $100");
  const onlyOver = Object.assign({}, t.state.filters, { cost: ["Over $100"] });
  const under = Object.assign({}, t.state.filters, { cost: ["$100 and under"] });
  check("an Over $100 filter matches #1716", t.matchesFilters(t.IDEAS_BY_ID[1716], onlyOver));
  check("an Over $100 filter skips a cheaper idea", !t.matchesFilters(t.IDEAS_BY_ID[2], onlyOver));
  check("a $100 and under filter skips #1716", !t.matchesFilters(t.IDEAS_BY_ID[1716], under));
  const matched = ideas.filter(idea => t.matchesFilters(idea, onlyOver)).map(idea => idea.id);
  check("the filter matches exactly those ideas",
    matched.length === OVER_100.length && matched.every(id => expected.has(id)));
});

module.exports = { pass: pass, fail: fail };
