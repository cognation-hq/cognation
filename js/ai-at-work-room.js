/* AI at work chatroom on professional Echo cards. Not the Tech/AI room. No live video. */
(function () {
  "use strict";
  var KEY = "cognation.ai-at-work.rooms.v1", CAP = 100, CAM = 15, KICK = 10;
  var INTERESTS = ["ai at work"];
  function store() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function blank(n) { return { id: "ai-at-work-" + n, topic: "AI at work", people: [], camera: [], kicked: {}, log: [] }; }
  function doc() {
    var d = store();
    if (!d || !d.rooms || !d.rooms.length) { d = { seq: 1, rooms: [blank(1)] }; save(d); }
    return d;
  }
  function by(d, id) { var f = null; d.rooms.forEach(function (r) { if (r.id === id) f = r; }); return f; }
  /* Shown without the interest: never claim they listed AI at work. */
  function displayWhy(why, listed) {
    why = String(why || "");
    if (!listed && /listed/i.test(why) && /ai at work/i.test(why)) return "Professional Echo chatroom.";
    return why || "Professional Echo chatroom.";
  }
  function card(r) {
    return { id: r.id, type: "pro-ai-work", title: "AI at work", topic: r.topic, body: "AI at work chatroom on professional Echo cards.", why: "Professional Echo chatroom.", rating: "G", minAge: 0, keepOnly: true, cap: CAP, cameraCap: CAM };
  }
  function cards() { return doc().rooms.filter(function (r) { return r.people.length < CAP; }).map(card); }
  function spill(d, r) { if (r.people.length < CAP) return; d.seq = (d.seq || 1) + 1; d.rooms.push(blank(d.seq)); }
  function join(id, userId) {
    userId = String(userId || ""); var d = doc(), r = by(d, id);
    if (!r || !userId) return { ok: false };
    if (r.kicked[userId]) return { ok: false, kicked: true };
    if (r.people.indexOf(userId) < 0) {
      if (r.people.length >= CAP) return { ok: false, full: true };
      r.people.push(userId); spill(d, r);
    }
    save(d); return { ok: true };
  }
  function requestCamera(id, userId) {
    userId = String(userId || ""); var d = doc(), r = by(d, id);
    if (!r || !userId || r.kicked[userId]) return { ok: false };
    if (r.camera.indexOf(userId) >= 0) return { ok: true, already: true };
    if (r.camera.length >= CAM) return { ok: false, full: true };
    r.camera.push(userId); save(d); return { ok: true };
  }
  function comment(id, userId, name, body) {
    body = String(body || "").trim().slice(0, 500); userId = String(userId || "");
    var d = doc(), r = by(d, id);
    if (!r || !body || r.kicked[userId]) return { ok: false, kicked: !!(r && r.kicked[userId]) };
    var row = { id: "m" + Date.now().toString(36) + r.log.length, userId: userId, name: String(name || "Member").slice(0, 80), body: body, reports: [] };
    r.log.push(row); save(d); return { ok: true, comment: row };
  }
  function report(id, commentId, reporterId) {
    reporterId = String(reporterId || ""); var d = doc(), r = by(d, id), row = null;
    if (!r || !reporterId) return { ok: false };
    r.log.forEach(function (c) { if (c.id === commentId) row = c; });
    if (!row || row.userId === reporterId) return { ok: false };
    if (row.reports.indexOf(reporterId) < 0) row.reports.push(reporterId);
    var kicked = row.reports.length >= KICK;
    if (kicked) {
      r.kicked[row.userId] = true;
      r.people = r.people.filter(function (p) { return p !== row.userId; });
      r.camera = r.camera.filter(function (p) { return p !== row.userId; });
    }
    save(d); return { ok: true, kicked: kicked, reports: row.reports.length };
  }
  function paint(panel, id) {
    if (!panel) return;
    var r = by(doc(), id); if (!r) return;
    var set = function (sel, key, val) { var n = panel.querySelector(sel); if (n) n[key] = val; };
    set(".commune-card-kicker", "textContent", "AI at work · chatroom");
    set("[data-commune-room-title]", "textContent", "AI at work");
    set("[data-commune-room-topic]", "textContent", "Chat log · " + r.people.length + "/" + CAP + " · camera requests " + r.camera.length + "/" + CAM + " · no presenter · no calendar");
    var lines = r.log.map(function (c) {
      return '<p class="commune-room-line"><span>' + esc(c.name) + ": " + esc(c.body) + '</span> <button type="button" class="news-report-option" data-ai-work-report data-message-id="' + esc(c.id) + '">Report</button></p>';
    }).join("") || '<p class="commune-room-line">Chat log is empty.</p>';
    set("[data-commune-room-log]", "innerHTML", '<p class="commune-card-meta"><button type="button" class="btn btn-secondary" data-ai-work-camera>Request camera</button></p>' + lines);
  }
  function onClick(ev, ctx) {
    var t = ev.target && ev.target.closest && ev.target.closest("[data-ai-work-report], [data-ai-work-camera]");
    if (!t || !ctx || !ctx.panel || !ctx.panel.contains(t)) return false;
    ev.preventDefault();
    if (t.hasAttribute("data-ai-work-camera")) {
      var cam = requestCamera(ctx.roomId, ctx.me);
      paint(ctx.panel, ctx.roomId);
      ctx.status(cam && cam.full ? "Camera requests are full (15)." : "Camera requested. No live video here.");
      return true;
    }
    var res = report(ctx.roomId, t.getAttribute("data-message-id"), ctx.me);
    paint(ctx.panel, ctx.roomId);
    ctx.status(res && res.kicked ? "Reported. Removed from this chatroom only." : "Reported.");
    return true;
  }
  window.CognationAiAtWork = {
    INTERESTS: INTERESTS, CAP: CAP, CAMERA: CAM, KICK: KICK, presenter: false, calendar: false,
    displayWhy: displayWhy, cards: cards, join: join, requestCamera: requestCamera, comment: comment, report: report, paint: paint, onClick: onClick
  };
})();
