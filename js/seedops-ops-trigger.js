/**
 * SeedOps — internal ops trigger surface (hook #3).
 *
 * Controlled pathway kick for curator / mod / wire / SeedOps after auth bind.
 * Arms ONLY for ops or seed sessions (seedops metadata / known ops fleet ids).
 * Never arms for real users. Never a public Demo control that unlocks WELL/sign-in.
 *
 * Act-as targets a fleet id for CognationSeedOpsPathways context only — it does
 * NOT impersonate auth.uid(), spoof friend requests, or bypass friend/policy
 * rules. Real-user targets are refused.
 */
(function () {
  "use strict";

  var HASH = "seedops-ops";
  var QUERY = "seedops-ops";
  var PANEL_ATTR = "data-seedops-ops-panel";
  var OPS_FLEET_IDS = ["ops-curator", "ops-mod", "ops-wire"];
  var WAVE1_MAX = 100;
  var DEMO_CAP = 250;

  function emitLog(payload) {
    if (window.CognationSeedOpsLog && typeof window.CognationSeedOpsLog.write === "function") {
      window.CognationSeedOpsLog.write("ops-trigger", payload || {});
    }
    try {
      document.dispatchEvent(
        new CustomEvent("cognation:seedops-ops-trigger", { detail: payload || {} })
      );
    } catch (e) {}
  }

  function classify(record) {
    var api = window.CognationSeedOps;
    if (api && typeof api.classify === "function") return api.classify(record || {});
    var kind = String((record && record.accountKind) || "").toLowerCase();
    return {
      accountKind: kind || "real",
      isSeed: kind === "seed",
      isOpsBot: kind === "ops",
    };
  }

  function knownOpsId(fleetId) {
    var id = String(fleetId || "");
    return OPS_FLEET_IDS.indexOf(id) >= 0;
  }

  function fleetLooksSeedOrOps(fleetId) {
    var id = String(fleetId || "");
    if (knownOpsId(id)) return true;
    if (/^ops-/.test(id)) return true;
    if (/^seed-\d{1,4}$/.test(id)) return true;
    return false;
  }

  function readSupabaseMeta() {
    try {
      var sb = window.CognationSupabase;
      if (!sb || typeof sb.getUser !== "function") return null;
      var user = sb.getUser();
      if (!user) return null;
      var app = user.app_metadata || user.appMetadata || {};
      var um = user.user_metadata || user.userMetadata || {};
      return {
        seedops: !!(app.seedops || um.seedops),
        accountKind: String(app.account_kind || app.accountKind || um.account_kind || um.accountKind || ""),
        seedFleetId: String(app.seed_fleet_id || app.seedFleetId || um.seed_fleet_id || um.seedFleetId || ""),
        email: String(user.email || ""),
      };
    } catch (e) {
      return null;
    }
  }

  function readActiveProfile() {
    try {
      var session =
        window.CognationAuth && typeof window.CognationAuth.getSession === "function"
          ? window.CognationAuth.getSession()
          : null;
      if (!session) return null;
      var profile = null;
      if (session.activeProfileId && window.CognationAccounts && window.CognationAccounts.getProfileById) {
        profile = window.CognationAccounts.getProfileById(session.activeProfileId);
      }
      return {
        session: session,
        profile: profile,
        username: String(session.username || session.profileHandle || ""),
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Resolve the signed-in operator. Returns null when the session is real / unarmed.
   */
  function resolveOperator() {
    var active = readActiveProfile();
    var meta = readSupabaseMeta();
    var profile = (active && active.profile) || null;
    var c = classify(profile || {});
    var username = (active && active.username) || "";
    var fleetFromProfile = String((profile && (profile.seedFleetId || profile.handle)) || "");
    var fleetFromMeta = (meta && meta.seedFleetId) || "";
    var fleetFromUser = "";
    if (/^(ops-curator|ops-mod|ops-wire)$/.test(username)) fleetFromUser = username;
    else if (/^seed-\d{1,4}$/.test(username)) fleetFromUser = username;
    else if (/^ops-/.test(username)) fleetFromUser = username;
    else if (/@ops\.cognation\.internal$/i.test((meta && meta.email) || "")) {
      var local = String(meta.email).split("@")[0];
      if (knownOpsId(local)) fleetFromUser = local;
    } else if (/@seed\.cognation\.internal$/i.test((meta && meta.email) || "")) {
      var seedLocal = String(meta.email).split("@")[0];
      if (/^seed-\d{1,4}$/.test(seedLocal)) fleetFromUser = seedLocal;
    }

    var kind =
      c.accountKind ||
      (meta && meta.accountKind) ||
      (meta && meta.seedops ? "seed" : "") ||
      "";
    if (!kind || kind === "real") {
      if (knownOpsId(fleetFromProfile) || knownOpsId(fleetFromMeta) || knownOpsId(fleetFromUser)) {
        kind = "ops";
      } else if (
        fleetLooksSeedOrOps(fleetFromProfile) ||
        fleetLooksSeedOrOps(fleetFromMeta) ||
        fleetLooksSeedOrOps(fleetFromUser) ||
        (meta && meta.seedops)
      ) {
        kind = /^ops-/.test(fleetFromProfile || fleetFromMeta || fleetFromUser) ? "ops" : "seed";
      }
    }

    if (kind !== "ops" && kind !== "seed") {
      return null;
    }

    /* Prefer explicit seedops metadata for seed; ops bots always qualify by fleet id. */
    var fleetId = fleetFromMeta || fleetFromProfile || fleetFromUser || "";
    if (kind === "seed" && !(meta && meta.seedops) && !fleetLooksSeedOrOps(fleetId)) {
      return null;
    }
    if (!fleetId && kind === "ops") fleetId = OPS_FLEET_IDS[0];
    if (!fleetId && kind === "seed") fleetId = "seed-0001";

    return {
      accountKind: kind,
      seedFleetId: fleetId,
      isOpsBot: kind === "ops",
      isSeed: kind === "seed",
      displayName: (profile && profile.displayName) || fleetId,
      username: username,
      seedopsMeta: !!(meta && meta.seedops),
    };
  }

  function isArmed() {
    return !!resolveOperator();
  }

  /**
   * Act-as may only target seed/ops fleet ids. Refuses real users so pathway
   * scaffolding cannot be pointed at a human identity (friend/policy safe).
   */
  function canActAs(targetFleetId) {
    var op = resolveOperator();
    if (!op) {
      return { ok: false, error: "not_armed", reason: "Operator session is not ops/seedops." };
    }
    var target = String(targetFleetId == null || targetFleetId === "" ? op.seedFleetId : targetFleetId);
    if (!target) {
      return { ok: false, error: "missing_target", reason: "No seed_fleet_id." };
    }
    if (!fleetLooksSeedOrOps(target)) {
      return {
        ok: false,
        error: "real_user_target_refused",
        reason:
          "Act-as refuses real-user targets. Pathway context is seed/ops fleet ids only; friend/policy rules stay enforced by friend-gate + auth.uid().",
        target: target,
      };
    }
    var rec =
      (window.CognationSeedOps && window.CognationSeedOps.getByFleetId && window.CognationSeedOps.getByFleetId(target)) ||
      null;
    if (!rec && !knownOpsId(target) && !/^seed-\d{1,4}$/.test(target)) {
      return { ok: false, error: "unknown_fleet_id", reason: "Unknown seed_fleet_id.", target: target };
    }
    /* Soft cap awareness — still allow known ids; document Wave 1 / 250 caps in docs. */
    var m = /^seed-(\d{1,4})$/.exec(target);
    var idx = m ? parseInt(m[1], 10) : 0;
    return {
      ok: true,
      target: target,
      record: rec,
      operator: op,
      withinWave1: !idx || idx <= WAVE1_MAX,
      withinDemoCap: !idx || idx <= DEMO_CAP,
    };
  }

  function triggerPathway(pathway, targetFleetId) {
    var gate = canActAs(targetFleetId);
    if (!gate.ok) {
      emitLog({
        action: "trigger_pathway",
        ok: false,
        error: gate.error,
        reason: gate.reason,
        pathway: pathway,
        target: targetFleetId || "",
      });
      return { ok: false, error: gate.error, reason: gate.reason, pathway: pathway };
    }
    var api = window.CognationSeedOpsPathways;
    if (!api || typeof api.run !== "function") {
      var missing = { ok: false, error: "pathways_unavailable", pathway: pathway, target: gate.target };
      emitLog({ action: "trigger_pathway", ok: false, error: "pathways_unavailable", target: gate.target });
      return missing;
    }
    emitLog({
      action: "trigger_pathway",
      ok: true,
      pathway: pathway,
      target: gate.target,
      operator: gate.operator.seedFleetId,
      accountKind: gate.operator.accountKind,
      at: new Date().toISOString(),
    });
    var summary = api.run(pathway, gate.record || gate.target);
    var towerSeed = null;
    if (String(pathway || "").toLowerCase() === "tower") {
      var postsApi = window.CognationSeedOpsTowerPosts;
      if (postsApi && typeof postsApi.postOne === "function") {
        /* Optional shared Tower content for this seed so News-path logging can fire. */
        towerSeed = postsApi.postOne(gate.record || gate.target, { localOnly: true });
        emitLog({
          action: "tower_seed_post",
          ok: !!(towerSeed && towerSeed.ok),
          target: gate.target,
          towerPostId: towerSeed && towerSeed.post && towerSeed.post.id,
          path: towerSeed && towerSeed.path,
          error: towerSeed && towerSeed.error,
        });
      }
    }
    return {
      ok: !!(summary && summary.ok !== false),
      pathway: pathway,
      target: gate.target,
      operator: gate.operator.seedFleetId,
      summary: summary,
      towerSeed: towerSeed,
      note: "Act-as is pathway context only; does not bypass friend/policy or auth.uid().",
    };
  }

  function triggerAll(targetFleetId) {
    var gate = canActAs(targetFleetId);
    if (!gate.ok) {
      emitLog({
        action: "trigger_all",
        ok: false,
        error: gate.error,
        reason: gate.reason,
        target: targetFleetId || "",
      });
      return { ok: false, error: gate.error, reason: gate.reason };
    }
    var api = window.CognationSeedOpsPathways;
    if (!api || typeof api.runAll !== "function") {
      return { ok: false, error: "pathways_unavailable", target: gate.target };
    }
    emitLog({
      action: "trigger_all",
      ok: true,
      target: gate.target,
      operator: gate.operator.seedFleetId,
      at: new Date().toISOString(),
    });
    var results = api.runAll(gate.record || gate.target);
    return {
      ok: Array.isArray(results) && results.every(function (r) { return r && r.ok !== false; }),
      target: gate.target,
      operator: gate.operator.seedFleetId,
      results: results,
      note: "Act-as is pathway context only; does not bypass friend/policy or auth.uid().",
    };
  }

  function gateOpen() {
    try {
      var hash = String(location.hash || "").replace(/^#/, "");
      if (hash === HASH) return true;
      var q = String(location.search || "");
      if (new RegExp("[?&]" + QUERY + "(=1|=true)?(&|$)", "i").test(q)) return true;
    } catch (e) {}
    return false;
  }

  function ensurePanel() {
    var existing = document.querySelector("[" + PANEL_ATTR + "]");
    if (existing) return existing;
    var panel = document.createElement("aside");
    panel.setAttribute(PANEL_ATTR, "1");
    panel.setAttribute("hidden", "");
    panel.setAttribute("aria-hidden", "true");
    panel.setAttribute("role", "complementary");
    panel.setAttribute("aria-label", "SeedOps ops trigger");
    panel.style.cssText =
      "position:fixed;z-index:9998;right:12px;bottom:12px;max-width:320px;padding:12px 14px;" +
      "background:#111827;color:#f9fafb;border:1px solid #374151;border-radius:10px;" +
      "font:13px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35);";
    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">' +
      '<strong style="font-size:13px;">SeedOps ops trigger</strong>' +
      '<button type="button" data-seedops-ops-close style="background:transparent;border:0;color:#9ca3af;cursor:pointer;font-size:16px;" aria-label="Close">×</button>' +
      "</div>" +
      '<p style="margin:0 0 8px;color:#9ca3af;font-size:11px;">Internal pathway kick for ops/seed sessions. Real users never see this panel.</p>' +
      '<label style="display:block;margin-bottom:6px;">Pathway' +
      '<select data-seedops-ops-pathway style="display:block;width:100%;margin-top:2px;background:#1f2937;color:#f9fafb;border:1px solid #4b5563;border-radius:6px;padding:4px 6px;">' +
      '<option value="tower">tower</option>' +
      '<option value="commune">commune</option>' +
      '<option value="news">news</option>' +
      '<option value="circle">circle</option>' +
      '<option value="chat">chat</option>' +
      '<option value="classroom">classroom</option>' +
      '<option value="dating">dating</option>' +
      '<option value="ads">ads</option>' +
      '<option value="__all__">all pathways</option>' +
      "</select></label>" +
      '<label style="display:block;margin-bottom:8px;">Target fleet id' +
      '<input data-seedops-ops-target type="text" placeholder="seed-0001 or self" ' +
      'style="display:block;width:100%;margin-top:2px;box-sizing:border-box;background:#1f2937;color:#f9fafb;border:1px solid #4b5563;border-radius:6px;padding:4px 6px;" />' +
      "</label>" +
      '<button type="button" data-seedops-ops-run ' +
      'style="width:100%;padding:6px 8px;background:#2563eb;color:#fff;border:0;border-radius:6px;cursor:pointer;font-weight:600;">Run pathway</button>' +
      '<pre data-seedops-ops-status style="margin:8px 0 0;max-height:120px;overflow:auto;font-size:10px;color:#a7f3d0;white-space:pre-wrap;"></pre>';
    document.body.appendChild(panel);

    panel.querySelector("[data-seedops-ops-close]").addEventListener("click", function () {
      try {
        if (String(location.hash || "").replace(/^#/, "") === HASH) {
          history.replaceState(null, "", location.pathname + location.search);
        }
      } catch (e) {}
      syncPanel();
    });
    panel.querySelector("[data-seedops-ops-run]").addEventListener("click", function () {
      var pathway = panel.querySelector("[data-seedops-ops-pathway]").value;
      var target = String(panel.querySelector("[data-seedops-ops-target]").value || "").trim();
      var status = panel.querySelector("[data-seedops-ops-status]");
      var result =
        pathway === "__all__" ? triggerAll(target || undefined) : triggerPathway(pathway, target || undefined);
      try {
        status.textContent = JSON.stringify(result, null, 2);
      } catch (e) {
        status.textContent = String(result && result.error ? result.error : "done");
      }
    });
    return panel;
  }

  function syncPanel() {
    var armed = isArmed();
    var want = armed && gateOpen();
    if (!want) {
      var existing = document.querySelector("[" + PANEL_ATTR + "]");
      if (existing) {
        existing.setAttribute("hidden", "");
        existing.setAttribute("aria-hidden", "true");
      }
      if (!armed && gateOpen()) {
        emitLog({ action: "panel_refused", ok: false, error: "not_armed" });
      }
      return { ok: want, armed: armed };
    }
    var panel = ensurePanel();
    panel.removeAttribute("hidden");
    panel.setAttribute("aria-hidden", "false");
    var op = resolveOperator();
    var input = panel.querySelector("[data-seedops-ops-target]");
    if (input && !input.value && op) input.placeholder = op.seedFleetId + " (self)";
    emitLog({ action: "panel_open", ok: true, operator: op && op.seedFleetId });
    return { ok: true, armed: true, operator: op };
  }

  function boot() {
    syncPanel();
    window.addEventListener("hashchange", syncPanel);
    window.addEventListener("popstate", syncPanel);
    document.addEventListener("cognation:auth-changed", syncPanel);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  function postWave(opts) {
    var op = resolveOperator();
    if (!op) {
      emitLog({ action: "post_wave", ok: false, error: "not_armed" });
      return { ok: false, error: "not_armed", reason: "Operator session is not ops/seedops." };
    }
    var api = window.CognationSeedOpsTowerPosts;
    if (!api || typeof api.postWave !== "function") {
      return { ok: false, error: "tower_posts_unavailable" };
    }
    return api.postWave(opts || {});
  }

  function postOne(seedFleetId, opts) {
    var gate = canActAs(seedFleetId);
    if (!gate.ok) {
      emitLog({
        action: "post_one",
        ok: false,
        error: gate.error,
        reason: gate.reason,
        target: seedFleetId || "",
      });
      return { ok: false, error: gate.error, reason: gate.reason };
    }
    var api = window.CognationSeedOpsTowerPosts;
    if (!api || typeof api.postOne !== "function") {
      return { ok: false, error: "tower_posts_unavailable", target: gate.target };
    }
    return api.postOne(gate.record || gate.target, opts || {});
  }

  window.CognationSeedOpsTrigger = {
    HASH: HASH,
    QUERY: QUERY,
    OPS_FLEET_IDS: OPS_FLEET_IDS.slice(),
    WAVE1_MAX: WAVE1_MAX,
    DEMO_CAP: DEMO_CAP,
    isArmed: isArmed,
    resolveOperator: resolveOperator,
    canActAs: canActAs,
    triggerPathway: triggerPathway,
    triggerAll: triggerAll,
    postWave: postWave,
    postOne: postOne,
    syncPanel: syncPanel,
    gateOpen: gateOpen,
  };
})();
