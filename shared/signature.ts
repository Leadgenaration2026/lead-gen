/**
 * Nitin Sharma's email signature - used across all email generation
 * Website and LinkedIn are clickable links
 */

// Plain text version for email body (same font as email)
export const NITIN_SIGNATURE_PLAIN = `
Let me know if you have any questions or concerns.

Thank you

Nitin Sharma
Founder, Director & CEO
Virtual Assistant Group
PH # 1-877-263-6150
Email: nitin@virtualassistant-group.com
Website: www.virtualassistant-group.com
Linkedin: https://www.linkedin.com/in/nitin-sharma-955145252/`;

// HTML version with clickable links for website and LinkedIn
export const NITIN_SIGNATURE_HTML = `
<br/><br/>
<p style="margin:0;font-family:inherit;font-size:inherit;">Let me know if you have any questions or concerns.</p>
<p style="margin:8px 0 0;font-family:inherit;font-size:inherit;">Thank you</p>
<br/>
<p style="margin:0;font-family:inherit;font-size:inherit;font-weight:600;">Nitin Sharma</p>
<p style="margin:2px 0;font-family:inherit;font-size:inherit;">Founder, Director &amp; CEO</p>
<p style="margin:2px 0;font-family:inherit;font-size:inherit;">Virtual Assistant Group</p>
<p style="margin:2px 0;font-family:inherit;font-size:inherit;">PH # 1-877-263-6150</p>
<p style="margin:2px 0;font-family:inherit;font-size:inherit;">Email: nitin@virtualassistant-group.com</p>
<p style="margin:2px 0;font-family:inherit;font-size:inherit;">Website: <a href="https://www.virtualassistant-group.com" style="color:#2563eb;text-decoration:underline;" target="_blank">www.virtualassistant-group.com</a></p>
<p style="margin:2px 0;font-family:inherit;font-size:inherit;">Linkedin: <a href="https://www.linkedin.com/in/nitin-sharma-955145252/" style="color:#2563eb;text-decoration:underline;" target="_blank">https://www.linkedin.com/in/nitin-sharma-955145252/</a></p>
`;

// Unsubscribe placeholder for plain text emails
export const UNSUBSCRIBE_PLACEHOLDER_PLAIN = `\n\n---\nIf you no longer wish to receive emails from us, click here to unsubscribe: {{UNSUBSCRIBE_LINK}}`;

// Generate clickable unsubscribe link HTML
export function getUnsubscribeLinkHtml(baseUrl: string, token: string): string {
  const unsubscribeUrl = `${baseUrl}/api/track/unsubscribe/${token}`;
  return `
<br/><hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/>
<p style="margin:0;font-family:inherit;font-size:12px;color:#6b7280;">
  If you no longer wish to receive emails from us, <a href="${unsubscribeUrl}" style="color:#2563eb;text-decoration:underline;">click here to unsubscribe</a>.
</p>`;
}
