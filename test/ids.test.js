const { loadApp } = require("./harness.js");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
function section(title, fn) {
  console.log("\n" + title);
  try { fn(); }
  catch (e) { check("section ran without throwing", false, String(e.message).slice(0, 110)); }
}
const KEY = "spark_state_v1";

const PLACE_A = { placeId:"ChIJ_AAA", title:"Sunset Ridge Trail Walk", description:"A pretty walk.",
  placeName:"Sunset Ridge Trail", address:"1 Ridge Rd, Provo, UT", cost:"Free", setting:"Outdoor",
  vibe:["Chill"], food:false, durationGuess:"Short (1-2 hrs)", rating:4.6 };
const PLACE_B = { placeId:"ChIJ_BBB", title:"Late Night Ramen Run", description:"Slurp away.",
  placeName:"Kaiju Ramen", address:"99 Center St, Provo, UT", cost:"$20-$30", setting:"Indoor",
  vibe:["Cozy"], food:true, durationGuess:"Short (1-2 hrs)", rating:4.4 };

const store = {};   // shared across the reload tests

section("Stable ids", () => {
  const a = loadApp({}), b = loadApp({});
  const id1 = a.hydrateRealIdea(PLACE_A, a.state.filters).id;
  // b sees a different place FIRST, so a counter-based id would drift. The id
  // has to come from the place itself, not from arrival order.
  b.hydrateRealIdea(PLACE_B, b.state.filters);
  const id2 = b.hydrateRealIdea(PLACE_A, b.state.filters).id;
  check("same place -> same id regardless of arrival order", id1 === id2, id1 + " vs " + id2);
  check("id is numeric (cover art seeds off it arithmetically)",
        typeof id1 === "number" && Number.isFinite(id1 * 2654435761));
  check("id lands in the reserved real range", a.isRealId(id1), String(id1));
  check("different places -> different ids",
        id1 !== a.hydrateRealIdea(PLACE_B, a.state.filters).id, "both " + id1);
});

section("Saved real idea survives reload", () => {
  const s1 = loadApp(store);
  const idea = s1.hydrateRealIdea(PLACE_A, s1.state.filters);
  s1.IDEAS_BY_ID[idea.id] = idea;
  s1.addIdeaToBucket(idea.id, { type:"someday" });
  s1.saveState();
  check("snapshot written to state", !!(s1.state.realIdeas || {})[idea.id]);

  const s2 = loadApp(store);                       // <- fresh page load
  const savedId = s2.state.somedayIds[0];
  const found = s2.IDEAS_BY_ID[savedId];
  check("saved id still resolves after reload", !!found, "id " + savedId + " resolved to nothing");
  check("it resolves to the SAME place", !!found && found.placeName === "Sunset Ridge Trail",
        found ? "got " + found.placeName : "nothing");
  check("folder count matches rows that will render",
        s2.totalSavedCount() === s2.state.somedayIds.filter(id => !!s2.IDEAS_BY_ID[id]).length,
        "count " + s2.totalSavedCount());
  check("restored idea is NOT re-dealt into the deck", s2.REAL_IDEAS_RUNTIME.length === 0,
        "runtime pool had " + s2.REAL_IDEAS_RUNTIME.length);
});

section("No id recycling", () => {
  const s3 = loadApp(store);
  // Next session's batch leads with a place we've never seen. Under the old
  // counter this got 9000001 — exactly the id already sitting in somedayIds.
  const fresh = s3.hydrateRealIdea(PLACE_B, s3.state.filters);
  s3.IDEAS_BY_ID[fresh.id] = fresh;
  const savedId = s3.state.somedayIds[0];
  check("new place did not take the saved id", fresh.id !== savedId, "both " + savedId);
  const shown = s3.IDEAS_BY_ID[savedId];
  check("saved slot still shows the original place",
        !!shown && shown.placeName === "Sunset Ridge Trail",
        shown ? "shows " + shown.placeName : "shows nothing");
});

section("Legacy orphan cleanup", () => {
  const legacy = { [KEY]: JSON.stringify({
    onboarded:true, somedayIds:[9000001, 9000002, 42], doneIds:[{id:9000003,date:"2026-01-01"}],
    datePlans:[{ id:"p1", name:"Friday", date:"", createdAt:0, ideaIds:[9000001, 7], friendPicks:[
      { id:"fp1", friendName:"Emma R.", avatarEmoji:"E", avatarColor:"#FF9F6B", ideaId:9000002 }] }],
  })};
  const s4 = loadApp(legacy);
  check("orphaned real ids dropped from Favorites",
        s4.state.somedayIds.join(",") === "42", s4.state.somedayIds.join(","));
  check("built-in ids untouched", s4.state.datePlans[0].ideaIds.join(",") === "7",
        s4.state.datePlans[0].ideaIds.join(","));
  check("orphaned done entries dropped", s4.state.doneIds.length === 0,
        s4.state.doneIds.length + " left");
  check("orphaned friend picks dropped", s4.state.datePlans[0].friendPicks.length === 0);
  check("counts now match what renders", s4.totalSavedCount() === 2, String(s4.totalSavedCount()));
});

section("Snapshot hygiene", () => {
  const s5 = loadApp({});
  const keep = s5.hydrateRealIdea(PLACE_A, s5.state.filters);
  const swiped = s5.hydrateRealIdea(PLACE_B, s5.state.filters);
  s5.IDEAS_BY_ID[keep.id] = keep; s5.IDEAS_BY_ID[swiped.id] = swiped;
  s5.addIdeaToBucket(keep.id, { type:"someday" });
  s5.state.seenIds.push(swiped.id);                // swiped past, not kept
  s5.saveState();
  check("kept idea snapshotted", !!(s5.state.realIdeas || {})[keep.id]);
  check("swiped-past idea NOT snapshotted", !(s5.state.realIdeas || {})[swiped.id]);

  s5.removeIdeaFromBucket(keep.id, { type:"someday" });
  s5.saveState();
  check("snapshot pruned on unsave", Object.keys(s5.state.realIdeas || {}).length === 0,
        JSON.stringify(Object.keys(s5.state.realIdeas || {})));
});

section("place_id fallback", () => {
  const s6 = loadApp({});
  const noPid = Object.assign({}, PLACE_A, { placeId: undefined });
  const id1 = s6.hydrateRealIdea(noPid, s6.state.filters).id;
  const id2 = loadApp({}).hydrateRealIdea(
    Object.assign({}, noPid, { title:"Different blurb, same venue" }), s6.state.filters).id;
  check("falls back to name+address, still stable", id1 === id2, id1 + " vs " + id2);
});

module.exports = { pass: pass, fail: fail };
