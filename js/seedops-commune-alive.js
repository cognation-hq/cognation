/**
 * SeedOps — Commune / dating / chatroom bootstrap for seed↔seed demo sessions.
 *
 * Live Tower posts alone do not fill the COMMUNE swipe deck (facts/wellness/
 * rooms/dating come from local member profile + CognationAccounts). When a
 * seed or ops session is signed in, this module:
 *   1) Ensures member age/city/interests so site chat rooms are enterable
 *   2) Materializes a Wave sample of dating-ready seed profiles (local city,
 *      SVG avatar, datingContent opt-in) into CognationAccounts
 *   3) Soft-refills the Commune deck when CognationCommuneSwipe is present
 *
 * Caps: Demo max 250. No public Demo gate control. Never put service-role keys or shared ops passwords in frontend.
 */
(function () {
  "use strict";

  var LOG_CHANNEL = "commune-alive";
  var DEMO_CITY = "Demo City";
  var DEMO_STATE = "Demo";
  var DEMO_COUNTRY = "United States";
  var MATERIALIZE_COUNT = 48; /* enough for dating spacing in a paced deck */
  var BOOT_FLAG = "cognation.seedops.communeAlive.v1";

  var INTEREST_POOL = [
    "tech",
    "ai",
    "jobs",
    "mental health",
    "gamers",
    "public policy",
    "moms",
  ];

  /* auth.getUser() is async (GET /auth/v1/user) and returns a Promise. Await
     it before acting; sync readers use only the resolved user, never the
     pending Promise. undefined = not fetched yet, null = no user / error. */
  var authUser;
  var authUserPending = null;
  /* Bumped on reset so a getUser that resolves after sign-out cannot
     repopulate the cache with the previous user. */
  var authUserGen = 0;

  function awaitAuthUser() {
    var sb = window.CognationSupabase;
    if (!sb || typeof sb.getUser !== "function") {
      authUser = null;
      return Promise.resolve({ user: null, error: "no_supabase_client" });
    }
    try {
      if (typeof sb.configured === "function" && !sb.configured()) {
        authUser = null;
        return Promise.resolve({ user: null, error: "supabase_not_configured" });
      }
      if (typeof sb.getSession === "function") {
        var s = sb.getSession();
        if (!s || !s.access_token) {
          authUser = null;
          return Promise.resolve({ user: null, error: "no_session" });
        }
      }
    } catch (e) {}
    if (authUserPending) return authUserPending;
    var gen = authUserGen;
    var pending;
    try {
      pending = Promise.resolve(sb.getUser());
    } catch (e2) {
      pending = Promise.reject(e2);
    }
    authUserPending = pending
      .then(
        function (user) {
          var u = user && typeof user === "object" && (user.id || user.email || user.app_metadata || user.user_metadata) ? user : null;
          if (gen !== authUserGen) return { user: null, error: "auth_reset" };
          authUser = u;
          return u ? { user: u } : { user: null, error: "no_auth_user" };
        },
        function (err) {
          if (gen !== authUserGen) return { user: null, error: "auth_reset" };
          authUser = null;
          return { user: null, error: "get_user_failed", reason: String(err && err.message ? err.message : err) };
        }
      )
      .then(function (r) {
        if (gen === authUserGen) authUserPending = null;
        return r;
      });
    return authUserPending;
  }

  function knownAuthUser() {
    return authUser || null;
  }

  function resetAuthUser() {
    authUser = undefined;
    authUserPending = null;
    authUserGen += 1;
  }

  function emitLog(payload) {
    if (window.CognationSeedOpsLog && typeof window.CognationSeedOpsLog.write === "function") {
      window.CognationSeedOpsLog.write(LOG_CHANNEL, payload || {});
    }
    try {
      document.dispatchEvent(
        new CustomEvent("cognation:seedops-commune-alive", { detail: payload || {} })
      );
    } catch (e) {}
  }

  function readJson(store, key, fallback) {
    try {
      var raw = store.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(store, key, data) {
    try {
      store.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* Seed and ops accounts sign in with an internal address on the seed auth
     domain or the ops auth domain (scripts/seedops-bind-auth.mjs). A bare
     "seed-" / "ops-" username prefix is not a marker: after Supabase sign-in
     session.username is the member's own email. Returns the fleet id or "". */
  var SEED_AUTH_DOMAIN = "seed.cognation.internal";
  var OPS_AUTH_DOMAIN = "ops.cognation.internal";
  function fleetFromAuthEmail(value) {
    var s = String(value || "").trim().toLowerCase();
    var at = s.lastIndexOf("@");
    if (at <= 0) return "";
    var local = s.slice(0, at);
    var domain = s.slice(at + 1);
    if (domain === SEED_AUTH_DOMAIN && /^seed-\d{4}$/.test(local)) return local;
    if (domain === OPS_AUTH_DOMAIN && /^ops-[a-z0-9-]+$/.test(local)) return local;
    return "";
  }

  function isSeedOrOpsSession() {
    try {
      if (window.CognationSeedOpsTrigger && typeof window.CognationSeedOpsTrigger.isArmed === "function") {
        if (window.CognationSeedOpsTrigger.isArmed()) return true;
      }
    } catch (e) {}
    try {
      var user = knownAuthUser();
      if (user) {
        /* Server-set app_metadata only. Removed: user_metadata account_kind,
           seed_fleet_id and seedops (any member can write their own user_metadata). */
        var app = user.app_metadata || user.appMetadata || {};
        var kind = String(app.account_kind || app.accountKind || "");
        var fleet = String(app.seed_fleet_id || app.seedFleetId || "");
        if (kind === "seed" || kind === "ops") return true;
        if (/^seed-\d{4}$/.test(fleet) || /^ops-/.test(fleet)) return true;
        if (app.seedops === true) return true;
        if (fleetFromAuthEmail(user.email)) return true;
      }
    } catch (e2) {}
    try {
      var session =
        window.CognationAuth && typeof window.CognationAuth.getSession === "function"
          ? window.CognationAuth.getSession()
          : readJson(localStorage, "cognation.session.v2", null);
      if (!session) return false;
      /* Removed: bare /^seed-/, /^seed-\d{4}$/, /^ops-/ match on session.username /
         profileHandle. Only the seed or ops auth domain counts. */
      if (fleetFromAuthEmail(session.username)) return true;
    } catch (e3) {}
    return false;
  }

  function svgAvatar(name, idx) {
    var label = String(name || "S").slice(0, 1).toUpperCase();
    var hues = [200, 160, 320, 30, 260, 120, 10, 180];
    var h = hues[Math.abs(Number(idx) || 0) % hues.length];
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">' +
      '<rect width="240" height="240" fill="hsl(' +
      h +
      ',42%,42%)"/>' +
      '<text x="120" y="138" text-anchor="middle" font-family="system-ui,sans-serif" font-size="96" fill="#fff">' +
      label +
      "</text></svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function ensureMemberProfile() {
    var swipe = window.CognationCommuneSwipe;
    var prev =
      (swipe && typeof swipe.getMemberProfile === "function" && swipe.getMemberProfile()) ||
      readJson(localStorage, "cognation.member.profile.v1", {}) ||
      {};
    var next = {};
    Object.keys(prev).forEach(function (k) {
      next[k] = prev[k];
    });
    /* No age default: the profile age only mirrors user_birth (setDatingBirthAge),
       so an unknown age stays unset and the 18+ gates fail closed. */
    if (!next.city && !next.locality) next.city = DEMO_CITY;
    if (!next.state) next.state = DEMO_STATE;
    if (!next.country) next.country = DEMO_COUNTRY;
    if (!next.interests || (Array.isArray(next.interests) && !next.interests.length)) {
      next.interests = INTEREST_POOL.slice(0, 5);
    } else if (typeof next.interests === "string" && !String(next.interests).trim()) {
      next.interests = INTEREST_POOL.slice(0, 5).join(", ");
    }
    if (swipe && typeof swipe.setMemberProfile === "function") {
      swipe.setMemberProfile(next);
    } else {
      writeJson(localStorage, "cognation.member.profile.v1", next);
      try {
        document.dispatchEvent(new CustomEvent("cognation:member-profile-updated", { detail: next }));
      } catch (e) {}
    }
    return next;
  }

  function enrichSeedForDating(rec, index) {
    if (!rec || typeof rec !== "object") return rec;
    rec.city = rec.city || DEMO_CITY;
    rec.state = rec.state || DEMO_STATE;
    rec.country = rec.country || DEMO_COUNTRY;
    rec.datingContent = true;
    rec.datingEnabled = true;
    rec.showDatingContent = true;
    rec.datingMinAge = 18;
    if (!rec.avatarDataUrl && !rec.photo && !rec.avatarUrl) {
      rec.avatarDataUrl = svgAvatar(rec.displayName || "S", index);
    }
    if (!rec.bio) {
      rec.bio = "Seed demo profile in " + DEMO_CITY + " — open to meeting someone local.";
    }
    return rec;
  }

  function materializeDatingSample(count) {
    /* Fail closed: seed dating profiles are only written for seed/ops sessions
       (callers include the See dating toggle via dating-hydrate / commune-swipe). */
    if (!isSeedOrOpsSession()) {
      return { ok: false, error: "not_seed_or_ops", skipped: true, count: 0 };
    }
    count = Math.max(0, Math.min(250, Number(count) || MATERIALIZE_COUNT));
    var api = window.CognationSeedOps;
    var accounts = window.CognationAccounts;
    if (!api || typeof api.buildSeedRecord !== "function") {
      return { ok: false, error: "seedops_unavailable", count: 0 };
    }
    if (!accounts || typeof accounts.saveProfileRecord !== "function") {
      return { ok: false, error: "accounts_unavailable", count: 0 };
    }
    if (typeof api.materializeSample === "function") {
      api.materializeSample(count);
    }
    var saved = 0;
    var dating = 0;
    var i;
    for (i = 0; i < count; i++) {
      var rec = api.buildSeedRecord(i);
      var existing =
        (accounts.getProfileById && accounts.getProfileById(rec.id)) || rec;
      enrichSeedForDating(existing, i);
      /* Skip the signed-in seed's own card from dating pool later via viewerIds */
      accounts.saveProfileRecord(existing);
      saved += 1;
      if (existing.datingContent) dating += 1;
    }
    return { ok: true, count: saved, dating: dating };
  }

  function refillDeck() {
    var swipe = window.CognationCommuneSwipe;
    if (!swipe) return { ok: false, error: "swipe_unavailable" };
    var deck = [];
    if (typeof swipe.sampleDeck === "function") {
      deck = swipe.sampleDeck(18) || [];
    }
    if (typeof swipe.rebuild === "function") {
      try {
        swipe.rebuild();
      } catch (e) {}
    }
    var types = {};
    (deck || []).forEach(function (c) {
      var t = (c && c.type) || "unknown";
      types[t] = (types[t] || 0) + 1;
    });
    return { ok: true, cardCount: (deck || []).length, types: types };
  }

  function roomPreview() {
    var swipe = window.CognationCommuneSwipe;
    if (!swipe || typeof swipe.sampleDeck !== "function") return { rooms: 0 };
    var deck = swipe.sampleDeck(24) || [];
    var rooms = deck.filter(function (c) {
      return c && c.type === "chatroom";
    });
    return { rooms: rooms.length, sample: rooms.slice(0, 3).map(function (r) { return r.title; }) };
  }

  /**
   * Run bootstrap. Safe to call repeatedly; skips heavy work if already booted
   * for this session unless opts.force. Seed/ops sessions only, even with force.
   */
  function bootstrap(opts) {
    opts = opts || {};
    /* Fail closed: force only skips the BOOT_FLAG cache, never the seed/ops
       gate, so no caller can write seed data into a real user's session. */
    if (!isSeedOrOpsSession()) {
      return { ok: false, error: "not_seed_or_ops", skipped: true };
    }
    var prior = readJson(sessionStorage, BOOT_FLAG, null);
    if (prior && prior.ok && !opts.force) {
      /* If dating-flagged profiles vanished (new tab storage wipe / tower-only hydrate),
         rematerialize so See dating toggle is not a blank deck. */
      var datingHydrate = window.CognationSeedOpsDatingHydrate;
      var biosReady =
        datingHydrate && typeof datingHydrate.datingBiosReady === "function"
          ? datingHydrate.datingBiosReady(1)
          : false;
      if (!biosReady) {
        try {
          sessionStorage.removeItem(BOOT_FLAG);
        } catch (eStaleAlive) {}
        prior = null;
      } else {
        return { ok: true, cached: true, prior: prior };
      }
    }
    var member = ensureMemberProfile();
    var mat = materializeDatingSample(opts.count || MATERIALIZE_COUNT);
    var deck = refillDeck();
    var rooms = roomPreview();
    var result = {
      ok: !!(mat && mat.ok),
      memberAge:
        window.CognationCommuneSwipe && typeof window.CognationCommuneSwipe.getMemberAge === "function"
          ? window.CognationCommuneSwipe.getMemberAge()
          : null,
      memberCity: member && (member.city || member.locality),
      materialized: mat && mat.count,
      datingProfiles: mat && mat.dating,
      deckCards: deck && deck.cardCount,
      deckTypes: deck && deck.types,
      chatroomCards: rooms && rooms.rooms,
      roomTitles: rooms && rooms.sample,
      at: new Date().toISOString(),
      error: mat && mat.error,
    };
    writeJson(sessionStorage, BOOT_FLAG, result);
    emitLog({ action: "bootstrap", ok: result.ok, result: result });
    return result;
  }

  /**
   * Await auth.getUser before any bootstrap read/write. No signed-in user or a
   * getUser error: log and skip (nothing written).
   */
  function bootstrapAfterAuth(opts) {
    return awaitAuthUser().then(function (auth) {
      if (!auth.user) {
        emitLog({
          action: "bootstrap_skipped",
          ok: false,
          error: auth.error || "no_auth_user",
          reason: "No signed-in auth user (auth.getUser); bootstrap skipped.",
        });
        return { ok: false, error: auth.error || "no_auth_user", skipped: true };
      }
      if (!isSeedOrOpsSession()) {
        return { ok: false, error: "not_seed_or_ops", skipped: true };
      }
      return bootstrap(opts);
    });
  }

  function boot() {
    /* Delay slightly so commune-swipe + auth settle */
    setTimeout(function () {
      bootstrapAfterAuth();
    }, 400);
    document.addEventListener("cognation:auth-changed", function () {
      try {
        sessionStorage.removeItem(BOOT_FLAG);
      } catch (e) {}
      resetAuthUser();
      bootstrapAfterAuth({ force: true });
    });
    /* login.js fires these on in-page sign-in / sign-out (auth-changed never fires). */
    document.addEventListener("cognation:session-started", function () {
      try {
        sessionStorage.removeItem(BOOT_FLAG);
      } catch (e) {}
      resetAuthUser();
      bootstrapAfterAuth({ force: true });
    });
    document.addEventListener("cognation:session-ended", function () {
      resetAuthUser();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.CognationSeedOpsCommuneAlive = {
    DEMO_CITY: DEMO_CITY,
    MATERIALIZE_COUNT: MATERIALIZE_COUNT,
    isSeedOrOpsSession: isSeedOrOpsSession,
    ensureMemberProfile: ensureMemberProfile,
    materializeDatingSample: materializeDatingSample,
    bootstrap: bootstrap,
    bootstrapAfterAuth: bootstrapAfterAuth,
    awaitAuthUser: awaitAuthUser,
    knownAuthUser: knownAuthUser,
    refillDeck: refillDeck,
  };
})();
