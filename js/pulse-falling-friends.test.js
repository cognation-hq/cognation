/**
 * PULSE falling friends: N circles render, tap opens Tower, 6,000 cap,
 * quiet empty state, server-only (no demo fallback), halo pass-through.
 * Run: node js/pulse-falling-friends.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");

function El(tag) {
  this.tagName = tag; this.children = []; this.parentNode = null; this.attrs = {};
  this.style = { setProperty: function (k, v) { this[k] = v; } };
  this.classList = { _s: {}, add: function (c) { this._s[c] = 1; }, contains: function (c) { return !!this._s[c]; } };
  this.listeners = {}; this.textContent = ""; this.clientWidth = 390; this.clientHeight = 700;
}
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return this.attrs[k]; };
El.prototype.hasAttribute = function (k) { return k in this.attrs; };
El.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
El.prototype.insertBefore = function (c) { c.parentNode = this; this.children.unshift(c); return c; };
El.prototype.removeChild = function (c) { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; };
El.prototype.addEventListener = function (n, f) { this.listeners[n] = f; };
Object.defineProperty(El.prototype, "firstChild", { get: function () { return this.children[0] || null; } });
El.prototype.all = function () { var out = []; this.children.forEach(function (c) { out.push(c); out = out.concat(c.all()); }); return out; };
El.prototype.querySelector = function (sel) {
  var k = sel.replace(/^\[|\]$/g, ""); return this.all().filter(function (e) { return k in e.attrs; })[0] || null;
};
global.document = { createElement: function (t) { return new El(t); } };

var api = require("./pulse-falling-friends.js");
function uuid(n) { var h = ("000000000000" + n.toString(16)).slice(-12); return "00000000-0000-4000-8000-" + h; }
function friends(n) { var a = []; for (var i = 1; i <= n; i++) a.push({ userId: uuid(i), name: "F" + i, handle: "f" + i }); return a; }
function circles(layer) { return layer.all().filter(function (e) { return "data-circle-fall-portrait" in e.attrs; }); }

/* N friends -> N circles */
[1, 7, 250].forEach(function (n) {
  var layer = new El("div");
  api.render(layer, friends(n), {});
  assert.strictEqual(circles(layer).length, n, n + " circles render");
  assert.strictEqual(layer.getAttribute("data-circle-count"), String(n));
});

/* Tap opens that person's Tower */
var opened = null;
var layer = new El("div");
api.render(layer, friends(3), { open: function (h) { opened = h; } });
var c = circles(layer)[1];
var prevented = false;
c.listeners.click({ preventDefault: function () { prevented = true; } });
assert.strictEqual(opened, "f2", "tap opens friend Tower");
assert.ok(prevented);
assert.strictEqual(c.href, "#tower-profile-f2");

/* 6,000 cap, no sampling below it */
layer = new El("div");
api.render(layer, friends(6500), {});
assert.strictEqual(circles(layer).length, 6000, "cap at 6,000");
layer = new El("div");
var all = friends(5999);
api.render(layer, all, {});
var got = circles(layer).map(function (e) { return e.attrs["data-circle-fall-portrait"]; });
assert.deepStrictEqual(got, all.map(function (f) { return f.userId; }), "every friend, in order, no sampling");
var L = api.layout(6000, 390, 700);
assert.ok(L.scroll && L.size <= 22, "big roster gets density + scroll");
[0, 1, 777, L.cols - 1, 2 * L.cols - 1, 5999].forEach(function (i) {
  var s = api.slot(i, L, 6000);
  assert.ok(s.y >= 0 && s.y + L.size <= L.height, "circle " + i + " inside scroll area (reachable)");
  assert.ok(s.x >= 0 && s.x + L.size <= 390, "circle " + i + " inside width");
  var n = api.slot(i + 1, L, 6000);
  if (i + 1 < 6000 && Math.floor((i + 1) / L.cols) === Math.floor(i / L.cols)) assert.ok(n.x - s.x >= L.size, "no overlap " + i);
});

/* Empty: quiet real empty */
layer = new El("div");
var stack = api.render(layer, [], {});
assert.ok("data-pulse-empty" in stack.attrs, "empty flag");
assert.strictEqual(circles(layer).length, 0);
assert.strictEqual(stack.textContent, "", "no filler copy");

/* Server only: no client / no session -> [] (no demo fallback) */
api.loadFriends(null, "").then(function (r) {
  assert.deepStrictEqual(r, [], "no demo fallback");
  var src = fs.readFileSync(path.join(__dirname, "pulse-falling-friends.js"), "utf8");
  assert.ok(!/DEMO_FRIENDS/.test(src), "module never reads demo friends");
  /* Server paging + pairing via friendsFromRows */
  global.window = undefined;
  var relApi = require("./circle-saved-relations.js");
  globalThis.CognationCircleRelations = relApi;
  var me = uuid(9999);
  var rows = [], profiles = [{ user_id: me, kind: "personal", handle: "me", display_name: "Me", account_kind: "real" }];
  for (var k = 1; k <= 2500; k++) {
    rows.push({ user_id: me, friend_user_id: uuid(k), created_at: "2026-10-01T00:00:00Z" });
    profiles.push({ user_id: uuid(k), kind: "personal", handle: "f" + k, display_name: "F" + k, account_kind: "real" });
  }
  var calls = 0;
  var client = { rest: function (table, o) {
    calls++;
    if (table === "friendships") { var off = +/offset=(\d+)/.exec(o.query)[1]; return Promise.resolve(rows.slice(off, off + 1000)); }
    var ids = /in\.\(([^)]*)\)/.exec(o.query)[1].split(",");
    return Promise.resolve(profiles.filter(function (p) { return ids.indexOf(p.user_id) >= 0; }));
  } };
  return api.loadFriends(client, me);
}).then(function (list) {
  assert.strictEqual(list.length, 2500, "pages past 1,000 rows: all friends");
  assert.strictEqual(list[0].handle && list[0].handle.charAt(0), "f");

  /* Layering + pass-through */
  var css = fs.readFileSync(path.join(__dirname, "..", "css/styles.css"), "utf8");
  var block = css.slice(css.indexOf("PULSE falling friends (Designer LOOK lock"));
  assert.ok(/\.pulse-fall-stack\s*\{[^}]*z-index:\s*1/.test(block), "friends layer z1 (behind)");
  assert.ok(/\.circle-ring\s*\{[^}]*z-index:\s*2/.test(css), "halo ring z2 (in front)");
  assert.ok(/\.circle-ring \*,[\s\S]*?\.circle-spot\.is-filled,[\s\S]*?pointer-events:\s*none !important/.test(block), "halo is visual only: taps pass through");
  assert.ok(/a\.pulse-fall-circle\s*\{[^}]*pointer-events:\s*auto/.test(block), "friend circles take the tap");
  var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
  assert.ok(/CognationPulseFall\.mount\(layer/.test(tower), "PULSE open mounts falling friends");
  var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(html.indexOf("js/pulse-falling-friends.js") > 0 && html.indexOf("js/pulse-falling-friends.js") < html.indexOf("js/tower.js"), "script loads before tower.js");
  console.log("pulse-falling-friends.test.js: OK");
}).catch(function (e) { console.error(e); process.exit(1); });
