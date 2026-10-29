/* #plan=v1 links carry a plan name, a date, and built-in idea ids.
   Addresses, coordinates, location, and saved place or event cards stay out. */

const fs = require("fs");
const path = require("path");
const { loadApp } = require("./harness.js");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
async function section(title, fn) {
  console.log("\n" + title);
  try { await fn(); }
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 400)); }
}

function between(src, start, end) {
  const i = src.indexOf(start);
  const j = src.indexOf(end, i + start.length);
  if (i < 0 || j < 0) throw new Error("markers not found: " + start);
  return src.slice(i, j);
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function wireJson(payload) {
  const body = payload.slice(3);
  const pad = body.length % 4 === 0 ? "" : "=".repeat(4 - (body.length % 4));
  const b64 = body.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

function keysDeep(value, out) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(function(item) { keysDeep(item, out); });
    return;
  }
  Object.keys(value).forEach(function(key) {
    out.push(key);
    keysDeep(value[key], out);
  });
}

const SECRET_ADDRESS = "742 Evergreen Terrace Secret";
const SECRET_URL = "https://maps.example/secret-place";
const SECRET_TITLE = "Secret Cafe Title";
const SECRET_LAT = "40.768211";
const SECRET_LNG = "-111.893921";
const FRIEND = "Private Friend Emma";
const PROFILE = "Private Profile Name";
const EVENT_URL = "https://tickets.example/secret-event";

function leaks(text) {
  const secrets = [SECRET_ADDRESS, SECRET_URL, SECRET_TITLE, SECRET_LAT, SECRET_LNG, FRIEND, PROFILE, EVENT_URL, "99 Hidden Venue"];
  return secrets.filter(function(secret) { return text.indexOf(secret) !== -1; });
}

