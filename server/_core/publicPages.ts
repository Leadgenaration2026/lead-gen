import type { Express, Request, Response } from "express";
import * as db from "../db";
import type { SectionContent, Theme } from "./campaignGenerator";
import { FONT_FAMILIES } from "./campaignGenerator";

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

// Applies the narrow **bold**/*italic* markdown-lite subset to an ALREADY
// escapeHtml()'d line -- order matters: escaping first guarantees the only
// tags this ever inserts are our own hardcoded <strong>/<em>, never anything
// derived from unescaped user/LLM text, so this can never smuggle in raw
// HTML even though the source text came from an LLM and (for manually
// edited sections) directly from a user, on a page served publicly.
function applyInlineRichText(escapedLine: string): string {
  return escapedLine
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

// Renders free-text as one <p> per blank-line-separated paragraph (and a
// <br> for a single newline within a paragraph) instead of the naive single
// <p> that used to collapse every line break into a space -- source of the
// "wall of text" bug reported live: a body string with one sentence per
// pain point read back as one unbroken paragraph. Superset of the old
// renderParagraphs: a line starting with "## " becomes a heading, a
// contiguous run of "- " lines becomes a proper bulleted list (same
// checkmark style the bullets field already uses), and **bold**/*italic*
// work inline -- the small markdown-lite subset RichTextField's toolbar
// (client/src/components/RichTextField.tsx) writes into the body textarea.
function renderRichText(text: string, paragraphStyle: string, theme: Theme): string {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length > 0 && lines.every((l) => l.startsWith("- "))) {
        return `<ul style="list-style:none;padding:0;margin:0 0 12px;display:grid;gap:10px;">${lines
          .map((l) => `<li style="${paragraphStyle}padding-left:24px;position:relative;"><span style="position:absolute;left:0;color:${theme.accent};">&#10003;</span>${applyInlineRichText(escapeHtml(l.slice(2)))}</li>`)
          .join("")}</ul>`;
      }
      if (lines.length === 1 && lines[0].startsWith("## ")) {
        return `<h3 style="font-size:20px;font-weight:700;color:${theme.text};margin:0 0 8px;">${applyInlineRichText(escapeHtml(lines[0].slice(3)))}</h3>`;
      }
      return `<p style="${paragraphStyle}">${lines.map((l) => applyInlineRichText(escapeHtml(l))).join("<br>")}</p>`;
    })
    .join("");
}

// Shared final composition step (background/background-image/padding/
// content-wrapping) -- extracted so the generic field-driven path and the
// new block-type branches below don't each duplicate this logic.
function wrapSection(section: SectionContent, theme: Theme, inner: string, opts?: { cardWrap?: boolean }): string {
  const isHero = section.type === "hero";
  const isFooter = section.type === "footer";
  const hasBackgroundImage = !!section.backgroundImageUrl;
  const background = hasBackgroundImage
    ? "transparent"
    : section.backgroundColor
      ? section.backgroundColor
      : isHero ? theme.primary : "transparent";
  const padding = isFooter ? "32px 24px" : "64px 24px";

  const cardStyle = opts?.cardWrap
    ? `border:1px solid rgba(0,0,0,0.08);border-radius:16px;padding:40px;box-shadow:0 2px 12px rgba(0,0,0,0.06);background:${theme.background};`
    : "";
  const content = hasBackgroundImage
    // A background image needs to work regardless of section type or theme
    // -- rather than branching light/dark text per type, the content sits
    // in a translucent card over the full-bleed image so it stays legible
    // either way.
    ? `<div style="background:${theme.background};opacity:0.94;border-radius:16px;padding:32px;max-width:960px;margin:0 auto;">${inner}</div>`
    : cardStyle
      ? `<div style="max-width:960px;margin:0 auto;"><div style="${cardStyle}">${inner}</div></div>`
      : `<div style="max-width:960px;margin:0 auto;">${inner}</div>`;

  const sectionStyle = hasBackgroundImage
    ? `background-image:url('${escapeHtml(section.backgroundImageUrl!).replace(/'/g, "%27")}');background-size:cover;background-position:center;padding:${padding};`
    : `background:${background};padding:${padding};`;

  return `<section style="${sectionStyle}">${content}</section>`;
}

