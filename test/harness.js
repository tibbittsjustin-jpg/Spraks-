/* Minimal browser stub so the real app.js can be loaded in node and its
   internals poked at. Nothing here is app logic — it just keeps the DOM
   and storage calls from throwing. */
const fs = require("fs"), vm = require("vm"), path = require("path");
const ROOT = process.env.SPARK_ROOT || path.join(__dirname, "..", "public");

function fakeEl(tag) {
  const attrs = Object.create(null);
  const e = {
    style: {}, dataset: {}, value: "", textContent: "", innerHTML: "", children: [],
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, removeEventListener(){},
    appendChild(child){ this.children.push(child); return child; },
    setAttribute(name, value){ attrs[String(name)] = String(value); },
    getAttribute(name){
      return Object.prototype.hasOwnProperty.call(attrs, String(name)) ? attrs[String(name)] : null;
    },
    replaceChild(){}, querySelector(){ return fakeEl(); },
    querySelectorAll(){ return []; }, insertBefore(){}, remove(){}, focus(){}, click(){},
    get parentNode(){ return fakeEl(); }, get firstChild(){ return null; },
  };
  if (tag) e.tagName = String(tag).toUpperCase();
  return e;
}

function makeSandbox(storage) {
  const document = {
    documentElement: fakeEl(), body: fakeEl(),
    querySelector(){ return fakeEl(); }, querySelectorAll(){ return []; },
    getElementById(){ return fakeEl(); }, createElement(tag){ return fakeEl(tag); },
    addEventListener(){},
  };
  const sandbox = {
    document,
    window: { location: { reload(){} }, addEventListener(){} },
    navigator: { geolocation: { getCurrentPosition(){} } },
    localStorage: {
      _d: storage,
      getItem(k){ return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
      setItem(k, v){ this._d[k] = String(v); },
      removeItem(k){ delete this._d[k]; },
    },
    __net: { calls: [], fetch: function(){ return new Promise(function(){}); } },
    setTimeout(){}, setInterval(){}, clearTimeout(){}, clearInterval(){},
    console, Math, Date, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat, URL,
    fetch: function(){
      sandbox.__net.calls.push(Array.prototype.slice.call(arguments));
      return sandbox.__net.fetch.apply(null, arguments);
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  return sandbox;
}

// Boots a fresh "page load" against the given localStorage contents and hands
// back the app's internals. app.js on disk is untouched — the export hook is
// appended to the source string only.
function loadApp(storage) {
  const sandbox = makeSandbox(storage);
  vm.createContext(sandbox);
  ["data.js", "motifs.js", "util.js", "occurrences.js", "radius.js", "pins.js", "photos.js", "submit.js", "remote-activities.js"].forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
  });
  let src = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const hook = `
  window.__t = {
    get state(){ return state; },
    IDEAS_BY_ID: IDEAS_BY_ID, REAL_IDEAS_RUNTIME: REAL_IDEAS_RUNTIME,
    REMOTE_IDEAS: REMOTE_IDEAS, applyRemoteIdeas: applyRemoteIdeas,
    hydrateRealIdea: hydrateRealIdea, saveState: saveState,
    addIdeaToBucket: addIdeaToBucket, removeIdeaFromBucket: removeIdeaFromBucket,
    totalSavedCount: totalSavedCount,
    isRealId: (typeof isRealId === "function") ? isRealId : function(id){ return typeof id==="number" && id>=9000000 && id<10000000; },
    displayCost: displayCost,
    localDateISO: localDateISO,
    computeDeck: computeDeck, matchesFilters: matchesFilters, placeLabel: placeLabel,
    nearYouLabel: nearYouLabel, ideaDistanceMiles: ideaDistanceMiles,
    distanceAwayLabel: distanceAwayLabel, ideaHasKnownPlace: ideaHasKnownPlace,
    buildWhereGroup: buildWhereGroup, countIdeasMatching: countIdeasMatching,
    formatShowIdeas: formatShowIdeas,
    suitsTonight: function(idea, now){ return SparkUtil.suitsTonight(idea, now); },
    timeBadgeLabel: function(idea){ return SparkUtil.timeBadgeLabel(idea); },
    ideaStatusBadge: function(idea){ return SparkUtil.ideaStatusBadge(idea); },
    tonightMatchCount: tonightMatchCount, toggleTonightFilter: toggleTonightFilter,
    buildDiscoverScreen: buildDiscoverScreen,
    buildSwipeCard: buildSwipeCard, buildIdeaRow: buildIdeaRow,
    buildFriendIdeaRow: buildFriendIdeaRow,
    buildSavedCard: buildSavedCard, buildSavedScreen: buildSavedScreen,
    buildDoneScreen: buildDoneScreen, buildDoneSubpanel: buildDoneSubpanel,
    buildDoneRecapForm: buildDoneRecapForm, commitDoneRecap: commitDoneRecap,
    openDoneRecap: openDoneRecap,
    listSavedFolders: listSavedFolders, pinPlan: pinPlan, unpinPlan: unpinPlan,
    togglePlanLike: togglePlanLike,
    deletePlan: deletePlan, ideaIsPast: ideaIsPast, planDeleteMessage: planDeleteMessage,
    ideaForSaved: ideaForSaved,
    get ui(){ return ui; },
    buildDetailScreen: buildDetailScreen, ideaPhoto: ideaPhoto,
    FILTER_DEFS: FILTER_DEFS, activeFilterCount: activeFilterCount,
    finishOnboarding: finishOnboarding, ageGateSatisfied: ageGateSatisfied,
    MINIMUM_AGE: MINIMUM_AGE, parseProfileAge: parseProfileAge,
    setFetch: function(fn){ __net.fetch = fn; },
    copyText: copyText,
    shareOrCopy: shareOrCopy,
    presentCopy: presentCopy,
    presentShare: presentShare,
    encodePlanShare: encodePlanShare,
    decodePlanShare: decodePlanShare,
    planShareUrl: planShareUrl,
    planShareOmittedCount: planShareOmittedCount,
    planShareOmissionNote: planShareOmissionNote,
    PLAN_SHARE_MAX_CHARS: PLAN_SHARE_MAX_CHARS,
    routeSharedPlan: routeSharedPlan,
    submitSharedPlanAge: submitSharedPlanAge,
    readAgeOkCookie: readAgeOkCookie,
    writeAgeOkCookie: writeAgeOkCookie,
    sharedPlanGatePassed: sharedPlanGatePassed,
    buildSharedPlanView: buildSharedPlanView,
    saveSharedPlan: saveSharedPlan,
    leaveSharedPlan: leaveSharedPlan,
    clearPlanFragment: clearPlanFragment,
    get sharedPlanDecodeCount(){ return sharedPlanDecodeCount; },
    getInviteLink: getInviteLink,
    commitFriendPick: commitFriendPick,
    planShareState: planShareState,
    validateUsername: validateUsername,
    profileUsernameLine: profileUsernameLine,
    blockedPeopleButtonHtml: blockedPeopleButtonHtml,
    buildUsernameSafetyMenu: buildUsernameSafetyMenu,
    buildSafetyMenuPanel: buildSafetyMenuPanel,
    buildBlockPanel: buildBlockPanel,
    buildReportPanel: buildReportPanel,
    buildBlockedPeoplePanel: buildBlockedPeoplePanel,
    openUsernameSafety: openUsernameSafety,
    submitBlock: submitBlock,
    submitUnblock: submitUnblock,
    submitReport: submitReport,
    submittedIdeasLabel: submittedIdeasLabel,
    renderProfileHeader: renderProfileHeader,
    applyProfileEdits: applyProfileEdits,
    submitProfileEdits: submitProfileEdits,
    recordSubmittedIdea: recordSubmittedIdea,
    buildEditProfileSubpanel: buildEditProfileSubpanel,
    buildIdeaSubmitSubpanel: buildIdeaSubmitSubpanel,
    finishSubmission: finishSubmission,
    confirmSubmissionBirthday: confirmSubmissionBirthday,
    get onboardingRestarts(){ return onboardingRestarts; },
    get lastToastMessage(){ return lastToastMessage; },
    fetchCalls: __net.calls,
    get navigator(){ return navigator; },
    get document(){ return document; },
    get window(){ return window; },
  };
`;
  const anchor = "\n  boot();\n})();";
  if (src.split(anchor).length - 1 !== 1) throw new Error("boot anchor not found");
  src = src.replace(anchor, "\n  boot();\n" + hook + "})();");
  vm.runInContext(src, sandbox, { filename: "app.js" });
  return sandbox.window.__t;
}

module.exports = { loadApp };
