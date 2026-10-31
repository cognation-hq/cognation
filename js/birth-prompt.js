/**
 * One-time birth year + month ask at sign-in for real accounts with no
 * user_birth row. Dark Cognation shell (same panel family as login-gate).
 * Year and month only — never the day. No lecturing copy for under-13 attempts.
 * Seeds are skipped (fleet backfill owns their ages).
 */
(function () {
  "use strict";

  var SHOWN_KEY = "cognation.birthPrompt.shown.v1";
  var panel = null;
  var busy = false;
  /* Bumped on sign-out: a save or lookup started for the earlier account is
     dropped instead of closing, marking or announcing for the next one. */
  var sessionGen = 0;
  var UNKNOWN = { unknown: true };
  var lookup = null; /* the user_birth lookup in flight: { id, gen } */

  function session() {
    try {
      var auth = window.CognationAuth;
      return auth && typeof auth.getSession === "function" ? auth.getSession() : null;
    } catch (e) {
      return null;
    }
  }

  /* Seed and ops accounts sign in with an internal address on the seed auth
     domain or the ops auth domain (scripts/seedops-bind-auth.mjs). A bare
     "seed-" / "ops-" username prefix is not a marker: after Supabase sign-in
     session.username is the member's own email. Returns the fleet id or "". */
  var SEED_AUTH_DOMAIN = "seed.cognation.internal";
  var OPS_AUTH_DOMAIN = "ops.cognation.internal";
  function fleetFromAuthEmail(value) {
    var s = String(value || "").trim().toLowerCase();
    var at = s.lastIndexOf("@");
    if (at <= 0) return "";
    var local = s.slice(0, at);
    var domain = s.slice(at + 1);
    if (domain === SEED_AUTH_DOMAIN && /^seed-\d{4}$/.test(local)) return local;
    if (domain === OPS_AUTH_DOMAIN && /^ops-[a-z0-9-]+$/.test(local)) return local;
    return "";
  }

  function isSeedSession(s) {
    if (!s) return false;
    var kind = String(s.accountKind || s.account_kind || "").toLowerCase();
    if (kind === "seed" || kind === "ops") return true;
    if (s.isSeed) return true;
    var fleet = String(s.seedFleetId || s.seed_fleet_id || "");
    if (/^seed-/.test(fleet) || /^ops-/.test(fleet)) return true;
    /* Removed: bare /^seed-/ /^ops-/ match on session.username (a member's email). */
    return !!fleetFromAuthEmail(s.username);
  }

  function uid() {
    var s = session();
    if (s && s.supabaseUserId) return String(s.supabaseUserId);
    try {
      var sb = window.CognationSupabase;
      var live = sb && typeof sb.getSession === "function" ? sb.getSession() : null;
      if (live && live.user && live.user.id) return String(live.user.id);
    } catch (e) {}
    return "";
  }

  function alreadyShownFor(userId) {
    try {
      var raw = sessionStorage.getItem(SHOWN_KEY);
      var doc = raw ? JSON.parse(raw) : {};
      return !!(doc && doc[userId]);
    } catch (e) {
      return false;
    }
  }

  function markShown(userId) {
    try {
      var raw = sessionStorage.getItem(SHOWN_KEY);
      var doc = raw ? JSON.parse(raw) : {};
      doc[userId] = Date.now();
      sessionStorage.setItem(SHOWN_KEY, JSON.stringify(doc));
    } catch (e) {}
  }

  function ensurePanel() {
    if (panel && panel.isConnected) return panel;
    panel = document.getElementById("birth-prompt-gate");
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "birth-prompt-gate";
    panel.className = "login-gate birth-prompt-gate";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "birth-prompt-title");
    panel.hidden = true;
    panel.innerHTML =
      '<div class="login-gate-backdrop" data-birth-prompt-backdrop tabindex="-1" aria-hidden="true"></div>' +
      '<div class="login-gate-panel birth-prompt-panel">' +
      '<p class="login-gate-eyebrow">Profile</p>' +
      '<h2 id="birth-prompt-title">Add your birth year and month</h2>' +
      '<p class="login-gate-desc birth-prompt-why">We use year and month only to keep age-gated spaces accurate. We never store the day.</p>' +
      '<form class="login-form birth-prompt-form" data-birth-prompt-form action="#" method="post" novalidate>' +
      '<div class="form-group">' +
      '<label for="birth-prompt-year">Birth year</label>' +
      '<input id="birth-prompt-year" name="birthYear" type="number" inputmode="numeric" min="1900" max="2100" required placeholder="YYYY" autocomplete="bday-year">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="birth-prompt-month">Birth month</label>' +
      '<select id="birth-prompt-month" name="birthMonth" required autocomplete="bday-month">' +
      '<option value="">Month</option>' +
      '<option value="1">January</option><option value="2">February</option>' +
      '<option value="3">March</option><option value="4">April</option>' +
      '<option value="5">May</option><option value="6">June</option>' +
      '<option value="7">July</option><option value="8">August</option>' +
      '<option value="9">September</option><option value="10">October</option>' +
      '<option value="11">November</option><option value="12">December</option>' +
      "</select>" +
      "</div>" +
      '<p class="login-status" data-birth-prompt-status hidden role="status" aria-live="polite"></p>' +
      '<div class="login-form-actions form-actions">' +
      '<button type="submit" class="btn btn-primary" data-birth-prompt-save>Save</button>' +
      "</div>" +
      "</form>" +
      "</div>";
    document.body.appendChild(panel);
    var form = panel.querySelector("[data-birth-prompt-form]");
    if (form) form.addEventListener("submit", onSubmit);
    return panel;
  }

  function setStatus(msg, isError) {
    var el = panel && panel.querySelector("[data-birth-prompt-status]");
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = msg;
    el.classList.toggle("is-error", !!isError);
  }

  function openPanel() {
    var el = ensurePanel();
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
    document.body.classList.add("login-gate-open");
    var year = el.querySelector("#birth-prompt-year");
    if (year) setTimeout(function () { year.focus(); }, 20);
  }

  function closePanel() {
    if (!panel) return;
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
    /* Don't clear login-gate-open if the main login gate is still open. */
    var login = document.querySelector(".login-gate:not(.birth-prompt-gate)");
    if (!login || login.hidden) document.body.classList.remove("login-gate-open");
  }

  function hasBirthRow() {
    var sb = window.CognationSupabase;
    var id = uid();
    /* Resolves to the row, null when there is truly no row, or UNKNOWN when the
       lookup could not run or failed. Only a real "no row" opens the ask. The
       table name and query go separately: rest() URL-encodes the table name. */
    if (!sb || !id || typeof sb.rest !== "function") return Promise.resolve(UNKNOWN);
    return sb
      .rest("user_birth", {
        query: "select=birth_year,birth_month&user_id=eq." + encodeURIComponent(id) + "&limit=1",
      })
      .then(function (rows) {
        if (!Array.isArray(rows)) return UNKNOWN;
        return rows.length > 0 ? rows[0] : null;
      })
      .catch(function () {
        return UNKNOWN;
      });
  }

  function onSubmit(ev) {
    ev.preventDefault();
    if (busy) return;
    var yearEl = panel.querySelector("#birth-prompt-year");
    var monthEl = panel.querySelector("#birth-prompt-month");
    var y = yearEl ? parseInt(yearEl.value, 10) : NaN;
    var m = monthEl ? parseInt(monthEl.value, 10) : NaN;
    if (!y || y < 1900 || y > 2100 || !m || m < 1 || m > 12) {
      setStatus("Enter a birth year and month.", true);
      return;
    }
    var sb = window.CognationSupabase;
    if (!sb || typeof sb.rpc !== "function") {
      setStatus("Could not save right now. Try again in a moment.", true);
      return;
    }
    busy = true;
    setStatus("Saving…", false);
    var gen = sessionGen;
    sb
      .rpc("set_my_birth_month", { y: y, m: m })
      .then(function (ok) {
        if (gen !== sessionGen) return; /* signed out meanwhile */
        busy = false;
        setStatus("", false); /* clear "Saving…" the moment the save resolves */
        if (ok === false) {
          /* Server refused (e.g. under 13) — soft redirect, no lecture. */
          setStatus("We couldn't save that. Cognation is for ages 13 and up.", true);
          return;
        }
        markShown(uid());
        closePanel();
        try {
          document.dispatchEvent(new CustomEvent("cognation:birth-saved", { detail: { year: y, month: m } }));
        } catch (eEv) {}
      })
      .catch(function () {
        if (gen !== sessionGen) return;
        busy = false;
        setStatus("Could not save right now. Try again in a moment.", true);
      });
  }

  function maybePrompt() {
    var s = session();
    if (!s || s.source === "demo") return;
    if (isSeedSession(s)) return;
    var id = uid();
    if (!id) return;
    if (alreadyShownFor(id)) return;
    var login = document.querySelector(".login-gate:not(.birth-prompt-gate)");
    if (login && !login.hidden) return;
    /* One lookup per user and session: boot and session-started share it. */
    if (lookup && lookup.id === id && lookup.gen === sessionGen) return;
    var gen = sessionGen;
    var mine = { id: id, gen: gen };
    lookup = mine;
    hasBirthRow().then(function (row) {
      if (lookup === mine) lookup = null;
      if (gen !== sessionGen) return; /* signed out meanwhile */
      if (row === UNKNOWN) return; /* lookup failed: never block the page on a guess */
      if (row) {
        markShown(id);
        return;
      }
      /* Still signed in? */
      if (uid() !== id) return;
      openPanel();
    });
  }

  /* In-page sign-out (shared devices): close the ask without saving and clear
     what was typed, so the next account never sees or submits it. */
  function onSessionEnded() {
    sessionGen += 1;
    busy = false;
    if (!panel) return;
    var form = panel.querySelector("[data-birth-prompt-form]");
    if (form && typeof form.reset === "function") form.reset();
    setStatus("", false);
    closePanel();
  }

  function boot() {
    document.addEventListener("cognation:session-ended", onSessionEnded);
    document.addEventListener("cognation:session-started", function () {
      setTimeout(maybePrompt, 400);
    });
    document.addEventListener("cognation:auth-changed", function () {
      setTimeout(maybePrompt, 400);
    });
    if (session() && session().source === "supabase") setTimeout(maybePrompt, 600);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.CognationBirthPrompt = {
    maybePrompt: maybePrompt,
    open: openPanel,
    close: closePanel,
  };
})();
