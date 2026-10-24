/* Research chat for professional pages. Cap 100 then another card. Log, 15 camera requests, no presenter, no calendar, no media server. Ten reports kick that person from this room only. */
(function () {
  "use strict";
  var KEY = "cognation.research.rooms.v1", CAP = 100, CAM = 15, KICK = 10;
  var PURPOSE = "Ideas for upcoming research needs and new articles, across industries.";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || ""); } catch (e) { return null; } }
  function write(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
  function viewer() {
    var id = "you", name = "You";
    try {
      var s = JSON.parse(localStorage.getItem("cognation.session.v2") || "null");
      if (s && (s.activeProfileId || s.username)) id = String(s.activeProfileId || s.username);
      if (s && (s.displayName || s.username)) name = String(s.displayName || s.username);
    } catch (e) {}
    return { id: id, name: name };
  }
  function blank(n) { return { id: "research-" + n, n: n, members: [], kicked: [], cam: [], msgs: [] }; }
  function load() {
    var d = read();
    if (!d || !Array.isArray(d.rooms) || !d.rooms.length) d = { rooms: [blank(1)] };
    d.rooms.forEach(function (r) {
      r.members = r.members || []; r.kicked = r.kicked || []; r.cam = r.cam || []; r.msgs = r.msgs || [];
    });
    var last = d.rooms[d.rooms.length - 1];
    if (last.members.length >= CAP) { d.rooms.push(blank(d.rooms.length + 1)); write(d); }
    return d;
  }
  function room(d, id) { for (var i = 0; i < d.rooms.length; i++) if (d.rooms[i].id === id) return d.rooms[i]; return null; }
  function cards() {
    return load().rooms.map(function (r) {
      return {
        id: r.id, type: "pro-research", title: r.n > 1 ? "Research " + r.n : "Research",
        body: PURPOSE, why: "Your interests include research.", interests: ["research"],
        rating: "PG", minAge: 18, keepOnly: true, full: r.members.length >= CAP, members: r.members.length
      };
    });
  }
  function report(roomId, msgId, reporterId) {
    var d = load(), r = room(d, roomId), msg = null;
    if (!r) return { ok: false };
    r.msgs.forEach(function (m) { if (m.id === msgId) msg = m; });
    if (!msg || msg.by === reporterId) return { ok: false };
    msg.reports = msg.reports || [];
    if (msg.reports.indexOf(reporterId) < 0) msg.reports.push(reporterId);
    var kicked = msg.reports.length >= KICK && r.kicked.indexOf(msg.by) < 0;
    if (kicked) {
      r.kicked.push(msg.by);
      r.members = r.members.filter(function (id) { return id !== msg.by; });
      r.cam = r.cam.filter(function (id) { return id !== msg.by; });
    }
    write(d);
    return { ok: true, kicked: kicked };
  }
  function requestCamera(roomId, userId) {
    var d = load(), r = room(d, roomId);
    if (!r || r.kicked.indexOf(userId) >= 0) return { ok: false };
    if (r.cam.indexOf(userId) >= 0) return { ok: true, n: r.cam.length };
    if (r.cam.length >= CAM) return { ok: false, full: true, n: CAM };
    r.cam.push(userId);
    write(d);
    return { ok: true, n: r.cam.length };
  }
  var panel, openId = "";
  function paint() {
    var r = room(load(), openId), v = viewer();
    if (!r || !panel) return;
    var out = r.kicked.indexOf(v.id) >= 0;
    panel.querySelector("[data-research-title]").textContent = r.n > 1 ? "Research " + r.n : "Research";
    panel.querySelector("[data-research-meta]").textContent = out
      ? "Removed from this Research room only."
      : r.members.length + " / " + CAP + " · camera " + r.cam.length + " / " + CAM + " · no presenter · no calendar";
    var log = panel.querySelector("[data-research-log]");
    log.innerHTML = "";
    (r.msgs.length ? r.msgs : [{ id: "", name: "Research", by: "", body: PURPOSE, reports: [] }]).forEach(function (m) {
      var row = document.createElement("p");
      row.className = "commune-room-line research-line";
      var reported = !!(m.id && (m.reports || []).indexOf(v.id) >= 0);
      row.innerHTML = "<span><strong>" + esc(m.name) + '</strong> <span class="commune-room-body">' + esc(m.body) + "</span></span>" +
        (m.id ? '<button type="button" class="news-report-option" data-research-report data-msg="' + esc(m.id) + '"' +
          (reported || m.by === v.id ? " disabled" : "") + ">" + (reported ? "Reported" : "Report") + "</button>" : "");
      log.appendChild(row);
    });
    var cam = panel.querySelector("[data-research-cam]");
    cam.disabled = out || r.cam.indexOf(v.id) >= 0 || r.cam.length >= CAM;
    cam.textContent = r.cam.indexOf(v.id) >= 0 ? "Camera requested" : "Request camera";
    panel.querySelector("[data-research-input]").disabled = out;
  }
  function ensure() {
    if (panel) return panel;
    panel = document.createElement("section");
    panel.className = "commune-room";
    panel.setAttribute("data-research-room", "");
    panel.setAttribute("data-commune-room-overlay", "");
    panel.hidden = true;
    panel.innerHTML = '<div class="commune-room-head"><button type="button" class="commune-room-head-back" data-research-back>‹ Back</button>' +
      '<div class="commune-room-head-titles"><h4 class="commune-card-title" data-research-title>Research</h4>' +
      '<p class="commune-room-members" data-research-meta></p></div></div>' +
      '<div class="commune-room-log" data-research-log role="log"></div>' +
      '<form class="commune-room-compose" data-research-form><textarea data-research-input rows="2" maxlength="500" placeholder="A research need or a new article idea"></textarea>' +
      '<div class="form-actions"><button type="submit" class="btn btn-primary">Send</button>' +
      '<button type="button" class="btn btn-secondary" data-research-cam>Request camera</button></div></form>';
    document.body.appendChild(panel);
    panel.querySelector("[data-research-back]").addEventListener("click", close);
    panel.querySelector("[data-research-form]").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var input = panel.querySelector("[data-research-input]");
      var text = String(input.value || "").trim();
      var d = load(), r = room(d, openId), v = viewer();
      if (!text || !r || r.kicked.indexOf(v.id) >= 0 || r.members.indexOf(v.id) < 0) return;
      input.value = "";
      r.msgs.push({ id: "m" + Date.now().toString(36), by: v.id, name: v.name, body: text.slice(0, 500), reports: [] });
      write(d); paint();
    });
    panel.querySelector("[data-research-cam]").addEventListener("click", function () { requestCamera(openId, viewer().id); paint(); });
    panel.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest && ev.target.closest("[data-research-report]");
      if (!b || b.disabled) return;
      report(openId, b.getAttribute("data-msg"), viewer().id); paint();
    });
    return panel;
  }
  function close() { openId = ""; if (panel) panel.hidden = true; document.body.classList.remove("commune-room-view-open"); }
  function open(id) {
    var d = load(), r = room(d, id) || d.rooms[0], v = viewer();
    if (r.kicked.indexOf(v.id) >= 0) return false;
    if (r.members.indexOf(v.id) < 0) {
      if (r.members.length >= CAP) return false;
      r.members.push(v.id);
      write(d);
      if (r.members.length >= CAP) load();
    }
    openId = r.id;
    ensure().hidden = false;
    document.body.classList.add("commune-room-view-open");
    paint();
    if (r.members.length >= CAP && window.CognationCommuneSwipe && window.CognationCommuneSwipe.rebuild) {
      try { window.CognationCommuneSwipe.rebuild(); } catch (e) {}
    }
    return true;
  }
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && openId) close(); });
  window.CognationResearchRoom = {
    cards: cards, open: open, close: close, report: report, requestCamera: requestCamera,
    CAP: CAP, CAM: CAM, KICK: KICK, PURPOSE: PURPOSE, KEY: KEY
  };
})();
