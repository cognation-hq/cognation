/**
 * Follow-ups to the grid nudge (layout-resize-reset):
 *  1. A resize from the default grid changes only that widget's size and keeps
 *     grid mode: every other widget is 0px off on screen and after reload.
 *  2. After a lift, Reset then reload is the exact default grid even when a
 *     local copy still holds the lifted layout, with 0 writes on reload.
 *  3. Reset renders exactly like a fresh open: same widget rects, and no
 *     friend tiles (the demo roster) above the avatar.
 *
 * The real resize, Reset, render and save paths run against the same tiny
 * fake DOM as layout-drag-keeps-grid.test.js (fixed 1280 grid slots; the CSS
 * `scale` property scales a widget's box from its top-left corner, offsetWidth
 * stays the slot). Stubbed session and client only; nothing leaves the process.
 * Run: node --test js/layout-resize-reset.test.js
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
var NATURAL = { avatar: [178, 377], identity: [160, 55], music: [316, 423], polaroid: [448, 122], instax: [154, 191] };
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
  var y = /px$/.test(yRaw) ? px(yRaw) : (px(yRaw) || 0) / 100 * STAGE_H;
  var nat = NATURAL[id] || [100, 100];
  var w = px(el.style.getPropertyValue("--sticker-w")) || Math.min(nat[0], px(el.style.getPropertyValue("--spawn-max-w")) || Infinity);
  var h = id === "music" ? Math.round(nat[1] * w / 316) : nat[1];
  return [(x || 0) / 100 * STAGE_W, y, w, h];
}

function buildRoot(stageW) {
  var appRoot = new El("div", { "data-tower-app": "", "data-tower-side": "public", "data-tower-is-owner": "true" });
  var stage = new El("div", { "data-tower-scrapbook": "", "class": "tower-layout tower-layout--scrapbook is-sticker-stage" });
  appRoot.appendChild(stage);
  appRoot.appendChild(new El("button", { "data-tower-reset-layout": "" }));
  WIDGETS.forEach(function (id) {
    stage.appendChild(new El("div", { "data-tower-widget": id, "class": "tower-sticker" }));
  });
  Object.defineProperty(stage, "clientWidth", { get: function () { return stageW || STAGE_W; } });
  Object.defineProperty(stage, "clientHeight", { get: function () { return STAGE_H; } });
  return { root: appRoot, stage: stage };
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
    HOOK_AT + "\n  window.__dragHook = { spawnUnplacedWidgets: spawnUnplacedWidgets, initScrapbookStickers: initScrapbookStickers, initWidgetResize: initWidgetResize, ensureResizeHandle: ensureResizeHandle, mergeScrapbookLayout: mergeScrapbookLayout };"
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
    getComputedStyle: function () { return { getPropertyValue: function () { return ""; } }; },
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
async function open(env, p, width) {
  var sync = env.win.CognationTowerLayoutSync;
  sync.apply(p);
  await wait(5);
  env.win.__dragHook.mergeScrapbookLayout(p);
  var dom = buildRoot(width);
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

/* A lifted layout: every widget a free sticker (what a pre-fix resize saved). */
var LIFTED = {
  avatar: { x: 29.6, y: 2.5, z: 2, tilt: 0, dragged: true, wPx: 178 },
  music: { x: 29.6, y: 42, z: 2, tilt: 0, dragged: true, wPx: 256 },
  polaroid: { x: 29.6, y: 81, z: 2, tilt: 0, dragged: true },
  instax: { x: 29.6, y: 95.5, z: 2, tilt: 0, dragged: true },
};

