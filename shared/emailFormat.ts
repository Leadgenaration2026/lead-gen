/**
 * Convert plain text email body to HTML for sending.
 * Handles:
 * - Line breaks → <p> or <br/>
 * - Bullet points (•) → proper styled list with emoji icons
 * - **bold** markers → <strong> tags
 * - CTA link formatting with button styling
 * - Preserves existing HTML (no-op if already HTML)
 */
export function plainTextToHtml(text: string): string {
  // If already HTML, return as-is
  if (text.includes("<p>") || text.includes("<div>") || text.includes("<ul>")) {
    return text;
  }

  const lines = text.split("\n");
  const result: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("•")) {
      // Start a list if not already in one
      if (!inList) {
        result.push('<ul style="list-style:none;padding-left:0;margin:12px 0;">');
        inList = true;
      }
      let content = trimmed.slice(1).trim();
      // Convert **bold** markers to <strong>
      content = convertBoldMarkers(content);
      result.push(`<li style="margin-bottom:8px;padding-left:8px;font-size:15px;line-height:1.5;">${content}</li>`);
    } else {
      // Close list if we were in one
      if (inList) {
        result.push("</ul>");
        inList = false;
      }

      if (trimmed === "") {
        result.push("<br/>");
      } else if (trimmed.startsWith("👉")) {
        // CTA intro line - style it prominently
        let content = convertBoldMarkers(trimmed);
        result.push(`<p style="margin:16px 0 8px 0;font-size:15px;font-weight:600;color:#1a1a1a;">${content}</p>`);
      } else if (trimmed.startsWith("🗓️") && (trimmed.includes("http") || trimmed.includes("{{ctaLink}}"))) {
        // CTA booking link line - make it a styled button
        const linkMatch = trimmed.match(/(https?:\/\/[^\s]+|{{ctaLink}})/);
        const linkUrl = linkMatch ? linkMatch[1] : "#";
        const labelText = trimmed.replace(/(https?:\/\/[^\s]+|{{ctaLink}})/, "").replace("🗓️", "").replace(":", "").trim();
        result.push(`<p style="margin:8px 0 16px 0;">
          <a href="${linkUrl}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">🗓️ ${labelText || "30 Min Free Consultation"}</a>
        </p>`);
      } else {
        let content = convertBoldMarkers(trimmed);
        result.push(`<p style="margin:0 0 8px 0;font-size:15px;line-height:1.5;color:#333333;">${content}</p>`);
      }
    }
  }

  // Close any open list
  if (inList) {
    result.push("</ul>");
  }

  return result.join("");
}

/**
 * Convert **bold** markers to <strong> HTML tags
 */
function convertBoldMarkers(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#1a1a1a;">$1</strong>');
}
