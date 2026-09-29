# Cognation Pages Functions (news)

`$0` Google News RSS proxies for COMMUNE plates.

## Endpoints
- `GET /api/news/nationwide?country=United%20States`
- `GET /api/news/international`
- `GET /runtime-config` — browser config from `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Optional `COGNATION_LOCAL_DEMO=1` sets `localDemo` for non-Pages hosts only; live Pages never opens demo unlock from it. No project values are stored in git. This is not a moderation ingest route.

Returns JSON including `seedPosts` ready for News / commune feed refresh.

## Deploy
Direct Upload ZIP may not attach Functions. Prefer:

```bash
npx wrangler pages deploy /workspace/cognation-pages-deploy --project-name=cognation
```

with `functions/` alongside the static assets (Cloudflare maps `/functions` to routes).

Or connect the project to Git and keep `functions/` in repo root for Pages.
