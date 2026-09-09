import { plainTextToHtml } from "@shared/emailFormat";

export interface BrandedEmailBodyInput {
  bodyText: string; // plain text (may contain •, **bold**, blank-line paragraphs -- same shape plainTextToHtml already handles)
  logoUrl?: string | null;
  companyName?: string | null;
  primaryColor: string;
  ctaColor: string;
  ctaText?: string | null;
  ctaUrl?: string | null;
}

// Renders a branded HTML FRAGMENT (a header bar with the logo/company name in
// the campaign's primary color, the body content, and a styled CTA button in
// the campaign's CTA color) -- deliberately a fragment, not a full document.
// The existing send pipeline (processScheduledFollowUpEmails in
// followUpScheduler.ts) unconditionally appends its own signature/tracking
// pixel/unsubscribe footer after whatever is in followUpEmails.emailBody,
// and plainTextToHtml() already no-ops on any body containing <p>/<div>/<ul>
// -- so returning a fragment here (not a <!DOCTYPE>/<html>/<body> document)
// lets this slot into that exact same composition unchanged, instead of
// nesting one HTML document inside another.
export function buildBrandedEmailBody(input: BrandedEmailBodyInput): string {
  const { bodyText, logoUrl, companyName, primaryColor, ctaColor, ctaText, ctaUrl } = input;
  const innerHtml = plainTextToHtml(bodyText);

  const header = logoUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;"><tr><td style="padding:12px 0;border-bottom:3px solid ${primaryColor};"><img src="${logoUrl}" alt="${companyName || ""}" style="max-height:40px;max-width:200px;display:block;" /></td></tr></table>`
    : companyName
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;"><tr><td style="padding:12px 0;border-bottom:3px solid ${primaryColor};font-size:16px;font-weight:700;color:${primaryColor};">${companyName}</td></tr></table>`
      : "";

  const ctaButton = ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td style="border-radius:6px;background-color:${ctaColor};"><a href="${ctaUrl}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${ctaText || "Get Started"}</a></td></tr></table>`
    : "";

  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;">${header}${innerHtml}${ctaButton}</div>`;
}

// Wraps a branded fragment in a complete, standalone, email-client-safe HTML
// document -- used only for the "HTML"/"Copy HTML" view in the editor UI
// (landingPageEmails.renderHtml), never for what actually gets sent (that
// stays a fragment, see above). Table-based 600px-centered layout with MSO
// conditional comments for Outlook's rendering quirks.
export function wrapAsHtmlDocument(title: string, bodyFragmentHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<!--[if mso]>
<style type="text/css">table {border-collapse:collapse;} .fallback-font {font-family:Arial,sans-serif;}</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;">
<!--[if mso]>
<table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0"><tr><td>
<![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
<tr><td style="padding:24px;">
${bodyFragmentHtml}
</td></tr>
</table>
<!--[if mso]>
</td></tr></table>
<![endif]-->
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
