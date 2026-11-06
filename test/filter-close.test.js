/* The Filters sheet close control.
   The heading is a stretched flex item rotated -5deg, and it comes after
   the X in the sheet. Without a higher stack level, taps land on the
   heading and the sheet stays open. The X must sit above that heading
   and use the existing dismiss. */

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
function decl(block, prop) {
  const re = new RegExp("(?:^|;)\\s*" + prop + "\\s*:\\s*([^;]+)");
  const m = block.match(re);
  return m ? m[1].trim() : "";
}
function px(value) {
  const raw = String(value || "").trim();
  if (raw === "0" || raw === "auto") return 0;
  const m = raw.match(/^(-?[\d.]+)px$/);
  return m ? Number(m[1]) : null;
}
function boxSides(value) {
  const parts = String(value || "").trim().split(/\s+/);
  const nums = parts.map(px);
  if (nums.some(n => n == null)) return null;
  if (nums.length === 1) return { top: nums[0], right: nums[0], bottom: nums[0], left: nums[0] };
  if (nums.length === 2) return { top: nums[0], right: nums[1], bottom: nums[0], left: nums[1] };
  if (nums.length === 3) return { top: nums[0], right: nums[1], bottom: nums[2], left: nums[1] };
  if (nums.length === 4) return { top: nums[0], right: nums[1], bottom: nums[2], left: nums[3] };
  return null;
}

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "public", "style.css"), "utf8");
const src = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

function layout() {
  const sheet = rule(css, ".overlay-sheet{");
  const close = rule(css, ".overlay-close{");
  const closeStack = rule(css, ".filter-sheet .overlay-close{");
  const handle = rule(css, ".overlay-handle{");
  const title = rule(css, ".sheet-title.display-title{");
  const tilt = rule(css, ".display-title{");
  const pad = boxSides(decl(sheet, "padding"));
  const titleMargin = boxSides(decl(title, "margin"));
  const handleMargin = boxSides(decl(handle, "margin"));
  const fontSize = px(decl(title, "font-size"));
  const lineHeight = decl(title, "line-height");
  const titleH = lineHeight === "1" && fontSize != null ? fontSize : px(lineHeight);
  const angle = (decl(tilt, "transform").match(/rotate\(\s*(-?[\d.]+)deg\s*\)/) || [])[1];
  const origin = decl(tilt, "transform-origin");
  const zRaw = decl(closeStack, "z-index");
  const z = zRaw === "" || zRaw === "auto" ? 0 : Number(zRaw);
  return {
    pad, titleMargin, handleMargin, titleH, angle: angle == null ? null : Number(angle),
    origin, z, zRaw,
    closeTop: px(decl(close, "top")),
    closeRight: px(decl(close, "right")),
    closeW: px(decl(close, "width")),
    closeH: px(decl(close, "height")),
    radius: decl(close, "border-radius"),
    pointer: decl(closeStack, "pointer-events") || decl(close, "pointer-events") || "auto",
    handleH: px(decl(handle, "height")),
    position: decl(close, "position")
  };
}

// Sheet coordinates, origin at the overlay's padding edge. The close control
// is a circle. The heading's border box is rotated around its left center.
function hitAt(sheetW, pxX, pxY, box, closeFirst) {
  const titleW = sheetW - box.pad.left - box.pad.right - box.titleMargin.left - box.titleMargin.right;
  const titleX = box.pad.left + box.titleMargin.left;
  const titleY = box.pad.top + box.handleH + box.handleMargin.bottom + box.titleMargin.top;
  const ox = titleX;
  const oy = titleY + box.titleH / 2;
  const dx = pxX - ox;
  const dy = pxY - oy;
  const rad = (-box.angle) * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const lx = cos * dx - sin * dy;
  const ly = sin * dx + cos * dy;
  const inTitle = lx >= -0.75 && lx <= titleW + 0.75 && ly >= -box.titleH / 2 - 0.75 && ly <= box.titleH / 2 + 0.75;
  const cx = sheetW - box.closeRight - box.closeW / 2;
  const cy = box.closeTop + box.closeH / 2;
  const dist = Math.hypot(pxX - cx, pxY - cy);
  const radius = box.radius === "50%" ? Math.min(box.closeW, box.closeH) / 2 : Math.min(box.closeW, box.closeH) / 2;
  const inClose = box.pointer !== "none" && dist <= radius + 0.01;
  if (inClose && inTitle) {
    if (box.z > 0) return "filter-close";
    // Same stack level: the later sibling wins. The heading follows the X.
    return closeFirst ? "filters-title" : "filter-close";
  }
  if (inClose) return "filter-close";
  if (inTitle) return "filters-title";
  return "sheet";
}

