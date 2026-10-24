(function () {
  "use strict";
  var MAX = 100, CAM = 15, KICK = 10, KEY = "cognation.peer.review.v1", openKey = "";
  function read() {
    try { var d = JSON.parse(localStorage.getItem(KEY)); return d && d.fields ? d : { fields: {} }; }
    catch (e) { return { fields: {} }; }
  }
  function write(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
  function norm(s) { return String(s || "").trim().toLowerCase(); }
  function label(f) { var s = String(f || "").trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
  function slug(f) { return norm(f).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "field"; }
  function forInterest(card, interests) {
    var want = norm(card && (card.interest || card.field));
    return !!want && (interests || []).some(function (item) {
      var t = norm(item);
      return !!t && (t === want || want.indexOf(t) !== -1 || t.indexOf(want) !== -1);
    });
  }
  function ideas(name) {
    return [
      { id: "a", authorId: "mina", name: "Mina", body: "In " + name + ", which handoff should stay written down?" },
      { id: "b", authorId: "leo", name: "Leo", body: "Keep the decision in one paragraph. Drop the meeting that repeats it." },
      { id: "c", authorId: "priya", name: "Priya", body: "Name the constraint, then try the next small change." }];
  }
  function make(key, n, name) {
    return { id: key + "-" + n, n: n, kicked: {}, camera: [], members: n === 1 ? ["mina", "leo", "priya"] : [], log: n === 1 ? ideas(name) : [] };
  }
  function pack(field) {
    var doc = read(), key = slug(field), name = label(field);
    if (!doc.fields[key]) { doc.fields[key] = { field: name, rooms: [make(key, 1, name)] }; write(doc); }
    return { doc: doc, key: key, pack: doc.fields[key] };
  }
  function spill(p) {
    var last = p.pack.rooms[p.pack.rooms.length - 1];
    if (last.members.length >= MAX) { p.pack.rooms.push(make(p.key, last.n + 1, p.pack.field)); write(p.doc); }
  }
  function cards(opts) {
    opts = opts || {};
    var age = parseInt(opts.age, 10), name = label(opts.field), p, field;
    if ((!isNaN(age) && age > 0 && age < 18) || !forInterest({ field: name, interest: norm(opts.field) || norm(name) }, opts.interests)) return [];
    p = pack(name); spill(p); field = p.pack.field;
    return p.pack.rooms.map(function (r) {
      var full = r.members.length >= MAX;
      return { id: "peer-" + r.id, type: "pro-peer-review", peerReview: true, keepOnly: true, rating: "PG", minAge: 18, roomId: r.id, fieldKey: p.key, field: field, interest: norm(field), interests: [field], title: "Peer Review" + (r.n > 1 ? " " + r.n : ""), why: "You follow " + field + ".", body: full ? field + " is full at 100. Another Peer Review card is open for this field." : "Bounce " + field + " ideas with people in this field." };
    });
  }
  function find(fieldKey, roomId) {
    var doc = read(), p = doc.fields[fieldKey], found = null;
    if (p) p.rooms.forEach(function (r) { if (r.id === roomId) found = r; });
    return found ? { doc: doc, pack: p, room: found, key: fieldKey } : null;
  }
  function viewerId() {
    try { var s = JSON.parse(localStorage.getItem("cognation.session.v2") || "{}"); return String(s.activeProfileId || s.username || "you"); } catch (e) { return "you"; }
  }
  function join(fieldKey, roomId, userId) {
    var hit = find(fieldKey, roomId);
    if (!hit) return { ok: false, reason: "missing" };
    userId = String(userId || viewerId());
    var list = hit.room.members;
    if (hit.room.kicked[userId]) return { ok: false, reason: "kicked" };
    if (list.indexOf(userId) >= 0) return { ok: true, members: list.length, already: true };
    if (list.length >= MAX) { spill(hit); return { ok: false, reason: "full" }; }
    list.push(userId); spill(hit); write(hit.doc);
    return { ok: true, members: list.length };
  }
  function report(fieldKey, roomId, messageId, reporterId) {
    var hit = find(fieldKey, roomId), msg = null;
    if (!hit) return { ok: false };
    hit.room.log.forEach(function (m) { if (m.id === messageId) msg = m; });
    if (!msg) return { ok: false, reason: "missing" };
    reporterId = String(reporterId || viewerId());
    if (reporterId === msg.authorId) return { ok: false, reason: "own" };
    msg.reports = msg.reports || [];
    if (msg.reports.indexOf(reporterId) < 0) msg.reports.push(reporterId);
    if (msg.reports.length >= KICK) {
      hit.room.kicked[msg.authorId] = true;
      hit.room.members = hit.room.members.filter(function (id) { return id !== msg.authorId; });
      hit.room.camera = (hit.room.camera || []).filter(function (id) { return id !== msg.authorId; });
      hit.room.log = hit.room.log.filter(function (m) { return m.authorId !== msg.authorId; });
    }
    write(hit.doc);
    return { ok: true, kicked: !!hit.room.kicked[msg.authorId], count: msg.reports.length };
  }
  function requestCamera(fieldKey, roomId, userId) {
    var hit = find(fieldKey, roomId);
    if (!hit) return { ok: false };
    userId = String(userId || viewerId());
    if (hit.room.kicked[userId]) return { ok: false, reason: "kicked" };
    var cam = hit.room.camera = hit.room.camera || [];
    if (cam.indexOf(userId) >= 0) return { ok: true, count: cam.length, already: true };
    if (cam.length >= CAM) return { ok: false, reason: "camera_full", count: CAM };
    cam.push(userId); write(hit.doc);
    return { ok: true, count: cam.length };
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; });
  }
  function cardHtml(card) {
    return '<div class="commune-card-kicker commune-pro-kicker"><span class="commune-type-mark" data-type-mark="peer-review">Peer Review</span></div>' +
      '<h4 class="commune-card-title">' + esc(card.title) + '</h4><p class="commune-card-body">' + esc(card.body) + '</p>' +
      '<p class="commune-card-meta">' + esc(card.field) + ' · 100 people · 15 on camera · no presenter · no calendar</p>' +
      '<button type="button" class="btn btn-primary" data-peer-open>Open Peer Review</button><p class="commune-card-meta commune-card-why" data-card-why>Why you see this: ' + esc(card.why || "") + '</p>';
  }
  function paint(panel, hit) {
    var log = panel.querySelector("[data-commune-room-log]");
    if (!log || !hit) return;
    var room = hit.room, me = viewerId();
    var html = '<p class="commune-room-line commune-room-line--meta">' + esc(hit.pack.field) + " · " + room.members.length + "/100 · camera " + (room.camera || []).length + "/15 · no presenter · no calendar</p>";
    room.log.forEach(function (m) {
      var done = (m.reports || []).indexOf(me) >= 0;
      html += '<p class="commune-room-line"><span class="commune-room-meta"><strong>' + esc(m.name) + '</strong></span><span class="commune-room-body">' + esc(m.body) + '</span><button type="button" class="news-report-option" data-peer-report data-message-id="' + esc(m.id) + '"' + (done ? " disabled>Reported" : ">Report") + "</button></p>";
    });
    log.innerHTML = html;
    var btn = panel.querySelector("[data-peer-camera]");
    if (btn) btn.textContent = "Request camera (" + (room.camera || []).length + "/15)";
  }
  function open(card) {
    var panel = document.querySelector("[data-commune-room]");
    if (!panel || !card) return false;
    join(card.fieldKey, card.roomId);
    var hit = find(card.fieldKey, card.roomId);
    if (!hit) return false;
    openKey = card.fieldKey + "|" + card.roomId;
    panel.hidden = false;
    panel.setAttribute("data-peer-review", card.roomId);
    var title = panel.querySelector("[data-commune-room-title]"), topic = panel.querySelector("[data-commune-room-topic]"), kicker = panel.querySelector(".commune-card-kicker");
    if (title) title.textContent = "Peer Review · " + hit.pack.field;
    if (topic) topic.textContent = "Industry ideas for " + hit.pack.field; if (kicker) kicker.textContent = "Professional Echo · Peer Review";
    var actions = panel.querySelector(".form-actions");
    if (actions && !panel.querySelector("[data-peer-camera]")) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "btn btn-secondary"; b.setAttribute("data-peer-camera", ""); b.textContent = "Request camera";
      actions.insertBefore(b, actions.firstChild);
    }
    var input = panel.querySelector("[data-commune-room-input]");
    if (input) input.placeholder = "Share an industry idea";
    paint(panel, hit);
    return true;
  }
  function close() {
    var panel = document.querySelector("[data-commune-room]"), cam, input;
    openKey = "";
    if (!panel) return;
    panel.removeAttribute("data-peer-review");
    cam = panel.querySelector("[data-peer-camera]"); if (cam && cam.parentNode) cam.parentNode.removeChild(cam);
    input = panel.querySelector("[data-commune-room-input]"); if (input) input.placeholder = "Share something kind";
  }
  function current() { if (!openKey) return null; var p = openKey.split("|"); return find(p[0], p[1]); }
  function send(body) {
    var hit = current(), id = viewerId();
    body = String(body || "").trim().slice(0, 500);
    if (!hit || !body || hit.room.kicked[id]) return { ok: false };
    hit.room.log.push({ id: "m-" + Date.now().toString(36), authorId: id, name: "You", body: body, reports: [] });
    write(hit.doc);
    var panel = document.querySelector("[data-commune-room]");
    if (panel) paint(panel, find(hit.key, hit.room.id));
    return { ok: true };
  }
  function onClick(ev) {
    var t = ev.target && ev.target.closest ? ev.target : null, hit = current();
    if (!t || !hit) return;
    var reportBtn = t.closest("[data-peer-report]"), camBtn = t.closest("[data-peer-camera]");
    if (!reportBtn && !camBtn) return;
    ev.preventDefault();
    if (camBtn) requestCamera(hit.key, hit.room.id); else report(hit.key, hit.room.id, reportBtn.getAttribute("data-message-id"));
    var panel = document.querySelector("[data-commune-room]");
    if (panel) paint(panel, find(hit.key, hit.room.id));
  }
  if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("click", onClick);
  window.CognationPeerReview = {
    MAX: MAX, CAM: CAM, KICK: KICK, presenter: false, calendar: false,
    cards: cards, forInterest: forInterest, join: join, report: report, requestCamera: requestCamera,
    cardHtml: cardHtml, open: open, close: close, owns: function () { return !!openKey; }, send: send,
  };
})();
