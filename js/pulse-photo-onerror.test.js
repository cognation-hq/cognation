/* PULSE ring frame whose photo_url fails to load falls back to the no-photo look
   (Designer nit on #298: broken URL showed a plain black circle).
   Run: node --test js/pulse-photo-onerror.test.js */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const photo = require("./profile-photo.js");

const src = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");

function extract(name) {
  const start = src.indexOf("  function " + name + "(");
  assert.ok(start > 0, name + " exists");
  const end = src.indexOf("\n  }\n", start);
  return src.slice(start, end + 4);
}

function fakeSpot() {
  const attrs = {};
  const kids = [];
  return {
    style: {}, textContent: "", kids,
    setAttribute(k, v) { attrs[k] = String(v); },
    removeAttribute(k) { delete attrs[k]; },
    hasAttribute(k) { return k in attrs; },
    querySelector(sel) { return sel === "[data-circle-caption]" ? kids[0] || null : null; },
    appendChild(n) { kids.push(n); },
    attrs,
  };
}

function load(probes) {
  const ctx = {
    window: { Image: function () { probes.push(this); } },
    painted: [],
    paintFriendPicture(node, friend, index) {
      ctx.painted.push({ friend, index });
      node.textContent = "S"; node.kids.length = 0;
      node.style.background = "linear-gradient(145deg, #c7a, #fff5f9 70%)";
    },
  };
  vm.createContext(ctx);
  vm.runInContext(extract("fallBackIfPhotoFails") + "\nthis.fb = fallBackIfPhotoFails;", ctx);
  return ctx;
}

test("broken photo URL on a ring frame ends in the no-photo fallback", () => {
  const probes = [];
  const ctx = load(probes);
  const spot = fakeSpot();
  assert.ok(photo.applyPhoto(spot, "https://example.invalid/broken.jpg"));
  const caption = { caption: true };
  spot.appendChild(caption);
  assert.ok(spot.hasAttribute("data-pulse-photo"));
  ctx.fb(spot, { name: "Sam", handle: "sam" }, 2);
  assert.strictEqual(probes.length, 1);
  assert.strictEqual(probes[0].src, "https://example.invalid/broken.jpg");
  probes[0].onerror();
  assert.ok(!spot.hasAttribute("data-pulse-photo"), "photo flag dropped so the #298 solid fill applies");
  assert.strictEqual(spot.style.backgroundImage, "");
  assert.strictEqual(ctx.painted.length, 1);
  assert.strictEqual(ctx.painted[0].index, 2);
  assert.strictEqual(spot.textContent, "S");
  assert.deepStrictEqual(spot.kids, [caption], "caption kept");
});

test("a photo that loads is left alone (no onload repaint)", () => {
  const probes = [];
  const ctx = load(probes);
  const spot = fakeSpot();
  photo.applyPhoto(spot, "https://example.com/ok.jpg");
  ctx.fb(spot, { name: "Jo" }, 0);
  if (probes[0].onload) probes[0].onload();
  assert.ok(spot.hasAttribute("data-pulse-photo"));
  assert.strictEqual(ctx.painted.length, 0);
});

test("ring shell wires the fallback after applyPhoto; no-photo path unchanged", () => {
  assert.match(src, /if \(photoApi\.applyPhoto\(spot, person\.photoUrl\)\) fallBackIfPhotoFails\(spot, person, i\);/);
  assert.match(src, /else paintFriendPicture\(spot, \{ id: person\.handle \|\| person\.userId, name: person\.name \}, i\);/);
});

test("falling circles keep their letter when the photo fails (existing probe)", () => {
  const ff = fs.readFileSync(path.join(__dirname, "pulse-falling-friends.js"), "utf8");
  assert.match(ff, /probe\.onload = function \(\) \{ photo\.applyPhoto\(el, clean\); \};/);
  assert.match(ff, /paintLetter\(el, friend\);\s*\n\s*\/\*[^*]*\*\/\s*\n\s*paintPhotoWhenLoaded\(el, friend\.photoUrl\);/);
});
