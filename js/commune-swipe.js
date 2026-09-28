/**
 * CGN-007 — COMMUNE swipe feed (demo / localStorage).
 * Wires HTML Coder shell hooks only.
 *
 * Hooks:
 *   [data-commune-shell], [data-commune-deck]
 *   [data-commune-card] + data-card-type
 *     (featured-service|ad|live-video|speed-dating|chatroom|random-fact)
 *   [data-commune-swipe="left|right"], [data-commune-enter-sim]
 *   [data-commune-see-dating] / [data-commune-dating-toggle]
 *   shell [data-dating-visible="true"] when age>18 AND toggle on
 *   Dating: [data-dating-photo], [data-dating-name],
 *     input[data-dating-rate], [data-dating-rate-value], [data-dating-rate-output],
 *     card [data-rating-selected="true"]
 * Leaves NEWS / js/commune.js alone.
 */
(function () {
  "use strict";

  var DISMISSED_KEY = "cognation.commune.swipe.dismissed.v1";
  var LIKES_KEY = "cognation.commune.swipe.likes.v1";
  var SHARES_KEY = "cognation.commune.swipe.shares.v1";
  var FOLLOWS_KEY = "cognation.commune.follows.v1";
  var SEE_DATING_KEY = "cognation.commune.seeDating.v1";
  var MEMBER_PROFILE_KEY = "cognation.member.profile.v1";
  var RATINGS_KEY = "cognation.commune.dating.ratings.v1";
  var DATING_LIKES_KEY = "cognation.commune.dating.likes.v1";
  var DATING_INBOUND_KEY = "cognation.commune.dating.inbound.v1";
  var AD_EVERY = 15;

  var TYPE = {
    FEATURED: "featured-service",
    AD: "ad",
    LIVE: "live-video",
    DATING: "speed-dating",
    CHAT: "chatroom",
    FACT: "random-fact",
  };

  function readJson(store, key, fallback) {
    try {
      var raw = store.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function writeJson(store, key, data) {
    try {
      store.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }
  function asIds(v) {
    return Array.isArray(v) ? v.filter(Boolean).map(String) : [];
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getDismissed() {
    return asIds(readJson(sessionStorage, DISMISSED_KEY, []));
  }
  function setDismissed(ids) {
    writeJson(sessionStorage, DISMISSED_KEY, asIds(ids));
  }
  function getLikes() {
    return asIds(readJson(localStorage, LIKES_KEY, []));
  }
  function setLikes(ids) {
    writeJson(localStorage, LIKES_KEY, asIds(ids));
  }
  function getShares() {
    return asIds(readJson(localStorage, SHARES_KEY, []));
  }
  function setShares(ids) {
    writeJson(localStorage, SHARES_KEY, asIds(ids));
  }
  function getFollows() {
    return asIds(readJson(localStorage, FOLLOWS_KEY, []));
  }
  function setFollows(ids) {
    writeJson(localStorage, FOLLOWS_KEY, asIds(ids));
    document.dispatchEvent(
      new CustomEvent("cognation:commune-follows-changed", {
        detail: { profileIds: getFollows() },
      })
    );
  }
  function isFollowing(id) {
    return getFollows().indexOf(String(id || "")) >= 0;
  }
  function toggleFollow(id) {
    id = String(id || "");
    if (!id) return false;
    var ids = getFollows();
    var i = ids.indexOf(id);
    if (i >= 0) ids.splice(i, 1);
    else ids.push(id);
    setFollows(ids);
    return ids.indexOf(id) >= 0;
  }

  function getMemberProfile() {
    var p = readJson(localStorage, MEMBER_PROFILE_KEY, null);
    if (!p || typeof p !== "object") p = {};
    try {
      if (!p.country) {
        var c = localStorage.getItem("cognation.member.country.v1");
        if (c) p.country = c;
      }
    } catch (e) {}
    return p;
  }
  function setMemberProfile(fields) {
    var next = Object.assign({}, getMemberProfile(), fields || {});
    writeJson(localStorage, MEMBER_PROFILE_KEY, next);
    if (next.country) {
      try {
        localStorage.setItem("cognation.member.country.v1", String(next.country));
      } catch (e) {}
      if (window.CognationMemberCountry && window.CognationMemberCountry.set) {
        try {
          window.CognationMemberCountry.set(next.country);
        } catch (e2) {}
      }
    }
    document.dispatchEvent(
      new CustomEvent("cognation:member-profile-updated", { detail: next })
    );
    return next;
  }
  function getMemberAge() {
    var n = parseInt(getMemberProfile().age, 10);
    return !isNaN(n) && n > 0 ? n : null;
  }

  function getSeeDating() {
    try {
      return localStorage.getItem(SEE_DATING_KEY) === "1";
    } catch (e) {
      return false;
    }
  }
  function setSeeDating(on) {
    try {
      localStorage.setItem(SEE_DATING_KEY, on ? "1" : "0");
    } catch (e) {}
  }
  /** Dating cards only when age > 18 AND toggle on. */
  function datingAllowed() {
    var age = getMemberAge();
    return !!(getSeeDating() && age != null && age > 18);
  }

  function getRatingsDoc() {
    var d = readJson(localStorage, RATINGS_KEY, null);
    if (!d || typeof d !== "object") d = { byProfile: {} };
    if (!d.byProfile || typeof d.byProfile !== "object") d.byProfile = {};
    return d;
  }
  function saveRating(profileId, raterId, score) {
    var doc = getRatingsDoc();
    if (!doc.byProfile[profileId]) doc.byProfile[profileId] = [];
    var list = doc.byProfile[profileId].filter(function (r) {
      return r && r.raterId !== raterId;
    });
    list.push({ raterId: raterId, score: score, at: Date.now() });
    doc.byProfile[profileId] = list;
    writeJson(localStorage, RATINGS_KEY, doc);
    return averageRating(profileId);
  }
  function averageRating(profileId) {
    var list = (getRatingsDoc().byProfile || {})[profileId] || [];
    if (!list.length) return null;
    var sum = 0;
    list.forEach(function (r) {
      sum += Number(r.score) || 0;
    });
    return Math.round((sum / list.length) * 10) / 10;
  }

  function getDatingLikes() {
    return asIds(readJson(localStorage, DATING_LIKES_KEY, []));
  }
  function addDatingLike(profileId) {
    var ids = getDatingLikes();
    if (ids.indexOf(profileId) < 0) ids.push(profileId);
    writeJson(localStorage, DATING_LIKES_KEY, ids);
  }
  function ensureInboundLikes() {
    var inbound = readJson(localStorage, DATING_INBOUND_KEY, null);
    inbound = asIds(inbound);
    if (inbound.length) return inbound;
    inbound = ["date-jordan-lee", "date-sam-okonkwo"];
    writeJson(localStorage, DATING_INBOUND_KEY, inbound);
    return inbound;
  }
  function isMutual(profileId) {
    return (
      getDatingLikes().indexOf(profileId) >= 0 &&
      ensureInboundLikes().indexOf(profileId) >= 0
    );
  }
  function currentRaterId() {
    try {
      var s =
        window.CognationAuth &&
        window.CognationAuth.getSession &&
        window.CognationAuth.getSession();
      if (s && s.username) return String(s.username);
    } catch (e) {}
    return "you";
  }

  var DEMO_ADS = [
    { id: "ad-tea", title: "Rosehip evening tea", body: "Sponsored · Soft focus blend for wind-down nights. Demo ad — no checkout.", cta: "Learn more (stub)" },
    { id: "ad-boost", title: "Boost your Tower Pro page", body: "Sponsored · Put community services in neighbors' COMMUNE mix.", cta: "See plans (stub)" },
    { id: "ad-market", title: "Saturday block market", body: "Sponsored · Peach stand + live strings. Local demo placement.", cta: "Save date (stub)" },
  ];
  var DEMO_LIVE = [
    { id: "live-yoga", title: "Live stretch circle", body: "Host Mira is live in the lobby · stub video chat — no camera opens.", host: "Mira Chen" },
    { id: "live-study", title: "Late study hall", body: "Quiet co-work stream · tap to pretend-join (demo).", host: "Jordan Lee" },
    { id: "live-kitchen", title: "Soup night kitchen cam", body: "Community cook-along stub. No real stream.", host: "Alex Rivera" },
  ];
  var DEMO_DATING = [
    { id: "date-jordan-lee", name: "Jordan Lee", photo: "assets/logo.svg", body: "Coffee walks · indie bookstores · dog parks.", vibe: "Casual" },
    { id: "date-sam-okonkwo", name: "Sam Okonkwo", photo: "assets/logo.svg", body: "Trail runs before brunch. Looking for kind energy.", vibe: "Outdoorsy" },
    { id: "date-mira-chen", name: "Mira Chen", photo: "assets/logo.svg", body: "Gallery nights and quiet playlists.", vibe: "Artsy" },
    { id: "date-riley-nguyen", name: "Riley Nguyen", photo: "assets/logo.svg", body: "Board-game cafés · low-key first meets.", vibe: "Playful" },
  ];
  var DEMO_ROOMS = [
    { id: "room-tech", title: "Tech workshop world", body: "Build figurines, debug aloud, stroll the circuit plaza.", roomKind: "tech", minAge: 0 },
    { id: "room-21", title: "21+ lounge world", body: "Age-gated hangout with walk-and-talk figurines (UI stub).", roomKind: "21+", minAge: 21 },
    { id: "room-intl", title: "International plaza", body: "Time-zone friendly commons · stub 3D figurine space.", roomKind: "international", minAge: 0 },
    { id: "room-oss", title: "Open-source garden", body: "Pair-programming pavilion in the tech world (demo).", roomKind: "tech", minAge: 0 },
  ];
  var DEMO_FACTS = [
    { id: "fact-1", body: "Octopuses have three hearts — two pump blood to the gills, one to the rest of the body. Source: aquarium / marine biology primers (Smithsonian Ocean)." },
    { id: "fact-2", body: "Sealed honey can last indefinitely; edible honey has been recovered from ancient Egyptian tombs. Source: Smithsonian Magazine / National Geographic explainers." },
    { id: "fact-3", body: "A group of flamingos is called a flamboyance. Source: collective-noun usage in major dictionaries / birding references." },
    { id: "fact-4", body: "The shortest recorded war — the Anglo-Zanzibar War of 1896 — lasted about 38–45 minutes. Source: Britannica; Wikipedia (Anglo-Zanzibar War)." },
    { id: "fact-5", body: "Botanically, bananas are berries; strawberries are not (they are aggregate accessory fruits). Source: botanical definitions / university extension explainers." },
    { id: "fact-6", body: "Earth holds ~3 trillion trees (2015 Nature estimate) vs roughly 100–400 billion stars in the Milky Way — so trees outnumber galactic stars on current estimates. Source: Crowther et al., Nature 2015; NASA star-count ranges; Snopes fact-check." },
    { id: "fact-7", body: "Wombat droppings are cube-shaped, which helps them mark territory without the pellets rolling away. Source: peer-reviewed wombat morphology coverage / science explainers." },
    { id: "fact-8", body: "“Steady” Ed Headrick — father of the modern Frisbee and disc golf — had his ashes molded into memorial flying discs after his 2002 death. Source: BBC News; PDGA; Wikipedia (Ed Headrick)." },
  ];

  var FALLBACK_SERVICES = [
    { id: "svc-demo-yoga", profileId: "prof-demo-mira-pro", fromName: "Mira Chen · Wellness", title: "Neighborhood stretch drop-in", body: "Saturday mornings on the green · sliding scale." },
    { id: "svc-demo-legal", profileId: "prof-demo-jordan-pro", fromName: "Jordan Lee · Civic Help", title: "Zoning packet office hours", body: "Free 20-minute consults for block petitions." },
  ];

  function featuredFromFollows() {
    var follows = getFollows();
    var out = [];
    var accts = window.CognationAccounts;
    if (accts && typeof accts.getProfileById === "function") {
      follows.forEach(function (pid) {
        var rec = accts.getProfileById(pid);
        if (!rec) return;
        var posts = Array.isArray(rec.featuredPosts) ? rec.featuredPosts : [];
        posts.forEach(function (post, idx) {
          if (!post) return;
          out.push({
            id: "svc-" + pid + "-" + (post.id || idx),
            type: TYPE.FEATURED,
            profileId: pid,
            fromName: rec.displayName || rec.displayName || rec.handle || "Professional",
            title: post.title || "Community service",
            body: post.body || "",
            likeable: post.likeable !== false,
          });
        });
      });
    }
    if (!out.length) {
      FALLBACK_SERVICES.forEach(function (s) {
        out.push({
          id: s.id,
          type: TYPE.FEATURED,
          profileId: s.profileId,
          fromName: s.fromName,
          title: s.title,
          body: s.body,
          likeable: true,
        });
      });
    }
    return out;
  }

  function buildDeckCards() {
    ensureInboundLikes();
    var dismissed = {};
    getDismissed().forEach(function (id) {
      dismissed[id] = true;
    });
    var pool = [];

    featuredFromFollows().forEach(function (c) {
      pool.push(c);
    });
    DEMO_LIVE.forEach(function (c) {
      pool.push({
        id: c.id,
        type: TYPE.LIVE,
        title: c.title,
        body: c.body,
        host: c.host,
        likeable: true,
      });
    });
    if (datingAllowed()) {
      DEMO_DATING.forEach(function (c) {
        pool.push({
          id: c.id,
          type: TYPE.DATING,
          title: c.name,
          name: c.name,
          photo: c.photo,
          body: c.body,
          vibe: c.vibe,
          profileId: c.id,
          likeable: true,
          dating: true,
        });
      });
    }
    DEMO_ROOMS.forEach(function (c) {
      pool.push({
        id: c.id,
        type: TYPE.CHAT,
        title: c.title,
        body: c.body,
        roomKind: c.roomKind,
        minAge: c.minAge || 0,
        likeable: false,
      });
    });
    DEMO_FACTS.forEach(function (c) {
      /* CGN-011: only News-desk true / fact-checked statements (DEMO_FACTS curated) */
      if (c && c.verified === false) return;
      pool.push({
        id: c.id,
        type: TYPE.FACT,
        title: "Stumble fact",
        body: c.body,
        likeable: true,
        verified: true,
      });
    });

    pool = shuffle(pool).filter(function (c) {
      if (!c || !c.id || dismissed[c.id]) return false;
      if (c.type === TYPE.FACT && c.verified === false) return false;
      return true;
    });

    var ads = shuffle(DEMO_ADS);
    var adIdx = 0;
    var withAds = [];
    for (var i = 0; i < pool.length; i++) {
      withAds.push(pool[i]);
      if (withAds.length % AD_EVERY === 0) {
        var ad = ads[adIdx % ads.length];
        adIdx += 1;
        var adCard = {
          id: ad.id + "-slot-" + withAds.length,
          type: TYPE.AD,
          title: ad.title,
          body: ad.body,
          cta: ad.cta,
          likeable: false,
        };
        if (!dismissed[adCard.id]) withAds.push(adCard);
      }
    }
    if (withAds.length && withAds.length < AD_EVERY) {
      var hasAd = withAds.some(function (c) {
        return c.type === TYPE.AD;
      });
      if (!hasAd) {
        var extra = ads[0];
        withAds.push({
          id: extra.id + "-bonus",
          type: TYPE.AD,
          title: extra.title,
          body: extra.body,
          cta: extra.cta,
          likeable: false,
        });
      }
    }
    return withAds;
  }

  var state = {
    shell: null,
    deck: null,
    statusEl: null,
    cards: [],
    index: 0,
    swipeCount: 0,
    pointer: null,
    busy: false,
  };

  function typeLabel(t) {
    switch (t) {
      case TYPE.FEATURED:
        return "Featured service";
      case TYPE.AD:
        return "Sponsored";
      case TYPE.LIVE:
        return "Live video";
      case TYPE.DATING:
        return "Speed dating";
      case TYPE.CHAT:
        return "Chatroom";
      case TYPE.FACT:
        return "Random fact";
      default:
        return "COMMUNE";
    }
  }

  function syncDatingVisibility() {
    if (!state.shell) return;
    var allowed = datingAllowed();
    if (allowed) state.shell.setAttribute("data-dating-visible", "true");
    else state.shell.removeAttribute("data-dating-visible");

    var toggle = state.shell.querySelector(
      "[data-commune-see-dating], [data-commune-dating-toggle]"
    );
    if (toggle && toggle.type === "checkbox") {
      var age = getMemberAge();
      var blocked = age != null && age <= 18;
      toggle.disabled = blocked;
      if (blocked) {
        toggle.checked = false;
        setSeeDating(false);
        state.shell.removeAttribute("data-dating-visible");
      } else {
        toggle.checked = getSeeDating();
      }
      toggle.setAttribute("aria-checked", toggle.checked ? "true" : "false");
    }
    var hint = state.shell.querySelector(
      ".commune-dating-toggle-hint, #commune-dating-toggle-hint"
    );
    if (hint) {
      var age2 = getMemberAge();
      if (age2 != null && age2 <= 18) {
        hint.textContent =
          "Dating content is unavailable under 19. Your profile age is " + age2 + ".";
      } else if (!getSeeDating()) {
        hint.textContent =
          "Off by default. Dating cards show only when this is on and you're over 18.";
      } else {
        hint.textContent =
          "Dating content on · age " +
          (age2 != null ? age2 : "?") +
          " · rate before swipe-right.";
      }
    }
  }

  function setStatus(msg) {
    if (!state.statusEl && state.shell) {
      state.statusEl = state.shell.querySelector("[data-commune-swipe-status]");
      if (!state.statusEl) {
        state.statusEl = document.createElement("p");
        state.statusEl.className = "commune-swipe-status";
        state.statusEl.setAttribute("data-commune-swipe-status", "");
        state.statusEl.setAttribute("role", "status");
        state.statusEl.setAttribute("aria-live", "polite");
        state.shell.appendChild(state.statusEl);
      }
    }
    if (state.statusEl) {
      state.statusEl.hidden = !msg;
      state.statusEl.textContent = msg || "";
    }
  }

  function updateIndexUi() {
    var total = state.cards.length;
    var n = total ? Math.min(state.index + 1, total) : 0;
    var idx = state.shell && state.shell.querySelector("[data-commune-index]");
    if (idx) idx.textContent = total ? "Card " + n + " of " + total : "Deck clear";
    var dots = state.shell && state.shell.querySelector("[data-commune-dots]");
    if (!dots) return;
    var buttons = dots.querySelectorAll("[data-commune-dot]");
    if (buttons.length !== total) {
      dots.innerHTML = "";
      for (var i = 0; i < total; i++) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "commune-swipe-dot" + (i === state.index ? " is-active" : "");
        b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", i === state.index ? "true" : "false");
        b.setAttribute("aria-label", "Card " + (i + 1));
        b.setAttribute("data-commune-dot", String(i));
        dots.appendChild(b);
      }
    } else {
      buttons.forEach(function (b, i) {
        var on = i === state.index;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
    }
  }

  function currentCard() {
    return state.cards[state.index] || null;
  }

  function syncLikeButtonGate() {
    var card = currentCard();
    var likeBtn =
      state.shell && state.shell.querySelector('[data-commune-swipe="right"]');
    var active =
      state.deck &&
      state.deck.querySelector(
        "[data-commune-card].is-active, .commune-card.is-active"
      );
    var rated = active && active.getAttribute("data-rating-selected") === "true";
    var needs = !!(card && card.type === TYPE.DATING && !rated);
    if (state.shell) {
      state.shell.classList.toggle("is-dating-needs-rating", needs);
    }
    if (likeBtn) {
      if (card && card.type === TYPE.DATING) {
        likeBtn.disabled = !rated;
        likeBtn.setAttribute("aria-disabled", rated ? "false" : "true");
      } else {
        likeBtn.disabled = false;
        likeBtn.setAttribute("aria-disabled", "false");
      }
    }
  }

  function renderCard(card, isFront) {
    var el = document.createElement("article");
    el.className = "commune-card" + (isFront ? " is-active" : "");
    el.setAttribute("data-commune-card", "");
    el.setAttribute("data-card-type", card.type);
    el.setAttribute("data-card-id", card.id);
    if (card.type === TYPE.FACT) {
      if (card.verified === false) {
        el.hidden = true;
        el.setAttribute("data-fact-verified", "false");
        return el;
      }
      el.setAttribute("data-fact-verified", "true");
      el.classList.add("commune-card--fact");
    }
    if (card.dating) {
      el.setAttribute("data-dating-content", "true");
      el.setAttribute("data-dating-opt-in", "true");
    }
    if (!isFront) {
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
    } else {
      el.setAttribute("tabindex", "0");
      el.setAttribute(
        "aria-label",
        typeLabel(card.type) +
          ", card " +
          (state.index + 1) +
          " of " +
          state.cards.length
      );
    }

    var html = "";
    html +=
      '<p class="commune-card-kicker">' +
      escapeHtml(typeLabel(card.type)) +
      (card.type === TYPE.FACT
        ? ' <span class="commune-fact-verified" aria-label="Verified">✓ Verified</span>'
        : "") +
      "</p>";

    if (card.type === TYPE.DATING) {
      html +=
        '<h4 class="commune-card-title" data-dating-name>' +
        escapeHtml(card.name || card.title) +
        "</h4>";
      html +=
        '<figure class="commune-dating-photo"><img data-dating-photo src="' +
        escapeHtml(card.photo || "assets/logo.svg") +
        '" alt="Profile photo of ' +
        escapeHtml(card.name || "member") +
        '" width="320" height="320"></figure>';
      html +=
        '<p class="commune-card-body">' +
        escapeHtml(card.body || "") +
        (card.vibe ? " · " + escapeHtml(card.vibe) : "") +
        "</p>";
      var avg = averageRating(card.profileId || card.id);
      html +=
        '<div class="commune-dating-rate" data-dating-rate-wrap>' +
        '<label class="commune-dating-rate-label">Your rating <span class="req" aria-hidden="true">*</span></label>' +
        '<p class="form-hint">Required before Like / swipe right' +
        (avg != null ? " · community avg " + avg : "") +
        "</p>" +
        '<div class="commune-dating-rate-row">' +
        '<input type="range" min="1" max="10" step="1" value="5" data-dating-rate data-dating-rate-value aria-valuemin="1" aria-valuemax="10">' +
        '<output class="commune-dating-rate-output" data-dating-rate-output>5</output>' +
        "</div>" +
        '<p class="commune-dating-rate-status" data-dating-rate-status hidden role="status" aria-live="polite"></p>' +
        "</div>";
      html += '<span class="commune-card-badge">Opt-in</span>';
    } else {
      html +=
        '<h4 class="commune-card-title">' + escapeHtml(card.title || "") + "</h4>";
      if (card.fromName) {
        html +=
          '<p class="commune-card-meta">From ' +
          escapeHtml(card.fromName) +
          "</p>";
      }
      if (card.host) {
        html +=
          '<p class="commune-card-meta">Host · ' + escapeHtml(card.host) + "</p>";
      }
      if (card.type === TYPE.LIVE) {
        html +=
          '<div class="commune-live-chrome" aria-hidden="true">' +
          '<button type="button" class="commune-live-play" tabindex="-1" disabled>▶</button>' +
          '<span class="commune-live-pulse"></span><span class="commune-live-label">LIVE</span></div>';
      }
      html +=
        '<p class="commune-card-body">' + escapeHtml(card.body || "") + "</p>";
      if (card.roomKind) {
        html +=
          '<p class="commune-card-meta">Room · ' +
          escapeHtml(card.roomKind) +
          (card.minAge >= 21 ? " · 21+" : "") +
          "</p>";
      }
      if (card.type === TYPE.CHAT) {
        html +=
          '<button type="button" class="btn btn-primary commune-enter-sim" data-commune-enter-sim>Enter sim-world</button>' +
          '<p class="commune-sim-msg" data-commune-sim-msg hidden role="status"></p>';
      }
      if (card.type === TYPE.AD && card.cta) {
        html +=
          '<button type="button" class="btn btn-secondary" data-commune-ad-cta>' +
          escapeHtml(card.cta) +
          "</button>";
      }
      if (card.type === TYPE.LIVE) {
        html +=
          '<button type="button" class="btn btn-secondary" data-commune-live-join>Join stub room</button>' +
          '<p class="cgn-deferral" role="note">Demo / local only</p>';
      }
      if (card.type === TYPE.FEATURED) {
        html += '<span class="commune-card-badge">Featured</span>';
      }
      if (card.type === TYPE.AD) {
        html +=
          '<span class="commune-card-badge commune-card-badge--ad">Ad</span>';
      }
    }

    el.innerHTML = html;
    return el;
  }

  function bindCardActions(el, card) {
    var range = el.querySelector("input[data-dating-rate]");
    var out = el.querySelector("[data-dating-rate-output]");
    var status = el.querySelector("[data-dating-rate-status]");
    if (range) {
      var markRated = function () {
        el.setAttribute("data-rating-selected", "true");
        var v = String(range.value);
        range.setAttribute("data-dating-rate-value", v);
        range.setAttribute("aria-valuenow", v);
        if (out) out.textContent = v;
        /* also support dual attr on same input */
        if (range.hasAttribute("data-dating-rate-value")) {
          range.setAttribute("data-dating-rate-value", v);
        }
        var valEl = el.querySelector("[data-dating-rate-value]:not(input)");
        if (valEl) valEl.textContent = v;
        if (status) {
          status.hidden = false;
          status.textContent = "Rated " + v + " — you can swipe right.";
          status.classList.remove("is-error");
        }
        syncLikeButtonGate();
      };
      range.addEventListener("input", markRated);
      range.addEventListener("change", markRated);
    }

    var sim = el.querySelector("[data-commune-enter-sim]");
    if (sim) {
      sim.addEventListener("click", function (ev) {
        ev.stopPropagation();
        enterSim(card, el);
      });
    }
    var live = el.querySelector("[data-commune-live-join]");
    if (live) {
      live.addEventListener("click", function (ev) {
        ev.stopPropagation();
        setStatus("Live video stub — no camera or WebRTC in this demo.");
      });
    }
    var ad = el.querySelector("[data-commune-ad-cta]");
    if (ad) {
      ad.addEventListener("click", function (ev) {
        ev.stopPropagation();
        setStatus("Ad CTA stub — nothing purchased.");
      });
    }
  }

  function enterSim(card, el) {
    var msg = el.querySelector("[data-commune-sim-msg]");
    var minAge = card.minAge || 0;
    var age = getMemberAge();
    if (minAge >= 21) {
      if (age == null) {
        if (msg) {
          msg.hidden = false;
          msg.textContent = "Set your age on sign-up to enter 21+ rooms.";
        }
        setStatus("Age required for 21+ rooms.");
        return;
      }
      if (age < 21) {
        if (msg) {
          msg.hidden = false;
          msg.textContent =
            "You must be 21 or older. Your profile age is " + age + ".";
        }
        setStatus("Blocked: 21+ room · profile age " + age + ".");
        return;
      }
    }
    if (msg) {
      msg.hidden = false;
      msg.textContent =
        "Simulation world stub — imagine 3D figurines walking and talking. No WebXR engine here.";
    }
    setStatus('Entered "' + (card.title || 'world') + '" simulation stub.');
  }

  function paintDeck() {
    if (!state.deck) return;
    state.deck.innerHTML = "";
    var card = currentCard();
    if (!card) {
      var empty = document.createElement("div");
      empty.className = "commune-swipe-empty";
      empty.innerHTML =
        "<p>Deck clear for this session.</p>" +
        '<button type="button" class="btn btn-secondary" data-commune-reshuffle>Reshuffle remaining</button>';
      state.deck.appendChild(empty);
      var rs = empty.querySelector("[data-commune-reshuffle]");
      if (rs) {
        rs.addEventListener("click", function () {
          rebuildDeck();
          setStatus("Deck reshuffled.");
        });
      }
      updateIndexUi();
      syncLikeButtonGate();
      return;
    }
    var front = renderCard(card, true);
    state.deck.appendChild(front);
    bindCardActions(front, card);
    var next = state.cards[state.index + 1];
    if (next) state.deck.appendChild(renderCard(next, false));
    updateIndexUi();
    syncLikeButtonGate();
  }

  function messageStore() {
    return window.CognationMessageStore || null;
  }

  function ensureConversation(peerId, peerName) {
    var store = messageStore();
    if (!store) return null;
    if (typeof store.ensureConversation === "function") {
      return store.ensureConversation(peerId, peerName);
    }
    var st = store.getState && store.getState();
    if (!st) return null;
    var cid = "dm-" + peerId;
    var found = null;
    (st.conversations || []).forEach(function (c) {
      if (c.id === cid || c.peerId === peerId) found = c;
    });
    if (!found) {
      found = {
        id: cid,
        title: peerName || peerId,
        peerId: peerId,
        mutualMatch: false,
        participants: [
          { id: "you", name: "You" },
          { id: peerId, name: peerName || peerId },
        ],
        messages: [],
      };
      st.conversations.push(found);
      store.save(st);
    }
    return found;
  }

  function pushTowerMessage(opts) {
    opts = opts || {};
    var store = messageStore();
    var conv = ensureConversation(opts.peerId, opts.peerName);
    if (!store || !conv) return false;
    var st = store.getState();
    var target = null;
    for (var i = 0; i < st.conversations.length; i++) {
      if (st.conversations[i].id === conv.id) {
        target = st.conversations[i];
        break;
      }
    }
    if (!target) return false;
    if (opts.mutualMatch) target.mutualMatch = true;
    var msg = {
      id: "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      senderId: opts.senderId || "system",
      senderName: opts.senderName || "COMMUNE",
      body: opts.body || "",
      createdAt: new Date().toISOString(),
      reactions: {},
      kind: opts.kind || "friend",
      mutualMatch: !!opts.mutualMatch,
    };
    target.messages.push(msg);
    if ("activeId" in st) st.activeId = target.id;
    else st.activeId = target.id;
    store.save(st);
    document.dispatchEvent(
      new CustomEvent("cognation:messages-updated", {
        detail: { conversationId: target.id },
      })
    );
    if (typeof store.refreshUi === "function") {
      try {
        store.refreshUi();
      } catch (e) {}
    }
    return true;
  }

  function postRatingUpdate(card, score, avg) {
    var name = card.name || card.title || "Member";
    var pid = card.profileId || card.id;
    pushTowerMessage({
      peerId: pid,
      peerName: name,
      kind: "rating-update",
      senderId: "system",
      senderName: "COMMUNE Ratings",
      body:
        currentRaterId() +
        " rated you " +
        score +
        "/10" +
        (avg != null ? " · new average " + avg : "") +
        ".",
    });
  }

  function postMutualMatch(card) {
    var name = card.name || card.title || "Match";
    var pid = card.profileId || card.id;
    pushTowerMessage({
      peerId: pid,
      peerName: name,
      kind: "friend",
      mutualMatch: true,
      senderId: pid,
      senderName: name,
      body: "It's a match! You both swiped right. Say hi whenever you're ready.",
    });
    pushTowerMessage({
      peerId: pid,
      peerName: name,
      kind: "friend",
      mutualMatch: true,
      senderId: "you",
      senderName: "You",
      body: "Matched with " + name + " from COMMUNE dating (demo).",
    });
  }

  function dismissForever(card) {
    var ids = getDismissed();
    if (ids.indexOf(card.id) < 0) ids.push(card.id);
    setDismissed(ids);
  }
  function likeCard(card) {
    var ids = getLikes();
    if (ids.indexOf(card.id) < 0) ids.push(card.id);
    setLikes(ids);
  }
  function shareCard(card) {
    var ids = getShares();
    if (ids.indexOf(card.id) < 0) ids.push(card.id);
    setShares(ids);
  }

  function maybeInjectAdAfterSwipe() {
    if (state.swipeCount > 0 && state.swipeCount % AD_EVERY === 0) {
      var peek = state.cards[state.index];
      if (peek && peek.type === TYPE.AD) return;
      var ad = shuffle(DEMO_ADS)[0];
      var adCard = {
        id: ad.id + "-live-" + state.swipeCount,
        type: TYPE.AD,
        title: ad.title,
        body: ad.body,
        cta: ad.cta,
        likeable: false,
      };
      if (getDismissed().indexOf(adCard.id) >= 0) return;
      state.cards.splice(state.index, 0, adCard);
    }
  }

  function animateOff(dir, done) {
    var front =
      state.deck &&
      state.deck.querySelector(
        ".commune-card.is-active, [data-commune-card].is-active"
      );
    if (!front) {
      done();
      return;
    }
    front.classList.add(dir === "left" ? "is-exit-left" : "is-exit-right");
    window.setTimeout(done, 220);
  }

  function datingRated(activeEl) {
    return !!(
      activeEl && activeEl.getAttribute("data-rating-selected") === "true"
    );
  }

  function swipe(direction) {
    if (state.busy) return;
    var card = currentCard();
    if (!card) {
      setStatus("No more cards — reshuffle or follow pros for more services.");
      return;
    }
    var dir = direction === "left" ? "left" : "right";
    var active =
      state.deck &&
      state.deck.querySelector(
        ".commune-card.is-active, [data-commune-card].is-active"
      );

    if (dir === "right" && card.type === TYPE.DATING) {
      if (!datingRated(active)) {
        var st = active && active.querySelector("[data-dating-rate-status]");
        if (st) {
          st.hidden = false;
          st.textContent = "Rate 1–10 before you can swipe right.";
          st.classList.add("is-error");
        }
        setStatus(
          "Dating card: rate 1–10 before Like / swipe right. Dismiss (left) is still OK."
        );
        syncLikeButtonGate();
        return;
      }
      var range = active.querySelector("input[data-dating-rate]");
      var score = parseInt(range && range.value, 10) || 5;
      var avg = saveRating(card.profileId || card.id, currentRaterId(), score);
      postRatingUpdate(card, score, avg);
      addDatingLike(card.profileId || card.id);
      if (isMutual(card.profileId || card.id)) {
        postMutualMatch(card);
        setStatus(
          "Mutual match with " +
            (card.name || "member") +
            "! Check Tower messages."
        );
      }
    }

    state.busy = true;
    animateOff(dir, function () {
      if (dir === "left") {
        dismissForever(card);
        setStatus("Dismissed · hidden for this session.");
      } else if (card.type === TYPE.DATING) {
        likeCard(card);
        if (!isMutual(card.profileId || card.id)) {
          setStatus(
            "Liked " + (card.name || "profile") + " · waiting on mutual (demo)."
          );
        }
      } else if (card.likeable) {
        likeCard(card);
        setStatus("Liked · saved to demo likes.");
      } else {
        shareCard(card);
        setStatus("Shared into friends' COMMUNE algo (demo store).");
      }
      state.swipeCount += 1;
      state.cards.splice(state.index, 1);
      maybeInjectAdAfterSwipe();
      state.busy = false;
      paintDeck();
    });
  }

  function rebuildDeck() {
    syncDatingVisibility();
    state.cards = buildDeckCards();
    state.index = 0;
    paintDeck();
  }

  function onPointerDown(ev) {
    var front =
      state.deck &&
      state.deck.querySelector(
        ".commune-card.is-active, [data-commune-card].is-active"
      );
    if (!front) return;
    if (
      ev.target.closest &&
      ev.target.closest("button, a, input, select, textarea, label, output")
    ) {
      return;
    }
    var point = ev.touches ? ev.touches[0] : ev;
    state.pointer = { x0: point.clientX, y0: point.clientY, dx: 0, el: front };
    front.classList.add("is-dragging");
    if (ev.pointerId != null && front.setPointerCapture) {
      try {
        front.setPointerCapture(ev.pointerId);
      } catch (e) {}
    }
  }
  function onPointerMove(ev) {
    if (!state.pointer) return;
    var point = ev.touches ? ev.touches[0] : ev;
    var dx = point.clientX - state.pointer.x0;
    var dy = point.clientY - state.pointer.y0;
    state.pointer.dx = dx;
    if (state.pointer.el) {
      state.pointer.el.style.transform =
        "translate(" + dx + "px," + dy * 0.15 + "px) rotate(" + dx / 28 + "deg)";
    }
  }
  function onPointerUp() {
    if (!state.pointer) return;
    var dx = state.pointer.dx;
    var el = state.pointer.el;
    state.pointer = null;
    if (el) {
      el.classList.remove("is-dragging");
      el.style.transform = "";
    }
    if (Math.abs(dx) < 80) return;
    swipe(dx < 0 ? "left" : "right");
  }

  function wireDatingToggle(shell) {
    var toggle = shell.querySelector(
      "[data-commune-see-dating], [data-commune-dating-toggle]"
    );
    if (!toggle) return;
    if (toggle.type === "checkbox") toggle.checked = getSeeDating();
    toggle.addEventListener("change", function () {
      var age = getMemberAge();
      if (age != null && age <= 18) {
        toggle.checked = false;
        setSeeDating(false);
        setStatus(
          "Dating content requires age over 18. Your age is " + age + "."
        );
        syncDatingVisibility();
        rebuildDeck();
        return;
      }
      setSeeDating(!!toggle.checked);
      syncDatingVisibility();
      rebuildDeck();
      setStatus(
        toggle.checked
          ? "Dating content enabled — speed-dating cards may appear in the mix."
          : "Dating content hidden."
      );
    });
  }

  function bindInteractions(shell) {
    shell.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-commune-swipe]");
      if (!btn || !shell.contains(btn)) return;
      swipe(btn.getAttribute("data-commune-swipe") === "left" ? "left" : "right");
    });
    var deck = shell.querySelector("[data-commune-deck]");
    if (deck) {
      deck.addEventListener("pointerdown", onPointerDown);
      deck.addEventListener("pointermove", onPointerMove);
      deck.addEventListener("pointerup", onPointerUp);
      deck.addEventListener("pointercancel", onPointerUp);
      deck.addEventListener("touchstart", onPointerDown, { passive: true });
      deck.addEventListener("touchmove", onPointerMove, { passive: true });
      deck.addEventListener("touchend", onPointerUp);
    }
    document.addEventListener("keydown", function (ev) {
      var panel = document.getElementById("panel-commune");
      if (!panel || panel.hidden) return;
      if (ev.key === "ArrowLeft") {
        ev.preventDefault();
        swipe("left");
      } else if (ev.key === "ArrowRight") {
        ev.preventDefault();
        swipe("right");
      }
    });
    wireDatingToggle(shell);
  }

  function seedDemoFollows() {
    if (
      window.CognationAccounts &&
      window.CognationAccounts.ensureDemoProfessionals
    ) {
      try {
        window.CognationAccounts.ensureDemoProfessionals();
      } catch (e) {}
    }
    var ids = getFollows();
    ["prof-demo-mira-pro", "prof-demo-jordan-pro"].forEach(function (id) {
      if (ids.indexOf(id) < 0) ids.push(id);
    });
    setFollows(ids);
  }

  function init() {
    var shell = document.querySelector("[data-commune-shell]");
    if (!shell) return;
    if (
      window.CognationAccounts &&
      window.CognationAccounts.ensureDemoProfessionals
    ) {
      try {
        window.CognationAccounts.ensureDemoProfessionals();
      } catch (e) {}
    }
    state.shell = shell;
    state.deck = shell.querySelector("[data-commune-deck]");
    state.statusEl = shell.querySelector("[data-commune-swipe-status]");
    bindInteractions(shell);
    rebuildDeck();
    document.addEventListener("cognation:commune-follows-changed", rebuildDeck);
    document.addEventListener("cognation:session-started", rebuildDeck);
    document.addEventListener("cognation:member-profile-updated", function () {
      syncDatingVisibility();
      rebuildDeck();
    });
  }

  window.CognationCommuneSwipe = {
    rebuild: rebuildDeck,
    getFollows: getFollows,
    setFollows: setFollows,
    isFollowing: isFollowing,
    toggleFollow: toggleFollow,
    getMemberProfile: getMemberProfile,
    setMemberProfile: setMemberProfile,
    getMemberAge: getMemberAge,
    getSeeDating: getSeeDating,
    setSeeDating: setSeeDating,
    datingAllowed: datingAllowed,
    seedDemoFollows: seedDemoFollows,
    FOLLOWS_KEY: FOLLOWS_KEY,
    SEE_DATING_KEY: SEE_DATING_KEY,
    MEMBER_PROFILE_KEY: MEMBER_PROFILE_KEY,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
