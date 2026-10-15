/**
 * 13+ signup gate (Alexa lock, 2026-10-14).
 * - Birthdate is asked neutrally; the cutoff lives only here, never in UI copy.
 * - Under 13: nothing typed is sent anywhere or stored. Only a short device
 *   flag (localStorage + cookie, 24h) is set so the signup form keeps showing
 *   the block instead of allowing an immediate retry with another date.
 * - Email fingerprint check: POST /api/signup-check (server-side HMAC). The
 *   browser never sees the secret or the fingerprint.
 * Existing under-13 content filters elsewhere are unchanged (backstop).
 */
(function (root) {
  "use strict";

  var MIN_AGE = 13;
  var FLAG_KEY = "cognation.signup.hold.v1";
  var COOKIE_NAME = "cg_signup_hold";
  var HOLD_MS = 24 * 60 * 60 * 1000;

  function parseBirthdate(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }

  /* Whole years on the local calendar date of `now`. null if invalid/future/implausible. */
  function ageFromBirthdate(value, now) {
    var b = parseBirthdate(value);
    if (!b) return null;
    now = now instanceof Date ? now : new Date();
    var ny = now.getFullYear(), nm = now.getMonth() + 1, nd = now.getDate();
    var age = ny - b.y;
    if (nm < b.m || (nm === b.m && nd < b.d)) age -= 1;
    if (age < 0 || age > 120) return null;
    return age;
  }

  function isUnderMin(value, now) {
    var age = ageFromBirthdate(value, now);
    return age !== null && age < MIN_AGE;
  }

  function readCookie(doc) {
    try {
      var m = new RegExp("(?:^|;\\s*)" + COOKIE_NAME + "=(\\d+)").exec((doc && doc.cookie) || "");
      return m ? +m[1] : 0;
    } catch (e) {
      return 0;
    }
  }

  function isHeld(storage, doc, nowMs) {
    nowMs = nowMs == null ? Date.now() : nowMs;
    var until = 0;
    try {
      until = +(storage && storage.getItem(FLAG_KEY)) || 0;
    } catch (e) {}
    until = Math.max(until, readCookie(doc));
    return until > nowMs;
  }

  function setHold(storage, doc, nowMs) {
    nowMs = nowMs == null ? Date.now() : nowMs;
    var until = nowMs + HOLD_MS;
    try {
      if (storage) storage.setItem(FLAG_KEY, String(until));
    } catch (e) {}
    try {
      if (doc) {
        doc.cookie =
          COOKIE_NAME + "=" + until + "; Max-Age=" + Math.floor(HOLD_MS / 1000) + "; Path=/; SameSite=Lax";
      }
    } catch (e2) {}
    return until;
  }

  /* Server-side fingerprint check. Resolves true only when the server says the
     email is blocked; network or config errors resolve false (the client-side
     age gate and existing filters still apply). */
  function checkEmailBlocked(email, fetchImpl) {
    fetchImpl = fetchImpl || (root && root.fetch && root.fetch.bind(root));
    if (!fetchImpl || !email) return Promise.resolve(false);
    return fetchImpl("/api/signup-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: String(email) }),
    })
      .then(function (r) {
        return r && r.ok ? r.json() : null;
      })
      .then(function (body) {
        return !!(body && body.blocked === true);
      })
      .catch(function () {
        return false;
      });
  }

  var api = {
    FLAG_KEY: FLAG_KEY,
    COOKIE_NAME: COOKIE_NAME,
    HOLD_MS: HOLD_MS,
    BLOCK_MESSAGE: "Cognation is for ages 13 and up.",
    parseBirthdate: parseBirthdate,
    ageFromBirthdate: ageFromBirthdate,
    isUnderMin: isUnderMin,
    isHeld: isHeld,
    setHold: setHold,
    checkEmailBlocked: checkEmailBlocked,
  };
  if (root) root.CognationAgeGate = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : null);
