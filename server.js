/* ===================== Spark server ===================== *
* Small Express server that:
* 1. Serves the Spark app from public/ (index.html, app.js, style.css, data.js, util.js)
* 2. Provides an API route the frontend calls (automatically, once it has
* your location) to find a handful of REAL nearby places via Google
* Places, then has Claude turn them into Spark-style idea cards that
* get shuffled directly into the swipeable deck alongside the
* built-in ideas.
*
* Nothing here runs without you adding your own API keys to a `.env`
* file (copy `.env.example` to `.env` first) — see SETUP.md for the
* step-by-step. Until you add keys, the app still works great, it just
* skips the "real nearby places" part and uses the built-in idea list only.
* ============================================================ */

require("dotenv").config();
const express = require("express");
const path = require("path");
const db = require("./db");
const { checkAge } = require("./public/util");
const { createActivitiesRouter } = require("./routes/activities");

const app = express();
const publicDir = path.join(__dirname, "public");
app.use(express.json());
app.use(express.static(publicDir, { dotfiles: "ignore", index: "index.html" }));

const PORT = process.env.PORT || 3000;

function googlePlacesKey(){ return process.env.GOOGLE_PLACES_API_KEY || ""; }
function anthropicKey(){ return process.env.ANTHROPIC_API_KEY || ""; }

/* About 1 km. Applied to the user's location before it leaves the server. */
function roundUserCoord(value){
var n = typeof value === "number" ? value : Number(value);
if(!Number.isFinite(n)) return null;
return Math.round(n * 100) / 100;
}

/* ---------- Status: lets the frontend know what's configured ---------- */
app.get("/api/status", (req, res) => {
res.json({
placesConfigured: !!googlePlacesKey(),
aiConfigured: !!anthropicKey(),
dbConfigured: db.isConfigured()
});
});

/* ---------- Helpers ---------- */

// Turns the "Date Length" filter selection into a search radius (meters).
function radiusMetersForDuration(durations) {
durations = durations || [];
if (durations.indexOf("Overnight") !== -1) return 80000; // ~50 mi
if (durations.indexOf("Full day") !== -1) return 60000; // ~37 mi
if (durations.indexOf("Half-day (2-5 hrs)") !== -1) return 40000; // ~25 mi
if (durations.indexOf("Short (1-2 hrs)") !== -1) return 16000; // ~10 mi
if (durations.indexOf("Quick (under 1 hr)") !== -1) return 8000; // ~5 mi
return 24000; // ~15 mi default when no length is specified
}

async function searchNearbyPlaces(lat, lng, query, radius) {
var key = googlePlacesKey();
if (!key) return [];
var url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
+ "?query=" + encodeURIComponent(query)
+ "&location=" + lat + "," + lng
+ "&radius=" + radius
+ "&key=" + key;
var resp;
try {
resp = await fetch(url);
} catch (e) {
var net = new Error("places_unavailable");
net.code = "PLACES_UNREACHABLE";
throw net;
}
var data;
try {
data = await resp.json();
} catch (e) {
var bad = new Error("places_unavailable");
bad.code = "PLACES_BAD_RESPONSE";
throw bad;
}
if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
var err = new Error("places_unavailable");
err.code = "PLACES_ERROR";
throw err;
}
var results = data.results || [];
return results.slice(0, 6).map(function (r) {
return {
placeId: r.place_id || "",
name: r.name,
address: r.formatted_address || "",
rating: r.rating || null,
userRatingsTotal: r.user_ratings_total || 0,
openNow: r.opening_hours ? !!r.opening_hours.open_now : null,
mapsUrl: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(r.name + " " + (r.formatted_address || ""))
};
});
}

/* ---------- Auto-generated "Near You" idea cards (mixed into the deck) ----------
* This route generates a small batch of BRAND NEW idea cards straight from
* real nearby places, meant to be shuffled directly into the swipeable deck
* alongside the built-in ideas. Called automatically once location is
* available — no button, no per-idea lookup. */

