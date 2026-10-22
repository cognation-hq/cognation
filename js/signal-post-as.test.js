/**
 * SIGNAL Feed "Send a signal" PERSONAL | PROFESSIONAL post-as switch, the Feed
 * card byline (page name, picture, link) and the Send a signal failure box (no success notice).
 * Owner-only: the browser only ever sends one of the member's own profile ids,
 * and the server insert policy checks profiles.user_id = auth.uid().
 */
"use strict";
var test = require("node:test");
var assert = require("node:assert");
var fs = require("fs");
var path = require("path");

var postAs = require("./signal-post-as.js");
var root = path.join(__dirname, "..");
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var social = fs.readFileSync(path.join(__dirname, "supabase-social.js"), "utf8");
var flat = css.replace(/\s+/g, " ");

var ME = "11111111-0000-4000-8000-000000000001";
var OTHER = "22222222-0000-4000-8000-000000000002";
var PER = { id: "per-1", user_id: ME, kind: "personal", handle: "riley" };
var PRO = { id: "pro-1", user_id: ME, kind: "professional", handle: "riley-studio" };
var FOREIGN_PRO = { id: "pro-9", user_id: OTHER, kind: "professional", handle: "jordan-co" };

function memStore() {
  var m = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
  };
}

test("switch shows only when the member owns a Professional page (seeds included)", function () {
  assert.strictEqual(postAs.hasProfessional([PER, PRO], ME), true);
  assert.strictEqual(postAs.hasProfessional([PER], ME), false);
  var seedPer = { id: "seed-1", user_id: ME, kind: "personal", account_kind: "seed" };
  assert.strictEqual(postAs.hasProfessional([seedPer], ME), false, "seed without Pro: hidden");
  assert.strictEqual(postAs.hasProfessional([PER, FOREIGN_PRO], ME), false, "someone else's Pro never counts");
  assert.strictEqual(postAs.hasProfessional([PER, PRO], ""), false, "signed out: hidden");
});

test("default is Personal; markup starts hidden with Personal checked", function () {
  assert.strictEqual(postAs.readChoice(memStore(), ME), "personal");
  var m = html.match(/<div class="signal-post-as" data-signal-post-as role="radiogroup" aria-label="Post as" hidden>([\s\S]*?)<\/div>/);
  assert.ok(m, "switch markup, hidden until a Pro page loads");
  assert.ok(/data-signal-post-as-btn="personal"[^>]*>Personal</.test(m[0]) || /aria-checked="true" data-signal-post-as-btn="personal">Personal</.test(m[0]));
  assert.ok(/aria-checked="false"[^>]*data-signal-post-as-btn="professional">Professional</.test(m[0]));
  assert.ok(/<span class="signal-post-as-sep" aria-hidden="true">\|<\/span>/.test(m[0]), "pipe between the sides");
});

test("switch sits on the 'Send a signal' line", function () {
  var head = html.match(/<div class="signal-compose-head" data-signal-compose-head>\s*<h4 class="tower-block-heading" data-tower-block-heading>Send a signal<\/h4>\s*<div class="signal-post-as"/);
  assert.ok(head, "heading and switch share one row");
  assert.ok(html.indexOf('<script src="js/signal-post-as.js" defer></script>') > html.indexOf('<script src="js/supabase-social.js" defer></script>'));
  assert.ok(html.indexOf('<script src="js/signal-post-as.js" defer></script>') < html.indexOf('<script src="js/tower.js" defer></script>'));
});

test("post sends the chosen own page id; never a foreign one", function () {
  assert.strictEqual(postAs.authorProfileId("personal", [PER, PRO], ME), "per-1");
  assert.strictEqual(postAs.authorProfileId("professional", [PER, PRO], ME), "pro-1");
  assert.strictEqual(postAs.authorProfileId("professional", [PER, FOREIGN_PRO], ME), "", "foreign Pro: no id");
  assert.strictEqual(postAs.authorProfileId("professional", [PER, PRO], OTHER), "", "rows of another user are ignored");
  assert.strictEqual(postAs.isOwnProfileId("pro-9", [PER, PRO, FOREIGN_PRO], ME), false);
  assert.strictEqual(postAs.isOwnProfileId("pro-1", [PER, PRO], ME), true);
});

