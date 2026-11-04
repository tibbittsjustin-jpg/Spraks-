/* Public /licenses page. The MapLibre LICENSE.txt is passed in verbatim.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JaderooLicensesPage = api;
})(this, function () {
  "use strict";

  var CREDITS_LINE = "Map rendering: MapLibre GL JS (BSD-3-Clause), © MapLibre contributors; includes code © 2020 Mapbox (BSD-3-Clause).";

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderPage(licenseText) {
    var text = String(licenseText == null ? "" : licenseText);
    var html = [];
    html.push("<!DOCTYPE html>");
    html.push('<html lang="en"><head><meta charset="UTF-8">');
    html.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
    html.push("<title>Open-source licenses · Jaderoo</title>");
    html.push("<style>");
    html.push(":root{color-scheme:light dark;--bg:#FFFBF2;--text:#0F4D3A;--muted:#4A6358;--link:#0B6E4F;--card:#F4FBF7;}");
    html.push("@media (prefers-color-scheme:dark){:root{--bg:#121614;--text:#ECEFED;--muted:#AEB8B3;--link:#3CCB8A;--card:#252C29;}}");
    html.push("body{margin:0;padding:28px 22px 64px;background:var(--bg);color:var(--text);font:16px/1.5 Nunito,-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif;}");
    html.push("a{color:var(--link);} h1{font-size:28px;margin:0 0 8px;} h2{font-size:20px;margin:28px 0 8px;}");
    html.push("p{max-width:42rem;} .muted{color:var(--muted);} pre{white-space:pre-wrap;background:var(--card);padding:14px 16px;border-radius:12px;font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}");
    html.push(".back{display:inline-block;margin-bottom:18px;font-weight:700;text-decoration:none;}");
    html.push("</style></head><body>");
    html.push('<a class="back" href="/" target="_top">‹ Back to Jaderoo</a>');
    html.push("<h1>Open-source licenses</h1>");
    html.push('<p class="muted">License notices for software shipped with Jaderoo.</p>');
    html.push("<h2>MapLibre GL JS</h2>");
    html.push('<p id="map-credits">' + escapeHtml(CREDITS_LINE) + "</p>");
    html.push('<pre id="maplibre-license">' + escapeHtml(text) + "</pre>");
    html.push("</body></html>");
    return html.join("");
  }

  return {
    CREDITS_LINE: CREDITS_LINE,
    renderPage: renderPage,
    escapeHtml: escapeHtml
  };
});
