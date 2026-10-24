/**
 * CGN-007 — Login/signup shell behavior.
 * Mode: [data-login-mode]="signin|signup" on [data-login-credentials-step]
 * Signup fields: birthdate, country, state, phone, email
 * 13+ gate: js/signup-age-gate.js (birthdate itself is never stored or sent)
 * Persists member profile for COMMUNE age / dating gates.
 */
(function () {
  "use strict";

  var MEMBER_PROFILE_KEY = "cognation.member.profile.v1";

  var step = document.querySelector("[data-login-credentials-step]");
  var form = document.getElementById("login-form");
  if (!step || !form) return;

  var toggleBtn = form.querySelector("[data-login-mode-toggle]");
  var signupFields = form.querySelector("[data-login-signup-fields]");
  var signinCountry = form.querySelector("[data-login-signin-country]");
  var signinCountrySelect = form.querySelector("[data-login-signin-country-select]");
  var signupCountrySelect = form.querySelector("[data-login-signup-country-select]");
  var stateSelect = form.querySelector("#state");
  var stateText = form.querySelector("[data-login-state-text]");
  var submitBtn = form.querySelector("[data-login-submit]");
  var titleEl = document.getElementById("login-gate-title");
  var descEl = document.getElementById("login-gate-desc");
  var statusEl = document.getElementById("login-status");
  var demoHint = form.querySelector("[data-login-demo-hint]");
  var passwordInput = form.querySelector("#login-password");
  var ageBlockEl = document.querySelector("[data-login-age-block]");
  var areaBlockEl = form.querySelector("[data-login-area-block]");
  var submitActions = form.querySelector(".login-form-actions");
  var legalLinks = form.querySelector("[data-login-legal-links]");
  var PILOT_COUNTRY = "United States";

  function gate() {
    return window.CognationAgeGate || null;
  }

  function localStore() {
    try {
      return window.localStorage;
    } catch (e) {
      return null;
    }
  }

  function signupHeld() {
    var g = gate();
    return !!(g && g.isHeld(localStore(), document));
  }

  /* Plain block screen. Signup inputs and the submit button are hidden; the
     mode toggle stays so existing members can still sign in. */
  function applyAgeBlock(isSignup) {
    var blocked = !!isSignup && signupHeld();
    if (blocked) step.setAttribute("data-login-age-blocked", "");
    else step.removeAttribute("data-login-age-blocked");
    if (ageBlockEl) ageBlockEl.hidden = !blocked;
    if (submitActions) submitActions.hidden = blocked;
    form.querySelectorAll(".login-form > .form-group").forEach(function (el) {
      if (el === signinCountry) return;
      el.hidden = blocked;
    });
    if (blocked) {
      if (signupFields) signupFields.hidden = true;
      if (descEl) descEl.textContent = "";
    }
    return blocked;
  }

  /* Wipe everything typed into the form (in memory and in the DOM). */
  function clearSignupInputs() {
    form.querySelectorAll("input, select").forEach(function (el) {
      if (el.type === "checkbox" || el.type === "radio") el.checked = false;
      else if (el.tagName === "SELECT") el.selectedIndex = 0;
      else el.value = "";
      el.setAttribute("aria-invalid", "false");
    });
  }

  function blockSignup() {
    var g = gate();
    if (g) g.setHold(localStore(), document);
    clearSignupInputs();
    setStatus("");
    applyAgeBlock(true);
  }

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.hidden = !msg;
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("is-error", !!isError);
  }

  function readProfile() {
    try {
      var raw = localStorage.getItem(MEMBER_PROFILE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function writeProfile(fields) {
    var next = Object.assign({}, readProfile(), fields || {});
    try {
      localStorage.setItem(MEMBER_PROFILE_KEY, JSON.stringify(next));
    } catch (e) {}
    if (next.country) {
      try {
        localStorage.setItem("cognation.member.country.v1", String(next.country));
      } catch (e2) {}
    }
    if (window.CognationCommuneSwipe && window.CognationCommuneSwipe.setMemberProfile) {
      try {
        window.CognationCommuneSwipe.setMemberProfile(next);
      } catch (e3) {}
    }
    document.dispatchEvent(
      new CustomEvent("cognation:member-profile-updated", { detail: next })
    );
    return next;
  }

  function syncStateInputs(country) {
    var isUS = country === "United States";
    if (stateSelect && stateText) {
      stateSelect.hidden = !isUS;
      stateSelect.disabled = !isUS;
      stateText.hidden = isUS;
      stateText.disabled = isUS;
      if (isUS) {
        stateSelect.setAttribute("name", "state");
        stateText.removeAttribute("name");
      } else {
        stateText.setAttribute("name", "state");
        stateSelect.removeAttribute("name");
      }
    }
  }

  function setMode(mode, opts) {
    opts = opts || {};
    mode = mode === "signup" ? "signup" : "signin";
    step.setAttribute("data-login-mode", mode);
    var isSignup = mode === "signup";

    if (signupFields) signupFields.hidden = !isSignup;
    if (signinCountry) signinCountry.hidden = isSignup;

    if (signinCountrySelect) {
      signinCountrySelect.disabled = isSignup;
      if (isSignup) signinCountrySelect.removeAttribute("name");
      else signinCountrySelect.setAttribute("name", "country");
    }
    if (signupCountrySelect) {
      signupCountrySelect.disabled = !isSignup;
      if (isSignup) signupCountrySelect.setAttribute("name", "country");
      else signupCountrySelect.removeAttribute("name");
    }

    form.querySelectorAll("[data-login-signup-fields] input, [data-login-signup-fields] select").forEach(function (el) {
      if (el === signupCountrySelect) return;
      if (el === stateText || el === stateSelect) {
        if (!isSignup) {
          el.disabled = true;
          el.removeAttribute("name");
        }
        return;
      }
      el.disabled = !isSignup;
    });
    if (isSignup && signupCountrySelect) syncStateInputs(signupCountrySelect.value);

    if (passwordInput) {
      passwordInput.setAttribute("autocomplete", isSignup ? "new-password" : "current-password");
    }
    if (submitBtn) submitBtn.textContent = isSignup ? "Sign up" : "Sign in";
    if (toggleBtn) {
      toggleBtn.textContent = isSignup
        ? "Have an account? Sign in"
        : "Need an account? Sign up";
    }
    if (titleEl) titleEl.textContent = isSignup ? "Sign up" : "Sign in";
    if (descEl) {
      descEl.innerHTML = isSignup
        ? 'Create your <span data-brand>COGNATION</span> account.'
        : 'Welcome to <span data-brand>COGNATION</span>. Sign in with your account to continue.';
    }
    if (demoHint) demoHint.hidden = true;
    if (legalLinks) legalLinks.hidden = !isSignup;
    if (!opts.keepStatus) setStatus("");
    applyAgeBlock(isSignup);
    applyAreaBlock(isSignup);
  }

  /* USA pilot: the signup country field is the only check. Public pages stay open. */
  function outsidePilot() {
    return !!(signupCountrySelect && signupCountrySelect.value !== PILOT_COUNTRY);
  }

  function applyAreaBlock(isSignup) {
    var blocked = !!isSignup && outsidePilot();
    if (areaBlockEl) areaBlockEl.hidden = !blocked;
    if (submitBtn) submitBtn.disabled = blocked;
    if (blocked && areaBlockEl && areaBlockEl.scrollIntoView) {
      try { areaBlockEl.scrollIntoView({ block: "nearest" }); } catch (e) {}
    }
    return blocked;
  }

  function markInvalid(el, bad) {
    if (!el) return;
    el.setAttribute("aria-invalid", bad ? "true" : "false");
  }

  function validateSignup() {
    var ok = true;
    var birth = form.querySelector("#birthdate");
    var phone = form.querySelector("#phone");
    var email = form.querySelector("#email");
    var user = form.querySelector("#login-username");
    var pass = form.querySelector("#login-password");
    var country = signupCountrySelect;

    function req(el, check) {
      var bad = !check(el);
      markInvalid(el, bad);
      if (bad) ok = false;
    }

    req(user, function (el) {
      return (
        el &&
        /^[a-z0-9_-]{3,40}$/i.test(
          String(el.value || "").trim().replace(/^@/, "")
        )
      );
    });
    req(pass, function (el) {
      return el && el.value.length > 0;
    });
    req(birth, function (el) {
      var g = gate();
      return !!(el && el.value && g && g.ageFromBirthdate(el.value) !== null);
    });
    req(country, function (el) {
      return el && el.value;
    });
    if (country && country.value === "United States") {
      req(stateSelect, function (el) {
        return el && el.value;
      });
    } else {
      req(stateText, function (el) {
        return el && el.value.trim().length > 0;
      });
    }
    req(phone, function (el) {
      return el && el.value.trim().length >= 7;
    });
    req(email, function (el) {
      return el && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim());
    });
    return ok;
  }

  function collectSignupProfile() {
    var birthEl = form.querySelector("#birthdate");
    var g = gate();
    var phoneEl = form.querySelector("#phone");
    var emailEl = form.querySelector("#email");
    var country =
      (signupCountrySelect && signupCountrySelect.value) ||
      "United States";
    var state = "";
    if (country === "United States") {
      state = stateSelect ? stateSelect.value : "";
    } else {
      state = stateText ? stateText.value.trim() : "";
    }
    return {
      /* Whole-year age (existing Commune age gates read it). Only year + month go
         to the server (owner-only); the full birthdate is never kept or sent. */
      age: birthEl && g ? g.ageFromBirthdate(birthEl.value) : null,
      birthYearMonth: birthEl && g && g.yearMonth ? g.yearMonth(birthEl.value) : null,
      country: country,
      state: state,
      phone: phoneEl ? phoneEl.value.trim() : "",
      email: emailEl ? emailEl.value.trim() : "",
      username: (form.querySelector("#login-username") || {}).value || "",
      updatedAt: Date.now(),
    };
  }

  if (toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      var cur = step.getAttribute("data-login-mode") || "signin";
      setMode(cur === "signup" ? "signin" : "signup");
    });
  }

  if (signupCountrySelect) {
    signupCountrySelect.addEventListener("change", function () {
      syncStateInputs(signupCountrySelect.value);
      applyAreaBlock((step.getAttribute("data-login-mode") || "signin") === "signup");
    });
  }

  /* Create a real account when Supabase is configured; retain local capture
     only for the offline demo. */
  form.addEventListener(
    "submit",
    function (e) {
      var mode = step.getAttribute("data-login-mode") || "signin";
      if (mode === "signup") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (signupHeld()) {
          blockSignup();
          return;
        }
        var birthInput = form.querySelector("#birthdate");
        var g = gate();
        /* Under the minimum: stop here. Nothing typed leaves the device or is stored. */
        if (birthInput && g && g.isUnderMin(birthInput.value)) {
          blockSignup();
          return;
        }
        /* Outside the USA pilot: stop before any account is created or stored. */
        if (applyAreaBlock(true)) return;
        if (!validateSignup()) {
          setStatus("Use a 3–40 character username (letters, numbers, _ or -), then fix any highlighted fields.", true);
          return;
        }
        var rules = window.CognationHandleRules;
        var userField = form.querySelector("#login-username");
        if (rules && userField && rules.isReserved(userField.value)) {
          markInvalid(userField, true);
          setStatus(rules.message("Usernames"), true);
          return;
        }
        var profile = collectSignupProfile();
        var password = (form.querySelector("#login-password") || {}).value || "";
        var handle = String(profile.username || "")
          .trim()
          .toLowerCase()
          .replace(/^@/, "")
          .replace(/[^a-z0-9_-]/g, "")
          .slice(0, 40);
        if (
          window.CognationSupabase &&
          window.CognationSupabase.configured &&
          window.CognationSupabase.configured()
        ) {
          setStatus("Creating your Cognation account…", false);
          g.checkEmailBlocked(profile.email).then(function (emailBlocked) {
            if (emailBlocked) {
              password = "";
              profile = null;
              blockSignup();
              return null;
            }
            return createAccount();
          });
          return;
        }
        setStatus("Account sign-up is not configured. Please try again later.", true);
        return;
      }

      function createAccount() {
          return window.CognationSupabase
            .signUp({
              email: profile.email,
              password: password,
              username: profile.username,
              handle: handle,
              displayName: profile.username,
              birthYear: profile.birthYearMonth ? profile.birthYearMonth.year : undefined,
              birthMonth: profile.birthYearMonth ? profile.birthYearMonth.month : undefined,
            })
            .then(function (result) {
              delete profile.birthYearMonth; /* not kept on the device either */
              writeProfile(profile);
              if (window.CognationAccounts && window.CognationAccounts.ensureCognationFriend) {
                try { window.CognationAccounts.ensureCognationFriend(profile.username); } catch (eFriend) {}
              }
              if (result && result.session && window.CognationAuth) {
                return window.CognationAuth.login(profile.email, password);
              }
              setMode("signin");
              setStatus(
                "Account created. Check your email to confirm it, then sign in with your email.",
                false
              );
              return null;
            })
            .catch(function (error) {
              setStatus(
                (error && error.message) || "Could not create your account. Please try again.",
                true
              );
            });
      }

      /* Sign-in: also capture country + keep any existing age */
      var countryInput = form.querySelector(
        '[data-login-signin-country-select], select[name="country"]'
      );
      var patch = {};
      if (countryInput && countryInput.value) patch.country = countryInput.value;
      if (Object.keys(patch).length) writeProfile(patch);
    },
    true
  );

  /* Hydrate from existing profile */
  (function hydrate() {
    var p = readProfile();
    var phoneEl = form.querySelector("#phone");
    var emailEl = form.querySelector("#email");
    if (phoneEl && p.phone) phoneEl.value = p.phone;
    if (emailEl && p.email) emailEl.value = p.email;
    if (signupCountrySelect && p.country) signupCountrySelect.value = p.country;
    if (signinCountrySelect && p.country) {
      try {
        signinCountrySelect.value = p.country;
      } catch (e) {}
    }
    if (p.country === "United States" && stateSelect && p.state) stateSelect.value = p.state;
    else if (stateText && p.state) stateText.value = p.state;
  })();

  setMode("signin", { keepStatus: true });
})();