test("a resize from the default grid changes only that widget; the others stay 0px off, and the reload matches", async function () {
  var env = boot(null);
  var p = profile();
  ownStore(env, p);
  var dom = await open(env, p);
  assert.ok(dom.stage.classList.contains("is-default-grid"), "fresh Tower opens on the default grid");
  var before = rects(dom.stage);

  resize(env, dom, "music", -60);
  var after = rects(dom.stage);
  assert.ok(dom.stage.classList.contains("is-default-grid"), "a grid resize keeps grid mode (no lift)");
  assert.strictEqual(after.music[2], before.music[2] - 60, "music is 60px narrower");
  ["avatar", "identity", "polaroid", "instax"].forEach(function (id) {
    assert.deepStrictEqual(after[id], before[id], id + ": 0px off after the resize");
  });
  await wait(700);
  var w = layoutWrites(env);
  assert.strictEqual(w.length, 1, "one layout write for one resize end");
  var row = w[0].body.layout;
  ["avatar", "music", "polaroid", "instax"].forEach(function (id) {
    assert.ok(!row[id] || row[id].dragged !== true, id + " is not saved as a dragged sticker");
  });

  var env2 = boot(row);
  var p2 = profile();
  ownStore(env2, p2);
  var dom2 = await open(env2, p2);
  assert.ok(dom2.stage.classList.contains("is-default-grid"), "reload stays on the default grid");
  assert.deepStrictEqual(rects(dom2.stage), after, "reload paints exactly what was on screen after the resize");
  await wait(700);
  assert.strictEqual(layoutWrites(env2).length, 0, "reload writes nothing");

  /* Phones ignore a desktop grid size. */
  var env3 = boot(row, 390);
  var p3 = profile();
  ownStore(env3, p3);
  var dom3 = await open(env3, p3, 358);
  assert.strictEqual(dom3.stage.querySelectorAll("[data-grid-w]").length, 0, "no grid size on the phone stack");

  /* Reset clears it. */
  clickReset(dom2);
  await wait(700);
  assert.strictEqual(dom2.stage.querySelectorAll("[data-grid-w]").length, 0, "Reset clears the grid size on screen");
  assert.ok(!lastRow(env2)._gridSize, "Reset clears the grid size in the row");
});

test("after a lift, Reset then reload restores the exact default grid with no write on reload, even with a lifted local copy", async function () {
  var grid = rects((await open(boot(null), profile())).stage);

  /* Owner with a lifted layout in the row and in this browser's local copy. */
  var env = boot(clone(LIFTED));
  var p = profile();
  ownStore(env, p);
  var dom = await open(env, p);
  assert.ok(!dom.stage.classList.contains("is-default-grid"), "the lifted layout opens lifted");
  /* This browser's local copy of the lifted layout (keyed by profile id). */
  var staleLocal = {};
  staleLocal[OWNER_PROFILE] = { widgetLayout: clone(LIFTED) };

  clickReset(dom);
  await wait(700);
  var resetRow = lastRow(env);
  assert.ok(resetRow, "Reset saved the row");
  ["avatar", "music", "polaroid", "instax"].forEach(function (id) {
    assert.ok(!resetRow[id], id + ": no position in the reset row");
  });

  /* Reload in a browser whose local copy still holds the lifted layout
     (another tab, or a copy written before Reset). */
  var env2 = boot(resetRow);
  env2.win.localStorage.setItem(LOCAL_KEY, JSON.stringify(staleLocal));
  var p2 = profile();
  ownStore(env2, p2);
  var dom2 = await open(env2, p2);
  assert.ok(dom2.stage.classList.contains("is-default-grid"), "reload after Reset is the default grid, not the lifted local copy");
  assert.deepStrictEqual(rects(dom2.stage), grid, "every widget on its default-grid rect");
  await wait(700);
  assert.strictEqual(layoutWrites(env2).length, 0, "reload after Reset writes nothing");
});

test("Reset renders exactly like a fresh open: same rects, and no friend tiles above the stage", async function () {
  var fresh = boot(null);
  var pf = profile();
  ownStore(fresh, pf);
  var freshDom = await open(fresh, pf);
  var freshRects = rects(freshDom.stage);
  assert.deepStrictEqual(pins(freshDom), [], "a fresh open shows no friend tiles");

  var env = boot(clone(LIFTED));
  var p = profile();
  ownStore(env, p);
  var dom = await open(env, p);
  clickReset(dom);
  assert.deepStrictEqual(pins(dom), [], "no friend tiles right after Reset");
  assert.ok(dom.stage.classList.contains("is-default-grid"), "Reset shows the default grid");
  assert.deepStrictEqual(rects(dom.stage), freshRects, "right after Reset: 0px diff on every widget rect vs a fresh open");
  await wait(700);
  var row = lastRow(env);
  assert.deepStrictEqual(Object.keys((row._widgets && row._widgets.friendPinLayout) || {}), [], "Reset saves no friend tile positions");
});

