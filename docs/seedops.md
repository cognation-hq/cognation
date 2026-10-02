# SeedOps — six must-builds

Engineer (Chief of Ops) scaffolding for Cognation seed/demo fleet work.
Live SoT: `cognation-hq/cognation` → `cognation-3md.pages.dev`.

## 1. Seed schema

Module: `js/seedops-schema.js` → `window.CognationSeedOps`

| Field | Meaning |
|-------|---------|
| `accountKind` | `"real"` \| `"seed"` \| `"ops"` |
| `isSeed` / `isOpsBot` | convenience booleans |
| `seedFleetId` | `seed-0001`…`seed-1000` or `ops-…` |
| `displayName` | **plain first name only** (no last names / numbers) |
| `handle` | machine id e.g. `seed-maya-0042` |

Fleet size: **1000** synthesizable accounts via `listSeedAccounts` / `buildSeedRecord`.  
`materializeSample(n)` writes a small sample into `CognationAccounts` for local UI without bloating storage on every boot.

## 2. Demo badge

Module: `js/seedops-badge.js` → `window.CognationSeedOpsBadge`  
CSS: `.seedops-demo-badge`  
Labels: **Demo · seed** / **Ops · demo**. Synced on Tower identity, News bylines, people-search rows.

## 3. Pathway runners

Module: `js/seedops-pathways.js` → `window.CognationSeedOpsPathways`

```js
CognationSeedOpsPathways.run("tower" | "commune" | "news" | "circle" | "chat" | "classroom" | "dating" | "ads")
CognationSeedOpsPathways.runAll()
```

Emits `cognation:seedops-pathway-start|step|complete`. Classroom is stubbed when no surface exists yet.

## 4. real ↛ seed friend-block

Module: `js/seedops-friend-gate.js` → `window.CognationSeedOpsFriendGate`

| Pair | Allowed? |
|------|----------|
| real ↔ real | yes |
| seed ↔ seed | yes (Circle mutual-graph) |
| ops ↔ seed/ops | yes |
| real ↔ seed/ops | **no** |

Hooks: `js/social-graph.js`, `js/tower-follow.js`, `js/tower.js` (`addTowerFriend`), `server/social-store.js`, Supabase migration `supabase/migrations/20261002_seedops_account_kind.sql`.

## 5. News logging hooks

Module: `js/seedops-news-log.js` → `window.CognationSeedOpsNewsLog`  
Wired from `js/commune.js` (`postsFromTower` / `renderFeed` / `appendPostEl`).

Event channel `news` (via `CognationSeedOpsLog`):

```json
{
  "stage": "rank|age_floor|render|audit",
  "editionId": "local",
  "towerPostId": "…",
  "newsPostId": "from-tower-…",
  "authorName": "Maya",
  "seedFleetId": "seed-0042",
  "accountKind": "seed",
  "reactionScore": 3,
  "rankedIndex": 0,
  "ageFloorPassed": true,
  "rendered": true
}
```

Path audited: **seed Tower post → curator ranking (reaction sort) → age floor → newspaper render**.

## 6. Friction-event instrumentation

Module: `js/seedops-friction.js` → `window.CognationFriction`  
Channel `friction`. **Real beta users only** (seed/ops skipped). No bot ratings of humans.

```json
{
  "pathway": "tower|commune|news|circle|chat|classroom|dating|ad",
  "phase": "start|stall|retry|abandon|complete",
  "surface": "tab:tower",
  "sessionId": "…",
  "userKind": "real",
  "attempt": 1,
  "dwellMs": 45000,
  "reason": "idle_threshold"
}
```

Shared sink: `js/seedops-log.js` (`sessionStorage` ring `cognation.seedops.log.v1` + `console.debug`).

## Ops notes

- Public Pages still must not expose a “Demo unlock” control (`scripts/check-no-public-demo-surface.js`).
- Seed badges label **accounts**, not the local preview auth chrome.

## Wave provision + auth binding (Supabase)

Shared website fleet upsert + Admin API password binding: see [`docs/seedops-provision.md`](seedops-provision.md).

- Wave 1 default: `provision_seed_wave(0, 100)` then `node scripts/seedops-bind-auth.mjs`
- Free-trial Demo max: **250** seeds (+3 ops); grow past 100 only after Wave 1 green; past 250 needs Alexa unlock
- Friend gate unchanged: seed↔seed OK after binding; real↛seed blocked
