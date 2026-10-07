/**
 * Author links resolve by profile id (handle only when there is no id), never
 * by display name. Two accounts both named "Sage" (seed-0078 and a real member)
 * must each link to their own Tower page, and a post with neither id nor handle
 * gets no link rather than the wrong person.
 * Run: node js/author-links-by-id.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function read(rel) { return fs.readFileSync(path.join(__dirname, "..", rel), "utf8"); }
function mem(seed) {
  var d = Object.assign({}, seed || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
}
function CustomEvent(type, init) { this.type = type; this.detail = (init && init.detail) || {}; }
function plainDoc(extra) {
  return Object.assign({
    readyState: "complete",
    addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return true; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    getElementById: function () { return null; },
    createElement: function () { return { setAttribute: function () {}, appendChild: function () {}, style: {}, classList: { add: function () {}, remove: function () {}, toggle: function () {} } }; },
    body: { classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } } },
  }, extra || {});
}

/* Two different people, same display name. */
var SAGE_SEED = { id: "p-seed-0078", user_id: "u-0078", kind: "personal", handle: "sage-0078", display_name: "Sage", bio: "", seed_fleet_id: "seed-0078" };
var SAGE_REAL = { id: "p-real-sage", user_id: "u-real-sage", kind: "personal", handle: "sagem", display_name: "Sage", bio: "", seed_fleet_id: null };

/* ---------- 1. Remote feed -> author ids; hash -> that profile ---------- */
function testRemoteFeedAndHash() {
  var stored = null;
  var location = { hash: "", search: "" };
  var doc = plainDoc();
  var win = {
    document: doc, localStorage: mem(), location: location, addEventListener: function () {},
    CognationAuth: { getSession: function () { return { source: "supabase", supabaseUserId: "u-viewer", activeProfileId: "p-viewer" }; } },
    CognationSupabase: {
      configured: function () { return true; },
      rest: function (table) {
        if (table === "tower_posts") {
          return Promise.resolve([
            { id: "post-1", author_profile_id: SAGE_SEED.id, body: "From seed Sage", visibility: "public", attachments: [], created_at: "2026-10-07T20:00:00Z", author: SAGE_SEED, reactions: [] },
            { id: "post-2", author_profile_id: SAGE_REAL.id, body: "From member Sage", visibility: "public", attachments: [], created_at: "2026-10-07T19:00:00Z", author: SAGE_REAL, reactions: [] },
          ]);
        }
        return Promise.resolve([]);
      },
    },
    CognationTowerStore: { setRemotePosts: function (posts) { stored = posts; } },
  };
  win.window = win;
  var ctx = vm.createContext({ window: win, document: doc, localStorage: win.localStorage, location: location, CustomEvent: CustomEvent, console: console, Promise: Promise, setTimeout: setTimeout, clearTimeout: clearTimeout, encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent });
  vm.runInContext(read("js/supabase-social.js"), ctx, { filename: "js/supabase-social.js" });
  var social = win.CognationSupabaseSocial;
  return social.refreshFeed().then(function () {
    assert.ok(stored && stored.length === 2, "feed mapped");
    assert.strictEqual(stored[0].authorName, "Sage");
    assert.strictEqual(stored[1].authorName, "Sage");
    assert.strictEqual(stored[0].authorProfileId, SAGE_SEED.id, "post carries its author's profile id");
    assert.strictEqual(stored[1].authorProfileId, SAGE_REAL.id);
    location.hash = "#tower-profile-" + SAGE_SEED.id;
    assert.strictEqual(social.getViewedProfileId(), SAGE_SEED.id, "seed Sage's link opens seed Sage");
    location.hash = "#tower-profile-" + SAGE_REAL.id;
    assert.strictEqual(social.getViewedProfileId(), SAGE_REAL.id, "member Sage's link opens member Sage");
    location.hash = "#tower-profile-sagem";
    assert.strictEqual(social.getViewedProfileId(), SAGE_REAL.id, "handle links still resolve");
    location.hash = "#tower-profile-sage";
    assert.strictEqual(social.getViewedProfileId(), "", "a display-name slug resolves to nobody");
    location.hash = "#tower-profile-constructor";
    assert.strictEqual(social.getViewedProfileId(), "", "no prototype lookups");
    return stored;
  });
}

