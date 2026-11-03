/* Dataset registry for the place loader. Credits are the legal lines, not
   the strings baked into the pull files. Future datasets are recorded so a
   later load has a row to point at. This module does not fetch anything. */
"use strict";

const CC_BY = "https://creativecommons.org/licenses/by/4.0/";
const UGRC_POLICY = "https://gis.utah.gov/documentation/policy/license/";
const UTAH_TERMS = "https://www.utah.gov/support/disclaimer.html";
const CC_BY_SEEN = "This work is licensed under a Creative Commons Attribution 4.0 International License.";

const UGRC_SOURCES =
  "Utah Geospatial Resource Center (UGRC), State Geographic Information Database (SGID). " +
  "Data Sources: UGRC SGID (data modified). Layers used: {list each layer title, linked to its dataset page}. " +
  "Licensed under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/). " +
  "Changes made by Jaderoo: records filtered to activity types, polygons and lines reduced to points, trail segments combined by trail name, fields renamed and reformatted, and our own short summaries added. " +
  "Neither UGRC nor the State of Utah endorses Jaderoo.";

const UGRC_DISCLAIMER =
  "The data, including but not limited to geographic data, tabular data, and analytical data, are provided \"as is\" and \"as available\", with no guarantees relating to the availability, completeness, or accuracy of data, and without any express or implied warranties. These data are provided as a public service for informational purposes only. You are solely responsible for obtaining the proper evaluation of a location and associated data by a qualified professional. UGRC reserves the right to change, revise, suspend or discontinue published data and services without notice at any time. Neither UGRC nor the State of Utah are responsible for any misuse or misrepresentation of the data. UGRC and the State of Utah are not obligated to provide you with any maintenance or support. The user assumes the entire risk as to the quality and performance of the data. You agree to hold the State of Utah harmless for any claims, liability, costs, and damages relating to your use of the data. You agree that your sole remedy for any dissatisfaction or claims is to discontinue use of the data.";

const GNIS_NOTICE =
  "GNIS place names originate from the U.S. Geological Survey Geographic Names Information System. Credit: U.S. Geological Survey.";

function ugrc(partial) {
  return Object.assign({
    owner: "Utah Geospatial Resource Center",
    licenseCode: "CC-BY-4.0",
    licenseUrl: CC_BY,
    creditUrl: partial.sourceUrl || null,
    sourcesPageText: UGRC_SOURCES,
    disclaimer: UGRC_DISCLAIMER,
    userCaution: null,
    legalRef: "Round 8 A",
    clearedOn: "2026-11-02",
    approvalStatus: "pending",
    autoPublish: false,
    refreshCadence: "monthly",
    licenseCheckedOn: "2026-11-02",
    licenseInfoSeen: CC_BY_SEEN,
    loadEnabled: false,
    excluded: false,
    exclusionReason: null,
    odbl: false,
    odblApproved: false,
    priority: 30,
    dedupeRadiusM: 500,
    centroidExempt: false,
    fieldAllowlist: [],
    npsPagesOnly: false,
    featureType: partial.featureType || "park"
  }, partial);
}

