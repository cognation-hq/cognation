/**
 * SeedOps unit checks (schema + friend gate + pathways + ops trigger + tower posts + friction).
 * Run: node js/seedops.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");

function load(rel, windowStub) {
  var context = vm.createContext({
    window: windowStub,
    document: {
      addEventListener: function () {},
      dispatchEvent: function () {},
      readyState: "complete",
      querySelectorAll: function () { return []; },
      querySelector: function () { return null; },
      createElement: function () {
        return {
          className: "",
          setAttribute: function () {},
          appendChild: function () {},
          querySelector: function () { return null; },
          remove: function () {},
          addEventListener: function () {},
          style: {},
          removeAttribute: function () {},
        };
      },
      body: {
        appendChild: function () {},
      },
    },
    sessionStorage: {
      _d: {},
      getItem: function (k) { return this._d[k] || null; },
      setItem: function (k, v) { this._d[k] = String(v); },
      removeItem: function (k) { delete this._d[k]; },
    },
    localStorage: {
      _d: {},
      getItem: function (k) { return this._d[k] || null; },
      setItem: function (k, v) { this._d[k] = String(v); },
      removeItem: function (k) { delete this._d[k]; },
    },
    location: { hash: "", search: "", pathname: "/", href: "http://localhost/" },
    history: { replaceState: function () {} },
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    CustomEvent: function (name, init) {
      this.type = name;
      this.detail = (init && init.detail) || {};
    },
  });
  context.window = windowStub;
  context.window.document = context.document;
  context.window.sessionStorage = context.sessionStorage;
  context.window.localStorage = context.localStorage;
  context.window.location = context.location;
  context.window.history = context.history;
  context.window.addEventListener = function () {};
  context.document.body = context.document.body;
  vm.runInContext(fs.readFileSync(path.join(root, rel), "utf8"), context);
  return context.window;
}

var win = { CognationAccounts: null };
load("js/seedops-schema.js", win);
assert.strictEqual(win.CognationSeedOps.FLEET_SIZE, 1000);
var s0 = win.CognationSeedOps.buildSeedRecord(0);
assert.ok(s0.isSeed);
assert.strictEqual(s0.accountKind, "seed");
assert.ok(!/\d/.test(s0.displayName), "displayName must be plain first name");
assert.ok(!/\s/.test(s0.displayName), "displayName must be a single first name");
var fleet = win.CognationSeedOps.listSeedAccounts({ limit: 1000 });
assert.strictEqual(fleet.length, 1000);

load("js/seedops-friend-gate.js", win);
var gate = win.CognationSeedOpsFriendGate;
assert.ok(!gate.canFriend({ accountKind: "real" }, { accountKind: "seed" }).ok);
assert.ok(!gate.canFriend({ accountKind: "real" }, { accountKind: "ops" }).ok);
assert.ok(gate.canFriend({ accountKind: "real" }, { accountKind: "real" }).ok);
assert.ok(gate.canFriend({ accountKind: "seed" }, { accountKind: "seed" }).ok);
assert.ok(gate.canFriend({ accountKind: "seed" }, { accountKind: "ops" }).ok);

load("js/seedops-log.js", win);
load("js/seedops-news-log.js", win);
win.CognationSeedOpsNewsLog.onTowerPostsForNews(
  [{ id: "t1", authorName: "Maya", isSeed: true, seedFleetId: "seed-0042", likes: 2 }],
  "local"
);
assert.ok(win.CognationSeedOpsLog.list("news").length >= 1);

load("js/seedops-pathways.js", win);
var run = win.CognationSeedOpsPathways.run("circle", "seed-0001");
assert.strictEqual(run.pathway, "circle");
assert.ok(run.steps.length > 0);

/* --- #4 Tower seed posts --- */
win.CognationTowerStore = {
  _data: { version: 1, posts: [] },
  load: function () { return this._data; },
  save: function (data) { this._data = data; return true; },
  list: function () { return (this._data.posts || []).slice(); },
  add: function () { return { ok: false, error: "unused" }; },
};
load("js/seedops-tower-posts.js", win);
var towerPosts = win.CognationSeedOpsTowerPosts;
assert.strictEqual(towerPosts.WAVE1_MAX, 100);
assert.strictEqual(towerPosts.DEMO_CAP, 250);
var body = towerPosts.composeBody(win.CognationSeedOps.buildSeedRecord(0));
assert.ok(body.indexOf("Ada") !== -1, "body should use first name");
assert.ok(!/\d/.test(body.replace(/seedops/gi, "")), "visible body should stay first-name-safe");
assert.ok(!/instagram|reel|story highlight|follower count/i.test(body), "no Instagram copycat framing");

var one = towerPosts.postOne("seed-0001");
assert.ok(one.ok, "postOne seed-0001 should succeed");
assert.strictEqual(one.post.seedFleetId, "seed-0001");
assert.strictEqual(one.post.authorName, "Ada");
assert.ok(one.post.isSeed && one.post.seeded);
assert.ok(win.CognationSeedOpsLog.list("tower-posts").length >= 1);
assert.ok(win.CognationSeedOpsLog.list("news").length >= 1, "News path should log seeded post");

