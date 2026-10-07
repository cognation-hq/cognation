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
  function localStore() {
    return root.localStorage || (typeof localStorage !== "undefined" ? localStorage : null);
  }

  /* Signed-in (Supabase) user id, or "" for signed-out / demo sessions. */
  function sessionUserId() {
    try {
      var auth = root.CognationAuth;
      var s = auth && typeof auth.getSession === "function" ? auth.getSession() : null;
      if (!s) {
        var store = localStore();
        s = store ? JSON.parse(store.getItem("cognation.session.v2") || "null") : null;
      }
      return s && s.source === "supabase" && s.supabaseUserId ? String(s.supabaseUserId) : "";
    } catch (e) {
      return "";
    }
  }

  /* Shared devices: cognation.member.profile.v1 counts only when it was written
     for the signed-in user (ownerUserId). Another user's leftover blob is ignored.
     Signed-out / demo sessions are unchanged. */
  function memberProfileOwned(blob) {
    var uid = sessionUserId();
    if (!uid) return !signInPending();
    return !!blob && String(blob.ownerUserId || "") === uid;
  }

  /* Signing in: Cognation sign-in is configured but the login state isn't
     stored yet. No local member profile counts until it is (unknown age). */
  function signInPending() {
    try {
      var sb = root.CognationSupabase;
      if (!sb || typeof sb.configured !== "function" || !sb.configured()) return false;
      var auth = root.CognationAuth;
      var s = auth && typeof auth.getSession === "function" ? auth.getSession() : null;
      if (!s) {
        var store = localStore();
        s = store ? JSON.parse(store.getItem("cognation.session.v2") || "null") : null;
      }
      if (s && s.source === "demo") return false;
      return !sessionUserId();
    } catch (e) {
      return false;
    }
  }

  function viewerAge() {
    try {
      var store0 = localStore();
      var own = store0 ? JSON.parse(store0.getItem("cognation.member.profile.v1") || "null") : null;
      if (!memberProfileOwned(own)) return 0;
      var swipe = root.CognationCommuneSwipe;
      if (swipe && swipe.getMemberAge) {
        var n = swipe.getMemberAge();
        if (n != null && !isNaN(n)) return n;
      }
      if (own && own.age != null) return parseInt(own.age, 10) || 0;
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
    sessionUserId: sessionUserId,
    memberProfileOwned: memberProfileOwned,
    signInPending: signInPending,
    viewerIsUnder13: viewerIsUnder13,
    ratingIsGPG: ratingIsGPG,
  };
  root.CognationAgeFloor = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);
