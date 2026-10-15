/* Real <-> seed friend block: no direct insert, accept checks kind, triggers backstop, cleanup gated. */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var sql = fs.readFileSync(path.join(root, "supabase/migrations/20261015_friend_block_real_seed.sql"), "utf8");
var code = sql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");
assert.ok(/drop policy if exists "users send requests" on public\.friend_requests;/.test(code));
assert.ok(/if public\.cognation_user_is_real\(request\.sender_user_id\)\s*<> public\.cognation_user_is_real\(request\.recipient_user_id\) then\s*raise exception 'real_seed_friend_blocked';/.test(code), "accept checks kind");
assert.ok(/before insert or update on public\.friend_requests/.test(code) && /before insert or update on public\.friendships/.test(code));
assert.ok(!/\bdelete from\b/i.test(code), "cleanup delete is commented out");
assert.ok(sql.indexOf("STEP 0") < sql.indexOf("STEP 5") && /-- delete from public\.friendships/.test(sql));
assert.ok(/as mixed_friendship_rows;$/.test(code.trim()), "count shown last");
assert.ok(/security definer\s*set search_path = public/.test(code));
/* Web client never inserts friend_requests directly. */
["js/social-graph.js", "js/supabase-social.js"].forEach(function (f) {
  var src = fs.readFileSync(path.join(root, f), "utf8");
  assert.ok(!/rest\("friend_requests",\s*\{\s*method:\s*"POST"/.test(src), f + " uses the RPC");
});
console.log("friend-block-real-seed.test.js: ok");
