/**
 * SeedOps — shared Tower seed content (hook #4).
 *
 * Generates deterministic, first-name-safe wellness-tone Tower posts for the
 * Wave 1 seed fleet so the scrapbook feels alive and News-path logging can
 * be exercised (post → curator → age floor → newspaper).
 *
 * Caps (LOCKED): Wave 1 = 100; free-trial Demo max = 250. Grow past 250 needs
 * unlockFleet / SEEDOPS_UNLOCK_FLEET (Alexa). No public WELL/demo gate control.
 * Never put service-role keys or shared ops passwords in frontend.
 *
 * Write path:
 *   1. Prefer CognationSupabaseSocial.createTowerPost when remote is active
 *      AND the signed-in session is the target seed (client path via #2/#3).
 *   2. Else write into CognationTowerStore local/demo (or SeedOps overlay
 *      when TowerStore.add refuses because remote is syncing for another user).
 * Live multi-seed Supabase apply without per-seed sign-in needs service-role
 * and is out of scope for #4 — see docs/seedops-provision.md.
 */
(function () {
  "use strict";

  var WAVE1_MAX = 100;
  var DEMO_CAP = 250;
  var OVERLAY_KEY = "cognation.seedops.tower.posts.v1";
  var LOG_CHANNEL = "tower-posts";

  /* Wellness-tone templates. Placeholders: {name}. G/PG. No Instagram framing. */
  var TEMPLATES = [
    "{name} took a slow morning walk around the block and noticed the light.",
    "Tea on the stoop before the day starts — {name} is keeping the pace gentle.",
    "{name} stretched for five minutes and felt a little more present.",
    "Library corner, soft focus: {name} is catching up on a short wellness note.",
    "{name} shared a quiet thank-you with a neighbor after the rain.",
    "Fresh air by the window. {name} is resetting between tasks.",
    "{name} packed a simple lunch and left room for an unhurried break.",
    "Evening tally: water, a short walk, and one kind word — from {name}.",
    "{name} put the phone down for a stretch and a glass of water.",
    "Community board reminder from {name}: the park bench meetup is still on.",
    "{name} is reading something short and useful instead of scrolling.",
    "Kitchen light, quiet playlist — {name} is cooking something simple tonight.",
    "{name} left a kind note for the household and headed out on foot.",
    "Block garden check-in: {name} watered the shared herbs after work.",
    "{name} chose an earlier bedtime so tomorrow feels less rushed.",
    "A small win for {name}: finished the errand list without rushing anyone.",
    "{name} waved at the bus driver and meant it — small civic kindness counts.",
    "Soft start: {name} opened the curtains and stood in daylight for a minute.",
    "{name} is saving a seat at the community table for whoever needs one.",
    "After a long day, {name} chose rest over one more task. That is enough.",
  ];

  function emitLog(payload) {
    if (window.CognationSeedOpsLog && typeof window.CognationSeedOpsLog.write === "function") {
      window.CognationSeedOpsLog.write(LOG_CHANNEL, payload || {});
    }
    try {
      document.dispatchEvent(
        new CustomEvent("cognation:seedops-tower-posts", { detail: payload || {} })
      );
    } catch (e) {}
  }

  function fleetIndex(fleetId) {
    var m = /^seed-(\d{1,4})$/.exec(String(fleetId || ""));
    if (!m) return -1;
    return parseInt(m[1], 10) - 1;
  }

  function resolveSeed(seedRef) {
    var api = window.CognationSeedOps;
    if (typeof seedRef === "object" && seedRef && (seedRef.seedFleetId || seedRef.isSeed)) {
      return seedRef;
    }
    var id = String(seedRef || "");
    if (api && typeof api.getByFleetId === "function") {
      var found = api.getByFleetId(id);
      if (found) return found;
    }
    var idx = fleetIndex(id);
    if (idx >= 0 && api && typeof api.buildSeedRecord === "function") {
      return api.buildSeedRecord(idx);
    }
    return null;
  }

  function unlockAllowed(opts) {
    opts = opts || {};
    if (opts.unlockFleet === true) return true;
    try {
      if (typeof process !== "undefined" && process.env && process.env.SEEDOPS_UNLOCK_FLEET === "1") {
        return true;
      }
    } catch (e) {}
    return false;
  }

  /**
   * Clamp a wave window. Default (0, 100). Hard stop at DEMO_CAP unless unlock.
   * Returns { ok, offset, limit, error? }.
   */
  function clampWave(opts) {
    opts = opts || {};
    var offset = Math.max(0, Number(opts.offset) || 0);
    var limit = opts.limit == null ? WAVE1_MAX : Number(opts.limit);
    if (!isFinite(limit) || limit < 0) limit = WAVE1_MAX;
    var unlock = unlockAllowed(opts);
    var hardCap = unlock ? 1000 : DEMO_CAP;
    if (offset >= hardCap) {
      return {
        ok: false,
        error: unlock ? "offset_past_fleet" : "offset_past_demo_cap",
        reason: unlock
          ? "Offset past synthesizable fleet."
          : "Offset past free-trial Demo max (" + DEMO_CAP + "). Pass unlockFleet:true only with Alexa unlock.",
        offset: offset,
        limit: 0,
        hardCap: hardCap,
      };
    }
    var end = offset + limit;
    if (end > hardCap) {
      limit = hardCap - offset;
    }
    return { ok: true, offset: offset, limit: limit, hardCap: hardCap, unlock: unlock };
  }

  function composeBody(seed) {
    var idx = fleetIndex(seed && seed.seedFleetId);
    if (idx < 0) idx = 0;
    var tpl = TEMPLATES[idx % TEMPLATES.length];
    var name = String((seed && seed.displayName) || "Friend").split(/\s+/)[0];
    /* First-name-safe: never splice digits/handles into the visible line. */
    name = name.replace(/[^A-Za-z'-]/g, "") || "Friend";
    return String(tpl).replace(/\{name\}/g, name);
  }

  function buildPost(seed, opts) {
    opts = opts || {};
    seed = resolveSeed(seed);
    if (!seed) return null;
    var body = opts.body != null ? String(opts.body) : composeBody(seed);
    var idx = fleetIndex(seed.seedFleetId);
    var stamp =
      opts.createdAt ||
      new Date(Date.UTC(2026, 9, 1, 14, 0, 0) + Math.max(0, idx) * 60000).toISOString();
    var id =
      opts.id ||
      "seedops-tower-" + String(seed.seedFleetId || "seed") + "-" + String(idx >= 0 ? idx : 0);
    return {
      id: id,
      authorName: String(seed.displayName || "").split(/\s+/)[0] || "Friend",
      handle: seed.handle || "",
      body: body.slice(0, 2000),
      createdAt: stamp,
      attachments: [],
      likes: typeof opts.likes === "number" ? opts.likes : (idx >= 0 ? (idx % 7) + 1 : 1),
      reactions: opts.reactions || {},
      profileKind: "personal",
      visibility: opts.visibility || "friends",
      accountKind: "seed",
      isSeed: true,
      seeded: true,
      seedFleetId: seed.seedFleetId || "",
      authorProfileId: seed.id || "",
      fromTower: true,
      seedopsTower: true,
    };
  }

  function readOverlay() {
    try {
      var raw = localStorage.getItem(OVERLAY_KEY);
      var doc = raw ? JSON.parse(raw) : null;
      if (!doc || !Array.isArray(doc.posts)) return { version: 1, posts: [] };
      return doc;
    } catch (e) {
      return { version: 1, posts: [] };
    }
  }

  function writeOverlay(doc) {
    try {
      localStorage.setItem(OVERLAY_KEY, JSON.stringify(doc));
      return true;
    } catch (e) {
      return false;
    }
  }

  function upsertLocalStore(post) {
    var store = window.CognationTowerStore;
    if (store && typeof store.load === "function" && typeof store.save === "function") {
      var remoteBusy = false;
      try {
        var social = window.CognationSupabaseSocial;
        remoteBusy = !!(social && typeof social.active === "function" && social.active());
      } catch (e) {}
      if (!remoteBusy) {
        var data = store.load() || { version: 1, posts: [] };
        if (!Array.isArray(data.posts)) data.posts = [];
        data.posts = data.posts.filter(function (p) {
          return !(p && (p.id === post.id || (p.seedopsTower && p.seedFleetId === post.seedFleetId && p.id === post.id)));
        });
        data.posts.unshift(post);
        if (store.save(data)) {
          try {
            document.dispatchEvent(
              new CustomEvent("cognation:tower-updated", { detail: { post: post, seedops: true } })
            );
          } catch (e2) {}
          return { ok: true, path: "tower_store", post: post };
        }
      }
    }
    /* Overlay when Tower is remote-syncing for another session, or store unavailable. */
    var overlay = readOverlay();
    overlay.posts = overlay.posts.filter(function (p) {
      return !(p && p.id === post.id);
    });
    overlay.posts.unshift(post);
    if (!writeOverlay(overlay)) {
      return { ok: false, error: "overlay_save_failed", post: post };
    }
    try {
      document.dispatchEvent(
        new CustomEvent("cognation:tower-updated", {
          detail: { post: post, seedops: true, overlay: true },
        })
      );
    } catch (e3) {}
    return { ok: true, path: "seedops_overlay", post: post };
  }

  function signedInAsSeed(seed) {
    if (!seed) return false;
    try {
      var meta = null;
      var sb = window.CognationSupabase;
      if (sb && typeof sb.getUser === "function") {
        var user = sb.getUser();
        if (user) {
          var app = user.app_metadata || user.appMetadata || {};
          var um = user.user_metadata || user.userMetadata || {};
          meta = String(app.seed_fleet_id || app.seedFleetId || um.seed_fleet_id || um.seedFleetId || "");
        }
      }
      if (meta && meta === seed.seedFleetId) return true;
      var session =
        window.CognationAuth && typeof window.CognationAuth.getSession === "function"
          ? window.CognationAuth.getSession()
          : null;
      if (!session) return false;
      var uname = String(session.username || session.profileHandle || "");
      if (uname === seed.seedFleetId || uname === seed.handle) return true;
      if (session.activeProfileId && seed.id && session.activeProfileId === seed.id) return true;
    } catch (e) {}
    return false;
  }

  function considerForNews(post) {
    if (!post) return null;
    var news = window.CognationSeedOpsNewsLog;
    if (!news) {
      emitLog({
        action: "news_consider",
        ok: false,
        error: "news_log_unavailable",
        towerPostId: post.id,
        seedFleetId: post.seedFleetId || "",
      });
      return null;
    }
    /* Emit the News-path stages SeedOps digests: post → curator → age floor. */
    emitLog({
      action: "news_consider",
      ok: true,
      stage: "post",
      towerPostId: post.id,
      seedFleetId: post.seedFleetId || "",
      authorName: post.authorName || "",
      at: new Date().toISOString(),
    });
    var ranked = news.onTowerPostsForNews
      ? news.onTowerPostsForNews([post], "local")
      : [post];
    if (news.onNewsPostRendered) {
      news.onNewsPostRendered(post, "local", { rankedIndex: 0 });
    }
    return ranked;
  }

  function tryClientWrite(seed, post) {
    var social = window.CognationSupabaseSocial;
    if (!social || typeof social.active !== "function" || !social.active()) {
      return null;
    }
    if (typeof social.createTowerPost !== "function") {
      return { ok: false, error: "createTowerPost_unavailable", deferred: true };
    }
    if (!signedInAsSeed(seed)) {
      return {
        ok: false,
        error: "remote_needs_seed_session",
        deferred: true,
        reason:
          "Remote Tower write prefers the client path when signed in as this seed (hooks #2/#3). Bulk service-role apply is out of scope for #4 — local/demo store used instead when possible.",
        seedFleetId: seed.seedFleetId,
      };
    }
    return {
      promise: social.createTowerPost({ body: post.body, attachments: [] }).then(
        function () {
          return { ok: true, path: "supabase_client", post: post, seedFleetId: seed.seedFleetId };
        },
        function (err) {
          return {
            ok: false,
            error: "supabase_client_failed",
            reason: String(err && err.message ? err.message : err),
            seedFleetId: seed.seedFleetId,
          };
        }
      ),
    };
  }

  /**
   * Post one seed Tower update. Synchronous local/demo path by default.
   * When remote + signed in as that seed, returns { ok:true, pending: Promise }.
   */
  function postOne(seedRef, opts) {
    opts = opts || {};
    var seed = resolveSeed(seedRef);
    if (!seed || !(seed.isSeed || String(seed.accountKind || "") === "seed")) {
      /* Allow ops bots only when explicitly requested; default is seed fleet. */
      if (!(opts.allowOps && seed && (seed.isOpsBot || seed.accountKind === "ops"))) {
        var bad = {
          ok: false,
          error: "unknown_seed",
          reason: "Need a seed fleet id like seed-0001.",
          target: seedRef || "",
        };
        emitLog({ action: "post_one", ok: false, error: bad.error, target: bad.target });
        return bad;
      }
    }
    var idx = fleetIndex(seed.seedFleetId);
    if (idx >= DEMO_CAP && !unlockAllowed(opts)) {
      var capped = {
        ok: false,
        error: "past_demo_cap",
        reason: "Free-trial Demo max is " + DEMO_CAP + ". Alexa unlock required past that.",
        seedFleetId: seed.seedFleetId,
      };
      emitLog({ action: "post_one", ok: false, error: capped.error, seedFleetId: seed.seedFleetId });
      return capped;
    }

    var post = buildPost(seed, opts);
    if (!post) {
      return { ok: false, error: "build_failed", target: seedRef || "" };
    }

    if (!opts.localOnly) {
      var client = tryClientWrite(seed, post);
      if (client && client.promise) {
        emitLog({
          action: "post_one",
          ok: true,
          path: "supabase_client_pending",
          seedFleetId: seed.seedFleetId,
          towerPostId: post.id,
        });
        considerForNews(post);
        return {
          ok: true,
          pending: true,
          path: "supabase_client",
          post: post,
          seedFleetId: seed.seedFleetId,
          promise: client.promise.then(function (result) {
            emitLog({
              action: "post_one_settled",
              ok: !!(result && result.ok),
              path: "supabase_client",
              seedFleetId: seed.seedFleetId,
              towerPostId: post.id,
              error: result && result.error,
            });
            return result;
          }),
        };
      }
      /* remote_needs_seed_session → fall through to local/demo store so News path still works */
    }

    var written = upsertLocalStore(post);
    emitLog({
      action: "post_one",
      ok: !!written.ok,
      path: written.path || "",
      seedFleetId: seed.seedFleetId,
      towerPostId: post.id,
      authorName: post.authorName,
      error: written.error,
      at: new Date().toISOString(),
    });
    if (written.ok) considerForNews(post);
    return {
      ok: !!written.ok,
      path: written.path,
      post: post,
      seedFleetId: seed.seedFleetId,
      withinWave1: idx < 0 || idx < WAVE1_MAX,
      withinDemoCap: idx < 0 || idx < DEMO_CAP,
      error: written.error,
      note:
        written.path === "seedops_overlay"
          ? "Stored in SeedOps overlay (Tower remote for another session). Sign in as this seed for live client write."
          : undefined,
    };
  }

  function postWave(opts) {
    opts = opts || {};
    var window_ = clampWave(opts);
    if (!window_.ok) {
      emitLog({
        action: "post_wave",
        ok: false,
        error: window_.error,
        reason: window_.reason,
        offset: window_.offset,
      });
      return {
        ok: false,
        error: window_.error,
        reason: window_.reason,
        offset: window_.offset,
        limit: 0,
        results: [],
      };
    }
    var results = [];
    var i;
    for (i = 0; i < window_.limit; i++) {
      var n = window_.offset + i + 1;
      var pad = String(n);
      while (pad.length < 4) pad = "0" + pad;
      results.push(
        postOne("seed-" + pad, { localOnly: opts.localOnly, unlockFleet: opts.unlockFleet })
      );
    }
    var okCount = results.filter(function (r) {
      return r && r.ok;
    }).length;
    var summary = {
      ok: okCount === results.length,
      offset: window_.offset,
      limit: window_.limit,
      posted: okCount,
      failed: results.length - okCount,
      hardCap: window_.hardCap,
      results: results,
      at: new Date().toISOString(),
    };
    emitLog({
      action: "post_wave",
      ok: summary.ok,
      offset: summary.offset,
      limit: summary.limit,
      posted: summary.posted,
      failed: summary.failed,
      hardCap: summary.hardCap,
    });
    return summary;
  }

  function listOverlay() {
    return readOverlay().posts.slice();
  }

  function clearOverlay() {
    try {
      localStorage.removeItem(OVERLAY_KEY);
    } catch (e) {}
    emitLog({ action: "clear_overlay", ok: true });
    return { ok: true };
  }

  window.CognationSeedOpsTowerPosts = {
    WAVE1_MAX: WAVE1_MAX,
    DEMO_CAP: DEMO_CAP,
    OVERLAY_KEY: OVERLAY_KEY,
    TEMPLATES: TEMPLATES.slice(),
    composeBody: composeBody,
    buildPost: buildPost,
    clampWave: clampWave,
    postOne: postOne,
    postWave: postWave,
    listOverlay: listOverlay,
    clearOverlay: clearOverlay,
    considerForNews: considerForNews,
  };
})();
