/**
 * Demo unlock flag. No password or one-time code is stored here.
 *
 * ?demo=1 or the Demo unlock button sets sessionStorage cognation.demo.unlock.v1.
 * Production default: the flag is absent. window.__COGNATION_DEMO__ stays unset.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "cognation.demo.unlock.v1";
  var CHROME_TEXT = "Demo — not real auth";

  function flagFromWindow() {
    return window.__COGNATION_DEMO__ === true;
  }

  function readFlag() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function applyQueryFlag() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      if (params.get("demo") === "1") {
        sessionStorage.setItem(STORAGE_KEY, "1");
        return true;
      }
    } catch (e) {}
    return false;
  }

  function isUnlocked() {
    return flagFromWindow() || readFlag();
  }

  function ensureChrome() {
    if (!isUnlocked()) return;
    document.documentElement.setAttribute("data-cognation-demo", "1");
    document.body.classList.add("cognation-demo-on");
    var el = document.getElementById("cognation-demo-chrome");
    if (!el) {
      el = document.createElement("p");
      el.id = "cognation-demo-chrome";
      el.className = "cognation-demo-chrome";
      el.setAttribute("role", "status");
      el.textContent = CHROME_TEXT;
      document.body.appendChild(el);
    }
    el.hidden = false;
    el.textContent = CHROME_TEXT;
  }

  function hideChrome() {
    document.body.classList.remove("cognation-demo-on");
    document.documentElement.removeAttribute("data-cognation-demo");
    var el = document.getElementById("cognation-demo-chrome");
    if (el) el.hidden = true;
  }

  function clearUnlock() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    hideChrome();
    return true;
  }

  function syncChrome() {
    if (isUnlocked()) ensureChrome();
    else hideChrome();
  }

  function unlock() {
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    ensureChrome();
    return true;
  }

  applyQueryFlag();

  window.CognationDemo = {
    STORAGE_KEY: STORAGE_KEY,
    label: CHROME_TEXT,
    isUnlocked: isUnlocked,
    unlock: unlock,
    clearUnlock: clearUnlock,
    ensureChrome: ensureChrome,
    hideChrome: hideChrome,
    syncChrome: syncChrome,
  };

  function boot() {
    syncChrome();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
