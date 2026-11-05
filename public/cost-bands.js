/* $20 cost bands and the legacy read alias.

   bandsForStoredCost decides which buttons a stored string matches.
   $1-$10 matches $1-$20. $20-$30 matches only $21-$40.
   $100 and under matches $21-$40 through $81-$100.
   A new band matches only itself.

   displayLabel is the text on a card, a detail tag, and a budget button.
   It uses an en dash. Stored values and filter queries keep the ASCII hyphen.
   $1-$10 prints as $1–$20, $20-$30 as $21–$40, and
   $100 and under as Up to $100.

   Loaded before remote-activities.js and app.js. Node tests require() it.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SparkCostBands = api;
})(this, function () {
  "use strict";

  var COST_BANDS = ["Free", "$1-$20", "$21-$40", "$41-$60", "$61-$80", "$81-$100", "Over $100"];
  var EN_DASH = "\u2013";

  // Old strings that can still be stored, and the new bands each one matches.
  // $1-$10 is not a value we write anymore. It still matches $1-$20 until 019 runs.
  function bandsForStoredCost(stored) {
    if (stored === "$1-$10") return ["$1-$20"];
    if (stored === "$20-$30") return ["$21-$40"];
    if (stored === "$100 and under") return ["$21-$40", "$41-$60", "$61-$80", "$81-$100"];
    return [stored];
  }

  function storedCostsForBands(selected) {
    var out = [];
    function add(value) {
      if (out.indexOf(value) === -1) out.push(value);
    }
    var list = Array.isArray(selected) ? selected : [];
    var old = ["$1-$10", "$20-$30", "$100 and under"];
    for (var i = 0; i < list.length; i++) {
      var band = list[i];
      add(band);
      for (var j = 0; j < old.length; j++) {
        if (bandsForStoredCost(old[j]).indexOf(band) !== -1) add(old[j]);
      }
    }
    return out;
  }

  function costMatches(stored, selected) {
    if (!selected || !selected.length) return true;
    var bands = bandsForStoredCost(stored);
    for (var i = 0; i < selected.length; i++) {
      if (bands.indexOf(selected[i]) !== -1 || selected[i] === stored) return true;
    }
    return false;
  }

  // Shown text. New steps swap the hyphen for an en dash. Legacy stored
  // strings print the new step, except $100 and under, which is "Up to $100".
  function displayLabel(value) {
    var text = typeof value === "string" ? value : "";
    if (text === "$1-$10") return "$1" + EN_DASH + "$20";
    if (text === "$20-$30") return "$21" + EN_DASH + "$40";
    if (text === "$100 and under") return "Up to $100";
    if (COST_BANDS.indexOf(text) !== -1) return text.replace(/-/g, EN_DASH);
    return text;
  }

  // The stored value, unchanged. Cards print displayLabel, not this.
  function storedLabel(value) {
    var text = typeof value === "string" ? value : "";
    bandsForStoredCost(text);
    return text;
  }

  return {
    COST_BANDS: COST_BANDS,
    EN_DASH: EN_DASH,
    bandsForStoredCost: bandsForStoredCost,
    storedCostsForBands: storedCostsForBands,
    costMatches: costMatches,
    displayLabel: displayLabel,
    storedLabel: storedLabel
  };
});
