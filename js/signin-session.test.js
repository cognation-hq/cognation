/**
 * Sign-in must finish after a live Supabase session starts.
 * Run: node js/signin-session.test.js
 *
 * A remote Tower profile used to seed demo badges on every read and save().
 * save() fired cognation:tower-profile-updated, and the follow button sync
 * called get() again. That overflowed the stack and PATCH-stormed /profiles
 * the moment the sign-in gate closed.
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

function memoryStorage() {
  var data = {};
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

function loadScript(rel, windowStub) {
  var context = vm.createContext({
    window: windowStub,
    document: windowStub.document,
    localStorage: windowStub.localStorage,
    location: windowStub.location,
    CustomEvent: windowStub.CustomEvent,
    fetch: windowStub.fetch,
    Promise: Promise,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  });
  vm.runInContext(read(rel), context, { filename: rel });
}

function makeDocument() {
  var listeners = {};
  return {
    readyState: "complete",
    addEventListener: function (name, fn) {
      (listeners[name] = listeners[name] || []).push(fn);
    },
    dispatchEvent: function (ev) {
      (listeners[ev.type] || []).forEach(function (fn) {
        fn(ev);
      });
      return true;
    },
    querySelectorAll: function () {
      return [];
    },
    querySelector: function () {
      return null;
    },
    createElement: function () {
      return {
        innerHTML: "",
        querySelectorAll: function () {
          return [];
        },
        attributes: [],
      };
    },
    getElementById: function () {
      return null;
    },
  };
}

function CustomEventStub(type, init) {
  this.type = type;
  this.detail = init && init.detail;
}

function testRemoteProfileReadDoesNotRecurse() {
  var patches = 0;
  var events = 0;
  var document = makeDocument();
  var windowStub = {
    document: document,
    localStorage: memoryStorage(),
    location: { hash: "" },
    CustomEvent: CustomEventStub,
    CognationAuth: {
      getSession: function () {
        return {
          source: "supabase",
          supabaseUserId: "user-1",
          activeProfileId: "profile-1",
          username: "alexa@example.com",
        };
      },
    },
    CognationSupabaseSocial: {
      active: function () {
        return true;
      },
      getViewedProfileId: function () {
        return "profile-1";
      },
      getTowerProfile: function () {
        return {
          _remote: true,
          _profileId: "profile-1",
          _profileKind: "personal",
          displayName: "Alexa",
          handle: "alexa",
          slogan: "Small rituals.",
          publicWidgets: { identity: true },
        };
      },
      updateCurrentProfile: function () {
        patches += 1;
        return Promise.resolve(null);
      },
    },
  };
  windowStub.window = windowStub;
  loadScript("js/tower.js", windowStub);
  var store = windowStub.CognationTowerProfileStore;
  var depth = 0;
  document.addEventListener("cognation:tower-profile-updated", function () {
    events += 1;
    depth += 1;
    assert.ok(depth < 8, "profile save re-entered get()");
    store.get();
    depth -= 1;
  });
  var profile = store.get();
  assert.strictEqual(profile.displayName, "Alexa");
  assert.strictEqual(profile.handle, "alexa");
  assert.ok(Array.isArray(profile.awardedBadges));
  assert.strictEqual(profile.awardedBadges.length, 0, "live profiles must not gain demo badges");
  store.get();
  store.get();
  assert.strictEqual(patches, 0, "reading a live profile must not PATCH /profiles");
  assert.strictEqual(events, 0, "reading a live profile must not dispatch tower-profile-updated");
}

function testSignInSkipsStaleSessionAndSurfacesMsg() {
  var calls = [];
  var storage = memoryStorage();
  storage.setItem(
    "cognation.supabase.session.v1",
    JSON.stringify({
      access_token: "stale-access",
      refresh_token: "stale-refresh",
      expires_at: Math.floor(Date.now() / 1000) - 120,
    })
  );
  var windowStub = {
    CognationConfig: {
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "sb_publishable_test",
    },
    localStorage: storage,
    fetch: function (url, options) {
      calls.push({ url: String(url), options: options || {} });
      var failing = String(url).indexOf("grant_type=password") !== -1 &&
        String(options && options.body || "").indexOf("wrong") !== -1;
      return Promise.resolve({
        ok: !failing,
        status: failing ? 400 : 200,
        text: function () {
          return Promise.resolve(
            failing
              ? JSON.stringify({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" })
              : JSON.stringify({
                  access_token: "fresh-access",
                  refresh_token: "fresh-refresh",
                  expires_in: 3600,
                  user: { id: "user-1", email: "alexa@example.com" },
                })
          );
        },
      });
    },
  };
  windowStub.window = windowStub;
  loadScript("js/supabase-client.js", windowStub);
  return windowStub.CognationSupabase.signIn("alexa@example.com", "correct").then(function (result) {
    assert.strictEqual(result.user.id, "user-1");
    assert.strictEqual(calls.length, 1, "sign-in must not refresh a stale session first");
    assert.ok(calls[0].url.indexOf("grant_type=password") !== -1);
    assert.ok(!calls[0].options.headers.Authorization, "password grant must not send a leftover user JWT");
    var stored = JSON.parse(storage.getItem("cognation.supabase.session.v1"));
    assert.strictEqual(stored.access_token, "fresh-access");
    return windowStub.CognationSupabase.signIn("alexa@example.com", "wrong");
  }).then(
    function () {
      throw new Error("wrong password should reject");
    },
    function (error) {
      assert.strictEqual(error.message, "Invalid login credentials");
      assert.strictEqual(error.code, "invalid_credentials");
      assert.ok(
        calls.every(function (call) {
          return String(call.url).indexOf("grant_type=refresh_token") === -1;
        }),
        "a failed sign-in must not refresh"
      );
    }
  );
}

function testInvalidCredentialsCopy() {
  var html = [
    '<div id="login-gate" hidden><form id="login-form">',
    '<input name="username" value="test@example.com">',
    '<input name="password" id="login-password" value="x">',
    '<p id="login-status" hidden></p>',
    '<button type="submit" data-login-submit>Sign in</button>',
    "</form></div>",
  ].join("");
  var listeners = {};
  function el(tag, attrs) {
    var node = {
      tagName: tag.toUpperCase(),
      hidden: false,
      value: "",
      textContent: "",
      className: "",
      attrs: {},
      children: [],
      classList: {
        toggle: function () {},
        add: function () {},
        remove: function () {},
      },
      setAttribute: function (name, value) {
        node.attrs[name] = value;
        if (name === "id") node.id = value;
        if (name === "hidden") node.hidden = true;
      },
      getAttribute: function (name) {
        return node.attrs[name];
      },
      removeAttribute: function (name) {
        delete node.attrs[name];
      },
      appendChild: function (child) {
        node.children.push(child);
        return child;
      },
      addEventListener: function (name, fn) {
        (node.listeners[name] = node.listeners[name] || []).push(fn);
      },
      dispatchEvent: function (ev) {
        (node.listeners[ev.type] || []).forEach(function (fn) {
          fn(ev);
        });
        (listeners[ev.type] || []).forEach(function (fn) {
          fn(ev);
        });
      },
      querySelector: function (sel) {
        return find(node, sel);
      },
      querySelectorAll: function () {
        return [];
      },
      focus: function () {},
      listeners: {},
    };
    Object.keys(attrs || {}).forEach(function (key) {
      node.attrs[key] = attrs[key];
      node[key] = attrs[key];
    });
    return node;
  }
  var gate = el("div", { id: "login-gate", hidden: true });
  var form = el("form", { id: "login-form" });
  var user = el("input", { name: "username", value: "test@example.com" });
  var pass = el("input", { name: "password", id: "login-password", value: "x" });
  var status = el("p", { id: "login-status", hidden: true });
  form.children = [user, pass, status];
  form.querySelector = function (sel) {
    if (sel.indexOf("username") !== -1) return user;
    if (sel.indexOf("password") !== -1) return pass;
    if (sel.indexOf("country") !== -1) return null;
    if (sel.indexOf("login-demo") !== -1) return null;
    return null;
  };
  gate.children = [form];
  var document = {
    readyState: "complete",
    body: { classList: { add: function () {}, remove: function () {} } },
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
      return null;
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
  var windowStub = {
    document: document,
    localStorage: memoryStorage(),
    location: { hash: "" },
    CustomEvent: CustomEventStub,
    CognationSupabase: {
      configured: function () {
        return true;
      },
      signIn: function () {
        var error = new Error("Invalid login credentials");
        error.status = 400;
        error.code = "invalid_credentials";
        error.body = { error_code: "invalid_credentials", msg: "Invalid login credentials" };
        return Promise.reject(error);
      },
    },
    setTimeout: function (fn) {
      if (typeof fn === "function") fn();
      return 0;
    },
    clearTimeout: function () {},
  };
  windowStub.window = windowStub;
  void html;
  loadScript("js/login.js", windowStub);
  var submitters = form.listeners.submit || [];
  assert.ok(submitters.length, "login form listens for submit");
  submitters[0]({ preventDefault: function () {} });
  return new Promise(function (resolve) {
    setTimeout(resolve, 0);
  }).then(function () {
    assert.strictEqual(status.textContent, "Wrong email or password.");
    assert.strictEqual(status.hidden, false);
  });
}

function testLoginActionsAreNotSticky() {
  var css = read("css/styles.css");
  var sticky = css.indexOf(".login-form-actions {\n  position: sticky;");
  var unstick = css.indexOf(".login-gate .login-form-actions {\n  position: static;");
  assert.ok(sticky !== -1, "sticky rule is still the shared actions style");
  assert.ok(unstick > sticky, "the login gate must unstick Sign in after the sticky rule");
}

function main() {
  testRemoteProfileReadDoesNotRecurse();
  testLoginActionsAreNotSticky();
  return testSignInSkipsStaleSessionAndSurfacesMsg()
    .then(testInvalidCredentialsCopy)
    .then(function () {
      console.log("signin-session tests passed");
    });
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
