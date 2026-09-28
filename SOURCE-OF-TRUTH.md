# Cognation source of truth

## Canonical path

GitHub `cognation-hq/cognation` is the live home. Cloudflare Pages project `cognation` (`cognation-3md.pages.dev`) stays connected here.

`Waymakerscs/cognation` is parked for a later combine. Do not treat it as the Pages source.

On the box, the source-of-truth path is `cognation-site`. That tree is the cognation-site content that belongs in `cognation-hq/cognation`.

`/workspace/cognation-pages-deploy` is a deploy artifact only. It may be stale. Do not edit it as source of truth. Do not treat parallel box zips or mirrors as an editable source of truth. Change GitHub, then Head Hancho redeploys Pages.

## Cognation is not Waymakers

Never mix Cognation with Waymakers:

- GitHub: `Waymakerscs/waymakers`
- Pages: `waymakers.pages.dev`
- The Supabase project used for Waymakers

## Runtime config (no secrets in git)

The Supabase URL and publishable key are not stored in this repository. Cloudflare Pages injects them at request time from `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` via `/runtime-config`. Do not commit those values or a Supabase `service_role` secret.

## What Cloudflare Pages cannot run

- Pages cannot run the Express `server/` session API (`/api/session/*`). Screen-break is labeled **Demo / local only**.
- A moderation queue write from the browser to the box is not available on Pages. NEWS reports stay in this browser and are labeled **Demo / local only**. Moderation Function ingest is deferred. This repo does not add that ingest.
- Go-live is labeled **Demo / local only**.

## Demo access

Public builds do not embed `EXPECTED_PASS` or `DEMO_OTP`.

- `?demo=1` or the **Demo unlock** button sets `sessionStorage` key `cognation.demo.unlock.v1`.
- The site banner then reads **Demo — not real auth**.
- WELL shows **Demo EHR — not HIPAA**. Any one-time code is generated in the browser after unlock. It is not a default in the source.
- `window.__COGNATION_DEMO__` stays unset for production.
