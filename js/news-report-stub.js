/**
 * CGN-009 — NEWS story report control.
 * Hooks: [data-news-report], [data-news-report-reason="harmful|untruthful|misrated"],
 * ("misrated" is the "Not right for my age" option; same reason the server's
 * report_tower_post already accepts),
 * [data-news-post] + data-post-id. Files through CognationContentReport.reportTowerPost
 * (report_tower_post RPC -> content_reports) with the real Tower post id; the
 * "Reported" line shows only after the server accepts it. Then it is remembered
 * on this device via CognationModeration.enqueue (serverFiled, no second call).
 * No user bans.
 */
(function () {
  "use strict";

  var REASON_LABELS = {
    harmful: "Harmful",
    untruthful: "Untruthful",
    misrated: "Not right for my age",
  };

  var REPORT_FAILED = "Couldn't send report, try again";
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /* The Times prints Tower posts under display ids ("from-tower-personal-<uuid>",
     Statewide Refresh copies "statewide-refresh-…"). The server only knows the
     Tower post id: data-tower-post-id (commune.js), else the uuid after a
     from-tower-<kind>- prefix on the post id or its story key. */
  function serverPostId(post) {
    if (!post) return "";
    var direct = post.getAttribute("data-tower-post-id") || "";
    if (UUID_RE.test(direct)) return direct;
    var ids = [post.getAttribute("data-post-id") || "", post.getAttribute("data-news-story-key") || ""];
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (UUID_RE.test(id)) return id;
      var m = /^from-tower-[a-z]+-(.+)$/i.exec(id);
      if (m && UUID_RE.test(m[1])) return m[1];
    }
    return "";
  }

  /* Resolves only when the server filed the report (report_tower_post RPC ->
     content_reports, the Investigator queue). */
  window.CognationNewsStoryReport = { serverPostId: serverPostId, REPORT_FAILED: REPORT_FAILED };

  function sendServerReport(post, reason, note) {
    var api = window.CognationContentReport;
    var id = serverPostId(post);
    if (!api || typeof api.reportTowerPost !== "function") return Promise.reject(new Error("report_unavailable"));
    if (!id) return Promise.reject(new Error("no_server_post"));
    try {
      return Promise.resolve(api.reportTowerPost({ postId: id, reason: reason, note: note }));
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function closestPost(el) {
    return el && el.closest("[data-news-post], .paper-article, .commune-feed-item");
  }

  function currentEdition() {
    var sel =
      document.querySelector("[data-news-edition][aria-selected='true'], [data-commune-edition].is-active, [data-edition].is-active") ||
      document.querySelector("[data-news-edition], [data-commune-edition]");
    if (sel) {
      return (
        sel.getAttribute("data-news-edition") ||
        sel.getAttribute("data-commune-edition") ||
        sel.getAttribute("data-edition") ||
        sel.textContent.trim()
      );
    }
    var panel = document.getElementById("panel-signal");
    if (panel && panel.getAttribute("data-active-edition")) {
      return panel.getAttribute("data-active-edition");
    }
    return "local";
  }

  /* Hidden for you: the story collapses to its report line (CSS keys off
     data-news-reported-hidden), so the "Reported" / "Blocked" text stays readable.
     Outside SIGNAL (no report line to show) the story is removed as before. */
  function applyHide(post) {
    if (!post) return;
    post.setAttribute("data-news-reported-hidden", "true");
    if (!post.closest || !post.closest("#panel-signal") || !post.querySelector("[data-news-report]")) {
      post.hidden = true;
      post.style.display = "none";
    }
  }

  function init() {
    var panel = document.getElementById("panel-signal") || document;
    panel.addEventListener("click", function (ev) {
      var toggle = ev.target && ev.target.closest("[data-news-report-toggle]");
      if (toggle) {
        ev.preventDefault();
        var bar = toggle.closest("[data-news-report]");
        if (!bar) return;
        var menu = bar.querySelector("[data-news-report-menu]");
        if (menu) menu.hidden = !menu.hidden;
        return;
      }
      var blockBtn = ev.target && ev.target.closest("[data-news-report-block]");
      if (blockBtn) {
        ev.preventDefault();
        var bPost = closestPost(blockBtn);
        var bId = bPost && bPost.getAttribute("data-post-id");
        if (window.CognationModeration && typeof window.CognationModeration.hideContent === "function") {
          window.CognationModeration.hideContent(bId);
        }
        applyHide(bPost);
        var bBar = blockBtn.closest("[data-news-report]");
        var bMenu = bBar && bBar.querySelector("[data-news-report-menu]");
        if (bMenu) bMenu.hidden = true;
        var bStatus = bBar && bBar.querySelector("[data-news-report-status]");
        if (bStatus) {
          bStatus.hidden = false;
          bStatus.textContent = "Blocked for you.";
        }
        return;
      }
      var reasonBtn = ev.target && ev.target.closest("[data-news-report-reason]");
      if (!reasonBtn) return;
      ev.preventDefault();
      var reason = reasonBtn.getAttribute("data-news-report-reason");
      if (!REASON_LABELS[reason]) return;
      var bar2 = reasonBtn.closest("[data-news-report]");
      var post = closestPost(reasonBtn);
      if (!post || post.getAttribute("data-news-report-sending") === "true") return;
      var postId = post.getAttribute("data-post-id") || "";
      var status = bar2 && bar2.querySelector("[data-news-report-status]");
      var menu2 = bar2 && bar2.querySelector("[data-news-report-menu]");
      var options = menu2 ? menu2.querySelectorAll("[data-news-report-reason]") : [];
      function setOptionsDisabled(on) {
        for (var i = 0; i < options.length; i++) options[i].disabled = on;
      }
      function say(text) {
        if (!status) return;
        status.hidden = false;
        status.textContent = text;
      }
      post.setAttribute("data-news-report-sending", "true");
      setOptionsDisabled(true);
      say("Sending report…");
      var note = "User report: " + REASON_LABELS[reason];
      sendServerReport(post, reason, note).then(function () {
        post.removeAttribute("data-news-report-sending");
        if (menu2) menu2.hidden = true;
        /* Filed on the server: remember it on this device and hide the story. */
        if (window.CognationModeration && typeof window.CognationModeration.enqueue === "function") {
          var bodyEl = post.querySelector(".commune-feed-body, .paper-article-body");
          var authorEl = post.querySelector(".commune-feed-author");
          window.CognationModeration.enqueue({
            postId: postId,
            reason: reason,
            edition: currentEdition(),
            status: "queued",
            serverFiled: true,
            post: {
              id: postId,
              authorName: authorEl ? authorEl.textContent.trim() : "",
              kind: "news",
              body: bodyEl ? bodyEl.textContent.trim().slice(0, 2000) : "",
              createdAt: new Date().toISOString(),
              temporarilyRemoved: true,
              reporterNote: note,
            },
          });
        }
        applyHide(post);
        say("Reported: " + REASON_LABELS[reason] + ". Hidden for you.");
      }, function () {
        /* Not filed: say so, keep the story and the options so the reader can retry. */
        post.removeAttribute("data-news-report-sending");
        setOptionsDisabled(false);
        if (menu2) menu2.hidden = false;
        say(REPORT_FAILED);
      });
    });

    document.addEventListener("cognation:news-post-reported", function (ev) {
      var detail = ev && ev.detail;
      if (!detail || !detail.postId) return;
      var el = document.querySelector('[data-news-post][data-post-id="' + detail.postId + '"]');
      applyHide(el);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
