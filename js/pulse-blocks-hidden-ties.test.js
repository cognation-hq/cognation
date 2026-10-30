/**
 * PULSE (a): blocks, hidden activity and tie order (PM ruling 2026-10-30).
 * Fully stubbed: no live DB, no seeds. Exercises the real loadRanked/rank.
 *  4c  a person I blocked is dropped even if a friendship row lingers
 *  4d  a blocked professional I still follow never shows on Pro
 *  4e  activity on a review-hidden Tower post never scores (hidden_at=is.null)
 *  2c  ties: latest public interaction, oldest first; no interaction first; name last
 * The 14-day window (2b/3b) is PR (b): see the TODO at the end.
 * Run: node js/pulse-blocks-hidden-ties.test.js
 */
"use strict";
var assert = require("assert");

globalThis.CognationCircleRelations = require("./circle-saved-relations.js");
var api = require("./pulse-falling-friends.js");

var DAY = 86400000;
var NOW = Date.now();
function ago(days) { return new Date(NOW - days * DAY).toISOString(); }
function uid(prefix, n) { return prefix + "-0000-4000-8000-" + ("000000000000" + n.toString(16)).slice(-12); }
var ME = uid("00000000", 0xffff), MEP = uid("aaaaaaaa", 0xffff);
var seq = 0;
function nextId() { return uid("eeeeeeee", ++seq); }

function World() {
  this.friendships = []; this.profiles = []; this.follows = []; this.posts = []; this.postReactions = [];
  this.comments = []; this.commentReactions = []; this.blocks = []; this.queries = {};
  this.blocksFail = false;
  this.profiles.push({ id: MEP, user_id: ME, kind: "personal", handle: "me", display_name: "Me", account_kind: "real" });
  this.myPost = this.post(MEP, "my public post", { created_at: ago(20) });
}
World.prototype.person = function (n, name, opts) {
  opts = opts || {};
  var u = uid("00000000", n), p = uid("dddddddd", n);
  this.profiles.push({ id: p, user_id: u, kind: opts.kind || "personal", handle: name.toLowerCase(), display_name: name, account_kind: "real" });
  if (opts.friend !== false) this.friendships.push({ user_id: ME, friend_user_id: u, created_at: ago(100) });
  return { u: u, p: p, name: name };
};
World.prototype.post = function (authorP, body, o) {
  o = o || {};
  var row = { id: nextId(), author_profile_id: authorP, body: body, visibility: o.visibility || "public", created_at: o.created_at || ago(1), hidden_at: o.hidden_at || null };
  this.posts.push(row);
  return row;
};
World.prototype.react = function (post, p, n, days) {
  for (var i = 0; i < n; i++) this.postReactions.push({ post_id: post.id, profile_id: p, created_at: ago(days == null ? 1 : days) });
};
function inList(q, key) { var m = new RegExp("(?:^|&)" + key + "=in\\.\\(([^)]*)\\)").exec(q); return m ? m[1].split(",") : []; }
function eq(q, key) { var m = new RegExp("(?:^|&)" + key + "=eq\\.([^&]+)").exec(q); return m ? m[1] : null; }
function cols(q, row) {
  var m = /(?:^|&)select=([^&]+)/.exec(q);
  if (!m || m[1] === "*") return row;
  var out = {};
  m[1].split(",").forEach(function (c) {
    if (!(c in row)) throw new Error("column " + c + " does not exist");
    out[c] = row[c];
  });
  return out;
}
World.prototype.client = function () {
  var w = this;
  /* tower_posts RLS (20261016_user_blocks.sql:201-224): the author sees own posts, hidden too. */
  function postVisible(row) {
    var owner = w.profiles.filter(function (p) { return p.id === row.author_profile_id; })[0];
    if (owner && owner.user_id === ME) return true;
    return !row.hidden_at;
  }
  function out(table, q, rows) {
    (w.queries[table] = w.queries[table] || []).push(q);
    try { return Promise.resolve(rows.map(function (r) { return cols(q, r); })); }
    catch (e) { return Promise.reject(e); }
  }
  return {
    configured: function () { return true; },
    rest: function (table, o) {
      var q = (o && o.query) || "";
      if (table === "friendships") return out(table, q, /offset=0(&|$)/.test(q) ? w.friendships.slice() : []);
      if (table === "profiles") {
        var u = inList(q, "user_id"), ids = inList(q, "id");
        return out(table, q, w.profiles.filter(function (p) { return u.indexOf(p.user_id) >= 0 || ids.indexOf(p.id) >= 0; }));
      }
      if (table === "follows") return out(table, q, w.follows.slice());
      if (table === "user_blocks") {
        (w.queries[table] = w.queries[table] || []).push(q);
        if (w.blocksFail) return Promise.reject(new Error("permission denied"));
        /* RLS: blocker reads own blocks only */
        var mine = w.blocks.filter(function (b) { return b.a === ME; }).map(function (b) { return { blocker_user_id: b.a, blocked_user_id: b.b, created_at: ago(1) }; });
        var by = eq(q, "blocker_user_id");
        return out(table, q, by ? mine.filter(function (r) { return r.blocker_user_id === by; }) : mine);
      }
      if (table === "tower_posts") {
        var a = inList(q, "author_profile_id");
        var pub = /(^|&)visibility=eq\.public(&|$)/.test(q);
        var notHidden = /(^|&)hidden_at=is\.null(&|$)/.test(q);
        return out(table, q, w.posts.filter(function (p) {
          return a.indexOf(p.author_profile_id) >= 0 && (!pub || p.visibility === "public") && (!notHidden || !p.hidden_at) && postVisible(p);
        }));
      }
      if (table === "tower_post_reactions") { var pi = inList(q, "post_id"); return out(table, q, w.postReactions.filter(function (r) { return pi.indexOf(r.post_id) >= 0; })); }
      if (table === "news_story_comments") { var ca = inList(q, "author_profile_id"); return out(table, q, w.comments.filter(function (c) { return ca.indexOf(c.author_profile_id) >= 0; })); }
      /* no created_at column here yet (20261002_news_story_comments.sql:15-20) */
      if (table === "news_story_comment_reactions") { var ci = inList(q, "comment_id"); return out(table, q, w.commentReactions.filter(function (r) { return ci.indexOf(r.comment_id) >= 0; })); }
      return out(table, q, []);
    },
    rpc: function () { return Promise.resolve([]); },
  };
};
function names(list) { return list.map(function (f) { return f.name; }); }
function everyone(r) { return names(r.halo.concat(r.fall)); }
function proNames(r) { var p = r.professional || { halo: [], fall: [] }; return names(p.halo.concat(p.fall)); }

