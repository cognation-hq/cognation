/**
 * Load-order checks for auth, /runtime-config, and the Supabase client.
 * Run: node js/load-order.test.js
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

function loadRuntimeConfig() {
  var src = read("functions/runtime-config.js").replace(
    "export async function onRequest",
    "async function onRequest"
  );
  return new Function(src + "\nreturn onRequest;")();
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

function loadSupabaseClient(windowStub) {
  var context = vm.createContext({
    window: windowStub,
    localStorage: windowStub.localStorage,
    fetch: windowStub.fetch,
    Promise: Promise,
    console: console,
  });
  vm.runInContext(read("js/supabase-client.js"), context);
  return windowStub.CognationSupabase;
}

async function testRuntimeConfigCache() {
  var onRequest = loadRuntimeConfig();
  var empty = await onRequest({ env: {} });
  assert.strictEqual(empty.headers.get("cache-control"), "no-store");
  assert.ok((await empty.text()).indexOf("supabaseUrl") === -1);

  var partial = await onRequest({ env: { SUPABASE_URL: "https://example.supabase.co" } });
  assert.strictEqual(partial.headers.get("cache-control"), "no-store");

  var full = await onRequest({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    },
  });
  assert.strictEqual(full.headers.get("cache-control"), "public, max-age=120");
  var body = await full.text();
  assert.ok(body.indexOf("https://example.supabase.co") !== -1);
  assert.ok(body.indexOf("sb_publishable_test") !== -1);
}

function testHtmlLoadOrder() {
  var html = read("index.html");
  var preload = html.indexOf('rel="preload" href="/runtime-config" as="script"');
  var configScript = html.indexOf('<script src="/runtime-config"></script>');
  var clientScript = html.indexOf('<script src="js/supabase-client.js"></script>');
  assert.ok(preload !== -1 && preload < configScript, "preload /runtime-config in the head");
  assert.ok(configScript !== -1 && configScript < clientScript, "runtime-config before supabase client");
  assert.ok(!/src="\/runtime-config"[^>]*\s(async|defer)/.test(html), "runtime-config stays parser-blocking");
  assert.ok(html.indexOf('<body class="login-gate-open">') !== -1, "splash class is on the first paint");
  assert.ok(
    /id="login-gate"[\s\S]*?aria-hidden="false"/.test(html) &&
      !/id="login-gate"[\s\S]{0,400}\shidden[\s>]/.test(html),
    "login gate is visible before deferred scripts"
  );
  assert.ok(html.indexOf('<script src="js/accounts.js" defer></script>') !== -1);
  var accounts = html.indexOf("js/accounts.js");
  var login = html.indexOf("js/login.js");
  assert.ok(accounts !== -1 && accounts < login, "accounts registry is available before login boot");
}

async function testLazyConfigAndSingleRefresh() {
  var storage = memoryStorage();
  var calls = [];
  var windowStub = {
    CognationConfig: { supabaseUrl: "", supabasePublishableKey: "" },
    localStorage: storage,
    fetch: function (url) {
      calls.push(String(url));
      if (String(url).indexOf("grant_type=refresh_token") !== -1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: function () {
            return Promise.resolve(
              JSON.stringify({
                access_token: "new-access",
                refresh_token: "new-refresh",
                expires_in: 3600,
                token_type: "bearer",
              })
            );
          },
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: function () {
          return Promise.resolve(JSON.stringify({ id: "user-1" }));
        },
      });
    },
  };
  var client = loadSupabaseClient(windowStub);
  assert.strictEqual(client.configured(), false);
  windowStub.CognationConfig.supabaseUrl = "https://example.supabase.co";
  windowStub.CognationConfig.supabasePublishableKey = "sb_publishable_test";
  assert.strictEqual(client.configured(), true, "configured() must see config assigned after startup");

  storage.setItem(
    "cognation.supabase.session.v1",
    JSON.stringify({
      access_token: "old-access",
      refresh_token: "old-refresh",
      expires_at: Math.floor(Date.now() / 1000) - 10,
    })
  );

  var both = await Promise.all([client.getUser(), client.getUser()]);
  assert.strictEqual(both[0].id, "user-1");
  var refreshes = calls.filter(function (url) {
    return url.indexOf("grant_type=refresh_token") !== -1;
  });
  assert.strictEqual(refreshes.length, 1, "parallel boot calls share one refresh");
  assert.strictEqual(calls.length, 3, "one refresh plus two user reads");
  var stored = JSON.parse(storage.getItem("cognation.supabase.session.v1"));
  assert.strictEqual(stored.access_token, "new-access");
  assert.ok(stored.expires_at > Math.floor(Date.now() / 1000));

  calls.length = 0;
  await client.getUser();
  assert.ok(
    calls.every(function (url) {
      return url.indexOf("grant_type=refresh_token") === -1;
    }),
    "a fresh access token is not refreshed again"
  );
}

async function main() {
  await testRuntimeConfigCache();
  testHtmlLoadOrder();
  await testLazyConfigAndSingleRefresh();
  console.log("load-order tests passed");
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
