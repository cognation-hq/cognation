/**
 * Shared age-floor keyword test. One pattern for every place that screens text
 * for adult markers: News comments (under-13 hide), Tower News list
 * (newsPostAppropriate) and SeedOps News log (ageFloorPassed).
 *
 * Text is NFKC-normalized first (full-width "21＋" becomes "21+"). Matches
 * "13+", "16+", "17+", "18+", "21+" (one optional space before the "+") when
 * the "+" is not followed by a letter/digit and the number is not glued to a
 * preceding letter/digit, plus "PG-13" / "PG13", "nsfw" and "explicit" as
 * whole words.
 *
 * Also the shared viewer-age rule (unknown age = under-13) and the G/PG rating
 * check used by Tower and the News Nationwide/International floor.
 */
(function (root) {
  "use strict";
  var ADULT_KEYWORD_RE = /(^|\W)(13|16|17|18|21)\s?\+(?!\w)|\bPG-?13\b|\b(nsfw|explicit)\b/i;
  function isAdultKeyword(text) {
    var s = String(text == null ? "" : text);
    if (typeof s.normalize === "function") s = s.normalize("NFKC");
    return ADULT_KEYWORD_RE.test(s);
  }

  /* Viewer age (moved from js/news-comments.js, #68): the Commune member profile
     age; unknown counts as 0, so an unknown age gets the under-13 floor. */
  function viewerAge() {
    try {
      var swipe = root.CognationCommuneSwipe;
      if (swipe && swipe.getMemberAge) {
        var n = swipe.getMemberAge();
        if (n != null && !isNaN(n)) return n;
      }
      var store = root.localStorage || (typeof localStorage !== "undefined" ? localStorage : null);
      var p = store ? JSON.parse(store.getItem("cognation.member.profile.v1") || "null") : null;
      if (p && p.age != null) return parseInt(p.age, 10) || 0;
    } catch (e) {}
    return 0;
  }
  function viewerIsUnder13() {
    return viewerAge() < 13;
  }

  /* G/PG floor for rated items (moved from js/news-comments.js): "G", "PG",
     "G-PG" or "GPG", any dash or slash.
     PG-13, R and missing ratings do not pass. */
  function ratingIsGPG(rating) {
    if (rating == null) return false;
    var r = String(rating);
    if (typeof r.normalize === "function") r = r.normalize("NFKC");
    r = r.trim().toUpperCase().replace(/\s+/g, "").replace(/[\u2010-\u2015\/]/g, "-");
    return r === "G" || r === "PG" || r === "G-PG" || r === "GPG";
  }

  var api = {
    ADULT_KEYWORD_RE: ADULT_KEYWORD_RE,
    isAdultKeyword: isAdultKeyword,
    viewerAge: viewerAge,
    viewerIsUnder13: viewerIsUnder13,
    ratingIsGPG: ratingIsGPG,
  };
  root.CognationAgeFloor = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);
