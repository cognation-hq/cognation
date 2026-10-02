/**
 * Supabase-backed social actions used by Tower member pages.
 *
 * The old localStorage behavior remains available for the offline demo. This
 * module deliberately activates only for an authenticated Supabase account so
 * a demo click is never presented as a real network action.
 */
(function () {
  "use strict";

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function api() {
    return window.CognationSupabase || null;
  }

  function identity() {
    var session =
      window.CognationAuth && window.CognationAuth.getSession
        ? window.CognationAuth.getSession()
        : null;
    if (!session || session.source !== "supabase" || !session.supabaseUserId) return null;
    return {
      userId: session.supabaseUserId,
      activeProfileId: session.activeProfileId || "",
    };
  }

  function isReady() {
    var client = api();
    return !!(identity() && client && client.configured && client.configured());
  }

  function encoded(value) {
    return encodeURIComponent(String(value || ""));
  }

  function getTarget(profileId) {
    if (!UUID_RE.test(String(profileId || ""))) {
      return Promise.reject(new Error("This member page is not available yet."));
    }
    return api()
      .rest("profiles", {
        query:
          "select=id,user_id,kind,handle,display_name,account_kind,seed_fleet_id&id=eq." + encoded(profileId),
      })
      .then(function (rows) {
        return Array.isArray(rows) && rows[0] ? rows[0] : null;
      });
  }

  function relationship(profileId, profileKind) {
    var me = identity();
    if (!isReady() || !me) return Promise.resolve({ mode: "offline" });
    return getTarget(profileId).then(function (target) {
      if (!target) return { mode: "missing" };
      if (target.user_id === me.userId) return { mode: "self" };
      if (profileKind === "professional") {
        return api()
          .rest("follows", {
            query:
              "select=profile_id&follower_user_id=eq." +
              encoded(me.userId) +
              "&profile_id=eq." +
              encoded(profileId),
          })
          .then(function (rows) {
            return {
              mode: Array.isArray(rows) && rows.length ? "following" : "follow",
              target: target,
            };
          });
      }
      return api()
        .rest("friendships", {
          query:
            "select=user_id&user_id=eq." +
            encoded(me.userId) +
            "&friend_user_id=eq." +
            encoded(target.user_id),
        })
        .then(function (friends) {
          if (Array.isArray(friends) && friends.length) {
            return { mode: "friends", target: target };
          }
          return api()
            .rest("friend_requests", {
              query:
                "select=id,status&sender_user_id=eq." +
                encoded(me.userId) +
                "&recipient_user_id=eq." +
                encoded(target.user_id) +
                "&status=eq.pending",
            })
            .then(function (requests) {
              return {
                mode: Array.isArray(requests) && requests.length ? "requested" : "friend",
                target: target,
              };
            });
        });
    });
  }

  function act(profileId, profileKind) {
    if (!isReady()) return Promise.reject(new Error("Sign in to use member connections."));
    return relationship(profileId, profileKind).then(function (state) {
      if (state.mode === "self") throw new Error("This is your page.");
      if (state.mode === "missing") throw new Error("This member page is not available yet.");
      if (profileKind === "professional") {
        return api()
          .rpc("toggle_profile_follow", { target_profile_id: profileId })
          .then(function () {
            return relationship(profileId, profileKind);
          });
      }
      if (state.mode === "friend" || state.mode === "requested") {
        /* SeedOps: real ↛ seed/ops friend block (client gate; RPC also enforces). */
        var gate = window.CognationSeedOpsFriendGate;
        if (gate && typeof gate.canFriend === "function") {
          var target = state.target || { id: profileId };
          var decision = gate.canFriend(null, target);
          if (!decision.ok) {
            return Promise.reject(new Error(decision.message || "Friend request blocked."));
          }
        }
        return api()
          .rpc("send_friend_request", { recipient_profile_id: profileId })
          .then(function () {
            return relationship(profileId, profileKind);
          });
      }
      return state;
    });
  }

  window.CognationSocialGraph = {
    isReady: isReady,
    isRemoteProfileId: function (value) {
      return UUID_RE.test(String(value || ""));
    },
    relationship: relationship,
    act: act,
  };
})();
