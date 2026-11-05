/* Who an activity is for. Discover shows these five chips and no others.

   Family Friendly, Friends, Date, Group Date, Solo.

   Family Friendly means an adult (18+) can bring kids. It does not mean
   Jaderoo is for children. The help line under that chip is FAMILY_HELP.

   Solo is one person going alone. It is not the old "Solo/Couple" date
   size. That label is never rewritten into Solo.

   Matching is an OR overlap, the same way vibe and season match: a row
   hits when it carries any selected chip. An empty filter matches every
   row. An empty, null, or missing audience matches no selected chip.
   This module does not invent Friends and Date for untagged rows. That
   write, if it happens, is a later reviewed tagging pass.

   Family Friendly is removed from the overlap when age21 is true, even if
   the row was tagged by mistake, and even when Hide 21+ is off. A 21+ row
   tagged Family Friendly and Friends still matches Friends. A 21+ row
   tagged only Family Friendly matches nothing.

   "Good with kids" is the older proposal name for Family Friendly. It is
   accepted on the way in and stored as Family Friendly. Keyword hits from
   the proposal query are not tags. reviewFamilyCandidate never promotes
   them. Alcohol and kids-only wording block a new Family Friendly
   submission. They do not override a tag that a person has already saved,
   except age21, which the matcher always enforces.

   Loaded before app.js. Node tests and the activities query require() it.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SparkAudience = api;
})(this, function () {
  "use strict";

  var FAMILY = "Family Friendly";
  var LEGACY_FAMILY = "Good with kids";
  var AUDIENCE = [FAMILY, "Friends", "Date", "Group Date", "Solo"];
  var FAMILY_HELP = "For adults 18+. Means the activity works when you bring kids, not that Jaderoo is for children.";

  var ALCOHOL_RE = /21\+|must be 21|over 21|21 and over|bar crawl|brewery|brewpub|wine tasting|cocktail|happy hour|nightclub|adults only|taproom|distillery/i;
  var KIDS_ONLY_RE = /kids only|children only|youth only|youth recital|kids' club|kids\u2019 club/i;

  function canonicalizeToken(token) {
    if (typeof token !== "string") return "";
    var text = token.trim();
    if (text === LEGACY_FAMILY) return FAMILY;
    return text;
  }

  function normalizeFilterSelection(value) {
    var parts;
    if (Array.isArray(value)) parts = value;
    else if (value == null || value === "") parts = [];
    else parts = String(value).split(",");
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var token = canonicalizeToken(parts[i]);
      if (!token || AUDIENCE.indexOf(token) === -1 || seen[token]) continue;
      seen[token] = true;
      out.push(token);
    }
    return out;
  }

  // null when the field is absent or not a list. An empty list means the
  // column is present and still untagged.
  function canonicalStored(value) {
    if (value == null) return null;
    if (!Array.isArray(value)) return null;
    return normalizeFilterSelection(value);
  }

  function effectiveAudience(idea) {
    var stored = null;
    if (idea && Object.prototype.hasOwnProperty.call(idea, "audience")) {
      stored = canonicalStored(idea.audience);
    }
    var tags = stored ? stored.slice() : [];
    if (idea && idea.age21 === true) {
      var kept = [];
      for (var i = 0; i < tags.length; i++) {
        if (tags[i] !== FAMILY) kept.push(tags[i]);
      }
      tags = kept;
    }
    return tags;
  }

  function matchesAudience(idea, selected) {
    var want = normalizeFilterSelection(selected);
    if (!want.length) return true;
    var tags = effectiveAudience(idea);
    for (var i = 0; i < tags.length; i++) {
      if (want.indexOf(tags[i]) !== -1) return true;
    }
    return false;
  }

  function withoutFamily(selected) {
    return normalizeFilterSelection(selected).filter(function (tag) {
      return tag !== FAMILY;
    });
  }

  // Drop Date Stage and Double or Group Date from a saved filter blob.
  // Those selections are not copied onto audience. Solo/Couple does not
  // become Solo.
  function prepareSavedFilters(filters) {
    var src = filters && typeof filters === "object" ? filters : {};
    var changed = false;
    if (Object.prototype.hasOwnProperty.call(src, "stage")) {
      delete src.stage;
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(src, "dateType")) {
      delete src.dateType;
      changed = true;
    }
    var next = normalizeFilterSelection(src.audience);
    var prev = Array.isArray(src.audience) ? src.audience : null;
    if (!prev || prev.length !== next.length || prev.some(function (tag, index) { return tag !== next[index]; })) {
      changed = true;
    }
    src.audience = next;
    return { filters: src, changed: changed };
  }

  function blocksFamilyFriendly(record) {
    record = record || {};
    if (record.age21 === true) return "age21";
    var blob = String(record.title == null ? "" : record.title) + " " +
      String(record.description == null ? "" : record.description);
    if (ALCOHOL_RE.test(blob)) return "alcohol";
    if (KIDS_ONLY_RE.test(blob)) return "kids_only";
    return "";
  }

  // Proposal keywords are a review queue, not a tag. This never returns a
  // Family Friendly write.
  function reviewFamilyCandidate(record) {
    var blocked = blocksFamilyFriendly(record);
    return { promote: false, blocked: blocked || null, tag: null };
  }

  function canonicalizeInput(value) {
    if (!Array.isArray(value)) return value;
    return value.map(function (item) {
      return item === LEGACY_FAMILY ? FAMILY : item;
    });
  }

  return {
    FAMILY: FAMILY,
    LEGACY_FAMILY: LEGACY_FAMILY,
    AUDIENCE: AUDIENCE.slice(),
    FAMILY_HELP: FAMILY_HELP,
    canonicalizeToken: canonicalizeToken,
    normalizeFilterSelection: normalizeFilterSelection,
    canonicalStored: canonicalStored,
    effectiveAudience: effectiveAudience,
    matchesAudience: matchesAudience,
    withoutFamily: withoutFamily,
    prepareSavedFilters: prepareSavedFilters,
    blocksFamilyFriendly: blocksFamilyFriendly,
    reviewFamilyCandidate: reviewFamilyCandidate,
    canonicalizeInput: canonicalizeInput
  };
});
