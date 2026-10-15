/**
 * Seed birth backfill + no_birth chat join + u13 remove (contract only).
 * Run: node js/seed-birth-backfill.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");

var backfill = fs.readFileSync(
  path.join(root, "supabase/migrations/20261016_seed_birth_backfill.sql"),
  "utf8"
);
var remove = fs.readFileSync(
  path.join(root, "supabase/migrations/20261016_seed_u13_remove.sql"),
  "utf8"
);
var swipe = fs.readFileSync(path.join(root, "js/commune-swipe.js"), "utf8");
var hydrate = fs.readFileSync(path.join(root, "js/seedops-dating-hydrate.js"), "utf8");
var prompt = fs.readFileSync(path.join(root, "js/birth-prompt.js"), "utf8");
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.ok(/NOT auto-run/i.test(backfill), "backfill not auto-run");
assert.ok(/account_kind = 'seed'/.test(backfill), "seed rows only");
assert.ok(/seed-0248/.test(backfill), "skips Sage fleet id");
assert.ok(/on conflict \(user_id\) do nothing/.test(backfill), "skip existing birth");
assert.ok(/13 \+ \(\(/.test(backfill) || /13 \+ \(\(/.test(backfill.replace(/\s+/g, " ")), "ages 13..26 map");
assert.ok(/raise exception 'no_birth'/.test(backfill), "no_birth code");
assert.ok(/raise exception 'under_13'/.test(backfill), "under_13 kept for real under-13");
assert.ok(/if age is null then raise exception 'no_birth'/.test(backfill));
assert.ok(/if age < 13 then raise exception 'under_13'/.test(backfill));
assert.ok(!/account_kind = 'real'/.test(backfill) || /never touches real/i.test(backfill));

assert.ok(/NOT auto-run/i.test(remove), "u13 remove not auto-run");
assert.ok(/seed-0248/.test(remove) && /seed-sage-0248/.test(remove), "lists Sage handle");
assert.ok(/delete from auth\.users/i.test(remove), "removes auth users");

assert.ok(/no_birth/.test(swipe) && /Add your birth year and month in your profile to join chat rooms/.test(swipe));
assert.ok(/Chat rooms are for members 13 and up\./.test(swipe), "under_13 copy no longer implies missing birth");
assert.ok(/datingKindsCompatible/.test(swipe), "seed↔seed dating filter");
assert.ok(/age >= 18/.test(swipe) && /getSeeDating\(\)/.test(swipe), "dating gate age >= 18");

assert.ok(/seedAgeFromFleetId/.test(hydrate) && /seedDatingOn/.test(hydrate));
assert.ok(/age >= 18 && age <= 26/.test(hydrate), "dating band 18–26");

assert.ok(/set_my_birth_month/.test(prompt), "saves via RPC");
assert.ok(/Birth year/.test(prompt) && /Birth month/.test(prompt));
assert.ok(!/birth.?day|scolding|too young/i.test(prompt.replace(/under-13 scolding/g, "")));
assert.ok(/We never store the day/.test(prompt), "muted why line");
assert.ok(/birth-prompt\.js/.test(html), "wired in index.html");

/* Deterministic age map: Ada seed-0001 → 13; skip 0248 */
function ageFromNnn(nnn) {
  if (nnn === 248) return 11;
  return 13 + ((nnn - 1) % 14);
}
assert.strictEqual(ageFromNnn(1), 13);
assert.strictEqual(ageFromNnn(14), 26);
assert.strictEqual(ageFromNnn(15), 13);
assert.strictEqual(ageFromNnn(248), 11);
assert.strictEqual(ageFromNnn(6), 18);

console.log("seed-birth-backfill.test.js: ok");
