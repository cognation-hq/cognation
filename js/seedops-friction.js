/**
 * SeedOps — friction-event instrumentation for real beta users.
 * Structured objective logs where a user stalls, retries, or abandons a pathway.
 * Events only — no bot ratings of humans.
 *
 * Event shape (channel "friction"):
 *   {
 *     pathway: "tower"|"commune"|"news"|"circle"|"chat"|"classroom"|"dating"|"ad",
 *     phase: "start"|"stall"|"retry"|"abandon"|"complete",
 *     surface: string,
 *     sessionId: string,
 *     userKind: "real"|"seed"|"ops"|"guest",
 *     dwellMs?: number,
 *     attempt?: number,
 *     reason?: string,
 *     meta?: object
 *   }
 */
(function () {
  "use strict";

  var PATHWAYS = ["tower", "commune", "news", "circle", "chat", "classroom", "dating", "ad"];
  var STALL_MS = 45000;
  var state = {
    sessionId: "",
    active: null,
    attempts: {},
  };

  function log(payload) {
    if (window.CognationSeedOpsLog) return window.CognationSeedOpsLog.write("friction", payload);
    return null;
  }

  function sessionId() {
    if (state.sessionId) return state.sessionId;
    try {
      var s =
        window.CognationAuth && window.CognationAuth.getSession
          ? window.CognationAuth.getSession()
          : null;
      state.sessionId =
        (s && (s.supabaseUserId || s.username || s.activeProfileId)) ||
        "guest-" + Math.random().toString(36).slice(2, 8);
    } catch (e) {
      state.sessionId = "guest-" + Math.random().toString(36).slice(2, 8);
    }
    return state.sessionId;
  }

  function userKind() {
    try {
      var gate = window.CognationSeedOpsFriendGate;
      var rec = gate && gate.viewerRecord ? gate.viewerRecord() : null;
      if (window.CognationSeedOps && window.CognationSeedOps.classify) {
        return window.CognationSeedOps.classify(rec || {}).accountKind || "real";
      }
    } catch (e) {}
    return "real";
  }

  function normalizePathway(name) {
    var p = String(name || "").toLowerCase();
    if (p === "ads") p = "ad";
    if (PATHWAYS.indexOf(p) < 0) return "";
    return p;
  }

  function clearStallTimer() {
    if (state.active && state.active.timer) {
      clearTimeout(state.active.timer);
      state.active.timer = null;
    }
  }

  function track(pathway, phase, opts) {
    pathway = normalizePathway(pathway);
    if (!pathway) return null;
    /* Objective instrumentation is for real beta users; seed/ops fleet noise is skipped. */
    var kind = userKind();
    if (kind === "seed" || kind === "ops") {
      return null;
    }
    opts = opts || {};
    var key = pathway + ":" + (opts.surface || "");
    if (phase === "start" || phase === "retry") {
      state.attempts[key] = (state.attempts[key] || 0) + (phase === "retry" ? 1 : 0);
      if (phase === "start") state.attempts[key] = Math.max(1, state.attempts[key] || 1);
    }
    var row = {
      pathway: pathway,
      phase: phase,
      surface: opts.surface || pathway,
      sessionId: sessionId(),
      userKind: kind,
      attempt: state.attempts[key] || 1,
      dwellMs: opts.dwellMs,
      reason: opts.reason || "",
      meta: opts.meta || {},
      at: new Date().toISOString(),
    };
    return log(row);
  }

  function begin(pathway, surface) {
    pathway = normalizePathway(pathway);
    if (!pathway) return;
    clearStallTimer();
    var startedAt = Date.now();
    state.active = {
      pathway: pathway,
      surface: surface || pathway,
      startedAt: startedAt,
      timer: null,
    };
    track(pathway, "start", { surface: surface });
    state.active.timer = setTimeout(function () {
      if (!state.active || state.active.pathway !== pathway) return;
      track(pathway, "stall", {
        surface: surface,
        dwellMs: Date.now() - startedAt,
        reason: "idle_threshold",
      });
    }, STALL_MS);
  }

  function retry(pathway, reason) {
    track(pathway, "retry", {
      surface: state.active && state.active.surface,
      reason: reason || "user_retry",
      dwellMs: state.active ? Date.now() - state.active.startedAt : undefined,
    });
  }

  function complete(pathway) {
    pathway = normalizePathway(pathway) || (state.active && state.active.pathway);
    if (!pathway) return;
    track(pathway, "complete", {
      surface: state.active && state.active.surface,
      dwellMs: state.active ? Date.now() - state.active.startedAt : undefined,
    });
    if (state.active && state.active.pathway === pathway) {
      clearStallTimer();
      state.active = null;
    }
  }

  function abandon(pathway, reason) {
    pathway = normalizePathway(pathway) || (state.active && state.active.pathway);
    if (!pathway) return;
    track(pathway, "abandon", {
      surface: state.active && state.active.surface,
      reason: reason || "navigate_away",
      dwellMs: state.active ? Date.now() - state.active.startedAt : undefined,
    });
    if (state.active && state.active.pathway === pathway) {
      clearStallTimer();
      state.active = null;
    }
  }

  function onTabChange(name) {
    var map = {
      tower: "tower",
      news: "news",
      commune: "commune",
      circle: "circle",
      well: null,
      pages: null,
    };
    var next = map[String(name || "").toLowerCase()];
    if (state.active && state.active.pathway && state.active.pathway !== next) {
      abandon(state.active.pathway, "tab_change");
    }
    if (next) begin(next, "tab:" + next);
  }

  function wireUi() {
    document.addEventListener("cognation:tab-change", function (ev) {
      var name = ev && ev.detail && (ev.detail.tab || ev.detail.name || ev.detail.id);
      onTabChange(name);
    });
    /* Fallback: observe topbar tab clicks */
    document.addEventListener("click", function (ev) {
      var tab = ev.target && ev.target.closest && ev.target.closest("[role='tab']");
      if (!tab || !tab.id) return;
      var id = String(tab.id || "").replace(/^tab-/, "");
      onTabChange(id);
      var shortcut = ev.target.closest("[data-tower-anchor='circle']");
      if (shortcut) onTabChange("circle");
    });
    document.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest("[data-tower-compose], [data-tower-post-submit], [data-tower-feed]")) {
        if (state.active && state.active.pathway === "tower") {
          /* activity pings reset stall */
          begin("tower", "tower-compose");
        } else {
          begin("tower", "tower-compose");
        }
      }
      if (t.closest("[data-commune-swipe], .commune-swipe-btn, [data-card-type]")) {
        begin("commune", "commune-swipe");
      }
      if (t.closest("[data-card-type='chatroom']")) begin("chat", "chatroom-card");
      if (t.closest("[data-card-type='dating'], [data-card-type='speed-dating'], [data-commune-see-dating]")) {
        begin("dating", "dating");
      }
      if (t.closest("[data-card-type='ad'], [data-card-type='advertisement']")) {
        begin("ad", "ad-card");
      }
      if (t.closest("[data-classroom], [data-card-type='classroom']")) {
        begin("classroom", "classroom");
      }
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden" && state.active) {
        abandon(state.active.pathway, "page_hidden");
      }
    });
  }

  window.CognationFriction = {
    PATHWAYS: PATHWAYS.slice(),
    STALL_MS: STALL_MS,
    track: track,
    begin: begin,
    retry: retry,
    complete: complete,
    abandon: abandon,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireUi);
  } else {
    wireUi();
  }
})();
