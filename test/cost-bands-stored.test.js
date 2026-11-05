/* Stored costs, the seven budget buttons, and the text those buttons and
   cards print. Internal values keep ASCII hyphens. Shown text uses en dashes.
   Read-only. No database. */
"use strict";
const fs = require("fs");
const path = require("path");
const bands = require("../public/cost-bands");
const filters = require("../shared/filters");
const { loadApp } = require("./harness");

let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) { pass++; console.log("  \x1b[32mPASS\x1b[0m " + name); }
  else { fail++; console.log("  \x1b[31mFAIL\x1b[0m " + name + (info ? "  (" + info + ")" : "")); }
}

const EN = bands.EN_DASH;
const BUTTONS = ["Free", "$1-$20", "$21-$40", "$41-$60", "$61-$80", "$81-$100", "Over $100"];
const LABELS = ["Free", "$1" + EN + "$20", "$21" + EN + "$40", "$41" + EN + "$60", "$61" + EN + "$80", "$81" + EN + "$100", "Over $100"];
const LEGACY = {
  "Free": "Free",
  "$1-$10": "$1" + EN + "$20",
  "$20-$30": "$21" + EN + "$40",
  "$100 and under": "Up to $100",
  "Over $100": "Over $100"
};
const NEW_LABELS = {
  "Free": "Free",
  "$1-$20": "$1" + EN + "$20",
  "$21-$40": "$21" + EN + "$40",
  "$41-$60": "$41" + EN + "$60",
  "$61-$80": "$61" + EN + "$80",
  "$81-$100": "$81" + EN + "$100",
  "Over $100": "Over $100"
};

function buttonsFor(value) {
  return BUTTONS.filter(function (b) { return bands.costMatches(value, [b]); });
}
function serverButtonsFor(value) {
  return BUTTONS.filter(function (b) { return bands.storedCostsForBands([b]).indexOf(value) !== -1; });
}
function walk(node, fn) {
  if (!node) return;
  fn(node);
  const kids = node.children || [];
  for (let i = 0; i < kids.length; i++) walk(kids[i], fn);
}
function textOf(node) {
  if (!node || typeof node !== "object") return "";
  let out = String(node.innerHTML || "");
  const kids = node.children || [];
  for (let i = 0; i < kids.length; i++) out += " " + textOf(kids[i]);
  return out;
}

check("buttons are exactly the seven $20 steps", bands.COST_BANDS.join("|") === BUTTONS.join("|"));
check("server filter list matches the buttons", filters.cost.slice().join("|") === BUTTONS.join("|"));
check("button labels are the seven steps with en dashes",
  BUTTONS.map(bands.displayLabel).join("|") === LABELS.join("|") &&
  LABELS.join("|").indexOf("-") === -1 &&
  LABELS[1].indexOf(EN) !== -1);

Object.keys(LEGACY).forEach(function (value) {
  check("stored " + value + " prints " + LEGACY[value], bands.displayLabel(value) === LEGACY[value]);
});
Object.keys(NEW_LABELS).forEach(function (value) {
  check("new " + value + " prints " + NEW_LABELS[value], bands.displayLabel(value) === NEW_LABELS[value]);
  const hit = buttonsFor(value);
  check("new " + value + " matches exactly one button", hit.length === 1 && hit[0] === value, hit.join(","));
  const viaServer = serverButtonsFor(value);
  check("new " + value + " server query is that same button",
    viaServer.join("|") === hit.join("|") && filters.storedCostsForBands([value]).join("|") === bands.storedCostsForBands([value]).join("|"),
    viaServer.join(","));
});

["Free", "$1-$10", "$20-$30", "$100 and under", "Over $100"].concat(BUTTONS).forEach(function (value) {
  const hit = buttonsFor(value);
  const viaServer = serverButtonsFor(value);
  check("stored " + value + " shows under at least one button", hit.length > 0, hit.join(","));
  check("stored " + value + " client and server pick the same buttons",
    viaServer.join("|") === hit.join("|") &&
    filters.costMatches(value, hit) === true &&
    (hit.length === 0 || filters.costMatches(value, [hit[0]]) === true),
    "client " + hit.join(",") + " server " + viaServer.join(","));
});

check("$20-$30 matches only $21-$40", buttonsFor("$20-$30").join("|") === "$21-$40");
check("$1-$10 matches only $1-$20", buttonsFor("$1-$10").join("|") === "$1-$20");
check("$100 and under matches $21-$40 through $81-$100",
  buttonsFor("$100 and under").join("|") === "$21-$40|$41-$60|$61-$80|$81-$100");
check("Free matches only Free", buttonsFor("Free").join() === "Free");
check("Over $100 matches only Over $100", buttonsFor("Over $100").join() === "Over $100");
check("no button selected matches everything", bands.costMatches("$20-$30", []) && bands.costMatches("$81-$100", []));

const t = loadApp({});
const costDef = t.FILTER_DEFS.filter(function (def) { return def.key === "cost"; })[0];
check("filter values stay the hyphen steps",
  !!costDef && costDef.options.join("|") === BUTTONS.join("|"));

