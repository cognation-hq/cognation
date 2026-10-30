/**
 * Older Tower rows with a stale emoji grid nudge open un-pushed
 * (emoji-stale-nudge-render, follow-up to #334 emoji-drag-no-push).
 *  Before #334 an emoji drag on the default grid saved the emoji in
 *  layout._gridNudge. On open, applyGridNudge still marks that emoji
 *  data-grid-nudge, and the rule `.is-default-grid > [data-grid-nudge]
 *  { position: relative }` put the emoji into the grid flow as the first grid
 *  item: every grid widget sat ~89px lower (stage 957.1 -> 1045.9 at 1280).
 *  Render-only fix: a saved emoji nudge positions only that emoji (it stays
 *  absolute over the grid at its own spot, moved by its nudge) and never adds
 *  height to the grid flow. No migration: opening, reloading and Reset write
 *  nothing they did not write before; the saved row is left as it is.
 *
 * Same tiny fake DOM as emoji-drag-no-push.test.js, but whether an emoji is in
 * the grid flow comes from css/styles.css itself: the `position` (and
 * `z-index`) the real cascade gives it (specificity, !important, order,
 * @media at the page width). Stubbed session and client only; nothing leaves
 * the process.
 * Run: node --test js/emoji-stale-nudge-render.test.js
 * ESNR_ROOT=<checkout> runs it against another checkout (fail-on-base).
 */
"use strict";

var test = require("node:test");
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

/* ESNR_ROOT lets the same test run against another checkout (fail-on-base). */
var root = process.env.ESNR_ROOT ? path.resolve(process.env.ESNR_ROOT) : path.join(__dirname, "..");
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

