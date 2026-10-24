/**
 * Venmo / Pay for services / Buy ads (Pro): one card, stacked pills (Designer spec,
 * PM confirmed). Same width each (240px website, card width minus 16px each side on
 * phone), 12px gap, fully round glass pill, #d9d2f0 outline at 40%, #f7f9ff text,
 * #ED9300 ring on hover/focus only. Each pill opens the owner's own saved link in a
 * new tab; an unset link is not shown. Payments parked: plain outbound links only.
 * Personal keeps Venmo as its own logo chip. Saved layouts lose no widget or spot.
 * Run: node js/venmo-ads-buttons.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");

function fn(name) {
  var a = tower.indexOf("  function " + name + "(");
  assert.ok(a !== -1, "found " + name);
  var b = tower.indexOf("\n  }\n", a);
  return tower.slice(a, b + 4);
}
function block(start, end) {
  var a = tower.indexOf(start);
  var b = tower.indexOf(end, a + 1);
  assert.ok(a !== -1 && b > a, "found " + start);
  return tower.slice(a, b);
}

/* ---- tiny DOM, enough for renderPayLinks ---- */
function El(tag) {
  this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.parentNode = null;
  this.hidden = false; this.textContent = ""; var cls = {}; var self = this;
  this.classList = {
    add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; },
    contains: function (c) { return !!cls[c]; },
  };
  Object.defineProperty(this, "className", {
    get: function () { return Object.keys(cls).join(" "); },
    set: function (v) { cls = {}; String(v).split(/\s+/).filter(Boolean).forEach(function (c) { cls[c] = 1; }); },
  });
  Object.defineProperty(this, "innerHTML", { set: function () { self.children.forEach(function (c) { c.parentNode = null; }); self.children = []; } });
}
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; };
El.prototype.hasAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); };
El.prototype.appendChild = function (c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; };
El.prototype.removeChild = function (c) { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; return c; };
El.prototype.all = function () { var out = []; this.children.forEach(function (c) { out.push(c); out = out.concat(c.all()); }); return out; };
El.prototype.querySelector = function (sel) {
  var m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(sel);
  assert.ok(m, "selector supported: " + sel);
  return this.all().filter(function (e) { return m[2] === undefined ? e.hasAttribute(m[1]) : e.getAttribute(m[1]) === m[2]; })[0] || null;
};
Object.defineProperty(El.prototype, "href", { get: function () { return this.attrs.href; }, set: function (v) { this.attrs.href = v; } });
Object.defineProperty(El.prototype, "target", { get: function () { return this.attrs.target; }, set: function (v) { this.attrs.target = v; } });
Object.defineProperty(El.prototype, "rel", { get: function () { return this.attrs.rel; }, set: function (v) { this.attrs.rel = v; } });

var ctx = vm.createContext({ URL: URL, document: { createElement: function (t) { return new El(t); } } });
vm.runInContext([
  block("  var SOCIAL_NETWORKS = [", "  /* https only"),
  fn("safeHttpsUrl"), fn("safeHttpUrl"), fn("socialLinkDefs"), fn("socialNetAllowedForKind"),
  fn("venmoHref"), fn("socialHref"), fn("isProTower"), fn("socialWidgetId"),
  block("  var PAY_LINKS_ID", "  function socialNetIdFromWidget"),
  fn("expandSpawnRows"), fn("seedPayLinksLayout"), fn("renderPayLinks"),
  "function isPlacedPos(layout, id) { return !!(layout && layout[id] && layout[id].dragged); }",
  "var OPTED = []; function optedInSocialNetIds() { return OPTED.slice(); }",
  "this.expandSpawnRows = expandSpawnRows; this.seedPayLinksLayout = seedPayLinksLayout; this.renderPayLinks = renderPayLinks;",
  "this.setOpted = function (a) { OPTED = a; }; this.PAY_LINKS_ID = PAY_LINKS_ID;",
].join("\n"), ctx);

var PRO = { _profileKind: "professional" };
var PER = { _profileKind: "personal" };
function J(x) { return JSON.parse(JSON.stringify(x)); }

/* 1. Default rows: the money links leave the chip pairs and become ONE full-width row. */
ctx.setOpted(["x", "instagram", "venmo", "services", "ads"]);
assert.deepStrictEqual(J(ctx.expandSpawnRows([["avatar"], ["__socials__"], ["badges"]], PRO)),
  [["avatar"], ["social-x", "social-instagram"], ["pay-links"], ["badges"]], "Pro: chips in pairs, then one pay-links card");
