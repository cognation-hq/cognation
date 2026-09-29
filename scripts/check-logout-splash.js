/**
 * Log out must open the sign-on splash and clear sessions even if Supabase
 * signOut never returns.
 * Run: node scripts/check-logout-splash.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

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
    classList: makeClassList(),
    attrs: {},
    children: [],
    setAttribute: function (name, value) {
      this.attrs[name] = value;
    },
    getAttribute: function (name) {
      return this.attrs[name];
    },
    removeAttribute: function (name) {
      delete this.attrs[name];
    },
    addEventListener: function () {},
    querySelector: function () {
      return null;
    },
    querySelectorAll: function () {
      return [];
    },
    appendChild: function (child) {
      this.children.push(child);
      return child;
    },
    focus: function () {},
  };
}

function bootPage() {
  const fetches = [];
  const replaced = [];
  const localStorage = makeStorage({
    "cognation.session.v2": JSON.stringify({
      username: "alexa@example.com",
      source: "supabase",
      supabaseUserId: "user-1",
      startedAt: 1,
    }),
    "cognation.supabase.session.v1": JSON.stringify({
      access_token: "access-token-1",
      refresh_token: "refresh-token-1",
    }),
  });
  const sessionStorage = makeStorage({});
  const elements = {
    "login-gate": makeEl("login-gate"),
    "login-form": makeEl("login-form"),
    "login-status": makeEl("login-status"),
  };
  elements["login-gate"].hidden = true;
  const body = makeEl("body");
  const documentElement = makeEl("html");
  const document = {
    readyState: "complete",
    body: body,
    documentElement: documentElement,
    addEventListener: function () {},
    dispatchEvent: function () {},
    getElementById: function (id) {
      return elements[id] || null;
    },
    createElement: function (tag) {
      return makeEl(tag);
    },
    querySelector: function () {
      return null;
    },
  };
  const location = {
    href: "http://127.0.0.1:8765/?demo=1#tower-profile-alexa",
    pathname: "/",
    search: "?demo=1",
    hash: "#tower-profile-alexa",
    replace: function (next) {
      replaced.push(next);
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
    sessionStorage: sessionStorage,
    document: document,
    location: location,
    fetch: function () {
      return new Promise(function (resolve) {
        fetches.push(resolve);
      });
    },
    CognationConfig: {
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "sb_publishable_test",
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "js/supabase-client.js"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "js/demo-mode.js"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "js/login.js"), "utf8"), sandbox);
  return { sandbox: sandbox, fetches: fetches, replaced: replaced, localStorage: localStorage, sessionStorage: sessionStorage, gate: elements["login-gate"] };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const page = bootPage();
assert(page.fetches.length === 1, "boot should be waiting on getUser");
assert(page.gate.hidden === true, "gate stays closed until auth resolves");
assert(page.sessionStorage.getItem("cognation.demo.unlock.v1") === "1", "demo query armed unlock");

const logoutResult = page.sandbox.CognationAuth.logout({
  message: "Signed out. Sign in to continue.",
});
assert(logoutResult && typeof logoutResult.then === "function", "logout returns a promise");
assert(page.localStorage.getItem("cognation.session.v2") == null, "app session cleared without waiting for signOut");
assert(page.localStorage.getItem("cognation.supabase.session.v1") == null, "supabase session cleared without waiting for signOut");
assert(page.sessionStorage.getItem("cognation.demo.unlock.v1") == null, "demo unlock cleared");
assert(page.gate.hidden === false, "sign-on gate is open");
assert(page.gate.attrs["aria-hidden"] === "false", "sign-on gate is exposed");
assert(page.replaced.length === 1 && page.replaced[0] === "/", "logout replaces the page with the splash path");
assert(page.fetches.length === 2, "signOut was started");

const responseText = JSON.stringify({ id: "user-1" });
page.fetches[0]({
  ok: true,
  text: function () {
    return Promise.resolve(responseText);
  },
});

setTimeout(function () {
  try {
    assert(page.localStorage.getItem("cognation.session.v2") == null, "late getUser must not restore the session");
    assert(page.gate.hidden === false, "late getUser must not close the sign-on gate");
    assert(page.sandbox.CognationAuth.isAuthenticated() === false, "logged-out session is not authenticated");
    console.log("ok: logout clears sessions and opens the splash even when signOut hangs");
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  }
}, 30);
