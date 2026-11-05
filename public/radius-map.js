/* Choose-a-spot map used inside Filters.
   A tap's latitude and longitude come from MapLibre's screen-to-coordinate
   result (lngLat). Tile images are only displayed.
   If MapLibre is missing, the browser is offline, or the map errors, the
   map stage stays hidden. Place search and a short fallback sentence stay
   so Filters has no empty box.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SparkRadiusMap = api;
})(this, function () {
  "use strict";

  var EARTH_M = 6378137;
  var METERS_PER_MILE = 1609.344;
  var RADIUS_MIN = 1;
  var RADIUS_MAX = 50;
  var RADIUS_DEFAULT = 10;
  var FALLBACK_NOTE = "The map didn't load. Search and the radius still work.";

  function mapConfig() {
    if (typeof JaderooMapConfig !== "undefined" && JaderooMapConfig) return JaderooMapConfig;
    if (typeof require === "function") return require("./map-config");
    return null;
  }

  function placeSearch() {
    if (typeof JaderooPlaceSearch !== "undefined" && JaderooPlaceSearch) return JaderooPlaceSearch;
    if (typeof require === "function") return require("./place-search");
    return null;
  }

  function clampMiles(miles) {
    var n = typeof miles === "number" ? miles : Number(miles);
    if (!isFinite(n)) return RADIUS_DEFAULT;
    n = Math.round(n);
    if (n < RADIUS_MIN) return RADIUS_MIN;
    if (n > RADIUS_MAX) return RADIUS_MAX;
    return n;
  }

  function circleRadiusMeters(miles) {
    return clampMiles(miles) * METERS_PER_MILE;
  }

  function fallbackRadiusPx(miles) {
    var m = clampMiles(miles);
    return Math.round(12 + (m - RADIUS_MIN) * (78 / (RADIUS_MAX - RADIUS_MIN)));
  }

  function destinationPoint(lat, lng, bearing, distanceM) {
    var rad = Math.PI / 180;
    var lat1 = lat * rad;
    var lng1 = lng * rad;
    var d = distanceM / EARTH_M;
    var lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing));
    var lng2 = lng1 + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    return { lat: lat2 / rad, lng: lng2 / rad };
  }

  function circleRing(center, miles) {
    if (!center || typeof center.lat !== "number" || typeof center.lng !== "number") return [];
    var meters = circleRadiusMeters(miles);
    var ring = [];
    var steps = 64;
    for (var i = 0; i <= steps; i++) {
      var point = destinationPoint(center.lat, center.lng, (i / steps) * Math.PI * 2, meters);
      ring.push([point.lng, point.lat]);
    }
    return ring;
  }

  function haversineMeters(a, b) {
    var rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad;
    var dLng = (b.lng - a.lng) * rad;
    var lat1 = a.lat * rad;
    var lat2 = b.lat * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // Only the projected lng/lat. Extra fields on the object are ignored.
  function coordinateFromProjection(lngLat) {
    if (!lngLat || typeof lngLat !== "object") return null;
    var lat = lngLat.lat;
    var lng = lngLat.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    if (!isFinite(lat) || !isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat: lat, lng: lng };
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Passed to MapLibre's AttributionControl. compact is left unset so a map
  // at most 640px wide uses the (i) toggle and a wider map shows the sentence.
  function attributionOptions() {
    var config = mapConfig() || {};
    var text = config.MAP_CORNER_CREDIT || "";
    var href = config.SOURCES_PATH || "/sources";
    return {
      customAttribution: '<a href="' + escapeHtml(href) + '">' + escapeHtml(text) + "</a>"
    };
  }

  function basemapStyle() {
    var config = mapConfig();
    if (!config) return null;
    var hooked = typeof config.protomapsFallbackStyle === "function" ? config.protomapsFallbackStyle() : null;
    if (hooked) return hooked;
    return {
      version: 8,
      sources: {
        usgs: {
          type: "raster",
          tiles: [config.USGS_TILE_URL],
          tileSize: config.TILE_SIZE || 256
        }
      },
      layers: [{ id: "usgs-topo", type: "raster", source: "usgs" }]
    };
  }

  function polygonData(center, miles) {
    var ring = circleRing(center, miles);
    if (!ring.length) return { type: "FeatureCollection", features: [] };
    return {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [ring] }
      }]
    };
  }

  function el(doc, tag, className) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function mount(parent, options) {
    options = options || {};
    var doc = typeof document !== "undefined" ? document : null;
    var config = mapConfig();
    var searchApi = placeSearch();
    var state = {
      center: options.center || null,
      miles: clampMiles(options.radiusMiles),
      pickMode: options.pickMode === true,
      tiles: "off",
      results: []
    };
    var map = null;
    var marker = null;
    var mapLib = null;
    var alive = true;

    if (!doc || !parent || typeof parent.appendChild !== "function") {
      return bareHandle(state);
    }

    var panel = el(doc, "div", "radius-map-panel");
    panel.setAttribute("data-tiles", "off");
    panel.setAttribute("data-radius-miles", String(state.miles));
    panel.setAttribute("data-search", "closed");

    var searchWrap = el(doc, "div", "radius-map-search");
    var query = el(doc, "input", "field-input radius-map-query");
    query.type = "search";
    query.setAttribute("aria-label", "Search a place");
    query.setAttribute("placeholder", "Search a Utah place");
    query.setAttribute("autocomplete", "off");
    var results = el(doc, "div", "radius-map-results");
    searchWrap.appendChild(query);
    searchWrap.appendChild(results);

    var stage = el(doc, "div", "radius-map-stage");
    var canvas = el(doc, "div", "radius-map-canvas");
    var blank = el(doc, "div", "radius-map-blank");
    var svg = doc.createElementNS ? doc.createElementNS("http://www.w3.org/2000/svg", "svg") : el(doc, "svg", "");
    svg.setAttribute("class", "radius-map-ring");
    svg.setAttribute("viewBox", "0 0 200 200");
    svg.setAttribute("aria-hidden", "true");
    var circle = doc.createElementNS ? doc.createElementNS("http://www.w3.org/2000/svg", "circle") : el(doc, "circle", "");
    circle.setAttribute("cx", "100");
    circle.setAttribute("cy", "100");
    circle.setAttribute("fill", "rgba(11,110,79,0.18)");
    circle.setAttribute("stroke", "#0B6E4F");
    circle.setAttribute("stroke-width", "2");
    if (svg.appendChild) svg.appendChild(circle);
    var pin = el(doc, "div", "radius-map-pin");
    pin.setAttribute("aria-hidden", "true");
    if (blank.appendChild) {
      blank.appendChild(svg);
      blank.appendChild(pin);
    }
    var note = el(doc, "p", "radius-map-note");
    var credit = el(doc, "a", "radius-map-credit");
    var creditText = config ? config.MAP_CORNER_CREDIT : "";
    credit.textContent = creditText;
    credit.setAttribute("href", config ? config.SOURCES_PATH : "/sources");
    stage.appendChild(canvas);
    stage.appendChild(blank);
    stage.appendChild(credit);
    panel.appendChild(searchWrap);
    panel.appendChild(note);
    panel.appendChild(stage);
    parent.appendChild(panel);

    function paintBlank() {
      circle.setAttribute("r", String(fallbackRadiusPx(state.miles)));
      panel.setAttribute("data-radius-miles", String(state.miles));
      var tilesOn = state.tiles === "on";
      stage.hidden = !tilesOn;
      blank.hidden = true;
      pin.hidden = true;
      if (state.tiles === "off" || state.tiles === "error") note.textContent = FALLBACK_NOTE;
      else note.textContent = "";
    }

    function paintSearchVisibility() {
      var open = state.pickMode || state.tiles !== "on";
      searchWrap.hidden = !open;
      panel.setAttribute("data-search", open ? "open" : "closed");
    }

    function paintCircleOnMap() {
      if (!map || !map.getSource) return;
      var source = null;
      try { source = map.getSource("radius"); } catch (err) { source = null; }
      if (!source || !source.setData) return;
      source.setData(polygonData(state.center, state.miles));
      var ring = circleRing(state.center, state.miles);
      if (ring.length && map.fitBounds) {
        var minLng = ring[0][0], maxLng = ring[0][0], minLat = ring[0][1], maxLat = ring[0][1];
        for (var i = 1; i < ring.length; i++) {
          if (ring[i][0] < minLng) minLng = ring[i][0];
          if (ring[i][0] > maxLng) maxLng = ring[i][0];
          if (ring[i][1] < minLat) minLat = ring[i][1];
          if (ring[i][1] > maxLat) maxLat = ring[i][1];
        }
        try {
          map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 28, animate: false, maxZoom: 12 });
        } catch (err) {}
      }
    }

    function moveMarker() {
      if (!marker || !state.center) return;
      try { marker.setLngLat([state.center.lng, state.center.lat]); } catch (err) {}
    }

    function ensureMarker() {
      if (!map || !state.center || !mapLib || typeof mapLib.Marker !== "function") return;
      if (marker) {
        moveMarker();
        return;
      }
      try {
        marker = new mapLib.Marker({ draggable: state.pickMode, color: "#E07A5F" });
        marker.setLngLat([state.center.lng, state.center.lat]).addTo(map);
        if (marker.on) marker.on("dragend", function () {
          emitPick(marker.getLngLat ? marker.getLngLat() : null);
        });
      } catch (err) {
        marker = null;
      }
    }

    function emitPick(lngLat) {
      if (!state.pickMode) return;
      var coord = coordinateFromProjection(lngLat);
      if (!coord) return;
      state.center = coord;
      ensureMarker();
      paintCircleOnMap();
      paintBlank();
      if (typeof options.onPick === "function") options.onPick(coord);
    }

    function markTiles(mode) {
      state.tiles = mode;
      panel.setAttribute("data-tiles", mode);
      paintBlank();
      paintSearchVisibility();
    }

    function renderResults(list) {
      state.results = list || [];
      results.textContent = "";
      if (results.innerHTML != null) results.innerHTML = "";
      if (Array.isArray(results.children)) results.children.length = 0;
      state.results.forEach(function (place, index) {
        var button = el(doc, "button", "radius-map-hit");
        button.type = "button";
        button.textContent = place.name;
        button.setAttribute("data-source", place.source);
        button.addEventListener("click", function () { choose(index); });
        results.appendChild(button);
      });
    }

    function runSearch(text) {
      var list = searchApi && searchApi.searchPlaces ? searchApi.searchPlaces(text) : [];
      renderResults(list);
      return list;
    }

    function choose(index) {
      var place = state.results[index];
      if (!place) return null;
      if (typeof options.onSearchSelect === "function") options.onSearchSelect(place);
      return place;
    }

    if (query.addEventListener) {
      query.addEventListener("input", function () { runSearch(query.value); });
    }

    var mapAttempts = 0;
    var mapLoaded = false;
    var sawTile = false;
    var loadTimer = null;
    function stageSize() {
      try {
        return {
          w: stage.clientWidth || stage.offsetWidth || 0,
          h: stage.clientHeight || stage.offsetHeight || 0
        };
      } catch (err) {
        return { w: 0, h: 0 };
      }
    }
    function clearLoadTimer() {
      if (!loadTimer) return;
      clearTimeout(loadTimer);
      loadTimer = null;
    }
    function canvasLooksBlank() {
      try {
        var el = map && map.getCanvas ? map.getCanvas() : null;
        if (!el || !el.width || !el.height) return true;
        var gl = el.getContext("webgl2") || el.getContext("webgl");
        if (!gl) return true;
        var px = new Uint8Array(4);
        gl.readPixels(Math.floor(el.width / 2), Math.floor(el.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return px[0] < 96 && px[1] < 96 && px[2] < 96;
      } catch (err) {
        return false;
      }
    }
    function tryMap() {
      if (!alive || map) return;
      var lib = typeof maplibregl !== "undefined" ? maplibregl : null;
      if (options.maplibre) lib = options.maplibre;
      mapLib = lib;
      var online = true;
      try {
        if (typeof navigator !== "undefined" && navigator && navigator.onLine === false) online = false;
      } catch (err) { online = true; }
      if (!online || !lib || typeof lib.Map !== "function") {
        markTiles("off");
        return;
      }
      var style = basemapStyle();
      if (!style) {
        markTiles("off");
        return;
      }
      // The stage starts hidden. Unhide it before measuring, or MapLibre
      // builds a zero-size canvas and the sheet stays a blank box.
      stage.hidden = false;
      var size = stageSize();
      if (!size.w || !size.h) {
        mapAttempts += 1;
        if (mapAttempts > 45 || typeof requestAnimationFrame !== "function") {
          markTiles("off");
          return;
        }
        requestAnimationFrame(tryMap);
        return;
      }
      try {
        map = new lib.Map({
          container: canvas,
          style: style,
          center: state.center ? [state.center.lng, state.center.lat] : [-111.6, 39.32],
          zoom: state.center ? 8 : 6,
          attributionControl: false,
          fadeDuration: 0,
          canvasContextAttributes: { preserveDrawingBuffer: true, antialias: false }
        });
      } catch (err) {
        map = null;
        markTiles("off");
        return;
      }
      markTiles("on");
      clearLoadTimer();
      loadTimer = setTimeout(function () {
        loadTimer = null;
        if (!alive) return;
        if (!canvasLooksBlank()) return;
        markTiles("error");
      }, 3500);
      if (typeof lib.AttributionControl === "function" && map.addControl) {
        try {
          map.addControl(new lib.AttributionControl(attributionOptions()), "bottom-right");
          credit.hidden = true;
        } catch (err) {}
      }
      if (map.on) {
        map.on("data", function (event) {
          if (!event || !event.tile || sawTile) return;
          if (event.tile.state !== "loaded") return;
          sawTile = true;
          mapLoaded = true;
        });
        map.on("error", function (event) {
          if (!alive || sawTile) return;
          var status = event && event.error && event.error.status;
          if (event && event.tile) return;
          if (status) return;
          markTiles("error");
        });
        map.on("load", function () {
          if (!alive || !map || !map.addSource) return;
          try {
            map.addSource("radius", { type: "geojson", data: polygonData(state.center, state.miles) });
            map.addLayer({
              id: "radius-fill",
              type: "fill",
              source: "radius",
              paint: { "fill-color": "#0B6E4F", "fill-opacity": 0.18 }
            });
            map.addLayer({
              id: "radius-line",
              type: "line",
              source: "radius",
              paint: { "line-color": "#0B6E4F", "line-width": 2 }
            });
          } catch (err) {}
          paintCircleOnMap();
          resizeMap();
        });
        map.on("click", function (event) {
          emitPick(event && event.lngLat);
        });
      }
      ensureMarker();
    }

    paintBlank();
    paintSearchVisibility();
    tryMap();

    function setRadiusMiles(miles) {
      state.miles = clampMiles(miles);
      paintBlank();
      paintCircleOnMap();
      return state.miles;
    }
    function setCenter(center) {
      state.center = center && typeof center.lat === "number" ? { lat: center.lat, lng: center.lng } : null;
      paintBlank();
      ensureMarker();
      paintCircleOnMap();
    }
    function setPickMode(on) {
      state.pickMode = on === true;
      paintSearchVisibility();
      if (marker && marker.setDraggable) {
        try { marker.setDraggable(state.pickMode); } catch (err) {}
      }
    }
    var resizeObserver = null;
    function resizeMap() {
      if (!alive || !map || typeof map.resize !== "function") return;
      var size = stageSize();
      if (!size.w || !size.h) return;
      try { map.resize(); } catch (err) {}
      if (map.triggerRepaint) {
        try { map.triggerRepaint(); } catch (err) {}
      }
      paintCircleOnMap();
    }
    function watchStage() {
      if (typeof ResizeObserver !== "function") return;
      try {
        resizeObserver = new ResizeObserver(function () { resizeMap(); });
        resizeObserver.observe(stage);
      } catch (err) {
        resizeObserver = null;
      }
    }

    function destroy() {
      alive = false;
      clearLoadTimer();
      if (resizeObserver && resizeObserver.disconnect) {
        try { resizeObserver.disconnect(); } catch (err) {}
      }
      resizeObserver = null;
      if (map && map.remove) {
        try { map.remove(); } catch (err) {}
      }
      map = null;
      marker = null;
    }

    watchStage();

    return {
      element: panel,
      setRadiusMiles: setRadiusMiles,
      setCenter: setCenter,
      setPickMode: setPickMode,
      resize: resizeMap,
      destroy: destroy,
      runSearch: runSearch,
      choose: choose,
      radiusMiles: function () { return state.miles; },
      tilesState: function () { return state.tiles; },
      FALLBACK_NOTE: FALLBACK_NOTE
    };
  }

  function bareHandle(state) {
    return {
      element: null,
      setRadiusMiles: function (miles) { state.miles = clampMiles(miles); return state.miles; },
      setCenter: function () {},
      setPickMode: function () {},
      resize: function () {},
      destroy: function () {},
      runSearch: function () { return []; },
      choose: function () { return null; },
      radiusMiles: function () { return state.miles; },
      tilesState: function () { return "off"; },
      FALLBACK_NOTE: FALLBACK_NOTE
    };
  }

  return {
    FALLBACK_NOTE: FALLBACK_NOTE,
    MAP_CORNER_CREDIT: (mapConfig() && mapConfig().MAP_CORNER_CREDIT) || "",
    attributionOptions: attributionOptions,
    clampMiles: clampMiles,
    circleRadiusMeters: circleRadiusMeters,
    fallbackRadiusPx: fallbackRadiusPx,
    circleRing: circleRing,
    haversineMeters: haversineMeters,
    coordinateFromProjection: coordinateFromProjection,
    basemapStyle: basemapStyle,
    mount: mount
  };
});
