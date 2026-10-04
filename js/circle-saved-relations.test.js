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

var unlabeledProfiles = profiles.concat([
  { id: "p-blank", user_id: "blank", kind: "personal", display_name: "No Label" },
  { id: "p-empty", user_id: "empty", kind: "personal", display_name: "Empty Label", account_kind: "" },
  { id: "p-unknown", user_id: "unknown", kind: "personal", display_name: "Odd Label", account_kind: "member" },
  { id: "p-null", user_id: "nullish", kind: "personal", display_name: "Null Label", account_kind: null },
]);
var unlabeled = relations.visibleRelations({
  viewerId: "real-1",
  friendships: [
    { user_id: "real-1", friend_user_id: "blank", created_at: "2026-10-04T18:00:00Z" },
    { user_id: "real-1", friend_user_id: "empty", created_at: "2026-10-04T18:01:00Z" },
    { user_id: "real-1", friend_user_id: "unknown", created_at: "2026-10-04T18:02:00Z" },
    { user_id: "real-1", friend_user_id: "nullish", created_at: "2026-10-04T18:03:00Z" },
    { user_id: "blank", friend_user_id: "empty", created_at: "2026-10-04T18:04:00Z" },
  ],
  follows: [
    { follower_user_id: "blank", profile_id: "p-real-1", created_at: "2026-10-04T18:05:00Z" },
    { follower_user_id: "real-1", profile_id: "p-blank", created_at: "2026-10-04T18:06:00Z" },
  ],
  profiles: unlabeledProfiles,
});
assert.strictEqual(unlabeled.length, 0, "unlabeled account next to a labeled real person is dropped");
unlabeled.forEach(function (line) {
  line.people.forEach(function (person) {
    assert.notStrictEqual(person.accountKind, "", "missing label is not a shown person");
    assert.ok(person.accountKind === "real" || person.accountKind === "seed" || person.accountKind === "ops");
  });
});

var missingAsReal = relations.visibleRelations({
  viewerId: "blank",
  friendships: [
    { user_id: "blank", friend_user_id: "empty", created_at: "2026-10-04T19:00:00Z" },
  ],
  follows: [],
  profiles: unlabeledProfiles,
});
assert.strictEqual(missingAsReal.length, 0, "a missing label is not treated as real");

console.log("circle-saved-relations.test.js ok");
