/**
 * POST /api/signup-check  { "email": "..." }  ->  { "blocked": boolean }
 * Server-side check of a new signup email against the closed-under-13
 * fingerprint list. Stores nothing and logs nothing about the email.
 * Needs Pages env: COPPA_EMAIL_PEPPER, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY.
 * If the pepper or Supabase is unavailable it answers { blocked: false,
 * checked: false } so signup is not broken; the birthdate gate still applies.
 */
import { emailFingerprint, fingerprintBlocked } from "./_coppa-fingerprint.js";

const HEADERS = { "content-type": "application/json", "cache-control": "no-store" };

export async function onRequestPost(context, deps = {}) {
  const env = (context && context.env) || {};
  let email = "";
  try {
    const body = await context.request.json();
    email = body && typeof body.email === "string" ? body.email : "";
  } catch (e) {
    email = "";
  }
  if (!email || email.length > 320) {
    return new Response(JSON.stringify({ blocked: false, checked: false }), { status: 400, headers: HEADERS });
  }
  if (!env.COPPA_EMAIL_PEPPER) {
    return new Response(JSON.stringify({ blocked: false, checked: false }), { headers: HEADERS });
  }
  try {
    const fp = await emailFingerprint(email, env.COPPA_EMAIL_PEPPER);
    const blocked = await fingerprintBlocked(fp, env, deps.fetch || fetch);
    return new Response(JSON.stringify({ blocked, checked: true }), { headers: HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ blocked: false, checked: false }), { headers: HEADERS });
  }
}