ctx.setOpted(["x", "venmo"]);
assert.deepStrictEqual(J(ctx.expandSpawnRows([["__socials__"]], PER)), [["social-x", "social-venmo"]], "Personal: Venmo stays a chip");
ctx.setOpted(["x"]);
assert.deepStrictEqual(J(ctx.expandSpawnRows([["__socials__"]], PRO)), [["social-x"]], "no money links: no pay-links card");

/* 2. Render: Venmo, Pay for services, Buy ads; real hrefs; new tab; unset hidden. */
function render(p, links) {
  var stage = new El("div");
  var wanted = {};
  Object.keys(links).forEach(function (k) { if (links[k]) wanted[k] = true; });
  ctx.renderPayLinks(stage, p, links, wanted);
  return stage;
}
var stage = render(PRO, { venmo: "@jordan-studio", services: "https://example.com/book", ads: "example.com/ads" });
var card = stage.querySelector('[data-tower-widget="pay-links"]');
assert.ok(card && card.classList.contains("tower-sticker--pay-links"), "one pay-links card");
var group = card.querySelector("[data-tower-pay-links]");
assert.strictEqual(group.getAttribute("role"), "group", "one group");
var pills = group.children;
assert.deepStrictEqual(pills.map(function (a) { return a.textContent; }), ["Venmo", "Pay for services", "Buy ads"]);
assert.deepStrictEqual(pills.map(function (a) { return a.href; }),
  ["https://venmo.com/u/jordan-studio", "https://example.com/book", "https://example.com/ads"], "each opens the owner's own link");
pills.forEach(function (a) {
  assert.strictEqual(a.tagName, "A", "plain link");
  assert.strictEqual(a.target, "_blank");
  assert.strictEqual(a.rel, "noopener noreferrer");
  assert.ok(a.classList.contains("tower-pay-pill"), "pill class");
});

stage = render(PRO, { venmo: "", services: "", ads: "https://example.com/ads" });
assert.deepStrictEqual(stage.querySelector("[data-tower-pay-links]").children.map(function (a) { return a.textContent; }), ["Buy ads"], "no Venmo saved: Venmo hidden");
stage = render(PRO, { venmo: "", services: "", ads: "" });
assert.strictEqual(stage.querySelector('[data-tower-widget="pay-links"]'), null, "none saved: no card");
stage = render(PRO, { venmo: "", services: "http://example.com/x", ads: "javascript:alert(1)" });
assert.strictEqual(stage.querySelector('[data-tower-widget="pay-links"]'), null, "http / javascript: pay and ads links are not shown");
stage = render(PRO, { venmo: "javascript:alert(1)" });
assert.ok(/^https:\/\/venmo\.com\/u\//.test(stage.querySelector('[data-tower-pay-link="venmo"]').href), "Venmo always goes to venmo.com");
stage = render(PER, { venmo: "@jordan" });
assert.strictEqual(stage.querySelector('[data-tower-widget="pay-links"]'), null, "Personal: no pay-links card");

/* Re-render with the same links keeps the same nodes (focus is not dropped). */
stage = render(PRO, { venmo: "@a", ads: "https://example.com/ads" });
var first = stage.querySelector('[data-tower-pay-link="venmo"]');
ctx.renderPayLinks(stage, PRO, { venmo: "@a", ads: "https://example.com/ads" }, { venmo: true, ads: true });
assert.strictEqual(stage.querySelector('[data-tower-pay-link="venmo"]'), first, "same links: pills not rebuilt");
ctx.renderPayLinks(stage, PRO, { venmo: "@b", ads: "https://example.com/ads" }, { venmo: true, ads: true });
assert.strictEqual(stage.querySelector('[data-tower-pay-link="venmo"]').href, "https://venmo.com/u/b", "changed link: updated");

/* 3. Saved layouts: pay-links takes the first placed money chip's spot; old keys kept. */
var layout = {
  "social-x": { x: 10, y: 10, dragged: true },
  "social-services": { x: 40, y: 22, z: 3, tilt: 0, dragged: true, wPx: 300 },
  "social-ads": { x: 5, y: 45, dragged: true },
};
var before = J(layout);
var p = { _profileKind: "professional", widgetLayout: layout };
ctx.seedPayLinksLayout(p);
assert.deepStrictEqual(J(p.widgetLayout["pay-links"]), before["social-services"], "card sits where the owner put Pay for services");
Object.keys(before).forEach(function (k) { assert.deepStrictEqual(J(p.widgetLayout[k]), before[k], k + " kept as is"); });
p.widgetLayout["pay-links"].x = 77;
ctx.seedPayLinksLayout(p);
assert.strictEqual(p.widgetLayout["pay-links"].x, 77, "an owner-moved card is never overwritten");
var per = { _profileKind: "personal", widgetLayout: { "social-venmo": { x: 1, y: 2, dragged: true } } };
ctx.seedPayLinksLayout(per);
assert.ok(!per.widgetLayout["pay-links"], "Personal layout untouched");
var fresh = { _profileKind: "professional", widgetLayout: {} };
ctx.seedPayLinksLayout(fresh);
assert.deepStrictEqual(J(fresh.widgetLayout), {}, "default layout: nothing seeded");

/* Remove on the card does not clear any link (they are cleared in Edit profile). */
assert.ok(/if \(id === PAY_LINKS_ID\) \{\s*setProfileStatusSafe\([^)]*Edit profile[^)]*\);\s*return;/.test(tower), "remove: points to Edit profile, clears nothing");

