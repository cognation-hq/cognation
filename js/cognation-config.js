/* Public defaults only. Project URL and publishable key come from /runtime-config (Pages env). */
(function () {
  "use strict";

  window.CognationConfig = Object.assign(
    {
      supabaseUrl: "",
      supabasePublishableKey: "",
    },
    window.CognationConfig || {}
  );
})();
