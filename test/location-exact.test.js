/* Approximate by default, exact only after a just-in-time confirm.
   The choice is remembered on this device. A saved fix is stale until a
   new request settles. The radius filters with or without Local.
   Activities requests carry the rounded pair only. */
"use strict";

const fs = require("fs");
const path = require("path");
const { loadApp } = require("./harness");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
function section(title, fn) {
  console.log("\n" + title);
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.catch(e => {
        check("section ran without throwing", false, String(e.stack || e.message).slice(0, 500));
      });
    }
  } catch (e) {
    check("section ran without throwing", false, String(e.stack || e.message).slice(0, 500));
  }
}

const KEY = "spark_state_v1";
const PRECISE_LAT = 40.233843;
const PRECISE_LNG = -111.658531;

function installGeo(t) {
  const calls = [];
  const api = {
    calls: calls,
    getCurrentPosition(success, error, options) {
      calls.push({ success: success, error: error, options: options });
    }
  };
  t.navigator.geolocation = api;
  return api;
}
function blob(node) {
  const acc = [];
  (function walk(n) {
    if (!n || typeof n !== "object") return;
    acc.push(n);
    (n.children || []).forEach(walk);
  })(node);
  return acc.map(n => [n.className, n.innerHTML, n.textContent, n.getAttribute && n.getAttribute("aria-label")].join("\n")).join("\n");
}
function loadRaw(value) {
  const store = {};
  store[KEY] = typeof value === "string" ? value : JSON.stringify(value);
  return { store: store, app: loadApp(store) };
}

section("accuracy is plain words", () => {
  const t = loadApp({});
  check("30 meters", t.accuracyPhrase(30) === "within about 30 m");
  check("2 kilometers", t.accuracyPhrase(2000) === "within about 2 km");
  check("1.5 kilometers", t.accuracyPhrase(1500) === "within about 1.5 km");
  check("a missing accuracy is blank", t.accuracyPhrase(null) === "" && t.accuracyPhrase(undefined) === "");
  check("a bad accuracy is blank", t.accuracyPhrase(-5) === "" && t.accuracyPhrase(NaN) === "");
});

