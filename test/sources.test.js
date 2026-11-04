/* Source credits on cards and detail, the public Sources page,
   and migration 015. No database. Exact sentences are Legal's
   attribution quick reference, copied character for character. */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const sources = require("../public/data-sources");
const { buildListQuery, mapRow } = require("../db/activities-repo");
const remote = require("../public/remote-activities");
const { loadApp } = require("./harness");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
function section(title, fn) {
  console.log("\n" + title);
  try {
    const result = fn();
    if (result && typeof result.then === "function") return result;
  } catch (e) {
    check("section ran without throwing", false, String(e.stack || e.message).slice(0, 500));
  }
}

const TRAILHEAD = "Utah Trailheads, via UGRC SGID · CC BY 4.0 · data modified";
const PARK = "Utah Parks Local, via UGRC SGID · CC BY 4.0 · data modified";
const PARKS_CHANGE = "Utah Parks Local: park areas reduced to approximate center points; parks marked 'Future' (not yet open) removed; fields selected, acreage rounded and reformatted.";
const RETIRED_TRAILHEAD = "Trailhead data: Utah Trailheads, via UGRC, State Geographic Information Database (SGID), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Data modified: coordinates converted to latitude/longitude; fields selected and reformatted.";
const RETIRED_PARK = "Park data: Utah Parks Local, via UGRC, State Geographic Information Database (SGID), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Data modified: park areas reduced to approximate center points; proposed, planned and closed parks removed; fields selected, acreage rounded and reformatted.";
const UGRC_HEADING = "Utah Trailheads and Utah Parks Local (UGRC)";
const UGRC_LINES = [
  "Utah Trailheads and Utah Parks Local",
  "Data Sources: UGRC SGID (data modified).",
  "Source: Utah Geospatial Resource Center (UGRC, formerly AGRC), State Geographic Information Database (SGID). Datasets: Utah Trailheads (https://opendata.gis.utah.gov/datasets/9c21cc1f95ba40468deb36bb6fd94943_0) and Utah Parks Local (https://opendata.gis.utah.gov/datasets/818536733987486b8082e4c5dec0a1dd_0).",
  "License: Creative Commons Attribution 4.0 International (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/. UGRC license policy: https://gis.utah.gov/documentation/policy/license/.",
  "Changes we made: Utah Trailheads: coordinates converted to latitude/longitude; fields selected and reformatted. Utah Parks Local: park areas reduced to approximate center points; parks marked 'Future' (not yet open) removed; fields selected, acreage rounded and reformatted. We don't add any other information to these datasets.",
  "UGRC and the State of Utah don't endorse Jaderoo and aren't responsible for how we use or show this data.",
  "Disclaimer from UGRC (unmodified): \"The data, including but not limited to geographic data, tabular data, and analytical data, are provided \"as is\" and \"as available\", with no guarantees relating to the availability, completeness, or accuracy of data, and without any express or implied warranties. These data are provided as a public service for informational purposes only. You are solely responsible for obtaining the proper evaluation of a location and associated data by a qualified professional. UGRC reserves the right to change, revise, suspend or discontinue published data and services without notice at any time. Neither UGRC nor the State of Utah are responsible for any misuse or misrepresentation of the data. UGRC and the State of Utah are not obligated to provide you with any maintenance or support. The user assumes the entire risk as to the quality and performance of the data. You agree to hold the State of Utah harmless for any claims, liability, costs, and damages relating to your use of the data. You agree that your sole remedy for any dissatisfaction or claims is to discontinue use of the data.\""
];
const STATE_PARKS_CREDIT = "via Utah State Parks";
const STATE_PARKS_PAGE = "Utah State Parks. Park names, locations and links come from the Utah Division of State Parks website (https://stateparks.utah.gov/). We list facts only, write our own descriptions, and link to each park's official page. We don't copy State Parks pages, photos or logos. State information is provided \"as is\" under the Utah.gov Terms of Use (https://www.utah.gov/support/disclaimer.html). Jaderoo isn't affiliated with or endorsed by Utah State Parks or the State of Utah. Check the park's official page for hours, fees and closures before you go.";
const NPS_CREDIT = "via National Park Service (nps.gov)";
const NPS_PAGE = "National Park Service. Names, locations and links for national park units in Utah come from nps.gov, a U.S. Department of the Interior website. No claim to original U.S. Government works. We don't use NPS photos or the NPS Arrowhead, and the National Park Service doesn't endorse Jaderoo. Check the park's nps.gov page for current conditions, alerts and closures.";
const NPS_NOTICE = "No claim to original U.S. Government works.";
const MUSEUMS_CREDIT = "via Utah Division of Arts & Museums";
const MUSEUMS_PAGE = "Utah Museums Directory. Museum names, addresses and links come from the Utah Museums Directory published by the Utah Division of Arts & Museums, a division of the Utah Department of Cultural & Community Engagement (https://artsandmuseums.utah.gov/utah-museums-directory/). We list facts only and link to each listing. State information is provided \"as is\" under the Utah.gov Terms of Use (https://www.utah.gov/support/disclaimer.html). Jaderoo isn't affiliated with or endorsed by the Division or the listed museums.";
const NOT_AFFILIATED = "Jaderoo is not affiliated with or endorsed by any of these sources.";
const CHECK_CONDITIONS = "Check conditions before you go.";
const COPYRIGHT = "© 2026 Jaderoo. No claim to original U.S. Government works.";
const CC_BY = "https://creativecommons.org/licenses/by/4.0/";
const UGRC_VIA = ", via UGRC SGID · CC BY 4.0 · data modified";
const UGRC_SGID_INTRO_TEMPLATE = "Utah Geospatial Resource Center (UGRC), State Geographic Information Database (SGID). Data Sources: UGRC SGID (data modified). Layers used: {list each layer title, linked to its dataset page}. Licensed under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/). Changes made by Jaderoo: records filtered to activity types, polygons and lines reduced to points, trail segments combined by trail name, fields renamed and reformatted, and our own short summaries added. Neither UGRC nor the State of Utah endorses Jaderoo.";
const UGRC_SGID_DISCLAIMER = "UGRC disclaimer (unmodified): \"The data, including but not limited to geographic data, tabular data, and analytical data, are provided \"as is\" and \"as available\", with no guarantees relating to the availability, completeness, or accuracy of data, and without any express or implied warranties. These data are provided as a public service for informational purposes only. You are solely responsible for obtaining the proper evaluation of a location and associated data by a qualified professional. UGRC reserves the right to change, revise, suspend or discontinue published data and services without notice at any time. Neither UGRC nor the State of Utah are responsible for any misuse or misrepresentation of the data. UGRC and the State of Utah are not obligated to provide you with any maintenance or support. The user assumes the entire risk as to the quality and performance of the data. You agree to hold the State of Utah harmless for any claims, liability, costs, and damages relating to your use of the data. You agree that your sole remedy for any dissatisfaction or claims is to discontinue use of the data.\"";
const UGRC_SGID_GNIS = "GNIS place names originate from the U.S. Geological Survey Geographic Names Information System. Credit: U.S. Geological Survey.";
const ADDRESS_POINTS_DATASET = "https://opendata.gis.utah.gov/datasets/3f4f7a8efcd147febeca8bacaea67a14_0";
const EVENT_LOCATIONS_LEAD = "Event locations (geocoding).";
const EVENT_LOCATIONS_PAGE = "Event locations (geocoding). Map locations for event addresses are calculated by matching each venue address against Utah Address Points, a dataset in the Utah Geospatial Resource Center (UGRC) State Geographic Information Database (SGID), https://opendata.gis.utah.gov/datasets/3f4f7a8efcd147febeca8bacaea67a14_0, licensed under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/). Data Sources: UGRC SGID (data modified). Changes we made: we keep only the matched location, converted to latitude/longitude, and don't show or republish the address list. Locations may be approximate. Neither UGRC nor the State of Utah endorses Jaderoo.";
const GNIS_USGS_CREDIT = "Credit: U.S. Geological Survey.";
const GNIS_ACCESS = "Check access and conditions before you go.";
const GNIS_NOTE = GNIS_USGS_CREDIT + " " + GNIS_ACCESS;
const USFS_CREDIT = "via USDA Forest Service";
const USFS_PAGE = "USDA Forest Service. Recreation site information from the U.S. Forest Service Recreation Opportunities dataset (Enterprise Data Warehouse), https://www.fs.usda.gov/. U.S. Government work. No claim to original U.S. Government works. Data may be incomplete or out of date; check with the managing forest before you go. Use of this data does not imply endorsement by the USDA Forest Service.";
const USFS_HOME = "https://www.fs.usda.gov/";
const USFS_SAMPLE = "https://www.fs.usda.gov/recarea/uwcnf/recarea/?recid=9744";
const BLM_CREDIT = "via Bureau of Land Management";
const BLM_PAGE = "Bureau of Land Management (BLM). Recreation site information from the BLM National Recreation Sites and Facilities map service (compiled by BLM from Recreation.gov's Recreation Information Database), https://www.blm.gov/programs/recreation. U.S. Government work. No claim to original U.S. Government works. Use of this data does not imply endorsement by the BLM or the U.S. Department of the Interior.";
const BLM_RECREATION = "https://www.blm.gov/programs/recreation";
const BLM_SAMPLE = "https://www.blm.gov/visit/search-details/14494/2";
const USGS_GNIS_LEAD = "USGS GNIS.";
const USGS_GNIS_URL = "https://www.usgs.gov/tools/geographic-names-information-system-gnis";
const USGS_GNIS_PAGE = "USGS GNIS. Some place names and locations come from the Geographic Names Information System (GNIS), U.S. Geological Survey, " + USGS_GNIS_URL + ". Credit: U.S. Geological Survey. Locations are approximate. Features may be on private or closed land, so check access and conditions before you go. Neither USGS nor the U.S. government endorses Jaderoo.";
const CENSUS_LEAD = "U.S. Census Bureau.";
const CENSUS_URL = "https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html";
const CENSUS_PAGE = "U.S. Census Bureau. Some general city or area locations are center points we calculated from the U.S. Census Bureau's 2023 Cartographic Boundary Files (places), " + CENSUS_URL + ". These show the general area, not the exact venue location. Credit: U.S. Census Bureau. The Census Bureau didn't produce or review these center points, and neither the Census Bureau nor the U.S. government endorses Jaderoo.";
const ROUND8_LAYERS = [
  ["ugrc_monuments", "Utah Monuments and Markers", "63de4118823e4e3eba943ca43caefc72", "Utah Monuments and Markers (Utah Division of State History)" + UGRC_VIA],
  ["ugrc_boat_ramps", "Utah Boat Ramps", "0d12b74c39eb453088e992bf089d9890", "Utah Boat Ramps" + UGRC_VIA],
  ["ugrc_golf", "Utah Golf Courses", "d1f957478ea24659a7badb754a22b91c", "Utah Golf Courses" + UGRC_VIA],
  ["ugrc_libraries", "Utah Public Libraries", "f6cf0c8ef65344b6a6e5ebeaa108f549", "Utah Public Libraries (Utah State Library Division)" + UGRC_VIA],
  ["ugrc_peaks", "Utah Highest Peaks", "27faf1a5aef2429fb2d660139b6583d6", "Utah Highest Peaks" + UGRC_VIA],
  ["ugrc_ski_resorts", "Utah Ski Area Resort Locations", "24029712a33f47feacc7b3f2ef75f179", "Utah Ski Area Resort Locations" + UGRC_VIA],
  ["ugrc_cemeteries", "Utah Cemeteries", "f54d1c00020940ec95a729b39518e020", "Utah Cemeteries" + UGRC_VIA],
  ["ugrc_historic_trails", "Utah Historic Trails", "20742e3d34354509b8a9f567f1003509", "Utah Historic Trails" + UGRC_VIA],
  ["ugrc_trails", "Utah Trails and Pathways", "3080c0a2859a4d23a279e17e17c703c8", "Utah Trails and Pathways (UGRC, WFRC)" + UGRC_VIA],
  ["ugrc_ski_trails", "Utah Ski Trails XC", "c94307ff26e641159510005e076f5bfd", "Utah Ski Trails XC" + UGRC_VIA],
  ["ugrc_gnis", "Utah GNIS Place Names", "153301fffc8a4128884833e2f7ee1d6e", "Name and location: Utah GNIS Place Names (USGS GNIS)" + UGRC_VIA]
];

