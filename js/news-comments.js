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
      if (s && s.username) name = String(s.username);
      if (s && (s.accountKind === "seed" || s.accountKind === "ops" || s.isSeed))
        kind = s.accountKind === "ops" ? "ops" : "seed";
    } catch (e) {}
    return { authorName: name, accountKind: kind };
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
    var comments = listForStory(storyId), me = who().authorName;
    host.innerHTML =
      '<ul class="news-comment-list">' +
      comments.map(function (c) {
        return '<li class="news-comment-item" data-comment-id="' + esc(c.id) + '">' +
          '<span class="news-comment-author">' + esc(c.authorName) + '</span>' +
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
      article.appendChild(host);
    }
    renderThread(host, storyId, rating);
    if (!host.__bound) {
      host.__bound = true;
      host.addEventListener("submit", function (ev) {
        var form = ev.target && ev.target.closest("[data-news-comment-form]");
        if (!form || !host.contains(form)) return;
        ev.preventDefault();
        var input = form.querySelector("[data-news-comment-input]");
        var val = input ? String(input.value || "").trim() : "";
        if (!val) return;
        if (addComment({ storyId: storyId, body: val }).ok) {
          if (input) input.value = "";
          renderThread(host, storyId, rating);
        }
      });
      host.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest("[data-news-comment-react]");
        if (!btn || !host.contains(btn)) return;
        ev.preventDefault();
        toggleReact(storyId, btn.getAttribute("data-comment-id"), btn.getAttribute("data-news-comment-react"));
        renderThread(host, storyId, rating);
      });
    }
    return host;
  }

  window.CognationNewsComments = {
    KEY: KEY, MAX_SHOWN: MAX, REACT_CHIP_CLASS: REACT_CHIP_CLASS,
    isGpgRating: isGpg, isThreadVisible: isThreadVisible,
    listForStory: listForStory, addComment: addComment,
    toggleReact: toggleReact, mount: mount, viewerAge: age,
  };
})();