section("approximate is the default and exact waits for a confirm", () => {
  const storage = {};
  const t = loadApp(storage);
  const geo = installGeo(t);
  check("a new device is approximate", t.state.locationMode === "approximate" && t.state.location === null);
  t.requestLocation({ silent: true });
  check("open asks even with no saved fix", geo.calls.length === 1);
  check("the default request is not high accuracy", geo.calls[0].options.enableHighAccuracy === false);
  check("approximate can reuse a recent coarse fix", geo.calls[0].options.maximumAge >= 60000);
  check("approximate has a timeout", geo.calls[0].options.timeout >= 8000);
  check("the wait does not pretend a fix arrived", t.locationStatusText() === "Finding your approximate location…");
  check("the exact button is visible before a fix", blob(t.buildLocationBar()).indexOf("Use my exact location") !== -1);

  const before = geo.calls.length;
  t.askExactLocation();
  check("the exact button does not call the browser yet", geo.calls.length === before && t.exactPromptOpen === true);
  const note = blob(t.buildLocationBar());
  check("the explanation is just in time",
    note.indexOf("Exact location uses this device's GPS") !== -1 &&
    note.indexOf("on this device") !== -1 &&
    note.indexOf("don't store your exact location") !== -1);
  check("the explanation names the confirm", note.indexOf("Use exact location") !== -1 && note.indexOf("Not now") !== -1);
  check("the explanation has no coordinates", note.indexOf(String(PRECISE_LAT)) === -1 && note.indexOf(String(PRECISE_LNG)) === -1);

  t.dismissExactLocation();
  check("not now leaves the mode approximate", t.exactPromptOpen === false && t.state.locationMode === "approximate");
  check("not now still has not requested exact", geo.calls.length === before);

  t.askExactLocation();
  t.confirmExactLocation();
  const exactCall = geo.calls[geo.calls.length - 1];
  check("confirm requests high accuracy", exactCall.options.enableHighAccuracy === true);
  check("exact does not reuse a cached coarse fix", exactCall.options.maximumAge === 0);
  check("exact waits longer than approximate", exactCall.options.timeout > geo.calls[0].options.timeout);
  check("the choice is remembered before the fix arrives", t.state.locationMode === "exact");

  exactCall.success({ coords: { latitude: PRECISE_LAT, longitude: PRECISE_LNG, accuracy: 30 } });
  check("the fix is exact and fresh",
    t.state.location.mode === "exact" && t.state.location.stale === false && t.state.location.accuracy === 30);
  check("exact status uses the accuracy words",
    t.locationStatusText() === "Exact location, within about 30 m. Saved on this device.");
  const saved = JSON.parse(storage[KEY]);
  check("the choice and the fix are stored on the device",
    saved.locationMode === "exact" && saved.location.lat === PRECISE_LAT && saved.location.lng === PRECISE_LNG);

  const again = loadApp(storage);
  check("a reload remembers exact mode", again.state.locationMode === "exact");
  check("a reloaded fix is stale until a new one arrives",
    again.state.location.stale === true && again.state.location.lat === PRECISE_LAT);
  const geo2 = installGeo(again);
  again.requestLocation({ silent: true });
  check("open re-requests even though a fix is saved", geo2.calls.length === 1);
  check("the remembered choice re-requests high accuracy", geo2.calls[0].options.enableHighAccuracy === true);
  check("the stand-in is labeled while the new fix is in flight",
    again.locationStatusText() === "Last location, within about 30 m — updating…");
  geo2.calls[0].success({ coords: { latitude: 40.25, longitude: -111.7, accuracy: 2000 } });
  check("the new fix replaces the stand-in",
    again.state.location.stale === false && again.state.location.lat === 40.25 && again.state.locationMode === "exact");
  check("a coarse exact reading still says exact",
    again.locationStatusText() === "Exact location, within about 2 km. Saved on this device.");
});

section("denied, timeout, and unavailable stop using the old fix", () => {
  function fail(code, phrase) {
    const t = loadApp({});
    t.state.location = { lat: 40.2, lng: -111.6, accuracy: 2000, mode: "approximate", stale: false };
    t.state.locationMode = "approximate";
    const geo = installGeo(t);
    t.requestLocation({ silent: true });
    check(phrase + " keeps the old fix only while waiting",
      t.state.location && t.state.location.stale === true &&
      t.locationStatusText().indexOf("Last location") !== -1 &&
      t.locationStatusText().indexOf("updating") !== -1);
    geo.calls[0].error({ code: code, message: "raw " + PRECISE_LAT + "," + PRECISE_LNG });
    check(phrase + " drops the stale fix", t.state.location === null);
    check(phrase + " does not repeat the browser message or coordinates",
      t.locationStatusText().indexOf(phrase) !== -1 &&
      t.locationStatusText().indexOf(String(PRECISE_LAT)) === -1 &&
      t.locationStatusText().indexOf("raw ") === -1);
    const bar = blob(t.buildLocationBar());
    check(phrase + " offers another try and the exact button",
      bar.indexOf("Try again") !== -1 && bar.indexOf("Use my exact location") !== -1);
  }
  fail(1, "blocked");
  fail(3, "timed out");
  fail(2, "isn't available");

  const exactDenied = loadApp({});
  exactDenied.state.locationMode = "exact";
  exactDenied.state.location = { lat: 40.2, lng: -111.6, accuracy: 30, mode: "exact", stale: false };
  const exactGeo = installGeo(exactDenied);
  exactDenied.requestLocation({ silent: true });
  exactGeo.calls[0].error({ code: 1 });
  check("a denied exact request forgets the fix but keeps the choice",
    exactDenied.state.location === null && exactDenied.state.locationMode === "exact");
  check("clear is still available so exact mode can be forgotten",
    blob(exactDenied.buildLocationBar()).indexOf("Clear location") !== -1);
  exactDenied.clearLocation();
  check("clear after a denial returns to approximate", exactDenied.state.locationMode === "approximate");

  const bare = loadApp({});
  bare.navigator.geolocation = {};
  bare.requestLocation({ silent: true });
  check("a browser without geolocation is unsupported", bare.locationPhase === "unsupported");
  check("unsupported copy does not throw", bare.locationStatusText().indexOf("isn't supported") !== -1);
  check("unsupported hides the exact button", blob(bare.buildLocationBar()).indexOf("Use my exact location") === -1);
});

