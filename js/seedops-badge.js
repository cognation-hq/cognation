/**
 * SeedOps — visible Demo / Seed badge so fleet accounts are never mistaken for real users.
 * Mounts beside Tower identity, people-search rows, and News byline when the subject is seed/ops.
 */
(function () {
  "use strict";

  var BADGE_CLASS = "seedops-demo-badge";
  var HOST_ATTR = "data-seedops-badge-host";

  function classify(record) {
    var api = window.CognationSeedOps;
    if (api && typeof api.classify === "function") return api.classify(record || {});
    return { accountKind: "real", isSeed: false, isOpsBot: false };
  }

  function labelFor(record) {
    var c = classify(record);
    if (c.isOpsBot) return "Ops · demo";
    if (c.isSeed) return "Demo · seed";
    return "";
  }

  function ensureBadge(host, record) {
    if (!host) return null;
    var label = labelFor(record);
    var existing = host.querySelector("." + BADGE_CLASS);
    if (!label) {
      if (existing) existing.remove();
      host.removeAttribute(HOST_ATTR);
      return null;
    }
    host.setAttribute(HOST_ATTR, classify(record).accountKind);
    /* One badge per host: drop any copies left by earlier renders. */
    Array.prototype.slice.call(host.querySelectorAll("." + BADGE_CLASS), 1).forEach(function (dup) {
      if (dup.parentNode) dup.parentNode.removeChild(dup);
    });
    if (!existing) {
      existing = document.createElement("span");
      existing.className = BADGE_CLASS;
      existing.setAttribute("role", "status");
      host.appendChild(existing);
    }
    existing.textContent = label;
    existing.setAttribute("title", "This account is part of the Cognation seed/demo fleet, not a real member.");
    existing.setAttribute("data-account-kind", classify(record).accountKind);
    return existing;
  }

  function badgeHtml(record) {
    var label = labelFor(record);
    if (!label) return "";
    var kind = classify(record).accountKind;
    return (
      '<span class="' +
      BADGE_CLASS +
      '" role="status" data-account-kind="' +
      kind +
      '" title="This account is part of the Cognation seed/demo fleet, not a real member.">' +
      label +
      "</span>"
    );
  }

  function syncTowerBadges() {
    document.querySelectorAll("[data-tower-app]").forEach(function (root) {
      var nameWrap =
        root.querySelector("[data-tower-profile-name-wrap]") ||
        root.querySelector("[data-tower-widget='identity']");
      if (!nameWrap) return;
      var profile = null;
      try {
        if (window.CognationTowerProfileStore && window.CognationTowerProfileStore.get) {
          profile = window.CognationTowerProfileStore.get();
        }
      } catch (e) {}
      if (!profile && window.CognationAccounts) {
        var id = root.getAttribute("data-view-profile-id") || "";
        if (id) profile = window.CognationAccounts.getProfileById(id);
      }
      var kept = ensureBadge(nameWrap, profile);
      /* Tower shows the owner's Demo badge once, next to the name. Remove any
         other copy inside this Tower's profile widgets (avatar card, name card,
         profile strip). */
      root.querySelectorAll(
        "[data-tower-widget='identity'] ." + BADGE_CLASS + ", [data-tower-widget='avatar'] ." + BADGE_CLASS + ", [data-tower-profile-strip] ." + BADGE_CLASS
      ).forEach(function (b) {
        if (b !== kept && b.parentNode) b.parentNode.removeChild(b);
      });
    });
  }

  /* Record for a search result: local registry, then the server profile cache
     (account_kind / seed_fleet_id), by id then handle. */
  function peopleSearchRecord(id, handle) {
    var rec = null;
    if (window.CognationAccounts) {
      if (id) rec = window.CognationAccounts.getProfileById(id);
      if (!rec && handle && window.CognationAccounts.getProfileByHandle) {
        rec = window.CognationAccounts.getProfileByHandle(handle);
      }
    }
    /* Signed in: server profile cache carries account_kind / seed_fleet_id. */
    var social = window.CognationSupabaseSocial;
    if (!rec && id && social && typeof social.getProfile === "function") {
      var row = social.getProfile(id);
      if (row && row.account_kind) rec = row;
    }
    if (!rec && handle && social && typeof social.getProfileForHandle === "function") {
      var byHandle = social.getProfileForHandle(handle);
      if (byHandle && byHandle.account_kind) rec = byHandle;
    }
    return rec;
  }

  function syncPeopleSearch() {
    document.querySelectorAll("[data-people-search-results] li, .people-search-results li").forEach(function (li) {
      var id = li.getAttribute("data-profile-id") || li.getAttribute("data-friend-id") || "";
      var handle = li.getAttribute("data-handle") || "";
      var rec = peopleSearchRecord(id, handle);
      if (!rec && (li.textContent || "").indexOf("seed-") >= 0) {
        rec = { accountKind: "seed", isSeed: true };
      }
      var host = li.querySelector("[data-seedops-badge-slot]") || li;
      ensureBadge(host, rec);
    });
    /* people-search.js renders each result as button.people-search-row. Badge it
       by the account's own field (account_kind), not by handle text. */
    document.querySelectorAll("[data-people-search-results] .people-search-row, .people-search-results .people-search-row").forEach(function (row) {
      if (row.tagName && String(row.tagName).toLowerCase() === "li") return;
      var id = row.getAttribute("data-profile-id") || "";
      var handle = String(row.getAttribute("data-result-handle") || "").replace(/^@/, "");
      var rec = peopleSearchRecord(id, handle);
      var kind = row.getAttribute("data-account-kind");
      if (!rec && kind) rec = { accountKind: kind };
      var host = row.querySelector("[data-seedops-badge-slot]") || row;
      ensureBadge(host, rec);
    });
  }

  function syncAll() {
    syncTowerBadges();
    syncPeopleSearch();
  }

  window.CognationSeedOpsBadge = {
    BADGE_CLASS: BADGE_CLASS,
    labelFor: labelFor,
    badgeHtml: badgeHtml,
    ensureBadge: ensureBadge,
    syncAll: syncAll,
    syncTowerBadges: syncTowerBadges,
    syncPeopleSearch: syncPeopleSearch,
  };

  function boot() {
    syncAll();
  }

  document.addEventListener("cognation:tower-view-changed", syncAll);
  document.addEventListener("cognation:tower-profile-updated", syncAll);
  document.addEventListener("cognation:people-added", syncAll);
  document.addEventListener("cognation:session-started", syncAll);
  document.addEventListener("cognation:remote-friends-loaded", syncAll);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
