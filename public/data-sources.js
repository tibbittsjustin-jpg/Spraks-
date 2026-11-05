/* Data-source credits and the public Sources page.
   Credit sentences for the place datasets are copied from Legal's
   attribution quick reference. Loaded before app.js. Node can require it.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JaderooSources = api;
})(this, function () {
  "use strict";

  var CC_BY = "https://creativecommons.org/licenses/by/4.0/";
  var TRAILHEAD_DATASET = "https://opendata.gis.utah.gov/datasets/9c21cc1f95ba40468deb36bb6fd94943_0";
  var PARKS_DATASET = "https://opendata.gis.utah.gov/datasets/818536733987486b8082e4c5dec0a1dd_0";
  var UGRC_POLICY = "https://gis.utah.gov/documentation/policy/license/";

  var TRAILHEAD_CREDIT = "Utah Trailheads, via UGRC SGID \u00b7 CC BY 4.0 \u00b7 data modified";
  var PARK_CREDIT = "Utah Parks Local, via UGRC SGID \u00b7 CC BY 4.0 \u00b7 data modified";
  var TRAILHEAD_PHRASES = [
    { text: "UGRC SGID", href: TRAILHEAD_DATASET },
    { text: "CC BY 4.0", href: CC_BY }
  ];
  var PARK_PHRASES = [
    { text: "UGRC SGID", href: PARKS_DATASET },
    { text: "CC BY 4.0", href: CC_BY }
  ];

  // The parks change note stops at "reformatted." Nothing in the app uses
  // park polygons to say which park a place is in.
  var UGRC_HEADING = "Utah Trailheads and Utah Parks Local (UGRC)";
  var UGRC_LINES = [
    "Utah Trailheads and Utah Parks Local",
    "Data Sources: UGRC SGID (data modified).",
    "Source: Utah Geospatial Resource Center (UGRC, formerly AGRC), State Geographic Information Database (SGID). Datasets: Utah Trailheads (https://opendata.gis.utah.gov/datasets/9c21cc1f95ba40468deb36bb6fd94943_0) and Utah Parks Local (https://opendata.gis.utah.gov/datasets/818536733987486b8082e4c5dec0a1dd_0).",
    "License: Creative Commons Attribution 4.0 International (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/. UGRC license policy: https://gis.utah.gov/documentation/policy/license/.",
    "Changes we made: Utah Trailheads: coordinates converted to latitude/longitude; fields selected and reformatted. Utah Parks Local: park areas reduced to approximate center points; parks marked 'Future' (not yet open) removed; fields selected, acreage rounded and reformatted. We don't add any other information to these datasets.",
    "UGRC and the State of Utah don't endorse Jaderoo and aren't responsible for how we use or show this data.",
    "Disclaimer from UGRC (unmodified): \"The data, including but not limited to geographic data, tabular data, and analytical data, are provided \"as is\" and \"as available\", with no guarantees relating to the availability, completeness, or accuracy of data, and without any express or implied warranties. These data are provided as a public service for informational purposes only. You are solely responsible for obtaining the proper evaluation of a location and associated data by a qualified professional. UGRC reserves the right to change, revise, suspend or discontinue published data and services without notice at any time. Neither UGRC nor the State of Utah are responsible for any misuse or misrepresentation of the data. UGRC and the State of Utah are not obligated to provide you with any maintenance or support. The user assumes the entire risk as to the quality and performance of the data. You agree to hold the State of Utah harmless for any claims, liability, costs, and damages relating to your use of the data. You agree that your sole remedy for any dissatisfaction or claims is to discontinue use of the data.\""
  ];

  var STATE_PARKS_CREDIT = "via Utah State Parks";
  var STATE_PARKS_PAGE = "Utah State Parks. Park names, locations and links come from the Utah Division of State Parks website (https://stateparks.utah.gov/). We list facts only, write our own descriptions, and link to each park's official page. We don't copy State Parks pages, photos or logos. State information is provided \"as is\" under the Utah.gov Terms of Use (https://www.utah.gov/support/disclaimer.html). Jaderoo isn't affiliated with or endorsed by Utah State Parks or the State of Utah. Check the park's official page for hours, fees and closures before you go.";

  var NPS_CREDIT = "via National Park Service (nps.gov)";
  var NPS_PAGE = "National Park Service. Names, locations and links for national park units in Utah come from nps.gov, a U.S. Department of the Interior website. No claim to original U.S. Government works. We don't use NPS photos or the NPS Arrowhead, and the National Park Service doesn't endorse Jaderoo. Check the park's nps.gov page for current conditions, alerts and closures.";
  var NPS_NOTICE = "No claim to original U.S. Government works.";
  // Sources page only. No source_key. The park-unit credit above stays.
  var NPS_PLACE_PAGES_LEAD = "National Park Service.";
  var NPS_PLACE_PAGES = "National Park Service. Some park and monument locations come from National Park Service place pages on nps.gov, or from NPS-published public-domain datasets we have host-checked. Credit: National Park Service. No claim to original U.S. Government works. Locations are approximate. Features may be seasonal, permit-only, or closed, so check the park before you go. The National Park Service does not endorse Jaderoo.";

  var MUSEUMS_CREDIT = "via Utah Division of Arts & Museums";
  var MUSEUMS_PAGE = "Utah Museums Directory. Museum names, addresses and links come from the Utah Museums Directory published by the Utah Division of Arts & Museums, a division of the Utah Department of Cultural & Community Engagement (https://artsandmuseums.utah.gov/utah-museums-directory/). We list facts only and link to each listing. State information is provided \"as is\" under the Utah.gov Terms of Use (https://www.utah.gov/support/disclaimer.html). Jaderoo isn't affiliated with or endorsed by the Division or the listed museums.";

  var NOT_AFFILIATED = "Jaderoo is not affiliated with or endorsed by any of these sources.";
  var CHECK_CONDITIONS = "Check conditions before you go.";
  var APPROXIMATE = "Approximate location.";
  var ORGANIZER = "Jaderoo isn't affiliated with the organizer.";
  var COPYRIGHT = "© 2026 Jaderoo. No claim to original U.S. Government works.";
  var REPORT_LABEL = "Report or remove a listing";
  var REPORT_HREF = "mailto:support@jaderoo.com?subject=Report%20or%20remove%20a%20listing";


  // Round 8 attribution. Credit lines and Sources-page sentences are copied
  // from Legal's quick reference. The bulk loader sets activities.source_key
  // to `key` (see ROUND8_SOURCES). A known key selects the credit line, so
  // source_credit may be empty or the same sentence. UGRC rows: set
  // source_url to datasetUrl. usfs: set source_url to the row's recareaurl.
  // blm: set source_url to the row's BLMRecURL. source_url must be https.
  // Do not store Sources-page paragraphs on the row. No new columns.
  // Utah Trailheads stays ugrc_trailheads. Utah Schools PreK to 12 has
  // no source_key. Layers whose item license could not be verified are
  // not listed. This file does not import any rows.

  var UGRC_SGID_INTRO_TEMPLATE = "Utah Geospatial Resource Center (UGRC), State Geographic Information Database (SGID). Data Sources: UGRC SGID (data modified). Layers used: {list each layer title, linked to its dataset page}. Licensed under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/). Changes made by Jaderoo: records filtered to activity types, polygons and lines reduced to points, trail segments combined by trail name, fields renamed and reformatted, and our own short summaries added. Neither UGRC nor the State of Utah endorses Jaderoo.";
  var UGRC_SGID_DISCLAIMER = "UGRC disclaimer (unmodified): \"The data, including but not limited to geographic data, tabular data, and analytical data, are provided \"as is\" and \"as available\", with no guarantees relating to the availability, completeness, or accuracy of data, and without any express or implied warranties. These data are provided as a public service for informational purposes only. You are solely responsible for obtaining the proper evaluation of a location and associated data by a qualified professional. UGRC reserves the right to change, revise, suspend or discontinue published data and services without notice at any time. Neither UGRC nor the State of Utah are responsible for any misuse or misrepresentation of the data. UGRC and the State of Utah are not obligated to provide you with any maintenance or support. The user assumes the entire risk as to the quality and performance of the data. You agree to hold the State of Utah harmless for any claims, liability, costs, and damages relating to your use of the data. You agree that your sole remedy for any dissatisfaction or claims is to discontinue use of the data.\"";
  var UGRC_SGID_GNIS = "GNIS place names originate from the U.S. Geological Survey Geographic Names Information System. Credit: U.S. Geological Survey.";
  // R8.5. The lead-in is bold on the page. This sits under the shared
  // UGRC block, which already shows the unmodified disclaimer once.
  var ADDRESS_POINTS_DATASET = "https://opendata.gis.utah.gov/datasets/3f4f7a8efcd147febeca8bacaea67a14_0";
  var EVENT_LOCATIONS_LEAD = "Event locations (geocoding).";
  var EVENT_LOCATIONS_PAGE = "Event locations (geocoding). Map locations for event addresses are calculated by matching each venue address against Utah Address Points, a dataset in the Utah Geospatial Resource Center (UGRC) State Geographic Information Database (SGID), https://opendata.gis.utah.gov/datasets/3f4f7a8efcd147febeca8bacaea67a14_0, licensed under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/). Data Sources: UGRC SGID (data modified). Changes we made: we keep only the matched location, converted to latitude/longitude, and don't show or republish the address list. Locations may be approximate. Neither UGRC nor the State of Utah endorses Jaderoo.";
  var GNIS_USGS_CREDIT = "Credit: U.S. Geological Survey.";
  var GNIS_ACCESS = "Check access and conditions before you go.";
  var GNIS_NOTE = GNIS_USGS_CREDIT + " " + GNIS_ACCESS;
  var USFS_CREDIT = "via USDA Forest Service";
  var USFS_PAGE = "USDA Forest Service. Recreation site information from the U.S. Forest Service Recreation Opportunities dataset (Enterprise Data Warehouse), https://www.fs.usda.gov/. U.S. Government work. No claim to original U.S. Government works. Data may be incomplete or out of date; check with the managing forest before you go. Use of this data does not imply endorsement by the USDA Forest Service.";
  var USFS_HOME = "https://www.fs.usda.gov/";
  var BLM_CREDIT = "via Bureau of Land Management";
  var BLM_PAGE = "Bureau of Land Management (BLM). Recreation site information from the BLM National Recreation Sites and Facilities map service (compiled by BLM from Recreation.gov's Recreation Information Database), https://www.blm.gov/programs/recreation. U.S. Government work. No claim to original U.S. Government works. Use of this data does not imply endorsement by the BLM or the U.S. Department of the Interior.";
  var BLM_RECREATION = "https://www.blm.gov/programs/recreation";
  var BLM_PERMIT_PAGE = "Permit information from the U.S. Bureau of Land Management outfitter list. BLM does not endorse or promote any permittee.";
  // Sources page only. No source_key and no per-card line. The Utah GNIS
  // Place Names credit (ugrc_gnis) stays as it is.
  var USGS_GNIS_LEAD = "USGS GNIS.";
  var USGS_GNIS_URL = "https://www.usgs.gov/tools/geographic-names-information-system-gnis";
  var USGS_GNIS_PAGE = "USGS GNIS. Some place names and locations come from the Geographic Names Information System (GNIS), U.S. Geological Survey, " + USGS_GNIS_URL + ". Credit: U.S. Geological Survey. Locations are approximate. Features may be on private or closed land, so check access and conditions before you go. Neither USGS nor the U.S. government endorses Jaderoo.";
  var CENSUS_LEAD = "U.S. Census Bureau.";
  var CENSUS_URL = "https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html";
  var CENSUS_PAGE = "U.S. Census Bureau. Some general city or area locations are center points we calculated from the U.S. Census Bureau's 2023 Cartographic Boundary Files (places), " + CENSUS_URL + ". These show the general area, not the exact venue location. Credit: U.S. Census Bureau. The Census Bureau didn't produce or review these center points, and neither the Census Bureau nor the U.S. government endorses Jaderoo.";
  // Legal nov4f §1b. The map corner uses a shorter line. This is the /sources text.
  var USGS_NATIONAL_MAP_CREDIT = "Map services and data available from U.S. Geological Survey, National Geospatial Program. Credit: U.S. Geological Survey. Neither USGS nor the U.S. government endorses Jaderoo.";
  var BULK_LOADER_NOTES = "Set activities.source_key to key. The key selects the credit line; source_credit may be omitted or set to that same sentence (1 to 500 characters, no control characters). UGRC layers: set source_url to datasetUrl. usfs: set source_url to the record recareaurl. blm: set source_url to the record BLMRecURL. source_url must be https. Do not store Sources page paragraphs in source_credit.";

  function ugrcDatasetUrl(itemId) {
    return "https://opendata.gis.utah.gov/datasets/" + itemId + "_0";
  }

  function ugrcLayer(spec) {
    var url = ugrcDatasetUrl(spec.itemId);
    return {
      key: spec.key,
      title: spec.title,
      itemId: spec.itemId,
      datasetUrl: url,
      credit: spec.credit,
      phrases: [
        { text: "UGRC SGID", href: url },
        { text: "CC BY 4.0", href: CC_BY }
      ],
      linkItem: false,
      note: spec.note || "",
      cardNote: !!spec.cardNote,
      sourceUrlField: "datasetUrl"
    };
  }

  var UGRC_ROUND8 = [
    ugrcLayer({
      key: "ugrc_monuments",
      title: "Utah Monuments and Markers",
      itemId: "63de4118823e4e3eba943ca43caefc72",
      credit: "Utah Monuments and Markers (Utah Division of State History), via UGRC SGID · CC BY 4.0 · data modified",
      note: CHECK_CONDITIONS,
      cardNote: true
    }),
    ugrcLayer({
      key: "ugrc_boat_ramps",
      title: "Utah Boat Ramps",
      itemId: "0d12b74c39eb453088e992bf089d9890",
      credit: "Utah Boat Ramps, via UGRC SGID · CC BY 4.0 · data modified",
      note: CHECK_CONDITIONS,
      cardNote: true
    }),
    ugrcLayer({
      key: "ugrc_golf",
      title: "Utah Golf Courses",
      itemId: "d1f957478ea24659a7badb754a22b91c",
      credit: "Utah Golf Courses, via UGRC SGID · CC BY 4.0 · data modified",
      note: CHECK_CONDITIONS,
      cardNote: true
    }),
    ugrcLayer({
      key: "ugrc_libraries",
      title: "Utah Public Libraries",
      itemId: "f6cf0c8ef65344b6a6e5ebeaa108f549",
      credit: "Utah Public Libraries (Utah State Library Division), via UGRC SGID · CC BY 4.0 · data modified",
      note: "",
      cardNote: false
    }),
    ugrcLayer({
      key: "ugrc_peaks",
      title: "Utah Highest Peaks",
      itemId: "27faf1a5aef2429fb2d660139b6583d6",
      credit: "Utah Highest Peaks, via UGRC SGID · CC BY 4.0 · data modified",
      note: CHECK_CONDITIONS,
      cardNote: true
    }),
    ugrcLayer({
      key: "ugrc_ski_resorts",
      title: "Utah Ski Area Resort Locations",
      itemId: "24029712a33f47feacc7b3f2ef75f179",
      credit: "Utah Ski Area Resort Locations, via UGRC SGID · CC BY 4.0 · data modified",
      note: CHECK_CONDITIONS,
      cardNote: true
    }),
    ugrcLayer({
      key: "ugrc_cemeteries",
      title: "Utah Cemeteries",
      itemId: "f54d1c00020940ec95a729b39518e020",
      credit: "Utah Cemeteries, via UGRC SGID · CC BY 4.0 · data modified",
      note: "",
      cardNote: false
    }),
    ugrcLayer({
      key: "ugrc_historic_trails",
      title: "Utah Historic Trails",
      itemId: "20742e3d34354509b8a9f567f1003509",
      credit: "Utah Historic Trails, via UGRC SGID · CC BY 4.0 · data modified",
      note: CHECK_CONDITIONS,
      cardNote: true
    }),
    ugrcLayer({
      key: "ugrc_trails",
      title: "Utah Trails and Pathways",
      itemId: "3080c0a2859a4d23a279e17e17c703c8",
      credit: "Utah Trails and Pathways (UGRC, WFRC), via UGRC SGID · CC BY 4.0 · data modified",
      note: CHECK_CONDITIONS,
      cardNote: true
    }),
    ugrcLayer({
      key: "ugrc_ski_trails",
      title: "Utah Ski Trails XC",
      itemId: "c94307ff26e641159510005e076f5bfd",
      credit: "Utah Ski Trails XC, via UGRC SGID · CC BY 4.0 · data modified",
      note: CHECK_CONDITIONS,
      cardNote: true
    }),
    ugrcLayer({
      key: "ugrc_gnis",
      title: "Utah GNIS Place Names",
      itemId: "153301fffc8a4128884833e2f7ee1d6e",
      credit: "Name and location: Utah GNIS Place Names (USGS GNIS), via UGRC SGID · CC BY 4.0 · data modified",
      note: GNIS_NOTE,
      cardNote: true
    })
  ];

  var USFS_SOURCE = {
    key: "usfs",
    title: "USDA Forest Service",
    itemId: "",
    datasetUrl: "",
    credit: USFS_CREDIT,
    phrases: null,
    linkItem: true,
    note: CHECK_CONDITIONS,
    cardNote: true,
    sourceUrlField: "recareaurl",
    pagePhrases: [{ text: USFS_HOME, href: USFS_HOME }]
  };

  var BLM_SOURCE = {
    key: "blm",
    title: "Bureau of Land Management (BLM)",
    itemId: "",
    datasetUrl: "",
    credit: BLM_CREDIT,
    phrases: null,
    linkItem: true,
    note: CHECK_CONDITIONS,
    cardNote: true,
    sourceUrlField: "BLMRecURL",
    pagePhrases: [{ text: BLM_RECREATION, href: BLM_RECREATION }]
  };

  var ROUND8_SOURCES = UGRC_ROUND8.concat([USFS_SOURCE, BLM_SOURCE]);
  var UGRC_LAYER_LIST = UGRC_ROUND8.map(function (row) { return row.title; }).join(", ");
  var UGRC_SGID_INTRO = UGRC_SGID_INTRO_TEMPLATE.replace(
    "{list each layer title, linked to its dataset page}",
    UGRC_LAYER_LIST
  );
  var UGRC_LAYER_LINKS = UGRC_ROUND8.map(function (row) {
    return { text: row.title, href: row.datasetUrl };
  });


  // Older ingest text. Showing it would describe changes we do not make.
  var PREVIOUS_CREDITS = {};
  PREVIOUS_CREDITS["Trailhead data: Utah Trailheads, via UGRC, State Geographic Information Database (SGID), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Data modified: locations geocoded and reformatted."] = "ugrc_trailheads";
  PREVIOUS_CREDITS["Trailhead data: Utah Trailheads, via UGRC, State Geographic Information Database (SGID), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Data modified: coordinates converted to latitude/longitude; fields selected and reformatted."] = "ugrc_trailheads";
  PREVIOUS_CREDITS["Park data: Utah Parks Local, via UGRC, State Geographic Information Database (SGID), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Data modified: polygons reduced to center points and reformatted."] = "ugrc_parks";
  PREVIOUS_CREDITS["Park data: Utah Parks Local, via UGRC, State Geographic Information Database (SGID), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Data modified: park areas reduced to approximate center points; proposed, planned and closed parks removed; fields selected, acreage rounded and reformatted."] = "ugrc_parks";

  function entry(fields) {
    return fields;
  }

  var PLACE_ENTRIES = [
    entry({
      key: "ugrc_trailheads",
      group: "places",
      credit: TRAILHEAD_CREDIT,
      datasetUrl: TRAILHEAD_DATASET,
      phrases: TRAILHEAD_PHRASES,
      note: CHECK_CONDITIONS
    }),
    entry({
      key: "ugrc_parks",
      group: "places",
      credit: PARK_CREDIT,
      datasetUrl: PARKS_DATASET,
      phrases: PARK_PHRASES,
      note: APPROXIMATE + " " + CHECK_CONDITIONS
    }),
    entry({
      key: "stateparks",
      group: "places",
      credit: STATE_PARKS_CREDIT,
      linkItem: true
    }),
    entry({
      key: "nps",
      group: "places",
      credit: NPS_CREDIT,
      linkItem: true
    }),
    entry({
      key: "museums",
      group: "places",
      credit: MUSEUMS_CREDIT,
      linkItem: true
    })
  ];

  // House-rule event credits. Needs-permission, avoid, and excluded sources
  // are not listed. Quotation marks in the memo sometimes include a comma
  // or period that ends the sentence; the credit itself does not.
  var EVENT_CREDITS = [
    ["uofu", "University of Utah", "via University of Utah"],
    ["byu", "BYU Calendar", "via BYU Calendar"],
    ["provolibrary", "Provo City Library", "via Provo City Library"],
    ["umfa", "UMFA", "via UMFA"],
    ["americanfork", "American Fork City", "via American Fork City"],
    ["highland", "Highland City", "via Highland City"],
    ["wiseguys", "Wiseguys Comedy", "via Wiseguys Comedy"],
    ["gamenightlive", "Game Night Live", "via Game Night Live"],
    ["questionable", "Questionable Productions", "via Questionable Productions"],
    ["velour", "Velour Live", "via Velour Live"],
    ["lehi", "Lehi City", "via Lehi City"],
    ["saratogasprings", "Saratoga Springs", "via Saratoga Springs"],
    ["deltacenter", "Delta Center", "via Delta Center"],
    ["geekswhodrink", "Geeks Who Drink", "via Geeks Who Drink"],
    ["millcreek", "Millcreek", "via Millcreek"],
    ["murray", "Murray City", "via Murray City"],
    ["hkbrewing", "HK Brewing", "via HK Brewing"],
    ["springville", "Springville City", "via Springville City"],
    ["tuacahn", "Tuacahn", "via Tuacahn"],
    ["grandcounty", "Grand County", "via Grand County"],
    ["prodigy", "Prodigy Brewing", "via Prodigy Brewing"],
    ["weber", "Weber State University", "via Weber State University"],
    ["cedarcity", "Cedar City", "via Cedar City"],
    ["utahhumanities", "Utah Humanities", "via Utah Humanities"],
    ["summitcounty", "Summit County", "via Summit County"],
    ["utahhistory", "Utah Historical Society", "via Utah Historical Society"],
    ["farmington", "Farmington City", "via Farmington City"],
    ["ogden", "Ogden City", "via Ogden City"],
    ["snowcollege", "Snow College", "via Snow College"],
    ["garlandlib", "Garland Public Library", "via Garland Public Library"],
    ["boxeldercounty", "Box Elder County", "via Box Elder County"],
    ["ogdenareaevents", "Ogden City", "via Ogden City"],
    ["bluffdale", "Bluffdale City", "via Bluffdale City"],
    ["vernalevents", "This Is Vernal", "via This Is Vernal"],
    ["washcolib", "Washington County Library System", "via Washington County Library System"],
    ["canyoncountry", "Utah's Canyon Country (San Juan County)", "via Utah's Canyon Country (San Juan County)"],
    ["sanpete", "Sanpete County", "via Sanpete County"],
    ["kanab", "Kanab City", "via Kanab City"],
    ["hurricane", "Hurricane City", "via Hurricane City"],
    ["kanecounty", "Kane County", "via Kane County"],
    ["nephi", "Nephi City", "via Nephi City"],
    ["santaclara", "Santa Clara City", "via Santa Clara City"],
    ["uintahcounty", "Uintah County", "via Uintah County"],
    ["boxelderchamber", "Box Elder Chamber of Commerce", "via Box Elder Chamber of Commerce"]
  ];

  var DISCOVERY = [
    ["visitsaltlake", "Visit Salt Lake", "via Visit Salt Lake"],
    ["utahvalley", "Explore Utah Valley", "via Explore Utah Valley"]
  ];

  var MANUAL = [
    ["manual_peachdays", "Peach Days", "Info from Box Elder Chamber of Commerce"],
    ["manual_beaverfair", "Beaver County Fair", "Info from Beaver County Fair"]
  ];

  function listed(rows, group) {
    return rows.map(function (row) {
      return entry({
        key: row[0],
        name: row[1],
        group: group,
        credit: row[2],
        linkItem: true,
        note: group === "manual" ? ORGANIZER : ""
      });
    });
  }

  var ROUND8_ENTRIES = ROUND8_SOURCES.map(function (row) {
    return entry({
      key: row.key,
      group: "places",
      credit: row.credit,
      datasetUrl: row.datasetUrl,
      phrases: row.phrases,
      linkItem: !!row.linkItem,
      note: row.note,
      cardNote: !!row.cardNote
    });
  });

  var ENTRIES = PLACE_ENTRIES.concat(ROUND8_ENTRIES, listed(EVENT_CREDITS, "events"), listed(DISCOVERY, "discovery"), listed(MANUAL, "manual"));
  var BY_KEY = Object.create(null);
  var BY_CREDIT = Object.create(null);
  ENTRIES.forEach(function (item) {
    BY_KEY[item.key] = item;
    if (!BY_CREDIT[item.credit]) BY_CREDIT[item.credit] = item;
  });
  Object.keys(PREVIOUS_CREDITS).forEach(function (text) {
    BY_CREDIT[text] = BY_KEY[PREVIOUS_CREDITS[text]];
  });

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function httpsPageUrl(value) {
    if (typeof value !== "string") return "";
    var trimmed = value.trim();
    if (!trimmed || /\s/.test(trimmed) || !/^https:\/\//i.test(trimmed)) return "";
    var parsed;
    try {
      parsed = new URL(trimmed);
    } catch (err) {
      return "";
    }
    if (parsed.protocol !== "https:") return "";
    if (parsed.username || parsed.password) return "";
    if (!parsed.hostname) return "";
    if (parsed.href.slice(0, 8).toLowerCase() !== "https://") return "";
    return parsed.href;
  }

  function cleanKey(value) {
    if (typeof value !== "string") return "";
    var key = value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(key)) return "";
    return key;
  }

  function cleanCredit(value) {
    if (typeof value !== "string") return "";
    var text = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
    if (text.length > 500) text = text.slice(0, 500).trim();
    return text;
  }

  function field(idea, snake, camel) {
    if (!idea || typeof idea !== "object") return "";
    if (idea[snake] != null && String(idea[snake]).trim()) return idea[snake];
    if (idea[camel] != null && String(idea[camel]).trim()) return idea[camel];
    return "";
  }

  function itemUrl(idea) {
    var raw = field(idea, "source_url", "sourceUrl");
    return httpsPageUrl(raw);
  }

  function linkParts(text, itemHref) {
    var source = String(text || "");
    if (itemHref && source === itemHref) {
      return [{ text: source, href: itemHref, external: true }];
    }
    if (itemHref && source.indexOf("https://") === -1) {
      return [{ text: source, href: itemHref, external: true }];
    }
    var re = /https:\/\/[^\s)]+/g;
    var parts = [];
    var last = 0;
    var match;
    while ((match = re.exec(source))) {
      var found = httpsPageUrl(match[0]);
      if (!found) continue;
      if (match.index > last) parts.push({ text: source.slice(last, match.index) });
      parts.push({ text: match[0], href: found, external: true });
      last = match.index + match[0].length;
    }
    if (last < source.length) parts.push({ text: source.slice(last) });
    if (!parts.length) parts.push({ text: source });
    return parts;
  }

  function lookup(idea) {
    var key = cleanKey(field(idea, "source_key", "sourceKey"));
    if (key && BY_KEY[key]) return BY_KEY[key];
    var credit = cleanCredit(field(idea, "source_credit", "sourceCredit"));
    if (credit && BY_CREDIT[credit]) return BY_CREDIT[credit];
    return null;
  }

  function linkPhrases(text, phrases) {
    var source = String(text || "");
    var found = [];
    (phrases || []).forEach(function (phrase) {
      if (!phrase || !phrase.text) return;
      var at = source.indexOf(phrase.text);
      if (at < 0) return;
      found.push({ at: at, text: phrase.text, href: phrase.href || "" });
    });
    found.sort(function (a, b) {
      if (a.at !== b.at) return a.at - b.at;
      return b.text.length - a.text.length;
    });
    var parts = [];
    var cursor = 0;
    found.forEach(function (phrase) {
      if (phrase.at < cursor) return;
      if (phrase.at > cursor) parts.push({ text: source.slice(cursor, phrase.at) });
      var href = httpsPageUrl(phrase.href);
      if (href) parts.push({ text: phrase.text, href: href, external: true });
      else parts.push({ text: phrase.text });
      cursor = phrase.at + phrase.text.length;
    });
    if (cursor < source.length) parts.push({ text: source.slice(cursor) });
    if (!parts.length) parts.push({ text: source });
    return parts;
  }

  function creditView(idea) {
    var known = lookup(idea);
    var stored = cleanCredit(field(idea, "source_credit", "sourceCredit"));
    var page = itemUrl(idea);
    if (!known && !stored) return null;
    var credit = known ? known.credit : stored;
    var href = "";
    if (known && known.linkItem) href = page;
    else if (!known) href = page;
    // Phrase links (UGRC SGID, CC BY 4.0) stay on the credit line.
    // linkItem sources (a forest page, a BLM page) link the whole line.
    var parts = (known && known.phrases && known.phrases.length && !known.linkItem)
      ? linkPhrases(credit, known.phrases)
      : linkParts(credit, href);
    var datasetHref = "";
    if (known && known.datasetUrl) datasetHref = page || known.datasetUrl;
    var sourcesHref = "/sources" + (known ? "#" + known.key : "");
    return {
      key: known ? known.key : "",
      credit: credit,
      parts: parts,
      sourcesHref: sourcesHref,
      datasetHref: datasetHref,
      note: known && known.note ? known.note : "",
      cardNote: !!(known && known.cardNote)
    };
  }

  function htmlForParts(parts) {
    return parts.map(function (part) {
      if (!part.href) return escapeHtml(part.text);
      var attrs = part.external ? ' target="_blank" rel="noopener noreferrer"' : "";
      return '<a href="' + escapeHtml(part.href) + '"' + attrs + ">" + escapeHtml(part.text) + "</a>";
    }).join("");
  }

  function cardCreditHtml(idea) {
    var view = creditView(idea);
    if (!view) return "";
    var html = '<p class="source-credit">' + htmlForParts(view.parts);
    if (view.datasetHref) {
      html += ' <a class="source-dataset" href="' + escapeHtml(view.datasetHref) + '" target="_blank" rel="noopener noreferrer">Dataset page</a>';
    }
    html += ' <a class="source-credit-sources" href="' + escapeHtml(view.sourcesHref) + '">Sources</a>';
    html += "</p>";
    if (view.cardNote && view.note) {
      html += '<p class="source-credit-note">' + escapeHtml(view.note) + "</p>";
    }
    return html;
  }

  function paragraph(text) {
    return "<p>" + htmlForParts(linkParts(text, "")) + "</p>";
  }

  function paragraphPhrases(text, phrases) {
    var pieces = linkPhrases(text, phrases);
    var html = pieces.map(function (part) {
      if (part.href) return htmlForParts([part]);
      return htmlForParts(linkParts(part.text, ""));
    }).join("");
    return "<p>" + html + "</p>";
  }

  function paragraphBoldLead(text, lead, phrases) {
    var source = String(text || "");
    var label = String(lead || "");
    if (!label || source.indexOf(label) !== 0) return paragraphPhrases(source, phrases);
    var rest = paragraphPhrases(source.slice(label.length), phrases);
    var inner = rest.slice(3, rest.length - 4);
    return "<p><strong>" + escapeHtml(label) + "</strong>" + inner + "</p>";
  }

  function creditList(items) {
    var html = "<ul>";
    items.forEach(function (item) {
      var parts = (item.phrases && item.phrases.length && !item.linkItem)
        ? linkPhrases(item.credit, item.phrases)
        : linkParts(item.credit, "");
      html += '<li id="' + escapeHtml(item.key) + '">' + htmlForParts(parts) + "</li>";
    });
    html += "</ul>";
    return html;
  }

  function groupList(group) {
    var seen = Object.create(null);
    var html = "<ul>";
    ENTRIES.forEach(function (item) {
      if (item.group !== group || seen[item.credit]) return;
      seen[item.credit] = true;
      html += '<li id="' + escapeHtml(item.key) + '">' + htmlForParts(linkParts(item.credit, "")) + "</li>";
    });
    html += "</ul>";
    return html;
  }

  // Sources page only. These lines are not source keys and do not change
  // card credits. The parenthetical domain is the link text; hrefs are the
  // final https homepage after redirects.
  var EVENT_INFO_LINES = [
    { line: "Event info from Brigham City Public Library (library.bcutah.gov). See the library's page for details.", domain: "library.bcutah.gov", href: "https://library.bcutah.gov/" },
    { line: "Event info from Utah Humanities (utahhumanities.org).", domain: "utahhumanities.org", href: "https://utahhumanities.org/" },
    { line: "Event info from Spanish Fork Public Library (spanishfork.libcal.com).", domain: "spanishfork.libcal.com", href: "https://spanishfork.libcal.com/" },
    { line: "Event info from Lehi City Library (lehicity.libcal.com).", domain: "lehicity.libcal.com", href: "https://lehicity.libcal.com/" },
    { line: "Event info from the Gallivan Center (thegallivancenter.com).", domain: "thegallivancenter.com", href: "https://thegallivancenter.com/" },
    { line: "Event info from Utah Film Center (utahfilmcenter.org).", domain: "utahfilmcenter.org", href: "https://utahfilmcenter.org/" },
    { line: "Event info from Peery's Egyptian Theater (ogdenpet.com).", domain: "ogdenpet.com", href: "https://ogdenpet.com/" },
    { line: "Event info from Brigham City Museum of Art & History (museum.bcutah.gov).", domain: "museum.bcutah.gov", href: "https://museum.bcutah.gov/" },
    { line: "Event info from Stokes Nature Center (logannature.org).", domain: "logannature.org", href: "https://logannature.org/" },
    { line: "Event info from Bear River Heritage Area (bearriverheritage.com).", domain: "bearriverheritage.com", href: "https://bearriverheritage.com/" },
    { line: "Event info from Ogden Shakespeare Festival (ogdenshakesfest.org).", domain: "ogdenshakesfest.org", href: "https://ogdenshakesfest.org/" },
    { line: "Event info from Springville Museum of Art (smofa.org).", domain: "smofa.org", href: "https://www.smofa.org/" },
    { line: "Event info from CacheCalendar (cachecalendar.com).", domain: "cachecalendar.com", href: "https://cachecalendar.com/" },
    { line: "Event info from Visit Cedar City · Brian Head (visitcedarcity.com).", domain: "visitcedarcity.com", href: "https://visitcedarcity.com/" },
    { line: "Event info from Town of Springdale (springdale.utah.gov).", domain: "springdale.utah.gov", href: "https://www.springdale.utah.gov/" },
    { line: "Event info from South Valley Chamber (southvalleychamber.com).", domain: "southvalleychamber.com", href: "https://www.southvalleychamber.com/" },
    { line: "Event info from Historic Park City Alliance (historicparkcityutah.com).", domain: "historicparkcityutah.com", href: "https://historicparkcityutah.com/" },
    { line: "Event info from The State Room Presents (thestateroompresents.com).", domain: "thestateroompresents.com", href: "https://thestateroompresents.com/" },
    { line: "Event info from Egyptian Theatre (parkcityshows.com).", domain: "parkcityshows.com", href: "https://parkcityshows.com/" },
    { line: "Event info from South Salt Lake City (sslc.gov).", domain: "sslc.gov", href: "https://sslc.gov/" },
    { line: "Event info from Hyrum City (hyrumcity.gov).", domain: "hyrumcity.gov", href: "https://www.hyrumcity.gov/" },
    { line: "Event info from Kayenta Center for the Arts (kayentaarts.org).", domain: "kayentaarts.org", href: "https://kayentaarts.org/" },
    { line: "Event info from North Salt Lake City (nslcity.org).", domain: "nslcity.org", href: "https://nslcity.org/" },
    { line: "Event info from Syracuse City Recreation (syracuserecreation.com).", domain: "syracuserecreation.com", href: "https://syracuserecreation.com/" },
    { line: "Event info from South Jordan City (sjc.utah.gov).", domain: "sjc.utah.gov", href: "https://sjc.utah.gov/" },
    { line: "Event info from Park City Museum (parkcityhistory.org).", domain: "parkcityhistory.org", href: "https://parkcityhistory.org/" },
    { line: "Event info from Clearfield City (clearfield.city).", domain: "clearfield.city", href: "https://clearfield.city/" },
    { line: "Event info from Ballet West (balletwest.org).", domain: "balletwest.org", href: "https://www.balletwest.org/" },
    { line: "Event info from Draper Historic Theatre (draperhistorictheatre.org).", domain: "draperhistorictheatre.org", href: "https://www.draperhistorictheatre.org/" },
    { line: "Event info from Wasatch Mountain Institute (wasatchmountaininstitute.org).", domain: "wasatchmountaininstitute.org", href: "https://www.wasatchmountaininstitute.org/" },
    { line: "Event info from Midway City (midwaycityut.gov).", domain: "midwaycityut.gov", href: "https://www.midwaycityut.gov/" },
    { line: "Event info from Salt Lake Acting Company (saltlakeactingcompany.org).", domain: "saltlakeactingcompany.org", href: "https://saltlakeactingcompany.org/" },
    { line: "Event info from Plan-B Theatre (planbtheatre.org).", domain: "planbtheatre.org", href: "https://planbtheatre.org/" },
    { line: "Event info from Greater Zion (events.greaterzion.com).", domain: "events.greaterzion.com", href: "https://events.greaterzion.com/" },
    { line: "Event info from Sundance Mountain Resort (sundanceresort.com).", domain: "sundanceresort.com", href: "https://www.sundanceresort.com/" },
    { line: "Event info from Off Broadway Theatre (theobt.org).", domain: "theobt.org", href: "https://www.theobt.org/" },
    { line: "Event info from Utah Festival Opera & Musical Theatre (utahfestival.org).", domain: "utahfestival.org", href: "https://utahfestival.org/" },
    { line: "Event info from Kilby Court (kilbycourt.com).", domain: "kilbycourt.com", href: "https://www.kilbycourt.com/" },
    { line: "Event info from Red Butte Garden (redbuttegarden.org).", domain: "redbuttegarden.org", href: "https://redbuttegarden.org/" },
    { line: "Event info from Utah Shakespeare Festival (bard.org).", domain: "bard.org", href: "https://www.bard.org/" },
    { line: "Event info from Utah Olympic Legacy Foundation (utaholympiclegacy.org).", domain: "utaholympiclegacy.org", href: "https://utaholympiclegacy.org/" },
    { line: "Event info from Ogden Nature Center (ogdennaturecenter.org).", domain: "ogdennaturecenter.org", href: "https://ogdennaturecenter.org/" },
    { line: "Event info from Gardner Village (gardnervillage.com).", domain: "gardnervillage.com", href: "https://gardnervillage.com/" },
    { line: "Event info from Davis Arts Council (davisarts.org).", domain: "davisarts.org", href: "https://davisarts.org/" },
    { line: "Event info from Repertory Dance Theatre (rdtutah.org).", domain: "rdtutah.org", href: "https://rdtutah.org/" },
    { line: "Event info from Utah's Hogle Zoo (hoglezoo.org).", domain: "hoglezoo.org", href: "https://www.hoglezoo.org/" },
    { line: "Event info from Sugar Space (sugarspace.org).", domain: "sugarspace.org", href: "https://sugarspace.org/" },
    { line: "Event info from Sugar House Chamber (sugarhousechamber.org).", domain: "sugarhousechamber.org", href: "https://sugarhousechamber.org/" },
    { line: "Event info from Moab Music Festival (moabmusicfest.org).", domain: "moabmusicfest.org", href: "https://moabmusicfest.org/" },
    { line: "Event info from Park Silly Sunday Market (parksillysundaymarket.com).", domain: "parksillysundaymarket.com", href: "https://parksillysundaymarket.com/" },
    { line: "Event info from Ogden Twilight (ogdentwilight.com).", domain: "ogdentwilight.com", href: "https://www.ogdentwilight.com/" },
    { line: "Event info from Loveland Living Planet Aquarium (livingplanetaquarium.org).", domain: "livingplanetaquarium.org", href: "https://livingplanetaquarium.org/" },
    { line: "Event info from Roosevelt City (rooseveltcity.gov).", domain: "rooseveltcity.gov", href: "https://rooseveltcity.gov/" },
    { line: "Event info from Utah Division of Outdoor Recreation (recreation.utah.gov).", domain: "recreation.utah.gov", href: "https://recreation.utah.gov/" },
    { line: "Event info from Clinton City (clinton.utah.gov).", domain: "clinton.utah.gov", href: "https://clinton.utah.gov/" },
    { line: "Event info from HawkWatch International (hawkwatch.org).", domain: "hawkwatch.org", href: "https://hawkwatch.org/" },
    { line: "Event info from Alpine City (alpineut.gov).", domain: "alpineut.gov", href: "https://alpineut.gov/" },
    { line: "Event info from Desert Star Playhouse (desertstarplayhouse.com).", domain: "desertstarplayhouse.com", href: "https://desertstarplayhouse.com/" },
    { line: "Event info from The Cabaret at Wiseguys SLC (thecabaret-atwiseguysslc.seatengine-sites.com).", domain: "thecabaret-atwiseguysslc.seatengine-sites.com", href: "https://thecabaret-atwiseguysslc.seatengine-sites.com/" },
    { line: "Event info from The Painted Peacock (thepaintedpeacock.art).", domain: "thepaintedpeacock.art", href: "https://thepaintedpeacock.art/" },
    { line: "Event info from Sip and Vibe SLC (sipandvibeslc.com).", domain: "sipandvibeslc.com", href: "https://sipandvibeslc.com/" },
    { line: "Event info from ComedyBox Utah (comedyboxutah.com).", domain: "comedyboxutah.com", href: "https://comedyboxutah.com/" },
    { line: "Event info from Home Range Brewing (homerangebeer.com).", domain: "homerangebeer.com", href: "https://homerangebeer.com/" },
    { line: "Event info from Moab Arts (moabarts.org).", domain: "moabarts.org", href: "https://moabarts.org/" },
    { line: "Event info from Visit Beaver County (visitbeavercountyut.com).", domain: "visitbeavercountyut.com", href: "https://visitbeavercountyut.com/" },
    { line: "Event info from Milford City (www.milfordcityutah.com).", domain: "www.milfordcityutah.com", href: "https://www.milfordcityutah.com/" },
    { line: "Event info from Minersville Town (minersvilleut.gov).", domain: "minersvilleut.gov", href: "https://minersvilleut.gov/" },
    { line: "Event info from Tremonton City (tremontoncity.lib.utah.gov).", domain: "tremontoncity.lib.utah.gov", href: "https://tremontoncity.lib.utah.gov/" },
    { line: "Event info from Heritage Theatre Utah (www.heritagetheatreutah.com).", domain: "www.heritagetheatreutah.com", href: "https://www.heritagetheatreutah.com/" },
    { line: "Event info from Utah State Parks (stateparks.utah.gov).", domain: "stateparks.utah.gov", href: "https://stateparks.utah.gov/" },
    { line: "Event info from Panguitch City (panguitchutah.gov).", domain: "panguitchutah.gov", href: "https://panguitchutah.gov/" },
    { line: "Event info from Cedar Valley Community Theatre (www.cvct.online).", domain: "www.cvct.online", href: "https://www.cvct.online/" },
    { line: "Event info from Tooele Valley Theatre (www.tooelevalleytheatre.org).", domain: "www.tooelevalleytheatre.org", href: "https://www.tooelevalleytheatre.org/" },
    { line: "Event info from Timpanogos Valley Theatre (timpvalleytheatre.com).", domain: "timpvalleytheatre.com", href: "https://timpvalleytheatre.com/" },
    { line: "Event info from Once Upon a Time in America Museum (www.onceuponatimeinamericamuseum.com).", domain: "www.onceuponatimeinamericamuseum.com", href: "https://www.onceuponatimeinamericamuseum.com/" },
    { line: "Event info from Bountiful Main Street (bountifulmainstreet.com).", domain: "bountifulmainstreet.com", href: "https://bountifulmainstreet.com/" },
    { line: "Event info from Sevier Valley Center (richfield.snow.edu).", domain: "richfield.snow.edu", href: "https://richfield.snow.edu/" },
    { line: "Event info from Richfield Area Chamber (richfieldareachamber.com).", domain: "richfieldareachamber.com", href: "https://richfieldareachamber.com/" },
    { line: "Event info from Wild Peak Events (www.wildpeakevents.com).", domain: "www.wildpeakevents.com", href: "https://www.wildpeakevents.com/" },
    { line: "Event info from Visit Emery County (visitemerycounty.com).", domain: "visitemerycounty.com", href: "https://visitemerycounty.com/" },
    { line: "Event info from Emery County (emery.utah.gov).", domain: "emery.utah.gov", href: "https://emery.utah.gov/" },
    { line: "Event info from Helper City (www.helpercity.gov).", domain: "www.helpercity.gov", href: "https://www.helpercity.gov/" },
    { line: "Event info from Castle Dale City (www.visitcastledale.com).", domain: "www.visitcastledale.com", href: "https://www.visitcastledale.com/" },
    { line: "Event info from Emery County Library System (lib.emerycounty.com).", domain: "lib.emerycounty.com", href: "https://lib.emerycounty.com/" },
    { line: "Event info from Fairview Museum (www.fairviewmuseum.org).", domain: "www.fairviewmuseum.org", href: "https://www.fairviewmuseum.org/" },
    { line: "Event info from Vernal Theatre (vernaltheatre.com).", domain: "vernaltheatre.com", href: "https://vernaltheatre.com/" },
    { line: "Event info from Loa Town (loautah.gov).", domain: "loautah.gov", href: "https://loautah.gov/" },
    { line: "Event info from Wayne County Fair (waynecountyutahfair.com).", domain: "waynecountyutahfair.com", href: "https://waynecountyutahfair.com/" },
    { line: "Event info from Casino Star Theatre (www.casinostartheatre.com).", domain: "www.casinostartheatre.com", href: "https://www.casinostartheatre.com/" },
    { line: "Event info from Juab County Fair (juabcountyfair.com).", domain: "juabcountyfair.com", href: "https://juabcountyfair.com/" },
    { line: "Event info from Vernal Community Events (thisisvernal.trumba.com).", domain: "thisisvernal.trumba.com", href: "https://thisisvernal.trumba.com/" },
    { line: "Event info from Museum of Uintah County (themuc.org).", domain: "themuc.org", href: "https://themuc.org/" },
    { line: "Event info from Vernal Holly Days (www.communityhollydays.com).", domain: "www.communityhollydays.com", href: "https://www.communityhollydays.com/" },
    { line: "Event info from Duchesne County Library (duchesnecounty.librarycalendar.com).", domain: "duchesnecounty.librarycalendar.com", href: "https://duchesnecounty.librarycalendar.com/" },
    { line: "Event info from Daggett County (www.daggettcounty.gov).", domain: "www.daggettcounty.gov", href: "https://www.daggettcounty.gov/" },
    { line: "Event info from Flaming Gorge Chamber (www.flaminggorge.com).", domain: "www.flaminggorge.com", href: "https://www.flaminggorge.com/" },
    { line: "Event info from Morgan County Library (morgancounty.lib.utah.gov).", domain: "morgancounty.lib.utah.gov", href: "https://morgancounty.lib.utah.gov/" },
    { line: "Event info from Bear Lake Valley CVB (bearlake.org).", domain: "bearlake.org", href: "https://bearlake.org/" },
    { line: "Event info from Rich County (www.richcounty.gov).", domain: "www.richcounty.gov", href: "https://www.richcounty.gov/" },
    { line: "Event info from Torrey Town (www.torreyutah.gov).", domain: "www.torreyutah.gov", href: "https://www.torreyutah.gov/" },
    { line: "Event info from Marysvale Chamber (www.marysvaleutah.org).", domain: "www.marysvaleutah.org", href: "https://www.marysvaleutah.org/" },
    { line: "Event info from Paiute ATV Jamboree (www.paiute-jam.com).", domain: "www.paiute-jam.com", href: "https://www.paiute-jam.com/" },
    { line: "Event info from Uintah County Western Park (www.westernpark.org).", domain: "www.westernpark.org", href: "https://www.westernpark.org/" },
    { line: "Event info from Escalante City (escalanteutah.gov).", domain: "escalanteutah.gov", href: "https://escalanteutah.gov/" },
    { line: "Event info from Morgan County Fair (www.morgancountyfair.org).", domain: "www.morgancountyfair.org", href: "https://www.morgancountyfair.org/" },
    { line: "Event info from Stellar Vista Observatory (stellarvistaobservatory.org).", domain: "stellarvistaobservatory.org", href: "https://stellarvistaobservatory.org/public-star-parties/" },
    { line: "Event info from Cache Valley Astronomical Society (cvas-utahskies.org).", domain: "cvas-utahskies.org", href: "https://cvas-utahskies.org/events/" },
    { line: "Event info from Arcade Galactic (arcadegalactic.com).", domain: "arcadegalactic.com", href: "https://arcadegalactic.com/" },
    { line: "Event info from Artes de Mexico en Utah (www.artesmexut.org).", domain: "www.artesmexut.org", href: "https://www.artesmexut.org/" },
    { line: "Event info from Aspen Chorale (aspenchorale.com).", domain: "aspenchorale.com", href: "https://aspenchorale.com/" },
    { line: "Event info from Bountiful Davis Art Center (www.bdac.org).", domain: "www.bdac.org", href: "https://www.bdac.org/" },
    { line: "Event info from Brian Head Town (brianheadtown.utah.gov).", domain: "brianheadtown.utah.gov", href: "https://brianheadtown.utah.gov/" },
    { line: "Event info from Comfy Cozy Games (comfycozygames.com).", domain: "comfycozygames.com", href: "https://comfycozygames.com/" },
    { line: "Event info from Cultural Arts Society of West Jordan (www.wjarts.org).", domain: "www.wjarts.org", href: "https://www.wjarts.org/" },
    { line: "Event info from Downtown SLC Farmers Market (www.slcfarmersmarket.org).", domain: "www.slcfarmersmarket.org", href: "https://www.slcfarmersmarket.org/" },
    { line: "Event info from Draper Philharmonic (www.draperphilharmonic.org).", domain: "www.draperphilharmonic.org", href: "https://www.draperphilharmonic.org/" },
    { line: "Event info from Excellence in the Community concerts (excellenceconcerts.org).", domain: "excellenceconcerts.org", href: "https://excellenceconcerts.org/" },
    { line: "Event info from Funk N Dive Bar live music (www.funkanddive.com).", domain: "www.funkanddive.com", href: "https://www.funkanddive.com/" },
    { line: "Event info from Game Night Games (www.gamenightgames.com).", domain: "www.gamenightgames.com", href: "https://www.gamenightgames.com/" },
    { line: "Event info from Golden Braid Books (www.goldenbraidslc.com).", domain: "www.goldenbraidslc.com", href: "https://www.goldenbraidslc.com/" },
    { line: "Event info from Harp and Hound (harphound.com).", domain: "harphound.com", href: "https://harphound.com/" },
    { line: "Event info from Kensington Theatre (kensingtontheatre.org).", domain: "kensingtontheatre.org", href: "https://kensingtontheatre.org/" },
    { line: "Event info from Lila Studio (www.lilastudio.com).", domain: "www.lilastudio.com", href: "https://www.lilastudio.com/" },
    { line: "Event info from Loki Coffee (www.lokicoffeeco.com).", domain: "www.lokicoffeeco.com", href: "https://www.lokicoffeeco.com/" },
    { line: "Event info from Magna (magna.utah.gov).", domain: "magna.utah.gov", href: "https://magna.utah.gov/" },
    { line: "Event info from Melancholy (www.melancholyslc.com).", domain: "www.melancholyslc.com", href: "https://www.melancholyslc.com/" },
    { line: "Event info from Millcreek Common (millcreekcommon.org).", domain: "millcreekcommon.org", href: "https://millcreekcommon.org/" },
    { line: "Event info from Millennial Choirs & Orchestras (www.millennial.org).", domain: "www.millennial.org", href: "https://www.millennial.org/" },
    { line: "Event info from Mountain West Cider (www.mountainwestcider.com).", domain: "www.mountainwestcider.com", href: "https://www.mountainwestcider.com/" },
    { line: "Event info from Mountaintop Music Institute (www.mountaintopmusicinstitute.com).", domain: "www.mountaintopmusicinstitute.com", href: "https://www.mountaintopmusicinstitute.com/" },
    { line: "Event info from Offset Bier (offsetbier.com).", domain: "offsetbier.com", href: "https://offsetbier.com/" },
    { line: "Event info from Oratorio Society of Utah (oratoriosocietyofutah.godaddysites.com).", domain: "oratoriosocietyofutah.godaddysites.com", href: "https://oratoriosocietyofutah.godaddysites.com/" },
    { line: "Event info from Parker Theatre (www.parkertheatre.org).", domain: "www.parkertheatre.org", href: "https://www.parkertheatre.org/" },
    { line: "Event info from Poppy Book & Gifts (www.poppybookssf.com).", domain: "www.poppybookssf.com", href: "https://www.poppybookssf.com/" },
    { line: "Event info from Regency Christmas Market at Provo Towne Centre (www.provotownecentre.com).", domain: "www.provotownecentre.com", href: "https://www.provotownecentre.com/" },
    { line: "Event info from SALT Contemporary Dance (saltdance.com).", domain: "saltdance.com", href: "https://saltdance.com/" },
    { line: "Event info from Salt City Slam (www.saltcityslam.com).", domain: "www.saltcityslam.com", href: "https://www.saltcityslam.com/" },
    { line: "Event info from Salt Lake Art Museum (saltlakeartmuseum.org).", domain: "saltlakeartmuseum.org", href: "https://saltlakeartmuseum.org/" },
    { line: "Event info from Sandbox Theatre Company (www.sandboxtheatrecompany.org).", domain: "www.sandboxtheatrecompany.org", href: "https://www.sandboxtheatrecompany.org/" },
    { line: "Event info from Scaffold Theatre (www.scaffoldtheatre.org).", domain: "www.scaffoldtheatre.org", href: "https://www.scaffoldtheatre.org/" },
    { line: "Event info from Scion Cider Bar (www.scionciderbar.com).", domain: "www.scionciderbar.com", href: "https://www.scionciderbar.com/" },
    { line: "Event info from Second Summit Cider (secondsummitcider.com).", domain: "secondsummitcider.com", href: "https://secondsummitcider.com/" },
    { line: "Event info from Soundwell (soundwellslc.com).", domain: "soundwellslc.com", href: "https://soundwellslc.com/" },
    { line: "Event info from TF Brewing (tfbrewing.com).", domain: "tfbrewing.com", href: "https://tfbrewing.com/" },
    { line: "Event info from Talisman Brewing (talismanbrewingco.com).", domain: "talismanbrewingco.com", href: "https://talismanbrewingco.com/" },
    { line: "Event info from Terrace Plaza Playhouse (www.terraceplazaplayhouse.com).", domain: "www.terraceplazaplayhouse.com", href: "https://www.terraceplazaplayhouse.com/" },
    { line: "Event info from The Tasting Room SLC (www.tastingroomslc.com).", domain: "www.tastingroomslc.com", href: "https://www.tastingroomslc.com/" },
    { line: "Event info from The Westerner Club (westernerclub.com).", domain: "westernerclub.com", href: "https://westernerclub.com/" },
    { line: "Event info from Three Penny Theatre Company (www.threepennytheatre.com).", domain: "www.threepennytheatre.com", href: "https://www.threepennytheatre.com/" },
    { line: "Event info from University Place Orem holiday (www.universityplaceorem.com).", domain: "www.universityplaceorem.com", href: "https://www.universityplaceorem.com/" },
    { line: "Event info from Utah National Guard (guard.utah.gov).", domain: "guard.utah.gov", href: "https://guard.utah.gov/" },
    { line: "Event info from Utah Valley Christkindlmarkt (www.uvchristkindlmarkt.com).", domain: "www.uvchristkindlmarkt.com", href: "https://www.uvchristkindlmarkt.com/" },
    { line: "Event info from Utah Valley Symphony (www.utahvalleysymphony.org).", domain: "www.utahvalleysymphony.org", href: "https://www.utahvalleysymphony.org/" },
    { line: "Event info from Wasatch Community Gardens Love Local Winter Market (wasatchgardens.org).", domain: "wasatchgardens.org", href: "https://wasatchgardens.org/" },
    { line: "Event info from Wasatch Contemporary Dance Company (wasatchcontemporary.com).", domain: "wasatchcontemporary.com", href: "https://wasatchcontemporary.com/" },
    { line: "Event info from Wasatch Theatre Company (wasatchtheatre.org).", domain: "wasatchtheatre.org", href: "https://wasatchtheatre.org/" },
    { line: "Event info from West Valley Arts (wvcarts.org).", domain: "wvcarts.org", href: "https://wvcarts.org/" },
    { line: "Event info from Alma Gallery upcoming (www.almaprovo.com).", domain: "www.almaprovo.com", href: "https://www.almaprovo.com/" },
    { line: "Event info from Cache Valley Symphonic Society concerts (www.cachevalleysymphonicsociety.org).", domain: "www.cachevalleysymphonicsociety.org", href: "https://www.cachevalleysymphonicsociety.org/" },
    { line: "Event info from David Ericson Fine Art current exhibition (www.davidericson-fineart.com).", domain: "www.davidericson-fineart.com", href: "https://www.davidericson-fineart.com/" },
    { line: "Event info from Empress Theatre (www.empresstheatre.com).", domain: "www.empresstheatre.com", href: "https://www.empresstheatre.com/" },
    { line: "Event info from Gallery MAR exhibition schedule (www.gallerymar.com).", domain: "www.gallerymar.com", href: "https://www.gallerymar.com/" },
    { line: "Event info from Heber Valley Entertainment concerts (www.hebervalleyentertainment.com).", domain: "www.hebervalleyentertainment.com", href: "https://www.hebervalleyentertainment.com/" },
    { line: "Event info from Hopebox Theatre (www.hopeboxtheatre.com).", domain: "www.hopeboxtheatre.com", href: "https://www.hopeboxtheatre.com/" },
    { line: "Event info from Keys on Main (www.keysonmain.com).", domain: "www.keysonmain.com", href: "https://www.keysonmain.com/" },
    { line: "Event info from Legacy Park (thelegacypark.com).", domain: "thelegacypark.com", href: "https://thelegacypark.com/" },
    { line: "Event info from Lehi Silver Band concerts (www.lehiareamusic.org).", domain: "www.lehiareamusic.org", href: "https://www.lehiareamusic.org/" },
    { line: "Event info from Masterpiece Live at The Hive (www.masterpiecelive.com).", domain: "www.masterpiecelive.com", href: "https://www.masterpiecelive.com/" },
    { line: "Event info from Ogden Red Sled (ogdenptc.org).", domain: "ogdenptc.org", href: "https://ogdenptc.org/" },
    { line: "Event info from Park City Institute (parkcitypa.org).", domain: "parkcitypa.org", href: "https://parkcitypa.org/" },
    { line: "Event info from Payson Community Theatre (www.paysoncommunitytheatre.com).", domain: "www.paysoncommunitytheatre.com", href: "https://www.paysoncommunitytheatre.com/" },
    { line: "Event info from Provo (provo.com).", domain: "provo.com", href: "https://provo.com/" },
    { line: "Event info from Roam Wild Market Food Fest (roamwildmarket.com).", domain: "roamwildmarket.com", href: "https://roamwildmarket.com/" },
    { line: "Event info from The Compass Gallery events (www.thecompassgallery.com).", domain: "www.thecompassgallery.com", href: "https://www.thecompassgallery.com/" },
    { line: "Event info from The Gateway calendars (atthegateway.com).", domain: "atthegateway.com", href: "https://atthegateway.com/" },
    { line: "Event info from Trash Moon Collective events (www.trashmooncollective.org).", domain: "www.trashmooncollective.org", href: "https://www.trashmooncollective.org/" },
    { line: "Event info from Utah City events (utahcity.com).", domain: "utahcity.com", href: "https://utahcity.com/" },
    { line: "Event info from 2 Row Brewing (www.2rowbrewing.com).", domain: "www.2rowbrewing.com", href: "https://www.2rowbrewing.com/" },
    { line: "Event info from Dixie Convention Center (dixiecenter.com).", domain: "dixiecenter.com", href: "https://dixiecenter.com/" },
    { line: "Event info from Downtown Farmers Market St. George (downtownfarmerstg.com).", domain: "downtownfarmerstg.com", href: "https://downtownfarmerstg.com/" },
    { line: "Event info from Ephraim Library (ephraim.lib.utah.gov).", domain: "ephraim.lib.utah.gov", href: "https://ephraim.lib.utah.gov/" },
    { line: "Event info from Fairview City Library (fairviewcity.lib.utah.gov).", domain: "fairviewcity.lib.utah.gov", href: "https://fairviewcity.lib.utah.gov/" },
    { line: "Event info from Four Seasons Theatre Company (fourseasonstheatre.org).", domain: "fourseasonstheatre.org", href: "https://fourseasonstheatre.org/" },
    { line: "Event info from Fruit Heights City (www.fruitheights.gov).", domain: "www.fruitheights.gov", href: "https://www.fruitheights.gov/" },
    { line: "Event info from Harrisville City (harrisvillecity.gov).", domain: "harrisvillecity.gov", href: "https://harrisvillecity.gov/" },
    { line: "Event info from Hooper City (www.hoopercity.gov).", domain: "www.hoopercity.gov", href: "https://www.hoopercity.gov/" },
    { line: "Event info from Hurricane Recreation (www.hurricanerecreation.com).", domain: "www.hurricanerecreation.com", href: "https://www.hurricanerecreation.com/" },
    { line: "Event info from Ivins Arts Commission (www.ivinsartscommission.com).", domain: "www.ivinsartscommission.com", href: "https://www.ivinsartscommission.com/" },
    { line: "Event info from Lake Point (lakepoint.gov).", domain: "lakepoint.gov", href: "https://lakepoint.gov/" },
    { line: "Event info from Leeds Town (leeds.utah.gov).", domain: "leeds.utah.gov", href: "https://leeds.utah.gov/" },
    { line: "Event info from Lewiston City (lewistonutah.gov).", domain: "lewistonutah.gov", href: "https://lewistonutah.gov/" },
    { line: "Event info from Mendon Library (mendoncity.lib.utah.gov).", domain: "mendoncity.lib.utah.gov", href: "https://mendoncity.lib.utah.gov/" },
    { line: "Event info from Millville City (millvilleut.gov).", domain: "millvilleut.gov", href: "https://millvilleut.gov/" },
    { line: "Event info from Music Theatre West (www.musictheatrewest.org).", domain: "www.musictheatrewest.org", href: "https://www.musictheatrewest.org/" },
    { line: "Event info from New Harmony Fire Association (newharmonyfire.org).", domain: "newharmonyfire.org", href: "https://newharmonyfire.org/" },
    { line: "Event info from Nibley City (nibleycity.gov).", domain: "nibleycity.gov", href: "https://nibleycity.gov/" },
    { line: "Event info from Ogden Musical Theatre (ogdenmusicaltheatre.org).", domain: "ogdenmusicaltheatre.org", href: "https://ogdenmusicaltheatre.org/" },
    { line: "Event info from Old Barn Community Theatre (www.oldbarn.org).", domain: "www.oldbarn.org", href: "https://www.oldbarn.org/" },
    { line: "Event info from On Pitch Performing Arts (onpitchperformingarts.com).", domain: "onpitchperformingarts.com", href: "https://onpitchperformingarts.com/" },
    { line: "Event info from Smithfield Recreation (smithfieldrecreation.com).", domain: "smithfieldrecreation.com", href: "https://smithfieldrecreation.com/" },
    { line: "Event info from South Weber City (southwebercity.gov).", domain: "southwebercity.gov", href: "https://southwebercity.gov/" },
    { line: "Event info from Southern Utah Dickens Christmas Festival (www.dickenschristmasfestival.com).", domain: "www.dickenschristmasfestival.com", href: "https://www.dickenschristmasfestival.com/" },
    { line: "Event info from Southwest Symphony (swsutah.org).", domain: "swsutah.org", href: "https://swsutah.org/" },
    { line: "Event info from Stansbury Park (stansburypark.gov).", domain: "stansburypark.gov", href: "https://stansburypark.gov/" },
    { line: "Event info from Stansbury Park Library (stansburypark.lib.utah.gov).", domain: "stansburypark.lib.utah.gov", href: "https://stansburypark.lib.utah.gov/" },
    { line: "Event info from Sunset City (sunsetut.gov).", domain: "sunsetut.gov", href: "https://sunsetut.gov/" },
    { line: "Event info from Tooele Downtown Alliance (www.downtowntooele.com).", domain: "www.downtowntooele.com", href: "https://www.downtowntooele.com/" },
    { line: "Event info from Unicorn Theatre (www.unicorntheatre.net).", domain: "www.unicorntheatre.net", href: "https://www.unicorntheatre.net/" },
    { line: "Event info from Utah Car Culture (utahcarculture.org).", domain: "utahcarculture.org", href: "https://utahcarculture.org/" },
    { line: "Event info from Virgin Town (www.virgin.utah.gov).", domain: "www.virgin.utah.gov", href: "https://www.virgin.utah.gov/" },
    { line: "Event info from Washington City (washingtonutah.gov).", domain: "washingtonutah.gov", href: "https://washingtonutah.gov/" },
    { line: "Event info from Wellsville City (www.wellsvillecity.com).", domain: "www.wellsvillecity.com", href: "https://www.wellsvillecity.com/" },
    { line: "Event info from West Bountiful City (wbcityut.gov).", domain: "wbcityut.gov", href: "https://wbcityut.gov/" },
    { line: "Event info from Wolfdog Brewing (www.wolfdogbrewing.com).", domain: "www.wolfdogbrewing.com", href: "https://www.wolfdogbrewing.com/" },
    { line: "Event info from American West Symphony & Chorus (www.americanwestsymphony.com).", domain: "www.americanwestsymphony.com", href: "https://www.americanwestsymphony.com/" },
    { line: "Event info from Bout Time Pub & Grub Lehi (www.bouttimepub.com).", domain: "www.bouttimepub.com", href: "https://www.bouttimepub.com/" },
    { line: "Event info from JG Art Gallery exhibitions (jgartgallery.com).", domain: "jgartgallery.com", href: "https://jgartgallery.com/" },
    { line: "Event info from Logan Tabernacle (logantabernacle.com).", domain: "logantabernacle.com", href: "https://logantabernacle.com/" },
    { line: "Event info from Lyceum Philharmonic Christmas (lyceumphilharmonic.com).", domain: "lyceumphilharmonic.com", href: "https://lyceumphilharmonic.com/" },
    { line: "Event info from Saratoga Arts (saratoga-arts.org).", domain: "saratoga-arts.org", href: "https://saratoga-arts.org/" },
    { line: "Event info from Sears Art Museum schedule (www.searsart.com).", domain: "www.searsart.com", href: "https://www.searsart.com/" },
    { line: "Event info from Skyridge Theatre (skyridgetheatre.com).", domain: "skyridgetheatre.com", href: "https://skyridgetheatre.com/" },
    { line: "Event info from SoJo Choral Arts / Seasons Chorale (www.sojochoralarts.org).", domain: "www.sojochoralarts.org", href: "https://www.sojochoralarts.org/" },
    { line: "Event info from Wasatch Chorale performances (www.wasatchchorale.org).", domain: "www.wasatchchorale.org", href: "https://www.wasatchchorale.org/" },
    { line: "Event info from West Jordan Symphony (www.westjordansymphony.org).", domain: "www.westjordansymphony.org", href: "https://www.westjordansymphony.org/" },
  ];

  function eventInfoList(lines) {
    var html = "<ul>";
    lines.forEach(function (item) {
      var mark = "(" + item.domain + ")";
      var at = item.line.indexOf(mark);
      var before = item.line.slice(0, at + 1);
      var after = item.line.slice(at + 1 + item.domain.length);
      html += "<li>" + htmlForParts([
        { text: before },
        { text: item.domain, href: item.href, external: true },
        { text: after }
      ]) + "</li>";
    });
    html += "</ul>";
    return html;
  }

  var OSM_LOCATIONS_LINE = "Some locations © OpenStreetMap contributors, available under the Open Database License (ODbL)";
  var OSM_COPYRIGHT_HREF = "https://www.openstreetmap.org/copyright";

  function renderPage() {
    var html = [];
    html.push("<!DOCTYPE html>");
    html.push('<html lang="en"><head><meta charset="UTF-8">');
    html.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
    html.push("<title>Sources · Jaderoo</title>");
    html.push("<style>");
    html.push(":root{color-scheme:light dark;--bg:#FFFBF2;--text:#0F4D3A;--muted:#4A6358;--link:#0B6E4F;--card:#F4FBF7;}");
    html.push("@media (prefers-color-scheme:dark){:root{--bg:#121614;--text:#ECEFED;--muted:#AEB8B3;--link:#3CCB8A;--card:#252C29;}}");
    html.push("body{margin:0;padding:28px 22px 64px;background:var(--bg);color:var(--text);font:16px/1.5 Nunito,-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif;}");
    html.push("a{color:var(--link);} h1{font-size:28px;margin:0 0 8px;} h2{font-size:20px;margin:28px 0 8px;}");
    html.push("p,li{max-width:42rem;} .muted{color:var(--muted);} .block{background:var(--card);padding:14px 16px;border-radius:12px;}");
    html.push(".back{display:inline-block;margin-bottom:18px;font-weight:700;text-decoration:none;} footer{margin-top:36px;font-weight:700;}");
    html.push("</style></head><body>");
    html.push('<a class="back" href="/" target="_top">‹ Back to Jaderoo</a>');
    html.push("<h1>Sources</h1>");
    html.push(paragraph(NOT_AFFILIATED));
    html.push(paragraph("Place and event listings come from the sources below. The data comes as-is."));
    html.push(paragraph(CHECK_CONDITIONS));
    html.push('<p id="report"><a href="' + escapeHtml(REPORT_HREF) + '">' + escapeHtml(REPORT_LABEL) + "</a></p>");
    html.push('<h2 id="ugrc">' + escapeHtml(UGRC_HEADING) + "</h2>");
    html.push(paragraphPhrases(TRAILHEAD_CREDIT, TRAILHEAD_PHRASES));
    html.push(paragraphPhrases(PARK_CREDIT, PARK_PHRASES));
    html.push('<div class="block">');
    UGRC_LINES.forEach(function (line) { html.push(paragraph(line)); });
    html.push("</div>");
    html.push('<h2 id="stateparks">Utah State Parks</h2>');
    html.push(paragraph(STATE_PARKS_CREDIT));
    html.push(paragraph(STATE_PARKS_PAGE));
    html.push('<h2 id="nps">National Park Service</h2>');
    html.push(paragraph(NPS_CREDIT));
    html.push(paragraph(NPS_PAGE));
    html.push(paragraphBoldLead(NPS_PLACE_PAGES, NPS_PLACE_PAGES_LEAD));
    html.push('<h2 id="museums">Utah Museums Directory</h2>');
    html.push(paragraph(MUSEUMS_CREDIT));
    html.push(paragraph(MUSEUMS_PAGE));
    html.push('<h2 id="ugrc-sgid">Utah Geospatial Resource Center (UGRC), State Geographic Information Database (SGID)</h2>');
    html.push(creditList(UGRC_ROUND8));
    html.push('<div class="block">');
    html.push(paragraphPhrases(UGRC_SGID_INTRO, UGRC_LAYER_LINKS));
    html.push(paragraph(UGRC_SGID_DISCLAIMER));
    html.push(paragraph(UGRC_SGID_GNIS));
    html.push(paragraph(GNIS_ACCESS));
    html.push("</div>");
    html.push(paragraphBoldLead(EVENT_LOCATIONS_PAGE, EVENT_LOCATIONS_LEAD, [
      { text: ADDRESS_POINTS_DATASET, href: ADDRESS_POINTS_DATASET },
      { text: CC_BY, href: CC_BY }
    ]));
    html.push("<h2>USDA Forest Service</h2>");
    html.push(creditList([USFS_SOURCE]));
    html.push(paragraphPhrases(USFS_PAGE, USFS_SOURCE.pagePhrases));
    html.push("<h2>Bureau of Land Management (BLM)</h2>");
    html.push(creditList([BLM_SOURCE]));
    html.push(paragraphPhrases(BLM_PAGE, BLM_SOURCE.pagePhrases));
    html.push(paragraph(BLM_PERMIT_PAGE));
    html.push(paragraphBoldLead(USGS_GNIS_PAGE, USGS_GNIS_LEAD, [
      { text: USGS_GNIS_URL, href: USGS_GNIS_URL }
    ]));
    html.push(paragraphBoldLead(CENSUS_PAGE, CENSUS_LEAD, [
      { text: CENSUS_URL, href: CENSUS_URL }
    ]));
    html.push('<h2 id="national-map">U.S. Geological Survey, The National Map</h2>');
    html.push(paragraph(USGS_NATIONAL_MAP_CREDIT));
    html.push("<p>" + htmlForParts([{
      text: OSM_LOCATIONS_LINE,
      href: httpsPageUrl(OSM_COPYRIGHT_HREF),
      external: true
    }]) + "</p>");
    html.push("<h2>Event listings</h2>");
    html.push('<p class="muted">Each event listing links to the organizer and shows the credit below.</p>');
    html.push(groupList("events"));
    html.push(eventInfoList(EVENT_INFO_LINES));
    html.push("<h2>Discovery only</h2>");
    html.push(paragraph("Visit Salt Lake and Explore Utah Valley are used only to find events. Jaderoo does not copy their listings. When an event is shown, the credit names the organizer."));
    html.push(groupList("discovery"));
    html.push("<h2>Yearly events we enter by hand</h2>");
    html.push(paragraph(ORGANIZER));
    html.push(groupList("manual"));
    html.push("<footer>" + escapeHtml(COPYRIGHT) + "</footer>");
    html.push("</body></html>");
    return html.join("");
  }

  return {
    CC_BY: CC_BY,
    TRAILHEAD_DATASET: TRAILHEAD_DATASET,
    PARKS_DATASET: PARKS_DATASET,
    UGRC_POLICY: UGRC_POLICY,
    TRAILHEAD_CREDIT: TRAILHEAD_CREDIT,
    PARK_CREDIT: PARK_CREDIT,
    UGRC_HEADING: UGRC_HEADING,
    UGRC_LINES: UGRC_LINES,
    STATE_PARKS_CREDIT: STATE_PARKS_CREDIT,
    STATE_PARKS_PAGE: STATE_PARKS_PAGE,
    NPS_CREDIT: NPS_CREDIT,
    NPS_PAGE: NPS_PAGE,
    NPS_NOTICE: NPS_NOTICE,
    NPS_PLACE_PAGES_LEAD: NPS_PLACE_PAGES_LEAD,
    NPS_PLACE_PAGES: NPS_PLACE_PAGES,
    MUSEUMS_CREDIT: MUSEUMS_CREDIT,
    MUSEUMS_PAGE: MUSEUMS_PAGE,
    UGRC_SGID_INTRO_TEMPLATE: UGRC_SGID_INTRO_TEMPLATE,
    UGRC_SGID_INTRO: UGRC_SGID_INTRO,
    UGRC_SGID_DISCLAIMER: UGRC_SGID_DISCLAIMER,
    UGRC_SGID_GNIS: UGRC_SGID_GNIS,
    ADDRESS_POINTS_DATASET: ADDRESS_POINTS_DATASET,
    EVENT_LOCATIONS_LEAD: EVENT_LOCATIONS_LEAD,
    EVENT_LOCATIONS_PAGE: EVENT_LOCATIONS_PAGE,
    GNIS_USGS_CREDIT: GNIS_USGS_CREDIT,
    GNIS_ACCESS: GNIS_ACCESS,
    GNIS_NOTE: GNIS_NOTE,
    USFS_CREDIT: USFS_CREDIT,
    USFS_PAGE: USFS_PAGE,
    USFS_HOME: USFS_HOME,
    BLM_CREDIT: BLM_CREDIT,
    BLM_PAGE: BLM_PAGE,
    BLM_RECREATION: BLM_RECREATION,
    USGS_GNIS_LEAD: USGS_GNIS_LEAD,
    USGS_GNIS_URL: USGS_GNIS_URL,
    USGS_GNIS_PAGE: USGS_GNIS_PAGE,
    CENSUS_LEAD: CENSUS_LEAD,
    CENSUS_URL: CENSUS_URL,
    CENSUS_PAGE: CENSUS_PAGE,
    USGS_NATIONAL_MAP_CREDIT: USGS_NATIONAL_MAP_CREDIT,
    UGRC_ROUND8: UGRC_ROUND8,
    ROUND8_SOURCES: ROUND8_SOURCES,
    BULK_LOADER_NOTES: BULK_LOADER_NOTES,
    NOT_AFFILIATED: NOT_AFFILIATED,
    CHECK_CONDITIONS: CHECK_CONDITIONS,
    ORGANIZER: ORGANIZER,
    COPYRIGHT: COPYRIGHT,
    REPORT_LABEL: REPORT_LABEL,
    REPORT_HREF: REPORT_HREF,
    ENTRIES: ENTRIES,
    creditView: creditView,
    cardCreditHtml: cardCreditHtml,
    renderPage: renderPage,
    escapeHtml: escapeHtml,
    httpsPageUrl: httpsPageUrl,
    cleanCredit: cleanCredit,
    cleanKey: cleanKey
  };
});