const DATASETS = [
  ugrc({
    datasetKey: "ugrc_parks",
    title: "Utah Parks Local",
    sourceUrl: "https://opendata.gis.utah.gov/datasets/818536733987486b8082e4c5dec0a1dd_0",
    creditUrl: "https://opendata.gis.utah.gov/datasets/818536733987486b8082e4c5dec0a1dd_0",
    creditLine: "Park data: Utah Parks Local, via UGRC, State Geographic Information Database (SGID), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Data modified: park areas reduced to approximate center points; proposed, planned and closed parks removed; fields selected, acreage rounded and reformatted.",
    legalRef: "Section 9 Q2",
    loadEnabled: true,
    priority: 30,
    featureType: "park",
    fileTest: function (name) { return /ugrc_parks|parks_local/i.test(name) && !/statepark/i.test(name); }
  }),
  ugrc({
    datasetKey: "ugrc_trailheads",
    title: "Utah Trailheads",
    sourceUrl: "https://opendata.gis.utah.gov/datasets/9c21cc1f95ba40468deb36bb6fd94943_0",
    creditUrl: "https://opendata.gis.utah.gov/datasets/9c21cc1f95ba40468deb36bb6fd94943_0",
    creditLine: "Trailhead data: Utah Trailheads, via UGRC, State Geographic Information Database (SGID), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Data modified: coordinates converted to latitude/longitude; fields selected and reformatted.",
    legalRef: "Section 9 Q1",
    loadEnabled: true,
    priority: 40,
    dedupeRadiusM: 500,
    centroidExempt: true,
    featureType: "trailhead",
    fileTest: function (name) { return /trailhead/i.test(name); }
  }),
  ugrc({
    datasetKey: "ugrc_monuments",
    title: "Utah Monuments and Markers",
    sourceUrl: "https://opendata.gis.utah.gov/datasets/63de4118823e4e3eba943ca43caefc72_0",
    creditLine: "Utah Monuments and Markers (Utah Division of State History), via UGRC SGID · CC BY 4.0 · data modified",
    featureType: "monument"
  }),
  ugrc({
    datasetKey: "ugrc_libraries",
    title: "Utah Public Libraries",
    sourceUrl: "https://opendata.gis.utah.gov/datasets/f6cf0c8ef65344b6a6e5ebeaa108f549_0",
    creditLine: "Utah Public Libraries (Utah State Library Division), via UGRC SGID · CC BY 4.0 · data modified",
    featureType: "library"
  }),
  ugrc({
    datasetKey: "ugrc_schools",
    title: "Utah Schools PreK to 12",
    sourceUrl: "https://opendata.gis.utah.gov/datasets/333206ff129346e3b8660e8f6f48540e_0",
    creditLine: "Utah Schools PreK to 12 (WFRC, Utah State Board of Education), via UGRC SGID · CC BY 4.0 · data modified",
    excluded: true,
    exclusionReason: "Schools PreK-12 are excluded by default. Jaderoo is an 18+ app and schools are not activities.",
    featureType: "school"
  }),
  ugrc({
    datasetKey: "ugrc_trails",
    title: "Utah Trails and Pathways",
    sourceUrl: "https://opendata.gis.utah.gov/datasets/3080c0a2859a4d23a279e17e17c703c8_0",
    creditLine: "Utah Trails and Pathways (UGRC, WFRC), via UGRC SGID · CC BY 4.0 · data modified",
    featureType: "trail"
  }),
  ugrc({
    datasetKey: "ugrc_gnis",
    title: "Utah GNIS Place Names",
    sourceUrl: "https://opendata.gis.utah.gov/datasets/153301fffc8a4128884833e2f7ee1d6e_0",
    creditLine: "Name and location: Utah GNIS Place Names (USGS GNIS), via UGRC SGID · CC BY 4.0 · data modified",
    sourcesPageText: UGRC_SOURCES + " " + GNIS_NOTICE,
    userCaution: "Check access and conditions before you go.",
    featureType: "gnis_place"
  }),
  {
    datasetKey: "museums",
    title: "Utah Museums Directory",
    owner: "Utah Division of Arts & Museums",
    licenseCode: "utah-gov-terms",
    licenseUrl: null,
    creditLine: "via Utah Division of Arts & Museums",
    creditUrl: "https://artsandmuseums.utah.gov/utah-museums-directory/",
    sourcesPageText: "Utah Museums Directory. Museum names, addresses and links come from the Utah Museums Directory published by the Utah Division of Arts & Museums, a division of the Utah Department of Cultural & Community Engagement (https://artsandmuseums.utah.gov/utah-museums-directory/). We list facts only and link to each listing. State information is provided \"as is\" under the Utah.gov Terms of Use (https://www.utah.gov/support/disclaimer.html). Jaderoo isn't affiliated with or endorsed by the Division or the listed museums.",
    disclaimer: null,
    userCaution: null,
    sourceUrl: "https://artsandmuseums.utah.gov/utah-museums-directory/",
    legalRef: "Section 9 Q6",
    clearedOn: "2026-11-01",
    approvalStatus: "pending",
    autoPublish: false,
    refreshCadence: "monthly",
    licenseCheckedOn: "2026-11-01",
    licenseInfoSeen: "No separate license page. utah.gov Terms of Use section 5; facts plus a link only.",
    loadEnabled: true,
    excluded: false,
    exclusionReason: null,
    odbl: false,
    odblApproved: false,
    priority: 50,
    dedupeRadiusM: 150,
    centroidExempt: false,
    fieldAllowlist: [],
    npsPagesOnly: false,
    featureType: "museum",
    fileTest: function (name) { return /museum/i.test(name) && !/statepark/i.test(name); }
  },
  {
    datasetKey: "stateparks",
    title: "Utah State Parks",
    owner: "Utah Division of State Parks",
    licenseCode: "utah-gov-terms",
    licenseUrl: null,
    creditLine: "via Utah State Parks",
    creditUrl: "https://stateparks.utah.gov/parks/",
    sourcesPageText: "Utah State Parks. Park names, locations and links come from the Utah Division of State Parks website (https://stateparks.utah.gov/). We list facts only, write our own descriptions, and link to each park's official page. We don't copy State Parks pages, photos or logos. State information is provided \"as is\" under the Utah.gov Terms of Use (https://www.utah.gov/support/disclaimer.html). Jaderoo isn't affiliated with or endorsed by Utah State Parks or the State of Utah. Check the park's official page for hours, fees and closures before you go.",
    disclaimer: null,
    userCaution: null,
    sourceUrl: "https://stateparks.utah.gov/parks/",
    legalRef: "Section 9 Q4",
    clearedOn: "2026-11-01",
    approvalStatus: "pending",
    autoPublish: false,
    refreshCadence: "monthly",
    licenseCheckedOn: "2026-11-01",
    licenseInfoSeen: "stateparks.utah.gov has no separate terms page. utah.gov Terms of Use section 5.",
    loadEnabled: true,
    excluded: false,
    exclusionReason: null,
    odbl: false,
    odblApproved: false,
    priority: 20,
    dedupeRadiusM: 500,
    centroidExempt: false,
    fieldAllowlist: [],
    npsPagesOnly: false,
    featureType: "park",
    fileTest: function (name) { return /statepark/i.test(name); }
  },
  {
    datasetKey: "nps",
    title: "NPS Utah units (nps.gov pages)",
    owner: "National Park Service",
    licenseCode: "US-Gov-PD",
    licenseUrl: null,
    creditLine: "via National Park Service (nps.gov)",
    creditUrl: "https://www.nps.gov/",
    sourcesPageText: "National Park Service. Names, locations and links for national park units in Utah come from nps.gov, a U.S. Department of the Interior website. No claim to original U.S. Government works. We don't use NPS photos or the NPS Arrowhead, and the National Park Service doesn't endorse Jaderoo. Check the park's nps.gov page for current conditions, alerts and closures.",
    disclaimer: "No claim to original U.S. Government works.",
    userCaution: null,
    sourceUrl: "https://www.nps.gov/",
    legalRef: "Section 9 Q5",
    clearedOn: "2026-11-01",
    approvalStatus: "pending",
    autoPublish: false,
    refreshCadence: "monthly",
    licenseCheckedOn: "2026-11-01",
    licenseInfoSeen: "NPS disclaimer: U.S. Government works; 17 U.S.C. 403 notice required for commercial use. Pages only, not the NPS API.",
    loadEnabled: true,
    excluded: false,
    exclusionReason: null,
    odbl: false,
    odblApproved: false,
    priority: 10,
    dedupeRadiusM: 500,
    centroidExempt: false,
    fieldAllowlist: [],
    npsPagesOnly: true,
    featureType: "park",
    fileTest: function (name) { return /(^|[^a-z])nps([^a-z]|$)/i.test(name); }
  },
  {
    datasetKey: "usfs",
    title: "USFS Recreation Opportunities",
    owner: "USDA Forest Service",
    licenseCode: "US-Gov-PD",
    licenseUrl: null,
    creditLine: "via USDA Forest Service",
    creditUrl: "https://www.fs.usda.gov/",
    sourcesPageText: "USDA Forest Service. Recreation site information from the U.S. Forest Service Recreation Opportunities dataset (Enterprise Data Warehouse), https://www.fs.usda.gov/. U.S. Government work. No claim to original U.S. Government works. Data may be incomplete or out of date; check with the managing forest before you go. Use of this data does not imply endorsement by the USDA Forest Service.",
    disclaimer: "No claim to original U.S. Government works.",
    userCaution: "check with the managing forest before you go.",
    sourceUrl: "https://www.fs.usda.gov/",
    legalRef: "Round 8 B",
    clearedOn: "2026-11-02",
    approvalStatus: "pending",
    autoPublish: false,
    refreshCadence: "monthly",
    licenseCheckedOn: "2026-11-02",
    licenseInfoSeen: "Published data is intended for public use and distribution. USDA Forest Service copyright text; public-domain federal work.",
    loadEnabled: false,
    excluded: false,
    exclusionReason: null,
    odbl: false,
    odblApproved: false,
    priority: 25,
    dedupeRadiusM: 500,
    centroidExempt: false,
    fieldAllowlist: [],
    npsPagesOnly: false,
    featureType: "campground"
  },
  {
    datasetKey: "blm",
    title: "BLM National Recreation Sites and Facilities",
    owner: "Bureau of Land Management",
    licenseCode: "US-Gov-PD",
    licenseUrl: null,
    creditLine: "via Bureau of Land Management",
    creditUrl: "https://www.blm.gov/programs/recreation",
    sourcesPageText: "Bureau of Land Management (BLM). Recreation site information from the BLM National Recreation Sites and Facilities map service (compiled by BLM from Recreation.gov's Recreation Information Database), https://www.blm.gov/programs/recreation. U.S. Government work. No claim to original U.S. Government works. Use of this data does not imply endorsement by the BLM or the U.S. Department of the Interior.",
    disclaimer: "No claim to original U.S. Government works.",
    userCaution: null,
    sourceUrl: "https://www.blm.gov/programs/recreation",
    legalRef: "Round 8 C",
    clearedOn: "2026-11-02",
    approvalStatus: "pending",
    autoPublish: false,
    refreshCadence: "monthly",
    licenseCheckedOn: "2026-11-02",
    licenseInfoSeen: "BLM service copyrightText: Bureau of Land Management (BLM), Headquarters (HQ). Federal work. No license text on the service.",
    loadEnabled: false,
    excluded: false,
    exclusionReason: null,
    odbl: false,
    odblApproved: false,
    priority: 25,
    dedupeRadiusM: 500,
    centroidExempt: false,
    fieldAllowlist: [],
    npsPagesOnly: false,
    featureType: "campground"
  },
  {
    datasetKey: "wikidata",
    title: "Wikidata",
    owner: "Wikimedia Foundation",
    licenseCode: "CC0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditLine: "via Wikidata",
    creditUrl: "https://www.wikidata.org",
    sourcesPageText: "Wikidata. Some place facts come from Wikidata (https://www.wikidata.org), whose structured data is available under Creative Commons CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/). Wikipedia articles we link to are separate works under their own licenses and are not copied here. Wikidata and Wikipedia are trademarks of the Wikimedia Foundation; Jaderoo is not affiliated with or endorsed by the Wikimedia Foundation.",
    disclaimer: null,
    userCaution: null,
    sourceUrl: "https://www.wikidata.org",
    legalRef: "Round 8 E",
    clearedOn: "2026-11-02",
    approvalStatus: "pending",
    autoPublish: false,
    refreshCadence: "monthly",
    licenseCheckedOn: "2026-11-02",
    licenseInfoSeen: "Wikidata structured data is CC0 1.0. Wikipedia text is not included.",
    loadEnabled: false,
    excluded: false,
    exclusionReason: null,
    odbl: false,
    odblApproved: false,
    priority: 70,
    dedupeRadiusM: 150,
    centroidExempt: false,
    fieldAllowlist: [],
    npsPagesOnly: false,
    featureType: "wikidata_place"
  },
  {
    datasetKey: "osm_osp",
    title: "UGRC Open Source Places",
    owner: "OpenStreetMap contributors",
    licenseCode: "ODbL",
    licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
    creditLine: "Place data © OpenStreetMap contributors (ODbL), via UGRC Open Source Places",
    creditUrl: "https://www.openstreetmap.org/copyright",
    sourcesPageText: "OpenStreetMap. Some place listings contain information from OpenStreetMap (© OpenStreetMap contributors, https://www.openstreetmap.org/copyright), made available through the Utah Geospatial Resource Center's \"Utah Open Source Places\" layer, and are made available under the Open Database License (ODbL) 1.0, https://opendatacommons.org/licenses/odbl/1-0/. Changes made by Jaderoo: filtered to activity categories, fields renamed and reformatted, our own short summaries added. A machine-readable copy of the OpenStreetMap-derived data we use, under the ODbL, is available on request at {contact email}. You can improve this data at https://www.openstreetmap.org.",
    disclaimer: null,
    userCaution: null,
    sourceUrl: "https://opendata.gis.utah.gov/datasets/45e25f4062264dc1baa3765e3dbb5d8e_0",
    legalRef: "Round 8 D",
    clearedOn: "2026-11-02",
    approvalStatus: "pending",
    autoPublish: false,
    refreshCadence: "monthly",
    licenseCheckedOn: "2026-11-02",
    licenseInfoSeen: "This data is derived from OpenStreetMap and carries the same license. ODbL 1.0.",
    loadEnabled: false,
    excluded: false,
    exclusionReason: null,
    odbl: true,
    odblApproved: false,
    priority: 60,
    dedupeRadiusM: 150,
    centroidExempt: false,
    fieldAllowlist: [],
    npsPagesOnly: false,
    featureType: "osm_place"
  }
];

