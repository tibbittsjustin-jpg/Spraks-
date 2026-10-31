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
    ideaStatusBadge: ideaStatusBadge
  };
});
