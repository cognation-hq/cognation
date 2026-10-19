/**
 * Still here: fails if a locked feature quietly goes missing.
 * Covers PULSE falling friends, electric lines, halo circles, Tower widgets,
 * News comments + Report, Feed comments, Report/Block, Investigator.
 * Run: node js/still-here.test.js
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
var html = src("index.html"), tower = src("js/tower.js"), css = src("css/styles.css");

/* PULSE falling friends: mounted on open, before the early return */
var start = tower.slice(tower.indexOf("function startCircleFall()"));
var firstReturn = start.indexOf("    return;\n");
assert.ok(firstReturn > 0 && start.slice(0, firstReturn).indexOf("CognationPulseFall.mount(layer") > 0, "falling friends mount on PULSE open");
assert.ok(html.indexOf('src="js/pulse-falling-friends.js"') > 0, "falling friends script loaded");
var pulse = require("./pulse-falling-friends.js");
assert.strictEqual(pulse.cap, 6000, "falling friends cap 6,000");

/* Electric lines: old color, crackle, brightness */
var lightning = tower.slice(tower.indexOf("function paintCircleLightning"), tower.indexOf("var CIRCLE_REFRESH_MS"));
assert.ok(/data-circle-lightning/.test(lightning), "electric lines canvas");
assert.ok(/blur\(14px\)/.test(lightning) && /"lighter"/.test(lightning), "electric glow brightness");
assert.ok(/0\.06 \* flicker/.test(lightning) && /Math\.sin\(i \* 1\.35\)/.test(lightning), "crackle flicker");
assert.ok(/r: Math\.round\(176 \* purple \+ 70 \* blue \+ 255 \* pink\)/.test(tower), "old purple/blue/pink color");
assert.ok(start.slice(0, firstReturn).indexOf("paintCircleRingShell(layer") > 0, "ring + lightning painted on open");