// Small fixed set of hand-written brand icon glyphs (white, 18x18 viewBox)
// for the "social-icons" section type -- public pages are server-rendered
// raw HTML with no icon library available, unlike the React editor UI.
const SOCIAL_ICON_SVG: Record<string, string> = {
  facebook: `<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.77-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.87h2.78l-.44 2.91h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94Z"/></svg>`,
  twitter: `<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M18.9 2h3.3l-7.2 8.24L23.5 22h-6.6l-5.2-6.8L5.7 22H2.4l7.7-8.8L1.5 2h6.8l4.7 6.2L18.9 2Zm-1.2 18h1.8L7.4 3.9H5.5L17.7 20Z"/></svg>`,
  linkedin: `<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-1 1.83-2 3.77-2 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.65c0-1.35-.02-3.08-1.88-3.08-1.88 0-2.17 1.47-2.17 2.98V21h-4V9Z"/></svg>`,
  instagram: `<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M12 2c2.7 0 3.06.01 4.12.06 1.06.05 1.79.22 2.43.47.66.26 1.22.6 1.77 1.15.55.55.9 1.11 1.15 1.77.25.64.42 1.37.47 2.43.05 1.06.06 1.42.06 4.12s-.01 3.06-.06 4.12c-.05 1.06-.22 1.79-.47 2.43a4.9 4.9 0 0 1-1.15 1.77 4.9 4.9 0 0 1-1.77 1.15c-.64.25-1.37.42-2.43.47-1.06.05-1.42.06-4.12.06s-3.06-.01-4.12-.06c-1.06-.05-1.79-.22-2.43-.47a4.9 4.9 0 0 1-1.77-1.15 4.9 4.9 0 0 1-1.15-1.77c-.25-.64-.42-1.37-.47-2.43C2.01 15.06 2 14.7 2 12s.01-3.06.06-4.12c.05-1.06.22-1.79.47-2.43.26-.66.6-1.22 1.15-1.77A4.9 4.9 0 0 1 5.45.53C6.09.28 6.82.11 7.88.06 8.94.01 9.3 0 12 0Zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4Zm5.2-8.4a1.17 1.17 0 1 1-2.34 0 1.17 1.17 0 0 1 2.34 0Z"/></svg>`,
  youtube: `<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M23.5 6.2a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.56A3.02 3.02 0 0 0 .5 6.2 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.8 3.02 3.02 0 0 0 2.12 2.14C4.5 20.5 12 20.5 12 20.5s7.5 0 9.38-.56a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z"/></svg>`,
  tiktok: `<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M16.5 2h-3.3v13.9a2.7 2.7 0 1 1-1.9-2.58v-3.4a6.1 6.1 0 1 0 5.2 6.03V9.1a7.4 7.4 0 0 0 4.2 1.3V7.1a4.1 4.1 0 0 1-4.2-4.1V2Z"/></svg>`,
  default: `<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><circle cx="12" cy="12" r="9"/></svg>`,
};

function renderSection(section: SectionContent, theme: Theme): string {
  const headline = section.headline ? `<h2 style="font-size:32px;font-weight:700;color:${theme.text};margin:0 0 12px;">${escapeHtml(section.headline)}</h2>` : "";
  const subheadline = section.subheadline ? `<p style="font-size:18px;color:${theme.text};opacity:0.75;margin:0 0 20px;">${escapeHtml(section.subheadline)}</p>` : "";

  if (section.type === "two-column" && section.columns?.length) {
    const gap = { sm: 16, md: 32, lg: 56 }[section.columnGap || "md"];
    const cols = section.columns
      .map((c) => {
        const colHeadline = c.headline ? `<h3 style="font-size:20px;font-weight:700;color:${theme.text};margin:0 0 8px;">${escapeHtml(c.headline)}</h3>` : "";
        const colBody = c.body ? renderRichText(c.body, `font-size:15px;line-height:1.6;color:${theme.text};margin:0 0 8px;`, theme) : "";
        const colImage = c.imageUrl ? `<img src="${escapeHtml(c.imageUrl)}" alt="" style="max-width:100%;border-radius:12px;margin-top:8px;" />` : "";
        return `<div style="flex:1 1 280px;">${colHeadline}${colBody}${colImage}</div>`;
      })
      .join("");
    const inner = `${headline}${subheadline}<div style="display:flex;flex-wrap:wrap;gap:${gap}px;">${cols}</div>`;
    return wrapSection(section, theme, inner);
  }

  if (section.type === "social-icons") {
    const icons = (section.socialLinks || [])
      .filter((s) => s.url && s.url.trim())
      .map((s) => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;background:${theme.accent};margin:0 8px;">${SOCIAL_ICON_SVG[s.platform] || SOCIAL_ICON_SVG.default}</a>`)
      .join("");
    const inner = `${headline}${subheadline}<div style="text-align:center;">${icons}</div>`;
    return wrapSection(section, theme, inner);
  }

  if (section.type === "image-block" && section.imageUrl) {
    const caption = section.headline ? `<p style="text-align:center;font-size:14px;color:${theme.text};opacity:0.7;margin-top:10px;">${escapeHtml(section.headline)}</p>` : "";
    const inner = `<img src="${escapeHtml(section.imageUrl)}" alt="" style="max-width:100%;border-radius:12px;display:block;margin:0 auto;" />${caption}`;
    return wrapSection(section, theme, inner);
  }

  if (section.type === "video-block" && section.videoUrl) {
    const embedUrl = toEmbedUrl(section.videoUrl);
    if (embedUrl) {
      const caption = section.headline ? `<p style="text-align:center;font-size:14px;color:${theme.text};opacity:0.7;margin-top:10px;">${escapeHtml(section.headline)}</p>` : "";
      const inner = `<div style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;"><iframe src="${escapeHtml(embedUrl)}" title="Video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;"></iframe></div>${caption}`;
      return wrapSection(section, theme, inner);
    }
  }

  const body = section.body ? renderRichText(section.body, `font-size:16px;line-height:1.6;color:${theme.text};max-width:720px;margin:0 0 12px;`, theme) : "";
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
  const innerHeadline = isHero && section.headline
    ? `<h1 style="font-size:40px;font-weight:800;color:#fff;margin:0 0 12px;max-width:800px;">${escapeHtml(section.headline)}</h1>`
    : headline;
  const innerSub = isHero && section.subheadline
    ? `<p style="font-size:19px;color:#fff;opacity:0.9;margin:0 0 24px;max-width:640px;">${escapeHtml(section.subheadline)}</p>`
    : subheadline;

  const inner = `${innerHeadline}${innerSub}${body}${bullets}${faqs}${video}${image}${cta}`;

  return wrapSection(section, theme, inner, { cardWrap: section.type === "single-box" });
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
    ? `<img src="${escapeHtml(page.logoUrl)}" alt="${escapeHtml(page.companyName || page.name)}" style="max-height:48px;max-width:220px;width:auto;height:auto;object-fit:contain;display:block;" />`
    : `<span style="font-weight:700;font-size:18px;color:${theme.primary};">${escapeHtml(page.companyName || page.name)}</span>`;

  const fontConfig = FONT_FAMILIES[theme.fontFamily || "system"] || FONT_FAMILIES.system;
  const fontLink = fontConfig.googleFontParam
    ? `<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${fontConfig.googleFontParam}&display=swap" />`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(page.name)}</title>
${fontLink}
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ${fontConfig.cssFamily}, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; background: ${theme.background}; color: ${theme.text}; }
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
<div style="text-align:center;padding:16px;font-size:12px;opacity:0.6;">
  <a href="/p/${escapeHtml(page.slug || "")}/unsubscribe" style="color:${theme.text};text-decoration:underline;">Unsubscribe from future emails</a>
