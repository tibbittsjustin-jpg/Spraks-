/* ===================== Spark util.js =====================
 * Pure helpers: HTML escaping, calendar dates, the seeded hash/RNG
 * the cover art and external-idea ids both depend on, and the username
 * rules a future profiles table can share. Uniqueness is not decided here.
 *
 * No DOM, no app state. Loaded as a classic script before app.js so the
 * page still works from file:// and from the static server. Node tests
 * can require() this file directly; the browser path assigns window.SparkUtil
 * instead (there is no `module` in a classic script).
 * ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SparkUtil = api;
})(this, function () {
  "use strict";

  function escapeHtml(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }

  function fmtDate(d){
    // Parse "YYYY-MM-DD" as local calendar date components (not UTC) so the
    // displayed day never shifts backward/forward due to timezone offset.
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || "");
    var dt = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d);
    if(isNaN(dt.getTime())) return "";
    return dt.toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" });
  }

  function todayISO(){ return new Date().toISOString().slice(0,10); }

  // todayISO() is UTC, so west of Greenwich it rolls over to tomorrow during
  // the evening. localDateISO stays on the local calendar day.
  function pad2(n){ return (n < 10 ? "0" : "") + n; }
  function localDateISO(d){
    d = d || new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function hashStr(s){
    var h = 0;
    s = String(s || "");
    for(var i = 0; i < s.length; i++){ h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; }
    return h;
  }

  // Calendar age in UTC. A date of birth is only compared, never stored.
  function parseDobParts(value){
    if(typeof value !== "string") return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if(!m) return null;
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if(mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if(dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return { y: y, mo: mo, d: d };
  }

  function utcParts(now){
    var dt = now || new Date();
    return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }

  // Trim, then lowercase, then 3–20 of [a-z0-9_]. Empty is not a username.
  // This does not check that the name is free. That is a server concern.
  function validateUsername(value){
    if(typeof value !== "string") return { ok:false, error:"empty", message:"Enter a username." };
    var username = value.trim().toLowerCase();
    if(!username) return { ok:false, error:"empty", message:"Enter a username." };
    if(username.length < 3) return { ok:false, error:"too_short", message:"Use 3 to 20 characters: lowercase letters, numbers, and underscores." };
    if(username.length > 20) return { ok:false, error:"too_long", message:"Use 3 to 20 characters: lowercase letters, numbers, and underscores." };
    if(!/^[a-z0-9_]+$/.test(username)) return { ok:false, error:"invalid_chars", message:"Use lowercase letters, numbers, and underscores only." };
    return { ok:true, username:username };
  }

  function checkAge(dob, now){
    var parsed = parseDobParts(dob);
    if(!parsed) return { ok: false, error: "invalid_date" };
    var today = utcParts(now);
    var age = today.y - parsed.y;
    if(today.mo < parsed.mo || (today.mo === parsed.mo && today.d < parsed.d)) age--;
    if(age < 18) return { ok: false, blocked: true };
    return { ok: true };
  }

  function mulberry32(seed){
    var a = seed >>> 0;
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Authored time-of-day tags from the catalog. There is no clock time,
  // weekday, hours schedule, or event date on an idea. Nearby places copy
  // the active time filter (or all four tags) so they can pass the deck
  // filters — that array is not a schedule, so real ideas are left out here.
  var TIME_TAGS = ["Morning", "Afternoon", "Evening", "Night"];

  function knownTimes(idea){
    if(!idea || idea.isReal === true || idea.unavailable === true) return [];
    var raw = Array.isArray(idea.time) ? idea.time : [];
    var out = [];
    for(var i = 0; i < raw.length; i++){
      if(TIME_TAGS.indexOf(raw[i]) !== -1 && out.indexOf(raw[i]) === -1) out.push(raw[i]);
    }
    return out;
  }

  // Local 5:00pm through 11:59pm. openNow is a live "open at this moment"
  // flag, so it only counts as tonight while the clock is already in that
  // window. A place open at noon is not evidence it is open this evening.
  function isEveningClock(now){
    var dt = (now instanceof Date && !isNaN(now.getTime())) ? now : new Date();
    var hr = dt.getHours();
    return hr >= 17 && hr <= 23;
  }

  // Suits tonight when an authored tag is Evening or Night, or when the
  // place is open now and the local clock is in the evening window.
  function suitsTonight(idea, now){
    if(!idea || idea.unavailable === true) return false;
    var times = knownTimes(idea);
    for(var i = 0; i < times.length; i++){
      if(times[i] === "Evening" || times[i] === "Night") return true;
    }
    return idea.openNow === true && isEveningClock(now);
  }

  // A time pill only when every authored tag is Evening and/or Night.
  // An idea that also lists Morning or Afternoon is not labeled, because
  // one word would hide the daytime. No clock, weekday, or "8 pm" is invented.
  // Evening + Night → "Tonight". Evening alone → "Evening". Night alone → "Night".
  function timeBadgeLabel(idea){
    var times = knownTimes(idea);
    if(!times.length) return null;
    var evening = times.indexOf("Evening") !== -1;
    var night = times.indexOf("Night") !== -1;
    var daytime = times.indexOf("Morning") !== -1 || times.indexOf("Afternoon") !== -1;
    if(daytime || (!evening && !night)) return null;
    if(evening && night) return "Tonight";
    if(night) return "Night";
    return "Evening";
  }

  // One badge. "Open now" wins when that flag is exactly true. Otherwise
  // the time pill, or nothing.
  function ideaStatusBadge(idea){
    if(!idea || idea.unavailable === true) return null;
    if(idea.openNow === true) return { kind: "open", label: "Open now" };
    var label = timeBadgeLabel(idea);
    if(!label) return null;
    return { kind: "time", label: label };
  }

  // A public website link. Parse with URL and keep only https:// pages
  // that have a host and no username or password. http, javascript:, data:,
  // blank, and anything URL cannot parse are dropped.
  function httpsPageUrl(value){
    if(typeof value !== "string") return "";
    var trimmed = value.trim();
    if(!trimmed || /\s/.test(trimmed)) return "";
    if(!/^https:\/\//i.test(trimmed)) return "";
    var parsed;
    try {
      parsed = new URL(trimmed);
    } catch (err) {
      return "";
    }
    if(parsed.protocol !== "https:") return "";
    if(parsed.username || parsed.password) return "";
    if(!parsed.hostname) return "";
    if(parsed.href.slice(0, 8).toLowerCase() !== "https://") return "";
    return parsed.href;
  }

  // Prefer source_url. An invalid source_url does not fall through.
  // sourceUrl is the same field from the activities API. url is the
  // optional website on a built-in idea.
  function activityWebsite(idea){
    if(!idea || typeof idea !== "object") return "";
    function present(key){
      if(!Object.prototype.hasOwnProperty.call(idea, key)) return false;
      var value = idea[key];
      return value != null && String(value).trim() !== "";
    }
    if(present("source_url")) return httpsPageUrl(idea.source_url);
    if(present("sourceUrl")) return httpsPageUrl(idea.sourceUrl);
    if(present("url")) return httpsPageUrl(idea.url);
    return "";
  }

  // Shared direction lock for a pointer gesture. Stays undecided until
  // travel leaves a 10px slop, then locks for the rest of the gesture:
  // vertical when |dy| wins, horizontal only when |dx| > 1.5×|dy|.
  // Callers decide what a locked axis does (scroll, drag, delete, recap).
  var SWIPE_SLOP_PX = 10;
  var SWIPE_HORIZONTAL_RATIO = 1.5;
  var SWIPE_COMMIT_FRACTION = 0.32;
  var SWIPE_FLICK_PX_PER_MS = 0.6;
  var SWIPE_FLICK_MIN_PX = 32;
  var SWIPE_FALLBACK_WIDTH = 360;

  function lockSwipeAxis(dx, dy, locked){
    if(locked === "vertical" || locked === "horizontal") return locked;
    dx = Number(dx) || 0;
    dy = Number(dy) || 0;
    var adx = Math.abs(dx), ady = Math.abs(dy);
    if(adx <= SWIPE_SLOP_PX && ady <= SWIPE_SLOP_PX) return null;
    if(ady > adx) return "vertical";
    if(adx > SWIPE_HORIZONTAL_RATIO * ady) return "horizontal";
    return null;
  }

  // Discover card commit. phase "move" → pending | scroll | drag.
  // phase "end" → tap | scroll | snap | save | pass.
  // save is rightward, pass is leftward. Pass the locked axis back in
  // so a later sample cannot flip the gesture.
  function resolveCardSwipe(state){
    state = state || {};
    var dx = Number(state.dx) || 0;
    var dy = Number(state.dy) || 0;
    var axis = lockSwipeAxis(dx, dy, state.axis || null);
    var phase = state.phase === "end" ? "end" : "move";
    if(phase === "move"){
      if(axis === "vertical") return { axis: "vertical", action: "scroll" };
      if(axis === "horizontal") return { axis: "horizontal", action: "drag" };
      return { axis: null, action: "pending" };
    }
    if(axis === "vertical") return { axis: "vertical", action: "scroll" };
    if(axis !== "horizontal"){
      if(Math.abs(dx) <= SWIPE_SLOP_PX && Math.abs(dy) <= SWIPE_SLOP_PX) return { axis: null, action: "tap" };
      return { axis: null, action: "snap" };
    }
    var width = Number(state.cardWidth);
    if(!(width > 40)) width = SWIPE_FALLBACK_WIDTH;
    var threshold = width * SWIPE_COMMIT_FRACTION;
    var travel = Math.abs(dx);
    var velocityX = Number(state.velocityX) || 0;
    var sameWay = (velocityX > 0 && dx > 0) || (velocityX < 0 && dx < 0);
    var flick = sameWay
      && Math.abs(velocityX) >= SWIPE_FLICK_PX_PER_MS
      && travel >= SWIPE_FLICK_MIN_PX
      && travel > SWIPE_HORIZONTAL_RATIO * Math.abs(dy);
    if((travel >= threshold || flick) && dx !== 0){
      return { axis: "horizontal", action: dx > 0 ? "save" : "pass", threshold: threshold };
    }
    return { axis: "horizontal", action: "snap", threshold: threshold };
  }

  // A finished date can carry a personal rating (1–5), a one-line recap,
  // and a key for a photo stored outside localStorage. Older done rows
  // are only {id, date}. Those stay valid and sort as unrated.
  var RECAP_MAX = 120;
  var PHOTO_LONG_EDGE = 1080;

  function normalizeRating(value){
    if(typeof value === "string" && value.trim() !== "") value = Number(value);
    if(typeof value !== "number" || !isFinite(value)) return null;
    if(Math.round(value) !== value) return null;
    if(value < 1 || value > 5) return null;
    return value;
  }

  function normalizeRecap(value){
    if(value == null) return "";
    var text = String(value).replace(/[\r\n]+/g, " ").trim();
    var chars = Array.from(text);
    if(chars.length <= RECAP_MAX) return text;
    return chars.slice(0, RECAP_MAX).join("").trim();
  }

  function migrateDoneEntry(entry){
    if(!entry || typeof entry !== "object") return entry;
    var next = {};
    for(var k in entry){
      if(Object.prototype.hasOwnProperty.call(entry, k)) next[k] = entry[k];
    }
    var rating = normalizeRating(entry.rating);
    if(rating) next.rating = rating;
    else if(Object.prototype.hasOwnProperty.call(next, "rating")) delete next.rating;
    if(Object.prototype.hasOwnProperty.call(entry, "recap")){
      var recap = normalizeRecap(entry.recap);
      if(recap) next.recap = recap;
      else delete next.recap;
    }
    if(Object.prototype.hasOwnProperty.call(next, "photoKey")){
      if(typeof next.photoKey !== "string" || !next.photoKey.trim()) delete next.photoKey;
      else next.photoKey = next.photoKey.trim();
    }
    return next;
  }

  // Highest personal rating first. Unrated rows go last. A tie — including
  // two unrated rows — keeps the most recently done date first.
  function compareDoneEntries(a, b){
    var ar = normalizeRating(a && a.rating) || 0;
    var br = normalizeRating(b && b.rating) || 0;
    var aRated = ar > 0;
    var bRated = br > 0;
    if(aRated !== bRated) return aRated ? -1 : 1;
    if(ar !== br) return br - ar;
    var ad = a && a.date ? String(a.date) : "";
    var bd = b && b.date ? String(b.date) : "";
    if(ad !== bd) return ad < bd ? 1 : -1;
    return 0;
  }

  function sortedDoneEntries(list){
    return (Array.isArray(list) ? list.slice() : []).sort(compareDoneEntries);
  }

  // Stars are required. Without one, the row is left untouched so a recap
  // or photo key cannot be saved on its own. Image bytes are never copied
  // onto the entry; only an optional photoKey is.
  function applyDoneRecap(entry, draft){
    if(!entry || typeof entry !== "object") return { ok:false, error:"missing" };
    draft = draft || {};
    var rating = normalizeRating(draft.rating);
    if(!rating) return { ok:false, error:"rating" };
    entry.rating = rating;
    var recap = normalizeRecap(draft.recap);
    if(recap) entry.recap = recap;
    else delete entry.recap;
    if(draft.removePhoto) delete entry.photoKey;
    else if(typeof draft.photoKey === "string" && draft.photoKey.trim()) entry.photoKey = draft.photoKey.trim();
    return { ok:true, entry:entry };
  }

  function moveStarRating(current, key){
    var rating = normalizeRating(current) || 0;
    if(key === "ArrowRight" || key === "ArrowUp") return Math.min(5, rating + 1);
    if(key === "ArrowLeft" || key === "ArrowDown") return rating <= 1 ? 1 : rating - 1;
    if(key === "Home") return 1;
    if(key === "End") return 5;
    if(key === "1" || key === "2" || key === "3" || key === "4" || key === "5") return Number(key);
    return rating || null;
  }

  // Long edge capped around 1080px. Smaller photos keep their pixel size;
  // the caller still re-encodes them so the original file is not stored.
  function fitLongEdge(width, height, maxEdge){
    var w = Number(width);
    var h = Number(height);
    var max = Number(maxEdge);
    if(!isFinite(max) || max <= 0) max = PHOTO_LONG_EDGE;
    if(!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return null;
    var longEdge = Math.max(w, h);
    if(longEdge <= max) return { width: Math.round(w), height: Math.round(h) };
    var scale = max / longEdge;
    return {
      width: Math.max(1, Math.round(w * scale)),
      height: Math.max(1, Math.round(h * scale))
    };
  }

  return {
    escapeHtml: escapeHtml,
    httpsPageUrl: httpsPageUrl,
    activityWebsite: activityWebsite,
    fmtDate: fmtDate,
    todayISO: todayISO,
    pad2: pad2,
    localDateISO: localDateISO,
    hashStr: hashStr,
    validateUsername: validateUsername,
    checkAge: checkAge,
    mulberry32: mulberry32,
    knownTimes: knownTimes,
    isEveningClock: isEveningClock,
    suitsTonight: suitsTonight,
    timeBadgeLabel: timeBadgeLabel,
    ideaStatusBadge: ideaStatusBadge,
    SWIPE_SLOP_PX: SWIPE_SLOP_PX,
    SWIPE_HORIZONTAL_RATIO: SWIPE_HORIZONTAL_RATIO,
    SWIPE_COMMIT_FRACTION: SWIPE_COMMIT_FRACTION,
    SWIPE_FLICK_PX_PER_MS: SWIPE_FLICK_PX_PER_MS,
    SWIPE_FLICK_MIN_PX: SWIPE_FLICK_MIN_PX,
    SWIPE_FALLBACK_WIDTH: SWIPE_FALLBACK_WIDTH,
    lockSwipeAxis: lockSwipeAxis,
    resolveCardSwipe: resolveCardSwipe,
    RECAP_MAX: RECAP_MAX,
    PHOTO_LONG_EDGE: PHOTO_LONG_EDGE,
    normalizeRating: normalizeRating,
    normalizeRecap: normalizeRecap,
    migrateDoneEntry: migrateDoneEntry,
    compareDoneEntries: compareDoneEntries,
    sortedDoneEntries: sortedDoneEntries,
    applyDoneRecap: applyDoneRecap,
    moveStarRating: moveStarRating,
    fitLongEdge: fitLongEdge
  };
});
