/**
 * SIGNAL — News | Feed second-row subtabs (same two-level stack as
 * Personal | Professional under Tower). Top tab stays SIGNAL.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "cognation.signal.pane";

  function readStoredPane() {
    try {
      var v = sessionStorage.getItem(STORAGE_KEY);
      if (v === "feed" || v === "news") return v;
    } catch (e) {}
    return "news";
  }

  function writeStoredPane(pane) {
    try {
      sessionStorage.setItem(STORAGE_KEY, pane);
    } catch (e) {}
  }

  function applySignalPane(pane, opts) {
    opts = opts || {};
    pane = pane === "feed" ? "feed" : "news";
    var root = document.getElementById("panel-signal");
    if (!root) return;
    root.querySelectorAll("[data-signal-pane]").forEach(function (el) {
      var on = el.getAttribute("data-signal-pane") === pane;
      el.hidden = !on;
      el.setAttribute("aria-hidden", on ? "false" : "true");
    });
    root.querySelectorAll("[data-signal-pane-btn]").forEach(function (btn) {
      var on = btn.getAttribute("data-signal-pane-btn") === pane;
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.classList.toggle("is-selected", on);
      btn.tabIndex = on ? 0 : -1;
    });
    if (opts.persist !== false) writeStoredPane(pane);
    try {
      document.dispatchEvent(
        new CustomEvent("cognation:signal-pane-change", { detail: { pane: pane } })
      );
    } catch (e) {}
  }

  function openSignal(pane) {
    var tab = document.getElementById("tab-signal");
    if (tab) tab.click();
    window.setTimeout(function () {
      applySignalPane(pane || "news");
    }, 20);
  }

  function initSignalSubtabs() {
    var root = document.getElementById("panel-signal");
    if (!root || root.__cognationSignalBound) return;
    root.__cognationSignalBound = true;
    var initial = readStoredPane();
    applySignalPane(initial, { persist: false });

    var list = root.querySelector("[data-signal-subtabs]");
    if (list) {
      list.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest("[data-signal-pane-btn]");
        if (!btn || !list.contains(btn)) return;
        applySignalPane(btn.getAttribute("data-signal-pane-btn") || "news");
      });
      list.addEventListener("keydown", function (ev) {
        var tabs = Array.prototype.slice.call(
          list.querySelectorAll("[data-signal-pane-btn]")
        );
        if (!tabs.length) return;
        var i = tabs.findIndex(function (t) {
          return t.getAttribute("aria-selected") === "true";
        });
        if (i < 0) i = 0;
        var next = null;
        if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
          next = ev.key === "ArrowRight"
            ? (i + 1) % tabs.length
            : (i - 1 + tabs.length) % tabs.length;
        } else if (ev.key === "Home") next = 0;
        else if (ev.key === "End") next = tabs.length - 1;
        else return;
        ev.preventDefault();
        applySignalPane(tabs[next].getAttribute("data-signal-pane-btn") || "news");
        tabs[next].focus();
      });
    }

    window.addEventListener("hashchange", function () {
      var hash = (location.hash || "").replace(/^#/, "");
      if (hash === "signal-feed" || hash === "feed") openSignal("feed");
      else if (hash === "signal-news" || hash === "news" || hash === "signal") openSignal("news");
    });
  }

  window.CognationSignalApplyPane = applySignalPane;
  window.CognationSignalOpen = openSignal;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSignalSubtabs);
  } else {
    initSignalSubtabs();
  }
})();
