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
      ensureBadge(nameWrap, profile);
    });
  }

  function syncPeopleSearch() {
    document.querySelectorAll("[data-people-search-results] li, .people-search-results li").forEach(function (li) {
      var id = li.getAttribute("data-profile-id") || li.getAttribute("data-friend-id") || "";
      var handle = li.getAttribute("data-handle") || "";
      var rec = null;
      if (window.CognationAccounts) {
        if (id) rec = window.CognationAccounts.getProfileById(id);
        if (!rec && handle && window.CognationAccounts.getProfileByHandle) {
          rec = window.CognationAccounts.getProfileByHandle(handle);
        }
      }
      if (!rec && (li.textContent || "").indexOf("seed-") >= 0) {
        rec = { accountKind: "seed", isSeed: true };
      }
      var host = li.querySelector("[data-seedops-badge-slot]") || li;
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
