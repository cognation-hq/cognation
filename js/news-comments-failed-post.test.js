/**
 * News comments: a failed post keeps the typed text, shows "Couldn't post. Try
 * again." under the composer (News feed error line style), re-enables Post, and
 * clears the line on edit or on the next successful post.
 * No duplicates: one post in flight at a time; a retry of the same text reuses
 * its id, so a post that saved (only the reply was lost) is not saved twice;
 * a saved post whose refresh fails still counts as posted.
 * Run: node js/news-comments-failed-post.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
/* index.html loads the shared age-floor helper before news-comments.js. */
var code = fs.readFileSync(path.join(root, "js", "age-floor-keywords.js"), "utf8") + "\n" +
  fs.readFileSync(path.join(root, "js", "news-comments.js"), "utf8");

function mem() {
  var d = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
}
function tick() { return new Promise(function (r) { setTimeout(r, 5); }); }

/* Minimal DOM: the host's innerHTML is rebuilt by renderThread(); we keep a live
   form/input/button and any inserted error lines as objects. */
function makeHost() {
  var host = { hidden: false, attrs: {}, listeners: {}, lines: [], _html: "" };
  var input = { value: "", closest: function (sel) { return sel === "[data-news-comment-input]" ? input : null; } };
  var button = { disabled: false };
  var form = {
    closest: function (sel) { return sel === "[data-news-comment-form]" ? form : null; },
    querySelector: function (sel) {
      if (sel === "[data-news-comment-input]") return input;
      if (sel === ".news-comment-submit") return button;
      return null;
    },
    insertAdjacentElement: function (where, el) {
      assert.strictEqual(where, "afterend", "error line goes right under the composer");
      el.remove = function () { host.lines.splice(host.lines.indexOf(el), 1); };
      host.lines.push(el);
      return el;
    },
  };
  Object.defineProperty(host, "innerHTML", {
    get: function () { return host._html; },
    set: function (v) { host._html = v; host.lines.length = 0; },   /* re-render wipes inserted nodes */
  });
  host.setAttribute = function (k, v) { host.attrs[k] = v; };
  host.getAttribute = function (k) { return host.attrs[k] == null ? null : host.attrs[k]; };
  host.addEventListener = function (n, fn) { (host.listeners[n] = host.listeners[n] || []).push(fn); };
  host.contains = function () { return true; };
  host.querySelector = function (sel) {
    if (sel === "[data-news-comment-error]") return host.lines[0] || null;
    return null;
  };
  host.fire = function (name, target) {
    (host.listeners[name] || []).forEach(function (fn) { fn({ target: target, preventDefault: function () {} }); });
  };
  return { host: host, form: form, input: input, button: button };
}

function setup(restImpl, extraWin) {
  var dom = makeHost();
  var article = {
    attrs: { "data-post-id": "s1", "data-news-rating": "G-PG" },
    getAttribute: function (k) { return this.attrs[k] || null; },
    setAttribute: function (k, v) { this.attrs[k] = v; },
    querySelector: function () { return dom.host; },
    appendChild: function (c) { return c; },
  };
  var w = {
    CognationSupabase: { configured: function () { return true; }, rest: restImpl },
    CognationAuth: { getSession: function () { return { activeProfileId: "p-ada", profileDisplayName: "Ada", accountKind: "seed" }; } },
  };
  Object.keys(extraWin || {}).forEach(function (k) { w[k] = extraWin[k]; });
  var doc = {
    createElement: function (tag) {
      return { tagName: tag, className: "", textContent: "", attrs: {}, setAttribute: function (k, v) { this.attrs[k] = v; } };
    },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
  };
  var ls = mem();
  ls.setItem("cognation.member.profile.v1", JSON.stringify({ age: 28 }));
  vm.runInNewContext(code, { window: w, document: doc, localStorage: ls, Date: Date, Math: Math, Promise: Promise, encodeURIComponent: encodeURIComponent });
  w.CognationNewsComments.mount(article, { id: "s1", rating: "G-PG" });
  return dom;
}

