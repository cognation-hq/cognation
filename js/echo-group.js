/**
 * Feed posts tagged #group or #groups become one Echo card each.
 * Anyone can comment. A comment from someone else notifies the author.
 */
(function () {
  "use strict";

  var COMMENTS_KEY = "cognation.echo.group.comments.v1";
  var NOTICES_KEY = "cognation.commune.notices.v1";
  var TAG = /(^|[^a-z0-9])#groups?(?![a-z0-9])/i;
  var NOTICE = "Public users commented from an Echo card.";

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); return true; } catch (e) { return false; }
  }
  function session() {
    return read("cognation.session.v2", {}) || {};
  }
  function viewerId() {
    var s = session();
    return String(s.activeProfileId || s.username || "you");
  }
  function viewerName() {
    var s = session();
    var name = String(s.profileDisplayName || s.username || "Member").trim();
    if (!name || name.indexOf("@") !== -1) name = "Member";
    return name.slice(0, 80);
  }
  function isGroupPost(body) {
    return TAG.test(String(body || ""));
  }
  function posts() {
    var store = window.CognationTowerStore;
    var list = store && typeof store.list === "function" ? store.list() : [];
    var seen = {};
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (post) {
      if (!post || !post.id || seen[post.id] || !isGroupPost(post.body)) return;
      var visible = window.CognationTowerPostVisibleToViewer;
      if (typeof visible === "function" && !visible(post)) return;
      seen[post.id] = true;
      out.push(post);
    });
    return out;
  }
  function cards() {
    return posts().map(function (post) {
      return {
        id: "echo-group-" + post.id,
        type: "group",
        postId: String(post.id),
        profileId: String(post.authorProfileId || ""),
        handle: String(post.handle || "").replace(/^@/, ""),
        fromName: post.authorName || "Member",
        title: String(post.body || "").trim().slice(0, 280),
        body: "Asynchronous public group. Anyone can comment.",
        group: true,
      };
    });
  }
  function comments(postId) {
    var doc = read(COMMENTS_KEY, { byPost: {} });
    var list = doc.byPost && doc.byPost[postId];
    return Array.isArray(list) ? list : [];
  }
  function notifyAuthor(profileId) {
    if (!profileId) return;
    var doc = read(NOTICES_KEY, { byProfile: {} });
    if (!doc.byProfile) doc.byProfile = {};
    var list = Array.isArray(doc.byProfile[profileId]) ? doc.byProfile[profileId] : [];
    var kept = list.filter(function (n) { return n && n.kind !== "echo-group-comment"; });
    kept.unshift({ id: "echo-group-comment-" + profileId, kind: "echo-group-comment", body: NOTICE, at: Date.now() });
    doc.byProfile[profileId] = kept.slice(0, 8);
    write(NOTICES_KEY, doc);
    try {
      document.dispatchEvent(new CustomEvent("cognation:echo-group-notice", { detail: { profileId: profileId } }));
    } catch (e) {}
  }
  function addComment(card, text) {
    var body = String(text || "").trim().slice(0, 500);
    var postId = card && String(card.postId || "");
    if (!postId || !body) return { ok: false };
    var doc = read(COMMENTS_KEY, { byPost: {} });
    if (!doc.byPost) doc.byPost = {};
    var list = Array.isArray(doc.byPost[postId]) ? doc.byPost[postId] : [];
    var me = viewerId();
    list.push({ id: "eg-" + Date.now().toString(36), authorId: me, authorName: viewerName(), body: body, at: new Date().toISOString() });
    doc.byPost[postId] = list.slice(-20);
    if (!write(COMMENTS_KEY, doc)) return { ok: false };
    var authorId = String((card && card.profileId) || "");
    if (authorId && authorId !== me) notifyAuthor(authorId);
    var feed = window.CognationFeedComments;
    if (feed && typeof feed.publishComment === "function" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(postId)) {
      feed.publishComment({ storyId: postId, body: body });
    }
    return { ok: true };
  }
  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function paint(box, card) {
    var lines = comments(card.postId).map(function (c) {
      return '<p class="echo-group-comment"><span class="echo-group-comment-name">' + esc(c.authorName) + "</span> " + esc(c.body) + "</p>";
    }).join("");
    box.innerHTML = lines +
      '<form class="echo-group-form" data-echo-group-form action="#">' +
      '<input type="text" maxlength="500" placeholder="Comment" data-echo-group-input aria-label="Comment on this group">' +
      '<button type="submit" class="btn btn-secondary">Post</button></form>';
  }
  function bind(el, card) {
    if (!el || !card || card.type !== "group") return;
    var box = document.createElement("div");
    box.className = "echo-group-comments";
    box.setAttribute("data-echo-group", card.postId);
    paint(box, card);
    box.addEventListener("submit", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var input = box.querySelector("[data-echo-group-input]");
      var val = input ? input.value : "";
      if (!addComment(card, val).ok) return;
      if (input) input.value = "";
      paint(box, card);
    });
    el.appendChild(box);
  }

  window.CognationEchoGroups = {
    isGroupPost: isGroupPost,
    cards: cards,
    comments: comments,
    addComment: addComment,
    bind: bind,
    NOTICE: NOTICE,
  };
})();
