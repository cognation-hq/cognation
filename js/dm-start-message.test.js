/**
 * DMs: Message button starts a real thread; signed-in empty state is honest.
 * Run: node js/dm-start-message.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
var PEER = "bbbbbbbb-2222-4222-8222-222222222222";
var THREAD = "33333333-3333-4333-8333-333333333333";

function makeEnv(opts) {
  var listeners = {};
  var calls = [];
  var signedIn = opts.signedIn;
  var rowEl = { hidden: false, querySelector: function (sel) { return sel === "[data-tower-message-status]" ? statusEl : null; } };
  var statusEl = { hidden: true, textContent: "" };
  var appEl = { getAttribute: function () { return opts.viewKind || "personal"; } };
  var btn = { hidden: true, disabled: false, closest: function (sel) { return sel === "[data-tower-follow-row]" ? rowEl : sel === "[data-tower-app]" ? appEl : null; } };
  var w = {
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return signedIn ? { access_token: "t", user: { id: "u1" } } : null; },
      rpc: function (name, p) {
        calls.push(name);
        if (name === "list_my_direct_threads") return Promise.resolve([]);
        if (name === "open_direct_thread") {
          if (opts.openError) return Promise.reject({ message: opts.openError });
          assert.strictEqual(p.p_peer_profile_id, PEER);
          return Promise.resolve({ id: THREAD, kind: "dm" });
        }
        return Promise.reject({ message: "unexpected" });
      },
      rest: function () { return Promise.resolve([]); },
    },
    CognationTowerProfileStore: { get: function () { return { _profileId: opts.profileId || PEER, displayName: "Skye", kind: "personal" }; } },
  };
  var doc = {
    readyState: "complete",
    querySelector: function () { return null; },
    querySelectorAll: function (sel) { return sel === "[data-tower-message]" ? [btn] : []; },
    addEventListener: function (n, f) { (listeners[n] = listeners[n] || []).push(f); },
    dispatchEvent: function (ev) { (listeners[ev && ev.type] || []).forEach(function (f) { f(ev); }); },
  };
  var ctx = vm.createContext({ window: w, document: doc, localStorage: { getItem: function () { return null; }, setItem: function () {} },
    console: console, Promise: Promise, setTimeout: setTimeout, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number, RegExp: RegExp,
    CustomEvent: function (t) { this.type = t; } });
  vm.runInContext(fs.readFileSync(path.join(root, "js/commune-messages.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "js/tower-message.js"), "utf8"), ctx);
  return { w: w, btn: btn, row: rowEl, status: statusEl, calls: calls, setSignedIn: function (v) { signedIn = v; }, fire: function (n) { (listeners[n] || []).forEach(function (f) { f({ type: n }); }); } };
}

(async function () {
  /* (b) empty state */
  var e = makeEnv({ signedIn: true });
  await e.w.CognationMessageStore.refresh();
  var st = e.w.CognationMessageStore.statusText();
  assert.ok(st.indexOf("Sign in") === -1, "signed-in user is not told to sign in");
  assert.strictEqual(st, "No messages yet. Open a friend's Tower and tap Message to start one.");
  var out = makeEnv({ signedIn: false });
  await out.w.CognationMessageStore.refresh();
  assert.strictEqual(out.w.CognationMessageStore.statusText(), "Sign in to see and send messages.");
  out.setSignedIn(true);
  await out.w.CognationMessageStore.refresh();
  assert.ok(out.w.CognationMessageStore.statusText().indexOf("Sign in") === -1, "status updates after sign-in");
  var src = fs.readFileSync(path.join(root, "js/commune-messages.js"), "utf8");
  assert.ok(/"cognation:session-started", "cognation:auth-changed"/.test(src), "re-loads on sign-in");
  assert.ok(/syncStoreStatus\(\);[\s\S]*?\};/.test(src), "status re-synced on every UI refresh");

  /* (a) Message button */
  var m = makeEnv({ signedIn: true });
  m.w.CognationTowerMessage.sync(m.btn);
  assert.strictEqual(m.btn.hidden, false, "shown on another member's personal page");
  var opened = null;
  m.w.CognationMessageStore._openThread = function (id) { opened = id; };
  await m.w.CognationTowerMessage.start(m.btn);
  assert.ok(m.calls.indexOf("open_direct_thread") !== -1, "calls open_direct_thread");
  assert.strictEqual(opened, THREAD, "opens the thread in Messages");

  m.row.hidden = true; /* own page: tower-follow hides the row */
  m.w.CognationTowerMessage.sync(m.btn);
  assert.strictEqual(m.btn.hidden, true, "hidden on your own page");
  var pro = makeEnv({ signedIn: true, viewKind: "professional" });
  pro.w.CognationTowerMessage.sync(pro.btn);
  assert.strictEqual(pro.btn.hidden, true, "not on professional pages");
  var seedId = makeEnv({ signedIn: true, profileId: "seed-luna-0053" });
  seedId.w.CognationTowerMessage.sync(seedId.btn);
  assert.strictEqual(seedId.btn.hidden, true, "non-UUID (non-member) pages get no button");
  var so = makeEnv({ signedIn: false });
  so.w.CognationTowerMessage.sync(so.btn);
  assert.strictEqual(so.btn.hidden, true, "signed out: no button");

  var cases = [["real_seed_blocked", "You can't message this person."], ["blocked", "You can't message this person."], ["under_13", "Messages are for members 13 and up."]];
  for (var i = 0; i < cases.length; i++) {
    var b = makeEnv({ signedIn: true, openError: cases[i][0] });
    await b.w.CognationTowerMessage.start(b.btn);
    assert.strictEqual(b.status.textContent, cases[i][1], cases[i][0] + " shows an honest line");
    assert.strictEqual(b.status.hidden, false);
  }
  var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(/data-tower-message\b/.test(html) && /js\/tower-message\.js/.test(html));
  console.log("dm-start-message tests passed");
})().catch(function (err) { console.error(err); process.exit(1); });
