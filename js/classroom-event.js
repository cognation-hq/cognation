/* Tower Add event → Classroom pill. Cognation calendar + Echo card.
   Life-skills group: 1000 can join, chat log, 20 video requests, one presenter.
   Record saves on Cognation YouTube for training. No YouTube upload. */
(function (root) {
  "use strict";
  var KEY = "cognation.classroom.event.v1";
  var JOIN_MAX = 1000;
  var VIDEO_MAX = 20;

  function store() { try { return root.localStorage; } catch (e) { return null; } }
  function read() {
    try {
      var list = JSON.parse((store() && store().getItem(KEY)) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function write(list) {
    try { if (store()) store().setItem(KEY, JSON.stringify(list)); } catch (e) {}
    try { root.document.dispatchEvent(new root.CustomEvent("cognation:classroom-event")); } catch (e2) {}
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function bare(id) { return String(id || "").replace(/^class-event-/, ""); }
  function find(id) {
    var hit = null;
    read().forEach(function (row) { if (row && row.id === bare(id)) hit = row; });
    return hit;
  }
  function publish(fields) {
    fields = fields || {};
    var title = String(fields.title || "").trim().slice(0, 120);
    var date = String(fields.date || "");
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    var time = /^\d{2}:\d{2}/.test(fields.time || "") ? String(fields.time).slice(0, 5) : "12:00";
    var prev = find(fields.id);
    var starts = Date.parse(date + "T" + time + ":00");
    if (isNaN(starts)) starts = Date.now();
    var ev = {
      id: (prev && prev.id) || String(fields.id || ("ce-" + Date.now().toString(36))),
      title: title, date: date, time: time, notes: String(fields.notes || "").slice(0, 240),
      kind: "classroom", startsAt: starts, endsAt: starts + 3600000,
      joinMax: JOIN_MAX, videoMax: VIDEO_MAX,
      joined: (prev && prev.joined) || 1,
      videoRequests: (prev && prev.videoRequests) || 0,
      recording: (prev && prev.recording) || null,
      chat: (prev && prev.chat) || [
        { who: "Cognation", text: "Life-skills and psychoeducational group. The chat log is open." },
        { who: "Member", text: "Here for the lesson." }
      ]
    };
    write(read().filter(function (row) { return row.id !== ev.id; }).concat(ev));
    return ev;
  }
  function drop(id) { write(read().filter(function (row) { return row.id !== bare(id); })); }
  function mutate(id, fn) {
    var list = read();
    var ev = null;
    list.forEach(function (row) { if (row.id === bare(id)) ev = row; });
    if (!ev) return null;
    fn(ev);
    write(list);
    return ev;
  }
  function pillHtml(on) {
    return '<label class="tower-cal-pill"><input type="checkbox" data-tower-cal-classroom' +
      (on ? " checked" : "") + "> Classroom</label>";
  }
  function echoCards() {
    return read().map(function (ev) {
      return {
        id: "class-event-" + ev.id, eventId: ev.id, type: "classroom", classroomEvent: true, live: false,
        title: ev.title, host: "Cognation",
        body: "Life-skills and psychoeducational group. Up to 1,000 can join. Up to 20 can request video."
      };
    });
  }
  function agendaRows() {
    return read().map(function (ev) {
      return {
        id: ev.id, title: ev.title, kind: "classroom", startsAt: ev.startsAt, endsAt: ev.endsAt, status: "scheduled",
        host: { displayName: "Cognation", kind: "professional", accountKind: "real" }
      };
    });
  }
  function youtubeHtml() {
    var items = read().filter(function (ev) { return ev.recording; });
    var body = items.map(function (ev) {
      return '<article class="ce-saved"><p class="ce-kicker">For training</p><h5>' + esc(ev.recording.title || ev.title) +
        "</h5><p>Life-skills and psychoeducational group</p></article>";
    }).join("") || '<p class="ce-note">No saved classroom recordings yet.</p>';
    return '<section class="ce-yt" data-cognation-youtube><h5>Cognation YouTube</h5>' + body + "</section>";
  }
  function stageHtml(id) {
    var ev = find(id);
    if (!ev) return "";
    var n = ev.videoRequests || 0;
    var chat = (ev.chat || []).map(function (line) {
      return '<p class="ce-line"><b>' + esc(line.who) + "</b> " + esc(line.text) + "</p>";
    }).join("");
    var saved = ev.recording
      ? '<article class="ce-saved" data-classroom-recording><p class="ce-kicker">Saved recording</p><h5>' + esc(ev.recording.title) +
        '</h5><p class="ce-train">For training</p><p class="ce-note">Saved on Cognation YouTube. Not sent to YouTube.</p></article>'
      : '<button type="button" class="btn btn-primary" data-classroom-record>Record</button>';
    var video = n >= VIDEO_MAX ? "Video is full (" + VIDEO_MAX + ")." : (n ? "Request sent. " + n + " of " + VIDEO_MAX + " video spots." : "");
    return '<div class="ce-stage" data-classroom-event-stage data-event-id="' + esc(ev.id) + '">' +
      '<div class="ce-presenter" data-classroom-presenter><span>Cognation</span><small>Presenter · on camera</small></div>' +
      '<p class="ce-limits">Up to 1,000 can join · ' + (ev.joined || 1) + " here. Up to 20 can request video · " + n + " requested.</p>" +
      '<div class="ce-log" role="log" data-classroom-event-log>' + chat + "</div>" +
      '<button type="button" class="btn btn-secondary" data-classroom-video-request>Request to join on video</button>' +
      (video ? '<p class="ce-status" role="status">' + esc(video) + "</p>" : "") + saved + youtubeHtml() + "</div>";
  }
  function mountYoutube() {
    var doc = root.document;
    var sticker = doc && doc.querySelector('[data-tower-widget="youtube"]');
    if (!sticker) return;
    var shelf = sticker.querySelector(":scope > .cognation-youtube");
    if (!read().some(function (ev) { return ev.recording; })) { if (shelf) shelf.remove(); return; }
    if (!shelf) { shelf = doc.createElement("div"); shelf.className = "cognation-youtube"; sticker.appendChild(shelf); }
    shelf.innerHTML = youtubeHtml();
  }
  function boot() {
    var doc = root.document;
    if (!doc || doc.__ceBoot) return;
    doc.__ceBoot = true;
    doc.addEventListener("click", function (ev) {
      var t = ev.target && ev.target.closest && ev.target.closest("[data-classroom-record], [data-classroom-video-request]");
      if (!t) return;
      var stage = t.closest("[data-classroom-event-stage]");
      var id = stage && stage.getAttribute("data-event-id");
      if (!id) return;
      ev.preventDefault();
      var next = t.hasAttribute("data-classroom-record")
        ? mutate(id, function (row) { row.recording = { title: row.title, at: Date.now(), training: true, place: "Cognation YouTube" }; })
        : mutate(id, function (row) { if ((row.videoRequests || 0) < VIDEO_MAX) row.videoRequests += 1; });
      if (next && stage) stage.outerHTML = stageHtml(id);
      mountYoutube();
    });
    mountYoutube();
  }
  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
  root.CognationClassroomEvent = {
    JOIN_MAX: JOIN_MAX, VIDEO_MAX: VIDEO_MAX, pillHtml: pillHtml, publish: publish, drop: drop,
    list: read, echoCards: echoCards, agendaRows: agendaRows, stageHtml: stageHtml
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.CognationClassroomEvent;
})(typeof window !== "undefined" ? window : globalThis);
