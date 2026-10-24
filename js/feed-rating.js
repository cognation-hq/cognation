/* Hidden bot desk. Not linked in the header. No upload.
   Every personal and professional Feed post is ranked by user likes.
   Cognation Times places the top of that list. */
(function () {
  "use strict";

  function likes(post) {
    var n = Number(post && post.likes) || 0;
    var hearts = post && post.reactions && post.reactions["❤️"];
    if (Array.isArray(hearts) && hearts.length > n) n = hearts.length;
    return n;
  }

  function ranked() {
    var store = window.CognationTowerStore;
    var posts = store && typeof store.feedPlate === "function" ? store.feedPlate() : [];
    return posts.slice().sort(function (a, b) {
      var d = likes(b) - likes(a);
      if (d) return d;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  }

  function forPaper() {
    var store = window.CognationTowerStore;
    var posts = store && typeof store.newsList === "function" ? store.newsList().slice() : [];
    var rank = {};
    ranked().forEach(function (p, i) { if (p && p.id != null) rank[p.id] = i; });
    posts.sort(function (a, b) {
      var ia = Object.prototype.hasOwnProperty.call(rank, a.id) ? rank[a.id] : 1e9;
      var ib = Object.prototype.hasOwnProperty.call(rank, b.id) ? rank[b.id] : 1e9;
      return ia - ib;
    });
    return posts;
  }

  window.CognationFeedRating = { likes: likes, ranked: ranked, forPaper: forPaper };

  var listEl = typeof document !== "undefined" && document.querySelector
    ? document.querySelector("[data-feed-rating-list]")
    : null;
  if (!listEl) return;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
    });
  }

  function paint(rows) {
    listEl.hidden = false;
    listEl.innerHTML = rows.map(function (p, i) {
      var kind = p.towerKind === "professional" ? "Professional" : "Personal";
      var text = p.title ? String(p.title) + " — " + String(p.body || "") : String(p.body || "");
      return "<li class=\"fr-row\"><span class=\"fr-rank\">" + (i + 1) + "</span>" +
        "<span class=\"fr-likes\">" + likes(p) + " likes</span>" +
        "<span class=\"fr-kind\">" + kind + "</span>" +
        "<span class=\"fr-who\">" + esc(p.authorName || "Member") + "</span>" +
        "<span class=\"fr-body\">" + esc(text) + "</span></li>";
    }).join("") || "<li class=\"fr-empty\">No Feed posts yet.</li>";
  }

  function deny() {
    var note = document.querySelector("[data-feed-rating-status]");
    if (note) note.textContent = "This page is not public.";
    listEl.hidden = true;
    listEl.innerHTML = "";
  }

  var c = window.CognationSupabase;
  var live = !!(c && typeof c.configured === "function" && c.configured() && typeof c.rpc === "function");
  if (!live) { paint(ranked()); return; }
  c.rpc("cognation_is_staff", {}).then(function (yes) {
    if (yes === true) paint(ranked());
    else deny();
  }, deny);
})();
