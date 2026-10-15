/**
 * Server profile photo (profiles.photo_url) for PULSE Tower picture circles.
 * Owner writes their own photo URL; anyone reads it. https only, <= 500 chars.
 * SQL: supabase/migrations/20261016_profiles_photo_url.sql (run by hand).
 * Run: node js/profile-photo.test.js
 */
(function (root) {
  "use strict";
  var MAX = 500;
  function clean(url) {
    var u = String(url == null ? "" : url).trim();
    if (!u || u.length > MAX) return "";
    if (!/^https:\/\/[^\s"'<>()]+$/.test(u)) return "";
    return u;
  }
  function safeId(v) {
    v = String(v || "");
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : "";
  }
  /* Writes only the signed-in person's own personal profile row (RLS enforces it too). */
  function saveOwnPhoto(client, ownUserId, url) {
    var id = safeId(ownUserId);
    var value = url === null || url === "" ? null : clean(url);
    if (!id) return Promise.resolve({ ok: false, error: "not_signed_in" });
    if (value === "") return Promise.resolve({ ok: false, error: "invalid_url" });
    if (!client || typeof client.rest !== "function") return Promise.resolve({ ok: false, error: "no_client" });
    return client.rest("profiles", {
      method: "PATCH",
      query: "user_id=eq." + id + "&kind=eq.personal",
      body: { photo_url: value },
    }).then(function () { return { ok: true, photoUrl: value }; },
      function () { return { ok: false, error: "save_failed" }; });
  }
  /* Paint a circle with the photo; returns false so callers keep letters. */
  function applyPhoto(el, url) {
    var u = clean(url);
    if (!el || !u) return false;
    el.textContent = "";
    el.style.backgroundImage = 'url("' + u + '")';
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
    el.setAttribute("data-pulse-photo", "");
    return true;
  }
  var api = { clean: clean, saveOwnPhoto: saveOwnPhoto, applyPhoto: applyPhoto, max: MAX };
  if (root) root.CognationProfilePhoto = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
