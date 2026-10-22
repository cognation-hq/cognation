/**
 * Designer (Oct 21, after #214):
 * 1. Log out on the lilac top bar: #1c1630 text, 1px #1c1630 @ 40% border, no fill.
 * 2. Times collapsed reported/blocked story: status centred, italic, #1c1630 @ 70%.
 * 3. Times "Couldn't send report, try again": full #1c1630, chip left padding, no red.
 * Run: node js/logout-pill-times-status.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var css = fs.readFileSync(path.join(__dirname, "..", "css/styles.css"), "utf8");
var block = css.slice(css.indexOf("/* Designer (Oct 21), after #214."));
assert.ok(block.length > 200, "block present at the end of the cascade");

function rule(sel) {
  var i = block.indexOf(sel + " {");
  assert.ok(i >= 0, sel + " rule");
  return block.slice(i, block.indexOf("}", i));
}
var lo = rule(".app-topbar-actions .app-logout-btn");
assert.ok(/color: #1c1630 !important/.test(lo), "Log out text #1c1630");
assert.ok(/border: 1px solid rgba\(28, 22, 48, 0\.4\) !important/.test(lo), "1px #1c1630 at 40%");
assert.ok(/background: transparent !important/.test(lo), "no fill");
assert.ok(/text-shadow: none !important/.test(lo), "no white-text shadow");
var hv = rule(".app-topbar-actions .app-logout-btn:hover,\n.app-topbar-actions .app-logout-btn:focus-visible");
assert.ok(/background: transparent !important/.test(hv) && /border-color: #1c1630 !important/.test(hv), "hover: ink border, still no fill");
/* The lilac lock is the later Log out rule; the new one must come after it. */
assert.ok(css.lastIndexOf("background: rgba(255, 255, 255, 0.18) !important;") < css.indexOf("/* Designer (Oct 21), after #214."), "overrides the white pill");

var art = rule("#panel-signal [data-news-post][data-news-reported-hidden]");
assert.ok(/display: flex !important/.test(art) && /align-items: center !important/.test(art) && /justify-content: center !important/.test(art), "collapsed slot centres its line");
var st = rule("#panel-signal [data-news-post][data-news-reported-hidden] [data-news-report-status]");
assert.ok(/font-style: italic !important/.test(st) && /color: rgba\(28, 22, 48, 0\.7\) !important/.test(st), "italic, ink 70%");

var f = rule("#panel-signal [data-news-report-status][data-news-report-failed]");
assert.ok(/color: #1c1630 !important/.test(f) && /padding-left: 0\.5rem !important/.test(f), "story failure: ink, chip padding (0.5rem)");
var c = rule("#panel-signal .news-comment-item [data-news-comment-report-error]");
assert.ok(/color: #1c1630 !important/.test(c) && /background: transparent !important/.test(c) && /border: 0 !important/.test(c) && /padding: 0 0 0 0\.45rem !important/.test(c), "comment failure: ink, no red box, chip padding (0.45rem)");
assert.ok(/\.news-report-option \{[^}]*padding: 0\.2rem 0\.5rem;/.test(css) && /\.news-comment-item \.news-report-option \{[^}]*padding: 0\.18rem 0\.45rem;/.test(css), "chip paddings it matches");
assert.ok(!/#ed9300|#f5a623|#ffb000|gold|amber|yellow|248, 113, 113|#c45a5a/i.test(block), "no yellow, no red");

var stub = fs.readFileSync(path.join(__dirname, "news-report-stub.js"), "utf8");
// The failure line now goes through failureText(err), which falls back to REPORT_FAILED for unknown errors.
assert.ok(/say\(failureText\(err\), true\)/.test(stub) && /REFUSALS\[code\] : REPORT_FAILED/.test(stub) && /setAttribute\("data-news-report-failed"/.test(stub), "stub marks the failure line");
console.log("logout-pill-times-status.test.js ok");
