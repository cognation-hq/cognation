/**
 * SeedOps ops panel (ops/seed sessions only; real users never see it):
 *  - the status box is cleared on sign-out and on a switch to a different user
 *    (login.js session-started / session-ended, and cognation:auth-changed);
 *    the same user re-firing auth-changed keeps it; a run that finishes after a
 *    sign-out does not write into it.
 *  - at 390 the panel does not cover the Times Report button.
 * Run: node --test js/seedops-ops-panel-status-layout.test.js
 */
"use strict";

var test = require("node:test");
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function tick() { return new Promise(function (r) { setImmediate(r); }); }
async function settle() { for (var i = 0; i < 8; i++) await tick(); }

function El(tag, attrs) {
  this.tagName = tag;
  this.attrs = attrs || {};
  this.listeners = {};
  this.children = {};
  this.style = {};
  this.textContent = "";
  this.value = "";
  this.disabled = false;
}
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; };
El.prototype.addEventListener = function (t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); };
El.prototype.dispatch = function (t) { (this.listeners[t] || []).slice().forEach(function (fn) { fn({ type: t }); }); };
El.prototype.querySelector = function (sel) {
  var m = /^\[([a-z-]+)\]$/.exec(sel);
  return (m && this.children[m[1]]) || null;
};
El.prototype.remove = function () { if (this.onremove) this.onremove(); };
function panelEl() {
  var el = new El("aside");
  Object.defineProperty(el, "innerHTML", {
    set: function (html) {
      var re = /<(button|input|pre|select)\b([^>]*)>/g, m;
      while ((m = re.exec(html))) {
        var key = /(data-seedops-ops-[a-z]+)/.exec(m[2]);
        if (key) el.children[key[1]] = new El(m[1]);
      }
    },
  });
  return el;
}

var SEED_OPERATOR = {
  id: "u-seed-1",
  app_metadata: { seedops: true, account_kind: "seed", seed_fleet_id: "seed-0001" },
  user_metadata: {},
};

function world() {
  var docListeners = {};
  var attached = null;
  var pending = [];
  var session = { username: "fleet_0a1b2c3d4e5f" };
  var doc = {
    readyState: "complete",
    body: { appendChild: function (el) { attached = el; el.onremove = function () { attached = null; }; } },
    addEventListener: function (t, fn) { (docListeners[t] = docListeners[t] || []).push(fn); },
    dispatchEvent: function () { return true; },
    createElement: function () { return panelEl(); },
    querySelector: function (sel) { return sel === "[data-seedops-ops-panel]" ? attached : null; },
    querySelectorAll: function () { return []; },
  };
  var win = {
    document: doc,
    location: { hash: "#seedops-ops", search: "", pathname: "/", href: "https://cognation.test/#seedops-ops" },
    history: { replaceState: function () {} },
    addEventListener: function () {},
    CustomEvent: function (t, i) { this.type = t; this.detail = (i && i.detail) || {}; },
    CognationAuth: { getSession: function () { return session; } },
    CognationSeedOpsLog: { write: function () {} },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return { access_token: "t" }; },
      getUser: function () { return Promise.resolve(JSON.parse(JSON.stringify(SEED_OPERATOR))); },
    },
    CognationSeedOpsPathways: {
      run: function (p) {
        return new Promise(function (resolve) { pending.push(function () { resolve({ ok: true, pathway: p, steps: [] }); }); });
      },
      runAll: function () { return []; },
    },
    CognationSeedOpsTowerPosts: { postOne: function () { return { ok: true, path: "local" }; } },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, location: win.location, history: win.history, console: console,
    CustomEvent: win.CustomEvent, Promise: Promise, setTimeout: function () { return 0; }, clearTimeout: function () {},
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    sessionStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
  });
  ["js/seedops-schema.js", "js/seedops-ops-trigger.js"].forEach(function (rel) {
    vm.runInContext(src(rel), ctx, { filename: rel });
  });
  return {
    win: win,
    pending: pending,
    panel: function () { return attached; },
    setSession: function (s) { session = s; },
    fire: function (name) { (docListeners[name] || []).slice().forEach(function (fn) { fn({ type: name }); }); },
  };
}

async function openWithStatus() {
  var w = world();
  var trig = w.win.CognationSeedOpsTrigger;
  await trig.awaitAuthUser();
  var r = trig.syncPanel();
  assert.ok(r.ok && w.panel(), "panel opened: " + JSON.stringify(r));
  var status = w.panel().querySelector("[data-seedops-ops-status]");
  assert.ok(status, "status box present");
  status.textContent = '{ "ok": true, "pathway": "tower" }';
  return { w: w, trig: trig, status: status };
}

