/* Bottom nav and the Discover header.
   Done was the last tab. Profile takes that spot and opens the same
   sheet the old header button opened. Completed dates stay on the
   Saved Done folder. The Jaderoo header scrolls only on Discover. */

const fs = require("fs");
const path = require("path");
const { loadApp } = require("./harness.js");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}
function section(title, fn) {
  console.log("\n" + title);
  try { fn(); }
  catch (e) { check("section ran without throwing", false, String(e.stack || e.message).slice(0, 500)); }
}
function between(s, a, b) {
  const i = s.indexOf(a);
  if (i < 0) return "";
  const j = b ? s.indexOf(b, i + a.length) : s.length;
  if (j < 0) return "";
  return s.slice(i, j);
}
function rule(css, selector) {
  const at = css.indexOf(selector);
  if (at < 0) return "";
  const start = css.indexOf("{", at);
  const end = css.indexOf("}", start);
  return css.slice(start + 1, end);
}
function textOf(node) {
  if (!node) return "";
  let out = node.innerHTML || "";
  (node.children || []).forEach(child => { out += "\n" + textOf(child); });
  return out;
}

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "public", "style.css"), "utf8");
const src = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const nav = between(html, '<div class="bottom-nav">', "</div>");
const topbar = between(html, '<div class="topbar">', "<!-- Main content area");

section("Profile replaces the Done tab, in the same spot", () => {
  const tabs = Array.from(nav.matchAll(/data-tab="([^"]+)"/g)).map(m => m[1]);
  const labels = Array.from(nav.matchAll(/class="nav-label">([^<]+)/g)).map(m => m[1]);
  check("tabs are Discover, Friends, Saved, Profile",
    tabs.join(",") === "discover,friends,saved,profile", tabs.join(","));
  check("labels match those tabs",
    labels.join(",") === "Discover,Friends,Saved,Profile", labels.join(","));
  check("Saved is still the third tab", tabs[2] === "saved");
  check("Profile sits where Done sat", tabs[3] === "profile" && labels[3] === "Profile");
  check("Done is not a bottom tab", nav.indexOf('data-tab="done"') === -1 && labels.indexOf("Done") === -1);
  check("the header has no profile button",
    topbar.indexOf("profile-btn") === -1 && topbar.indexOf("topbar-avatar") === -1 && html.indexOf('id="profile-btn"') === -1);
});

section("Profile icon matches the other tab icons", () => {
  const buttons = Array.from(nav.matchAll(/<button class="nav-btn[^"]*" data-tab="[^"]+">[\s\S]*?<\/button>/g)).map(m => m[0]);
  check("four tab buttons", buttons.length === 4, String(buttons.length));
  buttons.forEach(btn => {
    const tab = (btn.match(/data-tab="([^"]+)"/) || [])[1];
    const svg = (btn.match(/<svg[^>]*>/) || [""])[0];
    check(tab + " icon uses the shared 24 viewBox and 1.8 stroke",
      svg.indexOf('viewBox="0 0 24 24"') !== -1 && svg.indexOf('stroke-width="1.8"') !== -1 &&
      svg.indexOf('stroke-linecap="round"') !== -1 && svg.indexOf(" width=") === -1 && svg.indexOf(" height=") === -1,
      svg);
  });
  const userIcon = (src.match(/user:\s+'([^']+)'/) || [])[1] || "";
  const profileBtn = buttons[3] || "";
  check("profile uses the person glyph", userIcon && profileBtn.indexOf(userIcon) !== -1, userIcon);
  const sheet = between(html, 'id="profile-overlay"', 'id="subpage-overlay"');
  check("that glyph is the one the profile sheet already uses", sheet.indexOf(userIcon) !== -1);
  check("tab icons share one size rule", rule(css, ".nav-btn .nav-icon svg{").indexOf("width:21px") !== -1 &&
    rule(css, ".nav-btn .nav-icon svg{").indexOf("height:21px") !== -1);
  check("profile has no private icon size", css.indexOf("[data-tab=\"profile\"]") === -1);
  check("active state is the shared tab rule",
    rule(css, ".nav-btn.active{").indexOf("var(--color-nav-active)") !== -1 &&
    rule(css, ".nav-btn.active .nav-icon{").indexOf("rgba(255,255,255,.16)") !== -1);
});

