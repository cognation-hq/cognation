/**
 * TOWER — profiles + connections; Feed compose lives under SIGNAL (demo / localStorage).
 * Local COMMUNE Front Page is generated from Tower posts.
 *
 * Storage: cognation.tower.posts.v3 · cognation.profiles.v1 (via CognationAccounts)
 * Legacy mirror: cognation.tower.profile.v1 (Personal)
 * Owner sides: sessionStorage cognation.tower.side = private|public
 * Dual profiles: Personal | Professional (max 2 per phone)
 * Public deep-link: #tower-profile-{handle}
 * Attachment kinds: photo | note | video | art | document
 * Calendar: one shared calendarEvents list for personal, professional, Tower, and Circle.
 *   · Public sticker is labeled Calendar on both profile pages.
 *   · The owner sees titles and notes. A visitor on either page sees busy blocks only.
 */
(function () {
  "use strict";

  var TOWER_KEY = "cognation.tower.posts.v3";
  var TOWER_PROFILE_KEY = "cognation.tower.profile.v1";
  var REACTION_CLEANUP_KEY = "cognation.tower.reaction-cleanup.v1";

  function remoteSocial() {
    return window.CognationSupabaseSocial || null;
  }

  function usingRemoteSocial() {
    var social = remoteSocial();
    return !!(social && social.active && social.active());
  }

  var AVATAR_FRAMES = {
    none: { label: "None", overlay: "" },
    "ornate-gold": { label: "Ornate gold oval", overlay: "assets/frames/ornate-gold-oval-cutout.png" },
    "baroque-magenta": { label: "Magenta baroque", overlay: "assets/frames/baroque-magenta-gold-cutout.png" },
    squiggly: { label: "Squiggly", overlay: "" },
    "gallery-gold": { label: "Gallery gold", overlay: "" },
    walnut: { label: "Walnut", overlay: "" },
    polaroid: { label: "Polaroid", overlay: "" },
    "matte-black": { label: "Matte black", overlay: "" },
    "cowboy-hat": { label: "Cowboy hat", overlay: "assets/frames/cowboy-hat-cutout.png" },
  };

  var FRAME_IDS = Object.keys(AVATAR_FRAMES);

  var COWBOY_HAT_COLORS = {
    tan: { label: "Tan" },
    black: { label: "Black" },
    white: { label: "White" },
    pink: { label: "Pink" },
    red: { label: "Red" },
    blue: { label: "Blue" },
    green: { label: "Green" },
    purple: { label: "Purple" },
    gold: { label: "Gold" },
  };
  var COWBOY_HAT_COLOR_IDS = Object.keys(COWBOY_HAT_COLORS);

  function normalizeCowboyHatColor(id) {
    id = String(id || "tan").toLowerCase();
    return COWBOY_HAT_COLOR_IDS.indexOf(id) >= 0 ? id : "tan";
  }


  var AVATAR_ORNAMENTS = {
    none: { label: "None", src: "" },
    "elegant-bow": { label: "Elegant bow", src: "assets/frames/ornament-elegant-bow-320.png" },
    bowtie: { label: "Bowtie", src: "assets/frames/ornament-bowtie-280.png" },
  };

  var ORNAMENT_IDS = Object.keys(AVATAR_ORNAMENTS);
  var ORNAMENT_POS_IDS = ["above", "below"];

  /* Default sticker positions (%) — approximate classic left-rail + feed */
  var DEFAULT_WIDGET_LAYOUT = {
    avatar: { x: 2, y: 3, z: 5, tilt: 0 },
    identity: { x: 2, y: 26, z: 4, tilt: 0 },
    slogan: { x: 22, y: 16, z: 4, tilt: 0 },
    social: { x: 2, y: 22, z: 4, tilt: 0 },
    music: { x: 2, y: 28, z: 6, tilt: 0 },
    youtube: { x: 2, y: 28, z: 6, tilt: 0 },
    badges: { x: 2, y: 38, z: 5, tilt: 0 },
    friends: { x: 2, y: 52, z: 4, tilt: 0 },
    html: { x: 22, y: 3, z: 3, tilt: 0 },
    calendar: { x: 55, y: 28, z: 5, tilt: 0 },
    "going-live": { x: 60, y: 74, z: 18, tilt: 0 },
    polaroid: { x: 40, y: 6, z: 6, tilt: 0 },
    instax: { x: 62, y: 4, z: 7, tilt: 0 },
    followers: { x: 2, y: 52, z: 4, tilt: 0 },
  };
  /* Default spawn spots (Designer spec, tower-default-layout). Saved layouts keep
     the free x/y % format; these rows only decide where an unplaced widget first
     appears. Rows are DOM/phone order; a row of two is left | right. */
  var SPAWN_GAP = 24;
  var SPAWN_ROWS = {
    /* LOOK v3.3: each social/link is its own widget. __socials__ expands to opted-in
       chips (pairs on desktop). No grouped LINKS box. */
    personal: [["avatar"], ["identity"], ["slogan"], ["visitor-calendar"], ["music"], ["friends"], ["__socials__"], ["badges", "calendar"], ["polaroid", "html"], ["instax"]],
    professional: [["avatar"], ["identity"], ["slogan"], ["visitor-calendar"], ["youtube"], ["__socials__"], ["badges"], ["followers", "calendar"], ["html"]],
  };
  /* Factory seeds that were never a user's choice. An entry equal to one of these
     is treated as unplaced, so old overlapping defaults get a real spawn spot. */
  var FACTORY_SEED_LAYOUTS = [
    { avatar: [2, 3], identity: [2, 26], slogan: [22, 16], social: [2, 22], music: [2, 28], youtube: [2, 28], badges: [2, 38], friends: [2, 52], followers: [2, 52], html: [22, 3], calendar: [55, 28], polaroid: [40, 6], instax: [62, 4] },
    { avatar: [4, 4], identity: [4, 26], slogan: [28, 18], social: [4, 26], music: [4, 34], badges: [4, 44], friends: [4, 56], html: [28, 4] },
    { identity: [4, 18] },
  ];
  /* Calendar card (visitors): its own widget, one full row directly under the bio
     card in every default layout (Personal and Professional). The owner's own
     Calendar stays in Edit profile; this card is hidden on the owner's view. It
     is never dragged or saved, so a saved layout never holds a spot for it. */
  var VISITOR_CALENDAR_ID = "visitor-calendar";
  var spawnCache = {};
  /* Avatar, name and slogan read as one profile card: a tight gap between them. */
  var PROFILE_STACK = { avatar: true, identity: true, slogan: true };
  var PROFILE_STACK_GAP = 4;
  var PHONE_MAX = 767;

  /* Phone (<768px): saved x/y is ignored; every visible widget stacks in spec order. */
  function isPhoneStage(stage) {
    var w = (stage && stage.clientWidth) || 0;
    var vw = (typeof window !== "undefined" && window.innerWidth) || 0;
    return (vw > 0 && vw <= PHONE_MAX) || (w > 0 && w <= PHONE_MAX);
  }

  function isFactorySeedPos(id, pos) {
    if (!pos || typeof pos !== "object") return true;
    for (var i = 0; i < FACTORY_SEED_LAYOUTS.length; i++) {
      var f = FACTORY_SEED_LAYOUTS[i][id];
      if (f && pos.x === f[0] && pos.y === f[1]) return true;
    }
    return false;
  }

  /* A widget the owner actually placed (dragged or frozen). */
  function isPlacedPos(layout, id) {
    return !!(layout && layout[id] && !isFactorySeedPos(id, layout[id]));
  }

  /* One Pro check for spawn rows AND the music gate. The music gate read only
     _profileKind while the spawn rows also read kind, so a Pro page whose
     _profileKind came back "personal" got Pro rows (no music slot) plus a
     visible MP3 parked at its old absolute spot on top of the grid. */
  function isProTower(p) {
    return !!(p && (p._profileKind === "professional" || p.kind === "professional"));
  }

  function socialWidgetId(netId) {
    return "social-" + String(netId || "");
  }

  /* Pro money links (Venmo, Pay for services, Buy ads): one card, stacked pills
     (Designer spec). Each link is still its own saved field; only the widget on
     the page is one group. Personal keeps Venmo as its own logo chip. */
  var PAY_LINKS_ID = "pay-links";
  var PAY_LINK_NETS = ["venmo", "services", "ads"];
  var PAGE_BUTTON_NETS = ["shop", "linktree", "applepay", "appleamt"];
  function isPayLinkNet(netId, p) {
    return isProTower(p) && PAY_LINK_NETS.indexOf(String(netId || "")) >= 0;
  }
  function isPageButtonNet(netId) {
    return PAGE_BUTTON_NETS.indexOf(String(netId || "")) >= 0;
  }

  function socialNetIdFromWidget(wid) {
    wid = String(wid || "");
    return wid.indexOf("social-") === 0 ? wid.slice("social-".length) : "";
  }

  /* Professional page shows the same logo chips as the personal profile
     (YouTube, X, and the rest), plus any link saved on the pro page itself. */
  function chipSocialLinks(p) {
    var own = (p && p.socialLinks && typeof p.socialLinks === "object") ? p.socialLinks : {};
    var pro = !!(p && (p._profileKind === "professional" || p.kind === "professional"));
    if (!pro) return own;
    var extra = null;
    try {
      var accounts = window.CognationAccounts;
      var id = p._profileId || "";
      var full = accounts && id && accounts.getProfileById ? accounts.getProfileById(id) : null;
      var user = (full && full.accountUsername) || "";
      if (!user && typeof getSessionObject === "function" && isTowerOwner(p)) {
        var session = getSessionObject();
        user = (session && session.username) || "";
      }
      if (accounts && user && accounts.getProfilesForUsername) {
        var list = accounts.getProfilesForUsername(user) || [];
        for (var i = 0; i < list.length; i++) {
          var rec = list[i];
          if (rec && rec.kind !== "professional" && rec.socialLinks) {
            extra = rec.socialLinks;
            break;
          }
        }
      }
    } catch (eChip) {}
    var out = {};
    socialLinkDefs().forEach(function (net) {
      var a = own[net.id] || "";
      var b = extra && extra[net.id] ? extra[net.id] : "";
      out[net.id] = a || b || "";
    });
    /* The YouTube video box (musicUrl) is the YouTube widget on Pro. It no
       longer also makes a YouTube logo chip: that copy could not be removed
       (it came back from musicUrl) and sat as a lone red logo under the video. */
    return out;
  }

  function optedInSocialNetIds(p) {
    var links = chipSocialLinks(p);
    var kind = (p && (p._profileKind || p.kind)) || "personal";
    var widgets = (p && p.publicWidgets) || {};
    var out = [];
    socialLinkDefs().forEach(function (net) {
      if (!socialNetAllowedForKind(net, kind)) return;
      if (!socialHref(net.id, links[net.id])) return;
      if (widgets[socialWidgetId(net.id)] === false) return;
      out.push(net.id);
    });
    return out;
  }

  function expandSpawnRows(rows, p) {
    var out = [];
    (rows || []).forEach(function (row) {
      if (row.length === 1 && row[0] === "__socials__") {
        var opted = optedInSocialNetIds(p);
        var pay = opted.filter(function (id) { return isPayLinkNet(id, p); });
        var ids = opted.filter(function (id) { return pay.indexOf(id) < 0 && !isPageButtonNet(id); }).map(socialWidgetId);
        var i;
        for (i = 0; i < ids.length; i += 2) {
          out.push(ids.slice(i, i + 2));
        }
        /* Venmo / Pay for services / Buy ads: one full-width card after the chips. */
        if (pay.length) out.push([PAY_LINKS_ID]);
        return;
      }
      out.push(row.slice());
    });
    return out;
  }

  function spawnRowsFor(p) {
    var base = isProTower(p) ? SPAWN_ROWS.professional : SPAWN_ROWS.personal;
    return expandSpawnRows(base, p);
  }

  function migrateGroupedSocialLayout(p) {
    if (!p || !p.widgetLayout || typeof p.widgetLayout !== "object") return;
    var old = p.widgetLayout.social;
    if (!old || typeof old !== "object") return;
    var first = optedInSocialNetIds(p)[0];
    if (first) {
      var wid = socialWidgetId(first);
      if (!p.widgetLayout[wid]) p.widgetLayout[wid] = old;
    }
    delete p.widgetLayout.social;
  }

  /* A saved layout from before the pay-links card: the card takes the spot of the
     first Venmo / Pay / Buy ads chip the owner placed. The old keys stay as they
     are (nothing is deleted), so no saved position is lost. */
  function seedPayLinksLayout(p) {
    if (!p || !isProTower(p) || !p.widgetLayout || typeof p.widgetLayout !== "object") return;
    var layout = p.widgetLayout;
    if (layout[PAY_LINKS_ID]) return;
    for (var i = 0; i < PAY_LINK_NETS.length; i++) {
      var old = layout[socialWidgetId(PAY_LINK_NETS[i])];
      if (old && typeof old === "object" && isPlacedPos(layout, socialWidgetId(PAY_LINK_NETS[i]))) {
        layout[PAY_LINKS_ID] = JSON.parse(JSON.stringify(old));
        return;
      }
    }
  }

  function rectsOverlap(a, b, gap) {
    return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
  }

  /* Pure packer (px). items: [{ row, id, w, h }] in spawn order; occupied: placed rects.
     Returns { id: { x, y } } plus bottom. Never touches occupied rects. */
  function packSpawn(rows, sizes, occupied, stageW, phone) {
    var pad = phone ? 16 : 24;
    var gap = SPAWN_GAP;
    var colW = phone ? stageW - pad * 2 : (stageW - pad * 2 - gap) / 2;
    var taken = occupied.slice();
    var out = {};
    var cursor = pad;
    var lastStackBottom = null;
    function freeY(x, y, w, h, stackMember) {
      var moved = true;
      while (moved) {
        moved = false;
        for (var i = 0; i < taken.length; i++) {
          var g = stackMember && taken[i].stack ? PROFILE_STACK_GAP : gap;
          if (rectsOverlap({ x: x, y: y, w: w, h: h }, taken[i], g - 0.5)) {
            y = taken[i].y + taken[i].h + g;
            moved = true;
          }
        }
      }
      return y;
    }
    rows.forEach(function (row) {
      var ids = row.filter(function (id) { return !!sizes[id]; });
      if (!ids.length) return;
      if (phone || row.length === 1) {
        ids.forEach(function (id) {
          var sz = sizes[id];
          var inStack = !!PROFILE_STACK[id];
          if (inStack && lastStackBottom !== null) cursor = lastStackBottom + PROFILE_STACK_GAP;
          var y = freeY(pad, cursor, Math.min(sz.w, phone ? colW : stageW - pad * 2), sz.h, inStack);
          out[id] = { x: pad, y: y };
          taken.push({ x: pad, y: y, w: sz.w, h: sz.h, stack: inStack });
          if (inStack) lastStackBottom = y + sz.h;
          cursor = y + sz.h + gap;
        });
        return;
      }
      /* Two small widgets share a row: left column, right column. */
      var slots = row.map(function (id, i) { return { id: id, x: pad + i * (colW + gap) }; }).filter(function (sl) { return !!sizes[sl.id]; });
      var y = cursor;
      var settled = false;
      while (!settled) {
        settled = true;
        slots.forEach(function (sl) {
          var sz = sizes[sl.id];
          var ny = freeY(sl.x, y, Math.min(sz.w, colW), sz.h);
          if (ny !== y) { y = ny; settled = false; }
        });
      }
      var bottom = y;
      slots.forEach(function (sl) {
        var sz = sizes[sl.id];
        out[sl.id] = { x: sl.x, y: y };
        taken.push({ x: sl.x, y: y, w: Math.min(sz.w, colW), h: sz.h });
        bottom = Math.max(bottom, y + sz.h);
      });
      cursor = bottom + gap;
    });
    var maxBottom = 0;
    taken.forEach(function (r) { maxBottom = Math.max(maxBottom, r.y + r.h); });
    out.__bottom = maxBottom + pad;
    out.__colW = colW;
    return out;
  }

  /* Place every visible, unplaced widget in its spawn spot (no overlap, 24px gap).
     Owner-placed widgets never move. Nothing is saved here. */
  function unwrapProfileStrip(stage) {
    if (!stage) return;
    stage.querySelectorAll("[data-tower-profile-strip]").forEach(function (strip) {
      var parent = strip.parentNode;
      if (!parent) return;
      while (strip.firstChild) parent.insertBefore(strip.firstChild, strip);
      parent.removeChild(strip);
    });
    stage.querySelectorAll(".tower-profile-strip-quote").forEach(function (q) {
      if (q.parentNode) q.parentNode.removeChild(q);
    });
  }

  /* v3.2/v3.3 hamburger strip: avatar | name/@handle/quote. */
  function ensureProfileStrip(stage, p) {
    if (!stage) return;
    unwrapProfileStrip(stage);
    var avatar = stage.querySelector('[data-tower-widget="avatar"]');
    var identity = stage.querySelector('[data-tower-widget="identity"]');
    var slogan = stage.querySelector('[data-tower-widget="slogan"]');
    if (!avatar || !identity) return;
    if (avatar.parentNode !== stage || identity.parentNode !== stage) return;
    var strip = document.createElement("div");
    strip.setAttribute("data-tower-profile-strip", "");
    stage.insertBefore(strip, avatar);
    strip.appendChild(avatar);
    strip.appendChild(identity);
    if (slogan && slogan.parentNode === stage) strip.appendChild(slogan);
    var quoteText = "";
    if (p && typeof p.slogan === "string") quoteText = String(p.slogan || "").trim();
    if (!quoteText && slogan) {
      var card = slogan.querySelector("[data-tower-slogan-display], .tower-slogan-card");
      quoteText = card ? String(card.textContent || "").trim() : "";
    }
    identity.querySelectorAll(".tower-profile-strip-quote").forEach(function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
    if (quoteText) {
      var q = document.createElement("blockquote");
      q.className = "tower-profile-strip-quote";
      q.textContent = quoteText;
      identity.appendChild(q);
    }
  }

  /* Name and the envelope stay in the profile card. A saved drag does not pull them out. */
  function placeMessageEnvelope(root) {
    var stack = root && root.querySelector(".tower-avatar-stack");
    var under = root && root.querySelector("[data-tower-under-photo]");
    var name = root && root.querySelector('[data-tower-widget="identity"]');
    var env = root && root.querySelector('[data-tower-widget="envelope"]');
    var handle = root && root.querySelector("[data-tower-handle-badge]");
    if (name && stack && !stack.contains(name)) {
      var actions = stack.querySelector(".tower-profile-actions");
      if (actions) stack.insertBefore(name, actions);
      else stack.appendChild(name);
    }
    if (handle) handle.hidden = true;
    if (!under || !env || env.classList.contains("is-dragging")) return;
    if (env.parentNode !== under) under.appendChild(env);
    env.classList.remove("is-placed");
  }

  function spawnUnplacedWidgets(root, p) {
    var stage = root && root.querySelector("[data-tower-scrapbook]");
    if (!stage || !stage.classList.contains("is-sticker-stage")) return;
    var stageW = stage.clientWidth || 0;
    if (!stageW) return;
    var phone = isPhoneStage(stage);
    stage.classList.toggle("is-phone-stack", phone);
    /* Phone ignores saved x/y entirely (it is the website's layout). */
    var layout = phone ? {} : getWidgetLayout(p) || {};
    var rows = spawnRowsFor(p).slice();
    var printListed = {};
    rows.forEach(function (r) { r.forEach(function (id) { printListed[id] = true; }); });
    stage.querySelectorAll("[data-tower-polaroid-extra]").forEach(function (el) {
      var wid = el.getAttribute("data-tower-widget");
      if (!wid || printListed[wid] || el.hidden || el.classList.contains("is-widget-off")) return;
      printListed[wid] = true;
      rows.push([wid]);
    });
    if (phone) {
      /* Widgets outside the spec order (emoji, quotes, extra prints) follow in DOM order. */
      var listed = {};
      rows.forEach(function (r) { r.forEach(function (id) { listed[id] = true; }); });
      stage.querySelectorAll("[data-tower-widget]").forEach(function (el) {
        var wid = el.getAttribute("data-tower-widget");
        if (el.parentNode !== stage || !wid || listed[wid] || wid === "feed" || wid === "messages" || wid === "going-live") return;
        listed[wid] = true;
        rows.push([wid]);
      });
    }
    var spawnIds = {};
    rows.forEach(function (r) { r.forEach(function (id) { spawnIds[id] = true; }); });
    /* Any owner-dragged (non-factory) spawn-row widget? If none — CSS grid, no absolute. */
    var anyPlaced = false;
    if (!phone) {
      Object.keys(spawnIds).forEach(function (id) {
        if (isPlacedPos(layout, id)) anyPlaced = true;
      });
    }
    var useGrid = phone || !anyPlaced;
    stage.classList.toggle("is-default-grid", useGrid);
    stage.classList.toggle("is-desktop-grid", useGrid && !phone);
    if (!useGrid) unwrapProfileStrip(stage);

    if (useGrid) {
      var ordered = [];
      var gridCache = {};
      rows.forEach(function (row) {
        row.forEach(function (id) {
          var el = stage.querySelector('[data-tower-widget="' + id + '"]');
          if (!el || el.parentNode !== stage || el.hidden || el.classList.contains("is-widget-off")) return;
          if (el.classList.contains("is-dragging")) return;
          if (id === VISITOR_CALENDAR_ID) el.style.removeProperty("--visitor-cal-w");
          if (id === "youtube") el.style.removeProperty("--yt-col-w");
          el.classList.add("is-spawned");
          el.classList.toggle("is-spawn-full", row.length === 1);
          el.classList.toggle("is-spawn-half", row.length > 1);
          el.style.removeProperty("--sticker-x");
          el.style.removeProperty("--sticker-y");
          el.style.removeProperty("--sticker-z");
          el.style.removeProperty("--sticker-tilt");
          el.style.removeProperty("--spawn-max-w");
          el.removeAttribute("data-sticker-x");
          el.removeAttribute("data-sticker-y");
          el.removeAttribute("data-sticker-z");
          ordered.push(el);
          gridCache[id] = { x: 0, y: 0, z: 2, tilt: 0 };
        });
      });
      /* Re-append only when the order changed: moving a node drops keyboard focus,
         so a re-render used to knock focus off any link in the grid (Tab to a pay
         link, and focus jumped back to the page). Same final order as before. */
      var kids = stage.children;
      var tailOk = kids.length >= ordered.length;
      for (var oi = 0; tailOk && oi < ordered.length; oi++) {
        if (kids[kids.length - ordered.length + oi] !== ordered[oi]) tailOk = false;
      }
      if (!tailOk) ordered.forEach(function (el) { stage.appendChild(el); });
      ensureProfileStrip(stage, p);
      /* Friend pins: in default grid they sit inside the Top Friends card flow via CSS;
         clear absolute spawn marks so they do not float over the grid. */
      stage.querySelectorAll("[data-tower-friend-pin].is-spawned").forEach(function (pin) {
        pin.classList.remove("is-spawned");
        pin.style.removeProperty("--friend-pin-w");
      });
      if (!(p && (p._profileKind === "professional" || p.kind === "professional"))) {
        var pinLayoutG = (p && p.friendPinLayout) || {};
        var pinIdsG = [];
        try { pinIdsG = resolveTopFriendIds(p); } catch (eG) { pinIdsG = []; }
        pinIdsG.forEach(function (fid, index) {
          var pin = stage.querySelector('[data-tower-friend-pin="' + fid + '"]');
          if (!pin || pin.hidden || pin.classList.contains("is-dragging")) return;
          if (!phone && !isDefaultFriendPinPos(p, index, pinLayoutG[fid])) return;
          pin.classList.add("is-spawned");
          pin.classList.add("is-grid-friend-pin");
          pin.style.removeProperty("--sticker-x");
          pin.style.removeProperty("--sticker-y");
        });
      }
      spawnCache = gridCache;
      stage.style.minHeight = "";
      placeMessageEnvelope(root);
      return;
    }

    /* Mixed: owner placed some widgets — pack unplaced around them (absolute %). */
    var sizes = {};
    var occupied = [];
    var colW = phone ? stageW - 32 : (stageW - 48 - SPAWN_GAP) / 2;
    var avatarEl = stage.querySelector('[data-tower-widget="avatar"]');
    var calSeat = null;
    stage.querySelectorAll("[data-tower-widget]").forEach(function (el) {
      if (el.parentNode !== stage || el.hidden || el.classList.contains("is-widget-off")) return;
      var id = el.getAttribute("data-tower-widget");
      el.classList.remove("is-spawn-full", "is-spawn-half", "is-grid-friend-pin");
      /* YouTube (#234/#235 width:100% + 16:9 inside): a free-layout card is
         absolutely placed and shrink-to-fit, so a % width collapsed it to its
         padding (21.5x16.8 live). Give it its column width; CSS reads this. */
      if (id === "youtube") el.style.setProperty("--yt-col-w", Math.floor(colW) + "px");
      if (id === VISITOR_CALENDAR_ID) {
        /* Same width as the bio card. When the bio card has a saved spot, seat
           the calendar right under it (below); otherwise it packs in its row. */
        el.classList.add("is-spawned");
        var aw = avatarEl && avatarEl.parentNode === stage && !avatarEl.hidden ? avatarEl.offsetWidth : 0;
        if (aw) el.style.setProperty("--visitor-cal-w", aw + "px");
        else el.style.removeProperty("--visitor-cal-w");
        el.style.setProperty("--spawn-max-w", Math.floor(aw || colW) + "px");
        if (aw && isPlacedPos(layout, "avatar")) calSeat = el;
        else sizes[id] = { w: el.offsetWidth || 0, h: el.offsetHeight || 0 };
        return;
      }
      if (spawnIds[id] && !isPlacedPos(layout, id) && !el.classList.contains("is-dragging")) {
        var full = rows.some(function (r) { return r.length === 1 && r[0] === id; });
        el.classList.add("is-spawned");
        el.style.setProperty("--spawn-max-w", Math.floor(full && !phone ? stageW - 48 : colW) + "px");
        sizes[id] = { w: el.offsetWidth || 0, h: el.offsetHeight || 0 };
        return;
      }
      el.classList.remove("is-spawned");
      /* Back from the phone stack (390px and back), the stack had cleared this
         placed widget's spot. Put its saved spot back before anything is packed
         or repaired around it, so the saved layout is what gets checked. */
      if (!el.hasAttribute("data-sticker-x") && layout[id] && isPlacedPos(layout, id)) {
        var back = layout[id];
        var bx = layoutCoord(back.x, 0);
        var by = stickerYFromLayout(back, stage.clientHeight || 0);
        el.style.setProperty("--sticker-x", bx + "%");
        el.style.setProperty("--sticker-y", by.css);
        el.style.setProperty("--sticker-z", String(layoutCoord(back.z, 2)));
        el.style.setProperty("--sticker-tilt", layoutCoord(back.tilt, 0) + "deg");
        el.setAttribute("data-sticker-x", String(bx));
        el.setAttribute("data-sticker-y", String(by.pct));
        el.setAttribute("data-sticker-z", String(layoutCoord(back.z, 2)));
        setStickerWidth(el, back.wPx);
      }
      occupied.push({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    });
    /* Top Friends on default spots: one evenly spaced row right below the MP3
       (24px gap). Owner-moved pins stay where they were saved. */
    var autoPins = [];
    if (!(p && (p._profileKind === "professional" || p.kind === "professional"))) {
      var pinLayout = (p && p.friendPinLayout) || {};
      var pinIds = [];
      try { pinIds = resolveTopFriendIds(p); } catch (e) { pinIds = []; }
      pinIds.forEach(function (fid, index) {
        var pin = stage.querySelector('[data-tower-friend-pin="' + fid + '"]');
        if (!pin || pin.hidden || pin.classList.contains("is-dragging")) return;
        if (!phone && !isDefaultFriendPinPos(p, index, pinLayout[fid])) {
          pin.classList.remove("is-spawned");
          pin.style.removeProperty("--friend-pin-w");
          occupied.push({ x: pin.offsetLeft, y: pin.offsetTop, w: pin.offsetWidth, h: pin.offsetHeight });
          return;
        }
        autoPins.push(pin);
      });
    }
    if (autoPins.length) {
      /* Same width for every default card (widest natural width), even 24px gaps. */
      var cardW = 0, pinH = 0;
      autoPins.forEach(function (pin) { pin.style.removeProperty("--friend-pin-w"); pin.classList.remove("is-spawned"); });
      autoPins.forEach(function (pin) { cardW = Math.max(cardW, pin.offsetWidth || 0); });
      autoPins.forEach(function (pin) { pin.style.setProperty("--friend-pin-w", Math.ceil(cardW) + "px"); pin.classList.add("is-spawned"); });
      autoPins.forEach(function (pin) { pinH = Math.max(pinH, pin.offsetHeight || 0); });
      var pinW = autoPins.length * Math.ceil(cardW);
      sizes.__friendpins = { w: pinW + (autoPins.length - 1) * SPAWN_GAP, h: pinH };
      var mi = -1;
      rows.forEach(function (r, i) { if (r.indexOf("music") >= 0) mi = i; });
      rows.splice(mi >= 0 ? mi + 1 : rows.length, 0, ["__friendpins"]);
    }
    var calPos = null;
    if (calSeat) {
      calPos = {
        x: avatarEl.offsetLeft,
        y: avatarEl.offsetTop + avatarEl.offsetHeight + SPAWN_GAP,
        w: calSeat.offsetWidth || 0,
        h: calSeat.offsetHeight || 0,
      };
      occupied.push({ x: calPos.x, y: calPos.y, w: calPos.w, h: calPos.h });
    }
    var placed = packSpawn(rows, sizes, occupied, stageW, phone);
    if (calPos) {
      placed[VISITOR_CALENDAR_ID] = { x: calPos.x, y: calPos.y };
      placed.__bottom = Math.max(placed.__bottom, calPos.y + calPos.h + (phone ? 16 : 24));
    }
    var stageH = Math.max(stage.clientHeight || 0, placed.__bottom);
    if (placed.__bottom > (stage.clientHeight || 0)) stage.style.minHeight = Math.ceil(placed.__bottom) + "px";
    spawnCache = {};
    if (autoPins.length && placed.__friendpins) {
      var px = placed.__friendpins.x;
      autoPins.forEach(function (pin, i) {
        if (i) px += Math.ceil(cardW) + SPAWN_GAP; /* equal cards, even 24px gaps */
        applyFriendPinPosition(pin, {
          x: Math.round((px / stageW) * 10000) / 100,
          y: Math.round((placed.__friendpins.y / stageH) * 10000) / 100,
          z: 12 + i,
          tilt: 0,
        });
        pin.classList.add("is-spawned");
      });
    }
    Object.keys(placed).forEach(function (id) {
      if (id.indexOf("__") === 0) return;
      var el = stage.querySelector('[data-tower-widget="' + id + '"]');
      if (!el) return;
      var x = Math.round((placed[id].x / stageW) * 1000) / 10;
      var y = Math.round((placed[id].y / stageH) * 1000) / 10;
      spawnCache[id] = { x: x, y: y, z: 2, tilt: 0 };
      el.style.setProperty("--sticker-x", x + "%");
      el.style.setProperty("--sticker-y", y + "%");
      el.style.setProperty("--sticker-z", "2");
      el.style.setProperty("--sticker-tilt", "0deg");
      el.setAttribute("data-sticker-x", String(x));
      el.setAttribute("data-sticker-y", String(y));
      el.setAttribute("data-sticker-z", "2");
    });
    placeMessageEnvelope(root);
    repairLayoutOverlaps(stage, p, layout, spawnIds);
  }

  /* Load-time layout repair (live check r143). A saved free layout can come back
     overlapping: an old layout saved before the spawn lock, a viewport change
     (390px and back) where a widget is now taller or wider than when it was
     saved, or an invalid spot (off the card, NaN, negative). After every desktop
     layout pass, measure the real boxes; widgets that do not collide stay put.
     Each colliding (or invalid) widget moves to the nearest free spot below its
     old one, at the same x when it fits. Owner-dragged widgets are seated first so
     they keep their spot. The repaired layout is saved once (geometry save) for
     the owner; nothing is deleted, only x/y/yPx of the moved widgets change. */
  var repairSavedSig = {};
  function boxesOverlap(a, b) {
    var ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    var iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return ix > 2 && iy > 2;
  }
  function planLayoutRepair(items, stageW, gap, opts) {
    opts = opts || {};
    /* items: [{id, x, y, w, h, dragged}] in stage px. Returns {id: {x, y}} for moved ones. */
    var order = items.slice().sort(function (a, b) {
      if (!!a.dragged !== !!b.dragged) return a.dragged ? -1 : 1;
      return a.y - b.y || a.x - b.x;
    });
    var fixed = [];
    var moves = {};
    /* Identity row first (PM, #146): avatar card and name card sit side by side
       at the top, at a valid spot, and are never pushed down. Everything else is
       repaired around them, moving down only. */
    var rowIds = ["avatar", "identity"];
    var rowItems = rowIds.map(function (rid) {
      return items.filter(function (it) { return it.id === rid; })[0];
    }).filter(Boolean);
    if (rowItems.length) {
      var rx = rowItems[0].x;
      if (!isFinite(rx) || rx < 0) rx = 0;
      rowItems.forEach(function (it) {
        var bx = Math.max(0, Math.min(Math.max(0, stageW - it.w), rx));
        var box = { x: bx, y: gap, w: it.w, h: it.h };
        if (box.x !== it.x || box.y !== it.y) moves[it.id] = { x: box.x, y: box.y };
        fixed.push(box);
        rx = bx + it.w + 12;
      });
      order = order.filter(function (it) { return rowIds.indexOf(it.id) < 0; });
    }
    order.forEach(function (it) {
      var box = { x: it.x, y: it.y, w: it.w, h: it.h };
      var invalid = false;
      if (!isFinite(box.x) || !isFinite(box.y)) { box.x = isFinite(box.x) ? box.x : 0; box.y = isFinite(box.y) ? box.y : 0; invalid = true; }
      var maxX = Math.max(0, stageW - box.w);
      if (box.x < 0 || box.x > maxX) { box.x = Math.max(0, Math.min(maxX, box.x)); invalid = true; }
      if (box.y < 0) { box.y = 0; invalid = true; }
      var hit = fixed.some(function (f) { return boxesOverlap(box, f); });
      if (hit) {
        /* Candidate rows: under each seated widget, nearest first, never above the old spot. */
        var ys = fixed.map(function (f) { return f.y + f.h + gap; }).filter(function (y) { return y >= box.y; });
        ys.sort(function (a, b) { return a - b; });
        for (var i = 0; i < ys.length; i++) {
          var cand = { x: box.x, y: ys[i], w: box.w, h: box.h };
          if (!fixed.some(function (f) { return boxesOverlap(cand, f); })) { box.y = ys[i]; break; }
        }
      }
      if (hit || invalid) moves[it.id] = { x: box.x, y: box.y };
      box.id = it.id;
      box.dragged = !!it.dragged;
      fixed.push(box);
    });
    /* Second pass (r146): compact upward. A widget with a big empty band above it
       (more than COMPACT_MIN_GAP px, e.g. YouTube parked far down on an old saved
       layout) moves up to the nearest free spot; the identity row stays pinned.
       The YouTube logo is its own widget and is never seated on the video window.
       Smaller gaps are kept, and owner-dragged widgets never move up, so a spot
       the owner chose is not touched. */
    var rowCount = rowItems.length;
    var seated = fixed.slice(0, rowCount);
    var rest = fixed.slice(rowCount).sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    /* One-time compaction of an old layout (no _compacted mark yet): every widget
       in those rows carries an owner-dragged mark, so the marks are ignored on
       this pass only. The identity row stays pinned (seated above). */
    if (opts.ignoreDragged) rest.forEach(function (b) { b.dragged = false; });
    function freeAt(cand) {
      return !seated.some(function (f) { return boxesOverlap(cand, f); });
    }
    function seat(b) {
      var startY = b.y;
      if (!b.dragged) {
        var ups = [gap].concat(seated.map(function (f) { return f.y + f.h + gap; }))
          .filter(function (y) { return y < b.y; })
          .sort(function (m, n) { return m - n; });
        for (var u = 0; u < ups.length; u++) {
          if (startY - ups[u] <= COMPACT_MIN_GAP) break;
          var cu = { x: b.x, y: ups[u], w: b.w, h: b.h };
          if (freeAt(cu)) { b.y = ups[u]; break; }
        }
      }
      if (!freeAt(b)) {
        var lowest = 0;
        seated.forEach(function (f) { lowest = Math.max(lowest, f.y + f.h + gap); });
        b.y = lowest;
      }
      seated.push(b);
      if (b.y !== startY) {
        var m0 = moves[b.id];
        moves[b.id] = { x: m0 ? m0.x : b.x, y: b.y };
      }
    }
    rest.forEach(function (b) { seat(b); });
    return moves;
  }
  var COMPACT_MIN_GAP = 160;
  function repairLayoutOverlaps(stage, p, layout, spawnIds) {
    if (!stage || isPhoneStage(stage) || stage.classList.contains("is-default-grid")) return false;
    var stageW = stage.clientWidth || 0;
    if (!stageW) return false;
    var items = [];
    stage.querySelectorAll("[data-tower-widget]").forEach(function (el) {
      var id = el.getAttribute("data-tower-widget");
      if (!id || el.parentNode !== stage || el.hidden || el.classList.contains("is-widget-off")) return;
      if (el.classList.contains("is-dragging") || !spawnIds[id]) return;
      if (!el.offsetWidth || !el.offsetHeight) return;
      items.push({ id: id, el: el, x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, dragged: !!(layout && layout[id] && layout[id].dragged === true) });
    });
    /* One-time pass: an owner layout saved before compaction existed. */
    var owner = !!(p && layout && isTowerOwner(p) && !p._loading);
    var oneTime = owner && !layout._compacted;
    var ytEl = stage.querySelector('[data-tower-widget="youtube"]');
    var ytReady = !ytEl || items.some(function (it) { return it.id === "youtube"; });
    var planned = planLayoutRepair(items, stageW, SPAWN_GAP, { ignoreDragged: oneTime && ytReady });
    /* Keep only real moves (more than 1px) so a stable layout is never re-saved. */
    var moves = {};
    items.forEach(function (it) {
      var mv = planned[it.id];
      if (mv && (Math.abs(mv.x - it.x) >= 1 || Math.abs(mv.y - it.y) >= 1)) moves[it.id] = mv;
    });
    var ids = Object.keys(moves);
    /* Mark the layout once the one-time pass has run (with YouTube on screen), so
       later owner drags are respected again. Saved even when nothing moved. */
    var markNow = oneTime && ytReady;
    /* Prior positions (#151 _backup), captured before the repair or the _compacted
       mark rewrites the layout in place. */
    var priorLayout = null;
    if (ids.length) {
      try { priorLayout = layout ? JSON.parse(JSON.stringify(layout)) : null; } catch (eBk) { priorLayout = null; }
    }
    if (markNow) layout._compacted = 1;
    if (!ids.length) {
      if (markNow) {
        p.widgetLayout = layout;
        setTimeout(function () { try { TowerProfileStore.save(p, { geometry: true }); } catch (eMk) {} }, 0);
      }
      return false;
    }
    var bottom = 0;
    items.forEach(function (it) {
      var m = moves[it.id];
      bottom = Math.max(bottom, (m ? m.y : it.y) + it.h);
    });
    if (bottom + SPAWN_GAP > (stage.clientHeight || 0)) stage.style.minHeight = Math.ceil(bottom + SPAWN_GAP) + "px";
    var stageH = Math.max(stage.clientHeight || 0, bottom + SPAWN_GAP);
    var lay = layout || {};
    items.forEach(function (it) {
      var m = moves[it.id];
      if (!m) return;
      var x = Math.round((m.x / stageW) * 1000) / 10;
      var y = Math.round((m.y / stageH) * 1000) / 10;
      it.el.style.setProperty("--sticker-x", x + "%");
      it.el.style.setProperty("--sticker-y", Math.round(m.y) + "px");
      it.el.setAttribute("data-sticker-x", String(x));
      it.el.setAttribute("data-sticker-y", String(y));
      var prev = lay[it.id] && typeof lay[it.id] === "object" ? lay[it.id] : null;
      if (prev && isPlacedPos(lay, it.id)) {
        prev.x = x;
        prev.y = y;
        prev.yPx = Math.round(m.y);
      } else {
        spawnCache[it.id] = { x: x, y: y, z: 2, tilt: 0 };
      }
    });
    /* Save once per profile + repaired result, and only for the owner. */
    if (p && layout && isTowerOwner(p) && !p._loading) {
      var sig = String(p._profileId || "") + "|" + (markNow ? "c1|" : "") + ids.sort().map(function (id) {
        return id + ":" + (lay[id] ? lay[id].x + "," + lay[id].yPx : "spawn");
      }).join(";");
      var pid = String(p._profileId || "");
      if (repairSavedSig[pid] !== sig) {
        repairSavedSig[pid] = sig;
        /* Owner only: keep the last pre-repair copy on the profile (layout JSON
           _backup in tower_widget_layouts; no SQL). Overwrites the previous copy. */
        if (priorLayout && Object.keys(priorLayout).length) {
          var priorPositions = {};
          Object.keys(priorLayout).forEach(function (k) { if (k !== "_backup") priorPositions[k] = priorLayout[k]; });
          p.layoutBackup = { at: new Date().toISOString(), layout: priorPositions };
        }
        p.widgetLayout = lay;
        setTimeout(function () {
          try { TowerProfileStore.save(p, { geometry: true }); } catch (eRep) {}
        }, 0);
      }
    }
    return true;
  }

  /* Saved spot if the owner placed it, else the current spawn spot, else the old default. */
  function widgetPos(p, id) {
    var layout = getWidgetLayout(p);
    if (isPlacedPos(layout, id)) return layout[id];
    return spawnCache[id] || DEFAULT_WIDGET_LAYOUT[id];
  }

  /* Drag out of the default CSS grid (#117). The grid has no x/y, so before any
     owner drag (or freeze/save) pin every grid widget at its rendered spot as
     free x/y %, then drop the grid classes. Without this a drag cannot move the
     widget and the freeze saves every widget at 0,0 (3rd drag break). */
  /* Widget y is saved in stage pixels (yPx) as well as %. The stage height
     changes between loads (min-height grows with spawned widgets), so a % of a
     different height drifted the widget down on every reload. x is a % of the
     stage width, which does not change, so x stays a %. */
  function stickerYFromLayout(pos, stageH) {
    var h = stageH > 0 ? stageH : 0;
    if (pos && typeof pos.yPx === "number" && isFinite(pos.yPx) && h) {
      return { css: Math.round(pos.yPx) + "px", pct: Math.round((pos.yPx / h) * 1000) / 10 };
    }
    var y = pos && typeof pos.y === "number" ? pos.y : parseFloat(pos && pos.y);
    if (isNaN(y)) y = 0;
    return { css: y + "%", pct: y };
  }

  function stickerYPxFromDrop(pct, stageH) {
    return stageH > 0 ? Math.round((pct / 100) * stageH) : null;
  }

  function liftDefaultGrid(stage) {
    if (!stage || !stage.classList || !stage.classList.contains("is-default-grid")) return false;
    if (isPhoneStage(stage)) return false;
    var sr = stage.getBoundingClientRect();
    var w = sr.width || stage.clientWidth || 1;
    var h = sr.height || stage.clientHeight || 1;
    var spots = [];
    stage.querySelectorAll("[data-tower-widget]").forEach(function (el) {
      if (el.parentNode !== stage || el.hidden || el.classList.contains("is-widget-off")) return;
      if (isAddedSticker(el)) return;
      var r = el.getBoundingClientRect();
      spots.push({ el: el, left: r.left - sr.left, top: r.top - sr.top, w: r.width, half: el.classList.contains("is-spawn-half") });
    });
    /* Profile strip (avatar | name/@handle/quote) is one grid row. Freeze its
       members too, in the same top row, so the first drag on a fresh page never
       sends the profile card below the other widgets (spawn lock, LOOK v3). */
    var strip = typeof stage.querySelector === "function" ? stage.querySelector("[data-tower-profile-strip]") : null;
    var stripMembers = [];
    var stripTop = 0;
    var stripBottom = 0;
    var stripLeft = 0;
    if (strip && strip.parentNode === stage) {
      var str = strip.getBoundingClientRect();
      stripTop = str.top - sr.top;
      stripBottom = str.bottom - sr.top;
      stripLeft = str.left - sr.left;
      Array.prototype.forEach.call(strip.querySelectorAll(":scope > [data-tower-widget]"), function (el) {
        if (!el.hidden && !el.classList.contains("is-widget-off")) stripMembers.push(el);
      });
      unwrapProfileStrip(stage);
    }
    stage.classList.remove("is-default-grid", "is-desktop-grid");
    /* Out of the strip the members take their sticker size; lay them in one row
       from the strip's left edge and push everything below down by the extra height. */
    var cursorX = stripLeft;
    var rowH = 0;
    stripMembers.forEach(function (el) {
      el.classList.remove("is-spawn-full", "is-spawn-half");
      el.style.removeProperty("--spawn-max-w");
      var mw = el.offsetWidth || 0;
      var mh = el.offsetHeight || 0;
      spots.push({ el: el, left: cursorX, top: stripTop, w: mw });
      cursorX += mw + 12;
      rowH = Math.max(rowH, mh);
    });
    var delta = stripMembers.length ? Math.max(0, stripTop + rowH + SPAWN_GAP - stripBottom) : 0;
    if (delta) {
      spots.forEach(function (sp) {
        if (stripMembers.indexOf(sp.el) < 0 && sp.top >= stripBottom - 1) sp.top += delta;
      });
    }
    h += delta;
    stage.style.minHeight = Math.ceil(h) + "px";
    spots.forEach(function (sp) {
      var el = sp.el;
      sp.x = Math.round((sp.left / w) * 1000) / 10;
      sp.y = Math.round((sp.top / h) * 1000) / 10;
      el.classList.remove("is-spawn-full", "is-spawn-half");
      if (sp.w && stripMembers.indexOf(el) < 0) {
        el.style.setProperty("--spawn-max-w", Math.ceil(sp.w) + "px");
        /* Half-row widgets keep their column width. Full rows (YouTube, Music)
           were height-capped by the grid, so they return to their own size. */
        if (sp.half) setStickerWidth(el, sp.w);
      }
      el.classList.add("is-spawned");
      el.style.setProperty("--sticker-x", sp.x + "%");
      el.style.setProperty("--sticker-y", sp.y + "%");
      el.style.setProperty("--sticker-z", el.getAttribute("data-sticker-z") || "2");
      el.style.setProperty("--sticker-tilt", "0deg");
      el.setAttribute("data-sticker-x", String(sp.x));
      el.setAttribute("data-sticker-y", String(sp.y));
      if (!el.getAttribute("data-sticker-z")) el.setAttribute("data-sticker-z", "2");
      spawnCache[el.getAttribute("data-tower-widget")] = { x: sp.x, y: sp.y, z: 2, tilt: 0 };
    });
    return true;
  }

  /* A widget keeps the width it had on the grid once it is frozen or dragged,
     so a drag never shrinks it to its text width (big empty area on the right). */
  function setStickerWidth(el, w) {
    if (!el || !el.style) return;
    var n = Math.round(parseFloat(w));
    var wid = el.getAttribute ? el.getAttribute("data-tower-widget") : "";
    if (n > 0 && RESIZE_LIMITS[wid]) n = clampResizeWidth(wid, n);
    if (n > 0) {
      el.style.setProperty("--sticker-w", n + "px");
      el.setAttribute("data-sticker-w", String(n));
    } else {
      el.style.removeProperty("--sticker-w");
      el.removeAttribute("data-sticker-w");
    }
    /* The MP3 player is a fixed-size drawing: scale it to the chosen width. */
    if (wid === "music") {
      if (n > 0) el.style.setProperty("--music-zoom", String(Math.round((n / MUSIC_BASE_W) * 1000) / 1000));
      else el.style.removeProperty("--music-zoom");
    }
  }

  /* Resize limits (px). Calendar keeps a minimum readable size (7 day columns
     stay legible at 260px). */
  var MUSIC_BASE_W = 316;
  var RESIZE_LIMITS = {
    music: { min: 200, max: 520 },
    calendar: { min: 260, max: 760 },
    quote: { min: 140, max: 560 },
  };
  function clampResizeWidth(wid, w) {
    var lim = RESIZE_LIMITS[wid];
    if (!lim) return w;
    return Math.max(lim.min, Math.min(lim.max, Math.round(w)));
  }

  function ensureResizeHandle(el, label) {
    if (!el || el.querySelector(":scope > [data-tower-widget-resize]")) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "tower-widget-resize";
    b.setAttribute("data-tower-widget-resize", "");
    b.setAttribute("aria-label", "Resize " + (label || "widget"));
    b.tabIndex = -1;
    b.textContent = "◢";
    el.appendChild(b);
  }

  /* Owner-only resize for MP3 (Personal), Calendar and quote stickers. Width is
     saved as wPx (layout row) or quote.w, so it survives reload. */
  function initWidgetResize(root) {
    var stage = root && root.querySelector("[data-tower-scrapbook]");
    if (!stage || stage.__cognationWidgetResize) return;
    stage.__cognationWidgetResize = true;
    stage.addEventListener("pointerdown", function (ev) {
      var grip = ev.target && ev.target.closest && ev.target.closest("[data-tower-widget-resize]");
      if (!grip || !stage.contains(grip)) return;
      var sticker = grip.closest("[data-tower-widget]");
      if (!sticker) return;
      var p0 = TowerProfileStore.get();
      if (!isTowerOwner(p0) || root.getAttribute("data-tower-side") !== "public") return;
      if (isPhoneStage(stage)) return;
      ev.preventDefault();
      ev.stopPropagation();
      var wid = sticker.getAttribute("data-tower-widget");
      if (wid !== "quote") liftDefaultGrid(stage);
      var startX = ev.clientX;
      var startW = sticker.offsetWidth || 0;
      var curW = startW;
      sticker.classList.add("is-resizing");
      function onMove(e) {
        curW = clampResizeWidth(wid, startW + (e.clientX - startX));
        setStickerWidth(sticker, curW);
        if (e.cancelable) e.preventDefault();
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        sticker.classList.remove("is-resizing");
        var p = TowerProfileStore.get();
        if (wid === "quote") {
          var qid = sticker.getAttribute("data-tower-quote-id");
          p.quoteStickers = getQuoteStickers(p).map(function (q) {
            if (!q || q.id !== qid) return q;
            var nq = {};
            Object.keys(q).forEach(function (k) { nq[k] = q[k]; });
            nq.w = curW;
            return nq;
          });
          TowerProfileStore.save(p, { geometry: true });
          return;
        }
        var layout = getWidgetLayout(p) || {};
        freezeSpawnedWidgets(root, layout);
        sticker.classList.remove("is-spawned");
        var cur = layout[wid] && typeof layout[wid] === "object" ? layout[wid] : {};
        layout[wid] = {
          x: typeof cur.x === "number" ? cur.x : parseFloat(sticker.getAttribute("data-sticker-x") || "0"),
          y: typeof cur.y === "number" ? cur.y : parseFloat(sticker.getAttribute("data-sticker-y") || "0"),
          z: typeof cur.z === "number" ? cur.z : parseInt(sticker.getAttribute("data-sticker-z") || "2", 10),
          tilt: typeof cur.tilt === "number" ? cur.tilt : 0,
          dragged: true,
          wPx: curW,
        };
        if (typeof cur.yPx === "number") layout[wid].yPx = cur.yPx;
        else if (typeof sticker.offsetTop === "number") layout[wid].yPx = Math.round(sticker.offsetTop);
        p.widgetLayout = layout;
        TowerProfileStore.save(p, { geometry: true });
        try {
          var spawnIdsR = {};
          spawnRowsFor(p).forEach(function (r) { r.forEach(function (w) { spawnIdsR[w] = true; }); });
          repairLayoutOverlaps(stage, p, getWidgetLayout(p), spawnIdsR);
        } catch (eRz) {}
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }

  /* MP3 is Personal only. On Pro the music widget is not just hidden: its layout
     spot and its show/hide switch are dropped from the profile and never saved. */
  function stripProMusic(p) {
    if (!isProTower(p)) return false;
    var changed = false;
    if (p.widgetLayout && typeof p.widgetLayout === "object" && p.widgetLayout.music) {
      delete p.widgetLayout.music;
      changed = true;
    }
    if (p.publicWidgets && typeof p.publicWidgets === "object" && Object.prototype.hasOwnProperty.call(p.publicWidgets, "music")) {
      delete p.publicWidgets.music;
      changed = true;
    }
    return changed;
  }

  /* A Quote keeps its own spot in quoteStickers. Every Quote shares the widget
     id "quote", so pinning one into the widget layout wrote a stray layout.quote
     from the on-screen spot (#223). Emoji stay: each has its own layout key. */
  function isAddedSticker(el) {
    if (!el || !el.getAttribute) return false;
    if (el.getAttribute("data-tower-quote-id") != null) return true;
    return !!(el.classList && el.classList.contains("tower-sticker--quote"));
  }

  /* Before saving any layout, pin every on-screen spawned widget where it is now,
     so moving one widget never makes the others jump. */
  function freezeSpawnedWidgets(root, layout) {
    var stage = root && root.querySelector ? root.querySelector("[data-tower-scrapbook]") : null;
    if (!stage) return layout;
    /* Phone positions are a stacked view, never the website layout. */
    if (isPhoneStage(stage)) return layout;
    liftDefaultGrid(stage);
    stage.querySelectorAll("[data-tower-widget].is-spawned").forEach(function (el) {
      var id = el.getAttribute("data-tower-widget");
      if (!id || el.hidden || el.classList.contains("is-widget-off")) return;
      if (isAddedSticker(el)) return;
      if (isPlacedPos(layout, id)) return;
      layout[id] = {
        x: parseFloat(el.getAttribute("data-sticker-x") || "0"),
        y: parseFloat(el.getAttribute("data-sticker-y") || "0"),
        z: parseInt(el.getAttribute("data-sticker-z") || "2", 10),
        tilt: 0,
      };
      if (typeof el.offsetTop === "number" && (stage.clientHeight || 0) > 0) layout[id].yPx = Math.round(el.offsetTop);
      var frozenW = parseFloat(el.getAttribute("data-sticker-w") || "");
      if (frozenW > 0) layout[id].wPx = Math.round(frozenW);
      el.classList.remove("is-spawned");
    });
    return layout;
  }

  /* Old scrapbook leans. A Rotate click adds 5° and that angle is kept. */
  var FACTORY_WIDGET_TILT = {
    avatar: -2,
    identity: 1,
    slogan: -1,
    music: -3,
    badges: 2,
    friends: -1,
    html: 2,
    calendar: -2,
  };

  function isArrivalTilt(id, tilt) {
    var n = typeof tilt === "number" ? tilt : parseFloat(tilt);
    if (isNaN(n) || n === 0) return false;
    /* Only the original factory leans. A 5° Rotate step must survive reload. */
    return !!(id && FACTORY_WIDGET_TILT[id] === n);
  }

  function settleArrivalTilts(p) {
    if (!p) return false;
    var changed = false;
    function clearTilt(obj, id) {
      if (!obj || typeof obj !== "object") return;
      if (!isArrivalTilt(id, obj.tilt)) return;
      obj.tilt = 0;
      changed = true;
    }
    var layout = p.widgetLayout;
    if (layout && typeof layout === "object") {
      Object.keys(layout).forEach(function (id) {
        clearTilt(layout[id], id);
      });
      /* Professional seed parked the name under the avatar, so the @ could not be clicked. */
      var idPos = layout.identity;
      if (idPos && idPos.x === 4 && idPos.y === 18 && idPos.z === 4 && (!idPos.tilt || idPos.tilt === 0)) {
        idPos.y = 26;
        changed = true;
      }
    }
    ["friendPinLayout", "badgePinLayout"].forEach(function (key) {
      var pins = p[key];
      if (!pins || typeof pins !== "object") return;
      Object.keys(pins).forEach(function (id) {
        clearTilt(pins[id], null);
      });
    });
    if (Array.isArray(p.quoteStickers)) {
      p.quoteStickers.forEach(function (q) {
        clearTilt(q, null);
      });
    }
    var live = p.widgetLayout && p.widgetLayout["going-live"];
    if (live && live.x === 34 && live.y === 58) {
      live.x = DEFAULT_WIDGET_LAYOUT["going-live"].x;
      live.y = DEFAULT_WIDGET_LAYOUT["going-live"].y;
      live.z = DEFAULT_WIDGET_LAYOUT["going-live"].z;
      changed = true;
    }
    if (changed) {
      try { TowerProfileStore.save(p, { geometry: true }); } catch (eSettle) {}
    }
    return changed;
  }

  var PUBLIC_WIDGET_IDS = ["identity", "slogan", "social", "music", "badges", "friends", "html", "calendar", "envelope"];
  var DEFAULT_PUBLIC_WIDGETS = {
    identity: true,
    slogan: true,
    social: true,
    music: true,
    badges: true,
    friends: true,
    html: true,
    calendar: true,
    envelope: true,
  };

  var WIDGET_UNDO_MAX = 12;

  function normalizePublicWidgets(raw) {
    var out = {};
    PUBLIC_WIDGET_IDS.forEach(function (id) {
      var defaultOn = DEFAULT_PUBLIC_WIDGETS[id] !== false;
      if (raw && typeof raw === "object" && Object.prototype.hasOwnProperty.call(raw, id)) {
        out[id] = raw[id] !== false;
      } else {
        out[id] = defaultOn;
      }
    });
    /* Owner-only Instax camera switch (#223): not a public widget, but an
       explicit on/off is kept so "camera removed" survives reload (it rides in
       the layout row's _widgets.publicWidgets). No key = on. */
    if (raw && typeof raw === "object" && typeof raw.instax === "boolean") out.instax = raw.instax;
    /* Owner's Remove on Music, Badges and Calendar: "shown.<id>": false (see
       OWNER_REMOVABLE_WIDGET_IDS). Kept as saved; no key = shown. */
    ["music", "badges", "calendar"].forEach(function (id) {
      var k = "shown." + id;
      if (raw && typeof raw === "object" && typeof raw[k] === "boolean") out[k] = raw[k];
    });
    return out;
  }

  /* Remove on Music, Badges and Calendar (Oct 22). Their old flags can't tell
     "the owner hid it" from "it's empty": the page turns music and badges off
     by itself when they have nothing to show, and that copy is saved with the
     next edit. So the owner's Remove has its own switch, "shown.<id>", in the
     same publicWidgets map (it rides in the layout row's _widgets). Only
     Remove sets it off; only Show in Edit profile (or Undo) turns it back on.
     Nothing on load writes it, and the old music/badges/calendar flags are
     left as they are and no longer hide these three. No key = shown.
     Calendar: Remove hides the visitors' Calendar card; the Calendar sticker
     in Edit profile > Calendar stays, since owners manage sessions and
     bookings there. */
  var OWNER_REMOVABLE_WIDGET_IDS = ["music", "badges", "calendar"];

  function ownerShownKey(id) {
    return "shown." + id;
  }

  function widgetRemovedByOwner(p, id) {
    if (OWNER_REMOVABLE_WIDGET_IDS.indexOf(id) < 0) return false;
    var raw = p && p.publicWidgets && typeof p.publicWidgets === "object" ? p.publicWidgets : null;
    return !!raw && raw[ownerShownKey(id)] === false;
  }

  function instaxRemoved(p) {
    return !!(p && p.publicWidgets && typeof p.publicWidgets === "object" && p.publicWidgets.instax === false);
  }

  function setInstaxSwitch(p, on) {
    p.publicWidgets = normalizePublicWidgets(p.publicWidgets);
    p.publicWidgets.instax = !!on;
  }

  var TOWER_SIDE_KEY = "cognation.tower.side";
  var DEFAULT_PRIVATE_FEED_THEME = {
    backgroundColor: "#fff5f9",
    fontFamily: "georgia",
    fontSize: 16,
    textColor: "#4a2c3a",
    buttonColor: "#f4a4c4",
    authorSeeThrough: true,
    messagesSeeThrough: true,
  };

  var COLLAGE_LAYOUTS = {
    none: { cells: 0 },
    "grid-3x3": { cells: 9 },
    "grid-2x3": { cells: 6 },
    masonry: { cells: 9 },
    "hero-smalls": { cells: 5 },
    "polaroid-scatter": { cells: 9 },
  };

  var DEMO_COLLAGE_COLORS = [
    "#ffd6e8", "#f4a4c4", "#ffc1d9", "#ef8bb4", "#ffeaf3",
    "#f5b6d0", "#d489b0", "#ffd0e4", "#f7b8ce",
  ];


  var DEMO_FRIENDS = [{"id": "alex-rivera", "name": "Alex Rivera"}, {"id": "sam-okonkwo", "name": "Sam Okonkwo"}, {"id": "jordan-lee", "name": "Jordan Lee"}, {"id": "mira-chen", "name": "Mira Chen"}, {"id": "chris-patel", "name": "Chris Patel"}, {"id": "susan-park", "name": "Susan Park"}, {"id": "devon-brooks", "name": "Devon Brooks"}, {"id": "riley-nguyen", "name": "Riley Nguyen"}, {"id": "casey-morris", "name": "Casey Morris"}, {"id": "avery-kim", "name": "Avery Kim"}, {"id": "taylor-james", "name": "Taylor James"}, {"id": "morgan-diaz", "name": "Morgan Diaz"}, {"id": "quinn-foster", "name": "Quinn Foster"}, {"id": "harper-wong", "name": "Harper Wong"}, {"id": "alexa-thomas", "name": "Alexa Thomas"}];

  var BADGE_LABELS = {
    neighbor: "Neighbor",
    organizer: "Organizer",
    correspondent: "Correspondent",
    creator: "Creator",
    steward: "Steward",
    arts: "Arts",
    civic: "Civic",
    food: "Food",
    sports: "Sports",
    faith: "Faith",
    tech: "Tech",
    new: "New here",
    verified: "Verified neighbor",
    host: "Event host",
    helper: "Block helper",
  };

  /* Gifted / awarded pins — brands & people can pin onto a member Tower.
     Founder bottle-cap + patch are NOT here; they render only for isFounderOwner(). */
  var DEMO_AWARDED_BADGES = [
    {
      id: "award-red-peak-ski-1st",
      title: "1st Place · Skiing",
      subtitle: "Mountain Series",
      fromName: "Red Peak Athletics",
      fromHandle: "redpeak",
      fromBusinessId: "red-peak-athletics",
      kind: "brand",
      imageUrl: "assets/badges/award-redbull.svg",
      awardedAt: "2026-02-14T18:00:00.000Z",
      note: "Podium pin from Red Peak Athletics",
    },
    {
      id: "award-summit-bronze-track",
      title: "Bronze · Track",
      subtitle: "400m",
      fromName: "Summit Games",
      fromHandle: "summitgames",
      fromBusinessId: "summit-games",
      kind: "award",
      imageUrl: "assets/badges/award-olympic.svg",
      awardedAt: "2024-08-02T16:30:00.000Z",
      note: "Games-style medal from Summit Games",
    },
    {
      id: "award-peer-mira-neighbor",
      title: "Neighbor of the Block",
      subtitle: "Thanks for showing up",
      fromName: "Mira Chen",
      fromHandle: "mira-chen",
      kind: "peer",
      imageUrl: "assets/badges/award-peer.svg",
      awardedAt: "2026-09-01T12:00:00.000Z",
      note: "Peer pin from a demo friend",
    },
  ];

  function seedAwardedBadgesIfMissing(profile) {
    if (!profile) return profile;
    /* Uploaded images are the badges. Do not fill the panel with preset awards. */
    if (!Array.isArray(profile.awardedBadges)) profile.awardedBadges = [];
    return profile;
  }

  function getYearbookDemoDefs() {
    return DEMO_AWARDED_BADGES.filter(function (b) {
      return b && b.kind === "yearbook";
    });
  }

  function isBadgeVisible(profile, badgeId) {
    var vis = profile && profile.badgeVisibility;
    if (!vis || typeof vis !== "object") return false;
    return vis[badgeId] === true;
  }

  function ownedBadgeVisibilityIds(profile) {
    var ids = [];
    if (isFounderOwner(profile)) {
      ids.push("founder-cap", "founder-patch");
    }
    var list = (profile && profile.awardedBadges) || [];
    list.forEach(function (b) {
      if (!b || !b.id || b.kind === "founder") return;
      if (ids.indexOf(b.id) < 0) ids.push(b.id);
    });
    return ids;
  }

  /** Opt-in display map. Missing key = false. First-time null/undefined migrates all owned → true. */
  function normalizeBadgeVisibility(profile) {
    if (!profile) return { migrated: false };
    var owned = ownedBadgeVisibilityIds(profile);
    if (profile.badgeVisibility == null || typeof profile.badgeVisibility !== "object") {
      var vis = {};
      owned.forEach(function (id) {
        if (id === "founder-cap" || id === "founder-patch") return;
        vis[id] = true;
      });
      profile.badgeVisibility = vis;
      return { migrated: true };
    }
    return { migrated: false };
  }

  function normalizeAvatarFrameScale(v) {
    var n = parseFloat(v);
    if (isNaN(n)) n = 1;
    return Math.max(0.65, Math.min(1.75, n));
  }

  function sanitizeProfileHtml(html) {
    var tmp = document.createElement("div");
    tmp.innerHTML = String(html || "");
    tmp.querySelectorAll("script, iframe, object, embed, link, meta").forEach(function (el) {
      el.remove();
    });
    tmp.querySelectorAll("*").forEach(function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (attr) {
        var n = attr.name.toLowerCase();
        if (n.indexOf("on") === 0 || n === "srcdoc" || (n === "href" && /^\s*javascript:/i.test(attr.value))) {
          el.removeAttribute(attr.name);
        }
      });
    });
    return tmp.innerHTML;
  }

  function getSessionObject() {
    try {
      if (window.CognationAuth && typeof window.CognationAuth.getSession === "function") {
        return window.CognationAuth.getSession();
      }
    } catch (e) {}
    try {
      var raw = localStorage.getItem("cognation.session.v2");
      if (raw) return JSON.parse(raw);
    } catch (e2) {}
    return null;
  }

  function directoryPeople() {
    var directory = window.CognationPeopleDirectory;
    if (!directory || typeof directory.all !== "function") return [];
    try { return directory.all() || []; } catch (e) { return []; }
  }

  function directoryFriendById(id) {
    id = String(id || "");
    var people = directoryPeople();
    for (var i = 0; i < people.length; i++) {
      if (people[i] && people[i].id === id) return people[i];
    }
    return null;
  }

  function directoryFriendBySlug(slug) {
    slug = String(slug || "").trim().toLowerCase().replace(/^@/, "");
    if (!slug) return null;
    var people = directoryPeople();
    for (var i = 0; i < people.length; i++) {
      var person = people[i];
      if (!person) continue;
      if (String(person.handle || "").toLowerCase() === slug) return person;
      if (String(person.id || "").toLowerCase() === slug) return person;
    }
    return null;
  }

  function personalProfileHandle(friendId) {
    friendId = String(friendId || "");
    var social = remoteSocial();
    if (social) {
      if (typeof social.getProfileForHandle === "function") {
        var byHandle = social.getProfileForHandle(friendId.replace(/^@/, ""));
        if (byHandle && byHandle.handle) return String(byHandle.handle).replace(/^@/, "");
      }
      if (typeof social.getProfileForUser === "function") {
        var byUser = social.getProfileForUser(friendId, "personal");
        if (byUser && byUser.handle) return String(byUser.handle).replace(/^@/, "");
      }
      if (typeof social.getProfile === "function") {
        var byId = social.getProfile(friendId);
        if (byId && byId.handle) return String(byId.handle).replace(/^@/, "");
      }
    }
    var person = directoryFriendById(friendId);
    if (person && person.handle) return String(person.handle).replace(/^@/, "");
    /* Prefer already-handle-shaped ids (hydrated roster) over UUID slug mangling. */
    if (friendId && friendId.indexOf("-") >= 0 && /^[0-9a-f]{8}-/i.test(friendId)) {
      return friendHandleFromId(friendId);
    }
    if (friendId && !/^[0-9a-f]{8}-/i.test(friendId)) {
      return String(friendId).replace(/^@/, "");
    }
    return friendHandleFromId(friendId);
  }

  function towerProfileSlug() {
    var hash = String(location.hash || "").replace(/^#/, "");
    if (hash.indexOf("tower-profile-") !== 0) return "";
    var slug = hash.slice("tower-profile-".length);
    try { slug = decodeURIComponent(slug); } catch (eSlug) {}
    return String(slug || "").trim().replace(/^@/, "");
  }

  /* The signed-in viewer's own profiles, from the server (getMyProfiles) only.
     Never the viewed page, never a cached handle from another account. */
  function viewerOwnProfiles() {
    var social = remoteSocial();
    if (!social || typeof social.getMyProfiles !== "function") return [];
    var mine = social.getMyProfiles() || [];
    return Array.isArray(mine) ? mine.filter(function (row) { return row && row.id; }) : [];
  }

  /* Own profile row for this kind ("personal" | "professional"). Null when the
     viewer has no page of that kind: no Pro page means no Pro link. */
  function viewerOwnProfileOfKind(kind) {
    var mine = viewerOwnProfiles();
    for (var i = 0; i < mine.length; i++) {
      if (String(mine[i].kind || "") === String(kind || "")) return mine[i];
    }
    return null;
  }

  /* True when a #tower-profile-{slug} names one of the viewer's own pages.
     Live sessions trust getMyProfiles only; before it loads, the session's own
     active id/handle counts (it is replaced once the list arrives). */
  function slugIsViewerOwn(slug) {
    slug = String(slug || "").trim().replace(/^@/, "");
    if (!slug) return false;
    var norm = normalizeHandle(slug);
    var mine = viewerOwnProfiles();
    if (mine.length) {
      for (var i = 0; i < mine.length; i++) {
        if (String(mine[i].id) === slug || normalizeHandle(mine[i].handle || "") === norm) return true;
      }
      return false;
    }
    var s = getSessionObject();
    if (!s) return false;
    if (s.activeProfileId && String(s.activeProfileId) === slug) return true;
    return !!(s.profileHandle && normalizeHandle(s.profileHandle) === norm);
  }

  /* A session whose active profile is not one of the viewer's own (a stale id
     left from another account or a test) is reset to the viewer's own page. */
  function dropForeignActiveProfile() {
    var s = getSessionObject();
    var mine = viewerOwnProfiles();
    if (!s || s.source !== "supabase" || !mine.length) return false;
    var active = String(s.activeProfileId || "");
    for (var i = 0; i < mine.length; i++) {
      if (String(mine[i].id) === active) {
        if (s.profileHandle && normalizeHandle(s.profileHandle) === normalizeHandle(mine[i].handle || "")) return false;
        break;
      }
    }
    var keep = null;
    for (var j = 0; j < mine.length; j++) {
      if (String(mine[j].id) === active) keep = mine[j];
    }
    keep = keep || mine.filter(function (r) { return r.kind === "personal"; })[0] || mine[0];
    var social = remoteSocial();
    if (social && typeof social.setActiveProfile === "function") social.setActiveProfile(keep);
    return true;
  }

  /* Tapping TOWER or PULSE yourself means your own space: drop a left-over
     #tower-profile-* that names someone else's page. */
  function clearForeignTowerHash() {
    var slug = towerProfileSlug();
    if (!slug || slugIsViewerOwn(slug)) return false;
    try {
      if (window.history && typeof window.history.replaceState === "function") {
        window.history.replaceState(null, "", (location.pathname || "/") + (location.search || ""));
      } else {
        location.hash = "";
      }
    } catch (eClear) {
      try { location.hash = ""; } catch (e2) {}
    }
    return true;
  }

  /* Live Supabase session (not the local demo). */
  function liveSignedInForTower() {
    var s = getSessionObject();
    if (!s || s.source !== "supabase" || !s.supabaseUserId) return false;
    return !!signedInUserId() || usingRemoteSocial();
  }

  function resolveActiveProfileId() {
    if (window.CognationAccounts && typeof window.CognationAccounts.ensureSeeded === "function") {
      try { window.CognationAccounts.ensureSeeded(); } catch (e) {}
    }
    if (window.CognationAccounts && typeof window.CognationAccounts.ensureDemoProfessionals === "function") {
      try { window.CognationAccounts.ensureDemoProfessionals(); } catch (ePro) {}
    }
    /* A #tower-profile-{handle} names that page. If it is not loaded, do not
       substitute the signed-in profile (often the professional page). */
    var slug = towerProfileSlug();
    if (slug && liveSignedInForTower()) {
      /* Signed in to the live site: the server's profiles decide. The local demo
         registry (CognationAccounts) can hold a stale copy carrying this same
         handle (it was seeded from the shared legacy tower key), which painted a
         Pro page as the demo Personal record: music on, YouTube/Followers off,
         Add friend on your own page, and drags never saved. */
      var sessLive = getSessionObject();
      var slugNorm = normalizeHandle(slug);
      if (sessLive && sessLive.activeProfileId && slugIsViewerOwn(slug) &&
          (String(sessLive.activeProfileId) === slug ||
           (sessLive.profileHandle && normalizeHandle(sessLive.profileHandle) === slugNorm))) {
        return String(sessLive.activeProfileId);
      }
      var socialLive = remoteSocial();
      if (socialLive) {
        var mineLive = typeof socialLive.getMyProfiles === "function" ? socialLive.getMyProfiles() || [] : [];
        for (var ml = 0; ml < mineLive.length; ml++) {
          var own = mineLive[ml];
          if (own && (String(own.id) === slug || normalizeHandle(own.handle || "") === slugNorm)) return String(own.id);
        }
        if (typeof socialLive.getProfile === "function") {
          var liveById = socialLive.getProfile(slug);
          if (liveById && liveById.id) return liveById.id;
        }
        if (typeof socialLive.getProfileForHandle === "function") {
          var liveNamed = socialLive.getProfileForHandle(slug);
          if (liveNamed && liveNamed.id) return liveNamed.id;
        }
      }
      var friendLive = directoryFriendBySlug(slug);
      if (friendLive) return "directory-" + friendLive.id;
      return "viewed:" + slug;
    }
    if (slug) {
      /* Author links carry the profile id (handle only when there is no id);
         resolve the id first. Display names are never used. */
      if (window.CognationAccounts && window.CognationAccounts.getProfileById) {
        var byIdHash = window.CognationAccounts.getProfileById(slug);
        if (byIdHash && byIdHash.id) return byIdHash.id;
      }
      var socialById = remoteSocial();
      if (socialById && typeof socialById.getProfile === "function") {
        var remoteById = socialById.getProfile(slug);
        if (remoteById && remoteById.id) return remoteById.id;
      }
      if (window.CognationAccounts && window.CognationAccounts.getProfileByHandle) {
        var byHash = window.CognationAccounts.getProfileByHandle(slug);
        if (byHash && byHash.id) return byHash.id;
      }
      var namedFriend = directoryFriendBySlug(slug);
      if (namedFriend) return "directory-" + namedFriend.id;
      var socialNamed = remoteSocial();
      if (socialNamed && typeof socialNamed.getProfileForHandle === "function") {
        var remoteNamed = socialNamed.getProfileForHandle(slug);
        if (remoteNamed && remoteNamed.id) return remoteNamed.id;
      }
      return "viewed:" + slug;
    }
    var social = remoteSocial();
    if (social && social.getViewedProfileId) {
      var remoteId = social.getViewedProfileId();
      if (remoteId) return remoteId;
    }
    /* Signing in: no profile yet (never the demo founder or a local record). */
    if (signInPending()) return null;
    var session = getSessionObject();
    if (session && session.activeProfileId) return session.activeProfileId;
    if (session && session.username && window.CognationAccounts) {
      var list = window.CognationAccounts.getProfilesForUsername(session.username) || [];
      if (list.length) {
        var prefer = list.filter(function (p) {
          return p.kind === (session.profileKind || "personal");
        })[0] || list[0];
        return prefer.id;
      }
    }
    /* Demo founder id only in local preview (sign-in not configured). On a real
       site it leaked prof-alexa-personal into seed sessions. */
    var supa = window.CognationSupabase;
    var signInConfigured = !!(supa && typeof supa.configured === "function" && supa.configured());
    if (!signInConfigured && window.CognationAccounts && window.CognationAccounts.DEMO_ALEXA) {
      return window.CognationAccounts.DEMO_ALEXA.personalId;
    }
    return null;
  }

  function defaultEmptyProfileBlob() {
    return {
      displayName: "You",
      handle: "",
      slogan: "",
      socialLinks: {},
      avatarDataUrl: "",
      avatarFrame: "none",
      avatarFrameScale: 1,
      displayNameSize: 28,
      cowboyHatColor: "tan",
      avatarOrnament: "none",
      avatarOrnamentPos: "above",
      musicYoutubeWidth: 320,
      videoUrl: "",
      videoTitle: "",
      videoEnabled: true,
      videoWidth: 360,
      badges: { role: "", interest: "", status: "" },
      customHtml: "",
      awardedBadges: null,
      badgeVisibility: null,
      widgetLayout: null,
      publicWidgets: JSON.parse(JSON.stringify(DEFAULT_PUBLIC_WIDGETS)),
      friendPinLayout: {},
      badgePinLayout: {},
      quoteStickers: [],
      emojiStickers: [],
      featuredFriendIds: [],
      friendsDisplayCount: 3,
      backgroundCollage: { layoutId: "none", cells: [] },
      towerFont: "georgia",
      feedBackgroundColor: "#fff5f9",
      publicTextColor: "#4a2c3a",
      publicButtonColor: "#f4a4c4",
      backgroundMode: "solid",
      backgroundHtml: "",
      backgroundImageDataUrl: "",
      privateFeedTheme: JSON.parse(JSON.stringify(DEFAULT_PRIVATE_FEED_THEME)),
      calendarEvents: null,
      calendarIcsUrl: "",
      calendarGoogleConnected: false,
    };
  }

  var SCRAPBOOK_LAYOUT_KEY = "cognation.scrapbookLayout.v1";

  function scrapbookLayoutKeys(p) {
    var keys = [];
    function add(value) {
      var key = value ? String(value).trim() : "";
      if (!key || keys.indexOf(key) >= 0) return;
      keys.push(key);
    }
    add(p && (p._profileId || p.id));
    add(p && p.handle);
    /* The URL hash is not a key: a left-over #tower-profile-* must not read or
       save this page's layout under another page's key. */
    if (!keys.length) keys.push("default");
    return keys;
  }

  function readScrapbookLayouts() {
    try {
      var raw = localStorage.getItem(SCRAPBOOK_LAYOUT_KEY);
      var doc = raw ? JSON.parse(raw) : {};
      return doc && typeof doc === "object" ? doc : {};
    } catch (eLayout) {
      return {};
    }
  }

  function readSavedScrapbook(p) {
    var doc = readScrapbookLayouts();
    var keys = scrapbookLayoutKeys(p);
    var i;
    for (i = 0; i < keys.length; i++) {
      var hit = doc[keys[i]];
      if (hit && hit.widgetLayout && typeof hit.widgetLayout === "object") return hit;
    }
    for (i = 0; i < keys.length; i++) {
      if (doc[keys[i]] && typeof doc[keys[i]] === "object") return doc[keys[i]];
    }
    return null;
  }

  function writeScrapbookLayout(p, opts) {
    if (!p) return;
    opts = opts || {};
    var doc = readScrapbookLayouts();
    var prev = readSavedScrapbook(p) || {};
    var ownId = p._profileId || p.id || "";
    var prevOwn = ownId && doc[ownId] ? doc[ownId] : {};
    /* A profile/social save must not overwrite the saved layout. Only a real
       geometry edit (drag/rotate/resize) may replace widget positions. */
    var nextLayout = opts.keepLayout
      ? (prev.widgetLayout && typeof prev.widgetLayout === "object" ? prev.widgetLayout : (p.widgetLayout && typeof p.widgetLayout === "object" ? p.widgetLayout : null))
      : (p.widgetLayout && typeof p.widgetLayout === "object" ? p.widgetLayout : prev.widgetLayout || null);
    var nextQuotes = Array.isArray(p.quoteStickers) && p.quoteStickers.length
      ? p.quoteStickers
      : (Array.isArray(prev.quoteStickers) ? prev.quoteStickers : []);
    /* Empty array is intentional (owner deleted every emoji). Do not revive prev. */
    var nextEmoji = Array.isArray(p.emojiStickers)
      ? p.emojiStickers
      : (Array.isArray(prev.emojiStickers) ? prev.emojiStickers : []);
    /* An empty pin map must not replace positions already saved for this profile. */
    var nextPins = p.friendPinLayout && typeof p.friendPinLayout === "object" && Object.keys(p.friendPinLayout).length
      ? p.friendPinLayout
      : (prev.friendPinLayout && typeof prev.friendPinLayout === "object" ? prev.friendPinLayout : {});
    /* A later remote profile has no photo and no YouTube link. Keep the copy
       already stored for this profile instead of painting those fields blank. */
    var nextAvatar = p.avatarDataUrl && String(p.avatarDataUrl).indexOf("data:image/") === 0
      ? p.avatarDataUrl
      : (prevOwn.avatarDataUrl && String(prevOwn.avatarDataUrl).indexOf("data:image/") === 0 && p._remote
        ? prevOwn.avatarDataUrl
        : (p.avatarDataUrl || ""));
    if (p._remote && (!nextAvatar || String(nextAvatar).indexOf("data:image/") !== 0) && prevOwn.avatarDataUrl) {
      nextAvatar = prevOwn.avatarDataUrl;
    }
    var nextMusic = p.musicUrl && String(p.musicUrl).trim()
      ? String(p.musicUrl).trim()
      : (p._remote && prevOwn.musicUrl ? String(prevOwn.musicUrl).trim() : (p.musicUrl || ""));
    var record = {
      widgetLayout: nextLayout,
      quoteStickers: nextQuotes,
      emojiStickers: nextEmoji,
      friendPinLayout: nextPins,
      avatarDataUrl: nextAvatar || "",
      musicUrl: nextMusic || "",
      musicSkin: (p.musicSkin || (p._remote && prevOwn.musicSkin) || ""),
      musicTitle: (p.musicTitle || (p._remote && prevOwn.musicTitle) || ""),
      musicArtist: (p.musicArtist || (p._remote && prevOwn.musicArtist) || ""),
      musicEnabled: p.musicEnabled != null ? p.musicEnabled : (p._remote ? prevOwn.musicEnabled : p.musicEnabled),
      musicYoutubeWidth: (function () {
        var n = parseInt(p.musicYoutubeWidth, 10);
        if (isNaN(n)) n = parseInt(prevOwn.musicYoutubeWidth, 10);
        if (isNaN(n)) n = parseInt(prev.musicYoutubeWidth, 10);
        if (isNaN(n)) return null;
        return Math.max(180, Math.min(720, n));
      })(),
    };
    scrapbookLayoutKeys(p).forEach(function (key) {
      doc[key] = record;
    });
    try {
      localStorage.setItem(SCRAPBOOK_LAYOUT_KEY, JSON.stringify(doc));
    } catch (eWrite) {
      record.avatarDataUrl = "";
      scrapbookLayoutKeys(p).forEach(function (key) {
        doc[key] = record;
      });
      try { localStorage.setItem(SCRAPBOOK_LAYOUT_KEY, JSON.stringify(doc)); } catch (eWritePins) {}
    }
  }

  /* Remote profiles do not store widget x/y, and a refresh often still carries
     the spawn layout. The last drop on this profile wins over both. */
  function mergeScrapbookLayout(p) {
    if (!p) return p;
    mergeLocalScrapbookLayout(p);
    /* DB layout (tower_widget_layouts) wins when a row exists. */
    if (window.CognationTowerLayoutSync) window.CognationTowerLayoutSync.apply(p);
    return p;
  }

  function mergeLocalScrapbookLayout(p) {
    var saved = readSavedScrapbook(p);
    if (!saved || typeof saved !== "object") return p;
    if (saved.widgetLayout && typeof saved.widgetLayout === "object") {
      var base = p.widgetLayout && typeof p.widgetLayout === "object" ? p.widgetLayout : {};
      Object.keys(saved.widgetLayout).forEach(function (id) {
        var pos = saved.widgetLayout[id];
        if (!pos || typeof pos !== "object") return;
        var cur = base[id] && typeof base[id] === "object" ? base[id] : {};
        base[id] = {
          x: layoutCoord(pos.x, layoutCoord(cur.x, 0)),
          y: layoutCoord(pos.y, layoutCoord(cur.y, 0)),
          z: layoutCoord(pos.z, layoutCoord(cur.z, 1)),
          tilt: layoutCoord(pos.tilt, layoutCoord(cur.tilt, 0)),
        };
        if (typeof pos.yPx === "number" && isFinite(pos.yPx)) base[id].yPx = pos.yPx;
        if (typeof pos.wPx === "number" && isFinite(pos.wPx) && pos.wPx > 0) base[id].wPx = pos.wPx;
        if (pos.dragged === true) base[id].dragged = true;
      });
      if (saved.widgetLayout._compacted) base._compacted = saved.widgetLayout._compacted;
      p.widgetLayout = base;
    }
    if (saved.musicYoutubeWidth != null && !isNaN(parseInt(saved.musicYoutubeWidth, 10))) {
      /* Same as emoji/polaroid scale: last local size wins over a stale remote row. */
      p.musicYoutubeWidth = Math.max(180, Math.min(720, parseInt(saved.musicYoutubeWidth, 10)));
    }
    if (Array.isArray(saved.quoteStickers) && saved.quoteStickers.length && (!Array.isArray(p.quoteStickers) || !p.quoteStickers.length)) {
      p.quoteStickers = saved.quoteStickers;
    }
    if (Array.isArray(saved.emojiStickers) && saved.emojiStickers.length && (!Array.isArray(p.emojiStickers) || !p.emojiStickers.length)) {
      p.emojiStickers = saved.emojiStickers;
    }
    if (saved.friendPinLayout && typeof saved.friendPinLayout === "object") {
      if (!p.friendPinLayout || typeof p.friendPinLayout !== "object") p.friendPinLayout = {};
      Object.keys(saved.friendPinLayout).forEach(function (fid) {
        var pos = saved.friendPinLayout[fid];
        if (!pos || typeof pos !== "object") return;
        var x = layoutCoord(pos.x, NaN);
        var y = layoutCoord(pos.y, NaN);
        if (isNaN(x) || isNaN(y)) return;
        p.friendPinLayout[fid] = {
          x: x,
          y: y,
          z: layoutCoord(pos.z, 12),
          tilt: layoutCoord(pos.tilt, 0),
        };
      });
    }
    return p;
  }

  /* A later remote read has no photo, YouTube link, or pin coordinates.
     The copy already stored on this profile wins over that empty paint. */
  function accountTowerBlob(id) {
    if (!id || !window.CognationAccounts || typeof window.CognationAccounts.getProfileById !== "function") return null;
    var rec = window.CognationAccounts.getProfileById(id);
    if (!rec) return null;
    return window.CognationAccounts.stripMeta ? window.CognationAccounts.stripMeta(rec) : rec;
  }

  /* Shared devices: the legacy cognation.tower.profile.v1 blob is one key for
     everyone on this browser. When signed in, use it only if it was written for
     this user (ownerUserId). Signed-out / demo sessions are unchanged. */
  function signedInUserId() {
    var s = getSessionObject();
    return s && s.source === "supabase" && s.supabaseUserId ? String(s.supabaseUserId) : "";
  }

  /* Signing in: Cognation sign-in is configured but the login state isn't
     stored yet (or nobody is signed in behind the gate). Treated like signed
     in with no profile loaded: locked placeholder, no local copies, no demo
     fallback. Local preview / demo sessions are unchanged. */
  function signInPending() {
    var sb = window.CognationSupabase;
    if (!sb || typeof sb.configured !== "function" || !sb.configured()) return false;
    var s = getSessionObject();
    if (s && s.source === "demo") return false;
    return !signedInUserId();
  }

  function legacyBlobOwned(blob) {
    var uid = signedInUserId();
    if (!uid) return !signInPending();
    return !!blob && String(blob.ownerUserId || "") === uid;
  }

  function legacyTowerBlob() {
    try {
      var raw = localStorage.getItem(TOWER_PROFILE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && legacyBlobOwned(parsed) ? parsed : null;
    } catch (eLegacy) {
      return null;
    }
  }


  function applyOwnerMusicYoutubeWidth(p, legacy, account) {
    if (!p || p._directoryFriend || p._profileKind === "professional") return;
    if (p._remote && !isTowerOwner(p)) return;
    var chosen = null;
    function take(blob) {
      if (chosen != null || !blob || blob.musicYoutubeWidth == null) return;
      var blobHandle = normalizeHandle(blob.handle || "");
      var profileHandle = normalizeHandle(p.handle || "");
      if (blobHandle && profileHandle && blobHandle !== profileHandle) return;
      var n = parseInt(blob.musicYoutubeWidth, 10);
      if (isNaN(n)) return;
      chosen = Math.max(180, Math.min(720, n));
    }
    take(legacy);
    take(account);
    if (chosen != null) p.musicYoutubeWidth = chosen;
  }

  var TOP_FRIEND_LOCAL_KEY = "cognation.tower.top-friends.v1";

  function readTopFriendLocalDoc() {
    try {
      var raw = localStorage.getItem(TOP_FRIEND_LOCAL_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (eTop) {
      return {};
    }
  }

  function writeTopFriendLocal(profileId, removed, featured) {
    if (!profileId) return;
    var doc = readTopFriendLocalDoc();
    doc[String(profileId)] = {
      removedFriendPinIds: (removed || []).map(function (id) { return String(id || ""); }).filter(Boolean),
      featuredFriendIds: (featured || []).map(function (id) { return String(id || ""); }).filter(Boolean),
    };
    try { localStorage.setItem(TOP_FRIEND_LOCAL_KEY, JSON.stringify(doc)); } catch (eTopWrite) {}
  }

  /* Social / Venmo / Pay / Buy ads also live on the server under
     tower_widget_layouts.layout._public (see CognationTowerLayoutSync.savePublic).
     A per-profile local note still speeds same-browser reloads. */
  var SOCIAL_LINKS_LOCAL_KEY = "cognation.tower.social-links.v1";

  function readSocialLinksLocalDoc() {
    try {
      var raw = localStorage.getItem(SOCIAL_LINKS_LOCAL_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (eSocial) {
      return {};
    }
  }

  function normalizeSocialLinksMap(links) {
    var out = {};
    var src = links && typeof links === "object" ? links : {};
    socialLinkDefs().forEach(function (net) {
      out[net.id] = storedSocialValue(net.id, src[net.id]);
    });
    return out;
  }

  function writeSocialLinksLocal(profileId, links) {
    if (!profileId) return;
    var doc = readSocialLinksLocalDoc();
    doc[String(profileId)] = normalizeSocialLinksMap(links);
    try { localStorage.setItem(SOCIAL_LINKS_LOCAL_KEY, JSON.stringify(doc)); } catch (eSocialWrite) {}
  }

  function applyOwnerSocialLinks(p, legacy, account) {
    if (!p || p._directoryFriend) return;
    if (p._remote && !isTowerOwner(p)) return;
    var profileId = String(p._profileId || "");
    var keyed = profileId ? readSocialLinksLocalDoc()[profileId] : null;
    if (keyed && typeof keyed === "object") {
      var localMap = normalizeSocialLinksMap(keyed);
      /* Empty local must not wipe server _public links on a fresh browser. */
      if (profileHasSocialLinks({ socialLinks: localMap })) {
        p.socialLinks = localMap;
        p.publicWidgets = normalizePublicWidgets(p.publicWidgets);
        p.publicWidgets.social = true;
        return;
      }
    }
    if (profileHasSocialLinks(p)) return;
    var chosen = null;
    function take(blob) {
      if (chosen || !blob || !blob.socialLinks || typeof blob.socialLinks !== "object") return;
      if (!profileHasSocialLinks({ socialLinks: blob.socialLinks })) return;
      chosen = normalizeSocialLinksMap(blob.socialLinks);
    }
    take(account);
    /* Legacy blob is the personal page only — never paint it onto professional. */
    if (p._profileKind !== "professional") take(legacy);
    if (!chosen) return;
    p.socialLinks = chosen;
    p.publicWidgets = normalizePublicWidgets(p.publicWidgets);
    p.publicWidgets.social = true;
  }

  /* Remote rows omit a top-friend removal. The signed-in profile's own note wins on reload. */
  function applyOwnerTopFriends(p, legacy, account) {
    if (!p || p._directoryFriend || p._profileKind === "professional") return;
    if (p._remote && !isTowerOwner(p)) return;
    var keyed = readTopFriendLocalDoc()[String(p._profileId || "")];
    if (keyed && typeof keyed === "object") {
      p.removedFriendPinIds = (keyed.removedFriendPinIds || []).map(function (id) { return String(id || ""); }).filter(Boolean);
      var keyedCount = parseInt(p.friendsDisplayCount, 10);
      if ([3, 6, 8].indexOf(keyedCount) === -1) keyedCount = 3;
      p.featuredFriendIds = (keyed.featuredFriendIds || []).map(function (id) { return String(id || ""); }).filter(Boolean).slice(0, keyedCount);
      return;
    }
    var profileHandle = normalizeHandle(p.handle || "");
    var chosen = null;
    [legacy, account].forEach(function (blob) {
      if (!blob || typeof blob !== "object") return;
      var blobHandle = normalizeHandle(blob.handle || "");
      if (blobHandle && profileHandle && blobHandle !== profileHandle) return;
      var removed = Array.isArray(blob.removedFriendPinIds) ? blob.removedFriendPinIds.map(String).filter(Boolean) : [];
      var featured = Array.isArray(blob.featuredFriendIds) ? blob.featuredFriendIds.map(String).filter(Boolean) : [];
      if (!removed.length && !featured.length) return;
      if (!chosen || removed.length > chosen.removed.length) chosen = { removed: removed, featured: featured };
    });
    if (!chosen) return;
    p.removedFriendPinIds = chosen.removed.slice();
    var fdc = parseInt(p.friendsDisplayCount, 10);
    if ([3, 6, 8].indexOf(fdc) === -1) fdc = 3;
    p.featuredFriendIds = chosen.featured.slice(0, fdc);
  }

  function restoreSavedTowerFields(p) {
    if (!p || p._directoryFriend) return p;
    var local = accountTowerBlob(p._profileId) || {};
    /* Never paint the viewer's legacy personal page onto someone else's Tower. */
    var viewingOther = !!(p._remote && !isTowerOwner(p));
    /* The legacy blob is the personal page. Do not paint it onto the professional page. */
    var legacy = (viewingOther || p._profileKind === "professional") ? null : legacyTowerBlob();
    if (legacy) {
      if ((!local.avatarDataUrl || String(local.avatarDataUrl).indexOf("data:image/") !== 0) && legacy.avatarDataUrl) {
        local.avatarDataUrl = legacy.avatarDataUrl;
      }
      if ((!local.musicUrl || !String(local.musicUrl).trim()) && legacy.musicUrl) {
        local.musicUrl = legacy.musicUrl;
        if (!local.musicSkin && legacy.musicSkin) local.musicSkin = legacy.musicSkin;
        if (!local.musicTitle && legacy.musicTitle) local.musicTitle = legacy.musicTitle;
        if (!local.musicArtist && legacy.musicArtist) local.musicArtist = legacy.musicArtist;
      }
      if ((!local.backgroundImageDataUrl || String(local.backgroundImageDataUrl).indexOf("data:image/") !== 0) && legacy.backgroundImageDataUrl) {
        local.backgroundImageDataUrl = legacy.backgroundImageDataUrl;
      }
      if ((!local.polaroidDataUrl || String(local.polaroidDataUrl).indexOf("data:image/") !== 0) && legacy.polaroidDataUrl) {
        local.polaroidDataUrl = legacy.polaroidDataUrl;
      }
      if ((!Array.isArray(local.calendarEvents) || !local.calendarEvents.length) && Array.isArray(legacy.calendarEvents) && legacy.calendarEvents.length) {
        local.calendarEvents = legacy.calendarEvents;
      }
      if ((!local.friendPinLayout || !Object.keys(local.friendPinLayout).length) && legacy.friendPinLayout) {
        local.friendPinLayout = legacy.friendPinLayout;
      }
    }
    /* pointerup writes cognation.tower.profile.v1. Remote get() still has the
       default 320 until sync, so the owner local width wins on paint/reload. */
    applyOwnerMusicYoutubeWidth(p, legacy, local);
    applyOwnerTopFriends(p, legacy, local);
    applyOwnerSocialLinks(p, legacy, local);
    if (!local || !Object.keys(local).length) return p;
    if (
      (!p.avatarDataUrl || String(p.avatarDataUrl).indexOf("data:image/") !== 0) &&
      local.avatarDataUrl &&
      String(local.avatarDataUrl).indexOf("data:image/") === 0
    ) {
      p.avatarDataUrl = local.avatarDataUrl;
    }
    if ((!p.musicUrl || !String(p.musicUrl).trim()) && local.musicUrl && String(local.musicUrl).trim()) {
      p.musicUrl = String(local.musicUrl).trim();
      if (!p.musicTitle && local.musicTitle) p.musicTitle = local.musicTitle;
      if (!p.musicArtist && local.musicArtist) p.musicArtist = local.musicArtist;
      if (!p.musicSkin && local.musicSkin) p.musicSkin = local.musicSkin;
      if (p.musicEnabled == null && local.musicEnabled != null) p.musicEnabled = local.musicEnabled;
    }
    if (
      (!p.backgroundImageDataUrl || String(p.backgroundImageDataUrl).indexOf("data:image/") !== 0) &&
      local.backgroundImageDataUrl &&
      String(local.backgroundImageDataUrl).indexOf("data:image/") === 0
    ) {
      p.backgroundImageDataUrl = local.backgroundImageDataUrl;
    }
    if (
      !viewingOther &&
      (!p.polaroidDataUrl || String(p.polaroidDataUrl).indexOf("data:image/") !== 0) &&
      local.polaroidDataUrl &&
      String(local.polaroidDataUrl).indexOf("data:image/") === 0
    ) {
      p.polaroidDataUrl = local.polaroidDataUrl;
    }
    if (
      !viewingOther &&
      (!Array.isArray(p.polaroidPrints) || !p.polaroidPrints.length) &&
      Array.isArray(local.polaroidPrints) &&
      local.polaroidPrints.length
    ) {
      p.polaroidPrints = local.polaroidPrints.slice();
    }
    if (Array.isArray(local.calendarEvents) && local.calendarEvents.length) {
      var incoming = Array.isArray(p.calendarEvents) ? p.calendarEvents : [];
      if (incoming.length < local.calendarEvents.length) p.calendarEvents = local.calendarEvents.slice();
    }
    if (local.friendPinLayout && typeof local.friendPinLayout === "object") {
      if (!p.friendPinLayout || typeof p.friendPinLayout !== "object") p.friendPinLayout = {};
      Object.keys(local.friendPinLayout).forEach(function (fid) {
        var pos = local.friendPinLayout[fid];
        var cur = p.friendPinLayout[fid];
        if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") return;
        if (!cur || typeof cur.x !== "number" || typeof cur.y !== "number") p.friendPinLayout[fid] = pos;
      });
    }
    if (
      (!Array.isArray(p.friendIds) || !p.friendIds.length) &&
      Array.isArray(local.friendIds) &&
      local.friendIds.length
    ) {
      p.friendIds = local.friendIds.map(function (id) { return String(id || ""); }).filter(Boolean).slice(0, 250);
    } else if (
      (!Array.isArray(p.friendIds) || !p.friendIds.length) &&
      legacy &&
      Array.isArray(legacy.friendIds) &&
      legacy.friendIds.length
    ) {
      p.friendIds = legacy.friendIds.map(function (id) { return String(id || ""); }).filter(Boolean).slice(0, 250);
    }
    var savedDoc = readScrapbookLayouts();
    var savedId = p._profileId || p.id || "";
    var savedLayout = savedId && savedDoc[savedId] ? savedDoc[savedId] : null;
    if (savedLayout) {
      if (
        (!p.avatarDataUrl || String(p.avatarDataUrl).indexOf("data:image/") !== 0) &&
        savedLayout.avatarDataUrl &&
        String(savedLayout.avatarDataUrl).indexOf("data:image/") === 0
      ) {
        p.avatarDataUrl = savedLayout.avatarDataUrl;
      }
      if ((!p.musicUrl || !String(p.musicUrl).trim()) && savedLayout.musicUrl && String(savedLayout.musicUrl).trim()) {
        p.musicUrl = String(savedLayout.musicUrl).trim();
        if (!p.musicTitle && savedLayout.musicTitle) p.musicTitle = savedLayout.musicTitle;
        if (!p.musicArtist && savedLayout.musicArtist) p.musicArtist = savedLayout.musicArtist;
        if (!p.musicSkin && savedLayout.musicSkin) p.musicSkin = savedLayout.musicSkin;
        if (p.musicEnabled == null && savedLayout.musicEnabled != null) p.musicEnabled = savedLayout.musicEnabled;
      }
    }
    return p;
  }

  function layoutCoord(value, fallback) {
    var n = typeof value === "number" ? value : parseFloat(value);
    return isNaN(n) ? fallback : n;
  }

  function directoryFriendProfile(person) {
    var blob = defaultEmptyProfileBlob();
    blob._profileId = "directory-" + person.id;
    blob._profileKind = "personal";
    blob._directoryFriend = true;
    blob._friendId = person.id;
    blob.displayName = (String(person.first || "") + " " + String(person.last || "")).trim() || person.handle;
    blob.handle = person.handle;
    blob.friendIds = [];
    blob.followerIds = [];
    blob.featuredFriendIds = [];
    blob.awardedBadges = [];
    blob.badgeVisibility = {};
    blob.calendarEvents = [];
    blob.publicWidgets = {
      identity: true,
      slogan: false,
      social: false,
      music: false,
      badges: false,
      friends: false,
      html: false,
      calendar: false
    };
    return blob;
  }

  var TowerProfileStore = {
    getActiveProfileId: resolveActiveProfileId,
    load: function () {
      var id = resolveActiveProfileId();
      if (id && String(id).indexOf("directory-") === 0) {
        var person = directoryFriendById(String(id).slice("directory-".length));
        if (person) return directoryFriendProfile(person);
      }
      var social = remoteSocial();
      if (social && social.getTowerProfile) {
        var remote = social.getTowerProfile(id);
        if (remote) return remote;
      }
      if (id && window.CognationAccounts && window.CognationAccounts.getProfileById) {
        var rec = window.CognationAccounts.getProfileById(id);
        if (rec) {
          return window.CognationAccounts.stripMeta
            ? window.CognationAccounts.stripMeta(rec)
            : rec;
        }
      }
      return legacyTowerBlob();
    },
    get: function () {
      var p = this.load();
      var created = false;
      var profileId = resolveActiveProfileId();
      var metaKind = "personal";
      var metaPhone = "";
      if (profileId && window.CognationAccounts && window.CognationAccounts.getProfileById) {
        var full = window.CognationAccounts.getProfileById(profileId);
        if (full) {
          metaKind = full.kind === "professional" ? "professional" : "personal";
          metaPhone = full.phone || "";
        }
      }
      if (!p) {
        created = true;
        p = defaultEmptyProfileBlob();
        /* Signed in, server row not loaded yet, and no local copy of this user's
           own: render the muted placeholder (no name, initial or quote) until
           cognation:remote-profile-loaded fills everything at once. */
        if ((signedInUserId() && usingRemoteSocial()) || signInPending()) {
          p._loading = true;
          p.displayName = "";
        }
      }
      if (p._remote) {
        metaKind = p._profileKind === "professional" ? "professional" : "personal";
      }
      p._profileId = profileId || "";
      p._profileKind = metaKind;
      try { pruneEmptyPublicWidgetsInProfile(p); } catch (ePrune) {}
      p._profilePhone = metaPhone;
      if (!p.avatarFrame) p.avatarFrame = "none";
      else p.avatarFrame = normalizeFrameId(p.avatarFrame);
      p.avatarFrameScale = normalizeAvatarFrameScale(p.avatarFrameScale);
      p.displayNameSize = normalizeDisplayNameSize(p.displayNameSize);
      p.cowboyHatColor = normalizeCowboyHatColor(p.cowboyHatColor);
      if (!p.avatarOrnament) p.avatarOrnament = "none";
      else p.avatarOrnament = normalizeOrnamentId(p.avatarOrnament);
      if (!p.avatarOrnamentPos) p.avatarOrnamentPos = "above";
      else p.avatarOrnamentPos = normalizeOrnamentPos(p.avatarOrnamentPos);
      if (p.musicYoutubeWidth == null || isNaN(parseInt(p.musicYoutubeWidth, 10))) p.musicYoutubeWidth = 320;
      else p.musicYoutubeWidth = Math.max(180, Math.min(720, parseInt(p.musicYoutubeWidth, 10)));
      /* One YouTube player only (music/radio). Fold legacy videoUrl into musicUrl. */
      if ((!p.musicUrl || !String(p.musicUrl).trim()) && p.videoUrl && String(p.videoUrl).trim()) {
        p.musicUrl = String(p.videoUrl).trim();
        if (p.videoTitle && !p.musicTitle) p.musicTitle = p.videoTitle;
        p.musicEnabled = p.videoEnabled !== false;
      }
      if (p.publicWidgets && typeof p.publicWidgets === "object") {
        p.publicWidgets.video = false;
      }
      if (typeof p.videoUrl !== "string") p.videoUrl = p.videoUrl ? String(p.videoUrl) : "";
      if (typeof p.videoTitle !== "string") p.videoTitle = p.videoTitle ? String(p.videoTitle) : "";
      if (p.videoEnabled == null) p.videoEnabled = true;
      else p.videoEnabled = !!p.videoEnabled;
      if (p.videoWidth == null || isNaN(parseInt(p.videoWidth, 10))) p.videoWidth = 360;
      else p.videoWidth = Math.max(200, Math.min(900, parseInt(p.videoWidth, 10)));
      if (!p.friendPinLayout || typeof p.friendPinLayout !== "object") {
        p.friendPinLayout = {};
      }
      if (!p.badgePinLayout || typeof p.badgePinLayout !== "object") {
        p.badgePinLayout = {};
      }
      p.emojiStickers = normalizeEmojiStickers(p.emojiStickers);
      if (!Array.isArray(p.friendIds)) p.friendIds = [];
      else {
        p.friendIds = p.friendIds.map(function (id) { return String(id || ""); }).filter(Boolean);
        if (p.friendIds.length > 6000) p.friendIds = p.friendIds.slice(0, 6000);
      }
      /* Professional followers are not the Tower friend roster and have no cap. */
      if (!Array.isArray(p.followerIds)) p.followerIds = [];
      else {
        p.followerIds = p.followerIds.map(function (id) { return String(id || ""); }).filter(Boolean);
      }
      if (!Array.isArray(p.followerEdges)) p.followerEdges = [];
      else {
        p.followerEdges = p.followerEdges
          .map(function (edge) {
            if (!edge || typeof edge !== "object") return null;
            var id = String(edge.id || "").trim();
            if (!id) return null;
            return { id: id, face: edge.face === "professional" ? "professional" : "personal" };
          })
          .filter(Boolean);
      }
      if (!p.followerEdges.length && p.followerIds.length) {
        p.followerEdges = p.followerIds.map(function (id) {
          return { id: String(id), face: "personal" };
        });
      }
      if (!Array.isArray(p.featuredFriendIds)) p.featuredFriendIds = [];
      else {
        p.featuredFriendIds = p.featuredFriendIds
          .map(function (id) { return String(id || ""); })
          .filter(Boolean);
      }
      if (!Array.isArray(p.removedFriendPinIds)) p.removedFriendPinIds = [];
      else {
        p.removedFriendPinIds = p.removedFriendPinIds
          .map(function (id) { return String(id || ""); })
          .filter(Boolean);
      }
      var fdc = parseInt(p.friendsDisplayCount, 10);
      if ([3, 6, 8].indexOf(fdc) === -1) fdc = 3;
      p.friendsDisplayCount = fdc;
      p.featuredFriendIds = p.featuredFriendIds.slice(0, fdc);
      p.publicWidgets = normalizePublicWidgets(p.publicWidgets);
      if (!p.backgroundCollage || typeof p.backgroundCollage !== "object") {
        p.backgroundCollage = { layoutId: "none", cells: [] };
      }
      if (!p.towerFont) p.towerFont = "georgia";
      else p.towerFont = normalizeTowerFont(p.towerFont);
      if (!p.feedBackgroundColor) p.feedBackgroundColor = "#fff5f9";
      else p.feedBackgroundColor = normalizeFeedBgColor(p.feedBackgroundColor);
      p.publicTextColor = normalizePublicThemeColor(
        p.publicTextColor,
        "#4a2c3a"
      );
      p.publicButtonColor = normalizePublicThemeColor(
        p.publicButtonColor,
        "#f4a4c4"
      );
      p.backgroundMode = normalizeBackgroundMode(
        p.backgroundMode,
        p.backgroundCollage,
        p.backgroundHtml
      );
      if (typeof p.backgroundHtml !== "string") p.backgroundHtml = "";
      else p.backgroundHtml = sanitizeProfileHtml(String(p.backgroundHtml).slice(0, 8000));
      if (typeof p.backgroundImageDataUrl !== "string" || p.backgroundImageDataUrl.indexOf("data:image/") !== 0) {
        p.backgroundImageDataUrl = "";
      }
      if (typeof p.slogan !== "string") p.slogan = p.slogan ? String(p.slogan) : "";
      else p.slogan = String(p.slogan).slice(0, 400);
      p.privateFeedTheme = normalizePrivateFeedTheme(p.privateFeedTheme);
      /* A live Supabase profile does not store demo badges or calendar rows.
         Seeding them made every read look unsaved, and save() dispatched
         cognation:tower-profile-updated. tower-follow syncAll calls get()
         again, which overflowed the stack and flooded PATCH /profiles the
         moment Sign in closed the gate. Render remote profiles as-is. */
      if (p._directoryFriend) {
        p._profileKind = "personal";
        p.friendIds = [];
        p.followerIds = [];
        p.featuredFriendIds = [];
        if (!Array.isArray(p.awardedBadges)) p.awardedBadges = [];
        if (!Array.isArray(p.calendarEvents)) p.calendarEvents = [];
        restoreSavedTowerFields(p);
        mergeScrapbookLayout(p);
        return p;
      }
      if (usingRemoteSocial() || p._remote) {
        if (!Array.isArray(p.awardedBadges)) p.awardedBadges = [];
        if (!p.badgeVisibility || typeof p.badgeVisibility !== "object") p.badgeVisibility = {};
        if (!Array.isArray(p.calendarEvents)) p.calendarEvents = [];
        if (typeof p.calendarIcsUrl !== "string") p.calendarIcsUrl = "";
        if (p.calendarGoogleConnected == null) p.calendarGoogleConnected = false;
        restoreSavedTowerFields(p);
        mergeScrapbookLayout(p);
        return p;
      }
      var before = p.awardedBadges;
      var beforeLen = Array.isArray(before) ? before.length : -1;
      var beforeVis = p.badgeVisibility;
      seedAwardedBadgesIfMissing(p);
      var calSeeded = seedCalendarEventsIfMissing(p);
      var visMig = normalizeBadgeVisibility(p);
      var afterLen = Array.isArray(p.awardedBadges) ? p.awardedBadges.length : -1;
      restoreSavedTowerFields(p);
      mergeScrapbookLayout(p);
      if (created || before == null || afterLen > beforeLen || beforeVis == null || visMig.migrated || calSeeded) {
        try {
          this.save(p);
        } catch (e) {}
      }
      return p;
    },
    save: function (data, opts) {
      /* Listeners of tower-profile-updated call get(), which can call save().
         A re-entrant save is what turned one profile read into a stack overflow. */
      if (this._saving) return false;
      data = data || {};
      opts = opts || {};
      /* Only the owner may persist Tower edits (name, avatar, stickers, music,
         polaroids, top friends, bio, geometry). Others' profiles stay read-only. */
      if (!isTowerOwner(data)) return false;
      /* The loading placeholder is never saved anywhere. */
      if (data._loading) return false;
      stripProMusic(data);
      this._saving = true;
      try {
      writeScrapbookLayout(data, { keepLayout: !opts.geometry });
      /* Account layout row is written only on a real geometry edit (drag end,
         rotate, resize). Opening the Tower must never POST a layout. */
      /* Signed-in owner only (this save already returned for anyone else):
         drag end uploads positions + added widgets; an add / remove / switch
         uploads the added widgets when they changed. localStorage is a cache. */
      if (window.CognationTowerLayoutSync && liveSignedInForTower()) {
        if (opts.geometry) window.CognationTowerLayoutSync.save(data);
        else if (window.CognationTowerLayoutSync.saveWidgetsIfChanged) window.CognationTowerLayoutSync.saveWidgetsIfChanged(data);
      }
      var id = data._profileId || resolveActiveProfileId();
      /* A drop only changes x/y. Never PATCH the profile: that reload paints
         the remote row, which has no sticker coordinates, and the widget
         jumps back to its spawn point the moment the pointer goes up. */
      if (!opts.geometry && usingRemoteSocial() && id) {
        var social = remoteSocial();
        var activeSession = getSessionObject();
        var remoteRow = social && social.getProfile ? social.getProfile(id) : null;
        /* Write to the server only from the server's own row: wait until the active
           profile's row is cached, never from a local blob (another account's record
           or the legacy cognation.tower.profile.v1 key), and send only real changes. */
        if (
          remoteRow &&
          data._remote &&
          social.updateCurrentProfile &&
          activeSession &&
          id === activeSession.activeProfileId &&
          String(remoteRow.user_id || "") === String(activeSession.supabaseUserId || "")
        ) {
          var changes = {};
          if (String(data.displayName || "").trim() !== String(remoteRow.display_name || "").trim()) changes.displayName = data.displayName;
          if (String(data.handle || "").trim() !== String(remoteRow.handle || "").trim()) changes.handle = data.handle;
          if (String(data.slogan || "").trim() !== String(remoteRow.bio || "").trim()) changes.bio = data.slogan;
          if (Object.keys(changes).length) social.updateCurrentProfile(changes).catch(function () {});
        }
      }
      var towerBlob = {};
      Object.keys(data).forEach(function (k) {
        if (k.charAt(0) === "_") return;
        towerBlob[k] = data[k];
      });
      /* Stamp the owner so another signed-in user on this browser ignores it. */
      var ownerId = signedInUserId();
      if (ownerId) towerBlob.ownerUserId = ownerId;
      if (opts.geometry) {
        if (id && window.CognationAccounts && typeof window.CognationAccounts.updateProfileTower === "function") {
          try { window.CognationAccounts.updateProfileTower(id, towerBlob); } catch (eGeo) {}
        }
        /* The legacy key is one blob for the whole browser (no face, no profile
           id). Live geometry already lives in the per-profile scrapbook copy and
           tower_widget_layouts; writing a Pro drag here leaked the Pro handle into
           the demo Personal record on the next load. */
        if (!liveSignedInForTower()) {
          try { localStorage.setItem(TOWER_PROFILE_KEY, JSON.stringify(towerBlob)); } catch (eGeo2) {}
        }
        return true;
      }
      if (id && window.CognationAccounts && typeof window.CognationAccounts.updateProfileTower === "function") {
        var result = window.CognationAccounts.updateProfileTower(id, towerBlob);
        if (result && result.ok) {
          document.dispatchEvent(new CustomEvent("cognation:tower-profile-updated", { detail: towerBlob }));
          return true;
        }
        /* Quota is swallowed inside the accounts write and used to come back
           as ok. Treating that as success made the avatar handler re-read an
           unchanged profile and leave the old initials in place. */
        /* Quota failed. Fall through and try the legacy key. Do not report success
           and do not drop the photo or the page background to make the write fit. */
        if (
          result &&
          result.error === "Profile not found." &&
          typeof window.CognationAccounts.saveProfileRecord === "function"
        ) {
          var sessionForSave = getSessionObject();
          var storedRec = {
            id: id,
            kind: data._profileKind === "professional" ? "professional" : "personal",
            accountUsername: sessionForSave && sessionForSave.username
              ? String(sessionForSave.username).toLowerCase()
              : "",
            phone: data._profilePhone || "",
          };
          Object.keys(towerBlob).forEach(function (k) {
            storedRec[k] = towerBlob[k];
          });
          if (window.CognationAccounts.saveProfileRecord(storedRec)) {
            document.dispatchEvent(new CustomEvent("cognation:tower-profile-updated", { detail: towerBlob }));
            return true;
          }
        }
      }
      try {
        localStorage.setItem(TOWER_PROFILE_KEY, JSON.stringify(towerBlob));
        document.dispatchEvent(new CustomEvent("cognation:tower-profile-updated", { detail: towerBlob }));
        return true;
      } catch (e) {
        return false;
      }
      } finally {
        this._saving = false;
      }
    },
    removeTopFriend: function (friendId) {
      var p = this.get();
      if (!p || p._directoryFriend || profileIsProfessional(p) || !isTowerOwner(p)) return false;
      if (!removeTopFriendPin(p, friendId)) return false;
      writeTopFriendLocal(p._profileId, p.removedFriendPinIds, p.featuredFriendIds);
      return !!this.save(p, { geometry: true });
    },
    topFriendIds: function () {
      return resolveTopFriendIds(this.get());
    },
  };

  window.CognationTowerProfileStore = TowerProfileStore;

  /* The 5 local demo Feed posts (ids tower-1..tower-5: Alex Rivera, Sam Okonkwo,
     Jordan Lee, Mira Chen, Chris Patel) are retired (Oct 20): they painted in the
     Times and TOWER Feed as if real. Copies already saved in this browser are
     dropped on load; anything else stays. */
  var RETIRED_DEMO_POSTS = {
    "tower-1": "alex-rivera",
    "tower-2": "sam-okonkwo",
    "tower-3": "jordan-lee",
    "tower-4": "mira-chen",
    "tower-5": "chris-patel",
  };
  function isRetiredDemoPost(post) {
    return !!(post && post.id && RETIRED_DEMO_POSTS[post.id] &&
      RETIRED_DEMO_POSTS[post.id] === String(post.authorProfileId || ""));
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatTime(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch (e) {
      return iso || "";
    }
  }

  function kindLabel(kind) {
    switch (kind) {
      case "photo":
        return "Photo";
      case "note":
        return "Notes";
      case "video":
        return "Video";
      case "art":
        return "Creative";
      case "document":
        return "Document";
      default:
        return "Upload";
    }
  }

  function newsReactionScore(post) {
    var score = Number(post && post.likes) || 0;
    var reactions = post && post.reactions;
    if (reactions && typeof reactions === "object") {
      Object.keys(reactions).forEach(function (face) {
        var list = reactions[face];
        if (Array.isArray(list)) score += list.length;
      });
    }
    return score;
  }

  /* NEWS stays inside what Feed already treats as appropriate (examine-before-post). */
  function newsPostAppropriate(post) {
    if (!post) return false;
    if ((Number(post.minAge) || 0) >= 18) return false;
    if (post.audience === "21+" || post.roomKind === "21+") return false;
    var blob = String(post.title || "") + " " + String(post.body || "");
    /* Shared age-floor keyword test (js/age-floor-keywords.js); fail closed if missing. */
    var floor = window.CognationAgeFloor;
    if (!floor || typeof floor.isAdultKeyword !== "function" || floor.isAdultKeyword(blob)) return false;
    return true;
  }

  /* Tower feed: under-13 or unknown-age viewers (js/age-floor-keywords.js rule)
     don't see posts that fail the News floor (adult keywords, 18+/21+ markers).
     Hidden entirely, no placeholder. Fail closed if the helper is missing. */
  function viewerUnder13() {
    var floor = window.CognationAgeFloor;
    return floor && typeof floor.viewerIsUnder13 === "function" ? floor.viewerIsUnder13() : true;
  }

  /* Auto-rate (js/auto-rate.js): the server rating wins; local/demo posts are
     rated here. Posters never choose it. Fail closed if the rater is missing. */
  function postRating(post) {
    if (post && post.rating) return post.rating;
    var ar = window.CognationAutoRate;
    if (!ar || !post) return "NR";
    return ar.rate(post.body || post.title || "", post.attachments || []).rating;
  }
  function ratingViewer() {
    var age = null;
    try {
      var p = JSON.parse(localStorage.getItem("cognation.member.profile.v1") || "{}");
      if (typeof p.age === "number" && isFinite(p.age)) age = p.age;
    } catch (e) {}
    /* Unknown age: treat as 13 (when in doubt, younger). MA opt-in lives server-side only. */
    return { age: age == null ? 13 : age, matureOptIn: false };
  }
  function ratingVisible(post) {
    var ar = window.CognationAutoRate;
    return !!(ar && ar.canSee(postRating(post), ratingViewer()));
  }

  function towerPostVisibleToViewer(post) {
    if (post && post._remote) return (!viewerUnder13() || newsPostAppropriate(post)); /* server already gated by rating */
    return ratingVisible(post) && (!viewerUnder13() || newsPostAppropriate(post));
  }

  function newsProfessionalPosts() {
    var out = [];
    try {
      if (window.CognationAccounts && typeof window.CognationAccounts.ensureDemoProfessionals === "function") {
        window.CognationAccounts.ensureDemoProfessionals();
      }
      var raw = localStorage.getItem("cognation.profiles.v1");
      var doc = raw ? JSON.parse(raw) : null;
      var profiles = doc && doc.profiles ? doc.profiles : {};
      Object.keys(profiles).forEach(function (id) {
        var rec = profiles[id];
        if (!rec || rec.kind !== "professional") return;
        var posts = Array.isArray(rec.featuredPosts) ? rec.featuredPosts : [];
        posts.forEach(function (post, idx) {
          if (!post) return;
          out.push({
            id: "pro-" + id + "-" + (post.id || idx),
            authorName: rec.displayName || rec.handle || "Professional",
            authorProfileId: rec.id || id,
            handle: rec.handle || "",
            title: post.title || "",
            body: post.body || post.title || "",
            createdAt: post.createdAt || "",
            likes: Number(post.likes) || 0,
            reactions: post.reactions || {},
            towerKind: "professional",
            minAge: post.minAge || 0
          });
        });
      });
    } catch (e) {}
    return out;
  }

  function clearLegacyReactionSelections(data) {
    try {
      if (localStorage.getItem(REACTION_CLEANUP_KEY)) return false;
      var changed = false;
      (data.posts || []).forEach(function (post) {
        if (!post || !post.reactions || typeof post.reactions !== "object") return;
        Object.keys(post.reactions).forEach(function (face) {
          var users = Array.isArray(post.reactions[face]) ? post.reactions[face] : [];
          var filtered = users.filter(function (user) {
            return String(user || "").toLowerCase() !== "you" &&
              String(user || "").toLowerCase() !== "alexa";
          });
          if (filtered.length === users.length) return;
          changed = true;
          if (filtered.length) post.reactions[face] = filtered;
          else delete post.reactions[face];
        });
      });
      localStorage.setItem(REACTION_CLEANUP_KEY, "1");
      return changed;
    } catch (e) {
      return false;
    }
  }

  /* Local SeedOps template posts (js/seedops-tower-posts.js buildPost:
     seedopsTower, never _remote) are written into this store while signed out.
     They stay there for signed-out visitors, but never enter the signed-in
     feed: setRemotePosts drops them while signed in, and a remote store that
     already holds copies reads without them while signed in. Server posts,
     seed ones included, are kept. Signed out, nothing changes. */
  function isLocalSeedTemplate(post) {
    return !!(post && post.seedopsTower && !post._remote);
  }

  /* Signed out, the Feed is the normal signed-out seed set only: SeedOps local
     templates (never _remote) plus server posts by seed/ops accounts that are
     PUBLIC (what an anonymous visitor can read anyway). Any other server post
     copied here while someone was signed in is hidden signed out and purged on
     sign-out: a member's post, and (PM ruling on #209, 2026-10-21) a seed's or
     ops account's friends-only/private post. A server post with no visibility
     recorded is treated as not public. Name kept for the #209 callers. */
  function isSignedOutSeedPost(post) {
    if (!post || !post._remote) return false;
    var kind = String(post.accountKind || "").toLowerCase();
    var seedOrOps = !!(post.isSeed || post.isOpsBot || kind === "seed" || kind === "ops" || post.seedFleetId);
    return seedOrOps && String(post.visibility || "").toLowerCase() === "public";
  }
  function isMemberCachePost(post) {
    if (!post || !post._remote) return false;
    return !isSignedOutSeedPost(post);
  }

  /* SeedOps overlay (seedops-tower-hydrate keeps server seed rows there too):
     on sign-out drop its non-public server rows the same way. */
  var SEEDOPS_OVERLAY_KEY = "cognation.seedops.tower.posts.v1";
  function clearOverlayNonPublic() {
    try {
      var raw = localStorage.getItem(SEEDOPS_OVERLAY_KEY);
      if (!raw) return 0;
      var doc = JSON.parse(raw);
      if (!doc || !Array.isArray(doc.posts)) return 0;
      var kept = doc.posts.filter(function (p) { return !isMemberCachePost(p); });
      var dropped = doc.posts.length - kept.length;
      if (dropped) { doc.posts = kept; localStorage.setItem(SEEDOPS_OVERLAY_KEY, JSON.stringify(doc)); }
      return dropped;
    } catch (e) { return 0; }
  }

  var TowerStore = {
    load: function () {
      try {
        var raw = localStorage.getItem(TOWER_KEY);
        if (!raw) return null;
        var data = JSON.parse(raw);
        if (!data || !Array.isArray(data.posts)) return null;
        if (!data.remote && data.posts.some(isRetiredDemoPost)) {
          data.posts = data.posts.filter(function (post) { return !isRetiredDemoPost(post); });
          TowerStore.save(data);
        }
        return data;
      } catch (e) {
        return null;
      }
    },
    save: function (data) {
      try {
        localStorage.setItem(TOWER_KEY, JSON.stringify(data));
        return true;
      } catch (e) {
        return false;
      }
    },
    list: function () {
      var data = this.load();
      if (usingRemoteSocial() && (!data || !data.remote)) {
        return [];
      }
      if (!data) return [];
      if (clearLegacyReactionSelections(data)) this.save(data);
      var posts = usingRemoteSocial()
        ? (data.remote ? data.posts.filter(function (p) { return !isLocalSeedTemplate(p); }) : data.posts)
        : data.posts.filter(function (p) { return !isMemberCachePost(p); });
      return posts.slice().sort(function (a, b) {
        return String(b.createdAt).localeCompare(String(a.createdAt));
      });
    },
    /* Hidden desk ranks this plate: every personal and professional Feed post. */
    feedPlate: function () {
      var personal = this.list().map(function (post) {
        var copy = {};
        Object.keys(post || {}).forEach(function (key) { copy[key] = post[key]; });
        copy.towerKind = copy.profileKind === "professional" || copy.towerKind === "professional"
          ? "professional"
          : "personal";
        return copy;
      });
      return personal.concat(newsProfessionalPosts());
    },
    /* NEWS reads this: most reacted personal and professional Feed posts (signals). */
    newsList: function () {
      return this.feedPlate().map(function (post) {
        post.rating = postRating(post); /* rating carries unchanged into SIGNAL and ECHO */
        return post;
      }).filter(function (post) {
        return newsPostAppropriate(post) && (post._remote || ratingVisible(post));
      }).sort(function (a, b) {
        var delta = newsReactionScore(b) - newsReactionScore(a);
        if (delta) return delta;
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
    },
    /* Sign-out: drop cached server posts that are not public seed/ops posts
       (member posts, and seed/ops friends-only posts). Public seed/ops posts and
       local templates stay. Returns how many went from the Feed store. */
    clearMemberCache: function () {
      clearOverlayNonPublic();
      var data = this.load();
      if (!data) return 0;
      var kept = data.posts.filter(function (p) { return !isMemberCachePost(p); });
      var dropped = data.posts.length - kept.length;
      if (!dropped) return 0;
      data.posts = kept;
      if (!kept.some(function (p) { return p && p._remote; })) data.remote = false;
      this.save(data);
      document.dispatchEvent(
        new CustomEvent("cognation:tower-updated", { detail: { remote: true, signedOut: true } })
      );
      return dropped;
    },
    setRemotePosts: function (posts) {
      var data = {
        version: 2,
        remote: true,
        posts: !Array.isArray(posts) ? [] : usingRemoteSocial()
          ? posts.filter(function (p) { return !isLocalSeedTemplate(p); })
          : posts.slice(),
      };
      this.save(data);
      document.dispatchEvent(
        new CustomEvent("cognation:tower-updated", { detail: { remote: true } })
      );
      return data.posts;
    },
    toggleReaction: function (postId, face) {
      face = String(face || "");
      if (!face) return { ok: false, error: "Missing reaction." };
      if (usingRemoteSocial()) {
        var social = remoteSocial();
        if (!social || typeof social.togglePostReaction !== "function") {
          return { ok: false, error: "Could not save reaction." };
        }
        return social.togglePostReaction(postId, face);
      }
      var data = this.load();
      if (!data) return { ok: false, error: "Post not found." };
      var me = "you";
      try {
        var sess = localStorage.getItem("cognation.session.v2");
        if (sess) {
          var parsed = JSON.parse(sess);
          if (parsed && parsed.username) me = String(parsed.username).toLowerCase();
        }
      } catch (e) {}
      var found = null;
      data.posts.forEach(function (p) {
        if (p && p.id === postId) found = p;
      });
      if (!found) return { ok: false, error: "Post not found." };
      if (!found.reactions || typeof found.reactions !== "object") found.reactions = {};
      var list = Array.isArray(found.reactions[face]) ? found.reactions[face].slice() : [];
      var ix = list.indexOf(me);
      if (ix >= 0) list.splice(ix, 1);
      else list.push(me);
      if (list.length) found.reactions[face] = list;
      else delete found.reactions[face];
      /* keep likes roughly in sync with heart count for legacy display */
      if (face === "❤️") found.likes = list.length || found.likes || 0;
      if (!this.save(data)) return { ok: false, error: "Could not save reaction." };
      return { ok: true, post: found };
    },
    add: function (fields) {
      if (usingRemoteSocial()) {
        return {
          ok: false,
          error: "Tower is syncing with Cognation. Please try posting again.",
        };
      }
      var body = String((fields && fields.body) || "").trim();
      if (!body && !(fields && fields.attachments && fields.attachments.length)) {
        return { ok: false, error: "Add a note or an upload." };
      }
      var data = this.load() || { version: 1, posts: [] };
      var post = {
        id: "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        authorName: (fields && fields.authorName) || "You",
        authorProfileId: (fields && fields.authorProfileId) ||
          (window.CognationTowerProfileStore &&
          window.CognationTowerProfileStore.get() &&
          window.CognationTowerProfileStore.get()._profileId) || "",
        body: body.slice(0, 2000),
        createdAt: new Date().toISOString(),
        attachments: (fields && fields.attachments) || [],
        /* Rated once at post time; any rating in `fields` is ignored. */
        rating: window.CognationAutoRate
          ? window.CognationAutoRate.rate(body, (fields && fields.attachments) || []).rating
          : "NR",
        likes: 0,
        visibility: (window.CognationEchoGroups && window.CognationEchoGroups.isGroupPost(body)) ? "public" : "friends",
        handle: (fields && fields.handle) || (window.CognationTowerProfileStore
          ? normalizeHandle(window.CognationTowerProfileStore.get().handle || "")
          : ""),
        profileKind: (fields && fields.profileKind) === "professional" ? "professional" : "personal",
      };
      data.posts.unshift(post);
      if (!this.save(data)) return { ok: false, error: "Could not save post." };
      document.dispatchEvent(
        new CustomEvent("cognation:tower-updated", { detail: { post: post } })
      );
      return { ok: true, post: post };
    },
  };

  window.CognationTowerStore = TowerStore;
  /* Signing out in this tab clears the member's Feed cache right away. */
  document.addEventListener("cognation:session-ended", function () {
    if (usingRemoteSocial()) return;
    try { TowerStore.clearMemberCache(); } catch (eClear) {}
  });

  /* Feed photos: the post row carries the picture itself (attachments[i].dataUrl, a
     shrunk JPEG saved with the post) or an https URL. Only image data/https URLs are
     drawn; anything else stays a label. */
  function attachmentImageUrl(a) {
    if (!a || a.kind === "removed") return "";
    var url = String(a.dataUrl || a.url || a.src || a.imageUrl || "");
    if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+\/=]+$/i.test(url)) return url;
    if (/^https:\/\/[^\s"'<>]+$/i.test(url)) return url;
    return "";
  }

  /* Minimum age for one photo. No rating (and a name that rates G/PG) stays open
     to whoever can already see the post. 21+ / MA never shows under 21. */
  function feedViewerAge() {
    var floor = window.CognationAgeFloor;
    var n = floor && typeof floor.viewerAge === "function" ? floor.viewerAge() : 0;
    if (typeof n === "number" && n > 0) return n;
    return ratingViewer().age;
  }
  function photoMinAge(a) {
    if (!a) return null;
    var min = null;
    function use(n) {
      n = +n;
      if (!isFinite(n)) return;
      min = min == null ? n : Math.max(min, n);
    }
    if (a.minAge != null && a.minAge !== "") use(a.minAge);
    if (a.min_age != null && a.min_age !== "") use(a.min_age);
    var code = String(a.rating || a.audience || "").toUpperCase().replace(/\s+/g, "");
    if (code === "PG-13" || code === "PG13") use(13);
    else if (code === "R" || code === "18+") use(18);
    else if (code === "MA" || code === "21+" || code === "NC-17") use(21);
    else if (code === "NR") use(999);
    else if (/^\d{1,3}$/.test(code)) use(code);
    var blob = [a.rating, a.audience, a.label, a.name].join(" ");
    if (/(^|\W)21\s?\+(?!\w)/i.test(blob)) use(21);
    else if (/(^|\W)18\s?\+(?!\w)/i.test(blob)) use(18);
    if (/\bPG-?13\b/i.test(blob)) use(13);
    if (/\b(nsfw|explicit)\b/i.test(blob)) use(18);
    if (!String(a.rating || "").trim() && a.minAge == null && a.min_age == null && !a.audience) {
      var ar = window.CognationAutoRate;
      var named = String(a.label || a.name || "");
      if (ar && named) {
        var r = (ar.rate(named, []) || {}).rating;
        if (r === "PG-13") use(13);
        else if (r === "R") use(18);
        else if (r === "MA") use(21);
        else if (r === "NR") use(999);
      }
    }
    return min;
  }
  function photoVisible(a) {
    var min = photoMinAge(a);
    if (min == null) return true;
    var age = feedViewerAge();
    if (min >= 21 && age < 21) return false;
    return age >= min;
  }
  function photoSrc(a) {
    var url = String((a && (a.dataUrl || a.url || a.src || a.imageUrl)) || "");
    if (/^data:image\/(png|jpeg|gif|webp);/i.test(url)) return url;
    if (/^https?:\/\/[^"'<>\s]+$/i.test(url)) return url;
    if (/^assets\/[a-z0-9./_-]+\.(png|jpe?g|gif|webp)$/i.test(url)) return url;
    var name = String((a && (a.name || a.label)) || "");
    var kind = String((a && a.kind) || "").toLowerCase();
    if (/\.(pdf|docx?|txt|mp4|mov|webm)$/i.test(name) || kind === "video" || kind === "document" || kind === "note") return "";
    if (kind === "photo" || kind === "image") return "assets/feed/market-square.jpg";
    return "";
  }
  function renderAttachments(list) {
    if (!list || !list.length) return "";
    var html = list.map(function (a) {
      if (a && a.kind === "event") return "";
      var src = photoSrc(a) || attachmentImageUrl(a);
      if (src) {
        if (!photoVisible(a)) return "";
        return '<img class="tower-feed-photo" alt="" src="' + escapeHtml(src) + '">';
      }
      var name = (a && (a.label || a.name)) || "file";
      var missing = a && a.kind === "photo";
      return (
        '<span class="tower-attach tower-attach--' +
        escapeHtml((a && a.kind) || "document") +
        (missing ? " tower-attach--missing" : "") +
        '"><span class="tower-attach-kind">' +
        escapeHtml(kindLabel(a && a.kind)) +
        '</span> <span class="tower-attach-name">' +
        escapeHtml(name) +
        "</span>" +
        (missing ? ' <span class="tower-attach-note">· photo wasn\'t uploaded</span>' : "") +
        "</span>"
      );
    }).join("");
    return html.trim() ? '<div class="tower-attachments">' + html + "</div>" : "";
  }
  window.CognationFeedPhotos = { html: renderAttachments, minAge: photoMinAge };

  var TOWER_POST_REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🔥"];

  function towerReactionViewerId() {
    try {
      var sess = localStorage.getItem("cognation.session.v2");
      if (sess) {
        var parsed = JSON.parse(sess);
        if (usingRemoteSocial() && parsed && parsed.activeProfileId) {
          return String(parsed.activeProfileId);
        }
        if (parsed && parsed.username) return String(parsed.username).toLowerCase();
      }
    } catch (e) {}
    return "you";
  }

  function buildTowerPostReactBar(post, root) {
    var wrap = document.createElement("div");
    wrap.className = "tower-post-reactbar";
    wrap.setAttribute("data-tower-post-id", post.id || "");

    var me = towerReactionViewerId();
    var reactions = post.reactions && typeof post.reactions === "object" ? post.reactions : {};
    var controls = document.createElement("div");
    controls.className = "tower-react-controls";
    TOWER_POST_REACTIONS.forEach(function (face) {
      var users = Array.isArray(reactions[face]) ? reactions[face] : [];
      var mine = users.indexOf(me) >= 0;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tower-react-face" + (mine ? " is-mine" : "");
      b.setAttribute("data-tower-react", face);
      b.setAttribute("aria-pressed", mine ? "true" : "false");
      b.setAttribute("aria-label", (mine ? "Remove your " : "React with ") + face);
      b.textContent = face;
      /* Bind directly to the control so the reaction remains clickable inside
         profile layouts that add their own pointer/drag interactions. */
      b.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var result = TowerStore.toggleReaction(post.id, face);
        var paint = function (out) {
          if (!out || !out.ok) return;
          renderFeed(root);
        };
        if (result && typeof result.then === "function") {
          result.then(paint);
          return;
        }
        paint(result);
      });
      controls.appendChild(b);
    });
    wrap.appendChild(controls);
    return wrap;
  }


  function postAuthorFromProfile(profile) {
    profile = profile || TowerProfileStore.get();
    var name = String((profile && profile.displayName) || "").trim();
    if (name && name.toLowerCase() !== "you") return name.slice(0, 80);
    var handle = normalizeHandle((profile && profile.handle) || "");
    if (handle) return handle;
    try {
      var sess = localStorage.getItem("cognation.session.v2");
      if (sess) {
        var parsed = JSON.parse(sess);
        if (parsed && parsed.username) return String(parsed.username).trim().slice(0, 80);
      }
    } catch (e) {}
    return name || "You";
  }


  /** Compose + feed live under SIGNAL → Feed (outside [data-tower-app]). */
  function towerFeedQuery(root, sel) {
    if (root) {
      var inRoot = root.querySelector(sel);
      if (inRoot) return inRoot;
    }
    var host = document.querySelector("[data-signal-feed-host]");
    if (host) {
      var inHost = host.querySelector(sel);
      if (inHost) return inHost;
    }
    return document.querySelector(sel);
  }

  /* Seed / ops authors carry the shared SeedOps Demo badge (js/seedops-badge.js),
     same markup as the Times byline. Judged by the author, not the post's
     `seeded` flag, so real members never get it. */
  function towerPostSeedBadge(post) {
    var api = window.CognationSeedOpsBadge;
    if (!post || !api || typeof api.badgeHtml !== "function") return "";
    try {
      return api.badgeHtml({
        accountKind: post.accountKind || "",
        isSeed: !!post.isSeed,
        isOpsBot: !!post.isOpsBot,
        seedFleetId: post.seedFleetId || "",
        /* No handle: the badge follows the account fields (server posts carry
           them from profiles.account_kind / seed_fleet_id via supabase-social
           mapPost). */
        id: post.authorProfileId || "",
      }) || "";
    } catch (e) {
      return "";
    }
  }

  /* Empty Send a signal post (PM wording): shown before any request is sent. */
  var EMPTY_POST_LINE = "Write something before posting.";

  /* Post failure line (js/signal-post-as.js postErrorLine; PM wording). */
  function towerPostErrorLine(error) {
    var pa = typeof window !== "undefined" ? window.CognationSignalPostAs : null;
    if (pa && typeof pa.postErrorLine === "function") return pa.postErrorLine(error);
    return "Couldn't post. Try again.";
  }

  /* Feed card byline. Server posts name the page that wrote them (Personal or
     Professional: post.authorKind from tower_posts.author_profile_id) with its
     picture (profiles.photo_url, else initials) and link to that page. Local
     posts keep the plain name. */
  function towerPostAuthorSlug(post) {
    if (!post || !post._remote) return "";
    return String(post.handle || post.authorProfileId || "").trim();
  }

  function towerPostAuthorHtml(post) {
    var name = escapeHtml(post.authorName || "Neighbor");
    var slug = towerPostAuthorSlug(post);
    if (!slug) {
      return '<span class="tower-author">' + name + towerPostSeedBadge(post) + "</span>";
    }
    var photo = String(post.authorPhotoUrl || "");
    var avatar = /^https:\/\//i.test(photo)
      ? '<span class="tower-author-avatar has-photo" aria-hidden="true"><img src="' + escapeHtml(photo) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>'
      : '<span class="tower-author-avatar" aria-hidden="true">' + escapeHtml(initials(post.authorName || "Neighbor")) + "</span>";
    return '<span class="tower-author">' +
      '<a class="tower-author-link" href="#tower-profile-' + escapeHtml(encodeURIComponent(slug)) + '"' +
      ' data-tower-author-open="' + escapeHtml(slug) + '"' +
      ' data-author-kind="' + (post.authorKind === "professional" ? "professional" : "personal") + '">' +
      avatar + '<span class="tower-author-name">' + name + "</span></a>" +
      towerPostSeedBadge(post) + "</span>";
  }

  function bindTowerAuthorLinks(list) {
    if (!list || list.__towerAuthorLinksBound || typeof list.addEventListener !== "function") return;
    list.__towerAuthorLinksBound = true;
    list.addEventListener("click", function (ev) {
      var link = ev.target && ev.target.closest ? ev.target.closest("a[data-tower-author-open]") : null;
      if (!link || !list.contains(link)) return;
      var slug = link.getAttribute("data-tower-author-open") || "";
      if (!slug || typeof window.CognationTowerOpenProfile !== "function") return;
      ev.preventDefault();
      try { window.CognationTowerOpenProfile(slug); } catch (eOpen) {
        try { location.hash = "tower-profile-" + slug; } catch (eHash) {}
      }
    });
  }

  function renderFeed(root) {
    var list = towerFeedQuery(root, "[data-tower-feed]");
    if (!list) return;
    bindTowerAuthorLinks(list);
    list.__ageFloorUnder13 = viewerUnder13();
    var posts = TowerStore.list().filter(towerPostVisibleToViewer);
    list.innerHTML = "";
    if (!posts.length) {
      list.innerHTML = '<p class="commune-empty">No Feed posts yet — send the first signal.</p>';
      return;
    }
    posts.forEach(function (post) {
      var article = document.createElement("article");
      article.className = "tower-post";
      article.setAttribute("data-tower-post", post.id || "");
      article.setAttribute("data-post-audience", post.profileKind === "professional" ? "professional" : "personal");
      article.innerHTML =
        '<header class="tower-post-meta">' +
        towerPostAuthorHtml(post) +
        '<time datetime="' +
        escapeHtml(post.createdAt) +
        '">' +
        escapeHtml(formatTime(post.createdAt)) +
        "</time></header>" +
        (post.body
          ? '<p class="tower-post-body">' + escapeHtml(post.body).replace(/(^|[^A-Za-z0-9_])(#addevent)\b/ig, '$1<a class="tower-invite-tag" href="#addevent" data-feed-add-event="' + escapeHtml(post.id || "") + '">$2</a>') + "</p>"
          : "") +
        feedInviteHtml(post) +
        renderAttachments(post.attachments);
      article.appendChild(buildTowerPostReactBar(post, root));
      list.appendChild(article);
      /* Comments under server Feed posts (signed-in only; js/news-comments.js). */
      try {
        if (window.CognationFeedComments && window.CognationFeedComments.mount) {
          window.CognationFeedComments.mount(article, { id: post.id || "" });
        }
      } catch (eComments) {}
    });
    bindFeedInvites(list);
  }

  var INVITE_MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  function proseInviteDate(body) {
    var m = String(body || "").match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i);
    if (!m) return "";
    var mo = INVITE_MONTHS[m[1].toLowerCase()];
    var day = parseInt(m[2], 10);
    if (!mo || day < 1 || day > 31) return "";
    return m[3] + "-" + pad2(mo) + "-" + pad2(day);
  }
  function proseInviteTitle(body) {
    var m = String(body || "").match(/\bhosting\s+(?:an?\s+)?(.+?)\s+on\s+/i);
    if (!m) return "";
    var t = m[1].trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
  }
  function eventFromPost(post) {
    var list = (post && post.attachments) || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].kind === "event") {
        var parts = String(list[i].label || "").split("|");
        return { when: parts[0] || "", what: parts.slice(1).join("|") };
      }
    }
    return { when: "", what: "" };
  }
  function inviteHostSlug(post) {
    var slug = "";
    try { slug = towerPostAuthorSlug(post); } catch (eSlug) {}
    if (!slug) slug = String((post && post.handle) || "").replace(/^@/, "").trim();
    return slug;
  }
  function feedInvite(post) {
    var body = String((post && post.body) || "");
    if (!/(^|[^A-Za-z0-9_])#addevent\b/i.test(body)) return null;
    var ev = eventFromPost(post);
    var iso = coerceEventWhen(ev.when);
    var date = iso ? iso.slice(0, 10) : proseInviteDate(body);
    var time = iso ? iso.slice(11, 16) : "";
    var what = String(ev.what || "").trim();
    var title = what ? what.charAt(0).toUpperCase() + what.slice(1) : (proseInviteTitle(body) || "Event");
    return { title: title.slice(0, 120), date: date, time: time, slug: inviteHostSlug(post), name: (post && post.authorName) || "Host" };
  }
  function inviteWhenLabel(invite) {
    if (!invite || !invite.date) return "";
    var parts = invite.date.split("-");
    var names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var label = (names[parseInt(parts[1], 10) - 1] || "") + " " + parseInt(parts[2], 10) + ", " + parts[0];
    if (invite.time) label += " · " + formatEventTime(invite.time);
    return label;
  }
  function feedInviteHtml(post) {
    var invite = feedInvite(post);
    if (!invite) return "";
    var where = invite.slug
      ? '<a class="tower-invite-where" href="#tower-profile-' + escapeHtml(encodeURIComponent(invite.slug)) + '" data-tower-author-open="' + escapeHtml(invite.slug) + '">' + escapeHtml(invite.name + "\u2019s Tower page") + "</a>"
      : "";
    return '<div class="tower-post-invite">' +
      '<p class="tower-invite-title">' + escapeHtml(invite.title) + "</p>" +
      (inviteWhenLabel(invite) ? '<p class="tower-invite-when">' + escapeHtml(inviteWhenLabel(invite)) + "</p>" : "") +
      (where ? '<p class="tower-invite-line">Where: ' + where + "</p>" : "") + "</div>";
  }
  function addInviteToOwnCalendar(post) {
    var invite = feedInvite(post);
    if (!invite || !/^\d{4}-\d{2}-\d{2}$/.test(invite.date)) return false;
    var personal = viewerPersonalRecord();
    var accounts = window.CognationAccounts;
    if (!personal || !accounts || typeof accounts.saveProfileRecord !== "function") return false;
    var who = String(personal.accountUsername || "").toLowerCase();
    var handle = String(personal.handle || "").replace(/^@/, "").toLowerCase();
    if (who === "cognation" || handle === "cognation") return false;
    var id = "invite-" + String(post.id || invite.date).replace(/[^a-z0-9-]/gi, "").slice(0, 48);
    var event = normalizeCalendarEvent({
      id: id, title: invite.title, date: invite.date, time: invite.time || "",
      notes: "", status: "accepted", source: "owner", hostHandle: invite.slug,
    });
    var list = normalizeCalendarEventsList(personal.calendarEvents || []);
    var found = false;
    list = list.map(function (e) {
      if (e && e.id === id) { found = true; return event; }
      return e;
    });
    if (!found) list.push(event);
    personal.calendarEvents = list;
    if (!accounts.saveProfileRecord(personal)) return false;
    var app = document.querySelector("[data-tower-app]");
    if (app) { try { refreshTowerCalendars(app); } catch (eCal) {} }
    return true;
  }
  function openOutlookInvite(invite) {
    if (!invite || !invite.date) return;
    var slug = invite.slug || "";
    var loc = slug ? ((location.origin || "") + (location.pathname || "/") + "#tower-profile-" + encodeURIComponent(slug)) : "";
    var start = invite.time ? invite.date + "T" + invite.time + ":00" : invite.date;
    var end = invite.time ? invite.date + "T" + invite.time + ":00" : towerCalAddDaysIso(invite.date, 1);
    var url = "https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent" +
      (invite.time ? "" : "&allday=true") +
      "&subject=" + encodeURIComponent(invite.title || "Event") +
      "&startdt=" + encodeURIComponent(start) +
      "&enddt=" + encodeURIComponent(end) +
      "&location=" + encodeURIComponent(loc) +
      "&body=" + encodeURIComponent((invite.title || "Event") + (loc ? "\n" + loc : ""));
    window.open(url, "_blank", "noopener");
  }
  function bindFeedInvites(list) {
    if (!list || list.__feedInviteBound) return;
    list.__feedInviteBound = true;
    list.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-feed-add-event]") : null;
      if (!btn || !list.contains(btn)) return;
      ev.preventDefault();
      var id = btn.getAttribute("data-feed-add-event") || "";
      var post = null;
      TowerStore.list().forEach(function (p) { if (p && p.id === id) post = p; });
      if (!post) return;
      var invite = feedInvite(post);
      if (!addInviteToOwnCalendar(post)) return;
      openOutlookInvite(invite);
    });
  }

  function initials(name) {
    var parts = String(name || "?").trim().split(/\s+/);
    var a = (parts[0] && parts[0][0]) || "?";
    var b = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (a + b).toUpperCase();
  }

  function renderBadges(root, badges) {
    var el =
      root.querySelector("[data-tower-badges]:not(details)") ||
      root.querySelector("[data-tower-badge-stage]") ||
      null;
    if (!el) return;
    if (el.tagName && el.tagName.toLowerCase() === "details") return;
    el.innerHTML = "";
    ["role", "interest", "status"].forEach(function (k) {
      var v = badges && badges[k];
      if (!v) return;
      var span = document.createElement("span");
      span.className = "tower-badge";
      span.textContent = BADGE_LABELS[v] || v;
      el.appendChild(span);
    });
  }

  var TOWER_FONT_MAP = {
    georgia: 'Georgia, "Times New Roman", Times, serif',
    chomsky: '"Chomsky", "Old English Text MT", Georgia, serif',
    system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    serif: 'Georgia, "Palatino Linotype", Palatino, "Times New Roman", serif',
    sans: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    scrapbook: '"Comic Sans MS", "Chalkboard SE", "Marker Felt", cursive',
  };

  var TOWER_FONT_IDS = Object.keys(TOWER_FONT_MAP);
  var DEFAULT_FEED_BG = "#fff5f9";

  function normalizeTowerFont(id) {
    id = String(id || "georgia").toLowerCase();
    return TOWER_FONT_IDS.indexOf(id) >= 0 ? id : "georgia";
  }

  function normalizeFeedBgColor(raw) {
    var s = String(raw || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      return ("#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
    }
    return DEFAULT_FEED_BG;
  }

  function normalizePrivateFontSize(n) {
    var v = parseInt(n, 10);
    if ([14, 16, 18, 20].indexOf(v) === -1) return 16;
    return v;
  }

  function normalizePublicThemeColor(raw, fallback) {
    var fb = fallback || "#4a2c3a";
    var s = String(raw || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      return ("#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
    }
    return fb;
  }

  function normalizeBackgroundMode(mode, collage, html) {
    var m = String(mode || "").toLowerCase().trim();
    if (m === "solid" || m === "collage" || m === "html") return m;
    /* Migration: infer from existing collage / html */
    if (html && String(html).trim()) return "html";
    if (collage && collage.layoutId && collage.layoutId !== "none" && COLLAGE_LAYOUTS[collage.layoutId]) {
      return "collage";
    }
    return "solid";
  }

  function normalizePrivateFeedTheme(raw) {
    var t = raw && typeof raw === "object" ? raw : {};
    return {
      backgroundColor: normalizeFeedBgColor(t.backgroundColor || DEFAULT_PRIVATE_FEED_THEME.backgroundColor),
      fontFamily: normalizeTowerFont(t.fontFamily || DEFAULT_PRIVATE_FEED_THEME.fontFamily),
      fontSize: normalizePrivateFontSize(t.fontSize != null ? t.fontSize : DEFAULT_PRIVATE_FEED_THEME.fontSize),
      textColor: (function () {
        var rawC = t.textColor || DEFAULT_PRIVATE_FEED_THEME.textColor;
        var c = normalizeFeedBgColor(rawC);
        /* normalizeFeedBgColor falls back to pink feed bg — keep private text dark */
        if (c === DEFAULT_FEED_BG && String(rawC || "").toLowerCase() !== DEFAULT_FEED_BG) {
          return DEFAULT_PRIVATE_FEED_THEME.textColor;
        }
        return c;
      })(),
      buttonColor: (function () {
        var rawB = t.buttonColor || DEFAULT_PRIVATE_FEED_THEME.buttonColor;
        var c = normalizeFeedBgColor(rawB);
        if (c === DEFAULT_FEED_BG && String(rawB || "").toLowerCase() !== DEFAULT_FEED_BG) {
          return DEFAULT_PRIVATE_FEED_THEME.buttonColor;
        }
        return c;
      })(),
      authorSeeThrough: t.authorSeeThrough !== false,
      messagesSeeThrough: t.messagesSeeThrough !== false,
    };
  }

  function getSessionUsername() {
    try {
      var session =
        (window.CognationAuth &&
          typeof window.CognationAuth.getSession === "function" &&
          window.CognationAuth.getSession()) ||
        null;
      if (!session) {
        try {
          var raw = localStorage.getItem("cognation.session.v2");
          if (raw) session = JSON.parse(raw);
        } catch (e) {}
      }
      return session && session.username ? String(session.username).trim().toLowerCase() : "";
    } catch (e2) {
      return "";
    }
  }

  /** Logged-in viewer owns the currently resolved Tower profile. */
  function isTowerOwner(profile) {
    var remoteSession = getSessionObject();
    profile = profile || TowerProfileStore.get();
    if (!profile) return false;
    /* Directory / other-person shells are never editable by the viewer. */
    if (profile._directoryFriend) return false;
    if (
      remoteSession &&
      remoteSession.source === "supabase" &&
      remoteSession.activeProfileId &&
      profile._profileId === remoteSession.activeProfileId
    ) {
      return true;
    }
    /* Same Cognation account owns every face (Personal + Professional). Match by
       server user id or myProfiles so a stale activeProfileId / handle mismatch
       (e.g. seed-0003 vs seed-alex-0003) never locks the owner out. */
    if (
      remoteSession &&
      remoteSession.source === "supabase" &&
      remoteSession.supabaseUserId
    ) {
      if (
        profile._userId &&
        String(profile._userId) === String(remoteSession.supabaseUserId)
      ) {
        return true;
      }
      var socialOwn = remoteSocial();
      if (socialOwn && typeof socialOwn.getMyProfiles === "function") {
        var mineRemote = socialOwn.getMyProfiles() || [];
        var pidOwn = String(profile._profileId || "");
        for (var mi = 0; mi < mineRemote.length; mi++) {
          if (mineRemote[mi] && String(mineRemote[mi].id) === pidOwn) return true;
        }
      }
    }
    var user = getSessionUsername();
    if (!user) return false;
    if (window.CognationAccounts) {
      var id = (profile && profile._profileId) || TowerProfileStore.getActiveProfileId();
      var rec = id ? window.CognationAccounts.getProfileById(id) : null;
      if (rec && String(rec.accountUsername || "").toLowerCase() === user) return true;
      var mine = window.CognationAccounts.getProfilesForUsername(user) || [];
      if (mine.length) {
        var handle = normalizeHandle((profile && profile.handle) || "");
        for (var i = 0; i < mine.length; i++) {
          if (normalizeHandle(mine[i].handle) === handle && handle) return true;
          if (mine[i].id === id) return true;
        }
      }
    }
    var handle2 = String((profile && profile.handle) || "")
      .trim()
      .toLowerCase()
      .replace(/^@/, "");
    if (user === "alexa" && (!handle2 || handle2 === "alexa" || handle2 === "alexa-pro")) return true;
    if (handle2 && handle2 === user) return true;
    return false;
  }

  function profilePublicSlug(profile) {
    profile = profile || TowerProfileStore.get();
    var handleVal = normalizeHandle((profile && profile.handle) || "");
    if (handleVal) return handleVal;
    /* Demo founder without a saved handle still shares as /alexa */
    if (isFounderOwner(profile)) return "alexa";
    /* No handle: link by profile id, never by a slug of the display name
       (two people named the same would share one link). */
    var idVal = String((profile && (profile._profileId || profile.id)) || "").trim();
    return idVal || "you";
  }

  function profilePublicHash(profile) {
    return "tower-profile-" + profilePublicSlug(profile);
  }

  function profilePublicUrl(profile) {
    var hash = profilePublicHash(profile);
    try {
      var u = new URL(window.location.href);
      u.hash = hash;
      return u.toString();
    } catch (e) {
      return (window.location.origin || "") + (window.location.pathname || "/") + "#" + hash;
    }
  }

  function readStoredTowerSide() {
    try {
      var v = sessionStorage.getItem(TOWER_SIDE_KEY);
      if (v === "private" || v === "public") return v;
    } catch (e) {}
    return null;
  }

  function writeStoredTowerSide(side) {
    try {
      sessionStorage.setItem(TOWER_SIDE_KEY, side === "public" ? "public" : "private");
    } catch (e) {}
  }

  function hashRequestsPublicSide() {
    var hash = (location.hash || "").replace(/^#/, "");
    return !!(hash && hash.indexOf("tower-profile-") === 0);
  }

  function applyPrivateFeedTheme(root, theme) {
    theme = normalizePrivateFeedTheme(theme);
    var privateSide = root.querySelector("[data-tower-private-side]");
    var feedHost = document.querySelector("[data-signal-feed-host]");
    var targets = [];
    if (privateSide) targets.push(privateSide);
    if (feedHost) targets.push(feedHost);
    if (!targets.length) return;
    var fontStack = TOWER_FONT_MAP[theme.fontFamily] || TOWER_FONT_MAP.georgia;
    targets.forEach(function (el) {
      el.style.setProperty("--tower-private-bg", theme.backgroundColor);
      el.style.setProperty("--tower-private-font", fontStack);
      el.style.setProperty("--tower-private-font-size", theme.fontSize + "px");
      el.style.setProperty("--tower-private-text", theme.textColor);
      el.style.setProperty("--tower-private-btn", theme.buttonColor);
      el.setAttribute("data-tower-private-font", theme.fontFamily);
      el.setAttribute("data-author-see-through", theme.authorSeeThrough ? "true" : "false");
      el.setAttribute("data-messages-see-through", theme.messagesSeeThrough ? "true" : "false");
    });
    var bgIn = root.querySelector("[data-tower-private-bg]");
    var fontIn = root.querySelector("[data-tower-private-font]");
    var sizeIn = root.querySelector("[data-tower-private-font-size]");
    var textIn = root.querySelector("[data-tower-private-text]");
    var btnIn = root.querySelector("[data-tower-private-btn]");
    var authorSee = root.querySelector("[data-tower-private-author-see-through]");
    var msgSee = root.querySelector("[data-tower-private-messages-see-through]");
    if (bgIn && document.activeElement !== bgIn) bgIn.value = theme.backgroundColor;
    if (fontIn && document.activeElement !== fontIn) fontIn.value = theme.fontFamily;
    if (sizeIn && document.activeElement !== sizeIn) sizeIn.value = String(theme.fontSize);
    if (textIn && document.activeElement !== textIn) textIn.value = theme.textColor;
    if (btnIn && document.activeElement !== btnIn) btnIn.value = theme.buttonColor;
    if (authorSee) authorSee.checked = !!theme.authorSeeThrough;
    if (msgSee) msgSee.checked = !!theme.messagesSeeThrough;
  }

  function readPrivateFeedThemeFromForm(root) {
    var bgIn = root.querySelector("[data-tower-private-bg]");
    var fontIn = root.querySelector("[data-tower-private-font]");
    var sizeIn = root.querySelector("[data-tower-private-font-size]");
    var textIn = root.querySelector("[data-tower-private-text]");
    var btnIn = root.querySelector("[data-tower-private-btn]");
    var authorSee = root.querySelector("[data-tower-private-author-see-through]");
    var msgSee = root.querySelector("[data-tower-private-messages-see-through]");
    return normalizePrivateFeedTheme({
      backgroundColor: bgIn ? bgIn.value : DEFAULT_PRIVATE_FEED_THEME.backgroundColor,
      fontFamily: fontIn ? fontIn.value : DEFAULT_PRIVATE_FEED_THEME.fontFamily,
      fontSize: sizeIn ? sizeIn.value : DEFAULT_PRIVATE_FEED_THEME.fontSize,
      textColor: textIn ? textIn.value : DEFAULT_PRIVATE_FEED_THEME.textColor,
      buttonColor: btnIn ? btnIn.value : DEFAULT_PRIVATE_FEED_THEME.buttonColor,
      authorSeeThrough: authorSee ? !!authorSee.checked : true,
      messagesSeeThrough: msgSee ? !!msgSee.checked : true,
    });
  }

  /* Share/copy link: live sessions link only to one of the viewer's own pages
     (getMyProfiles). The viewed page's handle is never used; no own page of
     that kind means no link. */
  function viewerShareProfile(profile) {
    var s = getSessionObject();
    if (!s || s.source !== "supabase") return profile;
    var mine = viewerOwnProfiles();
    var id = String((profile && (profile._profileId || profile.id)) || "");
    for (var i = 0; i < mine.length; i++) {
      if (id && String(mine[i].id) === id) return { _profileId: mine[i].id, handle: mine[i].handle };
    }
    var kind = profile && profile._profileKind === "professional" ? "professional" : "personal";
    var own = viewerOwnProfileOfKind(kind);
    return own ? { _profileId: own.id, handle: own.handle } : null;
  }

  function viewerShareUrl(profile) {
    var share = viewerShareProfile(profile);
    return share ? profilePublicUrl(share) : "";
  }

  function syncPublicUrlFields(root, profile) {
    var url = viewerShareUrl(profile);
    root.querySelectorAll("[data-tower-public-url], [data-tower-public-url-preview]").forEach(function (el) {
      if (document.activeElement !== el) el.value = url;
    });
  }

  /* The pill under your photo ([data-tower-add-friends]) jumps to people search.
     Only the owner sees it (CSS hides it for visitors), so on your own Tower it
     reads "Find friends" (Personal) / "Find people" (Pro), never "+ friend" /
     "+ follow". Visitor views keep the old label on the hidden pill. */
  function syncOwnerPeoplePill(root, profile, owner) {
    if (!root) return;
    var pro = profileIsProfessional(profile);
    var houseHandle = String((profile && profile.handle) || "").replace(/^@/, "").toLowerCase();
    var housePage = pro && (
      String((profile && (profile._profileId || profile.id)) || "") === "prof-alexa-professional" ||
      houseHandle === "alexa-pro" ||
      houseHandle === "cognation"
    );
    root.querySelectorAll("[data-tower-add-friends]").forEach(function (el) {
      if (housePage) {
        el.hidden = true;
        return;
      }
      if (owner) {
        el.textContent = pro ? "Find people" : "Find friends";
        el.setAttribute("aria-label", pro ? "Find people to follow" : "Find friends");
      } else {
        el.textContent = pro ? "+ follow" : "+ friend";
        el.setAttribute("aria-label", pro ? "Follow this professional page" : "Add this person as a friend");
      }
    });
  }

  /** Hide mutate chrome when the viewer is not the profile owner. */
  function syncViewerMutateUi(root) {
    if (!root) return;
    var p = TowerProfileStore.get();
    var owner = isTowerOwner(p);
    root.setAttribute("data-tower-is-owner", owner ? "true" : "false");
    /* Your own Tower never shows Add friend / Follow / Message (the visitor row). */
    if (owner) {
      root.querySelectorAll("[data-tower-follow-row]").forEach(function (row) { row.hidden = true; });
    }
    syncOwnerPeoplePill(root, p, owner);
    if (!owner) {
      root.querySelectorAll("[contenteditable='true']").forEach(function (el) {
        el.removeAttribute("contenteditable");
      });
    }
    root.querySelectorAll(
      "[data-tower-profile-form] input, [data-tower-profile-form] textarea, [data-tower-profile-form] select, [data-tower-profile-form] button," +
      "[data-tower-save-friends], [data-tower-save-badges], [data-tower-save-frame]," +
      "[data-tower-public-look-save], [data-tower-private-theme-save]," +
      "[data-tower-collage-apply], [data-tower-collage-demo], [data-tower-add-widget]," +
      "[data-tower-choose-avatar], [data-tower-clear-avatar]," +
      "[data-tower-music-url-inline], [data-tower-music-look], [data-tower-music-skin]," +
      "[data-tower-avatar-file], [data-tower-avatar-file-panel], [data-tower-instax-file]," +
      "[data-tower-name-size], [data-tower-slogan], [data-tower-public-widget], [data-tower-badge-vis]"
    ).forEach(function (el) {
      el.disabled = !owner;
    });
    var edit = root.querySelector("[data-tower-profile-edit]");
    if (edit) {
      edit.hidden = !owner;
      if (!owner) {
        edit.classList.remove("is-open");
        var panel = edit.querySelector("[data-tower-profile-edit-panel]");
        var btn = edit.querySelector("[data-tower-edit-profile]");
        if (panel) panel.hidden = true;
        if (btn) btn.setAttribute("aria-expanded", "false");
      }
    }
    var onPublic = root.getAttribute("data-tower-side") === "public";
    root.querySelectorAll("[data-tower-profile-name], [data-tower-handle-badge]").forEach(function (el) {
      el.classList.toggle("is-owner-editable", !!(owner && onPublic));
      if (!owner && el.getAttribute("contenteditable") === "true") {
        el.removeAttribute("contenteditable");
      }
    });
    root.querySelectorAll("[data-tower-social]").forEach(function (input) {
      input.readOnly = !owner;
      input.disabled = !owner;
    });
    root.querySelectorAll("[data-tower-friends-search], [data-tower-friends-count]").forEach(function (el) {
      el.disabled = !owner;
      if ("readOnly" in el) el.readOnly = !owner;
    });
    /* Go live / Offline belong to this account only. Hide them on every other profile. */
    root.querySelectorAll("[data-go-live]").forEach(function (el) {
      el.hidden = !owner;
      if (!owner) el.setAttribute("hidden", "");
      else el.removeAttribute("hidden");
    });
    if (!owner) {
      if (root.classList) root.classList.remove("is-live-open");
      root.querySelectorAll("[data-live-stage]").forEach(function (el) {
        el.hidden = true;
      });
    }
  }

  function applyTowerSide(root, side, opts) {
    opts = opts || {};
    var owner = isTowerOwner(TowerProfileStore.get());
    root.setAttribute("data-tower-is-owner", owner ? "true" : "false");
    try { syncViewerMutateUi(root); } catch (eMut) {}
    /* Connections | Public profile switch is gone. The profile stays on the public page. */
    side = "public";
    root.setAttribute("data-tower-side", side);
    var privateSide = root.querySelector("[data-tower-private-side]");
    var publicSide = root.querySelector("[data-tower-public-side]");
    if (privateSide) {
      privateSide.hidden = side !== "private";
      privateSide.setAttribute("aria-hidden", side === "private" ? "false" : "true");
    }
    if (publicSide) {
      publicSide.hidden = side !== "public";
      publicSide.setAttribute("aria-hidden", side === "public" ? "false" : "true");
    }
    root.querySelectorAll("[data-tower-side-btn]").forEach(function (btn) {
      var on = btn.getAttribute("data-tower-side-btn") === side;
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.classList.toggle("is-selected", on);
      btn.tabIndex = on ? 0 : -1;
    });
    var toggle = root.querySelector("[data-tower-side-toggle]");
    /* Private | Public switch restored (hidden by #59). Owner only. */
    if (toggle) toggle.hidden = !owner;
    root.querySelectorAll("[data-tower-side-jump]").forEach(function (jump) {
      jump.hidden = !owner;
      var target = jump.getAttribute("data-tower-side-jump");
      jump.classList.toggle("is-current", target === side);
    });
    if (opts.persist !== false && owner) writeStoredTowerSide(side);
    /* Re-apply sticker layout when showing public so positions paint after unhide */
    if (side === "public") {
      try {
        var cur = TowerProfileStore.get();
        applyWidgetLayout(root, cur);
        applyPublicWidgets(root, cur);
        renderBadgePins(root, cur);
        syncOwnerStickerHandles(root);
        initTowerMusic(root, cur);
        initTowerVideo(root, cur);
        syncRotateToolbar(root);
        syncProfileKindToggle(root);
        refreshTowerCalendars(root);
      } catch (e) {}
    } else {
      try {
        syncOwnerStickerHandles(root);
        clearWidgetSelection(root.querySelector("[data-tower-scrapbook]"));
        syncRotateToolbar(root);
        refreshTowerCalendars(root);
      } catch (e2) {}
    }
  }

  function initTowerSideToggle(root) {
    if (!root || root.__cognationSideBound) return;
    root.__cognationSideBound = true;
    var owner = isTowerOwner(TowerProfileStore.get());
    applyTowerSide(root, "public", { persist: false });
    if (owner) writeStoredTowerSide("public");

    root.querySelectorAll("[data-tower-side-btn]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        applyTowerSide(root, btn.getAttribute("data-tower-side-btn") || "private");
      });
    });
    root.querySelectorAll("[data-tower-side-jump]").forEach(function (jump) {
      jump.addEventListener("click", function () {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        applyTowerSide(root, jump.getAttribute("data-tower-side-jump") || "public");
      });
    });

    window.addEventListener("hashchange", function () {
      if (hashRequestsPublicSide()) {
        applyTowerSide(root, "public");
        renderProfileChrome(root);
        document.dispatchEvent(new CustomEvent("cognation:tower-view-changed"));
      }
    });

    document.addEventListener("cognation:session-started", function () {
      applyTowerSide(root, "public");
      syncPublicUrlFields(root, TowerProfileStore.get());
    });
  }

  function initPrivateFeedThemeControls(root) {
    if (!root || root.__cognationPrivateThemeBound) return;
    root.__cognationPrivateThemeBound = true;
    var saveBtn = root.querySelector("[data-tower-private-theme-save]");
    var status = root.querySelector("[data-tower-private-theme-status]");
    function setStatus(msg, isError) {
      if (!status) return;
      status.hidden = !msg;
      status.textContent = msg || "";
      status.classList.toggle("is-error", !!isError);
    }
    function livePreview() {
      applyPrivateFeedTheme(root, readPrivateFeedThemeFromForm(root));
    }
    ["data-tower-private-bg", "data-tower-private-font", "data-tower-private-font-size", "data-tower-private-text", "data-tower-private-btn", "data-tower-private-author-see-through", "data-tower-private-messages-see-through"].forEach(function (sel) {
      var el = root.querySelector("[" + sel + "]");
      if (!el) return;
      el.addEventListener("input", livePreview);
      el.addEventListener("change", livePreview);
    });
    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        var p = TowerProfileStore.get();
        p.privateFeedTheme = readPrivateFeedThemeFromForm(root);
        if (!TowerProfileStore.save(p)) {
          setStatus("Could not save feed look.", true);
          return;
        }
        applyPrivateFeedTheme(root, p.privateFeedTheme);
        setStatus("Feed look saved (private only).", false);
      });
    }
  }

  function initPublicUrlCopy(root) {
    if (!root || root.__cognationPublicUrlBound) return;
    root.__cognationPublicUrlBound = true;
    root.querySelectorAll("[data-tower-copy-public-url]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var url = viewerShareUrl(TowerProfileStore.get());
        syncPublicUrlFields(root, TowerProfileStore.get());
        if (!url) return;
        function ok() {
          var prev = btn.textContent;
          btn.textContent = "Copied";
          window.setTimeout(function () {
            btn.textContent = prev;
          }, 1200);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(ok).catch(function () {
            var input = root.querySelector("[data-tower-public-url]") || root.querySelector("[data-tower-public-url-preview]");
            if (input) {
              input.focus();
              input.select();
            }
          });
        } else {
          var input2 = root.querySelector("[data-tower-public-url]") || root.querySelector("[data-tower-public-url-preview]");
          if (input2) {
            input2.focus();
            input2.select();
            try {
              document.execCommand("copy");
              ok();
            } catch (e) {}
          }
        }
      });
    });
  }

  /** Founder bottle-cap + patch: exclusive to Alexa (login user alexa / her profile).
   *  Non-alexa profile handles never show Founder. Gifted awards are unrelated. */
  function isFounderOwner(profile) {
    if (!profile) {
      try {
        profile = TowerProfileStore.load() || {};
      } catch (e0) {
        profile = {};
      }
    }
    var handle = String((profile && profile.handle) || "")
      .trim()
      .toLowerCase()
      .replace(/^@/, "");
    var name = String((profile && profile.displayName) || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    var nameIsAlexa =
      name === "alexa" ||
      name === "alexa thomas" ||
      name === "alexa j thomas" ||
      name === "alexa j. thomas";

    /* Explicit non-alexa profile identity → never Founder */
    if (handle && handle !== "alexa") return false;
    if (name && name !== "you" && !nameIsAlexa && handle !== "alexa") {
      /* named as someone else without alexa handle */
      if (!handle) return false;
    }

    if (handle === "alexa" || nameIsAlexa) return true;

    /* Default / empty profile owned by logged-in alexa */
    var user = "";
    try {
      var session =
        (window.CognationAuth &&
          typeof window.CognationAuth.getSession === "function" &&
          window.CognationAuth.getSession()) ||
        null;
      if (!session) {
        try {
          var raw = localStorage.getItem("cognation.session.v2");
          if (raw) session = JSON.parse(raw);
        } catch (e) {}
      }
      user = session && session.username ? String(session.username).trim().toLowerCase() : "";
    } catch (e2) {}
    if (user === "alexa" && (!handle || handle === "alexa")) {
      if (!name || name === "you" || nameIsAlexa) return true;
    }
    return false;
  }

  function renderFounderBadges(stage, opts) {
    if (!stage) return;
    opts = opts || {};
    var showCap = opts.showCap !== false;
    var showPatch = opts.showPatch !== false;
    if (showCap) {
      var pin = document.createElement("figure");
      pin.className = "tower-bottle-cap tower-bottle-cap--founder";
      pin.setAttribute("data-founder-badge", "cap");
      pin.title = "Founder";
      var pinImg = document.createElement("img");
      pinImg.src = "assets/badges/founder-bottle-cap.png";
      pinImg.width = 200;
      pinImg.height = 200;
      pinImg.alt = "Founder — 1950s soda bottle cap badge";
      pin.appendChild(pinImg);
      var pinCap = document.createElement("figcaption");
      pinCap.className = "tower-badge-caption";
      pinCap.textContent = "Founder";
      pin.appendChild(pinCap);
      stage.appendChild(pin);
    }
    if (showPatch) {
      var patch = document.createElement("figure");
      patch.className = "tower-bottle-cap tower-awarded-pin tower-awarded-pin--patch";
      patch.setAttribute("data-founder-badge", "patch");
      patch.title = "Founder patch";
      var patchImg = document.createElement("img");
      patchImg.src = "assets/badges/founder-patch.png";
      patchImg.width = 160;
      patchImg.height = 160;
      patchImg.alt = "Founder — embroidered vest patch";
      patch.appendChild(patchImg);
      var patchCap = document.createElement("figcaption");
      patchCap.className = "tower-badge-caption";
      patchCap.textContent = "Founder patch";
      patch.appendChild(patchCap);
      stage.appendChild(patch);
    }
  }

  function applyTowerTheme(root, profile) {
    if (!root) return;
    var fontId = normalizeTowerFont(profile && profile.towerFont);
    var bg = normalizeFeedBgColor(profile && profile.feedBackgroundColor);
    var textColor = normalizePublicThemeColor(
      profile && profile.publicTextColor,
      "#4a2c3a"
    );
    var btnColor = normalizePublicThemeColor(
      profile && profile.publicButtonColor,
      "#f4a4c4"
    );
    var bgMode = normalizeBackgroundMode(
      profile && profile.backgroundMode,
      profile && profile.backgroundCollage,
      profile && profile.backgroundHtml
    );
    var fontStack = TOWER_FONT_MAP[fontId] || TOWER_FONT_MAP.georgia;
    root.style.setProperty("--tower-font", fontStack);
    root.style.setProperty("--tower-feed-bg", bg);
    root.style.setProperty("--tower-public-text", textColor);
    root.style.setProperty("--tower-public-btn", btnColor);
    root.setAttribute("data-tower-font", fontId);
    root.setAttribute("data-tower-bg-mode", bgMode);
    var scrapbook = root.querySelector("[data-tower-scrapbook]");
    if (scrapbook) {
      scrapbook.style.setProperty("--tower-font", fontStack);
      scrapbook.style.setProperty("--tower-feed-bg", bg);
      scrapbook.style.setProperty("--tower-public-text", textColor);
      scrapbook.style.setProperty("--tower-public-btn", btnColor);
      scrapbook.setAttribute("data-tower-bg-mode", bgMode);
    }
    var publicSide = root.querySelector("[data-tower-public-side]");
    if (publicSide) {
      publicSide.style.setProperty("--tower-font", fontStack);
      publicSide.style.setProperty("--tower-feed-bg", bg);
      publicSide.style.setProperty("--tower-public-text", textColor);
      publicSide.style.setProperty("--tower-public-btn", btnColor);
    }
    var fontSel = root.querySelector("[data-tower-font]");
    if (fontSel && document.activeElement !== fontSel) fontSel.value = fontId;
    var bgIn = root.querySelector("[data-tower-feed-bg]");
    if (bgIn && document.activeElement !== bgIn) bgIn.value = bg;
    var textIn = root.querySelector("[data-tower-public-text]");
    if (textIn && document.activeElement !== textIn) textIn.value = textColor;
    var btnIn = root.querySelector("[data-tower-public-btn]");
    if (btnIn && document.activeElement !== btnIn) btnIn.value = btnColor;
    var modeSel = root.querySelector("select[data-tower-bg-mode]");
    if (modeSel && document.activeElement !== modeSel) modeSel.value = bgMode;
    var htmlIn = root.querySelector("[data-tower-bg-html]");
    if (htmlIn && document.activeElement !== htmlIn) {
      htmlIn.value = (profile && typeof profile.backgroundHtml === "string")
        ? profile.backgroundHtml
        : "";
    }
    applyPublicBackground(root, profile);
  }

  function clearCollageStage(root) {
    var stage = root.querySelector("[data-tower-collage-stage]");
    if (!stage) return;
    stage.innerHTML = "";
    stage.setAttribute("data-layout", "none");
    stage.hidden = true;
  }

  function clearBgHtmlStage(root) {
    var stage = root.querySelector("[data-tower-bg-html-stage]");
    if (!stage) return;
    stage.innerHTML = "";
    stage.hidden = true;
  }

  function renderBgHtmlStage(root, html) {
    var stage = root.querySelector("[data-tower-bg-html-stage]");
    if (!stage) return;
    stage.innerHTML = sanitizeProfileHtml(html || "");
    stage.hidden = !stage.innerHTML;
  }

  function paintPageBackgroundImage(el, url) {
    if (!el) return;
    if (url) {
      el.style.setProperty("--tower-bg-image", 'url("' + String(url).replace(/"/g, "") + '")');
      el.setAttribute("data-has-bg-image", "true");
    } else {
      el.style.removeProperty("--tower-bg-image");
      el.removeAttribute("data-has-bg-image");
    }
  }

  /** Apply an uploaded image, or the saved collage / html background, behind stickers. */
  function applyPublicBackground(root, profile) {
    if (!root) return;
    var imageUrl = profile && typeof profile.backgroundImageDataUrl === "string"
      ? profile.backgroundImageDataUrl
      : "";
    var hasImage = imageUrl.indexOf("data:image/") === 0;
    var scrapbook = root.querySelector("[data-tower-scrapbook]");
    var publicSide = root.querySelector("[data-tower-public-side]");
    if (hasImage) {
      clearCollageStage(root);
      clearBgHtmlStage(root);
      paintPageBackgroundImage(scrapbook, imageUrl);
      paintPageBackgroundImage(publicSide, imageUrl);
      return;
    }
    paintPageBackgroundImage(scrapbook, "");
    paintPageBackgroundImage(publicSide, "");
    var mode = normalizeBackgroundMode(
      profile && profile.backgroundMode,
      profile && profile.backgroundCollage,
      profile && profile.backgroundHtml
    );
    var collageStage = root.querySelector("[data-tower-collage-stage]");
    if (mode === "solid") {
      clearCollageStage(root);
      clearBgHtmlStage(root);
      if (collageStage) collageStage.hidden = true;
    } else if (mode === "html") {
      clearCollageStage(root);
      if (collageStage) collageStage.hidden = true;
      renderBgHtmlStage(root, profile && profile.backgroundHtml);
    } else {
      /* collage */
      clearBgHtmlStage(root);
      if (collageStage) collageStage.hidden = false;
      renderCollageStage(root, profile);
    }
  }

  function getBadgePinLayout(p) {
    if (!p.badgePinLayout || typeof p.badgePinLayout !== "object") {
      p.badgePinLayout = {};
    }
    return p.badgePinLayout;
  }

  /** Default badge pin dock — offset from badges sticker so pins do not stack on friend pins. */
  function defaultBadgePinPos(p, index) {
    var badges = widgetPos(p, "badges") || DEFAULT_WIDGET_LAYOUT.badges;
    var baseX = typeof badges.x === "number" ? badges.x : DEFAULT_WIDGET_LAYOUT.badges.x;
    var baseY = typeof badges.y === "number" ? badges.y : DEFAULT_WIDGET_LAYOUT.badges.y;
    var col = index % 4;
    var row = Math.floor(index / 4);
    return {
      x: Math.max(0, Math.min(88, baseX + 22 + col * 10)),
      y: Math.max(0, Math.min(88, baseY + 10 + row * 14)),
      z: 14 + index,
      tilt: 0,
    };
  }

  function ensureBadgePinPositions(p, badgeIds) {
    var pinLayout = getBadgePinLayout(p);
    var changed = false;
    badgeIds.forEach(function (id, index) {
      var pos = pinLayout[id];
      if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") {
        pinLayout[id] = defaultBadgePinPos(p, index);
        changed = true;
      }
    });
    p.badgePinLayout = pinLayout;
    return changed;
  }

  function applyBadgePinPosition(pin, pos) {
    applyFriendPinPosition(pin, pos);
  }

  function collectVisibleBadgePins(profile) {
    var items = [];
    if (isFounderOwner(profile)) {
      if (isBadgeVisible(profile, "founder-cap")) {
        items.push({
          id: "founder-cap",
          title: "Founder",
          caption: "Founder",
          imageUrl: "assets/badges/founder-bottle-cap.png",
          alt: "Founder — 1950s soda bottle cap badge",
        });
      }
      if (isBadgeVisible(profile, "founder-patch")) {
        items.push({
          id: "founder-patch",
          title: "Founder patch",
          caption: "Founder patch",
          imageUrl: "assets/badges/founder-patch.png",
          alt: "Founder — embroidered vest patch",
        });
      }
    }
    var list = (profile && profile.awardedBadges) || [];
    list.forEach(function (badge) {
      if (!badge || badge.kind === "founder") return;
      if (!badge.id || !isBadgeVisible(profile, badge.id)) return;
      var caption = badge.title || "Award";
      items.push({
        id: badge.id,
        title: badge.title || "Award",
        caption: caption,
        imageUrl: badge.imageUrl || "assets/badges/award-peer.svg",
        alt:
          (badge.title || "Award") +
          (badge.fromName ? " from " + badge.fromName : ""),
        tip:
          (badge.title || "Award") +
          (badge.subtitle ? " · " + badge.subtitle : "") +
          (badge.fromName ? " — from " + badge.fromName : ""),
      });
    });
    return items;
  }

  function setBadgeDisplayStatus(root, msg) {
    var st = root && root.querySelector("[data-tower-badges-status]");
    if (st) st.textContent = msg || "";
  }

  function renderBadgePins(root, profile) {
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (!stage) return;
    stage.classList.add("is-sticker-stage");
    ensureStickersOnStage(stage);
    var p = profile || TowerProfileStore.get();
    if (p) settleArrivalTilts(p);
    var widgets = normalizePublicWidgets(p && p.publicWidgets);
    stage.querySelectorAll("[data-tower-badge-pin]").forEach(function (el) {
      el.remove();
    });
    /* Milestone text lives on the Badges sticker. Pins are not a public gallery. */
    return;
    if (!widgets.badges) return;

    var items = collectVisibleBadgePins(p);
    var ids = items.map(function (it) { return it.id; });
    if (ensureBadgePinPositions(p, ids)) {
      TowerProfileStore.save(p);
    }
    var pinLayout = getBadgePinLayout(p);
    var owner = isTowerOwner(p);
    var onPublic = root.getAttribute("data-tower-side") === "public";

    items.forEach(function (item) {
      var pos = pinLayout[item.id];
      if (!pos) return;
      var pin = document.createElement("figure");
      pin.className = "tower-badge-pin";
      pin.setAttribute("data-tower-badge-pin", item.id);
      pin.title = item.tip || item.title || item.caption;
      var img = document.createElement("img");
      img.className = "tower-badge-pin-img";
      img.src = item.imageUrl;
      img.width = 72;
      img.height = 72;
      img.alt = item.alt || item.title || "Badge";
      img.draggable = false;
      pin.appendChild(img);
      var cap = document.createElement("figcaption");
      cap.className = "tower-badge-pin-caption";
      cap.textContent = item.caption || item.title || "Badge";
      pin.appendChild(cap);
      applyBadgePinPosition(pin, pos);
      pin.classList.toggle("is-arrangeable", !!(owner && onPublic));
      stage.appendChild(pin);
    });
  }

  function renderAwardedBadgeShelf(root, profile) {
    /* Clustered shelf retired — visible badges render as scrapbook pin widgets. */
    var shelfStage = root.querySelector("[data-tower-badge-stage]");
    if (shelfStage) {
      shelfStage.querySelectorAll("[data-awarded-badge], [data-founder-badge]").forEach(function (n) {
        n.remove();
      });
      shelfStage.innerHTML = "";
    }
    renderBadgePins(root, profile || TowerProfileStore.get());
  }

  function setBadgeVisibility(root, badgeId, on) {
    if (!badgeId) return;
    var p = TowerProfileStore.get();
    if (!p.badgeVisibility || typeof p.badgeVisibility !== "object") {
      p.badgeVisibility = {};
    }
    p.badgeVisibility[badgeId] = !!on;
    if (!TowerProfileStore.save(p)) {
      setBadgeDisplayStatus(root, "Could not save badge display.");
      return;
    }
    renderAwardedBadgeShelf(root, p);
    syncBadgeVisibilityUi(root, p);
    setBadgeDisplayStatus(root, "Badge display saved");
  }

  function generateYearbookBadge(root, templateId) {
    var defs = getYearbookDemoDefs();
    var tmpl = null;
    defs.forEach(function (b) {
      if (b && b.id === templateId) tmpl = b;
    });
    if (!tmpl) return;
    var p = TowerProfileStore.get();
    if (!Array.isArray(p.awardedBadges)) p.awardedBadges = [];
    var exists = p.awardedBadges.some(function (b) {
      return b && b.id === tmpl.id;
    });
    if (exists) return;
    var copy = JSON.parse(JSON.stringify(tmpl));
    copy.awardedAt = new Date().toISOString();
    p.awardedBadges.push(copy);
    if (!p.badgeVisibility || typeof p.badgeVisibility !== "object") {
      p.badgeVisibility = {};
    }
    p.badgeVisibility[copy.id] = true;
    if (!TowerProfileStore.save(p)) {
      setBadgeDisplayStatus(root, "Could not save badge display.");
      return;
    }
    renderAwardedBadgeShelf(root, p);
    syncBadgeVisibilityUi(root, p);
    setBadgeDisplayStatus(root, "Badge display saved");
  }

  function syncBadgeVisibilityUi(root, profile) {
    var box = root.querySelector("[data-tower-badge-visibility]");
    if (!box) return;
    profile = profile || TowerProfileStore.get();
    if (!profile.badgeVisibility || typeof profile.badgeVisibility !== "object") {
      normalizeBadgeVisibility(profile);
    }
    box.innerHTML = "";

    function addCheck(id, label, checked) {
      var lab = document.createElement("label");
      lab.className = "tower-public-widget-check tower-badge-vis-check";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.setAttribute("data-tower-badge-vis", id);
      cb.checked = !!checked;
      var span = document.createElement("span");
      span.textContent = label;
      lab.appendChild(cb);
      lab.appendChild(span);
      box.appendChild(lab);
    }

    var list = profile.awardedBadges || [];
    list.forEach(function (badge) {
      if (!badge || !badge.id || badge.kind === "founder") return;
      var label = (badge.title || "Badge") + (badge.fromName ? " · from " + badge.fromName : "");
      addCheck(badge.id, label, isBadgeVisible(profile, badge.id));
    });

    if (!box.__cognationBadgeVisBound) {
      box.__cognationBadgeVisBound = true;
      box.addEventListener("change", function (ev) {
        var cb = ev.target && ev.target.closest("[data-tower-badge-vis]");
        if (!cb || !box.contains(cb)) return;
        var id = cb.getAttribute("data-tower-badge-vis");
        setBadgeVisibility(root, id, !!cb.checked);
      });
    }
  }


  function normalizeDisplayNameSize(v) {
    var n = parseInt(v, 10);
    if (isNaN(n)) n = 28;
    return Math.max(14, Math.min(200, n));
  }

  function applyDisplayNameSize(root, px) {
    px = normalizeDisplayNameSize(px);
    var wrap = root.querySelector("[data-tower-profile-name-wrap]") || root.querySelector("[data-tower-profile-name]");
    var nameEl = root.querySelector("[data-tower-profile-name]");
    var sticker = root.querySelector('[data-tower-widget="identity"]');
    if (nameEl) {
      nameEl.style.fontSize = px + "px";
      nameEl.setAttribute("data-name-size", String(px));
    }
    if (wrap && wrap !== nameEl) {
      wrap.style.setProperty("--tower-name-size", px + "px");
      wrap.setAttribute("data-name-size", String(px));
    }
    if (sticker) sticker.style.setProperty("--tower-name-size", px + "px");
    var stack = root.querySelector(".tower-avatar-stack");
    if (stack) stack.style.setProperty("--tower-name-size", px + "px");
    var range = root.querySelector("[data-tower-name-size]");
    if (range && document.activeElement !== range) range.value = String(px);
    return px;
  }

  function initDisplayNameResize(root) {
    var handle = root.querySelector("[data-tower-name-resize]");
    var nameEl = root.querySelector("[data-tower-profile-name]");
    if (!handle || !nameEl || handle.__cognationNameResizeBound) return;
    handle.__cognationNameResizeBound = true;
    handle.addEventListener("pointerdown", function (ev) {
      if (!isTowerOwner(TowerProfileStore.get())) return;
      ev.preventDefault();
      ev.stopPropagation();
      var startX = ev.clientX;
      var startY = ev.clientY;
      var startSize = normalizeDisplayNameSize(
        nameEl.getAttribute("data-name-size") ||
          parseFloat(getComputedStyle(nameEl).fontSize) ||
          28
      );
      function onMove(e) {
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        var delta = (dx + dy) / 2;
        applyDisplayNameSize(root, startSize + delta);
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        var p = TowerProfileStore.get();
        p.displayNameSize = normalizeDisplayNameSize(
          nameEl.getAttribute("data-name-size") || startSize
        );
        TowerProfileStore.save(p);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });

    var range = root.querySelector("[data-tower-name-size]");
    if (range && !range.__cognationNameSizeBound) {
      range.__cognationNameSizeBound = true;
      range.addEventListener("input", function () {
        applyDisplayNameSize(root, range.value);
      });
      range.addEventListener("change", function () {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        var p = TowerProfileStore.get();
        p.displayNameSize = normalizeDisplayNameSize(range.value);
        TowerProfileStore.save(p);
        applyDisplayNameSize(root, p.displayNameSize);
      });
    }
  }

  function applyAvatarFrameScale(root, scale) {
    scale = normalizeAvatarFrameScale(scale);
    var wrap = root.querySelector('[data-tower-widget="avatar"] [data-tower-avatar-frame]');
    if (wrap) {
      wrap.style.setProperty("--tower-avatar-frame-scale", String(scale));
      wrap.setAttribute("data-avatar-frame-scale", String(scale));
    }
    return scale;
  }

  function initAvatarFrameResize(root) {
    var handle = root.querySelector("[data-tower-avatar-resize]");
    var wrap = root.querySelector('[data-tower-widget="avatar"] [data-tower-avatar-frame]');
    if (!handle || !wrap || handle.__cognationAvatarResizeBound) return;
    handle.__cognationAvatarResizeBound = true;
    handle.addEventListener("pointerdown", function (ev) {
      if (!isTowerOwner(TowerProfileStore.get())) return;
      ev.preventDefault();
      ev.stopPropagation();
      var startX = ev.clientX;
      var startY = ev.clientY;
      var startScale = normalizeAvatarFrameScale(
        wrap.getAttribute("data-avatar-frame-scale") ||
          getComputedStyle(wrap).getPropertyValue("--tower-avatar-frame-scale") ||
          1
      );
      function onMove(e) {
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        var delta = (dx + dy) / 180;
        var next = applyAvatarFrameScale(root, startScale + delta);
        wrap.setAttribute("data-avatar-frame-scale", String(next));
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        var p = TowerProfileStore.get();
        p.avatarFrameScale = normalizeAvatarFrameScale(
          wrap.getAttribute("data-avatar-frame-scale") || 1
        );
        TowerProfileStore.save(p);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }

  var VIEWER_MUSIC_OFF_KEY = "cognation.tower.viewerMusicOff.v1";

  function viewerWantsMusicOff() {
    try {
      return sessionStorage.getItem(VIEWER_MUSIC_OFF_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function setViewerMusicOff(off) {
    try {
      sessionStorage.setItem(VIEWER_MUSIC_OFF_KEY, off ? "1" : "0");
    } catch (e) {}
  }

  var SOCIAL_NETWORKS = [
    { id: "x", label: "X", short: "X", logo: "assets/social/x.png" },
    { id: "meta", label: "Facebook", short: "FB", logo: "assets/social/meta.svg" },
    { id: "instagram", label: "Instagram", short: "IG", logo: "assets/social/instagram.png" },
    { id: "youtube", label: "YouTube", short: "YT", logo: "assets/social/youtube.png" },
    { id: "tiktok", label: "TikTok", short: "TT", logo: "assets/social/tiktok.svg" },
    { id: "linkedin", label: "LinkedIn", short: "in", logo: "assets/social/linkedin.png", professionalOnly: true },
    { id: "venmo", label: "Venmo", short: "Vm", logo: "assets/social/venmo.svg" },
    { id: "shop", label: "Shop", short: "Shop", professionalOnly: true },
    { id: "linktree", label: "Linktree", short: "Linktree", professionalOnly: true },
    { id: "applepay", label: "Apple Pay", short: "Apple Pay", professionalOnly: true },
    { id: "appleamt", label: "Amount", short: "$", professionalOnly: true },
    /* NEW (not restored): owner-set outbound link on Pro. A plain https link out;
       Cognation takes no payment, stores no card data and calls no service. */
    { id: "services", label: "Pay for services", short: "Pay for services", professionalOnly: true, quiet: true, httpsOnly: true },
    { id: "ads", label: "Buy ads", short: "Buy ads", professionalOnly: true, quiet: true, httpsOnly: true },
  ];

  /* https only (no http, no javascript:, no other schemes). */
  function safeHttpsUrl(raw) {
    var u = String(raw || "").trim();
    if (!u) return "";
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = "https://" + u;
    try {
      var parsed = new URL(u);
      return parsed.protocol === "https:" ? parsed.href : "";
    } catch (e) {
      return "";
    }
  }

  function safeHttpUrl(raw) {
    var u = String(raw || "").trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    try {
      var parsed = new URL(u);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      return parsed.href;
    } catch (e) {
      return "";
    }
  }

  function normalizeHandle(raw) {
    return String(raw || "")
      .trim()
      .replace(/^@+/, "")
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 32);
  }

  function formatSongLine(p) {
    var title = (p.musicTitle || "").trim() || "Untitled";
    var artist = (p.musicArtist || "").trim();
    return artist ? title + " — " + artist : title;
  }

  function parseYoutubeVideoId(raw) {
    var href = safeHttpUrl(raw);
    if (!href) return "";
    try {
      var u = new URL(href);
      var host = (u.hostname || "").replace(/^www\./i, "").toLowerCase();
      if (host === "youtu.be") {
        var shortId = (u.pathname || "").split("/").filter(Boolean)[0] || "";
        shortId = shortId.split("?")[0];
        return /^[\w-]{11}$/.test(shortId) ? shortId : "";
      }
      if (
        host === "youtube.com" ||
        host === "m.youtube.com" ||
        host === "music.youtube.com" ||
        host === "youtube-nocookie.com"
      ) {
        var v = u.searchParams.get("v");
        if (v && /^[\w-]{11}$/.test(v)) return v;
        var parts = (u.pathname || "").split("/").filter(Boolean);
        if (
          parts.length >= 2 &&
          (parts[0] === "embed" ||
            parts[0] === "shorts" ||
            parts[0] === "live" ||
            parts[0] === "v")
        ) {
          var pathId = parts[1].split("?")[0];
          return /^[\w-]{11}$/.test(pathId) ? pathId : "";
        }
      }
    } catch (e) {}
    return "";
  }

  function looksLikeYoutubeUrl(raw) {
    var href = safeHttpUrl(raw);
    if (!href) return false;
    try {
      var host = new URL(href).hostname.replace(/^www\./i, "").toLowerCase();
      return (
        host === "youtu.be" ||
        host === "youtube.com" ||
        host === "m.youtube.com" ||
        host === "music.youtube.com" ||
        host === "youtube-nocookie.com" ||
        host.slice(-12) === ".youtube.com"
      );
    } catch (eYt) {
      return false;
    }
  }

  function youtubeEmbedSrc(videoId, muted, autoplay) {
    var origin = "";
    try { origin = window.location.origin || ""; } catch (eOrigin) {}
    var q =
      "enablejsapi=1&playsinline=1&rel=0&modestbranding=1&autoplay=" +
      (autoplay ? "1" : "0") +
      "&mute=" +
      (muted ? "1" : "0");
    if (origin) q += "&origin=" + encodeURIComponent(origin);
    return "https://www.youtube.com/embed/" + encodeURIComponent(videoId) + "?" + q;
  }

  function postYoutubeCommand(iframe, func) {
    if (!iframe || !iframe.contentWindow) return;
    try {
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: func, args: [] }),
        "*"
      );
    } catch (e) {}
  }

  function clearTowerAudio(audio) {
    if (!audio) return;
    try {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    } catch (e) {}
  }

  function savedPinkVideoId() {
    try {
      var profile = TowerProfileStore.get();
      if (!profile || profile._profileKind === "professional") return "";
      if (visibleMusicSkin(profile.musicSkin || "classic") !== "classic") return "";
      if (profile.musicEnabled === false) return "";
      return parseYoutubeVideoId(profile.musicUrl || "");
    } catch (eKeep) {
      return "";
    }
  }

  function clearYoutubeEmbed(root) {
    var frame = root.querySelector("[data-tower-youtube-frame]");
    var iframe = frame && frame.querySelector("iframe");
    var keep = savedPinkVideoId();
    if (keep && iframe && iframe.getAttribute("data-yt-id") === keep && iframe.getAttribute("src")) {
      var ytKeep = root.querySelector("[data-tower-youtube]");
      if (ytKeep) {
        ytKeep.hidden = false;
        ytKeep.removeAttribute("hidden");
      }
      var wrapKeep = root.querySelector("[data-tower-music]");
      if (wrapKeep && wrapKeep.getAttribute("data-music-skin") !== "pro") {
        wrapKeep.setAttribute("data-music-mode", "youtube");
        wrapKeep.setAttribute("data-music-skin", "classic");
      }
      return;
    }
    var yt = root.querySelector("[data-tower-youtube]");
    if (frame) frame.innerHTML = "";
    if (yt) yt.hidden = true;
    ensureYoutubeResizeHandle(root);
  }

  /* Professional page: empty box plus a link field. No pink player and no MP3 face. */
  function showEmptyProYoutube(root, profileId) {
    var box = root.querySelector("[data-tower-pro-youtube]");
    var frame = root.querySelector("[data-tower-pro-youtube-frame]");
    /* #24 keeps this profile's video through a later blank read. A video that
       belongs to another Pro page (the one viewed before) is cleared, so the
       next page with no video shows an empty box. */
    var ownerId = frame ? frame.getAttribute("data-tower-pro-youtube-profile") || "" : "";
    var sameProfile = !!profileId && ownerId === String(profileId);
    if (frame && (!frame.querySelector("iframe") || !sameProfile)) {
      frame.innerHTML = "";
      frame.removeAttribute("data-tower-pro-youtube-profile");
    }
    if (!box) return;
    box.hidden = false;
    box.classList.remove("has-video");
  }

  function ensureProYoutubeIframe(root, videoId, profileId) {
    var box = root.querySelector("[data-tower-pro-youtube]");
    var frame = root.querySelector("[data-tower-pro-youtube-frame]");
    if (!box || !frame || !videoId) return null;
    if (profileId) frame.setAttribute("data-tower-pro-youtube-profile", String(profileId));
    else frame.removeAttribute("data-tower-pro-youtube-profile");
    box.hidden = false;
    box.classList.add("has-video");
    var src = youtubeEmbedSrc(videoId, false, false);
    var iframe = frame.querySelector("iframe");
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.setAttribute("title", "YouTube");
      iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
      iframe.setAttribute("allowfullscreen", "");
      iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      frame.appendChild(iframe);
    }
    if (iframe.getAttribute("data-yt-id") !== videoId) iframe.src = src;
    iframe.setAttribute("data-yt-id", videoId);
    return iframe;
  }

  function ensureYoutubeIframe(root, videoId, muted, autoplay) {
    var yt = root.querySelector("[data-tower-youtube]");
    var frame = root.querySelector("[data-tower-youtube-frame]");
    if (!yt || !frame) return null;
    yt.hidden = false;
    yt.removeAttribute("hidden");
    var src = youtubeEmbedSrc(videoId, muted, !!autoplay);
    var iframe = frame.querySelector("iframe");
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.setAttribute("title", "YouTube favorite song");
      iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
      iframe.setAttribute("allowfullscreen", "");
      iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      iframe.loading = "eager";
      frame.appendChild(iframe);
    }
    var already = iframe.getAttribute("data-yt-id") === videoId && iframe.getAttribute("src");
    if (!already && iframe.getAttribute("src") !== src) iframe.src = src;
    iframe.setAttribute("data-yt-id", videoId);
    return iframe;
  }

  function loadYoutubeApi(done) {
    if (window.YT && window.YT.Player) {
      done();
      return;
    }
    var queue = window.__cognationYtQueue || (window.__cognationYtQueue = []);
    queue.push(done);
    if (window.__cognationYtApiLoading) return;
    window.__cognationYtApiLoading = true;
    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prev === "function") prev();
      var pending = window.__cognationYtQueue || [];
      window.__cognationYtQueue = [];
      pending.forEach(function (fn) {
        try { fn(); } catch (eApi) {}
      });
    };
    var script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  }

  function attachYoutubePlayer(root, iframe, videoId) {
    /* The IFrame API swaps out the embed that just appeared and leaves the
       pink screen black. Playback stays on the iframe ensureYoutubeIframe painted. */
    if (root && iframe && videoId) iframe.setAttribute("data-yt-id", videoId);
    return iframe;
  }

  function bindIpodWheel(root) {
    function currentPlayer() {
      var wrap = root.querySelector("[data-tower-music]");
      return wrap && wrap.__ytPlayer;
    }
    function seek(delta) {
      var player = currentPlayer();
      if (player && player.getCurrentTime && player.seekTo) {
        var t = 0;
        try { t = player.getCurrentTime() || 0; } catch (eTime) {}
        try { player.seekTo(Math.max(0, t + delta), true); } catch (eSeek) {}
        return;
      }
      var iframe = root.querySelector("[data-tower-youtube-frame] iframe");
      if (!iframe) return;
      var vid = iframe.getAttribute("data-yt-id") || "";
      if (!vid) return;
      var start = parseInt(iframe.getAttribute("data-yt-start") || "0", 10);
      if (isNaN(start)) start = 0;
      start = Math.max(0, start + delta);
      iframe.setAttribute("data-yt-start", String(start));
      iframe.src = youtubeEmbedSrc(vid, false, true) + "&start=" + start;
    }
    root.querySelectorAll(".tower-ipod-skip").forEach(function (btn) {
      if (btn.__cognationIpodSkip) return;
      btn.__cognationIpodSkip = true;
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        seek(btn.classList.contains("tower-ipod-skip--prev") ? -10 : 10);
      });
    });
  }

  /* Green MP3 and wood radio are not personal-profile looks. Pink is the classic note, silver is the CD. None hides the player. */
  function visibleMusicSkin(skin) {
    if (skin === "none") return "none";
    if (skin === "cd") return "cd";
    return "classic";
  }

  function applyMusicSkin(root, skin) {
    skin = skin || "classic";
    var wrap = root.querySelector("[data-tower-music]");
    if (wrap) wrap.setAttribute("data-music-skin", skin);
    root.querySelectorAll("[data-music-face]").forEach(function (el) {
      el.hidden = el.getAttribute("data-music-face") !== skin;
    });
    var side = root.querySelector("[data-tower-radio-side]");
    if (side) {
      side.hidden = skin !== "radio";
      side.setAttribute("aria-hidden", skin === "radio" ? "false" : "true");
    }
    document.body.classList.toggle("tower-radio-scroll", skin === "radio");
  }

  function hideMusicSkins(root) {
    root.querySelectorAll("[data-music-face]").forEach(function (el) {
      el.hidden = true;
    });
    var side = root.querySelector("[data-tower-radio-side]");
    if (side) {
      side.hidden = true;
      side.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("tower-radio-scroll");
  }

  function setAllMusicLabels(root, text) {
    root.querySelectorAll("[data-tower-music-label]").forEach(function (el) {
      el.textContent = text;
    });
    var sideText = root.querySelector("[data-tower-radio-side-text]");
    if (sideText) sideText.textContent = "♪ " + text + "   ·   ";
  }

  function syncMusicToggleUi(root, off) {
    root.querySelectorAll("[data-tower-music-toggle]").forEach(function (t) {
      t.setAttribute("aria-pressed", off ? "false" : "true");
      if (t.textContent === "♪" || t.getAttribute("data-music-face-btn")) {
        /* keep glyph */
      } else {
        t.textContent = off ? "Sound off" : "Sound on";
      }
    });
    var disc = root.querySelector("[data-tower-cd-disc]");
    if (disc) disc.classList.toggle("is-spinning", !off);
  }

  function bindMusicToggles(root, media) {
    media = media || {};
    root.querySelectorAll("[data-tower-music-toggle]").forEach(function (toggle) {
      toggle.onclick = function () {
        var currentlyOff = viewerWantsMusicOff();
        setViewerMusicOff(!currentlyOff);
        var off = !currentlyOff;
        syncMusicToggleUi(root, off);
        if (off) {
          if (media.audio) media.audio.pause();
          var wrapOff = root.querySelector("[data-tower-music]");
          var playerOff = wrapOff && wrapOff.__ytPlayer;
          if (playerOff && playerOff.pauseVideo) {
            try { playerOff.pauseVideo(); } catch (ePause) {}
          } else if (media.youtubeIframe) {
            postYoutubeCommand(media.youtubeIframe, "pauseVideo");
          }
        } else if (media.youtubeIframe) {
          /* Explicit user gesture: play the embed that is already in the pink screen. */
          var wrapPlay = root.querySelector("[data-tower-music]");
          var player = wrapPlay && wrapPlay.__ytPlayer;
          if (player && player.playVideo) {
            try {
              player.unMute();
              player.playVideo();
            } catch (ePlay) {
              player = null;
            }
          }
          if (!player || !player.playVideo) {
            var vid = media.youtubeIframe.getAttribute("data-yt-id") || "";
            if (vid) media.youtubeIframe.src = youtubeEmbedSrc(vid, false, true);
            else {
              postYoutubeCommand(media.youtubeIframe, "unMute");
              postYoutubeCommand(media.youtubeIframe, "playVideo");
            }
          }
        } else if (media.audio) {
          media.audio.muted = false;
          var playPromise = media.audio.play();
          if (playPromise && playPromise.catch) {
            playPromise.catch(function () {
              media.audio.muted = true;
              media.audio.play().catch(function () {});
            });
          }
        }
      };
    });
  }



  function ensureYoutubeResizeHandle(root) {
    var yt = root.querySelector("[data-tower-youtube]");
    if (!yt) return null;
    var frame = root.querySelector("[data-tower-youtube-frame]");
    var handle = root.querySelector("[data-tower-youtube-resize]");
    if (handle && frame && frame.contains(handle)) {
      yt.appendChild(handle);
    }
    if (!handle) {
      handle = document.createElement("button");
      handle.type = "button";
      handle.className = "tower-youtube-resize";
      handle.setAttribute("data-tower-youtube-resize", "");
      handle.setAttribute("aria-label", "Drag to resize YouTube width");
      handle.title = "Drag to resize YouTube width";
      yt.appendChild(handle);
    } else if (handle.parentNode !== yt) {
      yt.appendChild(handle);
    }
    return handle;
  }

  function applyYoutubeWidth(root, widthPx) {
    var w = Math.max(180, Math.min(720, parseInt(widthPx, 10) || 320));
    var wrap = root.querySelector("[data-tower-music]");
    if (wrap) {
      wrap.style.setProperty("--tower-youtube-width", w + "px");
      wrap.setAttribute("data-yt-width", String(w));
    }
    return w;
  }

  function initYoutubeResize(root) {
    var handle = root.querySelector("[data-tower-youtube-resize]");
    var wrap = root.querySelector("[data-tower-music]");
    if (!handle || !wrap || handle.__cognationYtResizeBound) return;
    handle.__cognationYtResizeBound = true;
    handle.addEventListener("pointerdown", function (ev) {
      if (!isTowerOwner(TowerProfileStore.get())) return;
      ev.preventDefault();
      ev.stopPropagation();
      var startX = ev.clientX;
      var startW = wrap.getBoundingClientRect().width;
      function onMove(e) {
        var dx = e.clientX - startX;
        applyYoutubeWidth(root, startW + dx);
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        var p = TowerProfileStore.get();
        p.musicYoutubeWidth = parseInt(wrap.getAttribute("data-yt-width") || "320", 10);
        /* Geometry, like polaroid/emoji scale: write the local key reload reads.
           Do not PATCH identity or the remote row snaps width back to 320. */
        TowerProfileStore.save(p, { geometry: true });
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }

  function syncMusicLookButtons(root, skin) {
    root.querySelectorAll("[data-tower-music-look]").forEach(function (btn) {
      var on = btn.getAttribute("data-tower-music-look") === skin;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("is-selected", on);
    });
  }

  function bindMusicOwnerControls(root) {
    var inline = root.querySelector("[data-tower-music-url-inline]");
    if (inline && !inline.__cognationMusicUrlBound) {
      inline.__cognationMusicUrlBound = true;
      function commitMusicUrl() {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        var cur = TowerProfileStore.get();
        var next = (inline.value || "").trim().slice(0, 500);
        if (next === String(cur.musicUrl || "")) return;
        cur.musicUrl = next;
        if (!TowerProfileStore.save(cur)) return;
        var saved = TowerProfileStore.get();
        applyPublicWidgets(root, saved);
        initTowerMusic(root, saved);
      }
      inline.addEventListener("change", commitMusicUrl);
      inline.addEventListener("paste", function () {
        setTimeout(commitMusicUrl, 0);
      });
      inline.addEventListener("input", function () {
        if (parseYoutubeVideoId(inline.value)) commitMusicUrl();
      });
      inline.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          commitMusicUrl();
          inline.blur();
        }
      });
    }
    root.querySelectorAll("[data-tower-music-look]").forEach(function (btn) {
      if (btn.__cognationMusicLookBound) return;
      btn.__cognationMusicLookBound = true;
      btn.addEventListener("click", function () {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        var look = visibleMusicSkin(btn.getAttribute("data-tower-music-look") || "classic");
        var cur = TowerProfileStore.get();
        cur.musicSkin = look;
        if (look !== "none") cur.musicEnabled = true;
        if (!TowerProfileStore.save(cur)) return;
        renderProfileChrome(root);
      });
    });
  }

  function showMusicSticker(root, on, p) {
    var musicSticker = root.querySelector('[data-tower-widget="music"]');
    if (!musicSticker) return;
    if (on && widgetRemovedByOwner(p || TowerProfileStore.get(), "music")) on = false;
    musicSticker.hidden = !on;
    musicSticker.classList.toggle("is-widget-off", !on);
    if (!on) musicSticker.classList.remove("is-widget-selected");
  }

  /* Professional pages: the YouTube player is its own widget. Personal pages never show it. */
  function showYoutubeSticker(root, on) {
    var yt = root.querySelector('[data-tower-widget="youtube"]');
    if (!yt) return;
    yt.hidden = !on;
    yt.classList.toggle("is-widget-off", !on);
    if (!on) yt.classList.remove("is-widget-selected");
  }

  function bindProYoutubeUrl(root) {
    var input = root.querySelector("[data-tower-pro-youtube-url]");
    if (!input || input.__cognationProYtBound) return;
    input.__cognationProYtBound = true;
    function commit() {
      var cur = TowerProfileStore.get();
      if (!isTowerOwner(cur) || !profileIsProfessional(cur)) return;
      var next = (input.value || "").trim().slice(0, 500);
      if (next === String(cur.musicUrl || "")) return;
      cur.musicUrl = next;
      if (!TowerProfileStore.save(cur)) return;
      try {
        if (window.CognationTowerLayoutSync && CognationTowerLayoutSync.savePublic) {
          CognationTowerLayoutSync.savePublic(TowerProfileStore.get());
        }
      } catch (eYt) {}
      var saved = TowerProfileStore.get();
      applyPublicWidgets(root, saved);
      initTowerMusic(root, saved);
    }
    input.addEventListener("change", commit);
    input.addEventListener("paste", function () {
      setTimeout(commit, 0);
    });
    input.addEventListener("input", function () {
      if (parseYoutubeVideoId(input.value)) commit();
    });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        commit();
        input.blur();
      }
    });
  }

  function initTowerMusic(root, p) {
    var wrap = root.querySelector("[data-tower-music]");
    var audio = root.querySelector("[data-tower-audio]");
    if (!wrap || !audio) return;

    applyYoutubeWidth(root, p && p.musicYoutubeWidth);
    ensureYoutubeResizeHandle(root);
    initYoutubeResize(root);
    var url = (p.musicUrl || "").trim();
    var skin = visibleMusicSkin(p.musicSkin || "classic");
    var personal = !isProTower(p);
    var ownerPublic = isTowerOwner(p) && root.getAttribute("data-tower-side") === "public";
    var enabled = p.musicEnabled !== false && skin !== "none" && personal;
    var ytId = parseYoutubeVideoId(url);
    var inlineUrl = root.querySelector("[data-tower-music-url-inline]");
    if (inlineUrl && document.activeElement !== inlineUrl) inlineUrl.value = url;
    setAllMusicLabels(root, url ? formatSongLine(p) : "Song — Artist");
    bindMusicOwnerControls(root);
    syncMusicLookButtons(root, skin);
    var proBox = root.querySelector("[data-tower-pro-youtube]");
    var looks = root.querySelector(".tower-music-looks");
    if (!personal) {
      /* No music player on Professional. YouTube lives in its own widget. */
      hideMusicSkins(root);
      clearYoutubeEmbed(root);
      clearTowerAudio(audio);
      wrap.hidden = true;
      wrap.removeAttribute("data-music-mode");
      showMusicSticker(root, false);
      showYoutubeSticker(root, true);
      bindProYoutubeUrl(root);
      var proInput = root.querySelector("[data-tower-pro-youtube-url]");
      if (proInput && document.activeElement !== proInput) proInput.value = url;
      var proProfileId = (p && p._profileId) || "";
      if (ytId) ensureProYoutubeIframe(root, ytId, proProfileId);
      else showEmptyProYoutube(root, proProfileId);
      return;
    }
    showYoutubeSticker(root, false);
    if (widgetRemovedByOwner(p, "music")) {
      /* The owner removed Music: no player for anyone until Show. */
      clearYoutubeEmbed(root);
      clearTowerAudio(audio);
      hideMusicSkins(root);
      wrap.hidden = true;
      wrap.removeAttribute("data-music-mode");
      showMusicSticker(root, false, p);
      if (proBox) proBox.hidden = true;
      return;
    }
    if (proBox) {
      proBox.hidden = true;
      proBox.classList.remove("has-video");
      var proFrame = proBox.querySelector("[data-tower-pro-youtube-frame]");
      if (proFrame) proFrame.innerHTML = "";
    }
    if (looks) looks.hidden = false;
    wrap.setAttribute("data-music-skin", skin);

    if (!enabled) {
      clearYoutubeEmbed(root);
      clearTowerAudio(audio);
      hideMusicSkins(root);
      /* None hides the player. The owner keeps Pink / Silver / None so they can turn it back on. */
      if (ownerPublic && (skin === "none" || (!personal && !url))) {
        wrap.hidden = false;
        wrap.setAttribute("data-music-mode", "none");
        showMusicSticker(root, true, p);
        return;
      }
      wrap.hidden = true;
      wrap.removeAttribute("data-music-mode");
      showMusicSticker(root, false);
      return;
    }

    showMusicSticker(root, true, p);
    if (!url) {
      var keptOnScreen = savedPinkVideoId();
      if (keptOnScreen && skin === "classic") {
        wrap.hidden = false;
        wrap.setAttribute("data-music-mode", "youtube");
        applyMusicSkin(root, "classic");
        clearTowerAudio(audio);
        var keptFrame = ensureYoutubeIframe(root, keptOnScreen, false, false);
        bindIpodWheel(root);
        bindMusicToggles(root, { youtubeIframe: keptFrame });
        syncMusicToggleUi(root, viewerWantsMusicOff());
        return;
      }
      wrap.hidden = false;
      wrap.setAttribute("data-music-mode", "audio");
      clearYoutubeEmbed(root);
      clearTowerAudio(audio);
      applyMusicSkin(root, skin);
      return;
    }

    wrap.hidden = false;

    if (ytId && skin === "classic") {
      /* Pink click-wheel. The saved video stays in the screen as a normal embed. */
      wrap.setAttribute("data-music-mode", "youtube");
      applyMusicSkin(root, "classic");
      clearTowerAudio(audio);
      var iframe = ensureYoutubeIframe(root, ytId, false, false);
      bindIpodWheel(root);
      /* First visit starts paused so the center button plays. Later visits keep that choice. */
      try {
        if (sessionStorage.getItem(VIEWER_MUSIC_OFF_KEY) == null) {
          sessionStorage.setItem(VIEWER_MUSIC_OFF_KEY, "1");
        }
      } catch (eMute) {}
      bindMusicToggles(root, { youtubeIframe: iframe });
      syncMusicToggleUi(root, viewerWantsMusicOff());
      return;
    }

    if (ytId || looksLikeYoutubeUrl(url)) {
      /* A YouTube link never becomes a file download. Silver keeps the CD face. */
      wrap.setAttribute("data-music-mode", "audio");
      clearYoutubeEmbed(root);
      clearTowerAudio(audio);
      applyMusicSkin(root, skin);
      bindIpodWheel(root);
      bindMusicToggles(root, {});
      syncMusicToggleUi(root, true);
      return;
    }

    wrap.setAttribute("data-music-mode", "audio");
    clearYoutubeEmbed(root);
    applyMusicSkin(root, skin);
    if (audio.getAttribute("src") !== url) audio.src = url;
    /* Force paused on load — Play button starts playback after an explicit gesture. */
    try {
      sessionStorage.setItem(VIEWER_MUSIC_OFF_KEY, "1");
    } catch (eAud) {}
    audio.pause();
    bindMusicToggles(root, { audio: audio });
    syncMusicToggleUi(root, true);
    root.querySelectorAll("[data-tower-music-toggle]").forEach(function (btn) {
      if (btn.getAttribute("data-music-face-btn") != null || btn.textContent === "♪") return;
      btn.textContent = "Play";
    });
  }




  function youtubeVideoEmbedSrc(videoId) {
    /* Public video sticker: no autoplay / no auto-unmute (user clicks play in embed). */
    var q = "enablejsapi=1&playsinline=1&rel=0&modestbranding=1&autoplay=0";
    return "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(videoId) + "?" + q;
  }

  function clearTowerVideoEmbed(root) {
    var frame = root.querySelector("[data-tower-video-frame]");
    if (frame) {
      Array.prototype.slice.call(frame.querySelectorAll("iframe")).forEach(function (el) {
        el.remove();
      });
    }
  }

  function ensureTowerVideoIframe(root, videoId, title) {
    var frame = root.querySelector("[data-tower-video-frame]");
    if (!frame) return null;
    var src = youtubeVideoEmbedSrc(videoId);
    var iframe = frame.querySelector("iframe");
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
      iframe.setAttribute("allowfullscreen", "");
      iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      iframe.loading = "lazy";
      /* Keep resize handle after iframe */
      var handle = frame.querySelector("[data-tower-video-resize]");
      if (handle) frame.insertBefore(iframe, handle);
      else frame.appendChild(iframe);
    }
    iframe.setAttribute("title", title || "YouTube video");
    if (iframe.getAttribute("src") !== src) iframe.src = src;
    return iframe;
  }

  function applyVideoWidth(root, widthPx) {
    var w = Math.max(200, Math.min(900, parseInt(widthPx, 10) || 360));
    var wrap = root.querySelector("[data-tower-video]");
    if (wrap) wrap.style.setProperty("--tower-video-width", w + "px");
    return w;
  }

  function initVideoResize(root) {
    var handle = root.querySelector("[data-tower-video-resize]");
    var wrap = root.querySelector("[data-tower-video]");
    if (!handle || !wrap || handle.__cognationVideoResizeBound) return;
    handle.__cognationVideoResizeBound = true;
    handle.addEventListener("pointerdown", function (ev) {
      if (!isTowerOwner(TowerProfileStore.get())) return;
      ev.preventDefault();
      ev.stopPropagation();
      var startX = ev.clientX;
      var startW = wrap.getBoundingClientRect().width;
      function onMove(e) {
        var next = applyVideoWidth(root, startW + (e.clientX - startX));
        wrap.setAttribute("data-video-width", String(next));
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        var p = TowerProfileStore.get();
        p.videoWidth = parseInt(wrap.getAttribute("data-video-width") || "360", 10);
        p.videoWidth = Math.max(200, Math.min(900, p.videoWidth || 360));
        TowerProfileStore.save(p);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }

  function bindVideoInlineUrl(root) {
    var inline = root.querySelector("[data-tower-video-url-inline]");
    if (!inline || inline.__cognationVideoInlineBound) return;
    inline.__cognationVideoInlineBound = true;

    function commitInline() {
      if (!isTowerOwner(TowerProfileStore.get())) return;
      var p = TowerProfileStore.get();
      var next = (inline.value || "").trim().slice(0, 500);
      p.videoUrl = next;
      if (p.videoEnabled == null) p.videoEnabled = true;
      TowerProfileStore.save(p);
      var formUrl = root.querySelector("[data-tower-video-url]");
      if (formUrl && document.activeElement !== formUrl) formUrl.value = next;
      initTowerVideo(root, p);
    }

    inline.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        commitInline();
        inline.blur();
      }
    });
    inline.addEventListener("blur", function () {
      commitInline();
    });
  }

  function initTowerVideo(root, p) {
    /* ONE_YOUTUBE_PLAYER_ONLY — radio/music owns the single embed */
    var wrap = root.querySelector("[data-tower-video]");
    if (wrap) {
      wrap.hidden = true;
      clearTowerVideoEmbed(root);
    }
    var sticker = root.querySelector('[data-tower-widget="video"]');
    if (sticker) {
      sticker.hidden = true;
      sticker.classList.add("is-widget-off");
    }
    return;
    var wrapUnused = root.querySelector("[data-tower-video]");
    var sticker = root.querySelector('[data-tower-widget="video"]');
    if (!wrap) return;

    var widgets = normalizePublicWidgets(p && p.publicWidgets);
    var url = (p.videoUrl || "").trim();
    var enabled = p.videoEnabled !== false;
    var ytId = parseYoutubeVideoId(url);
    var title = (p.videoTitle || "").trim();
    var empty = wrap.querySelector("[data-tower-video-empty]");
    var caption = wrap.querySelector("[data-tower-video-caption]");
    var frame = wrap.querySelector("[data-tower-video-frame]");
    var inlineWrap = wrap.querySelector("[data-tower-video-inline-wrap]");
    var inline = wrap.querySelector("[data-tower-video-url-inline]");
    var owner = isTowerOwner(p);
    var onPublic = root.getAttribute("data-tower-side") === "public";

    if (inline && document.activeElement !== inline) {
      inline.value = url;
    }

    if (inlineWrap) {
      inlineWrap.hidden = !(owner && onPublic);
    }

    if (!widgets.video || !enabled) {
      wrap.hidden = true;
      clearTowerVideoEmbed(root);
      if (empty) empty.hidden = true;
      if (caption) {
        caption.hidden = true;
        caption.textContent = "";
      }
      if (frame) frame.hidden = true;
      return;
    }

    wrap.hidden = false;
    applyVideoWidth(root, p.videoWidth || 360);
    initVideoResize(root);
    bindVideoInlineUrl(root);

    if (!ytId) {
      clearTowerVideoEmbed(root);
      if (frame) frame.hidden = true;
      if (caption) {
        caption.hidden = true;
        caption.textContent = "";
      }
      /* Owners keep the radio URL box + empty hint; viewers see nothing until a URL exists. */
      if (!owner) {
        wrap.hidden = true;
        if (empty) empty.hidden = true;
        return;
      }
      if (empty) empty.hidden = false;
      return;
    }

    if (frame) frame.hidden = false;
    if (empty) empty.hidden = true;
    ensureTowerVideoIframe(root, ytId, title || "YouTube video");
    if (caption) {
      if (title) {
        caption.hidden = false;
        caption.textContent = title;
      } else {
        caption.hidden = true;
        caption.textContent = "";
      }
    }
  }

  function socialLinkDefs() {
    return SOCIAL_NETWORKS.slice();
  }

  function socialNetAllowedForKind(net, profileKind) {
    profileKind = profileKind === "professional" ? "professional" : "personal";
    if (net && net.professionalOnly && profileKind !== "professional") return false;
    if (net && net.personalOnly && profileKind === "professional") return false;
    return true;
  }

  function venmoHref(raw) {
    var text = String(raw || "").trim();
    if (!text) return "";
    if (/^https?:\/\//i.test(text)) return safeHttpUrl(text);
    var handle = text.replace(/^@+/, "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!handle) return "";
    return "https://venmo.com/u/" + handle;
  }

  function hasCardNumber(raw) {
    return /\d(?:[ -]*\d){12,18}/.test(String(raw || ""));
  }

  function plainLabel(raw, max) {
    var t = String(raw || "").replace(/\s+/g, " ").trim().slice(0, max || 120);
    return !t || hasCardNumber(t) ? "" : t;
  }

  function socialHref(id, raw) {
    if (id === "venmo") return venmoHref(raw);
    if (id === "services" || id === "ads") return safeHttpsUrl(raw);
    if (id === "applepay" || id === "appleamt") return "";
    return safeHttpUrl(raw);
  }

  function storedSocialValue(id, value) {
    if (id === "venmo") return String(value || "").trim().slice(0, 500);
    if (id === "appleamt") return typedAmount(value); if (id === "applepay") return plainLabel(value, 120);
    if (id === "services" || id === "ads") return safeHttpsUrl(value);
    return safeHttpUrl(value);
  }

  function commitSocialDraft(root, id, value) {
    if (!isTowerOwner(TowerProfileStore.get())) return;
    var p = TowerProfileStore.get();
    if (!p.socialLinks || typeof p.socialLinks !== "object") p.socialLinks = {};
    p.socialLinks[id] = storedSocialValue(id, value);
    p.publicWidgets = normalizePublicWidgets(p.publicWidgets);
    p.publicWidgets.social = profileHasSocialLinks(p);
    writeSocialLinksLocal(p._profileId, p.socialLinks);
    TowerProfileStore.save(p);
    /* Venmo / Pay / Buy ads / socials: server copy so a fresh browser sees them. */
    try {
      if (window.CognationTowerLayoutSync && CognationTowerLayoutSync.savePublic) {
        CognationTowerLayoutSync.savePublic(TowerProfileStore.get());
      }
    } catch (ePub) {}
    var saved = TowerProfileStore.get();
    renderSocialLinks(root, saved);
    applyPublicWidgets(root, saved);
  }

  function flushSocialFieldsFromForm(root) {
    if (!root || !isTowerOwner(TowerProfileStore.get())) return;
    var p = TowerProfileStore.get();
    if (!p.socialLinks || typeof p.socialLinks !== "object") p.socialLinks = {};
    var changed = false;
    socialLinkDefs().forEach(function (net) {
      var input = root.querySelector('[data-tower-social="' + net.id + '"]');
      if (!input) return;
      var next = storedSocialValue(net.id, input.value);
      if ((p.socialLinks[net.id] || "") !== next) changed = true;
      p.socialLinks[net.id] = next;
    });
    if (!changed && profileHasSocialLinks(p) === !!(p.publicWidgets && p.publicWidgets.social)) {
      writeSocialLinksLocal(p._profileId, p.socialLinks);
      return;
    }
    p.publicWidgets = normalizePublicWidgets(p.publicWidgets);
    p.publicWidgets.social = profileHasSocialLinks(p);
    writeSocialLinksLocal(p._profileId, p.socialLinks);
    TowerProfileStore.save(p);
    try {
      if (window.CognationTowerLayoutSync && CognationTowerLayoutSync.savePublic) {
        CognationTowerLayoutSync.savePublic(TowerProfileStore.get());
      }
    } catch (eFlush) {}
    var saved = TowerProfileStore.get();
    renderSocialLinks(root, saved);
    applyPublicWidgets(root, saved);
  }

  function syncEditSocialFields(root, p) {
    var links = (p && p.socialLinks) || {};
    var profileKind = (p && (p._profileKind || p.kind)) || "personal";
    socialLinkDefs().forEach(function (net) {
      var formInput = root.querySelector('[data-tower-social="' + net.id + '"]');
      if (!formInput) return;
      var allowed = socialNetAllowedForKind(net, profileKind);
      var label = root.querySelector('label[for="' + formInput.id + '"]');
      if (!allowed) {
        formInput.hidden = true;
        if (label) label.hidden = true;
        return;
      }
      formInput.hidden = false;
      if (label) label.hidden = false;
      if (document.activeElement !== formInput) formInput.value = links[net.id] || "";
    });
  }

  function removeSocialWidget(root, netId) {
    if (!isTowerOwner(TowerProfileStore.get())) return;
    var p = TowerProfileStore.get();
    if (!p.socialLinks || typeof p.socialLinks !== "object") p.socialLinks = {};
    p.socialLinks[netId] = "";
    writeSocialLinksLocal(p._profileId, p.socialLinks);
    /* Update the layout row's public copy first: the next get() re-applies it,
       which otherwise put the removed link straight back. */
    try {
      if (window.CognationTowerLayoutSync && CognationTowerLayoutSync.savePublic) {
        CognationTowerLayoutSync.savePublic(p);
      }
    } catch (eRem0) {}
    if (p.widgetLayout && p.widgetLayout[socialWidgetId(netId)]) {
      delete p.widgetLayout[socialWidgetId(netId)];
    }
    TowerProfileStore.save(p);
    try {
      if (window.CognationTowerLayoutSync && CognationTowerLayoutSync.savePublic) {
        CognationTowerLayoutSync.savePublic(TowerProfileStore.get());
      }
    } catch (eRem) {}
    renderSocialLinks(root, TowerProfileStore.get());
    applyPublicWidgets(root, TowerProfileStore.get());
    try { spawnUnplacedWidgets(root, TowerProfileStore.get()); } catch (eSp) {}
  }

  function typedAmount(raw) {
    var n = typeof raw === "number" ? raw : Number(String(raw || "").replace(/[^0-9.]/g, ""));
    if (!isFinite(n) || n <= 0 || n > 1e9) return "";
    return "$" + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function proPayAttempt(o) {
    o = o || {};
    if (!o.signedIn) return { taken: false, text: "Sign in to pay. No payment was taken." };
    if (o.owner) return { taken: false, text: "Only the payer can start this. No payment was taken." };
    if (o.phase !== "confirm") return { taken: false, text: "", open: true };
    if (!plainLabel(o.forText, 120)) return { taken: false, text: "Name what this payment is for. No payment was taken.", open: true };
    return { taken: false, text: "No payment was taken." };
  }
  function payerSignedIn() {
    var s = getSessionObject();
    return !!(s && (s.username || s.supabaseUserId || s.activeProfileId));
  }
  function payNote(root, text) {
    var note = root.querySelector("[data-tower-pro-pay-note]");
    if (!note) return;
    note.hidden = !text;
    note.textContent = text || "";
  }
  function openProPay(root) {
    var p = TowerProfileStore.get();
    var res = proPayAttempt({ signedIn: payerSignedIn(), owner: isTowerOwner(p), phase: "open" });
    var box = root.querySelector("[data-tower-pro-pay-confirm]");
    if (!res.open) {
      if (box) box.hidden = true;
      payNote(root, res.text);
      return;
    }
    if (box) box.hidden = false;
    payNote(root, "");
  }
  function confirmProPay(root) {
    var input = root.querySelector("[data-tower-pro-pay-for]");
    var p = TowerProfileStore.get();
    var res = proPayAttempt({
      signedIn: payerSignedIn(),
      owner: isTowerOwner(p),
      phase: "confirm",
      forText: input ? input.value : "",
    });
    payNote(root, res.text);
  }
  function bindProPay(root) {
    if (!root || root.__proPay) return;
    root.__proPay = true;
    root.addEventListener("click", function (ev) {
      var t = ev.target && ev.target.closest ? ev.target : null;
      if (!t) return;
      if (t.closest("[data-tower-pro-link='applepay']")) { ev.preventDefault(); openProPay(root); }
      else if (t.closest("[data-tower-pro-pay-go]")) { ev.preventDefault(); confirmProPay(root); }
    });
  }
  function addProAnchor(row, id, label, href) {
    if (!href) return;
    var a = document.createElement("a");
    a.className = "tower-pro-link";
    a.setAttribute("data-tower-pro-link", id);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = label;
    row.appendChild(a);
  }
  function renderProLinks(root, p) {
    bindProPay(root);
    var row = root.querySelector("[data-tower-pro-links]");
    if (!row) return;
    var pro = isProTower(p);
    var links = (p && p.socialLinks) || {};
    var shop = pro ? socialHref("shop", links.shop) : "";
    var tree = pro ? socialHref("linktree", links.linktree) : "";
    var payee = pro ? storedSocialValue("applepay", links.applepay) : "";
    var amount = payee ? storedSocialValue("appleamt", links.appleamt) : "";
    var sig = [shop, tree, payee, amount].join("\n");
    if (row.getAttribute("data-sig") !== sig) {
      row.setAttribute("data-sig", sig);
      row.textContent = "";
      addProAnchor(row, "shop", "Shop", shop);
      addProAnchor(row, "linktree", "Linktree", tree);
      if (payee) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "tower-pro-link";
        b.setAttribute("data-tower-pro-link", "applepay");
        b.textContent = amount ? "Apple Pay " + amount : "Apple Pay";
        row.appendChild(b);
      }
    }
    row.hidden = !row.firstChild;
    if (!payee) {
      var box = root.querySelector("[data-tower-pro-pay-confirm]");
      if (box) box.hidden = true;
      payNote(root, "");
    }
  }
  /* v3.3: one [data-tower-widget] per linked social — never a grouped LINKS box. */
  function renderSocialLinks(root, p) {
    if (!root) return;
    migrateGroupedSocialLayout(p);
    seedPayLinksLayout(p);
    syncEditSocialFields(root, p);
    renderProLinks(root, p);
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (!stage) return;
    var links = chipSocialLinks(p);
    var profileKind = (p && (p._profileKind || p.kind)) || "personal";
    var wanted = {};
    optedInSocialNetIds(p).forEach(function (id) { wanted[id] = true; });

    /* Drop legacy grouped box and any social chip that is no longer opted in. */
    stage.querySelectorAll('[data-tower-widget="social"]').forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    stage.querySelectorAll("[data-tower-widget]").forEach(function (el) {
      var wid = el.getAttribute("data-tower-widget") || "";
      var netId = socialNetIdFromWidget(wid);
      if (!netId) return;
      if (!wanted[netId] || isPayLinkNet(netId, p) || isPageButtonNet(netId) || netId === "venmo" || netId === "services" || netId === "ads") {
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    });

    socialLinkDefs().forEach(function (net) {
      if (!wanted[net.id]) return;
      if (isPayLinkNet(net.id, p) || isPageButtonNet(net.id) || net.id === "venmo" || net.id === "services" || net.id === "ads") return;
      var wid = socialWidgetId(net.id);
      var href = socialHref(net.id, links[net.id]);
      var el = stage.querySelector('[data-tower-widget="' + wid + '"]');
      if (!el) {
        el = document.createElement("div");
        el.className = "tower-sticker tower-sticker--social-chip tower-sticker--social-" + net.id;
        el.setAttribute("data-tower-widget", wid);
        el.setAttribute("data-tower-social-chip", net.id);
        el.setAttribute("data-sticker-label", net.label);
        var handle = document.createElement("button");
        handle.type = "button";
        handle.className = "tower-sticker-handle";
        handle.setAttribute("data-tower-sticker-handle", "");
        handle.setAttribute("aria-label", "Move " + net.label + " sticker");
        handle.tabIndex = -1;
        handle.hidden = true;
        handle.textContent = "⋮⋮";
        el.appendChild(handle);
        var body = document.createElement("div");
        body.className = "tower-social-chip-body";
        el.appendChild(body);
        stage.appendChild(el);
      }
      var quiet = net.quiet || (net.id === "venmo" && profileKind === "professional");
      var bodyEl = el.querySelector(".tower-social-chip-body");
      if (bodyEl) {
        bodyEl.innerHTML = "";
        var a = document.createElement("a");
        a.className = "tower-social-btn tower-social-btn--" + net.id + (quiet ? " is-quiet" : " is-logo");
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.title = net.label;
        a.setAttribute("aria-label", "Open " + net.label + " (opens in a new tab)");
        if (net.logo && !quiet) {
          var img = document.createElement("img");
          img.src = net.logo;
          img.alt = "";
          img.setAttribute("aria-hidden", "true");
          img.decoding = "async";
          img.loading = "lazy";
          a.appendChild(img);
          /* Logo only. A name beside the mark (especially the letter X) reads
             as a delete control, so no chip paints its site name. */
        } else {
          a.textContent = quiet ? net.label : net.short;
          a.classList.remove("is-logo");
        }
        bodyEl.appendChild(a);
      }
      el.hidden = false;
      el.classList.remove("is-widget-off");
    });

    /* Old builds left an X button on each chip; drop any still in the DOM. */
    stage.querySelectorAll(".tower-social-chip-remove").forEach(function (x) {
      if (x.parentNode) x.parentNode.removeChild(x);
    });
    syncOwnerStickerHandles(root);
  }

  /* One card, one group: Venmo, Pay for services, Buy ads as stacked pills (12px
     gap). Each opens the owner's own saved link in a new tab; a link that is not
     set is not shown, and with none set there is no card. Cognation takes no
     payment here: plain outbound links only. */
  function renderPayLinks(stage, p, links, wanted) {
    var nets = isProTower(p)
      ? socialLinkDefs().filter(function (net) { return wanted[net.id] && isPayLinkNet(net.id, p) && socialHref(net.id, links[net.id]); })
      : [];
    var el = stage.querySelector('[data-tower-widget="' + PAY_LINKS_ID + '"]');
    if (!nets.length) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.className = "tower-sticker tower-sticker--pay-links";
      el.setAttribute("data-tower-widget", PAY_LINKS_ID);
      el.setAttribute("data-sticker-label", "Venmo & Buy ads");
      var handle = document.createElement("button");
      handle.type = "button";
      handle.className = "tower-sticker-handle";
      handle.setAttribute("data-tower-sticker-handle", "");
      handle.setAttribute("aria-label", "Move Venmo & Buy ads sticker");
      handle.tabIndex = -1;
      handle.hidden = true;
      handle.textContent = "⋮⋮";
      el.appendChild(handle);
      var group = document.createElement("div");
      group.className = "tower-pay-links";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", "Pay and ads links");
      group.setAttribute("data-tower-pay-links", "");
      el.appendChild(group);
      stage.appendChild(el);
    }
    var box = el.querySelector("[data-tower-pay-links]");
    el.hidden = false;
    el.classList.remove("is-widget-off");
    /* Same links as last time: leave the pills alone, so a re-render does not
       drop keyboard focus or a hover ring. */
    var sig = nets.map(function (net) { return net.id + "=" + socialHref(net.id, links[net.id]); }).join("|");
    if (box.getAttribute("data-pay-sig") === sig && box.children.length === nets.length) return;
    box.setAttribute("data-pay-sig", sig);
    box.innerHTML = "";
    nets.forEach(function (net) {
      var a = document.createElement("a");
      a.className = "tower-social-btn tower-pay-pill tower-social-btn--" + net.id;
      a.setAttribute("data-tower-pay-link", net.id);
      a.href = socialHref(net.id, links[net.id]);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = net.label;
      a.setAttribute("aria-label", "Open " + net.label + " (opens in a new tab)");
      box.appendChild(a);
    });
  }

  function getFriendPinLayout(p) {
    if (!p.friendPinLayout || typeof p.friendPinLayout !== "object") {
      p.friendPinLayout = {};
    }
    return p.friendPinLayout;
  }

  function defaultFriendPinPos(p, index) {
    var friends = widgetPos(p, "friends") || DEFAULT_WIDGET_LAYOUT.friends;
    var baseX = typeof friends.x === "number" ? friends.x : DEFAULT_WIDGET_LAYOUT.friends.x;
    var baseY = typeof friends.y === "number" ? friends.y : DEFAULT_WIDGET_LAYOUT.friends.y;
    var col = index % 4;
    var row = Math.floor(index / 4);
    return {
      x: Math.max(0, Math.min(88, baseX + 18 + col * 9)),
      y: Math.max(0, Math.min(88, baseY + row * 12)),
      z: 12 + index,
      tilt: 0,
    };
  }

  /* A Top Friend pin still on a generated default spot (never moved by the owner).
     Matches the dock formula for any base the friends widget has had, so existing
     saved defaults are recognized without a migration. */
  function isDefaultFriendPinPos(p, index, pos) {
    if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") return true;
    var bases = [widgetPos(p, "friends"), spawnCache.friends, DEFAULT_WIDGET_LAYOUT.friends];
    FACTORY_SEED_LAYOUTS.forEach(function (f) { if (f.friends) bases.push({ x: f.friends[0], y: f.friends[1] }); });
    var col = index % 4, row = Math.floor(index / 4);
    return bases.some(function (b) {
      if (!b || typeof b.x !== "number" || typeof b.y !== "number") return false;
      var dx = Math.max(0, Math.min(88, b.x + 18 + col * 9));
      var dy = Math.max(0, Math.min(88, b.y + row * 12));
      return Math.abs(dx - pos.x) < 0.05 && Math.abs(dy - pos.y) < 0.05;
    });
  }

  /** Assign dock positions only for newly featured friends missing a saved layout. Never overwrite. */
  function ensureFriendPinPositions(p, selectedIds) {
    var pinLayout = getFriendPinLayout(p);
    var saved = readSavedScrapbook(p);
    var savedPins = saved && saved.friendPinLayout && typeof saved.friendPinLayout === "object"
      ? saved.friendPinLayout
      : {};
    var changed = false;
    selectedIds.forEach(function (id, index) {
      var pos = pinLayout[id];
      if (pos && typeof pos.x === "number" && typeof pos.y === "number") return;
      var kept = savedPins[id];
      if (kept && typeof kept.x === "number" && typeof kept.y === "number") {
        pinLayout[id] = {
          x: kept.x,
          y: kept.y,
          z: typeof kept.z === "number" ? kept.z : 12,
          tilt: typeof kept.tilt === "number" ? kept.tilt : 0,
        };
        changed = true;
        return;
      }
      pinLayout[id] = defaultFriendPinPos(p, index);
      changed = true;
    });
    p.friendPinLayout = pinLayout;
    return changed;
  }

  function applyFriendPinPosition(pin, pos) {
    if (!pin || !pos) return;
    var x = typeof pos.x === "number" ? pos.x : 0;
    var y = typeof pos.y === "number" ? pos.y : 0;
    var z = typeof pos.z === "number" ? pos.z : 12;
    var tilt = typeof pos.tilt === "number" ? pos.tilt : 0;
    pin.style.setProperty("--sticker-x", x + "%");
    pin.style.setProperty("--sticker-y", y + "%");
    pin.style.setProperty("--sticker-z", String(z));
    pin.style.setProperty("--sticker-tilt", tilt + "deg");
    pin.setAttribute("data-sticker-x", String(x));
    pin.setAttribute("data-sticker-y", String(y));
    pin.setAttribute("data-sticker-z", String(z));
  }

  var TOP_FRIEND_VISIBLE = 3;

  function profileIsProfessional(p) {
    return !!(p && (p._profileKind === "professional" || p.kind === "professional"));
  }

  function houseProfessional(p) {
    if (!profileIsProfessional(p)) return false;
    var id = String((p && (p._profileId || p.id)) || "");
    var handle = String((p && p.handle) || "").replace(/^@/, "").toLowerCase();
    return id === "prof-alexa-professional" || handle === "alexa-pro" || handle === "cognation";
  }

  function personalNameOnPro(name) {
    var folded = String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
    return folded === "alexa" || folded === "alexa thomas" || folded === "alexa j thomas" || folded === "alexa j. thomas";
  }

  /* Professional pages keep their own name. The personal name stays off that page. */
  function publicProfileName(p) {
    var name = String((p && p.displayName) || "").trim();
    if (!profileIsProfessional(p)) return name || "You";
    if (personalNameOnPro(name) || (houseProfessional(p) && (!name || name.toLowerCase() === "you"))) {
      return houseProfessional(p) ? "Cognation" : "";
    }
    return name;
  }

  function housePersonal(p) {
    if (!p || profileIsProfessional(p)) return false;
    var id = String(p._profileId || p.id || "");
    var handle = String(p.handle || "").replace(/^@/, "").toLowerCase();
    return id === "prof-alexa-personal" || handle === "alexa";
  }

  function recordIsSeed(rec) {
    if (!rec) return false;
    if (window.CognationSeedOps && typeof window.CognationSeedOps.classify === "function") {
      return !!window.CognationSeedOps.classify(rec).isSeed;
    }
    if (rec.isSeed || rec.accountKind === "seed" || rec._accountKind === "seed") return true;
    var id = String(rec.id || rec._profileId || "");
    if (/^prof-seed-\d/.test(id)) return true;
    return /^seed-\d/.test(String(rec.seedFleetId || ""));
  }

  function recordIsOps(rec) {
    if (!rec) return false;
    if (window.CognationSeedOps && typeof window.CognationSeedOps.classify === "function") {
      return !!window.CognationSeedOps.classify(rec).isOpsBot;
    }
    if (rec.isOpsBot || rec.accountKind === "ops") return true;
    return /^ops-|^prof-ops-/.test(String(rec.handle || rec.id || ""));
  }

  function lookupFriendRecord(id) {
    id = String(id || "");
    if (!id) return null;
    var accounts = window.CognationAccounts;
    if (accounts && typeof accounts.getProfileById === "function") {
      var byId = accounts.getProfileById(id);
      if (byId) return byId;
    }
    if (accounts && typeof accounts.getProfileByHandle === "function") {
      var byHandle = accounts.getProfileByHandle(id);
      if (byHandle) return byHandle;
    }
    var i;
    for (i = 0; i < DEMO_FRIENDS.length; i++) {
      if (DEMO_FRIENDS[i] && DEMO_FRIENDS[i].id === id) {
        return { id: id, handle: id, displayName: DEMO_FRIENDS[i].name, accountKind: "real" };
      }
    }
    if (recordIsSeed({ id: id, handle: id })) {
      return { id: id, handle: id, displayName: id, accountKind: "seed", isSeed: true };
    }
    return null;
  }

  function topFriendCanOpen(friendId) {
    var rec = lookupFriendRecord(friendId);
    if (!rec) return false;
    var handle = String(rec.handle || "").replace(/^@/, "");
    if (!handle) return false;
    var session = getSessionObject();
    var active = session && session.activeProfileId && window.CognationAccounts && window.CognationAccounts.getProfileById
      ? window.CognationAccounts.getProfileById(session.activeProfileId)
      : null;
    var activeHandle = active ? String(active.handle || "").replace(/^@/, "").toLowerCase() : "";
    var opensSignedInPro = !!(active && active.kind === "professional" && activeHandle && handle.toLowerCase() === activeHandle);
    if (opensSignedInPro) {
      var fid = String(friendId || "");
      var isThatProfile = fid === String(active.id) || fid.toLowerCase() === activeHandle;
      if (!isThatProfile) return false;
    }
    if (window.CognationAccounts && window.CognationAccounts.getProfileByHandle && window.CognationAccounts.getProfileByHandle(handle)) {
      return true;
    }
    if (directoryFriendBySlug(handle)) return true;
    var social = remoteSocial();
    if (social && typeof social.getProfileForHandle === "function") {
      var remote = social.getProfileForHandle(handle);
      if (remote && remote.id && !(opensSignedInPro && remote.id === active.id)) return true;
    }
    return false;
  }

  function resolveTopFriendIds(p) {
    if (profileIsProfessional(p)) return [];
    var removed = {};
    ((p && p.removedFriendPinIds) || []).forEach(function (id) {
      removed[String(id)] = true;
    });
    function keep(id) {
      id = String(id || "");
      return !!id && id !== "alexa-thomas" && !removed[id];
    }
    var seedPage = recordIsSeed(p);
    if (!seedPage && p && window.CognationAccounts && window.CognationAccounts.getProfileById) {
      seedPage = recordIsSeed(window.CognationAccounts.getProfileById(p._profileId || p.id));
    }
    function allow(id) {
      if (!keep(id)) return false;
      var idKey = String(id || "").toLowerCase();
      /* Cognation is a friend on the personal page, not a top-friend pin and not a follower. */
      if (idKey === "cognation" || idKey === "alexa-pro" || idKey === "prof-alexa-professional") return false;
      var rec = lookupFriendRecord(id);
      if (rec && (rec.kind === "professional" || rec._profileKind === "professional")) return false;
      var seed = recordIsSeed(rec) || (!rec && recordIsSeed({ id: id, handle: id }));
      var ops = recordIsOps(rec) || (!rec && recordIsOps({ id: id, handle: id }));
      if (seedPage) return seed && !ops;
      if (seed || ops) return false;
      return !!rec;
    }
    var ranked = ((p && p.featuredFriendIds) || []).filter(allow);
    var stored = ((p && p.friendIds) || []).filter(allow);
    if (ranked.length || ((p && p.removedFriendPinIds) || []).length) {
      return ranked.slice(0, TOP_FRIEND_VISIBLE);
    }
    var pool = ranked.length ? ranked : stored;
    /* Someone else's page keeps their list. Do not fill it with the demo roster. */
    if (!pool.length && isTowerOwner(p) && !seedPage) {
      DEMO_FRIENDS.forEach(function (friend) {
        if (friend && allow(friend.id)) pool.push(friend.id);
      });
    }
    return pool.slice(0, TOP_FRIEND_VISIBLE);
  }

  function removeTopFriendPin(p, friendId) {
    if (!p || profileIsProfessional(p)) return false;
    friendId = String(friendId || "");
    if (!friendId || friendId.toLowerCase() === "cognation") return false;
    p.featuredFriendIds = resolveTopFriendIds(p).filter(function (id) { return id !== friendId; });
    if (!Array.isArray(p.removedFriendPinIds)) p.removedFriendPinIds = [];
    if (p.removedFriendPinIds.indexOf(friendId) < 0) p.removedFriendPinIds.push(friendId);
    if (p.friendPinLayout && p.friendPinLayout[friendId]) delete p.friendPinLayout[friendId];
    return true;
  }

  function renderFriendPins(root, p) {
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (!stage) return;
    stage.classList.add("is-sticker-stage");
    ensureStickersOnStage(stage);
    if (profileIsProfessional(p)) {
      stage.querySelectorAll("[data-tower-friend-pin]").forEach(function (el) { el.remove(); });
      return;
    }
    if (p) settleArrivalTilts(p);
    var selected = resolveTopFriendIds(p);
    if (ensureFriendPinPositions(p, selected)) {
      TowerProfileStore.save(p);
    }
    var pinLayout = getFriendPinLayout(p);

    stage.querySelectorAll("[data-tower-friend-pin]").forEach(function (el) {
      var id = el.getAttribute("data-tower-friend-pin");
      if (selected.indexOf(id) < 0) el.remove();
    });

    selected.forEach(function (id) {
      var rec = lookupFriendRecord(id);
      if (!rec) return;
      var friend = { id: id, name: rec.displayName || rec.name || id };
      var pos = pinLayout[id];
      if (!pos) return;
      var pin = stage.querySelector('[data-tower-friend-pin="' + id + '"]');
      var friendIndex = 0;
      DEMO_FRIENDS.forEach(function (entry, entryIndex) {
        if (entry.id === id) friendIndex = entryIndex;
      });
      var handle = String(rec.handle || "").replace(/^@/, "");
      var canOpen = topFriendCanOpen(id);
      var profileHash = canOpen && handle ? ("tower-profile-" + handle) : "";
      if (!pin) {
        pin = document.createElement("a");
        pin.className = "tower-friend-pin";
        pin.setAttribute("data-tower-friend-pin", id);
        pin.href = profileHash ? ("#" + profileHash) : "#";
        pin.setAttribute("aria-label", friend.name + " tower profile");
        var av = document.createElement("span");
        av.className = "tower-friend-pin-avatar";
        av.setAttribute("aria-hidden", "true");
        var nm = document.createElement("span");
        nm.className = "tower-friend-pin-name";
        nm.textContent = friend.name;
        pin.appendChild(av);
        pin.appendChild(nm);
        pin.addEventListener("click", function (ev) {
          if (pin.__cognationDidDrag || pin.getAttribute("data-tower-friend-stay") === "true") {
            ev.preventDefault();
            pin.__cognationDidDrag = false;
          }
        });
        stage.appendChild(pin);
      }
      if (profileHash) {
        pin.href = "#" + profileHash;
        pin.removeAttribute("data-tower-friend-stay");
      } else {
        pin.href = "#";
        pin.setAttribute("data-tower-friend-stay", "true");
      }
      pin.setAttribute("aria-label", friend.name + " tower profile");
      var avEl = pin.querySelector(".tower-friend-pin-avatar");
      var nmEl = pin.querySelector(".tower-friend-pin-name");
      if (nmEl) nmEl.textContent = friend.name;
      paintFriendPicture(avEl, friend, friendIndex);
      if (pin.classList.contains("is-dragging")) return;
      /* Apply saved layout only — never invent here */
      applyFriendPinPosition(pin, pos);
      var owner = isTowerOwner(p);
      var onPublic = root.getAttribute("data-tower-side") === "public";
      pin.classList.toggle("is-arrangeable", !!(owner && onPublic));
      pin.hidden = false;
      pin.classList.remove("is-widget-off");
    });
    spawnUnplacedWidgets(root, p);
  }

  var TOWER_FRIEND_CAP = 6000;

  function isSelfFriend(friend, profile) {
    if (!friend) return true;
    if (friend.id === "alexa-thomas") return true;
    var mine = String((profile && profile.handle) || "").trim().toLowerCase().replace(/^@/, "");
    var handle = friendHandleFromId(friend.id);
    if (mine && (handle === mine || friend.id === mine)) return true;
    var name = String(friend.name || "").trim().toLowerCase();
    var mineName = String((profile && profile.displayName) || "").trim().toLowerCase();
    if (mineName && name === mineName) return true;
    return false;
  }

  function viewerPersonalRecord() {
    var accounts = window.CognationAccounts;
    var session = getSessionObject();
    if (!accounts || !session || !session.username) return null;
    if (typeof accounts.ensureSeeded === "function") {
      try { accounts.ensureSeeded(); } catch (e) {}
    }
    var list = accounts.getProfilesForUsername(session.username) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].kind === "personal") return list[i];
    }
    return null;
  }

  /* Tower friend roster. Friends live on the personal profile and stop at 6,000. */
  function addTowerFriend(id) {
    id = String(id || "");
    if (!id || id === "alexa-thomas") return { ok: false, error: "self" };
    var idKey = id.toLowerCase();
    /* Cognation is added at signup. There is no button that adds or removes it. */
    if (idKey === "cognation" || idKey === "alexa-pro" || idKey === "prof-alexa-professional") {
      return { ok: false, error: "not-a-friend" };
    }
    var personal = viewerPersonalRecord();
    if (!personal || personal.kind === "professional") return { ok: false, error: "not-personal" };
    /* SeedOps: real ↛ seed/ops */
    if (window.CognationSeedOpsFriendGate && typeof window.CognationSeedOpsFriendGate.canFriend === "function") {
      var gateDecision = window.CognationSeedOpsFriendGate.canFriend(personal, id);
      if (!gateDecision.ok) {
        return { ok: false, error: gateDecision.error || "real_seed_friend_blocked", message: gateDecision.message };
      }
    }
    if (!Array.isArray(personal.friendIds)) personal.friendIds = [];
    if (personal.friendIds.indexOf(id) >= 0) return { ok: true, already: true, count: personal.friendIds.length };
    if (personal.friendIds.length >= TOWER_FRIEND_CAP) return { ok: false, full: true, count: personal.friendIds.length };
    personal.friendIds.push(id);
    if (!personal.friendSince || typeof personal.friendSince !== "object") personal.friendSince = {};
    if (!personal.friendSince[id]) personal.friendSince[id] = new Date().toISOString();
    var accounts = window.CognationAccounts;
    if (!accounts || typeof accounts.saveProfileRecord !== "function" || !accounts.saveProfileRecord(personal)) {
      return { ok: false, error: "storage" };
    }
    document.dispatchEvent(new CustomEvent("cognation:people-added", { detail: { id: id } }));
    return { ok: true, count: personal.friendIds.length };
  }

  function viewerHasFriend(id) {
    var personal = viewerPersonalRecord();
    if (!personal || !Array.isArray(personal.friendIds)) return false;
    return personal.friendIds.indexOf(String(id || "")) >= 0;
  }

  function professionalFollowerIsSelf(profile, followerId) {
    var id = String(followerId || "").trim().toLowerCase();
    if (!id || !profile) return true;
    var handle = String(profile.handle || "").trim().toLowerCase();
    if (handle && id === handle) return true;
    if (profile._profileId && id === String(profile._profileId).toLowerCase()) return true;
    try {
      if (window.CognationAccounts && window.CognationAccounts.getProfileById) {
        var rec = window.CognationAccounts.getProfileById(profile._profileId);
        if (rec && String(rec.accountUsername || "").toLowerCase() === id) return true;
      }
    } catch (e) {}
    return false;
  }

  /* Professional-page followers. No 6,000 cap — that limit is Tower friends only.
     Cap 250: same person may follow as personal + professional = two edges (id+face). */
  function normalizeFollowerFace(face) {
    return face === "professional" ? "professional" : "personal";
  }

  function ensureFollowerEdges(p) {
    if (!p) return [];
    if (!Array.isArray(p.followerEdges)) p.followerEdges = [];
    if (!Array.isArray(p.followerIds)) p.followerIds = [];
    /* Migrate legacy id-only rows once. */
    if (!p.followerEdges.length && p.followerIds.length) {
      p.followerEdges = p.followerIds.map(function (id) {
        return { id: String(id), face: "personal" };
      });
    }
    return p.followerEdges;
  }

  function followerEdgeKey(id, face) {
    return String(id || "") + "::" + normalizeFollowerFace(face);
  }

  function addProfessionalFollower(followerId, face) {
    followerId = String(followerId || "").trim();
    face = normalizeFollowerFace(face);
    if (!followerId) return { ok: false, error: "missing" };
    var p = TowerProfileStore.get();
    if (!p || p._profileKind !== "professional") return { ok: false, error: "not-professional" };
    if (professionalFollowerIsSelf(p, followerId)) return { ok: false, error: "self" };
    var edges = ensureFollowerEdges(p);
    var key = followerEdgeKey(followerId, face);
    for (var i = 0; i < edges.length; i++) {
      if (followerEdgeKey(edges[i].id, edges[i].face) === key) {
        return { ok: true, already: true, count: edges.length, face: face };
      }
    }
    edges.push({ id: followerId, face: face });
    p.followerEdges = edges;
    /* Keep legacy id list unique for older readers. */
    if (p.followerIds.indexOf(followerId) === -1) p.followerIds.push(followerId);
    if (!TowerProfileStore.save(p)) return { ok: false, error: "storage" };
    return { ok: true, count: edges.length, face: face };
  }

  function followerDisplayName(id) {
    id = String(id || "").trim();
    if (!id) return "";
    var friend = DEMO_FRIENDS.filter(function (entry) { return entry.id === id; })[0];
    if (friend && friend.name) return String(friend.name);
    if (window.CognationAccounts && typeof window.CognationAccounts.getProfileById === "function") {
      var rec = window.CognationAccounts.getProfileById(id);
      if (rec) {
        if (recordIsSeed(rec) || recordIsOps(rec)) {
          return String(rec.displayName || rec.handle || id).split(/\s+/)[0];
        }
        return String(rec.displayName || rec.handle || id);
      }
    }
    try {
      var session = getSessionObject();
      if (session && (session.username === id || session.activeProfileId === id)) {
        /* Signed-in sessions carry the auth email as username; never show it as a name. */
        var sessionName = String(session.username || "");
        if (sessionName.indexOf("@") !== -1) sessionName = "Member";
        return String(session.displayName || sessionName || "You");
      }
    } catch (eName) {}
    /* Follower ids can be a signed-in session username (the auth email). */
    if (id.indexOf("@") !== -1) return "Member";
    return id;
  }

  function viewerIsSeedOrOps() {
    /* Prefer ECHO server-truth cache (cognation_am_i_seed). Fail closed for
       PULSE mutual-share lines: unknown → treat as real-side hide of seeds
       via !viewerSeed for seed names, and seed viewers only see seed mutuals. */
    try {
      var swipe = window.CognationCommuneSwipe;
      if (swipe && typeof swipe.viewerIsSeedOrOps === "function") {
        /* When status is explicitly false, viewer is real. When true/unknown
           from swipe helper, treat as seedish for mutual gating. */
        if (swipe.noteViewerSeedStatus && swipe.refreshViewerSeedStatus) {
          /* read cache only — noteViewerSeedStatus(null) would clear it */
        }
        return !!swipe.viewerIsSeedOrOps();
      }
    } catch (eSwipe) {}
    var personal = viewerPersonalRecord();
    if (personal && (recordIsSeed(personal) || recordIsOps(personal))) return true;
    try {
      var session = getSessionObject();
      if (session && window.CognationAccounts && typeof window.CognationAccounts.getProfileById === "function") {
        var active = window.CognationAccounts.getProfileById(session.activeProfileId);
        if (active && (recordIsSeed(active) || recordIsOps(active))) return true;
      }
    } catch (eSeed) {}
    return false;
  }

  function mutualFollowerNamesForPro(p) {
    var edges = ensureFollowerEdges(p);
    var personal = viewerPersonalRecord();
    var friendIds = personal && Array.isArray(personal.friendIds) ? personal.friendIds.map(String) : [];
    var viewerSeed = viewerIsSeedOrOps();
    var names = [];
    var seen = {};
    friendIds.forEach(function (fid) {
      var hit = null;
      for (var i = 0; i < edges.length; i++) {
        if (String(edges[i].id) === String(fid)) {
          hit = edges[i];
          break;
        }
      }
      if (!hit) return;
      var rec = null;
      try {
        if (window.CognationAccounts && window.CognationAccounts.getProfileById) {
          rec = window.CognationAccounts.getProfileById(fid);
        }
      } catch (eRec) {}
      /* Seed sandbox: seed mutuals only for seed viewers; seeds never on real PULSE. */
      var recSeed = !!(rec && (recordIsSeed(rec) || recordIsOps(rec)));
      if (!recSeed) {
        var demo0 = DEMO_FRIENDS.filter(function (entry) { return entry.id === fid; })[0];
        if (demo0 && (demo0.isSeed || demo0.accountKind === "seed" || demo0.accountKind === "ops")) recSeed = true;
      }
      try {
        var swipeGate = window.CognationCommuneSwipe;
        if (swipeGate && typeof swipeGate.profileLooksSeed === "function" && rec) {
          recSeed = !!swipeGate.profileLooksSeed(rec);
        }
      } catch (eGate) {}
      if (viewerSeed !== recSeed) return;
      var label = followerDisplayName(fid);
      if (!label || seen[label]) return;
      seen[label] = true;
      names.push(label);
    });
    return names.slice(0, 4);
  }

  function formatMutualFollowersLine(names, subjectName) {
    if (!names || !names.length) return "";
    var who = subjectName || "this person";
    if (names.length === 1) return names[0] + " follows " + who;
    if (names.length === 2) return names[0] + " and " + names[1] + " follow " + who;
    return names[0] + ", " + names[1] + ", and " + (names.length - 2) + " more follow " + who;
  }

  function renderProfessionalFollowers(root) {
    var box = root.querySelector("[data-tower-followers]");
    if (!box) return;
    var sticker = box.closest('[data-tower-widget="followers"]') || root.querySelector('[data-tower-widget="followers"]');
    var p = TowerProfileStore.get();
    var pro = !!(p && p._profileKind === "professional" && root.getAttribute("data-tower-side") === "public");
    box.hidden = !pro;
    if (sticker) {
      sticker.hidden = !pro;
      sticker.classList.toggle("is-widget-off", !pro);
      if (pro) sticker.removeAttribute("hidden");
    }
    if (!pro) return;
    var edges = ensureFollowerEdges(p);
    var note = box.querySelector("[data-tower-followers-note]");
    var mutual = box.querySelector("[data-tower-followers-mutual]");
    var list = box.querySelector("[data-tower-followers-results]");
    var input = box.querySelector("[data-tower-followers-find]");
    /* Search followers restored (hidden by #59, moved by #117). Shown to owner and
       visitors on Professional pages, as before #59. */
    var q = "";
    if (input) {
      input.hidden = false;
      input.removeAttribute("hidden");
      var searchLabel = box.querySelector('label[for="' + input.id + '"]');
      if (searchLabel) searchLabel.hidden = false;
      q = String(input.value || "").trim().toLowerCase();
    }
    var shownEdges = edges;
    if (q) {
      shownEdges = edges.filter(function (edge) {
        var fid = String((edge && edge.id) || "");
        var label = String(followerDisplayName(fid) || fid).toLowerCase();
        return label.indexOf(q) !== -1 || fid.toLowerCase().indexOf(q) !== -1;
      });
    }
    if (list) list.innerHTML = "";
    if (note) {
      note.textContent = houseProfessional(p)
        ? "134k followers"
        : edges.length
          ? edges.length + (edges.length === 1 ? " follower" : " followers")
          : "No followers yet.";
    }
    if (mutual) {
      var subject = String((p && (p.displayName || p.handle)) || "this person").trim() || "this person";
      var line = formatMutualFollowersLine(mutualFollowerNamesForPro(p), subject);
      mutual.textContent = line;
      mutual.hidden = !line;
    }
    if (!list) return;
    shownEdges.slice(0, 12).forEach(function (edge) {
      var id = String(edge.id || "");
      var face = normalizeFollowerFace(edge.face);
      var label = followerDisplayName(id) || id;
      if (personalNameOnPro(label)) return;
      var li = document.createElement("li");
      li.className = "tower-followers-hit";
      li.setAttribute("data-follower-face", face);
      var handle = professionalHandleForFollower(id);
      var faceTag = document.createElement("span");
      faceTag.className = "tower-follower-face";
      faceTag.textContent = face === "professional" ? "Pro" : "Personal";
      if (handle) {
        var link = document.createElement("a");
        link.href = "#tower-profile-" + handle;
        link.setAttribute("data-tower-follower-open", handle);
        link.textContent = label;
        li.appendChild(link);
      } else {
        var span = document.createElement("span");
        span.textContent = label;
        li.appendChild(span);
      }
      li.appendChild(faceTag);
      list.appendChild(li);
    });
  }

  function professionalHandleForFollower(id) {
    id = String(id || "").trim();
    if (!id || !window.CognationAccounts) return "";
    var accounts = window.CognationAccounts;
    if (typeof accounts.ensureDemoProfessionals === "function") {
      try { accounts.ensureDemoProfessionals(); } catch (e) {}
    }
    var rec = typeof accounts.getProfileById === "function" ? accounts.getProfileById(id) : null;
    if (rec && rec.kind === "professional" && rec.handle) return String(rec.handle).replace(/^@/, "");
    if (typeof accounts.getProfileByHandle === "function") {
      rec = accounts.getProfileByHandle(id);
      if (rec && rec.kind === "professional" && rec.handle) return String(rec.handle).replace(/^@/, "");
    }
    if (typeof accounts.getProfilesForUsername === "function") {
      var list = accounts.getProfilesForUsername(id) || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].kind === "professional" && list[i].handle) {
          return String(list[i].handle).replace(/^@/, "");
        }
      }
    }
    return "";
  }

  function initProfessionalFollowers(root) {
    if (!root || root.__cognationFollowersBound) return;
    root.__cognationFollowersBound = true;
    var input = root.querySelector("[data-tower-followers-find]");
    if (input && !input.__cognationFollowersBound) {
      input.__cognationFollowersBound = true;
      input.addEventListener("input", function () {
        renderProfessionalFollowers(root);
      });
    }
    document.addEventListener("cognation:tower-profile-updated", function () {
      renderProfessionalFollowers(root);
    });
    var box = root.querySelector("[data-tower-followers]");
    if (box && !box.__cognationFollowerOpen) {
      box.__cognationFollowerOpen = true;
      box.addEventListener("click", function (ev) {
        var link = ev.target && ev.target.closest("[data-tower-follower-open]");
        if (!link || !box.contains(link)) return;
        ev.preventDefault();
        var handle = link.getAttribute("data-tower-follower-open");
        if (handle && window.CognationTowerOpenProfile) window.CognationTowerOpenProfile(handle);
      });
    }
    renderProfessionalFollowers(root);
  }

  function renderFriendsPicker(root, p) {
    var chips = root.querySelector("[data-tower-friends-chips]");
    var countSel = root.querySelector("[data-tower-friends-count]");
    var publicEl = root.querySelector("[data-tower-friends-public]");
    if (!chips) return;
    var max = parseInt((countSel && countSel.value) || p.friendsDisplayCount || 3, 10);
    if ([3, 6, 8].indexOf(max) === -1) max = 3;
    var selected = (p.featuredFriendIds || []).slice(0, max).filter(function (id) {
      return id !== "alexa-thomas";
    });
    chips.innerHTML = "";

    selected.forEach(function (id) {
      var f = DEMO_FRIENDS.filter(function (x) { return x.id === id; })[0];
      if (!f || isSelfFriend(f, p)) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tower-friend-chip is-selected";
      btn.setAttribute("data-friend-id", f.id);
      btn.setAttribute("aria-label", "Remove " + f.name);
      var label = document.createElement("span");
      label.className = "tower-friend-chip-label";
      label.textContent = f.name;
      btn.appendChild(label);
      var remove = document.createElement("span");
      remove.setAttribute("aria-hidden", "true");
      remove.textContent = " ×";
      btn.appendChild(remove);
      btn.addEventListener("click", function () {
        if (!TowerProfileStore.removeTopFriend(f.id)) return;
        renderFriendsPicker(root, TowerProfileStore.get());
      });
      chips.appendChild(btn);
    });

    if (publicEl) {
      publicEl.innerHTML = "";
      var heading = document.createElement("p");
      heading.className = "tower-friends-public-label";
      heading.textContent = "Top friends";
      publicEl.appendChild(heading);
    }

    renderFriendPins(root, p);
    bindTopFriendSearch(root);
  }

  function bindTopFriendSearch(root) {
    var input = root.querySelector("[data-tower-friends-search]");
    var box = root.querySelector("[data-tower-friends-search-results]");
    if (!input || !box || input.__cognationFriendSearchBound) return;
    input.__cognationFriendSearchBound = true;
    function paint() {
      var q = String(input.value || "").trim().toLowerCase();
      box.innerHTML = "";
      if (!q) {
        box.hidden = true;
        return;
      }
      var cur = TowerProfileStore.get();
      var selected = cur.featuredFriendIds || [];
      var matches = [];
      for (var i = 0; i < DEMO_FRIENDS.length && matches.length < 8; i++) {
        var friend = DEMO_FRIENDS[i];
        if (!friend || isSelfFriend(friend, cur)) continue;
        if (selected.indexOf(friend.id) >= 0) continue;
        var name = String(friend.name || "").toLowerCase();
        if (name.indexOf(q) === -1 && String(friend.id).indexOf(q) === -1) continue;
        matches.push(friend);
      }
      box.hidden = false;
      if (!matches.length) {
        var empty = document.createElement("p");
        empty.className = "form-hint";
        empty.textContent = "No matches";
        box.appendChild(empty);
        return;
      }
      matches.forEach(function (friend) {
        var hit = document.createElement("button");
        hit.type = "button";
        hit.className = "tower-friends-search-hit";
        hit.textContent = friend.name;
        hit.addEventListener("click", function () {
          var profile = TowerProfileStore.get();
          if (!isTowerOwner(profile)) return;
          var lim = parseInt(
            (root.querySelector("[data-tower-friends-count]") || {}).value || profile.friendsDisplayCount || 3,
            10
          );
          if ([3, 6, 8].indexOf(lim) === -1) lim = 3;
          var ids = (profile.featuredFriendIds || []).slice();
          var status = root.querySelector("[data-tower-friends-status]");
          if (ids.indexOf(friend.id) === -1) {
            if (ids.length >= lim) {
              if (status) status.textContent = "Top friends is full. Remove one first.";
              return;
            }
            var added = addTowerFriend(friend.id);
            if (added && added.full) {
              if (status) status.textContent = "This list is full.";
              return;
            }
            ids.push(friend.id);
            profile = TowerProfileStore.get();
            if (!isTowerOwner(profile)) return;
            profile.featuredFriendIds = ids;
            profile.removedFriendPinIds = (profile.removedFriendPinIds || []).filter(function (id) {
              return id !== friend.id;
            });
            writeTopFriendLocal(profile._profileId, profile.removedFriendPinIds, profile.featuredFriendIds);
            TowerProfileStore.save(profile, { geometry: true });
          }
          input.value = "";
          box.hidden = true;
          box.innerHTML = "";
          renderFriendsPicker(root, TowerProfileStore.get());
        });
        box.appendChild(hit);
      });
    }
    input.addEventListener("input", paint);
  }


  function normalizeFrameId(id) {
    id = String(id || "none");
    if (id === "plain") id = "none";
    if (id === "baroque") id = "baroque-magenta";
    return FRAME_IDS.indexOf(id) >= 0 ? id : "none";
  }

  function applyCowboyHatColor(root, colorId) {
    colorId = normalizeCowboyHatColor(colorId);
    var wrap = root.querySelector('[data-tower-widget="avatar"] [data-tower-avatar-frame]');
    var hidden = root.querySelector("[data-tower-cowboy-color-input]");
    var fields = root.querySelector("[data-tower-cowboy-color-fields]");
    if (wrap) wrap.setAttribute("data-cowboy-hat-color", colorId);
    if (hidden) hidden.value = colorId;
    var chips = root.querySelectorAll("[data-tower-cowboy-color-chips] [data-cowboy-color]");
    chips.forEach(function (btn) {
      var on = btn.getAttribute("data-cowboy-color") === colorId;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    return colorId;
  }

  function syncCowboyColorFieldsVisibility(root, frameId) {
    var fields = root.querySelector("[data-tower-cowboy-color-fields]");
    if (!fields) return;
    var show = normalizeFrameId(frameId) === "cowboy-hat";
    fields.hidden = !show;
  }

  function applyAvatarFrame(root, frameId, cowboyColor) {
    frameId = normalizeFrameId(frameId);
    var wrap = root.querySelector('[data-tower-widget="avatar"] [data-tower-avatar-frame]');
    var overlay = root.querySelector("[data-tower-frame-overlay]");
    var hiddenInput = root.querySelector("[data-tower-avatar-frame-input]");
    if (wrap) wrap.setAttribute("data-tower-avatar-frame", frameId);
    if (hiddenInput) hiddenInput.value = frameId;
    var meta = AVATAR_FRAMES[frameId] || AVATAR_FRAMES.none;
    if (overlay) {
      if (meta.overlay) {
        overlay.hidden = false;
        overlay.src = meta.overlay;
      } else {
        overlay.hidden = true;
        overlay.removeAttribute("src");
      }
    }
    var chips = root.querySelectorAll("[data-tower-frame-chips] [data-frame-id]");
    chips.forEach(function (btn) {
      var on = btn.getAttribute("data-frame-id") === frameId;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    syncCowboyColorFieldsVisibility(root, frameId);
    if (cowboyColor == null) {
      var colorIn = root.querySelector("[data-tower-cowboy-color-input]");
      cowboyColor = colorIn ? colorIn.value : "tan";
    }
    applyCowboyHatColor(root, cowboyColor);
    root.querySelectorAll("[data-tower-polaroid]").forEach(function (el) {
      el.setAttribute("data-tower-avatar-frame", "polaroid");
    });
    var scaleIn = TowerProfileStore.get();
    applyAvatarFrameScale(root, scaleIn && scaleIn.avatarFrameScale);
  }

  function normalizeOrnamentId(id) {
    id = String(id || "none");
    return ORNAMENT_IDS.indexOf(id) >= 0 ? id : "none";
  }

  function normalizeOrnamentPos(pos) {
    pos = String(pos || "above").toLowerCase();
    return ORNAMENT_POS_IDS.indexOf(pos) >= 0 ? pos : "above";
  }

  function applyAvatarOrnament(root, ornamentId, pos) {
    ornamentId = normalizeOrnamentId(ornamentId);
    pos = normalizeOrnamentPos(pos);
    var stack = root.querySelector("[data-tower-avatar-ornament]");
    var img = root.querySelector("[data-tower-ornament-img]");
    var hiddenOrn = root.querySelector("[data-tower-avatar-ornament-input]");
    var hiddenPos = root.querySelector("[data-tower-avatar-ornament-pos-input]");
    if (stack) {
      stack.setAttribute("data-tower-avatar-ornament", ornamentId);
      stack.setAttribute("data-tower-avatar-ornament-pos", pos);
    }
    if (hiddenOrn) hiddenOrn.value = ornamentId;
    if (hiddenPos) hiddenPos.value = pos;
    var meta = AVATAR_ORNAMENTS[ornamentId] || AVATAR_ORNAMENTS.none;
    if (img) {
      if (meta.src) {
        img.hidden = false;
        img.src = meta.src;
        img.alt = meta.label || "";
        img.setAttribute("aria-hidden", "false");
      } else {
        img.hidden = true;
        img.removeAttribute("src");
        img.alt = "";
        img.setAttribute("aria-hidden", "true");
      }
    }
    var chips = root.querySelectorAll("[data-tower-ornament-chips] [data-ornament-id]");
    chips.forEach(function (btn) {
      var on = btn.getAttribute("data-ornament-id") === ornamentId;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var posChips = root.querySelectorAll("[data-tower-ornament-pos-chips] [data-ornament-pos]");
    var posEnabled = ornamentId !== "none";
    posChips.forEach(function (btn) {
      btn.disabled = !posEnabled;
      var on = btn.getAttribute("data-ornament-pos") === pos;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  /* Broken pile-up (the #117 drag bug saved every other widget at 0,0): two or
     more widgets at the top-left corner is never a real owner layout. */
  function isPileupLayout(layout) {
    if (!layout || typeof layout !== "object") return false;
    var n = 0;
    Object.keys(layout).forEach(function (id) {
      var pos = layout[id];
      if (pos && typeof pos === "object" && (Number(pos.x) || 0) <= 0.5 && (Number(pos.y) || 0) <= 0.5) n += 1;
    });
    return n >= 2;
  }

  /* Auto-spawn pile: two or more widgets saved on the same spot, and at least
     one of them was never dragged there by the owner (no dragged mark). An
     overlap the owner made by dragging is free placement and is kept. */
  function isAutoPileLayout(layout, skip) {
    if (!layout || typeof layout !== "object") return false;
    var spots = [];
    Object.keys(layout).forEach(function (id) {
      var pos = layout[id];
      if (skip && skip[id]) return;
      if (!pos || typeof pos !== "object") return;
      var x = Number(pos.x), y = Number(pos.y);
      if (isNaN(x) || isNaN(y)) return;
      spots.push({ x: x, y: y, dragged: pos.dragged === true });
    });
    for (var i = 0; i < spots.length; i++) {
      for (var j = i + 1; j < spots.length; j++) {
        var a = spots[i], b = spots[j];
        if (Math.abs(a.x - b.x) <= 0.5 && Math.abs(a.y - b.y) <= 0.5 && !(a.dragged && b.dragged)) return true;
      }
    }
    return false;
  }

  function getWidgetLayout(p) {
    var layout = (p && p.widgetLayout) || null;
    if (!layout || typeof layout !== "object") return null;
    /* Safe reset: a pile-up falls back to the default grid (not saved until a real drag). */
    if (isPileupLayout(layout)) return null;
    /* Old saved Pro layouts may still carry the MP3 spot: it never shows on Pro,
       so it never counts toward a pile. */
    if (isAutoPileLayout(layout, isProTower(p) ? { music: true } : null)) return null;
    /* Never-dragged layouts (factory defaults, old absolute scrapbooks) use the
       CSS grid so the default spawn never overlaps. A real owner drop marks
       dragged: true; companions frozen beside it keep their spots. */
    var anyDragged = false;
    Object.keys(layout).forEach(function (id) {
      if (layout[id] && layout[id].dragged === true) anyDragged = true;
    });
    if (!anyDragged) return null;
    return layout;
  }

  function profileHasSocialLinks(p) {
    var links = (p && p.socialLinks) || {};
    var defs = socialLinkDefs();
    for (var i = 0; i < defs.length; i++) {
      if (storedSocialValue(defs[i].id, links[defs[i].id])) return true;
    }
    return false;
  }

  var milestoneByProfile = {};

  function appliedMilestoneList(p) {
    var out = [];
    var seen = {};
    function add(id, title) {
      id = String(id || "");
      title = String(title || "").trim();
      if (!id || !title || seen[id]) return;
      seen[id] = 1;
      out.push({ id: id, title: title.slice(0, 48) });
    }
    var list = (p && p.awardedBadges) || [];
    if (Array.isArray(list)) {
      list.forEach(function (b) {
        if (b && b.kind === "milestone" && b.applied === true) add(b.id, b.title);
      });
    }
    var pid = p && String(p._profileId || p.id || "");
    var cached = pid && milestoneByProfile[pid];
    if (Array.isArray(cached)) cached.forEach(function (b) { if (b) add(b.id, b.title); });
    return out;
  }

  function loadAppliedMilestones(root, p) {
    var id = p && String(p._profileId || p.id || "");
    if (!id || milestoneByProfile[id]) return;
    var c = window.CognationSupabase;
    if (!c || typeof c.configured !== "function" || !c.configured() || typeof c.rpc !== "function") return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return;
    milestoneByProfile[id] = "pending";
    c.rpc("applied_milestones_for_profile", { p_profile_id: id }).then(function (rows) {
      milestoneByProfile[id] = Array.isArray(rows) ? rows : [];
      try { applyPublicWidgets(root, TowerProfileStore.get()); } catch (eMs) {}
    }, function () { milestoneByProfile[id] = []; });
  }

  function noteLocalMilestone(id, title) {
    var p = TowerProfileStore.get();
    if (!p || !isTowerOwner(p)) return;
    if (!Array.isArray(p.awardedBadges)) p.awardedBadges = [];
    var found = false;
    p.awardedBadges.forEach(function (b) {
      if (!b || b.id !== id) return;
      b.kind = "milestone";
      b.applied = true;
      b.title = title;
      found = true;
    });
    if (!found) p.awardedBadges.push({ id: id, title: title, kind: "milestone", applied: true });
    var pid = String(p._profileId || p.id || "");
    if (pid) delete milestoneByProfile[pid];
    TowerProfileStore.save(p);
  }

  function bootMilestoneApply(root) {
    if (!root) return;
    if (!root.__milestoneListen) {
      root.__milestoneListen = true;
      document.addEventListener("cognation:session-started", function () {
        root.__milestoneBoot = false;
        bootMilestoneApply(root);
      });
    }
    if (root.__milestoneBoot) return;
    root.__milestoneBoot = true;
    var params;
    try { params = new URLSearchParams(window.location.search || ""); } catch (eQ) { return; }
    var c = window.CognationSupabase;
    var live = !!(c && typeof c.configured === "function" && c.configured() && typeof c.rpc === "function");
    if (!live) return;
    if (params.get("staff-badge") === "1") {
      params.delete("staff-badge");
      try {
        history.replaceState(null, "", (location.pathname || "/") + (params.toString() ? "?" + params.toString() : "") + (location.hash || ""));
      } catch (eStaff) {}
      c.rpc("cognation_is_staff", {}).then(function (yes) {
        if (yes !== true) return;
        var email = window.prompt("Email for this one milestone");
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) return;
        email = String(email).trim();
        var title = window.prompt("Milestone name");
        title = String(title || "").trim().slice(0, 48);
        if (!title) return;
        c.rpc("staff_award_milestone", { recipient_email: email, title: title }).then(function (id) {
          if (!id) return;
          var link = (location.origin || "") + (location.pathname || "/") + "?apply-badge=" + encodeURIComponent(id);
          var body = "Cognation made you a milestone badge.\n\nApply:\n" + link + "\n";
          window.location.href = "mailto:" + email + "?subject=" + encodeURIComponent("Your Cognation milestone") + "&body=" + encodeURIComponent(body);
        }, function () {});
      }, function () {});
    }
    var awardId = params.get("apply-badge");
    if (!awardId) return;
    c.rpc("apply_milestone", { award_id: awardId }).then(function (title) {
      if (!title) return;
      noteLocalMilestone(awardId, String(title));
      try {
        params.delete("apply-badge");
        history.replaceState(null, "", (location.pathname || "/") + (params.toString() ? "?" + params.toString() : "") + (location.hash || ""));
      } catch (eHist) {}
      applyPublicWidgets(root, TowerProfileStore.get());
    }, function () {});
  }

  function profileHasVisibleBadges(p) {
    var vis = (p && p.badgeVisibility) || {};
    var awarded = (p && p.awardedBadges) || {};
    var ids = Object.keys(awarded).length ? Object.keys(awarded) : Object.keys(vis);
    if (!ids.length && p && p.badges) {
      /* shelf may still show label — treat empty shelf as ghost */
      return false;
    }
    for (var i = 0; i < ids.length; i++) {
      if (vis[ids[i]] !== false) return true;
    }
    return false;
  }


  function pruneEmptyPublicWidgetsInProfile(p) {
    if (!p) return p;
    stripProMusic(p);
    p.publicWidgets = normalizePublicWidgets(p.publicWidgets);
    var sloganText = typeof p.slogan === "string" ? p.slogan.trim() : "";
    var htmlText = typeof p.customHtml === "string" ? p.customHtml.trim() : "";
    if (!sloganText) p.publicWidgets.slogan = false;
    if (!htmlText) p.publicWidgets.html = false;
    p.publicWidgets.social = profileHasSocialLinks(p);
    if (p._profileKind !== "professional" && (visibleMusicSkin(p.musicSkin) === "none" || p.musicEnabled === false)) {
      p.publicWidgets.music = false;
    }
    if (!(p.featuredFriendIds && p.featuredFriendIds.length)) p.publicWidgets.friends = false;
    if (!profileHasVisibleBadges(p)) p.publicWidgets.badges = false;
    return p;
  }

  /* Edit profile > "Show hidden widgets" (#242 follow-up). Lists the widgets an
     owner hid with Remove that the page really hides by their publicWidgets
     flag and that have something to show. Music, Badges and Calendar are
     listed by their own "shown.<id>" switch (set only by Remove), not by
     their old content-driven flags. Social follows the links and Friends
     stays off, so they are not listed. Rendering never writes: only an
     owner's Show click saves, and it turns on that one flag. */
  var RESTORABLE_HIDDEN_WIDGETS = [
    { id: "identity", label: "Name" },
    { id: "slogan", label: "Quote / slogan" },
    { id: "envelope", label: "Messages" },
    { id: "html", label: "Custom HTML" },
    { id: "music", label: "Music" },
    { id: "badges", label: "Badges" },
    { id: "calendar", label: "Calendar" },
  ];

  function hiddenWidgetRestorable(id) {
    for (var i = 0; i < RESTORABLE_HIDDEN_WIDGETS.length; i++) {
      if (RESTORABLE_HIDDEN_WIDGETS[i].id === id) return true;
    }
    return false;
  }

  function hiddenWidgetsToShow(p) {
    if (!p || !isTowerOwner(p)) return [];
    var raw = p.publicWidgets && typeof p.publicWidgets === "object" ? p.publicWidgets : {};
    return RESTORABLE_HIDDEN_WIDGETS.filter(function (w) {
      if (OWNER_REMOVABLE_WIDGET_IDS.indexOf(w.id) >= 0) {
        if (!widgetRemovedByOwner(p, w.id)) return false;
        /* Professional pages have no music player; Badges needs an applied milestone. */
        if (w.id === "music") return !isProTower(p);
        if (w.id === "badges") return appliedMilestoneList(p).length > 0;
        return true;
      }
      if (raw[w.id] !== false) return false;
      if (w.id === "slogan") return !!(typeof p.slogan === "string" && p.slogan.trim());
      if (w.id === "html") return !!(typeof p.customHtml === "string" && p.customHtml.trim());
      return true;
    });
  }

  /* After Show: a dark glass notice ("<Name> is showing again.") sits in the
     section where that row was, for ~4s or until Edit profile closes. If it was
     the last hidden widget, the section hides once the notice clears. */
  var HIDDEN_WIDGET_NOTICE_MS = 4000;

  /* After Show, the Edit profile status box no longer says "<Name> removed…":
     the removal line is cleared (the "<Name> is showing again." notice in Show
     hidden widgets is the confirmation). Any other status line is left alone. */
  function clearStaleRemovalStatus(root) {
    var el = root && root.querySelector("[data-tower-profile-status]");
    if (!el || !el.__towerRemovalLine) return;
    if (el.textContent === el.__towerRemovalLine) {
      el.textContent = "";
      el.hidden = true;
      el.classList.remove("is-error");
    }
    el.__towerRemovalLine = "";
  }

  function clearHiddenWidgetNotice(root) {
    var box = root && root.querySelector("[data-tower-hidden-widgets]");
    if (!box || !box.__towerShowNotice) return;
    if (box.__towerShowNotice.timer) clearTimeout(box.__towerShowNotice.timer);
    box.__towerShowNotice = null;
    renderHiddenWidgetsList(root, TowerProfileStore.get());
  }

  function renderHiddenWidgetsList(root, p) {
    var box = root && root.querySelector("[data-tower-hidden-widgets]");
    if (!box) return;
    var list = box.querySelector("[data-tower-hidden-widgets-list]");
    if (!list) return;
    var items = hiddenWidgetsToShow(p);
    var notice = box.__towerShowNotice || null;
    if (notice && (!p || !isTowerOwner(p))) notice = null;
    if (notice) {
      items = items.filter(function (w) { return w.id !== notice.id; });
    }
    list.innerHTML = "";
    function addNotice() {
      var n = document.createElement("p");
      n.className = "tower-hidden-widget-notice";
      n.setAttribute("role", "status");
      n.setAttribute("aria-live", "polite");
      n.setAttribute("data-tower-hidden-widget-notice", notice.id);
      n.textContent = notice.label + " is showing again.";
      list.appendChild(n);
    }
    items.forEach(function (w, i) {
      if (notice && i === notice.index) addNotice();
      var row = document.createElement("div");
      row.className = "tower-hidden-widget-row";
      var name = document.createElement("span");
      name.className = "tower-hidden-widget-name";
      name.textContent = w.label;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-secondary tower-hidden-widget-show";
      btn.setAttribute("data-tower-show-widget", w.id);
      btn.setAttribute("aria-label", "Show " + w.label);
      btn.textContent = "Show";
      row.appendChild(name);
      row.appendChild(btn);
      list.appendChild(row);
    });
    if (notice && notice.index >= items.length) addNotice();
    /* Nothing hidden (and no notice): the whole section stays out of the way. */
    box.hidden = !items.length && !notice;
    if (!box.__cognationShowBound) {
      box.__cognationShowBound = true;
      box.addEventListener("click", function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest("[data-tower-show-widget]") : null;
        if (!b || !box.contains(b)) return;
        ev.preventDefault();
        var id = b.getAttribute("data-tower-show-widget");
        if (!hiddenWidgetRestorable(id)) return;
        var cur = TowerProfileStore.get();
        if (!isTowerOwner(cur)) return;
        var shown = hiddenWidgetsToShow(cur);
        if (box.__towerShowNotice) {
          var prevId = box.__towerShowNotice.id;
          shown = shown.filter(function (w) { return w.id !== prevId; });
          if (box.__towerShowNotice.timer) clearTimeout(box.__towerShowNotice.timer);
        }
        var index = 0;
        var label = id;
        shown.forEach(function (w, i) { if (w.id === id) { index = i; label = w.label; } });
        box.__towerShowNotice = {
          id: id,
          label: label,
          index: index,
          timer: setTimeout(function () { clearHiddenWidgetNotice(root); }, HIDDEN_WIDGET_NOTICE_MS),
        };
        setPublicWidgetVisible(root, id, true);
        clearStaleRemovalStatus(root);
        renderHiddenWidgetsList(root, TowerProfileStore.get());
      });
    }
  }

  function applyPublicWidgets(root, p) {
    try { renderSocialLinks(root, p); } catch (eSoc) {}
    applyPublicWidgetsInner(root, p);
    /* Visibility changed: give newly shown, unplaced widgets their spawn spot. */
    spawnUnplacedWidgets(root, p);
    try { renderHiddenWidgetsList(root, p); } catch (eHidden) {}
    bindSpawnResize(root);
  }

  function bindSpawnResize(root) {
    if (!root || root.__cognationSpawnResize || typeof window.addEventListener !== "function") return;
    root.__cognationSpawnResize = true;
    var timer = null;
    window.addEventListener("resize", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        try { spawnUnplacedWidgets(root, TowerProfileStore.get()); } catch (e) {}
      }, 150);
    });
  }

  function applyPublicWidgetsInner(root, p) {
    if (p) pruneEmptyPublicWidgetsInProfile(p);
    loadAppliedMilestones(root, p);
    var widgets = normalizePublicWidgets(p && p.publicWidgets);
    var sloganText = p && typeof p.slogan === "string" ? p.slogan.trim() : "";
    var htmlText = p && typeof p.customHtml === "string" ? p.customHtml.trim() : "";
    var musicUrl = p && typeof p.musicUrl === "string" ? p.musicUrl.trim() : "";
    var musicOn = p && p.musicEnabled !== false && !!musicUrl;
    var friendIds = (p && p.featuredFriendIds) || [];
    PUBLIC_WIDGET_IDS.forEach(function (id) {
      var on = widgets[id] !== false;
      if (id === "slogan" && !sloganText) on = false;
      /* Auto-prune empty shells so ghost handles do not linger on personal scrapbooks */
      if (id === "html" && !htmlText) on = false;
      if (id === "social") on = false; /* grouped LINKS box removed (v3.3) */
      if (socialNetIdFromWidget(id)) {
        var netFromW = socialNetIdFromWidget(id);
        on = optedInSocialNetIds(p).indexOf(netFromW) >= 0;
      }
      if (id === "music") {
        var personalMusic = !isProTower(p);
        if (!personalMusic) {
          /* Professional has no music player (YouTube is its own widget). */
          on = false;
        } else {
          var skinChoice = visibleMusicSkin(p && p.musicSkin);
          if (skinChoice === "none" || (p && p.musicEnabled === false)) on = false;
          else on = true;
        }
      }
      /* Default Top friends bar stays off. Badges stay off until this person applies a staff milestone. */
      if (id === "friends") on = false;
      var milestones = id === "badges" ? appliedMilestoneList(p) : null;
      if (id === "badges") on = !!(milestones && milestones.length);
      if (id === "badges" && root.__cognationBadgesShelfRemoved) on = false;
      /* The same Calendar sticker stays on the personal page and the professional page. */
      if (id === "calendar") on = true;
      /* The owner removed it: hidden for the owner and visitors, whatever its
         content. Calendar is the exception here: its sticker is what Edit
         profile > Calendar shows the owner (sessions, bookings), so it stays;
         a removed Calendar hides the visitors' Calendar card instead. */
      if (id !== "calendar" && widgetRemovedByOwner(p, id)) on = false;
      var el = root.querySelector('[data-tower-widget="' + id + '"]');
      if (!el) return;
      if (id === "badges") {
        var badgeLabel = el.querySelector("[data-tower-badges-public]");
        if (badgeLabel) badgeLabel.textContent = on ? milestones.map(function (b) { return b.title; }).join(" · ") : "Badges";
      }
      el.hidden = !on;
      el.classList.toggle("is-widget-off", !on);
      if (!on) el.classList.remove("is-widget-selected");
    });
    showYoutubeSticker(root, !!p && p._profileKind === "professional");
    var visitorCal = root.querySelector("[data-tower-visitor-calendar]");
    if (visitorCal && widgetRemovedByOwner(p, "calendar")) visitorCal.hidden = true;
    var avatar = root.querySelector('[data-tower-widget="avatar"]');
    if (avatar) {
      avatar.hidden = false;
      avatar.classList.remove("is-widget-off");
    }
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (stage) {
      stage.querySelectorAll("[data-tower-friend-pin]").forEach(function (pin) {
        var showPins = resolveTopFriendIds(p).length > 0;
        if (!showPins) {
          pin.hidden = true;
          pin.classList.add("is-widget-off");
        } else {
          pin.hidden = false;
          pin.classList.remove("is-widget-off");
        }
      });
      stage.querySelectorAll("[data-tower-badge-pin]").forEach(function (pin) {
        if (!widgets.badges || widgetRemovedByOwner(p, "badges")) {
          pin.hidden = true;
          pin.classList.add("is-widget-off");
        } else {
          pin.hidden = false;
          pin.classList.remove("is-widget-off");
        }
      });
    }
  }

  function syncPublicWidgetsForm(root, p) {
    var widgets = normalizePublicWidgets(p && p.publicWidgets);
    root.querySelectorAll("[data-tower-public-widget]").forEach(function (cb) {
      var id = cb.getAttribute("data-tower-public-widget");
      if (!id || id === "avatar") return;
      cb.checked = widgets[id] !== false;
    });
  }

  function readPublicWidgetsFromForm(root) {
    var out = normalizePublicWidgets(null);
    root.querySelectorAll("[data-tower-public-widget]").forEach(function (cb) {
      var id = cb.getAttribute("data-tower-public-widget");
      if (!id || id === "avatar") return;
      out[id] = !!cb.checked;
    });
    return out;
  }

  function setPublicWidgetVisible(root, id, on) {
    if (!isTowerOwner(TowerProfileStore.get())) return;
    if (id === "friends") on = false;
    if (!id || id === "avatar" || id === "feed" || id === "messages") return;
    if (PUBLIC_WIDGET_IDS.indexOf(id) < 0) return;
    var p = TowerProfileStore.get();
    p.publicWidgets = normalizePublicWidgets(p.publicWidgets);
    /* Music, Badges and Calendar: Remove / Show flip only the owner's own switch. */
    if (OWNER_REMOVABLE_WIDGET_IDS.indexOf(id) >= 0) p.publicWidgets[ownerShownKey(id)] = !!on;
    else p.publicWidgets[id] = !!on;
    if (id === "badges") root.__cognationBadgesShelfRemoved = !on;
    TowerProfileStore.save(p);
    applyPublicWidgets(root, p);
    syncPublicWidgetsForm(root, p);
    /* The player stops when removed and is rebuilt when shown again. */
    if (id === "music") initTowerMusic(root, p);
    if (id === "friends") {
      if (on) renderFriendPins(root, p);
      else {
        var stage = root.querySelector("[data-tower-scrapbook]");
        if (stage) {
          stage.querySelectorAll("[data-tower-friend-pin]").forEach(function (el) {
            el.remove();
          });
        }
      }
    }
    if (id === "badges") {
      if (on) renderBadgePins(root, p);
      else {
        var badgeStage = root.querySelector("[data-tower-scrapbook]");
        if (badgeStage) {
          badgeStage.querySelectorAll("[data-tower-badge-pin]").forEach(function (el) {
            el.remove();
          });
        }
      }
    }
    if (id === "calendar" && on) {
      try { refreshTowerCalendars(root); } catch (eCal) {}
    }
  }

  function syncOwnerStickerHandles(root) {
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (!stage) return;
    var owner = isTowerOwner(TowerProfileStore.get());
    var onPublic = root.getAttribute("data-tower-side") === "public";
    var show = owner && onPublic;
    stage.querySelectorAll("[data-tower-sticker-handle]").forEach(function (h) {
      /* Owner on Public: show the move handle (CSS also un-hides [hidden]). */
      h.hidden = !show;
    });
    stage.querySelectorAll("[data-tower-friend-pin]").forEach(function (pin) {
      pin.classList.toggle("is-arrangeable", show);
    });
    stage.querySelectorAll("[data-tower-badge-pin]").forEach(function (pin) {
      pin.classList.toggle("is-arrangeable", show);
    });
  }


  function normalizeTiltDegrees(v) {
    var n = parseFloat(v);
    if (isNaN(n)) n = 0;
    n = ((n % 360) + 360) % 360;
    if (n > 180) n -= 360;
    return Math.round(n * 10) / 10;
  }

  function getSelectedArrangeable(stage) {
    if (!stage) return null;
    return stage.querySelector(".is-widget-selected");
  }

  function syncRotateToolbar(root) {
    var bar = root.querySelector("[data-tower-rotate-toolbar]");
    var stage = root.querySelector("[data-tower-scrapbook]");
    var owner = isTowerOwner(TowerProfileStore.get()) && root.getAttribute("data-tower-side") === "public";
    var selected = getSelectedArrangeable(stage);
    if (bar) {
      bar.hidden = false;
      bar.setAttribute("aria-hidden", "false");
      var rotateBtn = bar.querySelector("[data-tower-rotate]");
      if (rotateBtn) rotateBtn.disabled = !(owner && selected);
      var removeSel = bar.querySelector("[data-tower-remove-selected]");
      var anySel = stage && stage.querySelector(".is-widget-selected");
      var selId = anySel ? anySel.getAttribute("data-tower-widget") : "";
      if (removeSel) removeSel.disabled = !(owner && anySel && selId !== "avatar" && selId !== "friends");
    }
    var scrap = root.querySelector("[data-tower-scrapbook-bar]");
    if (scrap) {
      scrap.hidden = !owner;
      scrap.setAttribute("aria-hidden", owner ? "false" : "true");
    }
  }

  function readTiltFromElement(el) {
    if (!el) return 0;
    var raw = el.style.getPropertyValue("--sticker-tilt") || "";
    var n = parseFloat(String(raw).replace("deg", ""));
    if (isNaN(n)) n = 0;
    return n;
  }

  function applyTiltToElement(el, tilt) {
    tilt = normalizeTiltDegrees(tilt);
    el.style.setProperty("--sticker-tilt", tilt + "deg");
    el.setAttribute("data-sticker-tilt", String(tilt));
  }

  function persistSelectedTilt(root, el, tilt) {
    var tiltStage = root && root.querySelector ? root.querySelector("[data-tower-scrapbook]") : null;
    if (tiltStage && isPhoneStage(tiltStage)) return;
    var p = TowerProfileStore.get();
    tilt = normalizeTiltDegrees(tilt);
    applyTiltToElement(el, tilt);
    var friendId = el.getAttribute("data-tower-friend-pin");
    if (friendId) {
      var fl = getFriendPinLayout(p);
      var prevF = fl[friendId] || {};
      fl[friendId] = {
        x: typeof prevF.x === "number" ? prevF.x : parseFloat(el.getAttribute("data-sticker-x") || "0"),
        y: typeof prevF.y === "number" ? prevF.y : parseFloat(el.getAttribute("data-sticker-y") || "0"),
        z: typeof prevF.z === "number" ? prevF.z : parseInt(el.getAttribute("data-sticker-z") || "12", 10),
        tilt: tilt,
      };
      p.friendPinLayout = fl;
      TowerProfileStore.save(p, { geometry: true });
      return;
    }
    var badgeId = el.getAttribute("data-tower-badge-pin");
    if (badgeId) {
      var bl = getBadgePinLayout(p);
      var prevB = bl[badgeId] || {};
      bl[badgeId] = {
        x: typeof prevB.x === "number" ? prevB.x : parseFloat(el.getAttribute("data-sticker-x") || "0"),
        y: typeof prevB.y === "number" ? prevB.y : parseFloat(el.getAttribute("data-sticker-y") || "0"),
        z: typeof prevB.z === "number" ? prevB.z : parseInt(el.getAttribute("data-sticker-z") || "14", 10),
        tilt: tilt,
      };
      p.badgePinLayout = bl;
      TowerProfileStore.save(p, { geometry: true });
      return;
    }
    var wid = el.getAttribute("data-tower-widget");
    if (!wid || wid === "feed" || wid === "messages") return;
    /* A Quote's tilt lives on its own quoteStickers entry, never under the
       shared "quote" layout key (#223). */
    var tiltQuoteId = el.getAttribute("data-tower-quote-id");
    if (wid === "quote" && tiltQuoteId) {
      p.quoteStickers = getQuoteStickers(p).map(function (q) {
        if (!q || q.id !== tiltQuoteId) return q;
        var nq = {};
        Object.keys(q).forEach(function (k) { nq[k] = q[k]; });
        nq.tilt = tilt;
        return nq;
      });
      TowerProfileStore.save(p, { geometry: true });
      return;
    }
    var layout = freezeSpawnedWidgets(el.closest ? el.closest("[data-tower-app]") || document : document, getWidgetLayout(p) || {});
    var prev = layout[wid] || {};
    layout[wid] = {
      x: typeof prev.x === "number" ? prev.x : parseFloat(el.getAttribute("data-sticker-x") || "0"),
      y: typeof prev.y === "number" ? prev.y : parseFloat(el.getAttribute("data-sticker-y") || "0"),
      z: typeof prev.z === "number" ? prev.z : parseInt(el.getAttribute("data-sticker-z") || "1", 10),
      tilt: tilt,
    };
    p.widgetLayout = layout;
    TowerProfileStore.save(p, { geometry: true });
  }

  /** delta: number degrees to add, or absolute via mode */
  function rotateSelectedWidget(root, deltaOrMode) {
    var stage = root.querySelector("[data-tower-scrapbook]");
    var el = getSelectedArrangeable(stage);
    if (!el) return;
    var cur = readTiltFromElement(el);
    var next;
    if (deltaOrMode === "straighten" || deltaOrMode === 0 || deltaOrMode === "0") {
      next = 0;
    } else if (deltaOrMode === "180" || deltaOrMode === 180) {
      next = 180;
    } else {
      next = cur + parseFloat(deltaOrMode);
    }
    persistSelectedTilt(root, el, next);
    syncRotateToolbar(root);
  }

  function initRotateToolbar(root) {
    if (!root || root.__cognationRotateBound) return;
    root.__cognationRotateBound = true;
    var bar = root.querySelector("[data-tower-rotate-toolbar]");
    if (!bar) return;
    bar.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest("[data-tower-rotate]");
      if (!btn || !bar.contains(btn)) return;
      if (!isTowerOwner(TowerProfileStore.get()) || root.getAttribute("data-tower-side") !== "public") return;
      var mode = btn.getAttribute("data-tower-rotate");
      if (mode === "straighten") rotateSelectedWidget(root, "straighten");
      else rotateSelectedWidget(root, parseFloat(mode));
    });
    syncRotateToolbar(root);
  }

  var FRIEND_AVATAR_COLORS = [
    "#f4a4c4", "#ef8bb4", "#d489b0", "#ffc1d9", "#c084a0",
    "#e8a0bf", "#b87a9a", "#f7b8ce", "#9b6b84", "#ffb3d1",
    "#d4a5bc", "#e091b3", "#c97a9e", "#f0a8c8", "#a87290",
  ];

  function friendHandleFromId(id) {
    return String(id || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "friend";
  }

  function friendInitials(name) {
    var parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function paintFriendPicture(node, friend, index) {
    if (!node || !friend) return;
    var style = friendAvatarStyle(friend, index);
    node.textContent = style.initials;
    node.style.background = style.background;
    node.style.color = style.color;
    node.style.backgroundSize = "";
    node.style.backgroundPosition = "";
    var rec = null;
    if (window.CognationAccounts && typeof window.CognationAccounts.getProfileByHandle === "function") {
      rec = window.CognationAccounts.getProfileByHandle(friendHandleFromId(friend.id));
    }
    var url = rec && rec.avatarDataUrl && String(rec.avatarDataUrl).indexOf("data:image/") === 0
      ? String(rec.avatarDataUrl)
      : "";
    if (!url) return;
    node.textContent = "";
    node.style.backgroundImage = 'url("' + url.replace(/"/g, "") + '")';
    node.style.backgroundSize = "cover";
    node.style.backgroundPosition = "center";
  }

  function friendAvatarStyle(friend, index) {
    var color = FRIEND_AVATAR_COLORS[index % FRIEND_AVATAR_COLORS.length];
    return {
      background: "linear-gradient(145deg, " + color + ", #fff5f9 70%)",
      color: "#4a2c3a",
      initials: friendInitials(friend && friend.name),
    };
  }


  /* ===== Tower calendar (private Connections + public scrapbook widget) ===== */
  var MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  function pad2(n) {
    n = parseInt(n, 10) || 0;
    return n < 10 ? "0" + n : String(n);
  }

  function towerCalIso(y, m0, day) {
    return y + "-" + pad2(m0 + 1) + "-" + pad2(day);
  }

  function towerCalTodayIso() {
    var d = new Date();
    return towerCalIso(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function towerCalAddDaysIso(iso, delta) {
    var parts = String(iso || "").split("-");
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) - 1;
    var d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) {
      var now = new Date();
      now.setDate(now.getDate() + (delta || 0));
      return towerCalIso(now.getFullYear(), now.getMonth(), now.getDate());
    }
    var dt = new Date(y, m, d + (delta || 0));
    return towerCalIso(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }

  function newCalendarEventId() {
    return "cal-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function normalizeCalendarEvent(ev) {
    if (!ev || typeof ev !== "object") return null;
    var status = ev.status === "pending" ? "pending" : "accepted";
    var source = ev.source === "friend" || ev.source === "google-ics" ? ev.source : "owner";
    var normalized = {
      id: String(ev.id || newCalendarEventId()),
      title: String(ev.title || "Event").trim().slice(0, 120) || "Event",
      date: String(ev.date || "").slice(0, 10),
      time: ev.time ? String(ev.time).slice(0, 8) : "",
      notes: ev.notes ? String(ev.notes).slice(0, 240) : "",
      status: status,
      source: source,
      requesterName: ev.requesterName ? String(ev.requesterName).slice(0, 80) : "",
    };
    if (Array.isArray(ev.signupFriendIds) && ev.signupFriendIds.length) {
      normalized.signupFriendIds = ev.signupFriendIds.map(function (id) { return String(id || ""); }).filter(Boolean);
    }
    if (ev.hostHandle) normalized.hostHandle = String(ev.hostHandle).replace(/^@/, "").slice(0, 80);
    if (ev.kind === "classroom") normalized.kind = "classroom";
    if (ev.kind === "webinar") {
      normalized.kind = "webinar";
      normalized.webinar = webinarLimits(ev.webinar && ev.webinar.record === "internal");
    }
    if (ev.kind === "auction" && ev.auction) {
      var sale = ev.auction;
      normalized.kind = "auction";
      normalized.auction = {
        chat: true, video: true, presenter: "handoff", bid: "message",
        item: String(sale.item || "").trim().slice(0, 120),
        start: Number(sale.start),
        handle: String(sale.handle || "").replace(/^@/, "").slice(0, 80),
        minAge: 16, payInRoom: false,
      };
    }
    if (ev.kind === "podcast") normalized.kind = "podcast";
    return normalized;
  }

  /* Old builds seeded four sample events (ids cal-demo-1..4)
     into every new calendar. They were never the owner's; drop them on read. */
  var SAMPLE_CALENDAR_ID = /^cal-demo-[1-4]$/;

  function normalizeCalendarEventsList(list) {
    if (!Array.isArray(list)) return [];
    return list.map(normalizeCalendarEvent).filter(function (e) {
      return e && !SAMPLE_CALENDAR_ID.test(String(e.id || "")) && /^\d{4}-\d{2}-\d{2}$/.test(e.date);
    });
  }

  function seedCalendarEventsIfMissing(p) {
    if (!p) return false;
    if (typeof p.calendarIcsUrl !== "string") p.calendarIcsUrl = "";
    else p.calendarIcsUrl = String(p.calendarIcsUrl).trim().slice(0, 500);
    if (p.calendarGoogleConnected == null) p.calendarGoogleConnected = false;
    else p.calendarGoogleConnected = !!p.calendarGoogleConnected;
    if (Array.isArray(p.calendarEvents)) {
      p.calendarEvents = normalizeCalendarEventsList(p.calendarEvents);
      return false;
    }
    /* No sample events: a new calendar starts empty (real data only). */
    p.calendarEvents = [];
    return true;
  }

  function getCalendarViewState(root, key) {
    if (!root.__towerCalView) root.__towerCalView = {};
    if (!root.__towerCalView[key]) {
      var d = new Date();
      root.__towerCalView[key] = {
        year: d.getFullYear(),
        month0: d.getMonth(),
        selected: towerCalTodayIso(),
      };
    }
    return root.__towerCalView[key];
  }

  function eventsForDate(events, iso) {
    return (events || []).filter(function (e) {
      return e && e.date === iso;
    });
  }

  function datesWithEvents(events, year, month0) {
    var mark = {};
    (events || []).forEach(function (e) {
      if (!e || !e.date) return;
      var parts = e.date.split("-");
      var y = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10) - 1;
      if (y === year && m === month0) mark[e.date] = true;
    });
    return mark;
  }

  function formatEventTime(t) {
    if (!t) return "";
    var parts = String(t).split(":");
    var h = parseInt(parts[0], 10);
    var min = parts[1] || "00";
    if (isNaN(h)) return t;
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ":" + min + " " + ampm;
  }

  function renderTowerMonthGrid(view, events, opts) {
    opts = opts || {};
    var year = view.year;
    var month0 = view.month0;
    var selected = view.selected;
    var marked = datesWithEvents(events, year, month0);
    var pendingMark = {};
    (events || []).forEach(function (e) {
      if (e && e.status === "pending" && e.date) pendingMark[e.date] = true;
    });
    var first = new Date(year, month0, 1);
    var startDow = first.getDay();
    var daysInMonth = new Date(year, month0 + 1, 0).getDate();
    var todayIso = towerCalTodayIso();
    var cells = [];
    var i;
    for (i = 0; i < startDow; i++) {
      cells.push('<div class="tower-cal-cell tower-cal-cell--empty" aria-hidden="true"></div>');
    }
    for (i = 1; i <= daysInMonth; i++) {
      var iso = towerCalIso(year, month0, i);
      var cls = "tower-cal-cell";
      if (iso === selected) cls += " is-selected";
      if (iso === todayIso) cls += " is-today";
      if (marked[iso]) cls += " has-events";
      if (pendingMark[iso]) cls += " has-pending";
      cells.push(
        '<button type="button" class="' +
          cls +
          '" data-tower-cal-day="' +
          escapeHtml(iso) +
          '" aria-label="' +
          escapeHtml(iso) +
          (marked[iso] ? ", has events" : "") +
          (iso === selected ? ", selected" : "") +
          '" aria-pressed="' +
          (iso === selected ? "true" : "false") +
          '"><span class="tower-cal-daynum">' +
          i +
          "</span>" +
          (marked[iso] ? '<span class="tower-cal-dot" aria-hidden="true"></span>' : "") +
          "</button>"
      );
    }
    var dow = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
      .map(function (d) {
        return '<span class="tower-cal-dow">' + d + "</span>";
      })
      .join("");
    return (
      '<div class="tower-cal-month" data-tower-cal-month>' +
      '<div class="tower-cal-nav">' +
      '<button type="button" class="btn btn-secondary tower-cal-nav-btn" data-tower-cal-prev aria-label="Previous month">‹</button>' +
      '<div class="tower-cal-label" aria-live="polite">' +
      escapeHtml(MONTH_NAMES[month0] + " " + year) +
      "</div>" +
      '<button type="button" class="btn btn-secondary tower-cal-nav-btn" data-tower-cal-next aria-label="Next month">›</button>' +
      "</div>" +
      '<div class="tower-cal-dows" aria-hidden="true">' +
      dow +
      "</div>" +
      '<div class="tower-cal-grid" role="grid" aria-label="' +
      escapeHtml(opts.gridLabel || "Calendar") +
      '">' +
      cells.join("") +
      "</div></div>"
    );
  }

  function renderDayEventList(events, iso, opts) {
    opts = opts || {};
    var list = eventsForDate(events, iso).slice().sort(function (a, b) {
      return String(a.time || "").localeCompare(String(b.time || ""));
    });
    if (!list.length) {
      return '<p class="form-hint tower-cal-empty">No events on this day.</p>';
    }
    return (
      '<ul class="tower-cal-event-list" role="list">' +
      list
        .map(function (e) {
          var badge =
            e.status === "pending"
              ? '<span class="tower-cal-badge tower-cal-badge--pending">Pending</span>'
              : e.source === "friend"
              ? '<span class="tower-cal-badge">Friend</span>'
              : "";
          if ((opts.busyOnly || e.busy) && e.kind !== "webinar") {
            return (
              '<li class="tower-cal-event is-busy" data-calendar-busy="true">' +
              '<div class="tower-cal-event-main">' +
              '<span class="tower-cal-event-time">' +
              escapeHtml(formatEventTime(e.time) || "—") +
              "</span>" +
              '<span class="tower-cal-event-title">Busy</span>' +
              "</div></li>"
            );
          }
          var who =
            e.requesterName && e.source === "friend"
              ? '<span class="tower-cal-event-who">from ' + escapeHtml(e.requesterName) + "</span>"
              : "";
          var actions = "";
          if (opts.ownerControls) {
            actions =
              '<span class="tower-cal-event-actions">' +
              (e.status === "pending"
                ? '<button type="button" class="btn btn-secondary tower-cal-mini" data-tower-cal-accept="' +
                  escapeHtml(e.id) +
                  '">Accept</button>'
                : "") +
              '<button type="button" class="btn btn-secondary tower-cal-mini" data-tower-cal-edit="' +
              escapeHtml(e.id) +
              '">Edit</button>' +
              '<button type="button" class="btn btn-secondary tower-cal-mini" data-tower-cal-delete="' +
              escapeHtml(e.id) +
              '">Delete</button></span>';
          }
          return (
            '<li class="tower-cal-event' +
            (e.status === "pending" ? " is-pending" : "") +
            '" data-event-id="' +
            escapeHtml(e.id) +
            '">' +
            '<div class="tower-cal-event-main">' +
            '<span class="tower-cal-event-time">' +
            escapeHtml(formatEventTime(e.time) || "—") +
            "</span>" +
            '<span class="tower-cal-event-title">' +
            escapeHtml(e.title) +
            (e.kind === "classroom" ? " · Classroom" : "") +
            "</span>" +
            badge +
            who +
            (e.notes
              ? '<span class="tower-cal-event-notes">' + escapeHtml(e.notes) + "</span>"
              : "") +
            (e.hostHandle
              ? '<a class="tower-cal-event-where" href="#tower-profile-' + escapeHtml(encodeURIComponent(String(e.hostHandle).replace(/^@/, ""))) + '" data-tower-author-open="' + escapeHtml(String(e.hostHandle).replace(/^@/, "")) + '">' + escapeHtml("Tower page") + "</a>"
              : "") +
            "</div>" +
            actions +
            (e.kind === "webinar"
              ? '<div class="tower-webinar" data-webinar-room>' + webinarRoomHtml(e.webinar && e.webinar.record === "internal") + "</div>"
              : "") +
            "</li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function accountProfilesFor(profile) {
    var accounts = window.CognationAccounts;
    if (!accounts || !profile) return [];
    var full = profile._profileId && accounts.getProfileById
      ? accounts.getProfileById(profile._profileId)
      : null;
    var username = full && full.accountUsername;
    if (username && accounts.getProfilesForUsername) {
      return accounts.getProfilesForUsername(username) || [];
    }
    return full ? [full] : [];
  }

  /* One calendar for personal, professional, Tower, and Circle. Personal events win on the same id. */
  function sharedCalendarEvents(profile) {
    var recs = accountProfilesFor(profile).slice().sort(function (a, b) {
      if (a && a.kind === "personal") return -1;
      if (b && b.kind === "personal") return 1;
      return 0;
    });
    var seen = {};
    var list = [];
    recs.forEach(function (rec) {
      (rec && rec.calendarEvents || []).forEach(function (ev) {
        if (!ev || !ev.id || seen[ev.id]) return;
        seen[ev.id] = true;
        list.push(ev);
      });
    });
    if (!list.length && profile && Array.isArray(profile.calendarEvents)) return profile.calendarEvents.slice();
    return list;
  }

  function writeSharedCalendar(profile, events) {
    if (!isTowerOwner(profile)) return;
    var accounts = window.CognationAccounts;
    var recs = accountProfilesFor(profile);
    if (profile) profile.calendarEvents = events;
    if (!accounts || typeof accounts.saveProfileRecord !== "function" || !recs.length) return;
    recs.forEach(function (rec) {
      if (!rec) return;
      rec.calendarEvents = events;
      try { accounts.saveProfileRecord(rec); } catch (eCal) {}
    });
  }

  /* A visitor on a personal or professional page sees blocked times only. */
  function busyBlocksOnly(events) {
    return (events || []).filter(function (e) {
      return e && e.status !== "pending";
    }).map(function (e) {
      if (e.kind === "webinar") {
        return { id: e.id, date: e.date, time: e.time || "", title: e.title, notes: "", status: "accepted", source: "owner", kind: "webinar", webinar: webinarLimits(e.webinar && e.webinar.record === "internal") };
      }
      return {
        id: "busy-" + e.id,
        date: e.date,
        time: e.time || "",
        title: "Busy",
        notes: "",
        status: "accepted",
        source: "owner",
        busy: true
      };
    });
  }

  function coerceEventWhen(raw) {
    var s = String(raw || "").replace(/[\u200e\u200f]/g, "").trim();
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3] + "T" + iso[4] + ":" + iso[5];
    var us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!us) return "";
    var h = parseInt(us[4], 10);
    var ap = (us[6] || "").toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    var mo = parseInt(us[1], 10);
    var day = parseInt(us[2], 10);
    if (mo < 1 || mo > 12 || day < 1 || day > 31 || h > 23) return "";
    return us[3] + "-" + pad2(mo) + "-" + pad2(day) + "T" + pad2(h) + ":" + us[5];
  }
  function readEventWhen(input) {
    if (!input) return "";
    var direct = coerceEventWhen(input.value);
    if (direct) return direct;
    var n = input.valueAsNumber;
    if (typeof n === "number" && isFinite(n)) {
      var d = new Date(n);
      if (!isNaN(d.getTime())) {
        return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) + "T" + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes());
      }
    }
    return "";
  }
  function normalizeGoingLive(raw) {
    if (!raw || typeof raw !== "object") return null;
    var when = coerceEventWhen(raw.when || raw.liveAt || "");
    var where = String(raw.where || "").trim().slice(0, 120);
    var what = String(raw.what || raw.title || "").trim().slice(0, 240);
    if (!what) what = String(raw.details || raw.notes || "").trim().slice(0, 240);
    if (!what || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) return null;
    return { id: "going-live", when: when, where: where, what: what };
  }

  function sharedGoingLive(profile) {
    var own = normalizeGoingLive(profile && profile.goingLive);
    if (own) return own;
    var recs = accountProfilesFor(profile);
    var i;
    for (i = 0; i < recs.length; i++) {
      var found = normalizeGoingLive(recs[i] && recs[i].goingLive);
      if (found) return found;
    }
    return null;
  }

  /* One going-live notice on the personal page and the professional page, plus the shared calendar. */
  function publishGoingLive(live) {
    live = normalizeGoingLive(live);
    if (!live) return null;
    var p = TowerProfileStore.get();
    if (!isTowerOwner(p)) return null;
    var events = sharedCalendarEvents(p).filter(function (e) {
      return e && e.id !== "going-live";
    });
    var parts = live.when.split("T");
    events.push({
      id: "going-live",
      title: live.what,
      date: parts[0],
      time: parts[1] || "",
      notes: live.where || "",
      status: "accepted",
      source: "owner",
    });
    events = normalizeCalendarEventsList(events);
    p.goingLive = live;
    p.calendarEvents = events;
    var accounts = window.CognationAccounts;
    var recs = accountProfilesFor(p);
    if (accounts && typeof accounts.saveProfileRecord === "function") {
      recs.forEach(function (rec) {
        if (!rec) return;
        rec.goingLive = live;
        rec.calendarEvents = events;
        try { accounts.saveProfileRecord(rec); } catch (eLive) {}
      });
    }
    TowerProfileStore.save(p);
    return live;
  }

  function renderGoingLiveWidget(root) {
    var sticker = root.querySelector('[data-tower-widget="going-live"]');
    if (!sticker) return;
    var body = sticker.querySelector("[data-tower-going-live-body]");
    var p = TowerProfileStore.get();
    var live = sharedGoingLive(p);
    if (!live) {
      sticker.hidden = true;
      sticker.classList.add("is-widget-off");
      if (body) body.innerHTML = "";
      return;
    }
    sticker.hidden = false;
    sticker.classList.remove("is-widget-off");
    if (!body) return;
    var owner = isTowerOwner(p);
    var parts = live.when.split("T");
    var whenText = parts[0] + (parts[1] ? " · " + formatEventTime(parts[1]) : "");
    if (owner && sticker.getAttribute("data-editing") === "true") {
      body.innerHTML =
        '<form class="tower-going-live-edit" data-tower-going-live-edit action="#" method="post">' +
        '<label for="tower-going-live-when">when:</label>' +
        '<input id="tower-going-live-when" type="datetime-local" required value="' + escapeHtml(live.when) + '" data-going-live-when>' +
        '<label for="tower-going-live-where">where:</label>' +
        '<input id="tower-going-live-where" type="text" maxlength="120" value="' + escapeHtml(live.where || "") + '" data-going-live-where>' +
        '<label for="tower-going-live-what">what:</label>' +
        '<input id="tower-going-live-what" type="text" maxlength="240" required value="' + escapeHtml(live.what) + '" data-going-live-what>' +
        '<div class="form-actions">' +
        '<button type="submit" class="btn btn-primary">Save</button>' +
        '<button type="button" class="btn btn-secondary" data-going-live-cancel>Cancel</button>' +
        "</div></form>";
      return;
    }
    body.innerHTML =
      '<p class="tower-going-live-when"><span class="tower-going-live-kicker">when:</span> ' + escapeHtml(whenText) + "</p>" +
      '<p class="tower-going-live-where"><span class="tower-going-live-kicker">where:</span> ' + escapeHtml(live.where || "") + "</p>" +
      '<p class="tower-going-live-what"><span class="tower-going-live-kicker">what:</span> ' + escapeHtml(live.what) + "</p>" +
      (owner ? '<button type="button" class="btn btn-secondary" data-going-live-edit>Edit</button>' : "");
  }

  function saveCalendarToProfile(mutator, opts) {
    if (!isTowerOwner(TowerProfileStore.get())) return TowerProfileStore.get();
    var p = TowerProfileStore.get();
    p.calendarEvents = sharedCalendarEvents(p);
    seedCalendarEventsIfMissing(p);
    mutator(p);
    p.calendarEvents = normalizeCalendarEventsList(p.calendarEvents);
    writeSharedCalendar(p, p.calendarEvents);
    TowerProfileStore.save(p, opts && opts.geometry ? { geometry: true } : undefined);
    return p;
  }

  function minutesOfClock(t) {
    var parts = String(t || "").split(":");
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (isNaN(h)) return null;
    return h * 60 + (isNaN(m) ? 0 : m);
  }

  var HANGOUT_SLOTS = [
    { time: "09:00", label: "Morning" },
    { time: "11:00", label: "Late morning" },
    { time: "13:00", label: "Early afternoon" },
    { time: "15:00", label: "Afternoon" },
    { time: "17:00", label: "Late afternoon" },
    { time: "19:30", label: "Evening" },
  ];

  /* Open parts of the selected day, from events already on the calendar. */
  function suggestHangoutTimes(events, iso) {
    var day = eventsForDate(events, iso);
    var busy = day.map(function (e) { return minutesOfClock(e.time); }).filter(function (n) {
      return n != null;
    });
    function isOpen(slot) {
      var m = minutesOfClock(slot.time);
      if (m == null) return false;
      return busy.every(function (b) { return Math.abs(b - m) >= 90; });
    }
    var open = HANGOUT_SLOTS.filter(isOpen);
    if (open.length < 3) {
      HANGOUT_SLOTS.forEach(function (slot) {
        if (open.length >= 3) return;
        if (open.some(function (s) { return s.time === slot.time; })) return;
        open.push(slot);
      });
    }
    return open.slice(0, 3);
  }

  function renderSchedulerPanel(events, iso, opts) {
    opts = opts || {};
    var slots = suggestHangoutTimes(events, iso);
    var dayEvents = eventsForDate(events, iso);
    var busyNote = dayEvents.some(function (e) { return e && e.busy; })
      ? "Some times on this day are blocked."
      : dayEvents.length
      ? "Already on this day: " + dayEvents.map(function (e) {
          return escapeHtml(e.title) + (e.time ? " at " + escapeHtml(formatEventTime(e.time)) : "");
        }).join(", ") + "."
      : "Nothing is booked on this day yet.";
    return (
      '<div class="tower-cal-scheduler" data-tower-cal-scheduler>' +
      "<h5 class=\"tower-cal-friend-heading\">Suggested hangouts</h5>" +
      '<p class="form-hint">Open times on ' + escapeHtml(iso) + ". " + busyNote + " Pick one.</p>" +
      '<div class="tower-cal-scheduler-actions">' +
      slots.map(function (slot) {
        return (
          '<button type="button" class="btn btn-secondary tower-cal-suggest' +
          (opts.picked === slot.time ? " is-picked" : "") +
          '" data-tower-cal-suggest="' +
          escapeHtml(slot.time) +
          '">' +
          escapeHtml(slot.label) + " · " + escapeHtml(formatEventTime(slot.time)) +
          "</button>"
        );
      }).join("") +
      (opts.visitor && opts.picked
        ? '<button type="button" class="btn btn-primary tower-cal-book" data-tower-cal-book="' +
          escapeHtml(opts.picked) +
          '">Book</button>'
        : "") +
      '<p class="commune-status' + (opts.bookError ? " is-error" : "") + '" data-tower-cal-book-status' +
      (opts.bookStatus ? "" : " hidden") +
      ' role="status" aria-live="polite">' +
      escapeHtml(opts.bookStatus || "") +
      "</p>" +
      "</div></div>"
    );
  }

  /* Status boxes in Edit profile show a plain line; raw error text is logged only. */
  function friendlyBookingError(err) {
    var raw = String((err && err.message) || "");
    if (/sign in/i.test(raw)) return "Sign in to book a time.";
    if (/can't take/i.test(raw)) return "This calendar can't take bookings yet.";
    return "Couldn't send the request. Try again.";
  }

  function friendlyAddProfileError(err) {
    var raw = String((err && err.message) || err || "");
    if (/sign in/i.test(raw)) return "Sign in to add a page.";
    if (/handle/i.test(raw)) return "That page handle isn't available. Change your handle and try again.";
    return "Couldn't create your professional page. Try again.";
  }

  /* Visitor books an open time: one hangout request to the Tower owner, saved on the server. */
  function requestHangoutOnServer(profileId, iso, time) {
    var sb = window.CognationSupabase;
    if (!sb || typeof sb.rpc !== "function" || !signedInUserId()) {
      return Promise.reject(new Error("Sign in to book a time."));
    }
    if (!/^[0-9a-f-]{36}$/i.test(String(profileId || ""))) {
      return Promise.reject(new Error("This calendar can't take bookings yet."));
    }
    return sb.rpc("request_hangout", { p_profile_id: profileId, p_date: iso, p_time: time });
  }

  /* Capacity only. Not a count of people watching. */
  function webinarLimits(record) {
    return { viewers: 200000, live: 50, presenters: 1, comments: false, speak: "raise-hand", record: record ? "internal" : "" };
  }

  function webinarRoomHtml(record) {
    return '<div class="tower-webinar-stage"><video data-webinar-presenter muted playsinline></video><span class="tower-webinar-name">Main presenter</span></div>' +
      '<p class="tower-webinar-limits">Up to 200,000 viewers · Up to 50 live</p>' +
      '<p class="tower-webinar-actions"><button type="button" class="btn btn-secondary" data-webinar-join>Join on video</button> ' +
      '<button type="button" class="btn btn-secondary" data-webinar-hand>Raise your hand</button></p>' +
      '<p class="tower-webinar-speak">Join on video, then raise your hand to speak.</p>' +
      '<label class="tower-cal-pill"><input type="checkbox" data-webinar-record' + (record ? " checked" : "") + "> Record internally</label>" +
      '<p class="tower-webinar-record-note">Saved on Cognation only.</p>' +
      '<p class="tower-webinar-actions"><button type="button" class="btn btn-secondary" data-webinar-export>Export</button> ' +
      '<button type="button" class="btn btn-secondary" data-webinar-post>Post on YouTube</button></p>';
  }

  /* A suggested time or a Book click becomes a calendar event on this profile. */
  function addScheduledHangout(iso, time, fromVisitor) {
    var p = TowerProfileStore.get();
    var event = {
      id: newCalendarEventId(),
      title: "Hangout",
      date: iso,
      time: time,
      notes: fromVisitor ? "Booked from the calendar" : "Suggested open time",
      status: "accepted",
      source: fromVisitor ? "friend" : "owner"
    };
    if (fromVisitor) {
      var who = getSessionUsername();
      if (who) event.requesterName = who.slice(0, 80);
    }
    function taken(list) {
      return (list || []).some(function (e) {
        return e && e.date === iso && String(e.time || "").slice(0, 5) === time;
      });
    }
    if (!p || taken(sharedCalendarEvents(p))) return false;
    if (isTowerOwner(p)) {
      saveCalendarToProfile(function (prof) {
        if (!taken(prof.calendarEvents)) prof.calendarEvents.push(event);
      });
      return true;
    }
    var accounts = window.CognationAccounts;
    var recs = accountProfilesFor(p);
    if (!recs.length && p._profileId) recs = [{ id: p._profileId, calendarEvents: p.calendarEvents || [] }];
    var wrote = false;
    recs.forEach(function (rec) {
      if (!rec || !rec.id || !accounts || typeof accounts.updateProfileTower !== "function") return;
      var list = Array.isArray(rec.calendarEvents) ? rec.calendarEvents.slice() : [];
      if (!list.length && Array.isArray(p.calendarEvents)) list = p.calendarEvents.slice();
      if (taken(list)) return;
      list.push(event);
      var result = accounts.updateProfileTower(rec.id, { calendarEvents: list });
      if (result && result.ok) wrote = true;
    });
    return wrote;
  }

  function calendarKindPills(kind) {
    function one(value, label) {
      return '<label class="tower-cal-pill"><input type="checkbox" name="eventKind" value="' + value + '" data-tower-cal-kind' + (kind === value ? " checked" : "") + "> " + label + "</label>";
    }
    return '<div class="tower-cal-pills" data-tower-cal-pills role="group" aria-label="Event kind">' +
      one("classroom", "Classroom") + one("auction", "Auction") +
      '<p class="form-hint">Check one before the event is added. Auction opens a chat room with video and a presenter who can hand off the live spot and take it back. No one under 16 can bid.</p></div>';
  }
  function auctionSaleFields(editing) {
    var sale = (editing && editing.auction) || {};
    var shown = editing && editing.kind === "auction";
    return '<div data-tower-cal-auction-fields' + (shown ? "" : " hidden") + ">" +
      '<div class="form-group"><label for="tower-cal-selling">Selling</label>' +
      '<input id="tower-cal-selling" name="selling" type="text" maxlength="120" value="' + escapeHtml(sale.item || "") + '" data-tower-cal-selling></div>' +
      '<div class="form-group"><label for="tower-cal-start">Starting bid</label>' +
      '<input id="tower-cal-start" name="start" inputmode="decimal" maxlength="8" value="' + escapeHtml(sale.start == null ? "" : String(sale.start)) + '" data-tower-cal-start></div></div>';
  }
  function applyEventKind(event, kind, profile, sale) {
    event.kind = kind === "auction" ? "auction" : "classroom";
    if (event.kind !== "auction") { delete event.auction; return; }
    sale = sale || {};
    event.auction = {
      chat: true, video: true, presenter: "handoff", bid: "message",
      item: String(sale.item || "").trim(), start: Number(sale.start),
      handle: String((profile && profile.handle) || "").replace(/^@/, ""),
      minAge: 16, payInRoom: false,
    };
  }

  function calendarEditorHtml(editing, selected) {
    var on = !!(editing && editing.kind === "webinar");
    var formTitle = editing ? editing.title : "";
    var formDate = editing ? editing.date : selected;
    var formTime = editing ? editing.time || "" : "";
    var formNotes = editing ? editing.notes || "" : "";
    return '<form class="tower-cal-editor" data-tower-cal-editor action="#" method="post">' +
      "<h5>" + (editing ? "Edit event" : "Add event") + "</h5>" +
      calendarKindPills(editing && editing.kind) +
      auctionSaleFields(editing) +
      (window.CognationClassroomEvent ? window.CognationClassroomEvent.pillHtml(!!(editing && editing.kind === "classroom")) : "") +
      '<div class="tower-cal-pills" role="group" aria-label="Event kind"><label class="tower-cal-pill"><input type="checkbox" name="eventKind" value="webinar" data-tower-cal-webinar' +
      (on ? " checked" : "") + "> Webinar</label></div>" +
      '<div class="tower-webinar" data-webinar-room' + (on ? "" : " hidden") + ">" + webinarRoomHtml(editing && editing.webinar && editing.webinar.record === "internal") + "</div>" +
      (editing ? '<input type="hidden" name="id" value="' + escapeHtml(editing.id) + '" data-tower-cal-edit-id>' : "") +
      '<div class="form-group"><label for="tower-cal-edit-title">Title</label>' +
      '<input id="tower-cal-edit-title" name="title" type="text" maxlength="120" required value="' + escapeHtml(formTitle) + '" data-tower-cal-edit-title></div>' +
      '<div class="tower-cal-friend-row">' +
      '<div class="form-group"><label for="tower-cal-edit-date">Date</label>' +
      '<input id="tower-cal-edit-date" name="date" type="date" required value="' + escapeHtml(formDate) + '" data-tower-cal-edit-date></div>' +
      '<div class="form-group"><label for="tower-cal-edit-time">Time</label>' +
      '<input id="tower-cal-edit-time" name="time" type="time" value="' + escapeHtml(formTime) + '" data-tower-cal-edit-time></div></div>' +
      '<div class="form-group"><label for="tower-cal-edit-notes">Notes</label>' +
      '<input id="tower-cal-edit-notes" name="notes" type="text" maxlength="240" value="' + escapeHtml(formNotes) + '" data-tower-cal-edit-notes></div>' +
      '<div class="form-actions"><button type="submit" class="btn btn-primary">' + (editing ? "Save changes" : "Add event") + "</button>" +
      (editing ? '<button type="button" class="btn btn-secondary" data-tower-cal-cancel-edit>Cancel</button>' : "") +
      "</div>" +
      '<p class="commune-status" data-tower-cal-editor-status hidden role="status" aria-live="polite"></p></form>';
  }

  function renderPrivateCalendar(root) {
    var host = root.querySelector("[data-tower-cal-private]");
    if (!host) return;
    var p = TowerProfileStore.get();
    p.calendarEvents = sharedCalendarEvents(p);
    seedCalendarEventsIfMissing(p);
    var view = getCalendarViewState(root, "private");
    var ownerFeed = isTowerOwner(p);
    var events = ownerFeed ? (p.calendarEvents || []) : busyBlocksOnly(p.calendarEvents || []);
    var selected = view.selected;
    host.innerHTML =
      renderTowerMonthGrid(view, events, { gridLabel: ownerFeed ? "My calendar" : "Calendar" }) +
      '<div class="tower-cal-day-panel">' +
      '<h5 class="tower-cal-day-heading">' +
      (ownerFeed ? "Events · " : "Busy · ") +
      escapeHtml(selected) +
      "</h5>" +
      renderDayEventList(events, selected, { ownerControls: ownerFeed, busyOnly: !ownerFeed }) +
      "</div>";

    var icsInput = root.querySelector("[data-tower-cal-ics-url]");
    if (icsInput && document.activeElement !== icsInput) {
      icsInput.value = p.calendarIcsUrl || "";
    }
    var gStatus = root.querySelector("[data-tower-cal-google-status]");
    if (gStatus) {
      if (p.calendarGoogleConnected) {
        gStatus.hidden = false;
        gStatus.textContent =
          "Marked connected (demo stub). OAuth needs a free backend later." +
          (p.calendarIcsUrl ? " ICS link saved." : "");
      } else if (p.calendarIcsUrl) {
        gStatus.hidden = false;
        gStatus.textContent = "ICS / public calendar URL saved (no live Google sync from browser).";
      } else {
        gStatus.hidden = true;
        gStatus.textContent = "";
      }
    }
  }

  /* Owner's Calendar day heading (Edit profile > Calendar): "Thu, Oct 22".
     Display only: the stored date stays YYYY-MM-DD. The parts are read as a
     local calendar date (never new Date("YYYY-MM-DD"), which is UTC midnight
     and can land on the day before west of UTC). Anything else comes back as is. */
  function formatCalendarDayLabel(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso == null ? "" : iso));
    if (!m) return String(iso == null ? "" : iso);
    var y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
    var date = new Date(y, mo, d, 12, 0, 0, 0);
    if (isNaN(date.getTime()) || date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) {
      return String(iso);
    }
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  /* Owner Add event on the Edit profile calendar. Classroom is checked before that event is a classroom. */
  function classroomAddFormHtml(selected) {
    if (!window.CognationClassroomEvent) return "";
    return '<form class="tower-cal-editor" data-tower-cal-editor action="#" method="post"><h5>Add event</h5>' +
      window.CognationClassroomEvent.pillHtml(false) +
      '<label for="tower-cal-add-title">Title</label>' +
      '<input id="tower-cal-add-title" type="text" maxlength="120" required data-tower-cal-edit-title>' +
      '<label for="tower-cal-add-date">Date</label>' +
      '<input id="tower-cal-add-date" type="date" required value="' + escapeHtml(selected || "") + '" data-tower-cal-edit-date>' +
      '<div class="form-actions"><button type="submit" class="btn btn-primary">Add event</button></div>' +
      '<p class="commune-status" data-tower-cal-editor-status hidden role="status" aria-live="polite"></p></form>';
  }

  function renderPublicCalendar(root) {
    var body = root.querySelector("[data-tower-cal-public-body]");
    if (!body) return;
    var p = TowerProfileStore.get();
    p.calendarEvents = sharedCalendarEvents(p);
    seedCalendarEventsIfMissing(p);
    var view = getCalendarViewState(root, "public");
    var owner = isTowerOwner(p);
    var shared = p.calendarEvents || [];
    /* Owner sees details on personal and professional. A visitor sees busy blocks on both. */
    var events = owner
      ? shared.filter(function (e) {
          if (!e) return false;
          if (e.status === "accepted") return true;
          return e.status === "pending";
        })
      : busyBlocksOnly(shared);
    var selected = view.selected;
    var schedulerHtml = view.schedulerOpen
      ? renderSchedulerPanel(owner ? shared : events, selected, {
          visitor: !owner,
          picked: owner ? "" : view.pickedTime || "",
          bookStatus: owner ? "" : view.bookStatus || "",
          bookError: owner ? false : !!view.bookError,
        })
      : "";
    var calRoot = root.querySelector('[data-tower-widget="calendar"]');
    if (calRoot) {
      calRoot.hidden = false;
      calRoot.classList.remove("is-widget-off");
      calRoot.setAttribute("data-calendar-audience", owner ? "owner" : "visitor");
      calRoot.setAttribute("data-calendar-kind", profileIsProfessional(p) ? "professional" : "personal");
    }
    var publicCal = root.querySelector("[data-tower-cal-public]");
    if (publicCal) {
      publicCal.setAttribute("aria-label", "Calendar");
      publicCal.setAttribute("data-calendar-busy", owner ? "false" : "true");
    }
    body.innerHTML =
      renderTowerMonthGrid(view, events, { gridLabel: "Calendar" }) +
      '<div class="tower-cal-day-panel">' +
      '<h5 class="tower-cal-day-heading">' +
      (owner ? "" : "Busy · ") +
      escapeHtml(owner ? formatCalendarDayLabel(selected) : selected) +
      "</h5>" +
      renderDayEventList(events, selected, { ownerControls: owner, busyOnly: !owner }) +
      (owner && window.CognationEchoPodcast && window.CognationEchoPodcast.addBar ? window.CognationEchoPodcast.addBar() : "") +
      "</div>" +
      schedulerHtml;
  }

  function visitorSessionRowHtml(sess, api) {
    var live = api.isLiveNow(sess);
    var when = new Date(sess.startsAt);
    var day = when.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    return '<li class="tower-visitor-session' + (live ? " is-live" : "") + '" data-visitor-session="' + escapeHtml(sess.id) + '">' +
      '<span class="cgn-cal-tag cgn-cal-tag--' + sess.kind + '">' + (sess.kind === "webinar" ? "Webinar" : "Classroom") + "</span>" +
      (live ? '<span class="cgn-live-pill"><i class="cgn-live-dot" aria-hidden="true"></i>LIVE</span>' : "") +
      '<span class="tower-visitor-session-title">' + escapeHtml(sess.title) + "</span>" +
      '<span class="tower-visitor-session-time">' + escapeHtml(day + " · " + api.timeLabel(sess.startsAt) + " · " + api.minutesOf(sess) + " min") + "</span>" +
      (live ? '<a class="cgn-cal-join" href="#classroom-' + escapeHtml(sess.id) + '">Join</a>' : "") +
      "</li>";
  }

  /* Visitor day heading: "Tue, Oct 20" (Cognation Calendar format); "Busy · " only
     when that day really has a (busy-only) event. */
  function visitorDayHeading(events, iso) {
    var api = window.CognationClassroomSessions;
    var label = api && typeof api.dayDateLabel === "function"
      ? api.dayDateLabel(iso)
      : (function () {
          var d = new Date(String(iso) + "T12:00:00");
          return isNaN(d.getTime()) ? String(iso || "") : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
        })();
    return (eventsForDate(events || [], iso).length ? "Busy · " : "") + label;
  }

  /* Visitor Calendar (restored from #158): busy blocks only for personal events
     (busyBlocksOnly), plus this host's public Classroom / Webinar sessions. */
  function renderVisitorCalendar(root) {
    var box = root.querySelector("[data-tower-visitor-calendar]");
    if (!box) return;
    var p = TowerProfileStore.get();
    var wasHidden = box.hidden;
    if (!p || isTowerOwner(p)) {
      box.hidden = true;
      if (!wasHidden) respawnVisitorCalendar(root, p);
      return;
    }
    /* The owner removed Calendar: visitors don't get this card until Show. */
    if (widgetRemovedByOwner(p, "calendar")) {
      box.hidden = true;
      if (!wasHidden) respawnVisitorCalendar(root, p);
      return;
    }
    box.hidden = false;
    var events = busyBlocksOnly(sharedCalendarEvents(p) || []);
    var view = getCalendarViewState(root, "visitor");
    var body = box.querySelector("[data-tower-cal-visitor-body]");
    if (body) {
      body.innerHTML =
        renderTowerMonthGrid(view, events, { gridLabel: "Calendar" }) +
        '<div class="tower-cal-day-panel"><h5 class="tower-cal-day-heading">' + escapeHtml(visitorDayHeading(events, view.selected)) + "</h5>" +
        renderDayEventList(events, view.selected, { ownerControls: false, busyOnly: true }) + "</div>";
    }
    var sessionsBox = box.querySelector("[data-tower-visitor-sessions]");
    if (!sessionsBox) return;
    var api = window.CognationClassroomSessions;
    var pro = profileIsProfessional(p);
    var list = pro && api && typeof api.forHost === "function" ? api.forHost(p._profileId || p.id) : [];
    sessionsBox.hidden = !pro;
    if (!pro) sessionsBox.innerHTML = "";
    else {
      sessionsBox.innerHTML = '<h5 class="tower-visitor-sessions-title">Classroom sessions</h5>' +
        (list.length
          ? '<ul class="tower-visitor-session-list" role="list">' + list.map(function (sess) { return visitorSessionRowHtml(sess, api); }).join("") + "</ul>"
          : '<p class="form-hint tower-cal-empty">No sessions booked yet.</p>');
    }
    /* The card just appeared (or changed height on a sessions list): give it its
       spot under the bio card. */
    if (wasHidden) respawnVisitorCalendar(root, p);
  }

  function respawnVisitorCalendar(root, p) {
    try { spawnUnplacedWidgets(root, p); } catch (eSpawn) {}
  }

  function refreshTowerCalendars(root) {
    if (!root) return;
    try {
      renderVisitorCalendar(root);
    } catch (eVis) {}
    try {
      renderPrivateCalendar(root);
    } catch (e) {}
    try {
      renderPublicCalendar(root);
    } catch (e2) {}
    try {
      renderPersonalMiniCalendar(root);
    } catch (e3) {}
  }

  function renderPersonalMiniCalendar(root) {
    var host = root.querySelector("[data-tower-cal-personal-mini]");
    if (!host) return;
    var p = TowerProfileStore.get() || {};
    var events = sharedCalendarEvents(p);
    var now = new Date();
    var y = now.getFullYear();
    var m0 = now.getMonth();
    var monthName = now.toLocaleString(undefined, { month: "short", year: "numeric" });
    var daysIn = new Date(y, m0 + 1, 0).getDate();
    var today = now.getDate();
    var html = '<span class="tower-cal-mini-month">' + monthName + "</span>";
    html += '<div class="tower-cal-mini-grid" role="presentation">';
    for (var d = 1; d <= Math.min(daysIn, 28); d++) {
      var mm = m0 + 1 < 10 ? "0" + (m0 + 1) : String(m0 + 1);
      var dd = d < 10 ? "0" + d : String(d);
      var iso = y + "-" + mm + "-" + dd;
      var has = events.some(function (ev) {
        return ev && String(ev.date || ev.day || "").slice(0, 10) === iso;
      });
      html +=
        '<span class="' +
        (d === today ? "is-today" : "") +
        (has ? " has-event" : "") +
        '">' +
        d +
        "</span>";
    }
    html += "</div>";
    html +=
      '<p class="form-hint tower-cal-mini-hint">' +
      events.length +
      " event" +
      (events.length === 1 ? "" : "s") +
      "</p>";
    host.innerHTML = html;
  }

  function initTowerCalendar(root) {
    if (!root || root.__cognationCalendarBound) return;
    root.__cognationCalendarBound = true;
    /* Public sessions arrive after load: repaint the visitor Calendar. */
    document.addEventListener("cognation:classroom-sessions-updated", function () {
      try { renderVisitorCalendar(root); } catch (eSess) {}
    });
    document.addEventListener("cognation:podcast-calendar", function () {
      try { refreshTowerCalendars(root); } catch (ePod) {}
    });

    root.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !root.contains(t)) return;

      var joinBtn = t.closest("[data-webinar-join]");
      if (joinBtn) {
        ev.preventDefault();
        var room = joinBtn.closest("[data-webinar-room]");
        if (!room) return;
        room.setAttribute("data-webinar-joined", "true");
        joinBtn.textContent = "On video";
        var video = room.querySelector("[data-webinar-presenter]");
        var media = navigator.mediaDevices;
        if (media && video && media.getUserMedia) {
          media.getUserMedia({ video: true, audio: false }).then(function (stream) {
            video.srcObject = stream;
            video.setAttribute("data-webinar-live", "true");
            video.play();
          }).catch(function () {});
        }
        return;
      }
      var handBtn = t.closest("[data-webinar-hand]");
      if (handBtn) {
        ev.preventDefault();
        var roomH = handBtn.closest("[data-webinar-room]");
        var line = roomH && roomH.querySelector(".tower-webinar-speak");
        if (!roomH || roomH.getAttribute("data-webinar-joined") !== "true") {
          if (line) line.textContent = "Join on video, then raise your hand to speak.";
          return;
        }
        var up = handBtn.getAttribute("aria-pressed") !== "true";
        handBtn.setAttribute("aria-pressed", up ? "true" : "false");
        handBtn.textContent = up ? "Hand raised" : "Raise your hand";
        if (line) line.textContent = up ? "Your hand is raised." : "Join on video, then raise your hand to speak.";
        return;
      }
      var share = t.closest("[data-webinar-export], [data-webinar-post]");
      if (share) {
        ev.preventDefault();
        var roomX = share.closest("[data-webinar-room]");
        var noteX = roomX && roomX.querySelector(".tower-webinar-record-note");
        var recorded = roomX && roomX.querySelector("[data-webinar-record]:checked");
        if (!recorded) { if (noteX) noteX.textContent = "Saved on Cognation only."; return; }
        if (share.hasAttribute("data-webinar-export")) {
          roomX.setAttribute("data-webinar-exported", "1");
          if (noteX) noteX.textContent = "Exported. Not posted.";
          return;
        }
        if (roomX.getAttribute("data-webinar-exported") !== "1") { if (noteX) noteX.textContent = "Export first. Not posted."; return; }
        if (noteX) noteX.textContent = "Not posted. No YouTube connection.";
        return;
      }

      var prev = t.closest("[data-tower-cal-prev]");
      var next = t.closest("[data-tower-cal-next]");
      if (prev || next) {
        var host = (prev || next).closest("[data-tower-cal-private], [data-tower-cal-public], [data-tower-cal-public-body]");
        var key = "private";
        if (host && (host.hasAttribute("data-tower-cal-public") || host.hasAttribute("data-tower-cal-public-body") || (host.closest && host.closest("[data-tower-cal-public]")))) {
          key = "public";
        }
        if ((prev || next).closest("[data-tower-cal-public], [data-tower-widget=\"calendar\"]")) key = "public";
        if ((prev || next).closest("[data-tower-cal-private]")) key = "private";
        if ((prev || next).closest("[data-tower-cal-visitor]")) key = "visitor";
        var view = getCalendarViewState(root, key);
        if (prev) {
          view.month0 -= 1;
          if (view.month0 < 0) {
            view.month0 = 11;
            view.year -= 1;
          }
        } else {
          view.month0 += 1;
          if (view.month0 > 11) {
            view.month0 = 0;
            view.year += 1;
          }
        }
        refreshTowerCalendars(root);
        return;
      }

      var dayBtn = t.closest("[data-tower-cal-day]");
      if (dayBtn) {
        var iso = dayBtn.getAttribute("data-tower-cal-day");
        var key2 = dayBtn.closest("[data-tower-cal-visitor]")
          ? "visitor"
          : dayBtn.closest("[data-tower-cal-public], [data-tower-widget=\"calendar\"]")
          ? "public"
          : "private";
        var view2 = getCalendarViewState(root, key2);
        view2.selected = iso;
        var parts = iso.split("-");
        view2.year = parseInt(parts[0], 10);
        view2.month0 = parseInt(parts[1], 10) - 1;
        if (key2 === "public") {
          view2.schedulerOpen = true;
          view2.pickedTime = "";
          view2.bookStatus = "";
          view2.bookError = false;
        } else {
          var privHost = root.querySelector("[data-tower-cal-private]");
          if (privHost && !privHost.getAttribute("data-editing-id")) {
            var dateField = null;
            /* date filled after re-render */
          }
        }
        refreshTowerCalendars(root);
        return;
      }

      var podAdd = t.closest("[data-podcast-cal-add]");
      if (podAdd && window.CognationEchoPodcast) {
        ev.preventDefault();
        var podType = podAdd.parentNode && podAdd.parentNode.querySelector("[data-podcast-cal-type]");
        var podDay = getCalendarViewState(root, "public").selected;
        window.CognationEchoPodcast.addOwn(podType && podType.value, podDay);
        refreshTowerCalendars(root);
        return;
      }

      var acceptBtn = t.closest("[data-tower-cal-accept]");
      if (acceptBtn) {
        var aid = acceptBtn.getAttribute("data-tower-cal-accept");
        saveCalendarToProfile(function (p) {
          (p.calendarEvents || []).forEach(function (e) {
            if (e.id === aid) e.status = "accepted";
          });
        });
        refreshTowerCalendars(root);
        return;
      }

      var delBtn = t.closest("[data-tower-cal-delete]");
      if (delBtn) {
        var did = delBtn.getAttribute("data-tower-cal-delete");
        saveCalendarToProfile(function (p) {
          p.calendarEvents = (p.calendarEvents || []).filter(function (e) {
            return e.id !== did;
          });
        });
        if (window.CognationClassroomEvent) window.CognationClassroomEvent.drop(did);
        var ph = root.querySelector("[data-tower-cal-public]");
        if (ph && ph.getAttribute("data-editing-id") === did) ph.removeAttribute("data-editing-id");
        var phPrivate = root.querySelector("[data-tower-cal-private]");
        if (phPrivate && phPrivate.getAttribute("data-editing-id") === did) phPrivate.removeAttribute("data-editing-id");
        refreshTowerCalendars(root);
        return;
      }

      var editBtn = t.closest("[data-tower-cal-edit]");
      if (editBtn) {
        var eid = editBtn.getAttribute("data-tower-cal-edit");
        var priv = root.querySelector("[data-tower-cal-public]");
        if (priv) priv.setAttribute("data-editing-id", eid);
        refreshTowerCalendars(root);
        var focusTitle = root.querySelector("[data-tower-cal-edit-title]");
        if (focusTitle) {
          try {
            focusTitle.focus();
          } catch (eF) {}
        }
        return;
      }

      if (t.closest("[data-tower-cal-cancel-edit]")) {
        var priv2 = root.querySelector("[data-tower-cal-public]");
        if (priv2) priv2.removeAttribute("data-editing-id");
        refreshTowerCalendars(root);
        return;
      }

      if (t.closest("[data-tower-cal-google-connect]")) {
        saveCalendarToProfile(function (p) {
          p.calendarGoogleConnected = true;
        });
        var st = root.querySelector("[data-tower-cal-google-status]");
        if (st) {
          st.hidden = false;
          st.textContent =
            "Connect Google Calendar is a demo stub. Real OAuth needs a free backend later — no paid Google API from the browser.";
        }
        refreshTowerCalendars(root);
        return;
      }

      var suggestBtn = t.closest("[data-tower-cal-suggest]");
      if (suggestBtn) {
        var slotTime = suggestBtn.getAttribute("data-tower-cal-suggest") || "";
        var viewS = getCalendarViewState(root, "public");
        var slotIso = viewS.selected;
        if (!/^\d{2}:\d{2}$/.test(slotTime) || !/^\d{4}-\d{2}-\d{2}$/.test(slotIso)) return;
        var fromVisitor = !isTowerOwner(TowerProfileStore.get());
        var savedTime = addScheduledHangout(slotIso, slotTime, fromVisitor);
        viewS.schedulerOpen = true;
        viewS.pickedTime = fromVisitor ? slotTime : "";
        viewS.bookStatus = fromVisitor ? (savedTime ? "Booked." : "Couldn't save that time.") : "";
        ev.preventDefault();
        refreshTowerCalendars(root);
        return;
      }

      var bookBtn = t.closest("[data-tower-cal-book]");
      if (bookBtn) {
        ev.preventDefault();
        var viewB = getCalendarViewState(root, "public");
        var bookTime = bookBtn.getAttribute("data-tower-cal-book") || "";
        var bookIso = viewB.selected;
        if (!/^\d{2}:\d{2}$/.test(bookTime) || !/^\d{4}-\d{2}-\d{2}$/.test(bookIso)) return;
        var saved = addScheduledHangout(bookIso, bookTime, true);
        viewB.pickedTime = "";
        viewB.bookStatus = saved ? "Booked." : "Couldn't save that time.";
        viewB.schedulerOpen = true;
        refreshTowerCalendars(root);
        return;
      }

      if (t.closest("[data-tower-cal-ics-save]")) {
        var ics = root.querySelector("[data-tower-cal-ics-url]");
        var url = ics ? String(ics.value || "").trim().slice(0, 500) : "";
        saveCalendarToProfile(function (p) {
          p.calendarIcsUrl = url;
        });
        var st2 = root.querySelector("[data-tower-cal-google-status]");
        if (st2) {
          st2.hidden = false;
          st2.textContent = url
            ? "ICS / public calendar URL saved (paste-only stub · no live fetch of paid Google APIs)."
            : "ICS link cleared.";
        }
        return;
      }

      var pubCal = t.closest('[data-tower-widget="calendar"]');
      if (!pubCal || !pubCal.contains(t)) return;
      if (pubCal.__cognationDraggedAt && Date.now() - pubCal.__cognationDraggedAt < 500) return;
      if (t.closest("a, button, input, textarea, select, label, summary")) return;
      var viewG = getCalendarViewState(root, "public");
      viewG.schedulerOpen = true;
      refreshTowerCalendars(root);
    }, true);

    root.addEventListener("change", function (ev) {
      var box = ev.target && ev.target.matches && ev.target.matches("[data-tower-cal-webinar]") ? ev.target : null;
      if (!box || !root.contains(box)) return;
      var room = box.form && box.form.querySelector("[data-webinar-room]");
      if (room) room.hidden = !box.checked;
      if (!box.checked) return;
      var form = box.form;
      if (!form) return;
      form.querySelectorAll("[data-tower-cal-kind]").forEach(function (el) { el.checked = false; });
      var classPill = form.querySelector("[data-tower-cal-classroom]");
      if (classPill) classPill.checked = false;
      var saleFields = form.querySelector("[data-tower-cal-auction-fields]");
      if (saleFields) saleFields.hidden = true;
    });

    root.addEventListener("change", function (ev) {
      var box = ev.target && ev.target.matches && ev.target.matches("[data-tower-cal-kind]") ? ev.target : null;
      if (!box || !box.checked || !root.contains(box)) return;
      var group = box.closest("[data-tower-cal-pills]");
      if (!group) return;
      group.querySelectorAll("[data-tower-cal-kind]").forEach(function (el) { if (el !== box) el.checked = false; });
      var formK = box.closest("form");
      var saleFields = formK && formK.querySelector("[data-tower-cal-auction-fields]");
      if (saleFields) saleFields.hidden = box.value !== "auction";
      var webinarBox = formK && formK.querySelector("[data-tower-cal-webinar]");
      if (webinarBox) webinarBox.checked = false;
      var webinarRoom = formK && formK.querySelector("[data-webinar-room]");
      if (webinarRoom) webinarRoom.hidden = true;
      var classPill = formK && formK.querySelector("[data-tower-cal-classroom]");
      if (classPill) classPill.checked = box.value === "classroom";
    });
    root.addEventListener("change", function (ev) {
      var box = ev.target && ev.target.matches && ev.target.matches("[data-tower-cal-classroom]") ? ev.target : null;
      if (!box || !root.contains(box)) return;
      var formC = box.form;
      if (!formC) return;
      if (box.checked) {
        var webinarBox = formC.querySelector("[data-tower-cal-webinar]");
        if (webinarBox) webinarBox.checked = false;
        var webinarRoom = formC.querySelector("[data-webinar-room]");
        if (webinarRoom) webinarRoom.hidden = true;
        formC.querySelectorAll("[data-tower-cal-kind]").forEach(function (el) {
          el.checked = el.value === "classroom";
        });
        var saleFields = formC.querySelector("[data-tower-cal-auction-fields]");
        if (saleFields) saleFields.hidden = true;
      } else {
        formC.querySelectorAll("[data-tower-cal-kind]").forEach(function (el) {
          if (el.value === "classroom") el.checked = false;
        });
      }
    });
    root.addEventListener("submit", function (ev) {
      var form = ev.target;
      if (!form || !root.contains(form)) return;

      if (form.matches("[data-tower-cal-editor]")) {
        ev.preventDefault();
        var titleEl = form.querySelector("[data-tower-cal-edit-title]");
        var dateEl = form.querySelector("[data-tower-cal-edit-date]");
        var timeEl = form.querySelector("[data-tower-cal-edit-time]");
        var notesEl = form.querySelector("[data-tower-cal-edit-notes]");
        var idEl = form.querySelector("[data-tower-cal-edit-id]");
        var title = titleEl ? titleEl.value.trim().slice(0, 120) : "";
        var date = dateEl ? dateEl.value : "";
        var time = timeEl ? timeEl.value : "";
        var notes = notesEl ? notesEl.value.trim().slice(0, 240) : "";
        var classroomOn = !!(form.querySelector("[data-tower-cal-classroom]") || {}).checked;
        var statusEl = form.querySelector("[data-tower-cal-editor-status]");
        function setEdStatus(msg, isError) {
          if (!statusEl) return;
          if (!msg) {
            statusEl.hidden = true;
            statusEl.textContent = "";
            return;
          }
          statusEl.hidden = false;
          statusEl.textContent = msg;
          statusEl.classList.toggle("is-error", !!isError);
        }
        if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          setEdStatus("Title and a valid date are required.", true);
          return;
        }
        var webinarOn = !!form.querySelector("[data-tower-cal-webinar]:checked");
        var kindBox = form.querySelector("[data-tower-cal-kind]:checked");
        var picked = kindBox ? kindBox.value : "";
        if (classroomOn && picked !== "auction") picked = "classroom";
        if ((classroomOn || picked === "classroom") && !time) time = "12:00";
        var families = (webinarOn ? 1 : 0) + (picked === "auction" ? 1 : 0) + (picked === "classroom" || classroomOn ? 1 : 0);
        if (families > 1) {
          setEdStatus(webinarOn ? "Check Webinar." : "Check Classroom or Auction.", true);
          return;
        }
        if (!families) {
          setEdStatus("Check Classroom or Auction.", true);
          return;
        }
        var sale = {};
        if (picked === "auction") {
          var sellEl = form.querySelector("[data-tower-cal-selling]");
          var startEl = form.querySelector("[data-tower-cal-start]");
          sale.item = sellEl ? sellEl.value.trim().slice(0, 120) : "";
          sale.start = Number(String(startEl ? startEl.value : "").replace(/[$,]/g, ""));
          if (!sale.item || !isFinite(sale.start) || sale.start < 0) {
            setEdStatus("Type what you are selling and the starting bid.", true);
            return;
          }
        }
        var editId = idEl ? idEl.value : "";
        var madeId = editId || newCalendarEventId();
        saveCalendarToProfile(function (p) {
          function applyWebinar(e) {
            e.kind = "webinar";
            delete e.auction;
            e.webinar = webinarLimits(!!form.querySelector("[data-webinar-record]:checked"));
          }
          function applyChosen(e) {
            if (webinarOn) applyWebinar(e);
            else if (picked === "auction") applyEventKind(e, "auction", p, sale);
            else {
              e.kind = "classroom";
              delete e.auction;
              delete e.webinar;
            }
          }
          if (editId) {
            var found = false;
            (p.calendarEvents || []).forEach(function (e) {
              if (e.id === editId) {
                e.title = title;
                e.date = date;
                e.time = time;
                e.notes = notes;
                applyChosen(e);
                found = true;
              }
            });
            if (!found) {
              var revived = { id: editId, title: title, date: date, time: time, notes: notes, status: "accepted", source: "owner" };
              applyChosen(revived);
              p.calendarEvents.push(revived);
            }
          } else {
            var added = { id: madeId, title: title, date: date, time: time, notes: notes, status: "accepted", source: "owner" };
            applyChosen(added);
            p.calendarEvents.push(added);
          }
        });
        if (window.CognationClassroomEvent) {
          if (!webinarOn && picked === "classroom") window.CognationClassroomEvent.publish({ id: madeId, title: title, date: date, time: time, notes: notes });
          else if (editId) window.CognationClassroomEvent.drop(editId);
        }
        var priv3 = root.querySelector("[data-tower-cal-public]");
        if (priv3) priv3.removeAttribute("data-editing-id");
        var view3 = getCalendarViewState(root, "public");
        view3.selected = date;
        var dp = date.split("-");
        view3.year = parseInt(dp[0], 10);
        view3.month0 = parseInt(dp[1], 10) - 1;
        setEdStatus(classroomOn ? "Classroom added to the Cognation calendar. Echo card ready." : (editId ? "Event updated." : "Event added."), false);
        refreshTowerCalendars(root);
        return;
      }

    });

    refreshTowerCalendars(root);
  }


  var FRIEND_SIDE_PREVIEW = 5;

  function friendSideLabel(id) {
    var friend = DEMO_FRIENDS.filter(function (entry) { return entry.id === id; })[0];
    return friend ? friend.name : String(id || "");
  }

  function renderFriendsBrowse(root, query) {
    var list = root.querySelector("[data-tower-friends-browse-list]");
    if (!list) return;
    list.innerHTML = "";
    var p = TowerProfileStore.get();
    var ids = (p && Array.isArray(p.friendIds)) ? p.friendIds : [];
    var q = String(query || "").trim().toLowerCase();
    function addNote(text) {
      var note = document.createElement("li");
      note.className = "tower-friends-browse-note";
      note.textContent = text;
      list.appendChild(note);
    }
    function addName(id) {
      var li = document.createElement("li");
      li.className = "tower-friends-browse-item";
      var handle = personalProfileHandle(id);
      var link = document.createElement("a");
      link.href = "#tower-profile-" + handle;
      link.setAttribute("data-tower-friend-open", handle);
      link.textContent = friendSideLabel(id);
      li.appendChild(link);
      list.appendChild(li);
    }
    if (!q) {
      if (!ids.length) {
        addNote("No friends yet. Search members to connect.");
        return;
      }
      /* A short set only. The rest of a tower, up to 6,000, stays behind search. */
      ids.slice(0, FRIEND_SIDE_PREVIEW).forEach(function (id) {
        addName(id);
      });
      if (ids.length > FRIEND_SIDE_PREVIEW) {
        addNote(ids.length + " friends. Search to find someone.");
      }
      return;
    }
    var matches = [];
    for (var i = 0; i < ids.length && matches.length < 8; i++) {
      var id = ids[i];
      var label = friendSideLabel(id);
      if (label.toLowerCase().indexOf(q) === -1 && String(id).toLowerCase().indexOf(q) === -1) continue;
      matches.push(id);
    }
    if (!matches.length) {
      addNote("No matches");
      return;
    }
    matches.forEach(addName);
  }

  function initFriendsBrowse(root) {
    if (!root || root.__cognationFriendsBrowseBound) return;
    root.__cognationFriendsBrowseBound = true;
    renderFriendsBrowse(root);
    var find = root.querySelector("[data-tower-friends-find]");
    if (find && !find.__cognationFindBound) {
      find.__cognationFindBound = true;
      find.addEventListener("input", function () {
        renderFriendsBrowse(root, find.value);
      });
    }
    document.addEventListener("cognation:people-added", function () {
      renderFriendsBrowse(root, find ? find.value : "");
    });
    var host = root.querySelector("[data-tower-friends], [data-tower-friends-browse]");
    if (!host) return;
    host.addEventListener("click", function (ev) {
      var link = ev.target && ev.target.closest("[data-tower-friend-open]");
      if (!link || !host.contains(link)) return;
      ev.preventDefault();
      var handle = link.getAttribute("data-tower-friend-open");
      if (!handle) return;
      if (window.CognationTowerOpenProfile) {
        window.CognationTowerOpenProfile(handle);
        return;
      }
      try {
        location.hash = "tower-profile-" + handle;
      } catch (e) {}
      applyTowerSide(root, "public");
      renderProfileChrome(root);
      /* Demo friends are not full dual-profile accounts — show public scrapbook side */
      try {
        var tabTower = document.getElementById("tab-tower");
        if (tabTower) tabTower.click();
      } catch (e2) {}
    });
  }

  function syncProfileKindToggle(root) {
    var toggle = root.querySelector("[data-tower-profile-kind-toggle]");
    if (!toggle) return;
    var session = getSessionObject();
    var user = session && session.username ? String(session.username).toLowerCase() : "";
    var profiles = [];
    if (usingRemoteSocial()) {
      var social = remoteSocial();
      profiles = social && social.getMyProfiles ? social.getMyProfiles() : [];
      toggle.hidden = false;
      var currentRemoteKind =
        (TowerProfileStore.get() && TowerProfileStore.get()._profileKind) ||
        (session && session.profileKind) ||
        "personal";
      toggle.querySelectorAll("[data-tower-profile-kind]").forEach(function (btn) {
        var remoteKind = btn.getAttribute("data-tower-profile-kind");
        var hasRemote = profiles.some(function (p) {
          return p.kind === remoteKind;
        });
        btn.setAttribute("aria-selected", remoteKind === currentRemoteKind ? "true" : "false");
        btn.classList.toggle("is-selected", remoteKind === currentRemoteKind);
        btn.hidden = !hasRemote && remoteKind !== "professional";
        btn.disabled = !hasRemote;
        if (!hasRemote && remoteKind === "professional") {
          btn.title = "Add a professional page from Edit profile";
        } else {
          btn.removeAttribute("title");
        }
      });
      return;
    }
    if (user && window.CognationAccounts) {
      profiles = window.CognationAccounts.getProfilesForUsername(user) || [];
    }
    toggle.hidden = false;
    var active = TowerProfileStore.get();
    var kind = (active && active._profileKind) || (session && session.profileKind) || "personal";
    toggle.querySelectorAll("[data-tower-profile-kind]").forEach(function (btn) {
      var k = btn.getAttribute("data-tower-profile-kind");
      var on = k === kind;
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.classList.toggle("is-selected", on);
      var has = profiles.some(function (p) { return p.kind === k; });
      btn.disabled = !has;
      btn.hidden = !has && profiles.length < 2;
    });
    /* Show both tabs if owner might add second — keep professional visible when only personal */
    var proBtn = toggle.querySelector('[data-tower-profile-kind="professional"]');
    var perBtn = toggle.querySelector('[data-tower-profile-kind="personal"]');
    if (proBtn) proBtn.removeAttribute("title");
    if (proBtn && !profiles.some(function (p) { return p.kind === "professional"; })) {
      proBtn.hidden = false;
      proBtn.disabled = true;
      proBtn.title = "Add a professional page from Edit profile";
    }
    if (perBtn && !profiles.some(function (p) { return p.kind === "personal"; })) {
      perBtn.hidden = false;
      perBtn.disabled = true;
    }
  }

  function switchProfileKind(root, kind) {
    kind = kind === "professional" ? "professional" : "personal";
    var session = getSessionObject();
    if (usingRemoteSocial()) {
      var social = remoteSocial();
      var remoteProfiles = social && social.getMyProfiles ? social.getMyProfiles() : [];
      var remoteTarget = remoteProfiles.filter(function (profile) {
        return profile.kind === kind;
      })[0];
      if (!remoteTarget || !social || !social.setActiveProfile) return false;
      social.setActiveProfile(remoteTarget);
      if (remoteTarget.handle) {
        try { location.hash = "tower-profile-" + remoteTarget.handle; } catch (eRemote) {}
      }
      renderProfileChrome(root);
      syncProfileKindToggle(root);
      syncAddProfileUi(root);
      applyTowerSide(root, "public");
      return true;
    }
    if (!session || !session.username || !window.CognationAccounts) return false;
    var profiles = window.CognationAccounts.getProfilesForUsername(session.username) || [];
    var target = profiles.filter(function (p) { return p.kind === kind; })[0];
    if (!target) return false;
    if (window.CognationAuth && typeof window.CognationAuth.setActiveProfile === "function") {
      window.CognationAuth.setActiveProfile(target.id);
    } else {
      session.activeProfileId = target.id;
      session.profileKind = kind;
      try {
        localStorage.setItem("cognation.session.v2", JSON.stringify(session));
      } catch (e) {}
    }
    var handle = normalizeHandle(target.handle || "");
    if (handle) {
      try { location.hash = "tower-profile-" + handle; } catch (e2) {}
    }
    renderProfileChrome(root);
    syncProfileKindToggle(root);
    syncAddProfileUi(root);
    applyTowerSide(root, "public");
    return true;
  }

  function initProfileKindToggle(root) {
    if (!root || root.__cognationKindBound) return;
    root.__cognationKindBound = true;
    var toggle = root.querySelector("[data-tower-profile-kind-toggle]");
    if (!toggle) return;
    toggle.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest("[data-tower-profile-kind]");
      if (!btn || btn.disabled || !toggle.contains(btn)) return;
      switchProfileKind(root, btn.getAttribute("data-tower-profile-kind"));
    });
    document.addEventListener("cognation:active-profile-changed", function () {
      renderProfileChrome(root);
      syncProfileKindToggle(root);
      syncAddProfileUi(root);
    });
    document.addEventListener("cognation:session-started", function () {
      syncProfileKindToggle(root);
      syncAddProfileUi(root);
    });
    /* My profiles arrive after boot: re-check so "Add a professional page" hides
       as soon as the Pro page is known. */
    document.addEventListener("cognation:remote-profile-loaded", function () {
      syncProfileKindToggle(root);
      syncAddProfileUi(root);
    });
    syncProfileKindToggle(root);
  }

  function syncAddProfileUi(root) {
    var btn = root.querySelector("[data-tower-add-profile]");
    var phoneIn = root.querySelector("[data-tower-account-phone-input]");
    var status = root.querySelector("[data-tower-add-profile-status]");
    var session = getSessionObject();
    var user = session && session.username ? String(session.username).toLowerCase() : "";
    if (!btn) return;
    if (status) {
      status.hidden = true;
      status.textContent = "";
      status.classList.remove("is-error");
    }
    if (usingRemoteSocial()) {
      var social = remoteSocial();
      var remoteProfiles = social && social.getMyProfiles ? social.getMyProfiles() : [];
      var hasRemoteProfessional = remoteProfiles.some(function (p) {
        return p.kind === "professional";
      });
      btn.hidden = hasRemoteProfessional;
      if (status) {
        /* Shows once, only right after this tab created the Pro page, and only
           while that Pro page is being edited. A popup, not a box in the page. */
        var currentKindForNotice =
          (TowerProfileStore.get() && TowerProfileStore.get()._profileKind) ||
          (session && session.profileKind) ||
          "personal";
        var showSetupNotice =
          hasRemoteProfessional &&
          root.__cognationProSetupJustCreated === true &&
          currentKindForNotice === "professional";
        status.hidden = true;
        status.textContent = "";
        status.classList.remove("is-error", "tower-pro-setup-notice");
        if (showSetupNotice) showStatusPopup("Your professional page is set up.", false, { once: true });
      }
      return;
    }
    if (!user || !window.CognationAccounts) {
      btn.hidden = true;
      return;
    }
    var acct = window.CognationAccounts.getAccountByUsername(user);
    if (phoneIn && acct && document.activeElement !== phoneIn) {
      phoneIn.value = acct.phone || "";
    }
    var profiles = window.CognationAccounts.getProfilesForUsername(user) || [];
    var hasPersonal = profiles.some(function (p) { return p.kind === "personal"; });
    var hasPro = profiles.some(function (p) { return p.kind === "professional"; });
    if (profiles.length >= 2 || (hasPersonal && hasPro)) {
      btn.hidden = true;
      showStatusPopup("Both Personal and Professional pages are set up for this account.", false, { once: true });
      return;
    }
    btn.hidden = false;
    if (!hasPro) {
      btn.textContent = "Add a professional page";
      btn.setAttribute("data-add-kind", "professional");
    } else {
      btn.textContent = "Add personal page";
      btn.setAttribute("data-add-kind", "personal");
    }
  }

  function initAddProfile(root) {
    if (!root || root.__cognationAddProfileBound) return;
    root.__cognationAddProfileBound = true;
    var btn = root.querySelector("[data-tower-add-profile]");
    function setSt(msg, isError) {
      showStatusPopup(msg, isError);
    }
    if (!btn) return;
    btn.addEventListener("click", function () {
      var session = getSessionObject();
      if (usingRemoteSocial()) {
        var social = remoteSocial();
        if (!social || !social.createProfessionalProfile) {
          setSt("Sign in to add a page.", true);
          return;
        }
        var remoteNameIn = root.querySelector("#tower-display-name");
        var remoteHandleIn = root.querySelector("[data-tower-handle]");
        btn.disabled = true;
        setSt("Creating your professional page…", false);
        social
          .createProfessionalProfile({
            displayName: remoteNameIn && remoteNameIn.value
              ? remoteNameIn.value
              : "Professional page",
            handle: remoteHandleIn && remoteHandleIn.value
              ? remoteHandleIn.value + "-pro"
              : "professional-page",
          })
          .then(function (profile) {
            /* One-time "set up" notice for this moment only (see syncAddProfileUi). */
            root.__cognationProSetupJustCreated = true;
            setSt("Professional page created.", false);
            if (profile && profile.handle) {
              location.hash = "tower-profile-" + profile.handle;
            }
            syncAddProfileUi(root);
            syncProfileKindToggle(root);
            renderProfileChrome(root);
            applyTowerSide(root, "public");
          })
          .catch(function (error) {
            /* Raw error text goes to the console only; the box shows a fixed line. */
            try { console.error("[tower] add professional page failed", error); } catch (eLog) {}
            setSt(friendlyAddProfileError(error), true);
          })
          .finally(function () {
            btn.disabled = false;
          });
        return;
      }
      if (!session || !session.username || !window.CognationAccounts) {
        setSt("Sign in to add a page.", true);
        return;
      }
      var phoneIn = root.querySelector("[data-tower-account-phone-input]");
      var phone = phoneIn ? phoneIn.value.trim() : "";
      var acct = window.CognationAccounts.getAccountByUsername(session.username);
      if (!phone && acct) phone = acct.phone || "";
      if (!phone || window.CognationAccounts.phoneKey(phone).length < 10) {
        setSt("Enter a valid phone number to claim a second profile (demo registry).", true);
        if (phoneIn) phoneIn.focus();
        return;
      }
      var gate = window.CognationAccounts.canAddProfileForPhone(phone);
      if (!gate.ok) {
        try { console.warn("[tower] add page blocked", gate.reason); } catch (eLog) {}
        setSt("This phone number already has a Personal and a Professional page.", true);
        return;
      }
      var kind = btn.getAttribute("data-add-kind") || "professional";
      var handleBase = String(session.username || "user").toLowerCase();
      var result = window.CognationAccounts.createProfile({
        username: session.username,
        phone: phone,
        kind: kind,
        handle: kind === "professional" ? handleBase + "-pro" : handleBase,
        displayName: kind === "professional" ? "Cognation" : "Alexa",
      });
      if (!result.ok) {
        try { console.warn("[tower] add page failed", result.error); } catch (eLog) {}
        setSt(/taken/i.test(String(result.error || "")) ? "That page handle is already taken." : "Couldn't create the page. Try again.", true);
        return;
      }
      setSt((kind === "professional" ? "Professional" : "Personal") + " page created.", false);
      if (window.CognationAuth && window.CognationAuth.setActiveProfile) {
        window.CognationAuth.setActiveProfile(result.profile.id);
      }
      syncAddProfileUi(root);
      syncProfileKindToggle(root);
      renderProfileChrome(root);
      applyTowerSide(root, "public");
    });
    syncAddProfileUi(root);
  }

    function clearWidgetSelection(stage) {
    if (!stage) return;
    stage.querySelectorAll(".is-widget-selected").forEach(function (el) {
      el.classList.remove("is-widget-selected");
    });
  }

  function ensureStickersOnStage(stage) {
    if (!stage || stage.__cognationStickersReparented) return;
    /* Lift every public sticker to be a direct child of the scrapbook canvas.
       Feed lives on the private side — never promote it onto the public stage. */
    var widgets = Array.prototype.slice.call(stage.querySelectorAll("[data-tower-widget]"));
    widgets.forEach(function (el) {
      var id = el.getAttribute("data-tower-widget");
      /* Calendar stays inside Edit profile, not loose on the page. */
      if (id === "feed" || id === "messages" || id === "calendar" || id === "identity" || id === "envelope") return;
      if (el.parentNode === stage) return;
      stage.appendChild(el);
    });
    stage.__cognationStickersReparented = true;
  }

  function normalizePolaroidScale(v) {
    return normalizeAvatarFrameScale(v);
  }

  function polaroidPrintEntry(item) {
    if (typeof item === "string" && item.indexOf("data:image/") === 0) {
      return { url: item, scale: 1 };
    }
    if (item && typeof item === "object" && typeof item.url === "string" && item.url.indexOf("data:image/") === 0) {
      return { url: item.url, scale: normalizePolaroidScale(item.scale) };
    }
    return null;
  }

  function polaroidHasUrl(list, url) {
    for (var i = 0; i < (list || []).length; i++) {
      var e = polaroidPrintEntry(list[i]);
      if (e && e.url === url) return true;
    }
    return false;
  }

  function polaroidPrintList(p) {
    var list = [];
    if (p && Array.isArray(p.polaroidPrints)) {
      p.polaroidPrints.forEach(function (item) {
        var e = polaroidPrintEntry(item);
        if (e) list.push(e);
      });
    }
    if (!list.length && p && typeof p.polaroidDataUrl === "string" && p.polaroidDataUrl.indexOf("data:image/") === 0) {
      list.push({ url: p.polaroidDataUrl, scale: 1 });
    }
    return list;
  }

  function applyPolaroidPrintScale(sticker, scale) {
    scale = normalizePolaroidScale(scale);
    if (sticker) {
      sticker.style.setProperty("--tower-polaroid-scale", String(scale));
      sticker.setAttribute("data-polaroid-scale", String(scale));
    }
    return scale;
  }

  function polaroidMarkup() {
    return (
      '<button type="button" class="tower-sticker-handle" data-tower-sticker-handle aria-label="Move Polaroid sticker" tabindex="-1" hidden>⋮⋮</button>' +
      '<div class="tower-avatar-wrap" data-tower-avatar-frame="polaroid" data-tower-polaroid>' +
      '<div class="tower-avatar" data-tower-polaroid-photo aria-hidden="true"></div>' +
      '<button type="button" class="tower-polaroid-resize" data-tower-polaroid-resize aria-label="Drag to resize Polaroid" title="Drag to resize Polaroid"></button>' +
      "</div>"
    );
  }

  function instaxMarkup() {
    return (
      '<button type="button" class="tower-sticker-handle" data-tower-sticker-handle aria-label="Move Camera sticker" tabindex="-1" hidden>⋮⋮</button>' +
      '<div class="tower-instax" title="Upload a photo">' +
      '<span class="visually-hidden">Upload a photo</span>' +
      '<span class="tower-instax-body" aria-hidden="true">' +
      '<span class="tower-instax-flash"></span>' +
      '<span class="tower-instax-viewfinder"></span>' +
      '<span class="tower-instax-lens"><span class="tower-instax-lens-glass"></span></span>' +
      '<span class="tower-instax-shutter"></span>' +
      '<span class="tower-instax-rainbow"></span>' +
      "</span></div>"
    );
  }

  function paintPolaroidPhoto(photo, url) {
    if (!photo) return;
    photo.textContent = "";
    if (url) {
      var safe = String(url).replace(/"/g, "");
      photo.style.setProperty("background-image", 'url("' + safe + '")', "important");
      photo.style.setProperty("background-size", "cover", "important");
      photo.style.setProperty("background-position", "center", "important");
      photo.style.setProperty("background-repeat", "no-repeat", "important");
      var img = document.createElement("img");
      img.alt = "";
      img.setAttribute("data-tower-polaroid-img", "");
      img.src = safe;
      photo.appendChild(img);
    } else {
      photo.style.removeProperty("background-image");
      photo.style.removeProperty("background-size");
      photo.style.removeProperty("background-position");
      photo.style.removeProperty("background-repeat");
    }
  }

  /* One upright Polaroid on every personal profile. Professional pages stay without it.
     Camera / add-Polaroid is owner-only — viewers never see or use the Instax sticker. */
  function ensurePersonalPolaroid(root, p) {
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (!stage) return;
    var nodes = Array.prototype.slice.call(stage.querySelectorAll('[data-tower-widget="polaroid"]'));
    var personal = !p || p._profileKind !== "professional";
    var owner = isTowerOwner(p);
    var cam = stage.querySelector('[data-tower-widget="instax"]');
    var prints = polaroidPrintList(p);
    function hideCam() {
      if (!cam) return;
      cam.hidden = true;
      cam.classList.add("is-widget-off");
    }
    function showCam() {
      if (!owner || instaxRemoved(p)) {
        hideCam();
        return;
      }
      if (!cam) {
        cam = document.createElement("div");
        cam.className = "tower-sticker tower-sticker--instax";
        cam.setAttribute("data-tower-widget", "instax");
        cam.setAttribute("data-sticker-label", "Camera");
        cam.innerHTML = instaxMarkup();
        stage.appendChild(cam);
      }
      cam.hidden = false;
      cam.classList.remove("is-widget-off");
    }
    if (!personal || (p && p.polaroidRemoved)) {
      nodes.forEach(function (el) {
        el.hidden = true;
        el.classList.add("is-widget-off");
      });
      stage.querySelectorAll("[data-tower-polaroid-extra]").forEach(function (el) {
        el.hidden = true;
        el.classList.add("is-widget-off");
      });
      /* Owner may still see the camera after removing prints so they can re-add. */
      if (owner && personal && p && p.polaroidRemoved) showCam();
      else hideCam();
      return;
    }
    while (nodes.length > 1) {
      var dup = nodes.pop();
      if (dup && dup.parentNode) dup.parentNode.removeChild(dup);
    }
    var el = nodes[0];
    if (!el) {
      el = document.createElement("div");
      el.className = "tower-sticker tower-sticker--polaroid";
      el.setAttribute("data-tower-widget", "polaroid");
      el.setAttribute("data-sticker-label", "Polaroid");
      el.innerHTML = polaroidMarkup();
      stage.appendChild(el);
    }
    var showShell = !!owner;
    el.hidden = !showShell;
    el.classList.toggle("is-widget-off", !showShell);
    el.removeAttribute("title");
    paintPolaroidPhoto(el.querySelector("[data-tower-polaroid-photo]"), "");
    applyPolaroidPrintScale(el, 1);
    showCam();
    var needed = prints.length;
    var extras = Array.prototype.slice.call(stage.querySelectorAll("[data-tower-polaroid-extra]"));
    while (extras.length > needed) {
      var gone = extras.pop();
      if (gone && gone.parentNode) gone.parentNode.removeChild(gone);
    }
    for (var i = 0; i < needed; i++) {
      var extraId = "polaroid-extra-" + i;
      var printEl = stage.querySelector('[data-tower-widget="' + extraId + '"]');
      if (!printEl) {
        printEl = document.createElement("div");
        printEl.className = "tower-sticker tower-sticker--polaroid";
        printEl.setAttribute("data-tower-widget", extraId);
        printEl.setAttribute("data-tower-polaroid-extra", String(i));
        printEl.setAttribute("data-sticker-label", "Polaroid");
        printEl.innerHTML = polaroidMarkup();
        stage.appendChild(printEl);
      }
      printEl.hidden = false;
      printEl.classList.remove("is-widget-off");
      paintPolaroidPhoto(printEl.querySelector("[data-tower-polaroid-photo]"), prints[i].url);
      applyPolaroidPrintScale(printEl, prints[i].scale);
    }
  }

  var EMOJI_WIDGETS = [
    { id: "emoji-cowboy", glyph: "🤠", label: "Cowboy hat face" },
    { id: "emoji-fire", glyph: "🔥", label: "Fire" },
    { id: "emoji-heart-hands", glyph: "🫶", label: "Heart hands" },
    { id: "emoji-pink-heart", glyph: "🩷", label: "Pink heart" },
    { id: "emoji-sparkles", glyph: "✨", label: "Sparkles" },
  ];

  function emojiById(id) {
    for (var i = 0; i < EMOJI_WIDGETS.length; i++) {
      if (EMOJI_WIDGETS[i].id === id) return EMOJI_WIDGETS[i];
    }
    return null;
  }

  function normalizeEmojiSize(value) {
    var n = parseFloat(value);
    if (isNaN(n)) n = 64;
    return Math.max(36, Math.min(168, Math.round(n)));
  }

  function normalizeEmojiStickers(list) {
    var out = [];
    var seen = {};
    (Array.isArray(list) ? list : []).forEach(function (item) {
      if (!item) return;
      var spec = emojiById(item.id);
      if (!spec || seen[spec.id]) return;
      seen[spec.id] = true;
      out.push({ id: spec.id, glyph: spec.glyph, size: normalizeEmojiSize(item.size) });
    });
    return out;
  }

  function defaultEmojiPos(index) {
    return {
      x: 78,
      y: 12 + index * 8,
      z: 24 + index,
      tilt: 0,
    };
  }

  function renderEmojiStickers(root, p) {
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (!stage) return;
    var placed = normalizeEmojiStickers(p && p.emojiStickers);
    var ids = {};
    placed.forEach(function (item) { ids[item.id] = item; });
    stage.querySelectorAll("[data-tower-emoji]").forEach(function (el) {
      var id = el.getAttribute("data-tower-widget");
      if (!ids[id] && !el.classList.contains("is-dragging")) el.remove();
    });
    var layout = (p && p.widgetLayout) || {};
    placed.forEach(function (item, index) {
      var el = stage.querySelector('[data-tower-widget="' + item.id + '"]');
      if (!el) {
        el = document.createElement("div");
        el.className = "tower-sticker tower-sticker--emoji";
        el.setAttribute("data-tower-widget", item.id);
        el.setAttribute("data-tower-emoji", item.id);
        el.setAttribute("data-sticker-label", item.label);
        var glyph = document.createElement("span");
        glyph.className = "tower-emoji-glyph";
        glyph.setAttribute("aria-hidden", "true");
        var handle = document.createElement("button");
        handle.type = "button";
        handle.className = "tower-emoji-resize";
        handle.setAttribute("data-tower-emoji-resize", "");
        handle.setAttribute("aria-label", "Drag to resize " + item.label);
        el.appendChild(glyph);
        el.appendChild(handle);
        stage.appendChild(el);
      }
      var glyphEl = el.querySelector(".tower-emoji-glyph");
      if (glyphEl) glyphEl.textContent = item.glyph;
      el.setAttribute("aria-label", item.label);
      el.style.setProperty("--emoji-size", item.size + "px");
      el.setAttribute("data-emoji-size", String(item.size));
      if (el.classList.contains("is-dragging")) return;
      var pos = layout[item.id] || defaultEmojiPos(index);
      var x = layoutCoord(pos.x, defaultEmojiPos(index).x);
      var y = layoutCoord(pos.y, defaultEmojiPos(index).y);
      var z = layoutCoord(pos.z, defaultEmojiPos(index).z);
      var tilt = layoutCoord(pos.tilt, 0);
      el.style.setProperty("--sticker-x", x + "%");
      el.style.setProperty("--sticker-y", y + "%");
      el.style.setProperty("--sticker-z", String(z));
      el.style.setProperty("--sticker-tilt", tilt + "deg");
      el.setAttribute("data-sticker-x", String(x));
      el.setAttribute("data-sticker-y", String(y));
      el.setAttribute("data-sticker-z", String(z));
      el.hidden = false;
      el.classList.remove("is-widget-off");
    });
  }

  function placeEmojiWidget(root, id) {
    var spec = emojiById(id);
    if (!spec || !isTowerOwner(TowerProfileStore.get())) return;
    var p = TowerProfileStore.get();
    var list = normalizeEmojiStickers(p.emojiStickers);
    var found = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === spec.id) found = true;
    }
    if (!found) {
      list.push({ id: spec.id, glyph: spec.glyph, size: 64 });
      if (!p.widgetLayout || typeof p.widgetLayout !== "object") {
        p.widgetLayout = {};
      }
      p.widgetLayout[spec.id] = defaultEmojiPos(list.length - 1);
      p.emojiStickers = list;
      TowerProfileStore.save(p);
    }
    var saved = TowerProfileStore.get();
    renderEmojiStickers(root, saved);
    var stage = root.querySelector("[data-tower-scrapbook]");
    var el = stage && stage.querySelector('[data-tower-widget="' + spec.id + '"]');
    if (!stage || !el) return;
    stage.querySelectorAll(".is-widget-selected").forEach(function (node) {
      node.classList.remove("is-widget-selected");
    });
    el.classList.add("is-widget-selected");
    syncRotateToolbar(root);
  }

  function initEmojiWidgets(root) {
    if (!root || root.__cognationEmojiWidgetsBound) return;
    root.__cognationEmojiWidgetsBound = true;
    var bar = root.querySelector("[data-tower-emoji-bar]");
    if (bar) {
      EMOJI_WIDGETS.forEach(function (item) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tower-emoji-add";
        btn.setAttribute("data-tower-emoji-add", item.id);
        btn.setAttribute("aria-label", "Add " + item.label);
        btn.title = item.label;
        btn.textContent = item.glyph;
        bar.appendChild(btn);
      });
      bar.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-tower-emoji-add]");
        if (!btn || !bar.contains(btn)) return;
        ev.preventDefault();
        placeEmojiWidget(root, btn.getAttribute("data-tower-emoji-add"));
      });
    }
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (!stage) return;
    stage.addEventListener("pointerdown", function (ev) {
      var handle = ev.target.closest("[data-tower-emoji-resize]");
      if (!handle || !stage.contains(handle)) return;
      if (!isTowerOwner(TowerProfileStore.get())) return;
      var sticker = handle.closest("[data-tower-emoji]");
      if (!sticker) return;
      ev.preventDefault();
      ev.stopPropagation();
      var startX = ev.clientX;
      var startY = ev.clientY;
      var startSize = normalizeEmojiSize(sticker.getAttribute("data-emoji-size") || 64);
      function onMove(e) {
        var next = normalizeEmojiSize(startSize + (e.clientX - startX) + (e.clientY - startY));
        sticker.style.setProperty("--emoji-size", next + "px");
        sticker.setAttribute("data-emoji-size", String(next));
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        var size = normalizeEmojiSize(sticker.getAttribute("data-emoji-size") || startSize);
        var wid = sticker.getAttribute("data-tower-widget");
        var cur = TowerProfileStore.get();
        cur.emojiStickers = normalizeEmojiStickers(cur.emojiStickers).map(function (item) {
          if (item.id !== wid) return item;
          return { id: item.id, glyph: item.glyph, size: size };
        });
        TowerProfileStore.save(cur, { geometry: true });
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }

  function initPolaroidResize(root) {
    if (!root || root.__cognationPolaroidResizeBound) return;
    root.__cognationPolaroidResizeBound = true;
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (!stage) return;
    stage.addEventListener("pointerdown", function (ev) {
      var handle = ev.target.closest("[data-tower-polaroid-resize]");
      if (!handle || !stage.contains(handle)) return;
      if (!isTowerOwner(TowerProfileStore.get())) return;
      var sticker = handle.closest(".tower-sticker--polaroid");
      if (!sticker) return;
      ev.preventDefault();
      ev.stopPropagation();
      var startX = ev.clientX;
      var startY = ev.clientY;
      var startScale = normalizePolaroidScale(sticker.getAttribute("data-polaroid-scale") || 1);
      function onMove(e) {
        var delta = ((e.clientX - startX) + (e.clientY - startY)) / 180;
        applyPolaroidPrintScale(sticker, startScale + delta);
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        var next = normalizePolaroidScale(sticker.getAttribute("data-polaroid-scale") || startScale);
        var wid = sticker.getAttribute("data-tower-widget");
        var extra = sticker.getAttribute("data-tower-polaroid-extra");
        if (wid === "polaroid" || extra == null || extra === "") return;
        var idx = parseInt(extra, 10);
        var cur = TowerProfileStore.get();
        var prints = polaroidPrintList(cur);
        if (!prints[idx]) return;
        prints[idx] = { url: prints[idx].url, scale: next };
        cur.polaroidPrints = prints;
        if (idx === 0) cur.polaroidDataUrl = prints[0].url;
        TowerProfileStore.save(cur, { geometry: true });
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }

  function applyWidgetLayout(root, p) {
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (!stage) return;
    stage.classList.add("is-sticker-stage");
    ensureStickersOnStage(stage);
    ensurePersonalPolaroid(root, p);
    /* Stand-in camera and MP3 stickers are not the original widgets. Drop them if a previous session left one. */
    var stageCam = root.querySelector("[data-tower-scrapbook]");
    if (stageCam) {
      stageCam.querySelectorAll('[data-tower-widget="camera"], [data-tower-widget="mp3"]').forEach(function (el) {
        el.remove();
      });
    }
    if (p) mergeScrapbookLayout(p);
    if (p) settleArrivalTilts(p);
    renderEmojiStickers(root, p);
    var layout = getWidgetLayout(p) || DEFAULT_WIDGET_LAYOUT;
    var zBase = 2;
    Object.keys(DEFAULT_WIDGET_LAYOUT).forEach(function (id) {
      if (id === "feed" || id === "messages") return;
      var el = stage.querySelector('[data-tower-widget="' + id + '"]');
      if (!el || el.classList.contains("is-dragging")) return;
      /* MP3 is Personal only (Alexa, Oct 7): an old saved Pro layout's music spot is ignored. */
      if (id === "music" && isProTower(p)) {
        el.hidden = true;
        el.classList.add("is-widget-off");
        return;
      }
      var pos = layout[id] || DEFAULT_WIDGET_LAYOUT[id];
      /* YouTube split from Music: a Professional page that already placed Music keeps that spot. */
      if (id === "youtube" && !layout.youtube && isPlacedPos(layout, "music")) pos = layout.music;
      var fallback = DEFAULT_WIDGET_LAYOUT[id] || { x: 8, y: 8, z: zBase, tilt: 0 };
      var x = layoutCoord(pos && pos.x, fallback.x);
      var yAt = stickerYFromLayout(pos && typeof pos === "object" ? pos : { y: fallback.y }, stage.clientHeight || 0);
      var y = yAt.pct;
      var z = layoutCoord(pos && pos.z, fallback.z || zBase);
      var tilt = layoutCoord(pos && pos.tilt, 0);
      el.style.setProperty("--sticker-x", x + "%");
      el.style.setProperty("--sticker-y", yAt.css);
      el.style.setProperty("--sticker-z", String(z));
      el.style.setProperty("--sticker-tilt", tilt + "deg");
      el.setAttribute("data-sticker-x", String(x));
      el.setAttribute("data-sticker-y", String(y));
      el.setAttribute("data-sticker-z", String(z));
      setStickerWidth(el, pos && typeof pos === "object" && isPlacedPos(layout, id) ? pos.wPx : 0);
    });
    stage.querySelectorAll("[data-tower-polaroid-extra]").forEach(function (extraEl) {
      if (extraEl.classList.contains("is-dragging")) return;
      var extraId = extraEl.getAttribute("data-tower-widget");
      var idx = parseInt(extraEl.getAttribute("data-tower-polaroid-extra") || "0", 10);
      if (isNaN(idx)) idx = 0;
      var savedPos = extraId && layout[extraId];
      var pos = savedPos || { x: 48 + idx * 7, y: 22 + idx * 8, z: 8 + idx, tilt: 0 };
      var ex = layoutCoord(pos.x, 48);
      var ey = layoutCoord(pos.y, 22);
      var ez = layoutCoord(pos.z, 8);
      var et = layoutCoord(pos.tilt, 0);
      extraEl.style.setProperty("--sticker-x", ex + "%");
      extraEl.style.setProperty("--sticker-y", ey + "%");
      extraEl.style.setProperty("--sticker-z", String(ez));
      extraEl.style.setProperty("--sticker-tilt", et + "deg");
      extraEl.setAttribute("data-sticker-x", String(ex));
      extraEl.setAttribute("data-sticker-y", String(ey));
      extraEl.setAttribute("data-sticker-z", String(ez));
    });
    spawnUnplacedWidgets(root, p);
  }

  function collageCellCount(layoutId) {
    var meta = COLLAGE_LAYOUTS[layoutId] || COLLAGE_LAYOUTS.none;
    return meta.cells || 0;
  }

  function demoCollageCells(n) {
    var cells = [];
    for (var i = 0; i < n; i++) {
      cells.push({ color: DEMO_COLLAGE_COLORS[i % DEMO_COLLAGE_COLORS.length], url: "" });
    }
    return cells;
  }

  function renderCollageStage(root, p) {
    var stage = root.querySelector("[data-tower-collage-stage]");
    if (!stage) return;
    var bg = (p && p.backgroundCollage) || { layoutId: "none", cells: [] };
    var layoutId = bg.layoutId && COLLAGE_LAYOUTS[bg.layoutId] ? bg.layoutId : "none";
    var n = collageCellCount(layoutId);
    stage.setAttribute("data-layout", layoutId);
    stage.innerHTML = "";
    stage.hidden = !n;
    if (!n) return;
    var grid = document.createElement("div");
    grid.className = "tower-collage-grid";
    var cells = Array.isArray(bg.cells) ? bg.cells : [];
    for (var i = 0; i < n; i++) {
      var cell = cells[i] || { color: DEMO_COLLAGE_COLORS[i % DEMO_COLLAGE_COLORS.length], url: "" };
      var tile = document.createElement("div");
      tile.className = "tower-collage-tile";
      var color = cell.color || DEMO_COLLAGE_COLORS[i % DEMO_COLLAGE_COLORS.length];
      tile.style.setProperty("--tile-color", color);
      var url = cell.url ? String(cell.url).replace(/"/g, "") : "";
      if (layoutId === "polaroid-scatter") {
        var photo = document.createElement("div");
        photo.className = "tower-collage-tile-photo";
        if (url) photo.style.backgroundImage = 'url("' + url + '")';
        else photo.style.backgroundColor = color;
        tile.appendChild(photo);
      } else {
        if (url) tile.style.backgroundImage = 'url("' + url + '")';
        else tile.style.backgroundColor = color;
      }
      grid.appendChild(tile);
    }
    stage.appendChild(grid);
  }

  function syncCollageForm(root, p) {
    var bg = (p && p.backgroundCollage) || { layoutId: "none", cells: [] };
    var layoutSel = root.querySelector("[data-tower-collage-layout]");
    var cellsHost = root.querySelector("[data-tower-collage-cells]");
    if (layoutSel && document.activeElement !== layoutSel) {
      layoutSel.value = bg.layoutId || "none";
    }
    if (!cellsHost) return;
    var layoutId = layoutSel ? layoutSel.value : bg.layoutId || "none";
    var n = collageCellCount(layoutId);
    cellsHost.innerHTML = "";
    var cells = Array.isArray(bg.cells) ? bg.cells : [];
    for (var i = 0; i < n; i++) {
      var cell = cells[i] || {};
      var wrap = document.createElement("div");
      wrap.className = "tower-collage-cell-field";
      var lab = document.createElement("label");
      lab.setAttribute("for", "tower-collage-cell-" + i);
      lab.textContent = "Cell " + (i + 1) + " image URL";
      var input = document.createElement("input");
      input.id = "tower-collage-cell-" + i;
      input.type = "url";
      input.inputMode = "url";
      input.maxLength = 500;
      input.placeholder = "https://… or leave blank for pink tile";
      input.value = cell.url || "";
      input.setAttribute("data-tower-collage-cell", String(i));
      wrap.appendChild(lab);
      wrap.appendChild(input);
      cellsHost.appendChild(wrap);
    }
  }

  function readCollageFromForm(root) {
    var layoutSel = root.querySelector("[data-tower-collage-layout]");
    var layoutId = layoutSel && layoutSel.value ? layoutSel.value : "none";
    if (!COLLAGE_LAYOUTS[layoutId]) layoutId = "none";
    var n = collageCellCount(layoutId);
    var cells = [];
    for (var i = 0; i < n; i++) {
      var input = root.querySelector('[data-tower-collage-cell="' + i + '"]');
      var url = input ? String(input.value || "").trim().slice(0, 500) : "";
      if (url && !/^https?:\/\//i.test(url) && url.indexOf("data:image/") !== 0) url = "";
      cells.push({
        url: url,
        color: DEMO_COLLAGE_COLORS[i % DEMO_COLLAGE_COLORS.length],
      });
    }
    return { layoutId: layoutId, cells: cells };
  }

  var stickerZCounter = 20;


  function getQuoteStickers(p) {
    if (!p.quoteStickers || !Array.isArray(p.quoteStickers)) p.quoteStickers = [];
    return p.quoteStickers;
  }

  /* Quote text is public (any visitor, any age), so it must pass the same
     word check Tower posts are rated with (js/auto-rate.js, the browser copy of
     the database rater) at the level everyone can see (G or PG), and the
     shared under-13 keyword floor (js/age-floor-keywords.js). Fails closed when
     either helper is missing. */
  var QUOTE_BLOCKED_MESSAGE = "This quote wasn't saved. It didn't pass the word check Tower uses for posts, and quotes show to everyone. Try different words.";
  function quoteTextAllowed(text) {
    var t = String(text || "");
    var ar = window.CognationAutoRate;
    var floor = window.CognationAgeFloor;
    if (!ar || typeof ar.rate !== "function") return false;
    if (!floor || typeof floor.isAdultKeyword !== "function") return false;
    var r = ar.rate(t, []);
    if (!r || (r.rating !== "G" && r.rating !== "PG")) return false;
    return !floor.isAdultKeyword(t);
  }
  window.CognationTowerQuoteAllowed = quoteTextAllowed;

  function uidQuote() {
    return "quote-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e4).toString(36);
  }

  function removeQuoteSticker(root, quoteId) {
    if (!quoteId) return;
    var p = TowerProfileStore.get();
    p.quoteStickers = getQuoteStickers(p).filter(function (q) {
      return q.id !== quoteId;
    });
    TowerProfileStore.save(p);
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (!stage) return;
    var el = stage.querySelector('[data-tower-quote-id="' + quoteId + '"]');
    if (el) el.remove();
  }

  function addQuoteSticker(root, text, layout, existingId) {
    text = String(text || "").trim().slice(0, 400);
    if (!text) return null;
    /* Blocked: nothing is written (no server row, no localStorage cache). */
    if (!quoteTextAllowed(text)) return { blocked: true };
    var p = TowerProfileStore.get();
    var quotes = getQuoteStickers(p);
    var id = existingId || uidQuote();
    var entry = {
      id: id,
      text: text,
      x: layout && typeof layout.x === "number" ? layout.x : 4,
      y: layout && typeof layout.y === "number" ? layout.y : 2,
      z: layout && typeof layout.z === "number" ? layout.z : 10,
      tilt: layout && typeof layout.tilt === "number" ? layout.tilt : 0,
    };
    if (layout && typeof layout.yPx === "number" && isFinite(layout.yPx)) entry.yPx = layout.yPx;
    var found = false;
    quotes = quotes.map(function (q) {
      if (q.id === id) {
        found = true;
        return entry;
      }
      return q;
    });
    if (!found) quotes.push(entry);
    p.quoteStickers = quotes;
    TowerProfileStore.save(p);
    renderQuoteStickers(root, p);
    /* A new quote used to land on a random percent of the tall canvas and sat
       on the profile card. Seat it in a clear spot and bring that spot on screen. */
    if (!layout && typeof keepQuoteClear === "function" && root && typeof root.querySelector === "function") {
      var stage = root.querySelector("[data-tower-scrapbook]");
      var el = stage && stage.querySelector('[data-tower-quote-id="' + id + '"]');
      if (stage && el && (typeof isPhoneStage !== "function" || !isPhoneStage(stage))) {
        el.style.setProperty("--sticker-x", "4%");
        el.style.setProperty("--sticker-y", "8px");
        el.setAttribute("data-sticker-x", "4");
        el.setAttribute("data-sticker-y", "1");
        if (keepQuoteClear(stage, el)) {
          entry.x = parseFloat(el.getAttribute("data-sticker-x")) || entry.x;
          entry.y = parseFloat(el.getAttribute("data-sticker-y")) || entry.y;
          var qPx = parseFloat(el.getAttribute("data-sticker-y-px") || "");
          if (isFinite(qPx)) entry.yPx = qPx;
        } else {
          entry.x = 4;
          entry.y = 1;
          entry.yPx = 8;
        }
        p.quoteStickers = getQuoteStickers(p).map(function (q) {
          return q && q.id === id ? entry : q;
        });
        TowerProfileStore.save(p);
        el.__cognationQuoteSpot = {
          x: entry.x,
          yCss: typeof entry.yPx === "number" ? entry.yPx + "px" : entry.y + "%",
          yPct: entry.y,
        };
        el.style.setProperty("--sticker-x", entry.x + "%");
        el.style.setProperty("--sticker-y", el.__cognationQuoteSpot.yCss);
        if (el.scrollIntoView) {
          try { el.scrollIntoView({ block: "center", inline: "nearest" }); } catch (eSee) {}
        }
      }
    }
    return entry;
  }

  function renderQuoteStickers(root, p) {
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (!stage) return;
    if (p) settleArrivalTilts(p);
    stage.querySelectorAll("[data-tower-quote-id]").forEach(function (el) {
      el.remove();
    });
    var quotes = getQuoteStickers(p);
    var ownerView = isTowerOwner(p);
    var stageH = stage.clientHeight || 0;
    quotes.forEach(function (q) {
      if (!q || !q.text) return;
      /* A row written before the check (or edited elsewhere) never reaches a
         visitor. The owner still sees it so they can remove it. */
      if (!ownerView && !quoteTextAllowed(q.text)) return;
      var yAt = stickerYFromLayout(q, stageH);
      var el = document.createElement("div");
      el.className = "tower-sticker tower-sticker--quote";
      el.setAttribute("data-tower-widget", "quote");
      el.setAttribute("data-tower-quote-id", q.id);
      el.setAttribute("data-sticker-label", "Quote");
      el.setAttribute("data-quote-text", q.text);
      el.setAttribute("data-sticker-x", String(q.x));
      el.setAttribute("data-sticker-y", String(yAt.pct));
      el.setAttribute("data-sticker-z", String(q.z || 10));
      el.style.setProperty("--sticker-x", q.x + "%");
      /* Offset from the canvas top in px (yPx) when saved: the canvas height
         differs between owner and visitor, so a % of it drifted. */
      el.style.setProperty("--sticker-y", yAt.css);
      el.style.setProperty("--sticker-z", String(q.z || 10));
      el.style.setProperty("--sticker-tilt", (q.tilt || 0) + "deg");
      el.innerHTML = '<blockquote class="tower-quote-card"></blockquote>';
      el.querySelector(".tower-quote-card").textContent = q.text;
      if (typeof q.w === "number" && q.w > 0) setStickerWidth(el, q.w);
      /* The saved spot: every clear-check starts from here, so a check run while
         neighbours were still loading never sticks (#223). */
      el.__cognationQuoteSpot = { x: q.x, yCss: yAt.css, yPct: yAt.pct };
      ensureResizeHandle(el, "Quote");
      stage.appendChild(el);
    });
    syncOwnerStickerHandles(root);
    watchQuotesClear(stage);
  }

  /* A Quote never covers another widget (video box, profile card, widget
     controls). After layout, a quote that overlaps one moves to the nearest
     clear spot beside it (right, then left), else below everything. Display
     only; the drop saves the clear spot it lands on. Phone stacks skip this. */
  /* Top edge of a sticker measured from the canvas top-left, in px (the
     tilt transform is ignored, so this is what --sticker-y: Npx restores). */
  function stickerTopInStage(stage, el) {
    if (!stage || !el) return NaN;
    if (el.offsetParent === stage) return el.offsetTop;
    return el.getBoundingClientRect().top - stage.getBoundingClientRect().top;
  }

  function keepQuoteClear(stage, el) {
    if (!stage || !el || isPhoneStage(stage) || el.hidden) return false;
    var sr = stage.getBoundingClientRect();
    var sw = sr.width || 0;
    if (!sw) return false;
    var r = el.getBoundingClientRect();
    var w = r.width;
    var h = r.height;
    if (!w || !h) return false;
    var blocks = [];
    stage.querySelectorAll("[data-tower-widget]").forEach(function (b) {
      if (b === el || b.hidden || b.classList.contains("is-widget-off")) return;
      if (b.classList.contains("tower-sticker--quote") || b.hasAttribute("data-tower-emoji")) return;
      if (b.closest(".tower-sticker--quote")) return;
      var br = b.getBoundingClientRect();
      if (!br.width || !br.height) return;
      blocks.push({ l: br.left - sr.left, t: br.top - sr.top, r: br.right - sr.left, b: br.bottom - sr.top });
    });
    var GAP = 12;
    function hit(x, y) {
      for (var i = 0; i < blocks.length; i++) {
        var k = blocks[i];
        if (x < k.r && k.l < x + w && y < k.b && k.t < y + h) return k;
      }
      return null;
    }
    var x0 = el.offsetParent === stage ? el.offsetLeft : r.left - sr.left;
    var y0 = stickerTopInStage(stage, el);
    if (!hit(x0, y0)) return false;
    var best = null;
    function consider(x, y) {
      if (x < GAP || x + w > sw - GAP || y < 0 || hit(x, y)) return;
      var d = Math.abs(x - x0) + Math.abs(y - y0);
      if (!best || d < best.d) best = { x: x, y: y, d: d };
    }
    blocks.forEach(function (k) {
      consider(k.r + GAP, y0);
      consider(k.l - w - GAP, y0);
    });
    if (!best) {
      var bottom = 0;
      blocks.forEach(function (k) { if (k.b > bottom) bottom = k.b; });
      best = { x: Math.max(GAP, Math.min(sw - GAP - w, x0)), y: bottom + GAP };
    }
    var xPct = Math.round((best.x / sw) * 1000) / 10;
    var yPx = Math.round(best.y);
    var sh = stage.clientHeight || 0;
    el.style.setProperty("--sticker-x", xPct + "%");
    el.style.setProperty("--sticker-y", yPx + "px");
    el.setAttribute("data-sticker-x", String(xPct));
    el.setAttribute("data-sticker-y", String(sh ? Math.round((yPx / sh) * 1000) / 10 : 0));
    el.setAttribute("data-sticker-y-px", String(yPx));
    return true;
  }

  function keepQuotesClear(stage) {
    if (!stage) return;
    /* Render only: every viewer (owner and visitor) shows the Quote at its
       saved x / y / yPx. No per-viewer nudge and no save from here: the old
       display-only nudge put the owner at 71.5 and visitors at 53.19 (#223).
       Quotes are moved off widgets only when the owner drops them
       (keepQuoteClear in the drop branch), and that drop is what gets saved. */
    stage.querySelectorAll(".tower-sticker--quote").forEach(function (el) {
      if (el.classList.contains("is-dragging")) return;
      var spot = el.__cognationQuoteSpot;
      if (!spot) return;
      el.style.setProperty("--sticker-x", spot.x + "%");
      el.style.setProperty("--sticker-y", spot.yCss);
      el.setAttribute("data-sticker-x", String(spot.x));
      el.setAttribute("data-sticker-y", String(spot.yPct));
      el.removeAttribute("data-sticker-y-px");
    });
  }

  /* Neighbours settle after the profile, video and fonts load: check again
     whenever the canvas changes size, and once the frame after a render. */
  function watchQuotesClear(stage) {
    if (!stage) return;
    var run = function () { keepQuotesClear(stage); };
    if (window.requestAnimationFrame) window.requestAnimationFrame(run);
    else setTimeout(run, 0);
    if (!stage.__cognationQuoteRO && typeof window.ResizeObserver === "function") {
      try {
        stage.__cognationQuoteRO = new window.ResizeObserver(function () {
          if (window.requestAnimationFrame) window.requestAnimationFrame(run);
          else run();
        });
        stage.__cognationQuoteRO.observe(stage);
      } catch (eRO) {}
    }
  }

  function commitInlineName(root, el) {
    if (!isTowerOwner(TowerProfileStore.get())) return;
    var p = TowerProfileStore.get();
    var next = String(el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!next) next = p.displayName || "You";
    p.displayName = next;
    el.textContent = next;
    var nameInput = root.querySelector("#tower-display-name");
    if (nameInput) nameInput.value = next;
    TowerProfileStore.save(p);
  }

  /* Real members cannot take a "seed-" / "seed_" / "ops-" / "ops_" handle (js/handle-reserved.js). */
  function reservedHandleChange(next) {
    var rules = window.CognationHandleRules;
    return rules ? rules.isReserved(next) : /^(seed|ops)[-_]/.test(normalizeHandle(next));
  }

  function reservedHandleMessage() {
    var rules = window.CognationHandleRules;
    return rules ? rules.message("Handles") : "Handles can't start with \"seed-\", \"seed_\", \"ops-\" or \"ops_\". Please pick a different one.";
  }

  /* Plain status line under the handle badge; reuses .commune-status styles. */
  function showHandleStatus(badge, msg) {
    if (!badge || !badge.parentNode) return;
    var st = badge.parentNode.querySelector("[data-tower-handle-status]");
    if (!msg) {
      if (st) st.remove();
      return;
    }
    if (!st) {
      st = document.createElement("p");
      st.className = "commune-status is-error";
      st.setAttribute("data-tower-handle-status", "");
      st.setAttribute("role", "status");
      st.setAttribute("aria-live", "polite");
      badge.insertAdjacentElement("afterend", st);
    }
    st.textContent = msg;
  }

  function commitInlineHandle(root, el) {
    if (!isTowerOwner(TowerProfileStore.get())) return;
    var p = TowerProfileStore.get();
    var prev = normalizeHandle(p.handle || "");
    var next = normalizeHandle(el.textContent || "");
    if (!next) {
      el.textContent = prev ? "@" + prev : "@";
      return;
    }
    if (next !== prev && reservedHandleChange(next)) {
      el.textContent = prev ? "@" + prev : "@";
      showHandleStatus(el, reservedHandleMessage());
      return;
    }
    showHandleStatus(el, "");
    if (window.CognationAccounts && typeof window.CognationAccounts.getProfileByHandle === "function") {
      var clash = window.CognationAccounts.getProfileByHandle(next);
      if (clash && clash.id !== p._profileId) {
        el.textContent = prev ? "@" + prev : "@";
        return;
      }
    }
    p.handle = next;
    el.textContent = "@" + next;
    var input = root.querySelector("[data-tower-handle]");
    if (input) input.value = next;
    TowerProfileStore.save(p);
    var profileRoot = root.querySelector("[data-tower-profile]");
    if (profileRoot) {
      var slug = profilePublicSlug(p);
      profileRoot.id = "tower-profile-" + slug;
      profileRoot.setAttribute("data-tower-handle", next);
      profileRoot.setAttribute("data-author-slug", slug);
    }
    try {
      if (location.hash !== "#" + profilePublicHash(p)) location.hash = profilePublicHash(p);
    } catch (eHash) {}
  }

  function commitInlineQuote(root, el) {
    if (!isTowerOwner(TowerProfileStore.get())) return;
    var sticker = el.closest("[data-tower-quote-id]");
    if (!sticker) return;
    var id = sticker.getAttribute("data-tower-quote-id");
    var p = TowerProfileStore.get();
    var quotes = getQuoteStickers(p);
    var prev = "";
    quotes.forEach(function (q) {
      if (q && q.id === id) prev = q.text || "";
    });
    var text = String(el.textContent || "").trim().slice(0, 400);
    if (!text) {
      el.textContent = prev;
      return;
    }
    p.quoteStickers = quotes.map(function (q) {
      if (!q || q.id !== id) return q;
      var edited = { id: q.id, text: text, x: q.x, y: q.y, z: q.z, tilt: q.tilt };
      if (typeof q.w === "number") edited.w = q.w;
      return edited;
    });
    sticker.setAttribute("data-quote-text", text);
    el.textContent = text;
    TowerProfileStore.save(p, { geometry: true });
  }

  function commitInlineSlogan(root, el) {
    if (!isTowerOwner(TowerProfileStore.get())) return;
    var p = TowerProfileStore.get();
    var text = String(el.textContent || "").trim().slice(0, 400);
    p.slogan = text;
    p.publicWidgets = normalizePublicWidgets(p.publicWidgets);
    p.publicWidgets.slogan = !!text;
    var input = root.querySelector("[data-tower-slogan]");
    if (input) input.value = text;
    el.textContent = text;
    TowerProfileStore.save(p);
    if (!text) {
      var sticker = el.closest('[data-tower-widget="slogan"]');
      if (sticker) {
        sticker.hidden = true;
        sticker.classList.add("is-widget-off");
      }
    }
  }

  function initInlineProfileEdits(root) {
    if (!root || root.__cognationInlineEditBound) return;
    root.__cognationInlineEditBound = true;

    function ownerPublic() {
      return isTowerOwner(TowerProfileStore.get()) && root.getAttribute("data-tower-side") === "public";
    }

    function canEdit() {
      var p = TowerProfileStore.get();
      return ownerPublic() && p && p._profileKind !== "professional";
    }

    function canEditHandle() {
      return ownerPublic();
    }

    function recentDrag(el) {
      var sticker = el && el.closest("[data-tower-widget]");
      return !!(sticker && sticker.__cognationDraggedAt && Date.now() - sticker.__cognationDraggedAt < 500);
    }

    root.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest || !root.contains(t)) return;
      var el = t.closest(".tower-quote-card, .tower-slogan-card, [data-tower-profile-name], [data-tower-handle-badge]");
      if (!el || !root.contains(el) || recentDrag(el)) return;
      var isHandle = el.matches("[data-tower-handle-badge]");
      var isName = el.matches("[data-tower-profile-name]");
      if (isName) {
        if (!ownerPublic()) return;
        if (el.getAttribute("contenteditable") === "true") return;
        el.setAttribute("contenteditable", "true");
        el.setAttribute("spellcheck", "false");
        try { el.focus(); } catch (eName) {}
        return;
      }
      if (isHandle) {
        if (!ownerPublic()) return;
      } else if (!canEdit()) return;
      if (el.getAttribute("contenteditable") === "true") return;
      /* First click selects the sticker so Backspace can remove it. The next click edits. */
      var sticker = el.closest("[data-tower-widget]");
      if (!sticker || !sticker.__cognationWasSelected) return;
      el.setAttribute("contenteditable", "true");
      el.setAttribute("spellcheck", "false");
      try { el.focus(); } catch (eFocus) {}
    });

    root.addEventListener("keydown", function (ev) {
      var el = ev.target;
      if (!el || el.getAttribute("contenteditable") !== "true") return;
      if (!el.closest(".tower-quote-card, .tower-slogan-card, [data-tower-profile-name], [data-tower-handle-badge]")) return;
      if (ev.key === "Enter") {
        ev.preventDefault();
        el.blur();
      }
    });

    root.addEventListener("focusout", function (ev) {
      var el = ev.target;
      if (!el || !el.getAttribute || el.getAttribute("contenteditable") !== "true") return;
      if (!root.contains(el)) return;
      el.removeAttribute("contenteditable");
      if (el.matches(".tower-quote-card")) commitInlineQuote(root, el);
      else if (el.matches(".tower-slogan-card")) commitInlineSlogan(root, el);
      else if (el.matches("[data-tower-profile-name]")) commitInlineName(root, el);
      else if (el.matches("[data-tower-handle-badge]")) commitInlineHandle(root, el);
    });
  }

  function openAddWidgetDialog(root) {
    var dlg = document.querySelector("[data-tower-add-widget-dialog]");
    if (!dlg) return;
    dlg.hidden = false;
    var ta = dlg.querySelector("[data-tower-add-quote-text]");
    if (ta) {
      ta.value = "";
      ta.focus();
    }
  }

  function closeAddWidgetDialog() {
    var dlg = document.querySelector("[data-tower-add-widget-dialog]");
    if (dlg) dlg.hidden = true;
  }

  function initAddWidgetUi(root) {
    if (root.__cognationAddWidgetBound) return;
    root.__cognationAddWidgetBound = true;
    var addBtn = root.querySelector("[data-tower-add-widget]");
    var dlg = document.querySelector("[data-tower-add-widget-dialog]");
    if (addBtn) {
      addBtn.addEventListener("click", function () {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        if (root.getAttribute("data-tower-side") !== "public") {
          setProfileStatusOn(root, "Switch to Public scrapbook to add stickers.", false);
          return;
        }
        openAddWidgetDialog(root);
      });
    }
    if (!dlg || dlg.__cognationBound) return;
    dlg.__cognationBound = true;
    /* Enter, or closing the box with words in it, places the quote. A blocked
       quote stays open. Cancel and the backdrop close an empty box. */
    function commitAddQuote() {
      if (!isTowerOwner(TowerProfileStore.get())) return false;
      var ta = dlg.querySelector("[data-tower-add-quote-text]");
      var text = ta ? ta.value : "";
      if (!String(text || "").trim()) {
        closeAddWidgetDialog();
        return true;
      }
      var added = addQuoteSticker(root, text);
      var qStatus = dlg.querySelector("[data-tower-add-quote-status]");
      if (added && added.blocked) {
        /* Keep the dialog open with the words so the owner can change them. */
        if (!qStatus && ta && ta.parentNode) {
          qStatus = document.createElement("p");
          qStatus.className = "commune-status is-error tower-add-quote-status";
          qStatus.setAttribute("data-tower-add-quote-status", "");
          qStatus.setAttribute("role", "status");
          qStatus.setAttribute("aria-live", "polite");
          ta.insertAdjacentElement("afterend", qStatus);
        }
        if (qStatus) { qStatus.hidden = false; qStatus.textContent = QUOTE_BLOCKED_MESSAGE; }
        setProfileStatusOn(root, QUOTE_BLOCKED_MESSAGE, true);
        return false;
      }
      if (qStatus) { qStatus.hidden = true; qStatus.textContent = ""; }
      setProfileStatusOn(root, "Quote sticker added.", false);
      closeAddWidgetDialog();
      return true;
    }
    dlg.addEventListener("click", function (ev) {
      if (ev.target === dlg) commitAddQuote();
    });
    dlg.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        closeAddWidgetDialog();
        return;
      }
      var box = ev.target && ev.target.closest ? ev.target.closest("[data-tower-add-quote-text]") : null;
      if (!box || ev.key !== "Enter" || ev.shiftKey) return;
      ev.preventDefault();
      commitAddQuote();
    });
    var cancel = dlg.querySelector("[data-tower-add-widget-cancel]");
    if (cancel) cancel.addEventListener("click", function () {
      closeAddWidgetDialog();
    });

    /* Empty canvas click on personal public page → offer add */
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (stage && !stage.__cognationAddCanvasBound) {
      stage.__cognationAddCanvasBound = true;
      stage.addEventListener("dblclick", function (ev) {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        if (root.getAttribute("data-tower-side") !== "public") return;
        if (ev.target.closest("[data-tower-widget], [data-tower-friend-pin], [data-tower-badge-pin], a, button, input, textarea")) return;
        var p = TowerProfileStore.get();
        if (p._profileKind && p._profileKind !== "personal") {
          /* Still allow on professional, but prompt emphasizes personal */
        }
        openAddWidgetDialog(root);
      });
    }
  }

  function hideProfileStatusBoxes() {
    var nodes = document.querySelectorAll("[data-tower-profile-status], [data-tower-add-profile-status]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].hidden = true;
      nodes[i].textContent = "";
      nodes[i].classList.remove("is-error");
    }
  }

  function showStatusPopup(msg, isError, opts) {
    opts = opts || {};
    hideProfileStatusBoxes();
    msg = msg ? String(msg) : "";
    if (!msg) return;
    var host = document.querySelector("[data-status-popup-host]");
    if (!host) {
      host = document.createElement("div");
      host.className = "status-popup-host";
      host.setAttribute("data-status-popup-host", "");
      document.body.appendChild(host);
    }
    if (opts.once) {
      if (!host.__seen) host.__seen = {};
      if (host.__seen[msg]) return;
      host.__seen[msg] = true;
    }
    var popup = document.createElement("div");
    popup.className = "status-popup" + (isError ? " is-error" : "");
    popup.setAttribute("role", "status");
    popup.setAttribute("data-status-popup", "");
    var text = document.createElement("p");
    text.className = "status-popup-text";
    text.textContent = msg;
    popup.appendChild(text);
    var offerUndo = msg.indexOf("Undo to restore") !== -1;
    if (offerUndo) {
      var undo = document.createElement("button");
      undo.type = "button";
      undo.className = "status-popup-undo";
      undo.setAttribute("data-status-popup-undo", "");
      undo.textContent = "Undo";
      undo.addEventListener("click", function () {
        if (popup.parentNode) popup.remove();
        var app = document.querySelector("[data-tower-app]");
        if (app && typeof app.__cognationUndoWidget === "function") app.__cognationUndoWidget();
      });
      popup.appendChild(undo);
    }
    host.appendChild(popup);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    window.setTimeout(function () {
      if (popup.parentNode) popup.remove();
    }, offerUndo ? 7000 : 5000);
  }

  /* Remove with Edit profile closed (PM, Oct 22): the removal line also shows as
     a short dark glass notice for ~4s; a new removal replaces it. 768px and up it
     sits at the end of the owner-only toolbar above the stage. Below 768px it is
     a fixed notice at the bottom of the viewport (Designer LOOK on #247), so the
     stage and toolbar never move; it fades and slides in/out over 160ms (no
     motion under prefers-reduced-motion). With Edit profile open, only the Edit
     profile status line shows it (never both). Visitors never see it: the
     toolbar is owner-only. Display only; nothing is saved. */
  var STAGE_REMOVAL_NOTICE_MS = 4000;
  var STAGE_REMOVAL_NOTICE_FADE_MS = 160;

  function stageNoticeNarrow() {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(max-width: 767.98px)").matches;
  }

  function stageNoticeAnimates() {
    if (!stageNoticeNarrow()) return false;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /* Below 768 the notice is position: fixed. The public side's backdrop-filter
     would make it the containing block (fixed to the page section, not the
     viewport), so while it shows on a narrow screen the notice sits directly
     in the Tower app root; it goes back to the end of the toolbar when it clears. */
  function placeStageRemovalNotice(root, n, narrow) {
    if (!n.__towerHome) {
      n.__towerHome = n.parentNode;
      /* Crossing 768 while it shows: put it straight back in the toolbar. */
      try {
        window.matchMedia("(max-width: 767.98px)").addEventListener("change", function () {
          if (!n.hidden) clearStageRemovalNotice(root, true);
        });
      } catch (eMq) {}
    }
    var target = narrow ? root : n.__towerHome;
    if (!narrow && n.classList) {
      n.classList.remove("is-top");
      if (n.style) n.style.removeProperty("--tower-stage-notice-top");
    }
    if (target && n.parentNode !== target && target.appendChild) target.appendChild(n);
  }

  function clearStageRemovalNotice(root, instant) {
    var n = root && root.querySelector("[data-tower-stage-notice]");
    if (!n) return;
    if (n.__towerTimer) clearTimeout(n.__towerTimer);
    n.__towerTimer = null;
    if (n.__towerFadeTimer) clearTimeout(n.__towerFadeTimer);
    n.__towerFadeTimer = null;
    if (n.classList) n.classList.remove("is-in");
    if (!instant && !n.hidden && stageNoticeAnimates()) {
      n.__towerFadeTimer = setTimeout(function () {
        n.__towerFadeTimer = null;
        n.textContent = "";
        n.hidden = true;
        placeStageRemovalNotice(root, n, false);
      }, STAGE_REMOVAL_NOTICE_FADE_MS);
      return;
    }
    n.textContent = "";
    n.hidden = true;
    placeStageRemovalNotice(root, n, false);
  }

  function showStageRemovalNotice(root, msg) {
    var n = root && root.querySelector("[data-tower-stage-notice]");
    if (!n) return;
    var panel = root.querySelector("[data-tower-profile-edit-panel]");
    var editOpen = !!(panel && !panel.hidden);
    if (!msg || editOpen || !isTowerOwner(TowerProfileStore.get())) {
      clearStageRemovalNotice(root, true);
      return;
    }
    if (n.__towerTimer) clearTimeout(n.__towerTimer);
    if (n.__towerFadeTimer) clearTimeout(n.__towerFadeTimer);
    n.__towerFadeTimer = null;
    var wasShown = !n.hidden && n.classList && n.classList.contains("is-in");
    placeStageRemovalNotice(root, n, stageNoticeNarrow());
    n.textContent = msg;
    n.hidden = false;
    if (!wasShown && stageNoticeNarrow()) pickStageNoticeBand(root, n);
    if (n.classList && !wasShown) {
      /* One frame at the start state, then .is-in runs the 160ms fade/slide. */
      if (typeof requestAnimationFrame === "function" && stageNoticeAnimates()) {
        void n.offsetWidth;
        requestAnimationFrame(function () { if (!n.hidden) n.classList.add("is-in"); });
      } else {
        n.classList.add("is-in");
      }
    }
    n.__towerTimer = setTimeout(function () { clearStageRemovalNotice(root); }, STAGE_REMOVAL_NOTICE_MS);
  }

  /* Remove used to jump the page (SeedOps live check: scrollY 851 -> 185 at 390).
     The removed widget leaves the stage, the stage and the page get shorter, and
     when the viewer is within that height of the page bottom the browser clamps
     scrollY to the new, shorter page. Keep the scroll position: note scrollY
     before the re-render; afterwards, if the page is now too short to stay there,
     hold the stage's height by exactly the missing amount (blank space at the
     stage's foot, nothing else moves), then restore scrollY. The hold goes with
     the next stage layout (Show, Reset layout, resize, reload). Display only.
     Every width: no breakpoint check here or in keepTowerScrollAround, so the
     hold (and the blank space at the stage's foot) is the same at 1280 as at 390. */
  function holdTowerScroll(root, x, y) {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    var doc = document.documentElement;
    var stage = root && root.querySelector ? root.querySelector("[data-tower-scrapbook]") : null;
    var missing = y + (window.innerHeight || 0) - (doc ? doc.scrollHeight : 0);
    if (missing > 0 && stage && stage.getBoundingClientRect) {
      stage.style.minHeight = Math.ceil(stage.getBoundingClientRect().height + missing) + "px";
    }
    var now = window.pageYOffset || 0;
    /* "instant": the page uses smooth scrolling; the restore must land before the
       next paint so the viewer never sees the page move. */
    if (Math.abs(now - y) > 0.5 && typeof window.scrollTo === "function") {
      window.scrollTo({ left: x, top: y, behavior: "instant" });
    }
  }

  function keepTowerScrollAround(root, run) {
    var x = typeof window !== "undefined" ? window.pageXOffset || 0 : 0;
    var y = typeof window !== "undefined" ? window.pageYOffset || 0 : 0;
    try {
      run();
    } finally {
      holdTowerScroll(root, x, y);
      /* Late re-renders (player teardown, spawn) settle within a frame; only
         undo a clamp, never a scroll the viewer made since. */
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(function () {
          if ((window.pageYOffset || 0) < y - 0.5) holdTowerScroll(root, x, y);
        });
      }
    }
  }

  /* Below 768 (follow-up to #247): the bottom band can sit over the Mutual
     friends, Go live and Messages envelope controls in the profile card. When it
     would, the notice shows at the top of the viewport instead (below the tab
     bar when that is on screen). Picked once as it shows, so it never jumps; it
     ignores taps either way (pointer-events: none on it and its children). */
  var STAGE_NOTICE_EDGE = 16;
  var STAGE_NOTICE_CLEAR_SELECTORS = ["[data-tower-mutual-friends]", "[data-go-live]", "[data-tower-envelope]"];

  function stageNoticeBandsClash(band, rects) {
    return rects.some(function (r) { return r.bottom > band.top && r.top < band.bottom; });
  }

  function pickStageNoticeBand(root, n) {
    n.classList.remove("is-top");
    if (n.style) n.style.removeProperty("--tower-stage-notice-top");
    var vh = window.innerHeight || 0;
    var h = n.getBoundingClientRect().height || 0;
    var rects = [];
    STAGE_NOTICE_CLEAR_SELECTORS.forEach(function (sel) {
      Array.prototype.forEach.call(root.querySelectorAll(sel), function (el) {
        if (el.hidden || (el.closest && el.closest("[hidden]"))) return;
        var r = el.getBoundingClientRect();
        if (!r.width || !r.height || r.bottom <= 0 || r.top >= vh) return;
        rects.push(r);
      });
    });
    var bottomBand = { top: vh - STAGE_NOTICE_EDGE - h, bottom: vh - STAGE_NOTICE_EDGE };
    if (!stageNoticeBandsClash(bottomBand, rects)) return "bottom";
    var top = STAGE_NOTICE_EDGE;
    var tabs = document.querySelector(".app-topbar");
    if (tabs) {
      var tr = tabs.getBoundingClientRect();
      if (tr.bottom > 0 && tr.top < vh) top = Math.max(top, Math.ceil(tr.bottom) + 8);
    }
    var topBand = { top: top, bottom: top + h };
    if (stageNoticeBandsClash(topBand, rects)) return "bottom";
    n.style.setProperty("--tower-stage-notice-top", top + "px");
    n.classList.add("is-top");
    return "top";
  }

  function setProfileStatusOn(root, msg, isError) {
    showStatusPopup(msg, isError);
  }


  function initScrapbookStickers(root) {
    var stage = root.querySelector("[data-tower-scrapbook]");
    if (!stage || stage.__cognationStickersBound) return;
    stage.__cognationStickersBound = true;
    stage.classList.add("is-sticker-stage");
    stage.classList.remove("is-editing");
    ensureStickersOnStage(stage);

    var resetBtn = root.querySelector("[data-tower-reset-layout]");
    var undoBtn = root.querySelector("[data-tower-undo-widget]");
    if (!root.__cognationWidgetUndo) root.__cognationWidgetUndo = [];

    function setProfileStatusSafe(msg, isError, removal) {
      if (removal) showStageRemovalNotice(root, msg);
      showStatusPopup(msg, isError);
      var el = root.querySelector("[data-tower-profile-status]");
      if (!el) return;
      el.hidden = !msg;
      el.textContent = msg || "";
      el.__towerRemovalLine = removal && msg ? String(msg) : "";
      el.classList.toggle("is-error", !!isError);
    }

    function syncUndoButton() {
      if (!undoBtn) return;
      var n = (root.__cognationWidgetUndo || []).length;
      undoBtn.disabled = n === 0;
      undoBtn.setAttribute("aria-disabled", n === 0 ? "true" : "false");
      undoBtn.title = n ? ("Restore last removed (" + n + " in undo stack)") : "Nothing to undo";
    }

    function pushWidgetUndo(entry) {
      if (!entry) return;
      if (!root.__cognationWidgetUndo) root.__cognationWidgetUndo = [];
      root.__cognationWidgetUndo.push(entry);
      while (root.__cognationWidgetUndo.length > WIDGET_UNDO_MAX) {
        root.__cognationWidgetUndo.shift();
      }
      syncUndoButton();
    }

    function undoLastWidgetRemoval() {
      var stack = root.__cognationWidgetUndo || [];
      if (!stack.length) {
        setProfileStatusSafe("Nothing to undo.", false);
        syncUndoButton();
        return;
      }
      var entry = stack.pop();
      syncUndoButton();
      if (!entry) return;
      if (entry.type === "widget") {
        setPublicWidgetVisible(root, entry.id, true);
        setProfileStatusSafe("Restored " + (entry.label || entry.id) + ".", false);
        return;
      }
      if (entry.type === "instax") {
        var pCamUndo = TowerProfileStore.get();
        if (!isTowerOwner(pCamUndo)) return;
        setInstaxSwitch(pCamUndo, true);
        TowerProfileStore.save(pCamUndo);
        ensurePersonalPolaroid(root, pCamUndo);
        applyWidgetLayout(root, pCamUndo);
        setProfileStatusSafe("Restored Camera.", false);
        return;
      }
      if (entry.type === "emoji") {
        var pEmojiUndo = TowerProfileStore.get();
        if (!isTowerOwner(pEmojiUndo)) return;
        var listEmoji = normalizeEmojiStickers(pEmojiUndo.emojiStickers);
        var already = false;
        listEmoji.forEach(function (item) {
          if (item.id === entry.id) already = true;
        });
        if (!already && entry.item) {
          listEmoji.push({
            id: entry.item.id,
            glyph: entry.item.glyph,
            size: normalizeEmojiSize(entry.item.size),
          });
          pEmojiUndo.emojiStickers = listEmoji;
          if (entry.layout) {
            if (!pEmojiUndo.widgetLayout || typeof pEmojiUndo.widgetLayout !== "object") {
              pEmojiUndo.widgetLayout = {};
            }
            pEmojiUndo.widgetLayout[entry.id] = entry.layout;
          }
          TowerProfileStore.save(pEmojiUndo);
        }
        renderEmojiStickers(root, TowerProfileStore.get());
        setProfileStatusSafe("Restored emoji.", false);
        return;
      }
      if (entry.type === "quote") {
        addQuoteSticker(root, entry.layout && entry.layout.text || "Quote", entry.layout, entry.id);
        setProfileStatusSafe("Restored quote.", false);
        return;
      }
      if (entry.type === "shell") {
        if (entry.id === "polaroid") {
          var pPolUndo = TowerProfileStore.get();
          pPolUndo.polaroidRemoved = false;
          TowerProfileStore.save(pPolUndo);
          ensurePersonalPolaroid(root, pPolUndo);
          applyWidgetLayout(root, pPolUndo);
          setProfileStatusSafe("Restored Polaroid.", false);
          return;
        }
        setProfileStatusSafe("Shell restore is limited in this demo — use Reset layout.", false);
        return;
      }
      if (entry.type === "friend") {
        var fp = TowerProfileStore.get();
        if (!isTowerOwner(fp)) return;
        fp.removedFriendPinIds = (fp.removedFriendPinIds || []).filter(function (id) {
          return id !== entry.id;
        });
        var ids = (fp.featuredFriendIds || []).slice();
        if (ids.indexOf(entry.id) < 0) {
          var max = fp.friendsDisplayCount || 3;
          if (ids.length >= max) {
            /* bump count if needed so restore can fit */
            if (max < 8) {
              fp.friendsDisplayCount = ids.length + 1 <= 6 ? 6 : 8;
              max = fp.friendsDisplayCount;
            }
          }
          if (ids.length < max) ids.push(entry.id);
        }
        fp.featuredFriendIds = ids.slice(0, fp.friendsDisplayCount || 8);
        writeTopFriendLocal(fp._profileId, fp.removedFriendPinIds, fp.featuredFriendIds);
        if (entry.layout) {
          if (!fp.friendPinLayout || typeof fp.friendPinLayout !== "object") fp.friendPinLayout = {};
          fp.friendPinLayout[entry.id] = entry.layout;
        }
        ensureFriendPinPositions(fp, fp.featuredFriendIds);
        TowerProfileStore.save(fp, { geometry: true });
        renderFriendsPicker(root, fp);
        renderFriendPins(root, fp);
        syncOwnerStickerHandles(root);
        setProfileStatusSafe("Restored friend pin.", false);
        return;
      }
      if (entry.type === "badge") {
        setBadgeVisibility(root, entry.id, true);
        setProfileStatusSafe("Restored badge pin.", false);
        return;
      }
    }

    root.__cognationUndoWidget = undoLastWidgetRemoval;
    syncUndoButton();
    if (undoBtn && !undoBtn.__cognationUndoBound) {
      undoBtn.__cognationUndoBound = true;
      undoBtn.addEventListener("click", function () {
        undoLastWidgetRemoval();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        var p = TowerProfileStore.get();
        if (!isTowerOwner(p)) return;
        p.widgetLayout = {};
        if (p.widgetLayout && p.widgetLayout.feed) delete p.widgetLayout.feed;
        if (p.widgetLayout && p.widgetLayout.messages) delete p.widgetLayout.messages;
        /* Reset restores positions and the camera only. It keeps the owner's
           other visibility choices (social, music, badges, friends, html, ...):
           copying the defaults over them turned hidden widgets back on with no
           owner toggle to turn them off again (#242 follow-up).
           Explicit camera "on" so a browser holding an old "camera off" copy
           follows the reset (#223). */
        setInstaxSwitch(p, true);
        p.polaroidRemoved = false;
        p.removedFriendPinIds = [];
        p.featuredFriendIds = [];
        writeTopFriendLocal(p._profileId, p.removedFriendPinIds, p.featuredFriendIds);
        TowerProfileStore.save(p, { geometry: true });
        applyWidgetLayout(root, p);
        applyPublicWidgets(root, p);
        syncPublicWidgetsForm(root, p);
        renderFriendPins(root, p);
        renderBadgePins(root, p);
        syncOwnerStickerHandles(root);
        root.__cognationWidgetUndo = [];
        syncUndoButton();
        setProfileStatusSafe("Layout reset.", false);
      });
    }

    function pointerPos(ev) {
      if (ev.touches && ev.touches[0]) return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
      return { x: ev.clientX, y: ev.clientY };
    }

    function ownerOnPublic() {
      return isTowerOwner(TowerProfileStore.get()) && root.getAttribute("data-tower-side") === "public";
    }

    function onPointerDown(ev) {
      if (!ownerOnPublic()) return;
      /* Phone shows a fixed single column; dragging there must not rewrite the website layout. */
      if (isPhoneStage(stage)) return;

      var friendPin = ev.target.closest("[data-tower-friend-pin]");
      if (friendPin && stage.contains(friendPin)) {
        ev.preventDefault();
        stickerZCounter += 1;
        friendPin.style.setProperty("--sticker-z", String(stickerZCounter));
        friendPin.classList.add("is-dragging");
        friendPin.__cognationDidDrag = false;
        var rectPin = stage.getBoundingClientRect();
        var startPin = pointerPos(ev);
        var startPinX = parseFloat(friendPin.getAttribute("data-sticker-x") || "0");
        var startPinY = parseFloat(friendPin.getAttribute("data-sticker-y") || "0");

        function onMovePin(e) {
          var cur = pointerPos(e);
          if (e.cancelable) e.preventDefault();
          var dxPct = ((cur.x - startPin.x) / rectPin.width) * 100;
          var dyPct = ((cur.y - startPin.y) / rectPin.height) * 100;
          if (Math.abs(dxPct) > 0.3 || Math.abs(dyPct) > 0.3) friendPin.__cognationDidDrag = true;
          var nx = Math.max(0, Math.min(88, startPinX + dxPct));
          var ny = Math.max(0, Math.min(88, startPinY + dyPct));
          friendPin.style.setProperty("--sticker-x", nx + "%");
          friendPin.style.setProperty("--sticker-y", ny + "%");
          friendPin.setAttribute("data-sticker-x", String(Math.round(nx * 10) / 10));
          friendPin.setAttribute("data-sticker-y", String(Math.round(ny * 10) / 10));
          friendPin.setAttribute("data-sticker-z", String(stickerZCounter));
        }

        function onUpPin() {
          friendPin.classList.remove("is-dragging");
          document.removeEventListener("pointermove", onMovePin);
          document.removeEventListener("pointerup", onUpPin);
          document.removeEventListener("pointercancel", onUpPin);
          document.removeEventListener("touchmove", onMovePin);
          document.removeEventListener("touchend", onUpPin);
          if (!friendPin.__cognationDidDrag) return;
          var p = TowerProfileStore.get();
          var pinLayout = getFriendPinLayout(p);
          var fid = friendPin.getAttribute("data-tower-friend-pin");
          if (!fid) return;
          var prevPin = pinLayout[fid] || { tilt: 0 };
          pinLayout[fid] = {
            x: parseFloat(friendPin.getAttribute("data-sticker-x") || "0"),
            y: parseFloat(friendPin.getAttribute("data-sticker-y") || "0"),
            z: parseInt(friendPin.getAttribute("data-sticker-z") || "12", 10),
            tilt: typeof prevPin.tilt === "number" ? prevPin.tilt : 0,
          };
          p.friendPinLayout = pinLayout;
          TowerProfileStore.save(p, { geometry: true });
        }

        document.addEventListener("pointermove", onMovePin);
        document.addEventListener("pointerup", onUpPin);
        document.addEventListener("pointercancel", onUpPin);
        document.addEventListener("touchmove", onMovePin, { passive: false });
        document.addEventListener("touchend", onUpPin);
        return;
      }

      var badgePin = ev.target.closest("[data-tower-badge-pin]");
      if (badgePin && stage.contains(badgePin)) {
        ev.preventDefault();
        stickerZCounter += 1;
        badgePin.style.setProperty("--sticker-z", String(stickerZCounter));
        badgePin.classList.add("is-dragging");
        badgePin.__cognationDidDrag = false;
        var rectBadge = stage.getBoundingClientRect();
        var startBadge = pointerPos(ev);
        var startBadgeX = parseFloat(badgePin.getAttribute("data-sticker-x") || "0");
        var startBadgeY = parseFloat(badgePin.getAttribute("data-sticker-y") || "0");

        function onMoveBadge(e) {
          var cur = pointerPos(e);
          if (e.cancelable) e.preventDefault();
          var dxPct = ((cur.x - startBadge.x) / rectBadge.width) * 100;
          var dyPct = ((cur.y - startBadge.y) / rectBadge.height) * 100;
          if (Math.abs(dxPct) > 0.3 || Math.abs(dyPct) > 0.3) badgePin.__cognationDidDrag = true;
          var nx = Math.max(0, Math.min(88, startBadgeX + dxPct));
          var ny = Math.max(0, Math.min(88, startBadgeY + dyPct));
          badgePin.style.setProperty("--sticker-x", nx + "%");
          badgePin.style.setProperty("--sticker-y", ny + "%");
          badgePin.setAttribute("data-sticker-x", String(Math.round(nx * 10) / 10));
          badgePin.setAttribute("data-sticker-y", String(Math.round(ny * 10) / 10));
          badgePin.setAttribute("data-sticker-z", String(stickerZCounter));
        }

        function onUpBadge() {
          badgePin.classList.remove("is-dragging");
          document.removeEventListener("pointermove", onMoveBadge);
          document.removeEventListener("pointerup", onUpBadge);
          document.removeEventListener("pointercancel", onUpBadge);
          document.removeEventListener("touchmove", onMoveBadge);
          document.removeEventListener("touchend", onUpBadge);
          if (!badgePin.__cognationDidDrag) return;
          var bp = TowerProfileStore.get();
          var badgeLayout = getBadgePinLayout(bp);
          var bid = badgePin.getAttribute("data-tower-badge-pin");
          if (!bid) return;
          var prevBadge = badgeLayout[bid] || { tilt: 0 };
          badgeLayout[bid] = {
            x: parseFloat(badgePin.getAttribute("data-sticker-x") || "0"),
            y: parseFloat(badgePin.getAttribute("data-sticker-y") || "0"),
            z: parseInt(badgePin.getAttribute("data-sticker-z") || "14", 10),
            tilt: typeof prevBadge.tilt === "number" ? prevBadge.tilt : 0,
          };
          bp.badgePinLayout = badgeLayout;
          TowerProfileStore.save(bp, { geometry: true });
        }

        document.addEventListener("pointermove", onMoveBadge);
        document.addEventListener("pointerup", onUpBadge);
        document.addEventListener("pointercancel", onUpBadge);
        document.addEventListener("touchmove", onMoveBadge, { passive: false });
        document.addEventListener("touchend", onUpBadge);
        return;
      }

      /* Drag from anywhere on the sticker (including the move handle). Real
         controls keep their clicks; the handle is the move affordance. */
      var handleHit = ev.target.closest("[data-tower-sticker-handle]");
      if (
        !handleHit &&
        !ev.target.closest("[data-tower-envelope]") &&
        ev.target.closest("a, button, input, textarea, select, label, summary, iframe, [contenteditable='true'], [data-tower-rotate], [data-tower-avatar-resize], [data-tower-name-resize], [data-tower-emoji-resize], [data-tower-polaroid-resize], [data-tower-youtube-resize]")
      ) {
        return;
      }
      var sticker = handleHit
        ? handleHit.closest("[data-tower-widget]")
        : ev.target.closest("[data-tower-widget]");
      if (!sticker || !stage.contains(sticker)) return;
      var wid = sticker.getAttribute("data-tower-widget");
      if (wid === "feed" || wid === "messages" || wid === "identity" || wid === "envelope") return;
      if (sticker.hidden || sticker.classList.contains("is-widget-off")) return;

      var rect = stage.getBoundingClientRect();
      var start = pointerPos(ev);
      var startX = parseFloat(sticker.getAttribute("data-sticker-x") || "0");
      var startY = parseFloat(sticker.getAttribute("data-sticker-y") || "0");
      var dragStarted = false;

      function onMove(e) {
        var cur = pointerPos(e);
        var dxPx = cur.x - start.x;
        var dyPx = cur.y - start.y;
        if (!dragStarted) {
          if (Math.abs(dxPx) < 5 && Math.abs(dyPx) < 5) return;
          dragStarted = true;
          /* A Quote floats over the page: moving it never lifts the other
             widgets out of the default grid. That lift only lived in this
             browser, so the drop spot sat next to different neighbours on the
             next load (Designer LOOK NO on #223). */
          if (wid !== "quote" && liftDefaultGrid(stage)) {
            rect = stage.getBoundingClientRect();
            startX = parseFloat(sticker.getAttribute("data-sticker-x") || "0");
            startY = parseFloat(sticker.getAttribute("data-sticker-y") || "0");
          }
          stickerZCounter += 1;
          sticker.style.setProperty("--sticker-z", String(stickerZCounter));
          sticker.classList.add("is-dragging");
          if (e.pointerId != null && sticker.setPointerCapture) {
            try { sticker.setPointerCapture(e.pointerId); } catch (errCap) {}
          }
        }
        if (e.cancelable) e.preventDefault();
        var dxPct = (dxPx / rect.width) * 100;
        var dyPct = (dyPx / rect.height) * 100;
        /* Keep the whole widget inside the card: right edge stops at the card edge. */
        var inset = rect.width > 0 ? (12 / rect.width) * 100 : 0;
        var maxX = 88;
        if (rect.width > 0 && sticker.offsetWidth > 0) {
          maxX = Math.max(inset, 100 - inset - (sticker.offsetWidth / rect.width) * 100);
        }
        var maxY = 88;
        if (rect.height > 0 && sticker.offsetHeight > 0) {
          maxY = Math.max(0, 100 - (sticker.offsetHeight / rect.height) * 100);
        }
        var nx = Math.max(inset, Math.min(maxX, startX + dxPct));
        var ny = Math.max(0, Math.min(maxY, startY + dyPct));
        sticker.style.setProperty("--sticker-x", nx + "%");
        sticker.style.setProperty("--sticker-y", ny + "%");
        sticker.setAttribute("data-sticker-x", String(Math.round(nx * 10) / 10));
        sticker.setAttribute("data-sticker-y", String(Math.round(ny * 10) / 10));
        sticker.setAttribute("data-sticker-z", String(stickerZCounter));
      }

      var dropCommitted = false;
      function onUp() {
        if (dropCommitted) return;
        dropCommitted = true;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onUp);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onUp, true);
        if (!dragStarted) {
          sticker.classList.remove("is-dragging");
          return;
        }
        sticker.__cognationDraggedAt = Date.now();
        /* Read the drop before get()/save(). A profile refresh inside save
           repaints from the original layout and would otherwise record spawn. */
        var dropX = parseFloat(sticker.getAttribute("data-sticker-x") || "0");
        var dropY = parseFloat(sticker.getAttribute("data-sticker-y") || "0");
        var dropZ = parseInt(sticker.getAttribute("data-sticker-z") || "1", 10);
        var dropTilt = parseFloat(String(sticker.style.getPropertyValue("--sticker-tilt") || "0").replace("deg", "")) || 0;
        var p = TowerProfileStore.get();
        var layout = getWidgetLayout(p) || {};
        var id = sticker.getAttribute("data-tower-widget");
        if (!id) {
          sticker.classList.remove("is-dragging");
          return;
        }
        if (id === "quote") {
          var qid = sticker.getAttribute("data-tower-quote-id");
          /* Land on a clear spot, then save it as an offset from the canvas
             top-left (x as a share of the width, y in px). */
          sticker.classList.remove("is-dragging");
          sticker.removeAttribute("data-sticker-y-px");
          keepQuoteClear(stage, sticker);
          var qX = parseFloat(sticker.getAttribute("data-sticker-x") || String(dropX));
          var qYpx = parseFloat(sticker.getAttribute("data-sticker-y-px") || "NaN");
          if (!isFinite(qYpx)) qYpx = stickerTopInStage(stage, sticker);
          if (!isFinite(qYpx)) qYpx = stickerYPxFromDrop(dropY, stage.clientHeight || 0);
          var quotes = getQuoteStickers(p);
          p.quoteStickers = quotes.map(function (q) {
            if (q.id !== qid) return q;
            var moved = {
              id: q.id,
              text: q.text,
              x: qX,
              y: parseFloat(sticker.getAttribute("data-sticker-y") || String(dropY)) || dropY,
              z: dropZ,
              tilt: dropTilt,
            };
            if (typeof qYpx === "number" && isFinite(qYpx)) moved.yPx = Math.round(qYpx);
            if (typeof q.w === "number") moved.w = q.w;
            sticker.__cognationQuoteSpot = {
              x: moved.x,
              yCss: typeof moved.yPx === "number" ? moved.yPx + "px" : moved.y + "%",
              yPct: moved.y,
            };
            return moved;
          });
          TowerProfileStore.save(p, { geometry: true });
        } else {
          var prev = layout[id] || { tilt: dropTilt };
          freezeSpawnedWidgets(root, layout);
          sticker.classList.remove("is-spawned");
          layout[id] = {
            x: dropX,
            y: dropY,
            z: dropZ,
            tilt: typeof prev.tilt === "number" ? prev.tilt : dropTilt,
            /* Owner drag: free placement, never treated as an auto-spawn pile. */
            dragged: true,
          };
          var dropW = parseFloat(sticker.getAttribute("data-sticker-w") || "") || (prev && prev.wPx) || 0;
          if (dropW > 0) layout[id].wPx = Math.round(dropW);
          var dropYPx = stickerYPxFromDrop(dropY, stage.clientHeight || rect.height || 0);
          if (dropYPx != null) layout[id].yPx = dropYPx;
          p.widgetLayout = layout;
          TowerProfileStore.save(p, { geometry: true });
        }
        if (id !== "quote") {
          /* (A Quote already sits on its clamped spot from keepQuoteClear.) */
          sticker.style.setProperty("--sticker-x", dropX + "%");
          var dropYAt = layout[id] ? stickerYFromLayout(layout[id], stage.clientHeight || 0) : { css: dropY + "%" };
          sticker.style.setProperty("--sticker-y", dropYAt.css);
          sticker.setAttribute("data-sticker-x", String(dropX));
          sticker.setAttribute("data-sticker-y", String(dropY));
        }
        sticker.style.setProperty("--sticker-z", String(dropZ));
        sticker.setAttribute("data-sticker-z", String(dropZ));
        sticker.classList.remove("is-dragging");
        /* The drop itself may leave a neighbour overlapping (a full-row widget
           grows once it leaves the grid). Repair now; the dropped widget is
           seated first, so only the others move. */
        if (id !== "quote") {
          try {
            var pr = TowerProfileStore.get();
            var spawnIdsDrop = {};
            spawnRowsFor(pr).forEach(function (r) { r.forEach(function (w) { spawnIdsDrop[w] = true; }); });
            repairLayoutOverlaps(stage, pr, getWidgetLayout(pr), spawnIdsDrop);
          } catch (eRepair) {}
        }
      }

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onUp, true);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onUp);
    }

    stage.addEventListener("pointerdown", onPointerDown);

    /* Click to select a public widget (owner only) */
    stage.addEventListener("click", function (ev) {
      if (!ownerOnPublic()) return;
      if (ev.target.closest("[data-tower-profile-edit]")) return;
      var instaxHit = ev.target.closest('[data-tower-widget="instax"]');
      if (
        instaxHit &&
        stage.contains(instaxHit) &&
        !instaxHit.hidden &&
        !ev.target.closest("a, button, input, textarea, select, label, summary")
      ) {
        var justDragged = instaxHit.__cognationDraggedAt && Date.now() - instaxHit.__cognationDraggedAt < 700;
        var instaxFile = root.querySelector("[data-tower-instax-file]");
        if (!justDragged && instaxFile && !instaxFile.disabled) instaxFile.click();
      }
      var handleClick = ev.target.closest("[data-tower-sticker-handle]");
      if (handleClick) {
        var handleSticker = handleClick.closest("[data-tower-widget]");
        if (handleSticker && stage.contains(handleSticker) && !handleSticker.hidden) {
          clearWidgetSelection(stage);
          handleSticker.classList.add("is-widget-selected");
          syncRotateToolbar(root);
        }
        return;
      }
      if (ev.target.closest(".tower-avatar-upload, [data-tower-avatar-file], [data-tower-avatar-file-panel]")) return;
      /* Pins are <a> — select before the generic interactive early-return */
      var friendSel = ev.target.closest("[data-tower-friend-pin]");
      if (friendSel && stage.contains(friendSel)) {
        ev.preventDefault();
        clearWidgetSelection(stage);
        friendSel.classList.add("is-widget-selected");
        syncRotateToolbar(root);
        return;
      }
      var badgeSel = ev.target.closest("[data-tower-badge-pin]");
      if (badgeSel && stage.contains(badgeSel)) {
        ev.preventDefault();
        clearWidgetSelection(stage);
        badgeSel.classList.add("is-widget-selected");
        syncRotateToolbar(root);
        return;
      }
      if (ev.target.closest("a, button, input, textarea, select, label")) {
        /* Still allow selecting if click is on non-interactive sticker chrome */
        var maybe = ev.target.closest("[data-tower-widget]");
        if (!maybe || ev.target.closest("a, button, input, textarea, select, label")) {
          /* Don't steal clicks from controls; clear selection only on bare stage */
          if (ev.target === stage || ev.target.hasAttribute("data-tower-collage-stage")) {
            clearWidgetSelection(stage);
            syncRotateToolbar(root);
          }
          return;
        }
      }
      var sticker = ev.target.closest("[data-tower-widget]");
      if (sticker && stage.contains(sticker) && !sticker.hidden && !sticker.classList.contains("is-widget-off")) {
        var wid = sticker.getAttribute("data-tower-widget");
        if (wid === "feed" || wid === "messages") return;
        sticker.__cognationWasSelected = sticker.classList.contains("is-widget-selected");
        clearWidgetSelection(stage);
        sticker.classList.add("is-widget-selected");
        syncRotateToolbar(root);
        return;
      }
      if (ev.target === stage || ev.target.closest("[data-tower-collage-stage]")) {
        clearWidgetSelection(stage);
        syncRotateToolbar(root);
      }
    });

    /* Keyboard: [ ] rotate selected; Backspace / Delete removes */
    if (!root.__cognationWidgetKeyBound) {
      root.__cognationWidgetKeyBound = true;
      document.addEventListener("keydown", function (ev) {
        var t0 = ev.target;
        if (t0) {
          var tag0 = (t0.tagName || "").toUpperCase();
          if (tag0 === "INPUT" || tag0 === "TEXTAREA" || tag0 === "SELECT") return;
          if (t0.isContentEditable) return;
        }
        if (!ownerOnPublic()) return;
        if (ev.key === "[" || ev.key === "]") {
          var selRot = stage.querySelector(".is-widget-selected");
          if (!selRot || !stage.contains(selRot)) return;
          ev.preventDefault();
          rotateSelectedWidget(root, ev.key === "]" ? 15 : -15);
          return;
        }
        if (ev.key !== "Backspace" && ev.key !== "Delete") return;
        var selectedKey = stage.querySelector(".is-widget-selected");
        if (!selectedKey || !stage.contains(selectedKey)) return;
        ev.preventDefault();
        removeSelectedKeepingScroll();
      });
      /* One removal path for Backspace/Delete and the touch "Remove" button.
         Owner only, Public side only; never runs while typing (the key handler
         returns early for inputs and contenteditable). */
      var removeSelectedWidget = function () {
        if (!ownerOnPublic()) return;
        var selected = stage.querySelector(".is-widget-selected");
        if (!selected || !stage.contains(selected)) return;

        /* Individual friend pin */
        var friendId = selected.getAttribute("data-tower-friend-pin");
        if (friendId) {
          clearWidgetSelection(stage);
          var fp = TowerProfileStore.get();
          var savedFriendLayout =
            fp.friendPinLayout && fp.friendPinLayout[friendId]
              ? JSON.parse(JSON.stringify(fp.friendPinLayout[friendId]))
              : null;
          pushWidgetUndo({ type: "friend", id: friendId, layout: savedFriendLayout });
          if (!TowerProfileStore.removeTopFriend(friendId)) return;
          fp = TowerProfileStore.get();
          renderFriendsPicker(root, fp);
          renderFriendPins(root, fp);
          setProfileStatusSafe("Friend pin removed. Reset layout to restore.", false, true);
          return;
        }

        /* Individual badge pin */
        var badgeId = selected.getAttribute("data-tower-badge-pin");
        if (badgeId) {
          clearWidgetSelection(stage);
          pushWidgetUndo({ type: "badge", id: badgeId });
          setBadgeVisibility(root, badgeId, false);
          setProfileStatusSafe("Badge pin removed.", false, true);
          return;
        }

        /* Emoji stickers — drop from emojiStickers so removal survives reload */
        var emojiId = selected.getAttribute("data-tower-emoji");
        if (emojiId) {
          clearWidgetSelection(stage);
          syncRotateToolbar(root);
          var pEmoji = TowerProfileStore.get();
          if (!isTowerOwner(pEmoji)) return;
          var beforeEmoji = normalizeEmojiStickers(pEmoji.emojiStickers);
          var removedEmoji = null;
          var keptEmoji = [];
          beforeEmoji.forEach(function (item) {
            if (item.id === emojiId) removedEmoji = item;
            else keptEmoji.push(item);
          });
          pEmoji.emojiStickers = keptEmoji;
          if (pEmoji.widgetLayout && pEmoji.widgetLayout[emojiId]) {
            delete pEmoji.widgetLayout[emojiId];
          }
          pushWidgetUndo({
            type: "emoji",
            id: emojiId,
            item: removedEmoji,
            layout: removedEmoji
              ? {
                  x: parseFloat(selected.getAttribute("data-sticker-x") || "78"),
                  y: parseFloat(selected.getAttribute("data-sticker-y") || "12"),
                  z: parseInt(selected.getAttribute("data-sticker-z") || "24", 10),
                  tilt: parseFloat(selected.style.getPropertyValue("--sticker-tilt") || "0") || 0,
                }
              : null,
          });
          TowerProfileStore.save(pEmoji);
          renderEmojiStickers(root, TowerProfileStore.get());
          setProfileStatusSafe("Emoji removed.", false, true);
          return;
        }

        /* Quote / freeform stickers */
        var quoteId = selected.getAttribute("data-tower-quote-id");
        if (quoteId || selected.getAttribute("data-tower-widget") === "quote") {
          clearWidgetSelection(stage);
          var qText = (selected.textContent || "").trim();
          var qLayout = {
            x: parseFloat(selected.getAttribute("data-sticker-x") || "40"),
            y: parseFloat(selected.getAttribute("data-sticker-y") || "40"),
            z: parseInt(selected.getAttribute("data-sticker-z") || "8", 10),
            tilt: parseFloat(selected.style.getPropertyValue("--sticker-tilt") || "0") || 0,
            text: selected.getAttribute("data-quote-text") || qText,
          };
          pushWidgetUndo({ type: "quote", id: quoteId || selected.id, layout: qLayout });
          removeQuoteSticker(root, quoteId || selected.getAttribute("data-tower-quote-id"));
          setProfileStatusSafe("Quote removed.", false, true);
          return;
        }

        /* Scrapbook sticker widgets — every selectable widget (not only identity) */
        var id = selected.getAttribute("data-tower-widget");
        if (!id || id === "avatar" || id === "feed" || id === "messages") return;
        clearWidgetSelection(stage);
        syncRotateToolbar(root);
        /* Social link chip (the X button is gone): clear that link, same as the
           old X did, so it stays removed after reload. */
        /* Pay-links card holds several links: each is cleared in Edit profile. */
        if (id === PAY_LINKS_ID) {
          setProfileStatusSafe("Venmo, Pay for services and Buy ads links are set in Edit profile.", false);
          return;
        }
        var socialNet = socialNetIdFromWidget(id);
        if (socialNet) {
          removeSocialWidget(root, socialNet);
          setProfileStatusSafe((selected.getAttribute("data-sticker-label") || "Link") + " link removed. Add it again in Edit profile.", false, true);
          return;
        }
        var label = selected.getAttribute("data-sticker-label") || id;
        if (id === "polaroid") {
          pushWidgetUndo({ type: "shell", id: id, label: label });
          selected.hidden = true;
          selected.classList.add("is-widget-off");
          var pPol = TowerProfileStore.get();
          pPol.polaroidRemoved = true;
          TowerProfileStore.save(pPol);
          setProfileStatusSafe(label + " removed. Reset layout to restore.", false, true);
          return;
        }
        if (id === "instax") {
          /* Owner-only camera (#223): save "off" in the layout row so it stays
             removed after reload and in other browsers. Reset layout turns it back on. */
          pushWidgetUndo({ type: "instax", id: id, label: label });
          selected.hidden = true;
          selected.classList.add("is-widget-off");
          var pCam = TowerProfileStore.get();
          setInstaxSwitch(pCam, false);
          TowerProfileStore.save(pCam);
          setProfileStatusSafe("Camera removed. Reset layout to restore.", false, true);
          return;
        }
        if (id === "friends") return;
        if (PUBLIC_WIDGET_IDS.indexOf(id) >= 0) {
          pushWidgetUndo({ type: "widget", id: id, label: label });
          setPublicWidgetVisible(root, id, false);
        } else {
          /* Unknown/empty shell: hide + drop from layout so it cannot return */
          pushWidgetUndo({ type: "shell", id: id, label: label, html: selected.outerHTML });
          selected.hidden = true;
          selected.classList.add("is-widget-off");
          var pShell = TowerProfileStore.get();
          if (pShell.widgetLayout && pShell.widgetLayout[id]) {
            delete pShell.widgetLayout[id];
            TowerProfileStore.save(pShell);
          }
        }
        setProfileStatusSafe(
          hiddenWidgetRestorable(id) ? label + " removed. Show it again in Edit profile." : label + " removed.",
          false,
          true
        );
      };
      /* Remove keeps the page where it was (scroll position). */
      var removeSelectedKeepingScroll = function () {
        keepTowerScrollAround(root, removeSelectedWidget);
      };
      root.__cognationRemoveSelected = removeSelectedKeepingScroll;
      var removeBtn = root.querySelector("[data-tower-remove-selected]");
      if (removeBtn && !removeBtn.__cognationBound) {
        removeBtn.__cognationBound = true;
        removeBtn.addEventListener("click", function (ev) {
          ev.preventDefault();
          removeSelectedKeepingScroll();
          syncRotateToolbar(root);
        });
      }
    }

    /* Live Public widgets checkboxes */
    if (!root.__cognationPublicWidgetsBound) {
      root.__cognationPublicWidgetsBound = true;
      root.addEventListener("change", function (ev) {
        var cb = ev.target && ev.target.closest("[data-tower-public-widget]");
        if (!cb || !root.contains(cb)) return;
        var id = cb.getAttribute("data-tower-public-widget");
        if (!id) return;
        setPublicWidgetVisible(root, id, !!cb.checked);
      });
    }

    syncOwnerStickerHandles(root);
  }


  function initProfileEditDropdown(root) {
    var wrap = root.querySelector("[data-tower-profile-edit]");
    var btn = root.querySelector("[data-tower-edit-profile]");
    var panel = root.querySelector("[data-tower-profile-edit-panel]");
    if (!wrap || !btn || !panel || wrap.__cognationEditBound) return;
    wrap.__cognationEditBound = true;

    /* Native file dialogs can fire outside pointerdown/blur; closing the panel
       (display:none) cancels the picker before change. Track picking and hold open. */
    var pickingAvatarFile = false;
    var pickClearTimer = null;

    function setAvatarPicking(on) {
      pickingAvatarFile = !!on;
      root.__cognationAvatarPicking = pickingAvatarFile;
      if (pickClearTimer) {
        clearTimeout(pickClearTimer);
        pickClearTimer = null;
      }
    }

    function clearAvatarPickingSoon() {
      if (pickClearTimer) clearTimeout(pickClearTimer);
      pickClearTimer = setTimeout(function () {
        pickingAvatarFile = false;
        root.__cognationAvatarPicking = false;
        pickClearTimer = null;
      }, 400);
    }

    function bindAvatarPickGuard(input) {
      if (!input || input.__cognationPickGuardBound) return;
      input.__cognationPickGuardBound = true;
      input.addEventListener("click", function () {
        setAvatarPicking(true);
      });
      input.addEventListener("change", function () {
        setAvatarPicking(false);
      });
      input.addEventListener("cancel", function () {
        setAvatarPicking(false);
      });
    }

    root.querySelectorAll("[data-tower-avatar-file-panel], [data-tower-avatar-file]").forEach(bindAvatarPickGuard);

    var chooseBtn = root.querySelector("[data-tower-choose-avatar]");
    var panelFile = root.querySelector("[data-tower-avatar-file-panel]");
    if (chooseBtn && panelFile && !chooseBtn.__cognationChooseBound) {
      chooseBtn.__cognationChooseBound = true;
      chooseBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        setAvatarPicking(true);
        try {
          panelFile.click();
        } catch (errClick) {
          setAvatarPicking(false);
        }
      });
    }

    if (!root.__cognationAvatarPickFocusBound) {
      root.__cognationAvatarPickFocusBound = true;
      window.addEventListener("focus", function () {
        if (pickingAvatarFile || root.__cognationAvatarPicking) clearAvatarPickingSoon();
      });
    }

    /* The editor opens as a panel (website) or bottom sheet (phone) outside the
       avatar widget, so the widget keeps its size and spot and never covers
       its neighbours. It moves back into the widget when closed. */
    var panelHome = panel.parentNode;
    var panelNext = panel.nextSibling;
    /* Phone: a dim scrim behind the sheet; tapping it closes the editor. */
    var scrim = null;
    function showScrim(on) {
      if (on && !scrim) {
        scrim = document.createElement("div");
        scrim.className = "tower-profile-edit-scrim";
        scrim.setAttribute("data-tower-profile-edit-scrim", "");
        scrim.setAttribute("aria-hidden", "true");
        scrim.addEventListener("click", function () {
          setOpen(false);
        });
      }
      if (!scrim) return;
      if (on) {
        if (scrim.parentNode !== root) root.appendChild(scrim);
        scrim.hidden = false;
      } else {
        scrim.hidden = true;
      }
    }
    function mountPanelAsSheet() {
      showScrim(true);
      if (panel.parentNode !== root) root.appendChild(panel);
      panel.classList.add("is-sheet");
      alignPanelToPage();
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Edit profile");
    }
    /* Desktop: keep the panel 16px inside the page content's right edge (never off-screen). */
    function alignPanelToPage() {
      var edge = root.getBoundingClientRect().right;
      var vw = document.documentElement.clientWidth || window.innerWidth;
      var right = Math.max(16, Math.round(vw - Math.min(edge, vw) + 16));
      panel.style.setProperty("--tower-edit-right", right + "px");
    }
    window.addEventListener("resize", function () {
      if (panel.classList.contains("is-sheet")) alignPanelToPage();
    });
    function returnPanelHome() {
      showScrim(false);
      panel.classList.remove("is-sheet");
      panel.removeAttribute("role");
      panel.removeAttribute("aria-label");
      if (panelHome && panel.parentNode !== panelHome) {
        if (panelNext && panelNext.parentNode === panelHome) panelHome.insertBefore(panel, panelNext);
        else panelHome.appendChild(panel);
      }
    }
    var closeBtn = panel.querySelector("[data-tower-profile-edit-close]");
    if (closeBtn) {
      closeBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        setOpen(false);
        btn.focus();
      });
    }

    function setOpen(open) {
      if (!open && pickingAvatarFile) return;
      if (open) {
        mountPanelAsSheet();
        panel.hidden = false;
        wrap.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
        var avatarSticker = wrap.closest('[data-tower-widget="avatar"]');
        if (avatarSticker) avatarSticker.classList.add("is-edit-open");
        /* Never both: the Edit profile status line takes over from the stage notice. */
        try { clearStageRemovalNotice(root, true); } catch (eStage) {}
      } else {
        /* Closing without Save still commits typed social URLs so circle buttons stick. */
        try { flushSocialFieldsFromForm(root); } catch (eFlush) {}
        /* The one-time Pro "set up" notice is spent once Edit profile closes. */
        if (root.__cognationProSetupJustCreated) {
          root.__cognationProSetupJustCreated = false;
          try { syncAddProfileUi(root); } catch (eSetup) {}
        }
        /* The Show hidden widgets notice is spent once Edit profile closes. */
        try { clearHiddenWidgetNotice(root); } catch (eNotice) {}
        panel.hidden = true;
        returnPanelHome();
        wrap.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
        var avatarStickerClose = wrap.closest('[data-tower-widget="avatar"]');
        if (avatarStickerClose) avatarStickerClose.classList.remove("is-edit-open");
      }
    }

    function isOpen() {
      return !panel.hidden;
    }

    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (!isTowerOwner(TowerProfileStore.get())) {
        setOpen(false);
        return;
      }
      setOpen(!isOpen());
    });

    /* Keep pointer events inside the editor from starting sticker drags or closing the menu */
    panel.addEventListener("pointerdown", function (ev) {
      ev.stopPropagation();
    });
    panel.addEventListener("click", function (ev) {
      ev.stopPropagation();
    });

    document.addEventListener("pointerdown", function (ev) {
      if (!isOpen()) return;
      if (pickingAvatarFile || root.__cognationAvatarPicking) return;
      if (wrap.contains(ev.target)) return;
      /* Avatar overlay upload sits outside the edit wrap but should not dismiss while picking */
      if (ev.target.closest && ev.target.closest(".tower-avatar-upload, [data-tower-avatar-file]")) {
        setAvatarPicking(true);
        return;
      }
      setOpen(false);
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && isOpen() && !pickingAvatarFile) {
        setOpen(false);
        btn.focus();
      }
    });
  }

  function initFramePicker(root) {
    var chips = root.querySelector("[data-tower-frame-chips]");
    var saveBtn = root.querySelector("[data-tower-save-frame]");
    var colorChips = root.querySelector("[data-tower-cowboy-color-chips]");
    if (!chips || chips.__cognationFramesBound) return;
    chips.__cognationFramesBound = true;
    chips.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-frame-id]");
      if (!btn || !chips.contains(btn)) return;
      var id = normalizeFrameId(btn.getAttribute("data-frame-id"));
      var colorIn = root.querySelector("[data-tower-cowboy-color-input]");
      var color = colorIn ? colorIn.value : "tan";
      /* preview only — persist when Save frame is clicked */
      applyAvatarFrame(root, id, color);
      var input = root.querySelector("[data-tower-avatar-frame-input]");
      if (input) input.value = id;
      setProfileStatusOn(root, "Frame preview — click Save frame to keep it.", false);
    });
    if (colorChips && !colorChips.__cognationCowboyColorBound) {
      colorChips.__cognationCowboyColorBound = true;
      colorChips.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-cowboy-color]");
        if (!btn || !colorChips.contains(btn)) return;
        var color = normalizeCowboyHatColor(btn.getAttribute("data-cowboy-color"));
        applyCowboyHatColor(root, color);
        var frameIn = root.querySelector("[data-tower-avatar-frame-input]");
        var frameId = normalizeFrameId(frameIn ? frameIn.value : "none");
        if (frameId !== "cowboy-hat") {
          applyAvatarFrame(root, "cowboy-hat", color);
        }
        setProfileStatusOn(root, "Hat color preview — click Save frame to keep it.", false);
      });
    }
    if (saveBtn && !saveBtn.__cognationFrameSaveBound) {
      saveBtn.__cognationFrameSaveBound = true;
      saveBtn.addEventListener("click", function () {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        var input = root.querySelector("[data-tower-avatar-frame-input]");
        var id = normalizeFrameId(input ? input.value : "none");
        var colorIn = root.querySelector("[data-tower-cowboy-color-input]");
        var color = normalizeCowboyHatColor(colorIn ? colorIn.value : "tan");
        applyAvatarFrame(root, id, color);
        var p = TowerProfileStore.get();
        p.avatarFrame = id;
        p.cowboyHatColor = color;
        TowerProfileStore.save(p);
        setProfileStatusOn(root, id === "cowboy-hat" ? "Cowboy hat + color saved." : "Frame saved.", false);
      });
    }
  }

  function initOrnamentPicker(root) {
    var chips = root.querySelector("[data-tower-ornament-chips]");
    var posChips = root.querySelector("[data-tower-ornament-pos-chips]");
    if (chips && !chips.__cognationOrnamentsBound) {
      chips.__cognationOrnamentsBound = true;
      chips.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-ornament-id]");
        if (!btn || !chips.contains(btn)) return;
        var id = normalizeOrnamentId(btn.getAttribute("data-ornament-id"));
        var p = TowerProfileStore.get();
        var pos = normalizeOrnamentPos(p.avatarOrnamentPos || "above");
        applyAvatarOrnament(root, id, pos);
        p.avatarOrnament = id;
        p.avatarOrnamentPos = pos;
        TowerProfileStore.save(p);
      });
    }
    if (posChips && !posChips.__cognationOrnamentPosBound) {
      posChips.__cognationOrnamentPosBound = true;
      posChips.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-ornament-pos]");
        if (!btn || !posChips.contains(btn) || btn.disabled) return;
        var pos = normalizeOrnamentPos(btn.getAttribute("data-ornament-pos"));
        var p = TowerProfileStore.get();
        var id = normalizeOrnamentId(p.avatarOrnament || "none");
        if (id === "none") return;
        applyAvatarOrnament(root, id, pos);
        p.avatarOrnament = id;
        p.avatarOrnamentPos = pos;
        TowerProfileStore.save(p);
      });
    }
  }

  function syncPublicLookForm(root, p) {
    if (!root || !p) return;
    var mode = normalizeBackgroundMode(p.backgroundMode, p.backgroundCollage, p.backgroundHtml);
    var modeSel = root.querySelector("select[data-tower-bg-mode]");
    if (modeSel && document.activeElement !== modeSel) modeSel.value = mode;
    var textIn = root.querySelector("[data-tower-public-text]");
    if (textIn && document.activeElement !== textIn) {
      textIn.value = normalizePublicThemeColor(p.publicTextColor, "#4a2c3a");
    }
    var btnIn = root.querySelector("[data-tower-public-btn]");
    if (btnIn && document.activeElement !== btnIn) {
      btnIn.value = normalizePublicThemeColor(p.publicButtonColor, "#f4a4c4");
    }
    var htmlIn = root.querySelector("[data-tower-bg-html]");
    if (htmlIn && document.activeElement !== htmlIn) {
      htmlIn.value = typeof p.backgroundHtml === "string" ? p.backgroundHtml : "";
    }
    populateBgModeOptions(root, mode, { reveal: false });
  }

  /** Show only the selected mode's controls inside data-tower-bg-options. */
  function populateBgModeOptions(root, mode, opts) {
    opts = opts || {};
    var options = root.querySelector("[data-tower-bg-options]");
    if (!options) return;
    mode = normalizeBackgroundMode(mode, null, null);
    if (opts.reveal) {
      options.hidden = false;
    }
    options.querySelectorAll("[data-tower-bg-mode-panel]").forEach(function (panel) {
      var id = panel.getAttribute("data-tower-bg-mode-panel");
      panel.hidden = id !== mode;
    });
    var editBtn = root.querySelector("[data-tower-public-look-edit-bg]");
    if (editBtn) {
      editBtn.hidden = !options.hidden;
    }
  }

  function hideBgOptionsAfterSave(root) {
    var options = root.querySelector("[data-tower-bg-options]");
    if (options) options.hidden = true;
    var panel = root.querySelector("[data-tower-public-look]");
    if (panel) panel.open = false;
    var editBtn = root.querySelector("[data-tower-public-look-edit-bg]");
    if (editBtn) editBtn.hidden = false;
  }

  function showBgOptions(root) {
    var options = root.querySelector("[data-tower-bg-options]");
    if (options) options.hidden = false;
    var modeSel = root.querySelector("select[data-tower-bg-mode]");
    var mode = modeSel ? modeSel.value : "solid";
    populateBgModeOptions(root, mode, { reveal: true });
    var panel = root.querySelector("[data-tower-public-look]");
    if (panel) panel.open = true;
    var editBtn = root.querySelector("[data-tower-public-look-edit-bg]");
    if (editBtn) editBtn.hidden = true;
  }

  function readPublicLookFromForm(root) {
    var fontIn = root.querySelector("[data-tower-font]");
    var feedBgIn = root.querySelector("[data-tower-feed-bg]");
    var textIn = root.querySelector("[data-tower-public-text]");
    var btnIn = root.querySelector("[data-tower-public-btn]");
    var modeSel = root.querySelector("select[data-tower-bg-mode]");
    var htmlIn = root.querySelector("[data-tower-bg-html]");
    var mode = normalizeBackgroundMode(modeSel ? modeSel.value : "solid", null, null);
    var out = {
      towerFont: normalizeTowerFont(fontIn ? fontIn.value : "georgia"),
      feedBackgroundColor: normalizeFeedBgColor(
        feedBgIn ? feedBgIn.value : "#fff5f9"
      ),
      publicTextColor: normalizePublicThemeColor(
        textIn ? textIn.value : "#4a2c3a",
        "#4a2c3a"
      ),
      publicButtonColor: normalizePublicThemeColor(
        btnIn ? btnIn.value : "#f4a4c4",
        "#f4a4c4"
      ),
      backgroundMode: mode,
    };
    if (mode === "collage") {
      out.backgroundCollage = readCollageFromForm(root);
    }
    if (mode === "html") {
      out.backgroundHtml = sanitizeProfileHtml(
        htmlIn ? String(htmlIn.value || "").slice(0, 8000) : ""
      );
    }
    return out;
  }

  function initPublicLookControls(root) {
    if (!root || root.__cognationPublicLookBound) return;
    root.__cognationPublicLookBound = true;
    var modeSel = root.querySelector("select[data-tower-bg-mode]");
    var saveBtn = root.querySelector("[data-tower-public-look-save]");
    var status = root.querySelector("[data-tower-public-look-status]");
    var editBgBtn = root.querySelector("[data-tower-public-look-edit-bg]");
    var htmlFile = root.querySelector("[data-tower-bg-html-file]");
    var bgImageFile = root.querySelector("[data-tower-bg-image]");

    function setStatus(msg, isError) {
      if (!status) return;
      status.hidden = !msg;
      status.textContent = msg || "";
      status.classList.toggle("is-error", !!isError);
    }

    function livePreview() {
      var cur = TowerProfileStore.get();
      var look = readPublicLookFromForm(root);
      var preview = Object.assign({}, cur, look);
      /* Keep stored collage/html when previewing other modes so form fields stay. */
      if (look.backgroundMode !== "collage") {
        preview.backgroundCollage = cur.backgroundCollage;
      }
      if (look.backgroundMode !== "html") {
        preview.backgroundHtml = cur.backgroundHtml;
      } else if (look.backgroundHtml != null) {
        preview.backgroundHtml = look.backgroundHtml;
      }
      applyTowerTheme(root, preview);
    }

    if (modeSel) {
      modeSel.addEventListener("change", function () {
        populateBgModeOptions(root, modeSel.value, { reveal: true });
        if (modeSel.value === "collage") {
          syncCollageForm(root, TowerProfileStore.get());
        }
        livePreview();
      });
    }

    ["data-tower-font", "data-tower-feed-bg", "data-tower-public-text", "data-tower-public-btn", "data-tower-bg-html"].forEach(function (sel) {
      var el = root.querySelector("[" + sel + "]");
      if (!el) return;
      el.addEventListener("input", livePreview);
      el.addEventListener("change", livePreview);
    });

    function loadBackgroundImageFile(file) {
      if (!isTowerOwner(TowerProfileStore.get())) return;
      if (!file) return;
      if (!/^image\//.test(file.type)) {
        setStatus("Choose an image file.", true);
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var maxEdge = 1400;
          var scale = Math.min(1, maxEdge / Math.max(img.width || 1, img.height || 1));
          var cw = Math.max(1, Math.round((img.width || 1) * scale));
          var ch = Math.max(1, Math.round((img.height || 1) * scale));
          var canvas = document.createElement("canvas");
          canvas.width = cw;
          canvas.height = ch;
          var ctx = canvas.getContext("2d");
          if (!ctx) {
            setStatus("Could not read that image.", true);
            return;
          }
          ctx.drawImage(img, 0, 0, cw, ch);
          var dataUrl = "";
          try {
            dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          } catch (eUrl) {
            dataUrl = String(reader.result || "");
          }
          if (dataUrl.indexOf("data:image/") !== 0) {
            setStatus("Could not read that image.", true);
            return;
          }
          var pImg = TowerProfileStore.get();
          pImg.backgroundImageDataUrl = dataUrl;
          if (!TowerProfileStore.save(pImg)) {
            setStatus("Could not save that background (storage full). Try a smaller image.", true);
            return;
          }
          applyTowerTheme(root, pImg);
          var hint = root.querySelector("[data-tower-bg-image-status]");
          if (hint) hint.textContent = "Background image set.";
          setStatus("Page background updated.", false);
        };
        img.onerror = function () {
          setStatus("Could not read that image.", true);
        };
        img.src = String(reader.result || "");
      };
      reader.onerror = function () {
        setStatus("Could not read that image.", true);
      };
      reader.readAsDataURL(file);
    }

    if (bgImageFile && !bgImageFile.__cognationBgImageBound) {
      bgImageFile.__cognationBgImageBound = true;
      bgImageFile.addEventListener("change", function () {
        var file = bgImageFile.files && bgImageFile.files[0];
        loadBackgroundImageFile(file);
        try { bgImageFile.value = ""; } catch (eClrBg) {}
      });
    }

    if (htmlFile && !htmlFile.__cognationBgHtmlFileBound) {
      htmlFile.__cognationBgHtmlFileBound = true;
      htmlFile.addEventListener("change", function () {
        var file = htmlFile.files && htmlFile.files[0];
        if (!file) return;
        var name = String(file.name || "").toLowerCase();
        var okType =
          /text\/(html|plain)/.test(file.type) ||
          /\.(html?|txt)$/.test(name);
        if (!okType) {
          setStatus("Choose a .html or .txt file.", true);
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var htmlIn = root.querySelector("[data-tower-bg-html]");
          if (htmlIn) {
            htmlIn.value = String(reader.result || "").slice(0, 8000);
            livePreview();
          }
          setStatus("Background HTML loaded from file.", false);
        };
        reader.onerror = function () {
          setStatus("Could not read that file.", true);
        };
        reader.readAsText(file);
        try { htmlFile.value = ""; } catch (eClr) {}
      });
    }

    if (editBgBtn) {
      editBgBtn.addEventListener("click", function () {
        showBgOptions(root);
      });
    }

    var previewBtn = root.querySelector("[data-tower-public-look-preview]");
    if (previewBtn) {
      previewBtn.addEventListener("click", function () {
        livePreview();
        setStatus("Previewing — Save public look to keep.", false);
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        var p = TowerProfileStore.get();
        var look = readPublicLookFromForm(root);
        if (root.querySelector("[data-tower-font]")) p.towerFont = look.towerFont;
        if (root.querySelector("[data-tower-feed-bg]")) p.feedBackgroundColor = look.feedBackgroundColor;
        p.publicTextColor = look.publicTextColor;
        p.publicButtonColor = look.publicButtonColor;
        if (root.querySelector("select[data-tower-bg-mode]")) {
          p.backgroundMode = look.backgroundMode;
          if (look.backgroundMode === "collage") {
            p.backgroundCollage = look.backgroundCollage || readCollageFromForm(root);
          }
          if (look.backgroundMode === "html") {
            p.backgroundHtml = look.backgroundHtml || "";
          }
        }
        if (!TowerProfileStore.save(p)) {
          setStatus("Could not save public look (storage full or blocked).", true);
          return;
        }
        applyTowerTheme(root, p);
        syncCollageForm(root, p);
        hideBgOptionsAfterSave(root);
        setStatus("Public profile look saved.", false);
      });
    }

    /* Initial: show mode panels; options visible until first save this session */
    var cur = TowerProfileStore.get();
    populateBgModeOptions(root, cur.backgroundMode, { reveal: true });
    var editBtnInit = root.querySelector("[data-tower-public-look-edit-bg]");
    if (editBtnInit) editBtnInit.hidden = true;
  }

  function initCollageControls(root) {
    var layoutSel = root.querySelector("[data-tower-collage-layout]");
    var applyBtn = root.querySelector("[data-tower-collage-apply]");
    var demoBtn = root.querySelector("[data-tower-collage-demo]");
    if (layoutSel && !layoutSel.__bound) {
      layoutSel.__bound = true;
      layoutSel.addEventListener("change", function () {
        var p = TowerProfileStore.get();
        syncCollageForm(root, {
          backgroundCollage: {
            layoutId: layoutSel.value,
            cells: (p.backgroundCollage && p.backgroundCollage.cells) || [],
          },
        });
      });
    }
    if (demoBtn && !demoBtn.__bound) {
      demoBtn.__bound = true;
      demoBtn.addEventListener("click", function () {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        var layoutSel2 = root.querySelector("[data-tower-collage-layout]");
        var layoutId = layoutSel2 ? layoutSel2.value : "grid-3x3";
        if (layoutId === "none") layoutId = "grid-3x3";
        if (layoutSel2) layoutSel2.value = layoutId;
        var p = TowerProfileStore.get();
        p.backgroundMode = "collage";
        p.backgroundCollage = {
          layoutId: layoutId,
          cells: demoCollageCells(collageCellCount(layoutId)),
        };
        TowerProfileStore.save(p);
        var modeSel3 = root.querySelector("select[data-tower-bg-mode]");
        if (modeSel3) modeSel3.value = "collage";
        syncCollageForm(root, p);
        applyTowerTheme(root, p);
      });
    }
    if (applyBtn && !applyBtn.__bound) {
      applyBtn.__bound = true;
      applyBtn.addEventListener("click", function () {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        var p = TowerProfileStore.get();
        p.backgroundMode = "collage";
        p.backgroundCollage = readCollageFromForm(root);
        TowerProfileStore.save(p);
        var modeSel = root.querySelector("select[data-tower-bg-mode]");
        if (modeSel) modeSel.value = "collage";
        applyTowerTheme(root, p);
        var lookStatus = root.querySelector("[data-tower-public-look-status]");
        if (lookStatus) {
          lookStatus.hidden = false;
          lookStatus.textContent = "Collage background applied (Save public look to keep + collapse).";
          lookStatus.classList.remove("is-error");
        }
      });
    }
  }


  function renderProfileChrome(root) {
    var p = TowerProfileStore.get();
    var nameEl = root.querySelector("[data-tower-profile-name]");
    var avatar = root.querySelector("[data-tower-avatar]");
    var nameInput = root.querySelector("#tower-display-name");
    var htmlInput = root.querySelector("[data-tower-profile-html]");
    var preview = root.querySelector("[data-tower-html-preview]");
    var loading = !!p._loading;
    if (nameEl && document.activeElement !== nameEl) {
      /* Placeholder: the slot keeps the default label's width and height, but
         its text is hidden (css .is-loading) so no name shows. */
      nameEl.classList.toggle("is-loading", loading);
      nameEl.textContent = loading ? "You" : publicProfileName(p) || "You";
    }
    applyDisplayNameSize(root, p.displayNameSize || 28);
    var mutual = root.querySelector("[data-tower-mutual-friends]");
    if (mutual) {
      var cognationFriend = mutual.parentNode && mutual.parentNode.querySelector("[data-cognation-friend]");
      if (profileIsProfessional(p)) {
        mutual.hidden = !houseProfessional(p);
        if (houseProfessional(p)) mutual.textContent = "Following";
        if (cognationFriend) cognationFriend.hidden = true;
      } else {
        mutual.hidden = false;
        if (housePersonal(p)) mutual.textContent = "400 friends";
        if (!cognationFriend && mutual.parentNode) {
          cognationFriend = document.createElement("p");
          cognationFriend.className = "tower-mutual-friends";
          cognationFriend.setAttribute("data-cognation-friend", "");
          mutual.parentNode.insertBefore(cognationFriend, mutual.nextSibling);
        }
        if (cognationFriend) {
          cognationFriend.hidden = false;
          cognationFriend.textContent = "Cognation";
        }
      }
    }
    initDisplayNameResize(root);
    var handleBadge = root.querySelector("[data-tower-handle-badge]");
    var handleVal = normalizeHandle(p.handle || "");
    if (handleBadge && houseProfessional(p) && !isTowerOwner(p)) {
      handleBadge.hidden = true;
      handleBadge.textContent = "";
    } else if (handleBadge && document.activeElement !== handleBadge) {
      var ownerEditing = !loading && isTowerOwner(p) && root.getAttribute("data-tower-side") === "public";
      handleBadge.classList.toggle("is-owner-editable", ownerEditing);
      if (handleVal) {
        handleBadge.hidden = false;
        handleBadge.textContent = "@" + handleVal;
      } else if (ownerEditing) {
        handleBadge.hidden = false;
        handleBadge.textContent = "@";
      } else {
        handleBadge.hidden = true;
        handleBadge.textContent = "";
        handleBadge.classList.remove("is-owner-editable");
      }
    }
    var handleInput = root.querySelector("[data-tower-handle]");
    if (handleInput && document.activeElement !== handleInput) {
      handleInput.value = handleVal;
    }
    var profileRoot = root.querySelector("[data-tower-profile]");
    if (profileRoot) {
      var slug = profilePublicSlug(p);
      profileRoot.id = "tower-profile-" + slug;
      profileRoot.setAttribute("data-tower-handle", handleVal || "");
      profileRoot.setAttribute("data-author-slug", slug);
    }
    if (nameInput && document.activeElement !== nameInput) nameInput.value = p.displayName || "";
    if (htmlInput && document.activeElement !== htmlInput) htmlInput.value = p.customHtml || "";
    var sloganInput = root.querySelector("[data-tower-slogan]");
    if (sloganInput && document.activeElement !== sloganInput) sloganInput.value = p.slogan || "";
    var sloganDisplay = root.querySelector("[data-tower-slogan-display]");
    if (sloganDisplay) sloganDisplay.textContent = (p.slogan || "").trim();

    if (avatar) avatar.classList.toggle("is-loading", loading);
    if (avatar) {
      var avatarUrl = p.avatarDataUrl && String(p.avatarDataUrl).indexOf("data:image/") === 0 ? p.avatarDataUrl : "";
      var avatarPhoto = avatar.querySelector("[data-tower-avatar-photo]");
      if (avatarUrl) {
        if (!avatarPhoto || avatarPhoto.getAttribute("src") !== avatarUrl) {
          avatar.textContent = "";
          avatarPhoto = document.createElement("img");
          avatarPhoto.className = "tower-avatar-photo";
          avatarPhoto.alt = "";
          avatarPhoto.setAttribute("data-tower-avatar-photo", "");
          avatarPhoto.src = avatarUrl;
          avatar.appendChild(avatarPhoto);
        }
        avatar.style.setProperty("background-image", 'url("' + avatarUrl.replace(/"/g, "") + '")', "important");
        avatar.style.backgroundSize = "cover";
        avatar.style.backgroundPosition = "center";
      } else {
        avatar.style.removeProperty("background-image");
        if (avatarPhoto) avatarPhoto.remove();
        avatar.textContent = loading ? "" : initials(publicProfileName(p));
      }
    }
    var primaryPhoto = root.querySelector('[data-tower-widget="polaroid"] [data-tower-polaroid-photo]');
    if (primaryPhoto && document.activeElement !== primaryPhoto) {
      paintPolaroidPhoto(primaryPhoto, "");
    }
    var bgHint = root.querySelector("[data-tower-bg-image-status]");
    if (bgHint && !(p.backgroundImageDataUrl && document.activeElement && document.activeElement.matches && document.activeElement.matches("[data-tower-bg-image]"))) {
      bgHint.textContent = p.backgroundImageDataUrl
        ? "Background image set."
        : "Upload an image to use as the page background.";
    }
    applyAvatarFrame(root, p.avatarFrame || "none", p.cowboyHatColor || "tan");
    renderProfessionalFollowers(root);
    applyAvatarOrnament(root, p.avatarOrnament || "none", p.avatarOrnamentPos || "above");
    if (preview) {
      preview.innerHTML = sanitizeProfileHtml(p.customHtml || "");
    }
    var publicHtml = root.querySelector("[data-tower-html-public]");
    if (publicHtml) {
      publicHtml.innerHTML = sanitizeProfileHtml(p.customHtml || "");
    }
    /* Social chips must exist before spawn packs __socials__ rows. */
    renderSocialLinks(root, p);
    applyWidgetLayout(root, p);
    applyPublicWidgets(root, p);
    syncPublicWidgetsForm(root, p);
    syncOwnerStickerHandles(root);
    renderQuoteStickers(root, p);
    initAddWidgetUi(root);
    try {
      ensureResizeHandle(root.querySelector('[data-tower-widget="music"]'), "MP3 player");
      ensureResizeHandle(root.querySelector('[data-tower-widget="calendar"]'), "Calendar");
    } catch (eRh) {}
    initWidgetResize(root);
    syncCollageForm(root, p);
    syncPublicLookForm(root, p);
    var countSel = root.querySelector("[data-tower-friends-count]");
    if (countSel) countSel.value = String(p.friendsDisplayCount || 3);
    renderFriendsPicker(root, p);
    applyPublicWidgets(root, p);
    syncOwnerStickerHandles(root);

    var titleIn = root.querySelector("[data-tower-music-title]");
    var artistIn = root.querySelector("[data-tower-music-artist]");
    var urlIn = root.querySelector("[data-tower-music-url]");
    var enIn = root.querySelector("[data-tower-music-enable]");
    var skinIn = root.querySelector("[data-tower-music-skin]");
    if (titleIn && document.activeElement !== titleIn) titleIn.value = p.musicTitle || "";
    if (artistIn && document.activeElement !== artistIn) artistIn.value = p.musicArtist || "";
    if (urlIn && document.activeElement !== urlIn) urlIn.value = p.musicUrl || "";
    if (enIn) enIn.checked = p.musicEnabled !== false;
    if (skinIn) skinIn.value = visibleMusicSkin(p.musicSkin || "classic");
    initTowerMusic(root, p);

    var videoUrlIn = root.querySelector("[data-tower-video-url]");
    var videoTitleIn = root.querySelector("[data-tower-video-title]");
    var videoEnIn = root.querySelector("[data-tower-video-enable]");
    if (videoUrlIn && document.activeElement !== videoUrlIn) videoUrlIn.value = p.videoUrl || "";
    if (videoTitleIn && document.activeElement !== videoTitleIn) videoTitleIn.value = p.videoTitle || "";
    if (videoEnIn) videoEnIn.checked = p.videoEnabled !== false;
    initTowerVideo(root, p);

    renderAwardedBadgeShelf(root, p);
    syncBadgeVisibilityUi(root, p);
    applyAvatarFrameScale(root, p.avatarFrameScale || 1);
    initAvatarFrameResize(root);
    initDisplayNameResize(root);
    applyTowerTheme(root, p);
    applyPrivateFeedTheme(root, p.privateFeedTheme);
    syncPublicUrlFields(root, p);
    root.setAttribute("data-view-kind", profileIsProfessional(p) ? "professional" : "personal");
    var followBtn = root.querySelector("[data-tower-follow]");
    var addFriendsBtn = root.querySelector("[data-tower-add-friends]");
    if (profileIsProfessional(p)) {
      if (followBtn && followBtn.textContent !== "Following") followBtn.textContent = "+ follow";
      if (followBtn) followBtn.setAttribute("aria-label", "Follow this professional page");
    } else {
      if (followBtn && (followBtn.textContent === "Follow" || followBtn.textContent === "+ follow" || followBtn.textContent === "friend")) {
        followBtn.textContent = "+ friend";
        followBtn.setAttribute("aria-label", "Add this person as a friend");
      }
    }
    /* Owner pill under the photo: "Find friends" / "Find people" on your own Tower. */
    if (addFriendsBtn) syncOwnerPeoplePill(root, p, isTowerOwner(p));
    try { syncProfileKindToggle(root); } catch (eKind) {}
    try { syncAddProfileUi(root); } catch (eAdd) {}
    try { syncRotateToolbar(root); } catch (eRot) {}
    try { refreshTowerCalendars(root); } catch (eCal) {}
    try { renderGoingLiveWidget(root); } catch (eLive) {}
    try { syncViewerMutateUi(root); } catch (eMut2) {}
    try { ensurePersonalPolaroid(root, p); } catch (ePol) {}
  }

  function submitSignalEvent(body, when, what) {
    var text = String(body || "");
    if (!/\S/.test(text)) return Promise.resolve(false);
    var attachments = [{ kind: "event", label: String(when || "") + "|" + String(what || "").slice(0, 120) }];
    if (usingRemoteSocial()) {
      var social = remoteSocial();
      if (!social || typeof social.createTowerPost !== "function") return Promise.resolve(false);
      var asId = "";
      try {
        if (window.CognationSignalPostAs && typeof window.CognationSignalPostAs.currentAuthorProfileId === "function") {
          asId = window.CognationSignalPostAs.currentAuthorProfileId() || "";
        }
      } catch (eAs) {}
      return social.createTowerPost({ body: text, attachments: attachments, asProfileId: asId }).then(function () {
        return true;
      }, function () { return false; });
    }
    var added = TowerStore.add({
      authorName: postAuthorFromProfile(TowerProfileStore.get()),
      body: text,
      attachments: attachments,
    });
    return Promise.resolve(!!(added && added.ok));
  }

  function initGoingLive(root) {
    if (!root || root.__cognationGoingLiveBound) return;
    root.__cognationGoingLiveBound = true;
    var postBtn = towerFeedQuery(root, "[data-tower-event-post]");
    if (postBtn) {
      postBtn.addEventListener("click", function () {
        var box = postBtn.closest("[data-tower-event-fields]") || document;
        var whenIn = box.querySelector("[data-tower-event-when]");
        var whereIn = box.querySelector("[data-tower-event-where]");
        var whatIn = box.querySelector("[data-tower-event-what]");
        var status = box.querySelector("[data-tower-event-status]");
        function say(msg, isError) {
          if (!status) return;
          status.hidden = !msg;
          status.textContent = msg || "";
          status.classList.toggle("is-error", !!isError);
        }
        var when = readEventWhen(whenIn);
        var what = whatIn ? String(whatIn.value || "").trim() : "";
        var who = TowerProfileStore.get() || {};
        var where = (who.displayName || who.handle || "Host") + "\u2019s Tower page";
        if (!when || !what) {
          say("Add when and what.", true);
          return;
        }
        var bodyEl = document.getElementById("tower-body");
        var text = bodyEl ? bodyEl.value : "";
        /* #addevent stays in the signal text: that tag is the invite. */
        if (/(^|[^A-Za-z0-9_])#addevent\b/i.test(text)) {
          submitSignalEvent(text, when, what).then(function (ok) {
            if (!ok) { say("Could not post that event.", true); return; }
            if (whenIn) whenIn.value = "";
            if (whereIn) whereIn.value = "";
            if (whatIn) whatIn.value = "";
            if (bodyEl) bodyEl.value = "";
            var dropInvite = box.closest("[data-tower-event-dropdown]");
            if (dropInvite) dropInvite.open = false;
            say("", false);
            renderFeed(root);
          });
          return;
        }
        var live = normalizeGoingLive({ when: when, where: where, what: what });
        if (!live || !publishGoingLive(live)) {
          say("Could not post that event.", true);
          return;
        }
        if (whenIn) whenIn.value = "";
        if (whereIn) whereIn.value = "";
        if (whatIn) whatIn.value = "";
        var drop = box.closest("[data-tower-event-dropdown]");
        if (drop) drop.open = false;
        say("Posted on your personal and professional pages.", false);
        renderGoingLiveWidget(root);
        refreshTowerCalendars(root);
      });
    }
    root.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest("[data-going-live-edit]")) {
        var sticker = root.querySelector('[data-tower-widget="going-live"]');
        if (!sticker || !isTowerOwner(TowerProfileStore.get())) return;
        sticker.setAttribute("data-editing", "true");
        renderGoingLiveWidget(root);
        return;
      }
      if (t.closest("[data-going-live-cancel]")) {
        var stickerCancel = root.querySelector('[data-tower-widget="going-live"]');
        if (stickerCancel) stickerCancel.removeAttribute("data-editing");
        renderGoingLiveWidget(root);
      }
    });
    root.addEventListener("submit", function (ev) {
      var form = ev.target && ev.target.closest ? ev.target.closest("[data-tower-going-live-edit]") : null;
      if (!form || !root.contains(form)) return;
      ev.preventDefault();
      var whenIn = form.querySelector("[data-going-live-when]");
      var whereIn = form.querySelector("[data-going-live-where]");
      var whatIn = form.querySelector("[data-going-live-what]");
      var live = normalizeGoingLive({
        when: whenIn ? whenIn.value : "",
        where: whereIn ? whereIn.value : "",
        what: whatIn ? whatIn.value : "",
      });
      if (!live) return;
      publishGoingLive(live);
      var sticker = root.querySelector('[data-tower-widget="going-live"]');
      if (sticker) sticker.removeAttribute("data-editing");
      renderGoingLiveWidget(root);
      refreshTowerCalendars(root);
    });
  }


  /* Top friends / Badges / Calendar densify: no disclosure chrome; stay open. */
  function initDensifySections(root) {
    if (!root) return;
    root.querySelectorAll("details.tower-densify-section").forEach(function (el) {
      el.open = true;
      var summary = el.querySelector(":scope > summary");
      if (!summary || summary.dataset.towerDensifyBound === "1") return;
      summary.dataset.towerDensifyBound = "1";
      summary.addEventListener("click", function (ev) {
        ev.preventDefault();
        el.open = true;
      });
    });
  }

  function initTower(root) {
    if (!root) return;
    var form = towerFeedQuery(root, "[data-tower-compose]");
    var bodyInput = towerFeedQuery(root, "#tower-body");
    var fileInput = towerFeedQuery(root, "#tower-files");
    var kindSelect = towerFeedQuery(root, "#tower-attach-kind");
    var status = towerFeedQuery(root, "[data-tower-status]");

    function setStatus(msg, isError) {
      if (!status) return;
      if (!msg) {
        status.hidden = true;
        status.textContent = "";
        return;
      }
      status.hidden = false;
      status.textContent = msg;
      status.classList.toggle("is-error", !!isError);
    }

    var postSubmitBtn = form && form.querySelector ? form.querySelector("[data-tower-post-submit]") : null;
    function setPostInFlight(on) {
      if (form) form.__postInFlight = !!on;
      if (!postSubmitBtn) return;
      postSubmitBtn.disabled = !!on;
      if (on) postSubmitBtn.setAttribute("aria-busy", "true");
      else postSubmitBtn.removeAttribute("aria-busy");
    }

    renderFeed(root);
    renderProfileChrome(root);
    initFramePicker(root);
    initAvatarFrameResize(root);
    initDisplayNameResize(root);
    initOrnamentPicker(root);
    initScrapbookStickers(root);
    initEmojiWidgets(root);
    initPolaroidResize(root);
    initYoutubeResize(root);
    initInlineProfileEdits(root);
    initCollageControls(root);
    initPublicLookControls(root);
    initProfileEditDropdown(root);
    initTowerSideToggle(root);
    initPrivateFeedThemeControls(root);
    initPublicUrlCopy(root);
    initRotateToolbar(root);
    initProfileKindToggle(root);
    initAddProfile(root);
    initFriendsBrowse(root);
    initProfessionalFollowers(root);
    initDensifySections(root);
    initTowerCalendar(root);
    initGoingLive(root);
    bootMilestoneApply(root);

    var profileForm = root.querySelector("[data-tower-profile-form]");
    var avatarFile = root.querySelector("[data-tower-avatar-file]");

    function setProfileStatus(msg, isError) {
      showStatusPopup(msg, isError);
    }

    if (profileForm) {
      profileForm.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!isTowerOwner(TowerProfileStore.get())) return;
        var p = TowerProfileStore.get();
        var nameInput = root.querySelector("#tower-display-name");
        var htmlInput = root.querySelector("[data-tower-profile-html]");
        p.displayName = nameInput ? nameInput.value.trim().slice(0, 80) || "You" : p.displayName;
        var nameSizeIn = root.querySelector("[data-tower-name-size]");
        p.displayNameSize = normalizeDisplayNameSize(
          nameSizeIn ? nameSizeIn.value : p.displayNameSize
        );
        var handleInputSave = root.querySelector("[data-tower-handle]");
        var handleNext = normalizeHandle(handleInputSave ? handleInputSave.value : p.handle);
        if (handleNext !== normalizeHandle(p.handle) && reservedHandleChange(handleNext)) {
          setProfileStatus(reservedHandleMessage(), true);
          return;
        }
        p.handle = handleNext;
        p.socialLinks = p.socialLinks || {};
        socialLinkDefs().forEach(function (net) {
          var input = root.querySelector('[data-tower-social="' + net.id + '"]');
          p.socialLinks[net.id] = input ? storedSocialValue(net.id, input.value) : "";
        });
        p.customHtml = htmlInput ? sanitizeProfileHtml(htmlInput.value) : (p.customHtml || "");
        var sloganIn = root.querySelector("[data-tower-slogan]");
        p.slogan = sloganIn ? String(sloganIn.value || "").trim().slice(0, 400) : (p.slogan || "");
        p.badges = { role: "", interest: "", status: "" };
        if (!Array.isArray(p.awardedBadges)) {
          seedAwardedBadgesIfMissing(p);
        }
        var countSel = root.querySelector("[data-tower-friends-count]");
        if (countSel) {
          var n = parseInt(countSel.value ? countSel.value : "3", 10);
          if ([3, 6, 8].indexOf(n) === -1) n = 3;
          p.friendsDisplayCount = n;
          p.featuredFriendIds = (p.featuredFriendIds || []).slice(0, n);
        }
        var titleIn = root.querySelector("[data-tower-music-title]");
        var urlIn = root.querySelector("[data-tower-music-url]");
        var enIn = root.querySelector("[data-tower-music-enable]");
        var artistIn = root.querySelector("[data-tower-music-artist]");
        var skinIn = root.querySelector("[data-tower-music-skin]");
        if (titleIn) p.musicTitle = titleIn.value.trim().slice(0, 120);
        if (artistIn) p.musicArtist = artistIn.value.trim().slice(0, 120);
        if (urlIn) p.musicUrl = urlIn.value.trim().slice(0, 500);
        if (enIn) p.musicEnabled = !!enIn.checked;
        if (skinIn) p.musicSkin = visibleMusicSkin(skinIn.value || "classic");
        p.videoEnabled = false;
        p.videoUrl = "";
        if (p.musicYoutubeWidth == null) p.musicYoutubeWidth = 320;
        else p.musicYoutubeWidth = Math.max(180, Math.min(720, parseInt(p.musicYoutubeWidth, 10) || 320));
        var videoUrlIn = root.querySelector("[data-tower-video-url]");
        var videoTitleIn = root.querySelector("[data-tower-video-title]");
        var videoEnIn = root.querySelector("[data-tower-video-enable]");
        p.videoUrl = videoUrlIn ? videoUrlIn.value.trim().slice(0, 500) : (p.videoUrl || "");
        p.videoTitle = videoTitleIn ? videoTitleIn.value.trim().slice(0, 120) : (p.videoTitle || "");
        p.videoEnabled = videoEnIn ? !!videoEnIn.checked : (p.videoEnabled !== false);
        if (p.videoWidth == null) p.videoWidth = 360;
        else p.videoWidth = Math.max(200, Math.min(900, parseInt(p.videoWidth, 10) || 360));
        var frameInput = root.querySelector("[data-tower-avatar-frame-input]");
        p.avatarFrame = normalizeFrameId(frameInput ? frameInput.value : p.avatarFrame);
        var cowboyColorIn = root.querySelector("[data-tower-cowboy-color-input]");
        p.cowboyHatColor = normalizeCowboyHatColor(cowboyColorIn ? cowboyColorIn.value : p.cowboyHatColor);
        var ornamentInput = root.querySelector("[data-tower-avatar-ornament-input]");
        var ornamentPosInput = root.querySelector("[data-tower-avatar-ornament-pos-input]");
        p.avatarOrnament = normalizeOrnamentId(ornamentInput ? ornamentInput.value : p.avatarOrnament);
        p.avatarOrnamentPos = normalizeOrnamentPos(ornamentPosInput ? ornamentPosInput.value : p.avatarOrnamentPos);
        /* Public look fields live on the public-look panel (not Edit profile).
           Keep reading if present so Save profile does not wipe them. */
        var fontIn = root.querySelector("[data-tower-font]");
        var feedBgIn = root.querySelector("[data-tower-feed-bg]");
        var pubTextIn = root.querySelector("[data-tower-public-text]");
        var pubBtnIn = root.querySelector("[data-tower-public-btn]");
        var bgModeIn = root.querySelector("select[data-tower-bg-mode]");
        var bgHtmlIn = root.querySelector("[data-tower-bg-html]");
        if (fontIn) p.towerFont = normalizeTowerFont(fontIn.value);
        if (feedBgIn) p.feedBackgroundColor = normalizeFeedBgColor(feedBgIn.value);
        if (pubTextIn) p.publicTextColor = normalizePublicThemeColor(pubTextIn.value, "#4a2c3a");
        if (pubBtnIn) p.publicButtonColor = normalizePublicThemeColor(pubBtnIn.value, "#f4a4c4");
        if (bgModeIn) {
          p.backgroundMode = normalizeBackgroundMode(bgModeIn.value, null, null);
          if (p.backgroundMode === "collage" && root.querySelector("[data-tower-collage-layout]")) {
            p.backgroundCollage = readCollageFromForm(root);
          }
          if (p.backgroundMode === "html" && bgHtmlIn) {
            p.backgroundHtml = sanitizeProfileHtml(String(bgHtmlIn.value || "").slice(0, 8000));
          }
        } else if (root.querySelector("[data-tower-collage-layout]")) {
          p.backgroundCollage = readCollageFromForm(root);
        }
        /* keep widgetLayout as last dragged */
        if (!p.widgetLayout) p.widgetLayout = {};
        if (root.querySelector("[data-tower-public-widget]")) {
          var keepInstax = p.publicWidgets && typeof p.publicWidgets.instax === "boolean" ? p.publicWidgets.instax : null;
          var keepShown = normalizePublicWidgets(p.publicWidgets);
          p.publicWidgets = readPublicWidgetsFromForm(root);
          if (keepInstax !== null) p.publicWidgets.instax = keepInstax;
          OWNER_REMOVABLE_WIDGET_IDS.forEach(function (wid) {
            if (ownerShownKey(wid) in keepShown) p.publicWidgets[ownerShownKey(wid)] = keepShown[ownerShownKey(wid)];
          });
        }
        p.publicWidgets = normalizePublicWidgets(p.publicWidgets);
        p.publicWidgets.social = profileHasSocialLinks(p);
        writeSocialLinksLocal(p._profileId, p.socialLinks);
        if (!TowerProfileStore.save(p)) {
          setProfileStatus("Could not save profile (storage full or blocked). Try a smaller photo.", true);
          return;
        }
        try {
          if (window.CognationTowerLayoutSync && CognationTowerLayoutSync.savePublic) {
            CognationTowerLayoutSync.savePublic(TowerProfileStore.get());
          }
        } catch (eSavePub) {}
        setProfileStatus("Profile saved.", false);
        /* Re-paint in place. A full location.reload() re-ran auth boot and
           friend hydrate, which rewrote the layout and looked like a sign-out. */
        try {
          var savedP = TowerProfileStore.get();
          renderProfileChrome(root);
          applyPublicWidgets(root, savedP);
          applyWidgetLayout(root, savedP);
          renderSocialLinks(root, savedP);
          syncOwnerStickerHandles(root);
        } catch (errPaint) {}
      });
    }

    if (!root.__cognationSocialFieldsBound) {
      root.__cognationSocialFieldsBound = true;
      root.querySelectorAll("[data-tower-social]").forEach(function (input) {
        input.addEventListener("change", function () {
          var id = input.getAttribute("data-tower-social");
          if (!id) return;
          commitSocialDraft(root, id, input.value);
        });
      });
    }

    function looksLikeImage(file) {
      if (!file) return false;
      if (/^image\//.test(file.type || "")) return true;
      return /\.(png|jpe?g|gif|webp|bmp|heic|heif|avif)$/i.test(file.name || "");
    }

    function captureFriendPinPositions(p) {
      var stage = root.querySelector("[data-tower-scrapbook]");
      if (!stage || !p) return;
      if (!p.friendPinLayout || typeof p.friendPinLayout !== "object") p.friendPinLayout = {};
      stage.querySelectorAll("[data-tower-friend-pin]").forEach(function (pin) {
        var fid = pin.getAttribute("data-tower-friend-pin");
        if (!fid) return;
        var x = parseFloat(pin.getAttribute("data-sticker-x"));
        var y = parseFloat(pin.getAttribute("data-sticker-y"));
        if (isNaN(x) || isNaN(y)) return;
        var prev = p.friendPinLayout[fid] || {};
        p.friendPinLayout[fid] = {
          x: x,
          y: y,
          z: parseInt(pin.getAttribute("data-sticker-z") || prev.z || "12", 10),
          tilt: typeof prev.tilt === "number" ? prev.tilt : (parseFloat(String(pin.style.getPropertyValue("--sticker-tilt") || "0")) || 0),
        };
      });
    }

    function storeProfileImage(dataUrl, field, statusFn, okMsg, mutate) {
      if (!isTowerOwner(TowerProfileStore.get())) {
        (statusFn || setProfileStatus)("Only the profile owner can edit this profile.", true);
        return;
      }
      if (!dataUrl || dataUrl.indexOf("data:image/") !== 0) {
        (statusFn || setProfileStatus)("Could not read that image.", true);
        return;
      }
      var p = TowerProfileStore.get();
      captureFriendPinPositions(p);
      if (mutate) mutate(p);
      p[field] = dataUrl;
      var saved = false;
      try { saved = !!TowerProfileStore.save(p); } catch (eSave) { saved = false; }
      var stored = TowerProfileStore.get();
      if (!stored || stored[field] !== dataUrl) saved = false;
      renderProfileChrome(root);
      if (!saved) {
        (statusFn || setProfileStatus)("Could not save photo (storage full). Try a smaller image.", true);
        return;
      }
      (statusFn || setProfileStatus)(okMsg, false);
    }

    function readImageFile(file, statusFn, onUrl, onSettled) {
      function finish(url) {
        if (url && onUrl) onUrl(url);
        if (onSettled) onSettled();
      }
      if (!file) { finish(); return; }
      if (file.type && !looksLikeImage(file)) {
        (statusFn || setProfileStatus)("Choose an image file.", true);
        finish();
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var raw = String(reader.result || "");
        var img = new Image();
        img.onload = function () {
          var maxEdge = 480;
          var quality = 0.72;
          var dataUrl = "";
          var attempt;
          for (attempt = 0; attempt < 4; attempt++) {
            var scale = Math.min(1, maxEdge / Math.max(img.width || 1, img.height || 1));
            var cw = Math.max(1, Math.round((img.width || 1) * scale));
            var ch = Math.max(1, Math.round((img.height || 1) * scale));
            var canvas = document.createElement("canvas");
            canvas.width = cw;
            canvas.height = ch;
            var ctx = canvas.getContext("2d");
            if (!ctx) break;
            ctx.drawImage(img, 0, 0, cw, ch);
            try { dataUrl = canvas.toDataURL("image/jpeg", quality); } catch (eUrl) { break; }
            if (dataUrl.length <= 120000) break;
            maxEdge = Math.max(160, Math.round(maxEdge * 0.7));
            quality = Math.max(0.5, quality - 0.08);
          }
          finish(dataUrl || raw);
        };
        img.onerror = function () {
          if (raw.indexOf("data:image/") === 0) finish(raw);
          else {
            (statusFn || setProfileStatus)("Could not read that image.", true);
            finish();
          }
        };
        img.src = raw;
      };
      reader.onerror = function () {
        (statusFn || setProfileStatus)("Could not read that image.", true);
        finish();
      };
      reader.readAsDataURL(file);
    }

    function applyAvatarFile(file, statusFn) {
      readImageFile(file, statusFn, function (dataUrl) {
        storeProfileImage(dataUrl, "avatarDataUrl", statusFn, "Profile picture updated.");
      });
    }

    function applyInstaxFile(file, statusFn, done) {
      if (!isTowerOwner(TowerProfileStore.get())) {
        (statusFn || setProfileStatus)("Only the profile owner can add Polaroids.", true);
        if (done) done();
        return;
      }
      readImageFile(file, statusFn, function (dataUrl) {
        var before = TowerProfileStore.get() || {};
        var keptBg = typeof before.backgroundImageDataUrl === "string" ? before.backgroundImageDataUrl : "";
        var keptMode = before.backgroundMode;
        var keptHtml = before.backgroundHtml;
        var keptCollage = before.backgroundCollage;
        storeProfileImage(dataUrl, "polaroidDataUrl", statusFn, "Polaroid added.", function (p) {
          if (keptBg.indexOf("data:image/") === 0) p.backgroundImageDataUrl = keptBg;
          if (keptMode) p.backgroundMode = keptMode;
          if (typeof keptHtml === "string") p.backgroundHtml = keptHtml;
          if (keptCollage && typeof keptCollage === "object") p.backgroundCollage = keptCollage;
          if (!Array.isArray(p.polaroidPrints)) p.polaroidPrints = [];
          var prior = p.polaroidDataUrl;
          var normalized = polaroidPrintList(p);
          if (prior && prior.indexOf("data:image/") === 0 && prior !== dataUrl && !polaroidHasUrl(normalized, prior)) {
            normalized.push({ url: prior, scale: 1 });
          }
          normalized.push({ url: dataUrl, scale: 1 });
          p.polaroidPrints = normalized;
          p.polaroidRemoved = false;
        });
      }, done);
    }

    function applyInstaxFiles(files, statusFn) {
      var list = Array.prototype.slice.call(files || []).filter(Boolean);
      var i = 0;
      function next() {
        if (i >= list.length) return;
        applyInstaxFile(list[i], statusFn, function () { i += 1; next(); });
      }
      next();
    }

    function pullChosenPolaroids(input) {
      if (!input || !input.files || !input.files.length) return;
      var files = Array.prototype.slice.call(input.files);
      if (input.__cognationAppliedFile === files[0]) return;
      input.__cognationAppliedFile = files[0];
      applyInstaxFiles(files, setProfileStatus);
    }

    function pullChosenImage(input, applyFn) {
      if (!input || !input.files || !input.files[0]) return;
      var file = input.files[0];
      if (input.__cognationAppliedFile === file) return;
      input.__cognationAppliedFile = file;
      applyFn(file, setProfileStatus);
    }

    if (avatarFile) {
      avatarFile.addEventListener("change", function () {
        pullChosenImage(avatarFile, applyAvatarFile);
      });
    }
    var avatarCircle = root.querySelector("[data-tower-avatar]");
    if (avatarCircle && !avatarCircle.__cognationAvatarClickBound) {
      avatarCircle.__cognationAvatarClickBound = true;
      avatarCircle.addEventListener("click", function (ev) {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        ev.preventDefault();
        ev.stopPropagation();
        var input = root.querySelector("[data-tower-avatar-file]");
        if (input) input.click();
      });
    }
    var avatarFilePanel = root.querySelector("[data-tower-avatar-file-panel]");
    if (avatarFilePanel && !avatarFilePanel.__cognationAvatarPanelBound) {
      avatarFilePanel.__cognationAvatarPanelBound = true;
      avatarFilePanel.addEventListener("change", function () {
        pullChosenImage(avatarFilePanel, applyAvatarFile);
      });
    }
    if (!root.__cognationAvatarFocusPull) {
      root.__cognationAvatarFocusPull = true;
      window.addEventListener("focus", function () {
        setTimeout(function () {
          pullChosenImage(root.querySelector("[data-tower-avatar-file]"), applyAvatarFile);
          pullChosenImage(root.querySelector("[data-tower-avatar-file-panel]"), applyAvatarFile);
          pullChosenPolaroids(root.querySelector("[data-tower-instax-file]"));
        }, 0);
      });
    }
    root.querySelectorAll("[data-tower-instax-file]").forEach(function (input) {
      if (input.__cognationInstaxBound) return;
      input.__cognationInstaxBound = true;
      input.addEventListener("change", function () {
        pullChosenPolaroids(input);
        input.value = "";
      });
    });
    var clearAvatarBtn = root.querySelector("[data-tower-clear-avatar]");
    if (clearAvatarBtn && !clearAvatarBtn.__cognationClearAvatarBound) {
      clearAvatarBtn.__cognationClearAvatarBound = true;
      clearAvatarBtn.addEventListener("click", function () {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        var p = TowerProfileStore.get();
        p.avatarDataUrl = "";
        TowerProfileStore.save(p);
        renderProfileChrome(root);
        setProfileStatus("Profile photo removed.", false);
      });
    }

    var htmlLive = root.querySelector("[data-tower-profile-html]");
    if (htmlLive) {
      htmlLive.addEventListener("input", function () {
        var preview = root.querySelector("[data-tower-html-preview]");
        if (preview) preview.innerHTML = sanitizeProfileHtml(htmlLive.value);
      });
    }

    var sloganLive = root.querySelector("[data-tower-slogan]");
    if (sloganLive && !sloganLive.__cognationSloganLiveBound) {
      sloganLive.__cognationSloganLiveBound = true;
      sloganLive.addEventListener("input", function () {
        var display = root.querySelector("[data-tower-slogan-display]");
        var text = String(sloganLive.value || "").trim().slice(0, 400);
        if (display) display.textContent = text;
        var sticker = root.querySelector('[data-tower-widget="slogan"]');
        var widgets = normalizePublicWidgets(TowerProfileStore.get().publicWidgets);
        var show = !!text && widgets.slogan !== false;
        if (sticker) {
          sticker.hidden = !show;
          sticker.classList.toggle("is-widget-off", !show);
        }
      });
    }

    var skinInLive = root.querySelector("[data-tower-music-skin]");
    if (skinInLive) {
      skinInLive.addEventListener("change", function () {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        var cur = TowerProfileStore.get();
        cur.musicSkin = visibleMusicSkin(skinInLive.value || "classic");
        TowerProfileStore.save(cur);
        initTowerMusic(root, cur);
      });
    }
    /* Public look live preview is handled by initPublicLookControls. */

    document.addEventListener("cognation:session-started", function () {
      renderAwardedBadgeShelf(root, TowerProfileStore.get());
    });


    var friendsCount = root.querySelector("[data-tower-friends-count]");
    if (friendsCount) {
      friendsCount.addEventListener("change", function () {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        var cur = TowerProfileStore.get();
        var n = parseInt(friendsCount.value, 10);
        if ([3, 6, 8].indexOf(n) === -1) n = 3;
        cur.friendsDisplayCount = n;
        cur.featuredFriendIds = (cur.featuredFriendIds || []).slice(0, n);
        TowerProfileStore.save(cur);
        renderFriendsPicker(root, cur);
      });
    }

    var saveFriendsBtn = root.querySelector("[data-tower-save-friends]");
    if (saveFriendsBtn && !saveFriendsBtn.__cognationFriendsSaveBound) {
      saveFriendsBtn.__cognationFriendsSaveBound = true;
      saveFriendsBtn.addEventListener("click", function () {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        var cur = TowerProfileStore.get();
        var countSel = root.querySelector("[data-tower-friends-count]");
        var n = parseInt(countSel && countSel.value ? countSel.value : cur.friendsDisplayCount || 3, 10);
        if ([3, 6, 8].indexOf(n) === -1) n = 3;
        var ids = (cur.featuredFriendIds || []).slice();
        /* Prefer live selected chips if present */
        var chips = root.querySelectorAll("[data-tower-friends-chips] .tower-friend-chip.is-selected[data-friend-id]");
        if (chips && chips.length) {
          ids = [];
          chips.forEach(function (btn) {
            var id = btn.getAttribute("data-friend-id");
            if (id && ids.indexOf(id) < 0) ids.push(id);
          });
        }
        cur.friendsDisplayCount = n;
        cur.featuredFriendIds = ids.slice(0, n);
        ensureFriendPinPositions(cur, cur.featuredFriendIds);
        if (!TowerProfileStore.save(cur)) {
          var stFail = root.querySelector("[data-tower-friends-status]");
          if (stFail) stFail.textContent = "Could not save top friends.";
          return;
        }
        renderFriendsPicker(root, cur);
        renderFriendPins(root, cur);
        var st = root.querySelector("[data-tower-friends-status]");
        if (st) {
          var count = cur.featuredFriendIds.length;
          st.textContent = "Top friends saved";
        }
      });
    }

    var badgeFile = root.querySelector("[data-tower-badge-file]");
    if (badgeFile && !badgeFile.__cognationBadgeFileBound) {
      badgeFile.__cognationBadgeFileBound = true;
      badgeFile.addEventListener("change", function () {
        var file = badgeFile.files && badgeFile.files[0];
        badgeFile.value = "";
        if (!file) return;
        if (file.type && file.type.indexOf("image/") !== 0) {
          setBadgeDisplayStatus(root, "Choose an image file.");
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var raw = String(reader.result || "");
          var img = new Image();
          img.onload = function () {
            var maxEdge = 256;
            var scale = Math.min(1, maxEdge / Math.max(img.width || 1, img.height || 1));
            var cw = Math.max(1, Math.round((img.width || 1) * scale));
            var ch = Math.max(1, Math.round((img.height || 1) * scale));
            var canvas = document.createElement("canvas");
            canvas.width = cw;
            canvas.height = ch;
            var ctx = canvas.getContext("2d");
            var dataUrl = raw;
            if (ctx) {
              ctx.drawImage(img, 0, 0, cw, ch);
              try { dataUrl = canvas.toDataURL("image/jpeg", 0.82); } catch (eUrl) {}
            }
            if (!dataUrl || dataUrl.indexOf("data:image/") !== 0) {
              setBadgeDisplayStatus(root, "Could not read that image.");
              return;
            }
            var title = String(file.name || "Badge").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 48) || "Badge";
            var p = TowerProfileStore.get();
            if (!Array.isArray(p.awardedBadges)) p.awardedBadges = [];
            var badge = {
              id: "badge-upload-" + Date.now().toString(36),
              title: title,
              kind: "upload",
              imageUrl: dataUrl,
              awardedAt: new Date().toISOString(),
            };
            p.awardedBadges.push(badge);
            if (!p.badgeVisibility || typeof p.badgeVisibility !== "object") p.badgeVisibility = {};
            p.badgeVisibility[badge.id] = true;
            p.publicWidgets = normalizePublicWidgets(p.publicWidgets);
            p.publicWidgets.badges = true;
            ensureBadgePinPositions(p, [badge.id]);
            if (!TowerProfileStore.save(p)) {
              setBadgeDisplayStatus(root, "Could not save badge (storage full). Try a smaller image.");
              return;
            }
            var stored = TowerProfileStore.get();
            var kept = stored && Array.isArray(stored.awardedBadges) && stored.awardedBadges.some(function (b) {
              return b && b.id === badge.id && b.imageUrl === dataUrl;
            });
            if (!kept) {
              setBadgeDisplayStatus(root, "Could not save badge (storage full). Try a smaller image.");
              return;
            }
            renderAwardedBadgeShelf(root, stored);
            applyPublicWidgets(root, stored);
            syncBadgeVisibilityUi(root, stored);
            setBadgeDisplayStatus(root, "Badge uploaded");
          };
          img.onerror = function () {
            setBadgeDisplayStatus(root, "Could not read that image.");
          };
          img.src = raw;
        };
        reader.onerror = function () {
          setBadgeDisplayStatus(root, "Could not read that image.");
        };
        reader.readAsDataURL(file);
      });
    }

    var saveBadgesBtn = root.querySelector("[data-tower-save-badges]");
    if (saveBadgesBtn && !saveBadgesBtn.__cognationBadgesSaveBound) {
      saveBadgesBtn.__cognationBadgesSaveBound = true;
      saveBadgesBtn.addEventListener("click", function () {
        if (!isTowerOwner(TowerProfileStore.get())) return;
        var cur = TowerProfileStore.get();
        if (!cur.badgeVisibility || typeof cur.badgeVisibility !== "object") {
          cur.badgeVisibility = {};
        }
        var box = root.querySelector("[data-tower-badge-visibility]");
        if (box) {
          box.querySelectorAll("[data-tower-badge-vis]").forEach(function (cb) {
            var id = cb.getAttribute("data-tower-badge-vis");
            if (!id) return;
            cur.badgeVisibility[id] = !!cb.checked;
          });
        }
        var visibleIds = collectVisibleBadgePins(cur).map(function (it) { return it.id; });
        ensureBadgePinPositions(cur, visibleIds);
        if (!TowerProfileStore.save(cur)) {
          setBadgeDisplayStatus(root, "Could not save badge display.");
          return;
        }
        renderAwardedBadgeShelf(root, cur);
        syncBadgeVisibilityUi(root, cur);
        setBadgeDisplayStatus(root, "Badge display saved");
      });
    }

    function shrinkMarketPic(file, done) {
      var reader = new FileReader();
      reader.onerror = function () { done(""); };
      reader.onload = function () {
        var raw = String(reader.result || "");
        /* Keep the upload's own bytes when they fit. Shrink only when they do not. */
        if (raw.indexOf("data:image/") === 0 && raw.length < 180000) {
          done(raw);
          return;
        }
        var img = new Image();
        img.onload = function () {
          var max = 480;
          var scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
          var canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round((img.width || 1) * scale));
          canvas.height = Math.max(1, Math.round((img.height || 1) * scale));
          var ctx = canvas.getContext("2d");
          var out = "";
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            try { out = canvas.toDataURL("image/jpeg", 0.72); } catch (ePic) { out = ""; }
          }
          done(out.indexOf("data:image/") === 0 ? out : "");
        };
        img.onerror = function () { done(""); };
        img.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    }
    function chosenAudience() {
      var btn = form && form.querySelector("[data-tower-compose-kind][aria-selected='true']");
      return btn && btn.getAttribute("data-tower-compose-kind") === "professional" ? "professional" : "personal";
    }
    function audienceAuthor(kind) {
      var social = remoteSocial();
      var mine = social && typeof social.getMyProfiles === "function" ? social.getMyProfiles() : [];
      var i, p;
      for (i = 0; i < mine.length; i++) {
        p = mine[i];
        if (p && p.kind === kind && p.id) {
          return { id: String(p.id), name: p.display_name || p.displayName || "", handle: p.handle || "" };
        }
      }
      if (usingRemoteSocial()) return { id: "", name: "", handle: "" };
      var accounts = window.CognationAccounts;
      var user = "";
      try { user = (JSON.parse(localStorage.getItem("cognation.session.v2") || "{}") || {}).username || ""; } catch (eAud) {}
      var rows = accounts && accounts.getProfilesForUsername ? accounts.getProfilesForUsername(user) || [] : [];
      for (i = 0; i < rows.length; i++) {
        p = rows[i];
        if (p && p.kind === kind && p.id) return { id: String(p.id), name: p.displayName || "", handle: p.handle || "" };
      }
      return { id: "", name: "", handle: "" };
    }
    if (form) {
      var audienceBar = form.querySelector("[data-tower-compose-audience]");
      if (audienceBar) {
        audienceBar.addEventListener("click", function (ev) {
          var btn = ev.target && ev.target.closest ? ev.target.closest("[data-tower-compose-kind]") : null;
          if (!btn || !audienceBar.contains(btn)) return;
          ev.preventDefault();
          audienceBar.querySelectorAll("[data-tower-compose-kind]").forEach(function (b) {
            var on = b === btn;
            b.setAttribute("aria-selected", on ? "true" : "false");
            b.classList.toggle("is-selected", on);
            b.classList.toggle("is-active", on);
          });
        });
      }
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var files = fileInput && fileInput.files ? Array.prototype.slice.call(fileInput.files) : [];
        var kind = (kindSelect && kindSelect.value) || "photo";
        var bodyNow = bodyInput ? bodyInput.value : "";
        var marketPost = /(^|[^a-z0-9])#market(?![a-z0-9])/i.test(bodyNow);
        /* Feed photos: every picture posted to Supabase is shrunk and saved on the post
           row (attachments[].dataUrl), not only #market ones; before, other posts kept
           just the file name. Local (signed-out) posts keep the #market-only rule. */
        if ((marketPost || usingRemoteSocial()) && !form.__marketReady) {
          var pics = files.filter(function (f) {
            return /^image\//.test(String(f.type || "")) || /\.(png|jpe?g|gif|webp)$/i.test(String(f.name || ""));
          });
          if (pics.length) {
            var left = pics.length;
            form.__pics = {};
            pics.forEach(function (f) {
              shrinkMarketPic(f, function (url) {
                if (url) form.__pics[f.name] = url;
                if (--left === 0) {
                  form.__marketReady = true;
                  if (form.requestSubmit) form.requestSubmit();
                  else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
                }
              });
            });
            return;
          }
        }
        var savedPics = form.__pics || {};
        form.__marketReady = false;
        form.__pics = null;
        var aud = chosenAudience();
        var who = audienceAuthor(aud);
        if (usingRemoteSocial() && !who.id) {
          setStatus(aud === "professional" ? "Add a professional page before posting to that audience." : "Sign in before posting.", true);
          return;
        }
        var attachments = [];
        files.forEach(function (f) {
          var row = {
            kind: kind,
            label: f.name,
            name: f.name,
            demoMeta: true,
            size: f.size,
            type: f.type || "",
          };
          if (savedPics[f.name]) row.dataUrl = savedPics[f.name];
          attachments.push(row);
        });
        if (marketPost) {
          try {
            var memberLoc = JSON.parse(localStorage.getItem("cognation.member.profile.v1") || "{}");
            var savedLoc = JSON.parse(localStorage.getItem("cognation.member.location.v1") || "null");
            var lat = Number(memberLoc && memberLoc.lat != null ? memberLoc.lat : savedLoc && savedLoc.lat);
            var lng = Number(memberLoc && memberLoc.lng != null ? memberLoc.lng : savedLoc && savedLoc.lng);
            if (isFinite(lat) && isFinite(lng)) attachments.push({ kind: "location", label: "location", lat: lat, lng: lng });
          } catch (eLoc) {}
        }
        if (usingRemoteSocial()) {
          /* One post at a time: the Post button is disabled while a post is in
             flight (no double posts) and re-enabled on success and on error. */
          if (form.__postInFlight) return;
          var social = remoteSocial();
          if (!social || !social.createTowerPost) {
            setStatus("Tower is still connecting. Please try again.", true);
            try {
              if (window.CognationFriction) window.CognationFriction.retry("tower", "tower_connecting");
            } catch (frConn) {}
            return;
          }
          /* No notice on a post (Alexa, Oct 22 11:45 AM CT): the new post at
             the top of the Feed and the cleared composer are the confirmation.
             Only a failure shows the box. Clear any earlier error first. */
          /* Empty post: its own plain line, checked here before any request
             (PM, Oct 22). The button is never left disabled. */
          if (!String(bodyInput ? bodyInput.value : "").trim()) {
            setPostInFlight(false);
            setStatus(EMPTY_POST_LINE, true);
            return;
          }
          setStatus("", false);
          setPostInFlight(true);
          social
            .createTowerPost({
              body: bodyInput ? bodyInput.value : "",
              attachments: attachments,
              authorProfileId: who.id,
              /* PERSONAL | PROFESSIONAL switch (js/signal-post-as.js): one of
                 the member's own pages, or "" = the current default author. */
              asProfileId: (window.CognationSignalPostAs &&
                typeof window.CognationSignalPostAs.currentAuthorProfileId === "function")
                ? window.CognationSignalPostAs.currentAuthorProfileId() : "",
            })
            .then(function () {
              setPostInFlight(false);
              if (bodyInput) bodyInput.value = "";
              if (fileInput) fileInput.value = "";
              setStatus("", false);
              try {
                if (window.CognationFriction) window.CognationFriction.complete("tower");
              } catch (frRemote) {}
              renderFeed(root);
            })
            .catch(function (error) {
              setPostInFlight(false);
              /* PM wording: the raw server / database text goes to the console
                 only; the page shows one of two plain lines. */
              try { console.warn("[signal] post failed:", error); } catch (eLog) {}
              setStatus(towerPostErrorLine(error), true);
              try {
                if (window.CognationFriction) window.CognationFriction.retry("tower", "post_error");
              } catch (frCatch) {}
            });
          return;
        }
        var result = TowerStore.add({
          authorName: who.name || postAuthorFromProfile(TowerProfileStore.get()),
          authorProfileId: who.id,
          handle: who.handle,
          profileKind: aud,
          body: bodyInput ? bodyInput.value : "",
          attachments: attachments,
        });
        if (!result.ok) {
          setStatus(result.error || "Could not post.", true);
          try {
            if (window.CognationFriction) window.CognationFriction.retry("tower", "post_error");
          } catch (frErr) {}
          return;
        }
        if (bodyInput) bodyInput.value = "";
        if (fileInput) fileInput.value = "";
        setStatus("", false);
        try {
          if (window.CognationFriction) window.CognationFriction.complete("tower");
        } catch (frOk) {}
        renderFeed(root);
      });
    }

    document.addEventListener("cognation:tower-updated", function () {
      renderFeed(root);
    });
    /* Age edits can open or close a photo (13, 18, 21) without crossing under-13. */
    document.addEventListener("cognation:member-profile-updated", function () {
      renderFeed(root);
    });
    document.addEventListener("cognation:remote-profile-loaded", function () {
      renderProfileChrome(root);
      renderFeed(root);
      if (hashRequestsPublicSide()) applyTowerSide(root, "public");
    });
    /* Logout / next sign-in: repaint the header now. Without this the previous
       user's name and avatar stayed in the DOM until the new server row loaded. */
    ["cognation:session-ended", "cognation:session-started"].forEach(function (name) {
      document.addEventListener(name, function () { renderProfileChrome(root); });
    });
  }

  /* Friends rain on the Circle page. Not followers. Capped so a full roster stays smooth. */
  var CIRCLE_FALL_CAP = 36;
  var circleFallState = null;

  function circleFriendRecord(id) {
    id = String(id || "");
    var friend = null;
    for (var i = 0; i < DEMO_FRIENDS.length; i++) {
      if (DEMO_FRIENDS[i].id === id) {
        friend = DEMO_FRIENDS[i];
        break;
      }
    }
    if (friend) return friend;
    var social = remoteSocial();
    if (social) {
      var remote = null;
      if (typeof social.getProfileForHandle === "function") {
        remote = social.getProfileForHandle(id.replace(/^@/, ""));
      }
      if (!remote && typeof social.getProfile === "function") remote = social.getProfile(id);
      if (!remote && typeof social.getProfileForUser === "function") {
        remote = social.getProfileForUser(id, "personal");
      }
      if (remote) {
        return {
          id: id,
          name: remote.display_name || remote.displayName || ("@" + (remote.handle || id)),
          handle: remote.handle || id,
        };
      }
    }
    return { id: id, name: friendSideLabel(id) };
  }

  function circleLastContact(ids) {
    var map = {};
    var allowed = {};
    var nameToId = {};
    ids.forEach(function (id) {
      allowed[id] = true;
      nameToId[String(id).toLowerCase()] = id;
      nameToId[friendHandleFromId(id)] = id;
      var friend = circleFriendRecord(id);
      if (friend.name) nameToId[String(friend.name).trim().toLowerCase()] = id;
    });
    var store = window.CognationMessageStore;
    if (!store || typeof store.listConversations !== "function") return map;
    var convos = [];
    try { convos = store.listConversations() || []; } catch (e) { return map; }
    convos.forEach(function (conv) {
      var latest = 0;
      (conv.messages || []).forEach(function (msg) {
        var t = Date.parse(msg && msg.createdAt);
        if (!isNaN(t) && t > latest) latest = t;
      });
      if (!latest) return;
      var keys = [];
      if (conv && conv.title) keys.push(String(conv.title).trim().toLowerCase());
      (conv.participants || []).forEach(function (person) {
        if (!person || person.id === "you") return;
        if (person.name) keys.push(String(person.name).trim().toLowerCase());
        if (person.id) keys.push(String(person.id).trim().toLowerCase());
      });
      keys.forEach(function (key) {
        var id = nameToId[key];
        if (!id || !allowed[id]) return;
        if (map[id] == null || latest > map[id]) map[id] = latest;
      });
    });
    return map;
  }

  function circleFriendIds() {
    var p = TowerProfileStore.get() || {};
    var source = Array.isArray(p.friendIds) ? p.friendIds.slice() : [];
    if (!source.length) {
      DEMO_FRIENDS.forEach(function (friend) {
        if (friend && friend.id) source.push(friend.id);
      });
    }
    var ids = [];
    var seen = {};
    source.forEach(function (raw) {
      var id = String(raw || "");
      if (!id || seen[id]) return;
      var friend = circleFriendRecord(id);
      if (id === "alexa-thomas" || isSelfFriend(friend, p)) return;
      seen[id] = true;
      ids.push(id);
    });
    var contact = circleLastContact(ids);
    var any = false;
    ids.forEach(function (id) { if (contact[id] != null) any = true; });
    if (any) {
      ids.sort(function (a, b) {
        var ta = contact[a] == null ? -1 : contact[a];
        var tb = contact[b] == null ? -1 : contact[b];
        if (ta === tb) return 0;
        return ta < tb ? -1 : 1;
      });
    }
    return ids.slice(0, CIRCLE_FALL_CAP);
  }

  function circleEdgePad(b) {
    var rad = ((b.rot || 0) * Math.PI) / 180;
    var span = Math.abs(Math.sin(rad)) + Math.abs(Math.cos(rad));
    return Math.max(0, (b.size * span - b.size) / 2);
  }

  function placeCircleFallLayer(layer) {
    if (!layer) return;
    layer.style.top = "";
    var page = layer.closest ? layer.closest("[data-circle-page]") : null;
    if (!page) {
      page = document.createElement("section");
      page.className = "circle-page";
      page.setAttribute("data-circle-page", "");
      var title = document.createElement("h3");
      title.className = "circle-page-title";
      title.textContent = "PULSE";
      page.appendChild(title);
      page.appendChild(layer);
    }
    if (!page.querySelector(".circle-page-title")) {
      var circleTitle = document.createElement("h3");
      circleTitle.className = "circle-page-title";
      circleTitle.textContent = "PULSE";
      page.insertBefore(circleTitle, page.firstChild);
    }
    var topbar = document.querySelector(".app-topbar");
    if (topbar && topbar.parentNode && page.previousElementSibling !== topbar) {
      topbar.parentNode.insertBefore(page, topbar.nextSibling);
    }
  }

  function circleStageSize() {
    var layer = document.querySelector("[data-circle-fall]");
    var w = window.innerWidth || 800;
    var h = window.innerHeight || 600;
    if (layer) {
      if (layer.clientWidth) w = layer.clientWidth;
      if (layer.clientHeight) h = layer.clientHeight;
    }
    return { w: w, h: h };
  }

  function circleFloor(b) {
    return circleStageSize().h - b.size - 6 - circleEdgePad(b);
  }

  function circleMaxX(b) {
    return circleStageSize().w - b.size - 6 - circleEdgePad(b);
  }

  function separateCircles(a, b) {
    var dx = (b.x + b.r) - (a.x + a.r);
    var dy = (b.y + b.r) - (a.y + a.r);
    var distSq = dx * dx + dy * dy;
    var min = a.r + b.r;
    if (distSq >= min * min) return;
    var dist = Math.sqrt(distSq) || 0.01;
    var nx = dx / dist;
    var ny = dy / dist;
    var overlap = min - dist;
    if (a.sleep && b.sleep) {
      a.x -= nx * overlap * 0.5;
      a.y -= ny * overlap * 0.5;
      b.x += nx * overlap * 0.5;
      b.y += ny * overlap * 0.5;
      return;
    }
    if (a.sleep) {
      b.x += nx * overlap;
      b.y += ny * overlap;
      var into = b.vx * nx + b.vy * ny;
      if (into < 0) {
        b.vx -= into * nx;
        b.vy -= into * ny * 1.02;
        b.vr *= 0.82;
      }
      return;
    }
    if (b.sleep) {
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      var intoA = a.vx * nx + a.vy * ny;
      if (intoA > 0) {
        a.vx -= intoA * nx;
        a.vy -= intoA * ny * 1.02;
        a.vr *= 0.82;
      }
      return;
    }
    a.x -= nx * overlap * 0.5;
    a.y -= ny * overlap * 0.5;
    b.x += nx * overlap * 0.5;
    b.y += ny * overlap * 0.5;
    var rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rel < 0) {
      var push = -rel * 0.45;
      a.vx -= push * nx;
      a.vy -= push * ny;
      b.vx += push * nx;
      b.vy += push * ny;
      a.vr *= 0.9;
      b.vr *= 0.9;
    }
  }

  function integrateCircles(bodies, dt) {
    var g = 1900;
    var i;
    for (i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      if (b.sleep) continue;
      b.vy += g * dt;
      b.vx *= 0.994;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      var minX = 6 + circleEdgePad(b);
      if (b.x < minX) { b.x = minX; b.vx = Math.abs(b.vx) * 0.2; }
      var maxX = circleMaxX(b);
      if (b.x > maxX) { b.x = maxX; b.vx = -Math.abs(b.vx) * 0.2; }
    }
    var iter;
    for (iter = 0; iter < 5; iter++) {
      for (i = 0; i < bodies.length; i++) {
        var j;
        for (j = i + 1; j < bodies.length; j++) separateCircles(bodies[i], bodies[j]);
      }
      for (i = 0; i < bodies.length; i++) {
        var body = bodies[i];
        var floor = circleFloor(body);
        if (body.y > floor) {
          body.y = floor;
          if (body.vy > 70) body.vy = -body.vy * 0.46;
          else if (body.vy > 0) body.vy = -Math.max(42, body.vy * 0.62);
          body.vx *= 0.9;
          body.vr *= 0.92;
        }
        var edge = 6 + circleEdgePad(body);
        if (body.x < edge) body.x = edge;
        var right = circleMaxX(body);
        if (body.x > right) body.x = right;
      }
    }
    for (i = 0; i < bodies.length; i++) {
      var one = bodies[i];
      if (one.sleep) continue;
      var ground = circleFloor(one);
      var slow = Math.abs(one.vy) < 30 && Math.abs(one.vx) < 20;
      if (!slow) continue;
      var supported = one.y >= ground - 1.5;
      if (!supported) {
        var m;
        for (m = 0; m < bodies.length; m++) {
          var other = bodies[m];
          if (other === one) continue;
          var dx = (other.x + other.r) - (one.x + one.r);
          var dy = (other.y + other.r) - (one.y + one.r);
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < one.r + other.r + 2.5 && dy > 0 && other.sleep && Math.abs(dx) < (one.r + other.r) * 0.8) {
            supported = true;
          }
        }
      }
      if (!supported) continue;
      var nowHop = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      if (!one.fidgetAt || nowHop >= one.fidgetAt) {
        one.sleep = false;
        one.vy = -58 - (one.size % 22);
        one.vx += Math.sin((one.x + one.size) * 0.04) * 14;
        one.vr = (one.size % 2 ? 16 : -16);
        one.fidgetAt = nowHop + 720 + (one.size % 380);
      }
      if (one.y > ground) one.y = ground;
    }
  }

  function paintCircleBody(b) {
    b.el.style.transform = "translate3d(" + b.x.toFixed(2) + "px," + b.y.toFixed(2) + "px,0) rotate(" + b.rot.toFixed(2) + "deg)";
  }

  function stopCircleFall() {
    if (window.CognationPulseMutual && typeof window.CognationPulseMutual.stop === "function") {
      window.CognationPulseMutual.stop();
    }
    if (circleFallState) {
      if (circleFallState.raf) cancelAnimationFrame(circleFallState.raf);
      if (circleFallState.refreshTimer) clearInterval(circleFallState.refreshTimer);
    }
    circleFallState = null;
    var page = document.querySelector("[data-circle-page]");
    if (page && page.parentNode) page.parentNode.removeChild(page);
    else {
      var layer = document.querySelector("[data-circle-fall]");
      if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    }
    document.body.classList.remove("is-circle-open");
    var shortcut = document.querySelector('[data-tower-anchor="circle"]');
    if (shortcut) shortcut.setAttribute("aria-pressed", "false");
  }

  function circleAt(name) {
    var first = String(name || "").trim().split(/\s+/)[0] || "Friend";
    return "@" + first.replace(/^@/, "");
  }

  function circleNamedFriends() {
    var p = TowerProfileStore.get() || {};
    var roster = Array.isArray(p.friendIds) && p.friendIds.length ? p.friendIds : null;
    function collect(requireRoster) {
      var list = [];
      DEMO_FRIENDS.forEach(function (friend) {
        if (!friend || !friend.id || friend.id === "alexa-thomas" || isSelfFriend(friend, p)) return;
        if (requireRoster && roster && roster.indexOf(friend.id) < 0) return;
        list.push(friend);
      });
      return list;
    }
    var named = roster ? collect(true) : collect(false);
    if (!named.length) named = collect(false);
    return named;
  }

  /* Five spots on a lightning ring tilted like water coming toward the viewer.
     90° is stage center (near, lowest, largest). The back spots stay high and small. */
  var CIRCLE_TILT = 80 * Math.PI / 180;
  var CIRCLE_RING_R = 320;
  var CIRCLE_PERSPECTIVE = 500;
  var CIRCLE_SCALE = 0.6;
  var CIRCLE_SPOTS = [
    { id: "left", angle: 176 },
    { id: "center", angle: 90 },
    { id: "right", angle: 4 },
    { id: "back-right", angle: -46 },
    { id: "back-left", angle: -134 }
  ];

  function circleProjectRadius(angleDeg, radius) {
    var t = angleDeg * Math.PI / 180;
    var x = Math.cos(t) * radius;
    var y = Math.sin(t) * radius;
    var depth = CIRCLE_PERSPECTIVE / (CIRCLE_PERSPECTIVE - y * Math.sin(CIRCLE_TILT));
    return {
      x: x * depth,
      y: y * Math.cos(CIRCLE_TILT) * depth,
      s: depth * CIRCLE_SCALE
    };
  }

  function circleProject(angleDeg) {
    return circleProjectRadius(angleDeg, CIRCLE_RING_R);
  }

  function circleGlowColor(turn) {
    var purple = 0.4 + 0.2 * Math.sin(turn * Math.PI * 2);
    var blue = 0.34 + 0.2 * Math.sin(turn * Math.PI * 2 + 2.2);
    var pink = 0.36 + 0.2 * Math.sin(turn * Math.PI * 2 + 4.15);
    var sum = purple + blue + pink;
    purple /= sum;
    blue /= sum;
    pink /= sum;
    return {
      r: Math.round(176 * purple + 70 * blue + 255 * pink),
      g: Math.round(80 * purple + 205 * blue + 90 * pink),
      b: Math.round(255 * purple + 255 * blue + 220 * pink)
    };
  }

  function paintCircleLightning(ring) {
    var canvas = document.createElement("canvas");
    canvas.className = "circle-lightning";
    canvas.setAttribute("data-circle-lightning", "");
    canvas.width = 1040;
    canvas.height = 520;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "lighter";
    ctx.filter = "blur(14px)";
    function glowAt(x, y, radius, color, alpha) {
      if (radius < 2 || alpha <= 0) return;
      var gx = x + 520;
      var gy = y + 260;
      if (gx < -radius || gy < -radius || gx > canvas.width + radius || gy > canvas.height + radius) return;
      var g = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
      g.addColorStop(0, "rgba(" + color.r + "," + color.g + "," + color.b + "," + alpha.toFixed(3) + ")");
      g.addColorStop(0.5, "rgba(" + color.r + "," + color.g + "," + color.b + "," + (alpha * 0.28).toFixed(3) + ")");
      g.addColorStop(1, "rgba(" + color.r + "," + color.g + "," + color.b + ",0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(gx, gy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    var steps = 260;
    var i;
    for (i = 0; i < steps; i++) {
      var turn = i / steps;
      var ang = turn * Math.PI * 2;
      var p = circleProjectRadius(turn * 360, CIRCLE_RING_R);
      var depth = p.s / CIRCLE_SCALE;
      var flicker = 0.8 + 0.2 * Math.sin(i * 1.35);
      glowAt(p.x, p.y, 32 * depth, circleGlowColor(turn), 0.06 * flicker);
    }
    ring.appendChild(canvas);
    paintCircleBolt(ring);
  }

  /* One smooth tilted oval. No wave, so the light stays an even ribbon. */
  function circleBoltSegments(radius, wobble, seed, baseWidth) {
    var steps = 140;
    var cmds = [];
    var i;
    for (i = 0; i <= steps; i++) {
      var p = circleProjectRadius((i / steps) * 360, radius);
      cmds.push((i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1));
    }
    return [{ d: cmds.join(" "), width: baseWidth }];
  }

  function circleBranchPath(angleDeg, radius, length, seed) {
    var cmds = [];
    var steps = 6;
    var i;
    for (i = 0; i <= steps; i++) {
      var along = (i / steps) * length;
      var side = Math.sin(i * 2.1 + seed) * 16;
      if (i === 0) side = 0;
      var p = circleProjectRadius(angleDeg + side * 0.18, radius + along);
      cmds.push((i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1));
    }
    return cmds.join(" ");
  }

  function paintCircleBolt(ring) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "circle-lightning circle-bolt");
    svg.setAttribute("data-circle-bolt", "");
    svg.setAttribute("viewBox", "-520 -260 1040 520");
    svg.setAttribute("aria-hidden", "true");
    var ns = "http://www.w3.org/2000/svg";
    var defs = document.createElementNS(ns, "defs");
    function glowFilter(id, wide, tight, keepCore) {
      var filter = document.createElementNS(ns, "filter");
      filter.setAttribute("id", id);
      filter.setAttribute("x", "-80%");
      filter.setAttribute("y", "-80%");
      filter.setAttribute("width", "260%");
      filter.setAttribute("height", "260%");
      filter.setAttribute("color-interpolation-filters", "sRGB");
      var blurWide = document.createElementNS(ns, "feGaussianBlur");
      blurWide.setAttribute("in", "SourceGraphic");
      blurWide.setAttribute("stdDeviation", String(wide));
      blurWide.setAttribute("result", "wide");
      var blurTight = document.createElementNS(ns, "feGaussianBlur");
      blurTight.setAttribute("in", "SourceGraphic");
      blurTight.setAttribute("stdDeviation", String(tight));
      blurTight.setAttribute("result", "tight");
      var blend = document.createElementNS(ns, "feBlend");
      blend.setAttribute("in", "wide");
      blend.setAttribute("in2", "tight");
      blend.setAttribute("mode", "screen");
      blend.setAttribute("result", "glow");
      filter.appendChild(blurWide);
      filter.appendChild(blurTight);
      filter.appendChild(blend);
      if (keepCore) {
        var merge = document.createElementNS(ns, "feMerge");
        var glowNode = document.createElementNS(ns, "feMergeNode");
        glowNode.setAttribute("in", "glow");
        var coreNode = document.createElementNS(ns, "feMergeNode");
        coreNode.setAttribute("in", "SourceGraphic");
        merge.appendChild(glowNode);
        merge.appendChild(coreNode);
        filter.appendChild(merge);
      }
      return filter;
    }
    defs.appendChild(glowFilter("pulse-bolt-glow", 18, 7, false));
    defs.appendChild(glowFilter("pulse-bolt-core", 3.5, 1.2, false));
    svg.appendChild(defs);
    function addBolt(parent, d, color, width, opacity) {
      var path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", width.toFixed(2));
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("opacity", String(opacity));
      parent.appendChild(path);
    }
    var halo = document.createElementNS(ns, "g");
    halo.setAttribute("filter", "url(#pulse-bolt-glow)");
    var core = document.createElementNS(ns, "g");
    core.setAttribute("filter", "url(#pulse-bolt-core)");
    var colors = [
      { color: "#b44bff", opacity: 0.9 },
      { color: "#3ecbff", opacity: 0.85 },
      { color: "#ff4ad8", opacity: 0.8 }
    ];
    var wave = circleBoltSegments(CIRCLE_RING_R, 14, 0.4, 12)[0];
    addBolt(halo, wave.d, colors[0].color, 36, 0.42);
    addBolt(halo, wave.d, colors[1].color, 18, 0.7);
    addBolt(halo, wave.d, colors[2].color, 10, 0.5);
    addBolt(core, wave.d, "#e9f7ff", 4.5, 0.55);
    var forks = [];
    forks.forEach(function (angle, index) {
      var outward = index % 2 === 0;
      var t = angle * Math.PI / 180;
      var depth = CIRCLE_PERSPECTIVE / (CIRCLE_PERSPECTIVE - Math.sin(t) * CIRCLE_RING_R * Math.sin(CIRCLE_TILT));
      var d = circleBranchPath(angle, CIRCLE_RING_R, outward ? 28 + (index % 3) * 6 : -22, index + 2);
      var width = 4.2 * depth;
      colors.forEach(function (ink) {
        addBolt(halo, d, ink.color, width, 0.75);
      });
      addBolt(core, d, "#f4fbff", Math.max(0.8, width * 0.2), 0.8);
    });
    svg.appendChild(halo);
    svg.appendChild(core);
    ring.appendChild(svg);
  }

  var CIRCLE_REFRESH_MS = 15 * 60 * 1000;
  var CIRCLE_ROOMS = [
    { id: "room-tech", title: "Tech workshop world" },
    { id: "room-21", title: "21+ lounge world" },
    { id: "room-intl", title: "International plaza" },
    { id: "room-oss", title: "Open-source garden" }
  ];
  var circleShownTopics = [];
  var circleTopicsRefreshedAt = 0;

  function circleFriendById(id) {
    var profile = TowerProfileStore.get() || {};
    for (var i = 0; i < DEMO_FRIENDS.length; i++) {
      if (DEMO_FRIENDS[i].id === id && !isSelfFriend(DEMO_FRIENDS[i], profile)) return DEMO_FRIENDS[i];
    }
    return null;
  }

  function circleTopicKey(topic) {
    return [topic.kind, topic.target, (topic.people || []).map(function (person) { return person.id; }).join(",")].join("|");
  }

  /* By author profile id (or handle), never display name: another person
     with the same name must not stand in for this friend. */
  function circlePostByAuthor(friend) {
    var wantId = String((friend && friend.id) || "");
    var wantHandle = normalizeHandle((friend && friend.handle) || "");
    if (!wantId && !wantHandle) return null;
    var posts = [];
    try { posts = (TowerStore.list() || []).filter(towerPostVisibleToViewer); } catch (e) { return null; }
    for (var i = 0; i < posts.length; i++) {
      var post = posts[i] || {};
      if (wantId && String(post.authorProfileId || "") === wantId) return post;
      if (wantHandle && normalizeHandle(post.handle || "") === wantHandle) return post;
    }
    return null;
  }

  function circleProfessionalByHandle(handle) {
    handle = String(handle || "").replace(/^@/, "");
    var accounts = window.CognationAccounts;
    if (!handle || !accounts || typeof accounts.getProfileByHandle !== "function") return null;
    if (typeof accounts.ensureDemoProfessionals === "function") {
      try { accounts.ensureDemoProfessionals(); } catch (e) {}
    }
    var rec = accounts.getProfileByHandle(handle);
    if (!rec || rec.kind !== "professional") return null;
    return rec;
  }

  function circleProfileRecords() {
    try {
      var raw = localStorage.getItem("cognation.profiles.v1");
      var doc = raw ? JSON.parse(raw) : null;
      var profiles = doc && doc.profiles ? doc.profiles : {};
      return Object.keys(profiles).map(function (id) { return profiles[id]; });
    } catch (e) {
      return [];
    }
  }

  /* Only activity already stored. Example names are not written here. */
  function circleCollectRealActivity() {
    var topics = [];
    var personal = viewerPersonalRecord() || {};
    var me = { id: "alexa-thomas", name: personal.displayName || "Alexa" };
    var since = personal.friendSince && typeof personal.friendSince === "object" ? personal.friendSince : {};
    Object.keys(since).forEach(function (id) {
      if (!since[id]) return;
      var friend = circleFriendById(id);
      if (!friend) return;
      var post = circlePostByAuthor(friend);
      if (!post || !post.id) return;
      topics.push({
        kind: "friends",
        target: post.id,
        href: "#tower-post-" + post.id,
        people: [me, friend],
        plus: true,
        text: circleAt(me.name) + " + " + circleAt(friend.name) + " just became friends on COGNATION! ",
        action: "Congratulate them",
        at: Date.parse(since[id]) || 0
      });
    });
    var named = {};
    var roster = Array.isArray(personal.friendIds) ? personal.friendIds : [];
    roster.forEach(function (id) {
      var friend = circleFriendById(id);
      if (friend) named[friend.id] = friend;
    });
    circleProfileRecords().forEach(function (rec) {
      if (!rec || rec.kind !== "professional" || !rec.handle) return;
      var people = [];
      (Array.isArray(rec.followerIds) ? rec.followerIds : []).forEach(function (id) {
        if (named[id] && people.length < 3) people.push(named[id]);
      });
      if (people.length < 3) return;
      var handle = String(rec.handle).replace(/^@/, "");
      topics.push({
        kind: "follow",
        target: handle,
        href: "#tower-profile-" + handle,
        people: people,
        plus: false,
        text: people.map(function (friend) { return circleAt(friend.name); }).join(" ") + " all just followed @" + handle + ". ",
        action: "See whats new here",
        at: Number(rec.updatedAt) || 0
      });
    });
    (Array.isArray(personal.calendarEvents) ? personal.calendarEvents : []).forEach(function (ev) {
      if (!ev || !ev.hostHandle || !Array.isArray(ev.signupFriendIds) || ev.signupFriendIds.length < 2) return;
      var host = circleProfessionalByHandle(ev.hostHandle);
      if (!host || !host.handle || !ev.title) return;
      var people = [];
      ev.signupFriendIds.forEach(function (id) {
        var friend = circleFriendById(id);
        if (friend && people.length < 2) people.push(friend);
      });
      if (people.length < 2) return;
      var handle = String(host.handle).replace(/^@/, "");
      topics.push({
        kind: "signup",
        target: ev.id,
        href: "#tower-event-" + ev.id,
        people: people,
        plus: true,
        text: circleAt(people[0].name) + " + " + circleAt(people[1].name) + " both signed up for an upcoming " + ev.title + " hosted by @" + handle + ". ",
        action: "Schedule now",
        at: Date.parse(ev.date) || 0
      });
    });
    var rooms = {};
    try {
      var rawRooms = localStorage.getItem("cognation.commune.room-members.v1");
      if (rawRooms) rooms = JSON.parse(rawRooms) || {};
    } catch (eRooms) { rooms = {}; }
    CIRCLE_ROOMS.forEach(function (room) {
      var entry = rooms[room.id];
      if (!entry) return;
      var ids = Array.isArray(entry) ? entry : Object.keys(entry);
      var people = [];
      var at = 0;
      ids.forEach(function (id) {
        var friend = circleFriendById(id);
        if (!friend || people.length >= 2) return;
        people.push(friend);
        if (!Array.isArray(entry) && entry[id]) {
          var stamp = Date.parse(entry[id]);
          if (!isNaN(stamp) && stamp > at) at = stamp;
        }
      });
      if (people.length < 2) return;
      topics.push({
        kind: "room",
        target: room.id,
        href: "#commune-room-" + room.id,
        people: people,
        plus: true,
        text: circleAt(people[0].name) + " + " + circleAt(people[1].name) + " join heated discussion in " + room.title + ". ",
        action: "Join now",
        at: at
      });
    });
    topics.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    return topics;
  }

  function circleResolveTopics() {
    var fresh = circleCollectRealActivity();
    if (!circleShownTopics.length) {
      circleShownTopics = fresh.slice(0, 5);
      return circleShownTopics.slice();
    }
    var known = {};
    circleShownTopics.forEach(function (topic) { known[circleTopicKey(topic)] = true; });
    var hasNew = false;
    fresh.forEach(function (topic) {
      if (!known[circleTopicKey(topic)]) hasNew = true;
    });
    if (!hasNew) return circleShownTopics.slice();
    var seen = {};
    var next = [];
    fresh.concat(circleShownTopics).forEach(function (topic) {
      var key = circleTopicKey(topic);
      if (seen[key] || next.length >= 5) return;
      seen[key] = true;
      next.push(topic);
    });
    circleShownTopics = next;
    return next.slice();
  }

  function circleRefreshDue() {
    return !circleTopicsRefreshedAt || (Date.now() - circleTopicsRefreshedAt) >= CIRCLE_REFRESH_MS;
  }

  function applyCircleTopics(force) {
    if (!force && !circleRefreshDue()) return false;
    var before = circleShownTopics.map(circleTopicKey).join("\n");
    circleResolveTopics();
    circleTopicsRefreshedAt = Date.now();
    return before !== circleShownTopics.map(circleTopicKey).join("\n");
  }

  function repaintCircleRing() {
    var layer = document.querySelector("[data-circle-fall]");
    if (!layer) return;
    var old = layer.querySelector("[data-circle-ring]");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    paintCircleRing(layer);
  }

  function circleTopicPhoto(friend) {
    var face = document.createElement("span");
    face.className = "circle-topic-photo";
    face.setAttribute("aria-hidden", "true");
    var index = 0;
    DEMO_FRIENDS.forEach(function (entry, entryIndex) {
      if (entry.id === friend.id) index = entryIndex;
    });
    paintFriendPicture(face, friend, index);
    return face;
  }

  function paintCircleRing(layer) {
    var topics = circleShownTopics.slice();
    var ring = document.createElement("div");
    ring.className = "circle-ring";
    ring.setAttribute("data-circle-ring", "");
    ring.setAttribute("data-circle-topics", String(topics.length));
    paintCircleLightning(ring);
    if (!topics.length) {
      layer.appendChild(ring);
      return;
    }
    var spin = document.createElement("div");
    spin.className = "circle-ring-spin";
    topics.forEach(function (topic) {
      var item = document.createElement("div");
      item.className = "circle-topic";
      item.setAttribute("data-circle-topic", topic.kind);
      item.setAttribute("data-circle-target", topic.target);
      var people = document.createElement("div");
      people.className = "circle-topic-people" + (topic.people.length > 2 ? " is-three" : "");
      topic.people.forEach(function (friend, index) {
        if (topic.plus && index > 0) {
          var plus = document.createElement("span");
          plus.className = "circle-topic-plus";
          plus.setAttribute("aria-hidden", "true");
          plus.textContent = "+";
          people.appendChild(plus);
        }
        people.appendChild(circleTopicPhoto(friend));
      });
      var copy = document.createElement("p");
      copy.appendChild(document.createTextNode(topic.text));
      var link = document.createElement("a");
      link.href = topic.href;
      link.textContent = topic.action;
      link.setAttribute("data-circle-action", topic.action);
      copy.appendChild(link);
      item.appendChild(people);
      item.appendChild(copy);
      spin.appendChild(item);
    });
    ring.appendChild(spin);
    layer.appendChild(ring);
  }

  /* Cap 250 — ring shell as Circle page background: lightning + five spots. */
  function paintCircleRingShell(layer, people) {
    if (!layer) return;
    var old = layer.querySelector("[data-circle-ring]");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    people = Array.isArray(people) ? people.slice(0, CIRCLE_SPOTS.length) : [];
    var ring = document.createElement("div");
    ring.className = "circle-ring";
    ring.setAttribute("data-circle-ring", "");
    ring.setAttribute("data-circle-topics", String(people.length));
    ring.setAttribute("data-circle-shell", "1");
    paintCircleLightning(ring);
    var spin = document.createElement("div");
    spin.className = "circle-ring-spin";
    /* People keep their shared bob. The solid inner ellipse is a pseudo on the spin and stays still. */
    var crew = document.createElement("div");
    crew.className = "circle-ring-people";
    var i;
    for (i = 0; i < CIRCLE_SPOTS.length; i++) {
      var spotMeta = CIRCLE_SPOTS[i];
      var spot = document.createElement("div");
      spot.className = "circle-spot";
      spot.setAttribute("data-circle-spot", spotMeta.id);
      spot.setAttribute("data-circle-topic", "shell");
      var person = people[i] || null;
      if (person && person.name) {
        spot.classList.add("is-filled");
        spot.classList.remove("is-empty");
        spot.textContent = String(person.name).trim().charAt(0).toUpperCase() || "?";
        var spotCaption = person.caption || person.activity || "";
        spot.setAttribute("aria-label", person.caption || !person.activity ? person.name : person.name + ". " + person.activity);
        if (person.userId) spot.setAttribute("data-circle-person", person.userId);
        /* Tower picture: server photo_url, else that profile's Tower avatar. */
        var photoApi = window.CognationProfilePhoto;
        if (person.photoUrl && photoApi && typeof photoApi.applyPhoto === "function") photoApi.applyPhoto(spot, person.photoUrl);
        else paintFriendPicture(spot, { id: person.handle || person.userId, name: person.name }, i);
        if (person.handle) {
          var handle = String(person.handle);
          spot.setAttribute("data-circle-handle", handle);
          spot.setAttribute("role", "link");
          spot.setAttribute("tabindex", "0");
          var openSpot = openCircleProfile(handle);
          spot.addEventListener("click", openSpot);
          spot.addEventListener("keydown", function (ev) {
            if (ev && (ev.key === "Enter" || ev.key === " ")) { if (ev.preventDefault) ev.preventDefault(); openSpot(); }
          });
        }
        if (spotCaption) {
          spot.classList.add("has-caption");
          var caption = document.createElement("span");
          caption.className = "circle-spot-caption";
          caption.setAttribute("data-circle-caption", "");
          caption.textContent = spotCaption;
          spot.appendChild(caption);
        }
      } else {
        spot.classList.add("is-empty");
        spot.classList.remove("is-filled");
        spot.textContent = "";
        spot.setAttribute("aria-hidden", "true");
      }
      crew.appendChild(spot);
    }
    spin.appendChild(crew);
    ring.appendChild(spin);
    layer.appendChild(ring);
    placeCircleSpots();
  }

  /* With Alexa's background on, the five spots sit where her five placeholder
     squares were (image px, relative to the ring centre at 605,262), still. */
  var PULSE_BG_SQUARES = {
    left: { x: -478, y: -42, s: 1.15 },
    center: { x: 12, y: 146, s: 1.4 },
    right: { x: 503, y: -42, s: 1.15 },
    "back-right": { x: 216, y: -202, s: 1 },
    "back-left": { x: -192, y: -202, s: 1 }
  };
  function pinCircleSpotsToBackground(spots) {
    var layer = document.querySelector("[data-circle-fall][data-pulse-bg]");
    if (!layer) return false;
    /* Phones: shrink the image so its strands (image x 58..1181, 576px right of the
       ring centre) stay at least 8px inside the panel. Desktop keeps its CSS scale. */
    var phone = window.matchMedia && window.matchMedia("(max-width: 600px)").matches;
    layer.style.removeProperty("--pulse-bg-k");
    var GROW_MIN = 0.55;
    if (phone && layer.clientWidth > 0) {
      var cssK = parseFloat(getComputedStyle(layer).getPropertyValue("--pulse-bg-k")) || 0.31;
      var fitK = (layer.clientWidth / 2 - 8) / 576;
      /* The left/right frames must also stay >= 8px inside the panel (live 390 check:
         the right frame sat 7px from the edge). 10px target leaves room for rounding. */
      for (var f = 0; f < spots.length; f++) {
        var side = PULSE_BG_SQUARES[spots[f].getAttribute("data-circle-spot")];
        if (!side || !side.x) continue;
        var half = (spots[f].offsetWidth || 70.4) * side.s * Math.max(cssK, GROW_MIN) / 2;
        var spotK = (layer.clientWidth / 2 - 10 - half) / Math.abs(side.x);
        if (spotK < fitK) fitK = spotK;
      }
      if (fitK < cssK) layer.style.setProperty("--pulse-bg-k", fitK.toFixed(4));
    }
    var k = parseFloat(getComputedStyle(layer).getPropertyValue("--pulse-bg-k")) || 0.954;
    var grow = Math.max(k, GROW_MIN);
    for (var i = 0; i < spots.length; i++) {
      var sq = PULSE_BG_SQUARES[spots[i].getAttribute("data-circle-spot")];
      if (!sq) continue;
      spots[i].style.transform = "translate(-50%, -50%) translate(" + (sq.x * k).toFixed(1) + "px," + (sq.y * k).toFixed(1) + "px) scale(" + (sq.s * grow).toFixed(3) + ")";
      spots[i].style.zIndex = String(Math.round(sq.s * 100));
      /* names under the frames divide by this so they land at true screen px */
      spots[i].style.setProperty("--pulse-spot-s", (sq.s * grow).toFixed(3));
    }
    return true;
  }

  function placeCircleSpots() {
    if (!circleFallState) return;
    var spots = document.querySelectorAll("[data-circle-ring] [data-circle-spot]");
    if (!spots.length) return;
    pinCircleSpotsToBackground(spots);
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var shift = reduce ? 0 : ((performance.now() - circleFallState.ringStarted) / 28000) * CIRCLE_SPOTS.length;
    var i;
    var front = 0;
    var frontScale = -1;
    for (i = 0; i < spots.length; i++) {
      var pos = circleSpotAt(i + shift);
      var depth = pos.s / CIRCLE_SCALE;
      var scale = 0.8 + Math.max(0, depth - 0.68) * 0.4;
      var bob = reduce ? 0 : Math.sin(performance.now() / 360 + i * 1.2) * 18;
      var size = 5.6;
      spots[i].style.width = size.toFixed(2) + "rem";
      spots[i].style.height = size.toFixed(2) + "rem";
      spots[i].style.transform =
        "translate(-50%, -50%) translate(" + pos.x.toFixed(1) + "px," + (pos.y + bob).toFixed(1) + "px) scale(" + scale.toFixed(3) + ")";
      spots[i].style.zIndex = String(Math.round(pos.s * 100));
      spots[i].style.setProperty("--pulse-spot-s", scale.toFixed(3));
      if (scale > frontScale) { frontScale = scale; front = i; }
    }
    for (i = 0; i < spots.length; i++) {
      var cap = spots[i].querySelector("[data-circle-caption]");
      if (cap) cap.hidden = i !== front;
      if (i === front) spots[i].style.zIndex = "30";
    }
  }

  function openCircleProfile(handle) {
    return function () {
      if (!handle) return;
      if (window.CognationTowerOpenProfile) window.CognationTowerOpenProfile(handle);
      try { stopCircleFall(); } catch (eStop) {}
    };
  }

  function fillCircleSpots(people) {
    var layer = document.querySelector("[data-circle-fall]");
    if (!layer) return;
    paintCircleRingShell(layer, people || []);
  }

    function circleSpotAt(phase) {
    var count = CIRCLE_SPOTS.length;
    var wrapped = ((phase % count) + count) % count;
    var index = Math.floor(wrapped);
    var mix = wrapped - index;
    var from = CIRCLE_SPOTS[index];
    var to = CIRCLE_SPOTS[(index + 1) % count];
    var toAngle = to.angle;
    if (toAngle > from.angle) toAngle -= 360;
    var p = circleProject(from.angle + (toAngle - from.angle) * mix);
    return {
      id: mix < 0.5 ? from.id : to.id,
      x: p.x,
      y: p.y,
      s: p.s
    };
  }

  function placeCircleTopics() {
    if (!circleFallState) return;
    var topics = document.querySelectorAll("[data-circle-topic]");
    if (!topics.length) return;
    var shift = ((performance.now() - circleFallState.ringStarted) / 28000) * CIRCLE_SPOTS.length;
    var nearest = 0;
    for (var i = 0; i < topics.length; i++) {
      var spot = circleSpotAt(i + shift);
      if (spot.s > nearest) nearest = spot.s;
      topics[i].style.transform = "translate(-50%, -50%) translate(" + spot.x.toFixed(1) + "px," + spot.y.toFixed(1) + "px) scale(" + spot.s.toFixed(3) + ")";
      topics[i].style.zIndex = String(Math.round(spot.s * 100));
      topics[i].setAttribute("data-circle-spot", spot.id);
    }
    for (var j = 0; j < topics.length; j++) {
      var scale = parseFloat((topics[j].style.transform.match(/scale\(([^)]+)\)/) || [])[1] || "0");
      topics[j].style.pointerEvents = scale > nearest * 0.9 ? "auto" : "none";
    }
  }

  function openTowerEvent(eventId) {
    eventId = String(eventId || "");
    if (typeof window.CognationTowerApplySide === "function") {
      window.CognationTowerApplySide("private");
    }
    var p = TowerProfileStore.get();
    seedCalendarEventsIfMissing(p);
    var ev = null;
    (p.calendarEvents || []).forEach(function (item) {
      if (item && item.id === eventId) ev = item;
    });
    if (!ev) return false;
    document.querySelectorAll("[data-tower-app]").forEach(function (root) {
      var view = getCalendarViewState(root, "private");
      var parts = String(ev.date || "").split("-");
      view.year = parseInt(parts[0], 10);
      view.month0 = parseInt(parts[1], 10) - 1;
      view.selected = ev.date;
      refreshTowerCalendars(root);
    });
    window.setTimeout(function () {
      var row = document.querySelector('[data-tower-private-side] [data-event-id="' + eventId + '"]');
      var target = row || document.querySelector("[data-tower-private-side] [data-tower-private-calendar]");
      if (target && target.scrollIntoView) target.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    return true;
  }

  function openTowerPost(postId) {
    postId = String(postId || "");
    if (typeof window.CognationSignalOpen === "function") {
      window.CognationSignalOpen("feed");
    } else if (typeof window.CognationSignalApplyPane === "function") {
      window.CognationSignalApplyPane("feed");
    }
    window.setTimeout(function () {
      var host = document.querySelector("[data-signal-feed-host]") || document;
      var post = host.querySelector('[data-tower-post="' + postId + '"]');
      var heart = post && post.querySelector('[data-tower-react="❤️"]');
      var target = heart || post || host.querySelector("[data-tower-feed]");
      if (target && target.scrollIntoView) target.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return true;
  }

  function startCircleFall() {
    stopCircleFall();
    var ids = circleFriendIds();
    var layer = document.createElement("div");
    layer.className = "circle-fall";
    layer.setAttribute("data-circle-fall", "");
    layer.setAttribute("data-circle-count", String(ids.length));
    layer.setAttribute("data-circle-refresh-ms", String(CIRCLE_REFRESH_MS));
    document.body.appendChild(layer);
    document.body.classList.add("is-circle-open");
    placeCircleFallLayer(layer);
    document.querySelectorAll(".app-topbar [role='tab']").forEach(function (tab) {
      tab.setAttribute("aria-selected", "false");
      tab.tabIndex = -1;
    });
    document.querySelectorAll(".tab-panels > [role='tabpanel']").forEach(function (panel) {
      panel.hidden = true;
    });
    var shortcut = document.querySelector('[data-tower-anchor="circle"]');
    if (shortcut) shortcut.setAttribute("aria-pressed", "true");

    /* Cap 250 — Circle ring as page background (Alexa lock 2026-10-07 ~12:57 CT).
       Indigo gradient + halo + cyan/violet synapse wave + five empty spots when
       nothing to show. Keep friendships/follows hydrate; fill spots when present.
       Do not start portrait physics or the 15-minute demo-topic loop. */
    layer.setAttribute("data-circle-count", "0");
    layer.removeAttribute("data-circle-refresh-ms");
    layer.setAttribute("data-circle-ring-shell", "");
    /* Alexa's PULSE background image (pulse-background PR). */
    layer.setAttribute("data-pulse-bg", "");
    paintCircleRingShell(layer, []);
    circleFallState = {
      bodies: [],
      raf: 0,
      last: performance.now(),
      started: performance.now(),
      ringStarted: performance.now(),
      refreshTimer: null,
      shellOnly: true
    };
    function frameShell() {
      var st = circleFallState;
      if (!st || !st.shellOnly) return;
      placeCircleSpots();
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { st.raf = 0; return; }
      st.raf = requestAnimationFrame(frameShell);
    }
    if (!window.__cognationPulseBgResize) {
      window.__cognationPulseBgResize = true;
      window.addEventListener("resize", function () { if (circleFallState) placeCircleSpots(); });
    }
    circleFallState.raf = requestAnimationFrame(frameShell);
    /* PM 2026-10-21 (Alexa's spec: PULSE shows your own friends only): the
       "X and Y became friends." pairs list (CognationCircleRelations.mount) is no
       longer mounted on PULSE. js/circle-saved-relations.js stays, unused here. */
    /* Alexa final spec 2026-10-20: the five halo frames are the viewer's MOST engaged
       friends and the falling circles are the LEAST engaged (js/pulse-falling-friends.js
       fills both from public Supabase activity). The pulse_mutual_introductions
       "friends doing one thing together" fill is no longer mounted here. */
    if (window.CognationPulseFall && typeof window.CognationPulseFall.mount === "function") {
      window.CognationPulseFall.mount(layer, {
        paint: function (el, friend, i) {
          paintFriendPicture(el, { id: friend.handle || friend.userId, name: friend.name }, i);
        },
        open: function (handle) {
          if (!handle) return;
          if (window.CognationTowerOpenProfile) {
            try { window.CognationTowerOpenProfile(handle); } catch (eOpen) {}
          } else {
            try { location.hash = "tower-profile-" + handle; } catch (eHash) {}
          }
          try { stopCircleFall(); } catch (eStop) {}
        }
      });
    }
    return;

    var w = window.innerWidth || 800;
    var bodies = [];
    ids.forEach(function (id, i) {
      var friend = circleFriendRecord(id);
      var friendIndex = 0;
      DEMO_FRIENDS.forEach(function (entry, idx) {
        if (entry.id === id) friendIndex = idx;
      });
      var size = 46 + ((i * 17) % 42);
      var handle = personalProfileHandle(id);
      var el = document.createElement("a");
      el.className = "circle-fall-portrait";
      el.href = "#tower-profile-" + handle;
      el.setAttribute("data-circle-fall-portrait", id);
      el.setAttribute("data-friend-handle", handle);
      el.setAttribute("aria-label", "Open " + friend.name + " tower");
      el.style.width = size + "px";
      el.style.height = size + "px";
      el.style.fontSize = Math.max(13, Math.round(size * 0.32)) + "px";
      paintFriendPicture(el, friend, friendIndex || i);
      el.addEventListener("click", function (ev) {
        ev.preventDefault();
        var h = el.getAttribute("data-friend-handle") || handle;
        if (window.CognationTowerOpenProfile) {
          try { window.CognationTowerOpenProfile(h); } catch (eOpen) {}
        } else {
          try { location.hash = "tower-profile-" + h; } catch (e) {}
        }
        try { stopCircleFall(); } catch (eStop) {}
      });
      layer.appendChild(el);
      var spread = Math.min(w * 0.58, 680);
      var t = ids.length <= 1 ? 0.5 : i / (ids.length - 1);
      var x = (w - spread) / 2 + t * spread - size / 2 + Math.sin(i * 2.2) * 22;
      var maxX = w - size - 2;
      if (x < 2) x = 2;
      if (x > maxX) x = maxX;
      bodies.push({
        el: el,
        id: id,
        x: x,
        y: -size - 12 - i * 46,
        vx: Math.sin(i * 1.7) * 34,
        vy: 20 + (i % 4) * 12,
        rot: Math.sin(i * 1.3) * 16,
        vr: Math.cos(i * 0.9) * 26,
        size: size,
        r: size / 2,
        sleep: false
      });
    });

    applyCircleTopics(circleRefreshDue());
    paintCircleRing(layer);

    circleFallState = {
      bodies: bodies,
      raf: 0,
      last: performance.now(),
      started: performance.now(),
      ringStarted: performance.now(),
      refreshTimer: window.setInterval(function () {
        if (applyCircleTopics(true)) repaintCircleRing();
      }, CIRCLE_REFRESH_MS)
    };
    function frame(now) {
      var st = circleFallState;
      if (!st || st.bodies !== bodies) return;
      if (!st.layerPlaced) {
        placeCircleFallLayer(layer);
        st.layerPlaced = true;
      }
      var dt = Math.min(0.034, (now - st.last) / 1000);
      if (!dt || dt < 0) dt = 0.016;
      st.last = now;
      integrateCircles(bodies, dt / 2);
      integrateCircles(bodies, dt / 2);
      bodies.forEach(function (b) {
        var floor = circleFloor(b);
        var edge = 6 + circleEdgePad(b);
        var maxX = circleMaxX(b);
        if (b.y > floor) b.y = floor;
        if (b.x < edge) { b.x = edge; if (b.vx < 0) b.vx = Math.abs(b.vx) * 0.4; }
        if (b.x > maxX) { b.x = maxX; if (b.vx > 0) b.vx = -Math.abs(b.vx) * 0.4; }
      });
      bodies.forEach(function (b) {
        paintCircleBody(b);
      });
      placeCircleTopics();
      st.raf = requestAnimationFrame(frame);
    }
    circleFallState.raf = requestAnimationFrame(frame);
  }

  if (window && typeof window.addEventListener === "function" && !window.__cognationCircleResize) {
    window.__cognationCircleResize = true;
    window.addEventListener("resize", function () {
      if (!circleFallState) return;
      placeCircleFallLayer(document.querySelector("[data-circle-fall]"));
      if (circleFallState.shellOnly) {
        placeCircleSpots();
        return;
      }
      circleFallState.bodies.forEach(function (b) {
        var floor = circleFloor(b);
        var edge = 6 + circleEdgePad(b);
        var maxX = circleMaxX(b);
        if (b.y > floor) b.y = floor;
        if (b.x < edge) b.x = edge;
        if (b.x > maxX) b.x = maxX;
        paintCircleBody(b);
      });
    });
  }

  window.CognationTowerOpenEvent = openTowerEvent;
  window.CognationTowerOpenPost = openTowerPost;

  if (window && typeof document !== "undefined" && !window.__cognationCircleFriendsHydrate) {
    window.__cognationCircleFriendsHydrate = true;
    function restartCircleIfOpen() {
      try {
        if (!document.body || !document.body.classList.contains("is-circle-open")) return;
        startCircleFall();
      } catch (eRestart) {}
    }
    document.addEventListener("cognation:remote-friends-loaded", restartCircleIfOpen);
    document.addEventListener("cognation:circle-friends-hydrated", restartCircleIfOpen);
  }

  window.CognationCircleFall = {
    start: function () {
      startCircleFall();
      try {
        if (window.CognationFriction) window.CognationFriction.begin("circle", "circle-fall");
      } catch (e) {}
    },
    stop: function () {
      var was = !!circleFallState;
      stopCircleFall();
      try {
        if (was && window.CognationFriction) window.CognationFriction.abandon("circle", "circle_stop");
      } catch (e2) {}
    },
    cap: CIRCLE_FALL_CAP,
    friendIds: circleFriendIds,
    refreshMs: CIRCLE_REFRESH_MS,
    fillSpots: fillCircleSpots,
    refresh: function () {
      var layer = document.querySelector("[data-circle-fall]");
      if (layer) paintCircleRingShell(layer, []);
      /* no pairs list on PULSE (PM 2026-10-21) */
      return [];
    }
  };

  /* Return to the signed-in account's own Tower (clears a friend deep-link). */
  window.CognationTowerOpenOwn = function () {
    /* Own page comes from getMyProfiles; a stale session id/handle (another
       account's page) is reset, and a #tower-profile-* that is not ours goes. */
    dropForeignActiveProfile();
    clearForeignTowerHash();
    document.querySelectorAll("[data-tower-app]").forEach(function (root) {
      applyTowerSide(root, "public");
      renderProfileChrome(root);
      syncProfileKindToggle(root);
      syncAddProfileUi(root);
    });
    document.dispatchEvent(new CustomEvent("cognation:tower-view-changed"));
    return true;
  };

  window.CognationTowerClearForeignHash = clearForeignTowerHash;

  window.CognationTowerOpenProfile = function (handle) {
    handle = String(handle || "").trim().replace(/^@/, "");
    if (!handle) return false;
    var hash = "tower-profile-" + handle;
    if (String(location.hash || "") !== "#" + hash) {
      try { location.hash = hash; } catch (e) {}
    }
    document.querySelectorAll("[data-tower-app]").forEach(function (root) {
      applyTowerSide(root, "public");
      renderProfileChrome(root);
    });
    document.dispatchEvent(new CustomEvent("cognation:tower-view-changed"));
    return true;
  };

  window.CognationTowerFriends = {
    cap: TOWER_FRIEND_CAP,
    add: addTowerFriend,
    has: viewerHasFriend,
  };
  window.CognationTowerFollowers = {
    add: addProfessionalFollower,
    normalizeFace: normalizeFollowerFace,
  };
  window.CognationTowerIsFounderOwner = isFounderOwner;
  window.CognationTowerNewsPostAppropriate = newsPostAppropriate;
  window.CognationTowerPostVisibleToViewer = towerPostVisibleToViewer;
  window.CognationTowerApplySide = function (side) {
    document.querySelectorAll("[data-tower-app]").forEach(function (root) {
      applyTowerSide(root, side);
    });
  };
  window.CognationTowerProfilePublicUrl = function (profile) {
    return profilePublicUrl(profile);
  };

  document.addEventListener("click", function (ev) {
    var hit = ev.target && ev.target.closest && ev.target.closest("[data-tower-add-friends], [data-tower-open-events]");
    if (!hit) return;
    if (hit.hasAttribute("data-tower-add-friends")) {
      var search = document.getElementById("people-search-input");
      if (search) search.focus();
      return;
    }
    var signal = document.getElementById("tab-signal");
    if (signal) signal.click();
    var feed = document.querySelector("[data-signal-pane-btn='feed']");
    if (feed) feed.click();
    var drop = document.querySelector("[data-tower-event-dropdown]");
    if (drop) drop.open = true;
  });

  function boot() {
    document.querySelectorAll("[data-tower-app]").forEach(initTower);
    /* Hash deep-link to a profile → public scrapbook side */
    if (hashRequestsPublicSide()) {
      document.querySelectorAll("[data-tower-app]").forEach(function (root) {
        applyTowerSide(root, "public");
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
