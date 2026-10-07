/**
 * News comments: an unknown viewer age is treated as under-13, so only
 * G/PG stories show a comment thread. A known age still works as before.
 * Run: node js/news-comments-unknown-age.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var code = fs.readFileSync(path.join(__dirname, "..", "js", "news-comments.js"), "utf8");

function mem(seed) {
  var d = Object.assign({}, seed || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
}
function load(opts) {
  opts = opts || {};
  var w = {};
  if (opts.swipeAge !== undefined) {
    w.CognationCommuneSwipe = { getMemberAge: function () { return opts.swipeAge; } };
  }
  var ls = mem(opts.profile ? { "cognation.member.profile.v1": JSON.stringify(opts.profile) } : null);
  vm.runInNewContext(code, { window: w, localStorage: ls, Date: Date, Math: Math });
  return w.CognationNewsComments;
}
function host() {
  return { hidden: false, innerHTML: "x", attrs: {}, setAttribute: function (k, v) { this.attrs[k] = v; } };
}

/* Unknown: no swipe module, no saved profile. */
var unknown = load();
assert.ok(unknown.viewerAge() < 13, "unknown age is under-13");
assert.strictEqual(unknown.isThreadVisible("G-PG"), true, "G/PG thread shows");
assert.strictEqual(unknown.isThreadVisible("PG"), true);
assert.strictEqual(unknown.isThreadVisible("PG-13"), false, "PG-13 thread hidden");
assert.strictEqual(unknown.isThreadVisible("R"), false);
assert.strictEqual(unknown.isThreadVisible(""), false, "unrated thread hidden");

/* Swipe module present but no age saved (returns null) -> still unknown. */
assert.strictEqual(load({ swipeAge: null }).isThreadVisible("PG-13"), false);
/* Saved profile with no age field -> unknown. */
assert.strictEqual(load({ profile: { country: "United States" } }).isThreadVisible("PG-13"), false);

/* Known ages unchanged. */
assert.strictEqual(load({ swipeAge: 28 }).isThreadVisible("PG-13"), true, "adult via swipe profile");
assert.strictEqual(load({ profile: { age: 16 } }).isThreadVisible("R"), true, "teen via saved profile");
assert.strictEqual(load({ profile: { age: 11 } }).isThreadVisible("PG-13"), false, "known under-13");
assert.strictEqual(load({ profile: { age: 11 } }).isThreadVisible("G-PG"), true);

/* mount() renders nothing for a non-G/PG story when age is unknown, but keeps the slot. */
var api = load();
var article = {
  attrs: { "data-post-id": "s-pg13", "data-news-rating": "PG-13" }, kids: [],
  getAttribute: function (k) { return this.attrs[k] || null; },
  setAttribute: function (k, v) { this.attrs[k] = v; },
  querySelector: function () { return this.kids[0] || null; },
  appendChild: function (c) { this.kids.push(c); return c; },
};
var ctxDoc = null;
var w2 = {};
vm.runInNewContext(code, {
  window: w2, localStorage: mem(), Date: Date, Math: Math,
  document: ctxDoc = {
    createElement: function () { var h = host(); h.addEventListener = function () {}; return h; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
  },
});
var slot = w2.CognationNewsComments.mount(article, { id: "s-pg13", rating: "PG-13" });
assert.strictEqual(slot.hidden, true, "PG-13 thread hidden for unknown age");
assert.strictEqual(slot.innerHTML, "", "no comments, reacts or composer rendered");
assert.ok(ctxDoc && api);

console.log("news-comments-unknown-age.test.js: ok");
