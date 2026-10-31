/**
 * A _public field (Pro YouTube / music URL, socials, LinkedIn, Shop, Linktree,
 * Venmo, Apple Pay, Pay / Buy ads) the owner changed or cleared before the
 * tower_widget_layouts row was read keeps the owner's value when the read lands:
 * a cleared link stays cleared. Nothing uploads on its own; the next Save sends
 * the owner's values. Stub Supabase only: every write is logged, none leaves.
 * Run: node --test js/cleared-link-keep.test.js
 */
"use strict";
var test = require("node:test");
var assert = require("assert");
var path = require("path");
var fs = require("fs");
var vm = require("vm");

var SRC = fs.readFileSync(path.join(__dirname, "tower-layout-sync.js"), "utf8");
var A = "11111111-1111-4111-8111-111111111111";

var OLD_MUSIC = "https://www.youtube.com/watch?v=OLDOLDOLD01";
/* The stored row, and the same-browser local copy of it the owner opens with. */
var ROW_PUBLIC = {
  musicUrl: OLD_MUSIC,
  socialLinks: {
    x: "https://x.com/old",
    instagram: "https://instagram.com/old",
    linkedin: "https://linkedin.com/in/old",
    ads: "https://old.example/ads",
    venmo: "old-venmo",
  },
};

function harness() {
  var writes = [];
  var reads = [];
  var timers = [];
  var win = {
    setTimeout: function (fn) { timers.push(fn); return timers.length; },
    clearTimeout: function (t) { if (t) timers[t - 1] = null; },
    CustomEvent: function (name, init) { this.type = name; this.detail = init && init.detail; },
    document: { dispatchEvent: function () {} },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return { access_token: "stub" }; },
      rest: function (table, opts) {
        if (opts.method) {
          writes.push({ table: table, method: opts.method, body: JSON.parse(JSON.stringify(opts.body)) });
          return Promise.resolve(null);
        }
        var id = /profile_id=eq\.([^&]+)/.exec(opts.query)[1];
        return new Promise(function (resolve) { reads.push({ id: id, resolve: resolve }); });
      },
    },
  };
  win.window = win;
  vm.runInNewContext(SRC, win);
  return {
    sync: win.CognationTowerLayoutSync,
    writes: writes,
    reads: reads,
    flush: function () { var t = timers.splice(0); t.forEach(function (fn) { if (fn) fn(); }); },
  };
}

function tick() { return new Promise(function (r) { setImmediate(r); }); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }

/* What TowerProfileStore.get() hands apply(): the owner's local copy. */
function opened() {
  return {
    _profileId: A,
    widgetLayout: { identity: { x: 1, y: 1, z: 1, tilt: 0 } },
    musicUrl: OLD_MUSIC,
    socialLinks: clone(ROW_PUBLIC.socialLinks),
  };
}

/* Owner edits in the not-loaded window: X changed, Instagram and Buy ads
   cleared, Pro YouTube cleared, LinkedIn and Venmo untouched. */
function edited() {
  var p = opened();
  p.socialLinks.x = "https://x.com/new";
  p.socialLinks.instagram = "";
  p.socialLinks.ads = "";
  p.musicUrl = "";
  return p;
}

async function windowThenRead(h) {
  h.sync.apply(opened()); /* page opens: layout read starts, stays pending */
  assert.strictEqual(h.reads.length, 1);
  h.sync.savePublic(edited()); /* field change / Save in the window: blocked (#343) */
  h.flush();
  await tick();
  assert.strictEqual(h.writes.length, 0, "nothing written before the read");
  h.reads[0].resolve([{ layout: { identity: { x: 40, y: 50, z: 2, tilt: 0 }, _full: 1, _public: clone(ROW_PUBLIC) } }]);
  await tick();
}

test("read lands: changed and cleared fields keep the owner's values", async function () {
  var h = harness();
  await windowThenRead(h);
  var p = h.sync.apply(edited()); /* next get() after cognation:remote-profile-loaded */
  assert.strictEqual(p.socialLinks.x, "https://x.com/new");
  assert.strictEqual(p.socialLinks.instagram || "", "", "cleared Instagram stays cleared");
  assert.strictEqual(p.socialLinks.ads || "", "", "cleared Buy ads stays cleared");
  assert.strictEqual(p.musicUrl || "", "", "cleared Pro YouTube stays cleared");
  assert.strictEqual(p.socialLinks.linkedin, "https://linkedin.com/in/old", "untouched field unchanged");
  assert.strictEqual(p.socialLinks.venmo, "old-venmo", "untouched field unchanged");
  /* Later reads in the same page keep them too. */
  var again = h.sync.apply(edited());
  assert.strictEqual(again.socialLinks.instagram || "", "");
  assert.strictEqual(again.musicUrl || "", "");
});

