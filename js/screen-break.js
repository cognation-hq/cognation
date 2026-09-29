/**
 * COGNATION screen-break / auto-logout module
 * -------------------------------------------
 * Product flow:
 *   1. After activityLimitMs of screen time → full-screen lock
 *   2. Forced breakDurationMs (default 15000) countdown: “look away / rest”
 *   3. Then cognitive unlock puzzle (memory sequence)
 *   4. Correct solve within solveTimeoutMs → unlock & resume
 *   5. Unsolved / abandoned / breakDeadline → auto-logout (CognationAuth.logout)
 *
 * Timing comments (do not confuse):
 *   breakDurationMs = 15000  → forced rest before puzzle appears
 *   solveTimeoutMs  = 60000  → max time AFTER break to solve, else logout
 *   activityLimitMs → idle/AFK time before break (default 1 hour). Active typing/mouse resets it.
 *
 * Head Hancho API (credentials: 'include'):
 *   GET  /api/session/status          → { authenticated, breakRequired, breakDeadline, secondsRemaining }
 *   POST /api/session/activity        → heartbeat / screen-time tick (server may set breakRequired)
 *   POST /api/session/break/complete  → { puzzleToken } clears break, keeps session
 *   POST /api/session/logout          → via CognationAuth.logout
 *
 * Local demo fallback when fetch fails or server is down.
 *
 * Public API: window.CognationScreenBreak { start, stop, config, forceBreak, isLocked }
 */