/* ---- 4c / 4d / 4e ---- */
function blocksAndHidden() {
  var w = new World();
  var top = [];
  for (var i = 1; i <= 5; i++) { var t = w.person(i, "Top" + i); w.react(w.myPost, t.p, 5 + i, 2); top.push(t); }
  /* 4c: I blocked Stale; a friendship row lingers next to the block row */
  var stale = w.person(33, "Stale");
  w.react(w.myPost, stale.p, 60, 3);
  w.blocks.push({ a: ME, b: stale.u });
  /* 4d: blocked professional I still follow (block_user leaves follows) */
  var proB = w.person(34, "ProBlocked", { friend: false, kind: "professional" });
  w.follows.push({ follower_user_id: ME, profile_id: proB.p });
  w.blocks.push({ a: ME, b: proB.u });
  w.react(w.myPost, proB.p, 40, 2);
  var proOk = w.person(35, "ProOk", { friend: false, kind: "professional" });
  w.follows.push({ follower_user_id: ME, profile_id: proOk.p });
  /* 4e: my post hidden by review (RLS still returns it to me as author) */
  var hiddenPost = w.post(MEP, "hidden by review @hid", { created_at: ago(2), hidden_at: ago(1) });
  var hid = w.person(36, "Hid");
  w.react(hiddenPost, hid.p, 30, 2);
  return api.loadRanked(w.client(), ME).then(function (r) {
    assert.ok(everyone(r).indexOf("Stale") < 0, "4c: Stale (blocked, lingering friendship) appears: " + everyone(r).join(","));
    assert.ok(!r.scores[stale.u], "4c: Stale scored " + r.scores[stale.u]);
    assert.deepStrictEqual(names(r.halo), ["Top5", "Top4", "Top3", "Top2", "Top1"], "4c: halo without Stale");
    assert.ok(proNames(r).indexOf("ProBlocked") < 0, "4d: ProBlocked on Pro: " + proNames(r).join(","));
    assert.ok(!r.scores[proB.u], "4d: ProBlocked scored " + r.scores[proB.u]);
    assert.ok(proNames(r).indexOf("ProOk") >= 0, "4d: followed pro (item 7) still shows: " + proNames(r).join(","));
    assert.ok((w.queries.user_blocks || []).some(function (q) { return /blocked_user_id/.test(q) && new RegExp("blocker_user_id=eq\\." + ME).test(q); }), "4c: reads my own user_blocks rows");
    assert.strictEqual(r.scores[hid.u], 0, "4e: Hid scored " + r.scores[hid.u]);
    assert.ok(names(r.halo).indexOf("Hid") < 0, "4e: Hid in halo");
    assert.ok(w.queries.tower_posts.length && w.queries.tower_posts.every(function (q) { return /(^|&)hidden_at=is\.null(&|$)/.test(q) && /(^|&)visibility=eq\.public(&|$)/.test(q); }), "4e: tower_posts read with hidden_at=is.null: " + w.queries.tower_posts.join(" | "));
  });
}

