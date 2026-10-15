/**
 * Keyed email fingerprint for closed under-13 accounts.
 *   fingerprint = hex(HMAC-SHA256(key = env.COPPA_EMAIL_PEPPER, msg = trim(lowercase(email))))
 * The pepper lives only in the Pages environment. It is never in code, never
 * logged, and never returned to the browser. Works in Workers and Node 18+.
 */
export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export async function emailFingerprint(email, pepper) {
  const norm = normalizeEmail(email);
  if (!norm || !pepper) throw new Error("fingerprint unavailable");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(pepper)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(norm));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/* Ask Supabase (publishable key, security-definer RPC) whether a fingerprint
   is on the closed-under-13 list. Returns true/false; throws on transport error. */
export async function fingerprintBlocked(fp, env, fetchImpl = fetch) {
  const url = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(env.SUPABASE_PUBLISHABLE_KEY || "");
  if (!url || !key) throw new Error("supabase not configured");
  const res = await fetchImpl(url + "/rest/v1/rpc/coppa_email_fingerprint_blocked", {
    method: "POST",
    headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ fp }),
  });
  if (!res.ok) throw new Error("rpc failed " + res.status);
  return (await res.json()) === true;
}
