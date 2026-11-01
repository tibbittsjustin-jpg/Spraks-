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

  // One minimum for every gate. The browser and the server both read this.
  var MINIMUM_AGE = 18;
  var AGE_TIME_ZONE = "America/Denver";

  // Calendar age in America/Denver. A date of birth is only compared, never stored.
  // UTC would turn the evening before a birthday into "already 18" in Utah.
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

  function denverParts(now){
    var dt = (now instanceof Date && !isNaN(now.getTime())) ? now : new Date();
    var fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: AGE_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    var bag = { year: 0, month: 0, day: 0 };
    var parts = fmt.formatToParts(dt);
    for(var i = 0; i < parts.length; i++){
      var part = parts[i];
      if(part.type === "year" || part.type === "month" || part.type === "day") bag[part.type] = Number(part.value);
    }
    return { y: bag.year, mo: bag.month, d: bag.day };
  }

  function daysInMonth(year, month){
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  // Latest birth date that is already MINIMUM_AGE on this Denver calendar day.
  function latestDob(now){
    var today = denverParts(now);
    var year = today.y - MINIMUM_AGE;
    var day = today.d;
    var dim = daysInMonth(year, today.mo);
    if(day > dim) day = dim;
    return year + "-" + pad2(today.mo) + "-" + pad2(day);
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

  // Lookalikes: drop underscores, then map 0/1/3/4/5/7 onto letters.
  // 1 is tried as both i and l. Profanity strips digits instead of mapping
  // them, so this stays next to the reserved-name check. validateUsername
  // does not call it, so a signed-out local name is unchanged.
  var LOOKALIKE_I = { "0":"o", "1":"i", "3":"e", "4":"a", "5":"s", "7":"t" };
  var LOOKALIKE_L = { "0":"o", "1":"l", "3":"e", "4":"a", "5":"s", "7":"t" };
  var RESERVED_CONTAINS = ["spark", "jaderoo", "admin", "support", "official", "moderator"];
  var RESERVED_EXACT = ["mod", "help"];

  function mapLookalikeDigits(text, digitMap){
    var out = "";
    for(var i = 0; i < text.length; i++){
      var c = text.charAt(i);
      out += digitMap[c] || c;
    }
    return out;
  }

  function reservedUsername(value){
    var checked = validateUsername(value);
    var username = checked.ok ? checked.username : String(value == null ? "" : value).trim().toLowerCase();
    if(!username) return false;
    var base = username.replace(/_/g, "");
    var forms = [mapLookalikeDigits(base, LOOKALIKE_I), mapLookalikeDigits(base, LOOKALIKE_L)];
    for(var f = 0; f < forms.length; f++){
      for(var i = 0; i < RESERVED_CONTAINS.length; i++){
        if(forms[f].indexOf(RESERVED_CONTAINS[i]) !== -1) return true;
      }
    }
    // mod and help are exact, after leading and trailing digits are
    // removed and before the remaining digits are mapped. "mod1" is
    // reserved. "model" and "modern_mike" are not.
    var trimmed = base.replace(/^[0-9]+/, "").replace(/[0-9]+$/, "");
    var exactForms = [mapLookalikeDigits(trimmed, LOOKALIKE_I), mapLookalikeDigits(trimmed, LOOKALIKE_L)];
    for(var e = 0; e < exactForms.length; e++){
      if(RESERVED_EXACT.indexOf(exactForms[e]) !== -1) return true;
    }
    return false;
  }

  // Calendar day in America/Denver, YYYY-MM-DD. Used for hold and
  // username-change dates so the evening before midnight UTC stays
  // on the Utah day.
  function denverDay(value){
    var dt = (value instanceof Date) ? value : (value == null ? new Date() : new Date(value));
    if(isNaN(dt.getTime())) return "";
    var parts = denverParts(dt);
    return parts.y + "-" + pad2(parts.mo) + "-" + pad2(parts.d);
  }

  function checkAge(dob, now){
    var parsed = parseDobParts(dob);
    if(!parsed) return { ok: false, error: "invalid_date" };
    var today = denverParts(now);
    var age = today.y - parsed.y;
    if(today.mo < parsed.mo || (today.mo === parsed.mo && today.d < parsed.d)) age--;
    if(age < MINIMUM_AGE) return { ok: false, blocked: true };
    return { ok: true };
  }

  // spark_age_ok=1, kept for a year, sent on this site only.
  // Secure is added only for https. The name and these attributes stay as they are.
  function ageOkCookie(secure){
    var cookie = "spark_age_ok=1; Max-Age=31536000; Path=/; SameSite=Lax";
    if(secure) cookie += "; Secure";
    return cookie;
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

  // A planning-list row is a bare id (older saves) or { id, likedAt }.
  // likedAt is a positive timestamp. Missing, zero, or junk means not liked.
  // Group lists can store the same shape and call these helpers directly.
  function normalizeLikedAt(value){
    if(typeof value === "string" && value.trim() !== "") value = Number(value);
    if(typeof value !== "number" || !isFinite(value) || value <= 0) return null;
    return value;
  }

  function listItemId(item){
    if(item && typeof item === "object"){
      if(Object.prototype.hasOwnProperty.call(item, "id")) return item.id;
      return null;
    }
    return item;
  }

  function itemLikedAt(item){
    if(!item || typeof item !== "object") return null;
    return normalizeLikedAt(item.likedAt);
  }

  function isItemLiked(item){
    return itemLikedAt(item) != null;
  }

  function listItemsFrom(ids, likes){
    var source = Array.isArray(ids) ? ids : [];
    var map = (likes && typeof likes === "object" && !Array.isArray(likes)) ? likes : {};
    var out = [];
    for(var i = 0; i < source.length; i++){
      var raw = source[i];
      var id = listItemId(raw);
      if(id == null || id === "") continue;
      var at = itemLikedAt(raw);
      if(at == null){
        var key = String(id);
        if(Object.prototype.hasOwnProperty.call(map, key)) at = normalizeLikedAt(map[key]);
        else if(Object.prototype.hasOwnProperty.call(map, id)) at = normalizeLikedAt(map[id]);
      }
      out.push({ id: id, likedAt: at });
    }
    return out;
  }

  function likesMapEqual(a, b){
    var ak = Object.keys(a);
    var bk = Object.keys(b);
    if(ak.length !== bk.length) return false;
    for(var i = 0; i < ak.length; i++){
      if(!Object.prototype.hasOwnProperty.call(b, ak[i])) return false;
      if(a[ak[i]] !== b[ak[i]]) return false;
    }
    return true;
  }

  // Older plans have no likes field: every activity stays not liked.
  // Item objects are flattened back to ids so the rest of the app can
  // keep using indexOf. Invalid timestamps and likes for missing ids drop.
  // Returns true when the stored plan should be written back.
  function migrateListLikes(plan){
    if(!plan || typeof plan !== "object" || Array.isArray(plan)) return false;
    var changed = false;
    var ids = Array.isArray(plan.ideaIds) ? plan.ideaIds : null;
    var embedded = Object.create(null);
    if(ids){
      var flat = [];
      var flattened = false;
      for(var i = 0; i < ids.length; i++){
        var item = ids[i];
        if(item && typeof item === "object"){
          flattened = true;
          if(item.id == null || item.id === "") continue;
          flat.push(item.id);
          var embeddedAt = normalizeLikedAt(item.likedAt);
          if(embeddedAt != null) embedded[String(item.id)] = embeddedAt;
        } else if(item != null && item !== ""){
          flat.push(item);
        } else {
          flattened = true;
        }
      }
      if(flattened){
        plan.ideaIds = flat;
        changed = true;
      }
    }
    var currentIds = Array.isArray(plan.ideaIds) ? plan.ideaIds : [];
    var allowed = Object.create(null);
    for(var j = 0; j < currentIds.length; j++){
      var current = currentIds[j];
      if(current == null || current === "") continue;
      allowed[String(current)] = true;
    }
    var had = Object.prototype.hasOwnProperty.call(plan, "likes");
    var raw = plan.likes;
    var rawOk = !!raw && typeof raw === "object" && !Array.isArray(raw);
    var next = {};
    Object.keys(embedded).forEach(function(k){
      if(allowed[k]) next[k] = embedded[k];
    });
    if(rawOk){
      Object.keys(raw).forEach(function(k){
        var at = normalizeLikedAt(raw[k]);
        if(at == null) return;
        var key = String(k);
        if(!allowed[key]) return;
        next[key] = at;
      });
    }
    if(Object.keys(next).length === 0){
      if(had){
        delete plan.likes;
        return true;
      }
      return changed;
    }
    if(had && rawOk && likesMapEqual(raw, next)) return changed;
    plan.likes = next;
    return true;
  }

  function compareLikedItems(a, b){
    var at = itemLikedAt(a);
    var bt = itemLikedAt(b);
    var aLiked = at != null;
    var bLiked = bt != null;
    if(aLiked !== bLiked) return aLiked ? -1 : 1;
    if(aLiked && at !== bt) return bt - at;
    var ao = a && typeof a.order === "number" ? a.order : 0;
    var bo = b && typeof b.order === "number" ? b.order : 0;
    if(ao !== bo) return ao - bo;
    return 0;
  }

  function sortLikedItems(items){
    return (Array.isArray(items) ? items.slice() : []).map(function(item, i){
      return { item: item, i: i };
    }).sort(function(a, b){
      return compareLikedItems(a.item, b.item) || (a.i - b.i);
    }).map(function(row){ return row.item; });
  }

  // Newest-saved first, then a friend's pick floats above other unliked
  // rows. Liked rows move above all of that, most recently liked first.
  // `order` on the result is the pre-like position so ties stay stable.
  function orderSavedActivities(ids, likes, friendPicks){
    var likedById = Object.create(null);
    listItemsFrom(ids, likes).forEach(function(item){
      likedById[String(item.id)] = item.likedAt;
    });
    var ordered = Array.isArray(ids) ? ids.slice().reverse() : [];
    var picked = [];
    var rest = [];
    ordered.forEach(function(raw){
      var id = listItemId(raw);
      if(id == null || id === "") return;
      var hasPick = (friendPicks || []).some(function(p){ return p && p.ideaId === id; });
      (hasPick ? picked : rest).push(id);
    });
    var rows = picked.concat(rest).map(function(id, i){
      var key = String(id);
      var at = Object.prototype.hasOwnProperty.call(likedById, key) ? likedById[key] : null;
      return { id: id, likedAt: at, order: i };
    });
    return sortLikedItems(rows);
  }

  function toggleListLike(plan, ideaId, now){
    if(!plan || !Array.isArray(plan.ideaIds) || plan.ideaIds.indexOf(ideaId) === -1) return false;
    var key = String(ideaId);
    var likes = (plan.likes && typeof plan.likes === "object" && !Array.isArray(plan.likes)) ? plan.likes : {};
    if(normalizeLikedAt(likes[key])) delete likes[key];
    else {
      var at = normalizeLikedAt(now);
      likes[key] = at == null ? Date.now() : at;
    }
    if(Object.keys(likes).length) plan.likes = likes;
    else delete plan.likes;
    return true;
  }

  function forgetListLike(plan, ideaId){
    if(!plan || !plan.likes || typeof plan.likes !== "object" || Array.isArray(plan.likes)) return false;
    var key = String(ideaId);
    if(!Object.prototype.hasOwnProperty.call(plan.likes, key)) return false;
    delete plan.likes[key];
    if(!Object.keys(plan.likes).length) delete plan.likes;
    return true;
  }

  // Shared label and class names for a liked row. Past rows stay past;
  // `muted` tells the caller to soften the accent instead of dropping it.
  function likedItemPresentation(item, opts){
    opts = opts || {};
    var liked = isItemLiked(item);
    var past = opts.past === true;
    var classes = [];
    if(liked) classes.push("is-liked");
    if(past) classes.push("is-past");
    return {
      liked: liked,
      past: past,
      muted: liked && past,
      badge: liked ? "Top pick" : "",
      className: classes.join(" ")
    };
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
    reservedUsername: reservedUsername,
    denverDay: denverDay,
    MINIMUM_AGE: MINIMUM_AGE,
    AGE_TIME_ZONE: AGE_TIME_ZONE,
    latestDob: latestDob,
    checkAge: checkAge,
    ageOkCookie: ageOkCookie,
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
    normalizeLikedAt: normalizeLikedAt,
    listItemId: listItemId,
    itemLikedAt: itemLikedAt,
    isItemLiked: isItemLiked,
    listItemsFrom: listItemsFrom,
    migrateListLikes: migrateListLikes,
    compareLikedItems: compareLikedItems,
    sortLikedItems: sortLikedItems,
    orderSavedActivities: orderSavedActivities,
    toggleListLike: toggleListLike,
    forgetListLike: forgetListLike,
    likedItemPresentation: likedItemPresentation,
    applyDoneRecap: applyDoneRecap,
    moveStarRating: moveStarRating,
    fitLongEdge: fitLongEdge
  };
});
