/* sourceLink, the More info control on cards, and coming back into the app.
   No database. */
"use strict";

const fs = require("fs");
const path = require("path");
const util = require("../public/util");
const { loadApp } = require("./harness");

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

function walk(node, acc) {
  if (!node || typeof node !== "object") return;
  acc.push(node);
  (node.children || []).forEach(child => walk(child, acc));
}

function byText(root, text) {
  const nodes = [];
  walk(root, nodes);
  return nodes.filter(node => node.textContent === text);
}

function moreLinks(root) {
  return byText(root, "More info \u2197");
}

function fire(node, type, ev) {
  const list = node && node._listeners && node._listeners[type];
  if (list) list.slice().forEach(fn => fn(ev));
  return ev;
}

function pointer(target, x, y) {
  return {
    target: target,
    button: 0,
    buttons: 1,
    clientX: x,
    clientY: y,
    timeStamp: 1000 + x,
    pointerId: 1,
    pointerType: "mouse",
    stopped: false,
    stopPropagation() { this.stopped = true; },
    preventDefault() {}
  };
}

function enteredStore(extra) {
  const store = {
    spark_state_v1: JSON.stringify({
      onboarded: true,
      hasSeenTutorial: true,
      profile: { name: "Ada", gender: "Woman", photo: null, ageConfirmedAt: "2020-01-01T00:00:00.000Z" }
    })
  };
  if (extra) Object.assign(store, extra);
  return store;
}

const RETURN_KEY = "jaderoo_return_v1";
const PAGE = "https://example.com/events/jazz";

section("sourceLink", () => {
  check("accepts a normal https link", util.sourceLink({ url: PAGE }) === PAGE);
  check("normalizes the host", util.sourceLink({ url: "https://EXAMPLE.com/events/jazz" }) === PAGE);
  check("rejects http", util.sourceLink({ url: "http://example.com/events/jazz" }) === "");
  check("rejects javascript:",
    util.sourceLink({ source_url: "javascript:alert(1)" }) === "" &&
    util.sourceLink({ url: "JavaScript:alert(1)" }) === "");
  check("rejects a blank link",
    util.sourceLink({ url: "" }) === "" &&
    util.sourceLink({ source_url: "   " }) === "" &&
    util.sourceLink({}) === "" &&
    util.sourceLink(null) === "");
  check("rejects a link with credentials",
    util.sourceLink({ url: "https://user:pass@example.com/events/jazz" }) === "" &&
    util.sourceLink({ url: "https://user@example.com/events/jazz" }) === "");

  [
    "https://sugarspace.org/event",
    "https://www.sugarspace.org/event",
    "https://a.b.sugarspace.org/event",
    "https://nowplayingutah.com/show",
    "https://events.nowplayingutah.com/show",
    "https://www.ticketmaster.com/event/1",
    "https://ticketmaster.co.uk/event/1",
    "https://maps.google.com/",
    "https://maps.google.co.uk/place",
    "https://www.google.com/maps/place/Provo",
    "https://www.google.co.uk/maps",
    "https://goo.gl/maps/abc",
    "https://maps.app.goo.gl/abc",
    "https://maps.apple.com/?q=provo",
    "https://www.bing.com/maps?q=provo",
    "https://bing.com/maps/search",
    "https://www.openstreetmap.org/search",
    "https://nominatim.openstreetmap.org/search",
    "https://nominatim.org/search",
    "https://foo.nominatim.org/search"
  ].forEach(href => {
    check("blocks " + href, util.sourceLink({ url: href }) === "");
  });

  [
    "https://example.com/events/jazz",
    "https://notticketmaster.com/event",
    "https://www.google.com/search?q=maps",
    "https://goo.gl/notmaps",
    "https://www.bing.com/news",
    "https://google.com.evil.com/maps",
    "https://sugarspace.org.evil.com/event"
  ].forEach(href => {
    check("allows " + href, util.sourceLink({ url: href }) === href);
  });
});