// A varied pool of venue categories to search across, so results aren't just
// restaurants every time. A random subset is queried per request.
var NEARBY_CATEGORY_POOL = [
"restaurants", "coffee shops", "hiking trails", "parks", "museums",
"movie theaters", "bars", "art galleries", "bowling alleys",
"mini golf courses", "wineries", "ice cream shops", "botanical gardens",
"escape rooms", "live music venues", "breweries", "arcades", "aquariums",
"comedy clubs", "farmers markets"
];

function shuffleArray(arr) {
var a = arr.slice();
for (var i = a.length - 1; i > 0; i--) {
var j = Math.floor(Math.random() * (i + 1));
var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
}
return a;
}

function dedupePlaces(places) {
var seen = {};
var out = [];
places.forEach(function (p) {
var key = (p.name || "").toLowerCase().trim() + "|" + (p.address || "").toLowerCase().trim();
if (seen[key]) return;
seen[key] = true;
out.push(p);
});
return out;
}

// Sends the whole candidate list to Claude ONCE and asks it to pick the best
// subset and turn each into a Spark-style idea card. Returns an array of
// { placeIndex, title, description, materials, icon, cost, setting, vibe, food, durationGuess }.
// The prompt names venues. It does not include the user's coordinates.
function normalizeNearbyMaterials(raw) {
if (!Array.isArray(raw)) return [];
return raw.filter(function (s) { return typeof s === "string" && s.trim(); })
.map(function (s) { return s.trim().slice(0, 60); })
.slice(0, 6);
}

function mapNearbyCard(c, place) {
if (!place) return null;
return {
title: c.title || place.name,
description: c.description || "",
icon: c.icon || "📍",
cost: c.cost || null,
setting: c.setting === "Outdoor" ? "Outdoor" : "Indoor",
vibe: Array.isArray(c.vibe) ? c.vibe : [],
food: !!c.food,
durationGuess: c.durationGuess || null,
materials: normalizeNearbyMaterials(c && c.materials),
placeId: place.placeId || "",
placeName: place.name,
address: place.address,
mapsUrl: place.mapsUrl,
rating: place.rating
};
}

async function generateNearbyIdeaCards(candidates, count) {
var Anthropic = require("@anthropic-ai/sdk");
var client = new Anthropic({ apiKey: anthropicKey() });

var placesList = candidates.map(function (p, i) {
return (i + 1) + ". " + p.name + (p.address ? " — " + p.address : "") + (p.rating ? " (rating " + p.rating + ")" : "");
}).join("\n");

var prompt = "You are turning REAL nearby places into short, fun date-idea cards for a dating-inspiration "
+ "app called Spark.\n\n"
+ "Here are real nearby places found via Google Places search:\n" + placesList + "\n\n"
+ "Pick the best " + count + " of these (skip anything low-quality, redundant, or not really date-worthy — "
+ "it's fine to return fewer than " + count + " if there aren't enough good ones). For EACH place you pick, "
+ "write a short, catchy Spark-style date idea card.\n\n"
+ "Respond ONLY with strict JSON, no markdown fencing, as an array in exactly this shape:\n"
+ "[{\"placeIndex\": 1, \"title\": \"short catchy activity title mentioning the place (<=8 words)\", "
+ "\"description\": \"2-3 friendly sentences on how to do this date at this venue\", \"icon\": \"a single relevant emoji\", "
+ "\"cost\": \"one of Free, $1-$10, $20-$30, $100 and under\", \"setting\": \"Indoor or Outdoor\", "
+ "\"vibe\": [\"1-3 of: Chill, Romantic, Active, Adventurous, Creative, Silly, Cozy, Spontaneous\"], "
+ "\"food\": true or false, \"durationGuess\": \"one of Quick (under 1 hr), Short (1-2 hrs), Half-day (2-5 hrs), Full day, Overnight\", "
+ "\"materials\": [\"0-4 short items to bring, [] if nothing\"]}]"
+ "\n\nNever invent prices, hours, or phone numbers.";

var msg = await client.messages.create({
model: "claude-sonnet-5",
max_tokens: 2500,
messages: [{ role: "user", content: prompt }]
});
var text = (msg.content && msg.content[0] && msg.content[0].text) ? msg.content[0].text : "[]";
try {
return JSON.parse(text);
} catch (e) {
var m = text.match(/\[[\s\S]*\]/);
return m ? JSON.parse(m[0]) : [];
}
}

