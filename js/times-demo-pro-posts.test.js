/**
 * The 5 hard-coded demo professional posts are gone (Mira Chen · Wellness fp1/fp2,
 * Jordan Lee · Civic Help fp1/fp2, Alexa's alexa-svc-1). Stored copies drop only
 * when post id and page both match; real featured posts stay; the demo page
 * records stay; all 5 ensureDemoProfessionals() callers still work.
 * Real js/accounts.js + js/tower.js + js/people-search.js in a vm.
 * Run: node js/times-demo-pro-posts.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var accountsSrc = src("js/accounts.js");
var towerSrc = src("js/tower.js");

var DEMO_TITLES = ["Neighborhood stretch drop-in", "Breathwork for busy weeks", "Zoning packet office hours",
  "Tenant rights clinic", "Cognation concierge office hours"];
var DEMO_BODIES = ["Saturday mornings on the green", "15-minute noon reset", "Free 20-minute consults",
  "bring your lease questions", "Book a guided intro to Tower"];
DEMO_TITLES.concat(DEMO_BODIES).forEach(function (t) {
  assert.ok(accountsSrc.indexOf(t) === -1 || /retired|Removed:/.test(accountsSrc.slice(Math.max(0, accountsSrc.indexOf(t) - 600), accountsSrc.indexOf(t))),
    "accounts.js no longer seeds: " + t);
});
assert.ok(!/featuredPosts:\s*\[\s*\{/.test(accountsSrc), "accounts.js writes no hard-coded featured posts");
assert.ok(!/featuredPosts = \[/.test(accountsSrc), "accounts.js assigns no hard-coded featured posts");

/* The 5 callers. */
var callers = [];
[["js/tower.js", towerSrc], ["js/people-search.js", src("js/people-search.js")]].forEach(function (f) {
  var re = /ensureDemoProfessionals\(\)/g, m;
  while ((m = re.exec(f[1]))) callers.push(f[0]);
});
assert.strictEqual(callers.length, 5, "5 callers of ensureDemoProfessionals (" + callers.join(", ") + ")");

function memoryStorage() {
  var d = {};
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } };
}
function boot(storage) {
  var listeners = {};
  var doc = {
    readyState: "complete",
    body: { classList: { contains: function () { return false; }, add: function () {}, remove: function () {} } },
    addEventListener: function (t, fn) { (listeners[t] || (listeners[t] = [])).push(fn); },
    removeEventListener: function () {}, dispatchEvent: function () { return true; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getElementById: function () { return null; },
    createElement: function () { return { innerHTML: "", style: {}, setAttribute: function () {}, appendChild: function () {}, querySelectorAll: function () { return []; } }; },
  };
  var win = {
    document: doc, localStorage: storage, sessionStorage: memoryStorage(), location: { hash: "", href: "https://cognation.test/" },
    addEventListener: function () {}, removeEventListener: function () {},
    CustomEvent: function (t, i) { this.type = t; this.detail = i && i.detail; },
    CognationAuth: { getSession: function () { return null; } },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: storage, sessionStorage: win.sessionStorage, location: win.location,
    console: console, CustomEvent: win.CustomEvent, URL: URL, setTimeout: setTimeout, clearTimeout: clearTimeout,
  });
  vm.runInContext(src("js/age-floor-keywords.js"), ctx);
  vm.runInContext(src("js/auto-rate.js"), ctx);
  vm.runInContext(accountsSrc, ctx);
  vm.runInContext(towerSrc, ctx);
  vm.runInContext(src("js/people-search.js"), ctx);
  return win;
}
function fnSource(code, name) {
  var start = code.indexOf("function " + name + "(");
  assert.ok(start > 0, name + " exists");
  var depth = 0, i = code.indexOf("{", start);
  for (; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) break;
  }
  return code.slice(start, i + 1);
}
function profiles(storage) { return JSON.parse(storage.getItem("cognation.profiles.v1")).profiles; }
function isDemoPro(p) {
  var t = String(p.title || "") + " " + String(p.body || "");
  return DEMO_TITLES.some(function (x) { return t.indexOf(x) !== -1; }) || /-(fp1|fp2|alexa-svc-1)$/.test(String(p.id || "")) && /prof-demo-|prof-alexa-professional/.test(String(p.id || ""));
}
function runCallers(win, label) {
  var A = win.CognationAccounts;
  /* 1. tower.js newsProfessionalPosts via newsList (the Times) */
  var news = win.CognationTowerStore.newsList();
  assert.ok(!news.some(isDemoPro), label + ": Times list has no demo pro posts");
  /* 2. tower.js resolveActiveProfileId */
  var active = win.CognationTowerProfileStore.getActiveProfileId();
  assert.strictEqual(typeof active, "string", label + ": active profile still resolves (" + active + ")");
  /* 3. people search suggests signups, not the demo professional page. */
  var found = win.CognationPeopleDirectory.search("mira").filter(function (p) { return p.handle === "mira-wellness"; });
  assert.strictEqual(found.length, 0, label + ": people search does not suggest the demo page");
  /* 4. tower.js professionalHandleForFollower */
  var follower = new Function("window", fnSource(towerSrc, "professionalHandleForFollower") + "\nreturn professionalHandleForFollower;")(win);
  assert.strictEqual(follower("prof-demo-jordan-pro"), "jordan-civic", label + ": follower handle lookup still works");
  /* 5. tower.js circleProfessionalByHandle */
  var circle = new Function("window", fnSource(towerSrc, "circleProfessionalByHandle") + "\nreturn circleProfessionalByHandle;")(win);
  var rec = circle("mira-wellness");
  assert.ok(rec && rec.id === "prof-demo-mira-pro", label + ": circle lookup still finds the page record");
  assert.ok(!(rec.featuredPosts || []).some(isDemoPro), label + ": the record carries no demo posts");
  return news;
}

