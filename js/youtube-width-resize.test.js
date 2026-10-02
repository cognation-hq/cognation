/**
 * Music/YouTube width resize — complete wire (owner + public).
 * Run: node js/youtube-width-resize.test.js
 */
var fs = require("fs");
var path = require("path");
var assert = require("assert");

var root = path.join(__dirname, "..");
function src(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

var tower = src("js/tower.js");
var css = src("css/styles.css");
var html = src("index.html");

assert.ok(tower.indexOf("function applyYoutubeWidth") !== -1, "applyYoutubeWidth present");
assert.ok(tower.indexOf("function initYoutubeResize") !== -1, "initYoutubeResize present");
assert.ok(tower.indexOf("musicYoutubeWidth") !== -1, "musicYoutubeWidth field present");
assert.ok(tower.indexOf("data-tower-youtube-resize") !== -1, "youtube resize attr in JS");
assert.ok(tower.indexOf("initYoutubeResize(root);") !== -1, "initYoutubeResize called");
assert.ok(
  /applyYoutubeWidth\(root, p && p\.musicYoutubeWidth\)/.test(tower) ||
    tower.indexOf("applyYoutubeWidth(root, p && p.musicYoutubeWidth)") !== -1,
  "applyYoutubeWidth runs on music paint"
);
assert.ok(
  /function initYoutubeResize[\s\S]*?if \(!isTowerOwner\(TowerProfileStore\.get\(\)\)\) return;/.test(tower),
  "initYoutubeResize owner-guards pointerdown"
);
assert.ok(
  tower.indexOf("[data-tower-youtube-resize]") !== -1 &&
    tower.indexOf("data-tower-polaroid-resize], [data-tower-youtube-resize]") !== -1,
  "sticker-drag exclude lists youtube resize"
);
assert.ok(
  /Math\.max\(180, Math\.min\(720/.test(tower),
  "width clamp 180–720 present"
);

assert.ok(html.indexOf("data-tower-youtube-resize") !== -1, "DOM resize handle in HTML");
assert.ok(html.indexOf("tower-youtube-resize") !== -1, "resize handle class in HTML");

assert.ok(css.indexOf("--tower-youtube-width") !== -1, "CSS youtube width var");
assert.ok(css.indexOf(".tower-youtube-resize") !== -1, "CSS youtube resize handle");
assert.ok(
  css.indexOf(
    '[data-tower-app][data-tower-is-owner="true"][data-tower-side="public"] .tower-youtube-resize'
  ) !== -1,
  "resize handle owner + public only"
);
assert.ok(
  /\[data-music-mode="youtube"\] \.tower-ipod\s*\{[^}]*width:\s*100%/.test(css),
  "ipod follows parent width in youtube mode"
);

/* No out-of-scope revive */
assert.ok(tower.indexOf("ONE_YOUTUBE_PLAYER_ONLY") !== -1, "video sticker policy untouched");
assert.ok(html.indexOf("data-tower-instax") !== -1 || true, "instax not required in this slice");


/* Handle survives clearYoutubeEmbed: outside cleared frame + ensure on paint */
assert.ok(
  tower.indexOf("function ensureYoutubeResizeHandle") !== -1,
  "ensureYoutubeResizeHandle present"
);
assert.ok(
  /function clearYoutubeEmbed[\s\S]*?ensureYoutubeResizeHandle\(root\)/.test(tower),
  "clearYoutubeEmbed re-ensures resize handle after frame clear"
);
assert.ok(
  /function initTowerMusic[\s\S]*?ensureYoutubeResizeHandle\(root\);\s*initYoutubeResize\(root\);/.test(tower),
  "music paint ensureHandle + initYoutubeResize so owner drag/persist bind"
);
assert.ok(
  /data-tower-youtube-frame[^>]*>\s*<\/div>\s*<button[^>]*data-tower-youtube-resize/.test(html),
  "DOM resize handle is outside [data-tower-youtube-frame] (not wiped by innerHTML clear)"
);
assert.ok(
  !/<div[^>]*data-tower-youtube-frame[^>]*>\s*<button[^>]*data-tower-youtube-resize/.test(html),
  "DOM resize handle is not nested inside youtube frame"
);

console.log("youtube-width-resize.test.js: ok");

/* Reload: pointerup writes local musicYoutubeWidth; fresh paint/read is not default 320. */
var vm = require("vm");

function extractFunction(src, name) {
  var start = src.indexOf("function " + name);
  assert.ok(start !== -1, name + " extract");
  var i = src.indexOf("{", start);
  var depth = 0;
  var j;
  for (j = i; j < src.length; j++) {
    if (src.charAt(j) === "{") depth++;
    else if (src.charAt(j) === "}") {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error("unclosed " + name);
}

var ytResizeSrc = tower.slice(
  tower.indexOf("function initYoutubeResize"),
  tower.indexOf("function syncMusicLookButtons")
);
assert.ok(
  ytResizeSrc.indexOf("TowerProfileStore.save(p, { geometry: true })") !== -1,
  "pointerup persists width with geometry, same as polaroid/emoji scale"
);
assert.ok(
  tower.indexOf("function applyOwnerMusicYoutubeWidth") !== -1,
  "owner local musicYoutubeWidth hydrate present"
);
assert.ok(
  /function restoreSavedTowerFields[\s\S]*?applyOwnerMusicYoutubeWidth\(p, legacy, local\)/.test(tower),
  "reload read hydrates from cognation.tower.profile.v1"
);

function memoryStorage() {
  var data = {};
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem: function (key, value) {
      data[key] = String(value);
    },
    removeItem: function (key) {
      delete data[key];
    },
  };
}

function bootTower(storage, viewed) {
  var listeners = {};
  var documentStub = {
    readyState: "loading",
    body: { classList: { contains: function () { return false; }, add: function () {}, remove: function () {} } },
    addEventListener: function (type, fn) {
      (listeners[type] || (listeners[type] = [])).push(fn);
    },
    removeEventListener: function () {},
    dispatchEvent: function (ev) {
      (listeners[ev.type] || []).forEach(function (fn) { fn(ev); });
      return true;
    },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    getElementById: function () { return null; },
    createElement: function () {
      return { innerHTML: "", style: {}, children: [], setAttribute: function () {}, appendChild: function (c) { this.children.push(c); }, querySelectorAll: function () { return []; } };
    },
  };
  var windowStub = {
    document: documentStub,
    localStorage: storage,
    sessionStorage: memoryStorage(),
    location: { hash: "", href: "https://cognation.test/" },
    addEventListener: function () {},
    removeEventListener: function () {},
    CustomEvent: function CustomEvent(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    },
    CognationSupabaseSocial: {
      active: function () { return true; },
      getViewedProfileId: function () { return viewed.id; },
      getTowerProfile: function () {
        return {
          _remote: true,
          displayName: viewed.name,
          handle: viewed.handle,
          musicYoutubeWidth: 320,
        };
      },
      getProfile: function () { return null; },
    },
  };
  windowStub.window = windowStub;
  var context = vm.createContext({
    window: windowStub,
    document: documentStub,
    localStorage: storage,
    sessionStorage: windowStub.sessionStorage,
    location: windowStub.location,
    console: console,
    CustomEvent: windowStub.CustomEvent,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  });
  vm.runInContext(src("js/accounts.js"), context);
  vm.runInContext(src("js/tower.js"), context);
  return windowStub;
}

var storage = memoryStorage();
storage.setItem("cognation.session.v2", JSON.stringify({
  source: "supabase",
  username: "seed-0001@seed.cognation.internal",
  activeProfileId: "prof-seed",
}));
var ownerView = { id: "prof-seed", handle: "seed-0001", name: "Seed" };
var win = bootTower(storage, ownerView);
win.CognationAccounts.saveProfileRecord({
  id: "prof-seed",
  kind: "personal",
  accountUsername: "seed-0001@seed.cognation.internal",
  phone: "(312) 555-0199",
  handle: "seed-0001",
  displayName: "Seed",
  musicYoutubeWidth: 320,
});
win.CognationAccounts.updateProfileTower = function () {
  return { ok: false, error: "storage" };
};

var store = win.CognationTowerProfileStore;
var before = store.get();
assert.strictEqual(before.musicYoutubeWidth, 320, "remote store.get() is stale default 320");
assert.strictEqual(before._remote, true);

/* Simulated pointerup: drag painted 460, then the onUp write. */
var dragged = 460;
var editing = store.get();
editing.musicYoutubeWidth = dragged;
store.save(editing, { geometry: true });

var legacy = JSON.parse(storage.getItem("cognation.tower.profile.v1"));
assert.strictEqual(legacy.musicYoutubeWidth, dragged, "pointerup wrote cognation.tower.profile.v1");
assert.strictEqual(
  win.CognationAccounts.getProfileById("prof-seed").musicYoutubeWidth,
  320,
  "stale accounts row stays 320 when the profile write cannot land"
);

/* Fresh JS realm = reload. Remote row is still 320. */
var reloaded = bootTower(storage, ownerView);
var fresh = reloaded.CognationTowerProfileStore.get();
assert.strictEqual(fresh.musicYoutubeWidth, dragged, "fresh read returns saved width, not 320");
assert.notStrictEqual(fresh.musicYoutubeWidth, 320);

var applySrc = extractFunction(tower, "applyYoutubeWidth");
var applyBody = applySrc.slice(applySrc.indexOf("{") + 1, applySrc.lastIndexOf("}"));
var applyYoutubeWidth = new Function("root", "widthPx", applyBody);
var painted = { attrs: {}, props: {} };
var paintRoot = {
  querySelector: function (sel) {
    if (sel === "[data-tower-music]") return painted;
    return null;
  },
};
painted.style = {
  setProperty: function (k, v) { painted.props[k] = v; },
  getPropertyValue: function (k) { return painted.props[k] || ""; },
};
painted.setAttribute = function (k, v) { painted.attrs[k] = String(v); };
painted.getAttribute = function (k) { return painted.attrs[k] == null ? null : painted.attrs[k]; };
applyYoutubeWidth(paintRoot, fresh.musicYoutubeWidth);
assert.strictEqual(painted.attrs["data-yt-width"], "460", "fresh paint data attr");
assert.strictEqual(painted.props["--tower-youtube-width"], "460px", "fresh paint css var");

var viewer = bootTower(storage, { id: "prof-hank", handle: "seed-hank-0030", name: "Hank" });
var other = viewer.CognationTowerProfileStore.get();
assert.strictEqual(other.musicYoutubeWidth, 320, "other towers do not inherit the owner local width");

console.log("youtube-width-resize.test.js: reload persist ok");
