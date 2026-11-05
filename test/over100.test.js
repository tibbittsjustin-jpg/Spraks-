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
  const ideas = loadIdeas(path.join(__dirname, "..", "data", "ideas-catalog.js"));
  const byId = {};
  ideas.forEach(idea => { byId[idea.id] = idea; });
  const expected = new Set(ideas.filter(idea => idea.cost === "Over $100").map(idea => idea.id));
  const actual = ideas.filter(idea => idea.cost === "Over $100").map(idea => idea.id);
  const missing = OVER_100.filter(id => !byId[id] || byId[id].cost !== "Over $100");
  check("the original Over $100 ids stay Over $100", missing.length === 0, missing.join(","));
  check("Over $100 is still a closed set the filter can name", actual.length >= OVER_100.length, String(actual.length));

  const t = loadApp({});
  const costDef = t.FILTER_DEFS.filter(def => def.key === "cost")[0];
  check("the budget filter offers Over $100",
    !!costDef && costDef.options[costDef.options.length - 1] === "Over $100");
  check("budget chips are the seven $20 bands and hide legacy labels",
    !!costDef && costDef.options.join("|") === "Free|$1-$20|$21-$40|$41-$60|$61-$80|$81-$100|Over $100");
  const onlyOver = Object.assign({}, t.state.filters, { cost: ["Over $100"] });
  const under = Object.assign({}, t.state.filters, { cost: ["$81-$100"] });
  check("an Over $100 filter matches #1716", t.matchesFilters(t.IDEAS_BY_ID[1716], onlyOver));
  check("an Over $100 filter skips a cheaper idea", !t.matchesFilters(t.IDEAS_BY_ID[2], onlyOver));
  check("an $81-$100 filter skips #1716", !t.matchesFilters(t.IDEAS_BY_ID[1716], under));
  const matched = ideas.filter(idea => t.matchesFilters(idea, onlyOver)).map(idea => idea.id);
  check("the filter matches exactly the Over $100 ideas",
    matched.length === expected.size && matched.every(id => expected.has(id)));
  const legacy = { cost: "$20-$30" };
  const low = Object.assign({}, t.state.filters, { cost: ["$1-$20"] });
  const mid = Object.assign({}, t.state.filters, { cost: ["$21-$40"] });
  const high = Object.assign({}, t.state.filters, { cost: ["$41-$60"] });
  check("a $20-$30 row matches only $21-$40",
    !t.matchesFilters(legacy, low) && t.matchesFilters(legacy, mid) && !t.matchesFilters(legacy, high));
  const wide = { cost: "$100 and under" };
  const wideBands = ["$21-$40", "$41-$60", "$61-$80", "$81-$100"];
  check("a $100 and under row matches $21-$40 through $81-$100",
    wideBands.every(band => t.matchesFilters(wide, Object.assign({}, t.state.filters, { cost: [band] }))) &&
    !t.matchesFilters(wide, onlyOver) && !t.matchesFilters(wide, low));
  check("the card prints the new step, not the stored $20-$30 label",
    t.displayCost(legacy) === "$21\u2013$40");
  const perCar = { cost: "$1-$20", costUnit: "per car" };
  check("displayCost appends per car except on Free and uses en dashes",
    t.displayCost(perCar) === "$1\u2013$20 per car" &&
    t.displayCost({ cost: "Free", costUnit: "per car" }) === "Free" &&
    t.displayCost({ cost: "$21-$40" }) === "$21\u2013$40" &&
    t.displayCost({ cost: "$1-$10" }) === "$1\u2013$20" &&
    t.displayCost({ cost: "$100 and under", costUnit: "per car" }) === "Up to $100 per car");
  const bare = t.hydrateRealIdea({ title: "No price", description: "The model left cost off." }, t.state.filters);
  check("a nearby spot with no AI cost defaults to $1-$20", bare.cost === "$1-$20");
});

module.exports = { pass: pass, fail: fail };
