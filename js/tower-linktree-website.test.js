/* Shop, Linktree, and an Apple Pay amount the professional typed. A sale is not on the profile. */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.ok(/\{ id: "linktree", label: "Linktree"/.test(tower), "linktree id kept, label Linktree");
assert.ok(/data-tower-social="shop"/.test(html) && /data-tower-social="applepay"/.test(html) && /data-tower-social="appleamt"/.test(html), "Shop, Apple Pay, and amount");
assert.ok(!/data-tower-social="applefor"|Goods or services/.test(html), "what sold is not a profile field");
function grab(name) {
  var s = tower.indexOf("function " + name + "(");
  var depth = 0, i = tower.indexOf("{", s);
  for (; i < tower.length; i++) { if (tower[i] === "{") depth++; else if (tower[i] === "}" && --depth === 0) break; }
  return tower.slice(s, i + 1);
}
var ctx = vm.createContext({ URL: URL });
vm.runInContext([grab("safeHttpUrl"), grab("safeHttpsUrl"), grab("venmoHref"), grab("hasCardNumber"), grab("plainLabel"), grab("typedAmount"), grab("socialHref"), grab("storedSocialValue"),
  "this.store = storedSocialValue; this.href = socialHref;"].join("\n"), ctx);
var saved = ctx.store("linktree", "linktr.ee/alexa");
assert.strictEqual(saved, "https://linktr.ee/alexa", "Linktree URL saves under Website");
assert.strictEqual(ctx.href("linktree", saved), "https://linktr.ee/alexa", "Website chip opens the Linktree URL");
assert.strictEqual(ctx.store("linktree", "javascript:alert(1)"), "", "unsafe scheme rejected");
assert.strictEqual(ctx.store("applepay", "4111111111111111"), "", "card number is not stored");
assert.strictEqual(ctx.store("applepay", "Prada"), "Prada", "payee name is saved");
assert.strictEqual(ctx.store("appleamt", "") === "" && ctx.store("appleamt", "890") === "$890", true, "typed amount, or nothing");
var pay = vm.createContext({ URL: URL });
vm.runInContext([grab("hasCardNumber"), grab("plainLabel"), grab("proPayAttempt"), "this.pay = proPayAttempt;"].join("\n"), pay);
assert.strictEqual(pay.pay({ signedIn: false, phase: "confirm", forText: "coat" }).text, "Sign in to pay. No payment was taken.");
assert.strictEqual(pay.pay({ signedIn: true, owner: true, phase: "confirm", forText: "coat" }).text, "Only the payer can start this. No payment was taken.");
assert.strictEqual(pay.pay({ signedIn: true, phase: "confirm", forText: "  " }).text, "Name what this payment is for. No payment was taken.");
var done = pay.pay({ signedIn: true, phase: "confirm", forText: "wool coat" });
assert.strictEqual(done.taken, false);
assert.strictEqual(done.text, "No payment was taken.");
assert.ok(!/receipt|issued|paid|success/i.test(done.text), "no pretend receipt");
var pro = tower.slice(tower.indexOf("function renderProLinks"), tower.indexOf("function renderSocialLinks"));
assert.ok(/Apple Pay " \+ amount/.test(pro), "button shows the typed amount");
assert.ok(!/readSoldBid|acceptSoldBid|applefor|sold-bid/.test(pro), "an auction sale does not fill the profile");
assert.ok(!/five software developers|\$50,000|CognationSoldBid/.test(tower + html), "the example sale is not a listing");
assert.ok(/isProTower\(p\)/.test(pro), "personal page does not get the buttons");
console.log("tower-linktree-website.test.js: OK");
