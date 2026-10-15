/**
 * 13+ signup gate (Alexa lock): neutral birthdate, block screen, no network on
 * under-13, 24h device hold, server fingerprint check, legal links.
 * Run: node js/signup-age-gate.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var gate = require("./signup-age-gate.js");

function store(seed) {
  var d = Object.assign({}, seed || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
    _d: d,
  };
}

var now = new Date(2026, 9, 14, 12, 0, 0);

/* Age math: birthday boundary, invalid and future dates. */
assert.strictEqual(gate.ageFromBirthdate("2013-10-14", now), 13);
assert.strictEqual(gate.ageFromBirthdate("2013-10-15", now), 12);
assert.strictEqual(gate.isUnderMin("2013-10-15", now), true);
assert.strictEqual(gate.isUnderMin("2013-10-14", now), false);
assert.strictEqual(gate.isUnderMin("1990-01-01", now), false);
assert.strictEqual(gate.ageFromBirthdate("2013-02-30", now), null);
assert.strictEqual(gate.ageFromBirthdate("2030-01-01", now), null);
assert.strictEqual(gate.ageFromBirthdate("", now), null);
assert.strictEqual(gate.isUnderMin("garbage", now), false);

/* Device hold: localStorage OR cookie, expires after 24h. */
var s = store();
var doc = { cookie: "" };
assert.strictEqual(gate.isHeld(s, doc, now.getTime()), false);
gate.setHold(s, doc, now.getTime());
assert.ok(/cg_signup_hold=\d+/.test(doc.cookie) && /Max-Age=86400/.test(doc.cookie));
assert.strictEqual(gate.isHeld(s, { cookie: "" }, now.getTime() + 1000), true, "localStorage alone holds");
assert.strictEqual(gate.isHeld(store(), { cookie: "cg_signup_hold=" + (now.getTime() + 5000) }, now.getTime()), true, "cookie alone holds");
assert.strictEqual(gate.isHeld(s, { cookie: "" }, now.getTime() + gate.HOLD_MS + 1), false, "expires after 24h");
assert.strictEqual(Object.keys(s._d).length, 1, "hold stores only the expiry flag");
assert.ok(!/\d{4}-\d{2}-\d{2}/.test(JSON.stringify(s._d) + doc.cookie), "no birthdate stored");

/* Fingerprint check: posts only the email to our own endpoint; fails open. */
var calls = [];
function fakeFetch(answer) {
  return function (url, opts) {
    calls.push({ url: url, body: JSON.parse(opts.body) });
    if (answer instanceof Error) return Promise.reject(answer);
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve(answer); } });
  };
}

/* Markup + copy: neutral birthdate, no cutoff wording in the signup UI. */
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
var gateStart = html.indexOf('id="login-gate"');
var gateHtml = html.slice(gateStart, html.indexOf("<header", gateStart));
assert.ok(/id="birthdate"[\s\S]*?type="date"|type="date"[\s\S]*?id="birthdate"/.test(gateHtml), "birthdate date input");
assert.ok(!/id="age"/.test(gateHtml), "old numeric age field removed");
var formHtml = gateHtml.replace(/<div class="login-age-block"[\s\S]*?<\/div>/, "");
assert.ok(!/\b13\b|thirteen|old enough|minimum age/i.test(formHtml.replace(/<[^>]+>/g, " ")), "no cutoff hint in signup copy");
assert.ok(/data-login-age-block[\s\S]*?Cognation is for ages 13 and up\./.test(gateHtml), "plain block screen");
assert.ok(/href="\/terms"/.test(gateHtml) && /href="\/privacy"/.test(gateHtml), "legal links on signup");
assert.ok(html.indexOf("js/signup-age-gate.js") < html.indexOf("js/login-signup-shell.js"), "gate loads before shell");

/* Shell: error copy has no cutoff; under-13 path blocks before any network call. */
var shell = fs.readFileSync(path.join(root, "js", "login-signup-shell.js"), "utf8");
assert.ok(!/13 or older|at least 13|n >= 13/.test(shell), "no cutoff in shell copy/validation");
var under = shell.indexOf("g.isUnderMin(birthInput.value)");
assert.ok(under > 0 && under < shell.indexOf("checkEmailBlocked") && under < shell.indexOf(".signUp("), "age gate runs before any request");
assert.ok(/function blockSignup\(\)[\s\S]*?clearSignupInputs\(\)/.test(shell), "block clears inputs");

/* Legal pages: published verbatim, placeholders kept, no contact address. */
["terms", "privacy"].forEach(function (name) {
  var page = fs.readFileSync(path.join(root, name + ".html"), "utf8");
  assert.ok(/NOT YET REVIEWED BY A LAWYER/.test(page), name + " draft banner");
  assert.ok(/\[DATE AT PUBLISH\]/.test(page), name + " placeholder kept");
  assert.ok(!/mailto:|@[a-z0-9-]+\.[a-z]/i.test(page), name + " has no contact address");
});

gate.checkEmailBlocked("A@Example.test", fakeFetch({ blocked: true }))
  .then(function (blocked) {
    assert.strictEqual(blocked, true);
    assert.strictEqual(calls[0].url, "/api/signup-check");
    assert.deepStrictEqual(Object.keys(calls[0].body), ["email"]);
    return gate.checkEmailBlocked("a@example.test", fakeFetch(new Error("offline")));
  })
  .then(function (blocked) {
    assert.strictEqual(blocked, false);
    return gate.checkEmailBlocked("a@example.test", fakeFetch({ blocked: false }));
  })
  .then(function (blocked) {
    assert.strictEqual(blocked, false);
    console.log("signup-age-gate.test.js: ok");
  })
  .catch(function (e) {
    console.error(e);
    process.exit(1);
  });
