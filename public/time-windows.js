/* Five time-window buttons and the legacy tag alias.

   Buttons, in order: Morning, Midday, Afternoon, Evening, Late Night.
   Each label is the word plus the hours, with an en dash, the same way
   the budget buttons print $1–$20. Stored filter ids are the slugs
   morning, midday, afternoon, evening, and late_night. The hours before
   6 AM are not a button.

   Legacy tags still sit on activities.time until a later retag:
     Morning  → Morning and Midday
     Afternoon → Midday and Afternoon
     Evening  → Evening
     Night    → Late Night
   A new slug matches only its own button.

   A dates occurrence is placed only by its start clock, which is the
   America/Denver wall time already stored as HH:MM. The process timezone
   is not consulted. 6:00–9:59 Morning, 10:00–13:59 Midday, 14:00–16:59
   Afternoon, 17:00–20:59 Evening, 21:00–00:59 Late Night. Several dates
   contribute every window their starts hit. 1:00–5:59 matches nothing.
   Weekly rows, and dated rows with no usable start, use the tag mapping.

   Loaded before app.js. Node tests and the activities query require() it.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SparkTimeWindows = api;
})(this, function () {
  "use strict";

  var EN_DASH = "\u2013";

  // hours24 is the start hour (0–23) of a dated event. 1–5 are absent on purpose.
  var WINDOWS = [
    { id: "morning", word: "Morning", hours: "6" + EN_DASH + "10 AM", hours24: [6, 7, 8, 9] },
    { id: "midday", word: "Midday", hours: "10 AM" + EN_DASH + "2 PM", hours24: [10, 11, 12, 13] },
    { id: "afternoon", word: "Afternoon", hours: "2" + EN_DASH + "5 PM", hours24: [14, 15, 16] },
    { id: "evening", word: "Evening", hours: "5" + EN_DASH + "9 PM", hours24: [17, 18, 19, 20] },
    { id: "late_night", word: "Late Night", hours: "9 PM" + EN_DASH + "1 AM", hours24: [21, 22, 23, 0] }
  ];

  var TIME_WINDOWS = WINDOWS.map(function (w) { return w.id; });

  var LEGACY_TIME = ["Morning", "Afternoon", "Evening", "Night"];
  var LEGACY_TO_WINDOWS = {
    Morning: ["morning", "midday"],
    Afternoon: ["midday", "afternoon"],
    Evening: ["evening"],
    Night: ["late_night"]
  };

  var BY_ID = {};
  WINDOWS.forEach(function (w) { BY_ID[w.id] = w; });

  function isWindow(value) {
    return typeof value === "string" && !!BY_ID[value];
  }

  function windowForHour(hour) {
    if (typeof hour !== "number" || hour !== Math.floor(hour) || hour < 0 || hour > 23) return null;
    for (var i = 0; i < WINDOWS.length; i++) {
      if (WINDOWS[i].hours24.indexOf(hour) !== -1) return WINDOWS[i].id;
    }
    return null;
  }

  function addUnique(out, id) {
    if (out.indexOf(id) === -1) out.push(id);
  }

  function windowsForStoredTags(tags) {
    var want = {};
    var list = Array.isArray(tags) ? tags : [];
    for (var i = 0; i < list.length; i++) {
      var tag = list[i];
      if (isWindow(tag)) want[tag] = true;
      else if (LEGACY_TO_WINDOWS[tag]) {
        var mapped = LEGACY_TO_WINDOWS[tag];
        for (var j = 0; j < mapped.length; j++) want[mapped[j]] = true;
      }
    }
    return TIME_WINDOWS.filter(function (id) { return want[id]; });
  }

  function asObject(value) {
    if (!value) return null;
    if (typeof value === "string") {
      try { value = JSON.parse(value); }
      catch (err) { return null; }
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value;
  }

  // Hour of a stored HH:MM[:SS] start, or null when it is not a real clock.
  function parseStartHour(value) {
    if (typeof value !== "string") return null;
    var match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
    if (!match) return null;
    var hour = Number(match[1]);
    var minute = Number(match[2]);
    var second = match[3] == null ? 0 : Number(match[3]);
    if (hour > 23 || minute > 59 || second > 59) return null;
    return hour;
  }

  // null means "use the tags" (weekly, anytime, or dates with no usable start).
  // An array means those start hours decide, even when every hour is 1–5.
  function datedStartHours(occurrences) {
    var occ = asObject(occurrences);
    if (!occ || occ.kind !== "dates" || !Array.isArray(occ.dates)) return null;
    var hours = [];
    for (var i = 0; i < occ.dates.length; i++) {
      var entry = occ.dates[i];
      if (!entry || typeof entry !== "object") continue;
      var hour = parseStartHour(entry.start);
      if (hour == null) continue;
      hours.push(hour);
    }
    if (!hours.length) return null;
    return hours;
  }

  function windowsForActivity(idea) {
    var hours = datedStartHours(idea && idea.occurrences);
    if (hours) {
      var want = {};
      for (var i = 0; i < hours.length; i++) {
        var id = windowForHour(hours[i]);
        if (id) want[id] = true;
      }
      return TIME_WINDOWS.filter(function (id) { return want[id]; });
    }
    return windowsForStoredTags(idea && idea.time);
  }

  // Old button names and new slugs. Unknown tokens set invalid.
  // Windows come back in button order.
  function selectionFromQuery(list) {
    var want = {};
    var invalid = false;
    var items = Array.isArray(list) ? list : [];
    for (var i = 0; i < items.length; i++) {
      var value = items[i];
      if (isWindow(value)) want[value] = true;
      else if (LEGACY_TO_WINDOWS[value]) {
        var mapped = LEGACY_TO_WINDOWS[value];
        for (var j = 0; j < mapped.length; j++) want[mapped[j]] = true;
      } else invalid = true;
    }
    return {
      windows: TIME_WINDOWS.filter(function (id) { return want[id]; }),
      invalid: invalid
    };
  }

  function timeMatches(idea, selected) {
    var list = Array.isArray(selected) ? selected : [];
    if (!list.length) return true;
    var resolved = selectionFromQuery(list);
    if (!resolved.windows.length) return false;
    var have = windowsForActivity(idea);
    for (var i = 0; i < resolved.windows.length; i++) {
      if (have.indexOf(resolved.windows[i]) !== -1) return true;
    }
    return false;
  }

  // Saved filters and old query names. New slugs stay. Legacy names expand.
  function migrateFilterSelection(list) {
    if (!Array.isArray(list)) return { values: [], changed: true };
    var out = [];
    var changed = false;
    for (var i = 0; i < list.length; i++) {
      var value = list[i];
      if (isWindow(value)) addUnique(out, value);
      else if (typeof value === "string" && LEGACY_TO_WINDOWS[value]) {
        var mapped = LEGACY_TO_WINDOWS[value];
        for (var j = 0; j < mapped.length; j++) addUnique(out, mapped[j]);
        changed = true;
      } else changed = true;
    }
    if (out.length !== list.length) changed = true;
    else if (!changed) {
      for (var k = 0; k < out.length; k++) {
        if (out[k] !== list[k]) changed = true;
      }
    }
    return { values: out, changed: changed };
  }

  // Stored strings (new slugs and legacy tags) that can fall in these buttons.
  function storedValuesForWindows(selected) {
    var want = {};
    var list = Array.isArray(selected) ? selected : [];
    for (var i = 0; i < list.length; i++) {
      if (isWindow(list[i])) want[list[i]] = true;
    }
    var out = [];
    TIME_WINDOWS.forEach(function (id) {
      if (want[id]) addUnique(out, id);
    });
    LEGACY_TIME.forEach(function (tag) {
      var mapped = LEGACY_TO_WINDOWS[tag];
      for (var i = 0; i < mapped.length; i++) {
        if (want[mapped[i]]) {
          addUnique(out, tag);
          break;
        }
      }
    });
    return out;
  }

  function displayParts(id) {
    var row = BY_ID[id];
    if (!row) return null;
    return { word: row.word, hours: row.hours };
  }

  function displayLabel(id) {
    var parts = displayParts(id);
    if (!parts) return typeof id === "string" ? id : "";
    return parts.word + " " + parts.hours;
  }

  function labelsForActivity(idea) {
    return windowsForActivity(idea).map(displayLabel);
  }

  // Hour expression is safe to cast only after the clock regex matches.
  // Nested CASE is what keeps the cast off a non-numeric start.
  function startHourExpr(slot) {
    var clock = "COALESCE(" + slot + "->>'start', '') ~ '^[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?$'";
    var hour = "split_part(" + slot + "->>'start', ':', 1)::int";
    var minute = "split_part(" + slot + "->>'start', ':', 2)::int";
    var second = "split_part(" + slot + "->>'start', ':', 3)";
    return "CASE WHEN " + clock + " THEN CASE WHEN " + hour + " BETWEEN 0 AND 23" +
      " AND " + minute + " BETWEEN 0 AND 59" +
      " AND (" + second + " = '' OR " + second + "::int BETWEEN 0 AND 59)" +
      " THEN " + hour + " ELSE NULL END ELSE NULL END";
  }

  function datesElements() {
    return "jsonb_array_elements(CASE WHEN jsonb_typeof(occurrences->'dates') = 'array'" +
      " THEN occurrences->'dates' ELSE '[]'::jsonb END)";
  }

  function hasDatedStartSql() {
    return "(occurrences->>'kind' = 'dates' AND EXISTS (" +
      "SELECT 1 FROM " + datesElements() + " AS slot" +
      " WHERE (" + startHourExpr("slot") + ") IS NOT NULL))";
  }

  function hourWindowCase() {
    var sql = "CASE";
    WINDOWS.forEach(function (w) {
      if (!/^[a-z_]+$/.test(w.id)) throw new Error("bad time window id");
      sql += " WHEN h IN (" + w.hours24.join(", ") + ") THEN '" + w.id + "'";
    });
    return sql + " ELSE NULL END";
  }

  // Two parameters: the selected window ids, then the stored strings that
  // overlap them. Dated rows with a start hour use only that hour.
  function sqlPredicate(windows, startIndex) {
    var list = Array.isArray(windows) ? windows : [];
    if (!list.length || list.some(function (id) { return !isWindow(id); })) {
      throw new Error("bad time windows");
    }
    var windowIdx = startIndex;
    var storedIdx = startIndex + 1;
    var hourMatch = "EXISTS (SELECT 1 FROM (" +
      "SELECT (" + startHourExpr("slot") + ") AS h FROM " + datesElements() + " AS slot" +
      ") AS starts WHERE h IS NOT NULL AND (" + hourWindowCase() + ") = ANY($" + windowIdx + "::text[]))";
    var hasStart = hasDatedStartSql();
    var sql = "((" + hasStart + " AND " + hourMatch + ") OR (NOT " + hasStart +
      " AND time && $" + storedIdx + "::text[]))";
    return {
      sql: sql,
      values: [list.slice(), storedValuesForWindows(list)]
    };
  }

  return {
    EN_DASH: EN_DASH,
    TIME_WINDOWS: TIME_WINDOWS,
    LEGACY_TIME: LEGACY_TIME,
    WINDOWS: WINDOWS.map(function (w) {
      return { id: w.id, word: w.word, hours: w.hours, hours24: w.hours24.slice() };
    }),
    windowForHour: windowForHour,
    windowsForActivity: windowsForActivity,
    windowsForStoredTags: windowsForStoredTags,
    timeMatches: timeMatches,
    selectionFromQuery: selectionFromQuery,
    migrateFilterSelection: migrateFilterSelection,
    storedValuesForWindows: storedValuesForWindows,
    displayParts: displayParts,
    displayLabel: displayLabel,
    labelsForActivity: labelsForActivity,
    sqlPredicate: sqlPredicate,
    parseStartHour: parseStartHour
  };
});
