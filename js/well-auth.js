/**
 * WELL local preview lock.
 *
 * Not clinical sign-in. No shared password or one-time code ships in this file.
 * Unlock is the Demo unlock control. A one-time code is generated after unlock.
 * Session: sessionStorage cognation.well.auth.v1 (clears on tab close).
 *
 * Demo EHR — not HIPAA. Not a real EHR. No PHI leaves the browser.
 */
(function () {
  "use strict";

  var AUTH_KEY = "cognation.well.auth.v1";
  var TTL_MS = 4 * 60 * 60 * 1000;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function readSession() {
    try {
      var raw = sessionStorage.getItem(AUTH_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.ok || !data.at) return null;
      if (TTL_MS && Date.now() - data.at > TTL_MS) {
        sessionStorage.removeItem(AUTH_KEY);
        return null;
      }
      return data;
    } catch (e) {
      return null;
    }
  }

  function writeSession(data) {
    try {
      if (!data) sessionStorage.removeItem(AUTH_KEY);
      else sessionStorage.setItem(AUTH_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function isAuthenticated() {
    return !!readSession();
  }

  function setStatus(root, message, isError) {
    var el = $('[data-well-auth-status="credentials"]', root);
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || "";
    el.classList.toggle("is-error", !!isError);
  }

  function runtimeCode() {
    var n = 0;
    try {
      var buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      n = buf[0] % 900000;
    } catch (e) {
      n = Math.floor(Math.random() * 900000);
    }
    return String(100000 + n);
  }

  function showRuntimeCode(root, code) {
    var el = $("[data-well-runtime-otp]", root);
    if (!el) return;
    if (!code) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = "Runtime code " + code;
  }

  function showDemoChrome(root) {
    if (window.CognationDemo && window.CognationDemo.ensureChrome) {
      window.CognationDemo.ensureChrome();
    }
    var note = $("[data-well-demo-chrome]", root);
    if (note) note.hidden = false;
  }

  function setLockedUi(root, locked) {
    root.classList.toggle("is-locked", locked);
    root.setAttribute("data-well-auth-state", locked ? "locked" : "unlocked");

    var lock = $("[data-well-auth-lock]", root);
    var secured = $("[data-well-secured]", root);
    var sessionBar = $("[data-well-session-bar]", root);
    var sideToggle = $("[data-well-side-toggle]", root);

    if (lock) {
      lock.hidden = !locked;
      lock.setAttribute("aria-hidden", locked ? "false" : "true");
    }

    if (secured) {
      if (locked) {
        secured.setAttribute("aria-hidden", "true");
        secured.setAttribute("inert", "");
        secured.hidden = false;
      } else {
        secured.removeAttribute("aria-hidden");
        secured.removeAttribute("inert");
      }
    }

    $all("[data-well-patient-root], [data-well-provider-root]", root).forEach(function (el) {
      if (locked) {
        el.setAttribute("aria-hidden", "true");
        el.setAttribute("inert", "");
      } else {
        el.removeAttribute("aria-hidden");
        el.removeAttribute("inert");
      }
    });

    if (sessionBar) sessionBar.hidden = locked;
    if (sideToggle) {
      sideToggle.hidden = locked;
      sideToggle.setAttribute("aria-hidden", locked ? "true" : "false");
      $all("button", sideToggle).forEach(function (btn) {
        btn.disabled = locked;
        if (locked) {
          btn.tabIndex = -1;
        } else {
          btn.tabIndex = btn.getAttribute("aria-selected") === "true" ? 0 : -1;
        }
      });
    }

    if (!locked) showDemoChrome(root);
    if (locked) {
      showRuntimeCode(root, "");
      window.setTimeout(function () {
        var unlockBtn = $("[data-well-demo-unlock]", root);
        if (unlockBtn) unlockBtn.focus();
      }, 30);
    }
  }

  function unlock(root, username) {
    if (window.CognationDemo && window.CognationDemo.unlock) {
      window.CognationDemo.unlock();
    }
    var code = runtimeCode();
    writeSession({
      ok: true,
      user: username || "demo",
      at: Date.now(),
      factor: "demo-unlock",
      runtimeCode: code,
      note: "Demo EHR — not HIPAA",
    });
    showRuntimeCode(root, code);
    setLockedUi(root, false);
    document.dispatchEvent(
      new CustomEvent("cognation:well-auth", {
        detail: { unlocked: true, user: username || "demo", demo: true },
      })
    );
  }

  function lock(root, opts) {
    opts = opts || {};
    writeSession(null);
    if (!root) {
      $all("[data-well-app]").forEach(function (r) {
        setLockedUi(r, true);
        setStatus(r, opts.message || "", !!opts.isError);
      });
    } else {
      setLockedUi(root, true);
      setStatus(root, opts.message || "", !!opts.isError);
    }
    document.dispatchEvent(
      new CustomEvent("cognation:well-auth", { detail: { unlocked: false } })
    );
  }

  function ensureGate(root) {
    root = root || $("[data-well-app]");
    if (!root) return isAuthenticated();
    if (isAuthenticated()) {
      var existing = readSession();
      setLockedUi(root, false);
      showRuntimeCode(root, existing && existing.runtimeCode);
      return true;
    }
    setLockedUi(root, true);
    return false;
  }

  function onWellPanelShown() {
    $all("[data-well-app]").forEach(function (root) {
      ensureGate(root);
    });
  }

  function wireRoot(root) {
    if (!root || root.__wellAuthWired) return;
    root.__wellAuthWired = true;

    var unlockBtn = $("[data-well-demo-unlock]", root);
    var lockBtn = $("[data-well-lock-btn]", root);

    if (unlockBtn) {
      unlockBtn.addEventListener("click", function () {
        unlock(root, "demo");
        setStatus(root, "");
      });
    }

    if (lockBtn) {
      lockBtn.addEventListener("click", function () {
        lock(root, { message: "WELL locked. Use Demo unlock to open the local chart preview." });
      });
    }
  }

  function boot() {
    $all("[data-well-app]").forEach(function (root) {
      wireRoot(root);
      ensureGate(root);
    });

    document.addEventListener("cognation:session-ended", function () {
      lock(null);
    });
  }

  window.CognationWellAuth = {
    AUTH_KEY: AUTH_KEY,
    isAuthenticated: isAuthenticated,
    ensureGate: ensureGate,
    lock: function () {
      lock(null);
    },
    unlockSession: function (username) {
      var root = $("[data-well-app]");
      if (root) unlock(root, username || "demo");
    },
    onWellPanelShown: onWellPanelShown,
    getSession: readSession,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
