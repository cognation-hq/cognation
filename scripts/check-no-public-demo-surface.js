/**
 * Public Cognation HTML and client UI must not offer a "Demo unlock" control,
 * label, or path. Live Pages keeps WELL locked. Loopback may still open the
 * chart after a local preview flag, with no public label.
 *
 * Run: node scripts/check-no-public-demo-surface.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");
var PHRASE = /demo unlock/i;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function walk(dir, acc) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    if (entry.name === "node_modules" || entry.name === ".git") return;
    var rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, acc);
    else acc.push(rel);
  });
  return acc;
}

function testShippedMarkupHasNoDemoUnlock() {
  var files = walk(root, []).filter(function (file) {
    var rel = path.relative(root, file).replace(/\\/g, "/");
    if (rel.indexOf("scripts/check-no-public-demo") === 0) return false;
    return /\.(html|js)$/.test(rel);
  });
  files.forEach(function (file) {
    var rel = path.relative(root, file).replace(/\\/g, "/");
    var text = fs.readFileSync(file, "utf8");
    assert.ok(!PHRASE.test(text), rel + " still contains a Demo unlock label");
  });

  var html = read("index.html");
  assert.ok(html.indexOf("data-well-demo-unlock") === -1, "WELL markup still has the unlock hook");
  assert.ok(html.indexOf("data-login-demo-unlock") === -1, "sign-in markup still has the unlock hook");
  assert.ok(html.indexOf("data-well-demo-chrome") === -1, "WELL markup still has demo chrome");
  assert.ok(html.indexOf("Demo EHR") === -1, "public HTML still shows the WELL demo banner");
  assert.ok(html.indexOf("local demo") === -1, "public HTML still has local-demo copy");
  assert.ok(html.indexOf('id="login-gate"') !== -1, "sign-in gate must stay");
  assert.ok(html.indexOf("data-well-app") !== -1, "WELL chart shell must stay");
  assert.ok(html.indexOf("data-well-patient-root") !== -1, "patient chart root must stay");
  assert.ok(html.indexOf("data-well-lock-btn") !== -1, "WELL lock control must stay");
}

function memoryStorage(seed) {
  var data = Object.assign({}, seed || {});
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem: function (key, value) {
      data[key] = String(value);
    },
    removeItem: function (key) {
      delete data[key];
    },
  };
}

function el(tag, attrs) {
  var node = {
    tag: tag,
    attrs: Object.assign({}, attrs || {}),
    children: [],
    hidden: false,
    className: (attrs && attrs.className) || "",
    classList: {
      add: function () {},
      remove: function () {},
      toggle: function () {},
    },
    style: {},
    listeners: {},
    setAttribute: function (name, value) {
      node.attrs[name] = String(value);
      if (name === "hidden") node.hidden = true;
      if (name === "aria-hidden") node.ariaHidden = value;
    },
    getAttribute: function (name) {
      return node.attrs[name];
    },
    removeAttribute: function (name) {
      delete node.attrs[name];
      if (name === "aria-hidden") node.ariaHidden = null;
      if (name === "inert") node.inert = false;
    },
    appendChild: function (child) {
      node.children.push(child);
      child.parentNode = node;
      return child;
    },
    removeChild: function (child) {
      node.children = node.children.filter(function (item) {
        return item !== child;
      });
      child.parentNode = null;
    },
    addEventListener: function (name, fn) {
      (node.listeners[name] = node.listeners[name] || []).push(fn);
    },
    focus: function () {},
    closest: function (sel) {
      var cur = node;
      while (cur) {
        if (sel === ".well-auth-actions" && cur.attrs.className === "well-auth-actions") return cur;
        cur = cur.parentNode || null;
      }
      return null;
    },
    querySelector: function (sel) {
      return find(node, sel);
    },
    querySelectorAll: function (sel) {
      return queryAll(node, sel);
    },
  };
  if (attrs && attrs.hidden) node.hidden = true;
  return node;
}

function matches(node, sel) {
  if (!node || !node.attrs) return false;
  if (sel.charAt(0) === "#") return node.attrs.id === sel.slice(1);
  if (sel.charAt(0) === ".") return (node.attrs.className || "").split(/\s+/).indexOf(sel.slice(1)) !== -1;
  if (sel.indexOf("[") === 0) {
    var body = sel.slice(1, -1);
    var eq = body.indexOf("=");
    if (eq === -1) return Object.prototype.hasOwnProperty.call(node.attrs, body);
    var name = body.slice(0, eq);
    var value = body.slice(eq + 1).replace(/^["']|["']$/g, "");
    return node.attrs[name] === value;
  }
  return false;
}

function find(node, sel) {
  if (matches(node, sel)) return node;
  var kids = node.children || [];
  for (var i = 0; i < kids.length; i++) {
    var hit = find(kids[i], sel);
    if (hit) return hit;
  }
  return null;
}

function queryAll(node, sel) {
  var found = [];
  String(sel || "").split(",").forEach(function (part) {
    collect(node, part.trim(), found);
  });
  return found;
}

function collect(node, sel, found) {
  if (matches(node, sel) && found.indexOf(node) === -1) found.push(node);
  (node.children || []).forEach(function (child) {
    collect(child, sel, found);
  });
}

function bootWell(options) {
  var flagStore = memoryStorage(options.sessionSeed);
  var app = el("div", { "data-well-app": "", className: "well-app is-locked" });
  var lock = el("div", { "data-well-auth-lock": "" });
  var status = el("p", { "data-well-auth-status": "credentials", hidden: true });
  var actions = el("div", { className: "well-auth-actions" });
  var button = el("button", { "data-well-demo-unlock": "", className: "btn" });
  button.textContent = "Demo" + " unlock";
  actions.appendChild(button);
  var chrome = el("p", { "data-well-demo-chrome": "", hidden: true });
  chrome.textContent = "Demo EHR — not HIPAA";
  lock.appendChild(status);
  lock.appendChild(actions);
  lock.appendChild(chrome);
  var secured = el("div", { "data-well-secured": "" });
  secured.setAttribute("aria-hidden", "true");
  var patient = el("div", { "data-well-patient-root": "" });
  secured.appendChild(patient);
  var sessionBar = el("div", { "data-well-session-bar": "", hidden: true });
  var side = el("div", { "data-well-side-toggle": "" });
  app.appendChild(sessionBar);
  app.appendChild(side);
  app.appendChild(lock);
  app.appendChild(secured);

  var document = {
    readyState: "complete",
    documentElement: { setAttribute: function () {}, removeAttribute: function () {} },
    body: {
      classList: { add: function () {}, remove: function () {} },
      appendChild: function (node) {
        document.body.children = document.body.children || [];
        document.body.children.push(node);
      },
      children: [],
    },
    addEventListener: function () {},
    dispatchEvent: function () {},
    getElementById: function () {
      return null;
    },
    querySelector: function (sel) {
      return find(app, sel);
    },
    querySelectorAll: function (sel) {
      return queryAll(app, sel);
    },
    createElement: function (tag) {
      return el(tag);
    },
  };
  var location = {
    hostname: options.hostname,
    protocol: options.protocol || "https:",
    search: options.search || "",
  };
  var windowStub = {
    document: document,
    location: location,
    CognationConfig: options.config || {},
    __COGNATION_DEMO__: options.windowDemo === true,
    CustomEvent: function (type, init) {
      this.type = type;
      this.detail = init && init.detail;
    },
    crypto: { getRandomValues: function (buf) { buf[0] = 1; return buf; } },
  };
  windowStub.window = windowStub;
  var context = vm.createContext({
    window: windowStub,
    document: document,
    localStorage: memoryStorage(),
    sessionStorage: flagStore,
    location: location,
    URLSearchParams: URLSearchParams,
    CustomEvent: windowStub.CustomEvent,
    Uint32Array: Uint32Array,
    Promise: Promise,
    console: console,
    setTimeout: function (fn) {
      if (typeof fn === "function") fn();
      return 0;
    },
    clearTimeout: function () {},
    Date: Date,
    JSON: JSON,
  });
  vm.runInContext(read("js/demo-mode.js"), context, { filename: "js/demo-mode.js" });
  vm.runInContext(read("js/well-auth.js"), context, { filename: "js/well-auth.js" });
  return { app: app, auth: windowStub.CognationWellAuth, demo: windowStub.CognationDemo, status: status };
}

function visibleText(node, parts) {
  parts = parts || [];
  if (!node || node.hidden) return parts;
  if (node.textContent) parts.push(node.textContent);
  (node.children || []).forEach(function (child) {
    visibleText(child, parts);
  });
  return parts;
}

function testLivePagesCannotOpenWell() {
  var live = bootWell({
    hostname: "cognation-3md.pages.dev",
    search: "?demo=1",
    sessionSeed: { "cognation.demo.unlock.v1": "1", "cognation.well.auth.v1": JSON.stringify({ ok: true, at: Date.now(), user: "demo" }) },
    config: { localDemo: true },
    windowDemo: true,
  });
  assert.strictEqual(live.demo.localGateOpen(), false);
  assert.strictEqual(live.demo.isUnlocked(), false);
  assert.strictEqual(live.app.getAttribute("data-well-auth-state"), "locked");
  assert.strictEqual(live.app.querySelector("[data-well-demo-unlock]"), null);
  assert.strictEqual(live.app.querySelector("[data-well-demo-chrome]"), null);
  assert.ok(!PHRASE.test(visibleText(live.app).join(" ")), "live WELL still shows a Demo unlock label");
  assert.strictEqual(live.auth.isAuthenticated(), false);
  assert.strictEqual(live.auth.unlockSession("local"), false);
  assert.strictEqual(live.app.getAttribute("data-well-auth-state"), "locked");
  var secured = live.app.querySelector("[data-well-secured]");
  assert.strictEqual(secured.getAttribute("aria-hidden"), "true");
}

function testLocalPreviewStillOpensChart() {
  var local = bootWell({
    hostname: "127.0.0.1",
    protocol: "http:",
    search: "?demo=1",
  });
  assert.strictEqual(local.demo.localGateOpen(), true);
  assert.strictEqual(local.demo.isUnlocked(), true);
  assert.strictEqual(local.app.getAttribute("data-well-auth-state"), "unlocked");
  assert.strictEqual(local.app.querySelector("[data-well-demo-unlock]"), null);
  assert.ok(!PHRASE.test(visibleText(local.app).join(" ")));
  var secured = local.app.querySelector("[data-well-secured]");
  assert.ok(!secured.getAttribute("aria-hidden"), "local preview should reveal the chart shell");
  assert.ok(local.auth.isAuthenticated(), "local preview keeps a chart session");
}

function main() {
  testShippedMarkupHasNoDemoUnlock();
  testLivePagesCannotOpenWell();
  testLocalPreviewStillOpensChart();
  console.log("public demo surface check passed");
}

main();