const body = t.document.createElement("div");
const previousQuery = t.document.querySelector;
t.document.querySelector = function (sel) {
  if (sel === "#filter-body") return body;
  return previousQuery.apply(this, arguments);
};
t.renderFilterBody();
t.document.querySelector = previousQuery;

let budgetChips = [];
walk(body, function (node) {
  const kids = node.children || [];
  if (kids[0] && kids[0].innerHTML === "Budget" && kids[1]) budgetChips = kids[1].children || [];
});
const chipText = budgetChips.map(function (chip) { return chip.innerHTML; });
check("budget buttons print the en-dash labels",
  chipText.join("|") === LABELS.join("|"),
  chipText.join("|"));
check("budget buttons do not print hyphen ranges",
  chipText.join("|").indexOf("-$") === -1 && chipText.join("|").indexOf("$1-$10") === -1);

const legacyIdea = t.IDEAS_BY_ID[2];
const savedCost = legacyIdea.cost;
const savedUnit = legacyIdea.costUnit;
function shown(cost, unit) {
  legacyIdea.cost = cost;
  legacyIdea.costUnit = unit || null;
  const card = textOf(t.buildSwipeCard(legacyIdea, false, 1));
  const detail = textOf(t.buildDetailScreen(2));
  return { card: card, detail: detail, display: t.displayCost(legacyIdea) };
}
const oldCard = shown("$20-$30");
check("a card prints $21–$40 for a stored $20-$30",
  oldCard.display === "$21" + EN + "$40" &&
  oldCard.card.indexOf("$21" + EN + "$40") !== -1 &&
  oldCard.card.indexOf("$20-$30") === -1,
  oldCard.display);
check("detail prints $21–$40 for a stored $20-$30",
  oldCard.detail.indexOf("$21" + EN + "$40") !== -1 && oldCard.detail.indexOf("$20-$30") === -1);
const ten = shown("$1-$10");
check("a card and the detail print $1–$20 for a stored $1-$10",
  ten.display === "$1" + EN + "$20" &&
  ten.card.indexOf("$1-$10") === -1 && ten.detail.indexOf("$1-$10") === -1 &&
  ten.card.indexOf("$1" + EN + "$20") !== -1 && ten.detail.indexOf("$1" + EN + "$20") !== -1);
const wide = shown("$100 and under");
check("a card and the detail print Up to $100 for $100 and under",
  wide.display === "Up to $100" &&
  wide.card.indexOf("Up to $100") !== -1 && wide.detail.indexOf("Up to $100") !== -1 &&
  wide.card.indexOf("$100 and under") === -1 && wide.detail.indexOf("$100 and under") === -1);
const mid = shown("$41-$60", "per car");
check("a new band prints with an en dash and keeps per car",
  mid.display === "$41" + EN + "$60 per car" &&
  mid.card.indexOf("$41" + EN + "$60 per car") !== -1 &&
  mid.detail.indexOf("$41" + EN + "$60 per car") !== -1 &&
  mid.card.indexOf("$41-$60") === -1);
const freeCar = shown("Free", "per car");
check("Free per car stays Free", freeCar.display === "Free" && freeCar.card.indexOf("Free") !== -1);
legacyIdea.cost = savedCost;
legacyIdea.costUnit = savedUnit;

const low = Object.assign({}, t.state.filters, { cost: ["$1-$20"] });
const midFilter = Object.assign({}, t.state.filters, { cost: ["$21-$40"] });
const high = Object.assign({}, t.state.filters, { cost: ["$41-$60"] });
check("the app filter agrees $20-$30 is only $21-$40",
  t.matchesFilters({ cost: "$20-$30" }, midFilter) &&
  !t.matchesFilters({ cost: "$20-$30" }, low) &&
  !t.matchesFilters({ cost: "$20-$30" }, high));
check("the app filter agrees a new band matches only itself",
  t.matchesFilters({ cost: "$61-$80" }, Object.assign({}, t.state.filters, { cost: ["$61-$80"] })) &&
  !t.matchesFilters({ cost: "$61-$80" }, high) &&
  !t.matchesFilters({ cost: "$61-$80" }, low));

const form = textOf(t.buildIdeaSubmitSubpanel());
check("the idea form shows en-dash labels and submits hyphen values",
  LABELS.every(function (label) { return form.indexOf(label) !== -1; }) &&
  form.indexOf('value="$1-$20"') !== -1 &&
  form.indexOf('value="$21-$40"') !== -1 &&
  form.indexOf(">$1-$20<") === -1 &&
  form.indexOf(">$21-$40<") === -1);

const migration = fs.readFileSync(path.join(__dirname, "..", "db", "migrations", "019_cost_bands_20_rename.sql"), "utf8");
check("migration 019 still renames only $1-$10",
  /update public\.activities\s+set cost = '\$1-\$20'\s+where cost = '\$1-\$10'/i.test(migration) &&
  (migration.match(/update\s+public\.activities/gi) || []).length === 1);

module.exports = { pass: pass, fail: fail };
