/**
 * PULSE friends by engagement (Alexa final spec 2026-10-20).
 * Halo frames: the viewer's five friends they engage with MOST (name only,
 * photo opens that friend's Tower). Falling circles: the friends they engage
 * with LEAST, least first, up to 30, so they can reconnect or unfriend.
 * Engagement is per viewer and counts PUBLIC Cognation activity only, read
 * from Supabase: reactions on each other's PUBLIC Tower posts, @-tags in public Tower posts
 * and News comments, and reactions on each other's News comments.
 * Direct messages and chat rooms are never read and never count.
 * Blocked people (user_blocks + CognationBlock.listMyBlocks) never appear,
 * Personal or Pro, and Tower posts hidden by review never count. Ties go to
 * the latest public interaction, oldest first (none at all first), then name.
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

  /* People the viewer blocked: user_blocks (RLS: the blocker's own rows) plus the
     existing client list (CognationBlock.listMyBlocks). A refused read adds nothing;
     block_user also removes the friendship server side. */
  function fetchBlocked(client, id) {
    var set = {};
    function add(u) { u = safeId(u); if (u) set[u] = true; }
    function addRows(key) {
      return function (rows) { (Array.isArray(rows) ? rows : []).forEach(function (r) { add(r && r[key]); }); };
    }
    var fromTable = Promise.resolve().then(function () {
      return client.rest("user_blocks", { query: "select=blocked_user_id&blocker_user_id=eq." + id + "&limit=" + PAGE });
    }).then(addRows("blocked_user_id"), function () {});
    var cb = root && root.CognationBlock;
    var fromList = cb && typeof cb.listMyBlocks === "function"
      ? Promise.resolve().then(function () { return cb.listMyBlocks(); }).then(addRows("user_id"), function () {})
      : Promise.resolve();
    return Promise.all([fromTable, fromList]).then(function () { return set; });
  }

  function notBlocked(blocked) {
    return function (f) { return !(f && f.userId && blocked && blocked[f.userId]); };
  }

  /* Server only. Anything missing = empty list, never demo friends. */
  function loadFriends(client, id) {
    return loadRoster(client, id).then(function (r) { return r.friends; });
  }

  function loadRoster(client, id) {
    client = client || (root && root.CognationSupabase);
    id = safeId(id || viewerId());
    var none = { viewerId: id, friends: [], profiles: [], blocked: {} };
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
        return Promise.all([followsFor(client, id, profiles), fetchBlocked(client, id)]).then(function (both) {
          var extra = both[0];
          var blocked = both[1];
          var all = profiles.concat(extra.profiles || []);
          var friends = friendsFromRows(id, friendships, all).filter(notBlocked(blocked));
          return { viewerId: id, friends: friends, profiles: all, follows: extra.follows || [], blocked: blocked };
        });
      });
    }).then(null, function () { return none; });
  }

  function proFromFollows(follows, profiles) {
    var byId = {};
    (profiles || []).forEach(function (p) { if (p && p.id) byId[String(p.id)] = p; });
    var out = [], seen = {};
    (follows || []).forEach(function (row) {
      var p = byId[String(row && row.profile_id || "")];
      if (!p || p.kind !== "professional" || !p.user_id || seen[p.user_id]) return;
      seen[p.user_id] = 1;
      out.push({ userId: String(p.user_id), name: p.display_name || "Pro", handle: p.handle || "", photoUrl: p.photo_url || "", profileId: String(p.id) });
    });
    return out;
  }

  function followsFor(client, id, profiles) {
    return Promise.resolve().then(function () {
      return client.rest("follows", { query: "select=follower_user_id,profile_id&follower_user_id=eq." + id + "&limit=" + PAGE });
    }).then(function (rows) {
      rows = Array.isArray(rows) ? rows : [];
      var have = {};
      (profiles || []).forEach(function (p) { if (p && p.id) have[String(p.id)] = 1; });
      var miss = [];
      rows.forEach(function (r) { var pid = r && String(r.profile_id || ""); if (pid && !have[pid]) miss.push(pid); });
      if (!miss.length) return { follows: rows, profiles: [] };
      return client.rest("profiles", { query: "select=" + BASE_COLS + ",photo_url&id=in.(" + miss.join(",") + ")&limit=" + PAGE }).then(function (more) {
        return { follows: rows, profiles: Array.isArray(more) ? more : [] };
      }, function () { return { follows: rows, profiles: [] }; });
    }, function () { return { follows: [], profiles: [] }; });
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
    return engagementDetail(viewerUserId, friendIds, data).score;
  }

  /* scoreEngagement plus last{userId: ISO time}: the latest counted public interaction
     that carries a time (post or comment created_at, Tower reaction created_at). */
  function engagementDetail(viewerUserId, friendIds, data) {
    data = data || {};
    var score = {};
    var last = {};
    var isFriend = {};
    (friendIds || []).forEach(function (u) { score[u] = 0; isFriend[u] = true; });
    var owner = data.profileOwner || {};
    function who(profileId) {
      var u = owner[profileId];
      if (u === viewerUserId) return "viewer";
      return u && isFriend[u] ? u : "";
    }
    function bump(u, n, at) {
      if (n === undefined) n = 1;
      if (!(u && isFriend[u] && n > 0)) return;
      score[u] += n;
      var t = at ? Date.parse(at) : NaN;
      if (!isNaN(t) && (!last[u] || t > Date.parse(last[u]))) last[u] = String(at);
    }
    var handlesByUser = data.handlesByUser || {};
    var viewerHandles = data.viewerHandles || [];
    function tags(authorSide, body, at) {
      if (authorSide === "viewer") {
        Object.keys(handlesByUser).forEach(function (u) {
          if (!isFriend[u]) return;
          (handlesByUser[u] || []).forEach(function (h) { bump(u, mentionCount(body, h), at); });
        });
      } else if (authorSide) {
        viewerHandles.forEach(function (h) { bump(authorSide, mentionCount(body, h), at); });
      }
    }
    var postAuthor = {};
    (data.posts || []).forEach(function (p) {
      if (!p || !p.id) return;
      if (p.visibility && p.visibility !== "public") return; /* public Tower posts only */
      if (p.hidden_at) return; /* hidden by review: never counts */
      var side = who(p.author_profile_id);
      postAuthor[p.id] = side;
      tags(side, p.body, p.created_at);
    });
    (data.postReactions || []).forEach(function (r) {
      if (!r) return;
      var author = postAuthor[r.post_id];
      var reactor = who(r.profile_id);
      if (author === "viewer" && reactor && reactor !== "viewer") bump(reactor, 1, r.created_at);
      else if (reactor === "viewer" && author && author !== "viewer") bump(author, 1, r.created_at);
    });
    var commentAuthor = {};
    (data.comments || []).forEach(function (c) {
      if (!c || !c.id) return;
      var side = who(c.author_profile_id);
      commentAuthor[c.id] = side;
      tags(side, c.body, c.created_at);
    });
    (data.commentReactions || []).forEach(function (r) {
      if (!r) return;
      var author = commentAuthor[r.comment_id];
      var reactor = who(r.profile_id);
      if (author === "viewer" && reactor && reactor !== "viewer") bump(reactor);
      else if (reactor === "viewer" && author && author !== "viewer") bump(author);
    });
    return { score: score, last: last };
  }

  function byName(a, b) {
    var x = String(a.name || "").toLowerCase(), y = String(b.name || "").toLowerCase();
    return x < y ? -1 : x > y ? 1 : String(a.userId) < String(b.userId) ? -1 : 1;
  }

  /* Latest public interaction time, or null when none carries a time. */
  function lastAt(last, f) {
    var t = last && last[f.userId] ? Date.parse(last[f.userId]) : NaN;
    return isNaN(t) ? null : t;
  }

  /* Halo: five MOST engaged (ties: most recent interaction, then name). Falling:
     everyone else, LEAST first; ties: no interaction first, then the oldest latest
     interaction, then name. Cap 30. */
  function rank(friends, scores, last) {
    scores = scores || {};
    function older(a, b) {
      var x = lastAt(last, a), y = lastAt(last, b);
      if (x === y) return 0;
      if (x === null) return -1;
      if (y === null) return 1;
      return x - y;
    }
    var list = (friends || []).filter(function (f) { return f && f.userId; }).map(function (f) {
      return Object.assign({}, f, { engagement: scores[f.userId] || 0 });
    });
    var most = list.slice().sort(function (a, b) { return b.engagement - a.engagement || older(b, a) || byName(a, b); });
    var halo = most.slice(0, HALO_COUNT);
    var fall = most.slice(HALO_COUNT).sort(function (a, b) { return a.engagement - b.engagement || older(a, b) || byName(a, b); });
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
    /* PUBLIC Tower posts only (PM 2026-10-21): friends-only posts never count.
       Posts hidden by review never count (PM 2026-10-30): RLS still returns them to their author. */
    var postsP = soft("tower_posts", readAll(client, "tower_posts", "id,author_profile_id,body,visibility,created_at", "author_profile_id", people, 50, true, "visibility=eq.public&hidden_at=is.null"));
    /* news_story_comments has no review-hidden column. */
    var commentsP = soft("news_story_comments", readAll(client, "news_story_comments", "id,author_profile_id,body,created_at", "author_profile_id", people, 50, true));
    return Promise.all([postsP, commentsP]).then(function (r) {
      data.posts = r[0];
      data.comments = r[1];
      var postIds = r[0].map(function (p) { return p.id; }).filter(safeId);
      var commentIds = r[1].map(function (c) { return c.id; }).filter(safeId);
      return Promise.all([
        soft("tower_post_reactions", readAll(client, "tower_post_reactions", "post_id,profile_id,created_at", "post_id", postIds, 100)),
        /* no created_at column on this table yet: these count but carry no time */
        soft("news_story_comment_reactions", readAll(client, "news_story_comment_reactions", "comment_id,profile_id", "comment_id", commentIds, 100)),
      ]);
    }).then(function (r) {
      data.postReactions = r[0];
      data.commentReactions = r[1];
      var detail = engagementDetail(viewer, friendIds, data);
      return { scores: detail.score, last: detail.last, gaps: gaps };
    });
  }

  function loadRanked(client, id) {
    client = client || (root && root.CognationSupabase);
    return loadRoster(client, id).then(function (roster) {
      var pro = proFromFollows(roster.follows, roster.profiles).filter(notBlocked(roster.blocked));
      if (!roster.friends.length && !pro.length) return { halo: [], fall: [], scores: {}, gaps: [], professional: { halo: [], fall: [] } };
      var seen = {}, merged = roster.friends.slice();
      roster.friends.forEach(function (f) { seen[f.userId] = 1; });
      pro.forEach(function (f) { if (!seen[f.userId]) merged.push(f); });
      var scoreRoster = { viewerId: roster.viewerId, friends: merged, profiles: roster.profiles };
      function pack(scores, gaps, last) {
        var r = rank(roster.friends, scores, last);
        r.scores = scores;
        r.last = last || {};
        r.gaps = gaps;
        r.professional = rank(pro, scores, last);
        return r;
      }
      return fetchEngagement(client, scoreRoster).then(function (e) {
        return pack(e.scores, e.gaps, e.last);
      }, function () { return pack({}, ["engagement"]); });
    });
  }


  /* ---------- Phones (<768px): the #265 3D orbit fitted to the ring box ---------- */
  /* Designer 2026-10-27 (SeedOps 390 FAIL on 4900038): #265 drew the orbit at a fixed
     320px radius with ~84px frames, so at 390 four of five friends sat off the panel.
     On phones the same 3D path is scaled to the ring box (panel width - 32px) and
     shrunk further only if a frame would come within 8px of a panel edge. Back frames
     are 44px, the front frame 56px, sizes in between follow depth. Desktop untouched. */
  var PHONE_MAX_W = 767;
  var PHONE_FRAME_BACK = 44;
  var PHONE_FRAME_FRONT = 56;
  var PHONE_EDGE = 8;
  var PHONE_RING_INSET = 32;
  var PHONE_CAPTION = 22; /* 6px gap + 12px name at line-height 1.2, rounded up */
  /* Unfriend / Check in chip under each falling circle: 2px gap + two 10px/1.2 pills
     (~38px), plus an 8px clearance gap. SeedOps 430 FAIL on 06f5bd8. */
  var PHONE_CHIP = 48;
  var PHONE_BELOW_GAP = 16; /* Designer: circles + chip start 16px below the orbit's lowest reach */
  function orbitPoint(angleDeg, g) {
    var t = angleDeg * Math.PI / 180;
    var x = Math.cos(t) * g.r;
    var y = Math.sin(t) * g.r;
    var d = g.persp / (g.persp - y * Math.sin(g.tilt));
    return { x: x * d, y: y * Math.cos(g.tilt) * d, d: d };
  }
  /* engineer/pulse-phone-halo-separation (Designer LOOK; HH: keep the ripple):
     adjacent frames overlapped as they passed each other on phones (about 22px at
     390, 27 at 358). Phones keep the desktop ripple (frame i bobs on
     sin(t/360 + bobPhase*i)); when g.spots (the ring's spot angles, in order) is
     given, phoneOrbit returns the largest bob amplitude (<= g.bob) at which every
     adjacent pair keeps (size_a + size_b) / 2 + PHONE_FRAME_GAP between centres at
     every rotation step and every bob phase. Full-size frames (sizeK 1) are kept
     whenever any bob >= 0 holds the gap at full size (430 today). Otherwise frames
     shrink by up to PHONE_MIN_SIZE_K (12%), since smaller frames leave more room to
     bob; past that the bob is 0 and frames shrink just enough to hold the gap. */
  var PHONE_FRAME_GAP = 4;
  var PHONE_GAP_CUSHION = 0.5; /* rotation is sampled: a hair extra between samples */
  /* engineer/pulse-halo-live-width: rotation is sampled every 0.001 of a spot step
     (was 0.004), so the gap holds >= 4.5px between samples too (360 dipped to 4.497). */
  var PHONE_MIN_SIZE_K = 0.88;
  var sepCache = {};
  function fitScale(g, dFront, k) {
    function sizeAt(d) {
      var t = (d - 1) / ((dFront - 1) || 1);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      return k * (PHONE_FRAME_BACK + (PHONE_FRAME_FRONT - PHONE_FRAME_BACK) * t);
    }
    return sizeAt;
  }
  function orbitF(panelW, g, sizeAt) {
    var ringW = Math.max(0, panelW - PHONE_RING_INSET);
    var maxX = 0;
    var a, p;
    for (a = 0; a < 360; a += 0.25) { p = orbitPoint(a, g); maxX = Math.max(maxX, Math.abs(p.x)); }
    var f = maxX ? (ringW / 2) / maxX : 1;
    for (a = 0; a < 360; a += 0.25) {
      p = orbitPoint(a, g);
      if (Math.abs(p.x) < 1e-6) continue;
      var lim = (panelW / 2 - PHONE_EDGE - sizeAt(p.d) / 2) / Math.abs(p.x);
      if (lim < f) f = lim;
    }
    return f * 0.99; /* sampled every 0.25deg: keep a hair of margin between samples */
  }
  /* Spot i at rotation phase s, the same path tower.js circleSpotAt walks. */
  function spotAngle(spots, phase) {
    var n = spots.length;
    var w = ((phase % n) + n) % n;
    var i = Math.floor(w);
    var mix = w - i;
    var from = spots[i];
    var to = spots[(i + 1) % n];
    if (to > from) to -= 360;
    return from + (to - from) * mix;
  }
  /* Largest bob amplitude (capped at maxBob) that keeps every adjacent pair the
     gap apart at frame scale k, over every rotation step and bob phase. Frames i and
     j bob by A*sin(T + p*i) and A*sin(T + p*j): their vertical offset sweeps the
     whole range [-A*M, A*M], M = 2|sin(p*(i - j)/2)|, so the closest pass is
     hypot(dx, max(0, |dy| - A*M)). Negative: overlaps even with no bob. */
  function bobRoom(panelW, g, dFront, k, maxBob, phaseStep) {
    var spots = g.spots;
    var n = spots.length;
    var sizeAt = fitScale(g, dFront, k);
    var f = orbitF(panelW, g, sizeAt);
    var best = maxBob;
    for (var s = 0; s < n; s += 0.001) {
      var P = [];
      for (var i = 0; i < n; i++) { var q = orbitPoint(spotAngle(spots, i + s), g); P.push({ x: q.x * f, y: q.y * f, size: sizeAt(q.d) }); }
      for (i = 0; i < n; i++) {
        var j = (i + 1) % n;
        var a = P[i], b = P[j];
        var need = (a.size + b.size) / 2 + PHONE_FRAME_GAP + PHONE_GAP_CUSHION;
        var dx = Math.abs(a.x - b.x);
        if (dx >= need) continue;
        var dy = Math.abs(a.y - b.y) - Math.sqrt(need * need - dx * dx);
        var M = 2 * Math.abs(Math.sin(phaseStep * (i - j) / 2));
        var room = M > 1e-9 ? dy / M : (dy >= 0 ? Infinity : -Infinity);
        if (room < best) best = room;
      }
    }
    return best;
  }
  /* engineer/pulse-halo-live-width: the #313 tap pads (an invisible round pad of
     max(frame, D) across on each filled frame, 360 to 429) must never overlap a
     neighbour's pad. Smallest pad-to-pad clearance at frame scale k and bob
     amplitude A, over every rotation step and bob phase (same sweep as bobRoom). */
  function padRoom(panelW, g, dFront, k, A, phaseStep, D) {
    var spots = g.spots;
    var n = spots.length;
    var sizeAt = fitScale(g, dFront, k);
    var f = orbitF(panelW, g, sizeAt);
    var worst = Infinity;
    for (var s = 0; s < n; s += 0.001) {
      var P = [];
      for (var i = 0; i < n; i++) { var q = orbitPoint(spotAngle(spots, i + s), g); P.push({ x: q.x * f, y: q.y * f, pad: Math.max(sizeAt(q.d), D) }); }
      for (i = 0; i < n; i++) {
        var j = (i + 1) % n;
        var a = P[i], b = P[j];
        var M = 2 * Math.abs(Math.sin(phaseStep * (i - j) / 2));
        var dy = Math.max(0, Math.abs(a.y - b.y) - A * M);
        var room = Math.sqrt((a.x - b.x) * (a.x - b.x) + dy * dy) - (a.pad + b.pad) / 2;
        if (room < worst) worst = room;
      }
    }
    return worst;
  }
  /* Largest pad diameter <= PHONE_TAP_PAD (44px) whose pads keep >= 0 apart at the
     worst phase (floored to 0.1px). Never below the back frame: the pad is
     max(frame, D), so a smaller D would change nothing. */
  var PHONE_TAP_PAD = 44;
  var padCache = {};
  function tapPadFit(panelW, g, dFront, k, A) {
    var phaseStep = typeof g.bobPhase === "number" ? g.bobPhase : 0;
    var key = [panelW, g.r, g.tilt, g.persp, k, A, phaseStep, g.spots.join(",")].join("|");
    if (Object.prototype.hasOwnProperty.call(padCache, key)) return padCache[key];
    var lo = k * PHONE_FRAME_BACK;
    var out;
    if (padRoom(panelW, g, dFront, k, A, phaseStep, PHONE_TAP_PAD) >= 0) {
      out = PHONE_TAP_PAD;
    } else {
      var hi = PHONE_TAP_PAD;
      for (var it = 0; it < 18; it++) {
        var mid = (lo + hi) / 2;
        if (padRoom(panelW, g, dFront, k, A, phaseStep, mid) >= 0) lo = mid; else hi = mid;
      }
      out = Math.floor(lo * 10) / 10;
    }
    padCache[key] = out;
    return out;
  }
  function separationFit(panelW, g, dFront) {
    var maxBob = g.bob || 0;
    var phaseStep = typeof g.bobPhase === "number" ? g.bobPhase : 0;
    var key = [panelW, g.r, g.tilt, g.persp, maxBob, phaseStep, g.spots.join(",")].join("|");
    if (Object.prototype.hasOwnProperty.call(sepCache, key)) return sepCache[key];
    function room(k) { return bobRoom(panelW, g, dFront, k, maxBob, phaseStep); }
    function bisect(lo, hi, holds) {
      for (var it = 0; it < 18; it++) { var mid = (lo + hi) / 2; if (holds(mid)) lo = mid; else hi = mid; }
      return lo;
    }
    var out;
    var atOne = room(1);
    if (atOne >= maxBob) {
      out = { k: 1, bob: maxBob };
    } else if (atOne >= 0) {
      /* PM: if frames hold the gap at full size with some bob (430 today), keep
         them full size and use the largest bob that holds; never shrink to bob more */
      out = { k: 1, bob: Math.floor(atOne * 10) / 10 };
    } else {
      var atMin = room(PHONE_MIN_SIZE_K);
      if (atMin >= maxBob) {
        /* the full bob fits somewhere in [0.88, 1]: keep the frames as large as possible */
        out = { k: bisect(PHONE_MIN_SIZE_K, 1, function (k) { return room(k) >= maxBob; }), bob: maxBob };
      } else if (atMin >= 0) {
        /* shrink the full 12%, then the largest bob that keeps the gap */
        out = { k: PHONE_MIN_SIZE_K, bob: Math.floor(atMin * 10) / 10 };
      } else {
        /* overlaps even standing still at 0.88: no bob, shrink further until it holds */
        out = { k: bisect(0, PHONE_MIN_SIZE_K, function (k) { return room(k) >= 0; }), bob: 0 };
      }
    }
    sepCache[key] = out;
    return out;
  }
  function phoneOrbit(panelW, g) {
    if (!(panelW > 0) || !g) return null;
    var dFront = orbitPoint(90, g).d;
    var sep = Array.isArray(g.spots) && g.spots.length > 1 ? separationFit(panelW, g, dFront) : { k: 1, bob: g.bob || 0 };
    var sizeK = sep.k;
    var sizeAt = fitScale(g, dFront, sizeK);
    var ringW = Math.max(0, panelW - PHONE_RING_INSET);
    var f = orbitF(panelW, g, sizeAt);
    var top = 0;
    var bottom = 0;
    var a, p;
    for (a = 0; a < 360; a += 0.25) {
      p = orbitPoint(a, g);
      var half = sizeAt(p.d) / 2;
      top = Math.min(top, p.y * f - half);
      bottom = Math.max(bottom, p.y * f + half + PHONE_CAPTION);
    }
    var bob = sep.bob;
    var lift = g.lift || 0;
    var tapPad = Array.isArray(g.spots) && g.spots.length > 1 ? tapPadFit(panelW, g, dFront, sizeK, bob) : PHONE_TAP_PAD;
    return {
      f: f,
      ringW: ringW,
      sizeK: sizeK,
      bob: bob, /* phone bob amplitude (px) to use for every frame */
      tapPad: tapPad, /* #313 tap pad diameter (px, <= 44) that never overlaps a neighbour's */
      sizeAt: sizeAt,
      point: function (angleDeg) { var q = orbitPoint(angleDeg, g); return { x: q.x * f, y: q.y * f, d: q.d, size: sizeAt(q.d) }; },
      /* vertical reach of any frame + caption around the ring centre, motion included */
      top: top - bob - lift,
      bottom: bottom + bob
    };
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
      bottom = Math.max(bottom, L.slots[i].y + L.size + (phoneBand(layer) ? PHONE_CHIP : 0));
    }
    var lift = band.top - (h - (bottom - band.top)) / 2;
    if (!(lift > 1)) return 0;
    layer.style.setProperty("--pulse-ring-y", (h * 0.48 - lift).toFixed(1) + "px");
    return lift;
  }

  function phoneBand(layer) {
    return !!(layer && layer.getAttribute && /^-?[\d.]+,-?[\d.]+$/.test(String(layer.getAttribute("data-pulse-orbit") || "")));
  }

  /* Phones (data-pulse-orbit is only set below 768px): every falling circle and its
     Unfriend / Check in chip sit BELOW the ring, the top row starting 16px under the
     lowest reach of the front frame + name (bob included), as on 1280 / the spec. */
  function phoneBelowRing(layer, L) {
    if (!phoneBand(layer) || !L || !L.slots.length) return L;
    var band = blockedBand(layer);
    if (!band) return L;
    var floor = band.bottom + PHONE_BELOW_GAP;
    var minY = Infinity;
    for (var i = 0; i < L.slots.length; i++) minY = Math.min(minY, L.slots[i].y);
    var d = floor - minY;
    if (d > 0) for (var j = 0; j < L.slots.length; j++) L.slots[j].y = Math.round(L.slots[j].y + d);
    return L;
  }

  /* Vertical band (layer px) covered by the ring image and the five frames + captions.
     Read from layout values (offset sizes + the pinned transform), so the ring's
     build animation (scale 0.82 -> 1) never skews the measurement. */
  function blockedBand(layer) {
    if (!layer) return null;
    var H = layer.clientHeight || 0;
    var cy = ringY(layer, H);
    var k = 0;
    try { k = num(root.getComputedStyle(layer).getPropertyValue("--pulse-bg-k")); } catch (e) {}
    if (!k) k = 0.954;
    var top = cy - 230 * k;
    var bottom = cy + 230 * k;
    /* phones: the orbiting frames' full reach (set by js/tower.js), so falling
       circles and their Unfriend / Check in chip never sit where a frame passes */
    var orbit = layer.getAttribute ? String(layer.getAttribute("data-pulse-orbit") || "") : "";
    var om = /^(-?[\d.]+),(-?[\d.]+)$/.exec(orbit);
    if (om) {
      /* the chip hangs below its circle, so anything placed above the band needs
         the chip's height (+8px gap) of extra room above the frames' reach */
      top = Math.min(top, cy + num(om[1]) - PHONE_CHIP);
      bottom = Math.max(bottom, cy + num(om[2]));
    }
    var spots = layer.querySelectorAll ? layer.querySelectorAll("[data-circle-ring] [data-circle-spot]") : [];
    for (var i = 0; i < spots.length; i++) {
      var sp = spots[i];
      var m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(sp.style.transform || "");
      if (!m) continue;
      var s = num(m[3]) || 1;
      var half = (sp.offsetHeight || 0) * s / 2;
      var y = cy + num(m[2]);
      var cap = sp.querySelector ? sp.querySelector("[data-circle-caption]") : null;
      /* names sit below the photo (offsetTop includes the gap), scaled with the frame */
      var capBottom = cap ? ((cap.offsetTop || sp.offsetHeight || 0) + (cap.offsetHeight || 0)) * s : 0;
      top = Math.min(top, y - half);
      bottom = Math.max(bottom, y + half, y - half + capBottom);
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

  function layoutBottom(count, width, height) {
    count = Math.max(0, Math.min(PULSE_FALL_CAP, count | 0));
    width = Math.max(200, width || 390);
    height = Math.max(160, height || 700);
    var size = width <= 600 ? 28 : 36, pitch = 86, label = 26;
    var cols = Math.max(1, Math.floor((width - 12) / pitch));
    var rows = Math.ceil(count / cols);
    var y0 = Math.max(8, height - 8 - rows * (size + label));
    var slots = [], i, r, c, n, x0;
    for (i = 0; i < count; i++) {
      r = Math.floor(i / cols); c = i % cols;
      n = Math.min(cols, count - r * cols);
      x0 = (width - ((n - 1) * pitch + size)) / 2;
      slots.push({ x: Math.round(x0 + c * pitch), y: Math.round(y0 + r * (size + label)) });
    }
    return { size: size, slots: slots };
  }

  function removeLink(friend, el, box) {
    var client = root && root.CognationSupabase;
    var id = viewerId();
    var gone = function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      if (box.parentNode) box.parentNode.removeChild(box);
    };
    if (!client || !id || typeof client.rpc !== "function") return;
    var call = friend.profileId
      ? client.rpc("toggle_profile_follow", { target_profile_id: friend.profileId })
      : client.rpc("unfriend_user", { other_user_id: friend.userId });
    Promise.resolve(call).then(gone, function () {});
  }

  function fallActions(friend, el, opts) {
    var box = document.createElement("span");
    box.className = "pulse-fall-actions";
    box.style.left = (parseFloat(el.style.left) + parseFloat(el.style.width) / 2) + "px";
    box.style.top = (parseFloat(el.style.top) + parseFloat(el.style.height) + 2) + "px";
    [["Unfriend", function () { removeLink(friend, el, box); }], ["Check in", function () {
      if (typeof opts.open === "function") opts.open(friend.handle, friend);
    }]].forEach(function (pair) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "pulse-fall-act";
      b.textContent = pair[0];
      b.addEventListener("click", function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        if (ev && ev.stopPropagation) ev.stopPropagation();
        pair[1]();
      });
      box.appendChild(b);
    });
    return box;
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
    if (!opts.height && root && root.innerHeight && layer.getBoundingClientRect) {
      var seen = root.innerHeight - layer.getBoundingClientRect().top;
      if (seen > 160 && seen < h) h = seen;
    }
    if (opts.center) centerGroup(layer, friends.length, w, h, opts);
    var L = phoneBelowRing(layer, layoutBottom(friends.length, w, h));
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
      /* From the top of the page down to the bottom dock. */
      el.style.setProperty("--pulse-fall-from", "-100vh");
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
      inner.appendChild(fallActions(friend, el, opts));
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
  var shown = "personal";

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

  function applyPack(layer, pack, opts) {
    paintHalo(pack.halo, opts);
    placeFalling(layer, pack.fall, opts);
    if (last) last.fall = pack.fall;
  }

  function sideToggle(layer) {
    if (!layer || !layer.querySelector || layer.querySelector("[data-pulse-side-toggle]")) return;
    var bar = document.createElement("div");
    bar.className = "pulse-side-toggle";
    bar.setAttribute("data-pulse-side-toggle", "");
    ["personal", "professional"].forEach(function (name) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-pulse-side", name);
      b.setAttribute("aria-pressed", name === shown ? "true" : "false");
      b.textContent = name === "personal" ? "Personal" : "Professional";
      b.addEventListener("click", function () {
        shown = name;
        var packs = last && last.packs;
        if (packs && last.layer) applyPack(last.layer, packs[name], last.opts);
        var all = bar.querySelectorAll ? bar.querySelectorAll("button") : [];
        for (var i = 0; i < all.length; i++) all[i].setAttribute("aria-pressed", all[i].getAttribute("data-pulse-side") === shown ? "true" : "false");
      });
      bar.appendChild(b);
    });
    layer.appendChild(bar);
  }

  function mount(layer, opts) {
    opts = opts || {};
    sideToggle(layer);
    render(layer, [], opts); /* quiet empty until the server answers */
    return loadRanked(opts.client, opts.viewerId).then(function (r) {
      if (!layer.parentNode && !opts.detached) return r;
      var packs = {
        personal: { halo: r.halo, fall: r.fall },
        professional: r.professional || { halo: [], fall: [] }
      };
      last = { layer: layer, fall: (packs[shown] || packs.personal).fall, opts: opts, packs: packs };
      applyPack(layer, packs[shown] || packs.personal, opts);
      if (r.gaps && r.gaps.length && layer.setAttribute) layer.setAttribute("data-pulse-engagement-gaps", r.gaps.join(" "));
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
    phoneOrbit: phoneOrbit,
    phoneBelowRing: phoneBelowRing,
    PHONE_CHIP: PHONE_CHIP,
    PHONE_MAX_W: PHONE_MAX_W,
    PHONE_FRAME_GAP: PHONE_FRAME_GAP,
    PHONE_MIN_SIZE_K: PHONE_MIN_SIZE_K,
    PHONE_TAP_PAD: PHONE_TAP_PAD,
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
