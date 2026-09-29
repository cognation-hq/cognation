/**
 * Small browser client for Cognation's Supabase project.
 * The UI can progressively adopt this API while the legacy demo stores remain
 * available during migration.
 */
(function () {
  "use strict";

  var SESSION_KEY = "cognation.supabase.session.v1";
  var refreshInflight = null;

  /* Read on each call. /runtime-config assigns CognationConfig before this
     file runs today, but a one-time snapshot stays empty if that script
     fails or is ever reordered. */
  function readConfig() {
    var config = window.CognationConfig || {};
    return {
      url: String(config.supabaseUrl || "").replace(/\/$/, ""),
      key: String(config.supabasePublishableKey || ""),
    };
  }

  function configured() {
    var cfg = readConfig();
    return /^https:\/\//.test(cfg.url) && /^sb_publishable_/.test(cfg.key);
  }

  function stampExpiry(session) {
    if (!session || !session.access_token) return session;
    if (!session.expires_at && session.expires_in) {
      session.expires_at = Math.floor(Date.now() / 1000) + Number(session.expires_in);
    }
    return session;
  }

  function accessTokenStale(session) {
    if (!session || !session.access_token || !session.refresh_token) return false;
    var exp = Number(session.expires_at);
    if (!exp) return false;
    if (exp > 1e12) exp = Math.floor(exp / 1000);
    return Date.now() / 1000 >= exp - 60;
  }

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch (e) {
      return null;
    }
  }

  function writeSession(session) {
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  function errorText(body, fallback) {
    if (!body) return fallback;
    if (typeof body === "string" && body) return body;
    return body.error_description || body.msg || body.message || body.error_code || fallback;
  }

  function refreshSession(session) {
    var cfg = readConfig();
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = null;
    if (controller && typeof setTimeout === "function") {
      timer = setTimeout(function () {
        try {
          controller.abort();
        } catch (e) {}
      }, 8000);
    }
    function stopTimer() {
      if (timer != null && typeof clearTimeout === "function") clearTimeout(timer);
    }
    return fetch(cfg.url + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: {
        apikey: cfg.key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
      signal: controller ? controller.signal : undefined,
    }).then(
      function (response) {
        stopTimer();
        return response.text().then(function (text) {
          var body = null;
          try {
            body = text ? JSON.parse(text) : null;
          } catch (e) {
            body = null;
          }
          if (!response.ok || !body || !body.access_token) {
            var error = new Error(errorText(body, "Session refresh failed."));
            error.status = response.status;
            error.body = body;
            throw error;
          }
          stampExpiry(body);
          writeSession(body);
          return body;
        });
      },
      function (error) {
        stopTimer();
        throw error;
      }
    );
  }

  /* One refresh in flight. Supabase rotates refresh tokens; parallel callers
     on first paint must not redeem the same token twice. */
  function ensureFreshSession() {
    var session = readSession();
    if (!session || !accessTokenStale(session)) return Promise.resolve(session);
    if (!refreshInflight) {
      refreshInflight = refreshSession(session).then(
        function (next) {
          refreshInflight = null;
          return next;
        },
        function (error) {
          refreshInflight = null;
          throw error;
        }
      );
    }
    return refreshInflight;
  }

  function request(path, options) {
    if (!configured()) return Promise.reject(new Error("Supabase is not configured."));
    options = options || {};
    var prepare = options.skipAuthRefresh
      ? Promise.resolve()
      : ensureFreshSession().catch(function () {
          return null;
        });
    return prepare.then(function () {
      return send(path, options);
    });
  }

  function send(path, options) {
    var cfg = readConfig();
    var session = readSession();
    var headers = Object.assign(
      {
        apikey: cfg.key,
        "Content-Type": "application/json",
      },
      options.headers || {}
    );
    if (!options.omitAuth && session && session.access_token) {
      headers.Authorization = "Bearer " + session.access_token;
    }
    var fetchOptions = {
      method: options.method,
      headers: headers,
    };
    if (options.body != null) fetchOptions.body = options.body;
    if (options.keepalive) fetchOptions.keepalive = true;
    if (options.signal) fetchOptions.signal = options.signal;
    return fetch(cfg.url + path, fetchOptions).then(function (response) {
      return response.text().then(function (text) {
        var body = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch (e) {
          body = text;
        }
        if (!response.ok) {
          var error = new Error(errorText(body, "Supabase request failed."));
          error.status = response.status;
          error.body = body;
          throw error;
        }
        return body;
      });
    });
  }

  function signUp(fields) {
    fields = fields || {};
    return request("/auth/v1/signup", {
      method: "POST",
      skipAuthRefresh: true,
      body: JSON.stringify({
        email: fields.email,
        password: fields.password,
        data: {
          username: fields.username,
          handle: fields.handle || fields.username,
          display_name: fields.displayName,
        },
      }),
    }).then(function (result) {
      if (result && result.session) writeSession(stampExpiry(result.session));
      return result;
    });
  }

  function signIn(email, password) {
    /* Password grant must not wait on a stuck refresh or send an expired bearer.
       Otherwise the Sign in button stays on "Signing in…" until a hard reload. */
    return request("/auth/v1/token?grant_type=password", {
      method: "POST",
      skipAuthRefresh: true,
      omitAuth: true,
      body: JSON.stringify({ email: email, password: password }),
    }).then(function (result) {
      if (result && result.access_token) writeSession(stampExpiry(result));
      return result;
    });
  }

  function signOut() {
    var existing = readSession();
    var token = existing && existing.access_token;
    return request("/auth/v1/logout", {
      method: "POST",
      keepalive: true,
      skipAuthRefresh: true,
    }).finally(function () {
      var current = readSession();
      if (!current || !token || current.access_token === token) writeSession(null);
    });
  }

  function getUser() {
    return request("/auth/v1/user", { method: "GET" });
  }

  function rest(table, options) {
    options = options || {};
    var suffix = options.query ? "?" + options.query : "";
    return request("/rest/v1/" + encodeURIComponent(table) + suffix, {
      method: options.method || "GET",
      body: options.body == null ? undefined : JSON.stringify(options.body),
      headers: Object.assign(
        { Prefer: options.prefer || "return=representation" },
        options.headers || {}
      ),
    });
  }

  function rpc(name, params) {
    return request("/rest/v1/rpc/" + encodeURIComponent(name), {
      method: "POST",
      body: JSON.stringify(params || {}),
    });
  }

  window.CognationSupabase = {
    configured: configured,
    getSession: readSession,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    getUser: getUser,
    rest: rest,
    rpc: rpc,
  };
})();
