/* Event dates for an activity. No DOM and no filters UI.

   NULL / a missing field means anytime.

   A list of specific dates (times optional, 24-hour HH:MM):
     [{ "date": "2026-11-28", "start": "19:00", "end": "22:00" }]
   A date range plus weekdays:
     { "start": "2026-11-03", "end": "2027-03-27", "weekdays": ["Tue", "Thu"] }
   Research files also send ranges in a list:
     [{ "start_date", "end_date", "weekdays", "start"?, "end"?, "exclude"?, "week_of_month"? }]
   end_date null means the weekdays keep going. exclude lists days off.
   week_of_month uses 1 for the first seven days of the month (a first Friday).

   Stored shape is always one of:
     { "kind": "dates", "dates": [{ "date", "start?", "end?" }] }
     { "kind": "weekly", "start", "end"?, "weekdays", "exclude"?, "week_of_month"? }
   Several bounded ranges, or a range with days off, become a date list so a
   gap is not treated as a show day. One ongoing range stays weekly, with no
   end date.

   Calendar days and weekdays are civil dates. "Today" is America/Denver.
   A YYYY-MM-DD value is never parsed with the device timezone, so a date
   does not slip to the previous evening. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SparkOccurrences = api;
})(this, function () {
  "use strict";

  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var WEEKDAY_ALIASES = {
    sun: "Sun", sunday: "Sun",
    mon: "Mon", monday: "Mon",
    tue: "Tue", tues: "Tue", tuesday: "Tue",
    wed: "Wed", weds: "Wed", wednesday: "Wed",
    thu: "Thu", thur: "Thu", thurs: "Thu", thursday: "Thu",
    fri: "Fri", friday: "Fri",
    sat: "Sat", saturday: "Sat"
  };
  var SAKAMOTO = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function isRealDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    var dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  function parseISODate(value) {
    if (typeof value !== "string") return null;
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return null;
    var y = Number(match[1]);
    var m = Number(match[2]);
    var d = Number(match[3]);
    if (!isRealDate(y, m, d)) return null;
    return match[1] + "-" + match[2] + "-" + match[3];
  }

  /* 0 = Sunday. The calendar date itself, not a timezone-shifted instant. */
  function weekdayIndex(iso) {
    var date = parseISODate(iso);
    if (!date) return null;
    var parts = date.split("-");
    var y = Number(parts[0]);
    var month = Number(parts[1]);
    var d = Number(parts[2]);
    if (month < 3) y -= 1;
    return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + SAKAMOTO[month - 1] + d) % 7;
  }

  function weekdayName(iso) {
    var index = weekdayIndex(iso);
    return index == null ? null : WEEKDAYS[index];
  }

  function addDays(iso, days) {
    var parts = iso.split("-");
    var dt = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.getUTCFullYear() + "-" + pad2(dt.getUTCMonth() + 1) + "-" + pad2(dt.getUTCDate());
  }

  /* 1 for the 1st through the 7th, 2 for the 8th through the 14th, and so on. */
  function weekOfMonthIndex(iso) {
    var date = parseISODate(iso);
    if (!date) return null;
    return Math.floor((Number(date.slice(8, 10)) - 1) / 7) + 1;
  }

  function denverToday(now) {
    var dt = (now instanceof Date && !isNaN(now.getTime())) ? now : new Date();
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Denver",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(dt);
    var y = "";
    var m = "";
    var d = "";
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === "year") y = parts[i].value;
      if (parts[i].type === "month") m = parts[i].value;
      if (parts[i].type === "day") d = parts[i].value;
    }
    if (m.length === 1) m = "0" + m;
    if (d.length === 1) d = "0" + d;
    return y + "-" + m + "-" + d;
  }

  function normalizeTime(value) {
    if (value == null || value === "") return { ok: true, value: null };
    if (typeof value !== "string") return { ok: false };
    var text = value.trim().toLowerCase().replace(/\s+/g, "");
    var match = /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?(am|pm)?$/.exec(text);
    if (!match) return { ok: false };
    var hour = Number(match[1]);
    var minute = match[2] == null ? 0 : Number(match[2]);
    var suffix = match[3];
    if (minute > 59) return { ok: false };
    if (suffix) {
      if (hour < 1 || hour > 12) return { ok: false };
      if (suffix === "pm" && hour !== 12) hour += 12;
      if (suffix === "am" && hour === 12) hour = 0;
    } else if (hour > 23) {
      return { ok: false };
    }
    return { ok: true, value: pad2(hour) + ":" + pad2(minute) };
  }

  function canonicalWeekday(value) {
    if (typeof value !== "string") return null;
    var key = value.trim().toLowerCase().replace(/\./g, "");
    return WEEKDAY_ALIASES[key] || null;
  }

  function normalizeWeekdays(value) {
    var raw = value;
    if (typeof raw === "string") raw = raw.split(/[,/]+|\s+/);
    if (!Array.isArray(raw) || !raw.length) return null;
    var seen = {};
    var names = [];
    for (var i = 0; i < raw.length; i++) {
      if (raw[i] == null || raw[i] === "") continue;
      var name = canonicalWeekday(String(raw[i]));
      if (!name) return null;
      if (seen[name]) continue;
      seen[name] = true;
      names.push(name);
    }
    if (!names.length) return null;
    names.sort(function (a, b) { return WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b); });
    return names;
  }

  function dateEntry(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    var date = parseISODate(raw.date);
    if (!date) return null;
    var start = normalizeTime(raw.start);
    var end = normalizeTime(raw.end);
    if (!start.ok || !end.ok) return null;
    var entry = { date: date };
    if (start.value) entry.start = start.value;
    if (end.value) entry.end = end.value;
    return entry;
  }

  function entryKey(entry) {
    return entry.date + "|" + (entry.start || "") + "|" + (entry.end || "");
  }

  function normalizeDates(list) {
    if (!Array.isArray(list) || !list.length) return { ok: false };
    var seen = {};
    var dates = [];
    for (var i = 0; i < list.length; i++) {
      var entry = dateEntry(list[i]);
      if (!entry) return { ok: false };
      var key = entryKey(entry);
      if (seen[key]) continue;
      seen[key] = true;
      dates.push(entry);
    }
    dates.sort(function (a, b) {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      var aStart = a.start || "";
      var bStart = b.start || "";
      if (aStart < bStart) return -1;
      if (aStart > bStart) return 1;
      var aEnd = a.end || "";
      var bEnd = b.end || "";
      if (aEnd < bEnd) return -1;
      if (aEnd > bEnd) return 1;
      return 0;
    });
    return { ok: true, value: { kind: "dates", dates: dates } };
  }

  function normalizeExclude(value) {
    if (value == null) return [];
    if (!Array.isArray(value)) return null;
    var seen = {};
    var dates = [];
    for (var i = 0; i < value.length; i++) {
      var date = parseISODate(value[i]);
      if (!date || seen[date]) return null;
      seen[date] = true;
      dates.push(date);
    }
    dates.sort();
    return dates;
  }

  function normalizeWeekOfMonth(value) {
    if (value == null) return [];
    var raw = Array.isArray(value) ? value : [value];
    if (!raw.length) return null;
    var seen = {};
    var weeks = [];
    for (var i = 0; i < raw.length; i++) {
      var week = raw[i];
      if (typeof week === "string" && /^[1-5]$/.test(week.trim())) week = Number(week.trim());
      if (typeof week !== "number" || week !== Math.floor(week) || week < 1 || week > 5) return null;
      if (seen[week]) continue;
      seen[week] = true;
      weeks.push(week);
    }
    if (!weeks.length) return null;
    weeks.sort(function (a, b) { return a - b; });
    return weeks;
  }

  function normalizeWeekly(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false };
    var research = raw.start_date != null || raw.end_date != null;
    var start = parseISODate(research ? raw.start_date : raw.start);
    var end = null;
    if (research) {
      if (raw.end_date != null && raw.end_date !== "") {
        end = parseISODate(raw.end_date);
        if (!end) return { ok: false };
      }
    } else if (raw.end != null && raw.end !== "") {
      end = parseISODate(raw.end);
      if (!end) return { ok: false };
    }
    var weekdays = normalizeWeekdays(raw.weekdays);
    if (!start || !weekdays || (end && start > end)) return { ok: false };
    var exclude = normalizeExclude(raw.exclude);
    if (!exclude) return { ok: false };
    var weekOfMonth = normalizeWeekOfMonth(raw.week_of_month != null ? raw.week_of_month : raw.weekOfMonth);
    if (!weekOfMonth) return { ok: false };
    var value = { kind: "weekly", start: start, weekdays: weekdays };
    if (end) value.end = end;
    if (exclude.length) value.exclude = exclude;
    if (weekOfMonth.length) value.week_of_month = weekOfMonth;
    return { ok: true, value: value };
  }

  function isDateItem(raw) {
    return !!raw && typeof raw === "object" && !Array.isArray(raw) && raw.date != null && raw.start_date == null;
  }

  function isSpanItem(raw) {
    return !!raw && typeof raw === "object" && !Array.isArray(raw) && raw.date == null &&
      (raw.start_date != null || raw.weekdays != null);
  }

  function parseSpan(raw) {
    if (!isSpanItem(raw) || raw.start_date == null) return null;
    var weekly = normalizeWeekly(raw);
    if (!weekly.ok) return null;
    var timeStart = normalizeTime(raw.start);
    var timeEnd = normalizeTime(raw.end);
    if (!timeStart.ok || !timeEnd.ok) return null;
    return {
      start: weekly.value.start,
      end: weekly.value.end || null,
      weekdays: weekly.value.weekdays,
      exclude: weekly.value.exclude || [],
      weekOfMonth: weekly.value.week_of_month || null,
      timeStart: timeStart.value,
      timeEnd: timeEnd.value
    };
  }

  /* A bounded range becomes one row per show day so a gap, a day off, or a
     week-of-month rule is not flattened into every weekday. */
  function expandSpans(spans) {
    var list = [];
    for (var s = 0; s < spans.length; s++) {
      var span = spans[s];
      var cursor = span.start;
      var guard = 0;
      while (cursor <= span.end) {
        guard += 1;
        if (guard > 400) return { ok: false };
        var onWeekday = span.weekdays.indexOf(weekdayName(cursor)) !== -1;
        var onWeek = !span.weekOfMonth || span.weekOfMonth.indexOf(weekOfMonthIndex(cursor)) !== -1;
        var excluded = span.exclude.indexOf(cursor) !== -1;
        if (onWeekday && onWeek && !excluded) {
          var entry = { date: cursor };
          if (span.timeStart) entry.start = span.timeStart;
          if (span.timeEnd) entry.end = span.timeEnd;
          list.push(entry);
        }
        cursor = addDays(cursor, 1);
      }
    }
    return normalizeDates(list);
  }

  function normalizeSpanList(list) {
    var spans = [];
    for (var i = 0; i < list.length; i++) {
      var span = parseSpan(list[i]);
      if (!span) return { ok: false };
      spans.push(span);
    }
    var open = false;
    for (var j = 0; j < spans.length; j++) {
      if (!spans[j].end) open = true;
    }
    if (!open) return expandSpans(spans);
    if (spans.length !== 1) return { ok: false };
    return normalizeWeekly(list[0]);
  }

  /* null and a missing value are anytime. Anything else must be a date list
     or a weekday range. */
  function normalizeOccurrences(value) {
    if (value == null) return { ok: true, value: null };
    if (Array.isArray(value)) {
      if (!value.length) return { ok: false };
      if (value.every(isDateItem)) return normalizeDates(value);
      if (value.every(isSpanItem)) return normalizeSpanList(value);
      return { ok: false };
    }
    if (typeof value !== "object") return { ok: false };
    if (value.kind === "dates" || Array.isArray(value.dates)) return normalizeDates(value.dates);
    if (value.kind === "weekly" || value.start_date || (value.start && value.end && value.weekdays)) return normalizeWeekly(value);
    return { ok: false };
  }

  function occursOn(occurrences, isoDate) {
    var date = parseISODate(isoDate);
    if (!date) return false;
    var norm = normalizeOccurrences(occurrences);
    if (!norm.ok || !norm.value) return false;
    if (norm.value.kind === "dates") {
      for (var i = 0; i < norm.value.dates.length; i++) {
        if (norm.value.dates[i].date === date) return true;
      }
      return false;
    }
    if (date < norm.value.start) return false;
    if (norm.value.end && date > norm.value.end) return false;
    var name = weekdayName(date);
    if (norm.value.weekdays.indexOf(name) === -1) return false;
    if (norm.value.week_of_month && norm.value.week_of_month.indexOf(weekOfMonthIndex(date)) === -1) return false;
    if (norm.value.exclude && norm.value.exclude.indexOf(date) !== -1) return false;
    return true;
  }

  function expiresOn(idea) {
    if (!idea) return null;
    var raw = idea.expires_at != null ? idea.expires_at : idea.expiresAt;
    return parseISODate(typeof raw === "string" ? raw : "");
  }

  /* planDate is the Plan a Date calendar day, or "" when no date is set.
     A plan date keeps dated events only when they occur that day. Anytime
     ideas (null occurrences) stay. With no plan date, an idea stays through
     its expires_at day in America/Denver. With no expires_at, a list of
     specific dates stays through its last date. Other schedules stay. */
  function visibleOnPlan(idea, planDate, now) {
    if (!idea || typeof idea !== "object") return false;
    var when = parseISODate(typeof planDate === "string" ? planDate : "");
    if (when) {
      if (idea.occurrences == null) return true;
      return occursOn(idea.occurrences, when);
    }
    var today = denverToday(now);
    var expires = expiresOn(idea);
    if (expires) return today <= expires;
    var norm = normalizeOccurrences(idea.occurrences);
    if (norm.ok && norm.value && norm.value.kind === "dates") {
      var dates = norm.value.dates;
      if (!dates.length) return false;
      return today <= dates[dates.length - 1].date;
    }
    return true;
  }

  return {
    WEEKDAYS: WEEKDAYS,
    parseISODate: parseISODate,
    weekdayIndex: weekdayIndex,
    weekdayName: weekdayName,
    denverToday: denverToday,
    normalizeOccurrences: normalizeOccurrences,
    occursOn: occursOn,
    visibleOnPlan: visibleOnPlan
  };
});
