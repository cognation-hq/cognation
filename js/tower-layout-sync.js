/**
 * Tower widget layout ⇄ Supabase (public.tower_widget_layouts, one row per profile).
 * Read: a saved DB row wins; no row → whatever the page already has (local copy,
 * else the default spawn layout). Write: the owner's next save upserts the layout,
 * which also moves an older localStorage-only layout into the DB. Load-time
 * repairs are staged in memory (stage) and never upload on their own.
 *
 * layout._public (optional): { musicUrl, socialLinks } — Pro YouTube + Venmo /
 * Pay for services / Buy ads / social URLs that must survive a fresh browser.
 * layout._widgets (optional, Oct 22): the owner's added widgets and switches —
 * { quoteStickers, emojiStickers, friendPinLayout, badgePinLayout,
 *   publicWidgets, badgeVisibility }. Saved for a signed-in owner on add,
 * remove, switch and drag end. When a row has it, it wins over the copy in
 * localStorage, which is only a cache.
 * Keys starting with "_" are never treated as sticker coordinates.
 */
(function (root) {
  "use strict";

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var cache = {}; /* profileId -> layout object, or null when there is no row */
  var publicCache = {}; /* profileId -> { musicUrl, socialLinks } */
  var pending = {};
  var saveTimers = {};
  var widgetsSeen = {}; /* profileId -> signature of the widgets last loaded or saved */

  var MAX_QUOTES = 12;
  var MAX_QUOTE_TEXT = 400;
  var MAX_EMOJI = 24;
  var MAX_PINS = 40;
  var MAX_SWITCHES = 40;
  var KEY_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

  function client() {
    var c = root.CognationSupabase;
    return c && typeof c.configured === "function" && c.configured() ? c : null;
  }

  function num(v, d) {
    var n = typeof v === "number" ? v : parseFloat(v);
    return isFinite(n) ? n : d;
  }

  function cleanPublic(raw) {
    var src = raw && typeof raw === "object" ? raw : {};
    var links = {};
    var social = src.socialLinks && typeof src.socialLinks === "object" ? src.socialLinks : {};
    Object.keys(social).slice(0, 24).forEach(function (k) {
      var v = String(social[k] || "").trim().slice(0, 500);
      if (v) links[k] = v;
    });
    return {
      musicUrl: String(src.musicUrl || "").trim().slice(0, 500),
      socialLinks: links,
    };
  }

  function cleanPos(pos, zDefault) {
    if (!pos || typeof pos !== "object") return null;
    var x = num(pos.x, NaN);
    var y = num(pos.y, NaN);
    if (!isFinite(x) || !isFinite(y)) return null;
    return { x: x, y: y, z: num(pos.z, zDefault), tilt: num(pos.tilt, 0) };
  }

  function cleanPinMap(raw, zDefault) {
    var out = {};
    if (!raw || typeof raw !== "object") return out;
    Object.keys(raw).filter(function (k) { return KEY_RE.test(k); }).slice(0, MAX_PINS).forEach(function (k) {
      var pos = cleanPos(raw[k], zDefault);
      if (pos) out[k] = pos;
    });
    return out;
  }

  function cleanSwitches(raw) {
    var out = {};
    if (!raw || typeof raw !== "object") return out;
    Object.keys(raw).filter(function (k) { return KEY_RE.test(k); }).slice(0, MAX_SWITCHES).forEach(function (k) {
      out[k] = raw[k] !== false;
    });
    return out;
  }

  /** Added widgets + switches, capped: 12 quotes of 400 characters, 24 emoji, 40 pins. */
  function cleanWidgets(raw) {
    var src = raw && typeof raw === "object" ? raw : {};
    var quotes = [];
    (Array.isArray(src.quoteStickers) ? src.quoteStickers : []).forEach(function (q) {
      if (quotes.length >= MAX_QUOTES || !q || typeof q !== "object") return;
      var id = String(q.id || "");
      var text = String(q.text || "").trim().slice(0, MAX_QUOTE_TEXT);
      if (!KEY_RE.test(id) || !text) return;
      /* Same word check as the page (js/tower.js): a quote that fails it is
         never uploaded and never applied from a row. */
      var allowed = root.CognationTowerQuoteAllowed;
      if (typeof allowed === "function" && !allowed(text)) return;
      var entry = { id: id, text: text, x: num(q.x, 40), y: num(q.y, 40), z: num(q.z, 10), tilt: num(q.tilt, 0) };
      /* Offset from the canvas top in px (the canvas height differs by viewer). */
      if (typeof q.yPx === "number" && isFinite(q.yPx)) entry.yPx = Math.round(Math.max(0, Math.min(20000, q.yPx)));
      if (typeof q.w === "number" && isFinite(q.w) && q.w > 0) entry.w = Math.round(Math.max(80, Math.min(4000, q.w)));
      quotes.push(entry);
    });
    var emoji = [];
    (Array.isArray(src.emojiStickers) ? src.emojiStickers : []).forEach(function (e) {
      if (emoji.length >= MAX_EMOJI || !e || typeof e !== "object") return;
      var id = String(e.id || "");
      if (!KEY_RE.test(id)) return;
      var entry = { id: id };
      if (e.glyph) entry.glyph = String(e.glyph).slice(0, 16);
      if (e.size != null && isFinite(num(e.size, NaN))) entry.size = num(e.size, 0);
      emoji.push(entry);
    });
    return {
      quoteStickers: quotes,
      emojiStickers: emoji,
      friendPinLayout: cleanPinMap(src.friendPinLayout, 12),
      badgePinLayout: cleanPinMap(src.badgePinLayout, 14),
      publicWidgets: cleanSwitches(src.publicWidgets),
      badgeVisibility: cleanSwitches(src.badgeVisibility),
    };
  }

  /* What an add / remove / switch changes. Pin positions are left out: they
     change on drag end (a geometry save, which uploads anyway) and when the
     page fills in default pin spots, which must never upload on open. */
  function offKeys(map) {
    return Object.keys(map || {}).filter(function (k) { return map[k] === false; }).sort();
  }

  function widgetsSignature(p) {
    var w = cleanWidgets(p);
    return JSON.stringify({
      q: w.quoteStickers.map(function (q) { return [q.id, q.text]; }),
      e: w.emojiStickers.map(function (e) { return [e.id, e.size == null ? null : e.size]; }),
      /* Only the switches that are off: the page fills in "on" defaults and
         drops keys a face doesn't use (Pro has no music), which is not an edit. */
      pw: offKeys(w.publicWidgets),
      bv: offKeys(w.badgeVisibility),
    });
  }

  function clean(layout) {
    var out = {};
    if (!layout || typeof layout !== "object") return out;
    Object.keys(layout).slice(0, 80).forEach(function (id) {
      if (String(id).charAt(0) === "_") return;
      var pos = layout[id];
      if (!pos || typeof pos !== "object" || String(id).length > 64) return;
      var entry = { x: num(pos.x, 0), y: num(pos.y, 0), z: num(pos.z, 1), tilt: num(pos.tilt, 0) };
      /* Owner drops mark dragged:true. Dropping that flag made getWidgetLayout
         treat a real layout as never-dragged and fall back to the default spawn. */
      if (pos.dragged === true) entry.dragged = true;
      /* Stage-pixel y (stage height varies between loads; % drifted). */
      if (typeof pos.yPx === "number" && isFinite(pos.yPx)) entry.yPx = Math.round(Math.max(0, Math.min(20000, pos.yPx)));
      /* Width (px) a widget had on the grid when it was first frozen or dragged. */
      if (typeof pos.wPx === "number" && isFinite(pos.wPx) && pos.wPx > 0) entry.wPx = Math.round(Math.max(80, Math.min(4000, pos.wPx)));
      /* Grid look (lifted-player-no-cover): the grid layout width a lifted,
         untouched widget keeps its grid card look at. */
      if (typeof pos.gridLook === "number" && isFinite(pos.gridLook) && pos.gridLook > 0) entry.gridLook = Math.round(Math.max(80, Math.min(4000, pos.gridLook)));
      out[id] = entry;
    });
    if (layout._public && typeof layout._public === "object") {
      out._public = cleanPublic(layout._public);
    }
    if (layout._widgets && typeof layout._widgets === "object") {
      out._widgets = cleanWidgets(layout._widgets);
    }
    /* One-time compaction done (old layouts). */
    if (layout._compacted) out._compacted = 1;
    /* Grid drags (layout-drag-keeps-grid): { id: { dx, dy } } px nudges on the default grid. */
    var nudge = cleanGridNudge(layout._gridNudge);
    if (Object.keys(nudge).length) out._gridNudge = nudge;
    /* Grid resizes (layout-resize-reset): { id: { w } } px sizes on the default grid. */
    var size = cleanGridSize(layout._gridSize);
    if (Object.keys(size).length) out._gridSize = size;
    /* Grid Rotates (#329 v2): { id: { deg } } per-widget tilts on the default grid. */
    var tilt = cleanGridTilt(layout._gridTilt);
    if (Object.keys(tilt).length) out._gridTilt = tilt;
    /* The row's positions are the whole layout (every owner geometry save,
       Reset included). A widget missing from such a row has no saved spot,
       so an older local copy can't bring it back. */
    if (layout._full) out._full = 1;
    if (layout._backup && typeof layout._backup === "object") {
      var bk = cleanBackup(layout._backup);
      if (bk) out._backup = bk;
    }
    return out;
  }

  function cleanGridNudge(src) {
    var out = {};
    if (!src || typeof src !== "object") return out;
    Object.keys(src).slice(0, 60).forEach(function (id) {
      var v = src[id];
      if (!v || typeof v !== "object" || String(id).length > 64 || String(id).charAt(0) === "_") return;
      var dx = Math.round(Number(v.dx));
      var dy = Math.round(Number(v.dy));
      if (!isFinite(dx) || !isFinite(dy)) return;
      dx = Math.max(-4000, Math.min(4000, dx));
      dy = Math.max(-20000, Math.min(20000, dy));
      if (dx || dy) out[id] = { dx: dx, dy: dy };
    });
    return out;
  }

  function cleanGridSize(src) {
    var out = {};
    if (!src || typeof src !== "object") return out;
    Object.keys(src).slice(0, 60).forEach(function (id) {
      var v = src[id];
      if (!v || typeof v !== "object" || String(id).length > 64 || String(id).charAt(0) === "_") return;
      var w = Math.round(Number(v.w));
      if (!isFinite(w) || w <= 0) return;
      out[id] = { w: Math.max(80, Math.min(4000, w)) };
    });
    return out;
  }

  function cleanGridTilt(src) {
    var out = {};
    if (!src || typeof src !== "object") return out;
    Object.keys(src).slice(0, 60).forEach(function (id) {
      var v = src[id];
      if (!v || typeof v !== "object" || String(id).length > 64 || String(id).charAt(0) === "_") return;
      var n = Number(v.deg);
      if (!isFinite(n)) return;
      n = ((n % 360) + 360) % 360;
      if (n > 180) n -= 360;
      n = Math.round(n * 10) / 10;
      if (n) out[id] = { deg: n };
    });
    return out;
  }

  /* One prior copy of widget positions, saved before an automatic overlap repair
     rewrites them: { at: ISO time, layout: {...positions} }. Last copy only. */
  function cleanBackup(b) {
    if (!b || typeof b !== "object" || !b.layout || typeof b.layout !== "object") return null;
    var inner = Object.assign({}, b.layout);
    delete inner._public;
    delete inner._backup;
    delete inner._widgets;
    delete inner._full;
    var positions = clean(inner);
    if (!Object.keys(positions).length) return null;
    var at = String(b.at || "");
    return { at: isNaN(Date.parse(at)) ? new Date().toISOString() : new Date(at).toISOString(), layout: positions };
  }

  function profileId(p) {
    var id = p && (p._profileId || p.id);
    return id && UUID_RE.test(String(id)) ? String(id) : "";
  }

  function load(id) {
    var c = client();
    if (!c || pending[id]) return;
    pending[id] = true;
    c.rest("tower_widget_layouts", { query: "select=layout&profile_id=eq." + encodeURIComponent(id) })
      .then(function (rows) {
        var row = Array.isArray(rows) && rows[0] ? rows[0] : null;
        var cleaned = row ? clean(row.layout) : null;
        cache[id] = cleaned;
        publicCache[id] = cleaned && cleaned._public ? cleaned._public : null;
        if (row && root.document) {
          root.document.dispatchEvent(new root.CustomEvent("cognation:remote-profile-loaded", { detail: { profileId: id } }));
        }
      })
      .catch(function () {})
      .then(function () { pending[id] = false; });
  }

  function applyPublicToProfile(p, pub) {
    if (!p || !pub) return;
    if (pub.musicUrl && (!p.musicUrl || !String(p.musicUrl).trim())) {
      p.musicUrl = String(pub.musicUrl).trim();
    }
    if (pub.socialLinks && typeof pub.socialLinks === "object") {
      if (!p.socialLinks || typeof p.socialLinks !== "object") p.socialLinks = {};
      Object.keys(pub.socialLinks).forEach(function (k) {
        if (!p.socialLinks[k]) p.socialLinks[k] = pub.socialLinks[k];
      });
      if (typeof p.publicWidgets !== "object" || !p.publicWidgets) p.publicWidgets = {};
      var any = Object.keys(pub.socialLinks).some(function (k) { return !!pub.socialLinks[k]; });
      if (any) p.publicWidgets.social = true;
    }
  }

  function copy(v) {
    return JSON.parse(JSON.stringify(v));
  }

  /* The server row wins over the localStorage cache for added widgets and switches. */
  function applyWidgetsToProfile(p, w) {
    if (!p || !w) return;
    p.quoteStickers = copy(w.quoteStickers || []);
    p.emojiStickers = copy(w.emojiStickers || []);
    p.friendPinLayout = copy(w.friendPinLayout || {});
    p.badgePinLayout = copy(w.badgePinLayout || {});
    if (w.publicWidgets && Object.keys(w.publicWidgets).length) {
      if (!p.publicWidgets || typeof p.publicWidgets !== "object") p.publicWidgets = {};
      Object.keys(w.publicWidgets).forEach(function (k) { p.publicWidgets[k] = w.publicWidgets[k]; });
    }
    if (w.badgeVisibility && Object.keys(w.badgeVisibility).length) {
      p.badgeVisibility = copy(w.badgeVisibility);
    }
  }

  /** Called from the profile read path. Mutates p.widgetLayout when a DB row exists. */
  function apply(p) {
    var id = profileId(p);
    if (!id) return p;
    if (!Object.prototype.hasOwnProperty.call(cache, id)) {
      load(id);
      return p;
    }
    var saved = cache[id];
    if (saved && Object.keys(saved).length) {
      var base = p.widgetLayout && typeof p.widgetLayout === "object" ? p.widgetLayout : {};
      Object.keys(saved).forEach(function (wid) {
        if (wid === "_compacted") { base._compacted = 1; return; }
        if (wid === "_gridNudge" || wid === "_gridSize" || wid === "_gridTilt" || wid === "_full") return;
        if (wid === "_public" || wid === "_backup") return;
        var next = saved[wid];
        var prev = base[wid];
        /* Keep a local dragged mark when an older DB row predated that flag. */
        if (prev && prev.dragged === true && next && next.dragged !== true) {
          next = {
            x: next.x, y: next.y, z: next.z, tilt: next.tilt, dragged: true
          };
          if (typeof saved[wid].yPx === "number") next.yPx = saved[wid].yPx;
          if (typeof saved[wid].wPx === "number") next.wPx = saved[wid].wPx;
          if (typeof saved[wid].gridLook === "number") next.gridLook = saved[wid].gridLook;
        }
        base[wid] = next;
      });
      /* The row's grid nudges replace any local copy (none in the row = none). */
      if (saved._gridNudge) base._gridNudge = saved._gridNudge;
      else delete base._gridNudge;
      if (saved._gridSize) base._gridSize = saved._gridSize;
      else delete base._gridSize;
      if (saved._gridTilt) base._gridTilt = saved._gridTilt;
      else delete base._gridTilt;
      /* A full row (any owner geometry save, Reset included) is the whole
         layout: drop positions only a local copy still has. After Reset that
         is every position, so the page opens on the exact default grid. */
      if (saved._full) {
        Object.keys(base).forEach(function (wid) {
          if (String(wid).charAt(0) === "_") return;
          if (!Object.prototype.hasOwnProperty.call(saved, wid)) delete base[wid];
        });
      }
      p.widgetLayout = base;
    }
    if (saved && saved._widgets) applyWidgetsToProfile(p, saved._widgets);
    var pub = (saved && saved._public) || publicCache[id];
    if (pub) applyPublicToProfile(p, pub);
    widgetsSeen[id] = widgetsSignature(p);
    return p;
  }

  /* Writes go out only with a signed-in Supabase session (RLS also limits
     them to the profile's owner). Signed-out pages never try. */
  function signedIn(c) {
    try {
      var s = c && typeof c.getSession === "function" ? c.getSession() : null;
      return !!(s && s.access_token);
    } catch (e) {
      return false;
    }
  }

  function upsert(id, layout) {
    var c = client();
    if (!id || !c || !signedIn(c)) return false;
    cache[id] = layout;
    if (layout && layout._public) publicCache[id] = layout._public;
    root.clearTimeout(saveTimers[id]);
    saveTimers[id] = root.setTimeout(function () {
      c.rest("tower_widget_layouts", {
        method: "POST",
        query: "on_conflict=profile_id",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: { profile_id: id, layout: layout },
      }).catch(function () {});
    }, 600);
    return true;
  }

  /* The row save() would upload for p: positions, _public, _backup, _widgets. */
  function buildLayout(id, p) {
    /* No built-in positions yet (only an added Quote, say) still uploads. */
    var layout = clean(p.widgetLayout && typeof p.widgetLayout === "object" ? p.widgetLayout : {});
    delete layout._widgets;
    /* p's widgetLayout is the page's whole layout: mark the row as complete. */
    layout._full = 1;
    var prevPub = publicCache[id] || (cache[id] && cache[id]._public) || null;
    if (prevPub) layout._public = cleanPublic(prevPub);
    if (p.musicUrl || (p.socialLinks && typeof p.socialLinks === "object")) {
      layout._public = cleanPublic({
        musicUrl: p.musicUrl || (prevPub && prevPub.musicUrl) || "",
        socialLinks: Object.assign({}, (prevPub && prevPub.socialLinks) || {}, p.socialLinks || {}),
      });
    }
    /* Keep the last pre-repair copy (new one from the repair, else the saved one). */
    var bk = cleanBackup(p.layoutBackup) || (cache[id] && cache[id]._backup) || null;
    if (bk) layout._backup = bk;
    /* Added widgets go up even when no built-in widget has a position yet. */
    layout._widgets = cleanWidgets(p);
    return layout;
  }

  /** Called from the owner-only geometry save path (drag end, resize end, an
      owner add / remove, Reset). Debounced upsert. */
  function save(p) {
    var id = profileId(p);
    if (!id) return false;
    var ok = upsert(id, buildLayout(id, p));
    if (ok) widgetsSeen[id] = widgetsSignature(p);
    return ok;
  }

  /**
   * Load-time repair (overlap fix, one-time compaction, arrival-tilt cleanup):
   * keep the repaired layout in this page's memory so the Tower and the owner's
   * next drag see it, but never upload. The next explicit owner save (drag end,
   * resize end, add / remove, Save) uploads it with the owner's change.
   * Only after this profile's row has been read: staging first would hide the row.
   */
  function stage(p) {
    var id = profileId(p);
    if (!id || !Object.prototype.hasOwnProperty.call(cache, id)) return false;
    var layout = buildLayout(id, p);
    cache[id] = layout;
    if (layout._public) publicCache[id] = layout._public;
    return true;
  }

  /**
   * Owner add / remove / switch (not a drag). Uploads only when the widgets
   * differ from what was last loaded or saved for this profile, so opening the
   * Tower never posts. Positions come from the saved row, never the spawn grid.
   */
  function saveWidgetsIfChanged(p) {
    var id = profileId(p);
    if (!id) return false;
    var sig = widgetsSignature(p);
    if (!Object.prototype.hasOwnProperty.call(widgetsSeen, id)) {
      widgetsSeen[id] = sig;
      return false;
    }
    if (widgetsSeen[id] === sig) return false;
    /* Not loaded yet: never overwrite a row we have not read. */
    if (!Object.prototype.hasOwnProperty.call(cache, id)) {
      load(id);
      return false;
    }
    var base = clean(cache[id] && typeof cache[id] === "object" ? cache[id] : {});
    var prevPub = publicCache[id] || base._public || null;
    if (prevPub) base._public = cleanPublic(prevPub);
    base._widgets = cleanWidgets(p);
    var ok = upsert(id, base);
    if (ok) widgetsSeen[id] = sig;
    return ok;
  }

  /**
   * Persist Pro YouTube + social / Venmo / Pay / Buy ads to the server without
   * requiring a geometry edit. Fresh browsers and visitors read these via apply().
   */
  function savePublic(p) {
    var id = profileId(p);
    if (!id) return false;
    /* Not loaded yet: never overwrite a row we have not read. */
    if (!Object.prototype.hasOwnProperty.call(cache, id)) {
      load(id);
      return false;
    }
    var base = clean((cache[id] && typeof cache[id] === "object" ? cache[id] : null) || (p.widgetLayout && typeof p.widgetLayout === "object" ? p.widgetLayout : {}) || {});
    base._public = cleanPublic({
      musicUrl: p && p.musicUrl,
      socialLinks: p && p.socialLinks,
    });
    return upsert(id, base);
  }

  var api = {
    apply: apply,
    save: save,
    stage: stage,
    savePublic: savePublic,
    saveWidgetsIfChanged: saveWidgetsIfChanged,
    _cleanWidgets: cleanWidgets,
    _widgetsSignature: widgetsSignature,
    _widgetsSeen: widgetsSeen,
    _cache: cache,
    _publicCache: publicCache,
    _clean: clean,
    _cleanPublic: cleanPublic,
    _cleanBackup: cleanBackup,
  };
  root.CognationTowerLayoutSync = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);
