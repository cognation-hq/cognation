/**
 * Sign in must leave the loading/disabled state on success and failure,
 * enter the app when credentials succeed, and not wait on a stuck refresh.
 * Run: node scripts/check-signin-submit.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function makeStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null;
    },
    setItem: function (k, v) {
      data[k] = String(v);
    },
    removeItem: function (k) {
      delete data[k];
    },
    _data: data,
  };
}

function makeClassList() {
  const set = new Set();
  return {
    add: function (c) {
      set.add(c);
    },
    remove: function (c) {
      set.delete(c);
    },
    toggle: function (c, on) {
      if (on) set.add(c);
      else set.delete(c);
    },
    contains: function (c) {
      return set.has(c);
    },
  };
}

function makeEl(id) {
  return {
    id: id || "",
    hidden: true,
    textContent: "",
    value: "",
    disabled: false,
    classList: makeClassList(),
    attrs: {},
    listeners: {},
    setAttribute: function (name, value) {
      this.attrs[name] = value;
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
    removeAttribute: function (name) {
      delete this.attrs[name];
    },
    addEventListener: function (type, fn) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(fn);
    },
    querySelector: function () {
      return null;
    },
    querySelectorAll: function () {
      return [];
    },
    appendChild: function (child) {
      return child;
    },
    focus: function () {},
  };
}

function bootPage(fetchImpl, storage) {
  const calls = [];
  const localStorage = makeStorage(storage || {});
  const submitBtn = makeEl("submit");
  submitBtn.textContent = "Sign in";
  const username = makeEl("login-username");
  username.value = "alexa@example.com";
  const password = makeEl("login-password");
  password.value = "secret";
  const country = makeEl("login-country");
  country.value = "United States";
  const form = makeEl("login-form");
  form.querySelector = function (sel) {
    if (sel === "[data-login-submit]") return submitBtn;
    if (sel === 'input[name="username"]') return username;
    if (sel === 'input[name="password"]') return password;
    if (sel === 'select[name="country"]') return country;
    return null;
  };
  const gate = makeEl("login-gate");
  const status = makeEl("login-status");
  const elements = {
    "login-gate": gate,
    "login-form": form,
    "login-status": status,
  };
  const document = {
    readyState: "complete",
    body: makeEl("body"),
    documentElement: makeEl("html"),
    addEventListener: function () {},
    dispatchEvent: function () {},
    getElementById: function (id) {
      return elements[id] || null;
    },
    createElement: function () {
      return makeEl("el");
    },
    querySelector: function () {
      return null;
    },
  };
  const sandbox = {
    console: console,
    URL: URL,
    URLSearchParams: URLSearchParams,
    CustomEvent: function CustomEvent(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    },
    Promise: Promise,
    JSON: JSON,
    Date: Date,
    Math: Math,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    RegExp: RegExp,
    Error: Error,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    parseInt: parseInt,
    isNaN: isNaN,
    localStorage: localStorage,
    sessionStorage: makeStorage({}),
    document: document,
    location: {
      href: "http://127.0.0.1:8765/",
      pathname: "/",
      search: "",
      hash: "",
      replace: function () {},
    },
    fetch: function (url, options) {
      const call = { url: String(url), options: options || {}, resolve: null };
      calls.push(call);
      return new Promise(function (resolve) {
        call.resolve = resolve;
      });
    },
    CognationConfig: {
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "sb_publishable_test",
    },
  };
  if (fetchImpl) sandbox.fetch = fetchImpl(calls, sandbox.fetch);
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "js/supabase-client.js"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "js/demo-mode.js"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "js/login.js"), "utf8"), sandbox);
  return { sandbox: sandbox, calls: calls, gate: gate, status: status, submitBtn: submitBtn, form: form, localStorage: localStorage };
}

function tick() {
  return new Promise(function (resolve) {
    setTimeout(resolve, 0);
  });
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    text: function () {
      return Promise.resolve(JSON.stringify(body));
    },
  };
}

async function testSuccessDespiteHungRefreshAndProfiles() {
  const page = bootPage(null, {
    "cognation.supabase.session.v1": JSON.stringify({
      access_token: "expired-access",
      refresh_token: "refresh-1",
      expires_at: Math.floor(Date.now() / 1000) - 120,
    }),
  });
  await tick();
  assert(page.calls.length === 0, "a signed-out splash must not refresh before submit");
  assert(page.gate.hidden === false, "splash is open before sign-in");

  const submit = page.form.listeners.submit && page.form.listeners.submit[0];
  assert(typeof submit === "function", "sign-in submit listener is bound");
  submit({ preventDefault: function () {} });
  await tick();

  assert(page.submitBtn.disabled === true, "Sign in is disabled while submitting");
  assert(page.submitBtn.attrs["aria-busy"] === "true", "Sign in exposes aria-busy");
  assert(page.submitBtn.textContent === "Signing in…", "Sign in shows the loading label");
  assert(page.calls.length === 1, "password grant is the only request");
  assert(
    page.calls[0].url.indexOf("grant_type=password") !== -1,
    "sign-in does not wait on refresh"
  );
  assert(page.calls[0].options.keepalive !== true, "password grant is a normal request");
  assert(
    !page.calls[0].options.headers || !page.calls[0].options.headers.Authorization,
    "password grant does not send the expired bearer"
  );

  page.calls[0].resolve(
    jsonResponse(200, {
      access_token: "fresh-access",
      refresh_token: "fresh-refresh",
      expires_in: 3600,
      user: { id: "user-9", email: "alexa@example.com" },
    })
  );
  await tick();
  await tick();
  assert(page.gate.hidden === false, "gate stays up while profiles are still loading");
  assert(
    page.calls.some(function (call) {
      return call.url.indexOf("/rest/v1/profiles") !== -1;
    }),
    "profiles are requested after a valid sign-in"
  );

  await new Promise(function (resolve) {
    setTimeout(resolve, 4200);
  });
  const session = JSON.parse(page.localStorage.getItem("cognation.session.v2"));
  assert(session && session.source === "supabase", "success writes a supabase app session");
  assert(session.supabaseUserId === "user-9", "success keeps the signed-in user id");
  assert(page.gate.hidden === true, "success closes the splash");
  assert(page.submitBtn.disabled === false, "success re-enables Sign in");
  assert(page.submitBtn.attrs["aria-busy"] === "false", "success clears aria-busy");
  assert(page.submitBtn.textContent === "Sign in", "success restores the Sign in label");
  console.log("ok: valid sign-in enters the app even when refresh and profiles hang");
}

async function testFailureReenablesButton() {
  const page = bootPage();
  await tick();
  const submit = page.form.listeners.submit[0];
  submit({ preventDefault: function () {} });
  await tick();
  assert(page.submitBtn.disabled === true, "failed attempt starts disabled");
  page.calls[0].resolve(
    jsonResponse(400, { error_description: "Invalid login credentials" })
  );
  await tick();
  await tick();
  assert(page.gate.hidden === false, "failure keeps the splash open");
  assert(page.localStorage.getItem("cognation.session.v2") == null, "failure does not write a session");
  assert(page.submitBtn.disabled === false, "failure re-enables Sign in");
  assert(page.submitBtn.attrs["aria-busy"] === "false", "failure clears aria-busy");
  assert(page.submitBtn.textContent === "Sign in", "failure restores the Sign in label");
  assert(
    page.status.textContent.indexOf("Invalid login credentials") !== -1,
    "failure shows the provider error"
  );
  assert(page.status.classList.contains("is-error") === true, "failure marks the status as an error");
  console.log("ok: failed sign-in re-enables the button and stays on the splash");
}

async function main() {
  await testFailureReenablesButton();
  await testSuccessDespiteHungRefreshAndProfiles();
  process.exit(0);
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
