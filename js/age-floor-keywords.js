/**
 * Shared age-floor keyword test. One pattern for every place that screens text
 * for adult markers: News comments (under-13 hide), Tower News list
 * (newsPostAppropriate) and SeedOps News log (ageFloorPassed).
 *
 * Matches "13+", "16+", "17+", "18+", "21+" when the "+" is not followed by a
 * letter/digit and the number is not glued to a preceding letter/digit, plus
 * "PG-13" / "PG13", "nsfw" and "explicit" as whole words.
 */
(function (root) {
  "use strict";
  var ADULT_KEYWORD_RE = /(^|\W)(13|16|17|18|21)\+(?!\w)|\bPG-?13\b|\b(nsfw|explicit)\b/i;
  function isAdultKeyword(text) {
    return ADULT_KEYWORD_RE.test(String(text == null ? "" : text));
  }
  var api = { ADULT_KEYWORD_RE: ADULT_KEYWORD_RE, isAdultKeyword: isAdultKeyword };
  root.CognationAgeFloor = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);
