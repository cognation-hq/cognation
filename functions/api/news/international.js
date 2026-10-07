/**
 * GET /api/news/international
 * Google News RSS (World) → JSON for International plate; publisher fallback if Google 503s.
 */
import { WORLD_RSS_URL, FALLBACK_INTL, parseRss, fetchGoogleRss } from "./_rss.js";

export async function onRequestGet() {
  try {
    const upstream = await fetchGoogleRss(WORLD_RSS_URL, FALLBACK_INTL);
    if (!upstream.ok) {
      return Response.json(
        {
          ok: false,
          error: upstream.blocked
            ? `upstream blocked (${upstream.status})`
            : `upstream ${upstream.status}`,
          items: [],
        },
        { status: 502 }
      );
    }
    const items = parseRss(upstream.xml);
    const sourceLabel = upstream.viaGoogle
      ? "Google News RSS · World"
      : `Publisher RSS fallback · ${upstream.usedUrl || "wire"}`;
    return Response.json(
      {
        ok: true,
        edition: "international",
        source: sourceLabel,
        fetchedAt: new Date().toISOString(),
        items,
        seedPosts: items.slice(0, 12).map((it, i) => ({
          id: `gn-intl-${Date.now().toString(36)}-${i}`,
          authorName: it.source || "World Desk",
          kind: "news",
          source: upstream.viaGoogle ? "Google News · International" : "Wire · International",
          body: `${it.title}${it.summary ? " — " + it.summary : ""}${it.link ? " Source: " + it.link : ""}`,
          createdAt: it.pubDate ? new Date(it.pubDate).toISOString() : new Date().toISOString(),
          seeded: true,
        })),
      },
      {
        headers: {
          "Cache-Control": "public, max-age=900",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    return Response.json(
      { ok: false, error: String(err && err.message ? err.message : err), items: [] },
      { status: 500 }
    );
  }
}
