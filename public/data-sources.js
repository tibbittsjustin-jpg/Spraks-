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
    html.push("<h2>Event listings</h2>");
    html.push('<p class="muted">Each event listing links to the organizer and shows the credit below.</p>');
    html.push(groupList("events"));
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
