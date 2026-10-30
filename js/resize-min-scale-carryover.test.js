/**
 * Grid resize min scale + lift carry-over (resize-min-scale-carryover):
 *  1. A grid shrink never takes the widget's smallest readable text under 11px
 *     on screen. The floor comes from the widget's own computed font sizes
 *     (CSS `scale` does not change them), not a per-widget number. Text that is
 *     already under 11px at full size (music: song label, MENU/VOL, Pink/Silver/
 *     None) cannot be protected by any shrink and does not set the floor.
 *  2. The floor clamps live resizes (and what is saved) and a stored _gridSize
 *     on open (no write on open).
 *  3. Lift after a grid resize: the lifted widget keeps the on-screen left, top
 *     and width it had in the grid (the grid width becomes its sticker width).
 *  4. Instax keeps no resize grip (PM: intended).
 *
 * Same tiny fake DOM as layout-resize-reset.test.js, plus computed font sizes
 * and the music widget's text. Stubbed session and client only; nothing leaves
 * the process. Run: node --test js/resize-min-scale-carryover.test.js
 */
"use strict";

var test = require("node:test");
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

/* LRR_ROOT lets the same test run against another checkout (fail-on-base). */
var root = process.env.LRR_ROOT ? path.resolve(process.env.LRR_ROOT) : path.join(__dirname, "..");
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
    stage.appendChild(w);
    if (id === "music") musicText(w, fonts);
  });
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
    HOOK_AT + "\n  window.__dragHook = { spawnUnplacedWidgets: spawnUnplacedWidgets, initScrapbookStickers: initScrapbookStickers, initWidgetResize: initWidgetResize, ensureResizeHandle: ensureResizeHandle, mergeScrapbookLayout: mergeScrapbookLayout, liftDefaultGrid: liftDefaultGrid };"
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
function scaleOf(el) { var s = parseFloat(el.style.getPropertyValue("scale")); return isFinite(s) && s > 0 ? s : 1; }
function savedGridW(env) { var r = lastRow(env); return r && r._gridSize && r._gridSize.music ? r._gridSize.music.w : null; }
var SLOT = GRID.music[2]; /* 448 */
/* 11px floor over the smallest text that is 11px or more at full size (the link input). */
function floorW(fs) { return Math.ceil(SLOT * 11 / fs); }

test("a live grid shrink stops where the smallest readable text (the link input) is 11px on screen", async function () {
  assert.strictEqual(floorW(MUSIC_FONTS.input), 376, "music floor at 1280: ceil(448 * 11 / 13.12)");
  var env = boot(null);
  var p = profile();
  ownStore(env, p);
  var dom = await open(env, p);
  resize(env, dom, "music", -400); /* would be 200px (the old music minimum) */
  var el = music(dom);
  var r = el.getBoundingClientRect();
  assert.ok(dom.stage.classList.contains("is-default-grid"), "still a grid resize");
  assert.strictEqual(Math.round(r.width), 376, "music stops at 376px on screen, not 200px");
  assert.ok(MUSIC_FONTS.input * scaleOf(el) >= 11, "link input renders at 11px or more (" + (MUSIC_FONTS.input * scaleOf(el)).toFixed(2) + "px)");
  assert.strictEqual(el.getAttribute("data-grid-w"), "376");
  await wait(700);
  assert.strictEqual(layoutWrites(env).length, 1, "one write for one resize end");
  assert.strictEqual(savedGridW(env), 376, "the saved grid size is the clamped one");
  /* A further shrink from the floor changes nothing and writes nothing. */
  resize(env, dom, "music", -100);
  await wait(700);
  assert.strictEqual(Math.round(music(dom).getBoundingClientRect().width), 376);
  assert.strictEqual(layoutWrites(env).length, 1, "no write when the shrink is already at the floor");
});

