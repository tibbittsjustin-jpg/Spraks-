/* ===================== Spark util.js =====================
 * Pure helpers: HTML escaping, calendar dates, and the seeded hash/RNG
 * the cover art and external-idea ids both depend on.
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

  return {
    escapeHtml: escapeHtml,
    fmtDate: fmtDate,
    todayISO: todayISO,
    pad2: pad2,
    localDateISO: localDateISO,
    hashStr: hashStr,
    checkAge: checkAge,
    mulberry32: mulberry32
  };
});
