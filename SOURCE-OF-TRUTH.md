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

The public sign-in gate does not show a Demo unlock button, link, or other control. Live Pages (`*.pages.dev`, including `cognation-3md.pages.dev`) ignore `?demo=1`, `window.__COGNATION_DEMO__`, and any stored `cognation.demo.unlock.v1` flag. A saved demo session cannot skip sign-in on the product site.

Local preview only, and never on live Pages:

- Loopback (`localhost`, `127.0.0.1`, `::1`) or `file://`, or
- `COGNATION_LOCAL_DEMO=1` on a host that is not live Pages. `/runtime-config` exposes that as `CognationConfig.localDemo`. Live Pages ignores the flag even if the env var is set.

On that local gate, `?demo=1` or the local Demo unlock control sets `sessionStorage` key `cognation.demo.unlock.v1`. The site banner then reads **Demo — not real auth**.

- WELL shows **Demo EHR — not HIPAA**. Any one-time code is generated in the browser after its own chart unlock. It is not a default in the source, and it does not bypass Cognation sign-in on live Pages.
- `window.__COGNATION_DEMO__` stays unset for production.
