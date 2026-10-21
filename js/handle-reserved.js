/* Handles that start with "seed-" or "ops-" belong to Cognation's own SeedOps
   accounts (fleet seeds and ops bots). Real members cannot pick them at signup
   or when they change a handle. SeedOps creates its accounts on the server
   (supabase/migrations/20261002_seedops_provision_wave.sql,
   scripts/seedops-bind-auth.mjs) and locally through
   CognationAccounts.saveProfileRecord, none of which call this check. */
(function (root) {
  "use strict";

  var RESERVED = /^(seed|ops)-/;

  function clean(raw) {
    return String(raw == null ? "" : raw).trim().replace(/^@+/, "").toLowerCase();
  }

  function isReserved(raw) {
    return RESERVED.test(clean(raw));
  }

  function message(noun) {
    var word = noun || "Usernames";
    return word + " can't start with \"seed-\" or \"ops-\". Those are saved for Cognation's own accounts. Please pick a different one.";
  }

  root.CognationHandleRules = { isReserved: isReserved, message: message };
})(typeof window !== "undefined" ? window : this);
