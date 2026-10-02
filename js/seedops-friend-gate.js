/**
 * SeedOps — real ↛ seed/ops friend block.
 *
 * Policy:
 *   real ↔ real     OK
 *   seed ↔ seed     OK (Circle mutual-graph testing)
 *   ops  ↔ ops/seed OK (fleet internals)
 *   real ↔ seed/ops BLOCKED either direction
 *
 * Used by social-graph (Supabase path), tower-follow / TowerFriends (local),
 * and mirrored in server/social-store + supabase migration.
 */
(function () {
  "use strict";

  var BLOCK_CODE = "real_seed_friend_blocked";
  var BLOCK_MESSAGE = "Real members can only friend other real members. Seed and ops accounts stay in the demo fleet.";

  function seedApi() {
    return window.CognationSeedOps || null;
  }

  function classify(record) {
    var api = seedApi();
    if (api && typeof api.classify === "function") return api.classify(record);
    return { accountKind: "real", isSeed: false, isOpsBot: false };
  }

  function isNonReal(record) {
    var c = classify(record);
    return !!(c.isSeed || c.isOpsBot);
  }

  function resolveRecord(ref) {
    if (!ref) return null;
    if (typeof ref === "object") return ref;
    var id = String(ref);
    var accounts = window.CognationAccounts;
    if (accounts && typeof accounts.getProfileById === "function") {
      var byId = accounts.getProfileById(id);
      if (byId) return byId;
      if (typeof accounts.getProfileByHandle === "function") {
        var byHandle = accounts.getProfileByHandle(id);
        if (byHandle) return byHandle;
      }
    }
    var api = seedApi();
    if (api && typeof api.getByFleetId === "function") {
      var fleet = api.getByFleetId(id);
      if (fleet) return fleet;
    }
    /* Heuristic for remote / unresolved ids */
    if (/^seed-|^prof-seed-|^ops-|^prof-ops-/.test(id.toLowerCase())) {
      return { id: id, accountKind: /^ops-|^prof-ops-/.test(id.toLowerCase()) ? "ops" : "seed", isSeed: !/^ops-/.test(id.toLowerCase()), isOpsBot: /^ops-|^prof-ops-/.test(id.toLowerCase()) };
    }
    return { id: id, accountKind: "real" };
  }

  function viewerRecord() {
    try {
      if (window.CognationAuth && window.CognationAuth.getSession) {
        var session = window.CognationAuth.getSession();
        if (session) {
          if (session.activeProfileId && window.CognationAccounts) {
            var p = window.CognationAccounts.getProfileById(session.activeProfileId);
            if (p) return p;
          }
          if (session.username && window.CognationAccounts) {
            var list = window.CognationAccounts.getProfilesForUsername(session.username) || [];
            for (var i = 0; i < list.length; i++) {
              if (list[i] && list[i].kind === "personal") return list[i];
            }
          }
          if (session.accountKind || session.isSeed || session.isOpsBot) return session;
        }
      }
    } catch (e) {}
    try {
      if (window.CognationTowerProfileStore && window.CognationTowerProfileStore.get) {
        return window.CognationTowerProfileStore.get();
      }
    } catch (e2) {}
    return null;
  }

  /**
   * @returns {{ ok: true } | { ok: false, error: string, message: string, actorKind: string, targetKind: string }}
   */
  function canFriend(actorRef, targetRef) {
    var actor = resolveRecord(actorRef) || viewerRecord();
    var target = resolveRecord(targetRef);
    if (!actor || !target) return { ok: true };
    var a = classify(actor);
    var t = classify(target);
    var actorNonReal = a.isSeed || a.isOpsBot;
    var targetNonReal = t.isSeed || t.isOpsBot;
    if (actorNonReal === targetNonReal) {
      return { ok: true, actorKind: a.accountKind, targetKind: t.accountKind };
    }
    /* Mixed real ↔ non-real */
    return {
      ok: false,
      error: BLOCK_CODE,
      message: BLOCK_MESSAGE,
      actorKind: a.accountKind,
      targetKind: t.accountKind,
    };
  }

  function assertCanFriend(actorRef, targetRef) {
    var decision = canFriend(actorRef, targetRef);
    if (!decision.ok) {
      var err = new Error(decision.message);
      err.code = decision.error;
      err.seedOps = decision;
      throw err;
    }
    return decision;
  }

  window.CognationSeedOpsFriendGate = {
    BLOCK_CODE: BLOCK_CODE,
    BLOCK_MESSAGE: BLOCK_MESSAGE,
    canFriend: canFriend,
    assertCanFriend: assertCanFriend,
    resolveRecord: resolveRecord,
    viewerRecord: viewerRecord,
    isNonReal: isNonReal,
  };
})();
