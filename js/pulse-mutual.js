/**
 * PULSE introduces someone who shares a friend with you.
 * The words ride on that picture. Spots stay empty until real rows arrive.
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
      var mutual = String(row.mutual_name || "").trim();
      if (!name || !id || !mutual || seen[id]) return;
      seen[id] = true;
      out.push({ name: name, profileId: id, userId: id, mutualName: mutual });
    });
    return out;
  }

  function paint(rows) {
    var people = peopleFrom(rows);
    var fall = root.CognationCircleFall;
    if (fall && typeof fall.fillSpots === "function") fall.fillSpots(people);
    return people;
  }

  function reload() {
    var client = root.CognationSupabase;
    if (!client || typeof client.configured !== "function" || !client.configured() || typeof client.rpc !== "function") {
      return Promise.resolve(paint([]));
    }
    return client.rpc("pulse_mutual_introductions").then(function (rows) {
      return paint(Array.isArray(rows) ? rows : []);
    }, function () { return paint([]); });
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

  var api = { REFRESH_MS: REFRESH_MS, peopleFrom: peopleFrom, paint: paint, reload: reload, mount: mount, stop: stop };
  if (root) root.CognationPulseMutual = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null);
