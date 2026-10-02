#!/usr/bin/env node
/**
 * SeedOps #2 — bind usable Auth passwords to provisioned seed/ops stubs.
 *
 * Prerequisites:
 *   1. Wave provision (#1): provision_seed_wave(0, 100) already applied
 *   2. Env (never commit):
 *        SUPABASE_URL
 *        SUPABASE_SERVICE_ROLE_KEY
 *        SEEDOPS_AUTH_PASSWORD   shared ops-only password for seed↔seed testing
 *
 * Defaults (free-trial Demo):
 *   Wave 1: offset=0 limit=100 (+ 3 ops bots always)
 *   Hard cap: 250 seeds. Past 100 requires --allow-grow (after Wave 1 green).
 *   Past 250 requires --unlock-fleet (Alexa only).
 *
 * Usage:
 *   node scripts/seedops-bind-auth.mjs
 *   node scripts/seedops-bind-auth.mjs --offset 0 --limit 100
 *   node scripts/seedops-bind-auth.mjs --offset 100 --limit 150 --allow-grow
 *   node scripts/seedops-bind-auth.mjs --dry-run
 *   node scripts/seedops-bind-auth.mjs --ops-only
 *
 * See docs/seedops-provision.md
 */
import crypto from "crypto";

const FLEET_SIZE = 1000;
const DEMO_CAP = 250; // free-trial Demo max (+3 ops); Alexa unlock to exceed
const WAVE1_LIMIT = 100;

const FIRST_NAMES = [
  "Ada", "Aisha", "Alex", "Amir", "Ana", "Andre", "Aria", "Asher", "Ava", "Bea",
  "Ben", "Blair", "Cam", "Cara", "Chris", "Cora", "Dana", "Dev", "Drew", "Eden",
  "Eli", "Ella", "Emma", "Ezra", "Finn", "Fran", "Gabe", "Gia", "Grey", "Hank",
  "Harper", "Hazel", "Ian", "Imani", "Iris", "Ivan", "Jade", "Jamie", "Jay", "Jess",
  "Jordan", "Jules", "Kai", "Kara", "Ken", "Kim", "Kit", "Lane", "Leo", "Lex",
  "Lila", "Liv", "Luna", "Mae", "Mara", "Max", "Maya", "Micah", "Mila", "Mina",
  "Morgan", "Nia", "Nik", "Noa", "Nora", "Omar", "Ora", "Owen", "Pax", "Pearl",
  "Quinn", "Rae", "Remy", "Rio", "Robin", "Rosa", "Rowan", "Sage", "Sam", "Sasha",
  "Shawn", "Skye", "Sol", "Talia", "Tess", "Theo", "Tia", "Troy", "Uma", "Uri",
  "Val", "Vera", "Vince", "Wade", "Wes", "Will", "Wren", "Xander", "Yara", "Zoe",
  "Ari", "Bo", "Cal", "Dee", "Eve", "Faye", "Gus", "Hoyt", "Ivy", "Jo",
  "Kade", "Lou", "Mo", "Ned", "Otis", "Pip", "Quill", "Reed", "Syd", "Ted",
  "Uli", "Vic", "Wynn", "York", "Zed", "Ash", "Blake", "Casey", "Dale", "Ellis",
  "Frankie", "Glen", "Harley", "Indie", "Jackie", "Kelly", "Leslie", "Marley", "Nicky", "Oakley",
  "Parker", "Reese", "Sidney", "Taylor", "Whitney", "Avery", "Bailey", "Cameron", "Dakota", "Emerson",
  "Finley", "Hayden", "Jordan", "Kendall", "Logan", "Morgan", "Peyton", "Quinn", "Riley", "Sawyer",
  "Charlie", "Frankie", "Jamie", "Jessie", "Pat", "Ronnie", "Stevie", "Terry", "Tracy", "Bobby"
];