async function main() {
  const app = loadApp({});
  const appSrc = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");

  check("builtin ideas 2 and 3 exist", !!(app.IDEAS_BY_ID[2] && app.IDEAS_BY_ID[3]));

  const placeId = 9000001;
  const eventId = 9000002;
  app.state.profile.name = PROFILE;
  app.state.location = { lat: Number(SECRET_LAT), lng: Number(SECRET_LNG), grantedAt: "2026-01-01" };
  app.state.realIdeas[placeId] = {
    id: placeId,
    title: SECRET_TITLE,
    address: SECRET_ADDRESS,
    lat: Number(SECRET_LAT),
    lng: Number(SECRET_LNG),
    latitude: Number(SECRET_LAT),
    longitude: Number(SECRET_LNG),
    coordinates: [Number(SECRET_LAT), Number(SECRET_LNG)],
    location: { lat: Number(SECRET_LAT), lng: Number(SECRET_LNG) },
    url: SECRET_URL,
    mapsUrl: SECRET_URL
  };
  app.state.realIdeas[eventId] = {
    id: eventId,
    isEvent: true,
    title: "Secret Event Night",
    address: "99 Hidden Venue",
    lat: 41.01,
    lng: -112.02,
    url: EVENT_URL,
    ticketUrl: EVENT_URL,
    date: "2026-07-01"
  };

  const plan = {
    id: "plan-secret",
    name: "Friday Night",
    date: "2026-06-05",
    createdAt: "2026-01-01",
    ideaIds: [2, placeId, 3, eventId, 2],
    friendPicks: [{ id: "pick1", friendName: FRIEND, avatarEmoji: "a", avatarColor: "#fff", ideaId: 2 }],
    address: SECRET_ADDRESS,
    lat: Number(SECRET_LAT),
    lng: Number(SECRET_LNG),
    location: { lat: Number(SECRET_LAT), lng: Number(SECRET_LNG) },
    coordinates: [Number(SECRET_LAT), Number(SECRET_LNG)],
    profile: { name: PROFILE }
  };

  await section("round trip keeps name, date, and built-in ids", () => {
    const payload = app.encodePlanShare(plan);
    check("payload is v1 base64url", typeof payload === "string" && /^v1\.[A-Za-z0-9_-]+$/.test(payload), payload);
    check("payload stays within the length cap", payload.length <= app.PLAN_SHARE_MAX_CHARS, String(payload.length));
    check("encode is stable", app.encodePlanShare(plan) === payload);
    const wire = wireJson(payload);
    check("wire keys are only n, d, i", Object.keys(wire).sort().join(",") === "d,i,n", Object.keys(wire).join(","));
    check("wire name and date", wire.n === "Friday Night" && wire.d === "2026-06-05");
    check("wire ids are the built-ins, in order, once", JSON.stringify(wire.i) === "[2,3]", JSON.stringify(wire.i));
    check("wire ids are numbers", wire.i.every(function(id) { return typeof id === "number"; }));
    const decoded = app.decodePlanShare(payload);
    check("decoded name and date", decoded && decoded.name === "Friday Night" && decoded.date === "2026-06-05");
    check("decoded idea ids", decoded && JSON.stringify(decoded.ideaIds) === "[2,3]", JSON.stringify(decoded && decoded.ideaIds));
    check("decoded keys are name, date, ideaIds", decoded && Object.keys(decoded).sort().join(",") === "date,ideaIds,name",
      decoded && Object.keys(decoded).join(","));
    const again = app.encodePlanShare({ name: decoded.name, date: decoded.date, ideaIds: decoded.ideaIds });
    check("decoded plan encodes back to the same payload", again === payload);
  });

  await section("unicode name and empty date round trip", () => {
    const named = { name: "Café night 🎉", date: "", ideaIds: [2] };
    const payload = app.encodePlanShare(named);
    const decoded = app.decodePlanShare(payload);
    check("unicode name survives", decoded && decoded.name === "Café night 🎉", decoded && decoded.name);
    check("empty date survives", decoded && decoded.date === "" && JSON.stringify(decoded.ideaIds) === "[2]");
    const longName = "N".repeat(80);
    const clipped = app.decodePlanShare(app.encodePlanShare({ name: longName, date: "2026-01-02", ideaIds: [3] }));
    check("long name is clipped", clipped && clipped.name === "N".repeat(60) && clipped.date === "2026-01-02");
  });

  await section("encoding never emits place, location, or snapshot fields", () => {
    const payload = app.encodePlanShare(plan);
    const wire = wireJson(payload);
    const keys = [];
    keysDeep(wire, keys);
    check("wire has no nested objects", keys.sort().join(",") === "d,i,n", keys.join(","));
    const leaked = leaks(JSON.stringify(wire));
    check("wire text has no address, coordinates, urls, or profile", leaked.length === 0, leaked.join(" | "));
    const decoded = app.decodePlanShare(payload);
    const decodedLeak = leaks(JSON.stringify(decoded));
    check("decoded plan has no address, coordinates, urls, or profile", decodedLeak.length === 0, decodedLeak.join(" | "));
    check("decoded plan has no extra fields", decoded.address === undefined && decoded.lat === undefined &&
      decoded.location === undefined && decoded.s === undefined && decoded.friendPicks === undefined);
    check("real idea ids are left out", decoded.ideaIds.indexOf(placeId) === -1 && decoded.ideaIds.indexOf(eventId) === -1);
    check("two saved places are counted", app.planShareOmittedCount(plan) === 2, String(app.planShareOmittedCount(plan)));
    check("omission note for two", app.planShareOmissionNote(2) === "2 saved places aren't included in shared links");
    check("omission note for one", app.planShareOmissionNote(1) === "1 saved place isn't included in shared links");
    check("no omission note when nothing is left out", app.planShareOmissionNote(0) === "");
    const onlyBuiltIn = { name: "Day", date: "2026-04-01", ideaIds: [2, 3] };
    check("built-in plan omits nothing", app.planShareOmittedCount(onlyBuiltIn) === 0);
    const onePlace = { name: "Day", date: "", ideaIds: [2, placeId] };
    check("one saved place is counted", app.planShareOmittedCount(onePlace) === 1);
  });

  await section("incoming extra fields are dropped", () => {
    const raw = {
      n: "Friday",
      d: "2026-06-05",
      i: [2, placeId, { id: 3, address: "9 Secret Rd", lat: Number(SECRET_LAT) }],
      address: "9 Secret Rd",
      lat: Number(SECRET_LAT),
      lng: Number(SECRET_LNG),
      location: { lat: Number(SECRET_LAT), lng: Number(SECRET_LNG) },
      s: { "9000001": { t: "Secret Cafe", a: "9 Secret Rd", u: "https://maps.example/s" } }
    };
    const payload = "v1." + b64url(raw);
    check("crafted payload is under the cap", payload.length <= app.PLAN_SHARE_MAX_CHARS, String(payload.length));
    let decoded = null;
    let threw = false;
    try { decoded = app.decodePlanShare(payload); }
    catch (e) { threw = true; }
    check("decode does not throw", threw === false);
    check("name and date kept", decoded && decoded.name === "Friday" && decoded.date === "2026-06-05");
    check("built-in ids kept and real id dropped", decoded && JSON.stringify(decoded.ideaIds) === "[2,3]",
      JSON.stringify(decoded && decoded.ideaIds));
    const text = JSON.stringify(decoded);
    const incomingSecrets = ["9 Secret Rd", "Secret Cafe", "maps.example", SECRET_LAT, SECRET_LNG];
    const leaked = incomingSecrets.filter(function(secret) { return text.indexOf(secret) !== -1; });
    check("address, coordinates, snapshot, and profile are gone", leaked.length === 0, leaked.join(" | "));
    check("result has no extra keys", decoded && Object.keys(decoded).sort().join(",") === "date,ideaIds,name");
  });

  await section("malformed, tampered, oversized, and unknown versions", () => {
    const good = app.encodePlanShare({ name: "Friday Night", date: "2026-06-05", ideaIds: [2, 3] });
    const samples = [null, undefined, 0, {}, [], "", "v1", "v1.", "v1.!!!", "v1.abc", "nope", good.slice(3)];
    samples.forEach(function(sample) {
      let threw = false;
      let result = "unset";
      try { result = app.decodePlanShare(sample); }
      catch (e) { threw = true; }
      const label = sample === undefined ? "undefined" : JSON.stringify(sample).slice(0, 40);
      check("malformed decode is null (" + label + ")", threw === false && result === null);
    });

    let threw = false;
    try { check("encode of null is null", app.encodePlanShare(null) === null); }
    catch (e) { threw = true; }
    check("encode of null does not throw", threw === false);
    threw = false;
    try { app.encodePlanShare(plan); }
    catch (e) { threw = true; }
    check("encode of a plan with real ideas does not throw", threw === false);

    const broken = good.slice(0, 4) + "!" + good.slice(5);
    check("tampered character is rejected", app.decodePlanShare(broken) === null, broken);
    check("truncated payload is rejected", app.decodePlanShare(good.slice(0, good.length - 2)) === null);
    check("standard base64 alphabet is rejected", app.decodePlanShare(good.slice(0, 4) + "+" + good.slice(5)) === null);

    check("v2 prefix is rejected", app.decodePlanShare("v2." + good.slice(3)) === null);
    check("uppercase prefix is rejected", app.decodePlanShare("V1." + good.slice(3)) === null);
    check("missing dot is rejected", app.decodePlanShare("v1" + good.slice(3)) === null);
    check("v1 payload itself starts with v1.", good.indexOf("v1.") === 0);

    const rawBad = "v1." + Buffer.from("{", "utf8").toString("base64").replace(/=+$/g, "");
    check("truncated json is rejected", app.decodePlanShare(rawBad) === null);
    check("wrong name type is rejected", app.decodePlanShare("v1." + b64url({ n: 1, d: "", i: [2] })) === null);
    check("wrong date is rejected", app.decodePlanShare("v1." + b64url({ n: "Ok", d: "tomorrow", i: [2] })) === null);
    check("idea list must be an array", app.decodePlanShare("v1." + b64url({ n: "Ok", d: "", i: "2" })) === null);
    check("bad idea entry is rejected", app.decodePlanShare("v1." + b64url({ n: "Ok", d: "", i: [2, "nope"] })) === null);

    const huge = "v1." + b64url({ n: "A".repeat(2000), d: "", i: [2] });
    check("oversized payload is over the cap", huge.length > app.PLAN_SHARE_MAX_CHARS);
    let hugeResult = "unset";
    threw = false;
    try { hugeResult = app.decodePlanShare(huge); }
    catch (e) { threw = true; }
    check("oversized payload is null and does not throw", threw === false && hugeResult === null);
    threw = false;
    try { hugeResult = app.decodePlanShare("v1." + "A".repeat(app.PLAN_SHARE_MAX_CHARS)); }
    catch (e) { threw = true; }
    check("long garbage is null and does not throw", threw === false && hugeResult === null);
  });

  await section("share link and plan UI", () => {
    app.window.location.origin = "https://dates.example";
    const url = app.planShareUrl(plan);
    check("link uses the current origin and #plan=", url.indexOf("https://dates.example/#plan=") === 0, url && url.slice(0, 80));
    const decoded = app.decodePlanShare(url.split("#plan=")[1]);
    check("link payload decodes to the built-in plan", decoded && decoded.name === "Friday Night" && JSON.stringify(decoded.ideaIds) === "[2,3]");
    const leaked = leaks(url);
    check("link text has no address or coordinates", leaked.length === 0, leaked.join(" | "));

    const linkUi = between(appSrc, "/* ---------- Plan link (#plan=v1.<base64url>) ----------", "/* ---------- Saved / Done screens ---------- */");
    const bucket = between(appSrc, "function buildSavedBucketScreen", "function removeSavedIdea");
    check("plan screen has Share plan", bucket.indexOf("Share plan") !== -1 && bucket.indexOf("openPlanLinkOverlay(plan.id)") !== -1);
    check("share sheet tells the sharer what was left out", linkUi.indexOf("planShareOmissionNote(planShareOmittedCount(plan))") !== -1);
    check("omission note is shown before copy", linkUi.indexOf("planShareOmissionNote") < linkUi.indexOf("presentCopy("));
    check("copy uses presentCopy", linkUi.indexOf("presentCopy(planShareUrl(plan))") !== -1);
    check("share uses presentShare", linkUi.indexOf("presentShare(planLinkShareData(plan))") !== -1);
    check("qr uses the invite generator", linkUi.indexOf('qrcode(0, "M")') !== -1 && linkUi.indexOf("createSvgTag({ cellSize: 5, margin: 2 })") !== -1);
    const bootAt = appSrc.indexOf("function boot(){");
    const boot = appSrc.slice(bootAt, appSrc.indexOf("\n  boot();\n", bootAt));
    check("opening a plan link does nothing on boot", boot.indexOf("decodePlanShare") === -1 && boot.indexOf("#plan") === -1);
  });

  return { pass: pass, fail: fail };
}

module.exports = main();
