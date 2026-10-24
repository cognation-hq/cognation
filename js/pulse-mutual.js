/**
 * PULSE: friends doing one thing together.
 * The shared activity sits on the front picture. Spots stay empty until real rows arrive.
 * Run: node js/pulse-mutual.test.js
 */
(function (root) {
  "use strict";

  var REFRESH_MS = 15 * 60 * 1000;
  var timer = 0;

  function peopleFrom(rows) {
    var out = [];
    var seen = {};
    (rows || []).forEach(function (row) {
      if (!row || out.length >= 5) return;
      var name = String(row.display_name || "").trim();
      var id = String(row.profile_id || "");
      var activity = String(row.activity || "").trim();
      if (!name || !id || !activity || seen[id]) return;
      seen[id] = true;
      var person = { name: name, profileId: id, userId: id, activity: activity };
      var handle = String(row.handle || "").trim().replace(/^@/, "");
      var photo = String(row.photo_url || "").trim();
      if (handle) person.handle = handle;
      if (photo) person.photoUrl = photo;
      out.push(person);
    });
    return out;
  }

  function readStore(store, key) {
    try {
      var raw = store && store.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function rowFrom(rec, activity, at) {
    var name = String((rec && (rec.displayName || rec.display_name || rec.sharerName)) || "").trim();
    var id = String((rec && (rec.id || rec.swiperId)) || "");
    if (!name || !id) return null;
    return {
      display_name: name, profile_id: id, handle: rec.handle || "",
      photo_url: rec.photoUrl || rec.photo_url || "", activity: activity,
      acted_at: at ? new Date(at).toISOString() : ""
    };
  }

  /* A date-only calendar day (YYYY-MM-DD) starts at local midnight, like goingLive local times. */
  function localDay(value) {
    var s = String(value || "");
    var t = Date.parse(s);
    if (isNaN(t)) return 0;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : t;
  }

  /* Shares, event posts, and attendance already stored on this device. */
  function localRows(store) {
    store = store || (root && root.localStorage);
    var doc = readStore(store, "cognation.profiles.v1");
    var map = doc && doc.profiles ? doc.profiles : {};
    var best = null;
    function keep(at, rows) {
      var people = (rows || []).filter(Boolean);
      if (people.length < 2) return;
      if (!best || at > best.at) best = { at: at, rows: people.slice(0, 5) };
    }
    var byShare = {};
    var shares = readStore(store, "cognation.commune.friend-shares.v1") || [];
    if (!Array.isArray(shares)) shares = [];
    shares.forEach(function (s) {
      if (!s || !s.adId || !s.swiperId || (byShare[s.adId] && byShare[s.adId].seen[s.swiperId])) return;
      var g = byShare[s.adId] || (byShare[s.adId] = { at: 0, seen: {}, rows: [] });
      g.seen[s.swiperId] = true;
      if ((s.at || 0) > g.at) g.at = s.at || 0;
      var rec = map[s.swiperId] || { id: s.swiperId, displayName: s.sharerName, handle: "" };
      g.rows.push(rowFrom(rec, "They shared the same content.", s.at || 0));
    });
    Object.keys(byShare).forEach(function (k) { keep(byShare[k].at, byShare[k].rows); });
    var byLive = {};
    Object.keys(map).forEach(function (id) {
      var rec = map[id];
      var what = rec && rec.goingLive && String(rec.goingLive.what || "").trim();
      if (!what) return;
      var g = byLive[what] || (byLive[what] = { at: 0, rows: [] });
      var when = Date.parse(rec.goingLive.when || "") || 0;
      if (when > g.at) g.at = when;
      g.rows.push(rowFrom(rec, "They posted about the same event.", when));
    });
    Object.keys(byLive).forEach(function (k) { keep(byLive[k].at, byLive[k].rows); });
    Object.keys(map).forEach(function (id) {
      ((map[id] && map[id].calendarEvents) || []).forEach(function (ev) {
        var ids = ev && ev.signupFriendIds;
        if (!ids || ids.length < 2) return;
        var at = localDay(ev.date);
        keep(at, ids.map(function (fid) {
          return map[fid] ? rowFrom(map[fid], "They are going to the same event.", at) : null;
        }));
      });
    });
    return best ? best.rows : [];
  }

  function paint(rows) {
    var people = peopleFrom(rows);
    var fall = root.CognationCircleFall;
    if (fall && typeof fall.fillSpots === "function") fall.fillSpots(people);
    return people;
  }

  function reload() {
    var local = localRows();
    var client = root.CognationSupabase;
    if (!client || typeof client.configured !== "function" || !client.configured() || typeof client.rpc !== "function") {
      return Promise.resolve(paint(local));
    }
    return client.rpc("pulse_mutual_introductions").then(function (rows) {
      rows = Array.isArray(rows) ? rows : [];
      function at(list) { var best = 0; (list || []).forEach(function (row) { var t = Date.parse(row && row.acted_at); if (!isNaN(t) && t > best) best = t; }); return best; }
      return paint(local.length && at(local) >= at(rows) ? local : (rows.length ? rows : local));
    }, function () { return paint(local); });
  }

  function mount() {
    if (timer) root.clearInterval(timer);
    timer = root.setInterval(reload, REFRESH_MS);
    var layer = root.document && root.document.querySelector("[data-circle-fall]");
    if (layer) layer.setAttribute("data-circle-refresh-ms", String(REFRESH_MS));
    return reload();
  }

  function stop() {
    if (timer) root.clearInterval(timer);
    timer = 0;
  }

  var api = { REFRESH_MS: REFRESH_MS, peopleFrom: peopleFrom, localRows: localRows, paint: paint, reload: reload, mount: mount, stop: stop };
  if (root) root.CognationPulseMutual = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null);
