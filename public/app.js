/* ===================== Spark app.js ===================== */
(function(){
  "use strict";

  /* ---------- Constants derived from data ---------- */
  var CATEGORIES = Array.from(new Set(IDEAS_DATA.map(function(i){ return i.category; })));
  var IDEAS_BY_ID = {};
  IDEAS_DATA.forEach(function(i){ IDEAS_BY_ID[i.id] = i; });
  // photos.json (loaded as IDEA_PHOTOS) supplies { url, credit } for each
  // idea. License and source links stay on the credits page. Ideas with no
  // entry keep the generated cover.
  applyIdeaPhotos(typeof IDEA_PHOTOS === "undefined" ? null : IDEA_PHOTOS);
  applyIdeaPins(typeof IDEA_PINS === "undefined" ? null : IDEA_PINS);

  function applyIdeaPhotos(map){
    if(!map || typeof map !== "object") return;
    IDEAS_DATA.forEach(function(idea){
      var entry = map[idea.id] || map[String(idea.id)];
      if(!entry || typeof entry !== "object") return;
      var url = typeof entry.url === "string" ? entry.url.trim() : "";
      if(!url) return;
      var credit = typeof entry.credit === "string" ? entry.credit : "";
      idea.photo = { url: url, credit: credit };
    });
  }

  // Confident pins only. An idea that already has a point keeps it.
  // City stays on the pin table and is not copied onto the idea.
  function applyIdeaPins(map){
    if(!map || typeof map !== "object") return;
    IDEAS_DATA.forEach(function(idea){
      if(SparkRadius.ideaPoint(idea)) return;
      var pin = map[idea.id] != null ? map[idea.id] : map[String(idea.id)];
      var point = SparkRadius.ideaPoint(pin);
      if(!point) return;
      idea.lat = point.lat;
      idea.lng = point.lng;
    });
  }

  var FILTER_DEFS = [
    { key:"duration", label:"Date Length", options:["Quick (under 1 hr)","Short (1-2 hrs)","Half-day (2-5 hrs)","Full day","Overnight"] },
    { key:"cost",     label:"Budget",      options:["Free","$1-$10","$20-$30","$100 and under","Over $100"] },
    { key:"time",     label:"Time of Day", options:["Morning","Afternoon","Evening","Night"] },
    { key:"setting",  label:"Indoor / Outdoor", options:["Indoor","Outdoor"] },
    { key:"vibe",     label:"Vibe",        options:["Chill","Romantic","Active","Adventurous","Creative","Silly","Cozy","Spontaneous"] },
    { key:"season",   label:"Season",      options:["Spring","Summer","Fall","Winter"] },
    { key:"stage",    label:"Date Stage",  options:["First Date","Second/Third Date","Serious Relationship"] },
    { key:"dateType", label:"Double or Group Date?", options:["Solo/Couple","Double Date","Group Date"] }
  ];

  var STORAGE_KEY = "spark_state_v1";

  /* ---------- Icon system ----------
     Simple single-color line icons (SVG) used everywhere in place of emoji,
     for a cleaner, more modern look. Each entry is the inner markup for a
     24x24 viewBox; icon() wraps it in an <svg> that inherits the current
     text color, so icons automatically match button/text styling. */
  var ICONS = {
    zap:        '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10" fill="currentColor" stroke="none"/>',
    user:       '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
    users:      '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5"/><circle cx="17.5" cy="9" r="2.6"/><path d="M15.8 13.6c2.9.3 5.2 2.8 5.2 6.4"/>',
    camera:     '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7l1.5-2.5h5L16 7"/><circle cx="12" cy="13.5" r="3.5"/>',
    gift:       '<rect x="3" y="9" width="18" height="12" rx="1.5"/><path d="M3 13h18"/><path d="M12 9v12"/><path d="M8.5 9c-1.4 0-2.5-1.1-2.5-2.5S7.1 4 8.5 4C10.5 4 12 9 12 9"/><path d="M15.5 9c1.4 0 2.5-1.1 2.5-2.5S16.9 4 15.5 4C13.5 4 12 9 12 9"/>',
    settings:   '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.4M12 18.6V21M21 12h-2.4M5.4 12H3M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7M18.4 18.4l-1.7-1.7M7.3 7.3L5.6 5.6"/>',
    lightbulb:  '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 00-3.6 10.8c.6.5 1 1.2 1 2.2h5.2c0-1 .4-1.7 1-2.2A6 6 0 0012 3z"/>',
    "book-open":'<path d="M12 6.5C10.5 5 8 4.5 3 5v13c5-.5 7.5 0 9 1.5V6.5z"/><path d="M12 6.5C13.5 5 16 4.5 21 5v13c-5-.5-7.5 0-9 1.5V6.5z"/>',
    "check-circle":'<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16.5 9"/>',
    sliders:    '<path d="M4 6h9M17 6h3"/><circle cx="14" cy="6" r="2"/><path d="M4 12h3M10 12h10"/><circle cx="7" cy="12" r="2"/><path d="M4 18h9M17 18h3"/><circle cx="14" cy="18" r="2"/>',
    calendar:   '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4M16 3v4"/>',
    bookmark:   '<path d="M6 3.5h12v17l-6-4-6 4z"/>',
    star:       '<path d="M12 3l2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L12 17l-5.6 3.1 1.4-6.3-4.8-4.3 6.4-.6z"/>',
    "map-pin":  '<path d="M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.3"/>',
    compass:    '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5.5-5.5 2 2-5.5z" fill="currentColor" stroke="none"/>',
    heart:      '<path d="M12 20.5s-7.5-4.6-9.8-9.4C.7 7.6 2.2 4 5.7 3.3c2-.4 4 .5 5 2.3a4 4 0 013-2.3c3.5.7 5 4.3 3.5 7.8-2.3 4.8-9.8 9.4-9.8 9.4z"/>',
    share:      '<path d="M3 12l18-8-6 18-4-7z"/><path d="M15 13l6-9"/>',
    "trash-2":  '<path d="M4 7h16"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2"/><path d="M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13"/><path d="M10 11v6M14 11v6"/>',
    plus:       '<path d="M12 5v14M5 12h14"/>',
    copy:       '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/>',
    mountain:   '<path d="M3 19l6-10 4 6 2-3 6 7z"/>',
    music:      '<circle cx="6.5" cy="18" r="2.3"/><circle cx="17.5" cy="16" r="2.3"/><path d="M8.8 18V5l10-2v13"/>',
    film:       '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    utensils:   '<path d="M6 3v7a2 2 0 002 2 2 2 0 002-2V3"/><path d="M8 12v9"/><path d="M17 3c-1.7 0-3 2-3 5s1.3 5 3 5v9"/>',
    puzzle:     '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="12" cy="4" r="2"/>',
    tool:       '<path d="M14.5 3.5a4.5 4.5 0 00-5.8 5.8L3 15l3 3 5.7-5.7a4.5 4.5 0 005.8-5.8l-3.2 3.2-2-2z"/>',
    palette:    '<circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="10.5" r="1.2" fill="currentColor" stroke="none"/><path d="M9 15a3 3 0 003 2c2.2 0 3-1.3 3-2.6 0-.8-.6-1.4-1.4-1.4H10"/>',
    "shopping-bag":'<path d="M6 8h12l-1 12H7z"/><path d="M9 8V6a3 3 0 016 0v2"/>',
    activity:   '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
    tree:       '<path d="M12 3l5 7h-3l4 6h-4v5h-4v-5H6l4-6H7z"/>',
    landmark:   '<path d="M3 21h18"/><path d="M4 21V10M8 21V10M12 21V10M16 21V10M20 21V10"/><path d="M2 10l10-6 10 6"/>',
    smile:      '<circle cx="12" cy="12" r="9"/><path d="M8 14c1 1.5 2.5 2.3 4 2.3s3-.8 4-2.3"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/>',
    flag:       '<path d="M5 21V4"/><path d="M5 4h13l-3 4 3 4H5"/>',
    waves:      '<path d="M3 16c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M3 11c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/>',
    snowflake:  '<path d="M12 2v20M4 7l16 10M20 7L4 17"/>',
    inbox:      '<path d="M3 12h5l2 3h4l2-3h5"/><path d="M5 5h14l2 7v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7z"/>',
    "help-circle":'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 0c0 1.7-2.5 2-2.5 3.5"/><circle cx="12" cy="16.5" r=".5" fill="currentColor" stroke="none"/>',
    info:       '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><circle cx="12" cy="8" r=".8" fill="currentColor" stroke="none"/>',
    "chevron-up":'<path d="M6 15l6-6 6 6"/>',
    moon:       '<path d="M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z"/>',
    sun:        '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
    "message-circle":'<path d="M4 12a8 8 0 1114.3 4.9L21 20l-3.4-1.1A8 8 0 014 12z"/>',
    clock:      '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    "dollar-sign":'<path d="M12 2v20M17 6.5c0-2-2-3-5-3s-5 1.3-5 3.2c0 4 10 1.8 10 5.8 0 2-2 3.3-5 3.3s-5-1.3-5-3.3"/>',
    pin:        '<path d="M9 3h6l-1 6 4 2-6 6v4h-2v-4L4 11l4-2z"/>',
    "more-horizontal":'<circle cx="5" cy="12" r="1.35" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.35" fill="currentColor" stroke="none"/>'
  };
  function icon(name, cls){
    var body = ICONS[name] || ICONS.star;
    return '<svg class="icon' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }
  var CATEGORY_ICON_MAP = {
    "Arts, Crafts & Making Things": "palette",
    "Big Bucket-List Experiences": "star",
    "Building & DIY Projects": "tool",
    "Cooking, Food & Eating Challenges": "utensils",
    "Culture, Community & Local Attractions": "landmark",
    "Dancing & Live Entertainment": "music",
    "Games, Contests & Scavenger Hunts": "puzzle",
    "Hiking & Nature": "mountain",
    "Learning New Skills": "book-open",
    "Local Provo/Utah County Business Dates": "map-pin",
    "Local Utah/Idaho Spots & Day Trips": "compass",
    "Mall & Store Mischief": "shopping-bag",
    "Movies & Shows": "film",
    "Outdoor Adventure & Extreme Sports": "activity",
    "Picnics & Parks": "tree",
    "Romantic & Classic Dates": "heart",
    "Service, Kindness & Community": "gift",
    "Silly, Prank & Goofy Dates": "smile",
    "Sports, Games & Rec": "flag",
    "Themed Nights & Dinners": "utensils",
    "Water Activities": "waves",
    "Winter & Snow Adventures": "snowflake",
    "Real Nearby Spot": "map-pin"
  };
  function categoryIcon(category, cls){
    return icon(CATEGORY_ICON_MAP[category] || "star", cls);
  }
  // A kept idea can name its own icon. Otherwise fall back to the category.
  function ideaIcon(idea, cls){
    if(idea && idea.icon && ICONS[idea.icon]) return icon(idea.icon, cls);
    return categoryIcon(idea ? idea.category : null, cls);
  }

  /* ---------- State ---------- */
  var MINIMUM_AGE = 18;

  function parseProfileAge(value){
    if(typeof value === "number" && isFinite(value)) value = String(value);
    if(typeof value !== "string") return null;
    var s = value.trim();
    if(!/^\d{1,3}$/.test(s)) return null;
    var n = parseInt(s, 10);
    if(n < 1 || n > 120) return null;
    return n;
  }

  function confirmedMinimum(profile){
    if(!profile) return null;
    var raw = profile.ageConfirmedMinimum;
    if(raw == null || raw === "") return null;
    var n = typeof raw === "number" ? raw : parseInt(String(raw).trim(), 10);
    if(!isFinite(n)) return null;
    return n;
  }

  function hasAgeConfirmation(profile){
    if(!profile || typeof profile.ageConfirmedAt !== "string" || !profile.ageConfirmedAt) return false;
    return isFinite(Date.parse(profile.ageConfirmedAt));
  }

  // Older saves may still carry an age or a minimum. Under 18 fails the gate.
  // A missing confirmation timestamp also fails it. The date of birth itself
  // is never part of this check because it is not kept.
  function ageGateSatisfied(st){
    var profile = (st && st.profile) || {};
    var age = parseProfileAge(profile.age);
    var confirmed = confirmedMinimum(profile);
    if(age != null && age < MINIMUM_AGE) return false;
    if(confirmed != null && confirmed < MINIMUM_AGE) return false;
    return hasAgeConfirmation(profile);
  }

  var DOB_KEYS = ["age", "birthday", "dob", "dateOfBirth", "birthDate", "ageConfirmedMinimum"];

  function scrubProfileDob(profile){
    if(!profile || typeof profile !== "object") return false;
    var dirty = false;
    DOB_KEYS.forEach(function(k){
      if(Object.prototype.hasOwnProperty.call(profile, k)){
        delete profile[k];
        dirty = true;
      }
    });
    return dirty;
  }

  // Saved plans from the removed listings feed. Keep the row, drop the feed.
  function isRetiredListingSnapshot(idea){
    if(!idea || typeof idea !== "object" || idea.unavailable) return false;
    if(idea.isEvent === true) return true;
    if(typeof idea.stableKey === "string" && idea.stableKey.indexOf("tm:") === 0) return true;
    if(typeof idea.ticketUrl === "string" && idea.ticketUrl) return true;
    if(idea.category === "Local Event") return true;
    return false;
  }

  function neutralizeRetiredListing(idea){
    return {
      id: idea.id,
      stableKey: idea.stableKey || ("retired:" + idea.id),
      title: idea.title ? String(idea.title) : "Saved item",
      description: "This is no longer available.",
      category: "No longer available",
      icon: "calendar",
      setting: "Indoor",
      season: [],
      food: false,
      cost: "",
      duration: "",
      time: [],
      vibe: [],
      stage: [],
      dateType: [],
      unavailable: true
    };
  }

  // One object for who this browser is. userId stays null until a server
  // profile (email magic link) exists. localId is minted once per device.
  function newLocalId(){
    var alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    var out = "loc_";
    for(var i = 0; i < 20; i++) out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    return out;
  }

  function normalizeStoredIdentity(raw){
    var localId = "";
    var username = null;
    var userId = null;
    if(raw && typeof raw === "object"){
      if(typeof raw.localId === "string" && raw.localId.trim()) localId = raw.localId.trim();
      if(typeof raw.userId === "string" && raw.userId.trim()) userId = raw.userId.trim();
      if(typeof raw.username === "string" && raw.username.trim()){
        var checked = SparkUtil.validateUsername(raw.username);
        if(checked.ok) username = checked.username;
      }
    }
    if(!localId) localId = newLocalId();
    return { localId: localId, username: username, userId: userId };
  }

  function storedIdentityNeedsWrite(raw, next){
    if(!raw || typeof raw !== "object") return true;
    if(raw.localId !== next.localId) return true;
    if(!Object.prototype.hasOwnProperty.call(raw, "username") || raw.username !== next.username) return true;
    if(!Object.prototype.hasOwnProperty.call(raw, "userId") || raw.userId !== next.userId) return true;
    return false;
  }

  function defaultState(){
    return {
      onboarded:false,
      hasSeenTutorial:false,
      profile:{ name:"", gender:"Woman", photo:null, ageConfirmedAt:null },
      identity: normalizeStoredIdentity(null),
      datePlans:[],      // [{id, name, date, createdAt, ideaIds:[], likes?:{[id]:likedAt}, friendPicks:[{id,friendName,avatarEmoji,avatarColor,ideaId}]}] — named/dated planning sessions
      somedayIds:[],     // ideas saved with no active plan, or via the dedicated "Someday" button
      doneIds:[],       // [{id, date, rating?, recap?, photoKey?}] rating 1–5, recap one line, photoKey points at IndexedDB
      seenIds:[],        // ids already swiped (yes or no) this "session cycle"
      passedIds:[],
      filters:{ duration:[], cost:[], time:[], setting:[], vibe:[], season:[], stage:[], dateType:[], food:null, hide21:false, tonight:false, radiusMiles:SparkRadius.RADIUS_DEFAULT, localOnly:false },
      submittedIdeas:[],
      ideaSendBannerDismissed:false, // one-time "send ideas saved on this phone" offer
      deckOrder:null,    // cached shuffled id order for current filter set
      location:null,     // {lat, lng, grantedAt} once the user enables "Near You" real-place matching
      realIdeas:{},      // id -> full idea snapshot, for real (external) ideas the user has kept
      remoteIdeas:{},    // id -> approved activity the user saved or planned
      pinnedPlanIds:[],  // planning-list ids, first = top of the Saved index
      settings:{ autoDarkMode:true } // auto dark mode between 9pm-6am, toggle in profile
    };
  }

  var pendingDobScrub = false;
  var pendingIdentitySave = false;
  var pendingDoneNormalize = false;
  var pendingPinSave = false;
  var pendingLikeSave = false;
  var state = loadState();

  function loadState(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return defaultState();
      var parsed = JSON.parse(raw);
      var storedIdentity = parsed.identity;
      var d = defaultState();
      for(var k in d){ if(!(k in parsed)) parsed[k] = d[k]; }
      // Deep-merge filters specifically, so older saved states (from before a new
      // filter category like "dateType" existed) don't end up missing a nested key.
      parsed.filters = parsed.filters || {};
      for(var fk in d.filters){ if(!(fk in parsed.filters)) parsed.filters[fk] = d.filters[fk]; }
      parsed.filters.radiusMiles = SparkRadius.clampRadiusMiles(parsed.filters.radiusMiles);
      // Older saves have no Local events switch. Only an explicit true turns it on.
      parsed.filters.localOnly = parsed.filters.localOnly === true;
      // Same backfill treatment for settings (e.g. older saved states from
      // before the night-mode toggle existed won't have this key yet).
      parsed.settings = parsed.settings || {};
      for(var sk in d.settings){ if(!(sk in parsed.settings)) parsed.settings[sk] = d.settings[sk]; }
      if(!Array.isArray(parsed.datePlans)) parsed.datePlans = [];
      if(!Array.isArray(parsed.somedayIds)) parsed.somedayIds = [];
      delete parsed.postalCode;
      delete parsed.eventRadiusMiles;
      // Older plans (saved before friend-sharing existed) won't have a
      // friendPicks array yet — add it so share/highlight code can rely on it.
      parsed.datePlans.forEach(function(plan){
        if(!Array.isArray(plan.friendPicks)) plan.friendPicks = [];
      });
      // Pins are an ordered list of planning-list ids. Older saves have no
      // list; a plan that carried pinned:true is folded in once.
      if(!Array.isArray(parsed.pinnedPlanIds)){
        parsed.pinnedPlanIds = [];
        pendingPinSave = true;
      }
      var planIdSet = {};
      parsed.datePlans.forEach(function(plan){
        if(plan && plan.id != null) planIdSet[plan.id] = true;
      });
      var seenPins = {};
      var pins = [];
      parsed.pinnedPlanIds.forEach(function(id){
        if(id == null || !planIdSet[id] || seenPins[id]){
          if(id == null || !planIdSet[id] || seenPins[id]) pendingPinSave = true;
          return;
        }
        seenPins[id] = true;
        pins.push(id);
      });
      parsed.datePlans.forEach(function(plan){
        if(!plan || plan.id == null) return;
        if(plan.pinned === true && !seenPins[plan.id]){
          pins.push(plan.id);
          seenPins[plan.id] = true;
          pendingPinSave = true;
        }
        if(Object.prototype.hasOwnProperty.call(plan, "pinned")){
          delete plan.pinned;
          pendingPinSave = true;
        }
      });
      parsed.pinnedPlanIds = pins;
      // One-time migration: fold any legacy flat "savedIds" (from before the
      // date-planning feature existed) into the new Someday bucket, then clear
      // it so it can't resurrect already-removed ideas on a later load.
      if(Array.isArray(parsed.savedIds) && parsed.savedIds.length){
        var merged = parsed.somedayIds.slice();
        parsed.savedIds.forEach(function(id){ if(merged.indexOf(id) === -1) merged.push(id); });
        parsed.somedayIds = merged;
        parsed.savedIds = [];
      }
      // Drop references to real-idea ids nothing can resolve any more. Real
      // ideas used to get a throwaway counter id that restarted every load, so
      // states saved before snapshotting existed carry ids pointing at nothing.
      // Left in place they'd be invisible rows that still counted toward the
      // folder totals ("Favorites · 4 ideas" showing 2). The range is written
      // out literally because REAL_ID_MIN isn't assigned yet at load time.
      parsed.realIdeas = parsed.realIdeas || {};
      if(!parsed.remoteIdeas || typeof parsed.remoteIdeas !== "object" || Array.isArray(parsed.remoteIdeas)){
        parsed.remoteIdeas = {};
      }
      Object.keys(parsed.realIdeas).forEach(function(id){
        if(isRetiredListingSnapshot(parsed.realIdeas[id])){
          parsed.realIdeas[id] = neutralizeRetiredListing(parsed.realIdeas[id]);
        }
      });
      var resolvable = function(id){
        if(!(typeof id === "number" && id >= 9000000 && id < 10000000)) return true;
        return !!parsed.realIdeas[id];
      };
      parsed.somedayIds = parsed.somedayIds.filter(resolvable);
      parsed.datePlans.forEach(function(plan){
        // Flatten {id, likedAt} rows and drop junk likes before the id
        // filter, then prune likes that pointed at a removed id.
        if(SparkUtil.migrateListLikes(plan)) pendingLikeSave = true;
        plan.ideaIds = (plan.ideaIds || []).filter(resolvable);
        plan.friendPicks = (plan.friendPicks || []).filter(function(p){ return resolvable(p.ideaId); });
        if(SparkUtil.migrateListLikes(plan)) pendingLikeSave = true;
      });
      // Keep every field already stored on a done row (a note, a place, a
      // photo key). Rating and recap are only reshaped: stars become 1–5,
      // the recap becomes one line. Rows from before ratings existed stay
      // {id, date} and show up as unrated.
      var doneBefore = JSON.stringify(parsed.doneIds || []);
      parsed.doneIds = (parsed.doneIds || []).filter(function(d){ return d && resolvable(d.id); }).map(function(d){
        return SparkUtil.migrateDoneEntry(d);
      });
      if(JSON.stringify(parsed.doneIds) !== doneBefore) pendingDoneNormalize = true;
      parsed.profile = parsed.profile || {};
      // Existing ideas stay as they were saved. Nothing here is posted.
      // A missing status means "still on this device" and is sent only on a tap.
      if(!Array.isArray(parsed.submittedIdeas)) parsed.submittedIdeas = [];
      if(parsed.ideaSendBannerDismissed !== true) parsed.ideaSendBannerDismissed = false;
      if(!ageGateSatisfied(parsed)){
        parsed.profile.ageConfirmedAt = null;
        parsed.onboarded = false;
      }
      if(scrubProfileDob(parsed.profile)) pendingDobScrub = true;
      // Older saves have no identity. Mint localId once and keep it.
      // submittedIdeas are not rewritten; only new submissions get submittedBy.
      var normalizedIdentity = normalizeStoredIdentity(storedIdentity);
      if(storedIdentityNeedsWrite(storedIdentity, normalizedIdentity)){
        parsed.identity = normalizedIdentity;
        pendingIdentitySave = true;
      } else {
        parsed.identity = storedIdentity;
      }
      return parsed;
    }catch(e){ return defaultState(); }
  }
  function saveState(){
    scrubProfileDob(state.profile);
    syncRealIdeaSnapshots();
    syncRemoteIdeaSnapshots();
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
  }

  /* ---------- Real nearby-place ideas, auto-generated (talks to server.js) ----------
     As soon as location is available, we silently ask the server for a batch
     of real-place idea cards (Google Places + Claude) and shuffle them
     straight into the swipe deck alongside the built-in ideas — no button,
     no per-idea lookup. Everything here degrades gracefully: if the app was
     opened straight from a file (no server), or the server is running
     without API keys configured, this simply resolves to zero extra cards
     instead of erroring. */
  var apiStatusPromise = null;
  function fetchApiStatus(){
    if(apiStatusPromise) return apiStatusPromise;
    apiStatusPromise = fetch("/api/status")
      .then(function(r){ return r.json(); })
      .catch(function(){ return { placesConfigured:false, aiConfigured:false, offline:true }; });
    return apiStatusPromise;
  }

  /* ---------- Stable ids for real (external) ideas ----------
     Real ideas are generated fresh each session, but the user's saved/done
     lists persist ids only. With a throwaway counter (9000001, 9000002, …)
     that restarted every load, a saved real spot either vanished from Saved on
     the next load or — worse — its id was handed to a completely different
     place. Ids are now derived from a stable key, and every real idea the user
     actually keeps is snapshotted into state so it survives a reload. */
  var REAL_ID_MIN = 9000000, REAL_ID_SPAN = 1000000;
  var REAL_IDEAS_RUNTIME = [];   // this session's deck-eligible real ideas
  var REMOTE_IDEAS = [];         // approved activities from /api/activities
  var remoteFreshBucket = null;
  var remotePendingBucket = null;
  var remoteFetchGen = 0;
  var remoteAbort = null;
  var realIdeasLoading = false;
  var realKeyToId = {};          // stableKey -> numeric id
  var realIdToKey = {};          // numeric id -> stableKey

  function isRealId(id){
    return typeof id === "number" && id >= REAL_ID_MIN && id < REAL_ID_MIN + REAL_ID_SPAN;
  }

  // Google's place_id is stable across sessions and searches; name+address is
  // the fallback for anything that arrives without one.
  function stableKeyForReal(raw){
    if(raw.placeId) return "gp:" + raw.placeId;
    return "np:" + String(raw.placeName || raw.title || "").toLowerCase().trim() +
           "|" + String(raw.address || "").toLowerCase().trim();
  }

  // Maps a stable key onto a numeric id in the reserved real-idea range. Ids
  // must stay numeric: getCoverArtStyle() and motifFor() seed the generated
  // cover art off idea.id arithmetically, so a string id would break the art.
  // On the rare hash collision we probe forward; because every kept idea's key
  // is persisted next to its id and replayed here on load, an idea the user has
  // saved always maps back to the id it was first given.
  function realIdForKey(key){
    if(realKeyToId[key] != null) return realKeyToId[key];
    var id = REAL_ID_MIN + (Math.abs(hashStr(key)) % REAL_ID_SPAN);
    while(realIdToKey[id] != null && realIdToKey[id] !== key){
      id = REAL_ID_MIN + ((id - REAL_ID_MIN + 1) % REAL_ID_SPAN);
    }
    realKeyToId[key] = id;
    realIdToKey[id] = key;
    return id;
  }

  // Ids the user deliberately kept — everything that must still resolve after a
  // reload. Deliberately excludes seenIds/passedIds: a real idea that was only
  // swiped past doesn't need to outlive the session.
  function keptIdeaIds(){
    var ids = state.somedayIds.slice();
    state.datePlans.forEach(function(plan){
      ids = ids.concat(plan.ideaIds || []);
      (plan.friendPicks || []).forEach(function(p){ ids.push(p.ideaId); });
    });
    state.doneIds.forEach(function(d){ ids.push(d.id); });
    return ids;
  }

  // Puts persisted real ideas back into circulation on load, WITHOUT adding
  // them to REAL_IDEAS_RUNTIME — they're restored so Saved/Done/plans can
  // render them, not re-dealt into the swipe deck.
  function rehydrateRealIdeas(){
    var snaps = state.realIdeas || {};
    Object.keys(snaps).forEach(function(k){
      var idea = snaps[k];
      if(!idea || idea.id == null) return;
      if(idea.stableKey){
        realKeyToId[idea.stableKey] = idea.id;
        realIdToKey[idea.id] = idea.stableKey;
      }
      IDEAS_BY_ID[idea.id] = idea;
    });
  }

  // Keeps state.realIdeas in step with what the user has kept: snapshot any
  // real idea that's referenced, drop any that no longer is. Called from
  // saveState() so no individual save path can forget it.
  function syncRealIdeaSnapshots(){
    var keep = {};
    keptIdeaIds().forEach(function(id){
      if(!isRealId(id)) return;
      var idea = IDEAS_BY_ID[id] || (state.realIdeas || {})[id];
      if(idea) keep[id] = idea;
    });
    state.realIdeas = keep;
  }

  rehydrateRealIdeas();
  if(pendingDobScrub || pendingIdentitySave || pendingDoneNormalize || pendingPinSave || pendingLikeSave){
    pendingDobScrub = false;
    pendingIdentitySave = false;
    pendingDoneNormalize = false;
    pendingPinSave = false;
    pendingLikeSave = false;
    saveState();
  }

  function requestLocation(opts){
    opts = opts || {};
    if(!("geolocation" in navigator)){
      if(!opts.silent) showToast("Location isn't supported in this browser");
      return;
    }
    if(!opts.silent) showToast("Requesting location…");
    navigator.geolocation.getCurrentPosition(function(pos){
      state.location = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        grantedAt: todayISO()
      };
      saveState();
      if(!opts.silent) showToast("Location enabled!");
      updateLocationBar();
      updateRadiusPlace();
      refreshDeckAfterRadius();
      fetchNearbyIdeas();
      refreshRemoteActivities();
    }, function(err){
      if(!opts.silent) showToast("Couldn't get your location: " + (err && err.message ? err.message : "permission denied"));
    }, { timeout: 8000 });
  }

  function clearLocation(){
    state.location = null;
    saveState();
    renderContent();
  }

  // Turns one raw generated card (from /api/nearby-ideas) into a full idea
  // object matching the same shape as built-in ideas, so it can flow through
  // every existing code path (filters, saving, plans, Done, sharing) untouched.
  function hydrateRealIdea(raw, filters){
    var ALL_SEASONS = ["Spring","Summer","Fall","Winter"];
    var ALL_TIMES = ["Morning","Afternoon","Evening","Night"];
    var ALL_STAGES = ["First Date","Second/Third Date","Serious Relationship"];
    var ALL_DATETYPES = ["Solo/Couple","Double Date","Group Date"];
    var stableKey = stableKeyForReal(raw);
    return {
      id: realIdForKey(stableKey),
      stableKey: stableKey,
      title: raw.title,
      description: raw.description || "",
      materials: Array.isArray(raw.materials) ? raw.materials : [],
      category: "Real Nearby Spot",
      icon: raw.icon || "map-pin",
      setting: raw.setting === "Outdoor" ? "Outdoor" : "Indoor",
      season: (filters.season && filters.season.length) ? filters.season.slice() : ALL_SEASONS,
      food: !!raw.food,
      cost: raw.cost || "$20-$30",
      duration: (filters.duration && filters.duration.length) ? filters.duration[0] : (raw.durationGuess || "Half-day (2-5 hrs)"),
      time: (filters.time && filters.time.length) ? filters.time.slice() : ALL_TIMES,
      vibe: (raw.vibe && raw.vibe.length) ? raw.vibe : ["Chill"],
      stage: (filters.stage && filters.stage.length) ? filters.stage.slice() : ALL_STAGES,
      dateType: (filters.dateType && filters.dateType.length) ? filters.dateType.slice() : ALL_DATETYPES,
      isReal: true,
      placeId: raw.placeId || "",
      placeName: raw.placeName,
      address: raw.address,
      mapsUrl: raw.mapsUrl,
      rating: raw.rating || null,
      openNow: raw.openNow === true ? true : (raw.openNow === false ? false : null)
    };
  }

  // Silently fetches a batch of real-place ideas (once per session) and
  // mixes them into the deck as soon as they're ready. Never throws.
  function fetchNearbyIdeas(){
    if(!state.location || realIdeasLoading || REAL_IDEAS_RUNTIME.length) return;
    fetchApiStatus().then(function(status){
      if(status.offline || !status.placesConfigured || !status.aiConfigured) return;
      realIdeasLoading = true;
      updateLocationBar();
      fetch("/api/nearby-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: state.location.lat, lng: state.location.lng, filters: state.filters, count: 12 })
      })
        .then(function(r){ return r.json(); })
        .catch(function(){ return { ideas: [] }; })
        .then(function(result){
          realIdeasLoading = false;
          var ideas = (result && result.ideas) || [];
          ideas.forEach(function(raw){
            var idea = hydrateRealIdea(raw, state.filters);
            IDEAS_BY_ID[idea.id] = idea;
            // A stable id means a place we've already got can come back in a
            // later batch; keep one copy so it isn't dealt into the deck twice.
            var known = REAL_IDEAS_RUNTIME.some(function(x){ return x.id === idea.id; });
            if(!known) REAL_IDEAS_RUNTIME.push(idea);
          });
          updateLocationBar();
          if(ideas.length){
            var deckEl = $("#deck");
            if(deckEl){ renderDeckCards(deckEl); updateResultCount(); }
          }
        });
    });
  }

  // Approved activities live in Postgres. Mix them into the same deck as the
  // built-in ideas. A saved or planned one is snapshotted so it still opens
  // after a reload, the same way a kept nearby place does.
  function isRemoteIdeaId(id){
    return typeof id === "string" && id.indexOf("db:") === 0;
  }

  function cloneIdeaSnapshot(idea){
    if(!idea || typeof idea !== "object") return null;
    try { return JSON.parse(JSON.stringify(idea)); }
    catch(err){ return idea; }
  }

  function syncRemoteIdeaSnapshots(){
    var keep = {};
    keptIdeaIds().forEach(function(id){
      if(!isRemoteIdeaId(id)) return;
      var idea = IDEAS_BY_ID[id] || (state.remoteIdeas || {})[id];
      var copy = cloneIdeaSnapshot(idea);
      if(!copy) return;
      if(copy.id == null) copy.id = id;
      if(!isRemoteIdeaId(copy.id)) return;
      keep[id] = copy;
    });
    state.remoteIdeas = keep;
  }

  // The activities feed drops past events. Saved lists keep their snapshot
  // so the card still renders. Nothing here removes an id from a list.
  function restoreSavedRemoteSnapshots(){
    var store = state.remoteIdeas || {};
    var snaps = [];
    Object.keys(store).forEach(function(id){
      if(store[id]) snaps.push(store[id]);
    });
    var dropped = snaps;
    if(typeof SparkRemoteActivities !== "undefined" && SparkRemoteActivities.retainSavedIdeas){
      dropped = SparkRemoteActivities.retainSavedIdeas(REMOTE_IDEAS, snaps);
    }
    dropped.forEach(function(idea){
      if(idea && idea.id != null && !IDEAS_BY_ID[idea.id]) IDEAS_BY_ID[idea.id] = idea;
    });
    snaps.forEach(function(idea){
      if(idea && idea.id != null && !IDEAS_BY_ID[idea.id]) IDEAS_BY_ID[idea.id] = idea;
    });
  }

  function ideaForSaved(id){
    if(id == null) return null;
    if(IDEAS_BY_ID[id]) return IDEAS_BY_ID[id];
    restoreSavedRemoteSnapshots();
    if(IDEAS_BY_ID[id]) return IDEAS_BY_ID[id];
    var real = state.realIdeas && state.realIdeas[id];
    if(real){
      IDEAS_BY_ID[id] = real;
      return real;
    }
    return null;
  }

  function rehydrateRemoteIdeas(){
    var snaps = state.remoteIdeas || {};
    Object.keys(snaps).forEach(function(id){
      var idea = snaps[id];
      if(!idea || !isRemoteIdeaId(idea.id)) return;
      IDEAS_BY_ID[idea.id] = idea;
    });
  }

  function matchingBuiltinIds(){
    var ids = [];
    for(var i = 0; i < IDEAS_DATA.length; i++){
      if(matchesFilters(IDEAS_DATA[i], state.filters)) ids.push(IDEAS_DATA[i].id);
    }
    return ids;
  }

  function extraDeckIds(){
    var ids = [];
    for(var i = 0; i < REMOTE_IDEAS.length; i++){
      if(matchesFilters(REMOTE_IDEAS[i], state.filters)) ids.push(REMOTE_IDEAS[i].id);
    }
    if(state.location){
      for(var r = 0; r < REAL_IDEAS_RUNTIME.length; r++){
        if(matchesFilters(REAL_IDEAS_RUNTIME[r], state.filters)) ids.push(REAL_IDEAS_RUNTIME[r].id);
      }
    }
    return ids;
  }

  function deckSignature(builtinIds, extraIds){
    var loc = state.location;
    var locKey = (loc && typeof loc.lat === "number" && typeof loc.lng === "number")
      ? (loc.lat + "," + loc.lng) : "";
    var plan = getActivePlan();
    var planKey = plan && plan.date ? plan.date : "";
    var todayKey = SparkOccurrences.denverToday(new Date());
    return JSON.stringify(state.filters) + "|" + locKey + "|" + planKey + "|" + todayKey + "|" + builtinIds.length + "|" + extraIds.join(",");
  }

  function rememberDeckSignature(){
    if(!deckOrderCache) return;
    var builtinIds = matchingBuiltinIds();
    deckOrderCache.signature = deckSignature(builtinIds, extraDeckIds());
  }

  // Adds approved activities to the deck. Ones that arrive while a card is
  // already showing are appended, so the card in hand stays put.
  function applyRemoteIdeas(ideas){
    if(typeof SparkRemoteActivities === "undefined" || !ideas || !ideas.length) return [];
    var fresh = SparkRemoteActivities.dedupeAgainstBuiltins(ideas, IDEAS_DATA);
    var known = Object.create(null);
    for(var i = 0; i < REMOTE_IDEAS.length; i++) known[REMOTE_IDEAS[i].id] = i;
    var added = [];
    fresh.forEach(function(idea){
      IDEAS_BY_ID[idea.id] = idea;
      if(known[idea.id] == null){
        known[idea.id] = REMOTE_IDEAS.length;
        REMOTE_IDEAS.push(idea);
        added.push(idea);
      } else {
        REMOTE_IDEAS[known[idea.id]] = idea;
      }
    });
    if(deckOrderCache && added.length){
      var matching = [];
      added.forEach(function(idea){
        if(matchesFilters(idea, state.filters)) matching.push(idea.id);
      });
      if(matching.length){
        deckOrderCache.ids = SparkRemoteActivities.appendNewIds(deckOrderCache.ids, matching);
        rememberDeckSignature();
      }
    }
    var deckEl = $("#deck");
    var cardShowing = false;
    try {
      cardShowing = !!(deckEl && deckEl.querySelector && deckEl.querySelector(".swipe-card"));
    } catch (err) {}
    if(added.length && deckEl && !cardShowing){
      renderDeckCards(deckEl);
      updateResultCount();
    } else if(added.length){
      updateResultCount();
    }
    restoreSavedRemoteSnapshots();
    return added;
  }

  function hydrateRemoteCache(){
    if(typeof SparkRemoteActivities === "undefined") return;
    try {
      var loc = state.location;
      var bucket = SparkRemoteActivities.locationBucket(loc && loc.lat, loc && loc.lng);
      var cached = SparkRemoteActivities.readCache(localStorage, bucket, Date.now());
      if(cached && cached.hit && cached.ideas && cached.ideas.length) applyRemoteIdeas(cached.ideas);
    } catch (err) {}
  }

  // At most once per location bucket: on open, when the saved copy is older
  // than about six hours, or when the rough location changes. Never on swipe.
  function refreshRemoteActivities(){
    if(typeof SparkRemoteActivities === "undefined") return;
    var loc = state.location;
    var bucket = SparkRemoteActivities.locationBucket(loc && loc.lat, loc && loc.lng);
    if(remoteFreshBucket === bucket || remotePendingBucket === bucket) return;
    if(remoteAbort){
      try { remoteAbort.abort(); } catch (err) {}
      remoteAbort = null;
    }
    var controller = null;
    if(typeof AbortController === "function"){
      try { controller = new AbortController(); } catch (err) { controller = null; }
    }
    remoteAbort = controller;
    remotePendingBucket = bucket;
    var generation = ++remoteFetchGen;
    SparkRemoteActivities.syncActivities({
      storage: localStorage,
      lat: loc && loc.lat,
      lng: loc && loc.lng,
      builtins: IDEAS_DATA,
      fetch: function(url, options){ return fetch(url, options); },
      signal: controller ? controller.signal : undefined,
      timeoutMs: SparkRemoteActivities.FETCH_TIMEOUT_MS
    }).then(function(result){
      if(generation !== remoteFetchGen) return;
      if(remoteAbort === controller) remoteAbort = null;
      remotePendingBucket = null;
      if(result && result.ideas && result.ideas.length) applyRemoteIdeas(result.ideas);
      if(result && result.ok) remoteFreshBucket = bucket;
    }).catch(function(){
      if(generation !== remoteFetchGen) return;
      if(remoteAbort === controller) remoteAbort = null;
      remotePendingBucket = null;
    });
  }

  // Re-renders just the location bar (chip / loading text) without touching
  // the deck underneath, so in-flight swipes aren't disturbed.
  function updateLocationBar(){
    var old = document.getElementById("location-bar");
    if(!old || !old.parentNode) return;
    var fresh = buildLocationBar();
    old.parentNode.replaceChild(fresh, old);
  }

  // At most this many built-in ideas between two real nearby spots. Spreading a dozen extras *evenly* across 2000
  // built-in ideas sounds fair but buries the first one ~200 cards deep, which
  // in practice means nobody ever reaches it — the whole point of mixing them
  // in is that you meet one early. Small enough to surface quickly, large
  // enough that the built-in ideas still dominate the deck.
  var EXTRAS_EVERY = 8;

  // Interleaves real-place ids among built-in ids, so they're mixed
  // into the deck from the start rather than only appearing at the very end.
  function interleaveIds(builtinIds, realIds){
    if(!realIds.length) return builtinIds;
    if(!builtinIds.length) return realIds;
    var result = [];
    var evenly = Math.floor(builtinIds.length / (realIds.length + 1));
    var step = Math.max(1, Math.min(evenly, EXTRAS_EVERY));
    var ri = 0;
    for(var i = 0; i < builtinIds.length; i++){
      result.push(builtinIds[i]);
      if((i + 1) % step === 0 && ri < realIds.length){
        result.push(realIds[ri++]);
      }
    }
    while(ri < realIds.length) result.push(realIds[ri++]);
    return result;
  }

  function displayCost(idea){
    return (idea && idea.cost) ? idea.cost : "";
  }

  /* ---------- UI router state (not persisted) ---------- */
  var ui = {
    tab:"discover", screen:"list", detailIdeaId:null, detailFriendId:null, filterDraft:null, profileMenuOpen:null,
    activePlanId:null,   // id of the date plan currently being swiped for; null = casual/Someday mode
    savedBucket:null,    // null = lists index; {type:"plan", planId} | {type:"someday"} | {type:"done"}
    planDraft:null       // {name, date} while the "Plan a Date" overlay is open
  };

  /* ---------- Date-plan / Someday bucket helpers ---------- */
  function genId(prefix){
    return prefix + "_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e6).toString(36);
  }
  function getPlanById(planId){
    return state.datePlans.find(function(p){ return p.id === planId; }) || null;
  }
  function getActivePlan(){
    return ui.activePlanId ? getPlanById(ui.activePlanId) : null;
  }
  // Returns the "primary" bucket an idea is saved in, for the single Save
  // button's label. An idea can actually live in more than one bucket at once
  // (e.g. a plan AND Someday) — this just picks the most relevant one to show,
  // preferring the currently-active plan so the label matches what you're doing.
  function findIdeaBucket(ideaId){
    if(ui.activePlanId){
      var ap = getPlanById(ui.activePlanId);
      if(ap && ap.ideaIds.indexOf(ideaId) !== -1) return { type:"plan", planId: ap.id };
    }
    for(var i = 0; i < state.datePlans.length; i++){
      if(state.datePlans[i].ideaIds.indexOf(ideaId) !== -1) return { type:"plan", planId: state.datePlans[i].id };
    }
    if(state.somedayIds.indexOf(ideaId) !== -1) return { type:"someday" };
    return null;
  }
  function isIdeaSaved(ideaId){ return findIdeaBucket(ideaId) !== null; }
  // Unlike findIdeaBucket (which returns one "primary" bucket), this checks
  // membership in one SPECIFIC bucket — used to support an idea belonging to
  // more than one bucket at a time (e.g. saved to a plan AND to Someday).
  function isIdeaInBucket(ideaId, bucket){
    if(!bucket) return false;
    if(bucket.type === "plan"){
      var plan = getPlanById(bucket.planId);
      return !!(plan && plan.ideaIds.indexOf(ideaId) !== -1);
    }
    return state.somedayIds.indexOf(ideaId) !== -1;
  }
  function addIdeaToBucket(ideaId, bucket){
    if(bucket && bucket.type === "plan"){
      var plan = getPlanById(bucket.planId);
      if(plan && plan.ideaIds.indexOf(ideaId) === -1) plan.ideaIds.push(ideaId);
    } else {
      if(state.somedayIds.indexOf(ideaId) === -1) state.somedayIds.push(ideaId);
    }
  }
  function removeIdeaFromBucket(ideaId, bucket){
    if(!bucket) return;
    if(bucket.type === "plan"){
      var plan = getPlanById(bucket.planId);
      if(plan){
        var idx = plan.ideaIds.indexOf(ideaId);
        if(idx !== -1) plan.ideaIds.splice(idx, 1);
        SparkUtil.forgetListLike(plan, ideaId);
      }
    } else {
      var i2 = state.somedayIds.indexOf(ideaId);
      if(i2 !== -1) state.somedayIds.splice(i2, 1);
    }
  }
  // Removes an idea from EVERY bucket it might be in (a plan can dual-save
  // into Someday too, so a single findIdeaBucket() call isn't enough here).
  function removeIdeaEverywhere(ideaId){
    state.datePlans.forEach(function(plan){
      var idx = plan.ideaIds.indexOf(ideaId);
      if(idx !== -1) plan.ideaIds.splice(idx, 1);
      SparkUtil.forgetListLike(plan, ideaId);
    });
    var i2 = state.somedayIds.indexOf(ideaId);
    if(i2 !== -1) state.somedayIds.splice(i2, 1);
  }
  function bucketLabel(bucket){
    if(bucket && bucket.type === "plan"){
      var plan = getPlanById(bucket.planId);
      if(plan) return plan.name;
    }
    return "Favorites";
  }
  // Where a swipe-up save should land: the active plan if one is in progress,
  // otherwise the Someday bucket.
  function saveIdeaToActiveBucket(ideaId){
    var bucket = ui.activePlanId ? { type:"plan", planId: ui.activePlanId } : { type:"someday" };
    addIdeaToBucket(ideaId, bucket);
    return bucket;
  }
  function totalSavedCount(){
    var n = state.somedayIds.length;
    state.datePlans.forEach(function(p){ n += p.ideaIds.length; });
    return n;
  }
  // Collects every friend "favorite pick" across all plans that points at this
  // idea (a friend could in theory pick the same idea in more than one plan).
  function getFriendPicksForIdea(ideaId){
    var out = [];
    state.datePlans.forEach(function(plan){
      (plan.friendPicks || []).forEach(function(p){
        if(p.ideaId === ideaId){
          out.push({ friendName: p.friendName, avatarEmoji: p.avatarEmoji, avatarColor: p.avatarColor, planName: plan.name, planId: plan.id });
        }
      });
    });
    return out;
  }

  /* ---------- Helpers ---------- */
  function $(sel, root){ return (root||document).querySelector(sel); }
  function $all(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function el(tag, cls, html){
    var e = document.createElement(tag);
    if(cls) e.className = cls;
    if(html !== undefined) e.innerHTML = html;
    return e;
  }
  // Pure helpers live in util.js. Wrappers keep the call sites, and the
  // names the test harness reads, inside this IIFE.
  function escapeHtml(s){ return SparkUtil.escapeHtml(s); }
  function validateUsername(value){ return SparkUtil.validateUsername(value); }
  var toastTimer = null;
  function showToast(msg){
    var t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("toast-wrap", String(msg || "").length > 42);
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.classList.add("hidden"); }, 2200);
  }
  function openOverlay(id){ $(id).classList.remove("hidden"); }
  function closeOverlay(id){ $(id).classList.add("hidden"); }

  function fmtDate(d){ return SparkUtil.fmtDate(d); }
  function todayISO(){ return SparkUtil.todayISO(); }
  function localDateISO(d){ return SparkUtil.localDateISO(d); }

  /* ---------- Procedural cover art (unique generated art per idea) ---------- */
  function hashStr(s){ return SparkUtil.hashStr(s); }
  function mulberry32(seed){ return SparkUtil.mulberry32(seed); }
  var artCache = {};

  // Maps each exact category string to a "scene" type used to pick a silhouette
  // composition below. Categories not listed fall back to a sensible default.
  var SCENE_THEMES = {
    "Arts, Crafts & Making Things": "indoor",
    "Big Bucket-List Experiences": "mountains",
    "Building & DIY Projects": "indoor",
    "Cooking, Food & Eating Challenges": "kitchen",
    "Culture, Community & Local Attractions": "city",
    "Dancing & Live Entertainment": "stage",
    "Games, Contests & Scavenger Hunts": "park",
    "Hiking & Nature": "forest",
    "Learning New Skills": "indoor",
    "Local Provo/Utah County Business Dates": "mountains",
    "Local Utah/Idaho Spots & Day Trips": "mountains",
    "Mall & Store Mischief": "city",
    "Movies & Shows": "cinema",
    "Outdoor Adventure & Extreme Sports": "mountains",
    "Picnics & Parks": "park",
    "Romantic & Classic Dates": "sunset",
    "Service, Kindness & Community": "park",
    "Silly, Prank & Goofy Dates": "confetti",
    "Sports, Games & Rec": "field",
    "Themed Nights & Dinners": "citynight",
    "Water Activities": "water",
    "Winter & Snow Adventures": "snow"
  };

  var VALID_SCENES = ["mountains","forest","water","snow","park","field","city","citynight","stage","cinema","kitchen","indoor","sunset","confetti"];

  // Ground line for the cover art, in the 100x52 canvas getCoverArtStyle draws
  // on. Sits inside the slice window that both the card and the hero show.
  var HORIZON = 46;

  // Draws the idea's own motif (see motifs.js) standing on the horizon. Placed
  // right of centre so it doesn't sit behind the centred text on the detail
  // hero. Silent no-op for ideas with no motif, so art still works without one.
  // Fallback motifs per scene, so an idea with no motif of its own still gets
  // something fitting rather than bare scenery. Picked by id, so a given idea
  // always draws the same one.
  var SCENE_MOTIFS = {
    mountains:["summit","backpack","binoculars","balloon"],
    forest:["tent","campfire","backpack","wildflowers"],
    water:["canoe","paddleboard","swimming","fishing"],
    snow:["sled","snowman","iceskates","cocoa"],
    park:["frisbee","bike","wildflowers","binoculars"],
    field:["soccer","frisbee","golf","wildflowers"],
    city:["storefront","coffee","shopping","market"],
    citynight:["candles","storefront","coffee","discoball"],
    stage:["concert","guitar","karaoke","dancing"],
    cinema:["movie","popcorn","drivein","movie"],
    kitchen:["cooking","pizza","baking","coffee"],
    indoor:["painting","pottery","camera","knitting"],
    sunset:["candles","wildflowers","binoculars","beach"],
    confetti:["partypopper","costume","rubberduck","karaoke"]
  };

  // Cover art and fallback motifs seed off a number. Built-in ids already
  // are. Approved activities use a stable "db:<id>" string, so their art
  // follows the database id instead of collapsing to one shared picture.
  function coverSeedId(idea){
    if(!idea) return 0;
    if(typeof idea.dbId === "number" && isFinite(idea.dbId)) return idea.dbId;
    if(typeof idea.id === "number" && isFinite(idea.id)) return idea.id;
    return hashStr(String(idea.id == null ? "" : idea.id));
  }

  function motifFor(idea){
    var lib = (typeof MOTIFS !== "undefined") && MOTIFS.M;
    if(!lib || !idea) return null;
    if(idea.motif && lib[idea.motif]) return lib[idea.motif];
    var pool = SCENE_MOTIFS[getSceneTheme(idea.category, idea)];
    if(!pool || !pool.length) return null;
    return lib[pool[Math.abs(coverSeedId(idea) | 0) % pool.length]] || null;
  }

  function motifMarkup(idea, pal, isNight){
    var art = motifFor(idea);
    if(!art) return "";
    var ink = isNight ? "#0C1428" : "#22303F";
    var acc = isNight ? "#FFC46B" : "#FF7A5C";
    var colors = { "{ink}": ink, "{acc}": acc, "{lit}": "#FFFFFF", "{sky}": pal.sky2 };
    art = art.replace(/\{(ink|acc|lit|sky)\}/g, function(m){ return colors[m]; });
    var s = 0.95, cx = 63;
    // local box is 40 wide with its baseline at y=40
    return '<g transform="translate(' + (cx - 20 * s).toFixed(2) + ',' +
      (HORIZON - 40 * s).toFixed(2) + ') scale(' + s + ')">' + art + '</g>';
  }

  // An idea can name its own scene (so an indoor cooking date inside a "Winter"
  // category doesn't get a snowy mountain backdrop); otherwise it falls back to
  // the scene for its category.
  function getSceneTheme(category, idea){
    if(idea && idea.scene && VALID_SCENES.indexOf(idea.scene) !== -1) return idea.scene;
    return SCENE_THEMES[category] || "park";
  }

  // Builds a small, seeded "scene" illustration (sky gradient + silhouette
  // elements) so every idea gets a unique, semi-realistic looking backdrop
  // without needing an external image source.
  function getCoverArtStyle(idea){
    if(artCache[idea.id]) return artCache[idea.id];
    var seed = (coverSeedId(idea) * 2654435761) ^ hashStr(idea.category) ^ hashStr(idea.title);
    var rnd = mulberry32(seed >>> 0);
    var theme = getSceneTheme(idea.category, idea);

    // Time of day / palette pools, chosen per-idea for variety.
    var palettes = [
      { sky1:"#FFD9A0", sky2:"#FF8C7A", name:"sunset" },
      { sky1:"#FFEFC2", sky2:"#FFB48A", name:"golden" },
      { sky1:"#BEE8FF", sky2:"#5FA8E0", name:"day" },
      { sky1:"#0E1A3B", sky2:"#3A2E6B", name:"night" },
      { sky1:"#B9E4FF", sky2:"#EFF9FF", name:"overcast" },
      { sky1:"#FFC9DE", sky2:"#B49CFF", name:"dusk" }
    ];
    // Certain themes look better with certain palette bias, but keep it
    // randomized-but-seeded so each idea still looks unique.
    var pool = palettes;
    if(theme === "citynight" || theme === "stage" || theme === "cinema") pool = [palettes[3], palettes[5], palettes[0]];
    else if(theme === "snow") pool = [palettes[2], palettes[4], palettes[5]];
    else if(theme === "water" || theme === "sunset") pool = [palettes[0], palettes[1], palettes[5]];
    var pal = pool[Math.floor(rnd() * pool.length)];

    // The canvas is deliberately wide (roughly 2:1) rather than square. It is
    // drawn with "slice" into boxes that are much wider than tall, so a square
    // canvas would have most of its height cropped away — the old art put its
    // scenery at y=74-100 and the detail hero never showed any of it. At 100x52
    // the hero shows about 83% of the canvas and the card shows all of it.
    var w = 100, h = 52;
    var sky = '<rect width="' + w + '" height="' + h + '" fill="url(#sky)"/>';
    var defs = '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + pal.sky1 + '"/>' +
      '<stop offset="100%" stop-color="' + pal.sky2 + '"/></linearGradient>';

    var isNight = pal.name === "night";
    var elements = "";

    // Sun / moon
    var sunX = 12 + Math.floor(rnd() * 64), sunY = 6 + Math.floor(rnd() * 11), sunR = 3.2 + rnd() * 2.6;
    elements += '<circle cx="' + sunX + '" cy="' + sunY + '" r="' + (sunR + 3.2).toFixed(1) + '" fill="#fff" opacity="0.14"/>';
    elements += '<circle cx="' + sunX + '" cy="' + sunY + '" r="' + sunR.toFixed(1) + '" fill="' + (isNight ? "#F4F1E3" : "#FFF6D8") + '" opacity="0.92"/>';

    if(isNight){
      var starCount = 18 + Math.floor(rnd() * 14);
      for(var s = 0; s < starCount; s++){
        var stx = Math.floor(rnd() * w), sty = Math.floor(rnd() * (h * 0.55)), str = (rnd() * 0.45 + 0.2).toFixed(2);
        elements += '<circle cx="' + stx + '" cy="' + sty + '" r="' + str + '" fill="#fff" opacity="' + (0.4 + rnd() * 0.5).toFixed(2) + '"/>';
      }
    }

    // Ground/base silhouette color, darker version of sky2 for contrast
    var groundColor = isNight ? "#12102A" : "#2A2540";
    var midColor = isNight ? "#1B1840" : "#3B3560";

    function jaggedPath(baseY, amp, segs, color, opacity){
      var pts = "M0," + h;
      var stepW = w / segs;
      for(var i = 0; i <= segs; i++){
        var x = Math.round(i * stepW);
        var y = Math.round(baseY - rnd() * amp);
        pts += " L" + x + "," + y;
      }
      pts += " L" + w + "," + h + " Z";
      return '<path d="' + pts + '" fill="' + color + '" opacity="' + opacity + '"/>';
    }

    function buildingsRow(baseY, count, color, opacity){
      var svg = "";
      var bw = w / count;
      for(var i = 0; i < count; i++){
        var bx = i * bw + rnd() * 2;
        var bh = 5 + rnd() * (h - baseY + 12);
        var bwid = bw * (0.55 + rnd() * 0.4);
        svg += '<rect x="' + bx.toFixed(1) + '" y="' + (baseY - bh).toFixed(1) + '" width="' + bwid.toFixed(1) + '" height="' + (bh + 14).toFixed(1) + '" fill="' + color + '" opacity="' + opacity + '"/>';
        if(rnd() < 0.7){
          var winCols = 1 + Math.floor(rnd() * 2);
          for(var wc = 0; wc < winCols; wc++){
            var winY = baseY - bh + 2.4 + rnd() * (bh * 0.5);
            svg += '<rect x="' + (bx + 2 + wc * (bwid / (winCols + 1))).toFixed(1) + '" y="' + winY.toFixed(1) + '" width="1" height="1.3" fill="#FFE49A" opacity="' + (0.5 + rnd() * 0.4).toFixed(2) + '"/>';
          }
        }
      }
      return svg;
    }

    function treesRow(baseY, count, color, opacity){
      var svg = "";
      for(var i = 0; i < count; i++){
        var tx = (i + 0.5) * (w / count) + (rnd() * 6 - 3);
        var th = 3.4 + rnd() * 5.6;
        svg += '<polygon points="' + tx.toFixed(1) + ',' + (baseY - th).toFixed(1) + ' ' + (tx - th * 0.55).toFixed(1) + ',' + baseY + ' ' + (tx + th * 0.55).toFixed(1) + ',' + baseY + '" fill="' + color + '" opacity="' + opacity + '"/>';
      }
      return svg;
    }

    if(theme === "mountains"){
      elements += jaggedPath(30, 11, 6, midColor, 0.55);
      elements += jaggedPath(36, 10, 8, groundColor, 0.85);
      elements += treesRow(50, 9, groundColor, 0.9);
    } else if(theme === "forest"){
      elements += jaggedPath(32, 6, 5, midColor, 0.4);
      elements += treesRow(45, 7, midColor, 0.65);
      elements += treesRow(52, 10, groundColor, 0.92);
    } else if(theme === "water"){
      elements += jaggedPath(31, 5, 5, midColor, 0.35);
      elements += '<rect x="0" y="37" width="' + w + '" height="' + (h - 37) + '" fill="' + groundColor + '" opacity="0.5"/>';
      for(var wv = 0; wv < 6; wv++){
        var wy = 39 + wv * 2.2;
        elements += '<path d="M0,' + wy + ' Q ' + (w * 0.25) + ',' + (wy - 2) + ' ' + (w * 0.5) + ',' + wy + ' T ' + w + ',' + wy + '" stroke="#fff" stroke-width="0.6" fill="none" opacity="' + (0.12 + rnd() * 0.1).toFixed(2) + '"/>';
      }
    } else if(theme === "snow"){
      elements += jaggedPath(29, 13, 6, "#E7EEF7", 0.5);
      elements += jaggedPath(37, 9, 7, "#FFFFFF", 0.8);
      elements += treesRow(50, 8, "#1F2A33", 0.6);
      var flakeCount = 26;
      for(var f = 0; f < flakeCount; f++){
        elements += '<circle cx="' + Math.floor(rnd() * w) + '" cy="' + Math.floor(rnd() * h) + '" r="' + (0.35 + rnd() * 0.55).toFixed(2) + '" fill="#fff" opacity="' + (0.5 + rnd() * 0.4).toFixed(2) + '"/>';
      }
    } else if(theme === "park"){
      elements += jaggedPath(41, 4, 6, midColor, 0.3);
      elements += treesRow(47, 6, midColor, 0.55);
      elements += treesRow(52, 8, groundColor, 0.85);
    } else if(theme === "field"){
      elements += '<rect x="0" y="38" width="' + w + '" height="' + (h - 38) + '" fill="' + groundColor + '" opacity="0.8"/>';
      for(var g = 0; g < 40; g++){
        var gx = rnd() * w, gy = 38 + rnd() * 12, gh = 1.2 + rnd() * 1.8;
        elements += '<rect x="' + gx.toFixed(1) + '" y="' + gy.toFixed(1) + '" width="0.6" height="' + gh.toFixed(1) + '" fill="' + midColor + '" opacity="0.5"/>';
      }
    } else if(theme === "city" || theme === "citynight"){
      elements += buildingsRow(41, 8, midColor, 0.55);
      elements += buildingsRow(47, 11, groundColor, 0.92);
    } else if(theme === "stage"){
      elements += '<rect x="0" y="38" width="' + w + '" height="' + (h - 38) + '" fill="' + groundColor + '" opacity="0.9"/>';
      for(var sp = 0; sp < 4; sp++){
        var spx = 15 + sp * 24;
        elements += '<polygon points="' + spx + ',3 ' + (spx - 9) + ',38 ' + (spx + 9) + ',38" fill="#FFE9A8" opacity="0.16"/>';
      }
      elements += '<rect x="0" y="38" width="' + w + '" height="1.2" fill="#000" opacity="0.25"/>';
    } else if(theme === "cinema"){
      elements += '<rect x="10" y="7" width="80" height="26" rx="1.6" fill="#000" opacity="0.55"/>';
      elements += '<rect x="13" y="9.4" width="74" height="21" rx="1" fill="#5FA8E0" opacity="0.35"/>';
      elements += jaggedPath(47, 4, 6, groundColor, 0.8);
    } else if(theme === "kitchen"){
      elements += '<rect x="0" y="34" width="' + w + '" height="' + (h - 34) + '" fill="' + groundColor + '" opacity="0.85"/>';
      for(var k = 0; k < 5; k++){
        elements += '<rect x="' + (6 + k * 18) + '" y="36.4" width="14" height="10.4" rx="1.2" fill="' + midColor + '" opacity="0.55"/>';
      }
    } else if(theme === "indoor"){
      elements += '<rect x="0" y="36" width="' + w + '" height="' + (h - 36) + '" fill="' + groundColor + '" opacity="0.75"/>';
      elements += '<rect x="12" y="15.6" width="22" height="20.4" fill="' + midColor + '" opacity="0.4"/>';
      elements += '<rect x="66" y="10.4" width="22" height="25.6" fill="' + midColor + '" opacity="0.4"/>';
    } else if(theme === "sunset"){
      elements += jaggedPath(38, 5, 6, midColor, 0.4);
      elements += jaggedPath(45, 4, 8, groundColor, 0.75);
    } else if(theme === "confetti"){
      elements += jaggedPath(44, 4, 6, groundColor, 0.5);
      var confColors = ["#FFD166", "#EF476F", "#06D6A0", "#118AB2", "#FFF"];
      for(var c = 0; c < 22; c++){
        var ccx = rnd() * w, ccy = rnd() * h * 0.8, crot = Math.floor(rnd() * 360);
        elements += '<rect x="' + ccx.toFixed(1) + '" y="' + ccy.toFixed(1) + '" width="1.5" height="1.5" fill="' + confColors[Math.floor(rnd() * confColors.length)] + '" opacity="0.85" transform="rotate(' + crot + ' ' + ccx.toFixed(1) + ' ' + ccy.toFixed(1) + ')"/>';
      }
    } else {
      elements += jaggedPath(42, 6, 6, groundColor, 0.7);
    }

    // The art is rendered with "slice" into boxes far wider than they are tall,
    // so only a band of this 100x100 canvas is ever on screen: y 17-83 on a
    // swipe card, y 28-72 on the detail hero. Everything the scene draws sits
    // low (ground around y=100), which put it outside both windows — the art
    // read as empty sky. Lift the whole scene so its ground line lands on
    // HORIZON, inside the band both views share, then carry the ground colour
    // down to the bottom so nothing floats.
    // The activity's own drawing, planted on the scene's ground line.
    elements += motifMarkup(idea, pal, isNight);

    // Soft bottom vignette so the info that sits on top of the card stays legible
    var vignette = '<rect x="0" y="' + (h * 0.6) + '" width="' + w + '" height="' + (h * 0.4) + '" fill="url(#vg)"/>';
    defs += '<linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#000" stop-opacity="0"/>' +
      '<stop offset="100%" stop-color="#000" stop-opacity="0.38"/></linearGradient>';

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid slice">' +
      '<defs>' + defs + '</defs>' + sky + elements + vignette + '</svg>';
    var dataUri = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
    // single-quoted url() so this string is safe to embed inside a double-quoted
    // HTML style="..." attribute (used via innerHTML for swipe cards)
    var css = "background-image:url('" + dataUri + "');";
    artCache[idea.id] = css;
    return css;
  }

  /* ---------- Onboarding ---------- */
  var obPhotoData = null;
  $("#photo-input").addEventListener("change", function(e){
    var file = e.target.files && e.target.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(ev){
      obPhotoData = ev.target.result;
      $("#avatar-preview").innerHTML = '<img src="'+obPhotoData+'" alt="">';
    };
    reader.readAsDataURL(file);
  });

  function finishOnboarding(profile){
    profile = profile || {};
    var dob = String(profile.dob || "").trim();
    if(!SparkUtil.checkAge(dob).ok) return Promise.resolve(false);
    return fetch("/api/age-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dob: dob })
    }).then(function(r){ return r.json(); })
      .then(function(body){
        if(!body || body.ok !== true) return false;
        state.profile = {
          name: String(profile.name || "").trim() || "Friend",
          gender: profile.gender || "Woman",
          photo: profile.photo || null,
          ageConfirmedAt: new Date().toISOString()
        };
        state.onboarded = true;
        saveState();
        return true;
      })
      .catch(function(){ return false; });
  }

  function showAgeGate(){
    $("#view-onboarding").classList.remove("hidden");
    $("#view-tutorial").classList.add("hidden");
    $("#view-app").classList.add("hidden");
  }

  $("#onboarding-form").addEventListener("submit", function(e){
    e.preventDefault();
    finishOnboarding({
      name: $("#ob-name").value,
      dob: $("#ob-dob").value,
      gender: $("#ob-gender").value,
      photo: obPhotoData
    }).then(function(ok){
      if(!ok){
        showToast("You must be 18 or older to use Jaderoo.");
        return;
      }
      if(state.hasSeenTutorial){ enterApp(); } else { showTutorial(); }
    });
  });

  function enterApp(){
    $("#view-onboarding").classList.add("hidden");
    $("#view-tutorial").classList.add("hidden");
    $("#view-app").classList.remove("hidden");
    switchTab("discover");
    // Ask for location automatically (no button) — the browser's own
    // one-time permission prompt is the only thing the user sees. If they
    // deny or dismiss it, the app just carries on with built-in ideas only.
    // Approved activities load alongside that. Built-ins are already on screen.
    refreshRemoteActivities();
    if(state.location) fetchNearbyIdeas();
    else requestLocation({ silent:true });
  }

  /* ---------- How-to tutorial (shown once, right after signup) ---------- */
  var TUTORIAL_SLIDES = [
    { icon:"zap", title:"Swipe to Discover", text:"Swipe a card right if you're into the idea, or left to pass. Keep swiping to build your deck of favorites." },
    { icon:"sliders", title:"Filter it Your Way", text:"Tap Filters to narrow ideas down by budget, time of day, vibe, season, and whether it's a solo, double, or group date." },
    { icon:"bookmark", title:"Save & Track", text:"Save ideas you love for later from the Saved tab, and mark dates as Done once you've actually tried them." },
    { icon:"users", title:"Bring Your Friends", text:"Add friends with a QR code or from your contacts, see what they've tried and saved, and share your favorite ideas with them." },
    { icon:"lightbulb", title:"Share Your Own Ideas", text:"Got a great date idea? Submit it from your profile — and check Tips of Dating anytime you need a little inspiration." }
  ];
  var tutorialIndex = 0;
  function showTutorial(){
    tutorialIndex = 0;
    renderTutorial();
    $("#view-onboarding").classList.add("hidden");
    $("#view-tutorial").classList.remove("hidden");
  }
  function renderTutorial(){
    var wrap = $("#tutorial-content");
    wrap.innerHTML = "";
    var slide = TUTORIAL_SLIDES[tutorialIndex];
    var isLast = tutorialIndex === TUTORIAL_SLIDES.length - 1;

    var card = el("div", "tutorial-card");
    card.innerHTML =
      '<div class="tutorial-icon">' + icon(slide.icon) + '</div>' +
      '<h2 class="tutorial-title">' + escapeHtml(slide.title) + '</h2>' +
      '<p class="tutorial-text">' + escapeHtml(slide.text) + '</p>';
    wrap.appendChild(card);

    var dots = el("div", "tutorial-dots");
    TUTORIAL_SLIDES.forEach(function(_, i){
      dots.appendChild(el("span", "tutorial-dot" + (i === tutorialIndex ? " active" : "")));
    });
    wrap.appendChild(dots);

    var actions = el("div", "tutorial-actions");
    if(!isLast){
      var skipBtn = el("button", "btn-text", "Skip");
      skipBtn.type = "button";
      skipBtn.addEventListener("click", finishTutorial);
      actions.appendChild(skipBtn);
    } else {
      actions.appendChild(el("span", "tutorial-spacer"));
    }
    var nextBtn = el("button", "btn-primary", isLast ? "Get Started" : "Next");
    nextBtn.type = "button";
    nextBtn.addEventListener("click", function(){
      if(isLast) finishTutorial();
      else { tutorialIndex++; renderTutorial(); }
    });
    actions.appendChild(nextBtn);
    wrap.appendChild(actions);
  }
  function finishTutorial(){
    state.hasSeenTutorial = true;
    saveState();
    enterApp();
  }

  /* ---------- Topbar / Nav ---------- */
  // The header is a flex sibling above the scrolling screen, so it stays
  // put. Discover is the exception: that screen hosts the same header.
  function parkTopbar(){
    var topbar = $(".topbar");
    var shell = $("#view-app");
    var content = $("#content");
    if(!topbar || !shell || !content) return;
    topbar.classList.remove("topbar-in-scroll");
    if(topbar.parentNode !== shell) shell.insertBefore(topbar, content);
  }
  function mountDiscoverHeader(wrap){
    var topbar = $(".topbar");
    if(!topbar || !wrap) return;
    topbar.classList.add("topbar-in-scroll");
    wrap.insertBefore(topbar, wrap.firstChild);
  }

  function setNavActive(tab){
    $all(".nav-btn").forEach(function(b){ b.classList.toggle("active", b.getAttribute("data-tab") === tab); });
  }

  $all(".nav-btn").forEach(function(btn){
    btn.addEventListener("click", function(){
      var tab = btn.getAttribute("data-tab");
      if(tab === "profile"){ openProfile(); return; }
      switchTab(tab);
    });
  });

  var TAB_TITLES = { discover:"Discover", friends:"Friends", saved:"Saved", done:"Done" };

  function applyTopbarTitle(text, opts){
    var title = $("#topbar-title");
    var iconEl = $("#topbar-icon");
    if(!title) return;
    var brand = text === "Discover" || text === "Jaderoo";
    var hero = !!(opts && opts.hero);
    if(brand){
      title.textContent = "JADEROO";
      title.classList.add("wordmark");
      title.classList.remove("display-title");
      if(iconEl) iconEl.hidden = false;
    } else {
      title.textContent = text;
      title.classList.remove("wordmark");
      title.classList.add("display-title");
      if(iconEl) iconEl.hidden = true;
    }
    title.classList.toggle("hero-title", hero && !brand);
  }

  function switchTab(tab){
    ui.tab = tab; ui.screen = "list"; ui.detailIdeaId = null; ui.detailFriendId = null; ui.savedBucket = null;
    setNavActive(tab);
    applyTopbarTitle(TAB_TITLES[tab] || "Jaderoo");
    renderContent();
  }

  function renderContent(){
    parkTopbar();
    var content = $("#content");
    content.innerHTML = "";
    if(ui.screen === "detail"){
      applyTopbarTitle("Date Idea");
      content.appendChild(buildDetailScreen(ui.detailIdeaId));
    } else if(ui.screen === "friendDetail"){
      applyTopbarTitle("Friend");
      content.appendChild(buildFriendDetailScreen(ui.detailFriendId));
    } else {
      if(ui.tab === "saved") applyTopbarTitle("Saved", { hero:true });
      else applyTopbarTitle(TAB_TITLES[ui.tab] || "Jaderoo");
      if(ui.tab === "discover") content.appendChild(buildDiscoverScreen());
      else if(ui.tab === "friends") content.appendChild(buildFriendsScreen());
      else if(ui.tab === "saved") content.appendChild(buildSavedScreen());
      else if(ui.tab === "done") content.appendChild(buildDoneScreen());
    }
  }

  function goToDetail(ideaId){
    ui.screen = "detail"; ui.detailIdeaId = ideaId;
    renderContent();
  }
  function goBackFromDetail(){
    ui.screen = "list"; ui.detailIdeaId = null;
    renderContent();
  }

  /* ---------- Filtering ---------- */
  function matchesFilters(idea, f){
    if(f.duration.length && f.duration.indexOf(idea.duration) === -1) return false;
    if(f.cost.length && f.cost.indexOf(idea.cost) === -1) return false;
    if(f.time.length && !idea.time.some(function(t){ return f.time.indexOf(t) !== -1; })) return false;
    if(f.setting.length){
      var ok = idea.setting === "Both" || f.setting.indexOf(idea.setting) !== -1;
      if(!ok) return false;
    }
    if(f.vibe.length && !idea.vibe.some(function(v){ return f.vibe.indexOf(v) !== -1; })) return false;
    if(f.season.length && !idea.season.some(function(s){ return f.season.indexOf(s) !== -1; })) return false;
    if(f.stage.length && !idea.stage.some(function(s){ return f.stage.indexOf(s) !== -1; })) return false;
    if(f.dateType.length && !idea.dateType.some(function(d){ return f.dateType.indexOf(d) !== -1; })) return false;
    if(f.food !== null && idea.food !== f.food) return false;
    if(f.hide21 && idea.age21 === true) return false;
    // Local off: the radius does not filter. Local on: a known place inside
    // radiusMiles stays; a place with no pin and no distanceMiles drops.
    // withinRadius still keeps a pin when the user position is missing.
    if(f.localOnly === true){
      if(!ideaHasKnownPlace(idea)) return false;
      if(!SparkRadius.withinRadius(idea, state.location, f.radiusMiles)) return false;
    }
    // Quick filter from the Discover chip. Not part of the Filters sheet,
    // and not counted on that button. See SparkUtil.suitsTonight.
    if(f.tonight === true && !SparkUtil.suitsTonight(idea)) return false;
    var plan = getActivePlan();
    var planDate = plan && typeof plan.date === "string" ? plan.date : "";
    // Deck only. A saved list keeps the idea after this day passes.
    if(!SparkOccurrences.visibleOnPlan(idea, planDate, new Date())) return false;
    return true;
  }

  // How many ideas the tonight chip would show, honoring the other filters.
  // Seen cards stay in the count: N is the size of the matching set.
  function tonightMatchCount(){
    var f = {};
    for(var k in state.filters) f[k] = state.filters[k];
    f.tonight = true;
    var n = 0;
    for(var i = 0; i < IDEAS_DATA.length; i++){
      if(matchesFilters(IDEAS_DATA[i], f)) n++;
    }
    if(state.location){
      for(var r = 0; r < REAL_IDEAS_RUNTIME.length; r++){
        if(matchesFilters(REAL_IDEAS_RUNTIME[r], f)) n++;
      }
    }
    for(var a = 0; a < REMOTE_IDEAS.length; a++){
      if(matchesFilters(REMOTE_IDEAS[a], f)) n++;
    }
    return n;
  }

  function toggleTonightFilter(){
    state.filters.tonight = state.filters.tonight !== true;
    saveState();
    return state.filters.tonight;
  }

  // A pin (lat/lng, location, or coordinates) or a measured distanceMiles.
  // Negative and non-numeric distances are not a place.
  function ideaHasKnownPlace(idea){
    if(SparkRadius.ideaPoint(idea)) return true;
    var n = idea && idea.distanceMiles;
    return typeof n === "number" && isFinite(n) && n >= 0;
  }

  function activeFilterCount(f){
    var n = 0;
    ["duration","cost","time","setting","vibe","season","stage","dateType"].forEach(function(k){ n += f[k].length; });
    if(f.food !== null) n += 1;
    if(f.hide21) n += 1;
    // The radius only filters while Local is on, so it only counts then.
    // Local itself counts even at the default 10 miles.
    if(f.localOnly === true){
      n += 1;
      if(SparkRadius.clampRadiusMiles(f.radiusMiles) !== SparkRadius.RADIUS_DEFAULT) n += 1;
    }
    return n;
  }

  function countIdeasMatching(f){
    var n = 0;
    for(var i = 0; i < IDEAS_DATA.length; i++){
      if(matchesFilters(IDEAS_DATA[i], f)) n++;
    }
    if(state.location){
      for(var r = 0; r < REAL_IDEAS_RUNTIME.length; r++){
        if(matchesFilters(REAL_IDEAS_RUNTIME[r], f)) n++;
      }
    }
    for(var a = 0; a < REMOTE_IDEAS.length; a++){
      if(matchesFilters(REMOTE_IDEAS[a], f)) n++;
    }
    return n;
  }

  function formatShowIdeas(n){
    var text = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return "Show " + text + (n === 1 ? " idea" : " ideas");
  }

  function updateFilterApplyLabel(){
    var btn = $("#filter-apply");
    if(!btn || !ui.filterDraft) return;
    btn.textContent = formatShowIdeas(countIdeasMatching(ui.filterDraft));
  }

  // The interleaved deck order, cached so it stays PUT between swipes.
  // Recomputing it from what's left after every swipe looks equivalent but
  // isn't: the extras get re-inserted N cards deep each time, so the first
  // real spot sits perpetually N cards ahead and is never actually
  // reached, no matter how long you swipe. Ordering once and then merely
  // hiding what's been seen is what makes the position real.
  var deckOrderCache = null;   // { signature, ids }

  function computeDeck(){
    // Real nearby spots need coordinates. Built-in ideas and approved
    // activities do not. Approved rows are part of the same extra lane so
    // they show up early instead of after the whole built-in catalog.
    var builtinIds = matchingBuiltinIds();
    var extraIds = extraDeckIds();

    // Rebuild the order only when the deck's *contents* change — a new filter
    // set, or a fresh batch of real spots arriving. Swiping doesn't change it.
    // A late activities response appends instead of rebuilding, so the card
    // in hand keeps its place.
    var signature = deckSignature(builtinIds, extraIds);
    if(!deckOrderCache || deckOrderCache.signature !== signature){
      deckOrderCache = { signature: signature, ids: interleaveIds(builtinIds, extraIds) };
    }

    var seen = {};
    state.seenIds.forEach(function(id){ seen[id] = true; });
    var remaining = deckOrderCache.ids.filter(function(id){ return !seen[id]; });
    return { total: deckOrderCache.ids.length, remaining: remaining };
  }

  /* ---------- Discover screen ---------- */
  // City on the saved fix, else the nearest confident pin within 15 miles,
  // else "Near you". A denied or missing fix stays on the fallback. No
  // second permission prompt.
  function placeLabel(){
    var loc = state.location;
    if(loc && typeof loc.city === "string" && loc.city.trim()) return loc.city.trim();
    if(loc && typeof loc.label === "string" && loc.label.trim()) return loc.label.trim();
    var pins = (typeof IDEA_PINS === "undefined") ? null : IDEA_PINS;
    var inferred = SparkRadius.nearestPlaceLabel(loc, pins, SparkRadius.NEAREST_LABEL_MILES);
    return inferred || "Near you";
  }

  // Filters "How far?" line. A known city reads "Near you · Provo".
  // No fix keeps the radius row's fallback, which is "Near you".
  function nearYouLabel(){
    var city = placeLabel();
    if(!city || city === "Near you") return "Near you";
    return "Near you · " + city;
  }

  // Miles from the saved fix when both sides have a point. Otherwise a
  // distance the server already measured. No fix and no distanceMiles
  // means the card has nothing to badge.
  function ideaDistanceMiles(idea){
    if(!idea || typeof idea !== "object") return null;
    var point = SparkRadius.ideaPoint(idea);
    var origin = SparkRadius.ideaPoint(state.location);
    if(point && origin) return SparkRadius.haversineMiles(origin, point);
    var n = idea.distanceMiles;
    if(typeof n === "number" && isFinite(n) && n >= 0) return n;
    return null;
  }

  function distanceAwayLabel(miles){
    if(typeof miles !== "number" || !isFinite(miles) || miles < 0) return "";
    return (Math.round(miles * 10) / 10).toFixed(1) + " mi away";
  }

  function distanceBadgeHtml(idea){
    if(!state.filters || state.filters.localOnly !== true) return "";
    var label = distanceAwayLabel(ideaDistanceMiles(idea));
    if(!label) return "";
    return '<span class="distance-badge">' + icon("map-pin") + escapeHtml(label) + "</span>";
  }

  function localPillText(){
    return "Local · " + SparkRadius.radiusLabel(state.filters.radiusMiles);
  }

  function deckCountLabel(deck){
    var noun = state.filters.localOnly === true ? "nearby ideas" : "ideas";
    return deck.remaining.length + " of " + deck.total + " " + noun;
  }

  function setSliderPct(slider, pct){
    if(slider.style && typeof slider.style.setProperty === "function") slider.style.setProperty("--radius-pct", pct);
    else if(slider.style) slider.style["--radius-pct"] = pct;
  }

  function syncRadiusSlider(slider, miles){
    var pos = SparkRadius.milesToSlider(miles);
    var clamped = SparkRadius.clampRadiusMiles(miles);
    slider.value = String(pos);
    setSliderPct(slider, (pos / SparkRadius.RADIUS_SLIDER_MAX * 100) + "%");
    slider.setAttribute("aria-valuenow", String(clamped));
    slider.setAttribute("aria-valuetext", clamped + " miles");
  }

  function sliderFillPct(slider){
    var pos = Number(slider.value);
    if(!isFinite(pos)) pos = 0;
    return (pos / SparkRadius.RADIUS_SLIDER_MAX * 100) + "%";
  }

  function makeRadiusSlider(className, label){
    var slider = document.createElement("input");
    slider.type = "range";
    slider.className = "radius-slider " + className;
    slider.min = "0";
    slider.max = String(SparkRadius.RADIUS_SLIDER_MAX);
    slider.step = "1";
    slider.setAttribute("aria-label", label);
    slider.setAttribute("aria-valuemin", String(SparkRadius.RADIUS_MIN));
    slider.setAttribute("aria-valuemax", String(SparkRadius.RADIUS_MAX));
    return slider;
  }

  function buildRadiusRow(){
    var row = el("div", "radius-row");
    var place = el("div", "radius-place");
    place.innerHTML = icon("map-pin") + '<span class="radius-place-name" id="radius-place-name"></span>';
    place.querySelector(".radius-place-name").textContent = placeLabel();
    var miles = SparkRadius.clampRadiusMiles(state.filters.radiusMiles);
    var slider = makeRadiusSlider("radius-slider-discover", "How far");
    syncRadiusSlider(slider, miles);
    var readout = el("span", "radius-readout");
    readout.id = "radius-readout";
    readout.textContent = SparkRadius.radiusLabel(miles);
    slider.addEventListener("input", function(){
      var next = SparkRadius.sliderToMiles(slider.value);
      state.filters.radiusMiles = next;
      readout.textContent = SparkRadius.radiusLabel(next);
      setSliderPct(slider, sliderFillPct(slider));
      slider.setAttribute("aria-valuenow", String(next));
      slider.setAttribute("aria-valuetext", next + " miles");
      var pillLabel = document.querySelector(".local-pill-label");
      if(pillLabel) pillLabel.textContent = localPillText();
      saveState();
      refreshDeckAfterRadius();
      updateFilterBadge();
    });
    row.appendChild(place);
    row.appendChild(slider);
    row.appendChild(readout);
    return row;
  }

  function updateRadiusPlace(){
    var name = document.getElementById("radius-place-name");
    if(name) name.textContent = placeLabel();
  }

  function refreshDeckAfterRadius(){
    var deckEl = $("#deck");
    if(!deckEl) return;
    renderDeckCards(deckEl);
    updateResultCount();
  }

  function updateFilterBadge(){
    var btn = $(".filter-chip-btn");
    if(!btn) return;
    var count = activeFilterCount(state.filters);
    var badge = $(".badge", btn);
    if(!count){
      if(badge && badge.remove) badge.remove();
      return;
    }
    if(!badge){
      badge = el("span", "badge");
      btn.appendChild(badge);
    }
    badge.textContent = String(count);
  }

  function radiusDiagram(){
    function arc(r, cls, fill){
      var d = "M" + (160 - r) + ",142 A" + r + "," + r + " 0 0 1 " + (160 + r) + ",142";
      if(fill) d += " L160,142 Z";
      return '<path class="' + cls + '" d="' + d + '"/>';
    }
    var wrap = el("div", "radius-diagram-wrap");
    wrap.innerHTML =
      '<svg class="radius-diagram" viewBox="0 0 320 150" aria-hidden="true">' +
        arc(126, "radius-fill radius-fill-a", true) +
        arc(92, "radius-fill radius-fill-b", true) +
        arc(58, "radius-fill radius-fill-c", true) +
        arc(126, "radius-ring radius-ring-outer", false) +
        arc(92, "radius-ring radius-ring-mid", false) +
        arc(58, "radius-ring", false) +
        arc(32, "radius-ring", false) +
        '<g class="radius-pin" transform="translate(148,120)">' +
          '<path d="M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/>' +
          '<circle class="radius-pin-dot" cx="12" cy="10" r="2.3"/>' +
        '</g>' +
      '</svg>';
    return wrap;
  }

  function buildHowFarGroup(){
    var group = el("div", "filter-group how-far-group");
    var card = el("div", "how-far");
    var head = el("div", "how-far-head");
    var miles = SparkRadius.clampRadiusMiles(ui.filterDraft.radiusMiles);
    head.innerHTML =
      '<div class="how-far-head-copy">' +
        '<span class="how-far-label">How far?</span>' +
        '<div class="how-far-place">' + icon("map-pin") + '<span class="how-far-place-name"></span></div>' +
      '</div>' +
      '<span class="how-far-value"></span>';
    head.querySelector(".how-far-value").textContent = SparkRadius.radiusLabel(miles);
    head.querySelector(".how-far-place-name").textContent = nearYouLabel();
    var slider = makeRadiusSlider("radius-slider-panel", "How far, in miles");
    syncRadiusSlider(slider, miles);
    slider.addEventListener("input", function(){
      var next = SparkRadius.sliderToMiles(slider.value);
      ui.filterDraft.radiusMiles = next;
      var value = head.querySelector(".how-far-value");
      if(value) value.textContent = SparkRadius.radiusLabel(next);
      setSliderPct(slider, sliderFillPct(slider));
      slider.setAttribute("aria-valuenow", String(next));
      slider.setAttribute("aria-valuetext", next + " miles");
      updateFilterApplyLabel();
    });
    var ticks = el("div", "radius-ticks");
    ticks.setAttribute("aria-hidden", "true");
    [[0, "1"], [25, "5"], [50, "10"], [75, "25"], [100, "50 mi"]].forEach(function(pair){
      var tick = el("span", "radius-tick", pair[1]);
      tick.style.left = pair[0] + "%";
      ticks.appendChild(tick);
    });
    card.appendChild(head);
    card.appendChild(radiusDiagram());
    card.appendChild(slider);
    card.appendChild(ticks);
    group.appendChild(card);
    return group;
  }

  function buildLocalPill(){
    var pill = el("div", "local-pill");
    var mark = el("span", "local-pill-icon", icon("map-pin"));
    var label = el("span", "local-pill-label", localPillText());
    var x = el("button", "local-pill-x", "\u2715");
    x.type = "button";
    x.setAttribute("aria-label", "Turn off local events");
    x.addEventListener("click", function(){
      state.filters.localOnly = false;
      saveState();
      renderContent();
    });
    pill.appendChild(mark);
    pill.appendChild(label);
    pill.appendChild(x);
    return pill;
  }

  function buildDiscoverScreen(){
    var wrap = el("div", "screen discover-screen");
    mountDiscoverHeader(wrap);

    if(state.filters.localOnly === true) wrap.appendChild(buildRadiusRow());

    var bar = el("div", "filter-bar");
    var fbtn = el("button", "filter-chip-btn");
    var count = activeFilterCount(state.filters);
    fbtn.innerHTML = icon("sliders") + " Filters" + (count ? '<span class="badge">'+count+'</span>' : "");
    fbtn.addEventListener("click", openFilterOverlay);
    bar.appendChild(fbtn);
    if(state.filters.localOnly === true) bar.appendChild(buildLocalPill());

    var tonightOn = state.filters.tonight === true;
    var tonightCount = tonightMatchCount();
    var tonightBtn = el("button", "tonight-chip" + (tonightOn ? " is-on" : ""));
    tonightBtn.type = "button";
    tonightBtn.setAttribute("aria-pressed", tonightOn ? "true" : "false");
    tonightBtn.setAttribute("aria-label", "Happening tonight, " + tonightCount + (tonightCount === 1 ? " idea" : " ideas"));
    tonightBtn.innerHTML = icon("moon", "icon-inline") + '<span class="tonight-count">' + tonightCount + "</span>";
    tonightBtn.addEventListener("click", function(){
      toggleTonightFilter();
      renderContent();
    });
    bar.appendChild(tonightBtn);

    var deck = computeDeck();
    var rc = el("div", "result-count", deckCountLabel(deck));
    bar.appendChild(rc);
    wrap.appendChild(bar);

    var activePlan = getActivePlan();
    var planBar = el("div", "plan-bar");
    if(activePlan){
      var chip = el("div", "plan-chip");
      var chipSub = activePlan.date ? fmtDate(activePlan.date) : "No date set";
      chip.innerHTML =
        '<span class="plan-chip-icon">' + icon("calendar") + '</span>' +
        '<span class="plan-chip-text"><b>Planning: ' + escapeHtml(activePlan.name) + '</b><br><small>' + escapeHtml(chipSub) + '</small></span>';
      var endBtn = el("button", "plan-chip-end", "✕");
      endBtn.type = "button";
      endBtn.title = "Stop planning for this date";
      endBtn.addEventListener("click", function(){
        ui.activePlanId = null;
        renderContent();
      });
      chip.appendChild(endBtn);
      planBar.appendChild(chip);
    } else {
      var planBtn = el("button", "btn-secondary btn-block plan-cta", icon("calendar") + " Plan a Date");
      planBtn.type = "button";
      planBtn.addEventListener("click", openPlanOverlay);
      planBar.appendChild(planBtn);
    }
    wrap.appendChild(planBar);
    wrap.appendChild(buildLocationBar());

    var deckEl = el("div", "deck");
    deckEl.id = "deck";
    wrap.appendChild(deckEl);

    renderDeckCards(deckEl);

    return wrap;
  }

  // Location is requested automatically (no button) — this bar just shows a
  // quiet status chip once it's on, with a way to turn it back off. When
  // location isn't on (denied, pending, or unsupported), it renders empty.
  function buildLocationBar(){
    var bar = el("div", "location-bar");
    bar.id = "location-bar";
    if(state.location){
      var statusText = realIdeasLoading
        ? "Finding real nearby spots…"
        : (REAL_IDEAS_RUNTIME.length
          ? "Location on — " + REAL_IDEAS_RUNTIME.length + " real spots mixed into your deck"
          : "Location on");
      var chip = el("div", "location-chip");
      chip.innerHTML =
        '<span class="location-chip-icon">' + icon("map-pin") + '</span>' +
        '<span class="location-chip-text">' + escapeHtml(statusText) + '</span>';
      var endBtn = el("button", "location-chip-end", "✕");
      endBtn.type = "button";
      endBtn.title = "Turn off location";
      endBtn.addEventListener("click", clearLocation);
      chip.appendChild(endBtn);
      bar.appendChild(chip);
    }
    return bar;
  }

  function renderDeckCards(deckEl){
    deckEl.innerHTML = "";
    var deck = computeDeck();
    // Three cards are mounted. Only those photos are requested: the front
    // card and the next one load now, and the third waits (loading=lazy).
    var ids = deck.remaining.slice(0, 3);

    if(ids.length === 0){
      var empty = el("div", "empty-state");
      var hasAny = deck.total > 0;
      empty.innerHTML =
        '<span class="es-icon">' + (hasAny ? icon("check-circle") : icon("help-circle")) + '</span>' +
        '<h3>' + (hasAny ? "You've seen them all!" : "No matches yet") + '</h3>' +
        '<p>' + (hasAny ? "You swiped through every idea that matches your filters." : "Try adjusting your filters to see more ideas.") + '</p>' +
        (hasAny ? '<button class="btn-secondary" id="deck-reset">Start Over</button>' : '<button class="btn-secondary" id="deck-clear-filters">Clear Filters</button>');
      deckEl.appendChild(empty);
      var resetBtn = $("#deck-reset", deckEl);
      if(resetBtn) resetBtn.addEventListener("click", function(){
        // Only reset seen state for ideas currently matching the filter
        var filtered = IDEAS_DATA.filter(function(i){ return matchesFilters(i, state.filters); }).map(function(i){ return i.id; });
        REMOTE_IDEAS.forEach(function(idea){
          if(matchesFilters(idea, state.filters)) filtered.push(idea.id);
        });
        state.seenIds = state.seenIds.filter(function(id){ return filtered.indexOf(id) === -1; });
        saveState();
        renderDeckCards(deckEl);
        updateResultCount();
      });
      var clearBtn = $("#deck-clear-filters", deckEl);
      if(clearBtn) clearBtn.addEventListener("click", function(){
        state.filters = defaultState().filters;
        saveState();
        renderContent();
      });
      return;
    }

    // render back-to-front so first id ends up on top of DOM stacking
    for(var k = ids.length - 1; k >= 0; k--){
      var idea = IDEAS_BY_ID[ids[k]];
      var card = buildSwipeCard(idea, k === 0, k);
      card.style.transform = "translateY(" + (k * 8) + "px) scale(" + (1 - k * 0.035) + ")";
      card.style.zIndex = String(10 - k);
      if(k !== 0) card.style.pointerEvents = "none";
      deckEl.appendChild(card);
    }
  }

  function updateResultCount(){
    var rc = $(".result-count");
    if(!rc) return;
    var deck = computeDeck();
    rc.textContent = deckCountLabel(deck);
  }

  /* Optional photo on an idea. Shape: { url, credit? }. url is http(s), a
     same-origin path, or a data-image. credit is the short attribution line,
     shown only when it is non-empty. Catalog photos are attached from
     IDEA_PHOTOS; data.js itself does not set this. A missing or unsafe
     photo keeps the generated cover.

     The H1 overlay reads a few other optional facts when a photo is present.
     Missing facts are left blank. They are not invented.
       distanceMiles  → "6.4 mi" / "from you". The radius filter also
                        reads it when the idea has no coordinates.
       closesAt       → "10 pm" / "lot closes"   (a short clock time)
       conditions     → the line under the chips
       openNow        → true shows the Open now badge.
     Time pills (Tonight / Evening / Night) come from authored time tags
     and can show on a card with or without a photo. See suitsTonight. */
  function ideaPhoto(idea){
    var photo = idea && idea.photo;
    if(!photo || typeof photo !== "object") return null;
    var url = typeof photo.url === "string" ? photo.url.trim() : "";
    if(!isSafePhotoUrl(url)) return null;
    var credit = typeof photo.credit === "string" ? photo.credit.trim() : "";
    return { url: url, credit: credit };
  }

  function isSafePhotoUrl(url){
    if(!url || url.length > 2500000) return false;
    if(/[\u0000-\u001f\u007f"'()\\<>]/.test(url)) return false;
    if(/^https?:\/\//i.test(url)) return true;
    if(/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(url)) return true;
    if(url.indexOf("..") !== -1) return false;
    return /^[A-Za-z0-9_./~-]+$/.test(url);
  }

  // Photos are pre-cropped 4:5 at 800×1000. Width and height let the browser
  // reserve that ratio. The front card and the one behind it load now; a
  // deeper card waits so a swipe does not pull the rest of the catalog.
  function photoImageHtml(photo, depth){
    var rank = typeof depth === "number" ? depth : 1;
    var loading = rank > 1 ? "lazy" : "eager";
    var priority = rank === 0 ? "high" : "low";
    return '<img alt="" width="800" height="1000" decoding="async" draggable="false" loading="' + loading + '" fetchpriority="' + priority + '" src="' + escapeHtml(photo.url) + '">';
  }

  // "Half-day (2-5 hrs)" → "half-day". The tile caption is the short form.
  function photoDurationLabel(duration){
    if(!duration) return "";
    var s = String(duration).trim();
    var paren = s.indexOf(" (");
    if(paren !== -1) s = s.slice(0, paren);
    return s.toLowerCase();
  }

  function photoHoursStat(idea){
    if(!idea) return null;
    if(typeof idea.closesAt === "string" && idea.closesAt.trim()){
      return { value: idea.closesAt.trim(), label: "lot closes" };
    }
    return null;
  }

  function sceneChipLabel(scene){
    if(scene === "citynight") return "City night";
    if(!scene) return "";
    return scene.charAt(0).toUpperCase() + scene.slice(1);
  }

  // Descriptor chips under the tiles. Cost and duration already sit in the
  // third tile, so these are the other short facts: where, scene, vibe.
  function photoTags(idea){
    var tags = [];
    function add(t){
      if(tags.length >= 3) return;
      t = t == null ? "" : String(t).trim();
      if(!t || tags.indexOf(t) !== -1) return;
      tags.push(t);
    }
    add(idea.setting);
    if(idea.scene && VALID_SCENES.indexOf(idea.scene) !== -1) add(sceneChipLabel(idea.scene));
    if(idea.vibe && idea.vibe.length) add(idea.vibe[0]);
    if(tags.length < 3 && idea.season && idea.season.length) add(idea.season[0]);
    if(tags.length < 3 && idea.vibe && idea.vibe.length > 1) add(idea.vibe[1]);
    return tags;
  }

  // Distance, closing time, cost/duration. A missing fact is left out rather
  // than filled with a placeholder — cost is the one tile catalog ideas have.
  function photoStats(idea){
    var stats = [];
    var dist = distanceLabel(idea.distanceMiles);
    if(dist) stats.push({ key: "distance", value: dist, label: "from you" });
    var hours = photoHoursStat(idea);
    if(hours) stats.push({ key: "hours", value: hours.value, label: hours.label });
    var cost = displayCost(idea);
    if(cost) stats.push({ key: "cost", value: cost, label: photoDurationLabel(idea.duration) || "cost" });
    return stats;
  }

  function photoStatTilesHtml(idea){
    var stats = photoStats(idea);
    if(!stats.length) return "";
    return '<div class="card-stat-tiles">' + stats.map(function(s){
      return '<div class="card-stat" data-stat="' + s.key + '">' +
        '<b class="card-stat-value">' + escapeHtml(s.value) + '</b>' +
        '<span class="card-stat-label">' + escapeHtml(s.label) + '</span>' +
      '</div>';
    }).join("") + '</div>';
  }

  function photoTagChipsHtml(idea){
    var tags = photoTags(idea);
    if(!tags.length) return "";
    return '<div class="card-meta">' + tags.map(function(t){
      return '<span class="meta-pill">' + escapeHtml(t) + '</span>';
    }).join("") + '</div>';
  }

  function photoConditionsHtml(idea){
    var text = idea && typeof idea.conditions === "string" ? idea.conditions.trim() : "";
    if(!text) return "";
    return '<div class="card-conditions">' + escapeHtml(text) + '</div>';
  }

  // Everything under the title. Kept in one function so the info stack can
  // change without touching the photo frame or the no-photo card.
  function ageBadgeHtml(idea){
    if(!idea || idea.age21 !== true) return "";
    return '<span class="badge-21">21+</span>';
  }

  function photoOverlayHtml(idea){
    return '<h3 class="card-title">' + escapeHtml(idea.title) + ageBadgeHtml(idea) + '</h3>' +
      photoStatTilesHtml(idea) +
      photoTagChipsHtml(idea) +
      photoConditionsHtml(idea);
  }

  function statusBadgeHtml(idea){
    var badge = SparkUtil.ideaStatusBadge(idea);
    if(!badge) return "";
    var cls = badge.kind === "open" ? "badge-open" : "badge-time";
    return '<span class="' + cls + '">' + escapeHtml(badge.label) + '</span>';
  }

  // Top-right of a card: Open now, else a time pill, else the real-place
  // marker. At most one, and only when the idea actually carries that fact.
  function cardCornerHtml(idea){
    var badge = statusBadgeHtml(idea);
    if(badge) return badge;
    if(idea.isReal){
      return '<span class="real-badge" title="Real nearby place">' + icon("map-pin") + ' Real spot</span>';
    }
    return "";
  }

  function photoSwipeCardHtml(idea, photo, depth){
    var credit = photo.credit
      ? '<div class="card-photo-credit">' + escapeHtml(photo.credit) + '</div>'
      : "";
    return '<div class="card-photo">' + photoImageHtml(photo, depth) + '</div>' +
      '<div class="card-photo-scrim"></div>' +
      distanceBadgeHtml(idea) +
      cardCornerHtml(idea) +
      '<span class="stamp yes">SAVE</span><span class="stamp no">PASS</span>' +
      '<div class="card-photo-overlay">' + photoOverlayHtml(idea) + '</div>' +
      credit;
  }

  function classicSwipeCardHtml(idea){
    return '<div class="card-media" style="' + getCoverArtStyle(idea) + '">' +
        distanceBadgeHtml(idea) +
        cardCornerHtml(idea) +
        '<span class="stamp yes">SAVE</span><span class="stamp no">PASS</span>' +
      '</div>' +
      '<div class="card-body">' +
        '<h3 class="card-title">' + escapeHtml(idea.title) + ageBadgeHtml(idea) + '</h3>' +
        '<div class="card-meta">' +
          '<span class="meta-pill">' + escapeHtml(idea.duration) + '</span>' +
          '<span class="meta-pill">' + escapeHtml(displayCost(idea)) + '</span>' +
          '<span class="meta-pill">' + escapeHtml(idea.setting) + '</span>' +
        '</div>' +
        '<div class="card-hint">Tap for details · swipe right to save · left to pass</div>' +
      '</div>';
  }

  function buildSwipeCard(idea, isTop, depth){
    var card = el("div", "swipe-card");
    card.dataset.id = idea.id;
    var photo = ideaPhoto(idea);
    if(photo) card.className = "swipe-card has-photo";
    var rank = typeof depth === "number" ? depth : (isTop ? 0 : 1);
    card.innerHTML = photo ? photoSwipeCardHtml(idea, photo, rank) : classicSwipeCardHtml(idea);
    if(isTop) attachSwipeHandlers(card, idea.id);
    return card;
  }

  function cardSwipeWidth(card){
    var w = 0;
    if(card && typeof card.offsetWidth === "number") w = card.offsetWidth;
    if(!(w > 40) && card && card.getBoundingClientRect){
      try { w = card.getBoundingClientRect().width; } catch(err){ w = 0; }
    }
    return w > 40 ? w : SparkUtil.SWIPE_FALLBACK_WIDTH;
  }

  function attachSwipeHandlers(card, ideaId){
    var startX = 0, startY = 0, curX = 0, curY = 0, dragging = false, axis = null, pointerId = null;
    var samples = [];
    var yesStamp = $(".stamp.yes", card), noStamp = $(".stamp.no", card);

    function pointOf(e){
      if(!e) return null;
      if(e.touches && e.touches.length) return e.touches[0];
      if(e.changedTouches && e.changedTouches.length) return e.changedTouches[0];
      return e;
    }
    function noteSample(x, t){
      samples.push({ x: x, t: t });
      var cutoff = t - 80;
      while(samples.length > 1 && samples[0].t < cutoff) samples.shift();
    }
    function horizontalVelocity(){
      if(samples.length < 2) return 0;
      var a = samples[0], b = samples[samples.length - 1];
      var dt = b.t - a.t;
      if(dt < 8) return 0;
      return (b.x - a.x) / dt;
    }
    function setStamp(stamp, value){
      if(stamp && stamp.style) stamp.style.opacity = value;
    }
    function resetVisual(){
      card.style.transform = "translate(0,0) rotate(0)";
      setStamp(yesStamp, "0");
      setStamp(noStamp, "0");
    }
    function capturePointer(id){
      if(id == null || !card.setPointerCapture) return;
      try { card.setPointerCapture(id); } catch(err){}
    }
    function onDown(e){
      if(e.button != null && e.button !== 0) return;
      dragging = true;
      axis = null;
      samples = [];
      var pt = pointOf(e);
      startX = pt.clientX; startY = pt.clientY;
      curX = 0; curY = 0;
      pointerId = e.pointerId;
      noteSample(startX, e.timeStamp || Date.now());
      // Mouse has no native pan, so capture immediately and keep the drag.
      // Touch waits until the gesture locks horizontal so a vertical scroll
      // stays with the browser (touch-action: pan-y on the card).
      if(e.pointerType === "mouse") capturePointer(pointerId);
    }
    function onMove(e){
      if(!dragging) return;
      if(pointerId != null && e.pointerId != null && e.pointerId !== pointerId) return;
      var pt = pointOf(e);
      if(!pt) return;
      curX = pt.clientX - startX;
      curY = pt.clientY - startY;
      noteSample(pt.clientX, e.timeStamp || Date.now());
      var decision = SparkUtil.resolveCardSwipe({
        dx: curX, dy: curY, axis: axis, phase: "move"
      });
      axis = decision.axis;
      if(decision.action !== "drag") return;
      capturePointer(e.pointerId);
      if(e.preventDefault) e.preventDefault();
      card.style.transition = "none";
      var width = cardSwipeWidth(card);
      var threshold = width * SparkUtil.SWIPE_COMMIT_FRACTION;
      var rot = curX / 20;
      card.style.transform = "translate(" + curX + "px,0) rotate(" + rot + "deg)";
      var progress = Math.max(-1, Math.min(1, curX / threshold));
      setStamp(yesStamp, String(Math.max(0, progress)));
      setStamp(noStamp, String(Math.max(0, -progress)));
    }
    function finishGesture(e, allowCommit){
      if(!dragging) return;
      dragging = false;
      if(e){
        var pt = pointOf(e);
        if(pt && typeof pt.clientX === "number"){
          curX = pt.clientX - startX;
          curY = pt.clientY - startY;
          noteSample(pt.clientX, e.timeStamp || Date.now());
        }
      }
      card.style.transition = "transform .3s ease";
      var decision = SparkUtil.resolveCardSwipe({
        dx: curX, dy: curY, axis: axis, phase: "end",
        cardWidth: cardSwipeWidth(card),
        velocityX: allowCommit ? horizontalVelocity() : 0
      });
      axis = null;
      curX = 0; curY = 0;
      samples = [];
      if(!allowCommit || decision.action === "scroll" || decision.action === "snap" || decision.action === "pending"){
        resetVisual();
        return;
      }
      if(decision.action === "tap"){
        resetVisual();
        goToDetail(ideaId);
        return;
      }
      if(decision.action === "save"){
        finishSwipe(card, "yes", ideaId);
        return;
      }
      if(decision.action === "pass"){
        finishSwipe(card, "no", ideaId);
        return;
      }
      resetVisual();
    }
    function onUp(e){ finishGesture(e, true); }
    function onCancel(){ finishGesture(null, false); }

    card.addEventListener("pointerdown", onDown);
    card.addEventListener("pointermove", onMove, { passive: false });
    card.addEventListener("pointerup", onUp);
    card.addEventListener("pointercancel", onCancel);
    card.addEventListener("pointerleave", function(e){ if(dragging && e.buttons === 0) onUp(e); });
  }

  function finishSwipe(card, direction, ideaId){
    card.style.transition = "transform .35s ease, opacity .35s ease";
    card.style.transform = direction === "yes"
      ? "translate(130%,0) rotate(14deg)"
      : "translate(-130%,0) rotate(-14deg)";
    card.style.opacity = "0";

    if(state.seenIds.indexOf(ideaId) === -1) state.seenIds.push(ideaId);
    if(direction === "no" && state.passedIds.indexOf(ideaId) === -1) state.passedIds.push(ideaId);
    var bucket = null;
    if(direction === "yes") bucket = saveIdeaToActiveBucket(ideaId);
    saveState();

    setTimeout(function(){
      if(direction === "yes") showToast("Saved to " + bucketLabel(bucket) + "!");
      // Stay on Discover and keep swiping instead of jumping to another screen.
      var deckEl = $("#deck");
      if(deckEl) { renderDeckCards(deckEl); updateResultCount(); }
    }, 260);
  }

  /* ---------- Filter overlay ---------- */
  function openFilterOverlay(){
    ui.filterDraft = JSON.parse(JSON.stringify(state.filters));
    renderFilterBody();
    openOverlay("#filter-overlay");
  }

  function buildLocalEventsRow(){
    var on = ui.filterDraft.localOnly === true;
    var row = el("div", "local-events" + (on ? " is-on" : ""));
    var copy = el("div", "local-events-copy");
    copy.appendChild(el("div", "local-events-title", "Local events"));
    copy.appendChild(el("div", "local-events-sub", on ? "Only ideas near you" : "Off · showing everything"));
    var toggle = el("label", "toggle-switch");
    var input = document.createElement("input");
    input.type = "checkbox";
    input.className = "local-only-input";
    input.checked = on;
    input.setAttribute("aria-label", "Local events");
    input.addEventListener("change", function(){
      ui.filterDraft.localOnly = input.checked === true;
      renderFilterBody();
    });
    toggle.appendChild(input);
    toggle.appendChild(el("span", "toggle-slider"));
    row.appendChild(el("div", "local-events-icon", icon("map-pin")));
    row.appendChild(copy);
    row.appendChild(toggle);
    return row;
  }

  function buildLocalNote(){
    return el("div", "local-note", icon("info") + "<span>All activities show. Turn on to pick a distance.</span>");
  }

  function buildWhereGroup(){
    if(!ui.filterDraft) ui.filterDraft = JSON.parse(JSON.stringify(state.filters));
    var on = ui.filterDraft.localOnly === true;
    var group = el("div", "filter-group where-group");
    group.appendChild(el("div", "filter-group-title", "Where"));
    group.appendChild(buildLocalEventsRow());
    group.appendChild(on ? buildHowFarGroup() : buildLocalNote());
    return group;
  }

  function renderFilterBody(){
    var body = $("#filter-body");
    var scroll = body.scrollTop || 0;
    body.innerHTML = "";
    body.appendChild(buildWhereGroup());

    FILTER_DEFS.forEach(function(def){
      var group = el("div", "filter-group");
      group.appendChild(el("div", "filter-group-title", def.label));
      var chipWrap = el("div", "chip-select");
      def.options.forEach(function(opt){
        var chip = el("button", "chip", escapeHtml(opt));
        chip.type = "button";
        if(ui.filterDraft[def.key].indexOf(opt) !== -1) chip.classList.add("selected");
        chip.addEventListener("click", function(){
          var arr = ui.filterDraft[def.key];
          var idx = arr.indexOf(opt);
          if(idx === -1) arr.push(opt); else arr.splice(idx, 1);
          chip.classList.toggle("selected");
          updateFilterApplyLabel();
        });
        chipWrap.appendChild(chip);
      });
      group.appendChild(chipWrap);
      body.appendChild(group);
    });

    // Food special group (tri-state)
    var foodGroup = el("div", "filter-group");
    foodGroup.appendChild(el("div", "filter-group-title", "Food Involved?"));
    var foodChips = el("div", "chip-select");
    [["Any", null], ["Has food", true], ["No food", false]].forEach(function(pair){
      var chip = el("button", "chip", pair[0]);
      chip.type = "button";
      if(ui.filterDraft.food === pair[1]) chip.classList.add("selected");
      chip.addEventListener("click", function(){
        ui.filterDraft.food = pair[1];
        $all(".chip", foodChips).forEach(function(c){ c.classList.remove("selected"); });
        chip.classList.add("selected");
        updateFilterApplyLabel();
      });
      foodChips.appendChild(chip);
    });
    foodGroup.appendChild(foodChips);
    body.appendChild(foodGroup);

    var ageGroup = el("div", "filter-group");
    ageGroup.appendChild(el("div", "filter-group-title", "21+ ideas"));
    var ageChips = el("div", "chip-select");
    var hideChip = el("button", "chip", "Hide 21+");
    hideChip.type = "button";
    if(ui.filterDraft.hide21) hideChip.classList.add("selected");
    hideChip.addEventListener("click", function(){
      ui.filterDraft.hide21 = !ui.filterDraft.hide21;
      hideChip.classList.toggle("selected");
      updateFilterApplyLabel();
    });
    ageChips.appendChild(hideChip);
    ageGroup.appendChild(ageChips);
    body.appendChild(ageGroup);
    if(body.scrollTop !== scroll) body.scrollTop = scroll;
    updateFilterApplyLabel();
  }

  $("#filter-close").addEventListener("click", function(){ closeOverlay("#filter-overlay"); });
  $("#filter-reset").addEventListener("click", function(){
    ui.filterDraft = defaultState().filters;
    state.filters = defaultState().filters;
    saveState();
    closeOverlay("#filter-overlay");
    if(ui.tab === "discover") renderContent();
  });
  $("#filter-apply").addEventListener("click", function(){
    state.filters = ui.filterDraft;
    saveState();
    closeOverlay("#filter-overlay");
    if(ui.tab === "discover") renderContent();
  });

  /* ---------- Plan a Date overlay ---------- */
  // Flow: tap "Plan a Date" -> if you have existing plans, first choose to resume
  // one of them or start fresh -> (new plan only) name it / pick a date -> Filters
  // open automatically -> ideas you swipe-save while this plan is active get
  // grouped under it. Resuming an existing plan skips Filters and goes straight
  // to Discover with that plan active.
  function openPlanOverlay(){
    ui.planDraft = { name:"", date:"" };
    $("#plan-name").value = "";
    $("#plan-date").value = "";
    if(state.datePlans.length){
      showPlanOverlayStep("picker");
      renderPlanPickerList();
    } else {
      showPlanOverlayStep("form");
    }
    openOverlay("#plan-overlay");
  }
  function showPlanOverlayStep(step){
    $("#plan-step-picker").classList.toggle("hidden", step !== "picker");
    $("#plan-step-form").classList.toggle("hidden", step !== "form");
  }
  function renderPlanPickerList(){
    var list = $("#plan-picker-list");
    list.innerHTML = "";
    state.datePlans.slice().reverse().forEach(function(plan){
      var row = el("div", "share-friend-row");
      var subtext = plan.date ? fmtDate(plan.date) : "No date set";
      row.innerHTML =
        '<span class="friend-avatar" style="background:#eee">' + icon("calendar") + '</span>' +
        '<span class="friend-name">' + escapeHtml(plan.name) + '<br><small>' + escapeHtml(subtext) + '</small></span>';
      row.addEventListener("click", function(){
        ui.activePlanId = plan.id;
        saveState();
        closeOverlay("#plan-overlay");
        switchTab("discover");
      });
      list.appendChild(row);
    });
  }
  $("#plan-new-btn").addEventListener("click", function(){ showPlanOverlayStep("form"); });
  $("#plan-form-back").addEventListener("click", function(){
    if(state.datePlans.length){ showPlanOverlayStep("picker"); renderPlanPickerList(); }
    else closeOverlay("#plan-overlay");
  });
  $("#plan-close").addEventListener("click", function(){ closeOverlay("#plan-overlay"); });
  $("#plan-cancel").addEventListener("click", function(){ closeOverlay("#plan-overlay"); });
  $("#plan-start").addEventListener("click", function(){
    var name = $("#plan-name").value.trim() || "New Date Plan";
    var date = $("#plan-date").value || "";
    var plan = { id: genId("plan"), name: name, date: date, createdAt: todayISO(), ideaIds: [], friendPicks: [] };
    state.datePlans.push(plan);
    ui.activePlanId = plan.id;
    // Starting a brand-new plan gives you a fresh deck: everything you've
    // already swiped through (yes or no) in previous sessions/plans is
    // cleared out so the full set of ideas is available again.
    state.seenIds = [];
    state.passedIds = [];
    saveState();
    closeOverlay("#plan-overlay");
    if(ui.tab === "discover") renderContent();
    openFilterOverlay();
  });

  // Secure website only. The address is set with setAttribute, never innerHTML.
  function visitWebsiteLink(idea){
    var href = SparkUtil.activityWebsite(idea);
    if(!href) return null;
    var link = document.createElement("a");
    link.className = "btn-outline";
    link.textContent = "Visit website";
    link.setAttribute("href", href);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
    return link;
  }

  /* ---------- Detail screen ---------- */
  function buildDetailScreen(ideaId){
    ideaForSaved(ideaId);
    var idea = IDEAS_BY_ID[ideaId];
    var wrap = el("div", "screen detail-screen");
    if(!idea){
      wrap.innerHTML = '<p>Idea not found.</p>';
      return wrap;
    }
    var activePlan = getActivePlan();
    // While a plan is active, the main Save button always targets THAT plan
    // specifically (not just "whichever bucket happens to contain this idea")
    // so it stays a reliable way to add/remove it from the plan you're
    // actually working on, independent of the separate Someday toggle below.
    var savedBucket = activePlan ? { type:"plan", planId: activePlan.id } : findIdeaBucket(ideaId);
    var isSaved = activePlan ? isIdeaInBucket(ideaId, savedBucket) : savedBucket !== null;
    var inSomeday = isIdeaInBucket(ideaId, { type:"someday" });
    var doneEntry = state.doneIds.find(function(d){ return d.id === ideaId; });
    var friendPicks = getFriendPicksForIdea(ideaId);

    var back = el("button", "back-link", "‹ Back");
    back.addEventListener("click", function(){
      if(ui.detailFriendId != null){ ui.screen = "friendDetail"; renderContent(); }
      else goBackFromDetail();
    });
    wrap.appendChild(back);
    attachDetailEdgeSwipeBack(wrap, ideaId);

    var hero = el("div", "detail-hero");
    var heroPhoto = ideaPhoto(idea);
    if(heroPhoto){
      hero.classList.add("has-photo");
      hero.style.backgroundImage = "url(\"" + heroPhoto.url.replace(/"/g, "") + "\")";
    } else {
      hero.setAttribute("style", getCoverArtStyle(idea));
    }
    hero.innerHTML = '<div class="dh-icon">' + ideaIcon(idea) + '</div><div class="dh-cat">' + escapeHtml(idea.category) + '</div>' +
      '<div class="dh-swipe-hint">' + icon("chevron-up") + ' Swipe up to save</div>';
    wrap.appendChild(hero);
    attachDetailHeroSwipeUp(hero, ideaId);

    wrap.appendChild(el("h2", "detail-title", escapeHtml(idea.title) + ageBadgeHtml(idea)));
    wrap.appendChild(el("p", "detail-desc", escapeHtml(idea.description)));

    // Missing (events, older saved spots) stays hidden. [] is "Nothing needed".
    if(Array.isArray(idea.materials)){
      var mat = el("div", "detail-materials");
      mat.appendChild(el("h3", "detail-materials-title", "Materials needed"));
      if(idea.materials.length){
        var ul = el("ul", "detail-materials-list");
        idea.materials.forEach(function(m){ ul.appendChild(el("li", "", escapeHtml(m))); });
        mat.appendChild(ul);
      } else {
        mat.appendChild(el("p", "detail-materials-none", "Nothing needed"));
      }
      wrap.appendChild(mat);
    }

    if(friendPicks.length){
      var band = el("div", "friend-pick-banner");
      band.innerHTML = friendPicks.map(function(p){
        return p.avatarEmoji + " <b>" + escapeHtml(p.friendName) + "</b> picked this as their favorite for " + escapeHtml(p.planName) + "!";
      }).join("<br>");
      wrap.appendChild(band);
    }

    if(idea.isReal){
      var realBlock = el("div", "detail-real-block");
      var ratingHtml = idea.rating ? (" · ★ " + idea.rating) : "";
      realBlock.innerHTML =
        '<div class="detail-real-title">' + icon("map-pin") + ' Real Nearby Spot</div>' +
        '<div class="detail-real-name">' + escapeHtml(idea.placeName || idea.title) + '</div>' +
        (idea.address ? '<div class="detail-real-addr">' + escapeHtml(idea.address) + escapeHtml(ratingHtml) + '</div>' : '') +
        (idea.mapsUrl ? '<a class="btn-outline btn-block detail-real-link" href="' + idea.mapsUrl + '" target="_blank" rel="noopener">' + icon("map-pin") + ' Open in Maps</a>' : '');
      wrap.appendChild(realBlock);
    }

    if(idea.unavailable){
      var gone = el("div", "detail-real-block");
      gone.innerHTML =
        '<div class="detail-real-title">' + icon("calendar") + ' No longer available</div>' +
        '<div class="detail-real-addr">This saved item is no longer available.</div>';
      wrap.appendChild(gone);
    }

    var tagGrid = el("div", "tag-grid");
    var tags = [idea.duration, displayCost(idea), idea.setting].concat(idea.time || [], idea.vibe || [], idea.season || [], idea.stage || []);
    if(idea.food) tags.push("Food involved");
    tags.forEach(function(t){
      if(t == null || t === "") return;
      tagGrid.appendChild(el("span", "tag-chip", escapeHtml(t)));
    });
    wrap.appendChild(tagGrid);

    var actions = el("div", "detail-actions");
    var row2 = el("div", "row2");
    var saveBtn = el("button", "btn-outline" + (isSaved ? " active" : ""),
      isSaved ? (icon("bookmark") + " Saved · " + bucketLabel(savedBucket)) : (icon("bookmark") + " Save"));
    saveBtn.addEventListener("click", function(){
      // Re-derive the same "target" bucket as above (the active plan, if any,
      // else Someday) rather than trusting a stale closure value.
      var bucket = activePlan ? { type:"plan", planId: activePlan.id } : findIdeaBucket(ideaId);
      var currentlySaved = activePlan ? isIdeaInBucket(ideaId, bucket) : bucket !== null;
      if(currentlySaved){
        removeIdeaFromBucket(ideaId, bucket);
        showToast("Removed from " + bucketLabel(bucket));
      } else {
        var newBucket;
        if(activePlan){ addIdeaToBucket(ideaId, bucket); newBucket = bucket; }
        else { newBucket = saveIdeaToActiveBucket(ideaId); }
        showToast("Saved to " + bucketLabel(newBucket) + "!");
      }
      saveState();
      renderContent();
    });
    var shareBtn = el("button", "btn-outline", icon("share") + " Share");
    shareBtn.addEventListener("click", function(){ openShareOverlay(ideaId); });
    row2.appendChild(saveBtn); row2.appendChild(shareBtn);
    actions.appendChild(row2);

    // While a date plan is active, offer a second, independent way to also
    // keep this idea in Favorites — an idea can live in both places at once.
    if(activePlan){
      var alsoBtn = el("button", "btn-outline btn-block also-someday-btn" + (inSomeday ? " active" : ""),
        inSomeday ? (icon("star") + " Also saved to Favorites · tap to remove") : (icon("star") + " Also save to Favorites"));
      alsoBtn.addEventListener("click", function(){
        if(isIdeaInBucket(ideaId, { type:"someday" })){
          removeIdeaFromBucket(ideaId, { type:"someday" });
          showToast("Removed from Favorites");
        } else {
          addIdeaToBucket(ideaId, { type:"someday" });
          showToast("Also saved to Favorites!");
        }
        saveState();
        renderContent();
      });
      actions.appendChild(alsoBtn);
    }

    var doneBtn = el("button", "btn-outline" + (doneEntry ? " active" : ""),
      doneEntry ? (icon("check-circle") + " Marked Done · " + fmtDate(doneEntry.date)) : (icon("check-circle") + " Mark as Done"));
    doneBtn.type = "button";
    doneBtn.addEventListener("click", function(){
      var idx = state.doneIds.findIndex(function(d){ return d.id === ideaId; });
      if(idx === -1){
        state.doneIds.push({ id: ideaId, date: todayISO() });
        saveState();
        renderContent();
        openDoneRecap(ideaId, { mode:"new", announceSkip:true });
      } else {
        var removedKey = state.doneIds[idx].photoKey;
        state.doneIds.splice(idx, 1);
        saveState();
        if(removedKey) deleteDonePhoto(removedKey);
        if(recapSession && recapSession.ideaId === ideaId) closeDoneRecap(false);
        showToast("Removed from Done");
        renderContent();
      }
    });
    actions.appendChild(doneBtn);
    if(doneEntry){
      var rated = !!SparkUtil.normalizeRating(doneEntry.rating);
      var rateBtn = el("button", "btn-outline btn-block", icon("star") + " " + (rated ? "Edit rating" : "Rate this"));
      rateBtn.type = "button";
      rateBtn.addEventListener("click", function(){
        openDoneRecap(ideaId, { mode: rated ? "edit" : "new" });
      });
      actions.appendChild(rateBtn);
    }
    var website = visitWebsiteLink(idea);
    if(website) actions.appendChild(website);
    wrap.appendChild(actions);

    return wrap;
  }

  // Swiping up on the detail hero image saves the idea and jumps to Saved,
  // mirroring the swipe-up-to-save gesture on the Discover cards.
  function attachDetailHeroSwipeUp(hero, ideaId){
    var startX = 0, startY = 0, dragging = false;
    function onDown(e){
      dragging = true;
      var pt = e.touches ? e.touches[0] : e;
      startX = pt.clientX; startY = pt.clientY;
      hero.style.transition = "none";
      hero.setPointerCapture && e.pointerId != null && hero.setPointerCapture(e.pointerId);
    }
    function onMove(e){
      if(!dragging) return;
      var pt = e.touches ? e.touches[0] : e;
      var dy = pt.clientY - startY;
      if(dy < 0){
        hero.style.transform = "translateY(" + Math.max(dy, -90) + "px)";
        e.preventDefault && e.preventDefault();
      }
    }
    function onUp(e){
      if(!dragging) return;
      dragging = false;
      hero.style.transition = "transform .25s ease";
      var pt = e.changedTouches ? e.changedTouches[0] : e;
      var dy = (pt ? pt.clientY : startY) - startY;
      hero.style.transform = "translateY(0)";
      if(dy < -70){
        // Target the active plan (or Someday, if not currently planning) specifically,
        // so this still works as expected even if the idea is already dual-saved
        // to Someday separately from the active plan.
        var bucket = ui.activePlanId ? { type:"plan", planId: ui.activePlanId } : { type:"someday" };
        var already = isIdeaInBucket(ideaId, bucket);
        if(!already) addIdeaToBucket(ideaId, bucket);
        if(state.seenIds.indexOf(ideaId) === -1) state.seenIds.push(ideaId);
        saveState();
        showToast((already ? "Already in " : "Saved to ") + bucketLabel(bucket) + (already ? "" : "!"));
        // Head back to the swipe deck (or wherever detail was opened from) so
        // you can keep swiping without an extra tap.
        if(ui.detailFriendId != null){ ui.screen = "friendDetail"; renderContent(); }
        else goBackFromDetail();
      }
    }
    hero.addEventListener("pointerdown", onDown);
    hero.addEventListener("pointermove", onMove);
    hero.addEventListener("pointerup", onUp);
    hero.addEventListener("pointercancel", onUp);
    hero.addEventListener("pointerleave", function(e){ if(dragging && e.buttons === 0) onUp(e); });
  }

  // Starting a drag within a thin zone at the very left edge of the detail
  // screen and pulling right (like iOS's edge-swipe-back) leaves the detail
  // screen, same as tapping "‹ Back".
  var EDGE_SWIPE_ZONE = 24; // px from the left edge that can start the gesture
  var EDGE_SWIPE_THRESHOLD = 70; // px dragged right before it counts as "back"
  function attachDetailEdgeSwipeBack(wrap, ideaId){
    var startX = 0, startY = 0, dragging = false;
    function onDown(e){
      var pt = e.touches ? e.touches[0] : e;
      // Measured from the app's own screen edge (the .phone frame), not the
      // raw browser viewport, so this still lines up in the centered desktop
      // preview and not just on a real phone where the two coincide.
      var screenEl = wrap.closest(".phone") || wrap;
      var screenLeft = screenEl.getBoundingClientRect().left;
      if(pt.clientX - screenLeft > EDGE_SWIPE_ZONE) return;
      dragging = true;
      startX = pt.clientX; startY = pt.clientY;
      wrap.style.transition = "none";
      wrap.setPointerCapture && e.pointerId != null && wrap.setPointerCapture(e.pointerId);
    }
    function onMove(e){
      if(!dragging) return;
      var pt = e.touches ? e.touches[0] : e;
      var dx = pt.clientX - startX;
      var dy = pt.clientY - startY;
      if(Math.abs(dy) > Math.abs(dx) + 10){ dragging = false; wrap.style.transform = ""; return; }
      if(dx > 0){
        wrap.style.transform = "translateX(" + Math.min(dx, 120) + "px)";
        e.preventDefault && e.preventDefault();
      }
    }
    function onUp(e){
      if(!dragging) return;
      dragging = false;
      wrap.style.transition = "transform .2s ease";
      var pt = e.changedTouches ? e.changedTouches[0] : e;
      var dx = (pt ? pt.clientX : startX) - startX;
      wrap.style.transform = "translateX(0)";
      if(dx > EDGE_SWIPE_THRESHOLD){
        if(ui.detailFriendId != null){ ui.screen = "friendDetail"; renderContent(); }
        else goBackFromDetail();
      }
    }
    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerup", onUp);
    wrap.addEventListener("pointercancel", onUp);
    wrap.addEventListener("pointerleave", function(e){ if(dragging && e.buttons === 0) onUp(e); });
  }

  /* ---------- Copy and share ----------
     The clipboard and the phone share sheet are the only channels that
     exist here. A missing or failed clipboard falls back to a hidden
     textarea. Cancelling the share sheet is not an error. */
  function copyText(text){
    var value = text == null ? "" : String(text);
    if(navigator.clipboard && typeof navigator.clipboard.writeText === "function"){
      try{
        var pending = navigator.clipboard.writeText(value);
        return Promise.resolve(pending).catch(function(){
          return fallbackCopyText(value);
        });
      }catch(err){
        return fallbackCopyText(value);
      }
    }
    return fallbackCopyText(value);
  }
  function fallbackCopyText(value){
    return new Promise(function(resolve, reject){
      var ta = null;
      try{
        ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        if(document.body) document.body.appendChild(ta);
        if(typeof ta.focus === "function") ta.focus();
        if(typeof ta.select === "function") ta.select();
        if(typeof ta.setSelectionRange === "function") ta.setSelectionRange(0, value.length);
        var ok = document.execCommand("copy");
        if(ok) resolve();
        else reject(new Error("copy failed"));
      }catch(err){
        reject(err || new Error("copy failed"));
      }finally{
        if(ta && ta.parentNode && typeof ta.parentNode.removeChild === "function"){
          try{ ta.parentNode.removeChild(ta); }catch(e){}
        }
      }
    });
  }
  function shareOrCopy(data){
    data = data || {};
    var payload = {};
    if(data.title) payload.title = String(data.title);
    if(data.text) payload.text = String(data.text);
    if(data.url) payload.url = String(data.url);
    var fallback = payload.url || payload.text || payload.title || "";
    if(typeof navigator.share === "function"){
      var pending;
      try{
        pending = navigator.share(payload);
      }catch(err){
        if(err && err.name === "AbortError") return Promise.resolve({ aborted: true });
        pending = Promise.reject(err);
      }
      return Promise.resolve(pending).then(function(){
        return { method: "share" };
      }).catch(function(err){
        if(err && err.name === "AbortError") return { aborted: true };
        return copyText(fallback).then(function(){ return { method: "copy" }; });
      });
    }
    return copyText(fallback).then(function(){ return { method: "copy" }; });
  }
  function presentCopy(text){
    return copyText(text).then(function(){
      showToast("Copied");
    }).catch(function(){
      showToast("Couldn't copy");
    });
  }
  function presentShare(data){
    return shareOrCopy(data).then(function(result){
      if(result && result.method === "copy") showToast("Copied");
    }).catch(function(){
      showToast("Couldn't copy");
    });
  }

  /* ---------- Share overlay ---------- */
  var shareTargetIdeaId = null;
  function ideaShareData(ideaId){
    var idea = IDEAS_BY_ID[ideaId];
    if(!idea) return { title: "Jaderoo", text: "A date idea on Jaderoo" };
    var text = idea.title;
    if(idea.description) text += " — " + idea.description;
    return { title: idea.title, text: text };
  }
  function openShareOverlay(ideaId){
    shareTargetIdeaId = ideaId;
    var list = $("#share-friend-list");
    list.innerHTML = "";
    var shareBtn = el("button", "btn-secondary btn-block", icon("share") + " Share");
    shareBtn.type = "button";
    shareBtn.addEventListener("click", function(){
      presentShare(ideaShareData(ideaId));
    });
    list.appendChild(shareBtn);
    list.appendChild(el("p", "field-hint", "Demo friends stay on this device."));
    DEMO_FRIENDS.forEach(function(f){
      var row = el("div", "share-friend-row");
      row.innerHTML =
        '<span class="friend-avatar" style="background:' + f.avatarColor + '">' + f.avatarEmoji + '</span>' +
        '<span class="friend-name">' + escapeHtml(f.name) + '</span>';
      row.addEventListener("click", function(){
        closeOverlay("#share-overlay");
        presentShare(ideaShareData(ideaId));
      });
      list.appendChild(row);
    });
    openOverlay("#share-overlay");
  }
  $("#share-close").addEventListener("click", function(){ closeOverlay("#share-overlay"); });

  /* ---------- Share-a-plan overlay ----------
     Two steps: pick a friend, then (simulated, since there's no backend
     connecting devices) mark which idea in the plan that friend likes best. */
  var planShareState = { planId: null, friendIdx: null };
  function openPlanShareOverlay(planId){
    planShareState.planId = planId;
    planShareState.friendIdx = null;
    showPlanShareStep(1);
    openOverlay("#plan-share-overlay");
  }
  function showPlanShareStep(step){
    $("#plan-share-step1").classList.toggle("hidden", step !== 1);
    $("#plan-share-step2").classList.toggle("hidden", step !== 2);
    if(step === 1) renderPlanShareFriends();
    else renderPlanShareIdeas();
  }
  function renderPlanShareFriends(){
    var list = $("#plan-share-friend-list");
    list.innerHTML = "";
    DEMO_FRIENDS.forEach(function(f, idx){
      var row = el("div", "share-friend-row");
      row.innerHTML =
        '<span class="friend-avatar" style="background:' + f.avatarColor + '">' + f.avatarEmoji + '</span>' +
        '<span class="friend-name">' + escapeHtml(f.name) + '</span>';
      row.addEventListener("click", function(){
        planShareState.friendIdx = idx;
        showPlanShareStep(2);
      });
      list.appendChild(row);
    });
  }
  function renderPlanShareIdeas(){
    var plan = getPlanById(planShareState.planId);
    var f = DEMO_FRIENDS[planShareState.friendIdx];
    if(!f) return;
    $("#plan-share-friend-label").textContent = f.name;
    var list = $("#plan-share-idea-list");
    list.innerHTML = "";
    if(!plan || !plan.ideaIds.length){
      list.innerHTML = '<p class="field-hint">No ideas saved in this plan yet — save a few first, then share.</p>';
      return;
    }
    plan.ideaIds.forEach(function(id){
      var idea = IDEAS_BY_ID[id];
      if(!idea) return;
      var row = el("div", "idea-row");
      row.innerHTML =
        '<span class="ir-icon">' + categoryIcon(idea.category) + '</span>' +
        '<span class="ir-text"><div class="ir-title">' + escapeHtml(idea.title) + '</div>' +
        '<div class="ir-sub">' + escapeHtml(idea.category) + '</div>' + statusBadgeHtml(idea) + '</span>' +
        '<span class="ir-chevron">›</span>';
      row.addEventListener("click", function(){ commitFriendPick(id); });
      list.appendChild(row);
    });
  }
  function commitFriendPick(ideaId){
    var plan = getPlanById(planShareState.planId);
    var f = DEMO_FRIENDS[planShareState.friendIdx];
    if(!plan || !f) return;
    if(!Array.isArray(plan.friendPicks)) plan.friendPicks = [];
    // A friend only has one active "favorite" per plan — picking again replaces it.
    plan.friendPicks = plan.friendPicks.filter(function(p){ return p.friendName !== f.name; });
    plan.friendPicks.push({ id: genId("pick"), friendName: f.name, avatarEmoji: f.avatarEmoji, avatarColor: f.avatarColor, ideaId: ideaId });
    saveState();
    closeOverlay("#plan-share-overlay");
    showToast("Saved locally");
    renderContent();
  }
  $("#plan-share-close").addEventListener("click", function(){ closeOverlay("#plan-share-overlay"); });
  $("#plan-share-back").addEventListener("click", function(){ showPlanShareStep(1); });

  /* ---------- Plan link (#plan=v1.<base64url>) ----------
     Wire JSON is compact and has only three keys: n (name), d (date,
     YYYY-MM-DD or ""), i (built-in data.js idea ids). Addresses,
     coordinates, location, and place or event cards are not included.
     Decode drops any other fields and returns null for bad input.
     routeSharedPlan reads the fragment after the age gate. */
  var PLAN_SHARE_MAX_CHARS = 400;
  var PLAN_SHARE_MAX_IDEAS = 24;
  var PLAN_SHARE_MAX_NAME = 60;
  var PLAN_SHARE_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  var planShareBuiltinIds = null;
  var planShareB64Map = null;

  function planShareIsBuiltin(id){
    if(!planShareBuiltinIds){
      planShareBuiltinIds = Object.create(null);
      if(typeof IDEAS_DATA !== "undefined" && IDEAS_DATA){
        for(var b = 0; b < IDEAS_DATA.length; b++) planShareBuiltinIds[IDEAS_DATA[b].id] = 1;
      }
    }
    return !!planShareBuiltinIds[id];
  }
  function planShareId(value){
    var n = typeof value === "number" ? value : NaN;
    if(typeof value === "string" && /^\d+$/.test(value)) n = Number(value);
    if(!isFinite(n) || Math.floor(n) !== n) return null;
    if(n < 1 || n > 9999999) return null;
    return n;
  }
  function planShareClip(value, max){
    if(typeof value !== "string") return "";
    var s = value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
    if(s.length <= max) return s;
    s = s.slice(0, max);
    var tail = s.charCodeAt(s.length - 1);
    if(tail >= 0xD800 && tail <= 0xDBFF) s = s.slice(0, -1);
    return s;
  }
  function planShareDate(value){
    if(typeof value !== "string") return "";
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if(!m) return "";
    var mo = +m[2], day = +m[3];
    if(mo < 1 || mo > 12 || day < 1 || day > 31) return "";
    return m[1] + "-" + m[2] + "-" + m[3];
  }
  function planShareUtf8(str){
    var bytes = [];
    for(var i = 0; i < str.length; i++){
      var c = str.charCodeAt(i);
      if(c >= 0xD800 && c <= 0xDBFF){
        var c2 = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
        if(c2 < 0xDC00 || c2 > 0xDFFF) continue;
        var u = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
        i++;
        bytes.push(0xF0 | (u >>> 18), 0x80 | ((u >>> 12) & 63), 0x80 | ((u >>> 6) & 63), 0x80 | (u & 63));
      } else if(c >= 0xDC00 && c <= 0xDFFF){
        continue;
      } else if(c < 0x80){
        bytes.push(c);
      } else if(c < 0x800){
        bytes.push(0xC0 | (c >>> 6), 0x80 | (c & 63));
      } else {
        bytes.push(0xE0 | (c >>> 12), 0x80 | ((c >>> 6) & 63), 0x80 | (c & 63));
      }
    }
    return bytes;
  }
  function planShareFromUtf8(bytes){
    var out = "";
    var i = 0;
    while(i < bytes.length){
      var b = bytes[i];
      var need, cp, min;
      if(b < 0x80){ out += String.fromCharCode(b); i++; continue; }
      if((b & 0xE0) === 0xC0){ need = 2; cp = b & 0x1F; min = 0x80; }
      else if((b & 0xF0) === 0xE0){ need = 3; cp = b & 0x0F; min = 0x800; }
      else if((b & 0xF8) === 0xF0){ need = 4; cp = b & 0x07; min = 0x10000; }
      else return null;
      if(i + need > bytes.length) return null;
      for(var j = 1; j < need; j++){
        var nb = bytes[i + j];
        if((nb & 0xC0) !== 0x80) return null;
        cp = (cp << 6) | (nb & 0x3F);
      }
      if(cp < min || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) return null;
      if(cp > 0xFFFF){
        cp -= 0x10000;
        out += String.fromCharCode(0xD800 + (cp >>> 10), 0xDC00 + (cp & 0x3FF));
      } else {
        out += String.fromCharCode(cp);
      }
      i += need;
    }
    return out;
  }
  function planShareB64Index(){
    if(planShareB64Map) return planShareB64Map;
    planShareB64Map = Object.create(null);
    for(var i = 0; i < PLAN_SHARE_B64.length; i++) planShareB64Map[PLAN_SHARE_B64.charAt(i)] = i;
    return planShareB64Map;
  }
  function planShareToB64(bytes){
    var out = "";
    var i = 0;
    while(i + 3 <= bytes.length){
      var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out += PLAN_SHARE_B64.charAt((n >>> 18) & 63);
      out += PLAN_SHARE_B64.charAt((n >>> 12) & 63);
      out += PLAN_SHARE_B64.charAt((n >>> 6) & 63);
      out += PLAN_SHARE_B64.charAt(n & 63);
      i += 3;
    }
    var rem = bytes.length - i;
    if(rem === 1){
      var n1 = bytes[i] << 16;
      out += PLAN_SHARE_B64.charAt((n1 >>> 18) & 63);
      out += PLAN_SHARE_B64.charAt((n1 >>> 12) & 63);
    } else if(rem === 2){
      var n2 = (bytes[i] << 16) | (bytes[i + 1] << 8);
      out += PLAN_SHARE_B64.charAt((n2 >>> 18) & 63);
      out += PLAN_SHARE_B64.charAt((n2 >>> 12) & 63);
      out += PLAN_SHARE_B64.charAt((n2 >>> 6) & 63);
    }
    return out;
  }
  function planShareFromB64(s){
    if(typeof s !== "string" || s.length === 0 || (s.length % 4) === 1) return null;
    var map = planShareB64Index();
    var out = [];
    var i = 0;
    while(i < s.length){
      var c0 = map[s.charAt(i)];
      var c1 = (i + 1 < s.length) ? map[s.charAt(i + 1)] : undefined;
      if(c0 === undefined || c1 === undefined) return null;
      if(i + 2 >= s.length){
        if((c1 & 15) !== 0) return null;
        out.push((c0 << 2) | (c1 >> 4));
        break;
      }
      var c2 = map[s.charAt(i + 2)];
      if(c2 === undefined) return null;
      if(i + 3 >= s.length){
        if((c2 & 3) !== 0) return null;
        out.push((c0 << 2) | (c1 >> 4));
        out.push(((c1 & 15) << 4) | (c2 >> 2));
        break;
      }
      var c3 = map[s.charAt(i + 3)];
      if(c3 === undefined) return null;
      out.push((c0 << 2) | (c1 >> 4));
      out.push(((c1 & 15) << 4) | (c2 >> 2));
      out.push(((c2 & 3) << 6) | c3);
      i += 4;
    }
    return out;
  }
  function planSharePack(name, date, ids){
    var json = JSON.stringify({ n: name, d: date, i: ids });
    var bytes = planShareUtf8(json);
    if(!bytes) return null;
    return "v1." + planShareToB64(bytes);
  }
  function planShareBuiltinIdsFrom(plan){
    var ids = [];
    var seen = Object.create(null);
    var raw = plan && Array.isArray(plan.ideaIds) ? plan.ideaIds : [];
    for(var i = 0; i < raw.length && ids.length < PLAN_SHARE_MAX_IDEAS; i++){
      var id = planShareId(raw[i]);
      if(id == null || seen[id] || !planShareIsBuiltin(id)) continue;
      seen[id] = 1;
      ids.push(id);
    }
    return ids;
  }
  function encodePlanShare(plan){
    try{
      if(!plan || typeof plan !== "object" || Array.isArray(plan)) return null;
      var name = planShareClip(plan.name, PLAN_SHARE_MAX_NAME);
      var date = planShareDate(plan.date);
      var ids = planShareBuiltinIdsFrom(plan);
      var payload = planSharePack(name, date, ids);
      while(payload && payload.length > PLAN_SHARE_MAX_CHARS && ids.length){
        ids.pop();
        payload = planSharePack(name, date, ids);
      }
      if(!payload || payload.length > PLAN_SHARE_MAX_CHARS) return null;
      return payload;
    }catch(err){
      return null;
    }
  }
  function decodePlanShare(payload){
    try{
      if(typeof payload !== "string" || payload.length > PLAN_SHARE_MAX_CHARS) return null;
      if(payload.indexOf("v1.") !== 0) return null;
      var body = payload.slice(3);
      var bytes = planShareFromB64(body);
      if(!bytes) return null;
      var json = planShareFromUtf8(bytes);
      if(json == null) return null;
      var obj = JSON.parse(json);
      if(!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
      var name = "";
      if(obj.n != null){
        if(typeof obj.n !== "string") return null;
        name = planShareClip(obj.n, PLAN_SHARE_MAX_NAME);
      }
      var date = "";
      if(obj.d != null && obj.d !== ""){
        if(typeof obj.d !== "string") return null;
        date = planShareDate(obj.d);
        if(!date) return null;
      }
      if(obj.i != null && !Array.isArray(obj.i)) return null;
      var source = Array.isArray(obj.i) ? obj.i : [];
      var ids = [];
      var seen = Object.create(null);
      for(var i = 0; i < source.length && ids.length < PLAN_SHARE_MAX_IDEAS; i++){
        var item = source[i];
        var id = null;
        if(item && typeof item === "object") id = planShareId(item.id);
        else id = planShareId(item);
        if(id == null){
          if(item && typeof item === "object") continue;
          return null;
        }
        if(!planShareIsBuiltin(id) || seen[id]) continue;
        seen[id] = 1;
        ids.push(id);
      }
      return { name: name, date: date, ideaIds: ids };
    }catch(err){
      return null;
    }
  }
  function planShareOmittedCount(plan){
    if(!plan || !Array.isArray(plan.ideaIds)) return 0;
    var seen = Object.create(null);
    var n = 0;
    for(var i = 0; i < plan.ideaIds.length; i++){
      var id = planShareId(plan.ideaIds[i]);
      var key = id == null ? ("x" + i) : String(id);
      if(seen[key]) continue;
      seen[key] = 1;
      if(id == null || !planShareIsBuiltin(id)) n++;
    }
    return n;
  }
  function planShareOmissionNote(count){
    count = count | 0;
    if(count <= 0) return "";
    if(count === 1) return "1 saved place isn't included in shared links";
    return count + " saved places aren't included in shared links";
  }
  function planShareOrigin(){
    var loc = null;
    try{
      if(typeof location !== "undefined" && location) loc = location;
    }catch(e){}
    if(!loc){
      try{
        if(typeof window !== "undefined" && window.location) loc = window.location;
      }catch(e2){}
    }
    var origin = loc && typeof loc.origin === "string" ? loc.origin : "";
    if(!origin || origin === "null") return "";
    return origin;
  }
  function planShareUrl(plan){
    var payload = encodePlanShare(plan);
    if(!payload) return "";
    return planShareOrigin() + "/#plan=" + payload;
  }
  function planLinkShareData(plan){
    var url = planShareUrl(plan);
    var name = planShareClip(plan && plan.name, PLAN_SHARE_MAX_NAME) || "Date plan";
    return { title: name, text: name, url: url };
  }
  function openPlanLinkOverlay(planId){
    var plan = getPlanById(planId);
    if(!plan) return;
    var body = $("#plan-link-body");
    body.innerHTML = "";
    var note = planShareOmissionNote(planShareOmittedCount(plan));
    if(note) body.appendChild(el("p", "field-hint plan-link-omit", note));
    var url = planShareUrl(plan);
    if(!url){
      body.appendChild(el("p", "field-hint", "This plan can't be packed into a link."));
      openOverlay("#plan-link-overlay");
      return;
    }
    var qrWrap = el("div", "qr-wrap");
    try{
      var qr = qrcode(0, "M");
      qr.addData(url);
      qr.make();
      qrWrap.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2 });
    }catch(e){
      qrWrap.textContent = "QR code unavailable";
    }
    body.appendChild(qrWrap);
    var linkNote = el("p", "qr-link-note");
    linkNote.textContent = url;
    body.appendChild(linkNote);
    var copyBtn = el("button", "btn-secondary btn-block", icon("copy") + " Copy link");
    copyBtn.type = "button";
    copyBtn.addEventListener("click", function(){ presentCopy(planShareUrl(plan)); });
    body.appendChild(copyBtn);
    var shareLinkBtn = el("button", "btn-secondary btn-block", icon("share") + " Share link");
    shareLinkBtn.type = "button";
    shareLinkBtn.addEventListener("click", function(){ presentShare(planLinkShareData(plan)); });
    body.appendChild(shareLinkBtn);
    openOverlay("#plan-link-overlay");
  }
  $("#plan-link-close").addEventListener("click", function(){ closeOverlay("#plan-link-overlay"); });

  /* ---------- Saved / Done screens ---------- */
  function buildIdeaRow(idea, subtext){
    var row = el("div", "idea-row");
    if(idea && idea.unavailable){
      row.classList.add("unavailable-item");
      subtext = "No longer available";
    }
    row.innerHTML =
      '<span class="ir-icon">' + ideaIcon(idea) + '</span>' +
      '<span class="ir-text"><div class="ir-title">' + escapeHtml(idea.title) + '</div>' +
      '<div class="ir-sub">' + escapeHtml(subtext) + '</div>' + statusBadgeHtml(idea) + '</span>' +
      '<span class="ir-chevron">›</span>';
    row.addEventListener("click", function(){ goToDetail(idea.id); });
    return row;
  }

  function isPlanPinned(planId){
    return Array.isArray(state.pinnedPlanIds) && state.pinnedPlanIds.indexOf(planId) !== -1;
  }

  function pinPlan(planId){
    if(!getPlanById(planId)) return false;
    if(!Array.isArray(state.pinnedPlanIds)) state.pinnedPlanIds = [];
    var idx = state.pinnedPlanIds.indexOf(planId);
    if(idx !== -1) state.pinnedPlanIds.splice(idx, 1);
    state.pinnedPlanIds.unshift(planId);
    saveState();
    return true;
  }

  function unpinPlan(planId){
    if(!Array.isArray(state.pinnedPlanIds)) state.pinnedPlanIds = [];
    var idx = state.pinnedPlanIds.indexOf(planId);
    if(idx === -1) return false;
    state.pinnedPlanIds.splice(idx, 1);
    saveState();
    return true;
  }

  function planDeleteMessage(plan){
    var name = plan && plan.name ? String(plan.name) : "this list";
    return 'Delete "' + name + '" from Jaderoo? This can\'t be undone.';
  }

  function confirmDeletePlan(plan){
    if(typeof confirm !== "function") return false;
    return confirm(planDeleteMessage(plan)) === true;
  }

  function ideaIsPast(idea, now){
    if(!idea || idea.unavailable === true) return false;
    if(typeof SparkOccurrences === "undefined" || typeof SparkOccurrences.isPast !== "function") return false;
    return SparkOccurrences.isPast(idea, now || new Date()) === true;
  }

  // Saved opens on an index of lists. A tap opens one list, and All lists
  // comes back. Order: pinned planning lists, Favorites, other planning
  // lists, then Done.
  function buildSavedScreen(){
    restoreSavedRemoteSnapshots();
    var wrap = el("div", "screen saved-screen");
    if(!ui.savedBucket){
      wrap.appendChild(buildSavedIndex());
      return wrap;
    }
    var folders = listSavedFolders();
    var active = null;
    for(var i = 0; i < folders.length; i++){
      if(sameSavedBucket(folders[i].bucket, ui.savedBucket)){ active = folders[i]; break; }
    }
    if(!active){
      ui.savedBucket = null;
      wrap.appendChild(buildSavedIndex());
      return wrap;
    }
    wrap.appendChild(buildSavedBackBar(active));
    if(active.bucket.type === "done") wrap.appendChild(buildSavedDoneList());
    else wrap.appendChild(buildSavedBucketScreen(active.bucket));
    return wrap;
  }

  function folderForPlan(plan){
    return {
      key: "plan:" + plan.id,
      bucket: { type:"plan", planId: plan.id },
      label: plan.name || "Plan",
      count: (plan.ideaIds || []).length,
      pinned: isPlanPinned(plan.id),
      dateLabel: plan.date ? fmtDate(plan.date) : "No date set",
      kind: "plan"
    };
  }

  function listSavedFolders(){
    var folders = [];
    var pinnedSet = {};
    var pinnedIds = Array.isArray(state.pinnedPlanIds) ? state.pinnedPlanIds : [];
    pinnedIds.forEach(function(id){
      var plan = getPlanById(id);
      if(!plan || pinnedSet[id]) return;
      pinnedSet[id] = true;
      folders.push(folderForPlan(plan));
    });
    folders.push({
      key: "someday",
      bucket: { type:"someday" },
      label: "Favorites",
      count: state.somedayIds.length,
      pinned: false,
      kind: "someday"
    });
    state.datePlans.slice().reverse().forEach(function(plan){
      if(!plan || pinnedSet[plan.id]) return;
      folders.push(folderForPlan(plan));
    });
    folders.push({
      key: "done",
      bucket: { type:"done" },
      label: "Done",
      count: state.doneIds.length,
      pinned: false,
      kind: "done"
    });
    return folders;
  }

  function sameSavedBucket(a, b){
    if(!a || !b || a.type !== b.type) return false;
    if(a.type === "plan") return a.planId === b.planId;
    return true;
  }

  function buildSavedBackBar(folder){
    var bar = el("div", "saved-back-bar");
    var back = el("button", "back-link saved-back", "‹ All lists");
    back.type = "button";
    back.addEventListener("click", function(){
      ui.savedBucket = null;
      renderContent();
    });
    bar.appendChild(back);
    bar.appendChild(el("h2", "saved-open-title", escapeHtml(folder.label) + " · " + folder.count));
    return bar;
  }

  function closeSavedListMenus(){
    var menus = document.querySelectorAll(".saved-list-actions");
    Array.prototype.forEach.call(menus, function(node){ node.hidden = true; });
    var buttons = document.querySelectorAll(".saved-list-more");
    Array.prototype.forEach.call(buttons, function(node){
      node.setAttribute("aria-expanded", "false");
    });
  }

  function buildSavedIndex(){
    var wrap = el("div", "saved-index");
    var add = el("button", "btn-secondary btn-block saved-index-add", icon("plus") + " Plan a New Date");
    add.type = "button";
    add.addEventListener("click", openPlanOverlay);
    wrap.appendChild(add);
    var folders = listSavedFolders();
    var groups = [
      { title:"Pinned", items: folders.filter(function(f){ return f.kind === "plan" && f.pinned; }) },
      { title:"Favorites", items: folders.filter(function(f){ return f.kind === "someday"; }) },
      { title:"Plans", items: folders.filter(function(f){ return f.kind === "plan" && !f.pinned; }) },
      { title:"Done", items: folders.filter(function(f){ return f.kind === "done"; }) }
    ];
    groups.forEach(function(group){
      if(!group.items.length) return;
      wrap.appendChild(el("div", "section-title saved-index-title", escapeHtml(group.title)));
      group.items.forEach(function(folder){
        wrap.appendChild(buildSavedIndexEntry(folder));
      });
    });
    return wrap;
  }

  function buildSavedIndexEntry(folder){
    var card = el("div", "saved-list-card" + (folder.pinned ? " is-pinned" : ""));
    var row = el("div", "saved-list-main");
    var open = el("button", "saved-list-open");
    open.type = "button";
    var glyph = folder.kind === "done" ? "check-circle" : (folder.kind === "someday" ? "star" : (folder.pinned ? "pin" : "calendar"));
    var sub = folder.kind === "plan"
      ? (folder.dateLabel || "No date set")
      : (folder.kind === "someday" ? "Ideas you want to keep" : "Dates you've tried");
    open.innerHTML =
      '<span class="saved-list-icon">' + icon(glyph) + '</span>' +
      '<span class="saved-list-text">' +
        '<span class="saved-list-name">' + escapeHtml(folder.label) + " · " + folder.count + '</span>' +
        '<span class="saved-list-sub">' + escapeHtml(sub) + '</span>' +
      '</span>';
    open.addEventListener("click", function(){
      ui.savedBucket = folder.bucket;
      renderContent();
    });
    row.appendChild(open);

    if(folder.kind === "plan"){
      var more = el("button", "saved-list-more", icon("more-horizontal"));
      more.type = "button";
      more.setAttribute("aria-label", "Actions for " + folder.label);
      more.setAttribute("aria-haspopup", "menu");
      more.setAttribute("aria-expanded", "false");
      var actions = el("div", "saved-list-actions");
      actions.hidden = true;
      actions.setAttribute("role", "menu");
      var pinBtn = el("button", "btn-outline saved-list-action", folder.pinned ? "Unpin list" : "Pin list");
      pinBtn.type = "button";
      pinBtn.setAttribute("role", "menuitem");
      pinBtn.addEventListener("click", function(ev){
        ev.stopPropagation();
        if(folder.pinned) unpinPlan(folder.bucket.planId);
        else pinPlan(folder.bucket.planId);
        renderContent();
      });
      var delBtn = el("button", "btn-text danger saved-list-action", "Delete list");
      delBtn.type = "button";
      delBtn.setAttribute("role", "menuitem");
      delBtn.addEventListener("click", function(ev){
        ev.stopPropagation();
        var plan = getPlanById(folder.bucket.planId);
        if(!confirmDeletePlan(plan || { name: folder.label })) return;
        deletePlan(folder.bucket.planId);
      });
      function closeThisMenu(){
        actions.hidden = true;
        more.setAttribute("aria-expanded", "false");
      }
      function onMenuKey(ev){
        if(ev.key === "Escape"){
          closeThisMenu();
          if(more.focus) more.focus();
        }
      }
      more.addEventListener("click", function(ev){
        ev.stopPropagation();
        var willOpen = !!actions.hidden;
        closeSavedListMenus();
        if(!willOpen) return;
        actions.hidden = false;
        more.setAttribute("aria-expanded", "true");
        var first = actions.querySelector && actions.querySelector("button");
        if(first && first.focus) first.focus();
      });
      more.addEventListener("keydown", onMenuKey);
      actions.addEventListener("keydown", onMenuKey);
      actions.appendChild(pinBtn);
      actions.appendChild(delBtn);
      row.appendChild(more);
      card.appendChild(row);
      card.appendChild(actions);
      var plan = getPlanById(folder.bucket.planId);
      return buildSwipeToDeleteRow(card, function(){ deletePlan(folder.bucket.planId); }, {
        confirm: function(){ return confirmDeletePlan(plan || { name: folder.label }); }
      });
    }

    var chev = el("span", "saved-list-chevron", "›");
    chev.setAttribute("aria-hidden", "true");
    row.appendChild(chev);
    card.appendChild(row);
    return card;
  }

  function deletePlan(planId){
    var idx = state.datePlans.findIndex(function(p){ return p.id === planId; });
    if(idx !== -1) state.datePlans.splice(idx, 1);
    if(Array.isArray(state.pinnedPlanIds)){
      var pinAt = state.pinnedPlanIds.indexOf(planId);
      if(pinAt !== -1) state.pinnedPlanIds.splice(pinAt, 1);
    }
    if(ui.activePlanId === planId) ui.activePlanId = null;
    if(ui.savedBucket && ui.savedBucket.type === "plan" && ui.savedBucket.planId === planId) ui.savedBucket = null;
    saveState();
    showToast("Plan deleted");
    renderContent();
  }

  // Ideas inside the selected plan or Favorites folder.
  function buildSavedBucketScreen(bucket){
    var wrap = el("div", "saved-bucket");
    var ids, plan = null;
    if(bucket.type === "plan"){
      plan = getPlanById(bucket.planId);
      if(!plan){
        wrap.appendChild(emptyNote(icon("bookmark"), "Nothing here yet", "Ideas you save into this folder will show up here."));
        return wrap;
      }
      var bar = el("div", "saved-plan-bar");
      var when = plan.date ? fmtDate(plan.date) : "No date set";
      bar.appendChild(el("div", "saved-plan-date", escapeHtml(when)));
      var shareBtn = el("button", "btn-outline saved-plan-action", icon("share") + " Share with Friends");
      shareBtn.type = "button";
      shareBtn.addEventListener("click", function(){ openPlanShareOverlay(plan.id); });
      var linkBtn = el("button", "btn-outline saved-plan-action", icon("share") + " Share plan");
      linkBtn.type = "button";
      linkBtn.addEventListener("click", function(){ openPlanLinkOverlay(plan.id); });
      var delBtn = el("button", "btn-text saved-plan-delete", "Delete plan");
      delBtn.type = "button";
      delBtn.addEventListener("click", function(){
        if(!confirmDeletePlan(plan)) return;
        deletePlan(plan.id);
      });
      bar.appendChild(shareBtn);
      bar.appendChild(linkBtn);
      bar.appendChild(delBtn);
      wrap.appendChild(bar);
      ids = plan.ideaIds;
    } else {
      ids = state.somedayIds;
    }

    if(!ids.length){
      var emptyTitle = bucket.type === "plan" ? "Nothing here yet" : "No saved ideas yet";
      var emptySub = bucket.type === "plan"
        ? "Ideas you save into this folder will show up here."
        : "Swipe yes on ideas you love, or tap Favorites, to start filling up your folders.";
      wrap.appendChild(emptyNote(icon("bookmark"), emptyTitle, emptySub));
      return wrap;
    }

    // Liked rows rise to the top (most recently liked first). Stored id
    // order stays put, so a shared link does not reshuffle. Among the
    // rest, a friend's pick still floats above the others, then newest
    // saved. Favorites is the keep-pile and Done already has star
    // ratings, so the like control is only on a planning list. The sort
    // and the card accent come from SparkUtil so a group list can reuse
    // the same likedAt flag.
    var rows = SparkUtil.orderSavedActivities(ids, plan && plan.likes, plan && plan.friendPicks);
    rows.forEach(function(row){
      var id = row.id;
      var idea = ideaForSaved(id);
      if(!idea) return;
      var picks = plan ? (plan.friendPicks || []).filter(function(p){ return p.ideaId === id; }) : [];
      var like = null;
      if(plan){
        like = {
          likedAt: row.likedAt,
          onToggle: function(){
            togglePlanLike(plan.id, id);
            renderContent();
          }
        };
      }
      var card = buildSavedCard(idea, { picks: picks, like: like });
      var swipeRow = buildSwipeToDeleteRow(card, function(){ removeSavedIdea(id, bucket); });
      if(picks.length) swipeRow.className = swipeRow.className + " friend-picked";
      wrap.appendChild(swipeRow);
    });
    return wrap;
  }

  function togglePlanLike(planId, ideaId, now){
    var plan = getPlanById(planId);
    if(!SparkUtil.toggleListLike(plan, ideaId, now == null ? Date.now() : now)) return false;
    saveState();
    return true;
  }

  function buildSavedDoneList(){
    var wrap = el("div", "saved-bucket");
    if(!state.doneIds.length){
      wrap.appendChild(emptyNote(icon("check-circle"), "No completed dates yet", "Mark ideas as done from their detail screen after you try them."));
      return wrap;
    }
    SparkUtil.sortedDoneEntries(state.doneIds).forEach(function(entry){
      var idea = ideaForSaved(entry.id);
      if(!idea) return;
      wrap.appendChild(buildSavedCard(idea, { doneDate: fmtDate(entry.date), doneEntry: entry }));
    });
    return wrap;
  }

  // Distance and cost only when the idea actually has them. "Open now" only
  // when openNow is true — the same fact the Discover card already uses.
  // A time pill is the authored Evening/Night label, shown beside Open now
  // when both are real. Weekdays and clock times are not invented.
  function savedMetaParts(idea, doneDate){
    var parts = [];
    if(idea && idea.unavailable){
      parts.push("No longer available");
      return parts;
    }
    var dist = distanceLabel(idea && idea.distanceMiles);
    if(dist) parts.push(dist);
    var cost = displayCost(idea);
    if(cost) parts.push(cost);
    if(doneDate) parts.push("Done " + doneDate);
    return parts;
  }

  function savedStatusBadge(idea){
    if(!idea || idea.unavailable) return null;
    if(idea.openNow === true) return { kind:"open", label:"Open now" };
    return null;
  }

  function savedTimeBadge(idea){
    if(!idea || idea.unavailable) return null;
    var label = SparkUtil.timeBadgeLabel(idea);
    if(!label) return null;
    return { kind:"time", label:label };
  }

  function appendSavedLikeButton(card, like){
    var on = SparkUtil.normalizeLikedAt(like && like.likedAt) != null;
    var btn = el("button", "saved-like-btn" + (on ? " is-on" : ""));
    btn.type = "button";
    btn.setAttribute("type", "button");
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "Remove top pick" : "Like this and move it to the top");
    btn.innerHTML = icon("star");
    // A tap, not a swipe. Stopping the pointer here keeps it off the
    // row's existing swipe-to-delete handler.
    btn.addEventListener("pointerdown", function(ev){ ev.stopPropagation(); });
    btn.addEventListener("click", function(ev){
      ev.stopPropagation();
      ev.preventDefault();
      if(like && typeof like.onToggle === "function") like.onToggle();
    });
    card.appendChild(btn);
  }

  function buildSavedCard(idea, opts){
    opts = opts || {};
    var past = ideaIsPast(idea);
    var like = opts.like || null;
    var likedView = like ? SparkUtil.likedItemPresentation({ id: idea && idea.id, likedAt: like.likedAt }, { past: past }) : null;
    var card = el("div", "saved-card" + (idea && idea.unavailable ? " unavailable-item" : "") + (past ? " is-past" : "") + (likedView && likedView.liked ? " is-liked" : ""));
    var photo = ideaPhoto(idea);
    var thumb = el("div", "saved-thumb" + (photo ? " has-photo" : " is-placeholder"));
    if(photo) thumb.innerHTML = '<img alt="" src="' + escapeHtml(photo.url) + '">';
    else thumb.innerHTML = icon("bookmark");
    var body = el("div", "saved-card-body");
    body.appendChild(el("div", "saved-card-title", escapeHtml(idea.title)));
    var meta = savedMetaParts(idea, opts.doneDate);
    if(meta.length) body.appendChild(el("div", "saved-card-meta", escapeHtml(meta.join(" · "))));
    if(past){
      body.appendChild(el("span", "saved-badge saved-badge-past", "Past"));
    } else {
      var badge = savedStatusBadge(idea);
      if(badge) body.appendChild(el("span", "saved-badge saved-badge-" + badge.kind, escapeHtml(badge.label)));
      var timeBadge = savedTimeBadge(idea);
      if(timeBadge) body.appendChild(el("span", "saved-badge saved-badge-" + timeBadge.kind, escapeHtml(timeBadge.label)));
    }
    if(likedView && likedView.badge){
      body.appendChild(el("span", "saved-badge saved-badge-liked", escapeHtml(likedView.badge)));
    }
    var picks = opts.picks || [];
    if(picks.length){
      body.appendChild(el("div", "friend-pick-badge",
        picks.map(function(p){ return p.avatarEmoji + " " + escapeHtml(p.friendName); }).join(", ") + " picked this!"));
    }
    if(opts.doneEntry) appendDoneRecap(body, opts.doneEntry);
    var mark = el("span", "saved-bookmark", icon("bookmark"));
    mark.setAttribute("aria-hidden", "true");
    card.appendChild(thumb);
    card.appendChild(body);
    if(like) appendSavedLikeButton(card, like);
    else card.appendChild(mark);
    card.addEventListener("click", function(){
      if(opts.onOpen) opts.onOpen();
      else goToDetail(idea.id);
    });
    return card;
  }

  function appendDoneRecap(body, entry){
    var block = el("div", "done-recap-block");
    var rating = SparkUtil.normalizeRating(entry.rating);
    if(rating){
      var stars = el("div", "done-stars");
      stars.setAttribute("role", "img");
      stars.setAttribute("aria-label", "Rated " + rating + " out of 5 stars");
      stars.appendChild(el("span", "is-filled", "★★★★★".slice(0, rating)));
      stars.appendChild(el("span", "is-empty", "☆☆☆☆☆".slice(0, 5 - rating)));
      block.appendChild(stars);
    }
    var recap = SparkUtil.normalizeRecap(entry.recap);
    if(recap) block.appendChild(el("div", "done-recap-line", escapeHtml(recap)));
    var tools = el("div", "done-card-tools");
    if(entry.photoKey){
      var holder = el("span", "done-user-thumb");
      holder.setAttribute("data-photo-key", entry.photoKey);
      var img = el("img", "hidden");
      img.alt = "Your photo";
      mountDonePhoto(img, entry.photoKey);
      holder.appendChild(img);
      tools.appendChild(holder);
    }
    var rateBtn = el("button", "done-rate-btn", rating ? "Edit" : "Rate this");
    rateBtn.type = "button";
    rateBtn.setAttribute("aria-label", rating ? "Edit rating, photo, and recap" : "Rate this");
    rateBtn.addEventListener("click", function(ev){
      ev.stopPropagation();
      ev.preventDefault();
      openDoneRecap(entry.id, { mode: rating ? "edit" : "new" });
    });
    tools.appendChild(rateBtn);
    block.appendChild(tools);
    body.appendChild(block);
  }

  /* ---------- Done rating, recap, and on-device photo ----------
     The rating and the one-line recap live on the done row in local
     state. The photo is a separate JPEG in IndexedDB, keyed by photoKey,
     so a picture never counts against the localStorage quota. Drawing
     the file onto a canvas and exporting JPEG drops EXIF, including
     location. Nothing here is uploaded. */
  var DONE_PHOTO_DB = "jaderoo-done-photos";
  var DONE_PHOTO_STORE = "photos";
  var donePhotoCache = {};
  var recapSession = null;

  function idbFactory(){
    try{
      if(typeof indexedDB !== "undefined" && indexedDB && indexedDB.open) return indexedDB;
    }catch(err){}
    return null;
  }

  function openDonePhotoDb(){
    var factory = idbFactory();
    if(!factory || typeof Promise === "undefined") return Promise.reject(new Error("idb"));
    return new Promise(function(resolve, reject){
      var req = factory.open(DONE_PHOTO_DB, 1);
      req.onupgradeneeded = function(){
        var db = req.result;
        if(!db.objectStoreNames.contains(DONE_PHOTO_STORE)) db.createObjectStore(DONE_PHOTO_STORE);
      };
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ reject(req.error || new Error("idb")); };
    });
  }

  function putDonePhoto(key, blob){
    return openDonePhotoDb().then(function(db){
      return new Promise(function(resolve, reject){
        var tx = db.transaction(DONE_PHOTO_STORE, "readwrite");
        tx.objectStore(DONE_PHOTO_STORE).put(blob, key);
        tx.oncomplete = function(){ resolve(key); };
        tx.onerror = function(){ reject(tx.error || new Error("idb")); };
        tx.onabort = function(){ reject(tx.error || new Error("idb")); };
      });
    });
  }

  function getDonePhoto(key){
    return openDonePhotoDb().then(function(db){
      return new Promise(function(resolve, reject){
        var tx = db.transaction(DONE_PHOTO_STORE, "readonly");
        var req = tx.objectStore(DONE_PHOTO_STORE).get(key);
        req.onsuccess = function(){ resolve(req.result || null); };
        req.onerror = function(){ reject(req.error || new Error("idb")); };
      });
    });
  }

  function deleteDonePhoto(key){
    if(!key) return;
    var cached = donePhotoCache[key];
    if(cached && cached.url && typeof URL !== "undefined" && URL.revokeObjectURL){
      try{ URL.revokeObjectURL(cached.url); }catch(err){}
    }
    delete donePhotoCache[key];
    if(!idbFactory() || typeof Promise === "undefined") return;
    openDonePhotoDb().then(function(db){
      var tx = db.transaction(DONE_PHOTO_STORE, "readwrite");
      tx.objectStore(DONE_PHOTO_STORE).delete(key);
    }).catch(function(){});
  }

  function clearDonePhotos(){
    Object.keys(donePhotoCache).forEach(function(key){
      var cached = donePhotoCache[key];
      if(cached && cached.url && typeof URL !== "undefined" && URL.revokeObjectURL){
        try{ URL.revokeObjectURL(cached.url); }catch(err){}
      }
    });
    donePhotoCache = {};
    var factory = idbFactory();
    if(factory && factory.deleteDatabase){
      try{ factory.deleteDatabase(DONE_PHOTO_DB); }catch(err){}
    }
  }

  function rememberDonePhoto(key, blob){
    if(!key || !blob || typeof URL === "undefined" || !URL.createObjectURL) return;
    var prev = donePhotoCache[key];
    if(prev && prev.url && URL.revokeObjectURL){
      try{ URL.revokeObjectURL(prev.url); }catch(err){}
    }
    donePhotoCache[key] = { url: URL.createObjectURL(blob) };
  }

  function loadDonePhotoUrl(key){
    if(!key || typeof Promise === "undefined"){
      return { then: function(){ return this; } };
    }
    var cached = donePhotoCache[key];
    if(cached && cached.url) return Promise.resolve(cached.url);
    if(cached && cached.pending) return cached.pending;
    if(!idbFactory()) return Promise.resolve("");
    var pending = getDonePhoto(key).then(function(blob){
      if(!blob || typeof URL === "undefined" || !URL.createObjectURL){
        delete donePhotoCache[key];
        return "";
      }
      var url = URL.createObjectURL(blob);
      donePhotoCache[key] = { url: url };
      return url;
    }).catch(function(){
      delete donePhotoCache[key];
      return "";
    });
    donePhotoCache[key] = { pending: pending };
    return pending;
  }

  function mountDonePhoto(img, photoKey){
    if(!img || !photoKey) return;
    function show(url){
      if(!url) return;
      img.src = url;
      if(img.classList) img.classList.remove("hidden");
    }
    var cached = donePhotoCache[photoKey];
    if(cached && cached.url){
      show(cached.url);
      return;
    }
    if(!idbFactory() || typeof Promise === "undefined") return;
    loadDonePhotoUrl(photoKey).then(show);
  }

  // Re-encode through a canvas. The stored JPEG is a new file, so camera
  // location and the rest of the EXIF are not kept.
  function downscaleImageFile(file){
    return new Promise(function(resolve, reject){
      if(!file || typeof URL === "undefined" || !URL.createObjectURL || typeof Image === "undefined"){
        reject(new Error("photo"));
        return;
      }
      var objectUrl = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function(){
        var size = SparkUtil.fitLongEdge(img.naturalWidth || img.width, img.naturalHeight || img.height, SparkUtil.PHOTO_LONG_EDGE);
        URL.revokeObjectURL(objectUrl);
        if(!size){ reject(new Error("photo")); return; }
        var canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;
        var ctx = canvas.getContext && canvas.getContext("2d");
        if(!ctx || !canvas.toBlob){ reject(new Error("photo")); return; }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size.width, size.height);
        ctx.drawImage(img, 0, 0, size.width, size.height);
        canvas.toBlob(function(blob){
          if(!blob){ reject(new Error("photo")); return; }
          resolve(blob);
        }, "image/jpeg", 0.82);
      };
      img.onerror = function(){
        URL.revokeObjectURL(objectUrl);
        reject(new Error("photo"));
      };
      img.src = objectUrl;
    });
  }

  function findDoneEntry(ideaId){
    for(var i = 0; i < state.doneIds.length; i++){
      if(state.doneIds[i] && state.doneIds[i].id === ideaId) return state.doneIds[i];
    }
    return null;
  }

  function commitDoneRecap(ideaId, draft){
    var entry = findDoneEntry(ideaId);
    if(!entry) return { ok:false, error:"missing" };
    var result = SparkUtil.applyDoneRecap(entry, draft || {});
    if(!result.ok) return result;
    saveState();
    return result;
  }

  function refreshDoneSurfaces(){
    if(ui.profileMenuOpen === "done"){
      var sub = $("#subpage-body");
      if(sub){
        sub.innerHTML = "";
        sub.appendChild(buildDoneSubpanel());
      }
    }
    var appView = $("#view-app");
    if(appView && appView.classList && appView.classList.contains("hidden")) return;
    if(ui.screen === "detail" || ui.tab === "saved" || ui.tab === "done") renderContent();
  }

  function closeDoneRecap(skipped){
    var session = recapSession;
    recapSession = null;
    if(session && session.previewUrl && typeof URL !== "undefined" && URL.revokeObjectURL){
      try{ URL.revokeObjectURL(session.previewUrl); }catch(err){}
      session.previewUrl = "";
    }
    closeOverlay("#done-recap-overlay");
    if(skipped && session && session.announceSkip){
      showToast("Marked as done. Rate it anytime in Jaderoo.");
    }
  }

  function saveRecapSession(){
    var session = recapSession;
    if(!session) return;
    if(!SparkUtil.normalizeRating(session.rating)){
      showToast("Pick a star rating to save in Jaderoo.");
      return;
    }
    var entry = findDoneEntry(session.ideaId);
    if(!entry){ closeDoneRecap(false); return; }

    function write(photoKey){
      if(recapSession !== session) return;
      var result = commitDoneRecap(session.ideaId, {
        rating: session.rating,
        recap: session.recap,
        photoKey: photoKey || "",
        removePhoto: !photoKey
      });
      if(!result.ok) return;
      closeDoneRecap(false);
      showToast("Saved in Jaderoo.");
      refreshDoneSurfaces();
    }

    if(session.blob){
      var key = "done-" + session.ideaId + "-" + Date.now();
      var oldKey = session.photoKey;
      putDonePhoto(key, session.blob).then(function(){
        if(recapSession !== session) return;
        rememberDonePhoto(key, session.blob);
        if(oldKey && oldKey !== key) deleteDonePhoto(oldKey);
        write(key);
      }).catch(function(){
        if(recapSession !== session) return;
        showToast("The rating is saved in Jaderoo, but the photo could not be stored on this device.");
        write(session.removePhoto ? "" : (oldKey || ""));
      });
      return;
    }
    if(session.removePhoto && session.photoKey) deleteDonePhoto(session.photoKey);
    write(session.removePhoto ? "" : (session.photoKey || ""));
  }

  function buildDoneRecapForm(session){
    session = session || {};
    var wrap = el("div", "done-recap-form");
    var rating = SparkUtil.normalizeRating(session.rating);

    var group = el("div", "star-picker");
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", "Rating out of 5 stars");
    group.setAttribute("aria-describedby", "done-recap-hint");
    for(var n = 1; n <= 5; n++){
      var on = !!rating && n <= rating;
      var btn = el("button", "star-btn" + (on ? " is-on" : ""), on ? "★" : "☆");
      btn.type = "button";
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", rating === n ? "true" : "false");
      btn.setAttribute("aria-label", n === 1 ? "1 star" : (n + " stars"));
      btn.setAttribute("data-rating", String(n));
      btn.setAttribute("tabindex", (rating ? rating === n : n === 1) ? "0" : "-1");
      group.appendChild(btn);
    }
    wrap.appendChild(group);

    var hint = el("p", "field-hint", "Pick a star rating to save. You can skip and rate this later in Jaderoo.");
    hint.id = "done-recap-hint";
    hint.setAttribute("aria-live", "polite");
    wrap.appendChild(hint);

    var recapLabel = el("label", "field-label", "One-line recap");
    recapLabel.setAttribute("for", "done-recap-input");
    wrap.appendChild(recapLabel);
    var input = el("input", "field-input");
    input.id = "done-recap-input";
    input.type = "text";
    input.maxLength = SparkUtil.RECAP_MAX;
    input.setAttribute("maxlength", String(SparkUtil.RECAP_MAX));
    input.placeholder = "One line, about what you did";
    input.setAttribute("autocomplete", "off");
    input.setAttribute("enterkeyhint", "done");
    input.setAttribute("aria-describedby", "done-recap-count");
    input.value = session.recap || "";
    wrap.appendChild(input);
    var count = el("div", "recap-count", Array.from(input.value).length + "/" + SparkUtil.RECAP_MAX);
    count.id = "done-recap-count";
    wrap.appendChild(count);

    var hasPhoto = !!(session.previewUrl || (session.photoKey && !session.removePhoto));
    var photoLabel = el("label", "btn-secondary done-photo-label");
    var photoText = el("span", "done-photo-label-text", hasPhoto ? "Replace photo" : "Add a photo");
    var file = el("input");
    file.type = "file";
    file.accept = "image/*";
    file.setAttribute("accept", "image/*");
    file.setAttribute("aria-label", "Add a photo");
    photoLabel.appendChild(photoText);
    photoLabel.appendChild(file);
    wrap.appendChild(photoLabel);
    wrap.appendChild(el("p", "field-hint", "Optional. Your photo stays on this device."));

    var preview = el("img", "done-photo-preview" + (session.previewUrl ? "" : " hidden"));
    preview.alt = "Photo preview";
    if(session.previewUrl) preview.src = session.previewUrl;
    wrap.appendChild(preview);

    var removeBtn = el("button", "btn-text done-photo-remove" + (hasPhoto ? "" : " hidden"), "Remove photo");
    removeBtn.type = "button";
    wrap.appendChild(removeBtn);

    var actions = el("div", "done-recap-actions");
    var skipBtn = el("button", "btn-secondary done-recap-skip", session.mode === "edit" ? "Cancel" : "Skip for now");
    skipBtn.type = "button";
    var saveBtn = el("button", "btn-primary done-recap-save", "Save");
    saveBtn.type = "button";
    if(!rating) saveBtn.setAttribute("disabled", "disabled");
    saveBtn.disabled = !rating;
    actions.appendChild(skipBtn);
    actions.appendChild(saveBtn);
    wrap.appendChild(actions);

    function paintStars(next, focusN){
      var buttons = group.querySelectorAll(".star-btn");
      Array.prototype.forEach.call(buttons, function(star){
        var value = Number(star.getAttribute("data-rating"));
        var filled = !!next && value <= next;
        star.classList.toggle("is-on", filled);
        star.textContent = filled ? "★" : "☆";
        star.setAttribute("aria-checked", next === value ? "true" : "false");
        var tab = (next ? next === value : value === 1) ? "0" : "-1";
        star.setAttribute("tabindex", tab);
        if(focusN && value === focusN && star.focus) star.focus();
      });
      hint.textContent = next
        ? ("Rated " + next + " out of 5.")
        : "Pick a star rating to save. You can skip and rate this later in Jaderoo.";
      if(next) saveBtn.removeAttribute("disabled");
      else saveBtn.setAttribute("disabled", "disabled");
      saveBtn.disabled = !next;
    }

    group.addEventListener("click", function(e){
      var node = e.target;
      if(node && node.nodeType !== 1) node = node.parentElement;
      var star = node && node.closest ? node.closest(".star-btn") : null;
      if(!star || !group.contains(star)) return;
      session.rating = Number(star.getAttribute("data-rating"));
      paintStars(session.rating, null);
    });
    group.addEventListener("keydown", function(e){
      var handled = { ArrowRight:1, ArrowLeft:1, ArrowUp:1, ArrowDown:1, Home:1, End:1, "1":1, "2":1, "3":1, "4":1, "5":1 };
      if(!handled[e.key]) return;
      e.preventDefault();
      session.rating = SparkUtil.moveStarRating(session.rating, e.key);
      paintStars(session.rating, session.rating);
    });
    input.addEventListener("input", function(){
      var text = String(input.value || "").replace(/[\r\n]+/g, " ");
      if(text !== input.value) input.value = text;
      session.recap = text;
      count.textContent = Array.from(text).length + "/" + SparkUtil.RECAP_MAX;
    });
    input.addEventListener("keydown", function(e){
      if(e.key === "Enter"){
        e.preventDefault();
        saveRecapSession();
      }
    });
    file.addEventListener("change", function(){
      var picked = file.files && file.files[0];
      if(!picked) return;
      downscaleImageFile(picked).then(function(blob){
        if(recapSession !== session) return;
        if(session.previewUrl && URL.revokeObjectURL){
          try{ URL.revokeObjectURL(session.previewUrl); }catch(err){}
        }
        session.blob = blob;
        session.previewUrl = URL.createObjectURL(blob);
        session.removePhoto = false;
        preview.src = session.previewUrl;
        preview.classList.remove("hidden");
        removeBtn.classList.remove("hidden");
        photoText.textContent = "Replace photo";
      }).catch(function(){
        showToast("Jaderoo couldn't read that photo. Try a different one.");
      });
      try{ file.value = ""; }catch(err){}
    });
    removeBtn.addEventListener("click", function(){
      session.removePhoto = true;
      session.blob = null;
      if(session.previewUrl && typeof URL !== "undefined" && URL.revokeObjectURL){
        try{ URL.revokeObjectURL(session.previewUrl); }catch(err){}
      }
      session.previewUrl = "";
      preview.removeAttribute("src");
      preview.classList.add("hidden");
      removeBtn.classList.add("hidden");
      photoText.textContent = "Add a photo";
    });
    skipBtn.addEventListener("click", function(){ closeDoneRecap(true); });
    saveBtn.addEventListener("click", function(){ saveRecapSession(); });

    if(session.photoKey && !session.previewUrl && !session.removePhoto && typeof Promise !== "undefined"){
      mountDonePhoto(preview, session.photoKey);
      loadDonePhotoUrl(session.photoKey).then(function(url){
        if(!url || recapSession !== session || session.removePhoto || session.previewUrl) return;
        preview.src = url;
        preview.classList.remove("hidden");
      });
    }
    return wrap;
  }

  function openDoneRecap(ideaId, opts){
    if(typeof opts === "string") opts = { mode: opts };
    opts = opts || {};
    var entry = findDoneEntry(ideaId);
    if(!entry) return;
    var idea = IDEAS_BY_ID[ideaId];
    if(recapSession && recapSession.previewUrl && typeof URL !== "undefined" && URL.revokeObjectURL){
      try{ URL.revokeObjectURL(recapSession.previewUrl); }catch(err){}
    }
    recapSession = {
      ideaId: ideaId,
      mode: opts.mode === "edit" ? "edit" : "new",
      announceSkip: !!opts.announceSkip,
      rating: SparkUtil.normalizeRating(entry.rating),
      recap: entry.recap || "",
      photoKey: entry.photoKey || "",
      removePhoto: false,
      previewUrl: "",
      blob: null
    };
    var title = $("#done-recap-title");
    var sub = $("#done-recap-sub");
    if(title) title.textContent = recapSession.mode === "edit" ? "Update your recap" : "How was it?";
    if(sub){
      sub.textContent = (idea && idea.title ? idea.title + ". " : "") +
        "A star rating is required to save in Jaderoo. The photo and one-line recap are optional.";
    }
    var body = $("#done-recap-body");
    if(body){
      body.innerHTML = "";
      body.appendChild(buildDoneRecapForm(recapSession));
    }
    openOverlay("#done-recap-overlay");
    setTimeout(function(){
      var root = $("#done-recap-body");
      if(!root || !root.querySelector) return;
      var selected = root.querySelector('.star-btn[aria-checked="true"]');
      var first = root.querySelector(".star-btn");
      var target = selected || first;
      if(target && target.focus) target.focus();
    }, 30);
  }

  var doneRecapCloseBtn = $("#done-recap-close");
  if(doneRecapCloseBtn) doneRecapCloseBtn.addEventListener("click", function(){ closeDoneRecap(true); });

  function removeSavedIdea(id, bucket){
    removeIdeaFromBucket(id, bucket);
    saveState();
    showToast("Removed from " + bucketLabel(bucket));
    renderContent();
  }

  // Wraps a row element so a big right-to-left swipe reveals a Delete button.
  // Tracks the single currently-open row so opening a new one closes the last.
  var openSwipeRowReset = null;
  function buildSwipeToDeleteRow(innerEl, onDelete, opts){
    opts = opts || {};
    var wrapper = el("div", "swipeable-row");
    var action = el("div", "swipe-delete-action");
    var delBtn = el("button", "swipe-delete-btn", icon("trash-2") + " Delete");
    delBtn.type = "button";
    action.appendChild(delBtn);
    wrapper.appendChild(action);

    var content = el("div", "swipeable-row-content");
    content.appendChild(innerEl);
    wrapper.appendChild(content);

    var REVEAL = 84;
    var isOpen = false, startX = 0, startY = 0, baseX = 0, axis = null, dragging = false, wasOpenAtDown = false, suppressClick = false;

    function setOffset(x, animate){
      content.style.transition = animate ? "transform .22s ease" : "none";
      content.style.transform = "translateX(" + x + "px)";
    }
    function closeRow(animate){
      isOpen = false;
      setOffset(0, animate !== false);
      if(openSwipeRowReset === closeRow) openSwipeRowReset = null;
    }
    function openRow(animate){
      isOpen = true;
      setOffset(-REVEAL, animate !== false);
      if(openSwipeRowReset && openSwipeRowReset !== closeRow) openSwipeRowReset();
      openSwipeRowReset = closeRow;
    }

    content.addEventListener("pointerdown", function(e){
      dragging = true; axis = null;
      var pt = e.touches ? e.touches[0] : e;
      startX = pt.clientX; startY = pt.clientY;
      baseX = isOpen ? -REVEAL : 0;
      wasOpenAtDown = isOpen;
    });
    content.addEventListener("pointermove", function(e){
      if(!dragging) return;
      var pt = e.touches ? e.touches[0] : e;
      var dx = pt.clientX - startX, dy = pt.clientY - startY;
      if(axis === null){
        var locked = SparkUtil.lockSwipeAxis(dx, dy, null);
        if(locked === "horizontal") axis = "x";
        else if(locked === "vertical") axis = "y";
      }
      if(axis === "y"){ return; }
      if(axis === "x"){
        e.preventDefault && e.preventDefault();
        var next = Math.max(-REVEAL, Math.min(0, baseX + dx));
        setOffset(next, false);
      }
    });
    content.addEventListener("pointerup", function(e){
      if(!dragging) return;
      dragging = false;
      var pt = e.changedTouches ? e.changedTouches[0] : e;
      var dx = pt.clientX - startX;
      if(axis === "x"){
        var finalX = Math.max(-REVEAL, Math.min(0, baseX + dx));
        if(finalX < -REVEAL / 2) openRow(); else closeRow();
        suppressClick = true;
      } else {
        if(wasOpenAtDown){ closeRow(); suppressClick = true; }
      }
      axis = null;
    });
    content.addEventListener("pointercancel", function(){ dragging = false; axis = null; });
    content.addEventListener("click", function(e){
      if(suppressClick){ e.stopPropagation(); e.preventDefault(); suppressClick = false; }
    }, true);

    delBtn.addEventListener("click", function(ev){
      ev.stopPropagation();
      if(typeof opts.confirm === "function" && opts.confirm() !== true){
        closeRow(true);
        return;
      }
      wrapper.style.transition = "opacity .2s ease, max-height .2s ease, margin .2s ease";
      wrapper.style.maxHeight = wrapper.offsetHeight + "px";
      requestAnimationFrame(function(){
        wrapper.style.overflow = "hidden";
        wrapper.style.maxHeight = "0px";
        wrapper.style.opacity = "0";
        wrapper.style.marginBottom = "0px";
      });
      setTimeout(onDelete, 200);
    });

    return wrapper;
  }

  function buildDoneScreen(){
    var wrap = el("div", "screen done-screen");
    wrap.appendChild(el("div", "section-title", "Dates You've Done (" + state.doneIds.length + ")"));
    if(state.doneIds.length === 0){
      wrap.appendChild(emptyNote(icon("check-circle"), "No completed dates yet", "Mark ideas as done from their detail screen after you try them."));
      return wrap;
    }
    SparkUtil.sortedDoneEntries(state.doneIds).forEach(function(entry){
      var idea = ideaForSaved(entry.id);
      if(!idea) return;
      wrap.appendChild(buildSavedCard(idea, { doneDate: fmtDate(entry.date), doneEntry: entry }));
    });
    return wrap;
  }

  function emptyNote(icon, title, sub){
    var e = el("div", "empty-state");
    e.innerHTML = '<span class="es-icon">' + icon + '</span><h3>' + title + '</h3><p>' + sub + '</p>';
    return e;
  }

  // Short distance for a photo stat tile.
  function distanceLabel(miles){
    if(miles == null) return null;
    if(miles < 0.1) return "Right nearby";
    if(miles < 10) return String(miles.toFixed(1)).replace(/\.0$/, "") + " mi";
    return Math.round(miles) + " mi";
  }

  /* ---------- Friends screen ---------- */
  function buildFriendsScreen(){
    var wrap = el("div", "screen friends-screen");
    wrap.appendChild(el("div", "section-title", "You"));
    var meCard = el("div", "friend-card");
    meCard.innerHTML =
      '<span class="friend-avatar" style="background:#0B6E4F">' + (state.profile.photo ? '' : icon("user")) + '</span>' +
      '<span><div class="friend-name">' + escapeHtml(state.profile.name || "You") + '</div>' +
      '<div class="friend-stats">' + state.doneIds.length + ' done · ' + totalSavedCount() + ' saved</div></span>';
    if(state.profile.photo){
      var av = $(".friend-avatar", meCard);
      av.style.background = "transparent";
      av.innerHTML = '<img src="' + state.profile.photo + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">';
    }
    wrap.appendChild(meCard);

    var addFriendsBtn = el("button", "btn-secondary btn-block", icon("plus") + " Add Friends");
    addFriendsBtn.type = "button";
    addFriendsBtn.addEventListener("click", function(){ openSubpage("addFriends"); });
    wrap.appendChild(addFriendsBtn);

    wrap.appendChild(el("div", "section-title", "Friends"));
    DEMO_FRIENDS.forEach(function(f, idx){
      var card = el("div", "friend-card");
      card.innerHTML =
        '<span class="friend-avatar" style="background:' + f.avatarColor + '">' + f.avatarEmoji + '</span>' +
        '<span><div class="friend-name">' + escapeHtml(f.name) + '</div>' +
        '<div class="friend-stats">' + f.doneIds.length + ' done · ' + f.savedIds.length + ' saved</div></span>';
      card.addEventListener("click", function(){
        ui.screen = "friendDetail"; ui.detailFriendId = idx;
        renderContent();
      });
      wrap.appendChild(card);
    });
    return wrap;
  }

  function buildFriendDetailScreen(friendIdx){
    var f = DEMO_FRIENDS[friendIdx];
    var wrap = el("div", "screen friend-detail-screen");
    if(!f){ wrap.innerHTML = '<p>Friend not found.</p>'; return wrap; }

    var header = el("div", "friend-detail-header");
    header.innerHTML =
      '<span class="friend-avatar" style="background:' + f.avatarColor + '">' + f.avatarEmoji + '</span>' +
      '<div><div class="profile-name-big">' + escapeHtml(f.name) + '</div>' +
      '<div class="profile-sub">' + f.doneIds.length + ' done · ' + f.savedIds.length + ' saved</div></div>';
    wrap.appendChild(header);

    var back = el("button", "back-link", "‹ Back to Friends");
    back.addEventListener("click", function(){ switchTab("friends"); });
    wrap.insertBefore(back, header);

    wrap.appendChild(el("div", "section-title", "Done"));
    if(f.doneIds.length === 0) wrap.appendChild(el("p", null, "No dates done yet."));
    f.doneIds.forEach(function(id){
      var idea = IDEAS_BY_ID[id];
      if(idea) wrap.appendChild(buildFriendIdeaRow(idea));
    });

    wrap.appendChild(el("div", "section-title", "Wants to Try"));
    if(f.savedIds.length === 0) wrap.appendChild(el("p", null, "Nothing saved yet."));
    f.savedIds.forEach(function(id){
      var idea = IDEAS_BY_ID[id];
      if(idea) wrap.appendChild(buildFriendIdeaRow(idea));
    });

    return wrap;
  }

  function buildFriendIdeaRow(idea){
    var row = el("div", "idea-row");
    row.innerHTML =
      '<span class="ir-icon">' + categoryIcon(idea.category) + '</span>' +
      '<span class="ir-text"><div class="ir-title">' + escapeHtml(idea.title) + '</div>' +
      '<div class="ir-sub">' + escapeHtml(idea.category) + '</div>' + statusBadgeHtml(idea) + '</span>' +
      '<span class="ir-chevron">›</span>';
    row.addEventListener("click", function(){
      ui.screen = "detail"; ui.detailIdeaId = idea.id;
      renderContent();
    });
    return row;
  }

  /* ---------- Profile overlay ----------
     The bottom Profile tab opens this same sheet. It does not switch the
     screen underneath, so Saved stays on the folder you had open. */
  function openProfile(){
    renderProfileHeader();
    ui.profileMenuOpen = null;
    openOverlay("#profile-overlay");
    setNavActive("profile");
  }
  function closeProfile(){
    closeOverlay("#profile-overlay");
    setNavActive(ui.tab);
  }
  $("#profile-close").addEventListener("click", closeProfile);

  function profileUsernameLine(){
    var name = state.identity && state.identity.username;
    if(name) return "@" + name;
    return "Add a username";
  }

  function submittedIdeasLabel(count){
    var n = typeof count === "number" ? count : (Array.isArray(state.submittedIdeas) ? state.submittedIdeas.length : 0);
    if(n === 1) return "1 idea submitted";
    return n + " ideas submitted";
  }

  function renderProfileHeader(){
    var av = $("#profile-avatar-big");
    av.innerHTML = state.profile.photo ? '<img src="' + state.profile.photo + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">' : icon("user");
    $("#profile-name-big").textContent = state.profile.name || "You";
    var usernameEl = $("#profile-username");
    if(usernameEl){
      var handle = state.identity && state.identity.username;
      usernameEl.textContent = profileUsernameLine();
      if(usernameEl.classList) usernameEl.classList.toggle("missing", !handle);
    }
    var ideasEl = $("#profile-ideas");
    if(ideasEl) ideasEl.textContent = submittedIdeasLabel(Array.isArray(state.submittedIdeas) ? state.submittedIdeas.length : 0);
    $("#profile-sub").textContent = state.profile.gender || "";
    $("#done-count-label").textContent = state.doneIds.length + " dates completed";
    var toggle = $("#auto-dark-toggle");
    if(toggle) toggle.checked = !!(state.settings && state.settings.autoDarkMode);
  }

  $all(".profile-menu-item").forEach(function(btn){
    btn.addEventListener("click", function(){
      openSubpage(btn.getAttribute("data-action"));
    });
  });

  /* ---------- Full-screen subpages (Tips, Done, Idea, Edit, Add Friends) ----------
     Opened as an X-closable, edge-swipe-back full-screen page over the app,
     rather than an inline accordion. */
  var SUBPAGE_TITLES = {
    done:"What You've Done",
    idea:"Got an Idea?",
    tips:"Tips of Dating",
    edit:"Edit Profile",
    addFriends:"Add Friends",
    credits:"Photo credits"
  };
  function openSubpage(action){
    ui.profileMenuOpen = action;
    $("#subpage-title").textContent = SUBPAGE_TITLES[action] || "";
    var body = $("#subpage-body");
    body.innerHTML = "";
    if(action === "done") body.appendChild(buildDoneSubpanel());
    else if(action === "idea") body.appendChild(buildIdeaSubmitSubpanel());
    else if(action === "tips") body.appendChild(buildTipsSubpanel());
    else if(action === "edit") body.appendChild(buildEditProfileSubpanel());
    else if(action === "addFriends") body.appendChild(buildAddFriendsSubpanel());
    else if(action === "credits") body.appendChild(buildCreditsSubpanel());
    body.classList.toggle("subpage-body-frame", action === "credits");
    body.scrollTop = 0;
    $("#subpage-overlay").classList.remove("hidden");
  }
  function closeSubpage(){
    $("#subpage-overlay").classList.add("hidden");
    ui.profileMenuOpen = null;
    var body = $("#subpage-body");
    if(body) body.classList.remove("subpage-body-frame");
  }

  function buildCreditsSubpanel(){
    var frame = el("iframe", "credits-frame");
    frame.title = "Photo credits";
    frame.src = "credits.html";
    return frame;
  }
  $("#subpage-close").addEventListener("click", closeSubpage);
  attachEdgeSwipeBack($("#subpage-overlay"), closeSubpage);

  function attachEdgeSwipeBack(container, onBack){
    var startX = 0, startY = 0, tracking = false;
    container.addEventListener("pointerdown", function(e){
      var pt = e.touches ? e.touches[0] : e;
      var rect = container.getBoundingClientRect();
      startX = pt.clientX; startY = pt.clientY;
      // only start tracking if the touch/click begins near the container's own left edge
      tracking = (startX - rect.left) <= 26;
    });
    container.addEventListener("pointermove", function(e){
      if(!tracking) return;
      var pt = e.touches ? e.touches[0] : e;
      if(Math.abs(pt.clientY - startY) > 60) tracking = false;
    });
    container.addEventListener("pointerup", function(e){
      if(!tracking) return;
      tracking = false;
      var pt = e.changedTouches ? e.changedTouches[0] : e;
      if(pt.clientX - startX > 70) onBack();
    });
    container.addEventListener("pointercancel", function(){ tracking = false; });
  }

  function buildDoneSubpanel(){
    var wrap = el("div", null);
    wrap.appendChild(el("div", "section-title", "What You've Done"));
    if(state.doneIds.length === 0){
      wrap.appendChild(el("p", null, "You haven't marked any dates as done yet. Once you try an idea, mark it done from its detail screen!"));
      return wrap;
    }
    SparkUtil.sortedDoneEntries(state.doneIds).forEach(function(entry){
      var idea = ideaForSaved(entry.id);
      if(!idea) return;
      wrap.appendChild(buildSavedCard(idea, {
        doneDate: fmtDate(entry.date),
        doneEntry: entry,
        onOpen: function(){
          closeSubpage();
          closeProfile();
          goToDetail(idea.id);
        }
      }));
    });
    return wrap;
  }

  function buildTipsSubpanel(){
    var wrap = el("div", null);
    wrap.appendChild(el("div", "section-title", "Tips of Dating"));
    DATING_TIPS.forEach(function(tip){
      var row = el("div", "tip-row");
      row.innerHTML = '<span class="t-icon">' + icon(tip.icon) + '</span><span class="t-text">' + escapeHtml(tip.text) + '</span>';
      wrap.appendChild(row);
    });
    return wrap;
  }

  function recordSubmittedIdea(fields){
    fields = fields || {};
    var title = String(fields.title == null ? "" : fields.title).trim();
    var description = String(fields.description == null ? "" : fields.description).trim();
    if(!title || !description) return null;
    if(!state.identity || typeof state.identity !== "object" || typeof state.identity.localId !== "string" || !state.identity.localId){
      state.identity = normalizeStoredIdentity(state.identity);
    }
    var row = {
      title: title,
      category: fields.category == null ? "" : String(fields.category),
      description: description,
      vibe: Array.isArray(fields.vibe) ? fields.vibe.slice() : [],
      submittedAt: todayISO(),
      submittedBy: {
        localId: state.identity.localId,
        username: state.identity.username || null
      }
    };
    if(!Array.isArray(state.submittedIdeas)) state.submittedIdeas = [];
    state.submittedIdeas.push(row);
    return row;
  }

  function filterDef(key){
    for(var i = 0; i < FILTER_DEFS.length; i++){
      if(FILTER_DEFS[i].key === key) return FILTER_DEFS[i];
    }
    return null;
  }

  function addFieldLabel(form, text){
    var label = el("label", null, escapeHtml(text));
    form.appendChild(label);
    return label;
  }

  function addTextField(form, field, placeholder, opts){
    opts = opts || {};
    addFieldLabel(form, opts.label);
    var input = el(opts.multiline ? "textarea" : "input");
    input.setAttribute("data-field", field);
    if(!opts.multiline) input.type = opts.type || "text";
    if(placeholder) input.placeholder = placeholder;
    if(opts.required) input.required = true;
    if(opts.maxLength) input.maxLength = opts.maxLength;
    if(opts.minLength) input.minLength = opts.minLength;
    if(opts.autocomplete) input.autocomplete = opts.autocomplete;
    form.appendChild(input);
    return input;
  }

  function addSelectField(form, field, label, options, optional){
    addFieldLabel(form, label);
    var select = el("select");
    select.setAttribute("data-field", field);
    var html = optional ? '<option value="">Optional</option>' : "";
    options.forEach(function(option){
      html += '<option value="' + escapeHtml(option) + '">' + escapeHtml(option) + '</option>';
    });
    select.innerHTML = html;
    form.appendChild(select);
    return select;
  }

  function addChipField(form, field, label){
    addFieldLabel(form, label);
    var wrap = el("div", "chip-select");
    wrap.setAttribute("data-field", field);
    var def = filterDef(field);
    (def ? def.options : []).forEach(function(option){
      var chip = el("button", "chip", escapeHtml(option));
      chip.type = "button";
      chip.setAttribute("data-value", option);
      chip.addEventListener("click", function(){ chip.classList.toggle("selected"); });
      wrap.appendChild(chip);
    });
    form.appendChild(wrap);
    return wrap;
  }

  function addCheckField(form, field, label){
    var row = el("label", "idea-check");
    var input = el("input");
    input.type = "checkbox";
    input.setAttribute("data-field", field);
    row.appendChild(input);
    row.appendChild(el("span", null, escapeHtml(label)));
    form.appendChild(row);
    return input;
  }

  function fieldNode(form, name){
    return form.querySelector('[data-field="' + name + '"]');
  }

  function readIdeaForm(form){
    function text(name){
      var node = fieldNode(form, name);
      return node ? node.value : "";
    }
    function chips(name){
      var node = fieldNode(form, name);
      if(!node) return [];
      return $all(".chip.selected", node).map(function(chip){ return chip.getAttribute("data-value"); });
    }
    function checked(name){
      var node = fieldNode(form, name);
      return !!(node && node.checked);
    }
    return {
      title: text("title"),
      description: text("description"),
      category: text("category"),
      setting: text("setting"),
      cost: text("cost"),
      duration: text("duration"),
      season: chips("season"),
      time: chips("time"),
      vibe: chips("vibe"),
      stage: chips("stage"),
      dateType: chips("dateType"),
      food: checked("food"),
      age21: checked("age21"),
      venueName: text("venueName"),
      city: text("city"),
      sourceUrl: text("sourceUrl"),
      email: text("email"),
      website: text("website"),
      ageConfirmed: ageGateSatisfied(state)
    };
  }

  function highlightFields(form, fields){
    $all(".field-invalid", form).forEach(function(node){ node.classList.remove("field-invalid"); });
    (fields || []).forEach(function(name){
      var node = fieldNode(form, name);
      if(node) node.classList.add("field-invalid");
    });
  }

  function buildIdeaSubmitSubpanel(){
    function rememberSubmittedIdea(input, status){
      var row = recordSubmittedIdea({
        title: input.title,
        description: input.description,
        category: input.category,
        vibe: Array.isArray(input.vibe) ? input.vibe : []
      });
      if(!row) return null;
      ["setting", "cost", "duration", "venueName", "city", "sourceUrl"].forEach(function(key){
        if(typeof input[key] === "string" && input[key].trim()) row[key] = input[key].trim();
      });
      ["season", "time", "stage", "dateType"].forEach(function(key){
        if(Array.isArray(input[key]) && input[key].length) row[key] = input[key].slice();
      });
      if(typeof input.food === "boolean") row.food = input.food;
      if(typeof input.age21 === "boolean") row.age21 = input.age21;
      row.status = status;
      delete row.email;
      delete row.lat;
      delete row.lng;
      delete row.location;
      delete row.deviceId;
      delete row.dob;
      saveState();
      renderProfileHeader();
      return row;
    }

    function postSubmission(body){
      return fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }).then(function(res){
        return res.json().catch(function(){ return {}; }).then(function(payload){
          return { status: res.status, payload: payload || {} };
        });
      }).catch(function(){
        return { status: 0, payload: {} };
      });
    }

    function finishSubmission(result, input, opts){
      opts = opts || {};
      var outcome = SparkSubmit.submissionOutcome(result.status);
      if(opts.form){
        if(outcome.highlight) highlightFields(opts.form, result.payload && result.payload.fields);
        else highlightFields(opts.form, []);
      }
      if(outcome.showGate) showAgeGate();
      if(outcome.save === "pending" && opts.existing){
        opts.existing.status = "pending";
        delete opts.existing.email;
        saveState();
        showToast(outcome.message);
        openSubpage("idea");
        return;
      }
      if(outcome.save && !opts.existing){
        rememberSubmittedIdea(input, outcome.save);
        showToast(outcome.message);
        openSubpage("idea");
        return;
      }
      if(outcome.highlight && opts.emailInput && result.payload && Array.isArray(result.payload.fields) && result.payload.fields.indexOf("email") !== -1){
        opts.emailInput.classList.add("field-invalid");
      }
      showToast(outcome.message);
      if(opts.button) opts.button.disabled = false;
    }

    var wrap = el("div", null);
    wrap.appendChild(el("div", "section-title", "Got an Idea?"));
    wrap.appendChild(el("p", null, "Share a new date idea and give a short description of how to do it — great ideas may get added to Jaderoo!"));

    if(SparkSubmit.shouldShowIdeaSendBanner(state)){
      var banner = el("div", "idea-banner");
      var bannerText = el("p", null, "You have ideas saved only on this phone. Nothing is sent unless you tap Send on an idea.");
      banner.appendChild(bannerText);
      var dismiss = el("button", "btn-text", "Dismiss");
      dismiss.type = "button";
      dismiss.addEventListener("click", function(){
        state.ideaSendBannerDismissed = true;
        saveState();
        openSubpage("idea");
      });
      banner.appendChild(dismiss);
      wrap.appendChild(banner);
    }

    var form = el("form", "idea-form");
    addTextField(form, "title", "e.g. Sunset kayak picnic", { label: "Title", required: true, minLength: 3, maxLength: 120 });
    addSelectField(form, "category", "Category", CATEGORIES, false);
    addTextField(form, "description", "Describe the date idea and how to pull it off...", {
      label: "How do you do it?", multiline: true, required: true, minLength: 10, maxLength: 2000
    });
    ["setting", "cost", "duration"].forEach(function(key){
      var def = filterDef(key);
      if(def) addSelectField(form, key, def.label, def.options, true);
    });
    ["time", "season", "vibe", "stage", "dateType"].forEach(function(key){
      var def = filterDef(key);
      if(def) addChipField(form, key, def.label);
    });
    addCheckField(form, "food", "Food is part of this date");
    addCheckField(form, "age21", "21+ (alcohol-centered)");
    addTextField(form, "venueName", "Optional", { label: "Venue name", maxLength: 120 });
    addTextField(form, "city", "Optional", { label: "City", maxLength: 80 });
    addTextField(form, "sourceUrl", "https://example.com/place", { label: "Source link", type: "url", maxLength: 2048 });
    addTextField(form, "email", "you@example.com", {
      label: "Email", type: "email", required: true, maxLength: 254, autocomplete: "email"
    });
    var emailHint = el("p", "idea-hint", "We use this only to credit your ideas once you verify it. Never shown publicly.");
    form.appendChild(emailHint);

    var trap = el("div", "hp-field");
    trap.setAttribute("aria-hidden", "true");
    var trapLabel = el("label", null, "Website");
    var trapInput = el("input");
    trapInput.type = "text";
    trapInput.tabIndex = -1;
    trapInput.autocomplete = "off";
    trapInput.setAttribute("data-field", "website");
    trap.appendChild(trapLabel);
    trap.appendChild(trapInput);
    form.appendChild(trap);

    var submitBtn = el("button", "btn-primary btn-block", "Submit Idea");
    submitBtn.type = "submit";
    form.appendChild(submitBtn);
    wrap.appendChild(form);

    form.addEventListener("submit", function(e){
      e.preventDefault();
      if(submitBtn.disabled) return;
      if(!ageGateSatisfied(state)){
        showAgeGate();
        return;
      }
      var input = readIdeaForm(form);
      input.ageConfirmed = true;
      var body = SparkSubmit.buildSubmissionBody(input);
      submitBtn.disabled = true;
      postSubmission(body).then(function(result){
        finishSubmission(result, input, { form: form, button: submitBtn });
      });
    });

    if(state.submittedIdeas.length){
      wrap.appendChild(el("div", "section-title", "Your Submitted Ideas"));
      state.submittedIdeas.slice().reverse().forEach(function(s){
        var block = el("div", "idea-saved");
        var row = el("div", "idea-row");
        row.style.cursor = "default";
        row.innerHTML =
          '<span class="ir-icon">' + icon("lightbulb") + '</span><span class="ir-text"><div class="ir-title">' + escapeHtml(s.title) + '</div>' +
          '<div class="ir-sub">' + escapeHtml(s.category || "") + " · " + escapeHtml(SparkSubmit.submissionStatusCopy(s.status)) + '</div></span>';
        block.appendChild(row);
        if(s.status !== "pending"){
          var sendRow = el("div", "idea-send-row");
          var emailInput = el("input", "idea-email");
          emailInput.type = "email";
          emailInput.maxLength = 254;
          emailInput.placeholder = "Email to credit this idea";
          emailInput.autocomplete = "email";
          emailInput.setAttribute("aria-label", "Email");
          var sendBtn = el("button", "btn-outline", "Send");
          sendBtn.type = "button";
          sendBtn.addEventListener("click", function(){
            if(sendBtn.disabled) return;
            if(!ageGateSatisfied(state)){
              showAgeGate();
              return;
            }
            var email = emailInput.value.trim();
            if(!email){
              emailInput.classList.add("field-invalid");
              showToast("Please check the highlighted fields.");
              return;
            }
            emailInput.classList.remove("field-invalid");
            var input = Object.assign({}, s, { email: email, ageConfirmed: true });
            var body = SparkSubmit.buildSubmissionBody(input);
            sendBtn.disabled = true;
            postSubmission(body).then(function(result){
              finishSubmission(result, input, { existing: s, button: sendBtn, emailInput: emailInput });
            });
          });
          sendRow.appendChild(emailInput);
          sendRow.appendChild(sendBtn);
          block.appendChild(sendRow);
        }
        wrap.appendChild(block);
      });
    }

    return wrap;
  }

  function applyProfileEdits(fields){
    fields = fields || {};
    if(!state.identity || typeof state.identity !== "object" || typeof state.identity.localId !== "string" || !state.identity.localId){
      state.identity = normalizeStoredIdentity(state.identity);
    }
    var rawUsername = fields.username == null ? "" : String(fields.username);
    if(rawUsername.trim()){
      var checked = validateUsername(rawUsername);
      if(!checked.ok) return { ok:false, error: checked.message, code: checked.error };
      state.identity.username = checked.username;
      if(!Object.prototype.hasOwnProperty.call(state.identity, "userId") || state.identity.userId == null) state.identity.userId = null;
    }
    var name = fields.name == null ? "" : String(fields.name).trim();
    if(name) state.profile.name = name;
    if(fields.gender) state.profile.gender = fields.gender;
    if(fields.photo) state.profile.photo = fields.photo;
    scrubProfileDob(state.profile);
    saveState();
    return { ok:true };
  }

  // Accounts UI is not in this build. A later sign-in leaves the Supabase
  // access token here (raw string, or a session JSON with access_token).
  // A sb-*-auth-token session blob is accepted too. Nothing else is read.
  function tokenFromStored(raw){
    if(typeof raw !== "string") return "";
    var text = raw.trim();
    if(!text) return "";
    if(text.charAt(0) === "{"){
      try {
        var parsed = JSON.parse(text);
        if(parsed && typeof parsed.access_token === "string" && parsed.access_token.trim()) return parsed.access_token.trim();
      } catch(err) {}
      return "";
    }
    return text;
  }
  function readAccessToken(){
    var direct = "";
    try { direct = tokenFromStored(localStorage.getItem("spark_access_token")); }
    catch(err) { direct = ""; }
    if(direct) return direct;
    try {
      if(!localStorage.length || typeof localStorage.key !== "function") return "";
      for(var i = 0; i < localStorage.length; i++){
        var key = localStorage.key(i);
        if(!key || key.indexOf("sb-") !== 0 || key.indexOf("-auth-token") === -1) continue;
        var found = tokenFromStored(localStorage.getItem(key));
        if(found) return found;
      }
    } catch(err) {}
    return "";
  }
  function serverUsernameActive(){
    return !!(state.identity && state.identity.userId && readAccessToken());
  }
  function usernameFetch(url, options){
    options = options || {};
    var headers = {};
    var token = readAccessToken();
    if(token) headers.Authorization = "Bearer " + token;
    if(options.body) headers["Content-Type"] = "application/json";
    return fetch(url, {
      method: options.method || "GET",
      headers: headers,
      body: options.body || undefined
    }).then(function(res){
      return res.json().then(function(body){
        return { status: res.status, body: body || {} };
      }, function(){
        return { status: res.status, body: {} };
      });
    });
  }
  function usernameFailureMessage(body, status){
    body = body || {};
    if(body.message) return body.message;
    if(body.error === "cooldown" && body.nextChangeAt) return "You can change your username again on " + String(body.nextChangeAt).slice(0, 10) + ".";
    if(body.error === "taken" || body.status === "taken") return "That username is taken.";
    if(body.error === "held" || body.status === "held") return "That username is held.";
    if(body.error === "reserved" || body.status === "reserved") return "That username is reserved.";
    if(body.error === "profanity") return "Choose a different username.";
    if(status === 401) return "Sign in again to save a username.";
    return "Couldn't save that username.";
  }
  function checkUsername(username){
    return usernameFetch("/api/username/check?u=" + encodeURIComponent(username)).then(function(res){
      var body = res.body || {};
      if(body.status) return body;
      return { status: "invalid", message: usernameFailureMessage(body, res.status) };
    });
  }
  function claimUsername(username){
    return usernameFetch("/api/username", {
      method: "POST",
      body: JSON.stringify({ username: username })
    }).then(function(res){
      var body = res.body || {};
      if(body.ok && body.username){
        state.identity.username = body.username;
        saveState();
        return { ok:true, username: body.username };
      }
      return {
        ok:false,
        error: usernameFailureMessage(body, res.status),
        code: body.error || body.status || "request_failed",
        nextChangeAt: body.nextChangeAt || null
      };
    });
  }
  function loadAccountUsername(){
    if(!serverUsernameActive()) return Promise.resolve(null);
    return usernameFetch("/api/me/username").then(function(res){
      var body = res.body || {};
      if(!body.ok) return null;
      if(typeof body.username === "string" && body.username){
        var checked = validateUsername(body.username);
        if(checked.ok){
          state.identity.username = checked.username;
          saveState();
        }
      }
      return body;
    });
  }
  var usernameCheckTimer = null;
  function scheduleUsernameCheck(value, show){
    if(!serverUsernameActive()) return;
    if(usernameCheckTimer) clearTimeout(usernameCheckTimer);
    usernameCheckTimer = setTimeout(function(){
      usernameCheckTimer = null;
      var checked = validateUsername(value);
      if(!checked.ok){
        if(String(value || "").trim()) show(checked.message);
        return;
      }
      if(SparkUtil.reservedUsername(checked.username)){
        show("That username is reserved.");
        return;
      }
      checkUsername(checked.username).then(function(look){
        if(!look || look.status === "available") return;
        show(look.message || usernameFailureMessage(look));
      }).catch(function(){});
    }, 300);
  }
  function submitProfileEdits(fields){
    fields = fields || {};
    if(!state.identity || typeof state.identity !== "object" || typeof state.identity.localId !== "string" || !state.identity.localId){
      state.identity = normalizeStoredIdentity(state.identity);
    }
    if(!serverUsernameActive()) return Promise.resolve(applyProfileEdits(fields));
    var rawUsername = fields.username == null ? "" : String(fields.username);
    if(!rawUsername.trim()) return Promise.resolve(applyProfileEdits(fields));
    var checked = validateUsername(rawUsername);
    if(!checked.ok) return Promise.resolve({ ok:false, error: checked.message, code: checked.error });
    if(checked.username === state.identity.username) return Promise.resolve(applyProfileEdits(fields));
    return checkUsername(checked.username).then(function(look){
      if(look && look.status && look.status !== "available"){
        return { ok:false, error: look.message || usernameFailureMessage(look), code: look.error || look.status };
      }
      return claimUsername(checked.username).then(function(result){
        if(!result.ok) return result;
        var saved = applyProfileEdits({
          name: fields.name,
          gender: fields.gender,
          photo: fields.photo,
          username: result.username
        });
        if(!saved.ok) return saved;
        return { ok:true, username: result.username };
      });
    }).catch(function(){
      return { ok:false, error:"Couldn't save that username.", code:"request_failed" };
    });
  }

  function buildEditProfileSubpanel(){
    var wrap = el("div", null);
    wrap.appendChild(el("div", "section-title", "Edit Profile"));
    var form = el("form", "idea-form");
    var usernameNow = (state.identity && state.identity.username) || "";
    var onAccount = serverUsernameActive();
    var usernameNote = onAccount
      ? "Saved to your account. You can change it once every 30 days."
      : "Saved on this device only for now. It is not reserved or unique yet.";
    form.innerHTML =
      '<label>Name</label><input type="text" id="ep-name" value="' + escapeHtml(state.profile.name) + '" required>' +
      '<label>Username</label><input type="text" id="ep-username" value="' + escapeHtml(usernameNow) + '" placeholder="letters, numbers, underscores" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="off" aria-describedby="ep-username-note ep-username-error">' +
      '<p class="field-hint" id="ep-username-note">' + escapeHtml(usernameNote) + '</p>' +
      '<p class="field-error" id="ep-username-error" hidden></p>' +
      '<label>Gender</label><select id="ep-gender">' +
        ["Woman","Man","Nonbinary","Prefer not to say"].map(function(g){
          return '<option value="' + g + '"' + (g === state.profile.gender ? " selected" : "") + '>' + g + '</option>';
        }).join("") +
      '</select>' +
      '<label>Photo</label><input type="file" id="ep-photo" accept="image/*">';
    var saveBtn = el("button", "btn-primary btn-block", "Save Changes");
    saveBtn.type = "submit";
    form.appendChild(saveBtn);
    wrap.appendChild(form);

    function showUsernameError(message){
      var errEl = $("#ep-username-error", form);
      var input = $("#ep-username", form);
      if(errEl){
        errEl.textContent = message || "";
        errEl.hidden = !message;
      }
      if(input){
        input.classList.toggle("invalid", !!message);
        input.setAttribute("aria-invalid", message ? "true" : "false");
      }
    }

    var newPhoto = null;
    $("#ep-photo", form).addEventListener("change", function(e){
      var file = e.target.files && e.target.files[0];
      if(!file) return;
      var reader = new FileReader();
      reader.onload = function(ev){ newPhoto = ev.target.result; };
      reader.readAsDataURL(file);
    });
    $("#ep-username", form).addEventListener("input", function(e){
      showUsernameError("");
      if(!serverUsernameActive()) return;
      scheduleUsernameCheck(e && e.target ? e.target.value : "", showUsernameError);
    });

    form.addEventListener("submit", function(e){
      e.preventDefault();
      var pending = submitProfileEdits({
        name: $("#ep-name", form).value,
        gender: $("#ep-gender", form).value,
        username: $("#ep-username", form).value,
        photo: newPhoto
      });
      Promise.resolve(pending).then(function(outcome){
        if(!outcome.ok){
          showUsernameError(outcome.error);
          var usernameInput = $("#ep-username", form);
          if(usernameInput && usernameInput.focus) usernameInput.focus();
          return;
        }
        showUsernameError("");
        renderProfileHeader();
        showToast("Profile updated!");
      });
    });

    if(onAccount){
      loadAccountUsername().then(function(body){
        if(!body) return;
        var input = $("#ep-username", form);
        if(input && body.username) input.value = body.username;
        var noteEl = $("#ep-username-note", form);
        if(noteEl && body.nextChangeAt){
          noteEl.textContent = "You can change your username again on " + String(body.nextChangeAt).slice(0, 10) + ".";
        }
        renderProfileHeader();
      }).catch(function(){});
    }

    return wrap;
  }

  /* ---------- Add Friends (QR code + mock contacts) ---------- */
  var MOCK_CONTACTS = [
    { name:"Alex Chen", phone:"(801) 555-0134" },
    { name:"Priya Patel", phone:"(385) 555-0192" },
    { name:"Jordan Lee", phone:"(801) 555-0177" },
    { name:"Maria Gomez", phone:"(435) 555-0163" },
    { name:"Sam Whitfield", phone:"(801) 555-0148" },
    { name:"Taylor Brooks", phone:"(385) 555-0121" }
  ];

  function getInviteLink(){
    var slug = (state.profile.name || "friend").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "friend";
    var code = Math.abs(hashStr(state.profile.name || "friend")).toString(36).slice(0, 6);
    return "https://spark-dates.app/invite/" + slug + "-" + code;
  }
  function inviteShareData(){
    return { title: "Join me on Jaderoo", text: "Add me on Jaderoo", url: getInviteLink() };
  }

  function buildAddFriendsSubpanel(){
    var wrap = el("div", null);
    wrap.appendChild(el("div", "section-title", "Your Invite QR Code"));
    wrap.appendChild(el("p", null, "Have a friend scan this with their phone's camera to add you on Jaderoo."));

    var link = getInviteLink();
    var qrWrap = el("div", "qr-wrap");
    try{
      var qr = qrcode(0, "M");
      qr.addData(link);
      qr.make();
      qrWrap.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2 });
    }catch(e){
      qrWrap.textContent = "QR code unavailable";
    }
    wrap.appendChild(qrWrap);

    wrap.appendChild(el("p", "qr-link-note", link));
    var copyBtn = el("button", "btn-secondary btn-block", icon("copy") + " Copy Invite Link");
    copyBtn.type = "button";
    copyBtn.addEventListener("click", function(){
      presentCopy(getInviteLink());
    });
    wrap.appendChild(copyBtn);
    var shareLinkBtn = el("button", "btn-secondary btn-block", icon("share") + " Share Invite Link");
    shareLinkBtn.type = "button";
    shareLinkBtn.addEventListener("click", function(){
      presentShare(inviteShareData());
    });
    wrap.appendChild(shareLinkBtn);

    wrap.appendChild(el("div", "section-title", "Add From Contacts"));
    wrap.appendChild(el("p", null, "Tap a contact to share your invite link."));
    MOCK_CONTACTS.forEach(function(c){
      var initials = c.name.split(" ").map(function(n){ return n[0]; }).join("");
      var row = el("div", "contact-row");
      row.innerHTML =
        '<span class="contact-avatar">' + escapeHtml(initials) + '</span>' +
        '<span class="contact-info"><div class="contact-name">' + escapeHtml(c.name) + '</div>' +
        '<div class="contact-phone">' + escapeHtml(c.phone) + '</div></span>' +
        '<button type="button" class="btn-outline contact-send-btn">Share</button>';
      $(".contact-send-btn", row).addEventListener("click", function(ev){
        ev.stopPropagation();
        presentShare(inviteShareData());
      });
      wrap.appendChild(row);
    });

    return wrap;
  }

  $("#reset-app-btn").addEventListener("click", function(){
    if(confirm("Reset all Jaderoo data on this device? This can't be undone.")){
      clearDonePhotos();
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    }
  });

  /* ---------- Dark mode ----------
     The system preference is the base. The existing night-mode toggle, when
     on, also uses dark from 9pm to 6am even if the device theme is light. */
  function isNightHours(){
    var hr = new Date().getHours();
    return hr >= 21 || hr < 6; // 9pm - 6am
  }
  function systemPrefersDark(){
    try{
      return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }catch(err){ return false; }
  }
  function applyTheme(){
    var clockDark = !!(state.settings && state.settings.autoDarkMode) && isNightHours();
    var dark = clockDark || systemPrefersDark();
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }
  var autoDarkToggle = $("#auto-dark-toggle");
  if(autoDarkToggle){
    autoDarkToggle.addEventListener("change", function(){
      state.settings.autoDarkMode = autoDarkToggle.checked;
      saveState();
      applyTheme();
    });
  }
  applyTheme();
  setInterval(applyTheme, 60000);
  if(window.matchMedia){
    var themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    var onThemeChange = function(){ applyTheme(); };
    if(themeQuery.addEventListener) themeQuery.addEventListener("change", onThemeChange);
    else if(themeQuery.addListener) themeQuery.addListener(onThemeChange);
  }

  function prefillOnboarding(){
    $("#ob-name").value = (state.profile && state.profile.name) || "";
    $("#ob-gender").value = (state.profile && state.profile.gender) || "Woman";
    if($("#ob-dob")) $("#ob-dob").value = "";
    if(state.profile && state.profile.photo){
      obPhotoData = state.profile.photo;
      $("#avatar-preview").innerHTML = '<img src="' + state.profile.photo + '" alt="">';
    }
  }

  /* ---------- Shared plan view (#plan=v1.<payload>) ----------
     The age check runs before decode. A pass stores spark_age_ok=1 and
     nothing else. The screen is read-only and is not the swipe deck. */
  var sharedPlanDecodeCount = 0;
  var sharedPlanSaved = null;

  function pageProtocol(){
    try{
      if(window.location && typeof window.location.protocol === "string" && window.location.protocol){
        return window.location.protocol;
      }
    }catch(e){}
    try{
      if(typeof location !== "undefined" && location && typeof location.protocol === "string") return location.protocol;
    }catch(e2){}
    return "";
  }
  function readAgeOkCookie(){
    var raw = "";
    try{ raw = document.cookie; }catch(e){ return false; }
    if(typeof raw !== "string" || !raw) return false;
    var parts = raw.split(";");
    for(var i = 0; i < parts.length; i++){
      var part = parts[i].replace(/^\s+/, "").replace(/\s+$/, "");
      if(part === "spark_age_ok=1") return true;
    }
    return false;
  }
  function ageOkCookieString(){
    var cookie = "spark_age_ok=1; Max-Age=31536000; Path=/; SameSite=Lax";
    if(pageProtocol() === "https:") cookie += "; Secure";
    return cookie;
  }
  function writeAgeOkCookie(){
    document.cookie = ageOkCookieString();
  }
  function sharedPlanGatePassed(){
    if(ageGateSatisfied(state)) return true;
    if(readAgeOkCookie()) return true;
    return false;
  }
  function planShareFragment(){
    var hash = "";
    try{
      if(window.location && typeof window.location.hash === "string") hash = window.location.hash;
    }catch(e){}
    if(!hash){
      try{
        if(typeof location !== "undefined" && location && typeof location.hash === "string") hash = location.hash;
      }catch(e2){}
    }
    if(hash.indexOf("#plan=") !== 0) return null;
    return hash.slice(6);
  }
  function clearPlanFragment(){
    var loc = null;
    try{ loc = window.location; }catch(e){}
    if(!loc) return;
    var hash = typeof loc.hash === "string" ? loc.hash : "";
    if(hash.indexOf("#plan=") !== 0) return;
    var path = (typeof loc.pathname === "string" && loc.pathname) ? loc.pathname : "/";
    var search = typeof loc.search === "string" ? loc.search : "";
    try{
      if(window.history && typeof window.history.replaceState === "function"){
        window.history.replaceState(null, "", path + search);
      }
    }catch(e){}
    try{
      if(typeof loc.hash === "string" && loc.hash.indexOf("#plan=") === 0) loc.hash = "";
    }catch(e2){}
  }
  function sharedPlanBrand(){
    var mark = el("div", "brand-mark");
    mark.innerHTML =
      '<img class="splash-icon" src="icons/icon.svg" alt="" width="132" height="132">' +
      '<h1 class="wordmark">JADEROO</h1>' +
      '<p class="tagline">Things to do, near you</p>';
    return mark;
  }
  function mountSharedPlan(root){
    root.id = "shared-plan-view";
    var phone = document.querySelector(".phone");
    if(!phone) phone = document.body;
    var previous = document.getElementById("shared-plan-view");
    if(previous && previous !== root && previous.remove) previous.remove();
    if(phone && phone.appendChild) phone.appendChild(root);
    ["view-onboarding", "view-tutorial", "view-app"].forEach(function(id){
      var node = document.getElementById(id);
      if(node && node.classList) node.classList.add("hidden");
    });
    return root;
  }
  function removeSharedPlanView(){
    var node = document.getElementById("shared-plan-view");
    if(node && node.remove) node.remove();
  }
  function sharedPlanOpenButton(){
    var btn = el("button", "btn-secondary btn-block", "Open Jaderoo");
    btn.type = "button";
    btn.addEventListener("click", function(){ leaveSharedPlan(); });
    return btn;
  }
  function showSharedPlanGate(){
    var root = el("div", "view shared-plan-view");
    root.setAttribute("data-shared-plan", "gate");
    var scroll = el("div", "onboarding-scroll");
    scroll.appendChild(sharedPlanBrand());
    var form = el("form", "onboarding-form");
    var label = el("label", "field-label", "Age");
    label.setAttribute("for", "shared-plan-age");
    form.appendChild(label);
    var input = document.createElement("input");
    input.id = "shared-plan-age";
    input.className = "field-input";
    input.type = "number";
    input.min = "1";
    input.max = "120";
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("autocomplete", "off");
    input.required = true;
    input.setAttribute("aria-label", "Age");
    form.appendChild(input);
    form.appendChild(el("p", "field-hint", "You must be 18 or older. We use this only to check your age and do not save it."));
    var btn = el("button", "btn-primary btn-block", "Continue");
    btn.type = "submit";
    form.appendChild(btn);
    form.addEventListener("submit", function(e){
      if(e && e.preventDefault) e.preventDefault();
      submitSharedPlanAge(input.value);
    });
    scroll.appendChild(form);
    root.appendChild(scroll);
    return mountSharedPlan(root);
  }
  function showSharedPlanBlocked(){
    var root = el("div", "view shared-plan-view");
    root.setAttribute("data-shared-plan", "blocked");
    var scroll = el("div", "onboarding-scroll");
    scroll.appendChild(sharedPlanBrand());
    var card = el("div", "onboarding-form");
    var heading = el("h2", "shared-plan-message", "Jaderoo is for adults 18+");
    heading.id = "shared-plan-message";
    card.appendChild(heading);
    card.appendChild(el("p", "field-hint", "This plan stays hidden."));
    card.appendChild(sharedPlanOpenButton());
    scroll.appendChild(card);
    root.appendChild(scroll);
    return mountSharedPlan(root);
  }
  function showSharedPlanBroken(){
    var root = el("div", "view shared-plan-view");
    root.setAttribute("data-shared-plan", "broken");
    var scroll = el("div", "onboarding-scroll");
    scroll.appendChild(sharedPlanBrand());
    var card = el("div", "onboarding-form");
    var heading = el("h2", "shared-plan-message", "This link looks broken");
    heading.id = "shared-plan-message";
    card.appendChild(heading);
    card.appendChild(el("p", "field-hint", "Ask the person who sent it for a new link."));
    card.appendChild(sharedPlanOpenButton());
    scroll.appendChild(card);
    root.appendChild(scroll);
    return mountSharedPlan(root);
  }
  function sharedPlanCardIdea(idea){
    var copy = {};
    var drop = {
      lat:1, lng:1, latitude:1, longitude:1, address:1, location:1,
      coordinates:1, mapsUrl:1, distanceMiles:1, city:1, placeName:1
    };
    Object.keys(idea).forEach(function(key){
      if(drop[key]) return;
      copy[key] = idea[key];
    });
    return copy;
  }
  function buildSharedPlanCard(idea){
    var filters = state.filters;
    var prev = filters ? filters.localOnly : false;
    if(filters) filters.localOnly = false;
    var card;
    try{
      card = buildSwipeCard(sharedPlanCardIdea(idea), false, 0);
    }finally{
      if(filters) filters.localOnly = prev;
    }
    card.className = (card.className ? card.className + " " : "") + "shared-plan-card";
    if(typeof card.innerHTML === "string"){
      card.innerHTML = card.innerHTML
        .replace(/<span class="stamp yes">SAVE<\/span><span class="stamp no">PASS<\/span>/g, "")
        .replace(/<div class="card-hint">[\s\S]*?<\/div>/g, "");
    }
    return card;
  }
  function sharedPlanIdeas(ideaIds){
    var ideas = [];
    var skipped = 0;
    var ids = Array.isArray(ideaIds) ? ideaIds : [];
    for(var i = 0; i < ids.length; i++){
      var idea = IDEAS_BY_ID[ids[i]];
      if(!idea){ skipped++; continue; }
      ideas.push(idea);
    }
    return { ideas: ideas, skipped: skipped };
  }
  function sharedPlanSkipNote(count){
    count = count | 0;
    if(count <= 0) return "";
    if(count === 1) return "1 idea couldn't be shown";
    return count + " ideas couldn't be shown";
  }
  function sharedPlanSaveKey(plan){
    var ids = plan && Array.isArray(plan.ideaIds) ? plan.ideaIds : [];
    var name = plan && typeof plan.name === "string" ? plan.name : "";
    var date = plan && typeof plan.date === "string" ? plan.date : "";
    return name + "\0" + date + "\0" + ids.join(",");
  }
  function buildSharedPlanView(plan){
    plan = plan || { name:"", date:"", ideaIds:[] };
    var root = el("div", "view shared-plan-view");
    root.setAttribute("data-shared-plan", "view");
    var scroll = el("div", "shared-plan-scroll");
    var title = typeof plan.name === "string" ? plan.name.trim() : "";
    if(!title) title = "Shared plan";
    var heading = el("h1", "display-title shared-plan-name", escapeHtml(title));
    heading.id = "shared-plan-name";
    scroll.appendChild(heading);
    var dateLabel = plan.date ? fmtDate(plan.date) : "";
    if(dateLabel){
      var dateEl = el("p", "shared-plan-date", escapeHtml(dateLabel));
      dateEl.id = "shared-plan-date";
      scroll.appendChild(dateEl);
    }
    var packed = sharedPlanIdeas(plan.ideaIds);
    var cards = el("div", "shared-plan-cards");
    packed.ideas.forEach(function(idea){
      cards.appendChild(buildSharedPlanCard(idea));
    });
    scroll.appendChild(cards);
    var note = sharedPlanSkipNote(packed.skipped);
    if(note) scroll.appendChild(el("p", "field-hint shared-plan-note", note));
    var actions = el("div", "shared-plan-actions");
    var saveBtn = el("button", "btn-primary btn-block", "Save to my plans");
    saveBtn.type = "button";
    saveBtn.id = "shared-plan-save";
    saveBtn.addEventListener("click", function(){
      var result = saveSharedPlan(plan);
      saveBtn.textContent = result.message;
    });
    actions.appendChild(saveBtn);
    actions.appendChild(sharedPlanOpenButton());
    scroll.appendChild(actions);
    root.appendChild(scroll);
    return root;
  }
  function showSharedPlanView(plan){
    return mountSharedPlan(buildSharedPlanView(plan));
  }
  function saveSharedPlan(plan){
    if(!plan || typeof plan !== "object" || Array.isArray(plan)){
      return { created:false, id:null, message:"Already in your plans" };
    }
    var key = sharedPlanSaveKey(plan);
    if(sharedPlanSaved && sharedPlanSaved.key === key){
      var again = { created:false, id:sharedPlanSaved.id, message:"Already in your plans" };
      showToast(again.message);
      return again;
    }
    var packed = sharedPlanIdeas(plan.ideaIds);
    var ids = [];
    packed.ideas.forEach(function(idea){ ids.push(idea.id); });
    var name = typeof plan.name === "string" ? plan.name.trim() : "";
    if(!name) name = "Shared plan";
    var date = typeof plan.date === "string" ? plan.date : "";
    var row = {
      id: genId("plan"),
      name: name,
      date: date,
      createdAt: todayISO(),
      ideaIds: ids,
      friendPicks: []
    };
    state.datePlans.push(row);
    sharedPlanSaved = { key: key, id: row.id };
    saveState();
    var created = { created:true, id: row.id, message:"Saved to your plans" };
    showToast(created.message);
    return created;
  }
  function showSharedPlanDecoded(payload){
    sharedPlanDecodeCount += 1;
    var text = payload;
    try{ text = decodeURIComponent(payload); }catch(e){ text = payload; }
    var decoded = decodePlanShare(text);
    if(!decoded) return showSharedPlanBroken();
    return showSharedPlanView(decoded);
  }
  function submitSharedPlanAge(raw){
    var age = parseProfileAge(raw);
    if(age == null || age < MINIMUM_AGE){
      if(age != null && age < MINIMUM_AGE) return showSharedPlanBlocked();
      return showSharedPlanGate();
    }
    writeAgeOkCookie();
    var payload = planShareFragment();
    if(payload == null) return null;
    return showSharedPlanDecoded(payload);
  }
  function routeSharedPlan(){
    var payload = planShareFragment();
    if(payload == null) return null;
    if(!sharedPlanGatePassed()) return showSharedPlanGate();
    return showSharedPlanDecoded(payload);
  }
  function leaveSharedPlan(){
    clearPlanFragment();
    removeSharedPlanView();
    if(ageGateSatisfied(state)){
      state.onboarded = true;
      enterApp();
    } else {
      state.onboarded = false;
      showAgeGate();
    }
  }
  function onSharedPlanHash(){
    if(planShareFragment() == null) return;
    routeSharedPlan();
  }

  /* ---------- Boot ---------- */
  function boot(){
    prefillOnboarding();
    window.addEventListener("hashchange", onSharedPlanHash);
    if(routeSharedPlan()) return;
    if(ageGateSatisfied(state)){
      state.onboarded = true;
      enterApp();
    } else {
      state.onboarded = false;
      showAgeGate();
    }
  }

  rehydrateRemoteIdeas();
  hydrateRemoteCache();

  boot();
})();