const OPS_BOTS = [
  { fleetId: "ops-curator", displayName: "Curator", handle: "ops-curator" },
  { fleetId: "ops-mod", displayName: "Moderator", handle: "ops-mod" },
  { fleetId: "ops-wire", displayName: "Wire", handle: "ops-wire" }
];

function pad4(n) {
  return String(Math.max(0, n)).padStart(4, "0");
}

function slugify(name) {
  return String(name || "seed")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]+/g, "")
    .slice(0, 16) || "seed";
}

function firstNameAt(index) {
  const n = FIRST_NAMES.length;
  const i = ((Number(index) || 0) % n + n) % n;
  return FIRST_NAMES[i];
}

/** Match SQL: md5('cognation.seedops.v1:' || fleet_id)::uuid */
function stubUserId(fleetId) {
  const hex = crypto
    .createHash("md5")
    .update("cognation.seedops.v1:" + String(fleetId || ""))
    .digest("hex");
  return (
    hex.slice(0, 8) +
    "-" +
    hex.slice(8, 12) +
    "-" +
    hex.slice(12, 16) +
    "-" +
    hex.slice(16, 20) +
    "-" +
    hex.slice(20, 32)
  );
}

function seedSpec(index) {
  const i = Math.max(0, Math.min(FLEET_SIZE - 1, Number(index) || 0));
  const name = firstNameAt(i);
  const nnn = pad4(i + 1);
  const fleetId = "seed-" + nnn;
  return {
    fleetId,
    accountKind: "seed",
    handle: "seed-" + slugify(name) + "-" + nnn,
    displayName: name,
    email: fleetId + "@seed.cognation.internal",
    userId: stubUserId(fleetId)
  };
}

function opsSpec(bot) {
  return {
    fleetId: bot.fleetId,
    accountKind: "ops",
    handle: bot.handle,
    displayName: bot.displayName,
    email: bot.fleetId + "@ops.cognation.internal",
    userId: stubUserId(bot.fleetId)
  };
}

function parseArgs(argv) {
  const out = {
    offset: 0,
    limit: WAVE1_LIMIT,
    dryRun: false,
    opsOnly: false,
    allowGrow: false,
    unlockFleet: false,
    createMissing: true
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--ops-only") out.opsOnly = true;
    else if (a === "--allow-grow") out.allowGrow = true;
    else if (a === "--unlock-fleet") out.unlockFleet = true;
    else if (a === "--no-create") out.createMissing = false;
    else if (a === "--offset") out.offset = Number(argv[++i]);
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--help" || a === "-h") out.help = true;
    else {
      console.error("Unknown arg:", a);
      out.help = true;
    }
  }
  if (process.env.SEEDOPS_ALLOW_GROW === "1") out.allowGrow = true;
  if (process.env.SEEDOPS_UNLOCK_FLEET === "1") out.unlockFleet = true;
  return out;
}

function usage() {
  console.log(`SeedOps auth binding (Demo cap ${DEMO_CAP}, Wave 1 default ${WAVE1_LIMIT})

Env:
  SUPABASE_URL                 required
  SUPABASE_SERVICE_ROLE_KEY    required (never commit)
  SEEDOPS_AUTH_PASSWORD        required unless --dry-run
  SEEDOPS_ALLOW_GROW=1         allow past Wave 1 up to ${DEMO_CAP}
  SEEDOPS_UNLOCK_FLEET=1       Alexa unlock past ${DEMO_CAP}

Flags:
  --offset N --limit N   default 0 ${WAVE1_LIMIT}
  --allow-grow           permit end > ${WAVE1_LIMIT} (still capped at ${DEMO_CAP})
  --unlock-fleet         permit end > ${DEMO_CAP} (Alexa)
  --ops-only             bind ops bots only
  --dry-run              print plan; no Admin writes
  --no-create            fail if stub auth.users row missing
`);
}

