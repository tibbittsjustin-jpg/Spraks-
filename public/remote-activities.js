/* Approved activities from GET /api/activities, shaped like deck ideas.

   The built-in catalog renders immediately. This module pages through the
   approved list, maps each row onto the idea shape the deck already
   filters, and caches that list on the phone. A slow or failed request
   never throws and never replaces the built-in ideas.

   Location leaves the device only after it is rounded to two decimals
   (about a kilometer), the same coarsening the server uses. No device id
   is read or sent. Loaded before app.js. Node tests require() this file.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SparkRemoteActivities = api;
})(this, function () {
  "use strict";

  // 7: ideas carry audience. A version 6 cache has no audience field, so it
  // is not reused. Empty and missing audience stay empty. A selected chip
  // does not match an empty list.
  // 6: cached ideas carry costUnit. Budget labels are the $20 bands.
  // A version 5 cache has no costUnit, so it is not reused.
  // 5: saved lists also cache catalog rows fetched by id. Those rows keep
  // the numeric id the list stored. A version 4 cache was pages only.
  // 4: pages are a cursor, not an offset dump.
  // 3 added source_key and source_credit.
  var API_VERSION = "7";
  var CATALOG_BUCKET = "catalog-ids";
  var ID_BATCH = 200;
  var CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  var STORAGE_KEY = "spark_remote_activities_v1";
  var PAGE_LIMIT = 100;
  // One page unless the caller raises maxItems. The deck asks for the next
  // cursor as the person swipes, instead of downloading the catalog.
  var MAX_ITEMS = 100;
  var MAX_PAGES = 20;
  var FETCH_TIMEOUT_MS = 60000;
  // The activities API sorts pins nearest-first when lat/lng are present,
  // and it also drops pins outside radiusMiles (default 25, max 100).
  // Asking for the widest radius still puts nearby rows first and keeps
  // every place the on-screen slider can show (the slider stops at 50).
  var NEARBY_RADIUS_MILES = 100;
  var ID_PREFIX = "db:";

  function roundUserCoord(value) {
    if (value == null || value === "") return null;
    var n = typeof value === "number" ? value : Number(value);
    if (!isFinite(n)) return null;
    return Math.round(n * 100) / 100;
  }

  function roundPair(lat, lng) {
    var rlat = roundUserCoord(lat);
    var rlng = roundUserCoord(lng);
    if (rlat == null || rlng == null) return null;
    if (rlat < -90 || rlat > 90 || rlng < -180 || rlng > 180) return null;
    return { lat: rlat, lng: rlng };
  }

  function locationBucket(lat, lng) {
    var pair = roundPair(lat, lng);
    if (!pair) return "none";
    return pair.lat + "," + pair.lng;
  }

  function cacheKey(version, bucket, scope) {
    return String(version) + "|" + String(bucket) + "|" + String(scope || "");
  }

  function ideaId(raw) {
    var n = typeof raw === "number" ? raw : Number(raw);
    if (!isFinite(n) || Math.floor(n) !== n || n < 1 || n > 99999999) return null;
    return ID_PREFIX + String(n);
  }

  function dbIdOf(idea) {
    if (!idea || typeof idea !== "object") return null;
    if (typeof idea.dbId === "number" && isFinite(idea.dbId)) return idea.dbId;
    var match = /^db:(\d+)$/.exec(String(idea.id == null ? "" : idea.id));
    if (!match) return null;
    return Number(match[1]);
  }

  function normalizeTitle(title) {
    return String(title == null ? "" : title).toLowerCase().replace(/\s+/g, " ").trim();
  }

  function textList(value) {
    if (!Array.isArray(value)) return [];
    var out = [];
    for (var i = 0; i < value.length; i++) {
      if (typeof value[i] !== "string") continue;
      var text = value[i].trim();
      if (!text || out.indexOf(text) !== -1) continue;
      out.push(text);
    }
    return out;
  }

  function calendarDay(value) {
    if (value == null || value === "") return null;
    var text = typeof value === "string" ? value.trim() : "";
    if (!text) return null;
    var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (!match) return null;
    var y = Number(match[1]);
    var mo = Number(match[2]);
    var d = Number(match[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return match[1] + "-" + match[2] + "-" + match[3];
  }

  function httpsPageUrl(value) {
    if (typeof value !== "string") return "";
    var trimmed = value.trim();
    if (!trimmed || /\s/.test(trimmed) || !/^https:\/\//i.test(trimmed)) return "";
    var parsed;
    try {
      parsed = new URL(trimmed);
    } catch (err) {
      return "";
    }
    if (parsed.protocol !== "https:") return "";
    if (parsed.username || parsed.password) return "";
    if (!parsed.hostname) return "";
    if (parsed.href.slice(0, 8).toLowerCase() !== "https://") return "";
    return parsed.href;
  }

  function finiteCoord(value, min, max) {
    if (value == null || value === "") return null;
    var n = typeof value === "number" ? value : Number(value);
    if (!isFinite(n) || n < min || n > max) return null;
    return n;
  }

  function cleanSourceKey(value) {
    if (typeof value !== "string") return null;
    var key = value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(key)) return null;
    return key;
  }

  function audienceApi() {
    if (typeof SparkAudience !== "undefined" && SparkAudience) return SparkAudience;
    return require("./audience");
  }

  function costBandsApi() {
    if (typeof SparkCostBands !== "undefined" && SparkCostBands) return SparkCostBands;
    return require("./cost-bands");
  }

  function cleanCostUnit(value) {
    return value === "per car" ? "per car" : null;
  }

  function cleanSourceCredit(value) {
    if (typeof value !== "string") return null;
    var text = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
    if (!text) return null;
    if (text.length > 500) text = text.slice(0, 500).trim();
    return text || null;
  }

  function mapActivityToIdea(row) {
    if (!row || typeof row !== "object") return null;
    var id = ideaId(row.id);
    var title = typeof row.title === "string" ? row.title.trim() : "";
    if (!id || !title) return null;
    var website = httpsPageUrl(row.source_url != null ? row.source_url : row.sourceUrl);
    var expires = calendarDay(row.expires_at != null ? row.expires_at : row.expiresAt);
    var occurrences = null;
    if (row.occurrences && typeof row.occurrences === "object") occurrences = row.occurrences;
    var setting = row.setting === "Outdoor" || row.setting === "Both" ? row.setting : "Indoor";
    var lat = finiteCoord(row.lat, -90, 90);
    var lng = finiteCoord(row.lng, -180, 180);
    var distance = row.distanceMiles != null && row.distanceMiles !== "" ? row.distanceMiles : row.distance_miles;
    var miles = null;
    if (distance != null && distance !== "") {
      miles = typeof distance === "number" ? distance : Number(distance);
    }
    var idea = {
      id: id,
      dbId: Number(row.id),
      title: title,
      description: typeof row.description === "string" ? row.description : "",
      materials: textList(row.materials),
      category: typeof row.category === "string" && row.category.trim() ? row.category.trim() : "Culture, Community & Local Attractions",
      icon: typeof row.icon === "string" ? row.icon : "",
      setting: setting,
      season: textList(row.season),
      food: row.food === true,
      age21: row.age21 === true,
      cost: costBandsApi().storedLabel(typeof row.cost === "string" ? row.cost : ""),
      costUnit: cleanCostUnit(row.cost_unit != null ? row.cost_unit : row.costUnit),
      cost_unit: cleanCostUnit(row.cost_unit != null ? row.cost_unit : row.costUnit),
      duration: typeof row.duration === "string" ? row.duration : "",
      time: textList(row.time),
      vibe: textList(row.vibe),
      stage: textList(row.stage),
      dateType: textList(row.dateType || row.date_type),
      audience: row && Object.prototype.hasOwnProperty.call(row, "audience")
        ? audienceApi().canonicalStored(row.audience)
        : null,
      scene: typeof row.scene === "string" ? row.scene : null,
      motif: typeof row.motif === "string" ? row.motif : null,
      source_url: website || null,
      sourceUrl: website || null,
      source_key: cleanSourceKey(row.source_key != null ? row.source_key : row.sourceKey),
      sourceKey: cleanSourceKey(row.source_key != null ? row.source_key : row.sourceKey),
      source_credit: cleanSourceCredit(row.source_credit != null ? row.source_credit : row.sourceCredit),
      sourceCredit: cleanSourceCredit(row.source_credit != null ? row.source_credit : row.sourceCredit),
      source: typeof row.source === "string" ? row.source : "",
      expires_at: expires,
      expiresAt: expires,
      occurrences: occurrences,
      address: typeof row.address === "string" ? row.address : "",
      city: typeof row.city === "string" ? row.city : null
    };
    if (lat != null && lng != null) {
      idea.lat = lat;
      idea.lng = lng;
    }
    if (typeof miles === "number" && isFinite(miles) && miles >= 0) idea.distanceMiles = miles;
    return idea;
  }

  function sanitizeIdea(idea) {
    if (!idea || typeof idea !== "object") return null;
    if (typeof idea.id !== "string" || idea.id.indexOf(ID_PREFIX) !== 0) return null;
    if (typeof idea.title !== "string" || !idea.title.trim()) return null;
    idea.title = idea.title.trim();
    ["materials", "season", "time", "vibe", "stage", "dateType"].forEach(function (key) {
      if (!Array.isArray(idea[key])) idea[key] = [];
    });
    if (Object.prototype.hasOwnProperty.call(idea, "audience")) {
      idea.audience = audienceApi().canonicalStored(idea.audience);
    } else {
      idea.audience = null;
    }
    if (idea.food !== true) idea.food = false;
    if (idea.age21 !== true) idea.age21 = false;
    if (idea.occurrences == null || typeof idea.occurrences !== "object") idea.occurrences = null;
    if (idea.dbId == null) idea.dbId = dbIdOf(idea);
    return idea;
  }

  function dedupeAgainstBuiltins(ideas, builtins) {
    var ids = Object.create(null);
    var titles = Object.create(null);
    var list = Array.isArray(builtins) ? builtins : [];
    for (var i = 0; i < list.length; i++) {
      var builtin = list[i];
      if (!builtin) continue;
      if (builtin.id != null) ids[String(builtin.id)] = true;
      var title = normalizeTitle(builtin.title);
      if (title) titles[title] = true;
    }
    var seenIds = Object.create(null);
    var seenTitles = Object.create(null);
    var out = [];
    var rows = Array.isArray(ideas) ? ideas : [];
    for (var j = 0; j < rows.length; j++) {
      var idea = sanitizeIdea(rows[j]);
      if (!idea) continue;
      var numeric = dbIdOf(idea);
      if (ids[String(idea.id)]) continue;
      if (numeric != null && ids[String(numeric)]) continue;
      var key = normalizeTitle(idea.title);
      if (key && titles[key]) continue;
      if (seenIds[idea.id]) continue;
      if (key && seenTitles[key]) continue;
      seenIds[idea.id] = true;
      if (key) seenTitles[key] = true;
      out.push(idea);
    }
    return out;
  }

  /* Feed rows the activities API no longer returns (they expired) stay
     available to saved lists. This does not put them back on the deck and
     does not remove anything from a saved list. */
  function retainSavedIdeas(feedIdeas, savedIdeas) {
    var seen = Object.create(null);
    var feed = Array.isArray(feedIdeas) ? feedIdeas : [];
    for (var i = 0; i < feed.length; i++) {
      var row = feed[i];
      if (row && row.id != null) seen[String(row.id)] = true;
    }
    var saved = Array.isArray(savedIdeas) ? savedIdeas : [];
    var kept = [];
    var keptIds = Object.create(null);
    for (var j = 0; j < saved.length; j++) {
      var idea = saved[j];
      if (!idea || idea.id == null) continue;
      var id = String(idea.id);
      if (seen[id] || keptIds[id]) continue;
      var copy = null;
      try { copy = JSON.parse(JSON.stringify(idea)); } catch (err) { copy = null; }
      var clean = sanitizeIdea(copy);
      if (!clean) continue;
      keptIds[clean.id] = true;
      kept.push(clean);
    }
    return kept;
  }

  function appendNewIds(currentIds, newIds) {
    var out = [];
    var seen = Object.create(null);
    var current = Array.isArray(currentIds) ? currentIds : [];
    for (var i = 0; i < current.length; i++) {
      var id = current[i];
      var mark = typeof id === "number" ? "#" + id : String(id);
      if (seen[mark]) continue;
      seen[mark] = true;
      out.push(id);
    }
    var extra = Array.isArray(newIds) ? newIds : [];
    for (var j = 0; j < extra.length; j++) {
      var nid = extra[j];
      if (nid == null) continue;
      var nmark = typeof nid === "number" ? "#" + nid : String(nid);
      if (seen[nmark]) continue;
      seen[nmark] = true;
      out.push(nid);
    }
    return out;
  }

  function loadStore(storage) {
    if (!storage || typeof storage.getItem !== "function") return {};
    try {
      var raw = storage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return parsed;
    } catch (err) {
      return {};
    }
  }

  function readCache(storage, bucket, now, scope) {
    var empty = { hit: false, fresh: false, ideas: [], nextCursor: null };
    var scopeKey = scope || "";
    var store = loadStore(storage);
    var entry = store[cacheKey(API_VERSION, bucket, scopeKey)];
    if (!entry || entry.v !== API_VERSION || entry.bucket !== bucket || entry.scope !== scopeKey || !Array.isArray(entry.ideas)) return empty;
    var savedAt = Number(entry.savedAt);
    if (!isFinite(savedAt)) return empty;
    var when = typeof now === "number" ? now : Date.now();
    var age = when - savedAt;
    var ideas = [];
    for (var i = 0; i < entry.ideas.length; i++) {
      var idea = sanitizeIdea(entry.ideas[i]);
      if (idea) ideas.push(idea);
    }
    var nextCursor = typeof entry.nextCursor === "string" && entry.nextCursor ? entry.nextCursor : null;
    return { hit: true, fresh: age >= 0 && age < CACHE_TTL_MS, ideas: ideas, savedAt: savedAt, nextCursor: nextCursor };
  }

  function writeCache(storage, bucket, ideas, now, scope, nextCursor) {
    if (!storage || typeof storage.setItem !== "function") return false;
    try {
      var store = loadStore(storage);
      var clean = [];
      var rows = Array.isArray(ideas) ? ideas : [];
      for (var i = 0; i < rows.length; i++) {
        var idea = sanitizeIdea(rows[i]);
        if (idea) clean.push(idea);
      }
      var scopeKey = scope || "";
      store[cacheKey(API_VERSION, bucket, scopeKey)] = {
        v: API_VERSION,
        bucket: bucket,
        scope: scopeKey,
        savedAt: typeof now === "number" ? now : Date.now(),
        ideas: clean,
        nextCursor: typeof nextCursor === "string" && nextCursor ? nextCursor : null
      };
      storage.setItem(STORAGE_KEY, JSON.stringify(store));
      return true;
    } catch (err) {
      return false;
    }
  }

  function warnQuiet(message) {
    try { console.warn(message); } catch (err) {}
  }

  function isAbort(err) {
    return !!(err && (err.name === "AbortError" || err.code === 20));
  }

  function pageUrl(base, cursor, limit, lat, lng, radiusMiles, filters) {
    var params = ["limit=" + limit];
    if (cursor) params.push("cursor=" + encodeURIComponent(cursor));
    if (lat != null && lng != null) {
      params.push("lat=" + lat);
      params.push("lng=" + lng);
      if (radiusMiles != null) params.push("radiusMiles=" + encodeURIComponent(String(radiusMiles)));
    }
    if (filters && typeof filters === "object") {
      Object.keys(filters).forEach(function (key) {
        var value = filters[key];
        if (value == null || value === "") return;
        params.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(value)));
      });
    }
    var path = base || "/api/activities";
    return path + (path.indexOf("?") === -1 ? "?" : "&") + params.join("&");
  }

  function fetchApprovedActivities(opts) {
    opts = opts || {};
    var timeoutMs = FETCH_TIMEOUT_MS;
    if (typeof opts.timeoutMs === "number" && isFinite(opts.timeoutMs) && opts.timeoutMs > 0) timeoutMs = opts.timeoutMs;
    var rounded = roundPair(opts.lat, opts.lng);
    var pageLimit = clampInt(opts.limit, 1, 200, PAGE_LIMIT);
    var maxItems = clampInt(opts.maxItems, 1, 20000, PAGE_LIMIT);
    var radiusMiles = null;
    if (rounded) {
      radiusMiles = opts.radiusMiles;
      if (typeof radiusMiles !== "number" || !isFinite(radiusMiles)) radiusMiles = NEARBY_RADIUS_MILES;
    }

    return new Promise(function (resolve) {
      var settled = false;
      var timedOut = false;
      var timer = null;
      var controller = null;
      try {
        if (typeof AbortController === "function") controller = new AbortController();
      } catch (err) {
        controller = null;
      }

      function finish(value) {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(value);
      }

      function fail(reason) {
        if (reason === "timeout" || reason === "error") warnQuiet("Activities could not be loaded.");
        finish({ ok: false, ideas: [], reason: reason });
      }

      if (opts.signal && opts.signal.aborted) {
        finish({ ok: false, ideas: [], reason: "abort" });
        return;
      }
      if (opts.signal && opts.signal.addEventListener) {
        opts.signal.addEventListener("abort", function () {
          try { if (controller) controller.abort(); } catch (err) {}
          fail("abort");
        });
      }
      if (typeof opts.fetch !== "function") {
        fail("error");
        return;
      }

      timer = setTimeout(function () {
        timedOut = true;
        try { if (controller) controller.abort(); } catch (err) {}
        fail("timeout");
      }, timeoutMs);

      collectPages(opts.fetch, controller && controller.signal, {
        url: opts.url,
        lat: rounded && rounded.lat,
        lng: rounded && rounded.lng,
        radiusMiles: radiusMiles,
        filters: opts.filters || null,
        cursor: typeof opts.cursor === "string" && opts.cursor ? opts.cursor : null,
        limit: pageLimit,
        maxItems: maxItems
      }).then(function (page) {
        finish({ ok: true, ideas: page.ideas, nextCursor: page.nextCursor || null });
      }, function (err) {
        if (settled || timedOut) return;
        var aborted = isAbort(err) || (opts.signal && opts.signal.aborted) || (controller && controller.signal && controller.signal.aborted);
        fail(aborted ? "abort" : "error");
      });
    });
  }

  function clampInt(value, min, max, fallback) {
    var n = typeof value === "number" ? value : Number(value);
    if (!isFinite(n)) return fallback;
    n = Math.trunc(n);
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function collectPages(fetchFn, signal, opts) {
    var ideas = [];
    var seen = Object.create(null);
    var cursor = opts.cursor || null;
    var nextCursor = null;
    var pages = 0;

    function step() {
      if (signal && signal.aborted) return Promise.reject(abortError());
      if (ideas.length >= opts.maxItems || pages >= MAX_PAGES) {
        nextCursor = cursor;
        return Promise.resolve({ ideas: ideas.slice(0, opts.maxItems), nextCursor: nextCursor });
      }
      var pageLimit = Math.min(opts.limit, opts.maxItems - ideas.length);
      var url = pageUrl(opts.url, cursor, pageLimit, opts.lat, opts.lng, opts.radiusMiles, opts.filters);
      pages += 1;
      return Promise.resolve(fetchFn(url, {
        method: "GET",
        signal: signal || undefined,
        headers: { "Accept": "application/json" }
      })).then(function (res) {
        if (!res || res.ok !== true || typeof res.json !== "function") throw new Error("bad status");
        return res.json();
      }).then(function (body) {
        if (signal && signal.aborted) return Promise.reject(abortError());
        var items = body && Array.isArray(body.items) ? body.items : null;
        if (!items) throw new Error("bad body");
        for (var i = 0; i < items.length && ideas.length < opts.maxItems; i++) {
          var idea = mapActivityToIdea(items[i]);
          if (!idea || seen[idea.id]) continue;
          seen[idea.id] = true;
          ideas.push(idea);
        }
        var next = body && typeof body.nextCursor === "string" && body.nextCursor ? body.nextCursor : null;
        if (!next || next === cursor || !items.length || items.length < pageLimit) {
          nextCursor = null;
          return { ideas: ideas.slice(0, opts.maxItems), nextCursor: null };
        }
        if (ideas.length >= opts.maxItems) {
          return { ideas: ideas.slice(0, opts.maxItems), nextCursor: next };
        }
        cursor = next;
        return step();
      });
    }

    return step();
  }

  function abortError() {
    var err = new Error("aborted");
    err.name = "AbortError";
    return err;
  }

  function syncActivities(opts) {
    opts = opts || {};
    var now = typeof opts.now === "function" ? opts.now() : Date.now();
    var bucket = locationBucket(opts.lat, opts.lng);
    var scope = typeof opts.scope === "string" ? opts.scope : "";
    var cached = readCache(opts.storage, bucket, now, scope);
    var builtins = opts.builtins || [];

    function pack(list, meta) {
      return {
        ok: meta.ok,
        fresh: meta.fresh,
        fromCache: meta.fromCache,
        bucket: bucket,
        scope: scope,
        nextCursor: meta.nextCursor || null,
        ideas: dedupeAgainstBuiltins(list || [], builtins)
      };
    }

    if (cached.fresh && !opts.force) {
      return Promise.resolve(pack(cached.ideas, { ok: true, fresh: true, fromCache: true, nextCursor: cached.nextCursor }));
    }

    return fetchApprovedActivities({
      fetch: opts.fetch,
      url: opts.url,
      lat: opts.lat,
      lng: opts.lng,
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
      limit: opts.limit,
      maxItems: opts.maxItems,
      cursor: opts.cursor,
      filters: opts.filters,
      radiusMiles: opts.radiusMiles
    }).then(function (result) {
      if (result && result.ok) {
        var ideas = dedupeAgainstBuiltins(result.ideas, builtins);
        writeCache(opts.storage, bucket, ideas, now, scope, result.nextCursor);
        return pack(ideas, { ok: true, fresh: true, fromCache: false, nextCursor: result.nextCursor });
      }
      return pack(cached.ideas, { ok: false, fresh: false, fromCache: cached.hit, nextCursor: cached.nextCursor });
    }, function () {
      warnQuiet("Activities could not be loaded.");
      return pack(cached.ideas, { ok: false, fresh: false, fromCache: cached.hit, nextCursor: cached.nextCursor });
    });
  }

  function mapCatalogIdea(row) {
    var idea = mapActivityToIdea(row);
    if (!idea || idea.dbId == null) return null;
    idea.id = idea.dbId;
    idea.pendingLoad = false;
    return idea;
  }

  function sanitizeCatalogIdea(idea) {
    if (!idea || typeof idea !== "object") return null;
    var id = typeof idea.id === "number" ? idea.id : Number(idea.id);
    if (!isFinite(id) || Math.floor(id) !== id || id < 1 || id > 999999999) return null;
    if (typeof idea.title !== "string" || !idea.title.trim()) return null;
    if (idea.pendingLoad === true) return null;
    idea.id = id;
    idea.title = idea.title.trim();
    ["materials", "season", "time", "vibe", "stage", "dateType"].forEach(function (key) {
      if (!Array.isArray(idea[key])) idea[key] = [];
    });
    if (Object.prototype.hasOwnProperty.call(idea, "audience")) {
      idea.audience = audienceApi().canonicalStored(idea.audience);
    } else {
      idea.audience = null;
    }
    if (idea.food !== true) idea.food = false;
    if (idea.age21 !== true) idea.age21 = false;
    return idea;
  }

  function catalogIdList(value) {
    var parts = Array.isArray(value) ? value : String(value == null ? "" : value).split(",");
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < parts.length; i++) {
      var raw = String(parts[i] == null ? "" : parts[i]).trim();
      if (!raw) continue;
      if (!/^\d{1,9}$/.test(raw)) return null;
      var id = Number(raw);
      if (!isFinite(id) || id < 1 || seen[id]) continue;
      seen[id] = true;
      out.push(id);
    }
    return out;
  }

  function readCatalogCache(storage, now) {
    var empty = { hit: false, fresh: false, ideas: [] };
    var store = loadStore(storage);
    var entry = store[cacheKey(API_VERSION, CATALOG_BUCKET, "")];
    if (!entry || entry.v !== API_VERSION || entry.bucket !== CATALOG_BUCKET || !Array.isArray(entry.ideas)) return empty;
    var savedAt = Number(entry.savedAt);
    if (!isFinite(savedAt)) return empty;
    var when = typeof now === "number" ? now : Date.now();
    var age = when - savedAt;
    var ideas = [];
    for (var i = 0; i < entry.ideas.length; i++) {
      var idea = sanitizeCatalogIdea(entry.ideas[i]);
      if (idea) ideas.push(idea);
    }
    return { hit: ideas.length > 0, fresh: age >= 0 && age < CACHE_TTL_MS, ideas: ideas, savedAt: savedAt };
  }

  function writeCatalogCache(storage, ideas, now) {
    if (!storage || typeof storage.setItem !== "function") return false;
    try {
      var store = loadStore(storage);
      var clean = [];
      var rows = Array.isArray(ideas) ? ideas : [];
      var seen = Object.create(null);
      for (var i = 0; i < rows.length; i++) {
        var idea = sanitizeCatalogIdea(rows[i]);
        if (!idea || seen[idea.id]) continue;
        seen[idea.id] = true;
        clean.push(idea);
      }
      store[cacheKey(API_VERSION, CATALOG_BUCKET, "")] = {
        v: API_VERSION,
        bucket: CATALOG_BUCKET,
        scope: "",
        savedAt: typeof now === "number" ? now : Date.now(),
        ideas: clean
      };
      storage.setItem(STORAGE_KEY, JSON.stringify(store));
      return true;
    } catch (err) {
      return false;
    }
  }

  function fetchActivitiesByIds(opts) {
    opts = opts || {};
    var ids = catalogIdList(opts.ids);
    if (!ids) return Promise.resolve({ ok: false, ideas: [], missing: [], reason: "error" });
    if (!ids.length) return Promise.resolve({ ok: true, ideas: [], missing: [] });
    if (typeof opts.fetch !== "function") return Promise.resolve({ ok: false, ideas: [], missing: ids.slice(), reason: "error" });
    var base = opts.url || "/api/activities/by-ids";
    var chunks = [];
    for (var c = 0; c < ids.length; c += ID_BATCH) chunks.push(ids.slice(c, c + ID_BATCH));
    var ideas = [];
    var seen = Object.create(null);

    function run(index) {
      if (index >= chunks.length) {
        var got = Object.create(null);
        for (var i = 0; i < ideas.length; i++) got[ideas[i].id] = true;
        var missing = [];
        for (var j = 0; j < ids.length; j++) if (!got[ids[j]]) missing.push(ids[j]);
        return { ok: true, ideas: ideas, missing: missing };
      }
      var path = base + (base.indexOf("?") === -1 ? "?" : "&") + "ids=" + chunks[index].join(",");
      return Promise.resolve(opts.fetch(path, {
        method: "GET",
        signal: opts.signal || undefined,
        headers: { "Accept": "application/json" }
      })).then(function (res) {
        if (!res || res.ok !== true || typeof res.json !== "function") throw new Error("bad status");
        return res.json();
      }).then(function (body) {
        var items = body && Array.isArray(body.items) ? body.items : null;
        if (!items) throw new Error("bad body");
        for (var i = 0; i < items.length; i++) {
          var idea = mapCatalogIdea(items[i]);
          if (!idea || seen[idea.id]) continue;
          seen[idea.id] = true;
          ideas.push(idea);
        }
        return run(index + 1);
      });
    }

    return Promise.resolve().then(function () { return run(0); }).then(null, function () {
      warnQuiet("Activities could not be loaded.");
      return { ok: false, ideas: [], missing: ids.slice(), reason: "error" };
    });
  }

  return {
    API_VERSION: API_VERSION,
    CATALOG_BUCKET: CATALOG_BUCKET,
    ID_BATCH: ID_BATCH,
    CACHE_TTL_MS: CACHE_TTL_MS,
    STORAGE_KEY: STORAGE_KEY,
    PAGE_LIMIT: PAGE_LIMIT,
    MAX_ITEMS: MAX_ITEMS,
    FETCH_TIMEOUT_MS: FETCH_TIMEOUT_MS,
    NEARBY_RADIUS_MILES: NEARBY_RADIUS_MILES,
    roundUserCoord: roundUserCoord,
    roundPair: roundPair,
    locationBucket: locationBucket,
    cacheKey: cacheKey,
    ideaId: ideaId,
    normalizeTitle: normalizeTitle,
    mapActivityToIdea: mapActivityToIdea,
    dedupeAgainstBuiltins: dedupeAgainstBuiltins,
    retainSavedIdeas: retainSavedIdeas,
    appendNewIds: appendNewIds,
    readCache: readCache,
    writeCache: writeCache,
    fetchApprovedActivities: fetchApprovedActivities,
    syncActivities: syncActivities,
    mapCatalogIdea: mapCatalogIdea,
    readCatalogCache: readCatalogCache,
    writeCatalogCache: writeCatalogCache,
    fetchActivitiesByIds: fetchActivitiesByIds
  };
});
