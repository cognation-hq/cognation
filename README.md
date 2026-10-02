# COGNATION — static site starter

Polished multi-page static website for the **COGNATION** instance. Plain HTML/CSS/JS — no build step, no Node on the server.

## Rename brand here

**Single source of truth:** [`js/brand.js`](js/brand.js)

```js
var SITE_BRAND = "COGNATION";
var SITE_TAGLINE = "Build clarity. Ship faster.";
```

That file sets `window.SITE_BRAND` / `window.SITE_TAGLINE` and fills:

- `[data-brand]` — brand name in logo wordmark, headings, prose, footer
- `[data-brand-mark]` — optional letter mark (fallback if you drop the image)
- `[data-brand-tagline]` — optional tagline text
- `title[data-brand-page]` — document title (`COGNATION — {page}`)
- `meta[data-brand-meta]` — description template with `{brand}` / `{tagline}`

Static fallback text in HTML is already **COGNATION** so the site reads correctly before JS runs. CSS documents this pointer at the top of `css/styles.css`.

## Swap the organization logo (one place)

**Replace this file:** [`assets/logo.svg`](assets/logo.svg)

That image is used on:

- Home startup / screensaver splash (`img.brand-logo--splash`)
- Header logos on Home, About, and Contact (`img.brand-logo--header`)

Drop in your own SVG (or PNG/JPG and update the `src` on those `img` tags). No other branding files to hunt down. Wordmark text still comes from `brand.js` via `[data-brand]`.

## Contents

```
cognation-site/
  index.html      # Startup splash + login gate, then Home tabs
  about.html      # About
  contact.html    # Contact (mailto form, no backend)
  assets/logo.svg # ← swap org logo here
  css/styles.css
  js/brand.js            # ← rename brand wordmark here
  js/main.js             # Mobile nav toggle
  js/tabs.js             # Accessible in-page tabs (Home)
  js/login.js            # Demo login gate + CognationAuth (API + local fallback)
  js/screen-break.js     # Screen-break lock, puzzle unlock, auto-logout
  js/commune.js            # COMMUNE newspaper: edition, profile, feed
  js/commune-messages.js   # COMMUNE Letters messaging UI (localStorage demo)
  README.md
```

## Entry flow (Home)

1. **Startup / screensaver splash** — prominent logo + COGNATION wordmark, then username/password Sign in (`#login-gate`). Demo-only: submit shows “Sign-in isn’t connected yet”; nothing is authenticated or stored.
2. Dismiss / browse without signing in / finish the gate → main site chrome and content.
3. **In-page tabs** (after the splash), L→R:

   | # | Label | Status |
   |---|--------|--------|
   | 1 | **TOWER** | Final (v1) |
   | 2 | **COMMUNE** | Final (v1) |
   | 3 | **WELL** | Final (v1) |
   | 4 | **PAGES** | Yellow Pages–style local business directory (demo listings) |

   PAGES is a separate top-level tab (not nested under TOWER / COMMUNE / WELL).

## WELL (patient chart demo)

Demo **EHR-style patient chart** on the **WELL** tab — two sides like Tower:

| Side | Role |
|------|------|
| **Patient** | Fill chart / documentation (intake, HPI, vitals, meds, allergies, SOAP progress note, care plan). Saves to `localStorage` key `cognation.well.portal.v1`. |
| **Provider** | Chart view only — locked fields; browse the same documentation + today’s roster / orders / inbox stubs. |

Side toggle persists in `sessionStorage` (`cognation.well.side` = `patient`\|`provider`). Soft clinical teal UI inside WELL; site chrome stays Cognation pink. **Demo only** — not a real EHR; no PHI leaves the browser; do not claim HIPAA compliance. Implementation: `js/well.js` + `.well-*` in `css/styles.css`.

## PAGES (Yellow Pages)

Local business directory on the **PAGES** tab — classic yellow-paper look, category filter, A–Z jump bar, alphabetical listings. Seeded with Chicago-area demo businesses (`js/pages.js`). Live Google Places / Maps needs a free backend later (do not call paid Google APIs from the client); swap via `fetchPagesListings(category, query)`.

