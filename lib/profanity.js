/* Small built-in list. Matched as substrings after underscores and
   digits are removed. Add a word here to extend it. No dictionary
   dependency. */
"use strict";

const WORDS = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "dick",
  "nigger",
  "nigga",
  "faggot",
  "slut",
  "whore",
  "asshole",
  "porn"
];

function profanityKey(username) {
  return String(username || "").toLowerCase().replace(/[_0-9]/g, "");
}

function containsProfanity(username) {
  const key = profanityKey(username);
  if (!key) return false;
  for (let i = 0; i < WORDS.length; i++) {
    if (key.indexOf(WORDS[i]) !== -1) return true;
  }
  return false;
}

module.exports = { WORDS, profanityKey, containsProfanity };
