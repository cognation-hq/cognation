/* Linktree is labeled "Website" on Tower; a Linktree URL must still save and open. */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
assert.ok(/\{ id: "linktree", label: "Website"/.test(tower), "linktree id kept, label Website");
function grab(name) {
  var s = tower.indexOf("function " + name + "(");
  var depth = 0, i = tower.indexOf("{", s);
  for (; i < tower.length; i++) { if (tower[i] === "{") depth++; else if (tower[i] === "}" && --depth === 0) break; }
  return tower.slice(s, i + 1);
}
var ctx = vm.createContext({ URL: URL });
vm.runInContext([grab("safeHttpUrl"), grab("safeHttpsUrl"), grab("venmoHref"), grab("socialHref"), grab("storedSocialValue"),
  "this.store = storedSocialValue; this.href = socialHref;"].join("\n"), ctx);
var saved = ctx.store("linktree", "linktr.ee/alexa");
assert.strictEqual(saved, "https://linktr.ee/alexa", "Linktree URL saves under Website");
assert.strictEqual(ctx.href("linktree", saved), "https://linktr.ee/alexa", "Website chip opens the Linktree URL");
assert.strictEqual(ctx.store("linktree", "javascript:alert(1)"), "", "unsafe scheme rejected");
console.log("tower-linktree-website.test.js: OK");
