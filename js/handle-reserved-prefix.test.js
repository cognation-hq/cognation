/**
 * Real members cannot take a "seed-" or "ops-" handle (case-insensitive):
 * not at signup, not when editing the Tower handle, not through the server
 * profile writes in supabase-social. SeedOps' own creation paths stay open.
 * Run: node js/handle-reserved-prefix.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var rulesPath = path.join(root, "js/handle-reserved.js");
var rulesSrc = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, "utf8") : "";

function fnSource(text, name) {
  var start = text.indexOf("function " + name + "(");
  assert.ok(start >= 0, name + " exists");
  var depth = 0, i = text.indexOf("{", start);
  for (; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) break;
  }
  return text.slice(start, i + 1);
}

/* ---- tiny DOM ------------------------------------------------------------------ */
function El(tag, attrs) {
  this.tagName = (tag || "div").toUpperCase();
  this.attrs = Object.assign({}, attrs || {});
  this.value = "";
  this.hidden = false;
  this.disabled = false;
  this.textContent = "";
  this.children = [];
  this.listeners = {};
  this.parentNode = null;
  var cls = {};
  this.classList = {
    toggle: function (c, on) { if (on === undefined) on = !cls[c]; if (on) cls[c] = 1; else delete cls[c]; return !!on; },
    add: function (c) { cls[c] = 1; },
    remove: function (c) { delete cls[c]; },
    contains: function (c) { return !!cls[c]; },
  };
  this.map = {};
}
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; };
El.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
El.prototype.querySelector = function (sel) {
  if (this.map[sel]) return this.map[sel];
  for (var i = 0; i < this.children.length; i++) {
    var c = this.children[i];
    if (sel === "[data-tower-handle-status]" && c.getAttribute("data-tower-handle-status") !== null) return c;
  }
  return null;
};
El.prototype.querySelectorAll = function () { return []; };
El.prototype.addEventListener = function (t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); };
El.prototype.insertAdjacentElement = function (_pos, el) { el.parentNode = this.parentNode; this.parentNode.children.push(el); };
El.prototype.remove = function () { var p = this.parentNode; if (p) p.children.splice(p.children.indexOf(this), 1); this.parentNode = null; };

