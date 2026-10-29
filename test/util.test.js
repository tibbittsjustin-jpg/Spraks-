/* Pure helpers extracted from app.js. Required directly so a break here
   fails without booting the whole UI. A couple of checks also go through
   loadApp(), because the IIFE keeps same-named wrappers for call sites
   and the harness hook — those wrappers have to stay the real functions. */

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
  catch (e) { check("section ran without throwing", false, String(e.message).slice(0, 110)); }
}

section("escapeHtml", () => {
  check("null and undefined become empty", util.escapeHtml(null) === "" && util.escapeHtml(undefined) === "");
  check("escapes the five characters innerHTML cares about",
        util.escapeHtml(`a&b<c>d"e'f`) === "a&amp;b&lt;c&gt;d&quot;e&#39;f");
  check("leaves ordinary text alone", util.escapeHtml("Friday Night") === "Friday Night");
  check("stringifies numbers", util.escapeHtml(12) === "12");
});

section("calendar dates", () => {
  check("pads a single-digit month and day", util.localDateISO(new Date(2026, 0, 5)) === "2026-01-05");
  check("11:30pm stays on the local day", util.localDateISO(new Date(2026, 9, 14, 23, 30)) === "2026-10-14");
  check("omitted argument is today's local date", util.localDateISO() === util.localDateISO(new Date()));
  check("todayISO is the UTC day", util.todayISO() === new Date().toISOString().slice(0, 10));
  check("YYYY-MM-DD formats as that local calendar day",
        util.fmtDate("2026-01-05") === new Date(2026, 0, 5).toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" }));
  check("garbage is an empty string", util.fmtDate("nope") === "" && util.fmtDate("") === "");
  check("pad2", util.pad2(0) === "00" && util.pad2(9) === "09" && util.pad2(10) === "10");
});

section("hash and rng stay bit-stable", () => {
  // Cover art seeds and external-idea ids both call hashStr. A "cleanup"
  // of this loop would move every saved real place onto a different id.
  check("empty hash is 0", util.hashStr("") === 0);
  check("known short strings", util.hashStr("a") === 97 && util.hashStr("ab") === 3105 && util.hashStr("spark") === 109638365);
  const id = 9000000 + (Math.abs(util.hashStr("gp:ChIJ_AAA")) % 1000000);
  check("that key still lands on 9775047", id === 9775047, String(id));

  const rng = util.mulberry32(1);
  check("mulberry32(1) sequence",
        rng() === 0.6270739405881613 && rng() === 0.002735721180215478 && rng() === 0.5274470399599522);
  check("same seed restarts the sequence", util.mulberry32(1)() === 0.6270739405881613);
  check("seed 0 is its own sequence", util.mulberry32(0)() === 0.26642920868471265);
  const sample = util.mulberry32(0x12345678)();
  check("outputs sit in [0, 1)", sample >= 0 && sample < 1, String(sample));
});

section("app.js wrappers are these functions", () => {
  const app = loadApp({});
  const day = new Date(2026, 0, 5);
  check("localDateISO matches through the harness", app.localDateISO(day) === util.localDateISO(day));
  const idea = app.hydrateRealIdea({
    placeId:"ChIJ_AAA", title:"Sunset Ridge Trail Walk", placeName:"Sunset Ridge Trail",
    address:"1 Ridge Rd, Provo, UT", cost:"Free", setting:"Outdoor", vibe:["Chill"], food:false
  }, app.state.filters);
  check("saved-place id is unchanged", idea.id === 9775047, String(idea.id));
});

module.exports = { pass, fail };
