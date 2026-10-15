/**
 * Private Investigator review page. Access is decided only by
 * am_i_cognation_investigator() (server allowlist). No emails or user ids
 * are printed. Until the SQL runs / the viewer is allowlisted, the page stays
 * closed (fail closed).
 */
(function () {
  "use strict";

  var statusEl = document.querySelector("[data-inv-status]");
  var listEl = document.querySelector("[data-inv-list]");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function sb() {
    var c = window.CognationSupabase;
    return c && c.configured && c.configured() ? c : null;
  }
  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || "";
  }

  function renderItem(item) {
    var kind = String(item.kind || "");
    var source = kind === "report" ? "report" : "rating";
    var tags = '<span class="inv-tag">' + esc(kind) + "</span>";
    if (item.reason) tags += '<span class="inv-tag">' + esc(item.reason) + "</span>";
    if (item.rating) tags += '<span class="inv-tag">rating ' + esc(item.rating) + "</span>";
    if (item.rating_confidence === "low") tags += '<span class="inv-tag">low confidence</span>';
    if (item.reporter_is_seed) tags += '<span class="inv-tag">seed reporter</span>';
    if (item.post_hidden) tags += '<span class="inv-tag">hidden</span>';
    if (item.hidden_attachment_indexes && item.hidden_attachment_indexes.length) {
      tags += '<span class="inv-tag">image hidden</span>';
    }
    var who = esc(item.author_name || "") + " @" + esc(item.author_handle || "");
    var el = document.createElement("article");
    el.className = "inv-item";
    el.innerHTML =
      '<div class="inv-meta">' + tags + " · " + who + " · " + esc(item.created_at || "") + "</div>" +
      '<div class="inv-body">' + esc(item.body_preview || "") + "</div>" +
      '<div class="inv-actions">' +
      '<label>Rating <select data-inv-rating>' +
      ["G", "PG", "PG-13", "R", "MA", "NR"].map(function (r) {
        return '<option value="' + r + '"' + (r === item.rating ? " selected" : "") + ">" + r + "</option>";
      }).join("") +
      "</select></label>" +
      '<input type="text" data-inv-reason maxlength="200" placeholder="Required reason" aria-label="Reason">' +
      '<button type="button" class="btn btn-primary" data-inv-act="set_rating">Set rating</button>' +
      '<button type="button" class="btn" data-inv-act="restore">Restore</button>' +
      '<button type="button" class="btn" data-inv-act="dismiss">Dismiss</button>' +
      (item.reason === "illegal_image"
        ? '<button type="button" class="btn" data-inv-act="confirm_illegal">Confirm illegal (freeze)</button>'
        : "") +
      "</div>";
    el.querySelectorAll("[data-inv-act]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var reason = (el.querySelector("[data-inv-reason]") || {}).value || "";
        var rating = (el.querySelector("[data-inv-rating]") || {}).value || null;
        var act = btn.getAttribute("data-inv-act");
        if (!String(reason).trim()) {
          setStatus("A short reason is required.");
          return;
        }
        btn.disabled = true;
        sb()
          .rpc("investigator_decide", {
            queue_id: item.id,
            queue_source: source,
            action: act,
            new_rating: act === "set_rating" ? rating : null,
            reason: String(reason).trim().slice(0, 200),
          })
          .then(function () {
            el.remove();
            setStatus("Saved.");
            if (!listEl.querySelector(".inv-item")) setStatus("Queue is empty.");
          }, function (err) {
            btn.disabled = false;
            setStatus((err && err.message) || "Could not save.");
          });
      });
    });
    return el;
  }

  function loadQueue() {
    return sb()
      .rpc("investigator_list_queue", {})
      .then(function (rows) {
        listEl.hidden = false;
        listEl.innerHTML = "";
        var list = Array.isArray(rows) ? rows : [];
        if (!list.length) {
          setStatus("Queue is empty.");
          return;
        }
        setStatus(list.length + " open item" + (list.length === 1 ? "" : "s") + ".");
        list.forEach(function (item) {
          listEl.appendChild(renderItem(item));
        });
      });
  }

  function boot() {
    var c = sb();
    if (!c) {
      setStatus("Sign in is not configured.");
      return;
    }
    c.rpc("am_i_cognation_investigator", {}).then(
      function (yes) {
        if (yes !== true) {
          setStatus("This page is only for Cognation Investigators.");
          return;
        }
        setStatus("Loading queue…");
        return loadQueue();
      },
      function () {
        /* Fail closed until the SQL is run / the function exists. */
        setStatus("This page is only for Cognation Investigators.");
      }
    );
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
