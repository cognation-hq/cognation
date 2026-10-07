/**
 * Circle lists friendships and follows already stored in Supabase.
 * Newest first. The signed-in person only. Cap 250 fills ring spots from these rows;
 * empty state is the ring background (no blank "No saved…" panel).
 * Run the filter test with: node js/circle-saved-relations.test.js
 */
(function (root) {
  "use strict";

  function normalizeKind(profile) {
    if (!profile || typeof profile !== "object") return "";
    if (!Object.prototype.hasOwnProperty.call(profile, "account_kind") && !Object.prototype.hasOwnProperty.call(profile, "accountKind")) {
      return "";
    }
    var raw = Object.prototype.hasOwnProperty.call(profile, "account_kind") ? profile.account_kind : profile.accountKind;
    var k = String(raw == null ? "" : raw).trim().toLowerCase();
    if (k === "seed" || k === "demo") return "seed";
    if (k === "ops" || k === "opsbot" || k === "ops_bot") return "ops";
    if (k === "real") return "real";
    /* Missing, empty, or unknown is not a real person. */
    return "";
  }

  function profilesForUser(userId, profiles) {
    var id = String(userId || "");
    var rows = [];
    (profiles || []).forEach(function (profile) {
      if (profile && String(profile.user_id || "") === id) rows.push(profile);
    });
    return rows;
  }

  function kindForUser(userId, profiles) {
    var rows = profilesForUser(userId, profiles);
    if (!rows.length) return "";
    var fleet = "";
    var sawReal = false;
    var i;
    for (i = 0; i < rows.length; i++) {
      var kind = normalizeKind(rows[i]);
      if (!kind) return "";
      if (kind === "seed" || kind === "ops") fleet = fleet || kind;
      if (kind === "real") sawReal = true;
    }
    if (fleet) return fleet;
    if (sawReal) return "real";
    return "";
  }

  function pairAllowed(kindA, kindB) {
    if (kindA !== "real" && kindA !== "seed" && kindA !== "ops") return false;
    if (kindB !== "real" && kindB !== "seed" && kindB !== "ops") return false;
    var aFleet = kindA === "seed" || kindA === "ops";
    var bFleet = kindB === "seed" || kindB === "ops";
    return aFleet === bFleet;
  }

  function fleetFirstName(displayName) {
    var token = String(displayName || "").trim().split(/\s+/)[0] || "";
    token = token.replace(/^@+/, "").replace(/[0-9]/g, "");
    if (!token) return "Friend";
    return token;
  }

  function badgeFor(kind) {
    if (kind === "seed") return "Demo · seed";
    if (kind === "ops") return "Ops · demo";
    return "";
  }

  function displayForUser(userId, profiles) {
    var rows = profilesForUser(userId, profiles);
    var chosen = null;
    var i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].kind === "personal") chosen = rows[i];
    }
    if (!chosen) chosen = rows[0] || null;
    var kind = kindForUser(userId, profiles);
    var raw = chosen ? (chosen.display_name || chosen.displayName || "") : "";
    var name = kind === "seed" || kind === "ops" ? fleetFirstName(raw) : String(raw || "").trim();
    if (!name) name = "Someone";
    return {
      userId: String(userId || ""),
      name: name,
      accountKind: kind,
      badge: badgeFor(kind),
    };
  }

  function displayForProfile(profile) {
    var kind = normalizeKind(profile);
    var raw = profile ? (profile.display_name || profile.displayName || "") : "";
    var name = kind === "seed" || kind === "ops" ? fleetFirstName(raw) : String(raw || "").trim();
    if (!name) name = "Someone";
    return {
      userId: profile ? String(profile.user_id || "") : "",
      profileId: profile ? String(profile.id || "") : "",
      name: name,
      accountKind: kind,
      badge: badgeFor(kind),
    };
  }

  function stamp(value) {
    var t = Date.parse(value || "");
    return isNaN(t) ? 0 : t;
  }

  function profileById(profiles) {
    var map = {};
    (profiles || []).forEach(function (profile) {
      if (profile && profile.id) map[String(profile.id)] = profile;
    });
    return map;
  }

  /**
   * Rows the signed-in person is actually in.
   * Both sides need a real, seed, or ops label. A missing label drops the line.
   * A real account is never paired with a seed or ops account.
   */
  function visibleRelations(input) {
    input = input || {};
    var viewerId = String(input.viewerId || "");
    var profiles = Array.isArray(input.profiles) ? input.profiles : [];
    var byId = profileById(profiles);
    var lines = [];
    var seenFriends = {};
    if (!viewerId) return [];

    (Array.isArray(input.friendships) ? input.friendships : []).forEach(function (row) {
      if (!row) return;
      var a = String(row.user_id || "");
      var b = String(row.friend_user_id || "");
      if (!a || !b || a === b) return;
      if (a !== viewerId && b !== viewerId) return;
      var other = a === viewerId ? b : a;
      var key = a < b ? a + "|" + b : b + "|" + a;
      var kindA = kindForUser(viewerId, profiles);
      var kindB = kindForUser(other, profiles);
      if (!pairAllowed(kindA, kindB)) return;
      var at = stamp(row.created_at);
      var prev = seenFriends[key];
      if (prev && prev.at >= at) return;
      var viewer = displayForUser(viewerId, profiles);
      var friend = displayForUser(other, profiles);
      seenFriends[key] = {
        type: "friendship",
        at: at,
        key: "friendship|" + key,
        people: [viewer, friend],
        sentence: viewer.name + " and " + friend.name + " became friends.",
      };
    });
    Object.keys(seenFriends).forEach(function (key) {
      lines.push(seenFriends[key]);
    });

    var seenFollows = {};
    (Array.isArray(input.follows) ? input.follows : []).forEach(function (row) {
      if (!row) return;
      var followerId = String(row.follower_user_id || "");
      var profile = byId[String(row.profile_id || "")];
      if (!followerId || !profile || !profile.user_id) return;
      var ownerId = String(profile.user_id);
      if (followerId !== viewerId && ownerId !== viewerId) return;
      if (followerId === ownerId) return;
      var followKey = followerId + "|" + String(profile.id || "");
      var at = stamp(row.created_at);
      if (seenFollows[followKey] && seenFollows[followKey].at >= at) return;
      var followerKind = kindForUser(followerId, profiles);
      var pageKind = normalizeKind(profile);
      if (!pairAllowed(followerKind, pageKind)) return;
      var follower = displayForUser(followerId, profiles);
      var followed = displayForProfile(profile);
      seenFollows[followKey] = {
        type: "follow",
        at: at,
        key: "follow|" + followKey,
        people: [follower, followed],
        sentence: follower.name + " follows " + followed.name + ".",
      };
    });
    Object.keys(seenFollows).forEach(function (key) {
      lines.push(seenFollows[key]);
    });

    lines.sort(function (a, b) {
      if (a.at !== b.at) return b.at - a.at;
      if (a.key < b.key) return -1;
      if (a.key > b.key) return 1;
      return 0;
    });
    return lines.map(function (line) {
      return {
        type: line.type,
        at: line.at,
        people: line.people,
        sentence: line.sentence,
      };
    });
  }

  function safeId(value) {
    var id = String(value || "");
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : "";
  }

  function uniqueIds(ids) {
    var out = [];
    var seen = {};
    (ids || []).forEach(function (id) {
      id = safeId(id);
      if (!id || seen[id]) return;
      seen[id] = true;
      out.push(id);
    });
    return out;
  }

  function viewerId() {
    try {
      var session = root.CognationAuth && root.CognationAuth.getSession ? root.CognationAuth.getSession() : null;
      if (!session || session.source !== "supabase" || !session.supabaseUserId) return "";
      return safeId(session.supabaseUserId);
    } catch (e) {
      return "";
    }
  }

  function restGet(client, table, query) {
    return client.rest(table, { query: query });
  }

  function fetchBundle(client, id) {
    var cols = "id,user_id,kind,handle,display_name,account_kind";
    return Promise.all([
      restGet(
        client,
        "friendships",
        "select=user_id,friend_user_id,created_at&or=(user_id.eq." +
          id +
          ",friend_user_id.eq." +
          id +
          ")&order=created_at.desc&limit=200"
      ),
      restGet(
        client,
        "follows",
        "select=follower_user_id,profile_id,created_at&follower_user_id=eq." +
          id +
          "&order=created_at.desc&limit=200"
      ),
      restGet(client, "profiles", "select=" + cols + "&user_id=eq." + id),
    ]).then(function (parts) {
      var friendships = Array.isArray(parts[0]) ? parts[0] : [];
      var follows = Array.isArray(parts[1]) ? parts[1] : [];
      var mine = Array.isArray(parts[2]) ? parts[2] : [];
      var myIds = uniqueIds(mine.map(function (profile) { return profile && profile.id; }));
      var more = myIds.length
        ? restGet(
            client,
            "follows",
            "select=follower_user_id,profile_id,created_at&profile_id=in.(" +
              myIds.join(",") +
              ")&order=created_at.desc&limit=200"
          )
        : Promise.resolve([]);
      return Promise.resolve(more).then(function (extra) {
        if (Array.isArray(extra)) follows = follows.concat(extra);
        var userIds = [id];
        var profileIds = myIds.slice();
        friendships.forEach(function (row) {
          if (!row) return;
          userIds.push(row.user_id);
          userIds.push(row.friend_user_id);
        });
        follows.forEach(function (row) {
          if (!row) return;
          userIds.push(row.follower_user_id);
          profileIds.push(row.profile_id);
        });
        userIds = uniqueIds(userIds);
        profileIds = uniqueIds(profileIds);
        var filters = [];
        if (userIds.length) filters.push("user_id.in.(" + userIds.join(",") + ")");
        if (profileIds.length) filters.push("id.in.(" + profileIds.join(",") + ")");
        if (!filters.length) {
          return { viewerId: id, friendships: friendships, follows: follows, profiles: mine };
        }
        return restGet(
          client,
          "profiles",
          "select=" + cols + "&or=(" + filters.join(",") + ")&limit=400"
        ).then(function (profiles) {
          return {
            viewerId: id,
            friendships: friendships,
            follows: follows,
            profiles: Array.isArray(profiles) ? profiles : mine,
          };
        });
      });
    });
  }

  function clear(list) {
    while (list.firstChild) list.removeChild(list.firstChild);
  }

  function message(list, text) {
    clear(list);
    var item = document.createElement("li");
    item.textContent = text;
    list.appendChild(item);
  }

  function appendPerson(parent, person) {
    parent.appendChild(document.createTextNode(person.name));
    if (!person.badge) return;
    var badge = document.createElement("span");
    badge.className = "seedops-demo-badge";
    badge.setAttribute("role", "status");
    badge.setAttribute("data-account-kind", person.accountKind);
    badge.textContent = person.badge;
    parent.appendChild(badge);
  }

  function peopleForSpots(lines) {
    var seen = {};
    var out = [];
    (lines || []).forEach(function (line) {
      (line.people || []).forEach(function (person) {
        if (!person) return;
        var key = String(person.userId || person.profileId || person.name || "");
        if (!key || seen[key] || out.length >= 5) return;
        seen[key] = true;
        out.push(person);
      });
    });
    return out;
  }

  function fillRingSpots(people) {
    if (root && root.CognationCircleFall && typeof root.CognationCircleFall.fillSpots === "function") {
      root.CognationCircleFall.fillSpots(people || []);
    }
  }

  function paint(list, lines) {
    clear(list);
    list.classList.remove("is-loading");
    if (!lines.length) {
      /* Cap 250 empty state = ring + five empty spots, not blank copy. */
      list.classList.add("is-empty");
      fillRingSpots([]);
      return;
    }
    list.classList.remove("is-empty");
    fillRingSpots(peopleForSpots(lines));
    lines.forEach(function (line) {
      var item = document.createElement("li");
      item.setAttribute("data-circle-relation", line.type);
      if (line.type === "follow") {
        appendPerson(item, line.people[0]);
        item.appendChild(document.createTextNode(" follows "));
        appendPerson(item, line.people[1]);
        item.appendChild(document.createTextNode("."));
      } else {
        appendPerson(item, line.people[0]);
        item.appendChild(document.createTextNode(" and "));
        appendPerson(item, line.people[1]);
        item.appendChild(document.createTextNode(" became friends."));
      }
      list.appendChild(item);
    });
  }

  function loadLines() {
    var id = viewerId();
    if (!id) return Promise.resolve({ message: "Sign in to see your friendships and follows." });
    var client = root.CognationSupabase;
    if (!client || typeof client.configured !== "function" || !client.configured() || typeof client.rest !== "function") {
      return Promise.resolve({ message: "Friendships and follows could not be loaded." });
    }
    return fetchBundle(client, id).then(function (bundle) {
      return { lines: visibleRelations(bundle) };
    });
  }

  function mount(page) {
    if (!page || typeof document === "undefined") return;
    var host = page.querySelector ? page.querySelector("[data-circle-fall]") || page : page;
    var existing = host.querySelector ? host.querySelector("[data-circle-relations]") : null;
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var list = document.createElement("ul");
    list.className = "circle-relations";
    list.setAttribute("data-circle-relations", "");
    list.setAttribute("aria-label", "Friendships and follows");
    host.appendChild(list);
    list.classList.add("is-loading");
    list.classList.remove("is-empty");
    fillRingSpots([]);
    loadLines().then(
      function (result) {
        if (!list.parentNode) return;
        if (result && result.message) {
          list.classList.remove("is-loading", "is-empty");
          message(list, result.message);
          fillRingSpots([]);
        } else {
          paint(list, (result && result.lines) || []);
        }
      },
      function () {
        if (!list.parentNode) return;
        list.classList.remove("is-loading", "is-empty");
        message(list, "Friendships and follows could not be loaded.");
        fillRingSpots([]);
      }
    );
  }

  var api = {
    visibleRelations: visibleRelations,
    pairAllowed: pairAllowed,
    peopleForSpots: peopleForSpots,
    mount: mount,
  };
  if (root) root.CognationCircleRelations = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null);
