/* ===================== Jaderoo radius.js =====================
 * Shared distance for the Discover slider and the Filters "How far?"
 * slider. Both controls persist filters.radiusMiles (1–50, default 10).
 *
 * An idea is filtered only when its distance can be measured:
 *   - lat/lng (or location / coordinates) compared with the user's
 *     position, when that position is known
 *   - otherwise distanceMiles, already measured from the user
 * Ideas with neither stay in the deck. With no user position, coordinate
 * ideas stay too — there is nothing to measure them against.
 *
 * No DOM. Loaded as a classic script before app.js. Node tests require()
 * this file; the browser assigns window.SparkRadius.
 * ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SparkRadius = api;
})(this, function () {
  "use strict";

  var RADIUS_MIN = 1;
  var RADIUS_MAX = 50;
  var RADIUS_DEFAULT = 10;
  var RADIUS_STOPS = [1, 5, 10, 25, 50];
  var RADIUS_SLIDER_MAX = 1000;
  // Nearest confident pin within this many miles lends its city to the label.
  var NEAREST_LABEL_MILES = 15;
  var EARTH_MILES = 3958.7613;

  function finite(n){
    return typeof n === "number" && isFinite(n);
  }

  function clampRadiusMiles(value){
    var n;
    if(typeof value === "number") n = value;
    else if(typeof value === "string" && value.trim()) n = Number(value);
    else return RADIUS_DEFAULT;
    if(!isFinite(n)) return RADIUS_DEFAULT;
    n = Math.round(n);
    if(n < RADIUS_MIN) return RADIUS_MIN;
    if(n > RADIUS_MAX) return RADIUS_MAX;
    return n;
  }

  function radiusLabel(miles){
    return clampRadiusMiles(miles) + " mi";
  }

  function pair(lat, lng){
    if(!finite(lat) || !finite(lng)) return null;
    if(lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat: lat, lng: lng };
  }

  function pointFrom(obj){
    if(!obj || typeof obj !== "object") return null;
    return pair(obj.lat, obj.lng) || pair(obj.latitude, obj.longitude);
  }

  function ideaPoint(idea){
    if(!idea || typeof idea !== "object") return null;
    var direct = pointFrom(idea);
    if(direct) return direct;
    var fromLocation = pointFrom(idea.location);
    if(fromLocation) return fromLocation;
    var coords = idea.coordinates != null ? idea.coordinates : idea.coords;
    if(Array.isArray(coords)) return pair(coords[0], coords[1]);
    return pointFrom(coords);
  }

  function distanceMilesOf(idea){
    if(!idea || typeof idea !== "object") return null;
    var n = idea.distanceMiles;
    if(!finite(n) || n < 0) return null;
    return n;
  }

  function haversineMiles(a, b){
    var toRad = function(d){ return d * Math.PI / 180; };
    var dLat = toRad(b.lat - a.lat);
    var dLng = toRad(b.lng - a.lng);
    var lat1 = toRad(a.lat);
    var lat2 = toRad(b.lat);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // Inclusive. A missing origin keeps coordinate-only ideas. A missing
  // distance keeps the idea. Coordinates win over distanceMiles when both
  // the idea and the user have a point, so a stale distance cannot hide
  // a place that is actually inside the radius.
  function withinRadius(idea, origin, radiusMiles){
    var radius = clampRadiusMiles(radiusMiles);
    var point = ideaPoint(idea);
    var from = pointFrom(origin);
    if(point && from) return haversineMiles(from, point) <= radius + 1e-4;
    var known = distanceMilesOf(idea);
    if(known == null) return true;
    return known <= radius + 1e-6;
  }

  function milesToSlider(miles){
    miles = clampRadiusMiles(miles);
    var segs = RADIUS_STOPS.length - 1;
    for(var i = 1; i < RADIUS_STOPS.length; i++){
      if(miles <= RADIUS_STOPS[i]){
        var span = RADIUS_STOPS[i] - RADIUS_STOPS[i - 1];
        var t = span === 0 ? 0 : (miles - RADIUS_STOPS[i - 1]) / span;
        return Math.round(((i - 1 + t) / segs) * RADIUS_SLIDER_MAX);
      }
    }
    return RADIUS_SLIDER_MAX;
  }

  function sliderToMiles(pos){
    var p = typeof pos === "number" ? pos : Number(pos);
    if(!isFinite(p)) return RADIUS_DEFAULT;
    if(p < 0) p = 0;
    if(p > RADIUS_SLIDER_MAX) p = RADIUS_SLIDER_MAX;
    var segs = RADIUS_STOPS.length - 1;
    var x = (p / RADIUS_SLIDER_MAX) * segs;
    var i = Math.min(segs - 1, Math.floor(x + 1e-9));
    var t = x - i;
    return clampRadiusMiles(Math.round(RADIUS_STOPS[i] + t * (RADIUS_STOPS[i + 1] - RADIUS_STOPS[i])));
  }

  function nearestPlaceLabel(origin, pins, maxMiles){
    var from = pointFrom(origin);
    if(!from || !pins || typeof pins !== "object") return null;
    var limit = finite(maxMiles) ? maxMiles : NEAREST_LABEL_MILES;
    var best = null;
    var bestD = Infinity;
    Object.keys(pins).forEach(function(id){
      var pin = pins[id];
      if(!pin || typeof pin.city !== "string" || !pin.city.trim()) return;
      var point = pair(pin.lat, pin.lng);
      if(!point) return;
      var d = haversineMiles(from, point);
      if(d < bestD){
        bestD = d;
        best = pin.city.trim();
      }
    });
    if(best == null || bestD > limit) return null;
    return best;
  }

  return {
    RADIUS_MIN: RADIUS_MIN,
    RADIUS_MAX: RADIUS_MAX,
    RADIUS_DEFAULT: RADIUS_DEFAULT,
    RADIUS_STOPS: RADIUS_STOPS,
    RADIUS_SLIDER_MAX: RADIUS_SLIDER_MAX,
    NEAREST_LABEL_MILES: NEAREST_LABEL_MILES,
    clampRadiusMiles: clampRadiusMiles,
    radiusLabel: radiusLabel,
    ideaPoint: ideaPoint,
    haversineMiles: haversineMiles,
    withinRadius: withinRadius,
    milesToSlider: milesToSlider,
    sliderToMiles: sliderToMiles,
    nearestPlaceLabel: nearestPlaceLabel
  };
});
