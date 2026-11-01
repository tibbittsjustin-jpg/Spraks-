/* Personal ratings and one-line recaps on done rows, plus the Done
   list order. Photo bytes stay out of localStorage; the card only keeps
   a key. */

const fs = require("fs");
const path = require("path");
const util = require("../public/util.js");
const { loadApp } = require("./harness.js");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
function section(title, fn) {
  console.log("\n" + title);
  try { fn(); }
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 500)); }
}

function walk(node, fn) {
  if (!node) return;
  fn(node);
  (node.children || []).forEach(child => walk(child, fn));
}
function findAll(node, pred) {
  const out = [];
  walk(node, n => { if (pred(n)) out.push(n); });
  return out;
}
function textOf(node) {
  if (!node) return "";
  let out = node.innerHTML || "";
  (node.children || []).forEach(child => { out += "\n" + textOf(child); });
  return out;
}
function attr(node, name) {
  return node && node.getAttribute ? node.getAttribute(name) : null;
}

const profile = { name: "A", gender: "Woman", photo: null, ageConfirmedAt: "2026-01-15T00:00:00.000Z" };

function storeWith(doneIds) {
  return {
    spark_state_v1: JSON.stringify({
      onboarded: true,
      hasSeenTutorial: true,
      profile: profile,
      somedayIds: [],
      doneIds: doneIds,
      settings: { autoDarkMode: false }
    })
  };
}

section("rating and recap normalization", () => {
  check("only whole stars from 1 to 5",
    util.normalizeRating(1) === 1 && util.normalizeRating("5") === 5 &&
    util.normalizeRating(0) === null && util.normalizeRating(6) === null &&
    util.normalizeRating(4.5) === null && util.normalizeRating("nope") === null);
  check("recap is one line, trimmed, and capped at 120",
    util.normalizeRecap("  hello\nthere  ") === "hello there" &&
    util.normalizeRecap("x".repeat(150)).length === 120 &&
    util.normalizeRecap(null) === "");
  const longEmoji = "👍".repeat(130);
  check("the cap counts characters, not UTF-16 halves",
    Array.from(util.normalizeRecap(longEmoji)).length === 120);

  const kept = util.migrateDoneEntry({
    id: 2, date: "2026-01-01", rating: "4", recap: "  snow\r\nday  ",
    note: "keep-private", photoKey: "  pic-1  "
  });
  check("migration keeps extra fields and coerces a valid rating",
    kept.id === 2 && kept.date === "2026-01-01" && kept.rating === 4 &&
    kept.recap === "snow day" && kept.note === "keep-private" && kept.photoKey === "pic-1");
  const plain = { id: 3, date: "2026-02-01" };
  const migratedPlain = util.migrateDoneEntry(plain);
  check("an older done row stays id and date",
    JSON.stringify(migratedPlain) === JSON.stringify(plain));
  const invalid = util.migrateDoneEntry({ id: 8, date: "2026-03-01", rating: 9, recap: "   " });
  check("an invalid rating and a blank recap are not stored",
    invalid.rating === undefined && invalid.recap === undefined && invalid.id === 8);

  const row = { id: 2, date: "2026-01-01", note: "secret" };
  const denied = util.applyDoneRecap(row, { rating: null, recap: "should not stick", photoKey: "nope" });
  check("a recap cannot be saved without a rating",
    denied.ok === false && denied.error === "rating" &&
    row.recap === undefined && row.photoKey === undefined && row.note === "secret");
  const blob = { byteLength: 99999 };
  const saved = util.applyDoneRecap(row, { rating: 3, recap: "Nice\nday", photoKey: "k1", blob: blob, photo: "data:image/jpeg;base64,AAAA" });
  check("a rated save keeps the recap and the photo key, not the bytes",
    saved.ok === true && row.rating === 3 && row.recap === "Nice day" &&
    row.photoKey === "k1" && row.blob === undefined && row.photo === undefined && row.note === "secret");
  util.applyDoneRecap(row, { rating: 3, recap: "   ", removePhoto: true });
  check("clearing the recap and the photo leaves the rating",
    row.rating === 3 && row.recap === undefined && row.photoKey === undefined);
});

section("done list sort", () => {
  const rows = [
    { id: 1, date: "2026-01-01", rating: 3 },
    { id: 2, date: "2026-06-01", rating: 5 },
    { id: 3, date: "2026-05-01", rating: 5 },
    { id: 4, date: "2026-07-01" },
    { id: 5, date: "2026-01-02" },
    { id: 6, date: "2026-06-01", rating: 5 }
  ];
  const order = util.sortedDoneEntries(rows).map(r => r.id);
  check("highest rating first, then most recently done, unrated last",
    order.join(",") === "2,6,3,1,4,5", order.join(","));
  check("a full tie keeps the original order",
    util.sortedDoneEntries(rows).filter(r => r.rating === 5 && r.date === "2026-06-01").map(r => r.id).join(",") === "2,6");
});

