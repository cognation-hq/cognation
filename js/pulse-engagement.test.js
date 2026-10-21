/**
 * PULSE engagement ranking (Alexa final spec 2026-10-20).
 * Halo = the viewer's five MOST engaged friends; falling = the LEAST engaged,
 * least first, cap 30. Public Cognation activity only, per viewer.
 * Direct messages never count and are never read.
 * Run: node js/pulse-engagement.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
globalThis.CognationCircleRelations = require("./circle-saved-relations.js");
var api = require("./pulse-falling-friends.js");

function uuid(prefix, n) { return prefix + "-0000-4000-8000-" + ("000000000000" + n.toString(16)).slice(-12); }
var ME = uuid("00000000", 9999), MEP = uuid("aaaaaaaa", 9999);
var NAMES = ["Ada", "Ben", "Cy", "Di", "Ed", "Flo", "Gus", "Hal", "Ida", "Jo"];
function friendU(i) { return uuid("00000000", i + 1); }
function friendP(i) { return uuid("dddddddd", i + 1); }

/* ---- scoreEngagement: every public kind, both directions; friend-to-friend ignored ---- */
var owner = {};
owner[MEP] = ME;
NAMES.forEach(function (n, i) { owner[friendP(i)] = friendU(i); });
var handles = {};
NAMES.forEach(function (n, i) { handles[friendU(i)] = [n.toLowerCase()]; });
var ids = NAMES.map(function (n, i) { return friendU(i); });
var s = api.scoreEngagement(ME, ids, {
  profileOwner: owner, handlesByUser: handles, viewerHandles: ["me"],
  posts: [
    { id: "pv", author_profile_id: MEP, body: "Lunch with @ada and @ben! @adam is not Ada." },
    { id: "pa", author_profile_id: friendP(0), body: "thanks @me" },
    { id: "pb", author_profile_id: friendP(1), body: "@ada friend-to-friend tag" },
    { id: "pf", author_profile_id: friendP(3), body: "friends-only @me", visibility: "friends" },
  ],
  postReactions: [
    { post_id: "pv", profile_id: friendP(0) },  /* Ada reacts to my post */
    { post_id: "pa", profile_id: MEP },          /* I react to Ada's post */
    { post_id: "pb", profile_id: friendP(0) },  /* Ada reacts to Ben: not mine */
    { post_id: "pv", profile_id: MEP },          /* my own reaction on my post */
    { post_id: "pf", profile_id: MEP },          /* my reaction on Di's friends-only post */
  ],
  comments: [
    { id: "c1", author_profile_id: friendP(2), body: "News: agree" },
    { id: "c2", author_profile_id: MEP, body: "@cy good point" },
  ],
  commentReactions: [
    { comment_id: "c1", profile_id: MEP },       /* I react to Cy's comment */
    { comment_id: "c2", profile_id: friendP(2) }, /* Cy reacts to mine */
  ],
});
assert.strictEqual(s[friendU(0)], 4, "Ada: tag in my post + her tag of me + 2 reactions");
assert.strictEqual(s[friendU(1)], 1, "Ben: tagged once; his tag of Ada does not count for me");
assert.strictEqual(s[friendU(2)], 3, "Cy: comment tag + 2 comment reactions");
assert.strictEqual(s[friendU(3)], 0, "Di: tag + reaction on a friends-only post do not count (public posts only)");
assert.strictEqual(api.mentionCount("hi @ada.", "ada"), 1);
assert.strictEqual(api.mentionCount("hi @adam", "ada"), 0, "prefix of another handle is not a tag");
assert.strictEqual(api.mentionCount("mail x@ada", "ada"), 0, "not a tag inside a word");

/* ---- rank: most -> halo (5, desc); the rest -> falling, least first, cap 30 ---- */
var many = [];
for (var i = 0; i < 41; i++) many.push({ userId: uuid("0000000f", i), name: "P" + String(i).padStart(2, "0"), handle: "p" + i });
var sc = {};
many.forEach(function (f, i) { sc[f.userId] = i; }); /* P40 most, P00 least */
var r = api.rank(many, sc);
assert.deepStrictEqual(r.halo.map(function (f) { return f.name; }), ["P40", "P39", "P38", "P37", "P36"], "halo = five most engaged, most first");
assert.strictEqual(r.fall.length, 30, "falling capped at 30");
assert.deepStrictEqual(r.fall.slice(0, 3).map(function (f) { return f.name; }), ["P00", "P01", "P02"], "falling = least engaged first");
assert.ok(r.fall.every(function (f, j) { return j === 0 || r.fall[j - 1].engagement <= f.engagement; }), "ascending engagement");
assert.ok(!r.fall.some(function (f) { return r.halo.indexOf(f) >= 0 || /P3[6-9]|P40/.test(f.name); }), "nobody in both");
/* ties by name, stable */
var tie = api.rank([{ userId: "b", name: "Bea" }, { userId: "a", name: "Al" }, { userId: "c", name: "Cy" }], {});
assert.deepStrictEqual(tie.halo.map(function (f) { return f.name; }), ["Al", "Bea", "Cy"]);
/* front frame shows the top friend; name only */
var spots = api.haloSpots(r.halo);
assert.strictEqual(spots[1].name, "P40", "spot 1 (center, front) = most engaged");
assert.deepStrictEqual(spots.map(function (p) { return p.caption; }), ["P39", "P40", "P38", "P36", "P37"], "caption is the name only");
assert.ok(spots.every(function (p) { return !p.activity; }), "no activity wording");

