/**
 * SeedOps — tiny structured log sink (sessionStorage ring + console.debug).
 * Shared by news logging and friction instrumentation.
 */
(function () {
  "use strict";

  var KEY = "cognation.seedops.log.v1";
  var MAX = 200;

  function read() {
    try {
      var raw = sessionStorage.getItem(KEY);
      var doc = raw ? JSON.parse(raw) : null;
      if (!doc || !Array.isArray(doc.events)) return { version: 1, events: [] };
      return doc;
    } catch (e) {
      return { version: 1, events: [] };
    }
  }

  function write(channel, payload) {
    var doc = read();
    var row = {
      channel: String(channel || "seedops"),
      at: new Date().toISOString(),
      payload: payload || {},
    };
    doc.events.push(row);
    if (doc.events.length > MAX) doc.events = doc.events.slice(doc.events.length - MAX);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(doc));
    } catch (e) {}
    try {
      if (typeof console !== "undefined" && console.debug) {
        console.debug("[seedops:" + row.channel + "]", row.payload);
      }
    } catch (e2) {}
    try {
      document.dispatchEvent(new CustomEvent("cognation:seedops-log", { detail: row }));
    } catch (e3) {}
    return row;
  }

  function list(channel) {
    var events = read().events;
    if (!channel) return events.slice();
    return events.filter(function (e) {
      return e.channel === channel;
    });
  }

  function clear() {
    try {
      sessionStorage.removeItem(KEY);
    } catch (e) {}
  }

  window.CognationSeedOpsLog = {
    KEY: KEY,
    write: write,
    list: list,
    clear: clear,
    read: read,
  };
})();
