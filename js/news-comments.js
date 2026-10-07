/**
 * News story comments under each story. localStorage cognation.news.comments.v1
 * One level · oldest-first · latest 20 · text only · no auto-seed.
 */
(function () {
  "use strict";
  var KEY = "cognation.news.comments.v1";
  var MAX = 20;
  var FACES = ["❤️", "👍", "😂", "😮", "😢"];
  var REACT_CHIP_CLASS = "news-comment-react-chip";

  function read() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || "null");
      return d && d.byStory ? d : { byStory: {} };
    } catch (e) { return { byStory: {} }; }
  }
  function write(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch (e) { return false; }
  }
  function age() {
    try {
      if (window.CognationCommuneSwipe && window.CognationCommuneSwipe.getMemberAge) {
        var n = window.CognationCommuneSwipe.getMemberAge();
        if (n != null && !isNaN(n)) return n;
      }
      var p = JSON.parse(localStorage.getItem("cognation.member.profile.v1") || "null");
      if (p && p.age != null) return parseInt(p.age, 10) || 0;
    } catch (e) {}
    return 21;
  }
  function who() {
    var name = "you", kind = "real";
    try {
      var s = JSON.parse(localStorage.getItem("cognation.session.demo.v1") || "null");
      if (s && String(s.profileDisplayName || "").trim()) name = String(s.profileDisplayName).trim();
      else if (s && s.username) name = String(s.username);
      /* Signed-in sessions carry the auth email as username; never show it as a name. */
      if (name.indexOf("@") !== -1) name = "Member";
      if (s && (s.accountKind === "seed" || s.accountKind === "ops" || s.isSeed))
        kind = s.accountKind === "ops" ? "ops" : "seed";
    } catch (e) {}
    return { authorName: name, accountKind: kind };
  }
  function remoteOn() {
    var c = window.CognationSupabase;
    return !!(c && typeof c.configured === "function" && c.configured() && typeof c.rest === "function");
  }
  function sessionAuthor() {
    var s = window.CognationAuth && typeof window.CognationAuth.getSession === "function" && window.CognationAuth.getSession();
    if (!s || !s.activeProfileId || !String(s.profileDisplayName || "").trim()) return null;
    var kind = s.accountKind === "ops" ? "ops" : s.accountKind === "seed" ? "seed" : "real";
    return { authorName: String(s.profileDisplayName).trim().slice(0, 80), profileId: String(s.activeProfileId), accountKind: kind };
  }
  function authorBadge(kind) {
    if (kind !== "seed" && kind !== "ops") return "";
    var label = kind === "ops" ? "Ops · demo" : "Demo · seed";
    return ' <span class="seedops-demo-badge" role="status" data-account-kind="' + kind + '">' + label + "</span>";
  }
  function mapRemote(row) {
    var author = (row && row.author) || {};
    var reactions = {};
    (row.reactions || []).forEach(function (r) {
      if (!r || !r.face || !r.profile_id) return;
      if (!reactions[r.face]) reactions[r.face] = [];
      reactions[r.face].push(String(r.profile_id));
    });
    return {
      id: row.id, storyId: row.story_id, authorName: author.display_name || "Member",
      accountKind: author.account_kind || "real", body: row.body, createdAt: row.created_at, reactions: reactions,
    };
  }
  function pullStory(storyId) {
    var q = "select=id,story_id,body,created_at,author:profiles!author_profile_id(display_name,account_kind),reactions:news_story_comment_reactions(face,profile_id)&story_id=eq." +
      encodeURIComponent(storyId) + "&order=created_at.desc&limit=" + MAX;
    return window.CognationSupabase.rest("news_story_comments", { query: q }).then(function (rows) {
      var mapped = (Array.isArray(rows) ? rows : []).map(mapRemote);
      mapped.sort(function (a, b) { return String(a.createdAt || "").localeCompare(String(b.createdAt || "")); });
      var d = read();
      d.byStory[storyId] = mapped;
      write(d);
      return mapped;
    });
  }
  function publishComment(opts) {
    opts = opts || {};
    if (opts.parentId) return Promise.resolve({ ok: false, error: "one_level_only" });
    var storyId = String(opts.storyId || "").trim();
    var body = String(opts.body || "").trim().slice(0, 500);
    if (!storyId || !body) return Promise.resolve({ ok: false, error: "missing" });
    var author = sessionAuthor();
    if (!author) return Promise.resolve({ ok: false, error: "signed_in_required" });
    if (!remoteOn()) return Promise.resolve({ ok: false, error: "shared_unavailable" });
    return window.CognationSupabase.rest("news_story_comments", {
      method: "POST",
      body: { story_id: storyId, author_profile_id: author.profileId, body: body },
    }).then(function () { return pullStory(storyId); }).then(function () {
      return { ok: true };
    }, function () { return { ok: false, error: "shared" }; });
  }
  function toggleReactShared(storyId, commentId, face) {
    var author = sessionAuthor();
    if (!author || !face) return Promise.resolve({ ok: false, error: "signed_in_required" });
    var found = null, list = listForStory(storyId), i;
    for (i = 0; i < list.length; i++) if (list[i] && list[i].id === commentId) found = list[i];
    if (!found) return Promise.resolve({ ok: false, error: "missing" });
    var mine = !!(found.reactions && found.reactions[face] && found.reactions[face].indexOf(author.profileId) >= 0);
    var req = mine
      ? window.CognationSupabase.rest("news_story_comment_reactions", {
          method: "DELETE",
          query: "comment_id=eq." + encodeURIComponent(commentId) + "&profile_id=eq." + encodeURIComponent(author.profileId) + "&face=eq." + encodeURIComponent(face),
        })
      : window.CognationSupabase.rest("news_story_comment_reactions", {
          method: "POST",
          body: { comment_id: commentId, profile_id: author.profileId, face: face },
        });
    return req.then(function () { return pullStory(storyId); }).then(function () {
      return { ok: true };
    }, function () { return { ok: false, error: "shared" }; });
  }
  function isGpg(rating) {
    var r = String(rating || "").toUpperCase().replace(/[–—]/g, "-").replace(/\s+/g, "");
    return r === "G" || r === "PG" || r === "G-PG" || r === "GPG";
  }
  function isThreadVisible(rating, viewerAge) {
    if (viewerAge == null || isNaN(viewerAge)) viewerAge = age();
    return viewerAge >= 13 || isGpg(rating);
  }
  function listForStory(storyId) {
    var raw = (read().byStory[storyId] || []).filter(function (c) { return c && !c.parentId; });
    raw.sort(function (a, b) { return String(a.createdAt || "").localeCompare(String(b.createdAt || "")); });
    return raw.length > MAX ? raw.slice(-MAX) : raw;
  }
  function addComment(opts) {
    opts = opts || {};
    if (opts.parentId) return { ok: false, error: "one_level_only" };
    var storyId = String(opts.storyId || "").trim();
    var body = String(opts.body || "").trim().slice(0, 500);
    if (!storyId || !body) return { ok: false, error: "missing" };
    var w = who();
    var c = {
      id: "nc-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      storyId: storyId, authorName: opts.authorName || w.authorName,
      accountKind: opts.accountKind || w.accountKind, body: body,
      createdAt: opts.createdAt || new Date().toISOString(), reactions: {},
    };
    var d = read();
    if (!d.byStory[storyId]) d.byStory[storyId] = [];
    d.byStory[storyId].push(c);
    return write(d) ? { ok: true, comment: c } : { ok: false, error: "storage" };
  }
  function toggleReact(storyId, commentId, face) {
    face = String(face || "");
    if (!face) return { ok: false, error: "missing" };
    var d = read(), list = d.byStory[storyId], found = null, i;
    if (!Array.isArray(list)) return { ok: false, error: "missing" };
    for (i = 0; i < list.length; i++) if (list[i] && list[i].id === commentId) { found = list[i]; break; }
    if (!found) return { ok: false, error: "missing" };
    if (!found.reactions) found.reactions = {};
    var u = Array.isArray(found.reactions[face]) ? found.reactions[face].slice() : [];
    var me = who().authorName, ix = u.indexOf(me);
    if (ix >= 0) u.splice(ix, 1); else u.push(me);
    if (u.length) found.reactions[face] = u; else delete found.reactions[face];
    return write(d) ? { ok: true, comment: found } : { ok: false, error: "storage" };
  }
  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function renderThread(host, storyId, rating) {
    if (!host) return null;
    var vis = isThreadVisible(rating, age());
    host.hidden = !vis;
    host.setAttribute("data-news-comments", "");
    host.setAttribute("data-story-id", storyId);
    if (rating) host.setAttribute("data-story-rating", String(rating));
    if (!vis) { host.innerHTML = ""; return host; }
    var signed = sessionAuthor();
    var me = remoteOn() && signed ? signed.profileId : who().authorName;
    if (remoteOn() && !signed) {
      host.innerHTML = '<p class="news-comment-signin">Sign in to see and post comments.</p>';
      return host;
    }
    var comments = listForStory(storyId);
    host.innerHTML =
      '<ul class="news-comment-list">' +
      comments.map(function (c) {
        return '<li class="news-comment-item" data-comment-id="' + esc(c.id) + '">' +
          '<span class="news-comment-author">' + esc(c.authorName) + authorBadge(c.accountKind) + '</span>' +
          '<p class="news-comment-body">' + esc(c.body) + '</p><div class="news-comment-reacts">' +
          FACES.map(function (f) {
            var n = c.reactions && c.reactions[f] ? c.reactions[f].length : 0;
            var mine = !!(c.reactions && c.reactions[f] && c.reactions[f].indexOf(me) >= 0);
            return '<button type="button" class="' + REACT_CHIP_CLASS + (mine ? " is-mine" : "") +
              '" data-news-comment-react="' + esc(f) + '" data-comment-id="' + esc(c.id) + '">' +
              esc(f) + (n ? '<span class="news-comment-react-count">' + n + "</span>" : "") + "</button>";
          }).join("") + "</div></li>";
      }).join("") +
      '</ul><form class="news-comment-composer" data-news-comment-form action="#">' +
      '<input type="text" maxlength="500" placeholder="Add a comment…" data-news-comment-input>' +
      '<button type="submit" class="btn btn-secondary news-comment-submit">Post</button></form>';
    return host;
  }
  function mount(article, post) {
    if (!article) return null;
    var storyId = (post && post.id) || article.getAttribute("data-post-id") || "";
    if (!storyId) return null;
    var rating = (post && post.rating) || article.getAttribute("data-news-rating") || "";
    if (rating) article.setAttribute("data-news-rating", String(rating));
    var host = article.querySelector("[data-news-comments]");
    if (!host) {
      host = document.createElement("div");
      host.className = "news-story-comments";
      /* Mark the slot now: a signed-in render waits on pullStory(), and a second
         mount() in that window must find this slot instead of adding another. */
      host.setAttribute("data-news-comments", "");
      article.appendChild(host);
    }
    /* Every mount() redraws this one slot; only the latest call may paint, so a
       slow pull from an earlier call (old session or profile) loses. */
    var token = (host.__renderToken || 0) + 1;
    host.__renderToken = token;
    if (remoteOn() && sessionAuthor()) {
      pullStory(storyId).then(function () {
        if (host.__renderToken === token) renderThread(host, storyId, rating);
      }, function () {
        if (host.__renderToken !== token) return;
        var d = read(); d.byStory[storyId] = []; write(d); renderThread(host, storyId, rating);
      });
    } else renderThread(host, storyId, rating);
    if (!host.__bound) {
      host.__bound = true;
      host.addEventListener("submit", function (ev) {
        var form = ev.target && ev.target.closest("[data-news-comment-form]");
        if (!form || !host.contains(form)) return;
        ev.preventDefault();
        var input = form.querySelector("[data-news-comment-input]");
        var val = input ? String(input.value || "").trim() : "";
        if (!val) return;
        if (remoteOn()) {
          publishComment({ storyId: storyId, body: val }).then(function (res) {
            if (!res || !res.ok) return;
            if (input) input.value = "";
            renderThread(host, storyId, rating);
          });
          return;
        }
        if (addComment({ storyId: storyId, body: val }).ok) {
          if (input) input.value = "";
          renderThread(host, storyId, rating);
        }
      });
      host.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest("[data-news-comment-react]");
        if (!btn || !host.contains(btn)) return;
        ev.preventDefault();
        var cid = btn.getAttribute("data-comment-id");
        var face = btn.getAttribute("data-news-comment-react");
        if (remoteOn()) {
          toggleReactShared(storyId, cid, face).then(function () { renderThread(host, storyId, rating); });
          return;
        }
        toggleReact(storyId, cid, face);
        renderThread(host, storyId, rating);
      });
    }
    return host;
  }

  /* commune.js (deferred, earlier in index.html) can render the feed before this
     file runs, so its mount() call is skipped. Mount any stories already on the
     page, and re-render threads when the session starts, ends or switches profile
     (a saved session is restored after the first paint). */
  function mountAll() {
    if (typeof document === "undefined" || !document.querySelectorAll) return 0;
    var stories = document.querySelectorAll("[data-news-post][data-post-id]");
    for (var i = 0; i < stories.length; i++) mount(stories[i]);
    return stories.length;
  }

  window.CognationNewsComments = {
    KEY: KEY, MAX_SHOWN: MAX, REACT_CHIP_CLASS: REACT_CHIP_CLASS,
    isGpgRating: isGpg, isThreadVisible: isThreadVisible,
    listForStory: listForStory, addComment: addComment,
    publishComment: publishComment, pullStory: pullStory, authorBadge: authorBadge,
    toggleReact: toggleReact, mount: mount, mountAll: mountAll, viewerAge: age,
  };

  if (typeof document !== "undefined" && document.addEventListener) {
    ["cognation:session-started", "cognation:session-ended", "cognation:active-profile-changed"].forEach(function (name) {
      document.addEventListener(name, mountAll);
    });
    mountAll();
  }
})();
