/**
 * TOWER — private friends newsfeed + public scrapbook profile (demo / localStorage).
 * Local COMMUNE Front Page is generated from Tower posts.
 *
 * Storage: cognation.tower.posts.v3 · cognation.profiles.v1 (via CognationAccounts)
 * Legacy mirror: cognation.tower.profile.v1 (Personal)
 * Owner sides: sessionStorage cognation.tower.side = private|public
 * Dual profiles: Personal | Professional (max 2 per phone)
 * Public deep-link: #tower-profile-{handle}
 * Attachment kinds: photo | note | video | art | document
 * Calendar: profile.calendarEvents on active Tower profile (localStorage via CognationAccounts)
 *   · My feed private month CRUD · public scrapbook widget data-tower-widget="calendar"
 *   · Friends schedule requests (pending/accepted) · Google Connect + ICS URL stubs
 */
(function () {
  "use strict";

  var TOWER_KEY = "cognation.tower.posts.v3";
  var TOWER_PROFILE_KEY = "cognation.tower.profile.v1";
  var REACTION_CLEANUP_KEY = "cognation.tower.reaction-cleanup.v1";

  function remoteSocial() {
    return window.CognationSupabaseSocial || null;
  }

  function usingRemoteSocial() {
    var social = remoteSocial();
    return !!(social && social.active && social.active());
  }

  var AVATAR_FRAMES = {
    none: { label: "None", overlay: "" },
    "ornate-gold": { label: "Ornate gold oval", overlay: "assets/frames/ornate-gold-oval-cutout.png" },
    "baroque-magenta": { label: "Magenta baroque", overlay: "assets/frames/baroque-magenta-gold-cutout.png" },
    squiggly: { label: "Squiggly", overlay: "" },
    "gallery-gold": { label: "Gallery gold", overlay: "" },
    walnut: { label: "Walnut", overlay: "" },
    polaroid: { label: "Polaroid", overlay: "" },
    "matte-black": { label: "Matte black", overlay: "" },
    "cowboy-hat": { label: "Cowboy hat", overlay: "assets/frames/cowboy-hat-cutout.png" },
  };

  var FRAME_IDS = Object.keys(AVATAR_FRAMES);

  var COWBOY_HAT_COLORS = {
    tan: { label: "Tan" },
    black: { label: "Black" },
    white: { label: "White" },
    pink: { label: "Pink" },
    red: { label: "Red" },
    blue: { label: "Blue" },
    green: { label: "Green" },
    purple: { label: "Purple" },
    gold: { label: "Gold" },
  };
  var COWBOY_HAT_COLOR_IDS = Object.keys(COWBOY_HAT_COLORS);

  function normalizeCowboyHatColor(id) {
    id = String(id || "tan").toLowerCase();
    return COWBOY_HAT_COLOR_IDS.indexOf(id) >= 0 ? id : "tan";
  }


  var AVATAR_ORNAMENTS = {
    none: { label: "None", src: "" },
    "elegant-bow": { label: "Elegant bow", src: "assets/frames/ornament-elegant-bow-320.png" },
    bowtie: { label: "Bowtie", src: "assets/frames/ornament-bowtie-280.png" },
  };

  var ORNAMENT_IDS = Object.keys(AVATAR_ORNAMENTS);
  var ORNAMENT_POS_IDS = ["above", "below"];

  /* Default sticker positions (%) — approximate classic left-rail + feed */
  var DEFAULT_WIDGET_LAYOUT = {
    avatar: { x: 2, y: 3, z: 5, tilt: 0 },
    identity: { x: 2, y: 26, z: 4, tilt: 0 },
    slogan: { x: 22, y: 16, z: 4, tilt: 0 },
    social: { x: 2, y: 22, z: 4, tilt: 0 },
    music: { x: 2, y: 28, z: 6, tilt: 0 },
    badges: { x: 2, y: 38, z: 5, tilt: 0 },
    friends: { x: 2, y: 52, z: 4, tilt: 0 },
    html: { x: 22, y: 3, z: 3, tilt: 0 },
    calendar: { x: 55, y: 28, z: 5, tilt: 0 },
    polaroid: { x: 40, y: 6, z: 6, tilt: 0 },
  };
  /* Old scrapbook leans. A Rotate click adds 5° and that angle is kept. */
  var FACTORY_WIDGET_TILT = {
    avatar: -2,
    identity: 1,
    slogan: -1,
    music: -3,
    badges: 2,
    friends: -1,
    html: 2,
    calendar: -2,
  };

  function isArrivalTilt(id, tilt) {
    var n = typeof tilt === "number" ? tilt : parseFloat(tilt);
    if (isNaN(n) || n === 0) return false;
    /* Only the original factory leans. A 5° Rotate step must survive reload. */
    return !!(id && FACTORY_WIDGET_TILT[id] === n);
  }

  function settleArrivalTilts(p) {
    if (!p) return false;
    var changed = false;
    function clearTilt(obj, id) {
      if (!obj || typeof obj !== "object") return;
      if (!isArrivalTilt(id, obj.tilt)) return;
      obj.tilt = 0;
      changed = true;
    }
    var layout = p.widgetLayout;
    if (layout && typeof layout === "object") {
      Object.keys(layout).forEach(function (id) {
        clearTilt(layout[id], id);
      });
      /* Professional seed parked the name under the avatar, so the @ could not be clicked. */
      var idPos = layout.identity;
      if (idPos && idPos.x === 4 && idPos.y === 18 && idPos.z === 4 && (!idPos.tilt || idPos.tilt === 0)) {
        idPos.y = 26;
        changed = true;
      }
    }
    ["friendPinLayout", "badgePinLayout"].forEach(function (key) {
      var pins = p[key];
      if (!pins || typeof pins !== "object") return;
      Object.keys(pins).forEach(function (id) {
        clearTilt(pins[id], null);
      });
    });
    if (Array.isArray(p.quoteStickers)) {
      p.quoteStickers.forEach(function (q) {
        clearTilt(q, null);
      });
    }
    if (changed) {
      try { TowerProfileStore.save(p, { geometry: true }); } catch (eSettle) {}
    }
    return changed;
  }

  var PUBLIC_WIDGET_IDS = ["identity", "slogan", "social", "music", "badges", "friends", "html", "calendar"];
  var DEFAULT_PUBLIC_WIDGETS = {
    identity: true,
    slogan: true,
    social: true,
    music: true,
    badges: true,
    friends: true,
    html: true,
    calendar: true,
  };

  var WIDGET_UNDO_MAX = 12;

  function normalizePublicWidgets(raw) {
    var out = {};
    PUBLIC_WIDGET_IDS.forEach(function (id) {
      var defaultOn = DEFAULT_PUBLIC_WIDGETS[id] !== false;
      if (raw && typeof raw === "object" && Object.prototype.hasOwnProperty.call(raw, id)) {
        out[id] = raw[id] !== false;
      } else {
        out[id] = defaultOn;
      }
    });
    return out;
  }

  var TOWER_SIDE_KEY = "cognation.tower.side";
  var DEFAULT_PRIVATE_FEED_THEME = {
    backgroundColor: "#fff5f9",
    fontFamily: "georgia",
    fontSize: 16,
    textColor: "#4a2c3a",
    buttonColor: "#f4a4c4",
    authorSeeThrough: true,
    messagesSeeThrough: true,
  };

  var COLLAGE_LAYOUTS = {
    none: { cells: 0 },
    "grid-3x3": { cells: 9 },
    "grid-2x3": { cells: 6 },
    masonry: { cells: 9 },
    "hero-smalls": { cells: 5 },
    "polaroid-scatter": { cells: 9 },
  };

  var DEMO_COLLAGE_COLORS = [
    "#ffd6e8", "#f4a4c4", "#ffc1d9", "#ef8bb4", "#ffeaf3",
    "#f5b6d0", "#d489b0", "#ffd0e4", "#f7b8ce",
  ];


  var DEMO_FRIENDS = [{"id": "alex-rivera", "name": "Alex Rivera"}, {"id": "sam-okonkwo", "name": "Sam Okonkwo"}, {"id": "jordan-lee", "name": "Jordan Lee"}, {"id": "mira-chen", "name": "Mira Chen"}, {"id": "chris-patel", "name": "Chris Patel"}, {"id": "susan-park", "name": "Susan Park"}, {"id": "devon-brooks", "name": "Devon Brooks"}, {"id": "riley-nguyen", "name": "Riley Nguyen"}, {"id": "casey-morris", "name": "Casey Morris"}, {"id": "avery-kim", "name": "Avery Kim"}, {"id": "taylor-james", "name": "Taylor James"}, {"id": "morgan-diaz", "name": "Morgan Diaz"}, {"id": "quinn-foster", "name": "Quinn Foster"}, {"id": "harper-wong", "name": "Harper Wong"}, {"id": "alexa-thomas", "name": "Alexa Thomas"}];

  var BADGE_LABELS = {
    neighbor: "Neighbor",
    organizer: "Organizer",
    correspondent: "Correspondent",
    creator: "Creator",
    steward: "Steward",
    arts: "Arts",
    civic: "Civic",
    food: "Food",
    sports: "Sports",
    faith: "Faith",
    tech: "Tech",
    new: "New here",
    verified: "Verified neighbor",
    host: "Event host",
    helper: "Block helper",
  };

  /* Gifted / awarded pins — brands & people can pin onto a member Tower.
     Founder bottle-cap + patch are NOT here; they render only for isFounderOwner(). */
  var DEMO_AWARDED_BADGES = [
    {
      id: "award-red-peak-ski-1st",
      title: "1st Place · Skiing",
      subtitle: "Mountain Series",
      fromName: "Red Peak Athletics",
      fromHandle: "redpeak",
      fromBusinessId: "red-peak-athletics",
      kind: "brand",
      imageUrl: "assets/badges/award-redbull.svg",
      awardedAt: "2026-02-14T18:00:00.000Z",
      note: "Podium pin from Red Peak Athletics",
    },
    {
      id: "award-summit-bronze-track",
      title: "Bronze · Track",
      subtitle: "400m",
      fromName: "Summit Games",
      fromHandle: "summitgames",
      fromBusinessId: "summit-games",
      kind: "award",
      imageUrl: "assets/badges/award-olympic.svg",
      awardedAt: "2024-08-02T16:30:00.000Z",
      note: "Games-style medal from Summit Games",
    },
    {
      id: "award-peer-mira-neighbor",
      title: "Neighbor of the Block",
      subtitle: "Thanks for showing up",
      fromName: "Mira Chen",
      fromHandle: "mira-chen",
      kind: "peer",
      imageUrl: "assets/badges/award-peer.svg",
      awardedAt: "2026-09-01T12:00:00.000Z",
      note: "Peer pin from a demo friend",
    },
  ];

  function seedAwardedBadgesIfMissing(profile) {
    if (!profile) return profile;
    if (!Array.isArray(profile.awardedBadges)) {
      /* First-time: seed non-yearbook demos only. Yearbook pins are opt-in via Generate. */
      profile.awardedBadges = DEMO_AWARDED_BADGES.filter(function (b) {
        return b && b.kind !== "yearbook";
      }).map(function (b) {
        return JSON.parse(JSON.stringify(b));
      });
      return profile;
    }
    /* Preserve saved awardedBadges — do NOT auto-merge missing yearbook demos */
    return profile;
  }

  function getYearbookDemoDefs() {
    return DEMO_AWARDED_BADGES.filter(function (b) {
      return b && b.kind === "yearbook";
    });
  }

  function isBadgeVisible(profile, badgeId) {
    var vis = profile && profile.badgeVisibility;
    if (!vis || typeof vis !== "object") return false;
    return vis[badgeId] === true;
  }

  function ownedBadgeVisibilityIds(profile) {
    var ids = [];
    if (isFounderOwner(profile)) {
      ids.push("founder-cap", "founder-patch");
    }
    var list = (profile && profile.awardedBadges) || [];
    list.forEach(function (b) {
      if (!b || !b.id || b.kind === "founder") return;
      if (ids.indexOf(b.id) < 0) ids.push(b.id);
    });
    return ids;
  }

  /** Opt-in display map. Missing key = false. First-time null/undefined migrates all owned → true. */
  function normalizeBadgeVisibility(profile) {
    if (!profile) return { migrated: false };
    var owned = ownedBadgeVisibilityIds(profile);
    if (profile.badgeVisibility == null || typeof profile.badgeVisibility !== "object") {
      var vis = {};
      owned.forEach(function (id) {
        vis[id] = true;
      });
      profile.badgeVisibility = vis;
      return { migrated: true };
    }
    return { migrated: false };
  }

  function normalizeAvatarFrameScale(v) {
    var n = parseFloat(v);
    if (isNaN(n)) n = 1;
    return Math.max(0.65, Math.min(1.75, n));
  }

  function sanitizeProfileHtml(html) {
    var tmp = document.createElement("div");
    tmp.innerHTML = String(html || "");
    tmp.querySelectorAll("script, iframe, object, embed, link, meta").forEach(function (el) {
      el.remove();
    });
    tmp.querySelectorAll("*").forEach(function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (attr) {
        var n = attr.name.toLowerCase();
        if (n.indexOf("on") === 0 || n === "srcdoc" || (n === "href" && /^\s*javascript:/i.test(attr.value))) {
          el.removeAttribute(attr.name);
        }
      });
    });
    return tmp.innerHTML;
  }

  function getSessionObject() {
    try {
      if (window.CognationAuth && typeof window.CognationAuth.getSession === "function") {
        return window.CognationAuth.getSession();
      }
    } catch (e) {}
    try {
      var raw = localStorage.getItem("cognation.session.v2");
      if (raw) return JSON.parse(raw);
    } catch (e2) {}
    return null;
  }

  function resolveActiveProfileId() {
    var social = remoteSocial();
    if (social && social.getViewedProfileId) {
      var remoteId = social.getViewedProfileId();
      if (remoteId) return remoteId;
    }
    if (window.CognationAccounts && typeof window.CognationAccounts.ensureSeeded === "function") {
      try { window.CognationAccounts.ensureSeeded(); } catch (e) {}
    }
    var hash = (location.hash || "").replace(/^#/, "");
    if (hash.indexOf("tower-profile-") === 0) {
      var slug = hash.slice("tower-profile-".length);
      if (window.CognationAccounts && window.CognationAccounts.getProfileByHandle) {
        var byHash = window.CognationAccounts.getProfileByHandle(slug);
        if (byHash) return byHash.id;
      }
    }
    var session = getSessionObject();
    if (session && session.activeProfileId) return session.activeProfileId;
    if (session && session.username && window.CognationAccounts) {
      var list = window.CognationAccounts.getProfilesForUsername(session.username) || [];
      if (list.length) {
        var prefer = list.filter(function (p) {
          return p.kind === (session.profileKind || "personal");
        })[0] || list[0];
        return prefer.id;
      }
    }
    if (window.CognationAccounts && window.CognationAccounts.DEMO_ALEXA) {
      return window.CognationAccounts.DEMO_ALEXA.personalId;
    }
    return null;
  }

  function defaultEmptyProfileBlob() {
    return {
      displayName: "You",
      handle: "",
      slogan: "",
      socialLinks: {},
      avatarDataUrl: "",
      avatarFrame: "none",
      avatarFrameScale: 1,
      displayNameSize: 28,
      cowboyHatColor: "tan",
      avatarOrnament: "none",
      avatarOrnamentPos: "above",
      musicYoutubeWidth: 320,
      videoUrl: "",
      videoTitle: "",
      videoEnabled: true,
      videoWidth: 360,
      badges: { role: "", interest: "", status: "" },
      customHtml: "",
      awardedBadges: null,
      badgeVisibility: null,
      widgetLayout: null,
      publicWidgets: JSON.parse(JSON.stringify(DEFAULT_PUBLIC_WIDGETS)),
      friendPinLayout: {},
      badgePinLayout: {},
      quoteStickers: [],
      featuredFriendIds: [],
      friendsDisplayCount: 3,
      backgroundCollage: { layoutId: "none", cells: [] },
      towerFont: "georgia",
      feedBackgroundColor: "#fff5f9",
      publicTextColor: "#4a2c3a",
      publicButtonColor: "#f4a4c4",
      backgroundMode: "solid",
      backgroundHtml: "",
      backgroundImageDataUrl: "",
      privateFeedTheme: JSON.parse(JSON.stringify(DEFAULT_PRIVATE_FEED_THEME)),
      calendarEvents: null,
      calendarIcsUrl: "",
      calendarGoogleConnected: false,
    };
  }

  var SCRAPBOOK_LAYOUT_KEY = "cognation.scrapbookLayout.v1";

  function scrapbookLayoutKeys(p) {
    var keys = [];
    function add(value) {
      var key = value ? String(value).trim() : "";
      if (!key || keys.indexOf(key) >= 0) return;
      keys.push(key);
    }
    add(p && (p._profileId || p.id));
    add(p && p.handle);
    try {
      var hash = String(location.hash || "").replace(/^#/, "");
      if (hash.indexOf("tower-profile-") === 0) add(decodeURIComponent(hash.slice("tower-profile-".length)));
    } catch (eHash) {}
    if (!keys.length) keys.push("default");
    return keys;
  }

  function readScrapbookLayouts() {
    try {
      var raw = localStorage.getItem(SCRAPBOOK_LAYOUT_KEY);
      var doc = raw ? JSON.parse(raw) : {};
      return doc && typeof doc === "object" ? doc : {};
    } catch (eLayout) {
      return {};
    }
  }

  function readSavedScrapbook(p) {
    var doc = readScrapbookLayouts();
    var keys = scrapbookLayoutKeys(p);
    var i;
    for (i = 0; i < keys.length; i++) {
      var hit = doc[keys[i]];
      if (hit && hit.widgetLayout && typeof hit.widgetLayout === "object") return hit;
    }
    for (i = 0; i < keys.length; i++) {
      if (doc[keys[i]] && typeof doc[keys[i]] === "object") return doc[keys[i]];
    }
    return null;
  }

  function writeScrapbookLayout(p) {
    if (!p) return;
    var doc = readScrapbookLayouts();
    var prev = readSavedScrapbook(p) || {};
    var nextLayout = p.widgetLayout && typeof p.widgetLayout === "object" ? p.widgetLayout : prev.widgetLayout || null;
    var nextQuotes = Array.isArray(p.quoteStickers) && p.quoteStickers.length
      ? p.quoteStickers
      : (Array.isArray(prev.quoteStickers) ? prev.quoteStickers : []);
    var record = { widgetLayout: nextLayout, quoteStickers: nextQuotes };
    scrapbookLayoutKeys(p).forEach(function (key) {
      doc[key] = record;
    });
    try {
      localStorage.setItem(SCRAPBOOK_LAYOUT_KEY, JSON.stringify(doc));
    } catch (eWrite) {}
  }

  /* Remote profiles do not store widget x/y, and a refresh often still carries
     the spawn layout. The last drop on this profile wins over both. */
  function mergeScrapbookLayout(p) {
    if (!p) return p;
    var saved = readSavedScrapbook(p);
    if (!saved || typeof saved !== "object") return p;
    if (saved.widgetLayout && typeof saved.widgetLayout === "object") {
      var base = p.widgetLayout && typeof p.widgetLayout === "object" ? p.widgetLayout : {};
      Object.keys(saved.widgetLayout).forEach(function (id) {
        var pos = saved.widgetLayout[id];
        if (!pos || typeof pos !== "object") return;
        var cur = base[id] && typeof base[id] === "object" ? base[id] : {};
        base[id] = {
          x: layoutCoord(pos.x, layoutCoord(cur.x, 0)),
          y: layoutCoord(pos.y, layoutCoord(cur.y, 0)),
          z: layoutCoord(pos.z, layoutCoord(cur.z, 1)),
          tilt: layoutCoord(pos.tilt, layoutCoord(cur.tilt, 0)),
        };
      });
      p.widgetLayout = base;
    }
    if (Array.isArray(saved.quoteStickers) && saved.quoteStickers.length && (!Array.isArray(p.quoteStickers) || !p.quoteStickers.length)) {
      p.quoteStickers = saved.quoteStickers;
    }
    return p;
  }

  function layoutCoord(value, fallback) {
    var n = typeof value === "number" ? value : parseFloat(value);
    return isNaN(n) ? fallback : n;
  }

  var TowerProfileStore = {
    getActiveProfileId: resolveActiveProfileId,
    load: function () {
      var id = resolveActiveProfileId();
      var social = remoteSocial();
      if (social && social.getTowerProfile) {
        var remote = social.getTowerProfile(id);
        if (remote) return remote;
      }
      if (id && window.CognationAccounts && window.CognationAccounts.getProfileById) {
        var rec = window.CognationAccounts.getProfileById(id);
        if (rec) {
          return window.CognationAccounts.stripMeta
            ? window.CognationAccounts.stripMeta(rec)
            : rec;
        }
      }
      try {
        var raw = localStorage.getItem(TOWER_PROFILE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    },
    get: function () {
      var p = this.load();
      var created = false;
      var profileId = resolveActiveProfileId();
      var metaKind = "personal";
      var metaPhone = "";
      if (profileId && window.CognationAccounts && window.CognationAccounts.getProfileById) {
        var full = window.CognationAccounts.getProfileById(profileId);
        if (full) {
          metaKind = full.kind === "professional" ? "professional" : "personal";
          metaPhone = full.phone || "";
        }
      }
      if (!p) {
        created = true;
        p = defaultEmptyProfileBlob();
      }
      if (p._remote) {
        metaKind = p._profileKind === "professional" ? "professional" : "personal";
      }
      p._profileId = profileId || "";
      p._profileKind = metaKind;
      try { pruneEmptyPublicWidgetsInProfile(p); } catch (ePrune) {}
      p._profilePhone = metaPhone;
      if (!p.avatarFrame) p.avatarFrame = "none";
      else p.avatarFrame = normalizeFrameId(p.avatarFrame);
      p.avatarFrameScale = normalizeAvatarFrameScale(p.avatarFrameScale);
      p.displayNameSize = normalizeDisplayNameSize(p.displayNameSize);
      p.cowboyHatColor = normalizeCowboyHatColor(p.cowboyHatColor);
      if (!p.avatarOrnament) p.avatarOrnament = "none";
      else p.avatarOrnament = normalizeOrnamentId(p.avatarOrnament);
      if (!p.avatarOrnamentPos) p.avatarOrnamentPos = "above";
      else p.avatarOrnamentPos = normalizeOrnamentPos(p.avatarOrnamentPos);
      if (p.musicYoutubeWidth == null || isNaN(parseInt(p.musicYoutubeWidth, 10))) p.musicYoutubeWidth = 320;
      else p.musicYoutubeWidth = Math.max(180, Math.min(720, parseInt(p.musicYoutubeWidth, 10)));
      /* One YouTube player only (music/radio). Fold legacy videoUrl into musicUrl. */
      if ((!p.musicUrl || !String(p.musicUrl).trim()) && p.videoUrl && String(p.videoUrl).trim()) {
        p.musicUrl = String(p.videoUrl).trim();
        if (p.videoTitle && !p.musicTitle) p.musicTitle = p.videoTitle;
        p.musicEnabled = p.videoEnabled !== false;
      }
      if (p.publicWidgets && typeof p.publicWidgets === "object") {
        p.publicWidgets.video = false;
      }
      if (typeof p.videoUrl !== "string") p.videoUrl = p.videoUrl ? String(p.videoUrl) : "";
      if (typeof p.videoTitle !== "string") p.videoTitle = p.videoTitle ? String(p.videoTitle) : "";
      if (p.videoEnabled == null) p.videoEnabled = true;
      else p.videoEnabled = !!p.videoEnabled;
      if (p.videoWidth == null || isNaN(parseInt(p.videoWidth, 10))) p.videoWidth = 360;
      else p.videoWidth = Math.max(200, Math.min(900, parseInt(p.videoWidth, 10)));
      if (!p.friendPinLayout || typeof p.friendPinLayout !== "object") {
        p.friendPinLayout = {};
      }
      if (!p.badgePinLayout || typeof p.badgePinLayout !== "object") {
        p.badgePinLayout = {};
      }
      if (!Array.isArray(p.featuredFriendIds)) p.featuredFriendIds = [];
      else {
        p.featuredFriendIds = p.featuredFriendIds
          .map(function (id) { return String(id || ""); })
          .filter(Boolean);
      }
      var fdc = parseInt(p.friendsDisplayCount, 10);
      if ([3, 6, 8].indexOf(fdc) === -1) fdc = 3;
      p.friendsDisplayCount = fdc;
      p.featuredFriendIds = p.featuredFriendIds.slice(0, fdc);
      p.publicWidgets = normalizePublicWidgets(p.publicWidgets);
      if (!p.backgroundCollage || typeof p.backgroundCollage !== "object") {
        p.backgroundCollage = { layoutId: "none", cells: [] };
      }
      if (!p.towerFont) p.towerFont = "georgia";
      else p.towerFont = normalizeTowerFont(p.towerFont);
      if (!p.feedBackgroundColor) p.feedBackgroundColor = "#fff5f9";
      else p.feedBackgroundColor = normalizeFeedBgColor(p.feedBackgroundColor);
      p.publicTextColor = normalizePublicThemeColor(
        p.publicTextColor,
        "#4a2c3a"
      );
      p.publicButtonColor = normalizePublicThemeColor(
        p.publicButtonColor,
        "#f4a4c4"
      );
      p.backgroundMode = normalizeBackgroundMode(
        p.backgroundMode,
        p.backgroundCollage,
        p.backgroundHtml
      );
      if (typeof p.backgroundHtml !== "string") p.backgroundHtml = "";
      else p.backgroundHtml = sanitizeProfileHtml(String(p.backgroundHtml).slice(0, 8000));
      if (typeof p.backgroundImageDataUrl !== "string" || p.backgroundImageDataUrl.indexOf("data:image/") !== 0) {
        p.backgroundImageDataUrl = "";
      }
      if (typeof p.slogan !== "string") p.slogan = p.slogan ? String(p.slogan) : "";
      else p.slogan = String(p.slogan).slice(0, 400);
      p.privateFeedTheme = normalizePrivateFeedTheme(p.privateFeedTheme);
      /* A live Supabase profile does not store demo badges or calendar rows.
         Seeding them made every read look unsaved, and save() dispatched
         cognation:tower-profile-updated. tower-follow syncAll calls get()
         again, which overflowed the stack and flooded PATCH /profiles the
         moment Sign in closed the gate. Render remote profiles as-is. */
      if (usingRemoteSocial() || p._remote) {
        if (!Array.isArray(p.awardedBadges)) p.awardedBadges = [];
        if (!p.badgeVisibility || typeof p.badgeVisibility !== "object") p.badgeVisibility = {};
        if (!Array.isArray(p.calendarEvents)) p.calendarEvents = [];
        if (typeof p.calendarIcsUrl !== "string") p.calendarIcsUrl = "";
        if (p.calendarGoogleConnected == null) p.calendarGoogleConnected = false;
        mergeScrapbookLayout(p);
        return p;
      }
      var before = p.awardedBadges;
      var beforeLen = Array.isArray(before) ? before.length : -1;
      var beforeVis = p.badgeVisibility;
      seedAwardedBadgesIfMissing(p);
      var calSeeded = seedCalendarEventsIfMissing(p);
      var visMig = normalizeBadgeVisibility(p);
      var afterLen = Array.isArray(p.awardedBadges) ? p.awardedBadges.length : -1;
      mergeScrapbookLayout(p);
      if (created || before == null || afterLen > beforeLen || beforeVis == null || visMig.migrated || calSeeded) {
        try {
          this.save(p);
        } catch (e) {}
      }
      return p;
    },
    save: function (data, opts) {
      /* Listeners of tower-profile-updated call get(), which can call save().
         A re-entrant save is what turned one profile read into a stack overflow. */
      if (this._saving) return false;
      this._saving = true;
      try {
      data = data || {};
      opts = opts || {};
      writeScrapbookLayout(data);
      var id = data._profileId || resolveActiveProfileId();
      /* A drop only changes x/y. Never PATCH the profile: that reload paints
         the remote row, which has no sticker coordinates, and the widget
         jumps back to its spawn point the moment the pointer goes up. */
      if (!opts.geometry && usingRemoteSocial() && id) {
        var social = remoteSocial();
        var activeSession = getSessionObject();
        var remoteRow = social && social.getProfile ? social.getProfile(id) : null;
        var identityChanged = !remoteRow ||
          String(data.displayName || "").trim() !== String(remoteRow.display_name || "").trim() ||
          String(data.handle || "").trim() !== String(remoteRow.handle || "").trim() ||
          String(data.slogan || "").trim() !== String(remoteRow.bio || "").trim();
        /* A drop only changes x/y. Skip the profile PATCH so the page does not
           reload the remote profile and snap the sticker back to its spawn point. */
        if (
          identityChanged &&
          social &&
          social.updateCurrentProfile &&
          activeSession &&
          id === activeSession.activeProfileId
        ) {
          social.updateCurrentProfile({
            displayName: data.displayName,
            handle: data.handle,
            bio: data.slogan,
          }).catch(function () {});
        }
      }
      var towerBlob = {};
      Object.keys(data).forEach(function (k) {
        if (k.charAt(0) === "_") return;
        towerBlob[k] = data[k];
      });
      if (opts.geometry) {
        if (id && window.CognationAccounts && typeof window.CognationAccounts.updateProfileTower === "function") {
          try { window.CognationAccounts.updateProfileTower(id, towerBlob); } catch (eGeo) {}
        }
        try { localStorage.setItem(TOWER_PROFILE_KEY, JSON.stringify(towerBlob)); } catch (eGeo2) {}
        return true;
      }
      if (id && window.CognationAccounts && typeof window.CognationAccounts.updateProfileTower === "function") {
        var result = window.CognationAccounts.updateProfileTower(id, towerBlob);
        if (result && result.ok) {
          document.dispatchEvent(new CustomEvent("cognation:tower-profile-updated", { detail: towerBlob }));
          return true;
        }
        /* Quota is swallowed inside the accounts write and used to come back
           as ok. Treating that as success made the avatar handler re-read an
           unchanged profile and leave the old initials in place. */
        if (result && result.error === "storage") return false;
      }
      try {
        localStorage.setItem(TOWER_PROFILE_KEY, JSON.stringify(towerBlob));
        document.dispatchEvent(new CustomEvent("cognation:tower-profile-updated", { detail: towerBlob }));
        return true;
      } catch (e) {
        /* Quota / private mode — retry without bulky fields */
        try {
          var slim = JSON.parse(JSON.stringify(towerBlob || {}));
          if (slim.avatarDataUrl && String(slim.avatarDataUrl).length > 200000) {
            slim.avatarDataUrl = "";
          }
          if (slim.backgroundCollage && Array.isArray(slim.backgroundCollage.cells)) {
            slim.backgroundCollage.cells = slim.backgroundCollage.cells.map(function (c) {
              if (c && c.url && String(c.url).indexOf("data:") === 0) {
                return { color: (c && c.color) || "#fff5f9" };
              }
              return c;
            });
          }
          if (slim.backgroundHtml && String(slim.backgroundHtml).length > 12000) {
            slim.backgroundHtml = String(slim.backgroundHtml).slice(0, 8000);
          }
          if (slim.backgroundImageDataUrl && String(slim.backgroundImageDataUrl).length > 500000) {
            slim.backgroundImageDataUrl = "";
          }
          if (id && window.CognationAccounts && window.CognationAccounts.updateProfileTower) {
            window.CognationAccounts.updateProfileTower(id, slim);
          }
          localStorage.setItem(TOWER_PROFILE_KEY, JSON.stringify(slim));
          document.dispatchEvent(new CustomEvent("cognation:tower-profile-updated", { detail: slim }));
          return true;
        } catch (e2) {
          return false;
        }
      }
      } finally {
        this._saving = false;
      }
    },
  };

  window.CognationTowerProfileStore = TowerProfileStore;

  var SEED = [
    {
      id: "tower-1",
      authorName: "Alex Rivera",
      body: "East wing library late night — brought notes from the zoning packet.",
      createdAt: "2026-09-15T18:30:00.000Z",
      attachments: [{ kind: "note", label: "Zoning notes.pdf", name: "Zoning notes.pdf" }],
      likes: 42,
    },
    {
      id: "tower-2",
      authorName: "Sam Okonkwo",
      body: "@friendsoffriends Market square this morning. Peach stand line hit the fountain again.",
      createdAt: "2026-09-15T17:05:00.000Z",
      attachments: [{ kind: "photo", label: "Square photo", name: "market-square.jpg" }],
      likes: 128,
      audience: "friends_of_friends",
      shareBeyondFriends: true,
    },
    {
      id: "tower-3",
      authorName: "Jordan Lee",
      body: "Saturday block party invite — bring a dish if you can.",
      createdAt: "2026-09-15T15:40:00.000Z",
      attachments: [{ kind: "document", label: "Party invitation", name: "block-party-invite.pdf" }],
      likes: 96,
    },
    {
      id: "tower-4",
      authorName: "Mira Chen",
      body: "Short clip from the river walk mural going up.",
      createdAt: "2026-09-15T14:10:00.000Z",
      attachments: [{ kind: "video", label: "Mural clip", name: "mural-walk.mp4" }],
      likes: 77,
    },
    {
      id: "tower-5",
      authorName: "Chris Patel",
      body: "Creative study: cyan ink wash of the tower silhouette.",
      createdAt: "2026-09-15T12:55:00.000Z",
      attachments: [{ kind: "art", label: "Tower silhouette", name: "tower-ink.png" }],
      likes: 61,
    },
  ];

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatTime(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch (e) {
      return iso || "";
    }
  }

  function kindLabel(kind) {
    switch (kind) {
      case "photo":
        return "Photo";
      case "note":
        return "Notes";
      case "video":
        return "Video";
      case "art":
        return "Creative";
      case "document":
        return "Document";
      default:
        return "Upload";
    }
  }

  function clearLegacyReactionSelections(data) {
    try {
      if (localStorage.getItem(REACTION_CLEANUP_KEY)) return false;
      var changed = false;
      (data.posts || []).forEach(function (post) {
        if (!post || !post.reactions || typeof post.reactions !== "object") return;
        Object.keys(post.reactions).forEach(function (face) {
          var users = Array.isArray(post.reactions[face]) ? post.reactions[face] : [];
          var filtered = users.filter(function (user) {
            return String(user || "").toLowerCase() !== "you" &&
              String(user || "").toLowerCase() !== "alexa";
          });
          if (filtered.length === users.length) return;
          changed = true;
          if (filtered.length) post.reactions[face] = filtered;
          else delete post.reactions[face];
        });
      });
      localStorage.setItem(REACTION_CLEANUP_KEY, "1");
      return changed;
    } catch (e) {
      return false;
    }
  }

  var TowerStore = {
    load: function () {
      try {
        var raw = localStorage.getItem(TOWER_KEY);
        if (!raw) return null;
        var data = JSON.parse(raw);
        if (!data || !Array.isArray(data.posts)) return null;
        return data;
      } catch (e) {
        return null;
      }
    },
    save: function (data) {
      try {
        localStorage.setItem(TOWER_KEY, JSON.stringify(data));
        return true;
      } catch (e) {
        return false;
      }
    },
    list: function () {
      var data = this.load();
      if (usingRemoteSocial() && (!data || !data.remote)) {
        return [];
      }
      if (!data) {
        data = { version: 1, posts: JSON.parse(JSON.stringify(SEED)) };
        this.save(data);
      }
      if (clearLegacyReactionSelections(data)) this.save(data);
      return data.posts.slice().sort(function (a, b) {
        return String(b.createdAt).localeCompare(String(a.createdAt));
      });
    },
    setRemotePosts: function (posts) {
      var data = {
        version: 2,
        remote: true,
        posts: Array.isArray(posts) ? posts.slice() : [],
      };
      this.save(data);
      document.dispatchEvent(
        new CustomEvent("cognation:tower-updated", { detail: { remote: true } })
      );
      return data.posts;
    },
    toggleReaction: function (postId, face) {
      face = String(face || "");
      if (!face) return { ok: false, error: "Missing reaction." };
      var data = this.load();
      if (!data) {
        data = { version: 1, posts: JSON.parse(JSON.stringify(SEED)) };
      }
      var me = "you";
      try {
        var sess = localStorage.getItem("cognation.session.v2");
        if (sess) {
          var parsed = JSON.parse(sess);
          if (parsed && parsed.username) me = String(parsed.username).toLowerCase();
        }
      } catch (e) {}
      var found = null;
      data.posts.forEach(function (p) {
        if (p && p.id === postId) found = p;
      });
      if (!found) return { ok: false, error: "Post not found." };
      if (!found.reactions || typeof found.reactions !== "object") found.reactions = {};
      var list = Array.isArray(found.reactions[face]) ? found.reactions[face].slice() : [];
      var ix = list.indexOf(me);
      if (ix >= 0) list.splice(ix, 1);
      else list.push(me);
      if (list.length) found.reactions[face] = list;
      else delete found.reactions[face];
      /* keep likes roughly in sync with heart count for legacy display */
      if (face === "❤️") found.likes = list.length || found.likes || 0;
      if (!this.save(data)) return { ok: false, error: "Could not save reaction." };
      return { ok: true, post: found };
    },
    add: function (fields) {
      if (usingRemoteSocial()) {
        return {
          ok: false,
          error: "Tower is syncing with Cognation. Please try posting again.",
        };
      }
      var body = String((fields && fields.body) || "").trim();
      if (!body && !(fields && fields.attachments && fields.attachments.length)) {
        return { ok: false, error: "Add a note or an upload." };
      }
      var data = this.load() || { version: 1, posts: [] };
      var post = {
        id: "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        authorName: (fields && fields.authorName) || "You",
        body: body.slice(0, 2000),
        createdAt: new Date().toISOString(),
        attachments: (fields && fields.attachments) || [],
        likes: 0,
        handle: (window.CognationTowerProfileStore
          ? normalizeHandle(window.CognationTowerProfileStore.get().handle || "")
          : ""),
      };
      data.posts.unshift(post);
      if (!this.save(data)) return { ok: false, error: "Could not save post." };
      document.dispatchEvent(
        new CustomEvent("cognation:tower-updated", { detail: { post: post } })
      );
      return { ok: true, post: post };
    },
  };

  window.CognationTowerStore = TowerStore;

  function renderAttachments(list) {
    if (!list || !list.length) return "";
    return (
      '<ul class="tower-attachments">' +
      list
        .map(function (a) {
          return (
            '<li class="tower-attach tower-attach--' +
            escapeHtml(a.kind || "document") +
            '">' +
            '<span class="tower-attach-kind">' +
            escapeHtml(kindLabel(a.kind)) +
            "</span> " +
            '<span class="tower-attach-name">' +
            escapeHtml(a.label || a.name || "file") +
            "</span></li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  var TOWER_POST_REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🔥"];

  function towerReactionViewerId() {
    try {
      var sess = localStorage.getItem("cognation.session.v2");
      if (sess) {
        var parsed = JSON.parse(sess);
        if (parsed && parsed.username) return String(parsed.username).toLowerCase();
      }
    } catch (e) {}
    return "you";
  }

  function buildTowerPostReactBar(post, root) {
    var wrap = document.createElement("div");
    wrap.className = "tower-post-reactbar";
    wrap.setAttribute("data-tower-post-id", post.id || "");

    var me = towerReactionViewerId();
    var reactions = post.reactions && typeof post.reactions === "object" ? post.reactions : {};
    var controls = document.createElement("div");
    controls.className = "tower-react-controls";
    TOWER_POST_REACTIONS.forEach(function (face) {
      var users = Array.isArray(reactions[face]) ? reactions[face] : [];
      var mine = users.indexOf(me) >= 0;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tower-react-face" + (mine ? " is-mine" : "");
      b.setAttribute("data-tower-react", face);
      b.setAttribute("aria-pressed", mine ? "true" : "false");
      b.setAttribute("aria-label", (mine ? "Remove your " : "React with ") + face);
      b.textContent = face;
      /* Bind directly to the control so the reaction remains clickable inside
         profile layouts that add their own pointer/drag interactions. */
      b.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var result = TowerStore.toggleReaction(post.id, face);
        if (!result.ok) return;
        renderFeed(root);
      });
      controls.appendChild(b);
    });
    wrap.appendChild(controls);
    return wrap;
  }


  function postAuthorFromProfile(profile) {
    profile = profile || TowerProfileStore.get();
    var name = String((profile && profile.displayName) || "").trim();
    if (name && name.toLowerCase() !== "you") return name.slice(0, 80);
    var handle = normalizeHandle((profile && profile.handle) || "");
    if (handle) return handle;
    try {
      var sess = localStorage.getItem("cognation.session.v2");
      if (sess) {
        var parsed = JSON.parse(sess);
        if (parsed && parsed.username) return String(parsed.username).trim().slice(0, 80);
      }
    } catch (e) {}
    return name || "You";
  }

  function renderFeed(root) {
    var list = root.querySelector("[data-tower-feed]");
    if (!list) return;
    var posts = TowerStore.list();
    list.innerHTML = "";
    if (!posts.length) {
      list.innerHTML = '<p class="commune-empty">No Tower posts yet — share the first update.</p>';
      return;
    }
    posts.forEach(function (post) {
      var article = document.createElement("article");
      article.className = "tower-post";
      article.setAttribute("data-tower-post", post.id || "");
      article.innerHTML =
        '<header class="tower-post-meta">' +
        '<span class="tower-author">' +
        escapeHtml(post.authorName || "Neighbor") +
        "</span>" +
        '<time datetime="' +
        escapeHtml(post.createdAt) +
        '">' +
        escapeHtml(formatTime(post.createdAt)) +
        "</time></header>" +
        (post.body
          ? '<p class="tower-post-body">' + escapeHtml(post.body) + "</p>"
          : "") +
        renderAttachments(post.attachments);
      article.appendChild(buildTowerPostReactBar(post, root));
      list.appendChild(article);
    });
  }

  function initials(name) {
    var parts = String(name || "?").trim().split(/\s+/);
    var a = (parts[0] && parts[0][0]) || "?";
    var b = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (a + b).toUpperCase();
  }

  function renderBadges(root, badges) {
    var el =
      root.querySelector("[data-tower-badges]:not(details)") ||
      root.querySelector("[data-tower-badge-stage]") ||
      null;
    if (!el) return;
    if (el.tagName && el.tagName.toLowerCase() === "details") return;
    el.innerHTML = "";
    ["role", "interest", "status"].forEach(function (k) {
      var v = badges && badges[k];
      if (!v) return;
      var span = document.createElement("span");
      span.className = "tower-badge";
      span.textContent = BADGE_LABELS[v] || v;
      el.appendChild(span);
    });
  }

  var TOWER_FONT_MAP = {
    georgia: 'Georgia, "Times New Roman", Times, serif',
    chomsky: '"Chomsky", "Old English Text MT", Georgia, serif',
    system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    serif: 'Georgia, "Palatino Linotype", Palatino, "Times New Roman", serif',
    sans: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    scrapbook: '"Comic Sans MS", "Chalkboard SE", "Marker Felt", cursive',
  };

  var TOWER_FONT_IDS = Object.keys(TOWER_FONT_MAP);
  var DEFAULT_FEED_BG = "#fff5f9";

  function normalizeTowerFont(id) {
    id = String(id || "georgia").toLowerCase();
    return TOWER_FONT_IDS.indexOf(id) >= 0 ? id : "georgia";
  }

  function normalizeFeedBgColor(raw) {
    var s = String(raw || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      return ("#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
    }
    return DEFAULT_FEED_BG;
  }

  function normalizePrivateFontSize(n) {
    var v = parseInt(n, 10);
    if ([14, 16, 18, 20].indexOf(v) === -1) return 16;
    return v;
  }

  function normalizePublicThemeColor(raw, fallback) {
    var fb = fallback || "#4a2c3a";
    var s = String(raw || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      return ("#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
    }
    return fb;
  }

  function normalizeBackgroundMode(mode, collage, html) {
    var m = String(mode || "").toLowerCase().trim();
    if (m === "solid" || m === "collage" || m === "html") return m;
    /* Migration: infer from existing collage / html */
    if (html && String(html).trim()) return "html";
    if (collage && collage.layoutId && collage.layoutId !== "none" && COLLAGE_LAYOUTS[collage.layoutId]) {
      return "collage";
    }
    return "solid";
  }

  function normalizePrivateFeedTheme(raw) {
    var t = raw && typeof raw === "object" ? raw : {};
    return {
      backgroundColor: normalizeFeedBgColor(t.backgroundColor || DEFAULT_PRIVATE_FEED_THEME.backgroundColor),
      fontFamily: normalizeTowerFont(t.fontFamily || DEFAULT_PRIVATE_FEED_THEME.fontFamily),
      fontSize: normalizePrivateFontSize(t.fontSize != null ? t.fontSize : DEFAULT_PRIVATE_FEED_THEME.fontSize),
      textColor: (function () {
        var rawC = t.textColor || DEFAULT_PRIVATE_FEED_THEME.textColor;
        var c = normalizeFeedBgColor(rawC);
        /* normalizeFeedBgColor falls back to pink feed bg — keep private text dark */
        if (c === DEFAULT_FEED_BG && String(rawC || "").toLowerCase() !== DEFAULT_FEED_BG) {
          return DEFAULT_PRIVATE_FEED_THEME.textColor;
        }
        return c;
      })(),
      buttonColor: (function () {
        var rawB = t.buttonColor || DEFAULT_PRIVATE_FEED_THEME.buttonColor;
        var c = normalizeFeedBgColor(rawB);
        if (c === DEFAULT_FEED_BG && String(rawB || "").toLowerCase() !== DEFAULT_FEED_BG) {
          return DEFAULT_PRIVATE_FEED_THEME.buttonColor;
        }
        return c;
      })(),
      authorSeeThrough: t.authorSeeThrough !== false,
      messagesSeeThrough: t.messagesSeeThrough !== false,
    };
  }

  function getSessionUsername() {
    try {
      var session =
        (window.CognationAuth &&
          typeof window.CognationAuth.getSession === "function" &&
          window.CognationAuth.getSession()) ||
        null;
      if (!session) {
        try {
          var raw = localStorage.getItem("cognation.session.v2");
          if (raw) session = JSON.parse(raw);
        } catch (e) {}
      }
      return session && session.username ? String(session.username).trim().toLowerCase() : "";
    } catch (e2) {
      return "";
    }
  }

  /** Logged-in viewer owns the currently resolved Tower profile. */
  function isTowerOwner(profile) {
    var remoteSession = getSessionObject();
    profile = profile || TowerProfileStore.get();
    if (
      remoteSession &&
      remoteSession.source === "supabase" &&
      remoteSession.activeProfileId &&
      profile &&
      profile._profileId === remoteSession.activeProfileId
    ) {
      return true;
    }
    var user = getSessionUsername();
    if (!user) return false;
    if (window.CognationAccounts) {
      var id = (profile && profile._profileId) || TowerProfileStore.getActiveProfileId();
      var rec = id ? window.CognationAccounts.getProfileById(id) : null;
      if (rec && String(rec.accountUsername || "").toLowerCase() === user) return true;
      var mine = window.CognationAccounts.getProfilesForUsername(user) || [];
      if (mine.length) {
        var handle = normalizeHandle((profile && profile.handle) || "");
        for (var i = 0; i < mine.length; i++) {
          if (normalizeHandle(mine[i].handle) === handle && handle) return true;
          if (mine[i].id === id) return true;
        }
      }
    }
    var handle2 = String((profile && profile.handle) || "")
      .trim()
      .toLowerCase()
      .replace(/^@/, "");
    if (user === "alexa" && (!handle2 || handle2 === "alexa" || handle2 === "alexa-pro")) return true;
    if (handle2 && handle2 === user) return true;
    return false;
  }

  function profilePublicSlug(profile) {
    profile = profile || TowerProfileStore.get();
    var handleVal = normalizeHandle((profile && profile.handle) || "");
    if (handleVal) return handleVal;
    /* Demo founder without a saved handle still shares as /alexa */
    if (isFounderOwner(profile)) return "alexa";
    var fromName = String((profile && profile.displayName) || "you")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return fromName || "you";
  }

  function profilePublicHash(profile) {
    return "tower-profile-" + profilePublicSlug(profile);
  }

  function profilePublicUrl(profile) {
    var hash = profilePublicHash(profile);
    try {
      var u = new URL(window.location.href);
      u.hash = hash;
      return u.toString();
    } catch (e) {
      return (window.location.origin || "") + (window.location.pathname || "/") + "#" + hash;
    }
  }

  function readStoredTowerSide() {
    try {
      var v = sessionStorage.getItem(TOWER_SIDE_KEY);
      if (v === "private" || v === "public") return v;
    } catch (e) {}
    return null;
  }

  function writeStoredTowerSide(side) {
    try {
      sessionStorage.setItem(TOWER_SIDE_KEY, side === "public" ? "public" : "private");
    } catch (e) {}
  }

  function hashRequestsPublicSide() {
    var hash = (location.hash || "").replace(/^#/, "");
    return !!(hash && hash.indexOf("tower-profile-") === 0);
  }

  function applyPrivateFeedTheme(root, theme) {
    theme = normalizePrivateFeedTheme(theme);
    var privateSide = root.querySelector("[data-tower-private-side]");
    if (!privateSide) return;
    var fontStack = TOWER_FONT_MAP[theme.fontFamily] || TOWER_FONT_MAP.georgia;
    privateSide.style.setProperty("--tower-private-bg", theme.backgroundColor);
    privateSide.style.setProperty("--tower-private-font", fontStack);
    privateSide.style.setProperty("--tower-private-font-size", theme.fontSize + "px");
    privateSide.style.setProperty("--tower-private-text", theme.textColor);
    privateSide.style.setProperty("--tower-private-btn", theme.buttonColor);
    privateSide.setAttribute("data-tower-private-font", theme.fontFamily);
    privateSide.setAttribute("data-author-see-through", theme.authorSeeThrough ? "true" : "false");
    privateSide.setAttribute("data-messages-see-through", theme.messagesSeeThrough ? "true" : "false");
    var bgIn = root.querySelector("[data-tower-private-bg]");
    var fontIn = root.querySelector("[data-tower-private-font]");
    var sizeIn = root.querySelector("[data-tower-private-font-size]");
    var textIn = root.querySelector("[data-tower-private-text]");
    var btnIn = root.querySelector("[data-tower-private-btn]");
    var authorSee = root.querySelector("[data-tower-private-author-see-through]");
    var msgSee = root.querySelector("[data-tower-private-messages-see-through]");
    if (bgIn && document.activeElement !== bgIn) bgIn.value = theme.backgroundColor;
    if (fontIn && document.activeElement !== fontIn) fontIn.value = theme.fontFamily;
    if (sizeIn && document.activeElement !== sizeIn) sizeIn.value = String(theme.fontSize);
    if (textIn && document.activeElement !== textIn) textIn.value = theme.textColor;
    if (btnIn && document.activeElement !== btnIn) btnIn.value = theme.buttonColor;
    if (authorSee) authorSee.checked = !!theme.authorSeeThrough;
    if (msgSee) msgSee.checked = !!theme.messagesSeeThrough;
  }

  function readPrivateFeedThemeFromForm(root) {
    var bgIn = root.querySelector("[data-tower-private-bg]");
    var fontIn = root.querySelector("[data-tower-private-font]");
    var sizeIn = root.querySelector("[data-tower-private-font-size]");
    var textIn = root.querySelector("[data-tower-private-text]");
    var btnIn = root.querySelector("[data-tower-private-btn]");
    var authorSee = root.querySelector("[data-tower-private-author-see-through]");
    var msgSee = root.querySelector("[data-tower-private-messages-see-through]");
    return normalizePrivateFeedTheme({
      backgroundColor: bgIn ? bgIn.value : DEFAULT_PRIVATE_FEED_THEME.backgroundColor,
      fontFamily: fontIn ? fontIn.value : DEFAULT_PRIVATE_FEED_THEME.fontFamily,
      fontSize: sizeIn ? sizeIn.value : DEFAULT_PRIVATE_FEED_THEME.fontSize,
      textColor: textIn ? textIn.value : DEFAULT_PRIVATE_FEED_THEME.textColor,
      buttonColor: btnIn ? btnIn.value : DEFAULT_PRIVATE_FEED_THEME.buttonColor,
      authorSeeThrough: authorSee ? !!authorSee.checked : true,
      messagesSeeThrough: msgSee ? !!msgSee.checked : true,
    });
  }

  function syncPublicUrlFields(root, profile) {
    var url = profilePublicUrl(profile);
    root.querySelectorAll("[data-tower-public-url], [data-tower-public-url-preview]").forEach(function (el) {
      if (document.activeElement !== el) el.value = url;
    });
  }

  function applyTowerSide(root, side, opts) {
    opts = opts || {};
    var owner = isTowerOwner(TowerProfileStore.get());
    root.setAttribute("data-tower-is-owner", owner ? "true" : "false");
    if (!owner) side = "public";
    side = side === "public" ? "public" : "private";
    root.setAttribute("data-tower-side", side);
    var privateSide = root.querySelector("[data-tower-private-side]");
    var publicSide = root.querySelector("[data-tower-public-side]");
    if (privateSide) {
      privateSide.hidden = side !== "private";
      privateSide.setAttribute("aria-hidden", side === "private" ? "false" : "true");
    }
    if (publicSide) {
      publicSide.hidden = side !== "public";
      publicSide.setAttribute("aria-hidden", side === "public" ? "false" : "true");
    }
    root.querySelectorAll("[data-tower-side-btn]").forEach(function (btn) {
      var on = btn.getAttribute("data-tower-side-btn") === side;
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.classList.toggle("is-selected", on);
      btn.tabIndex = on ? 0 : -1;
    });
    var toggle = root.querySelector("[data-tower-side-toggle]");
    if (toggle) toggle.hidden = !owner;
    if (opts.persist !== false && owner) writeStoredTowerSide(side);
    /* Re-apply sticker layout when showing public so positions paint after unhide */
    if (side === "public") {
      try {
        var cur = TowerProfileStore.get();
        applyWidgetLayout(root, cur);
        applyPublicWidgets(root, cur);
        renderBadgePins(root, cur);
        syncOwnerStickerHandles(root);
        initTowerMusic(root, cur);
        initTowerVideo(root, cur);
        syncRotateToolbar(root);
        syncProfileKindToggle(root);
        refreshTowerCalendars(root);
      } catch (e) {}
    } else {
      try {
        syncOwnerStickerHandles(root);
        clearWidgetSelection(root.querySelector("[data-tower-scrapbook]"));
        syncRotateToolbar(root);
        refreshTowerCalendars(root);
      } catch (e2) {}
    }
  }

  function initTowerSideToggle(root) {
    if (!root || root.__cognationSideBound) return;
    root.__cognationSideBound = true;
    var owner = isTowerOwner(TowerProfileStore.get());
    var initial = "public";
    if (owner) {
      if (hashRequestsPublicSide()) initial = "public";
      else initial = readStoredTowerSide() || "private";
    } else {
      initial = "public";
    }
    applyTowerSide(root, initial, { persist: false });
    if (owner) writeStoredTowerSide(initial);

    root.querySelectorAll("[data-tower-side-btn]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        applyTowerSide(root, btn.getAttribute("data-tower-side-btn") || "private");
      });
    });

    window.addEventListener("hashchange", function () {
      if (hashRequestsPublicSide()) {
        applyTowerSide(root, "public");
      }
    });

    document.addEventListener("cognation:session-started", function () {
      var o = isTowerOwner(TowerProfileStore.get());
      var side = o ? readStoredTowerSide() || "private" : "public";
      if (hashRequestsPublicSide()) side = "public";
      applyTowerSide(root, side);
      syncPublicUrlFields(root, TowerProfileStore.get());
    });
  }

  function initPrivateFeedThemeControls(root) {
    if (!root || root.__cognationPrivateThemeBound) return;
    root.__cognationPrivateThemeBound = true;
    var saveBtn = root.querySelector("[data-tower-private-theme-save]");
    var status = root.querySelector("[data-tower-private-theme-status]");
    function setStatus(msg, isError) {
      if (!status) return;
      status.hidden = !msg;
      status.textContent = msg || "";
      status.classList.toggle("is-error", !!isError);
    }
    function livePreview() {
      applyPrivateFeedTheme(root, readPrivateFeedThemeFromForm(root));
    }
    ["data-tower-private-bg", "data-tower-private-font", "data-tower-private-font-size", "data-tower-private-text", "data-tower-private-btn", "data-tower-private-author-see-through", "data-tower-private-messages-see-through"].forEach(function (sel) {
      var el = root.querySelector("[" + sel + "]");
      if (!el) return;
      el.addEventListener("input", livePreview);
      el.addEventListener("change", livePreview);
    });
    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        var p = TowerProfileStore.get();
        p.privateFeedTheme = readPrivateFeedThemeFromForm(root);
        if (!TowerProfileStore.save(p)) {
          setStatus("Could not save feed look.", true);
          return;
        }
        applyPrivateFeedTheme(root, p.privateFeedTheme);
        setStatus("Feed look saved (private only).", false);
      });
    }
  }

  function initPublicUrlCopy(root) {
    if (!root || root.__cognationPublicUrlBound) return;
    root.__cognationPublicUrlBound = true;
    root.querySelectorAll("[data-tower-copy-public-url]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var url = profilePublicUrl(TowerProfileStore.get());
        syncPublicUrlFields(root, TowerProfileStore.get());
        function ok() {
          var prev = btn.textContent;
          btn.textContent = "Copied";
          window.setTimeout(function () {
            btn.textContent = prev;
          }, 1200);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(ok).catch(function () {
            var input = root.querySelector("[data-tower-public-url]") || root.querySelector("[data-tower-public-url-preview]");
            if (input) {
              input.focus();
              input.select();
            }
          });
        } else {
          var input2 = root.querySelector("[data-tower-public-url]") || root.querySelector("[data-tower-public-url-preview]");
          if (input2) {
            input2.focus();
            input2.select();
            try {
              document.execCommand("copy");
              ok();
            } catch (e) {}
          }
        }
      });
    });
  }

  /** Founder bottle-cap + patch: exclusive to Alexa (login user alexa / her profile).
   *  Non-alexa profile handles never show Founder. Gifted awards are unrelated. */
  function isFounderOwner(profile) {
    if (!profile) {
      try {
        profile = TowerProfileStore.load() || {};
      } catch (e0) {
        profile = {};
      }
    }
    var handle = String((profile && profile.handle) || "")
      .trim()
      .toLowerCase()
      .replace(/^@/, "");
    var name = String((profile && profile.displayName) || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    var nameIsAlexa =
      name === "alexa" ||
      name === "alexa thomas" ||
      name === "alexa j thomas" ||
      name === "alexa j. thomas";

    /* Explicit non-alexa profile identity → never Founder */
    if (handle && handle !== "alexa") return false;
    if (name && name !== "you" && !nameIsAlexa && handle !== "alexa") {
      /* named as someone else without alexa handle */
      if (!handle) return false;
    }

    if (handle === "alexa" || nameIsAlexa) return true;

    /* Default / empty profile owned by logged-in alexa */
    var user = "";
    try {
      var session =
        (window.CognationAuth &&
          typeof window.CognationAuth.getSession === "function" &&
          window.CognationAuth.getSession()) ||
        null;
      if (!session) {
        try {
          var raw = localStorage.getItem("cognation.session.v2");
          if (raw) session = JSON.parse(raw);
        } catch (e) {}
      }
      user = session && session.username ? String(session.username).trim().toLowerCase() : "";
    } catch (e2) {}
    if (user === "alexa" && (!handle || handle === "alexa")) {
      if (!name || name === "you" || nameIsAlexa) return true;
    }
    return false;
  }

  function renderFounderBadges(stage, opts) {
    if (!stage) return;
    opts = opts || {};
    var showCap = opts.showCap !== false;
    var showPatch = opts.showPatch !== false;
    if (showCap) {
      var pin = document.createElement("figure");
      pin.className = "tower-bottle-cap tower-bottle-cap--founder";
      pin.setAttribute("data-founder-badge", "cap");
      pin.title = "Founder";
      var pinImg = document.createElement("img");
      pinImg.src = "assets/badges/founder-bottle-cap.png";
      pinImg.width = 200;
      pinImg.height = 200;
      pinImg.alt = "Founder — 1950s soda bottle cap badge";
      pin.appendChild(pinImg);
      var pinCap = document.createElement("figcaption");
      pinCap.className = "tower-badge-caption";
      pinCap.textContent = "Founder";
      pin.appendChild(pinCap);
      stage.appendChild(pin);
    }
    if (showPatch) {
      var patch = document.createElement("figure");
      patch.className = "tower-bottle-cap tower-awarded-pin tower-awarded-pin--patch";
      patch.setAttribute("data-founder-badge", "patch");
      patch.title = "Founder patch";
      var patchImg = document.createElement("img");
      patchImg.src = "assets/badges/founder-patch.png";
      patchImg.width = 160;
      patchImg.height = 160;
      patchImg.alt = "Founder — embroidered vest patch";
      patch.appendChild(patchImg);
      var patchCap = document.createElement("figcaption");
      patchCap.className = "tower-badge-caption";
      patchCap.textContent = "Founder patch";
      patch.appendChild(patchCap);
      stage.appendChild(patch);
    }
  }

  function applyTowerTheme(root, profile) {
    if (!root) return;
    var fontId = normalizeTowerFont(profile && profile.towerFont);
    var bg = normalizeFeedBgColor(profile && profile.feedBackgroundColor);
    var textColor = normalizePublicThemeColor(
      profile && profile.publicTextColor,
      "#4a2c3a"
    );
    var btnColor = normalizePublicThemeColor(
      profile && profile.publicButtonColor,
      "#f4a4c4"
    );
    var bgMode = normalizeBackgroundMode(
      profile && profile.backgroundMode,
      profile && profile.backgroundCollage,
      profile && profile.backgroundHtml
    );
    var fontStack = TOWER_FONT_MAP[fontId] || TOWER_FONT_MAP.georgia;
    root.style.setProperty("--tower-font", fontStack);
    root.style.setProperty("--tower-feed-bg", bg);
    root.style.setProperty("--tower-public-text", textColor);
    root.style.setProperty("--tower-public-btn", btnColor);
    root.setAttribute("data-tower-font", fontId);
    root.setAttribute("data-tower-bg-mode", bgMode);
    var scrapbook = root.querySelector("[data-tower-scrapbook]");
    if (scrapbook) {
      scrapbook.style.setProperty("--tower-font", fontStack);
      scrapbook.style.setProperty("--tower-feed-bg", bg);
      scrapbook.style.setProperty("--tower-public-text", textColor);
      scrapbook.style.setProperty("--tower-public-btn", btnColor);
      scrapbook.setAttribute("data-tower-bg-mode", bgMode);
    }
    var publicSide = root.querySelector("[data-tower-public-side]");
    if (publicSide) {
      publicSide.style.setProperty("--tower-font", fontStack);
      publicSide.style.setProperty("--tower-feed-bg", bg);
      publicSide.style.setProperty("--tower-public-text", textColor);
      publicSide.style.setProperty("--tower-public-btn", btnColor);
    }
    var fontSel = root.querySelector("[data-tower-font]");
    if (fontSel && document.activeElement !== fontSel) fontSel.value = fontId;
    var bgIn = root.querySelector("[data-tower-feed-bg]");
    if (bgIn && document.activeElement !== bgIn) bgIn.value = bg;
    var textIn = root.querySelector("[data-tower-public-text]");
    if (textIn && document.activeElement !== textIn) textIn.value = textColor;
    var btnIn = root.querySelector("[data-tower-public-btn]");
    if (btnIn && document.activeElement !== btnIn) btnIn.value = btnColor;
    var modeSel = root.querySelector("select[data-tower-bg-mode]");
    if (modeSel && document.activeElement !== modeSel) modeSel.value = bgMode;
    var htmlIn = root.querySelector("[data-tower-bg-html]");
    if (htmlIn && document.activeElement !== htmlIn) {
      htmlIn.value = (profile && typeof profile.backgroundHtml === "string")
        ? profile.backgroundHtml
        : "";
    }
    applyPublicBackground(root, profile);
  }

  function clearCollageStage(root) {
    var stage = root.querySelector("[data-tower-collage-stage]");
    if (!stage) return;
    stage.innerHTML = "";
    stage.setAttribute("data-layout", "none");
    stage.hidden = true;
  }

  function clearBgHtmlStage(root) {
    var stage = root.querySelector("[data-tower-bg-html-stage]");
    if (!stage) return;
    stage.innerHTML = "";
    stage.hidden = true;
  }

  function renderBgHtmlStage(root, html) {
    var stage = root.querySelector("[data-tower-bg-html-stage]");
    if (!stage) return;
    stage.innerHTML = sanitizeProfileHtml(html || "");
    stage.hidden = !stage.innerHTML;
  }

  function paintPageBackgroundImage(el, url) {
    if (!el) return;
    if (url) {
      el.style.setProperty("--tower-bg-image", 'url("' + String(url).replace(/"/g, "") + '")');
      el.setAttribute("data-has-bg-image", "true");
    } else {
      el.style.removeProperty("--tower-bg-image");
      el.removeAttribute("data-has-bg-image");
    }
  }

  /** Apply an uploaded image, or the saved collage / html background, behind stickers. */
  function applyPublicBackground(root, profile) {
    if (!root) return;
    var imageUrl = profile && typeof profile.backgroundImageDataUrl === "string"
      ? profile.backgroundImageDataUrl
      : "";
    var hasImage = imageUrl.indexOf("data:image/") === 0;
    var scrapbook = root.querySelector("[data-tower-scrapbook]");
    var publicSide = root.querySelector("[data-tower-public-side]");
    if (hasImage) {
      clearCollageStage(root);
      clearBgHtmlStage(root);
      paintPageBackgroundImage(scrapbook, imageUrl);
      paintPageBackgroundImage(publicSide, imageUrl);
      return;
    }
    paintPageBackgroundImage(scrapbook, "");
    paintPageBackgroundImage(publicSide, "");
    var mode = normalizeBackgroundMode(
      profile && profile.backgroundMode,
      profile && profile.backgroundCollage,
      profile && profile.backgroundHtml
    );
    var collageStage = root.querySelector("[data-tower-collage-stage]");
    if (mode === "solid") {
      clearCollageStage(root);
      clearBgHtmlStage(root);
      if (collageStage) collageStage.hidden = true;
    } else if (mode === "html") {
      clearCollageStage(root);
      if (collageStage) collageStage.hidden = true;
      renderBgHtmlStage(root, profile && profile.backgroundHtml);
    } else {
      /* collage */
      clearBgHtmlStage(root);
      if (collageStage) collageStage.hidden = false;
      renderCollageStage(root, profile);
    }
  }

  function getBadgePinLayout(p) {
    if (!p.badgePinLayout || typeof p.badgePinLayout !== "object") {
      p.badgePinLayout = {};
    }
    return p.badgePinLayout;
  }

  /** Default badge pin dock — offset from badges sticker so pins do not stack on friend pins. */
  function defaultBadgePinPos(p, index) {
    var layout = getWidgetLayout(p) || DEFAULT_WIDGET_LAYOUT;
    var badges = (layout && layout.badges) || DEFAULT_WIDGET_LAYOUT.badges;
    var baseX = typeof badges.x === "number" ? badges.x : DEFAULT_WIDGET_LAYOUT.badges.x;
    var baseY = typeof badges.y === "number" ? badges.y : DEFAULT_WIDGET_LAYOUT.badges.y;
    var col = index % 4;
    var row = Math.floor(index / 4);
    return {
      x: Math.max(0, Math.min(88, baseX + 22 + col * 10)),
      y: Math.max(0, Math.min(88, baseY + 10 + row * 14)),
      z: 14 + index,
      tilt: 0,
    };
  }

  function ensureBadgePinPositions(p, badgeIds) {
    var pinLayout = getBadgePinLayout(p);
    var changed = false;
    badgeIds.forEach(function (id, index) {
      var pos = pinLayout[id];
      if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") {
        pinLayout[id] = defaultBadgePinPos(p, index);
        changed = true;
      }
    });
    p.badgePinLayout = pinLayout;
    return changed;
  }

  function applyBadgePinPosition(pin, pos) {
    applyFriendPinPosition(pin, pos);
  }

  function collectVisibleBadgePins(profile) {
    var items = [];
    if (isFounderOwner(profile)) {
      if (isBadgeVisible(profile, "founder-cap")) {
        items.push({
          id: "founder-cap",
          title: "Founder",
          caption: "Founder",
          imageUrl: "assets/badges/founder-bottle-cap.png",
          alt: "Founder — 1950s soda bottle cap badge",
        });
      }
      if (isBadgeVisible(profile, "founder-patch")) {
        items.push({
          id: "founder-patch",
          title: "Founder patch",
          caption: "Founder patch",
          imageUrl: "assets/badges/founder-patch.png",
          alt: "Founder — embroidered vest patch",
        });
      }
    }
    var list = (profile && profile.awardedBadges) || [];
    list.forEach(function (badge) {
      if (!badge || badge.kind === "founder") return;
      if (!badge.id || !isBadgeVisible(profile, badge.id)) return;
      var caption = badge.title || "Award";
      items.push({
        id: badge.id,
        title: badge.title || "Award",
        caption: caption,
        imageUrl: badge.imageUrl || "assets/badges/award-peer.svg",
        alt:
          (badge.title || "Award") +
          (badge.fromName ? " from " + badge.fromName : ""),
        tip:
          (badge.title || "Award") +
          (badge.subtitle ? " · " + badge.subtitle : "") +
          (badge.fromName ? " — from " + badge.fromName : ""),
      });
    });
    return items;
  }

  function setBadgeDisplayStatus(root, msg) {
    var st = root && root.querySelector("[data-tower-badges-status]");
    if (st) st.textContent = msg || "";
  }

  function renderBadgePins(root, profile) {
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (!stage) return;
    stage.classList.add("is-sticker-stage");
    ensureStickersOnStage(stage);
    var p = profile || TowerProfileStore.get();
    if (p) settleArrivalTilts(p);
    var widgets = normalizePublicWidgets(p && p.publicWidgets);
    stage.querySelectorAll("[data-tower-badge-pin]").forEach(function (el) {
      el.remove();
    });
    if (!widgets.badges) return;

    var items = collectVisibleBadgePins(p);
    var ids = items.map(function (it) { return it.id; });
    if (ensureBadgePinPositions(p, ids)) {
      TowerProfileStore.save(p);
    }
    var pinLayout = getBadgePinLayout(p);
    var owner = isTowerOwner(p);
    var onPublic = root.getAttribute("data-tower-side") === "public";

    items.forEach(function (item) {
      var pos = pinLayout[item.id];
      if (!pos) return;
      var pin = document.createElement("figure");
      pin.className = "tower-badge-pin";
      pin.setAttribute("data-tower-badge-pin", item.id);
      pin.title = item.tip || item.title || item.caption;
      var img = document.createElement("img");
      img.className = "tower-badge-pin-img";
      img.src = item.imageUrl;
      img.width = 72;
      img.height = 72;
      img.alt = item.alt || item.title || "Badge";
      img.draggable = false;
      pin.appendChild(img);
      var cap = document.createElement("figcaption");
      cap.className = "tower-badge-pin-caption";
      cap.textContent = item.caption || item.title || "Badge";
      pin.appendChild(cap);
      applyBadgePinPosition(pin, pos);
      pin.classList.toggle("is-arrangeable", !!(owner && onPublic));
      stage.appendChild(pin);
    });
  }

  function renderAwardedBadgeShelf(root, profile) {
    /* Clustered shelf retired — visible badges render as scrapbook pin widgets. */
    var shelfStage = root.querySelector("[data-tower-badge-stage]");
    if (shelfStage) {
      shelfStage.querySelectorAll("[data-awarded-badge], [data-founder-badge]").forEach(function (n) {
        n.remove();
      });
      shelfStage.innerHTML = "";
    }
    renderBadgePins(root, profile || TowerProfileStore.get());
  }

  function setBadgeVisibility(root, badgeId, on) {
    if (!badgeId) return;
    var p = TowerProfileStore.get();
    if (!p.badgeVisibility || typeof p.badgeVisibility !== "object") {
      p.badgeVisibility = {};
    }
    p.badgeVisibility[badgeId] = !!on;
    if (!TowerProfileStore.save(p)) {
      setBadgeDisplayStatus(root, "Could not save badge display.");
      return;
    }
    renderAwardedBadgeShelf(root, p);
    syncBadgeVisibilityUi(root, p);
    setBadgeDisplayStatus(root, "Badge display saved");
  }

  function generateYearbookBadge(root, templateId) {
    var defs = getYearbookDemoDefs();
    var tmpl = null;
    defs.forEach(function (b) {
      if (b && b.id === templateId) tmpl = b;
    });
    if (!tmpl) return;
    var p = TowerProfileStore.get();
    if (!Array.isArray(p.awardedBadges)) p.awardedBadges = [];
    var exists = p.awardedBadges.some(function (b) {
      return b && b.id === tmpl.id;
    });
    if (exists) return;
    var copy = JSON.parse(JSON.stringify(tmpl));
    copy.awardedAt = new Date().toISOString();
    p.awardedBadges.push(copy);
    if (!p.badgeVisibility || typeof p.badgeVisibility !== "object") {
      p.badgeVisibility = {};
    }
    p.badgeVisibility[copy.id] = true;
    if (!TowerProfileStore.save(p)) {
      setBadgeDisplayStatus(root, "Could not save badge display.");
      return;
    }
    renderAwardedBadgeShelf(root, p);
    syncBadgeVisibilityUi(root, p);
    setBadgeDisplayStatus(root, "Badge display saved");
  }

  function syncBadgeVisibilityUi(root, profile) {
    var box = root.querySelector("[data-tower-badge-visibility]");
    if (!box) return;
    profile = profile || TowerProfileStore.get();
    if (!profile.badgeVisibility || typeof profile.badgeVisibility !== "object") {
      normalizeBadgeVisibility(profile);
    }
    box.innerHTML = "";

    function addCheck(id, label, checked) {
      var lab = document.createElement("label");
      lab.className = "tower-public-widget-check tower-badge-vis-check";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.setAttribute("data-tower-badge-vis", id);
      cb.checked = !!checked;
      var span = document.createElement("span");
      span.textContent = label;
      lab.appendChild(cb);
      lab.appendChild(span);
      box.appendChild(lab);
    }

    if (isFounderOwner(profile)) {
      addCheck("founder-cap", "Founder", isBadgeVisible(profile, "founder-cap"));
      addCheck("founder-patch", "Founder patch", isBadgeVisible(profile, "founder-patch"));
    }

    var list = profile.awardedBadges || [];
    list.forEach(function (badge) {
      if (!badge || !badge.id || badge.kind === "founder") return;
      var label = (badge.title || "Badge") + (badge.fromName ? " · from " + badge.fromName : "");
      addCheck(badge.id, label, isBadgeVisible(profile, badge.id));
    });

    if (!box.__cognationBadgeVisBound) {
      box.__cognationBadgeVisBound = true;
      box.addEventListener("change", function (ev) {
        var cb = ev.target && ev.target.closest("[data-tower-badge-vis]");
        if (!cb || !box.contains(cb)) return;
        var id = cb.getAttribute("data-tower-badge-vis");
        setBadgeVisibility(root, id, !!cb.checked);
      });
    }
  }


  function normalizeDisplayNameSize(v) {
    var n = parseInt(v, 10);
    if (isNaN(n)) n = 28;
    return Math.max(14, Math.min(200, n));
  }

  function applyDisplayNameSize(root, px) {
    px = normalizeDisplayNameSize(px);
    var wrap = root.querySelector("[data-tower-profile-name-wrap]") || root.querySelector("[data-tower-profile-name]");
    var nameEl = root.querySelector("[data-tower-profile-name]");
    var sticker = root.querySelector('[data-tower-widget="identity"]');
    if (nameEl) {
      nameEl.style.fontSize = px + "px";
      nameEl.setAttribute("data-name-size", String(px));
    }
    if (wrap && wrap !== nameEl) {
      wrap.style.setProperty("--tower-name-size", px + "px");
      wrap.setAttribute("data-name-size", String(px));
    }
    if (sticker) sticker.style.setProperty("--tower-name-size", px + "px");
    var range = root.querySelector("[data-tower-name-size]");
    if (range && document.activeElement !== range) range.value = String(px);
    return px;
  }

  function initDisplayNameResize(root) {
    var handle = root.querySelector("[data-tower-name-resize]");
    var nameEl = root.querySelector("[data-tower-profile-name]");
    if (!handle || !nameEl || handle.__cognationNameResizeBound) return;
    handle.__cognationNameResizeBound = true;
    handle.addEventListener("pointerdown", function (ev) {
      if (!isTowerOwner(TowerProfileStore.get())) return;
      ev.preventDefault();
      ev.stopPropagation();
      var startX = ev.clientX;
      var startY = ev.clientY;
      var startSize = normalizeDisplayNameSize(
        nameEl.getAttribute("data-name-size") ||
          parseFloat(getComputedStyle(nameEl).fontSize) ||
          28
      );
      function onMove(e) {
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        var delta = (dx + dy) / 2;
        applyDisplayNameSize(root, startSize + delta);
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        var p = TowerProfileStore.get();
        p.displayNameSize = normalizeDisplayNameSize(
          nameEl.getAttribute("data-name-size") || startSize
        );
        TowerProfileStore.save(p);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });

    var range = root.querySelector("[data-tower-name-size]");
    if (range && !range.__cognationNameSizeBound) {
      range.__cognationNameSizeBound = true;
      range.addEventListener("input", function () {
        applyDisplayNameSize(root, range.value);
      });
      range.addEventListener("change", function () {
        var p = TowerProfileStore.get();
        p.displayNameSize = normalizeDisplayNameSize(range.value);
        TowerProfileStore.save(p);
        applyDisplayNameSize(root, p.displayNameSize);
      });
    }
  }

  function applyAvatarFrameScale(root, scale) {
    scale = normalizeAvatarFrameScale(scale);
    var wrap = root.querySelector("[data-tower-avatar-frame]");
    if (wrap) {
      wrap.style.setProperty("--tower-avatar-frame-scale", String(scale));
      wrap.setAttribute("data-avatar-frame-scale", String(scale));
    }
    return scale;
  }

  function initAvatarFrameResize(root) {
    var handle = root.querySelector("[data-tower-avatar-resize]");
    var wrap = root.querySelector("[data-tower-avatar-frame]");
    if (!handle || !wrap || handle.__cognationAvatarResizeBound) return;
    handle.__cognationAvatarResizeBound = true;
    handle.addEventListener("pointerdown", function (ev) {
      if (!isTowerOwner(TowerProfileStore.get())) return;
      ev.preventDefault();
      ev.stopPropagation();
      var startX = ev.clientX;
      var startY = ev.clientY;
      var startScale = normalizeAvatarFrameScale(
        wrap.getAttribute("data-avatar-frame-scale") ||
          getComputedStyle(wrap).getPropertyValue("--tower-avatar-frame-scale") ||
          1
      );
      function onMove(e) {
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        var delta = (dx + dy) / 180;
        var next = applyAvatarFrameScale(root, startScale + delta);
        wrap.setAttribute("data-avatar-frame-scale", String(next));
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        var p = TowerProfileStore.get();
        p.avatarFrameScale = normalizeAvatarFrameScale(
          wrap.getAttribute("data-avatar-frame-scale") || 1
        );
        TowerProfileStore.save(p);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }

  var VIEWER_MUSIC_OFF_KEY = "cognation.tower.viewerMusicOff.v1";

  function viewerWantsMusicOff() {
    try {
      return sessionStorage.getItem(VIEWER_MUSIC_OFF_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function setViewerMusicOff(off) {
    try {
      sessionStorage.setItem(VIEWER_MUSIC_OFF_KEY, off ? "1" : "0");
    } catch (e) {}
  }

  var SOCIAL_NETWORKS = [
    { id: "x", label: "X", short: "X" },
    { id: "meta", label: "Meta", short: "Meta" },
    { id: "instagram", label: "Instagram", short: "IG" },
    { id: "youtube", label: "YouTube", short: "YT" },
    { id: "tiktok", label: "TikTok", short: "TT" },
    { id: "linkedin", label: "LinkedIn", short: "in" },
  ];

  function safeHttpUrl(raw) {
    var u = String(raw || "").trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    try {
      var parsed = new URL(u);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      return parsed.href;
    } catch (e) {
      return "";
    }
  }

  function normalizeHandle(raw) {
    return String(raw || "")
      .trim()
      .replace(/^@+/, "")
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 32);
  }

  function formatSongLine(p) {
    var title = (p.musicTitle || "").trim() || "Untitled";
    var artist = (p.musicArtist || "").trim();
    return artist ? title + " — " + artist : title;
  }

  function parseYoutubeVideoId(raw) {
    var href = safeHttpUrl(raw);
    if (!href) return "";
    try {
      var u = new URL(href);
      var host = (u.hostname || "").replace(/^www\./i, "").toLowerCase();
      if (host === "youtu.be") {
        var shortId = (u.pathname || "").split("/").filter(Boolean)[0] || "";
        shortId = shortId.split("?")[0];
        return /^[\w-]{11}$/.test(shortId) ? shortId : "";
      }
      if (
        host === "youtube.com" ||
        host === "m.youtube.com" ||
        host === "music.youtube.com" ||
        host === "youtube-nocookie.com"
      ) {
        var v = u.searchParams.get("v");
        if (v && /^[\w-]{11}$/.test(v)) return v;
        var parts = (u.pathname || "").split("/").filter(Boolean);
        if (
          parts.length >= 2 &&
          (parts[0] === "embed" ||
            parts[0] === "shorts" ||
            parts[0] === "live" ||
            parts[0] === "v")
        ) {
          var pathId = parts[1].split("?")[0];
          return /^[\w-]{11}$/.test(pathId) ? pathId : "";
        }
      }
    } catch (e) {}
    return "";
  }

  function youtubeEmbedSrc(videoId, muted, autoplay) {
    var q =
      "enablejsapi=1&playsinline=1&rel=0&modestbranding=1&autoplay=" +
      (autoplay ? "1" : "0") +
      "&mute=" +
      (muted ? "1" : "0");
    return "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(videoId) + "?" + q;
  }

  function postYoutubeCommand(iframe, func) {
    if (!iframe || !iframe.contentWindow) return;
    try {
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: func, args: [] }),
        "*"
      );
    } catch (e) {}
  }

  function clearTowerAudio(audio) {
    if (!audio) return;
    try {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    } catch (e) {}
  }

  function clearYoutubeEmbed(root) {
    var yt = root.querySelector("[data-tower-youtube]");
    var frame = root.querySelector("[data-tower-youtube-frame]");
    if (frame) frame.innerHTML = "";
    if (yt) yt.hidden = true;
  }

  function ensureYoutubeIframe(root, videoId, muted, autoplay) {
    var yt = root.querySelector("[data-tower-youtube]");
    var frame = root.querySelector("[data-tower-youtube-frame]");
    if (!yt || !frame) return null;
    yt.hidden = false;
    var src = youtubeEmbedSrc(videoId, muted, !!autoplay);
    var iframe = frame.querySelector("iframe");
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.setAttribute("title", "YouTube favorite song");
      iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
      iframe.setAttribute("allowfullscreen", "");
      iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      iframe.loading = "lazy";
      frame.appendChild(iframe);
    }
    if (iframe.getAttribute("src") !== src) iframe.src = src;
    iframe.setAttribute("data-yt-id", videoId);
    return iframe;
  }

  /* Green MP3 and wood radio are not personal-profile looks. Pink is the classic note, silver is the CD. None hides the player. */
  function visibleMusicSkin(skin) {
    if (skin === "none") return "none";
    if (skin === "cd") return "cd";
    return "classic";
  }

  function applyMusicSkin(root, skin) {
    skin = skin || "classic";
    var wrap = root.querySelector("[data-tower-music]");
    if (wrap) wrap.setAttribute("data-music-skin", skin);
    root.querySelectorAll("[data-music-face]").forEach(function (el) {
      el.hidden = el.getAttribute("data-music-face") !== skin;
    });
    var side = root.querySelector("[data-tower-radio-side]");
    if (side) {
      side.hidden = skin !== "radio";
      side.setAttribute("aria-hidden", skin === "radio" ? "false" : "true");
    }
    document.body.classList.toggle("tower-radio-scroll", skin === "radio");
  }

  function hideMusicSkins(root) {
    root.querySelectorAll("[data-music-face]").forEach(function (el) {
      el.hidden = true;
    });
    var side = root.querySelector("[data-tower-radio-side]");
    if (side) {
      side.hidden = true;
      side.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("tower-radio-scroll");
  }

  function setAllMusicLabels(root, text) {
    root.querySelectorAll("[data-tower-music-label]").forEach(function (el) {
      el.textContent = text;
    });
    var sideText = root.querySelector("[data-tower-radio-side-text]");
    if (sideText) sideText.textContent = "♪ " + text + "   ·   ";
  }

  function syncMusicToggleUi(root, off) {
    root.querySelectorAll("[data-tower-music-toggle]").forEach(function (t) {
      t.setAttribute("aria-pressed", off ? "false" : "true");
      if (t.textContent === "♪" || t.getAttribute("data-music-face-btn")) {
        /* keep glyph */
      } else {
        t.textContent = off ? "Sound off" : "Sound on";
      }
    });
    var disc = root.querySelector("[data-tower-cd-disc]");
    if (disc) disc.classList.toggle("is-spinning", !off);
  }

  function bindMusicToggles(root, media) {
    media = media || {};
    root.querySelectorAll("[data-tower-music-toggle]").forEach(function (toggle) {
      toggle.onclick = function () {
        var currentlyOff = viewerWantsMusicOff();
        setViewerMusicOff(!currentlyOff);
        var off = !currentlyOff;
        syncMusicToggleUi(root, off);
        if (off) {
          if (media.audio) media.audio.pause();
          if (media.youtubeIframe) {
            postYoutubeCommand(media.youtubeIframe, "mute");
            postYoutubeCommand(media.youtubeIframe, "pauseVideo");
          }
        } else if (media.youtubeIframe) {
          /* Explicit user gesture: allow autoplay unmute+play */
          var vid = media.youtubeIframe.getAttribute("data-yt-id") || "";
          if (vid) {
            media.youtubeIframe.src = youtubeEmbedSrc(vid, false, true);
          } else {
            postYoutubeCommand(media.youtubeIframe, "unMute");
            postYoutubeCommand(media.youtubeIframe, "playVideo");
          }
        } else if (media.audio) {
          media.audio.muted = false;
          var playPromise = media.audio.play();
          if (playPromise && playPromise.catch) {
            playPromise.catch(function () {
              media.audio.muted = true;
              media.audio.play().catch(function () {});
            });
          }
        }
      };
    });
  }


  function applyYoutubeWidth(root, widthPx) {
    var w = Math.max(180, Math.min(720, parseInt(widthPx, 10) || 320));
    var wrap = root.querySelector("[data-tower-music]");
    if (wrap) wrap.style.setProperty("--tower-youtube-width", w + "px");
    return w;
  }

  function initYoutubeResize(root) {
    var handle = root.querySelector("[data-tower-youtube-resize]");
    var wrap = root.querySelector("[data-tower-music]");
    if (!handle || !wrap || handle.__cognationYtResizeBound) return;
    handle.__cognationYtResizeBound = true;
    handle.addEventListener("pointerdown", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var startX = ev.clientX;
      var startW = wrap.getBoundingClientRect().width;
      function onMove(e) {
        var dx = e.clientX - startX;
        var next = applyYoutubeWidth(root, startW + dx);
        wrap.setAttribute("data-yt-width", String(next));
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        var p = TowerProfileStore.get();
        p.musicYoutubeWidth = parseInt(wrap.getAttribute("data-yt-width") || "320", 10);
        TowerProfileStore.save(p);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }

  function initTowerMusic(root, p) {
    var wrap = root.querySelector("[data-tower-music]");
    var audio = root.querySelector("[data-tower-audio]");
    if (!wrap || !audio) return;

    var url = (p.musicUrl || "").trim();
    var skin = visibleMusicSkin(p.musicSkin || "classic");
    var personal = !p || p._profileKind !== "professional";
    var enabled = p.musicEnabled !== false && skin !== "none" && (personal || !!url);
    var ytId = parseYoutubeVideoId(url);
    setAllMusicLabels(root, url ? formatSongLine(p) : "Song — Artist");

    if (!enabled) {
      wrap.hidden = true;
      wrap.removeAttribute("data-music-mode");
      hideMusicSkins(root);
      clearYoutubeEmbed(root);
      clearTowerAudio(audio);
      var musicSticker = root.querySelector('[data-tower-widget="music"]');
      if (musicSticker) {
        musicSticker.hidden = true;
        musicSticker.classList.add("is-widget-off");
      }
      return;
    }

    var musicOn = root.querySelector('[data-tower-widget="music"]');
    if (musicOn) {
      musicOn.hidden = false;
      musicOn.classList.remove("is-widget-off");
    }
    if (!url) {
      wrap.hidden = false;
      wrap.setAttribute("data-music-mode", "audio");
      clearYoutubeEmbed(root);
      clearTowerAudio(audio);
      applyMusicSkin(root, skin);
      return;
    }

    wrap.hidden = false;
    var off = viewerWantsMusicOff();

    if (ytId) {
      wrap.setAttribute("data-music-mode", "youtube");
      hideMusicSkins(root);
      clearTowerAudio(audio);
      applyYoutubeWidth(root, p.musicYoutubeWidth || 320);
      initYoutubeResize(root);
      /* BUG FIX: do not autoplay on Tower load/login — wait for explicit Play / Sound on. */
      var iframe = ensureYoutubeIframe(root, ytId, true, false);
      if (iframe) {
        postYoutubeCommand(iframe, "mute");
        postYoutubeCommand(iframe, "pauseVideo");
      }
      /* Start with sound "off" until the viewer presses Play — avoids login autoplay. */
      if (!viewerWantsMusicOff()) {
        try {
          sessionStorage.setItem(VIEWER_MUSIC_OFF_KEY, "1");
        } catch (eMute) {}
        off = true;
      }
      bindMusicToggles(root, { youtubeIframe: iframe });
      syncMusicToggleUi(root, true);
      root.querySelectorAll("[data-tower-music-toggle]").forEach(function (btn) {
        if (btn.textContent !== "♪") btn.textContent = "Play";
      });
      return;
    }

    wrap.setAttribute("data-music-mode", "audio");
    clearYoutubeEmbed(root);
    applyMusicSkin(root, skin);
    if (audio.getAttribute("src") !== url) audio.src = url;
    /* Force paused on load — Play button starts playback after an explicit gesture. */
    try {
      sessionStorage.setItem(VIEWER_MUSIC_OFF_KEY, "1");
    } catch (eAud) {}
    audio.pause();
    bindMusicToggles(root, { audio: audio });
    syncMusicToggleUi(root, true);
    root.querySelectorAll("[data-tower-music-toggle]").forEach(function (btn) {
      if (btn.textContent !== "♪") btn.textContent = "Play";
    });
  }




  function youtubeVideoEmbedSrc(videoId) {
    /* Public video sticker: no autoplay / no auto-unmute (user clicks play in embed). */
    var q = "enablejsapi=1&playsinline=1&rel=0&modestbranding=1&autoplay=0";
    return "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(videoId) + "?" + q;
  }

  function clearTowerVideoEmbed(root) {
    var frame = root.querySelector("[data-tower-video-frame]");
    if (frame) {
      Array.prototype.slice.call(frame.querySelectorAll("iframe")).forEach(function (el) {
        el.remove();
      });
    }
  }

  function ensureTowerVideoIframe(root, videoId, title) {
    var frame = root.querySelector("[data-tower-video-frame]");
    if (!frame) return null;
    var src = youtubeVideoEmbedSrc(videoId);
    var iframe = frame.querySelector("iframe");
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
      iframe.setAttribute("allowfullscreen", "");
      iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      iframe.loading = "lazy";
      /* Keep resize handle after iframe */
      var handle = frame.querySelector("[data-tower-video-resize]");
      if (handle) frame.insertBefore(iframe, handle);
      else frame.appendChild(iframe);
    }
    iframe.setAttribute("title", title || "YouTube video");
    if (iframe.getAttribute("src") !== src) iframe.src = src;
    return iframe;
  }

  function applyVideoWidth(root, widthPx) {
    var w = Math.max(200, Math.min(900, parseInt(widthPx, 10) || 360));
    var wrap = root.querySelector("[data-tower-video]");
    if (wrap) wrap.style.setProperty("--tower-video-width", w + "px");
    return w;
  }

  function initVideoResize(root) {
    var handle = root.querySelector("[data-tower-video-resize]");
    var wrap = root.querySelector("[data-tower-video]");
    if (!handle || !wrap || handle.__cognationVideoResizeBound) return;
    handle.__cognationVideoResizeBound = true;
    handle.addEventListener("pointerdown", function (ev) {
      if (!isTowerOwner(TowerProfileStore.get())) return;
      ev.preventDefault();
      ev.stopPropagation();
      var startX = ev.clientX;
      var startW = wrap.getBoundingClientRect().width;
      function onMove(e) {
        var next = applyVideoWidth(root, startW + (e.clientX - startX));
        wrap.setAttribute("data-video-width", String(next));
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        var p = TowerProfileStore.get();
        p.videoWidth = parseInt(wrap.getAttribute("data-video-width") || "360", 10);
        p.videoWidth = Math.max(200, Math.min(900, p.videoWidth || 360));
        TowerProfileStore.save(p);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }

  function bindVideoInlineUrl(root) {
    var inline = root.querySelector("[data-tower-video-url-inline]");
    if (!inline || inline.__cognationVideoInlineBound) return;
    inline.__cognationVideoInlineBound = true;

    function commitInline() {
      if (!isTowerOwner(TowerProfileStore.get())) return;
      var p = TowerProfileStore.get();
      var next = (inline.value || "").trim().slice(0, 500);
      p.videoUrl = next;
      if (p.videoEnabled == null) p.videoEnabled = true;
      TowerProfileStore.save(p);
      var formUrl = root.querySelector("[data-tower-video-url]");
      if (formUrl && document.activeElement !== formUrl) formUrl.value = next;
      initTowerVideo(root, p);
    }

    inline.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        commitInline();
        inline.blur();
      }
    });
    inline.addEventListener("blur", function () {
      commitInline();
    });
  }

  function initTowerVideo(root, p) {
    /* ONE_YOUTUBE_PLAYER_ONLY — radio/music owns the single embed */
    var wrap = root.querySelector("[data-tower-video]");
    if (wrap) {
      wrap.hidden = true;
      clearTowerVideoEmbed(root);
    }
    var sticker = root.querySelector('[data-tower-widget="video"]');
    if (sticker) {
      sticker.hidden = true;
      sticker.classList.add("is-widget-off");
    }
    return;
    var wrapUnused = root.querySelector("[data-tower-video]");
    var sticker = root.querySelector('[data-tower-widget="video"]');
    if (!wrap) return;

    var widgets = normalizePublicWidgets(p && p.publicWidgets);
    var url = (p.videoUrl || "").trim();
    var enabled = p.videoEnabled !== false;
    var ytId = parseYoutubeVideoId(url);
    var title = (p.videoTitle || "").trim();
    var empty = wrap.querySelector("[data-tower-video-empty]");
    var caption = wrap.querySelector("[data-tower-video-caption]");
    var frame = wrap.querySelector("[data-tower-video-frame]");
    var inlineWrap = wrap.querySelector("[data-tower-video-inline-wrap]");
    var inline = wrap.querySelector("[data-tower-video-url-inline]");
    var owner = isTowerOwner(p);
    var onPublic = root.getAttribute("data-tower-side") === "public";

    if (inline && document.activeElement !== inline) {
      inline.value = url;
    }

    if (inlineWrap) {
      inlineWrap.hidden = !(owner && onPublic);
    }

    if (!widgets.video || !enabled) {
      wrap.hidden = true;
      clearTowerVideoEmbed(root);
      if (empty) empty.hidden = true;
      if (caption) {
        caption.hidden = true;
        caption.textContent = "";
      }
      if (frame) frame.hidden = true;
      return;
    }

    wrap.hidden = false;
    applyVideoWidth(root, p.videoWidth || 360);
    initVideoResize(root);
    bindVideoInlineUrl(root);

    if (!ytId) {
      clearTowerVideoEmbed(root);
      if (frame) frame.hidden = true;
      if (caption) {
        caption.hidden = true;
        caption.textContent = "";
      }
      /* Owners keep the radio URL box + empty hint; viewers see nothing until a URL exists. */
      if (!owner) {
        wrap.hidden = true;
        if (empty) empty.hidden = true;
        return;
      }
      if (empty) empty.hidden = false;
      return;
    }

    if (frame) frame.hidden = false;
    if (empty) empty.hidden = true;
    ensureTowerVideoIframe(root, ytId, title || "YouTube video");
    if (caption) {
      if (title) {
        caption.hidden = false;
        caption.textContent = title;
      } else {
        caption.hidden = true;
        caption.textContent = "";
      }
    }
  }

  function socialLinkDefs() {
    return SOCIAL_NETWORKS.concat([{ id: "venmo", label: "Venmo", short: "Venmo" }]);
  }

  function venmoHref(raw) {
    var text = String(raw || "").trim();
    if (!text) return "";
    if (/^https?:\/\//i.test(text)) return safeHttpUrl(text);
    var handle = text.replace(/^@+/, "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!handle) return "";
    return "https://venmo.com/u/" + handle;
  }

  function socialHref(id, raw) {
    if (id === "venmo") return venmoHref(raw);
    return safeHttpUrl(raw);
  }

  function storedSocialValue(id, value) {
    if (id === "venmo") return String(value || "").trim().slice(0, 500);
    return safeHttpUrl(value);
  }

  function commitSocialDraft(root, id, value) {
    var p = TowerProfileStore.get();
    if (!p.socialLinks || typeof p.socialLinks !== "object") p.socialLinks = {};
    p.socialLinks[id] = storedSocialValue(id, value);
    p.publicWidgets = normalizePublicWidgets(p.publicWidgets);
    p.publicWidgets.social = profileHasSocialLinks(p);
    TowerProfileStore.save(p);
    var saved = TowerProfileStore.get();
    renderSocialLinks(root, saved);
    applyPublicWidgets(root, saved);
  }

  function renderSocialLinks(root, p) {
    var box = root.querySelector("[data-tower-social-links]");
    if (!box) return;
    var links = (p && p.socialLinks) || {};
    socialLinkDefs().forEach(function (net) {
      var formInput = root.querySelector('[data-tower-social="' + net.id + '"]');
      if (formInput && document.activeElement !== formInput) formInput.value = links[net.id] || "";
    });
    if (box.contains(document.activeElement)) return;
    box.innerHTML = "";
    var any = false;
    socialLinkDefs().forEach(function (net) {
      var raw = links[net.id] || "";
      var href = socialHref(net.id, raw);
      if (!href) return;
      any = true;
      var a = document.createElement("a");
      a.className = "tower-social-btn tower-social-btn--" + net.id;
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.title = net.label;
      a.setAttribute("aria-label", net.label);
      a.textContent = net.short;
      box.appendChild(a);
    });
    box.hidden = !any;
    var sticker = box.closest('[data-tower-widget="social"]');
    if (sticker) {
      sticker.hidden = !any;
      sticker.classList.toggle("is-widget-off", !any);
    }
  }

  function getFriendPinLayout(p) {
    if (!p.friendPinLayout || typeof p.friendPinLayout !== "object") {
      p.friendPinLayout = {};
    }
    return p.friendPinLayout;
  }

  function defaultFriendPinPos(p, index) {
    var layout = getWidgetLayout(p) || DEFAULT_WIDGET_LAYOUT;
    var friends = (layout && layout.friends) || DEFAULT_WIDGET_LAYOUT.friends;
    var baseX = typeof friends.x === "number" ? friends.x : DEFAULT_WIDGET_LAYOUT.friends.x;
    var baseY = typeof friends.y === "number" ? friends.y : DEFAULT_WIDGET_LAYOUT.friends.y;
    var col = index % 4;
    var row = Math.floor(index / 4);
    return {
      x: Math.max(0, Math.min(88, baseX + 18 + col * 9)),
      y: Math.max(0, Math.min(88, baseY + row * 12)),
      z: 12 + index,
      tilt: 0,
    };
  }

  /** Assign dock positions only for newly featured friends missing a saved layout. Never overwrite. */
  function ensureFriendPinPositions(p, selectedIds) {
    var pinLayout = getFriendPinLayout(p);
    var changed = false;
    selectedIds.forEach(function (id, index) {
      var pos = pinLayout[id];
      if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") {
        pinLayout[id] = defaultFriendPinPos(p, index);
        changed = true;
      }
    });
    p.friendPinLayout = pinLayout;
    return changed;
  }

  function applyFriendPinPosition(pin, pos) {
    if (!pin || !pos) return;
    var x = typeof pos.x === "number" ? pos.x : 0;
    var y = typeof pos.y === "number" ? pos.y : 0;
    var z = typeof pos.z === "number" ? pos.z : 12;
    var tilt = typeof pos.tilt === "number" ? pos.tilt : 0;
    pin.style.setProperty("--sticker-x", x + "%");
    pin.style.setProperty("--sticker-y", y + "%");
    pin.style.setProperty("--sticker-z", String(z));
    pin.style.setProperty("--sticker-tilt", tilt + "deg");
    pin.setAttribute("data-sticker-x", String(x));
    pin.setAttribute("data-sticker-y", String(y));
    pin.setAttribute("data-sticker-z", String(z));
  }

  function renderFriendPins(root, p) {
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (!stage) return;
    stage.classList.add("is-sticker-stage");
    ensureStickersOnStage(stage);
    if (p) settleArrivalTilts(p);
    var widgets = normalizePublicWidgets(p && p.publicWidgets);
    if (!widgets.friends) {
      stage.querySelectorAll("[data-tower-friend-pin]").forEach(function (el) {
        el.remove();
      });
      return;
    }
    var max = parseInt(p.friendsDisplayCount || 3, 10);
    if ([3, 6, 8].indexOf(max) === -1) max = 3;
    var selected = (p.featuredFriendIds || []).slice(0, max);
    if (ensureFriendPinPositions(p, selected)) {
      TowerProfileStore.save(p);
    }
    var pinLayout = getFriendPinLayout(p);

    stage.querySelectorAll("[data-tower-friend-pin]").forEach(function (el) {
      var id = el.getAttribute("data-tower-friend-pin");
      if (selected.indexOf(id) < 0) el.remove();
    });

    selected.forEach(function (id) {
      var friend = DEMO_FRIENDS.filter(function (x) { return x.id === id; })[0];
      if (!friend) return;
      var pos = pinLayout[id];
      if (!pos) return;
      var pin = stage.querySelector('[data-tower-friend-pin="' + id + '"]');
      if (!pin) {
        pin = document.createElement("a");
        pin.className = "tower-friend-pin";
        pin.setAttribute("data-tower-friend-pin", id);
        pin.href = "#tower-profile-" + id;
        pin.setAttribute("aria-label", friend.name);
        var av = document.createElement("span");
        av.className = "tower-friend-pin-avatar";
        av.setAttribute("aria-hidden", "true");
        av.textContent = initials(friend.name);
        var nm = document.createElement("span");
        nm.className = "tower-friend-pin-name";
        nm.textContent = friend.name;
        pin.appendChild(av);
        pin.appendChild(nm);
        pin.addEventListener("click", function (ev) {
          if (pin.__cognationDidDrag) {
            ev.preventDefault();
            pin.__cognationDidDrag = false;
          }
        });
        stage.appendChild(pin);
      } else {
        pin.href = "#tower-profile-" + id;
        pin.setAttribute("aria-label", friend.name);
        var avEl = pin.querySelector(".tower-friend-pin-avatar");
        var nmEl = pin.querySelector(".tower-friend-pin-name");
        if (avEl) avEl.textContent = initials(friend.name);
        if (nmEl) nmEl.textContent = friend.name;
      }
      /* Apply saved layout only — never invent here */
      applyFriendPinPosition(pin, pos);
      var owner = isTowerOwner(p);
      var onPublic = root.getAttribute("data-tower-side") === "public";
      pin.classList.toggle("is-arrangeable", !!(owner && onPublic));
      pin.hidden = false;
      pin.classList.remove("is-widget-off");
    });
  }

  function renderFriendsPicker(root, p) {
    var chips = root.querySelector("[data-tower-friends-chips]");
    var countSel = root.querySelector("[data-tower-friends-count]");
    var publicEl = root.querySelector("[data-tower-friends-public]");
    if (!chips) return;
    var max = parseInt((countSel && countSel.value) || p.friendsDisplayCount || 3, 10);
    if ([3, 6, 8].indexOf(max) === -1) max = 3;
    var selected = (p.featuredFriendIds || []).slice(0, max);
    chips.innerHTML = "";

    var selectedFriends = [];
    selected.forEach(function (id) {
      var f = DEMO_FRIENDS.filter(function (x) { return x.id === id; })[0];
      if (f) selectedFriends.push(f);
    });
    var unselectedFriends = DEMO_FRIENDS.filter(function (f) {
      return selected.indexOf(f.id) < 0;
    });
    var ordered = selectedFriends.concat(unselectedFriends);
    var chipDragFrom = null;
    var chipDidDrag = false;

    ordered.forEach(function (f) {
      var rank = selected.indexOf(f.id);
      var isOn = rank >= 0;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tower-friend-chip" + (isOn ? " is-selected" : "");
      btn.setAttribute("data-friend-id", f.id);
      btn.setAttribute("aria-pressed", isOn ? "true" : "false");
      if (isOn) {
        btn.draggable = true;
        btn.setAttribute("data-friend-rank", String(rank + 1));
        var badge = document.createElement("span");
        badge.className = "tower-friend-chip-rank";
        badge.setAttribute("aria-hidden", "true");
        badge.textContent = String(rank + 1);
        btn.appendChild(badge);
      }
      var label = document.createElement("span");
      label.className = "tower-friend-chip-label";
      label.textContent = f.name;
      btn.appendChild(label);

      btn.addEventListener("click", function () {
        if (chipDidDrag) {
          chipDidDrag = false;
          return;
        }
        var cur = TowerProfileStore.get();
        var ids = (cur.featuredFriendIds || []).slice();
        var ix = ids.indexOf(f.id);
        if (ix >= 0) ids.splice(ix, 1);
        else {
          var lim = parseInt(
            (root.querySelector("[data-tower-friends-count]") || {}).value || cur.friendsDisplayCount || 3,
            10
          );
          if ([3, 6, 8].indexOf(lim) === -1) lim = 3;
          if (ids.length >= lim) {
            ids.shift();
          }
          ids.push(f.id);
        }
        cur.featuredFriendIds = ids;
        TowerProfileStore.save(cur);
        renderFriendsPicker(root, cur);
        var stPick = root.querySelector("[data-tower-friends-status]");
        if (stPick) {
          stPick.textContent = ids.length
            ? "Selected " + ids.length + " — click Save top friends to keep on your page."
            : "None selected — click Save top friends to clear pins.";
        }
      });

      if (isOn) {
        btn.addEventListener("dragstart", function (e) {
          chipDragFrom = f.id;
          chipDidDrag = false;
          btn.classList.add("is-chip-dragging");
          try {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", f.id);
          } catch (err) {}
        });
        btn.addEventListener("dragend", function () {
          btn.classList.remove("is-chip-dragging");
          chips.querySelectorAll(".tower-friend-chip.is-drop-target").forEach(function (el) {
            el.classList.remove("is-drop-target");
          });
          chipDragFrom = null;
        });
        btn.addEventListener("dragover", function (e) {
          if (!chipDragFrom || chipDragFrom === f.id) return;
          e.preventDefault();
          btn.classList.add("is-drop-target");
          try {
            e.dataTransfer.dropEffect = "move";
          } catch (err) {}
        });
        btn.addEventListener("dragleave", function () {
          btn.classList.remove("is-drop-target");
        });
        btn.addEventListener("drop", function (e) {
          e.preventDefault();
          btn.classList.remove("is-drop-target");
          var fromId = chipDragFrom;
          try {
            fromId = e.dataTransfer.getData("text/plain") || chipDragFrom;
          } catch (err) {}
          if (!fromId || fromId === f.id) return;
          chipDidDrag = true;
          var cur = TowerProfileStore.get();
          var ids = (cur.featuredFriendIds || []).slice();
          var fromIx = ids.indexOf(fromId);
          var toIx = ids.indexOf(f.id);
          if (fromIx < 0 || toIx < 0) return;
          ids.splice(fromIx, 1);
          ids.splice(toIx, 0, fromId);
          cur.featuredFriendIds = ids;
          TowerProfileStore.save(cur);
          renderFriendsPicker(root, cur);
        });
      }

      chips.appendChild(btn);
    });

    if (publicEl) {
      publicEl.innerHTML = "";
      var heading = document.createElement("p");
      heading.className = "tower-friends-public-label";
      heading.textContent = selected.length
        ? "Top friends"
        : "Top friends · set on My feed";
      publicEl.appendChild(heading);
    }

    renderFriendPins(root, p);
  }


  function normalizeFrameId(id) {
    id = String(id || "none");
    if (id === "plain") id = "none";
    if (id === "baroque") id = "baroque-magenta";
    return FRAME_IDS.indexOf(id) >= 0 ? id : "none";
  }

  function applyCowboyHatColor(root, colorId) {
    colorId = normalizeCowboyHatColor(colorId);
    var wrap = root.querySelector("[data-tower-avatar-frame]");
    var hidden = root.querySelector("[data-tower-cowboy-color-input]");
    var fields = root.querySelector("[data-tower-cowboy-color-fields]");
    if (wrap) wrap.setAttribute("data-cowboy-hat-color", colorId);
    if (hidden) hidden.value = colorId;
    var chips = root.querySelectorAll("[data-tower-cowboy-color-chips] [data-cowboy-color]");
    chips.forEach(function (btn) {
      var on = btn.getAttribute("data-cowboy-color") === colorId;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    return colorId;
  }

  function syncCowboyColorFieldsVisibility(root, frameId) {
    var fields = root.querySelector("[data-tower-cowboy-color-fields]");
    if (!fields) return;
    var show = normalizeFrameId(frameId) === "cowboy-hat";
    fields.hidden = !show;
  }

  function applyAvatarFrame(root, frameId, cowboyColor) {
    frameId = normalizeFrameId(frameId);
    var wrap = root.querySelector('[data-tower-widget="avatar"] [data-tower-avatar-frame]');
    var overlay = root.querySelector("[data-tower-frame-overlay]");
    var hiddenInput = root.querySelector("[data-tower-avatar-frame-input]");
    if (wrap) wrap.setAttribute("data-tower-avatar-frame", frameId);
    if (hiddenInput) hiddenInput.value = frameId;
    var meta = AVATAR_FRAMES[frameId] || AVATAR_FRAMES.none;
    if (overlay) {
      if (meta.overlay) {
        overlay.hidden = false;
        overlay.src = meta.overlay;
      } else {
        overlay.hidden = true;
        overlay.removeAttribute("src");
      }
    }
    var chips = root.querySelectorAll("[data-tower-frame-chips] [data-frame-id]");
    chips.forEach(function (btn) {
      var on = btn.getAttribute("data-frame-id") === frameId;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    syncCowboyColorFieldsVisibility(root, frameId);
    if (cowboyColor == null) {
      var colorIn = root.querySelector("[data-tower-cowboy-color-input]");
      cowboyColor = colorIn ? colorIn.value : "tan";
    }
    applyCowboyHatColor(root, cowboyColor);
    root.querySelectorAll("[data-tower-polaroid]").forEach(function (el) {
      el.setAttribute("data-tower-avatar-frame", "polaroid");
    });
    var scaleIn = TowerProfileStore.get();
    applyAvatarFrameScale(root, scaleIn && scaleIn.avatarFrameScale);
  }

  function normalizeOrnamentId(id) {
    id = String(id || "none");
    return ORNAMENT_IDS.indexOf(id) >= 0 ? id : "none";
  }

  function normalizeOrnamentPos(pos) {
    pos = String(pos || "above").toLowerCase();
    return ORNAMENT_POS_IDS.indexOf(pos) >= 0 ? pos : "above";
  }

  function applyAvatarOrnament(root, ornamentId, pos) {
    ornamentId = normalizeOrnamentId(ornamentId);
    pos = normalizeOrnamentPos(pos);
    var stack = root.querySelector("[data-tower-avatar-ornament]");
    var img = root.querySelector("[data-tower-ornament-img]");
    var hiddenOrn = root.querySelector("[data-tower-avatar-ornament-input]");
    var hiddenPos = root.querySelector("[data-tower-avatar-ornament-pos-input]");
    if (stack) {
      stack.setAttribute("data-tower-avatar-ornament", ornamentId);
      stack.setAttribute("data-tower-avatar-ornament-pos", pos);
    }
    if (hiddenOrn) hiddenOrn.value = ornamentId;
    if (hiddenPos) hiddenPos.value = pos;
    var meta = AVATAR_ORNAMENTS[ornamentId] || AVATAR_ORNAMENTS.none;
    if (img) {
      if (meta.src) {
        img.hidden = false;
        img.src = meta.src;
        img.alt = meta.label || "";
        img.setAttribute("aria-hidden", "false");
      } else {
        img.hidden = true;
        img.removeAttribute("src");
        img.alt = "";
        img.setAttribute("aria-hidden", "true");
      }
    }
    var chips = root.querySelectorAll("[data-tower-ornament-chips] [data-ornament-id]");
    chips.forEach(function (btn) {
      var on = btn.getAttribute("data-ornament-id") === ornamentId;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var posChips = root.querySelectorAll("[data-tower-ornament-pos-chips] [data-ornament-pos]");
    var posEnabled = ornamentId !== "none";
    posChips.forEach(function (btn) {
      btn.disabled = !posEnabled;
      var on = btn.getAttribute("data-ornament-pos") === pos;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function getWidgetLayout(p) {
    var layout = (p && p.widgetLayout) || null;
    if (!layout || typeof layout !== "object") return null;
    return layout;
  }

  function profileHasSocialLinks(p) {
    var links = (p && p.socialLinks) || {};
    var defs = socialLinkDefs();
    for (var i = 0; i < defs.length; i++) {
      if (socialHref(defs[i].id, links[defs[i].id])) return true;
    }
    return false;
  }

  function profileHasVisibleBadges(p) {
    var vis = (p && p.badgeVisibility) || {};
    var awarded = (p && p.awardedBadges) || {};
    var ids = Object.keys(awarded).length ? Object.keys(awarded) : Object.keys(vis);
    if (!ids.length && p && p.badges) {
      /* shelf may still show label — treat empty shelf as ghost */
      return false;
    }
    for (var i = 0; i < ids.length; i++) {
      if (vis[ids[i]] !== false) return true;
    }
    return false;
  }


  function pruneEmptyPublicWidgetsInProfile(p) {
    if (!p) return p;
    p.publicWidgets = normalizePublicWidgets(p.publicWidgets);
    var sloganText = typeof p.slogan === "string" ? p.slogan.trim() : "";
    var htmlText = typeof p.customHtml === "string" ? p.customHtml.trim() : "";
    if (!sloganText) p.publicWidgets.slogan = false;
    if (!htmlText) p.publicWidgets.html = false;
    p.publicWidgets.social = profileHasSocialLinks(p);
    if (visibleMusicSkin(p.musicSkin) === "none" || p.musicEnabled === false) p.publicWidgets.music = false;
    if (!(p.featuredFriendIds && p.featuredFriendIds.length)) p.publicWidgets.friends = false;
    if (!profileHasVisibleBadges(p)) p.publicWidgets.badges = false;
    return p;
  }

  function applyPublicWidgets(root, p) {
    if (p) pruneEmptyPublicWidgetsInProfile(p);
    var widgets = normalizePublicWidgets(p && p.publicWidgets);
    var sloganText = p && typeof p.slogan === "string" ? p.slogan.trim() : "";
    var htmlText = p && typeof p.customHtml === "string" ? p.customHtml.trim() : "";
    var musicUrl = p && typeof p.musicUrl === "string" ? p.musicUrl.trim() : "";
    var musicOn = p && p.musicEnabled !== false && !!musicUrl;
    var friendIds = (p && p.featuredFriendIds) || [];
    PUBLIC_WIDGET_IDS.forEach(function (id) {
      var on = widgets[id] !== false;
      if (id === "slogan" && !sloganText) on = false;
      /* Auto-prune empty shells so ghost handles do not linger on personal scrapbooks */
      if (id === "html" && !htmlText) on = false;
      if (id === "social") on = profileHasSocialLinks(p);
      if (id === "music") {
        var personalMusic = !p || p._profileKind !== "professional";
        var skinChoice = visibleMusicSkin(p && p.musicSkin);
        if (skinChoice === "none" || (p && p.musicEnabled === false)) on = false;
        else if (personalMusic) on = true;
        else on = on && musicOn;
      }
      if (id === "friends" && (!friendIds || !friendIds.length)) on = false;
      if (id === "badges" && !profileHasVisibleBadges(p)) on = false;
      var el = root.querySelector('[data-tower-widget="' + id + '"]');
      if (!el) return;
      el.hidden = !on;
      el.classList.toggle("is-widget-off", !on);
      if (!on) el.classList.remove("is-widget-selected");
    });
    var avatar = root.querySelector('[data-tower-widget="avatar"]');
    if (avatar) {
      avatar.hidden = false;
      avatar.classList.remove("is-widget-off");
    }
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (stage) {
      stage.querySelectorAll("[data-tower-friend-pin]").forEach(function (pin) {
        if (!widgets.friends) {
          pin.hidden = true;
          pin.classList.add("is-widget-off");
        } else {
          pin.hidden = false;
          pin.classList.remove("is-widget-off");
        }
      });
      stage.querySelectorAll("[data-tower-badge-pin]").forEach(function (pin) {
        if (!widgets.badges) {
          pin.hidden = true;
          pin.classList.add("is-widget-off");
        } else {
          pin.hidden = false;
          pin.classList.remove("is-widget-off");
        }
      });
    }
  }

  function syncPublicWidgetsForm(root, p) {
    var widgets = normalizePublicWidgets(p && p.publicWidgets);
    root.querySelectorAll("[data-tower-public-widget]").forEach(function (cb) {
      var id = cb.getAttribute("data-tower-public-widget");
      if (!id || id === "avatar") return;
      cb.checked = widgets[id] !== false;
    });
  }

  function readPublicWidgetsFromForm(root) {
    var out = normalizePublicWidgets(null);
    root.querySelectorAll("[data-tower-public-widget]").forEach(function (cb) {
      var id = cb.getAttribute("data-tower-public-widget");
      if (!id || id === "avatar") return;
      out[id] = !!cb.checked;
    });
    return out;
  }

  function setPublicWidgetVisible(root, id, on) {
    if (!id || id === "avatar" || id === "feed" || id === "messages") return;
    if (PUBLIC_WIDGET_IDS.indexOf(id) < 0) return;
    var p = TowerProfileStore.get();
    p.publicWidgets = normalizePublicWidgets(p.publicWidgets);
    p.publicWidgets[id] = !!on;
    TowerProfileStore.save(p);
    applyPublicWidgets(root, p);
    syncPublicWidgetsForm(root, p);
    if (id === "friends") {
      if (on) renderFriendPins(root, p);
      else {
        var stage = root.querySelector("[data-tower-scrapbook]");
        if (stage) {
          stage.querySelectorAll("[data-tower-friend-pin]").forEach(function (el) {
            el.remove();
          });
        }
      }
    }
    if (id === "badges") {
      if (on) renderBadgePins(root, p);
      else {
        var badgeStage = root.querySelector("[data-tower-scrapbook]");
        if (badgeStage) {
          badgeStage.querySelectorAll("[data-tower-badge-pin]").forEach(function (el) {
            el.remove();
          });
        }
      }
    }
    if (id === "calendar" && on) {
      try { refreshTowerCalendars(root); } catch (eCal) {}
    }
  }

  function syncOwnerStickerHandles(root) {
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (!stage) return;
    var owner = isTowerOwner(TowerProfileStore.get());
    var onPublic = root.getAttribute("data-tower-side") === "public";
    var show = owner && onPublic;
    stage.querySelectorAll("[data-tower-sticker-handle]").forEach(function (h) {
      h.hidden = true;
    });
    stage.querySelectorAll("[data-tower-friend-pin]").forEach(function (pin) {
      pin.classList.toggle("is-arrangeable", show);
    });
    stage.querySelectorAll("[data-tower-badge-pin]").forEach(function (pin) {
      pin.classList.toggle("is-arrangeable", show);
    });
  }


  function normalizeTiltDegrees(v) {
    var n = parseFloat(v);
    if (isNaN(n)) n = 0;
    n = ((n % 360) + 360) % 360;
    if (n > 180) n -= 360;
    return Math.round(n * 10) / 10;
  }

  function getSelectedArrangeable(stage) {
    if (!stage) return null;
    return stage.querySelector(".is-widget-selected");
  }

  function syncRotateToolbar(root) {
    var bar = root.querySelector("[data-tower-rotate-toolbar]");
    var stage = root.querySelector("[data-tower-scrapbook]");
    var owner = isTowerOwner(TowerProfileStore.get()) && root.getAttribute("data-tower-side") === "public";
    var selected = getSelectedArrangeable(stage);
    if (bar) {
      bar.hidden = false;
      bar.setAttribute("aria-hidden", "false");
      var rotateBtn = bar.querySelector("[data-tower-rotate]");
      if (rotateBtn) rotateBtn.disabled = !(owner && selected);
    }
    var scrap = root.querySelector("[data-tower-scrapbook-bar]");
    if (scrap) {
      scrap.hidden = !owner;
      scrap.setAttribute("aria-hidden", owner ? "false" : "true");
    }
  }

  function readTiltFromElement(el) {
    if (!el) return 0;
    var raw = el.style.getPropertyValue("--sticker-tilt") || "";
    var n = parseFloat(String(raw).replace("deg", ""));
    if (isNaN(n)) n = 0;
    return n;
  }

  function applyTiltToElement(el, tilt) {
    tilt = normalizeTiltDegrees(tilt);
    el.style.setProperty("--sticker-tilt", tilt + "deg");
    el.setAttribute("data-sticker-tilt", String(tilt));
  }

  function persistSelectedTilt(root, el, tilt) {
    var p = TowerProfileStore.get();
    tilt = normalizeTiltDegrees(tilt);
    applyTiltToElement(el, tilt);
    var friendId = el.getAttribute("data-tower-friend-pin");
    if (friendId) {
      var fl = getFriendPinLayout(p);
      var prevF = fl[friendId] || {};
      fl[friendId] = {
        x: typeof prevF.x === "number" ? prevF.x : parseFloat(el.getAttribute("data-sticker-x") || "0"),
        y: typeof prevF.y === "number" ? prevF.y : parseFloat(el.getAttribute("data-sticker-y") || "0"),
        z: typeof prevF.z === "number" ? prevF.z : parseInt(el.getAttribute("data-sticker-z") || "12", 10),
        tilt: tilt,
      };
      p.friendPinLayout = fl;
      TowerProfileStore.save(p, { geometry: true });
      return;
    }
    var badgeId = el.getAttribute("data-tower-badge-pin");
    if (badgeId) {
      var bl = getBadgePinLayout(p);
      var prevB = bl[badgeId] || {};
      bl[badgeId] = {
        x: typeof prevB.x === "number" ? prevB.x : parseFloat(el.getAttribute("data-sticker-x") || "0"),
        y: typeof prevB.y === "number" ? prevB.y : parseFloat(el.getAttribute("data-sticker-y") || "0"),
        z: typeof prevB.z === "number" ? prevB.z : parseInt(el.getAttribute("data-sticker-z") || "14", 10),
        tilt: tilt,
      };
      p.badgePinLayout = bl;
      TowerProfileStore.save(p, { geometry: true });
      return;
    }
    var wid = el.getAttribute("data-tower-widget");
    if (!wid || wid === "feed" || wid === "messages") return;
    var layout = getWidgetLayout(p) || JSON.parse(JSON.stringify(DEFAULT_WIDGET_LAYOUT));
    var prev = layout[wid] || DEFAULT_WIDGET_LAYOUT[wid] || {};
    layout[wid] = {
      x: typeof prev.x === "number" ? prev.x : parseFloat(el.getAttribute("data-sticker-x") || "0"),
      y: typeof prev.y === "number" ? prev.y : parseFloat(el.getAttribute("data-sticker-y") || "0"),
      z: typeof prev.z === "number" ? prev.z : parseInt(el.getAttribute("data-sticker-z") || "1", 10),
      tilt: tilt,
    };
    p.widgetLayout = layout;
    TowerProfileStore.save(p, { geometry: true });
  }

  /** delta: number degrees to add, or absolute via mode */
  function rotateSelectedWidget(root, deltaOrMode) {
    var stage = root.querySelector("[data-tower-scrapbook]");
    var el = getSelectedArrangeable(stage);
    if (!el) return;
    var cur = readTiltFromElement(el);
    var next;
    if (deltaOrMode === "straighten" || deltaOrMode === 0 || deltaOrMode === "0") {
      next = 0;
    } else if (deltaOrMode === "180" || deltaOrMode === 180) {
      next = 180;
    } else {
      next = cur + parseFloat(deltaOrMode);
    }
    persistSelectedTilt(root, el, next);
    syncRotateToolbar(root);
  }

  function initRotateToolbar(root) {
    if (!root || root.__cognationRotateBound) return;
    root.__cognationRotateBound = true;
    var bar = root.querySelector("[data-tower-rotate-toolbar]");
    if (!bar) return;
    bar.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest("[data-tower-rotate]");
      if (!btn || !bar.contains(btn)) return;
      if (!isTowerOwner(TowerProfileStore.get()) || root.getAttribute("data-tower-side") !== "public") return;
      var mode = btn.getAttribute("data-tower-rotate");
      if (mode === "straighten") rotateSelectedWidget(root, "straighten");
      else rotateSelectedWidget(root, parseFloat(mode));
    });
    syncRotateToolbar(root);
  }

  var FRIEND_AVATAR_COLORS = [
    "#f4a4c4", "#ef8bb4", "#d489b0", "#ffc1d9", "#c084a0",
    "#e8a0bf", "#b87a9a", "#f7b8ce", "#9b6b84", "#ffb3d1",
    "#d4a5bc", "#e091b3", "#c97a9e", "#f0a8c8", "#a87290",
  ];

  function friendHandleFromId(id) {
    return String(id || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "friend";
  }

  function friendInitials(name) {
    var parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function friendAvatarStyle(friend, index) {
    var color = FRIEND_AVATAR_COLORS[index % FRIEND_AVATAR_COLORS.length];
    return {
      background: "linear-gradient(145deg, " + color + ", #fff5f9 70%)",
      color: "#4a2c3a",
      initials: friendInitials(friend && friend.name),
    };
  }


  /* ===== Tower calendar (private My feed + public scrapbook widget) ===== */
  var MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  function pad2(n) {
    n = parseInt(n, 10) || 0;
    return n < 10 ? "0" + n : String(n);
  }

  function towerCalIso(y, m0, day) {
    return y + "-" + pad2(m0 + 1) + "-" + pad2(day);
  }

  function towerCalTodayIso() {
    var d = new Date();
    return towerCalIso(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function towerCalAddDaysIso(iso, delta) {
    var parts = String(iso || "").split("-");
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) - 1;
    var d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) {
      var now = new Date();
      now.setDate(now.getDate() + (delta || 0));
      return towerCalIso(now.getFullYear(), now.getMonth(), now.getDate());
    }
    var dt = new Date(y, m, d + (delta || 0));
    return towerCalIso(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }

  function newCalendarEventId() {
    return "cal-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function normalizeCalendarEvent(ev) {
    if (!ev || typeof ev !== "object") return null;
    var status = ev.status === "pending" ? "pending" : "accepted";
    var source = ev.source === "friend" || ev.source === "google-ics" ? ev.source : "owner";
    return {
      id: String(ev.id || newCalendarEventId()),
      title: String(ev.title || "Event").trim().slice(0, 120) || "Event",
      date: String(ev.date || "").slice(0, 10),
      time: ev.time ? String(ev.time).slice(0, 8) : "",
      notes: ev.notes ? String(ev.notes).slice(0, 240) : "",
      status: status,
      source: source,
      requesterName: ev.requesterName ? String(ev.requesterName).slice(0, 80) : "",
    };
  }

  function normalizeCalendarEventsList(list) {
    if (!Array.isArray(list)) return [];
    return list.map(normalizeCalendarEvent).filter(function (e) {
      return e && /^\d{4}-\d{2}-\d{2}$/.test(e.date);
    });
  }

  function seedCalendarEventsIfMissing(p) {
    if (!p) return false;
    if (typeof p.calendarIcsUrl !== "string") p.calendarIcsUrl = "";
    else p.calendarIcsUrl = String(p.calendarIcsUrl).trim().slice(0, 500);
    if (p.calendarGoogleConnected == null) p.calendarGoogleConnected = false;
    else p.calendarGoogleConnected = !!p.calendarGoogleConnected;
    if (Array.isArray(p.calendarEvents)) {
      p.calendarEvents = normalizeCalendarEventsList(p.calendarEvents);
      return false;
    }
    var today = towerCalTodayIso();
    p.calendarEvents = normalizeCalendarEventsList([
      {
        id: "cal-demo-1",
        title: "Coffee with Jordan",
        date: towerCalAddDaysIso(today, 2),
        time: "10:00",
        notes: "Neighborhood café",
        status: "accepted",
        source: "owner",
      },
      {
        id: "cal-demo-2",
        title: "Block scrapbook night",
        date: towerCalAddDaysIso(today, 7),
        time: "18:30",
        notes: "Bring stickers + scissors",
        status: "accepted",
        source: "owner",
      },
      {
        id: "cal-demo-3",
        title: "Hang with Mira",
        date: towerCalAddDaysIso(today, 4),
        time: "15:00",
        notes: "Requested via public calendar",
        status: "pending",
        source: "friend",
        requesterName: "Mira Chen",
      },
      {
        id: "cal-demo-4",
        title: "Farmers market",
        date: towerCalAddDaysIso(today, 11),
        time: "09:00",
        notes: "",
        status: "accepted",
        source: "owner",
      },
    ]);
    return true;
  }

  function getCalendarViewState(root, key) {
    if (!root.__towerCalView) root.__towerCalView = {};
    if (!root.__towerCalView[key]) {
      var d = new Date();
      root.__towerCalView[key] = {
        year: d.getFullYear(),
        month0: d.getMonth(),
        selected: towerCalTodayIso(),
      };
    }
    return root.__towerCalView[key];
  }

  function eventsForDate(events, iso) {
    return (events || []).filter(function (e) {
      return e && e.date === iso;
    });
  }

  function datesWithEvents(events, year, month0) {
    var mark = {};
    (events || []).forEach(function (e) {
      if (!e || !e.date) return;
      var parts = e.date.split("-");
      var y = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10) - 1;
      if (y === year && m === month0) mark[e.date] = true;
    });
    return mark;
  }

  function formatEventTime(t) {
    if (!t) return "";
    var parts = String(t).split(":");
    var h = parseInt(parts[0], 10);
    var min = parts[1] || "00";
    if (isNaN(h)) return t;
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ":" + min + " " + ampm;
  }

  function renderTowerMonthGrid(view, events, opts) {
    opts = opts || {};
    var year = view.year;
    var month0 = view.month0;
    var selected = view.selected;
    var marked = datesWithEvents(events, year, month0);
    var pendingMark = {};
    (events || []).forEach(function (e) {
      if (e && e.status === "pending" && e.date) pendingMark[e.date] = true;
    });
    var first = new Date(year, month0, 1);
    var startDow = first.getDay();
    var daysInMonth = new Date(year, month0 + 1, 0).getDate();
    var todayIso = towerCalTodayIso();
    var cells = [];
    var i;
    for (i = 0; i < startDow; i++) {
      cells.push('<div class="tower-cal-cell tower-cal-cell--empty" aria-hidden="true"></div>');
    }
    for (i = 1; i <= daysInMonth; i++) {
      var iso = towerCalIso(year, month0, i);
      var cls = "tower-cal-cell";
      if (iso === selected) cls += " is-selected";
      if (iso === todayIso) cls += " is-today";
      if (marked[iso]) cls += " has-events";
      if (pendingMark[iso]) cls += " has-pending";
      cells.push(
        '<button type="button" class="' +
          cls +
          '" data-tower-cal-day="' +
          escapeHtml(iso) +
          '" aria-label="' +
          escapeHtml(iso) +
          (marked[iso] ? ", has events" : "") +
          (iso === selected ? ", selected" : "") +
          '" aria-pressed="' +
          (iso === selected ? "true" : "false") +
          '"><span class="tower-cal-daynum">' +
          i +
          "</span>" +
          (marked[iso] ? '<span class="tower-cal-dot" aria-hidden="true"></span>' : "") +
          "</button>"
      );
    }
    var dow = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
      .map(function (d) {
        return '<span class="tower-cal-dow">' + d + "</span>";
      })
      .join("");
    return (
      '<div class="tower-cal-month" data-tower-cal-month>' +
      '<div class="tower-cal-nav">' +
      '<button type="button" class="btn btn-secondary tower-cal-nav-btn" data-tower-cal-prev aria-label="Previous month">‹</button>' +
      '<div class="tower-cal-label" aria-live="polite">' +
      escapeHtml(MONTH_NAMES[month0] + " " + year) +
      "</div>" +
      '<button type="button" class="btn btn-secondary tower-cal-nav-btn" data-tower-cal-next aria-label="Next month">›</button>' +
      "</div>" +
      '<div class="tower-cal-dows" aria-hidden="true">' +
      dow +
      "</div>" +
      '<div class="tower-cal-grid" role="grid" aria-label="' +
      escapeHtml(opts.gridLabel || "Calendar") +
      '">' +
      cells.join("") +
      "</div></div>"
    );
  }

  function renderDayEventList(events, iso, opts) {
    opts = opts || {};
    var list = eventsForDate(events, iso).slice().sort(function (a, b) {
      return String(a.time || "").localeCompare(String(b.time || ""));
    });
    if (!list.length) {
      return '<p class="form-hint tower-cal-empty">No events on this day.</p>';
    }
    return (
      '<ul class="tower-cal-event-list" role="list">' +
      list
        .map(function (e) {
          var badge =
            e.status === "pending"
              ? '<span class="tower-cal-badge tower-cal-badge--pending">Pending</span>'
              : e.source === "friend"
              ? '<span class="tower-cal-badge">Friend</span>'
              : "";
          var who =
            e.requesterName && e.source === "friend"
              ? '<span class="tower-cal-event-who">from ' + escapeHtml(e.requesterName) + "</span>"
              : "";
          var actions = "";
          if (opts.ownerControls) {
            actions =
              '<span class="tower-cal-event-actions">' +
              (e.status === "pending"
                ? '<button type="button" class="btn btn-secondary tower-cal-mini" data-tower-cal-accept="' +
                  escapeHtml(e.id) +
                  '">Accept</button>'
                : "") +
              '<button type="button" class="btn btn-secondary tower-cal-mini" data-tower-cal-edit="' +
              escapeHtml(e.id) +
              '">Edit</button>' +
              '<button type="button" class="btn btn-secondary tower-cal-mini" data-tower-cal-delete="' +
              escapeHtml(e.id) +
              '">Delete</button></span>';
          }
          return (
            '<li class="tower-cal-event' +
            (e.status === "pending" ? " is-pending" : "") +
            '" data-event-id="' +
            escapeHtml(e.id) +
            '">' +
            '<div class="tower-cal-event-main">' +
            '<span class="tower-cal-event-time">' +
            escapeHtml(formatEventTime(e.time) || "—") +
            "</span>" +
            '<span class="tower-cal-event-title">' +
            escapeHtml(e.title) +
            "</span>" +
            badge +
            who +
            (e.notes
              ? '<span class="tower-cal-event-notes">' + escapeHtml(e.notes) + "</span>"
              : "") +
            "</div>" +
            actions +
            "</li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function saveCalendarToProfile(mutator, opts) {
    var p = TowerProfileStore.get();
    seedCalendarEventsIfMissing(p);
    mutator(p);
    p.calendarEvents = normalizeCalendarEventsList(p.calendarEvents);
    TowerProfileStore.save(p, opts && opts.geometry ? { geometry: true } : undefined);
    return p;
  }

  function minutesOfClock(t) {
    var parts = String(t || "").split(":");
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (isNaN(h)) return null;
    return h * 60 + (isNaN(m) ? 0 : m);
  }

  var HANGOUT_SLOTS = [
    { time: "09:00", label: "Morning" },
    { time: "11:00", label: "Late morning" },
    { time: "13:00", label: "Early afternoon" },
    { time: "15:00", label: "Afternoon" },
    { time: "17:00", label: "Late afternoon" },
    { time: "19:30", label: "Evening" },
  ];

  /* Open parts of the selected day, from events already on the calendar. */
  function suggestHangoutTimes(events, iso) {
    var day = eventsForDate(events, iso);
    var busy = day.map(function (e) { return minutesOfClock(e.time); }).filter(function (n) {
      return n != null;
    });
    function isOpen(slot) {
      var m = minutesOfClock(slot.time);
      if (m == null) return false;
      return busy.every(function (b) { return Math.abs(b - m) >= 90; });
    }
    var open = HANGOUT_SLOTS.filter(isOpen);
    if (open.length < 3) {
      HANGOUT_SLOTS.forEach(function (slot) {
        if (open.length >= 3) return;
        if (open.some(function (s) { return s.time === slot.time; })) return;
        open.push(slot);
      });
    }
    return open.slice(0, 3);
  }

  function renderSchedulerPanel(events, iso) {
    var slots = suggestHangoutTimes(events, iso);
    var dayEvents = eventsForDate(events, iso);
    var busyNote = dayEvents.length
      ? "Already on this day: " + dayEvents.map(function (e) {
          return escapeHtml(e.title) + (e.time ? " at " + escapeHtml(formatEventTime(e.time)) : "");
        }).join(", ") + "."
      : "Nothing is booked on this day yet.";
    return (
      '<div class="tower-cal-scheduler" data-tower-cal-scheduler>' +
      "<h5 class=\"tower-cal-friend-heading\">Suggested hangouts</h5>" +
      '<p class="form-hint">Open times on ' + escapeHtml(iso) + ". " + busyNote + " Pick one.</p>" +
      '<div class="tower-cal-scheduler-actions">' +
      slots.map(function (slot) {
        return (
          '<button type="button" class="btn btn-secondary tower-cal-suggest" data-tower-cal-suggest="' +
          escapeHtml(slot.time) +
          '">' +
          escapeHtml(slot.label) + " · " + escapeHtml(formatEventTime(slot.time)) +
          "</button>"
        );
      }).join("") +
      "</div></div>"
    );
  }

  function renderPrivateCalendar(root) {
    var host = root.querySelector("[data-tower-cal-private]");
    if (!host) return;
    var p = TowerProfileStore.get();
    seedCalendarEventsIfMissing(p);
    var view = getCalendarViewState(root, "private");
    var events = p.calendarEvents || [];
    var selected = view.selected;
    var editingId = host.getAttribute("data-editing-id") || "";
    var editing = null;
    if (editingId) {
      editing = events.filter(function (e) {
        return e.id === editingId;
      })[0] || null;
    }
    var formTitle = editing ? editing.title : "";
    var formDate = editing ? editing.date : selected;
    var formTime = editing ? editing.time || "" : "";
    var formNotes = editing ? editing.notes || "" : "";
    host.innerHTML =
      renderTowerMonthGrid(view, events, { gridLabel: "My calendar" }) +
      '<div class="tower-cal-day-panel">' +
      '<h5 class="tower-cal-day-heading">Events · ' +
      escapeHtml(selected) +
      "</h5>" +
      renderDayEventList(events, selected, { ownerControls: true }) +
      "</div>" +
      '<form class="tower-cal-editor" data-tower-cal-editor action="#" method="post">' +
      "<h5>" +
      (editing ? "Edit event" : "Add event") +
      "</h5>" +
      (editing
        ? '<input type="hidden" name="id" value="' + escapeHtml(editing.id) + '" data-tower-cal-edit-id>'
        : "") +
      '<div class="form-group"><label for="tower-cal-edit-title">Title</label>' +
      '<input id="tower-cal-edit-title" name="title" type="text" maxlength="120" required value="' +
      escapeHtml(formTitle) +
      '" data-tower-cal-edit-title></div>' +
      '<div class="tower-cal-friend-row">' +
      '<div class="form-group"><label for="tower-cal-edit-date">Date</label>' +
      '<input id="tower-cal-edit-date" name="date" type="date" required value="' +
      escapeHtml(formDate) +
      '" data-tower-cal-edit-date></div>' +
      '<div class="form-group"><label for="tower-cal-edit-time">Time</label>' +
      '<input id="tower-cal-edit-time" name="time" type="time" value="' +
      escapeHtml(formTime) +
      '" data-tower-cal-edit-time></div></div>' +
      '<div class="form-group"><label for="tower-cal-edit-notes">Notes</label>' +
      '<input id="tower-cal-edit-notes" name="notes" type="text" maxlength="240" value="' +
      escapeHtml(formNotes) +
      '" data-tower-cal-edit-notes></div>' +
      '<div class="form-actions">' +
      '<button type="submit" class="btn btn-primary">' +
      (editing ? "Save changes" : "Add event") +
      "</button>" +
      (editing
        ? '<button type="button" class="btn btn-secondary" data-tower-cal-cancel-edit>Cancel</button>'
        : "") +
      "</div>" +
      '<p class="commune-status" data-tower-cal-editor-status hidden role="status" aria-live="polite"></p>' +
      "</form>";

    var icsInput = root.querySelector("[data-tower-cal-ics-url]");
    if (icsInput && document.activeElement !== icsInput) {
      icsInput.value = p.calendarIcsUrl || "";
    }
    var gStatus = root.querySelector("[data-tower-cal-google-status]");
    if (gStatus) {
      if (p.calendarGoogleConnected) {
        gStatus.hidden = false;
        gStatus.textContent =
          "Marked connected (demo stub). OAuth needs a free backend later." +
          (p.calendarIcsUrl ? " ICS link saved." : "");
      } else if (p.calendarIcsUrl) {
        gStatus.hidden = false;
        gStatus.textContent = "ICS / public calendar URL saved (no live Google sync from browser).";
      } else {
        gStatus.hidden = true;
        gStatus.textContent = "";
      }
    }
  }

  function renderPublicCalendar(root) {
    var body = root.querySelector("[data-tower-cal-public-body]");
    if (!body) return;
    var p = TowerProfileStore.get();
    seedCalendarEventsIfMissing(p);
    var view = getCalendarViewState(root, "public");
    var owner = isTowerOwner(p);
    /* Visitors see accepted (+ their pending still visible to owner); public scrapbook shows accepted always, pending only for owner */
    var events = (p.calendarEvents || []).filter(function (e) {
      if (!e) return false;
      if (e.status === "accepted") return true;
      return owner && e.status === "pending";
    });
    var selected = view.selected;
    var schedulerHtml = view.schedulerOpen
      ? renderSchedulerPanel(p.calendarEvents || [], selected)
      : "";
    body.innerHTML =
      renderTowerMonthGrid(view, events, { gridLabel: "Public calendar" }) +
      '<div class="tower-cal-day-panel">' +
      '<h5 class="tower-cal-day-heading">On ' +
      escapeHtml(selected) +
      "</h5>" +
      renderDayEventList(events, selected, { ownerControls: owner }) +
      "</div>" +
      schedulerHtml;
    var dateInput = root.querySelector("[data-tower-cal-friend-date]");
    if (dateInput && !dateInput.value) dateInput.value = selected;
  }

  function refreshTowerCalendars(root) {
    if (!root) return;
    try {
      renderPrivateCalendar(root);
    } catch (e) {}
    try {
      renderPublicCalendar(root);
    } catch (e2) {}
    try {
      renderPersonalMiniCalendar(root);
    } catch (e3) {}
  }

  function renderPersonalMiniCalendar(root) {
    var host = root.querySelector("[data-tower-cal-personal-mini], [data-tower-calendar-personal] .tower-cal");
    if (!host) return;
    var p = TowerProfileStore.get() || {};
    var events = Array.isArray(p.calendarEvents) ? p.calendarEvents : [];
    var now = new Date();
    var y = now.getFullYear();
    var m0 = now.getMonth();
    var monthName = now.toLocaleString(undefined, { month: "short", year: "numeric" });
    var daysIn = new Date(y, m0 + 1, 0).getDate();
    var today = now.getDate();
    var html = '<span class="tower-cal-mini-month">' + monthName + "</span>";
    html += '<div class="tower-cal-mini-grid" role="presentation">';
    for (var d = 1; d <= Math.min(daysIn, 28); d++) {
      var mm = m0 + 1 < 10 ? "0" + (m0 + 1) : String(m0 + 1);
      var dd = d < 10 ? "0" + d : String(d);
      var iso = y + "-" + mm + "-" + dd;
      var has = events.some(function (ev) {
        return ev && String(ev.date || ev.day || "").slice(0, 10) === iso;
      });
      html +=
        '<span class="' +
        (d === today ? "is-today" : "") +
        (has ? " has-event" : "") +
        '">' +
        d +
        "</span>";
    }
    html += "</div>";
    html +=
      '<p class="form-hint tower-cal-mini-hint">' +
      events.length +
      " event" +
      (events.length === 1 ? "" : "s") +
      " (same data as Calendar)</p>";
    host.innerHTML = html;
  }

  function initTowerCalendar(root) {
    if (!root || root.__cognationCalendarBound) return;
    root.__cognationCalendarBound = true;

    root.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !root.contains(t)) return;

      var prev = t.closest("[data-tower-cal-prev]");
      var next = t.closest("[data-tower-cal-next]");
      if (prev || next) {
        var host = (prev || next).closest("[data-tower-cal-private], [data-tower-cal-public], [data-tower-cal-public-body]");
        var key = "private";
        if (host && (host.hasAttribute("data-tower-cal-public") || host.hasAttribute("data-tower-cal-public-body") || (host.closest && host.closest("[data-tower-cal-public]")))) {
          key = "public";
        }
        if ((prev || next).closest("[data-tower-cal-public], [data-tower-widget=\"calendar\"]")) key = "public";
        if ((prev || next).closest("[data-tower-cal-private]")) key = "private";
        var view = getCalendarViewState(root, key);
        if (prev) {
          view.month0 -= 1;
          if (view.month0 < 0) {
            view.month0 = 11;
            view.year -= 1;
          }
        } else {
          view.month0 += 1;
          if (view.month0 > 11) {
            view.month0 = 0;
            view.year += 1;
          }
        }
        refreshTowerCalendars(root);
        return;
      }

      var dayBtn = t.closest("[data-tower-cal-day]");
      if (dayBtn) {
        var iso = dayBtn.getAttribute("data-tower-cal-day");
        var key2 = dayBtn.closest("[data-tower-cal-public], [data-tower-widget=\"calendar\"]")
          ? "public"
          : "private";
        var view2 = getCalendarViewState(root, key2);
        view2.selected = iso;
        var parts = iso.split("-");
        view2.year = parseInt(parts[0], 10);
        view2.month0 = parseInt(parts[1], 10) - 1;
        if (key2 === "public") {
          view2.schedulerOpen = true;
          var friendDate = root.querySelector("[data-tower-cal-friend-date]");
          if (friendDate) friendDate.value = iso;
        } else {
          var privHost = root.querySelector("[data-tower-cal-private]");
          if (privHost && !privHost.getAttribute("data-editing-id")) {
            var dateField = null;
            /* date filled after re-render */
          }
        }
        refreshTowerCalendars(root);
        return;
      }

      var acceptBtn = t.closest("[data-tower-cal-accept]");
      if (acceptBtn) {
        var aid = acceptBtn.getAttribute("data-tower-cal-accept");
        saveCalendarToProfile(function (p) {
          (p.calendarEvents || []).forEach(function (e) {
            if (e.id === aid) e.status = "accepted";
          });
        });
        refreshTowerCalendars(root);
        return;
      }

      var delBtn = t.closest("[data-tower-cal-delete]");
      if (delBtn) {
        var did = delBtn.getAttribute("data-tower-cal-delete");
        saveCalendarToProfile(function (p) {
          p.calendarEvents = (p.calendarEvents || []).filter(function (e) {
            return e.id !== did;
          });
        });
        var ph = root.querySelector("[data-tower-cal-private]");
        if (ph && ph.getAttribute("data-editing-id") === did) ph.removeAttribute("data-editing-id");
        refreshTowerCalendars(root);
        return;
      }

      var editBtn = t.closest("[data-tower-cal-edit]");
      if (editBtn) {
        var eid = editBtn.getAttribute("data-tower-cal-edit");
        var priv = root.querySelector("[data-tower-cal-private]");
        if (priv) priv.setAttribute("data-editing-id", eid);
        /* Switch to private side if editing from public */
        if (editBtn.closest("[data-tower-cal-public], [data-tower-widget=\"calendar\"]")) {
          if (isTowerOwner(TowerProfileStore.get())) applyTowerSide(root, "private");
        }
        refreshTowerCalendars(root);
        var focusTitle = root.querySelector("[data-tower-cal-edit-title]");
        if (focusTitle) {
          try {
            focusTitle.focus();
          } catch (eF) {}
        }
        return;
      }

      if (t.closest("[data-tower-cal-cancel-edit]")) {
        var priv2 = root.querySelector("[data-tower-cal-private]");
        if (priv2) priv2.removeAttribute("data-editing-id");
        refreshTowerCalendars(root);
        return;
      }

      if (t.closest("[data-tower-cal-google-connect]")) {
        saveCalendarToProfile(function (p) {
          p.calendarGoogleConnected = true;
        });
        var st = root.querySelector("[data-tower-cal-google-status]");
        if (st) {
          st.hidden = false;
          st.textContent =
            "Connect Google Calendar is a demo stub. Real OAuth needs a free backend later — no paid Google API from the browser.";
        }
        refreshTowerCalendars(root);
        return;
      }

      var suggestBtn = t.closest("[data-tower-cal-suggest]");
      if (suggestBtn) {
        var slotTime = suggestBtn.getAttribute("data-tower-cal-suggest") || "";
        var viewS = getCalendarViewState(root, "public");
        var slotIso = viewS.selected;
        if (!/^\d{2}:\d{2}$/.test(slotTime) || !/^\d{4}-\d{2}-\d{2}$/.test(slotIso)) return;
        saveCalendarToProfile(function (p) {
          var taken = (p.calendarEvents || []).some(function (e) {
            return e && e.date === slotIso && String(e.time || "").slice(0, 5) === slotTime;
          });
          if (taken) return;
          p.calendarEvents.push({
            id: newCalendarEventId(),
            title: "Hangout",
            date: slotIso,
            time: slotTime,
            notes: "Suggested open time",
            status: "accepted",
            source: "owner",
          });
        }, { geometry: true });
        viewS.schedulerOpen = true;
        refreshTowerCalendars(root);
        return;
      }

      if (t.closest("[data-tower-cal-ics-save]")) {
        var ics = root.querySelector("[data-tower-cal-ics-url]");
        var url = ics ? String(ics.value || "").trim().slice(0, 500) : "";
        saveCalendarToProfile(function (p) {
          p.calendarIcsUrl = url;
        });
        var st2 = root.querySelector("[data-tower-cal-google-status]");
        if (st2) {
          st2.hidden = false;
          st2.textContent = url
            ? "ICS / public calendar URL saved (paste-only stub · no live fetch of paid Google APIs)."
            : "ICS link cleared.";
        }
        return;
      }

      var pubCal = t.closest('[data-tower-widget="calendar"]');
      if (!pubCal || !pubCal.contains(t)) return;
      if (pubCal.__cognationDraggedAt && Date.now() - pubCal.__cognationDraggedAt < 500) return;
      if (t.closest("[data-tower-cal-friend-dropdown], a, button, input, textarea, select, label, summary")) return;
      var viewG = getCalendarViewState(root, "public");
      viewG.schedulerOpen = true;
      refreshTowerCalendars(root);
    });

    root.addEventListener("submit", function (ev) {
      var form = ev.target;
      if (!form || !root.contains(form)) return;

      if (form.matches("[data-tower-cal-editor]")) {
        ev.preventDefault();
        var titleEl = form.querySelector("[data-tower-cal-edit-title]");
        var dateEl = form.querySelector("[data-tower-cal-edit-date]");
        var timeEl = form.querySelector("[data-tower-cal-edit-time]");
        var notesEl = form.querySelector("[data-tower-cal-edit-notes]");
        var idEl = form.querySelector("[data-tower-cal-edit-id]");
        var title = titleEl ? titleEl.value.trim().slice(0, 120) : "";
        var date = dateEl ? dateEl.value : "";
        var time = timeEl ? timeEl.value : "";
        var notes = notesEl ? notesEl.value.trim().slice(0, 240) : "";
        var statusEl = form.querySelector("[data-tower-cal-editor-status]");
        function setEdStatus(msg, isError) {
          if (!statusEl) return;
          if (!msg) {
            statusEl.hidden = true;
            statusEl.textContent = "";
            return;
          }
          statusEl.hidden = false;
          statusEl.textContent = msg;
          statusEl.classList.toggle("is-error", !!isError);
        }
        if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          setEdStatus("Title and a valid date are required.", true);
          return;
        }
        var editId = idEl ? idEl.value : "";
        saveCalendarToProfile(function (p) {
          if (editId) {
            var found = false;
            (p.calendarEvents || []).forEach(function (e) {
              if (e.id === editId) {
                e.title = title;
                e.date = date;
                e.time = time;
                e.notes = notes;
                found = true;
              }
            });
            if (!found) {
              p.calendarEvents.push({
                id: editId,
                title: title,
                date: date,
                time: time,
                notes: notes,
                status: "accepted",
                source: "owner",
              });
            }
          } else {
            p.calendarEvents.push({
              id: newCalendarEventId(),
              title: title,
              date: date,
              time: time,
              notes: notes,
              status: "accepted",
              source: "owner",
            });
          }
        });
        var priv3 = root.querySelector("[data-tower-cal-private]");
        if (priv3) priv3.removeAttribute("data-editing-id");
        var view3 = getCalendarViewState(root, "private");
        view3.selected = date;
        var dp = date.split("-");
        view3.year = parseInt(dp[0], 10);
        view3.month0 = parseInt(dp[1], 10) - 1;
        setEdStatus(editId ? "Event updated." : "Event added.", false);
        refreshTowerCalendars(root);
        return;
      }

      if (form.matches("[data-tower-cal-friend-form]")) {
        ev.preventDefault();
        var nameIn = form.querySelector("[data-tower-cal-friend-name]");
        var titleIn = form.querySelector("[data-tower-cal-friend-title]");
        var dateIn = form.querySelector("[data-tower-cal-friend-date]");
        var timeIn = form.querySelector("[data-tower-cal-friend-time]");
        var notesIn = form.querySelector("[data-tower-cal-friend-notes]");
        var fStatus = form.querySelector("[data-tower-cal-friend-status]");
        function setFStatus(msg, isError) {
          if (!fStatus) return;
          if (!msg) {
            fStatus.hidden = true;
            fStatus.textContent = "";
            return;
          }
          fStatus.hidden = false;
          fStatus.textContent = msg;
          fStatus.classList.toggle("is-error", !!isError);
        }
        var requesterName = nameIn ? nameIn.value.trim().slice(0, 80) : "";
        var fTitle = titleIn ? titleIn.value.trim().slice(0, 120) : "";
        var fDate = dateIn ? dateIn.value : "";
        var fTime = timeIn ? timeIn.value : "";
        var fNotes = notesIn ? notesIn.value.trim().slice(0, 200) : "";
        if (!requesterName || !fTitle || !/^\d{4}-\d{2}-\d{2}$/.test(fDate)) {
          setFStatus("Name, event title, and date are required.", true);
          return;
        }
        saveCalendarToProfile(function (p) {
          p.calendarEvents.push({
            id: newCalendarEventId(),
            title: fTitle,
            date: fDate,
            time: fTime,
            notes: fNotes,
            status: "pending",
            source: "friend",
            requesterName: requesterName,
          });
        });
        var view4 = getCalendarViewState(root, "public");
        view4.selected = fDate;
        var dp2 = fDate.split("-");
        view4.year = parseInt(dp2[0], 10);
        view4.month0 = parseInt(dp2[1], 10) - 1;
        if (titleIn) titleIn.value = "";
        if (notesIn) notesIn.value = "";
        setFStatus("Request added to the owner calendar as pending (demo).", false);
        refreshTowerCalendars(root);
      }
    });

    refreshTowerCalendars(root);
  }


  function renderFriendsBrowse(root) {
    var list = root.querySelector("[data-tower-friends-browse-list]");
    if (!list) return;
    list.innerHTML = "";
    DEMO_FRIENDS.forEach(function (friend, index) {
      if (!friend || friend.id === "alexa-thomas") return; /* skip self in browse list */
      var li = document.createElement("li");
      li.className = "tower-friends-browse-item";
      var a = document.createElement("a");
      a.className = "tower-friends-browse-link tower-friend-avatar-link";
      var handle = friendHandleFromId(friend.id);
      a.href = "#tower-profile-" + handle;
      a.setAttribute("data-tower-friend-open", handle);
      a.setAttribute("data-tower-friend", friend.id);
      /* Demo online: every other friend after first */
      var online = index % 2 === 0;
      a.setAttribute("data-online", online ? "true" : "false");
      a.setAttribute("aria-label", "Open " + friend.name + " public Tower" + (online ? " (online)" : ""));
      var av = document.createElement("span");
      av.className = "tower-friends-browse-avatar tower-friend-avatar" + (online ? " is-online" : "");
      av.setAttribute("aria-hidden", "true");
      var style = friendAvatarStyle(friend, index);
      av.style.background = style.background;
      av.style.color = style.color;
      av.textContent = style.initials;
      a.appendChild(av);
      li.appendChild(a);
      list.appendChild(li);
    });
  }

  function initFriendsBrowse(root) {
    if (!root || root.__cognationFriendsBrowseBound) return;
    root.__cognationFriendsBrowseBound = true;
    renderFriendsBrowse(root);
    var host = root.querySelector("[data-tower-friends], [data-tower-friends-browse]");
    if (!host) return;
    host.addEventListener("click", function (ev) {
      var link = ev.target && ev.target.closest("[data-tower-friend-open]");
      if (!link || !host.contains(link)) return;
      ev.preventDefault();
      var handle = link.getAttribute("data-tower-friend-open");
      if (!handle) return;
      try {
        location.hash = "tower-profile-" + handle;
      } catch (e) {}
      applyTowerSide(root, "public");
      /* Demo friends are not full dual-profile accounts — show public scrapbook side */
      try {
        var tabTower = document.getElementById("tab-tower");
        if (tabTower) tabTower.click();
      } catch (e2) {}
    });
  }

  function syncProfileKindToggle(root) {
    var toggle = root.querySelector("[data-tower-profile-kind-toggle]");
    if (!toggle) return;
    var session = getSessionObject();
    var user = session && session.username ? String(session.username).toLowerCase() : "";
    var profiles = [];
    if (usingRemoteSocial()) {
      var social = remoteSocial();
      profiles = social && social.getMyProfiles ? social.getMyProfiles() : [];
      var remoteOwner = isTowerOwner(TowerProfileStore.get());
      toggle.hidden = !remoteOwner;
      var currentRemoteKind =
        (TowerProfileStore.get() && TowerProfileStore.get()._profileKind) ||
        (session && session.profileKind) ||
        "personal";
      toggle.querySelectorAll("[data-tower-profile-kind]").forEach(function (btn) {
        var remoteKind = btn.getAttribute("data-tower-profile-kind");
        var hasRemote = profiles.some(function (p) {
          return p.kind === remoteKind;
        });
        btn.setAttribute("aria-selected", remoteKind === currentRemoteKind ? "true" : "false");
        btn.classList.toggle("is-selected", remoteKind === currentRemoteKind);
        btn.hidden = !hasRemote && remoteKind !== "professional";
        btn.disabled = !hasRemote;
        if (!hasRemote && remoteKind === "professional") {
          btn.title = "Add a professional page from Edit profile";
        }
      });
      return;
    }
    if (user && window.CognationAccounts) {
      profiles = window.CognationAccounts.getProfilesForUsername(user) || [];
    }
    var owner = isTowerOwner(TowerProfileStore.get());
    var show = owner && profiles.length > 0;
    toggle.hidden = !show;
    var active = TowerProfileStore.get();
    var kind = (active && active._profileKind) || (session && session.profileKind) || "personal";
    toggle.querySelectorAll("[data-tower-profile-kind]").forEach(function (btn) {
      var k = btn.getAttribute("data-tower-profile-kind");
      var on = k === kind;
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.classList.toggle("is-selected", on);
      var has = profiles.some(function (p) { return p.kind === k; });
      btn.disabled = !has;
      btn.hidden = !has && profiles.length < 2;
    });
    /* Show both tabs if owner might add second — keep professional visible when only personal */
    var proBtn = toggle.querySelector('[data-tower-profile-kind="professional"]');
    var perBtn = toggle.querySelector('[data-tower-profile-kind="personal"]');
    if (proBtn && !profiles.some(function (p) { return p.kind === "professional"; })) {
      proBtn.hidden = false;
      proBtn.disabled = true;
      proBtn.title = "Add a professional page from Edit profile";
    }
    if (perBtn && !profiles.some(function (p) { return p.kind === "personal"; })) {
      perBtn.hidden = false;
      perBtn.disabled = true;
    }
  }

  function switchProfileKind(root, kind) {
    kind = kind === "professional" ? "professional" : "personal";
    var session = getSessionObject();
    if (usingRemoteSocial()) {
      var social = remoteSocial();
      var remoteProfiles = social && social.getMyProfiles ? social.getMyProfiles() : [];
      var remoteTarget = remoteProfiles.filter(function (profile) {
        return profile.kind === kind;
      })[0];
      if (!remoteTarget || !social || !social.setActiveProfile) return false;
      social.setActiveProfile(remoteTarget);
      if (remoteTarget.handle) {
        try { location.hash = "tower-profile-" + remoteTarget.handle; } catch (eRemote) {}
      }
      renderProfileChrome(root);
      syncProfileKindToggle(root);
      syncAddProfileUi(root);
      applyTowerSide(root, "public");
      return true;
    }
    if (!session || !session.username || !window.CognationAccounts) return false;
    var profiles = window.CognationAccounts.getProfilesForUsername(session.username) || [];
    var target = profiles.filter(function (p) { return p.kind === kind; })[0];
    if (!target) return false;
    if (window.CognationAuth && typeof window.CognationAuth.setActiveProfile === "function") {
      window.CognationAuth.setActiveProfile(target.id);
    } else {
      session.activeProfileId = target.id;
      session.profileKind = kind;
      try {
        localStorage.setItem("cognation.session.v2", JSON.stringify(session));
      } catch (e) {}
    }
    var handle = normalizeHandle(target.handle || "");
    if (handle) {
      try { location.hash = "tower-profile-" + handle; } catch (e2) {}
    }
    renderProfileChrome(root);
    syncProfileKindToggle(root);
    syncAddProfileUi(root);
    applyTowerSide(root, "public");
    return true;
  }

  function initProfileKindToggle(root) {
    if (!root || root.__cognationKindBound) return;
    root.__cognationKindBound = true;
    var toggle = root.querySelector("[data-tower-profile-kind-toggle]");
    if (!toggle) return;
    toggle.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest("[data-tower-profile-kind]");
      if (!btn || btn.disabled || !toggle.contains(btn)) return;
      switchProfileKind(root, btn.getAttribute("data-tower-profile-kind"));
    });
    document.addEventListener("cognation:active-profile-changed", function () {
      renderProfileChrome(root);
      syncProfileKindToggle(root);
      syncAddProfileUi(root);
    });
    document.addEventListener("cognation:session-started", function () {
      syncProfileKindToggle(root);
      syncAddProfileUi(root);
    });
    syncProfileKindToggle(root);
  }

  function syncAddProfileUi(root) {
    var btn = root.querySelector("[data-tower-add-profile]");
    var phoneIn = root.querySelector("[data-tower-account-phone-input]");
    var status = root.querySelector("[data-tower-add-profile-status]");
    var session = getSessionObject();
    var user = session && session.username ? String(session.username).toLowerCase() : "";
    if (!btn) return;
    if (usingRemoteSocial()) {
      var social = remoteSocial();
      var remoteProfiles = social && social.getMyProfiles ? social.getMyProfiles() : [];
      var hasRemoteProfessional = remoteProfiles.some(function (p) {
        return p.kind === "professional";
      });
      btn.hidden = hasRemoteProfessional;
      if (status) {
        status.hidden = !hasRemoteProfessional;
        status.textContent = hasRemoteProfessional
          ? "Your professional page is set up."
          : "";
        status.classList.remove("is-error");
      }
      return;
    }
    if (!user || !window.CognationAccounts) {
      btn.hidden = true;
      return;
    }
    var acct = window.CognationAccounts.getAccountByUsername(user);
    if (phoneIn && acct && document.activeElement !== phoneIn) {
      phoneIn.value = acct.phone || "";
    }
    var profiles = window.CognationAccounts.getProfilesForUsername(user) || [];
    var hasPersonal = profiles.some(function (p) { return p.kind === "personal"; });
    var hasPro = profiles.some(function (p) { return p.kind === "professional"; });
    if (profiles.length >= 2 || (hasPersonal && hasPro)) {
      btn.hidden = true;
      if (status) {
        status.hidden = false;
        status.textContent = "Both Personal and Professional pages are set up for this account.";
        status.classList.remove("is-error");
      }
      return;
    }
    btn.hidden = false;
    if (!hasPro) {
      btn.textContent = "Add professional page";
      btn.setAttribute("data-add-kind", "professional");
    } else {
      btn.textContent = "Add personal page";
      btn.setAttribute("data-add-kind", "personal");
    }
  }

  function initAddProfile(root) {
    if (!root || root.__cognationAddProfileBound) return;
    root.__cognationAddProfileBound = true;
    var btn = root.querySelector("[data-tower-add-profile]");
    var status = root.querySelector("[data-tower-add-profile-status]");
    function setSt(msg, isError) {
      if (!status) return;
      status.hidden = !msg;
      status.textContent = msg || "";
      status.classList.toggle("is-error", !!isError);
    }
    if (!btn) return;
    btn.addEventListener("click", function () {
      var session = getSessionObject();
      if (usingRemoteSocial()) {
        var social = remoteSocial();
        if (!social || !social.createProfessionalProfile) {
          setSt("Sign in to add a page.", true);
          return;
        }
        var remoteNameIn = root.querySelector("#tower-display-name");
        var remoteHandleIn = root.querySelector("[data-tower-handle]");
        btn.disabled = true;
        setSt("Creating your professional page…", false);
        social
          .createProfessionalProfile({
            displayName: remoteNameIn && remoteNameIn.value
              ? remoteNameIn.value
              : "Professional page",
            handle: remoteHandleIn && remoteHandleIn.value
              ? remoteHandleIn.value + "-pro"
              : "professional-page",
          })
          .then(function (profile) {
            setSt("Professional page created.", false);
            if (profile && profile.handle) {
              location.hash = "tower-profile-" + profile.handle;
            }
            syncAddProfileUi(root);
            syncProfileKindToggle(root);
            renderProfileChrome(root);
            applyTowerSide(root, "public");
          })
          .catch(function (error) {
            setSt(
              (error && error.message) || "Could not create a professional page.",
              true
            );
          })
          .finally(function () {
            btn.disabled = false;
          });
        return;
      }
      if (!session || !session.username || !window.CognationAccounts) {
        setSt("Sign in to add a page.", true);
        return;
      }
      var phoneIn = root.querySelector("[data-tower-account-phone-input]");
      var phone = phoneIn ? phoneIn.value.trim() : "";
      var acct = window.CognationAccounts.getAccountByUsername(session.username);
      if (!phone && acct) phone = acct.phone || "";
      if (!phone || window.CognationAccounts.phoneKey(phone).length < 10) {
        setSt("Enter a valid phone number to claim a second profile (demo registry).", true);
        if (phoneIn) phoneIn.focus();
        return;
      }
      var gate = window.CognationAccounts.canAddProfileForPhone(phone);
      if (!gate.ok) {
        setSt(gate.reason, true);
        return;
      }
      var kind = btn.getAttribute("data-add-kind") || "professional";
      var handleBase = String(session.username || "user").toLowerCase();
      var result = window.CognationAccounts.createProfile({
        username: session.username,
        phone: phone,
        kind: kind,
        handle: kind === "professional" ? handleBase + "-pro" : handleBase,
        displayName: kind === "professional" ? "Alexa J Thomas" : "Alexa",
      });
      if (!result.ok) {
        setSt(result.error || "Could not create profile.", true);
        return;
      }
      setSt((kind === "professional" ? "Professional" : "Personal") + " page created.", false);
      if (window.CognationAuth && window.CognationAuth.setActiveProfile) {
        window.CognationAuth.setActiveProfile(result.profile.id);
      }
      syncAddProfileUi(root);
      syncProfileKindToggle(root);
      renderProfileChrome(root);
      applyTowerSide(root, "public");
    });
    syncAddProfileUi(root);
  }

    function clearWidgetSelection(stage) {
    if (!stage) return;
    stage.querySelectorAll(".is-widget-selected").forEach(function (el) {
      el.classList.remove("is-widget-selected");
    });
  }

  function ensureStickersOnStage(stage) {
    if (!stage || stage.__cognationStickersReparented) return;
    /* Lift every public sticker to be a direct child of the scrapbook canvas.
       Feed lives on the private side — never promote it onto the public stage. */
    var widgets = Array.prototype.slice.call(stage.querySelectorAll("[data-tower-widget]"));
    widgets.forEach(function (el) {
      var id = el.getAttribute("data-tower-widget");
      if (id === "feed" || id === "messages") return;
      if (el.parentNode === stage) return;
      stage.appendChild(el);
    });
    stage.__cognationStickersReparented = true;
  }

  function polaroidMarkup() {
    return (
      '<button type="button" class="tower-sticker-handle" data-tower-sticker-handle aria-label="Move Polaroid sticker" tabindex="-1" hidden>⋮⋮</button>' +
      '<div class="tower-avatar-wrap" data-tower-avatar-frame="polaroid" data-tower-polaroid>' +
      '<div class="tower-avatar" data-tower-polaroid-photo aria-hidden="true"></div>' +
      '<label class="tower-avatar-upload" title="Upload polaroid">' +
      '<span class="tower-avatar-upload-hint" aria-hidden="true">📷</span>' +
      '<span class="visually-hidden">Upload polaroid</span>' +
      '<input type="file" accept="image/*" data-tower-polaroid-file>' +
      "</label></div>"
    );
  }

  /* One upright Polaroid on every personal profile. Professional pages stay without it. */
  function ensurePersonalPolaroid(root, p) {
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (!stage) return;
    var nodes = Array.prototype.slice.call(stage.querySelectorAll('[data-tower-widget="polaroid"]'));
    var personal = !p || p._profileKind !== "professional";
    if (!personal || (p && p.polaroidRemoved)) {
      nodes.forEach(function (el) {
        el.hidden = true;
        el.classList.add("is-widget-off");
      });
      return;
    }
    while (nodes.length > 1) {
      var extra = nodes.pop();
      if (extra && extra.parentNode) extra.parentNode.removeChild(extra);
    }
    var el = nodes[0];
    if (!el) {
      el = document.createElement("div");
      el.className = "tower-sticker tower-sticker--polaroid";
      el.setAttribute("data-tower-widget", "polaroid");
      el.setAttribute("data-sticker-label", "Polaroid");
      el.innerHTML = polaroidMarkup();
      stage.appendChild(el);
    }
    el.hidden = false;
    el.classList.remove("is-widget-off");
  }

  function applyWidgetLayout(root, p) {
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (!stage) return;
    stage.classList.add("is-sticker-stage");
    ensureStickersOnStage(stage);
    ensurePersonalPolaroid(root, p);
    /* Stand-in camera and MP3 stickers are not the original widgets. Drop them if a previous session left one. */
    var stageCam = root.querySelector("[data-tower-scrapbook]");
    if (stageCam) {
      stageCam.querySelectorAll('[data-tower-widget="camera"], [data-tower-widget="mp3"]').forEach(function (el) {
        el.remove();
      });
    }
    if (p) mergeScrapbookLayout(p);
    if (p) settleArrivalTilts(p);
    var layout = getWidgetLayout(p) || DEFAULT_WIDGET_LAYOUT;
    var zBase = 2;
    Object.keys(DEFAULT_WIDGET_LAYOUT).forEach(function (id) {
      if (id === "feed" || id === "messages") return;
      var el = stage.querySelector('[data-tower-widget="' + id + '"]');
      if (!el || el.classList.contains("is-dragging")) return;
      var pos = layout[id] || DEFAULT_WIDGET_LAYOUT[id];
      var fallback = DEFAULT_WIDGET_LAYOUT[id] || { x: 8, y: 8, z: zBase, tilt: 0 };
      var x = layoutCoord(pos && pos.x, fallback.x);
      var y = layoutCoord(pos && pos.y, fallback.y);
      var z = layoutCoord(pos && pos.z, fallback.z || zBase);
      var tilt = layoutCoord(pos && pos.tilt, 0);
      el.style.setProperty("--sticker-x", x + "%");
      el.style.setProperty("--sticker-y", y + "%");
      el.style.setProperty("--sticker-z", String(z));
      el.style.setProperty("--sticker-tilt", tilt + "deg");
      el.setAttribute("data-sticker-x", String(x));
      el.setAttribute("data-sticker-y", String(y));
      el.setAttribute("data-sticker-z", String(z));
    });
  }

  function collageCellCount(layoutId) {
    var meta = COLLAGE_LAYOUTS[layoutId] || COLLAGE_LAYOUTS.none;
    return meta.cells || 0;
  }

  function demoCollageCells(n) {
    var cells = [];
    for (var i = 0; i < n; i++) {
      cells.push({ color: DEMO_COLLAGE_COLORS[i % DEMO_COLLAGE_COLORS.length], url: "" });
    }
    return cells;
  }

  function renderCollageStage(root, p) {
    var stage = root.querySelector("[data-tower-collage-stage]");
    if (!stage) return;
    var bg = (p && p.backgroundCollage) || { layoutId: "none", cells: [] };
    var layoutId = bg.layoutId && COLLAGE_LAYOUTS[bg.layoutId] ? bg.layoutId : "none";
    var n = collageCellCount(layoutId);
    stage.setAttribute("data-layout", layoutId);
    stage.innerHTML = "";
    stage.hidden = !n;
    if (!n) return;
    var grid = document.createElement("div");
    grid.className = "tower-collage-grid";
    var cells = Array.isArray(bg.cells) ? bg.cells : [];
    for (var i = 0; i < n; i++) {
      var cell = cells[i] || { color: DEMO_COLLAGE_COLORS[i % DEMO_COLLAGE_COLORS.length], url: "" };
      var tile = document.createElement("div");
      tile.className = "tower-collage-tile";
      var color = cell.color || DEMO_COLLAGE_COLORS[i % DEMO_COLLAGE_COLORS.length];
      tile.style.setProperty("--tile-color", color);
      var url = cell.url ? String(cell.url).replace(/"/g, "") : "";
      if (layoutId === "polaroid-scatter") {
        var photo = document.createElement("div");
        photo.className = "tower-collage-tile-photo";
        if (url) photo.style.backgroundImage = 'url("' + url + '")';
        else photo.style.backgroundColor = color;
        tile.appendChild(photo);
      } else {
        if (url) tile.style.backgroundImage = 'url("' + url + '")';
        else tile.style.backgroundColor = color;
      }
      grid.appendChild(tile);
    }
    stage.appendChild(grid);
  }

  function syncCollageForm(root, p) {
    var bg = (p && p.backgroundCollage) || { layoutId: "none", cells: [] };
    var layoutSel = root.querySelector("[data-tower-collage-layout]");
    var cellsHost = root.querySelector("[data-tower-collage-cells]");
    if (layoutSel && document.activeElement !== layoutSel) {
      layoutSel.value = bg.layoutId || "none";
    }
    if (!cellsHost) return;
    var layoutId = layoutSel ? layoutSel.value : bg.layoutId || "none";
    var n = collageCellCount(layoutId);
    cellsHost.innerHTML = "";
    var cells = Array.isArray(bg.cells) ? bg.cells : [];
    for (var i = 0; i < n; i++) {
      var cell = cells[i] || {};
      var wrap = document.createElement("div");
      wrap.className = "tower-collage-cell-field";
      var lab = document.createElement("label");
      lab.setAttribute("for", "tower-collage-cell-" + i);
      lab.textContent = "Cell " + (i + 1) + " image URL";
      var input = document.createElement("input");
      input.id = "tower-collage-cell-" + i;
      input.type = "url";
      input.inputMode = "url";
      input.maxLength = 500;
      input.placeholder = "https://… or leave blank for pink tile";
      input.value = cell.url || "";
      input.setAttribute("data-tower-collage-cell", String(i));
      wrap.appendChild(lab);
      wrap.appendChild(input);
      cellsHost.appendChild(wrap);
    }
  }

  function readCollageFromForm(root) {
    var layoutSel = root.querySelector("[data-tower-collage-layout]");
    var layoutId = layoutSel && layoutSel.value ? layoutSel.value : "none";
    if (!COLLAGE_LAYOUTS[layoutId]) layoutId = "none";
    var n = collageCellCount(layoutId);
    var cells = [];
    for (var i = 0; i < n; i++) {
      var input = root.querySelector('[data-tower-collage-cell="' + i + '"]');
      var url = input ? String(input.value || "").trim().slice(0, 500) : "";
      if (url && !/^https?:\/\//i.test(url) && url.indexOf("data:image/") !== 0) url = "";
      cells.push({
        url: url,
        color: DEMO_COLLAGE_COLORS[i % DEMO_COLLAGE_COLORS.length],
      });
    }
    return { layoutId: layoutId, cells: cells };
  }

  var stickerZCounter = 20;


  function getQuoteStickers(p) {
    if (!p.quoteStickers || !Array.isArray(p.quoteStickers)) p.quoteStickers = [];
    return p.quoteStickers;
  }

  function uidQuote() {
    return "quote-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e4).toString(36);
  }

  function removeQuoteSticker(root, quoteId) {
    if (!quoteId) return;
    var p = TowerProfileStore.get();
    p.quoteStickers = getQuoteStickers(p).filter(function (q) {
      return q.id !== quoteId;
    });
    TowerProfileStore.save(p);
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (!stage) return;
    var el = stage.querySelector('[data-tower-quote-id="' + quoteId + '"]');
    if (el) el.remove();
  }

  function addQuoteSticker(root, text, layout, existingId) {
    text = String(text || "").trim().slice(0, 400);
    if (!text) return null;
    var p = TowerProfileStore.get();
    var quotes = getQuoteStickers(p);
    var id = existingId || uidQuote();
    var entry = {
      id: id,
      text: text,
      x: layout && typeof layout.x === "number" ? layout.x : 36 + Math.random() * 20,
      y: layout && typeof layout.y === "number" ? layout.y : 30 + Math.random() * 25,
      z: layout && typeof layout.z === "number" ? layout.z : 10,
      tilt: layout && typeof layout.tilt === "number" ? layout.tilt : 0,
    };
    var found = false;
    quotes = quotes.map(function (q) {
      if (q.id === id) {
        found = true;
        return entry;
      }
      return q;
    });
    if (!found) quotes.push(entry);
    p.quoteStickers = quotes;
    TowerProfileStore.save(p);
    renderQuoteStickers(root, p);
    return entry;
  }

  function renderQuoteStickers(root, p) {
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (!stage) return;
    if (p) settleArrivalTilts(p);
    stage.querySelectorAll("[data-tower-quote-id]").forEach(function (el) {
      el.remove();
    });
    var quotes = getQuoteStickers(p);
    quotes.forEach(function (q) {
      var el = document.createElement("div");
      el.className = "tower-sticker tower-sticker--quote";
      el.setAttribute("data-tower-widget", "quote");
      el.setAttribute("data-tower-quote-id", q.id);
      el.setAttribute("data-sticker-label", "Quote");
      el.setAttribute("data-quote-text", q.text);
      el.setAttribute("data-sticker-x", String(q.x));
      el.setAttribute("data-sticker-y", String(q.y));
      el.setAttribute("data-sticker-z", String(q.z || 10));
      el.style.setProperty("--sticker-x", q.x + "%");
      el.style.setProperty("--sticker-y", q.y + "%");
      el.style.setProperty("--sticker-z", String(q.z || 10));
      el.style.setProperty("--sticker-tilt", (q.tilt || 0) + "deg");
      el.innerHTML = '<blockquote class="tower-quote-card"></blockquote>';
      el.querySelector(".tower-quote-card").textContent = q.text;
      stage.appendChild(el);
    });
    syncOwnerStickerHandles(root);
  }

  function commitInlineName(root, el) {
    var p = TowerProfileStore.get();
    var next = String(el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!next) next = p.displayName || "You";
    p.displayName = next;
    el.textContent = next;
    var nameInput = root.querySelector("#tower-display-name");
    if (nameInput) nameInput.value = next;
    TowerProfileStore.save(p);
  }

  function commitInlineHandle(root, el) {
    var p = TowerProfileStore.get();
    var prev = normalizeHandle(p.handle || "");
    var next = normalizeHandle(el.textContent || "");
    if (!next) {
      el.textContent = prev ? "@" + prev : "@";
      return;
    }
    if (window.CognationAccounts && typeof window.CognationAccounts.getProfileByHandle === "function") {
      var clash = window.CognationAccounts.getProfileByHandle(next);
      if (clash && clash.id !== p._profileId) {
        el.textContent = prev ? "@" + prev : "@";
        return;
      }
    }
    p.handle = next;
    el.textContent = "@" + next;
    var input = root.querySelector("[data-tower-handle]");
    if (input) input.value = next;
    TowerProfileStore.save(p);
    var profileRoot = root.querySelector("[data-tower-profile]");
    if (profileRoot) {
      var slug = profilePublicSlug(p);
      profileRoot.id = "tower-profile-" + slug;
      profileRoot.setAttribute("data-tower-handle", next);
      profileRoot.setAttribute("data-author-slug", slug);
    }
    try {
      if (location.hash !== "#" + profilePublicHash(p)) location.hash = profilePublicHash(p);
    } catch (eHash) {}
  }

  function commitInlineQuote(root, el) {
    var sticker = el.closest("[data-tower-quote-id]");
    if (!sticker) return;
    var id = sticker.getAttribute("data-tower-quote-id");
    var p = TowerProfileStore.get();
    var quotes = getQuoteStickers(p);
    var prev = "";
    quotes.forEach(function (q) {
      if (q && q.id === id) prev = q.text || "";
    });
    var text = String(el.textContent || "").trim().slice(0, 400);
    if (!text) {
      el.textContent = prev;
      return;
    }
    p.quoteStickers = quotes.map(function (q) {
      if (!q || q.id !== id) return q;
      return { id: q.id, text: text, x: q.x, y: q.y, z: q.z, tilt: q.tilt };
    });
    sticker.setAttribute("data-quote-text", text);
    el.textContent = text;
    TowerProfileStore.save(p, { geometry: true });
  }

  function commitInlineSlogan(root, el) {
    var p = TowerProfileStore.get();
    var text = String(el.textContent || "").trim().slice(0, 400);
    p.slogan = text;
    p.publicWidgets = normalizePublicWidgets(p.publicWidgets);
    p.publicWidgets.slogan = !!text;
    var input = root.querySelector("[data-tower-slogan]");
    if (input) input.value = text;
    el.textContent = text;
    TowerProfileStore.save(p);
    if (!text) {
      var sticker = el.closest('[data-tower-widget="slogan"]');
      if (sticker) {
        sticker.hidden = true;
        sticker.classList.add("is-widget-off");
      }
    }
  }

  function initInlineProfileEdits(root) {
    if (!root || root.__cognationInlineEditBound) return;
    root.__cognationInlineEditBound = true;

    function ownerPublic() {
      return isTowerOwner(TowerProfileStore.get()) && root.getAttribute("data-tower-side") === "public";
    }

    function canEdit() {
      var p = TowerProfileStore.get();
      return ownerPublic() && p && p._profileKind !== "professional";
    }

    function canEditHandle() {
      return ownerPublic();
    }

    function recentDrag(el) {
      var sticker = el && el.closest("[data-tower-widget]");
      return !!(sticker && sticker.__cognationDraggedAt && Date.now() - sticker.__cognationDraggedAt < 500);
    }

    root.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest || !root.contains(t)) return;
      var el = t.closest(".tower-quote-card, .tower-slogan-card, [data-tower-profile-name], [data-tower-handle-badge]");
      if (!el || !root.contains(el) || recentDrag(el)) return;
      var isHandle = el.matches("[data-tower-handle-badge]");
      if (isHandle) {
        if (!canEditHandle()) return;
      } else if (!canEdit()) return;
      if (el.getAttribute("contenteditable") === "true") return;
      /* First click selects the sticker so Backspace can remove it. The next click edits. */
      var sticker = el.closest("[data-tower-widget]");
      if (!sticker || !sticker.__cognationWasSelected) return;
      el.setAttribute("contenteditable", "true");
      el.setAttribute("spellcheck", "false");
      try { el.focus(); } catch (eFocus) {}
    });

    root.addEventListener("keydown", function (ev) {
      var el = ev.target;
      if (!el || el.getAttribute("contenteditable") !== "true") return;
      if (!el.closest(".tower-quote-card, .tower-slogan-card, [data-tower-profile-name], [data-tower-handle-badge]")) return;
      if (ev.key === "Enter") {
        ev.preventDefault();
        el.blur();
      }
    });

    root.addEventListener("focusout", function (ev) {
      var el = ev.target;
      if (!el || !el.getAttribute || el.getAttribute("contenteditable") !== "true") return;
      if (!root.contains(el)) return;
      el.removeAttribute("contenteditable");
      if (el.matches(".tower-quote-card")) commitInlineQuote(root, el);
      else if (el.matches(".tower-slogan-card")) commitInlineSlogan(root, el);
      else if (el.matches("[data-tower-profile-name]")) commitInlineName(root, el);
      else if (el.matches("[data-tower-handle-badge]")) commitInlineHandle(root, el);
    });
  }

  function openAddWidgetDialog(root) {
    var dlg = document.querySelector("[data-tower-add-widget-dialog]");
    if (!dlg) return;
    dlg.hidden = false;
    var ta = dlg.querySelector("[data-tower-add-quote-text]");
    if (ta) {
      ta.value = "";
      ta.focus();
    }
  }

  function closeAddWidgetDialog() {
    var dlg = document.querySelector("[data-tower-add-widget-dialog]");
    if (dlg) dlg.hidden = true;
  }

  function initAddWidgetUi(root) {
    if (root.__cognationAddWidgetBound) return;
    root.__cognationAddWidgetBound = true;
    var addBtn = root.querySelector("[data-tower-add-widget]");
    var dlg = document.querySelector("[data-tower-add-widget-dialog]");
    if (addBtn) {
      addBtn.addEventListener("click", function () {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        if (root.getAttribute("data-tower-side") !== "public") {
          setProfileStatusOn(root, "Switch to Public scrapbook to add stickers.", false);
          return;
        }
        openAddWidgetDialog(root);
      });
    }
    if (!dlg || dlg.__cognationBound) return;
    dlg.__cognationBound = true;
    dlg.addEventListener("click", function (ev) {
      if (ev.target === dlg) closeAddWidgetDialog();
    });
    var cancel = dlg.querySelector("[data-tower-add-widget-cancel]");
    if (cancel) cancel.addEventListener("click", closeAddWidgetDialog);
    var confirm = dlg.querySelector("[data-tower-add-quote-confirm]");
    if (confirm) {
      confirm.addEventListener("click", function () {
        var ta = dlg.querySelector("[data-tower-add-quote-text]");
        var text = ta ? ta.value : "";
        var choice = dlg.getAttribute("data-add-choice") || "quote";
        if (choice === "slogan") {
          var p = TowerProfileStore.get();
          p.slogan = String(text || "").trim().slice(0, 400);
          p.publicWidgets = normalizePublicWidgets(p.publicWidgets);
          p.publicWidgets.slogan = !!p.slogan;
          TowerProfileStore.save(p);
          applyPublicWidgets(root, p);
          var sloganDisplay = root.querySelector("[data-tower-slogan-display]");
          if (sloganDisplay) sloganDisplay.textContent = p.slogan;
          var sloganInput = root.querySelector("[data-tower-slogan]");
          if (sloganInput) sloganInput.value = p.slogan;
          setProfileStatusOn(root, "Slogan updated.", false);
        } else {
          addQuoteSticker(root, text);
          setProfileStatusOn(root, "Quote sticker added.", false);
        }
        closeAddWidgetDialog();
      });
    }
    dlg.querySelectorAll("[data-tower-add-choice]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        dlg.setAttribute("data-add-choice", btn.getAttribute("data-tower-add-choice") || "quote");
        dlg.querySelectorAll("[data-tower-add-choice]").forEach(function (b) {
          b.classList.toggle("is-selected", b === btn);
        });
      });
    });

    /* Empty canvas click on personal public page → offer add */
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (stage && !stage.__cognationAddCanvasBound) {
      stage.__cognationAddCanvasBound = true;
      stage.addEventListener("dblclick", function (ev) {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        if (root.getAttribute("data-tower-side") !== "public") return;
        if (ev.target.closest("[data-tower-widget], [data-tower-friend-pin], [data-tower-badge-pin], a, button, input, textarea")) return;
        var p = TowerProfileStore.get();
        if (p._profileKind && p._profileKind !== "personal") {
          /* Still allow on professional, but prompt emphasizes personal */
        }
        openAddWidgetDialog(root);
      });
    }
  }

  function setProfileStatusOn(root, msg, isError) {
    var el = root.querySelector("[data-tower-profile-status]");
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
    el.classList.toggle("is-error", !!isError);
  }


  function initScrapbookStickers(root) {
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (!stage || stage.__cognationStickersBound) return;
    stage.__cognationStickersBound = true;
    stage.classList.add("is-sticker-stage");
    stage.classList.remove("is-editing");
    ensureStickersOnStage(stage);

    var resetBtn = root.querySelector("[data-tower-reset-layout]");
    var undoBtn = root.querySelector("[data-tower-undo-widget]");
    if (!root.__cognationWidgetUndo) root.__cognationWidgetUndo = [];

    function setProfileStatusSafe(msg, isError) {
      var el = root.querySelector("[data-tower-profile-status]");
      if (!el) return;
      el.hidden = !msg;
      el.textContent = msg || "";
      el.classList.toggle("is-error", !!isError);
    }

    function syncUndoButton() {
      if (!undoBtn) return;
      var n = (root.__cognationWidgetUndo || []).length;
      undoBtn.disabled = n === 0;
      undoBtn.setAttribute("aria-disabled", n === 0 ? "true" : "false");
      undoBtn.title = n ? ("Restore last removed (" + n + " in undo stack)") : "Nothing to undo";
    }

    function pushWidgetUndo(entry) {
      if (!entry) return;
      if (!root.__cognationWidgetUndo) root.__cognationWidgetUndo = [];
      root.__cognationWidgetUndo.push(entry);
      while (root.__cognationWidgetUndo.length > WIDGET_UNDO_MAX) {
        root.__cognationWidgetUndo.shift();
      }
      syncUndoButton();
    }

    function undoLastWidgetRemoval() {
      var stack = root.__cognationWidgetUndo || [];
      if (!stack.length) {
        setProfileStatusSafe("Nothing to undo.", false);
        syncUndoButton();
        return;
      }
      var entry = stack.pop();
      syncUndoButton();
      if (!entry) return;
      if (entry.type === "widget") {
        setPublicWidgetVisible(root, entry.id, true);
        setProfileStatusSafe("Restored " + (entry.label || entry.id) + ".", false);
        return;
      }
      if (entry.type === "quote") {
        addQuoteSticker(root, entry.layout && entry.layout.text || "Quote", entry.layout, entry.id);
        setProfileStatusSafe("Restored quote.", false);
        return;
      }
      if (entry.type === "shell") {
        if (entry.id === "polaroid") {
          var pPolUndo = TowerProfileStore.get();
          pPolUndo.polaroidRemoved = false;
          TowerProfileStore.save(pPolUndo);
          ensurePersonalPolaroid(root, pPolUndo);
          applyWidgetLayout(root, pPolUndo);
          setProfileStatusSafe("Restored Polaroid.", false);
          return;
        }
        setProfileStatusSafe("Shell restore is limited in this demo — use Reset layout.", false);
        return;
      }
      if (entry.type === "friend") {
        var fp = TowerProfileStore.get();
        var ids = (fp.featuredFriendIds || []).slice();
        if (ids.indexOf(entry.id) < 0) {
          var max = fp.friendsDisplayCount || 3;
          if (ids.length >= max) {
            /* bump count if needed so restore can fit */
            if (max < 8) {
              fp.friendsDisplayCount = ids.length + 1 <= 6 ? 6 : 8;
              max = fp.friendsDisplayCount;
            }
          }
          if (ids.length < max) ids.push(entry.id);
        }
        fp.featuredFriendIds = ids.slice(0, fp.friendsDisplayCount || 8);
        if (entry.layout) {
          if (!fp.friendPinLayout || typeof fp.friendPinLayout !== "object") fp.friendPinLayout = {};
          fp.friendPinLayout[entry.id] = entry.layout;
        }
        ensureFriendPinPositions(fp, fp.featuredFriendIds);
        TowerProfileStore.save(fp);
        renderFriendsPicker(root, fp);
        renderFriendPins(root, fp);
        syncOwnerStickerHandles(root);
        setProfileStatusSafe("Restored friend pin.", false);
        return;
      }
      if (entry.type === "badge") {
        setBadgeVisibility(root, entry.id, true);
        setProfileStatusSafe("Restored badge pin.", false);
        return;
      }
    }

    syncUndoButton();
    if (undoBtn && !undoBtn.__cognationUndoBound) {
      undoBtn.__cognationUndoBound = true;
      undoBtn.addEventListener("click", function () {
        undoLastWidgetRemoval();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        var p = TowerProfileStore.get();
        p.widgetLayout = JSON.parse(JSON.stringify(DEFAULT_WIDGET_LAYOUT));
        if (p.widgetLayout && p.widgetLayout.feed) delete p.widgetLayout.feed;
        if (p.widgetLayout && p.widgetLayout.messages) delete p.widgetLayout.messages;
        p.publicWidgets = JSON.parse(JSON.stringify(DEFAULT_PUBLIC_WIDGETS));
        p.polaroidRemoved = false;
        TowerProfileStore.save(p);
        applyWidgetLayout(root, p);
        applyPublicWidgets(root, p);
        syncPublicWidgetsForm(root, p);
        renderFriendPins(root, p);
        renderBadgePins(root, p);
        syncOwnerStickerHandles(root);
        root.__cognationWidgetUndo = [];
        syncUndoButton();
        setProfileStatusSafe("Layout reset — public widgets restored.", false);
      });
    }

    function pointerPos(ev) {
      if (ev.touches && ev.touches[0]) return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
      return { x: ev.clientX, y: ev.clientY };
    }

    function ownerOnPublic() {
      return isTowerOwner(TowerProfileStore.get()) && root.getAttribute("data-tower-side") === "public";
    }

    function onPointerDown(ev) {
      if (!ownerOnPublic()) return;

      var friendPin = ev.target.closest("[data-tower-friend-pin]");
      if (friendPin && stage.contains(friendPin)) {
        ev.preventDefault();
        stickerZCounter += 1;
        friendPin.style.setProperty("--sticker-z", String(stickerZCounter));
        friendPin.classList.add("is-dragging");
        friendPin.__cognationDidDrag = false;
        var rectPin = stage.getBoundingClientRect();
        var startPin = pointerPos(ev);
        var startPinX = parseFloat(friendPin.getAttribute("data-sticker-x") || "0");
        var startPinY = parseFloat(friendPin.getAttribute("data-sticker-y") || "0");

        function onMovePin(e) {
          var cur = pointerPos(e);
          if (e.cancelable) e.preventDefault();
          var dxPct = ((cur.x - startPin.x) / rectPin.width) * 100;
          var dyPct = ((cur.y - startPin.y) / rectPin.height) * 100;
          if (Math.abs(dxPct) > 0.3 || Math.abs(dyPct) > 0.3) friendPin.__cognationDidDrag = true;
          var nx = Math.max(0, Math.min(88, startPinX + dxPct));
          var ny = Math.max(0, Math.min(88, startPinY + dyPct));
          friendPin.style.setProperty("--sticker-x", nx + "%");
          friendPin.style.setProperty("--sticker-y", ny + "%");
          friendPin.setAttribute("data-sticker-x", String(Math.round(nx * 10) / 10));
          friendPin.setAttribute("data-sticker-y", String(Math.round(ny * 10) / 10));
          friendPin.setAttribute("data-sticker-z", String(stickerZCounter));
        }

        function onUpPin() {
          friendPin.classList.remove("is-dragging");
          document.removeEventListener("pointermove", onMovePin);
          document.removeEventListener("pointerup", onUpPin);
          document.removeEventListener("pointercancel", onUpPin);
          document.removeEventListener("touchmove", onMovePin);
          document.removeEventListener("touchend", onUpPin);
          if (!friendPin.__cognationDidDrag) return;
          var p = TowerProfileStore.get();
          var pinLayout = getFriendPinLayout(p);
          var fid = friendPin.getAttribute("data-tower-friend-pin");
          if (!fid) return;
          var prevPin = pinLayout[fid] || { tilt: 0 };
          pinLayout[fid] = {
            x: parseFloat(friendPin.getAttribute("data-sticker-x") || "0"),
            y: parseFloat(friendPin.getAttribute("data-sticker-y") || "0"),
            z: parseInt(friendPin.getAttribute("data-sticker-z") || "12", 10),
            tilt: typeof prevPin.tilt === "number" ? prevPin.tilt : 0,
          };
          p.friendPinLayout = pinLayout;
          TowerProfileStore.save(p, { geometry: true });
        }

        document.addEventListener("pointermove", onMovePin);
        document.addEventListener("pointerup", onUpPin);
        document.addEventListener("pointercancel", onUpPin);
        document.addEventListener("touchmove", onMovePin, { passive: false });
        document.addEventListener("touchend", onUpPin);
        return;
      }

      var badgePin = ev.target.closest("[data-tower-badge-pin]");
      if (badgePin && stage.contains(badgePin)) {
        ev.preventDefault();
        stickerZCounter += 1;
        badgePin.style.setProperty("--sticker-z", String(stickerZCounter));
        badgePin.classList.add("is-dragging");
        badgePin.__cognationDidDrag = false;
        var rectBadge = stage.getBoundingClientRect();
        var startBadge = pointerPos(ev);
        var startBadgeX = parseFloat(badgePin.getAttribute("data-sticker-x") || "0");
        var startBadgeY = parseFloat(badgePin.getAttribute("data-sticker-y") || "0");

        function onMoveBadge(e) {
          var cur = pointerPos(e);
          if (e.cancelable) e.preventDefault();
          var dxPct = ((cur.x - startBadge.x) / rectBadge.width) * 100;
          var dyPct = ((cur.y - startBadge.y) / rectBadge.height) * 100;
          if (Math.abs(dxPct) > 0.3 || Math.abs(dyPct) > 0.3) badgePin.__cognationDidDrag = true;
          var nx = Math.max(0, Math.min(88, startBadgeX + dxPct));
          var ny = Math.max(0, Math.min(88, startBadgeY + dyPct));
          badgePin.style.setProperty("--sticker-x", nx + "%");
          badgePin.style.setProperty("--sticker-y", ny + "%");
          badgePin.setAttribute("data-sticker-x", String(Math.round(nx * 10) / 10));
          badgePin.setAttribute("data-sticker-y", String(Math.round(ny * 10) / 10));
          badgePin.setAttribute("data-sticker-z", String(stickerZCounter));
        }

        function onUpBadge() {
          badgePin.classList.remove("is-dragging");
          document.removeEventListener("pointermove", onMoveBadge);
          document.removeEventListener("pointerup", onUpBadge);
          document.removeEventListener("pointercancel", onUpBadge);
          document.removeEventListener("touchmove", onMoveBadge);
          document.removeEventListener("touchend", onUpBadge);
          if (!badgePin.__cognationDidDrag) return;
          var bp = TowerProfileStore.get();
          var badgeLayout = getBadgePinLayout(bp);
          var bid = badgePin.getAttribute("data-tower-badge-pin");
          if (!bid) return;
          var prevBadge = badgeLayout[bid] || { tilt: 0 };
          badgeLayout[bid] = {
            x: parseFloat(badgePin.getAttribute("data-sticker-x") || "0"),
            y: parseFloat(badgePin.getAttribute("data-sticker-y") || "0"),
            z: parseInt(badgePin.getAttribute("data-sticker-z") || "14", 10),
            tilt: typeof prevBadge.tilt === "number" ? prevBadge.tilt : 0,
          };
          bp.badgePinLayout = badgeLayout;
          TowerProfileStore.save(bp, { geometry: true });
        }

        document.addEventListener("pointermove", onMoveBadge);
        document.addEventListener("pointerup", onUpBadge);
        document.addEventListener("pointercancel", onUpBadge);
        document.addEventListener("touchmove", onMoveBadge, { passive: false });
        document.addEventListener("touchend", onUpBadge);
        return;
      }

      /* Drag from anywhere on the sticker. Real controls keep their clicks. */
      if (ev.target.closest("a, button, input, textarea, select, label, summary, [contenteditable='true'], [data-tower-rotate], [data-tower-avatar-resize], [data-tower-name-resize]")) {
        return;
      }
      var sticker = ev.target.closest("[data-tower-widget]");
      if (!sticker || !stage.contains(sticker)) return;
      var wid = sticker.getAttribute("data-tower-widget");
      if (wid === "feed" || wid === "messages") return;
      if (sticker.hidden || sticker.classList.contains("is-widget-off")) return;

      var rect = stage.getBoundingClientRect();
      var start = pointerPos(ev);
      var startX = parseFloat(sticker.getAttribute("data-sticker-x") || "0");
      var startY = parseFloat(sticker.getAttribute("data-sticker-y") || "0");
      var dragStarted = false;

      function onMove(e) {
        var cur = pointerPos(e);
        var dxPx = cur.x - start.x;
        var dyPx = cur.y - start.y;
        if (!dragStarted) {
          if (Math.abs(dxPx) < 5 && Math.abs(dyPx) < 5) return;
          dragStarted = true;
          stickerZCounter += 1;
          sticker.style.setProperty("--sticker-z", String(stickerZCounter));
          sticker.classList.add("is-dragging");
          if (e.pointerId != null && sticker.setPointerCapture) {
            try { sticker.setPointerCapture(e.pointerId); } catch (errCap) {}
          }
        }
        if (e.cancelable) e.preventDefault();
        var dxPct = (dxPx / rect.width) * 100;
        var dyPct = (dyPx / rect.height) * 100;
        var nx = Math.max(0, Math.min(88, startX + dxPct));
        var ny = Math.max(0, Math.min(88, startY + dyPct));
        sticker.style.setProperty("--sticker-x", nx + "%");
        sticker.style.setProperty("--sticker-y", ny + "%");
        sticker.setAttribute("data-sticker-x", String(Math.round(nx * 10) / 10));
        sticker.setAttribute("data-sticker-y", String(Math.round(ny * 10) / 10));
        sticker.setAttribute("data-sticker-z", String(stickerZCounter));
      }

      var dropCommitted = false;
      function onUp() {
        if (dropCommitted) return;
        dropCommitted = true;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onUp);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onUp, true);
        if (!dragStarted) {
          sticker.classList.remove("is-dragging");
          return;
        }
        sticker.__cognationDraggedAt = Date.now();
        /* Read the drop before get()/save(). A profile refresh inside save
           repaints from the original layout and would otherwise record spawn. */
        var dropX = parseFloat(sticker.getAttribute("data-sticker-x") || "0");
        var dropY = parseFloat(sticker.getAttribute("data-sticker-y") || "0");
        var dropZ = parseInt(sticker.getAttribute("data-sticker-z") || "1", 10);
        var dropTilt = parseFloat(String(sticker.style.getPropertyValue("--sticker-tilt") || "0").replace("deg", "")) || 0;
        var p = TowerProfileStore.get();
        var layout = getWidgetLayout(p) || JSON.parse(JSON.stringify(DEFAULT_WIDGET_LAYOUT));
        var id = sticker.getAttribute("data-tower-widget");
        if (!id) {
          sticker.classList.remove("is-dragging");
          return;
        }
        if (id === "quote") {
          var qid = sticker.getAttribute("data-tower-quote-id");
          var quotes = getQuoteStickers(p);
          p.quoteStickers = quotes.map(function (q) {
            if (q.id !== qid) return q;
            return {
              id: q.id,
              text: q.text,
              x: dropX,
              y: dropY,
              z: dropZ,
              tilt: dropTilt,
            };
          });
          TowerProfileStore.save(p, { geometry: true });
        } else {
          var prev = layout[id] || DEFAULT_WIDGET_LAYOUT[id] || { tilt: dropTilt };
          layout[id] = {
            x: dropX,
            y: dropY,
            z: dropZ,
            tilt: typeof prev.tilt === "number" ? prev.tilt : dropTilt,
          };
          p.widgetLayout = layout;
          TowerProfileStore.save(p, { geometry: true });
        }
        sticker.style.setProperty("--sticker-x", dropX + "%");
        sticker.style.setProperty("--sticker-y", dropY + "%");
        sticker.style.setProperty("--sticker-z", String(dropZ));
        sticker.setAttribute("data-sticker-x", String(dropX));
        sticker.setAttribute("data-sticker-y", String(dropY));
        sticker.setAttribute("data-sticker-z", String(dropZ));
        sticker.classList.remove("is-dragging");
      }

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onUp, true);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onUp);
    }

    stage.addEventListener("pointerdown", onPointerDown);

    /* Click to select a public widget (owner only) */
    stage.addEventListener("click", function (ev) {
      if (!ownerOnPublic()) return;
      if (ev.target.closest("[data-tower-profile-edit]")) return;
      var handleClick = ev.target.closest("[data-tower-sticker-handle]");
      if (handleClick) {
        var handleSticker = handleClick.closest("[data-tower-widget]");
        if (handleSticker && stage.contains(handleSticker) && !handleSticker.hidden) {
          clearWidgetSelection(stage);
          handleSticker.classList.add("is-widget-selected");
          syncRotateToolbar(root);
        }
        return;
      }
      if (ev.target.closest(".tower-avatar-upload, [data-tower-avatar-file], [data-tower-avatar-file-panel]")) return;
      /* Pins are <a> — select before the generic interactive early-return */
      var friendSel = ev.target.closest("[data-tower-friend-pin]");
      if (friendSel && stage.contains(friendSel)) {
        ev.preventDefault();
        clearWidgetSelection(stage);
        friendSel.classList.add("is-widget-selected");
        syncRotateToolbar(root);
        return;
      }
      var badgeSel = ev.target.closest("[data-tower-badge-pin]");
      if (badgeSel && stage.contains(badgeSel)) {
        ev.preventDefault();
        clearWidgetSelection(stage);
        badgeSel.classList.add("is-widget-selected");
        syncRotateToolbar(root);
        return;
      }
      if (ev.target.closest("a, button, input, textarea, select, label")) {
        /* Still allow selecting if click is on non-interactive sticker chrome */
        var maybe = ev.target.closest("[data-tower-widget]");
        if (!maybe || ev.target.closest("a, button, input, textarea, select, label")) {
          /* Don't steal clicks from controls; clear selection only on bare stage */
          if (ev.target === stage || ev.target.hasAttribute("data-tower-collage-stage")) {
            clearWidgetSelection(stage);
            syncRotateToolbar(root);
          }
          return;
        }
      }
      var sticker = ev.target.closest("[data-tower-widget]");
      if (sticker && stage.contains(sticker) && !sticker.hidden && !sticker.classList.contains("is-widget-off")) {
        var wid = sticker.getAttribute("data-tower-widget");
        if (wid === "feed" || wid === "messages") return;
        sticker.__cognationWasSelected = sticker.classList.contains("is-widget-selected");
        clearWidgetSelection(stage);
        sticker.classList.add("is-widget-selected");
        syncRotateToolbar(root);
        return;
      }
      if (ev.target === stage || ev.target.closest("[data-tower-collage-stage]")) {
        clearWidgetSelection(stage);
        syncRotateToolbar(root);
      }
    });

    /* Keyboard: [ ] rotate selected; Backspace / Delete removes */
    if (!root.__cognationWidgetKeyBound) {
      root.__cognationWidgetKeyBound = true;
      document.addEventListener("keydown", function (ev) {
        var t0 = ev.target;
        if (t0) {
          var tag0 = (t0.tagName || "").toUpperCase();
          if (tag0 === "INPUT" || tag0 === "TEXTAREA" || tag0 === "SELECT") return;
          if (t0.isContentEditable) return;
        }
        if (!ownerOnPublic()) return;
        if (ev.key === "[" || ev.key === "]") {
          var selRot = stage.querySelector(".is-widget-selected");
          if (!selRot || !stage.contains(selRot)) return;
          ev.preventDefault();
          rotateSelectedWidget(root, ev.key === "]" ? 15 : -15);
          return;
        }
        if (ev.key !== "Backspace" && ev.key !== "Delete") return;
        var selected = stage.querySelector(".is-widget-selected");
        if (!selected || !stage.contains(selected)) return;
        ev.preventDefault();

        /* Individual friend pin */
        var friendId = selected.getAttribute("data-tower-friend-pin");
        if (friendId) {
          clearWidgetSelection(stage);
          var fp = TowerProfileStore.get();
          var savedFriendLayout =
            fp.friendPinLayout && fp.friendPinLayout[friendId]
              ? JSON.parse(JSON.stringify(fp.friendPinLayout[friendId]))
              : null;
          pushWidgetUndo({ type: "friend", id: friendId, layout: savedFriendLayout });
          fp.featuredFriendIds = (fp.featuredFriendIds || []).filter(function (id) {
            return id !== friendId;
          });
          if (fp.friendPinLayout && fp.friendPinLayout[friendId]) {
            delete fp.friendPinLayout[friendId];
          }
          TowerProfileStore.save(fp);
          renderFriendsPicker(root, fp);
          renderFriendPins(root, fp);
          setProfileStatusSafe("Friend pin removed — Undo to restore.", false);
          return;
        }

        /* Individual badge pin */
        var badgeId = selected.getAttribute("data-tower-badge-pin");
        if (badgeId) {
          clearWidgetSelection(stage);
          pushWidgetUndo({ type: "badge", id: badgeId });
          setBadgeVisibility(root, badgeId, false);
          setProfileStatusSafe("Badge pin removed — Undo to restore.", false);
          return;
        }

        /* Quote / freeform stickers */
        var quoteId = selected.getAttribute("data-tower-quote-id");
        if (quoteId || selected.getAttribute("data-tower-widget") === "quote") {
          clearWidgetSelection(stage);
          var qText = (selected.textContent || "").trim();
          var qLayout = {
            x: parseFloat(selected.getAttribute("data-sticker-x") || "40"),
            y: parseFloat(selected.getAttribute("data-sticker-y") || "40"),
            z: parseInt(selected.getAttribute("data-sticker-z") || "8", 10),
            tilt: parseFloat(selected.style.getPropertyValue("--sticker-tilt") || "0") || 0,
            text: selected.getAttribute("data-quote-text") || qText,
          };
          pushWidgetUndo({ type: "quote", id: quoteId || selected.id, layout: qLayout });
          removeQuoteSticker(root, quoteId || selected.getAttribute("data-tower-quote-id"));
          setProfileStatusSafe("Quote removed — Undo to restore.", false);
          return;
        }

        /* Scrapbook sticker widgets — every selectable widget (not only identity) */
        var id = selected.getAttribute("data-tower-widget");
        if (!id || id === "avatar" || id === "feed" || id === "messages") return;
        clearWidgetSelection(stage);
        syncRotateToolbar(root);
        var label = selected.getAttribute("data-sticker-label") || id;
        if (id === "polaroid") {
          pushWidgetUndo({ type: "shell", id: id, label: label });
          selected.hidden = true;
          selected.classList.add("is-widget-off");
          var pPol = TowerProfileStore.get();
          pPol.polaroidRemoved = true;
          TowerProfileStore.save(pPol);
          setProfileStatusSafe(label + " removed — Reset layout to restore.", false);
          return;
        }
        if (PUBLIC_WIDGET_IDS.indexOf(id) >= 0) {
          pushWidgetUndo({ type: "widget", id: id, label: label });
          setPublicWidgetVisible(root, id, false);
        } else {
          /* Unknown/empty shell: hide + drop from layout so it cannot return */
          pushWidgetUndo({ type: "shell", id: id, label: label, html: selected.outerHTML });
          selected.hidden = true;
          selected.classList.add("is-widget-off");
          var pShell = TowerProfileStore.get();
          if (pShell.widgetLayout && pShell.widgetLayout[id]) {
            delete pShell.widgetLayout[id];
            TowerProfileStore.save(pShell);
          }
        }
        setProfileStatusSafe(label + " removed — Undo to restore.", false);
      });
    }

    /* Live Public widgets checkboxes */
    if (!root.__cognationPublicWidgetsBound) {
      root.__cognationPublicWidgetsBound = true;
      root.addEventListener("change", function (ev) {
        var cb = ev.target && ev.target.closest("[data-tower-public-widget]");
        if (!cb || !root.contains(cb)) return;
        var id = cb.getAttribute("data-tower-public-widget");
        if (!id) return;
        setPublicWidgetVisible(root, id, !!cb.checked);
      });
    }

    syncOwnerStickerHandles(root);
  }


  function initProfileEditDropdown(root) {
    var wrap = root.querySelector("[data-tower-profile-edit]");
    var btn = root.querySelector("[data-tower-edit-profile]");
    var panel = root.querySelector("[data-tower-profile-edit-panel]");
    if (!wrap || !btn || !panel || wrap.__cognationEditBound) return;
    wrap.__cognationEditBound = true;

    /* Native file dialogs can fire outside pointerdown/blur; closing the panel
       (display:none) cancels the picker before change. Track picking and hold open. */
    var pickingAvatarFile = false;
    var pickClearTimer = null;

    function setAvatarPicking(on) {
      pickingAvatarFile = !!on;
      root.__cognationAvatarPicking = pickingAvatarFile;
      if (pickClearTimer) {
        clearTimeout(pickClearTimer);
        pickClearTimer = null;
      }
    }

    function clearAvatarPickingSoon() {
      if (pickClearTimer) clearTimeout(pickClearTimer);
      pickClearTimer = setTimeout(function () {
        pickingAvatarFile = false;
        root.__cognationAvatarPicking = false;
        pickClearTimer = null;
      }, 400);
    }

    function bindAvatarPickGuard(input) {
      if (!input || input.__cognationPickGuardBound) return;
      input.__cognationPickGuardBound = true;
      input.addEventListener("click", function () {
        setAvatarPicking(true);
      });
      input.addEventListener("change", function () {
        setAvatarPicking(false);
      });
      input.addEventListener("cancel", function () {
        setAvatarPicking(false);
      });
    }

    root.querySelectorAll("[data-tower-avatar-file-panel], [data-tower-avatar-file]").forEach(bindAvatarPickGuard);

    var chooseBtn = root.querySelector("[data-tower-choose-avatar]");
    var panelFile = root.querySelector("[data-tower-avatar-file-panel]");
    if (chooseBtn && panelFile && !chooseBtn.__cognationChooseBound) {
      chooseBtn.__cognationChooseBound = true;
      chooseBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        setAvatarPicking(true);
        try {
          panelFile.click();
        } catch (errClick) {
          setAvatarPicking(false);
        }
      });
    }

    if (!root.__cognationAvatarPickFocusBound) {
      root.__cognationAvatarPickFocusBound = true;
      window.addEventListener("focus", function () {
        if (pickingAvatarFile || root.__cognationAvatarPicking) clearAvatarPickingSoon();
      });
    }

    function setOpen(open) {
      if (!open && pickingAvatarFile) return;
      if (open) {
        panel.hidden = false;
        wrap.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
        var avatarSticker = wrap.closest('[data-tower-widget="avatar"]');
        if (avatarSticker) avatarSticker.classList.add("is-edit-open");
      } else {
        panel.hidden = true;
        wrap.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
        var avatarStickerClose = wrap.closest('[data-tower-widget="avatar"]');
        if (avatarStickerClose) avatarStickerClose.classList.remove("is-edit-open");
      }
    }

    function isOpen() {
      return !panel.hidden;
    }

    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      setOpen(!isOpen());
    });

    /* Keep pointer events inside the editor from starting sticker drags or closing the menu */
    panel.addEventListener("pointerdown", function (ev) {
      ev.stopPropagation();
    });
    panel.addEventListener("click", function (ev) {
      ev.stopPropagation();
    });

    document.addEventListener("pointerdown", function (ev) {
      if (!isOpen()) return;
      if (pickingAvatarFile || root.__cognationAvatarPicking) return;
      if (wrap.contains(ev.target)) return;
      /* Avatar overlay upload sits outside the edit wrap but should not dismiss while picking */
      if (ev.target.closest && ev.target.closest(".tower-avatar-upload, [data-tower-avatar-file]")) {
        setAvatarPicking(true);
        return;
      }
      setOpen(false);
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && isOpen() && !pickingAvatarFile) {
        setOpen(false);
        btn.focus();
      }
    });
  }

  function initFramePicker(root) {
    var chips = root.querySelector("[data-tower-frame-chips]");
    var saveBtn = root.querySelector("[data-tower-save-frame]");
    var colorChips = root.querySelector("[data-tower-cowboy-color-chips]");
    if (!chips || chips.__cognationFramesBound) return;
    chips.__cognationFramesBound = true;
    chips.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-frame-id]");
      if (!btn || !chips.contains(btn)) return;
      var id = normalizeFrameId(btn.getAttribute("data-frame-id"));
      var colorIn = root.querySelector("[data-tower-cowboy-color-input]");
      var color = colorIn ? colorIn.value : "tan";
      /* preview only — persist when Save frame is clicked */
      applyAvatarFrame(root, id, color);
      var input = root.querySelector("[data-tower-avatar-frame-input]");
      if (input) input.value = id;
      var status = root.querySelector("[data-tower-profile-status]");
      if (status) {
        status.hidden = false;
        status.textContent = "Frame preview — click Save frame to keep it.";
        status.classList.remove("is-error");
      }
    });
    if (colorChips && !colorChips.__cognationCowboyColorBound) {
      colorChips.__cognationCowboyColorBound = true;
      colorChips.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-cowboy-color]");
        if (!btn || !colorChips.contains(btn)) return;
        var color = normalizeCowboyHatColor(btn.getAttribute("data-cowboy-color"));
        applyCowboyHatColor(root, color);
        var frameIn = root.querySelector("[data-tower-avatar-frame-input]");
        var frameId = normalizeFrameId(frameIn ? frameIn.value : "none");
        if (frameId !== "cowboy-hat") {
          applyAvatarFrame(root, "cowboy-hat", color);
        }
        var status = root.querySelector("[data-tower-profile-status]");
        if (status) {
          status.hidden = false;
          status.textContent = "Hat color preview — click Save frame to keep it.";
          status.classList.remove("is-error");
        }
      });
    }
    if (saveBtn && !saveBtn.__cognationFrameSaveBound) {
      saveBtn.__cognationFrameSaveBound = true;
      saveBtn.addEventListener("click", function () {
        var input = root.querySelector("[data-tower-avatar-frame-input]");
        var id = normalizeFrameId(input ? input.value : "none");
        var colorIn = root.querySelector("[data-tower-cowboy-color-input]");
        var color = normalizeCowboyHatColor(colorIn ? colorIn.value : "tan");
        applyAvatarFrame(root, id, color);
        var p = TowerProfileStore.get();
        p.avatarFrame = id;
        p.cowboyHatColor = color;
        TowerProfileStore.save(p);
        var status = root.querySelector("[data-tower-profile-status]");
        if (status) {
          status.hidden = false;
          status.textContent = id === "cowboy-hat" ? "Cowboy hat + color saved." : "Frame saved.";
          status.classList.remove("is-error");
        }
      });
    }
  }

  function initOrnamentPicker(root) {
    var chips = root.querySelector("[data-tower-ornament-chips]");
    var posChips = root.querySelector("[data-tower-ornament-pos-chips]");
    if (chips && !chips.__cognationOrnamentsBound) {
      chips.__cognationOrnamentsBound = true;
      chips.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-ornament-id]");
        if (!btn || !chips.contains(btn)) return;
        var id = normalizeOrnamentId(btn.getAttribute("data-ornament-id"));
        var p = TowerProfileStore.get();
        var pos = normalizeOrnamentPos(p.avatarOrnamentPos || "above");
        applyAvatarOrnament(root, id, pos);
        p.avatarOrnament = id;
        p.avatarOrnamentPos = pos;
        TowerProfileStore.save(p);
      });
    }
    if (posChips && !posChips.__cognationOrnamentPosBound) {
      posChips.__cognationOrnamentPosBound = true;
      posChips.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-ornament-pos]");
        if (!btn || !posChips.contains(btn) || btn.disabled) return;
        var pos = normalizeOrnamentPos(btn.getAttribute("data-ornament-pos"));
        var p = TowerProfileStore.get();
        var id = normalizeOrnamentId(p.avatarOrnament || "none");
        if (id === "none") return;
        applyAvatarOrnament(root, id, pos);
        p.avatarOrnament = id;
        p.avatarOrnamentPos = pos;
        TowerProfileStore.save(p);
      });
    }
  }

  function syncPublicLookForm(root, p) {
    if (!root || !p) return;
    var mode = normalizeBackgroundMode(p.backgroundMode, p.backgroundCollage, p.backgroundHtml);
    var modeSel = root.querySelector("select[data-tower-bg-mode]");
    if (modeSel && document.activeElement !== modeSel) modeSel.value = mode;
    var textIn = root.querySelector("[data-tower-public-text]");
    if (textIn && document.activeElement !== textIn) {
      textIn.value = normalizePublicThemeColor(p.publicTextColor, "#4a2c3a");
    }
    var btnIn = root.querySelector("[data-tower-public-btn]");
    if (btnIn && document.activeElement !== btnIn) {
      btnIn.value = normalizePublicThemeColor(p.publicButtonColor, "#f4a4c4");
    }
    var htmlIn = root.querySelector("[data-tower-bg-html]");
    if (htmlIn && document.activeElement !== htmlIn) {
      htmlIn.value = typeof p.backgroundHtml === "string" ? p.backgroundHtml : "";
    }
    populateBgModeOptions(root, mode, { reveal: false });
  }

  /** Show only the selected mode's controls inside data-tower-bg-options. */
  function populateBgModeOptions(root, mode, opts) {
    opts = opts || {};
    var options = root.querySelector("[data-tower-bg-options]");
    if (!options) return;
    mode = normalizeBackgroundMode(mode, null, null);
    if (opts.reveal) {
      options.hidden = false;
    }
    options.querySelectorAll("[data-tower-bg-mode-panel]").forEach(function (panel) {
      var id = panel.getAttribute("data-tower-bg-mode-panel");
      panel.hidden = id !== mode;
    });
    var editBtn = root.querySelector("[data-tower-public-look-edit-bg]");
    if (editBtn) {
      editBtn.hidden = !options.hidden;
    }
  }

  function hideBgOptionsAfterSave(root) {
    var options = root.querySelector("[data-tower-bg-options]");
    if (options) options.hidden = true;
    var panel = root.querySelector("[data-tower-public-look]");
    if (panel) panel.open = false;
    var editBtn = root.querySelector("[data-tower-public-look-edit-bg]");
    if (editBtn) editBtn.hidden = false;
  }

  function showBgOptions(root) {
    var options = root.querySelector("[data-tower-bg-options]");
    if (options) options.hidden = false;
    var modeSel = root.querySelector("select[data-tower-bg-mode]");
    var mode = modeSel ? modeSel.value : "solid";
    populateBgModeOptions(root, mode, { reveal: true });
    var panel = root.querySelector("[data-tower-public-look]");
    if (panel) panel.open = true;
    var editBtn = root.querySelector("[data-tower-public-look-edit-bg]");
    if (editBtn) editBtn.hidden = true;
  }

  function readPublicLookFromForm(root) {
    var fontIn = root.querySelector("[data-tower-font]");
    var feedBgIn = root.querySelector("[data-tower-feed-bg]");
    var textIn = root.querySelector("[data-tower-public-text]");
    var btnIn = root.querySelector("[data-tower-public-btn]");
    var modeSel = root.querySelector("select[data-tower-bg-mode]");
    var htmlIn = root.querySelector("[data-tower-bg-html]");
    var mode = normalizeBackgroundMode(modeSel ? modeSel.value : "solid", null, null);
    var out = {
      towerFont: normalizeTowerFont(fontIn ? fontIn.value : "georgia"),
      feedBackgroundColor: normalizeFeedBgColor(
        feedBgIn ? feedBgIn.value : "#fff5f9"
      ),
      publicTextColor: normalizePublicThemeColor(
        textIn ? textIn.value : "#4a2c3a",
        "#4a2c3a"
      ),
      publicButtonColor: normalizePublicThemeColor(
        btnIn ? btnIn.value : "#f4a4c4",
        "#f4a4c4"
      ),
      backgroundMode: mode,
    };
    if (mode === "collage") {
      out.backgroundCollage = readCollageFromForm(root);
    }
    if (mode === "html") {
      out.backgroundHtml = sanitizeProfileHtml(
        htmlIn ? String(htmlIn.value || "").slice(0, 8000) : ""
      );
    }
    return out;
  }

  function initPublicLookControls(root) {
    if (!root || root.__cognationPublicLookBound) return;
    root.__cognationPublicLookBound = true;
    var modeSel = root.querySelector("select[data-tower-bg-mode]");
    var saveBtn = root.querySelector("[data-tower-public-look-save]");
    var status = root.querySelector("[data-tower-public-look-status]");
    var editBgBtn = root.querySelector("[data-tower-public-look-edit-bg]");
    var htmlFile = root.querySelector("[data-tower-bg-html-file]");
    var bgImageFile = root.querySelector("[data-tower-bg-image]");

    function setStatus(msg, isError) {
      if (!status) return;
      status.hidden = !msg;
      status.textContent = msg || "";
      status.classList.toggle("is-error", !!isError);
    }

    function livePreview() {
      var cur = TowerProfileStore.get();
      var look = readPublicLookFromForm(root);
      var preview = Object.assign({}, cur, look);
      /* Keep stored collage/html when previewing other modes so form fields stay. */
      if (look.backgroundMode !== "collage") {
        preview.backgroundCollage = cur.backgroundCollage;
      }
      if (look.backgroundMode !== "html") {
        preview.backgroundHtml = cur.backgroundHtml;
      } else if (look.backgroundHtml != null) {
        preview.backgroundHtml = look.backgroundHtml;
      }
      applyTowerTheme(root, preview);
    }

    if (modeSel) {
      modeSel.addEventListener("change", function () {
        populateBgModeOptions(root, modeSel.value, { reveal: true });
        if (modeSel.value === "collage") {
          syncCollageForm(root, TowerProfileStore.get());
        }
        livePreview();
      });
    }

    ["data-tower-font", "data-tower-feed-bg", "data-tower-public-text", "data-tower-public-btn", "data-tower-bg-html"].forEach(function (sel) {
      var el = root.querySelector("[" + sel + "]");
      if (!el) return;
      el.addEventListener("input", livePreview);
      el.addEventListener("change", livePreview);
    });

    function loadBackgroundImageFile(file) {
      if (!file) return;
      if (!/^image\//.test(file.type)) {
        setStatus("Choose an image file.", true);
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var maxEdge = 1400;
          var scale = Math.min(1, maxEdge / Math.max(img.width || 1, img.height || 1));
          var cw = Math.max(1, Math.round((img.width || 1) * scale));
          var ch = Math.max(1, Math.round((img.height || 1) * scale));
          var canvas = document.createElement("canvas");
          canvas.width = cw;
          canvas.height = ch;
          var ctx = canvas.getContext("2d");
          if (!ctx) {
            setStatus("Could not read that image.", true);
            return;
          }
          ctx.drawImage(img, 0, 0, cw, ch);
          var dataUrl = "";
          try {
            dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          } catch (eUrl) {
            dataUrl = String(reader.result || "");
          }
          if (dataUrl.indexOf("data:image/") !== 0) {
            setStatus("Could not read that image.", true);
            return;
          }
          var pImg = TowerProfileStore.get();
          pImg.backgroundImageDataUrl = dataUrl;
          if (!TowerProfileStore.save(pImg)) {
            setStatus("Could not save that background (storage full). Try a smaller image.", true);
            return;
          }
          applyTowerTheme(root, pImg);
          var hint = root.querySelector("[data-tower-bg-image-status]");
          if (hint) hint.textContent = "Background image set.";
          setStatus("Page background updated.", false);
        };
        img.onerror = function () {
          setStatus("Could not read that image.", true);
        };
        img.src = String(reader.result || "");
      };
      reader.onerror = function () {
        setStatus("Could not read that image.", true);
      };
      reader.readAsDataURL(file);
    }

    if (bgImageFile && !bgImageFile.__cognationBgImageBound) {
      bgImageFile.__cognationBgImageBound = true;
      bgImageFile.addEventListener("change", function () {
        var file = bgImageFile.files && bgImageFile.files[0];
        loadBackgroundImageFile(file);
        try { bgImageFile.value = ""; } catch (eClrBg) {}
      });
    }

    if (htmlFile && !htmlFile.__cognationBgHtmlFileBound) {
      htmlFile.__cognationBgHtmlFileBound = true;
      htmlFile.addEventListener("change", function () {
        var file = htmlFile.files && htmlFile.files[0];
        if (!file) return;
        var name = String(file.name || "").toLowerCase();
        var okType =
          /text\/(html|plain)/.test(file.type) ||
          /\.(html?|txt)$/.test(name);
        if (!okType) {
          setStatus("Choose a .html or .txt file.", true);
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var htmlIn = root.querySelector("[data-tower-bg-html]");
          if (htmlIn) {
            htmlIn.value = String(reader.result || "").slice(0, 8000);
            livePreview();
          }
          setStatus("Background HTML loaded from file.", false);
        };
        reader.onerror = function () {
          setStatus("Could not read that file.", true);
        };
        reader.readAsText(file);
        try { htmlFile.value = ""; } catch (eClr) {}
      });
    }

    if (editBgBtn) {
      editBgBtn.addEventListener("click", function () {
        showBgOptions(root);
      });
    }

    var previewBtn = root.querySelector("[data-tower-public-look-preview]");
    if (previewBtn) {
      previewBtn.addEventListener("click", function () {
        livePreview();
        setStatus("Previewing — Save public look to keep.", false);
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        var p = TowerProfileStore.get();
        var look = readPublicLookFromForm(root);
        if (root.querySelector("[data-tower-font]")) p.towerFont = look.towerFont;
        if (root.querySelector("[data-tower-feed-bg]")) p.feedBackgroundColor = look.feedBackgroundColor;
        p.publicTextColor = look.publicTextColor;
        p.publicButtonColor = look.publicButtonColor;
        if (root.querySelector("select[data-tower-bg-mode]")) {
          p.backgroundMode = look.backgroundMode;
          if (look.backgroundMode === "collage") {
            p.backgroundCollage = look.backgroundCollage || readCollageFromForm(root);
          }
          if (look.backgroundMode === "html") {
            p.backgroundHtml = look.backgroundHtml || "";
          }
        }
        if (!TowerProfileStore.save(p)) {
          setStatus("Could not save public look (storage full or blocked).", true);
          return;
        }
        applyTowerTheme(root, p);
        syncCollageForm(root, p);
        hideBgOptionsAfterSave(root);
        setStatus("Public profile look saved.", false);
      });
    }

    /* Initial: show mode panels; options visible until first save this session */
    var cur = TowerProfileStore.get();
    populateBgModeOptions(root, cur.backgroundMode, { reveal: true });
    var editBtnInit = root.querySelector("[data-tower-public-look-edit-bg]");
    if (editBtnInit) editBtnInit.hidden = true;
  }

  function initCollageControls(root) {
    var layoutSel = root.querySelector("[data-tower-collage-layout]");
    var applyBtn = root.querySelector("[data-tower-collage-apply]");
    var demoBtn = root.querySelector("[data-tower-collage-demo]");
    if (layoutSel && !layoutSel.__bound) {
      layoutSel.__bound = true;
      layoutSel.addEventListener("change", function () {
        var p = TowerProfileStore.get();
        syncCollageForm(root, {
          backgroundCollage: {
            layoutId: layoutSel.value,
            cells: (p.backgroundCollage && p.backgroundCollage.cells) || [],
          },
        });
      });
    }
    if (demoBtn && !demoBtn.__bound) {
      demoBtn.__bound = true;
      demoBtn.addEventListener("click", function () {
        var layoutSel2 = root.querySelector("[data-tower-collage-layout]");
        var layoutId = layoutSel2 ? layoutSel2.value : "grid-3x3";
        if (layoutId === "none") layoutId = "grid-3x3";
        if (layoutSel2) layoutSel2.value = layoutId;
        var p = TowerProfileStore.get();
        p.backgroundMode = "collage";
        p.backgroundCollage = {
          layoutId: layoutId,
          cells: demoCollageCells(collageCellCount(layoutId)),
        };
        TowerProfileStore.save(p);
        var modeSel3 = root.querySelector("select[data-tower-bg-mode]");
        if (modeSel3) modeSel3.value = "collage";
        syncCollageForm(root, p);
        applyTowerTheme(root, p);
      });
    }
    if (applyBtn && !applyBtn.__bound) {
      applyBtn.__bound = true;
      applyBtn.addEventListener("click", function () {
        var p = TowerProfileStore.get();
        p.backgroundMode = "collage";
        p.backgroundCollage = readCollageFromForm(root);
        TowerProfileStore.save(p);
        var modeSel = root.querySelector("select[data-tower-bg-mode]");
        if (modeSel) modeSel.value = "collage";
        applyTowerTheme(root, p);
        var lookStatus = root.querySelector("[data-tower-public-look-status]");
        if (lookStatus) {
          lookStatus.hidden = false;
          lookStatus.textContent = "Collage background applied (Save public look to keep + collapse).";
          lookStatus.classList.remove("is-error");
        }
      });
    }
  }


  function renderProfileChrome(root) {
    var p = TowerProfileStore.get();
    var nameEl = root.querySelector("[data-tower-profile-name]");
    var avatar = root.querySelector("[data-tower-avatar]");
    var nameInput = root.querySelector("#tower-display-name");
    var htmlInput = root.querySelector("[data-tower-profile-html]");
    var preview = root.querySelector("[data-tower-html-preview]");
    if (nameEl && document.activeElement !== nameEl) nameEl.textContent = p.displayName || "You";
    applyDisplayNameSize(root, p.displayNameSize || 28);
    initDisplayNameResize(root);
    var handleBadge = root.querySelector("[data-tower-handle-badge]");
    var handleVal = normalizeHandle(p.handle || "");
    if (handleBadge && document.activeElement !== handleBadge) {
      var ownerEditing = isTowerOwner(p) && root.getAttribute("data-tower-side") === "public";
      handleBadge.classList.toggle("is-owner-editable", ownerEditing);
      if (handleVal) {
        handleBadge.hidden = false;
        handleBadge.textContent = "@" + handleVal;
      } else if (ownerEditing) {
        handleBadge.hidden = false;
        handleBadge.textContent = "@";
      } else {
        handleBadge.hidden = true;
        handleBadge.textContent = "";
        handleBadge.classList.remove("is-owner-editable");
      }
    }
    var handleInput = root.querySelector("[data-tower-handle]");
    if (handleInput && document.activeElement !== handleInput) {
      handleInput.value = handleVal;
    }
    var profileRoot = root.querySelector("[data-tower-profile]");
    if (profileRoot) {
      var slug = profilePublicSlug(p);
      profileRoot.id = "tower-profile-" + slug;
      profileRoot.setAttribute("data-tower-handle", handleVal || "");
      profileRoot.setAttribute("data-author-slug", slug);
    }
    if (nameInput && document.activeElement !== nameInput) nameInput.value = p.displayName || "";
    if (htmlInput && document.activeElement !== htmlInput) htmlInput.value = p.customHtml || "";
    var sloganInput = root.querySelector("[data-tower-slogan]");
    if (sloganInput && document.activeElement !== sloganInput) sloganInput.value = p.slogan || "";
    var sloganDisplay = root.querySelector("[data-tower-slogan-display]");
    if (sloganDisplay) sloganDisplay.textContent = (p.slogan || "").trim();

    if (avatar) {
      if (p.avatarDataUrl) {
        avatar.style.setProperty("background-image", 'url("' + p.avatarDataUrl.replace(/"/g, "") + '")', "important");
        avatar.style.backgroundSize = "cover";
        avatar.style.backgroundPosition = "center";
        avatar.textContent = "";
      } else {
        avatar.style.removeProperty("background-image");
        avatar.textContent = initials(p.displayName);
      }
    }
    root.querySelectorAll("[data-tower-polaroid-photo]").forEach(function (photo) {
      if (document.activeElement === photo) return;
      if (p.polaroidDataUrl) {
        photo.style.backgroundImage = 'url("' + String(p.polaroidDataUrl).replace(/"/g, "") + '")';
        photo.textContent = "";
      } else {
        photo.style.backgroundImage = "";
        photo.textContent = "";
      }
    });
    var bgHint = root.querySelector("[data-tower-bg-image-status]");
    if (bgHint && !(p.backgroundImageDataUrl && document.activeElement && document.activeElement.matches && document.activeElement.matches("[data-tower-bg-image]"))) {
      bgHint.textContent = p.backgroundImageDataUrl
        ? "Background image set."
        : "Upload an image to use as the page background.";
    }
    applyAvatarFrame(root, p.avatarFrame || "none", p.cowboyHatColor || "tan");
    applyAvatarOrnament(root, p.avatarOrnament || "none", p.avatarOrnamentPos || "above");
    if (preview) {
      preview.innerHTML = sanitizeProfileHtml(p.customHtml || "");
    }
    var publicHtml = root.querySelector("[data-tower-html-public]");
    if (publicHtml) {
      publicHtml.innerHTML = sanitizeProfileHtml(p.customHtml || "");
    }
    applyWidgetLayout(root, p);
    applyPublicWidgets(root, p);
    syncPublicWidgetsForm(root, p);
    syncOwnerStickerHandles(root);
    renderQuoteStickers(root, p);
    initAddWidgetUi(root);
    syncCollageForm(root, p);
    syncPublicLookForm(root, p);
    var countSel = root.querySelector("[data-tower-friends-count]");
    if (countSel) countSel.value = String(p.friendsDisplayCount || 3);
    renderFriendsPicker(root, p);
    applyPublicWidgets(root, p);
    syncOwnerStickerHandles(root);
    renderSocialLinks(root, p);

    var titleIn = root.querySelector("[data-tower-music-title]");
    var artistIn = root.querySelector("[data-tower-music-artist]");
    var urlIn = root.querySelector("[data-tower-music-url]");
    var enIn = root.querySelector("[data-tower-music-enable]");
    var skinIn = root.querySelector("[data-tower-music-skin]");
    if (titleIn && document.activeElement !== titleIn) titleIn.value = p.musicTitle || "";
    if (artistIn && document.activeElement !== artistIn) artistIn.value = p.musicArtist || "";
    if (urlIn && document.activeElement !== urlIn) urlIn.value = p.musicUrl || "";
    if (enIn) enIn.checked = p.musicEnabled !== false;
    if (skinIn) skinIn.value = visibleMusicSkin(p.musicSkin || "classic");
    initTowerMusic(root, p);

    var videoUrlIn = root.querySelector("[data-tower-video-url]");
    var videoTitleIn = root.querySelector("[data-tower-video-title]");
    var videoEnIn = root.querySelector("[data-tower-video-enable]");
    if (videoUrlIn && document.activeElement !== videoUrlIn) videoUrlIn.value = p.videoUrl || "";
    if (videoTitleIn && document.activeElement !== videoTitleIn) videoTitleIn.value = p.videoTitle || "";
    if (videoEnIn) videoEnIn.checked = p.videoEnabled !== false;
    initTowerVideo(root, p);

    renderAwardedBadgeShelf(root, p);
    syncBadgeVisibilityUi(root, p);
    applyAvatarFrameScale(root, p.avatarFrameScale || 1);
    initAvatarFrameResize(root);
    initDisplayNameResize(root);
    applyTowerTheme(root, p);
    applyPrivateFeedTheme(root, p.privateFeedTheme);
    syncPublicUrlFields(root, p);
    try { syncProfileKindToggle(root); } catch (eKind) {}
    try { syncAddProfileUi(root); } catch (eAdd) {}
    try { syncRotateToolbar(root); } catch (eRot) {}
    try { refreshTowerCalendars(root); } catch (eCal) {}
  }

  function initTower(root) {
    if (!root) return;
    var form = root.querySelector("[data-tower-compose]");
    var bodyInput = root.querySelector("#tower-body");
    var fileInput = root.querySelector("#tower-files");
    var kindSelect = root.querySelector("#tower-attach-kind");
    var status = root.querySelector("[data-tower-status]");

    function setStatus(msg, isError) {
      if (!status) return;
      if (!msg) {
        status.hidden = true;
        status.textContent = "";
        return;
      }
      status.hidden = false;
      status.textContent = msg;
      status.classList.toggle("is-error", !!isError);
    }

    renderFeed(root);
    renderProfileChrome(root);
    initFramePicker(root);
    initAvatarFrameResize(root);
    initDisplayNameResize(root);
    initOrnamentPicker(root);
    initScrapbookStickers(root);
    initInlineProfileEdits(root);
    initCollageControls(root);
    initPublicLookControls(root);
    initProfileEditDropdown(root);
    initTowerSideToggle(root);
    initPrivateFeedThemeControls(root);
    initPublicUrlCopy(root);
    initRotateToolbar(root);
    initProfileKindToggle(root);
    initAddProfile(root);
    initFriendsBrowse(root);
    initTowerCalendar(root);

    var profileForm = root.querySelector("[data-tower-profile-form]");
    var avatarFile = root.querySelector("[data-tower-avatar-file]");
    var profileStatus = root.querySelector("[data-tower-profile-status]");

    function setProfileStatus(msg, isError) {
      if (!profileStatus) return;
      if (!msg) {
        profileStatus.hidden = true;
        profileStatus.textContent = "";
        return;
      }
      profileStatus.hidden = false;
      profileStatus.textContent = msg;
      profileStatus.classList.toggle("is-error", !!isError);
    }

    if (profileForm) {
      profileForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var p = TowerProfileStore.get();
        var nameInput = root.querySelector("#tower-display-name");
        var htmlInput = root.querySelector("[data-tower-profile-html]");
        p.displayName = nameInput ? nameInput.value.trim().slice(0, 80) || "You" : p.displayName;
        var nameSizeIn = root.querySelector("[data-tower-name-size]");
        p.displayNameSize = normalizeDisplayNameSize(
          nameSizeIn ? nameSizeIn.value : p.displayNameSize
        );
        var handleInputSave = root.querySelector("[data-tower-handle]");
        p.handle = normalizeHandle(handleInputSave ? handleInputSave.value : p.handle);
        p.socialLinks = p.socialLinks || {};
        socialLinkDefs().forEach(function (net) {
          var input = root.querySelector('[data-tower-social="' + net.id + '"]');
          p.socialLinks[net.id] = input ? storedSocialValue(net.id, input.value) : "";
        });
        p.customHtml = sanitizeProfileHtml(htmlInput ? htmlInput.value : "");
        var sloganIn = root.querySelector("[data-tower-slogan]");
        p.slogan = sloganIn ? String(sloganIn.value || "").trim().slice(0, 400) : (p.slogan || "");
        p.badges = { role: "", interest: "", status: "" };
        if (!Array.isArray(p.awardedBadges)) {
          seedAwardedBadgesIfMissing(p);
        }
        var countSel = root.querySelector("[data-tower-friends-count]");
        var n = parseInt(countSel && countSel.value ? countSel.value : "3", 10);
        if ([3, 6, 8].indexOf(n) === -1) n = 3;
        p.friendsDisplayCount = n;
        p.featuredFriendIds = (p.featuredFriendIds || []).slice(0, n);
        var titleIn = root.querySelector("[data-tower-music-title]");
        var urlIn = root.querySelector("[data-tower-music-url]");
        var enIn = root.querySelector("[data-tower-music-enable]");
        var artistIn = root.querySelector("[data-tower-music-artist]");
        var skinIn = root.querySelector("[data-tower-music-skin]");
        p.musicTitle = titleIn ? titleIn.value.trim().slice(0, 120) : "";
        p.musicArtist = artistIn ? artistIn.value.trim().slice(0, 120) : "";
        p.musicUrl = urlIn ? urlIn.value.trim().slice(0, 500) : "";
        p.musicEnabled = enIn ? !!enIn.checked : true;
        p.musicSkin = visibleMusicSkin(skinIn && skinIn.value ? skinIn.value : "classic");
        p.videoEnabled = false;
        p.videoUrl = "";
        if (p.musicYoutubeWidth == null) p.musicYoutubeWidth = 320;
        else p.musicYoutubeWidth = Math.max(180, Math.min(720, parseInt(p.musicYoutubeWidth, 10) || 320));
        var videoUrlIn = root.querySelector("[data-tower-video-url]");
        var videoTitleIn = root.querySelector("[data-tower-video-title]");
        var videoEnIn = root.querySelector("[data-tower-video-enable]");
        p.videoUrl = videoUrlIn ? videoUrlIn.value.trim().slice(0, 500) : (p.videoUrl || "");
        p.videoTitle = videoTitleIn ? videoTitleIn.value.trim().slice(0, 120) : (p.videoTitle || "");
        p.videoEnabled = videoEnIn ? !!videoEnIn.checked : (p.videoEnabled !== false);
        if (p.videoWidth == null) p.videoWidth = 360;
        else p.videoWidth = Math.max(200, Math.min(900, parseInt(p.videoWidth, 10) || 360));
        var frameInput = root.querySelector("[data-tower-avatar-frame-input]");
        p.avatarFrame = normalizeFrameId(frameInput ? frameInput.value : p.avatarFrame);
        var cowboyColorIn = root.querySelector("[data-tower-cowboy-color-input]");
        p.cowboyHatColor = normalizeCowboyHatColor(cowboyColorIn ? cowboyColorIn.value : p.cowboyHatColor);
        var ornamentInput = root.querySelector("[data-tower-avatar-ornament-input]");
        var ornamentPosInput = root.querySelector("[data-tower-avatar-ornament-pos-input]");
        p.avatarOrnament = normalizeOrnamentId(ornamentInput ? ornamentInput.value : p.avatarOrnament);
        p.avatarOrnamentPos = normalizeOrnamentPos(ornamentPosInput ? ornamentPosInput.value : p.avatarOrnamentPos);
        /* Public look fields live on the public-look panel (not Edit profile).
           Keep reading if present so Save profile does not wipe them. */
        var fontIn = root.querySelector("[data-tower-font]");
        var feedBgIn = root.querySelector("[data-tower-feed-bg]");
        var pubTextIn = root.querySelector("[data-tower-public-text]");
        var pubBtnIn = root.querySelector("[data-tower-public-btn]");
        var bgModeIn = root.querySelector("select[data-tower-bg-mode]");
        var bgHtmlIn = root.querySelector("[data-tower-bg-html]");
        if (fontIn) p.towerFont = normalizeTowerFont(fontIn.value);
        if (feedBgIn) p.feedBackgroundColor = normalizeFeedBgColor(feedBgIn.value);
        if (pubTextIn) p.publicTextColor = normalizePublicThemeColor(pubTextIn.value, "#4a2c3a");
        if (pubBtnIn) p.publicButtonColor = normalizePublicThemeColor(pubBtnIn.value, "#f4a4c4");
        if (bgModeIn) {
          p.backgroundMode = normalizeBackgroundMode(bgModeIn.value, null, null);
          if (p.backgroundMode === "collage" && root.querySelector("[data-tower-collage-layout]")) {
            p.backgroundCollage = readCollageFromForm(root);
          }
          if (p.backgroundMode === "html" && bgHtmlIn) {
            p.backgroundHtml = sanitizeProfileHtml(String(bgHtmlIn.value || "").slice(0, 8000));
          }
        } else if (root.querySelector("[data-tower-collage-layout]")) {
          p.backgroundCollage = readCollageFromForm(root);
        }
        /* keep widgetLayout as last dragged */
        if (!p.widgetLayout) p.widgetLayout = JSON.parse(JSON.stringify(DEFAULT_WIDGET_LAYOUT));
        p.publicWidgets = readPublicWidgetsFromForm(root);
        p.publicWidgets.social = profileHasSocialLinks(p);
        if (!TowerProfileStore.save(p)) {
          setProfileStatus("Could not save profile (storage full or blocked). Try a smaller photo.", true);
          return;
        }
        setProfileStatus("Profile saved — refreshing…", false);
        try {
          sessionStorage.setItem("cognation.tower.stay", "1");
        } catch (err) {}
        /* Auto-refresh so scrapbook, frames, font, and feed color paint cleanly */
        window.setTimeout(function () {
          window.location.reload();
        }, 250);
      });
    }

    if (!root.__cognationSocialFieldsBound) {
      root.__cognationSocialFieldsBound = true;
      root.querySelectorAll("[data-tower-social]").forEach(function (input) {
        input.addEventListener("change", function () {
          var id = input.getAttribute("data-tower-social");
          if (!id) return;
          commitSocialDraft(root, id, input.value);
        });
      });
    }

    function looksLikeImage(file) {
      if (!file) return false;
      if (/^image\//.test(file.type || "")) return true;
      return /\.(png|jpe?g|gif|webp|bmp|heic|heif|avif)$/i.test(file.name || "");
    }

    function storeProfileImage(dataUrl, field, statusFn, okMsg, mutate) {
      if (!dataUrl || dataUrl.indexOf("data:image/") !== 0) {
        (statusFn || setProfileStatus)("Could not read that image.", true);
        return;
      }
      var p = TowerProfileStore.get();
      if (mutate) mutate(p);
      p[field] = dataUrl;
      var saved = false;
      try { saved = !!TowerProfileStore.save(p); } catch (eSave) { saved = false; }
      var stored = TowerProfileStore.get();
      if (!stored || stored[field] !== dataUrl) saved = false;
      renderProfileChrome(root);
      if (!saved) {
        (statusFn || setProfileStatus)("Could not save photo (storage full). Try a smaller image.", true);
        return;
      }
      (statusFn || setProfileStatus)(okMsg, false);
    }

    function readImageFile(file, statusFn, onUrl) {
      if (!file) return;
      if (file.type && !looksLikeImage(file)) {
        (statusFn || setProfileStatus)("Choose an image file.", true);
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var raw = String(reader.result || "");
        var img = new Image();
        img.onload = function () {
          var maxEdge = 640;
          var scale = Math.min(1, maxEdge / Math.max(img.width || 1, img.height || 1));
          var cw = Math.max(1, Math.round((img.width || 1) * scale));
          var ch = Math.max(1, Math.round((img.height || 1) * scale));
          var canvas = document.createElement("canvas");
          canvas.width = cw;
          canvas.height = ch;
          var ctx = canvas.getContext("2d");
          var dataUrl = raw;
          if (ctx) {
            ctx.drawImage(img, 0, 0, cw, ch);
            try { dataUrl = canvas.toDataURL("image/jpeg", 0.82); } catch (eUrl) {}
          }
          onUrl(dataUrl);
        };
        img.onerror = function () {
          if (raw.indexOf("data:image/") === 0) onUrl(raw);
          else (statusFn || setProfileStatus)("Could not read that image.", true);
        };
        img.src = raw;
      };
      reader.onerror = function () {
        (statusFn || setProfileStatus)("Could not read that image.", true);
      };
      reader.readAsDataURL(file);
    }

    function applyAvatarFile(file, statusFn) {
      readImageFile(file, statusFn, function (dataUrl) {
        storeProfileImage(dataUrl, "avatarDataUrl", statusFn, "Profile picture updated.");
      });
    }

    function applyPolaroidFile(file, statusFn) {
      readImageFile(file, statusFn, function (dataUrl) {
        storeProfileImage(dataUrl, "polaroidDataUrl", statusFn, "Polaroid updated.", function (p) {
          p.polaroidRemoved = false;
        });
      });
    }

    function pullChosenImage(input, applyFn) {
      if (!input || !input.files || !input.files[0]) return;
      var file = input.files[0];
      if (input.__cognationAppliedFile === file) return;
      input.__cognationAppliedFile = file;
      applyFn(file, setProfileStatus);
    }

    if (avatarFile) {
      avatarFile.addEventListener("change", function () {
        pullChosenImage(avatarFile, applyAvatarFile);
      });
    }
    var avatarFilePanel = root.querySelector("[data-tower-avatar-file-panel]");
    if (avatarFilePanel && !avatarFilePanel.__cognationAvatarPanelBound) {
      avatarFilePanel.__cognationAvatarPanelBound = true;
      avatarFilePanel.addEventListener("change", function () {
        pullChosenImage(avatarFilePanel, applyAvatarFile);
      });
    }
    if (!root.__cognationAvatarFocusPull) {
      root.__cognationAvatarFocusPull = true;
      window.addEventListener("focus", function () {
        setTimeout(function () {
          pullChosenImage(root.querySelector("[data-tower-avatar-file]"), applyAvatarFile);
          pullChosenImage(root.querySelector("[data-tower-avatar-file-panel]"), applyAvatarFile);
          var pol = root.querySelector("[data-tower-polaroid-file]");
          pullChosenImage(pol, applyPolaroidFile);
        }, 0);
      });
    }
    root.querySelectorAll("[data-tower-polaroid-file]").forEach(function (input) {
      if (input.__cognationPolaroidBound) return;
      input.__cognationPolaroidBound = true;
      input.addEventListener("change", function () {
        pullChosenImage(input, applyPolaroidFile);
      });
    });
    var clearAvatarBtn = root.querySelector("[data-tower-clear-avatar]");
    if (clearAvatarBtn && !clearAvatarBtn.__cognationClearAvatarBound) {
      clearAvatarBtn.__cognationClearAvatarBound = true;
      clearAvatarBtn.addEventListener("click", function () {
        var p = TowerProfileStore.get();
        p.avatarDataUrl = "";
        TowerProfileStore.save(p);
        renderProfileChrome(root);
        setProfileStatus("Profile photo removed.", false);
      });
    }

    var htmlLive = root.querySelector("[data-tower-profile-html]");
    if (htmlLive) {
      htmlLive.addEventListener("input", function () {
        var preview = root.querySelector("[data-tower-html-preview]");
        if (preview) preview.innerHTML = sanitizeProfileHtml(htmlLive.value);
      });
    }

    var sloganLive = root.querySelector("[data-tower-slogan]");
    if (sloganLive && !sloganLive.__cognationSloganLiveBound) {
      sloganLive.__cognationSloganLiveBound = true;
      sloganLive.addEventListener("input", function () {
        var display = root.querySelector("[data-tower-slogan-display]");
        var text = String(sloganLive.value || "").trim().slice(0, 400);
        if (display) display.textContent = text;
        var sticker = root.querySelector('[data-tower-widget="slogan"]');
        var widgets = normalizePublicWidgets(TowerProfileStore.get().publicWidgets);
        var show = !!text && widgets.slogan !== false;
        if (sticker) {
          sticker.hidden = !show;
          sticker.classList.toggle("is-widget-off", !show);
        }
      });
    }

    var skinInLive = root.querySelector("[data-tower-music-skin]");
    if (skinInLive) {
      skinInLive.addEventListener("change", function () {
        var cur = TowerProfileStore.get();
        cur.musicSkin = visibleMusicSkin(skinInLive.value || "classic");
        TowerProfileStore.save(cur);
        initTowerMusic(root, cur);
      });
    }
    /* Public look live preview is handled by initPublicLookControls. */

    document.addEventListener("cognation:session-started", function () {
      renderAwardedBadgeShelf(root, TowerProfileStore.get());
    });


    var friendsCount = root.querySelector("[data-tower-friends-count]");
    if (friendsCount) {
      friendsCount.addEventListener("change", function () {
        var cur = TowerProfileStore.get();
        var n = parseInt(friendsCount.value, 10);
        if ([3, 6, 8].indexOf(n) === -1) n = 3;
        cur.friendsDisplayCount = n;
        cur.featuredFriendIds = (cur.featuredFriendIds || []).slice(0, n);
        TowerProfileStore.save(cur);
        renderFriendsPicker(root, cur);
      });
    }

    var saveFriendsBtn = root.querySelector("[data-tower-save-friends]");
    if (saveFriendsBtn && !saveFriendsBtn.__cognationFriendsSaveBound) {
      saveFriendsBtn.__cognationFriendsSaveBound = true;
      saveFriendsBtn.addEventListener("click", function () {
        var cur = TowerProfileStore.get();
        var countSel = root.querySelector("[data-tower-friends-count]");
        var n = parseInt(countSel && countSel.value ? countSel.value : cur.friendsDisplayCount || 3, 10);
        if ([3, 6, 8].indexOf(n) === -1) n = 3;
        var ids = (cur.featuredFriendIds || []).slice();
        /* Prefer live selected chips if present */
        var chips = root.querySelectorAll("[data-tower-friends-chips] .tower-friend-chip.is-selected[data-friend-id]");
        if (chips && chips.length) {
          ids = [];
          chips.forEach(function (btn) {
            var id = btn.getAttribute("data-friend-id");
            if (id && ids.indexOf(id) < 0) ids.push(id);
          });
        }
        cur.friendsDisplayCount = n;
        cur.featuredFriendIds = ids.slice(0, n);
        ensureFriendPinPositions(cur, cur.featuredFriendIds);
        if (!TowerProfileStore.save(cur)) {
          var stFail = root.querySelector("[data-tower-friends-status]");
          if (stFail) stFail.textContent = "Could not save top friends.";
          return;
        }
        renderFriendsPicker(root, cur);
        renderFriendPins(root, cur);
        var st = root.querySelector("[data-tower-friends-status]");
        if (st) {
          var count = cur.featuredFriendIds.length;
          st.textContent = "Top friends saved";
        }
      });
    }

    var saveBadgesBtn = root.querySelector("[data-tower-save-badges]");
    if (saveBadgesBtn && !saveBadgesBtn.__cognationBadgesSaveBound) {
      saveBadgesBtn.__cognationBadgesSaveBound = true;
      saveBadgesBtn.addEventListener("click", function () {
        var cur = TowerProfileStore.get();
        if (!cur.badgeVisibility || typeof cur.badgeVisibility !== "object") {
          cur.badgeVisibility = {};
        }
        var box = root.querySelector("[data-tower-badge-visibility]");
        if (box) {
          box.querySelectorAll("[data-tower-badge-vis]").forEach(function (cb) {
            var id = cb.getAttribute("data-tower-badge-vis");
            if (!id) return;
            cur.badgeVisibility[id] = !!cb.checked;
          });
        }
        var visibleIds = collectVisibleBadgePins(cur).map(function (it) { return it.id; });
        ensureBadgePinPositions(cur, visibleIds);
        if (!TowerProfileStore.save(cur)) {
          setBadgeDisplayStatus(root, "Could not save badge display.");
          return;
        }
        renderAwardedBadgeShelf(root, cur);
        syncBadgeVisibilityUi(root, cur);
        setBadgeDisplayStatus(root, "Badge display saved");
      });
    }

    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var attachments = [];
        var files = fileInput && fileInput.files ? Array.prototype.slice.call(fileInput.files) : [];
        var kind = (kindSelect && kindSelect.value) || "document";
        files.forEach(function (f) {
          attachments.push({
            kind: kind,
            label: f.name,
            name: f.name,
            /* Demo only — we store metadata, not binary blobs */
            demoMeta: true,
            size: f.size,
            type: f.type || "",
          });
        });
        if (usingRemoteSocial()) {
          var social = remoteSocial();
          if (!social || !social.createTowerPost) {
            setStatus("Tower is still connecting. Please try again.", true);
            return;
          }
          setStatus("Posting to Tower…", false);
          social
            .createTowerPost({
              body: bodyInput ? bodyInput.value : "",
              attachments: attachments,
            })
            .then(function () {
              if (bodyInput) bodyInput.value = "";
              if (fileInput) fileInput.value = "";
              setStatus("Posted to Tower.", false);
              renderFeed(root);
            })
            .catch(function (error) {
              setStatus(
                (error && error.message) || "Could not post to Tower. Please try again.",
                true
              );
            });
          return;
        }
        var result = TowerStore.add({
          authorName: postAuthorFromProfile(TowerProfileStore.get()),
          body: bodyInput ? bodyInput.value : "",
          attachments: attachments,
        });
        if (!result.ok) {
          setStatus(result.error || "Could not post.", true);
          return;
        }
        if (bodyInput) bodyInput.value = "";
        if (fileInput) fileInput.value = "";
        setStatus("Posted to Tower. Local COMMUNE will pick this up.", false);
        renderFeed(root);
      });
    }

    document.addEventListener("cognation:tower-updated", function () {
      renderFeed(root);
    });
    document.addEventListener("cognation:remote-profile-loaded", function () {
      renderProfileChrome(root);
      renderFeed(root);
      if (hashRequestsPublicSide()) applyTowerSide(root, "public");
    });
  }

  window.CognationTowerIsFounderOwner = isFounderOwner;
  window.CognationTowerApplySide = function (side) {
    document.querySelectorAll("[data-tower-app]").forEach(function (root) {
      applyTowerSide(root, side);
    });
  };
  window.CognationTowerProfilePublicUrl = function (profile) {
    return profilePublicUrl(profile);
  };

  function boot() {
    document.querySelectorAll("[data-tower-app]").forEach(initTower);
    /* Hash deep-link to a profile → public scrapbook side */
    if (hashRequestsPublicSide()) {
      document.querySelectorAll("[data-tower-app]").forEach(function (root) {
        applyTowerSide(root, "public");
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
