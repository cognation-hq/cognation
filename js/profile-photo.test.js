/**
 * profiles.photo_url: validation, owner-only write, PULSE uses it with
 * letter-circle fallback, and PULSE still loads before the SQL is run.
 * Run: node js/profile-photo.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var photo = require("./profile-photo.js");
globalThis.CognationProfilePhoto = photo;
globalThis.CognationCircleRelations = require("./circle-saved-relations.js");
var pulse = require("./pulse-falling-friends.js");

/* Validation */
assert.strictEqual(photo.clean("https://cdn.example.com/a.jpg"), "https://cdn.example.com/a.jpg");
["http://x.com/a.jpg", "javascript:alert(1)", "data:image/png;base64,AAA", 'https://x.com/a".jpg', "https://x.com/a b.jpg", "https://x.com/" + "a".repeat(600), ""].forEach(function (u) {
  assert.strictEqual(photo.clean(u), "", "rejects " + u.slice(0, 30));
});

/* Owner-only write: own user id, own personal row, photo_url only */
var me = "00000000-0000-4000-8000-000000000001";
var calls = [];
var client = { rest: function (t, o) { calls.push({ t: t, o: o }); return Promise.resolve([]); } };
photo.saveOwnPhoto(client, me, "https://cdn.example.com/me.jpg").then(function (r) {
  assert.ok(r.ok);
  assert.strictEqual(calls[0].t, "profiles");
  assert.strictEqual(calls[0].o.method, "PATCH");
  assert.strictEqual(calls[0].o.query, "user_id=eq." + me + "&kind=eq.personal");
  assert.deepStrictEqual(Object.keys(calls[0].o.body), ["photo_url"]);
  return photo.saveOwnPhoto(client, me, "http://bad");
}).then(function (r) {
  assert.strictEqual(r.error, "invalid_url");
  return photo.saveOwnPhoto(client, "", "https://cdn.example.com/a.jpg");
}).then(function (r) {
  assert.strictEqual(r.error, "not_signed_in");
  assert.strictEqual(calls.length, 1, "nothing else written");

  /* PULSE reads photo_url; falls back to letters without it */
  var f1 = "00000000-0000-4000-8000-000000000002", f2 = "00000000-0000-4000-8000-000000000003";
  var rows = [{ user_id: me, friend_user_id: f1, created_at: "2026-10-02" }, { user_id: me, friend_user_id: f2, created_at: "2026-10-01" }];
  var profiles = [
    { user_id: me, kind: "personal", handle: "me", display_name: "Me", account_kind: "real" },
    { user_id: f1, kind: "personal", handle: "ada", display_name: "Ada", account_kind: "real", photo_url: "https://cdn.example.com/ada.jpg" },
    { user_id: f2, kind: "personal", handle: "leo", display_name: "Leo", account_kind: "real" },
  ];
  var selects = [];
  function server(sqlRun) {
    return { rest: function (t, o) {
      if (t === "friendships") return Promise.resolve(rows);
      selects.push(o.query);
      if (!sqlRun && /photo_url/.test(o.query)) return Promise.reject(new Error("column profiles.photo_url does not exist"));
      return Promise.resolve(profiles.map(function (p) { var c = Object.assign({}, p); if (!sqlRun) delete c.photo_url; return c; }));
    } };
  }
  return pulse.loadFriends(server(true), me).then(function (list) {
    assert.strictEqual(list[0].photoUrl, "https://cdn.example.com/ada.jpg");
    assert.strictEqual(list[1].photoUrl, "");
    assert.ok(/photo_url/.test(selects[0]), "asks for photo_url");
    return pulse.loadFriends(server(false), me);
  }).then(function (list) {
    assert.strictEqual(list.length, 2, "PULSE still loads before the SQL runs");
    assert.strictEqual(list[0].photoUrl, "");
    return list;
  });
}).then(function () {
  /* Render: photo circle vs letter circle */
  function El() { this.children = []; this.attrs = {}; this.textContent = ""; this.style = { setProperty: function () {} }; this.classList = { add: function () {} }; }
  El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
  El.prototype.getAttribute = function (k) { return this.attrs[k]; };
  El.prototype.appendChild = function (c) { this.children.push(c); return c; };
  El.prototype.insertBefore = function (c) { this.children.unshift(c); return c; };
  El.prototype.addEventListener = function () {};
  El.prototype.querySelector = function () { return null; };
  global.document = { createElement: function () { return new El(); } };
  El.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
  /* Image stub: URLs containing "broken" fail, others load. */
  var pending = [];
  global.Image = function () { var img = this; Object.defineProperty(img, "src", { set: function (v) { pending.push([img, v]); } }); };
  var layer = new El();
  var stack = pulse.render(layer, [
    { userId: "a", name: "Ada", handle: "ada", photoUrl: "https://cdn.example.com/ada.jpg" },
    { userId: "b", name: "Leo", handle: "leo", photoUrl: "" },
    { userId: "c", name: "Mia", handle: "mia", photoUrl: "javascript:alert(1)" },
  ], { width: 390, height: 700 });
  /* #265 adds a per-friend actions box (Unfriend / Check in) next to each frame; check the friend circles themselves. */
  function circles(st) { return st.children[0].children.filter(function (e) { return "data-circle-fall-portrait" in e.attrs; }); }
  var c = circles(stack);
  assert.strictEqual(c.length, 3, "one circle per friend");
  /* Before the photo loads every circle already shows its letter (never blank). */
  assert.deepStrictEqual(c.map(function (e) { return e.textContent; }), ["A", "L", "M"], "letters first");
  pending.forEach(function (p) { if (/broken/.test(p[1])) p[0].onerror(); else p[0].onload(); });
  assert.ok(/ada\.jpg/.test(c[0].style.backgroundImage) && "data-pulse-photo" in c[0].attrs, "photo circle after it loads");
  assert.strictEqual(pending.length, 1, "only the https URL is fetched (empty / null / javascript: never)");
  assert.strictEqual(c[1].textContent, "L", "letter fallback");
  assert.ok(!c[1].style.backgroundImage);
  assert.strictEqual(c[2].textContent, "M", "bad URL keeps letters");
  /* Null photo, a local avatar from the painter, and a URL that fails to load all keep the letter. */
  pending.length = 0;
  var s2 = pulse.render(new El(), [
    { userId: "d", name: "Luna", handle: "luna", photoUrl: null },
    { userId: "e", name: "Omar", handle: "omar", photoUrl: "https://cdn.example.com/broken.jpg" },
  ], { width: 390, height: 700, paint: function (el) { el.textContent = ""; el.style.backgroundImage = 'url("data:image/png;base64,AAAA")'; } });
  var c2 = circles(s2);
  pending.forEach(function (p) { if (/broken/.test(p[1])) p[0].onerror(); else p[0].onload(); });
  assert.strictEqual(c2[0].textContent, "L", "null photo_url → letter");
  assert.ok(!c2[0].style.backgroundImage, "local painter avatar dropped");
  assert.strictEqual(c2[1].textContent, "O", "broken photo → letter stays");
  assert.ok(!("data-pulse-photo" in c2[1].attrs));

  /* SQL file: owner write, public read, https check */
  var sql = fs.readFileSync(path.join(__dirname, "..", "supabase/migrations/20261016_profiles_photo_url.sql"), "utf8");
  assert.ok(/add column if not exists photo_url text/.test(sql));
  assert.ok(/grant select \(photo_url\) on public\.profiles to anon, authenticated/.test(sql), "public read");
  assert.ok(/grant update \(photo_url\) on public\.profiles to authenticated/.test(sql), "owner write via existing RLS");
  assert.ok(/\^https:\/\//.test(sql), "https only");
  assert.ok(!/grant update[^;]*anon/.test(sql) && !/drop policy/.test(sql), "no anon write, no policy changes");
  console.log("profile-photo.test.js: OK");
}).catch(function (e) { console.error(e); process.exit(1); });