/* Parks, trailheads, museums and campgrounds already have a non-OSM source,
   so an ODbL row of that type is refused statewide. */
const FEATURE_OWNERSHIP = [
  { featureType: "park", osmAllowed: false, ownerDataset: "ugrc_parks", notes: "Parks Local, state parks and NPS pages. No OSM parks." },
  { featureType: "trailhead", osmAllowed: false, ownerDataset: "ugrc_trailheads", notes: "UGRC trailheads. No OSM trailheads." },
  { featureType: "museum", osmAllowed: false, ownerDataset: "museums", notes: "Utah Museums Directory. No OSM museums." },
  { featureType: "campground", osmAllowed: false, ownerDataset: "usfs", notes: "USFS and BLM. No OSM campgrounds." }
];

const GENERIC_NAME = /^(park|ball park|sports park|public park|city park|open space|green space)$/i;

function datasetByKey(key) {
  for (let i = 0; i < DATASETS.length; i++) {
    if (DATASETS[i].datasetKey === key) return DATASETS[i];
  }
  return null;
}

function detectDatasetKey(filename) {
  const base = String(filename || "");
  const ordered = ["ugrc_trailheads", "stateparks", "museums", "nps", "ugrc_parks"];
  for (let i = 0; i < ordered.length; i++) {
    const dataset = datasetByKey(ordered[i]);
    if (dataset.fileTest && dataset.fileTest(base)) return dataset.datasetKey;
  }
  return null;
}