function visibleText(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function occurrences(haystack, needle) {
  const text = String(haystack || "");
  const find = String(needle || "");
  if (!find) return 0;
  let count = 0;
  let from = 0;
  while (from <= text.length) {
    const at = text.indexOf(find, from);
    if (at === -1) break;
    count++;
    from = at + find.length;
  }
  return count;
}

function walkText(node) {
  if (!node || typeof node !== "object") return "";
  let out = node.textContent || "";
  (node.children || []).forEach(child => { out += walkText(child); });
  return out;
}

function hrefs(node, acc) {
  acc = acc || [];
  if (!node || typeof node !== "object") return acc;
  if (typeof node.getAttribute === "function") {
    const href = node.getAttribute("href");
    if (href) acc.push(href);
  }
  (node.children || []).forEach(child => hrefs(child, acc));
  return acc;
}

function request(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ port: port, path: urlPath }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    }).on("error", reject);
  });
}

section("exact quick-reference strings", () => {
  check("trailhead credit matches the module", sources.TRAILHEAD_CREDIT === TRAILHEAD);
  check("park credit matches the module", sources.PARK_CREDIT === PARK);
  check("UGRC heading matches", sources.UGRC_HEADING === UGRC_HEADING);
  check("UGRC block matches line for line", JSON.stringify(sources.UGRC_LINES) === JSON.stringify(UGRC_LINES));
  check("state parks credit and page match",
    sources.STATE_PARKS_CREDIT === STATE_PARKS_CREDIT && sources.STATE_PARKS_PAGE === STATE_PARKS_PAGE);
  check("NPS credit, page, and 403 notice match",
    sources.NPS_CREDIT === NPS_CREDIT && sources.NPS_PAGE === NPS_PAGE && sources.NPS_NOTICE === NPS_NOTICE);
  check("museums credit and page match",
    sources.MUSEUMS_CREDIT === MUSEUMS_CREDIT && sources.MUSEUMS_PAGE === MUSEUMS_PAGE);
  check("the notice is inside the NPS page text", NPS_PAGE.indexOf(NPS_NOTICE) !== -1);
  check("the disclaimer quotes as is and as available",
    UGRC_LINES[6].indexOf("provided \"as is\" and \"as available\"") !== -1 &&
    UGRC_LINES[6].indexOf("hold the State of Utah harmless") !== -1);
  check("the parks change note names Future parks and stops before boundaries",
    UGRC_LINES[4].indexOf(PARKS_CHANGE) !== -1 &&
    UGRC_LINES.join("\n").indexOf("park boundaries used to show which park a place is in") === -1 &&
    UGRC_LINES.join("\n").indexOf("proposed, planned and closed parks removed") === -1);
  check("trailhead and park credits are the short canonical lines",
    TRAILHEAD === "Utah Trailheads" + UGRC_VIA && PARK === "Utah Parks Local" + UGRC_VIA);
});