/* ---- 1. the rule ---------------------------------------------------------------- */
assert.ok(rulesSrc, "js/handle-reserved.js exists");
var rulesCtx = { window: {} };
vm.createContext(rulesCtx);
vm.runInContext(rulesSrc, rulesCtx);
var R = rulesCtx.window.CognationHandleRules;
["seed-sam", "SEED-sam", "Seed-0001", "@ops-mod", "  Ops-Wire ", "@@seed-x", "ops-"].forEach(function (h) {
  assert.strictEqual(R.isReserved(h), true, h + " is reserved");
});
["sam", "seeds", "seed", "seed_sam", "seedling", "sam-seed", "op-s", "opsy", "myops-x", "", null].forEach(function (h) {
  assert.strictEqual(R.isReserved(h), false, String(h) + " is allowed");
});
assert.ok(/can't start with "seed-" or "ops-"/.test(R.message("Usernames")) && /^Usernames /.test(R.message("Usernames")), "plain message");

/* ---- 2. signup ------------------------------------------------------------------ */
function bootSignup(username) {
  var form = new El("form"), step = new El("div", { "data-login-mode": "signin" }), status = new El("p");
  function input(id, v) { var e = new El("input"); e.value = v; form.map["#" + id] = e; return e; }
  var user = input("login-username", username);
  input("login-password", "pw-for-test");
  input("birthdate", "1990-01-01");
  input("phone", "5555550100");
  input("email", "member@example.test");
  input("state", "TX");
  var country = new El("select"); country.value = "United States";
  form.map["[data-login-signup-country-select]"] = country;
  var calls = [];
  var doc = {
    querySelector: function (s) { return s === "[data-login-credentials-step]" ? step : null; },
    getElementById: function (id) { return id === "login-form" ? form : id === "login-status" ? status : null; },
    dispatchEvent: function () {},
  };
  var win = {
    CognationAgeGate: {
      isHeld: function () { return false; }, setHold: function () {},
      isUnderMin: function () { return false; }, ageFromBirthdate: function () { return 36; },
      yearMonth: function () { return { year: 1990, month: 1 }; },
      checkEmailBlocked: function () { calls.push("checkEmailBlocked"); return Promise.resolve(false); },
    },
    CognationSupabase: {
      configured: function () { return true; },
      signUp: function (f) { calls.push("signUp:" + f.handle); return Promise.resolve({}); },
    },
    localStorage: { getItem: function () { return null; }, setItem: function () {} },
  };
  if (rulesSrc) { var rc = { window: win }; vm.createContext(rc); vm.runInContext(rulesSrc, rc); }
  var ctx = { window: win, document: doc, localStorage: win.localStorage, CustomEvent: function () {}, Promise: Promise };
  vm.createContext(ctx);
  vm.runInContext(src("js/login-signup-shell.js"), ctx);
  step.setAttribute("data-login-mode", "signup");
  var ev = { preventDefault: function () {}, stopImmediatePropagation: function () {} };
  form.listeners.submit.forEach(function (fn) { fn(ev); });
  return new Promise(function (r) { setTimeout(r, 10); }).then(function () {
    return { calls: calls, status: status, user: user };
  });
}

var checks = [];
["Seed-sam", "OPS-helper", "@seed-x"].forEach(function (name) {
  checks.push(bootSignup(name).then(function (r) {
    assert.deepStrictEqual(r.calls.slice(), [], name + ": signup stops before any request");
    assert.strictEqual(r.status.hidden, false, name + ": status shown");
    assert.ok(r.status.classList.contains("is-error"), name + ": status is an error");
    assert.ok(/^Usernames can't start with "seed-" or "ops-"/.test(r.status.textContent), name + ": plain message (" + r.status.textContent + ")");
    assert.strictEqual(r.user.getAttribute("aria-invalid"), "true", name + ": username field marked");
  }));
});
checks.push(bootSignup("sam-seed").then(function (r) {
  assert.strictEqual(r.calls.join(","), "checkEmailBlocked,signUp:sam-seed", "normal usernames still sign up");
}));

/* ---- 3. Tower inline handle edit ------------------------------------------------ */
var tower = src("js/tower.js");
function bootInline(startHandle, typed) {
  var saved = [];
  var profile = { handle: startHandle, _profileId: "p1" };
  var wrap = new El("div");
  var badge = new El("p"); badge.parentNode = wrap; wrap.children.push(badge); badge.textContent = typed;
  var rootEl = new El("div");
  var ctx = {
    window: {}, location: { hash: "" },
    document: { createElement: function (t) { return new El(t); } },
    isTowerOwner: function () { return true; },
    TowerProfileStore: { get: function () { return Object.assign({}, profile); }, save: function (p) { saved.push(p.handle); profile = p; } },
    profilePublicSlug: function (p) { return p.handle; }, profilePublicHash: function (p) { return "tower-profile-" + p.handle; },
  };
  if (rulesSrc) { var rc = { window: ctx.window }; vm.createContext(rc); vm.runInContext(rulesSrc, rc); }
  vm.createContext(ctx);
  var names = ["normalizeHandle", "commitInlineHandle"];
  if (tower.indexOf("function reservedHandleChange(") >= 0) names.push("reservedHandleChange", "reservedHandleMessage", "showHandleStatus");
  vm.runInContext(names.map(function (n) { return fnSource(tower, n); }).join("\n"), ctx);
  ctx.commitInlineHandle(rootEl, badge);
  var st = wrap.children.filter(function (c) { return c.getAttribute("data-tower-handle-status") !== null; })[0];
  return { saved: saved, badge: badge, status: st };
}
var bad = bootInline("sam", "@Seed-sam");
assert.strictEqual(bad.saved.length, 0, "inline edit to seed- is not saved");
assert.strictEqual(bad.badge.textContent, "@sam", "badge reverts to the old handle");
assert.ok(bad.status && /^Handles can't start with "seed-" or "ops-"/.test(bad.status.textContent), "plain message under the handle");
assert.strictEqual(bootInline("sam", "OPS-sam").saved.length, 0, "inline edit to ops- is not saved");
var good = bootInline("sam", "sam-two");
assert.strictEqual(good.saved.join(), "sam-two", "a normal handle still saves");
assert.ok(!good.status, "no error for a normal handle");
assert.strictEqual(bootInline("seed-legacy", "seed-legacy").saved.length, 1, "an unchanged existing handle still saves (no lock-out)");

/* Profile form save checks only a changed handle. */
var formSave = tower.slice(tower.indexOf('var handleInputSave = root.querySelector("[data-tower-handle]");'), tower.indexOf("p.socialLinks = p.socialLinks || {};"));
assert.ok(/reservedHandleChange\(handleNext\)/.test(formSave) && /handleNext !== normalizeHandle\(p\.handle\)/.test(formSave) && /setProfileStatus\(reservedHandleMessage\(\), true\)/.test(formSave), "profile form refuses a new reserved handle");

/* ---- 4. supabase-social server writes ------------------------------------------- */
var social = src("js/supabase-social.js");
function bootSocial(rowHandle) {
  var sent = [];
  var ctx = {
    window: {},
    identity: function () { return { activeProfileId: "p1", supabaseUserId: "u1-abcdefgh" }; },
    profileForId: function () { return { id: "p1", user_id: "u1-abcdefgh", handle: rowHandle, display_name: "Sam", bio: "" }; },
    client: function () { return { rest: function (t, o) { sent.push(o.method + ":" + (o.body.handle || "")); return Promise.resolve([o.body]); } }; },
    cacheProfile: function (r) { return r; }, setActiveProfile: function () {}, emit: function () {},
    state: { myProfiles: [] }, PROFILE_RETURN_COLUMNS: "id",
  };
  if (rulesSrc) { var rc = { window: ctx.window }; vm.createContext(rc); vm.runInContext(rulesSrc, rc); }
  vm.createContext(ctx);
  var names = ["normalizeHandle", "updateCurrentProfile", "createProfessionalProfile"];
  if (social.indexOf("function reservedHandle(") >= 0) names.push("reservedHandle", "reservedHandleMessage");
  vm.runInContext(names.map(function (n) { return fnSource(social, n); }).join("\n"), ctx);
  return { ctx: ctx, sent: sent };
}
function rejects(p, label) {
  return p.then(function () { assert.fail(label + " should reject"); }, function (e) {
    assert.ok(/can't start with "seed-" or "ops-"/.test(e.message), label + ": plain error (" + e.message + ")");
  });
}
(function () {
  var s1 = bootSocial("sam");
  checks.push(rejects(s1.ctx.updateCurrentProfile({ handle: "Seed-sam" }), "PATCH to seed-").then(function () {
    assert.strictEqual(s1.sent.length, 0, "no PATCH sent");
  }));
  var s2 = bootSocial("sam");
  checks.push(rejects(s2.ctx.createProfessionalProfile({ handle: "ops-studio" }), "POST ops- page").then(function () {
    assert.strictEqual(s2.sent.length, 0, "no POST sent");
  }));
  var s3 = bootSocial("seed-0001-sasha");
  checks.push(s3.ctx.updateCurrentProfile({ handle: "seed-0001-sasha", displayName: "Sasha B" }).then(function () {
    assert.strictEqual(s3.sent.join(), "PATCH:", "a seed account keeping its handle can still save other fields");
  }));
  var s4 = bootSocial("sam");
  checks.push(s4.ctx.createProfessionalProfile({ handle: "sam-pro" }).then(function () {
    assert.strictEqual(s4.sent.join(), "POST:sam-pro", "normal professional page still created");
  }));
})();

/* ---- 5. SeedOps creation paths do not go through the check ----------------------- */
assert.ok(/<script src="js\/handle-reserved\.js" defer><\/script>/.test(src("index.html")), "rules load on the page");
["js/seedops-schema.js", "js/seedops-tower-hydrate.js", "js/accounts.js", "scripts/seedops-bind-auth.mjs"].forEach(function (f) {
  assert.ok(!/CognationHandleRules|isReserved/.test(src(f)), f + " (SeedOps / registry creation) is untouched by the block");
});
assert.ok(/handle: "seed-" \+ slugify\(name\) \+ "-" \+ nnn/.test(src("scripts/seedops-bind-auth.mjs")), "SeedOps still names seeds seed-…");

/* ---- 6. server backstop SQL (written for Alexa to run; never run here) ----------- */
var sqlPath = path.join(root, "supabase/migrations/20261020_reserved_handle_prefix.sql");
assert.ok(fs.existsSync(sqlPath), "server SQL is in the PR");
var sql = fs.readFileSync(sqlPath, "utf8");
assert.ok(/NOT auto-run/.test(sql), "SQL says it is not auto-run");
assert.ok(/before insert or update of handle on public\.profiles/.test(sql) && /new\.handle ~\* '\^\(seed\|ops\)-'/.test(sql), "profiles trigger, case-insensitive");
assert.ok(/jwt_role not in \('anon', 'authenticated'\)/.test(sql), "only browser roles are blocked (service_role / postgres SeedOps paths pass)");
assert.ok(/tg_op = 'INSERT' or new\.handle is distinct from old\.handle/.test(sql), "unchanged handles are not blocked");
assert.ok(/session_user = 'supabase_auth_admin'/.test(sql) && /raw_app_meta_data ->> 'seedops'/.test(sql), "signup trigger exempts SeedOps admin creation");
assert.ok(/insert into public\.profiles \(user_id, kind, handle, display_name\)/.test(sql) && /'member_' \|\| replace/.test(sql), "signup trigger keeps its insert and member_ fallback");

Promise.all(checks).then(function () { console.log("handle-reserved-prefix.test.js ok"); }, function (e) { console.error(e); process.exit(1); });
