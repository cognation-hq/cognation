/**
 * Forgot / reset password (Supabase GoTrue).
 *   1. POST /auth/v1/recover?redirect_to=<origin>/reset-password sends the email.
 *   2. The email link returns here with #access_token=…&type=recovery; PUT /auth/v1/user
 *      with that token sets the new password.
 * Same message whether or not the email has an account. Never logs the email or token.
 * Supabase Auth → URL Configuration must allow <origin>/reset-password as a redirect URL.
 */
(function (root) {
  "use strict";

  function cfg() {
    var c = root.CognationConfig || {};
    return { url: String(c.supabaseUrl || "").replace(/\/$/, ""), key: String(c.supabasePublishableKey || "") };
  }

  function redirectUrl(loc) {
    return loc.origin + "/reset-password";
  }

  function parseRecovery(hash) {
    var h = String(hash || "").replace(/^#/, "");
    var out = {};
    h.split("&").forEach(function (kv) {
      var i = kv.indexOf("=");
      if (i > 0) out[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
    });
    if (out.error_description) return { error: out.error_description.replace(/\+/g, " ") };
    if (out.type === "recovery" && out.access_token) return { token: out.access_token };
    return null;
  }

  function requestReset(fetchFn, c, email, redirect) {
    return fetchFn(c.url + "/auth/v1/recover?redirect_to=" + encodeURIComponent(redirect), {
      method: "POST",
      headers: { apikey: c.key, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email }),
    });
  }

  function setPassword(fetchFn, c, token, password) {
    return fetchFn(c.url + "/auth/v1/user", {
      method: "PUT",
      headers: { apikey: c.key, Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ password: password }),
    }).then(function (res) {
      if (res.ok) return { ok: true };
      return res.json().catch(function () { return {}; }).then(function (b) {
        return { ok: false, error: (b && (b.msg || b.message || b.error_description)) || "Could not save the new password. Ask for a new link." };
      });
    });
  }

  function boot() {
    var doc = root.document;
    var reqForm = doc.querySelector("[data-reset-request]");
    var setForm = doc.querySelector("[data-reset-set]");
    var status = doc.querySelector("[data-reset-status]");
    if (!reqForm || !setForm || !status) return;
    var c = cfg();
    var say = function (msg) { status.textContent = msg; };
    if (!/^https:\/\//.test(c.url) || !c.key) {
      say("Password reset is not available right now.");
      return;
    }

    var rec = parseRecovery(root.location.hash);
    var token = rec && rec.token;
    if (rec && rec.error) say(rec.error + " Ask for a new link below.");
    if (token) {
      /* Keep the token out of the address bar and history. */
      try { root.history.replaceState(null, "", root.location.pathname); } catch (e) {}
      reqForm.hidden = true;
      setForm.hidden = false;
    }

    reqForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var email = String(reqForm.email.value || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return say("Enter a valid email.");
      reqForm.querySelector("button").disabled = true;
      requestReset(root.fetch.bind(root), c, email, redirectUrl(root.location))
        .catch(function () {})
        .then(function () {
          say("If that email has a Cognation account, a reset link is on its way. Check your inbox and spam folder.");
          reqForm.querySelector("button").disabled = false;
        });
    });

    setForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var pw = String(setForm.password.value || "");
      if (pw.length < 8) return say("Use at least 8 characters.");
      if (pw !== String(setForm.confirm.value || "")) return say("The passwords don't match.");
      setForm.querySelector("button").disabled = true;
      setPassword(root.fetch.bind(root), c, token, pw).then(function (r) {
        setForm.querySelector("button").disabled = false;
        if (!r.ok) return say(r.error);
        setForm.hidden = true;
        say("Your password is updated. Sign in with it on the website or the app.");
      }, function () {
        setForm.querySelector("button").disabled = false;
        say("Could not reach Cognation. Try again.");
      });
    });
  }

  var api = { parseRecovery: parseRecovery, redirectUrl: redirectUrl, requestReset: requestReset, setPassword: setPassword };
  root.CognationPasswordReset = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})(typeof window !== "undefined" ? window : this);
