/**
 * CGN-007 — Login/signup shell behavior.
 * Mode: [data-login-mode]="signin|signup" on [data-login-credentials-step]
 * Signup fields: age, country, state, phone, email
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
    if (!opts.keepStatus) setStatus("");
  }

  function markInvalid(el, bad) {
    if (!el) return;
    el.setAttribute("aria-invalid", bad ? "true" : "false");
  }

  function validateSignup() {
    var ok = true;
    var age = form.querySelector("#age");
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
    req(age, function (el) {
      if (!el || el.value === "") return false;
      var n = Number(el.value);
      return n >= 13 && n <= 120;
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
    var ageEl = form.querySelector("#age");
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
      age: ageEl ? parseInt(ageEl.value, 10) : null,
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
        if (!validateSignup()) {
          setStatus("Use a 3–40 character username (letters, numbers, _ or -), then fix any highlighted fields.", true);
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
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.setAttribute("aria-busy", "true");
          }
          function releaseSignup() {
            if (!submitBtn) return;
            submitBtn.disabled = false;
            submitBtn.setAttribute("aria-busy", "false");
          }
          window.CognationSupabase
            .signUp({
              email: profile.email,
              password: password,
              username: profile.username,
              handle: handle,
              displayName: profile.username,
            })
            .then(function (result) {
              writeProfile(profile);
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
            .then(function () {
              releaseSignup();
            })
            .catch(function (error) {
              releaseSignup();
              setStatus(
                (error && error.message) || "Could not create your account. Please try again.",
                true
              );
            });
          return;
        }
        setStatus("Account sign-up is not configured. Please try again later.", true);
        return;
      }

      /* Sign-in: also capture country + keep any existing age */
      var countryInput = form.querySelector(
        '[data-login-signin-country-select], select[name="country"]'
      );
      var patch = {};
      if (countryInput && countryInput.value) patch.country = countryInput.value;
      /* If age field somehow visible/filled, keep it */
      var ageEl = form.querySelector("#age");
      if (ageEl && ageEl.value && !ageEl.disabled) {
        patch.age = parseInt(ageEl.value, 10);
      }
      if (Object.keys(patch).length) writeProfile(patch);
    },
    true
  );

  /* Hydrate from existing profile */
  (function hydrate() {
    var p = readProfile();
    var ageEl = form.querySelector("#age");
    var phoneEl = form.querySelector("#phone");
    var emailEl = form.querySelector("#email");
    if (ageEl && p.age != null) ageEl.value = p.age;
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
