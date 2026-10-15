/**
 * Tower content reports → Investigator queue (server-side).
 * - Human report of ordinary content: post is hidden (server).
 * - Seed report of ordinary content: flag only; daily cap (server).
 * - Illegal-image report: hides that attachment index only; never sends
 *   image bytes (seeds/bots must not copy, save, or describe the image).
 * - Seed-to-seed can be marked as a test and stays out of the real queue.
 * Fail closed if Supabase / the RPC is missing.
 */
(function (root) {
  "use strict";

  var REASONS = ["harmful", "untruthful", "misrated", "illegal_image"];

  function client() {
    return root.CognationSupabase && root.CognationSupabase.configured && root.CognationSupabase.configured()
      ? root.CognationSupabase
      : null;
  }

  /**
   * @param {object} opts
   * @param {string} opts.postId
   * @param {string} opts.reason  harmful|untruthful|misrated|illegal_image
   * @param {string} [opts.note]
   * @param {number} [opts.attachmentIndex]  required for illegal_image; never send the image itself
   */
  function reportTowerPost(opts) {
    opts = opts || {};
    var c = client();
    if (!c) return Promise.reject(new Error("Sign in is not configured."));
    var reason = String(opts.reason || "").toLowerCase();
    if (REASONS.indexOf(reason) < 0) return Promise.reject(new Error("Pick a report reason."));
    var postId = String(opts.postId || "");
    if (!postId) return Promise.reject(new Error("postId required"));
    var attachmentIndex = opts.attachmentIndex;
    if (reason === "illegal_image") {
      if (attachmentIndex == null || attachmentIndex === "") {
        return Promise.reject(new Error("Which image?"));
      }
      attachmentIndex = +attachmentIndex;
      if (!isFinite(attachmentIndex) || attachmentIndex < 0) {
        return Promise.reject(new Error("Which image?"));
      }
    } else {
      attachmentIndex = null;
    }
    /* Never attach or describe image bytes — metadata only. */
    return c.rpc("report_tower_post", {
      post_id: postId,
      reason: reason,
      note: opts.note ? String(opts.note).slice(0, 280) : null,
      attachment_index: attachmentIndex,
    });
  }

  function markAsTest(reportId) {
    var c = client();
    if (!c) return Promise.reject(new Error("Sign in is not configured."));
    return c.rpc("mark_report_as_test", { report_id: reportId });
  }

  var api = { REASONS: REASONS, reportTowerPost: reportTowerPost, markAsTest: markAsTest };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CognationContentReport = api;
})(typeof window !== "undefined" ? window : globalThis);
