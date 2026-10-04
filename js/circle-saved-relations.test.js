/**
 * Circle drops a real↔seed pair and can show a pair the viewer is in.
 * Run: node js/circle-saved-relations.test.js
 */
"use strict";

var assert = require("assert");
var relations = require("./circle-saved-relations.js");

var profiles = [
  { id: "p-real-1", user_id: "real-1", kind: "personal", display_name: "Ada Lovelace", account_kind: "real" },
  { id: "p-real-2", user_id: "real-2", kind: "personal", display_name: "Grace Hopper", account_kind: "real" },
  { id: "p-real-3", user_id: "real-3", kind: "personal", display_name: "Katherine Johnson", account_kind: "real" },
  { id: "p-real-4", user_id: "real-4", kind: "personal", display_name: "Margaret Hamilton", account_kind: "real" },
  { id: "p-seed-1", user_id: "seed-1", kind: "personal", display_name: "Jordan Hale 12", account_kind: "seed" },
  { id: "p-seed-2", user_id: "seed-2", kind: "personal", display_name: "Sam2 Rivera", account_kind: "seed" },
];

var mixed = relations.visibleRelations({
  viewerId: "real-1",
  friendships: [
    { user_id: "real-1", friend_user_id: "seed-1", created_at: "2026-10-04T12:00:00Z" },
  ],
  follows: [
    { follower_user_id: "real-1", profile_id: "p-seed-2", created_at: "2026-10-04T12:05:00Z" },
  ],
  profiles: profiles,
});
assert.strictEqual(mixed.length, 0, "real paired with seed is dropped");

var seeds = relations.visibleRelations({
  viewerId: "seed-1",
  friendships: [
    { user_id: "seed-1", friend_user_id: "seed-2", created_at: "2026-10-03T12:00:00Z" },
    { user_id: "seed-2", friend_user_id: "seed-1", created_at: "2026-10-03T12:00:00Z" },
    { user_id: "real-3", friend_user_id: "real-4", created_at: "2026-10-04T12:00:00Z" },
  ],
  follows: [],
  profiles: profiles,
});
assert.strictEqual(seeds.length, 1, "seed↔seed the viewer is in can show");
assert.strictEqual(seeds[0].type, "friendship");
assert.strictEqual(seeds[0].sentence, "Jordan and Sam became friends.");
assert.strictEqual(seeds[0].people[0].badge, "Demo · seed");
assert.strictEqual(seeds[0].people[1].badge, "Demo · seed");
assert.ok(seeds[0].sentence.indexOf("Hale") === -1, "no seed last name");
assert.ok(seeds[0].sentence.indexOf("12") === -1, "no seed digits");
assert.ok(seeds[0].sentence.indexOf("Rivera") === -1, "no seed last name");

var reals = relations.visibleRelations({
  viewerId: "real-1",
  friendships: [
    { user_id: "real-1", friend_user_id: "real-2", created_at: "2026-10-02T12:00:00Z" },
    { user_id: "real-2", friend_user_id: "real-1", created_at: "2026-10-02T12:00:00Z" },
    { user_id: "real-3", friend_user_id: "real-4", created_at: "2026-10-04T12:00:00Z" },
    { user_id: "real-1", friend_user_id: "seed-1", created_at: "2026-10-04T15:00:00Z" },
  ],
  follows: [
    { follower_user_id: "real-2", profile_id: "p-real-1", created_at: "2026-10-04T08:00:00Z" },
    { follower_user_id: "real-3", profile_id: "p-real-4", created_at: "2026-10-04T09:00:00Z" },
  ],
  profiles: profiles,
});
assert.strictEqual(reals.length, 2, "viewer's real friendship and follow, nothing else");
assert.strictEqual(reals[0].type, "follow");
assert.strictEqual(reals[0].sentence, "Grace Hopper follows Ada Lovelace.");
assert.strictEqual(reals[1].type, "friendship");
assert.strictEqual(reals[1].sentence, "Ada Lovelace and Grace Hopper became friends.");
assert.ok(reals[0].at > reals[1].at, "newest first");

console.log("circle-saved-relations.test.js ok");
