/* Device-local identity. Usernames are validated, stored on this device,
   and copied onto new idea submissions. Older saves gain a localId without
   rewriting ideas that were already submitted. */
"use strict";

const fs = require("fs");
const path = require("path");
const util = require("../public/util.js");
const { loadApp } = require("./harness.js");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
async function section(title, fn) {
  console.log("\n" + title);
  try { await fn(); }
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 400)); }
}

const KEY = "spark_state_v1";
const CLAIM = /unique|reserved|available|taken/i;

function oldIdea(title) {
  return {
    title: title,
    category: "Picnics & Parks",
    description: "Bring a blanket.",
    vibe: ["Chill"],
    submittedAt: "2026-04-01"
  };
}

function confirmedProfile() {
  return { name: "Ada", gender: "Woman", ageConfirmedAt: "2026-01-02T00:00:00.000Z" };
}

function withHeader(app, fn) {
  const nodes = {};
  const watch = {
    "#profile-avatar-big": true,
    "#profile-name-big": true,
    "#profile-username": true,
    "#profile-ideas": true,
    "#profile-sub": true,
    "#done-count-label": true,
    "#auto-dark-toggle": true
  };
  const orig = app.document.querySelector;
  app.document.querySelector = function(sel) {
    if (watch[sel]) {
      if (!nodes[sel]) {
        nodes[sel] = {
          textContent: "",
          innerHTML: "",
          checked: false,
          classList: {
            force: null,
            toggle(name, on){ this.force = on; },
            add(){}, remove(){}, contains(){ return false; }
          }
        };
      }
      return nodes[sel];
    }
    return orig.call(app.document, sel);
  };
  try { fn(nodes); }
  finally { app.document.querySelector = orig; }
}

function keysOf(obj) {
  return Object.keys(obj).sort().join(",");
}