test("ops status: cleared on sign-out (session-ended)", async function () {
  var p = await openWithStatus();
  p.w.setSession(null);
  p.w.fire("cognation:session-ended");
  await settle();
  assert.strictEqual(p.status.textContent, "", "status emptied on sign-out");
});

["cognation:session-started", "cognation:auth-changed"].forEach(function (evt) {
  test("ops status: cleared on a switch to a different user (" + evt + ")", async function () {
    var p = await openWithStatus();
    p.w.setSession({ username: "fleet_ffeeddccbbaa" });
    p.w.fire(evt);
    await settle();
    assert.strictEqual(p.status.textContent, "", "status emptied on user switch");
  });
});

test("ops status: kept when auth-changed re-fires for the same user", async function () {
  var p = await openWithStatus();
  p.w.fire("cognation:auth-changed");
  await settle();
  assert.strictEqual(p.status.textContent, '{ "ok": true, "pathway": "tower" }');
});

test("ops status: a run that finishes after sign-out does not write into it", async function () {
  var w = world();
  var trig = w.win.CognationSeedOpsTrigger;
  await trig.awaitAuthUser();
  trig.syncPanel();
  var panel = w.panel();
  var status = panel.querySelector("[data-seedops-ops-status]");
  var select = panel.querySelector("[data-seedops-ops-pathway]");
  select.value = "circle";
  select.dispatch("change");
  var run = panel.querySelector("[data-seedops-ops-run]");
  run.disabled = false;
  run.dispatch("click");
  await settle();
  assert.strictEqual(w.pending.length, 1, "run started");
  w.setSession(null);
  w.fire("cognation:session-ended");
  w.pending[0]();
  await settle();
  assert.strictEqual(status.textContent, "", "late result not written after sign-out");
});

/* 390 layout. The Times Report button (.news-report-btn, inline at the left of each
   story footer in #panel-signal) spans x 49..121 at a 390 viewport, measured
   headless on main 0a3f4cc. The panel is fixed to the bottom right; if its x-range
   is clear of the button column, no scroll position can make them overlap. */
var REPORT_BTN_390 = { left: 49, right: 121 };
function panelCss() {
  var s = src("js/seedops-ops-trigger.js");
  var m = /panel\.style\.cssText =[\s\S]*?"(position:fixed;[^"]*)"/.exec(s);
  assert.ok(m, "panel cssText found");
  var d = {};
  m[1].split(";").forEach(function (p) { var k = p.indexOf(":"); if (k > 0) d[p.slice(0, k).trim()] = p.slice(k + 1).trim(); });
  return d;
}
function px(v, vw) {
  var t = v.trim(), m;
  if ((m = /^([\d.]+)px$/.exec(t))) return Number(m[1]);
  if ((m = /^calc\(100vw - ([\d.]+)px\)$/.exec(t))) return vw - Number(m[1]);
  if ((m = /^min\((.*)\)$/.exec(t))) return Math.min.apply(null, m[1].split(/,(?![^(]*\))/).map(function (x) { return px(x, vw); }));
  throw new Error("unsupported " + v);
}
function panelX(vw) {
  var d = panelCss();
  var right = vw - px(d.right, vw);
  var width = Math.min(px(d["max-width"], vw), right); /* content fills max-width (measured 320 on main) */
  return { left: right - width, right: right, width: width };
}

test("ops panel at 390 does not cover the Times Report button", function () {
  var p = panelX(390);
  var overlapX = Math.min(p.right, REPORT_BTN_390.right) - Math.max(p.left, REPORT_BTN_390.left);
  assert.ok(overlapX <= 0, "panel x " + p.left + ".." + p.right + " overlaps Report x " + REPORT_BTN_390.left + ".." + REPORT_BTN_390.right);
  assert.strictEqual(p.right, 378, "still pinned 12px from the right");
});

test("ops panel stays 320px wide from 464 up (desktop and tablet unchanged)", function () {
  [464, 768, 1280].forEach(function (vw) { assert.strictEqual(panelX(vw).width, 320, "width at " + vw); });
  var d = panelCss();
  assert.strictEqual(d.bottom, "12px");
  assert.strictEqual(d.position, "fixed");
});
