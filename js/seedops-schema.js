/**
 * SeedOps — seed/demo account schema for ~1,000 fleet accounts.
 *
 * Shape (account + personal profile):
 *   accountKind: "real" | "seed" | "ops"
 *   isSeed / isOpsBot: convenience booleans
 *   seedFleetId: stable "seed-0001" … "seed-1000" (or "ops-…")
 *   displayName: plain first name ONLY (no last names, no trailing numbers)
 *   handle: seed-<slug>-<nnn> (machine id; not shown as the human name)
 *
 * Real beta users omit accountKind or set "real". Seeds are labeled and
 * distinguishable from real users in UI (see seedops-badge.js).
 */
(function () {
  "use strict";

  var FLEET_SIZE = 1000;
  var STORAGE_KEY = "cognation.seedops.fleet.v1";
  var ACCOUNT_KINDS = { real: "real", seed: "seed", ops: "ops" };

  /* Plain first names only — recycled across the fleet; uniqueness lives in seedFleetId/handle. */
  var FIRST_NAMES = [
    "Ada", "Aisha", "Alex", "Amir", "Ana", "Andre", "Aria", "Asher", "Ava", "Bea",
    "Ben", "Blair", "Cam", "Cara", "Chris", "Cora", "Dana", "Dev", "Drew", "Eden",
    "Eli", "Ella", "Emma", "Ezra", "Finn", "Fran", "Gabe", "Gia", "Grey", "Hank",
    "Harper", "Hazel", "Ian", "Imani", "Iris", "Ivan", "Jade", "Jamie", "Jay", "Jess",
    "Jordan", "Jules", "Kai", "Kara", "Ken", "Kim", "Kit", "Lane", "Leo", "Lex",
    "Lila", "Liv", "Luna", "Mae", "Mara", "Max", "Maya", "Micah", "Mila", "Mina",
    "Morgan", "Nia", "Nik", "Noa", "Nora", "Omar", "Ora", "Owen", "Pax", "Pearl",
    "Quinn", "Rae", "Remy", "Rio", "Robin", "Rosa", "Rowan", "Sage", "Sam", "Sasha",
    "Shawn", "Skye", "Sol", "Talia", "Tess", "Theo", "Tia", "Troy", "Uma", "Uri",
    "Val", "Vera", "Vince", "Wade", "Wes", "Will", "Wren", "Xander", "Yara", "Zoe",
    "Ari", "Bo", "Cal", "Dee", "Eve", "Faye", "Gus", "Hoyt", "Ivy", "Jo",
    "Kade", "Lou", "Mo", "Ned", "Otis", "Pip", "Quill", "Reed", "Syd", "Ted",
    "Uli", "Vic", "Wynn", "York", "Zed", "Ash", "Blake", "Casey", "Dale", "Ellis",
    "Frankie", "Glen", "Harley", "Indie", "Jackie", "Kelly", "Leslie", "Marley", "Nicky", "Oakley",
    "Parker", "Reese", "Sidney", "Taylor", "Whitney", "Avery", "Bailey", "Cameron", "Dakota", "Emerson",
    "Finley", "Hayden", "Jordan", "Kendall", "Logan", "Morgan", "Peyton", "Quinn", "Riley", "Sawyer",
    "Charlie", "Frankie", "Jamie", "Jessie", "Pat", "Ronnie", "Stevie", "Terry", "Tracy", "Bobby"
  ];

  var OPS_BOTS = [
    { seedFleetId: "ops-curator", displayName: "Curator", handle: "ops-curator" },
    { seedFleetId: "ops-mod", displayName: "Moderator", handle: "ops-mod" },
    { seedFleetId: "ops-wire", displayName: "Wire", handle: "ops-wire" }
  ];

  function pad(n, width) {
    var s = String(n);
    while (s.length < (width || 4)) s = "0" + s;
    return s;
  }

  function slugify(name) {
    return String(name || "seed")
      .trim()
      .toLowerCase()
      .replace(/[^a-z]+/g, "")
      .slice(0, 16) || "seed";
  }

  function firstNameAt(index) {
    var i = ((Number(index) || 0) % FIRST_NAMES.length + FIRST_NAMES.length) % FIRST_NAMES.length;
    return FIRST_NAMES[i];
  }

  function normalizeKind(raw) {
    var k = String(raw || "").toLowerCase();
    if (k === "seed" || k === "demo") return ACCOUNT_KINDS.seed;
    if (k === "ops" || k === "opsbot" || k === "ops_bot") return ACCOUNT_KINDS.ops;
    if (k === "real") return ACCOUNT_KINDS.real;
    return "";
  }

  function classify(record) {
    if (!record || typeof record !== "object") {
      return { accountKind: ACCOUNT_KINDS.real, isSeed: false, isOpsBot: false };
    }
    var kind =
      normalizeKind(record.accountKind) ||
      (record.isOpsBot || record.opsBot ? ACCOUNT_KINDS.ops : "") ||
      (record.isSeed || record.seeded === true || record.demo === true || record.seedFleetId
        ? ACCOUNT_KINDS.seed
        : "") ||
      ACCOUNT_KINDS.real;
    /* Username / id heuristics for fleet records */
    var uname = String(record.accountUsername || record.username || record.handle || "").toLowerCase();
    var fleetId = String(record.seedFleetId || record.id || "");
    if (kind === ACCOUNT_KINDS.real) {
      if (/^seed-/.test(uname) || /^seed-/.test(fleetId) || /^prof-seed-/.test(String(record.id || ""))) {
        kind = ACCOUNT_KINDS.seed;
      } else if (/^ops-/.test(uname) || /^ops-/.test(fleetId)) {
        kind = ACCOUNT_KINDS.ops;
      }
    }
    return {
      accountKind: kind,
      isSeed: kind === ACCOUNT_KINDS.seed,
      isOpsBot: kind === ACCOUNT_KINDS.ops,
    };
  }

  function isNonReal(record) {
    var c = classify(record);
    return c.isSeed || c.isOpsBot;
  }

  function isReal(record) {
    return classify(record).accountKind === ACCOUNT_KINDS.real;
  }

  function buildSeedRecord(index) {
    var i = Math.max(0, Math.min(FLEET_SIZE - 1, Number(index) || 0));
    var name = firstNameAt(i);
    var nnn = pad(i + 1, 4);
    var handle = "seed-" + slugify(name) + "-" + nnn;
    var id = "prof-seed-" + nnn;
    return {
      id: id,
      kind: "personal",
      accountUsername: "seed-" + nnn,
      accountKind: ACCOUNT_KINDS.seed,
      isSeed: true,
      isOpsBot: false,
      seedFleetId: "seed-" + nnn,
      demo: true,
      phone: "",
      handle: handle,
      displayName: name,
      slogan: "",
      createdAt: 0,
      updatedAt: 0,
      badges: { role: "seed", interest: "", status: "demo" },
      awardedBadges: [],
      featuredFriendIds: [],
      friendsDisplayCount: 3,
      friendIds: [],
    };
  }

  function buildOpsRecord(spec) {
    return {
      id: "prof-" + spec.seedFleetId,
      kind: "personal",
      accountUsername: spec.handle,
      accountKind: ACCOUNT_KINDS.ops,
      isSeed: false,
      isOpsBot: true,
      seedFleetId: spec.seedFleetId,
      demo: true,
      phone: "",
      handle: spec.handle,
      displayName: spec.displayName,
      slogan: "",
      createdAt: 0,
      updatedAt: 0,
      badges: { role: "ops", interest: "", status: "demo" },
      awardedBadges: [],
      featuredFriendIds: [],
      friendsDisplayCount: 3,
      friendIds: [],
    };
  }

  function listSeedAccounts(opts) {
    opts = opts || {};
    var offset = Math.max(0, Number(opts.offset) || 0);
    var limit = Math.min(FLEET_SIZE, Math.max(0, Number(opts.limit) != null ? Number(opts.limit) : FLEET_SIZE));
    var out = [];
    for (var i = offset; i < offset + limit && i < FLEET_SIZE; i++) {
      out.push(buildSeedRecord(i));
    }
    return out;
  }

  function listOpsBots() {
    return OPS_BOTS.map(buildOpsRecord);
  }

  function getByFleetId(fleetId) {
    var id = String(fleetId || "");
    if (/^ops-/.test(id)) {
      for (var o = 0; o < OPS_BOTS.length; o++) {
        if (OPS_BOTS[o].seedFleetId === id) return buildOpsRecord(OPS_BOTS[o]);
      }
      return null;
    }
    var m = /^seed-(\d{1,4})$/.exec(id);
    if (!m) return null;
    var n = parseInt(m[1], 10);
    if (!n || n < 1 || n > FLEET_SIZE) return null;
    return buildSeedRecord(n - 1);
  }

  function readFleetMeta() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function writeFleetMeta(meta) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Materialize a sample of seed profiles into CognationAccounts for local UI.
   * Full fleet of FLEET_SIZE remains available via listSeedAccounts / getByFleetId
   * without forcing 1,000 rows into localStorage on every boot.
   */
  function materializeSample(count) {
    count = Math.max(0, Math.min(FLEET_SIZE, Number(count) || 24));
    var accounts = window.CognationAccounts;
    if (!accounts || typeof accounts.saveProfileRecord !== "function") {
      return { ok: false, error: "accounts-unavailable", count: 0 };
    }
    var saved = 0;
    for (var i = 0; i < count; i++) {
      var rec = buildSeedRecord(i);
      var existing = accounts.getProfileById && accounts.getProfileById(rec.id);
      if (existing) {
        existing.accountKind = ACCOUNT_KINDS.seed;
        existing.isSeed = true;
        existing.demo = true;
        existing.seedFleetId = rec.seedFleetId;
        if (existing.displayName && /\d/.test(existing.displayName)) {
          existing.displayName = rec.displayName;
        }
        accounts.saveProfileRecord(existing);
      } else {
        accounts.saveProfileRecord(rec);
      }
      saved += 1;
    }
    listOpsBots().forEach(function (ops) {
      if (!(accounts.getProfileById && accounts.getProfileById(ops.id))) {
        accounts.saveProfileRecord(ops);
      }
    });
    writeFleetMeta({
      version: 1,
      fleetSize: FLEET_SIZE,
      materialized: count,
      at: new Date().toISOString(),
    });
    return { ok: true, count: saved, fleetSize: FLEET_SIZE };
  }

  function markProfile(profile, kind) {
    if (!profile || typeof profile !== "object") return profile;
    var k = normalizeKind(kind) || ACCOUNT_KINDS.seed;
    profile.accountKind = k;
    profile.isSeed = k === ACCOUNT_KINDS.seed;
    profile.isOpsBot = k === ACCOUNT_KINDS.ops;
    profile.demo = k !== ACCOUNT_KINDS.real;
    return profile;
  }

  window.CognationSeedOps = {
    FLEET_SIZE: FLEET_SIZE,
    STORAGE_KEY: STORAGE_KEY,
    ACCOUNT_KINDS: ACCOUNT_KINDS,
    FIRST_NAMES: FIRST_NAMES.slice(),
    classify: classify,
    isNonReal: isNonReal,
    isReal: isReal,
    buildSeedRecord: buildSeedRecord,
    listSeedAccounts: listSeedAccounts,
    listOpsBots: listOpsBots,
    getByFleetId: getByFleetId,
    materializeSample: materializeSample,
    markProfile: markProfile,
    readFleetMeta: readFleetMeta,
  };
})();