function overlaps(a, b) { return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]; }
/* Grow with the grip, recording the widget's rect after every move. */
function growSteps(env, dom, id, dx) {
  var el = dom.stage.querySelector('[data-tower-widget="' + id + '"]');
  var grip = el.querySelector("[data-tower-widget-resize]");
  var r = el.getBoundingClientRect();
  var x0 = r.left + r.width - 8, y0 = r.top + r.height - 8;
  var ev = function (x, y) { return { target: grip, clientX: x, clientY: y, pointerId: 1, cancelable: true, button: 0, preventDefault: function () {}, stopPropagation: function () {} }; };
  var seen = [];
  dom.stage.dispatch("pointerdown", ev(x0, y0));
  for (var i = 1; i <= 10; i++) {
    env.doc.dispatchEvent(Object.assign(ev(x0 + dx * i / 10, y0), { type: "pointermove" }));
    var b = el.getBoundingClientRect();
    seen.push([b.left, b.top, b.width, b.height].map(Math.round));
  }
  env.doc.dispatchEvent(Object.assign(ev(x0 + dx, y0), { type: "pointerup" }));
  return seen;
}
var NEIGHBOURS = ["avatar", "polaroid", "instax"];
function assertNoOverlap(rs, label) {
  NEIGHBOURS.forEach(function (id) {
    assert.ok(!overlaps(rs.music, rs[id]), label + ": music " + JSON.stringify(rs.music) + " overlaps " + id + " " + JSON.stringify(rs[id]));
  });
}

test("growing a widget on the default grid stops at its slot width: never past it, no neighbour moves or is overlapped", async function () {
  var env = boot(null);
  var p = profile();
  ownStore(env, p);
  var dom = await open(env, p);
  var before = rects(dom.stage);
  /* The slot is measured from the live grid (offsetWidth), not a constant. */
  var slot = dom.stage.querySelector('[data-tower-widget="music"]').offsetWidth;
  assert.strictEqual(slot, GRID.music[2], "music slot is the grid column");

  var seen = growSteps(env, dom, "music", 100);
  seen.forEach(function (r, i) {
    assert.ok(r[2] <= slot, "move " + (i + 1) + ": music width " + r[2] + " is past its " + slot + "px slot");
  });
  var after = rects(dom.stage);
  assert.ok(dom.stage.classList.contains("is-default-grid"), "the grow keeps grid mode (no reflow, no lift)");
  assert.strictEqual(after.music[2], slot, "music stops exactly at its slot width");
  ["avatar", "identity", "polaroid", "instax"].forEach(function (id) {
    assert.deepStrictEqual(after[id], before[id], id + ": 0px off after the grow");
  });
  assertNoOverlap(after, "after the grow");
  await wait(700);
  assert.strictEqual(layoutWrites(env).length, 0, "a grow that only hits the slot cap writes nothing");

  /* Shrink, then grow back past the slot: still capped, shrink still works. */
  resize(env, dom, "music", -80);
  assert.strictEqual(rects(dom.stage).music[2], slot - 80, "shrinking still works");
  seen = growSteps(env, dom, "music", 200);
  seen.forEach(function (r, i) {
    assert.ok(r[2] <= slot, "regrow move " + (i + 1) + ": music width " + r[2] + " is past its slot");
  });
  assert.strictEqual(rects(dom.stage).music[2], slot, "regrow stops at the slot");
  assertNoOverlap(rects(dom.stage), "after the regrow");
});

test("a stored grid size wider than the slot is capped when it is applied on open, with no write", async function () {
  var fresh = rects((await open(boot(null), profile())).stage);
  var env = boot({ _full: 1, _gridSize: { music: { w: 520 } } });
  var p = profile();
  ownStore(env, p);
  var dom = await open(env, p);
  assert.ok(dom.stage.classList.contains("is-default-grid"), "opens on the default grid");
  var rs = rects(dom.stage);
  assert.ok(rs.music[2] <= GRID.music[2], "stored 520 is drawn at most at the " + GRID.music[2] + "px slot, got " + rs.music[2]);
  assert.deepStrictEqual(rs, fresh, "every rect matches a fresh open");
  assertNoOverlap(rs, "on open");
  await wait(700);
  assert.strictEqual(layoutWrites(env).length, 0, "open writes nothing");
});

test("the row keeps the full-layout marker and grid sizes through clean(), and drops junk", function () {
  var sync = boot(null).win.CognationTowerLayoutSync;
  var c = sync._clean({ _full: 1, _gridSize: { music: { w: 388.4 }, bad: { w: "x" }, _x: { w: 1 } } });
  assert.strictEqual(c._full, 1);
  assert.deepStrictEqual(clone(c._gridSize), { music: { w: 388 } });
});
