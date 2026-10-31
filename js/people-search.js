/**
 * Top-right member search.
 * As someone types, signed-up personal and professional pages are suggested
 * together. The legacy directory remains available only offline.
 */
(function () {
  "use strict";

  var PEOPLE = [{"id": "alex-rivera", "first": "Alex", "last": "Rivera", "handle": "alexrivera"}, {"id": "sam-okonkwo", "first": "Sam", "last": "Okonkwo", "handle": "samok"}, {"id": "jordan-lee", "first": "Jordan", "last": "Lee", "handle": "jlee"}, {"id": "mira-chen", "first": "Mira", "last": "Chen", "handle": "mirachen"}, {"id": "chris-patel", "first": "Chris", "last": "Patel", "handle": "cpatel"}, {"id": "susan-park", "first": "Susan", "last": "Park", "handle": "susanpark"}, {"id": "devon-brooks", "first": "Devon", "last": "Brooks", "handle": "devonb"}, {"id": "riley-nguyen", "first": "Riley", "last": "Nguyen", "handle": "rileyng"}, {"id": "casey-morris", "first": "Casey", "last": "Morris", "handle": "caseym"}, {"id": "avery-kim", "first": "Avery", "last": "Kim", "handle": "averyk"}, {"id": "taylor-james", "first": "Taylor", "last": "James", "handle": "tjames"}, {"id": "morgan-diaz", "first": "Morgan", "last": "Diaz", "handle": "morgand"}, {"id": "quinn-foster", "first": "Quinn", "last": "Foster", "handle": "qfoster"}, {"id": "harper-wong", "first": "Harper", "last": "Wong", "handle": "harperw"}, {"id": "alexa-thomas", "first": "Alexa", "last": "Thomas", "handle": "alexa"}];
  var ADDED_KEY = "cognation.people.added.v1";
  var DEMO_IDS = {
    "prof-alexa-personal": 1,
    "prof-alexa-professional": 1,
    "prof-demo-mira-pro": 1,
    "prof-demo-jordan-pro": 1
  };
  var DEMO_USERNAMES = { alexa: 1, "mira-demo": 1, "jordan-demo": 1 };

  function remoteSocial() {
    return window.CognationSupabaseSocial || null;
  }

  function hasRemoteSession() {
    var social = remoteSocial();
    return !!(social && social.active && social.active());
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadAdded() {
    try {
      var raw = localStorage.getItem(ADDED_KEY);
      var data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function saveAdded(ids) {
    try {
      localStorage.setItem(ADDED_KEY, JSON.stringify(ids));
    } catch (e) {}
  }

  function normalize(q) {
    return String(q || "")
      .trim()
      .toLowerCase()
      .replace(/^@/, "");
  }

  function friendMatches(q) {
    return PEOPLE.filter(function (p) {
      var full = (p.first + " " + p.last).toLowerCase();
      return (
        p.first.toLowerCase().indexOf(q) === 0 ||
        p.last.toLowerCase().indexOf(q) === 0 ||
        full.indexOf(q) !== -1 ||
        p.handle.toLowerCase().indexOf(q) !== -1 ||
        p.id.indexOf(q) !== -1
      );
    }).slice(0, 6).map(function (p) {
      return {
        id: p.id,
        name: p.first + " " + p.last,
        handle: p.handle,
        kind: "friend"
      };
    });
  }

  function professionalProfiles() {
    var accounts = window.CognationAccounts;
    if (accounts && typeof accounts.ensureDemoProfessionals === "function") {
      try { accounts.ensureDemoProfessionals(); } catch (e) {}
    }
    var out = [];
    try {
      var raw = localStorage.getItem("cognation.profiles.v1");
      var doc = raw ? JSON.parse(raw) : null;
      var profiles = doc && doc.profiles ? doc.profiles : {};
      Object.keys(profiles).forEach(function (id) {
        var rec = profiles[id];
        if (!rec || rec.kind !== "professional" || !rec.handle) return;
        out.push({
          id: rec.id,
          name: rec.displayName || rec.handle,
          handle: String(rec.handle).replace(/^@/, ""),
          kind: "professional"
        });
      });
    } catch (e2) {}
    return out;
  }

  function professionalMatches(q) {
    return professionalProfiles().filter(function (p) {
      var name = String(p.name || "").toLowerCase();
      var handle = String(p.handle || "").toLowerCase();
      return name.indexOf(q) !== -1 || handle.indexOf(q) !== -1 || String(p.id || "").toLowerCase().indexOf(q) !== -1;
    }).slice(0, 6);
  }

  function sampleHandle(handle) {
    return /^(seed|ops)[-_]/.test(String(handle || "").toLowerCase());
  }

  function nameHits(name, handle, q) {
    var h = String(handle || "").toLowerCase();
    if (h.indexOf(q) === 0) return true;
    return String(name || "").toLowerCase().split(/\s+/).some(function (word) {
      return word.indexOf(q) === 0;
    });
  }

  function pageFromRow(row) {
    var handle = String((row && row.handle) || "").replace(/^@/, "");
    var name = (row && (row.displayName || row.display_name)) || handle;
    var professional = row && (row.kind === "professional");
    return {
      id: row.id,
      name: name,
      handle: handle,
      kind: professional ? "professional" : "personal",
      accountKind: row.account_kind ? String(row.account_kind).toLowerCase() : (row.accountKind ? String(row.accountKind).toLowerCase() : ""),
      remote: !!row.remote
    };
  }

  /* Pages created by signup. Demo seeds and sample handles are left out.
     Shared device, live sign-in: another member's local leftover is left out
     (CognationAccounts.localRecordVisible); the server search covers them. */
  function localSignedUp(q) {
    var out = [];
    var accounts = window.CognationAccounts;
    var visible = accounts && typeof accounts.localRecordVisible === "function" ? accounts.localRecordVisible : null;
    try {
      var raw = localStorage.getItem("cognation.profiles.v1");
      var doc = raw ? JSON.parse(raw) : null;
      var profiles = doc && doc.profiles ? doc.profiles : {};
      Object.keys(profiles).forEach(function (id) {
        var rec = profiles[id];
        if (!rec || !rec.handle || sampleHandle(rec.handle)) return;
        if (visible && !visible(rec)) return;
        if (DEMO_IDS[rec.id] || DEMO_USERNAMES[String(rec.accountUsername || "").toLowerCase()]) return;
        if (rec.kind !== "personal" && rec.kind !== "professional") return;
        if (!nameHits(rec.displayName || rec.handle, rec.handle, q)) return;
        out.push(pageFromRow(rec));
      });
    } catch (e) {}
    return out.sort(function (a, b) {
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  }

  function keepSignedUp(row) {
    if (!row || sampleHandle(row.handle)) return false;
    var u13 = window.CognationU13TestViewer;
    if (u13 && u13.isSageRow(row)) return false;
    var kind = String(row.account_kind || row.accountKind || "real").toLowerCase();
    return kind === "real" || kind === "";
  }

  /* Signed-up profiles on the server. Null when Supabase is not configured. */
  function remoteSignedUp(q) {
    var client = window.CognationSupabase;
    if (!client || typeof client.configured !== "function" || !client.configured() || typeof client.rest !== "function") {
      return null;
    }
    var safe = String(q || "").replace(/[%*,()]/g, "").slice(0, 40);
    if (!safe) return Promise.resolve([]);
    var query = "select=id,user_id,kind,handle,display_name,account_kind"
      + "&account_kind=eq.real"
      + "&or=(display_name.ilike." + encodeURIComponent(safe) + "*,display_name.ilike.*"
      + encodeURIComponent(" " + safe) + "*,handle.ilike." + encodeURIComponent(safe) + "*)"
      + "&order=display_name.asc&limit=12";
    return client.rest("profiles", { query: query }).then(function (rows) {
      return (Array.isArray(rows) ? rows : []).filter(keepSignedUp).map(function (p) {
        return {
          id: p.id,
          name: p.display_name || p.handle,
          handle: p.handle,
          kind: p.kind === "professional" ? "professional" : "personal",
          accountKind: p.account_kind ? String(p.account_kind).toLowerCase() : "",
          remote: true
        };
      });
    });
  }

  function mergePages(remote, local) {
    var seen = {};
    var out = [];
    function take(item) {
      var key = normalize((item && item.handle) || (item && item.name));
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(item);
    }
    (remote || []).forEach(take);
    (local || []).forEach(take);
    return out;
  }

  function searchPeople(query) {
    var q = normalize(query);
    if (!q) return [];
    return localSignedUp(q);
  }

  function kindLabel(kind) {
    return kind === "professional" ? "Professional" : "Personal";
  }

  function openResult(item) {
    var handle = String((item && item.handle) || "").replace(/^@/, "");
    if (!handle) return;
    var tower = document.getElementById("tab-tower");
    if (tower) tower.click();
    if (window.CognationTowerOpenProfile) {
      window.CognationTowerOpenProfile(handle);
      return;
    }
    try { location.hash = "tower-profile-" + handle; } catch (e) {}
  }

  function renderResults(root, items) {
    var box = root.querySelector("[data-people-search-results]");
    if (!box) return;
    box.innerHTML = "";
    if (!items.length) {
      box.hidden = false;
      box.innerHTML = '<p class="people-search-empty">No signed-up people found</p>';
      return;
    }
    box.hidden = false;
    items.forEach(function (p) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "people-search-row";
      row.setAttribute("role", "option");
      row.setAttribute("data-result-kind", p.kind);
      if (p.handle) row.setAttribute("data-result-handle", p.handle);
      if (p.id) row.setAttribute("data-profile-id", String(p.id));
      if (p.accountKind) row.setAttribute("data-account-kind", p.accountKind);
      row.innerHTML =
        '<span class="people-search-meta">' +
        '<span class="people-search-name-line" data-seedops-badge-slot>' +
        '<span class="people-search-name">' +
        escapeHtml(p.name) +
        "</span></span>" +
        (p.handle
          ? '<span class="people-search-handle">@' + escapeHtml(p.handle) + "</span>"
          : "") +
        '<span class="people-search-kind">' +
        kindLabel(p.kind) +
        "</span></span>" +
        '<span class="people-search-open">Open</span>';
      row.addEventListener("click", function () {
        openResult(p);
        inputClear(root);
      });
      box.appendChild(row);
    });
    /* Demo · seed / Ops · demo pill on seed and ops rows (js/seedops-badge.js). */
    var badges = window.CognationSeedOpsBadge;
    if (badges && typeof badges.syncPeopleSearch === "function") {
      try { badges.syncPeopleSearch(); } catch (eBadge) {}
    }
  }

  function inputClear(root) {
    var input = root.querySelector("[data-people-search-input]");
    var box = root.querySelector("[data-people-search-results]");
    if (input) input.value = "";
    if (box) {
      box.innerHTML = "";
      box.hidden = true;
    }
  }

  function initSearch(root) {
    var input = root.querySelector("[data-people-search-input]");
    var box = root.querySelector("[data-people-search-results]");
    if (!input || !box) return;

    var timer = null;
    var token = 0;
    function refresh() {
      var q = normalize(input.value);
      var mine = ++token;
      if (!q) {
        box.hidden = true;
        box.innerHTML = "";
        return;
      }
      var local = searchPeople(q);
      var remote = remoteSignedUp(q);
      if (!remote) {
        renderResults(root, local);
        return;
      }
      remote.then(function (rows) {
        if (mine !== token) return;
        renderResults(root, mergePages(rows, local));
      }).catch(function () {
        if (mine !== token) return;
        renderResults(root, local);
      });
    }
    input.addEventListener("input", function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 120);
    });

    input.addEventListener("focus", function () {
      if (normalize(input.value)) refresh();
    });

    document.addEventListener("click", function (e) {
      if (!root.contains(e.target)) {
        box.hidden = true;
      }
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        box.hidden = true;
        input.blur();
      }
    });
  }

  function boot() {
    document.querySelectorAll("[data-people-search]").forEach(initSearch);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.CognationPeopleDirectory = {
    search: searchPeople,
    all: function () {
      return PEOPLE.slice();
    },
  };
})();
