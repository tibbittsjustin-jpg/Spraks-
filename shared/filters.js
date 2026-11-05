/* Filter vocabulary taken from the ideas catalog.
   The seed refuses an idea outside this set. The activities API rejects a
   query value outside it. The browser still has its own copy in app.js;
   this module is the server-side list.

   cost.indexOf also recognizes legacyCost. db/seed.js is unchanged and
   still calls cost.indexOf, so a flagged row stored as "$20-$30" or
   "$100 and under" can load. Filter chips and new submissions use the
   seven bands only (cost.slice(), whose indexOf is the ordinary one).
   legacyCost is not a filter and is not shown in the UI.

   time.indexOf also recognizes legacyTime (Morning, Afternoon, Evening,
   Night). Chips and new window ids are the five slugs. Old ?time= names
   are translated to those windows before the query runs. */
"use strict";

const costBands = require("../public/cost-bands");
const timeWindows = require("../public/time-windows");
const audience = require("../public/audience");

const cost = costBands.COST_BANDS.slice();
const legacyCost = ["$20-$30", "$100 and under"];

function costIndexOf(value, fromIndex) {
  const found = Array.prototype.indexOf.call(this, value, fromIndex);
  if (found !== -1) return found;
  const legacy = legacyCost.indexOf(value);
  if (legacy === -1) return -1;
  return this.length + legacy;
}
Object.defineProperty(cost, "indexOf", {
  value: costIndexOf,
  writable: true,
  configurable: true
});

// The five window slugs. indexOf also recognizes the legacy tags so a
// catalog row stored as Morning can still load. Filter chips use the
// slugs (time.slice(), whose indexOf is the ordinary one).
function timeList() {
  const time = timeWindows.TIME_WINDOWS.slice();
  function timeIndexOf(value, fromIndex) {
    const found = Array.prototype.indexOf.call(this, value, fromIndex);
    if (found !== -1) return found;
    const legacy = timeWindows.LEGACY_TIME.indexOf(value);
    if (legacy === -1) return -1;
    return this.length + legacy;
  }
  Object.defineProperty(time, "indexOf", {
    value: timeIndexOf,
    writable: true,
    configurable: true
  });
  return time;
}

module.exports = {
  setting: ["Indoor", "Outdoor", "Both"],
  season: ["Spring", "Summer", "Fall", "Winter"],
  cost: cost,
  // Hidden. Not a swipe chip and not accepted on a new submission.
  legacyCost: legacyCost,
  storedCostsForBands: costBands.storedCostsForBands,
  costMatches: costBands.costMatches,
  bandsForStoredCost: costBands.bandsForStoredCost,
  duration: ["Quick (under 1 hr)", "Short (1-2 hrs)", "Half-day (2-5 hrs)", "Full day", "Overnight"],
  time: timeList(),
  // Hidden. Not a swipe chip. Seed, import, and old ?time= names still accept these.
  legacyTime: timeWindows.LEGACY_TIME.slice(),
  timeMatches: timeWindows.timeMatches,
  windowsForActivity: timeWindows.windowsForActivity,
  selectionFromQuery: timeWindows.selectionFromQuery,
  storedTimesForWindows: timeWindows.storedValuesForWindows,
  vibe: ["Chill", "Romantic", "Active", "Adventurous", "Creative", "Silly", "Cozy", "Spontaneous"],
  // Discover chips. stage and dateType stay for rows and older clients.
  audience: audience.AUDIENCE.slice(),
  stage: ["First Date", "Second/Third Date", "Serious Relationship"],
  dateType: ["Solo/Couple", "Double Date", "Group Date"],
  food: [true, false],
  // Alcohol-centered ideas. Absent on an idea means false.
  age21: [true, false],
  // Closed set of curated categories. Not a swipe-filter chip, but the API
  // accepts category= the same way it accepts cost=.
  category: [
    "Arts, Crafts & Making Things",
    "Big Bucket-List Experiences",
    "Building & DIY Projects",
    "Cooking, Food & Eating Challenges",
    "Culture, Community & Local Attractions",
    "Dancing & Live Entertainment",
    "Games, Contests & Scavenger Hunts",
    "Hiking & Nature",
    "Learning New Skills",
    "Local Provo/Utah County Business Dates",
    "Local Utah/Idaho Spots & Day Trips",
    "Mall & Store Mischief",
    "Movies & Shows",
    "Outdoor Adventure & Extreme Sports",
    "Picnics & Parks",
    "Romantic & Classic Dates",
    "Service, Kindness & Community",
    "Silly, Prank & Goofy Dates",
    "Sports, Games & Rec",
    "Themed Nights & Dinners",
    "Water Activities",
    "Winter & Snow Adventures"
  ]
};
