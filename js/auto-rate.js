/**
 * Tower auto-rate (RATING-RULES-DRAFT.md sections 1-6).
 * The database trigger in supabase/migrations/20261015_tower_auto_rate.sql is the
 * authority (posters cannot set or change a rating). This browser copy mirrors it
 * for demo/offline posts and labels; js/tower-auto-rate.test.js keeps the term
 * lists identical. No dwell time or engagement signals are used anywhere.
 */
(function (root) {
  "use strict";

  var LEVELS = ["G", "PG", "PG-13", "R", "MA"];
  var LISTS = {
    harmful: ["i will kill you", "im going to kill you", "i'm going to kill you", "going to shoot up", "shoot up the school", "bomb the school", "kill yourself", "kys", "how to make a bomb", "how to build a bomb", "pipe bomb instructions", "how to make a gun", "ghost gun instructions", "how to kill myself", "ways to kill myself", "how to cut myself", "child porn", "cp links", "underage nudes", "their home address is", "here is his address", "here is her address", "doxx", "doxxed", "doxxing"],
    ma: ["porn", "porno", "nudes", "nude pics", "explicit sex", "xxx", "onlyfans", "hardcore sex", "gore video", "beheading video"],
    war: ["war footage", "combat footage", "airstrike video", "drone strike video", "war propaganda", "propaganda video", "psyop", "psy-op", "psyops", "psy-ops", "psychological operation", "enemy propaganda"],
    r: ["sex", "sexy", "horny", "hookup", "cocaine", "heroin", "meth", "molly", "get high", "getting high", "stoned", "weed", "blunt", "wasted", "drunk", "shots shots", "gore", "graphic violence", "massacre", "beheading", "tortured"],
    strong: ["fuck", "fucking", "fucked", "motherfucker", "shit", "shitty", "bitch", "asshole", "bastard", "dick", "cunt"],
    weapon: ["gun", "guns", "rifle", "rifles", "pistol", "pistols", "handgun", "shotgun", "ammo", "ammunition", "firearm", "firearms", "ar-15", "ak-47", "knife", "knives", "machete", "switchblade", "glock", "bullets"],
    pg13: ["murder", "murdered", "shooting", "stabbed", "stabbing", "killed", "assault", "assaulted", "arrested", "crime", "robbery", "violence", "violent", "blood", "bloody", "kiss", "making out", "war"],
    pg: ["damn", "hell", "crap", "sucks", "scary", "fight", "fighting", "punch", "stupid", "idiot", "freaking", "dang"],
    self_harm: ["suicide", "suicidal", "self harm", "self-harm", "cutting myself", "kill myself", "want to die", "end it all", "overdose"],
    sexual: ["sex", "sexy", "horny", "nudes", "nude", "porn", "porno", "onlyfans", "hookup", "explicit sex"],
    graphic: ["gore", "graphic violence", "beheading", "massacre", "tortured", "blood everywhere", "dismembered"]
  };

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function hits(text, list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (new RegExp("(^|[^a-z0-9])" + escapeRe(list[i]) + "($|[^a-z0-9])").test(text)) out.push(list[i]);
    }
    return out;
  }
  function countStrong(text) {
    var n = 0;
    for (var i = 0; i < LISTS.strong.length; i++) {
      var m = text.match(new RegExp("(^|[^a-z0-9])" + escapeRe(LISTS.strong[i]) + "(?=$|[^a-z0-9])", "g"));
      if (m) n += m.length;
    }
    return n;
  }
  function atLeast(cur, min) {
    return LEVELS.indexOf(min) > LEVELS.indexOf(cur) ? min : cur;
  }
  /* Stricter of two ratings (NR, not rateable, beats everything). */
  function stricter(a, b) {
    if (a === "NR" || b === "NR") return "NR";
    return LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b;
  }

  function rate(body, attachments) {
    var text = String(body || "").toLowerCase().replace(/[’`]/g, "'");
    var rating = "G";
    var confidence = "high";
    var reasons = [];
    var sensitive = false;
    if (hits(text, LISTS.harmful).length) {
      return { rating: "NR", confidence: "high", reasons: ["harmful"], harmful: true, review: true };
    }
    if (hits(text, LISTS.ma).length) { rating = atLeast(rating, "MA"); reasons.push("explicit"); }
    if (hits(text, LISTS.war).length) { rating = atLeast(rating, "R"); reasons.push("war"); sensitive = true; }
    if (hits(text, LISTS.r).length) { rating = atLeast(rating, "R"); reasons.push("adult"); }
    var strong = countStrong(text);
    if (strong >= 3) { rating = atLeast(rating, "R"); reasons.push("strong-language"); }
    else if (strong >= 1) { rating = atLeast(rating, "PG-13"); reasons.push("strong-language"); }
    if (hits(text, LISTS.weapon).length) { rating = atLeast(rating, "PG-13"); reasons.push("weapons"); }
    if (hits(text, LISTS.pg13).length) { rating = atLeast(rating, "PG-13"); reasons.push("mature-topic"); }
    if (hits(text, LISTS.pg).length) { rating = atLeast(rating, "PG"); reasons.push("mild"); }
    if (hits(text, LISTS.self_harm).length) { rating = atLeast(rating, "PG-13"); reasons.push("self-harm"); sensitive = true; }
    if (hits(text, LISTS.sexual).length) { reasons.push("sexual"); sensitive = true; }
    if (hits(text, LISTS.graphic).length) { reasons.push("graphic-violence"); sensitive = true; }
    /* Masked words (f*ck, sh!t): unsure, so one level stricter and low confidence. */
    if (/[a-z][*@#$!][a-z*]/.test(text)) {
      rating = atLeast(rating, LEVELS[Math.min(LEVELS.indexOf(atLeast(rating, "PG")) + 1, 4)]);
      confidence = "low";
      reasons.push("masked-words");
    }
    /* Attachments cannot be read by the text rater: unsure, so stricter. */
    if (Array.isArray(attachments) && attachments.length) {
      rating = atLeast(rating, "PG-13");
      confidence = "low";
      reasons.push("attachment-unread");
    }
    var review = confidence === "low" || rating === "R" || rating === "MA" || sensitive;
    return { rating: rating, confidence: confidence, reasons: reasons, harmful: false, review: review };
  }

  /* Who sees what. Unknown age counts as 13 (when in doubt, younger). */
  function canSee(rating, viewer) {
    viewer = viewer || {};
    var age = typeof viewer.age === "number" && isFinite(viewer.age) ? viewer.age : 13;
    if (rating === "NR") return false;
    if (rating === "R") return age >= 18;
    if (rating === "MA") return age >= 21 && viewer.matureOptIn === true;
    /* Under-13 backstop (section 2): G and PG only. */
    if (rating === "G" || rating === "PG") return true;
    if (rating === "PG-13") return age >= 13;
    return false;
  }

  var api = { LEVELS: LEVELS, LISTS: LISTS, rate: rate, canSee: canSee, stricter: stricter };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CognationAutoRate = api;
})(typeof window !== "undefined" ? window : null);
