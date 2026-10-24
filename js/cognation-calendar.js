/**
 * The public Cognation Calendar (calendar.html): every Classroom and Webinar session
 * booked from a Professional page, open to everyone. Agenda list, not a grid.
 * Reads only public.classroom_sessions (scheduled + live). Personal calendar events
 * never appear here. No sessions, no table, or no sign-in config: a quiet empty state.
 */
(function (root) {
  "use strict";

  var FILTERS = [
    { id: "all", label: "All" },
    { id: "classroom", label: "Classroom" },
    { id: "webinar", label: "Webinar" },
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function api() { return root.CognationClassroomSessions; }

  function avatarHtml(host) {
    if (host && host.photoUrl) {
      return '<img class="cgn-cal-avatar" src="' + esc(host.photoUrl) + '" alt="" width="36" height="36" loading="lazy">';
    }
    var name = (host && (host.displayName || host.handle)) || "?";
    return '<span class="cgn-cal-avatar cgn-cal-avatar--blank" aria-hidden="true">' + esc(name.charAt(0).toUpperCase()) + "</span>";
  }

  function rowHtml(s, at) {
    var A = api();
    var live = A.isLiveNow(s, at);
    var host = s.host || {};
    var name = host.displayName || host.handle || "Host";
    var tag = '<span class="cgn-cal-tag cgn-cal-tag--' + s.kind + '">' + (s.kind === "webinar" ? "Webinar" : "Classroom") + "</span>";
    var pill = live ? '<span class="cgn-live-pill"><i class="cgn-live-dot" aria-hidden="true"></i>LIVE</span>' : "";
    var badge = "";
    if (host.accountKind && host.accountKind !== "real" && root.CognationSeedOpsBadge && root.CognationSeedOpsBadge.badgeHtml) {
      try { badge = root.CognationSeedOpsBadge.badgeHtml({ accountKind: host.accountKind, displayName: name }) || ""; } catch (e) {}
    }
    var hostLink = host.handle
      ? '<a class="cgn-cal-host" href="/#tower-profile-' + esc(host.handle) + '" data-cal-host>' + avatarHtml(host) +
        '<span class="cgn-cal-host-text"><span class="cgn-cal-host-name">' + esc(name) + "</span>" +
        '<span class="cgn-cal-host-cta">View Tower ›</span></span></a>'
      : '<span class="cgn-cal-host">' + avatarHtml(host) + '<span class="cgn-cal-host-name">' + esc(name) + "</span></span>";
    var join = live
      ? '<a class="cgn-cal-join" href="/#classroom-' + esc(s.id) + '" data-cal-join>Join</a>'
      : "";
    return '<li class="cgn-cal-row' + (live ? " is-live" : "") + '" data-cal-row data-session-id="' + esc(s.id) + '" data-session-kind="' + s.kind + '">' +
      '<div class="cgn-cal-when"><span class="cgn-cal-time">' + esc(A.timeLabel(s.startsAt)) + "</span>" +
      '<span class="cgn-cal-len">' + A.minutesOf(s) + " min</span></div>" +
      '<div class="cgn-cal-what"><div class="cgn-cal-tags">' + tag + pill + badge + "</div>" +
      '<h3 class="cgn-cal-title">' + esc(s.title) + "</h3></div>" +
      hostLink +
      '<div class="cgn-cal-action">' + join + "</div>" +
      "</li>";
  }

  /** Pure render (tested): agenda sections, or the empty state. */
  function renderAgendaHtml(rows, opts) {
    opts = opts || {};
    var A = api();
    var at = opts.now == null ? Date.now() : opts.now;
    if (!rows || !rows.length) {
      var which = opts.filter === "classroom" ? "classrooms" : opts.filter === "webinar" ? "webinars" : "sessions";
      return '<div class="cgn-cal-empty" data-cal-empty><p class="cgn-cal-empty-title">No ' + which + " booked yet.</p>" +
        '<p class="cgn-cal-empty-sub">When a Professional page books a Classroom or Webinar, it shows here for everyone.</p></div>';
    }
    return A.groupByDay(rows, at).map(function (g) {
      return '<section class="cgn-cal-day" data-cal-day="' + esc(g.key) + '">' +
        '<header class="cgn-cal-day-head"><span class="cgn-cal-day-label' + (g.label === "Today" ? " is-today" : "") + '">' + esc(g.label) + "</span>" +
        '<span class="cgn-cal-day-date">' + esc(g.date) + "</span></header>" +
        '<ul class="cgn-cal-rows">' + g.rows.map(function (s) { return rowHtml(s, at); }).join("") + "</ul></section>";
    }).join("");
  }

  function filtersHtml(active) {
    return FILTERS.map(function (f) {
      return '<button type="button" class="cgn-cal-chip' + (f.id === active ? " is-active" : "") + '" data-cal-filter="' + f.id +
        '" aria-pressed="' + (f.id === active ? "true" : "false") + '">' + f.label + "</button>";
    }).join("");
  }

  function mount(host) {
    var A = api();
    if (!host || !A) return;
    var filter = "all";
    var chips = host.querySelector("[data-cal-filters]");
    var list = host.querySelector("[data-cal-list]");
    var zone = host.querySelector("[data-cal-zone]");
    function paint() {
      if (chips) chips.innerHTML = filtersHtml(filter);
      if (zone) {
        var z = A.zoneLabel();
        zone.textContent = "Times shown in your time zone" + (z ? " (" + z + ")" : "");
      }
      var rows = A.agenda(filter);
      var extra = root.CognationClassroomEvent;
      if (extra && filter !== "webinar" && extra.agendaRows) {
        try { rows = extra.agendaRows().concat(rows); } catch (eRows) {}
      }
      if (list) list.innerHTML = renderAgendaHtml(rows, { filter: filter });
    }
    if (chips) chips.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest && ev.target.closest("[data-cal-filter]");
      if (!b) return;
      filter = b.getAttribute("data-cal-filter") || "all";
      paint();
    });
    root.document.addEventListener("cognation:classroom-sessions-updated", paint);
    root.document.addEventListener("cognation:classroom-event", paint);
    paint();
  }

  var exported = { renderAgendaHtml: renderAgendaHtml, filtersHtml: filtersHtml, mount: mount, FILTERS: FILTERS };
  root.CognationCalendarPage = exported;
  if (root.document && !root.__COGNATION_CLASSROOM_NO_BOOT__) {
    var boot = function () { mount(root.document.querySelector("[data-cognation-calendar]")); };
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
})(typeof window !== "undefined" ? window : this);
