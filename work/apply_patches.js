/* Applies the three agent patch files to data.js.
 *
 * Every patch value is validated against the app's real vocabularies first —
 * a single typo in a tag would silently break filtering for that idea, so a
 * bad value aborts the whole run rather than getting written.
 *
 * Usage: node work/apply_patches.js [--dry]
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DRY = process.argv.indexOf("--dry") !== -1;

const SCENES = ["mountains","forest","water","snow","park","field","city","citynight","stage","cinema","kitchen","indoor","sunset","confetti"];
const DURATIONS = ["Quick (under 1 hr)","Short (1-2 hrs)","Half-day (2-5 hrs)","Full day","Overnight"];
const COSTS = ["Free","$1-$10","$20-$30","$100 and under","Over $100"];
const SETTINGS = ["Indoor","Outdoor","Both"];
const SEASONS = ["Spring","Summer","Fall","Winter"];
const TIMES = ["Morning","Afternoon","Evening","Night"];
const VIBES = ["Chill","Romantic","Active","Adventurous","Creative","Silly","Cozy","Spontaneous"];
const STAGES = ["First Date","Second/Third Date","Serious Relationship"];
const DATETYPES = ["Solo/Couple","Double Date","Group Date"];

// Motif names come from the drawing library itself, so a patch can never name
// a motif that has no drawing behind it.
const motifSrc = fs.readFileSync(path.join(ROOT, "public", "motifs.js"), "utf8");
let MOTIF_NAMES = [];
try {
  const sandbox = {};
  new Function("global", motifSrc + "\nglobal.__m = MOTIFS;")(sandbox);
  MOTIF_NAMES = Object.keys(sandbox.__m.M);
} catch (e) {
  console.error("could not load motifs.js to validate motif names: " + e.message);
  process.exit(1);
}

const ARRAY_FIELDS = { season: SEASONS, time: TIMES, vibe: VIBES, stage: STAGES, dateType: DATETYPES };
const STRING_FIELDS = { duration: DURATIONS, cost: COSTS, setting: SETTINGS, scene: SCENES, motif: MOTIF_NAMES };

const errors = [];
function err(file, line, msg) { errors.push(file + ":" + line + " — " + msg); }

function readPatch(file) {
  const full = path.join(__dirname, file);
  if (!fs.existsSync(full)) { console.log("(skip, not found: " + file + ")"); return []; }
  const out = [];
  fs.readFileSync(full, "utf8").split("\n").forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;
    let obj;
    try { obj = JSON.parse(line); }
    catch (e) { err(file, idx + 1, "not valid JSON"); return; }
    if (typeof obj.id !== "number") { err(file, idx + 1, "missing numeric id"); return; }
    out.push({ obj: obj, file: file, line: idx + 1 });
  });
  return out;
}

function validate(entry) {
  const o = entry.obj;
  Object.keys(o).forEach(k => {
    if (k === "id") return;
    if (STRING_FIELDS[k]) {
      if (typeof o[k] !== "string" || STRING_FIELDS[k].indexOf(o[k]) === -1)
        err(entry.file, entry.line, "id " + o.id + " bad " + k + ": " + JSON.stringify(o[k]));
    } else if (ARRAY_FIELDS[k]) {
      if (!Array.isArray(o[k]) || o[k].length === 0)
        err(entry.file, entry.line, "id " + o.id + " " + k + " must be a non-empty array");
      else o[k].forEach(v => {
        if (ARRAY_FIELDS[k].indexOf(v) === -1)
          err(entry.file, entry.line, "id " + o.id + " bad " + k + " value: " + JSON.stringify(v));
      });
    } else if (k === "food") {
      if (typeof o[k] !== "boolean") err(entry.file, entry.line, "id " + o.id + " food must be boolean");
    } else if (k === "title" || k === "description") {
      if (typeof o[k] !== "string" || !o[k].trim())
        err(entry.file, entry.line, "id " + o.id + " empty " + k);
      else if (k === "title" && o[k].trim().split(/\s+/).length > 7)
        err(entry.file, entry.line, "id " + o.id + " title over 7 words: " + JSON.stringify(o[k]));
    } else {
      err(entry.file, entry.line, "id " + o.id + " unexpected field: " + k);
    }
  });
}

// ---- Load data.js, isolating the IDEAS_DATA array from the rest of the file ----
const dataPath = path.join(ROOT, "public", "data.js");
const src = fs.readFileSync(dataPath, "utf8");
const start = src.indexOf("[");
let depth = 0, end = -1;
for (let i = start; i < src.length; i++) {
  if (src[i] === "[") depth++;
  else if (src[i] === "]") { depth--; if (depth === 0) { end = i; break; } }
}
const ideas = JSON.parse(src.slice(start, end + 1));
const byId = {};
ideas.forEach(i => byId[i.id] = i);

// ---- Read + validate all patches before touching anything ----
const patches = [].concat(
  readPatch("patch_scene.jsonl"),
  readPatch("patch_motif.jsonl"),
  // applied after patch_motif so the hand-drawn gap fillers win
  readPatch("patch_motif_gapfill.jsonl"),
  readPatch("patch_filters.jsonl"),
  readPatch("patch_text.jsonl")
);
patches.forEach(validate);
patches.forEach(p => { if (!byId[p.obj.id]) err(p.file, p.line, "unknown idea id " + p.obj.id); });

if (errors.length) {
  console.error("VALIDATION FAILED — " + errors.length + " problem(s); nothing was written:\n");
  errors.slice(0, 40).forEach(e => console.error("  " + e));
  if (errors.length > 40) console.error("  ...and " + (errors.length - 40) + " more");
  process.exit(1);
}

// ---- Apply ----
const changedFields = {};
let touched = 0;
const seenPerFile = {};
patches.forEach(p => {
  seenPerFile[p.file] = (seenPerFile[p.file] || 0) + 1;
  const idea = byId[p.obj.id];
  let didChange = false;
  Object.keys(p.obj).forEach(k => {
    if (k === "id") return;
    const before = JSON.stringify(idea[k]);
    const after = JSON.stringify(p.obj[k]);
    if (before !== after) {
      idea[k] = p.obj[k];
      changedFields[k] = (changedFields[k] || 0) + 1;
      didChange = true;
    }
  });
  if (didChange) touched++;
});

console.log("patch lines per file:", seenPerFile);
console.log("ideas actually modified:", touched);
console.log("field change counts:", changedFields);

if (DRY) { console.log("\n--dry: data.js NOT written"); process.exit(0); }

// Keep the pristine pre-agent copy: only written once, so re-running this
// script can never overwrite the original with already-patched data.
const pristine = path.join(__dirname, "data.js.before_agents");
if (!fs.existsSync(pristine)) fs.copyFileSync(dataPath, pristine);
fs.copyFileSync(dataPath, path.join(__dirname, "data.js.prev"));
const out = src.slice(0, start) + JSON.stringify(ideas) + src.slice(end + 1);
fs.writeFileSync(dataPath, out);
console.log("\ndata.js written (backup at work/data.js.before_agents), new size:", out.length);
