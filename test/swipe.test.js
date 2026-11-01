/* Discover swipe: direction lock, commit threshold, and flick.
   Vertical movement scrolls and never saves or passes a card.
   The Saved row uses the same lock, then its own reveal distance. */
"use strict";

const fs = require("fs");
const path = require("path");
const util = require("../public/util");

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

const SLOP = util.SWIPE_SLOP_PX;
const RATIO = util.SWIPE_HORIZONTAL_RATIO;
const FRACTION = util.SWIPE_COMMIT_FRACTION;
const FLICK = util.SWIPE_FLICK_PX_PER_MS;
const FLICK_MIN = util.SWIPE_FLICK_MIN_PX;
const WIDTH = 360;
const THRESHOLD = WIDTH * FRACTION;

function end(dx, dy, extra) {
  return util.resolveCardSwipe(Object.assign({
    dx: dx, dy: dy, phase: "end", cardWidth: WIDTH, velocityX: 0
  }, extra || {}));
}
function move(dx, dy, extra) {
  return util.resolveCardSwipe(Object.assign({
    dx: dx, dy: dy, phase: "move", cardWidth: WIDTH, velocityX: 0
  }, extra || {}));
}

section("thresholds", () => {
  check("slop is 10px", SLOP === 10);
  check("horizontal lock requires 1.5 times the vertical travel", RATIO === 1.5);
  check("commit fraction is inside 30 to 35 percent", FRACTION > 0.30 && FRACTION < 0.35, String(FRACTION));
  check("commit fraction is 32 percent", FRACTION === 0.32);
  check("a flick is at least 0.6 px/ms and 32px", FLICK === 0.6 && FLICK_MIN === 32);
  check("fallback card width is the deck width", util.SWIPE_FALLBACK_WIDTH === 360);
});

section("direction lock", () => {
  check("movement inside the slop stays undecided",
    move(SLOP, 0).action === "pending" && move(0, SLOP).action === "pending" &&
    move(8, -9).axis === null);
  check("a release inside the slop is a tap",
    end(SLOP, -4).action === "tap" && end(0, 0).action === "tap");
  check("one pixel past the slop can lock",
    move(SLOP + 1, 0).axis === "horizontal" && move(0, SLOP + 1).axis === "vertical");

  check("vertical wins when |dy| is greater than |dx|",
    move(12, 40).axis === "vertical" && move(-18, -30).action === "scroll");
  check("a mostly vertical drag does not drag the card",
    move(15, 40).action === "scroll");
  check("horizontal locks only when |dx| is more than 1.5 times |dy|",
    move(31, 20).axis === "horizontal" && move(31, 20).action === "drag");
  check("equal travel past the slop does not lock",
    move(24, 24).axis === null && move(24, -24).action === "pending");
  check("the band between |dy| and 1.5 times |dy| stays undecided",
    move(20, 16).axis === null && move(30, 20).action === "pending");
  check("a release in that band snaps back and does not open the card",
    end(20, 16).action === "snap");

  check("a vertical lock sticks for the rest of the gesture",
    move(80, 12, { axis: "vertical" }).axis === "vertical" &&
    move(80, 12, { axis: "vertical" }).action === "scroll");
  check("a horizontal lock sticks even if the finger then drifts down",
    move(20, 90, { axis: "horizontal" }).axis === "horizontal" &&
    move(20, 90, { axis: "horizontal" }).action === "drag");
});

section("vertical scrolling never swipes", () => {
  const samples = [
    [0, 120], [8, 140], [-12, 100], [40, 80], [0, -160], [25, -130], [-30, -90]
  ];
  samples.forEach(pair => {
    const decided = end(pair[0], pair[1]);
    check("vertical " + pair[0] + "," + pair[1] + " does not save or pass",
      decided.action === "scroll" && decided.axis === "vertical" &&
      decided.action !== "save" && decided.action !== "pass");
  });
  check("the old 100px upward swipe is a scroll, not a save",
    end(0, -100).action === "scroll" && end(6, -140).action === "scroll");
  check("a fast vertical flick is still a scroll",
    end(10, -80, { velocityX: 2 }).action === "scroll");
});