test("createTowerPost: asProfileId must be one of my profiles, else rejected", function () {
  var fn = social.slice(social.indexOf("function createTowerPost("), social.indexOf("function appealPostRating("));
  assert.ok(/fields\.asProfileId/.test(fn));
  assert.ok(/String\(p\.user_id \|\| ""\) === String\(me\.supabaseUserId\)/.test(fn), "owner check on user_id");
  assert.ok(/You can only post as your own pages\./.test(fn));
  assert.ok(/author_profile_id: profileId/.test(fn));
  assert.ok(tower.indexOf("asProfileId: (window.CognationSignalPostAs") > 0, "composer passes the switch choice");
  assert.ok(/state\.feed = \[\];\s*state\.myProfiles = \[\];/.test(social), "sign-out forgets my pages");
});

test("server policy keeps posts owner-only (no SQL in this PR)", function () {
  var dir = path.join(root, "supabase", "migrations");
  if (!fs.existsSync(dir)) return;
  var all = fs.readdirSync(dir).map(function (f) { return fs.readFileSync(path.join(dir, f), "utf8"); }).join("\n");
  assert.ok(/tower authors create their own posts/.test(all));
  assert.ok(/profiles\.id = tower_posts\.author_profile_id[\s\S]{0,80}profiles\.user_id = auth\.uid\(\)/.test(all));
});

test("session choice is per user", function () {
  var s = memStore();
  postAs.saveChoice(s, ME, "professional");
  assert.strictEqual(postAs.readChoice(s, ME), "professional");
  assert.strictEqual(postAs.readChoice(s, OTHER), "personal", "another member on this tab starts Personal");
  postAs.saveChoice(s, ME, "bogus");
  assert.strictEqual(postAs.readChoice(s, ME), "personal");
  var src = fs.readFileSync(path.join(__dirname, "signal-post-as.js"), "utf8");
  assert.ok(/root\.sessionStorage/.test(src) && !/localStorage/.test(src), "session only, no localStorage");
});

test("Feed card: page name, picture or initials, link to that page", function () {
  assert.ok(/function towerPostAuthorHtml\(post\)/.test(tower));
  assert.ok(/'<a class="tower-author-link" href="#tower-profile-'/.test(tower));
  assert.ok(/tower-author-avatar has-photo/.test(tower) && /initials\(post\.authorName/.test(tower));
  assert.ok(/window\.CognationTowerOpenProfile\(slug\)/.test(tower));
  assert.ok(/authorKind: authorKind === "professional"/.test(social));
  assert.ok(/seed_fleet_id,photo_url\),reactions/.test(social), "author picture from profiles.photo_url");
  assert.ok(/FEED_COLUMNS\.replace\(",photo_url\)", "\)"\)/.test(social), "Feed still loads without photo_url");
});

