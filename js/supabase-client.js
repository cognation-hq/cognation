/**
 * Small browser client for Cognation's Supabase project.
 * The UI can progressively adopt this API while the legacy demo stores remain
 * available during migration.
 */
(function () {
  "use strict";

  var config = window.CognationConfig || {};
  var url = String(config.supabaseUrl || "").replace(/\/$/, "");
  var key = String(config.supabasePublishableKey || "");
  var SESSION_KEY = "cognation.supabase.session.v1";

  function configured() {
    return /^https:\/\//.test(url) && /^sb_publishable_/.test(key);
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

  function request(path, options) {
    if (!configured()) return Promise.reject(new Error("Supabase is not configured."));
    options = options || {};
    var session = readSession();
    var headers = Object.assign(
      {
        apikey: key,
        "Content-Type": "application/json",
      },
      options.headers || {}
    );
    if (session && session.access_token) {
      headers.Authorization = "Bearer " + session.access_token;
    }
    return fetch(url + path, Object.assign({}, options, { headers: headers })).then(function (response) {
      return response.text().then(function (text) {
        var body = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch (e) {
          body = text;
        }
        if (!response.ok) {
          var error = new Error((body && body.message) || "Supabase request failed.");
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
      if (result && result.session) writeSession(result.session);
      return result;
    });
  }

  function signIn(email, password) {
    return request("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email: email, password: password }),
    }).then(function (result) {
      if (result && result.access_token) writeSession(result);
      return result;
    });
  }

  function signOut() {
    var existing = readSession();
    var token = existing && existing.access_token;
    return request("/auth/v1/logout", { method: "POST", keepalive: true }).finally(function () {
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