section("horizontal commit and snap back", () => {
  check("just under 32 percent of the card snaps back",
    end(THRESHOLD - 0.2, 4).action === "snap");
  check("32 percent to the right saves",
    end(THRESHOLD, 6).action === "save" && end(THRESHOLD, 6).threshold === THRESHOLD);
  check("32 percent to the left passes",
    end(-THRESHOLD, -8).action === "pass");
  check("a long right drag with some downward drift still saves",
    end(THRESHOLD + 10, 40).action === "save");
  check("a short slow horizontal drag snaps back",
    end(48, 4, { velocityX: 0.2 }).action === "snap");
  check("a missing card width uses the 360px fallback",
    end(THRESHOLD, 0, { cardWidth: 0 }).action === "save" &&
    end(THRESHOLD - 1, 0, { cardWidth: 0 }).action === "snap");
  const narrow = end(63, 0, { cardWidth: 200 });
  check("a narrower card commits at 32 percent of its own width",
    narrow.action === "snap" && narrow.threshold === 64);
  check("that narrower card saves once past its own threshold",
    end(64, 0, { cardWidth: 200 }).action === "save");
});

section("fast horizontal flick", () => {
  check("a clearly horizontal flick under the distance threshold saves",
    end(FLICK_MIN, 4, { velocityX: FLICK }).action === "save");
  check("the same flick to the left passes",
    end(-FLICK_MIN, 2, { velocityX: -FLICK }).action === "pass");
  check("a hair under flick speed snaps back",
    end(FLICK_MIN + 8, 2, { velocityX: FLICK - 0.01 }).action === "snap");
  check("a flick shorter than the minimum distance snaps back",
    end(FLICK_MIN - 1, 0, { velocityX: 2 }).action === "snap");
  check("a flick whose velocity fights the drag snaps back",
    end(80, 4, { velocityX: -FLICK }).action === "snap");
  check("a fast flick that is no longer clearly horizontal snaps back",
    end(40, 30, { axis: "horizontal", velocityX: 1.2 }).action === "snap");
  check("a locked horizontal flick that stays clearly horizontal saves",
    end(40, 10, { axis: "horizontal", velocityX: 0.9 }).action === "save");
});

section("saved rows share the lock and keep their own reveal", () => {
  check("a vertical saved-list drag locks vertical",
    util.lockSwipeAxis(8, 36, null) === "vertical");
  check("a clearly leftward drag locks horizontal so the row can reveal delete",
    util.lockSwipeAxis(-48, 8, null) === "horizontal");
  check("a shallow diagonal on a saved row does not lock yet",
    util.lockSwipeAxis(-20, 16, null) === null);
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  check("discover cards ask the shared resolver", src.indexOf("SparkUtil.resolveCardSwipe") !== -1);
  check("saved rows use the same direction lock", src.indexOf("SparkUtil.lockSwipeAxis") !== -1);
  check("discover no longer commits on a 100px vertical drag",
    src.indexOf("curY < -100") === -1 && src.indexOf("curY > 100") === -1);
  check("detail still saves on an upward swipe", src.indexOf("dy < -70") !== -1);
  check("a right commit still saves and a left commit still passes",
    src.indexOf('decision.action === "save"') !== -1 &&
    src.indexOf('decision.action === "pass"') !== -1 &&
    src.indexOf('finishSwipe(card, "yes"') !== -1 &&
    src.indexOf('finishSwipe(card, "no"') !== -1);
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "style.css"), "utf8");
  const cardRule = css.slice(css.indexOf(".swipe-card{"), css.indexOf("}", css.indexOf(".swipe-card{")));
  check("the card lets the browser pan vertically", cardRule.indexOf("touch-action:pan-y") !== -1, cardRule);
  check("the card no longer blocks scrolling with touch-action none", cardRule.indexOf("touch-action:none") === -1);
  const hero = css.slice(css.indexOf(".detail-hero{ touch-action"), css.indexOf(".detail-hero{ touch-action") + 40);
  check("the detail hero keeps its own touch handling", hero.indexOf("touch-action:none") !== -1);
  const row = css.slice(css.indexOf(".swipeable-row-content{"), css.indexOf(".swipeable-row-content{") + 80);
  check("saved rows still pan vertically", row.indexOf("touch-action:pan-y") !== -1);
});

module.exports = { pass: pass, fail: fail };