test("read lands: nothing uploads on its own", async function () {
  var h = harness();
  await windowThenRead(h);
  h.sync.apply(edited());
  h.flush();
  await tick();
  assert.strictEqual(h.writes.length, 0, "no auto-save after the read");
});

test("the next Save sends the owner's values, not the stored row", async function () {
  var h = harness();
  await windowThenRead(h);
  var p = h.sync.apply(edited());
  assert.strictEqual(h.sync.savePublic(p), true);
  h.flush();
  await tick();
  assert.strictEqual(h.writes.length, 1);
  var pub = h.writes[0].body.layout._public;
  assert.strictEqual(pub.musicUrl, "");
  assert.deepStrictEqual(pub.socialLinks, {
    x: "https://x.com/new",
    linkedin: "https://linkedin.com/in/old",
    venmo: "old-venmo",
  });
  assert.strictEqual(h.writes[0].body.layout.identity.x, 40, "row positions kept");
});

test("a geometry save after the read also sends the owner's values", async function () {
  var h = harness();
  await windowThenRead(h);
  var p = h.sync.apply(edited());
  assert.strictEqual(h.sync.save(p), true);
  h.flush();
  await tick();
  assert.strictEqual(h.writes.length, 1);
  var pub = h.writes[0].body.layout._public;
  assert.strictEqual(pub.musicUrl, "", "cleared Pro YouTube not refilled from the row");
  assert.strictEqual(pub.socialLinks.instagram, undefined);
  assert.strictEqual(pub.socialLinks.ads, undefined);
  assert.strictEqual(pub.socialLinks.x, "https://x.com/new");
});

test("no edits in the window: the row still fills empty fields (unchanged)", async function () {
  var h = harness();
  h.sync.apply({ _profileId: A, widgetLayout: {}, musicUrl: "", socialLinks: {} });
  h.reads[0].resolve([{ layout: { identity: { x: 40, y: 50, z: 2, tilt: 0 }, _full: 1, _public: clone(ROW_PUBLIC) } }]);
  await tick();
  var p = h.sync.apply({ _profileId: A, widgetLayout: {}, musicUrl: "", socialLinks: {} });
  assert.strictEqual(p.musicUrl, OLD_MUSIC);
  assert.deepStrictEqual(clone(p.socialLinks), ROW_PUBLIC.socialLinks);
  assert.strictEqual(h.writes.length, 0);
});

test("after that Save, the stored copy is the owner's and reads stay that way", async function () {
  var h = harness();
  await windowThenRead(h);
  h.sync.savePublic(h.sync.apply(edited()));
  h.flush();
  await tick();
  /* A fresh-looking read in the same page (nothing local) now fills from the
     owner's saved values: no Instagram, no Pro YouTube. */
  var p = h.sync.apply({ _profileId: A, widgetLayout: {}, musicUrl: "", socialLinks: {} });
  assert.strictEqual(p.musicUrl || "", "");
  assert.strictEqual(p.socialLinks.instagram, undefined);
  assert.strictEqual(p.socialLinks.x, "https://x.com/new");
});

/* Save profile only has fields for some links. Venmo, Pay for services and Buy
   ads are edited on their own widgets, so Save profile must leave them as they
   are, not blank them (a blank there would now count as the owner's clear). */
test("Save profile keeps links that have no Edit profile field", function () {
  var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
  var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  ["venmo", "services", "ads"].forEach(function (id) {
    assert.ok(html.indexOf('data-tower-social="' + id + '"') === -1, id + " has no Edit profile field");
  });
  var i = tower.indexOf('var handleInputSave = root.querySelector("[data-tower-handle]");');
  assert.ok(i > 0);
  var block = tower.slice(i, tower.indexOf("p.customHtml = htmlInput", i));
  assert.ok(!/p\.socialLinks\[net\.id\] = input \? storedSocialValue\(net\.id, input\.value\) : "";/.test(block),
    "a link with no field is not blanked");
  assert.ok(/if \(!input\) return;/.test(block), "a link with no field is left as it is");
});
