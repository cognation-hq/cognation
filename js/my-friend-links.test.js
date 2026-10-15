/* my_friend_links(): viewer's own friends only, no seeds, no emails, definer + fixed search_path. */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var sql = fs.readFileSync(path.join(__dirname, "..", "supabase/migrations/20261015_my_friend_links.sql"), "utf8");
var code = sql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");
assert.ok(/security definer\s*set search_path = public/.test(code));
assert.ok(/returns table \(a_profile_id uuid, b_profile_id uuid\)/.test(code), "profile ids only");
assert.ok(!/email|display_name|handle/i.test(code), "no emails or names");
assert.ok(/public\.my_friend_links\(\)\s*returns/.test(code), "no parameter: always the viewer");
assert.ok(/cognation_user_is_real\(auth\.uid\(\)\)/.test(code) && /cognation_user_is_real\(f\.friend_user_id\)/.test(code), "no seeds");
assert.ok(/revoke all on function public\.my_friend_links\(\) from public, anon;/.test(code));
console.log("my-friend-links.test.js: ok");