section("the exact button hides while an exact fix is active", () => {
  const storage = {};
  const t = loadApp(storage);
  const geo = installGeo(t);
  check("the exact button is visible before location is granted",
    blob(t.buildLocationBar()).indexOf("Use my exact location") !== -1);

  t.askExactLocation();
  t.confirmExactLocation();
  geo.calls[geo.calls.length - 1].success({
    coords: { latitude: PRECISE_LAT, longitude: PRECISE_LNG, accuracy: 40 }
  });
  const granted = blob(t.buildLocationBar());
  check("the exact button hides after granting", granted.indexOf("Use my exact location") === -1);
  check("the exact banner and its clear control stay",
    granted.indexOf("Exact location, within about 40 m. Saved on this device.") !== -1 &&
    granted.indexOf("Clear location") !== -1 &&
    granted.indexOf("location-chip-end") !== -1);
  const savedExact = storage[KEY];

  const restored = loadApp(storage);
  const restoredBar = blob(restored.buildLocationBar());
  check("a saved exact fix hides the button before the next request",
    restored.state.locationMode === "exact" &&
    restored.state.location && restored.state.location.mode === "exact" &&
    restored.state.location.stale === true &&
    restoredBar.indexOf("Use my exact location") === -1 &&
    restoredBar.indexOf("Clear location") !== -1);

  const geo2 = installGeo(restored);
  restored.requestLocation({ silent: true });
  check("the button stays hidden while the saved exact fix refreshes",
    blob(restored.buildLocationBar()).indexOf("Use my exact location") === -1);
  geo2.calls[0].success({ coords: { latitude: PRECISE_LAT, longitude: PRECISE_LNG, accuracy: 40 } });
  check("the button stays hidden after the restored fix refreshes",
    restored.locationStatusText() === "Exact location, within about 40 m. Saved on this device." &&
    blob(restored.buildLocationBar()).indexOf("Use my exact location") === -1);

  restored.clearLocation();
  check("clearing location shows the exact button again",
    restored.state.location === null &&
    restored.state.locationMode === "approximate" &&
    blob(restored.buildLocationBar()).indexOf("Use my exact location") !== -1);

  const deniedStore = {};
  deniedStore[KEY] = savedExact;
  const denied = loadApp(deniedStore);
  const geo3 = installGeo(denied);
  denied.requestLocation({ silent: true });
  geo3.calls[0].error({ code: 1 });
  const deniedBar = blob(denied.buildLocationBar());
  check("a denial shows the exact button again",
    denied.state.location === null &&
    denied.locationPhase === "denied" &&
    deniedBar.indexOf("Use my exact location") !== -1 &&
    deniedBar.indexOf("Try again") !== -1 &&
    deniedBar.indexOf("Exact location, within about 40 m") === -1);

  const approx = loadApp({});
  const geo4 = installGeo(approx);
  approx.requestLocation({ silent: true, exact: false });
  geo4.calls[0].success({ coords: { latitude: PRECISE_LAT, longitude: PRECISE_LNG, accuracy: 2000 } });
  check("approximate location keeps the exact button",
    approx.state.location.mode === "approximate" &&
    blob(approx.buildLocationBar()).indexOf("Use my exact location") !== -1);
});

