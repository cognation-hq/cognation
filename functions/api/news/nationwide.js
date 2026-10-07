/**
 * GET /api/news/nationwide?country=United%20States
 * Google News RSS → JSON; publisher fallback if Google 503s from Pages.
 */
import { FALLBACK_BY_COUNTRY, parseRss, fetchGoogleRss } from "./_rss.js";

const COUNTRY_CEID = {
  "United States": { gl: "US", hl: "en-US", ceid: "US:en" },
  Canada: { gl: "CA", hl: "en-CA", ceid: "CA:en" },
  "United Kingdom": { gl: "GB", hl: "en-GB", ceid: "GB:en" },
  Mexico: { gl: "MX", hl: "es-419", ceid: "MX:es-419" },
  India: { gl: "IN", hl: "en-IN", ceid: "IN:en" },
};

function pickCountry(name) {
  const key = name || "United States";
  return COUNTRY_CEID[key] || COUNTRY_CEID["United States"];
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const country = url.searchParams.get("country") || "United States";
  const { gl, hl, ceid } = pickCountry(country);
  const rssUrl = `https://news.google.com/rss?hl=${encodeURIComponent(hl)}&gl=${encodeURIComponent(gl)}&ceid=${encodeURIComponent(ceid)}`;
  const fallbacks = FALLBACK_BY_COUNTRY[country] || FALLBACK_BY_COUNTRY["United States"];

  try {
    const upstream = await fetchGoogleRss(rssUrl, fallbacks);
    if (!upstream.ok) {
      return Response.json(
        {
          ok: false,
          error: upstream.blocked
            ? `upstream blocked (${upstream.status})`
            : `upstream ${upstream.status}`,
          country,
          items: [],
        },
        { status: 502 }
      );
    }
    const items = parseRss(upstream.xml);
    const sourceLabel = upstream.viaGoogle
      ? "Google News RSS"
      : `Publisher RSS fallback · ${upstream.usedUrl || "wire"}`;
    return Response.json(
      {
        ok: true,
        edition: "nationwide",
        country,
        source: sourceLabel,
        fetchedAt: new Date().toISOString(),
        items,
        seedPosts: items.slice(0, 12).map((it, i) => ({
          id: `gn-nat-${Date.now().toString(36)}-${i}`,
          authorName: it.source || "National Desk",
          kind: "news",
          source: upstream.viaGoogle ? `Google News · ${country}` : `Wire · ${country}`,
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
      { ok: false, error: String(err && err.message ? err.message : err), country, items: [] },
      { status: 500 }
    );
  }
}
