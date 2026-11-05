/* Place search for "Pick a spot".
   The list is the census city centers and GNIS feature locations already
   stored on activities (geo_source census or gnis). Census contributes one
   center per city. A GNIS row contributes the feature named on that row.
   There is no geocoder and nothing is read out of map tiles.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JaderooPlaceSearch = api;
})(this, function () {
  "use strict";

  var PLACES = [
    { name: "American Fork", lat: 40.37820, lng: -111.79544, source: "census" },
    { name: "Cedar City", lat: 37.68374, lng: -113.09551, source: "census" },
    { name: "Highland", lat: 40.42761, lng: -111.79553, source: "census" },
    { name: "Lehi", lat: 40.41572, lng: -111.87072, source: "census" },
    { name: "Lindon", lat: 40.34137, lng: -111.71875, source: "census" },
    { name: "Orem", lat: 40.29810, lng: -111.69947, source: "census" },
    { name: "Payson", lat: 40.03549, lng: -111.73898, source: "census" },
    { name: "Pleasant Grove", lat: 40.37144, lng: -111.74128, source: "census" },
    { name: "Provo", lat: 40.24573, lng: -111.64572, source: "census" },
    { name: "Roy", lat: 41.17146, lng: -112.04848, source: "census" },
    { name: "Saratoga Springs", lat: 40.34460, lng: -111.91570, source: "census" },
    { name: "Spanish Fork", lat: 40.11044, lng: -111.64117, source: "census" },
    { name: "Springville", lat: 40.16378, lng: -111.62049, source: "census" },
    { name: "Aspen Grove", lat: 40.40329, lng: -111.60242, source: "gnis" },
    { name: "Big Springs Park", lat: 40.33531, lng: -111.52357, source: "gnis" },
    { name: "Bonneville Salt Flats", lat: 40.79965, lng: -113.80000, source: "gnis" },
    { name: "Crystal Geyser", lat: 38.93858, lng: -110.13541, source: "gnis" },
    { name: "Delicate Arch", lat: 38.74276, lng: -109.49401, source: "gnis" },
    { name: "Courthouse Wash", lat: 38.60470, lng: -109.58151, source: "gnis" },
    { name: "Goosenecks", lat: 37.16667, lng: -109.93401, source: "gnis" },
    { name: "Grafton", lat: 37.16721, lng: -113.07994, source: "gnis" },
    { name: "Grotto Trailhead", lat: 39.95246, lng: -111.67520, source: "gnis" },
    { name: "Hobble Creek Canyon", lat: 40.23346, lng: -111.46856, source: "gnis" },
    { name: "Island in the Sky", lat: 38.39721, lng: -109.88957, source: "gnis" },
    { name: "Lincoln Beach", lat: 40.14495, lng: -111.80715, source: "gnis" },
    { name: "Nunn's Park", lat: 40.33607, lng: -111.61131, source: "gnis" },
    { name: "Paria Rimrocks", lat: 37.11026, lng: -111.87434, source: "gnis" },
    { name: "Piute Reservoir", lat: 38.32286, lng: -112.19208, source: "gnis" },
    { name: "Provo Canyon", lat: 40.35496, lng: -111.57408, source: "gnis" },
    { name: "Salem Pond", lat: 40.05177, lng: -111.67634, source: "gnis" },
    { name: "Silver Lake Flat", lat: 40.50298, lng: -111.65705, source: "gnis" },
    { name: "Spanish Fork River Park", lat: 40.02662, lng: -111.50491, source: "gnis" },
    { name: "Stewart Falls", lat: 40.38634, lng: -111.60381, source: "gnis" },
    { name: "Strawberry Reservoir", lat: 40.17441, lng: -111.12676, source: "gnis" },
    { name: "Sundance", lat: 40.39304, lng: -111.58157, source: "gnis" },
    { name: "Thistle", lat: 39.99134, lng: -111.49824, source: "gnis" },
    { name: "Three Forks Trailhead", lat: 40.08440, lng: -111.35546, source: "gnis" },
    { name: "Tower Arch", lat: 38.78998, lng: -109.68707, source: "gnis" }
  ];

  function norm(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/^\s+|\s+$/g, "");
  }

  function copyPlace(place) {
    return { name: place.name, lat: place.lat, lng: place.lng, source: place.source };
  }

  function searchPlaces(query, limit) {
    var q = norm(query);
    if (q.length < 2) return [];
    var cap = typeof limit === "number" && limit > 0 ? Math.floor(limit) : 8;
    var hits = [];
    for (var i = 0; i < PLACES.length; i++) {
      var place = PLACES[i];
      if (place.source !== "census" && place.source !== "gnis") continue;
      var name = norm(place.name);
      var score = null;
      if (name === q) score = 0;
      else if (name.indexOf(q) === 0) score = 1;
      else if ((" " + name + " ").indexOf(" " + q + " ") !== -1) score = 2;
      else if (name.indexOf(q) !== -1) score = 3;
      if (score == null) continue;
      hits.push({
        score: score,
        sourceRank: place.source === "census" ? 0 : 1,
        name: place.name,
        place: place
      });
    }
    hits.sort(function (a, b) {
      if (a.score !== b.score) return a.score - b.score;
      if (a.sourceRank !== b.sourceRank) return a.sourceRank - b.sourceRank;
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return 0;
    });
    var out = [];
    for (var h = 0; h < hits.length && out.length < cap; h++) out.push(copyPlace(hits[h].place));
    return out;
  }

  return {
    PLACES: PLACES.map(copyPlace),
    searchPlaces: searchPlaces
  };
});