function enforceCaps(opts) {
  const offset = Math.max(0, Number(opts.offset) || 0);
  let limit = Math.max(0, Number(opts.limit) || 0);
  if (opts.opsOnly) return { offset: 0, limit: 0, end: 0 };
  if (!Number.isFinite(offset) || !Number.isFinite(limit)) {
    throw new Error("offset/limit must be numbers");
  }
  if (offset >= FLEET_SIZE) {
    throw new Error(`offset ${offset} beyond schema fleet size ${FLEET_SIZE}`);
  }
  limit = Math.min(limit, FLEET_SIZE - offset);
  const end = offset + limit;
  if (end > DEMO_CAP && !opts.unlockFleet) {
    throw new Error(
      `Refusing end=${end} past free-trial Demo cap ${DEMO_CAP}. ` +
        `Pass --unlock-fleet (Alexa) or SEEDOPS_UNLOCK_FLEET=1.`
    );
  }
  if (end > WAVE1_LIMIT && !opts.allowGrow && !opts.unlockFleet) {
    throw new Error(
      `Refusing end=${end} past Wave 1 (${WAVE1_LIMIT}). ` +
        `After Wave 1 is green, pass --allow-grow (still capped at ${DEMO_CAP}).`
    );
  }
  return { offset, limit, end };
}

async function adminFetch(baseUrl, serviceKey, method, path, body) {
  const url = baseUrl.replace(/\/$/, "") + path;
  const res = await fetch(url, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: "Bearer " + serviceKey,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: body == null ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json, text };
}

async function restFetch(baseUrl, serviceKey, method, path, body) {
  const url = baseUrl.replace(/\/$/, "") + path;
  const res = await fetch(url, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: "Bearer " + serviceKey,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: body == null ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json, text };
}

async function getUser(baseUrl, key, userId) {
  return adminFetch(baseUrl, key, "GET", "/auth/v1/admin/users/" + userId);
}

async function updateUser(baseUrl, key, userId, payload) {
  return adminFetch(baseUrl, key, "PUT", "/auth/v1/admin/users/" + userId, payload);
}

async function createUser(baseUrl, key, payload) {
  return adminFetch(baseUrl, key, "POST", "/auth/v1/admin/users", payload);
}

function authPayload(spec, password) {
  return {
    email: spec.email,
    password,
    email_confirm: true,
    ban_duration: "none",
    user_metadata: {
      handle: spec.handle,
      display_name: spec.displayName,
      seed_fleet_id: spec.fleetId,
      account_kind: spec.accountKind
    },
    app_metadata: {
      provider: "email",
      providers: ["email"],
      seedops: true,
      account_kind: spec.accountKind,
      seed_fleet_id: spec.fleetId
    }
  };
}

async function stampProfile(baseUrl, key, spec) {
  /* Best-effort: stamp account_kind / seed_fleet_id if profile exists for user_id */
  const q =
    "/rest/v1/profiles?user_id=eq." +
    encodeURIComponent(spec.userId) +
    "&kind=eq.personal";
  const get = await restFetch(baseUrl, key, "GET", q);
  if (!get.ok) {
    return { ok: false, step: "profile-get", status: get.status, detail: get.text };
  }
  const rows = Array.isArray(get.json) ? get.json : [];
  if (!rows.length) {
    return { ok: true, step: "profile-missing", note: "run provision_seed_wave first" };
  }
  const patch = await restFetch(
    baseUrl,
    key,
    "PATCH",
    "/rest/v1/profiles?id=eq." + encodeURIComponent(rows[0].id),
    {
      handle: spec.handle,
      display_name: spec.displayName,
      account_kind: spec.accountKind,
      seed_fleet_id: spec.fleetId
    }
  );
  if (!patch.ok) {
    return { ok: false, step: "profile-patch", status: patch.status, detail: patch.text };
  }
  return { ok: true, step: "profile-stamped", profileId: rows[0].id };
}