section("the Filters X uses the existing dismiss", () => {
  const sheet = between(html, 'id="filter-overlay"', 'id="plan-overlay"');
  const closeAt = sheet.indexOf('id="filter-close"');
  const titleAt = sheet.indexOf('class="sheet-title display-title"');
  check("the sheet has a close control before the tilted heading",
    closeAt !== -1 && titleAt !== -1 && closeAt < titleAt);
  const listener = between(src, '$("#filter-close").addEventListener("click",', "});");
  check("the X is wired to closeFilterOverlay", listener.indexOf("closeFilterOverlay()") !== -1, listener.trim());
  const dismiss = between(src, "function closeFilterOverlay()", "function fmtDate");
  check("that dismiss hides the filter overlay",
    dismiss.indexOf("filterSheetOpen = false") !== -1 && dismiss.indexOf('closeOverlay("#filter-overlay")') !== -1,
    dismiss.trim());
  const hide = between(src, "function closeOverlay(id)", "function closeFilterOverlay");
  check("hiding the overlay uses the shared hidden class", hide.indexOf('classList.add("hidden")') !== -1, hide.trim());

  const t = loadApp({
    spark_state_v1: JSON.stringify({
      onboarded: true,
      hasSeenTutorial: true,
      profile: { name: "Ada", gender: "Woman", ageConfirmedAt: "2020-01-01T00:00:00.000Z" },
      settings: { autoDarkMode: false }
    })
  });
  t.openFilterOverlay();
  check("opening Filters shows the sheet", t.filterSheetOpen === true);
  t.closeFilterOverlay();
  check("activating the dismiss hides the sheet", t.filterSheetOpen === false);
  check("the map chooser is released with the sheet", t.radiusMapHandle === null);
});

section("the Filters X is on top of the tilted heading", () => {
  const box = layout();
  check("the close control is the absolute circle in the sheet corner",
    box.position === "absolute" && box.radius === "50%" &&
    box.closeW === 30 && box.closeH === 30 && box.closeTop === 14 && box.closeRight === 18,
    JSON.stringify(box));
  check("the heading is tilted from its left center",
    box.angle === -5 && box.origin.indexOf("left center") !== -1 && box.titleH === 32,
    "angle " + box.angle + " origin " + box.origin);
  check("the sheet padding and heading margin are the ones that place the X under the tilt",
    !!box.pad && box.pad.top === 14 && box.pad.left === 22 && box.pad.right === 22 &&
    !!box.titleMargin && box.titleMargin.top === 12 && box.titleMargin.left === 4 &&
    box.handleH === 5 && box.handleMargin && box.handleMargin.bottom === 10);
  check("the close control stacks above the heading",
    box.z >= 1 && box.pointer !== "none", "z-index:" + box.zRaw + " pointer-events:" + box.pointer);

  const sheetHtml = between(html, 'id="filter-overlay"', 'id="plan-overlay"');
  const closeFirst = sheetHtml.indexOf('id="filter-close"') < sheetHtml.indexOf("sheet-title");
  // Phone widths, including the 400px frame used above the mobile breakpoint.
  [320, 360, 390, 400, 430].forEach(sheetW => {
    const cx = sheetW - box.closeRight - box.closeW / 2;
    const cy = box.closeTop + box.closeH / 2;
    const samples = [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]];
    const misses = samples.filter(offset => hitAt(sheetW, cx + offset[0], cy + offset[1], box, closeFirst) !== "filter-close");
    check("taps across the X at sheet width " + sheetW + " hit the close control",
      misses.length === 0, misses.map(offset => offset.join(",")).join(" "));
    const covered = hitAt(sheetW, cx, cy, Object.assign({}, box, { z: 0 }), closeFirst);
    check("without that stack level the heading would take the center tap at " + sheetW,
      covered === "filters-title", covered);
  });

  const stage = rule(css, ".radius-map-stage{");
  check("the Choose a spot map stays clipped inside its stage",
    stage.indexOf("position:relative") !== -1 && stage.indexOf("overflow:hidden") !== -1, stage.trim());
});

module.exports = { pass: pass, fail: fail };