</div>
</body>
</html>`;
}

function renderUnsubscribeFormHtml(page: any): string {
  const theme: Theme = page.theme;
  return `<!DOCTYPE html><html><head><title>Unsubscribe</title><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f9fafb;}div{text-align:center;padding:40px;background:white;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);max-width:400px;width:90%;}h1{color:#111;font-size:22px;margin:0 0 8px;}p{color:#666;font-size:14px;margin:0 0 20px;}input{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:12px;}button{width:100%;padding:10px 12px;border:none;border-radius:8px;font-size:14px;font-weight:600;color:#fff;cursor:pointer;background:${theme.cta};}</style></head><body><div><h1>Unsubscribe</h1><p>Enter your email to stop receiving future emails from ${escapeHtml(page.companyName || page.name)}.</p><form method="POST" action="/p/${escapeHtml(page.slug || "")}/unsubscribe"><input type="email" name="email" placeholder="you@example.com" required /><button type="submit">Unsubscribe</button></form></div></body></html>`;
}

function renderUnsubscribeConfirmedHtml(): string {
  return `<!DOCTYPE html><html><head><title>Unsubscribed</title><meta charset="utf-8" /></head><body style="font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f9fafb;"><div style="text-align:center;padding:40px;background:white;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);max-width:400px;"><h1 style="color:#111;font-size:24px;">&#9989; Unsubscribed</h1><p style="color:#666;font-size:16px;">You have been successfully unsubscribed from future emails. We're sorry to see you go.</p></div></body></html>`;
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

  // A shared static page has no per-visitor token the way a sent email
  // does, so the footer's unsubscribe link (renderLandingPageHtml above)
  // leads here instead of straight to /api/track/unsubscribe/:token --
  // the visitor types the email address they want stopped, scoped to this
  // page's own owner (db.markLeadsUnsubscribedByEmail).
  app.get("/p/:slug/unsubscribe", async (req: Request, res: Response) => {
    try {
      const page = await db.getLandingPageBySlug(req.params.slug);
      res.setHeader("Content-Type", "text/html");
      if (!page) {
        res.status(404).send(renderNotFoundHtml());
        return;
      }
      res.send(renderUnsubscribeFormHtml(page));
    } catch (error) {
      console.error("[publicPages] Failed to render unsubscribe form:", error);
      res.status(500).setHeader("Content-Type", "text/html");
      res.send(renderNotFoundHtml());
    }
  });

  app.post("/p/:slug/unsubscribe", async (req: Request, res: Response) => {
    try {
      const page = await db.getLandingPageBySlug(req.params.slug);
      res.setHeader("Content-Type", "text/html");
      const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
      if (page && email) {
        await db.markLeadsUnsubscribedByEmail(page.userId, email);
      }
      res.send(renderUnsubscribeConfirmedHtml());
    } catch (error) {
      console.error("[publicPages] Failed to process unsubscribe:", error);
      res.setHeader("Content-Type", "text/html");
      res.send(renderUnsubscribeConfirmedHtml());
    }
  });
}
