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

  function skipFleet() {
    var kind = userKind();
    return kind === "seed" || kind === "ops";
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
    if (!pathway) return null;
    if (skipFleet()) return null;
    if (state.active && state.active.pathway && state.active.pathway !== pathway) {
      /* Closing the prior pathway keeps stall/abandon accounting honest across surfaces. */
      track(state.active.pathway, "abandon", {
        surface: state.active.surface,
        reason: "pathway_switch",
        dwellMs: Date.now() - state.active.startedAt,
      });
      clearStallTimer();
      state.active = null;
    }
    clearStallTimer();
    var startedAt = Date.now();
    state.active = {
      pathway: pathway,
      surface: surface || pathway,
      startedAt: startedAt,
      timer: null,
    };
    var row = track(pathway, "start", { surface: surface });
    state.active.timer = setTimeout(function () {
      if (!state.active || state.active.pathway !== pathway) return;
      track(pathway, "stall", {
        surface: surface,
        dwellMs: Date.now() - startedAt,
        reason: "idle_threshold",
      });
    }, STALL_MS);
    return row;
  }

  function retry(pathway, reason) {
    if (skipFleet()) return null;
    return track(pathway, "retry", {
      surface: state.active && state.active.surface,
      reason: reason || "user_retry",
      dwellMs: state.active ? Date.now() - state.active.startedAt : undefined,
    });
  }

  function complete(pathway) {
    pathway = normalizePathway(pathway) || (state.active && state.active.pathway);
    if (!pathway) return null;
    if (skipFleet()) return null;
    var row = track(pathway, "complete", {
      surface: state.active && state.active.surface,
      dwellMs: state.active ? Date.now() - state.active.startedAt : undefined,
    });
    if (state.active && state.active.pathway === pathway) {
      clearStallTimer();
      state.active = null;
    }
    return row;
  }

  function abandon(pathway, reason) {
    pathway = normalizePathway(pathway) || (state.active && state.active.pathway);
    if (!pathway) return null;
    if (skipFleet()) return null;
    var row = track(pathway, "abandon", {
      surface: state.active && state.active.surface,
      reason: reason || "navigate_away",
      dwellMs: state.active ? Date.now() - state.active.startedAt : undefined,
    });
    if (state.active && state.active.pathway === pathway) {
      clearStallTimer();
      state.active = null;
    }
    return row;
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

  function pathwayFromCardType(type) {
    var t = String(type || "").toLowerCase();
    if (t === "speed-dating" || t === "dating") return "dating";
    if (t === "advertisement" || t === "ad") return "ad";
    if (t === "chatroom" || t === "chat") return "chat";
    if (t === "classroom") return "classroom";
    return "commune";
  }

  function wireUi() {
    document.addEventListener("cognation:tab-change", function (ev) {
      var name = ev && ev.detail && (ev.detail.tab || ev.detail.name || ev.detail.id);
      onTabChange(name);
    });
    /* Pathway modules may emit: { pathway, phase, surface?, reason?, meta? } */
    document.addEventListener("cognation:friction", function (ev) {
      var d = (ev && ev.detail) || {};
      var pathway = d.pathway;
      var phase = String(d.phase || "").toLowerCase();
      if (!pathway || !phase) return;
      if (phase === "start" || phase === "begin") begin(pathway, d.surface);
      else if (phase === "retry") retry(pathway, d.reason);
      else if (phase === "complete") complete(pathway);
      else if (phase === "abandon") abandon(pathway, d.reason);
      else track(pathway, phase, d);
    });
    /* Fallback: main topbar tabs only (ignore tower side / commune dots). */
    document.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var shortcut = t.closest("[data-tower-anchor='circle']");
      if (shortcut) {
        onTabChange("circle");
        return;
      }
      var tab = t.closest("[role='tab']");
      if (!tab || !tab.id) return;
      if (!/^tab-(tower|news|commune)$/i.test(tab.id)) return;
      onTabChange(String(tab.id).replace(/^tab-/, ""));
    });
    document.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest("[data-friction-retry]")) {
        var retryEl = t.closest("[data-friction-retry]");
        retry(retryEl.getAttribute("data-friction-retry") || (state.active && state.active.pathway), retryEl.getAttribute("data-friction-reason") || "user_retry");
        return;
      }
      if (t.closest("[data-tower-compose], [data-tower-post-submit], [data-tower-feed]")) {
        begin("tower", "tower-compose");
      }
      if (t.closest("[data-commune-feed-compose], [data-commune-refresh], [data-commune-edition]")) {
        begin("news", "news-feed");
      }
      if (t.closest("[data-commune-swipe], .commune-swipe-btn")) {
        var card = t.closest("[data-commune-card]") || document.querySelector("[data-commune-card].is-active");
        var ctype = card && card.getAttribute("data-card-type");
        begin(pathwayFromCardType(ctype), "commune-swipe");
      } else if (t.closest("[data-card-type]")) {
        var typed = t.closest("[data-card-type]");
        begin(pathwayFromCardType(typed.getAttribute("data-card-type")), "card:" + (typed.getAttribute("data-card-type") || "commune"));
      }
      if (t.closest("[data-commune-enter-sim], [data-card-type='chatroom']")) begin("chat", "chatroom");
      if (t.closest("[data-commune-see-dating], [data-commune-dating-toggle]")) begin("dating", "dating-toggle");
      if (t.closest("[data-commune-enter-classroom], [data-classroom], [data-card-type='classroom']")) {
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
    pathwayFromCardType: pathwayFromCardType,
    onTabChange: onTabChange,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireUi);
  } else {
    wireUi();
  }
})();
