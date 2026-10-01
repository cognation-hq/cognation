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

  function resolveProfileId(btn) {
    var id = btn.getAttribute("data-profile-id");
    if (id) return id;
    var p = activeProfile();
    if (p && p._profileId) return String(p._profileId);
    return "";
  }

  function isProfessionalContext(btn) {
    var root = btn.closest("[data-tower-root], [data-tower-app], #panel-tower") || document;
    var kindBtn = root.querySelector('[data-tower-profile-kind="professional"][aria-selected="true"]');
    if (kindBtn) return true;
    var p = activeProfile();
    if (p && (p._profileKind === "professional" || p.kind === "professional")) return true;
    /* When the public page selector is visible, it is the source of truth.
       The signed-in profile can remain professional while viewing Personal. */
    if (root.querySelector("[data-tower-profile-kind]")) return false;
    /* Show follow on public professional pages even if personal selected? Prefer kind from profile */
    return !!(p && p._profileKind === "professional");
  }

  function renderRemoteState(btn, pro, state) {
    var row = btn.closest("[data-tower-follow-row]");
    if (state.mode === "self") {
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

  function syncButton(btn) {
    var api = swipeApi();
    var graph = socialApi();
    var id = resolveProfileId(btn);
    if (id) btn.setAttribute("data-profile-id", id);
    var row = btn.closest("[data-tower-follow-row]");
    var pro = isProfessionalContext(btn);
    if (row) row.hidden = false;
    btn.hidden = false;
    if (graph && graph.isReady && graph.isReady()) {
      if (syncRemoteButton(btn, graph, id, pro) !== false) return;
    }
    btn.disabled = false;
    if (!id || !api) {
      btn.setAttribute("aria-pressed", "false");
      btn.classList.remove("is-following");
      btn.textContent = pro ? "Follow" : "Add friend";
      return;
    }
    var following = api.isFollowing(id);
    btn.setAttribute("aria-pressed", following ? "true" : "false");
    btn.classList.toggle("is-following", following);
    btn.textContent = pro
      ? (following ? "Following" : "Follow")
      : (following ? "Friend added" : "Add friend");
    btn.setAttribute("aria-label", pro
      ? (following ? "Unfollow this professional profile" : "Follow this professional profile")
      : (following ? "Remove this friend" : "Add this person as a friend"));
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
      btn.disabled = true;
      graph
        .act(id, isProfessionalContext(btn) ? "professional" : "personal")
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
    if (!api) return;
    /* Professional followers are unlimited. Do not route this click through the Tower friend cap. */
    if (isProfessionalContext(btn) && window.CognationTowerFollowers && typeof window.CognationTowerFollowers.add === "function") {
      var followerId = "";
      try {
        var rawSession = localStorage.getItem("cognation.session.v2");
        var followSession = rawSession ? JSON.parse(rawSession) : null;
        followerId = followSession && (followSession.username || followSession.activeProfileId) || "";
      } catch (eFollow) {}
      if (followerId) window.CognationTowerFollowers.add(String(followerId));
    }
    api.toggleFollow(id);
    syncButton(btn);
    if (api.rebuild) {
      try {
        api.rebuild();
      } catch (e) {}
    }
  });

  document.addEventListener("cognation:commune-follows-changed", syncAll);
  document.addEventListener("cognation:session-started", syncAll);
  document.addEventListener("cognation:tower-profile-updated", syncAll);
  document.addEventListener("cognation:social-relationship-changed", syncAll);

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
