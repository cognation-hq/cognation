/**
 * CGN-009 — NEWS report → Investigator queue.
 * - localStorage: cognation.moderation.queue.v1
 * - Document mirror: /workspace/news-moderation/queue/pending/RPT-*.json (via export / agent sync)
 * - API: window.CognationModeration.enqueue(report)
 * Investigator bot id: 3949519 — see docs/moderation-investigator-notes.md
 * and /workspace/news-moderation/README.md
 */
(function () {
  "use strict";

  var STORAGE_KEY = "cognation.moderation.queue.v1";
  var HIDDEN_KEY = "cognation.moderation.hiddenPosts.v1";
  var SEQ_KEY = "cognation.moderation.seq.v1";
  var INVESTIGATOR_AGENT_ID = 3949519;
  var NEWS_MOD_PATH = "/workspace/news-moderation/queue/pending/";

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function writeJson(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }
  function loadQueue() {
    var q = readJson(STORAGE_KEY, []);
    return Array.isArray(q) ? q : [];
  }
  function saveQueue(list) {
    return writeJson(STORAGE_KEY, list);
  }
  function loadHidden() {
    var h = readJson(HIDDEN_KEY, {});
    return h && typeof h === "object" ? h : {};
  }
  function saveHidden(map) {
    return writeJson(HIDDEN_KEY, map);
  }
  function nextRptId() {
    var n = parseInt(localStorage.getItem(SEQ_KEY) || "100", 10);
    if (!isFinite(n) || n < 100) n = 100;
    n += 1;
    localStorage.setItem(SEQ_KEY, String(n));
    var s = String(n);
    while (s.length < 3) s = "0" + s;
    return "RPT-" + s;
  }
  function currentReporter() {
    try {
      var raw = localStorage.getItem("cognation.session.demo.v1");
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.username) return String(s.username);
      }
    } catch (e) {}
    return "demo-reporter";
  }

  /** Shape matching /workspace/news-moderation/queue/pending/RPT-*.json */
  function toNewsModerationFile(item, postMeta) {
    postMeta = postMeta || {};
    return {
      id: item.id,
      receivedAt: item.ts,
      status: item.status === "queued" ? "pending" : item.status,
      source: "cognation-news-report",
      reportReason: item.reason,
      reporter: item.reporter,
      edition: item.edition || "",
      investigatorAgentId: INVESTIGATOR_AGENT_ID,
      reporterNote: postMeta.reporterNote || ("User report: " + item.reason),
      post: {
        id: item.postId,
        authorName: postMeta.authorName || "",
        kind: postMeta.kind || "news",
        body: postMeta.body || "",
        createdAt: postMeta.createdAt || item.ts,
        temporarilyRemoved: true,
      },
    };
  }

  function normalizeReport(raw) {
    raw = raw || {};
    var reason = String(raw.reason || raw.reportReason || "").toLowerCase();
    if (reason !== "harmful" && reason !== "untruthful") {
      reason = reason.indexOf("truth") >= 0 ? "untruthful" : "harmful";
    }
    var id = String(raw.id || "");
    if (!id || id.indexOf("RPT-") !== 0) id = nextRptId();
    return {
      id: id,
      postId: String(raw.postId || (raw.post && raw.post.id) || ""),
      reason: reason,
      edition: String(raw.edition || ""),
      reporter: String(raw.reporter || currentReporter()),
      ts: String(raw.ts || raw.receivedAt || new Date().toISOString()),
      status: String(raw.status || "queued"),
      postMeta: raw.post || raw.postMeta || null,
    };
  }

  function hidePostForReporter(postId) {
    if (!postId) return;
    var map = loadHidden();
    var who = currentReporter();
    if (!map[who]) map[who] = {};
    map[who][postId] = true;
    if (!map.__global) map.__global = {};
    map.__global[postId] = true;
    saveHidden(map);
  }

  function hideContent(postId) {
    hidePostForReporter(postId);
  }

  function isPostHidden(postId) {
    if (!postId) return false;
    var map = loadHidden();
    if (map.__global && map.__global[postId]) return true;
    var who = currentReporter();
    return !!(map[who] && map[who][postId]);
  }

  function mirrorInMemory(queue) {
    try {
      window.__cognationModerationQueueDoc = {
        updatedAt: new Date().toISOString(),
        investigatorAgentId: INVESTIGATOR_AGENT_ID,
        newsModerationPath: NEWS_MOD_PATH,
        reports: queue,
      };
      document.dispatchEvent(
        new CustomEvent("cognation:moderation-queue-updated", {
          detail: window.__cognationModerationQueueDoc,
        })
      );
    } catch (e) {}
  }

  /**
   * Best-effort: try POST to same-origin moderation ingest (optional Pages Function).
   * Static demo cannot write /workspace paths from the browser — agents sync via
   * CognationModeration.exportNewsModerationFile + news-moderation/queue/pending/.
   */
  function tryRemoteIngest(fileDoc) {
    try {
      if (typeof fetch !== "function") return;
      fetch("/api/moderation/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fileDoc),
      }).catch(function () {});
    } catch (e) {}
  }

  function enqueue(report) {
    var item = normalizeReport(report);
    if (!item.postId) {
      return { ok: false, error: "postId required" };
    }
    var queue = loadQueue();
    queue.unshift(item);
    saveQueue(queue);
    hidePostForReporter(item.postId);
    var fileDoc = toNewsModerationFile(item, item.postMeta || report.post || {});
    mirrorInMemory(queue);
    tryRemoteIngest(fileDoc);
    try {
      document.dispatchEvent(
        new CustomEvent("cognation:news-post-reported", {
          detail: Object.assign({}, item, { newsModerationFile: fileDoc }),
        })
      );
    } catch (e2) {}
    /* Stash last file for HH/Engineer to drop into news-moderation/queue/pending/ */
    try {
      window.__cognationLastModerationFile = fileDoc;
      localStorage.setItem(
        "cognation.moderation.lastFile.v1",
        JSON.stringify(fileDoc)
      );
    } catch (e3) {}
    /* Tower posts: also file a server report when signed in (Investigator SQL).
       Seeds flag-only; humans hide-on-report — enforced server-side. */
    try {
      if (
        window.CognationContentReport &&
        item.postId &&
        (item.reason === "harmful" || item.reason === "untruthful")
      ) {
        window.CognationContentReport.reportTowerPost({
          postId: item.postId,
          reason: item.reason,
          note: (item.postMeta && item.postMeta.reporterNote) || ("User report: " + item.reason),
        }).catch(function () {});
      }
    } catch (eServer) {}
    return {
      ok: true,
      report: item,
      newsModerationFile: fileDoc,
      newsModerationPath: NEWS_MOD_PATH + fileDoc.id + ".json",
      investigatorAgentId: INVESTIGATOR_AGENT_ID,
      sendToAgentHint:
        "SendToAgent Investigator (id " +
        INVESTIGATOR_AGENT_ID +
        ") with " +
        NEWS_MOD_PATH +
        fileDoc.id +
        ".json — see docs/moderation-investigator-notes.md",
    };
  }

  function listQueue() {
    return loadQueue().slice();
  }

  function exportQueueJson() {
    return JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        investigatorAgentId: INVESTIGATOR_AGENT_ID,
        newsModerationPath: NEWS_MOD_PATH,
        reports: loadQueue(),
      },
      null,
      2
    );
  }

  function exportNewsModerationFile(reportOrId) {
    var item = null;
    if (reportOrId && typeof reportOrId === "object") {
      item = normalizeReport(reportOrId);
    } else {
      var id = String(reportOrId || "");
      item = loadQueue().filter(function (r) {
        return r.id === id;
      })[0];
    }
    if (!item) item = readJson("cognation.moderation.lastFile.v1", null);
    if (!item) return null;
    if (item.post && item.reportReason) return item; /* already file shape */
    return toNewsModerationFile(normalizeReport(item), item.postMeta || {});
  }

  function downloadQueueSnapshot() {
    var blob = new Blob([exportQueueJson()], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "moderation-queue.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {}
    }, 500);
    return true;
  }

  function downloadLastPendingFile() {
    var doc = exportNewsModerationFile();
    if (!doc) return false;
    var blob = new Blob([JSON.stringify(doc, null, 2)], {
      type: "application/json",
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = (doc.id || "RPT") + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {}
    }, 500);
    return true;
  }

  window.CognationModeration = {
    enqueue: enqueue,
    listQueue: listQueue,
    isPostHidden: isPostHidden,
    hideContent: hideContent,
    exportQueueJson: exportQueueJson,
    exportNewsModerationFile: exportNewsModerationFile,
    downloadQueueSnapshot: downloadQueueSnapshot,
    downloadLastPendingFile: downloadLastPendingFile,
    toNewsModerationFile: toNewsModerationFile,
    INVESTIGATOR_AGENT_ID: INVESTIGATOR_AGENT_ID,
    NEWS_MOD_PATH: NEWS_MOD_PATH,
    STORAGE_KEY: STORAGE_KEY,
  };

  mirrorInMemory(loadQueue());
})();
