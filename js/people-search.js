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

  function searchPeople(query) {
    var q = normalize(query);
    if (!q) return [];
    var social = remoteSocial();
    if (hasRemoteSession() && social && social.memberResults) {
      return social.memberResults(q);
    }
    return PEOPLE.filter(function (p) {
      var full = (p.first + " " + p.last).toLowerCase();
      return (
        p.first.toLowerCase().indexOf(q) === 0 ||
        p.last.toLowerCase().indexOf(q) === 0 ||
        full.indexOf(q) !== -1 ||
        p.handle.toLowerCase().indexOf(q) !== -1 ||
        p.id.indexOf(q) !== -1
      );
    }).slice(0, 8);
  }

  function renderResults(root, items) {
    var box = root.querySelector("[data-people-search-results]");
    if (!box) return;
    var remote = hasRemoteSession();
    var added = loadAdded();
    box.innerHTML = "";
    if (!items.length) {
      box.hidden = false;
      box.innerHTML = '<p class="people-search-empty">No people found</p>';
      return;
    }
    box.hidden = false;
    items.forEach(function (p) {
      var row = document.createElement("div");
      row.className = "people-search-row";
      row.setAttribute("role", "option");
      var name = remote ? p.display_name : p.first + " " + p.last;
      var already = !remote && added.indexOf(p.id) >= 0;
      row.innerHTML =
        '<div class="people-search-meta">' +
        '<span class="people-search-name">' +
        escapeHtml(name) +
        "</span>" +
        '<span class="people-search-handle">@' +
        escapeHtml(p.handle) +
        "</span></div>" +
        '<button type="button" class="btn btn-secondary people-search-add" data-add-id="' +
        escapeHtml(p.id) +
        '"' +
        (already ? " disabled" : "") +
        ">" +
        (remote ? "Open" : already ? "Added" : "Add") +
        "</button>";
      box.appendChild(row);
    });
    box.querySelectorAll("[data-add-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-add-id");
        if (hasRemoteSession()) {
          var social = remoteSocial();
          var profile = social && social.getProfile ? social.getProfile(id) : null;
          if (profile && social.openProfile) {
            social.openProfile(profile);
            inputClear(root);
          }
          return;
        }
        if (window.CognationTowerFriends && typeof window.CognationTowerFriends.add === "function") {
          var addedFriend = window.CognationTowerFriends.add(id);
          if (addedFriend && addedFriend.full) {
            btn.textContent = "List is full";
            btn.disabled = true;
            var fullNote = document.createElement("p");
            fullNote.className = "people-search-empty";
            fullNote.textContent = "This list is full.";
            if (btn.parentNode) btn.parentNode.appendChild(fullNote);
            return;
          }
        } else {
          var ids = loadAdded();
          if (ids.length >= 6000 && ids.indexOf(id) === -1) {
            btn.textContent = "List is full";
            btn.disabled = true;
            return;
          }
          if (ids.indexOf(id) === -1) ids.push(id);
          saveAdded(ids);
        }
        var idsNow = loadAdded();
        if (idsNow.indexOf(id) === -1 && idsNow.length < 6000) {
          idsNow.push(id);
          saveAdded(idsNow);
        }
        btn.textContent = "Added";
        btn.disabled = true;
        document.dispatchEvent(
          new CustomEvent("cognation:people-added", { detail: { id: id } })
        );
      });
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
