// Shared {{variable}} substitution for outbound email content. The existing
// send call sites (server/routers.ts, server/_core/index.ts,
// server/_core/followUpScheduler.ts) each duplicate their own inline
// `.replace(/{{x}}/g, ...)` chain supporting {{companyName}}/{{ownerName}}/
// {{email}}/{{industry}}/{{phoneNumber}}/{{bookingUrl}}/{{ctaLink}} -- this
// keeps those exact names working (superset, not a breaking rename) while
// adding {{first_name}}/{{last_name}}/{{company}}/{{job_title}} for the new
// landing-page campaign generator. Only wired into the new call sites for
// now (scheduleCampaignEmailsFromSequence, landingPageEmails rendering) --
// consolidating the 6 existing inline chains onto this is a separate,
// lower-risk cleanup left for later.

export interface PersonalizationLead {
  companyName?: string | null;
  ownerName?: string | null;
  email?: string | null;
  industry?: string | null;
  phoneNumber?: string | null;
  jobTitle?: string | null;
}

export interface PersonalizationLinks {
  ctaLink?: string;
  bookingUrl?: string;
}

export function substituteVariables(text: string, lead: PersonalizationLead, links: PersonalizationLinks = {}): string {
  const ownerName = lead.ownerName || "";
  const spaceIndex = ownerName.indexOf(" ");
  const firstName = spaceIndex === -1 ? ownerName : ownerName.slice(0, spaceIndex);
  const lastName = spaceIndex === -1 ? "" : ownerName.slice(spaceIndex + 1).trim();
  const ctaLink = links.ctaLink || links.bookingUrl || "";

  const replacements: Record<string, string> = {
    companyName: lead.companyName || "",
    company: lead.companyName || "",
    ownerName: ownerName,
    first_name: firstName || "there",
    last_name: lastName,
    email: lead.email || "",
    industry: lead.industry || "your industry",
    job_title: lead.jobTitle || "",
    phoneNumber: lead.phoneNumber || "",
    bookingUrl: ctaLink,
    ctaLink: ctaLink,
  };

  return text.replace(/{{\s*([a-zA-Z_]+)\s*}}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(replacements, key) ? replacements[key] : match;
  });
}
