/**
 * Real DMs: Supabase-backed, no demo notice, no localStorage-only saving.
 * Run: node js/direct-messages.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
var src = fs.readFileSync(path.join(root, "js/commune-messages.js"), "utf8");
var A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
var PA = "aaaaaaaa-1111-4111-8111-111111111111", PB = "bbbbbbbb-2222-4222-8222-222222222222";
var THREAD = "33333333-3333-4333-8333-333333333333";

/* Fake server shared by two browsers. */
function server(opts) {
  opts = opts || {};
  return { threads: [{ id: THREAD, a: A, b: B, kind: "dm" }], messages: [], n: 0, fail: opts.fail };
}

function browser(db, uid, signedIn) {
  var writes = [];
  var storage = { getItem: function () { return null; }, setItem: function (k) { writes.push(k); }, removeItem: function () {} };
  var client = {
    configured: function () { return true; },
    getSession: function () { return signedIn ? { access_token: "t", user: { id: uid } } : null; },
    rpc: function (name, p) {
      if (db.fail) return Promise.reject({ message: db.fail });
      if (name === "list_my_direct_threads") {
        return Promise.resolve(db.threads.filter(function (t) { return t.a === uid || t.b === uid; }).map(function (t) {
          var peer = t.a === uid ? t.b : t.a;
          return { id: t.id, kind: t.kind, peer_user_id: peer, peer_profile_id: peer === A ? PA : PB, peer_name: peer === A ? "Alex" : "Luna" };
        }));
      }
      if (name === "send_direct_message") {
        var row = { id: "m" + (++db.n), thread_id: p.p_thread_id, sender_user_id: uid, body: p.p_body, kind: "friend", created_at: new Date(Date.now() + db.n).toISOString() };
        db.messages.push(row);
        return Promise.resolve(row);
      }
      if (name === "open_direct_thread") return Promise.resolve({ id: THREAD, kind: p.p_kind });
      return Promise.reject({ message: "unknown rpc" });
    },
    rest: function (table, o) {
      assert.strictEqual(table, "direct_messages");
      assert.ok(/thread_id=in\./.test(o.query));
      return Promise.resolve(db.messages.slice());
    },
  };
  var w = { CognationSupabase: client };
  var ctx = vm.createContext({
    window: w, localStorage: storage, console: console, Promise: Promise, Date: Date, Math: Math, JSON: JSON,
    Object: Object, Array: Array, String: String, Number: Number, RegExp: RegExp,
    CustomEvent: function () {},
    document: { readyState: "complete", querySelector: function () { return null; }, addEventListener: function () {}, dispatchEvent: function () {} },
  });
  vm.runInContext(src, ctx);
  return { store: w.CognationMessageStore, writes: writes };
}

