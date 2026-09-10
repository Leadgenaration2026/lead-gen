import type { Express, Request, Response } from "express";
import * as db from "../db";
import type { SectionContent, Theme } from "./campaignGenerator";

// Same base-URL resolution followUpScheduler.ts already uses for tracking
// links -- kept consistent so a landing page's public URL and its emails'
// tracking links point at the same deployed domain.
export function buildPublicLandingPageUrl(slug: string): string {
  const baseUrl = process.env.SITE_URL || `https://${process.env.DOMAIN || 'leadgenoutreach-gkqazghm.manus.space'}`;
  return `${baseUrl}/p/${slug}`;
}

function escapeHtml(text: string): string {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Converts a YouTube/Vimeo watch link (or an already-embeddable URL) into an
// embed URL for an <iframe>. Returns null for anything else -- callers
// should fall back to not rendering rather than embedding an arbitrary URL.
function toEmbedUrl(videoUrl: string): string | null {
  try {
    const url = new URL(videoUrl);
    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (url.pathname.startsWith("/embed/")) return videoUrl;
    }
    if (url.hostname === "youtu.be") {
      const id = url.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (url.hostname.includes("vimeo.com")) {
      if (url.pathname.startsWith("/video/")) return `https://player.vimeo.com${url.pathname}`;
      const id = url.pathname.replace(/^\//, "");
      if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    return null;
  } catch {
    return null;
  }
}

function renderSection(section: SectionContent, theme: Theme): string {
  const headline = section.headline ? `<h2 style="font-size:32px;font-weight:700;color:${theme.text};margin:0 0 12px;">${escapeHtml(section.headline)}</h2>` : "";
  const subheadline = section.subheadline ? `<p style="font-size:18px;color:${theme.text};opacity:0.75;margin:0 0 20px;">${escapeHtml(section.subheadline)}</p>` : "";
  const body = section.body ? `<p style="font-size:16px;line-height:1.6;color:${theme.text};max-width:720px;">${escapeHtml(section.body)}</p>` : "";
  const bullets = section.bullets?.length
    ? `<ul style="list-style:none;padding:0;margin:20px 0;display:grid;gap:14px;">${section.bullets.map((b) => `<li style="font-size:16px;color:${theme.text};padding-left:28px;position:relative;"><span style="position:absolute;left:0;color:${theme.accent};">&#10003;</span>${escapeHtml(b)}</li>`).join("")}</ul>`
    : "";
  const faqs = section.faqs?.length
    ? `<div style="display:grid;gap:16px;max-width:720px;">${section.faqs.map((f) => `<div><p style="font-weight:600;color:${theme.text};margin:0 0 4px;">${escapeHtml(f.question)}</p><p style="color:${theme.text};opacity:0.8;margin:0;">${escapeHtml(f.answer)}</p></div>`).join("")}</div>`
    : "";
  const cta = section.ctaText
    ? `<a href="#contact" style="display:inline-block;margin-top:20px;padding:14px 32px;background:${theme.cta};color:#fff;border-radius:8px;font-weight:600;text-decoration:none;font-size:16px;">${escapeHtml(section.ctaText)}</a>`
    : "";
  const embedUrl = section.videoUrl ? toEmbedUrl(section.videoUrl) : null;
  const video = embedUrl
    ? `<div style="position:relative;padding-top:56.25%;max-width:720px;margin-top:20px;border-radius:12px;overflow:hidden;"><iframe src="${escapeHtml(embedUrl)}" title="Video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;"></iframe></div>`
    : "";
  // A video takes priority over a static image in the same section -- both
  // filled in would mean the image is stale from before a video was added.
  const image = !video && section.imageUrl ? `<img src="${escapeHtml(section.imageUrl)}" alt="" style="max-width:100%;border-radius:12px;margin-top:20px;" />` : "";

  const isHero = section.type === "hero";
  const isFooter = section.type === "footer";
  const background = isHero ? theme.primary : "transparent";
  const padding = isFooter ? "32px 24px" : "64px 24px";

  const innerHeadline = isHero && section.headline
    ? `<h1 style="font-size:40px;font-weight:800;color:#fff;margin:0 0 12px;max-width:800px;">${escapeHtml(section.headline)}</h1>`
    : headline;
  const innerSub = isHero && section.subheadline
    ? `<p style="font-size:19px;color:#fff;opacity:0.9;margin:0 0 24px;max-width:640px;">${escapeHtml(section.subheadline)}</p>`
    : subheadline;

  return `<section style="background:${background};padding:${padding};"><div style="max-width:960px;margin:0 auto;">${innerHeadline}${innerSub}${body}${bullets}${faqs}${video}${image}${cta}</div></section>`;
}

// Server-renders a landingPages row's sections+theme JSON into a complete,
// static HTML page -- no client JS framework needed since this is read-only
// public content. Shared by the public /p/:slug route and the
// landingPages.previewHtml tRPC procedure, so there's exactly one rendering
// implementation for both the published page and the editor's live preview.
export function renderLandingPageHtml(page: any): string {
  const theme: Theme = page.theme;
  const sections: SectionContent[] = Array.isArray(page.sections) ? page.sections : [];
  const logo = page.logoUrl
    ? `<img src="${escapeHtml(page.logoUrl)}" alt="${escapeHtml(page.companyName || page.name)}" style="max-height:36px;" />`
    : `<span style="font-weight:700;font-size:18px;color:${theme.primary};">${escapeHtml(page.companyName || page.name)}</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(page.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; background: ${theme.background}; color: ${theme.text}; }
  @media (max-width: 640px) {
    section { padding: 40px 20px !important; }
    h1 { font-size: 28px !important; }
    h2 { font-size: 24px !important; }
  }
</style>
</head>
<body>
<header style="padding:20px 24px;border-bottom:1px solid rgba(0,0,0,0.06);">${logo}</header>
${sections.map((s) => renderSection(s, theme)).join("")}
</body>
</html>`;
}

function renderNotFoundHtml(): string {
  return `<!DOCTYPE html><html><head><title>Page not found</title><style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f9fafb;}div{text-align:center;padding:40px;background:white;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);max-width:400px;}h1{color:#111;font-size:22px;}p{color:#666;font-size:15px;}</style></head><body><div><h1>Page not found</h1><p>This link isn't available.</p></div></body></html>`;
}

// Public, unauthenticated landing-page hosting at /p/:slug -- mirrors the
// existing unsubscribe page (server/_core/emailTracking.ts) exactly: a plain
// Express route that sends raw HTML, registered in server/_core/index.ts
// alongside the other register*Routes(app) calls, before the tRPC mount and
// the Vite/SPA catch-all so it takes precedence.
export function registerPublicPageRoutes(app: Express) {
  app.get("/p/:slug", async (req: Request, res: Response) => {
    try {
      const page = await db.getLandingPageBySlug(req.params.slug);
      res.setHeader("Content-Type", "text/html");
      if (!page || page.status !== "published") {
        res.status(404).send(renderNotFoundHtml());
        return;
      }
      res.send(renderLandingPageHtml(page));
    } catch (error) {
      console.error("[publicPages] Failed to render landing page:", error);
      res.status(500).setHeader("Content-Type", "text/html");
      res.send(renderNotFoundHtml());
    }
  });
}
