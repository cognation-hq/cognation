/**
 * Demo unlock flag. No password or one-time code is stored here.
 *
 * Live Pages (any *.pages.dev host, including cognation-3md.pages.dev) never
 * honors this flag. The public sign-in gate does not ship a Demo unlock control.
 *
 * Local gate only:
 * - loopback or file://, or
 * - CognationConfig.localDemo from COGNATION_LOCAL_DEMO on a non-Pages host.
 * On that gate, ?demo=1 or the local Demo unlock control sets
 * sessionStorage cognation.demo.unlock.v1.
 * window.__COGNATION_DEMO__ stays unset for production and is ignored on live Pages.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "cognation.demo.unlock.v1";
  var CHROME_TEXT = "Demo — not real auth";

  function pageHost() {
    try {
      return String(window.location.hostname || "").toLowerCase();
    } catch (e) {
      return "";
    }
  }

  function pageProtocol() {
    try {
      return String(window.location.protocol || "");
    } catch (e) {
      return "";
    }
  }

  function isProductLiveHost(host) {
    host = String(host || "").toLowerCase();
    return host === "cognation-3md.pages.dev" || host.endsWith(".pages.dev");
  }

  function isLocalHost(host, protocol) {
    host = String(host || "").toLowerCase();
    if (protocol === "file:") return true;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]"
    );
  }

  function envLocalDemo() {
    var cfg = window.CognationConfig;
    if (!cfg) return false;
    return cfg.localDemo === true || cfg.localDemo === 1 || cfg.localDemo === "1";
  }

  function localGateOpen() {
    var host = pageHost();
    if (isProductLiveHost(host)) return false;
    return isLocalHost(host, pageProtocol()) || envLocalDemo();
  }

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

  function clearStoredFlag() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  function applyQueryFlag() {
    if (!localGateOpen()) {
      clearStoredFlag();
      return false;
    }
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
    if (!localGateOpen()) return false;
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
    document.documentElement.removeAttribute("data-cognation-demo");
    document.body.classList.remove("cognation-demo-on");
    var el = document.getElementById("cognation-demo-chrome");
    if (el) el.hidden = true;
  }

  function clearUnlock() {
    clearStoredFlag();
    hideChrome();
    return true;
  }

  function syncChrome() {
    if (isUnlocked()) ensureChrome();
    else hideChrome();
  }

  function unlock() {
    if (!localGateOpen()) {
      clearUnlock();
      return false;
    }
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
    localGateOpen: localGateOpen,
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
