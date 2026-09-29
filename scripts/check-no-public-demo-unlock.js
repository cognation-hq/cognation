/**
 * Public Cognation sign-in must not offer Demo unlock.
 * Live Pages must ignore ?demo=1 and stored demo sessions.
 * Loopback / COGNATION_LOCAL_DEMO may still open local demo.
 *
 * Run: node scripts/check-no-public-demo-unlock.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function loginGateHtml(html) {
  var start = html.indexOf('id="login-gate"');
  var end = html.indexOf("<header", start);
  assert.ok(start !== -1 && end > start, "login gate markup not found");
  return html.slice(start, end);
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

function loadRuntimeConfig() {
  var src = read("functions/runtime-config.js").replace(
    "export async function onRequest",
    "async function onRequest"
  );
  return new Function(src + "\nreturn onRequest;")();
}

function testPublicSignInMarkup() {
  var gate = loginGateHtml(read("index.html"));
  assert.ok(gate.indexOf("data-login-demo-unlock") === -1, "sign-in markup still has the demo unlock hook");
  assert.ok(gate.indexOf("login-demo-unlock") === -1, "sign-in markup still has the demo unlock block");
  assert.ok(!/>\s*Demo unlock\s*</.test(gate), "sign-in markup still shows Demo unlock");
  assert.ok(!/href\s*=\s*["'][^"']*demo/i.test(gate), "sign-in markup still links a demo path");
  assert.ok(gate.indexOf("EXPECTED_PASS") === -1 && gate.indexOf("DEMO_OTP") === -1);
  assert.ok(gate.indexOf('data-login-submit') !== -1, "Sign in button must stay");
  assert.ok(gate.indexOf("data-login-mode-toggle") !== -1, "Sign up toggle must stay");
}

function testNoShippedDemoPassword() {
  var login = read("js/login.js");
  var demo = read("js/demo-mode.js");
  assert.ok(login.indexOf("EXPECTED_PASS") === -1);
  assert.ok(login.indexOf("DEMO_OTP") === -1);
  assert.ok(demo.indexOf("EXPECTED_PASS") === -1);
  assert.ok(demo.indexOf("DEMO_OTP") === -1);
  assert.ok(!/password\s*===?\s*["'][^"']+["']/.test(login), "login.js must not compare a shared password");
}

async function testRuntimeConfigOmitsDemoByDefault() {
  var onRequest = loadRuntimeConfig();
  var body = await (await onRequest({ env: {} })).text();
  assert.ok(body.indexOf("localDemo") === -1, "default runtime config must not enable local demo");
  assert.ok(body.indexOf("demo") === -1, "default runtime config must not mention demo");

  var opted = await (
    await onRequest({
      env: { COGNATION_LOCAL_DEMO: "1", SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" },
    })
  ).text();
  assert.ok(opted.indexOf('"localDemo":true') !== -1, "explicit env may expose localDemo");
}

function el(tag, attrs) {
  var node = {
    tag: tag,
    attrs: {},
    children: [],
    hidden: false,
    classList: {
      add: function () {},
      remove: function () {},
      toggle: function () {},
    },
    listeners: {},
    setAttribute: function (name, value) {
      node.attrs[name] = value;
      if (name === "hidden") node.hidden = true;
    },
    getAttribute: function (name) {
      return node.attrs[name];
    },
    appendChild: function (child) {
      node.children.push(child);
      child.parentNode = node;
      return child;
    },
    insertBefore: function (child, before) {
      var idx = node.children.indexOf(before);
      if (idx === -1) node.children.push(child);
      else node.children.splice(idx, 0, child);
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
    querySelector: function (sel) {
      return find(node, sel);
    },
    querySelectorAll: function () {
      return [];
    },
    focus: function () {},
    closest: function (sel) {
      var cur = node;
      while (cur) {
        if (matches(cur, sel)) return cur;
        cur = cur.parentNode;
      }
      return null;
    },
  };
  Object.keys(attrs || {}).forEach(function (key) {
    node.attrs[key] = attrs[key];
  });
  return node;
}

function matches(node, sel) {
  if (!node) return false;
  if (sel.charAt(0) === "#") return node.attrs.id === sel.slice(1);
  if (sel.charAt(0) === ".") return node.attrs.className === sel.slice(1) || (node.attrs.className || "").split(/\s+/).indexOf(sel.slice(1)) !== -1;
  if (sel.indexOf("[") === 0) {
    var attr = sel.slice(1, -1);
    return Object.prototype.hasOwnProperty.call(node.attrs, attr);
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

function bootLogin(options) {
  var sessionStore = memoryStorage(options.localSeed);
  var flagStore = memoryStorage(options.sessionSeed);
  var listeners = {};
  var gate = el("div", { id: "login-gate" });
  gate.hidden = false;
  var form = el("form", { id: "login-form" });
  var user = el("input", { name: "username" });
  var hint = el("p", { className: "login-demo-storage-hint" });
  var status = el("p", { id: "login-status" });
  status.hidden = true;
  form.appendChild(user);
  if (options.plantUnlockControl) {
    var planted = el("div", { className: "login-demo-unlock" });
    var plantedBtn = el("button", { "data-login-demo-unlock": "" });
    plantedBtn.textContent = "Demo unlock";
    planted.appendChild(plantedBtn);
    form.appendChild(planted);
  }
  form.appendChild(hint);
  form.appendChild(status);
  gate.appendChild(form);
  var document = {
    readyState: "complete",
    documentElement: { setAttribute: function () {}, removeAttribute: function () {} },
    body: {
      classList: { add: function () {}, remove: function () {} },
      appendChild: function () {},
    },
    activeElement: null,
    addEventListener: function (name, fn) {
      (listeners[name] = listeners[name] || []).push(fn);
    },
    dispatchEvent: function (ev) {
      (listeners[ev.type] || []).forEach(function (fn) {
        fn(ev);
      });
    },
    getElementById: function (id) {
      if (id === "login-gate") return gate;
      if (id === "login-form") return form;
      if (id === "login-status") return status;
      return find(gate, "#" + id);
    },
    querySelector: function () {
      return null;
    },
    querySelectorAll: function () {
      return [];
    },
    createElement: function (tag) {
      return el(tag);
    },
  };
  var location = {
    hostname: options.hostname,
    protocol: options.protocol || "https:",
    search: options.search || "",
    href: "https://" + options.hostname + "/" + (options.search || ""),
  };
  var windowStub = {
    document: document,
    location: location,
    CognationConfig: options.config || {},
    __COGNATION_DEMO__: options.windowDemo === true,
    CustomEvent: function (type) {
      this.type = type;
    },
  };
  windowStub.window = windowStub;
  var context = vm.createContext({
    window: windowStub,
    document: document,
    localStorage: sessionStore,
    sessionStorage: flagStore,
    location: location,
    URLSearchParams: URLSearchParams,
    CustomEvent: windowStub.CustomEvent,
    Promise: Promise,
    console: console,
    setTimeout: function (fn) {
      if (typeof fn === "function") fn();
      return 0;
    },
    clearTimeout: function () {},
  });
  vm.runInContext(read("js/demo-mode.js"), context, { filename: "js/demo-mode.js" });
  vm.runInContext(read("js/login.js"), context, { filename: "js/login.js" });
  return {
    gate: gate,
    form: form,
    demo: windowStub.CognationDemo,
    sessionStore: sessionStore,
    flagStore: flagStore,
  };
}

function testLivePagesCannotUnlock() {
  var preview = bootLogin({
    hostname: "abc123.cognation-3md.pages.dev",
    search: "?demo=1",
    sessionSeed: { "cognation.demo.unlock.v1": "1" },
    localSeed: {
      "cognation.session.v2": JSON.stringify({ username: "demo", source: "demo" }),
    },
    config: { localDemo: true },
    windowDemo: true,
    plantUnlockControl: true,
  });
  assert.strictEqual(preview.demo.localGateOpen(), false, "preview Pages host must stay locked");
  assert.strictEqual(preview.demo.isUnlocked(), false, "?demo=1 must not unlock live Pages");
  assert.strictEqual(preview.flagStore.getItem("cognation.demo.unlock.v1"), null);
  assert.strictEqual(preview.demo.unlock(), false);
  assert.strictEqual(preview.gate.hidden, false, "a stored demo session must not skip the live sign-in gate");
  assert.strictEqual(preview.form.querySelector("[data-login-demo-unlock]"), null, "live sign-in must not keep a Demo unlock control");
  assert.strictEqual(preview.sessionStore.getItem("cognation.session.v2"), null);

  var production = bootLogin({
    hostname: "cognation-3md.pages.dev",
    search: "?demo=1",
  });
  assert.strictEqual(production.demo.localGateOpen(), false);
  assert.strictEqual(production.form.querySelector("[data-login-demo-unlock]"), null);
  assert.strictEqual(production.gate.hidden, false);
}

function testLocalGateStillOpens() {
  var local = bootLogin({
    hostname: "localhost",
    protocol: "http:",
    search: "",
  });
  assert.strictEqual(local.demo.localGateOpen(), true);
  assert.strictEqual(local.demo.isUnlocked(), false, "local sign-in stays locked until an explicit local unlock");
  assert.ok(local.form.querySelector("[data-login-demo-unlock]"), "loopback may mount Demo unlock");
  assert.strictEqual(local.gate.hidden, false);

  var envHost = bootLogin({
    hostname: "preview.example.test",
    search: "?demo=1",
    config: { localDemo: true },
  });
  assert.strictEqual(envHost.demo.localGateOpen(), true);
  assert.strictEqual(envHost.demo.isUnlocked(), true);

  var envOff = bootLogin({
    hostname: "preview.example.test",
    search: "?demo=1",
    config: {},
  });
  assert.strictEqual(envOff.demo.localGateOpen(), false);
  assert.strictEqual(envOff.demo.isUnlocked(), false);
  assert.strictEqual(envOff.form.querySelector("[data-login-demo-unlock]"), null);

  var queried = bootLogin({
    hostname: "127.0.0.1",
    protocol: "http:",
    search: "?demo=1",
  });
  assert.strictEqual(queried.demo.isUnlocked(), true);
  return Promise.resolve().then(function () {
    assert.strictEqual(queried.gate.hidden, true, "local ?demo=1 may enter the preview");
  });
}

function main() {
  testPublicSignInMarkup();
  testNoShippedDemoPassword();
  testLivePagesCannotUnlock();
  return testLocalGateStillOpens()
    .then(testRuntimeConfigOmitsDemoByDefault)
    .then(function () {
      console.log("public demo unlock check passed");
    });
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