/* Halo circles: in front, visual only */
assert.ok(/CIRCLE_SPOTS\s*=\s*\[/.test(tower) && /\.circle-spot\.is-empty/.test(css), "halo circles");
assert.ok(/\.circle-ring\s*\{[^}]*z-index:\s*2/.test(css), "halo in front");
assert.ok(/\.pulse-fall-stack\s*\{[^}]*z-index:\s*1/.test(css), "friends behind");

/* Tower widgets */
["avatar", "identity", "slogan", "music", "youtube", "badges", "friends", "calendar", "followers", "polaroid", "html", "instax"].forEach(function (w) {
  assert.ok(html.indexOf('data-tower-widget="' + w + '"') > 0, "Tower widget " + w);
});
assert.ok(html.indexOf('data-tower-widget="social"') < 0, "no grouped LINKS/social sticker in HTML");
assert.ok(/socialWidgetId|data-tower-social-chip|__socials__/.test(tower), "per-network social widgets");

/* News comments + Report, Feed comments */
var news = src("js/news-comments.js");
assert.ok(/data-news-comment-report/.test(news) && />Report</.test(news), "News comment Report button");
assert.ok(html.indexOf("js/news-comments.js") > 0, "News comments loaded");
assert.ok(fs.existsSync(path.join(root, "js/feed-post-comments.test.js")), "Feed comments covered");

/* Moderation surfaces */
assert.ok(fs.existsSync(path.join(root, "investigator.html")), "Investigator page");
assert.ok(/Block/.test(src("js/block.js")), "Block");

/* PULSE tab label */
assert.ok(/data-tower-anchor="circle">PULSE</.test(html), "PULSE tab");


/* Electric lines actually render: run the real draw code against a recording
   canvas/SVG and require visible output, not just an element. */
function extractFn(name) {
  var i = tower.indexOf("function " + name + "(");
  assert.ok(i >= 0, name + " exists");
  var j = tower.indexOf("{", i), depth = 0, k;
  for (k = j; k < tower.length; k++) {
    if (tower[k] === "{") depth++;
    else if (tower[k] === "}" && --depth === 0) break;
  }
  return tower.slice(i, k + 1);
}
function constVal(name) { var m = new RegExp("var " + name + " = ([^;]+);").exec(tower); assert.ok(m, name); return m[1]; }
var draw = { fills: 0, maxAlpha: 0, paths: [] };
function node(tag) {
  return {
    tag: tag, attrs: {}, children: [],
    setAttribute: function (k, v) { this.attrs[k] = String(v); },
    appendChild: function (c) { this.children.push(c); if (c.tag === "path") draw.paths.push(c); return c; },
    getContext: function () {
      return {
        clearRect: function () {}, beginPath: function () {}, arc: function () {},
        fill: function () { draw.fills++; },
        createRadialGradient: function () {
          return { addColorStop: function (o, c) { var a = parseFloat(String(c).split(",")[3]); if (a > draw.maxAlpha) draw.maxAlpha = a; } };
        },
      };
    },
  };
}
var fakeDoc = { createElement: node, createElementNS: function (ns, t) { return node(t); } };
var code = ["CIRCLE_TILT", "CIRCLE_RING_R", "CIRCLE_PERSPECTIVE", "CIRCLE_SCALE"].map(function (n) { return "var " + n + " = " + constVal(n) + ";"; }).join("\n") +
  ["circleProjectRadius", "circleGlowColor", "circleBoltSegments", "circleBranchPath", "paintCircleBolt", "paintCircleLightning"].map(extractFn).join("\n") +
  "\nreturn paintCircleLightning;";
var paint = new Function("document", code)(fakeDoc);
var ringNode = node("div");
paint(ringNode);
assert.ok(draw.fills > 100, "glow canvas draws");
assert.ok(ringNode.children.some(function (c) { return c.attrs["data-circle-lightning"] !== undefined; }), "lightning canvas attached");
var bolt = ringNode.children.filter(function (c) { return c.attrs["data-circle-bolt"] !== undefined; })[0];
assert.ok(bolt, "lightning bolt SVG attached");
var strokes = draw.paths.filter(function (pth) { return parseFloat(pth.attrs.opacity) >= 0.5 && parseFloat(pth.attrs["stroke-width"]) > 0.5; });
assert.ok(strokes.length >= 50, "bolt has visible strokes (" + strokes.length + ")");
["#b44bff", "#3ecbff", "#ff4ad8", "#e9f7ff"].forEach(function (c) {
  assert.ok(draw.paths.some(function (pth) { return pth.attrs.stroke === c; }), "old bolt color " + c);
});
assert.ok(!/\.circle-lightning\s*\{[^}]*(display:\s*none|opacity:\s*0[;\s]|visibility:\s*hidden)/.test(css), "lightning not hidden by CSS");
assert.ok(/svg\.circle-bolt\s*\{[^}]*opacity:\s*1/.test(css) && /pulse-bolt-crackle/.test(css), "bolt visible with crackle");

/* Connections | Public profile pill, jumps, and the friends/badge picker are gone. Search followers stays. */
assert.ok(!/data-tower-side-toggle/.test(html), "Connections|Public profile pill removed");
assert.ok(!/data-tower-side-btn/.test(html), "side buttons removed");
assert.ok(!/data-tower-side-jump/.test(html), "side jumps removed");
assert.ok(!/Feature pins on Public/.test(html) && !/data-tower-badge-file/.test(html), "public friends picker and badge upload removed");
assert.ok(/data-tower-widget="friends"/.test(html) && /data-tower-widget="badges"/.test(html), "profile Top friends and Badges widgets stay");
assert.ok(/data-tower-followers-find/.test(html), "Search followers box in markup");
assert.ok(/input\.hidden = false;/.test(tower) && !/searchOwner/.test(tower) && /shownEdges = edges\.filter/.test(tower), "Search followers shows for owner and visitors on Professional, and filters");

/* Owner edit: myProfiles / _userId match; Tower tab returns home; Add a professional page in Edit profile */
assert.ok(/getMyProfiles/.test(tower) && /profile\._userId/.test(tower), "owner check matches myProfiles and server user id");
assert.ok(/window\.CognationTowerOpenOwn = function/.test(tower), "CognationTowerOpenOwn returns to own Tower");
assert.ok(/name === "tower" && typeof window\.CognationTowerOpenOwn === "function"/.test(fs.readFileSync(path.join(__dirname, "tabs.js"), "utf8")), "Tower tab click opens own Tower");
assert.ok(/data-tower-add-profile/.test(html) && /Add a professional page/.test(html), "Add a professional page in Edit profile markup");
assert.ok(/btn\.textContent = "Add a professional page"/.test(tower), "Add a professional page button label");
assert.ok(/if \(!anyDragged\) return null;/.test(tower), "never-dragged layouts use default grid (no overlap)");
assert.ok(/var handleHit = ev\.target\.closest\("\[data-tower-sticker-handle\]"\);/.test(tower), "sticker handle starts a drag");
assert.ok(/_userId: profile\.user_id \|\| ""/.test(fs.readFileSync(path.join(__dirname, "supabase-social.js"), "utf8")), "remote Tower profile carries user id for owner check");

/* ---- Tower widget drag (from #127), run in its own scope ---- */
(function () {
/**
 * Still here: fails if a locked feature quietly goes missing.
 * Tower widget drag (broke 3 times: #117 grid pile-up, and earlier drop/jump bugs).
 * Covers, for BOTH Personal and Professional owner pages:
 *   - drag one widget out of the default grid: it moves, the others keep their
 *     on-screen grid spots (never 0,0)
 *   - the drop persists: a "reload" from the saved layout puts it back
 *   - no layout save without a real drag (opening the Tower never POSTs)
 *   - a broken 0,0 pile-up layout resets to the default grid
 *   - no demo profile id fallback (prof-alexa-personal) in a real session
 * Run: node js/still-here.test.js
 */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");

function grab(a, b) {
  var i = tower.indexOf(a), j = tower.indexOf(b, i);
  assert.ok(i !== -1 && j > i, "found " + a);
  return tower.slice(i, j);
}
var code = [
  grab("  var FACTORY_SEED_LAYOUTS = [", "  function spawnRowsFor("),
  grab("  /* Drag out of the default CSS grid", "  /* Old scrapbook leans."),
  grab("  /* Broken pile-up", "  function profileHasSocialLinks("),
].join("\n");

/* ---- tiny fake DOM ---- */
function classList() {
  var s = new Set();
  return { add: function () { for (var i = 0; i < arguments.length; i++) s.add(arguments[i]); },
    remove: function () { for (var i = 0; i < arguments.length; i++) s.delete(arguments[i]); },
    contains: function (c) { return s.has(c); }, toggle: function (c, on) { on ? s.add(c) : s.delete(c); } };
}
function style() { var m = {}; return { setProperty: function (k, v) { m[k] = v; }, getPropertyValue: function (k) { return m[k] || ""; }, removeProperty: function (k) { delete m[k]; }, _m: m }; }
function el(id, rect) {
  var attrs = { "data-tower-widget": id };
  return { hidden: false, classList: classList(), style: style(), rect: rect,
    getAttribute: function (k) { return attrs[k] == null ? null : attrs[k]; },
    setAttribute: function (k, v) { attrs[k] = String(v); }, removeAttribute: function (k) { delete attrs[k]; },
    getBoundingClientRect: function () { return this.rect; } };
}
function makeStage(ids) {
  var stage = { classList: classList(), style: style(), clientWidth: 1000, children: [],
    getBoundingClientRect: function () { return { left: 100, top: 50, width: 1000, height: 2000 }; },
    querySelectorAll: function (sel) {
      var list = this.children;
      if (sel.indexOf(".is-spawned") > 0) list = list.filter(function (c) { return c.classList.contains("is-spawned"); });
      return list;
    } };
  stage.classList.add("is-sticker-stage", "is-default-grid", "is-desktop-grid");
  ids.forEach(function (id, i) {
    /* Grid spots: two columns, rows 200px apart (like the #117 grid). */
    var w = el(id, { left: 100 + 24 + (i % 2) * 500, top: 50 + 24 + Math.floor(i / 2) * 200, width: 476, height: 150 });
    w.parentNode = stage; w.classList.add("is-spawned");
    stage.children.push(w);
  });
  var root = { querySelector: function () { return stage; } };
  return { stage: stage, root: root };
}
function load() {
  var ctx = vm.createContext({ window: { innerWidth: 1280 }, Number: Number, Object: Object, Math: Math, String: String, parseFloat: parseFloat, parseInt: parseInt });
  vm.runInContext(code + "\nthis.lift = liftDefaultGrid; this.freeze = freezeSpawnedWidgets; this.getWidgetLayout = getWidgetLayout; this.isPileupLayout = isPileupLayout;", ctx);
  return ctx;
}

/* Mirror of the owner drag handler (start -> move -> drop) using tower.js functions. */
function ownerDrag(t, env, id, dxPct, dyPct, p) {
  var sticker = env.stage.children.filter(function (c) { return c.getAttribute("data-tower-widget") === id; })[0];
  t.lift(env.stage); /* drag start */
  var sx = parseFloat(sticker.getAttribute("data-sticker-x")), sy = parseFloat(sticker.getAttribute("data-sticker-y"));
  sticker.setAttribute("data-sticker-x", String(sx + dxPct));
  sticker.setAttribute("data-sticker-y", String(sy + dyPct));
  var layout = t.getWidgetLayout(p) || {};
  t.freeze(env.root, layout); /* drop */
  layout[id] = { x: sx + dxPct, y: sy + dyPct, z: 9, tilt: 0, dragged: true };
  p.widgetLayout = layout;
  return { sx: sx, sy: sy };
}

var PAGES = {
  personal: ["avatar", "identity", "slogan", "music", "friends", "social-instagram", "badges", "calendar", "polaroid", "html", "instax"],
  professional: ["avatar", "identity", "slogan", "youtube", "social-instagram", "badges", "followers", "calendar", "html"],
};
Object.keys(PAGES).forEach(function (kind) {
  var t = load();
  var env = makeStage(PAGES[kind]);
  var p = { _profileKind: kind, widgetLayout: null };
  var before = {};
  env.stage.children.forEach(function (c) { before[c.getAttribute("data-tower-widget")] = c.rect; });
  var start = ownerDrag(t, env, "calendar", 10, 5, p);
  var L = p.widgetLayout;
  assert.ok(!env.stage.classList.contains("is-default-grid"), kind + ": drag lifts the stage out of the grid");
  assert.strictEqual(L.calendar.x, start.sx + 10, kind + ": calendar moved x");
  assert.strictEqual(L.calendar.y, start.sy + 5, kind + ": calendar moved y");
  PAGES[kind].forEach(function (id) {
    if (id === "calendar") return;
    var r = before[id];
    var ex = Math.round(((r.left - 100) / 1000) * 1000) / 10, ey = Math.round(((r.top - 50) / 2000) * 1000) / 10;
    assert.ok(L[id], kind + ": " + id + " pinned");
    assert.strictEqual(L[id].x, ex, kind + ": " + id + " keeps grid x (not 0)");
    assert.strictEqual(L[id].y, ey, kind + ": " + id + " keeps grid y (not 0)");
  });
  assert.ok(!t.isPileupLayout(L), kind + ": result is not a pile-up");
  /* Reload: saved account layout round-trips through JSON and is used as-is. */
  var t2 = load();
  var reloaded = t2.getWidgetLayout({ _profileKind: kind, widgetLayout: JSON.parse(JSON.stringify(L)) });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(reloaded.calendar)), L.calendar, kind + ": drop persists after reload");
});

/* Broken 0,0 pile-up resets to the default grid. */
var tr = load();
assert.strictEqual(tr.getWidgetLayout({ widgetLayout: { avatar: { x: 0, y: 0 }, identity: { x: 0, y: 0 }, music: { x: 0, y: 0 }, calendar: { x: 40, y: 30 } } }), null, "0,0 pile-up resets");
assert.strictEqual(tr.getWidgetLayout({ widgetLayout: { avatar: { x: 0, y: 0 }, calendar: { x: 40, y: 30, dragged: true } } }).calendar.x, 40, "one dragged widget at a free spot is a real layout");
assert.strictEqual(tr.getWidgetLayout({ widgetLayout: { avatar: { x: 0, y: 0 }, calendar: { x: 40, y: 30 } } }), null, "never-dragged layout uses default grid");

/* Wiring in the real handler / store (static, so a refactor that drops it fails). */
var down = grab("      /* Drag from anywhere on the sticker", "    stage.addEventListener(\"pointerdown\", onPointerDown);");
assert.ok(/dragStarted = true;\s*\n\s*if \(liftDefaultGrid\(stage\)\)/.test(down), "drag start lifts the default grid");
assert.ok(/if \(!dragStarted\) \{[^}]*return;/.test(down), "no save when the pointer never dragged");
assert.ok(/freezeSpawnedWidgets\(root, layout\)/.test(down) && /TowerProfileStore\.save\(p, \{ geometry: true \}\)/.test(down), "drop freezes others and saves geometry");
assert.ok(/stage\.querySelectorAll\("\[data-tower-widget\]\.is-spawned"\)/.test(grab("  function freezeSpawnedWidgets", "  /* Old scrapbook")) && /liftDefaultGrid\(stage\);/.test(grab("  function freezeSpawnedWidgets", "  /* Old scrapbook")), "freeze pins from on-screen spots");
assert.ok(/if \(opts\.geometry && window\.CognationTowerLayoutSync\) window\.CognationTowerLayoutSync\.save\(data\)/.test(tower), "account layout saved only on a geometry edit (never on open)");
assert.ok(/!signInConfigured && window\.CognationAccounts/.test(tower), "demo profile id only in local preview, never with sign-in configured");

})();