async function bindOne(baseUrl, key, spec, password, opts) {
  const result = {
    fleetId: spec.fleetId,
    userId: spec.userId,
    email: spec.email,
    action: null,
    ok: false
  };
  if (opts.dryRun) {
    result.action = "dry-run";
    result.ok = true;
    return result;
  }

  const existing = await getUser(baseUrl, key, spec.userId);
  if (existing.ok && existing.json && existing.json.id) {
    const upd = await updateUser(baseUrl, key, spec.userId, authPayload(spec, password));
    if (!upd.ok) {
      result.action = "update-failed";
      result.status = upd.status;
      result.detail = upd.text;
      return result;
    }
    result.action = "updated";
  } else if (existing.status === 404 || (existing.json && existing.json.code === 404)) {
    if (!opts.createMissing) {
      result.action = "missing";
      result.detail = "stub auth.users not found; run provision_seed_wave first";
      return result;
    }
    const created = await createUser(baseUrl, key, {
      ...authPayload(spec, password),
      id: spec.userId
    });
    if (!created.ok) {
      result.action = "create-failed";
      result.status = created.status;
      result.detail = created.text;
      return result;
    }
    result.action = "created";
  } else {
    result.action = "lookup-failed";
    result.status = existing.status;
    result.detail = existing.text;
    return result;
  }

  const prof = await stampProfile(baseUrl, key, spec);
  result.profile = prof;
  result.ok = true;
  return result;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    usage();
    process.exit(0);
  }

  const baseUrl = process.env.SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const password = process.env.SEEDOPS_AUTH_PASSWORD || "";

  if (!baseUrl || !serviceKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    usage();
    process.exit(2);
  }
  if (!opts.dryRun && !password) {
    console.error("Missing SEEDOPS_AUTH_PASSWORD (ops-only shared password; not committed)");
    process.exit(2);
  }
  if (password && password.length < 12) {
    console.error("SEEDOPS_AUTH_PASSWORD must be at least 12 characters");
    process.exit(2);
  }

  let caps;
  try {
    caps = enforceCaps(opts);
  } catch (e) {
    console.error(String(e && e.message ? e.message : e));
    process.exit(2);
  }

  const specs = [];
  for (const bot of OPS_BOTS) specs.push(opsSpec(bot));
  if (!opts.opsOnly) {
    for (let i = caps.offset; i < caps.offset + caps.limit; i++) {
      specs.push(seedSpec(i));
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        phase: "plan",
        dryRun: opts.dryRun,
        demoCap: DEMO_CAP,
        wave1Limit: WAVE1_LIMIT,
        offset: caps.offset,
        limit: caps.limit,
        end: caps.end,
        opsBots: OPS_BOTS.length,
        total: specs.length,
        fromFleetId: opts.opsOnly ? null : seedSpec(caps.offset).fleetId,
        toFleetId: opts.opsOnly || !caps.limit ? null : seedSpec(caps.offset + caps.limit - 1).fleetId
      },
      null,
      2
    )
  );

  const summary = { updated: 0, created: 0, dryRun: 0, failed: 0, missing: 0 };
  const failures = [];

  for (const spec of specs) {
    const r = await bindOne(baseUrl, serviceKey, spec, password, opts);
    if (r.action === "updated") summary.updated += 1;
    else if (r.action === "created") summary.created += 1;
    else if (r.action === "dry-run") summary.dryRun += 1;
    else if (r.action === "missing") summary.missing += 1;
    if (!r.ok) {
      summary.failed += 1;
      failures.push(r);
      console.error("FAIL", r.fleetId, r.action, r.status || "", (r.detail || "").slice(0, 200));
    } else {
      console.log("OK", r.fleetId, r.action, r.userId);
    }
  }

  const out = {
    ok: summary.failed === 0,
    phase: "done",
    summary,
    failureCount: failures.length,
    note:
      "seed↔seed / ops friending uses send_friend_request as authenticated seed users; real↛seed stays blocked. No public Demo unlock UI."
  };
  console.log(JSON.stringify(out, null, 2));
  if (failures.length) {
    console.error(JSON.stringify({ failures: failures.slice(0, 20) }, null, 2));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
