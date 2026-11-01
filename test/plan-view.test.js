/* Opening #plan=v1.<payload> shows a read-only plan.
   The 18+ check runs before decode. Nothing is fetched to view it. */

const fs = require("fs");
const path = require("path");
const { loadApp } = require("./harness.js");
const util = require("../public/util");

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

function between(src, start, end) {
  const i = src.indexOf(start);
  const j = src.indexOf(end, i + start.length);
  if (i < 0 || j < 0) throw new Error("markers not found: " + start);
  return src.slice(i, j);
}

function textOf(node) {
  if (!node) return "";
  let out = node.innerHTML || "";
  (node.children || []).forEach(child => { out += "\n" + textOf(child); });
  return out;
}

function classesOf(node) {
  let out = node && node.className ? node.className + "\n" : "";
  (node && node.children || []).forEach(child => { out += classesOf(child); });
  return out;
}

function findById(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  const kids = node.children || [];
  for (let i = 0; i < kids.length; i++) {
    const found = findById(kids[i], id);
    if (found) return found;
  }
  return null;
}

const KEY = "spark_state_v1";
const ADULT_PROFILE = {
  onboarded: true,
  hasSeenTutorial: true,
  profile: { name: "Riley", gender: "Woman", ageConfirmedAt: "2026-02-02T15:04:05.000Z" }
};
const COOKIE = "spark_age_ok=1; Max-Age=31536000; Path=/; SameSite=Lax";
const PRIOR_EXPORTS = [
  "state", "IDEAS_BY_ID", "REAL_IDEAS_RUNTIME", "REMOTE_IDEAS", "applyRemoteIdeas",
  "hydrateRealIdea", "saveState", "addIdeaToBucket", "removeIdeaFromBucket", "totalSavedCount",
  "isRealId", "displayCost", "localDateISO", "computeDeck", "matchesFilters", "placeLabel",
  "nearYouLabel", "ideaDistanceMiles", "distanceAwayLabel", "ideaHasKnownPlace",
  "buildWhereGroup", "countIdeasMatching", "formatShowIdeas", "suitsTonight", "timeBadgeLabel",
  "ideaStatusBadge", "tonightMatchCount", "toggleTonightFilter", "buildDiscoverScreen",
  "buildSwipeCard", "buildIdeaRow", "buildFriendIdeaRow", "buildSavedCard", "buildSavedScreen",
  "buildDoneScreen", "buildDoneSubpanel", "buildDoneRecapForm", "commitDoneRecap", "openDoneRecap",
  "ui", "buildDetailScreen", "ideaPhoto", "FILTER_DEFS", "activeFilterCount", "finishOnboarding",
  "ageGateSatisfied", "MINIMUM_AGE", "parseProfileAge", "setFetch", "copyText", "shareOrCopy",
  "presentCopy", "presentShare", "encodePlanShare", "decodePlanShare", "planShareUrl",
  "planShareOmittedCount", "planShareOmissionNote", "PLAN_SHARE_MAX_CHARS", "getInviteLink",
  "commitFriendPick", "planShareState", "validateUsername", "profileUsernameLine",
  "submittedIdeasLabel", "renderProfileHeader", "applyProfileEdits", "recordSubmittedIdea",
  "buildEditProfileSubpanel", "buildIdeaSubmitSubpanel", "fetchCalls", "navigator", "document", "window"
];

function fresh() {
  const app = loadApp({});
  app.window.location.protocol = "http:";
  app.window.location.hash = "";
  app.document.cookie = "";
  return app;
}

function openPlan(app, payload) {
  app.window.location.hash = "#plan=" + payload;
  return app.routeSharedPlan();
}

