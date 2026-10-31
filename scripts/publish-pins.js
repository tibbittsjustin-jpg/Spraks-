/* Write public/pins.js from confident rows in data/coords/utah.json.
   Lat, lng, and city only. The coordinate file itself is not served.
   Run from the repo root: node scripts/publish-pins.js */
"use strict";

const fs = require("fs");
const path = require("path");

const KNOWN = new Set(["confident", "area_based", "route_unpinned", "flagged", "pending"]);
const root = path.join(__dirname, "..");
const coords = JSON.parse(fs.readFileSync(path.join(root, "data", "coords", "utah.json"), "utf8"));
const pins = {};

Object.keys(coords).sort((a, b) => Number(a) - Number(b)).forEach(key => {
  const entry = coords[key];
  const lat = entry.lat;
  const lng = entry.lng;
  const has = typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng);
  const publish = KNOWN.has(entry.status) && has && (entry.status === "confident" || entry.locked === true);
  if (!publish) return;
  const row = { lat: lat, lng: lng };
  if (typeof entry.city === "string" && entry.city.trim()) row.city = entry.city.trim();
  pins[String(entry.id)] = row;
});

const header = `/* Confident place pins for the radius filter: lat, lng, and city only.
   Generated from data/coords/utah.json. The full coordinate file is not
   served. Ideas without a pin are omitted and stay in the deck. */
var IDEA_PINS = `;
fs.writeFileSync(path.join(root, "public", "pins.js"), header + JSON.stringify(pins) + ";\n");
console.log("wrote " + Object.keys(pins).length + " pins");
