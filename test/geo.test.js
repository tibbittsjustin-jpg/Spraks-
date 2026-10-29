/* Validates data/coords/utah.json against data.js.
   The app does not read the coordinates file; this only checks the pin data. */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}

const VALID = new Set(["confident", "area_based", "route_unpinned", "flagged", "pending"]);
const UNPINNED = new Set(["area_based", "route_unpinned", "flagged", "pending"]);
const BB = {minLat:37, maxLat:42, minLng:-114.05, maxLng:-109.04};
const HAND = [1837, 1848, 1854, 1868, 1876, 1887, 1908];

function loadIdeas() {
  const src = fs.readFileSync(path.join(ROOT, "data.js"), "utf8");
  const marker = "const IDEAS_DATA = ";
  const lineEnd = src.indexOf("\n");
  const line = src.slice(marker.length, lineEnd).replace(/;\s*$/, "");
  return JSON.parse(line);
}

const ideas = loadIdeas();
const ids = new Set(ideas.map(i => i.id));
const byId = Object.fromEntries(ideas.map(i => [i.id, i]));
const coords = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "coords", "utah.json"), "utf8"));
const entries = Object.entries(coords);

check("coordinates file is an object keyed by idea id", coords && !Array.isArray(coords) && entries.length > 0, "entries " + entries.length);
check("retired Trafalga id 340 is not pinned", coords["340"] == null && !ids.has(340));

const badKey = [], badId = [], badStatus = [], badPin = [], badUnpinned = [];
for (const [key, e] of entries) {
  if (String(e.id) !== key) badKey.push(key);
  if (!ids.has(e.id)) badId.push(e.id);
  if (!VALID.has(e.status)) badStatus.push(e.id + ":" + e.status);
  if (e.status === "confident") {
    const ok = typeof e.lat === "number" && typeof e.lng === "number" &&
      e.lat >= BB.minLat && e.lat <= BB.maxLat && e.lng >= BB.minLng && e.lng <= BB.maxLng;
    if (!ok) badPin.push(e.id);
  } else if (UNPINNED.has(e.status)) {
    if (e.lat != null || e.lng != null) badUnpinned.push(e.id);
  }
}
check("object key matches the idea id", badKey.length === 0, badKey.slice(0, 8).join(","));
check("every coordinate id exists in data.js", badId.length === 0, badId.slice(0, 8).join(","));
check("statuses are confident, area_based, route_unpinned, flagged, or pending", badStatus.length === 0, badStatus.slice(0, 8).join(","));
check("pinned lat/lng fall inside Utah", badPin.length === 0, badPin.slice(0, 8).join(","));
check("unpinned statuses have null coordinates", badUnpinned.length === 0, badUnpinned.slice(0, 8).join(","));

for (const id of HAND) {
  const e = coords[String(id)];
  const url = e && typeof e.address_source === "string" && e.address_source.indexOf("http") === 0;
  check("#" + id + " is a locked manual pin with a source URL",
    !!e && e.locked === true && e.source === "manual" && url,
    e ? "locked=" + e.locked + " source=" + e.source : "missing");
}

const hatchet = coords["1854"];
check("#1854 is the Provo street address",
  !!hatchet && hatchet.status === "confident" && hatchet.address === "261 N University Ave, Provo, UT 84601" && hatchet.city === "Provo" && hatchet.state === "Utah",
  hatchet ? hatchet.status + " " + hatchet.address + " / " + hatchet.city : "missing");

const counts = {};
Object.values(coords).forEach(e => { counts[e.status] = (counts[e.status] || 0) + 1; });
const banned = Object.values(coords).filter(e => e.status === "out_of_state" || e.status === "retired");
check("no entry is out_of_state or retired", banned.length === 0, banned.map(e => e.id + ":" + e.status).slice(0, 8).join(","));
console.log("  idea count " + ideas.length);
console.log("  status counts " + JSON.stringify(counts));
const thinNotes = Object.values(coords).filter(e => e.status === "flagged" && !(e.notes && String(e.notes).trim()));
check("flagged entries keep a note and are not #1854", thinNotes.length === 0 && coords["1854"].status !== "flagged", thinNotes.map(e => e.id).join(","));

const axe = byId[1854];
check("#1854 copy does not say Heber",
  !!axe && !/heber/i.test(axe.title + " " + axe.description),
  axe ? axe.title : "missing");
const slate = byId[1876];
check("#1876 copy is indoor modern American at the Marriott",
  !!slate && slate.setting === "Indoor" &&
  /modern american/i.test(slate.description) && /marriott/i.test(slate.description) &&
  !/rooftop|mediterranean/i.test(slate.title + " " + slate.description),
  slate ? slate.title + " / " + slate.setting : "missing");

module.exports = { pass, fail };