/* ---------- 2. Commune Local feed: hrefs by id ---------- */
function fakeEl(tag) {
  var e = {
    tagName: String(tag || "div").toUpperCase(), hidden: false, attrs: {}, children: [], parent: null, style: {}, value: "", checked: false,
    textContent: "", className: "", dataset: {}, _html: "",
    classList: { _s: {}, add: function (c) { this._s[c] = 1; }, remove: function (c) { delete this._s[c]; },
      toggle: function (c, on) { if (on === undefined) on = !this._s[c]; if (on) this._s[c] = 1; else delete this._s[c]; return on; },
      contains: function (c) { return !!this._s[c]; } },
    setAttribute: function (k, v) { this.attrs[k] = String(v); }, getAttribute: function (k) { return k in this.attrs ? this.attrs[k] : null; },
    removeAttribute: function (k) { delete this.attrs[k]; }, hasAttribute: function (k) { return k in this.attrs; },
    addEventListener: function () {}, removeEventListener: function () {},
    appendChild: function (c) { if (c.parent) c.parent.removeChild(c); c.parent = this; this.children.push(c); return c; },
    removeChild: function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parent = null; return c; },
    insertAdjacentElement: function (pos, c) { return this.appendChild(c); },
    remove: function () { if (this.parent) this.parent.removeChild(this); },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    closest: function () { return null; }, focus: function () {},
  };
  Object.defineProperty(e, "isConnected", { get: function () { var n = this; while (n.parent) n = n.parent; return !!n.__root; } });
  Object.defineProperty(e, "innerHTML", { get: function () { return this._html; },
    set: function (v) { this._html = String(v); this.children.forEach(function (c) { c.parent = null; }); this.children = []; } });
  return e;
}

function renderLocal(posts, me) {
  var ls = mem({ "cognation.commune.edition.v1": JSON.stringify("local"), "cognation.member.profile.v1": JSON.stringify({ age: 30 }) });
  var root = fakeEl("section");
  root.__root = true;
  var feedList = root.appendChild(fakeEl("div"));
  var feedEmpty = root.appendChild(fakeEl("p"));
  var map = { "[data-commune-feed-list]": feedList, "[data-commune-feed-empty]": feedEmpty };
  root.querySelector = function (sel) { return map[sel] || null; };
  function IO() { this.observe = function () {}; this.disconnect = function () {}; }
  var doc = plainDoc({ createElement: fakeEl, querySelector: function (sel) { return sel === "[data-commune-app]" ? root : null; }, body: fakeEl("body") });
  var win = { document: doc, localStorage: ls, location: { hash: "", search: "" }, CustomEvent: CustomEvent, addEventListener: function () {}, IntersectionObserver: IO };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: ls, location: win.location, CustomEvent: CustomEvent, IntersectionObserver: IO,
    console: console, Promise: Promise, setTimeout: setTimeout, clearTimeout: clearTimeout, encodeURIComponent: encodeURIComponent,
    fetch: function () { return Promise.reject(new Error("offline")); },
  });
  vm.runInContext(read("js/age-floor-keywords.js"), ctx);
  vm.runInContext(read("js/tower.js"), ctx, { filename: "js/tower.js" });
  /* The Local edition lists Tower posts (CognationTowerStore.newsList). */
  win.CognationTowerStore = { newsList: function () { return posts; } };
  win.CognationTowerProfileStore = { get: function () { return me; } };
  vm.runInContext(read("js/commune.js"), ctx, { filename: "js/commune.js" });
  var out = {};
  feedList.children.forEach(function (c) {
    if (c.tagName !== "ARTICLE") return;
    var html = c.innerHTML;
    var body = (html.match(/commune-feed-body">([^<]*)/) || [])[1] || "";
    var hrefs = [];
    /* Author name and the source line both link; collect distinct targets. */
    html.replace(/href="(#tower-profile-[^"]*)"/g, function (_, h) { if (hrefs.indexOf(h) < 0) hrefs.push(h); });
    out[body.trim()] = hrefs;
  });
  return out;
}

