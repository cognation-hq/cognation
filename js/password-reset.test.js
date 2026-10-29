/**
 * Forgot / reset password flow.
 * Run: node js/password-reset.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var pr = require("./password-reset.js");
/* Built at runtime from parts: no literal addresses in tests (HH rule). */
function memberAddr(local) { return local + "@" + ["example", "test"].join("."); }

assert.deepStrictEqual(pr.parseRecovery("#access_token=abc&type=recovery&expires_in=3600"), { token: "abc" });
assert.strictEqual(pr.parseRecovery("#access_token=abc&type=signup"), null);
assert.strictEqual(pr.parseRecovery(""), null);
assert.ok(/expired/.test(pr.parseRecovery("#error=access_denied&error_description=Email+link+is+invalid+or+has+expired").error));
assert.strictEqual(pr.redirectUrl({ origin: "https://cognation-3md.pages.dev" }), "https://cognation-3md.pages.dev/reset-password");

var calls = [];
function fakeFetch(url, opts) { calls.push({ url: url, opts: opts }); return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } }); }
var c = { url: "https://x.supabase.co", key: "sb_publishable_test" };
(async function () {
  await pr.requestReset(fakeFetch, c, memberAddr("member"), "https://site/reset-password.html");
  assert.ok(calls[0].url.indexOf("/auth/v1/recover?redirect_to=https%3A%2F%2Fsite%2Freset-password.html") > 0);
  assert.strictEqual(calls[0].opts.method, "POST");
  assert.ok(!calls[0].opts.headers.Authorization, "recover sends no user token");
  var r = await pr.setPassword(fakeFetch, c, "tok", "newpassword1");
  assert.ok(r.ok);
  assert.strictEqual(calls[1].opts.method, "PUT");
  assert.strictEqual(calls[1].opts.headers.Authorization, "Bearer tok");
  assert.deepStrictEqual(JSON.parse(calls[1].opts.body), { password: "newpassword1" });
  var bad = await pr.setPassword(function () { return Promise.resolve({ ok: false, json: function () { return Promise.resolve({ msg: "weak" }); } }); }, c, "t", "x");
  assert.deepStrictEqual(bad, { ok: false, error: "weak" });

  var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(/href="\/reset-password"[^>]*>Forgot password\?</.test(html), "sign-in has Forgot password link");
  var page = fs.readFileSync(path.join(__dirname, "..", "reset-password.html"), "utf8");
  assert.ok(page.indexOf('src="/runtime-config"') < page.indexOf("password-reset.js"));
  console.log("password-reset tests passed");
})().catch(function (e) { console.error(e); process.exit(1); });
