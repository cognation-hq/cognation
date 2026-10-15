/**
 * User blocks — separate from Report. Quiet (no notice to the blocked person).
 * Fail closed if Supabase / RPCs are missing.
 */
(function (root) {
  "use strict";

  function client() {
    return root.CognationSupabase && root.CognationSupabase.configured && root.CognationSupabase.configured()
      ? root.CognationSupabase
      : null;
  }

  function blockUser(targetUserId) {
    var c = client();
    if (!c) return Promise.reject(new Error("Sign in is not configured."));
    if (!targetUserId) return Promise.reject(new Error("Who to block?"));
    return c.rpc("block_user", { target_user_id: targetUserId });
  }

  function unblockUser(targetUserId) {
    var c = client();
    if (!c) return Promise.reject(new Error("Sign in is not configured."));
    return c.rpc("unblock_user", { target_user_id: targetUserId });
  }

  function listMyBlocks() {
    var c = client();
    if (!c) return Promise.resolve([]);
    return c.rpc("list_my_blocks", {}).then(function (rows) {
      return Array.isArray(rows) ? rows : [];
    }, function () { return []; });
  }

  var api = { blockUser: blockUser, unblockUser: unblockUser, listMyBlocks: listMyBlocks };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CognationBlock = api;
})(typeof window !== "undefined" ? window : globalThis);
