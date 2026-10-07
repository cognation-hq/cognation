/**
 * Cognation's live social data layer.
 *
 * This is intentionally framework-free because the existing site is static.
 * It owns the network boundary; Tower continues to render its established UI
 * from a short-lived in-browser cache populated only by Supabase.
 */
(function () {
  "use strict";

  var state = {
    profiles: {},
    handles: {},
    myProfiles: [],
    feed: [],
    initialized: false,
  };

  function client() {
    return window.CognationSupabase || null;
  }

  function session() {
    return window.CognationAuth && window.CognationAuth.getSession
      ? window.CognationAuth.getSession()
      : null;
  }

  function identity() {
    var current = session();
    if (
      !current ||
      current.source !== "supabase" ||
      !current.supabaseUserId ||
      !client() ||
      !client().configured()
    ) {
      return null;
    }
    return current;
  }

  function active() {
    return !!identity();
  }

  function emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  function normalizeHandle(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 40);
  }

  function cacheProfile(profile) {
    if (!profile || !profile.id) return null;
    var item = {
      id: String(profile.id),
      user_id: String(profile.user_id || ""),
      kind: profile.kind === "professional" ? "professional" : "personal",
      handle: normalizeHandle(profile.handle),
      display_name: String(profile.display_name || "Member").slice(0, 80),
      bio: String(profile.bio || "").slice(0, 280),
    };
    state.profiles[item.id] = item;
    if (item.handle) state.handles[item.handle] = item.id;
    return item;
  }

  function cacheProfiles(rows) {
    (Array.isArray(rows) ? rows : []).forEach(cacheProfile);
    return rows;
  }

  function profileForId(id) {
    return state.profiles[String(id || "")] || null;
  }

  function profileForHandle(handle) {
    var id = state.handles[normalizeHandle(handle)];
    return id ? profileForId(id) : null;
  }

  function profileForUser(userId, kind) {
    var all = Object.keys(state.profiles).map(function (id) {
      return state.profiles[id];
    });
    return (
      all.filter(function (profile) {
        return profile.user_id === userId && (!kind || profile.kind === kind);
      })[0] || null
    );
  }

  var PROFILE_RETURN_COLUMNS = "id,user_id,kind,handle,display_name,bio";

  function selectProfiles() {
    return client()
      .rest("profiles", {
        query:
          "select=id,user_id,kind,handle,display_name,bio&order=created_at.desc&limit=400",
      })
      .then(cacheProfiles);
  }

  function refreshMyProfiles() {
    var me = identity();
    if (!me) return Promise.resolve([]);
    return client()
      .rest("profiles", {
        query:
          "select=id,user_id,kind,handle,display_name,bio&user_id=eq." +
          encodeURIComponent(me.supabaseUserId),
      })
      .then(function (rows) {
        state.myProfiles = (Array.isArray(rows) ? rows : []).map(cacheProfile);
        return state.myProfiles;
      });
  }

  function currentProfileId() {
    var current = identity();
    return current && current.activeProfileId ? current.activeProfileId : "";
  }

  function viewedProfileId() {
    var raw = String(location.hash || "");
    if (raw.indexOf("#tower-profile-") === 0) {
      var slug = raw.slice("#tower-profile-".length);
      try { slug = decodeURIComponent(slug); } catch (eHash) {}
      var byHash = slug ? profileForHandle(slug) : null;
      /* Missing handle must not fall through to the signed-in profile. */
      return byHash && byHash.id ? byHash.id : "";
    }
    return currentProfileId();
  }

  function toTowerProfile(profile) {
    if (!profile) return null;
    return {
      _profileId: profile.id,
      _profileKind: profile.kind,
      _remote: true,
      displayName: profile.display_name,
      handle: profile.handle,
      slogan: profile.bio,
      socialLinks: {},
      badges: { role: "", interest: "", status: "" },
      featuredFriendIds: [],
      friendsDisplayCount: 3,
      publicWidgets: {
        identity: true,
        slogan: !!profile.bio,
        social: false,
        music: false,
        badges: false,
        friends: true,
        html: false,
        calendar: true,
      },
    };
  }

  function setActiveProfile(profile) {
    if (!profile || !profile.id) return null;
    var current = session();
    if (!current) return null;
    current.activeProfileId = profile.id;
    current.profileKind = profile.kind;
    current.profileHandle = profile.handle;
    current.profileDisplayName = profile.display_name;
    try {
      localStorage.setItem("cognation.session.v2", JSON.stringify(current));
    } catch (e) {}
    emit("cognation:active-profile-changed", {
      profileId: profile.id,
      kind: profile.kind,
    });
    return current;
  }

  function openProfile(profile) {
    if (!profile || !profile.handle) return;
    location.hash = "tower-profile-" + encodeURIComponent(profile.handle);
    var tower = document.getElementById("tab-tower");
    if (tower) tower.click();
    emit("cognation:remote-profile-loaded", { profileId: profile.id });
  }

  function reactionsMap(rows) {
    var reactions = {};
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (!row || !row.face || row.profile_id == null || row.profile_id === "") return;
      var face = String(row.face);
      if (!reactions[face]) reactions[face] = [];
      reactions[face].push(String(row.profile_id));
    });
    return reactions;
  }

  function mapPost(row) {
    var embedded = row && (row.author || row.profiles);
    if (embedded) cacheProfile(embedded);
    var author = profileForId(row.author_profile_id) || embedded || null;
    var display =
      (author && (author.display_name || author.displayName)) || "Cognation member";
    var handle = author ? normalizeHandle(author.handle) : "";
    var reactions = reactionsMap(row && row.reactions);
    var hearts = reactions["❤️"] ? reactions["❤️"].length : 0;
    return {
      id: row.id,
      _remote: true,
      authorProfileId: row.author_profile_id,
      authorName: display,
      handle: handle,
      body: row.body || "",
      createdAt: row.created_at,
      attachments: Array.isArray(row.attachments) ? row.attachments : [],
      likes: hearts,
      reactions: reactions,
      visibility: row.visibility || "friends",
    };
  }

  function replaceTowerFeed(posts) {
    state.feed = posts;
    if (
      window.CognationTowerStore &&
      typeof window.CognationTowerStore.setRemotePosts === "function"
    ) {
      window.CognationTowerStore.setRemotePosts(posts);
    }
    emit("cognation:remote-feed-loaded", { count: posts.length });
  }

  function refreshFeed() {
    if (!active()) return Promise.resolve([]);
    return client()
      .rest("tower_posts", {
        query:
          "select=id,author_profile_id,body,visibility,attachments,created_at,author:profiles!tower_posts_author_profile_id_fkey(id,user_id,kind,handle,display_name,bio),reactions:tower_post_reactions(face,profile_id)&order=created_at.desc&limit=100",
      })
      .then(function (rows) {
        var posts = (Array.isArray(rows) ? rows : []).map(mapPost);
        replaceTowerFeed(posts);
        return posts;
      });
  }

  function createTowerPost(fields) {
    var me = identity();
    var body = String((fields && fields.body) || "").trim();
    var profileId = me && me.activeProfileId;
    if (!me || !profileId) {
      return Promise.reject(new Error("Sign in before posting to Tower."));
    }
    if (!body) {
      return Promise.reject(
        new Error("Add a written update before posting. File uploads are not connected yet.")
      );
    }
    return client()
      .rest("tower_posts", {
        method: "POST",
        body: {
          author_profile_id: profileId,
          body: body.slice(0, 2000),
          visibility: "friends",
          attachments: Array.isArray(fields && fields.attachments)
            ? fields.attachments.map(function (attachment) {
                return {
                  kind: String(attachment.kind || "document"),
                  label: String(attachment.label || attachment.name || "Attachment").slice(0, 160),
                };
              })
            : [],
        },
      })
      .then(function () {
        return refreshFeed();
      });
  }

  function feedPost(postId) {
    var i;
    for (i = 0; i < state.feed.length; i++) {
      if (state.feed[i] && state.feed[i].id === postId) return state.feed[i];
    }
    return null;
  }

  function applyReaction(post, face, profileId, adding) {
    if (!post.reactions || typeof post.reactions !== "object") post.reactions = {};
    var list = Array.isArray(post.reactions[face]) ? post.reactions[face].slice() : [];
    var ix = list.indexOf(profileId);
    if (adding) {
      if (ix < 0) list.push(profileId);
    } else if (ix >= 0) {
      list.splice(ix, 1);
    }
    if (list.length) post.reactions[face] = list;
    else delete post.reactions[face];
    if (face === "❤️") post.likes = list.length;
  }

  function togglePostReaction(postId, face) {
    face = String(face || "");
    var me = identity();
    var profileId = me && me.activeProfileId ? String(me.activeProfileId) : "";
    if (!me || !profileId || !face) {
      return Promise.resolve({ ok: false, error: "Sign in before reacting." });
    }
    var post = feedPost(postId);
    if (!post) return Promise.resolve({ ok: false, error: "Post not found." });
    var list = post.reactions && Array.isArray(post.reactions[face]) ? post.reactions[face] : [];
    var mine = list.indexOf(profileId) >= 0;
    var req = mine
      ? client().rest("tower_post_reactions", {
          method: "DELETE",
          query:
            "post_id=eq." + encodeURIComponent(postId) +
            "&profile_id=eq." + encodeURIComponent(profileId) +
            "&face=eq." + encodeURIComponent(face),
        })
      : client().rest("tower_post_reactions", {
          method: "POST",
          body: { post_id: postId, profile_id: profileId, face: face },
        });
    return req.then(function () {
      applyReaction(post, face, profileId, !mine);
      replaceTowerFeed(state.feed);
      return { ok: true, post: post };
    }, function () {
      return { ok: false, error: "Could not save reaction." };
    });
  }

  function updateCurrentProfile(data) {
    var me = identity();
    if (!me || !me.activeProfileId) {
      return Promise.reject(new Error("Sign in before editing your profile."));
    }
    /* No PATCH until this user's server row is cached; then only changed fields. */
    var row = profileForId(me.activeProfileId);
    if (!row || row.user_id !== String(me.supabaseUserId)) return Promise.resolve(null);
    var changes = {};
    if (data && Object.prototype.hasOwnProperty.call(data, "displayName")) {
      changes.display_name = String(data.displayName || "").trim().slice(0, 80) || "Member";
    }
    if (data && Object.prototype.hasOwnProperty.call(data, "handle")) {
      changes.handle = normalizeHandle(data.handle);
    }
    if (data && Object.prototype.hasOwnProperty.call(data, "bio")) {
      changes.bio = String(data.bio || "").trim().slice(0, 280);
    }
    Object.keys(changes).forEach(function (key) {
      if (changes[key] === row[key]) delete changes[key];
    });
    if (!Object.keys(changes).length) return Promise.resolve(row);
    return client()
      .rest("profiles", {
        method: "PATCH",
        /* Explicit columns: profiles.email is not readable by browser roles, so
           return=representation must not fall back to select=*. */
        query: "id=eq." + encodeURIComponent(me.activeProfileId) + "&select=" + PROFILE_RETURN_COLUMNS,
        body: changes,
      })
      .then(function (rows) {
        var profile = cacheProfile(Array.isArray(rows) ? rows[0] : null);
        if (profile) setActiveProfile(profile);
        emit("cognation:remote-profile-loaded", { profileId: me.activeProfileId });
        return profile;
      });
  }

  function createProfessionalProfile(fields) {
    var me = identity();
    if (!me) return Promise.reject(new Error("Sign in before creating a professional page."));
    var base = normalizeHandle(fields && fields.handle);
    if (!base) base = "member-" + me.supabaseUserId.slice(0, 8);
    return client()
      .rest("profiles", {
        method: "POST",
        query: "select=" + PROFILE_RETURN_COLUMNS,
        body: {
          user_id: me.supabaseUserId,
          kind: "professional",
          handle: base.slice(0, 40),
          display_name: String((fields && fields.displayName) || "Professional page").slice(0, 80),
          bio: String((fields && fields.bio) || "").slice(0, 280),
        },
      })
      .then(function (rows) {
        var profile = cacheProfile(Array.isArray(rows) ? rows[0] : null);
        if (!profile) throw new Error("Could not create a professional page.");
        state.myProfiles.push(profile);
        setActiveProfile(profile);
        return profile;
      });
  }

  function memberResults(query) {
    var term = String(query || "").trim().toLowerCase();
    var me = identity();
    var list = Object.keys(state.profiles)
      .map(function (id) {
        return state.profiles[id];
      })
      .filter(function (profile) {
        if (!term) return false;
        return (
          profile.display_name.toLowerCase().indexOf(term) >= 0 ||
          profile.handle.toLowerCase().indexOf(term) >= 0
        );
      })
      .filter(function (profile) {
        return !me || profile.user_id !== me.supabaseUserId;
      });
    return list.slice(0, 8);
  }

  function profilesForUsers(userIds) {
    var ids = (userIds || []).filter(Boolean);
    if (!ids.length) return Promise.resolve([]);
    var needed = ids.filter(function (id) {
      return !profileForUser(id, "personal");
    });
    if (!needed.length) return Promise.resolve(ids.map(function (id) {
      return profileForUser(id, "personal");
    }).filter(Boolean));
    return selectProfiles().then(function () {
      return ids
        .map(function (id) {
          return profileForUser(id, "personal");
        })
        .filter(Boolean);
    });
  }

  function clearElement(element) {
    while (element && element.firstChild) element.removeChild(element.firstChild);
  }

  function textNode(tag, text, className) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    return element;
  }

  function openMemberButton(profile) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-secondary";
    button.textContent = "Open";
    button.addEventListener("click", function () {
      openProfile(profile);
    });
    return button;
  }

  function renderFriends(profiles) {
    document.querySelectorAll("[data-tower-friends-browse-list]").forEach(function (list) {
      clearElement(list);
      if (!profiles.length) {
        list.appendChild(textNode("li", "No friends yet. Search members to connect."));
        return;
      }
      profiles.forEach(function (profile) {
        var item = document.createElement("li");
        item.appendChild(textNode("span", profile.display_name + " @" + profile.handle));
        item.appendChild(openMemberButton(profile));
        list.appendChild(item);
      });
    });
  }

  function renderConnections(payload) {
    var requests = payload.requests || [];
    var notifications = payload.notifications || [];
    document.querySelectorAll("[data-remote-social]").forEach(function (root) {
      var requestsEl = root.querySelector("[data-remote-friend-requests]");
      var notificationsEl = root.querySelector("[data-remote-notifications]");
      root.hidden = !requests.length && !notifications.length;
      if (requestsEl) {
        clearElement(requestsEl);
        if (requests.length) {
          requestsEl.appendChild(textNode("h5", "Friend requests"));
          var requestList = document.createElement("ul");
          requestList.className = "tower-remote-list";
          requests.forEach(function (request) {
            var sender = profileForUser(request.sender_user_id, "personal");
            var item = document.createElement("li");
            item.appendChild(
              textNode(
                "span",
                (sender ? sender.display_name : "A member") + " wants to connect"
              )
            );
            var accept = document.createElement("button");
            accept.type = "button";
            accept.className = "btn btn-primary";
            accept.textContent = "Accept";
            accept.addEventListener("click", function () {
              accept.disabled = true;
              accept.textContent = "Accepting…";
              acceptFriendRequest(request.id).catch(function () {
                accept.disabled = false;
                accept.textContent = "Try again";
              });
            });
            item.appendChild(accept);
            requestList.appendChild(item);
          });
          requestsEl.appendChild(requestList);
        }
      }
      if (notificationsEl) {
        clearElement(notificationsEl);
        if (notifications.length) {
          notificationsEl.appendChild(textNode("h5", "Updates"));
          var notificationList = document.createElement("ul");
          notificationList.className = "tower-remote-list";
          notifications.slice(0, 6).forEach(function (notification) {
            notificationList.appendChild(textNode("li", notification.body));
          });
          notificationsEl.appendChild(notificationList);
        }
      }
    });
  }

  function refreshFriends() {
    var me = identity();
    if (!me) return Promise.resolve([]);
    var uid = encodeURIComponent(me.supabaseUserId);
    return client()
      .rest("friendships", {
        query:
          "select=user_id,friend_user_id&or=(user_id.eq." +
          uid +
          ",friend_user_id.eq." +
          uid +
          ")",
      })
      .then(function (rows) {
        var meId = me.supabaseUserId;
        var otherIds = [];
        var seen = {};
        (Array.isArray(rows) ? rows : []).forEach(function (row) {
          if (!row) return;
          var other =
            row.user_id === meId ? row.friend_user_id : row.user_id;
          other = String(other || "");
          if (!other || other === meId || seen[other]) return;
          seen[other] = true;
          otherIds.push(other);
        });
        return profilesForUsers(otherIds);
      })
      .then(function (profiles) {
        renderFriends(profiles);
        emit("cognation:remote-friends-loaded", { profiles: profiles });
        var ids = (Array.isArray(profiles) ? profiles : [])
          .map(function (p) {
            return String((p && (p.handle || p.id)) || "").replace(/^@/, "");
          })
          .filter(Boolean)
          .slice(0, 250);
        var store = window.CognationTowerProfileStore;
        if (store && store.get && store.save) {
          try {
            var tower = store.get() || {};
            tower.friendIds = ids.slice();
            store.save(tower, { geometry: true });
          } catch (eHydrate) {}
        }
        try {
          document.dispatchEvent(
            new CustomEvent("cognation:circle-friends-hydrated", {
              detail: { ids: ids, profiles: profiles },
            })
          );
        } catch (eEmit) {}
        return profiles;
      });
  }

  function refreshNotifications() {
    var me = identity();
    if (!me) return Promise.resolve({ notifications: [], requests: [] });
    return Promise.all([
      client().rest("notifications", {
        query:
          "select=id,actor_user_id,type,body,resource_id,read_at,created_at&recipient_user_id=eq." +
          encodeURIComponent(me.supabaseUserId) +
          "&order=created_at.desc&limit=30",
      }),
      client().rest("friend_requests", {
        query:
          "select=id,sender_user_id,created_at&recipient_user_id=eq." +
          encodeURIComponent(me.supabaseUserId) +
          "&status=eq.pending&order=created_at.desc",
      }),
    ]).then(function (result) {
      return profilesForUsers(
        (Array.isArray(result[1]) ? result[1] : []).map(function (request) {
          return request.sender_user_id;
        })
      ).then(function () {
        var payload = {
          notifications: Array.isArray(result[0]) ? result[0] : [],
          requests: Array.isArray(result[1]) ? result[1] : [],
        };
        renderConnections(payload);
        emit("cognation:remote-notifications-loaded", payload);
        return payload;
      });
    });
  }

  function acceptFriendRequest(id) {
    return client()
      .rpc("accept_friend_request", { request_id: id })
      .then(function () {
        return Promise.all([refreshFriends(), refreshNotifications()]);
      });
  }

  function refresh() {
    if (!active()) return Promise.resolve(null);
    return selectProfiles()
      .then(refreshMyProfiles)
      .then(function () {
        var current = session();
        if (!current.activeProfileId && state.myProfiles[0]) {
          setActiveProfile(state.myProfiles[0]);
        }
        return Promise.all([refreshFeed(), refreshFriends(), refreshNotifications()]);
      })
      .then(function () {
        emit("cognation:remote-profile-loaded", {
          profileId: viewedProfileId(),
        });
        return state;
      });
  }

  var sawSessionStart = false;
  document.addEventListener("cognation:session-started", function () {
    sawSessionStart = true;
    refresh();
  });

  function boot() {
    if (state.initialized) return;
    state.initialized = true;
    window.addEventListener("hashchange", function () {
      emit("cognation:remote-profile-loaded", { profileId: viewedProfileId() });
      refreshFeed();
    });
    /* Wait until login.js finishes the first auth check. An eager refresh here
       races getUser()/token refresh and paints the feed twice. */
    var ready = window.CognationAuth && window.CognationAuth.whenReady;
    if (ready && typeof ready.then === "function") {
      ready.then(function () {
        if (!sawSessionStart && active()) refresh();
      });
    } else if (active()) {
      refresh();
    }
  }

  window.CognationSupabaseSocial = {
    active: active,
    refresh: refresh,
    refreshFeed: refreshFeed,
    refreshFriends: refreshFriends,
    refreshNotifications: refreshNotifications,
    createTowerPost: createTowerPost,
    togglePostReaction: togglePostReaction,
    updateCurrentProfile: updateCurrentProfile,
    createProfessionalProfile: createProfessionalProfile,
    acceptFriendRequest: acceptFriendRequest,
    memberResults: memberResults,
    openProfile: openProfile,
    getProfile: profileForId,
    getProfileForHandle: profileForHandle,
    getProfileForUser: profileForUser,
    getMyProfiles: function () {
      return state.myProfiles.slice();
    },
    getViewedProfileId: viewedProfileId,
    getTowerProfile: function (id) {
      return toTowerProfile(profileForId(id));
    },
    setActiveProfile: setActiveProfile,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
