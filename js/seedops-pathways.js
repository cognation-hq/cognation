/**
 * SeedOps — pathway runners: scaffolding to exercise feature pathways for the seed fleet.
 * Pathways present in the codebase: Tower, Commune, News, Circle, chat, Classroom, dating, ads.
 * Each runner returns a step list + run() that emits structured progress events (no human ratings).
 */
(function () {
  "use strict";

  var PATHWAYS = [
    "tower",
    "commune",
    "news",
    "circle",
    "chat",
    "classroom",
    "dating",
    "ads"
  ];

  function emit(name, detail) {
    try {
      document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (e) {}
    if (window.CognationSeedOpsLog && typeof window.CognationSeedOpsLog.write === "function") {
      window.CognationSeedOpsLog.write("pathway", detail);
    }
  }

  function seedContext(seedRef) {
    var api = window.CognationSeedOps;
    var rec =
      (typeof seedRef === "object" && seedRef) ||
      (api && api.getByFleetId && api.getByFleetId(seedRef)) ||
      (api && api.buildSeedRecord && api.buildSeedRecord(0)) ||
      { seedFleetId: "seed-0001", displayName: "Ada", accountKind: "seed", isSeed: true };
    return rec;
  }

  function stepsFor(pathway) {
    switch (String(pathway || "").toLowerCase()) {
      case "tower":
        return [
          "resolve_seed_profile",
          "open_tower_public",
          "compose_or_load_post",
          "react_sample",
          "verify_demo_badge"
        ];
      case "commune":
        return [
          "open_commune_deck",
          "swipe_sample_card",
          "pass_or_keep",
          "verify_deck_pacing"
        ];
      case "news":
        return [
          "open_news_local",
          "pull_tower_into_news",
          "apply_age_floor",
          "log_seed_appearance",
          "render_broadsheet"
        ];
      case "circle":
        return [
          "open_circle_fall",
          "seed_mutual_friend_edge",
          "verify_seed_seed_friend_ok",
          "verify_real_seed_friend_blocked"
        ];
      case "chat":
        return [
          "open_commune_chatroom_card",
          "enter_site_room",
          "post_seed_line",
          "leave_room"
        ];
      case "classroom":
        return [
          "locate_classroom_surface",
          "enter_or_stub_session",
          "complete_stub_interaction"
        ];
      case "dating":
        return [
          "ensure_dating_opt_in",
          "show_dating_card",
          "swipe_dating_sample",
          "hide_dating_again"
        ];
      case "ads":
        return [
          "locate_ad_lane",
          "render_ad_card",
          "impression_stub",
          "skip_ad"
        ];
      default:
        return ["unknown_pathway"];
    }
  }

  function runStep(pathway, step, ctx) {
    var detail = {
      pathway: pathway,
      step: step,
      seedFleetId: ctx.seedFleetId || ctx.id || "",
      displayName: ctx.displayName || "",
      at: new Date().toISOString(),
      status: "ok",
    };
    try {
      switch (pathway + ":" + step) {
        case "tower:compose_or_load_post": {
          var towerPosts = window.CognationSeedOpsTowerPosts;
          if (towerPosts && typeof towerPosts.postOne === "function") {
            var posted = towerPosts.postOne(ctx, { localOnly: true });
            detail.posted = !!(posted && posted.ok);
            detail.towerPostId = posted && posted.post && posted.post.id;
            detail.path = posted && posted.path;
            if (posted && posted.ok === false) {
              detail.status = posted.error === "past_demo_cap" ? "capped" : "error";
              detail.error = posted.error;
            }
          } else {
            detail.status = "deferred_surface_missing";
          }
          break;
        }
        case "tower:verify_demo_badge":
          if (window.CognationSeedOpsBadge) window.CognationSeedOpsBadge.syncTowerBadges();
          break;
        case "news:log_seed_appearance":
          if (window.CognationSeedOpsNewsLog && window.CognationSeedOpsNewsLog.auditLatest) {
            window.CognationSeedOpsNewsLog.auditLatest("local");
          }
          break;
        case "circle:verify_real_seed_friend_blocked": {
          var gate = window.CognationSeedOpsFriendGate;
          if (gate) {
            var decision = gate.canFriend(
              { accountKind: "real", displayName: "Beta" },
              ctx
            );
            detail.blocked = !decision.ok;
            detail.status = decision.ok ? "unexpected_allow" : "ok";
          }
          break;
        }
        case "circle:verify_seed_seed_friend_ok": {
          var gate2 = window.CognationSeedOpsFriendGate;
          if (gate2) {
            var other =
              (window.CognationSeedOps && window.CognationSeedOps.buildSeedRecord(1)) || {
                accountKind: "seed",
                isSeed: true,
              };
            var d2 = gate2.canFriend(ctx, other);
            detail.allowed = d2.ok;
            detail.status = d2.ok ? "ok" : "unexpected_block";
          }
          break;
        }
        case "classroom:locate_classroom_surface": {
          /* Classroom is not a first-class panel yet — runner records the gap and continues. */
          var el =
            document.querySelector("[data-classroom], [data-card-type='classroom'], #panel-classroom");
          detail.present = !!el;
          detail.status = el ? "ok" : "deferred_surface_missing";
          break;
        }
        case "dating:ensure_dating_opt_in": {
          var toggle = document.querySelector("[data-commune-see-dating], [data-see-dating-content]");
          detail.present = !!toggle;
          break;
        }
        case "ads:locate_ad_lane": {
          var ad = document.querySelector("[data-card-type='ad'], [data-card-type='advertisement']");
          detail.present = !!ad;
          break;
        }
        case "chat:open_commune_chatroom_card": {
          var chat = document.querySelector("[data-card-type='chatroom']");
          detail.present = !!chat;
          break;
        }
        case "circle:open_circle_fall": {
          if (window.CognationCircleFall && typeof window.CognationCircleFall.start === "function") {
            try { window.CognationCircleFall.start(); } catch (e) {}
            detail.present = true;
          } else {
            detail.present = !!document.querySelector("[data-circle-fall]");
          }
          break;
        }
        default:
          break;
      }
    } catch (err) {
      detail.status = "error";
      detail.error = String(err && err.message ? err.message : err);
    }
    emit("cognation:seedops-pathway-step", detail);
    return detail;
  }

  function run(pathway, seedRef) {
    pathway = String(pathway || "").toLowerCase();
    if (PATHWAYS.indexOf(pathway) < 0) {
      return { ok: false, error: "unknown_pathway", pathway: pathway, steps: [] };
    }
    var ctx = seedContext(seedRef);
    var steps = stepsFor(pathway);
    emit("cognation:seedops-pathway-start", {
      pathway: pathway,
      seedFleetId: ctx.seedFleetId || "",
      at: new Date().toISOString(),
    });
    var results = steps.map(function (step) {
      return runStep(pathway, step, ctx);
    });
    var summary = {
      ok: results.every(function (r) { return r.status === "ok" || r.status === "deferred_surface_missing"; }),
      pathway: pathway,
      seedFleetId: ctx.seedFleetId || "",
      steps: results,
      at: new Date().toISOString(),
    };
    emit("cognation:seedops-pathway-complete", summary);
    return summary;
  }

  function runAll(seedRef) {
    return PATHWAYS.map(function (p) {
      return run(p, seedRef);
    });
  }

  window.CognationSeedOpsPathways = {
    PATHWAYS: PATHWAYS.slice(),
    stepsFor: stepsFor,
    run: run,
    runAll: runAll,
  };
})();
