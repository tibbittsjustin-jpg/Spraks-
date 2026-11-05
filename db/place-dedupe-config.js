/* Round 8 dedupe configuration. These datasets are not loaded in this PR.
   The loader reads the rules when those files are enabled later. OSM stays
   isolated from every other source. */
"use strict";

const ROUND8_DEDUPE = [
  {
    id: "peaks",
    datasets: ["ugrc_peaks", "ugrc_gnis"],
    match: "same normalized name within 1000 m",
    keep: "ugrc_peaks",
    drop: "ugrc_gnis summit",
    note: "Keep the UGRC peak and drop a GNIS summit with the same name."
  },
  {
    id: "gnis_wikidata",
    datasets: ["ugrc_gnis", "wikidata"],
    match: "GNIS id, then normalized name within 500 m",
    keep: "ugrc_gnis",
    note: "The GNIS identifier wins. Name plus 500 m is only the fallback."
  },
  {
    id: "trailheads_federal",
    datasets: ["ugrc_trailheads", "usfs", "blm"],
    match: "normalized name within 300 m",
    keep: "usfs or blm",
    note: "Prefer the USFS or BLM row because it has its own item page."
  },
  {
    id: "blm_facilities",
    datasets: ["blm"],
    match: "facility parent site id",
    keep: "parent site",
    note: "BLM facilities nest under their parent site and are not separate places."
  }
];

/* About 48,000 trail segments are expected to collapse to 2,000-4,000 trails
   before dedupe. Call this on the Utah Trails and Pathways file only. */
function aggregateTrailSegments(segments) {
  const groups = new Map();
  (segments || []).forEach(segment => {
    const name = String(segment.trail_name || segment.name || "").trim();
    const key = name.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, {
        name: name || segment.name,
        trail_name: name,
        segmentCount: 0,
        lat: segment.lat,
        lng: segment.lng,
        segments: []
      });
    }
    const group = groups.get(key);
    group.segmentCount += 1;
    group.segments.push(segment);
  });
  return [...groups.values()];
}

function dedupeRuleFor(datasetKey) {
  return ROUND8_DEDUPE.filter(rule => rule.datasets.indexOf(datasetKey) !== -1);
}

module.exports = {
  ROUND8_DEDUPE: ROUND8_DEDUPE,
  aggregateTrailSegments: aggregateTrailSegments,
  dedupeRuleFor: dedupeRuleFor
};
