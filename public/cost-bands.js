/* $20 cost bands and the legacy read alias.

   One helper, bandsForStoredCost. The card shows the stored label.
   A filter for a new band also matches every old string that could fall
   in it. $1-$10 is only the read alias: migration 019 renames it, and new
   rows do not store it. $20-$30 and $100 and under stay on flagged rows.

   Loaded before remote-activities.js and app.js. Node tests require() it.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SparkCostBands = api;
})(this, function () {
  "use strict";

  var COST_BANDS = ["Free", "$1-$20", "$21-$40", "$41-$60", "$61-$80", "$81-$100", "Over $100"];

  // Old strings that can still be stored, and the new bands each one matches.
  // $1-$10 is not a value we write anymore. It still matches $1-$20 until 019 runs.
  function bandsForStoredCost(stored) {
    if (stored === "$1-$10") return ["$1-$20"];
    if (stored === "$20-$30") return ["$1-$20", "$21-$40"];
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

  // The card prints this string. The alias never rewrites it.
  function storedLabel(value) {
    var text = typeof value === "string" ? value : "";
    bandsForStoredCost(text);
    return text;
  }

  return {
    COST_BANDS: COST_BANDS,
    bandsForStoredCost: bandsForStoredCost,
    storedCostsForBands: storedCostsForBands,
    costMatches: costMatches,
    storedLabel: storedLabel
  };
});
