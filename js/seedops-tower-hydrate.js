/**
 * SeedOps — hydrate Tower seed profiles from existing server rows.
 *
 * Pulls seed profiles (first-name display), maps friendships → top friends /
 * featuredFriendIds, and surfaces tower_posts as Tower activity. Cap 250.
 * Does NOT invent new fleet accounts past 250.
 *
 * HH: hydrate-from-existing first; SeedOps content gen (tower-posts) only when
 * shells are still empty after hydrate. No public Demo gate control.
 */
(function () {
  "use strict";

  var LOG_CHANNEL = "tower-hydrate";
  var BOOT_FLAG = "cognation.seedops.towerHydrate.v1";
  var HARD_CAP = 250;
  var FETCH_LIMIT = 250;
  var TOP_FRIENDS = 8;
  var hydrating = false;

  function emitLog(payload) {
    if (window.CognationSeedOpsLog && typeof window.CognationSeedOpsLog.write === "function") {
      window.CognationSeedOpsLog.write(LOG_CHANNEL, payload || {});
    }
    try {
      document.dispatchEvent(
        new CustomEvent("cognation:seedops-tower-hydrate", { detail: payload || {} })
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

  function client() {
    return window.CognationSupabase || null;
  }

  function isConfigured() {
    var sb = client();
    return !!(sb && typeof sb.configured === "function" && sb.configured());
  }

  /** Plain first name only — strip last names / trailing numbers. */
  function firstNameOnly(name) {
    var s = String(name || "").trim();
    if (!s) return "";
    var first = s.split(/\s+/)[0] || s;
    first = first.replace(/\d+/g, "").replace(/[^A-Za-z'-]/g, "");
    return (first || s).slice(0, 40);
  }

  function fleetIndex(fleetId) {
    var m = /^seed-(\d{1,4})$/.exec(String(fleetId || ""));
    if (!m) return -1;
    return parseInt(m[1], 10) - 1;
  }

  function fetchSeedProfiles() {
    var sb = client();
    if (!sb || typeof sb.rest !== "function") {
      return Promise.reject(new Error("supabase_unavailable"));
    }
    var q =
      "select=id,user_id,handle,display_name,bio,account_kind,seed_fleet_id,kind" +
      "&account_kind=eq.seed" +
      "&kind=eq.personal" +
      "&order=seed_fleet_id.asc" +
      "&limit=" +
      Math.min(FETCH_LIMIT, HARD_CAP);
    return sb.rest("profiles", { query: q }).then(function (rows) {
      return Array.isArray(rows) ? rows.slice(0, HARD_CAP) : [];
    });
  }

  function fetchTowerPostsForAuthors(profileIds) {
    var sb = client();
    if (!sb || typeof sb.rest !== "function") {
      return Promise.resolve([]);
    }
    var ids = (Array.isArray(profileIds) ? profileIds : []).filter(Boolean).slice(0, HARD_CAP);
    if (!ids.length) return Promise.resolve([]);
    /* PostgREST `in` filter — batch in chunks of 40 to keep URLs short. */
    var chunks = [];
    var i;
    for (i = 0; i < ids.length; i += 40) chunks.push(ids.slice(i, i + 40));
    return Promise.all(
      chunks.map(function (chunk) {
        var listed = "(" + chunk.map(function (id) {
          return encodeURIComponent(id);
        }).join(",") + ")";
        var q =
          "select=id,author_profile_id,body,visibility,attachments,created_at" +
          ",author:profiles!tower_posts_author_profile_id_fkey(id,user_id,kind,handle,display_name,account_kind,seed_fleet_id)" +
          "&author_profile_id=in." +
          listed +
          "&order=created_at.desc&limit=100";
        return sb.rest("tower_posts", { query: q }).then(function (rows) {
          return Array.isArray(rows) ? rows : [];
        }).catch(function () {
          return [];
        });
      })
    ).then(function (parts) {
      var out = [];
      parts.forEach(function (part) {
        (part || []).forEach(function (row) {
          out.push(row);
        });
      });
      return out.slice(0, HARD_CAP);
    });
  }

  function fetchViewerFriendships() {
    var sb = client();
    if (!sb || typeof sb.rest !== "function") return Promise.resolve([]);
    var session =
      window.CognationAuth && typeof window.CognationAuth.getSession === "function"
        ? window.CognationAuth.getSession()
        : null;
    var uid = session && (session.supabaseUserId || session.userId);
    if (!uid) return Promise.resolve([]);
    var enc = encodeURIComponent(uid);
    return sb
      .rest("friendships", {
        query:
          "select=user_id,friend_user_id,created_at&or=(user_id.eq." +
          enc +
          ",friend_user_id.eq." +
          enc +
          ")&limit=" +
          HARD_CAP,
      })
      .then(function (rows) {
        return Array.isArray(rows) ? rows : [];
      })
      .catch(function () {
        return [];
      });
  }

  function mapPost(row, fleetByServerId) {
    var author = row && (row.author || row.profiles) || null;
    var serverId = String((author && author.id) || row.author_profile_id || "");
    var seed = fleetByServerId[serverId] || null;
    var display =
      firstNameOnly((author && author.display_name) || (seed && seed.displayName) || "") ||
      "Seed";
    var handle = author && author.handle ? String(author.handle).replace(/^@/, "") : (seed && seed.handle) || "";
    var fleet =
      (author && (author.seed_fleet_id || author.seedFleetId)) ||
      (seed && seed.seedFleetId) ||
      "";
    return {
      id: row.id,
      _remote: true,
      seeded: true,
      isSeed: true,
      seedFleetId: fleet,
      authorProfileId: row.author_profile_id,
      authorName: display,
      handle: handle,
      body: row.body || "",
      createdAt: row.created_at,
      attachments: Array.isArray(row.attachments) ? row.attachments : [],
      likes: 0,
      reactions: {},
      visibility: row.visibility || "friends",
    };
  }

  function mergeSeedProfiles(rows) {
    var api = window.CognationSeedOps;
    var accounts = window.CognationAccounts;
    if (!api || typeof api.getByFleetId !== "function") {
      return { ok: false, error: "seedops_unavailable", merged: 0, byServerId: {} };
    }
    if (!accounts || typeof accounts.saveProfileRecord !== "function") {
      return { ok: false, error: "accounts_unavailable", merged: 0, byServerId: {} };
    }
    var list = Array.isArray(rows) ? rows : [];
    var merged = 0;
    var byServerId = {};
    var byUserId = {};
    var i;
    for (i = 0; i < list.length && merged < HARD_CAP; i++) {
      var row = list[i];
      if (!row) continue;
      var fleet = String(row.seed_fleet_id || row.seedFleetId || "");
      if (!fleet) continue;
      /* Cap 250 — refuse inventing past Demo max; only hydrate existing rows. */
      var idx = fleetIndex(fleet);
      if (idx < 0 || idx >= HARD_CAP) continue;
      var base = api.getByFleetId(fleet);
      if (!base) continue;
      var existing =
        (accounts.getProfileById && accounts.getProfileById(base.id)) || base;
      existing.accountKind = "seed";
      existing.isSeed = true;
      existing.demo = true;
      existing.seedFleetId = fleet;
      existing.kind = "personal";
      if (row.id) {
        existing.serverProfileId = String(row.id);
        byServerId[String(row.id)] = existing;
      }
      if (row.user_id) {
        existing.serverUserId = String(row.user_id);
        byUserId[String(row.user_id)] = existing;
      }
      if (row.handle) existing.handle = String(row.handle).replace(/^@/, "").slice(0, 40);
      var first = firstNameOnly(row.display_name || existing.displayName || base.displayName);
      if (first) existing.displayName = first;
      if (row.bio && !existing.slogan) existing.slogan = String(row.bio).slice(0, 400);
      if (!Array.isArray(existing.friendIds)) existing.friendIds = [];
      if (!Array.isArray(existing.featuredFriendIds)) existing.featuredFriendIds = [];
      if (!existing.friendsDisplayCount) existing.friendsDisplayCount = 3;
      if (!existing.publicWidgets || typeof existing.publicWidgets !== "object") {
        existing.publicWidgets = {
          identity: true,
          slogan: !!existing.slogan,
          social: false,
          music: false,
          badges: false,
          friends: true,
          html: false,
          calendar: false,
        };
      }
      accounts.saveProfileRecord(existing);
      merged += 1;
    }
    return { ok: true, merged: merged, byServerId: byServerId, byUserId: byUserId };
  }

  function applyFriendships(rows, byUserId) {
    var accounts = window.CognationAccounts;
    if (!accounts || typeof accounts.saveProfileRecord !== "function") {
      return { applied: 0 };
    }
    var edges = Array.isArray(rows) ? rows : [];
    var applied = 0;
    var touched = {};

    function nextFriendId(userId) {
      var peer = byUserId[String(userId || "")];
      if (!peer) return "";
      return peer.handle || peer.id || "";
    }

    edges.forEach(function (row) {
      if (!row) return;
      var a = byUserId[String(row.user_id || "")];
      var b = byUserId[String(row.friend_user_id || "")];
      /* Prefer seed↔seed edges among hydrated fleet; also map viewer↔seed when present. */
      function link(from, toUserId) {
        if (!from) return;
        var fid = nextFriendId(toUserId);
        if (!fid) return;
        if (!Array.isArray(from.friendIds)) from.friendIds = [];
        if (from.friendIds.indexOf(fid) < 0) {
          from.friendIds.push(fid);
          if (from.friendIds.length > HARD_CAP) from.friendIds = from.friendIds.slice(0, HARD_CAP);
        }
        if (!Array.isArray(from.featuredFriendIds)) from.featuredFriendIds = [];
        if (from.featuredFriendIds.indexOf(fid) < 0 && from.featuredFriendIds.length < TOP_FRIENDS) {
          from.featuredFriendIds.push(fid);
        }
        from.publicWidgets = from.publicWidgets || {};
        if (from.featuredFriendIds.length) from.publicWidgets.friends = true;
        touched[from.id] = from;
      }
      if (a) link(a, row.friend_user_id);
      if (b) link(b, row.user_id);
    });

    Object.keys(touched).forEach(function (id) {
      accounts.saveProfileRecord(touched[id]);
      applied += 1;
    });
    return { applied: applied };
  }

  function applyTowerPosts(rows, byServerId) {
    var posts = [];
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (!row) return;
      posts.push(mapPost(row, byServerId || {}));
    });
    if (!posts.length) return { applied: 0, posts: [] };

    var store = window.CognationTowerStore;
    if (store && typeof store.setRemotePosts === "function" && store.load) {
      try {
        var existing = [];
        try {
          var data = store.load();
          if (data && Array.isArray(data.posts)) existing = data.posts.slice();
        } catch (eLoad) {}
        var byId = {};
        existing.forEach(function (p) {
          if (p && p.id) byId[p.id] = p;
        });
        posts.forEach(function (p) {
          if (p && p.id) byId[p.id] = p;
        });
        var merged = Object.keys(byId).map(function (id) {
          return byId[id];
        });
        /* Prefer remote marker when any remote posts landed. */
        var hasRemote = merged.some(function (p) {
          return p && p._remote;
        });
        if (hasRemote && typeof store.setRemotePosts === "function") {
          store.setRemotePosts(merged.slice(0, HARD_CAP));
        }
      } catch (eSet) {}
    }

    /* Also keep SeedOps overlay in sync for offline / unsigned viewers. */
    try {
      var key = "cognation.seedops.tower.posts.v1";
      var overlay = readJson(localStorage, key, { version: 1, posts: [] }) || { version: 1, posts: [] };
      if (!Array.isArray(overlay.posts)) overlay.posts = [];
      var seen = {};
      overlay.posts.forEach(function (p) {
        if (p && p.id) seen[p.id] = true;
      });
      posts.forEach(function (p) {
        if (!p || !p.id || seen[p.id]) return;
        overlay.posts.unshift(p);
        seen[p.id] = true;
      });
      overlay.posts = overlay.posts.slice(0, HARD_CAP);
      writeJson(localStorage, key, overlay);
    } catch (eOv) {}

    try {
      document.dispatchEvent(
        new CustomEvent("cognation:tower-updated", {
          detail: { seedops: true, hydrate: true, count: posts.length },
        })
      );
    } catch (eEv) {}

    return { applied: posts.length, posts: posts };
  }

  /** Seeds still without any activity after hydrate → SeedOps content gen only then. */
  function fillEmptyShells(byServerId, postCountByFleet) {
    var api = window.CognationSeedOpsTowerPosts;
    if (!api || typeof api.postOne !== "function") {
      return { generated: 0, skipped: true, error: "tower_posts_api_unavailable" };
    }
    var generated = 0;
    var fleets = Object.keys(byServerId || {});
    var i;
    for (i = 0; i < fleets.length && generated < 40; i++) {
      var rec = byServerId[fleets[i]];
      if (!rec || !rec.seedFleetId) continue;
      var have = postCountByFleet[rec.seedFleetId] || 0;
      if (have > 0) continue;
      try {
        var result = api.postOne(rec.seedFleetId, { news: false });
        if (result && result.ok) generated += 1;
      } catch (eGen) {}
    }
    return { generated: generated };
  }

  function hydrate(opts) {
    opts = opts || {};
    if (!isConfigured() && !opts.forceLocal) {
      return Promise.resolve({ ok: false, error: "supabase_not_configured", skipped: true });
    }
    var prior = readJson(sessionStorage, BOOT_FLAG, null);
    if (prior && prior.ok && !opts.force) {
      return Promise.resolve({ ok: true, cached: true, prior: prior });
    }
    if (hydrating) {
      return Promise.resolve({ ok: false, error: "hydrate_in_flight", skipped: true });
    }
    hydrating = true;

    return fetchSeedProfiles()
      .then(function (profiles) {
        var merged = mergeSeedProfiles(profiles);
        var serverIds = Object.keys(merged.byServerId || {});
        return Promise.all([
          Promise.resolve(merged),
          fetchViewerFriendships(),
          fetchTowerPostsForAuthors(serverIds),
        ]);
      })
      .then(function (parts) {
        var merged = parts[0] || { ok: false, merged: 0, byServerId: {}, byUserId: {} };
        var friendships = parts[1] || [];
        var towerRows = parts[2] || [];
        var friends = applyFriendships(friendships, merged.byUserId || {});
        var posts = applyTowerPosts(towerRows, merged.byServerId || {});

        var postCountByFleet = {};
        (posts.posts || []).forEach(function (p) {
          var f = p && p.seedFleetId;
          if (!f) return;
          postCountByFleet[f] = (postCountByFleet[f] || 0) + 1;
        });

        var filled = { generated: 0 };
        if (opts.fillEmpty !== false) {
          filled = fillEmptyShells(merged.byServerId || {}, postCountByFleet);
        }

        var out = {
          ok: !!(merged.ok && merged.merged > 0) || !!(posts.applied > 0),
          merged: merged.merged || 0,
          friendships: friends.applied || 0,
          posts: posts.applied || 0,
          generated: filled.generated || 0,
          cap: HARD_CAP,
          at: new Date().toISOString(),
          error: merged.error,
        };
        /* ok when we attempted a clean hydrate even if the fleet was already local. */
        if (merged.ok) out.ok = true;
        writeJson(sessionStorage, BOOT_FLAG, out);
        emitLog({ action: "hydrate", ok: out.ok, result: out });
        hydrating = false;
        try {
          document.dispatchEvent(
            new CustomEvent("cognation:circle-friends-hydrated", {
              detail: { source: "tower-hydrate", merged: out.merged },
            })
          );
        } catch (eCircle) {}
        return out;
      })
      .catch(function (err) {
        hydrating = false;
        var fail = {
          ok: false,
          error: (err && err.message) || "hydrate_failed",
          at: new Date().toISOString(),
        };
        emitLog({ action: "hydrate", ok: false, error: fail.error });
        return fail;
      });
  }

  function boot() {
    function run(force) {
      hydrate({ force: !!force }).then(function () {});
    }
    setTimeout(function () {
      run(false);
    }, 350);
    document.addEventListener("cognation:session-started", function () {
      try {
        sessionStorage.removeItem(BOOT_FLAG);
      } catch (e) {}
      run(true);
    });
    document.addEventListener("cognation:auth-changed", function () {
      try {
        sessionStorage.removeItem(BOOT_FLAG);
      } catch (e2) {}
      run(true);
    });
    document.addEventListener("cognation:seedops-dating-hydrate", function (ev) {
      var detail = ev && ev.detail;
      if (detail && detail.action === "hydrate" && detail.ok) {
        /* Dating hydrate may have refreshed bios — refresh Tower shells once. */
        run(true);
      }
    });
  }

  window.CognationSeedOpsTowerHydrate = {
    HARD_CAP: HARD_CAP,
    BOOT_FLAG: BOOT_FLAG,
    firstNameOnly: firstNameOnly,
    hydrate: hydrate,
    fetchSeedProfiles: fetchSeedProfiles,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