function testCommuneLinks(remotePosts) {
  var posts = remotePosts.map(function (p) { var c = JSON.parse(JSON.stringify(p)); return c; });
  posts.push({ id: "post-3", authorName: "Sage", body: "No id or handle", createdAt: "2026-10-07T18:00:00Z" });
  posts.push({ id: "post-4", authorName: "Sage", handle: "sage-0078", body: "Handle only", createdAt: "2026-10-07T17:00:00Z" });
  /* The viewer is also named Sage (our test viewer): the old code sent every
     "Sage" post to the viewer's own handle. */
  var links = renderLocal(posts, { displayName: "Sage", handle: "sage", _profileId: "p-test-sage" });
  assert.deepStrictEqual(links["From seed Sage"], ["#tower-profile-" + SAGE_SEED.id], "seed Sage links to seed Sage by id: " + JSON.stringify(links));
  assert.deepStrictEqual(links["From member Sage"], ["#tower-profile-" + SAGE_REAL.id], "member Sage links to member Sage by id");
  assert.deepStrictEqual(links["No id or handle"], [], "no id/handle: no link rather than a wrong person");
  assert.deepStrictEqual(links["Handle only"], ["#tower-profile-sage-0078"], "handle when there is no id");
  Object.keys(links).forEach(function (k) {
    links[k].forEach(function (h) { assert.notStrictEqual(h, "#tower-profile-sage", "never the display-name slug / viewer's handle"); });
  });
}

/* ---------- 3. Tower resolver (#tower-profile-{id}) ---------- */
function testTowerResolver() {
  var location = { hash: "", search: "" };
  var local = {
    "prof-seed-0078": { id: "prof-seed-0078", kind: "personal", handle: "sage-0078", displayName: "Sage" },
    "prof-test-sage": { id: "prof-test-sage", kind: "personal", handle: "sage", displayName: "Sage" },
  };
  var doc = plainDoc();
  var win = {
    document: doc, localStorage: mem(), location: location, CustomEvent: CustomEvent, addEventListener: function () {},
    CognationAccounts: {
      getProfileById: function (id) { return Object.prototype.hasOwnProperty.call(local, id) ? local[id] : null; },
      getProfileByHandle: function (h) { var k = Object.keys(local).filter(function (id) { return local[id].handle === h; })[0]; return k ? local[k] : null; },
    },
    CognationSupabaseSocial: {
      active: function () { return false; },
      getProfile: function (id) { return id === SAGE_REAL.id ? SAGE_REAL : null; },
      getProfileForHandle: function (h) { return h === SAGE_REAL.handle ? SAGE_REAL : null; },
    },
  };
  win.window = win;
  var ctx = vm.createContext({ window: win, document: doc, localStorage: win.localStorage, location: location, CustomEvent: CustomEvent, console: console, Promise: Promise, setTimeout: setTimeout, clearTimeout: clearTimeout });
  vm.runInContext(read("js/age-floor-keywords.js"), ctx);
  vm.runInContext(read("js/tower.js"), ctx, { filename: "js/tower.js" });
  var store = win.CognationTowerProfileStore;
  location.hash = "#tower-profile-prof-seed-0078";
  assert.strictEqual(store.getActiveProfileId(), "prof-seed-0078", "local id link opens seed Sage");
  location.hash = "#tower-profile-prof-test-sage";
  assert.strictEqual(store.getActiveProfileId(), "prof-test-sage", "local id link opens test Sage");
  location.hash = "#tower-profile-" + SAGE_REAL.id;
  assert.strictEqual(store.getActiveProfileId(), SAGE_REAL.id, "remote id link opens member Sage");
  location.hash = "#tower-profile-sage-0078";
  assert.strictEqual(store.getActiveProfileId(), "prof-seed-0078", "handle link still works");
}

/* ---------- 4. Source guards: Circle + public link ---------- */
function testSourceGuards() {
  var tower = read("js/tower.js");
  assert.ok(/circlePostByAuthor\(friend\)/.test(tower), "Circle looks up a friend's post by the friend, not the name");
  assert.ok(/String\(post\.authorProfileId \|\| ""\) === wantId/.test(tower), "Circle matches by author profile id");
  assert.ok(!/posts\[i\]\.authorName \|\| ""\)\.trim\(\)\.toLowerCase\(\) === want/.test(tower), "no display-name match left in Circle");
  assert.ok(!/var fromName = String\(\(profile && profile\.displayName\)/.test(tower), "public link never slugs the display name");
  var commune = read("js/commune.js");
  assert.ok(commune.indexOf("towerProfileSlug(author)") === -1, "Commune no longer slugs the author name");
}

testSourceGuards();
testTowerResolver();
testRemoteFeedAndHash()
  .then(testCommuneLinks)
  .then(function () { console.log("author-links-by-id.test.js: ok"); })
  .catch(function (err) { console.error(err); process.exit(1); });