section("credit line on the card and the detail", () => {
  const t = loadApp({});
  const base = t.IDEAS_BY_ID[2];
  function idea(extra) {
    const row = Object.assign({}, base, extra);
    delete row.photo;
    t.IDEAS_BY_ID[row.id] = row;
    return row;
  }
  const plain = idea({ id: 880001, source_key: null, source_credit: null, source_url: "https://example.com/plain" });
  const plainCard = t.buildSwipeCard(plain, false);
  check("a row with no source credit has no credit line", plainCard.innerHTML.indexOf("source-credit") === -1);

  const trail = idea({
    id: 880002,
    source_key: "ugrc_trailheads",
    source_url: "https://opendata.gis.utah.gov/datasets/9c21cc1f95ba40468deb36bb6fd94943_0",
    source_credit: "<img src=x onerror=alert(1)>"
  });
  const trailCard = t.buildSwipeCard(trail, false);
  const trailText = visibleText(trailCard.innerHTML);
  check("the card shows the exact trailhead credit", trailText.indexOf(TRAILHEAD) === 0 || trailText.indexOf(TRAILHEAD) !== -1, trailText.slice(0, 80));
  check("the card does not use the old geocoded wording", trailText.indexOf("locations geocoded") === -1);
  check("the license link is clickable on the card",
    trailCard.innerHTML.indexOf('href="' + CC_BY + '"') !== -1);
  check("the dataset page is linked from the card",
    trailCard.innerHTML.indexOf('href="https://opendata.gis.utah.gov/datasets/9c21cc1f95ba40468deb36bb6fd94943_0"') !== -1);
  check("the card credit links to Sources", trailCard.innerHTML.indexOf('href="/sources#ugrc_trailheads"') !== -1);
  check("a hostile stored credit is not injected when the key is known",
    trailCard.innerHTML.indexOf("<img") === -1 && trailCard.innerHTML.indexOf("onerror") === -1);

  const trailDetail = t.buildDetailScreen(trail.id);
  const trailDetailText = walkText(trailDetail);
  check("the detail shows the exact trailhead credit", trailDetailText.indexOf(TRAILHEAD) !== -1);
  check("trailhead detail says to check conditions", trailDetailText.indexOf(CHECK_CONDITIONS) !== -1);
  const trailHrefs = hrefs(trailDetail);
  check("detail license and dataset links are real anchors",
    trailHrefs.indexOf(CC_BY) !== -1 &&
    trailHrefs.indexOf("https://opendata.gis.utah.gov/datasets/9c21cc1f95ba40468deb36bb6fd94943_0") !== -1);
  check("detail links to the report section", trailHrefs.indexOf("/sources#report") !== -1);

  const oldPark = idea({
    id: 880003,
    source_credit: "Park data: Utah Parks Local, via UGRC, State Geographic Information Database (SGID), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Data modified: polygons reduced to center points and reformatted."
  });
  const parkText = visibleText(t.buildSwipeCard(oldPark, false).innerHTML);
  check("an older parks credit renders the exact current line", parkText.indexOf(PARK) !== -1 && parkText.indexOf("polygons reduced") === -1);
  const retiredPark = idea({ id: 880010, source_credit: RETIRED_PARK });
  const retiredParkText = visibleText(t.buildSwipeCard(retiredPark, false).innerHTML);
  check("the retired parks sentence renders the canonical line",
    retiredParkText.indexOf(PARK) !== -1 && retiredParkText.indexOf("proposed, planned and closed") === -1);
  const retiredTrail = idea({ id: 880011, source_credit: RETIRED_TRAILHEAD });
  const retiredTrailText = visibleText(t.buildSwipeCard(retiredTrail, false).innerHTML);
  check("the retired trailhead sentence renders the canonical line",
    retiredTrailText.indexOf(TRAILHEAD) !== -1 && retiredTrailText.indexOf("coordinates converted") === -1);
  const parkDetail = walkText(t.buildDetailScreen(oldPark.id));
  check("park detail says approximate location", parkDetail.indexOf("Approximate location.") !== -1 && parkDetail.indexOf(PARK) !== -1);

  const nps = idea({
    id: 880004,
    source_key: "nps",
    source_url: "https://www.nps.gov/arch/index.htm",
    source_credit: NPS_CREDIT
  });
  const npsCard = t.buildSwipeCard(nps, false);
  check("the NPS card uses the exact credit", visibleText(npsCard.innerHTML).indexOf(NPS_CREDIT) !== -1);
  check("the NPS credit links to the unit page",
    npsCard.innerHTML.indexOf('href="https://www.nps.gov/arch/index.htm"') !== -1);
  const npsDetail = t.buildDetailScreen(nps.id);
  check("NPS detail keeps the exact credit and does not add an Arrowhead",
    walkText(npsDetail).indexOf(NPS_CREDIT) !== -1 && walkText(npsDetail).toLowerCase().indexOf("arrowhead") === -1);

  const museum = idea({
    id: 880005,
    source_key: "museums",
    source_url: "https://artsandmuseums.utah.gov/utah-museums-directory/listing/alf-engen-ski-museum-2/"
  });
  check("the museum card uses the exact division credit",
    visibleText(t.buildSwipeCard(museum, false).innerHTML).indexOf(MUSEUMS_CREDIT) !== -1);
  check("the museum credit links to the directory listing",
    t.buildSwipeCard(museum, false).innerHTML.indexOf('href="https://artsandmuseums.utah.gov/utah-museums-directory/listing/alf-engen-ski-museum-2/"') !== -1);

  const parks = idea({
    id: 880006,
    source_credit: STATE_PARKS_CREDIT,
    source_url: "https://stateparks.utah.gov/parks/antelope-island/"
  });
  check("state parks card is the exact via line", visibleText(t.buildSwipeCard(parks, false).innerHTML).indexOf(STATE_PARKS_CREDIT) !== -1);
  check("state parks credit links to the park page",
    t.buildSwipeCard(parks, false).innerHTML.indexOf('href="https://stateparks.utah.gov/parks/antelope-island/"') !== -1);

  const hostile = idea({
    id: 880007,
    source_credit: "<script>alert(1)</script>",
    source_url: "javascript:alert(1)"
  });
  const hostileHtml = t.buildSwipeCard(hostile, false).innerHTML;
  check("an unknown credit is escaped",
    hostileHtml.indexOf("<script>") === -1 && hostileHtml.indexOf("&lt;script&gt;") !== -1);
  check("a javascript source url is not used as a link", hostileHtml.indexOf("javascript:") === -1);

  const event = idea({ id: 880008, source_credit: "via University of Utah", source_url: "https://events.utah.edu/example" });
  check("an event credit the row carries is shown",
    visibleText(t.buildSwipeCard(event, false).innerHTML).indexOf("via University of Utah") !== -1);

  const withPhoto = Object.assign({}, base, {
    id: 880009,
    source_key: "ugrc_trailheads",
    source_url: "https://opendata.gis.utah.gov/datasets/9c21cc1f95ba40468deb36bb6fd94943_0"
  });
  t.IDEAS_BY_ID[withPhoto.id] = withPhoto;
  const photoCard = t.buildSwipeCard(withPhoto, false);
  check("a photo card still shows the exact trailhead credit",
    photoCard.className.indexOf("has-photo") !== -1 && visibleText(photoCard.innerHTML).indexOf(TRAILHEAD) !== -1);

  const appSrc = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const fn = appSrc.slice(appSrc.indexOf("function appendSourceCredit"), appSrc.indexOf("function photoOverlayHtml"));
  check("detail credit uses textContent and setAttribute, not innerHTML",
    fn.indexOf("textContent") !== -1 && fn.indexOf("setAttribute") !== -1 && fn.indexOf("innerHTML") === -1);
});