Tower badge gifts (profile field `awardedBadges` in localStorage, including demo **yearbook** superlatives) remain separate from PAGES. The **Founder** bottle-cap and patch are exclusive to Alexa (login `alexa` / her profile) and are not earnable or gifted to other members.

## Deploy (nginx / Apache on Oracle Linux)

1. Copy everything in this folder to your web root, for example:

   ```bash
   sudo mkdir -p /var/www/html/cognation
   sudo cp -r /path/to/cognation-site/* /var/www/html/cognation/
   ```

2. Point the virtual host (or default site) document root at that directory, or serve it as a subdirectory.

3. Reload the web server:

   ```bash
   # nginx
   sudo nginx -t && sudo systemctl reload nginx

   # httpd (Apache)
   sudo apachectl configtest && sudo systemctl reload httpd
   ```

4. Open `https://your-host/` (or `/cognation/`) and verify Home, About, Contact, and the Grok Bot links.

No npm install. No build. Static files only.

## Grok Bot CTA

All primary CTAs link to **https://x.ai/bot** (link/button only — no embed).

## Before production

- Replace `hello@cognation.example` in `contact.html` with a real inbox.
- To rebrand: change `SITE_BRAND` in `js/brand.js` (and fallback strings in HTML if you want no-JS parity).
- Swap `assets/logo.svg` for your organization mark.
- Optionally add your own favicon and Open Graph meta tags.

## Login gate (demo)

Home opens with a **startup/screensaver** overlay (`#login-gate`): large logo, wordmark, then Sign in. Username + password fields use proper labels and `autocomplete`.

- **Sign in** calls `POST /api/session/login` `{ username }` with `credentials: "include"` when Head Hancho is up; on failure falls back to a **local demo session** (`cognation.session.demo.v1`). Password is UI-only — not sent.
- **Browse without signing in** (or Escape) also starts a local guest session so screen-break can run.
- `window.CognationAuth` — `login`, `logout`, `openGate`, `closeGate`, `isAuthenticated`, `getSession`.
- Logout clears the local flag, calls `POST /api/session/logout`, and re-opens `#login-gate`.

## Screen break / auto-logout

Module: [`js/screen-break.js`](js/screen-break.js) (styles in `css/styles.css`). Wired on Home only.

### Behavior

1. After **activityLimitMs** of visible screen time → full-screen navy/cyan lock overlay.
2. Forced **breakDurationMs = 15000** countdown (“look away / rest”).
3. Then a **memory-sequence** unlock puzzle (pads + keys `1`–`4`). Accessible: focus trap, `aria-live` timer, keyboard.
4. Correct solve → `POST /api/session/break/complete` `{ puzzleToken }` (local success if API down) → unlock & resume.
5. If unsolved within **solveTimeoutMs** (default 60s after the break), or server `breakDeadline` passes → **auto-logout** via `CognationAuth.logout` (clears session, shows login gate).

Escape does **not** dismiss the lock.

### Config constants (demo vs production)

| Constant | Demo default | Production suggestion |
|----------|--------------|------------------------|
| `useDemoTimings` | `true` | `false` |
| `activityLimitMs` | `50000` (50s) | `25 * 60 * 1000` (25 min) |
| `breakDurationMs` | `15000` | `15000` (forced 15s) |
| `solveTimeoutMs` | `60000` | `60000` |
| `apiBaseUrl` | `"/api"` | same origin or override via `window.CognationConfig.apiBaseUrl` |

Override at runtime: `CognationScreenBreak.config({ activityLimitMs: 30000 })`.

Public API: `window.CognationScreenBreak` — `start`, `stop`, `forceBreak`, `config`, `isLocked`, `getState`.

### Head Hancho session API hooks

All fetches use `credentials: "include"` (httpOnly cookie). Base URL: `CONFIG.apiBaseUrl` (default `/api`).

