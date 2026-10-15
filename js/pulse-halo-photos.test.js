/* Website PULSE uses real friend photos (profiles.photo_url) on halo spots;
   letters stay when there is no photo. Falling friends already did.
   Run: node js/pulse-halo-photos.test.js */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var rel = require("./circle-saved-relations.js");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var me = "00000000-0000-4000-8000-000000000001", f1 = "00000000-0000-4000-8000-000000000002", f2 = "00000000-0000-4000-8000-000000000003";
var profiles = [
  { id: "10000000-0000-4000-8000-000000000001", user_id: me, kind: "personal", handle: "me", display_name: "Me", account_kind: "real" },
  { id: "10000000-0000-4000-8000-000000000002", user_id: f1, kind: "personal", handle: "ada", display_name: "Ada", account_kind: "real", photo_url: "https://cdn.example.com/ada.jpg" },
  { id: "10000000-0000-4000-8000-000000000003", user_id: f2, kind: "personal", handle: "leo", display_name: "Leo", account_kind: "real" },
];
var friendships = [{ user_id: me, friend_user_id: f1, created_at: "2026-10-15" }, { user_id: me, friend_user_id: f2, created_at: "2026-10-14" }];
var lines = rel.visibleRelations({ viewerId: me, friendships: friendships, follows: [], profiles: profiles });
var spots = rel.peopleForSpots(lines);
var ada = spots.filter(function (p) { return p.name === "Ada"; })[0];
var leo = spots.filter(function (p) { return p.name === "Leo"; })[0];
assert.strictEqual(ada.photoUrl, "https://cdn.example.com/ada.jpg", "photo carried to halo spot");
assert.ok(!("photoUrl" in leo), "no photo → no photoUrl (letter stays)");

/* Bundle read asks for photo_url; falls back without it if the column errors. */
function client(failPhoto) {
  var qs = [];
  return { qs: qs, rest: function (t, o) {
    qs.push(t + "?" + o.query);
    if (t === "friendships") return Promise.resolve(friendships);
    if (t === "follows") return Promise.resolve([]);
    if (failPhoto && /photo_url/.test(o.query)) return Promise.reject(new Error("42703"));
    return Promise.resolve(profiles);
  } };
}
var ok = client(false), bad = client(true);
Promise.all([rel._fetchBundle(ok, me), rel._fetchBundle(bad, me)]).then(function (r) {
  assert.ok(ok.qs.some(function (q) { return /^profiles\?select=[^&]*photo_url&or=/.test(q); }), "friends read includes photo_url");
  assert.strictEqual(r[0].profiles.length, 3);
  assert.ok(bad.qs.some(function (q) { return /^profiles\?select=(?!.*photo_url)[^&]*&or=/.test(q); }), "fallback read without photo_url");
  assert.strictEqual(r[1].profiles.length, 3, "PULSE list still loads on fallback");

  /* Halo spot paints the photo through the shared safe helper after the letter. */
  assert.ok(/spot\.textContent = String\(person\.name\)[\s\S]{0,600}photoApi\.applyPhoto\(spot, person\.photoUrl\)/.test(tower), "halo spot uses photo, letter first");
  /* Kept: friend-tap opens that friend's Tower, 6,000 falling friends with photos. */
  var fall = fs.readFileSync(path.join(__dirname, "pulse-falling-friends.js"), "utf8");
  assert.ok(/var PULSE_FALL_CAP = 6000;/.test(fall), "6k falling kept");
  assert.ok(/BASE_COLS \+ ",photo_url"/.test(fall) && /photo\.applyPhoto\(el, friend\.photoUrl\)/.test(fall), "falling friends use photo_url");
  assert.ok(/opts\.open\(friend\.handle, friend\)/.test(fall) && /CognationTowerOpenProfile\(handle\)/.test(tower), "friend tap opens that friend's Tower");
  var tabs = fs.readFileSync(path.join(__dirname, "tabs.js"), "utf8");
  assert.ok(/if \(!viewingOther\)/.test(tabs), "tabs never bounce a friend open to own Tower");
  console.log("pulse-halo-photos.test.js: OK");
}).catch(function (e) { console.error(e); process.exit(1); });
