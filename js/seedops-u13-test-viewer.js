/**
 * Sage (seed-0248) is SeedOps' under-13 test viewer. For her, the seed
 * "adult" defaults (age 28, the under-18 raise, saving prefs) are skipped so
 * she sees the app as an 11-year-old, and she is left out of member lists and
 * the Tower feed.
 *
 * Restrict-only: being the test viewer only takes things away (the age-28
 * default, saving prefs, list visibility). It never grants access to anything.
 *
 * isU13TestViewer() needs ALL THREE, and is false on any missing data:
 *   1. account_kind === 'seed' on her profiles row (or in auth app_metadata),
 *   2. seed_fleet_id === 'seed-0248' on her profiles row,
 *   3. auth user_metadata.test_role === 'u13-viewer'.
 */
(function (root) {
  "use strict";

  var SAGE_FLEET_ID = "seed-0248";
  var TEST_ROLE = "u13-viewer";
  /* PostgREST: keep rows with no fleet id (real people). Plain neq drops nulls. */
  var LIST_FILTER = "or=(seed_fleet_id.is.null,seed_fleet_id.neq." + SAGE_FLEET_ID + ")";

  var cache = { user: null, profile: null, loading: null };

  function isU13TestViewer(input) {
    var src = input || cache;
    var user = src && src.user;
    var profile = src && src.profile;
    if (!user || !profile || !user.id) return false;
    if (String(profile.user_id || "") !== String(user.id)) return false;
    var appMeta = user.app_metadata || {};
    var userMeta = user.user_metadata || {};
    var seed = profile.account_kind === "seed" || appMeta.account_kind === "seed";
    return seed && profile.seed_fleet_id === SAGE_FLEET_ID && userMeta.test_role === TEST_ROLE;
  }

  function isSageRow(row) {
    return !!row && (row.seed_fleet_id === SAGE_FLEET_ID || row.seedFleetId === SAGE_FLEET_ID);
  }

  function client() {
    return root.CognationSupabase || null;
  }

  function signedInSession() {
    var auth = root.CognationAuth;
    var s = auth && typeof auth.getSession === "function" ? auth.getSession() : null;
    return s && s.source === "supabase" && s.supabaseUserId ? s : null;
  }

  /* Callers that already fetched the auth user can share it. */
  function noteUser(user) {
    if (user && user.id) cache.user = user;
  }

  /* Loads the signed-in user and their personal profile row once per session.
     Resolves to isU13TestViewer(); false on any error or missing data. */
  function ready() {
    var sb = client();
    var s = signedInSession();
    if (!sb || !s || typeof sb.rest !== "function") return Promise.resolve(false);
    if (cache.user && cache.profile && String(cache.user.id) === String(s.supabaseUserId)) {
      return Promise.resolve(isU13TestViewer());
    }
    if (cache.loading) return cache.loading;
    var userP =
      cache.user && String(cache.user.id) === String(s.supabaseUserId)
        ? Promise.resolve(cache.user)
        : typeof sb.getUser === "function"
          ? sb.getUser()
          : Promise.resolve(null);
    cache.loading = userP
      .then(function (user) {
        if (!user || !user.id) return false;
        cache.user = user;
        return sb
          .rest("profiles", {
            query:
              "select=id,user_id,account_kind,seed_fleet_id&kind=eq.personal&limit=1&user_id=eq." +
              encodeURIComponent(user.id),
          })
          .then(function (rows) {
            cache.profile = Array.isArray(rows) && rows[0] ? rows[0] : null;
            return isU13TestViewer();
          });
      })
      .catch(function () {
        return false;
      })
      .then(function (result) {
        cache.loading = null;
        return result;
      });
    return cache.loading;
  }

  function reset() {
    cache.user = null;
    cache.profile = null;
    cache.loading = null;
  }

  if (root.document && typeof root.document.addEventListener === "function") {
    root.document.addEventListener("cognation:session-ended", reset);
    root.document.addEventListener("cognation:auth-changed", reset);
  }

  var api = {
    SAGE_FLEET_ID: SAGE_FLEET_ID,
    TEST_ROLE: TEST_ROLE,
    LIST_FILTER: LIST_FILTER,
    isU13TestViewer: isU13TestViewer,
    isSageRow: isSageRow,
    noteUser: noteUser,
    ready: ready,
    reset: reset,
  };
  root.CognationU13TestViewer = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);