/* Grid re-render does not re-append widgets that are already in order (keeps focus). */
assert.ok(/if \(!tailOk\) ordered\.forEach\(function \(el\) \{ stage\.appendChild\(el\); \}\);/.test(tower), "no-op re-append skipped");

/* 4. Designer spec CSS. */
function rule(sel) {
  var i = css.indexOf(sel + " {");
  assert.ok(i !== -1, "rule " + sel);
  return css.slice(i, css.indexOf("}", i));
}
var pill = rule(".tower-pay-links .tower-pay-pill");
assert.ok(/width: 240px;/.test(pill), "240px on the website");
assert.ok(/border-radius: 999px;/.test(pill), "fully round");
assert.ok(/background: rgba\(18, 16, 38, 0\.92\);/.test(pill), "glass bg");
assert.ok(/backdrop-filter: blur\(\d+px\);/.test(pill), "blur");
assert.ok(/border: 1px solid rgba\(217, 210, 240, 0\.4\);/.test(pill), "#d9d2f0 outline at 40%");
assert.ok(/color: #f7f9ff;/.test(pill), "#f7f9ff text");
assert.ok(/box-shadow: none;/.test(pill) && !/ED9300/i.test(pill), "no ring at rest");
var ring = css.slice(css.indexOf(".tower-pay-links .tower-pay-pill:hover,"), css.indexOf("}", css.indexOf(".tower-pay-links .tower-pay-pill:hover,")));
assert.ok(/\.tower-pay-pill:focus-visible/.test(ring) && /box-shadow: 0 0 0 2px #ED9300;/.test(ring), "#ED9300 ring on hover/focus");
var grp = rule(".tower-pay-links");
assert.ok(/flex-direction: column;/.test(grp) && /gap: 12px;/.test(grp), "stacked, 12px gap");
assert.ok(/\.tower-sticker--pay-links\.is-spawned \{[^}]*padding: 16px;/.test(css), "16px each side inside the card");
assert.ok(/is-phone-stack \.tower-pay-links \.tower-pay-pill \{\s*width: 100%;/.test(css), "phone: full card width");
assert.ok(/#panel-tower \.tower-pay-links \.tower-pay-pill,[\s\S]{0,200}color: #f7f9ff !important;/.test(css), "text stays #f7f9ff over the panel link colour");
var payCss = css.slice(css.indexOf("/* Venmo / Pay for services / Buy ads (Pro)"), css.indexOf("color: #f7f9ff !important;"));
assert.ok(!/yellow|#ff0|#ffd|#fde/i.test(payCss), "no yellow");

/* 5. Payments parked: no payment SDK, no checkout call. */
var renderSrc = fn("renderPayLinks");
assert.ok(!/fetch\(|rpc\(|rest\(|checkout|stripe|paypal/i.test(renderSrc), "no live payment, no spend");

console.log("venmo-ads-buttons tests passed");
