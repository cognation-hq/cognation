/**
 * News story comments under each story. localStorage cognation.news.comments.v1
 * One level · oldest-first · latest 20 · text only · no auto-seed.
 * The same module (same look) also serves SIGNAL Feed posts:
 * window.CognationFeedComments on tower_post_comments (batch 06), signed-in only.
 */
(function () {
  "use strict";
  var NEWS = {
    global: "CognationNewsComments", key: "cognation.news.comments.v1",
    table: "news_story_comments", parentCol: "story_id", reportsTable: "news_comment_reports",
    reactionsTable: "news_story_comment_reactions", postSelector: "[data-news-post][data-post-id]",
    idAttr: "data-post-id", signedInOnly: false, under13NoThread: false,
  };
  /* Feed posts: only server posts (uuid ids) can carry comments (post_id FK).
     RLS returns comments only for posts the viewer can see. Under-13 or unknown
     age (same age helper as News): no Feed thread at all, nothing fetched.
     No reactions table. */
  var FEED = {
    global: "CognationFeedComments", key: "cognation.feed.comments.v1",
    table: "tower_post_comments", parentCol: "post_id", reportsTable: "tower_post_comment_reports",
    reactionsTable: "", postSelector: "[data-tower-post]",
    idAttr: "data-tower-post", signedInOnly: true, under13NoThread: true,
  };
  build(NEWS);
  build(FEED);
  function build(cfg) {
  var KEY = cfg.key;
  var MAX = 20;
  var FACES = ["❤️", "👍", "😂", "😮", "😢"];
  var REACT_CHIP_CLASS = "news-comment-react-chip";
  /* Keyword stopgap until comment reports land: the shared age-floor test in
     js/age-floor-keywords.js (also used by Tower and the SeedOps News log). */
  var HIDDEN_FOR_AGE = "Hidden for your age group";

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
    /* Shared rule (js/age-floor-keywords.js): unknown age is treated as under-13.
       Fail closed if the helper is missing. */
    var floor = window.CognationAgeFloor;
    return floor && typeof floor.viewerAge === "function" ? floor.viewerAge() : 0;
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
      id: row.id, storyId: row[cfg.parentCol], authorName: author.display_name || "Member",
      accountKind: author.account_kind || "real", body: row.body, createdAt: row.created_at, reactions: reactions,
    };
  }
  function pullStory(storyId) {
    var q = "select=id," + cfg.parentCol + ",body,created_at,author:profiles!author_profile_id(display_name,account_kind)" +
      (cfg.reactionsTable ? ",reactions:" + cfg.reactionsTable + "(face,profile_id)" : "") + "&" + cfg.parentCol + "=eq." +
      encodeURIComponent(storyId) + "&order=created_at.desc&limit=" + MAX;
    return window.CognationSupabase.rest(cfg.table, { query: q }).then(function (rows) {
      var mapped = (Array.isArray(rows) ? rows : []).map(mapRemote);
      mapped.sort(function (a, b) { return String(a.createdAt || "").localeCompare(String(b.createdAt || "")); });
      return markMyReports(mapped).then(function () {
        var d = read();
        d.byStory[storyId] = mapped;
        write(d);
        return mapped;
      });
    });
  }
  /* news_comment_reports: RLS lets a reporter read only their own rows, so this
     marks the comments you already reported. A failed lookup marks nothing. */
  function markMyReports(list) {
    var author = sessionAuthor();
    if (!author || !list.length) return Promise.resolve(list);
    var ids = list.map(function (c) { return c.id; }).filter(function (id) { return UUID_RE.test(String(id)); });
    if (!ids.length) return Promise.resolve(list);
    var q = "select=comment_id&reporter_profile_id=eq." + encodeURIComponent(author.profileId) + "&comment_id=in.(" + ids.join(",") + ")";
    return window.CognationSupabase.rest(cfg.reportsTable, { query: q }).then(function (rows) {
      var mine = {};
      (Array.isArray(rows) ? rows : []).forEach(function (r) { if (r && r.comment_id) mine[String(r.comment_id)] = true; });
      list.forEach(function (c) { if (mine[String(c.id)]) c.reportedByMe = true; });
      return list;
    }, function () { return list; });
  }
  /* One report per person per comment (unique comment_id + reporter_profile_id).
     A 409 means you already reported it: that counts as reported. */
  function reportComment(storyId, commentId) {
    var author = sessionAuthor();
    if (!author) return Promise.resolve({ ok: false, error: "signed_in_required" });
    if (!remoteOn()) return Promise.resolve({ ok: false, error: "shared_unavailable" });
    var d = read(), list = d.byStory[storyId] || [], found = null, i;
    for (i = 0; i < list.length; i++) if (list[i] && list[i].id === commentId) found = list[i];
    if (!found) return Promise.resolve({ ok: false, error: "missing" });
    if (found.reportedByMe) return Promise.resolve({ ok: true, already: true });
    function done(already) {
      found.reportedByMe = true;
      write(d);
      return { ok: true, already: !!already };
    }
    return window.CognationSupabase.rest(cfg.reportsTable, {
      method: "POST",
      body: { comment_id: commentId, reporter_profile_id: author.profileId },
    }).then(function () { return done(false); }, function (err) {
      if (err && err.status === 409) return done(true);
      return { ok: false, error: "shared" };
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
    /* clientId: the same id is sent again on a retry of the same text, so a post
       that did save (only the reply was lost) cannot be saved twice. */
    var clientId = UUID_RE.test(String(opts.clientId || "")) ? String(opts.clientId) : "";
    var row = { author_profile_id: author.profileId, body: body };
    row[cfg.parentCol] = storyId;
    if (clientId) row.id = clientId;
    function refreshed(res) {
      /* Saved is saved: a failed refresh afterwards must not report a failure. */
      return pullStory(storyId).then(function () { return res; }, function () { return res; });
    }
    return window.CognationSupabase.rest(cfg.table, { method: "POST", body: row }).then(function () {
      return refreshed({ ok: true });
    }, function (err) {
      /* 409 on a retry: that id is already taken. Count it as posted only when
         the comment with this id is really there. */
      if (!clientId || !err || err.status !== 409) return { ok: false, error: "shared" };
      return pullStory(storyId).then(function (rows) {
        var found = (rows || []).some(function (c) { return c && String(c.id) === clientId; });
        return found ? { ok: true, already: true } : { ok: false, error: "shared" };
      }, function () { return { ok: false, error: "shared" }; });
    });
  }
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function newClientId() {
    try {
      var c = window.crypto || (typeof crypto !== "undefined" ? crypto : null);
      if (c && typeof c.randomUUID === "function") return c.randomUUID();
      if (c && typeof c.getRandomValues === "function") {
        var b = c.getRandomValues(new Uint8Array(16));
        b[6] = (b[6] & 15) | 64;
        b[8] = (b[8] & 63) | 128;
        var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join("");
        return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
      }
    } catch (e) {}
    return "";
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
    /* Shared G/PG check (js/age-floor-keywords.js); fail closed if missing. */
    var floor = window.CognationAgeFloor;
    return !!(floor && typeof floor.ratingIsGPG === "function" && floor.ratingIsGPG(rating));
  }
  function isFlaggedForAge(body) {
    var floor = window.CognationAgeFloor;
    /* Fail closed: this only changes what an under-13 viewer sees. */
    return floor && typeof floor.isAdultKeyword === "function" ? floor.isAdultKeyword(body) : true;
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
    var vis = cfg.under13NoThread ? age() >= 13 : isThreadVisible(rating, age());
    /* Feed: signed-in viewers of shared (server) comments only. */
    if (cfg.signedInOnly && !(remoteOn() && sessionAuthor())) vis = false;
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
    var under13 = age() < 13;
    /* ⋯ menu with Report: signed-in shared comments only (never signed out). */
    var canReport = remoteOn() && !!signed;
    function more(c) {
      if (!canReport) return "";
      var option = c.reportedByMe
        ? '<button type="button" class="news-report-option" disabled data-news-comment-reported>Reported</button>'
        : '<button type="button" class="news-report-option" data-news-comment-report data-comment-id="' + esc(c.id) + '">Report</button>';
      return '<button type="button" class="news-comment-more" data-news-comment-more aria-haspopup="true" aria-expanded="false" aria-label="More for this comment">⋯</button>' +
        '<div class="news-report-menu" data-news-comment-menu hidden>' + option + "</div>";
    }
    host.innerHTML =
      '<ul class="news-comment-list">' +
      comments.map(function (c) {
        var author = '<span class="news-comment-author">' + esc(c.authorName) + authorBadge(c.accountKind) + '</span>';
        if (under13 && isFlaggedForAge(c.body)) {
          return '<li class="news-comment-item" data-comment-id="' + esc(c.id) + '" data-hidden-for-age>' + author +
            '<p class="news-comment-body news-comment-body--hidden">' + HIDDEN_FOR_AGE + "</p>" + more(c) + "</li>";
        }
        return '<li class="news-comment-item" data-comment-id="' + esc(c.id) + '">' + author +
          '<p class="news-comment-body">' + esc(c.body) + "</p>" + (!cfg.reactionsTable ? more(c) + "</li>" : '<div class="news-comment-reacts">' +
          FACES.map(function (f) {
            var n = c.reactions && c.reactions[f] ? c.reactions[f].length : 0;
            var mine = !!(c.reactions && c.reactions[f] && c.reactions[f].indexOf(me) >= 0);
            return '<button type="button" class="' + REACT_CHIP_CLASS + (mine ? " is-mine" : "") +
              '" data-news-comment-react="' + esc(f) + '" data-comment-id="' + esc(c.id) + '">' +
              esc(f) + (n ? '<span class="news-comment-react-count">' + n + "</span>" : "") + "</button>";
          }).join("") + "</div>" + more(c) + "</li>");
      }).join("") +
      '</ul><form class="news-comment-composer" data-news-comment-form action="#">' +
      '<input type="text" maxlength="500" placeholder="Add a comment…" data-news-comment-input>' +
      '<button type="submit" class="btn btn-secondary news-comment-submit">Post</button></form>';
    return host;
  }
  /* Reuses the News feed's own error line style (.commune-status.is-error). */
  var POST_FAILED = "Couldn't post. Try again.";
  function showPostError(host, form) {
    if (host.querySelector("[data-news-comment-error]")) return;
    var line = document.createElement("p");
    line.className = "commune-status is-error";
    line.setAttribute("data-news-comment-error", "");
    line.setAttribute("role", "status");
    line.textContent = POST_FAILED;
    form.insertAdjacentElement("afterend", line);
  }
  var REPORT_FAILED = "Couldn't report. Try again.";
  function showReportError(item) {
    if (!item || item.querySelector("[data-news-comment-report-error]")) return;
    var line = document.createElement("p");
    line.className = "commune-status is-error";
    line.setAttribute("data-news-comment-report-error", "");
    line.setAttribute("role", "status");
    line.textContent = REPORT_FAILED;
    item.appendChild(line);
  }
  function clearPostError(host) {
    var line = host.querySelector("[data-news-comment-error]");
    if (line) line.remove();
  }
  function mount(article, post) {
    if (!article) return null;
    var storyId = (post && post.id) || article.getAttribute(cfg.idAttr) || "";
    if (!storyId) return null;
    if (cfg.parentCol === "post_id" && !UUID_RE.test(String(storyId))) return null;
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
    if (remoteOn() && sessionAuthor() && !(cfg.under13NoThread && age() < 13)) {
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
          /* One post at a time: a second submit while one is in flight is ignored. */
          if (host.__posting) return;
          host.__posting = true;
          /* Retrying the same text reuses its id (see publishComment). */
          var pending = host.__pendingPost;
          if (!pending || pending.body !== val) pending = host.__pendingPost = { body: val, id: newClientId() };
          clearPostError(host);
          var btn = form.querySelector(".news-comment-submit");
          if (btn) btn.disabled = true;
          publishComment({ storyId: storyId, body: val, clientId: pending.id }).then(null, function () {
            return { ok: false, error: "shared" };
          }).then(function (res) {
            host.__posting = false;
            if (btn) btn.disabled = false;
            /* Failed: keep the typed text, say so under the composer, allow a retry. */
            if (!res || !res.ok) return showPostError(host, form);
            host.__pendingPost = null;
            if (input) input.value = "";
            renderThread(host, storyId, rating);
          });
          return;
        }
        if (addComment({ storyId: storyId, body: val }).ok) {
          if (input) input.value = "";
          renderThread(host, storyId, rating);
        } else showPostError(host, form);
      });
      host.addEventListener("input", function (ev) {
        if (ev.target && ev.target.closest && ev.target.closest("[data-news-comment-input]")) clearPostError(host);
      });
      host.addEventListener("click", function (ev) {
        var moreBtn = ev.target && ev.target.closest("[data-news-comment-more]");
        if (moreBtn && host.contains(moreBtn)) {
          ev.preventDefault();
          var menu = moreBtn.parentNode && moreBtn.parentNode.querySelector("[data-news-comment-menu]");
          if (menu) {
            menu.hidden = !menu.hidden;
            moreBtn.setAttribute("aria-expanded", menu.hidden ? "false" : "true");
          }
          return;
        }
        var reportBtn = ev.target && ev.target.closest("[data-news-comment-report]");
        if (reportBtn && host.contains(reportBtn)) {
          ev.preventDefault();
          if (reportBtn.disabled) return;
          reportBtn.disabled = true;
          var item = reportBtn.closest(".news-comment-item");
          var old = item && item.querySelector("[data-news-comment-report-error]");
          if (old) old.remove();
          reportComment(storyId, reportBtn.getAttribute("data-comment-id")).then(null, function () {
            return { ok: false };
          }).then(function (res) {
            if (res && res.ok) return renderThread(host, storyId, rating);
            reportBtn.disabled = false;
            showReportError(item);
          });
          return;
        }
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
    var stories = document.querySelectorAll(cfg.postSelector);
    for (var i = 0; i < stories.length; i++) mount(stories[i]);
    return stories.length;
  }

  window[cfg.global] = {
    KEY: KEY, MAX_SHOWN: MAX, REACT_CHIP_CLASS: REACT_CHIP_CLASS,
    isGpgRating: isGpg, isThreadVisible: isThreadVisible, isFlaggedForAge: isFlaggedForAge,
    listForStory: listForStory, addComment: addComment,
    publishComment: publishComment, pullStory: pullStory, authorBadge: authorBadge, reportComment: reportComment,
    toggleReact: toggleReact, mount: mount, mountAll: mountAll, viewerAge: age,
  };

  if (typeof document !== "undefined" && document.addEventListener) {
    ["cognation:session-started", "cognation:session-ended", "cognation:active-profile-changed"].forEach(function (name) {
      document.addEventListener(name, mountAll);
    });
    mountAll();
  }
  }
})();