section("activities API carries the credit columns", () => {
  const q = buildListQuery({});
  check("the list query selects source_key and source_credit",
    q.text.indexOf("source_key") !== -1 && q.text.indexOf("source_credit") !== -1);
  const row = mapRow({
    id: 9, title: "T", description: "", category: "Hiking & Nature", icon: "",
    setting: "Outdoor", season: [], food: false, cost: "Free", duration: "Short (1-2 hrs)",
    time: [], vibe: [], stage: [], date_type: [], scene: null, motif: null,
    source: "curated", tier: "free", address: null, lat: null, lng: null,
    affiliate_url: null, updated_at: null,
    source_key: "ugrc_trailheads",
    source_credit: TRAILHEAD,
    source_url: "https://opendata.gis.utah.gov/datasets/9c21cc1f95ba40468deb36bb6fd94943_0"
  }, false);
  check("mapRow returns both names for the credit",
    row.source_key === "ugrc_trailheads" && row.sourceKey === row.source_key &&
    row.source_credit === TRAILHEAD && row.sourceCredit === row.source_credit);
  const idea = remote.mapActivityToIdea({
    id: 100501,
    title: "Trailhead",
    source_key: "UGC_Nope!",
    source_credit: "via <b>UMFA</b>",
    source_url: "https://umfa.utah.edu/event"
  });
  check("a bad source key is dropped and the credit text is kept",
    idea.source_key == null && idea.source_credit === "via <b>UMFA</b>");
  const umfa = remote.mapActivityToIdea({
    id: 100502,
    title: "Gallery",
    source_key: "umfa",
    source_credit: "via UMFA",
    source_url: "https://umfa.utah.edu/event"
  });
  check("a cleared event key and credit survive the deck mapping",
    umfa.source_key === "umfa" && umfa.sourceCredit === "via UMFA" && umfa.source_credit === "via UMFA");
});

