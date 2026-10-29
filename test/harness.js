/* Minimal browser stub so the real app.js can be loaded in node and its
   internals poked at. Nothing here is app logic — it just keeps the DOM
   and storage calls from throwing. */
const fs = require("fs"), vm = require("vm"), path = require("path");
const ROOT = process.env.SPARK_ROOT || path.join(__dirname, "..", "public");

function fakeEl() {
  const e = {
    style: {}, dataset: {}, value: "", textContent: "", innerHTML: "",
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, removeEventListener(){}, appendChild(){}, setAttribute(){},
    getAttribute(){ return null; }, replaceChild(){}, querySelector(){ return fakeEl(); },
    querySelectorAll(){ return []; }, insertBefore(){}, remove(){}, focus(){}, click(){},
    get parentNode(){ return fakeEl(); }, get firstChild(){ return null; },
  };
  return e;
}

function makeSandbox(storage) {
  const document = {
    documentElement: fakeEl(), body: fakeEl(),
    querySelector(){ return fakeEl(); }, querySelectorAll(){ return []; },
    getElementById(){ return fakeEl(); }, createElement(){ return fakeEl(); },
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
    fetch: () => new Promise(() => {}),        // never resolves: no network in tests
    setTimeout(){}, setInterval(){}, clearTimeout(){}, clearInterval(){},
    console, Math, Date, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat,
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
  ["data.js", "motifs.js", "util.js"].forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
  });
  let src = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const hook = `
  window.__t = {
    get state(){ return state; },
    IDEAS_BY_ID: IDEAS_BY_ID, REAL_IDEAS_RUNTIME: REAL_IDEAS_RUNTIME,
    hydrateRealIdea: hydrateRealIdea, saveState: saveState,
    addIdeaToBucket: addIdeaToBucket, removeIdeaFromBucket: removeIdeaFromBucket,
    totalSavedCount: totalSavedCount,
    isRealId: (typeof isRealId === "function") ? isRealId : function(id){ return typeof id==="number" && id>=9000000 && id<10000000; },
    hydrateEventIdea: hydrateEventIdea, isPastEvent: isPastEvent,
    upcomingEvents: upcomingEvents, displayCost: displayCost,
    localDateISO: localDateISO, eventRadius: eventRadius,
    computeDeck: computeDeck, matchesFilters: matchesFilters,
    buildSwipeCard: buildSwipeCard, ideaPhoto: ideaPhoto,
    EVENTS_IN_DECK: EVENTS_IN_DECK,
    get EVENT_IDEAS_RUNTIME(){ return EVENT_IDEAS_RUNTIME; },
    set EVENT_IDEAS_RUNTIME(v){ EVENT_IDEAS_RUNTIME = v; },
    copyText: copyText,
    shareOrCopy: shareOrCopy,
    presentCopy: presentCopy,
    presentShare: presentShare,
    getInviteLink: getInviteLink,
    commitFriendPick: commitFriendPick,
    planShareState: planShareState,
    get navigator(){ return navigator; },
    get document(){ return document; },
  };
`;
  const anchor = "\n  boot();\n})();";
  if (src.split(anchor).length - 1 !== 1) throw new Error("boot anchor not found");
  src = src.replace(anchor, "\n  boot();\n" + hook + "})();");
  vm.runInContext(src, sandbox, { filename: "app.js" });
  return sandbox.window.__t;
}

module.exports = { loadApp };
