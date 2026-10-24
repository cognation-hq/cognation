/**
 * USA-only pilot: signup stops when the form country is not the United States.
 * Public pages are not gated. Run: node js/signup-usa-pilot.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var MESSAGE = "The site isn't available to users in your area at this time.";

var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
var shell = fs.readFileSync(path.join(root, "js/login-signup-shell.js"), "utf8");
var countrySelect = html.indexOf('data-login-signup-country-select');
var area = html.indexOf('data-login-area-block');
assert.ok(countrySelect > 0 && area > countrySelect, "notice sits on the signup country field");
assert.ok(html.indexOf('data-login-area-block hidden role="status">' + MESSAGE) !== -1, "exact area message");
assert.ok(/data-login-area-block hidden/.test(html), "notice starts hidden");

var stop = shell.indexOf("if (applyAreaBlock(true)) return;");
assert.ok(stop > shell.indexOf("g.isUnderMin(birthInput.value)"), "age gate still runs first");
assert.ok(stop < shell.indexOf("checkEmailBlocked") && stop < shell.indexOf(".signUp("), "country check stops before signup");
assert.ok(/PILOT_COUNTRY = "United States"/.test(shell), "United States remains the pilot country");
assert.ok(/applyAreaBlock\(isSignup\)/.test(shell), "sign-in mode does not keep the block");

["about.html", "contact.html", "privacy.html", "terms.html", "messages.html"].forEach(function (name) {
  var page = fs.readFileSync(path.join(root, name), "utf8");
  assert.ok(page.indexOf(MESSAGE) === -1 && page.indexOf("data-login-area-block") === -1, name + " stays public");
});

console.log("signup-usa-pilot.test.js: ok");
