/* Professional Echo: Content Creator chatroom. Interest-gated by the deck.
   Cap 100 (then a new card). Chat log. 15 camera requests, no media server.
   No presenter, no calendar. 10 reports on one comment kick that person from this room only. */
(function () {
  "use strict";
  var KEY = "cognation.echo.content-creator.v1";
  var CAP = 100, CAM = 15, KICK = 10;
  var INTERESTS = ["content creator", "content creation", "content creators"];

  function read() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || "");
      if (d && d.rooms) return d;
    } catch (e) {}
    return { n: 1, rooms: {} };
  }
  function write(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
  function rid(n) { return "content-creator-" + n; }
  function box(d, id) {
    if (!d.rooms[id]) d.rooms[id] = { members: [], kicked: [], log: [], camera: [], reports: {} };
    return d.rooms[id];
  }
  function openId(d) {
    var n = d.n || 1, r = box(d, rid(n));
    if (r.members.length >= CAP) { d.n = n + 1; r = box(d, rid(d.n)); }
    return rid(d.n || n);
  }
  function cardFor(id) {
    return {
      id: id, type: "pro-creator", title: "Content Creator", roomKind: "content-creator",
      body: "Chatroom for people who make things. Up to 100 people.",
      why: "You listed Content Creator as an interest.",
      interests: ["content creator"], rating: "PG-13", minAge: 13, keepOnly: true,
    };
  }
  function cards(show) {
    if (!show) return [];
    var d = read(), id = openId(d);
    write(d);
    return [cardFor(id)];
  }
  function num(id) { var m = /(\d+)$/.exec(String(id || "")); return m ? parseInt(m[1], 10) : 1; }
  function enter(id, userId) {
    userId = String(userId || "you");
    var d = read(), r = box(d, id);
    if (r.kicked.indexOf(userId) >= 0) return { ok: false, error: "kicked", room: r };
    if (r.members.indexOf(userId) < 0) {
      if (r.members.length >= CAP) {
        if ((d.n || 1) <= num(id)) d.n = num(id) + 1;
        write(d);
        return { ok: false, error: "full", nextId: rid(d.n), room: r };
      }
      r.members.push(userId);
    }
    write(d);
    return { ok: true, room: r, id: id };
  }
  function send(id, userId, name, body) {
    body = String(body || "").trim().slice(0, 500);
    if (!body) return { ok: false, error: "empty" };
    var joined = enter(id, userId);
    if (!joined.ok) return joined;
    var d = read(), r = box(d, id);
    r.log.push({ id: "m" + r.log.length + "-" + Date.now().toString(36), authorId: String(userId || "you"), name: String(name || "Member").slice(0, 80), body: body });
    if (r.log.length > 200) r.log = r.log.slice(-200);
    write(d);
    return { ok: true, room: r };
  }
  function report(id, msgId, reporterId) {
    reporterId = String(reporterId || "");
    var d = read(), r = box(d, id), msg = null;
    r.log.forEach(function (m) { if (m.id === msgId) msg = m; });
    if (!msg || !reporterId || msg.authorId === reporterId) return { ok: false, error: "skip", room: r };
    var who = r.reports[msgId] || [];
    if (who.indexOf(reporterId) < 0) who.push(reporterId);
    r.reports[msgId] = who;
    var kicked = false;
    if (who.length >= KICK && r.kicked.indexOf(msg.authorId) < 0) {
      r.kicked.push(msg.authorId);
      r.members = r.members.filter(function (u) { return u !== msg.authorId; });
      r.camera = r.camera.filter(function (u) { return u !== msg.authorId; });
      kicked = true;
    }
    write(d);
    return { ok: true, kicked: kicked, count: who.length, room: r };
  }
  function camera(id, userId) {
    var joined = enter(id, userId);
    if (!joined.ok) return joined;
    var d = read(), r = box(d, id);
    userId = String(userId || "you");
    if (r.kicked.indexOf(userId) >= 0) return { ok: false, error: "kicked", room: r };
    if (r.camera.indexOf(userId) >= 0) return { ok: true, already: true, room: r };
    if (r.camera.length >= CAM) return { ok: false, error: "camera_full", room: r };
    r.camera.push(userId);
    write(d);
    return { ok: true, room: r };
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function paint(panel, room) {
    if (!panel || !room) return;
    var kicker = panel.querySelector(".commune-card-kicker");
    var title = panel.querySelector("[data-commune-room-title]");
    var topic = panel.querySelector("[data-commune-room-topic]");
    var log = panel.querySelector("[data-commune-room-log]");
    if (kicker) kicker.textContent = "Content Creator · chatroom";
    if (title) title.textContent = "Content Creator";
    if (topic) topic.textContent = room.members.length + " / " + CAP + " in the chat · camera requests " + room.camera.length + " / " + CAM + " · no presenter · no calendar";
    if (!log) return;
    var html = "";
    room.log.forEach(function (m) {
      html += '<p class="commune-room-line"><strong>' + esc(m.name) + "</strong> " + esc(m.body) +
        ' <button type="button" data-creator-report="' + esc(m.id) + '">Report</button></p>';
    });
    log.innerHTML = html || '<p class="commune-room-line">The chat log is empty.</p>';
    log.innerHTML += '<p class="commune-room-line"><button type="button" data-creator-camera>Request camera</button> Request only. No live video.</p>';
  }
  function bind(panel, ctx) {
    if (!panel || panel.getAttribute("data-creator-wired")) return;
    panel.setAttribute("data-creator-wired", "1");
    panel.addEventListener("click", function (ev) {
      var t = ev.target && ev.target.closest ? ev.target : null;
      if (!t) return;
      var rep = t.closest("[data-creator-report]"), cam = t.closest("[data-creator-camera]");
      if (!rep && !cam) return;
      ev.preventDefault();
      var id = panel.getAttribute("data-creator-room");
      if (!id) return;
      var out = rep ? report(id, rep.getAttribute("data-creator-report"), ctx.me()) : camera(id, ctx.me());
      ctx.after(out);
    });
  }

  window.CognationContentCreator = {
    INTERESTS: INTERESTS, CAP: CAP, CAM: CAM, KICK: KICK,
    cards: cards, enter: enter, send: send, report: report, camera: camera, paint: paint, bind: bind, read: read,
  };
})();
