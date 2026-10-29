/**
 * Shared-device account switch with no page reload (login.js never reloads:
 * sign-out fires cognation:session-ended, the next sign-in fires
 * cognation:session-started). Drives the real modules in one page context:
 * age-floor-keywords, seedops-u13-test-viewer, commune-swipe,
 * seedops-dating-hydrate and birth-prompt, with a fake Supabase client whose
 * getUser / user_birth answers can be delayed.
 *
 * Expect:
 *   - An adult signs out and a teen signs in: Classroom (and dating, with the
 *     dating switch forced on here) stays refused until the teen's own age is
 *     read, then reflects the teen's age. The adult's age never leaks through.
 *   - A hydrate (or See dating write) started for the adult that finishes after
 *     the switch is ignored.
 *   - The birth-month ask is closed on sign-out, and a save still in flight for
 *     the earlier account does nothing for the next one.
 * Run: node --test js/teen-account-switch.test.js
 */
"use strict";
var test = require("node:test");
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function read(rel) { return fs.readFileSync(path.join(__dirname, "..", rel), "utf8"); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function store(seed) {
  var d = Object.assign({}, seed || {});
  return {
    _d: d,
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
}
function CustomEvent(type, init) { this.type = type; this.detail = (init && init.detail) || {}; }

/* Minimal element for the birth-month panel. */
function fakeElement(tag) {
  var handlers = {};
  var classes = {};
  var el = {
    tagName: String(tag || "div").toUpperCase(),
    hidden: false, isConnected: true, value: "", textContent: "", id: "", className: "", innerHTML: "",
    attrs: {}, children: {},
    setAttribute: function (k, v) { this.attrs[k] = String(v); },
    getAttribute: function (k) { return this.attrs[k]; },
    addEventListener: function (t, fn) { (handlers[t] = handlers[t] || []).push(fn); },
    fire: function (t, ev) { (handlers[t] || []).forEach(function (fn) { fn(ev); }); },
    focus: function () {},
    reset: function () { this.resetCount = (this.resetCount || 0) + 1; },
    classList: {
      add: function (c) { classes[c] = true; },
      remove: function (c) { delete classes[c]; },
      toggle: function (c, on) { if (on) classes[c] = true; else delete classes[c]; },
      contains: function (c) { return !!classes[c]; },
    },
    querySelector: function (sel) {
      if (!this.children[sel]) this.children[sel] = fakeElement("div");
      return this.children[sel];
    },
  };
  return el;
}

var ADULT = {
  user: { id: "u-adult", app_metadata: {}, user_metadata: {} },
  session: { source: "supabase", supabaseUserId: "u-adult", username: "adult", activeProfileId: "p-adult" },
  row: { id: "p-adult", user_id: "u-adult", account_kind: "personal" },
  birth: { birth_year: 1996, birth_month: 1 }, /* 30 */
};
var TEEN = {
  user: { id: "u-teen", app_metadata: {}, user_metadata: {} },
  session: { source: "supabase", supabaseUserId: "u-teen", username: "teen", activeProfileId: "p-teen" },
  row: { id: "p-teen", user_id: "u-teen", account_kind: "personal" },
  birth: { birth_year: 2011, birth_month: 1 }, /* 15 */
};
function ageOf(acct) { return new Date().getFullYear() - acct.birth.birth_year; }

/* One page: every module loaded once, accounts switched in place. */
function page() {
  var listeners = {};
  var body = fakeElement("body");
  var doc = {
    readyState: "complete",
    body: body,
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: function (t, fn) { listeners[t] = (listeners[t] || []).filter(function (f) { return f !== fn; }); },
    dispatchEvent: function (ev) { (listeners[ev.type] || []).slice().forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    getElementById: function () { return null; },
    createElement: function (tag) { return fakeElement(tag); },
  };
  body.appendChild = function (el) { h.panels.push(el); };
  var ls = store();
  var ss = store();
  var acct = null; /* signed-in account, null when signed out */
  var h = {
    doc: doc, ls: ls, ss: ss, panels: [], puts: [], events: [],
    /* per user id: ms delay before user_birth answers */
    birthDelay: {},
    rpcImpl: null,
  };
  doc.addEventListener("cognation:birth-saved", function (ev) { h.events.push(["birth-saved", ev.detail]); });
  var win = {
    document: doc, localStorage: ls, sessionStorage: ss, location: { search: "", pathname: "/commune.html" },
    addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () {},
    CognationDatingFlag: { enabled: function () { return true; } }, /* forced on for this test */
    CognationAuth: { getSession: function () { return acct ? clone(acct.session) : null; } },
    CognationSeedOpsLog: { write: function () {} },
    CognationAccounts: { _p: {}, saveProfileRecord: function (r) { this._p[r.id] = r; return true; }, getProfileById: function (id) { return this._p[id] || null; } },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return acct ? { access_token: "t-" + acct.user.id, user: { id: acct.user.id } } : null; },
      getUser: function () { return Promise.resolve(acct ? clone(acct.user) : null); },
      updateUser: function (data) {
        h.puts.push({ user: acct && acct.user.id, data: clone(data) });
        return Promise.resolve(acct ? clone(acct.user) : null);
      },
      rpc: function (name, args) {
        if (name === "set_my_birth_month" && h.rpcImpl) return h.rpcImpl(args);
        return Promise.resolve(false);
      },
      rest: function (table, o) {
        var q = (o && o.query) || "";
        var m = /user_id=eq\.([^&]+)/.exec(q);
        var id = m ? decodeURIComponent(m[1]) : "";
        var who = [ADULT, TEEN, h.extra].filter(function (a) { return a && a.user.id === id; })[0];
        if (table === "user_birth") {
          var rows = who && who.birth ? [clone(who.birth)] : [];
          return wait(h.birthDelay[id] || 0).then(function () { return rows; });
        }
        if (table === "profiles" && who) return Promise.resolve([clone(who.row)]);
        return Promise.resolve([]);
      },
    },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, localStorage: ls, sessionStorage: ss, console: console,
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval,
    CustomEvent: CustomEvent, encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    Promise: Promise, JSON: JSON, Date: Date, Math: Math, String: String, parseInt: parseInt, isNaN: isNaN,
  });
  ["js/age-floor-keywords.js", "js/seedops-u13-test-viewer.js", "js/commune-swipe.js",
    "js/seedops-dating-hydrate.js", "js/birth-prompt.js"]
    .forEach(function (rel) { vm.runInContext(read(rel), ctx, { filename: rel }); });

  h.win = win;
  h.swipe = win.CognationCommuneSwipe;
  h.floor = win.CognationAgeFloor;
  h.emit = function (type, detail) { doc.dispatchEvent(new CustomEvent(type, { detail: detail || {} })); };
  /* login.js closeGate / openGate order */
  h.signIn = function (a) { acct = a; h.emit("cognation:session-started"); };
  h.signOut = function () { acct = null; h.emit("cognation:session-ended"); };
  h.gates = function () {
    return {
      classroom: h.swipe.classroomAllowed(),
      dating: h.swipe.datingAllowed(),
      birthAge: h.swipe.getDatingBirthAge(),
      viewerAge: h.floor.viewerAge(),
    };
  };
  /* Samples every gate until stop() so a short leak is caught. */
  h.sampler = function () {
    var seen = [];
    var t = setInterval(function () { seen.push(h.gates()); }, 5);
    return { seen: seen, stop: function () { clearInterval(t); seen.push(h.gates()); return seen; } };
  };
  return h;
}

