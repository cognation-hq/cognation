/**
 * SIGNAL Feed "Send a signal" PERSONAL | PROFESSIONAL post-as switch, the Feed
 * card byline (page name, picture, link) and the Send a signal failure box (no success notice).
 * Owner-only: the browser only ever sends one of the member's own profile ids,
 * and the server insert policy checks profiles.user_id = auth.uid().
 */
"use strict";
var test = require("node:test");
var assert = require("node:assert");
var fs = require("fs");
var path = require("path");

var postAs = require("./signal-post-as.js");
var root = path.join(__dirname, "..");
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var social = fs.readFileSync(path.join(__dirname, "supabase-social.js"), "utf8");
var flat = css.replace(/\s+/g, " ");

var ME = "11111111-0000-4000-8000-000000000001";
var OTHER = "22222222-0000-4000-8000-000000000002";
var PER = { id: "per-1", user_id: ME, kind: "personal", handle: "riley" };
var PRO = { id: "pro-1", user_id: ME, kind: "professional", handle: "riley-studio" };
var FOREIGN_PRO = { id: "pro-9", user_id: OTHER, kind: "professional", handle: "jordan-co" };

function memStore() {
  var m = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
  };
}

test("switch shows only when the member owns a Professional page (seeds included)", function () {
  assert.strictEqual(postAs.hasProfessional([PER, PRO], ME), true);
  assert.strictEqual(postAs.hasProfessional([PER], ME), false);
  var seedPer = { id: "seed-1", user_id: ME, kind: "personal", account_kind: "seed" };
  assert.strictEqual(postAs.hasProfessional([seedPer], ME), false, "seed without Pro: hidden");
  assert.strictEqual(postAs.hasProfessional([PER, FOREIGN_PRO], ME), false, "someone else's Pro never counts");
  assert.strictEqual(postAs.hasProfessional([PER, PRO], ""), false, "signed out: hidden");
});

test("default is Personal; markup starts hidden with Personal checked", function () {
  assert.strictEqual(postAs.readChoice(memStore(), ME), "personal");
  var m = html.match(/<div class="signal-post-as" data-signal-post-as role="radiogroup" aria-label="Post as" hidden>([\s\S]*?)<\/div>/);
  assert.ok(m, "switch markup, hidden until a Pro page loads");
  assert.ok(/data-signal-post-as-btn="personal"[^>]*>Personal</.test(m[0]) || /aria-checked="true" data-signal-post-as-btn="personal">Personal</.test(m[0]));
  assert.ok(/aria-checked="false"[^>]*data-signal-post-as-btn="professional">Professional</.test(m[0]));
  assert.ok(/<span class="signal-post-as-sep" aria-hidden="true">\|<\/span>/.test(m[0]), "pipe between the sides");
});

test("switch sits on the 'Send a signal' line", function () {
  var head = html.match(/<div class="signal-compose-head" data-signal-compose-head>\s*<h4 class="tower-block-heading" data-tower-block-heading>Send a signal<\/h4>\s*<div class="signal-post-as"/);
  assert.ok(head, "heading and switch share one row");
  assert.ok(html.indexOf('<script src="js/signal-post-as.js" defer></script>') > html.indexOf('<script src="js/supabase-social.js" defer></script>'));
  assert.ok(html.indexOf('<script src="js/signal-post-as.js" defer></script>') < html.indexOf('<script src="js/tower.js" defer></script>'));
});

test("post sends the chosen own page id; never a foreign one", function () {
  assert.strictEqual(postAs.authorProfileId("personal", [PER, PRO], ME), "per-1");
  assert.strictEqual(postAs.authorProfileId("professional", [PER, PRO], ME), "pro-1");
  assert.strictEqual(postAs.authorProfileId("professional", [PER, FOREIGN_PRO], ME), "", "foreign Pro: no id");
  assert.strictEqual(postAs.authorProfileId("professional", [PER, PRO], OTHER), "", "rows of another user are ignored");
  assert.strictEqual(postAs.isOwnProfileId("pro-9", [PER, PRO, FOREIGN_PRO], ME), false);
  assert.strictEqual(postAs.isOwnProfileId("pro-1", [PER, PRO], ME), true);
});

test("createTowerPost: asProfileId must be one of my profiles, else rejected", function () {
  var fn = social.slice(social.indexOf("function createTowerPost("), social.indexOf("function appealPostRating("));
  assert.ok(/fields\.asProfileId/.test(fn));
  assert.ok(/String\(p\.user_id \|\| ""\) === String\(me\.supabaseUserId\)/.test(fn), "owner check on user_id");
  assert.ok(/You can only post as your own pages\./.test(fn));
  assert.ok(/author_profile_id: profileId/.test(fn));
  assert.ok(tower.indexOf("asProfileId: (window.CognationSignalPostAs") > 0, "composer passes the switch choice");
  assert.ok(/state\.feed = \[\];\s*state\.myProfiles = \[\];/.test(social), "sign-out forgets my pages");
});

