/**
 * Emoji Rotate keeps the grid (emoji-rotate-no-lift, #323 / #329 rule: whatever
 * you touch is the only thing that changes).
 *  On e559e46 a Rotate on an emoji sticker over the default grid went through
 *  persistSelectedTilt -> freezeSpawnedWidgets -> liftDefaultGrid: the whole
 *  page left the grid and every widget was frozen into the saved row, although
 *  only the emoji was touched. Now the emoji's tilt is saved on its own layout
 *  entry (widgetLayout[emojiId].tilt, the field renderEmojiStickers already
 *  reads), the grid stays, and nothing else is written.
 *  Also: a rotated emoji has no tile (transparent, no border/shadow), and the
 *  emoji resize grip shows only on the selected sticker.
 *
 * Same tiny fake DOM as lifted-player-no-cover.test.js. Stubbed session and
 * client only; nothing leaves the process.
 * Run: node --test js/emoji-rotate-no-lift.test.js
 * ERL_ROOT=<checkout> runs it against another checkout (fail-on-base).
 */
"use strict";

var test = require("node:test");
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

/* ERL_ROOT lets the same test run against another checkout (fail-on-base). */
var root = process.env.ERL_ROOT ? path.resolve(process.env.ERL_ROOT) : path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

var OWNER_USER = "11111111-1111-4111-8111-111111111111";
var OWNER_PROFILE = "22222222-2222-4222-8222-222222222222";

