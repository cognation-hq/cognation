/**
 * Shared Google News RSS fetch for Pages Functions.
 *
 * Google often returns 503 / "automated queries" HTML to Cloudflare edge
 * egress (bot UA or datacenter IP). We: (1) fetch Google with browser-like
 * headers + redirect:follow + stable WORLD topics URL, (2) retry once,
 * (3) fall back to public publisher RSS so plates are not empty.
 */

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Stable WORLD topic RSS (avoids /headlines/section/topic/WORLD → 302). */
export const WORLD_RSS_URL =
  "https://news.google.com/rss/topics/CAAqKggKIiRDQkFTRlFvSUwyMHZNRGx1YlY4U0JXVnVMVlZUR2dKVlV5Z0FQAQ?hl=en-US&gl=US&ceid=US:en";

/** Publisher feeds that typically allow CF Workers egress when Google 503s. */
export const FALLBACK_INTL = [
  "https://feeds.bbci.co.uk/news/world/rss.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
];

export const FALLBACK_BY_COUNTRY = {
  "United States": [
    "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml",
    "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
    "https://feeds.npr.org/1001/rss.xml",
  ],
  Canada: [
    "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml",
    "https://www.cbc.ca/webfeed/rss/rss-topstories",
  ],
  "United Kingdom": [
    "https://feeds.bbci.co.uk/news/rss.xml",
    "https://feeds.bbci.co.uk/news/uk/rss.xml",
  ],
  Mexico: [
    "https://feeds.bbci.co.uk/news/world/latin_america/rss.xml",
  ],
  India: [
    "https://feeds.bbci.co.uk/news/world/asia/india/rss.xml",
  ],
};

export function parseRss(xml) {
  const items = [];
  const parts = xml.split(/<item>/i).slice(1);
  for (const part of parts.slice(0, 20)) {
    const title = (part.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i) ||
      part.match(/<title>(.*?)<\/title>/i) || [,""])[1];
    const link = (part.match(/<link>(.*?)<\/link>/i) ||
      part.match(/<link[^>]*href=["']([^"']+)["']/i) || [,""])[1];
    const pubDate = (part.match(/<pubDate>(.*?)<\/pubDate>/i) ||
      part.match(/<published>(.*?)<\/published>/i) || [,""])[1];
    const source = (part.match(/<source[^>]*>(.*?)<\/source>/i) ||
      part.match(/<dc:creator[^>]*>(.*?)<\/dc:creator>/i) || [,""])[1];
    const desc = (part.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/i) ||
      part.match(/<description>(.*?)<\/description>/i) ||
      part.match(/<content:encoded><!\[CDATA\[(.*?)\]\]><\/content:encoded>/i) || [,""])[1];
    if (!title) continue;
    items.push({
      title: decodeXmlEntities(title.trim()),
      link: link.trim(),
      pubDate: pubDate.trim(),
      source: decodeXmlEntities((source || "").trim()) || "Wire",
      summary: decodeXmlEntities(
        desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400)
      ),
    });
  }
  return items;
}

function decodeXmlEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function looksBlocked(xml) {
  if (!xml || xml.length < 40) return true;
  const lower = xml.slice(0, 2000).toLowerCase();
  return (
    lower.includes("automated queries") ||
    lower.includes("/sorry/") ||
    (lower.includes("<html") && !lower.includes("<rss") && !lower.includes("<feed"))
  );
}

function rssHeaders() {
  return {
    "User-Agent": BROWSER_UA,
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
}

/**
 * Single RSS GET with browser-like headers + redirect follow.
 */
export async function fetchRssOnce(rssUrl, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("rss-timeout"), timeoutMs);
  let res;
  try {
    res = await fetch(rssUrl, {
      method: "GET",
      redirect: "follow",
      headers: rssHeaders(),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const xml = await res.text();
  const blocked = looksBlocked(xml);
  const hasItems = /<item[\s>]/i.test(xml) || /<entry[\s>]/i.test(xml);
  if (res.ok && !blocked && hasItems) {
    return { ok: true, status: res.status, xml, url: rssUrl };
  }
  return {
    ok: false,
    status: res.status || 503,
    xml,
    url: rssUrl,
    blocked,
  };
}

/**
 * Try primary Google URL (with one retry), then fallback publisher feeds.
 */
export async function fetchGoogleRss(primaryUrl, fallbackUrls = []) {
  const attempts = [primaryUrl, ...fallbackUrls];
  let last = { ok: false, status: 503, blocked: true };

  for (let i = 0; i < attempts.length; i++) {
    const url = attempts[i];
    try {
      last = await fetchRssOnce(url);
      if (last.ok) {
        return {
          ...last,
          viaGoogle: url === primaryUrl || url.startsWith("https://news.google.com/"),
          usedUrl: url,
        };
      }
    } catch (err) {
      last = {
        ok: false,
        status: 503,
        blocked: true,
        error: String(err && err.message ? err.message : err),
        url,
      };
    }
    // tiny backoff between Google retries only
    if (i === 0) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  return { ...last, viaGoogle: false, usedUrl: last.url };
}
