/**
 * Still here: News comment box in a FRESH browser (empty localStorage).
 * Live check 2026-10-15: browser A showed the box, browser B (fresh) showed
 * Report only. Runs the real age-floor-keywords.js + news-comments.js.
 * Run: node js/still-here-news-comments.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var code = fs.readFileSync(path.join(__dirname, "age-floor-keywords.js"), "utf8") + "\n" +
  fs.readFileSync(path.join(__dirname, "news-comments.js"), "utf8");

function mem() {
  var d = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
    _d: d,
  };
}
function el() {
  return {
    hidden: false, innerHTML: "", attrs: {}, kids: [],
    setAttribute: function (k, v) { this.attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    removeAttribute: function (k) { delete this.attrs[k]; },
    addEventListener: function () {},
    querySelector: function () { return this.kids[0] || null; },
    appendChild: function (c) { this.kids.push(c); return c; },
  };
}
function fresh(rating) {
  var listeners = {};
  var article = el();
  article.attrs = { "data-news-post": "", "data-post-id": "story-1", "data-news-rating": rating };
  var ls = mem();
  var w = { localStorage: ls };
  var birth = null;
  var session = { source: "supabase", supabaseUserId: "user-b", activeProfileId: "prof-b", profileDisplayName: "Bea" };
  w.CognationAuth = { getSession: function () { return session; } };
  w.CognationSupabase = {
    configured: function () { return true; },
    rest: function () { return Promise.resolve([]); },
  };
  var doc = {
    createElement: function () { return el(); },
    querySelectorAll: function () { return [article]; },
    addEventListener: function (n, f) { (listeners[n] = listeners[n] || []).push(f); },
  };
  vm.runInNewContext(code, { window: w, localStorage: ls, document: doc, Date: Date, Math: Math, Promise: Promise, JSON: JSON });
  return {
    w: w, ls: ls, article: article,
    host: function () { return article.kids[0]; },
    fire: function (n) { (listeners[n] || []).forEach(function (f) { f(); }); },
    setSwipe: function (o) { w.CognationCommuneSwipe = o; },
    flush: function () { return new Promise(function (r) { setTimeout(r, 0); }); },
  };
}
function hasBox(h) { return !!h && !h.hidden && /data-news-comment-form/.test(h.innerHTML) && /data-news-comment-input/.test(h.innerHTML); }

(async function () {
  /* 1) Fresh browser, PG-13 story: unknown age at first paint (rule kept: no thread). */
  var b = fresh("PG-13");
  await b.flush();
  assert.strictEqual(b.ls._d["cognation.member.profile.v1"], undefined, "storage starts empty");
  assert.strictEqual(b.host().hidden, true, "unknown age still hides a PG-13 thread (same rule)");

  /* Server hydrate lands: user_birth age 30 (not device state), profile written, event fires. */
  b.setSwipe({ getDatingBirthAge: function () { return 30; }, getMemberAge: function () { return 30; } });
  b.fire("cognation:seedops-dating-hydrate");
  await b.flush(); await b.flush();
  assert.ok(hasBox(b.host()), "fresh browser shows the comment box once the server age arrives");

  /* Same via member-profile-updated (setDatingBirthAge mirrors user_birth into the profile). */
  var c = fresh("R");
  await c.flush();
  c.ls.setItem("cognation.member.profile.v1", JSON.stringify({ age: 25, ownerUserId: "user-b" }));
  c.setSwipe({ getDatingBirthAge: function () { return 25; }, getMemberAge: function () { return 25; } });
  c.fire("cognation:member-profile-updated");
  await c.flush(); await c.flush();
  assert.ok(hasBox(c.host()), "box shows after the member profile is written in a fresh browser");

  /* 2) Fresh browser, G/PG story: box right away. */
  var g = fresh("PG");
  await g.flush(); await g.flush();
  assert.ok(hasBox(g.host()), "G/PG story shows the box in a fresh browser");

  /* 3) A real under-13 server age still hides the PG-13 thread. */
  var u = fresh("PG-13");
  await u.flush();
  u.setSwipe({ getDatingBirthAge: function () { return 11; }, getMemberAge: function () { return 11; } });
  u.fire("cognation:seedops-dating-hydrate");
  await u.flush(); await u.flush();
  assert.strictEqual(u.host().hidden, true, "under-13 server age keeps the PG-13 thread hidden");

  /* 4) Server birth age only counts for a signed-in user. */
  var src = fs.readFileSync(path.join(__dirname, "age-floor-keywords.js"), "utf8");
  assert.ok(/getDatingBirthAge\(\)/.test(src) && /if \(!sessionUserId\(\)\) return 0;\s*var swipe = root\.CognationCommuneSwipe;\s*if \(swipe && typeof swipe\.getDatingBirthAge === "function"\)/.test(src), "server age gated on signed-in user");

  console.log("still-here-news-comments.test.js: OK");
})().catch(function (e) { console.error(e); process.exit(1); });
