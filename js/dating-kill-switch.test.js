/**
 * P0 dating kill switch. Run: node js/dating-kill-switch.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var read = function (p) { return fs.readFileSync(path.join(root, p), "utf8"); };

var flag = read("js/dating-flag.js");
var html = read("index.html");
var swipe = read("js/commune-swipe.js");
var hydrate = read("js/seedops-dating-hydrate.js");
var sql = read("supabase/migrations/20261016_dating_off.sql");

assert.ok(/var DATING_ENABLED = false;/.test(flag), "single flag, off");
var w = {}; new Function("window", flag)(w);
assert.strictEqual(w.CognationDatingFlag.enabled(), false, "flag reads off");
assert.ok(html.indexOf("js/dating-flag.js") > -1 && html.indexOf("js/dating-flag.js") < html.indexOf("js/commune-swipe.js"), "flag loads before swipe");
assert.ok(/data-dating-entry hidden/.test(html), "entry hidden in markup");
assert.ok(/function datingAllowed\(\) \{\s*if \(!datingSwitchOn\(\)\) return false;/.test(swipe), "datingAllowed gated (pool + speed-dating room use it)");
assert.ok(/var next = !!on && datingSwitchOn\(\);/.test(swipe), "See dating can't turn on");
assert.ok(/if \(!datingSwitchOn\(\)\) see = false;/.test(hydrate), "hydrate forces See dating off");
assert.ok(/datingSwitchOn\(\) && seedDatingOn/.test(hydrate), "seed opt-ins not applied");
assert.ok(/NOT auto-run/.test(sql) && /\('dating', false\)/.test(sql), "server flag off");
assert.ok(/if not public\.cognation_dating_enabled\(\) then\s*return;/.test(sql), "RPC empty when off");
console.log("dating-kill-switch ok");