/* ---- loadRanked against a fake server: per viewer, DMs never read or counted ---- */
var tables = [];
var friendships = NAMES.map(function (n, i) { return { user_id: ME, friend_user_id: friendU(i), created_at: "2026-10-01T00:00:00Z" }; });
var profiles = [{ id: MEP, user_id: ME, kind: "personal", handle: "me", display_name: "Me", account_kind: "real" }];
NAMES.forEach(function (n, i) { profiles.push({ id: friendP(i), user_id: friendU(i), kind: "personal", handle: n.toLowerCase(), display_name: n, account_kind: "real" }); });
var POSTV = uuid("eeeeeeee", 1);
var posts = [{ id: POSTV, author_profile_id: MEP, body: "hi", visibility: "public" }];
NAMES.forEach(function (n, i) { posts.push({ id: uuid("eeeeeeee", 100 + i), author_profile_id: friendP(i), body: "post", visibility: "public" }); });
/* Ida's friends-only post with 20 of my reactions: never counts */
var POSTF = uuid("eeeeeeee", 999);
posts.push({ id: POSTF, author_profile_id: friendP(8), body: "friends only", visibility: "friends" });
var postQueries = [];
var reactions = [];
/* Ada..Ed get 9..5 public reactions; Jo gets none (but 500 DMs if anyone looked). */
for (var f = 0; f < 5; f++) for (var k = 0; k < 9 - f; k++) reactions.push({ post_id: POSTV, profile_id: friendP(f) });
reactions.push({ post_id: uuid("eeeeeeee", 105), profile_id: MEP }); /* Flo: 1 */
for (var fr = 0; fr < 20; fr++) reactions.push({ post_id: POSTF, profile_id: MEP });
var dmRows = [];
for (var d = 0; d < 500; d++) dmRows.push({ sender_profile_id: friendP(9), recipient_profile_id: MEP, body: "dm" });
function inList(q, key) { var m = new RegExp(key + "=in\\.\\(([^)]*)\\)").exec(q); return m ? m[1].split(",") : []; }
var client = {
  configured: function () { return true; },
  rest: function (table, o) {
    tables.push(table);
    var q = o.query;
    if (table === "friendships") return Promise.resolve(/offset=0/.test(q) ? friendships : []);
    if (table === "profiles") { var u = inList(q, "user_id"); return Promise.resolve(profiles.filter(function (p) { return u.indexOf(p.user_id) >= 0; })); }
    if (table === "tower_posts") {
      postQueries.push(q);
      var a = inList(q, "author_profile_id");
      var pub = /(^|&)visibility=eq\.public(&|$)/.test(q);
      return Promise.resolve(posts.filter(function (p) { return a.indexOf(p.author_profile_id) >= 0 && (!pub || p.visibility === "public"); }));
    }
    if (table === "tower_post_reactions") { var pi = inList(q, "post_id"); return Promise.resolve(reactions.filter(function (x) { return pi.indexOf(x.post_id) >= 0; })); }
    if (table === "news_story_comments") return Promise.reject(new Error("relation does not exist")); /* gap path */
    if (/direct|chat_room/.test(table)) return Promise.resolve(dmRows);
    return Promise.resolve([]);
  },
  rpc: function (name) { tables.push("rpc/" + name); return Promise.resolve(dmRows); },
};
api.loadRanked(client, ME).then(function (res) {
  assert.deepStrictEqual(res.halo.map(function (x) { return x.name; }), ["Ada", "Ben", "Cy", "Di", "Ed"], "halo from real rows, most first");
  assert.strictEqual(res.fall[res.fall.length - 1].name, "Flo", "Flo (1) after the zero-engagement friends");
  assert.strictEqual(res.scores[friendU(9)], 0, "Jo: 500 DMs count for nothing");
  assert.strictEqual(res.scores[friendU(8)], 0, "Ida: reactions on her friends-only post count for nothing");
  assert.ok(postQueries.length && postQueries.every(function (q) { return /&visibility=eq\.public/.test(q); }), "Tower posts read with visibility=eq.public");
  assert.ok(res.fall.slice(0, 4).some(function (x) { return x.name === "Jo"; }), "Jo is among the least engaged");
  assert.ok(!tables.some(function (t) { return /direct|chat_room|message|thread/.test(t); }), "DMs/chat never read: " + tables.join(","));
  assert.deepStrictEqual(res.gaps, ["news_story_comments"], "missing table listed as a gap, ranking still works");
  var src = fs.readFileSync(path.join(__dirname, "pulse-falling-friends.js"), "utf8");
  var code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/direct_|chat_room|localStorage|DEMO_FRIENDS/.test(code), "no DM tables, no localStorage, no demo friends in the module");
  /* signed out / no client: nothing, never demo */
  return api.loadRanked(null, "");
}).then(function (none) {
  assert.deepStrictEqual(none.halo, []);
  assert.deepStrictEqual(none.fall, []);
  /* Tower wiring: the 390 right frame clamp and phone strand drift */
  var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
  assert.ok(/var spotK = \(layer\.clientWidth \/ 2 - 10 - half\) \/ Math\.abs\(side\.x\);/.test(tower), "side frames stay >= 8px inside the panel on phones");
  assert.ok(/spot\.setAttribute\("role", "link"\)/.test(tower) && /person\.caption \|\| person\.activity/.test(tower), "frame links to the Tower; name caption");
  var css = fs.readFileSync(path.join(__dirname, "..", "css/styles.css"), "utf8");
  assert.ok(/@keyframes pulse-strand-drift-phone/.test(css) && /animation: pulse-strand-drift-phone 12s ease-in-out infinite;/.test(css), "phone strands drift visibly");
  assert.ok(/background-image: url\("\.\.\/assets\/pulse\/pulse-bg-1190\.jpg"\)/.test(css), "Alexa's background image kept");
  console.log("pulse-engagement.test.js: OK");
}).catch(function (e) { console.error(e); process.exit(1); });
