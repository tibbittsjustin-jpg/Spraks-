/* Source credits on cards and detail, the public Sources page,
   and migration 015. No database. Exact sentences are Legal's
   attribution quick reference, copied character for character. */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const sources = require("../public/data-sources");
const util = require("../public/util");
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
const NPS_PLACE_PAGES_LEAD = "National Park Service.";
const NPS_PLACE_PAGES = "National Park Service. Some park and monument locations come from National Park Service place pages on nps.gov, or from NPS-published public-domain datasets we have host-checked. Credit: National Park Service. No claim to original U.S. Government works. Locations are approximate. Features may be seasonal, permit-only, or closed, so check the park before you go. The National Park Service does not endorse Jaderoo.";
const NOV4K_EVENT_INFO_LINES = [
  "Event info from Sundance Mountain Resort (sundanceresort.com).",
  "Event info from Off Broadway Theatre (theobt.org).",
  "Event info from Utah Festival Opera & Musical Theatre (utahfestival.org).",
  "Event info from Kilby Court (kilbycourt.com).",
  "Event info from Red Butte Garden (redbuttegarden.org).",
  "Event info from Utah Shakespeare Festival (bard.org).",
  "Event info from Utah Olympic Legacy Foundation (utaholympiclegacy.org).",
  "Event info from Ogden Nature Center (ogdennaturecenter.org).",
  "Event info from Gardner Village (gardnervillage.com).",
  "Event info from Davis Arts Council (davisarts.org).",
  "Event info from Repertory Dance Theatre (rdtutah.org).",
  "Event info from Utah's Hogle Zoo (hoglezoo.org).",
  "Event info from Sugar Space (sugarspace.org).",
  "Event info from Sugar House Chamber (sugarhousechamber.org).",
  "Event info from Moab Music Festival (moabmusicfest.org).",
  "Event info from Park Silly Sunday Market (parksillysundaymarket.com).",
  "Event info from Ogden Twilight (ogdentwilight.com).",
  "Event info from Loveland Living Planet Aquarium (livingplanetaquarium.org)."
];
const NOV4M_EVENT_INFO_LINES = [
  "Event info from Roosevelt City (rooseveltcity.gov).",
  "Event info from Utah Division of Outdoor Recreation (recreation.utah.gov).",
  "Event info from Clinton City (clinton.utah.gov).",
  "Event info from HawkWatch International (hawkwatch.org).",
  "Event info from Alpine City (alpineut.gov)."
];
const NOV4O_EVENT_INFO_LINES = [
  ["Event info from Desert Star Playhouse (desertstarplayhouse.com).", "desertstarplayhouse.com", "https://desertstarplayhouse.com/"],
  ["Event info from The Cabaret at Wiseguys SLC (thecabaret-atwiseguysslc.seatengine-sites.com).", "thecabaret-atwiseguysslc.seatengine-sites.com", "https://thecabaret-atwiseguysslc.seatengine-sites.com/"],
  ["Event info from The Painted Peacock (thepaintedpeacock.art).", "thepaintedpeacock.art", "https://thepaintedpeacock.art/"],
  ["Event info from Sip and Vibe SLC (sipandvibeslc.com).", "sipandvibeslc.com", "https://sipandvibeslc.com/"],
  ["Event info from ComedyBox Utah (comedyboxutah.com).", "comedyboxutah.com", "https://comedyboxutah.com/"],
  ["Event info from Home Range Brewing (homerangebeer.com).", "homerangebeer.com", "https://homerangebeer.com/"],
  ["Event info from Moab Arts (moabarts.org).", "moabarts.org", "https://moabarts.org/"]
];
const NOV5ABC_NOV4E_EVENT_INFO_LINES = [
  ["Event info from Visit Beaver County (visitbeavercountyut.com).", "visitbeavercountyut.com", "https://visitbeavercountyut.com/"],
  ["Event info from Milford City (www.milfordcityutah.com).", "www.milfordcityutah.com", "https://www.milfordcityutah.com/"],
  ["Event info from Minersville Town (minersvilleut.gov).", "minersvilleut.gov", "https://minersvilleut.gov/"],
  ["Event info from Tremonton City (tremontoncity.lib.utah.gov).", "tremontoncity.lib.utah.gov", "https://tremontoncity.lib.utah.gov/"],
  ["Event info from Heritage Theatre Utah (www.heritagetheatreutah.com).", "www.heritagetheatreutah.com", "https://www.heritagetheatreutah.com/"],
  ["Event info from Utah State Parks (stateparks.utah.gov).", "stateparks.utah.gov", "https://stateparks.utah.gov/"],
  ["Event info from Panguitch City (panguitchutah.gov).", "panguitchutah.gov", "https://panguitchutah.gov/"],
  ["Event info from Cedar Valley Community Theatre (www.cvct.online).", "www.cvct.online", "https://www.cvct.online/"],
  ["Event info from Tooele Valley Theatre (www.tooelevalleytheatre.org).", "www.tooelevalleytheatre.org", "https://www.tooelevalleytheatre.org/"],
  ["Event info from Timpanogos Valley Theatre (timpvalleytheatre.com).", "timpvalleytheatre.com", "https://timpvalleytheatre.com/"],
  ["Event info from Once Upon a Time in America Museum (www.onceuponatimeinamericamuseum.com).", "www.onceuponatimeinamericamuseum.com", "https://www.onceuponatimeinamericamuseum.com/"],
  ["Event info from Bountiful Main Street (bountifulmainstreet.com).", "bountifulmainstreet.com", "https://bountifulmainstreet.com/"],
  ["Event info from Sevier Valley Center (richfield.snow.edu).", "richfield.snow.edu", "https://richfield.snow.edu/"],
  ["Event info from Richfield Area Chamber (richfieldareachamber.com).", "richfieldareachamber.com", "https://richfieldareachamber.com/"],
  ["Event info from Wild Peak Events (www.wildpeakevents.com).", "www.wildpeakevents.com", "https://www.wildpeakevents.com/"],
  ["Event info from Visit Emery County (visitemerycounty.com).", "visitemerycounty.com", "https://visitemerycounty.com/"],
  ["Event info from Emery County (emery.utah.gov).", "emery.utah.gov", "https://emery.utah.gov/"],
  ["Event info from Helper City (www.helpercity.gov).", "www.helpercity.gov", "https://www.helpercity.gov/"],
  ["Event info from Castle Dale City (www.visitcastledale.com).", "www.visitcastledale.com", "https://www.visitcastledale.com/"],
  ["Event info from Emery County Library System (lib.emerycounty.com).", "lib.emerycounty.com", "https://lib.emerycounty.com/"],
  ["Event info from Fairview Museum (www.fairviewmuseum.org).", "www.fairviewmuseum.org", "https://www.fairviewmuseum.org/"],
  ["Event info from Vernal Theatre (vernaltheatre.com).", "vernaltheatre.com", "https://vernaltheatre.com/"],
  ["Event info from Loa Town (loautah.gov).", "loautah.gov", "https://loautah.gov/"],
  ["Event info from Wayne County Fair (waynecountyutahfair.com).", "waynecountyutahfair.com", "https://waynecountyutahfair.com/"],
  ["Event info from Casino Star Theatre (www.casinostartheatre.com).", "www.casinostartheatre.com", "https://www.casinostartheatre.com/"],
  ["Event info from Juab County Fair (juabcountyfair.com).", "juabcountyfair.com", "https://juabcountyfair.com/"],
  ["Event info from Vernal Community Events (thisisvernal.trumba.com).", "thisisvernal.trumba.com", "https://thisisvernal.trumba.com/"],
  ["Event info from Museum of Uintah County (themuc.org).", "themuc.org", "https://themuc.org/"],
  ["Event info from Vernal Holly Days (www.communityhollydays.com).", "www.communityhollydays.com", "https://www.communityhollydays.com/"],
  ["Event info from Duchesne County Library (duchesnecounty.librarycalendar.com).", "duchesnecounty.librarycalendar.com", "https://duchesnecounty.librarycalendar.com/"],
  ["Event info from Daggett County (www.daggettcounty.gov).", "www.daggettcounty.gov", "https://www.daggettcounty.gov/"],
  ["Event info from Flaming Gorge Chamber (www.flaminggorge.com).", "www.flaminggorge.com", "https://www.flaminggorge.com/"],
  ["Event info from Morgan County Library (morgancounty.lib.utah.gov).", "morgancounty.lib.utah.gov", "https://morgancounty.lib.utah.gov/"],
  ["Event info from Bear Lake Valley CVB (bearlake.org).", "bearlake.org", "https://bearlake.org/"],
  ["Event info from Rich County (www.richcounty.gov).", "www.richcounty.gov", "https://www.richcounty.gov/"],
  ["Event info from Torrey Town (www.torreyutah.gov).", "www.torreyutah.gov", "https://www.torreyutah.gov/"],
  ["Event info from Marysvale Chamber (www.marysvaleutah.org).", "www.marysvaleutah.org", "https://www.marysvaleutah.org/"],
  ["Event info from Paiute ATV Jamboree (www.paiute-jam.com).", "www.paiute-jam.com", "https://www.paiute-jam.com/"],
  ["Event info from Uintah County Western Park (www.westernpark.org).", "www.westernpark.org", "https://www.westernpark.org/"],
  ["Event info from Escalante City (escalanteutah.gov).", "escalanteutah.gov", "https://escalanteutah.gov/"],
  ["Event info from Morgan County Fair (www.morgancountyfair.org).", "www.morgancountyfair.org", "https://www.morgancountyfair.org/"],
  ["Event info from Stellar Vista Observatory (stellarvistaobservatory.org).", "stellarvistaobservatory.org", "https://stellarvistaobservatory.org/public-star-parties/"],
  ["Event info from Cache Valley Astronomical Society (cvas-utahskies.org).", "cvas-utahskies.org", "https://cvas-utahskies.org/events/"]
];
const NOV5DEF_EVENT_INFO_LINES = [
  ["Event info from Arcade Galactic (arcadegalactic.com).", "arcadegalactic.com", "https://arcadegalactic.com/"],
  ["Event info from Artes de Mexico en Utah (www.artesmexut.org).", "www.artesmexut.org", "https://www.artesmexut.org/"],
  ["Event info from Aspen Chorale (aspenchorale.com).", "aspenchorale.com", "https://aspenchorale.com/"],
  ["Event info from Bountiful Davis Art Center (www.bdac.org).", "www.bdac.org", "https://www.bdac.org/"],
  ["Event info from Brian Head Town (brianheadtown.utah.gov).", "brianheadtown.utah.gov", "https://brianheadtown.utah.gov/"],
  ["Event info from Comfy Cozy Games (comfycozygames.com).", "comfycozygames.com", "https://comfycozygames.com/"],
  ["Event info from Cultural Arts Society of West Jordan (www.wjarts.org).", "www.wjarts.org", "https://www.wjarts.org/"],
  ["Event info from Downtown SLC Farmers Market (www.slcfarmersmarket.org).", "www.slcfarmersmarket.org", "https://www.slcfarmersmarket.org/"],
  ["Event info from Draper Philharmonic (www.draperphilharmonic.org).", "www.draperphilharmonic.org", "https://www.draperphilharmonic.org/"],
  ["Event info from Excellence in the Community concerts (excellenceconcerts.org).", "excellenceconcerts.org", "https://excellenceconcerts.org/"],
  ["Event info from Funk N Dive Bar live music (www.funkanddive.com).", "www.funkanddive.com", "https://www.funkanddive.com/"],
  ["Event info from Game Night Games (www.gamenightgames.com).", "www.gamenightgames.com", "https://www.gamenightgames.com/"],
  ["Event info from Golden Braid Books (www.goldenbraidslc.com).", "www.goldenbraidslc.com", "https://www.goldenbraidslc.com/"],
  ["Event info from Harp and Hound (harphound.com).", "harphound.com", "https://harphound.com/"],
  ["Event info from Kensington Theatre (kensingtontheatre.org).", "kensingtontheatre.org", "https://kensingtontheatre.org/"],
  ["Event info from Lila Studio (www.lilastudio.com).", "www.lilastudio.com", "https://www.lilastudio.com/"],
  ["Event info from Loki Coffee (www.lokicoffeeco.com).", "www.lokicoffeeco.com", "https://www.lokicoffeeco.com/"],
  ["Event info from Magna (magna.utah.gov).", "magna.utah.gov", "https://magna.utah.gov/"],
  ["Event info from Melancholy (www.melancholyslc.com).", "www.melancholyslc.com", "https://www.melancholyslc.com/"],
  ["Event info from Millcreek Common (millcreekcommon.org).", "millcreekcommon.org", "https://millcreekcommon.org/"],
  ["Event info from Millennial Choirs & Orchestras (www.millennial.org).", "www.millennial.org", "https://www.millennial.org/"],
  ["Event info from Mountain West Cider (www.mountainwestcider.com).", "www.mountainwestcider.com", "https://www.mountainwestcider.com/"],
  ["Event info from Mountaintop Music Institute (www.mountaintopmusicinstitute.com).", "www.mountaintopmusicinstitute.com", "https://www.mountaintopmusicinstitute.com/"],
  ["Event info from Offset Bier (offsetbier.com).", "offsetbier.com", "https://offsetbier.com/"],
  ["Event info from Oratorio Society of Utah (oratoriosocietyofutah.godaddysites.com).", "oratoriosocietyofutah.godaddysites.com", "https://oratoriosocietyofutah.godaddysites.com/"],
  ["Event info from Parker Theatre (www.parkertheatre.org).", "www.parkertheatre.org", "https://www.parkertheatre.org/"],
  ["Event info from Poppy Book & Gifts (www.poppybookssf.com).", "www.poppybookssf.com", "https://www.poppybookssf.com/"],
  ["Event info from Regency Christmas Market at Provo Towne Centre (www.provotownecentre.com).", "www.provotownecentre.com", "https://www.provotownecentre.com/"],
  ["Event info from SALT Contemporary Dance (saltdance.com).", "saltdance.com", "https://saltdance.com/"],
  ["Event info from Salt City Slam (www.saltcityslam.com).", "www.saltcityslam.com", "https://www.saltcityslam.com/"],
  ["Event info from Salt Lake Art Museum (saltlakeartmuseum.org).", "saltlakeartmuseum.org", "https://saltlakeartmuseum.org/"],
  ["Event info from Sandbox Theatre Company (www.sandboxtheatrecompany.org).", "www.sandboxtheatrecompany.org", "https://www.sandboxtheatrecompany.org/"],
  ["Event info from Scaffold Theatre (www.scaffoldtheatre.org).", "www.scaffoldtheatre.org", "https://www.scaffoldtheatre.org/"],
  ["Event info from Scion Cider Bar (www.scionciderbar.com).", "www.scionciderbar.com", "https://www.scionciderbar.com/"],
  ["Event info from Second Summit Cider (secondsummitcider.com).", "secondsummitcider.com", "https://secondsummitcider.com/"],
  ["Event info from Soundwell (soundwellslc.com).", "soundwellslc.com", "https://soundwellslc.com/"],
  ["Event info from TF Brewing (tfbrewing.com).", "tfbrewing.com", "https://tfbrewing.com/"],
  ["Event info from Talisman Brewing (talismanbrewingco.com).", "talismanbrewingco.com", "https://talismanbrewingco.com/"],
  ["Event info from Terrace Plaza Playhouse (www.terraceplazaplayhouse.com).", "www.terraceplazaplayhouse.com", "https://www.terraceplazaplayhouse.com/"],
  ["Event info from The Tasting Room SLC (www.tastingroomslc.com).", "www.tastingroomslc.com", "https://www.tastingroomslc.com/"],
  ["Event info from The Westerner Club (westernerclub.com).", "westernerclub.com", "https://westernerclub.com/"],
  ["Event info from Three Penny Theatre Company (www.threepennytheatre.com).", "www.threepennytheatre.com", "https://www.threepennytheatre.com/"],
  ["Event info from University Place Orem holiday (www.universityplaceorem.com).", "www.universityplaceorem.com", "https://www.universityplaceorem.com/"],
  ["Event info from Utah National Guard (guard.utah.gov).", "guard.utah.gov", "https://guard.utah.gov/"],
  ["Event info from Utah Valley Christkindlmarkt (www.uvchristkindlmarkt.com).", "www.uvchristkindlmarkt.com", "https://www.uvchristkindlmarkt.com/"],
  ["Event info from Utah Valley Symphony (www.utahvalleysymphony.org).", "www.utahvalleysymphony.org", "https://www.utahvalleysymphony.org/"],
  ["Event info from Wasatch Community Gardens Love Local Winter Market (wasatchgardens.org).", "wasatchgardens.org", "https://wasatchgardens.org/"],
  ["Event info from Wasatch Contemporary Dance Company (wasatchcontemporary.com).", "wasatchcontemporary.com", "https://wasatchcontemporary.com/"],
  ["Event info from Wasatch Theatre Company (wasatchtheatre.org).", "wasatchtheatre.org", "https://wasatchtheatre.org/"],
  ["Event info from West Valley Arts (wvcarts.org).", "wvcarts.org", "https://wvcarts.org/"]
];
const NOV5G_EVENT_INFO_LINES = [
  ["Event info from Alma Gallery upcoming (www.almaprovo.com).", "www.almaprovo.com", "https://www.almaprovo.com/"],
  ["Event info from Cache Valley Symphonic Society concerts (www.cachevalleysymphonicsociety.org).", "www.cachevalleysymphonicsociety.org", "https://www.cachevalleysymphonicsociety.org/"],
  ["Event info from David Ericson Fine Art current exhibition (www.davidericson-fineart.com).", "www.davidericson-fineart.com", "https://www.davidericson-fineart.com/"],
  ["Event info from Empress Theatre (www.empresstheatre.com).", "www.empresstheatre.com", "https://www.empresstheatre.com/"],
  ["Event info from Gallery MAR exhibition schedule (www.gallerymar.com).", "www.gallerymar.com", "https://www.gallerymar.com/"],
  ["Event info from Heber Valley Entertainment concerts (www.hebervalleyentertainment.com).", "www.hebervalleyentertainment.com", "https://www.hebervalleyentertainment.com/"],
  ["Event info from Hopebox Theatre (www.hopeboxtheatre.com).", "www.hopeboxtheatre.com", "https://www.hopeboxtheatre.com/"],
  ["Event info from Keys on Main (www.keysonmain.com).", "www.keysonmain.com", "https://www.keysonmain.com/"],
  ["Event info from Legacy Park (thelegacypark.com).", "thelegacypark.com", "https://thelegacypark.com/"],
  ["Event info from Lehi Silver Band concerts (www.lehiareamusic.org).", "www.lehiareamusic.org", "https://www.lehiareamusic.org/"],
  ["Event info from Masterpiece Live at The Hive (www.masterpiecelive.com).", "www.masterpiecelive.com", "https://www.masterpiecelive.com/"],
  ["Event info from Ogden Red Sled (ogdenptc.org).", "ogdenptc.org", "https://ogdenptc.org/"],
  ["Event info from Park City Institute (parkcitypa.org).", "parkcitypa.org", "https://parkcitypa.org/"],
  ["Event info from Payson Community Theatre (www.paysoncommunitytheatre.com).", "www.paysoncommunitytheatre.com", "https://www.paysoncommunitytheatre.com/"],
  ["Event info from Provo (provo.com).", "provo.com", "https://provo.com/"],
  ["Event info from Roam Wild Market Food Fest (roamwildmarket.com).", "roamwildmarket.com", "https://roamwildmarket.com/"],
  ["Event info from The Compass Gallery events (www.thecompassgallery.com).", "www.thecompassgallery.com", "https://www.thecompassgallery.com/"],
  ["Event info from The Gateway calendars (atthegateway.com).", "atthegateway.com", "https://atthegateway.com/"],
  ["Event info from Trash Moon Collective events (www.trashmooncollective.org).", "www.trashmooncollective.org", "https://www.trashmooncollective.org/"],
  ["Event info from Utah City events (utahcity.com).", "utahcity.com", "https://utahcity.com/"]
];
const NOV5HI_EVENT_INFO_LINES = [
  ["Event info from 2 Row Brewing (www.2rowbrewing.com).", "www.2rowbrewing.com", "https://www.2rowbrewing.com/"],
  ["Event info from Dixie Convention Center (dixiecenter.com).", "dixiecenter.com", "https://dixiecenter.com/"],
  ["Event info from Downtown Farmers Market St. George (downtownfarmerstg.com).", "downtownfarmerstg.com", "https://downtownfarmerstg.com/"],
  ["Event info from Ephraim Library (ephraim.lib.utah.gov).", "ephraim.lib.utah.gov", "https://ephraim.lib.utah.gov/"],
  ["Event info from Fairview City Library (fairviewcity.lib.utah.gov).", "fairviewcity.lib.utah.gov", "https://fairviewcity.lib.utah.gov/"],
  ["Event info from Four Seasons Theatre Company (fourseasonstheatre.org).", "fourseasonstheatre.org", "https://fourseasonstheatre.org/"],
  ["Event info from Fruit Heights City (www.fruitheights.gov).", "www.fruitheights.gov", "https://www.fruitheights.gov/"],
  ["Event info from Harrisville City (harrisvillecity.gov).", "harrisvillecity.gov", "https://harrisvillecity.gov/"],
  ["Event info from Hooper City (www.hoopercity.gov).", "www.hoopercity.gov", "https://www.hoopercity.gov/"],
  ["Event info from Hurricane Recreation (www.hurricanerecreation.com).", "www.hurricanerecreation.com", "https://www.hurricanerecreation.com/"],
  ["Event info from Ivins Arts Commission (www.ivinsartscommission.com).", "www.ivinsartscommission.com", "https://www.ivinsartscommission.com/"],
  ["Event info from Lake Point (lakepoint.gov).", "lakepoint.gov", "https://lakepoint.gov/"],
  ["Event info from Leeds Town (leeds.utah.gov).", "leeds.utah.gov", "https://leeds.utah.gov/"],
  ["Event info from Lewiston City (lewistonutah.gov).", "lewistonutah.gov", "https://lewistonutah.gov/"],
  ["Event info from Mendon Library (mendoncity.lib.utah.gov).", "mendoncity.lib.utah.gov", "https://mendoncity.lib.utah.gov/"],
  ["Event info from Millville City (millvilleut.gov).", "millvilleut.gov", "https://millvilleut.gov/"],
  ["Event info from Music Theatre West (www.musictheatrewest.org).", "www.musictheatrewest.org", "https://www.musictheatrewest.org/"],
  ["Event info from New Harmony Fire Association (newharmonyfire.org).", "newharmonyfire.org", "https://newharmonyfire.org/"],
  ["Event info from Nibley City (nibleycity.gov).", "nibleycity.gov", "https://nibleycity.gov/"],
  ["Event info from Ogden Musical Theatre (ogdenmusicaltheatre.org).", "ogdenmusicaltheatre.org", "https://ogdenmusicaltheatre.org/"],
  ["Event info from Old Barn Community Theatre (www.oldbarn.org).", "www.oldbarn.org", "https://www.oldbarn.org/"],
  ["Event info from On Pitch Performing Arts (onpitchperformingarts.com).", "onpitchperformingarts.com", "https://onpitchperformingarts.com/"],
  ["Event info from Smithfield Recreation (smithfieldrecreation.com).", "smithfieldrecreation.com", "https://smithfieldrecreation.com/"],
  ["Event info from South Weber City (southwebercity.gov).", "southwebercity.gov", "https://southwebercity.gov/"],
  ["Event info from Southern Utah Dickens Christmas Festival (www.dickenschristmasfestival.com).", "www.dickenschristmasfestival.com", "https://www.dickenschristmasfestival.com/"],
  ["Event info from Southwest Symphony (swsutah.org).", "swsutah.org", "https://swsutah.org/"],
  ["Event info from Stansbury Park (stansburypark.gov).", "stansburypark.gov", "https://stansburypark.gov/"],
  ["Event info from Stansbury Park Library (stansburypark.lib.utah.gov).", "stansburypark.lib.utah.gov", "https://stansburypark.lib.utah.gov/"],
  ["Event info from Sunset City (sunsetut.gov).", "sunsetut.gov", "https://sunsetut.gov/"],
  ["Event info from Tooele Downtown Alliance (www.downtowntooele.com).", "www.downtowntooele.com", "https://www.downtowntooele.com/"],
  ["Event info from Unicorn Theatre (www.unicorntheatre.net).", "www.unicorntheatre.net", "https://www.unicorntheatre.net/"],
  ["Event info from Utah Car Culture (utahcarculture.org).", "utahcarculture.org", "https://utahcarculture.org/"],
  ["Event info from Virgin Town (www.virgin.utah.gov).", "www.virgin.utah.gov", "https://www.virgin.utah.gov/"],
  ["Event info from Washington City (washingtonutah.gov).", "washingtonutah.gov", "https://washingtonutah.gov/"],
  ["Event info from Wellsville City (www.wellsvillecity.com).", "www.wellsvillecity.com", "https://www.wellsvillecity.com/"],
  ["Event info from West Bountiful City (wbcityut.gov).", "wbcityut.gov", "https://wbcityut.gov/"],
  ["Event info from Wolfdog Brewing (www.wolfdogbrewing.com).", "www.wolfdogbrewing.com", "https://www.wolfdogbrewing.com/"]
];
const NOV5J_EVENT_INFO_LINES = [
  ["Event info from American West Symphony & Chorus (www.americanwestsymphony.com).", "www.americanwestsymphony.com", "https://www.americanwestsymphony.com/"],
  ["Event info from Bout Time Pub & Grub Lehi (www.bouttimepub.com).", "www.bouttimepub.com", "https://www.bouttimepub.com/"],
  ["Event info from JG Art Gallery exhibitions (jgartgallery.com).", "jgartgallery.com", "https://jgartgallery.com/"],
  ["Event info from Logan Tabernacle (logantabernacle.com).", "logantabernacle.com", "https://logantabernacle.com/"],
  ["Event info from Lyceum Philharmonic Christmas (lyceumphilharmonic.com).", "lyceumphilharmonic.com", "https://lyceumphilharmonic.com/"],
  ["Event info from Sears Art Museum schedule (www.searsart.com).", "www.searsart.com", "https://www.searsart.com/"],
  ["Event info from Skyridge Theatre (skyridgetheatre.com).", "skyridgetheatre.com", "https://skyridgetheatre.com/"],
  ["Event info from SoJo Choral Arts / Seasons Chorale (www.sojochoralarts.org).", "www.sojochoralarts.org", "https://www.sojochoralarts.org/"],
  ["Event info from Wasatch Chorale performances (www.wasatchchorale.org).", "www.wasatchchorale.org", "https://www.wasatchchorale.org/"],
  ["Event info from West Jordan Symphony (www.westjordansymphony.org).", "www.westjordansymphony.org", "https://www.westjordansymphony.org/"]
];
const NOV5K_EVENT_INFO_LINES = [
  ["Event info from BalletNEXT (www.balletnext.org).", "www.balletnext.org", "https://www.balletnext.org/"],
  ["Event info from Beehive Bazaar (www.beehivebazaar.com).", "www.beehivebazaar.com", "https://www.beehivebazaar.com/"],
  ["Event info from Cache Valley Civic Ballet (www.cvcballet.org).", "www.cvcballet.org", "https://www.cvcballet.org/"],
  ["Event info from Christkindlmarkt SLC (www.christkindlmarkt-slc.com).", "www.christkindlmarkt-slc.com", "https://www.christkindlmarkt-slc.com/"],
  ["Event info from Creator's Collective Market (www.creatorscollectivemarket.com).", "www.creatorscollectivemarket.com", "https://www.creatorscollectivemarket.com/"],
  ["Event info from Crowdsourced Comedy (www.crowdsourcedlive.com).", "www.crowdsourcedlive.com", "https://www.crowdsourcedlive.com/"],
  ["Event info from Crystal Festival (crystalfestival.com).", "crystalfestival.com", "https://crystalfestival.com/"],
  ["Event info from En Pointe Ballet (enpointeballet.net).", "enpointeballet.net", "https://enpointeballet.net/"],
  ["Event info from Good4Life Markets (good4lifemarkets.com).", "good4lifemarkets.com", "https://good4lifemarkets.com/"],
  ["Event info from Harrington Center (www.harringtoncenter.org).", "www.harringtoncenter.org", "https://www.harringtoncenter.org/"],
  ["Event info from Improv Salt Lake (www.improvsaltlake.org).", "www.improvsaltlake.org", "https://www.improvsaltlake.org/"],
  ["Event info from Murray Theater (www.murraytix.com).", "www.murraytix.com", "https://www.murraytix.com/"],
  ["Event info from Odyssey Dance Theatre (odysseydance.com).", "odysseydance.com", "https://odysseydance.com/"],
  ["Event info from Payson Santaquin Area Chamber (www.paysonsantaquinarea.com).", "www.paysonsantaquinarea.com", "https://www.paysonsantaquinarea.com/"],
  ["Event info from Quick Wits (www.qwcomedy.com).", "www.qwcomedy.com", "https://www.qwcomedy.com/"],
  ["Event info from South Salt Lake Arts (sslarts.org).", "sslarts.org", "https://sslarts.org/"],
  ["Event info from The Antics Improv (theanticsimprov.com).", "theanticsimprov.com", "https://theanticsimprov.com/"],
  ["Event info from The Dinner Detective (www.thedinnerdetective.com).", "www.thedinnerdetective.com", "https://www.thedinnerdetective.com/"],
  ["Event info from Utah Festival Ballet (www.utahfestivalballet.com).", "www.utahfestivalballet.com", "https://www.utahfestivalballet.com/"],
  ["Event info from Utah Metropolitan Ballet (www.umballet.org).", "www.umballet.org", "https://www.umballet.org/"]
];
const NOV5L_EVENT_INFO_LINES = [
  ["Event info from Athena VII (athenavii.com).", "athenavii.com", "https://athenavii.com/"],
  ["Event info from Cantorum Chamber Choir (www.cantorumchamberchoir.org).", "www.cantorumchamberchoir.org", "https://www.cantorumchamberchoir.org/"],
  ["Event info from Club 90 (www.club90slc.com).", "www.club90slc.com", "https://www.club90slc.com/"],
  ["Event info from Explore Morgan (exploremorganutah.com).", "exploremorganutah.com", "https://exploremorganutah.com/"],
  ["Event info from FMASU (www.fmasu.com).", "www.fmasu.com", "https://www.fmasu.com/"],
  ["Event info from Kentros Arts (www.kentrosarts.com).", "www.kentrosarts.com", "https://www.kentrosarts.com/"],
  ["Event info from League of Utah Writers (www.leagueofutahwriters.org).", "www.leagueofutahwriters.org", "https://www.leagueofutahwriters.org/"],
  ["Event info from Park City Film (parkcityfilm.org).", "parkcityfilm.org", "https://parkcityfilm.org/"],
  ["Event info from Queen Bee Giftery (queenbeegiftery.com).", "queenbeegiftery.com", "https://queenbeegiftery.com/"],
  ["Event info from Red Rock Film Festival (www.redrockfilmfestival.com).", "www.redrockfilmfestival.com", "https://www.redrockfilmfestival.com/"],
  ["Event info from Salt Lake Chinese Choir (www.saltlakechinesechoir.com).", "www.saltlakechinesechoir.com", "https://www.saltlakechinesechoir.com/"],
  ["Event info from Serena Webb Dance Theater (www.serenawebb.org).", "www.serenawebb.org", "https://www.serenawebb.org/"],
  ["Event info from Signature Books (www.signaturebooks.com).", "www.signaturebooks.com", "https://www.signaturebooks.com/"],
  ["Event info from The Community Nutcracker (www.communitynutcracker.com).", "www.communitynutcracker.com", "https://www.communitynutcracker.com/"],
  ["Event info from The Romantics Archive (theromanticsarchive.com).", "theromanticsarchive.com", "https://theromanticsarchive.com/"]
];
const STORY_CROSSROADS_EVENT_INFO_LINES = [
  ["Event info from Story Crossroads (storycrossroads23.wildapricot.org).", "storycrossroads23.wildapricot.org", "https://storycrossroads23.wildapricot.org/"]
];
const NOV5M_EVENT_INFO_LINES = [
  ["Event info from Alpine Community Theater (alpinecommunitytheater.org).", "alpinecommunitytheater.org", "https://alpinecommunitytheater.org/"],
  ["Event info from Golden Spike Event Center (www.goldenspikeeventcenter.com).", "www.goldenspikeeventcenter.com", "https://www.goldenspikeeventcenter.com/"],
  ["Event info from Material Art Gallery (www.materialartgallery.com).", "www.materialartgallery.com", "https://www.materialartgallery.com/"],
  ["Event info from Modern West Fine Art (www.modernwestfineart.com).", "www.modernwestfineart.com", "https://www.modernwestfineart.com/"],
  ["Event info from Mountain West Chorale (mountainwestchorale.org).", "mountainwestchorale.org", "https://mountainwestchorale.org/"],
  ["Event info from Pickleville on Tour (www.picklevilleontour.com).", "www.picklevilleontour.com", "https://www.picklevilleontour.com/"],
  ["Event info from Salt Lake Choral Artists (saltlakechoralartists.org).", "saltlakechoralartists.org", "https://saltlakechoralartists.org/"],
  ["Event info from Star of Wonder (starofwonder.com).", "starofwonder.com", "https://starofwonder.com/"],
  ["Event info from Sterling Singers (sterlingsingers.org).", "sterlingsingers.org", "https://sterlingsingers.org/"],
  ["Event info from Sunset Farmers Markets (sunsetfarmersmarkets.com).", "sunsetfarmersmarkets.com", "https://sunsetfarmersmarkets.com/"],
  ["Event info from Utah Cultural Celebration Center (www.culturalcelebration.org).", "www.culturalcelebration.org", "https://www.culturalcelebration.org/"],
  ["Event info from UtahPresents (utahpresents.org).", "utahpresents.org", "https://utahpresents.org/"],
];
const NOV5N_EVENT_INFO_LINES = [
  ["Event info from Central Utah Ballet (centralutahballet.com).", "centralutahballet.com", "https://centralutahballet.com/"],
  ["Event info from Clark Historic Farm (www.clarkhistoricfarm.org).", "www.clarkhistoricfarm.org", "https://www.clarkhistoricfarm.org/"],
  ["Event info from Clytie Adams School of Ballet (clytieadams.com).", "clytieadams.com", "https://clytieadams.com/"],
  ["Event info from GENTRI (gentrimusic.com).", "gentrimusic.com", "https://gentrimusic.com/"],
  ["Event info from Habitat for Humanity Summit & Wasatch (www.habitat-utah.org).", "www.habitat-utah.org", "https://www.habitat-utah.org/"],
  ["Event info from Imagine Ballet Theatre (imagineballet.org).", "imagineballet.org", "https://imagineballet.org/"],
  ["Event info from Lux Choral Society (www.luxchoralsociety.org).", "www.luxchoralsociety.org", "https://www.luxchoralsociety.org/"],
  ["Event info from Mountain West Ballet (www.mountainwestballet.org).", "www.mountainwestballet.org", "https://www.mountainwestballet.org/"],
  ["Event info from New American Philharmonic (newamericanphil.org).", "newamericanphil.org", "https://newamericanphil.org/"],
  ["Event info from Ogden City (christmasvillage.ogdencity.com).", "christmasvillage.ogdencity.com", "https://christmasvillage.ogdencity.com/"],
  ["Event info from Peter Breinholt (peterbreinholt.com).", "peterbreinholt.com", "https://peterbreinholt.com/"],
  ["Event info from Tanner Dance (tannerdance.utah.edu).", "tannerdance.utah.edu", "https://tannerdance.utah.edu/"],
];
const NOV5O_EVENT_INFO_LINES = [
  ["Event info from Fisher Art Market (www.fisherartmarket.com).", "www.fisherartmarket.com", "https://www.fisherartmarket.com/"],
  ["Event info from La Verkin Winterfest (laverkinwinterfest.com).", "laverkinwinterfest.com", "https://laverkinwinterfest.com/"],
  ["Event info from Midway Mercantile (www.midwaymercantile.com).", "www.midwaymercantile.com", "https://www.midwaymercantile.com/"],
  ["Event info from OneAnime (oneanime.org).", "oneanime.org", "https://oneanime.org/"],
  ["Event info from Punk Rock Pinball (punkrockpinball.com).", "punkrockpinball.com", "https://punkrockpinball.com/"],
  ["Event info from Rape Recovery Center (www.raperecoverycenter.org).", "www.raperecoverycenter.org", "https://www.raperecoverycenter.org/"],
  ["Event info from Riverhorse on Main (www.riverhorseparkcity.com).", "www.riverhorseparkcity.com", "https://www.riverhorseparkcity.com/"],
  ["Event info from Sky SLC (skyslc.com).", "skyslc.com", "https://skyslc.com/"],
  ["Event info from St. George Brewing (stgbeer.com).", "stgbeer.com", "https://stgbeer.com/"],
  ["Event info from Women's Wine Hiking Society (winehikingsociety.com).", "winehikingsociety.com", "https://winehikingsociety.com/"],
];
const NOV5P_EVENT_INFO_LINES = [
  ["Event info from Alpine Luminaires (alpinelights.org).", "alpinelights.org", "https://alpinelights.org/"],
  ["Event info from Canyons Village Management Association (cvma.com).", "cvma.com", "https://cvma.com/"],
  ["Event info from Cedar City Community Band (www.cedarcitycommunityband.org).", "www.cedarcitycommunityband.org", "https://www.cedarcitycommunityband.org/"],
  ["Event info from Helper Library (helper.lib.utah.gov).", "helper.lib.utah.gov", "https://helper.lib.utah.gov/"],
  ["Event info from McQuarrie Memorial Pioneer Museum (www.dupstgeorge.org).", "www.dupstgeorge.org", "https://www.dupstgeorge.org/"],
  ["Event info from Monticello City (www.monticelloutah.org).", "www.monticelloutah.org", "https://www.monticelloutah.org/"],
  ["Event info from Murray City Library (murraylibraryut.libnet.info).", "murraylibraryut.libnet.info", "https://murraylibraryut.libnet.info/"],
  ["Event info from Murray Concert Band (murrayconcertband.org).", "murrayconcertband.org", "https://murrayconcertband.org/"],
  ["Event info from Newton Library (newton.lib.utah.gov).", "newton.lib.utah.gov", "https://newton.lib.utah.gov/"],
  ["Event info from U of U School of Music (music.utah.edu).", "music.utah.edu", "https://music.utah.edu/"],
  ["Event info from U of U Student Affairs (studentaffairs.utah.edu).", "studentaffairs.utah.edu", "https://studentaffairs.utah.edu/"],
  ["Event info from Utah Valley Interfaith Choirs (utahvalleyinterfaithchoir.org).", "utahvalleyinterfaithchoir.org", "https://utahvalleyinterfaithchoir.org/"],
  ["Event info from West Jordan Community Band (westjordancommunityband.com).", "westjordancommunityband.com", "https://westjordancommunityband.com/"],
  ["Event info from West Valley Symphony (westvalleysymphonyutah.org).", "westvalleysymphonyutah.org", "https://westvalleysymphonyutah.org/"]
];
const NOV5Q_EVENT_INFO_LINES = [
  ["Event info from Alchemy Coffee (alchemycoffee.com).", "alchemycoffee.com", "https://alchemycoffee.com/"],
  ["Event info from Herriman High School Theatre (www.herrimantheatre.com).", "www.herrimantheatre.com", "https://www.herrimantheatre.com/"],
  ["Event info from Provo High School (provohigh.provo.edu).", "provohigh.provo.edu", "https://provohigh.provo.edu/"],
  ["Event info from Urban Indian Center (uicsl.org).", "uicsl.org", "https://uicsl.org/"],
  ["Event info from Viewmont High School (vhs.davis.k12.ut.us).", "vhs.davis.k12.ut.us", "https://vhs.davis.k12.ut.us/"]
];
const NOV5R_EVENT_INFO_LINES = [
  ["Event info from Arts & Music at the Madeleine (cotm-music.weebly.com).", "cotm-music.weebly.com", "https://cotm-music.weebly.com/"],
  ["Event info from Christ United Methodist Church (www.christumcutah.org).", "www.christumcutah.org", "https://www.christumcutah.org/"],
  ["Event info from Eccles Organ Festival (ecclesorganfestival.weebly.com).", "ecclesorganfestival.weebly.com", "https://ecclesorganfestival.weebly.com/"],
  ["Event info from Extra Kitsch (extrakitsch.com).", "extrakitsch.com", "https://extrakitsch.com/"],
  ["Event info from Salt Lake Children's Choir (childrensing.org).", "childrensing.org", "https://childrensing.org/"],
  ["Event info from Tan Van Comedy (tanvancomedy.com).", "tanvancomedy.com", "https://tanvancomedy.com/"],
  ["Event info from The Ballpark at America First Square (www.theballparkatafs.com).", "www.theballparkatafs.com", "https://www.theballparkatafs.com/"],
  ["Event info from The Pearl On Main (thepearlonmain.com).", "thepearlonmain.com", "https://thepearlonmain.com/"],
  ["Event info from UTCH (www.utch.org).", "www.utch.org", "https://www.utch.org/"],
  ["Event info from Utah State Capitol (utahstatecapitol.utah.gov).", "utahstatecapitol.utah.gov", "https://utahstatecapitol.utah.gov/"]
];
const NOV5S_EVENT_INFO_LINES = [
  ["Event info from CromaTCG (cromatcg.com).", "cromatcg.com", "https://cromatcg.com/"],
  ["Event info from Goose Games SLC (goosegamesslc.com).", "goosegamesslc.com", "https://goosegamesslc.com/"],
  ["Event info from Salt City Games (saltcitygames.shop).", "saltcitygames.shop", "https://saltcitygames.shop/"],
  ["Event info from Tailgate Tavern (www.tailgatetavernslc.com).", "www.tailgatetavernslc.com", "https://www.tailgatetavernslc.com/"],
  ["Event info from Tavernacle (www.tavernacle.com).", "www.tavernacle.com", "https://www.tavernacle.com/"],
  ["Event info from Terracotta Tortoise Clay Center (terracottatortoise.com).", "terracottatortoise.com", "https://terracottatortoise.com/"],
  ["Event info from The Clay Hole (theclayhole.com).", "theclayhole.com", "https://theclayhole.com/"],
  ["Event info from Throw Art Studio (www.throwartstudios.app).", "www.throwartstudios.app", "https://www.throwartstudios.app/"]
];
const NOV5T_EVENT_INFO_LINES = [
  ["Event info from 801TAG (www.801tag.com).", "www.801tag.com", "https://www.801tag.com/"],
  ["Event info from Airborne Lindon (airbornelindon.com).", "airbornelindon.com", "https://airbornelindon.com/"],
  ["Event info from Hostlers Model Railroad Club (hostlerspres6589.wildapricot.org).", "hostlerspres6589.wildapricot.org", "https://hostlerspres6589.wildapricot.org/"],
  ["Event info from Meldrum Christmas Tree Farm (utahchristmastreefarm.weebly.com).", "utahchristmastreefarm.weebly.com", "https://utahchristmastreefarm.weebly.com/"],
  ["Event info from Sparetime Lanes (sparetimelanes.com).", "sparetimelanes.com", "https://sparetimelanes.com/"],
  ["Event info from The wAIRhouse (thewairhouse.com).", "thewairhouse.com", "https://thewairhouse.com/"],
  ["Event info from Urban Flea Market (www.fleamarketslc.com).", "www.fleamarketslc.com", "https://www.fleamarketslc.com/"],
  ["Event info from Valley Bowling Lanes (www.valleybowlinglanesutah.com).", "www.valleybowlinglanesutah.com", "https://www.valleybowlinglanesutah.com/"]
];
const NOV5U_EVENT_INFO_LINES = [
  ["Event info from Cactus & Tropicals (cactusandtropicals.com).", "cactusandtropicals.com", "https://cactusandtropicals.com/"],
  ["Event info from Farmers Market Ogden (farmersmarketogden.com).", "farmersmarketogden.com", "https://farmersmarketogden.com/"],
  ["Event info from Humane Society of Utah (utahhumane.org).", "utahhumane.org", "https://utahhumane.org/"],
  ["Event info from Nuzzles & Co (nuzzlesandco.org).", "nuzzlesandco.org", "https://nuzzlesandco.org/"],
  ["Event info from United Way of Utah County (volunteer.unitedwayuc.org).", "volunteer.unitedwayuc.org", "https://volunteer.unitedwayuc.org/"]
];
const NOV5V_EVENT_INFO_LINES = [
  ["Event info from Alliance Française SLC (www.afslc-ut.org).", "www.afslc-ut.org", "https://www.afslc-ut.org/"],
  ["Event info from Ascent Chorus (ascentchorus.org).", "ascentchorus.org", "https://ascentchorus.org/"],
  ["Event info from Ballroom Utah (ballroomutah.com).", "ballroomutah.com", "https://ballroomutah.com/"],
  ["Event info from Cottonwood Heights Parks & Rec (www.chparksandrecut.gov).", "www.chparksandrecut.gov", "https://www.chparksandrecut.gov/"],
  ["Event info from Country Dance Provo (utahcountrydance.com).", "utahcountrydance.com", "https://utahcountrydance.com/"],
  ["Event info from Huston Holiday Light Show (herrimanlights.com).", "herrimanlights.com", "https://herrimanlights.com/"],
  ["Event info from Jubilate Choir (jubilatechoirslc.weebly.com).", "jubilatechoirslc.weebly.com", "https://jubilatechoirslc.weebly.com/"],
  ["Event info from Lieto Voices (www.lietovoices.com).", "www.lietovoices.com", "https://www.lietovoices.com/"],
  ["Event info from Lightwalk at Tracy Aviary (www.lightwalkslc.com).", "www.lightwalkslc.com", "https://www.lightwalkslc.com/"],
  ["Event info from Provo Pioneer Village (www.provopioneervillage.org).", "www.provopioneervillage.org", "https://www.provopioneervillage.org/"],
  ["Event info from Salt Lake City Chess Club (saltlakecitychessclub.com).", "saltlakecitychessclub.com", "https://saltlakecitychessclub.com/"],
  ["Event info from Southern Utah Heritage Choir (www.heritagechoir.org).", "www.heritagechoir.org", "https://www.heritagechoir.org/"],
  ["Event info from Utah Orchid Society (utahorchidsociety.org).", "utahorchidsociety.org", "https://utahorchidsociety.org/"],
  ["Event info from Utah Valley Quilt Guild (www.uvqg.org).", "www.uvqg.org", "https://www.uvqg.org/"],
  ["Event info from theFINDlab (thefindlab.com).", "thefindlab.com", "https://thefindlab.com/"]
];
const NOV5W_EVENT_INFO_LINES = [
  ["Event info from Epic Brewing (epicbrewing.com).", "epicbrewing.com", "https://epicbrewing.com/"],
  ["Event info from Rabbit's Foot (rabbitsfootbrewing.com).", "rabbitsfootbrewing.com", "https://rabbitsfootbrewing.com/"],
  ["Event info from Utah Queer Film Festival (utahqueerfilmfestival.org).", "utahqueerfilmfestival.org", "https://utahqueerfilmfestival.org/"],
  ["Event info from Washington City Arts Council (washingtoncityartscouncil.com).", "washingtoncityartscouncil.com", "https://washingtoncityartscouncil.com/"]
];
const NOV5X_EVENT_INFO_LINES = [
  ["Event info from Club Pickleball USA (clubpickleballusa.com).", "clubpickleballusa.com", "https://clubpickleballusa.com/"],
  ["Event info from Salt City Smithery (saltcitysmithery.com).", "saltcitysmithery.com", "https://saltcitysmithery.com/"],
  ["Event info from Salt Lake Weaving Studio (www.slweavingstudio.org).", "www.slweavingstudio.org", "https://www.slweavingstudio.org/"],
  ["Event info from Sleep in Heavenly Peace UT-Salt Lake (shpbeds.org).", "shpbeds.org", "https://shpbeds.org/"],
  ["Event info from Snowpine Lodge (www.snowpine.com).", "www.snowpine.com", "https://www.snowpine.com/"],
  ["Event info from USTA Utah (www.utahtennis.com).", "www.utahtennis.com", "https://www.utahtennis.com/"],
  ["Event info from Woodcraft of Salt Lake City (www.woodcraft.com).", "www.woodcraft.com", "https://www.woodcraft.com/"]
];
const NOV5Y_EVENT_INFO_LINES = [
  ["Event info from Arthritis Foundation (events.arthritis.org).", "events.arthritis.org", "https://events.arthritis.org/"],
  ["Event info from Mad Moose Events (www.madmooseevents.com).", "www.madmooseevents.com", "https://www.madmooseevents.com/"],
  ["Event info from Moab Trail Marathon (moabtrailmarathon.com).", "moabtrailmarathon.com", "https://moabtrailmarathon.com/"],
  ["Event info from Salt Lake Running Co. (slrc.com).", "slrc.com", "https://slrc.com/"]
];
const NOV5Z_EVENT_INFO_LINES = [
  ["Event info from Alta Community Enrichment (altacommunity.org).", "altacommunity.org", "https://altacommunity.org/"],
  ["Event info from Bad Dog Arts (www.baddogarts.org).", "www.baddogarts.org", "https://www.baddogarts.org/"],
  ["Event info from Glass With A Past (glasswithapast.com).", "glasswithapast.com", "https://glasswithapast.com/"],
  ["Event info from Midvale Arts (www.midvalearts.com).", "www.midvalearts.com", "https://www.midvalearts.com/"],
  ["Event info from Mooon Bread (mooonbread.com).", "mooonbread.com", "https://mooonbread.com/"],
  ["Event info from Salt Lake Climbers Alliance (www.saltlakeclimbers.org).", "www.saltlakeclimbers.org", "https://www.saltlakeclimbers.org/"],
  ["Event info from The Hive Collaborative (www.thehivecollaborative.com).", "www.thehivecollaborative.com", "https://www.thehivecollaborative.com/"],
  ["Event info from The Prestige Salt Lake (prestigesaltlake.com).", "prestigesaltlake.com", "https://prestigesaltlake.com/"],
  ["Event info from The Scratch Pad (www.climbthescratchpad.com).", "www.climbthescratchpad.com", "https://www.climbthescratchpad.com/"],
  ["Event info from The Westerner (westernerslc.com).", "westernerslc.com", "https://westernerslc.com/"]
];
const NOV5AA_EVENT_INFO_LINES = [
  ["Event info from CUMC Holiday Boutique (www.cumcholidayboutique.com).", "www.cumcholidayboutique.com", "https://www.cumcholidayboutique.com/"],
  ["Event info from Chamber Music Society of SLC (cmsofslc.org).", "cmsofslc.org", "https://cmsofslc.org/"],
  ["Event info from Earn Your Turkey Run (earnyourturkey.com).", "earnyourturkey.com", "https://earnyourturkey.com/"],
  ["Event info from Great Salt Lake Audubon (greatsaltlakeaudubon.org).", "greatsaltlakeaudubon.org", "https://greatsaltlakeaudubon.org/"],
  ["Event info from NOVA Chamber Music (www.novaslc.org).", "www.novaslc.org", "https://www.novaslc.org/"],
  ["Event info from Park City Treble Makers (parkcitytreblemakers.org).", "parkcitytreblemakers.org", "https://parkcitytreblemakers.org/"],
  ["Event info from Red Cliffs Audubon (www.redcliffsaudubon.org).", "www.redcliffsaudubon.org", "https://www.redcliffsaudubon.org/"],
  ["Event info from Runtastic (runtasticevents.com).", "runtasticevents.com", "https://runtasticevents.com/"],
  ["Event info from Shepherd of the Hills UMC (shumcstgeorge.com).", "shumcstgeorge.com", "https://shumcstgeorge.com/"],
  ["Event info from Sonrise Christian Church (sonrisechurch.net).", "sonrisechurch.net", "https://sonrisechurch.net/"],
  ["Event info from Speak For Yourself Open Mic (speakforyourselfopenmic.wordpress.com).", "speakforyourselfopenmic.wordpress.com", "https://speakforyourselfopenmic.wordpress.com/"],
  ["Event info from Square Talk Utah (utsquaredance.org).", "utsquaredance.org", "https://utsquaredance.org/"],
  ["Event info from The Bayou (www.utahbayou.com).", "www.utahbayou.com", "https://www.utahbayou.com/"],
  ["Event info from The L.A.B. (www.thelabutah.com).", "www.thelabutah.com", "https://www.thelabutah.com/"],
  ["Event info from Wasatch Trails Foundation (www.wasatchtrails.org).", "www.wasatchtrails.org", "https://www.wasatchtrails.org/"],
  ["Event info from Utah Global Diplomacy (www.utahglobaldiplomacy.org).", "www.utahglobaldiplomacy.org", "https://www.utahglobaldiplomacy.org/"]
];
const NOV9A_EVENT_INFO_LINES = [
  ["Event info from Color Me Mine Salt Lake City (saltlakecity.colormemine.com).", "saltlakecity.colormemine.com", "https://saltlakecity.colormemine.com/"],
  ["Event info from Salt Lake Family Christmas Gift Show (www.familychristmasgiftshow.com).", "www.familychristmasgiftshow.com", "https://www.familychristmasgiftshow.com/"],
  ["Event info from Climb Moab Gym (www.climbmoabgym.com).", "www.climbmoabgym.com", "https://www.climbmoabgym.com/"],
  ["Event info from Crazy Daisy (www.crazydaisypro.com).", "www.crazydaisypro.com", "https://www.crazydaisypro.com/"],
  ["Event info from Wild Thistle Market (www.wildthistlemarket.com).", "www.wildthistlemarket.com", "https://www.wildthistlemarket.com/"],
  ["Event info from SLC TCG (slctcg.com).", "slctcg.com", "https://slctcg.com/"],
  ["Event info from IJ & Jeanné Wagner JCC (www.slcjcc.org).", "www.slcjcc.org", "https://www.slcjcc.org/"],
  ["Event info from Northern Utah USBC (www.nuusbca.com).", "www.nuusbca.com", "https://www.nuusbca.com/"],
  ["Event info from Anderson's Seed & Garden (andersonseedandgarden.com).", "andersonseedandgarden.com", "https://andersonseedandgarden.com/"],
  ["Event info from 7 Sins Cocktail Bar (7sinsutah.com).", "7sinsutah.com", "https://7sinsutah.com/"],
  ["Event info from Moab BASE Association (moab.baseaccess.org).", "moab.baseaccess.org", "https://moab.baseaccess.org/"],
  ["Event info from DANCE TO UPLIFT (www.dancetouplift.com).", "www.dancetouplift.com", "https://www.dancetouplift.com/"]
];
const NOV9B_EVENT_INFO_LINES = [
  ["Event info from Sport City Utah (www.sportcityutah.com).", "www.sportcityutah.com", "https://www.sportcityutah.com/"],
  ["Event info from Rock Climbing Utah (rockclimbingutah.com).", "rockclimbingutah.com", "https://rockclimbingutah.com/"],
  ["Event info from U4WDA (u4wda.org).", "u4wda.org", "https://u4wda.org/"],
  ["Event info from Outlaw Saloon (outlawsaloon.com).", "outlawsaloon.com", "https://outlawsaloon.com/"],
  ["Event info from Red Rock 4-Wheelers (rr4w.com).", "rr4w.com", "https://rr4w.com/"],
  ["Event info from X-Golf Riverton (www.xgolfriverton.com).", "www.xgolfriverton.com", "https://www.xgolfriverton.com/"]
];
const NOV9C_EVENT_INFO_LINES = [
  ["Event info from Alpine Community Library (www.alpinelibrary.org).", "www.alpinelibrary.org", "https://www.alpinelibrary.org/"],
  ["Event info from A Bar Named Sue (www.abarnamedsue.com).", "www.abarnamedsue.com", "https://www.abarnamedsue.com/"],
  ["Event info from Bella Rosa Pottery (www.bellarosapottery.com).", "www.bellarosapottery.com", "https://www.bellarosapottery.com/"],
  ["Event info from Bears Ears Partnership (bearsearspartnership.org).", "bearsearspartnership.org", "https://bearsearspartnership.org/"],
  ["Event info from Yoga Barn Utah (www.yogabarnutah.com).", "www.yogabarnutah.com", "https://www.yogabarnutah.com/"],
  ["Event info from Wasatch Fly Fisher (wasatchflyfisher.com).", "wasatchflyfisher.com", "https://wasatchflyfisher.com/"],
  ["Event info from The Green Pig Pub (thegreenpigpub.com).", "thegreenpigpub.com", "https://thegreenpigpub.com/"],
  ["Event info from Our Mahjong Table (ourmahjongtable.com).", "ourmahjongtable.com", "https://ourmahjongtable.com/"],
  ["Event info from Trees for Charity (www.treesforcharity.com).", "www.treesforcharity.com", "https://www.treesforcharity.com/"],
  ["Event info from Thieves Guild Cidery (www.thievesguildcidery.com).", "www.thievesguildcidery.com", "https://www.thievesguildcidery.com/"],
  ["Event info from KJ's Ice Barn (kjsicebarn.org).", "kjsicebarn.org", "https://kjsicebarn.org/"]
];
const NOV9D_EVENT_INFO_LINES = [
  ["Event info from Crush Golf & Grill (crushgolfandgrill.com).", "crushgolfandgrill.com", "https://crushgolfandgrill.com/"],
  ["Event info from Nomad Eatery (nomad-eatery.com).", "nomad-eatery.com", "https://nomad-eatery.com/"],
  ["Event info from Promise South Salt Lake (promise.sslc.gov).", "promise.sslc.gov", "https://promise.sslc.gov/"],
  ["Event info from America First Square (www.americafirstsquare.com).", "www.americafirstsquare.com", "https://www.americafirstsquare.com/"],
  ["Event info from Woodsy Art Cafe (www.woodsyartcafe.com).", "www.woodsyartcafe.com", "https://www.woodsyartcafe.com/"],
  ["Event info from La Caille (www.lacaille.com).", "www.lacaille.com", "https://www.lacaille.com/"],
  ["Event info from America250 Utah (america250.utah.gov).", "america250.utah.gov", "https://america250.utah.gov/"],
  ["Event info from Utah Energy Healing Center (www.utahenergyhealingcenter.com).", "www.utahenergyhealingcenter.com", "https://www.utahenergyhealingcenter.com/"],
  ["Event info from Joaby Parker (www.joabyparker.com).", "www.joabyparker.com", "https://www.joabyparker.com/"],
  ["Event info from Survivor Wellness (www.survivorwellness.org).", "www.survivorwellness.org", "https://www.survivorwellness.org/"],
  ["Event info from Tooele City Arts Council (www.tooelecityartscouncil.org).", "www.tooelecityartscouncil.org", "https://www.tooelecityartscouncil.org/"]
];
const NOV9E_EVENT_INFO_LINES = [
  ["Event info from Hobbled Dog Cidery (hobbleddogcider.com).", "hobbleddogcider.com", "https://hobbleddogcider.com/"],
  ["Event info from Liquid Breathwork (www.liquidbreathwork.com).", "www.liquidbreathwork.com", "https://www.liquidbreathwork.com/"],
  ["Event info from Blakfyre Games (blakfyre.com).", "blakfyre.com", "https://blakfyre.com/"],
  ["Event info from Sarah Geesey Studio (www.sarahgeesey.com).", "www.sarahgeesey.com", "https://www.sarahgeesey.com/"],
  ["Event info from SwingInUtah (www.swinginutah.com).", "www.swinginutah.com", "https://www.swinginutah.com/"],
  ["Event info from Barbary Coast Saloon (barbarycoastsaloon.com).", "barbarycoastsaloon.com", "https://barbarycoastsaloon.com/"],
  ["Event info from Salt Lake Indoor Soccer (www.saltlakeindoorsoccer.com).", "www.saltlakeindoorsoccer.com", "https://www.saltlakeindoorsoccer.com/"],
  ["Event info from Hell's Backbone Grill (www.hellsbackbonegrill.com).", "www.hellsbackbonegrill.com", "https://www.hellsbackbonegrill.com/"]
];
const NOV9F_EVENT_INFO_LINES = [
  ["Event info from Color Me Mine Sandy (sandy.colormemine.com).", "sandy.colormemine.com", "https://sandy.colormemine.com/"],
  ["Event info from Basin Recreation (basinrecreationutah.gov).", "basinrecreationutah.gov", "https://basinrecreationutah.gov/"],
  ["Event info from Utah DVMA (veterans.utah.gov).", "veterans.utah.gov", "https://veterans.utah.gov/"],
  ["Event info from Pin Heads Bowling (pinheads-bowling.com).", "pinheads-bowling.com", "https://pinheads-bowling.com/"]
];
const NOV9G_EVENT_INFO_LINES = [
  ["Event info from Watershed Pub & Kitchen (www.watershedutah.com).", "www.watershedutah.com", "https://www.watershedutah.com/"],
  ["Event info from Riftgate Games (riftgate.com).", "riftgate.com", "https://riftgate.com/"],
  ["Event info from High Point Coffee (www.highpointcoffeehouse.com).", "www.highpointcoffeehouse.com", "https://www.highpointcoffeehouse.com/"],
  ["Event info from Color Me Mine Logan (logan.colormemine.com).", "logan.colormemine.com", "https://logan.colormemine.com/"],
  ["Event info from Cache Bar (www.cachebarlogan.com).", "www.cachebarlogan.com", "https://www.cachebarlogan.com/"],
  ["Event info from IAMA (www.iamaweb.org).", "www.iamaweb.org", "https://www.iamaweb.org/"],
  ["Event info from Crossroads Card Show (www.crossroadscardshow.com).", "www.crossroadscardshow.com", "https://www.crossroadscardshow.com/"],
  ["Event info from Utah Archery Association (www.utaharchery.org).", "www.utaharchery.org", "https://www.utaharchery.org/"],
  ["Event info from Back Nine Compete (www.beyondthegrass.com).", "www.beyondthegrass.com", "https://www.beyondthegrass.com/"],
  ["Event info from Christmas Gift and Craft Show (www.christmascraftshows.com).", "www.christmascraftshows.com", "https://www.christmascraftshows.com/"]
];
const NOV9H_EVENT_INFO_LINES = [
  ["Event info from The Tilted Kiln (thetiltedkiln.com).", "thetiltedkiln.com", "https://thetiltedkiln.com/"],
  ["Event info from Willard Eccles Observatory (www.physics.utah.edu).", "www.physics.utah.edu", "https://www.physics.utah.edu/"],
  ["Event info from Mountain Town Music (mountaintownmusic.org).", "mountaintownmusic.org", "https://mountaintownmusic.org/"],
  ["Event info from Pleasant Grove Players (pgplayers.weebly.com).", "pgplayers.weebly.com", "https://pgplayers.weebly.com/"],
  ["Event info from 60 East Press (60eastpress.com).", "60eastpress.com", "https://60eastpress.com/"],
  ["Event info from Gracie's Farm (www.graciesfarm.com).", "www.graciesfarm.com", "https://www.graciesfarm.com/"],
  ["Event info from Salty Dogz Agility (www.saltydogzagility.com).", "www.saltydogzagility.com", "https://www.saltydogzagility.com/"],
  ["Event info from Love Baked by Callie (lovebakedbycallie.com).", "lovebakedbycallie.com", "https://lovebakedbycallie.com/"],
  ["Event info from Open Heart Energy (www.openheartenergy.com).", "www.openheartenergy.com", "https://www.openheartenergy.com/"],
  ["Event info from Utah Car Czar (utahcarczar.com).", "utahcarczar.com", "https://utahcarczar.com/"],
  ["Event info from St George Gobbler (stgeorgegobbler.com).", "stgeorgegobbler.com", "https://stgeorgegobbler.com/"],
  ["Event info from Salt Lake Power Yoga (www.slpy.xyz).", "www.slpy.xyz", "https://www.slpy.xyz/"]
];
const NOV9I_EVENT_INFO_LINES = [
  ["Event info from GreenHouse Nursery (logangreenhouse.com).", "logangreenhouse.com", "https://logangreenhouse.com/"],
  ["Event info from The Workshop (www.alpineworkshop.co).", "www.alpineworkshop.co", "https://www.alpineworkshop.co/"],
  ["Event info from Utah Symphony | Utah Opera (usuo.org).", "usuo.org", "https://usuo.org/"],
  ["Event info from Nature Hills Farm (www.naturehillsfarm.com).", "www.naturehillsfarm.com", "https://www.naturehillsfarm.com/"],
  ["Event info from Sip & Script (www.sipandscript.com).", "www.sipandscript.com", "https://www.sipandscript.com/"],
  ["Event info from Sarinda Jones (www.sarindajones.com).", "www.sarindajones.com", "https://www.sarindajones.com/"],
  ["Event info from Caputo's Market & Deli (caputos.com).", "caputos.com", "https://caputos.com/"]
];
const NOV9J_EVENT_INFO_LINES = [
  ["Event info from Koral Kafe (koralkafe.com).", "koralkafe.com", "https://koralkafe.com/"],
  ["Event info from Wasatch Food Co-op (www.wasatch.coop).", "www.wasatch.coop", "https://www.wasatch.coop/"],
  ["Event info from Utah Classical Guitar (www.utahclassicalguitar.org).", "www.utahclassicalguitar.org", "https://www.utahclassicalguitar.org/"],
  ["Event info from Jordan River Commission (jordanrivercommission.gov).", "jordanrivercommission.gov", "https://jordanrivercommission.gov/"],
  ["Event info from Root'd Cafe (rootdcafe.com).", "rootdcafe.com", "https://rootdcafe.com/"],
  ["Event info from Two-Bit Bistro (www.twobitbistro.com).", "www.twobitbistro.com", "https://www.twobitbistro.com/"],
  ["Event info from Utah Contra (utahcontra.org).", "utahcontra.org", "https://utahcontra.org/"],
  ["Event info from Salt Lake Scots Pipe Band (www.saltlakescots.org).", "www.saltlakescots.org", "https://www.saltlakescots.org/"],
  ["Event info from Board In Utah (boardinutah.games).", "boardinutah.games", "https://boardinutah.games/"],
  ["Event info from Business Owners of Bluff (bluffutah.org).", "bluffutah.org", "https://bluffutah.org/"]
];
const NOV9K_EVENT_INFO_LINES = [
  ["Event info from Millcreek Arts Council (www.millcreekartscouncil.org).", "www.millcreekartscouncil.org", "https://www.millcreekartscouncil.org/"],
  ["Event info from Conserve Southwest Utah (www.conserveswu.org).", "www.conserveswu.org", "https://www.conserveswu.org/"],
  ["Event info from Red Acre Farm (www.redacrefarmcsa.org).", "www.redacrefarmcsa.org", "https://www.redacrefarmcsa.org/"],
  ["Event info from Preservation Utah (www.preservationutah.org).", "www.preservationutah.org", "https://www.preservationutah.org/"],
  ["Event info from Anna's European Antiques (www.annasantiques.net).", "www.annasantiques.net", "https://www.annasantiques.net/"],
  ["Event info from Schmidt's Farm and Greenhouse (www.schmidtsfarmandgreenhouse.com).", "www.schmidtsfarmandgreenhouse.com", "https://www.schmidtsfarmandgreenhouse.com/"],
  ["Event info from Utah Folk Orchestra (utahfolkorchestra.org).", "utahfolkorchestra.org", "https://utahfolkorchestra.org/"],
  ["Event info from Peterson School of Music (petersonschoolofmusic.org).", "petersonschoolofmusic.org", "https://petersonschoolofmusic.org/"],
  ["Event info from Utah Scottish Association (www.utahscots.org).", "www.utahscots.org", "https://www.utahscots.org/"],
  ["Event info from Utah Tech Music (music.utahtech.edu).", "music.utahtech.edu", "https://music.utahtech.edu/"],
  ["Event info from Tanner Humanities Center (tanner.utah.edu).", "tanner.utah.edu", "https://tanner.utah.edu/"],
  ["Event info from Crowne Books (crownebooks.com).", "crownebooks.com", "https://crownebooks.com/"],
  ["Event info from LimitBreak Loot (www.limitbreakloot.com).", "www.limitbreakloot.com", "https://www.limitbreakloot.com/"],
  ["Event info from It Just Gets Stranger (www.itjustgetsstranger.com).", "www.itjustgetsstranger.com", "https://www.itjustgetsstranger.com/"]
];
const NOV9L_EVENT_INFO_LINES = [
  ["Event info from Timpanogos Chamber Music (www.timpchamber.org).", "www.timpchamber.org", "https://www.timpchamber.org/"],
  ["Event info from Summerhays Music Center (www.summerhaysmusic.com).", "www.summerhaysmusic.com", "https://www.summerhaysmusic.com/"],
  ["Event info from Make Well (www.makewell.studio).", "www.makewell.studio", "https://www.makewell.studio/"],
  ["Event info from Cambria Williams (www.cambriawilliams.com).", "www.cambriawilliams.com", "https://www.cambriawilliams.com/"],
  ["Event info from TriUtah (triutah.com).", "triutah.com", "https://triutah.com/"]
];
const NOV9M_EVENT_INFO_LINES = [
  ["Event info from Utah Philharmonic Orchestra (utahphil.org).", "utahphil.org", "https://utahphil.org/"],
  ["Event info from Salt & Honey Market (www.saltandhoneymarket.com).", "www.saltandhoneymarket.com", "https://www.saltandhoneymarket.com/"],
  ["Event info from Pioneer Memorial Museum (isdup.org).", "isdup.org", "https://isdup.org/"]
];
const NOV9N_EVENT_INFO_LINES = [
  ["Event info from Marriott Library Book Arts Program (lib.utah.edu).", "lib.utah.edu", "https://lib.utah.edu/"],
  ["Event info from GSL Beer Choir (www.gslbeerchoir.com).", "www.gslbeerchoir.com", "https://www.gslbeerchoir.com/"],
  ["Event info from Bridgerland Audubon Society (bridgerlandaudubon.org).", "bridgerlandaudubon.org", "https://bridgerlandaudubon.org/"],
  ["Event info from Queer Poetry Night SLC (queerpoetrynightslc.wordpress.com).", "queerpoetrynightslc.wordpress.com", "https://queerpoetrynightslc.wordpress.com/"],
  ["Event info from Wasatch Sewing Collective (www.wasatchsewingcollective.org).", "www.wasatchsewingcollective.org", "https://www.wasatchsewingcollective.org/"]
];
const NOV9O_EVENT_INFO_LINES = [
  ["Event info from Holy Cow Boutique (holycowboutique.com).", "holycowboutique.com", "https://holycowboutique.com/"],
  ["Event info from Utah Baroque Ensemble (www.utahbaroque.org).", "www.utahbaroque.org", "https://www.utahbaroque.org/"],
  ["Event info from Salt Lake Strummers (saltlakestrummers.org).", "saltlakestrummers.org", "https://saltlakestrummers.org/"],
  ["Event info from Utah Watercolor Society (www.utahwatercolor.org).", "www.utahwatercolor.org", "https://www.utahwatercolor.org/"],
  ["Event info from The Hog Wallow Pub (thehogwallow.com).", "thehogwallow.com", "https://thehogwallow.com/"]
];
const NOV9P_EVENT_INFO_LINES = [
  ["Event info from Weber Community Orchestra (weberorchestra.org).", "weberorchestra.org", "https://weberorchestra.org/"],
  ["Event info from Back of Beyond Books (backofbeyondbooks.com).", "backofbeyondbooks.com", "https://backofbeyondbooks.com/"],
  ["Event info from Recycle Utah (recycleutah.org).", "recycleutah.org", "https://recycleutah.org/"],
  ["Event info from Art for the Recovery Community (www.artfortherecoverycommunity.com).", "www.artfortherecoverycommunity.com", "https://www.artfortherecoverycommunity.com/"]
];
const NOV9ST_EVENT_INFO_LINES = [
  ["Event info from HEAL Utah (www.healutah.org).", "www.healutah.org", "https://www.healutah.org/"],
  ["Event info from Glass Art Guild of Utah (www.glassartguild.org).", "www.glassartguild.org", "https://www.glassartguild.org/"],
  ["Event info from Salt Lake City Library Foundation (slclf.org).", "slclf.org", "https://slclf.org/"],
  ["Event info from Utopia Early Music (www.utopiaearlymusic.org).", "www.utopiaearlymusic.org", "https://www.utopiaearlymusic.org/"],
  ["Event info from Utah Valley Handbell Choir (utahbells.com).", "utahbells.com", "https://utahbells.com/"],
  ["Event info from W.D. Kilpack (www.kilpack.net).", "www.kilpack.net", "https://www.kilpack.net/"],
  ["Event info from Ivory Innovations (www.ivoryinnovations.org).", "www.ivoryinnovations.org", "https://www.ivoryinnovations.org/"],
  ["Event info from Briarbook Lane (Mary W. Jensen) (www.briarbooklane.com).", "www.briarbooklane.com", "https://www.briarbooklane.com/"]
];
const NOV9U_EVENT_INFO_LINES = [
  ["Event info from Wasatch Powderkeg (www.wasatchpowderkeg.com).", "www.wasatchpowderkeg.com", "https://www.wasatchpowderkeg.com/"],
  ["Event info from Tooele Trail Racing (tooeletrailracing.com).", "tooeletrailracing.com", "https://tooeletrailracing.com/"],
  ["Event info from South Davis Race Series (www.southdavisraces.com).", "www.southdavisraces.com", "https://www.southdavisraces.com/"]
];
const NOV9VWXY_EVENT_INFO_LINES = [
  ["Event info from Salt Lake City Marathon (www.saltlakecitymarathon.com).", "www.saltlakecitymarathon.com", "https://www.saltlakecitymarathon.com/"],
  ["Event info from Lucky 13 Race (www.lucky13race.com).", "www.lucky13race.com", "https://www.lucky13race.com/"],
  ["Event info from Eggs Legs (www.eggslegs.com).", "www.eggslegs.com", "https://www.eggslegs.com/"],
  ["Event info from Ride Southern Utah (www.ridesouthernutah.com).", "www.ridesouthernutah.com", "https://www.ridesouthernutah.com/"],
  ["Event info from Utah Gravel Series (utahgravelseries.com).", "utahgravelseries.com", "https://utahgravelseries.com/"],
  ["Event info from Belgian Waffle Ride Utah (www.belgianwaffleride.bike).", "www.belgianwaffleride.bike", "https://www.belgianwaffleride.bike/"],
  ["Event info from Beaver County ATV Jamboree (beavercountyatvjamboree.org).", "beavercountyatvjamboree.org", "https://beavercountyatvjamboree.org/"],
  ["Event info from Eyes to the Sky Balloon Festival (eyestotheskyballoonfestival.com).", "eyestotheskyballoonfestival.com", "https://eyestotheskyballoonfestival.com/"],
  ["Event info from Bear Lake Monster Winterfest (bearlakemonsterwinterfest.com).", "bearlakemonsterwinterfest.com", "https://bearlakemonsterwinterfest.com/"],
  ["Event info from Zions Indie Film Fest (www.zionsindiefilmfest.com).", "www.zionsindiefilmfest.com", "https://www.zionsindiefilmfest.com/"],
  ["Event info from Nordic United (www.nordicunited.org).", "www.nordicunited.org", "https://www.nordicunited.org/"],
  ["Event info from Up and Away Balloon Festival (upandawayballoonfestival.com).", "upandawayballoonfestival.com", "https://upandawayballoonfestival.com/"],
  ["Event info from Ephraim Scandinavian Festival (www.scandifest.org).", "www.scandifest.org", "https://www.scandifest.org/"],
  ["Event info from Nihon Matsuri (www.nihonmatsuri.com).", "www.nihonmatsuri.com", "https://www.nihonmatsuri.com/"],
  ["Event info from Payson Scottish Festival (www.paysonscottishfestival.org).", "www.paysonscottishfestival.org", "https://www.paysonscottishfestival.org/"],
  ["Event info from Orienteering Utah (www.o-utah.org).", "www.o-utah.org", "https://www.o-utah.org/"],
  ["Event info from Utah Cycling Events (utahcyclingevents.com).", "utahcyclingevents.com", "https://utahcyclingevents.com/"],
  ["Event info from SPLICE (splicemusic.org).", "splicemusic.org", "https://splicemusic.org/"],
  ["Event info from Park City Kimball Arts Festival (kimballartsfestival.org).", "kimballartsfestival.org", "https://kimballartsfestival.org/"],
  ["Event info from Utah Air Show (theutahairshow.com).", "theutahairshow.com", "https://theutahairshow.com/"],
  ["Event info from Tan’s Treats (tanstreats.com).", "tanstreats.com", "https://tanstreats.com/"],
  ["Event info from National Ability Center (nationalabilitycenter.org).", "nationalabilitycenter.org", "https://nationalabilitycenter.org/"],
  ["Event info from Town of Mantua (www.mantuautah.gov).", "www.mantuautah.gov", "https://www.mantuautah.gov/"],
  ["Event info from Green River Rocks (www.greenriverrocks.com).", "www.greenriverrocks.com", "https://www.greenriverrocks.com/"],
  ["Event info from John Wesley Powell River History Museum (johnwesleypowell.com).", "johnwesleypowell.com", "https://johnwesleypowell.com/"],
  ["Event info from Hinckley Town (hinckleytown.utah.gov).", "hinckleytown.utah.gov", "https://hinckleytown.utah.gov/"],
  ["Event info from Vernal Rock Rally (www.vernalrockrally.com).", "www.vernalrockrally.com", "https://www.vernalrockrally.com/"],
  ["Event info from Old Capitol Arts & Living History Festival (oldcapitolfestivals.com).", "oldcapitolfestivals.com", "https://oldcapitolfestivals.com/"],
  ["Event info from Friends of Historic Spring City (www.friendsofhistoricspringcity.org).", "www.friendsofhistoricspringcity.org", "https://www.friendsofhistoricspringcity.org/"],
  ["Event info from Moab Run the Rocks (www.moabruntherocks.com).", "www.moabruntherocks.com", "https://www.moabruntherocks.com/"],
  ["Event info from Moab Bike Fest (moabbikefest.com).", "moabbikefest.com", "https://moabbikefest.com/"],
  ["Event info from Canyonlands PRCA Rodeo (www.moabcanyonlandsrodeo.com).", "www.moabcanyonlandsrodeo.com", "https://www.moabcanyonlandsrodeo.com/"],
  ["Event info from Destination Trail Moab 240 (www.destinationtrailrun.com).", "www.destinationtrailrun.com", "https://www.destinationtrailrun.com/"],
  ["Event info from Stand4Kind (stand4kind.com).", "stand4kind.com", "https://stand4kind.com/"],
  ["Event info from Red, White & Snow (redwhiteandsnow.org).", "redwhiteandsnow.org", "https://redwhiteandsnow.org/"],
  ["Event info from Vernal Dinosaur Roundup Rodeo (vernalrodeo.com).", "vernalrodeo.com", "https://vernalrodeo.com/"],
  ["Event info from Blossom Run (www.blossom.run).", "www.blossom.run", "https://www.blossom.run/"],
  ["Event info from May the Fourth Race (www.maythefourthrun.com).", "www.maythefourthrun.com", "https://www.maythefourthrun.com/"],
  ["Event info from DC Peaks (www.dcpeaks.com).", "www.dcpeaks.com", "https://www.dcpeaks.com/"],
  ["Event info from Logan Summerfest Arts Faire (logansummerfest.org).", "logansummerfest.org", "https://logansummerfest.org/"],
  ["Event info from Green River Watermelon Crawl (www.greenriverwatermeloncrawl.com).", "www.greenriverwatermeloncrawl.com", "https://www.greenriverwatermeloncrawl.com/"],
  ["Event info from Salt Lake Home + Garden Show (www.saltlakehomeandgardenshow.com).", "www.saltlakehomeandgardenshow.com", "https://www.saltlakehomeandgardenshow.com/"],
  ["Event info from Wasatch Gem Society (wasatchgemsociety.com).", "wasatchgemsociety.com", "https://wasatchgemsociety.com/"],
  ["Event info from Vision2050 (vision2050pc.com).", "vision2050pc.com", "https://vision2050pc.com/"],
  ["Event info from Storymakers (storymakersguild.org).", "storymakersguild.org", "https://storymakersguild.org/"],
  ["Event info from Krank-It-Up Productions (krankitupproductions.com).", "krankitupproductions.com", "https://krankitupproductions.com/"],
  ["Event info from Asian Association of Utah (aau-slc.org).", "aau-slc.org", "https://aau-slc.org/"],
  ["Event info from Western Hunting & Conservation Expo (huntexpo.com).", "huntexpo.com", "https://huntexpo.com/"],
  ["Event info from Green River Dirt Bike Rally (www.greenriverdirtbikerally.com).", "www.greenriverdirtbikerally.com", "https://www.greenriverdirtbikerally.com/"],
  ["Event info from Special Olympics of Utah (sout.org).", "sout.org", "https://sout.org/"],
  ["Event info from Pleasant Grove Strawberry Days (strawberrydays.org).", "strawberrydays.org", "https://strawberrydays.org/"],
  ["Event info from Scots on the Rocks Moab (www.scotsontherocksmoab.org).", "www.scotsontherocksmoab.org", "https://www.scotsontherocksmoab.org/"]
];
const NOV9ZAB_EVENT_INFO_LINES = [
  ["Event info from Cedar City Music Arts (cedarcitymusicarts.org).", "cedarcitymusicarts.org", "https://cedarcitymusicarts.org/"],
  ["Event info from Area 11 Handbells (area11.handbellmusicians.org).", "area11.handbellmusicians.org", "https://area11.handbellmusicians.org/"],
  ["Event info from YCC Family Crisis Center (yccogden.org).", "yccogden.org", "https://yccogden.org/"],
  ["Event info from Utah Valley Marathon (utahvalleymarathon.com).", "utahvalleymarathon.com", "https://utahvalleymarathon.com/"],
  ["Event info from Coldwater Traverse (cwtraverse.com).", "cwtraverse.com", "https://cwtraverse.com/"],
  ["Event info from Living Traditions Festival (livingtraditionsfestival.com).", "livingtraditionsfestival.com", "https://livingtraditionsfestival.com/"],
  ["Event info from Ogden Home Show (ogdenhomeshow.com).", "ogdenhomeshow.com", "https://ogdenhomeshow.com/"],
  ["Event info from Luau Run (luau.run).", "luau.run", "https://luau.run/"],
  ["Event info from Utah Valley Parade of Homes (uvparade.com).", "uvparade.com", "https://uvparade.com/"],
  ["Event info from BioHive (biohive.com).", "biohive.com", "https://biohive.com/"],
  ["Event info from Trail Hero (trail-hero.com).", "trail-hero.com", "https://trail-hero.com/"],
  ["Event info from Ability Inclusion Services (abilityis.org).", "abilityis.org", "https://abilityis.org/"],
  ["Event info from Pinners Conference (pinnersconference.com).", "pinnersconference.com", "https://pinnersconference.com/"],
  ["Event info from Salt Lake Art Show (saltlakeartshow.com).", "saltlakeartshow.com", "https://saltlakeartshow.com/"],
  ["Event info from Juab Cowboy Poetry & Music Gathering (juabcp.com).", "juabcp.com", "https://juabcp.com/"],
  ["Event info from Handcart Days (handcartdays.org).", "handcartdays.org", "https://handcartdays.org/"],
  ["Event info from Utah Auto Expo (autoshowutah.com).", "autoshowutah.com", "https://autoshowutah.com/"],
  ["Event info from US Moto Expo (usmotoexpo.com).", "usmotoexpo.com", "https://usmotoexpo.com/"],
  ["Event info from Greenband Enterprises (greenband.com).", "greenband.com", "https://greenband.com/"],
  ["Event info from The Great Basin Fiber Arts Fair (gbfaf.org).", "gbfaf.org", "https://gbfaf.org/"],
  ["Event info from Southwest Quilt & Fiber Art Festival (southwestquilt.com).", "southwestquilt.com", "https://southwestquilt.com/"],
  ["Event info from RODS Heroes (rods.org).", "rods.org", "https://rods.org/"],
  ["Event info from FRONT RUNNER Metric Century (frontrunnercentury.com).", "frontrunnercentury.com", "https://frontrunnercentury.com/"],
  ["Event info from Redrok Rally (redrokrally.com).", "redrokrally.com", "https://redrokrally.com/"],
  ["Event info from LTUE (ltue.net).", "ltue.net", "https://ltue.net/"],
  ["Event info from Gem Faire (gemfaire.com).", "gemfaire.com", "https://gemfaire.com/"],
  ["Event info from East Canyon Marathon (eastcanyonmarathon.com).", "eastcanyonmarathon.com", "https://eastcanyonmarathon.com/"],
  ["Event info from PC2PG (pc2pg.com).", "pc2pg.com", "https://pc2pg.com/"],
  ["Event info from Super Hero Race (superherorace.com).", "superherorace.com", "https://superherorace.com/"],
  ["Event info from Antelope Island Marathon (antelopeislandmarathon.com).", "antelopeislandmarathon.com", "https://antelopeislandmarathon.com/"],
  ["Event info from Chamber Music Society of Logan (chambermusicsocietyoflogan.org).", "chambermusicsocietyoflogan.org", "https://chambermusicsocietyoflogan.org/"],
  ["Event info from PRO Skijor (proskijor.com).", "proskijor.com", "https://proskijor.com/"],
  ["Event info from Amazing Earthfest (amazingearthfest.org).", "amazingearthfest.org", "https://amazingearthfest.org/"],
  ["Event info from Golden Spike Gem & Mineral Society (goldenspikegem.org).", "goldenspikegem.org", "https://goldenspikegem.org/"],
  ["Event info from Sun River Gardens (sunrivergardens.com).", "sunrivergardens.com", "https://sunrivergardens.com/"],
  ["Event info from The Quilter's Crossing (thequilterscrossing.com).", "thequilterscrossing.com", "https://thequilterscrossing.com/"],
  ["Event info from Logan Home Show (loganhomeshow.com).", "loganhomeshow.com", "https://loganhomeshow.com/"],
  ["Event info from Isekai Anime Con (isekaianimecon.com).", "isekaianimecon.com", "https://isekaianimecon.com/"],
  ["Event info from Underground Runner (myundergroundrunner.com).", "myundergroundrunner.com", "https://myundergroundrunner.com/"]
];
const NOV9AC_EVENT_INFO_LINES = [
  ["Event info from Rev3Endurance (rev3endurance.com).", "rev3endurance.com", "https://rev3endurance.com/"],
  ["Event info from St George Jazz Festival (stgeorgejazz.com).", "stgeorgejazz.com", "https://stgeorgejazz.com/"],
  ["Event info from St. George Home Expo (stgeorgehomeexpo.com).", "stgeorgehomeexpo.com", "https://stgeorgehomeexpo.com/"],
  ["Event info from Anglers Den (anglersden.com).", "anglersden.com", "https://anglersden.com/"],
  ["Event info from Park City Pioneers (parkcitypioneers.com).", "parkcitypioneers.com", "https://parkcitypioneers.com/"],
  ["Event info from Quilter's Heritage Festival (quiltersheritagefestival.com).", "quiltersheritagefestival.com", "https://quiltersheritagefestival.com/"],
  ["Event info from Utah Bridal Expo (utahbridalexpo.com).", "utahbridalexpo.com", "https://utahbridalexpo.com/"],
  ["Event info from Soldier Hollow Classic (soldierhollowclassic.com).", "soldierhollowclassic.com", "https://soldierhollowclassic.com/"],
  ["Event info from Salt City Stomp (saltcitystomp.com).", "saltcitystomp.com", "https://saltcitystomp.com/"],
  ["Event info from Utah Avalanche Center (utahavalanchecenter.org).", "utahavalanchecenter.org", "https://utahavalanchecenter.org/"]
];
const NOV9AD_EVENT_INFO_LINES = [
  ["Event info from Sew Simply Stitched (sewsimplystitched.com).", "sewsimplystitched.com", "https://sewsimplystitched.com/"],
  ["Event info from RedStone Highland Games (redstonehighlandgames.com).", "redstonehighlandgames.com", "https://redstonehighlandgames.com/"],
  ["Event info from Iron County HBA (ichba.org).", "ichba.org", "https://ichba.org/"],
  ["Event info from Cache Valley Media Group (cachevalleymediagroup.com).", "cachevalleymediagroup.com", "https://cachevalleymediagroup.com/"],
  ["Event info from International Sportsmen's Expositions (sportsexpos.com).", "sportsexpos.com", "https://sportsexpos.com/"],
  ["Event info from Stitch Craft Conference (stitchcraftconference.com).", "stitchcraftconference.com", "https://stitchcraftconference.com/"],
  ["Event info from Kitchen Kneads (kitchenkneads.com).", "kitchenkneads.com", "https://kitchenkneads.com/"],
  ["Event info from Vintage Market Days (vintagemarketdays.com).", "vintagemarketdays.com", "https://vintagemarketdays.com/"],
  ["Event info from Compass & Core (compassandcore.com).", "compassandcore.com", "https://compassandcore.com/"],
  ["Event info from HEAL Studio (healyogastudio.com).", "healyogastudio.com", "https://healyogastudio.com/"]
];
const NOV9AE_EVENT_INFO_LINES = [
  ["Event info from Desert Mountain Medicine (desertmountainmedicine.com).", "desertmountainmedicine.com", "https://desertmountainmedicine.com/"],
  ["Event info from Jurassic Quest (jurassicquest.com).", "jurassicquest.com", "https://jurassicquest.com/"],
  ["Event info from Into the Wild Adventure (itwadventure.com).", "itwadventure.com", "https://itwadventure.com/"],
  ["Event info from National Park Photography Expeditions (nppemasterclass.com).", "nppemasterclass.com", "https://nppemasterclass.com/"],
  ["Event info from Bruce Barnbaum (barnbaum.com).", "barnbaum.com", "https://barnbaum.com/"],
  ["Event info from Kat Anderson Writes (katandersonwrites.com).", "katandersonwrites.com", "https://katandersonwrites.com/"],
  ["Event info from Under The Garden Moon (underthegardenmoon.com).", "underthegardenmoon.com", "https://underthegardenmoon.com/"],
  ["Event info from Anasazi Free-Trappers (anasazifreetrappers.org).", "anasazifreetrappers.org", "https://anasazifreetrappers.org/"],
  ["Event info from Hurricane Valley Rotary Club (eastercarshow.com).", "eastercarshow.com", "https://eastercarshow.com/"],
  ["Event info from America On Stage (americaonstage.org).", "americaonstage.org", "https://americaonstage.org/"]
];
const NOV9AF_EVENT_INFO_LINES = [
  ["Event info from Salt City ParaCon (saltcityparacon.com).", "saltcityparacon.com", "https://saltcityparacon.com/"],
  ["Event info from Stephanie Chavez Designs (stephaniechavez.com).", "stephaniechavez.com", "https://stephaniechavez.com/"],
  ["Event info from Ninja Mountain Bike Skills (ridelikeaninja.com).", "ridelikeaninja.com", "https://ridelikeaninja.com/"],
  ["Event info from Utah Dancesport (utahdancesport.com).", "utahdancesport.com", "https://utahdancesport.com/"],
  ["Event info from Dusty Doddridge Photography (dustydoddridge.com).", "dustydoddridge.com", "https://dustydoddridge.com/"],
  ["Event info from Pacific Mindfulness (pacificmindfulness.com).", "pacificmindfulness.com", "https://pacificmindfulness.com/"],
  ["Event info from Nature Photography Collective (naturephotocollective.com).", "naturephotocollective.com", "https://naturephotocollective.com/"],
  ["Event info from Enlighten Photography Excursions (zion-photography.com).", "zion-photography.com", "https://zion-photography.com/"],
  ["Event info from Rockbound Adventures (rockboundadventures.com).", "rockboundadventures.com", "https://rockboundadventures.com/"]
];
const NOV9AG_EVENT_INFO_LINES = [
  ["Event info from Greenband Enterprises (slcbridalshowcase.com).", "slcbridalshowcase.com", "https://slcbridalshowcase.com/"],
  ["Event info from 4Corners Riversports (riversports.com).", "riversports.com", "https://riversports.com/"],
  ["Event info from Utah Ballroom Dance (utahballroomdance.com).", "utahballroomdance.com", "https://utahballroomdance.com/"]
];
const NOV9AH_EVENT_INFO_LINES = [
  ["Event info from St George Opera (stgeorgeopera.com).", "stgeorgeopera.com", "https://stgeorgeopera.com/"],
  ["Event info from Orchestra of Southern Utah (osucedarcity.blogspot.com).", "osucedarcity.blogspot.com", "https://osucedarcity.blogspot.com/"],
  ["Event info from Progression Sessions (progressionsessions.fun).", "progressionsessions.fun", "https://progressionsessions.fun/"]
];
const STATE_ROOM_LINE = "Event info from The State Room Presents (thestateroompresents.com).";
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
const USGS_NATIONAL_MAP_CREDIT = "Map services and data available from U.S. Geological Survey, National Geospatial Program. Credit: U.S. Geological Survey. Neither USGS nor the U.S. government endorses Jaderoo.";
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

