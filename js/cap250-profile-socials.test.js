/**
 * Cap 250 — profile social logos, Connections|Public pill drop,
 * mutual followers, Follow face / Friend rules.
 * Run: node js/cap250-profile-socials.test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
function src(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

var tower = src("js/tower.js");
var follow = src("js/tower-follow.js");
var graph = src("js/social-graph.js");
var html = src("index.html");
var css = src("css/styles.css");

assert.ok(fs.existsSync(path.join(root, "assets/social/youtube.png")), "YouTube logo asset present");
assert.ok(fs.existsSync(path.join(root, "assets/social/instagram.png")), "Instagram logo asset present");
assert.ok(fs.existsSync(path.join(root, "assets/social/x.png")), "X logo asset present");

assert.ok(/logo:\s*"assets\/social\/youtube\.png"/.test(tower), "SOCIAL_NETWORKS carries YouTube logo path");
assert.ok(/classList\.add\("is-logo"\)|is-logo"/.test(tower), "renderSocialLinks paints logo buttons");
assert.ok(/createElement\("img"\)/.test(tower) && /net\.logo/.test(tower), "logo img nodes from assets");
assert.ok(/\.tower-social-btn\.is-logo/.test(css), "circular logo CSS present");
assert.ok(/border-radius:\s*999px/.test(css), "logo buttons are circular");

assert.ok(/data-tower-side-toggle[^>]*hidden|toggle\.hidden = true/.test(html + tower), "Connections|Public pill hidden");
assert.ok(/data-tower-side-jump="public"/.test(html), "quiet jump to Public profile");
assert.ok(/data-tower-side-jump="private"/.test(html), "quiet jump to Connections");
assert.ok(/\[data-tower-side-toggle\]\s*\{\s*display:\s*none/.test(css), "pill forced off in CSS");

assert.ok(/data-tower-followers-mutual/.test(html), "mutual followers line hook");
assert.ok(/tower-followers-find[\s\S]*hidden/.test(html) || /input\.hidden = true/.test(tower), "Search followers removed/hidden");
assert.ok(/formatMutualFollowersLine/.test(tower), "mutual followers formatter present");
assert.ok(/Seeds NEVER appear in a real person's mutual line/.test(tower), "seed exclusion documented in mutual line");
assert.ok(/followerEdges/.test(tower), "follow edges carry face");
assert.ok(/normalizeFollowerFace/.test(tower), "follower face normalizer");

assert.ok(/viewerFace/.test(follow), "Follow uses viewer Tower face");
assert.ok(/Professional pages cannot friend personal profiles/.test(follow), "pro cannot Friend personal");
assert.ok(/CognationTowerFollowers\.add\(String\(followerId\), face\)/.test(follow), "Follow add passes face");
assert.ok(/opts\.viewerFace === "professional"/.test(graph), "social-graph blocks pro→Friend");

assert.ok(/data-tower-social="linktree"/.test(html), "Linktree field on Edit Profile");
assert.ok(/professionalOnly:\s*true/.test(tower) && /personalOnly:\s*true/.test(tower), "kind-gated social networks");

console.log("cap250-profile-socials.test.js: OK");
