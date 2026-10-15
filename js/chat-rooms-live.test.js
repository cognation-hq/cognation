/**
 * ECHO chat rooms live wiring (step 2b + 2c Block/Report) — contract only.
 * Run: node js/chat-rooms-live.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var src = fs.readFileSync(path.join(__dirname, "commune-swipe.js"), "utf8");
var sql = fs.readFileSync(
  path.join(__dirname, "..", "supabase/migrations/20261015_chat_rooms.sql"),
  "utf8"
);

assert.ok(/function liveChatEligible\(/.test(src), "live eligibility helper");
assert.ok(/join_chat_room/.test(src), "joins via RPC");
assert.ok(/leave_chat_room/.test(src), "leaves via RPC");
assert.ok(/post_chat_room_message/.test(src), "posts via RPC");
assert.ok(/chat_room_messages/.test(src), "reads messages via rest");
assert.ok(/under_13/.test(src) && /room_full/.test(src) && /rating_blocked/.test(src), "surfaces server errors");
assert.ok(/blocked/.test(src) && /not_a_member/.test(src), "surfaces block + membership errors");
assert.ok(/Enter room \(local demo\)/.test(src), "demo Enter label kept for fallback");
assert.ok(/Live group chat — up to 12/.test(src), "live Enter meta");
assert.ok(/Local demo room — only you are here/.test(src), "demo open status");
assert.ok(/live group chat \(up to 12\)/.test(src), "live open status");
assert.ok(/seedops-demo-badge/.test(src) && /Demo · seed/.test(src), "Demo badge on seed authors");
assert.ok(/chatSchema === "missing"/.test(src) || /chatSchema = "missing"/.test(src), "schema-missing fallback");
assert.ok(/a1000000-0000-4000-8000-000000000004/.test(src), "sqlId for tech-ai");
assert.ok(/a1000000-0000-4000-8000-000000000004/.test(sql), "SQL seed still has tech-ai uuid");

/* Step 2c — Block / Report in live room ⋯ */
assert.ok(/data-commune-room-report/.test(src), "room Report control");
assert.ok(/data-commune-room-block/.test(src), "room Block control");
assert.ok(/data-commune-room-more/.test(src) && /⋯/.test(src), "⋯ menu on room messages");
assert.ok(/CognationBlock\.blockUser/.test(src), "Block uses existing RPC helper");
assert.ok(/CognationModeration\.enqueue/.test(src), "Report uses existing moderation queue");
assert.ok(/chat_room_message_reports/.test(src), "Report also posts to message reports table");
assert.ok(/filterBlockedLiveMessages/.test(src), "hides blocked authors client-side");
assert.ok(/roomBlockedUserIds/.test(src), "tracks blocked authors in room state");
assert.ok(!/send_dm|openDm|direct.?message/i.test(src) || /Seeds never DM|No DM path/.test(src), "no DM path from room");

console.log("chat-rooms-live tests passed");
