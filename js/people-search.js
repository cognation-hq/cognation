/**
 * Top-right member search.
 * Authenticated Supabase members search real Cognation profiles and open the
 * selected Tower page. The legacy directory remains available only offline.
 */
(function () {
  "use strict";

  var PEOPLE = [{"id": "alex-rivera", "first": "Alex", "last": "Rivera", "handle": "alexrivera"}, {"id": "sam-okonkwo", "first": "Sam", "last": "Okonkwo", "handle": "samok"}, {"id": "jordan-lee", "first": "Jordan", "last": "Lee", "handle": "jlee"}, {"id": "mira-chen", "first": "Mira", "last": "Chen", "handle": "mirachen"}, {"id": "chris-patel", "first": "Chris", "last": "Patel", "handle": "cpatel"}, {"id": "susan-park", "first": "Susan", "last": "Park", "handle": "susanpark"}, {"id": "devon-brooks", "first": "Devon", "last": "Brooks", "handle": "devonb"}, {"id": "riley-nguyen", "first": "Riley", "last": "Nguyen", "handle": "rileyng"}, {"id": "casey-morris", "first": "Casey", "last": "Morris", "handle": "caseym"}, {"id": "avery-kim", "first": "Avery", "last": "Kim", "handle": "averyk"}, {"id": "taylor-james", "first": "Taylor", "last": "James", "handle": "tjames"}, {"id": "morgan-diaz", "first": "Morgan", "last": "Diaz", "handle": "morgand"}, {"id": "quinn-foster", "first": "Quinn", "last": "Foster", "handle": "qfoster"}, {"id": "harper-wong", "first": "Harper", "last": "Wong", "handle": "harperw"}, {"id": "alexa-thomas", "first": "Alexa", "last": "Thomas", "handle": "alexa"}];
  var ADDED_KEY = "cognation.people.added.v1";

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

  function searchPeople(query) {
    var q = normalize(query);
    if (!q) return [];
    var social = remoteSocial();
    if (hasRemoteSession() && social && social.memberResults) {
      return social.memberResults(q).map(function (p) {
        var professional = p.kind === "professional";
        return {
          id: p.id,
          name: p.display_name || p.handle,
          handle: p.handle,
          kind: professional ? "professional" : "friend",
          remote: true
        };
      });
    }
    return friendMatches(q).concat(professionalMatches(q));
  }

  function kindLabel(kind) {
    return kind === "professional" ? "Professional" : "Friend";
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
      box.innerHTML = '<p class="people-search-empty">No friends or professional profiles found</p>';
      return;
    }
    box.hidden = false;
    items.forEach(function (p) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "people-search-row";
      row.setAttribute("role", "option");
      row.setAttribute("data-result-kind", p.kind);
      row.setAttribute("data-result-handle", p.handle);
      row.innerHTML =
        '<span class="people-search-meta">' +
        '<span class="people-search-name">' +
        escapeHtml(p.name) +
        "</span>" +
        '<span class="people-search-handle">@' +
        escapeHtml(p.handle) +
        "</span>" +
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
    input.addEventListener("input", function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        var q = input.value;
        if (!normalize(q)) {
          box.hidden = true;
          box.innerHTML = "";
          return;
        }
        renderResults(root, searchPeople(q));
      }, 120);
    });

    input.addEventListener("focus", function () {
      if (normalize(input.value)) renderResults(root, searchPeople(input.value));
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
