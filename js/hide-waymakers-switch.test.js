/**
 * The COGNATION | WAYMAKERS top-bar switch is hidden, not deleted, until Waymakers
 * has a full design. Run: node js/hide-waymakers-switch.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
var tag = /<div class="site-switch" data-site-switch[^>]*>/.exec(html);
assert.ok(tag && /\shidden>$/.test(tag[0]), "top-bar switch carries hidden");
assert.ok(/data-site-switch-waymakers>WAYMAKERS</.test(html) && /aria-current="page">COGNATION</.test(html), "switch markup and link kept");
assert.ok(/\.app-topbar-actions \[data-site-switch\]\[hidden\] \{ display: none !important; \}/.test(css), "CSS honours hidden on the top-bar switch only");
assert.ok(/data-cognation-logout>Log out</.test(html), "Log out stays");
assert.ok(/\[data-site-switch\]\[hidden\] ~ \.app-logout-btn \{ white-space: nowrap; \}/.test(css), "Log out stays on one line without the switch");
assert.ok((html.match(/signal-subtabs site-switch/g) || []).length >= 1 && !/signal-subtabs site-switch[^"]*"[^>]*hidden/.test(html), "pipe switches that reuse .site-switch are not hidden");
console.log("hide-waymakers-switch.test.js ok");
