/**
 * PULSE falling friends: N circles render, tap opens Tower, cap 30 (Alexa
 * final spec 2026-10-20), placed outside the ring + frames, quiet empty
 * state, server-only (no demo fallback), reduced motion is still.
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

/* N friends -> N circles (up to the cap) */
[1, 7, 30].forEach(function (n) {
  var layer = new El("div");
  api.render(layer, friends(n), { width: 390, height: 844, band: { top: 300, bottom: 480 } });
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

/* Cap 30 (seed-0001 showed 41 live) */
assert.strictEqual(api.cap, 30, "PULSE_FALL_CAP = 30");
assert.ok(/var PULSE_FALL_CAP = 30;/.test(fs.readFileSync(path.join(__dirname, "pulse-falling-friends.js"), "utf8")));
layer = new El("div");
api.render(layer, friends(41), { width: 390, height: 844, band: { top: 300, bottom: 480 } });
assert.strictEqual(circles(layer).length, 30, "41 friends -> 30 circles");
var got = circles(layer).map(function (e) { return e.attrs["data-circle-fall-portrait"]; });
assert.deepStrictEqual(got, friends(30).map(function (f) { return f.userId; }), "given order kept (least engaged first)");

/* Placement: never over the ring band, inside the panel, smaller than frame photos */
[[390, 844, { top: 330, bottom: 478 }, 28], [1280, 900, { top: 200, bottom: 668 }, 40], [358, 600, { top: 200, bottom: 420 }, 28]].forEach(function (t) {
  var L = api.layoutOutside(30, t[0], t[1], t[2]);
  assert.strictEqual(L.slots.length, 30, t[0] + ": all 30 placed");
  assert.ok(L.size <= t[3], t[0] + ": circle " + L.size + "px stays under the smallest frame photo");
  L.slots.forEach(function (s, i) {
    assert.ok(s.y + L.size <= t[2].top || s.y >= t[2].bottom, t[0] + ": circle " + i + " clear of ring + frames");
    assert.ok(s.x >= 0 && s.x + L.size <= t[0] && s.y >= 0 && s.y + L.size <= t[1], t[0] + ": circle " + i + " inside panel");
    var n = L.slots[i + 1];
    if (n && n.y === s.y) assert.ok(n.x - s.x >= L.size, "no overlap " + i);
  });
});
/* Fall from the top of the page; Unfriend and Check in sit under each circle. */
assert.ok(circles(layer).every(function (e) { return e.style["--pulse-fall-from"] === "-100vh"; }), "fall from the top");
assert.ok(layer.all().some(function (e) { return e.textContent === "Unfriend"; }) && layer.all().some(function (e) { return e.textContent === "Check in"; }), "unfriend or check in");

/* Outside-layout still refuses a full-bleed band. The dock itself still lands them at the bottom. */
var tight = api.layoutOutside(30, 390, 300, { top: 0, bottom: 300 });
assert.strictEqual(tight.slots.length, 0, "no free room -> no circles over the ring");
layer = new El("div");
api.render(layer, friends(5), { width: 390, height: 300, band: { top: 0, bottom: 300 } });
assert.strictEqual(circles(layer).length, 5, "least-engaged still land at the bottom");

/* Breathe/bounce motion; reduced motion is still */
var cssAll = fs.readFileSync(path.join(__dirname, "..", "css/styles.css"), "utf8");
var spec = cssAll.slice(cssAll.indexOf("PULSE friends by engagement (Alexa final spec 2026-10-20)"));
assert.ok(/pulse-fall-breathe 3\.4s ease-in-out infinite alternate/.test(spec) && /@keyframes pulse-fall-breathe/.test(spec), "falling circles breathe");
assert.ok(!/rotate\(/.test(spec.slice(spec.indexOf("@keyframes pulse-fall-breathe"), spec.indexOf("}\n}", spec.indexOf("@keyframes pulse-fall-breathe")))), "no orbit/rotation in the breathe");
assert.ok(/\.circle-fall\[data-pulse-bg\] \.pulse-fall-stack \{ opacity: 0\.8; \}/.test(spec), "lighter than the frame photos");
var rm = spec.slice(spec.indexOf("@media (prefers-reduced-motion: reduce)"));
assert.ok(/a\.pulse-fall-circle \{ animation: none !important; transform: none !important; \}/.test(rm), "reduced motion: falling circles still");
assert.ok(/::after \{ animation: none !important; transform: none !important; \}/.test(rm), "reduced motion: strands still");

/* Designer r3: halo frame names sit below the photo (Oswald 12px, 11px on phones,
   light shadow) and the band the circles avoid includes them. */
var r3 = spec.slice(spec.indexOf("Halo frame names (Designer r3)"));
var r3cap = r3.slice(0, r3.indexOf("}") + 1);
assert.ok(/font-family: "Oswald"/.test(r3cap), "names in Oswald");
assert.ok(/--pulse-name-px: 12px/.test(r3cap) && /font-size: calc\(var\(--pulse-name-px\) \/ var\(--pulse-spot-s, 1\)\)/.test(r3cap), "12px on screen, undoing the frame scale");
assert.ok(/max-width: 600px\) \{\s*\.circle-fall\[data-pulse-bg\] \.circle-spot-caption \{ --pulse-name-px: 11px; \}/.test(r3), "11px on phones");
assert.ok(/top: calc\(100% \+ 6px \/ var\(--pulse-spot-s, 1\)\)/.test(r3cap) && /transform: translateX\(-50%\);/.test(r3cap) && !/-0\.28em/.test(r3cap), "name fully below the photo (6px gap), no overlap");
assert.ok(/text-shadow: 0 calc\(1px[^;]*rgba\(6, 10, 30, 0\.55\)/.test(r3cap), "light shadow");
var towerSrc = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
assert.ok(/setProperty\("--pulse-spot-s", \(sq\.s \* grow\)\.toFixed\(3\)\)/.test(towerSrc), "frames publish their scale for the names");

function styleStub() {
  var st = { transform: "" , _p: {} };
  st.setProperty = function (k, v) { this._p[k] = String(v); };
  st.getPropertyValue = function (k) { return this._p[k] || ""; };
  st.removeProperty = function (k) { delete this._p[k]; };
  return st;
}
function phoneLayer(w, h, spots) {
  var L = new El("div"); L.clientWidth = w; L.clientHeight = h; L.style = styleStub();
  L.querySelectorAll = function () { return spots || []; };
  return L;
}
global.getComputedStyle = function () { return { getPropertyValue: function (k) { return k === "--pulse-bg-k" ? "0.292" : ""; } }; };
/* caption below the photo is part of the blocked band */
var capEl = { offsetTop: 76, offsetHeight: 26 };
var spotEl = { offsetHeight: 70.4, style: { transform: "translate(-50%, -50%) translate(3.5px,42.6px) scale(0.770)" }, querySelector: function () { return capEl; } };
var bL = phoneLayer(390, 844, [spotEl]);
var bb = api.blockedBand(bL);
var cy0 = 844 * 0.48;
assert.ok(Math.abs(bb.bottom - (cy0 + 42.6 - 70.4 * 0.77 / 2 + (76 + 26) * 0.77)) < 0.01, "band bottom = caption bottom (gap included), scaled with the frame");
/* 390: group lifted to the vertical centre of the panel; circles stay below the halo */
var cL = phoneLayer(390, 844, [spotEl]);
api.render(cL, friends(30), { width: 390, height: 844, center: true, avoid: function () { return api.blockedBand(cL); } });
var ry = cL.style.getPropertyValue("--pulse-ring-y");
assert.ok(/^[\d.]+px$/.test(ry) && parseFloat(ry) < cy0, "390: ring lifted (" + ry + ")");
var band2 = api.blockedBand(cL);
var cs2 = circles(cL);
var bottom2 = Math.max.apply(null, cs2.map(function (e) { return parseFloat(e.style.top) + parseFloat(e.style.width); }));
assert.ok(cs2.every(function (e) { var y = parseFloat(e.style.top); return y >= 0 && y < 844; }), "390: circles stay on the page");
assert.ok(bottom2 > 700, "390: least-engaged land at the bottom (" + bottom2.toFixed(0) + ")");
/* 1280: unchanged, ring stays at 48% */
var dL = phoneLayer(1280, 900, []);
dL.style.setProperty("--pulse-ring-y", "100px");
api.render(dL, friends(30), { width: 1280, height: 900, center: true, avoid: function () { return api.blockedBand(dL); } });
assert.strictEqual(dL.style.getPropertyValue("--pulse-ring-y"), "", "1280: no lift, ring at 48%");
delete global.getComputedStyle;
assert.ok(/top: var\(--pulse-ring-y, 48%\)/.test(cssAll) && /top: calc\(var\(--pulse-ring-y, 48%\) - 262px \* var\(--pulse-bg-k\)\)/.test(cssAll), "frames and image follow the lifted ring centre");

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
  assert.strictEqual(list.length, 2500, "pages past 1,000 rows: every friend is ranked (only 30 fall)");
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
  var start = tower.slice(tower.indexOf("function startCircleFall()"));
  start = start.slice(0, start.indexOf("    return;\n"));
  assert.ok(!/CognationPulseMutual\.mount\(/.test(start), "halo frames come from engagement, not the mutual-activity fill");
  assert.ok(!/CognationCircleRelations\.mount\(/.test(start), "no 'X and Y became friends.' pairs list on PULSE");
  var api2 = tower.slice(tower.indexOf("window.CognationCircleFall = {"), tower.indexOf("window.CognationTowerOpenOwn"));
  assert.ok(!/CognationCircleRelations\.mount\(/.test(api2), "refresh does not bring the pairs list back");
  var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(html.indexOf("js/pulse-falling-friends.js") > 0 && html.indexOf("js/pulse-falling-friends.js") < html.indexOf("js/tower.js"), "script loads before tower.js");
  console.log("pulse-falling-friends.test.js: OK");
}).catch(function (e) { console.error(e); process.exit(1); });
