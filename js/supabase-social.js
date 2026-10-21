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

  /* "seed-" / "seed_" / "ops-" / "ops_" handles are SeedOps-only (js/handle-reserved.js). */
  function reservedHandle(value) {
    var rules = window.CognationHandleRules;
    return rules ? rules.isReserved(value) : /^(seed|ops)[-_]/.test(normalizeHandle(value));
  }
  function reservedHandleMessage(noun) {
    var rules = window.CognationHandleRules;
    return rules ? rules.message(noun) : noun + " can't start with \"seed-\", \"seed_\", \"ops-\" or \"ops_\". Please pick a different one.";
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
      /* profiles.account_kind / seed_fleet_id (20261002_seedops_account_kind.sql). */
      account_kind: profile.account_kind ? String(profile.account_kind) : "",
      seed_fleet_id: profile.seed_fleet_id ? String(profile.seed_fleet_id) : "",
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

  var PROFILE_RETURN_COLUMNS = "id,user_id,kind,handle,display_name,bio,account_kind,seed_fleet_id";

  /* Leave Sage (seed-0248, the under-13 test viewer) out of member lists. */
  function u13() {
    return window.CognationU13TestViewer || null;
  }
  function listFilter() {
    return u13() ? "&" + u13().LIST_FILTER : "";
  }
  function isSageRow(row) {
    return !!(u13() && u13().isSageRow(row));
  }

  function selectProfiles() {
    return client()
      .rest("profiles", {
        query:
          "select=" + PROFILE_RETURN_COLUMNS + "&order=created_at.desc&limit=400" + listFilter(),
      })
      .then(cacheProfiles);
  }

  function refreshMyProfiles() {
    var me = identity();
    if (!me) return Promise.resolve([]);
    return client()
      .rest("profiles", {
        query:
          "select=" + PROFILE_RETURN_COLUMNS + "&user_id=eq." +
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
      /* Author links carry the profile id (handle when there is no id). */
      var byId = slug && Object.prototype.hasOwnProperty.call(state.profiles, slug) ? state.profiles[slug] : null;
      var byHash = byId || (slug ? profileForHandle(slug) : null);
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
      _userId: profile.user_id || "",
      _remote: true,
      displayName: profile.display_name,
      handle: profile.handle,
      /* Seed/ops Demo badge (syncTowerBadges) and the friend gate
         (tower-follow "Unavailable") read these, never the handle. */
      accountKind: String(profile.account_kind || "").toLowerCase(),
      isSeed: String(profile.account_kind || "").toLowerCase() === "seed",
      isOpsBot: String(profile.account_kind || "").toLowerCase() === "ops",
      seedFleetId: String(profile.seed_fleet_id || ""),
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
    /* Seed/ops badges read these account fields, not the handle. Missing
       (older cache) stays "" so classify falls back to "real". */
    var accountKind = String(
      (author && author.account_kind) || (embedded && embedded.account_kind) || ""
    ).toLowerCase();
    var seedFleetId = String(
      (author && author.seed_fleet_id) || (embedded && embedded.seed_fleet_id) || ""
    );
    var reactions = reactionsMap(row && row.reactions);
    var hearts = reactions["❤️"] ? reactions["❤️"].length : 0;
    return {
      id: row.id,
      _remote: true,
      authorProfileId: row.author_profile_id,
      authorName: display,
      handle: handle,
      accountKind: accountKind,
      isSeed: accountKind === "seed",
      isOpsBot: accountKind === "ops",
      seedFleetId: seedFleetId,
      body: row.body || "",
      createdAt: row.created_at,
      attachments: (function () {
        var atts = Array.isArray(row.attachments) ? row.attachments.slice() : [];
        var hide = Array.isArray(row.hidden_attachment_indexes) ? row.hidden_attachment_indexes : [];
        if (!hide.length) return atts;
        /* Illegal-image reports hide that image for everyone; no bytes, no description. */
        return atts.map(function (a, i) {
          return hide.indexOf(i) >= 0 ? { kind: "removed", label: "Removed" } : a;
        });
      })(),
      likes: hearts,
      reactions: reactions,
      visibility: row.visibility || "friends",
      /* Server auto-rate (tower_posts.rating); read-only for everyone but Investigator. */
      rating: row.rating || "PG-13",
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

  var FEED_COLUMNS =
    "id,author_profile_id,body,visibility,attachments,created_at,rating,hidden_attachment_indexes,author:profiles!tower_posts_author_profile_id_fkey(id,user_id,kind,handle,display_name,bio,account_kind,seed_fleet_id),reactions:tower_post_reactions(face,profile_id)";
  var FEED_TAIL = "&order=created_at.desc&limit=100";

  /* The rating column is missing until 20261015_tower_auto_rate.sql runs. */
  function isMissingRatingColumn(err) {
    var text = String((err && (err.message || err.details || err.hint || err.code)) || err || "");
    return /rating/i.test(text) && /(column|42703|PGRST204|does not exist|schema cache)/i.test(text);
  }

  function refreshFeed() {
    if (!active()) return Promise.resolve([]);
    var me = identity();
    return client()
      .rest("tower_posts", { query: "select=" + FEED_COLUMNS + FEED_TAIL })
      .then(function (rows) {
        return { rows: rows, unrated: false };
      }, function (err) {
        var missingRating = isMissingRatingColumn(err);
        var missingHide = /hidden_attachment_indexes/i.test(String((err && err.message) || err || ""));
        if (!missingRating && !missingHide) throw err;
        var q = FEED_COLUMNS;
        if (missingRating) q = q.replace(",rating,", ",").replace(",hidden_attachment_indexes,", ",");
        else if (missingHide) q = q.replace(",hidden_attachment_indexes,", ",");
        /* Fail closed: without server ratings, show only the viewer's own posts. */
        return client()
          .rest("tower_posts", { query: "select=" + q + FEED_TAIL })
          .then(function (rows) {
            return { rows: rows, unrated: missingRating };
          });
      })
      .then(function (res) {
        var posts = (Array.isArray(res.rows) ? res.rows : [])
          .filter(function (row) {
            if (isSageRow(row && (row.author || row.profiles))) return false;
            if (!res.unrated) return true;
            var author = row && (row.author || row.profiles);
            return !!(author && me && author.user_id && author.user_id === me.supabaseUserId);
          })
          .map(mapPost);
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
          visibility: (window.CognationEchoGroups && window.CognationEchoGroups.isGroupPost(body)) ? "public" : "friends",
          attachments: Array.isArray(fields && fields.attachments)
            ? fields.attachments.map(function (attachment) {
                var item = {
                  kind: String(attachment.kind || "document"),
                  label: String(attachment.label || attachment.name || "Attachment").slice(0, 160),
                };
                var pic = String((attachment && attachment.dataUrl) || "");
                if (pic.indexOf("data:image/") === 0 && pic.length < 180000) item.dataUrl = pic;
                return item;
              })
            : [],
        },
      })
      .then(function () {
        return refreshFeed();
      });
  }

  /* Poster appeals their post's rating once (server enforces one per post). */
  function appealPostRating(postId, note) {
    if (!active() || !identity()) return Promise.reject(new Error("Sign in to appeal."));
    return client()
      .rpc("appeal_my_post_rating", { post_id: postId, note: String(note || "").slice(0, 280) || null })
      .then(function (ok) {
        return { ok: ok === true, alreadyAppealed: ok === false };
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
    if (changes.handle && reservedHandle(changes.handle)) {
      return Promise.reject(new Error(reservedHandleMessage("Handles")));
    }
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
    if (reservedHandle(base)) return Promise.reject(new Error(reservedHandleMessage("Handles")));
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
        return (!me || profile.user_id !== me.supabaseUserId) && !isSageRow(profile);
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
        /* Friend ids must be profile UUIDs. Handles like seed-ana-0005 used to
           land here, then id=eq.<handle> returned 400 22P02 and the failed
           refetch fell back to an empty/default Tower layout after Save. */
        var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        var ids = (Array.isArray(profiles) ? profiles : [])
          .map(function (p) {
            return String((p && p.id) || "");
          })
          .filter(function (id) { return UUID_RE.test(id); })
          .slice(0, 250);
        var store = window.CognationTowerProfileStore;
        if (store && store.get && store.save) {
          try {
            var tower = store.get() || {};
            tower.friendIds = ids.slice();
            /* Friend roster only — never a geometry edit. geometry:true was
               rewriting tower_widget_layouts on every Save/reload. */
            store.save(tower);
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
    appealPostRating: appealPostRating,
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
    /* Server profiles loaded this session (others only, no Sage rows). */
    listProfiles: function () {
      var me = identity();
      return Object.keys(state.profiles).map(function (id) { return state.profiles[id]; }).filter(function (p) {
        return p && (!me || p.user_id !== me.supabaseUserId) && !isSageRow(p);
      });
    },
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
