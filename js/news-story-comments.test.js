/**
 * News story comments baby step.
 * Run: node js/news-story-comments.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
/* index.html loads the shared age-floor helper before news-comments.js. */
function ncSrc() { return src("js/age-floor-keywords.js") + "\n" + src("js/news-comments.js"); }
function mem() {
  var d = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
}
function load(ls) {
  var w = {};
  vm.runInNewContext(ncSrc(), { window: w, localStorage: ls, Date: Date, Math: Math });
  return w.CognationNewsComments;
}

var css = src("css/styles.css");
var html = src("index.html");
var commune = src("js/commune.js");
assert.ok(css.indexOf(".news-comment-react-chip") !== -1, "react size class exists");
assert.ok(html.indexOf("js/news-comments.js") !== -1, "script wired");
assert.ok(commune.indexOf("CognationNewsComments.mount") !== -1, "commune mounts under story");

var api = load(mem());
assert.strictEqual(api.REACT_CHIP_CLASS, "news-comment-react-chip");

var denied = api.addComment({ storyId: "s1", body: "nope", parentId: "x" });
assert.strictEqual(denied.ok, false);
assert.strictEqual(denied.error, "one_level_only");
var ok = api.addComment({ storyId: "s1", body: "hello", authorName: "seed-a", accountKind: "seed", createdAt: "2026-10-01T10:00:00.000Z" });
assert.ok(ok.ok);
assert.ok(!("parentId" in ok.comment), "comment has no parentId field");

for (var i = 0; i < 22; i++) {
  api.addComment({
    storyId: "s2", body: "c" + i, authorName: "u",
    createdAt: "2026-10-01T" + String(10 + Math.floor(i / 60)).padStart(2, "0") + ":" + String(i % 60).padStart(2, "0") + ":00.000Z",
  });
}
var list = api.listForStory("s2");
assert.strictEqual(list.length, 20, "cap 20");
assert.ok(list[0].body === "c2", "drops oldest beyond 20; window starts at c2");
assert.ok(list[19].body === "c21", "ends at latest");
for (var j = 1; j < list.length; j++) {
  assert.ok(list[j - 1].createdAt <= list[j].createdAt, "oldest-first");
}

assert.strictEqual(api.isThreadVisible("G-PG", 12), true);
assert.strictEqual(api.isThreadVisible("PG", 10), true);
assert.strictEqual(api.isThreadVisible("PG-13", 12), false);
assert.strictEqual(api.isThreadVisible("R", 11), false);
assert.strictEqual(api.isThreadVisible("PG-13", 13), true);
assert.strictEqual(api.isThreadVisible("", 12), false);

console.log("news-story-comments.test.js: ok");

function sharedRest(db) {
  function profile(id) { return db.profiles[id] || { display_name: "Member", account_kind: "real" }; }
  return function (table, opts) {
    opts = opts || {};
    var method = opts.method || "GET";
    if (table === "news_story_comments" && method === "POST") {
      var row = {
        id: "c" + (db.comments.length + 1),
        story_id: opts.body.story_id,
        body: opts.body.body,
        created_at: "2026-10-02T17:00:0" + db.comments.length + ".000Z",
        author_profile_id: opts.body.author_profile_id,
        author: profile(opts.body.author_profile_id),
        reactions: [],
      };
      db.comments.push(row);
      return Promise.resolve([row]);
    }
    if (table === "news_story_comments") {
      var story = decodeURIComponent((opts.query.match(/story_id=eq\.([^&]+)/) || [])[1] || "");
      var rows = db.comments.filter(function (c) { return c.story_id === story; }).slice().reverse();
      rows.forEach(function (c) {
        c.reactions = db.reactions.filter(function (r) { return r.comment_id === c.id; });
        c.author = profile(c.author_profile_id);
      });
      return Promise.resolve(rows.slice(0, 20));
    }
    if (table === "news_story_comment_reactions" && method === "POST") {
      db.reactions.push(opts.body);
      return Promise.resolve([opts.body]);
    }
    return Promise.resolve([]);
  };
}
function boot(ls, auth, rest) {
  var w = {};
  vm.runInNewContext(ncSrc(), {
    window: w, localStorage: ls, Date: Date, Math: Math, Promise: Promise, encodeURIComponent: encodeURIComponent,
  });
  w.CognationSupabase = { configured: function () { return true; }, rest: rest };
  w.CognationAuth = { getSession: function () { return auth; } };
  return w.CognationNewsComments;
}
var db = { comments: [], reactions: [], profiles: {
  "p-ada": { display_name: "Ada", account_kind: "seed" },
  "p-hank": { display_name: "Hank", account_kind: "real" },
}};
var rest = sharedRest(db);
var ada = boot(mem(), { activeProfileId: "p-ada", profileDisplayName: "Ada", accountKind: "seed" }, rest);
var hank = boot(mem(), { activeProfileId: "p-hank", profileDisplayName: "Hank", accountKind: "real" }, rest);
var guest = boot(mem(), null, rest);
assert.strictEqual(guest.publishComment({ storyId: "s9", body: "nope" }).then ? "promise" : "sync", "promise");
guest.publishComment({ storyId: "s9", body: "nope" }).then(function (deniedGuest) {
  assert.strictEqual(deniedGuest.ok, false);
  assert.strictEqual(deniedGuest.error, "signed_in_required");
  assert.strictEqual(db.comments.length, 0, "guest did not write a you comment");
  return ada.publishComment({ storyId: "s9", body: "from ada", parentId: "nope" });
}).then(function (nested) {
  assert.strictEqual(nested.error, "one_level_only");
  return ada.publishComment({ storyId: "s9", body: "from ada" });
}).then(function (posted) {
  assert.strictEqual(posted.ok, true);
  return hank.pullStory("s9");
}).then(function (seen) {
  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0].authorName, "Ada");
  assert.strictEqual(seen[0].accountKind, "seed");
  assert.ok(hank.authorBadge("seed").indexOf("seedops-demo-badge") !== -1);
  assert.ok(hank.authorBadge("real") === "");
  assert.ok(!("parentId" in seen[0]));
  console.log("news-story-comments.test.js: shared ok");
}).catch(function (err) { console.error(err); process.exit(1); });
