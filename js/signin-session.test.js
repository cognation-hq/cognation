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
      assert.ok(
        calls.every(function (call) {
          return String(call.url).indexOf("grant_type=refresh_token") === -1;
        }),
        "a failed sign-in must not refresh"
      );
    }
  );
}

function main() {
  testRemoteProfileReadDoesNotRecurse();
  return testSignInSkipsStaleSessionAndSurfacesMsg().then(function () {
    console.log("signin-session tests passed");
  });
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
