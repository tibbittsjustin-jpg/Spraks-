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

  var TRAILHEAD_CREDIT = "Trailhead data: Utah Trailheads, via UGRC, State Geographic Information Database (SGID), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Data modified: coordinates converted to latitude/longitude; fields selected and reformatted.";
  var PARK_CREDIT = "Park data: Utah Parks Local, via UGRC, State Geographic Information Database (SGID), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Data modified: park areas reduced to approximate center points; proposed, planned and closed parks removed; fields selected, acreage rounded and reformatted.";

  var UGRC_HEADING = "Utah Trailheads and Utah Parks Local (UGRC)";
  var UGRC_LINES = [
    "Utah Trailheads and Utah Parks Local",
    "Data Sources: UGRC SGID (data modified).",
    "Source: Utah Geospatial Resource Center (UGRC, formerly AGRC), State Geographic Information Database (SGID). Datasets: Utah Trailheads (https://opendata.gis.utah.gov/datasets/9c21cc1f95ba40468deb36bb6fd94943_0) and Utah Parks Local (https://opendata.gis.utah.gov/datasets/818536733987486b8082e4c5dec0a1dd_0).",
    "License: Creative Commons Attribution 4.0 International (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/. UGRC license policy: https://gis.utah.gov/documentation/policy/license/.",
    "Changes we made: Utah Trailheads: coordinates converted to latitude/longitude; fields selected and reformatted. Utah Parks Local: park areas reduced to approximate center points; proposed, planned and closed parks removed; fields selected, acreage rounded and reformatted. We don't add any other information to these datasets.",
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

  // Older ingest text. Showing it would describe changes we do not make.
  var PREVIOUS_CREDITS = {};
  PREVIOUS_CREDITS["Trailhead data: Utah Trailheads, via UGRC, State Geographic Information Database (SGID), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Data modified: locations geocoded and reformatted."] = "ugrc_trailheads";
  PREVIOUS_CREDITS["Park data: Utah Parks Local, via UGRC, State Geographic Information Database (SGID), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Data modified: polygons reduced to center points and reformatted."] = "ugrc_parks";

  function entry(fields) {
    return fields;
  }

  var PLACE_ENTRIES = [
    entry({
      key: "ugrc_trailheads",
      group: "places",
      credit: TRAILHEAD_CREDIT,
      datasetUrl: TRAILHEAD_DATASET,
      note: CHECK_CONDITIONS
    }),
    entry({
      key: "ugrc_parks",
      group: "places",
      credit: PARK_CREDIT,
      datasetUrl: PARKS_DATASET,
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

  var ENTRIES = PLACE_ENTRIES.concat(listed(EVENT_CREDITS, "events"), listed(DISCOVERY, "discovery"), listed(MANUAL, "manual"));
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

  function creditView(idea) {
    var known = lookup(idea);
    var stored = cleanCredit(field(idea, "source_credit", "sourceCredit"));
    var page = itemUrl(idea);
    if (!known && !stored) return null;
    var credit = known ? known.credit : stored;
    var href = "";
    if (known && known.linkItem) href = page;
    else if (!known) href = page;
    var parts = linkParts(credit, href);
    var datasetHref = "";
    if (known && known.datasetUrl) datasetHref = page || known.datasetUrl;
    var sourcesHref = "/sources" + (known ? "#" + known.key : "");
    return {
      key: known ? known.key : "",
      credit: credit,
      parts: parts,
      sourcesHref: sourcesHref,
      datasetHref: datasetHref,
      note: known && known.note ? known.note : ""
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
    return html;
  }

  function paragraph(text) {
    return "<p>" + htmlForParts(linkParts(text, "")) + "</p>";
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
    html.push(paragraph(TRAILHEAD_CREDIT));
    html.push(paragraph(PARK_CREDIT));
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
