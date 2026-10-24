/**
 * Apple Pay in a thread. Run: node js/message-apple-pay.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var ME = "11111111-1111-4111-8111-111111111111";
var PEER = "22222222-2222-4222-8222-222222222222";
var FULL = { applePayMerchantId: "merchant.com.cognation", applePayProcessor: "https://pay.example/cognation" };
var session = { access_token: "stolen-session", user: { id: ME } };
var thread = { peerUserId: PEER };

function load(opts) {
  opts = opts || {};
  var fetches = [], sessions = [];
  function Session(version, request) { this.version = version; this.request = request; sessions.push(this); }
  Session.STATUS_SUCCESS = 1; Session.STATUS_FAILURE = 2;
  Session.prototype.begin = function () { this.began = true; if (opts.onBegin) opts.onBegin(this); };
  Session.prototype.abort = function () { this.aborted = true; };
  Session.prototype.completeMerchantValidation = function (merchantSession) {
    this.merchant = merchantSession;
    if (opts.afterMerchant) opts.afterMerchant(this);
  };
  Session.prototype.completePayment = function (status) { this.completed = status; };
  var windowStub = {
    CognationConfig: opts.config || {},
    CognationSupabase: { getSession: function () { return opts.session || null; } },
    fetch: function (url, init) {
      fetches.push({ url: String(url), init: init });
      var body = /\/pay$/.test(url) ? (opts.payResult || { paid: false }) : (opts.merchantResult || { error: true });
      return Promise.resolve({ json: function () { return Promise.resolve(body); } });
    },
  };
  if (!opts.noSheet) windowStub.ApplePaySession = Session;
  var ctx = vm.createContext({
    window: windowStub, fetch: windowStub.fetch, Promise: Promise, console: console,
    document: { readyState: "complete", querySelectorAll: function () { return []; }, addEventListener: function () {} },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "message-apple-pay.js"), "utf8"), ctx);
  return { api: windowStub.CognationMessageApplePay, fetches: fetches, sessions: sessions };
}
function sheetOpts(extra) {
  return Object.assign({
    session: session, config: FULL, merchantResult: { merchantSession: { epochTimestamp: 1 } },
    onBegin: function (s) { s.onvalidatemerchant({ validationURL: "https://apple.example/validate" }); },
  }, extra);
}

(async function () {
  var src = fs.readFileSync(path.join(__dirname, "message-apple-pay.js"), "utf8");
  assert.ok(!/localStorage|cardNumber|primaryAccountNumber/.test(src), "no card storage");
  assert.ok(src.indexOf('credentials: "omit"') !== -1, "login cookie is not sent");
  var runtime = fs.readFileSync(path.join(__dirname, "../functions/runtime-config.js"), "utf8");
  assert.ok(/APPLE_PAY_MERCHANT_ID/.test(runtime) && /APPLE_PAY_PROCESSOR/.test(runtime));

  var missing = load({ session: session });
  var notReady = await missing.api.payThread(thread, "12");
  assert.strictEqual(notReady.state, "not-configured");
  assert.ok(!/paid|success/i.test(notReady.message), "not configured is not a success");
  assert.strictEqual(missing.sessions.length + missing.fetches.length, 0, "session alone does not charge");
  assert.strictEqual((await load({ session: session, config: { applePayMerchantId: FULL.applePayMerchantId } }).api.payThread(thread, "12")).state, "not-configured");
  assert.strictEqual((await load({ session: session, config: { applePayMerchantId: "m", applePayProcessor: "http://pay.example" } }).api.payThread(thread, "12")).state, "not-configured");
  assert.strictEqual((await load({}).api.payThread(thread, "12")).state, "signed-out");
  var selfPay = load({ session: session, config: FULL });
  assert.strictEqual((await selfPay.api.payThread({ peerUserId: ME }, "12")).state, "refused");
  assert.strictEqual(selfPay.sessions.length, 0, "cannot pay yourself");
  assert.strictEqual((await load({ session: session, config: FULL }).api.payThread(thread, "")).state, "bad-amount");
  var noSheet = load({ session: session, config: FULL, noSheet: true });
  assert.strictEqual((await noSheet.api.payThread(thread, "10")).state, "needs-device");
  assert.strictEqual(noSheet.fetches.length, 0, "no sheet means no charge");

  var declined = load(sheetOpts({
    payResult: { paid: false },
    afterMerchant: function (s) { s.onpaymentauthorized({ payment: { token: { paymentData: "tok" } } }); },
  }));
  assert.strictEqual((await declined.api.payThread(thread, "12.50")).ok, false);
  assert.notStrictEqual(declined.sessions[0].completed, 1);
  var body = JSON.parse(declined.fetches[declined.fetches.length - 1].init.body);
  assert.strictEqual(declined.fetches[0].init.credentials, "omit");
  assert.deepStrictEqual([body.payerId, body.payeeId], [ME, PEER]);
  assert.ok(body.token && !body.access_token && !body.cardNumber);

  var paid = load(sheetOpts({
    payResult: { paid: true },
    afterMerchant: function (s) { s.onpaymentauthorized({ payment: { token: { paymentData: "tok" } } }); },
  }));
  assert.strictEqual((await paid.api.payThread(thread, "4")).state, "paid");
  assert.strictEqual(paid.sessions[0].began && paid.sessions[0].completed, 1);

  var bare = load(sheetOpts({ afterMerchant: function (s) { s.onpaymentauthorized({ payment: {} }); } }));
  assert.strictEqual((await bare.api.payThread(thread, "4")).ok, false);
  assert.ok(!bare.fetches.some(function (call) { return /\/pay$/.test(call.url); }), "missing token is not charged");
  console.log("message apple pay tests passed");
})().catch(function (error) { console.error(error); process.exit(1); });
