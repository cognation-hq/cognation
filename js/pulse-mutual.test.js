/**
 * PULSE: one shared activity among friends. Caption flush on the picture. Cap 5.
 * Run: node js/pulse-mutual.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var api = require("./pulse-mutual.js");

var root = path.join(__dirname, "..");
var sql = fs.readFileSync(path.join(root, "supabase/migrations/20261018_pulse_mutual_introductions.sql"), "utf8");
var src = fs.readFileSync(path.join(__dirname, "pulse-mutual.js"), "utf8");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.strictEqual(api.REFRESH_MS, 15 * 60 * 1000, "refresh about every 15 minutes");
assert.ok(!/\bfollows\b/.test(sql) && !/\bfollows\b/.test(src), "friendships only");
assert.ok(!/toggle_profile_follow/.test(src) && !/Add friend/.test(src) && !/pulse-intro/.test(css), "no separate add row");
assert.ok(/circle-spot-caption/.test(tower) && /top:\s*100%/.test(css) && /padding:\s*0/.test(css) && /translate\(-50%, -0\.28em\)/.test(css), "caption stays flush on the frame");
assert.ok(/friendships/.test(sql) && /kind = 'personal'/.test(sql), "personal friends");
assert.ok(/They became friends\./.test(sql) && /They are now dating\./.test(sql) && /kind = 'match'/.test(sql) && /21-plus/.test(sql), "friend, dating, chatroom");
assert.ok(/tower_posts has no event/.test(sql) && /They shared the same content\./.test(src) && /goingLive/.test(src) && /signupFriendIds/.test(src), "content, event posts, attendance");
assert.ok(!/both know/.test(tower) && !/mutual_name/.test(src), "no you-both-know captions");
assert.ok(/cognation_user_is_real/.test(sql) && /limit 5/.test(sql), "real people, five spots");
assert.ok(/security definer/.test(sql) && /grant execute on function public\.pulse_mutual_introductions\(\) to authenticated/.test(sql));
assert.ok(html.indexOf('src="js/pulse-mutual.js"') > 0 && html.indexOf("js/pulse-mutual.js") < html.indexOf("js/tower.js"), "loads before tower");

var blank = api.peopleFrom([
  { display_name: "", profile_id: "a", activity: "They became friends." },
  { display_name: "Riley", profile_id: "", activity: "They became friends." },
  { display_name: "Riley", profile_id: "p", activity: "" },
  null,
]);
assert.strictEqual(blank.length, 0, "no invented people");

var rows = [];
for (var i = 0; i < 7; i++) rows.push({ display_name: "N" + i, profile_id: "id-" + i, activity: "They became friends." });
rows.push({ display_name: "N0", profile_id: "id-0", activity: "They became friends." });
var people = api.peopleFrom(rows);
assert.strictEqual(people.length, 5, "five people");
assert.strictEqual(people[0].name, "N0");
assert.strictEqual(people[0].activity, "They became friends.");
var wired = api.peopleFrom([{ display_name: "Ada", profile_id: "p1", activity: "They are now dating.", handle: "@ada", photo_url: "https://cdn.example.com/ada.jpg" }]);
assert.strictEqual(wired[0].handle, "ada", "Tower handle, without @");
assert.strictEqual(wired[0].photoUrl, "https://cdn.example.com/ada.jpg", "Tower picture url");
assert.ok(/p\.handle, p\.photo_url/.test(sql) && /cap\.hidden = i !== front/.test(tower) && /CognationTowerOpenProfile\(handle\)/.test(tower), "picture, front caption, Tower open");

var store = { bag: {}, getItem: function (k) { return this.bag[k] || null; } };
store.bag["cognation.profiles.v1"] = JSON.stringify({ profiles: {
  a: { id: "a", displayName: "Ada", calendarEvents: [{ date: "2026-10-19", signupFriendIds: ["a", "b"] }] },
  b: { id: "b", displayName: "Leo" },
  c: { id: "c", displayName: "Mia", goingLive: { what: "OU TX", when: "2026-10-18T18:00" } },
  d: { id: "d", displayName: "Noah", goingLive: { what: "OU TX", when: "2026-10-18T19:00" } }
} });
assert.strictEqual(api.localRows(store)[0].activity, "They are going to the same event.");
store.bag["cognation.profiles.v1"] = JSON.stringify({ profiles: {
  c: { id: "c", displayName: "Mia", goingLive: { what: "OU TX", when: "2026-10-18T18:00" } },
  d: { id: "d", displayName: "Noah", goingLive: { what: "OU TX", when: "2026-10-18T19:00" } }
} });
assert.strictEqual(api.localRows(store)[0].activity, "They posted about the same event.");
store.bag["cognation.commune.friend-shares.v1"] = JSON.stringify([
  { adId: "clip", swiperId: "a", sharerName: "Ada", at: Date.parse("2026-11-01") },
  { adId: "clip", swiperId: "b", sharerName: "Leo", at: Date.parse("2026-11-02") }
]);
assert.strictEqual(api.localRows(store)[0].activity, "They shared the same content.");
console.log("pulse-mutual.test.js ok");
