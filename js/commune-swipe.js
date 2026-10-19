/**
 * COMMUNE — paced public swipe deck (Personal featured mix).
 * Featured families rotate 1:1 — Classroom / ad / chat room / dating / content.
 * Content lane holds fact, wellness, friend-share, public event, people-you-may-know,
 * and Tower live seller / garage-sale listings. Dating stays opt-in + local + age-gated.
 * Ads stay in the 1:1 mix and play at most 3 seconds. Under-13 sees G/PG only.
 * Professional ads open that profile. People-you-may-know sends a friend request.
 * A pass hides that card for this viewer after refresh. Other viewers still see it.
 * Personal | Professional pipe switch: Personal keeps the 1:1 mix above unchanged.
 * Professional is its own deck (webinar / professionals you might know / research /
 * auction / podcast / field / pop-culture), rotated 1:1, each card with a visible type mark
 * and a "why you see this" line. Professional never shows dating or friends-you-may-know.
 * No Instagram copycat patterns.
 * Swipe learning (step 1): right = share to friends + confirm interest tag;
 * left = retag / fade topic after repeats; seed swipes never share; real users
 * never see seed shares; Friends' shares switch in Algorithm Manager; off-interest
 * friend shares at most 1 in 6; deck ends "You're caught up."
 */
(function () {
  "use strict";

  var DISMISSED_KEY = "cognation.commune.swipe.dismissed.v1";
  var LIKES_KEY = "cognation.commune.swipe.likes.v1";
  var FOLLOWS_KEY = "cognation.commune.follows.v1";
  var SEE_DATING_KEY = "cognation.commune.seeDating.v1";
  var SEE_FRIEND_SHARES_KEY = "cognation.commune.seeFriendShares.v1";
  var LEARN_KEY = "cognation.commune.swipe-learn.v1";
  var MEMBER_PROFILE_KEY = "cognation.member.profile.v1";
  var RATINGS_KEY = "cognation.commune.dating.ratings.v1";
  var DATING_RIGHT_KEY = "cognation.commune.dating.rights.v1";
  var INBOUND_KEY = "cognation.commune.dating.inbound.v1";
  var NOTICES_KEY = "cognation.commune.notices.v1";
  var SHARES_KEY = "cognation.commune.friend-shares.v1";
  var BIDS_KEY = "cognation.commune.market.bids.v1";
  var HIGH_KEY = "cognation.commune.market.high.v1";
  var PAID_KEY = "cognation.commune.market.paid.v1";
  var BID_MS = 86400000;
  var FADE_LEFT_THRESHOLD = 3;
  var OFF_INTEREST_FRIEND_RATIO = 6;
  var ROOMS_KEY = "cognation.commune.site-rooms.v1";
  var REQUESTS_KEY = "cognation.friend.requests.v1";
  var FRIEND_CAP = 6000;

  var TYPE = {
    CLASSROOM: "classroom",
    AD: "ad",
    CHAT: "chatroom",
    FACT: "fact",
    WELLNESS: "wellness",
    FRIEND: "friend",
    EVENT: "event",
    KNOW: "know",
    DATING: "dating",
    CONTENT: "content",
    MARKET: "marketplace",
    GROUP: "group",
  };

  /* Alexa lock 2026-10-02: Personal featured mix is 1:1 across five families.
     Marketplace rides the content slot. It is not a sixth family. */
  var FEATURED_ORDER = [TYPE.CLASSROOM, TYPE.AD, TYPE.CHAT, TYPE.DATING, TYPE.CONTENT];
  var CONTENT_SUBTYPES = [TYPE.MARKET, TYPE.GROUP, TYPE.FACT, TYPE.WELLNESS, TYPE.FRIEND, TYPE.EVENT, TYPE.KNOW, TYPE.CONTENT];
  var AD_MAX_MS = 3000;
  var REPEATABLE = {};
  /* Featured families stay repeatable so a long Personal deck holds true 1:1 rotation. */
  REPEATABLE[TYPE.CLASSROOM] = true;
  REPEATABLE[TYPE.AD] = true;
  REPEATABLE[TYPE.CHAT] = true;
  REPEATABLE[TYPE.DATING] = true;
  REPEATABLE[TYPE.FACT] = true;
  REPEATABLE[TYPE.WELLNESS] = true;
  REPEATABLE[TYPE.FRIEND] = true;
  REPEATABLE[TYPE.EVENT] = true;
  REPEATABLE[TYPE.KNOW] = true;
  REPEATABLE[TYPE.CONTENT] = true;

  var SITE_ROOM_BODY = "Cognation hosts this room.";
  /* sqlId matches supabase/migrations/20261015_chat_rooms.sql catalog seed. */
  var SITE_ROOMS = [
    { id: "room-site-18-21", sqlId: "a1000000-0000-4000-8000-000000000001", slug: "18-21", title: "18–21", topic: "18–21", gate: "age-18-21" },
    { id: "room-site-highschool", sqlId: "a1000000-0000-4000-8000-000000000002", slug: "highschool", title: "Highschool", topic: "highschool", gate: "highschool" },
    { id: "room-site-moms", sqlId: "a1000000-0000-4000-8000-000000000003", slug: "moms", title: "Moms", topic: "moms", gate: "interest", interests: ["mom", "moms", "mother", "mothers"] },
    { id: "room-site-tech-ai", sqlId: "a1000000-0000-4000-8000-000000000004", slug: "tech-ai", title: "Tech/AI", topic: "tech/ai", gate: "interest", interests: ["tech", "technology", "ai", "artificial intelligence"] },
    { id: "room-site-speed-dating", sqlId: "a1000000-0000-4000-8000-000000000005", slug: "speed-dating", title: "Speed dating", topic: "speed dating", gate: "speed-dating" },
    { id: "room-site-21", sqlId: "a1000000-0000-4000-8000-000000000006", slug: "21-plus", title: "21+", topic: "21+", gate: "age-21" },
    { id: "room-site-disability", sqlId: "a1000000-0000-4000-8000-000000000007", slug: "disability-help", title: "Disability help", topic: "disability help", gate: "interest", interests: ["disability", "disabilities", "disability help"] },
    { id: "room-site-mental-health", sqlId: "a1000000-0000-4000-8000-000000000008", slug: "mental-health", title: "Mental health", topic: "mental health", gate: "interest", interests: ["mental health"] },
    { id: "room-site-military", sqlId: "a1000000-0000-4000-8000-000000000009", slug: "military", title: "Military", topic: "military", gate: "interest", interests: ["military", "veteran", "veterans"] },
    { id: "room-site-lgbtq", sqlId: "a1000000-0000-4000-8000-00000000000a", slug: "lgbtq", title: "LGBTQ", topic: "lgbtq", gate: "interest", interests: ["lgbtq", "lgbtq+", "lgbt"] },
    { id: "room-site-public-policy", sqlId: "a1000000-0000-4000-8000-00000000000b", slug: "public-policy", title: "Public policy", topic: "public policy", gate: "interest", interests: ["public policy"] },
    { id: "room-site-gamers", sqlId: "a1000000-0000-4000-8000-00000000000c", slug: "gamers", title: "Gamers", topic: "gamers", gate: "interest", interests: ["gamer", "gamers", "gaming"] },
    { id: "room-site-jobs", sqlId: "a1000000-0000-4000-8000-00000000000d", slug: "jobs", title: "Jobs", topic: "jobs", gate: "interest", interests: ["job", "jobs"] },
    { id: "room-site-garage-sale", sqlId: "a1000000-0000-4000-8000-00000000000e", slug: "garage-sale", title: "Garage sale", topic: "garage sale", gate: "interest", interests: ["garage sale"] },
    { id: "room-site-reality", sqlId: "a1000000-0000-4000-8000-00000000000f", slug: "reality-shows", title: "Reality shows", topic: "reality shows", gate: "interest", interests: ["reality show", "reality shows", "reality tv"] },
    { id: "room-site-insurance", sqlId: "a1000000-0000-4000-8000-000000000010", slug: "insurance", title: "Insurance", topic: "insurance", gate: "interest", interests: ["insurance"] },
  ];

  /* Honest-thin Classroom / webinar cards — life skills for ~18+ (insurance, voting, business). */
  var CLASSROOM_BODY = "Cognation Classroom — life skills at a human pace.";
  var CLASSROOM_SESSIONS = [
    {
      id: "class-insurance",
      sqlId: "a2000000-0000-4000-8000-000000000001",
      title: "Insurance basics",
      topic: "insurance",
      body: "What coverage is for, how premiums work, and questions worth asking before you buy.",
      minAge: 18,
    },
    {
      id: "class-voting",
      sqlId: "a2000000-0000-4000-8000-000000000002",
      title: "Voting & civic basics",
      topic: "voting",
      body: "How elections reach the ballot, registering where you live, and finding nonpartisan guides.",
      minAge: 18,
    },
    {
      id: "class-business",
      sqlId: "a2000000-0000-4000-8000-000000000003",
      title: "Starting a small business",
      topic: "business",
      body: "Sole prop vs LLC in plain language, basic bookkeeping, and when to ask a professional.",
      minAge: 18,
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

  /* Professional deck (Alexa GO 2026-10-07). Placeholder cards carry a visible Demo label
   * until real feeds exist — no invented live data, names, prices, or counts. */
  var MODE_KEY = "cognation.commune.mode";
  var MODE = { PERSONAL: "personal", PROFESSIONAL: "professional" };
  var PRO = {
    WEBINAR: "pro-webinar",
    KNOW: "pro-know",
    RESEARCH: "pro-research",
    AUCTION: "pro-auction",
    PODCAST: "pro-podcast",
    FIELD: "pro-field",
    POP: "pro-popculture",
  };
  var PRO_ORDER = [PRO.WEBINAR, PRO.KNOW, PRO.RESEARCH, PRO.AUCTION, PRO.PODCAST, PRO.FIELD, PRO.POP];
  var PRO_MARK = {};
  PRO_MARK[PRO.WEBINAR] = "Webinar";
  PRO_MARK[PRO.KNOW] = "Professionals you might know";
  PRO_MARK[PRO.RESEARCH] = "Research";
  PRO_MARK[PRO.AUCTION] = "Auction";
  PRO_MARK[PRO.PODCAST] = "Podcast";
  PRO_MARK[PRO.FIELD] = "Field";
  PRO_MARK[PRO.POP] = "Pop-culture";
  var DEMO_LABEL = "Demo · placeholder";
  /* The legacy classroom panel. Not the deck's classroom CARD (it also carries
     data-classroom="card"): hiding that card on Back left a blank deck. */
  var CLASSROOM_PANEL_SEL = "[data-classroom]:not([data-commune-card]), #panel-classroom, [data-commune-classroom]";
  var PRO_WEBINARS = [
    { id: "pro-webinar-ethics", title: "Ethical collaboration in practice", body: "Credit, consent, and clear roles when people build together." },
    { id: "pro-webinar-async", title: "Async work that respects time", body: "Written decisions, clean handoffs, and calm response windows." },
    { id: "pro-webinar-ce", title: "Planning continuing education", body: "Mapping a year of learning to what your field asks you to renew." },
  ];
  var PRO_PODCASTS = [
    { id: "pro-podcast-leaders", title: "Top industry performers", body: "Talks with leading people across industries, not only Cognation experts." },
    { id: "pro-podcast-ethics", title: "Ethical collaboration", body: "How strong teams share credit and work through disagreement." },
    { id: "pro-podcast-async", title: "Async by default", body: "Episodes on remote and async craft. Listen on your own schedule." },
    { id: "pro-podcast-ce", title: "Continuing education", body: "Episodes that pair with continuing-education goals." },
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
  function friction(phase, pathway, reasonOrSurface) {
    try {
      var F = window.CognationFriction;
      if (!F) return;
      if (phase === "begin") F.begin(pathway, reasonOrSurface);
      else if (phase === "retry") F.retry(pathway, reasonOrSurface);
      else if (phase === "complete") F.complete(pathway);
      else if (phase === "abandon") F.abandon(pathway, reasonOrSurface);
    } catch (e) {}
  }
  function pathwayForCard(card) {
    if (!card) return "commune";
    if (window.CognationFriction && window.CognationFriction.pathwayFromCardType) {
      return window.CognationFriction.pathwayFromCardType(card.type);
    }
    var t = String(card.type || "").toLowerCase();
    if (t === "dating" || t === "speed-dating") return "dating";
    if (t === "ad" || t === "advertisement") return "ad";
    if (t === "chat" || t === "chatroom") return "chat";
    if (t === "classroom") return "classroom";
    return "commune";
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

  function featuredFamily(type) {
    var t = String(type || "");
    if (CONTENT_SUBTYPES.indexOf(t) >= 0) return TYPE.CONTENT;
    return t;
  }

  function paceDeck(lanes, dating, count) {
    var cursors = {};
    var out = [];
    var rot = 0;
    var lastFamily = "";
    var guard = 0;
    var target = count || 24;
    dating = dating || [];
    var datingLane = ((lanes && lanes[TYPE.DATING]) || dating || []).slice();
    function takeFromList(key, list, forceType) {
      if (!list || !list.length) return null;
      var i = cursors[key] || 0;
      if (!REPEATABLE[key] && !REPEATABLE[forceType || key] && i >= list.length) return null;
      var src = list[i % list.length];
      cursors[key] = i + 1;
      var card = clone(src);
      if (forceType) card.type = forceType;
      else if (!card.type) card.type = key;
      if (i >= list.length) card.id = String(src.id || key) + "-r" + i;
      return card;
    }
    function takeFeatured(family) {
      if (family === TYPE.DATING) {
        return takeFromList(TYPE.DATING, datingLane, TYPE.DATING);
      }
      if (family === TYPE.CONTENT) {
        var n;
        var start = cursors._contentRot || 0;
        for (n = 0; n < CONTENT_SUBTYPES.length; n++) {
          var sub = CONTENT_SUBTYPES[(start + n) % CONTENT_SUBTYPES.length];
          var list = (lanes && lanes[sub]) || [];
          if (sub === TYPE.FRIEND && list.length) {
            /* Prefer in-interest friend shares; off-interest at most 1 in every 6 cards. */
            var prefer = [];
            var off = [];
            list.forEach(function (c) {
              if (c && c.offInterest) off.push(c);
              else prefer.push(c);
            });
            var pickList = prefer.length ? prefer : off;
            var cardF = takeFromList(sub, pickList, null);
            if (!cardF && prefer.length && off.length) cardF = takeFromList(sub + ":off", off, null);
            if (!cardF) continue;
            if (cardF.offInterest) {
              var nextLen = out.length + 1;
              var offCount = 0;
              out.forEach(function (c) {
                if (c && c.type === TYPE.FRIEND && c.offInterest) offCount += 1;
              });
              if ((offCount + 1) * OFF_INTEREST_FRIEND_RATIO > nextLen) {
                /* Skip this off-interest slot; try another content subtype. */
                continue;
              }
            }
            cursors._contentRot = (CONTENT_SUBTYPES.indexOf(sub) + 1) % CONTENT_SUBTYPES.length;
            return cardF;
          }
          var card = takeFromList(sub, list, null);
          if (!card) continue;
          /* Each #group post is one card; keep this slot until those posts are placed. */
          if (!(sub === TYPE.GROUP && (cursors[sub] || 0) < list.length)) {
            cursors._contentRot = (CONTENT_SUBTYPES.indexOf(sub) + 1) % CONTENT_SUBTYPES.length;
          }
          return card;
        }
        return null;
      }
      return takeFromList(family, (lanes && lanes[family]) || [], family);
    }
    while (out.length < target && guard < target * 10) {
      guard += 1;
      var placed = false;
      var n;
      for (n = 0; n < FEATURED_ORDER.length; n++) {
        var family = FEATURED_ORDER[(rot + n) % FEATURED_ORDER.length];
        if (family === lastFamily) continue;
        var card = takeFeatured(family);
        if (!card) continue;
        out.push(card);
        lastFamily = family;
        rot = (FEATURED_ORDER.indexOf(family) + 1) % FEATURED_ORDER.length;
        placed = true;
        break;
      }
      if (!placed) {
        /* Only one featured family still has cards — allow it to continue filling. */
        for (n = 0; n < FEATURED_ORDER.length; n++) {
          var only = FEATURED_ORDER[(rot + n) % FEATURED_ORDER.length];
          var again = takeFeatured(only);
          if (!again) continue;
          out.push(again);
          lastFamily = only;
          rot = (FEATURED_ORDER.indexOf(only) + 1) % FEATURED_ORDER.length;
          placed = true;
          break;
        }
      }
      if (!placed) break;
    }
    return out;
  }

  function stableCardId(id) {
    return String(id || "").replace(/-r\d+$/, "");
  }
  function passStore() {
    var doc = readJson(localStorage, DISMISSED_KEY, null);
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return {};
    return doc;
  }
  function absorbLegacySessionPasses() {
    var legacy = asIds(readJson(sessionStorage, DISMISSED_KEY, []));
    if (!legacy.length) return;
    var doc = passStore();
    var key = currentProfileId();
    var ids = asIds(doc[key]);
    legacy.forEach(function (id) {
      id = stableCardId(id);
      if (id && ids.indexOf(id) < 0) ids.push(id);
    });
    doc[key] = ids;
    writeJson(localStorage, DISMISSED_KEY, doc);
    try { sessionStorage.removeItem(DISMISSED_KEY); } catch (e) {}
  }
  function getDismissed() {
    absorbLegacySessionPasses();
    return asIds(passStore()[currentProfileId()]).map(stableCardId);
  }
  function setDismissed(ids) {
    var doc = passStore();
    var unique = [];
    asIds(ids).forEach(function (id) {
      id = stableCardId(id);
      if (id && unique.indexOf(id) < 0) unique.push(id);
    });
    doc[currentProfileId()] = unique;
    writeJson(localStorage, DISMISSED_KEY, doc);
  }
  function passedSet() {
    var passed = {};
    getDismissed().forEach(function (id) { passed[stableCardId(id)] = true; });
    return passed;
  }
  function omitPassed(cards) {
    var passed = passedSet();
    return (cards || []).filter(function (card) {
      return card && card.id && !passed[stableCardId(card.id)];
    });
  }
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
  function ageFloorApi() {
    return window.CognationAgeFloor || null;
  }
  function getMemberProfile() {
    var p = readJson(localStorage, MEMBER_PROFILE_KEY, null);
    if (!p || typeof p !== "object") p = {};
    /* Shared device: another signed-in user's leftover profile is not ours. */
    var floor = ageFloorApi();
    if (floor && typeof floor.memberProfileOwned === "function" && !floor.memberProfileOwned(p)) p = {};
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
    var floorW = ageFloorApi();
    var owner = floorW && typeof floorW.sessionUserId === "function" ? floorW.sessionUserId() : "";
    if (owner) next.ownerUserId = owner;
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
  /* Access age. Signed-in (live) sessions: ONLY the user_birth age counts.
     Missing/unreadable birth = 13 for access (no dating, no 18+/MA) but never
     under-13: a lower stored age (e.g. Sage 11) still wins. The stale
     member_age (28) in auth metadata / local cache can no longer lift it. */
  var ACCESS_AGE_UNKNOWN = 13;
  function liveSignedIn() {
    try {
      var sb = window.CognationSupabase;
      var sess = sb && typeof sb.getSession === "function" ? sb.getSession() : null;
      return !!(sess && (sess.user || sess.access_token));
    } catch (eLive) { return false; }
  }
  function getMemberAge() {
    var n = parseInt(getMemberProfile().age, 10);
    var stored = !isNaN(n) && n > 0 ? n : null;
    if (datingBirthAge != null) return datingBirthAge;
    if (birthMissing || liveSignedIn()) {
      return stored != null && stored < ACCESS_AGE_UNKNOWN ? stored : ACCESS_AGE_UNKNOWN;
    }
    return stored;
  }
  function getSeeDating() {
    try { return localStorage.getItem(SEE_DATING_KEY) === "1"; } catch (e) { return false; }
  }
  function setSeeDating(on) {
    var next = !!on && datingSwitchOn();
    var prev = getSeeDating();
    try { localStorage.setItem(SEE_DATING_KEY, next ? "1" : "0"); } catch (e) {}
    if (prev === next) return;
    emit("cognation:see-dating-changed", { seeDating: next });
  }
  /* P0 kill switch: js/dating-flag.js. Missing flag = off (fail closed). */
  function datingSwitchOn() {
    var f = window.CognationDatingFlag;
    return !!(f && typeof f.enabled === "function" && f.enabled());
  }
  /* Dating age = user_birth (year + month) only, set by seedops-dating-hydrate.
     NOT getMemberAge(): that reads auth member_age / local cache, which held a
     stale 28 for every seed. Unknown age fails closed. */
  var datingBirthAge = null;
  var birthMissing = false;
  function setDatingBirthAge(age) {
    var n = parseInt(age, 10);
    datingBirthAge = !isNaN(n) && n > 0 ? n : null;
    birthMissing = datingBirthAge == null;
  }
  function getDatingBirthAge() { return datingBirthAge; }
  /* Signed-in account with no user_birth row yet (real accounts made before the
     birth month step; seeds were backfilled). Server treats null age as not
     13+, so rooms can't be joined and 18+ classrooms stay hidden until it's set. */
  function liveBirthMissing() {
    return liveSignedIn() && datingBirthAge == null;
  }
  function datingAgeOk(age) {
    return typeof age === "number" && age >= 18;
  }
  function datingAllowed() {
    if (!datingSwitchOn()) return false;
    return !!(getSeeDating() && datingAgeOk(datingBirthAge));
  }

  /* Algorithm Manager — Friends' shares (default on). */
  function getSeeFriendShares() {
    try {
      var raw = localStorage.getItem(SEE_FRIEND_SHARES_KEY);
      if (raw === null || raw === undefined || raw === "") return true;
      return raw === "1" || raw === "true";
    } catch (eSee) {
      return true;
    }
  }
  function setSeeFriendShares(on) {
    var next = !!on;
    var prev = getSeeFriendShares();
    try { localStorage.setItem(SEE_FRIEND_SHARES_KEY, next ? "1" : "0"); } catch (eSet) {}
    if (prev === next) return;
    emit("cognation:see-friend-shares-changed", { seeFriendShares: next });
  }

  /* Tag learning is sandboxed: seed swipes never feed individual real users' tag
     counts and vice versa. A shared aggregate trending/topic signal for ECHO does
     not exist yet — do not invent one here; when Eng adds it, seed swipes may
     contribute aggregate-only counts. */
  function learnSandbox() {
    var st = resolveViewerSeedStatus();
    if (st === true) return "seed";
    if (st === false) return "real";
    return null; /* unknown — do not learn into either pool */
  }
  function learnDoc() {
    var box = learnSandbox();
    if (!box) return { confirmed: {}, left: {} };
    var raw = readJson(localStorage, LEARN_KEY, null);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) raw = {};
    /* Legacy flat {confirmed,left} → real sandbox only. */
    if (raw.confirmed || raw.left) {
      if (!raw.real && !raw.seed) {
        raw = { real: { confirmed: raw.confirmed || {}, left: raw.left || {} }, seed: { confirmed: {}, left: {} } };
      }
    }
    if (!raw.real || typeof raw.real !== "object") raw.real = { confirmed: {}, left: {} };
    if (!raw.seed || typeof raw.seed !== "object") raw.seed = { confirmed: {}, left: {} };
    var doc = raw[box] || { confirmed: {}, left: {} };
    if (!doc.confirmed || typeof doc.confirmed !== "object") doc.confirmed = {};
    if (!doc.left || typeof doc.left !== "object") doc.left = {};
    return doc;
  }
  function writeLearnDoc(doc) {
    var box = learnSandbox();
    if (!box) return; /* unknown: never write tags */
    var raw = readJson(localStorage, LEARN_KEY, null);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) raw = {};
    if (raw.confirmed || raw.left) {
      if (!raw.real && !raw.seed) {
        raw = { real: { confirmed: raw.confirmed || {}, left: raw.left || {} }, seed: { confirmed: {}, left: {} } };
      }
    }
    if (!raw.real || typeof raw.real !== "object") raw.real = { confirmed: {}, left: {} };
    if (!raw.seed || typeof raw.seed !== "object") raw.seed = { confirmed: {}, left: {} };
    raw[box] = {
      confirmed: (doc && doc.confirmed) || {},
      left: (doc && doc.left) || {},
    };
    writeJson(localStorage, LEARN_KEY, raw);
  }
  function cardInterestTags(card) {
    var tags = terms(card && card.interests);
    if (!tags.length) tags = terms(((card && card.title) || "") + " " + ((card && card.body) || ""));
    return tags.slice(0, 8);
  }
  function confirmInterestTags(card) {
    var tags = cardInterestTags(card);
    if (!tags.length) return tags;
    var doc = learnDoc();
    tags.forEach(function (tag) {
      doc.confirmed[tag] = (doc.confirmed[tag] || 0) + 1;
      if (doc.left[tag]) doc.left[tag] = Math.max(0, (doc.left[tag] || 0) - 1);
    });
    writeLearnDoc(doc);
    return tags;
  }
  function noteLeftInterestTags(card) {
    var tags = cardInterestTags(card);
    if (!tags.length) return tags;
    var doc = learnDoc();
    tags.forEach(function (tag) {
      doc.left[tag] = (doc.left[tag] || 0) + 1;
    });
    writeLearnDoc(doc);
    return tags;
  }
  function isTopicFaded(tag) {
    tag = norm(tag);
    if (!tag) return false;
    var doc = learnDoc();
    var left = doc.left[tag] || 0;
    var conf = doc.confirmed[tag] || 0;
    return left >= FADE_LEFT_THRESHOLD && left > conf;
  }
  function cardTopicFaded(card) {
    var tags = cardInterestTags(card);
    if (!tags.length) return false;
    var faded = 0;
    tags.forEach(function (t) { if (isTopicFaded(t)) faded += 1; });
    return faded > 0 && faded >= tags.length;
  }

  /* Server truth for seed/real (ECHO friend shares). Client accountKind/isSeed/
     seedFleetId/handle are NOT trusted — live seeds often lack them. Cache is
     filled from cognation_am_i_seed() and profiles.account_kind.
     Seed sandbox: known seeds write shares + learn their own tags; those shares
     (and mutual-share lines) show only to seed viewers. Real/unknown viewers
     fail closed — nothing from seeds reaches their ECHO/PULSE/tags/PYMK. */
  var viewerSeedStatus = null; /* null unknown | true seed/ops | false real */
  var profileSeedById = {}; /* profileId → true|false */

  function noteViewerSeedStatus(isSeed) {
    if (isSeed === true) viewerSeedStatus = true;
    else if (isSeed === false) viewerSeedStatus = false;
    else viewerSeedStatus = null;
    return viewerSeedStatus;
  }

  function noteProfileSeedStatus(profileId, isSeed) {
    var id = String(profileId || "");
    if (!id) return;
    if (isSeed === true) profileSeedById[id] = true;
    else if (isSeed === false) profileSeedById[id] = false;
    else delete profileSeedById[id];
  }

  function accountKindMeansSeed(kind) {
    var k = String(kind || "").toLowerCase();
    if (k === "seed" || k === "ops") return true;
    if (k === "real") return false;
    return null;
  }

  function refreshViewerSeedStatus() {
    var sb = window.CognationSupabase;
    if (!sb || typeof sb.configured !== "function" || !sb.configured() || typeof sb.rpc !== "function") {
      return Promise.resolve(viewerSeedStatus);
    }
    return sb
      .rpc("cognation_am_i_seed", {})
      .then(function (row) {
        /* PostgREST may return bare boolean or [boolean]. */
        var v = row;
        if (Array.isArray(row)) v = row[0];
        if (v && typeof v === "object" && "cognation_am_i_seed" in v) v = v.cognation_am_i_seed;
        if (v === true || v === false) {
          viewerSeedStatus = v;
          return viewerSeedStatus;
        }
        viewerSeedStatus = null;
        return viewerSeedStatus;
      })
      .catch(function () {
        viewerSeedStatus = null;
        return viewerSeedStatus;
      });
  }

  function warmProfileSeedStatuses(ids) {
    var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    var list = [];
    (ids || []).forEach(function (id) {
      var s = String(id || "");
      /* Handles (seed-ana-0005) are not profile ids — id=eq.<handle> is 400 22P02. */
      if (!UUID_RE.test(s)) return;
      if (s && list.indexOf(s) < 0 && profileSeedById[s] == null) list.push(s);
    });
    if (!list.length) return Promise.resolve();
    var sb = window.CognationSupabase;
    if (!sb || typeof sb.configured !== "function" || !sb.configured() || typeof sb.rest !== "function") {
      return Promise.resolve();
    }
    var q =
      "select=id,account_kind&id=in.(" +
      list
        .map(function (id) {
          return '"' + String(id).replace(/"/g, "") + '"';
        })
        .join(",") +
      ")";
    return sb
      .rest("profiles", { query: q })
      .then(function (rows) {
        (Array.isArray(rows) ? rows : []).forEach(function (row) {
          if (!row || !row.id) return;
          var flag = accountKindMeansSeed(row.account_kind);
          if (flag === true || flag === false) profileSeedById[String(row.id)] = flag;
        });
      })
      .catch(function () {});
  }

  function demoSessionLooksReal() {
    try {
      var auth = window.CognationAuth && typeof window.CognationAuth.getSession === "function"
        ? window.CognationAuth.getSession()
        : null;
      if (auth && auth.source === "demo") return true;
      var raw = null;
      try { raw = localStorage.getItem("cognation.session.v2"); } catch (eLs) {}
      var sess = raw ? JSON.parse(raw) : null;
      return !!(sess && sess.source === "demo");
    } catch (eDemo) {
      return false;
    }
  }

  function resolveViewerSeedStatus() {
    if (viewerSeedStatus === true || viewerSeedStatus === false) return viewerSeedStatus;
    /* Local demo has no cognation_am_i_seed — treat as real so ECHO works.
       Signed-in unknown stays null (fail closed). */
    if (demoSessionLooksReal()) return false;
    return null;
  }

  function viewerIsSeedOrOps() {
    var st = resolveViewerSeedStatus();
    /* Fail closed: unknown counts as seedish for gates that ask "are you seed?" */
    if (st === false) return false;
    return true;
  }

  function profileLooksSeed(rec) {
    /* Fail closed: missing/unknown → treat as seed (real users never see it). */
    if (!rec) return true;
    var id = String(rec.id || "");
    if (id && profileSeedById[id] === true) return true;
    if (id && profileSeedById[id] === false) return false;
    var fromKind = accountKindMeansSeed(rec.account_kind || rec.accountKind);
    if (fromKind === true) {
      if (id) profileSeedById[id] = true;
      return true;
    }
    if (fromKind === false) {
      if (id) profileSeedById[id] = false;
      return false;
    }
    return true;
  }

  function refreshSeedGates() {
    return refreshViewerSeedStatus().then(function () {
      return warmProfileSeedStatuses(friendIds());
    });
  }

  function viewerDisplayName() {
    var personal = viewerPersonal();
    if (personal && String(personal.displayName || "").trim()) return String(personal.displayName).trim().slice(0, 80);
    var member = getMemberProfile();
    if (member && String(member.displayName || member.name || "").trim()) {
      return String(member.displayName || member.name).trim().slice(0, 80);
    }
    try {
      var auth = window.CognationAuth && typeof window.CognationAuth.getSession === "function"
        ? window.CognationAuth.getSession()
        : null;
      if (auth && String(auth.profileDisplayName || "").trim()) {
        return String(auth.profileDisplayName).trim().slice(0, 80);
      }
    } catch (eName) {}
    return "A friend";
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

  function isHighschoolMember() {
    var age = getMemberAge();
    return age != null && age >= 14 && age <= 18;
  }
  function viewerInterestTokens() {
    var chunks = [];
    function add(value) {
      if (value == null || value === "") return;
      if (Array.isArray(value)) {
        value.forEach(add);
        return;
      }
      chunks.push(String(value));
    }
    var member = getMemberProfile();
    add(member.interests);
    add(member.interest);
    var personal = viewerPersonal();
    if (personal) {
      add(personal.interests);
      add(personal.interest);
      if (personal.badges) add(personal.badges.interest);
    }
    var tokens = [];
    chunks.join(" ").toLowerCase().split(/[^a-z0-9+]+/).forEach(function (token) {
      if (token && tokens.indexOf(token) < 0) tokens.push(token);
    });
    return tokens;
  }
  function hasInterest(needles) {
    var tokens = viewerInterestTokens();
    var blob = " " + tokens.join(" ") + " ";
    return (needles || []).some(function (needle) {
      var parts = String(needle || "").toLowerCase().split(/[^a-z0-9+]+/).filter(Boolean);
      if (!parts.length) return false;
      if (parts.length > 1) return blob.indexOf(" " + parts.join(" ") + " ") !== -1;
      return tokens.indexOf(parts[0]) !== -1;
    });
  }
  function roomVisible(room) {
    if (!room) return false;
    var age = getMemberAge();
    if (room.gate === "age-18-21") return age != null && age >= 18 && age <= 21;
    if (room.gate === "age-21") return age != null && age >= 21 && !isHighschoolMember();
    if (room.gate === "highschool") return isHighschoolMember();
    if (room.gate === "speed-dating") return !isHighschoolMember() && datingAllowed();
    if (room.gate === "interest") return hasInterest(room.interests);
    return false;
  }
  function roomCard(room) {
    return {
      id: room.id,
      sqlId: room.sqlId || "",
      slug: room.slug || "",
      type: TYPE.CHAT,
      title: room.title,
      body: SITE_ROOM_BODY,
      topic: room.topic,
      gate: room.gate,
      host: "Cognation",
    };
  }

  function classroomAllowed() {
    /* Signed in: the saved birth month (user_birth) decides. */
    if (liveSignedIn() && datingBirthAge != null) return datingBirthAge >= 18;
    var age = getMemberAge();
    return age != null && age >= 18;
  }

  function classroomCard(session) {
    return {
      id: session.id,
      type: TYPE.CLASSROOM,
      title: session.title,
      body: session.body || CLASSROOM_BODY,
      topic: session.topic,
      host: "Cognation",
      classroom: true,
      sqlId: session.sqlId || "",
      minAge: session.minAge || 18,
    };
  }

  function classroomCatalog() {
    return CLASSROOM_SESSIONS.map(classroomCard);
  }

  function visibleClassroomSessions() {
    /* No birth month yet: keep the card so Join can offer Add birth month. */
    if (!classroomAllowed() && !liveBirthMissing()) return [];
    return classroomCatalog();
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

  /** Ads stay in the 1:1 mix and play at most 3 seconds (standing Cognation rule). */
  function armAdMax(el, card) {
    if (!el || !card || card.type !== TYPE.AD) return;
    el.setAttribute("data-ad-max-ms", String(AD_MAX_MS));
    var video = el.querySelector("video.commune-ad-video");
    if (!video) return;
    var stopped = false;
    function stop() {
      if (stopped) return;
      stopped = true;
      try { video.pause(); } catch (e) {}
    }
    function start() {
      try {
        if (typeof video.currentTime === "number") video.currentTime = 0;
        var playResult = video.play();
        if (playResult && typeof playResult.catch === "function") playResult.catch(function () {});
      } catch (e2) {}
      setTimeout(stop, AD_MAX_MS);
    }
    video.addEventListener("timeupdate", function () {
      if (video.currentTime >= AD_MAX_MS / 1000) stop();
    });
    if (video.readyState >= 2) start();
    else video.addEventListener("loadeddata", start, { once: true });
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
      /* Tower going-live / seller listings live in the Content featured lane, not Event. */
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
          city: rec.city || rec.locality || "",
          state: rec.state || "",
          country: rec.country || "",
        });
      });
    });
    return out;
  }

  /* Cognation-curated free community listings (platform data — not seed-fabricated).
   * Used on dating-match Tower lines until partnership events exist.
   * Prefer viewer-local rows; nationwide rows are Cognation-hosted free events. */
  var COGNATION_FREE_LOCAL_EVENTS = [
    {
      id: "cgn-free-community-board",
      title: "Cognation community board walk",
      body: "Free · weekend mornings",
      nationwide: true,
    },
    {
      id: "cgn-free-skill-share",
      title: "Cognation free skill-share hour",
      body: "Free · weekday evenings",
      nationwide: true,
    },
  ];

  function formatMatchEventLine(ev) {
    if (!ev) return "";
    var title = String(ev.title || "").trim();
    if (!title) return "";
    var detail = String(ev.body || "").trim();
    var line = detail ? title + " · " + detail : title;
    return "Local event: " + line;
  }

  /** One live local / Cognation free event line for dating-match Tower messages.
   * Never invents seed copy: skips cal-demo calendar seeds; only public/pro or curated platform rows. */
  function pickLocalEventLine() {
    var all = publicEvents();
    var localOnes = [];
    var others = [];
    all.forEach(function (ev) {
      if (!ev || !ev.title) return;
      var rec = profileById(ev.profileId);
      if (rec && isLocal(rec)) localOnes.push(ev);
      else others.push(ev);
    });
    var pick = localOnes[0] || others[0] || null;
    if (!pick) {
      var viewer = getMemberProfile();
      var personal = viewerPersonal();
      var vCity = norm(viewer.city || viewer.locality || (personal && (personal.city || personal.locality)));
      var curated = COGNATION_FREE_LOCAL_EVENTS.filter(function (ev) {
        if (!ev || !ev.title) return false;
        if (ev.nationwide) return true;
        if (!vCity) return false;
        return norm(ev.city || ev.locality) === vCity;
      });
      pick = curated[0] || null;
    }
    return formatMatchEventLine(pick);
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
  function accountKindOf(rec) {
    if (!rec) return "real";
    var k = String(rec.accountKind || rec.account_kind || "").toLowerCase();
    if (k === "seed" || k === "ops") return k;
    if (rec.isSeed || rec.isOpsBot) return rec.isOpsBot ? "ops" : "seed";
    var fleet = String(rec.seedFleetId || rec.seed_fleet_id || "");
    if (/^seed-/.test(fleet) || /^seed-/.test(String(rec.handle || ""))) return "seed";
    if (/^ops-/.test(fleet)) return "ops";
    return "real";
  }
  function viewerAccountKind() {
    try {
      var auth = window.CognationAuth && typeof window.CognationAuth.getSession === "function"
        ? window.CognationAuth.getSession()
        : null;
      if (auth) {
        var ak = String(auth.accountKind || auth.account_kind || "").toLowerCase();
        if (ak === "seed" || ak === "ops") return ak;
        if (auth.isSeed) return "seed";
        var fleet = String(auth.seedFleetId || auth.seed_fleet_id || "");
        if (/^seed-/.test(fleet) || /^seed-/.test(String(auth.username || ""))) return "seed";
        if (/^ops-/.test(fleet)) return "ops";
      }
    } catch (eKind) {}
    return accountKindOf(viewerPersonal());
  }
  /* Seeds match seed↔seed only (never real). Real viewers see real only. */
  function datingKindsCompatible(rec) {
    var viewerKind = viewerAccountKind();
    var otherKind = accountKindOf(rec);
    var viewerSeedish = viewerKind === "seed" || viewerKind === "ops";
    var otherSeedish = otherKind === "seed" || otherKind === "ops";
    return viewerSeedish === otherSeedish;
  }
  /* Candidate pool: 18+ with a KNOWN age only. Unknown / under-18 never shown. */
  function datingCandidateAgeOk(rec) {
    var n = parseInt(rec && rec.age, 10);
    if (isNaN(n) || n <= 0) return false;
    return n >= Math.max(18, datingMinAge(rec));
  }
  function viewerCanSeeDating(rec) {
    if (!datingAllowed() || !datingOptIn(rec) || !isLocal(rec)) return false;
    if (!datingKindsCompatible(rec)) return false;
    var photo = profilePhoto(rec);
    if (!photo) return false;
    if (!datingCandidateAgeOk(rec)) return false;
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
      body: String(
        (rec && String(rec.bio || "").trim()) ||
          (extra.body && String(extra.body).trim()) ||
          "Open to meeting someone local."
      ).slice(0, 280),
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

  function isUnder13() {
    var age = getMemberAge();
    return age != null && age < 13;
  }

  /** Tower live seller / garage-sale style listings → Content featured family. */
  function towerLiveContentCards() {
    var out = [];
    var now = Date.now();
    eachProfile(function (rec) {
      if (!rec || !rec.goingLive || typeof rec.goingLive !== "object") return;
      var live = rec.goingLive;
      var what = String(live.what || live.title || "").trim();
      if (!what) return;
      var when = String(live.when || live.liveAt || "").trim();
      if (when && !isNaN(Date.parse(when)) && Date.parse(when) < now - 36e5) return;
      var where = String(live.where || live.notes || "").trim();
      out.push({
        id: "content-live-" + rec.id,
        type: TYPE.CONTENT,
        profileId: rec.id,
        handle: String(rec.handle || "").replace(/^@/, ""),
        fromName: rec.displayName || rec.handle || "",
        title: what,
        body: [when, where].filter(Boolean).join(" · ") || "Tower live — garage sale / seller listing.",
        contentKind: "tower-live",
        interests: terms(what + " " + where + " garage sale seller"),
      });
    });
    return out;
  }

  /* A feed post tagged #market becomes a Marketplace card in the 1:1 content slot. */
  function marketTagged(text) {
    return /(^|[^a-z0-9])#market(?![a-z0-9])/i.test(String(text || ""));
  }
  function marketCanBid() {
    var age = getMemberAge();
    return typeof age === "number" && age >= 16;
  }
  function marketAsk(text) {
    var m = String(text || "").match(/\$\s*(\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?)/);
    if (!m) return null;
    var n = Number(String(m[1]).replace(/,/g, ""));
    return isFinite(n) && n >= 0 ? n : null;
  }
  function marketMoney(amount) {
    var n = Number(amount);
    if (!isFinite(n) || n < 0) return "";
    var whole = Math.abs(n - Math.round(n)) < 0.001;
    return "$" + (whole ? String(Math.round(n)) : n.toFixed(2));
  }
  function marketBidLabel(card) {
    var price = marketMoney(card && card.ask);
    return price ? "Bid " + price : "Bid";
  }
  var MARKET_MILES = 20;
  var LOC_KEY = "cognation.member.location.v1";
  function asPoint(obj) {
    if (!obj || typeof obj !== "object") return null;
    var lat = Number(obj.lat != null ? obj.lat : obj.latitude);
    var lng = Number(obj.lng != null ? obj.lng : (obj.longitude != null ? obj.longitude : obj.lon));
    if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat: lat, lng: lng };
  }
  function milesApart(a, b) {
    var r = 3958.7613;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLng = (b.lng - a.lng) * Math.PI / 180;
    var s1 = Math.sin(dLat / 2);
    var s2 = Math.sin(dLng / 2);
    var h = s1 * s1 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * s2 * s2;
    return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function viewerPoint() {
    var member = getMemberProfile() || {};
    return asPoint(member) || asPoint(member.location) || asPoint(readJson(localStorage, LOC_KEY, null));
  }
  function sellerPoint(post) {
    var direct = asPoint(post) || asPoint(post && post.location);
    if (direct) return direct;
    var atts = post && post.attachments;
    var i;
    if (Array.isArray(atts)) {
      for (i = 0; i < atts.length; i++) {
        var found = asPoint(atts[i]);
        if (found) return found;
      }
    }
    var rec = post && post.authorProfileId ? profileById(post.authorProfileId) : null;
    return asPoint(rec) || asPoint(rec && rec.location);
  }
  function marketLocal(post) {
    var viewer = viewerPoint();
    var seller = sellerPoint(post);
    if (!viewer || !seller) return false;
    return milesApart(viewer, seller) <= MARKET_MILES;
  }
  function marketPictures(post) {
    var out = [];
    (post && Array.isArray(post.attachments) ? post.attachments : []).forEach(function (a) {
      var url = String((a && (a.dataUrl || a.url || a.src || a.imageUrl)) || "");
      if (url.indexOf("data:image/") === 0 || /^https?:\/\//.test(url)) out.push(url);
    });
    return out;
  }
  function marketplaceCards() {
    var doc = readJson(localStorage, "cognation.tower.posts.v3", null);
    var posts = doc && Array.isArray(doc.posts) ? doc.posts : [];
    var out = [];
    posts.forEach(function (post) {
      if (!post || !marketTagged((post.body || "") + " " + (post.title || ""))) return;
      if (!marketLocal(post) || marketPaid(post)) return;
      var body = String(post.body || "").replace(/(^|[^a-z0-9])#market(?![a-z0-9])/ig, "$1").replace(/\s+/g, " ").trim();
      out.push({
        id: "market-" + (post.id || out.length),
        type: TYPE.MARKET,
        title: body.split(/[.!\n]/)[0].slice(0, 80) || "For sale",
        body: body,
        fromName: post.authorName || "",
        handle: String(post.handle || "").replace(/^@/, ""),
        profileId: post.authorProfileId || "",
        pictures: marketPictures(post),
        ask: marketAsk((post.body || "") + " " + (post.title || "")),
      });
    });
    return out;
  }
  function marketOptedIn(cardId) {
    var doc = readJson(localStorage, BIDS_KEY, {});
    var row = doc[currentProfileId()];
    return !!(row && row[cardId]);
  }
  function optInToBid(cardId, amount) {
    if (!marketCanBid()) return false;
    var doc = readJson(localStorage, BIDS_KEY, {});
    var mine = currentProfileId();
    if (!doc[mine] || typeof doc[mine] !== "object") doc[mine] = {};
    var start = Number(amount);
    doc[mine][cardId] = { at: Date.now(), amount: isFinite(start) && start >= 0 ? start : null };
    writeJson(localStorage, BIDS_KEY, doc);
    return true;
  }
  function marketPaid(post) {
    var doc = readJson(localStorage, PAID_KEY, {});
    var id = post && (post.id || post);
    return !!(doc && (doc[id] || doc["market-" + id]));
  }
  function liveHigh(cardId) {
    var row = readJson(localStorage, HIGH_KEY, {})[cardId];
    if (!row || !isFinite(Number(row.amount)) || !row.at) return null;
    if (Date.now() - Number(row.at) > BID_MS) return null;
    return row;
  }
  function raiseBid(cardId, amount, ask) {
    if (!marketCanBid()) return false;
    var n = Number(amount);
    var floor = Number(ask);
    if (!isFinite(n) || (isFinite(floor) && n < floor)) return false;
    var cur = liveHigh(cardId);
    if (cur && n <= Number(cur.amount)) return false;
    var doc = readJson(localStorage, HIGH_KEY, {});
    doc[cardId] = { bidderId: currentProfileId(), amount: n, at: Date.now() };
    writeJson(localStorage, HIGH_KEY, doc);
    return optInToBid(cardId, n);
  }
  function settleMarketPayment(cardId, body) {
    if (!body || body.paid !== true) return false;
    var doc = readJson(localStorage, PAID_KEY, {});
    doc[cardId] = Date.now();
    var postId = String(cardId || "").replace(/^market-/, "");
    if (postId) doc[postId] = doc[cardId];
    writeJson(localStorage, PAID_KEY, doc);
    return true;
  }
  function payHighBid(card) {
    var high = card && liveHigh(card.id);
    var notSet = { ok: false, paid: false, message: "Apple Pay isn't set up. No payment was taken." };
    if (!marketCanBid() || !high || String(high.bidderId) !== String(currentProfileId())) {
      return Promise.resolve({ ok: false, paid: false, message: "Only the current high bidder can pay." });
    }
    var c = window.CognationConfig || {};
    var merchant = String(c.applePayMerchantId || "").trim();
    var processor = String(c.applePayProcessor || "").trim().replace(/\/$/, "");
    var Session = window.ApplePaySession;
    if (!merchant || !/^https:\/\//.test(processor) || typeof Session !== "function") return Promise.resolve(notSet);
    var amount = (Math.round(Number(high.amount) * 100) / 100).toFixed(2);
    return new Promise(function (resolve) {
      var session, done = false;
      function finish(result) { if (!done) { done = true; resolve(result); } }
      function fail(msg) {
        try { if (session) session.completePayment(Session.STATUS_FAILURE); } catch (e1) {}
        finish({ ok: false, paid: false, message: msg || "Payment didn't go through. Nothing was charged." });
      }
      function post(path, payload) {
        return fetch(processor + path, { method: "POST", credentials: "omit", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }).then(function (res) { return res.json(); });
      }
      try {
        session = new Session(3, { countryCode: "US", currencyCode: "USD", merchantCapabilities: ["supports3DS"], supportedNetworks: ["visa", "masterCard", "amex", "discover"], total: { label: "Cognation", amount: amount } });
      } catch (eOpen) { finish(notSet); return; }
      session.onvalidatemerchant = function (ev) {
        var url = ev && ev.validationURL;
        if (!/^https:\/\//.test(url || "")) { fail(); return; }
        post("/apple-pay/merchant-session", { validationURL: url, merchantId: merchant, amount: amount }).then(function (body) {
          if (body && body.merchantSession) session.completeMerchantValidation(body.merchantSession); else fail();
        }).catch(function () { fail(); });
      };
      session.onpaymentauthorized = function (ev) {
        var token = ev && ev.payment && ev.payment.token;
        if (!token) { fail(); return; }
        post("/apple-pay/pay", { token: token, amount: amount, cardId: card.id }).then(function (body) {
          if (!settleMarketPayment(card.id, body)) { fail(); return; }
          try { session.completePayment(Session.STATUS_SUCCESS); } catch (eOk) {}
          finish({ ok: true, paid: true, message: "Paid with Apple Pay." });
        }).catch(function () { fail(); });
      };
      session.oncancel = function () { finish({ ok: false, paid: false, message: "Payment cancelled. Nothing was charged." }); };
      try { session.begin(); } catch (eBegin) { finish(notSet); }
    });
  }
  function marketCardHtml(card) {
    var html = "";
    (card.pictures || []).forEach(function (src) {
      html += '<img class="commune-market-photo" alt="' + escapeHtml(card.title || "Item") + '" src="' + escapeHtml(src) + '">';
    });
    if (html) html = '<div class="commune-market-photos" data-market-photos>' + html + "</div>";
    if (!marketCanBid()) {
      return html + '<p class="commune-card-meta" data-market-bid-note>Bidding is for ages 16 and up.</p>';
    }
    var price = marketMoney(card.ask);
    var high = liveHigh(card.id);
    var opted = marketOptedIn(card.id);
    var note = (price ? "Starts at " + price + ". " : "") + "Opt in only. Nothing is charged.";
    if (high) note = "High bid " + marketMoney(high.amount) + ". Pay with Apple Pay within 24 hours. Nothing is charged until then.";
    else if (opted) note = "You're opted in" + (price ? " at " + price : "") + ". Nothing is charged.";
    return html +
      '<button type="button" class="btn btn-primary" data-market-bid aria-pressed="' + (opted ? "true" : "false") + '">' +
      escapeHtml(marketBidLabel(card)) + "</button>" +
      '<input data-market-raise inputmode="decimal" maxlength="8" aria-label="Raise bid" placeholder="Raise">' +
      '<button type="button" class="btn btn-secondary" data-market-pay>Apple Pay</button>' +
      '<p class="commune-card-meta" data-market-bid-note>' + escapeHtml(note) + "</p>";
  }

  function ageSafeFeaturedCard(card) {
    if (!card) return false;
    if (!isUnder13()) return true;
    /* Under-13: G/PG only — no dating, classroom (18+), or marketing ads. */
    if (card.type === TYPE.DATING || card.type === TYPE.CLASSROOM || card.type === TYPE.AD) return false;
    return true;
  }

  function peopleYouMayKnow() {
    /* Fail closed: unknown viewer → nothing. Seeds never appear for real viewers;
       reals never appear for seed viewers. */
    var viewerSt = resolveViewerSeedStatus();
    if (viewerSt !== true && viewerSt !== false) return [];
    var wantSeed = viewerSt === true;
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
        if (profileLooksSeed(rec) !== wantSeed) return;
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

  function shareAuthorBlocked(share) {
    if (!share) return false;
    var blockedUsers = state.blockedShareUserIds || {};
    var blockedProfiles = state.blockedShareProfileIds || {};
    if (share.swiperId && blockedProfiles[String(share.swiperId)]) return true;
    if (share.swiperUserId && blockedUsers[String(share.swiperUserId)]) return true;
    var rec = profileById(share.swiperId);
    if (rec && rec.user_id && blockedUsers[String(rec.user_id)]) return true;
    if (rec && rec.userId && blockedUsers[String(rec.userId)]) return true;
    return false;
  }


  function shareSeedFlag(share, sharer) {
    if (!share) return null;
    if (share.swiperIsSeed === true || share.fromSeed === true) return true;
    if (sharer) {
      var id = String(sharer.id || share.swiperId || "");
      var kindFlag = accountKindMeansSeed(sharer.account_kind || sharer.accountKind);
      if (kindFlag === true) return true;
      if (kindFlag === false) return false;
      if (id && profileSeedById[id] === true) return true;
      if (id && profileSeedById[id] === false) return false;
    }
    if (share.swiperIsSeed === false) return false;
    return null;
  }

  function friendShareCards() {
    if (!getSeeFriendShares()) return [];
    var shares = readJson(localStorage, SHARES_KEY, []);
    if (!Array.isArray(shares)) return [];
    var friends = {};
    friendIds().forEach(function (id) { friends[String(id)] = true; });
    /* Warm server account_kind for friends + share authors we have not classified. */
    var need = friendIds().slice();
    shares.forEach(function (share) {
      if (share && share.swiperId) need.push(String(share.swiperId));
    });
    warmProfileSeedStatuses(need);
    var interests = viewerInterests();
    var out = [];
    /* Fail closed: unknown viewer sees no shares. Seed sandbox ↔ seed shares only;
       real ↔ real only. */
    var viewerSt = resolveViewerSeedStatus();
    if (viewerSt !== true && viewerSt !== false) return [];
    var viewerWantsSeed = viewerSt === true;
    shares.forEach(function (share) {
      if (!share || !share.swiperId || !friends[String(share.swiperId)]) return;
      if (viewerIds().indexOf(String(share.swiperId)) >= 0) return;
      var sharer = profileById(share.swiperId);
      var shareIsSeed = shareSeedFlag(share, sharer);
      if (shareIsSeed == null) return; /* unknown sharer: hide from everyone */
      if (viewerWantsSeed !== shareIsSeed) return;
      if (shareAuthorBlocked(share)) return;
      var tags = terms(share.interests);
      if (!tags.length) tags = terms((share.title || "") + " " + (share.body || ""));
      if (!tags.length) return;
      if (cardTopicFaded({ interests: tags, title: share.title, body: share.body })) return;
      var inInterest = !!(interests.length && overlap(interests, tags));
      var sharerName = String(share.sharerName || share.fromName || (sharer && sharer.displayName) || "A friend").slice(0, 80);
      out.push({
        id: "friend-" + (share.id || share.adId || share.title),
        type: TYPE.FRIEND,
        title: share.title || "A friend shared this",
        body: share.body || "",
        videoUrl: share.videoUrl || "",
        fromName: sharerName,
        handle: share.handle || "",
        profileId: share.swiperId || share.profileId || "",
        interests: tags,
        offInterest: !inInterest,
        /* Friends see sharer name; interest graph stays anonymous (no tag dump). */
        why: "Shared by " + sharerName,
      });
    });
    return out;
  }

  function ensureSiteRooms() {
    writeJson(localStorage, ROOMS_KEY, { host: "Cognation", rooms: SITE_ROOMS });
    return SITE_ROOMS.filter(roomVisible).map(roomCard);
  }

  function groupLane() {
    var api = window.CognationEchoGroups;
    var list = api && typeof api.cards === "function" ? api.cards() : [];
    return Array.isArray(list) ? list : [];
  }

  function buildLanes() {
    var lanes = {};
    lanes[TYPE.CLASSROOM] = visibleClassroomSessions();
    lanes[TYPE.AD] = placedAds();
    lanes[TYPE.CHAT] = ensureSiteRooms();
    lanes[TYPE.FACT] = FACTS.map(function (f) { return { id: f.id, type: TYPE.FACT, title: f.title, body: f.body }; });
    lanes[TYPE.WELLNESS] = WELLNESS.map(function (f) { return { id: f.id, type: TYPE.WELLNESS, title: f.title, body: f.body }; });
    lanes[TYPE.FRIEND] = friendShareCards();
    lanes[TYPE.EVENT] = publicEvents();
    lanes[TYPE.KNOW] = peopleYouMayKnow();
    lanes[TYPE.CONTENT] = towerLiveContentCards();
    lanes[TYPE.MARKET] = marketplaceCards();
    lanes[TYPE.GROUP] = groupLane();
    Object.keys(lanes).forEach(function (type) {
      lanes[type] = omitPassed((lanes[type] || []).filter(ageSafeFeaturedCard).filter(function (card) {
        /* Repeated lefts fade a topic out of the deck (friend shares handled separately). */
        if (type === TYPE.FRIEND) return true;
        return !cardTopicFaded(card);
      }));
    });
    var dating = omitPassed(datingPool().filter(ageSafeFeaturedCard));
    return { lanes: lanes, dating: dating };
  }

  function getMode() {
    try { return sessionStorage.getItem(MODE_KEY) === MODE.PROFESSIONAL ? MODE.PROFESSIONAL : MODE.PERSONAL; } catch (e) { return MODE.PERSONAL; }
  }
  function setMode(mode) {
    var next = mode === MODE.PROFESSIONAL ? MODE.PROFESSIONAL : MODE.PERSONAL;
    try { sessionStorage.setItem(MODE_KEY, next); } catch (e) {}
    emit("cognation:commune-mode-change", { mode: next });
    return next;
  }

  function viewerInterestPhrases() {
    var out = [];
    function add(v) {
      if (Array.isArray(v)) { v.forEach(add); return; }
      String(v || "").split(/[,;]/).forEach(function (t) {
        t = norm(t);
        if (t && out.indexOf(t) < 0) out.push(t);
      });
    }
    add(getMemberProfile().interests);
    var personal = viewerPersonal();
    if (personal) add(personal.interests);
    return out.slice(0, 4);
  }
  function viewerField() {
    var p = getMemberProfile();
    return norm(p.field || p.profession || p.industry) || viewerInterestPhrases()[0] || "";
  }
  function slug(t) { return norm(t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function proPlaceholder(type, id, title, body, why, minAge) {
    return { id: id, type: type, title: title, body: body, why: why, demo: true, rating: "G", minAge: minAge || 0 };
  }

  /** Professional pages only — never personal friends-you-may-know. Ranked by shared interest count. */
  function professionalsYouMightKnow() {
    var mine = {};
    viewerIds().forEach(function (id) { mine[String(id)] = true; });
    var session = currentSession();
    var accounts = window.CognationAccounts;
    if (session && session.username && accounts && typeof accounts.getProfilesForUsername === "function") {
      try {
        (accounts.getProfilesForUsername(session.username) || []).forEach(function (p) { if (p && p.id) mine[String(p.id)] = true; });
      } catch (eOwn) {}
    }
    var interests = viewerInterestPhrases();
    var field = viewerField();
    if (field && interests.indexOf(field) < 0) interests.unshift(field);
    var out = [];
    /* Live site: only real professional pages from the server (supabase-social).
       The local registry (cognation.profiles.v1) holds demo records such as
       prof-alexa-professional whose handle has no server page, so Open their page
       landed on the viewer's own Tower. */
    var social = window.CognationSupabaseSocial;
    var each = eachProfile;
    if (liveSignedIn()) {
      each = function (fn) {
        var rows = social && typeof social.listProfiles === "function" ? social.listProfiles() || [] : [];
        rows.forEach(function (row) {
          if (!row) return;
          fn({ id: row.id, kind: row.kind, handle: row.handle, displayName: row.display_name, bio: row.bio || "", userId: row.user_id });
        });
      };
    }
    each(function (rec) {
      if (!rec || rec.kind !== "professional" || mine[String(rec.id)] || isFollowing(rec.id)) return;
      var name = rec.displayName || rec.handle;
      if (!name) return;
      var tags = terms([rec.field, rec.industry, rec.headline, rec.bio, rec.interests].join(" "));
      var shared = interests.filter(function (phrase) {
        var words = terms(phrase);
        return words.length && words.every(function (t) { return tags.indexOf(t) >= 0; });
      });
      out.push({
        id: "pro-know-" + rec.id,
        type: PRO.KNOW,
        profileId: rec.id,
        record: rec,
        handle: String(rec.handle || "").replace(/^@/, ""),
        title: name,
        body: rec.headline || rec.bio || "A professional page on Cognation.",
        why: shared.length ? "Shares your interest: " + shared[0] : "A professional page you don't follow yet.",
        rating: "G",
        minAge: 13,
        score: shared.length,
      });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    /* Live site: zero real professional pages means no "you might know" card at
       all (never the fallback). The fallback stays only for the signed-out local
       preview, unchanged from main. */
    if (!out.length && !liveSignedIn()) {
      out.push(proPlaceholder(PRO.KNOW, "pro-know-placeholder", "Professionals you might know",
        "Professional pages that match your field show here once real pages connect.",
        "Matched by shared field and interests only.", 13));
    }
    return out;
  }

  function professionalCardAllowed(card) {
    if (!card || !PRO_MARK[card.type]) return false;
    var age = getMemberAge();
    var min = Number(card.minAge) || 0;
    if (min >= 18 && (age == null || age < min)) return false;
    if (min && age != null && age < min) return false;
    if (isUnder13() && ["G", "PG"].indexOf(String(card.rating || "G")) < 0) return false;
    return true;
  }

  function buildProfessionalLanes() {
    var field = viewerField();
    var fieldName = field || "your field";
    var fieldWhy = field ? "Matches the field on your profile: " + field : "Add your field to your profile to tune this.";
    var interests = viewerInterestPhrases();
    var lanes = {};
    lanes[PRO.WEBINAR] = PRO_WEBINARS.map(function (w) {
      return proPlaceholder(PRO.WEBINAR, w.id, w.title, w.body, "Cognation-hosted. Every Professional deck sees it.");
    });
    lanes[PRO.KNOW] = professionalsYouMightKnow();
    lanes[PRO.RESEARCH] = (interests.length ? interests : [""]).map(function (t) {
      return proPlaceholder(PRO.RESEARCH, "pro-research-" + (slug(t) || "general"),
        t ? "Research papers: " + t : "Research papers by interest",
        "Papers matched to " + (t ? "\u201c" + t + "\u201d" : "the interests on your profile") + " show here once a research feed connects.",
        t ? "Matches your interest: " + t : "Add interests to your profile to tune this.");
    });
    lanes[PRO.AUCTION] = [proPlaceholder(PRO.AUCTION, "pro-auction-weekly", "Weekly Cognation webinar + bot auction",
      "Each week Cognation hosts a webinar, then a bot auction on starter projects for sale.",
      "Weekly Cognation event. Same card for everyone 18+.", 18)];
    lanes[PRO.PODCAST] = PRO_PODCASTS.map(function (w) {
      return proPlaceholder(PRO.PODCAST, w.id, w.title, w.body, "Picked by topic: ethics, async work, continuing education.");
    });
    lanes[PRO.FIELD] = [proPlaceholder(PRO.FIELD, "pro-field-" + (slug(field) || "general"), "Field update: " + fieldName,
      "News and changes in " + fieldName + " show here once a field feed connects.", fieldWhy)];
    lanes[PRO.POP] = [proPlaceholder(PRO.POP, "pro-popculture-" + (slug(field) || "general"), "Pop culture \u00d7 " + fieldName,
      "Pop-culture moments that touch " + fieldName + " show here once a feed connects.", fieldWhy)];
    Object.keys(lanes).forEach(function (type) {
      lanes[type] = omitPassed(lanes[type].filter(professionalCardAllowed));
    });
    return lanes;
  }

  /** Strict 1:1 round-robin across Professional types that have cards. */
  function paceProfessional(lanes, count) {
    var out = [];
    var cursors = {};
    var live = PRO_ORDER.filter(function (t) { return lanes && lanes[t] && lanes[t].length; });
    var target = count || 18;
    for (var n = 0; live.length && out.length < target; n++) {
      var type = live[n % live.length];
      var list = lanes[type];
      var i = cursors[type] || 0;
      cursors[type] = i + 1;
      var card = clone(list[i % list.length]);
      card.type = type;
      if (i >= list.length) card.id = String(card.id) + "-r" + i;
      out.push(card);
    }
    return out;
  }

  function sampleDeck(count, mode) {
    if ((mode || getMode()) === MODE.PROFESSIONAL) {
      return paceProfessional(buildProfessionalLanes(), count || 18);
    }
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
    classroomId: "",
    /* Live chat_rooms SQL path (step 2b). chatSchema: null | "ok" | "missing" */
    liveRoom: false,
    roomSqlId: "",
    chatSchema: null,
    liveMessages: [],
    /* Step 2c: viewer-local hide after Block; Reported markers. */
    roomBlockedUserIds: {},
    roomReportedMsgIds: {},
    roomHiddenMsgIds: {},
    blockedShareUserIds: {},
    blockedShareProfileIds: {},
  };

  function typeLabel(t) {
    if (PRO_MARK[t]) return PRO_MARK[t];
    switch (t) {
      case TYPE.CLASSROOM: return "Classroom";
      case TYPE.AD: return "Advertisement";
      case TYPE.CHAT: return "Chatroom";
      case TYPE.FACT: return "Fact";
      case TYPE.WELLNESS: return "Wellness";
      case TYPE.FRIEND: return "From a friend";
      case TYPE.EVENT: return "Public event";
      case TYPE.KNOW: return "People you may know";
      case TYPE.DATING: return "Dating";
      case TYPE.CONTENT: return "Content";
      case TYPE.MARKET: return "Marketplace";
      case TYPE.GROUP: return "Group";
      default: return "Echo";
    }
  }

  function syncDatingVisibility() {
    if (!state.shell) return;
    var entry = state.shell.querySelector("[data-dating-entry]") ||
      (document.querySelector && document.querySelector("[data-dating-entry]"));
    if (!datingSwitchOn()) {
      if (entry) entry.hidden = true;
      state.shell.removeAttribute("data-dating-visible");
      if (getSeeDating()) setSeeDating(false);
      syncFriendSharesVisibility();
      return;
    }
    if (entry) entry.hidden = false;
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
      else hint.textContent = "Dating is on. Local dating cards share the featured mix one-to-one with Classroom, ads, chat rooms, and content.";
    }
    syncFriendSharesVisibility();
  }

  function syncFriendSharesVisibility() {
    if (!state.shell) return;
    var on = getSeeFriendShares();
    if (on) state.shell.setAttribute("data-friend-shares-visible", "true");
    else state.shell.removeAttribute("data-friend-shares-visible");
    var toggle = state.shell.querySelector("[data-commune-see-friend-shares]");
    if (toggle && toggle.type === "checkbox") {
      toggle.checked = on;
      toggle.setAttribute("aria-checked", on ? "true" : "false");
    }
    var hint = state.shell.querySelector("[data-commune-friend-shares-hint]");
    if (hint) {
      hint.textContent = on
        ? "On: friends' shares can appear. Sharer name shows on the card; interest graph stays private. Off-interest shares stay rare (at most 1 in 6)."
        : "Off: friends' shares stay out of your ECHO deck. Turn on anytime in Algorithm Manager.";
    }
  }

  function refreshBlockedShares() {
    state.blockedShareUserIds = state.blockedShareUserIds || {};
    state.blockedShareProfileIds = state.blockedShareProfileIds || {};
    if (!window.CognationBlock || typeof window.CognationBlock.listMyBlocks !== "function") return;
    try {
      window.CognationBlock.listMyBlocks().then(function (rows) {
        var map = {};
        (Array.isArray(rows) ? rows : []).forEach(function (row) {
          if (row && row.user_id) map[String(row.user_id)] = true;
        });
        state.blockedShareUserIds = map;
      }, function () {});
    } catch (eBlk) {}
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

  /* Join refused with no_birth: same message plus #141's Add birth month button
     (opens js/birth-prompt.js). After an adult month saves, Join works again
     without a reload (cognation:birth-saved updates the age below). */
  function openBirthPrompt() {
    var bp = window.CognationBirthPrompt;
    if (bp && typeof bp.open === "function") bp.open();
    else setStatus("Add your birth year and month in your profile.");
  }
  function setBirthNeededStatus(msg) {
    setStatus(msg);
    if (!state.statusEl) return;
    state.statusEl.appendChild(document.createTextNode(" "));
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-primary btn-small";
    btn.setAttribute("data-commune-add-birth", "");
    btn.textContent = "Add birth month";
    btn.addEventListener("click", openBirthPrompt);
    state.statusEl.appendChild(btn);
  }
  function showJoinError(mapped) {
    if (mapped && mapped.code === "no_birth") setBirthNeededStatus(mapped.message);
    else setStatus(mapped ? mapped.message : "");
  }
  document.addEventListener("cognation:birth-saved", function (ev) {
    var d = (ev && ev.detail) || {};
    var y = parseInt(d.year, 10), m = parseInt(d.month, 10);
    if (!y || !m) return;
    var now = new Date();
    var age = now.getFullYear() - y - (now.getMonth() + 1 < m ? 1 : 0);
    setDatingBirthAge(age);
    if (state.statusEl && state.statusEl.querySelector("[data-commune-add-birth]")) setStatus("");
  });

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
    if (card.type === TYPE.CLASSROOM) {
      el.setAttribute("data-classroom", "card");
    }
    if (card.type === TYPE.DATING) {
      el.setAttribute("data-dating-content", "true");
      el.setAttribute("data-dating-opt-in", "true");
    }
    if (card.type === TYPE.AD && card.handle) {
      el.setAttribute("data-professional-handle", card.handle);
    }
    el.setAttribute("tabindex", "0");
    var html = '<p class="commune-card-kicker">' + escapeHtml(typeLabel(card.type)) + "</p>";
    if (PRO_MARK[card.type]) {
      el.setAttribute("data-professional-card", "");
      var badge = "";
      if (card.demo) {
        badge = '<span class="seedops-demo-badge" data-account-kind="placeholder" title="Placeholder card until a real feed connects.">' + DEMO_LABEL + "</span>";
      } else if (card.record && window.CognationSeedOpsBadge && window.CognationSeedOpsBadge.badgeHtml) {
        try { badge = window.CognationSeedOpsBadge.badgeHtml(card.record) || ""; } catch (eB) { badge = ""; }
      }
      html = '<div class="commune-card-kicker commune-pro-kicker"><span class="commune-type-mark" data-type-mark="' +
        escapeHtml(card.type.replace(/^pro-/, "")) + '">' + escapeHtml(PRO_MARK[card.type]) + "</span>" + badge + "</div>";
      html += '<h4 class="commune-card-title">' + escapeHtml(card.title || "") + "</h4>";
      if (card.body) html += '<p class="commune-card-body">' + escapeHtml(card.body) + "</p>";
      if (card.why) html += '<p class="commune-card-meta commune-card-why" data-card-why>Why you see this: ' + escapeHtml(card.why) + "</p>";
      if (card.type === PRO.KNOW && card.handle) {
        html += '<button type="button" class="btn btn-secondary" data-commune-open-profile>Open their page</button>';
      }
      el.innerHTML = html;
      return el;
    }
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
      if (card.type === TYPE.MARKET) html += marketCardHtml(card);
      if (card.type === TYPE.AD && card.handle) {
        html += '<button type="button" class="btn btn-secondary" data-commune-open-profile>Open their page</button>';
        html += '<p class="commune-card-meta">Book on the calendar, or follow this professional page.</p>';
      }
      if (card.type === TYPE.CHAT) {
        if (liveChatEligible()) {
          html += '<button type="button" class="btn btn-primary" data-commune-enter-sim>Enter room</button>';
          html += '<p class="commune-card-meta">Live group chat — up to 12 people. Keep it kind.</p>';
        } else {
          /* No local demo room (standing rule): live rooms only. */
          html += '<button type="button" class="btn btn-primary" data-commune-enter-sim>Enter room</button>';
          html += '<p class="commune-card-meta">Live group chat — sign in to join (up to 12 people).</p>';
        }
      }
      if (card.type === TYPE.CLASSROOM) {
        html += '<button type="button" class="btn btn-primary" data-commune-enter-classroom>Open session</button>';
        html += '<p class="commune-card-meta">Life skills · ~18+</p>';
      }
      if (card.liveJoin) html += '<button type="button" class="btn btn-primary" data-live-echo-join>Join</button>';
      if (card.type === TYPE.CONTENT) html += '<span class="commune-card-badge">Live</span>';
      if (card.type === TYPE.AD) html += '<span class="commune-card-badge commune-card-badge--ad">Ad</span>';
    }
    el.innerHTML = html;
    return el;
  }

  function wireMarketPay(el, card) {
    var btn = el && el.querySelector("[data-market-pay]");
    if (!btn || btn.getAttribute("data-market-pay-wired")) return;
    btn.setAttribute("data-market-pay-wired", "1");
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      payHighBid(card).then(function (res) {
        var note = el.querySelector("[data-market-bid-note]");
        if (note) note.textContent = (res && res.message) || "Apple Pay isn't set up. No payment was taken.";
        if (res && res.paid === true) rebuildDeck();
      });
    });
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
    var bidBtn = el.querySelector("[data-market-bid]");
    if (bidBtn) bidBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var raise = el.querySelector("[data-market-raise]");
      var typed = raise && String(raise.value || "").trim();
      if (!raiseBid(card.id, typed ? Number(typed) : card.ask, card.ask)) return;
      bidBtn.textContent = marketBidLabel(card);
      bidBtn.setAttribute("aria-pressed", "true");
      var note = el.querySelector("[data-market-bid-note]");
      var high = liveHigh(card.id);
      if (note && high) note.textContent = "High bid " + marketMoney(high.amount) + ". Pay with Apple Pay within 24 hours. Nothing is charged until then.";
    });
    wireMarketPay(el, card);
    var joinLive = el.querySelector("[data-live-echo-join]");
    if (joinLive) joinLive.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var tab = document.getElementById("tab-tower");
      if (tab) tab.click();
      if (window.CognationLive && window.CognationLive.open) window.CognationLive.open();
    });
    var sim = el.querySelector("[data-commune-enter-sim]");
    if (sim) sim.addEventListener("click", function (ev) { ev.stopPropagation(); openRoom(card.id, true); });
    var enterClass = el.querySelector("[data-commune-enter-classroom]");
    if (enterClass) enterClass.addEventListener("click", function (ev) {
      ev.stopPropagation();
      openClassroom(card.id, true);
    });
    var open = el.querySelector("[data-commune-open-profile]");
    if (open) open.addEventListener("click", function (ev) { ev.stopPropagation(); openProfessionalPage(card); });
    if (card.type === TYPE.CLASSROOM) {
      wireClassroomCardClick(el, card, openClassroom);
    } else if (card.type === PRO.AUCTION) {
      wireClassroomCardClick(el, card, function () { openAuction(card, true); });
    }
    /* Alexa's rule: an ECHO card opens its own full-screen window or a Tower profile, nothing else. */
    if (card.type === TYPE.CHAT) {
      wireClassroomCardClick(el, card, function () { openRoom(card.id, true); });
    }
    if ((card.type === TYPE.KNOW || card.type === TYPE.FRIEND) && (card.profileId || card.handle)) {
      el.setAttribute("data-commune-opens-profile", "");
      wireClassroomCardClick(el, card, function () { openPersonTower(card); });
    }
    /* Event / Content: the poster's Tower by handle (unchanged). */
    if ((card.type === TYPE.EVENT || card.type === TYPE.CONTENT) && card.handle) {
      el.setAttribute("data-commune-opens-profile", "");
      wireClassroomCardClick(el, card, function () { openProfessionalPage(card); });
    }
    var groups = window.CognationEchoGroups;
    if (groups && typeof groups.bind === "function") groups.bind(el, card);
    if (card.type === TYPE.AD && card.handle) {
      el.addEventListener("click", function (ev) {
        if (ev.target.closest("button, a, input, video, iframe")) return;
        openProfessionalPage(card);
      });
    }
    armAdMax(el, card);
  }

  /* Whole Classroom / Auction card opens its full view on tap/click, like ad cards open
     their page. Controls inside the card keep their own action, and a drag
     that turned into a swipe attempt (>= 10px) is not a tap. */
  function wireClassroomCardClick(el, card, open) {
    if (!el || !card) return;
    el.addEventListener("click", function (ev) {
      var t = ev && ev.target;
      if (t && t.closest && t.closest("button, a, input, textarea, label, video, iframe")) return;
      if (Math.abs(state.lastDragDx || 0) >= 10) return;
      open(card.id, true);
    });
  }

  /* Person cards: the person's Personal Tower, except a card that came from a
     Professional item, which opens that Pro page. */
  function personCardIsPro(card) {
    if (!card) return false;
    if (String(card.type || "").indexOf("pro-") === 0) return true;
    if (card.record && (card.record.kind === "professional" || card.record._profileKind === "professional")) return true;
    var rec = card.profileId ? profileById(card.profileId) : null;
    return !!(rec && rec.kind === "professional");
  }
  function openPersonTower(card) {
    if (!card) return false;
    if (personCardIsPro(card)) { openProfessionalPage(card); return "pro"; }
    /* Profile id first: #tower-profile-<id> resolves to exactly that (personal) page. */
    var target = String(card.profileId || card.handle || "").replace(/^@/, "");
    if (!target) return false;
    if (window.CognationTowerOpenProfile) {
      try { window.CognationTowerOpenProfile(target); } catch (eT) {}
    } else {
      try { location.hash = "tower-profile-" + encodeURIComponent(target); } catch (eH) {}
    }
    return "personal";
  }

  function openProfessionalPage(card) {
    var handle = String(card.handle || "").replace(/^@/, "");
    if (!handle) return;
    try { location.hash = "tower-profile-" + handle; } catch (e) {}
    if (window.CognationTowerOpenProfile) {
      try { window.CognationTowerOpenProfile(handle); } catch (e2) {}
    }
  }

  function roomEl() {
    if (state.roomPanel && state.roomPanel.isConnected) return state.roomPanel;
    var found = state.shell && state.shell.querySelector("[data-commune-room]");
    if (found) state.roomPanel = found;
    return found || null;
  }

  /* Full-screen overlay above the deck. While open, body.commune-room-view-open
     lifts the trap that kept the old panel inside the card (the shell's
     backdrop-filter and the tab section's low z-index, see styles.css), locks body
     scroll, keeps focus inside, and Escape closes. On close, focus returns to what
     opened it. */
  function setRoomOverlay(panel, on) {
    if (!panel) return;
    var isOn = panel.hasAttribute("data-commune-room-overlay");
    if (on === isOn) return;
    if (on) {
      state.roomReturnFocus = document.activeElement;
      panel.setAttribute("data-commune-room-overlay", "");
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
      var t = panel.querySelector("[data-commune-room-title]");
      if (t) { if (!t.id) t.id = "commune-room-title"; panel.setAttribute("aria-labelledby", t.id); }
      document.body.classList.add("commune-room-view-open");
      document.addEventListener("keydown", onRoomOverlayKey, true);
      var first = panel.querySelector("[data-commune-room-head-back]");
      try { if (first) first.focus({ preventScroll: true }); } catch (eF) {}
    } else {
      panel.removeAttribute("data-commune-room-overlay");
      panel.removeAttribute("role");
      panel.removeAttribute("aria-modal");
      document.body.classList.remove("commune-room-view-open");
      document.removeEventListener("keydown", onRoomOverlayKey, true);
      var back = state.roomReturnFocus;
      state.roomReturnFocus = null;
      try { if (back && back.isConnected && back.focus) back.focus({ preventScroll: true }); } catch (eB) {}
    }
  }
  function onRoomOverlayKey(ev) {
    var panel = roomEl();
    if (!panel || !panel.hasAttribute("data-commune-room-overlay")) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      closeRoom();
      return;
    }
    if (ev.key === "Tab") {
      var items = Array.prototype.filter.call(
        panel.querySelectorAll("button, [href], textarea, input, select, [tabindex]:not([tabindex='-1'])"),
        function (el) { return !el.disabled && el.getClientRects().length; }
      );
      if (!items.length) return;
      var firstEl = items[0], lastEl = items[items.length - 1];
      if (ev.shiftKey && (document.activeElement === firstEl || !panel.contains(document.activeElement))) {
        ev.preventDefault(); lastEl.focus();
      } else if (!ev.shiftKey && (document.activeElement === lastEl || !panel.contains(document.activeElement))) {
        ev.preventDefault(); firstEl.focus();
      }
    }
  }

  function showSubpanel(kind) {
    /* kind: "" | "room" | "classroom" — hides deck when either panel is open */
    var room = roomEl();
    var classroom = state.shell && state.shell.querySelector(CLASSROOM_PANEL_SEL);
    var deck = state.deck;
    var actions = state.shell && state.shell.querySelector(".commune-swipe-actions");
    var on = kind === "classroom";
    if (room) room.hidden = kind !== "room";
    /* Rooms, classrooms and auctions open as a full-screen overlay above the deck
       (the deck and its card stay put underneath, so Back returns to the same card). */
    if (room) setRoomOverlay(room, kind === "room");
    if (classroom) classroom.hidden = kind !== "classroom";
    if (deck) deck.hidden = on;
    if (actions) actions.hidden = on;
    /* Full views hide all deck swipe chrome; Back to deck restores it. */
    [".commune-swipe-hint", "[data-commune-dots]", "[data-commune-index]"].forEach(function (sel) {
      var chrome = state.shell && state.shell.querySelector(sel);
      if (chrome) chrome.hidden = on;
    });
  }

  function showRoom(on) {
    if (on) {
      state.classroomId = "";
      showSubpanel("room");
    } else if (!state.classroomId) {
      showSubpanel("");
    }
  }

  function showClassroom(on) {
    if (on) {
      state.roomId = "";
      showSubpanel("classroom");
    } else if (!state.roomId) {
      showSubpanel("");
    }
  }


  /* ---- Live chat_rooms (SQL / RPCs) — step 2b -------------------------------- */
  function supabaseLiveSession() {
    var sb = window.CognationSupabase;
    if (!sb || typeof sb.configured !== "function" || !sb.configured()) return null;
    if (typeof sb.getSession !== "function") return null;
    var sess = sb.getSession();
    if (!sess || !sess.access_token) return null;
    return sess;
  }

  function liveChatEligible() {
    /* Signed-in Supabase session + schema not known-missing. */
    if (!supabaseLiveSession()) return false;
    if (state.chatSchema === "missing") return false;
    return typeof window.CognationSupabase.rpc === "function"
      && typeof window.CognationSupabase.rest === "function";
  }

  function chatErrorText(err) {
    var parts = [];
    if (!err) return "";
    if (err.message) parts.push(String(err.message));
    var body = err.body;
    if (body && typeof body === "object") {
      ["message", "details", "hint", "code", "error", "msg"].forEach(function (k) {
        if (body[k]) parts.push(String(body[k]));
      });
    } else if (typeof body === "string") {
      parts.push(body);
    }
    return parts.join(" ");
  }

  function isChatSchemaMissing(err) {
    var text = chatErrorText(err);
    if (!text) return false;
    var tableGone =
      /chat_rooms|chat_room_members|chat_room_messages/i.test(text) &&
      /(does not exist|PGRST205|PGRST116|42P01|schema cache|Could not find the table|relation)/i.test(text);
    var rpcGone =
      /Could not find the function.*join_chat_room/i.test(text) ||
      (/PGRST202/.test(text) && /join_chat_room/i.test(text));
    return tableGone || rpcGone;
  }

  function mapChatRoomError(err) {
    var text = chatErrorText(err);
    var codes = [
      ["no_birth", "Add your birth year and month in your profile to join chat rooms"],
      ["under_13", "Chat rooms are for members 13 and up."],
      ["under_18", "Classrooms are for members 18 and up."],
      ["rating_blocked", "This room's rating is not available for your account."],
      ["blocked", "You can't join this room because of a block."],
      ["room_full", "This room is full. Try another room or come back later."],
      ["not_a_member", "Join the room before posting."],
      ["room_not_found", "That room is not available right now."],
      ["bad_body", "Message must be 1–500 characters."],
      ["Sign in first", "Sign in to join the live room."],
      /* chat_room_members RLS self-recursion until 20261016_chat_room_members_rls_fix.sql runs. */
      ["42P17", "Live rooms are being fixed. Try again soon."],
      ["infinite recursion", "Live rooms are being fixed. Try again soon."],
    ];
    var i;
    if (text.indexOf("under_13") !== -1 && liveBirthMissing()) {
      return { code: "no_birth", message: codes[0][1] + "." };
    }
    /* Full-room message uses the room's real cap from the server (room_full:<max_members>). */
    var full = text.match(/room_full:(\d+)/);
    if (full) {
      return { code: "room_full", message: "This room is full (" + full[1] + " people). Try another room or come back later." };
    }
    for (i = 0; i < codes.length; i++) {
      if (text.indexOf(codes[i][0]) !== -1) {
        return { code: codes[i][0], message: codes[i][1] };
      }
    }
    return { code: "unknown", message: "Could not open the live room. Try again in a moment." };
  }

  function currentLiveUserId() {
    var sess = supabaseLiveSession();
    if (sess && sess.user && sess.user.id) return String(sess.user.id);
    try {
      var auth = window.CognationAuth && typeof window.CognationAuth.getSession === "function"
        ? window.CognationAuth.getSession()
        : null;
      if (auth && auth.supabaseUserId) return String(auth.supabaseUserId);
    } catch (eUid) {}
    return "";
  }

  function currentReporterProfileId() {
    try {
      var auth = window.CognationAuth && typeof window.CognationAuth.getSession === "function"
        ? window.CognationAuth.getSession()
        : null;
      if (auth && auth.activeProfileId) return String(auth.activeProfileId);
    } catch (ePid) {}
    return "";
  }

  function isRoomAuthorBlocked(userId) {
    if (!userId) return false;
    return !!state.roomBlockedUserIds[String(userId)];
  }

  function filterBlockedLiveMessages(messages) {
    return (messages || []).filter(function (msg) {
      if (!msg) return false;
      if (isRoomAuthorBlocked(msg.authorUserId)) return false;
      if (msg.id && state.roomHiddenMsgIds[String(msg.id)]) return false;
      return true;
    });
  }

  function hideLiveMessageLocally(msgId) {
    msgId = String(msgId || "");
    if (!msgId) return;
    state.roomHiddenMsgIds[msgId] = true;
    state.liveMessages = filterBlockedLiveMessages(state.liveMessages);
    paintLiveLog(state.liveMessages);
  }

  function reporterLooksRealClient() {
    try {
      var auth = window.CognationAuth && typeof window.CognationAuth.getSession === "function"
        ? window.CognationAuth.getSession()
        : null;
      if (!auth) return true;
      if (auth.accountKind === "seed" || auth.accountKind === "ops" || auth.isSeed) return false;
      return true;
    } catch (eReal) {
      return true;
    }
  }

  function roomMessageMoreHtml(msg) {
    /* Live room only; needs an author to Block/Report. No menu on own lines. No DM path. */
    if (!state.liveRoom) return "";
    var uid = msg && msg.authorUserId ? String(msg.authorUserId) : "";
    if (!uid) return "";
    var me = currentLiveUserId();
    if (me && uid === me) return "";
    var mid = msg && msg.id ? String(msg.id) : "";
    var reported = !!(mid && state.roomReportedMsgIds[mid]);
    var reportBtn = reported
      ? '<button type="button" class="news-report-option" disabled data-commune-room-reported>Reported</button>'
      : '<button type="button" class="news-report-option" data-commune-room-report data-message-id="' +
        escapeHtml(mid) +
        '" data-author-user-id="' +
        escapeHtml(uid) +
        '">Report</button>';
    var blockBtn =
      '<button type="button" class="news-report-option" data-commune-room-block data-message-id="' +
      escapeHtml(mid) +
      '">Block</button>';
    return (
      '<button type="button" class="commune-room-more" data-commune-room-more aria-haspopup="true" aria-expanded="false" aria-label="More for this message">⋯</button>' +
      '<div class="news-report-menu commune-room-report-menu" data-commune-room-menu hidden>' +
      reportBtn +
      blockBtn +
      "</div>"
    );
  }

  function hideLiveMessagesFromAuthor(userId) {
    userId = String(userId || "");
    if (!userId) return;
    state.roomBlockedUserIds[userId] = true;
    state.liveMessages = filterBlockedLiveMessages(state.liveMessages);
    paintLiveLog(state.liveMessages);
  }

  function reportLiveRoomMessage(msgId, authorUserId) {
    msgId = String(msgId || "");
    authorUserId = String(authorUserId || "");
    if (!msgId) return Promise.resolve({ ok: false, error: "missing" });
    if (state.roomReportedMsgIds[msgId]) return Promise.resolve({ ok: true, already: true });

    var msg = null;
    (state.liveMessages || []).forEach(function (m) {
      if (m && String(m.id) === msgId) msg = m;
    });
    var body = msg ? String(msg.body || "") : "";
    var authorName = msg ? String(msg.senderName || "") : "";

    /* Existing Investigator queue (CognationModeration). */
    try {
      if (window.CognationModeration && typeof window.CognationModeration.enqueue === "function") {
        window.CognationModeration.enqueue({
          postId: msgId,
          reason: "harmful",
          post: {
            id: msgId,
            authorName: authorName,
            kind: "chat_room_message",
            body: body.slice(0, 500),
            createdAt: (msg && msg.at) || new Date().toISOString(),
            reporterNote: "Chat room message report",
          },
        });
      }
    } catch (eMod) {}

    function finish(hidden) {
      state.roomReportedMsgIds[msgId] = true;
      /* Locked: human report hides for everyone — reporter sees it gone immediately. */
      if (hidden) hideLiveMessageLocally(msgId);
      else paintLiveLog(state.liveMessages);
      return { ok: true, hidden: !!hidden };
    }

    var sb = window.CognationSupabase;
    if (!sb || typeof sb.rpc !== "function") {
      return Promise.resolve(finish(reporterLooksRealClient()));
    }

    return sb
      .rpc("report_chat_room_message", {
        p_message_id: msgId,
        p_reason: "harmful",
      })
      .then(
        function (row) {
          var hidden = !!(row && (row.hidden_message === true || row.hidden_message === "true"));
          if (!hidden && row && row.reporter_is_seed === false) hidden = true;
          return finish(hidden);
        },
        function (err) {
          var text = chatErrorText(err);
          if (/seed_report_cap/i.test(text)) {
            setStatus("Daily report limit reached for demo accounts.");
            return { ok: false, error: "seed_report_cap" };
          }
          if (/cannot_report_own/i.test(text)) {
            setStatus("You can't report your own message.");
            return { ok: false, error: "cannot_report_own" };
          }
          /* RPC/table missing: still mark Reported; hide locally if reporter looks real. */
          return finish(reporterLooksRealClient());
        }
      );
  }

  function blockLiveRoomAuthor(userId) {
    userId = String(userId || "");
    if (!userId) return Promise.resolve({ ok: false });
    if (!window.CognationBlock || typeof window.CognationBlock.blockUser !== "function") {
      hideLiveMessagesFromAuthor(userId);
      setStatus("Blocked — their messages are hidden for you.");
      return Promise.resolve({ ok: true, local: true });
    }
    return window.CognationBlock.blockUser(userId).then(
      function () {
        hideLiveMessagesFromAuthor(userId);
        setStatus("Blocked — their messages are hidden for you.");
        /* Server RLS already hides blocked authors on next fetch. */
        if (state.liveRoom && state.roomSqlId) {
          return fetchLiveMessages(state.roomSqlId).then(
            function (messages) {
              state.liveMessages = filterBlockedLiveMessages(messages);
              paintLiveLog(state.liveMessages);
              return { ok: true };
            },
            function () {
              return { ok: true };
            }
          );
        }
        return { ok: true };
      },
      function () {
        setStatus("Couldn't block right now. Try again.");
        return { ok: false };
      }
    );
  }

  function seedBadgeForAuthor(author) {
    if (!author) return "";
    var rec = {
      accountKind: author.account_kind || author.accountKind || "real",
      handle: author.handle || "",
      display_name: author.display_name || author.displayName || "",
      seedFleetId: author.seed_fleet_id || author.seedFleetId || "",
      isSeed: author.account_kind === "seed" || author.accountKind === "seed",
      isOpsBot: author.account_kind === "ops" || author.accountKind === "ops",
    };
    if (window.CognationSeedOpsBadge && typeof window.CognationSeedOpsBadge.badgeHtml === "function") {
      try {
        return window.CognationSeedOpsBadge.badgeHtml(rec) || "";
      } catch (eB) {}
    }
    if (rec.isOpsBot) {
      return '<span class="seedops-demo-badge" role="status" data-account-kind="ops">Ops · demo</span>';
    }
    if (rec.isSeed || /^seed-/.test(String(rec.handle || "").toLowerCase())) {
      return '<span class="seedops-demo-badge" role="status" data-account-kind="seed">Demo · seed</span>';
    }
    return "";
  }

  function mapLiveMessage(row) {
    var author = (row && row.author) || {};
    var name = author.display_name || author.handle || "Member";
    return {
      id: row.id,
      senderName: name,
      body: row.body || "",
      at: row.created_at || "",
      authorUserId: row.author_user_id || "",
      authorProfileId: row.author_profile_id || (author.id || ""),
      accountKind: author.account_kind || "real",
      handle: author.handle || "",
      seedFleetId: author.seed_fleet_id || "",
      author: author,
    };
  }

  function fetchLiveMessages(sqlId) {
    var sb = window.CognationSupabase;
    var q =
      "select=id,body,created_at,author_user_id,author_profile_id," +
      "author:profiles!author_profile_id(id,display_name,handle,account_kind,seed_fleet_id)" +
      "&room_id=eq." + encodeURIComponent(sqlId) +
      "&order=created_at.asc&limit=100";
    return sb.rest("chat_room_messages", { query: q }).then(
      function (rows) {
        state.chatSchema = "ok";
        return (Array.isArray(rows) ? rows : []).map(mapLiveMessage);
      },
      function (err) {
        if (isChatSchemaMissing(err)) {
          state.chatSchema = "missing";
          throw err;
        }
        /* Embed may fail on older PostgREST; fall back without author join. */
        var plain =
          "select=id,body,created_at,author_user_id,author_profile_id" +
          "&room_id=eq." + encodeURIComponent(sqlId) +
          "&order=created_at.asc&limit=100";
        return sb.rest("chat_room_messages", { query: plain }).then(function (rows) {
          state.chatSchema = "ok";
          return (Array.isArray(rows) ? rows : []).map(mapLiveMessage);
        });
      }
    );
  }

  function joinLiveRoom(sqlId) {
    return window.CognationSupabase.rpc("join_chat_room", { p_room_id: sqlId }).then(
      function (row) {
        state.chatSchema = "ok";
        return row;
      },
      function (err) {
        if (isChatSchemaMissing(err)) state.chatSchema = "missing";
        throw err;
      }
    );
  }

  function leaveLiveRoom(sqlId) {
    if (!sqlId || !liveChatEligible()) return Promise.resolve();
    return window.CognationSupabase.rpc("leave_chat_room", { p_room_id: sqlId }).then(
      function () { return true; },
      function () { return false; }
    );
  }

  function postLiveMessage(sqlId, body) {
    return window.CognationSupabase.rpc("post_chat_room_message", {
      p_room_id: sqlId,
      p_body: body,
    }).then(
      function (row) {
        state.chatSchema = "ok";
        return row;
      },
      function (err) {
        if (isChatSchemaMissing(err)) state.chatSchema = "missing";
        throw err;
      }
    );
  }

  function paintLiveLog(messages) {
    var panel = roomEl();
    if (!panel) return;
    var log = panel.querySelector("[data-commune-room-log]");
    if (!log) return;
    log.innerHTML = "";
    messages = filterBlockedLiveMessages(messages);
    if (!messages || !messages.length) {
      var empty = document.createElement("p");
      empty.className = "commune-room-line commune-room-line--meta";
      empty.textContent = "Live room — say hello. Keep it kind.";
      log.appendChild(empty);
      return;
    }
    messages.forEach(function (msg) {
      var p = document.createElement("p");
      p.className = "commune-room-line";
      if (msg.id) p.setAttribute("data-message-id", String(msg.id));
      if (msg.authorUserId) p.setAttribute("data-author-user-id", String(msg.authorUserId));
      var name = escapeHtml(msg.senderName || "Member");
      var badge = seedBadgeForAuthor(msg.author || msg);
      var body = escapeHtml(msg.body || "");
      var more = roomMessageMoreHtml(msg);
      var when = roomTimeLabel(msg.at);
      p.innerHTML =
        '<span class="commune-room-meta"><strong>' + name + "</strong>" + (badge ? " " + badge : "") +
        (when ? ' <time class="commune-room-time" datetime="' + escapeHtml(String(msg.at)) + '">' + escapeHtml(when) + "</time>" : "") +
        '</span><span class="commune-room-body">' + body + "</span>" + more;
      log.appendChild(p);
    });
    scrollLogToNewest(log);
  }

  /* Short local time for a message (today: "9:12 PM", older: "Oct 14, 9:12 PM"). */
  function roomTimeLabel(at) {
    if (!at) return "";
    var d = new Date(at);
    if (isNaN(d.getTime())) return "";
    var now = new Date();
    var t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (d.toDateString() === now.toDateString()) return t;
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + ", " + t;
  }
  /* Newest at the bottom; jump there (no smooth scroll, so reduced motion is respected). */
  function scrollLogToNewest(log) {
    if (!log) return;
    log.scrollTop = log.scrollHeight;
    try { window.requestAnimationFrame(function () { log.scrollTop = log.scrollHeight; }); } catch (eRaf) {}
  }

  /* Live room view header: Back, title, muted member count (built once, in place). */
  function ensureRoomHeader(panel) {
    var head = panel.querySelector("[data-commune-room-head]");
    if (head) return head;
    head = document.createElement("div");
    head.className = "commune-room-head";
    head.setAttribute("data-commune-room-head", "");
    var back = document.createElement("button");
    back.type = "button";
    back.className = "commune-room-head-back";
    back.setAttribute("data-commune-room-head-back", "");
    back.setAttribute("aria-label", "Back to deck");
    back.textContent = "‹ Back";
    back.addEventListener("click", closeRoom);
    var titles = document.createElement("div");
    titles.className = "commune-room-head-titles";
    var title = panel.querySelector("[data-commune-room-title]");
    var members = panel.querySelector("[data-commune-room-members]");
    if (title) titles.appendChild(title);
    if (members) titles.appendChild(members);
    head.appendChild(back);
    head.appendChild(titles);
    panel.insertBefore(head, panel.firstChild);
    return head;
  }

  /* Room chat view: a right swipe (horizontal-dominant) moves on to the next ECHO
     card. Never while the list scrolls vertically, the input is focused, or typing.
     Back to deck stays as the button fallback. */
  var ROOM_SWIPE_MIN_X = 70;
  var ROOM_SWIPE_RATIO = 1.8;
  function roomSwipeIsNext(dx, dy, opts) {
    opts = opts || {};
    if (opts.inputFocused || opts.typing || opts.scrolledY) return false;
    if (dx < ROOM_SWIPE_MIN_X) return false;
    return Math.abs(dx) >= ROOM_SWIPE_RATIO * Math.abs(dy);
  }
  function nextCardFromRoom() {
    closeRoom();
    finishSwipe();
    setStatus("");
  }
  function wireRoomSwipe(panel) {
    if (!panel || panel.getAttribute("data-commune-room-swipe") === "1") return;
    panel.setAttribute("data-commune-room-swipe", "1");
    var start = null;
    var typedAt = 0;
    panel.addEventListener("input", function () { typedAt = Date.now(); });
    panel.addEventListener("keydown", function () { typedAt = Date.now(); });
    function inputFocused() {
      var a = document.activeElement;
      return !!(a && panel.contains(a) && /^(TEXTAREA|INPUT|SELECT)$/.test(a.tagName));
    }
    panel.addEventListener("pointerdown", function (ev) {
      /* Live rooms and the classroom / auction views (data-commune-room-view) alike. */
      if (!panel.hasAttribute("data-commune-room-overlay")) { start = null; return; }
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      if (ev.target && ev.target.closest && ev.target.closest("textarea, input, select, button, a, [data-commune-room-more]")) { start = null; return; }
      var log = panel.querySelector("[data-commune-room-log]");
      start = { x: ev.clientX, y: ev.clientY, scroll: log ? log.scrollTop : 0 };
    });
    panel.addEventListener("pointercancel", function () { start = null; });
    panel.addEventListener("pointerup", function (ev) {
      if (!start) return;
      var log = panel.querySelector("[data-commune-room-log]");
      var s0 = start;
      start = null;
      var ok = roomSwipeIsNext(ev.clientX - s0.x, ev.clientY - s0.y, {
        inputFocused: inputFocused(),
        typing: Date.now() - typedAt < 1200,
        scrolledY: !!(log && Math.abs(log.scrollTop - s0.scroll) > 4),
      });
      if (ok) nextCardFromRoom();
    });
  }

  function paintRoom(room, opts) {
    opts = opts || {};
    var panel = roomEl();
    if (!panel || !room) return;
    var title = panel.querySelector("[data-commune-room-title]");
    var topic = panel.querySelector("[data-commune-room-topic]");
    var log = panel.querySelector("[data-commune-room-log]");
    var kicker = panel.querySelector(".commune-card-kicker");
    if (title) title.textContent = room.title || "Room";
    if (topic) topic.textContent = room.body || room.topic || "";
    /* Live rooms only (no local demo room). */
    if (kicker) kicker.textContent = opts.classroom ? "Classroom · live · hosted by Cognation" : "Chatroom · live · hosted by Cognation";
    var members = panel.querySelector("[data-commune-room-members]");
    if (!members && log && log.parentNode) {
      members = document.createElement("p");
      members.className = "commune-card-meta commune-room-members";
      members.setAttribute("data-commune-room-members", "");
      log.parentNode.insertBefore(members, log);
    }
    if (members) { members.hidden = true; members.textContent = ""; }
    ensureRoomHeader(panel);
    wireRoomSwipe(panel);
    if (log) paintLiveLog(opts.messages || state.liveMessages || []);
    showRoom(true);
    state.roomId = room.id;
    state.liveRoom = !!opts.live;
    state.roomSqlId = opts.live ? String(room.sqlId || opts.sqlId || "") : "";
    if (opts.live && opts.messages) state.liveMessages = opts.messages;
  }
  /* Real member count from chat_room_members (members-only RLS). Hidden if unavailable. */
  function paintRoomMembers(sqlId) {
    var sb = window.CognationSupabase;
    var panel = roomEl();
    var el = panel && panel.querySelector("[data-commune-room-members]");
    if (!el || !sb || typeof sb.rest !== "function" || !sqlId) return;
    sb.rest("chat_room_members", { query: "select=user_id&room_id=eq." + encodeURIComponent(sqlId) }).then(function (rows) {
      if (state.roomSqlId !== sqlId || !Array.isArray(rows)) return;
      el.textContent = rows.length === 1 ? "1 member here" : rows.length + " members here";
      el.hidden = false;
    }, function () { el.hidden = true; });
  }
  /* No local demo fallback: if the live room can't open, say so and stay on the deck. */
  function liveRoomUnavailable(message) {
    setStatus(message || "Live rooms aren't available right now. Try again soon.");
    return false;
  }

  function openLiveRoom(room, scroll, roomOpts) {
    roomOpts = roomOpts || {};
    var isClass = !!roomOpts.classroom;
    var sqlId = String(room.sqlId || "");
    if (!sqlId) return Promise.resolve(liveRoomUnavailable("This room isn't live yet."));
    setStatus(isClass ? "Joining classroom…" : "Joining live room…");
    closeClassroom();
    return joinLiveRoom(sqlId).then(function () {
      return fetchLiveMessages(sqlId).then(function (messages) {
        paintRoom(room, { live: true, sqlId: sqlId, classroom: isClass, messages: filterBlockedLiveMessages(messages) });
        paintRoomMembers(sqlId);
        setStatus(isClass
          ? "You're in the " + (room.title || "classroom") + " classroom — live."
          : "You're in " + (room.title || "the room") + " — live group chat (up to 12).");
        friction("begin", isClass ? "classroom" : "chat", (isClass ? "classroom:" : "chatroom:") + room.id);
        if (scroll && state.shell && state.shell.scrollIntoView) state.shell.scrollIntoView({ block: "center" });
        return true;
      });
    }).catch(function (err) {
      if (isChatSchemaMissing(err) || state.chatSchema === "missing") {
        return liveRoomUnavailable("Live rooms aren't ready yet. Try again soon.");
      }
      var mapped = mapChatRoomError(err);
      if (isClass && mapped.code === "room_not_found") mapped = { code: mapped.code, message: "Classrooms aren't live yet. Try again soon." };
      showJoinError(mapped);
      return false;
    });
  }

  function openRoom(roomId, scroll) {
    roomId = String(roomId || "");
    var rooms = ensureSiteRooms();
    var room = null;
    /* Prefer catalog match; also accept sqlId for live wiring. */
    rooms.forEach(function (item) {
      if (item.id === roomId || item.sqlId === roomId) room = item;
    });
    if (!room) {
      SITE_ROOMS.forEach(function (item) {
        if (item.id === roomId || item.sqlId === roomId) room = roomCard(item);
      });
    }
    if (!room) {
      setStatus("That room is not available right now.");
      return false;
    }
    if (!state.shell) {
      setStatus("Commune is still loading. Try Open again in a moment.");
      return false;
    }
    if (liveChatEligible()) {
      openLiveRoom(room, scroll);
      return true;
    }
    return liveRoomUnavailable(supabaseLiveSession() ? "Live rooms aren't ready yet. Try again soon." : "Sign in to join live rooms.");
  }
  function clearPointer() {
    var el = state.pointer && state.pointer.el;
    if (el) {
      el.classList.remove("is-dragging");
      el.style.transform = "";
    }
    state.pointer = null;
  }

  function releaseRoomSurface() {
    /* Drop open-room lock and restore deck/actions so the card can swipe again. */
    var wasLive = state.liveRoom;
    var sqlId = state.roomSqlId;
    state.roomId = "";
    state.liveRoom = false;
    state.roomSqlId = "";
    state.liveMessages = [];
    showRoom(false);
    clearPointer();
    try {
      var input = roomEl() && roomEl().querySelector("[data-commune-room-input]");
      if (input && typeof input.blur === "function") input.blur();
    } catch (eBlur) {}
    if (wasLive && sqlId) {
      try { leaveLiveRoom(sqlId); } catch (eLeave) {}
    }
  }

  function closeRoom() {
    if (state.roomId) friction("abandon", "chat", "room_back");
    if (state.cardView) {
      if (state.cardView === "classroom" && state.classroomId) friction("abandon", "classroom", "classroom_back");
      if (state.cardView === "auction" && state.auctionId) friction("abandon", "auction", "auction_back");
      state.classroomId = "";
      closeCardView();
    }
    releaseRoomSurface();
  }

  /* Classroom and Auction open in the chat-room full view (same dark shell,
     same Back to deck), not a demo card. Compose is hidden: these are not chats. */
  function paintCardView(kind, item, notesText) {
    var panel = roomEl();
    if (!panel || !item) return false;
    ensureRoomHeader(panel);
    wireRoomSwipe(panel);
    var title = panel.querySelector("[data-commune-room-title]");
    var topic = panel.querySelector("[data-commune-room-topic]");
    var log = panel.querySelector("[data-commune-room-log]");
    var kicker = panel.querySelector(".commune-card-kicker");
    var label = kind === "auction" ? "Auction" : "Classroom";
    if (kicker) kicker.textContent = label + " · hosted by Cognation";
    if (title) title.textContent = item.title || label;
    if (topic) topic.textContent = item.body || "";
    if (log) {
      log.innerHTML = "";
      if (notesText) {
        var p = document.createElement("p");
        p.className = "commune-room-line";
        p.textContent = notesText;
        log.appendChild(p);
      }
    }
    panel.setAttribute("data-commune-room-view", kind);
    state.roomId = "";
    state.liveRoom = false;
    state.roomSqlId = "";
    state.cardView = kind;
    showSubpanel("room");
    return true;
  }

  function openAuction(card, scroll) {
    if (!card || !state.shell) return false;
    closeClassroom();
    releaseRoomSurface();
    if (!paintCardView("auction", card, card.why || "")) return false;
    state.auctionId = card.id;
    friction("begin", "auction", "auction:" + card.id);
    if (scroll && state.shell.scrollIntoView) state.shell.scrollIntoView({ block: "center" });
    return true;
  }

  function closeCardView() {
    var panel = roomEl();
    if (panel) panel.removeAttribute("data-commune-room-view");
    state.cardView = "";
    state.auctionId = "";
  }

  function paintClassroom(session) {
    var notesText =
      "Honest thin session: Cognation hosts short life-skills webinars here (insurance, voting, business). Full curriculum arrives later — this seat is real.";
    if (paintCardView("classroom", {
      title: session && session.title || "Classroom",
      body: (session && session.topic ? "Topic · " + session.topic + " — " : "") + (session && session.body || CLASSROOM_BODY),
    }, notesText)) {
      state.classroomId = session.id;
      return;
    }
    var panel = state.shell && state.shell.querySelector(CLASSROOM_PANEL_SEL);
    if (!panel || !session) return;
    var title = panel.querySelector("[data-classroom-title]");
    var topic = panel.querySelector("[data-classroom-topic]");
    var body = panel.querySelector("[data-classroom-body]");
    var notes = panel.querySelector("[data-classroom-notes]");
    if (title) title.textContent = session.title || "Classroom";
    if (topic) topic.textContent = session.topic ? ("Topic · " + session.topic) : "Life skills · ~18+";
    if (body) body.textContent = session.body || CLASSROOM_BODY;
    if (notes) {
      notes.textContent =
        "Honest thin session: Cognation hosts short life-skills webinars here (insurance, voting, business). Full curriculum arrives later — this seat is real.";
    }
    showClassroom(true);
    state.classroomId = session.id;
  }

  function syncAgeFromAuthMetadata() {
    try {
      var sb = window.CognationSupabase;
      if (!sb || typeof sb.getSession !== "function") return false;
      var sess = sb.getSession();
      var meta =
        (sess && sess.user && (sess.user.user_metadata || sess.user.userMetadata)) ||
        (sess && (sess.user_metadata || sess.userMetadata)) ||
        null;
      if (!meta) return false;
      var age = parseInt(meta.member_age != null ? meta.member_age : meta.memberAge, 10);
      if (isNaN(age) || age <= 0) return false;
      setMemberProfile({ age: age });
      return true;
    } catch (eSync) {
      return false;
    }
  }

  function openClassroom(sessionId, scroll) {
    sessionId = String(sessionId || "");
    if (!classroomAllowed()) {
      syncAgeFromAuthMetadata();
    }
    if (liveBirthMissing()) {
      setBirthNeededStatus("Add your birth year and month in your profile to join classrooms.");
      return false;
    }
    if (!classroomAllowed()) {
      setStatus("Classroom is for members 18+. Update your age in your profile to join.");
      return false;
    }
    var sessions = classroomCatalog();
    var session = null;
    sessions.forEach(function (item) { if (item.id === sessionId) session = item; });
    if (!session && sessions.length) session = sessions[0];
    if (!session) return false;
    /* Signed in + 18+: a real live classroom (join_chat_room, messages, members). */
    if (state.shell && liveChatEligible() && session.sqlId) {
      state.classroomId = "";
      openLiveRoom(session, scroll, { classroom: true });
      return true;
    }
    if (!state.shell) {
      /* Allow pathway smoke before shell bind: surface still exists in DOM. */
      var panel = document.querySelector(CLASSROOM_PANEL_SEL);
      if (!panel) return false;
      state.shell = document.querySelector("[data-commune-shell]") || panel.closest("[data-commune-shell]") || null;
      if (!state.shell) state.shell = panel.parentElement;
    }
    closeRoom();
    paintClassroom(session);
    friction("begin", "classroom", "classroom:" + (session.id || sessionId));
    if (scroll && state.shell && state.shell.scrollIntoView) state.shell.scrollIntoView({ block: "center" });
    return true;
  }

  function closeClassroom() {
    if (state.classroomId) friction("abandon", "classroom", "classroom_back");
    state.classroomId = "";
    if (state.cardView === "classroom") {
      closeCardView();
      showSubpanel("");
      return;
    }
    showClassroom(false);
  }

  function paintDeck() {
    if (!state.deck) return;
    closeClassroom();
    closeRoom();
    state.deck.innerHTML = "";
    var card = currentCard();
    if (!card) {
      refill();
      card = currentCard();
    }
    if (!card) {
      var roomsOpen = ensureSiteRooms().length;
      var empty =
        '<p class="commune-swipe-empty">You\'re caught up.</p>' +
        (liveBirthMissing()
          ? '<p class="commune-swipe-empty commune-swipe-empty--rooms" data-commune-birth-needed>Chat rooms (13+) and classrooms (18+) need your birth year and month. Only the month and year are saved.</p>' +
            '<p class="commune-swipe-empty"><button type="button" class="btn btn-primary" data-commune-add-birth>Add birth month</button></p>'
          : roomsOpen
            ? ''
            : '<p class="commune-swipe-empty commune-swipe-empty--rooms">No chat rooms match your age and interests yet. Update age or interests in your profile, then come back.</p>');
      state.deck.innerHTML = empty;
      var addBirth = state.deck.querySelector("[data-commune-add-birth]");
      if (addBirth) addBirth.addEventListener("click", openBirthPrompt);
      syncActionLabels();
      return;
    }
    var el = renderCard(card);
    state.deck.appendChild(el);
    bindCard(el, card);
    syncActionLabels();
  }

  function refill() {
    state.cards = sampleDeck(12);
    var live = window.CognationLive && window.CognationLive.echoCard && window.CognationLive.echoCard();
    if (live) state.cards.unshift(live);
    state.index = 0;
  }

  function dismiss(card) {
    if (!card || !card.id) return;
    var ids = getDismissed();
    var id = stableCardId(card.id);
    if (id && ids.indexOf(id) < 0) ids.push(id);
    setDismissed(ids);
  }
  function like(card) {
    var ids = getLikes();
    if (ids.indexOf(card.id) < 0) ids.push(card.id);
    setLikes(ids);
  }

  function recordShare(card) {
    /* Known seeds and known reals both write shares into the shared store, tagged
       with swiperIsSeed. Unknown viewer: fail closed — do not write. */
    var st = resolveViewerSeedStatus();
    if (st !== true && st !== false) return;
    var fromSeed = st === true;
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
      sharerName: viewerDisplayName(),
      handle: card.handle || "",
      profileId: card.profileId || "",
      interests: interests,
      swiperId: currentProfileId(),
      swiperIsSeed: fromSeed,
      fromSeed: fromSeed,
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

  function topUpDeck() {
    /* Keep 1:1 pacing via sampleDeck/paceDeck. Never re-add passed cards. */
    var guard = 0;
    while (state.cards.length - state.index < 4 && guard < 6) {
      guard += 1;
      var more = omitPassed(sampleDeck(8));
      var added = 0;
      more.forEach(function (card) {
        var stable = stableCardId(card.id);
        var dup = state.cards.some(function (c) { return stableCardId(c.id) === stable; });
        if (dup) return;
        state.cards.push(card);
        added += 1;
      });
      if (!added) break;
    }
  }

  function finishSwipe() {
    var passed = passedSet();
    var dropAt = state.index;
    var kept = [];
    var removedBefore = 0;
    state.cards.forEach(function (card, idx) {
      var stable = stableCardId(card && card.id);
      var drop = idx === dropAt || !!(stable && passed[stable]);
      if (drop) {
        if (idx < dropAt) removedBefore += 1;
        return;
      }
      kept.push(card);
    });
    state.cards = kept;
    /* Next eligible card takes the same slot. Clamp so we never sit past the end
       (that left a blank deck after swipe-left on the last queued card). */
    state.index = Math.max(0, dropAt - removedBefore);
    if (state.index > state.cards.length) state.index = state.cards.length;
    state.seen += 1;
    topUpDeck();
    if (state.index >= state.cards.length) {
      var fresh = omitPassed(sampleDeck(12));
      if (fresh.length) {
        state.cards = fresh;
        state.index = 0;
      }
    }
    state.busy = false;
    paintDeck();
  }

  function swipe(direction) {
    if (state.busy || state.roomId || state.classroomId) return;
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
        friction("retry", "dating", "rating_required");
        return;
      }
    }
    if (dir === "right" && card.type === TYPE.KNOW) {
      var sent = sendPersonalFriendRequest(card.profileId);
      setStatus(sent.message || (sent.full ? "This list is full." : "Friend request sent."));
      if (sent.full) return;
    }
    friction("begin", pathwayForCard(card), "commune-swipe");
    state.busy = true;
    if (active) active.classList.add(dir === "left" ? "is-exit-left" : "is-exit-right");
    window.setTimeout(function () {
      settleSwipe(card, dir);
      finishSwipe();
    }, 220);
  }

  function settleSwipe(card, dir) {
    if (!card) return;
    var pathway = pathwayForCard(card);
    if (dir === "left") {
      dismiss(card);
      var leftTags = noteLeftInterestTags(card);
      var faded = leftTags.filter(isTopicFaded);
      if (faded.length) {
        setStatus("Passed — fading \"" + faded[0] + "\" after repeated lefts.");
      } else if (leftTags.length) {
        setStatus("Passed — less of \"" + leftTags[0] + "\" for now.");
      } else {
        setStatus("Passed.");
      }
      friction("abandon", pathway, "swipe_left");
      return;
    }
    if (card.type === TYPE.DATING) {
      like(card);
      var me = currentProfileId();
      markDatingRight(me, card.profileId);
      var self = selfDatingRecord();
      if (self) deliverDatingCard(self, card.profileId);
      if (hasDatingRight(card.profileId, me)) {
        var store = window.CognationMessageStore;
        if (store && typeof store.openMatch === "function") {
          var eventLine = "";
          try { eventLine = pickLocalEventLine() || ""; } catch (eEv) { eventLine = ""; }
          store.openMatch(
            { id: me, name: (self && self.displayName) || "You" },
            { id: card.profileId, name: card.name || "Member" },
            { eventLine: eventLine }
          );
        }
        writeNotice(me, "match", "It's a match. A message is open in Tower.");
        writeNotice(card.profileId, "match", "It's a match. A message is open in Tower.");
        renderNotices();
        setStatus("It's a match. A message is open in Tower.");
      } else {
        setStatus("Your card is on their Commune.");
      }
      friction("complete", "dating");
      return;
    }
    if (card.type === TYPE.AD) {
      var adTags = confirmInterestTags(card);
      recordShare(card);
      setStatus(
        viewerIsSeedOrOps()
          ? "Kept."
          : ("Shared with friends" + (adTags.length ? " · confirmed \"" + adTags[0] + "\"" : "") + ".")
      );
      friction("complete", "ad");
      return;
    }
    if (card.type === TYPE.KNOW) {
      friction("complete", "commune");
      return;
    }
    if (PRO_MARK[card.type]) {
      like(card);
      if (card.type === PRO.KNOW && card.profileId && !card.demo) {
        if (!isFollowing(card.profileId)) toggleFollow(card.profileId);
        setStatus("Following this professional page.");
      } else {
        if (!card.demo) {
          confirmInterestTags(card);
          recordShare(card);
        }
        setStatus(card.demo ? "Kept." : "Shared with friends · interest confirmed.");
      }
      friction("complete", pathway);
      return;
    }
    if (card.type === TYPE.CLASSROOM) {
      like(card);
      setStatus("Kept. Open the session anytime from a Classroom card.");
      friction("complete", "classroom");
      return;
    }
    if (card.type === TYPE.FRIEND || card.type === TYPE.EVENT || card.type === TYPE.FACT || card.type === TYPE.WELLNESS || card.type === TYPE.CHAT || card.type === TYPE.CONTENT) {
      like(card);
      if (card.type !== TYPE.CHAT) {
        confirmInterestTags(card);
        recordShare(card);
        setStatus(
          viewerIsSeedOrOps() || card.type === TYPE.FRIEND
            ? "Kept · interest confirmed."
            : "Shared with friends · interest confirmed."
        );
      } else {
        setStatus("Kept.");
      }
      friction("complete", pathway);
      return;
    }
    like(card);
    setStatus("Kept.");
    friction("complete", pathway);
  }

  function syncModeSwitch() {
    if (!state.shell) return;
    var mode = getMode();
    var pro = mode === MODE.PROFESSIONAL;
    state.shell.setAttribute("data-commune-mode", mode);
    state.shell.querySelectorAll("[data-commune-mode-btn]").forEach(function (btn) {
      var on = btn.getAttribute("data-commune-mode-btn") === mode;
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.classList.toggle("is-selected", on);
      btn.classList.toggle("is-active", on);
      btn.tabIndex = on ? 0 : -1;
    });
    var row = state.shell.querySelector(".commune-dating-toggle-row");
    if (row) row.hidden = pro;
  }

  function wireModeSwitch(shell) {
    var sw = shell.querySelector("[data-commune-mode-switch]");
    if (!sw) return;
    function pick(mode) {
      if (mode === getMode()) return;
      setMode(mode);
      rebuildDeck();
      setStatus(mode === MODE.PROFESSIONAL ? "Professional deck." : "Personal deck.");
    }
    sw.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-commune-mode-btn]");
      if (btn && sw.contains(btn)) pick(btn.getAttribute("data-commune-mode-btn"));
    });
    sw.addEventListener("keydown", function (ev) {
      if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
      ev.preventDefault();
      ev.stopPropagation();
      pick(ev.key === "ArrowLeft" ? MODE.PERSONAL : MODE.PROFESSIONAL);
      var next = sw.querySelector('[data-commune-mode-btn="' + getMode() + '"]');
      if (next) next.focus();
    });
  }

  function rebuildDeck() {
    syncModeSwitch();
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
    state.lastDragDx = 0;
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
    state.lastDragDx = dx;
    clearPointer();
    if (Math.abs(dx) < 80) return;
    swipe(dx < 0 ? "left" : "right");
  }

  function ensureDatingBiosThenRebuild() {
    var hydrate = window.CognationSeedOpsDatingHydrate;
    var alive = window.CognationSeedOpsCommuneAlive;
    var done = function () {
      syncDatingVisibility();
      rebuildDeck();
    };
    if (hydrate && typeof hydrate.ensureDatingContent === "function") {
      hydrate.ensureDatingContent({ minCount: 1 }).then(done).catch(done);
      return;
    }
    if (alive && typeof alive.materializeDatingSample === "function") {
      try {
        alive.materializeDatingSample(48);
      } catch (eMat) {}
    }
    if (hydrate && typeof hydrate.hydrate === "function") {
      hydrate.hydrate({ force: true, forceBios: true }).then(done).catch(done);
      return;
    }
    done();
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
      var on = !!toggle.checked;
      setSeeDating(on);
      syncDatingVisibility();
      if (on) {
        /* Hydrate bios before paint so dating Card 1 is not blank after toggle. */
        setStatus("Loading dating cards…");
        ensureDatingBiosThenRebuild();
        setStatus("Dating cards can appear now and then.");
        return;
      }
      rebuildDeck();
      setStatus("Dating cards hidden.");
    });
  }

  function wireFriendSharesToggle(shell) {
    var toggle = shell.querySelector("[data-commune-see-friend-shares]");
    if (!toggle) return;
    toggle.addEventListener("change", function () {
      var on = !!toggle.checked;
      setSeeFriendShares(on);
      syncFriendSharesVisibility();
      rebuildDeck();
      setStatus(on ? "Friends' shares can appear in ECHO." : "Friends' shares hidden.");
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
    /* Step 2c: Block / Report ⋯ on live room messages. */
    (roomEl() || shell).addEventListener("click", function (ev) {
      var roomPanel = roomEl();
      if (!roomPanel || roomPanel.hidden) return;
      var moreBtn = ev.target && ev.target.closest("[data-commune-room-more]");
      if (moreBtn && roomPanel.contains(moreBtn)) {
        ev.preventDefault();
        ev.stopPropagation();
        var menu = moreBtn.parentNode && moreBtn.parentNode.querySelector("[data-commune-room-menu]");
        if (menu) {
          var open = !!menu.hidden;
          roomPanel.querySelectorAll("[data-commune-room-menu]").forEach(function (m) {
            m.hidden = true;
          });
          roomPanel.querySelectorAll("[data-commune-room-more]").forEach(function (b) {
            b.setAttribute("aria-expanded", "false");
          });
          if (open) {
            menu.hidden = false;
            moreBtn.setAttribute("aria-expanded", "true");
          }
        }
        return;
      }
      var blockBtn = ev.target && ev.target.closest("[data-commune-room-block]");
      if (blockBtn && roomPanel.contains(blockBtn)) {
        ev.preventDefault();
        ev.stopPropagation();
        var blockMid = blockBtn.getAttribute("data-message-id");
        if (!blockMid) return;
        hideLiveMessageLocally(blockMid);
        return;
      }
      var reportBtn = ev.target && ev.target.closest("[data-commune-room-report]");
      if (reportBtn && roomPanel.contains(reportBtn)) {
        ev.preventDefault();
        ev.stopPropagation();
        if (reportBtn.disabled) return;
        reportBtn.disabled = true;
        var mid = reportBtn.getAttribute("data-message-id");
        var rUid = reportBtn.getAttribute("data-author-user-id");
        reportLiveRoomMessage(mid, rUid).then(function (res) {
          if (!res || !res.ok) {
            reportBtn.disabled = false;
            if (res && res.error === "seed_report_cap") return;
            if (res && res.error === "cannot_report_own") return;
            setStatus("Couldn't report. Try again.");
            return;
          }
          setStatus(
            res.hidden
              ? "Reported — message hidden for the room until review."
              : "Reported. Thanks for looking out for the room."
          );
        });
        return;
      }
    });
    var classBack = shell.querySelector("[data-classroom-back], [data-commune-classroom-back]");
    if (classBack) classBack.addEventListener("click", closeClassroom);
    var form = shell.querySelector("[data-commune-room-compose]");
    if (form) {
      /* Chatroom + classroom overlay: Enter sends, Shift+Enter adds a new line,
         never during IME composition. The Send button stays. */
      var composeInput = form.querySelector("[data-commune-room-input]");
      if (composeInput) composeInput.addEventListener("keydown", function (e) {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        if (form.requestSubmit) form.requestSubmit();
        else form.dispatchEvent(new Event("submit", { cancelable: true }));
      });
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var input = roomEl() && roomEl().querySelector("[data-commune-room-input]");
        var body = input ? String(input.value || "").trim() : "";
        if (!body || !state.roomId) return;
        body = body.slice(0, 500);
        if (state.liveRoom && state.roomSqlId) {
          var sqlId = state.roomSqlId;
          setStatus("Sending…");
          postLiveMessage(sqlId, body).then(function () {
            if (input) input.value = "";
            return fetchLiveMessages(sqlId).then(function (messages) {
              state.liveMessages = messages;
              paintLiveLog(messages);
              friction("complete", "chat");
              setStatus("Sent to the live room.");
            });
          }).catch(function (err) {
            if (isChatSchemaMissing(err)) {
              setStatus("Live rooms dropped — message not sent. Try again after the migration.");
              return;
            }
            var mapped = mapChatRoomError(err);
            setStatus(mapped.message);
          });
          return;
        }
        /* No local-only messages: only a live room can send. Release the room so the deck swipes. */
        releaseRoomSurface();
        setStatus("This room isn't live — message not sent.");
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
      if (!panel || panel.hidden || state.roomId || state.classroomId) return;
      if (ev.target && ev.target.closest && ev.target.closest("[data-commune-mode-switch]")) return;
      if (ev.key === "ArrowLeft") { ev.preventDefault(); swipe("left"); }
      else if (ev.key === "ArrowRight") { ev.preventDefault(); swipe("right"); }
    });
    wireDatingToggle(shell);
    wireFriendSharesToggle(shell);
    refreshBlockedShares();
    wireModeSwitch(shell);
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
    document.addEventListener("cognation:session-started", function () {
      refreshSeedGates().then(function () { rebuildDeck(); });
    });
    document.addEventListener("cognation:member-profile-updated", function () {
      syncDatingVisibility();
      rebuildDeck();
    });
    document.addEventListener("cognation:tower-updated", function () { rebuildDeck(); });
    document.addEventListener("cognation:echo-group-notice", function () { renderNotices(); });
    refreshSeedGates();
  }

  window.CognationCommuneSwipe = {
    rebuild: rebuildDeck,
    openRoom: openRoom,
    liveChatEligible: liveChatEligible,
    mapChatRoomError: mapChatRoomError,
    openClassroom: openClassroom,
    openAuction: openAuction,
    wireClassroomCardClick: wireClassroomCardClick,
    closeClassroom: closeClassroom,
    classroomCatalog: classroomCatalog,
    visibleClassroomSessions: visibleClassroomSessions,
    classroomAllowed: classroomAllowed,
    getFollows: getFollows,
    setFollows: setFollows,
    isFollowing: isFollowing,
    toggleFollow: toggleFollow,
    getMemberProfile: getMemberProfile,
    setMemberProfile: setMemberProfile,
    getMemberAge: getMemberAge,
    datingCandidateAgeOk: datingCandidateAgeOk,
    datingAgeOk: datingAgeOk,
    setDatingBirthAge: setDatingBirthAge,
    roomSwipeIsNext: roomSwipeIsNext,
    openPersonTower: openPersonTower,
    buildProfessionalLanes: buildProfessionalLanes,
    roomTimeLabel: roomTimeLabel,
    getDatingBirthAge: getDatingBirthAge,
    liveBirthMissing: liveBirthMissing,
    datingAllowed: datingAllowed,
    getSeeDating: getSeeDating,
    setSeeDating: setSeeDating,
    getSeeFriendShares: getSeeFriendShares,
    setSeeFriendShares: setSeeFriendShares,
    confirmInterestTags: confirmInterestTags,
    noteLeftInterestTags: noteLeftInterestTags,
    isTopicFaded: isTopicFaded,
    cardTopicFaded: cardTopicFaded,
    cardInterestTags: cardInterestTags,
    friendShareCards: friendShareCards,
    recordShare: recordShare,
    viewerIsSeedOrOps: viewerIsSeedOrOps,
    profileLooksSeed: profileLooksSeed,
    shareSeedFlag: shareSeedFlag,
    noteViewerSeedStatus: noteViewerSeedStatus,
    learnSandbox: learnSandbox,
    noteProfileSeedStatus: noteProfileSeedStatus,
    refreshViewerSeedStatus: refreshViewerSeedStatus,
    refreshSeedGates: refreshSeedGates,
    FADE_LEFT_THRESHOLD: FADE_LEFT_THRESHOLD,
    OFF_INTEREST_FRIEND_RATIO: OFF_INTEREST_FRIEND_RATIO,
    SEE_FRIEND_SHARES_KEY: SEE_FRIEND_SHARES_KEY,
    LEARN_KEY: LEARN_KEY,
    seedDemoFollows: function () { return getFollows(); },
    siteRoomCatalog: function () { return SITE_ROOMS.map(roomCard); },
    visibleSiteRooms: ensureSiteRooms,
    ratingSentence: ratingSentence,
    paceDeck: paceDeck,
    sampleDeck: sampleDeck,
    settleSwipe: settleSwipe,
    omitPassed: omitPassed,
    sendPersonalFriendRequest: sendPersonalFriendRequest,
    publicEvents: publicEvents,
    towerLiveContentCards: towerLiveContentCards,
    marketplaceCards: marketplaceCards,
    marketCanBid: marketCanBid,
    marketBidLabel: marketBidLabel,
    raiseBid: raiseBid,
    liveHigh: liveHigh,
    payHighBid: payHighBid,
    settleMarketPayment: settleMarketPayment,
    optInToBid: optInToBid,
    featuredFamily: featuredFamily,
    getMode: getMode,
    setMode: setMode,
    paceProfessional: paceProfessional,
    buildProfessionalLanes: buildProfessionalLanes,
    MODE_KEY: MODE_KEY,
    PRO_ORDER: PRO_ORDER.slice(),
    PRO_MARK: PRO_MARK,
    FEATURED_ORDER: FEATURED_ORDER.slice(),
    CONTENT_SUBTYPES: CONTENT_SUBTYPES.slice(),
    AD_MAX_MS: AD_MAX_MS,
    pickLocalEventLine: pickLocalEventLine,
    formatMatchEventLine: formatMatchEventLine,
    FOLLOWS_KEY: FOLLOWS_KEY,
    SEE_DATING_KEY: SEE_DATING_KEY,
    SEE_FRIEND_SHARES_KEY: SEE_FRIEND_SHARES_KEY,
    LEARN_KEY: LEARN_KEY,
    MEMBER_PROFILE_KEY: MEMBER_PROFILE_KEY,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
