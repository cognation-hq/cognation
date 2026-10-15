/**
 * Chat rooms migration contract (SQL only — not executed here).
 * Run: node js/chat-rooms-sql.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var sql = fs.readFileSync(
  path.join(__dirname, "..", "supabase/migrations/20261015_chat_rooms.sql"),
  "utf8"
);
assert.ok(/create table if not exists public\.chat_rooms/.test(sql));
assert.ok(/create table if not exists public\.chat_room_members/.test(sql));
assert.ok(/create table if not exists public\.chat_room_messages/.test(sql));
assert.ok(/max_members int not null default 12/.test(sql), "small room cap default 12");
assert.ok(/cognation_user_age/.test(sql) && /under_13/.test(sql), "13+ gate");
assert.ok(!/coalesce\s*\(\s*public\.cognation_user_age/.test(sql), "null age must not coalesce to 13");
assert.ok(/age is null or age < 13/.test(sql), "RPCs fail closed on null age");
assert.ok(/cognation_user_age\(auth\.uid\(\)\) is not null/.test(sql), "SELECT policy requires non-null age");
assert.ok(/Null age fails closed/.test(sql), "RULES comment says fail closed");
assert.ok(/cognation_viewer_can_see/.test(sql), "rating gate");
assert.ok(/block_users_related/.test(sql), "honors user_blocks");
assert.ok(/room_full/.test(sql), "cap enforced on join");
assert.ok(/NOT auto-run/.test(sql), "Alexa must run SQL");
assert.ok(/20261015_chat_rooms\.sql/.test("20261015_chat_rooms.sql"));
console.log("chat-rooms-sql tests passed");
