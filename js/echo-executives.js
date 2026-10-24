/** Professional Echo Executives chatroom. Interest-gated. 100 people, a chat log, 15 camera requests, no presenter, no calendar event. A full room adds another card. Ten reports kick that person from that room only. No media server. */
(function () {
  "use strict";
  var KEY = "cognation.echo.executives.v1", CAP = 100, CAM = 15, KICK_AT = 10, NEED = ["executive", "executives"];
  function read(key, fallback) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }
  function write(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  }
  function store() {
    var d = read(KEY, null);
    return d && d.rooms ? d : { n: 0, rooms: {} };
  }
  function session() { return read("cognation.session.v2", {}) || {}; }
  function me() { return String(session().activeProfileId || session().username || "you"); }
  function myName() { return String(session().profileDisplayName || session().username || "Member").trim().slice(0, 80) || "Member"; }
  function wants(tokens) { return NEED.some(function (n) { return (tokens || []).indexOf(n) >= 0; }); }
  function blank(d) {
    d.n += 1;
    d.rooms["exec-" + d.n] = { id: "exec-" + d.n, members: [], kicked: [], cameras: [], messages: [] };
    return d.rooms["exec-" + d.n];
  }
  function openRoom(d) {
    var found = null;
    Object.keys(d.rooms).forEach(function (id) { if (d.rooms[id].members.length < CAP) found = d.rooms[id]; });
    return found || blank(d);
  }
  function cardFor(r) {
    var full = r.members.length >= CAP;
    return {
      id: "pro-" + r.id, type: "pro-executives", roomId: r.id, title: "Executives", topic: "executives",
      interests: ["executives"], rating: "G", minAge: 13, keepOnly: true, executives: true,
      presenter: false, calendar: false, full: full, cap: CAP, why: "Your interests include Executives.",
      body: full ? "This Executives room is full. Another Executives card is in the deck."
        : "Up to 100 people. Chat log. Up to 15 camera requests. No presenter and no calendar event.",
    };
  }
  function cards(tokens) {
    if (!wants(tokens)) return [];
    var d = store(), current = openRoom(d), viewer = me(), list = [];
    write(d);
    Object.keys(d.rooms).forEach(function (id) {
      var r = d.rooms[id];
      if (r.kicked.indexOf(viewer) < 0 && (r === current || r.members.indexOf(viewer) >= 0)) list.push(cardFor(r));
    });
    return list;
  }
  function join(roomId) {
    var d = store(), r = d.rooms[roomId], id = me();
    if (!r) return { ok: false, message: "That Executives room is not available." };
    if (r.kicked.indexOf(id) >= 0) return { ok: false, kicked: true, message: "You were removed from this Executives room." };
    if (r.members.indexOf(id) >= 0) return { ok: true };
    if (r.members.length >= CAP) { openRoom(d); write(d); return { ok: false, full: true, message: "This Executives room is full. Another Executives card is in the deck." }; }
    r.members.push(id);
    if (r.members.length >= CAP) openRoom(d);
    return write(d) ? { ok: true } : { ok: false };
  }
  function post(roomId, text) {
    var body = String(text || "").trim().slice(0, 500), d = store(), r = d.rooms[roomId], id = me();
    if (!body || !r || r.kicked.indexOf(id) >= 0 || r.members.indexOf(id) < 0) return { ok: false, message: "Join this Executives room before posting." };
    r.messages.push({ id: "m-" + Date.now().toString(36) + "-" + r.messages.length, authorId: id, authorName: myName(), body: body, reports: [] });
    r.messages = r.messages.slice(-200);
    return write(d) ? { ok: true } : { ok: false };
  }
  function report(roomId, messageId) {
    var d = store(), r = d.rooms[roomId], reporter = me(), msg = null, kicked = false;
    if (!r) return { ok: false };
    r.messages.forEach(function (m) { if (m && m.id === messageId) msg = m; });
    if (!msg || msg.authorId === reporter) return { ok: false };
    if (msg.reports.indexOf(reporter) < 0) msg.reports.push(reporter);
    if (msg.reports.length >= KICK_AT) {
      r.members = r.members.filter(function (m) { return m !== msg.authorId; });
      r.cameras = r.cameras.filter(function (m) { return m !== msg.authorId; });
      if (r.kicked.indexOf(msg.authorId) < 0) r.kicked.push(msg.authorId);
      kicked = true;
    }
    return write(d) ? { ok: true, kicked: kicked, reports: msg.reports.length } : { ok: false };
  }
  function requestCamera(roomId) {
    var d = store(), r = d.rooms[roomId], id = me();
    if (!r || r.kicked.indexOf(id) >= 0 || r.members.indexOf(id) < 0) return { ok: false };
    if (r.cameras.indexOf(id) >= 0) return { ok: true, already: true, count: r.cameras.length };
    if (r.cameras.length >= CAM) return { ok: false, full: true, message: "15 people have already requested a camera." };
    r.cameras.push(id);
    return write(d) ? { ok: true, count: r.cameras.length } : { ok: false };
  }
  function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function paint(panel, roomId) {
    if (!panel) return;
    var r = store().rooms[roomId];
    if (!r) return;
    panel.setAttribute("data-executives-room", roomId);
    var log = panel.querySelector("[data-commune-room-log]");
    var note = r.kicked.indexOf(me()) >= 0 ? "You were removed from this Executives room." : "No presenter. No calendar event. " + r.members.length + "/" + CAP + " people.";
    var kicker = panel.querySelector(".commune-card-kicker");
    var title = panel.querySelector("[data-commune-room-title]");
    var topic = panel.querySelector("[data-commune-room-topic]");
    if (kicker) kicker.textContent = "Executives · chatroom · hosted by Cognation";
    if (title) title.textContent = "Executives";
    if (topic) topic.textContent = note;
    var members = panel.querySelector("[data-commune-room-members]");
    if (!members && log) { members = document.createElement("p"); members.className = "commune-card-meta commune-room-members"; members.setAttribute("data-commune-room-members", ""); log.parentNode.insertBefore(members, log); }
    if (members) { members.hidden = false; members.textContent = note; }
    var cam = panel.querySelector("[data-executives-camera]");
    if (!cam && log) { cam = document.createElement("button"); cam.type = "button"; cam.className = "btn btn-secondary"; cam.setAttribute("data-executives-camera", ""); log.parentNode.insertBefore(cam, log); }
    if (cam) cam.textContent = r.cameras.length >= CAM ? "Camera requests full" : "Request camera (" + r.cameras.length + "/" + CAM + ")";
    if (log) {
      var mine = me();
      log.innerHTML = r.messages.map(function (m) {
        return "<p class=\"commune-room-line\"><strong>" + esc(m.authorName) + "</strong> " + esc(m.body) +
          " <button type=\"button\" data-executives-report data-message-id=\"" + esc(m.id) + "\"" + (m.authorId === mine ? " disabled" : "") + ">Report</button></p>";
      }).join("") || "<p class=\"commune-room-line\">Chat log is empty.</p>";
    }
    if (panel.getAttribute("data-executives-wired")) return;
    panel.setAttribute("data-executives-wired", "1");
    panel.addEventListener("click", function (ev) {
      var t = ev.target, idNow = panel.getAttribute("data-executives-room") || "";
      if (!t || !t.closest) return;
      var reportBtn = t.closest("[data-executives-report]");
      if (reportBtn && !reportBtn.disabled) report(idNow, reportBtn.getAttribute("data-message-id"));
      else if (t.closest("[data-executives-camera]")) requestCamera(idNow);
      else return;
      ev.preventDefault();
      paint(panel, idNow);
    });
  }
  window.CognationEchoExecutives = {
    CAP: CAP, CAM: CAM, KICK_AT: KICK_AT, KEY: KEY, cards: cards, join: join, post: post,
    report: report, requestCamera: requestCamera, paint: paint,
    isRoom: function (id) { return String(id || "").indexOf("exec-") === 0; },
    clearChrome: function (panel) {
      if (!panel) return;
      panel.removeAttribute("data-executives-room");
      var cam = panel.querySelector("[data-executives-camera]");
      if (cam) cam.remove();
    },
  };
})();