var wave = towerPosts.postWave({ offset: 0, limit: 100 });
assert.ok(wave.ok);
assert.strictEqual(wave.posted, 100);
assert.strictEqual(wave.limit, 100);

var clamped = towerPosts.clampWave({ offset: 200, limit: 100 });
assert.ok(clamped.ok);
assert.strictEqual(clamped.limit, 50, "wave must hard-stop at demo cap 250");
var past = towerPosts.postOne("seed-0251");
assert.ok(!past.ok);
assert.strictEqual(past.error, "past_demo_cap");
var refusedWave = towerPosts.clampWave({ offset: 250, limit: 10 });
assert.ok(!refusedWave.ok);

var towerSrc = fs.readFileSync(path.join(root, "js/seedops-tower-posts.js"), "utf8");
assert.ok(!(new RegExp("demo" + " unlock", "i").test(towerSrc)), "tower posts must not contain banned public-demo phrase");
assert.ok(towerSrc.indexOf("SEEDOPS_AUTH_PASSWORD") === -1, "no ops password in frontend");
assert.ok(towerSrc.indexOf("SERVICE_ROLE") === -1 && towerSrc.indexOf("service_role") === -1, "no service role in frontend");

/* --- #3 ops trigger --- */
win.CognationAuth = {
  getSession: function () {
    return {
      username: "ops-curator",
      activeProfileId: "prof-ops-curator",
    };
  },
};
win.CognationAccounts = {
  getProfileById: function (id) {
    if (id === "prof-ops-curator") {
      return win.CognationSeedOps.listOpsBots()[0];
    }
    if (id === "prof-real") {
      return { id: "prof-real", accountKind: "real", displayName: "Beta", handle: "beta" };
    }
    return null;
  },
};

load("js/seedops-ops-trigger.js", win);
var trigger = win.CognationSeedOpsTrigger;
assert.ok(trigger.isArmed(), "ops-curator session must arm");
assert.strictEqual(trigger.resolveOperator().seedFleetId, "ops-curator");
assert.ok(trigger.canActAs("seed-0001").ok, "ops may act-as Wave 1 seed for pathway context");
assert.ok(trigger.canActAs("ops-mod").ok, "ops may act-as another ops bot");
var refused = trigger.canActAs("beta-user");
assert.ok(!refused.ok, "real-user act-as must refuse");
assert.strictEqual(refused.error, "real_user_target_refused");

var kicked = trigger.triggerPathway("tower", "seed-0001");
assert.ok(kicked.ok, "pathway trigger should succeed");
assert.strictEqual(kicked.target, "seed-0001");
assert.ok(win.CognationSeedOpsLog.list("ops-trigger").length >= 1);

/* Real user must not arm */
win.CognationAuth.getSession = function () {
  return { username: "beta", activeProfileId: "prof-real" };
};
assert.ok(!trigger.isArmed(), "real user must not arm ops trigger");
var realKick = trigger.triggerPathway("tower", "seed-0001");
assert.ok(!realKick.ok);
assert.strictEqual(realKick.error, "not_armed");

/* Seed with seedops metadata may arm */
win.CognationAuth.getSession = function () {
  return { username: "seed-0001", activeProfileId: "prof-seed-0001" };
};
win.CognationAccounts.getProfileById = function (id) {
  if (id === "prof-seed-0001") return win.CognationSeedOps.buildSeedRecord(0);
  return null;
};
win.CognationSupabase = {
  getUser: function () {
    return {
      email: "seed-0001@seed.cognation.internal",
      app_metadata: { seedops: true, account_kind: "seed", seed_fleet_id: "seed-0001" },
    };
  },
};
assert.ok(trigger.isArmed(), "seed with seedops metadata must arm");
var seedKick = trigger.triggerPathway("circle", "seed-0002");
assert.ok(seedKick.ok);
assert.strictEqual(seedKick.target, "seed-0002");

/* Caps constants locked */
assert.strictEqual(trigger.WAVE1_MAX, 100);
assert.strictEqual(trigger.DEMO_CAP, 250);
assert.strictEqual(JSON.stringify(trigger.OPS_FLEET_IDS), JSON.stringify(["ops-curator", "ops-mod", "ops-wire"]));

/* Public markup still loads the module; banned public-demo phrase must stay absent */
var src = fs.readFileSync(path.join(root, "js/seedops-ops-trigger.js"), "utf8");
assert.ok(!(new RegExp("demo" + " unlock", "i").test(src)), "ops trigger must not contain banned public-demo phrase");
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(html.indexOf("js/seedops-ops-trigger.js") !== -1, "index.html must load ops trigger");
assert.ok(html.indexOf("js/seedops-tower-posts.js") !== -1, "index.html must load tower posts");
assert.ok(
  html.indexOf("js/seedops-tower-posts.js") < html.indexOf("js/seedops-ops-trigger.js"),
  "tower posts must load before ops trigger"
);

