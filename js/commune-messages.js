/**
 * Tower messaging (demo / local) — lives under the profile picture on TOWER.
 *
 * Storage is behind a small MessageStore interface so a real API can replace
 * localStorage later without rewriting the UI. This is NOT a live multi-user
 * server — threads live in this browser only.
 *
 * localStorage key: cognation.commune.messages.v1 (demo)
 */
(function () {
  "use strict";

  var STORAGE_KEY = "cognation.commune.messages.v1";
  var CURRENT_USER_ID = "you";
  var CURRENT_USER_NAME = "You";

  /** Quick tapback set (iMessage-style). */
  var QUICK_REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];
  /** Extra emojis behind the “+” picker. */
  var MORE_REACTIONS = ["🔥", "🎉", "💯", "🤗", "👀", "✨"];

  /* —— Seed data (first visit only) —— */
  var SEED = {
    version: 1,
    activeId: null,
    conversations: [
      {
        id: "c1",
        title: "Alex Rivera",
        participants: [
          { id: "you", name: "You" },
          { id: "alex", name: "Alex Rivera" }
        ],
        messages: [
          {
            id: "m1",
            senderId: "alex",
            senderName: "Alex Rivera",
            body: "Welcome to Tower messages — local demo thread.",
            createdAt: "2026-09-14T15:00:00.000Z"
          },
          {
            id: "m2",
            senderId: "you",
            senderName: "You",
            body: "Got it. Messages stay in this browser until a backend is connected.",
            createdAt: "2026-09-14T15:02:00.000Z"
          },
          {
            id: "m3",
            senderId: "alex",
            senderName: "Alex Rivera",
            body: "Try sending a reply below — it will appear here right away.",
            createdAt: "2026-09-14T15:03:30.000Z"
          }
        ]
      },
      {
        id: "c2",
        title: "Jordan Lee",
        participants: [
          { id: "you", name: "You" },
          { id: "jordan", name: "Jordan Lee" }
        ],
        messages: [
          {
            id: "m4",
            senderId: "jordan",
            senderName: "Jordan Lee",
            body: "Hey — checking in from the second demo conversation.",
            createdAt: "2026-09-13T18:20:00.000Z"
          },
          {
            id: "m5",
            senderId: "you",
            senderName: "You",
            body: "Looks good. We’ll swap localStorage for a real API later.",
            createdAt: "2026-09-13T18:25:00.000Z"
          }
        ]
      }
    ]
  };

  /* —— MessageStore: swap this object for API-backed methods later —— */
  var MessageStore = {
    load: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        var data = JSON.parse(raw);
        if (!data || !Array.isArray(data.conversations)) return null;
        return data;
      } catch (err) {
        return null;
      }
    },

    save: function (data) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return true;
      } catch (err) {
        return false;
      }
    },

    /** Ensure seed exists; return working state. */
    getState: function () {
      var data = this.load();
      if (!data) {
        data = JSON.parse(JSON.stringify(SEED));
        this.save(data);
      }
      return data;
    },

    listConversations: function () {
      return this.getState().conversations.slice();
    },

    getConversation: function (id) {
      var state = this.getState();
      for (var i = 0; i < state.conversations.length; i++) {
        if (state.conversations[i].id === id) return state.conversations[i];
      }
      return null;
    },

    getActiveId: function () {
      return this.getState().activeId;
    },

    setActiveId: function (id) {
      var state = this.getState();
      state.activeId = id || null;
      this.save(state);
    },

    /**
     * Append a message. Replace with POST /api/messages later.
     * @returns {{ ok: boolean, message?: object, error?: string }}
     */
    sendMessage: function (conversationId, body) {
      var text = String(body || "").trim();
      if (!text) {
        return { ok: false, error: "Message cannot be empty." };
      }
      var state = this.getState();
      var conv = null;
      for (var i = 0; i < state.conversations.length; i++) {
        if (state.conversations[i].id === conversationId) {
          conv = state.conversations[i];
          break;
        }
      }
      if (!conv) {
        return { ok: false, error: "Conversation not found." };
      }
      var msg = {
        id: "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        senderId: CURRENT_USER_ID,
        senderName: CURRENT_USER_NAME,
        body: text,
        createdAt: new Date().toISOString(),
        reactions: {}
      };
      conv.messages.push(msg);
      state.activeId = conversationId;
      if (!this.save(state)) {
        return { ok: false, error: "Could not save to local storage." };
      }
      return { ok: true, message: msg };
    },

    /**
     * Toggle current user's reaction on a message.
     * reactions shape: { "❤️": ["you", "alex"], ... }
     * @returns {{ ok: boolean, message?: object, error?: string }}
     */
    toggleReaction: function (conversationId, messageId, emoji) {
      var face = String(emoji || "").trim();
      if (!face) {
        return { ok: false, error: "Emoji required." };
      }
      var state = this.getState();
      var conv = null;
      for (var i = 0; i < state.conversations.length; i++) {
        if (state.conversations[i].id === conversationId) {
          conv = state.conversations[i];
          break;
        }
      }
      if (!conv) {
        return { ok: false, error: "Conversation not found." };
      }
      var msg = null;
      for (var j = 0; j < conv.messages.length; j++) {
        if (conv.messages[j].id === messageId) {
          msg = conv.messages[j];
          break;
        }
      }
      if (!msg) {
        return { ok: false, error: "Message not found." };
      }
      if (!msg.reactions || typeof msg.reactions !== "object") {
        msg.reactions = {};
      }
      var list = Array.isArray(msg.reactions[face]) ? msg.reactions[face].slice() : [];
      var idx = list.indexOf(CURRENT_USER_ID);
      if (idx >= 0) {
        list.splice(idx, 1);
      } else {
        list.push(CURRENT_USER_ID);
      }
      if (list.length) {
        msg.reactions[face] = list;
      } else {
        delete msg.reactions[face];
      }
      if (!this.save(state)) {
        return { ok: false, error: "Could not save to local storage." };
      }
      return { ok: true, message: msg };
    }
  };


  MessageStore.ensureConversation = function (peerId, peerName) {
    peerId = String(peerId || "").trim();
    if (!peerId) return null;
    var state = this.getState();
    var cid = "dm-" + peerId;
    var found = null;
    for (var i = 0; i < state.conversations.length; i++) {
      var c = state.conversations[i];
      if (c.id === cid || c.peerId === peerId) {
        found = c;
        break;
      }
    }
    if (!found) {
      found = {
        id: cid,
        title: peerName || peerId,
        peerId: peerId,
        mutualMatch: false,
        participants: [
          { id: CURRENT_USER_ID, name: CURRENT_USER_NAME },
          { id: peerId, name: peerName || peerId },
        ],
        messages: [],
      };
      state.conversations.push(found);
      this.save(state);
    } else if (peerName && found.title !== peerName) {
      found.title = peerName;
      this.save(state);
    }
    return found;
  };

  MessageStore.appendMessage = function (conversationId, msg) {
    var state = this.getState();
    var conv = null;
    for (var i = 0; i < state.conversations.length; i++) {
      if (state.conversations[i].id === conversationId) {
        conv = state.conversations[i];
        break;
      }
    }
    if (!conv) return { ok: false, error: "Conversation not found." };
    if (!msg || typeof msg !== "object") return { ok: false, error: "Invalid message." };
    if (!msg.id) {
      msg.id = "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
    if (!msg.createdAt) msg.createdAt = new Date().toISOString();
    if (!msg.reactions) msg.reactions = {};
    conv.messages.push(msg);
    if (msg.mutualMatch) conv.mutualMatch = true;
    state.activeId = conversationId;
    if (!this.save(state)) return { ok: false, error: "Could not save." };
    return { ok: true, message: msg, conversation: conv };
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

  MessageStore.listConversations = function () {
    var mine = messageViewerIds();
    return this.getState().conversations.filter(function (conv) {
      if (!conv || !conv.participantIds || !conv.participantIds.length) return true;
      return conv.participantIds.some(function (id) {
        return mine.indexOf(String(id)) >= 0;
      });
    });
  };

  MessageStore.openMatch = function (a, b, opts) {
    a = a || {};
    b = b || {};
    opts = opts || {};
    if (!a.id || !b.id) return null;
    var ids = [String(a.id), String(b.id)].sort();
    var cid = "match-" + ids[0] + "--" + ids[1];
    var state = this.getState();
    var found = null;
    for (var i = 0; i < state.conversations.length; i++) {
      if (state.conversations[i].id === cid) {
        found = state.conversations[i];
        break;
      }
    }
    if (!found) {
      /* Optional event line from dating-match path only — never invent seed copy here. */
      var eventLine = String(opts.eventLine || "").trim();
      if (eventLine && /cal-demo/i.test(eventLine)) eventLine = "";
      var matchMsg = {
        id: "match-" + Date.now().toString(36),
        senderId: "cognation",
        senderName: "Cognation",
        body: "You both swiped right. Say hello when you're ready.",
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
        messages: [matchMsg],
      };
      state.conversations.unshift(found);
      this.save(state);
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
        if (shell.open) messagesRoot.removeAttribute("data-tower-messages-closed");
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
      try { MessageStore.setActiveId(null); } catch (eClose) {}
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

      /* Prefer react control on incoming; allow on own for demo simplicity. */
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

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var result = MessageStore.sendMessage(activeId, input.value);
      if (!result.ok) {
        setStatus(result.error || "Could not send.", true);
        return;
      }
      input.value = "";
      setStatus("Saved locally (demo). Messages sync when auth/backend is connected.");
      renderList();
      renderThread();
      input.focus();
    });

    input.addEventListener("keydown", function (e) {
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

    MessageStore._uiRefresh = function () {
      renderList();
      renderThread();
    };

    document.addEventListener("cognation:messages-updated", function () {
      renderList();
      renderThread();
    });

    renderList();
    renderThread();
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
