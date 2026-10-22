/**
 * SIGNAL Feed "Send a signal": PERSONAL | PROFESSIONAL post-as switch.
 *
 * Picks which of the signed-in member's OWN server pages (public.profiles rows,
 * kind personal | professional, unique per user + kind) a new Feed post is
 * authored as. The post saves to Supabase with tower_posts.author_profile_id =
 * that page's id (js/supabase-social.js createTowerPost). The server insert
 * policy "tower authors create their own posts" only accepts a profile whose
 * user_id = auth.uid(), so nobody can post as someone else's page even with a
 * hand-made request; the browser also refuses ids outside getMyProfiles().
 *
 * Shown only when the member owns a Professional page (seeds included: no Pro
 * page, no switch). Default Personal. The choice sticks for this browser
 * session only (sessionStorage, keyed to the signed-in user id).
 */
(function (root) {
  "use strict";

  var STORE_KEY = "cognation.signal.postAs.v1";

  /* Own pages only: rows whose user_id is the signed-in user. */
  function ownPages(myProfiles, userId) {
    var out = { personal: null, professional: null };
    var uid = String(userId || "");
    if (!uid) return out;
    (Array.isArray(myProfiles) ? myProfiles : []).forEach(function (p) {
      if (!p || !p.id || String(p.user_id || "") !== uid) return;
      var kind = p.kind === "professional" ? "professional" : "personal";
      if (!out[kind]) out[kind] = p;
    });
    return out;
  }

  function hasProfessional(myProfiles, userId) {
    return !!ownPages(myProfiles, userId).professional;
  }

  function normalizeChoice(value) {
    return value === "professional" ? "professional" : "personal";
  }

  /* The author_profile_id for a post, or "" when it cannot be one of the
     member's own pages (caller then keeps the existing default author). */
  function authorProfileId(choice, myProfiles, userId) {
    var pages = ownPages(myProfiles, userId);
    if (!pages.professional) return "";
    var page = pages[normalizeChoice(choice)];
    return page && page.id ? String(page.id) : "";
  }

  function isOwnProfileId(profileId, myProfiles, userId) {
    var id = String(profileId || "");
    if (!id) return false;
    var pages = ownPages(myProfiles, userId);
    return !!((pages.personal && String(pages.personal.id) === id) ||
      (pages.professional && String(pages.professional.id) === id));
  }

  function readChoice(storage, userId) {
    try {
      var raw = storage && storage.getItem(STORE_KEY);
      var doc = raw ? JSON.parse(raw) : null;
      if (doc && doc.uid && String(doc.uid) === String(userId || "")) return normalizeChoice(doc.kind);
    } catch (e) {}
    return "personal";
  }

  function saveChoice(storage, userId, kind) {
    try {
      if (storage && userId) storage.setItem(STORE_KEY, JSON.stringify({ uid: String(userId), kind: normalizeChoice(kind) }));
    } catch (e) {}
  }

  var api = {
    STORE_KEY: STORE_KEY,
    ownPages: ownPages,
    hasProfessional: hasProfessional,
    authorProfileId: authorProfileId,
    isOwnProfileId: isOwnProfileId,
    readChoice: readChoice,
    saveChoice: saveChoice,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (!root || !root.document) return;

  var doc = root.document;

  function social() {
    var s = root.CognationSupabaseSocial;
    return s && typeof s.active === "function" && s.active() ? s : null;
  }

  function signedInUserId() {
    var auth = root.CognationAuth;
    var sess = auth && typeof auth.getSession === "function" ? auth.getSession() : null;
    return sess && sess.source === "supabase" && sess.supabaseUserId ? String(sess.supabaseUserId) : "";
  }

  function myProfiles() {
    var s = social();
    return s && typeof s.getMyProfiles === "function" ? s.getMyProfiles() || [] : [];
  }

  function sessionStore() {
    try { return root.sessionStorage; } catch (e) { return null; }
  }

  function el() {
    return doc.querySelector("[data-signal-post-as]");
  }

  function paint(kind) {
    var box = el();
    if (!box) return;
    box.querySelectorAll("[data-signal-post-as-btn]").forEach(function (btn) {
      var on = btn.getAttribute("data-signal-post-as-btn") === kind;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
      btn.tabIndex = on ? 0 : -1;
    });
  }

  function sync() {
    var box = el();
    if (!box) return;
    var uid = signedInUserId();
    var show = !!(social() && uid && hasProfessional(myProfiles(), uid));
    box.hidden = !show;
    paint(show ? readChoice(sessionStore(), uid) : "personal");
  }

  function choose(kind) {
    var uid = signedInUserId();
    if (!uid) return;
    saveChoice(sessionStore(), uid, kind);
    paint(normalizeChoice(kind));
  }

  /* For the composer submit: the chosen own page id, or "" (switch hidden). */
  api.currentAuthorProfileId = function () {
    var box = el();
    if (!box || box.hidden) return "";
    var uid = signedInUserId();
    return authorProfileId(readChoice(sessionStore(), uid), myProfiles(), uid);
  };
  api.sync = sync;

  function bind() {
    var box = el();
    if (!box || box.__signalPostAsBound) return;
    box.__signalPostAsBound = true;
    box.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-signal-post-as-btn]") : null;
      if (!btn || box.hidden) return;
      choose(btn.getAttribute("data-signal-post-as-btn"));
    });
    box.addEventListener("keydown", function (ev) {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(ev.key) < 0) return;
      ev.preventDefault();
      var next = readChoice(sessionStore(), signedInUserId()) === "personal" ? "professional" : "personal";
      choose(next);
      var target = box.querySelector('[data-signal-post-as-btn="' + next + '"]');
      if (target) target.focus();
    });
    ["cognation:remote-profile-loaded", "cognation:active-profile-changed", "cognation:session-started", "cognation:session-ended"].forEach(function (name) {
      doc.addEventListener(name, sync);
    });
    sync();
  }

  root.CognationSignalPostAs = api;
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", bind);
  else bind();
})(typeof window !== "undefined" ? window : null);
