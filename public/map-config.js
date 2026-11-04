/* Map display settings for the radius map.
   Tiles are requested by the browser from the U.S. Geological Survey.
   This server does not proxy, seed, or prefetch them, and there is no
   service worker. Browser HTTP caching is the only cache.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JaderooMapConfig = api;
})(this, function () {
  "use strict";

  // USGSTopo, EPSG:3857, 256px. USGSImageryTopo and USGSShadedReliefOnly
  // are the only other layers Legal cleared. They are not selected here.
  var USGS_TILE_URL = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}";

  // Legal's 4:27 PM addendum. This is the map-corner sentence only.
  // /sources keeps the longer credit, including the non-endorsement line.
  var MAP_CORNER_CREDIT = "Map services and data available from U.S. Geological Survey, National Geospatial Program.";
  var SOURCES_PATH = "/sources";

  // Self-hosted Protomaps PMTiles is the planned fallback and is not built
  // in this release. Set protomapsPmtilesUrl to a same-origin .pmtiles file
  // later. protomapsFallbackStyle() stays null until that file exists, so
  // nothing here hotlinks or ships an OSM basemap.
  var protomapsPmtilesUrl = null;

  function protomapsFallbackStyle() {
    if (!protomapsPmtilesUrl) return null;
    return null;
  }

  return {
    USGS_TILE_URL: USGS_TILE_URL,
    MAP_CORNER_CREDIT: MAP_CORNER_CREDIT,
    SOURCES_PATH: SOURCES_PATH,
    TILE_SIZE: 256,
    protomapsPmtilesUrl: protomapsPmtilesUrl,
    protomapsFallbackStyle: protomapsFallbackStyle
  };
});