test("adult signs out, teen signs in (no reload): classroom and dating closed until the teen's age is read", async function () {
  var h = page();
  await wait(250); /* boot hydrate (signed out) settles */
  h.signIn(ADULT);
  await wait(150);
  h.swipe.setSeeDating(true);
  var a = h.gates();
  assert.strictEqual(a.birthAge, ageOf(ADULT), "adult age read from user_birth");
  assert.strictEqual(a.classroom, true, "adult: classroom open");
  assert.strictEqual(a.dating, true, "adult with See dating on: dating open");

  h.signOut();
  assert.strictEqual(h.swipe.getDatingBirthAge(), null, "sign-out forgets the adult's birth age");
  assert.strictEqual(h.swipe.getSeeDating(), false, "sign-out turns See dating off");
  assert.notStrictEqual(h.ls.getItem("cognation.commune.seeDating.v1"), "1", "saved See dating cleared");
  assert.strictEqual(h.ss.getItem("cognation.seedops.datingHydrate.v2"), null, "hydrate cache cleared");
  assert.strictEqual(h.swipe.getMemberAge(), 0, "signed out: every gate sees age 0 (#309), no access age invented");

  h.birthDelay[TEEN.user.id] = 120; /* teen's user_birth answers late */
  h.signIn(TEEN);
  var s = h.sampler();
  await wait(60);
  var mid = h.gates();
  assert.strictEqual(h.swipe.birthAgePending(), true, "teen's age not read yet");
  assert.strictEqual(mid.classroom, false, "classroom refused before the teen's age is read");
  assert.strictEqual(mid.dating, false, "dating refused before the teen's age is read");
  assert.strictEqual(h.swipe.liveBirthMissing(), false, "not read yet is not 'missing' (no Add birth month offer)");
  await wait(200);
  var seen = s.stop();
  seen.forEach(function (g, i) {
    assert.strictEqual(g.classroom, false, "sample " + i + ": classroom never open for the teen");
    assert.strictEqual(g.dating, false, "sample " + i + ": dating never open for the teen");
    assert.notStrictEqual(g.birthAge, ageOf(ADULT), "sample " + i + ": adult age never read");
    assert.notStrictEqual(g.viewerAge, ageOf(ADULT), "sample " + i + ": viewerAge never the adult's");
  });
  var t = h.gates();
  assert.strictEqual(h.swipe.birthAgePending(), false, "age known");
  assert.strictEqual(t.birthAge, ageOf(TEEN), "teen's own age");
  assert.strictEqual(t.viewerAge, ageOf(TEEN), "viewerAge is the teen's");
  assert.strictEqual(t.classroom, false, "teen: classroom refused by age");
  assert.strictEqual(t.dating, false, "teen: dating refused by age");
  assert.strictEqual(h.puts.length, 0, "no PUT /auth/v1/user from the switch");
});

