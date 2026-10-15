/**
 * Private Investigator review page. Access is decided only by
 * am_i_cognation_investigator() (server allowlist). No mailbox addresses or
 * user ids are printed. Fail closed until allowlisted.
 *
 * After Confirm illegal: pattern-check other posts/attachments (metadata only).
 * Illegal trend/duplicates → auto-generate incident report (username + findings),
 * freeze account and hide from public. Never delete account/content.
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

  function renderPatternPanel(postId, triggerEl) {
    var panel = document.createElement("article");
    panel.className = "inv-item inv-pattern";
    panel.innerHTML =
      '<div class="inv-meta"><span class="inv-tag">pattern check</span> Trends or duplicates? (illegal only)</div>' +
      '<div data-inv-pattern-body class="inv-body">Loading…</div>' +
      '<div class="inv-actions">' +
      '<input type="text" data-inv-findings maxlength="2000" placeholder="What was found (required)" aria-label="Findings">' +
      '<button type="button" class="btn inv-btn-danger" data-inv-incident disabled>Generate incident report + freeze/hide</button>' +
      '<button type="button" class="btn" data-inv-pattern-close>No trend — done</button>' +
      "</div>";
    if (triggerEl && triggerEl.parentNode) triggerEl.parentNode.replaceChild(panel, triggerEl);
    else listEl.appendChild(panel);

    var bodyEl = panel.querySelector("[data-inv-pattern-body]");
    var findingsEl = panel.querySelector("[data-inv-findings]");
    var actBtn = panel.querySelector("[data-inv-incident]");

    panel.querySelector("[data-inv-pattern-close]").addEventListener("click", function () {
      panel.remove();
      if (!listEl.querySelector(".inv-item")) setStatus("Queue is empty.");
      else setStatus("Saved. Pattern check closed.");
    });

    actBtn.addEventListener("click", function () {
      var findings = String((findingsEl && findingsEl.value) || "").trim();
      if (!findings) {
        setStatus("Describe what was found to generate the incident report.");
        return;
      }
      actBtn.disabled = true;
      sb()
        .rpc("investigator_incident_takedown", {
          post_id: postId,
          findings: findings.slice(0, 2000),
        })
        .then(function (res) {
          var handle = res && res.handle ? String(res.handle) : "";
          panel.remove();
          setStatus(
            "Incident report generated for @" + handle +
              ". Account frozen and hidden from public (content kept for evidence)."
          );
        }, function (err) {
          actBtn.disabled = false;
          setStatus((err && err.message) || "Could not generate incident report.");
        });
    });

    sb()
      .rpc("investigator_pattern_check", { post_id: postId })
      .then(function (data) {
        var posts = (data && data.posts) || [];
        var handle = data && data.handle ? String(data.handle) : "";
        var lines = posts.map(function (p) {
          var atts = Array.isArray(p.attachments) ? p.attachments : [];
          var attLine = atts.length
            ? atts.map(function (a) {
                return (a.kind || "file") + ":" + (a.name || "?");
              }).join(", ")
            : "no attachments";
          return (
            (p.is_trigger_post ? "★ " : "· ") +
            esc(p.body_preview || "(empty)") +
            "\n  " + esc(p.rating || "") +
            (p.hidden ? " · hidden" : "") +
            " · " + esc(attLine)
          );
        });
        bodyEl.innerHTML =
          "<strong>@" + esc(handle) + "</strong> — " + posts.length +
          " post" + (posts.length === 1 ? "" : "s") +
          " (names/kinds only; no image bytes)<pre class=\"inv-pattern-pre\">" +
          (lines.length ? lines.join("\n\n") : "No other posts.") +
          "</pre>";
        actBtn.disabled = false;
        setStatus(
          "Pattern check ready for @" + handle +
            ". Only if you see a trend or duplicates: generate incident report + freeze/hide."
        );
      }, function (err) {
        bodyEl.textContent = (err && err.message) || "Could not load pattern check.";
        setStatus("Pattern check failed.");
      });
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
        ? '<button type="button" class="btn inv-btn-danger" data-inv-act="confirm_illegal">Confirm illegal (freeze)</button>'
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
            if (act === "confirm_illegal" && item.post_id) {
              setStatus("Confirmed illegal. Running pattern check…");
              renderPatternPanel(item.post_id, el);
              return;
            }
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
        setStatus("This page is only for Cognation Investigators.");
      }
    );
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