section("round 8 credit lines and sources blocks", () => {
  const dotAt = UGRC_VIA.indexOf("SGID") + 5;
  check("the UGRC separator is a middle dot", UGRC_VIA.charCodeAt(dotAt) === 0x00B7);
  const titles = ROUND8_LAYERS.map(row => row[1]).join(", ");
  const intro = UGRC_SGID_INTRO_TEMPLATE.replace("{list each layer title, linked to its dataset page}", titles);
  check("round 8 UGRC intro matches the module", sources.UGRC_SGID_INTRO === intro);
  check("the new UGRC block does not repeat Utah Trailheads", intro.indexOf("Utah Trailheads") === -1);
  check("round 8 disclaimer matches the module", sources.UGRC_SGID_DISCLAIMER === UGRC_SGID_DISCLAIMER);
  check("round 8 GNIS origin line matches the module", sources.UGRC_SGID_GNIS === UGRC_SGID_GNIS);
  check("event locations paragraph matches the module",
    sources.EVENT_LOCATIONS_PAGE === EVENT_LOCATIONS_PAGE &&
    sources.EVENT_LOCATIONS_LEAD === EVENT_LOCATIONS_LEAD &&
    sources.ADDRESS_POINTS_DATASET === ADDRESS_POINTS_DATASET &&
    EVENT_LOCATIONS_PAGE.indexOf(EVENT_LOCATIONS_LEAD) === 0);
  check("GNIS carries the USGS credit and the access caution",
    sources.GNIS_USGS_CREDIT === GNIS_USGS_CREDIT &&
    sources.GNIS_ACCESS === GNIS_ACCESS &&
    sources.GNIS_NOTE === GNIS_NOTE &&
    GNIS_NOTE.indexOf(GNIS_USGS_CREDIT) !== -1 &&
    GNIS_NOTE.indexOf(GNIS_ACCESS) !== -1);
  check("USFS credit and sources block match",
    sources.USFS_CREDIT === USFS_CREDIT && sources.USFS_PAGE === USFS_PAGE && sources.USFS_HOME === USFS_HOME);
  check("BLM credit and sources block match, including the 403 notice",
    sources.BLM_CREDIT === BLM_CREDIT && sources.BLM_PAGE === BLM_PAGE &&
    sources.BLM_RECREATION === BLM_RECREATION &&
    BLM_PAGE.indexOf("No claim to original U.S. Government works.") !== -1);
  check("USFS block says the data does not imply endorsement",
    USFS_PAGE.indexOf("Use of this data does not imply endorsement by the USDA Forest Service.") !== -1);
  check("BLM block says the data does not imply endorsement",
    BLM_PAGE.indexOf("Use of this data does not imply endorsement by the BLM or the U.S. Department of the Interior.") !== -1);
  check("section 9 UGRC block matches the published lines",
    sources.TRAILHEAD_CREDIT === TRAILHEAD && sources.PARK_CREDIT === PARK &&
    sources.UGRC_HEADING === UGRC_HEADING &&
    JSON.stringify(sources.UGRC_LINES) === JSON.stringify(UGRC_LINES) &&
    sources.UGRC_LINES[4].indexOf(PARKS_CHANGE) !== -1);

  const byKey = Object.create(null);
  sources.ROUND8_SOURCES.forEach(row => { byKey[row.key] = row; });
  check("round 8 publishes 13 loader keys", sources.ROUND8_SOURCES.length === 13 && ROUND8_LAYERS.length === 11);
  ROUND8_LAYERS.forEach(row => {
    const item = byKey[row[0]];
    const dataset = "https://opendata.gis.utah.gov/datasets/" + row[2] + "_0";
    check(row[0] + " credit is exact", item && item.credit === row[3] && item.title === row[1]);
    check(row[0] + " dataset url", item && item.datasetUrl === dataset && item.itemId === row[2]);
    check(row[0] + " key fits the column", /^[a-z0-9][a-z0-9_-]{0,63}$/.test(row[0]) && row[3].length <= 500);
    const view = sources.creditView({ source_key: row[0] });
    const joined = view.parts.map(part => part.text).join("");
    check(row[0] + " linked parts rebuild the credit", joined === row[3]);
    const sgid = view.parts.find(part => part.text === "UGRC SGID");
    const ccby = view.parts.find(part => part.text === "CC BY 4.0");
    check(row[0] + " links UGRC SGID and CC BY 4.0",
      sgid && sgid.href === dataset && ccby && ccby.href === CC_BY);
  });
  check("usfs loader uses recareaurl",
    byKey.usfs && byKey.usfs.credit === USFS_CREDIT && byKey.usfs.sourceUrlField === "recareaurl" && byKey.usfs.linkItem === true);
  check("blm loader uses BLMRecURL",
    byKey.blm && byKey.blm.credit === BLM_CREDIT && byKey.blm.sourceUrlField === "BLMRecURL" && byKey.blm.linkItem === true);
  check("loader notes name the three url fields",
    sources.BULK_LOADER_NOTES.indexOf("datasetUrl") !== -1 &&
    sources.BULK_LOADER_NOTES.indexOf("recareaurl") !== -1 &&
    sources.BULK_LOADER_NOTES.indexOf("BLMRecURL") !== -1 &&
    sources.BULK_LOADER_NOTES.indexOf("source_key") !== -1);

  const page = sources.renderPage();
  const text = visibleText(page);
  [intro, UGRC_SGID_DISCLAIMER, UGRC_SGID_GNIS, GNIS_ACCESS, GNIS_USGS_CREDIT, USFS_CREDIT, USFS_PAGE, BLM_CREDIT, BLM_PAGE]
    .concat(ROUND8_LAYERS.map(row => row[3]))
    .forEach(sentence => {
      check("sources page includes " + sentence.slice(0, 42), text.indexOf(sentence) !== -1);
    });
  check("disclaimer quotes are escaped in the html",
    page.indexOf("provided &quot;as is&quot; and &quot;as available&quot;") !== -1);
  check("USFS home link does not swallow the period",
    page.indexOf('href="' + USFS_HOME + '"') !== -1 && page.indexOf('href="' + USFS_HOME + '."') === -1);
  check("BLM recreation link does not swallow the period",
    page.indexOf('href="' + BLM_RECREATION + '"') !== -1 && page.indexOf('href="' + BLM_RECREATION + '."') === -1);
  ROUND8_LAYERS.forEach(row => {
    const dataset = "https://opendata.gis.utah.gov/datasets/" + row[2] + "_0";
    check("page links " + row[1], page.indexOf('href="' + dataset + '"') !== -1 && page.indexOf('id="' + row[0] + '"') !== -1);
  });
  check("page has no images", page.indexOf("<img") === -1 && page.indexOf("<svg") === -1);
  check("page does not name Smokey", page.toLowerCase().indexOf("smokey") === -1);
  ["Daughters of Utah Pioneers", "StateParksInfo", "DPR_Landmark"].forEach(name => {
    check("unverified layer is not listed: " + name, text.indexOf(name) === -1 && intro.indexOf(name) === -1);
  });

  const t = loadApp({});
  const base = t.IDEAS_BY_ID[2];
  function idea(extra) {
    const row = Object.assign({}, base, extra);
    delete row.photo;
    t.IDEAS_BY_ID[row.id] = row;
    return row;
  }
  const monuments = idea({
    id: 881001,
    source_key: "ugrc_monuments",
    source_credit: "<img src=x onerror=alert(1)>",
    source_url: "javascript:alert(1)"
  });
  const monumentsHtml = t.buildSwipeCard(monuments, false).innerHTML;
  const monumentsText = visibleText(monumentsHtml);
  check("monuments card shows the exact credit", monumentsText.indexOf(ROUND8_LAYERS[0][3]) !== -1);
  check("monuments card links the dataset and the license",
    monumentsHtml.indexOf('href="https://opendata.gis.utah.gov/datasets/63de4118823e4e3eba943ca43caefc72_0"') !== -1 &&
    monumentsHtml.indexOf('href="' + CC_BY + '"') !== -1);
  check("monuments card drops a hostile stored credit and a javascript url",
    monumentsHtml.indexOf("<img") === -1 && monumentsHtml.indexOf("onerror") === -1 && monumentsHtml.indexOf("javascript:") === -1);
  check("monuments card says to check conditions", monumentsText.indexOf(CHECK_CONDITIONS) !== -1);
  const monumentsDetail = walkText(t.buildDetailScreen(monuments.id));
  check("monuments detail shows the exact credit", monumentsDetail.indexOf(ROUND8_LAYERS[0][3]) !== -1);

  const gnis = idea({ id: 881002, source_key: "ugrc_gnis" });
  const gnisHtml = t.buildSwipeCard(gnis, false).innerHTML;
  const gnisText = visibleText(gnisHtml);
  const gnisCredit = ROUND8_LAYERS.filter(row => row[0] === "ugrc_gnis")[0][3];
  check("GNIS card shows the exact credit", gnisText.indexOf(gnisCredit) !== -1);
  check("GNIS card includes the USGS credit", gnisText.indexOf(GNIS_USGS_CREDIT) !== -1);
  check("GNIS card includes the access caution", gnisText.indexOf(GNIS_ACCESS) !== -1);
  const gnisDetail = t.buildDetailScreen(gnis.id);
  const gnisDetailText = walkText(gnisDetail);
  check("GNIS detail includes the credit, the USGS line, and the access caution",
    gnisDetailText.indexOf(gnisCredit) !== -1 &&
    gnisDetailText.indexOf(GNIS_USGS_CREDIT) !== -1 &&
    gnisDetailText.indexOf(GNIS_ACCESS) !== -1);
  const gnisHrefs = hrefs(gnisDetail);
  check("GNIS detail links the dataset and the license",
    gnisHrefs.indexOf("https://opendata.gis.utah.gov/datasets/153301fffc8a4128884833e2f7ee1d6e_0") !== -1 &&
    gnisHrefs.indexOf(CC_BY) !== -1);

  const usfs = idea({ id: 881004, source_key: "usfs", source_url: USFS_SAMPLE, source_credit: "<b>Smokey</b>" });
  const usfsHtml = t.buildSwipeCard(usfs, false).innerHTML;
  check("USFS card uses the exact credit", visibleText(usfsHtml).indexOf(USFS_CREDIT) !== -1);
  check("USFS credit links the record recareaurl", usfsHtml.indexOf('href="' + USFS_SAMPLE + '"') !== -1);
  check("USFS card has no shield name, no Smokey, and no injected markup",
    usfsHtml.toLowerCase().indexOf("smokey") === -1 && usfsHtml.indexOf("<b>") === -1 && usfsHtml.indexOf("<img") === -1);
  check("USFS detail keeps the exact credit and the conditions note",
    walkText(t.buildDetailScreen(usfs.id)).indexOf(USFS_CREDIT) !== -1 &&
    walkText(t.buildDetailScreen(usfs.id)).indexOf(CHECK_CONDITIONS) !== -1);

  const blm = idea({ id: 881005, source_key: "blm", source_url: BLM_SAMPLE });
  const blmHtml = t.buildSwipeCard(blm, false).innerHTML;
  check("BLM card uses the exact credit", visibleText(blmHtml).indexOf(BLM_CREDIT) !== -1);
  check("BLM credit links the record BLMRecURL", blmHtml.indexOf('href="' + BLM_SAMPLE + '"') !== -1);
  check("BLM detail shows the exact credit", walkText(t.buildDetailScreen(blm.id)).indexOf(BLM_CREDIT) !== -1);

  const bareUsfs = idea({ id: 881006, source_key: "usfs", source_url: "javascript:alert(1)" });
  check("a javascript recareaurl is not used as a link",
    t.buildSwipeCard(bareUsfs, false).innerHTML.indexOf("javascript:") === -1);
});