test("second adult after the switch: gates open again once that adult's age is read", async function () {
  var h = page();
  await wait(250);
  h.signIn(TEEN);
  await wait(150);
  assert.strictEqual(h.gates().classroom, false);
  h.signOut();
  h.extra = {
    user: { id: "u-adult2", app_metadata: {}, user_metadata: {} },
    session: { source: "supabase", supabaseUserId: "u-adult2", username: "adult2", activeProfileId: "p-adult2" },
    row: { id: "p-adult2", user_id: "u-adult2", account_kind: "personal" },
    birth: { birth_year: 1990, birth_month: 1 },
  };
  h.birthDelay["u-adult2"] = 80;
  h.signIn(h.extra);
  await wait(30);
  assert.strictEqual(h.gates().classroom, false, "closed while pending");
  await wait(150);
  assert.strictEqual(h.gates().classroom, true, "open once the adult's age is read");
  assert.strictEqual(h.gates().birthAge, new Date().getFullYear() - 1990);
});

test("a stale hydrate from the adult's session that resolves after the switch is ignored", async function () {
  var h = page();
  await wait(250);
  h.birthDelay[ADULT.user.id] = 250; /* adult's user_birth answers after the switch */
  h.signIn(ADULT);
  await wait(30);
  h.signOut();
  h.birthDelay[TEEN.user.id] = 20;
  h.signIn(TEEN);
  await wait(100);
  assert.strictEqual(h.gates().birthAge, ageOf(TEEN), "teen hydrate done");
  var s = h.sampler();
  await wait(300); /* the adult's late answer lands in here */
  var seen = s.stop();
  seen.forEach(function (g, i) {
    assert.strictEqual(g.birthAge, ageOf(TEEN), "sample " + i + ": stale adult age ignored");
    assert.strictEqual(g.classroom, false, "sample " + i + ": classroom stays closed for the teen");
  });
  var cached = JSON.parse(h.ss.getItem("cognation.seedops.datingHydrate.v2") || "null");
  assert.ok(cached && cached.birthAge === ageOf(TEEN), "hydrate cache holds the teen's age, not the adult's");
});

test("a See dating write asked for by the adult is not sent after the switch", async function () {
  var h = page();
  await wait(250);
  h.signIn(ADULT);
  await wait(150);
  h.swipe.setSeeDating(true, { byUser: true }); /* write scheduled (600ms) */
  await wait(50);
  h.signOut();
  h.signIn(TEEN);
  await wait(900);
  assert.deepStrictEqual(h.puts, [], "no PUT /auth/v1/user for the next account");
});

test("birth-month ask closes on sign-out and an in-flight save does nothing for the next account", async function () {
  var h = page();
  await wait(250);
  var noRow = {
    user: { id: "u-new", app_metadata: {}, user_metadata: {} },
    session: { source: "supabase", supabaseUserId: "u-new", username: "newbie", activeProfileId: "p-new" },
    row: { id: "p-new", user_id: "u-new", account_kind: "personal" },
    birth: null,
  };
  h.extra = noRow;
  h.signIn(noRow);
  await wait(550); /* maybePrompt runs 400ms after session-started */
  assert.strictEqual(h.panels.length, 1, "ask opened for an account with no birth row");
  var panel = h.panels[0];
  assert.strictEqual(panel.hidden, false, "panel open");

  /* Save started, server slow to answer. */
  var answer;
  h.rpcImpl = function () { return new Promise(function (r) { answer = r; }); };
  var form = panel.querySelector("[data-birth-prompt-form]");
  panel.querySelector("#birth-prompt-year").value = "2000";
  panel.querySelector("#birth-prompt-month").value = "3";
  form.fire("submit", { preventDefault: function () {} });
  assert.ok(typeof answer === "function", "save sent");

  h.signOut();
  assert.strictEqual(panel.hidden, true, "panel closed on sign-out");
  assert.strictEqual(panel.getAttribute("aria-hidden"), "true");
  assert.ok(form.resetCount >= 1, "typed year and month cleared");

  h.signIn(TEEN);
  answer(true); /* the earlier account's save lands after the switch */
  await wait(20);
  assert.deepStrictEqual(h.events, [], "no birth-saved for the next account");
  var shown = JSON.parse(h.ss.getItem("cognation.birthPrompt.shown.v1") || "{}");
  assert.ok(!shown[TEEN.user.id], "teen not marked as asked by the earlier save");
  assert.strictEqual(panel.hidden, true, "panel stays closed");
});
