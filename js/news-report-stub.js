/**
 * CGN-009 — NEWS report control (demo).
 * Hooks: [data-news-report], [data-news-report-reason="harmful|untruthful"],
 * [data-news-post] + data-post-id. Queues via window.CognationModeration.enqueue.
 * No user bans.
 */
(function () {
  "use strict";

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

  function applyHide(post) {
    if (!post) return;
    post.hidden = true;
    post.setAttribute("data-news-reported-hidden", "true");
    post.style.display = "none";
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
      var reasonBtn = ev.target && ev.target.closest("[data-news-report-reason]");
      if (!reasonBtn) return;
      ev.preventDefault();
      var reason = reasonBtn.getAttribute("data-news-report-reason");
      if (reason !== "harmful" && reason !== "untruthful") return;
      var bar2 = reasonBtn.closest("[data-news-report]");
      var post = closestPost(reasonBtn);
      var postId = post && post.getAttribute("data-post-id");
      var status = bar2 && bar2.querySelector("[data-news-report-status]");
      var menu2 = bar2 && bar2.querySelector("[data-news-report-menu]");
      if (menu2) menu2.hidden = true;

      var result = { ok: false };
      if (window.CognationModeration && typeof window.CognationModeration.enqueue === "function") {
        var bodyEl = post && post.querySelector(".commune-feed-body, .paper-article-body");
        var authorEl = post && post.querySelector(".commune-feed-author");
        result = window.CognationModeration.enqueue({
          postId: postId || "",
          reason: reason,
          edition: currentEdition(),
          status: "queued",
          post: {
            id: postId || "",
            authorName: authorEl ? authorEl.textContent.trim() : "",
            kind: "news",
            body: bodyEl ? bodyEl.textContent.trim().slice(0, 2000) : "",
            createdAt: new Date().toISOString(),
            temporarilyRemoved: true,
          },
        });
      }
      applyHide(post);
      if (status) {
        status.hidden = false;
        status.textContent =
          "Reported as " +
          reason +
          " · saved in this browser only. Demo / local only.";
      }
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