test("server policy keeps posts owner-only (no SQL in this PR)", function () {
  var dir = path.join(root, "supabase", "migrations");
  if (!fs.existsSync(dir)) return;
  var all = fs.readdirSync(dir).map(function (f) { return fs.readFileSync(path.join(dir, f), "utf8"); }).join("\n");
  assert.ok(/tower authors create their own posts/.test(all));
  assert.ok(/profiles\.id = tower_posts\.author_profile_id[\s\S]{0,80}profiles\.user_id = auth\.uid\(\)/.test(all));
});

test("session choice is per user", function () {
  var s = memStore();
  postAs.saveChoice(s, ME, "professional");
  assert.strictEqual(postAs.readChoice(s, ME), "professional");
  assert.strictEqual(postAs.readChoice(s, OTHER), "personal", "another member on this tab starts Personal");
  postAs.saveChoice(s, ME, "bogus");
  assert.strictEqual(postAs.readChoice(s, ME), "personal");
  var src = fs.readFileSync(path.join(__dirname, "signal-post-as.js"), "utf8");
  assert.ok(/root\.sessionStorage/.test(src) && !/localStorage/.test(src), "session only, no localStorage");
});

test("Feed card: page name, picture or initials, link to that page", function () {
  assert.ok(/function towerPostAuthorHtml\(post\)/.test(tower));
  assert.ok(/'<a class="tower-author-link" href="#tower-profile-'/.test(tower));
  assert.ok(/tower-author-avatar has-photo/.test(tower) && /initials\(post\.authorName/.test(tower));
  assert.ok(/window\.CognationTowerOpenProfile\(slug\)/.test(tower));
  assert.ok(/authorKind: authorKind === "professional"/.test(social));
  assert.ok(/seed_fleet_id,photo_url\),reactions/.test(social), "author picture from profiles.photo_url");
  assert.ok(/FEED_COLUMNS\.replace\(",photo_url\)", "\)"\)/.test(social), "Feed still loads without photo_url");
});

test("switch CSS: Oswald pipe, lit #f7f9ff, dim #d9d2f0 at 60%, pipe at 40%, one line", function () {
  assert.ok(/\.signal-compose-head\[data-signal-compose-head\] \{ display: flex; align-items: baseline; justify-content: space-between; gap: 0\.5rem; flex-wrap: nowrap;/.test(flat));
  assert.ok(/\.signal-post-as-side\[data-signal-post-as-btn\] \{[^}]*font-family: "Oswald"[^}]*color: rgba\(217, 210, 240, 0\.6\) !important;/.test(flat));
  assert.ok(/\.signal-post-as-side\[data-signal-post-as-btn\]\[aria-checked="true"\] \{ color: #f7f9ff !important;/.test(flat));
  assert.ok(/\.signal-post-as-sep \{[^}]*color: rgba\(217, 210, 240, 0\.4\) !important;/.test(flat));
  assert.ok(!/#1c1630/i.test(flat.slice(flat.indexOf("post-as switch"))), "no dark bar");
});

test("no success notice: a successful post shows nothing (Alexa, Oct 22 11:45 AM CT)", function () {
  assert.ok(tower.indexOf("Posted to Feed") < 0, "no 'Posted to Feed.' text anywhere in tower.js");
  assert.ok(tower.indexOf("Posting to Feed") < 0, "no in-flight notice either");
  var submit = tower.slice(tower.indexOf(".createTowerPost({"), tower.indexOf('var result = TowerStore.add({'));
  var ok = submit.slice(submit.indexOf(".then(function () {"), submit.indexOf(".catch("));
  assert.ok(/setStatus\("", false\);/.test(ok), "success hides the status box");
  assert.ok(!/setStatus\("[^"]/.test(ok), "success sets no message");
  assert.ok(/renderFeed\(root\)/.test(ok) && /bodyInput\.value = ""/.test(ok), "new post renders; composer clears");
  var catchPart = submit.slice(submit.indexOf(".catch("));
  assert.ok(/Could not post to Feed\. Please try again\./.test(catchPart) && /,\s*true\s*\)/.test(catchPart), "failures still show, as errors");
});

test("failure box: glass, 1px #e88a99 at 70%, #f7f9ff text, no brown or yellow", function () {
  var start = flat.indexOf("#panel-signal .signal-feed-host .tower-compose[data-tower-compose] .commune-status[data-tower-status] {");
  assert.ok(start > 0);
  var rule = flat.slice(start, flat.indexOf("}", start));
  ["background: rgba(18, 16, 38, 0.92) !important", "backdrop-filter: blur(12px)", "border: 1px solid rgba(232, 138, 153, 0.7) !important",
    "border-radius: 12px !important", "color: #f7f9ff !important", "font-size: 14px !important", "padding: 10px 14px !important",
    "margin: calc(12px - 0.35rem) 0 !important"].forEach(function (t) {
    assert.ok(rule.indexOf(t) >= 0, t);
  });
  assert.ok(!/#ED9300|237, 147, 0|accent-dim|yellow|amber/i.test(rule), "no brown or yellow");
});