section("photo long edge", () => {
  check("a wide photo scales the long edge to 1080",
    JSON.stringify(util.fitLongEdge(2000, 1000)) === JSON.stringify({ width: 1080, height: 540 }));
  check("a tall photo scales the long edge to 1080",
    JSON.stringify(util.fitLongEdge(1000, 2000)) === JSON.stringify({ width: 540, height: 1080 }));
  check("a smaller photo keeps its size",
    JSON.stringify(util.fitLongEdge(800, 600)) === JSON.stringify({ width: 800, height: 600 }));
  check("a square at the cap stays 1080",
    JSON.stringify(util.fitLongEdge(1080, 1080)) === JSON.stringify({ width: 1080, height: 1080 }));
  check("garbage dimensions are refused", util.fitLongEdge(0, 400) === null && util.fitLongEdge(-1, 20) === null);
});

section("star keys", () => {
  check("arrows move within 1 to 5 and start at 1",
    util.moveStarRating(null, "ArrowRight") === 1 &&
    util.moveStarRating(null, "ArrowLeft") === 1 &&
    util.moveStarRating(3, "ArrowRight") === 4 &&
    util.moveStarRating(3, "ArrowLeft") === 2 &&
    util.moveStarRating(5, "ArrowRight") === 5 &&
    util.moveStarRating(1, "Home") === 1 &&
    util.moveStarRating(2, "End") === 5 &&
    util.moveStarRating(1, "4") === 4);
  check("an unrelated key leaves the rating alone",
    util.moveStarRating(2, "a") === 2 && util.moveStarRating(null, "Enter") === null);
});

section("stored done rows migrate without dropping notes", () => {
  const t = loadApp(storeWith([
    { id: 2, date: "2026-06-01", rating: "5", recap: "  Quiet\ntrail  ", note: "keep-private", photoKey: " done-2 " },
    { id: 8, date: "2026-05-01", rating: 9, recap: "   " },
    { id: 3, date: "2026-04-02" }
  ]));
  const byId = {};
  t.state.doneIds.forEach(row => { byId[row.id] = row; });
  check("a string rating and a multiline recap are cleaned up",
    byId[2].rating === 5 && byId[2].recap === "Quiet trail" && byId[2].photoKey === "done-2");
  check("a private note on the row is still there", byId[2].note === "keep-private");
  check("a bad rating is dropped and the date remains",
    byId[8].rating === undefined && byId[8].date === "2026-05-01" && byId[8].recap === undefined);
  check("an unrated older row is unchanged",
    byId[3].rating === undefined && byId[3].date === "2026-04-02");
});

section("saving a recap requires stars and ignores image bytes", () => {
  const t = loadApp(storeWith([{ id: 2, date: "2026-06-01", note: "keep-private" }]));
  const denied = t.commitDoneRecap(2, { rating: null, recap: "no stars", photo: "data:image/jpeg;base64,AAAA" });
  check("skipping the rating leaves the row done but unrated",
    denied.ok === false && t.state.doneIds[0].recap === undefined && t.state.doneIds[0].date === "2026-06-01");
  const blob = { type: "image/jpeg", size: 4000 };
  const saved = t.commitDoneRecap(2, { rating: 4, recap: "Icy\nwalk", photoKey: "done-2-1", blob: blob });
  check("stars, a one-line recap, and a photo key are stored",
    saved.ok === true && t.state.doneIds[0].rating === 4 &&
    t.state.doneIds[0].recap === "Icy walk" && t.state.doneIds[0].photoKey === "done-2-1");
  const raw = JSON.stringify(t.state);
  check("the saved state has no image payload",
    raw.indexOf("data:image") === -1 && raw.indexOf("base64") === -1 && t.state.doneIds[0].blob === undefined);
  check("the private note is still on the row", t.state.doneIds[0].note === "keep-private");
});

