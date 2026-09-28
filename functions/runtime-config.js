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
  return new Response(body, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