section("clear location forgets the fix and the exact choice", () => {
  const t = loadApp({});
  const geo = installGeo(t);
  t.state.locationMode = "exact";
  t.state.location = { lat: PRECISE_LAT, lng: PRECISE_LNG, accuracy: 30, mode: "exact", stale: false };
  const bar = blob(t.buildLocationBar());
  check("the clear control is still there", bar.indexOf("Clear location") !== -1 && bar.indexOf("location-chip-end") !== -1);
  t.requestLocation({ silent: true });
  const late = geo.calls[0].success;
  t.clearLocation();
  late({ coords: { latitude: PRECISE_LAT, longitude: PRECISE_LNG, accuracy: 5 } });
  check("clear removes the fix", t.state.location === null);
  check("clear forgets exact mode", t.state.locationMode === "approximate");
  check("a late callback does not restore the fix", t.state.location === null && t.locationPhase === "idle");
  check("the next request is approximate", t.geoOptions(false).enableHighAccuracy === false && t.geoOptions(true).enableHighAccuracy === true);
});

section("saved settings migrate without crashing", () => {
  const old = loadRaw({
    location: { lat: 40.2338, lng: -111.6585, grantedAt: "2026-01-02", city: "Provo" }
  });
  check("an old fix keeps its coordinates",
    old.app.state.location.lat === 40.2338 && old.app.state.location.lng === -111.6585);
  check("an old fix is approximate and stale",
    old.app.state.locationMode === "approximate" && old.app.state.location.mode === "approximate" && old.app.state.location.stale === true);
  check("an old city and grant date are kept",
    old.app.state.location.city === "Provo" && old.app.state.location.grantedAt === "2026-01-02");

  const missing = loadApp({});
  check("a missing location stays empty", missing.state.location === null && missing.state.locationMode === "approximate");

  const text = loadRaw({ location: "denver" });
  check("a string location is dropped", text.app.state.location === null && text.app.state.locationMode === "approximate");
  const half = loadRaw({ location: { lat: 40.2 } });
  check("a fix with no longitude is dropped", half.app.state.location === null);
  const range = loadRaw({ location: { lat: 120, lng: 10 } });
  check("an out-of-range fix is dropped", range.app.state.location === null);
  const list = loadRaw({ location: [40.2, -111.6] });
  check("an array location is dropped", list.app.state.location === null);
  const junkMode = loadRaw({ locationMode: true, location: { lat: 40, lng: -111, mode: "GPS" } });
  check("only an exact string turns exact mode on", junkMode.app.state.locationMode === "approximate");
  const kept = loadRaw({ locationMode: "exact", location: { lat: "40.2", lng: -111.6, accuracy: "30" } });
  check("corrupt coordinates do not crash and do not drop a real exact choice",
    kept.app.state.location === null && kept.app.state.locationMode === "exact");
  const remembered = loadRaw({
    location: { lat: 40.1, lng: -111.1, mode: "exact", accuracy: 12, grantedAt: "2026-04-01" }
  });
  check("exact mode stored on the old fix is remembered",
    remembered.app.state.locationMode === "exact" &&
    remembered.app.state.location.accuracy === 12 &&
    remembered.app.state.location.stale === true);

  let crashed = false;
  let corrupt = null;
  try { corrupt = loadRaw("{").app; } catch (e) { crashed = true; }
  check("corrupt saved state does not crash",
    crashed === false && corrupt && corrupt.state.location === null && corrupt.state.locationMode === "approximate");
});

section("no-location ideas stay out of a located deck", () => {
  const t = loadApp({});
  t.state.filters.localOnly = false;
  t.state.filters.radiusMiles = 10;
  t.state.location = null;
  check("with no fix, an idea with no place still shows", t.matchesFilters(t.IDEAS_BY_ID[2], t.state.filters) === true);
  t.state.location = { lat: 40.2338, lng: -111.6585 };
  check("with a fix, an idea with no place drops even when local is off",
    t.matchesFilters(t.IDEAS_BY_ID[2], t.state.filters) === false);
  check("with a fix, a far pin drops even when local is off",
    t.matchesFilters(t.IDEAS_BY_ID[187], t.state.filters) === false);
  check("with a fix, a near pin stays when local is off",
    t.matchesFilters(t.IDEAS_BY_ID[1854], t.state.filters) === true);
  const deck = t.computeDeck();
  check("the located deck does not contain the unpinned idea", deck.remaining.indexOf(2) === -1);
});