section("round 8 mapping omits sources still on hold", () => {
  // OpenStreetMap and ODbL are not banned on the rendered page. Another
  // change may add one temporary line there. They must not be source keys
  // or credit lines in this mapping.
  const keys = sources.ENTRIES.map(entry => entry.key);
  const credits = sources.ENTRIES.map(entry => entry.credit);
  const titles = sources.ROUND8_SOURCES.map(entry => entry.title || "");
  const mapped = keys.concat(credits).concat(titles).join("\n");
  [
    "OpenStreetMap",
    "ODbL",
    "Wikidata",
    "RIDB",
    "NPS API",
    "NPS Data API",
    "via Wikidata",
    "Data Source: Recreation.gov",
    "Place data © OpenStreetMap contributors"
  ].forEach(phrase => {
    check("credit mapping does not include " + phrase, mapped.indexOf(phrase) === -1);
  });
  ["osm", "odbl", "openstreetmap", "wikidata", "ridb", "nps_api", "nps-api", "recreation_gov"].forEach(key => {
    check("no source_key " + key, keys.indexOf(key) === -1);
  });
  check("ugrc_schools is not a source key",
    keys.indexOf("ugrc_schools") === -1 &&
    sources.ROUND8_SOURCES.every(entry => entry.key !== "ugrc_schools") &&
    sources.creditView({ source_key: "ugrc_schools" }) == null);
  const heldPage = sources.renderPage();
  const heldText = visibleText(heldPage);
  check("sources page does not list Utah Schools",
    heldText.indexOf("Utah Schools") === -1 &&
    heldText.indexOf("ugrc_schools") === -1 &&
    heldPage.indexOf("333206ff129346e3b8660e8f6f48540e") === -1);
  check("no source_key looks like a held round 8 source",
    keys.every(key => !/osm|odbl|wikidata|ridb|openstreetmap|nps_api|nps-api/i.test(key)));
  check("the only nps key is still the section 9 one",
    keys.filter(key => key.indexOf("nps") !== -1).join(",") === "nps" &&
    sources.NPS_CREDIT === NPS_CREDIT &&
    sources.NPS_PAGE.indexOf("NPS API") === -1 &&
    sources.NPS_PAGE.indexOf("NPS Data API") === -1);
  const pageText = visibleText(sources.renderPage());
  ["Wikidata", "RIDB", "NPS API", "NPS Data API", "via Wikidata", "Data Source: Recreation.gov"].forEach(phrase => {
    check("sources page does not add " + phrase, pageText.indexOf(phrase) === -1);
  });
});

