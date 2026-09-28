# Deploy notes — CGN-008 / 009 / 010 / 011 (2026-09-17 CT)

Source of truth: `/workspace/cognation-site/`  
Static sync: `/workspace/cognation-pages-deploy/` (excludes `server/`, `docs/`, `node_modules/`, `.wrangler/`)

Login gate uses Cognation account sign-in. Local preview uses the Demo unlock button or `?demo=1` (no shared password in the site files). See `SOURCE-OF-TRUTH.md`.

## How to try (Alexa)

### CGN-008 Tower UX
1. Sign in → **TOWER** tab (coral `#FF907D` background).
2. Confirm blurb under title is gone; compose heading is short (**On the block**).
3. **Left rail:** Friends as **circle photos only** (no names); green ring = online (demo). Mini **Personal calendar** under friends.
4. **Center:** wider feed.
5. **Right:** Messages `<details>` **closed by default** → open summary → name list → click a name → thread opens.
6. Calendar details are compact; **no public ICS / calendar URL** field.
7. Top Friends + Badges summaries shortened; buttons smaller.
8. Public → Personal page: calendar sticker uses same event data (`data-tower-calendar-personal`).

### CGN-009 NEWS report
1. Open **NEWS** tab → any edition with posts.
2. Under a post: **Report** → **Harmful** or **Untruthful**.
3. Post hides for you (demo store).
4. Console: `CognationModeration.listQueue()` and `CognationModeration.downloadLastPendingFile()`.
5. Drop file into `/workspace/news-moderation/queue/pending/` (or run `node scripts/mirror-moderation-pending.mjs file.json` from site).
6. Forward to Investigator bot **3949519** (SendToAgent) — see site `docs/moderation-investigator-notes.md` and `/workspace/news-moderation/README.md`.
7. **No user bans.**

### CGN-010 Go live
1. TOWER → Public profile → profile pic **Go live** (or feed post **Go live**).
2. Live panel (`data-live-stage`) opens — stub only (no WebRTC).
3. Toggle **Share to COMMUNE** / **Share to Tower** buttons (`aria-pressed`).
4. COMMUNE share blocked if demo age &lt; 18 (`cognation.member.profile.v1`).
5. Post comments (localStorage); click join area to request; **Approve join** adds cams (max 20).
6. Professional page: **Buy / tip** + **Join class** stubs.

### CGN-011 Fact-check (COMMUNE swipe)
1. **COMMUNE** tab → swipe deck.
2. Random-fact cards only when `data-fact-verified="true"` (News-curated `DEMO_FACTS` with Source cites).

## Files touched (high level)
- `index.html` — HTML Coder shells + hooks  
- `css/styles.css` — HTML Coder CGN-008–011 UI pass (`#FF907D`, rails, live, report)  
- `js/tower.js` — friends circles/`data-online`, personal mini calendar, badges selector fix  
- `js/commune-messages.js` — closed-by-default, name list, thread open  
- `js/commune.js` — report footer + `data-news-post` / hide check  
- `js/commune-swipe.js` — verified-only facts (**DEMO_FACTS preserved**)  
- `js/moderation.js` — `CognationModeration.enqueue` → localStorage + news-moderation file shape  
- `js/news-report-stub.js` — wires Report UI → enqueue + hide  
- `js/live-stubs.js` — Go live behavior on shell hooks  
- `js/go-live.js` — shim (behavior in live-stubs)  
- `/workspace/news-moderation/` — Investigator inbox  
- `docs/moderation-*.md|json`, `scripts/mirror-moderation-pending.mjs` (site only; docs excluded from Pages sync)

## Blockers
- Browser cannot write `/workspace/news-moderation/` directly on static Pages — use download / mirror script / agent copy, then SendToAgent **3949519**.
- Live is intentionally **not** WebRTC — UI stub + localStorage only.
- Optional `/api/moderation/report` ingest is best-effort no-op until a Pages Function exists.