/* Re-arm ops and confirm tower pathway seeds a post */
win.CognationAuth.getSession = function () {
  return { username: "ops-curator", activeProfileId: "prof-ops-curator" };
};
win.CognationAccounts.getProfileById = function (id) {
  if (id === "prof-ops-curator") return win.CognationSeedOps.listOpsBots()[0];
  return null;
};
win.CognationSupabase = null;
assert.ok(trigger.isArmed());
var towerKick = trigger.triggerPathway("tower", "seed-0003");
assert.ok(towerKick.ok);
assert.ok(towerKick.towerSeed && towerKick.towerSeed.ok, "tower pathway should seed a post");
assert.strictEqual(towerKick.towerSeed.post.seedFleetId, "seed-0003");
var viaTrigger = trigger.postOne("seed-0004");
assert.ok(viaTrigger.ok);
var viaWave = trigger.postWave({ offset: 0, limit: 2 });
assert.ok(viaWave.ok);
assert.strictEqual(viaWave.posted, 2);

console.log("seedops.test.js: ok");

/* Commune-alive bootstrap: dating + chat rooms for seed sessions */
var aliveSrc = fs.readFileSync(path.join(root, "js/seedops-commune-alive.js"), "utf8");
assert.ok(!(new RegExp("demo" + " unlock", "i").test(aliveSrc)), "commune-alive must not contain banned public-demo phrase");
assert.ok(html.indexOf("js/seedops-commune-alive.js") !== -1, "index.html must load commune-alive");
assert.ok(
  html.indexOf("js/commune-swipe.js") < html.indexOf("js/seedops-commune-alive.js"),
  "commune-alive must load after commune-swipe"
);

var aliveWin = { CognationAccounts: null, CognationAuth: {}, CognationSeedOpsLog: { write: function () {} } };
load("js/seedops-schema.js", aliveWin);
aliveWin.CognationAccounts = {
  _p: {},
  saveProfileRecord: function (rec) {
    if (!rec || !rec.id) return false;
    this._p[rec.id] = rec;
    return true;
  },
  getProfileById: function (id) { return this._p[id] || null; },
};
var memberStore = { age: null, city: "", interests: "" };
aliveWin.CognationCommuneSwipe = {
  getMemberProfile: function () { return memberStore; },
  setMemberProfile: function (p) { memberStore = p || {}; return memberStore; },
  setSeeDating: function () {},
  sampleDeck: function () {
    return [
      { type: "fact", id: "f1" },
      { type: "wellness", id: "w1" },
      { type: "chatroom", id: "room-site-21", title: "21+" },
      { type: "dating", id: "date-x" },
    ];
  },
  rebuild: function () {},
  visibleSiteRooms: function () { return [{ id: "room-site-21", title: "21+" }]; },
  openRoom: function () { return true; },
};
aliveWin.CognationAuth.getSession = function () {
  return { username: "seed-0001", activeProfileId: "prof-seed-0001" };
};
/* load commune-alive into the same storage-backed context as schema */

