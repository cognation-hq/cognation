/**
 * Tower messaging — direct messages under the profile picture on TOWER.
 *
 * Real DMs: threads and messages live in Supabase (public.direct_threads /
 * public.direct_messages, SQL 20261017_direct_messages.sql). Opening, sending
 * and listing go through RPCs that enforce blocks, real/seed separation, 13+
 * and message rating. Nothing is saved in this browser; the store below is an
 * in-memory copy of what the server returned. No demo threads, no local fallback.
 */
(function () {
  "use strict";

  var CURRENT_USER_ID = "you";
  var CURRENT_USER_NAME = "You";
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /** Quick tapback set (iMessage-style). */
  var QUICK_REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];
  /** Extra emojis behind the “+” picker. */
  var MORE_REACTIONS = ["🔥", "🎉", "💯", "🤗", "👀", "✨"];

  var MATCH_INTRO = "You both swiped right. Say hello when you're ready.";

  /* In-memory only (server is the source of truth). */
  var memory = { activeId: null, conversations: [], loaded: false, live: false, status: "" };

  function sb() {
    var c = window.CognationSupabase;
    if (!c || typeof c.configured !== "function" || !c.configured()) return null;
    if (typeof c.rpc !== "function" || typeof c.rest !== "function") return null;
    return c;
  }

  function liveSession() {
    var c = sb();
    if (!c || typeof c.getSession !== "function") return null;
    var s = c.getSession();
    return s && s.access_token ? s : null;
  }

  function myUserId() {
    var s = liveSession();
    if (!s) return "";
    if (s.user && s.user.id) return String(s.user.id);
    try {
      var auth = window.CognationAuth && typeof window.CognationAuth.getSession === "function"
        ? window.CognationAuth.getSession()
        : null;
      if (auth && auth.source === "supabase" && auth.supabaseUserId) return String(auth.supabaseUserId);
    } catch (eAuth) {}
    return "";
  }

  var EMPTY_SIGNED_IN = "No messages yet. Open a friend's Tower and tap Message to start one.";

  function errorText(err) {
    if (!err) return "";
    var parts = [];
    if (err.message) parts.push(String(err.message));
    var body = err.body;
    if (body && typeof body === "object") {
      ["message", "details", "hint", "code", "error"].forEach(function (k) {
        if (body[k]) parts.push(String(body[k]));
      });
    } else if (typeof body === "string") parts.push(body);
    return parts.join(" ");
  }

  /** Honest status lines (same tone as live chat rooms, #139). */
  function mapDmError(err) {
    var text = errorText(err);
    if (/direct_threads|direct_messages|open_direct_thread|send_direct_message|list_my_direct_threads/i.test(text) &&
        /(PGRST20[25]|42P01|does not exist|schema cache|Could not find)/i.test(text)) {
      return "Messages aren't available yet. Try again soon.";
    }
    var codes = [
      ["Sign in first", "Sign in to send messages."],
      ["under_13", "Messages are for members 13 and up."],
      ["no_birth", "Add your birth year and month in your profile to send messages."],
      ["blocked", "You can't message this person."],
      ["real_seed_blocked", "You can't message this person."],
      ["peer_unavailable", "You can't message this person."],
      ["peer_not_found", "That person isn't available to message."],
      ["thread_not_found", "That conversation isn't available."],
      ["cannot_message_self", "You can't message yourself."],
      ["bad_body", "Message must be 1–2000 characters."],
      ["harmful", "That message can't be sent."],
    ];
    for (var i = 0; i < codes.length; i++) {
      if (text.indexOf(codes[i][0]) !== -1) return codes[i][1];
    }
    return "Couldn't send. Check your connection and try again.";
  }

  function asArray(v) {
    if (Array.isArray(v)) return v;
    if (v && Array.isArray(v.data)) return v.data;
    if (typeof v === "string") { try { return JSON.parse(v) || []; } catch (e) { return []; } }
    return [];
  }

  function rowToMessage(row, conv, me) {
    var mine = row.sender_user_id && String(row.sender_user_id) === me;
    var system = !row.sender_user_id;
    return {
      id: String(row.id),
      senderId: mine ? CURRENT_USER_ID : system ? "cognation" : String(conv.peerId || conv.peerUserId || ""),
      senderName: mine ? CURRENT_USER_NAME : system ? "Cognation" : conv.title,
      body: String(row.body || ""),
      createdAt: row.created_at,
      kind: row.kind || "friend",
      reactions: {},
    };
  }

  function findConv(id) {
    for (var i = 0; i < memory.conversations.length; i++) {
      if (memory.conversations[i].id === id) return memory.conversations[i];
    }
    return null;
  }

  var MessageStore = {
    getState: function () { return memory; },
    isLive: function () { return memory.live; },
    statusText: function () { return memory.status; },
    listConversations: function () { return memory.conversations.slice(); },
    getConversation: function (id) { return id ? findConv(id) : null; },
    getActiveId: function () { return memory.activeId; },
    setActiveId: function (id) { memory.activeId = id || null; },

    /** Load my threads + messages from Supabase. Resolves to { ok, error? }. */
    refresh: function () {
      var c = sb();
      var me = myUserId();
      if (!c || !me) {
        memory.live = false;
        memory.loaded = true;
        memory.conversations = memory.conversations.filter(function (conv) { return conv.localOnlyMatch; });
        memory.status = "Sign in to see and send messages.";
        MessageStore.refreshUi();
        return Promise.resolve({ ok: false, error: memory.status });
      }
      return c.rpc("list_my_direct_threads", {}).then(function (res) {
        var threads = asArray(res);
        var ids = threads.map(function (t) { return String(t.id); }).filter(function (id) { return UUID_RE.test(id); });
        var convs = threads.map(function (t) {
          return {
            id: String(t.id),
            title: t.peer_name || "Member",
            peerId: t.peer_profile_id ? String(t.peer_profile_id) : "",
            peerUserId: t.peer_user_id ? String(t.peer_user_id) : "",
            mutualMatch: t.kind === "match",
            messages: [],
          };
        });
        if (!ids.length) return { convs: convs, rows: [] };
        return c.rest("direct_messages", {
          query: "select=id,thread_id,sender_user_id,body,kind,created_at&thread_id=in.(" + ids.join(",") + ")&order=created_at.asc&limit=2000",
        }).then(function (rows) { return { convs: convs, rows: asArray(rows) }; });
      }).then(function (out) {
        var byId = {};
        out.convs.forEach(function (conv) { byId[conv.id] = conv; });
        out.rows.forEach(function (row) {
          var conv = byId[String(row.thread_id)];
          if (conv) conv.messages.push(rowToMessage(row, conv, me));
        });
        out.convs.forEach(function (conv) {
          /* Match intro is derived from the saved thread kind, not stored text. */
          var pending = findConv(conv.id);
          if (conv.mutualMatch) {
            conv.messages.unshift({
              id: conv.id + "-match",
              senderId: "cognation",
              senderName: "Cognation",
              body: MATCH_INTRO,
              createdAt: conv.messages[0] ? conv.messages[0].createdAt : new Date().toISOString(),
              kind: "friend",
              mutualMatch: true,
              eventLine: pending && pending.messages[0] && pending.messages[0].eventLine,
              reactions: {},
            });
          }
        });
        memory.conversations = out.convs;
        memory.live = true;
        memory.loaded = true;
        memory.status = out.convs.length ? "" : EMPTY_SIGNED_IN;
        MessageStore.refreshUi();
        return { ok: true };
      }).catch(function (err) {
        memory.live = false;
        memory.loaded = true;
        memory.status = mapDmError(err);
        MessageStore.refreshUi();
        return { ok: false, error: memory.status };
      });
    },

    /** Send to Supabase. Resolves to { ok, message?, error? }. Nothing is kept locally on failure. */
    sendMessage: function (conversationId, body) {
      var text = String(body || "").trim();
      if (!text) return Promise.resolve({ ok: false, error: "Message cannot be empty." });
      var conv = findConv(conversationId);
      if (!conv || !UUID_RE.test(String(conversationId))) {
        return Promise.resolve({ ok: false, error: "That conversation isn't available." });
      }
      var c = sb();
      var me = myUserId();
      if (!c || !me) return Promise.resolve({ ok: false, error: "Sign in to send messages." });
      return c.rpc("send_direct_message", { p_thread_id: conversationId, p_body: text }).then(function (row) {
        if (Array.isArray(row)) row = row[0];
        if (!row || !row.id) return { ok: false, error: "Couldn't send. Check your connection and try again." };
        var msg = rowToMessage(row, conv, me);
        conv.messages.push(msg);
        memory.activeId = conversationId;
        return { ok: true, message: msg };
      }).catch(function (err) {
        return { ok: false, error: mapDmError(err) };
      });
    },

    /**
     * Reactions are not saved server-side yet (reactions come later). They stay
     * on screen for this page view only and are gone after a reload.
     */
    toggleReaction: function (conversationId, messageId, emoji) {
      var face = String(emoji || "").trim();
      if (!face) return { ok: false, error: "Emoji required." };
      var conv = findConv(conversationId);
      if (!conv) return { ok: false, error: "Conversation not found." };
      var msg = null;
      for (var j = 0; j < conv.messages.length; j++) {
        if (conv.messages[j].id === messageId) { msg = conv.messages[j]; break; }
      }
      if (!msg) return { ok: false, error: "Message not found." };
      if (!msg.reactions || typeof msg.reactions !== "object") msg.reactions = {};
      var list = Array.isArray(msg.reactions[face]) ? msg.reactions[face].slice() : [];
      var idx = list.indexOf(CURRENT_USER_ID);
      if (idx >= 0) list.splice(idx, 1); else list.push(CURRENT_USER_ID);
      if (list.length) msg.reactions[face] = list; else delete msg.reactions[face];
      return { ok: true, message: msg };
    },
  };

  /** Open (or find) the real thread with a person by profile UUID. Resolves to { ok, conversation?, error? }. */
  MessageStore.ensureConversation = function (peerId, peerName, kind) {
    peerId = String(peerId || "").trim();
    if (!UUID_RE.test(peerId)) return Promise.resolve({ ok: false, error: "That person isn't available to message." });
    var c = sb();
    if (!c || !myUserId()) return Promise.resolve({ ok: false, error: "Sign in to send messages." });
    return c.rpc("open_direct_thread", { p_peer_profile_id: peerId, p_kind: kind === "match" ? "match" : "dm" })
      .then(function (row) {
        if (Array.isArray(row)) row = row[0];
        if (!row || !row.id) return { ok: false, error: "That conversation isn't available." };
        var id = String(row.id);
        var conv = findConv(id);
        if (!conv) {
          conv = { id: id, title: peerName || "Member", peerId: peerId, mutualMatch: row.kind === "match", messages: [] };
          memory.conversations.unshift(conv);
        }
        memory.activeId = id;
        MessageStore.refreshUi();
        return { ok: true, conversation: conv };
      })
      .catch(function (err) { return { ok: false, error: mapDmError(err) }; });
  };

  function messageViewerIds() {
    var ids = ["you"];
    try {
      var raw = localStorage.getItem("cognation.session.v2");
      var session = raw ? JSON.parse(raw) : null;
      if (session) {
        if (session.activeProfileId) ids.push(String(session.activeProfileId));
        if (session.username) ids.push(String(session.username));
      }
    } catch (e) {}
    return ids;
  }

  MessageStore.viewerIds = messageViewerIds;

  MessageStore.conversationTitle = function (conv) {
    if (!conv) return "";
    if (conv.participantIds && conv.participants) {
      var mine = messageViewerIds();
      var other = null;
      conv.participants.forEach(function (person) {
        if (!person || mine.indexOf(String(person.id)) >= 0) return;
        other = person;
      });
      if (other && other.name) return other.name;
    }
    return conv.title || "Messages";
  };

  /**
   * Mutual dating match. Shows the match intro right away (in memory) and, when
   * both ids are real profile UUIDs and the viewer is signed in, opens the real
   * 'match' thread on the server; the next refresh replaces the in-memory copy.
   */
  MessageStore.openMatch = function (a, b, opts) {
    a = a || {};
    b = b || {};
    opts = opts || {};
    if (!a.id || !b.id) return null;
    var ids = [String(a.id), String(b.id)].sort();
    var cid = "match-" + ids[0] + "--" + ids[1];
    var found = findConv(cid);
    if (!found) {
      /* Optional event line from dating-match path only — never invent seed copy here. */
      var eventLine = String(opts.eventLine || "").trim();
      if (eventLine && /cal-demo/i.test(eventLine)) eventLine = "";
      var matchMsg = {
        id: cid + "-match",
        senderId: "cognation",
        senderName: "Cognation",
        body: MATCH_INTRO,
        createdAt: new Date().toISOString(),
        kind: "friend",
        mutualMatch: true,
        reactions: {},
      };
      if (eventLine) matchMsg.eventLine = eventLine;
      found = {
        id: cid,
        title: b.name || "Match",
        participantIds: ids,
        participants: [
          { id: String(a.id), name: a.name || "Member" },
          { id: String(b.id), name: b.name || "Member" },
        ],
        mutualMatch: true,
        localOnlyMatch: true,
        messages: [matchMsg],
      };
      memory.conversations.unshift(found);
      if (UUID_RE.test(String(b.id))) {
        MessageStore.ensureConversation(String(b.id), b.name, "match").then(function (res) {
          if (!res || !res.ok || !res.conversation) return;
          res.conversation.messages = found.messages.concat(res.conversation.messages || []);
          res.conversation.mutualMatch = true;
          memory.conversations = memory.conversations.filter(function (c) { return c !== found; });
          if (memory.activeId === cid) memory.activeId = res.conversation.id;
          MessageStore.refreshUi();
        });
      }
    }
    this.refreshUi();
    return found;
  };

  MessageStore._uiRefresh = null;
  MessageStore.refreshUi = function () {
    document.dispatchEvent(new CustomEvent("cognation:messages-updated"));
    if (typeof MessageStore._uiRefresh === "function") {
      try { MessageStore._uiRefresh(); } catch (e) {}
    }
  };

  window.CognationMessageStore = MessageStore;

  /* —— UI —— */
  function formatTime(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    } catch (e) {
      return "";
    }
  }

  function previewText(conv) {
    if (!conv.messages || !conv.messages.length) return "No messages yet";
    var last = conv.messages[conv.messages.length - 1];
    var body = last.body || "";
    return body.length > 64 ? body.slice(0, 61) + "…" : body;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function initMessaging(root) {
    if (!root) return;

    /* CGN-008: keep Messages closed by default; clear closed flag when opened */
    var messagesRoot = root.closest("[data-tower-messages]") || document.querySelector("[data-tower-messages]");
    var shell = messagesRoot && messagesRoot.querySelector("[data-tower-messages-shell]");
    if (shell && messagesRoot) {
      shell.addEventListener("toggle", function () {
        if (shell.open) {
          messagesRoot.removeAttribute("data-tower-messages-closed");
          MessageStore.refresh(); /* pick up the other person's new messages */
        }
        else messagesRoot.setAttribute("data-tower-messages-closed", "");
      });
    }


    var listEl = root.querySelector("[data-commune-list]");
    var threadTitle = root.querySelector("[data-commune-thread-title]");
    var messagesEl = root.querySelector("[data-commune-messages]");
    var form = root.querySelector("[data-commune-compose]");
    var input = root.querySelector("#commune-compose-input");
    var statusEl = root.querySelector("[data-commune-status]");
    var emptyEl = root.querySelector("[data-commune-empty]");

    if (!listEl || !messagesEl || !form || !input) return;

    var activeId = MessageStore.getActiveId();
    /* CGN-008: messages closed by default — no thread until a name is clicked */
    var startClosed =
      (messagesRoot && messagesRoot.hasAttribute("data-tower-messages-closed")) ||
      (shell && !shell.open);
    if (startClosed) {
      activeId = null;
      MessageStore.setActiveId(null);
    }
    var threadEl0 = root.querySelector("[data-tower-thread], .tower-thread");
    if (threadEl0) {
      threadEl0.hidden = !activeId;
      if (activeId) threadEl0.setAttribute("data-tower-thread-open", activeId);
      else threadEl0.removeAttribute("data-tower-thread-open");
    }

    function setStatus(text, isError) {
      if (!statusEl) return;
      if (!text) {
        statusEl.hidden = true;
        statusEl.textContent = "";
        statusEl.classList.remove("is-error");
        return;
      }
      statusEl.hidden = false;
      statusEl.textContent = text;
      statusEl.classList.toggle("is-error", !!isError);
    }

    function renderList() {
      var conversations = MessageStore.listConversations();
      listEl.innerHTML = "";
      conversations.forEach(function (conv) {
        var li = document.createElement("li");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "commune-conv-btn";
        btn.setAttribute("role", "option");
        btn.setAttribute("aria-selected", conv.id === activeId ? "true" : "false");
        btn.dataset.convId = conv.id;
        btn.setAttribute("data-tower-thread-open", conv.id);
        if (conv.id === activeId) {
          btn.classList.add("is-active");
        }
        /* CGN-008: list by name; click opens thread */
        btn.innerHTML =
          '<span class="commune-conv-name">' +
          escapeHtml(MessageStore.conversationTitle(conv)) +
          "</span>";
        btn.addEventListener("click", function () {
          selectConversation(conv.id);
        });
        li.appendChild(btn);
        listEl.appendChild(li);
      });
    }

    function closeOpenPickers(except) {
      var open = messagesEl.querySelectorAll(".commune-react-picker:not([hidden])");
      for (var i = 0; i < open.length; i++) {
        if (except && open[i] === except) continue;
        open[i].hidden = true;
        var trigger = open[i].previousElementSibling;
        if (trigger && trigger.classList.contains("commune-react-open")) {
          trigger.setAttribute("aria-expanded", "false");
        }
      }
    }

    function reactionEntries(reactions) {
      var entries = [];
      if (!reactions || typeof reactions !== "object") return entries;
      var keys = Object.keys(reactions);
      for (var i = 0; i < keys.length; i++) {
        var emoji = keys[i];
        var users = reactions[emoji];
        if (!Array.isArray(users) || !users.length) continue;
        entries.push({ emoji: emoji, users: users, count: users.length, mine: users.indexOf(CURRENT_USER_ID) >= 0 });
      }
      return entries;
    }

    function applyReaction(messageId, emoji) {
      var result = MessageStore.toggleReaction(activeId, messageId, emoji);
      if (!result.ok) {
        setStatus(result.error || "Could not save reaction.", true);
        return;
      }
      setStatus("");
      renderList();
      renderThread();
    }

    function buildPicker(msg) {
      var picker = document.createElement("div");
      picker.className = "commune-react-picker";
      picker.setAttribute("role", "toolbar");
      picker.setAttribute("aria-label", "React with emoji");
      picker.hidden = true;

      function addFaceBtn(face) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "commune-react-face";
        b.textContent = face;
        b.setAttribute("aria-label", "React with " + face);
        b.addEventListener("click", function (e) {
          e.stopPropagation();
          applyReaction(msg.id, face);
        });
        picker.appendChild(b);
      }

      QUICK_REACTIONS.forEach(addFaceBtn);

      var moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "commune-react-face commune-react-more";
      moreBtn.textContent = "+";
      moreBtn.setAttribute("aria-label", "More reactions");
      moreBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        MORE_REACTIONS.forEach(addFaceBtn);
        moreBtn.remove();
      });
      picker.appendChild(moreBtn);

      return picker;
    }

    function buildReactionBar(msg, isIncoming) {
      var bar = document.createElement("div");
      bar.className = "commune-msg-reactbar";

      var pills = document.createElement("div");
      pills.className = "commune-msg-reactions";
      pills.setAttribute("aria-label", "Reactions");

      var entries = reactionEntries(msg.reactions);
      entries.forEach(function (entry) {
        var pill = document.createElement("button");
        pill.type = "button";
        pill.className = "commune-react-pill" + (entry.mine ? " is-mine" : "");
        pill.setAttribute(
          "aria-label",
          (entry.mine ? "Remove your " : "Add ") + entry.emoji + " reaction" + (entry.count > 1 ? ", " + entry.count + " total" : "")
        );
        pill.setAttribute("aria-pressed", entry.mine ? "true" : "false");
        pill.innerHTML =
          '<span class="commune-react-pill-emoji" aria-hidden="true">' +
          escapeHtml(entry.emoji) +
          "</span>" +
          (entry.count > 1
            ? '<span class="commune-react-pill-count">' + String(entry.count) + "</span>"
            : "");
        pill.addEventListener("click", function (e) {
          e.stopPropagation();
          applyReaction(msg.id, entry.emoji);
        });
        pills.appendChild(pill);
      });

      bar.appendChild(pills);

      /* Prefer react control on incoming; allow on own too. */
      var controls = document.createElement("div");
      controls.className = "commune-react-controls" + (isIncoming ? " is-incoming" : "");

      var openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "commune-react-open";
      openBtn.setAttribute("aria-label", "Add reaction");
      openBtn.setAttribute("aria-expanded", "false");
      openBtn.setAttribute("aria-haspopup", "true");
      openBtn.innerHTML = '<span aria-hidden="true">🙂</span>';

      var picker = buildPicker(msg);

      openBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var willOpen = picker.hidden;
        closeOpenPickers(picker);
        picker.hidden = !willOpen;
        openBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
      });

      controls.appendChild(openBtn);
      controls.appendChild(picker);
      bar.appendChild(controls);

      return bar;
    }

    function renderThread() {
      var conv = MessageStore.getConversation(activeId);
      messagesEl.innerHTML = "";

      if (!conv) {
        if (threadTitle) threadTitle.textContent = "Select a conversation";
        if (emptyEl) emptyEl.hidden = false;
        form.hidden = true;
        return;
      }

      if (threadTitle) threadTitle.textContent = MessageStore.conversationTitle(conv);
      if (emptyEl) emptyEl.hidden = true;
      form.hidden = false;

      conv.messages.forEach(function (msg) {
        var isMine = msg.senderId === CURRENT_USER_ID;
        var article = document.createElement("article");
        var kind = msg.kind || "friend";
        var isRating = kind === "rating-update" || kind === "rating";
        var isMatch = !!(msg.mutualMatch || (conv && conv.mutualMatch));
        article.className =
          "commune-msg tower-msg" +
          (isMine ? " commune-msg--mine" : "") +
          (isRating ? " tower-msg--rating-update" : " tower-msg--friend");
        article.dataset.msgId = msg.id;
        if (isMatch) article.setAttribute("data-mutual-match", "true");
        article.setAttribute(
          "aria-label",
          (isMine ? "You" : msg.senderName) + " at " + formatTime(msg.createdAt)
        );
        var authorClass =
          "commune-msg-author tower-msg-author" +
          (isMatch ? " tower-msg-author--mutual-match tower-message-author--match" : "");
        var authorAttrs = isMatch
          ? ' data-mutual-match="true" data-match-name'
          : "";
        var label =
          isRating
            ? '<p class="tower-msg-label">Rating update</p>'
            : isMatch
              ? '<p class="tower-msg-label">Mutual match</p>'
              : "";
        var eventLineHtml = "";
        if (isMatch && msg.eventLine) {
          eventLineHtml =
            '<p class="tower-msg-event-line" data-match-event-line>' +
            escapeHtml(String(msg.eventLine)) +
            "</p>";
        }
        article.innerHTML =
          label +
          '<header class="commune-msg-meta">' +
          '<span class="' +
          authorClass +
          '"' +
          authorAttrs +
          ">" +
          escapeHtml(isMine ? "You" : msg.senderName) +
          "</span>" +
          '<time datetime="' +
          escapeHtml(msg.createdAt) +
          '">' +
          escapeHtml(formatTime(msg.createdAt)) +
          "</time>" +
          "</header>" +
          '<p class="commune-msg-body tower-msg-body">' +
          escapeHtml(msg.body) +
          "</p>" +
          eventLineHtml;
        article.appendChild(buildReactionBar(msg, !isMine));
        messagesEl.appendChild(article);
      });

      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function selectConversation(id) {
      activeId = id;
      MessageStore.setActiveId(id);
      setStatus("");
      var threadEl = root.querySelector("[data-tower-thread], .tower-thread");
      if (threadEl) {
        threadEl.hidden = false;
        threadEl.setAttribute("data-tower-thread-open", id || "");
      }
      renderList();
      renderThread();
      input.focus();
    }

    var sending = false;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (sending) return;
      var sentId = activeId;
      sending = true;
      setStatus("Sending…");
      MessageStore.sendMessage(sentId, input.value).then(function (result) {
        sending = false;
        if (!result.ok) {
          /* Nothing saved anywhere on failure; the text stays in the box to retry. */
          setStatus(result.error || "Couldn't send. Check your connection and try again.", true);
          return;
        }
        input.value = "";
        setStatus("");
        renderList();
        renderThread();
        input.focus();
      });
    });

    input.addEventListener("keydown", function (e) {
      /* Enter sends, Shift+Enter is a new line; never send mid IME composition. */
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true }));
      }
    });

    document.addEventListener("click", function (e) {
      if (!root.contains(e.target)) {
        closeOpenPickers();
        return;
      }
      if (!e.target.closest(".commune-react-controls")) {
        closeOpenPickers();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeOpenPickers();
    });

    /* Status follows the store on every refresh, so a line from before
       sign-in (or an empty list) never sticks after the state changes. */
    function syncStoreStatus() {
      if (sending) return;
      var text = MessageStore.statusText();
      if (text === EMPTY_SIGNED_IN && activeId) text = "";
      setStatus(text, false);
    }

    MessageStore._uiRefresh = function () {
      renderList();
      renderThread();
      syncStoreStatus();
    };

    /* Start or open a thread from elsewhere (Tower "Message" button). */
    MessageStore._openThread = function (id) {
      if (shell && !shell.open) shell.open = true;
      if (messagesRoot) messagesRoot.removeAttribute("data-tower-messages-closed");
      selectConversation(id);
    };

    document.addEventListener("cognation:messages-updated", function () {
      renderList();
      renderThread();
      syncStoreStatus();
    });

    ["cognation:session-started", "cognation:auth-changed", "cognation:session-ended"].forEach(function (name) {
      document.addEventListener(name, function () { MessageStore.refresh(); });
    });

    renderList();
    renderThread();
    setStatus(MessageStore.statusText());
    MessageStore.refresh();
  }

  function boot() {
    var root = document.querySelector("[data-commune-messaging]");
    if (root) initMessaging(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
(function () {
  var NOT = "Apple Pay isn't set up. No payment was taken.";
  function pay(note, amountText) {
    var c = window.CognationConfig || {}, Session = window.ApplePaySession;
    var merchant = String((c.applePayMerchantId) || "").trim(), processor = String(c.applePayProcessor || "").trim();
    var n = Number(String(amountText || "").replace(/[$,]/g, ""));
    if (!merchant || !/^https:\/\//.test(processor) || typeof Session !== "function" || !(n > 0)) { note.textContent = NOT; return; }
    try {
      var session = new Session(3, { countryCode: "US", currencyCode: "USD", merchantCapabilities: ["supports3DS"], supportedNetworks: ["visa", "masterCard", "amex", "discover"], total: { label: "Cognation", amount: n.toFixed(2) } });
      session.oncancel = function () { note.textContent = "Payment cancelled. Nothing was charged."; };
      session.begin();
    } catch (eOpen) { note.textContent = NOT; }
  }
  function mount(panel, card, age) {
    if (!panel || panel.querySelector("[data-auction-room]")) return;
    var box = document.createElement("div"); box.setAttribute("data-auction-room", "");
    var can = typeof age === "number" && age >= 16;
    var blank = 'style="width:4.5rem;border:0;border-bottom:1px solid #9cf;background:transparent;color:inherit"';
    box.innerHTML = '<div style="display:flex;gap:.5rem;align-items:center"><video data-auction-video muted playsinline style="width:8rem;height:5rem;background:#111;border-radius:.4rem"></video><div><p data-auction-who style="margin:0"></p><button type="button" class="btn btn-secondary" data-auction-hand>Hand live spot</button> <button type="button" class="btn btn-secondary" data-auction-back>Take presenter back</button></div></div><div data-auction-log></div><form data-auction-chat action="#"><input data-auction-chat-input maxlength="200" aria-label="Chat"> <button class="btn btn-secondary" type="submit">Send</button></form>' + (can ? '<button type="button" class="btn btn-primary" data-auction-bid>Bid</button>' : '<p>Bidding is for ages 16 and up.</p>') + '<p data-auction-pay-note role="status"></p>';
    var log = panel.querySelector("[data-commune-room-log]");
    (log ? log.parentNode.insertBefore(box, log.nextSibling) : panel.appendChild(box));
    var people = ["Presenter", "Speaker"], at = 0, who = box.querySelector("[data-auction-who]");
    function show() { who.textContent = people[at] + " · 10 min"; }
    show();
    box.querySelector("[data-auction-hand]").onclick = function () { at = at ? 0 : 1; show(); };
    box.querySelector("[data-auction-back]").onclick = function () { at = 0; show(); };
    box.querySelector("[data-auction-chat]").onsubmit = function (ev) {
      ev.preventDefault();
      var input = box.querySelector("[data-auction-chat-input]"), text = String(input.value || "").trim(), line;
      if (!text) return;
      line = document.createElement("p");
      line.textContent = people[at] + ": " + text;
      box.querySelector("[data-auction-log]").appendChild(line);
      input.value = "";
    };
    var bid = box.querySelector("[data-auction-bid]");
    if (bid) bid.onclick = function () {
      if (box.querySelector("[data-auction-draft]")) return;
      var msg = document.createElement("div"); msg.setAttribute("data-auction-draft", "");
      msg.innerHTML = '<p data-auction-draft-label style="margin:0">Seller draft</p><p data-auction-buyer style="margin:.2rem 0">Buyer connected</p><p data-auction-note>Hello! You have agreed to purchase <input data-auction-amt aria-label="Amount of money" ' + blank + '> amount of money from <input data-auction-seller aria-label="Seller" ' + blank + '> seller during a live auction through Cognation on <input data-auction-date aria-label="Date" ' + blank + '> date. If this has been reported in error, please notify the seller at this time. If this transaction is correct, please find the Apple Pay button below to complete your purchase, and exchange the necessary information with the seller and the buyer to finish the rest of the exchange. Thank you for participating in Cognation\'s auction, and best of luck with your new purchase!</p><button type="button" class="btn btn-primary" data-auction-send>Send</button> <button type="button" class="btn btn-primary" data-auction-pay>Apple Pay</button>';
      box.querySelector("[data-auction-log]").appendChild(msg);
      msg.querySelector("[data-auction-pay]").onclick = function () { pay(box.querySelector("[data-auction-pay-note]"), msg.querySelector("[data-auction-amt]").value); };
      msg.querySelector("[data-auction-send]").onclick = function () { var sent = document.createElement("p"); sent.setAttribute("data-auction-sent", ""); sent.textContent = msg.querySelector("[data-auction-note]").innerText; msg.appendChild(sent); this.disabled = true; };
    };
  }
  window.CognationAuctionRoom = { mount: mount };
})();
