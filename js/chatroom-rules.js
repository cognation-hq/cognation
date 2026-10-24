/* Topic rooms: 100 people, chat log, 15 camera requests, no presenter, no calendar event.
   A full room opens another card of the same topic. Ten Reports on one comment
   kick that author from that room only — not a site ban and not Block. */
(function () {
  "use strict";
  var CAP = 100, CAM = 15, KICK = 10, KEY = "cognation.chatroom.rules.v1";
  function blank() { return { n: 0, cam: {}, log: [], reports: {}, kicked: {} }; }
  function load() {
    try { var doc = JSON.parse(localStorage.getItem(KEY) || "{}"); return doc && typeof doc === "object" ? doc : {}; }
    catch (e) { return {}; }
  }
  function save(doc) { try { localStorage.setItem(KEY, JSON.stringify(doc)); } catch (e) {} }
  function row(doc, id) { if (!doc[id]) doc[id] = blank(); return doc[id]; }
  function setOccupancy(id, n) {
    if (!id) return false;
    var doc = load(), room = row(doc, id), was = room.n >= CAP;
    room.n = Math.max(0, Math.min(CAP, parseInt(n, 10) || 0));
    save(doc);
    return !was && room.n >= CAP;
  }
  function requestCamera(id, userId) {
    var doc = load(), room = row(doc, id), ids = Object.keys(room.cam);
    if (room.cam[userId]) return { ok: true, count: ids.length, cap: CAM };
    if (ids.length >= CAM) return { ok: false, full: true, count: CAM, cap: CAM };
    room.cam[userId] = 1;
    save(doc);
    return { ok: true, count: ids.length + 1, cap: CAM };
  }
  function noteReport(roomId, messageId, authorId, reporterId, body) {
    if (!roomId || !messageId || !authorId || !reporterId || authorId === reporterId) return { kicked: false, count: 0 };
    var doc = load(), room = row(doc, roomId);
    if (room.kicked[authorId]) return { kicked: true, count: KICK, already: true };
    if (!room.reports[messageId]) room.reports[messageId] = {};
    room.reports[messageId][reporterId] = 1;
    var count = Object.keys(room.reports[messageId]).length, kicked = count >= KICK, line = null;
    if (kicked) room.kicked[authorId] = messageId;
    room.log.forEach(function (item) { if (item && item.messageId === messageId) line = item; });
    if (!line) room.log.push({ messageId: messageId, authorId: authorId, body: String(body || "Comment").slice(0, 140), reports: count, kicked: kicked });
    else { line.reports = count; line.kicked = kicked; if (body) line.body = String(body).slice(0, 140); }
    save(doc);
    return { kicked: kicked, count: count, authorId: authorId, roomId: roomId };
  }
  function expand(cards) {
    var doc = load(), out = (cards || []).slice(), i = 0;
    while (i < out.length && i < 64) {
      var card = out[i], nextId = card.id + "-next", seen = false, j, next = {}, k;
      for (j = 0; j < out.length; j++) if (out[j].id === nextId) seen = true;
      if (doc[card.id] && doc[card.id].n >= CAP && !seen) {
        for (k in card) if (Object.prototype.hasOwnProperty.call(card, k)) next[k] = card[k];
        next.id = nextId;
        next.splitOf = card.id;
        next.sqlId = "";
        out.splice(i + 1, 0, next);
      }
      i += 1;
    }
    return out;
  }
  function extrasHtml(card, esc) {
    var room = load()[card.id] || blank(), n = room.n || 0, cam = Object.keys(room.cam || {}).length, html;
    html = '<p class="commune-card-meta" data-chatroom-cap>' + (n >= CAP ? "Full · " : "") + n + " / " + CAP + " participants</p>";
    html += '<p class="commune-card-meta" data-chatroom-topic>' + esc(card.topic || "") + "</p>";
    if (card.splitOf) html += '<p class="commune-card-meta" data-chatroom-new>New room · same topic</p>';
    html += '<p class="commune-card-meta" data-chatroom-plain>No presenter. No calendar event.</p>';
    html += '<div class="chatroom-log" data-chatroom-log><p class="commune-card-meta">Chat log</p>';
    if (!room.log.length) html += '<p class="commune-card-meta">No messages yet.</p>';
    room.log.forEach(function (line) {
      html += '<p class="chatroom-line"><span>' + esc(line.body) + '</span><button type="button" class="chatroom-report" data-chatroom-report data-message-id="' +
        esc(line.messageId) + '" data-author-id="' + esc(line.authorId) + '">Report</button>';
      html += line.kicked ? '<span data-chatroom-kick>' + line.reports + " reports · kicked from this room</span>" : (line.reports ? '<span>' + line.reports + " reports</span>" : "");
      html += "</p>";
    });
    html += '</div><button type="button" class="btn btn-secondary" data-chatroom-camera>Request to join on camera</button>';
    html += '<p class="commune-card-meta" data-chatroom-camera-count>' + cam + " / " + CAM + " camera requests</p>";
    return html;
  }
  document.addEventListener("click", function (ev) {
    var t = ev.target && ev.target.closest && (ev.target.closest("[data-chatroom-camera]") || ev.target.closest("[data-chatroom-report]"));
    if (!t) return;
    ev.preventDefault();
    ev.stopPropagation();
    var card = t.closest("[data-card-id]"), id = card && card.getAttribute("data-card-id"), label;
    if (t.hasAttribute("data-chatroom-camera")) {
      var shot = requestCamera(id, "viewer");
      label = card && card.querySelector("[data-chatroom-camera-count]");
      if (label) label.textContent = shot.count + " / " + CAM + " camera requests";
      return;
    }
    noteReport(id, t.getAttribute("data-message-id"), t.getAttribute("data-author-id"), "viewer", "");
    try { document.dispatchEvent(new CustomEvent("cognation:chatroom-rules")); } catch (e) {}
  });
  window.CognationChatroomRules = {
    CAP: CAP, CAM: CAM, KICK: KICK,
    setOccupancy: setOccupancy, requestCamera: requestCamera, noteReport: noteReport, expand: expand, extrasHtml: extrasHtml,
  };
})();
