/**
 * Pro job title (profiles.job_title): plain text, trimmed, 60-char cap,
 * owner-only on Pro pages, and safe before the column exists on the server
 * (42703 / PGRST204 -> one retry without job_title, edit field stays hidden).
 * Run: node js/pro-job-title.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function tick() { return new Promise(function (r) { setTimeout(r, 5); }); }

var UID = "u-vee";
function serverRows() {
  return {
    "p-vee": { id: "p-vee", user_id: UID, kind: "personal", handle: "vee", display_name: "Vee", bio: "", job_title: null },
    "p-vee-pro": { id: "p-vee-pro", user_id: UID, kind: "professional", handle: "vee-studio", display_name: "Vee Studio", bio: "", job_title: "Product designer" },
    "p-ada-pro": { id: "p-ada-pro", user_id: "u-ada", kind: "professional", handle: "ada-pro", display_name: "Ada Pro", bio: "", job_title: "  Budget   coach " },
  };
}

/* missing: null (column exists) | "42703" | "PGRST204" */
function boot(opts) {
  opts = opts || {};
  var SERVER = serverRows();
  var listeners = {};
  var calls = [];
  var failNext = false;
  var doc = {
    readyState: "complete",
    addEventListener: function (t, fn) { (listeners[t] || (listeners[t] = [])).push(fn); },
    removeEventListener: function () {},
    dispatchEvent: function (ev) { (listeners[ev.type] || []).forEach(function (fn) { fn(ev); }); return true; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
  };
  function fail(code) {
    var err = new Error(code === "PGRST204"
      ? "Could not find the 'job_title' column of 'profiles' in the schema cache"
      : code === "42501" ? "permission denied for table profiles"
      : "column profiles.job_title does not exist");
    err.status = code === "42501" ? 401 : 400;
    err.body = { code: code, message: err.message, details: null, hint: null };
    return Promise.reject(err);
  }
  var session = { source: "supabase", supabaseUserId: UID, activeProfileId: opts.active || "p-vee-pro" };
  var win = {
    document: doc,
    location: { hash: "", href: "https://cognation.test/" },
    addEventListener: function () {}, removeEventListener: function () {},
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    CognationAuth: { getSession: function () { return session; }, setActiveProfile: function () {} },
    CognationSupabase: {
      configured: function () { return true; },
      rest: function (table, o) {
        o = o || {};
        var method = o.method || "GET";
        var q = String(o.query || "");
        calls.push({ table: table, method: method, query: q, body: o.body ? JSON.parse(JSON.stringify(o.body)) : null });
        if (table !== "profiles") return Promise.resolve([]);
        var wantsTitle = /select=[^&]*job_title/.test(q) || (o.body && Object.prototype.hasOwnProperty.call(o.body, "job_title"));
        if (opts.missing && wantsTitle) return fail(opts.missing);
        if (failNext) {
          failNext = false;
          var e = new Error("permission denied for table profiles"); e.status = 401;
          e.body = { code: "42501", message: e.message }; return Promise.reject(e);
        }
        function shape(r) { var c = Object.assign({}, r); if (opts.missing) delete c.job_title; return c; }
        if (method === "PATCH") {
          var id = decodeURIComponent((q.match(/id=eq\.([^&]+)/) || [])[1] || "");
          Object.assign(SERVER[id], o.body);
          return Promise.resolve([shape(SERVER[id])]);
        }
        var uid = (q.match(/user_id=eq\.([^&]+)/) || [])[1];
        var rows = Object.keys(SERVER).map(function (k) { return shape(SERVER[k]); });
        return Promise.resolve(uid ? rows.filter(function (r) { return r.user_id === decodeURIComponent(uid); }) : rows);
      },
      rpc: function () { return Promise.resolve([]); },
    },
  };
  win.window = win;
  var ctx = vm.createContext({
    window: win, document: doc, location: win.location, console: console, CustomEvent: win.CustomEvent,
    setTimeout: setTimeout, clearTimeout: clearTimeout, Promise: Promise, encodeURIComponent: encodeURIComponent,
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    sessionStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
  });
  vm.runInContext(src("js/supabase-social.js"), ctx);
  return { failNext: function () { failNext = true; }, win: win, social: win.CognationSupabaseSocial, calls: calls, server: SERVER, session: session, listeners: listeners };
}
function patches(t) { return t.calls.filter(function (c) { return c.method === "PATCH"; }); }
function profileGets(t) { return t.calls.filter(function (c) { return c.table === "profiles" && c.method === "GET"; }); }
function load(t) {
  /* refresh() loads profile lists; give the promise chain time to settle. */
  t.social.refresh();
  return tick().then(tick).then(tick).then(tick);
}

var tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

test("normalizeJobTitle: trim, collapse spaces, strip control chars, 60 cap, plain text", function () {
  var s = boot().social;
  assert.strictEqual(s.JOB_TITLE_MAX, 60);
  assert.strictEqual(s.normalizeJobTitle("  Lead   designer \n"), "Lead designer");
  assert.strictEqual(s.normalizeJobTitle(null), "");
  assert.strictEqual(s.normalizeJobTitle(undefined), "");
  assert.strictEqual(s.normalizeJobTitle("a\u0000b\u0007c"), "a b c");
  assert.strictEqual(s.normalizeJobTitle("x".repeat(90)).length, 60);
  assert.strictEqual(s.normalizeJobTitle("y".repeat(59) + " z"), "y".repeat(59), "no trailing space after the cap");
  assert.strictEqual(s.normalizeJobTitle("<b>Chef</b>"), "<b>Chef</b>", "kept as literal text; escaping happens on render");
});

test("column present: selects ask for job_title, rows cache a clean title, support flag true", function () {
  var t = boot();
  return load(t).then(function () {
    assert.ok(profileGets(t).length > 0);
    profileGets(t).forEach(function (c) { assert.ok(/select=[^&]*job_title/.test(c.query), c.query); });
    assert.strictEqual(t.social.jobTitleSupported(), true);
    assert.strictEqual(t.social.getProfile("p-ada-pro").job_title, "Budget coach");
    assert.strictEqual(t.social.getProfile("p-vee").job_title, "");
    var listed = t.social.listProfiles().filter(function (p) { return p.id === "p-ada-pro"; })[0];
    assert.strictEqual(listed.job_title, "Budget coach", "listProfiles rows carry job_title for the PYMK rows (#231)");
  });
});

test("owner Pro page: PATCH sends only job_title, trimmed and capped; empty clears to null; same value sends nothing", function () {
  var t = boot();
  return load(t).then(function () {
    return t.social.updateCurrentProfile({ jobTitle: "   Lead    designer  " });
  }).then(function (row) {
    var p = patches(t);
    assert.strictEqual(p.length, 1);
    assert.deepStrictEqual(p[0].body, { job_title: "Lead designer" });
    assert.ok(/id=eq\.p-vee-pro/.test(p[0].query));
    assert.ok(/select=[^&]*job_title/.test(p[0].query));
    assert.strictEqual(row.job_title, "Lead designer");
    return t.social.updateCurrentProfile({ jobTitle: "Lead designer " });
  }).then(function () {
    assert.strictEqual(patches(t).length, 1, "unchanged title: no PATCH");
    return t.social.updateCurrentProfile({ jobTitle: "z".repeat(200) });
  }).then(function () {
    assert.strictEqual(patches(t)[1].body.job_title.length, 60);
    return t.social.updateCurrentProfile({ jobTitle: "   " });
  }).then(function () {
    assert.deepStrictEqual(patches(t)[2].body, { job_title: null }, "blank clears the column");
  });
});

test("personal page: jobTitle is ignored (no PATCH)", function () {
  var t = boot({ active: "p-vee" });
  return load(t).then(function () {
    return t.social.updateCurrentProfile({ jobTitle: "Chef" });
  }).then(function () {
    assert.strictEqual(patches(t).length, 0);
  });
});

test("someone else's Pro row as active id: no PATCH (owner only)", function () {
  var t = boot({ active: "p-ada-pro" });
  return load(t).then(function () {
    return t.social.updateCurrentProfile({ jobTitle: "Hijack" });
  }).then(function () {
    assert.strictEqual(patches(t).length, 0);
  });
});

["42703", "PGRST204", "42501"].forEach(function (code) {
  test("column missing / not granted (" + code + "): one retry without job_title, rows still load, field support false, no job_title PATCH", function () {
    var t = boot({ missing: code });
    return load(t).then(function () {
      var gets = profileGets(t);
      var withTitle = gets.filter(function (c) { return /job_title/.test(c.query); });
      assert.strictEqual(withTitle.length, 1, "only the first select tries job_title");
      assert.ok(gets.length >= 2, "retried without job_title");
      assert.strictEqual(t.social.jobTitleSupported(), false);
      assert.ok(t.social.getProfile("p-ada-pro"), "profiles still cached");
      assert.strictEqual(t.social.getProfile("p-ada-pro").job_title, "", "name only");
      return t.social.updateCurrentProfile({ jobTitle: "Chef", displayName: "Vee Studio 2" });
    }).then(function () {
      var p = patches(t);
      assert.strictEqual(p.length, 1);
      assert.deepStrictEqual(Object.keys(p[0].body), ["display_name"]);
      assert.ok(!/job_title/.test(p[0].query), "PATCH return columns drop job_title");
    });
  });
});

test("other errors are not swallowed as a missing column (no retry, flag unchanged)", function () {
  var t = boot();
  return load(t).then(function () {
    t.failNext();
    return t.social.updateCurrentProfile({ jobTitle: "Chef" }).then(function () { return null; }, function (e) { return e; });
  }).then(function (err) {
    assert.ok(err && err.status === 401, "error reaches the caller");
    assert.strictEqual(patches(t).length, 1, "no retry");
    assert.strictEqual(t.social.jobTitleSupported(), true);
  });
});

test("edit field markup: inside the profile form, hidden + disabled by default, maxlength 60, script loaded", function () {
  var html = src("index.html");
  var form = html.slice(html.indexOf("data-tower-profile-form"), html.indexOf("</form>", html.indexOf("data-tower-profile-form")));
  assert.ok(/class="form-group tower-job-title-fields" data-tower-job-title-fields hidden>/.test(form));
  assert.ok(/<label for="tower-job-title">Job title<\/label>/.test(form));
  var input = (form.match(/<input id="tower-job-title"[^>]*>/) || [""])[0];
  assert.ok(/maxlength="60"/.test(input) && /data-tower-job-title/.test(input) && /\bdisabled\b/.test(input) && /type="text"/.test(input), input);
  assert.ok(html.indexOf('<script src="js/pro-job-title.js" defer></script>') > html.indexOf('<script src="js/tower.js" defer></script>'));
});

test("pro-job-title.js writes text through .value only (no innerHTML)", function () {
  var js = src("js/pro-job-title.js");
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(js));
  assert.ok(/\.value = /.test(js));
});