async function main() {
  await section("username validation", () => {
    const good = util.validateUsername("  River_Day ");
    check("trims and stores lowercase", good.ok === true && good.username === "river_day" && !good.error);
    check("three characters pass", util.validateUsername("abc").ok === true && util.validateUsername("abc").username === "abc");
    check("twenty characters pass", util.validateUsername("a".repeat(20)).ok === true);
    check("digits and underscores pass", util.validateUsername("a_b3").username === "a_b3");
    check("underscores alone pass", util.validateUsername("___").ok === true);
    check("digits alone pass", util.validateUsername("123").ok === true);
    check("admin is not treated as reserved", util.validateUsername("admin").ok === true && util.validateUsername("admin").username === "admin");

    const samples = [
      ["", "empty"],
      ["   ", "empty"],
      ["ab", "too_short"],
      ["12", "too_short"],
      ["a".repeat(21), "too_long"],
      ["has space", "invalid_chars"],
      ["has-hyphen", "invalid_chars"],
      ["hey!", "invalid_chars"],
      ["café", "invalid_chars"]
    ];
    samples.forEach(([value, code]) => {
      const result = util.validateUsername(value);
      check(JSON.stringify(value) + " is " + code,
        result.ok === false && result.error === code && typeof result.message === "string" && result.message.length > 0 && !CLAIM.test(result.message),
        JSON.stringify(result));
    });
    check("null is empty", util.validateUsername(null).error === "empty");
    check("a number is empty", util.validateUsername(12).error === "empty");
    check("uppercase becomes lowercase", util.validateUsername("AbC").username === "abc");
  });

  await section("app wrapper and harness exports", () => {
    const app = loadApp({});
    const wrapped = app.validateUsername("  Ab_9 ");
    const direct = util.validateUsername("  Ab_9 ");
    check("wrapper returns the shared helper's username", wrapped.ok === true && wrapped.username === direct.username);
    check("wrapper returns the shared helper's error", app.validateUsername("no").error === util.validateUsername("no").error);
    [
      "state", "saveState", "hydrateRealIdea", "copyText", "shareOrCopy", "presentCopy", "presentShare",
      "getInviteLink", "commitFriendPick", "planShareState", "finishOnboarding", "ageGateSatisfied",
      "computeDeck", "buildSwipeCard", "localDateISO", "validateUsername", "profileUsernameLine",
      "submittedIdeasLabel", "renderProfileHeader", "applyProfileEdits", "recordSubmittedIdea",
      "buildEditProfileSubpanel"
    ].forEach(name => {
      check("harness still exports " + name, app[name] != null, typeof app[name]);
    });
    check("fresh identity shape",
      app.state.identity && typeof app.state.identity.localId === "string" &&
      /^loc_[a-z0-9]+$/.test(app.state.identity.localId) &&
      app.state.identity.username === null && app.state.identity.userId === null &&
      keysOf(app.state.identity) === "localId,userId,username");
    check("username is not copied onto the profile", app.state.profile.username === undefined && app.state.username === undefined);
  });

  await section("older saves gain an identity and keep old ideas", () => {
    const untouched = oldIdea("Old picnic");
    const already = {
      title: "Already stamped",
      category: "Picnics & Parks",
      description: "Leave this stamp alone.",
      vibe: [],
      submittedAt: "2026-03-01",
      submittedBy: { localId: "loc_other", username: "sam" }
    };
    const storage = {};
    storage[KEY] = JSON.stringify({
      onboarded: true,
      profile: confirmedProfile(),
      submittedIdeas: [untouched, already],
      datePlans: [{ id: "p1", name: "Friday", date: "", createdAt: 0, ideaIds: [2], friendPicks: [] }]
    });
    const app = loadApp(storage);
    const localId = app.state.identity.localId;
    check("minted a local id", typeof localId === "string" && /^loc_[a-z0-9]+$/.test(localId));
    check("username starts unset", app.state.identity.username === null);
    check("user id stays null", app.state.identity.userId === null);
    check("old idea gains no submittedBy", !Object.prototype.hasOwnProperty.call(app.state.submittedIdeas[0], "submittedBy"));
    check("old idea fields stay put", JSON.stringify(app.state.submittedIdeas[0]) === JSON.stringify(untouched));
    check("an existing stamp is not rewritten", JSON.stringify(app.state.submittedIdeas[1]) === JSON.stringify(already));
    check("plan is still there", app.state.datePlans[0].name === "Friday" && app.state.datePlans[0].ideaIds[0] === 2);
    check("profile name stays", app.state.profile.name === "Ada");

    const saved = JSON.parse(storage[KEY]);
    check("migration persisted the local id", saved.identity.localId === localId && saved.identity.userId === null);
    check("persisted ideas are still untouched",
      !Object.prototype.hasOwnProperty.call(saved.submittedIdeas[0], "submittedBy") &&
      JSON.stringify(saved.submittedIdeas[1].submittedBy) === JSON.stringify(already.submittedBy));

    const again = loadApp(storage);
    check("local id survives a second load", again.state.identity.localId === localId);
    check("second load still leaves the old idea unstamped",
      !Object.prototype.hasOwnProperty.call(again.state.submittedIdeas[0], "submittedBy"));
  });

  await section("identity repairs without touching submissions", () => {
    const untouched = oldIdea("Keep me");
    const raw = {
      onboarded: true,
      profile: confirmedProfile(),
      identity: { localId: "loc_keep", username: "ada_1", userId: null },
      submittedIdeas: [untouched]
    };
    const stable = {};
    stable[KEY] = JSON.stringify(raw);
    loadApp(stable);
    check("a valid identity is not rewritten", stable[KEY] === JSON.stringify(raw));

    const folded = {};
    folded[KEY] = JSON.stringify({
      onboarded: true,
      profile: confirmedProfile(),
      identity: { localId: "  loc_keep ", username: "  Cool_Cat ", userId: "  future-user " },
      submittedIdeas: [untouched]
    });
    const app = loadApp(folded);
    check("local id is trimmed, not replaced", app.state.identity.localId === "loc_keep");
    check("username is trimmed and lowercased", app.state.identity.username === "cool_cat");
    check("a future user id is kept", app.state.identity.userId === "future-user");
    check("folding case does not stamp the old idea",
      !Object.prototype.hasOwnProperty.call(app.state.submittedIdeas[0], "submittedBy"));
    const foldedSaved = JSON.parse(folded[KEY]);
    check("repaired identity was saved",
      foldedSaved.identity.localId === "loc_keep" &&
      foldedSaved.identity.username === "cool_cat" &&
      foldedSaved.identity.userId === "future-user");

    const invalid = {};
    invalid[KEY] = JSON.stringify({
      onboarded: true,
      profile: confirmedProfile(),
      identity: { localId: "loc_keep", username: "no", userId: "future-user" },
      submittedIdeas: [untouched]
    });
    const bad = loadApp(invalid);
    check("invalid stored username is cleared", bad.state.identity.username === null);
    check("clearing it keeps the local id and user id",
      bad.state.identity.localId === "loc_keep" && bad.state.identity.userId === "future-user");
    check("clearing it leaves the old idea alone",
      JSON.stringify(bad.state.submittedIdeas[0]) === JSON.stringify(untouched));

    const blank = {};
    blank[KEY] = JSON.stringify({
      onboarded: true,
      profile: confirmedProfile(),
      identity: { localId: "   ", username: null, userId: null },
      submittedIdeas: [untouched]
    });
    const minted = loadApp(blank);
    const mintedId = minted.state.identity.localId;
    check("blank local id is replaced once", typeof mintedId === "string" && mintedId !== "   " && /^loc_[a-z0-9]+$/.test(mintedId));
    const mintedAgain = loadApp(blank);
    check("replacement local id sticks", mintedAgain.state.identity.localId === mintedId);
    check("replacement does not stamp the old idea",
      !Object.prototype.hasOwnProperty.call(mintedAgain.state.submittedIdeas[0], "submittedBy"));
  });

  await section("profile header count and username", () => {
    const storage = {};
    storage[KEY] = JSON.stringify({
      onboarded: true,
      profile: confirmedProfile(),
      identity: { localId: "loc_keep", username: null, userId: null },
      submittedIdeas: []
    });
    const app = loadApp(storage);
    check("zero ideas", app.submittedIdeasLabel() === "0 ideas submitted");
    check("missing username prompts", app.profileUsernameLine() === "Add a username");
    withHeader(app, nodes => {
      app.renderProfileHeader();
      check("header shows the prompt", nodes["#profile-username"].textContent === "Add a username");
      check("header shows zero ideas", nodes["#profile-ideas"].textContent === "0 ideas submitted");
      check("header still shows the name", nodes["#profile-name-big"].textContent === "Ada");
      check("header still shows gender", nodes["#profile-sub"].textContent === "Woman");
      check("prompt is not a claim of uniqueness", !CLAIM.test(nodes["#profile-username"].textContent + nodes["#profile-ideas"].textContent));
    });

    app.state.submittedIdeas = [oldIdea("One")];
    check("one idea is singular", app.submittedIdeasLabel() === "1 idea submitted");
    app.state.submittedIdeas = [oldIdea("One"), oldIdea("Two"), oldIdea("Three")];
    check("three ideas use the plural", app.submittedIdeasLabel() === "3 ideas submitted" && app.submittedIdeasLabel(app.state.submittedIdeas.length) === "3 ideas submitted");
    const edited = app.applyProfileEdits({ name: "Ada", gender: "Woman", username: "  Ada_1 " });
    check("header username saves lowercase", edited.ok === true && app.state.identity.username === "ada_1");
    check("count still comes from submitted ideas", app.state.submittedIdeas.length === 3 && app.submittedIdeasLabel() === "3 ideas submitted");
    withHeader(app, nodes => {
      app.renderProfileHeader();
      check("header shows @username", nodes["#profile-username"].textContent === "@ada_1");
      check("header shows 3 ideas submitted", nodes["#profile-ideas"].textContent === "3 ideas submitted");
    });
  });

  await section("profile editor", () => {
    const storage = {};
    storage[KEY] = JSON.stringify({
      onboarded: true,
      profile: confirmedProfile(),
      identity: { localId: "loc_keep", username: "ada_1", userId: null },
      submittedIdeas: []
    });
    const app = loadApp(storage);
    const before = storage[KEY];
    const rejected = app.applyProfileEdits({ name: "Changed", gender: "Man", username: "No" });
    check("invalid username is rejected", rejected.ok === false && rejected.code === "too_short" && rejected.error === util.validateUsername("No").message);
    check("invalid username does not save", storage[KEY] === before && app.state.profile.name === "Ada" && app.state.identity.username === "ada_1" && app.state.identity.localId === "loc_keep");
    check("rejection message makes no uniqueness claim", !CLAIM.test(rejected.error));

    const kept = app.applyProfileEdits({ name: "New Name", gender: "Man", username: "   " });
    check("blank username is left as it was", kept.ok === true && app.state.identity.username === "ada_1" && app.state.profile.name === "New Name" && app.state.profile.gender === "Man");
    check("blank username does not move the local id", app.state.identity.localId === "loc_keep" && app.state.identity.userId === null);
    check("username stays off the profile", app.state.profile.username === undefined);

    const panel = app.buildEditProfileSubpanel();
    const form = panel.children.filter(child => child.className === "idea-form")[0];
    check("editor form rendered", !!form, panel.children.map(child => child.className).join(","));
    const html = form.innerHTML;
    check("editor says it is saved on this device only", html.indexOf("Saved on this device only for now.") !== -1);
    check("editor says it is not reserved or unique", html.indexOf("It is not reserved or unique yet.") !== -1);
    check("editor has an inline error slot", html.indexOf('id="ep-username-error"') !== -1 && html.indexOf("hidden") !== -1);
    const usernameField = html.slice(html.indexOf("<label>Username</label>"), html.indexOf('id="ep-username-note"'));
    check("username is optional", usernameField.indexOf("required") === -1, usernameField);
    check("editor shows the stored username", html.indexOf('value="ada_1"') !== -1);

    const src = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
    const editStart = src.indexOf("function buildEditProfileSubpanel");
    const edit = src.slice(editStart, src.indexOf("/* ---------- Add Friends", editStart));
    check("invalid username is shown inline", edit.indexOf("showUsernameError(outcome.error)") !== -1);
    const ideaStart = src.indexOf("function buildIdeaSubmitSubpanel");
    const idea = src.slice(ideaStart, src.indexOf("function applyProfileEdits", ideaStart));
    check("new ideas go through the stamper", idea.indexOf("recordSubmittedIdea(") !== -1);
  });

  await section("new ideas record who submitted them", () => {
    const untouched = oldIdea("Old picnic");
    const storage = {};
    storage[KEY] = JSON.stringify({
      onboarded: true,
      profile: confirmedProfile(),
      identity: { localId: "loc_keep", username: null, userId: null },
      submittedIdeas: [untouched]
    });
    const app = loadApp(storage);
    check("one existing idea", app.submittedIdeasLabel() === "1 idea submitted");
    const skipped = app.recordSubmittedIdea({ title: "  ", description: "nope" });
    check("empty idea is not stored", skipped === null && app.state.submittedIdeas.length === 1);

    app.state.identity.username = "ada_1";
    const first = app.state.submittedIdeas[0];
    const row = app.recordSubmittedIdea({
      title: "  Night walk ",
      category: "Hiking & Nature",
      description: " Walk the block. ",
      vibe: ["Chill"]
    });
    check("new row is stamped",
      !!row && row.submittedBy.localId === "loc_keep" && row.submittedBy.username === "ada_1" &&
      keysOf(row.submittedBy) === "localId,username");
    check("stamp is not the identity object", row.submittedBy !== app.state.identity);
    check("title and description are trimmed", row.title === "Night walk" && row.description === "Walk the block.");
    check("previous idea is the same object", app.state.submittedIdeas[0] === first && app.state.submittedIdeas.length === 2);
    check("previous idea still has no submittedBy", !Object.prototype.hasOwnProperty.call(app.state.submittedIdeas[0], "submittedBy"));
    check("count includes the old and the new", app.submittedIdeasLabel() === "2 ideas submitted");

    app.state.identity.username = "later_name";
    check("later rename does not rewrite the stamp", row.submittedBy.username === "ada_1" && row.submittedBy.localId === "loc_keep");

    app.state.identity.username = null;
    const anon = app.recordSubmittedIdea({ title: "Quiet hour", description: "Sit in the park." });
    check("a missing username is stored as null", anon.submittedBy.username === null && anon.submittedBy.localId === "loc_keep");
    check("the first stamp is still the old username", row.submittedBy.username === "ada_1");

    app.saveState();
    const again = loadApp(storage);
    check("stamps survive reload",
      again.state.submittedIdeas[1].submittedBy.username === "ada_1" &&
      again.state.submittedIdeas[1].submittedBy.localId === "loc_keep" &&
      again.state.submittedIdeas[2].submittedBy.username === null);
    check("reload still does not stamp the original",
      !Object.prototype.hasOwnProperty.call(again.state.submittedIdeas[0], "submittedBy"));
    check("reload keeps the same local id", again.state.identity.localId === "loc_keep");
  });

  await section("onboarding does not invent or drop identity", async () => {
    const storage = {};
    const app = loadApp(storage);
    const localId = app.state.identity.localId;
    app.setFetch(() => Promise.resolve({ json: () => Promise.resolve({ ok: true }) }));
    const ok = await app.finishOnboarding({ name: "Casey", dob: "1990-05-05", gender: "Woman" });
    check("onboarding succeeds", ok === true);
    check("local id survives onboarding", app.state.identity.localId === localId);
    check("onboarding does not invent a username or user id",
      app.state.identity.username === null && app.state.identity.userId === null);
    const saved = JSON.parse(storage[KEY]);
    check("saved identity is the same device", saved.identity.localId === localId && saved.identity.userId === null && saved.identity.username === null);
    const again = loadApp(storage);
    check("that local id reloads", again.state.identity.localId === localId);
  });

  return { pass: pass, fail: fail };
}

module.exports = main();
