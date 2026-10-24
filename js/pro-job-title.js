/**
 * Pro job title edit field (Edit profile panel).
 * Shown only to the owner, on their own Pro page (profiles.kind = professional),
 * and only once profiles.job_title is known to exist on the server. Saved with
 * "Save profile". The value is plain text: read and written through .value,
 * never parsed as HTML.
 */
(function () {
  "use strict";

  function social() {
    return window.CognationSupabaseSocial || null;
  }
  function session() {
    return window.CognationAuth && window.CognationAuth.getSession
      ? window.CognationAuth.getSession()
      : null;
  }

  /* The owner's own Pro row being viewed, or null. */
  function ownProRow() {
    var s = social();
    var me = session();
    if (!s || !me || me.source !== "supabase" || !me.supabaseUserId || !me.activeProfileId) return null;
    if (!s.jobTitleSupported || !s.jobTitleSupported()) return null;
    var viewed = s.getViewedProfileId ? s.getViewedProfileId() : "";
    if (viewed && viewed !== me.activeProfileId) return null;
    var row = s.getProfile(me.activeProfileId);
    if (!row || row.kind !== "professional") return null;
    if (String(row.user_id) !== String(me.supabaseUserId)) return null;
    return row;
  }

  function parts(root) {
    root = root || document;
    var group = root.querySelector("[data-tower-job-title-fields]");
    var input = root.querySelector("[data-tower-job-title]");
    return group && input ? { group: group, input: input } : null;
  }

  function paint(root) {
    var el = parts(root);
    if (!el) return;
    var row = ownProRow();
    el.group.hidden = !row;
    el.input.disabled = !row;
    if (!row) return;
    var s = social();
    el.input.maxLength = s.JOB_TITLE_MAX || 60;
    if (document.activeElement !== el.input && !el.input.dataset.dirty) {
      el.input.value = row.job_title || "";
    }
  }

  function save(root) {
    var el = parts(root);
    var row = ownProRow();
    if (!el || !row) return Promise.resolve(null);
    var s = social();
    var next = s.normalizeJobTitle(el.input.value);
    el.input.value = next;
    if (next === (row.job_title || "")) {
      delete el.input.dataset.dirty;
      return Promise.resolve(row);
    }
    return s.updateCurrentProfile({ jobTitle: next }).then(function (saved) {
      delete el.input.dataset.dirty;
      paint(root);
      return saved;
    });
  }

  function boot() {
    var el = parts(document);
    if (!el) return;
    el.input.addEventListener("input", function () {
      el.input.dataset.dirty = "1";
    });
    var form = el.group.closest ? el.group.closest("[data-tower-profile-form]") : null;
    if (form) {
      form.addEventListener("submit", function () {
        save(document).catch(function () {
          var status = document.querySelector("[data-tower-profile-status]");
          if (!status) return;
          status.hidden = false;
          status.textContent = "Could not save your job title.";
          status.classList.add("is-error");
        });
      });
    }
    [
      "cognation:pro-job-title-support",
      "cognation:remote-profile-loaded",
      "cognation:active-profile-changed",
      "cognation:session-started",
    ].forEach(function (name) {
      document.addEventListener(name, function () { paint(document); });
    });
    window.addEventListener("hashchange", function () { paint(document); });
    var editBtn = document.querySelector("[data-tower-edit-profile]");
    if (editBtn) editBtn.addEventListener("click", function () { paint(document); });
    paint(document);
  }

  window.CognationProJobTitle = { paint: paint, save: save, ownProRow: ownProRow };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
