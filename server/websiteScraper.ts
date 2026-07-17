import * as cheerio from "cheerio";

export interface ScrapedWebsiteContent {
  text: string;
  pagesScraped: string[];
  error?: string;
}

const FETCH_TIMEOUT_MS = 8000;
const MAX_TEXT_LENGTH = 6000; // keep prompt size reasonable

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadGenBot/1.0; +https://leadgenoutreach.com/bot)" },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractVisibleText($: cheerio.CheerioAPI): string {
  $("script, style, noscript, svg, nav, footer, header, iframe, [aria-hidden='true']").remove();
  const text = $("body").text();
  return text.replace(/\s+/g, " ").trim();
}

// Looks for a same-site link whose href contains one of the given keywords
// (e.g. "about", "service") -- used to pull in one extra page of real content
// beyond the homepage without following an unbounded crawl.
function findInternalLink($: cheerio.CheerioAPI, baseUrl: string, keywords: string[]): string | null {
  const base = new URL(baseUrl);
  let found: string | null = null;
  $("a[href]").each((_, el) => {
    if (found) return;
    const href = $(el).attr("href") || "";
    const lower = href.toLowerCase();
    if (!keywords.some((k) => lower.includes(k))) return;
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.hostname !== base.hostname) return; // stay on the same site
      found = resolved.toString();
    } catch {
      // ignore unparseable hrefs (mailto:, javascript:, etc.)
    }
  });
  return found;
}

/**
 * Fetches real, current text content from a lead's website (homepage plus,
 * if discoverable, one About/Services page) for grounding pain-point and
 * personalization analysis in what the company actually says about itself,
 * instead of an LLM's general knowledge/guesswork about the domain name.
 */
export async function scrapeWebsiteContent(rawUrl: string): Promise<ScrapedWebsiteContent> {
  let url = rawUrl.trim();
  if (!url) return { text: "", pagesScraped: [], error: "No website provided" };
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  const homeHtml = await fetchHtml(url);
  if (!homeHtml) {
    return { text: "", pagesScraped: [], error: `Could not reach ${url}` };
  }

  const $ = cheerio.load(homeHtml);
  const pagesScraped = [url];
  let text = extractVisibleText($);

  const secondUrl =
    findInternalLink($, url, ["about"]) ||
    findInternalLink($, url, ["service", "solutions", "what-we-do"]);

  if (secondUrl && secondUrl !== url) {
    const secondHtml = await fetchHtml(secondUrl);
    if (secondHtml) {
      const $2 = cheerio.load(secondHtml);
      text += "\n\n" + extractVisibleText($2);
      pagesScraped.push(secondUrl);
    }
  }

  text = text.slice(0, MAX_TEXT_LENGTH);
  if (!text) {
    return { text: "", pagesScraped, error: "Page had no readable text content" };
  }
  return { text, pagesScraped };
}
