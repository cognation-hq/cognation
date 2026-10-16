/**
 * Tower widget layout ⇄ Supabase (public.tower_widget_layouts, one row per profile).
 * Read: a saved DB row wins; no row → whatever the page already has (local copy,
 * else the default spawn layout). Write: the owner's next save upserts the layout,
 * which also moves an older localStorage-only layout into the DB.
 *
 * layout._public (optional): { musicUrl, socialLinks } — Pro YouTube + Venmo /
 * Pay for services / Buy ads / social URLs that must survive a fresh browser.
 * Keys starting with "_" are never treated as sticker coordinates.
 */
(function (root) {
  "use strict";

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var cache = {}; /* profileId -> layout object, or null when there is no row */
  var publicCache = {}; /* profileId -> { musicUrl, socialLinks } */
  var pending = {};
  var saveTimers = {};

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
      out[id] = entry;
    });
    if (layout._public && typeof layout._public === "object") {
      out._public = cleanPublic(layout._public);
    }
    /* One-time compaction done (old layouts). */
    if (layout._compacted) out._compacted = 1;
    return out;
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
        if (wid === "_public") return;
        var next = saved[wid];
        var prev = base[wid];
        /* Keep a local dragged mark when an older DB row predated that flag. */
        if (prev && prev.dragged === true && next && next.dragged !== true) {
          next = {
            x: next.x, y: next.y, z: next.z, tilt: next.tilt, dragged: true
          };
          if (typeof saved[wid].yPx === "number") next.yPx = saved[wid].yPx;
          if (typeof saved[wid].wPx === "number") next.wPx = saved[wid].wPx;
        }
        base[wid] = next;
      });
      p.widgetLayout = base;
    }
    var pub = (saved && saved._public) || publicCache[id];
    if (pub) applyPublicToProfile(p, pub);
    return p;
  }

  function upsert(id, layout) {
    var c = client();
    if (!id || !c) return false;
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

  /** Called from the owner-only geometry save path. Debounced upsert. */
  function save(p) {
    var id = profileId(p);
    if (!id || !p.widgetLayout || typeof p.widgetLayout !== "object") return false;
    var layout = clean(p.widgetLayout);
    var prevPub = publicCache[id] || (cache[id] && cache[id]._public) || null;
    if (prevPub) layout._public = cleanPublic(prevPub);
    if (p.musicUrl || (p.socialLinks && typeof p.socialLinks === "object")) {
      layout._public = cleanPublic({
        musicUrl: p.musicUrl || (prevPub && prevPub.musicUrl) || "",
        socialLinks: Object.assign({}, (prevPub && prevPub.socialLinks) || {}, p.socialLinks || {}),
      });
    }
    if (!Object.keys(layout).length) return false;
    return upsert(id, layout);
  }

  /**
   * Persist Pro YouTube + social / Venmo / Pay / Buy ads to the server without
   * requiring a geometry edit. Fresh browsers and visitors read these via apply().
   */
  function savePublic(p) {
    var id = profileId(p);
    if (!id) return false;
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
    savePublic: savePublic,
    _cache: cache,
    _publicCache: publicCache,
    _clean: clean,
    _cleanPublic: cleanPublic,
  };
  root.CognationTowerLayoutSync = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);
