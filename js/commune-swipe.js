/**
 * COMMUNE — paced public swipe deck.
 * One card is one item. Types are interleaved so none runs in a row.
 * Dating is local, opt-in, and at least five other cards apart.
 * Professional ads open that profile. People-you-may-know sends a friend request.
 * No seeded people, businesses, or events.
 */
(function () {
  "use strict";

  var DISMISSED_KEY = "cognation.commune.swipe.dismissed.v1";
  var LIKES_KEY = "cognation.commune.swipe.likes.v1";
  var FOLLOWS_KEY = "cognation.commune.follows.v1";
  var SEE_DATING_KEY = "cognation.commune.seeDating.v1";
  var MEMBER_PROFILE_KEY = "cognation.member.profile.v1";
  var RATINGS_KEY = "cognation.commune.dating.ratings.v1";
  var DATING_RIGHT_KEY = "cognation.commune.dating.rights.v1";
  var INBOUND_KEY = "cognation.commune.dating.inbound.v1";
  var NOTICES_KEY = "cognation.commune.notices.v1";
  var SHARES_KEY = "cognation.commune.friend-shares.v1";
  var ROOMS_KEY = "cognation.commune.site-rooms.v1";
  var ROOM_CHAT_KEY = "cognation.commune.room-chat.v1";
  var REQUESTS_KEY = "cognation.friend.requests.v1";
  var FRIEND_CAP = 6000;

  var TYPE = {
    AD: "ad",
    CHAT: "chatroom",
    FACT: "fact",
    WELLNESS: "wellness",
    FRIEND: "friend",
    EVENT: "event",
    KNOW: "know",
    DATING: "dating",
  };

  var LANE_ORDER = [TYPE.AD, TYPE.CHAT, TYPE.FACT, TYPE.WELLNESS, TYPE.FRIEND, TYPE.EVENT, TYPE.KNOW];
  var REPEATABLE = {};
  REPEATABLE[TYPE.CHAT] = true;
  REPEATABLE[TYPE.FACT] = true;
  REPEATABLE[TYPE.WELLNESS] = true;

  var SITE_ROOMS = [
    {
      id: "room-site-wellness",
      title: "Wellness check-in",
      body: "A quiet room the site hosts for rest, movement, and how the week feels.",
      topic: "wellness",
      minAge: 0,
    },
    {
      id: "room-site-local",
      title: "Local happenings",
      body: "Public notes on classes, markets, and what is open nearby.",
      topic: "local happenings",
      minAge: 0,
    },
    {
      id: "room-site-board",
      title: "Neighborhood board",
      body: "A shared board for local questions and community listings.",
      topic: "local happenings",
      minAge: 0,
    },
  ];

  var FACTS = [
    { id: "fact-hearts", title: "A public fact", body: "Octopuses have three hearts. Two pump blood through the gills, and one pumps it through the rest of the body. Source: Smithsonian Ocean." },
    { id: "fact-honey", title: "A public fact", body: "Sealed honey can last indefinitely. Edible honey has been recovered from ancient Egyptian tombs. Source: Smithsonian Magazine." },
    { id: "fact-trees", title: "A public fact", body: "A 2015 Nature estimate put Earth’s trees near three trillion. Source: Crowther et al., Nature." },
    { id: "fact-banana", title: "A public fact", body: "Botanically, bananas are berries. Strawberries are aggregate accessory fruits. Source: university extension explainers." },
    { id: "fact-war", title: "A public fact", body: "The Anglo-Zanzibar War of 1896 lasted about 38 minutes. Source: Britannica." },
  ];

  var WELLNESS = [
    { id: "well-walk", title: "A wellness note", body: "A short walk can lift mood. Public-health guidance treats even brief movement as useful on an ordinary day. Source: CDC physical activity basics." },
    { id: "well-breath", title: "A wellness note", body: "Slow breathing, around six breaths a minute, is a common calm-down practice in stress-management classes." },
    { id: "well-sleep", title: "A wellness note", body: "Sleep and mood travel together. Adults are generally advised to aim for seven or more hours. Source: CDC." },
    { id: "well-name", title: "A wellness note", body: "Naming a feeling can make the next small step easier to choose. That is a basic idea in psychoeducation." },
    { id: "well-light", title: "A wellness note", body: "Morning daylight helps set the body clock. Many wellness classes start with a few minutes outside." },
  ];

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
  function asIds(v) {
    return Array.isArray(v) ? v.filter(Boolean).map(String) : [];
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function emit(name, detail) {
    try {
      document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (e) {}
  }
  function clone(card) {
    var copy = {};
    if (!card) return copy;
    Object.keys(card).forEach(function (key) {
      copy[key] = card[key];
    });
    return copy;
  }
  function norm(value) {
    return String(value || "").trim().toLowerCase();
  }
  function terms(value) {
    if (Array.isArray(value)) {
      return value.map(norm).filter(function (t) { return t.length > 2; });
    }
    return norm(value).split(/[^a-z0-9+]+/).filter(function (t) { return t.length > 2; });
  }
  function overlap(a, b) {
    var set = {};
    (a || []).forEach(function (t) { if (t) set[norm(t)] = true; });
    return (b || []).some(function (t) { return set[norm(t)]; });
  }

  function ratingSentence(avg) {
    var n = Math.round(Number(avg) * 10) / 10;
    if (!isFinite(n)) return "";
    var whole = Math.abs(n - Math.round(n)) < 0.001;
    var shown = whole ? String(Math.round(n)) : n.toFixed(1);
    var head = Math.floor(Math.abs(n) + 0.001);
    var article = head === 8 || head === 11 || head === 18 || (head >= 80 && head <= 89) ? "an" : "a";
    return "You've been rated " + article + " " + shown;
  }

  function paceDeck(lanes, dating, count) {
    var cursors = {};
    var out = [];
    var rot = 0;
    var last = "";
    var sinceDating = 99;
    var datingAt = 0;
    var guard = 0;
    var target = count || 24;
    dating = dating || [];
    function take(type) {
      var list = (lanes && lanes[type]) || [];
      if (!list.length) return null;
      var i = cursors[type] || 0;
      if (!REPEATABLE[type] && i >= list.length) return null;
      var src = list[i % list.length];
      cursors[type] = i + 1;
      var card = clone(src);
      card.type = type;
      if (i >= list.length) card.id = String(src.id || type) + "-r" + i;
      return card;
    }
    while (out.length < target && guard < target * 8) {
      guard += 1;
      if (out.length >= 5 && sinceDating >= 5 && datingAt < dating.length && last !== TYPE.DATING) {
        var dated = clone(dating[datingAt]);
        dated.type = TYPE.DATING;
        datingAt += 1;
        out.push(dated);
        last = TYPE.DATING;
        sinceDating = 0;
        continue;
      }
      var placed = false;
      var n;
      for (n = 0; n < LANE_ORDER.length; n++) {
        var type = LANE_ORDER[(rot + n) % LANE_ORDER.length];
        if (type === last) continue;
        var card = take(type);
        if (!card) continue;
        out.push(card);
        last = type;
        sinceDating += 1;
        rot = (LANE_ORDER.indexOf(type) + 1) % LANE_ORDER.length;
        placed = true;
        break;
      }
      if (!placed) break;
    }
    return out;
  }

  function getDismissed() { return asIds(readJson(sessionStorage, DISMISSED_KEY, [])); }
  function setDismissed(ids) { writeJson(sessionStorage, DISMISSED_KEY, asIds(ids)); }
  function getLikes() { return asIds(readJson(localStorage, LIKES_KEY, [])); }
  function setLikes(ids) { writeJson(localStorage, LIKES_KEY, asIds(ids)); }
  function getFollows() { return asIds(readJson(localStorage, FOLLOWS_KEY, [])); }
  function setFollows(ids) {
    writeJson(localStorage, FOLLOWS_KEY, asIds(ids));
    emit("cognation:commune-follows-changed", { profileIds: getFollows() });
  }
  function isFollowing(id) { return getFollows().indexOf(String(id || "")) >= 0; }
  function toggleFollow(id) {
    id = String(id || "");
    if (!id) return false;
    var ids = getFollows();
    var i = ids.indexOf(id);
    if (i >= 0) ids.splice(i, 1);
    else ids.push(id);
    setFollows(ids);
    return ids.indexOf(id) >= 0;
  }

  function currentSession() {
    var session = readJson(localStorage, "cognation.session.v2", null);
    return session && typeof session === "object" ? session : null;
  }
  function currentProfileId() {
    var session = currentSession();
    if (session && session.activeProfileId) return String(session.activeProfileId);
    if (session && session.username) return String(session.username);
    return "you";
  }
  function viewerIds() {
    var ids = [currentProfileId(), "you"];
    var session = currentSession();
    if (session && session.username) ids.push(String(session.username));
    if (session && session.activeProfileId) ids.push(String(session.activeProfileId));
    return ids;
  }
  function getMemberProfile() {
    var p = readJson(localStorage, MEMBER_PROFILE_KEY, null);
    if (!p || typeof p !== "object") p = {};
    try {
      if (!p.country) {
        var c = localStorage.getItem("cognation.member.country.v1");
        if (c) p.country = c;
      }
    } catch (e) {}
    return p;
  }
  function setMemberProfile(fields) {
    var next = {};
    var prev = getMemberProfile();
    Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
    Object.keys(fields || {}).forEach(function (k) { next[k] = fields[k]; });
    writeJson(localStorage, MEMBER_PROFILE_KEY, next);
    if (next.country) {
      try { localStorage.setItem("cognation.member.country.v1", String(next.country)); } catch (e) {}
      if (window.CognationMemberCountry && window.CognationMemberCountry.set) {
        try { window.CognationMemberCountry.set(next.country); } catch (e2) {}
      }
    }
    emit("cognation:member-profile-updated", next);
    return next;
  }
  function getMemberAge() {
    var n = parseInt(getMemberProfile().age, 10);
    return !isNaN(n) && n > 0 ? n : null;
  }
  function getSeeDating() {
    try { return localStorage.getItem(SEE_DATING_KEY) === "1"; } catch (e) { return false; }
  }
  function setSeeDating(on) {
    try { localStorage.setItem(SEE_DATING_KEY, on ? "1" : "0"); } catch (e) {}
  }
  function datingAllowed() {
    var age = getMemberAge();
    return !!(getSeeDating() && age != null && age > 18);
  }

  function eachProfile(fn) {
    var doc = readJson(localStorage, "cognation.profiles.v1", null);
    var profiles = doc && doc.profiles ? doc.profiles : {};
    Object.keys(profiles).forEach(function (id) { fn(profiles[id], id); });
  }
  function profileById(id) {
    var accounts = window.CognationAccounts;
    if (accounts && typeof accounts.getProfileById === "function") {
      try { return accounts.getProfileById(id); } catch (e) {}
    }
    var found = null;
    eachProfile(function (rec, pid) {
      if (pid === id || (rec && rec.id === id)) found = rec;
    });
    return found;
  }
  function viewerPersonal() {
    var accounts = window.CognationAccounts;
    var session = currentSession();
    if (accounts && session && session.username && typeof accounts.getProfilesForUsername === "function") {
      var list = accounts.getProfilesForUsername(session.username) || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].kind !== "professional") return list[i];
      }
    }
    if (session && session.activeProfileId) {
      var active = profileById(session.activeProfileId);
      if (active && active.kind !== "professional") return active;
    }
    return null;
  }
  function viewerInterests() {
    var parts = [];
    var member = getMemberProfile();
    parts = parts.concat(terms(member.interests), terms(member.bio));
    var personal = viewerPersonal();
    if (personal) parts = parts.concat(terms(personal.interests), terms(personal.bio));
    var unique = [];
    parts.forEach(function (t) { if (unique.indexOf(t) < 0) unique.push(t); });
    return unique;
  }
  function friendIds() {
    var personal = viewerPersonal();
    return personal && Array.isArray(personal.friendIds) ? personal.friendIds.map(String) : [];
  }

  function youtubeId(url) {
    var m = String(url || "").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : "";
  }
  function videoHtml(url) {
    url = String(url || "").trim();
    if (!url) return "";
    var yt = youtubeId(url);
    if (yt) {
      return '<div class="commune-ad-video" aria-hidden="true"><iframe src="https://www.youtube.com/embed/' +
        escapeHtml(yt) + '" title="Marketing video" tabindex="-1"></iframe></div>';
    }
    return '<video class="commune-ad-video" src="' + escapeHtml(url) + '" muted playsinline preload="metadata" tabindex="-1"></video>';
  }

  function placedAds() {
    var out = [];
    eachProfile(function (rec) {
      if (!rec || rec.kind !== "professional" || !rec.handle) return;
      var lists = [];
      ["marketingAds", "advertisements", "ads"].forEach(function (key) {
        if (Array.isArray(rec[key])) lists = lists.concat(rec[key]);
      });
      if (rec.marketingAd && typeof rec.marketingAd === "object") lists.push(rec.marketingAd);
      (Array.isArray(rec.featuredPosts) ? rec.featuredPosts : []).forEach(function (post) {
        if (!post) return;
        if (post.kind === "ad" || post.kind === "advertisement" || post.advertisement === true || post.marketingVideo || post.videoUrl) {
          lists.push(post);
        }
      });
      lists.forEach(function (ad, idx) {
        if (!ad) return;
        var title = String(ad.title || ad.line || ad.headline || "").trim();
        var body = String(ad.body || ad.text || "").trim();
        var videoUrl = String(ad.videoUrl || ad.marketingVideo || ad.video || "").trim();
        if (!title && !body && !videoUrl) return;
        out.push({
          id: "ad-" + rec.id + "-" + (ad.id || idx),
          type: TYPE.AD,
          profileId: rec.id,
          handle: String(rec.handle || "").replace(/^@/, ""),
          fromName: rec.displayName || rec.handle,
          title: title || (rec.displayName || "Professional page"),
          body: body,
          videoUrl: videoUrl,
          interests: terms(ad.interests || ad.tags || (title + " " + body)),
        });
      });
    });
    return out;
  }

  function publicEvents() {
    var out = [];
    var now = Date.now();
    eachProfile(function (rec) {
      if (!rec || rec.kind !== "professional") return;
      var lists = [];
      ["publicListings", "publicEvents", "listings"].forEach(function (key) {
        if (Array.isArray(rec[key])) lists = lists.concat(rec[key]);
      });
      (Array.isArray(rec.calendarEvents) ? rec.calendarEvents : []).forEach(function (ev) {
        if (!ev) return;
        if (ev.public === true || ev.visibility === "public" || ev.listing === true) lists.push(ev);
      });
      if (rec.goingLive && typeof rec.goingLive === "object") lists.push(rec.goingLive);
      lists.forEach(function (ev, idx) {
        if (!ev) return;
        var id = String(ev.id || "");
        if (id.indexOf("cal-demo") === 0) return;
        var title = String(ev.title || ev.what || "").trim();
        if (!title) return;
        var when = String(ev.when || ((ev.date || "") + (ev.time ? "T" + ev.time : ""))).trim();
        if (when && !isNaN(Date.parse(when)) && Date.parse(when) < now - 36e5) return;
        var where = String(ev.where || ev.notes || "").trim();
        out.push({
          id: "event-" + rec.id + "-" + (id || idx),
          type: TYPE.EVENT,
          profileId: rec.id,
          handle: String(rec.handle || "").replace(/^@/, ""),
          fromName: rec.displayName || rec.handle || "",
          title: title,
          body: [when, where].filter(Boolean).join(" · "),
          interests: terms(ev.interests || title + " " + where),
        });
      });
    });
    return out;
  }

  function isLocal(rec) {
    var viewer = getMemberProfile();
    var personal = viewerPersonal();
    var vCity = norm(viewer.city || viewer.locality || (personal && (personal.city || personal.locality)));
    var vState = norm(viewer.state || (personal && personal.state));
    var vCountry = norm(viewer.country || (personal && personal.country));
    var city = norm(rec.city || rec.locality);
    var state = norm(rec.state);
    var country = norm(rec.country);
    if (vCity && city) return city === vCity && (!vState || !state || state === vState);
    if (vState && state) return state === vState && (!vCountry || !country || country === vCountry);
    return false;
  }
  function datingOptIn(rec) {
    return !!(rec && (rec.datingContent === true || rec.datingEnabled === true || rec.showDatingContent === true));
  }
  function profilePhoto(rec) {
    var url = rec && (rec.avatarDataUrl || rec.photo || rec.avatarUrl);
    url = String(url || "");
    if (url.indexOf("data:image/") === 0 || /^https?:\/\//.test(url)) return url;
    return "";
  }
  function datingMinAge(rec) {
    var n = parseInt(rec && (rec.datingMinAge || rec.minAge), 10);
    if (!isNaN(n) && n >= 21) return 21;
    if (rec && (rec.audience === "21+" || rec.datingAudience === "21+")) return 21;
    return 18;
  }
  function viewerCanSeeDating(rec) {
    if (!datingAllowed() || !datingOptIn(rec) || !isLocal(rec)) return false;
    var photo = profilePhoto(rec);
    if (!photo) return false;
    var age = getMemberAge();
    if (datingMinAge(rec) >= 21 && !(age != null && age >= 21)) return false;
    var mine = viewerIds();
    if (mine.indexOf(String(rec.id)) >= 0) return false;
    return true;
  }
  function datingCardFrom(rec, extra) {
    extra = extra || {};
    return {
      id: extra.id || ("date-" + rec.id),
      type: TYPE.DATING,
      profileId: rec.id,
      name: rec.displayName || rec.handle || "Member",
      title: rec.displayName || rec.handle || "Member",
      photo: extra.photo || profilePhoto(rec),
      body: "Open to meeting someone local.",
      handle: rec.handle || "",
      dating: true,
      minAge: datingMinAge(rec),
    };
  }
  function datingPool() {
    if (!datingAllowed()) return [];
    var out = [];
    var seen = {};
    eachProfile(function (rec) {
      if (!viewerCanSeeDating(rec)) return;
      seen[rec.id] = true;
      out.push(datingCardFrom(rec));
    });
    var inbound = readJson(localStorage, INBOUND_KEY, {});
    var mine = currentProfileId();
    var cards = inbound && inbound[mine] ? inbound[mine] : [];
    (Array.isArray(cards) ? cards : []).forEach(function (card) {
      if (!card || !card.profileId || seen[card.profileId]) return;
      var rec = profileById(card.profileId);
      if (rec && !viewerCanSeeDating(rec)) return;
      if (!rec && !card.photo) return;
      seen[card.profileId] = true;
      out.push({
        id: "date-in-" + card.profileId,
        type: TYPE.DATING,
        profileId: card.profileId,
        name: card.name || "Member",
        title: card.name || "Member",
        photo: card.photo,
        body: "Open to meeting someone local.",
        dating: true,
        minAge: card.minAge || 18,
      });
    });
    return out;
  }

  function peopleYouMayKnow() {
    var me = viewerPersonal();
    if (!me || !Array.isArray(me.friendIds) || !me.friendIds.length) return [];
    var mine = {};
    me.friendIds.forEach(function (id) { mine[String(id)] = true; });
    mine[String(me.id)] = true;
    viewerIds().forEach(function (id) { mine[String(id)] = true; });
    var pending = readJson(localStorage, REQUESTS_KEY, { outgoing: [] });
    (pending.outgoing || []).forEach(function (req) {
      if (req && viewerIds().indexOf(String(req.fromId)) >= 0) mine[String(req.toId)] = true;
    });
    var seen = {};
    var out = [];
    me.friendIds.forEach(function (fid) {
      var friend = profileById(fid);
      var ids = friend && Array.isArray(friend.friendIds) ? friend.friendIds : [];
      ids.forEach(function (id) {
        id = String(id || "");
        if (!id || mine[id] || seen[id]) return;
        var rec = profileById(id);
        if (!rec || rec.kind === "professional" || !rec.displayName) return;
        seen[id] = true;
        out.push({
          id: "know-" + rec.id,
          type: TYPE.KNOW,
          profileId: rec.id,
          title: rec.displayName,
          body: "A personal profile you may know.",
          handle: rec.handle || "",
        });
      });
    });
    return out;
  }

  function friendShareCards() {
    var shares = readJson(localStorage, SHARES_KEY, []);
    if (!Array.isArray(shares)) return [];
    var friends = {};
    friendIds().forEach(function (id) { friends[String(id)] = true; });
    var interests = viewerInterests();
    var out = [];
    shares.forEach(function (share) {
      if (!share || !share.swiperId || !friends[String(share.swiperId)]) return;
      if (viewerIds().indexOf(String(share.swiperId)) >= 0) return;
      var tags = terms(share.interests);
      if (!tags.length || !overlap(interests, tags)) return;
      out.push({
        id: "friend-" + (share.id || share.adId || share.title),
        type: TYPE.FRIEND,
        title: share.title || "A friend kept this",
        body: share.body || "",
        videoUrl: share.videoUrl || "",
        fromName: share.fromName || "A friend",
        handle: share.handle || "",
        profileId: share.profileId || "",
        interests: tags,
      });
    });
    return out;
  }

  function ensureSiteRooms() {
    writeJson(localStorage, ROOMS_KEY, { host: "Cognation", rooms: SITE_ROOMS });
    return SITE_ROOMS.map(function (room) {
      return {
        id: room.id,
        type: TYPE.CHAT,
        title: room.title,
        body: room.body,
        topic: room.topic,
        minAge: room.minAge || 0,
      };
    });
  }

  function buildLanes() {
    var lanes = {};
    lanes[TYPE.AD] = placedAds();
    lanes[TYPE.CHAT] = ensureSiteRooms();
    lanes[TYPE.FACT] = FACTS.map(function (f) { return { id: f.id, type: TYPE.FACT, title: f.title, body: f.body }; });
    lanes[TYPE.WELLNESS] = WELLNESS.map(function (f) { return { id: f.id, type: TYPE.WELLNESS, title: f.title, body: f.body }; });
    lanes[TYPE.FRIEND] = friendShareCards();
    lanes[TYPE.EVENT] = publicEvents();
    lanes[TYPE.KNOW] = peopleYouMayKnow();
    var dismissed = {};
    getDismissed().forEach(function (id) { dismissed[id] = true; });
    Object.keys(lanes).forEach(function (type) {
      lanes[type] = lanes[type].filter(function (card) { return card && card.id && !dismissed[card.id]; });
    });
    var dating = datingPool().filter(function (card) { return card && !dismissed[card.id]; });
    return { lanes: lanes, dating: dating };
  }

  function sampleDeck(count) {
    var built = buildLanes();
    return paceDeck(built.lanes, built.dating, count || 18);
  }

  var state = {
    shell: null,
    deck: null,
    statusEl: null,
    cards: [],
    index: 0,
    seen: 0,
    busy: false,
    pointer: null,
    roomId: "",
  };

  function typeLabel(t) {
    switch (t) {
      case TYPE.AD: return "Advertisement";
      case TYPE.CHAT: return "Chatroom";
      case TYPE.FACT: return "Fact";
      case TYPE.WELLNESS: return "Wellness";
      case TYPE.FRIEND: return "From a friend";
      case TYPE.EVENT: return "Public event";
      case TYPE.KNOW: return "People you may know";
      case TYPE.DATING: return "Dating";
      default: return "Commune";
    }
  }

  function syncDatingVisibility() {
    if (!state.shell) return;
    var allowed = datingAllowed();
    if (allowed) state.shell.setAttribute("data-dating-visible", "true");
    else state.shell.removeAttribute("data-dating-visible");
    var toggle = state.shell.querySelector("[data-commune-see-dating], [data-commune-dating-toggle]");
    if (toggle && toggle.type === "checkbox") {
      var age = getMemberAge();
      var blocked = age != null && age <= 18;
      toggle.disabled = blocked;
      if (blocked) {
        toggle.checked = false;
        setSeeDating(false);
        state.shell.removeAttribute("data-dating-visible");
      } else {
        toggle.checked = getSeeDating();
      }
      toggle.setAttribute("aria-checked", toggle.checked ? "true" : "false");
    }
    var hint = state.shell.querySelector(".commune-dating-toggle-hint, #commune-dating-toggle-hint");
    if (hint) {
      var age2 = getMemberAge();
      if (age2 != null && age2 <= 18) hint.textContent = "Dating cards stay off under 19.";
      else if (!getSeeDating()) hint.textContent = "Off until you turn it on. Dating cards stay hidden, and they only appear for someone local.";
      else hint.textContent = "Dating is on. A local card shows now and then, after other cards.";
    }
  }

  function setStatus(msg) {
    if (!state.statusEl && state.shell) {
      state.statusEl = state.shell.querySelector("[data-commune-swipe-status]");
      if (!state.statusEl) {
        state.statusEl = document.createElement("p");
        state.statusEl.className = "commune-swipe-status";
        state.statusEl.setAttribute("data-commune-swipe-status", "");
        state.statusEl.setAttribute("role", "status");
        state.shell.appendChild(state.statusEl);
      }
    }
    if (state.statusEl) {
      state.statusEl.hidden = !msg;
      state.statusEl.textContent = msg || "";
    }
  }

  function noticesFor(profileId) {
    var doc = readJson(localStorage, NOTICES_KEY, { byProfile: {} });
    var list = doc.byProfile && doc.byProfile[profileId];
    return Array.isArray(list) ? list : [];
  }
  function writeNotice(profileId, kind, body) {
    var doc = readJson(localStorage, NOTICES_KEY, { byProfile: {} });
    if (!doc.byProfile) doc.byProfile = {};
    var list = Array.isArray(doc.byProfile[profileId]) ? doc.byProfile[profileId] : [];
    var kept = list.filter(function (n) { return n && n.kind !== kind; });
    kept.unshift({ id: kind + "-" + profileId, kind: kind, body: body, at: Date.now() });
    doc.byProfile[profileId] = kept.slice(0, 8);
    writeJson(localStorage, NOTICES_KEY, doc);
  }
  function renderNotices() {
    if (!state.shell) return;
    var el = state.shell.querySelector("[data-commune-notices]");
    if (!el) return;
    var mine = noticesFor(currentProfileId());
    el.innerHTML = "";
    if (!mine.length) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    mine.forEach(function (notice) {
      var p = document.createElement("p");
      p.className = "commune-private-notice";
      p.setAttribute("data-notice-kind", notice.kind || "");
      p.textContent = notice.body || "";
      el.appendChild(p);
    });
  }

  function averageRating(profileId) {
    var doc = readJson(localStorage, RATINGS_KEY, { byProfile: {} });
    var list = (doc.byProfile && doc.byProfile[profileId]) || [];
    if (!list.length) return null;
    var sum = 0;
    list.forEach(function (r) { sum += Number(r.score) || 0; });
    return Math.round((sum / list.length) * 10) / 10;
  }
  function saveRating(profileId, raterId, score) {
    var doc = readJson(localStorage, RATINGS_KEY, { byProfile: {} });
    if (!doc.byProfile) doc.byProfile = {};
    var list = Array.isArray(doc.byProfile[profileId]) ? doc.byProfile[profileId] : [];
    list = list.filter(function (r) { return r && r.raterId !== raterId; });
    list.push({ raterId: raterId, score: score, at: Date.now() });
    doc.byProfile[profileId] = list;
    writeJson(localStorage, RATINGS_KEY, doc);
    var sum = 0;
    list.forEach(function (r) { sum += Number(r.score) || 0; });
    var avg = Math.round((sum / list.length) * 10) / 10;
    writeNotice(profileId, "rating-average", ratingSentence(avg));
    if (profileId === currentProfileId()) renderNotices();
    return avg;
  }

  function currentCard() { return state.cards[state.index] || null; }

  function syncActionLabels() {
    var card = currentCard();
    var pass = state.shell && state.shell.querySelector('[data-commune-swipe="left"]');
    var keep = state.shell && state.shell.querySelector('[data-commune-swipe="right"]');
    var dating = !!(card && card.type === TYPE.DATING);
    if (pass) pass.textContent = dating ? "Pass" : "Pass";
    if (keep) keep.textContent = dating ? "Share card" : "Keep";
    var active = state.deck && state.deck.querySelector("[data-commune-card].is-active");
    var rated = active && active.getAttribute("data-rating-selected") === "true";
    var needs = dating && !rated;
    if (state.shell) state.shell.classList.toggle("is-dating-needs-rating", needs);
    if (keep) {
      keep.disabled = needs;
      keep.setAttribute("aria-disabled", needs ? "true" : "false");
    }
    var idx = state.shell && state.shell.querySelector("[data-commune-index]");
    if (idx) idx.textContent = state.cards.length ? "Card " + (state.seen + 1) : "";
    var dots = state.shell && state.shell.querySelector("[data-commune-dots]");
    if (dots) dots.innerHTML = "";
  }

  function renderCard(card) {
    var el = document.createElement("article");
    el.className = "commune-card is-active";
    el.setAttribute("data-commune-card", "");
    el.setAttribute("data-card-type", card.type === TYPE.DATING ? "speed-dating" : card.type);
    el.setAttribute("data-card-id", card.id);
    if (card.type === TYPE.DATING) {
      el.setAttribute("data-dating-content", "true");
      el.setAttribute("data-dating-opt-in", "true");
    }
    if (card.type === TYPE.AD && card.handle) {
      el.setAttribute("data-professional-handle", card.handle);
    }
    el.setAttribute("tabindex", "0");
    var html = '<p class="commune-card-kicker">' + escapeHtml(typeLabel(card.type)) + "</p>";
    if (card.type === TYPE.DATING) {
      html += '<h4 class="commune-card-title" data-dating-name>' + escapeHtml(card.name || card.title) + "</h4>";
      html += '<figure class="commune-dating-photo"><img data-dating-photo src="' + escapeHtml(card.photo) + '" alt="Profile photo" width="320" height="320"></figure>';
      html += '<p class="commune-card-body">' + escapeHtml(card.body || "") + "</p>";
      html += '<div class="commune-dating-rate" data-dating-rate-wrap>' +
        '<label class="commune-dating-rate-label">Rate this photo</label>' +
        '<p class="form-hint">Move the scale if you want to. Left passes. Right shares your card.</p>' +
        '<div class="commune-dating-rate-row">' +
        '<input type="range" min="1" max="10" step="1" value="5" data-dating-rate aria-valuemin="1" aria-valuemax="10">' +
        '<output class="commune-dating-rate-output" data-dating-rate-output>5</output>' +
        "</div>" +
        '<p class="commune-dating-rate-status" data-dating-rate-status hidden role="status"></p>' +
        "</div>";
    } else {
      html += '<h4 class="commune-card-title">' + escapeHtml(card.title || "") + "</h4>";
      if (card.fromName) html += '<p class="commune-card-meta">' + escapeHtml(card.fromName) + "</p>";
      if (card.videoUrl) html += videoHtml(card.videoUrl);
      if (card.body) html += '<p class="commune-card-body">' + escapeHtml(card.body) + "</p>";
      if (card.type === TYPE.AD && card.handle) {
        html += '<button type="button" class="btn btn-secondary" data-commune-open-profile>Open their page</button>';
        html += '<p class="commune-card-meta">Book on the calendar, or follow this professional page.</p>';
      }
      if (card.type === TYPE.CHAT) {
        html += '<button type="button" class="btn btn-primary" data-commune-enter-sim>Enter room</button>';
      }
      if (card.type === TYPE.KNOW) html += '<span class="commune-card-badge commune-card-badge--ad">Ad</span>';
      if (card.type === TYPE.AD) html += '<span class="commune-card-badge commune-card-badge--ad">Ad</span>';
    }
    el.innerHTML = html;
    return el;
  }

  function bindCard(el, card) {
    var range = el.querySelector("input[data-dating-rate]");
    var out = el.querySelector("[data-dating-rate-output]");
    if (range) {
      var commit = function () {
        el.setAttribute("data-rating-selected", "true");
        var v = String(range.value);
        range.setAttribute("aria-valuenow", v);
        if (out) out.textContent = v;
        saveRating(card.profileId || card.id, currentProfileId(), parseInt(v, 10) || 1);
        var status = el.querySelector("[data-dating-rate-status]");
        if (status) {
          status.hidden = false;
          status.textContent = "You can swipe right.";
        }
        syncActionLabels();
      };
      range.addEventListener("input", commit);
      range.addEventListener("change", commit);
    }
    var sim = el.querySelector("[data-commune-enter-sim]");
    if (sim) sim.addEventListener("click", function (ev) { ev.stopPropagation(); openRoom(card.id, true); });
    var open = el.querySelector("[data-commune-open-profile]");
    if (open) open.addEventListener("click", function (ev) { ev.stopPropagation(); openProfessionalPage(card); });
    if (card.type === TYPE.AD && card.handle) {
      el.addEventListener("click", function (ev) {
        if (ev.target.closest("button, a, input, video, iframe")) return;
        openProfessionalPage(card);
      });
    }
  }

  function openProfessionalPage(card) {
    var handle = String(card.handle || "").replace(/^@/, "");
    if (!handle) return;
    try { location.hash = "tower-profile-" + handle; } catch (e) {}
    if (window.CognationTowerOpenProfile) {
      try { window.CognationTowerOpenProfile(handle); } catch (e2) {}
    }
  }

  function showRoom(on) {
    var room = state.shell && state.shell.querySelector("[data-commune-room]");
    var deck = state.deck;
    var actions = state.shell && state.shell.querySelector(".commune-swipe-actions");
    if (room) room.hidden = !on;
    if (deck) deck.hidden = !!on;
    if (actions) actions.hidden = !!on;
  }

  function roomLog(roomId) {
    var doc = readJson(localStorage, ROOM_CHAT_KEY, {});
    if (!doc[roomId]) {
      doc[roomId] = [{
        id: "host-" + roomId,
        senderName: "Cognation",
        body: "Cognation hosts this room. Keep it kind.",
        at: new Date().toISOString(),
      }];
      writeJson(localStorage, ROOM_CHAT_KEY, doc);
    }
    return doc;
  }
  function paintRoom(room) {
    var panel = state.shell.querySelector("[data-commune-room]");
    if (!panel || !room) return;
    var title = panel.querySelector("[data-commune-room-title]");
    var topic = panel.querySelector("[data-commune-room-topic]");
    var log = panel.querySelector("[data-commune-room-log]");
    if (title) title.textContent = room.title || "Room";
    if (topic) topic.textContent = room.body || room.topic || "";
    if (log) {
      log.innerHTML = "";
      var doc = roomLog(room.id);
      (doc[room.id] || []).forEach(function (msg) {
        var p = document.createElement("p");
        p.className = "commune-room-line";
        p.textContent = (msg.senderName || "Cognation") + ": " + (msg.body || "");
        log.appendChild(p);
      });
    }
    showRoom(true);
    state.roomId = room.id;
  }
  function openRoom(roomId, scroll) {
    roomId = String(roomId || "");
    var rooms = ensureSiteRooms();
    var room = null;
    rooms.forEach(function (item) { if (item.id === roomId) room = item; });
    if (!room) return false;
    if (!state.shell) return false;
    paintRoom(room);
    if (scroll && state.shell.scrollIntoView) state.shell.scrollIntoView({ block: "center" });
    return true;
  }
  function closeRoom() {
    state.roomId = "";
    showRoom(false);
  }

  function paintDeck() {
    if (!state.deck) return;
    closeRoom();
    state.deck.innerHTML = "";
    var card = currentCard();
    if (!card) {
      refill();
      card = currentCard();
    }
    if (!card) {
      state.deck.innerHTML = '<p class="commune-swipe-empty">Nothing public to show yet.</p>';
      syncActionLabels();
      return;
    }
    var el = renderCard(card);
    state.deck.appendChild(el);
    bindCard(el, card);
    syncActionLabels();
  }

  function refill() {
    var built = buildLanes();
    state.cards = paceDeck(built.lanes, built.dating, 12);
    state.index = 0;
  }

  function dismiss(card) {
    var ids = getDismissed();
    if (ids.indexOf(card.id) < 0) ids.push(card.id);
    setDismissed(ids);
  }
  function like(card) {
    var ids = getLikes();
    if (ids.indexOf(card.id) < 0) ids.push(card.id);
    setLikes(ids);
  }

  function recordShare(card) {
    var interests = terms(card.interests);
    if (!interests.length) interests = terms((card.title || "") + " " + (card.body || ""));
    if (!interests.length) return;
    var shares = readJson(localStorage, SHARES_KEY, []);
    if (!Array.isArray(shares)) shares = [];
    shares.push({
      id: "share-" + card.id + "-" + Date.now().toString(36),
      adId: card.id,
      title: card.title,
      body: card.body,
      videoUrl: card.videoUrl || "",
      fromName: card.fromName || "",
      handle: card.handle || "",
      profileId: card.profileId || "",
      interests: interests,
      swiperId: currentProfileId(),
      at: Date.now(),
    });
    writeJson(localStorage, SHARES_KEY, shares.slice(-200));
  }

  function sendPersonalFriendRequest(targetId) {
    targetId = String(targetId || "");
    var personal = viewerPersonal();
    var cap = (window.CognationTowerFriends && window.CognationTowerFriends.cap) || FRIEND_CAP;
    var count = personal && Array.isArray(personal.friendIds) ? personal.friendIds.length : 0;
    if (count >= cap) return { ok: false, full: true, message: "This list is full." };
    if (!targetId || !personal) return { ok: false, message: "Could not send that request." };
    if (personal.friendIds && personal.friendIds.map(String).indexOf(targetId) >= 0) {
      return { ok: true, already: true, message: "You're already friends." };
    }
    var doc = readJson(localStorage, REQUESTS_KEY, { outgoing: [], incoming: [] });
    if (!Array.isArray(doc.outgoing)) doc.outgoing = [];
    if (!Array.isArray(doc.incoming)) doc.incoming = [];
    var fromId = String(personal.id || currentProfileId());
    var dup = doc.outgoing.some(function (req) {
      return req && String(req.fromId) === fromId && String(req.toId) === targetId;
    });
    if (!dup) {
      doc.outgoing.push({ fromId: fromId, toId: targetId, at: Date.now() });
      doc.incoming.push({ fromId: fromId, toId: targetId, at: Date.now() });
      writeJson(localStorage, REQUESTS_KEY, doc);
    }
    var social = window.CognationSocialGraph;
    if (social && typeof social.isReady === "function" && social.isReady() && typeof social.isRemoteProfileId === "function" && social.isRemoteProfileId(targetId) && typeof social.act === "function") {
      try { social.act(targetId, "personal"); } catch (e) {}
    }
    return { ok: true, message: "Friend request sent." };
  }

  function datingRights() {
    var doc = readJson(localStorage, DATING_RIGHT_KEY, {});
    return doc && typeof doc === "object" ? doc : {};
  }
  function markDatingRight(fromId, toId) {
    var doc = datingRights();
    doc[String(fromId) + "|" + String(toId)] = Date.now();
    writeJson(localStorage, DATING_RIGHT_KEY, doc);
  }
  function hasDatingRight(fromId, toId) {
    return !!datingRights()[String(fromId) + "|" + String(toId)];
  }
  function deliverDatingCard(fromRec, toId) {
    if (!fromRec || !toId || !datingOptIn(fromRec)) return;
    var photo = profilePhoto(fromRec);
    if (!photo) return;
    var doc = readJson(localStorage, INBOUND_KEY, {});
    if (!Array.isArray(doc[toId])) doc[toId] = [];
    var exists = doc[toId].some(function (c) { return c && c.profileId === fromRec.id; });
    if (!exists) {
      doc[toId].push({
        profileId: fromRec.id,
        name: fromRec.displayName || "Member",
        photo: photo,
        minAge: datingMinAge(fromRec),
      });
      writeJson(localStorage, INBOUND_KEY, doc);
    }
  }
  function selfDatingRecord() {
    var personal = viewerPersonal();
    if (personal && datingOptIn(personal) && profilePhoto(personal)) return personal;
    var id = currentProfileId();
    var rec = profileById(id);
    if (rec && datingOptIn(rec) && profilePhoto(rec)) return rec;
    return null;
  }

  function finishSwipe() {
    state.cards.splice(state.index, 1);
    state.seen += 1;
    if (state.cards.length < 4) {
      var more = sampleDeck(8);
      more.forEach(function (card) {
        var dup = state.cards.some(function (c) { return c.id === card.id; });
        if (!dup) state.cards.push(card);
      });
    }
    state.busy = false;
    paintDeck();
  }

  function swipe(direction) {
    if (state.busy || state.roomId) return;
    var card = currentCard();
    if (!card) return;
    var dir = direction === "left" ? "left" : "right";
    var active = state.deck && state.deck.querySelector("[data-commune-card].is-active");
    if (dir === "right" && card.type === TYPE.DATING) {
      if (!(active && active.getAttribute("data-rating-selected") === "true")) {
        var st = active && active.querySelector("[data-dating-rate-status]");
        if (st) {
          st.hidden = false;
          st.textContent = "Rate the photo before you swipe right.";
        }
        setStatus("Rate the photo before you share your card.");
        syncActionLabels();
        return;
      }
    }
    if (dir === "right" && card.type === TYPE.KNOW) {
      var sent = sendPersonalFriendRequest(card.profileId);
      setStatus(sent.message || (sent.full ? "This list is full." : "Friend request sent."));
      if (sent.full) return;
    }
    state.busy = true;
    if (active) active.classList.add(dir === "left" ? "is-exit-left" : "is-exit-right");
    window.setTimeout(function () {
      if (dir === "left") {
        dismiss(card);
        setStatus("Passed.");
      } else if (card.type === TYPE.DATING) {
        like(card);
        var me = currentProfileId();
        markDatingRight(me, card.profileId);
        var self = selfDatingRecord();
        if (self) deliverDatingCard(self, card.profileId);
        if (hasDatingRight(card.profileId, me)) {
          var store = window.CognationMessageStore;
          if (store && typeof store.openMatch === "function") {
            store.openMatch(
              { id: me, name: (self && self.displayName) || "You" },
              { id: card.profileId, name: card.name || "Member" }
            );
          }
          writeNotice(me, "match", "It's a match. A message is open in Tower.");
          writeNotice(card.profileId, "match", "It's a match. A message is open in Tower.");
          renderNotices();
          setStatus("It's a match. A message is open in Tower.");
        } else {
          setStatus("Your card is on their Commune.");
        }
      } else if (card.type === TYPE.AD) {
        recordShare(card);
        setStatus("Shared with friends who share this interest.");
      } else if (card.type === TYPE.KNOW) {
        /* status already set */
      } else if (card.type === TYPE.FRIEND || card.type === TYPE.EVENT || card.type === TYPE.FACT || card.type === TYPE.WELLNESS || card.type === TYPE.CHAT) {
        like(card);
        if (card.type !== TYPE.CHAT) recordShare(card);
        setStatus("Kept.");
      } else {
        like(card);
        setStatus("Kept.");
      }
      finishSwipe();
    }, 220);
  }

  function rebuildDeck() {
    syncDatingVisibility();
    renderNotices();
    refill();
    state.seen = 0;
    paintDeck();
  }

  function onPointerDown(ev) {
    var front = state.deck && state.deck.querySelector("[data-commune-card].is-active");
    if (!front) return;
    if (ev.target.closest && ev.target.closest("button, a, input, textarea, label, video, iframe")) return;
    var point = ev.touches ? ev.touches[0] : ev;
    state.pointer = { x0: point.clientX, dx: 0, el: front };
    front.classList.add("is-dragging");
  }
  function onPointerMove(ev) {
    if (!state.pointer) return;
    var point = ev.touches ? ev.touches[0] : ev;
    var dx = point.clientX - state.pointer.x0;
    state.pointer.dx = dx;
    if (state.pointer.el) state.pointer.el.style.transform = "translate(" + dx + "px,0) rotate(" + dx / 28 + "deg)";
  }
  function onPointerUp() {
    if (!state.pointer) return;
    var dx = state.pointer.dx || 0;
    var el = state.pointer.el;
    state.pointer = null;
    if (el) {
      el.classList.remove("is-dragging");
      el.style.transform = "";
    }
    if (Math.abs(dx) < 80) return;
    swipe(dx < 0 ? "left" : "right");
  }

  function wireDatingToggle(shell) {
    var toggle = shell.querySelector("[data-commune-see-dating], [data-commune-dating-toggle]");
    if (!toggle) return;
    toggle.addEventListener("change", function () {
      var age = getMemberAge();
      if (age != null && age <= 18) {
        toggle.checked = false;
        setSeeDating(false);
        setStatus("Dating cards stay off under 19.");
        syncDatingVisibility();
        rebuildDeck();
        return;
      }
      setSeeDating(!!toggle.checked);
      syncDatingVisibility();
      rebuildDeck();
      setStatus(toggle.checked ? "Dating cards can appear now and then." : "Dating cards hidden.");
    });
  }

  function bindInteractions(shell) {
    shell.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-commune-swipe]");
      if (!btn || !shell.contains(btn)) return;
      swipe(btn.getAttribute("data-commune-swipe") === "left" ? "left" : "right");
    });
    var back = shell.querySelector("[data-commune-room-back]");
    if (back) back.addEventListener("click", closeRoom);
    var form = shell.querySelector("[data-commune-room-compose]");
    if (form) {
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var input = shell.querySelector("[data-commune-room-input]");
        var text = input ? String(input.value || "").trim() : "";
        if (!text || !state.roomId) return;
        var doc = roomLog(state.roomId);
        doc[state.roomId].push({
          id: "m" + Date.now().toString(36),
          senderName: "You",
          body: text.slice(0, 500),
          at: new Date().toISOString(),
        });
        writeJson(localStorage, ROOM_CHAT_KEY, doc);
        if (input) input.value = "";
        var room = null;
        ensureSiteRooms().forEach(function (item) { if (item.id === state.roomId) room = item; });
        if (room) paintRoom(room);
      });
    }
    var deck = shell.querySelector("[data-commune-deck]");
    if (deck) {
      deck.addEventListener("pointerdown", onPointerDown);
      deck.addEventListener("pointermove", onPointerMove);
      deck.addEventListener("pointerup", onPointerUp);
      deck.addEventListener("pointercancel", onPointerUp);
    }
    document.addEventListener("keydown", function (ev) {
      var panel = document.getElementById("panel-commune");
      if (!panel || panel.hidden || state.roomId) return;
      if (ev.key === "ArrowLeft") { ev.preventDefault(); swipe("left"); }
      else if (ev.key === "ArrowRight") { ev.preventDefault(); swipe("right"); }
    });
    wireDatingToggle(shell);
  }

  function init() {
    ensureSiteRooms();
    var shell = document.querySelector("[data-commune-shell]");
    if (!shell) return;
    state.shell = shell;
    state.deck = shell.querySelector("[data-commune-deck]");
    state.statusEl = shell.querySelector("[data-commune-swipe-status]");
    bindInteractions(shell);
    rebuildDeck();
    document.addEventListener("cognation:session-started", rebuildDeck);
    document.addEventListener("cognation:member-profile-updated", function () {
      syncDatingVisibility();
      rebuildDeck();
    });
  }

  window.CognationCommuneSwipe = {
    rebuild: rebuildDeck,
    openRoom: openRoom,
    getFollows: getFollows,
    setFollows: setFollows,
    isFollowing: isFollowing,
    toggleFollow: toggleFollow,
    getMemberProfile: getMemberProfile,
    setMemberProfile: setMemberProfile,
    getMemberAge: getMemberAge,
    getSeeDating: getSeeDating,
    setSeeDating: setSeeDating,
    datingAllowed: datingAllowed,
    seedDemoFollows: function () { return getFollows(); },
    ratingSentence: ratingSentence,
    paceDeck: paceDeck,
    sampleDeck: sampleDeck,
    sendPersonalFriendRequest: sendPersonalFriendRequest,
    FOLLOWS_KEY: FOLLOWS_KEY,
    SEE_DATING_KEY: SEE_DATING_KEY,
    MEMBER_PROFILE_KEY: MEMBER_PROFILE_KEY,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
