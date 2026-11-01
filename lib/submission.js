/* Whitelist a submission body into a payload plus a normalized email.
   Unknown keys are dropped. Nothing here reads or stores a device id,
   a coordinate, or the address inside the payload. */
"use strict";

const filters = require("../shared/filters");
const { validateSourceUrl } = require("./validate-url");
const { checkAge } = require("../public/util");

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const EMAIL_MAX = 254;

const ARRAY_FIELDS = ["season", "time", "vibe", "stage", "dateType"];
const CHOICE_FIELDS = ["setting", "cost", "duration"];

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readTrimmed(value) {
  if (typeof value !== "string") return null;
  return value.trim();
}

function readEmail(value) {
  const trimmed = readTrimmed(value);
  if (trimmed == null) return null;
  const email = trimmed.toLowerCase();
  if (!email || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) return null;
  return email;
}

function readChoice(value, vocab) {
  const trimmed = readTrimmed(value);
  if (trimmed == null || !trimmed || vocab.indexOf(trimmed) === -1) return null;
  return trimmed;
}

function readList(value, vocab) {
  if (!Array.isArray(value)) return { ok: false };
  const seen = Object.create(null);
  const values = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item !== "string" || vocab.indexOf(item) === -1) return { ok: false };
    if (seen[item]) continue;
    seen[item] = true;
    values.push(item);
  }
  if (values.length > vocab.length) return { ok: false };
  return { ok: true, values: values };
}

function readBounded(value, max) {
  const trimmed = readTrimmed(value);
  if (trimmed == null) return { ok: false };
  if (!trimmed) return { ok: true, empty: true };
  if (trimmed.length > max) return { ok: false };
  return { ok: true, value: trimmed };
}

function hasAgeOkCookie(header) {
  if (typeof header !== "string" || !header) return false;
  const parts = header.split(";");
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].trim() === "spark_age_ok=1") return true;
  }
  return false;
}

// null: no date was sent. true/false: the server checked it. The date is
// never copied onto the payload below.
function dobPasses(body, now) {
  if (!Object.prototype.hasOwnProperty.call(body, "dob") || body.dob == null || body.dob === "") return null;
  const dob = typeof body.dob === "string" ? body.dob : "";
  return checkAge(dob, now).ok === true;
}

/* ageConfirmed is still required, and it is not enough on its own.
   The server accepts the idea only after spark_age_ok from /api/age-check,
   or after it checks a date of birth itself. That date is not stored. */
function validateSubmission(body, opts) {
  opts = opts || {};
  if (!isPlainObject(body)) {
    return { ok: false, status: 400, error: "invalid_submission" };
  }
  if (body.ageConfirmed !== true) {
    return { ok: false, status: 403, error: "age_required" };
  }
  const dobOk = dobPasses(body, opts.now);
  if (dobOk === false) {
    return { ok: false, status: 403, error: "age_required" };
  }
  if (dobOk !== true && !hasAgeOkCookie(opts.cookie)) {
    return { ok: false, status: 403, error: "age_cookie_required" };
  }

  const fields = [];
  const payload = { schemaVersion: 1 };

  const title = readTrimmed(body.title);
  if (title == null || title.length < 3 || title.length > 120) fields.push("title");
  else payload.title = title;

  const description = readTrimmed(body.description);
  if (description == null || description.length < 10 || description.length > 2000) fields.push("description");
  else payload.description = description;

  const category = readTrimmed(body.category);
  if (category == null || filters.category.indexOf(category) === -1) fields.push("category");
  else payload.category = category;

  const email = readEmail(body.email);
  if (!email) fields.push("email");

  CHOICE_FIELDS.forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(body, key) || body[key] == null || body[key] === "") return;
    const value = readChoice(body[key], filters[key]);
    if (!value) fields.push(key);
    else payload[key] = value;
  });

  ARRAY_FIELDS.forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(body, key) || body[key] == null) return;
    const parsed = readList(body[key], filters[key]);
    if (!parsed.ok) fields.push(key);
    else if (parsed.values.length) payload[key] = parsed.values;
  });

  if (Object.prototype.hasOwnProperty.call(body, "food") && body.food != null) {
    if (typeof body.food !== "boolean") fields.push("food");
    else payload.food = body.food;
  }

  if (!Object.prototype.hasOwnProperty.call(body, "age21") || body.age21 == null) {
    payload.age21 = false;
  } else if (typeof body.age21 !== "boolean") {
    fields.push("age21");
  } else {
    payload.age21 = body.age21;
  }

  ["venueName", "city"].forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(body, key) || body[key] == null || body[key] === "") return;
    const max = key === "city" ? 80 : 120;
    const parsed = readBounded(body[key], max);
    if (!parsed.ok) fields.push(key);
    else if (parsed.value) payload[key] = parsed.value;
  });

  if (Object.prototype.hasOwnProperty.call(body, "sourceUrl") && body.sourceUrl != null && body.sourceUrl !== "") {
    const parsed = validateSourceUrl(typeof body.sourceUrl === "string" ? body.sourceUrl : "");
    if (typeof body.sourceUrl !== "string" || !parsed.ok) fields.push("sourceUrl");
    else if (parsed.value) payload.sourceUrl = parsed.value;
  }

  if (fields.length) {
    return { ok: false, status: 400, error: "invalid_submission", fields: fields };
  }
  return { ok: true, payload: payload, email: email };
}

function honeypotFilled(body) {
  if (!isPlainObject(body) || !Object.prototype.hasOwnProperty.call(body, "website")) return false;
  const website = body.website;
  if (typeof website === "string") return website.trim() !== "";
  return website != null;
}

module.exports = { validateSubmission, honeypotFilled, EMAIL_RE, EMAIL_MAX };
