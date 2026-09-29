/**
 * Cognation login gate — required username/password (client-side gate on Pages).
 * Not a substitute for server auth; fine for a private $0 preview.
 *
 * After credentials succeed, if the account has 2 Tower profiles, show a
 * Choose profile step (Personal / Professional). Session records
 * activeProfileId + profileKind.
 *
 * Session: cognation.session.v2
 * Production sign-in uses the configured account provider.
 * Local preview uses an explicit demo unlock (no shared password in this file).
 */
(function () {
  "use strict";

  var SESSION_KEY = "cognation.session.v2";

  var API_BASE =
    (window.CognationConfig && window.CognationConfig.apiBaseUrl) || "/api";

  var gate = document.getElementById("login-gate");
  var form = document.getElementById("login-form");
  var statusEl = document.getElementById("login-status");
  var openBtn = document.querySelector("[data-login-open]");
  var pickerEl = document.getElementById("login-profile-picker");
  var pickerList = document.getElementById("login-profile-picker-list");
  var pickerContinue = document.getElementById("login-profile-continue");
  var pickerBack = document.getElementById("login-profile-back");
  var credentialsStep = document.getElementById("login-credentials-step");

  if (!gate || !form) return;

  var lastFocus = null;
  var pendingUsername = null;
  var pendingProfiles = null;
  var pendingAuth = null;

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.hidden = !message;
    statusEl.textContent = message || "";
    statusEl.classList.toggle("is-error", !!isError);
    statusEl.setAttribute("role", message ? "status" : "none");
  }

  function readLocalSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function writeLocalSession(data) {
    try {
      if (!data) localStorage.removeItem(SESSION_KEY);
      else localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function showCredentialsStep() {
    if (credentialsStep) credentialsStep.hidden = false;
    if (pickerEl) pickerEl.hidden = true;
    gate.classList.remove("login-gate--picker");
    pendingUsername = null;
    pendingProfiles = null;
    pendingAuth = null;
  }

  function showPickerStep(username, profiles) {
    pendingUsername = username;
    pendingProfiles = profiles || [];
    if (credentialsStep) credentialsStep.hidden = true;
    if (pickerEl) pickerEl.hidden = false;
    gate.classList.add("login-gate--picker");
    renderPicker(pendingProfiles);
    setStatus("");
    window.setTimeout(function () {
      var first =
        (pickerList && pickerList.querySelector('input[name="loginProfile"]')) ||
        pickerContinue;
      if (first && typeof first.focus === "function") first.focus();
    }, 10);
  }

  function renderPicker(profiles) {
    if (!pickerList) return;
    pickerList.innerHTML = "";
    profiles.forEach(function (p, idx) {
      var id = "login-profile-" + (p.id || idx);
      var label = document.createElement("label");
      label.className = "login-profile-card";
      label.setAttribute("for", id);

      var input = document.createElement("input");
      input.type = "radio";
      input.name = "loginProfile";
      input.id = id;
      input.value = p.id;
      if (idx === 0) input.checked = true;

      var kind = p.kind === "professional" ? "Professional" : "Personal";
      var title = document.createElement("span");
      title.className = "login-profile-card-kind";
      title.textContent = kind + " page";

      var name = document.createElement("span");
      name.className = "login-profile-card-name";
      name.textContent = p.displayName || kind;

      var handle = document.createElement("span");
      handle.className = "login-profile-card-handle";
      var h = String(p.handle || "").replace(/^@/, "");
      handle.textContent = h ? "@" + h : "No handle yet";

      label.appendChild(input);
      label.appendChild(title);
      label.appendChild(name);
      label.appendChild(handle);
      pickerList.appendChild(label);
    });
  }

  function openGate(opts) {
    opts = opts || {};
    lastFocus = document.activeElement;
    gate.hidden = false;
    gate.setAttribute("aria-hidden", "false");
    document.body.classList.add("login-gate-open");
    showCredentialsStep();
    if (opts.message) setStatus(opts.message, !!opts.isError);
    else setStatus("");
    var first = form.querySelector('input[name="username"]');
    if (first) {
      window.setTimeout(function () {
        first.focus();
      }, 10);
    }
    document.dispatchEvent(new CustomEvent("cognation:session-ended"));
  }

  function closeGate() {
    gate.hidden = true;
    gate.setAttribute("aria-hidden", "true");
    document.body.classList.remove("login-gate-open");
    gate.classList.remove("login-gate--picker");
    setStatus("");
    showCredentialsStep();
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    else if (openBtn) openBtn.focus();
    document.dispatchEvent(new CustomEvent("cognation:session-started"));
  }

  function buildSession(username, profile, auth) {
    var session = {
      username: username,
      source: (auth && auth.source) || "password",
      startedAt: Date.now(),
    };
    if (auth && auth.supabaseUserId) session.supabaseUserId = auth.supabaseUserId;
    if (profile) {
      session.activeProfileId = profile.id;
      session.profileKind = profile.kind === "professional" ? "professional" : "personal";
      session.profileHandle = profile.handle || "";
      session.profileDisplayName = profile.displayName || "";
    }
    return session;
  }

  function establishSession(username, profile, auth) {
    var session = buildSession(username, profile, auth);
    writeLocalSession(session);
    if (window.CognationDemo && window.CognationDemo.syncChrome) {
      window.CognationDemo.syncChrome(session);
    }
    closeGate();
    return session;
  }

  function normalizeLoginUser(raw) {
    var u = String(raw || "").trim().toLowerCase();
    if (!u) return "";
    if (u.charAt(0) === "@") u = u.slice(1);
    /* Accept common Alexa identity spellings as the demo account */
    var alexaAliases = {
      alexa: true,
      "alexa thomas": true,
      "alexa j thomas": true,
      "alexa j. thomas": true,
      "alexa-thomas": true,
      "alexa.thomas": true,
      "alexathomas": true,
    };
    if (alexaAliases[u]) return "alexa";
    return u;
  }

  function loadProfilesForUser(username) {
    if (window.CognationAccounts && typeof window.CognationAccounts.profilesForLogin === "function") {
      return window.CognationAccounts.profilesForLogin(username) || [];
    }
    return [];
  }

  function mapSupabaseProfile(profile) {
    return {
      id: profile.id,
      kind: profile.kind,
      handle: profile.handle,
      displayName: profile.display_name || profile.displayName || "",
      userId: profile.user_id || "",
    };
  }

  function loadSupabaseProfiles(user) {
    if (!window.CognationSupabase || !user || !user.id) return Promise.resolve([]);
    return window.CognationSupabase.rest("profiles", {
      query: "select=id,kind,handle,display_name,user_id&user_id=eq." + encodeURIComponent(user.id),
    }).then(function (profiles) {
      return Array.isArray(profiles) ? profiles.map(mapSupabaseProfile) : [];
    });
  }

  function finishWithProfileChoice(username, profiles, auth) {
    profiles = profiles || [];
    if (profiles.length <= 1) {
      return establishSession(username, profiles[0] || null, auth);
    }
    if (auth) {
      pendingAuth = auth;
    }
    showPickerStep(username, profiles);
    return null;
  }

  function login(username, password, opts) {
    opts = opts || {};
    username = normalizeLoginUser(username);
    /* Do not trim passwords. A trailing space is part of the secret. */
    password = String(password || "");
    if (opts.demo) {
      if (!username) username = "demo";
      if (window.CognationDemo && window.CognationDemo.unlock) {
        window.CognationDemo.unlock();
      }
      return Promise.resolve({
        username: username,
        profiles: loadProfilesForUser(username),
        source: "demo",
      });
    }
    if (
      window.CognationSupabase &&
      window.CognationSupabase.configured &&
      window.CognationSupabase.configured()
    ) {
      if (username.indexOf("@") <= 0) {
        return Promise.reject(new Error("Enter the email address for your Cognation account."));
      }
      return window.CognationSupabase.signIn(username, password).then(function (result) {
        var user = result && result.user;
        if (!user || !user.id) throw new Error("Wrong email or password.");
        /* A profiles miss must not undo a successful password grant. The gate
           stayed up whenever that follow-up request rejected. */
        return loadSupabaseProfiles(user).then(
          function (profiles) {
            return {
              username: user.email || username,
              profiles: profiles,
              source: "supabase",
              supabaseUserId: user.id,
            };
          },
          function () {
            return {
              username: user.email || username,
              profiles: [],
              source: "supabase",
              supabaseUserId: user.id,
            };
          }
        );
      });
    }
    return Promise.reject(new Error("Cognation sign-in is not configured."));
  }

  function logout(opts) {
    opts = opts || {};
    var remote =
      window.CognationSupabase &&
      window.CognationSupabase.configured &&
      window.CognationSupabase.configured()
        ? window.CognationSupabase.signOut().catch(function () {})
        : Promise.resolve();
    return remote.then(function () {
      writeLocalSession(null);
      openGate({
        message: opts.message || "Signed out. Sign in to continue.",
        isError: !!opts.isError,
      });
    });
  }

  function isAuthenticated() {
    var current = readLocalSession();
    if (current && current.source === "demo") return true;
    if (
      window.CognationSupabase &&
      window.CognationSupabase.configured &&
      window.CognationSupabase.configured()
    ) {
      return !!(current && current.source === "supabase" && current.supabaseUserId);
    }
    return !!current;
  }

  function setActiveProfile(profileId) {
    var session = readLocalSession();
    if (!session) return null;
    var profile =
      window.CognationAccounts && window.CognationAccounts.getProfileById
        ? window.CognationAccounts.getProfileById(profileId)
        : null;
    if (!profile) return null;
    session.activeProfileId = profile.id;
    session.profileKind = profile.kind === "professional" ? "professional" : "personal";
    session.profileHandle = profile.handle || "";
    session.profileDisplayName = profile.displayName || "";
    writeLocalSession(session);
    document.dispatchEvent(
      new CustomEvent("cognation:active-profile-changed", {
        detail: { profileId: profile.id, kind: session.profileKind },
      })
    );
    return session;
  }

  var demoUnlockBtn = form.querySelector("[data-login-demo-unlock]");
  if (demoUnlockBtn) {
    demoUnlockBtn.addEventListener("click", function () {
      var userInput = form.querySelector('input[name="username"]');
      var username = userInput && String(userInput.value || "").trim();
      if (!username) username = "demo";
      var note = form.querySelector("[data-login-demo-chrome]");
      if (note) note.hidden = false;
      setStatus("Opening local demo…", false);
      login(username, "", { demo: true }).then(
        function (result) {
          setStatus("");
          finishWithProfileChoice(result.username, result.profiles, result);
        },
        function (error) {
          setStatus((error && error.message) || "Demo unlock failed.", true);
        }
      );
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var userInput = form.querySelector('input[name="username"]');
    var passInput = form.querySelector('input[name="password"]');
    var countryInput = form.querySelector('select[name="country"]');
    var username = userInput ? userInput.value.trim() : "";
    var password = passInput ? passInput.value : "";
    var country = countryInput ? countryInput.value : "United States";
    setStatus("Signing in…", false);
    login(username, password).then(
      function (result) {
        try {
          localStorage.setItem("cognation.member.country.v1", country || "United States");
        } catch (err) {}
        if (window.CognationMemberCountry) {
          window.CognationMemberCountry.set(country || "United States");
        }
        setStatus("");
        finishWithProfileChoice(result.username, result.profiles, result);
      },
      function (error) {
        setStatus(
          (error && error.message) || "Wrong email or password.",
          true
        );
      }
    );
  });

  if (pickerContinue) {
    pickerContinue.addEventListener("click", function () {
      if (!pendingUsername || !pendingProfiles || !pendingProfiles.length) return;
      var chosen = null;
      var selected = pickerList && pickerList.querySelector('input[name="loginProfile"]:checked');
      if (selected) {
        for (var i = 0; i < pendingProfiles.length; i++) {
          if (pendingProfiles[i].id === selected.value) {
            chosen = pendingProfiles[i];
            break;
          }
        }
      }
      if (!chosen) chosen = pendingProfiles[0];
      establishSession(pendingUsername, chosen, pendingAuth || null);
      pendingAuth = null;
    });
  }

  if (pickerBack) {
    pickerBack.addEventListener("click", function () {
      showCredentialsStep();
      setStatus("");
      var first = form.querySelector('input[name="username"]');
      if (first) first.focus();
    });
  }

  if (openBtn) {
    openBtn.addEventListener("click", function () {
      openGate();
    });
  }

  /* Escape does not skip login */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !gate.hidden) {
      e.preventDefault();
    }
  });

  gate.addEventListener("keydown", function (e) {
    if (e.key !== "Tab" || gate.hidden) return;
    var focusable = gate.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  var resolveAuthReady = function () {};
  var authReady = new Promise(function (resolve) {
    resolveAuthReady = function () {
      resolve();
      resolveAuthReady = function () {};
    };
  });

  function settleAuthReady() {
    resolveAuthReady();
  }

  window.CognationAuth = {
    openGate: openGate,
    closeGate: closeGate,
    login: function (u, p) {
      return login(u, p == null ? "" : p).then(function (result) {
        var session = finishWithProfileChoice(result.username, result.profiles, result);
        return session || readLocalSession();
      });
    },
    logout: logout,
    isAuthenticated: isAuthenticated,
    getSession: readLocalSession,
    setActiveProfile: setActiveProfile,
    SESSION_KEY: SESSION_KEY,
    apiBaseUrl: API_BASE,
    /* Resolves once the first paint auth decision finishes (gate stays or closes). */
    whenReady: authReady,
  };

  document.addEventListener("click", function (ev) {
    var btn = ev.target && ev.target.closest && ev.target.closest("[data-cognation-logout]");
    if (!btn) return;
    ev.preventDefault();
    logout({ message: "Signed out. Sign in to continue." });
  });

  function hydrateSessionProfile(session) {
    if (!session || !session.username) return session;
    if (window.CognationAccounts) {
      try {
        window.CognationAccounts.ensureSeeded();
      } catch (e) {}
    }
    if (session.activeProfileId) {
      var still =
        window.CognationAccounts && window.CognationAccounts.getProfileById
          ? window.CognationAccounts.getProfileById(session.activeProfileId)
          : null;
      if (still) {
        session.profileKind = still.kind === "professional" ? "professional" : "personal";
        session.profileHandle = still.handle || "";
        session.profileDisplayName = still.displayName || "";
        writeLocalSession(session);
        return session;
      }
    }
    var profiles = loadProfilesForUser(session.username);
    if (profiles.length) {
      var prefer =
        profiles.filter(function (p) {
          return p.kind === (session.profileKind || "personal");
        })[0] || profiles[0];
      session.activeProfileId = prefer.id;
      session.profileKind = prefer.kind === "professional" ? "professional" : "personal";
      session.profileHandle = prefer.handle || "";
      session.profileDisplayName = prefer.displayName || "";
      writeLocalSession(session);
    }
    return session;
  }

  var authBootGeneration = 0;

  function noteRestoringSession() {
    /* login-signup-shell clears #login-status while it sets sign-in mode.
       Put the note back after that script, and only while the splash is up. */
    window.setTimeout(function () {
      if (gate.hidden) return;
      setStatus("Restoring your session…", false);
    }, 0);
  }

  function boot() {
    /* Clear old demo sessions so they cannot bypass */
    try {
      localStorage.removeItem("cognation.session.demo.v1");
    } catch (e) {}
    if (window.CognationDemo && window.CognationDemo.syncChrome) {
      window.CognationDemo.syncChrome(readLocalSession());
    }
    if (
      window.CognationDemo &&
      window.CognationDemo.isUnlocked &&
      window.CognationDemo.isUnlocked() &&
      readLocalSession() &&
      readLocalSession().source === "demo"
    ) {
      var demoNote = form.querySelector("[data-login-demo-chrome]");
      if (demoNote) demoNote.hidden = false;
    }
    var session = readLocalSession();
    if (session && session.source === "demo") {
      if (window.CognationDemo && window.CognationDemo.unlock) {
        window.CognationDemo.unlock();
      }
      hydrateSessionProfile(session);
      closeGate();
      settleAuthReady();
      return;
    }
    if (
      window.CognationDemo &&
      window.CognationDemo.isUnlocked &&
      window.CognationDemo.isUnlocked() &&
      (!session || session.source !== "supabase")
    ) {
      login(session && session.username ? session.username : "demo", "", { demo: true }).then(
        function (result) {
          finishWithProfileChoice(result.username, result.profiles, result);
          settleAuthReady();
        },
        function () {
          openGate({ message: "Could not restore the demo session.", isError: true });
          settleAuthReady();
        }
      );
      return;
    }
    var remoteConfigured =
      window.CognationSupabase &&
      window.CognationSupabase.configured &&
      window.CognationSupabase.configured();
    if (remoteConfigured && (!session || session.source !== "supabase")) {
      writeLocalSession(null);
      openGate();
      settleAuthReady();
      return;
    }
    if (session) {
      if (remoteConfigured) {
        /* Splash is already visible. Do not openGate() here — that dispatches
           session-ended and lets the app flash before getUser returns. */
        var bootGen = ++authBootGeneration;
        function claimRemoteBoot() {
          if (bootGen !== authBootGeneration) return false;
          authBootGeneration += 1;
          return true;
        }
        noteRestoringSession();
        window.setTimeout(function () {
          if (!claimRemoteBoot()) return;
          writeLocalSession(null);
          openGate({
            message: "Couldn't reach Cognation sign-in. Try again.",
            isError: true,
          });
          settleAuthReady();
        }, 12000);
        window.CognationSupabase
          .getUser()
          .then(function (user) {
            if (!user || !user.id) throw new Error("Session expired.");
            if (!claimRemoteBoot()) return;
            session.supabaseUserId = user.id;
            writeLocalSession(session);
            hydrateSessionProfile(session);
            closeGate();
            settleAuthReady();
          })
          .catch(function () {
            if (!claimRemoteBoot()) return;
            writeLocalSession(null);
            openGate({
              message: "Your session ended. Sign in again to continue.",
              isError: true,
            });
            settleAuthReady();
          });
        return;
      }
      hydrateSessionProfile(session);
      closeGate();
      settleAuthReady();
    } else {
      openGate();
      settleAuthReady();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
