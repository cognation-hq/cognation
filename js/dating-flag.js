/**
 * P0 dating kill switch (2026-10-15). ONE flag for the whole dating path.
 * false = dating entry hidden, See dating forced off, dating pool empty,
 * seed dating opt-ins not applied. Flip to true only after a SeedOps recheck.
 * Server side: public.cognation_dating_enabled() in
 * supabase/migrations/20261016_dating_off.sql (Alexa runs it; not auto-run).
 */
(function () {
  "use strict";
  var DATING_ENABLED = false;
  window.CognationDatingFlag = {
    enabled: function () { return DATING_ENABLED === true; },
  };
})();
