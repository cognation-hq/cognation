(function () {
  "use strict";
  var KEY = "cognation.echo.podcast.v1", CAP = 100, CAM = 15, KICK_AT = 10;
  var TOPICS = [
    { id: "pro-podcast-leaders", title: "Top industry performers" },
    { id: "pro-podcast-ethics", title: "Ethical collaboration" },
    { id: "pro-podcast-ce", title: "Continuing education" },
  ];
  function read(key, fallback) { try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; } }
  function write(data) { try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; } }
  function store() { var d = read(KEY, null); return d && d.rooms ? d : { n: 0, rooms: {} }; }
  function session() { return read("cognation.session.v2", {}) || {}; }
  function me() { return String(session().activeProfileId || session().username || "you"); }
  function myName() { return String(session().profileDisplayName || session().username || "Member").trim().slice(0, 80) || "Member"; }
  function topicKey(card) { return String((card && (card.podcastId || card.id)) || ""); }
  function roomsFor(d, topic) {
    var list = []; Object.keys(d.rooms).forEach(function (id) { if (d.rooms[id] && d.rooms[id].topic === topic) list.push(d.rooms[id]); }); list.sort(function (a, b) { return a.n - b.n; }); return list;
  }
  function blank(d, card) {
    d.n += 1; var topic = topicKey(card), id = "pod-" + d.n;
    d.rooms[id] = { id: id, n: roomsFor(d, topic).length + 1, topic: topic, title: String((card && card.title) || "Podcast"), members: [], kicked: [], cameras: [], messages: [] }; return d.rooms[id];
  }
  function openFor(d, card) { var found = null; roomsFor(d, topicKey(card)).forEach(function (r) { if (r.members.length < CAP) found = r; }); return found || blank(d, card); }
  function asCard(base, r) {
    var card = {}, k; for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) card[k] = base[k];
    card.type = "pro-podcast"; card.roomId = r.id; card.podcastId = r.topic; card.title = base.title || r.title;
    card.cap = CAP; card.cameraCap = CAM; card.presenter = false; card.full = r.members.length >= CAP;
    if (r.n > 1) { card.id = base.id + "-" + r.n; card.splitOf = base.id; } return card;
  }
  function present(list) {
    var d = store(), out = [], viewer = me();
    (list || []).forEach(function (card) {
      if (!card || !card.id) return;
      var rooms = roomsFor(d, topicKey(card)), open = null;
      if (!rooms.length) rooms = [blank(d, card)];
      rooms.forEach(function (r) { if (r.members.length < CAP) open = r; });
      if (!open) { blank(d, card); rooms = roomsFor(d, topicKey(card)); open = rooms[rooms.length - 1]; }
      rooms.forEach(function (r) {
        if (r.kicked.indexOf(viewer) < 0 && (r === open || r.members.indexOf(viewer) >= 0)) out.push(asCard(card, r));
      });
    });
    write(d);
    return out;
  }
  function today() { var n = new Date(); return n.getFullYear() + "-" + ("0" + (n.getMonth() + 1)).slice(-2) + "-" + ("0" + n.getDate()).slice(-2); }
  function personalRecord() {
    var accounts = window.CognationAccounts, who = String(session().username || "").toLowerCase(), rec = null, supa, remote;
    if (!accounts || who === "cognation") return null;
    if (who && typeof accounts.getProfilesForUsername === "function") (accounts.getProfilesForUsername(session().username) || []).forEach(function (p) { if (p && p.kind === "personal") rec = p; });
    supa = window.CognationSupabase; remote = supa && supa.configured && supa.configured();
    if (!rec && !remote && accounts.DEMO_ALEXA && accounts.getProfileById) rec = accounts.getProfileById(accounts.DEMO_ALEXA.personalId);
    if (!rec || rec.kind !== "personal" || String(rec.handle || "").replace(/^@/, "").toLowerCase() === "cognation") return null;
    return rec;
  }
  function ownEvent(room, date) {
    var accounts = window.CognationAccounts, rec = personalRecord();
    if (!room || !rec || typeof accounts.saveProfileRecord !== "function") return false;
    var id = "podcast-" + room.id, events = Array.isArray(rec.calendarEvents) ? rec.calendarEvents.slice() : [], prev = null, found = false;
    events.forEach(function (e) { if (e && e.id === id) prev = e; });
    var event = { id: id, title: room.title || "Podcast", date: /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : ((prev && prev.date) || today()), time: "", notes: "", status: "accepted", source: "owner", kind: "podcast", roomId: room.id };
    events = events.map(function (e) { if (e && e.id === id) { found = true; return event; } return e; });
    if (!found) events.push(event);
    rec.calendarEvents = events;
    if (!accounts.saveProfileRecord(rec)) return false;
    try { document.dispatchEvent(new CustomEvent("cognation:podcast-calendar")); } catch (e2) {}
    return true;
  }
  function topicCard(topic, title) { return { id: topic, podcastId: topic, title: title || "Podcast", type: "pro-podcast" }; }
  function join(roomId, card, date) {
    var d = store(), r = d.rooms[roomId], id = me();
    if (!r && card) r = openFor(d, card);
    if (!r) return { ok: false, message: "That podcast room is not available." };
    if (r.kicked.indexOf(id) >= 0) return { ok: false, kicked: true, message: "You were removed from this podcast room." };
    if (r.members.indexOf(id) < 0) {
      if (r.members.length >= CAP) { var next = openFor(d, topicCard(r.topic, r.title)); write(d); return { ok: false, full: true, roomId: next.id, message: "This podcast room is full. Another card for this podcast is in the deck." }; }
      r.members.push(id);
      if (r.members.length >= CAP) openFor(d, topicCard(r.topic, r.title));
    }
    if (!write(d)) return { ok: false };
    ownEvent(r, date);
    return { ok: true, roomId: r.id };
  }
  function post(roomId, text) {
    var body = String(text || "").trim().slice(0, 500), d = store(), r = d.rooms[roomId], id = me();
    if (!body || !r || r.kicked.indexOf(id) >= 0 || r.members.indexOf(id) < 0) return { ok: false, message: "Join this podcast room before posting." };
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
    if (!panel || !panel.querySelector) return;
    var r = store().rooms[roomId];
    if (!r) return;
    panel.setAttribute("data-podcast-room", roomId);
    var set = function (sel, val) { var n = panel.querySelector(sel); if (n) n.textContent = val; };
    set(".commune-card-kicker", "Podcast · chatroom · hosted by Cognation");
    set("[data-commune-room-title]", r.title || "Podcast");
    set("[data-commune-room-topic]", r.kicked.indexOf(me()) >= 0 ? "You were removed from this podcast room." : r.members.length + "/" + CAP + " people. Up to 15 camera requests. No presenter.");
    var log = panel.querySelector("[data-commune-room-log]"), cam = panel.querySelector("[data-podcast-camera]");
    if (!cam && log && log.parentNode && document.createElement) {
      cam = document.createElement("button"); cam.type = "button"; cam.className = "btn btn-secondary"; cam.setAttribute("data-podcast-camera", "");
      log.parentNode.insertBefore(cam, log);
    }
    if (cam) cam.textContent = r.cameras.length >= CAM ? "Camera requests full" : "Request camera (" + r.cameras.length + "/" + CAM + ")";
    if (log) {
      var mine = me();
      log.innerHTML = r.messages.map(function (m) {
        return "<p class=\"commune-room-line\"><strong>" + esc(m.authorName) + "</strong> " + esc(m.body) + " <button type=\"button\" data-podcast-report data-message-id=\"" + esc(m.id) + "\"" + (m.authorId === mine ? " disabled" : "") + ">Report</button></p>";
      }).join("") || "<p class=\"commune-room-line\">Chat log is empty.</p>";
    }
    if (panel.getAttribute("data-podcast-wired")) return;
    panel.setAttribute("data-podcast-wired", "1");
    panel.addEventListener("click", function (ev) {
      var t = ev.target && ev.target.closest && ev.target.closest("[data-podcast-report], [data-podcast-camera]");
      if (!t || t.disabled) return;
      ev.preventDefault();
      var idNow = panel.getAttribute("data-podcast-room") || "";
      if (t.hasAttribute("data-podcast-camera")) requestCamera(idNow); else report(idNow, t.getAttribute("data-message-id"));
      paint(panel, idNow);
    });
  }
  function addBar() {
    return '<div class="tower-cal-podcast-add"><select data-podcast-cal-type aria-label="Event type">' + TOPICS.map(function (t) { return '<option value="' + esc(t.id) + '">Podcast · ' + esc(t.title) + "</option>"; }).join("") + '</select><button type="button" class="btn btn-secondary" data-podcast-cal-add>Add</button></div>';
  }
  function addOwn(topicId, date) { var topic = TOPICS[0]; TOPICS.forEach(function (t) { if (t.id === topicId) topic = t; }); return join(topic.id, topicCard(topic.id, topic.title), date); }
  function open(roomId) { var swipe = window.CognationCommuneSwipe, tab = document.getElementById && document.getElementById("tab-commune"); if (swipe && swipe.setMode) swipe.setMode("professional"); if (tab && tab.click) tab.click(); if (swipe && swipe.openPodcast) swipe.openPodcast(roomId); }
  window.CognationEchoPodcast = {
    CAP: CAP, CAM: CAM, KICK_AT: KICK_AT, KEY: KEY, present: present, join: join, post: post, report: report,
    requestCamera: requestCamera, paint: paint, addBar: addBar, addOwn: addOwn, open: open,
    isRoom: function (id) { return String(id || "").indexOf("pod-") === 0; },
    clearChrome: function (panel) { if (!panel || !panel.querySelector) return; panel.removeAttribute("data-podcast-room"); var cam = panel.querySelector("[data-podcast-camera]"); if (cam && cam.remove) cam.remove(); },
  };
})();
