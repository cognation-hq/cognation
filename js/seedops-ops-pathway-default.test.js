/**
 * SeedOps ops panel: the pathway dropdown has no default. A disabled
 * "Pick a pathway" placeholder is selected, Run stays disabled until a real
 * pathway is picked, and an empty pathway never runs (click or runAfterAuth).
 * Ops-only panel; real users never see it.
 * Run: node --test js/seedops-ops-pathway-default.test.js
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
async function settle() { for (var i = 0; i < 6; i++) await tick(); }

/* Minimal element stub. The panel's innerHTML is parsed only for the
   data-seedops-ops-* controls. A select follows browser selectedness: the
   option marked selected, else the first option that is not disabled. */
function El(tag, attrs) {
  this.tagName = tag;
  this.attrs = attrs || {};
  this.listeners = {};
  this.children = {};
  this.style = {};
  this.textContent = "";
  this.placeholder = "";
  this.disabled = Object.prototype.hasOwnProperty.call(this.attrs, "disabled");
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
El.prototype.click = function () { if (!this.disabled) this.dispatch("click"); };

function parseAttrs(text) {
  var out = {};
  var re = /([a-zA-Z-]+)(?:="([^"]*)")?/g, m;
  while ((m = re.exec(text))) out[m[1]] = m[2] == null ? "" : m[2];
  return out;
}

function makeSelect(attrs, body) {
  var el = new El("select", attrs);
  var options = [];
  var re = /<option([^>]*)>([^<]*)<\/option>/g, m;
  while ((m = re.exec(body))) {
    var a = parseAttrs(m[1]);
    options.push({ value: a.value, label: m[2], disabled: "disabled" in a, selected: "selected" in a });
  }
  var idx = options.findIndex(function (o) { return o.selected; });
  if (idx < 0) idx = options.findIndex(function (o) { return !o.disabled; });
  el.options = options;
  Object.defineProperty(el, "value", {
    get: function () { return idx >= 0 ? options[idx].value : ""; },
    set: function (v) { idx = options.findIndex(function (o) { return o.value === String(v); }); },
  });
  el.selectedOption = function () { return idx >= 0 ? options[idx] : null; };
  return el;
}

function panelEl() {
  var el = new El("aside");
  Object.defineProperty(el, "innerHTML", {
    set: function (html) {
      var sel = /<select (data-seedops-ops-pathway)([^>]*)>([\s\S]*?)<\/select>/.exec(html);
      if (sel) el.children[sel[1]] = makeSelect(parseAttrs(sel[1] + sel[2]), sel[3]);
      var re = /<(button|input|pre)\b([^>]*)>/g, m;
      while ((m = re.exec(html))) {
        var key = /(data-seedops-ops-[a-z]+)/.exec(m[2]);
        if (key) el.children[key[1]] = new El(m[1], parseAttrs(m[2]));
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
  var runs = [];
  var towerPosts = [];
  var attached = null;
  var doc = {
    readyState: "complete",
    body: { appendChild: function (el) { attached = el; } },
    addEventListener: function () {},
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
    CognationAuth: { getSession: function () { return { username: "fleet_0a1b2c3d4e5f" }; } },
    CognationSeedOpsLog: { rows: [], write: function (ch, p) { this.rows.push({ channel: ch, payload: p }); } },
    CognationSupabase: {
      configured: function () { return true; },
      getSession: function () { return { access_token: "t" }; },
      getUser: function () { return Promise.resolve(JSON.parse(JSON.stringify(SEED_OPERATOR))); },
    },
    CognationSeedOpsPathways: {
      run: function (p) { runs.push(p); return { ok: true, pathway: p, steps: [] }; },
      runAll: function () { runs.push("__all__"); return []; },
    },
    CognationSeedOpsTowerPosts: {
      postOne: function (ref) { towerPosts.push(ref && (ref.seedFleetId || ref)); return { ok: true, path: "local" }; },
    },
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
  return { win: win, runs: runs, towerPosts: towerPosts, panel: function () { return attached; } };
}

async function openPanel() {
  var w = world();
  var trig = w.win.CognationSeedOpsTrigger;
  await trig.awaitAuthUser();
  assert.strictEqual(trig.isArmed(), true, "seed operator armed");
  var r = trig.syncPanel();
  assert.ok(r.ok && w.panel(), "panel opened: " + JSON.stringify(r));
  var panel = w.panel();
  return {
    w: w,
    trig: trig,
    select: panel.querySelector("[data-seedops-ops-pathway]"),
    run: panel.querySelector("[data-seedops-ops-run]"),
    status: panel.querySelector("[data-seedops-ops-status]"),
  };
}

test("ops panel: no default pathway; the Pick a pathway placeholder is selected and Run is disabled", async function () {
  var p = await openPanel();
  var first = p.select.options[0];
  assert.strictEqual(first.value, "", "placeholder first");
  assert.strictEqual(first.label, "Pick a pathway");
  assert.ok(first.disabled, "placeholder is disabled");
  assert.strictEqual(p.select.value, "", "no pathway preselected (was tower)");
  assert.strictEqual(p.run.disabled, true, "Run disabled with no pathway");
});

test("ops panel: an empty pathway runs nothing (click and runAfterAuth backstop)", async function () {
  var p = await openPanel();
  p.run.click();
  p.run.disabled = false; /* even if Run were force-enabled, the click handler refuses */
  p.run.dispatch("click");
  await settle();
  var r = await p.trig.runAfterAuth("", undefined);
  var r2 = await p.trig.runAfterAuth("   ", undefined);
  await settle();
  assert.deepStrictEqual(p.w.runs, [], "no pathway run");
  assert.deepStrictEqual(p.w.towerPosts, [], "no tower post");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "no_pathway", JSON.stringify(r));
  assert.strictEqual(r2.error, "no_pathway", JSON.stringify(r2));
});

["circle", "tower"].forEach(function (pathway) {
  test("ops panel: picking " + pathway + " enables Run and runs " + pathway, async function () {
    var p = await openPanel();
    assert.strictEqual(p.run.disabled, true, "disabled before a pick");
    p.select.value = pathway;
    p.select.dispatch("change");
    assert.strictEqual(p.run.disabled, false, "Run enabled after picking " + pathway);
    p.run.click();
    await settle();
    assert.deepStrictEqual(p.w.runs, [pathway], "ran exactly " + pathway);
    if (pathway === "tower") assert.strictEqual(p.w.towerPosts.length, 1, "tower path posts one seed post");
    else assert.strictEqual(p.w.towerPosts.length, 0, "circle makes no tower post");
    assert.ok(/"ok": true/.test(p.status.textContent), p.status.textContent);
  });
});