var mode = "fail";
var posted = [];
var dom = setup(function (table, opts) {
  opts = opts || {};
  if (table === "news_story_comments" && opts.method === "POST") {
    if (mode === "fail") return Promise.reject(new Error("HTTP 500"));   /* network / Supabase / non-ok */
    posted.push(opts.body.body);
    return Promise.resolve([{}]);
  }
  if (table === "news_story_comments") {
    return Promise.resolve(posted.map(function (b, i) {
      return { id: "c" + i, story_id: "s1", body: b, created_at: "2026-10-07T15:0" + i + ":00.000Z", author: { display_name: "Ada", account_kind: "seed" }, reactions: [] };
    }));
  }
  return Promise.resolve([]);
});

tick().then(function () {
  assert.ok(dom.host.innerHTML.indexOf("data-news-comment-form") !== -1, "composer rendered");
  /* 1. Failed post */
  dom.input.value = "My first comment";
  dom.host.fire("submit", dom.form);
  assert.strictEqual(dom.button.disabled, true, "Post is disabled while sending");
  return tick();
}).then(function () {
  assert.strictEqual(dom.input.value, "My first comment", "typed text is kept");
  assert.strictEqual(dom.button.disabled, false, "Post is re-enabled for a retry");
  assert.strictEqual(dom.host.lines.length, 1, "one error line");
  var line = dom.host.lines[0];
  assert.strictEqual(line.textContent, "Couldn't post. Try again.");
  assert.strictEqual(line.className, "commune-status is-error", "reuses the News feed error line style");
  assert.strictEqual(line.attrs.role, "status", "announced, not a pop-up");

  /* A second failure does not stack lines. */
  dom.host.fire("submit", dom.form);
  return tick();
}).then(function () {
  assert.strictEqual(dom.host.lines.length, 1, "still one error line after a second failure");

  /* 2. Editing the text clears the line. */
  dom.host.fire("input", dom.input);
  assert.strictEqual(dom.host.lines.length, 0, "line clears when the text is edited");

  /* 3. Fail again, then a successful retry clears the line and the box. */
  dom.host.fire("submit", dom.form);
  return tick();
}).then(function () {
  assert.strictEqual(dom.host.lines.length, 1, "line back after another failure");
  mode = "ok";
  dom.host.fire("submit", dom.form);
  return tick().then(tick);
}).then(function () {
  assert.strictEqual(dom.host.lines.length, 0, "line clears on the successful retry");
  assert.strictEqual(dom.input.value, "", "success path unchanged: box cleared");
  assert.strictEqual(dom.button.disabled, false);
  assert.ok(dom.host.innerHTML.indexOf("My first comment") !== -1, "posted comment shows in the thread");
  assert.deepStrictEqual(posted.slice(), ["My first comment"], "posted once");

  /* CSS reused, nothing new. */
  var css = fs.readFileSync(path.join(root, "css", "styles.css"), "utf8");
  assert.ok(/\.commune-status\.is-error \{/.test(css), "fixture: existing error style present");
}).then(noDuplicates).then(function () {
  console.log("news-comments-failed-post.test.js: ok");
}).catch(function (err) { console.error(err); process.exit(1); });

/* A tiny server: rows keyed by id, like the table's primary key. */
function server() {
  var rows = [];
  var srv = { rows: rows, posts: 0, ids: [], postMode: "ok", pullMode: "ok" };
  srv.rest = function (table, opts) {
    opts = opts || {};
    if (table === "news_story_comments" && opts.method === "POST") {
      srv.posts += 1;
      var b = opts.body;
      srv.ids.push(b.id || "");
      if (b.id && rows.some(function (r) { return r.id === b.id; })) {
        var dup = new Error("duplicate key"); dup.status = 409; return Promise.reject(dup);
      }
      if (srv.postMode === "fail") return Promise.reject(new Error("HTTP 500"));
      rows.push({ id: b.id || "srv-" + rows.length, story_id: b.story_id, body: b.body, created_at: "2026-10-07T16:0" + rows.length + ":00.000Z", author: { display_name: "Ada", account_kind: "seed" }, reactions: [] });
      /* saved, but the reply never arrives */
      if (srv.postMode === "lost-reply") return Promise.reject(new Error("network"));
      return Promise.resolve([{}]);
    }
    if (table === "news_story_comments") {
      if (srv.pullMode === "fail") return Promise.reject(new Error("HTTP 503"));
      return Promise.resolve(rows.slice());
    }
    return Promise.resolve([]);
  };
  return srv;
}
var n = 0;
var fakeCrypto = { randomUUID: function () { n += 1; return "00000000-0000-4000-8000-" + ("000000000000" + n).slice(-12); } };

function noDuplicates() {
  /* A. Saved, reply lost -> error shown, text kept; retry reuses the id -> 409 -> posted once. */
  var srv = server();
  var d = setup(srv.rest, { crypto: fakeCrypto });
  return tick().then(function () {
    srv.postMode = "lost-reply";
    d.input.value = "Saved but the reply was lost";
    d.host.fire("submit", d.form);
    return tick().then(tick);
  }).then(function () {
    assert.strictEqual(d.host.lines.length, 1, "lost reply looks like a failure to the user");
    assert.strictEqual(d.input.value, "Saved but the reply was lost", "text kept");
    srv.postMode = "ok";
    d.host.fire("submit", d.form);
    return tick().then(tick).then(tick);
  }).then(function () {
    assert.strictEqual(srv.rows.length, 1, "retry did not save a second copy (rows " + srv.rows.length + ")");
    assert.strictEqual(srv.ids[0], srv.ids[1], "the retry sent the same id");
    assert.ok(/^[0-9a-f-]{36}$/.test(srv.ids[0]), "a client id was sent");
    assert.strictEqual(d.host.lines.length, 0, "retry counts as posted");
    assert.strictEqual(d.input.value, "", "box cleared");
    assert.strictEqual(d.host.innerHTML.split("Saved but the reply was lost").length - 1, 1, "comment shows once");

    /* B. New text gets a new id. */
    d.input.value = "Second comment";
    d.host.fire("submit", d.form);
    return tick().then(tick);
  }).then(function () {
    assert.notStrictEqual(srv.ids[2], srv.ids[0], "different text, different id");
    assert.strictEqual(srv.rows.length, 2);

    /* C. Double submit while one is in flight: one POST. */
    var before = srv.posts;
    d.input.value = "Pressed twice";
    d.host.fire("submit", d.form);
    d.host.fire("submit", d.form);
    return tick().then(tick).then(function () {
      assert.strictEqual(srv.posts - before, 1, "second submit while sending is ignored");
      assert.strictEqual(srv.rows.length, 3);
    });
  }).then(function () {
    /* D. Saved, but the refresh after it fails: still posted (no retry, no duplicate). */
    srv.pullMode = "fail";
    d.input.value = "Refresh failed after save";
    d.host.fire("submit", d.form);
    return tick().then(tick);
  }).then(function () {
    assert.strictEqual(d.host.lines.length, 0, "no error when the post saved");
    assert.strictEqual(d.input.value, "", "box cleared");
    assert.strictEqual(srv.rows.length, 4);

    /* E. A real 409 for an id that is not there is still a failure. */
    var srv2 = server();
    srv2.rest = (function (orig) {
      return function (table, opts) {
        if (table === "news_story_comments" && opts && opts.method === "POST") {
          var e = new Error("conflict"); e.status = 409; return Promise.reject(e);
        }
        return orig(table, opts);
      };
    })(srv2.rest);
    var d2 = setup(srv2.rest, { crypto: fakeCrypto });
    return tick().then(function () {
      d2.input.value = "Conflict";
      d2.host.fire("submit", d2.form);
      return tick().then(tick);
    }).then(function () {
      assert.strictEqual(d2.host.lines.length, 1, "409 without our comment saved is a failure");
      assert.strictEqual(d2.input.value, "Conflict", "text kept");
    });
  });
}
