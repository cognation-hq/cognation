/* SeedOps FAIL on live e412c2b (#298): PULSE ring frames whose friend has a default
   SVG *letter* avatar (seed svgAvatar in js/seedops-commune-alive.js) showed blank
   discs, because the photo-less CSS rule strips background-image and the initial
   lived only in that image. Reproduces the live ring path: the shell's no-photo
   branch -> paintFriendPicture -> CognationAccounts.getProfileByHandle(avatarDataUrl).
   Run: node --test js/pulse-ring-letter-avatar.test.js */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
function extract(re) {
  const m = re.exec(src);
  assert.ok(m, "found " + re);
  const end = src.indexOf("\n  }\n", m.index);
  return src.slice(m.index, end + 4);
}
function maybe(name) {
  const i = src.indexOf("  function " + name + "(");
  return i < 0 ? "" : src.slice(i, src.indexOf("\n  }\n", i) + 4);
}
/* the call the ring shell makes for a frame without a server photo_url */
const noPhotoCall = /\n        else (\w+)\(spot, /.exec(src.slice(src.indexOf("function paintCircleRingShell")));
assert.ok(noPhotoCall, "ring shell no-photo branch");
const FACE = noPhotoCall[1];

const ALIVE = fs.readFileSync(path.join(__dirname, "seedops-commune-alive.js"), "utf8");
const svgAvatarSrc = ALIVE.slice(ALIVE.indexOf("  function svgAvatar("), ALIVE.indexOf("\n  }\n", ALIVE.indexOf("  function svgAvatar(")) + 4);

function fakeSpot() {
  const attrs = {};
  return {
    style: {}, textContent: "",
    setAttribute(k, v) { attrs[k] = String(v); }, removeAttribute(k) { delete attrs[k]; },
    hasAttribute(k) { return k in attrs; }, attrs,
  };
}
/* CSSOM-ish: the shorthand sets backgroundImage to the gradient */
function styleProxy(spot) {
  spot.style = new Proxy({}, { set(t, k, v) { t[k] = v; if (k === "background") t.backgroundImage = /gradient/.test(v) ? v : ""; return true; } });
  return spot;
}

function load(records) {
  const ctx = { window: { CognationAccounts: { getProfileByHandle: (h) => records[h] || null } } };
  vm.createContext(ctx);
  vm.runInContext([
    src.slice(src.indexOf("  var FRIEND_AVATAR_COLORS = ["), src.indexOf("];", src.indexOf("  var FRIEND_AVATAR_COLORS = [")) + 2),
    extract(/  function friendHandleFromId\(/), extract(/  function friendInitials\(/),
    extract(/  function friendAvatarStyle\(/), maybe("localRecordShown"), extract(/  function paintFriendPicture\(/),
    maybe("pulseRingInitials"), maybe("paintRingFace"), svgAvatarSrc,
    "this.face = function (spot, person, i) { return " + FACE + "(spot, person, i); };",
    "this.svgAvatar = svgAvatar;",
  ].join("\n"), ctx);
  return ctx;
}
/* what the #298 rule does to a frame without [data-pulse-photo] */
function afterPhotoLessRule(spot) {
  return spot.hasAttribute("data-pulse-photo") ? spot.style.backgroundImage : "";
}

test("default SVG letter avatar (live seed shape) still shows text initials", () => {
  const records = {};
  const ctx = load(records);
  records.pax = { handle: "pax", displayName: "Pax Rivera", avatarDataUrl: ctx.svgAvatar("Pax Rivera", 3) };
  records.robin = { handle: "robin", displayName: "Robin", avatarDataUrl: ctx.svgAvatar("Robin", 1) };
  const a = styleProxy(fakeSpot());
  ctx.face(a, { name: "Pax Rivera", handle: "pax", userId: "u1" }, 0);
  assert.strictEqual(afterPhotoLessRule(a), "", "letter picture is not kept as a photo");
  assert.strictEqual(a.textContent, "PR", "two names: first + last initial");
  const b = styleProxy(fakeSpot());
  ctx.face(b, { name: "Robin", handle: "robin", userId: "u2" }, 1);
  assert.strictEqual(b.textContent, "R", "single name: first letter only");
});

test("no local picture: text initials from the display name", () => {
  const ctx = load({});
  const s = styleProxy(fakeSpot());
  ctx.face(s, { name: "Jo", handle: "jo" }, 2);
  assert.strictEqual(s.textContent, "J");
  assert.ok(!s.hasAttribute("data-pulse-photo"));
});

test("a real local raster picture is kept as a photo (untouched)", () => {
  const ctx = load({ cam: { avatarDataUrl: "data:image/jpeg;base64,AAAA" } });
  const s = styleProxy(fakeSpot());
  ctx.face(s, { name: "Cam Lee", handle: "cam" }, 0);
  assert.ok(s.hasAttribute("data-pulse-photo"));
  assert.match(s.style.backgroundImage, /data:image\/jpeg/);
  assert.strictEqual(s.textContent, "");
});
