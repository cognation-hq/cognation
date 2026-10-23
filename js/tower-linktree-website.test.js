/* Shop, Linktree, and Apple Pay are professional-page buttons. A sold bid is amount plus goods. */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.ok(/\{ id: "linktree", label: "Linktree"/.test(tower), "linktree id kept, label Linktree");
assert.ok(/data-tower-social="shop"/.test(html) && /data-tower-social="applepay"/.test(html) && /data-tower-social="applefor"/.test(html), "Shop, Apple Pay, and goods fields");
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

var mem = {};
var pay = vm.createContext({
  URL: URL,
  sessionStorage: {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
  },
});
vm.runInContext([
  grab("hasCardNumber"), grab("plainLabel"), grab("soldBidAmount"), grab("normalizeSoldBid"),
  grab("acceptSoldBid"), grab("readSoldBid"), grab("proPayAttempt"),
  "this.store = function (id, v) { return id === 'applepay' || id === 'applefor' ? plainLabel(v, 120) : ''; };",
  "this.accept = acceptSoldBid; this.read = readSoldBid; this.pay = proPayAttempt; this.norm = normalizeSoldBid;",
].join("\n"), pay);
assert.strictEqual(pay.store("applepay", "4111111111111111"), "", "card number is not stored");
assert.strictEqual(pay.store("applepay", "Prada"), "Prada", "payee name is saved");
var sale = pay.accept({ amount: "$50,000", description: "five software developers and a leftover website", profileId: "co", email: "co@example.com" });
assert.strictEqual(sale.amount, "$50,000");
assert.strictEqual(sale.description, "five software developers and a leftover website");
assert.strictEqual(sale.profileId, "co");
assert.strictEqual(sale.email, undefined, "sold bid does not take an email");
assert.strictEqual(pay.read({ _profileId: "co" }).amount, "$50,000", "that bid is what Apple Pay uses");
assert.strictEqual(pay.read({ _profileId: "other" }), null, "another page does not pick up the bid");
assert.strictEqual(pay.accept({ amount: 50000 }), null, "amount alone is not a sold bid");
assert.strictEqual(pay.pay({ signedIn: false, phase: "confirm", forText: "coat" }).text, "Sign in to pay. No payment was taken.");
assert.strictEqual(pay.pay({ signedIn: true, owner: true, phase: "confirm", forText: "coat" }).text, "Only the payer can start this. No payment was taken.");
assert.strictEqual(pay.pay({ signedIn: true, phase: "confirm", forText: "  " }).text, "Name what this payment is for. No payment was taken.");
var done = pay.pay({ signedIn: true, phase: "confirm", forText: sale.description });
assert.strictEqual(done.taken, false);
assert.strictEqual(done.text, "No payment was taken.");
assert.ok(!/receipt|issued|paid|success/i.test(done.text), "no pretend receipt");
assert.ok(/Apple Pay " \+ sold\.amount/.test(tower), "button shows the sold amount");
assert.ok(/isProTower\(p\)/.test(tower.slice(tower.indexOf("function renderProLinks"), tower.indexOf("function renderSocialLinks"))), "personal page does not get the buttons");
console.log("tower-linktree-website.test.js: OK");
