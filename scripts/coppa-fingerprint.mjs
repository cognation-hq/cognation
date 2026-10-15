#!/usr/bin/env node
/**
 * Investigator manual step (no admin/moderator role exists in the schema yet).
 * Prints the keyed fingerprint for ONE confirmed-under-13 email so it can be
 * recorded with public.coppa_record_closed_u13(fp) in the Supabase SQL editor.
 *
 *   COPPA_EMAIL_PEPPER=... node scripts/coppa-fingerprint.mjs   (then type the email; input is not echoed to logs)
 *
 * Reads the email from stdin so it never lands in shell history. Prints only
 * the hex fingerprint. Never store or paste the raw email anywhere else.
 */
import { emailFingerprint } from "../functions/api/_coppa-fingerprint.js";

const pepper = process.env.COPPA_EMAIL_PEPPER;
if (!pepper) {
  console.error("Set COPPA_EMAIL_PEPPER (same value as the Pages env).");
  process.exit(1);
}
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", async () => {
  const email = input.split(/\r?\n/)[0];
  if (!email.trim()) {
    console.error("No email on stdin.");
    process.exit(1);
  }
  console.log(await emailFingerprint(email, pepper));
});