(function () {
  "use strict";

  /* —— Config ——
   * Default: hourly AFK screen-break. Any keyboard/mouse/touch resets idle time.
   * Set useDemoTimings:true (or activityLimitMs) only for short local tests.
   */
  var PRODUCTION_ACTIVITY_MS = 60 * 60 * 1000; /* 1 hour AFK → screen break */
  var DEMO_ACTIVITY_MS = 50 * 1000; /* short demo only when useDemoTimings:true */

  var CONFIG = {
    useDemoTimings: false,
    activityLimitMs: PRODUCTION_ACTIVITY_MS,
    breakDurationMs: 15000 /* forced cognitive + screen break before puzzle */,
    solveTimeoutMs: 60000 /* must solve within this window after break ends */,
    heartbeatIntervalMs: 10000,
    statusPollIntervalMs: 15000,
    apiBaseUrl:
      (window.CognationConfig && window.CognationConfig.apiBaseUrl) ||
      (window.CognationAuth && window.CognationAuth.apiBaseUrl) ||
      "/api",
    sequenceLength: 4,
    colors: [
      { id: "cyan", label: "Cyan", hex: "#22d3ee" },
      { id: "indigo", label: "Indigo", hex: "#818cf8" },
      { id: "amber", label: "Amber", hex: "#fbbf24" },
      { id: "rose", label: "Rose", hex: "#fb7185" },
    ],
  };

  if (!CONFIG.useDemoTimings) {
    CONFIG.activityLimitMs = PRODUCTION_ACTIVITY_MS;
  }

  var state = {
    running: false,
    locked: false,
    phase: "idle", /* idle | break | puzzle | unlocking */
    activityAccumMs: 0,
    lastTickAt: 0,
    breakEndsAt: 0,
    solveDeadlineAt: 0,
    puzzleToken: null,
    sequence: [],
    inputIndex: 0,
    showingSequence: false,
    timers: [],
    intervals: [],
    lastFocus: null,
    overlay: null,
    apiAvailable: null /* null unknown, true/false */,
  };

  function apiUrl(path) {
    return String(CONFIG.apiBaseUrl).replace(/\/$/, "") + path;
  }

  function fetchJson(path, options) {
    options = options || {};
    var opts = {
      method: options.method || "GET",
      credentials: "include",
      headers: Object.assign(
        { Accept: "application/json" },
        options.body ? { "Content-Type": "application/json" } : {},
        options.headers || {}
      ),
    };
    if (options.body != null) {
      opts.body =
        typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body);
    }
    return fetch(apiUrl(path), opts).then(function (res) {
      if (!res.ok) {
        var err = new Error("HTTP " + res.status);
        err.status = res.status;
        throw err;
      }
      var ctype = (res.headers.get("content-type") || "").toLowerCase();
      if (ctype.indexOf("application/json") === -1) {
        var bad = new Error("non-json api response");
        bad.status = res.status;
        throw bad;
      }
      return res.json().then(function (data) {
        if (!data || typeof data !== "object") {
          throw new Error("invalid api json");
        }
        return data;
      });
    });
  }

  function clearTimers() {
    state.timers.forEach(function (id) {
      clearTimeout(id);
    });
    state.intervals.forEach(function (id) {
      clearInterval(id);
    });
    state.timers = [];
    state.intervals = [];
  }

  function later(fn, ms) {
    var id = setTimeout(fn, ms);
    state.timers.push(id);
    return id;
  }

  function every(fn, ms) {
    var id = setInterval(fn, ms);
    state.intervals.push(id);
    return id;
  }

  function sessionActive() {
    if (window.CognationAuth && typeof window.CognationAuth.isAuthenticated === "function") {
      return window.CognationAuth.isAuthenticated();
    }
    try {
      return !!localStorage.getItem("cognation.session.demo.v1");
    } catch (e) {
      return false;
    }
  }

  function doLogout(message) {
    stopInternal(false);
    hideOverlay();
    state.locked = false;
    state.phase = "idle";
    state.activityAccumMs = 0;
    if (window.CognationAuth && typeof window.CognationAuth.logout === "function") {
      window.CognationAuth.logout({
        message: message || "Signed out after an unfinished screen break.",
        isError: false,
      });
    } else {
      var gate = document.getElementById("login-gate");
      if (gate) {
        gate.hidden = false;
        document.body.classList.add("login-gate-open");
      }
      try {
        localStorage.removeItem("cognation.session.demo.v1");
      } catch (e) {}
    }
  }

  /* —— Overlay DOM —— */
  function ensureOverlay() {
    if (state.overlay) return state.overlay;
    var el = document.createElement("div");
    el.id = "screen-break-overlay";
    el.className = "screen-break";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", "screen-break-title");
    el.hidden = true;
    el.innerHTML =
      '<div class="screen-break-backdrop" aria-hidden="true"></div>' +
      '<div class="screen-break-panel" tabindex="-1">' +
      '  <p class="cgn-deferral" role="note">Demo / local only</p>' +
      '  <p class="screen-break-eyebrow">Screen break</p>' +
      '  <h2 id="screen-break-title">Cognitive rest</h2>' +
      '  <p id="screen-break-desc" class="screen-break-desc"></p>' +
      '  <p id="screen-break-live" class="screen-break-live" aria-live="assertive" aria-atomic="true"></p>' +
      '  <div id="screen-break-countdown" class="screen-break-countdown" hidden>' +
      '    <div class="screen-break-ring" aria-hidden="true"><span id="screen-break-secs">15</span></div>' +
      '    <p class="screen-break-hint">Look away from the screen. Rest your eyes.</p>' +
      "  </div>" +
      '  <div id="screen-break-puzzle" class="screen-break-puzzle" hidden>' +
      '    <p class="screen-break-puzzle-lead" id="screen-break-puzzle-lead">Watch the sequence, then repeat it.</p>' +
      '    <div class="screen-break-pads" role="group" aria-labelledby="screen-break-puzzle-lead" id="screen-break-pads"></div>' +
      '    <p id="screen-break-puzzle-status" class="screen-break-puzzle-status" role="status" aria-live="polite"></p>' +
      '    <button type="button" class="btn btn-secondary screen-break-replay" id="screen-break-replay" hidden>Replay sequence</button>' +
      "  </div>" +
      "</div>";
    document.body.appendChild(el);

    var pads = el.querySelector("#screen-break-pads");
    CONFIG.colors.forEach(function (c, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "screen-break-pad";
      btn.dataset.colorId = c.id;
      btn.style.setProperty("--pad-color", c.hex);
      btn.setAttribute("aria-label", c.label + " (key " + (i + 1) + ")");
      btn.disabled = true;
      btn.addEventListener("click", function () {
        onPadInput(c.id);
      });
      pads.appendChild(btn);
    });

    el.querySelector("#screen-break-replay").addEventListener("click", function () {
      if (state.phase === "puzzle" && !state.showingSequence) {
        playSequence();
      }
    });

    el.addEventListener("keydown", onOverlayKeydown);
    state.overlay = el;
    return el;
  }

  function showOverlay() {
    var el = ensureOverlay();
    state.lastFocus = document.activeElement;
    el.hidden = false;
    document.body.classList.add("screen-break-open");
    var panel = el.querySelector(".screen-break-panel");
    later(function () {
      if (panel) panel.focus();
    }, 20);
  }

  function hideOverlay() {
    if (!state.overlay) return;
    state.overlay.hidden = true;
    document.body.classList.remove("screen-break-open");
    if (state.lastFocus && typeof state.lastFocus.focus === "function") {
      try {
        state.lastFocus.focus();
      } catch (e) {}
    }
  }

  function setLive(text) {
    var live = document.getElementById("screen-break-live");
    if (live) live.textContent = text || "";
  }

  function setDesc(text) {
    var d = document.getElementById("screen-break-desc");
    if (d) d.textContent = text || "";
  }

  function setPuzzleStatus(text) {
    var s = document.getElementById("screen-break-puzzle-status");
    if (s) s.textContent = text || "";
  }

  function focusableInOverlay() {
    if (!state.overlay) return [];
    return Array.prototype.slice.call(
      state.overlay.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  }

  function onOverlayKeydown(e) {
    if (!state.locked) return;

    if (e.key === "Tab") {
      var nodes = focusableInOverlay();
      if (!nodes.length) {
        e.preventDefault();
        return;
      }
      var first = nodes[0];
      var last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }

    /* Escape does NOT dismiss — forced break / must solve or auto-logout */
    if (e.key === "Escape") {
      e.preventDefault();
      setLive("Finish the unlock puzzle, or wait for auto sign-out.");
      return;
    }

    if (state.phase === "puzzle" && !state.showingSequence) {
      var num = parseInt(e.key, 10);
      if (num >= 1 && num <= CONFIG.colors.length) {
        e.preventDefault();
        onPadInput(CONFIG.colors[num - 1].id);
      }
    }
  }

  /* —— Puzzle (memory sequence) —— */
  function randomSequence(len) {
    var seq = [];
    for (var i = 0; i < len; i++) {
      seq.push(CONFIG.colors[Math.floor(Math.random() * CONFIG.colors.length)].id);
    }
    return seq;
  }

  function makePuzzleToken() {
    return (
      "puz_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 10)
    );
  }

  function getPads() {
    return state.overlay
      ? Array.prototype.slice.call(state.overlay.querySelectorAll(".screen-break-pad"))
      : [];
  }

  function setPadsEnabled(on) {
    getPads().forEach(function (btn) {
      btn.disabled = !on;
    });
    var replay = document.getElementById("screen-break-replay");
    if (replay) replay.hidden = !on;
  }

  function flashPad(id, ms) {
    ms = ms || 420;
    return new Promise(function (resolve) {
      var btn = getPads().filter(function (b) {
        return b.dataset.colorId === id;
      })[0];
      if (!btn) {
        resolve();
        return;
      }
      btn.classList.add("is-lit");
      later(function () {
        btn.classList.remove("is-lit");
        later(resolve, 160);
      }, ms);
    });
  }

  function playSequence() {
    state.showingSequence = true;
    state.inputIndex = 0;
    setPadsEnabled(false);
    setPuzzleStatus("Watch carefully…");
    setLive("Playing memory sequence.");

    var chain = Promise.resolve();
    state.sequence.forEach(function (id) {
      chain = chain.then(function () {
        return flashPad(id, 480);
      });
    });
    chain.then(function () {
      state.showingSequence = false;
      setPadsEnabled(true);
      setPuzzleStatus("Your turn — click the pads or press keys 1–" + CONFIG.colors.length + ".");
      setLive("Your turn. Repeat the sequence.");
      var first = getPads()[0];
      if (first) first.focus();
    });
  }

  function onPadInput(colorId) {
    if (state.phase !== "puzzle" || state.showingSequence) return;
    var expected = state.sequence[state.inputIndex];
    flashPad(colorId, 220);
    if (colorId !== expected) {
      setPuzzleStatus("Not quite — watch again.");
      setLive("Incorrect. Replaying sequence.");
      state.inputIndex = 0;
      later(playSequence, 700);
      return;
    }
    state.inputIndex += 1;
    if (state.inputIndex >= state.sequence.length) {
      completeBreak();
    } else {
      setPuzzleStatus(
        "Good — " + state.inputIndex + " of " + state.sequence.length
      );
    }
  }

  function startPuzzlePhase() {
    state.phase = "puzzle";
    state.solveDeadlineAt = Date.now() + CONFIG.solveTimeoutMs;
    state.puzzleToken = makePuzzleToken();
    state.sequence = randomSequence(CONFIG.sequenceLength);
    state.inputIndex = 0;

    var cd = document.getElementById("screen-break-countdown");
    var pz = document.getElementById("screen-break-puzzle");
    if (cd) cd.hidden = true;
    if (pz) pz.hidden = false;

    document.getElementById("screen-break-title").textContent = "Unlock to continue";
    setDesc(
      "Repeat the memory sequence to resume. If you don’t finish in time, you’ll be signed out."
    );
    setLive("Break over. Unlock puzzle ready.");
    setPuzzleStatus("");

    /* Local solve timeout (also honor server breakDeadline via status poll) */
    later(function () {
      if (state.phase === "puzzle") {
        doLogout("Screen break timed out — signed out for safety.");
      }
    }, CONFIG.solveTimeoutMs);

    later(playSequence, 400);
  }

  /* —— Break phase —— */
  function beginBreak(fromServer, serverData) {
    if (state.locked) return;
    state.locked = true;
    state.phase = "break";
    state.activityAccumMs = 0;
    var breakMs = CONFIG.breakDurationMs;
    if (
      serverData &&
      typeof serverData.secondsRemaining === "number" &&
      serverData.secondsRemaining > 0
    ) {
      /* One-shot align with server remaining — do not mutate CONFIG permanently */
      breakMs = Math.min(breakMs, Math.max(1000, serverData.secondsRemaining * 1000));
    }
    state.breakEndsAt = Date.now() + breakMs;

    showOverlay();

    var cd = document.getElementById("screen-break-countdown");
    var pz = document.getElementById("screen-break-puzzle");
    if (cd) cd.hidden = false;
    if (pz) pz.hidden = true;

    document.getElementById("screen-break-title").textContent = "Time for a break";
    setDesc(
      fromServer
        ? "Your session requires a short screen break."
        : "You’ve been away from the keyboard for a while. Take " +
            Math.round(breakMs / 1000) +
            " seconds to rest, then unlock to continue — or you’ll be signed out."
    );
    setLive("Screen locked for a " + Math.round(breakMs / 1000) + " second break.");

    var secsEl = document.getElementById("screen-break-secs");
    if (secsEl) secsEl.textContent = String(Math.ceil(breakMs / 1000));
    function tickCountdown() {
      if (state.phase !== "break") return;
      var left = Math.max(0, Math.ceil((state.breakEndsAt - Date.now()) / 1000));
      if (secsEl) secsEl.textContent = String(left);
      setLive(left + " seconds remaining on screen break.");
      if (left <= 0) {
        startPuzzlePhase();
        return;
      }
      later(tickCountdown, 250);
    }
    tickCountdown();
  }

  function completeBreak() {
    state.phase = "unlocking";
    setPadsEnabled(false);
    setPuzzleStatus("Unlocked — welcome back.");
    setLive("Puzzle solved. Session resumed.");

    var token = state.puzzleToken;
    fetchJson("/session/break/complete", {
      method: "POST",
      body: { puzzleToken: token },
    })
      .then(function () {
        state.apiAvailable = true;
      })
      .catch(function () {
        state.apiAvailable = false;
        /* Local fallback: treat as success */
      })
      .then(function () {
        later(function () {
          hideOverlay();
          state.locked = false;
          state.phase = "idle";
          state.activityAccumMs = 0;
          state.lastTickAt = Date.now();
          state.puzzleToken = null;
        }, 600);
      });
  }

  /* —— AFK idle / heartbeat ——
   * Keyboard, mouse, touch, scroll, or click resets idle time.
   * Only uninterrupted idle (away from keyboard) counts toward the hourly break.
   */
  function noteActivity() {
    if (!state.running || state.locked || !sessionActive()) return;
    state.activityAccumMs = 0;
    state.lastTickAt = Date.now();
  }

  function sendHeartbeat() {
    if (!state.running || !sessionActive() || state.locked) return;
    fetchJson("/session/activity", { method: "POST", body: {} })
      .then(function (data) {
        state.apiAvailable = true;
        if (data && data.breakRequired === true) {
          beginBreak(true, data);
        }
      })
      .catch(function () {
        state.apiAvailable = false;
      });
  }

  function pollStatus() {
    if (!state.running || !sessionActive()) return;
    fetchJson("/session/status")
      .then(function (data) {
        state.apiAvailable = true;
        /* Only explicit false from a real API — missing field must not log out */
        if (data.authenticated === false) {
          doLogout("Session expired — please sign in again.");
          return;
        }
        if (data.breakRequired === true && !state.locked) {
          beginBreak(true, data);
        }
        if (
          state.locked &&
          data.breakDeadline &&
          Date.now() > Date.parse(data.breakDeadline)
        ) {
          doLogout("Break deadline passed — signed out.");
        }
      })
      .catch(function () {
        state.apiAvailable = false;
      });
  }

  function onVisibility() {
    /* Tab hide/show does not count as keyboard activity — idle continues. */
  }

  var activityEvents = [
    "mousemove",
    "mousedown",
    "keydown",
    "touchstart",
    "scroll",
    "click",
  ];

  function startInternal() {
    if (state.running) return;
    state.running = true;
    state.activityAccumMs = 0;
    state.lastTickAt = Date.now();
    ensureOverlay();

    activityEvents.forEach(function (ev) {
      document.addEventListener(ev, noteActivity, { passive: true });
    });
    document.addEventListener("visibilitychange", onVisibility);

    /* Idle tick: accumulate time since last keyboard/mouse activity */
    every(function () {
      if (!state.running || state.locked || !sessionActive()) return;
      var now = Date.now();
      if (!state.lastTickAt) state.lastTickAt = now;
      /* Hidden tab still counts as AFK (away); keep accumulating */
      state.activityAccumMs = now - state.lastTickAt;
      if (state.activityAccumMs >= CONFIG.activityLimitMs) {
        beginBreak(false);
      }
    }, 1000);

    every(sendHeartbeat, CONFIG.heartbeatIntervalMs);
    every(pollStatus, CONFIG.statusPollIntervalMs);
    /* Immediate status check */
    later(pollStatus, 500);
  }

  function stopInternal(hide) {
    if (!state.running && !state.locked) return;
    state.running = false;
    clearTimers();
    activityEvents.forEach(function (ev) {
      document.removeEventListener(ev, noteActivity);
    });
    document.removeEventListener("visibilitychange", onVisibility);
    if (hide) {
      hideOverlay();
      state.locked = false;
      state.phase = "idle";
    }
  }

  function start() {
    if (!sessionActive()) return;
    startInternal();
  }

  function stop() {
    stopInternal(true);
  }

  function forceBreak() {
    if (!sessionActive()) return;
    if (!state.running) startInternal();
    beginBreak(false);
  }

  function applyConfig(partial) {
    if (!partial || typeof partial !== "object") return CONFIG;
    Object.keys(partial).forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(CONFIG, k)) {
        CONFIG[k] = partial[k];
      }
    });
    if (partial.useDemoTimings === false && partial.activityLimitMs == null) {
      CONFIG.activityLimitMs = PRODUCTION_ACTIVITY_MS;
    }
    if (partial.useDemoTimings === true && partial.activityLimitMs == null) {
      CONFIG.activityLimitMs = DEMO_ACTIVITY_MS;
    }
    return CONFIG;
  }

  window.CognationScreenBreak = {
    start: start,
    stop: stop,
    forceBreak: forceBreak,
    config: function (partial) {
      if (partial) return applyConfig(partial);
      return Object.assign({}, CONFIG);
    },
    isLocked: function () {
      return !!state.locked;
    },
    getState: function () {
      return {
        running: state.running,
        locked: state.locked,
        phase: state.phase,
        activityAccumMs: state.activityAccumMs,
        apiAvailable: state.apiAvailable,
      };
    },
  };

  function onSessionStarted() {
    start();
  }

  function onSessionEnded() {
    stop();
  }

  document.addEventListener("cognation:session-started", onSessionStarted);
  document.addEventListener("cognation:session-ended", onSessionEnded);

  function boot() {
    /* Do not arm AFK polling from a local session until auth boot confirms it.
       login.js closeGate() dispatches session-started; whenReady covers the
       case where that event already fired before this script ran. */
    var ready = window.CognationAuth && window.CognationAuth.whenReady;
    if (ready && typeof ready.then === "function") {
      ready.then(function () {
        if (sessionActive()) start();
      });
      return;
    }
    if (sessionActive()) start();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