function main() {
  return section("Sources page", async () => {
    const page = sources.renderPage();
    const text = visibleText(page);
    [TRAILHEAD, PARK, UGRC_HEADING].concat(UGRC_LINES).concat([
      STATE_PARKS_CREDIT, STATE_PARKS_PAGE, NPS_CREDIT, NPS_PAGE, NPS_NOTICE,
      MUSEUMS_CREDIT, MUSEUMS_PAGE, NOT_AFFILIATED, CHECK_CONDITIONS, COPYRIGHT,
      "via University of Utah", "via UMFA", "via Provo City Library", "via BYU Calendar",
      "via Weber State University", "via Box Elder Chamber of Commerce",
      "Info from Box Elder Chamber of Commerce", "Info from Beaver County Fair",
      "Jaderoo isn't affiliated with the organizer.",
      "Report or remove a listing"
    ]).forEach(sentence => {
      check("page text includes " + sentence.slice(0, 48), text.indexOf(sentence) !== -1);
    });
    check("the CC BY license is a link", page.indexOf('href="' + CC_BY + '"') !== -1);
    check("the UGRC policy is a link", page.indexOf('href="https://gis.utah.gov/documentation/policy/license/"') !== -1);
    check("the report link is a mailto", page.indexOf('href="mailto:support@jaderoo.com?subject=Report%20or%20remove%20a%20listing"') !== -1);
    const OSM_LINE = "Some locations © OpenStreetMap contributors, available under the Open Database License (ODbL)";
    const OSM_HREF = "https://www.openstreetmap.org/copyright";
    function anchorAttrsFor(html, exact) {
      const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
      let match;
      while ((match = re.exec(html))) {
        if (visibleText(match[2]) === exact) return match[1];
      }
      return "";
    }
    const osmAttrs = anchorAttrsFor(page, OSM_LINE);
    check("the Sources page shows the exact OpenStreetMap line",
      text.indexOf(OSM_LINE) !== -1 && osmAttrs.indexOf('href="' + OSM_HREF + '"') !== -1,
      osmAttrs);
    ["via The City Library", "Salt Lake City Public Library", "via Pleasant Grove", "locations geocoded", "polygons reduced to center points", "Data: Utah UGRC"].forEach(banned => {
      check("page does not list " + banned, text.indexOf(banned) === -1);
    });

    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";
    delete require.cache[require.resolve("../server")];
    const app = require("../server");
    const server = await new Promise(resolve => {
      const listening = app.listen(0, () => resolve(listening));
    });
    try {
      const res = await request(server.address().port, "/sources");
      const bodyText = visibleText(res.body);
      check("/sources is 200", res.status === 200, String(res.status));
      check("the route serves the exact UGRC disclaimer", bodyText.indexOf(UGRC_LINES[6]) !== -1);
      check("the route serves the not-affiliated line", bodyText.indexOf(NOT_AFFILIATED) !== -1);
      check("the route serves the NPS 403 notice", bodyText.indexOf(NPS_NOTICE) !== -1);
      check("the route serves the round 8 UGRC disclaimer", bodyText.indexOf(UGRC_SGID_DISCLAIMER) !== -1);
      check("the event locations paragraph appears on /sources once",
        occurrences(bodyText, EVENT_LOCATIONS_PAGE) === 1,
        String(occurrences(bodyText, EVENT_LOCATIONS_PAGE)));
      check("the UGRC disclaimer still appears on /sources once",
        occurrences(bodyText, UGRC_SGID_DISCLAIMER) === 1,
        String(occurrences(bodyText, UGRC_SGID_DISCLAIMER)));
      const ugrcHeading = res.body.indexOf('id="ugrc-sgid"');
      const disclaimerAt = res.body.indexOf("UGRC disclaimer (unmodified)");
      const blockEnd = res.body.indexOf("</div>", disclaimerAt);
      const eventAt = res.body.indexOf("<strong>" + EVENT_LOCATIONS_LEAD + "</strong>");
      check("the paragraph sits under the shared UGRC block",
        ugrcHeading !== -1 && disclaimerAt > ugrcHeading && blockEnd > disclaimerAt && eventAt > blockEnd);
      check("event location urls are links whose text is the url",
        res.body.indexOf('href="' + ADDRESS_POINTS_DATASET + '"') !== -1 &&
        res.body.indexOf(">" + ADDRESS_POINTS_DATASET + "</a>") !== -1 &&
        res.body.indexOf('href="' + ADDRESS_POINTS_DATASET + ',"') === -1 &&
        res.body.indexOf(">" + CC_BY + "</a>") !== -1);
      check("the page does not use the UGRC Web API wording",
        bodyText.indexOf("api.mapserv.utah.gov") === -1 &&
        bodyText.indexOf("UGRC Web API") === -1);
      check("the page does not add a per-pin Location line",
        bodyText.indexOf("Location: Utah Address Points") === -1 &&
        bodyText.indexOf("Location: UGRC Web API") === -1);
      check("the route serves the USFS block", bodyText.indexOf(USFS_PAGE) !== -1);
      check("the route serves the BLM block", bodyText.indexOf(BLM_PAGE) !== -1);
      check("the route serves the GNIS access caution", bodyText.indexOf(GNIS_ACCESS) !== -1);
      check("the route serves the CC BY link", res.body.indexOf('href="' + CC_BY + '"') !== -1);
      const routeOsmAttrs = anchorAttrsFor(res.body, OSM_LINE);
      check("the route serves the exact OpenStreetMap line",
        bodyText.indexOf(OSM_LINE) !== -1 && routeOsmAttrs.indexOf('href="' + OSM_HREF + '"') !== -1,
        routeOsmAttrs);
      function paragraphBlock(html, lead) {
        const marker = "<strong>" + lead + "</strong>";
        const at = html.indexOf(marker);
        if (at < 0) return "";
        const start = html.lastIndexOf("<p", at);
        const end = html.indexOf("</p>", at);
        if (start < 0 || end < 0) return "";
        return html.slice(start, end + 4);
      }
      function exactHref(html, urlText) {
        const attrs = anchorAttrsFor(html, urlText);
        const match = /href="([^"]*)"/.exec(attrs);
        return match ? match[1] : "";
      }
      const usgsBlock = paragraphBlock(res.body, USGS_GNIS_LEAD);
      const censusBlock = paragraphBlock(res.body, CENSUS_LEAD);
      const eventsAt = res.body.indexOf("<h2>Event listings</h2>");
      const blmAt = res.body.indexOf("<h2>Bureau of Land Management (BLM)</h2>");
      check("the USGS GNIS paragraph appears on /sources once",
        occurrences(bodyText, USGS_GNIS_PAGE) === 1 && visibleText(usgsBlock) === USGS_GNIS_PAGE,
        String(occurrences(bodyText, USGS_GNIS_PAGE)));
      check("the USGS GNIS link href equals its URL",
        exactHref(usgsBlock, USGS_GNIS_URL) === USGS_GNIS_URL);
      check("the USGS GNIS block has no img",
        usgsBlock.length > 0 && usgsBlock.toLowerCase().indexOf("<img") === -1);
      check("the Census paragraph appears on /sources once",
        occurrences(bodyText, CENSUS_PAGE) === 1 && visibleText(censusBlock) === CENSUS_PAGE,
        String(occurrences(bodyText, CENSUS_PAGE)));
      check("the Census link href equals its URL",
        exactHref(censusBlock, CENSUS_URL) === CENSUS_URL);
      check("the Census block has no img",
        censusBlock.length > 0 && censusBlock.toLowerCase().indexOf("<img") === -1);
      check("gazetteer is absent from /sources",
        res.body.toLowerCase().indexOf("gazetteer") === -1);
      check("USGS and Census credits sit with the place-data credits, before Event listings",
        blmAt !== -1 &&
        res.body.indexOf("<strong>" + USGS_GNIS_LEAD + "</strong>") > blmAt &&
        res.body.indexOf("<strong>" + CENSUS_LEAD + "</strong>") > res.body.indexOf("<strong>" + USGS_GNIS_LEAD + "</strong>") &&
        eventsAt > res.body.indexOf("<strong>" + CENSUS_LEAD + "</strong>"));
      check("the place-data paragraphs match the module constants",
        sources.USGS_GNIS_PAGE === USGS_GNIS_PAGE &&
        sources.USGS_GNIS_URL === USGS_GNIS_URL &&
        sources.USGS_GNIS_LEAD === USGS_GNIS_LEAD &&
        sources.CENSUS_PAGE === CENSUS_PAGE &&
        sources.CENSUS_URL === CENSUS_URL &&
        sources.CENSUS_LEAD === CENSUS_LEAD);
      const EVENT_INFO_LINES = [
        ["Event info from Brigham City Public Library (library.bcutah.gov). See the library's page for details.", "library.bcutah.gov", "https://library.bcutah.gov/"],
        ["Event info from Utah Humanities (utahhumanities.org).", "utahhumanities.org", "https://utahhumanities.org/"],
        ["Event info from Spanish Fork Public Library (spanishfork.libcal.com).", "spanishfork.libcal.com", "https://spanishfork.libcal.com/"],
        ["Event info from Lehi City Library (lehicity.libcal.com).", "lehicity.libcal.com", "https://lehicity.libcal.com/"],
        ["Event info from the Gallivan Center (thegallivancenter.com).", "thegallivancenter.com", "https://thegallivancenter.com/"],
        ["Event info from Utah Film Center (utahfilmcenter.org).", "utahfilmcenter.org", "https://utahfilmcenter.org/"],
        ["Event info from Peery's Egyptian Theater (ogdenpet.com).", "ogdenpet.com", "https://ogdenpet.com/"],
        ["Event info from Brigham City Museum of Art & History (museum.bcutah.gov).", "museum.bcutah.gov", "https://museum.bcutah.gov/"],
        ["Event info from Stokes Nature Center (logannature.org).", "logannature.org", "https://logannature.org/"],
        ["Event info from Bear River Heritage Area (bearriverheritage.com).", "bearriverheritage.com", "https://bearriverheritage.com/"],
        ["Event info from Ogden Shakespeare Festival (ogdenshakesfest.org).", "ogdenshakesfest.org", "https://ogdenshakesfest.org/"],
        ["Event info from Springville Museum of Art (smofa.org).", "smofa.org", "https://www.smofa.org/"]
      ];
      const discoveryAt = res.body.indexOf("<h2>Discovery only</h2>");
      const eventsHtml = eventsAt === -1 || discoveryAt === -1 ? "" : res.body.slice(eventsAt, discoveryAt);
      const eventsText = visibleText(eventsHtml);
      const eventsTextAt = bodyText.indexOf("Event listings");
      const discoveryTextAt = bodyText.indexOf("Discovery only");
      check("the Event listings section has no img",
        eventsHtml.length > 0 && eventsHtml.toLowerCase().indexOf("<img") === -1);
      check("event info lines are not per-card credits",
        sources.ENTRIES.every(entry => String(entry.credit || "").indexOf("Event info from") === -1));
      let previousLineAt = eventsTextAt;
      EVENT_INFO_LINES.forEach(function (row) {
        const line = row[0];
        const domain = row[1];
        const href = row[2];
        const itemRe = /<li\b[^>]*>[\s\S]*?<\/li>/g;
        let itemHtml = "";
        let itemMatch;
        while ((itemMatch = itemRe.exec(eventsHtml))) {
          if (visibleText(itemMatch[0]) === line) {
            itemHtml = itemMatch[0];
            break;
          }
        }
        const attrs = anchorAttrsFor(itemHtml, domain);
        const hrefMatch = /href="([^"]*)"/.exec(attrs);
        const foundHref = hrefMatch ? hrefMatch[1] : "";
        let host = "";
        try { host = new URL(foundHref).hostname; } catch (err) { host = ""; }
        const onDomain = foundHref.indexOf("https://") === 0 &&
          (host === domain || host.endsWith("." + domain));
        const lineAt = bodyText.indexOf(line);
        const lowerItem = itemHtml.toLowerCase();
        check(line + " appears once in /sources",
          occurrences(bodyText, line) === 1, String(occurrences(bodyText, line)));
        check(line + " sits in Event listings",
          eventsTextAt !== -1 && discoveryTextAt > eventsTextAt &&
          lineAt > eventsTextAt && lineAt < discoveryTextAt);
        check(line + " keeps its order in Event listings",
          lineAt > previousLineAt);
        previousLineAt = lineAt;
        check(domain + " links over https on that domain",
          onDomain && foundHref === href, foundHref);
        check(line + " has no endorsement wording",
          line.toLowerCase().indexOf("endorse") === -1 &&
          line.toLowerCase().indexOf("partner") === -1 &&
          line.toLowerCase().indexOf("official") === -1 &&
          lowerItem.indexOf("endorse") === -1 &&
          lowerItem.indexOf("partner") === -1 &&
          lowerItem.indexOf("official") === -1 &&
          lowerItem.indexOf("<img") === -1);
      });
      const springville = EVENT_INFO_LINES[11];
      check("Springville Museum of Art appears once with an https href on smofa.org",
        occurrences(bodyText, springville[0]) === 1 &&
        eventsText.indexOf(springville[0]) > eventsText.indexOf("Event info from Ogden Shakespeare Festival (ogdenshakesfest.org).") &&
        /href="https:\/\/(?:www\.)?smofa\.org\/"/.test(eventsHtml));
      const home = await request(server.address().port, "/");
      check("home loads the sources script and links Sources",
        home.status === 200 &&
        home.body.indexOf('src="data-sources.js"') !== -1 &&
        home.body.indexOf('data-action="sources"') !== -1 &&
        home.body.indexOf(NPS_NOTICE) !== -1);
    } finally {
      if (previous == null) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
      await new Promise(resolve => server.close(resolve));
    }
  }).then(() => section("migration 015", () => {
    const dir = path.join(__dirname, "..", "db", "migrations");
    const files = fs.readdirSync(dir).filter(name => name.endsWith(".sql")).sort();
    check("015 exists and 005 and 011 stay unused",
      files.indexOf("015_source_credit.sql") !== -1 &&
      files.every(name => name.indexOf("005_") !== 0 && name.indexOf("011_") !== 0),
      files.join(","));
    const sql = fs.readFileSync(path.join(dir, "015_source_credit.sql"), "utf8");
    check("columns are added only if missing",
      /alter table public\.activities add column if not exists source_key text/i.test(sql) &&
      /alter table public\.activities add column if not exists source_credit text/i.test(sql));
    check("constraints are idempotent",
      sql.indexOf("activities_source_key_check") !== -1 &&
      sql.indexOf("activities_source_credit_check") !== -1 &&
      (sql.match(/duplicate_object/g) || []).length >= 2);
    check("credit length stays within 500 and rejects control characters",
      sql.indexOf("char_length(source_credit) between 1 and 500") !== -1 &&
      sql.indexOf("[[:cntrl:]]") !== -1);
    check("RLS stays enabled and deny-all is repeated",
      /alter table public\.activities enable row level security/i.test(sql) &&
      /revoke all on table public\.activities from public/i.test(sql) &&
      /revoke all on table public\.activities from anon/i.test(sql) &&
      /revoke all on table public\.activities from authenticated/i.test(sql));
    check("the migration creates no policy and grants nothing",
      /create policy/i.test(sql) === false && /\bgrant\b/i.test(sql) === false);
    check("016 is the nearby index migration, 017 is place staging, and 018 is the cost-band migration",
      files.indexOf("016_nearby_keyset.sql") !== -1 &&
      files.indexOf("017_place_staging.sql") !== -1 &&
      files.indexOf("018_cost_bands_20.sql") !== -1);
  }));
}

module.exports = main().then(() => ({ pass: pass, fail: fail }));