function assertCanLoad(dataset) {
  if (!dataset) {
    const err = new Error("unknown dataset");
    err.code = "unknown_dataset";
    throw err;
  }
  if (dataset.excluded) {
    const err = new Error("dataset " + dataset.datasetKey + " is excluded");
    err.code = "dataset_excluded";
    throw err;
  }
  if (!dataset.loadEnabled) {
    const err = new Error("dataset " + dataset.datasetKey + " is not enabled");
    err.code = "dataset_disabled";
    throw err;
  }
  if (!dataset.licenseCheckedOn || !dataset.licenseInfoSeen) {
    const err = new Error("dataset " + dataset.datasetKey + " has no license check");
    err.code = "license_check_required";
    throw err;
  }
  if (dataset.odbl && !dataset.odblApproved) {
    const err = new Error("dataset " + dataset.datasetKey + " is ODbL and Justin has not approved it");
    err.code = "odbl_not_approved";
    throw err;
  }
}

function osmFeatureAllowed(featureType) {
  for (let i = 0; i < FEATURE_OWNERSHIP.length; i++) {
    if (FEATURE_OWNERSHIP[i].featureType === featureType) return FEATURE_OWNERSHIP[i].osmAllowed === true;
  }
  return true;
}

function assertFeatureAllowed(dataset, featureType) {
  if (!dataset || !dataset.odbl) return;
  if (osmFeatureAllowed(featureType)) return;
  const err = new Error("refusing ODbL row for feature type " + featureType);
  err.code = "odbl_feature_conflict";
  throw err;
}

module.exports = {
  CC_BY: CC_BY,
  UGRC_POLICY: UGRC_POLICY,
  UTAH_TERMS: UTAH_TERMS,
  UGRC_DISCLAIMER: UGRC_DISCLAIMER,
  DATASETS: DATASETS,
  FEATURE_OWNERSHIP: FEATURE_OWNERSHIP,
  GENERIC_NAME: GENERIC_NAME,
  datasetByKey: datasetByKey,
  detectDatasetKey: detectDatasetKey,
  assertCanLoad: assertCanLoad,
  osmFeatureAllowed: osmFeatureAllowed,
  assertFeatureAllowed: assertFeatureAllowed
};
