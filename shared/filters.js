/* Filter vocabulary taken from public/data.js.
   The seed refuses an idea outside this set. The activities API rejects a
   query value outside it. The browser still has its own copy in app.js;
   this module is the server-side list. */
"use strict";

module.exports = {
  setting: ["Indoor", "Outdoor", "Both"],
  season: ["Spring", "Summer", "Fall", "Winter"],
  cost: ["Free", "$1-$10", "$20-$30", "$100 and under"],
  duration: ["Quick (under 1 hr)", "Short (1-2 hrs)", "Half-day (2-5 hrs)", "Full day", "Overnight"],
  time: ["Morning", "Afternoon", "Evening", "Night"],
  vibe: ["Chill", "Romantic", "Active", "Adventurous", "Creative", "Silly", "Cozy", "Spontaneous"],
  stage: ["First Date", "Second/Third Date", "Serious Relationship"],
  dateType: ["Solo/Couple", "Double Date", "Group Date"],
  food: [true, false],
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