section("card More info does not open the card", () => {
  const t = loadApp({});
  const base = t.IDEAS_BY_ID[2];
  const plain = Object.assign({}, base, { id: 881001 });
  delete plain.url;
  delete plain.source_url;
  delete plain.sourceUrl;
  t.IDEAS_BY_ID[plain.id] = plain;

  const withPage = Object.assign({}, base, { id: 881002, url: PAGE });
  delete withPage.source_url;
  delete withPage.sourceUrl;
  delete withPage.source_credit;
  delete withPage.source_key;
  t.IDEAS_BY_ID[withPage.id] = withPage;

  const blocked = Object.assign({}, base, { id: 881003, url: "https://www.ticketmaster.com/event/1" });
  delete blocked.source_url;
  t.IDEAS_BY_ID[blocked.id] = blocked;

  check("a card with no page has no More info link", moreLinks(t.buildSwipeCard(plain, false)).length === 0);
  check("a blocked host has no More info link", moreLinks(t.buildSwipeCard(blocked, false)).length === 0);
  check("a saved card and an idea row get the same link",
    moreLinks(t.buildSavedCard(withPage, {})).length === 1 &&
    moreLinks(t.buildIdeaRow(withPage, "Tonight")).length === 1);
  check("a saved card with no page stays plain", moreLinks(t.buildSavedCard(plain, {})).length === 0);

  const card = t.buildSwipeCard(withPage, true, 0);
  const links = moreLinks(card);
  check("a normal https page shows one More info link", links.length === 1, String(links.length));
  const link = links[0];
  check("the link opens outside the app",
    link && link.tagName === "A" &&
    link.getAttribute("href") === PAGE &&
    link.getAttribute("target") === "_blank" &&
    link.getAttribute("rel") === "noopener noreferrer");
  check("the address is set with setAttribute, not innerHTML",
    link && link.innerHTML === "" && card.innerHTML.indexOf(PAGE) === -1);

  ["click", "pointerdown", "pointerup", "touchstart", "touchend"].forEach(type => {
    const ev = { target: link, stopped: false, stopPropagation() { this.stopped = true; }, preventDefault() {} };
    fire(link, type, ev);
    check(type + " on More info stops the event", ev.stopped === true);
  });

  t.ui.screen = "list";
  t.ui.detailIdeaId = null;
  const openCard = t.buildSwipeCard(plain, true, 0);
  fire(openCard, "pointerdown", pointer(openCard, 10, 10));
  const up = pointer(openCard, 12, 11);
  up.buttons = 0;
  fire(openCard, "pointerup", up);
  check("a tap on the card opens it", t.ui.screen === "detail" && t.ui.detailIdeaId === plain.id);

  t.ui.screen = "list";
  t.ui.detailIdeaId = null;
  const infoCard = t.buildSwipeCard(withPage, true, 0);
  const info = moreLinks(infoCard)[0];
  fire(infoCard, "pointerdown", pointer(infoCard, 20, 20));
  const infoUp = pointer(info, 21, 20);
  infoUp.buttons = 0;
  fire(infoCard, "pointerup", infoUp);
  check("a tap on More info does not open the card",
    t.ui.screen === "list" && t.ui.detailIdeaId == null);

  const stored = JSON.parse(t.sessionStorage.getItem(RETURN_KEY));
  check("the tap remembers the open card, not a location",
    stored && stored.openCardId === withPage.id && stored.detailId == null &&
    stored.tab === "discover" && typeof stored.scrollTop === "number" && typeof stored.ts === "number" &&
    stored.lat == null && stored.lng == null && stored.location == null && stored.coordinates == null);
  check("sessionStorage and localStorage hold the same return note",
    t.localStorage.getItem(RETURN_KEY) === t.sessionStorage.getItem(RETURN_KEY));
  check("the stored keys are only tab, scroll, card, and time",
    Object.keys(stored).sort().join(",") === "openCardId,scrollTop,tab,ts");

  const row = t.buildIdeaRow(withPage, "Tonight");
  const rowLink = moreLinks(row)[0];
  const rowEv = { target: rowLink, stopped: false, stopPropagation() { this.stopped = true; }, preventDefault() {} };
  fire(rowLink, "click", rowEv);
  fire(row, "click", rowEv);
  check("a row tap on More info does not open the row",
    rowEv.stopped === true && t.ui.screen === "list" && t.ui.detailIdeaId == null);
});

