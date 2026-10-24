/**
 * Apple Pay in a message thread. The signed-in person pays the other person.
 * The other person cannot pull. The sheet on this device (Face ID or Touch ID)
 * is required. A login session never charges. Card numbers are not stored.
 */
(function () {
  "use strict";
  var NOT_READY = "Apple Pay isn't set up on Cognation yet. No payment was taken.";
  var DEVICE = "Apple Pay opens on this device with Face ID or Touch ID. No payment was taken.";
  var DECLINED = "Payment didn't go through. Nothing was charged.";

  function cfg() {
    var c = window.CognationConfig || {};
    var processor = String(c.applePayProcessor || "").trim();
    return {
      merchantId: String(c.applePayMerchantId || "").trim(),
      processor: /^https:\/\//.test(processor) ? processor.replace(/\/$/, "") : "",
    };
  }
  function ready() { var c = cfg(); return !!(c.merchantId && c.processor); }
  function me() {
    try {
      var s = window.CognationSupabase && window.CognationSupabase.getSession();
      return s && s.user && s.user.id ? String(s.user.id) : "";
    } catch (e) { return ""; }
  }
  /** Payer is the signed-in person. Payee is the other person in the thread. */
  function gate(thread) {
    var payer = me();
    var payee = thread && thread.peerUserId ? String(thread.peerUserId) : "";
    if (!payer) return { ok: false, state: "signed-out", message: "Sign in to pay with Apple Pay." };
    if (!payee || payee === payer) return { ok: false, state: "refused", message: "You can only pay the other person in this thread." };
    if (!ready()) return { ok: false, state: "not-configured", message: NOT_READY };
    return { ok: true, payerId: payer, payeeId: payee };
  }
  function cents(raw) {
    var n = Number(String(raw == null ? "" : raw).replace(/[^0-9.]/g, ""));
    if (!isFinite(n)) return 0;
    var value = Math.round(n * 100);
    return value >= 100 && value <= 50000 ? value : 0;
  }
  function post(path, body) {
    return fetch(cfg().processor + path, {
      method: "POST", credentials: "omit", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }).then(function (res) { return res.json(); });
  }
  function sheet(auth, amount) {
    var Session = window.ApplePaySession;
    if (typeof Session !== "function") return Promise.resolve({ ok: false, state: "needs-device", message: DEVICE });
    return new Promise(function (resolve) {
      var session, done = false, failed = false;
      function finish(result) { if (!done) { done = true; resolve(result); } }
      function stop(afterAuth) {
        failed = true;
        try { afterAuth ? session.completePayment(Session.STATUS_FAILURE) : session.abort(); } catch (e) {}
        finish({ ok: false, state: "declined", message: DECLINED });
      }
      try {
        session = new Session(3, {
          countryCode: "US", currencyCode: "USD", merchantCapabilities: ["supports3DS"],
          supportedNetworks: ["visa", "masterCard", "amex", "discover"],
          total: { label: "Cognation", amount: amount },
        });
      } catch (e) { finish({ ok: false, state: "needs-device", message: DEVICE }); return; }
      session.onvalidatemerchant = function (ev) {
        var validationURL = ev && ev.validationURL;
        if (!/^https:\/\//.test(validationURL || "")) { stop(false); return; }
        post("/apple-pay/merchant-session", {
          validationURL: validationURL, merchantId: cfg().merchantId, payerId: auth.payerId, payeeId: auth.payeeId,
        }).then(function (body) {
          if (failed) return;
          if (body && body.merchantSession) session.completeMerchantValidation(body.merchantSession);
          else stop(false);
        }).catch(function () { if (!failed) stop(false); });
      };
      session.onpaymentauthorized = function (ev) {
        var token = ev && ev.payment && ev.payment.token;
        if (failed || !token) { if (!failed) stop(true); return; }
        post("/apple-pay/pay", { token: token, amount: amount, payerId: auth.payerId, payeeId: auth.payeeId }).then(function (body) {
          if (failed) return;
          if (body && body.paid === true) {
            try { session.completePayment(Session.STATUS_SUCCESS); } catch (e) {}
            finish({ ok: true, state: "paid", message: "Paid with Apple Pay." });
          } else stop(true);
        }).catch(function () { if (!failed) stop(true); });
      };
      session.oncancel = function () { finish({ ok: false, state: "cancelled", message: "Payment cancelled. Nothing was charged." }); };
      try { session.begin(); } catch (e) { finish({ ok: false, state: "needs-device", message: DEVICE }); }
    });
  }
  function payThread(thread, raw) {
    var auth = gate(thread);
    if (!auth.ok) return Promise.resolve(auth);
    var value = cents(raw);
    if (!value) return Promise.resolve({ ok: false, state: "bad-amount", message: "Enter an amount from $1 to $500." });
    return sheet(auth, (value / 100).toFixed(2));
  }
  function activeThread() {
    var store = window.CognationMessageStore;
    if (!store || !store.getActiveId || !store.getConversation) return null;
    return store.getConversation(store.getActiveId());
  }
  function mount(root) {
    var form = root.querySelector("[data-commune-compose]");
    if (!form || root.querySelector("[data-apple-pay]")) return;
    var row = document.createElement("div");
    row.className = "message-apple-pay";
    row.setAttribute("data-apple-pay-row", "");
    row.innerHTML = '<label>Amount <input data-apple-pay-amount inputmode="decimal" maxlength="7" placeholder="0.00" autocomplete="off" aria-label="Amount in dollars"></label><button type="button" data-apple-pay aria-label="Pay the other person in this thread with Apple Pay">Apple Pay</button><p data-apple-pay-note role="status"></p>';
    form.insertAdjacentElement("afterend", row);
    var note = row.querySelector("[data-apple-pay-note]");
    if (!ready()) note.textContent = NOT_READY;
    row.querySelector("[data-apple-pay]").addEventListener("click", function () {
      payThread(activeThread(), row.querySelector("[data-apple-pay-amount]").value).then(function (res) {
        note.textContent = (res && res.message) || NOT_READY;
      });
    });
  }
  function boot() {
    var nodes = document.querySelectorAll("[data-commune-messaging]");
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }
  window.CognationMessageApplePay = { ready: ready, gate: gate, payThread: payThread, NOT_READY: NOT_READY };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
