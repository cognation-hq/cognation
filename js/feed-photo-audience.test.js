/**
 * Feed photos are images, age-gated per photo. Composer audience is Personal | Professional.
 * Run: node js/feed-photo-audience.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..");
var pic = "data:image/gif;base64,R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=";
var shot = "Screenshot 2026-10-02 at 1.06.57PM.png";

function load(age) {
  var d = {};
  var local = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
  };
  /* Signed in (#309: a signed-out viewer's gates see age 0): a Supabase session
     and this user's own member profile. */
  var viewerId = ["u", "viewer"].join("-");
  local.setItem("cognation.session.v2", JSON.stringify({ username: "ada", activeProfileId: "ada", source: "supabase", supabaseUserId: viewerId }));
  local.setItem("cognation.member.profile.v1", JSON.stringify({ age: age, ownerUserId: viewerId }));
  var documentStub = { readyState: "loading", addEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, dispatchEvent: function () {} };
  var windowStub = { localStorage: local, document: documentStub };
  windowStub.window = windowStub;
  var ctx = vm.createContext({ window: windowStub, document: documentStub, localStorage: local, location: { hash: "", search: "", pathname: "/" }, console: console, CustomEvent: function (t, i) { this.type = t; this.detail = i && i.detail; } });
  ["js/age-floor-keywords.js", "js/auto-rate.js", "js/tower.js"].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx);
  });
  return windowStub;
}
function html(age, list) { return load(age).CognationFeedPhotos.html(list); }
var shown = html(16, [{ kind: "photo", label: shot, name: shot, dataUrl: pic }]);
assert.ok(shown.indexOf("<img") !== -1 && shown.indexOf(shot) === -1, "picture, not the file name");
assert.strictEqual(html(20, [{ kind: "photo", dataUrl: pic, rating: "MA" }]), "", "no 21+ under 21");
assert.ok(html(21, [{ kind: "photo", dataUrl: pic, audience: "21+" }]).indexOf("<img") !== -1, "21 sees 21+");
assert.strictEqual(html(17, [{ kind: "photo", dataUrl: pic, rating: "R" }]), "", "under the rating");
assert.ok(html(12, [{ kind: "photo", dataUrl: pic }]).indexOf("<img") !== -1, "no rating stays visible");
assert.ok(html(30, [{ kind: "note", name: "Zoning notes.pdf" }]).indexOf("Zoning notes.pdf") !== -1, "notes stay chips");
var square = html(30, [{ kind: "photo", label: "Square photo", name: "market-square.jpg" }]);
assert.ok(square.indexOf("<img") !== -1 && square.indexOf("Square photo") === -1 && square.indexOf("PHOTO") === -1, "a photo with no bytes is still the picture");
assert.ok(html(30, [{ kind: "video", name: "mural-walk.mp4" }]).indexOf("mural-walk.mp4") !== -1, "videos stay files");
assert.ok(html(30, [{ kind: "document", name: "block-party-invite.pdf" }]).indexOf("block-party-invite.pdf") !== -1, "documents stay files");
var added = load(25).CognationTowerStore.add({ body: "Office hours", profileKind: "professional", authorProfileId: "pro-1", handle: "alex-pro" });
assert.strictEqual(added.post.profileKind, "professional");
assert.strictEqual(added.post.authorProfileId, "pro-1");
assert.strictEqual(added.post.handle, "alex-pro");
var form = fs.readFileSync(path.join(root, "index.html"), "utf8");
var choice = form.slice(form.indexOf('id="tower-files"'), form.indexOf("</form>", form.indexOf('id="tower-files"')));
assert.ok(/data-tower-compose-kind="personal"/.test(choice) && /data-tower-compose-kind="professional"/.test(choice));
assert.ok(/signal-subtab site-switch-side/.test(choice), "Personal | Professional tab style");
console.log("feed-photo-audience.test.js ok");
