/* https source links. Same shape as activities.source_url in migration 003:
   https only, no spaces, at most 2048 characters. Also rejects missing
   hosts and URLs that carry credentials (user:pass@). */
"use strict";

const MAX_LENGTH = 2048;
const HTTPS_SHAPE = /^https:\/\/[^\s]+$/;

function validateSourceUrl(value) {
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, empty: true };
  if (trimmed.length > MAX_LENGTH) return { ok: false };
  if (!HTTPS_SHAPE.test(trimmed)) return { ok: false };
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (err) {
    return { ok: false };
  }
  if (parsed.protocol !== "https:") return { ok: false };
  if (parsed.username || parsed.password) return { ok: false };
  if (!parsed.hostname) return { ok: false };
  return { ok: true, value: trimmed };
}

module.exports = { validateSourceUrl, MAX_LENGTH };