/* ---------- tiny DOM ---------- */
function matchesCompound(el, sel) {
  var s = sel.trim();
  if (!s || /[\s>+~]/.test(s.replace(/\[[^\]]*\]/g, ""))) return false; /* no combinators */
  var re = /(\[([\w-]+)(?:="([^"]*)")?\])|(\.([\w-]+))|(#([\w-]+))|(^[a-z][\w-]*)/gi;
  var used = 0, m;
  while ((m = re.exec(s))) {
    used += m[0].length;
    if (m[1]) {
      if (!el.hasAttribute(m[2])) return false;
      if (m[3] != null && el.getAttribute(m[2]) !== m[3]) return false;
    } else if (m[4]) {
      if (!el.classList.contains(m[5])) return false;
    } else if (m[6]) {
      if (el.getAttribute("id") !== m[7]) return false;
    } else if (m[8]) {
      if (el.tagName !== m[8].toUpperCase()) return false;
    }
  }
  return used === s.length;
}
function matches(el, selector, scope) {
  return String(selector).split(",").some(function (part) {
    part = part.trim();
    var sm = /^:scope\s*>\s*(.+)$/.exec(part);
    if (sm) return el.parentNode === scope && matchesCompound(el, sm[1]);
    return matchesCompound(el, part);
  });
}
function Style() {
  var map = {};
  return {
    setProperty: function (k, v) { map[k] = String(v); },
    removeProperty: function (k) { delete map[k]; },
    getPropertyValue: function (k) { return map[k] || ""; },
    get translate() { return map.translate || ""; },
    get scale() { return map.scale || ""; },
    set translate(v) { if (v) map.translate = String(v); else delete map.translate; },
    _map: map,
  };
}
function El(tag, attrs) {
  this.tagName = String(tag || "div").toUpperCase();
  this.attrs = {};
  this.classes = [];
  this.style = Style();
  this.children = [];
  this.parentNode = null;
  this.hidden = false;
  this.listeners = {};
  var self = this;
  Object.keys(attrs || {}).forEach(function (k) { self.setAttribute(k, attrs[k]); });
  this.classList = {
    add: function () { Array.prototype.forEach.call(arguments, function (c) { if (self.classes.indexOf(c) < 0) self.classes.push(c); }); },
    remove: function () { Array.prototype.forEach.call(arguments, function (c) { var i = self.classes.indexOf(c); if (i >= 0) self.classes.splice(i, 1); }); },
    contains: function (c) { return self.classes.indexOf(c) >= 0; },
    toggle: function (c, on) { if (on === undefined) on = !this.contains(c); if (on) this.add(c); else this.remove(c); return on; },
  };
}
El.prototype.getAttribute = function (n) {
  if (n === "class") return this.classes.join(" ");
  return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null;
};
El.prototype.setAttribute = function (n, v) {
  if (n === "class") { this.classes = String(v).split(/\s+/).filter(Boolean); return; }
  this.attrs[n] = String(v);
};
El.prototype.hasAttribute = function (n) { return n === "class" ? this.classes.length > 0 : Object.prototype.hasOwnProperty.call(this.attrs, n); };
El.prototype.removeAttribute = function (n) { delete this.attrs[n]; };
El.prototype.appendChild = function (c) {
  if (c.parentNode) c.parentNode.removeChild(c);
  c.parentNode = this; this.children.push(c); return c;
};
El.prototype.insertBefore = function (c, ref) {
  if (c.parentNode) c.parentNode.removeChild(c);
  var i = ref ? this.children.indexOf(ref) : -1;
  c.parentNode = this;
  if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
  return c;
};
El.prototype.removeChild = function (c) {
  var i = this.children.indexOf(c);
  if (i >= 0) this.children.splice(i, 1);
  c.parentNode = null; return c;
};
El.prototype.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
El.prototype.contains = function (o) { for (var n = o; n; n = n.parentNode) if (n === this) return true; return false; };
El.prototype.descendants = function () {
  var out = [];
  (function walk(n) { n.children.forEach(function (c) { out.push(c); walk(c); }); })(this);
  return out;
};
El.prototype.querySelectorAll = function (sel) { var self = this; return this.descendants().filter(function (e) { return matches(e, sel, self); }); };
El.prototype.querySelector = function (sel) { return this.querySelectorAll(sel)[0] || null; };
El.prototype.matches = function (sel) { return matches(this, sel, null); };
El.prototype.closest = function (sel) { for (var n = this; n && n.tagName; n = n.parentNode) if (matches(n, sel, null)) return n; return null; };
El.prototype.addEventListener = function (t, fn) { (this.listeners[t] || (this.listeners[t] = [])).push(fn); };
El.prototype.removeEventListener = function (t, fn) { var a = this.listeners[t] || []; var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
El.prototype.dispatch = function (t, ev) { (this.listeners[t] || []).slice().forEach(function (fn) { fn(ev); }); };
El.prototype.focus = function () {};
El.prototype.getBoundingClientRect = function () {
  var r = layoutRect(this).slice();
  /* CSS `scale` (origin 0 0): the box grows from its top-left; layout (offset*) does not. */
  var sc = parseFloat(this.style.getPropertyValue("scale"));
  if (isFinite(sc) && sc > 0 && sc !== 1) { r[2] *= sc; r[3] *= sc; }
  return { left: r[0], top: r[1], width: r[2], height: r[3], right: r[0] + r[2], bottom: r[1] + r[3], x: r[0], y: r[1] };
};
["offsetLeft", "offsetTop", "offsetWidth", "offsetHeight"].forEach(function (k, i) {
  Object.defineProperty(El.prototype, k, { get: function () {
    var r = layoutRect(this);
    if (i < 2 && this.parentNode && this.parentNode.tagName) { var pr = layoutRect(this.parentNode); return r[i] - pr[i]; }
    return r[i];
  } });
});
Object.defineProperty(El.prototype, "firstChild", { get: function () { return this.children[0] || null; } });
Object.defineProperty(El.prototype, "lastChild", { get: function () { return this.children[this.children.length - 1] || null; } });
Object.defineProperty(El.prototype, "firstElementChild", { get: function () { return this.children[0] || null; } });
Object.defineProperty(El.prototype, "nextSibling", { get: function () { var p = this.parentNode; if (!p || !p.children) return null; return p.children[p.children.indexOf(this) + 1] || null; } });
Object.defineProperty(El.prototype, "nextElementSibling", { get: function () { return this.nextSibling; } });
Object.defineProperty(El.prototype, "textContent", { get: function () { return this._text || ""; }, set: function (v) { this._text = String(v); } });

/* Computed style: font-size per element (px, set by the test), nothing else. */
function computedStyle(el) {
  var fs = el && el._fs ? el._fs + "px" : "";
  return {
    fontSize: fs, display: "", visibility: "",
    getPropertyValue: function (k) { return k === "font-size" ? fs : ""; },
  };
}

/* ---------- layout model (what the CSS does at 1280) ---------- */
var STAGE_W = 1098;
var STAGE_H = 1000;
/* Default grid slots, stage px (1280 shot: one 448px column, centered). */
var GRID = {
  strip: [325, 31, 448, 374],
  avatar: [325, 31, 448, 374],
  identity: [469, 130, 160, 55],
  music: [325, 421, 448, 175],
  polaroid: [325, 612, 448, 124],
  instax: [325, 751, 448, 191],
};
/* Each sticker's own size once it is out of the grid (free placement). */
/* Avatar: its own height plus the 24px spawn gap fills the strip row, as on the
   1280 page (the lift pushes nothing down). */
var NATURAL = { avatar: [178, 350], identity: [160, 55], music: [316, 423], polaroid: [448, 122], instax: [154, 191] };
var WIDGETS = ["avatar", "identity", "music", "polaroid", "instax"];

function px(v) { var n = parseFloat(String(v || "")); return isFinite(n) ? n : null; }
function translateOf(el) {
  var t = el && el.style ? el.style.getPropertyValue("translate") : "";
  var m = /(-?[\d.]+)px\s+(-?[\d.]+)px/.exec(t || "");
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : [0, 0];
}
function stageOf(el) { for (var n = el; n; n = n.parentNode) if (n.hasAttribute && n.hasAttribute("data-tower-scrapbook")) return n; return null; }
function layoutRect(el) {
  if (el.hasAttribute("data-tower-scrapbook")) return [0, 0, STAGE_W, STAGE_H];
  var stage = stageOf(el);
  if (!stage) return [0, 0, 0, 0];
  var id = el.hasAttribute("data-tower-profile-strip") ? "strip" : el.getAttribute("data-tower-widget");
  if (id === "emoji-fire") return [856, 116, 84, 73];
  /* The name sits inside the avatar card (placeMessageEnvelope), as on the
     1280 page: it rides with the card, at the same offset. */
  if (id === "identity" && el.parentNode && el.parentNode.classList.contains("tower-avatar-stack")) {
    var card = layoutRect(el.parentNode.parentNode);
    return [card[0] + GRID.identity[0] - GRID.avatar[0], card[1] + GRID.identity[1] - GRID.avatar[1], GRID.identity[2], GRID.identity[3]];
  }
  if (!GRID[id]) return [0, 0, 0, 0];
  if (stage.classList.contains("is-default-grid")) {
    var g = GRID[id].slice();
    var t = translateOf(el);
    var pt = el.parentNode && el.parentNode !== stage ? translateOf(el.parentNode) : [0, 0];
    return [g[0] + t[0] + pt[0], g[1] + t[1] + pt[1], g[2], g[3]];
  }
  var x = px(el.style.getPropertyValue("--sticker-x"));
  var yRaw = el.style.getPropertyValue("--sticker-y");
  var stageH = px(stage.style.minHeight) || STAGE_H; /* % of the stage's height (min-height grows it) */
  var y = /px$/.test(yRaw) ? px(yRaw) : (px(yRaw) || 0) / 100 * stageH;
  var nat = NATURAL[id] || [100, 100];
  /* Grid look (lifted, untouched): the grid card at its on-screen width, so
     its height is the grid's (compact player, not the iPod); the MP3 row and
     its padding zoom by --grid-look-zoom (a carried grid resize, 398 / 448). */
  var look = px(el.style.getPropertyValue("--grid-look-w"));
  var zoom = parseFloat(el.style.getPropertyValue("--grid-look-zoom")) || 1;
  if (el.hasAttribute("data-grid-look") && look) return [(x || 0) / 100 * STAGE_W, y, look, id === "music" ? GRID[id][3] * zoom : GRID[id][3]];
  var w = px(el.style.getPropertyValue("--sticker-w")) || Math.min(nat[0], px(el.style.getPropertyValue("--spawn-max-w")) || Infinity);
  var h = id === "music" ? Math.round(nat[1] * w / 316) : nat[1];
  return [(x || 0) / 100 * STAGE_W, y, w, h];
}

function buildRoot(stageW, fonts) {
  var appRoot = new El("div", { "data-tower-app": "", "data-tower-side": "public", "data-tower-is-owner": "true" });
  var stage = new El("div", { "data-tower-scrapbook": "", "class": "tower-layout tower-layout--scrapbook is-sticker-stage" });
  appRoot.appendChild(stage);
  appRoot.appendChild(new El("button", { "data-tower-reset-layout": "" }));
  WIDGETS.forEach(function (id) {
    var w = new El("div", { "data-tower-widget": id, "class": "tower-sticker" });
    if (id === "identity") { stage.querySelector('[data-tower-widget="avatar"]').querySelector(".tower-avatar-stack").appendChild(w); return; }
    stage.appendChild(w);
    if (id === "avatar") w.appendChild(new El("div", { "class": "tower-avatar-stack" }));
    if (id === "music") musicText(w, fonts);
    /* The Polaroid's photo frame: what a grid Rotate turns. */
    if (id === "polaroid") w.appendChild(new El("div", { "class": "tower-avatar-wrap", "data-tower-avatar-frame": "polaroid", "data-tower-polaroid": "" }));
  });
  /* An emoji sticker: absolute over the grid, never grid-laid (its own layout key). */
  stage.appendChild(new El("div", { "data-tower-widget": "emoji-fire", "data-tower-emoji": "emoji-fire", "class": "tower-sticker tower-sticker--emoji" }));
  Object.defineProperty(stage, "clientWidth", { get: function () { return stageW || STAGE_W; } });
  Object.defineProperty(stage, "clientHeight", { get: function () { return STAGE_H; } });
  return { root: appRoot, stage: stage };
}

/* The music widget's text at 1280, computed font-size in px (Chrome, d79fbca):
   the link input is the smallest text that is 11px or more at full size. */
var MUSIC_FONTS = { now: 10.88, menu: 9.28, skip: 9.92, play: 15.2, input: 13.12, skin: 10.88 };
function textEl(tag, text, fs, attrs) { var e = new El(tag, attrs); if (text) e.textContent = text; e._fs = fs; return e; }
function musicText(w, fonts) {
  var f = Object.assign({}, MUSIC_FONTS, fonts || {});
  var ipod = new El("div", { "class": "tower-ipod" });
  ipod._fs = 16;
  ipod.appendChild(textEl("span", "Song \u2014 Artist", f.now, { "class": "tower-ipod-now" }));
  ["MENU", "VOL"].forEach(function (t) { ipod.appendChild(textEl("span", t, f.menu)); });
  ["\u25c0\u25c0", "\u25b6\u25b6"].forEach(function (t) { ipod.appendChild(textEl("button", t, f.skip)); });
  ipod.appendChild(textEl("button", "\u25b6", f.play));
  w.appendChild(ipod);
  w.appendChild(textEl("input", "", f.input, { type: "url", placeholder: "Paste a YouTube link" }));
  ["Pink", "Silver", "None"].forEach(function (t) { w.appendChild(textEl("button", t, f.skin)); });
  /* Hidden text never sets the floor. */
  var hid = textEl("span", "Now playing", 12, {});
  hid.hidden = true;
  w.appendChild(hid);
}

function rects(stage) {
  var out = {};
  WIDGETS.forEach(function (id) {
    var el = stage.querySelector('[data-tower-widget="' + id + '"]');
    if (!el) { out[id] = "not on stage"; return; }
    var r = el.getBoundingClientRect();
    out[id] = [r.left, r.top, r.width, r.height].map(Math.round);
  });
  return out;
}

/* ---------- boot tower.js ---------- */
var HOOK_AT = "  window.CognationTowerProfileStore = TowerProfileStore;";
function towerSource() {
  var t = src("js/tower.js");
  assert.ok(t.indexOf(HOOK_AT) > 0, "hook anchor present");
  return t.replace(
    HOOK_AT,
    HOOK_AT + "\n  window.__dragHook = { spawnUnplacedWidgets: spawnUnplacedWidgets, initScrapbookStickers: initScrapbookStickers, initWidgetResize: initWidgetResize, ensureResizeHandle: ensureResizeHandle, mergeScrapbookLayout: mergeScrapbookLayout, liftDefaultGrid: liftDefaultGrid, persistSelectedTilt: persistSelectedTilt, freezeSpawnedWidgets: freezeSpawnedWidgets, renderEmojiStickers: renderEmojiStickers };"
  );
}

function memoryStorage() {
  var data = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
  };
}

