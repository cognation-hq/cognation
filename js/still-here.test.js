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
["avatar", "identity", "slogan", "social", "music", "youtube", "badges", "friends", "calendar", "followers", "polaroid", "html", "instax"].forEach(function (w) {
  assert.ok(html.indexOf('data-tower-widget="' + w + '"') > 0, "Tower widget " + w);
});

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

/* Tower Private|Public switch and Search followers (restored after #59/#117), switch owner only, Search followers for everyone on Professional */
assert.ok(/data-tower-side-toggle[^>]*>/.test(html) && !/data-tower-side-toggle[^>]*hidden>/.test(html), "Private|Public switch in markup, not hard-hidden");
assert.ok(/data-tower-side-btn="private"/.test(html) && /data-tower-side-btn="public"/.test(html), "both side buttons");
assert.ok(/toggle\.hidden = !owner;/.test(tower), "switch shows for owner only");
assert.ok(!/\[data-tower-side-toggle\]\s*\{\s*display:\s*none/.test(css), "switch not forced off by CSS");
assert.ok(/\[data-tower-app\]:not\(\[data-tower-is-owner="true"\]\) \[data-tower-side-toggle\]/.test(css), "non-owners never see the switch");
assert.ok(/data-tower-followers-find/.test(html), "Search followers box in markup");
assert.ok(/input\.hidden = false;/.test(tower) && !/searchOwner/.test(tower) && /shownEdges = edges\.filter/.test(tower), "Search followers shows for owner and visitors on Professional, and filters");

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
  layout[id] = { x: sx + dxPct, y: sy + dyPct, z: 9, tilt: 0 };
  p.widgetLayout = layout;
  return { sx: sx, sy: sy };
}

var PAGES = {
  personal: ["avatar", "identity", "slogan", "music", "friends", "social", "badges", "calendar", "polaroid", "html", "instax"],
  professional: ["avatar", "identity", "slogan", "youtube", "social", "badges", "followers", "calendar", "html"],
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
assert.ok(tr.getWidgetLayout({ widgetLayout: { avatar: { x: 0, y: 0 }, calendar: { x: 40, y: 30 } } }), "one widget at 0,0 is a real layout");

/* Wiring in the real handler / store (static, so a refactor that drops it fails). */
var down = grab("      /* Drag from anywhere on the sticker.", "    stage.addEventListener(\"pointerdown\", onPointerDown);");
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
  friends: [440, 200], social: [300, 120], badges: [300, 160], calendar: [300, 260], followers: [300, 240],
  polaroid: [280, 320], html: [420, 200], instax: [220, 280] };
function noOverlap(face, stageW, phone) {
  var rows = ctx.SPAWN_ROWS[face], sizes = {};
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
assert.strictEqual(ctx.getWidgetLayout(withLayout(personal, spread)), spread, "normal layout kept");

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

console.log("still-here.test.js: OK");
