/**
 * Convert plain text email body to HTML for sending.
 * Handles:
 * - Line breaks → <p> or <br/>
 * - Bullet points (•) → proper <ul><li> list
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
        result.push('<ul style="list-style:none;padding-left:0;margin:8px 0;">');
        inList = true;
      }
      const content = trimmed.slice(1).trim();
      result.push(`<li style="margin-bottom:6px;padding-left:16px;position:relative;"><span style="position:absolute;left:0;">•</span>${content}</li>`);
    } else {
      // Close list if we were in one
      if (inList) {
        result.push("</ul>");
        inList = false;
      }

      if (trimmed === "") {
        result.push("<br/>");
      } else {
        result.push(`<p style="margin:0 0 8px 0;">${line}</p>`);
      }
    }
  }

  // Close any open list
  if (inList) {
    result.push("</ul>");
  }

  return result.join("");
}