/* ---------- CSS cascade model (css/styles.css, two-compound selectors) ---------- */
var VIEW_W = 1280;
function parseCss(text) {
  var css = text.replace(/\/\*[\s\S]*?\*\//g, "");
  var rules = [];
  var i = 0, order = 0;
  function block(media) {
    while (i < css.length) {
      var open = css.indexOf("{", i), close = css.indexOf("}", i);
      if (close >= 0 && (open < 0 || close < open)) { i = close + 1; return; }
      if (open < 0) { i = css.length; return; }
      var head = css.slice(i, open).trim();
      i = open + 1;
      if (/^@media/.test(head)) { block(media.concat([head])); continue; }
      if (/^@/.test(head)) { block(media.concat(["@never"])); continue; }
      var end = css.indexOf("}", i);
      var body = css.slice(i, end);
      i = end + 1;
      rules.push({ selectors: head.split(","), body: body, media: media, order: order++ });
    }
  }
  block([]);
  return rules;
}
function mediaOn(q, w) {
  if (q === "@never") return false;
  var s = q.replace(/^@media\s*/, "");
  if (/prefers-|hover|pointer|print|orientation/.test(s)) return false;
  var ok = true;
  s.replace(/\(\s*(min|max)-width\s*:\s*([\d.]+)px\s*\)/g, function (_, k, n) {
    n = parseFloat(n);
    if (k === "min" && !(w >= n)) ok = false;
    if (k === "max" && !(w <= n)) ok = false;
  });
  return ok;
}
function specificity(sel) {
  var a = 0, b = 0, c = 0;
  sel.replace(/#[\w-]+/g, function () { a++; return ""; })
    .replace(/\[[^\]]*\]|\.[\w-]+|:(?!:)[\w-]+/g, function () { b++; return ""; })
    .replace(/(^|[\s>+~])[a-z][\w-]*/gi, function () { c++; return ""; });
  return a * 10000 + b * 100 + c;
}
var RULES = null;
function rules() { return RULES || (RULES = parseCss(src("css/styles.css"))); }
/* The declaration the cascade gives `prop` on a direct child `el` of `stage`. */
function cascaded(el, stage, prop) {
  var best = null;
  rules().forEach(function (r) {
    if (!r.media.every(function (q) { return mediaOn(q, VIEW_W); })) return;
    var re = new RegExp("(?:^|;)\\s*" + prop + "\\s*:\\s*([^;]+)", "i");
    var m = re.exec(r.body);
    if (!m) return;
    var value = m[1].trim();
    var imp = /!important$/.test(value);
    value = value.replace(/\s*!important$/, "");
    r.selectors.forEach(function (sel) {
      sel = sel.trim();
      var sm = /^(\S+)\s*(>)?\s+(\S+)$|^(\S+)\s*>\s*(\S+)$/.exec(sel);
      if (!sm) return;
      var a = sm[1] || sm[4], b = sm[3] || sm[5];
      if (!matchesCompound(stage, a) || !matchesCompound(el, b)) return;
      var rank = [imp ? 1 : 0, specificity(sel), r.order];
      if (!best || rank[0] > best.rank[0] || (rank[0] === best.rank[0] && (rank[1] > best.rank[1] || (rank[1] === best.rank[1] && rank[2] > best.rank[2])))) {
        best = { rank: rank, value: value, sel: sel };
      }
    });
  });
  return best;
}
function positionOf(el, stage) { var d = cascaded(el, stage, "position"); return d ? d.value : "static"; }
/* An emoji the cascade does not take out of flow is a grid item (first cell). */
function emojiInFlow(stage) {
  if (!stage.classList.contains("is-default-grid")) return false;
  return stage.children.some(function (c) {
    return c.hasAttribute("data-tower-emoji") && !/^(absolute|fixed)$/.test(positionOf(c, stage));
  });
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
  if (el.hasAttribute("data-tower-emoji")) return emojiRect(el, stage);
  /* The name sits inside the avatar card (placeMessageEnvelope), as on the
     1280 page: it rides with the card, at the same offset. */
  if (id === "identity" && el.parentNode && el.parentNode.classList.contains("tower-avatar-stack")) {
    var card = layoutRect(el.parentNode.parentNode);
    return [card[0] + GRID.identity[0] - GRID.avatar[0], card[1] + GRID.identity[1] - GRID.avatar[1], GRID.identity[2], GRID.identity[3]];
  }
  if (!GRID[id]) return [0, 0, 0, 0];
  if (stage.classList.contains("is-default-grid")) {
    var g = GRID[id].slice();
    /* The CSS rule .is-default-grid > [data-grid-nudge] { position: relative } puts
       a nudged emoji into the grid flow as the first item: its row pushes the grid. */
    if (emojiInFlow(stage)) g[1] += EMOJI_ROW;
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

/* Emoji on the 1280 page: 84x73, absolute at its --sticker-x/y over the stage;
   in the grid flow (nudged) it takes the first cell, 89px with the row gap. */

/* Emoji on the 1280 page: 84x73, absolute at its --sticker-x/y over the stage
   (plus its translate); in the grid flow it takes the first cell, 89px with
   the row gap, and pushes every grid widget down. */
var EMOJI_W = 84, EMOJI_H = 73, EMOJI_ROW = 89;
function emojiRect(el, stage) {
  var t = translateOf(el);
  if (stage.classList.contains("is-default-grid") && !/^(absolute|fixed)$/.test(positionOf(el, stage))) {
    return [GRID.avatar[0] + t[0], GRID.avatar[1] + t[1], EMOJI_W, EMOJI_H];
  }
  var x = px(el.style.getPropertyValue("--sticker-x"));
  var y = px(el.style.getPropertyValue("--sticker-y"));
  return [(x == null ? 78 : x) / 100 * STAGE_W + t[0], (y == null ? 12 : y) / 100 * STAGE_H + t[1], EMOJI_W, EMOJI_H];
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
function exactSame(a, b, label) {
  GRID_IDS.forEach(function (id) {
    assert.deepStrictEqual(b[id], a[id], label + ": " + id + " " + JSON.stringify(a[id]) + " -> " + JSON.stringify(b[id]));
  });
}

/* ---------- emoji-stale-nudge-render ---------- */
function emojiRectOf(dom, id) { var r = dom.stage.querySelector('[data-tower-widget="' + (id || EMOJI) + '"]').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }
/* Page width for the @media rules follows the width the page opens at. */
var openAt = openE;
openE = function (env, p, width) { VIEW_W = width === 390 ? 390 : 1280; return openAt(env, p, width); };
var OLD = { _full: 1, _gridNudge: { "emoji-fire": { dx: -120, dy: 120 } } };
function oldProfile() { var p = emojiProfile(); p.widgetLayout = clone(OLD); return p; }
/* This browser's local copy from before #334 (the owner's own device). */
function seedLocal(env) {
  var doc = {};
  doc[OWNER_PROFILE] = { widgetLayout: clone(OLD), emojiStickers: [{ id: EMOJI, size: 56 }] };
  env.win.localStorage.setItem(LOCAL_KEY, JSON.stringify(doc));
}
async function freshOpen(width) {
  var env = boot(null, width); var p = emojiProfile(); ownStore(env, p);
  var dom = await openE(env, p, width);
  return { env: env, dom: dom, rects: exactRects(dom.stage), emoji: emojiRectOf(dom) };
}
async function oldOpen(width, local) {
  var env = boot(OLD, width); if (local) seedLocal(env);
  var p = oldProfile(); ownStore(env, p);
  var dom = await openE(env, p, width);
  return { env: env, dom: dom, p: p };
}
/* Every save path the page has (row upsert and the profile store), stubbed and counted. */
function countSaves(env) {
  var n = { store: 0 };
  var store = env.win.CognationTowerProfileStore;
  var save = store.save;
  store.save = function () { n.store++; return save.apply(store, arguments); };
  return n;
}
function noEmojiInFlow(dom, label) {
  assert.ok(!emojiInFlow(dom.stage), label + ": no emoji in the grid flow (" + dom.stage.children.filter(function (c) { return c.hasAttribute("data-tower-emoji"); }).map(function (c) { return positionOf(c, dom.stage); }).join(",") + ")");
}

test("1280: an older row with an emoji grid nudge opens un-pushed: no grid height added, every grid widget 0px from a fresh open", async function () {
  var fresh = await freshOpen();
  var o = await oldOpen();
  assert.ok(o.dom.stage.classList.contains("is-default-grid"), "opens on the default grid");
  assert.ok(emojiEl(o.dom).hasAttribute("data-grid-nudge"), "the saved nudge is still read (not dropped)");
  noEmojiInFlow(o.dom, "old row open");
  exactSame(fresh.rects, exactRects(o.dom.stage), "old row vs fresh open");
});

test("1280: the saved emoji nudge positions only that emoji (its own spot moved by the nudge)", async function () {
  var fresh = await freshOpen();
  var o = await oldOpen();
  var e = emojiRectOf(o.dom);
  assert.deepStrictEqual(e, [fresh.emoji[0] - 120, fresh.emoji[1] + 120, fresh.emoji[2], fresh.emoji[3]], "emoji at its spot + (-120, 120): " + JSON.stringify(fresh.emoji) + " -> " + JSON.stringify(e));
  var z = cascaded(emojiEl(o.dom), o.dom.stage, "z-index");
  var zFresh = cascaded(emojiEl(fresh.dom), fresh.dom.stage, "z-index");
  assert.strictEqual(z && z.value, zFresh && zFresh.value, "the emoji keeps its own stacking (z-index as a fresh open)");
});

test("1280: the owner's local copy from before #334 opens the same (DB row + local copy)", async function () {
  var fresh = await freshOpen();
  var o = await oldOpen(undefined, true);
  assert.ok(emojiEl(o.dom).hasAttribute("data-grid-nudge"));
  noEmojiInFlow(o.dom, "local copy open");
  exactSame(fresh.rects, exactRects(o.dom.stage), "local copy vs fresh open");
});

test("opening, reloading and Reset make 0 writes the fix did not: no migration, the old row stays as saved", async function () {
  var o = await oldOpen(undefined, true);
  var n = countSaves(o.env);
  var local0 = o.env.win.localStorage.getItem(LOCAL_KEY);
  o.env.win.__dragHook.spawnUnplacedWidgets(o.dom.root, o.p);
  o.env.win.__dragHook.renderEmojiStickers(o.dom.root, o.p);
  await wait(700);
  assert.strictEqual(layoutWrites(o.env).length, 0, "open: 0 layout writes");
  assert.strictEqual(o.env.writes.length, 0, "open: 0 writes of any kind");
  assert.strictEqual(n.store, 0, "open: the save path is never called");
  assert.strictEqual(o.env.win.localStorage.getItem(LOCAL_KEY), local0, "open: the local copy is left as it was");
  /* Reload: a new page with the same row and local copy. */
  var env2 = boot(OLD); env2.win.localStorage.setItem(LOCAL_KEY, local0);
  var p2 = oldProfile(); ownStore(env2, p2); var n2 = countSaves(env2);
  var dom2 = await openE(env2, p2);
  await wait(700);
  assert.strictEqual(env2.writes.length, 0, "reload: 0 writes");
  assert.strictEqual(n2.store, 0, "reload: the save path is never called");
  /* Reset is the owner's own action: it writes one row, as on a fresh layout. */
  var f = await freshOpen();
  clickReset(f.dom); await wait(700);
  var freshReset = layoutWrites(f.env).length;
  clickReset(dom2); await wait(700);
  assert.strictEqual(layoutWrites(env2).length, freshReset, "Reset: the same writes as a Reset on a fresh layout (" + freshReset + "), none added");
  var env3 = boot(lastRow(env2)); env3.win.localStorage.setItem(LOCAL_KEY, env2.win.localStorage.getItem(LOCAL_KEY));
  var p3 = emojiProfile(); ownStore(env3, p3);
  var dom3 = await openE(env3, p3);
  await wait(700);
  assert.strictEqual(env3.writes.length, 0, "Reset reload: 0 writes");
});

test("1280: reload and Reset of an older row stay un-pushed (0px from a fresh open)", async function () {
  var fresh = await freshOpen();
  var o = await oldOpen(undefined, true);
  var env2 = boot(OLD); env2.win.localStorage.setItem(LOCAL_KEY, o.env.win.localStorage.getItem(LOCAL_KEY));
  var p2 = oldProfile(); ownStore(env2, p2);
  var dom2 = await openE(env2, p2);
  noEmojiInFlow(dom2, "reload");
  exactSame(fresh.rects, exactRects(dom2.stage), "reload vs fresh open");
  clickReset(dom2); await wait(700);
  noEmojiInFlow(dom2, "after Reset");
  exactSame(fresh.rects, exactRects(dom2.stage), "Reset vs fresh open");
  assert.deepStrictEqual(emojiRectOf(dom2), fresh.emoji, "Reset: the emoji back at its default spot");
});

test("390 is unchanged: an older row opens as the phone stack, same as a fresh open, 0 writes", async function () {
  var fresh = await freshOpen(390);
  var o = await oldOpen(390, true);
  await wait(700);
  exactSame(fresh.rects, exactRects(o.dom.stage), "390 old row vs fresh");
  assert.deepStrictEqual(emojiRectOf(o.dom), fresh.emoji, "390: the emoji where a fresh open puts it");
  assert.strictEqual(o.env.writes.length, 0, "390: 0 writes");
});

test("a grid widget nudge still rides in the grid (relative, unchanged); only emojis float", async function () {
  var row = { _full: 1, _gridNudge: { polaroid: { dx: 60, dy: 0 } } };
  var env = boot(row); var p = emojiProfile(); p.widgetLayout = clone(row); ownStore(env, p);
  var dom = await openE(env, p);
  var pol = dom.stage.querySelector('[data-tower-widget="polaroid"]');
  assert.ok(pol.hasAttribute("data-grid-nudge"));
  assert.strictEqual(positionOf(pol, dom.stage), "relative", "a nudged grid widget keeps position: relative");
  var z = cascaded(pol, dom.stage, "z-index");
  assert.strictEqual(z && z.value, "3", "and rides above its neighbours (z 3)");
  var fresh = await freshOpen();
  var r = exactRects(dom.stage);
  assert.deepStrictEqual(r.polaroid, [fresh.rects.polaroid[0] + 60, fresh.rects.polaroid[1], fresh.rects.polaroid[2], fresh.rects.polaroid[3]], "polaroid nudged 60px");
  ["avatar", "identity", "music", "instax"].forEach(function (id) { assert.deepStrictEqual(r[id], fresh.rects[id], id + " keeps its rect"); });
  await wait(700);
  assert.strictEqual(env.writes.length, 0, "0 writes");
});

test("CSS: the grid-nudge rule is kept for grid-laid widgets; a nudged emoji is taken back out of the flow", function () {
  var css = src("css/styles.css");
  assert.ok(/\.tower-layout--scrapbook\.is-sticker-stage\.is-default-grid > \[data-grid-nudge\]\s*\{[^}]*position: relative/.test(css), "the nudge rule is still there");
  var stage = new El("div", { "class": "tower-layout tower-layout--scrapbook is-sticker-stage is-default-grid" });
  var em = new El("div", { "data-tower-widget": EMOJI, "data-tower-emoji": EMOJI, "data-grid-nudge": "-120,120", "class": "tower-sticker tower-sticker--emoji" });
  stage.appendChild(em);
  VIEW_W = 1280;
  assert.strictEqual(positionOf(em, stage), "absolute", "a nudged emoji is absolute (" + JSON.stringify(cascaded(em, stage, "position")) + ")");
});
