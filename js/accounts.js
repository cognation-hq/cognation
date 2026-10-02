/**
 * Cognation accounts + Tower profiles registry (demo / localStorage).
 * Swap later for a real backend — same shape.
 *
 * Keys:
 *   cognation.accounts.v1  — [{ username, phone, profileIds[] }]
 *   cognation.profiles.v1  — { [id]: { id, kind, accountUsername, phone, handle, displayName, ...tower fields } }
 *
 * Cap: no more than 2 profiles per phone number.
 * Migrates legacy cognation.tower.profile.v1 → Personal on first load.
 */
(function () {
  "use strict";

  var ACCOUNTS_KEY = "cognation.accounts.v1";
  var PROFILES_KEY = "cognation.profiles.v1";
  var LEGACY_PROFILE_KEY = "cognation.tower.profile.v1";
  var MAX_PROFILES_PER_PHONE = 2;

  var DEMO_ALEXA = {
    username: "alexa",
    phone: "(312) 555-0147",
    personalId: "prof-alexa-personal",
    professionalId: "prof-alexa-professional",
    personalHandle: "alexa",
    professionalHandle: "alexa-pro",
  };

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  function normalizePhone(raw) {
    var digits = String(raw || "").replace(/\D/g, "");
    if (digits.length === 11 && digits.charAt(0) === "1") digits = digits.slice(1);
    if (digits.length !== 10) {
      return String(raw || "").trim();
    }
    return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
  }

  function phoneKey(raw) {
    var digits = String(raw || "").replace(/\D/g, "");
    if (digits.length === 11 && digits.charAt(0) === "1") digits = digits.slice(1);
    return digits;
  }

  function normalizeHandle(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 32);
  }

  function uid(prefix) {
    return (
      (prefix || "prof") +
      "-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function loadAccountsDoc() {
    var doc = readJson(ACCOUNTS_KEY, null);
    if (!doc || typeof doc !== "object") doc = { accounts: [] };
    if (!Array.isArray(doc.accounts)) doc.accounts = [];
    return doc;
  }

  function saveAccountsDoc(doc) {
    return writeJson(ACCOUNTS_KEY, doc);
  }

  function loadProfilesDoc() {
    var doc = readJson(PROFILES_KEY, null);
    if (!doc || typeof doc !== "object") doc = { profiles: {} };
    if (!doc.profiles || typeof doc.profiles !== "object") doc.profiles = {};
    return doc;
  }

  function saveProfilesDoc(doc) {
    return writeJson(PROFILES_KEY, doc);
  }

  function defaultPersonalTower() {
    return {
      displayName: "Alexa",
      handle: DEMO_ALEXA.personalHandle,
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
      publicWidgets: null,
      friendPinLayout: {},
      badgePinLayout: {},
      featuredFriendIds: [],
      friendsDisplayCount: 3,
      backgroundCollage: { layoutId: "none", cells: [] },
      towerFont: "georgia",
      feedBackgroundColor: "#fff5f9",
      publicTextColor: "#4a2c3a",
      publicButtonColor: "#f4a4c4",
      backgroundMode: "solid",
      backgroundHtml: "",
      privateFeedTheme: null,
    };
  }

  function defaultProfessionalTower() {
    return {
      displayName: "Alexa J Thomas",
      handle: DEMO_ALEXA.professionalHandle,
      slogan: "",
      socialLinks: {},
      avatarDataUrl: "",
      avatarFrame: "none",
      avatarFrameScale: 1,
      displayNameSize: 26,
      cowboyHatColor: "tan",
      avatarOrnament: "none",
      avatarOrnamentPos: "above",
      musicYoutubeWidth: 320,
      videoUrl: "",
      videoTitle: "",
      videoEnabled: false,
      videoWidth: 360,
      badges: { role: "", interest: "", status: "" },
      customHtml: "",
      awardedBadges: [],
      badgeVisibility: {},
      widgetLayout: {
        avatar: { x: 4, y: 4, z: 5, tilt: 0 },
        identity: { x: 4, y: 26, z: 4, tilt: 0 },
        slogan: { x: 28, y: 18, z: 4, tilt: 0 },
        social: { x: 4, y: 26, z: 4, tilt: 0 },
        music: { x: 4, y: 34, z: 6, tilt: 0 },
        badges: { x: 4, y: 44, z: 5, tilt: 0 },
        friends: { x: 4, y: 56, z: 4, tilt: 0 },
        html: { x: 28, y: 4, z: 3, tilt: 0 },
      },
      publicWidgets: {
        identity: true,
        slogan: true,
        social: true,
        music: false,
        badges: true,
        friends: false,
        html: true,
      },
      friendPinLayout: {},
      badgePinLayout: {},
      featuredFriendIds: [],
      friendsDisplayCount: 3,
      backgroundCollage: { layoutId: "none", cells: [] },
      towerFont: "system",
      feedBackgroundColor: "#f8fafc",
      publicTextColor: "#1e293b",
      publicButtonColor: "#64748b",
      backgroundMode: "solid",
      backgroundHtml: "",
      privateFeedTheme: null,
    };
  }

  function mergeTowerFields(base, overlay) {
    var out = {};
    var k;
    for (k in base) {
      if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    }
    if (overlay && typeof overlay === "object") {
      for (k in overlay) {
        if (Object.prototype.hasOwnProperty.call(overlay, k)) {
          if (k === "id" || k === "kind" || k === "accountUsername" || k === "phone") continue;
          out[k] = overlay[k];
        }
      }
    }
    return out;
  }

  function stripMeta(profile) {
    if (!profile || typeof profile !== "object") return {};
    var out = {};
    Object.keys(profile).forEach(function (k) {
      if (k === "id" || k === "kind" || k === "accountUsername" || k === "phone" || k === "createdAt" || k === "updatedAt") {
        return;
      }
      out[k] = profile[k];
    });
    return out;
  }

  function getAccountByUsername(username) {
    username = String(username || "").trim().toLowerCase();
    if (!username) return null;
    var doc = loadAccountsDoc();
    for (var i = 0; i < doc.accounts.length; i++) {
      if (String(doc.accounts[i].username || "").toLowerCase() === username) {
        return doc.accounts[i];
      }
    }
    return null;
  }

  function getProfileById(id) {
    if (!id) return null;
    var doc = loadProfilesDoc();
    return doc.profiles[id] || null;
  }

  function getProfileByHandle(handle) {
    handle = normalizeHandle(handle);
    if (!handle) return null;
    var doc = loadProfilesDoc();
    var ids = Object.keys(doc.profiles);
    for (var i = 0; i < ids.length; i++) {
      var p = doc.profiles[ids[i]];
      if (p && normalizeHandle(p.handle) === handle) return p;
    }
    return null;
  }

  function getProfilesForUsername(username) {
    var acct = getAccountByUsername(username);
    if (!acct) return [];
    var out = [];
    (acct.profileIds || []).forEach(function (id) {
      var p = getProfileById(id);
      if (p) out.push(p);
    });
    return out;
  }

  function getProfilesForPhone(phone) {
    var key = phoneKey(phone);
    if (!key) return [];
    var doc = loadProfilesDoc();
    var out = [];
    Object.keys(doc.profiles).forEach(function (id) {
      var p = doc.profiles[id];
      if (p && phoneKey(p.phone) === key) out.push(p);
    });
    return out;
  }

  function canAddProfileForPhone(phone) {
    var list = getProfilesForPhone(phone);
    if (list.length >= MAX_PROFILES_PER_PHONE) {
      return {
        ok: false,
        reason:
          "This phone number already has " +
          MAX_PROFILES_PER_PHONE +
          " Tower profiles (Personal + Professional). Demo limit — remove one or use another number.",
        count: list.length,
      };
    }
    return { ok: true, count: list.length };
  }

  function upsertAccount(username, phone, profileIds) {
    var doc = loadAccountsDoc();
    var u = String(username || "").trim().toLowerCase();
    var found = null;
    for (var i = 0; i < doc.accounts.length; i++) {
      if (String(doc.accounts[i].username || "").toLowerCase() === u) {
        found = doc.accounts[i];
        break;
      }
    }
    if (!found) {
      found = { username: u, phone: normalizePhone(phone), profileIds: [] };
      doc.accounts.push(found);
    }
    if (phone) found.phone = normalizePhone(phone);
    if (profileIds) found.profileIds = profileIds.slice();
    saveAccountsDoc(doc);
    return found;
  }

  function saveProfileRecord(rec) {
    var doc = loadProfilesDoc();
    rec.updatedAt = Date.now();
    doc.profiles[rec.id] = rec;
    var wrote = saveProfilesDoc(doc);
    if (!wrote) return null;
    /* Mirror active-looking blob for older readers. A failed mirror must not
       undo the profile write that just succeeded. */
    try {
      if (rec.kind === "personal") {
        localStorage.setItem(LEGACY_PROFILE_KEY, JSON.stringify(stripMeta(rec)));
      }
    } catch (e) {}
    document.dispatchEvent(
      new CustomEvent("cognation:profiles-updated", { detail: { id: rec.id, kind: rec.kind } })
    );
    return rec;
  }

  function createProfile(opts) {
    opts = opts || {};
    var username = String(opts.username || "").trim().toLowerCase();
    var phone = normalizePhone(opts.phone || "");
    var kind = opts.kind === "professional" ? "professional" : "personal";
    if (!username) return { ok: false, error: "Username required." };
    if (!phone || phoneKey(phone).length < 10) {
      return { ok: false, error: "A valid phone number is required to claim a Tower profile." };
    }
    var gate = canAddProfileForPhone(phone);
    if (!gate.ok) return { ok: false, error: gate.reason };

    var existing = getProfilesForUsername(username);
    for (var i = 0; i < existing.length; i++) {
      if (existing[i].kind === kind) {
        return { ok: false, error: "You already have a " + kind + " page." };
      }
    }

    var handle = normalizeHandle(opts.handle || "");
    if (handle) {
      var clash = getProfileByHandle(handle);
      if (clash) return { ok: false, error: "Handle @" + handle + " is already taken in this demo registry." };
    }

    var base = kind === "professional" ? defaultProfessionalTower() : defaultPersonalTower();
    var tower = mergeTowerFields(base, opts.tower || {});
    if (opts.displayName) tower.displayName = String(opts.displayName).trim().slice(0, 80);
    if (handle) tower.handle = handle;
    else if (!tower.handle) {
      tower.handle = kind === "professional" ? username + "-pro" : username;
    }

    var id = opts.id || uid("prof-" + kind);
    var rec = {
      id: id,
      kind: kind,
      accountUsername: username,
      phone: phone,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    Object.keys(tower).forEach(function (k) {
      rec[k] = tower[k];
    });

    saveProfileRecord(rec);
    var acct = getAccountByUsername(username);
    var ids = (acct && acct.profileIds) || [];
    if (ids.indexOf(id) < 0) ids.push(id);
    upsertAccount(username, phone, ids);
    return { ok: true, profile: rec };
  }

  function updateProfileTower(id, towerFields) {
    var rec = getProfileById(id);
    if (!rec) return { ok: false, error: "Profile not found." };
    var merged = mergeTowerFields(stripMeta(rec), towerFields || {});
    Object.keys(merged).forEach(function (k) {
      rec[k] = merged[k];
    });
    if (towerFields && towerFields.handle != null) {
      var h = normalizeHandle(towerFields.handle);
      var clash = getProfileByHandle(h);
      if (clash && clash.id !== id) {
        return { ok: false, error: "Handle @" + h + " is already taken." };
      }
      rec.handle = h;
    }
    if (!saveProfileRecord(rec)) {
      return { ok: false, error: "storage" };
    }
    return { ok: true, profile: rec };
  }

  function readLegacyProfile() {
    try {
      var raw = localStorage.getItem(LEGACY_PROFILE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function ensureSeeded() {
    var acct = getAccountByUsername(DEMO_ALEXA.username);
    var profilesDoc = loadProfilesDoc();
    var legacy = readLegacyProfile();
    var personal = getProfileById(DEMO_ALEXA.personalId) || getProfilesForUsername(DEMO_ALEXA.username).filter(function (p) {
      return p.kind === "personal";
    })[0];
    var professional =
      getProfileById(DEMO_ALEXA.professionalId) ||
      getProfilesForUsername(DEMO_ALEXA.username).filter(function (p) {
        return p.kind === "professional";
      })[0];

    if (!personal) {
      var personalTower = mergeTowerFields(defaultPersonalTower(), legacy || {});
      if (!personalTower.handle) personalTower.handle = DEMO_ALEXA.personalHandle;
      if (!personalTower.displayName || personalTower.displayName === "You") {
        personalTower.displayName = legacy && legacy.displayName ? legacy.displayName : "Alexa";
      }
      var recP = {
        id: DEMO_ALEXA.personalId,
        kind: "personal",
        accountUsername: DEMO_ALEXA.username,
        phone: DEMO_ALEXA.phone,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      Object.keys(personalTower).forEach(function (k) {
        recP[k] = personalTower[k];
      });
      profilesDoc.profiles[recP.id] = recP;
      personal = recP;
      saveProfilesDoc(profilesDoc);
    } else if (legacy && !personal.__migratedFromLegacy) {
      /* One-time soft merge: prefer legacy scrapbook fields if personal still looks empty */
      var needsMerge =
        (!personal.avatarDataUrl && legacy.avatarDataUrl) ||
        (!personal.widgetLayout && legacy.widgetLayout) ||
        (!personal.customHtml && legacy.customHtml);
      if (needsMerge) {
        var mergedP = mergeTowerFields(stripMeta(personal), legacy);
        Object.keys(mergedP).forEach(function (k) {
          personal[k] = mergedP[k];
        });
        personal.__migratedFromLegacy = true;
        saveProfileRecord(personal);
      }
    }

    if (!professional) {
      var proTower = defaultProfessionalTower();
      var recPro = {
        id: DEMO_ALEXA.professionalId,
        kind: "professional",
        accountUsername: DEMO_ALEXA.username,
        phone: DEMO_ALEXA.phone,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      Object.keys(proTower).forEach(function (k) {
        recPro[k] = proTower[k];
      });
      profilesDoc = loadProfilesDoc();
      profilesDoc.profiles[recPro.id] = recPro;
      professional = recPro;
      saveProfilesDoc(profilesDoc);
    }

    var ids = [];
    if (personal) ids.push(personal.id);
    if (professional) ids.push(professional.id);
    upsertAccount(DEMO_ALEXA.username, DEMO_ALEXA.phone, ids);

    /* Keep legacy key in sync with personal for older code paths.
       A later seed must not wipe a photo, YouTube link, or pin map that
       the personal record does not have yet. */
    if (personal) {
      try {
        var legacyNow = readLegacyProfile();
        var legacyRicher = !!(legacyNow && (
          (legacyNow.avatarDataUrl &&
            String(legacyNow.avatarDataUrl).indexOf("data:image/") === 0 &&
            (!personal.avatarDataUrl || String(personal.avatarDataUrl).indexOf("data:image/") !== 0)) ||
          (String(legacyNow.musicUrl || "").trim() && !String(personal.musicUrl || "").trim()) ||
          (legacyNow.friendPinLayout &&
            typeof legacyNow.friendPinLayout === "object" &&
            Object.keys(legacyNow.friendPinLayout).length &&
            (!personal.friendPinLayout || !Object.keys(personal.friendPinLayout).length)) ||
          (legacyNow.musicYoutubeWidth != null &&
            !isNaN(parseInt(legacyNow.musicYoutubeWidth, 10)) &&
            parseInt(legacyNow.musicYoutubeWidth, 10) !== parseInt(personal.musicYoutubeWidth, 10)) ||
          (Array.isArray(legacyNow.removedFriendPinIds) &&
            legacyNow.removedFriendPinIds.length &&
            JSON.stringify(legacyNow.removedFriendPinIds) !== JSON.stringify(personal.removedFriendPinIds || [])) ||
          (Array.isArray(legacyNow.featuredFriendIds) &&
            legacyNow.featuredFriendIds.length &&
            JSON.stringify(legacyNow.featuredFriendIds) !== JSON.stringify(personal.featuredFriendIds || []))
        ));
        if (!legacyRicher) {
          localStorage.setItem(LEGACY_PROFILE_KEY, JSON.stringify(stripMeta(personal)));
        }
      } catch (e2) {}
    }

    return {
      account: getAccountByUsername(DEMO_ALEXA.username),
      personal: personal,
      professional: professional,
    };
  }

  function profilesForLogin(username) {
    ensureSeeded();
    return getProfilesForUsername(username);
  }


  function ensureDemoProfessionals() {
    ensureSeeded();
    var demos = [
      {
        id: "prof-demo-mira-pro",
        kind: "professional",
        accountUsername: "mira-demo",
        phone: "(312) 555-0201",
        handle: "mira-wellness",
        displayName: "Mira Chen · Wellness",
        featuredPosts: [
          { id: "fp1", title: "Neighborhood stretch drop-in", body: "Saturday mornings on the green · sliding scale. Walk-ins welcome." },
          { id: "fp2", title: "Breathwork for busy weeks", body: "15-minute noon reset · free demo seat this month." },
        ],
      },
      {
        id: "prof-demo-jordan-pro",
        kind: "professional",
        accountUsername: "jordan-demo",
        phone: "(312) 555-0202",
        handle: "jordan-civic",
        displayName: "Jordan Lee · Civic Help",
        featuredPosts: [
          { id: "fp1", title: "Zoning packet office hours", body: "Free 20-minute consults for block petitions and neighbor letters." },
          { id: "fp2", title: "Tenant rights clinic", body: "Thursday evenings · bring your lease questions (demo)." },
        ],
      },
    ];
    demos.forEach(function (d) {
      var existing = getProfileById(d.id);
      if (existing) {
        if (!Array.isArray(existing.featuredPosts) || !existing.featuredPosts.length) {
          existing.featuredPosts = d.featuredPosts;
          existing.displayName = existing.displayName || d.displayName;
          existing.handle = existing.handle || d.handle;
          saveProfileRecord(existing);
        }
        return;
      }
      var rec = {
        id: d.id,
        kind: "professional",
        accountUsername: d.accountUsername,
        phone: d.phone,
        handle: d.handle,
        displayName: d.displayName,
        featuredPosts: d.featuredPosts,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      saveProfileRecord(rec);
    });
    /* Seed featured posts on Alexa professional too */
    var alexaPro =
      getProfileById(DEMO_ALEXA.professionalId) ||
      getProfilesForUsername(DEMO_ALEXA.username).filter(function (p) {
        return p.kind === "professional";
      })[0];
    if (alexaPro && (!Array.isArray(alexaPro.featuredPosts) || !alexaPro.featuredPosts.length)) {
      alexaPro.featuredPosts = [
        {
          id: "alexa-svc-1",
          title: "Cognation concierge office hours",
          body: "Book a guided intro to Tower + COMMUNE features · demo professional post.",
        },
      ];
      saveProfileRecord(alexaPro);
    }
    return demos.map(function (d) {
      return d.id;
    });
  }

  window.CognationAccounts = {
    ACCOUNTS_KEY: ACCOUNTS_KEY,
    PROFILES_KEY: PROFILES_KEY,
    LEGACY_PROFILE_KEY: LEGACY_PROFILE_KEY,
    MAX_PROFILES_PER_PHONE: MAX_PROFILES_PER_PHONE,
    DEMO_ALEXA: DEMO_ALEXA,
    /* SeedOps bridge — prefer CognationSeedOps.materializeSample */
    materializeSeedSample: function (count) {
      if (window.CognationSeedOps && window.CognationSeedOps.materializeSample) {
        return window.CognationSeedOps.materializeSample(count);
      }
      return { ok: false, error: "seedops-unavailable" };
    },
    normalizePhone: normalizePhone,
    phoneKey: phoneKey,
    normalizeHandle: normalizeHandle,
    ensureSeeded: ensureSeeded,
    getAccountByUsername: getAccountByUsername,
    getProfileById: getProfileById,
    getProfileByHandle: getProfileByHandle,
    getProfilesForUsername: getProfilesForUsername,
    getProfilesForPhone: getProfilesForPhone,
    canAddProfileForPhone: canAddProfileForPhone,
    createProfile: createProfile,
    updateProfileTower: updateProfileTower,
    stripMeta: stripMeta,
    profilesForLogin: profilesForLogin,
    ensureDemoProfessionals: ensureDemoProfessionals,
    saveProfileRecord: saveProfileRecord,
  };

  try {
    ensureSeeded();
  } catch (bootErr) {}
})();