section("Done cards show stars, a photo, the recap, and Rate this", () => {
  const doneIds = [
    { id: 8, date: "2026-05-01", rating: 5, recap: "Camp was cold", photoKey: "camp-photo" },
    { id: 2, date: "2026-06-01", rating: 5, recap: "Quiet trail" },
    { id: 3, date: "2026-04-01", rating: 2, recap: "Short and silly" },
    { id: 5, date: "2026-07-01" }
  ];
  const t = loadApp(storeWith(doneIds));
  t.ui.savedBucket = { type: "done" };
  const screens = [
    ["Saved Done folder", t.buildSavedScreen()],
    ["Done screen", t.buildDoneScreen()],
    ["profile Done list", t.buildDoneSubpanel()]
  ];
  screens.forEach(([name, node]) => {
    const html = textOf(node);
    const quiet = html.indexOf("Quiet trail");
    const camp = html.indexOf("Camp was cold");
    const silly = html.indexOf("Short and silly");
    const kite = html.indexOf("Get Pulled by a Snow Kite");
    check(name + " sorts five stars by most recent, then lower, then unrated",
      quiet !== -1 && camp !== -1 && silly !== -1 && kite !== -1 &&
      quiet < camp && camp < silly && silly < kite,
      [quiet, camp, silly, kite].join(","));
    check(name + " shows Rate this on the unrated card", html.indexOf("Rate this") !== -1);
    const stars = findAll(node, n => attr(n, "aria-label") === "Rated 5 out of 5 stars");
    check(name + " labels the star rating", stars.length >= 1);
    const photo = findAll(node, n => attr(n, "data-photo-key") === "camp-photo");
    check(name + " keeps a thumbnail slot for the photo key", photo.length === 1 && (photo[0].className || "").indexOf("done-user-thumb") !== -1);
    const edit = findAll(node, n => (n.className || "").indexOf("done-rate-btn") !== -1 && n.innerHTML === "Edit");
    check(name + " offers an Edit button with a label",
      edit.length >= 1 && attr(edit[0], "aria-label") === "Edit rating, photo, and recap");
  });

  const favorite = textOf(t.buildSavedCard(t.IDEAS_BY_ID[2]));
  check("a saved idea that is not done has no rating prompt", favorite.indexOf("Rate this") === -1);
});

section("the rating sheet is keyboard operable and requires stars", () => {
  const t = loadApp(storeWith([{ id: 2, date: "2026-06-01" }]));
  const fresh = t.buildDoneRecapForm({ mode: "new", rating: null, recap: "", photoKey: "" });
  const stars = findAll(fresh, n => (n.className || "").indexOf("star-btn") !== -1);
  check("five star buttons are radios with labels",
    stars.length === 5 &&
    stars.map(s => attr(s, "aria-label")).join("|") === "1 star|2 stars|3 stars|4 stars|5 stars" &&
    stars.every(s => attr(s, "role") === "radio"));
  check("the first star is in the tab order when nothing is picked",
    attr(stars[0], "tabindex") === "0" && attr(stars[1], "tabindex") === "-1");
  const save = findAll(fresh, n => (n.className || "").indexOf("done-recap-save") !== -1)[0];
  const skip = findAll(fresh, n => (n.className || "").indexOf("done-recap-skip") !== -1)[0];
  check("Save stays disabled until a rating is chosen",
    !!save && (save.disabled === true || attr(save, "disabled") != null));
  check("a new recap can be skipped", !!skip && skip.innerHTML === "Skip for now");
  const file = findAll(fresh, n => attr(n, "aria-label") === "Add a photo")[0];
  check("the photo control accepts an image and is labeled",
    !!file && attr(file, "accept") === "image/*");
  const input = findAll(fresh, n => n.id === "done-recap-input")[0];
  check("the recap field is a single line of 120 characters",
    !!input && (input.maxLength === 120 || attr(input, "maxlength") === "120"));
  check("the sheet mentions Jaderoo", textOf(fresh).indexOf("Jaderoo") !== -1);

  const editing = t.buildDoneRecapForm({ mode: "edit", rating: 4, recap: "Already wrote this", photoKey: "p" });
  const editStars = findAll(editing, n => (n.className || "").indexOf("star-btn") !== -1);
  const editSave = findAll(editing, n => (n.className || "").indexOf("done-recap-save") !== -1)[0];
  const cancel = findAll(editing, n => (n.className || "").indexOf("done-recap-skip") !== -1)[0];
  check("an existing rating fills the stars up to that number",
    editStars.map(s => (s.className || "").indexOf("is-on") !== -1).join(",") === "true,true,true,true,false");
  check("the chosen star is the checked radio",
    attr(editStars[3], "aria-checked") === "true" && attr(editStars[2], "aria-checked") === "false");
  check("Save is available once a rating exists",
    !!editSave && editSave.disabled === false && attr(editSave, "disabled") == null);
  check("editing can be cancelled", !!cancel && cancel.innerHTML === "Cancel");
});

section("photos are re-encoded JPEGs in IndexedDB, not localStorage", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const start = src.indexOf("function downscaleImageFile");
  const end = src.indexOf("function findDoneEntry");
  const fn = src.slice(start, end);
  check("the photo is drawn to a canvas and exported as JPEG",
    fn.indexOf("drawImage") !== -1 && fn.indexOf("toBlob") !== -1 && fn.indexOf("image/jpeg") !== -1);
  check("the original file is not what gets stored",
    fn.indexOf("readAsDataURL") === -1 && fn.indexOf(".put(file") === -1);
  check("photo bytes go to IndexedDB under a Jaderoo database name",
    src.indexOf('DONE_PHOTO_DB = "jaderoo-done-photos"') !== -1 &&
    src.indexOf("indexedDB") !== -1);
  const keydown = src.indexOf("SparkUtil.moveStarRating");
  check("the sheet uses the star key helper", keydown !== -1);
});

const result = { pass: pass, fail: fail };
module.exports = result;