(async function () {
  /* Source: notice and local saving are gone. */
  assert.ok(src.indexOf("Saved locally (demo)") === -1, "demo notice removed");
  assert.ok(src.indexOf("cognation.commune.messages.v1") === -1, "localStorage message key removed");
  assert.ok(!/localStorage\.setItem/.test(src), "no localStorage writes in messages");
  assert.ok(!/SEED\b|local demo thread|Alex Rivera|Jordan Lee/.test(src), "no seeded demo threads");
  var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(html.indexOf("Saved locally (demo)") === -1);

  /* Alex sends; Luna sees it after a reload (fresh browser, same server). */
  var db = server();
  var alex = browser(db, A, true);
  assert.strictEqual(alex.store.listConversations().length, 0, "no threads before the server answers");
  await alex.store.refresh();
  assert.strictEqual(alex.store.listConversations().length, 1);
  assert.strictEqual(alex.store.listConversations()[0].title, "Luna");
  var sent = await alex.store.sendMessage(THREAD, "  hi Luna ");
  assert.ok(sent.ok);
  assert.strictEqual(db.messages.length, 1, "saved to the server");
  assert.strictEqual(db.messages[0].body, "hi Luna");
  assert.strictEqual(alex.writes.length, 0, "nothing written to localStorage");

  var luna = browser(db, B, true);
  await luna.store.refresh();
  var conv = luna.store.getConversation(THREAD);
  assert.strictEqual(conv.title, "Alex");
  assert.strictEqual(conv.messages.length, 1);
  assert.strictEqual(conv.messages[0].body, "hi Luna");
  assert.strictEqual(conv.messages[0].senderName, "Alex");
  var reply = await luna.store.sendMessage(THREAD, "hey Alex");
  assert.ok(reply.ok);
  var alex2 = browser(db, A, true);
  await alex2.store.refresh();
  var c2 = alex2.store.getConversation(THREAD);
  assert.strictEqual(c2.messages.map(function (m) { return m.senderId; }).join(","), "you," + PB, "own vs other sides");

  /* Failure: honest status, nothing kept locally. */
  var down = server({ fail: 'Could not find the function public.send_direct_message PGRST202' });
  var b2 = browser(down, A, true);
  b2.store.getState().conversations.push({ id: THREAD, title: "Luna", messages: [] });
  var bad = await b2.store.sendMessage(THREAD, "hello");
  assert.ok(!bad.ok);
  assert.strictEqual(bad.error, "Messages aren't available yet. Try again soon.");
  assert.strictEqual(b2.store.getConversation(THREAD).messages.length, 0, "no fake local message on failure");
  var blocked = browser(server({ fail: "blocked" }), A, true);
  blocked.store.getState().conversations.push({ id: THREAD, title: "Luna", messages: [] });
  assert.strictEqual((await blocked.store.sendMessage(THREAD, "x")).error, "You can't message this person.");

  /* Signed out: no threads, honest line. */
  var out = browser(server(), A, false);
  var r = await out.store.refresh();
  assert.ok(!r.ok);
  assert.strictEqual(out.store.statusText(), "Sign in to see and send messages.");
  assert.strictEqual(out.store.listConversations().length, 0);

  /* Non-UUID peers never hit the server. */
  var e = await alex.store.ensureConversation("seed-luna-0053", "Luna");
  assert.ok(!e.ok);

  /* SQL contract. */
  var sql = fs.readFileSync(path.join(root, "supabase/migrations/20261017_direct_messages.sql"), "utf8");
  assert.ok(/NOT auto-run/.test(sql));
  assert.ok(/create or replace function public\.is_direct_thread_member\(p_thread_id uuid\)[\s\S]*?security definer[\s\S]*?set search_path = public/.test(sql));
  var threadPolicy = sql.slice(sql.indexOf('create policy "direct threads'), sql.indexOf('drop policy if exists "direct messages'));
  assert.ok(!/from public\.direct_threads/.test(threadPolicy), "thread policy does not query itself");
  var msgPolicy = sql.slice(sql.indexOf('create policy "direct messages'), sql.indexOf("-- Open (or find)"));
  assert.ok(/is_direct_thread_member\(thread_id\)/.test(msgPolicy) && !/from public\./.test(msgPolicy), "message policy via definer helper");
  assert.ok(/cognation_viewer_can_see\(rating\)/.test(msgPolicy), "rating gate on reads");
  assert.ok((sql.match(/block_users_related/g) || []).length >= 4, "blocks on open, send, read");
  assert.ok(/real_seed_blocked/.test(sql) && /cognation_user_is_real/.test(sql), "real/seed rule");
  assert.ok(/cognation_auto_rate\(cleaned/.test(sql) && /'harmful'/.test(sql), "messages auto-rated");
  assert.ok(/age is null or age < 13/.test(sql), "13+ fails closed");
  assert.ok(/revoke all on public\.direct_messages from anon, authenticated/.test(sql), "no direct writes");
  assert.ok(!/grant (insert|update|delete)/i.test(sql));
  console.log("direct-messages tests passed");
})().catch(function (err) { console.error(err); process.exit(1); });