section("detail source link and maps", () => {
  const t = loadApp({});
  const base = t.IDEAS_BY_ID[2];
  const blocked = Object.assign({}, base, { id: 881101, source_url: "https://maps.apple.com/place" });
  t.IDEAS_BY_ID[blocked.id] = blocked;
  check("a blocked source hides More info / Source",
    byText(t.buildDetailScreen(blocked.id), "More info / Source").length === 0);

  const mapsUrl = "https://maps.example/search?q=\"><img src=x>";
  const real = Object.assign({}, base, {
    id: 881102,
    isReal: true,
    placeName: "Cafe",
    address: "1 Main",
    mapsUrl: mapsUrl
  });
  delete real.url;
  delete real.source_url;
  t.IDEAS_BY_ID[real.id] = real;
  const screen = t.buildDetailScreen(real.id);
  const nodes = [];
  walk(screen, nodes);
  const maps = nodes.filter(node => node.className === "btn-outline btn-block detail-real-link");
  check("Open in Maps is one link", maps.length === 1, String(maps.length));
  check("Open in Maps uses setAttribute and noopener",
    maps[0] && maps[0].getAttribute("href") === mapsUrl &&
    maps[0].getAttribute("target") === "_blank" &&
    maps[0].getAttribute("rel") === "noopener noreferrer" &&
    maps[0].innerHTML.indexOf("Open in Maps") !== -1 &&
    maps[0].innerHTML.indexOf(mapsUrl) === -1);

  const src = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const mount = src.slice(src.indexOf("function armSourceLink"), src.indexOf("function buildSwipeCard"));
  check("card links set href with setAttribute and not innerHTML",
    mount.indexOf('setAttribute("href"') !== -1 &&
    mount.indexOf('setAttribute("target", "_blank")') !== -1 &&
    mount.indexOf('setAttribute("rel", "noopener noreferrer")') !== -1 &&
    mount.indexOf("innerHTML") === -1 &&
    mount.indexOf("iframe") === -1);
  const mapsAt = src.indexOf("mapsLink.className");
  const mapsSrc = src.slice(mapsAt, mapsAt + 500);
  check("Open in Maps does not concatenate the address into HTML",
    mapsAt !== -1 &&
    mapsSrc.indexOf("idea.mapsUrl +") === -1 &&
    mapsSrc.indexOf('setAttribute("href", String(idea.mapsUrl))') !== -1 &&
    mapsSrc.indexOf('setAttribute("rel", "noopener noreferrer")') !== -1);
});

section("pageshow and visibility restore", () => {
  const t = loadApp(enteredStore());
  const title = t.IDEAS_BY_ID[2].title;
  check("pageshow and visibility listeners are installed",
    t.window._listeners.pageshow && t.window._listeners.pageshow.length >= 1 &&
    t.document._listeners.visibilitychange && t.document._listeners.visibilitychange.length >= 1);

  t.ui.tab = "friends";
  t.ui.screen = "detail";
  t.ui.detailIdeaId = 2;
  t.saveSourceReturn({ id: 2 });
  const saved = JSON.parse(t.sessionStorage.getItem(RETURN_KEY));
  check("a detail source link stores detailId",
    saved && saved.detailId === 2 && saved.tab === "friends" && saved.openCardId == null &&
    Object.keys(saved).sort().join(",") === "detailId,scrollTop,tab,ts");

  t.ui.tab = "discover";
  t.ui.screen = "list";
  t.ui.detailIdeaId = null;
  t.window._listeners.pageshow.forEach(fn => fn({ persisted: true }));
  check("pageshow from bfcache restores the tab and the detail",
    t.ui.tab === "friends" && t.ui.screen === "detail" && t.ui.detailIdeaId === 2);
  check("the return note is cleared",
    t.sessionStorage.getItem(RETURN_KEY) == null && t.localStorage.getItem(RETURN_KEY) == null);
  check("the toast names the event",
    t.lastToastMessage === "Back in Jaderoo, you were on \u2039" + title + "\u203a");
  const toast = t.lastReturnToastNode;
  const btn = (toast.children || []).filter(node => node.className === "toast-return-btn")[0];
  const label = (toast.children || []).filter(node => node.className === "toast-return-text")[0];
  check("the toast has a Return to event button",
    btn && btn.textContent === "Return to event" && label && label.textContent === t.lastToastMessage);

  t.ui.screen = "list";
  t.ui.detailIdeaId = null;
  let stopped = false;
  fire(btn, "click", { stopPropagation() { stopped = true; }, preventDefault() {} });
  check("Return to event reopens that event",
    stopped === true && t.ui.screen === "detail" && t.ui.detailIdeaId === 2);

  t.ui.tab = "discover";
  t.ui.screen = "list";
  t.ui.detailIdeaId = null;
  t.sessionStorage.setItem(RETURN_KEY, JSON.stringify({
    tab: "discover", scrollTop: 64, openCardId: 2, ts: Date.now()
  }));
  t.localStorage.removeItem(RETURN_KEY);
  t.window._listeners.pageshow.forEach(fn => fn({ persisted: false }));
  check("a normal pageshow restores the open card and the scroll",
    t.ui.tab === "discover" && t.ui.screen === "list" && t.ui.detailIdeaId == null &&
    t.restoredCardId === 2 && t.lastAppliedScrollTop === 64);

  const nasty = "<img src=x onerror=alert(1)>";
  t.IDEAS_BY_ID[881201] = Object.assign({}, t.IDEAS_BY_ID[2], { id: 881201, title: nasty });
  t.sessionStorage.setItem(RETURN_KEY, JSON.stringify({
    tab: "saved", scrollTop: 8, detailId: 881201, ts: Date.now(),
    lat: 40.2, lng: -111.6, location: { lat: 1, lng: 2 }, coordinates: [1, 2]
  }));
  t.ui.tab = "discover";
  t.ui.screen = "list";
  t.ui.detailIdeaId = null;
  t.document.visibilityState = "hidden";
  t.document._listeners.visibilitychange.forEach(fn => fn());
  check("hiding the app does not restore",
    t.ui.tab === "discover" && t.ui.detailIdeaId == null && t.sessionStorage.getItem(RETURN_KEY) != null);
  t.document.visibilityState = "visible";
  t.document._listeners.visibilitychange.forEach(fn => fn());
  check("becoming visible restores the detail",
    t.ui.tab === "saved" && t.ui.screen === "detail" && t.ui.detailIdeaId === 881201);
  const safe = (t.lastReturnToastNode.children || []).filter(node => node.className === "toast-return-text")[0];
  check("the toast escapes the title",
    t.lastToastMessage.indexOf(nasty) !== -1 &&
    safe && safe.textContent.indexOf(nasty) !== -1 &&
    safe.innerHTML === "" &&
    (safe.children || []).length === 0 &&
    String(t.lastReturnToastNode.innerHTML || "").indexOf("<img") === -1);
  check("a poisoned return note does not apply coordinates",
    t.state.location == null);

  t.sessionStorage.removeItem(RETURN_KEY);
  t.localStorage.setItem(RETURN_KEY, JSON.stringify({
    tab: "saved", scrollTop: 1, detailId: 2, ts: Date.now() - t.RETURN_TTL_MS - 50
  }));
  t.ui.tab = "discover";
  t.ui.screen = "list";
  t.ui.detailIdeaId = null;
  check("an expired localStorage note does not restore", t.restoreWayBack() === false && t.ui.detailIdeaId == null);
  check("an expired localStorage note is removed", t.localStorage.getItem(RETURN_KEY) == null);
});

