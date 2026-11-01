/* ===================== Spark submit.js =====================
 * Pure helpers for "Got an Idea?". Builds the POST body and the status
 * copy. Nothing here talks to the network, and nothing is sent on its own.
 * A stored idea leaves the device only when the person taps Send.
 *
 * Loaded as a classic script before app.js. Node tests require() it.
 * ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SparkSubmit = api;
})(this, function () {
  "use strict";

  var STRING_KEYS = ["title", "description", "category", "setting", "cost", "duration", "venueName", "city", "sourceUrl"];
  var LIST_KEYS = ["season", "time", "vibe", "stage", "dateType"];
  var STORED_STRINGS = STRING_KEYS.concat(["submittedAt"]);

  function cleanString(value) {
    if (typeof value !== "string") return "";
    return value.trim();
  }

  function cleanList(value) {
    if (!Array.isArray(value)) return [];
    var seen = Object.create(null);
    var out = [];
    value.forEach(function (item) {
      if (typeof item !== "string") return;
      var trimmed = item.trim();
      if (!trimmed || seen[trimmed]) return;
      seen[trimmed] = true;
      out.push(trimmed);
    });
    return out;
  }

  // Whitelist only. Coordinates, device ids, and the date of birth are
  // never copied, even when the caller passes them in.
  function buildSubmissionBody(input) {
    input = input || {};
    var body = {};
    STRING_KEYS.forEach(function (key) {
      var value = cleanString(input[key]);
      if (value) body[key] = value;
    });
    var email = cleanString(input.email).toLowerCase();
    if (email) body.email = email;
    LIST_KEYS.forEach(function (key) {
      var list = cleanList(input[key]);
      if (list.length) body[key] = list;
    });
    if (typeof input.food === "boolean") body.food = input.food;
    body.age21 = input.age21 === true;
    body.ageConfirmed = input.ageConfirmed === true;
    var website = cleanString(input.website);
    if (website) body.website = website;
    return body;
  }

  function submissionStatusCopy(status) {
    if (status === "pending") return "Pending review";
    return "Saved on this device";
  }

  function submissionOutcome(httpStatus) {
    // 200 is the honeypot reply. Show the same thanks so the form does not
    // reveal that the idea was dropped.
    if (httpStatus === 201 || httpStatus === 200) {
      return {
        save: "pending",
        message: "Thanks! Your idea is in. It's pending review and won't appear until Justin approves it."
      };
    }
    if (httpStatus === 400) {
      return { save: null, highlight: true, message: "Please check the highlighted fields." };
    }
    if (httpStatus === 429) {
      return { save: null, message: "You've sent a lot of ideas. Try again later." };
    }
    if (httpStatus === 403) {
      var minimum = (typeof SparkUtil !== "undefined" && SparkUtil && SparkUtil.MINIMUM_AGE) || require("./util").MINIMUM_AGE;
      return { save: null, showGate: true, message: "You must be " + minimum + " or older to use Jaderoo." };
    }
    if (httpStatus === 503 || httpStatus === 0) {
      return {
        save: "not_sent",
        message: "Saved on this device. Tap Send on it when you want to try again."
      };
    }
    return { save: null, message: "Something went wrong. Please try again." };
  }

  function normalizeStoredIdea(idea) {
    if (!idea || typeof idea !== "object" || Array.isArray(idea)) return null;
    var out = {};
    STORED_STRINGS.forEach(function (key) {
      if (typeof idea[key] === "string" && idea[key]) out[key] = idea[key];
    });
    LIST_KEYS.forEach(function (key) {
      var list = cleanList(idea[key]);
      if (list.length) out[key] = list;
    });
    if (typeof idea.food === "boolean") out.food = idea.food;
    if (typeof idea.age21 === "boolean") out.age21 = idea.age21;
    out.status = idea.status === "pending" ? "pending" : "not_sent";
    return out;
  }

  var STORED_KEYS = {
    title: 1, description: 1, category: 1, setting: 1, cost: 1, duration: 1,
    venueName: 1, city: 1, sourceUrl: 1, submittedAt: 1, season: 1, time: 1,
    vibe: 1, stage: 1, dateType: 1, food: 1, age21: 1, status: 1
  };

  function ideaNeedsMigration(idea) {
    if (!idea || typeof idea !== "object" || Array.isArray(idea)) return true;
    if (idea.status !== "pending" && idea.status !== "not_sent") return true;
    for (var key in idea) {
      if (Object.prototype.hasOwnProperty.call(idea, key) && !STORED_KEYS[key]) return true;
    }
    return false;
  }

  // One-time offer for ideas that are still only on this device.
  // Dismissing it is permanent, including for later not-sent items.
  function shouldShowIdeaSendBanner(state) {
    if (!state || state.ideaSendBannerDismissed === true) return false;
    var ideas = state.submittedIdeas;
    if (!Array.isArray(ideas)) return false;
    return ideas.some(function (idea) { return idea && idea.status !== "pending"; });
  }

  return {
    buildSubmissionBody: buildSubmissionBody,
    submissionStatusCopy: submissionStatusCopy,
    submissionOutcome: submissionOutcome,
    normalizeStoredIdea: normalizeStoredIdea,
    ideaNeedsMigration: ideaNeedsMigration,
    shouldShowIdeaSendBanner: shouldShowIdeaSendBanner
  };
});