/* UI module: field visible only for the owner's own Pro page with the column present. */
function uiBoot(state) {
  function el(extra) {
    return Object.assign({ hidden: true, disabled: true, value: "", maxLength: -1, dataset: {}, addEventListener: function () {}, closest: function () { return null; } }, extra || {});
  }
  var group = el(), input = el();
  var doc = {
    readyState: "complete", activeElement: null,
    addEventListener: function () {},
    querySelector: function (sel) {
      if (sel === "[data-tower-job-title-fields]") return group;
      if (sel === "[data-tower-job-title]") return input;
      return null;
    },
  };
  var rows = {
    "p-pro": { id: "p-pro", user_id: "u1", kind: "professional", job_title: "Nurse educator" },
    "p-per": { id: "p-per", user_id: "u1", kind: "personal", job_title: "" },
    "p-other": { id: "p-other", user_id: "u2", kind: "professional", job_title: "X" },
  };
  var win = {
    document: doc, addEventListener: function () {},
    CognationAuth: { getSession: function () { return { source: "supabase", supabaseUserId: "u1", activeProfileId: state.active }; } },
    CognationSupabaseSocial: {
      JOB_TITLE_MAX: 60,
      jobTitleSupported: function () { return state.supported; },
      getViewedProfileId: function () { return state.viewed || state.active; },
      getProfile: function (id) { return rows[id] || null; },
    },
  };
  win.window = win;
  vm.runInContext(src("js/pro-job-title.js"), vm.createContext({ window: win, document: doc }));
  return { group: group, input: input };
}
test("UI: owner's own Pro page with the column -> field shown with the saved title", function () {
  var u = uiBoot({ supported: true, active: "p-pro" });
  assert.strictEqual(u.group.hidden, false);
  assert.strictEqual(u.input.disabled, false);
  assert.strictEqual(u.input.value, "Nurse educator");
  assert.strictEqual(u.input.maxLength, 60);
});
test("UI: column missing -> hidden", function () {
  assert.strictEqual(uiBoot({ supported: false, active: "p-pro" }).group.hidden, true);
});
test("UI: personal page -> hidden", function () {
  assert.strictEqual(uiBoot({ supported: true, active: "p-per" }).group.hidden, true);
});
test("UI: viewing someone else's page -> hidden", function () {
  assert.strictEqual(uiBoot({ supported: true, active: "p-pro", viewed: "p-other" }).group.hidden, true);
});

(async function () {
  var failed = 0;
  for (var i = 0; i < tests.length; i++) {
    try { await tests[i].fn(); console.log("ok - " + tests[i].name); }
    catch (e) { failed++; console.error("not ok - " + tests[i].name + "\n  " + (e && e.stack || e)); }
  }
  if (failed) { process.exitCode = 1; console.error(failed + " failed"); }
  else console.log("pro-job-title: " + tests.length + " passed");
})();
