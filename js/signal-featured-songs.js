/**
 * Placeholder song titles only — no catalog, audio, or licensing call.
 * Attach one only when the artist, or a beneficiary of an artist who died, opted into the Cognation musician policy.
 * News (most reacted Feed posts) drops the song. Existing buttons and post text; no music widget.
 */
(function (root) {
  "use strict";

  var SONGS = [
    { id: "harbor-light", title: "Harbor Light", artist: "Lane & Co.", artistOptedIn: true, beneficiaryOptedIn: false, note: "artist opted in" },
    { id: "paper-boat", title: "Paper Boat", artist: "Mara Ellis", artistOptedIn: false, beneficiaryOptedIn: true, note: "beneficiary opted in" },
    { id: "night-window", title: "Night Window", artist: "Unlisted Room", artistOptedIn: false, beneficiaryOptedIn: false, note: "not opted in" }
  ];
  var pending = null;
  var stuck = [];

  function byId(id) {
    for (var i = 0; i < SONGS.length; i++) if (SONGS[i].id === id) return SONGS[i];
    return null;
  }

  function allowed(id) {
    var song = byId(id);
    if (!song || (!song.artistOptedIn && !song.beneficiaryOptedIn)) return null;
    return { id: song.id, title: song.title, artist: song.artist };
  }

  function choose(id) {
    pending = allowed(id);
    return pending;
  }

  function strip(post) {
    if (!post || !post.featuredSong) return post;
    var copy = {};
    Object.keys(post).forEach(function (key) {
      if (key !== "featuredSong") copy[key] = post[key];
    });
    return copy;
  }

  function queue(body, song) {
    var text = String(body || "").trim().slice(0, 2000);
    if (!song || !text) return;
    stuck.push({ body: text, song: song });
  }

  /* Reattach a song the server copy does not store. News still strips it. */
  function applyStuck() {
    var store = root && root.CognationTowerStore;
    if (!store || typeof store.list !== "function") return;
    var posts = store.list();
    stuck.forEach(function (row) {
      if (row.id) {
        posts.forEach(function (post) {
          if (post && post.id === row.id) post.featuredSong = row.song;
        });
        return;
      }
      for (var i = 0; i < posts.length; i++) {
        var post = posts[i];
        if (!post || post.featuredSong) continue;
        if (String(post.body || "").trim() === row.body) {
          row.id = post.id;
          post.featuredSong = row.song;
          break;
        }
      }
    });
  }

  function install(store) {
    if (!store || store.__featuredSongs || typeof store.add !== "function" || typeof store.newsList !== "function") return store;
    store.__featuredSongs = true;
    var add = store.add;
    var newsList = store.newsList;
    store.add = function (fields) {
      var song = pending && allowed(pending.id);
      var result = add.call(store, fields);
      if (!(result && result.ok && result.post && song)) return result;
      result.post.featuredSong = song;
      if (typeof store.load === "function" && typeof store.save === "function") {
        var data = store.load();
        (data && data.posts || []).forEach(function (post) {
          if (post && post.id === result.post.id) post.featuredSong = song;
        });
        if (data) store.save(data);
      }
      pending = null;
      return result;
    };
    store.newsList = function () {
      applyStuck();
      return newsList.call(store).map(strip);
    };
    return store;
  }

  function installRemote(social) {
    if (!social || social.__featuredSongs || typeof social.createTowerPost !== "function") return;
    social.__featuredSongs = true;
    var create = social.createTowerPost;
    social.createTowerPost = function (fields) {
      var song = pending && allowed(pending.id);
      var row = null;
      if (song) {
        queue(fields && fields.body, song);
        row = stuck[stuck.length - 1];
      }
      pending = null;
      return create.apply(social, arguments).then(undefined, function (err) {
        var ix = row ? stuck.indexOf(row) : -1;
        if (ix >= 0) stuck.splice(ix, 1);
        return Promise.reject(err);
      });
    };
  }

  var api = { songs: SONGS, allowed: allowed, choose: choose, strip: strip, install: install };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (!root || !root.document) return;

  var doc = root.document;

  function say(text, isError) {
    var status = doc.querySelector("[data-signal-feed-host] [data-tower-status]");
    if (!status) return;
    status.hidden = !text;
    status.textContent = text || "";
    status.classList.toggle("is-error", !!isError);
  }

  function mount() {
    var form = doc.querySelector("[data-signal-feed-host] [data-tower-compose]");
    if (!form || form.querySelector("[data-signal-featured-songs]")) return;
    var row = doc.createElement("div");
    row.className = "form-actions";
    row.setAttribute("data-signal-featured-songs", "");
    SONGS.forEach(function (song) {
      var button = doc.createElement("button");
      button.type = "button";
      button.className = "btn btn-secondary";
      button.setAttribute("data-signal-song", song.id);
      button.textContent = song.title + " — " + song.artist + " (" + song.note + ")";
      row.appendChild(button);
    });
    var actions = form.querySelector(".form-actions");
    form.insertBefore(row, actions);
    row.addEventListener("click", function (ev) {
      var button = ev.target && ev.target.closest && ev.target.closest("[data-signal-song]");
      if (!button || !row.contains(button)) return;
      ev.preventDefault();
      var song = choose(button.getAttribute("data-signal-song"));
      if (!song) {
        say("That song cannot be added. The artist and beneficiary have not opted into the Cognation musician policy.", true);
        return;
      }
      say(song.title + " — " + song.artist, false);
    });
  }

  function paint() {
    applyStuck();
    var list = doc.querySelector("[data-signal-feed-host] [data-tower-feed]");
    var store = root.CognationTowerStore;
    if (!list || !store || typeof store.list !== "function") return;
    var posts = store.list();
    list.querySelectorAll("[data-tower-post]").forEach(function (article) {
      if (article.querySelector("[data-signal-post-song]")) return;
      var id = article.getAttribute("data-tower-post") || "";
      var post = null;
      for (var i = 0; i < posts.length; i++) if (posts[i] && posts[i].id === id) post = posts[i];
      var song = post && allowed(post.featuredSong && post.featuredSong.id);
      if (!song) return;
      var line = doc.createElement("p");
      line.className = "tower-post-body";
      line.setAttribute("data-signal-post-song", "");
      line.textContent = song.title + " — " + song.artist;
      article.insertBefore(line, article.querySelector(".tower-post-reactbar"));
    });
  }

  function boot() {
    mount();
    install(root.CognationTowerStore);
    installRemote(root.CognationSupabaseSocial);
    var list = doc.querySelector("[data-signal-feed-host] [data-tower-feed]");
    if (list && typeof MutationObserver === "function") new MutationObserver(paint).observe(list, { childList: true });
    doc.addEventListener("cognation:tower-updated", paint);
    paint();
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})(typeof window !== "undefined" ? window : this);
