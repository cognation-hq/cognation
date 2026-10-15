/**
 * ECHO chat rooms step 2c — Block/Report + human-hide contract + SQL migration.
 * Run: node js/chat-rooms-2c.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var src = fs.readFileSync(path.join(__dirname, "commune-swipe.js"), "utf8");
var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
var blocksSql = fs.readFileSync(path.join(root, "supabase/migrations/20261016_user_blocks.sql"), "utf8");
var roomsSql = fs.readFileSync(path.join(root, "supabase/migrations/20261015_chat_rooms.sql"), "utf8");
var reportsSql = fs.readFileSync(
  path.join(root, "supabase/migrations/20261015_chat_room_message_reports.sql"),
  "utf8"
);
var blockJs = fs.readFileSync(path.join(root, "js/block.js"), "utf8");

/* Existing blocks infrastructure (no new block SQL in 2c). */
assert.ok(/create table if not exists public\.user_blocks/.test(blocksSql));
assert.ok(/block_user\(/.test(blocksSql) && /block_users_related/.test(blocksSql));
assert.ok(/block_users_related/.test(roomsSql), "chat message reads honor blocks");
assert.ok(/CognationBlock/.test(blockJs) && /rpc\("block_user"/.test(blockJs));

/* UI: Report then Block, escapeHtml on names/bodies/attrs, works on seeds. */
assert.ok(/Report<\/button>'/.test(src) || /">Report<\/button>/.test(src));
assert.ok(/reportBtn \+[\s\S]*blockBtn|Report[\s\S]*Block/.test(src), "Report then Block");
assert.ok(/escapeHtml\(msg\.senderName/.test(src) && /escapeHtml\(msg\.body/.test(src));
assert.ok(/escapeHtml\(mid\)/.test(src) && /escapeHtml\(uid\)/.test(src), "escape menu attrs");
assert.ok(/seedBadgeForAuthor/.test(src), "Demo badge still on seed authors");
assert.ok(/kind: "chat_room_message"/.test(src) || /kind: 'chat_room_message'/.test(src));

/* No local demo room (standing rule); ⋯ only in a live room. */
assert.ok(/if \(!state\.liveRoom\) return ""/.test(src), "⋯ only in live room");
assert.ok(!/Enter room \(local demo\)|Local demo room — only you are here|opening local demo/.test(src), "no local demo copy");
assert.ok(/function liveRoomUnavailable\(/.test(src) && !/function openDemoRoom\(/.test(src), "no demo fallback room");

/* Own messages: no menu when author === me. */
assert.ok(/uid === me/.test(src), "skip ⋯ on own messages");

/* CSS dark shell pills. */
assert.ok(/\.commune-room-more/.test(css));
assert.ok(/\.commune-room-line \.news-report-option/.test(css));
assert.ok(/font-size: 0\.68rem/.test(css));

/* Reports migration: Alexa-run; human hide; seed flag + 20/day. */
assert.ok(/NOT auto-run/.test(reportsSql));
assert.ok(/create table if not exists public\.chat_room_message_reports/.test(reportsSql));
assert.ok(/unique \(message_id, reporter_user_id\)/.test(reportsSql));
assert.ok(/enable row level security/.test(reportsSql));
assert.ok(/add column if not exists hidden_at/.test(reportsSql), "hidden_at on messages");
assert.ok(/hidden_reason/.test(reportsSql));
assert.ok(/and hidden_at is null/.test(reportsSql), "room read RLS excludes hidden");
assert.ok(/report_chat_room_message/.test(reportsSql), "report RPC");
assert.ok(/cognation_user_is_real/.test(reportsSql), "uses real/seed helper");
assert.ok(/seed_today >= 20/.test(reportsSql) && /seed_report_cap/.test(reportsSql), "seed 20/day cap");
assert.ok(/FLAG ONLY/.test(reportsSql) || /flag only/i.test(reportsSql), "seed flags only");
assert.ok(/hidden_at = coalesce\(hidden_at, now\(\)\)/.test(reportsSql), "human report hides");
assert.ok(/hidden_message/.test(reportsSql), "RPC returns hidden_message");
assert.ok(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(reportsSql), "no emails in SQL");

/* Client: RPC + immediate hide for real reporters. */
assert.ok(/report_chat_room_message/.test(src), "client calls report RPC");
assert.ok(/hideLiveMessageLocally/.test(src), "hides locally for reporter");
assert.ok(/roomHiddenMsgIds/.test(src));
assert.ok(/hidden_message/.test(src));
assert.ok(/reporterLooksRealClient/.test(src), "fallback hide when reporter looks real");
assert.ok(/CognationModeration\.enqueue/.test(src));

/* No Cap 250 wording in 2c sources. */
assert.ok(!/Cap 250/.test(src));
assert.ok(!/Cap 250/.test(reportsSql));

console.log("chat-rooms-2c tests passed");
assert.ok(!/function roomLog\(/.test(src) && !/Chatroom · local demo/.test(src), "no local room log or demo kicker");