section("cold start from localStorage", () => {
  const ttl = 30 * 60 * 1000;
  const fresh = loadApp(enteredStore({
    [RETURN_KEY]: JSON.stringify({
      tab: "saved",
      scrollTop: 180,
      detailId: 2,
      ts: Date.now() - (ttl - 5000)
    })
  }));
  const title = fresh.IDEAS_BY_ID[2].title;
  check("a cold start restores the tab, scroll, and detail from localStorage",
    fresh.ui.tab === "saved" && fresh.ui.screen === "detail" && fresh.ui.detailIdeaId === 2 &&
    fresh.lastAppliedScrollTop === 180);
  check("the cold start toast names the event",
    fresh.lastToastMessage === "Back in Jaderoo, you were on \u2039" + title + "\u203a");
  check("the cold start clears the saved return note",
    fresh.localStorage.getItem(RETURN_KEY) == null && fresh.sessionStorage.getItem(RETURN_KEY) == null);
  check("Return to event still reopens it after a cold start",
    (fresh.ui.screen = "list", fresh.ui.detailIdeaId = null, fresh.reopenReturnedEvent(),
      fresh.ui.screen === "detail" && fresh.ui.detailIdeaId === 2));

  const card = loadApp(enteredStore({
    [RETURN_KEY]: JSON.stringify({
      tab: "discover",
      scrollTop: 12,
      openCardId: 2,
      ts: Date.now()
    })
  }));
  check("a cold start puts the open card back on Discover",
    card.ui.tab === "discover" && card.ui.screen === "list" && card.ui.detailIdeaId == null &&
    card.restoredCardId === 2 && card.lastAppliedScrollTop === 12);

  const stale = loadApp(enteredStore({
    [RETURN_KEY]: JSON.stringify({
      tab: "saved",
      scrollTop: 40,
      detailId: 2,
      ts: Date.now() - ttl - 1000,
      lat: 1,
      lng: 2
    })
  }));
  check("a cold start drops a localStorage note older than 30 minutes",
    stale.ui.tab === "discover" && stale.ui.screen === "list" && stale.ui.detailIdeaId == null &&
    stale.localStorage.getItem(RETURN_KEY) == null &&
    stale.lastToastMessage.indexOf("Back in Jaderoo") === -1);
});

module.exports = { pass: pass, fail: fail };
