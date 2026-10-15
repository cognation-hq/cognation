/**
 * PULSE falling friends (Designer LOOK lock 2026-10-15).
 * Every friend's Tower picture circle falls from the top BEHIND the halo
 * circles. All friends from the server, up to 6,000, no sampling, no demo
 * fallback. Big rosters get smaller circles and a scrollable stack so every
 * circle stays reachable. A tap opens that person's Tower.
 * Empty PULSE is a quiet real empty state (no circles, no filler copy).
 * Run: node js/pulse-falling-friends.test.js
 */
(function (root) {
  "use strict";

  var PULSE_FALL_CAP = 6000;
  var PAGE = 1000;

  function safeId(value) {
    var id = String(value || "");
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : "";
  }

  function relations() {
    return root && root.CognationCircleRelations ? root.CognationCircleRelations : null;
  }

  /* Friends of the viewer from server rows. Reuses the real/seed pairing rule. */
  function friendsFromRows(viewerId, friendships, profiles) {
    var rel = relations();
    var lines = rel && typeof rel.visibleRelations === "function"
      ? rel.visibleRelations({ viewerId: viewerId, friendships: friendships, follows: [], profiles: profiles })
      : [];
    var handles = {};
    var photos = {};
    (profiles || []).forEach(function (p) {
      if (!p || !p.user_id) return;
      var uid = String(p.user_id);
      if (p.handle && (!handles[uid] || p.kind === "personal")) handles[uid] = String(p.handle);
      if (p.photo_url && (!photos[uid] || p.kind === "personal")) photos[uid] = String(p.photo_url);
    });
    var out = [];
    var seen = {};
    lines.forEach(function (line) {
      if (!line || line.type !== "friendship") return;
      var friend = line.people && line.people[1];
      if (!friend || !friend.userId || seen[friend.userId]) return;
      if (out.length >= PULSE_FALL_CAP) return;
      seen[friend.userId] = true;
      out.push({
        userId: friend.userId,
        name: friend.name,
        handle: handles[friend.userId] || "",
        badge: friend.badge || "",
        photoUrl: photos[friend.userId] || "",
      });
    });
    return out;
  }

  function fetchFriendships(client, id) {
    var rows = [];
    function page(offset) {
      return client.rest("friendships", {
        query: "select=user_id,friend_user_id,created_at&or=(user_id.eq." + id + ",friend_user_id.eq." + id +
          ")&order=created_at.desc&limit=" + PAGE + "&offset=" + offset,
      }).then(function (part) {
        part = Array.isArray(part) ? part : [];
        rows = rows.concat(part);
        if (part.length < PAGE || rows.length >= PULSE_FALL_CAP) return rows.slice(0, PULSE_FALL_CAP);
        return page(offset + PAGE);
      });
    }
    return page(0);
  }

  var BASE_COLS = "id,user_id,kind,handle,display_name,account_kind";

  function fetchProfiles(client, userIds, withPhoto) {
    var chunks = [];
    for (var i = 0; i < userIds.length; i += 100) chunks.push(userIds.slice(i, i + 100));
    var cols = withPhoto === false ? BASE_COLS : BASE_COLS + ",photo_url";
    return Promise.all(chunks.map(function (ids) {
      return client.rest("profiles", {
        query: "select=" + cols + "&user_id=in.(" + ids.join(",") + ")&limit=1000",
      }).then(function (r) { return Array.isArray(r) ? r : []; });
    })).then(function (parts) { return [].concat.apply([], parts); }, function (err) {
      /* photo_url SQL not run yet: read without it and keep letter circles. */
      if (withPhoto === false) throw err;
      return fetchProfiles(client, userIds, false);
    });
  }

  function viewerId() {
    try {
      var s = root.CognationAuth && root.CognationAuth.getSession ? root.CognationAuth.getSession() : null;
      if (!s || s.source !== "supabase") return "";
      return safeId(s.supabaseUserId);
    } catch (e) { return ""; }
  }

  /* Server only. Anything missing = empty list, never demo friends. */
  function loadFriends(client, id) {
    client = client || (root && root.CognationSupabase);
    id = safeId(id || viewerId());
    if (!id || !client || typeof client.rest !== "function") return Promise.resolve([]);
    if (typeof client.configured === "function" && !client.configured()) return Promise.resolve([]);
    return fetchFriendships(client, id).then(function (friendships) {
      var ids = [id];
      var seen = {};
      seen[id] = true;
      friendships.forEach(function (r) {
        [r && r.user_id, r && r.friend_user_id].forEach(function (u) {
          u = safeId(u);
          if (u && !seen[u]) { seen[u] = true; ids.push(u); }
        });
      });
      return fetchProfiles(client, ids).then(function (profiles) {
        return friendsFromRows(id, friendships, profiles);
      });
    }, function () { return []; });
  }

  /* Density: smaller circles as the roster grows; the stack scrolls past the fold. */
  function layout(count, width, height) {
    count = Math.max(0, Math.min(PULSE_FALL_CAP, count | 0));
    width = Math.max(240, width || 390);
    height = Math.max(320, height || 700);
    var size = count <= 40 ? 64 : count <= 300 ? 44 : count <= 1500 ? 30 : 22;
    var gap = Math.max(4, Math.round(size * 0.18));
    /* Leave room for the half-step offset on odd rows so no circle is clipped. */
    var cols = Math.max(1, Math.floor((width - gap - (size + gap) / 2) / (size + gap)));
    var rows = Math.ceil(count / cols);
    var stackHeight = Math.max(height, rows * (size + gap) + gap * 2);
    return { size: size, gap: gap, cols: cols, rows: rows, height: stackHeight, scroll: stackHeight > height };
  }

  /* Circle i settles bottom-up (row 0 at the floor) like a pile. */
  function slot(i, L, count) {
    var row = Math.floor(i / L.cols);
    var col = i % L.cols;
    var offset = row % 2 ? (L.size + L.gap) / 2 : 0;
    var x = L.gap + col * (L.size + L.gap) + offset;
    var y = L.height - L.gap - (row + 1) * (L.size + L.gap);
    return { x: Math.round(x), y: Math.round(y), delay: Math.min(i * 14, 6000) };
  }

  function render(layer, friends, opts) {
    opts = opts || {};
    if (!layer || typeof document === "undefined") return null;
    var old = layer.querySelector("[data-pulse-fall-stack]");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    friends = (Array.isArray(friends) ? friends : []).slice(0, PULSE_FALL_CAP);
    var stack = document.createElement("div");
    stack.className = "pulse-fall-stack";
    stack.setAttribute("data-pulse-fall-stack", "");
    stack.setAttribute("data-pulse-count", String(friends.length));
    layer.setAttribute("data-circle-count", String(friends.length));
    if (!friends.length) {
      /* Quiet real empty: no circles, no demo friends, no filler copy. */
      stack.setAttribute("data-pulse-empty", "");
      stack.setAttribute("aria-label", "No friends on PULSE yet");
      layer.insertBefore(stack, layer.firstChild);
      return stack;
    }
    var w = opts.width || layer.clientWidth || 0;
    var vw = root && root.innerWidth ? root.innerWidth : 0;
    if (vw && (!w || vw < w)) w = vw; /* never wider than the screen */
    var L = layout(friends.length, w, opts.height || layer.clientHeight);
    if (L.scroll) stack.classList.add("is-scroll");
    var inner = document.createElement("div");
    inner.className = "pulse-fall-inner";
    inner.style.height = L.height + "px";
    stack.appendChild(inner);
    friends.forEach(function (friend, i) {
      var s = slot(i, L, friends.length);
      var el = document.createElement("a");
      el.className = "circle-fall-portrait pulse-fall-circle";
      el.setAttribute("data-circle-fall-portrait", friend.userId);
      el.setAttribute("data-friend-handle", friend.handle || "");
      el.href = friend.handle ? "#tower-profile-" + friend.handle : "#";
      el.setAttribute("aria-label", "Open " + friend.name + " Tower");
      el.style.width = L.size + "px";
      el.style.height = L.size + "px";
      el.style.left = s.x + "px";
      el.style.top = s.y + "px";
      el.style.fontSize = Math.max(9, Math.round(L.size * 0.32)) + "px";
      el.style.setProperty("--pulse-fall-from", -(s.y + L.size + 40) + "px");
      el.style.animationDelay = s.delay + "ms";
      if (typeof opts.paint === "function") {
        try { opts.paint(el, friend, i); } catch (eP) {}
      }
      /* Always a letter circle first (live #137 check: falling circles were
         blank). A local browser-only avatar from the painter is dropped. */
      paintLetter(el, friend);
      /* Server photo only for a non-empty https URL that actually loads. */
      paintPhotoWhenLoaded(el, friend.photoUrl);
      el.addEventListener("click", function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        if (typeof opts.open === "function") opts.open(friend.handle, friend);
      });
      inner.appendChild(el);
    });
    layer.insertBefore(stack, layer.firstChild);
    return stack;
  }

  function letterFor(friend) {
    var ch = String((friend && friend.name) || "").trim().charAt(0).toUpperCase();
    return ch || "?";
  }

  function paintLetter(el, friend) {
    el.textContent = letterFor(friend);
    if (el.style) el.style.backgroundImage = "";
    if (el.removeAttribute) el.removeAttribute("data-pulse-photo");
  }

  function paintPhotoWhenLoaded(el, url) {
    var photo = root && root.CognationProfilePhoto;
    if (!photo || typeof photo.applyPhoto !== "function" || typeof photo.clean !== "function") return false;
    var clean = photo.clean(url);
    if (!clean) return false;
    var Img = root && root.Image;
    if (typeof Img !== "function") return false;
    var probe = new Img();
    probe.onload = function () { photo.applyPhoto(el, clean); };
    probe.onerror = function () {}; /* broken URL keeps the letter */
    probe.src = clean;
    return true;
  }

  function mount(layer, opts) {
    opts = opts || {};
    render(layer, [], opts); /* quiet empty until the server answers */
    return loadFriends(opts.client, opts.viewerId).then(function (friends) {
      if (!layer.parentNode && !opts.detached) return friends;
      render(layer, friends, opts);
      return friends;
    });
  }

  var api = {
    cap: PULSE_FALL_CAP,
    friendsFromRows: friendsFromRows,
    loadFriends: loadFriends,
    layout: layout,
    slot: slot,
    render: render,
    letterFor: letterFor,
    paintPhotoWhenLoaded: paintPhotoWhenLoaded,
    mount: mount,
  };
  if (root) root.CognationPulseFall = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
