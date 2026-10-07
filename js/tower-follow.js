/**
 * CGN-007 — Tower professional Follow button.
 * Hook: [data-tower-follow] + data-profile-id
 * Uses Supabase for authenticated member pages and the existing local demo
 * store only while the offline demo is active.
 */
(function () {
  "use strict";

  function swipeApi() {
    return window.CognationCommuneSwipe || null;
  }

  function socialApi() {
    return window.CognationSocialGraph || null;
  }

  function activeProfile() {
    try {
      if (window.CognationTowerProfileStore && window.CognationTowerProfileStore.get) {
        return window.CognationTowerProfileStore.get();
      }
    } catch (e) {}
    return null;
  }

  /* The profile on screen decides; the attribute is only a fallback (it used to
     stick to whatever profile was shown first, e.g. during sign-in). */
  function resolveProfileId(btn) {
    var p = activeProfile();
    if (p && p._profileId) return String(p._profileId);
    if (p && p._loading) return "";
    return btn.getAttribute("data-profile-id") || "";
  }

  function isProfessionalContext(btn) {
    var root = btn && btn.closest && btn.closest("[data-tower-app]");
    var viewKind = root && root.getAttribute("data-view-kind");
    if (viewKind === "professional") return true;
    if (viewKind === "personal") return false;
    var p = activeProfile();
    if (p && (p._profileKind === "professional" || p.kind === "professional")) return true;
    if (p && (p._directoryFriend || p._profileKind === "personal" || p.kind === "personal")) return false;
    var root = (btn && btn.closest && btn.closest("[data-tower-root], [data-tower-app], #panel-tower")) || document;
    var kindBtn = root.querySelector('[data-tower-profile-kind="professional"][aria-selected="true"]');
    return !!kindBtn;
  }

  function viewerFollowerId() {
    try {
      var raw = localStorage.getItem("cognation.session.v2");
      var session = raw ? JSON.parse(raw) : null;
      return (session && (session.username || session.activeProfileId)) || "";
    } catch (e) {
      return "";
    }
  }

  /* Cap 250: Follow edge = viewer's current Tower face (no picker). */
  function viewerFace(btn) {
    var root = btn && btn.closest && btn.closest("[data-tower-app]");
    if (root) {
      var viewKind = root.getAttribute("data-view-kind");
      if (viewKind === "professional" || viewKind === "personal") return viewKind;
      var kindBtn = root.querySelector('[data-tower-profile-kind="professional"][aria-selected="true"]');
      if (kindBtn) return "professional";
      var perBtn = root.querySelector('[data-tower-profile-kind="personal"][aria-selected="true"]');
      if (perBtn) return "personal";
    }
    try {
      var raw = localStorage.getItem("cognation.session.v2");
      var session = raw ? JSON.parse(raw) : null;
      if (session && session.profileKind === "professional") return "professional";
    } catch (eFace) {}
    return "personal";
  }

  function viewedIsProfessional(btn) {
    return isProfessionalContext(btn);
  }

  function alreadyFollowing(profile) {
    if (!profile) return false;
    var viewer = String(viewerFollowerId() || "");
    var ids = Array.isArray(profile.followerIds) ? profile.followerIds : [];
    if (viewer && ids.indexOf(viewer) >= 0) return true;
    var api = swipeApi();
    return !!(api && profile._profileId && api.isFollowing(profile._profileId));
  }

  function alreadyFriend(profile) {
    var friendId = profile && profile._friendId;
    if (!friendId) return false;
    var friends = window.CognationTowerFriends;
    return !!(friends && typeof friends.has === "function" && friends.has(friendId));
  }

  function renderRemoteState(btn, pro, state) {
    var row = btn.closest("[data-tower-follow-row]");
    if (state.mode === "self" || ownProfileOnScreen(btn)) {
      if (row) row.hidden = true;
      return;
    }
    if (row) row.hidden = false;
    btn.hidden = false;
    btn.disabled = false;
    btn.classList.toggle("is-following", state.mode === "following");
    btn.setAttribute(
      "aria-pressed",
      state.mode === "following" || state.mode === "friends" ? "true" : "false"
    );
    if (pro) {
      btn.textContent = state.mode === "following" ? "Following" : "Follow";
      btn.setAttribute(
        "aria-label",
        state.mode === "following"
          ? "Unfollow this professional profile"
          : "Follow this professional profile"
      );
      return;
    }
    if (state.mode === "friends") {
      btn.textContent = "Friends";
      btn.disabled = true;
      btn.setAttribute("aria-label", "You are friends");
    } else if (state.mode === "requested") {
      btn.textContent = "Request sent";
      btn.disabled = true;
      btn.setAttribute("aria-label", "Friend request sent");
    } else {
      btn.textContent = "Add friend";
      btn.setAttribute("aria-label", "Add this person as a friend");
    }
  }

  function localProfileExists(id) {
    if (!id || !window.CognationAccounts || typeof window.CognationAccounts.getProfileById !== "function") {
      return false;
    }
    return !!window.CognationAccounts.getProfileById(id);
  }

  function syncRemoteButton(btn, graph, id, pro) {
    var row = btn.closest("[data-tower-follow-row]");
    /* A saved profile page is on screen. The missing-page label is only for an id with no page. */
    if (id && !graph.isRemoteProfileId(id) && localProfileExists(id)) return false;
    if (!id || !graph.isRemoteProfileId(id)) {
      if (row) row.hidden = false;
      btn.hidden = false;
      btn.disabled = true;
      btn.classList.remove("is-following");
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = "Member page unavailable";
      btn.setAttribute(
        "aria-label",
        "This demo profile is not yet a Cognation member page"
      );
      return true;
    }
    btn.disabled = true;
    graph
      .relationship(id, pro ? "professional" : "personal")
      .then(function (state) {
        renderRemoteState(btn, pro, state);
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = pro ? "Follow" : "Add friend";
        btn.setAttribute(
          "aria-label",
          "Could not load this member connection. Try again."
        );
      });
    return true;
  }

  function readSession() {
    try {
      if (window.CognationAuth && typeof window.CognationAuth.getSession === "function") {
        return window.CognationAuth.getSession();
      }
      var raw = localStorage.getItem("cognation.session.v2");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  /* Signing in (sign-in configured, login state not stored yet): treat as
     your own profile still loading, so no Add friend. */
  function signInPending() {
    var floor = window.CognationAgeFloor;
    return !!(floor && typeof floor.signInPending === "function" && floor.signInPending());
  }

  /* Your own profile never shows Add friend / Follow, even while it loads:
     any profile id of the signed-in account counts (personal or professional). */
  function isOwnProfileId(id) {
    if (!id) return false;
    id = String(id);
    var session = readSession();
    if (!session) return false;
    if (session.activeProfileId && String(session.activeProfileId) === id) return true;
    var uid = session.source === "supabase" && session.supabaseUserId ? String(session.supabaseUserId) : "";
    var social = window.CognationSupabaseSocial;
    try {
      if (social && typeof social.getMyProfiles === "function") {
        if ((social.getMyProfiles() || []).some(function (p) { return p && String(p.id) === id; })) return true;
      }
      if (uid && social && typeof social.getProfile === "function") {
        var row = social.getProfile(id);
        if (row && String(row.user_id || "") === uid) return true;
      }
    } catch (eRemote) {}
    var accounts = window.CognationAccounts;
    try {
      if (accounts && session.username && typeof accounts.getProfilesForUsername === "function") {
        if ((accounts.getProfilesForUsername(session.username) || []).some(function (p) { return p && String(p.id) === id; })) return true;
      }
    } catch (eLocal) {}
    return false;
  }

  function ownProfileOnScreen(btn) {
    var p = activeProfile();
    if (p && p._loading) return true;
    if (signInPending()) return true;
    return isOwnProfileId(resolveProfileId(btn));
  }

  function syncButton(btn) {
    var api = swipeApi();
    var graph = socialApi();
    var id = resolveProfileId(btn);
    if (id) btn.setAttribute("data-profile-id", id);
    var row = btn.closest("[data-tower-follow-row]");
    /* Hidden (never relabeled "Unavailable") on your own profile. */
    if (ownProfileOnScreen(btn)) {
      if (row) row.hidden = true;
      btn.hidden = true;
      return;
    }
    var pro = isProfessionalContext(btn);
    if (row) row.hidden = false;
    btn.hidden = false;
    if (graph && graph.isReady && graph.isReady()) {
      if (syncRemoteButton(btn, graph, id, pro) !== false) return;
    }
    btn.disabled = false;
    var viewed = activeProfile();
    var face = viewerFace(btn);
    btn.setAttribute("data-viewer-face", face);
    if (pro) {
      /* personal→pro and pro→pro Follow OK; edge tagged with current Tower face. */
      var following = alreadyFollowing(viewed);
      btn.setAttribute("aria-pressed", following ? "true" : "false");
      btn.classList.toggle("is-following", following);
      btn.textContent = following ? "Following" : "Follow";
      btn.setAttribute(
        "aria-label",
        following
          ? "Unfollow this professional page as your " + face + " face"
          : "Follow this professional page as your " + face + " face"
      );
      return;
    }
    /* Friends are personal↔personal only. Professional cannot Friend personal. */
    if (face === "professional") {
      btn.disabled = true;
      btn.classList.remove("is-following");
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = "Unavailable";
      btn.setAttribute("aria-label", "Professional pages cannot friend personal profiles");
      return;
    }
    var friends = alreadyFriend(viewed);
    btn.setAttribute("aria-pressed", friends ? "true" : "false");
    btn.classList.remove("is-following");
    var gateLocal = window.CognationSeedOpsFriendGate;
    if (!friends && gateLocal && typeof gateLocal.canFriend === "function") {
      var blocked = gateLocal.canFriend(null, viewed || { id: id });
      if (!blocked.ok) {
        btn.disabled = true;
        btn.textContent = "Unavailable";
        btn.setAttribute("aria-label", blocked.message || "Cannot friend seed or ops accounts");
        return;
      }
    }
    btn.textContent = friends ? "Friends" : "Add friend";
    btn.setAttribute("aria-label", friends ? "You are friends" : "Add this person as a friend");
    if (!id && !viewed) return;
  }

  function syncAll() {
    document.querySelectorAll("[data-tower-follow]").forEach(syncButton);
  }

  document.addEventListener("click", function (ev) {
    var btn = ev.target && ev.target.closest && ev.target.closest("[data-tower-follow]");
    if (!btn) return;
    ev.preventDefault();
    var api = swipeApi();
    var graph = socialApi();
    var id = resolveProfileId(btn);
    if (!id) {
      btn.setAttribute("aria-label", "Follow unavailable — no profile id");
      return;
    }
    btn.setAttribute("data-profile-id", id);
    if (graph && graph.isReady && graph.isReady()) {
      if (!graph.isRemoteProfileId(id)) {
        if (!localProfileExists(id)) {
          btn.setAttribute("aria-label", "This demo profile is not yet a Cognation member page");
          return;
        }
      } else {
      var remoteKind = isProfessionalContext(btn) ? "professional" : "personal";
      var remoteFace = viewerFace(btn);
      if (remoteKind === "personal" && remoteFace === "professional") {
        btn.setAttribute("aria-label", "Professional pages cannot friend personal profiles");
        syncButton(btn);
        return;
      }
      btn.disabled = true;
      graph
        .act(id, remoteKind, { viewerFace: remoteFace })
        .then(function () {
          syncButton(btn);
          document.dispatchEvent(new CustomEvent("cognation:social-relationship-changed"));
        })
        .catch(function (error) {
          btn.disabled = false;
          btn.setAttribute(
            "aria-label",
            (error && error.message) || "Could not update this connection. Try again."
          );
        });
      return;
      }
    }
    var viewed = activeProfile();
    var pro = isProfessionalContext(btn);
    var face = viewerFace(btn);
    if (pro) {
      if (window.CognationTowerFollowers && typeof window.CognationTowerFollowers.add === "function") {
        var followerId = viewerFollowerId();
        if (followerId) window.CognationTowerFollowers.add(String(followerId), face);
      }
      if (api && id) api.toggleFollow(id);
      syncButton(btn);
      if (api && api.rebuild) {
        try { api.rebuild(); } catch (e) {}
      }
      document.dispatchEvent(
        new CustomEvent("cognation:tower-profile-updated", { detail: { reason: "follow", face: face } })
      );
      return;
    }
    if (face === "professional") {
      btn.setAttribute("aria-label", "Professional pages cannot friend personal profiles");
      syncButton(btn);
      return;
    }
    var friendId = viewed && viewed._friendId;
    if (friendId && window.CognationTowerFriends && typeof window.CognationTowerFriends.add === "function") {
      window.CognationTowerFriends.add(friendId);
    }
    syncButton(btn);
  });

  document.addEventListener("cognation:tower-view-changed", syncAll);
  document.addEventListener("cognation:people-added", syncAll);
  document.addEventListener("cognation:commune-follows-changed", syncAll);
  document.addEventListener("cognation:session-started", syncAll);
  document.addEventListener("cognation:tower-profile-updated", syncAll);
  document.addEventListener("cognation:social-relationship-changed", syncAll);
  /* Sign-in / profile switches: re-check whose profile is on screen. */
  document.addEventListener("cognation:remote-profile-loaded", syncAll);
  document.addEventListener("cognation:auth-changed", syncAll);
  document.addEventListener("cognation:active-profile-changed", syncAll);
  document.addEventListener("cognation:session-ended", syncAll);

  function boot() {
    syncAll();
    /* Re-sync when professional/personal tabs change */
    document.addEventListener("click", function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest("[data-tower-profile-kind]")) {
        window.setTimeout(syncAll, 30);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
