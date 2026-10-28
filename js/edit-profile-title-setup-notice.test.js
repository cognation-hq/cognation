/**
 * Edit profile sheet title (body sans, weight 600) and the one-time
 * "Your professional page is set up." notice (dark glass, shown only right
 * after this tab created the Pro page, only on the Pro page; closing Edit
 * profile spends it; no storage, no server write).
 * Run: node --test js/edit-profile-title-setup-notice.test.js
 */
"use strict";
var test = require("node:test");
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
var js = fs.readFileSync(path.join(root, "js/tower.js"), "utf8");
function norm(s) { return s.replace(/\s+/g, " "); }

test("Edit profile title: body sans at weight 600 (same face as the SIGNAL timestamp fix)", function () {
  var block = /#panel-tower \.tower-profile-edit-sheet-title \{\s*font-family: var\(--cgn-ui, ui-sans-serif, system-ui, sans-serif\) !important;\s*font-weight: 600 !important;\s*font-style: normal;/;
  assert.ok(block.test(css), "sheet title rule");
  assert.ok(css.indexOf("font-family: var(--cgn-ui, ui-sans-serif, system-ui, sans-serif) !important") <
    css.search(block), "after the SIGNAL timestamp rule that uses the same stack");
});

test("Setup notice: dark glass, white text, 1px lilac border, no brown", function () {
  var m = /#panel-tower \.tower-add-profile-row \.commune-status\.tower-pro-setup-notice \{([^}]*)\}/.exec(css);
  assert.ok(m, "notice rule");
  var body = norm(m[1]);
  assert.ok(body.indexOf("background: rgba(18, 16, 38, 0.92) !important;") >= 0);
  assert.ok(body.indexOf("color: #f7f9ff !important;") >= 0);
  assert.ok(body.indexOf("border: 1px solid rgba(217, 210, 240, 0.4) !important;") >= 0);
  assert.ok(!/237, 147, 0|#ED9300|#1c1630/i.test(body));
  assert.ok(css.indexOf(m[0]) < css.indexOf("/* TOWER Feed contrast (Designer follow-up)."), "before the last block");
});

test("Seen flag lives in memory only: no localStorage/sessionStorage, no server write", function () {
  var lines = js.split("\n").filter(function (l) { return l.indexOf("__cognationProSetupJustCreated") >= 0; });
  assert.ok(lines.length >= 4, "flag set on create, read in sync, cleared on close");
  lines.forEach(function (l) { assert.ok(!/Storage|\.rest\(|\.rpc\(/.test(l), l); });
  assert.ok(/root\.__cognationProSetupJustCreated = true;\s*setSt\("Professional page created\."/.test(js), "set after create");
  assert.ok(/flushSocialFieldsFromForm\(root\); \} catch \(eFlush\) \{\}\s*\/\*[^*]*\*\/\s*if \(root\.__cognationProSetupJustCreated\) \{\s*root\.__cognationProSetupJustCreated = false;/.test(js), "cleared on close");
  assert.ok(js.indexOf('"Your professional page is set up."') >= 0, "notice code kept");
});

/* Run the real syncAddProfileUi against a fake root. */
function run(opts) {
  var start = js.indexOf("  function syncAddProfileUi(root) {");
  var end = js.indexOf("  function initAddProfile(root) {");
  var fnSrc = js.slice(start, end);
  function el() { return { hidden: true, textContent: "", classList: { set: {}, remove: function (c) { delete this.set[c]; }, toggle: function (c, on) { if (on) this.set[c] = 1; else delete this.set[c]; } } }; }
  var btn = el(), status = el(), popups = [];
  var fakeRoot = { querySelector: function (s) { return s === "[data-tower-add-profile]" ? btn : s === "[data-tower-add-profile-status]" ? status : null; } };
  if (opts.flag) fakeRoot.__cognationProSetupJustCreated = true;
  var ctx = {
    document: { activeElement: null },
    usingRemoteSocial: function () { return true; },
    remoteSocial: function () { return { getMyProfiles: function () { return opts.profiles; } }; },
    getSessionObject: function () { return { username: "riley", profileKind: opts.kind }; },
    TowerProfileStore: { get: function () { return { _profileKind: opts.kind }; } },
    /* #167: the setup notice moved from the inline status box to the shared status popup. */
    showStatusPopup: function (msg, isError, o) { popups.push({ msg: String(msg || ""), isError: !!isError, once: !!(o && o.once) }); },
  };
  vm.runInNewContext(fnSrc + "\nsyncAddProfileUi(__root);", Object.assign(ctx, { __root: fakeRoot }));
  return { btn: btn, status: status, popups: popups };
}
var both = [{ kind: "personal" }, { kind: "professional" }];

test("shows right after the first Pro setup, on the Pro page", function () {
  var r = run({ profiles: both, kind: "professional", flag: true });
  assert.strictEqual(r.popups.length, 1, "one notice");
  assert.strictEqual(r.popups[0].msg, "Your professional page is set up.");
  assert.strictEqual(r.popups[0].isError, false, "a notice, not an error");
  assert.ok(r.popups[0].once, "shown once");
  assert.strictEqual(r.btn.hidden, true);
});
test("never on a later open (flag spent or new page load)", function () {
  var r = run({ profiles: both, kind: "professional", flag: false });
  assert.strictEqual(r.status.hidden, true);
  assert.strictEqual(r.status.textContent, "");
  assert.strictEqual(r.popups.length, 0, "no popup notice");
});
test("never in Personal Edit profile, even right after setup", function () {
  var p1 = run({ profiles: both, kind: "personal", flag: true });
  assert.strictEqual(p1.status.hidden, true);
  assert.strictEqual(p1.popups.length, 0, "no popup notice in Personal");
  assert.strictEqual(run({ profiles: both, kind: "personal", flag: false }).status.hidden, true);
});
test("no Pro page yet: Add button shows, no notice", function () {
  var r = run({ profiles: [{ kind: "personal" }], kind: "personal", flag: false });
  assert.strictEqual(r.btn.hidden, false);
  assert.strictEqual(r.status.hidden, true);
  assert.strictEqual(r.popups.length, 0, "no popup notice");
});
