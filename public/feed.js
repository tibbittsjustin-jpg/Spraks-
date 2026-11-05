/* Discover feed: Local Activities vs Happening, the Denver date window,
   the card bar, and new-first ordering. No DOM.
   Both the browser and the activities query load this file.
   Dates are America/Denver civil days from SparkOccurrences. */
(function (root, factory) {
  function load(path, globalName) {
    if (typeof module === "object" && module.exports) return require(path);
    return root[globalName];
  }
  var api = factory(load("./occurrences", "SparkOccurrences"), load("./data-sources", "JaderooSources"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SparkFeed = api;
})(this, function (occ, sources) {
  "use strict";

  var HORIZON_DAYS = 14;
  var NO_START = 24 * 60 + 1;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var LOCAL_PHASES = ["nn", "ng", "on", "og"];
  var UNLOCATED_PHASES = ["ni", "oi"];

  function feedModeOf(filters) {
    return filters && filters.feedMode === "happening" ? "happening" : "local";
  }

  function canonicalWhen(value) {
    if (value === "tonight" || value === "today") return value;
    if (typeof value !== "string") return "";
    return occ.parseISODate(value) || "";
  }

  function maxDate(now) {
    return occ.addDays(occ.denverToday(now), HORIZON_DAYS);
  }

  function dateAllowed(iso, now) {
    var date = occ.parseISODate(iso);
    if (!date) return false;
    var today = occ.denverToday(now);
    return date >= today && date <= occ.addDays(today, HORIZON_DAYS);
  }

  /* Keep a saved choice only when it is still inside the window.
     Happening with nothing chosen falls back to Tonight. */
  function storedWhen(value, now, mode) {
    var when = canonicalWhen(value);
    var happening = mode === "happening";
    if (when === "tonight" || when === "today") return when;
    if (when && dateAllowed(when, now)) return when;
    return happening ? "tonight" : "";
  }

  function resolveSelection(filters, now) {
    var mode = feedModeOf(filters);
    var when = canonicalWhen(filters && filters.when);
    var today = occ.denverToday(now);
    var kind = "none";
    var date = null;
    if (mode === "happening" && !when) when = "tonight";
    if (when === "tonight") {
      kind = "tonight";
      date = today;
    } else if (when === "today") {
      kind = "day";
      date = today;
    } else if (when) {
      if (dateAllowed(when, now)) {
        kind = "day";
        date = when;
      } else if (mode === "happening") {
        kind = "tonight";
        date = today;
        when = "tonight";
      } else {
        when = "";
      }
    }
    return { mode: mode, when: when, kind: kind, date: date, today: today };
  }

  /* Anytime places have no business hours. place_staging.hours is not
     copied onto activities, and there is no opening_hours column.
     A later opening_hours text field (OSM syntax) can return false here
     when the place is closed on isoDate. Do not parse that field until
     it exists. Until then every anytime place stays. */
  function openOnDay(row, isoDate) {
    void row;
    void isoDate;
    return true;
  }

  function matchesFeed(idea, filters, now) {
    if (!idea || typeof idea !== "object") return false;
    var sel = resolveSelection(filters, now);
    var dated = occ.isDatedEvent(idea);
    if (sel.mode === "happening") {
      if (!dated) return false;
      if (sel.kind === "tonight") return occ.occursTonight(idea, now) === true;
      return occ.occursOnDateStill(idea, sel.date, now) === true;
    }
    if (!dated) {
      if (sel.kind === "none") return true;
      return openOnDay(idea, sel.date) === true;
    }
    if (sel.kind === "none") return false;
    if (sel.kind === "tonight") return occ.occursTonight(idea, now) === true;
    return occ.occursOnDateStill(idea, sel.date, now) === true;
  }

  function dateEntries(idea) {
    var norm = occ.normalizeOccurrences(idea && idea.occurrences);
    if (!norm.ok || !norm.value || norm.value.kind !== "dates") return [];
    return norm.value.dates || [];
  }

  function formatClock(hhmm) {
    if (!hhmm) return "";
    var parts = String(hhmm).split(":");
    var hour = Number(parts[0]);
    var minute = Number(parts[1]);
    if (!isFinite(hour) || !isFinite(minute)) return "";
    var suffix = hour >= 12 ? "PM" : "AM";
    var h12 = hour % 12;
    if (h12 === 0) h12 = 12;
    var text = String(h12);
    if (minute) text += ":" + (minute < 10 ? "0" : "") + minute;
    return text + " " + suffix;
  }

  function formatDay(iso) {
    var name = occ.weekdayName(iso) || "";
    var month = MONTHS[Number(iso.slice(5, 7)) - 1] || "";
    var day = Number(iso.slice(8, 10));
    return name + ", " + month + " " + day;
  }

  function pickEntry(idea, now) {
    var list = dateEntries(idea);
    if (!list.length) return null;
    var today = occ.denverToday(now);
    var i;
    if (occ.occursTonight(idea, now)) {
      for (i = 0; i < list.length; i++) {
        if (list[i].date === today) return list[i];
      }
    }
    for (i = 0; i < list.length; i++) {
      if (list[i].date >= today) return list[i];
    }
    return list[0];
  }

  function barText(idea, now) {
    if (!occ.isDatedEvent(idea)) return "";
    var entry = pickEntry(idea, now);
    if (!entry) return "";
    var time = formatClock(entry.start);
    var tonight = entry.date === occ.denverToday(now) && occ.occursTonight(idea, now) === true;
    var label = tonight ? "Happening Tonight" : ("Happening " + formatDay(entry.date));
    return time ? label + " \u00b7 " + time : label;
  }

  function modeLabel(filters, now) {
    var sel = resolveSelection(filters, now);
    if (sel.mode !== "happening") return "Local Activities";
    if (sel.kind === "tonight") return "Happening Tonight";
    if (sel.date === sel.today) return "Happening Today";
    return "Happening on " + formatDay(sel.date);
  }

  function rowId(row) {
    var raw = row && (row.dbId != null ? row.dbId : row.id);
    var n = Number(raw);
    return isFinite(n) ? n : 0;
  }

  /* Minutes from midnight on isoDate, or NO_START when that day has no clock.
     The SQL sort uses the same 1441 sentinel. */
  function startSortKey(row, isoDate) {
    var list = dateEntries(row);
    var best = null;
    for (var i = 0; i < list.length; i++) {
      if (isoDate && list[i].date !== isoDate) continue;
      if (!list[i].start) continue;
      var parts = String(list[i].start).split(":");
      var minutes = Number(parts[0]) * 60 + Number(parts[1]);
      if (!isFinite(minutes)) continue;
      if (best == null || minutes < best) best = minutes;
    }
    return best == null ? NO_START : best;
  }

  function compareHappening(a, b, isoDate) {
    var aNew = sources.isNewRow(a) ? 0 : 1;
    var bNew = sources.isNewRow(b) ? 0 : 1;
    if (aNew !== bNew) return aNew - bNew;
    var aStart = startSortKey(a, isoDate);
    var bStart = startSortKey(b, isoDate);
    if (aStart !== bStart) return aStart - bStart;
    return rowId(a) - rowId(b);
  }

  function passesHappeningKeyset(row, cursor, isoDate) {
    if (!cursor) return true;
    var n = sources.isNewRow(row) ? 0 : 1;
    var s = startSortKey(row, isoDate);
    if (n !== cursor.n) return n > cursor.n;
    if (s !== cursor.s) return s > cursor.s;
    return rowId(row) > Number(cursor.id);
  }

  function localPhase(row, located) {
    var fresh = sources.isNewRow(row);
    if (!located) return fresh ? "ni" : "oi";
    var pinned = row && row.dist != null && row.dist !== "";
    if (fresh && pinned) return "nn";
    if (fresh) return "ng";
    if (pinned) return "on";
    return "og";
  }

  function phaseOrder(located) {
    return located ? LOCAL_PHASES : UNLOCATED_PHASES;
  }

  function passesLocalKeyset(row, cursor, located) {
    if (!cursor) return true;
    var order = phaseOrder(located);
    var rowAt = order.indexOf(localPhase(row, located));
    var curAt = order.indexOf(cursor.p);
    if (rowAt < 0 || curAt < 0) return false;
    if (rowAt !== curAt) return rowAt > curAt;
    if (cursor.p === "nn" || cursor.p === "on") {
      var dist = Number(row.dist);
      var cdist = Number(cursor.d);
      if (dist !== cdist) return dist > cdist;
    }
    return rowId(row) > Number(cursor.id);
  }

  function partitionNewFirst(ids, getIdea) {
    var fresh = [];
    var older = [];
    for (var i = 0; i < ids.length; i++) {
      var idea = getIdea(ids[i]);
      if (sources.isNewRow(idea)) fresh.push(ids[i]);
      else older.push(ids[i]);
    }
    return fresh.concat(older);
  }

  return {
    HORIZON_DAYS: HORIZON_DAYS,
    NO_START: NO_START,
    feedModeOf: feedModeOf,
    canonicalWhen: canonicalWhen,
    maxDate: maxDate,
    dateAllowed: dateAllowed,
    storedWhen: storedWhen,
    resolveSelection: resolveSelection,
    openOnDay: openOnDay,
    matchesFeed: matchesFeed,
    barText: barText,
    modeLabel: modeLabel,
    formatDay: formatDay,
    startSortKey: startSortKey,
    compareHappening: compareHappening,
    passesHappeningKeyset: passesHappeningKeyset,
    localPhase: localPhase,
    passesLocalKeyset: passesLocalKeyset,
    partitionNewFirst: partitionNewFirst
  };
});
