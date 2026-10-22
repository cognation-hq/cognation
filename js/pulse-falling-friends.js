/**
 * PULSE friends by engagement (Alexa final spec 2026-10-20).
 * Halo frames: the viewer's five friends they engage with MOST (name only,
 * photo opens that friend's Tower). Falling circles: the friends they engage
 * with LEAST, least first, up to 30, so they can reconnect or unfriend.
 * Engagement is per viewer and counts PUBLIC Cognation activity only, read
 * from Supabase: reactions on each other's PUBLIC Tower posts, @-tags in public Tower posts
 * and News comments, and reactions on each other's News comments.
 * Direct messages and chat rooms are never read and never count.
 * Falling circles sit outside the ring and the five frames, smaller and
 * lighter than the frame photos; they breathe (no orbit), still for
 * prefers-reduced-motion. Server only, no demo fallback.
 * Run: node js/pulse-falling-friends.test.js
 */
(function (root) {
  "use strict";

  var PULSE_FALL_CAP = 30;
  var HALO_COUNT = 5;
  var PAGE = 1000;
  var FRIEND_CAP = 6000; /* friendships read for ranking (unchanged server page cap) */

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
      if (out.length >= FRIEND_CAP) return;
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
        if (part.length < PAGE || rows.length >= FRIEND_CAP) return rows.slice(0, FRIEND_CAP);
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
    return loadRoster(client, id).then(function (r) { return r.friends; });
  }

  function loadRoster(client, id) {
    client = client || (root && root.CognationSupabase);
    id = safeId(id || viewerId());
    var none = { viewerId: id, friends: [], profiles: [] };
    if (!id || !client || typeof client.rest !== "function") return Promise.resolve(none);
    if (typeof client.configured === "function" && !client.configured()) return Promise.resolve(none);
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
        return { viewerId: id, friends: friendsFromRows(id, friendships, profiles), profiles: profiles };
      });
    }).then(null, function () { return none; });
  }

  /* ---------- Engagement (public activity only; DMs never read) ---------- */

  function chunks(list, n) {
    var out = [];
    for (var i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
    return out;
  }

  function mentionCount(body, handle) {
    handle = String(handle || "").replace(/^@/, "").toLowerCase();
    if (!handle) return 0;
    var text = String(body || "").toLowerCase();
    var n = 0;
    var at = text.indexOf("@" + handle);
    while (at >= 0) {
      var before = at > 0 ? text.charAt(at - 1) : "";
      var after = text.charAt(at + handle.length + 1);
      if (!/[a-z0-9_.-]/.test(before) && !/[a-z0-9_-]/.test(after)) n++;
      at = text.indexOf("@" + handle, at + 1);
    }
    return n;
  }

  /* Pure scorer. data: {viewerProfileIds, profileOwner{profileId:userId},
     handlesByUser{userId:[handle]}, viewerHandles, posts, postReactions,
     comments, commentReactions}. Returns {userId: score}. Only rows between
     the viewer and one friend count; friend-to-friend rows are ignored. */
  function scoreEngagement(viewerUserId, friendIds, data) {
    data = data || {};
    var score = {};
    var isFriend = {};
    (friendIds || []).forEach(function (u) { score[u] = 0; isFriend[u] = true; });
    var owner = data.profileOwner || {};
    function who(profileId) {
      var u = owner[profileId];
      if (u === viewerUserId) return "viewer";
      return u && isFriend[u] ? u : "";
    }
    function bump(u, n) { if (n === undefined) n = 1; if (u && isFriend[u] && n > 0) score[u] += n; }
    var handlesByUser = data.handlesByUser || {};
    var viewerHandles = data.viewerHandles || [];
    function tags(authorSide, body) {
      if (authorSide === "viewer") {
        Object.keys(handlesByUser).forEach(function (u) {
          if (!isFriend[u]) return;
          (handlesByUser[u] || []).forEach(function (h) { bump(u, mentionCount(body, h)); });
        });
      } else if (authorSide) {
        viewerHandles.forEach(function (h) { bump(authorSide, mentionCount(body, h)); });
      }
    }
    var postAuthor = {};
    (data.posts || []).forEach(function (p) {
      if (!p || !p.id) return;
      if (p.visibility && p.visibility !== "public") return; /* public Tower posts only */
      var side = who(p.author_profile_id);
      postAuthor[p.id] = side;
      tags(side, p.body);
    });
    (data.postReactions || []).forEach(function (r) {
      if (!r) return;
      var author = postAuthor[r.post_id];
      var reactor = who(r.profile_id);
      if (author === "viewer" && reactor && reactor !== "viewer") bump(reactor);
      else if (reactor === "viewer" && author && author !== "viewer") bump(author);
    });
    var commentAuthor = {};
    (data.comments || []).forEach(function (c) {
      if (!c || !c.id) return;
      var side = who(c.author_profile_id);
      commentAuthor[c.id] = side;
      tags(side, c.body);
    });
    (data.commentReactions || []).forEach(function (r) {
      if (!r) return;
      var author = commentAuthor[r.comment_id];
      var reactor = who(r.profile_id);
      if (author === "viewer" && reactor && reactor !== "viewer") bump(reactor);
      else if (reactor === "viewer" && author && author !== "viewer") bump(author);
    });
    return score;
  }

  function byName(a, b) {
    var x = String(a.name || "").toLowerCase(), y = String(b.name || "").toLowerCase();
    return x < y ? -1 : x > y ? 1 : String(a.userId) < String(b.userId) ? -1 : 1;
  }

  /* Halo: five MOST engaged (ties by name). Falling: everyone else, LEAST first, cap 30. */
  function rank(friends, scores) {
    scores = scores || {};
    var list = (friends || []).filter(function (f) { return f && f.userId; }).map(function (f) {
      return Object.assign({}, f, { engagement: scores[f.userId] || 0 });
    });
    var most = list.slice().sort(function (a, b) { return b.engagement - a.engagement || byName(a, b); });
    var halo = most.slice(0, HALO_COUNT);
    var fall = most.slice(HALO_COUNT).sort(function (a, b) { return a.engagement - b.engagement || byName(a, b); });
    return { halo: halo, fall: fall.slice(0, PULSE_FALL_CAP) };
  }

  /* Front frame gets the top friend: spot order is left, center, right, back-right, back-left. */
  function haloSpots(halo) {
    var order = [1, 0, 2, 4, 3];
    var out = [];
    order.forEach(function (rankIndex) {
      var f = halo[rankIndex];
      if (f) out.push({ name: f.name, userId: f.userId, handle: f.handle, photoUrl: f.photoUrl, caption: f.name });
    });
    /* fill spot slots in order; missing ranks leave later slots empty */
    return out;
  }

  function readAll(client, table, select, filterKey, ids, size, newestFirst, extra) {
    if (!ids.length) return Promise.resolve([]);
    return Promise.all(chunks(ids, size || 50).map(function (part) {
      return client.rest(table, {
        query: "select=" + select + "&" + filterKey + "=in.(" + part.join(",") + ")" + (extra ? "&" + extra : "") +
          (newestFirst ? "&order=created_at.desc" : "") + "&limit=" + PAGE,
      }).then(function (r) { return Array.isArray(r) ? r : []; });
    })).then(function (parts) { return [].concat.apply([], parts); });
  }

  /* Reads only public tables. A table that is missing or refused counts 0 and is listed in gaps. */
  function fetchEngagement(client, roster) {
    var viewer = roster.viewerId;
    var friendIds = roster.friends.map(function (f) { return f.userId; });
    var isFriend = {};
    friendIds.forEach(function (u) { isFriend[u] = true; });
    var profileOwner = {};
    var handlesByUser = {};
    var viewerHandles = [];
    var people = [];
    (roster.profiles || []).forEach(function (p) {
      if (!p || !p.id || !p.user_id) return;
      var u = String(p.user_id);
      if (u !== viewer && !isFriend[u]) return;
      if (!safeId(p.id)) return;
      profileOwner[p.id] = u;
      people.push(p.id);
      if (p.handle) {
        if (u === viewer) viewerHandles.push(String(p.handle));
        else (handlesByUser[u] = handlesByUser[u] || []).push(String(p.handle));
      }
    });
    var gaps = [];
    function soft(name, promise) {
      return promise.then(null, function () { gaps.push(name); return []; });
    }
    var data = { profileOwner: profileOwner, handlesByUser: handlesByUser, viewerHandles: viewerHandles };
    /* PUBLIC Tower posts only (PM 2026-10-21): friends-only posts never count. */
    var postsP = soft("tower_posts", readAll(client, "tower_posts", "id,author_profile_id,body,visibility", "author_profile_id", people, 50, true, "visibility=eq.public"));
    var commentsP = soft("news_story_comments", readAll(client, "news_story_comments", "id,author_profile_id,body", "author_profile_id", people, 50, true));
    return Promise.all([postsP, commentsP]).then(function (r) {
      data.posts = r[0];
      data.comments = r[1];
      var postIds = r[0].map(function (p) { return p.id; }).filter(safeId);
      var commentIds = r[1].map(function (c) { return c.id; }).filter(safeId);
      return Promise.all([
        soft("tower_post_reactions", readAll(client, "tower_post_reactions", "post_id,profile_id", "post_id", postIds, 100)),
        soft("news_story_comment_reactions", readAll(client, "news_story_comment_reactions", "comment_id,profile_id", "comment_id", commentIds, 100)),
      ]);
    }).then(function (r) {
      data.postReactions = r[0];
      data.commentReactions = r[1];
      return { scores: scoreEngagement(viewer, friendIds, data), gaps: gaps };
    });
  }

  function loadRanked(client, id) {
    client = client || (root && root.CognationSupabase);
    return loadRoster(client, id).then(function (roster) {
      if (!roster.friends.length) return { halo: [], fall: [], scores: {}, gaps: [] };
      return fetchEngagement(client, roster).then(function (e) {
        var r = rank(roster.friends, e.scores);
        r.scores = e.scores;
        r.gaps = e.gaps;
        return r;
      }, function () {
        var r = rank(roster.friends, {});
        r.scores = {};
        r.gaps = ["engagement"];
        return r;
      });
    });
  }

  /* ---------- Placement: outside the ring and the five frames ---------- */

  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

  /* Ring centre (layer px): --pulse-ring-y when set (phones lift the group), else 48%. */
  function ringY(layer, H) {
    var v = "";
    try { v = String(layer.style && layer.style.getPropertyValue ? layer.style.getPropertyValue("--pulse-ring-y") : "").trim(); } catch (e) {}
    var px = /^(-?[\d.]+)px$/.exec(v);
    return px ? num(px[1]) : H * 0.48;
  }

  /* Phones (Designer r3): lift the ring so the halo + falling circles group sits
     vertically centred in the panel. Only lifts (never pushes the ring down), only
     when every circle fits below the halo. Desktop keeps the ring at 48%. */
  function centerGroup(layer, count, w, h, opts) {
    if (!layer || !layer.style || !layer.style.removeProperty) return 0;
    layer.style.removeProperty("--pulse-ring-y");
    if (!(w > 0 && w <= 600) || !(h > 0) || !count) return 0;
    var band = blockedBand(layer);
    if (!band) return 0;
    var L = layoutOutside(count, w, h, band, { topLimit: opts && opts.topLimit });
    var bottom = band.bottom;
    for (var i = 0; i < L.slots.length; i++) {
      if (L.slots[i].y < band.top) return 0; /* circles above the halo: leave as is */
      bottom = Math.max(bottom, L.slots[i].y + L.size);
    }
    var lift = band.top - (h - (bottom - band.top)) / 2;
    if (!(lift > 1)) return 0;
    layer.style.setProperty("--pulse-ring-y", (h * 0.48 - lift).toFixed(1) + "px");
    return lift;
  }

  /* Vertical band (layer px) covered by the ring image and the five frames + captions.
     Read from layout values (offset sizes + the pinned transform), so the ring's
     build animation (scale 0.82 -> 1) never skews the measurement.
     The frames orbit the ring (js/pulse-frames-orbit.js) on a path bounded by their
     five pinned spots (data-pulse-pin), so the band covers every frame at every
     pinned spot: the falling circles stay clear of the frames all the way round. */
  function blockedBand(layer) {
    if (!layer) return null;
    var H = layer.clientHeight || 0;
    var cy = ringY(layer, H);
    var k = 0;
    try { k = num(root.getComputedStyle(layer).getPropertyValue("--pulse-bg-k")); } catch (e) {}
    if (!k) k = 0.954;
    var top = cy - 230 * k;
    var bottom = cy + 230 * k;
    var spots = layer.querySelectorAll ? layer.querySelectorAll("[data-circle-ring] [data-circle-spot]") : [];
    var re = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([\d.]+)\)/;
    var pins = [];
    var i;
    for (i = 0; i < spots.length; i++) {
      var pm = spots[i].getAttribute ? re.exec(spots[i].getAttribute("data-pulse-pin") || "") : null;
      if (pm) pins.push(pm);
    }
    for (i = 0; i < spots.length; i++) {
      var sp = spots[i];
      var m = re.exec(sp.style.transform || "");
      if (!m) continue;
      var s = num(m[3]) || 1;
      var h = sp.offsetHeight || 0;
      var cap = sp.querySelector ? sp.querySelector("[data-circle-caption]") : null;
      /* names sit below the photo (offsetTop includes the gap), scaled with the frame:
         screen px they reach below the photo */
      var capBelow = cap ? ((cap.offsetTop || h) + (cap.offsetHeight || 0) - h) * s : 0;
      var at = pins.length ? pins : [m];
      for (var j = 0; j < at.length; j++) {
        var ps = num(at[j][3]) || 1;
        var half = h * ps / 2;
        var y = cy + num(at[j][2]);
        top = Math.min(top, y - half);
        bottom = Math.max(bottom, y + half, y + half + capBelow);
      }
    }
    return { top: Math.max(0, top), bottom: Math.min(H, bottom) };
  }

  /* Rows of small circles in the free space below the band, then above it.
     Size stays under the smallest frame photo; shrinks only if needed to fit. */
  function layoutOutside(count, width, height, band, opts) {
    opts = opts || {};
    count = Math.max(0, Math.min(PULSE_FALL_CAP, count | 0));
    width = Math.max(200, width || 390);
    height = Math.max(200, height || 700);
    band = band || { top: height * 0.3, bottom: height * 0.7 };
    var pad = opts.pad == null ? 14 : opts.pad;
    var maxSize = opts.maxSize || (width <= 600 ? 28 : 40);
    var topLimit = opts.topLimit || 0;
    var regions = [
      { y0: band.bottom + pad, y1: height - pad },
      { y0: Math.max(topLimit, 0) + pad, y1: band.top - pad },
    ].filter(function (r) { return r.y1 > r.y0; });
    var size = maxSize;
    function fit(sz) {
      var gap = Math.max(6, Math.round(sz * 0.3));
      var cols = Math.max(1, Math.floor((width - 2 * pad + gap) / (sz + gap)));
      var cap = 0;
      regions.forEach(function (r) { cap += cols * Math.max(0, Math.floor((r.y1 - r.y0 + gap) / (sz + gap))); });
      return { gap: gap, cols: cols, cap: cap };
    }
    var f = fit(size);
    while (f.cap < count && size > 16) { size -= 2; f = fit(size); }
    var slots = [];
    var left = count;
    regions.forEach(function (r) {
      var rows = Math.max(0, Math.floor((r.y1 - r.y0 + f.gap) / (size + f.gap)));
      for (var row = 0; row < rows && left > 0; row++) {
        var inRow = Math.min(f.cols, left);
        var rowW = inRow * size + (inRow - 1) * f.gap;
        var x0 = (width - rowW) / 2;
        for (var c = 0; c < inRow; c++) {
          slots.push({ x: Math.round(x0 + c * (size + f.gap)), y: Math.round(r.y0 + row * (size + f.gap)) });
        }
        left -= inRow;
      }
    });
    return { size: size, gap: f.gap, cols: f.cols, slots: slots };
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
      if (opts.center && layer.style && layer.style.removeProperty) layer.style.removeProperty("--pulse-ring-y");
      stack.setAttribute("data-pulse-empty", "");
      stack.setAttribute("aria-label", "No friends on PULSE yet");
      layer.insertBefore(stack, layer.firstChild);
      return stack;
    }
    stack.setAttribute("aria-label", "Friends you engage with least");
    var w = opts.width || layer.clientWidth || 0;
    var vw = root && root.innerWidth ? root.innerWidth : 0;
    if (vw && (!w || vw < w)) w = vw; /* never wider than the screen */
    var h = opts.height || layer.clientHeight || 0;
    if (opts.center) centerGroup(layer, friends.length, w, h, opts);
    var band = opts.band || (typeof opts.avoid === "function" ? opts.avoid() : null);
    var L = layoutOutside(friends.length, w, h, band, { topLimit: opts.topLimit });
    var inner = document.createElement("div");
    inner.className = "pulse-fall-inner";
    stack.appendChild(inner);
    friends.forEach(function (friend, i) {
      var s = L.slots[i];
      if (!s) return; /* no free room left: never draw over the ring or frames */
      var el = document.createElement("a");
      el.className = "circle-fall-portrait pulse-fall-circle";
      el.setAttribute("data-circle-fall-portrait", friend.userId);
      el.setAttribute("data-friend-handle", friend.handle || "");
      el.setAttribute("data-engagement", String(friend.engagement || 0));
      el.href = friend.handle ? "#tower-profile-" + friend.handle : "#";
      el.setAttribute("aria-label", "Open " + friend.name + " Tower");
      el.style.width = L.size + "px";
      el.style.height = L.size + "px";
      el.style.left = s.x + "px";
      el.style.top = s.y + "px";
      el.style.fontSize = Math.max(9, Math.round(L.size * 0.36)) + "px";
      /* short drop into place with a bounce: a long fall would cross the ring */
      el.style.setProperty("--pulse-fall-from", "-10px"); /* inside the 14px pad */
      /* drop in, then breathe; staggered so the field never pulses in unison */
      el.style.animationDelay = Math.min(i * 40, 1200) + "ms, " + (1100 + Math.min(i * 40, 1200) + (i % 5) * 230) + "ms";
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

  var last = null;

  function paintHalo(halo, opts) {
    var people = haloSpots(halo || []);
    if (opts && typeof opts.fillSpots === "function") { try { opts.fillSpots(people); } catch (e) {} return people; }
    var fall = root && root.CognationCircleFall;
    if (fall && typeof fall.fillSpots === "function") { try { fall.fillSpots(people); } catch (e2) {} }
    return people;
  }

  function placeFalling(layer, list, opts) {
    var o = Object.assign({}, opts);
    if (!o.band && typeof o.avoid !== "function") { o.avoid = function () { return blockedBand(layer); }; o.center = true; }
    return render(layer, list, o);
  }

  function mount(layer, opts) {
    opts = opts || {};
    render(layer, [], opts); /* quiet empty until the server answers */
    return loadRanked(opts.client, opts.viewerId).then(function (r) {
      if (!layer.parentNode && !opts.detached) return r;
      paintHalo(r.halo, opts);
      if (r.gaps && r.gaps.length && layer.setAttribute) layer.setAttribute("data-pulse-engagement-gaps", r.gaps.join(" "));
      placeFalling(layer, r.fall, opts);
      last = { layer: layer, fall: r.fall, opts: opts };
      return r;
    });
  }

  if (root && root.addEventListener) {
    var resizeTimer = 0;
    root.addEventListener("resize", function () {
      if (!last || !last.layer || !last.layer.parentNode) return;
      if (resizeTimer) root.clearTimeout(resizeTimer);
      resizeTimer = root.setTimeout(function () { placeFalling(last.layer, last.fall, last.opts); }, 160);
    });
  }

  var api = {
    cap: PULSE_FALL_CAP,
    haloCount: HALO_COUNT,
    friendsFromRows: friendsFromRows,
    loadFriends: loadFriends,
    loadRoster: loadRoster,
    loadRanked: loadRanked,
    fetchEngagement: fetchEngagement,
    scoreEngagement: scoreEngagement,
    mentionCount: mentionCount,
    rank: rank,
    haloSpots: haloSpots,
    blockedBand: blockedBand,
    centerGroup: centerGroup,
    layoutOutside: layoutOutside,
    render: render,
    letterFor: letterFor,
    paintPhotoWhenLoaded: paintPhotoWhenLoaded,
    mount: mount,
  };
  if (root) root.CognationPulseFall = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