function boot(savedRow, width) {
  var writes = [];
  var docListeners = {};
  var documentStub = {
    readyState: "complete",
    body: new El("body"),
    documentElement: new El("html"),
    addEventListener: function (type, fn) { (docListeners[type] || (docListeners[type] = [])).push(fn); },
    removeEventListener: function (type, fn) { var a = docListeners[type] || []; var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    dispatchEvent: function (ev) { (docListeners[ev.type] || []).slice().forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    getElementById: function () { return null; },
    createElement: function (t) { return new El(t); },
  };
  var session = { source: "supabase", supabaseUserId: OWNER_USER, activeProfileId: OWNER_PROFILE, username: "owner" };
  var row = savedRow ? JSON.parse(JSON.stringify(savedRow)) : null;
  var client = {
    configured: function () { return true; },
    getSession: function () { return { access_token: "stub-token" }; },
    rest: function (table, opts) {
      var method = (opts && opts.method) || "GET";
      if (method !== "GET") {
        writes.push({ table: table, method: method, body: JSON.parse(JSON.stringify((opts && opts.body) || null)) });
        return Promise.resolve(null);
      }
      if (table === "tower_widget_layouts") return Promise.resolve(row ? [{ layout: JSON.parse(JSON.stringify(row)) }] : []);
      return Promise.resolve([]);
    },
    rpc: function () { return Promise.resolve(null); },
  };
  var win = {
    document: documentStub,
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage(),
    location: { hash: "", href: "https://cognation.test/", search: "", pathname: "/" },
    innerWidth: width || 1280,
    innerHeight: 900,
    addEventListener: function () {},
    removeEventListener: function () {},
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    requestAnimationFrame: function (fn) { return setTimeout(fn, 0); },
    getComputedStyle: computedStyle,
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    CognationAuth: { getSession: function () { return session; } },
    CognationSupabase: client,
  };
  win.window = win;
  var context = vm.createContext({
    window: win, document: documentStub, localStorage: win.localStorage, sessionStorage: win.sessionStorage,
    location: win.location, console: console, CustomEvent: win.CustomEvent,
    setTimeout: setTimeout, clearTimeout: clearTimeout, requestAnimationFrame: win.requestAnimationFrame,
    getComputedStyle: win.getComputedStyle,
  });
  vm.runInContext(src("js/accounts.js"), context);
  vm.runInContext(src("js/tower-layout-sync.js"), context);
  vm.runInContext(towerSource(), context);
  return { win: win, doc: documentStub, writes: writes };
}

function profile() {
  return {
    _profileId: OWNER_PROFILE, _remote: true, displayName: "Val", handle: "layoutdemo", kind: "personal",
    widgetLayout: {}, quoteStickers: [], emojiStickers: [], friendPinLayout: {}, badgePinLayout: {},
    publicWidgets: { identity: true, music: true, instax: true }, badgeVisibility: {},
  };
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* The store hands out the test's owner profile; saves go through the real path. */
function ownStore(env, p) {
  var store = env.win.CognationTowerProfileStore;
  var state = clone(p);
  var realSave = store.save;
  store.get = function () { return clone(state); };
  store.save = function (d, o) { state = clone(d); return realSave.call(store, d, o); };
  return { current: function () { return clone(state); } };
}

async function render(env, p) {
  var sync = env.win.CognationTowerLayoutSync;
  sync.apply(p);
  await wait(5);
  sync.apply(p);
  var dom = buildRoot();
  /* Same order as the page: bind the stickers, then lay out. */
  env.win.__dragHook.initScrapbookStickers(dom.root);
  env.win.__dragHook.spawnUnplacedWidgets(dom.root, p);
  return dom;
}

function drag(env, dom, id, dx, dy) {
  var el = dom.stage.querySelector('[data-tower-widget="' + id + '"]');
  var r = el.getBoundingClientRect();
  var x0 = r.left + r.width / 2, y0 = r.top + 20;
  var ev = function (x, y) { return { target: el, clientX: x, clientY: y, pointerId: 1, cancelable: true, button: 0, preventDefault: function () {}, stopPropagation: function () {} }; };
  dom.stage.dispatch("pointerdown", ev(x0, y0));
  for (var i = 1; i <= 10; i++) env.doc.dispatchEvent(Object.assign(ev(x0 + dx * i / 10, y0 + dy * i / 10), { type: "pointermove" }));
  env.doc.dispatchEvent(Object.assign(ev(x0 + dx, y0 + dy), { type: "pointerup" }));
}

function layoutWrites(env) { return env.writes.filter(function (w) { return w.table === "tower_widget_layouts"; }); }


var LOCAL_KEY = "cognation.scrapbookLayout.v1";

/* A page open: the saved row and any local copy merged the way the page does,
   then bind stickers, the resize grip, and lay out. */
async function open(env, p, width, fonts) {
  var sync = env.win.CognationTowerLayoutSync;
  sync.apply(p);
  await wait(5);
  env.win.__dragHook.mergeScrapbookLayout(p);
  var dom = buildRoot(width, fonts);
  env.win.__dragHook.initScrapbookStickers(dom.root);
  env.win.__dragHook.ensureResizeHandle(dom.stage.querySelector('[data-tower-widget="music"]'), "music");
  env.win.__dragHook.initWidgetResize(dom.root);
  env.win.__dragHook.spawnUnplacedWidgets(dom.root, p);
  return dom;
}

function resize(env, dom, id, dx) {
  var el = dom.stage.querySelector('[data-tower-widget="' + id + '"]');
  var grip = el.querySelector("[data-tower-widget-resize]");
  var r = el.getBoundingClientRect();
  var x0 = r.left + r.width - 8, y0 = r.top + r.height - 8;
  var ev = function (x, y) { return { target: grip, clientX: x, clientY: y, pointerId: 1, cancelable: true, button: 0, preventDefault: function () {}, stopPropagation: function () {} }; };
  dom.stage.dispatch("pointerdown", ev(x0, y0));
  for (var i = 1; i <= 10; i++) env.doc.dispatchEvent(Object.assign(ev(x0 + dx * i / 10, y0), { type: "pointermove" }));
  env.doc.dispatchEvent(Object.assign(ev(x0 + dx, y0), { type: "pointerup" }));
}

function clickReset(dom) {
  dom.root.querySelector("[data-tower-reset-layout]").dispatch("click", { preventDefault: function () {} });
}
function lastRow(env) { var w = layoutWrites(env); return w.length ? w[w.length - 1].body.layout : null; }
function pins(dom) { return dom.stage.querySelectorAll("[data-tower-friend-pin]").map(function (e) { return e.getAttribute("data-tower-friend-pin"); }); }

function music(dom) { return dom.stage.querySelector('[data-tower-widget="music"]'); }
function savedGridW(env) { var r = lastRow(env); return r && r._gridSize && r._gridSize.music ? r._gridSize.music.w : null; }
var SLOT = GRID.music[2]; /* 448 */

/* Rotate the selected widget the way the rotate toolbar does (its save path). */
function rotate(env, dom, id, deg) {
  var el = dom.stage.querySelector('[data-tower-widget="' + id + '"]');
  env.win.__dragHook.persistSelectedTilt(dom.root, el, deg);
}
/* A reload: a new page with the row the last save wrote and this browser's local copy. */
async function reload(env, width) {
  var env2 = boot(lastRow(env), width);
  var local = env.win.localStorage.getItem(LOCAL_KEY);
  if (local != null) env2.win.localStorage.setItem(LOCAL_KEY, local);
  var p2 = profile();
  ownStore(env2, p2);
  var dom2 = await open(env2, p2, width === 390 ? 390 : undefined);
  return { env: env2, dom: dom2, p: p2 };
}
function within1(a, b, label) {
  Object.keys(a).forEach(function (id) {
    assert.ok(Array.isArray(b[id]), label + ": " + id + " missing after reload");
    for (var i = 0; i < 4; i++) {
      assert.ok(Math.abs(a[id][i] - b[id][i]) <= 1, label + ": " + id + " " + JSON.stringify(a[id]) + " -> " + JSON.stringify(b[id]));
    }
  });
}
function exactRects(stage) {
  var out = {};
  WIDGETS.forEach(function (id) {
    var el = stage.querySelector('[data-tower-widget="' + id + '"]');
    var r = el.getBoundingClientRect();
    out[id] = [r.left, r.top, r.width, r.height];
  });
  return out;
}

function frameOf(dom) { return dom.stage.querySelector('[data-tower-widget="polaroid"] [data-tower-avatar-frame]') || dom.stage.querySelector('[data-tower-avatar-frame]'); }
function polaroidFrame(dom) {
  var pol = dom.stage.querySelector('[data-tower-widget="polaroid"]');
  return pol.children.filter(function (c) { return c.hasAttribute("data-tower-avatar-frame"); })[0];
}
/* Every stored entry a Rotate could have reshaped: no positions, no sizes. */
function storedSizes(row) {
  var out = [];
  Object.keys(row || {}).forEach(function (k) {
    var v = row[k];
    if (k.charAt(0) === "_" || !v || typeof v !== "object") return;
    if (typeof v.wPx === "number") out.push(k + ".wPx=" + v.wPx);
    if (typeof v.x === "number" || typeof v.y === "number") out.push(k + ".pos");
  });
  return out;
}

/* ---------- emoji-rotate-no-lift ---------- */
var EMOJI = "emoji-fire";
var GRID_IDS = ["avatar", "identity", "music", "polaroid", "instax"];
function emojiProfile() {
  var p = profile();
  p.emojiStickers = [{ id: EMOJI, size: 56 }];
  return p;
}
function emojiEl(dom) { return dom.stage.querySelector('[data-tower-widget="' + EMOJI + '"]'); }
/* A page open, then the emoji layer the way applyWidgetLayout draws it. */
async function openE(env, p, width) {
  var dom = await open(env, p, width);
  env.win.__dragHook.renderEmojiStickers(dom.root, p);
  return dom;
}
async function reloadE(env, width) {
  var env2 = boot(lastRow(env), width);
  var local = env.win.localStorage.getItem(LOCAL_KEY);
  if (local != null) env2.win.localStorage.setItem(LOCAL_KEY, local);
  var p2 = emojiProfile();
  ownStore(env2, p2);
  var dom2 = await openE(env2, p2, width);
  return { env: env2, dom: dom2, p: p2 };
}
function emojiRotate(env, dom, deg) { env.win.__dragHook.persistSelectedTilt(dom.root, emojiEl(dom), deg); }
function tiltOf(el) { return el.style.getPropertyValue("--sticker-tilt"); }
/* Grid widgets a Rotate must never write: positions, sizes, grid looks, compaction. */
function frozen(row) {
  var out = [];
  GRID_IDS.forEach(function (id) { if (row && row[id]) out.push(id); });
  if (row && row._compacted) out.push("_compacted");
  return out;
}
function exactSame(a, b, label) {
  GRID_IDS.forEach(function (id) {
    assert.deepStrictEqual(b[id], a[id], label + ": " + id + " " + JSON.stringify(a[id]) + " -> " + JSON.stringify(b[id]));
  });
}

test("1280: Rotate on an emoji over the default grid turns only the emoji; the grid stays, 0px diff open -> Rotate -> reload", async function () {
  var env = boot(null);
  var p = emojiProfile();
  ownStore(env, p);
  var dom = await openE(env, p);
  assert.ok(dom.stage.classList.contains("is-default-grid"), "opens on the grid");
  var before = exactRects(dom.stage);
  var w0 = layoutWrites(env).length;
  emojiRotate(env, dom, 5);
  await wait(700);
  assert.ok(dom.stage.classList.contains("is-default-grid"), "Rotate keeps the default grid (no lift)");
  exactSame(before, exactRects(dom.stage), "Rotate");
  assert.strictEqual(tiltOf(emojiEl(dom)), "5deg", "the emoji turns");
  assert.strictEqual(emojiEl(dom).getAttribute("data-sticker-tilt"), "5");
  assert.strictEqual(layoutWrites(env).length - w0, 1, "one save");
  var row = lastRow(env);
  assert.deepStrictEqual(frozen(row), [], "no grid widget frozen into the row");
  assert.ok(row[EMOJI] && row[EMOJI].tilt === 5, "the tilt is the emoji's own field: " + JSON.stringify(row[EMOJI]));
  assert.ok(row[EMOJI].dragged !== true, "a Rotate is not a drag");
  assert.ok(!row._gridNudge && !row._gridSize, "no nudge or size");

  var r = await reloadE(env);
  assert.ok(r.dom.stage.classList.contains("is-default-grid"), "reload: still the grid");
  exactSame(before, exactRects(r.dom.stage), "reload");
  assert.strictEqual(tiltOf(emojiEl(r.dom)), "5deg", "reload: the emoji keeps its turn");
  assert.strictEqual(emojiEl(r.dom).getAttribute("data-sticker-tilt"), "5", "reload marks it rotated (no tile)");
  await wait(700);
  assert.strictEqual(layoutWrites(r.env).length, 0, "reload writes nothing");
});

test("1280: a second Rotate and Straighten stay on the grid; Straighten clears the turn", async function () {
  var env = boot(null);
  var p = emojiProfile();
  ownStore(env, p);
  var dom = await openE(env, p);
  var before = exactRects(dom.stage);
  emojiRotate(env, dom, 5);
  emojiRotate(env, dom, 10);
  await wait(700);
  assert.ok(dom.stage.classList.contains("is-default-grid"));
  assert.strictEqual(lastRow(env)[EMOJI].tilt, 10);
  emojiRotate(env, dom, 0);
  await wait(700);
  assert.ok(dom.stage.classList.contains("is-default-grid"));
  exactSame(before, exactRects(dom.stage), "after Straighten");
  assert.strictEqual(tiltOf(emojiEl(dom)), "0deg");
  assert.ok(!emojiEl(dom).hasAttribute("data-sticker-tilt") || emojiEl(dom).getAttribute("data-sticker-tilt") === "0", "no rotated mark");
  assert.strictEqual(lastRow(env)[EMOJI].tilt, 0);
  assert.deepStrictEqual(frozen(lastRow(env)), []);
});

test("1280: Reset clears the emoji's turn and gives a fresh open", async function () {
  var env = boot(null);
  var p = emojiProfile();
  ownStore(env, p);
  var dom = await openE(env, p);
  var before = exactRects(dom.stage);
  emojiRotate(env, dom, 5);
  await wait(700);
  clickReset(dom);
  await wait(700);
  assert.ok(dom.stage.classList.contains("is-default-grid"));
  exactSame(before, exactRects(dom.stage), "Reset");
  assert.strictEqual(tiltOf(emojiEl(dom)), "0deg", "Reset straightens the emoji");
  var row = lastRow(env);
  assert.ok(!row[EMOJI] || !row[EMOJI].tilt, "no saved turn after Reset: " + JSON.stringify(row[EMOJI]));
  var r = await reloadE(env);
  exactSame(before, exactRects(r.dom.stage), "Reset reload");
  assert.strictEqual(tiltOf(emojiEl(r.dom)), "0deg");
  await wait(700);
  assert.strictEqual(layoutWrites(r.env).length, 0, "Reset reload writes nothing");
});

test("390 is unchanged: an emoji Rotate writes nothing and the phone stack stays", async function () {
  var env = boot(null, 390);
  var p = emojiProfile();
  ownStore(env, p);
  var dom = await openE(env, p, 390);
  var w0 = layoutWrites(env).length;
  emojiRotate(env, dom, 5);
  await wait(700);
  assert.strictEqual(layoutWrites(env).length - w0, 0, "no write at 390");
  assert.ok(dom.stage.classList.contains("is-default-grid"), "still the stack");
});

test("a layout a drag already lifted keeps its Rotate behavior (frozen row, the emoji's tilt and drag mark)", async function () {
  var lifted = { polaroid: { x: 40, y: 60, z: 3, tilt: 0, dragged: true, yPx: 600 } };
  var env = boot(lifted);
  var p = emojiProfile();
  p.widgetLayout = clone(lifted);
  ownStore(env, p);
  var dom = await openE(env, p);
  assert.ok(!dom.stage.classList.contains("is-default-grid"), "the saved drag opens off the grid");
  emojiRotate(env, dom, 5);
  await wait(700);
  var row = lastRow(env);
  assert.ok(row[EMOJI] && row[EMOJI].tilt === 5 && row[EMOJI].dragged === true, "free-layout Rotate as before: " + JSON.stringify(row[EMOJI]));
  assert.ok(row.polaroid && row.polaroid.dragged === true && row.polaroid.x === 40, "the dragged widget is kept");
  assert.strictEqual(tiltOf(emojiEl(dom)), "5deg");
});

/* CSS: what the page draws for a rotated emoji and for its resize grip. */
function cssText() { return src("css/styles.css"); }
function flat(css) { return css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " "); }
test("a rotated emoji has no tile: transparent background, no border or shadow, over the shared sticker surface", function () {
  var css = flat(cssText());
  var sel = '.tower-layout--scrapbook.is-sticker-stage .tower-sticker--emoji[data-sticker-tilt]:not([data-sticker-tilt="0"])';
  var at = css.indexOf(sel + " {");
  assert.ok(at > 0, "rotated-emoji rule present");
  var body = css.slice(at, css.indexOf("}", at));
  assert.ok(/background: transparent !important;/.test(body), "transparent");
  assert.ok(/border-color: transparent !important;/.test(body), "no tile edge");
  assert.ok(/box-shadow: none !important;/.test(body), "no tile shadow");
  /* After (and more specific than) the shared dark sticker surface it overrides. */
  var shared = css.indexOf(".tower-layout--scrapbook.is-sticker-stage .tower-sticker--emoji, .tower-layout--scrapbook.is-sticker-stage .tower-sticker--avatar {");
  assert.ok(shared > 0 && at > shared, "comes after the shared surface rule");
});
test("the emoji resize grip shows only on the selected emoji", function () {
  var css = flat(cssText());
  assert.ok(css.indexOf('[data-tower-app][data-tower-is-owner="true"][data-tower-side="public"] .tower-emoji-resize { display: block; }') < 0, "no always-on grip for the owner");
  assert.ok(css.indexOf('[data-tower-app][data-tower-is-owner="true"][data-tower-side="public"] .tower-sticker--emoji.is-widget-selected .tower-emoji-resize { display: block; }') > 0, "grip on the selected emoji");
  assert.ok(/\.tower-emoji-resize \{[^}]*display: none;/.test(css), "hidden otherwise");
});
