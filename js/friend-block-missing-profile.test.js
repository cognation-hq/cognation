/* Fail closed: no personal profile => not real. */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var sql = fs.readFileSync(path.join(__dirname, "..", "supabase/migrations/20261015_friend_block_missing_profile.sql"), "utf8");
var code = sql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");
assert.ok(/where p\.user_id = uid and p\.kind = 'personal' limit 1\),\s*false\);/.test(code), "missing profile = not real");
assert.ok(/if public\.cognation_user_is_real\(auth\.uid\(\)\) <> public\.cognation_user_is_real\(recipient\.user_id\) then/.test(code));
assert.ok(!/coalesce\(account_kind, 'real'\)|actor_kind := coalesce/.test(code), "no 'real' default left");
assert.ok(/as users_without_personal_profile/.test(code));
console.log("friend-block-missing-profile.test.js: ok");