test("a stored _gridSize under the floor opens clamped to the floor, with no write", async function () {
  var row = { _gridSize: { music: { w: 200 } } };
  var env = boot(row);
  var p = profile();
  p.widgetLayout = clone(row);
  ownStore(env, p);
  var dom = await open(env, p);
  var el = music(dom);
  assert.ok(dom.stage.classList.contains("is-default-grid"));
  assert.strictEqual(Math.round(el.getBoundingClientRect().width), 376, "opens at 376px, not the stored 200px");
  assert.ok(MUSIC_FONTS.input * scaleOf(el) >= 11, "link input renders at 11px or more");
  assert.strictEqual(el.getAttribute("data-grid-w"), "376");
  /* A stored size at or over the floor is untouched. */
  var env2 = boot({ _gridSize: { music: { w: 400 } } });
  var p2 = profile();
  p2.widgetLayout = { _gridSize: { music: { w: 400 } } };
  ownStore(env2, p2);
  var dom2 = await open(env2, p2);
  assert.strictEqual(Math.round(music(dom2).getBoundingClientRect().width), 400, "400px stays 400px");
  await wait(700);
  assert.strictEqual(layoutWrites(env).length, 0, "open writes nothing");
  assert.strictEqual(layoutWrites(env2).length, 0, "open writes nothing");
});

test("the floor comes from the widget's computed font sizes, not a per-widget number", async function () {
  async function shrunk(fonts) {
    var env = boot(null);
    var p = profile();
    ownStore(env, p);
    var dom = await open(env, p, undefined, fonts);
    resize(env, dom, "music", -400);
    return Math.round(music(dom).getBoundingClientRect().width);
  }
  assert.strictEqual(await shrunk({ input: 16, play: 18 }), floorW(16), "16px input: floor ceil(448 * 11 / 16) = 308");
  assert.strictEqual(await shrunk({ input: 22, play: 24 }), floorW(22), "22px input: floor 224");
  assert.strictEqual(await shrunk({ input: 12, skin: 11.5 }), floorW(11.5), "11.5px skin buttons are now the smallest readable text: 429");
  /* Nothing at 11px or more: no text floor, the old 200px limit applies. */
  assert.strictEqual(await shrunk({ input: 10, play: 10.5 }), 200, "no readable text to protect: 200px");
});

test("lift after a grid resize keeps the on-screen left, top and width (documents d79fbca behavior)", async function () {
  var env = boot(null);
  var p = profile();
  ownStore(env, p);
  var dom = await open(env, p);
  resize(env, dom, "music", -50); /* 398px: above the 376px floor */
  var g = music(dom).getBoundingClientRect();
  assert.strictEqual(Math.round(g.width), 398, "grid: 398px on screen");
  assert.ok(env.win.__dragHook.liftDefaultGrid(dom.stage), "lifted");
  var el = music(dom);
  var s = el.getBoundingClientRect();
  assert.ok(!dom.stage.classList.contains("is-default-grid"), "out of the grid");
  assert.strictEqual(el.style.getPropertyValue("scale"), "", "no grid scale left on the sticker");
  assert.ok(Math.abs(s.left - g.left) <= 1, "left " + g.left + " -> " + s.left);
  assert.ok(Math.abs(s.top - g.top) <= 1, "top " + g.top + " -> " + s.top);
  assert.strictEqual(Math.round(s.width), Math.round(g.width), "width " + g.width + " -> " + s.width);
  assert.strictEqual(el.getAttribute("data-sticker-w"), "398", "grid width carries over as the sticker width");
});

test("lift after a stored grid size under the floor carries the clamped on-screen width", async function () {
  var row = { _gridSize: { music: { w: 200 } } };
  var env = boot(row);
  var p = profile();
  p.widgetLayout = clone(row);
  ownStore(env, p);
  var dom = await open(env, p);
  var g = music(dom).getBoundingClientRect();
  assert.ok(env.win.__dragHook.liftDefaultGrid(dom.stage), "lifted");
  var s = music(dom).getBoundingClientRect();
  assert.strictEqual(Math.round(g.width), 376, "grid: 376px on screen");
  assert.strictEqual(Math.round(s.width), 376, "sticker: 376px, the width that was on screen (not the stored 200)");
  assert.ok(Math.abs(s.left - g.left) <= 1 && Math.abs(s.top - g.top) <= 1, "same top-left");
});

test("instax has no resize grip (PM: intended)", function () {
  var t = src("js/tower.js");
  assert.ok(!/ensureResizeHandle\([^)]*instax/.test(t), "no grip is added to instax");
  var lim = /var RESIZE_LIMITS = \{([\s\S]*?)\};/.exec(t);
  assert.ok(lim && !/instax/.test(lim[1]), "instax has no resize limits");
});
