/**
 * CGN-010 — Live behavior on HTML Coder shell (no alternate markup).
 * Hooks: [data-go-live], [data-live-stage], [data-live-share-commune],
 * [data-live-share-tower], [data-live-comments], [data-live-comment-form],
 * [data-live-comment-list], [data-live-join-request], [data-live-approve-join],
 * [data-live-sales], [data-live-class], [data-live-cam-count], [data-live-status]
 */
(function () {
  "use strict";

  var LIVE_KEY = "cognation.live.session.v1";
  var COMMENTS_KEY = "cognation.live.comments.v1";
  var JOINS_KEY = "cognation.live.joins.v1";
  var MAX_CAM = 20;

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function writeJson(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }
  function sessionUser() {
    try {
      var raw = localStorage.getItem("cognation.session.demo.v1");
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.username) return String(s.username);
      }
    } catch (e) {}
    return "you";
  }
  function memberAge() {
    try {
      var p = readJson("cognation.member.profile.v1", null);
      if (p && p.age != null) return parseInt(p.age, 10) || 0;
    } catch (e) {}
    return 21;
  }
  function profileKind() {
    try {
      var raw = localStorage.getItem("cognation.session.demo.v1");
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.profileKind) return String(s.profileKind);
      }
    } catch (e) {}
    return "personal";
  }
  function getLive() {
    return readJson(LIVE_KEY, null);
  }
  function setLive(s) {
    if (!s) localStorage.removeItem(LIVE_KEY);
    else writeJson(LIVE_KEY, s);
  }
  function getComments(id) {
    var all = readJson(COMMENTS_KEY, {});
    return Array.isArray(all[id]) ? all[id] : [];
  }
  function pushComment(id, body) {
    var all = readJson(COMMENTS_KEY, {});
    if (!all[id]) all[id] = [];
    all[id].push({
      id: "lc-" + Date.now().toString(36),
      author: sessionUser(),
      body: String(body || "").trim().slice(0, 500),
      ts: new Date().toISOString(),
    });
    writeJson(COMMENTS_KEY, all);
    return all[id];
  }
  function getJoins(id) {
    var all = readJson(JOINS_KEY, {});
    return Array.isArray(all[id]) ? all[id] : [];
  }
  function setJoins(id, list) {
    var all = readJson(JOINS_KEY, {});
    all[id] = list;
    writeJson(JOINS_KEY, all);
  }

  function setStatus(stage, text) {
    var el = stage && stage.querySelector("[data-live-status]");
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = text;
  }

  function syncShareButtons(stage, live) {
    var c = stage.querySelector("[data-live-share-commune]");
    var t = stage.querySelector("[data-live-share-tower]");
    if (c) {
      c.setAttribute("aria-pressed", live && live.shareCommune ? "true" : "false");
      c.classList.toggle("is-selected", !!(live && live.shareCommune));
    }
    if (t) {
      t.setAttribute("aria-pressed", live && live.shareTower ? "true" : "false");
      t.classList.toggle("is-selected", !!(live && live.shareTower));
    }
  }

  function renderComments(stage, liveId) {
    var list = stage.querySelector("[data-live-comment-list]");
    if (!list) return;
    list.innerHTML = "";
    getComments(liveId).forEach(function (c) {
      var li = document.createElement("li");
      li.textContent = c.author + ": “" + c.body + "”";
      list.appendChild(li);
    });
  }

  function updateCamCount(stage, live) {
    var joins = getJoins(live.id);
    var approved = joins.filter(function (j) {
      return j.status === "approved";
    }).length;
    var cam = Math.min(MAX_CAM, 1 + approved);
    live.camCount = cam;
    setLive(live);
    var grid = stage.querySelector("[data-live-cam-count]");
    if (!grid) return;
    grid.setAttribute("data-live-cam-count", String(cam));
    var cells = grid.querySelectorAll("[data-live-cam]");
    cells.forEach(function (cell, i) {
      cell.hidden = i >= cam;
      cell.classList.toggle("is-on", i < cam);
    });
    for (var i = cells.length; i < cam && i < MAX_CAM; i++) {
      var d = document.createElement("div");
      d.className = "tower-live-cam is-on";
      d.setAttribute("data-live-cam", String(i + 1));
      d.textContent = "Cam " + (i + 1);
      grid.appendChild(d);
    }
  }

  function refresh(stage) {
    var live = getLive();
    var isPro = profileKind() === "professional";
    var sales = stage.querySelector("[data-live-sales]");
    var klass = stage.querySelector("[data-live-class]");
    if (sales) sales.hidden = !isPro;
    if (klass) klass.hidden = !isPro;
    if (!live || !live.active) {
      stage.removeAttribute("data-live-active");
      syncShareButtons(stage, { shareCommune: true, shareTower: true });
      return;
    }
    stage.setAttribute("data-live-active", "true");
    syncShareButtons(stage, live);
    renderComments(stage, live.id);
    updateCamCount(stage, live);
    setStatus(
      stage,
      "LIVE (stub) →" +
        (live.shareCommune ? " COMMUNE" : "") +
        (live.shareTower ? " Tower" : "") +
        " · cams " +
        (live.camCount || 1) +
        "/" +
        MAX_CAM
    );
  }

  function ensureLive(stage) {
    var live = getLive();
    if (live && live.active) return live;
    var shareCommune = true;
    var shareTower = true;
    var cBtn = stage.querySelector("[data-live-share-commune]");
    var tBtn = stage.querySelector("[data-live-share-tower]");
    if (cBtn && cBtn.getAttribute("aria-pressed") === "false") shareCommune = false;
    if (tBtn && tBtn.getAttribute("aria-pressed") === "false") shareTower = false;
    if (!shareCommune && !shareTower) {
      setStatus(stage, "Pick COMMUNE and/or Tower.");
      return null;
    }
    if (shareCommune && memberAge() < 18) {
      setStatus(
        stage,
        "Public COMMUNE live is 18+ only (demo age " + memberAge() + "). Unselect COMMUNE or use Tower only."
      );
      return null;
    }
    live = {
      id: "live-" + Date.now().toString(36),
      active: true,
      host: sessionUser(),
      shareCommune: shareCommune,
      shareTower: shareTower,
      startedAt: new Date().toISOString(),
      camCount: 1,
      sales: [],
      classOpen: false,
    };
    setLive(live);
    var all = readJson(COMMENTS_KEY, {});
    all[live.id] = [
      {
        id: "lc-seed",
        author: "system",
        body: "Live started (demo stub).",
        ts: live.startedAt,
      },
    ];
    writeJson(COMMENTS_KEY, all);
    setJoins(live.id, []);
    return live;
  }

  function initStage(stage) {
    if (!stage || stage.__cognationLiveBound) return;
    stage.__cognationLiveBound = true;

    /* Default share toggles pressed */
    var c0 = stage.querySelector("[data-live-share-commune]");
    var t0 = stage.querySelector("[data-live-share-tower]");
    if (c0 && !c0.hasAttribute("aria-pressed")) c0.setAttribute("aria-pressed", "true");
    if (t0 && !t0.hasAttribute("aria-pressed")) t0.setAttribute("aria-pressed", "true");

    stage.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !stage.contains(t)) return;

      var communeBtn = t.closest("[data-live-share-commune]");
      if (communeBtn) {
        ev.preventDefault();
        var on = communeBtn.getAttribute("aria-pressed") !== "true";
        communeBtn.setAttribute("aria-pressed", on ? "true" : "false");
        communeBtn.classList.toggle("is-selected", on);
        var live = getLive();
        if (live && live.active) {
          if (on && memberAge() < 18) {
            communeBtn.setAttribute("aria-pressed", "false");
            communeBtn.classList.remove("is-selected");
            setStatus(stage, "COMMUNE live requires age 18+.");
            return;
          }
          live.shareCommune = on;
          setLive(live);
        }
        setStatus(stage, on ? "COMMUNE share on." : "COMMUNE share off.");
        return;
      }

      var towerBtn = t.closest("[data-live-share-tower]");
      if (towerBtn) {
        ev.preventDefault();
        var onT = towerBtn.getAttribute("aria-pressed") !== "true";
        towerBtn.setAttribute("aria-pressed", onT ? "true" : "false");
        towerBtn.classList.toggle("is-selected", onT);
        var liveT = getLive();
        if (liveT && liveT.active) {
          liveT.shareTower = onT;
          setLive(liveT);
        }
        setStatus(stage, onT ? "Tower share on." : "Tower share off.");
        return;
      }

      if (t.closest("[data-live-approve-join]")) {
        ev.preventDefault();
        var live2 = ensureLive(stage);
        if (!live2) return;
        var joins2 = getJoins(live2.id);
        if (!joins2.some(function (j) { return j.status === "pending"; })) {
          joins2.push({
            id: "join-" + Date.now().toString(36),
            user: "viewer-demo",
            status: "pending",
          });
        }
        joins2.forEach(function (j) {
          if (j.status === "pending") j.status = "approved";
        });
        var approvedN = joins2.filter(function (j) {
          return j.status === "approved";
        }).length;
        if (1 + approvedN > MAX_CAM) {
          setStatus(stage, "Camera limit " + MAX_CAM + " (UI stub).");
          return;
        }
        setJoins(live2.id, joins2);
        var jr = stage.querySelector("[data-live-join-request]");
        if (jr) jr.setAttribute("data-join-approved", "true");
        updateCamCount(stage, live2);
        setStatus(stage, "Join approved (demo).");
        refresh(stage);
        return;
      }

      /* Request to join: click the join request region (not approve) */
      var joinRegion = t.closest("[data-live-join-request]");
      if (joinRegion && !t.closest("[data-live-approve-join]")) {
        /* Only treat as request when clicking non-approve controls inside */
        if (t.closest("button") && !t.closest("[data-live-approve-join]")) {
          /* fall through if it's another button */
        }
      }

      if (t.closest("[data-live-sales]")) {
        ev.preventDefault();
        var live3 = ensureLive(stage);
        if (!live3) return;
        if (!live3.sales) live3.sales = [];
        live3.sales.push({ title: "Flash offer $" + (9 + live3.sales.length) });
        setLive(live3);
        setStatus(stage, "Pro sale stub: " + live3.sales[live3.sales.length - 1].title);
        return;
      }

      if (t.closest("[data-live-class]")) {
        ev.preventDefault();
        var live4 = ensureLive(stage);
        if (!live4) return;
        live4.classOpen = !live4.classOpen;
        setLive(live4);
        setStatus(stage, live4.classOpen ? "Group class open (stub)." : "Class closed.");
        return;
      }
    });

    /* Double-click join region label area → request (avoid fighting Approve) */
    var joinWrap = stage.querySelector("[data-live-join-request]");
    if (joinWrap) {
      joinWrap.addEventListener("click", function (ev) {
        if (ev.target.closest("[data-live-approve-join]")) return;
        if (ev.target.closest("button")) return;
        ev.preventDefault();
        var live = ensureLive(stage);
        if (!live) return;
        var joins = getJoins(live.id);
        var me = sessionUser();
        if (!joins.some(function (j) { return j.user === me; })) {
          joins.push({
            id: "join-" + Date.now().toString(36),
            user: me,
            status: "pending",
          });
          setJoins(live.id, joins);
        }
        setStatus(stage, "Join requested — presenter can Approve.");
      });
    }

    var form = stage.querySelector("[data-live-comment-form]");
    if (form) {
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var live = ensureLive(stage);
        if (!live) return;
        var input = form.querySelector("input, textarea");
        var val = input && String(input.value || "").trim();
        if (!val) return;
        pushComment(live.id, val);
        input.value = "";
        renderComments(stage, live.id);
        setStatus(stage, "Comment posted (localStorage demo).");
      });
    }

    var grid = stage.querySelector("[data-live-cam-count]");
    if (grid) {
      var n = parseInt(grid.getAttribute("data-live-cam-count") || "0", 10);
      if (n > MAX_CAM) grid.setAttribute("data-live-cam-count", String(MAX_CAM));
    }

    refresh(stage);
  }

  function syncGoLiveButtons() {
    var live = getLive();
    var active = !!(live && live.active);
    document.querySelectorAll("[data-go-live]").forEach(function (btn) {
      btn.textContent = active ? "Offline" : "Go live";
      btn.setAttribute("aria-label", active ? "Offline" : "Go live");
    });
  }

  function goOffline() {
    var live = getLive();
    if (live) {
      live.active = false;
      setLive(live);
    }
    var root = document.querySelector("[data-tower-app]") || document;
    var stage = root.querySelector("[data-live-stage]");
    if (stage) {
      stage.hidden = true;
      stage.removeAttribute("data-live-active");
      refresh(stage);
    }
    syncGoLiveButtons();
  }

  function openLive() {
    var root = document.querySelector("[data-tower-app]") || document;
    var stage = root.querySelector("[data-live-stage]");
    if (!stage) return;
    stage.hidden = false;
    initStage(stage);
    var live = ensureLive(stage);
    refresh(stage);
    syncGoLiveButtons();
    if (!live) return;
    try {
      stage.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (e) {}
  }

  function init() {
    document.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest("[data-go-live]");
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      var live = getLive();
      if (live && live.active) goOffline();
      else openLive();
    });
    syncGoLiveButtons();
    var root = document.querySelector("[data-tower-app]") || document;
    var stage = root.querySelector("[data-live-stage]");
    if (stage && !stage.hidden) initStage(stage);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.CognationLive = {
    getSession: getLive,
    memberAge: memberAge,
    open: openLive,
  };
})();
