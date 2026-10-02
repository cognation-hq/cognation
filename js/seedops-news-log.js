/**
 * SeedOps — News logging hooks.
 * Audits seed Tower posts as they flow: seed post → curator ranking → age floor → newspaper render.
 *
 * Event shape (channel "news"):
 *   {
 *     stage: "rank" | "age_floor" | "render" | "audit",
 *     editionId, towerPostId, newsPostId, authorName, seedFleetId?,
 *     accountKind, reactionScore, ageFloorPassed, rankedIndex, rendered
 *   }
 */
(function () {
  "use strict";

  function log(payload) {
    if (window.CognationSeedOpsLog) return window.CognationSeedOpsLog.write("news", payload);
    return null;
  }

  function classifyAuthor(post) {
    var api = window.CognationSeedOps;
    var rec = {
      displayName: post && post.authorName,
      handle: post && post.handle,
      accountKind: post && post.accountKind,
      isSeed: post && (post.isSeed || post.seeded),
      seedFleetId: post && post.seedFleetId,
      id: post && (post.authorProfileId || post.profileId),
    };
    if (api && api.classify) return api.classify(rec);
    return { accountKind: rec.isSeed ? "seed" : "real", isSeed: !!rec.isSeed, isOpsBot: false };
  }

  function reactionScore(post) {
    var score = Number(post && post.likes) || 0;
    if (post && post.reactions && typeof post.reactions === "object") {
      Object.keys(post.reactions).forEach(function (face) {
        var list = post.reactions[face];
        if (Array.isArray(list)) score += list.length;
      });
    }
    return score;
  }

  function ageFloorPassed(post) {
    if (!post) return false;
    if ((Number(post.minAge) || 0) >= 18) return false;
    if (post.audience === "21+" || post.roomKind === "21+") return false;
    var blob = String(post.title || "") + " " + String(post.body || "");
    if (/\b(21\+|nsfw|explicit)\b/i.test(blob)) return false;
    return true;
  }

  /**
   * Called when News builds from Tower (local/statewide). Logs each seeded author appearance.
   */
  function onTowerPostsForNews(posts, editionId) {
    posts = Array.isArray(posts) ? posts : [];
    var ranked = posts.slice().sort(function (a, b) {
      return reactionScore(b) - reactionScore(a);
    });
    ranked.forEach(function (post, idx) {
      var kind = classifyAuthor(post);
      if (!kind.isSeed && !kind.isOpsBot && !(post && post.fromTower && post.seeded && post.seedFleetId)) {
        /* Still log fromTower seeded markers from commune mapping */
        if (!(post && post.fromTower && post.seeded)) return;
      }
      var passed = ageFloorPassed(post);
      log({
        stage: "rank",
        editionId: editionId || "local",
        towerPostId: post.towerPostId || post.id || "",
        newsPostId: post.newsPostId || post.id || "",
        authorName: post.authorName || "",
        seedFleetId: post.seedFleetId || "",
        accountKind: kind.accountKind,
        reactionScore: reactionScore(post),
        rankedIndex: idx,
        ageFloorPassed: passed,
      });
      log({
        stage: "age_floor",
        editionId: editionId || "local",
        towerPostId: post.towerPostId || post.id || "",
        newsPostId: post.newsPostId || post.id || "",
        authorName: post.authorName || "",
        seedFleetId: post.seedFleetId || "",
        accountKind: kind.accountKind,
        ageFloorPassed: passed,
      });
    });
    return ranked;
  }

  function onNewsPostRendered(post, editionId, meta) {
    meta = meta || {};
    var kind = classifyAuthor(post);
    if (!kind.isSeed && !kind.isOpsBot && !(post && (post.fromTower || post.seedFleetId || post.isSeed))) {
      return null;
    }
    return log({
      stage: "render",
      editionId: editionId || meta.editionId || "",
      towerPostId: post.towerPostId || "",
      newsPostId: post.id || "",
      authorName: post.authorName || "",
      seedFleetId: post.seedFleetId || "",
      accountKind: kind.accountKind,
      reactionScore: reactionScore(post),
      ageFloorPassed: ageFloorPassed(post),
      rankedIndex: meta.rankedIndex,
      rendered: true,
    });
  }

  function auditLatest(editionId) {
    var posts = [];
    try {
      if (window.CognationTowerStore && typeof window.CognationTowerStore.newsList === "function") {
        posts = window.CognationTowerStore.newsList() || [];
      }
    } catch (e) {}
    var annotated = posts.map(function (p, idx) {
      var copy = {};
      Object.keys(p || {}).forEach(function (k) { copy[k] = p[k]; });
      copy.towerPostId = p.id;
      copy.rankedIndex = idx;
      return copy;
    });
    onTowerPostsForNews(annotated, editionId || "local");
    return log({
      stage: "audit",
      editionId: editionId || "local",
      count: annotated.length,
      seedCount: annotated.filter(function (p) {
        var k = classifyAuthor(p);
        return k.isSeed || k.isOpsBot;
      }).length,
    });
  }

  window.CognationSeedOpsNewsLog = {
    onTowerPostsForNews: onTowerPostsForNews,
    onNewsPostRendered: onNewsPostRendered,
    auditLatest: auditLatest,
    ageFloorPassed: ageFloorPassed,
  };
})();