section("open always re-requests", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const enter = src.slice(src.indexOf("function enterApp()"), src.indexOf("function showTutorial()"));
  check("enterApp re-requests location", enter.indexOf("requestLocation({ silent:true })") !== -1);
  check("enterApp does not skip the request when a fix is already saved",
    enter.indexOf("if(state.location)") === -1);
  const nearby = src.slice(src.indexOf("function fetchNearbyIdeas()"), src.indexOf("function ideaForSaved("));
  check("the nearby-ideas request is unchanged", nearby.indexOf("/api/nearby-ideas") !== -1 && nearby.indexOf("state.location.lat") !== -1);
});

async function main() {
  await section("activities requests send the rounded pair only", async () => {
    const t = loadApp({});
    const geo = installGeo(t);
    const urls = [];
    const bodies = [];
    t.setFetch(function(url, options) {
      urls.push(String(url));
      if (options && options.body != null) bodies.push(String(options.body));
      const pathName = String(url);
      if (pathName.indexOf("/api/status") !== -1) {
        return Promise.resolve({
          ok: true,
          json: function() { return Promise.resolve({ placesConfigured: false, aiConfigured: false, offline: false }); }
        });
      }
      return Promise.resolve({
        ok: true,
        json: function() { return Promise.resolve({ items: [], nextCursor: null }); }
      });
    });
    const logs = [];
    const methods = ["log", "info", "warn", "error", "debug"];
    const orig = {};
    methods.forEach(method => {
      orig[method] = console[method];
      console[method] = function() {
        logs.push(Array.prototype.join.call(arguments, " "));
        orig[method].apply(console, arguments);
      };
    });
    let activity = [];
    let wire = "";
    let share = "";
    try {
      t.state.filters.localOnly = false;
      t.state.filters.radiusMiles = 10;
      t.requestLocation({ silent: true, exact: false });
      geo.calls[0].success({ coords: { latitude: PRECISE_LAT, longitude: PRECISE_LNG, accuracy: 30 } });
      for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve));
      activity = urls.filter(url => url.indexOf("/api/activities") !== -1);
      wire = urls.join("\n") + "\n" + bodies.join("\n");
      share = t.planShareUrl({ name: "Friday", date: "2026-06-05", ideaIds: [2], lat: PRECISE_LAT, lng: PRECISE_LNG });
    } finally {
      methods.forEach(method => { console[method] = orig[method]; });
    }
    check("a located deck asks for activities", activity.length >= 1, urls.join(" | "));
    activity.forEach(url => {
      const query = new URL(url, "http://local");
      check("latitude is rounded to 2 decimals", query.searchParams.get("lat") === "40.23", url);
      check("longitude is rounded to 2 decimals", query.searchParams.get("lng") === "-111.66", url);
      check("the slider radius is sent while local is off", query.searchParams.get("radiusMiles") === "10", url);
      check("unpinned rows are not requested once a fix exists", query.searchParams.get("localOnly") === "1", url);
      check("the precise pair is not in the activities url",
        url.indexOf(String(PRECISE_LAT)) === -1 && url.indexOf(String(PRECISE_LNG)) === -1, url);
    });
    check("no request carries the unrounded coordinates",
      wire.indexOf(String(PRECISE_LAT)) === -1 && wire.indexOf(String(PRECISE_LNG)) === -1, wire.slice(0, 400));
    check("logs do not contain the coordinates",
      logs.join("\n").indexOf(String(PRECISE_LAT)) === -1 && logs.join("\n").indexOf(String(PRECISE_LNG)) === -1,
      logs.join(" | ").slice(0, 240));
    check("a shared plan link does not embed the origin",
      share.indexOf(String(PRECISE_LAT)) === -1 && share.indexOf(String(PRECISE_LNG)) === -1 && share.indexOf("lat=") === -1,
      share);
  });
}

module.exports = main().then(() => ({ pass: pass, fail: fail }));