/* ---- Tower: no overlaps, auto-pile repair, drag overlap kept, MP3 Personal only ---- */
(function () {
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
function grab(a, b) {
  var i = tower.indexOf(a), j = tower.indexOf(b, i);
  assert.ok(i !== -1 && j > i, "found " + a);
  return tower.slice(i, j);
}
var ctx = vm.createContext({ Number: Number, Object: Object, Math: Math, String: String, parseFloat: parseFloat, parseInt: parseInt, isNaN: isNaN });
vm.runInContext([
  grab("  var SPAWN_GAP = 24;", "  /* Phone (<768px)"),
  "  var PROFILE_STACK = { avatar: true, identity: true, slogan: true }; var PROFILE_STACK_GAP = 4;",
  grab("  function isFactorySeedPos(", "  /* Drag out of the default CSS grid"),
  grab("  /* Broken pile-up", "  function profileHasSocialLinks("),
  "this.SPAWN_ROWS = SPAWN_ROWS; this.packSpawn = packSpawn; this.getWidgetLayout = getWidgetLayout; this.isProTower = isProTower;",
].join("\n"), ctx);

/* Default spawn never overlaps, Personal and Pro, desktop and phone. */
var SIZES = { avatar: [220, 220], identity: [400, 90], slogan: [400, 70], music: [300, 380], youtube: [560, 340],
  friends: [440, 200], "social-instagram": [160, 48], "social-tiktok": [160, 48], badges: [300, 160], calendar: [300, 260], followers: [300, 240],
  polaroid: [280, 320], html: [420, 200], instax: [220, 280] };
function expandRows(face) {
  var chips = face === "professional" ? ["social-instagram", "social-tiktok"] : ["social-instagram", "social-tiktok"];
  var out = [];
  ctx.SPAWN_ROWS[face].forEach(function (row) {
    if (row.length === 1 && row[0] === "__socials__") {
      var i;
      for (i = 0; i < chips.length; i += 2) out.push(chips.slice(i, i + 2));
      return;
    }
    out.push(row.slice());
  });
  return out;
}
function noOverlap(face, stageW, phone) {
  var rows = expandRows(face), sizes = {};
  rows.forEach(function (r) { r.forEach(function (id) { sizes[id] = { w: SIZES[id][0], h: SIZES[id][1] }; }); });
  var out = ctx.packSpawn(rows, sizes, [], stageW, phone);
  var colW = out.__colW, rects = [];
  rows.forEach(function (r) { r.forEach(function (id) {
    var w = r.length > 1 || phone ? Math.min(sizes[id].w, colW) : sizes[id].w;
    rects.push({ id: id, x: out[id].x, y: out[id].y, w: w, h: sizes[id].h });
  }); });
  for (var i = 0; i < rects.length; i++) for (var j = i + 1; j < rects.length; j++) {
    var a = rects[i], b = rects[j];
    var hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    assert.ok(!hit, face + (phone ? " phone" : " desktop") + " default: " + a.id + " overlaps " + b.id);
  }
}
noOverlap("personal", 1000, false); noOverlap("professional", 1000, false);
noOverlap("personal", 375, true); noOverlap("professional", 375, true);

var pro = { _profileKind: "professional" }, personal = { _profileKind: "personal" };
function withLayout(base, layout) { var o = {}; Object.keys(base).forEach(function (k) { o[k] = base[k]; }); o.widgetLayout = layout; return o; }

/* Auto-spawn pile (never dragged, several on one spot) is repaired -> default grid. */
assert.strictEqual(ctx.getWidgetLayout(withLayout(personal, { music: { x: 30, y: 40 }, friends: { x: 30, y: 40 }, calendar: { x: 60, y: 10 } })), null, "Personal auto pile repaired");
assert.strictEqual(ctx.getWidgetLayout(withLayout(pro, { youtube: { x: 12, y: 30 }, followers: { x: 12, y: 30 }, html: { x: 60, y: 70 } })), null, "Pro auto pile repaired");
assert.strictEqual(ctx.getWidgetLayout(withLayout(personal, { avatar: { x: 0, y: 0 }, identity: { x: 0, y: 0 } })), null, "0,0 pile repaired");
/* One dragged + one never-dragged on the same spot: still an auto pile. */
assert.strictEqual(ctx.getWidgetLayout(withLayout(personal, { music: { x: 30, y: 40, dragged: true }, friends: { x: 30, y: 40 } })), null, "half-dragged pile repaired");

/* Overlap the owner made by dragging is free placement: kept. */
var dragged = { music: { x: 30, y: 40, dragged: true }, friends: { x: 30, y: 40, dragged: true }, calendar: { x: 60, y: 10 } };
assert.strictEqual(ctx.getWidgetLayout(withLayout(personal, dragged)), dragged, "drag-made overlap kept (Personal)");
var proDrag = { youtube: { x: 20, y: 20, dragged: true }, calendar: { x: 22, y: 24, dragged: true } };
assert.strictEqual(ctx.getWidgetLayout(withLayout(pro, proDrag)), proDrag, "drag-made overlap kept (Pro)");
var spread = { avatar: { x: 2, y: 3 }, identity: { x: 30, y: 3 }, calendar: { x: 60, y: 40 } };
assert.strictEqual(ctx.getWidgetLayout(withLayout(personal, spread)), null, "never-dragged spread uses default grid (no overlap)");
var spreadDrag = { avatar: { x: 2, y: 3 }, identity: { x: 30, y: 3 }, calendar: { x: 60, y: 40, dragged: true } };
assert.strictEqual(ctx.getWidgetLayout(withLayout(personal, spreadDrag)), spreadDrag, "layout with an owner drag is kept");

/* MP3 is Personal only (Alexa, Oct 7); YouTube stays on Pro. */
assert.ok(ctx.SPAWN_ROWS.professional.every(function (r) { return r.indexOf("music") < 0; }), "Pro spawn has no music");
assert.ok(ctx.SPAWN_ROWS.professional.some(function (r) { return r.indexOf("youtube") >= 0; }), "Pro spawn keeps YouTube");
assert.ok(ctx.SPAWN_ROWS.personal.some(function (r) { return r.indexOf("music") >= 0; }), "Personal still has music");
assert.ok(ctx.isProTower({ kind: "professional", _profileKind: "personal" }), "Pro by kind counts even if _profileKind says personal");
assert.ok(!ctx.isProTower(personal), "Personal is not Pro");
/* Old saved Pro layout with music on top of YouTube: music never counts, layout kept. */
var oldPro = { music: { x: 12, y: 30 }, youtube: { x: 12, y: 30, dragged: true }, calendar: { x: 60, y: 10 } };
assert.strictEqual(ctx.getWidgetLayout(withLayout(pro, oldPro)), oldPro, "old Pro music spot ignored");
assert.ok(/var personalMusic = !isProTower\(p\);/.test(tower), "public widget music gate uses the shared Pro check");
assert.ok(/var personal = !isProTower\(p\);/.test(tower), "music player init uses the shared Pro check");
assert.ok(/if \(id === "music" && isProTower\(p\)\) \{\s*el\.hidden = true;/.test(tower), "old saved Pro layouts never show the MP3");
assert.ok(/dragged: true,/.test(tower), "owner drop marks the widget as dragged");
})();

/* Pro YouTube paste box (Alexa: tutorials, brand marketing, creators' top videos). */
assert.ok(/data-tower-widget="youtube"[\s\S]*?data-tower-pro-youtube-owner[\s\S]*?<input[^>]*type="url"[^>]*placeholder="Paste a YouTube link"[^>]*data-tower-pro-youtube-url/.test(html), "Pro YouTube paste box in markup");
assert.ok(/if \(!personal\) \{[\s\S]*?showYoutubeSticker\(root, true\);\s*bindProYoutubeUrl\(root\);/.test(tower), "Pro page shows the YouTube widget and binds the paste box");
assert.ok(/function bindProYoutubeUrl[\s\S]*?!isTowerOwner\(cur\) \|\| !profileIsProfessional\(cur\)\) return;[\s\S]*?cur\.musicUrl = next;[\s\S]*?addEventListener\("paste"/.test(tower), "paste saves the link, owner + Pro only");

/* ---- Venmo on Personal AND Pro; Pro "Pay for services" + "Buy ads" links (new, owner-set, https only, quiet) ---- */
(function () {
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
function grab(a, b) { var i = tower.indexOf(a), j = tower.indexOf(b, i); assert.ok(i !== -1 && j > i, "found " + a); return tower.slice(i, j); }
var ctx = vm.createContext({ URL: URL, String: String });
vm.runInContext([
  grab("  var SOCIAL_NETWORKS = [", "  function socialLinkDefs()"),
  grab("  function socialNetAllowedForKind(", "  function commitSocialDraft("),
  "this.nets = SOCIAL_NETWORKS; this.allowed = socialNetAllowedForKind; this.href = socialHref; this.stored = storedSocialValue;",
].join("\n"), ctx);
function net(id) { return ctx.nets.filter(function (n) { return n.id === id; })[0]; }
assert.ok(net("venmo") && ctx.allowed(net("venmo"), "personal") && ctx.allowed(net("venmo"), "professional"), "Venmo on Personal and Pro");
assert.strictEqual(ctx.href("venmo", "@alexa"), "https://venmo.com/u/alexa", "Venmo handle links out");
assert.ok(/data-tower-social="venmo"/.test(html), "Venmo field in Edit profile");
["services", "ads"].forEach(function (id) {
  var n = net(id);
  assert.ok(n && n.label === (id === "services" ? "Pay for services" : "Buy ads") && n.quiet && !n.cta, id + " link defined, quiet");
  assert.ok(ctx.allowed(n, "professional") && !ctx.allowed(n, "personal"), id + " on Pro only");
  assert.strictEqual(ctx.href(id, "https://example.org/x"), "https://example.org/x", id + ": https kept");
  assert.strictEqual(ctx.href(id, "example.org/x"), "https://example.org/x", id + ": bare domain becomes https");
  ["http://example.org", "javascript:alert(1)", "data:text/html,x", "ftp://example.org"].forEach(function (bad) {
    assert.strictEqual(ctx.href(id, bad), "", id + " rejected: " + bad);
    assert.strictEqual(ctx.stored(id, bad), "", id + " not stored: " + bad);
  });
  assert.ok(new RegExp('<input id="tower-social-' + id + '"[^>]*type="url"[^>]*data-tower-social="' + id + '"').test(html), "owner sets " + id + " in Edit profile");
});
assert.ok(!net("hire") && !/is-cta/.test(tower) && !/data-tower-social="hire"/.test(html), "single Hire/Buy CTA gone");
var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
assert.ok(/var quiet = net\.quiet \|\| \(net\.id === "venmo" && profileKind === "professional"\);/.test(tower), "Venmo, services, ads quiet on Pro");
assert.ok(/\.tower-social-btn\.is-quiet \{[^}]*background: transparent;[^}]*color: var\(--cgn-text-muted\);[^}]*border: 1px solid var\(--cgn-border\);/.test(css), "muted secondary chrome");
assert.ok(!/\.is-quiet[^{]*\{[^}]*#8e7cff/.test(css) && !/is-cta/.test(css), "no purple CTA pill");
assert.ok(/function commitSocialDraft\(root, id, value\) \{\s*if \(!isTowerOwner\(TowerProfileStore\.get\(\)\)\) return;/.test(tower), "only the owner can edit links");
assert.ok(/a\.target = "_blank";\s*a\.rel = "noopener noreferrer";/.test(tower), "opens outside Cognation");
})();


/* Calendar: readable event cards, no demo Friends schedule panel, visitor Book */
(function () {
  var card = css.match(/\.tower-cal-event \{[^}]*\}/)[0];
  var bg = card.match(/background:\s*rgba\((\d+),\s*(\d+),\s*(\d+)/);
  var fg = card.match(/color:\s*#([0-9a-f]{6})/i);
  assert.ok(bg && fg, "calendar event card sets background and text color");
  function lum(r, g, b) {
    return [r, g, b].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
      .reduce(function (a, v, i) { return a + v * [0.2126, 0.7152, 0.0722][i]; }, 0);
  }
  var h = fg[1];
  var lf = lum(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16));
  var lb = lum(+bg[1], +bg[2], +bg[3]);
  var ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
  assert.ok(ratio >= 4.5, "calendar event card text contrasts with its card (" + ratio.toFixed(1) + ":1)");
  assert.ok(!/\.tower-cal-event-(time|who|notes)[^{]*\{[^}]*#8a6575/.test(css), "no pink-grey text on calendar cards");
  assert.ok(!/Friends schedule|tower-cal-friend-dropdown|tower-cal-friend-form|Request \/ add|Request a hangout/.test(html + tower + css), "Friends schedule panel gone");
  assert.ok(!/\(demo\)/.test(tower.slice(tower.indexOf("function renderSchedulerPanel"), tower.indexOf("function renderPrivateCalendar"))), "no demo copy in scheduler");
  assert.ok(html.indexOf('data-tower-widget="calendar"') > 0, "calendar widget kept");
  var vm = require("vm");
  var ctx = { escapeHtml: function (x) { return String(x); }, formatEventTime: function (x) { return x; },
    eventsForDate: function () { return []; },
    suggestHangoutTimes: function () { return [{ time: "09:00", label: "Morning" }]; } };
  vm.createContext(ctx);
  vm.runInContext(tower.slice(tower.indexOf("  function renderSchedulerPanel("), tower.indexOf("  /* Visitor books an open time")), ctx);
  assert.ok(!/data-tower-cal-book=/.test(ctx.renderSchedulerPanel([], "2026-10-20", { visitor: true, picked: "" })), "no Book before a time is picked");
  assert.ok(/data-tower-cal-book="09:00"[^>]*>Book</.test(ctx.renderSchedulerPanel([], "2026-10-20", { visitor: true, picked: "09:00" })), "Book shows once a time is selected");
  assert.ok(/var HANGOUT_BOOKING_LIVE = false;/.test(tower), "Book does not send until the owner inbox ships");
  assert.ok(/if \(!HANGOUT_BOOKING_LIVE\) \{[\s\S]{0,200}Booking is coming soon\.[\s\S]{0,80}return;/.test(tower), "Book says coming soon and returns before request_hangout");
  assert.ok(!/Request sent\./.test(tower.slice(tower.indexOf("if (!HANGOUT_BOOKING_LIVE)") - 400, tower.indexOf("if (!HANGOUT_BOOKING_LIVE)"))), "no sent claim before the flag");
  /* Designer color lock */
  assert.ok(/\.tower-cal-event \{[^}]*border: 1px solid var\(--cgn-border, rgba\(255, 255, 255, 0\.14\)\);[^}]*background: rgba\(18, 16, 38, 0\.92\);[^}]*color: #f7f9ff;/.test(css), "card bg/border/title lock");
  assert.ok(/\.tower-cal-event\.is-pending \{[^}]*background: rgba\(44, 30, 18, 0\.92\);/.test(css), "pending bg lock");
  assert.ok(/\.tower-cal-event-time \{[^}]*color: #d9d2f0;/.test(css) && /\.tower-cal-event-notes \{[^}]*color: #d9d2f0;/.test(css), "time/notes lock");
  assert.ok(/var schedulerHtml = view\.schedulerOpen\s*\? renderSchedulerPanel\(owner \? shared : events, selected, \{\s*visitor: !owner,\s*picked: owner \? "" :/.test(tower), "owner gets full scheduler, never Book");
  assert.ok(!/data-tower-cal-book=/.test(ctx.renderSchedulerPanel([], "2026-10-20", { visitor: false, picked: "09:00" })), "owner never sees Book");
  assert.ok(/create or replace function public\.request_hangout/.test(src("supabase/migrations/20261016_hangout_requests.sql")), "request_hangout migration");
})();


/* ---- #131 live fails + LOOK v3.2/v3.3 density (tabs, handle, Pro server, strip) ---- */
(function () {
  var assert = require("assert");
  var fs = require("fs");
  var path = require("path");
  var tabs = fs.readFileSync(path.join(__dirname, "tabs.js"), "utf8");
  var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
  var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
  var layoutSync = fs.readFileSync(path.join(__dirname, "tower-layout-sync.js"), "utf8");
  var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

  /* Friend tap-through / visitor Tower: do not OpenOwn while a profile hash is open. */
  assert.ok(/viewingOther = hash\.indexOf\("tower-profile-"\) === 0/.test(tabs), "tabs skip OpenOwn when viewing a profile");
  assert.ok(/if \(!viewingOther\)/.test(tabs) && /CognationTowerOpenOwn/.test(tabs), "OpenOwn only when no profile viewed");

  /* Drag handle visible for owner on Public. */
  assert.ok(/display: flex !important/.test(css) && /\.tower-sticker-handle/.test(css), "handle shown for owner");
  assert.ok(!/\.tower-sticker-handle,\s*\[data-tower-app\]\[data-tower-is-owner="true"\]\[data-tower-side="public"\] \.tower-sticker-handle,\s*\[data-tower-app\]\[data-tower-is-owner="true"\]\[data-tower-side="public"\] \.tower-sticker-handle\[hidden\] \{\s*display: none !important/.test(css), "old hide-all-handles rule gone");
  assert.ok(/h\.hidden = !show;/.test(tower), "syncOwnerStickerHandles unhides for owner");

  /* Pro YouTube + Venmo/Pay/Buy ads persist on server (layout._public), not local only. */
  assert.ok(/function savePublic\(/.test(layoutSync) && /_public/.test(layoutSync), "layout sync savePublic");
  assert.ok(/CognationTowerLayoutSync\.savePublic/.test(tower), "Tower calls savePublic on social/YouTube save");
  assert.ok(/Empty local must not wipe server _public links/.test(tower), "empty localStorage does not clear server socials");

  /* v3.2/v3.3 density: profile strip ~72–88px. YouTube card keeps player + paste field. */
  assert.ok(/data-tower-profile-strip/.test(tower) && /ensureProfileStrip/.test(tower), "profile strip wrapper");
  assert.ok(/max-height:\s*88px/.test(css) && /min-height:\s*72px/.test(css), "profile strip height band");
  assert.ok(/\.tower-sticker--youtube\.is-spawned \{\s*max-height: none;/.test(css), "YouTube card is not clipped after a link");
  assert.ok(/data-music-mode="youtube"\] \.tower-music-owner/.test(css), "personal paste field stays with the player");
  assert.ok(/tower-profile-strip-quote/.test(css) && /content: none !important/.test(css), "quote under handle, no divider");
  assert.ok(/__socials__/.test(tower) && /socialWidgetId/.test(tower), "SPAWN_ROWS expands per-link social chips");
  assert.ok(!/\["friends", "social"\]/.test(tower) && !/\["social", "badges"\]/.test(tower), "grouped social spawn slots removed");

  /* Behavioral: server public round-trip. */
  var sync = require("./tower-layout-sync.js");
  var pub = sync._cleanPublic({
    musicUrl: "https://youtube.com/watch?v=abcdefghijk",
    socialLinks: { venmo: "@lex", services: "https://pay.example/x", ads: "https://ads.example/y", instagram: "https://instagram.com/lex" },
  });
  assert.strictEqual(pub.musicUrl.indexOf("youtube.com") > 0, true, "YouTube URL kept");
  assert.ok(pub.socialLinks.venmo && pub.socialLinks.services && pub.socialLinks.ads && pub.socialLinks.instagram, "Venmo/Pay/Buy ads/IG in _public");
  var profile = { _profileId: "22222222-2222-4222-8222-222222222222", socialLinks: {}, musicUrl: "" };
  sync._cache[profile._profileId] = { _public: pub, avatar: { x: 2, y: 3, z: 1, tilt: 0, dragged: true } };
  sync._publicCache[profile._profileId] = pub;
  sync.apply(profile);
  assert.ok(profile.musicUrl.indexOf("youtube") > 0, "fresh apply loads YouTube from server");
  assert.strictEqual(profile.socialLinks.venmo, "@lex", "fresh apply loads Venmo from server");
  assert.ok(profile.widgetLayout.avatar.dragged === true, "dragged preserved through apply");
})();



/* ---- v3.3 split links: each social is its own widget ---- */
(function () {
  var assert = require("assert");
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
  var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");

  assert.ok(html.indexOf('data-tower-widget="social"') < 0, "HTML has no grouped social box");
  assert.ok(/data-tower-social-chip/.test(tower), "chips carry data-tower-social-chip");
  /* tower-widgets PR: the X on each chip is gone; Backspace/Delete (and the touch
     Remove button) clear the selected chip's link instead. */
  assert.ok(!/rm\.setAttribute\("data-tower-social-remove"/.test(tower), "no X button on social chips");
  assert.ok(!/className = "tower-social-chip-label"/.test(tower), "social chips are logos only; X paints no letter that reads as delete");
  assert.ok(/var socialNet = socialNetIdFromWidget\(id\);\s*if \(socialNet\) \{\s*removeSocialWidget\(root, socialNet\);/.test(tower), "selected chip removable by key / Remove button");
  assert.ok(/tower-sticker--social-chip/.test(css), "chip CSS present");
  assert.ok(/migrateGroupedSocialLayout/.test(tower), "old grouped layout.social maps to first chip");

  var start = tower.indexOf("function chipSocialLinks");
  var end = tower.indexOf("function expandSpawnRows");
  assert.ok(start > 0 && end > start, "optedInSocialNetIds present");
  var ctx = vm.createContext({
    socialLinkDefs: function () {
      return [
        { id: "instagram", label: "Instagram" },
        { id: "tiktok", label: "TikTok" },
        { id: "venmo", label: "Venmo" },
        { id: "x", label: "X" },
      ];
    },
    socialNetAllowedForKind: function () { return true; },
    socialHref: function (id, raw) { return raw ? "https://example/" + id : ""; },
    socialWidgetId: function (id) { return "social-" + id; },
  });
  vm.runInContext(tower.slice(start, end) + "\nthis.optedIn = optedInSocialNetIds;", ctx);
  var ids = ctx.optedIn({
    socialLinks: { instagram: "https://instagram.com/a", tiktok: "", venmo: "@v", x: "https://x.com/a" },
    publicWidgets: { "social-x": false },
    _profileKind: "personal",
  });
  assert.deepStrictEqual(Array.prototype.slice.call(ids), ["instagram", "venmo"], "unset tiktok omitted; hidden x omitted; IG+Venmo remain");
})();

/* ---- Social save keeps session + layout (Alexa: save must not sign out / reset) ---- */
(function () {
  var assert = require("assert");
  var fs = require("fs");
  var path = require("path");
  var tower = fs.readFileSync(path.join(__dirname, "tower.js"), "utf8");
  var social = fs.readFileSync(path.join(__dirname, "supabase-social.js"), "utf8");
  var layoutSync = fs.readFileSync(path.join(__dirname, "tower-layout-sync.js"), "utf8");
  var commune = fs.readFileSync(path.join(__dirname, "commune-swipe.js"), "utf8");
  var dating = fs.readFileSync(path.join(__dirname, "seedops-dating-hydrate.js"), "utf8");

  /* Cause: refreshFriends used to store handles as friendIds and save with geometry:true. */
  assert.ok(
    /p\.handle \|\| p\.id/.test(social) === false ||
      /Friend ids must be profile UUIDs[\s\S]*?\.map\(function \(p\) \{\s*return String\(\(p && p\.id\) \|\| ""\);/.test(social),
    "refreshFriends stores profile UUIDs, not handles"
  );
  assert.ok(
    /tower\.friendIds = ids\.slice\(\);\s*\/\* Friend roster only[\s\S]*?store\.save\(tower\);/.test(social) ||
      /tower\.friendIds = ids\.slice\(\);\s*store\.save\(tower\);/.test(social),
    "friend hydrate saves without geometry:true"
  );
  assert.ok(!/tower\.friendIds = ids\.slice\(\);\s*store\.save\(tower,\s*\{\s*geometry:\s*true\s*\}\)/.test(social), "friend hydrate must not POST layout");

  /* dragged survives DB clean/apply so reload keeps arranged positions. */
  assert.ok(/if \(pos\.dragged === true\) entry\.dragged = true;/.test(layoutSync), "layout sync clean keeps dragged");
  assert.ok(/prev\.dragged === true && next && next\.dragged !== true/.test(layoutSync), "layout apply preserves local dragged");

  /* Profile/social save never overwrites saved layout. */
  assert.ok(/writeScrapbookLayout\(data, \{ keepLayout: !opts\.geometry \}\)/.test(tower), "non-geometry save keeps scrapbook layout");
  assert.ok(/opts\.keepLayout/.test(tower), "writeScrapbookLayout supports keepLayout");

  /* Save profile re-paints in place — no location.reload that re-boots auth. */
  assert.ok(/setProfileStatus\("Profile saved\."/.test(tower), "save status without refreshing…");
  assert.ok(!/Profile saved — refreshing…/.test(tower), "old reload toast gone");
  var saveAt = tower.indexOf('profileForm.addEventListener("submit"');
  assert.ok(saveAt > 0, "Save profile submit handler present");
  var saveSubmit = tower.slice(saveAt, saveAt + 9000);
  assert.ok(!/window\.location\.reload\(\)/.test(saveSubmit), "Save profile does not location.reload");
  assert.ok(/renderProfileChrome\(root\)/.test(saveSubmit) && /applyWidgetLayout\(root/.test(saveSubmit), "Save profile re-paints Tower in place");

  /* Social / profile save path never calls updateUser (dating metadata). */
  assert.ok(!/updateUser/.test(tower.slice(tower.indexOf("function commitSocialDraft"), tower.indexOf("function commitSocialDraft") + 800)), "commitSocialDraft never updateUser");
  assert.ok(!/updateUser/.test(saveSubmit), "Save profile never updateUser");
  assert.ok(/Do not PUT \/auth\/v1\/user from hydrate/.test(dating), "hydrate boot does not PUT auth user");

  /* Handles must not be queried as profile UUIDs. */
  assert.ok(/Handles \(seed-ana-0005\) are not profile ids/.test(commune) || /!UUID_RE\.test\(s\)\) return;/.test(commune), "warmProfileSeedStatuses skips non-UUIDs");

  /* Behavioral: arrange → save social → "reload" keeps positions + session. */
  var vm = require("vm");
  var syncApi = require("./tower-layout-sync.js");
  var layout = {
    avatar: { x: 10, y: 12, z: 2, tilt: 0, dragged: true },
    calendar: { x: 55, y: 40, z: 3, tilt: 0 },
  };
  var cleaned = syncApi._clean(layout);
  assert.strictEqual(cleaned.avatar.dragged, true, "clean keeps dragged on arranged widget");
  assert.ok(!cleaned.calendar.dragged, "clean omits dragged when unset");
  var profile = { _profileId: "11111111-1111-4111-8111-111111111111", widgetLayout: { avatar: { x: 10, y: 12, z: 2, tilt: 0, dragged: true } } };
  syncApi._cache[profile._profileId] = cleaned;
  syncApi.apply(profile);
  assert.strictEqual(profile.widgetLayout.avatar.dragged, true, "apply after 'reload' keeps dragged");
  assert.strictEqual(profile.widgetLayout.avatar.x, 10, "apply after 'reload' keeps x");
  assert.strictEqual(profile.widgetLayout.calendar.x, 55, "apply brings companion spots");
})();

console.log("still-here.test.js: OK");
