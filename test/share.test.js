/* Copy and share helpers, plus the wording on the invite and friend flows.
   Spark does not deliver a message. These checks lock that the clipboard and
   the share sheet are real, and that the screens do not say otherwise. */

const fs = require("fs");
const path = require("path");
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

function between(src, start, end) {
  const i = src.indexOf(start);
  const j = src.indexOf(end, i + start.length);
  if (i < 0 || j < 0) throw new Error("markers not found: " + start);
  return src.slice(i, j);
}

function installToast(app) {
  const toast = {
    textContent: "",
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } }
  };
  const orig = app.document.querySelector.bind(app.document);
  app.document.querySelector = function(sel) {
    if (sel === "#toast") return toast;
    return orig(sel);
  };
  return toast;
}

/* Records the hidden-textarea fallback without touching a real clipboard. */
function installFallback(app, execOk) {
  const calls = { cmd: null, value: null, appended: false };
  const prevCreate = app.document.createElement.bind(app.document);
  const prevAppend = app.document.body.appendChild.bind(app.document.body);
  app.document.createElement = function(tag) {
    const el = prevCreate(tag);
    el.select = function() { calls.value = el.value; };
    el.setSelectionRange = function(start, end) { calls.range = [start, end]; };
    return el;
  };
  app.document.execCommand = function(cmd) {
    calls.cmd = cmd;
    return execOk;
  };
  app.document.body.appendChild = function(node) {
    calls.appended = true;
    calls.node = node;
    return prevAppend(node);
  };
  return calls;
}

function clearShare(app) {
  delete app.navigator.share;
  delete app.navigator.clipboard;
}

