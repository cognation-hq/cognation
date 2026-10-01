/**
 * Accessible tabs (WAI-ARIA APG pattern).
 * Labels/ids live in HTML — swap provisional names when final list arrives.
 */
(function () {
  "use strict";

  function initTabs(root) {
    var tablist = root.querySelector('[role="tablist"]');
    if (!tablist) return;

    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]')).filter(function (tab) {
      return !tab.hidden;
    });
    var panels = tabs
      .map(function (tab) {
        var id = tab.getAttribute("aria-controls");
        return id ? document.getElementById(id) : null;
      })
      .filter(Boolean);

    if (!tabs.length || tabs.length !== panels.length) return;

    function activate(index, focusTab) {
      if (window.CognationCircleFall && typeof window.CognationCircleFall.stop === "function") {
        window.CognationCircleFall.stop();
      }
      tabs.forEach(function (tab, i) {
        var selected = i === index;
        tab.setAttribute("aria-selected", selected ? "true" : "false");
        tab.tabIndex = selected ? 0 : -1;
        panels[i].hidden = !selected;
      });
      if (focusTab) tabs[index].focus();
      /* WELL is not in the public tablist; provider-only entry may call CognationWellAuth directly later. */
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () {
        activate(i, false);
      });

      tab.addEventListener("keydown", function (e) {
        var next = null;
        switch (e.key) {
          case "ArrowRight":
            next = (i + 1) % tabs.length;
            break;
          case "ArrowLeft":
            next = (i - 1 + tabs.length) % tabs.length;
            break;
          case "Home":
            next = 0;
            break;
          case "End":
            next = tabs.length - 1;
            break;
          case "Enter":
          case " ":
            e.preventDefault();
            activate(i, false);
            return;
          default:
            return;
        }
        e.preventDefault();
        activate(next, true);
      });
    });

    var initial = tabs.findIndex(function (t) {
      return t.getAttribute("aria-selected") === "true";
    });
    activate(initial >= 0 ? initial : 0, false);
  }

  function openTowerAnchor(name) {
    if (name === "circle") {
      if (window.CognationCircleFall && typeof window.CognationCircleFall.start === "function") {
        window.CognationCircleFall.start();
      }
      return;
    }

    var towerTab = document.getElementById("tab-tower");
    if (towerTab) towerTab.click();

    if (typeof window.CognationTowerApplySide === "function") {
      window.CognationTowerApplySide("private");
    }

    var selector = name === "calendar"
      ? "[data-tower-calendar-personal]"
      : "[data-tower-friends-browse]";
    window.setTimeout(function () {
      var target = document.querySelector(selector);
      if (target && target.scrollIntoView) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
  }

  function initTowerShortcuts() {
    document.querySelectorAll("[data-tower-anchor]").forEach(function (shortcut) {
      shortcut.addEventListener("click", function () {
        openTowerAnchor(shortcut.getAttribute("data-tower-anchor"));
      });
    });
  }

  function activateMainTabFromHash() {
    var hash = (location.hash || "").replace(/^#/, "");
    if (!hash) return;
    if (hash === "calendar" || hash === "circle") {
      openTowerAnchor(hash);
      return;
    }
    var tabIdMap = {
      news: "tab-news",
      "panel-news": "tab-news",
      "tab-news": "tab-news",
      commune: "tab-commune",
      "panel-commune": "tab-commune",
      "tab-commune": "tab-commune",
      pages: "tab-pages",
      "panel-pages": "tab-pages",
      "tab-pages": "tab-pages",
      tower: "tab-tower",
      "panel-tower": "tab-tower",
      "tab-tower": "tab-tower"
    };
    if (tabIdMap[hash]) {
      var mapped = document.getElementById(tabIdMap[hash]);
      if (mapped && !mapped.hidden) mapped.click();
      return;
    }
    if (hash.indexOf("tower-profile-") !== 0) return;
    var towerTab = document.getElementById("tab-tower");
    if (towerTab) towerTab.click();
    /* Public profile deep-link — never open private My feed */
    if (typeof window.CognationTowerApplySide === "function") {
      window.CognationTowerApplySide("public");
    } else {
      document.querySelectorAll("[data-tower-app]").forEach(function (root) {
        root.setAttribute("data-tower-side", "public");
        var priv = root.querySelector("[data-tower-private-side]");
        var pub = root.querySelector("[data-tower-public-side]");
        if (priv) priv.hidden = true;
        if (pub) pub.hidden = false;
      });
      try {
        sessionStorage.setItem("cognation.tower.side", "public");
      } catch (e) {}
    }
    window.setTimeout(function () {
      var el = document.getElementById(hash) || document.querySelector('[data-author-slug="' + hash.replace(/^tower-profile-/, "") + '"]');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function boot() {
    document.querySelectorAll("[data-tabs]").forEach(initTabs);
    initTowerShortcuts();
    activateMainTabFromHash();
    window.addEventListener("hashchange", activateMainTabFromHash);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