async function main() {
  const appSrc = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  const sample = fresh();
  const title2 = sample.IDEAS_BY_ID[2].title;
  const title3 = sample.IDEAS_BY_ID[3].title;
  const named = sample.encodePlanShare({ name: "Friday Night", date: "2026-06-05", ideaIds: [3, 2] });
  const undated = sample.encodePlanShare({ name: "No Date Night", date: "", ideaIds: [2] });
  const prettyDate = util.fmtDate("2026-06-05");

  section("harness keeps the previous exports", () => {
    PRIOR_EXPORTS.forEach(name => {
      check("still exports " + name, sample[name] != null, typeof sample[name]);
    });
    ["routeSharedPlan", "submitSharedPlanAge", "readAgeOkCookie", "writeAgeOkCookie",
      "sharedPlanGatePassed", "buildSharedPlanView", "saveSharedPlan", "leaveSharedPlan",
      "clearPlanFragment"].forEach(name => {
      check("exports " + name, typeof sample[name] === "function");
    });
    check("age rule is unchanged", sample.MINIMUM_AGE === 18 && sample.parseProfileAge("18") === 18 && sample.parseProfileAge("17") === 17);
  });

  section("the gate runs before decode", () => {
    const routeSrc = between(appSrc, "function routeSharedPlan()", "function leaveSharedPlan()");
    const ageSrc = between(appSrc, "function submitSharedPlanAge(raw)", "function routeSharedPlan()");
    const bootAt = appSrc.indexOf("function boot(){");
    const bootFn = appSrc.slice(bootAt, appSrc.indexOf("\n  }", bootAt));
    check("route checks the gate before it shows a decoded plan",
      routeSrc.indexOf("sharedPlanGatePassed()") !== -1 &&
      routeSrc.indexOf("showSharedPlanDecoded(") > routeSrc.indexOf("sharedPlanGatePassed()") &&
      routeSrc.indexOf("decodePlanShare") === -1);
    check("a failing age returns before the cookie and before decode",
      ageSrc.indexOf("parseProfileAge") !== -1 &&
      ageSrc.indexOf("MINIMUM_AGE") > ageSrc.indexOf("parseProfileAge") &&
      ageSrc.indexOf("showSharedPlanBlocked") < ageSrc.indexOf("writeAgeOkCookie") &&
      ageSrc.indexOf("writeAgeOkCookie") < ageSrc.indexOf("showSharedPlanDecoded") &&
      ageSrc.indexOf("decodePlanShare") === -1);
    check("boot routes before it can enter the app",
      bootFn.indexOf("routeSharedPlan()") !== -1 &&
      bootFn.indexOf("routeSharedPlan()") < bootFn.indexOf("enterApp()") &&
      bootFn.indexOf("decodePlanShare") === -1 &&
      bootFn.indexOf("#plan") === -1);

    const app = fresh();
    const before = app.sharedPlanDecodeCount;
    const fetches = app.fetchCalls.length;
    let geo = 0;
    app.navigator.geolocation.getCurrentPosition = function(){ geo++; };
    const gate = openPlan(app, named);
    const html = textOf(gate);
    check("opening the link shows the gate", gate && gate.getAttribute("data-shared-plan") === "gate", gate && gate.getAttribute("data-shared-plan"));
    check("decode has not run", app.sharedPlanDecodeCount === before);
    check("the plan is not on the gate", html.indexOf("Friday Night") === -1 && html.indexOf(title2) === -1 && html.indexOf(title3) === -1);
    check("the gate asks for an age",
      html.indexOf("Age") !== -1 && findById(gate, "shared-plan-age") != null &&
      findById(gate, "shared-plan-age").className === "field-input",
      html.slice(0, 240));
    check("viewing the gate makes no request and does not read location", app.fetchCalls.length === fetches && geo === 0);
  });

  section("the cookie is set only on a pass, with the stated attributes", () => {
    const httpApp = fresh();
    httpApp.window.location.protocol = "http:";
    openPlan(httpApp, named);
    const blocked = httpApp.submitSharedPlanAge(String(httpApp.MINIMUM_AGE - 1));
    const blockedHtml = textOf(blocked);
    check("under the minimum shows the adult screen",
      blocked.getAttribute("data-shared-plan") === "blocked" && blockedHtml.indexOf("Jaderoo is for adults 18+") !== -1,
      blockedHtml.slice(0, 180));
    check("the fail screen does not show the plan", blockedHtml.indexOf("Friday Night") === -1 && blockedHtml.indexOf(title2) === -1);
    check("a fail does not set the cookie", httpApp.document.cookie.indexOf("spark_age_ok") === -1, httpApp.document.cookie);
    check("a fail still has not decoded", httpApp.sharedPlanDecodeCount === 0);

    const junk = httpApp.submitSharedPlanAge("nope");
    check("an unreadable age stays on the gate", junk.getAttribute("data-shared-plan") === "gate");
    check("an unreadable age does not set the cookie or decode",
      httpApp.document.cookie.indexOf("spark_age_ok") === -1 && httpApp.sharedPlanDecodeCount === 0);

    const passed = httpApp.submitSharedPlanAge(String(httpApp.MINIMUM_AGE));
    check("http pass sets only the age cookie", httpApp.document.cookie === COOKIE, httpApp.document.cookie);
    check("http cookie has no Secure flag", httpApp.document.cookie.indexOf("Secure") === -1);
    check("the cookie value is 1 and does not store the age",
      httpApp.document.cookie.indexOf("spark_age_ok=1") === 0 && httpApp.document.cookie.indexOf("=18") === -1);
    check("a pass decodes once and shows the plan",
      httpApp.sharedPlanDecodeCount === 1 && passed.getAttribute("data-shared-plan") === "view" &&
      textOf(passed).indexOf("Friday Night") !== -1);

    const httpsApp = fresh();
    httpsApp.window.location.protocol = "https:";
    openPlan(httpsApp, named);
    httpsApp.submitSharedPlanAge("21");
    check("https pass adds Secure", httpsApp.document.cookie === COOKIE + "; Secure", httpsApp.document.cookie);
    check("https cookie does not store the typed age", httpsApp.document.cookie.indexOf("21") === -1);
  });

  section("a cookie or a passing profile skips the gate", () => {
    const cookieApp = fresh();
    const fetches = cookieApp.fetchCalls.length;
    cookieApp.document.cookie = "theme=light; spark_age_ok=1";
    check("cookie alone counts as a pass", cookieApp.sharedPlanGatePassed() === true && cookieApp.ageGateSatisfied(cookieApp.state) === false);
    const view = openPlan(cookieApp, named);
    check("cookie skips the gate", view.getAttribute("data-shared-plan") === "view");
    check("skipping does not rewrite the cookie", cookieApp.document.cookie === "theme=light; spark_age_ok=1");
    cookieApp.document.cookie = "spark_age_ok=0";
    check("spark_age_ok=0 is not a pass", cookieApp.readAgeOkCookie() === false && cookieApp.sharedPlanGatePassed() === false);
    check("the cookie path makes no request", cookieApp.fetchCalls.length === fetches);

    const stored = {};
    stored[KEY] = JSON.stringify(ADULT_PROFILE);
    const profileApp = loadApp(stored);
    profileApp.window.location.protocol = "http:";
    profileApp.document.cookie = "";
    check("confirmed profile passes the existing gate", profileApp.ageGateSatisfied(profileApp.state) === true);
    const profileView = openPlan(profileApp, named);
    check("profile skips the shared-plan gate", profileView.getAttribute("data-shared-plan") === "view" && textOf(profileView).indexOf("Friday Night") !== -1);
    check("profile skip does not set the cookie", profileApp.document.cookie === "");

    const young = fresh();
    young.state.profile.age = "16";
    young.state.profile.ageConfirmedAt = "2026-02-02T15:04:05.000Z";
    check("under-18 profile still fails the existing rule", young.ageGateSatisfied(young.state) === false);
    const youngGate = openPlan(young, named);
    check("under-18 profile without a cookie sees the gate", youngGate.getAttribute("data-shared-plan") === "gate" && young.sharedPlanDecodeCount === 0);
    young.document.cookie = "spark_age_ok=1";
    const youngView = openPlan(young, named);
    check("a cookie skips even when the stored profile is under 18", youngView.getAttribute("data-shared-plan") === "view");
  });

  section("a broken link and unresolved ideas", () => {
    const app = fresh();
    app.document.cookie = "spark_age_ok=1";
    const broken = openPlan(app, "v1.!!!!");
    const brokenHtml = textOf(broken);
    check("null decode shows the broken-link screen",
      broken.getAttribute("data-shared-plan") === "broken" && brokenHtml.indexOf("This link looks broken") !== -1,
      brokenHtml.slice(0, 200));
    check("the broken screen has no ideas and no save action",
      brokenHtml.indexOf(title2) === -1 && brokenHtml.indexOf("Save to my plans") === -1 && brokenHtml.indexOf("Open Jaderoo") !== -1);

    const view = openPlan(app, named);
    const html = textOf(view);
    const first = html.indexOf(title3);
    const second = html.indexOf(title2);
    check("ideas stay in payload order", first !== -1 && second !== -1 && first < second, title3 + " then " + title2);
    check("the date is formatted and the raw day is not the label",
      html.indexOf(prettyDate) !== -1 && classesOf(view).indexOf("shared-plan-date") !== -1 &&
      html.indexOf("2026-06-05") === -1, prettyDate + " / " + html.slice(html.indexOf("Friday"), html.indexOf("Friday") + 80));
    check("cards use the swipe card look without swipe chrome",
      classesOf(view).indexOf("swipe-card") !== -1 &&
      classesOf(view).indexOf("shared-plan-card") !== -1 &&
      html.indexOf("stamp yes") === -1 &&
      html.indexOf("swipe right") === -1);
    check("the view offers save and open", html.indexOf("Save to my plans") !== -1 && html.indexOf("Open Jaderoo") !== -1);
    check("nothing was skipped", html.indexOf("couldn't be shown") === -1);

    const missedTitle = app.IDEAS_BY_ID[3].title;
    delete app.IDEAS_BY_ID[3];
    const missed = openPlan(app, named);
    const missedHtml = textOf(missed);
    check("an unresolved id is skipped", missedHtml.indexOf(title2) !== -1 && missedHtml.indexOf(missedTitle) === -1);
    check("a short note names the skip", missedHtml.indexOf("1 idea couldn't be shown") !== -1, missedHtml.slice(-240));
    check("the skipped id is not printed", missedHtml.indexOf("424242") === -1);

    const empty = fresh();
    empty.document.cookie = "spark_age_ok=1";
    const undatedView = openPlan(empty, undated);
    const undatedHtml = textOf(undatedView);
    check("an empty date is hidden",
      undatedHtml.indexOf("No Date Night") !== -1 &&
      undatedHtml.indexOf("shared-plan-date") === -1 &&
      undatedHtml.indexOf("No date set") === -1);

    const direct = empty.buildSharedPlanView({ name: "<b>Nope</b>", date: "", ideaIds: [2, 424242, 2] });
    const directHtml = textOf(direct);
    check("a direct unresolved id is noted and the name is escaped",
      directHtml.indexOf("1 idea couldn't be shown") !== -1 &&
      directHtml.indexOf("<b>") === -1 &&
      directHtml.indexOf("&lt;b&gt;Nope&lt;/b&gt;") !== -1);
  });

  section("saving creates one copy and leaving clears the fragment", () => {
    const app = fresh();
    app.document.cookie = "spark_age_ok=1";
    app.state.location = { lat: 40.768211, lng: -111.893921, city: "Secret City Name" };
    app.state.filters.localOnly = true;
    const fetches = app.fetchCalls.length;
    let geo = 0;
    app.navigator.geolocation.getCurrentPosition = function(){ geo++; };
    const view = openPlan(app, named);
    const html = textOf(view);
    check("the view does not show the fix or a distance",
      html.indexOf("40.768211") === -1 && html.indexOf("-111.893921") === -1 &&
      html.indexOf("Secret City Name") === -1 && html.indexOf("mi away") === -1 &&
      html.indexOf("distance-badge") === -1, html.slice(0, 300));
    check("opening the view still makes no request", app.fetchCalls.length === fetches && geo === 0);

    const before = app.state.datePlans.length;
    const seen = app.state.seenIds.length;
    const first = app.saveSharedPlan({ name: "Friday Night", date: "2026-06-05", ideaIds: [3, 2, 424242] });
    check("the first save creates one plan", first.created === true && app.state.datePlans.length === before + 1, first && first.message);
    const row = app.state.datePlans[app.state.datePlans.length - 1];
    check("the copy has a new id", typeof row.id === "string" && /^plan_[0-9a-z]+_[0-9a-z]+$/.test(row.id) && row.id !== "plan-secret");
    check("the copy keeps the name, date, and resolved ideas in order",
      row.name === "Friday Night" && row.date === "2026-06-05" && JSON.stringify(row.ideaIds) === "[3,2]");
    check("the copy has no reactions, address, or coordinates",
      JSON.stringify(row.friendPicks) === "[]" && row.address === undefined && row.lat === undefined &&
      JSON.stringify(row).indexOf("40.768211") === -1 && JSON.stringify(row).indexOf("Secret City") === -1);
    check("the confirmation says it was saved", first.message === "Saved to your plans");
    check("saving does not swipe the deck or call the network",
      app.state.seenIds.length === seen && app.fetchCalls.length === fetches && geo === 0);
    check("saving leaves the fragment in place", app.window.location.hash.indexOf("#plan=") === 0);

    const second = app.saveSharedPlan({ name: "Friday Night", date: "2026-06-05", ideaIds: [3, 2, 424242] });
    check("a second tap does not add another copy", second.created === false && second.id === row.id && app.state.datePlans.length === before + 1);
    check("the second confirmation does not claim a new save", second.message === "Already in your plans");

    const other = app.saveSharedPlan({ name: "Saturday", date: "", ideaIds: [2] });
    check("a different plan can still be saved once", other.created === true && other.id !== row.id && app.state.datePlans.length === before + 2);

    const hash = app.window.location.hash;
    check("the fragment is still the plan link before leaving", hash.indexOf("#plan=") === 0);
    const decodedBeforeLeave = app.sharedPlanDecodeCount;
    app.leaveSharedPlan();
    check("leaving clears the plan fragment", app.window.location.hash.indexOf("#plan=") === -1, app.window.location.hash);
    const after = app.routeSharedPlan();
    check("the cleared fragment does not open the view again", after == null && app.sharedPlanDecodeCount === decodedBeforeLeave);
  });

  section("the shared view is not a swipe surface", () => {
    const cardSrc = between(appSrc, "function buildSharedPlanCard(idea)", "function sharedPlanIdeas(");
    check("shared cards reuse the card builder without attaching a swipe",
      cardSrc.indexOf("buildSwipeCard(") !== -1 &&
      cardSrc.indexOf(", false,") !== -1 &&
      cardSrc.indexOf("attachSwipeHandlers") === -1);
    const viewSrc = between(appSrc, "function buildSharedPlanView(plan)", "function showSharedPlanView(");
    check("the view is not mounted in the deck", viewSrc.indexOf("#deck") === -1 && viewSrc.indexOf("renderDeckCards") === -1);
  });

  return { pass: pass, fail: fail };
}

module.exports = main();
