/* Professional interest algorithms. Interest in a topic chatroom — licensure
   is the pattern — becomes that algorithm. Other professional pages' chatroom,
   podcasts, and the same kind of content then fill Echo. A card says
   "You listed …" only when that phrase is actually on the profile. */
(function () {
  "use strict";
  var KEY = "cognation.pro.algorithms.v1";
  var MEMBER = "cognation.member.profile.v1";
  var TOPICS = [{ id: "licensure", label: "Licensure", needles: ["licensure", "licensing", "licensed", "license"] }];

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; }
  }
  function blob(text) {
    return " " + String(text || "").toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim() + " ";
  }
  function phrases() {
    var raw = (read(MEMBER) || {}).interests;
    var list = Array.isArray(raw) ? raw : String(raw || "").split(/[,;]/);
    return list.map(function (s) { return String(s || "").trim(); }).filter(Boolean);
  }
  function topicBy(id) {
    for (var i = 0; i < TOPICS.length; i++) if (TOPICS[i].id === id) return TOPICS[i];
    return null;
  }
  function listed(topic) {
    var hit = "";
    phrases().forEach(function (phrase) {
      if (hit) return;
      var b = blob(phrase);
      topic.needles.forEach(function (n) { if (!hit && b.indexOf(" " + n + " ") !== -1) hit = phrase; });
    });
    return hit;
  }
  function learned() {
    var doc = read(KEY);
    return doc && typeof doc === "object" && !Array.isArray(doc) ? doc : {};
  }
  function on(topic) { return !!(listed(topic) || learned()[topic.id]); }
  function why(topic) {
    var hit = listed(topic);
    if (hit) return "You listed " + hit + ".";
    if (learned()[topic.id]) return "You showed interest in the " + topic.label + " chatroom.";
    return "";
  }
  function mentions(text, topic) {
    var b = blob(text);
    return topic.needles.some(function (n) { return b.indexOf(" " + n + " ") !== -1; });
  }
  function pieces(rec) {
    var out = [];
    function add(kind, item) {
      if (!item || typeof item !== "object") return;
      var k = item.kind === "podcast" || item.type === "podcast" ? "podcast" : kind;
      out.push({
        kind: k,
        id: String(item.id || k),
        title: String(item.title || "").trim(),
        body: String(item.body || item.text || "").trim(),
      });
    }
    (rec.podcasts || []).forEach(function (item) { add("podcast", item); });
    if (rec.podcast) add("podcast", rec.podcast);
    (rec.posts || []).forEach(function (item) { add("post", item); });
    (rec.content || []).forEach(function (item) { add("post", item); });
    return out;
  }
  function cards(profiles, selfIds) {
    var mine = {};
    (selfIds || []).forEach(function (id) { if (id) mine[String(id)] = true; });
    var out = [];
    TOPICS.forEach(function (topic) {
      if (!on(topic)) return;
      var line = why(topic);
      var pods = [];
      var rest = [];
      (profiles || []).forEach(function (rec) {
        if (!rec || rec.kind !== "professional" || mine[String(rec.id)]) return;
        var name = String(rec.displayName || rec.handle || "A professional").trim();
        pieces(rec).forEach(function (item) {
          if (!mentions(item.title + " " + item.body, topic)) return;
          var card = {
            id: "pro-interest-" + topic.id + "-" + item.kind + "-" + rec.id + "-" + item.id,
            type: item.kind === "podcast" ? "pro-podcast" : "pro-field",
            title: item.title || topic.label,
            body: name + (item.body ? ": " + item.body : ""),
            why: line,
            interest: topic.id,
            rating: "G",
            minAge: 0,
            keepOnly: true,
            profileId: rec.id,
          };
          (item.kind === "podcast" ? pods : rest).push(card);
        });
      });
      pods.forEach(function (c) { out.push(c); });
      out.push({
        id: "pro-interest-" + topic.id + "-room",
        type: "pro-" + topic.id,
        title: topic.label,
        body: topic.label + " chatroom.",
        why: line,
        interest: topic.id,
        rating: "G",
        minAge: 0,
        keepOnly: true,
      });
      rest.forEach(function (c) { out.push(c); });
    });
    return out;
  }

  window.CognationProInterest = {
    KEY: KEY,
    TOPICS: TOPICS,
    note: function (id) {
      if (!topicBy(String(id || ""))) return;
      var doc = learned();
      doc[id] = (doc[id] || 0) + 1;
      try { localStorage.setItem(KEY, JSON.stringify(doc)); } catch (e) {}
    },
    cards: cards,
    has: function (id) { var t = topicBy(id); return !!(t && on(t)); },
    whyFor: function (id) { var t = topicBy(id); return t ? why(t) : ""; },
  };
})();