section("Bottom bar stays deep jade, undivided, softly shadowed", () => {
  const jade = css.match(/--color-nav:#0B6E4F/g) || [];
  check("deep jade is the nav color in day, night, and the system theme", jade.length >= 3, String(jade.length));
  const bar = rule(css, ".bottom-nav{");
  check("bar fill is the nav token", bar.indexOf("background:var(--color-nav)") !== -1);
  check("bar has no top divider", bar.indexOf("border-top:none") !== -1);
  check("bar shadow is the soft nav token", bar.indexOf("box-shadow:var(--shadow-nav)") !== -1);
  check("bar rule has no hard zero-blur shadow", !/\d+px\s+\d+px\s+0(?:px)?\b/.test(bar));
  check("tabs have no borders of their own", rule(css, ".nav-btn{").indexOf("border:none") !== -1);
  check("markup has no tab separators", nav.indexOf("divider") === -1 && nav.indexOf("<hr") === -1);
});

section("Discover header scrolls; every other header stays pinned", () => {
  const pinned = rule(css, ".topbar{");
  const scrolling = rule(css, ".topbar.topbar-in-scroll{");
  check("the shared header rule is not sticky or fixed",
    pinned.indexOf("sticky") === -1 && pinned.indexOf("fixed") === -1, pinned.trim());
  check("the discover header is static, not sticky",
    scrolling.indexOf("position:static") !== -1 && scrolling.indexOf("sticky") === -1 && scrolling.indexOf("fixed") === -1,
    scrolling.trim());
  const discover = between(src, "function buildDiscoverScreen()", "function buildLocationBar");
  const mountAt = discover.indexOf("mountDiscoverHeader(wrap)");
  check("discover mounts the header inside its screen", mountAt !== -1 && mountAt < discover.indexOf("buildRadiusRow()"));
  const render = between(src, "function renderContent()", "function goToDetail");
  const parkAt = render.indexOf("parkTopbar()");
  const clearAt = render.indexOf('content.innerHTML = ""');
  check("the header is moved back above the screen before a redraw", parkAt !== -1 && parkAt < clearAt);
  const mount = between(src, "function mountDiscoverHeader", "function setNavActive");
  check("only the discover screen marks the header as scrolling",
    mount.indexOf('classList.add("topbar-in-scroll")') !== -1);
  const park = between(src, "function parkTopbar", "function mountDiscoverHeader");
  check("leaving discover clears that mark and reattaches the header",
    park.indexOf('classList.remove("topbar-in-scroll")') !== -1 &&
    park.indexOf("shell.insertBefore(topbar, content)") !== -1);
});

section("Profile tab opens the same sheet and Done stays in Saved", () => {
  const click = between(src, '$all(".nav-btn").forEach', "var TAB_TITLES");
  check("the profile tab does not switch screens",
    click.indexOf('if(tab === "profile"){ openProfile(); return; }') !== -1, click.slice(0, 240));
  const openFn = between(src, "function openProfile()", "function closeProfile()");
  check("opening profile does not change the current tab", openFn.indexOf("ui.tab") === -1, openFn);
  check("opening profile shows the existing overlay", openFn.indexOf('openOverlay("#profile-overlay")') !== -1);
  check("opening profile highlights the Profile tab", openFn.indexOf('setNavActive("profile")') !== -1);
  const closeFn = between(src, "function closeProfile()", '$("#profile-close")');
  check("closing profile restores the tab underneath",
    closeFn.indexOf('closeOverlay("#profile-overlay")') !== -1 && closeFn.indexOf("setNavActive(ui.tab)") !== -1, closeFn);
  check("the header button is no longer wired", src.indexOf("profile-btn") === -1 && src.indexOf("topbar-avatar") === -1);

  const store = {
    spark_state_v1: JSON.stringify({
      onboarded: true,
      hasSeenTutorial: true,
      profile: { name: "Ada", gender: "Woman", ageConfirmedAt: "2026-01-15T00:00:00.000Z" },
      somedayIds: [],
      doneIds: [{ id: 8, date: "2026-10-04" }],
      settings: { autoDarkMode: false }
    })
  };
  const t = loadApp(store);
  t.ui.savedBucket = { type: "done" };
  const saved = textOf(t.buildSavedScreen());
  check("the Saved Done folder still lists the completed idea",
    saved.indexOf("Done · 1") !== -1 && saved.indexOf("Snowshoe Out and Camp in the Snow") !== -1 &&
    saved.indexOf("Done ") !== -1, saved.slice(0, 400));
});

module.exports = { pass: pass, fail: fail };
