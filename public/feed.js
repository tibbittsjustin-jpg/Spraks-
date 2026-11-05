/* Discover feed: anytime activities and dated events together, the Denver
   date window, the card bar, and new-first ordering. No DOM.
   Both the browser and the activities query load this file.
   Dates are America/Denver civil days from SparkOccurrences.
   A saved feed mode does not hide either kind of idea. */
(function (root, factory) {
  function load(path, globalName) {
    if (typeof module === "object" && module.exports) return require(path);
    return root[globalName];
  }
  var api = factory(load("./occurrences", "SparkOccurrences"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SparkFeed = api;
})(this, function (occ) {
  "use strict";

  var HORIZON_DAYS = 14;
  var NO_START = 24 * 60 + 1;
  /* activities.id identity starts at 100000. Approved rows below that are
     the original curated seed (ids 2–2000, source curated, created
     2026-10-29). Rows at or above it are the later loads (source ai,
     created Oct 31–Nov 4), including almost every dated event.
     Nearby-place cards use 9000000–9999999 and are not activities ids. */
  var NEW_ROW_ID = 100000;
  var REAL_ID_MIN = 9000000;
  var REAL_ID_MAX = 10000000;
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

  /* Keep a saved day only when it is still inside the window.
     An expired day clears. It does not snap back to Tonight. */
  function storedWhen(value, now) {
    var when = canonicalWhen(value);
    if (when === "tonight" || when === "today") return when;
    if (when && dateAllowed(when, now)) return when;
    return "";
  }

  function resolveSelection(filters, now) {
    var when = canonicalWhen(filters && filters.when);
    var today = occ.denverToday(now);
    var kind = "none";
    var date = null;
    if (when === "tonight") {
      kind = "tonight";
      date = today;
    } else if (when === "today") {
      kind = "day";
      date = today;
    } else if (when && dateAllowed(when, now)) {
      kind = "day";
      date = when;
    } else {
      when = "";
    }
    return { mode: "mixed", when: when, kind: kind, date: date, today: today };
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

  /* Anytime activities and dated events share one list. A When choice
     limits dated events to that Denver day. It does not drop anytime
     activities. With no When choice, both kinds stay. feedMode is ignored. */
  function matchesFeed(idea, filters, now) {
    if (!idea || typeof idea !== "object") return false;
    var sel = resolveSelection(filters, now);
    var dated = occ.isDatedEvent(idea);
    if (!dated) {
      if (sel.kind === "none") return true;
      return openOnDay(idea, sel.date) === true;
    }
    if (sel.kind === "none") return true;
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

  /* Activities id, not a nearby-place id. dbId and "db:<n>" are the
     client copies of that column. */
  function numericDbId(row) {
    if (!row || typeof row !== "object") return null;
    if (typeof row.dbId === "number" && isFinite(row.dbId) && Math.floor(row.dbId) === row.dbId) return row.dbId;
    var raw = row.id;
    if (typeof raw === "string") {
      var prefixed = /^db:(\d+)$/.exec(raw);
      if (!prefixed) return null;
      return Number(prefixed[1]);
    }
    if (typeof raw === "number" && isFinite(raw) && Math.floor(raw) === raw) {
      if (raw >= REAL_ID_MIN && raw < REAL_ID_MAX) return null;
      return raw;
    }
    return null;
  }

  /* Ticketmaster cards from the remote activities feed have no activities
     id. isEvent, or a stableKey of tm:…, is that live event. */
  function isRemoteLiveEvent(row) {
    if (!row || typeof row !== "object") return false;
    if (row.isEvent === true) return true;
    return typeof row.stableKey === "string" && row.stableKey.indexOf("tm:") === 0;
  }

  function isNewRow(row) {
    if (isRemoteLiveEvent(row)) return true;
    var id = numericDbId(row);
    return id != null && id >= NEW_ROW_ID;
  }

  function newRowSql() {
    return "(id >= " + NEW_ROW_ID + ")";
  }

  function newRowCountSql() {
    var pred = newRowSql();
    return "SELECT count(*) FILTER (WHERE " + pred + ") AS new_rows,\n" +
      "       count(*) FILTER (WHERE NOT " + pred + ") AS older_rows\n" +
      "FROM activities\n" +
      "WHERE status = 'approved';";
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
    var aNew = isNewRow(a) ? 0 : 1;
    var bNew = isNewRow(b) ? 0 : 1;
    if (aNew !== bNew) return aNew - bNew;
    var aStart = startSortKey(a, isoDate);
    var bStart = startSortKey(b, isoDate);
    if (aStart !== bStart) return aStart - bStart;
    return rowId(a) - rowId(b);
  }

  function passesHappeningKeyset(row, cursor, isoDate) {
    if (!cursor) return true;
    var n = isNewRow(row) ? 0 : 1;
    var s = startSortKey(row, isoDate);
    if (n !== cursor.n) return n > cursor.n;
    if (s !== cursor.s) return s > cursor.s;
    return rowId(row) > Number(cursor.id);
  }

  function localPhase(row, located) {
    var fresh = isNewRow(row);
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
      if (isNewRow(idea)) fresh.push(ids[i]);
      else older.push(ids[i]);
    }
    return fresh.concat(older);
  }

  return {
    HORIZON_DAYS: HORIZON_DAYS,
    NO_START: NO_START,
    NEW_ROW_ID: NEW_ROW_ID,
    isNewRow: isNewRow,
    newRowSql: newRowSql,
    newRowCountSql: newRowCountSql,
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