| Method | Path | Role |
|--------|------|------|
| `POST` | `/api/session/login` | `{ username }` → session cookie |
| `GET` | `/api/session/status` | `{ authenticated, breakRequired, breakDeadline, secondsRemaining }` |
| `POST` | `/api/session/activity` | Heartbeat / screen-time tick (may set `breakRequired`) |
| `POST` | `/api/session/break/complete` | `{ puzzleToken }` clears break, keeps session |
| `POST` | `/api/session/logout` | Invalidate session |

If `breakDeadline` passes without complete → treated as logged out; cookie cleared on next status/logout. **Local timers + localStorage remain the demo fallback when any fetch fails.**


## COMMUNE newspaper (demo)

The **COMMUNE** tab is laid out like an official newspaper:

- **Masthead** — “The Commune”, dateline, brand via `brand.js`, and an **edition scope** segmented control: Local · Statewide · Nationwide · International.
- **Left column** — section index (Front Page / Letters / Correspondent) + edition topics.
- **Center** — main well: news feed (default), Letters (messaging), or Correspondent (profile).
- **Right column** — briefs (byline, visibility, latest dispatch) + secondary topics.
- **Mobile** — stacks masthead → main → side topics.

### Edition scope

Switching edition updates the masthead subtitle/dateline, side topic lists, and the **scoped** news feed. Last choice persists in `cognation.commune.edition.v1`.


### International edition (local WIP)

When **Edition scope** is set to **International**, the paper root gets `data-edition="international"` and class `commune-paper--broadsheet`; CSS restyles The Commune as a black-and-white old-school broadsheet (newsprint cream, heavy rules, vintage masthead fonts — `UnifrakturMaguntia` / `IM Fell English` / `Special Elite` / `Old Standard TT`). Other editions keep the current pink/navy theme. **Local only — not on Cloudflare Pages until Alexa says.**

Oct 2 International G–PG wire pack (11 Cognation Wire items + editor’s box) lives in `EDITIONS.international.seedPosts` / `js/intl-seeds.json`. `FEED_SEED_VERSION` is currently `202610022`. Opening **International** or **Nationwide** auto-pulls that edition’s **curated** in-repo seed pack into the newspaper view (`FeedStore.pullCuratedSeedPack`) — no separate manual refresh required, and **no** raw `/api/news/*` Google News RSS (that path still has no age filters and must not autopublish for under-13). Nationwide uses `EDITIONS.nationwide.seedPosts`. If an old feed still looks wrong after a pack retip, clear `cognation.commune.feed.v1` or bump `FEED_SEED_VERSION` in `js/commune.js`.

### localStorage keys (demo)

| Key | Purpose |
|-----|---------|
| `cognation.commune.edition.v1` | Last edition scope (`local` / `statewide` / `nationwide` / `international`) |
| `cognation.commune.profile.v1` | Display name, bio, avatar URL placeholder, Private/Public |
| `cognation.commune.feed.v1` | Posts keyed by edition (`byEdition`) |
| `cognation.commune.messages.v1` | Letters / DM threads |

### Demo behavior

- **Feed:** compose + list per edition; seed posts on first visit; author uses profile display name when set.
- **Letters:** existing messaging UI (`js/commune-messages.js` / `MessageStore`) — two seed conversations.
- **Correspondent:** create/edit profile; **Private** vs **Public** visibility; optional avatar URL (initials placeholder if blank).
- **Not a live multi-user server** — browser-only. Stores (`EditionStore`, `ProfileStore`, `FeedStore`, `MessageStore`) are API-ready for a later backend swap.

## Accessibility

- Skip link, landmarks (`header`, `nav`, `main`, `footer`)
- `aria-current` on active nav items
- Visible focus styles and keyboard-usable mobile menu
- Home in-page tabs: `tablist` / `tab` / `tabpanel`, `aria-selected`, Arrow/Home/End/Enter/Space
- Login gate: `role="dialog"`, labelled fields, `aria-live` status, focus trap
- Screen break: full-screen dialog, focus trap, `aria-live` countdown, keyboard puzzle (1–4); Escape does not dismiss
- COMMUNE newspaper: edition `radiogroup`, section index buttons, feed `role="feed"`, Letters listbox/log, profile visibility radiogroup