/* A. Fresh browser: the page records exist, with no demo posts. */
(function () {
  var storage = memoryStorage();
  var win = boot(storage);
  var ids = win.CognationAccounts.ensureDemoProfessionals();
  assert.deepStrictEqual(Array.prototype.slice.call(ids), ["prof-demo-mira-pro", "prof-demo-jordan-pro"], "same demo page ids returned");
  var p = profiles(storage);
  ["prof-demo-mira-pro", "prof-demo-jordan-pro", "prof-alexa-professional"].forEach(function (id) {
    assert.ok(p[id] && p[id].kind === "professional", id + " page record kept");
    assert.strictEqual((p[id].featuredPosts || []).length, 0, id + ": no featured posts seeded");
  });
  var news = runCallers(win, "fresh");
  assert.ok(!news.some(function (n) { return n.towerKind === "professional"; }), "fresh: no professional stories at all (empty list)");
})();

/* B. Browser that saved the demo posts earlier, plus real posts. */
(function () {
  var storage = memoryStorage();
  var doc = { profiles: {
    "prof-demo-mira-pro": { id: "prof-demo-mira-pro", kind: "professional", accountUsername: "mira-demo", handle: "mira-wellness", displayName: "Mira Chen · Wellness",
      featuredPosts: [{ id: "fp1", title: DEMO_TITLES[0], body: "x" }, { id: "fp2", title: DEMO_TITLES[1], body: "x" }, { id: "fp3", title: "Real mira post", body: "Kept." }] },
    "prof-demo-jordan-pro": { id: "prof-demo-jordan-pro", kind: "professional", accountUsername: "jordan-demo", handle: "jordan-civic", displayName: "Jordan Lee · Civic Help",
      featuredPosts: [{ id: "fp1", title: DEMO_TITLES[2], body: "x" }, { id: "fp2", title: DEMO_TITLES[3], body: "x" }] },
    "prof-alexa-professional": { id: "prof-alexa-professional", kind: "professional", accountUsername: "alexa", handle: "alexa-pro", displayName: "Alexa J Thomas",
      featuredPosts: [{ id: "alexa-svc-1", title: DEMO_TITLES[4], body: "x" }, { id: "alexa-real-1", title: "Alexa real offer", body: "Kept." }] },
    "prof-other-pro": { id: "prof-other-pro", kind: "professional", accountUsername: "other", handle: "other-pro", displayName: "Other Pro",
      featuredPosts: [{ id: "fp1", title: "Other page fp1", body: "Same id, other page: kept." }, { id: "alexa-svc-1", title: "Other page svc", body: "Kept." }] },
  } };
  storage.setItem("cognation.profiles.v1", JSON.stringify(doc));
  var win = boot(storage);
  win.CognationAccounts.ensureDemoProfessionals();
  var p = profiles(storage);
  function ids(id) { return (p[id].featuredPosts || []).map(function (f) { return f.id; }).join(","); }
  assert.strictEqual(ids("prof-demo-mira-pro"), "fp3", "mira-pro: fp1/fp2 dropped, real fp3 kept");
  assert.strictEqual(ids("prof-demo-jordan-pro"), "", "jordan-pro: fp1/fp2 dropped");
  assert.strictEqual(ids("prof-alexa-professional"), "alexa-real-1", "Alexa pro: alexa-svc-1 dropped, real post kept");
  assert.strictEqual(ids("prof-other-pro"), "fp1,alexa-svc-1", "same ids on another page are kept");
  assert.strictEqual(p["prof-alexa-professional"].displayName, "Alexa J Thomas", "Alexa's page record itself untouched");
  var news = runCallers(win, "legacy");
  var titles = news.filter(function (n) { return n.towerKind === "professional"; }).map(function (n) { return n.title; }).sort().join("|");
  assert.strictEqual(titles, "Alexa real offer|Other page fp1|Other page svc|Real mira post", "Times keeps every real pro post (" + titles + ")");
  /* Second call is a no-op. */
  var before = storage.getItem("cognation.profiles.v1");
  win.CognationAccounts.ensureDemoProfessionals();
  assert.strictEqual(storage.getItem("cognation.profiles.v1"), before, "repeat call changes nothing");
})();

console.log("times-demo-pro-posts.test.js ok");