section("legal 2026-11-10 UGRC shared line, parcels LIR, and municipal boundaries", () => {
  const SHARED = "Utah Geospatial Resource Center (UGRC), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Data Sources: UGRC SGID (data modified).";
  const ROWS = [
    {
      title: "Utah Salt Lake County Parcels LIR",
      itemId: "6f900727e16d4ce1a83f2a1ec1d82e60",
      credit: "Utah Salt Lake County Parcels LIR, via UGRC SGID · CC BY 4.0 · data modified",
      note: "Change note: parcel polygon reduced to a centroid; not a legal boundary."
    },
    {
      title: "Utah Municipal Boundaries",
      itemId: "543fa1f073714198a3dbf8a292bdf30c",
      credit: "Utah Municipal Boundaries, via UGRC SGID · CC BY 4.0 · data modified",
      note: "Change note: municipal polygon reduced to a city centroid; not a legal boundary."
    }
  ];
  check("shared line matches the module", sources.UGRC_SHARED_LINE === SHARED);
  check("legal nov10 is a separate two-row list",
    Array.isArray(sources.UGRC_LEGAL_NOV10) && sources.UGRC_LEGAL_NOV10.length === 2 &&
    sources.UGRC_ROUND8.length === 11);
  ROWS.forEach((row, i) => {
    const item = sources.UGRC_LEGAL_NOV10[i];
    const dataset = "https://opendata.gis.utah.gov/datasets/" + row.itemId + "_0";
    const dotAt = row.credit.indexOf("SGID") + 5;
    check(row.title + " credit is exact",
      item && item.title === row.title && item.itemId === row.itemId &&
      item.credit === row.credit && item.note === row.note &&
      item.datasetUrl === dataset && item.credit.charCodeAt(dotAt) === 0x00B7 &&
      !item.key);
  });
  const page = sources.renderPage();
  const text = visibleText(page);
  function paragraphHtml(html, exact) {
    const re = /<p\b[^>]*>[\s\S]*?<\/p>/g;
    let match;
    while ((match = re.exec(html))) {
      if (visibleText(match[0]) === exact) return match[0];
    }
    return "";
  }
  function anchorAttrsFor(html, exact) {
    const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
    const found = [];
    let match;
    while ((match = re.exec(html))) {
      if (visibleText(match[2]) === exact) found.push(match[1]);
    }
    return found;
  }
  const sharedHtml = paragraphHtml(page, SHARED);
  check("the shared line appears on /sources once",
    occurrences(text, SHARED) === 1 && visibleText(sharedHtml) === SHARED,
    String(occurrences(text, SHARED)));
  check("the shared line links the CC BY URL to itself",
    sharedHtml.indexOf('href="' + CC_BY + '"') !== -1 &&
    sharedHtml.indexOf(">" + CC_BY + "</a>") !== -1);
  const gnisCredit = ROUND8_LAYERS.filter(row => row[0] === "ugrc_gnis")[0][3];
  const gnisAt = text.indexOf(gnisCredit);
  check("the shared line follows the round 8 credits",
    gnisAt !== -1 && text.indexOf(SHARED) > gnisAt);
  let previousCreditAt = text.indexOf(SHARED);
  const noteAts = [];
  ROWS.forEach(row => {
    const dataset = "https://opendata.gis.utah.gov/datasets/" + row.itemId + "_0";
    const itemRe = /<li\b[^>]*>[\s\S]*?<\/li>/g;
    let itemHtml = "";
    let itemCount = 0;
    let itemMatch;
    while ((itemMatch = itemRe.exec(page))) {
      if (visibleText(itemMatch[0]) === row.credit) {
        itemCount++;
        itemHtml = itemMatch[0];
      }
    }
    const sgidAttrs = anchorAttrsFor(itemHtml, "UGRC SGID").join(" ");
    const ccAttrs = anchorAttrsFor(itemHtml, "CC BY 4.0").join(" ");
    const creditAt = text.indexOf(row.credit);
    const noteAt = text.indexOf(row.note);
    check(row.title + " credit appears once",
      occurrences(text, row.credit) === 1 && itemCount === 1 && creditAt > previousCreditAt,
      String(occurrences(text, row.credit)));
    check(row.title + " links UGRC SGID to its dataset",
      sgidAttrs.indexOf('href="' + dataset + '"') !== -1, sgidAttrs);
    check(row.title + " links CC BY 4.0 to the license",
      ccAttrs.indexOf('href="' + CC_BY + '"') !== -1, ccAttrs);
    check(row.note + " appears once",
      occurrences(text, row.note) === 1,
      String(occurrences(text, row.note)));
    previousCreditAt = creditAt;
    noteAts.push(noteAt);
  });
  check("change notes follow the legal credits in order",
    noteAts[0] > previousCreditAt && noteAts[1] > noteAts[0]);
  const disclaimerAt = text.indexOf("UGRC disclaimer (unmodified)");
  const headingAt = page.indexOf('id="ugrc-sgid"');
  const sharedHtmlAt = page.indexOf(sharedHtml);
  check("legal lines sit in the UGRC SGID section before the disclaimer",
    headingAt !== -1 && sharedHtmlAt > headingAt && disclaimerAt > noteAts[1]);
  const round8Ids = sources.ROUND8_SOURCES.map(entry => entry.itemId);
  const entryBlob = JSON.stringify(sources.ENTRIES);
  check("ROUND8_SOURCES is still length 13", sources.ROUND8_SOURCES.length === 13);
  check("ROUND8_SOURCES contains neither new itemId",
    round8Ids.indexOf(ROWS[0].itemId) === -1 &&
    round8Ids.indexOf(ROWS[1].itemId) === -1 &&
    entryBlob.indexOf(ROWS[0].itemId) === -1 &&
    entryBlob.indexOf(ROWS[1].itemId) === -1);
  [
    "state_park_points_for_website",
    "f48539a42c714223ad67e0e6727051cf",
    "45847ee7b6a04361b9dae4ee5340a4f1",
    "Utah_Places_of_Worship",
    "Utah Places of Worship",
    "6c04168379d24199a41c7492a1f5da2d"
  ].forEach(phrase => {
    check("page, ENTRIES, and ROUND8_SOURCES omit " + phrase,
      page.indexOf(phrase) === -1 &&
      text.indexOf(phrase) === -1 &&
      entryBlob.indexOf(phrase) === -1 &&
      JSON.stringify(sources.ROUND8_SOURCES).indexOf(phrase) === -1);
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
      const nationalAt = res.body.indexOf('id="national-map"');
      const nationalParaAt = res.body.indexOf(USGS_NATIONAL_MAP_CREDIT);
      const nationalEnd = nationalParaAt === -1 ? -1 : res.body.indexOf("</p>", nationalParaAt);
      const nationalBlock = nationalParaAt === -1 || nationalEnd === -1 ? "" : res.body.slice(res.body.lastIndexOf("<p", nationalParaAt), nationalEnd + 4);
      check("the National Map credit is the Legal sentence, once, with no image",
        sources.USGS_NATIONAL_MAP_CREDIT === USGS_NATIONAL_MAP_CREDIT &&
        occurrences(bodyText, USGS_NATIONAL_MAP_CREDIT) === 1 &&
        visibleText(nationalBlock) === USGS_NATIONAL_MAP_CREDIT &&
        nationalAt !== -1 &&
        nationalAt > res.body.indexOf("<strong>" + CENSUS_LEAD + "</strong>") &&
        eventsAt > nationalAt &&
        nationalBlock.toLowerCase().indexOf("<img") === -1 &&
        nationalBlock.toLowerCase().indexOf("logo") === -1,
        String(occurrences(bodyText, USGS_NATIONAL_MAP_CREDIT)));
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
        ["Event info from Springville Museum of Art (smofa.org).", "smofa.org", "https://www.smofa.org/"],
        ["Event info from CacheCalendar (cachecalendar.com).", "cachecalendar.com", "https://cachecalendar.com/"],
        ["Event info from Visit Cedar City · Brian Head (visitcedarcity.com).", "visitcedarcity.com", "https://visitcedarcity.com/"],
        ["Event info from Town of Springdale (springdale.utah.gov).", "springdale.utah.gov", "https://www.springdale.utah.gov/"],
        ["Event info from South Valley Chamber (southvalleychamber.com).", "southvalleychamber.com", "https://www.southvalleychamber.com/"],
        ["Event info from Historic Park City Alliance (historicparkcityutah.com).", "historicparkcityutah.com", "https://historicparkcityutah.com/"],
        ["Event info from The State Room Presents (thestateroompresents.com).", "thestateroompresents.com", "https://thestateroompresents.com/"],
        ["Event info from Egyptian Theatre (parkcityshows.com).", "parkcityshows.com", "https://parkcityshows.com/"],
        ["Event info from South Salt Lake City (sslc.gov).", "sslc.gov", "https://sslc.gov/"],
        ["Event info from Hyrum City (hyrumcity.gov).", "hyrumcity.gov", "https://www.hyrumcity.gov/"],
        ["Event info from Kayenta Center for the Arts (kayentaarts.org).", "kayentaarts.org", "https://kayentaarts.org/"],
        ["Event info from North Salt Lake City (nslcity.org).", "nslcity.org", "https://nslcity.org/"],
        ["Event info from Syracuse City Recreation (syracuserecreation.com).", "syracuserecreation.com", "https://syracuserecreation.com/"],
        ["Event info from South Jordan City (sjc.utah.gov).", "sjc.utah.gov", "https://sjc.utah.gov/"],
        ["Event info from Park City Museum (parkcityhistory.org).", "parkcityhistory.org", "https://parkcityhistory.org/"],
        ["Event info from Clearfield City (clearfield.city).", "clearfield.city", "https://clearfield.city/"],
        ["Event info from Ballet West (balletwest.org).", "balletwest.org", "https://www.balletwest.org/"],
        ["Event info from Draper Historic Theatre (draperhistorictheatre.org).", "draperhistorictheatre.org", "https://www.draperhistorictheatre.org/"],
        ["Event info from Wasatch Mountain Institute (wasatchmountaininstitute.org).", "wasatchmountaininstitute.org", "https://www.wasatchmountaininstitute.org/"],
        ["Event info from Midway City (midwaycityut.gov).", "midwaycityut.gov", "https://www.midwaycityut.gov/"],
        ["Event info from Salt Lake Acting Company (saltlakeactingcompany.org).", "saltlakeactingcompany.org", "https://saltlakeactingcompany.org/"],
        ["Event info from Plan-B Theatre (planbtheatre.org).", "planbtheatre.org", "https://planbtheatre.org/"],
        ["Event info from Greater Zion (events.greaterzion.com).", "events.greaterzion.com", "https://events.greaterzion.com/"],
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
      const greaterZion = EVENT_INFO_LINES[33];
      check("Greater Zion appears once with an https href on events.greaterzion.com",
        occurrences(bodyText, greaterZion[0]) === 1 &&
        eventsText.indexOf(greaterZion[0]) > eventsText.indexOf("Event info from Plan-B Theatre (planbtheatre.org).") &&
        /href="https:\/\/(?:www\.)?events\.greaterzion\.com\//.test(eventsHtml));
      check("SLCC is absent from /sources",
        res.body.indexOf("SLCC") === -1);
      const BLM_PERMIT = "Permit information from the U.S. Bureau of Land Management outfitter list. BLM does not endorse or promote any permittee.";
      const blmHeadingAt = bodyText.indexOf("Bureau of Land Management (BLM)");
      const blmPageAt = bodyText.indexOf(BLM_PAGE);
      const permitAt = bodyText.indexOf(BLM_PERMIT);
      const permitHtmlAt = res.body.indexOf(BLM_PERMIT);
      const permitStart = res.body.lastIndexOf("<p", permitHtmlAt);
      const permitEnd = res.body.indexOf("</p>", permitHtmlAt);
      const permitBlock = permitStart >= 0 && permitEnd > permitHtmlAt ? res.body.slice(permitStart, permitEnd + 4) : "";
      check("the BLM permit paragraph appears once in the BLM section before Event listings",
        occurrences(bodyText, BLM_PERMIT) === 1 &&
        blmHeadingAt !== -1 &&
        blmPageAt > blmHeadingAt &&
        permitAt > blmPageAt &&
        eventsTextAt > permitAt);
      check("the BLM permit paragraph has no img",
        permitBlock.length > 0 &&
        permitBlock.toLowerCase().indexOf("<img") === -1 &&
        visibleText(permitBlock) === BLM_PERMIT);
      const springville = EVENT_INFO_LINES[11];
      check("Springville Museum of Art appears once with an https href on smofa.org",
        occurrences(bodyText, springville[0]) === 1 &&
        eventsText.indexOf(springville[0]) > eventsText.indexOf("Event info from Ogden Shakespeare Festival (ogdenshakesfest.org).") &&
        /href="https:\/\/(?:www\.)?smofa\.org\/"/.test(eventsHtml));
      check("the older NPS park-unit credit is unchanged",
        sources.NPS_CREDIT === NPS_CREDIT &&
        sources.NPS_PAGE === NPS_PAGE &&
        occurrences(bodyText, NPS_PAGE) === 1);
      check("the NPS place-pages credit matches the module",
        sources.NPS_PLACE_PAGES_LEAD === NPS_PLACE_PAGES_LEAD &&
        sources.NPS_PLACE_PAGES === NPS_PLACE_PAGES);
      const npsPlacesBlock = paragraphBlock(res.body, NPS_PLACE_PAGES_LEAD);
      const npsPlacesAt = bodyText.indexOf(NPS_PLACE_PAGES);
      const npsUnitsAt = bodyText.indexOf(NPS_PAGE);
      check("the NPS place-pages credit appears once, as its own bold-lead paragraph",
        occurrences(bodyText, NPS_PLACE_PAGES) === 1 &&
        visibleText(npsPlacesBlock) === NPS_PLACE_PAGES &&
        npsPlacesBlock.indexOf("<strong>" + NPS_PLACE_PAGES_LEAD + "</strong>") !== -1 &&
        npsUnitsAt !== -1 &&
        npsPlacesAt > npsUnitsAt &&
        npsPlacesAt < bodyText.indexOf("Utah Museums Directory"));
      let nov4kPrevious = eventsText.indexOf("Event info from Greater Zion (events.greaterzion.com).");
      NOV4K_EVENT_INFO_LINES.forEach(function (line) {
        const itemRe = /<li\b[^>]*>[\s\S]*?<\/li>/g;
        let itemHtml = "";
        let itemMatch;
        while ((itemMatch = itemRe.exec(eventsHtml))) {
          if (visibleText(itemMatch[0]) === line) {
            itemHtml = itemMatch[0];
            break;
          }
        }
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov4kPrevious !== -1 && lineAt > nov4kPrevious);
        nov4kPrevious = lineAt;
      });
      let nov4mPrevious = eventsText.indexOf("Event info from Loveland Living Planet Aquarium (livingplanetaquarium.org).");
      NOV4M_EVENT_INFO_LINES.forEach(function (line) {
        const itemRe = /<li\b[^>]*>[\s\S]*?<\/li>/g;
        let itemHtml = "";
        let itemMatch;
        while ((itemMatch = itemRe.exec(eventsHtml))) {
          if (visibleText(itemMatch[0]) === line) {
            itemHtml = itemMatch[0];
            break;
          }
        }
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov4mPrevious !== -1 && lineAt > nov4mPrevious);
        nov4mPrevious = lineAt;
      });
      let nov4oPrevious = eventsText.indexOf("Event info from Alpine City (alpineut.gov).");
      check("nov4o checks 7 verbatim event-info lines", NOV4O_EVENT_INFO_LINES.length === 7);
      NOV4O_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov4oPrevious !== -1 && lineAt > nov4oPrevious);
        nov4oPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5abcPrevious = eventsText.indexOf("Event info from Moab Arts (moabarts.org).");
      check("nov5abc+nov4e checks 43 verbatim event-info lines", NOV5ABC_NOV4E_EVENT_INFO_LINES.length === 43);
      NOV5ABC_NOV4E_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5abcPrevious !== -1 && lineAt > nov5abcPrevious);
        nov5abcPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5defPrevious = eventsText.indexOf("Event info from Cache Valley Astronomical Society (cvas-utahskies.org).");
      check("nov5def checks 50 verbatim event-info lines", NOV5DEF_EVENT_INFO_LINES.length === 50);
      NOV5DEF_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5defPrevious !== -1 && lineAt > nov5defPrevious);
        nov5defPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5gPrevious = eventsText.indexOf("Event info from West Valley Arts (wvcarts.org).");
      check("nov5g checks 20 verbatim event-info lines", NOV5G_EVENT_INFO_LINES.length === 20);
      NOV5G_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5gPrevious !== -1 && lineAt > nov5gPrevious);
        nov5gPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5hiPrevious = eventsText.indexOf("Event info from Utah City events (utahcity.com).");
      check("nov5hi checks 37 verbatim event-info lines", NOV5HI_EVENT_INFO_LINES.length === 37);
      NOV5HI_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5hiPrevious !== -1 && lineAt > nov5hiPrevious);
        nov5hiPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5jPrevious = eventsText.indexOf("Event info from Wolfdog Brewing (www.wolfdogbrewing.com).");
      check("nov5j checks 10 verbatim event-info lines", NOV5J_EVENT_INFO_LINES.length === 10);
      NOV5J_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5jPrevious !== -1 && lineAt > nov5jPrevious);
        nov5jPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5kPrevious = eventsText.indexOf("Event info from West Jordan Symphony (www.westjordansymphony.org).");
      check("nov5k checks 20 verbatim event-info lines", NOV5K_EVENT_INFO_LINES.length === 20);
      NOV5K_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5kPrevious !== -1 && lineAt > nov5kPrevious);
        nov5kPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5lPrevious = eventsText.indexOf("Event info from Utah Metropolitan Ballet (www.umballet.org).");
      check("nov5l checks 15 verbatim event-info lines", NOV5L_EVENT_INFO_LINES.length === 15);
      NOV5L_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5lPrevious !== -1 && lineAt > nov5lPrevious);
        nov5lPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let storyCrossroadsPrevious = eventsText.indexOf("Event info from The Romantics Archive (theromanticsarchive.com).");
      check("storycrossroads checks 1 verbatim event-info line", STORY_CROSSROADS_EVENT_INFO_LINES.length === 1);
      STORY_CROSSROADS_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          storyCrossroadsPrevious !== -1 && lineAt > storyCrossroadsPrevious);
        storyCrossroadsPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5mPrevious = eventsText.indexOf("Event info from Story Crossroads (storycrossroads23.wildapricot.org).");
      check("nov5m checks 12 verbatim event-info lines", NOV5M_EVENT_INFO_LINES.length === 12);
      NOV5M_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5mPrevious !== -1 && lineAt > nov5mPrevious);
        nov5mPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5nPrevious = eventsText.indexOf("Event info from UtahPresents (utahpresents.org).");
      check("nov5n checks 12 verbatim event-info lines", NOV5N_EVENT_INFO_LINES.length === 12);
      NOV5N_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5nPrevious !== -1 && lineAt > nov5nPrevious);
        nov5nPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5oPrevious = eventsText.indexOf("Event info from Tanner Dance (tannerdance.utah.edu).");
      check("nov5o checks 10 verbatim event-info lines", NOV5O_EVENT_INFO_LINES.length === 10);
      NOV5O_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5oPrevious !== -1 && lineAt > nov5oPrevious);
        nov5oPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5pPrevious = eventsText.indexOf("Event info from Women's Wine Hiking Society (winehikingsociety.com).");
      check("nov5p checks 14 verbatim event-info lines", NOV5P_EVENT_INFO_LINES.length === 14);
      NOV5P_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5pPrevious !== -1 && lineAt > nov5pPrevious);
        nov5pPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5qPrevious = eventsText.indexOf("Event info from West Valley Symphony (westvalleysymphonyutah.org).");
      check("nov5q checks 5 verbatim event-info lines", NOV5Q_EVENT_INFO_LINES.length === 5);
      NOV5Q_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5qPrevious !== -1 && lineAt > nov5qPrevious);
        nov5qPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5rPrevious = eventsText.indexOf("Event info from Viewmont High School (vhs.davis.k12.ut.us).");
      check("nov5r checks 10 verbatim event-info lines", NOV5R_EVENT_INFO_LINES.length === 10);
      NOV5R_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5rPrevious !== -1 && lineAt > nov5rPrevious);
        nov5rPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5sPrevious = eventsText.indexOf("Event info from Utah State Capitol (utahstatecapitol.utah.gov).");
      check("nov5s checks 8 verbatim event-info lines", NOV5S_EVENT_INFO_LINES.length === 8);
      NOV5S_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5sPrevious !== -1 && lineAt > nov5sPrevious);
        nov5sPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5tPrevious = eventsText.indexOf("Event info from Throw Art Studio (www.throwartstudios.app).");
      check("nov5t checks 8 verbatim event-info lines", NOV5T_EVENT_INFO_LINES.length === 8);
      NOV5T_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5tPrevious !== -1 && lineAt > nov5tPrevious);
        nov5tPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5uPrevious = eventsText.indexOf("Event info from Valley Bowling Lanes (www.valleybowlinglanesutah.com).");
      check("nov5u checks 5 verbatim event-info lines", NOV5U_EVENT_INFO_LINES.length === 5);
      NOV5U_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5uPrevious !== -1 && lineAt > nov5uPrevious);
        nov5uPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5vPrevious = eventsText.indexOf("Event info from United Way of Utah County (volunteer.unitedwayuc.org).");
      check("nov5v checks 15 verbatim event-info lines", NOV5V_EVENT_INFO_LINES.length === 15);
      NOV5V_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5vPrevious !== -1 && lineAt > nov5vPrevious);
        nov5vPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5wPrevious = eventsText.indexOf("Event info from theFINDlab (thefindlab.com).");
      check("nov5w checks 4 verbatim event-info lines", NOV5W_EVENT_INFO_LINES.length === 4);
      NOV5W_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5wPrevious !== -1 && lineAt > nov5wPrevious);
        nov5wPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5xPrevious = eventsText.indexOf("Event info from Washington City Arts Council (washingtoncityartscouncil.com).");
      check("nov5x checks 7 verbatim event-info lines", NOV5X_EVENT_INFO_LINES.length === 7);
      NOV5X_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5xPrevious !== -1 && lineAt > nov5xPrevious);
        nov5xPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5yPrevious = eventsText.indexOf("Event info from Woodcraft of Salt Lake City (www.woodcraft.com).");
      check("nov5y checks 4 verbatim event-info lines", NOV5Y_EVENT_INFO_LINES.length === 4);
      NOV5Y_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5yPrevious !== -1 && lineAt > nov5yPrevious);
        nov5yPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5zPrevious = eventsText.indexOf("Event info from Salt Lake Running Co. (slrc.com).");
      check("nov5z checks 10 verbatim event-info lines", NOV5Z_EVENT_INFO_LINES.length === 10);
      NOV5Z_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5zPrevious !== -1 && lineAt > nov5zPrevious);
        nov5zPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov5aaPrevious = eventsText.indexOf("Event info from The Westerner (westernerslc.com).");
      check("nov5aa checks 16 verbatim event-info lines", NOV5AA_EVENT_INFO_LINES.length === 16);
      NOV5AA_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov5aaPrevious !== -1 && lineAt > nov5aaPrevious);
        nov5aaPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov9aPrevious = eventsText.indexOf("Event info from Utah Global Diplomacy (www.utahglobaldiplomacy.org).");
      check("nov9a checks 12 verbatim event-info lines", NOV9A_EVENT_INFO_LINES.length === 12);
      NOV9A_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9aPrevious !== -1 && lineAt > nov9aPrevious);
        nov9aPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov9bPrevious = eventsText.indexOf("Event info from DANCE TO UPLIFT (www.dancetouplift.com).");
      check("nov9b checks 6 verbatim event-info lines", NOV9B_EVENT_INFO_LINES.length === 6);
      NOV9B_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9bPrevious !== -1 && lineAt > nov9bPrevious);
        nov9bPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov9cPrevious = eventsText.indexOf("Event info from X-Golf Riverton (www.xgolfriverton.com).");
      check("nov9c checks 11 verbatim event-info lines", NOV9C_EVENT_INFO_LINES.length === 11);
      NOV9C_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9cPrevious !== -1 && lineAt > nov9cPrevious);
        nov9cPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov9dPrevious = eventsText.indexOf("Event info from KJ's Ice Barn (kjsicebarn.org).");
      check("nov9d checks 11 verbatim event-info lines", NOV9D_EVENT_INFO_LINES.length === 11);
      NOV9D_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9dPrevious !== -1 && lineAt > nov9dPrevious);
        nov9dPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov9ePrevious = eventsText.indexOf("Event info from Tooele City Arts Council (www.tooelecityartscouncil.org).");
      check("nov9e checks 8 verbatim event-info lines", NOV9E_EVENT_INFO_LINES.length === 8);
      NOV9E_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9ePrevious !== -1 && lineAt > nov9ePrevious);
        nov9ePrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov9fPrevious = eventsText.indexOf("Event info from Hell's Backbone Grill (www.hellsbackbonegrill.com).");
      check("nov9f checks 4 verbatim event-info lines", NOV9F_EVENT_INFO_LINES.length === 4);
      NOV9F_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9fPrevious !== -1 && lineAt > nov9fPrevious);
        nov9fPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov9gPrevious = eventsText.indexOf("Event info from Pin Heads Bowling (pinheads-bowling.com).");
      check("nov9g checks 10 verbatim event-info lines", NOV9G_EVENT_INFO_LINES.length === 10);
      NOV9G_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9gPrevious !== -1 && lineAt > nov9gPrevious);
        nov9gPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov9hPrevious = eventsText.indexOf("Event info from Christmas Gift and Craft Show (www.christmascraftshows.com).");
      check("nov9h checks 12 verbatim event-info lines", NOV9H_EVENT_INFO_LINES.length === 12);
      NOV9H_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9hPrevious !== -1 && lineAt > nov9hPrevious);
        nov9hPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov9iPrevious = eventsText.indexOf("Event info from Salt Lake Power Yoga (www.slpy.xyz).");
      check("nov9i checks 7 verbatim event-info lines", NOV9I_EVENT_INFO_LINES.length === 7);
      NOV9I_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9iPrevious !== -1 && lineAt > nov9iPrevious);
        nov9iPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov9jPrevious = eventsText.indexOf("Event info from Caputo's Market & Deli (caputos.com).");
      check("nov9j checks 10 verbatim event-info lines", NOV9J_EVENT_INFO_LINES.length === 10);
      NOV9J_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9jPrevious !== -1 && lineAt > nov9jPrevious);
        nov9jPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov9kPrevious = eventsText.indexOf("Event info from Business Owners of Bluff (bluffutah.org).");
      check("nov9k checks 14 verbatim event-info lines", NOV9K_EVENT_INFO_LINES.length === 14);
      NOV9K_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9kPrevious !== -1 && lineAt > nov9kPrevious);
        nov9kPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov9lPrevious = eventsText.indexOf("Event info from It Just Gets Stranger (www.itjustgetsstranger.com).");
      check("nov9l checks 5 verbatim event-info lines", NOV9L_EVENT_INFO_LINES.length === 5);
      NOV9L_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9lPrevious !== -1 && lineAt > nov9lPrevious);
        nov9lPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov9mPrevious = eventsText.indexOf("Event info from TriUtah (triutah.com).");
      check("nov9m checks 3 verbatim event-info lines", NOV9M_EVENT_INFO_LINES.length === 3);
      NOV9M_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9mPrevious !== -1 && lineAt > nov9mPrevious);
        nov9mPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov9nPrevious = eventsText.indexOf("Event info from Pioneer Memorial Museum (isdup.org).");
      check("nov9n checks 5 verbatim event-info lines", NOV9N_EVENT_INFO_LINES.length === 5);
      NOV9N_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9nPrevious !== -1 && lineAt > nov9nPrevious);
        nov9nPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov9oPrevious = eventsText.indexOf("Event info from Wasatch Sewing Collective (www.wasatchsewingcollective.org).");
      check("nov9o checks 5 verbatim event-info lines", NOV9O_EVENT_INFO_LINES.length === 5);
      NOV9O_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9oPrevious !== -1 && lineAt > nov9oPrevious);
        nov9oPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov9pPrevious = eventsText.indexOf("Event info from The Hog Wallow Pub (thehogwallow.com).");
      check("nov9p checks 4 verbatim event-info lines", NOV9P_EVENT_INFO_LINES.length === 4);
      NOV9P_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9pPrevious !== -1 && lineAt > nov9pPrevious);
        nov9pPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov9stPrevious = eventsText.indexOf("Event info from Art for the Recovery Community (www.artfortherecoverycommunity.com).");
      check("nov9st checks 8 verbatim event-info lines", NOV9ST_EVENT_INFO_LINES.length === 8);
      NOV9ST_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9stPrevious !== -1 && lineAt > nov9stPrevious);
        nov9stPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov9uPrevious = eventsText.indexOf("Event info from Briarbook Lane (Mary W. Jensen) (www.briarbooklane.com).");
      check("nov9u checks 3 verbatim event-info lines", NOV9U_EVENT_INFO_LINES.length === 3);
      NOV9U_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9uPrevious !== -1 && lineAt > nov9uPrevious);
        nov9uPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      let nov9vwxyPrevious = eventsText.indexOf("Event info from South Davis Race Series (www.southdavisraces.com).");
      check("nov9vwxy checks 52 verbatim event-info lines", NOV9VWXY_EVENT_INFO_LINES.length === 52);
      NOV9VWXY_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9vwxyPrevious !== -1 && lineAt > nov9vwxyPrevious);
        nov9vwxyPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      check("thesnowleague.com is absent from event-info credits",
        eventsHtml.indexOf("thesnowleague.com") === -1 &&
        eventsText.indexOf("thesnowleague.com") === -1);
      let nov9zabPrevious = eventsText.indexOf("Event info from Scots on the Rocks Moab (www.scotsontherocksmoab.org).");
      check("nov9zab checks 39 verbatim event-info lines", NOV9ZAB_EVENT_INFO_LINES.length === 39);
      NOV9ZAB_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9zabPrevious !== -1 && lineAt > nov9zabPrevious);
        nov9zabPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      check("run.deseret.com is absent from event-info credits",
        eventsHtml.indexOf("run.deseret.com") === -1 &&
        eventsText.indexOf("run.deseret.com") === -1);
      check("openrangeraces.com is absent from event-info credits",
        eventsHtml.indexOf("openrangeraces.com") === -1 &&
        eventsText.indexOf("openrangeraces.com") === -1);
      check("storycon.org is absent from event-info credits",
        eventsHtml.indexOf("storycon.org") === -1 &&
        eventsText.indexOf("storycon.org") === -1);
      check("saltlake.acsgala.org is absent from event-info credits",
        eventsHtml.indexOf("saltlake.acsgala.org") === -1 &&
        eventsText.indexOf("saltlake.acsgala.org") === -1);
      let nov9acPrevious = eventsText.indexOf("Event info from Underground Runner (myundergroundrunner.com).");
      check("nov9ac checks 10 verbatim event-info lines", NOV9AC_EVENT_INFO_LINES.length === 10);
      NOV9AC_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9acPrevious !== -1 && lineAt > nov9acPrevious);
        nov9acPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      check("wildwomentribe.net is absent from credits",
        res.body.indexOf("wildwomentribe.net") === -1 &&
        bodyText.indexOf("wildwomentribe.net") === -1 &&
        eventsHtml.indexOf("wildwomentribe.net") === -1 &&
        eventsText.indexOf("wildwomentribe.net") === -1);
      check("templetotemple.life is absent from credits",
        res.body.indexOf("templetotemple.life") === -1 &&
        bodyText.indexOf("templetotemple.life") === -1 &&
        eventsHtml.indexOf("templetotemple.life") === -1 &&
        eventsText.indexOf("templetotemple.life") === -1);
      check("littlehollywoodwildwestfest.com is absent from credits",
        res.body.indexOf("littlehollywoodwildwestfest.com") === -1 &&
        bodyText.indexOf("littlehollywoodwildwestfest.com") === -1 &&
        eventsHtml.indexOf("littlehollywoodwildwestfest.com") === -1 &&
        eventsText.indexOf("littlehollywoodwildwestfest.com") === -1);
      check("gsutah.org is absent from credits",
        res.body.indexOf("gsutah.org") === -1 &&
        bodyText.indexOf("gsutah.org") === -1 &&
        eventsHtml.indexOf("gsutah.org") === -1 &&
        eventsText.indexOf("gsutah.org") === -1);
      check("asraracing.com is absent from credits",
        res.body.indexOf("asraracing.com") === -1 &&
        bodyText.indexOf("asraracing.com") === -1 &&
        eventsHtml.indexOf("asraracing.com") === -1 &&
        eventsText.indexOf("asraracing.com") === -1);
      check("utvoffroadadventures.com is absent from credits",
        res.body.indexOf("utvoffroadadventures.com") === -1 &&
        bodyText.indexOf("utvoffroadadventures.com") === -1 &&
        eventsHtml.indexOf("utvoffroadadventures.com") === -1 &&
        eventsText.indexOf("utvoffroadadventures.com") === -1);
      check("run.deseret.com is absent from credits",
        res.body.indexOf("run.deseret.com") === -1 &&
        bodyText.indexOf("run.deseret.com") === -1 &&
        eventsHtml.indexOf("run.deseret.com") === -1 &&
        eventsText.indexOf("run.deseret.com") === -1);
      check("saltlake.acsgala.org is absent from credits",
        res.body.indexOf("saltlake.acsgala.org") === -1 &&
        bodyText.indexOf("saltlake.acsgala.org") === -1 &&
        eventsHtml.indexOf("saltlake.acsgala.org") === -1 &&
        eventsText.indexOf("saltlake.acsgala.org") === -1);
      let nov9adPrevious = eventsText.indexOf("Event info from Utah Avalanche Center (utahavalanchecenter.org).");
      check("nov9ad checks 10 verbatim event-info lines", NOV9AD_EVENT_INFO_LINES.length === 10);
      NOV9AD_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9adPrevious !== -1 && lineAt > nov9adPrevious);
        nov9adPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      check("canyonlandquilts.com is absent from credits",
        res.body.indexOf("canyonlandquilts.com") === -1 &&
        bodyText.indexOf("canyonlandquilts.com") === -1 &&
        eventsHtml.indexOf("canyonlandquilts.com") === -1 &&
        eventsText.indexOf("canyonlandquilts.com") === -1);
      check("cedarcityquiltretreat.com is absent from credits",
        res.body.indexOf("cedarcityquiltretreat.com") === -1 &&
        bodyText.indexOf("cedarcityquiltretreat.com") === -1 &&
        eventsHtml.indexOf("cedarcityquiltretreat.com") === -1 &&
        eventsText.indexOf("cedarcityquiltretreat.com") === -1);
      check("rockymountainrodeo.com is absent from credits",
        res.body.indexOf("rockymountainrodeo.com") === -1 &&
        bodyText.indexOf("rockymountainrodeo.com") === -1 &&
        eventsHtml.indexOf("rockymountainrodeo.com") === -1 &&
        eventsText.indexOf("rockymountainrodeo.com") === -1);
      check("northernutahhomeshow.com is absent from credits",
        res.body.indexOf("northernutahhomeshow.com") === -1 &&
        bodyText.indexOf("northernutahhomeshow.com") === -1 &&
        eventsHtml.indexOf("northernutahhomeshow.com") === -1 &&
        eventsText.indexOf("northernutahhomeshow.com") === -1);
      let nov9aePrevious = eventsText.indexOf("Event info from HEAL Studio (healyogastudio.com).");
      check("nov9ae checks 10 verbatim event-info lines", NOV9AE_EVENT_INFO_LINES.length === 10);
      NOV9AE_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9aePrevious !== -1 && lineAt > nov9aePrevious);
        nov9aePrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      check("honestheartjourneys.com is absent from credits",
        res.body.indexOf("honestheartjourneys.com") === -1 &&
        bodyText.indexOf("honestheartjourneys.com") === -1 &&
        eventsHtml.indexOf("honestheartjourneys.com") === -1 &&
        eventsText.indexOf("honestheartjourneys.com") === -1);
      check("hunterpagenatureprints.com is absent from credits",
        res.body.indexOf("hunterpagenatureprints.com") === -1 &&
        bodyText.indexOf("hunterpagenatureprints.com") === -1 &&
        eventsHtml.indexOf("hunterpagenatureprints.com") === -1 &&
        eventsText.indexOf("hunterpagenatureprints.com") === -1);
      check("pittatours.com is absent from credits",
        res.body.indexOf("pittatours.com") === -1 &&
        bodyText.indexOf("pittatours.com") === -1 &&
        eventsHtml.indexOf("pittatours.com") === -1 &&
        eventsText.indexOf("pittatours.com") === -1);
      check("photogadventures.com is absent from credits",
        res.body.indexOf("photogadventures.com") === -1 &&
        bodyText.indexOf("photogadventures.com") === -1 &&
        eventsHtml.indexOf("photogadventures.com") === -1 &&
        eventsText.indexOf("photogadventures.com") === -1);
      check("carolnewsomart.com is absent from credits",
        res.body.indexOf("carolnewsomart.com") === -1 &&
        bodyText.indexOf("carolnewsomart.com") === -1 &&
        eventsHtml.indexOf("carolnewsomart.com") === -1 &&
        eventsText.indexOf("carolnewsomart.com") === -1);
      check("actionphototours.com is absent from credits",
        res.body.indexOf("actionphototours.com") === -1 &&
        bodyText.indexOf("actionphototours.com") === -1 &&
        eventsHtml.indexOf("actionphototours.com") === -1 &&
        eventsText.indexOf("actionphototours.com") === -1);
      check("spencerscamera.com is absent from credits",
        res.body.indexOf("spencerscamera.com") === -1 &&
        bodyText.indexOf("spencerscamera.com") === -1 &&
        eventsHtml.indexOf("spencerscamera.com") === -1 &&
        eventsText.indexOf("spencerscamera.com") === -1);
      check("weberbasin.com is absent from credits",
        res.body.indexOf("weberbasin.com") === -1 &&
        bodyText.indexOf("weberbasin.com") === -1 &&
        eventsHtml.indexOf("weberbasin.com") === -1 &&
        eventsText.indexOf("weberbasin.com") === -1);
      check("artprovides.org is absent from credits",
        res.body.indexOf("artprovides.org") === -1 &&
        bodyText.indexOf("artprovides.org") === -1 &&
        eventsHtml.indexOf("artprovides.org") === -1 &&
        eventsText.indexOf("artprovides.org") === -1);
      check("wrightflowercompany.com is absent from credits",
        res.body.indexOf("wrightflowercompany.com") === -1 &&
        bodyText.indexOf("wrightflowercompany.com") === -1 &&
        eventsHtml.indexOf("wrightflowercompany.com") === -1 &&
        eventsText.indexOf("wrightflowercompany.com") === -1);
      let nov9afPrevious = eventsText.indexOf("Event info from America On Stage (americaonstage.org).");
      check("nov9af checks 9 verbatim event-info lines", NOV9AF_EVENT_INFO_LINES.length === 9);
      NOV9AF_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9afPrevious !== -1 && lineAt > nov9afPrevious);
        nov9afPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      check("swellretreat.com is absent from credits",
        res.body.indexOf("swellretreat.com") === -1 &&
        bodyText.indexOf("swellretreat.com") === -1 &&
        eventsHtml.indexOf("swellretreat.com") === -1 &&
        eventsText.indexOf("swellretreat.com") === -1);
      check("fishutahtournaments.com is absent from credits",
        res.body.indexOf("fishutahtournaments.com") === -1 &&
        bodyText.indexOf("fishutahtournaments.com") === -1 &&
        eventsHtml.indexOf("fishutahtournaments.com") === -1 &&
        eventsText.indexOf("fishutahtournaments.com") === -1);
      check("lighthousebh.co is absent from credits",
        res.body.indexOf("lighthousebh.co") === -1 &&
        bodyText.indexOf("lighthousebh.co") === -1 &&
        eventsHtml.indexOf("lighthousebh.co") === -1 &&
        eventsText.indexOf("lighthousebh.co") === -1);
      check("capturetheatlas.com is absent from credits",
        res.body.indexOf("capturetheatlas.com") === -1 &&
        bodyText.indexOf("capturetheatlas.com") === -1 &&
        eventsHtml.indexOf("capturetheatlas.com") === -1 &&
        eventsText.indexOf("capturetheatlas.com") === -1);
      check("getyourmarriageon.com is absent from credits",
        res.body.indexOf("getyourmarriageon.com") === -1 &&
        bodyText.indexOf("getyourmarriageon.com") === -1 &&
        eventsHtml.indexOf("getyourmarriageon.com") === -1 &&
        eventsText.indexOf("getyourmarriageon.com") === -1);
      let nov9agPrevious = eventsText.indexOf("Event info from Rockbound Adventures (rockboundadventures.com).");
      check("nov9ag checks 3 verbatim event-info lines", NOV9AG_EVENT_INFO_LINES.length === 3);
      NOV9AG_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9agPrevious !== -1 && lineAt > nov9agPrevious);
        nov9agPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      check("jillilystudio.com is absent from credits",
        res.body.indexOf("jillilystudio.com") === -1 &&
        bodyText.indexOf("jillilystudio.com") === -1 &&
        eventsHtml.indexOf("jillilystudio.com") === -1 &&
        eventsText.indexOf("jillilystudio.com") === -1);
      check("vivavitaexpos.com is absent from credits",
        res.body.indexOf("vivavitaexpos.com") === -1 &&
        bodyText.indexOf("vivavitaexpos.com") === -1 &&
        eventsHtml.indexOf("vivavitaexpos.com") === -1 &&
        eventsText.indexOf("vivavitaexpos.com") === -1);
      check("alwaysbesewing.com is absent from credits",
        res.body.indexOf("alwaysbesewing.com") === -1 &&
        bodyText.indexOf("alwaysbesewing.com") === -1 &&
        eventsHtml.indexOf("alwaysbesewing.com") === -1 &&
        eventsText.indexOf("alwaysbesewing.com") === -1);
      check("cruisemoab.com is absent from credits",
        res.body.indexOf("cruisemoab.com") === -1 &&
        bodyText.indexOf("cruisemoab.com") === -1 &&
        eventsHtml.indexOf("cruisemoab.com") === -1 &&
        eventsText.indexOf("cruisemoab.com") === -1);
      check("strikeyourmatch.net is absent from credits",
        res.body.indexOf("strikeyourmatch.net") === -1 &&
        bodyText.indexOf("strikeyourmatch.net") === -1 &&
        eventsHtml.indexOf("strikeyourmatch.net") === -1 &&
        eventsText.indexOf("strikeyourmatch.net") === -1);
      check("rodeosusa.com is absent from credits",
        res.body.indexOf("rodeosusa.com") === -1 &&
        bodyText.indexOf("rodeosusa.com") === -1 &&
        eventsHtml.indexOf("rodeosusa.com") === -1 &&
        eventsText.indexOf("rodeosusa.com") === -1);
      let nov9ahPrevious = eventsText.indexOf("Event info from Utah Ballroom Dance (utahballroomdance.com).");
      check("nov9ah checks 3 verbatim event-info lines", NOV9AH_EVENT_INFO_LINES.length === 3);
      NOV9AH_EVENT_INFO_LINES.forEach(function (row) {
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
        const lineAt = eventsText.indexOf(line);
        check(line + " appears once on /sources, verbatim",
          occurrences(bodyText, line) === 1 && visibleText(itemHtml) === line,
          String(occurrences(bodyText, line)));
        check(line + " keeps its order in Event listings",
          nov9ahPrevious !== -1 && lineAt > nov9ahPrevious);
        nov9ahPrevious = lineAt;
        check(domain + " links over https and passes sourceLink",
          foundHref === href &&
          sources.httpsPageUrl(href) === href &&
          util.sourceLink({ url: href }) === href &&
          util.httpsPageUrl(href) === href,
          foundHref);
      });
      check("woodsandwatersproject.com is absent from credits",
        res.body.indexOf("woodsandwatersproject.com") === -1 &&
        bodyText.indexOf("woodsandwatersproject.com") === -1 &&
        eventsHtml.indexOf("woodsandwatersproject.com") === -1 &&
        eventsText.indexOf("woodsandwatersproject.com") === -1);
      check("utvevents.weebly.com is absent from credits",
        res.body.indexOf("utvevents.weebly.com") === -1 &&
        bodyText.indexOf("utvevents.weebly.com") === -1 &&
        eventsHtml.indexOf("utvevents.weebly.com") === -1 &&
        eventsText.indexOf("utvevents.weebly.com") === -1);
      check("stgeorgedance.com is absent from credits",
        res.body.indexOf("stgeorgedance.com") === -1 &&
        bodyText.indexOf("stgeorgedance.com") === -1 &&
        eventsHtml.indexOf("stgeorgedance.com") === -1 &&
        eventsText.indexOf("stgeorgedance.com") === -1);
      check("movara.com is absent from credits",
        res.body.indexOf("movara.com") === -1 &&
        bodyText.indexOf("movara.com") === -1 &&
        eventsHtml.indexOf("movara.com") === -1 &&
        eventsText.indexOf("movara.com") === -1);
      check("oeccutah.com is absent from credits",
        res.body.indexOf("oeccutah.com") === -1 &&
        bodyText.indexOf("oeccutah.com") === -1 &&
        eventsHtml.indexOf("oeccutah.com") === -1 &&
        eventsText.indexOf("oeccutah.com") === -1);
      check("csfamilyfarm.com is absent from credits",
        res.body.indexOf("csfamilyfarm.com") === -1 &&
        bodyText.indexOf("csfamilyfarm.com") === -1 &&
        eventsHtml.indexOf("csfamilyfarm.com") === -1 &&
        eventsText.indexOf("csfamilyfarm.com") === -1);
      check("backyardultraofnorthernutah.com is absent from credits",
        res.body.indexOf("backyardultraofnorthernutah.com") === -1 &&
        bodyText.indexOf("backyardultraofnorthernutah.com") === -1 &&
        eventsHtml.indexOf("backyardultraofnorthernutah.com") === -1 &&
        eventsText.indexOf("backyardultraofnorthernutah.com") === -1);
      check("brigadoon.live is absent from credits",
        res.body.indexOf("brigadoon.live") === -1 &&
        bodyText.indexOf("brigadoon.live") === -1 &&
        eventsHtml.indexOf("brigadoon.live") === -1 &&
        eventsText.indexOf("brigadoon.live") === -1);
      check("The State Room Presents appears exactly once",
        occurrences(bodyText, STATE_ROOM_LINE) === 1 &&
        occurrences(bodyText, "State Room") === 1,
        "line " + occurrences(bodyText, STATE_ROOM_LINE) + ", State Room " + occurrences(bodyText, "State Room"));
      const sourcesLower = res.body.toLowerCase();
      check("Moab Area Chamber is absent from /sources",
        res.body.indexOf("Moab Area Chamber") === -1 &&
        sourcesLower.indexOf("moab area chamber") === -1);
      check("stgeorgechamber is absent from /sources",
        sourcesLower.indexOf("stgeorgechamber") === -1);
      check("theruth is absent from /sources",
        sourcesLower.indexOf("theruth") === -1);
      check("NowPlayingUtah is absent from /sources",
        res.body.indexOf("NowPlayingUtah") === -1 &&
        sourcesLower.indexOf("nowplayingutah") === -1);
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
    check("016 is the nearby index migration, 017 is place staging, and 018 and 019 are the cost-band migrations",
      files.indexOf("016_nearby_keyset.sql") !== -1 &&
      files.indexOf("017_place_staging.sql") !== -1 &&
      files.indexOf("018_cost_bands_20.sql") !== -1 &&
      files.indexOf("019_cost_bands_20_rename.sql") !== -1);
  }));
}

module.exports = main().then(() => ({ pass: pass, fail: fail }));
