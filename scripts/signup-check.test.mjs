/**
 * /api/signup-check + keyed email fingerprint helper.
 * Run: node scripts/signup-check.test.mjs
 */
import assert from "node:assert";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { emailFingerprint, normalizeEmail } from "../functions/api/_coppa-fingerprint.js";
import { onRequestPost } from "../functions/api/signup-check.js";

const PEPPER = "test-pepper-not-real";
const expected = createHmac("sha256", PEPPER).update("kid@example.test").digest("hex");

assert.strictEqual(normalizeEmail("  Kid@Example.TEST "), "kid@example.test");
assert.strictEqual(await emailFingerprint(" Kid@Example.TEST", PEPPER), expected);
assert.notStrictEqual(await emailFingerprint("kid@example.test", "other"), expected, "keyed");
await assert.rejects(() => emailFingerprint("kid@example.test", ""), "no pepper, no fingerprint");

function ctx(body, env) {
  return { request: new Request("https://x/api/signup-check", { method: "POST", body: JSON.stringify(body) }), env };
}
const env = { COPPA_EMAIL_PEPPER: PEPPER, SUPABASE_URL: "https://sb.test", SUPABASE_PUBLISHABLE_KEY: "pk" };
let seen = [];
const listed = new Set([expected]);
const fakeFetch = async (url, opts) => {
  seen.push({ url, body: opts.body });
  return new Response(JSON.stringify(listed.has(JSON.parse(opts.body).fp)));
};

let r = await onRequestPost(ctx({ email: "KID@example.test" }, env), { fetch: fakeFetch });
assert.deepStrictEqual(await r.json(), { blocked: true, checked: true });
assert.strictEqual(seen[0].url, "https://sb.test/rest/v1/rpc/coppa_email_fingerprint_blocked");
assert.ok(!/example/.test(seen[0].body), "raw email never sent to the DB");
assert.ok(!seen[0].body.includes(PEPPER), "pepper never sent");

r = await onRequestPost(ctx({ email: "adult@example.test" }, env), { fetch: fakeFetch });
assert.deepStrictEqual(await r.json(), { blocked: false, checked: true });

r = await onRequestPost(ctx({ email: "kid@example.test" }, { SUPABASE_URL: "https://sb.test" }), { fetch: fakeFetch });
assert.deepStrictEqual(await r.json(), { blocked: false, checked: false }, "no pepper: fail open");

r = await onRequestPost(ctx({ email: "kid@example.test" }, env), { fetch: async () => { throw new Error("down"); } });
assert.deepStrictEqual(await r.json(), { blocked: false, checked: false }, "db down: fail open");

r = await onRequestPost(ctx({}, env), { fetch: fakeFetch });
assert.strictEqual(r.status, 400);

/* Secret only in env; SQL stores fingerprints only and is not service-role-free for writes. */
const sql = readFileSync(new URL("../supabase/migrations/20261014_coppa_email_fingerprints.sql", import.meta.url), "utf8");
assert.ok(/fp text primary key check \(fp ~ '\^\[0-9a-f\]\{64\}\$'\)/.test(sql));
assert.ok(!/email\s+text/i.test(sql), "no raw email column");
assert.ok(/grant execute on function public\.coppa_record_closed_u13\(text\) to service_role;/.test(sql));
assert.ok(/revoke all on function public\.coppa_record_closed_u13\(text\) from public, anon, authenticated;/.test(sql));
for (const f of ["_coppa-fingerprint.js", "signup-check.js"]) {
  const src = readFileSync(new URL("../functions/api/" + f, import.meta.url), "utf8");
  assert.ok(!/console\.(log|error)/.test(src), f + " logs nothing");
}
console.log("signup-check.test.mjs: ok");
