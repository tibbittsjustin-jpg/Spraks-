/* ===================== Spark motifs.js =====================
 * Hand-drawn, per-activity foreground art.
 *
 * Each motif is drawn in its own 40x40 local box:
 *   - horizontal centre is x = 20
 *   - the object's BASELINE (where it meets the ground) is y = 40
 * getCoverArtStyle() places that box onto the scene's horizon line, so a
 * motif never has to know anything about the backdrop it lands on.
 *
 * Colour tokens are substituted at render time so one drawing works on a
 * bright noon sky and a midnight one alike:
 *   {ink} solid silhouette body      {acc} warm accent (light, fire, fruit)
 *   {lit} pale highlight             {sky} punch-through to the sky behind
 *
 * Keep shapes chunky and simple — a motif renders about 110px wide on a card,
 * and thin detail disappears at that size.
 * ============================================================ */
var MOTIFS = (function () {
  "use strict";

  // Two small people, used by motifs where the couple IS the picture.
  // dx shifts the pair, s scales it. Baseline sits at y=40.
  function couple(dx, s) {
    s = s || 1; dx = dx || 0;
    var g = '<g transform="translate(' + dx + ',0) scale(' + s + ')" transform-origin="20 40">';
    // left figure
    g += '<circle cx="15.5" cy="25" r="2.6" fill="{ink}"/>';
    g += '<path d="M15.5 28 q-3.2 0.6 -3.4 4.2 L11.6 40 h7.8 l-0.7 -7.8 q-0.2 -3.6 -3.2 -4.2z" fill="{ink}"/>';
    // right figure
    g += '<circle cx="24.5" cy="24.2" r="2.6" fill="{ink}"/>';
    g += '<path d="M24.5 27.2 q3.2 0.6 3.4 4.2 L28.4 40 h-7.8 l0.7 -7.8 q0.2 -3.6 3.2 -4.2z" fill="{ink}"/>';
    return g + '</g>';
  }

  function ground(w) {
    // a little shadow so objects feel planted rather than floating
    w = w || 13;
    return '<ellipse cx="20" cy="39.6" rx="' + w + '" ry="1.5" fill="{ink}" opacity="0.25"/>';
  }

  var M = {};

  /* ---------------- Winter & snow ---------------- */
  M.sled = ground(11) +
    '<path d="M8 33 h20 a2 2 0 0 1 2 2 v1 H8z" fill="{acc}"/>' +
    '<path d="M7 37 q-1.6 0 -1.6 -1.6 M7 37 h24 q2.5 0 2.5 -3" stroke="{ink}" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
    '<path d="M9 33 v-3 M27 33 v-3" stroke="{ink}" stroke-width="1.6" stroke-linecap="round"/>';

  M.skis = ground(10) +
    '<path d="M11 39 h16 q3 0 3 -2.4" stroke="{acc}" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '<path d="M11 35.4 h16 q3 0 3 -2.4" stroke="{lit}" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '<path d="M16 34 v-12 M24 34 v-12" stroke="{ink}" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path d="M14.5 24 h3 M22.5 24 h3" stroke="{ink}" stroke-width="1.6" stroke-linecap="round"/>';

  M.snowman = ground(9) +
    '<circle cx="20" cy="33.5" r="6.5" fill="{lit}"/>' +
    '<circle cx="20" cy="24" r="4.8" fill="{lit}"/>' +
    '<circle cx="20" cy="17" r="3.4" fill="{lit}"/>' +
    '<path d="M16.8 15.6 h6.4 M20 14.2 v-2.4" stroke="{ink}" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="18.8" cy="16.4" r="0.6" fill="{ink}"/><circle cx="21.2" cy="16.4" r="0.6" fill="{ink}"/>' +
    '<path d="M23.4 17.4 l3 0.8" stroke="{acc}" stroke-width="1.4" stroke-linecap="round"/>' +
    '<path d="M15.4 23 l-4.4 -3 M24.6 23 l4.4 -3" stroke="{ink}" stroke-width="1.4" stroke-linecap="round"/>';

  M.iceskates = ground(10) +
    '<path d="M12 39 h9 q2 0 2 -1.6" stroke="{lit}" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
    '<path d="M13 36.6 q-1 -6 0.6 -9.4 h5 q1.4 3.4 0.6 9.4z" fill="{ink}"/>' +
    '<path d="M21 39 h9" stroke="{lit}" stroke-width="1.8" stroke-linecap="round"/>' +
    '<path d="M22 36.6 q-1 -6 0.6 -9.4 h5 q1.4 3.4 0.6 9.4z" fill="{acc}"/>';

  M.cocoa = ground(9) +
    '<path d="M12 26 h13 v9 a4.5 4.5 0 0 1 -4.5 4.5 h-4 a4.5 4.5 0 0 1 -4.5 -4.5z" fill="{lit}"/>' +
    '<path d="M25 28.5 h2.5 a3 3 0 0 1 0 6 H25" stroke="{lit}" stroke-width="1.8" fill="none"/>' +
    '<path d="M12.6 27.6 h11.8 v2.4 h-11.8z" fill="{acc}"/>' +
    '<path d="M16 22 q-1.4 -2 0 -4 M20.5 21 q-1.4 -2.4 0 -4.6" stroke="{lit}" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.8"/>';

  M.snowballfight = couple(0, 1) +
    '<circle cx="31" cy="22" r="2.4" fill="{lit}"/>' +
    '<circle cx="8.5" cy="27" r="1.8" fill="{lit}"/>' +
    '<path d="M26 24 q3 -3 6 -2" stroke="{lit}" stroke-width="1.1" fill="none" opacity="0.7" stroke-dasharray="1.5 2"/>';

  M.snowboard = ground(9) +
    '<g transform="rotate(-24 20 28)">' +
    '<rect x="15.5" y="12" width="9" height="30" rx="4.5" fill="{acc}"/>' +
    '<rect x="17.6" y="20" width="4.8" height="2.4" rx="1.2" fill="{ink}"/>' +
    '<rect x="17.6" y="29" width="4.8" height="2.4" rx="1.2" fill="{ink}"/></g>';

  /* ---------------- Water ---------------- */
  M.canoe = '<path d="M4 33 q16 5 32 0 q-3 6 -16 6 T4 33z" fill="{ink}"/>' +
    '<circle cx="16" cy="27" r="2.3" fill="{ink}"/><circle cx="25" cy="27" r="2.3" fill="{ink}"/>' +
    '<path d="M13 30 l-6 -5 M28 30 l6 -5" stroke="{ink}" stroke-width="1.5" stroke-linecap="round"/>' +
    '<path d="M2 38 q6 -1.6 10 0 t10 0 t10 0" stroke="{lit}" stroke-width="1.2" fill="none" opacity="0.65"/>';

  M.sailboat = '<path d="M5 34 q15 4 30 0 q-4 5.5 -15 5.5 T5 34z" fill="{ink}"/>' +
    '<path d="M20 32 V9 l11 21z" fill="{lit}"/>' +
    '<path d="M18.4 32 V13 L9 32z" fill="{acc}"/>' +
    '<path d="M3 38.5 q6 -1.6 10 0 t10 0 t11 0" stroke="{lit}" stroke-width="1.2" fill="none" opacity="0.6"/>';

  M.paddleboard = '<path d="M5 35 q15 3.5 30 0 q-3 3.6 -15 3.6 T5 35z" fill="{lit}"/>' +
    '<circle cx="20" cy="20" r="2.6" fill="{ink}"/>' +
    '<path d="M20 23 q-3 0.6 -3.2 4 L16 34.5 h8 l-0.8 -7.5 q-0.2 -3.4 -3.2 -4z" fill="{ink}"/>' +
    '<path d="M27 14 v20" stroke="{ink}" stroke-width="1.5" stroke-linecap="round"/>' +
    '<path d="M25.6 34 h3" stroke="{ink}" stroke-width="1.8" stroke-linecap="round"/>';

  M.swimming = '<path d="M2 32 q6 -2.4 10 0 t10 0 t10 0 t6 0" stroke="{lit}" stroke-width="1.6" fill="none" opacity="0.8"/>' +
    '<path d="M2 37 q6 -2.4 10 0 t10 0 t10 0 t6 0" stroke="{lit}" stroke-width="1.6" fill="none" opacity="0.6"/>' +
    '<circle cx="17" cy="27" r="2.6" fill="{ink}"/>' +
    '<path d="M19.5 29 q5 -1 8 -4" stroke="{ink}" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '<path d="M14.5 29 q-4 0 -6 2" stroke="{ink}" stroke-width="2" fill="none" stroke-linecap="round"/>';

  M.fishing = ground(10) +
    '<circle cx="14" cy="23" r="2.5" fill="{ink}"/>' +
    '<path d="M14 26 q-3.2 0.6 -3.4 4.2 L10 40 h8 l-0.6 -9.8 q-0.2 -3.6 -3.4 -4.2z" fill="{ink}"/>' +
    '<path d="M16 27 L33 15" stroke="{ink}" stroke-width="1.5" stroke-linecap="round"/>' +
    '<path d="M33 15 q1.5 9 -2 14" stroke="{lit}" stroke-width="1" fill="none" opacity="0.8"/>' +
    '<path d="M29.4 30 q2.6 -2 5 0 q-2.4 2.2 -5 0z" fill="{acc}"/>';

  M.beach = ground(11) +
    '<path d="M20 38 V20" stroke="{ink}" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path d="M6 21 a14 9 0 0 1 28 0z" fill="{acc}"/>' +
    '<path d="M13 21 a7 9 0 0 1 14 0z" fill="{lit}" opacity="0.55"/>' +
    '<path d="M25 38 q4 -3 8 -0.5" stroke="{lit}" stroke-width="1.4" fill="none" opacity="0.7"/>';

  M.waterfall = '<path d="M6 40 V22 h9 v18z" fill="{ink}" opacity="0.85"/>' +
    '<path d="M25 40 V17 h9 v23z" fill="{ink}" opacity="0.85"/>' +
    '<path d="M16 21 h8 v16 h-8z" fill="{lit}" opacity="0.9"/>' +
    '<path d="M18 23 v12 M21.6 24 v11" stroke="{sky}" stroke-width="1" opacity="0.5"/>' +
    '<path d="M12 38 q8 -2.4 16 0" stroke="{lit}" stroke-width="1.4" fill="none" opacity="0.7"/>';

  M.hotspring = '<path d="M6 40 q0 -8 14 -8 t14 8z" fill="{lit}" opacity="0.75"/>' +
    '<path d="M14 30 q-2 -3.4 0 -6.4 t0 -6" stroke="{lit}" stroke-width="1.5" fill="none" opacity="0.8" stroke-linecap="round"/>' +
    '<path d="M20 29 q-2 -3.4 0 -6.4 t0 -6" stroke="{lit}" stroke-width="1.5" fill="none" opacity="0.7" stroke-linecap="round"/>' +
    '<path d="M26 30 q-2 -3.4 0 -6.4 t0 -6" stroke="{lit}" stroke-width="1.5" fill="none" opacity="0.8" stroke-linecap="round"/>' +
    '<path d="M4 40 q10 -4 16 -4 t16 4z" fill="{ink}" opacity="0.25"/>';

  /* ---------------- Hiking, camping, nature ---------------- */
  M.tent = ground(12) +
    '<path d="M20 15 L34 39 H6z" fill="{ink}"/>' +
    '<path d="M20 15 L26.5 39 h-13z" fill="{acc}"/>' +
    '<path d="M20 22 L24 39 h-8z" fill="{sky}" opacity="0.55"/>' +
    '<path d="M20 13.5 v-3" stroke="{ink}" stroke-width="1.4" stroke-linecap="round"/>';

  M.campfire = ground(10) +
    '<path d="M8 37 l24 -4 M32 37 l-24 -4" stroke="{ink}" stroke-width="2.2" stroke-linecap="round"/>' +
    '<path d="M20 12 q6 6 5.4 11.4 Q24.8 30 20 31.6 15.2 30 14.6 23.4 14 18 20 12z" fill="{acc}"/>' +
    '<path d="M20 20 q2.8 3.4 2.4 6.2 -0.4 2.6 -2.4 3.2 -2 -0.6 -2.4 -3.2 -0.4 -2.8 2.4 -6.2z" fill="{lit}"/>';

  M.backpack = ground(9) +
    '<path d="M12 18 a8 8 0 0 1 16 0 v16 a4 4 0 0 1 -4 4 h-8 a4 4 0 0 1 -4 -4z" fill="{ink}"/>' +
    '<path d="M14.5 24 h11 v7 h-11z" fill="{acc}"/>' +
    '<path d="M17 18 v-2.5 a3 3 0 0 1 6 0 V18" stroke="{lit}" stroke-width="1.4" fill="none"/>';

  M.binoculars = '<rect x="7" y="18" width="10" height="18" rx="4.4" fill="{ink}"/>' +
    '<rect x="23" y="18" width="10" height="18" rx="4.4" fill="{ink}"/>' +
    '<rect x="16" y="22" width="8" height="4" rx="1.6" fill="{ink}"/>' +
    '<circle cx="12" cy="32" r="2.6" fill="{lit}" opacity="0.85"/>' +
    '<circle cx="28" cy="32" r="2.6" fill="{lit}" opacity="0.85"/>' +
    '<rect x="8.4" y="15" width="7.2" height="3.6" rx="1.6" fill="{acc}"/>' +
    '<rect x="24.4" y="15" width="7.2" height="3.6" rx="1.6" fill="{acc}"/>';

  M.summit = '<path d="M2 40 L16 14 l7 12 4 -6 11 20z" fill="{ink}"/>' +
    '<path d="M16 14 l4.2 7.6 h-8.4z" fill="{lit}"/>' +
    '<path d="M27 20 v-9" stroke="{ink}" stroke-width="1.4" stroke-linecap="round"/>' +
    '<path d="M27 11 l7 2.4 -7 2.6z" fill="{acc}"/>';

  M.trailsign = ground(8) +
    '<path d="M19 39 V14" stroke="{ink}" stroke-width="2.4" stroke-linecap="round"/>' +
    '<path d="M19 15 h13 l-3 3 3 3 H19z" fill="{acc}"/>' +
    '<path d="M19 24 H7 l3 3 -3 3 h12z" fill="{ink}"/>';

  M.wildflowers = ground(11) +
    '<path d="M12 39 V28 M20 39 V24 M28 39 V29" stroke="{ink}" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="12" cy="26" r="3" fill="{acc}"/><circle cx="20" cy="22" r="3.4" fill="{lit}"/>' +
    '<circle cx="28" cy="27" r="2.8" fill="{acc}"/>' +
    '<circle cx="12" cy="26" r="1" fill="{ink}"/><circle cx="20" cy="22" r="1.1" fill="{ink}"/>';

  /* ---------------- Outdoor adventure ---------------- */
  M.climbing = '<path d="M30 40 V6 h8 v34z" fill="{ink}" opacity="0.9"/>' +
    '<circle cx="24" cy="18" r="2.6" fill="{ink}"/>' +
    '<path d="M24 21 q-3.4 1 -3.6 4.6 L20 34 h7.6 l-0.4 -8.4 Q27 22 24 21z" fill="{ink}"/>' +
    '<path d="M27 24 l3.4 -3 M21 27 l-3.4 3 M25 34 l-2 5 M27 34 l3 4" stroke="{ink}" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="31.5" cy="14" r="1.4" fill="{acc}"/><circle cx="31.5" cy="26" r="1.4" fill="{acc}"/>';

  M.bike = '<circle cx="10" cy="31" r="7.2" fill="none" stroke="{ink}" stroke-width="2"/>' +
    '<circle cx="30" cy="31" r="7.2" fill="none" stroke="{ink}" stroke-width="2"/>' +
    '<path d="M10 31 L17 19 h7 l6 12 M17 31 h9 M24 19 l3 12" stroke="{ink}" stroke-width="1.8" fill="none" stroke-linejoin="round"/>' +
    '<path d="M14.5 19.5 h5" stroke="{acc}" stroke-width="1.8" stroke-linecap="round"/>';

  M.balloon = '<path d="M20 4 q11 0 11 11 Q31 23 20 30 9 23 9 15 9 4 20 4z" fill="{acc}"/>' +
    '<path d="M20 4 q4.4 0 6.6 5 -1.6 12 -6.6 21 -5 -9 -6.6 -21 Q15.6 4 20 4z" fill="{lit}" opacity="0.7"/>' +
    '<path d="M16.6 29 l1.6 5 M23.4 29 l-1.6 5" stroke="{ink}" stroke-width="1.1"/>' +
    '<rect x="16.6" y="33.6" width="6.8" height="5" rx="1.4" fill="{ink}"/>';

  M.horse = ground(11) +
    '<path d="M8 38 V26 q0 -6 7 -6 h9 l4 -7 3 1 -1.4 7.4 Q33 23 33 28 v10 h-3.4 v-7 h-4.6 v7 h-3.4 v-7 h-6 v7z" fill="{ink}"/>' +
    '<path d="M28.6 15.4 l2.4 -3" stroke="{ink}" stroke-width="1.4" stroke-linecap="round"/>';

  M.skydive = '<path d="M6 16 a14 10 0 0 1 28 0z" fill="{acc}"/>' +
    '<path d="M15 16 a5 10 0 0 1 10 0z" fill="{lit}" opacity="0.6"/>' +
    '<path d="M7 16 l10 10 M20 16 v10 M33 16 l-10 10" stroke="{ink}" stroke-width="1" opacity="0.8"/>' +
    '<circle cx="20" cy="29" r="2.6" fill="{ink}"/>' +
    '<path d="M20 32 q-3 0.6 -3 4 l-0.6 4 h7.2 l-0.6 -4 q0 -3.4 -3 -4z" fill="{ink}"/>';

  M.zipline = '<path d="M2 12 L38 24" stroke="{ink}" stroke-width="1.5"/>' +
    '<path d="M18 19 v4" stroke="{ink}" stroke-width="1.6"/>' +
    '<circle cx="18" cy="26" r="2.6" fill="{ink}"/>' +
    '<path d="M18 29 q-3.2 0.6 -3.4 4 L14 39 h8 l-0.6 -6 q-0.2 -3.4 -3.4 -4z" fill="{ink}"/>' +
    '<path d="M15.5 27 l-4 -5 M20.5 27 l4 -4" stroke="{ink}" stroke-width="1.4" stroke-linecap="round"/>';

  /* ---------------- Sports & rec ---------------- */
  M.basketball = ground(8) +
    '<circle cx="20" cy="25" r="10" fill="{acc}"/>' +
    '<path d="M10 25 h20 M20 15 v20 M12.4 18.4 q7.6 6.6 15.2 0 M12.4 31.6 q7.6 -6.6 15.2 0" stroke="{ink}" stroke-width="1.3" fill="none"/>';

  M.bowling = ground(11) +
    '<path d="M16 39 q-2.6 -8 0 -14 1 -4 4 -4 t4 4 q2.6 6 0 14z" fill="{lit}"/>' +
    '<path d="M18.6 26 h2.8" stroke="{acc}" stroke-width="2"/>' +
    '<circle cx="31" cy="33" r="6" fill="{ink}"/>' +
    '<circle cx="29.6" cy="30.6" r="0.9" fill="{lit}"/><circle cx="32.4" cy="31.4" r="0.9" fill="{lit}"/>' +
    '<circle cx="31" cy="34" r="0.9" fill="{lit}"/>';

  M.golf = ground(10) +
    '<path d="M26 38 V10" stroke="{ink}" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path d="M26 11 l9 3.4 -9 3.4z" fill="{acc}"/>' +
    '<circle cx="12" cy="36" r="3" fill="{lit}"/>' +
    '<path d="M6 38 q6 -2 12 0" stroke="{ink}" stroke-width="1.2" fill="none" opacity="0.5"/>';

  M.tennis = ground(9) +
    '<g transform="rotate(-30 20 24)">' +
    '<ellipse cx="20" cy="18" rx="8" ry="10" fill="none" stroke="{ink}" stroke-width="2.2"/>' +
    '<path d="M14 12 h12 M14 18 h12 M14 24 h12 M17 9 v18 M23 9 v18" stroke="{ink}" stroke-width="0.8" opacity="0.7"/>' +
    '<path d="M20 28 v11" stroke="{ink}" stroke-width="2.4" stroke-linecap="round"/></g>' +
    '<circle cx="32" cy="16" r="3.2" fill="{acc}"/>';

  M.soccer = ground(8) +
    '<circle cx="20" cy="26" r="10" fill="{lit}"/>' +
    '<path d="M20 20 l5 3.6 -2 6h-6l-2 -6z" fill="{ink}"/>' +
    '<path d="M20 16 v-4 M28.6 22 l3.6 -1.6 M11.4 22 l-3.6 -1.6 M15 34.4 l-1.6 3.4 M25 34.4 l1.6 3.4" stroke="{ink}" stroke-width="1.2"/>';

  M.minigolf = ground(11) +
    '<path d="M4 38 q16 -6 32 0z" fill="{ink}" opacity="0.5"/>' +
    '<circle cx="24" cy="33.6" r="2.6" fill="{ink}"/>' +
    '<circle cx="13" cy="34.4" r="2.2" fill="{lit}"/>' +
    '<path d="M24 33 V17" stroke="{ink}" stroke-width="1.4"/>' +
    '<path d="M24 17 l7 2.6 -7 2.6z" fill="{acc}"/>' +
    '<path d="M8 31 q3 3 8 3" stroke="{lit}" stroke-width="1" fill="none" opacity="0.6" stroke-dasharray="1.5 2"/>';

  M.pingpong = '<g transform="rotate(20 20 24)">' +
    '<ellipse cx="18" cy="20" rx="8.4" ry="9.4" fill="{acc}"/>' +
    '<path d="M18 29.4 q-1.4 8 0.6 10.4" stroke="{ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>' +
    '<circle cx="32" cy="14" r="2.6" fill="{lit}"/>';

  M.frisbee = ground(10) +
    '<ellipse cx="22" cy="20" rx="11" ry="3.6" fill="{acc}"/>' +
    '<ellipse cx="22" cy="19" rx="11" ry="3.6" fill="{lit}" opacity="0.65"/>' +
    '<path d="M4 26 q6 -5 12 -6" stroke="{lit}" stroke-width="1.1" fill="none" opacity="0.6" stroke-dasharray="2 2.4"/>';

  M.skateboard = ground(11) +
    '<path d="M5 31 q15 4 30 0 l1 2.6 q-16 4.4 -32 0z" fill="{acc}"/>' +
    '<circle cx="12" cy="37" r="2.6" fill="{ink}"/><circle cx="28" cy="37" r="2.6" fill="{ink}"/>' +
    '<path d="M12 34.6 v-1.4 M28 34.6 v-1.4" stroke="{ink}" stroke-width="1.6"/>';

  M.arcade = ground(11) +
    '<path d="M9 39 V15 a4 4 0 0 1 4 -4 h14 a4 4 0 0 1 4 4 v24z" fill="{ink}"/>' +
    '<rect x="12.6" y="15" width="14.8" height="10" rx="1.6" fill="{sky}" opacity="0.6"/>' +
    '<circle cx="16" cy="30" r="2" fill="{acc}"/>' +
    '<circle cx="22" cy="30" r="1.5" fill="{lit}"/><circle cx="26" cy="30" r="1.5" fill="{lit}"/>';

  M.gym = ground(12) +
    '<path d="M6 22 h4 v12 h-4z M30 22 h4 v12 h-4z" fill="{ink}"/>' +
    '<path d="M10 25 h5 v6 h-5z M25 25 h5 v6 h-5z" fill="{ink}"/>' +
    '<path d="M15 27 h10 v2 h-10z" fill="{acc}"/>';

  /* ---------------- Food & cooking ---------------- */
  M.cooking = ground(11) +
    '<path d="M8 26 h24 v7 a6 6 0 0 1 -6 6 H14 a6 6 0 0 1 -6 -6z" fill="{ink}"/>' +
    '<path d="M6 26 h28" stroke="{ink}" stroke-width="2.2" stroke-linecap="round"/>' +
    '<path d="M14 22 q-1.6 -3 0 -5.4 M20 21 q-1.6 -3.4 0 -6 M26 22 q-1.6 -3 0 -5.4" stroke="{lit}" stroke-width="1.3" fill="none" opacity="0.75" stroke-linecap="round"/>';

  M.pizza = '<path d="M20 6 L37 36 q-17 6 -34 0z" fill="{acc}"/>' +
    '<path d="M20 11 L33 34 q-13 4.4 -26 0z" fill="{lit}" opacity="0.5"/>' +
    '<circle cx="20" cy="22" r="2.2" fill="{ink}"/><circle cx="14" cy="30" r="2" fill="{ink}"/>' +
    '<circle cx="26" cy="29" r="2" fill="{ink}"/>';

  M.bbq = ground(11) +
    '<path d="M7 22 h26 l-3 9 H10z" fill="{ink}"/>' +
    '<path d="M10 31 l-3 8 M30 31 l3 8" stroke="{ink}" stroke-width="1.8" stroke-linecap="round"/>' +
    '<path d="M9 21 h22" stroke="{lit}" stroke-width="1.4"/>' +
    '<path d="M15 17 q-1.4 -3 0 -5 M20 16 q-1.4 -3.4 0 -5.6 M25 17 q-1.4 -3 0 -5" stroke="{acc}" stroke-width="1.4" fill="none" stroke-linecap="round"/>';

  M.baking = ground(10) +
    '<path d="M11 38 q-1 -10 9 -10 t9 10z" fill="{lit}"/>' +
    '<path d="M11 33 h18" stroke="{acc}" stroke-width="1.6"/>' +
    '<path d="M20 28 v-5" stroke="{ink}" stroke-width="1.4"/>' +
    '<circle cx="20" cy="21" r="2.4" fill="{acc}"/>';

  M.icecream = ground(7) +
    '<path d="M13 22 h14 l-7 17z" fill="{acc}"/>' +
    '<circle cx="15.6" cy="19" r="4.4" fill="{lit}"/>' +
    '<circle cx="24.4" cy="19" r="4.4" fill="{lit}"/>' +
    '<circle cx="20" cy="14.4" r="4.6" fill="{lit}"/>' +
    '<circle cx="20" cy="9.4" r="1.6" fill="{ink}"/>';

  M.coffee = ground(9) +
    '<path d="M11 24 h16 v8 a6 6 0 0 1 -6 6 h-4 a6 6 0 0 1 -6 -6z" fill="{lit}"/>' +
    '<path d="M27 26.4 h2.6 a3.2 3.2 0 0 1 0 6.4 H27" stroke="{lit}" stroke-width="1.8" fill="none"/>' +
    '<path d="M11.6 25.4 h14.8 v2.6 H11.6z" fill="{ink}"/>' +
    '<path d="M16 20 q-1.4 -2.4 0 -4.6 M21 19.4 q-1.4 -2.6 0 -5" stroke="{lit}" stroke-width="1.3" fill="none" opacity="0.75" stroke-linecap="round"/>';

  M.donut = '<circle cx="20" cy="25" r="13" fill="{acc}"/>' +
    '<circle cx="20" cy="25" r="4.4" fill="{sky}"/>' +
    '<path d="M7.6 22 q5 3 12.4 3 t12.4 -3 q0.6 2.4 0 4 -5 3 -12.4 3 T7.6 26z" fill="{lit}"/>' +
    '<path d="M13 20 l1.6 2 M24 19.6 l-1 2.2 M27.6 26 l2 1" stroke="{ink}" stroke-width="1.1" stroke-linecap="round"/>';

  M.taco = '<path d="M5 36 a15 15 0 0 1 30 0z" fill="{acc}"/>' +
    '<path d="M8 33 a12 12 0 0 1 24 0z" fill="{lit}" opacity="0.6"/>' +
    '<circle cx="14" cy="30" r="1.8" fill="{ink}"/><circle cx="20" cy="27.6" r="1.8" fill="{ink}"/>' +
    '<circle cx="26" cy="30" r="1.8" fill="{ink}"/>' +
    '<path d="M4 36 h32" stroke="{ink}" stroke-width="1.6" stroke-linecap="round"/>';

  M.spicy = ground(7) +
    '<path d="M22 12 q6 0 7.4 6 Q31 28 24 35 q-5 4.6 -9 2.4 -3 -2 -0.6 -5.6 6 -9 6.6 -18z" fill="{acc}"/>' +
    '<path d="M22 12 q-2.4 -3.4 -6 -2.6" stroke="{ink}" stroke-width="1.8" fill="none" stroke-linecap="round"/>';

  /* ---------------- Arts & crafts ---------------- */
  M.painting = ground(10) +
    '<path d="M20 34 V14" stroke="{ink}" stroke-width="1.6"/>' +
    '<path d="M13 39 l7 -8 7 8" stroke="{ink}" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
    '<rect x="9" y="9" width="22" height="17" rx="1.6" fill="{lit}"/>' +
    '<path d="M11 24 l6 -8 5 5 4 -4 3 7z" fill="{acc}"/>' +
    '<circle cx="15" cy="14" r="1.8" fill="{acc}"/>';

  M.pottery = ground(11) +
    '<path d="M6 38 h28 v2 H6z" fill="{ink}"/>' +
    '<ellipse cx="20" cy="34" rx="12" ry="3.4" fill="{ink}" opacity="0.8"/>' +
    '<path d="M14 33 q-1.6 -8 2 -10 -3 -4 2 -6 t2 6 q3.6 2 2 10z" fill="{acc}"/>' +
    '<path d="M11 24 q4 -3 5 -1 M29 24 q-4 -3 -5 -1" stroke="{ink}" stroke-width="1.5" fill="none" stroke-linecap="round"/>';

  M.knitting = ground(10) +
    '<circle cx="18" cy="30" r="8.4" fill="{acc}"/>' +
    '<path d="M11 27 q7 -4 14 1 M10.6 32 q8 -5 15 -1 M13 36.4 q6 -4.4 12 -2.4" stroke="{ink}" stroke-width="1" fill="none" opacity="0.6"/>' +
    '<path d="M22 26 L34 12 M25 28 L37 15" stroke="{ink}" stroke-width="1.5" stroke-linecap="round"/>';

  M.camera = ground(10) +
    '<path d="M6 19 h6 l2.4 -3.4h11.2L28 19h6a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2H6a2 2 0 0 1 -2 -2V21a2 2 0 0 1 2 -2z" fill="{ink}"/>' +
    '<circle cx="20" cy="28" r="7" fill="{lit}" opacity="0.25"/>' +
    '<circle cx="20" cy="28" r="4.6" fill="{acc}"/>' +
    '<circle cx="31" cy="22.6" r="1.4" fill="{lit}"/>';

  M.sewing = ground(11) +
    '<path d="M6 39 h28 v-4 H6z" fill="{ink}"/>' +
    '<path d="M8 35 V20 h6 v9 h12 V14 h6 v21z" fill="{ink}"/>' +
    '<path d="M26 20 v8" stroke="{acc}" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path d="M12 31 q8 4 16 0" stroke="{lit}" stroke-width="1" fill="none" opacity="0.6" stroke-dasharray="2 2"/>';

  M.candles = ground(10) +
    '<rect x="9" y="24" width="6" height="15" rx="1.4" fill="{lit}"/>' +
    '<rect x="18" y="19" width="6" height="20" rx="1.4" fill="{lit}"/>' +
    '<rect x="27" y="27" width="6" height="12" rx="1.4" fill="{lit}"/>' +
    '<path d="M12 23 q-2 -3 0 -5 2 2 0 5z M21 18 q-2 -3.4 0 -5.6 2 2.2 0 5.6z M30 26 q-2 -3 0 -5 2 2 0 5z" fill="{acc}"/>';

  M.jewelry = ground(8) +
    '<path d="M20 12 a11 11 0 0 1 0 22 a11 11 0 0 1 0 -22z" fill="none" stroke="{ink}" stroke-width="2.2"/>' +
    '<path d="M14 21 h12 l-6 9z" fill="{acc}"/>' +
    '<path d="M14 21 l3 -4h6l3 4" fill="{lit}" opacity="0.8"/>';

  /* ---------------- Silly & goofy ---------------- */
  M.partypopper = ground(9) +
    '<path d="M8 38 L24 18 l6 6z" fill="{acc}"/>' +
    '<path d="M28 12 l2 3 M33 16 l3.4 -1 M31 22 l4 2" stroke="{ink}" stroke-width="1.4" stroke-linecap="round"/>' +
    '<circle cx="14" cy="24" r="1.6" fill="{lit}"/><circle cx="22" cy="12" r="1.6" fill="{lit}"/>' +
    '<circle cx="30" cy="30" r="1.6" fill="{lit}"/><circle cx="9" cy="16" r="1.4" fill="{acc}"/>';

  M.rubberduck = ground(10) +
    '<path d="M10 38 q-3 -8 4 -11 1 -8 8 -8 t7 8 q1 1.6 0 3 5 3 4 8z" fill="{acc}"/>' +
    '<circle cx="24" cy="17.6" r="1.2" fill="{ink}"/>' +
    '<path d="M28.6 20 l5 1.6 -5 1.8z" fill="{lit}"/>';

  M.waterballoon = ground(9) +
    '<path d="M20 14 q9 5 9 13 a9 9 0 0 1 -18 0 q0 -8 9 -13z" fill="{acc}"/>' +
    '<path d="M18.6 13 h2.8 l-1.4 -3z" fill="{ink}"/>' +
    '<ellipse cx="16" cy="26" rx="2.2" ry="3" fill="{lit}" opacity="0.55"/>';

  M.karaoke = ground(8) +
    '<rect x="16.6" y="8" width="6.8" height="14" rx="3.4" fill="{ink}"/>' +
    '<path d="M13 19 a7 7 0 0 0 14 0" stroke="{ink}" stroke-width="1.8" fill="none"/>' +
    '<path d="M20 26 v8" stroke="{ink}" stroke-width="1.8"/>' +
    '<path d="M14 39 h12" stroke="{ink}" stroke-width="2.4" stroke-linecap="round"/>' +
    '<path d="M30 12 q3 4 0 8 M33.6 9 q5 7 0 14" stroke="{acc}" stroke-width="1.4" fill="none" stroke-linecap="round"/>';

  M.costume = ground(10) +
    '<path d="M6 22 q6 -6 14 -6 t14 6 q-4 3 -8 2 -2 5 -6 5 t-6 -5 q-4 1 -8 -2z" fill="{ink}"/>' +
    '<circle cx="15" cy="21.6" r="2" fill="{lit}"/><circle cx="25" cy="21.6" r="2" fill="{lit}"/>' +
    '<path d="M14 30 q6 5 12 0" stroke="{ink}" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
    '<path d="M20 16 v-5" stroke="{acc}" stroke-width="1.6" stroke-linecap="round"/>';

  /* ---------------- Shopping & city ---------------- */
  M.shopping = ground(10) +
    '<path d="M10 18 h20 l-2.4 21H12.4z" fill="{ink}"/>' +
    '<path d="M15.6 18 v-3 a4.4 4.4 0 0 1 8.8 0 v3" stroke="{lit}" stroke-width="1.6" fill="none"/>' +
    '<path d="M13 24 h14" stroke="{acc}" stroke-width="1.8"/>';

  M.storefront = '<path d="M6 39 V18 h28 v21z" fill="{ink}"/>' +
    '<path d="M4 18 l4 -7h24l4 7z" fill="{acc}"/>' +
    '<rect x="16" y="26" width="8" height="13" fill="{sky}" opacity="0.5"/>' +
    '<rect x="9" y="22" width="5" height="5" fill="{lit}" opacity="0.6"/>' +
    '<rect x="26" y="22" width="5" height="5" fill="{lit}" opacity="0.6"/>';

  M.photobooth = '<path d="M9 39 V10 h22 v29z" fill="{ink}"/>' +
    '<rect x="12.6" y="14" width="14.8" height="11" rx="1.4" fill="{lit}" opacity="0.4"/>' +
    '<circle cx="20" cy="19.6" r="3" fill="{acc}"/>' +
    '<path d="M12.6 29 h14.8 v8 H12.6z" fill="{sky}" opacity="0.45"/>';

  M.museum = '<path d="M4 39 h32 v-3 H4z" fill="{ink}"/>' +
    '<path d="M8 36 V19 h3.4 v17z M17 36 V19 h3.4 v17z M26 36 V19 h3.4 v17z" fill="{ink}"/>' +
    '<path d="M4 19 L20 8 l16 11z" fill="{acc}"/>';

  M.market = ground(12) +
    '<path d="M6 20 h28 v3 H6z" fill="{ink}"/>' +
    '<path d="M6 23 l3 6 h22 l3 -6z" fill="{acc}"/>' +
    '<path d="M9 29 h22 v10 H9z" fill="{ink}"/>' +
    '<circle cx="15" cy="33.6" r="2.2" fill="{acc}"/><circle cx="21" cy="33.6" r="2.2" fill="{lit}"/>' +
    '<circle cx="27" cy="33.6" r="2.2" fill="{acc}"/>';

  /* ---------------- Screens & stage ---------------- */
  M.movie = ground(11) +
    '<path d="M6 20 h28 v17 H6z" fill="{ink}"/>' +
    '<path d="M6 14.4 l27 -4 1 5.4 -27 4z" fill="{lit}"/>' +
    '<path d="M11 11 l2.4 4.6 M18 10 l2.4 4.6 M25 9 l2.4 4.6" stroke="{ink}" stroke-width="1.2"/>' +
    '<path d="M9 23 h22 v11 H9z" fill="{sky}" opacity="0.4"/>';

  M.popcorn = ground(9) +
    '<path d="M11 21 h18 l-2.4 18H13.4z" fill="{lit}"/>' +
    '<path d="M13.4 21 l1 18 M20 21 v18 M26.6 21 l-1 18" stroke="{acc}" stroke-width="2"/>' +
    '<circle cx="14" cy="18" r="3.4" fill="{lit}"/><circle cx="20" cy="15.6" r="3.8" fill="{lit}"/>' +
    '<circle cx="26" cy="18" r="3.4" fill="{lit}"/>';

  M.drivein = '<path d="M5 8 h30 v20 H5z" fill="{lit}" opacity="0.85"/>' +
    '<path d="M5 8 h30 v20 H5z" fill="none" stroke="{ink}" stroke-width="1.6"/>' +
    '<path d="M8 38 q0 -6 6 -6 h12 q6 0 6 6z" fill="{ink}"/>' +
    '<circle cx="13" cy="38" r="2.4" fill="{ink}"/><circle cx="27" cy="38" r="2.4" fill="{ink}"/>' +
    '<path d="M13 32 l2.4 -4 h9 l2.4 4z" fill="{ink}" opacity="0.7"/>';

  M.concert = '<path d="M4 39 h32 v-5 H4z" fill="{ink}"/>' +
    '<path d="M10 6 l4 28 M20 4 v30 M30 6 l-4 28" stroke="{acc}" stroke-width="1.2" opacity="0.4"/>' +
    '<circle cx="14" cy="27" r="2.2" fill="{ink}"/><circle cx="20" cy="26" r="2.2" fill="{ink}"/>' +
    '<circle cx="26" cy="27" r="2.2" fill="{ink}"/>' +
    '<path d="M14 29.4 v5 M20 28.4 v6 M26 29.4 v5" stroke="{ink}" stroke-width="2.4" stroke-linecap="round"/>';

  M.guitar = '<g transform="rotate(-18 20 24)">' +
    '<path d="M20 30 q-8 0 -8 -5.6 0 -4 4 -4.6 -2.4 -3.4 0 -6 2 -2 4 -0.6 2 -1.4 4 0.6 2.4 2.6 0 6 4 0.6 4 4.6 0 5.6 -8 5.6z" fill="{ink}"/>' +
    '<circle cx="20" cy="24.4" r="2.6" fill="{acc}"/>' +
    '<path d="M20 14 V4" stroke="{ink}" stroke-width="2"/>' +
    '<rect x="17.6" y="1" width="4.8" height="4" rx="1" fill="{ink}"/></g>';

  M.discoball = '<path d="M20 4 v5" stroke="{ink}" stroke-width="1.4"/>' +
    '<circle cx="20" cy="19" r="10" fill="{lit}" opacity="0.9"/>' +
    '<path d="M10 19 h20 M12 13 h16 M12 25 h16 M20 9 v20 M14.4 10 v18 M25.6 10 v18" stroke="{ink}" stroke-width="0.9" opacity="0.65"/>' +
    '<path d="M8 32 l4 -5 M20 34 v-5 M32 32 l-4 -5" stroke="{acc}" stroke-width="1.3" opacity="0.7" stroke-linecap="round"/>';

  M.dancing = '<circle cx="13" cy="15" r="2.8" fill="{ink}"/>' +
    '<path d="M13 18 q-4 1 -4 5 l-1 8 3 0.6 1.6 -6 2.4 6.6 3 -1z" fill="{ink}"/>' +
    '<circle cx="27" cy="14" r="2.8" fill="{ink}"/>' +
    '<path d="M27 17 q4 1 4 5 l-3 9 -3 -1 1 -6 -4 6 -2.6 -1.6z" fill="{ink}"/>' +
    '<path d="M16 22 h8" stroke="{ink}" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path d="M6 38 h28" stroke="{ink}" stroke-width="1.6" opacity="0.4" stroke-linecap="round"/>';

  /* ---------------- Picnics, parks, romance ---------------- */
  M.picnic = '<path d="M4 34 h32 v6 H4z" fill="{acc}" opacity="0.9"/>' +
    '<path d="M4 34 h32 v6 H4z" fill="none" stroke="{ink}" stroke-width="0.8" opacity="0.4"/>' +
    '<path d="M12 34 v6 M20 34 v6 M28 34 v6" stroke="{lit}" stroke-width="1.4" opacity="0.5"/>' +
    '<path d="M14 33 v-7 a6 6 0 0 1 12 0 v7z" fill="{ink}"/>' +
    '<path d="M16.5 26 a3.5 3.5 0 0 1 7 0" stroke="{lit}" stroke-width="1.4" fill="none"/>';

  M.parkbench = ground(12) +
    '<path d="M7 24 h26 v3 H7z M7 30 h26 v3 H7z" fill="{ink}"/>' +
    '<path d="M9 22 v17 M31 22 v17" stroke="{ink}" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M6 36 h28" stroke="{ink}" stroke-width="2.2" stroke-linecap="round"/>';

  M.kite = '<path d="M22 6 L32 18 22 30 12 18z" fill="{acc}"/>' +
    '<path d="M22 6 V30 M12 18 h20" stroke="{ink}" stroke-width="0.9" opacity="0.6"/>' +
    '<path d="M22 30 q-3 5 1 8 t-1 2" stroke="{ink}" stroke-width="1.1" fill="none"/>' +
    '<path d="M12 18 Q 6 30 6 40" stroke="{ink}" stroke-width="1" fill="none" opacity="0.7"/>';

  M.ferriswheel = '<circle cx="20" cy="20" r="14" fill="none" stroke="{ink}" stroke-width="1.8"/>' +
    '<path d="M20 6 v28 M6 20 h28 M10 10 l20 20 M30 10 L10 30" stroke="{ink}" stroke-width="1"/>' +
    '<circle cx="20" cy="6" r="2.2" fill="{acc}"/><circle cx="34" cy="20" r="2.2" fill="{acc}"/>' +
    '<circle cx="20" cy="34" r="2.2" fill="{acc}"/><circle cx="6" cy="20" r="2.2" fill="{acc}"/>' +
    '<path d="M14 30 L20 40 26 30" stroke="{ink}" stroke-width="1.8" fill="none"/>' +
    '<path d="M12 40 h16" stroke="{ink}" stroke-width="2" stroke-linecap="round"/>';

  M.rose = ground(7) +
    '<path d="M20 39 V20" stroke="{ink}" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path d="M20 30 q-6 -1 -7 -5 5 -1 7 5z M20 26 q6 -1 7 -5 -5 -1 -7 5z" fill="{ink}"/>' +
    '<path d="M20 8 q7 2 7 8 0 6 -7 6 t-7 -6 q0 -6 7 -8z" fill="{acc}"/>' +
    '<path d="M20 12 q3.4 1.4 3.4 4.4 0 2.8 -3.4 2.8 t-3.4 -2.8 q0 -3 3.4 -4.4z" fill="{lit}" opacity="0.5"/>';

  M.stargazing = '<path d="M20 9 l1.8 4.6 4.8 0.3 -3.7 3 1.2 4.7 -4.1 -2.6 -4.1 2.6 1.2 -4.7 -3.7 -3 4.8 -0.3z" fill="{acc}"/>' +
    '<circle cx="8" cy="12" r="1.2" fill="{lit}"/><circle cx="32" cy="10" r="1.4" fill="{lit}"/>' +
    '<circle cx="30" cy="20" r="1" fill="{lit}"/><circle cx="10" cy="22" r="1" fill="{lit}"/>' +
    '<path d="M6 40 q14 -8 28 0z" fill="{ink}"/>' +
    '<circle cx="16" cy="33" r="1.8" fill="{ink}"/><circle cx="23" cy="32.4" r="1.8" fill="{ink}"/>' +
    '<path d="M16 34.8 v4 M23 34.2 v4.6" stroke="{ink}" stroke-width="2" stroke-linecap="round"/>';

  M.fireworks = '<path d="M20 22 V8 M20 22 l-9 -9 M20 22 l9 -9 M20 22 l-12 3 M20 22 l12 3" stroke="{acc}" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="20" cy="8" r="1.4" fill="{lit}"/><circle cx="11" cy="13" r="1.4" fill="{lit}"/>' +
    '<circle cx="29" cy="13" r="1.4" fill="{lit}"/><circle cx="8" cy="25" r="1.4" fill="{lit}"/>' +
    '<circle cx="32" cy="25" r="1.4" fill="{lit}"/>' +
    '<path d="M6 40 q14 -6 28 0z" fill="{ink}" opacity="0.8"/>';

  /* ---------------- Games & contests ---------------- */
  M.boardgame = ground(12) +
    '<path d="M6 28 h28 v11 H6z" fill="{lit}"/>' +
    '<path d="M6 28 h7 v11 H6z M20 28 h7 v11 h-7z" fill="{ink}" opacity="0.8"/>' +
    '<circle cx="16" cy="23" r="3.4" fill="{acc}"/><circle cx="26" cy="23" r="3.4" fill="{ink}"/>';

  M.dice = ground(11) +
    '<rect x="6" y="22" width="15" height="15" rx="2.6" fill="{lit}"/>' +
    '<circle cx="10.5" cy="26.5" r="1.4" fill="{ink}"/><circle cx="16.5" cy="32.5" r="1.4" fill="{ink}"/>' +
    '<circle cx="13.5" cy="29.5" r="1.4" fill="{ink}"/>' +
    '<rect x="22" y="26" width="12" height="12" rx="2.2" fill="{acc}"/>' +
    '<circle cx="25.6" cy="29.6" r="1.2" fill="{ink}"/><circle cx="30.4" cy="34.4" r="1.2" fill="{ink}"/>';

  M.puzzle = ground(10) +
    '<path d="M9 16 h10 v3 a2.6 2.6 0 0 0 5 0 v-3 h8 v10 h-3 a2.6 2.6 0 0 0 0 5 h3 v8 H9z" fill="{acc}"/>' +
    '<path d="M9 31 h3 a2.6 2.6 0 0 0 0 -5 H9z" fill="{ink}" opacity="0.5"/>';

  M.trophy = ground(9) +
    '<path d="M13 12 h14 v8 a7 7 0 0 1 -14 0z" fill="{acc}"/>' +
    '<path d="M13 14 h-4 a4 4 0 0 0 4 5z M27 14 h4 a4 4 0 0 1 -4 5z" fill="{acc}"/>' +
    '<path d="M18.5 27 h3 v5 h-3z" fill="{ink}"/>' +
    '<path d="M13 32 h14 v5 H13z" fill="{ink}"/>' +
    '<path d="M11 37 h18 v2.6 H11z" fill="{ink}"/>';

  M.scavenger = ground(9) +
    '<circle cx="18" cy="19" r="9.4" fill="none" stroke="{ink}" stroke-width="2.6"/>' +
    '<circle cx="18" cy="19" r="6.6" fill="{lit}" opacity="0.35"/>' +
    '<path d="M25 26 L34 37" stroke="{ink}" stroke-width="3.2" stroke-linecap="round"/>';

  M.escaperoom = '<path d="M8 8 h24 v32 H8z" fill="{ink}"/>' +
    '<path d="M11 11 h18 v26 H11z" fill="{sky}" opacity="0.3"/>' +
    '<circle cx="26" cy="24" r="1.8" fill="{acc}"/>' +
    '<path d="M18 19 a4 4 0 0 1 8 0 v3 h-2 v-3 a2 2 0 0 0 -4 0z" fill="{lit}"/>' +
    '<rect x="16" y="22" width="12" height="9" rx="1.6" fill="{lit}"/>';

  /* ---------------- Learning ---------------- */
  M.books = ground(11) +
    '<path d="M8 26 h9 v13 H8z" fill="{acc}"/>' +
    '<path d="M18 22 h8 v17 h-8z" fill="{ink}"/>' +
    '<path d="M27 29 h7 v10 h-7z" fill="{lit}"/>' +
    '<path d="M10 29 h5 M20 26 h4 M28.6 32 h4" stroke="{lit}" stroke-width="1.1" opacity="0.7"/>';

  M.chess = ground(9) +
    '<path d="M16 39 h12 l-1.6 -5 h-8.8z" fill="{ink}"/>' +
    '<path d="M18 34 q-1 -6 2 -8 -3 -2 -1 -5 h4 q2 3 -1 5 3 2 2 8z" fill="{ink}"/>' +
    '<path d="M18.4 21 h5.2" stroke="{lit}" stroke-width="1.2"/>' +
    '<circle cx="20" cy="15.4" r="2.4" fill="{acc}"/>';

  M.piano = ground(12) +
    '<path d="M5 24 h30 v13 H5z" fill="{ink}"/>' +
    '<path d="M7 28 h26 v9 H7z" fill="{lit}"/>' +
    '<path d="M11 28 v9 M15 28 v9 M19 28 v9 M23 28 v9 M27 28 v9 M31 28 v9" stroke="{ink}" stroke-width="0.9"/>' +
    '<path d="M9.4 28 h2.4 v5 H9.4z M17.4 28 h2.4 v5 h-2.4z M25.4 28 h2.4 v5 h-2.4z" fill="{ink}"/>';

  M.science = ground(9) +
    '<path d="M17 10 h6 v10 l7 16 a2 2 0 0 1 -1.8 3 H11.8 a2 2 0 0 1 -1.8 -3 l7 -16z" fill="none" stroke="{ink}" stroke-width="1.8"/>' +
    '<path d="M13.4 28 h13.2 l3.4 8 a2 2 0 0 1 -1.8 3 H11.8 a2 2 0 0 1 -1.8 -3z" fill="{acc}"/>' +
    '<path d="M16 9 h8" stroke="{ink}" stroke-width="2" stroke-linecap="round"/>';

  M.yoga = ground(11) +
    '<path d="M6 37 h28" stroke="{acc}" stroke-width="3.4" stroke-linecap="round"/>' +
    '<circle cx="20" cy="16" r="3" fill="{ink}"/>' +
    '<path d="M20 19.6 q-4 1 -4 5.4 v4 h8 v-4 q0 -4.4 -4 -5.4z" fill="{ink}"/>' +
    '<path d="M16 29 q-6 1 -8 5 h24 q-2 -4 -8 -5z" fill="{ink}"/>' +
    '<path d="M16 24 l-7 1 M24 24 l7 1" stroke="{ink}" stroke-width="1.6" stroke-linecap="round"/>';

  /* ---------------- Building & DIY ---------------- */
  M.tools = ground(10) +
    '<path d="M10 12 l5 5 -14 14 -5 -5z" fill="{ink}" transform="translate(7,5)"/>' +
    '<path d="M27 11 a5.4 5.4 0 0 0 -7 7 l-9 9 4 4 9 -9 a5.4 5.4 0 0 0 7 -7 l-4 4 -3 -3z" fill="{acc}"/>';

  M.paintroller = ground(9) +
    '<rect x="10" y="10" width="20" height="7" rx="2" fill="{acc}"/>' +
    '<path d="M20 17 v5 h-5 v3" stroke="{ink}" stroke-width="1.8" fill="none"/>' +
    '<rect x="12.6" y="25" width="5" height="14" rx="2.2" fill="{ink}"/>' +
    '<path d="M30 12 v-4 h-6" stroke="{ink}" stroke-width="1.6" fill="none"/>';

  M.birdhouse = ground(9) +
    '<path d="M20 9 L34 21 H6z" fill="{acc}"/>' +
    '<path d="M10 21 h20 v14 H10z" fill="{ink}"/>' +
    '<circle cx="20" cy="27" r="3.4" fill="{sky}" opacity="0.7"/>' +
    '<path d="M20 31 v6" stroke="{lit}" stroke-width="1.6"/>' +
    '<path d="M20 35 v4" stroke="{ink}" stroke-width="2.4"/>';

  M.garden = ground(12) +
    '<path d="M8 27 h24 l-2.4 12 H10.4z" fill="{ink}"/>' +
    '<path d="M6 24 h28 v3.4 H6z" fill="{acc}"/>' +
    '<path d="M15 24 v-6 M20 24 v-9 M25 24 v-5" stroke="{lit}" stroke-width="1.4" stroke-linecap="round"/>' +
    '<circle cx="15" cy="16.6" r="2.4" fill="{lit}"/><circle cx="20" cy="13.4" r="2.6" fill="{acc}"/>' +
    '<circle cx="25" cy="17.6" r="2.2" fill="{lit}"/>';

  /* ---------------- Service & kindness ---------------- */
  M.volunteer = '<path d="M20 36 q-11 -7 -13 -14 -1.6 -6 3.6 -8 4.4 -1.6 7.4 3 l2 3 2 -3 q3 -4.6 7.4 -3 5.2 2 3.6 8 -2 7 -13 14z" fill="{acc}"/>' +
    '<path d="M13 22 q4 -4 7 -1 3 -3 7 1" stroke="{lit}" stroke-width="1.2" fill="none" opacity="0.6"/>';

  M.donation = ground(11) +
    '<path d="M7 22 h26 v17 H7z" fill="{ink}"/>' +
    '<path d="M7 22 l4 -6 h18 l4 6z" fill="{acc}"/>' +
    '<path d="M20 22 v17" stroke="{lit}" stroke-width="1.4" opacity="0.5"/>' +
    '<path d="M16 16 q4 -5 8 0" stroke="{lit}" stroke-width="1.4" fill="none"/>';

  M.pet = ground(10) +
    '<ellipse cx="20" cy="30" rx="7" ry="6" fill="{ink}"/>' +
    '<circle cx="11.5" cy="22" r="3.2" fill="{ink}"/><circle cx="28.5" cy="22" r="3.2" fill="{ink}"/>' +
    '<circle cx="15" cy="16" r="3" fill="{ink}"/><circle cx="25" cy="16" r="3" fill="{ink}"/>' +
    '<circle cx="17.6" cy="28.4" r="1" fill="{lit}"/><circle cx="22.4" cy="28.4" r="1" fill="{lit}"/>';

  /* ---------------- Travel & bucket list ---------------- */
  M.plane = '<path d="M6 24 L34 15 l2.6 3.6 -9 6.4 2 11 -3.4 1.6 -6 -10 -7 4.4 0.4 5 -2.6 1 -2.4 -6 -5.4 -3.4z" fill="{lit}"/>' +
    '<path d="M6 24 L34 15 l2.6 3.6 -9 6.4" fill="none" stroke="{ink}" stroke-width="0.9" opacity="0.5"/>' +
    '<path d="M4 34 q10 3 20 0" stroke="{lit}" stroke-width="1" fill="none" opacity="0.45" stroke-dasharray="2 2.4"/>';

  M.globe = ground(9) +
    '<circle cx="20" cy="21" r="13" fill="{acc}"/>' +
    '<path d="M7 21 h26 M20 8 q7 13 0 26 M20 8 q-7 13 0 26 M10 13 q10 5 20 0 M10 29 q10 -5 20 0" stroke="{ink}" stroke-width="1" fill="none" opacity="0.7"/>' +
    '<path d="M20 34 v5 M14 39 h12" stroke="{ink}" stroke-width="2" stroke-linecap="round"/>';

  M.scuba = '<circle cx="18" cy="20" r="7.4" fill="none" stroke="{ink}" stroke-width="2.2"/>' +
    '<circle cx="18" cy="20" r="4.6" fill="{lit}" opacity="0.4"/>' +
    '<path d="M25 18 h7" stroke="{ink}" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M32 18 v9 q0 3 -3 3" stroke="{ink}" stroke-width="1.8" fill="none"/>' +
    '<circle cx="9" cy="10" r="1.8" fill="{lit}" opacity="0.7"/><circle cx="13" cy="6" r="1.2" fill="{lit}" opacity="0.6"/>' +
    '<path d="M4 38 q8 -3 16 0 t16 0" stroke="{lit}" stroke-width="1.2" fill="none" opacity="0.5"/>';

  M.castle = '<path d="M6 40 V16 h4 v-5 h4 v5 h5 v-5 h4 v5 h5 v-5 h4 v5 h2 v24z" fill="{ink}"/>' +
    '<path d="M17 40 V29 a3 3 0 0 1 6 0 v11z" fill="{sky}" opacity="0.45"/>' +
    '<rect x="10" y="21" width="3.4" height="4.6" fill="{acc}" opacity="0.8"/>' +
    '<rect x="26.6" y="21" width="3.4" height="4.6" fill="{acc}" opacity="0.8"/>';

  M.roadtrip = '<path d="M4 40 L14 26 h12 l10 14z" fill="{ink}" opacity="0.35"/>' +
    '<path d="M20 26 v14" stroke="{lit}" stroke-width="1.6" stroke-dasharray="3 3" opacity="0.8"/>' +
    '<path d="M9 22 q0 -5 5 -5 h12 q5 0 5 5 v6 H9z" fill="{acc}"/>' +
    '<path d="M12.6 18.6 h14.8 l1.4 3.4 H11.2z" fill="{sky}" opacity="0.6"/>' +
    '<circle cx="13.5" cy="28" r="2.6" fill="{ink}"/><circle cx="26.5" cy="28" r="2.6" fill="{ink}"/>';

  M.arch = '<path d="M2 40 V18 q0 -8 9 -8 h18 q9 0 9 8 v22 h-9 V22 q0 -4 -5 -4 h-8 q-5 0 -5 4 v18z" fill="{acc}"/>' +
    '<path d="M2 40 V18 q0 -8 9 -8" fill="none" stroke="{ink}" stroke-width="0.9" opacity="0.3"/>' +
    '<path d="M0 40 h40" stroke="{ink}" stroke-width="1.6" opacity="0.35"/>';

  /* ---------------- Dining & nightlife ---------------- */
  M.dinner = ground(12) +
    '<path d="M4 30 h32 v3 H4z" fill="{lit}"/>' +
    '<path d="M8 33 v6 M32 33 v6" stroke="{ink}" stroke-width="2" stroke-linecap="round"/>' +
    '<circle cx="13" cy="26" r="4.6" fill="{lit}"/>' +
    '<circle cx="27" cy="26" r="4.6" fill="{lit}"/>' +
    '<path d="M20 28 V16" stroke="{ink}" stroke-width="1.4"/>' +
    '<path d="M20 16 q-2 -3 0 -5 2 2 0 5z" fill="{acc}"/>';

  M.wine = ground(8) +
    '<path d="M13 10 h6 v7 a3 3 0 0 1 -6 0z" fill="{acc}"/>' +
    '<path d="M13 10 h6 v13 a3 3 0 0 1 -3 3 3 3 0 0 1 -3 -3z" fill="none" stroke="{ink}" stroke-width="1.4"/>' +
    '<path d="M16 26 v11 M12 38 h8" stroke="{ink}" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path d="M22 12 h6 v7 a3 3 0 0 1 -6 0z" fill="{acc}"/>' +
    '<path d="M22 12 h6 v13 a3 3 0 0 1 -3 3 3 3 0 0 1 -3 -3z" fill="none" stroke="{ink}" stroke-width="1.4"/>' +
    '<path d="M25 28 v9 M21 38 h8" stroke="{ink}" stroke-width="1.6" stroke-linecap="round"/>';

  M.lantern = '<path d="M20 4 v4" stroke="{ink}" stroke-width="1.4"/>' +
    '<path d="M12 12 h16 l-2 18 q-6 4 -12 0z" fill="{acc}"/>' +
    '<path d="M11 8 h18 v4 H11z M13 30 h14 v4 H13z" fill="{ink}"/>' +
    '<path d="M17 15 v12 M23 15 v12" stroke="{lit}" stroke-width="1" opacity="0.5"/>' +
    '<path d="M20 34 v5" stroke="{ink}" stroke-width="1.2" opacity="0.6"/>';

  M.spa = ground(10) +
    '<path d="M20 22 q9 -9 15 -4 -2 9 -15 4z" fill="{acc}"/>' +
    '<path d="M20 22 q-9 -9 -15 -4 2 9 15 4z" fill="{acc}" opacity="0.75"/>' +
    '<path d="M6 34 q14 -6 28 0z" fill="{lit}" opacity="0.7"/>' +
    '<circle cx="14" cy="30" r="1.8" fill="{lit}"/><circle cx="26" cy="30" r="1.8" fill="{lit}"/>';

  M.library = '<path d="M4 40 V14 h32 v26z" fill="{ink}"/>' +
    '<path d="M4 14 L20 5 36 14z" fill="{acc}"/>' +
    '<path d="M8 20 h9 v7 H8z M23 20 h9 v7 h-9z M8 30 h9 v7 H8z M23 30 h9 v7 h-9z" fill="{lit}" opacity="0.3"/>';

  /* ---------------- Gap fillers ----------------
     Added after mapping all 2000 ideas surfaced clusters that had no honest
     match in the library (caving, stadium sports, fall farms, towed
     watersports, and so on). */
  M.cave = '<path d="M0 40 V22 q0 -14 20 -14 t20 14 v18z" fill="{ink}"/>' +
    '<path d="M12 40 V30 q0 -8 8 -8 t8 8 v10z" fill="#000" opacity="0.72"/>' +
    '<path d="M16 24 l-3 -3 M24 24 l3 -3" stroke="{lit}" stroke-width="1" opacity="0.35"/>' +
    '<circle cx="20" cy="31" r="2.2" fill="{acc}"/>' +
    '<path d="M20 31 l-7 8 h14z" fill="{acc}" opacity="0.4"/>';

  M.baseball = ground(11) +
    '<g transform="rotate(38 20 26)">' +
    '<path d="M19 38 h3 v-18 q0 -4 -1.5 -4 t-1.5 4z" fill="{ink}"/>' +
    '<path d="M18.6 38 h3.8 v2.4 h-3.8z" fill="{ink}"/></g>' +
    '<circle cx="29" cy="17" r="5.6" fill="{lit}"/>' +
    '<path d="M25.4 13 q3.6 4 0 8 M32.6 13 q-3.6 4 0 8" stroke="{acc}" stroke-width="1.2" fill="none"/>';

  M.pumpkin = ground(12) +
    '<path d="M20 16 q-12 0 -12 11.5 T20 39 q12 0 12 -11.5 T20 16z" fill="{acc}"/>' +
    '<path d="M14.4 17.6 q-3.4 4.4 -3.4 9.9 t3.4 9.9 M25.6 17.6 q3.4 4.4 3.4 9.9 t-3.4 9.9" stroke="{ink}" stroke-width="1" fill="none" opacity="0.45"/>' +
    '<path d="M20 16 v-4 q0 -3 4 -4" stroke="{ink}" stroke-width="2" fill="none" stroke-linecap="round"/>';

  M.axethrow = '<circle cx="18" cy="21" r="14" fill="{lit}"/>' +
    '<circle cx="18" cy="21" r="9.6" fill="none" stroke="{ink}" stroke-width="1.2"/>' +
    '<circle cx="18" cy="21" r="5.2" fill="none" stroke="{ink}" stroke-width="1.2"/>' +
    '<circle cx="18" cy="21" r="2" fill="{acc}"/>' +
    '<path d="M22 24 L34 36" stroke="{ink}" stroke-width="2.4" stroke-linecap="round"/>' +
    '<path d="M21 19 q6 -2 7 3 -5 2 -7 -3z" fill="{ink}"/>';

  M.snowmobile = ground(12) +
    '<path d="M6 34 q10 3 26 0 l2 4 q-16 4 -30 0z" fill="{ink}"/>' +
    '<path d="M10 33 q0 -8 8 -8 h7 l5 -6 3 2 -4 6 q4 2 4 6z" fill="{acc}"/>' +
    '<path d="M2 38 q3 -4 7 -4" stroke="{lit}" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
    '<circle cx="18" cy="21" r="2.4" fill="{ink}"/>';

  M.wakeboard = '<path d="M2 34 q8 -3 14 0 t12 0 t10 0" stroke="{lit}" stroke-width="1.4" fill="none" opacity="0.7"/>' +
    '<path d="M2 39 q8 -3 14 0 t12 0 t10 0" stroke="{lit}" stroke-width="1.4" fill="none" opacity="0.5"/>' +
    '<g transform="rotate(-18 20 28)">' +
    '<rect x="8" y="26" width="24" height="6" rx="3" fill="{acc}"/>' +
    '<rect x="14" y="27" width="4" height="4" rx="1" fill="{ink}"/>' +
    '<rect x="22" y="27" width="4" height="4" rx="1" fill="{ink}"/></g>' +
    '<circle cx="21" cy="16" r="2.6" fill="{ink}"/>' +
    '<path d="M21 19 q-3.4 1 -3.4 4.4 V27 h6.8 v-3.6 q0 -3.4 -3.4 -4.4z" fill="{ink}"/>' +
    '<path d="M24 21 q6 -2 12 -6" stroke="{ink}" stroke-width="1.2" fill="none"/>';

  M.darts = '<circle cx="20" cy="20" r="14" fill="{lit}"/>' +
    '<path d="M20 6 a14 14 0 0 1 0 28z" fill="{ink}" opacity="0.18"/>' +
    '<circle cx="20" cy="20" r="9" fill="none" stroke="{ink}" stroke-width="1.2"/>' +
    '<circle cx="20" cy="20" r="4.4" fill="{acc}"/>' +
    '<circle cx="20" cy="20" r="1.6" fill="{ink}"/>' +
    '<path d="M21 19 L33 9" stroke="{ink}" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path d="M33 9 l4 -3 -1 4.4 -4.4 1z" fill="{acc}"/>';

  M.train = ground(12) +
    '<path d="M6 36 h30 v2.4 H6z" fill="{ink}"/>' +
    '<path d="M8 34 V18 h12 v16z" fill="{acc}"/>' +
    '<path d="M20 34 V24 h13 q3 0 3 4 v6z" fill="{ink}"/>' +
    '<rect x="10.6" y="21" width="6.8" height="6" rx="1" fill="{sky}" opacity="0.6"/>' +
    '<circle cx="13" cy="36" r="2.4" fill="{ink}"/><circle cx="24" cy="36" r="2.4" fill="{ink}"/>' +
    '<circle cx="31" cy="36" r="2.4" fill="{ink}"/>' +
    '<path d="M12 14 q-2 -4 0 -7 M16 13 q-2 -3.4 0 -6" stroke="{lit}" stroke-width="1.4" fill="none" opacity="0.7" stroke-linecap="round"/>';

  M.tattoo = ground(10) +
    '<path d="M6 32 q10 -5 20 -3 l2 6 q-12 -1 -22 4z" fill="{lit}" opacity="0.9"/>' +
    '<path d="M28 12 h6 l2 6 -4 3 -4 -3z" fill="{ink}"/>' +
    '<path d="M31 21 L24 30" stroke="{ink}" stroke-width="2.2" stroke-linecap="round"/>' +
    '<path d="M23.4 30.6 l-1.4 1.8" stroke="{acc}" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path d="M12 31 q3 -3 6 0" stroke="{acc}" stroke-width="1.2" fill="none"/>';

  return { M: M, couple: couple, ground: ground };
})();