async function main() {
const app = loadApp({});
const toast = installToast(app);

await section("wording does not claim a message was sent", () => {
  const appSrc = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  const share = between(appSrc, "/* ---------- Copy and share ----------", "/* ---------- Saved / Done screens ---------- */");
  const invite = between(appSrc, "/* ---------- Add Friends (QR code + mock contacts) ---------- */", "/* ---------- Dark mode (auto, 9pm-6am) ---------- */");
  const markup = between(html, "<!-- ===================== SHARE OVERLAY ===================== -->", '<div id="toast"');
  const flows = share + "\n" + invite + "\n" + markup;

  check("no sent wording in the share and invite flows", !/\bsent\b/i.test(flows));
  check("no Shared-with confirmation", flows.toLowerCase().indexOf("shared with") === -1);
  check("no invite-link-copied confirmation", flows.toLowerCase().indexOf("invite link copied") === -1);
  check("no Send Link label", !/send link/i.test(flows));
  check("copy success says Copied", share.indexOf('showToast("Copied")') !== -1);
  check("copy failure says Couldn't copy", share.indexOf('showToast("Couldn\'t copy")') !== -1);
  check("plan favorite says Saved locally", share.indexOf('showToast("Saved locally")') !== -1);
  check("helpers call the clipboard and the share sheet",
        share.indexOf("navigator.clipboard.writeText") !== -1 &&
        share.indexOf("navigator.share") !== -1 &&
        share.indexOf('document.execCommand("copy")') !== -1 &&
        share.indexOf("AbortError") !== -1);
  check("invite copy uses the invite link", invite.indexOf("presentCopy(getInviteLink())") !== -1);
  check("invite share uses the invite link", invite.indexOf("presentShare(inviteShareData())") !== -1);
  check("idea share uses the share helper", share.indexOf("presentShare(ideaShareData(ideaId))") !== -1);
  check("contact action is Share", invite.indexOf(">Share</button>") !== -1);
  check("plan share markup stays on this device", markup.indexOf("on this device") !== -1);
});

await section("clipboard success", async () => {
  clearShare(app);
  let written = null;
  let fallback = false;
  app.navigator.clipboard = {
    writeText(text) { written = text; return Promise.resolve(); }
  };
  app.document.execCommand = function() { fallback = true; return true; };
  toast.textContent = "";
  const link = app.getInviteLink();
  check("invite link is a spark invite url", /^https:\/\/spark-dates\.app\/invite\/[a-z0-9-]+$/.test(link), link);
  await app.presentCopy(link);
  check("writeText got the invite link", written === link, written);
  check("fallback did not run", fallback === false);
  check("toast is Copied", toast.textContent === "Copied", toast.textContent);
});

await section("clipboard failure with fallback", async () => {
  clearShare(app);
  app.navigator.clipboard = {
    writeText() { return Promise.reject(new Error("denied")); }
  };
  const calls = installFallback(app, true);
  toast.textContent = "";
  const link = "https://spark-dates.app/invite/friend-abc";
  await app.copyText(link);
  check("fallback copied through execCommand", calls.cmd === "copy", String(calls.cmd));
  check("hidden textarea held the link", calls.value === link, calls.value);
  check("textarea was appended", calls.appended === true);
  check("selection covered the link", calls.range && calls.range[0] === 0 && calls.range[1] === link.length,
        JSON.stringify(calls.range));
  await app.presentCopy(link);
  check("toast is Copied only after the fallback works", toast.textContent === "Copied", toast.textContent);

  installFallback(app, false);
  toast.textContent = "STALE";
  let rejected = false;
  try { await app.copyText(link); }
  catch (e) { rejected = true; }
  check("fallback failure rejects", rejected === true);
  await app.presentCopy(link);
  check("toast is an honest error", toast.textContent === "Couldn't copy", toast.textContent);
  check("error toast does not say sent", !/\bsent\b/i.test(toast.textContent));
});

await section("clipboard missing uses the fallback", async () => {
  clearShare(app);
  const calls = installFallback(app, true);
  const text = "https://spark-dates.app/invite/friend-missing";
  await app.copyText(text);
  check("missing clipboard still copies", calls.cmd === "copy" && calls.value === text, calls.value);
});

await section("navigator.share present", async () => {
  clearShare(app);
  let shared = null;
  let written = null;
  app.navigator.share = function(data) {
    shared = data;
    return Promise.resolve();
  };
  app.navigator.clipboard = {
    writeText(text) { written = text; return Promise.resolve(); }
  };
  toast.textContent = "STALE";
  const result = await app.shareOrCopy({
    title: "Join me on Spark",
    text: "Add me on Spark",
    url: "https://spark-dates.app/invite/friend-x"
  });
  check("share result", result && result.method === "share" && !result.aborted);
  check("share sheet got the link", shared && shared.url === "https://spark-dates.app/invite/friend-x" &&
        shared.title === "Join me on Spark" && shared.text === "Add me on Spark");
  check("clipboard was not used", written === null);
  await app.presentShare({ title: "Idea", text: "A walk in the snow" });
  check("share success does not toast", toast.textContent === "STALE", toast.textContent);
  check("text share omits an empty url", shared && shared.url === undefined && shared.text === "A walk in the snow",
        JSON.stringify(shared));
});

await section("navigator.share missing falls back to copy", async () => {
  clearShare(app);
  let written = null;
  app.navigator.clipboard = {
    writeText(text) { written = text; return Promise.resolve(); }
  };
  toast.textContent = "";
  const result = await app.presentShare({
    title: "Join me on Spark",
    text: "Add me on Spark",
    url: "https://spark-dates.app/invite/friend-y"
  });
  check("presentShare resolves", result === undefined || result === null || typeof result === "object");
  check("missing share copied the link", written === "https://spark-dates.app/invite/friend-y", written);
  check("toast is Copied", toast.textContent === "Copied", toast.textContent);

  written = null;
  const textOnly = await app.shareOrCopy({ title: "Idea", text: "Picnic" });
  check("missing share copies text when there is no link", textOnly.method === "copy" && written === "Picnic", written);
});

await section("AbortError is a silent no-op", async () => {
  clearShare(app);
  let copied = false;
  function rejectAbort() {
    const err = new Error("Share canceled");
    err.name = "AbortError";
    return Promise.reject(err);
  }
  app.navigator.share = function() { return rejectAbort(); };
  app.navigator.clipboard = {
    writeText() { copied = true; return Promise.resolve(); }
  };
  app.document.execCommand = function() { copied = true; return true; };
  toast.textContent = "STALE";
  const result = await app.shareOrCopy({ url: "https://spark-dates.app/invite/friend-z", title: "Join me on Spark" });
  check("aborted result", result && result.aborted === true && result.method !== "copy");
  await app.presentShare({ url: "https://spark-dates.app/invite/friend-z" });
  check("cancel does not copy", copied === false);
  check("cancel does not toast", toast.textContent === "STALE", toast.textContent);

  app.navigator.share = function() {
    const err = new Error("Share canceled");
    err.name = "AbortError";
    throw err;
  };
  const sync = await app.shareOrCopy({ url: "https://spark-dates.app/invite/friend-z" });
  check("sync AbortError is also silent", sync && sync.aborted === true && copied === false);
});

await section("share failure other than cancel falls back to copy", async () => {
  clearShare(app);
  let written = null;
  app.navigator.share = function() { return Promise.reject(new Error("share unavailable")); };
  app.navigator.clipboard = {
    writeText(text) { written = text; return Promise.resolve(); }
  };
  toast.textContent = "";
  const result = await app.shareOrCopy({ url: "https://spark-dates.app/invite/friend-q", title: "Join me on Spark" });
  check("non-cancel failure copies the link", result && result.method === "copy" && written === "https://spark-dates.app/invite/friend-q",
        written);
  await app.presentShare({ url: "https://spark-dates.app/invite/friend-q" });
  check("fallback toast is Copied", toast.textContent === "Copied", toast.textContent);
});

await section("plan favorite is saved locally", () => {
  app.state.datePlans.push({
    id: "plan-test",
    name: "Friday",
    date: "",
    createdAt: "2026-01-01",
    ideaIds: [2],
    friendPicks: []
  });
  app.planShareState.planId = "plan-test";
  app.planShareState.friendIdx = 0;
  toast.textContent = "";
  app.commitFriendPick(2);
  const picks = app.state.datePlans[app.state.datePlans.length - 1].friendPicks;
  check("pick is stored on the plan", picks.length === 1 && picks[0].ideaId === 2 && picks[0].friendName === "Emma R.",
        JSON.stringify(picks));
  check("confirmation is Saved locally", toast.textContent === "Saved locally", toast.textContent);
  check("confirmation does not say sent", !/\bsent\b/i.test(toast.textContent));
});

  return { pass: pass, fail: fail };
}

module.exports = main();