/* ---- 4c via the existing client block list (CognationBlock.listMyBlocks) when user_blocks is refused ---- */
function blocksFromClientList() {
  var w = new World();
  w.blocksFail = true;
  var t = w.person(1, "Keep"); w.react(w.myPost, t.p, 2, 2);
  var stale = w.person(2, "Stale"); w.react(w.myPost, stale.p, 9, 2);
  var proB = w.person(3, "ProBlocked", { friend: false, kind: "professional" });
  w.follows.push({ follower_user_id: ME, profile_id: proB.p });
  var prev = globalThis.CognationBlock;
  globalThis.CognationBlock = { listMyBlocks: function () { return Promise.resolve([{ user_id: stale.u, handle: "stale" }, { user_id: proB.u, handle: "problocked" }]); } };
  return api.loadRanked(w.client(), ME).then(function (r) {
    globalThis.CognationBlock = prev;
    assert.deepStrictEqual(everyone(r), ["Keep"], "4c: listMyBlocks source drops Stale: " + everyone(r).join(","));
    assert.deepStrictEqual(proNames(r), [], "4d: listMyBlocks source drops ProBlocked");
    assert.ok(!(r.gaps || []).some(function (g) { return /block/.test(g); }), "a refused block read is not an engagement gap");
  }, function (e) { globalThis.CognationBlock = prev; throw e; });
}

/* ---- 2c tie order ---- */
function ties() {
  var w = new World();
  for (var i = 1; i <= 5; i++) { var t = w.person(i, "Top" + i); w.react(w.myPost, t.p, 20 + i, 2); }
  /* score 1 each, last public interaction 1, 7, 13 days ago */
  var amy = w.person(21, "Amy"); w.react(w.myPost, amy.p, 1, 1);
  var bo = w.person(22, "Bo"); w.react(w.myPost, bo.p, 1, 7);
  var zed = w.person(23, "Zed"); w.react(w.myPost, zed.p, 1, 13);
  /* score 1 with no timestamp (News comment reaction; that table has no created_at yet) */
  var cara = w.person(24, "Cara");
  var myComment = { id: nextId(), author_profile_id: MEP, body: "comment", created_at: ago(3) };
  w.comments.push(myComment);
  w.commentReactions.push({ comment_id: myComment.id, profile_id: cara.p });
  /* score 1 via a tag in my public post 10 days ago (post time is the interaction time) */
  var tia = w.person(25, "Tia");
  w.post(MEP, "hi @tia", { created_at: ago(10) });
  /* zero interaction: sort first, by name */
  w.person(26, "Yul"); w.person(27, "Abe");
  return api.loadRanked(w.client(), ME).then(function (r) {
    assert.deepStrictEqual(names(r.halo), ["Top5", "Top4", "Top3", "Top2", "Top1"]);
    assert.deepStrictEqual(names(r.fall), ["Abe", "Yul", "Cara", "Zed", "Tia", "Bo", "Amy"], "2c: got " + names(r.fall).join(","));
    assert.ok(!(r.gaps || []).length, "no gaps: " + (r.gaps || []).join(","));
    /* pure rank(): equal scores, no times -> name (unchanged) */
    var plain = api.rank([{ userId: "b", name: "Bea" }, { userId: "a", name: "Al" }, { userId: "c", name: "Cy" }], {});
    assert.deepStrictEqual(names(plain.halo), ["Al", "Bea", "Cy"], "no timestamps: name order");
    /* pure rank() with times: falling oldest first, nothing first */
    var f = [{ userId: "a", name: "A" }, { userId: "b", name: "B" }, { userId: "c", name: "C" }];
    var many = [];
    for (var k = 0; k < 5; k++) many.push({ userId: "h" + k, name: "H" + k });
    var sc = { h0: 9, h1: 9, h2: 9, h3: 9, h4: 9, a: 1, b: 1, c: 1 };
    var last = { a: ago(1), b: ago(5) };
    var rr = api.rank(many.concat(f), sc, last);
    assert.deepStrictEqual(names(rr.fall), ["C", "B", "A"], "rank(): none first, then oldest");
  });
}

/* TODO (PR b, 14-day window): 2b "activity older than 14 days never counts" and
   3b "halo is the 5 most engaged in-window friends" live in pulse-cap30 findings;
   they need news_story_comment_reactions.created_at first. */

blocksAndHidden().then(blocksFromClientList).then(ties).then(function () {
  console.log("pulse-blocks-hidden-ties.test.js: OK");
}).catch(function (e) { console.error(e); process.exit(1); });
