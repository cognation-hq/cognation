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

  /* gen: bumped on reset so a load that started for an earlier session can't
     fill this one. profileFor: user id whose profile row actually loaded. */
  var cache = { user: null, profile: null, loading: null, gen: 0, profileFor: "" };

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

  /* test_role in the fetched auth user_metadata. Restrict-only: on its own it
     only skips the adult defaults and prefs saves, it never grants anything. */
  function metadataHasTestRole(meta) {
    return !!meta && meta.test_role === TEST_ROLE;
  }

  function supabaseSignedIn() {
    if (signedInSession()) return true;
    var sb = client();
    var s = sb && typeof sb.getSession === "function" ? sb.getSession() : null;
    return !!(s && s.access_token);
  }

  /* Sync check for skipping adult seed defaults: true when confirmed, when the
     fetched metadata has test_role, or when signed in but not loaded yet.
     "Not loaded" is never treated as "not the test viewer". */
  function mayBeU13TestViewer() {
    if (isU13TestViewer()) return true;
    if (!supabaseSignedIn()) return false;
    var s = signedInSession();
    if (!s || !cache.user || String(cache.user.id) !== String(s.supabaseUserId)) return true;
    return metadataHasTestRole(cache.user.user_metadata || cache.user.userMetadata);
  }

  /* Resolves once a signed-in session exists (login state ready). */
  function whenSignedIn() {
    if (signedInSession()) return Promise.resolve();
    var doc = root.document;
    if (!doc || typeof doc.addEventListener !== "function") return new Promise(function () {});
    var names = ["cognation:session-started", "cognation:auth-changed", "cognation:remote-profile-loaded"];
    return new Promise(function (resolve) {
      function on() {
        if (!signedInSession()) return;
        names.forEach(function (n) { doc.removeEventListener(n, on); });
        resolve();
      }
      names.forEach(function (n) { doc.addEventListener(n, on); });
    });
  }

  /* For writes: waits for the login state AND the profile row. Resolves true
     (test viewer), false (confirmed not), or null when it could not be told
     (load failed). Callers must skip on anything but false. */
  function settled() {
    return whenSignedIn()
      .then(function () { return ready(); })
      .then(function (result) {
        var s = signedInSession();
        var loaded = !!(s && cache.user && cache.profileFor && String(cache.profileFor) === String(s.supabaseUserId) &&
          String(cache.user.id) === String(s.supabaseUserId));
        return loaded ? !!result : null;
      });
  }

  /* Loads the signed-in user and their personal profile row once per session.
     Resolves to isU13TestViewer(); false on any error or missing data. */
  function ready() {
    var sb = client();
    var s = signedInSession();
    if (!sb || !s || typeof sb.rest !== "function") return Promise.resolve(false);
    if (cache.user && cache.profileFor && String(cache.profileFor) === String(s.supabaseUserId)) {
      return Promise.resolve(isU13TestViewer());
    }
    if (cache.loading) return cache.loading;
    var gen = cache.gen;
    var userP =
      cache.user && String(cache.user.id) === String(s.supabaseUserId)
        ? Promise.resolve(cache.user)
        : typeof sb.getUser === "function"
          ? sb.getUser()
          : Promise.resolve(null);
    cache.loading = userP
      .then(function (user) {
        if (gen !== cache.gen || !user || !user.id) return false;
        cache.user = user;
        return sb
          .rest("profiles", {
            query:
              "select=id,user_id,account_kind,seed_fleet_id&kind=eq.personal&limit=1&user_id=eq." +
              encodeURIComponent(user.id),
          })
          .then(function (rows) {
            if (gen !== cache.gen) return false;
            cache.profile = Array.isArray(rows) && rows[0] ? rows[0] : null;
            cache.profileFor = String(user.id);
            return isU13TestViewer();
          });
      })
      .catch(function () {
        return false;
      })
      .then(function (result) {
        if (gen === cache.gen) cache.loading = null;
        return result;
      });
    return cache.loading;
  }

  function reset() {
    cache.gen += 1;
    cache.user = null;
    cache.profile = null;
    cache.loading = null;
    cache.profileFor = "";
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
    metadataHasTestRole: metadataHasTestRole,
    mayBeU13TestViewer: mayBeU13TestViewer,
    ready: ready,
    settled: settled,
    reset: reset,
  };
  root.CognationU13TestViewer = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);
