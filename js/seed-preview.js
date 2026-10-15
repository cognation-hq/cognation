/**
 * Admin-only "View as seed-0001 (demo)" preview of ECHO + PULSE.
 * - Shown only when the server says this account is on the admin allowlist
 *   (rpc am_i_cognation_admin; no emails or ids in code).
 * - Read-only: one STABLE rpc (admin_seed_preview). Nothing is written as the
 *   seed; the viewer's account and friend graph are not touched.
 * - Banner with Exit. Nothing is persisted.
 */
(function () {
  "use strict";

  var FLEET_ID = "seed-0001";
  var overlay = null;

  function sb() {
    var c = window.CognationSupabase;
    return c && c.configured && c.configured() ? c : null;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function initials(name) {
    return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join("");
  }

  function pulseSvg(pulse) {
    var people = (pulse && pulse.people) || [];
    var links = (pulse && pulse.links) || [];
    var size = 320, r = 120, c = size / 2, pos = {};
    people.forEach(function (p, i) {
      var a = (i / Math.max(people.length, 1)) * Math.PI * 2 - Math.PI / 2;
      pos[p.profile_id] = { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
    });
    var lines = links.map(function (l) {
      var a = pos[l[0]], b = pos[l[1]];
      if (!a || !b) return "";
      return '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="rgba(168,244,255,.5)" stroke-width="1.5"/>';
    }).join("");
    var dots = people.map(function (p) {
      var q = pos[p.profile_id];
      return '<g><circle cx="' + q.x + '" cy="' + q.y + '" r="22" fill="#2a1d4f" stroke="#3de8ff" stroke-width="2"/>' +
        '<text x="' + q.x + '" y="' + (q.y + 5) + '" text-anchor="middle" fill="#e6dcff" font-size="13" font-weight="700">' + esc(initials(p.display_name)) + "</text>" +
        "<title>" + esc(p.display_name) + "</title></g>";
    }).join("");
    if (!people.length) return '<p class="seed-preview-empty">No friends on this seed.</p>';
    return '<svg class="seed-preview-pulse" viewBox="0 0 ' + size + " " + size + '" width="' + size + '" height="' + size + '" role="img" aria-label="PULSE ring">' +
      '<circle cx="' + c + '" cy="' + c + '" r="' + (r + 30) + '" fill="none" stroke="rgba(61,232,255,.4)" stroke-width="2"/>' + lines + dots + "</svg>";
  }

  function echoList(posts) {
    if (!posts || !posts.length) return '<p class="seed-preview-empty">No posts.</p>';
    return '<ul class="seed-preview-echo">' + posts.map(function (p) {
      return '<li><div class="seed-preview-meta"><strong>' + esc(p.author_name) + "</strong> @" + esc(p.author_handle) +
        ' <span class="seed-preview-rating">' + esc(p.rating) + "</span></div><div>" + esc(p.body) + "</div></li>";
    }).join("") + "</ul>";
  }

  function close() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    document.body.classList.remove("is-seed-preview");
  }

  function open() {
    var c = sb();
    if (!c || overlay) return;
    overlay = document.createElement("div");
    overlay.className = "seed-preview";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "View as " + FLEET_ID + " (demo)");
    overlay.innerHTML =
      '<div class="seed-preview-banner" data-seed-preview-banner>Viewing as ' + esc(FLEET_ID) +
      " (demo) — read-only preview. Your account is not changed." +
      ' <button type="button" class="seed-preview-exit" data-seed-preview-exit>Exit preview</button></div>' +
      '<div class="seed-preview-body"><p>Loading…</p></div>';
    document.body.appendChild(overlay);
    document.body.classList.add("is-seed-preview");
    overlay.querySelector("[data-seed-preview-exit]").addEventListener("click", close);
    c.rpc("admin_seed_preview", { fleet_id: FLEET_ID }).then(function (data) {
      if (!overlay) return;
      var title = data && data.seed ? esc(data.seed.display_name) + " @" + esc(data.seed.handle) : esc(FLEET_ID);
      overlay.querySelector(".seed-preview-body").innerHTML =
        '<h2 class="seed-preview-title">' + title + "</h2>" +
        '<section><h3>ECHO</h3>' + echoList(data && data.echo) + "</section>" +
        '<section><h3>PULSE</h3>' + pulseSvg(data && data.pulse) + "</section>";
    }, function (err) {
      if (!overlay) return;
      overlay.querySelector(".seed-preview-body").innerHTML =
        '<p class="seed-preview-empty">Preview unavailable: ' + esc((err && err.message) || "error") + "</p>";
    });
  }

  function addEntry() {
    if (document.querySelector("[data-seed-preview-open]")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "seed-preview-open";
    btn.setAttribute("data-seed-preview-open", "");
    btn.textContent = "View as " + FLEET_ID + " (demo)";
    btn.addEventListener("click", open);
    document.body.appendChild(btn);
  }

  /* Only the server decides who is an admin. */
  function check() {
    var c = sb();
    var s = window.CognationAuth && window.CognationAuth.getSession && window.CognationAuth.getSession();
    if (!c || !s || s.source !== "supabase") return;
    /* Missing RPC (404 PGRST202) is noise — never treat as auth failure. */
    c.rpc("am_i_cognation_admin", {}).then(function (yes) {
      if (yes === true) addEntry();
    }, function () { /* 404 / 401: stay quiet */ });
  }

  window.CognationSeedPreview = { open: open, close: close, FLEET_ID: FLEET_ID };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", check);
  else check();
  document.addEventListener("cognation:session-started", check);
  document.addEventListener("cognation:session-ended", function () {
    close();
    var b = document.querySelector("[data-seed-preview-open]");
    if (b && b.parentNode) b.parentNode.removeChild(b);
  });
})();
