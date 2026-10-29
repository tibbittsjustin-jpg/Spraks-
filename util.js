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
  // the evening — which would make an event vanish from the list hours before
  // it actually starts. Events compare against the LOCAL calendar day instead.
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
    mulberry32: mulberry32
  };
});