test("switch CSS: Oswald pipe, lit #f7f9ff, dim #d9d2f0 at 60%, pipe at 40%, one line", function () {
  assert.ok(/\.signal-compose-head\[data-signal-compose-head\] \{ display: flex; align-items: baseline; justify-content: space-between; gap: 0\.5rem; flex-wrap: nowrap;/.test(flat));
  assert.ok(/\.signal-post-as-side\[data-signal-post-as-btn\] \{[^}]*font-family: "Oswald"[^}]*color: rgba\(217, 210, 240, 0\.6\) !important;/.test(flat));
  assert.ok(/\.signal-post-as-side\[data-signal-post-as-btn\]\[aria-checked="true"\] \{ color: #f7f9ff !important;/.test(flat));
  assert.ok(/\.signal-post-as-sep \{[^}]*color: rgba\(217, 210, 240, 0\.4\) !important;/.test(flat));
  assert.ok(!/#1c1630/i.test(flat.slice(flat.indexOf("post-as switch"))), "no dark bar");
});

test("no success notice: a successful post shows nothing (Alexa, Oct 22 11:45 AM CT)", function () {
  assert.ok(tower.indexOf("Posted to Feed") < 0, "no 'Posted to Feed.' text anywhere in tower.js");
  assert.ok(tower.indexOf("Posting to Feed") < 0, "no in-flight notice either");
  var submit = tower.slice(tower.indexOf(".createTowerPost({"), tower.indexOf('var result = TowerStore.add({'));
  var ok = submit.slice(submit.indexOf(".then(function () {"), submit.indexOf(".catch("));
  assert.ok(/setStatus\("", false\);/.test(ok), "success hides the status box");
  assert.ok(!/setStatus\("[^"]/.test(ok), "success sets no message");
  assert.ok(/renderFeed\(root\)/.test(ok) && /bodyInput\.value = ""/.test(ok), "new post renders; composer clears");
  var catchPart = submit.slice(submit.indexOf(".catch("));
  assert.ok(/setStatus\(towerPostErrorLine\(error\), true\)/.test(catchPart), "failures still show, as errors");
});

test("failure box: glass, 1px #e88a99 at 70%, #f7f9ff text, no brown or yellow", function () {
  var start = flat.indexOf("#panel-signal .signal-feed-host .tower-compose[data-tower-compose] .commune-status[data-tower-status] {");
  assert.ok(start > 0);
  var rule = flat.slice(start, flat.indexOf("}", start));
  ["background: rgba(18, 16, 38, 0.92) !important", "backdrop-filter: blur(12px)", "border: 1px solid rgba(232, 138, 153, 0.7) !important",
    "border-radius: 12px !important", "color: #f7f9ff !important", "font-size: 14px !important", "padding: 10px 14px !important",
    "margin: calc(12px - 0.35rem) 0 !important"].forEach(function (t) {
    assert.ok(rule.indexOf(t) >= 0, t);
  });
  assert.ok(!/#ED9300|237, 147, 0|accent-dim|yellow|amber/i.test(rule), "no brown or yellow");
});

/* ---- v2 (PM HOLD / Designer LOOK NO, Oct 22) ---------------------------------- */

/* Pull a balanced {...} or (...) chunk starting at the first opener at/after i. */
function balanced(src, i, open, close) {
  var start = src.indexOf(open, i), depth = 0;
  for (var j = start; j < src.length; j++) {
    if (src[j] === open) depth++;
    else if (src[j] === close && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error("unbalanced");
}

/* The real remote-post branch of the composer submit, run with stub DOM + social. */
function remoteBranch() {
  var at = tower.indexOf("if (usingRemoteSocial()) {", tower.indexOf("var savedPics = form.__pics"));
  assert.ok(at > 0);
  var block = balanced(tower, at, "{", "}");
  var inFlightAt = tower.indexOf("function setPostInFlight(on)");
  var inFlightFn = "function setPostInFlight(on)" + balanced(tower, inFlightAt, "{", "}");
  var lineAt = tower.indexOf("function towerPostErrorLine(error)");
  var lineFn = "function towerPostErrorLine(error)" + balanced(tower, lineAt, "{", "}");
  /* setStatus exactly as tower.js writes it, so "the DOM" here is the real status writer. */
  var statusAt = tower.indexOf("function setStatus(msg, isError)", tower.indexOf('var status = towerFeedQuery(root, "[data-tower-status]")'));
  var statusFn = "function setStatus(msg, isError)" + balanced(tower, statusAt, "{", "}");
  return new Function("form", "postSubmitBtn", "status", "bodyInput", "fileInput", "attachments", "social0", "window", "console", "renderFeed", "root",
    "function usingRemoteSocial(){return true;} function remoteSocial(){return social0;}\n" +
    tower.match(/var EMPTY_POST_LINE = "[^"]*";/)[0] + "\n" +
    statusFn + "\n" + inFlightFn + "\n" + lineFn + "\n" +
    "return function run() " + block + ";");
}

function harness(bodyValue) {
  var settle = {};
  var calls = 0;
  var logs = [];
  var status = { hidden: true, textContent: "", classList: { on: {}, toggle: function (c, v) { this.on[c] = v; } } };
  var btn = { disabled: false, attrs: {}, setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; } };
  var form = {};
  var body = { value: bodyValue == null ? "hello" : bodyValue };
  var social0 = {
    createTowerPost: function () {
      calls++;
      return new Promise(function (res, rej) { settle.res = res; settle.rej = rej; });
    },
  };
  var win = { CognationSignalPostAs: Object.assign({ currentAuthorProfileId: function () { return "pro-1"; } }, postAs) };
  var cons = { warn: function () { logs.push(Array.prototype.slice.call(arguments)); } };
  var run = remoteBranch()(form, btn, status, body, { value: "" }, [], social0, win, cons, function () {}, {});
  return { run: run, settle: settle, status: status, btn: btn, logs: logs, body: body, calls: function () { return calls; } };
}

var RAW_RLS = 'new row violates row-level security policy for table "tower_posts"';

test("error copy: each error maps to the right line (PM wording)", function () {
  var rls = new Error(RAW_RLS); rls.status = 403; rls.body = { code: "42501", message: RAW_RLS };
  var codeOnly = new Error("denied"); codeOnly.body = { code: "42501" };
  var notOwn = new Error("You can only post as your own pages."); notOwn.code = "post_as_not_own";
  var as = "Couldn't post as that page. Try again.";
  var gen = "Couldn't post. Try again.";
  assert.strictEqual(postAs.POST_ERROR_AS_PAGE, as);
  assert.strictEqual(postAs.POST_ERROR_GENERIC, gen);
  assert.strictEqual(postAs.postErrorLine(rls), as, "RLS 403 / 42501");
  assert.strictEqual(postAs.postErrorLine(codeOnly), as, "42501 code alone");
  assert.strictEqual(postAs.postErrorLine(new Error(RAW_RLS)), as, "RLS message alone");
  assert.strictEqual(postAs.postErrorLine(notOwn), as, "author mismatch (browser own-page check)");
  var e500 = new Error("duplicate key value violates unique constraint \"x\""); e500.status = 500;
  assert.strictEqual(postAs.postErrorLine(e500), gen, "server 500");
  assert.strictEqual(postAs.postErrorLine(new TypeError("Failed to fetch")), gen, "network");
  assert.strictEqual(postAs.postErrorLine(new Error("Add a written update before posting. File uploads are not connected yet.")), gen, "other");
  assert.strictEqual(postAs.postErrorLine(null), gen, "no error object");
  assert.ok(/notOwn\.code = "post_as_not_own";/.test(social), "createTowerPost tags the own-page refusal");
});

test("raw server text never reaches the DOM; it goes to the console only", async function () {
  var cases = [
    (function () { var e = new Error(RAW_RLS); e.status = 403; e.body = { code: "42501", message: RAW_RLS }; return [e, "Couldn't post as that page. Try again."]; })(),
    (function () { var e = new Error("relation \"tower_posts\" does not exist"); e.status = 500; return [e, "Couldn't post. Try again."]; })(),
  ];
  for (var i = 0; i < cases.length; i++) {
    var h = harness();
    h.run();
    h.settle.rej(cases[i][0]);
    await new Promise(function (r) { setTimeout(r, 0); });
    assert.strictEqual(h.status.textContent, cases[i][1]);
    assert.strictEqual(h.status.hidden, false);
    assert.strictEqual(h.status.classList.on["is-error"], true);
    assert.ok(h.status.textContent.indexOf(cases[i][0].message) < 0, "raw text not on the page");
    assert.ok(h.logs.length === 1 && h.logs[0][1] === cases[i][0], "raw error logged to the console");
  }
  var catchPart = tower.slice(tower.indexOf(".catch(function (error) {", tower.indexOf(".createTowerPost({")));
  catchPart = balanced(catchPart, 0, "{", "}");
  assert.ok(!/error\.message|error && error\.message/.test(catchPart), "the catch never prints error.message");
});

test("in flight: Post is disabled (no double post) and re-enabled on success and on error", async function () {
  assert.ok(/<button type="submit" class="btn btn-primary" data-tower-post-submit>Post<\/button>/.test(html), "Post button hook");
  assert.ok(/#panel-signal \[data-tower-compose\] \[data-tower-post-submit\]:disabled \{ opacity: 0\.5; cursor: progress; \}/.test(flat), "disabled Post reads as waiting");
  for (var k = 0; k < 2; k++) {
    var h = harness();
    h.run();
    assert.strictEqual(h.btn.disabled, true, "disabled while in flight");
    assert.strictEqual(h.btn.attrs["aria-busy"], "true");
    h.run(); h.run();
    assert.strictEqual(h.calls(), 1, "second and third submits ignored while in flight");
    if (k === 0) h.settle.res(); else h.settle.rej(new Error(RAW_RLS));
    await new Promise(function (r) { setTimeout(r, 0); });
    assert.strictEqual(h.btn.disabled, false, k === 0 ? "re-enabled on success" : "re-enabled on error");
    assert.ok(!("aria-busy" in h.btn.attrs));
    if (k === 0) {
      assert.strictEqual(h.status.hidden, true, "success: no notice");
      assert.strictEqual(h.body.value, "", "success: composer cleared");
    }
    h.body.value = "again";
    h.run();
    assert.strictEqual(h.calls(), 2, "can post again after it settles");
  }
});

test("Feed card timestamp: body sans, #d9d2f0, 13px (12px at 390), right on the name line", function () {
  var start = flat.indexOf("#panel-signal .tower-feed[data-tower-feed] .tower-post-meta > time {");
  assert.ok(start > 0);
  var rule = flat.slice(start, flat.indexOf("}", start));
  ["font-family: var(--cgn-ui, ui-sans-serif, system-ui, sans-serif) !important", "font-size: 13px !important",
    "color: #d9d2f0 !important", "margin-left: auto", "text-align: right", "white-space: nowrap"].forEach(function (t) {
    assert.ok(rule.indexOf(t) >= 0, t);
  });
  assert.ok(!/serif\s*!important|Georgia|Times/i.test(rule.replace("sans-serif", "")), "no serif face");
  assert.ok(/@media \(max-width: 640px\) \{ #panel-signal \.tower-feed\[data-tower-feed\] \.tower-post-meta > time \{ font-size: 12px !important; \} \}/.test(flat), "12px at 390");
  assert.ok(/'<header class="tower-post-meta">' \+\s*towerPostAuthorHtml\(post\) \+\s*'<time datetime="'/.test(tower), "time sits in the name line");
});

test("empty post: own plain line, checked client-side, no request, button enabled", function () {
  ["", "   ", "\n\t "].forEach(function (v) {
    var h = harness(v);
    h.btn.disabled = true; /* even if it was left disabled, the empty check re-enables it */
    h.run();
    assert.strictEqual(h.calls(), 0, "no request sent");
    assert.strictEqual(h.status.textContent, "Write something before posting.");
    assert.strictEqual(h.status.hidden, false);
    assert.strictEqual(h.status.classList.on["is-error"], true, "same error box");
    assert.notStrictEqual(h.status.textContent, "Couldn't post. Try again.");
    assert.strictEqual(h.btn.disabled, false, "button enabled");
    assert.strictEqual(h.logs.length, 0, "nothing to log: no server call");
  });
  var h2 = harness("hello");
  h2.run();
  assert.strictEqual(h2.calls(), 1, "a real post still goes out");
});
