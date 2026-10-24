/**
 * Professional Tower page owner: book Classroom / Webinar sessions through Cognation.
 * Lives under Edit profile -> Classroom sessions (owner only, Professional pages only).
 * Saves to public.classroom_sessions via js/classroom-sessions.js. Go live / End session
 * use the Go live button under the picture.
 */
(function (root) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function todayIso(d) { d = d || new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  /** Pure (tested): the owner form + their upcoming sessions. */
  function ownerHtml(opts) {
    opts = opts || {};
    var A = root.CognationClassroomSessions;
    var canBook = !!opts.canBook;
    var rows = opts.rows || [];
    var lengths = (A && A.LENGTHS) || [30, 45, 60, 90, 120];
    var dis = canBook ? "" : " disabled";
    var html = '<form class="tower-sessions-form" data-sessions-form action="#" method="post">' +
      '<fieldset class="tower-sessions-kind"' + dis + '><legend>Session type</legend>' +
      '<label><input type="radio" name="kind" value="classroom" checked> Classroom</label>' +
      '<label><input type="radio" name="kind" value="webinar"> Webinar</label></fieldset>' +
      '<div class="form-group"><label for="tower-session-title">Title</label>' +
      '<input id="tower-session-title" name="title" type="text" maxlength="120" required' + dis + "></div>" +
      '<div class="tower-sessions-when">' +
      '<div class="form-group"><label for="tower-session-date">Date</label>' +
      '<input id="tower-session-date" name="date" type="date" required min="' + esc(todayIso(opts.today)) + '"' + dis + "></div>" +
      '<div class="form-group"><label for="tower-session-time">Time</label>' +
      '<input id="tower-session-time" name="time" type="time" required' + dis + "></div>" +
      '<div class="form-group"><label for="tower-session-length">Length</label>' +
      '<select id="tower-session-length" name="minutes"' + dis + ">" +
      lengths.map(function (m) { return '<option value="' + m + '"' + (m === 60 ? " selected" : "") + ">" + m + " min</option>"; }).join("") +
      "</select></div></div>" +
      '<div class="form-actions"><button type="submit" class="btn btn-primary" data-sessions-book' + dis + ">Book session</button></div>" +
      '<p class="commune-status" data-sessions-status role="status" aria-live="polite"' + (opts.status ? "" : " hidden") + ">" + esc(opts.status || "") + "</p>" +
      (canBook ? "" : '<p class="form-hint">Sign in to your Professional page to book sessions.</p>') +
      "</form>";
    html += '<h5 class="tower-sessions-list-title">Your upcoming sessions</h5>';
    if (!rows.length) {
      html += '<p class="form-hint tower-cal-empty" data-sessions-empty>No sessions booked yet.</p>';
    } else {
      html += '<ul class="tower-sessions-list" role="list">' + rows.map(function (s) {
        var live = A && A.isLiveNow(s);
        var when = new Date(s.startsAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
          " · " + (A ? A.timeLabel(s.startsAt) + " · " + A.minutesOf(s) + " min" : "");
        return '<li class="tower-sessions-item' + (live ? " is-live" : "") + '" data-own-session="' + esc(s.id) + '">' +
          '<span class="cgn-cal-tag cgn-cal-tag--' + s.kind + '">' + (s.kind === "webinar" ? "Webinar" : "Classroom") + "</span>" +
          (live ? '<span class="cgn-live-pill"><i class="cgn-live-dot" aria-hidden="true"></i>LIVE</span>' : "") +
          '<span class="tower-sessions-item-title">' + esc(s.title) + "</span>" +
          '<span class="tower-sessions-item-time">' + esc(when) + "</span>" +
          (live
            ? '<button type="button" class="btn btn-secondary" data-own-session-end="' + esc(s.id) + '">End session</button>'
            : '<button type="button" class="btn btn-secondary" data-own-session-cancel="' + esc(s.id) + '">Cancel</button>') +
          "</li>";
      }).join("") + "</ul>";
    }
    html += '<p class="form-hint">Press Go live under your picture when it\'s time (up to 30 minutes early). Live video is not on yet; people join the silent room with camera and mic off.</p>';
    html += '<a class="tower-visitor-cal-link" href="/calendar.html">Cognation Calendar ›</a>';
    return html;
  }

  var lastStatus = "";

  function paint() {
    var doc = root.document;
    var A = root.CognationClassroomSessions;
    if (!doc || !A) return;
    var details = doc.querySelector("[data-tower-edit-sessions]");
    var host = doc.querySelector("[data-tower-sessions-owner]");
    if (!details || !host) return;
    var app = doc.querySelector("[data-tower-app]");
    var owner = !!(app && app.getAttribute("data-tower-is-owner") === "true");
    var p = A.viewedProfile();
    var pro = !!(p && p.kind === "professional");
    details.hidden = !(owner && pro);
    if (details.hidden) { host.innerHTML = ""; return; }
    var form = host.querySelector("[data-sessions-form]");
    if (form && form.contains(doc.activeElement)) return; /* don't wipe what the owner is typing */
    host.innerHTML = ownerHtml({ canBook: A.canSchedule(A.viewerContext(), p), rows: A.own(), status: lastStatus });
  }

  function setStatus(text) {
    lastStatus = text || "";
    var el = root.document && root.document.querySelector("[data-sessions-status]");
    if (el) { el.hidden = !text; el.textContent = text || ""; }
  }

  function bind() {
    var doc = root.document;
    if (!doc) return;
    doc.addEventListener("submit", function (ev) {
      var form = ev.target && ev.target.closest && ev.target.closest("[data-sessions-form]");
      if (!form) return;
      ev.preventDefault();
      var A = root.CognationClassroomSessions;
      var p = A && A.viewedProfile();
      if (!A || !p) return;
      var kindInput = form.querySelector('input[name="kind"]:checked');
      var input = {
        kind: kindInput ? kindInput.value : "",
        title: (form.querySelector('[name="title"]') || {}).value,
        date: (form.querySelector('[name="date"]') || {}).value,
        time: (form.querySelector('[name="time"]') || {}).value,
        minutes: (form.querySelector('[name="minutes"]') || {}).value,
      };
      setStatus("Booking…");
      A.book(p, input).then(function () {
        if (doc.activeElement && doc.activeElement.blur) doc.activeElement.blur();
        setStatus("Booked. It's on the Cognation Calendar.");
        paint();
      }, function (err) { setStatus((err && err.message) || "Could not book that session."); });
    });
    doc.addEventListener("click", function (ev) {
      var t = ev.target && ev.target.closest && ev.target.closest("[data-own-session-end], [data-own-session-cancel]");
      if (!t) return;
      ev.preventDefault();
      var A = root.CognationClassroomSessions;
      var p = A && A.viewedProfile();
      var id = t.getAttribute("data-own-session-end") || t.getAttribute("data-own-session-cancel");
      var s = A && A.own().filter(function (r) { return r.id === id; })[0];
      if (!A || !p || !s) return;
      A.setStatus(p, s, "ended").then(function () {
        setStatus(t.hasAttribute("data-own-session-end") ? "Session ended. It has left ECHO." : "Session canceled.");
        A.syncGoLiveButtons();
        paint();
      }, function (err) { setStatus(err.message); });
    });
    ["cognation:classroom-sessions-updated", "cognation:tower-profile-updated", "cognation:tower-view-changed"].forEach(function (name) {
      doc.addEventListener(name, paint);
    });
    paint();
  }

  root.CognationTowerClassroomSessions = { ownerHtml: ownerHtml, paint: paint };
  if (root.document && !root.__COGNATION_CLASSROOM_NO_BOOT__) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", bind);
    else bind();
  }
  if (typeof module !== "undefined" && module.exports) module.exports = root.CognationTowerClassroomSessions;
})(typeof window !== "undefined" ? window : this);
