/**
 * Tower widget layout ⇄ Supabase (public.tower_widget_layouts, one row per profile).
 * Read: a saved DB row wins; no row → whatever the page already has (local copy,
 * else the default spawn layout). Write: the owner's next save upserts the layout,
 * which also moves an older localStorage-only layout into the DB.
 */
(function (root) {
  "use strict";

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var cache = {}; /* profileId -> layout object, or null when there is no row */
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

  function clean(layout) {
    var out = {};
    if (!layout || typeof layout !== "object") return out;
    Object.keys(layout).slice(0, 80).forEach(function (id) {
      var pos = layout[id];
      if (!pos || typeof pos !== "object" || String(id).length > 64) return;
      var entry = { x: num(pos.x, 0), y: num(pos.y, 0), z: num(pos.z, 1), tilt: num(pos.tilt, 0) };
      /* Owner drops mark dragged:true. Dropping that flag made getWidgetLayout
         treat a real layout as never-dragged and fall back to the default spawn. */
      if (pos.dragged === true) entry.dragged = true;
      out[id] = entry;
    });
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
        cache[id] = row ? clean(row.layout) : null;
        if (row && root.document) {
          root.document.dispatchEvent(new root.CustomEvent("cognation:remote-profile-loaded", { detail: { profileId: id } }));
        }
      })
      .catch(function () {})
      .then(function () { pending[id] = false; });
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
        var next = saved[wid];
        var prev = base[wid];
        /* Keep a local dragged mark when an older DB row predated that flag. */
        if (prev && prev.dragged === true && next && next.dragged !== true) {
          next = {
            x: next.x, y: next.y, z: next.z, tilt: next.tilt, dragged: true
          };
        }
        base[wid] = next;
      });
      p.widgetLayout = base;
    }
    return p;
  }

  /** Called from the owner-only save path. Debounced upsert. */
  function save(p) {
    var id = profileId(p);
    var c = client();
    if (!id || !c || !p.widgetLayout || typeof p.widgetLayout !== "object") return false;
    var layout = clean(p.widgetLayout);
    if (!Object.keys(layout).length) return false;
    cache[id] = layout;
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

  var api = { apply: apply, save: save, _cache: cache, _clean: clean };
  root.CognationTowerLayoutSync = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);
