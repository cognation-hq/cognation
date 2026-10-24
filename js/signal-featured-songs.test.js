/**
 * Featured songs: artist opt-in or beneficiary opt-in can be attached.
 * Neither opted in cannot. The News copy drops the song.
 * Run: node js/signal-featured-songs.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var api = require("./signal-featured-songs.js");

assert.strictEqual(api.allowed("harbor-light").artist, "Lane & Co.");
assert.strictEqual(api.allowed("paper-boat").title, "Paper Boat");
assert.strictEqual(api.allowed("night-window"), null);
assert.ok(!api.strip({ body: "Evening on the block.", featuredSong: { id: "harbor-light" } }).featuredSong);

function store() {
  var saved = { posts: [] };
  return {
    add: function (fields) {
      var post = { id: "p" + (saved.posts.length + 1), body: fields.body, likes: 4, createdAt: "2026-10-24T00:00:00.000Z", rating: "G" };
      saved.posts.unshift(post);
      return { ok: true, post: post };
    },
    load: function () { return saved; },
    save: function () { return true; },
    newsList: function () {
      return saved.posts.map(function (post) {
        var copy = {};
        Object.keys(post).forEach(function (key) { copy[key] = post[key]; });
        return copy;
      });
    }
  };
}

var feed = store();
api.install(feed);
assert.strictEqual(api.choose("night-window"), null);
assert.ok(!feed.add({ body: "Tried the closed song." }).post.featuredSong);
api.choose("harbor-light");
var artistPost = feed.add({ body: "Evening on the block." });
assert.strictEqual(artistPost.post.featuredSong.title, "Harbor Light");
api.choose("paper-boat");
var beneficiaryPost = feed.add({ body: "Quiet street after supper." });
assert.strictEqual(beneficiaryPost.post.featuredSong.artist, "Mara Ellis");
feed.newsList().forEach(function (post) {
  assert.ok(!post.featuredSong, "most-reacted News copy leaves the song off");
  assert.ok(post.body.indexOf("Harbor") === -1 && post.body.indexOf("Paper") === -1);
});
assert.ok(fs.readFileSync(path.join(__dirname, "../index.html"), "utf8").indexOf("js/signal-featured-songs.js") !== -1);

console.log("signal-featured-songs.test.js: OK");