/* --- Friction live hooks --- */
(function () {
  var listeners = [];
  var frictionWin = {
    CognationAccounts: win.CognationAccounts,
    CognationSeedOps: win.CognationSeedOps,
    CognationSeedOpsFriendGate: {
      viewerRecord: function () {
        return { accountKind: "real", isSeed: false, isOpsBot: false };
      },
    },
    CognationAuth: {
      getSession: function () {
        return { username: "real-beta", supabaseUserId: "real-1" };
      },
    },
  };
  var frictionDoc = {
    readyState: "complete",
    visibilityState: "visible",
    addEventListener: function (name, fn) {
      listeners.push({ name: name, fn: fn });
    },
    dispatchEvent: function (ev) {
      listeners.forEach(function (L) {
        if (L.name === ev.type) L.fn(ev);
      });
      return true;
    },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    createElement: function () {
      return { setAttribute: function () {}, appendChild: function () {}, style: {}, addEventListener: function () {} };
    },
    body: { appendChild: function () {} },
  };
  var ctx = vm.createContext({
    window: frictionWin,
    document: frictionDoc,
    sessionStorage: {
      _d: {},
      getItem: function (k) { return this._d[k] || null; },
      setItem: function (k, v) { this._d[k] = String(v); },
      removeItem: function (k) { delete this._d[k]; },
    },
    localStorage: {
      _d: {},
      getItem: function (k) { return this._d[k] || null; },
      setItem: function (k, v) { this._d[k] = String(v); },
      removeItem: function (k) { delete this._d[k]; },
    },
    console: console,
    setTimeout: function () { return 0; },
    clearTimeout: function () {},
    CustomEvent: function (name, init) {
      this.type = name;
      this.detail = (init && init.detail) || {};
    },
    Date: Date,
    Math: Math,
    String: String,
    Object: Object,
    Array: Array,
    JSON: JSON,
  });
  frictionWin.document = frictionDoc;
  frictionWin.sessionStorage = ctx.sessionStorage;
  ctx.window = frictionWin;
  vm.runInContext(fs.readFileSync(path.join(root, "js/seedops-log.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "js/seedops-friction.js"), "utf8"), ctx);
  var F = frictionWin.CognationFriction;
  assert.ok(F, "CognationFriction exports");
  assert.ok(F.PATHWAYS.indexOf("classroom") >= 0);
  assert.strictEqual(F.pathwayFromCardType("speed-dating"), "dating");
  assert.strictEqual(F.pathwayFromCardType("chatroom"), "chat");
  assert.strictEqual(F.pathwayFromCardType("ad"), "ad");

  frictionWin.CognationSeedOpsLog.clear();
  F.begin("tower", "tower-compose");
  F.retry("tower", "post_error");
  F.complete("tower");
  var rows = frictionWin.CognationSeedOpsLog.list("friction").map(function (e) { return e.payload; });
  assert.ok(rows.length >= 3, "real user emits start/retry/complete");
  assert.strictEqual(rows[0].pathway, "tower");
  assert.strictEqual(rows[0].phase, "start");
  assert.strictEqual(rows[0].userKind, "real");
  assert.strictEqual(rows[0].surface, "tower-compose");
  assert.ok(rows.some(function (r) { return r.phase === "retry" && r.reason === "post_error"; }));
  assert.ok(rows.some(function (r) { return r.phase === "complete"; }));

  frictionWin.CognationSeedOpsLog.clear();
  F.begin("dating", "commune-swipe");
  F.abandon("dating", "swipe_left");
  var abandoned = frictionWin.CognationSeedOpsLog.list("friction").map(function (e) { return e.payload; });
  assert.ok(abandoned.some(function (r) { return r.phase === "abandon" && r.reason === "swipe_left"; }));

  /* seed/ops skipped */
  frictionWin.CognationSeedOpsFriendGate.viewerRecord = function () {
    return { accountKind: "seed", isSeed: true, seedFleetId: "seed-0001" };
  };
  frictionWin.CognationSeedOpsLog.clear();
  assert.strictEqual(F.begin("commune", "commune-swipe"), null);
  assert.strictEqual(frictionWin.CognationSeedOpsLog.list("friction").length, 0, "seed fleet skipped");

  frictionWin.CognationSeedOpsFriendGate.viewerRecord = function () {
    return { accountKind: "ops", isOpsBot: true };
  };
  assert.strictEqual(F.retry("news", "publish_error"), null);
  assert.strictEqual(frictionWin.CognationSeedOpsLog.list("friction").length, 0, "ops skipped");

  /* wireUi registers tab-change + friction + click + visibility listeners */
  var names = listeners.map(function (L) { return L.name; });
  assert.ok(names.indexOf("cognation:tab-change") >= 0, "tab-change listener");
  assert.ok(names.indexOf("cognation:friction") >= 0, "friction event bridge");
  assert.ok(names.indexOf("click") >= 0, "click live hooks");
  assert.ok(names.indexOf("visibilitychange") >= 0, "visibility abandon");

  /* static: pathway modules call CognationFriction */
  function src(rel) {
    return fs.readFileSync(path.join(root, rel), "utf8");
  }
  assert.ok(src("js/tabs.js").indexOf("cognation:tab-change") !== -1, "tabs dispatch tab-change");
  assert.ok(src("js/tower.js").indexOf("CognationFriction") !== -1, "tower friction hooks");
  assert.ok(src("js/commune.js").indexOf("CognationFriction") !== -1, "news friction hooks");
  assert.ok(src("js/commune-swipe.js").indexOf("CognationFriction") !== -1, "commune-swipe friction hooks");
  assert.ok(src("docs/seedops.md").indexOf("Live hooks (wired)") !== -1, "docs note live hooks");
  console.log("seedops.test.js friction: ok");
})();

(function () {
  var context = vm.createContext({
    window: aliveWin,
    document: {
      addEventListener: function () {},
      dispatchEvent: function () {},
      readyState: "complete",
      querySelector: function () { return null; },
    },
    sessionStorage: {
      _d: {},
      getItem: function (k) { return this._d[k] || null; },
      setItem: function (k, v) { this._d[k] = String(v); },
      removeItem: function (k) { delete this._d[k]; },
    },
    localStorage: {
      _d: {},
      getItem: function (k) { return this._d[k] || null; },
      setItem: function (k, v) { this._d[k] = String(v); },
      removeItem: function (k) { delete this._d[k]; },
    },
    console: console,
    setTimeout: function (fn) { /* run sync for tests */ if (typeof fn === "function") fn(); return 0; },
    CustomEvent: function (name, init) {
      this.type = name;
      this.detail = (init && init.detail) || {};
    },
    encodeURIComponent: encodeURIComponent,
    Math: Math,
    Number: Number,
    String: String,
    Object: Object,
    Array: Array,
    Date: Date,
    parseInt: parseInt,
  });
  aliveWin.document = context.document;
  aliveWin.sessionStorage = context.sessionStorage;
  aliveWin.localStorage = context.localStorage;
  context.window = aliveWin;
  vm.runInContext(aliveSrc, context);
})();
var alive = aliveWin.CognationSeedOpsCommuneAlive;
assert.ok(alive, "CognationSeedOpsCommuneAlive exports");
assert.strictEqual(alive.DEMO_AGE, 28);
assert.strictEqual(alive.DEMO_CITY, "Demo City");
assert.ok(alive.isSeedOrOpsSession());
var boot = alive.bootstrap({ force: true, count: 12 });
assert.ok(boot.ok, "bootstrap ok: " + JSON.stringify(boot));
assert.strictEqual(boot.memberAge, 28);
assert.strictEqual(boot.memberCity, "Demo City");
assert.ok(boot.materialized >= 12, "materialized dating sample");
assert.ok(boot.datingProfiles >= 12, "dating profiles flagged");
var sample = aliveWin.CognationAccounts.getProfileById("prof-seed-0002");
assert.ok(sample && sample.datingContent, "seed dating opt-in");
assert.ok(sample.avatarDataUrl && sample.avatarDataUrl.indexOf("data:image/svg") === 0, "svg avatar");
assert.strictEqual(sample.city, "Demo City");

console.log("seedops.test.js: commune-alive ok");

/* Classroom pathway — first-class surface (not deferred) */
assert.ok(html.indexOf('id="panel-classroom"') !== -1, "index.html must include #panel-classroom");
assert.ok(html.indexOf("data-classroom") !== -1, "index.html must include data-classroom");
assert.ok(html.indexOf("data-commune-enter-classroom") !== -1 || html.indexOf("data-classroom-back") !== -1, "classroom panel chrome present");
var classPanel = {
  hidden: false,
  querySelector: function () { return { textContent: "" }; },
  closest: function () { return null; },
  parentElement: null,
};
win.document = {
  querySelector: function (sel) {
    var s = String(sel || "");
    if (
      s.indexOf("panel-classroom") !== -1 ||
      s.indexOf("data-classroom") !== -1 ||
      s.indexOf("data-card-type='classroom'") !== -1 ||
      s.indexOf('data-card-type="classroom"') !== -1 ||
      s.indexOf("data-commune-classroom") !== -1
    ) {
      return classPanel;
    }
    return null;
  },
  dispatchEvent: function () {},
  addEventListener: function () {},
};
win.CognationCommuneSwipe = {
  _age: 28,
  _open: "",
  getMemberAge: function () { return this._age; },
  getMemberProfile: function () { return { age: this._age }; },
  setMemberProfile: function (p) {
    if (p && p.age != null) this._age = parseInt(p.age, 10) || 28;
  },
  classroomCatalog: function () {
    return [
      { id: "class-insurance", type: "classroom", title: "Insurance basics", minAge: 18, host: "Cognation" },
      { id: "class-voting", type: "classroom", title: "Voting", minAge: 18, host: "Cognation" },
      { id: "class-business", type: "classroom", title: "Business", minAge: 18, host: "Cognation" },
    ];
  },
  openClassroom: function (id) { this._open = id; return true; },
  closeClassroom: function () { this._open = ""; },
};
var classRun = win.CognationSeedOpsPathways.run("classroom", "seed-0001");
assert.ok(classRun.ok, "classroom pathway summary ok");
assert.strictEqual(classRun.pathway, "classroom");
classRun.steps.forEach(function (step) {
  assert.strictEqual(step.status, "ok", "classroom step " + step.step + " status");
  assert.notStrictEqual(step.status, "deferred_surface_missing");
});
console.log("seedops.test.js: classroom pathway ok");

/* Dating server→client hydrate */
var hydrateSrc = fs.readFileSync(path.join(root, "js/seedops-dating-hydrate.js"), "utf8");
assert.ok(!(new RegExp("demo" + " unlock", "i").test(hydrateSrc)), "dating-hydrate must not contain banned public-demo phrase");
assert.ok(html.indexOf("js/seedops-dating-hydrate.js") !== -1, "index.html must load dating-hydrate");
var swipeSrcForDating = fs.readFileSync(path.join(root, "js/commune-swipe.js"), "utf8");
assert.ok(swipeSrcForDating.indexOf("ensureDatingBiosThenRebuild") !== -1, "toggle into Dating rehydrates bios");
assert.ok(swipeSrcForDating.indexOf("Loading dating cards") !== -1, "toggle shows loading status while hydrating");
assert.ok(swipeSrcForDating.indexOf('String(rec.bio || "").trim()') !== -1, "datingCardFrom trims bios");
var aliveSrc = fs.readFileSync(path.join(root, "js/seedops-commune-alive.js"), "utf8");
assert.ok(aliveSrc.indexOf("datingBiosReady") !== -1, "commune-alive validates dating bios on cache hit");

assert.ok(
  html.indexOf("js/seedops-commune-alive.js") < html.indexOf("js/seedops-dating-hydrate.js"),
  "dating-hydrate must load after commune-alive"
);
assert.ok(fs.readFileSync(path.join(root, "js/supabase-client.js"), "utf8").indexOf("updateUser") !== -1, "supabase-client exports updateUser");

var hydrateWin = {
  CognationAccounts: {
    _p: {},
    saveProfileRecord: function (rec) {
      if (!rec || !rec.id) return false;
      this._p[rec.id] = rec;
      return true;
    },
    getProfileById: function (id) { return this._p[id] || null; },
  },
  CognationAuth: {
    getSession: function () {
      return { username: "seed-0001", seedFleetId: "seed-0001", activeProfileId: "prof-seed-0001" };
    },
  },
  CognationSeedOpsLog: { write: function () {} },
  CognationSupabase: {
    configured: function () { return true; },
    getSession: function () { return { access_token: "test" }; },
    getUser: function () {
      return Promise.resolve({
        user_metadata: {
          see_dating: true,
          member_age: 29,
          member_city: "Demo City",
          member_state: "Demo",
          member_country: "United States",
          member_interests: ["tech", "jobs"],
        },
      });
    },
    updateUser: function (data) {
      hydrateWin.__lastUpdateUser = data;
      return Promise.resolve({ user_metadata: data });
    },
    rest: function () {
      return Promise.resolve([
        {
          id: "srv-2",
          seed_fleet_id: "seed-0002",
          display_name: "Aisha",
          bio: "Weekend farmer-market regular. Dogs welcome.",
          account_kind: "seed",
        },
        {
          id: "srv-3",
          seed_fleet_id: "seed-0003",
          display_name: "Alex",
          bio: "Board games, soft playlists, early nights.",
          account_kind: "seed",
        },
      ]);
    },
  },
};
var hydrateMember = { age: null, city: "" };
var hydrateSee = false;
hydrateWin.CognationCommuneSwipe = {
  getMemberProfile: function () { return hydrateMember; },
  setMemberProfile: function (p) { hydrateMember = p || {}; return hydrateMember; },
  getSeeDating: function () { return hydrateSee; },
  setSeeDating: function (on) { hydrateSee = !!on; },
  getMemberAge: function () { return parseInt(hydrateMember.age, 10) || null; },
  rebuild: function () { hydrateWin.__rebuilt = true; },
};
(function () {
  var context = vm.createContext({
    window: hydrateWin,
    document: {
      addEventListener: function () {},
      dispatchEvent: function () {},
      readyState: "complete",
      querySelector: function () { return null; },
    },
    sessionStorage: {
      _d: {},
      getItem: function (k) { return this._d[k] || null; },
      setItem: function (k, v) { this._d[k] = String(v); },
      removeItem: function (k) { delete this._d[k]; },
    },
    localStorage: {
      _d: {},
      getItem: function (k) { return this._d[k] || null; },
      setItem: function (k, v) { this._d[k] = String(v); },
      removeItem: function (k) { delete this._d[k]; },
    },
    console: console,
    setTimeout: function (fn) { if (typeof fn === "function") fn(); return 0; },
    clearTimeout: function () {},
    CustomEvent: function (name, init) {
      this.type = name;
      this.detail = (init && init.detail) || {};
    },
    encodeURIComponent: encodeURIComponent,
    Promise: Promise,
    Math: Math,
    Number: Number,
    String: String,
    Object: Object,
    Array: Array,
    Date: Date,
    parseInt: parseInt,
    JSON: JSON,
  });
  hydrateWin.document = context.document;
  hydrateWin.sessionStorage = context.sessionStorage;
  hydrateWin.localStorage = context.localStorage;
  context.window = hydrateWin;
  vm.runInContext(fs.readFileSync(path.join(root, "js/seedops-schema.js"), "utf8"), context);
  vm.runInContext(hydrateSrc, context);
  var api = hydrateWin.CognationSeedOpsDatingHydrate;
  assert.ok(api, "CognationSeedOpsDatingHydrate exports");
  assert.strictEqual(api.HARD_CAP, 250);
  assert.ok(api.isSeedOrOpsSession(), "seed session detected");
  var fromMeta = api.prefsFromMetadata({
    see_dating: true,
    member_age: 29,
    member_city: "Demo City",
  });
  assert.strictEqual(fromMeta.seeDating, true);
  assert.strictEqual(fromMeta.age, 29);
  var merged = api.mergeServerBios([
    {
      id: "srv-2",
      seed_fleet_id: "seed-0002",
      display_name: "Aisha",
      bio: "Weekend farmer-market regular. Dogs welcome.",
    },
  ]);
  assert.ok(merged.ok && merged.merged === 1, "merge bios");
  var rec = hydrateWin.CognationAccounts.getProfileById("prof-seed-0002");
  assert.ok(rec && rec.datingContent, "dating opt-in after merge");
  assert.strictEqual(rec.bio, "Weekend farmer-market regular. Dogs welcome.");
  assert.ok(rec.avatarDataUrl && rec.avatarDataUrl.indexOf("data:image/svg") === 0, "svg avatar");
  assert.ok(typeof api.datingBiosReady === "function", "datingBiosReady export");
  assert.ok(typeof api.ensureDatingContent === "function", "ensureDatingContent export");
  assert.ok(api.datingBiosReady(1), "bios ready after merge");
  assert.ok(hydrateSrc.indexOf("blank Card 1") !== -1 || hydrateSrc.indexOf("datingBiosReady") !== -1, "blank-card guard present");
  assert.ok(hydrateSrc.indexOf("seeDating before setMemberProfile") !== -1, "seeDating applied before member rebuild");

  /* Stale cache with wiped profiles must re-merge (blank dating Card 1 path). */
  hydrateWin.CognationAccounts._p = {};
  context.sessionStorage.setItem(
    "cognation.seedops.datingHydrate.v1",
    JSON.stringify({
      ok: true,
      memberAge: 29,
      seeDating: true,
      merged: 79,
      dating: 79,
      seedish: true,
      at: "stale",
    })
  );
  assert.ok(!api.datingBiosReady(1), "bios not ready after wipe");

  api.hydrate({ force: false }).then(function (staleOut) {
    assert.ok(staleOut && staleOut.ok, "stale cache rehydrate ok " + JSON.stringify(staleOut));
    assert.ok(!staleOut.cached, "stale cache must not short-circuit");
    var revived = hydrateWin.CognationAccounts.getProfileById("prof-seed-0002");
    assert.ok(revived && revived.datingContent, "dating opt-in revived");
    assert.ok(String(revived.bio || "").trim().length > 0, "dating Card 1 bio revived");
    return api.ensureDatingContent({ minCount: 1 });
  }).then(function (ensured) {
    assert.ok(ensured && (ensured.ok || ensured.ready), "ensureDatingContent ok");
    return api.hydrate({ force: true });
  }).then(function (out) {
    assert.ok(out && out.ok, "hydrate ok " + JSON.stringify(out));
    assert.strictEqual(hydrateSee, true, "seeDating hydrated");
    assert.strictEqual(hydrateMember.age, 29, "age from metadata");
    assert.ok(hydrateWin.__lastUpdateUser && hydrateWin.__lastUpdateUser.see_dating === true, "persisted prefs");
    console.log("seedops.test.js dating-hydrate: ok");
  }).catch(function (err) {
    console.error(err);
    process.exitCode = 1;
  });
})();

/* Tower seed hydrate-from-existing + read-only gates */
var towerHydrateSrc = fs.readFileSync(path.join(root, "js/seedops-tower-hydrate.js"), "utf8");
assert.ok(!(new RegExp("demo" + " unlock", "i").test(towerHydrateSrc)), "tower-hydrate must not contain banned public-demo phrase");
assert.ok(html.indexOf("js/seedops-tower-hydrate.js") !== -1, "index.html must load tower-hydrate");
assert.ok(
  html.indexOf("js/seedops-dating-hydrate.js") < html.indexOf("js/seedops-tower-hydrate.js"),
  "tower-hydrate must load after dating-hydrate"
);
assert.ok(towerHydrateSrc.indexOf("HARD_CAP = 250") !== -1, "tower-hydrate hard cap 250");
assert.ok(towerHydrateSrc.indexOf("firstNameOnly") !== -1, "tower-hydrate first-name helper");
assert.ok(towerHydrateSrc.indexOf("featuredFriendIds") !== -1, "tower-hydrate maps top friends");
assert.ok(towerHydrateSrc.indexOf("fillEmptyShells") !== -1, "content gen only for empty shells");

var towerJs = fs.readFileSync(path.join(root, "js/tower.js"), "utf8");
assert.ok(towerJs.indexOf("profile._directoryFriend) return false") !== -1, "isTowerOwner rejects directory friends");
assert.ok(towerJs.indexOf("syncViewerMutateUi") !== -1, "viewer mutate UI sync");
assert.ok(towerJs.indexOf("Only the profile owner can add Polaroids") !== -1, "instax owner guard");
assert.ok(towerJs.indexOf("viewingOther") !== -1, "no legacy polaroid paint onto others");
var towerCss = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
assert.ok(
  towerCss.indexOf('[data-tower-app]:not([data-tower-is-owner="true"]) [data-tower-widget="instax"]') !== -1,
  "CSS hides instax for non-owners"
);

(function () {
  var thWin = {
    CognationAccounts: {
      _p: {},
      saveProfileRecord: function (rec) {
        if (!rec || !rec.id) return false;
        this._p[rec.id] = rec;
        return true;
      },
      getProfileById: function (id) { return this._p[id] || null; },
    },
    CognationAuth: {
      getSession: function () {
        return { username: "seed-0001", seedFleetId: "seed-0001", supabaseUserId: "uid-1", activeProfileId: "prof-seed-0001" };
      },
    },
    CognationSeedOpsLog: { write: function () {} },
    CognationTowerStore: {
      _data: { version: 1, posts: [] },
      load: function () { return this._data; },
      setRemotePosts: function (posts) {
        this._data = { version: 2, remote: true, posts: posts.slice() };
        return this._data.posts;
      },
    },
    CognationSeedOpsTowerPosts: {
      postOne: function (fleetId) {
        thWin.__generated = (thWin.__generated || 0) + 1;
        return { ok: true, path: "test", post: { id: "gen-" + fleetId, seedFleetId: fleetId } };
      },
    },
    CognationSupabase: {
      configured: function () { return true; },
      rest: function (table, opts) {
        var q = (opts && opts.query) || "";
        if (table === "profiles") {
          return Promise.resolve([
            {
              id: "srv-t1",
              user_id: "uid-1",
              seed_fleet_id: "seed-0001",
              handle: "seed-ada-0001",
              display_name: "Ada Lovelace",
              bio: "Quiet mornings.",
              account_kind: "seed",
              kind: "personal",
            },
            {
              id: "srv-t2",
              user_id: "uid-2",
              seed_fleet_id: "seed-0002",
              handle: "seed-aisha-0002",
              display_name: "Aisha",
              bio: "",
              account_kind: "seed",
              kind: "personal",
            },
          ]);
        }
        if (table === "friendships") {
          return Promise.resolve([
            { user_id: "uid-1", friend_user_id: "uid-2", created_at: "2026-10-01T00:00:00Z" },
          ]);
        }
        if (table === "tower_posts") {
          return Promise.resolve([
            {
              id: "tp-1",
              author_profile_id: "srv-t1",
              body: "Ada took a slow morning walk.",
              visibility: "public",
              attachments: [],
              created_at: "2026-10-01T12:00:00Z",
              author: {
                id: "srv-t1",
                user_id: "uid-1",
                handle: "seed-ada-0001",
                display_name: "Ada",
                account_kind: "seed",
                seed_fleet_id: "seed-0001",
                kind: "personal",
              },
            },
          ]);
        }
        return Promise.resolve([]);
      },
    },
  };
  var thCtx = vm.createContext({
    window: thWin,
    document: {
      addEventListener: function () {},
      dispatchEvent: function () {},
      readyState: "complete",
      querySelector: function () { return null; },
    },
    sessionStorage: {
      _d: {},
      getItem: function (k) { return this._d[k] || null; },
      setItem: function (k, v) { this._d[k] = String(v); },
      removeItem: function (k) { delete this._d[k]; },
    },
    localStorage: {
      _d: {},
      getItem: function (k) { return this._d[k] || null; },
      setItem: function (k, v) { this._d[k] = String(v); },
      removeItem: function (k) { delete this._d[k]; },
    },
    console: console,
    setTimeout: function (fn) { return 0; },
    clearTimeout: function () {},
    CustomEvent: function (name, init) {
      this.type = name;
      this.detail = (init && init.detail) || {};
    },
    encodeURIComponent: encodeURIComponent,
    Promise: Promise,
    Math: Math,
    Number: Number,
    String: String,
    Object: Object,
    Array: Array,
    Date: Date,
    parseInt: parseInt,
    JSON: JSON,
  });
  thWin.document = thCtx.document;
  thWin.sessionStorage = thCtx.sessionStorage;
  thWin.localStorage = thCtx.localStorage;
  thCtx.window = thWin;
  vm.runInContext(fs.readFileSync(path.join(root, "js/seedops-schema.js"), "utf8"), thCtx);
  vm.runInContext(towerHydrateSrc, thCtx);
  var thApi = thWin.CognationSeedOpsTowerHydrate;
  assert.ok(thApi, "CognationSeedOpsTowerHydrate exports");
  assert.strictEqual(thApi.HARD_CAP, 250);
  assert.strictEqual(thApi.firstNameOnly("Ada Lovelace"), "Ada");
  assert.strictEqual(thApi.firstNameOnly("Maya42"), "Maya");
  thApi.hydrate({ force: true, fillEmpty: true }).then(function (out) {
    assert.ok(out && out.ok, "tower hydrate ok " + JSON.stringify(out));
    assert.ok(out.merged >= 2, "merged seed profiles");
    var ada = thWin.CognationAccounts.getProfileById("prof-seed-0001");
    assert.ok(ada, "ada materialized");
    assert.strictEqual(ada.displayName, "Ada", "first-name only");
    assert.ok(Array.isArray(ada.featuredFriendIds) && ada.featuredFriendIds.length >= 1, "top friends from friendship");
    assert.ok(out.posts >= 1, "tower posts applied");
    /* seed-0002 had no posts → content gen fills empty shell */
    assert.ok(out.generated >= 1 || (thWin.__generated || 0) >= 1, "empty shell content gen");
    console.log("seedops.test.js tower-hydrate: ok");
  }).catch(function (err) {
    console.error(err);
    process.exitCode = 1;
  });
})();