app.post("/api/nearby-ideas", async (req, res) => {
try {
var body = req.body || {};
var lat = roundUserCoord(body.lat);
var lng = roundUserCoord(body.lng);
var filters = body.filters || {};
var count = Math.max(1, Math.min(15, body.count || 12));
if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
return res.status(400).json({ error: "missing lat/lng" });
}
if (!googlePlacesKey() || !anthropicKey()) {
return res.json({ ideas: [], reason: "not_configured" });
}

var radius = radiusMetersForDuration(filters.duration);
var categories = shuffleArray(NEARBY_CATEGORY_POOL).slice(0, 6);

var resultsByCategory = await Promise.all(categories.map(function (cat) {
return searchNearbyPlaces(lat, lng, cat, radius).catch(function () { return []; });
}));
var candidates = dedupePlaces([].concat.apply([], resultsByCategory));
if (!candidates.length) return res.json({ ideas: [], reason: "no_places_found" });

candidates = shuffleArray(candidates).slice(0, 20);
var cards = await generateNearbyIdeaCards(candidates, count);

var ideas = (cards || []).map(function (c) {
return mapNearbyCard(c, candidates[(c.placeIndex || 0) - 1]);
}).filter(Boolean);

res.json({ ideas: ideas });
} catch (err) {
console.error("[nearby-ideas] request_failed");
res.json({ ideas: [], reason: "error" });
}
});

/* Date of birth is checked and discarded. Nothing here is logged or stored. */
app.post("/api/age-check", (req, res) => {
try {
var raw = req.body && typeof req.body.dob === "string" ? req.body.dob : "";
var result = checkAge(raw, new Date());
if (result.error) return res.status(400).json({ ok: false, error: "invalid_date" });
if (!result.ok) return res.json({ ok: false, blocked: true });
return res.json({ ok: true });
} catch (e) {
console.error("[age-check] request_failed");
return res.status(400).json({ ok: false, error: "invalid_date" });
}
});

app.use("/api/activities", createActivitiesRouter());

// Extensionless GETs are the single-page app. Anything else that static did
// not serve — source files, dotfiles, unknown assets — is a real 404.
// Unknown /api routes stay JSON so a missing path is not an HTML page.
function isSpaPath(req) {
if (req.method !== "GET" && req.method !== "HEAD") return false;
const urlPath = req.path || "/";
if (urlPath === "/api" || urlPath.startsWith("/api/")) return false;
const base = path.basename(urlPath);
if (base.startsWith(".")) return false;
return path.extname(urlPath) === "";
}

app.use((req, res) => {
if (req.path === "/api" || req.path.startsWith("/api/")) {
return res.status(404).json({ error: "not_found" });
}
if (isSpaPath(req)) {
return res.sendFile(path.join(publicDir, "index.html"));
}
res.status(404).type("txt").send("Not found");
});

module.exports = app;
app.normalizeNearbyMaterials = normalizeNearbyMaterials;
app.mapNearbyCard = mapNearbyCard;

if (require.main === module) {
app.listen(PORT, () => {
console.log("Spark server running at http://localhost:" + PORT);
if (!googlePlacesKey() || !anthropicKey()) {
console.log("(Real nearby-place matching is OFF — add GOOGLE_PLACES_API_KEY and ANTHROPIC_API_KEY to .env to enable it. See SETUP.md.)");
}
if (!db.isConfigured()) {
console.log("(Activities database is OFF — the built-in catalog still works. Add DATABASE_URL to enable GET /api/activities. See SETUP.md.)");
}
});
}
