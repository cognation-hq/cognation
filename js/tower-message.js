/**
 * Tower "Message" button on another member's personal page.
 * Opens (or finds) the real DM thread via open_direct_thread (through
 * CognationMessageStore.ensureConversation). The server enforces blocks,
 * 13+, and real↔real / seed↔seed only; errors are shown as honest lines.
 */
(function () {
  "use strict";
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function activeProfile() {
    try {
      var s = window.CognationTowerProfileStore;
      return s && s.get ? s.get() : null;
    } catch (e) { return null; }
  }

  function signedIn() {
    var c = window.CognationSupabase;
    try {
      var sess = c && typeof c.getSession === "function" ? c.getSession() : null;
      return !!(sess && sess.access_token);
    } catch (e) { return false; }
  }

  function viewedPersonalId(btn) {
    var p = activeProfile();
    if (!p || p._loading) return "";
    var root = btn.closest && btn.closest("[data-tower-app]");
    var kind = root && root.getAttribute("data-view-kind");
    if (kind === "professional" || p._profileKind === "professional" || p.kind === "professional") return "";
    var id = String(p._profileId || "");
    return UUID_RE.test(id) ? id : "";
  }

  function say(btn, text) {
    var row = btn.closest("[data-tower-follow-row]");
    var status = row && row.querySelector("[data-tower-message-status]");
    if (!status) return;
    status.hidden = !text;
    status.textContent = text || "";
  }

  function sync(btn) {
    var row = btn.closest("[data-tower-follow-row]");
    /* tower-follow.js hides the row on your own page; follow its lead. */
    var show = !!(row && !row.hidden && signedIn() && viewedPersonalId(btn));
    btn.hidden = !show;
    if (!show) say(btn, "");
  }

  function syncAll() {
    document.querySelectorAll("[data-tower-message]").forEach(sync);
  }

  function start(btn) {
    var id = viewedPersonalId(btn);
    var store = window.CognationMessageStore;
    if (!id) { say(btn, "This person isn't available to message."); return Promise.resolve(); }
    if (!signedIn()) { say(btn, "Sign in to send messages."); return Promise.resolve(); }
    if (!store || typeof store.ensureConversation !== "function") {
      say(btn, "Messages aren't available right now. Try again soon.");
      return Promise.resolve();
    }
    var p = activeProfile() || {};
    var name = p.displayName || p.display_name || p.handle || "Member";
    btn.disabled = true;
    say(btn, "Opening…");
    return store.ensureConversation(id, name).then(function (res) {
      btn.disabled = false;
      if (!res || !res.ok || !res.conversation) {
        say(btn, (res && res.error) || "Couldn't open messages. Try again.");
        return;
      }
      say(btn, "");
      if (typeof store._openThread === "function") store._openThread(res.conversation.id);
      var panel = document.querySelector("[data-tower-messages]");
      if (panel && panel.scrollIntoView) {
        try { panel.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (eS) {}
      }
    });
  }

  document.addEventListener("click", function (ev) {
    var btn = ev.target && ev.target.closest && ev.target.closest("[data-tower-message]");
    if (!btn) return;
    ev.preventDefault();
    start(btn);
  });

  [
    "cognation:tower-view-changed", "cognation:session-started", "cognation:session-ended",
    "cognation:auth-changed", "cognation:remote-profile-loaded", "cognation:active-profile-changed",
    "cognation:tower-profile-updated", "cognation:social-relationship-changed",
  ].forEach(function (name) {
    /* Run after tower-follow.js has shown/hidden the row. */
    document.addEventListener(name, function () { setTimeout(syncAll, 0); });
  });

  window.CognationTowerMessage = { sync: sync, syncAll: syncAll, start: start };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", syncAll);
  else syncAll();
})();
