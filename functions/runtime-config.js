/**
 * GET /runtime-config
 * Injects Cognation browser config from Pages environment variables.
 * Values are not stored in the repository.
 *
 *   SUPABASE_URL
 *   SUPABASE_PUBLISHABLE_KEY
 */
export async function onRequest(context) {
  const env = (context && context.env) || {};
  const url = String(env.SUPABASE_URL || "");
  const key = String(env.SUPABASE_PUBLISHABLE_KEY || "");
  const payload = {};
  if (url) payload.supabaseUrl = url;
  if (key) payload.supabasePublishableKey = key;
  const body =
    "window.CognationConfig=Object.assign({},window.CognationConfig||{}," +
    JSON.stringify(payload) +
    ");";
  /* Publishable URL + key are public. Cache a complete payload briefly so
     reloads do not wait on an uncached Function. Never cache an empty config:
     a missing env var must not stick in the browser. */
  const complete = /^https:\/\//.test(url) && key.length > 0;
  return new Response(body, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": complete ? "public, max-age=120" : "no-store",
    },
  });
}
