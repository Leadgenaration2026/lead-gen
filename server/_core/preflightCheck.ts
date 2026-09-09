import * as db from "../db";

export interface PreflightCheckItem {
  name: string;
  status: "pass" | "fail";
  message: string;
  autoFixable: boolean;
}

export interface PreflightResult {
  passed: boolean;
  checks: PreflightCheckItem[];
}

const UNSUBSTITUTED_TOKEN_REGEX = /\{\{\s*[\w.]+\s*\}\}/;

// Scoped to what's mechanically checkable today -- not the full spec's
// 20+ item list. Each check either genuinely blocks launch (a real defect)
// or is informational; "Fix Automatically" is only offered where a safe,
// unambiguous automatic fix actually exists (publishing an already-generated
// but unpublished landing page). Everything else blocks-and-explains rather
// than attempting a risky automatic content regeneration.
export async function runPreflightCheck(campaignId: number): Promise<PreflightResult> {
  const checks: PreflightCheckItem[] = [];
  const campaign = await db.getCampaignById(campaignId);

  if (!campaign) {
    return { passed: false, checks: [{ name: "Campaign exists", status: "fail", message: "Campaign not found", autoFixable: false }] };
  }

  // 1. Verified leads count > 0 -- re-checks current status rather than
  // trusting a stale snapshot, since campaigns.launch's own undeliverable
  // skip already relies on leads.emailVerificationStatus being current.
  const campaignLeads = await db.getCampaignLeads(campaignId);
  const leadRows = await Promise.all(campaignLeads.map((cl: any) => db.getLeadById(cl.leadId)));
  const sendableLeads = leadRows.filter((l: any) => l && l.emailVerificationStatus !== "undeliverable" && !l.unsubscribed);
  checks.push({
    name: "Verified leads",
    status: sendableLeads.length > 0 ? "pass" : "fail",
    message: sendableLeads.length > 0
      ? `${sendableLeads.length} lead(s) ready to send`
      : "No sendable leads on this campaign (all are unverified/undeliverable or unsubscribed)",
    autoFixable: false,
  });

  // 2. Landing page published
  if (campaign.landingPageId) {
    const page = await db.getLandingPageById(campaign.landingPageId);
    const published = page?.status === "published";
    checks.push({
      name: "Landing page published",
      status: published ? "pass" : "fail",
      message: published ? "Landing page is live" : "Landing page exists but hasn't been published yet",
      autoFixable: !published && !!page,
    });

    // 3. All 8 emails exist with non-empty subject/body
    const emails = await db.getLandingPageEmailsByLandingPageId(campaign.landingPageId);
    const missingOrEmpty = [1, 2, 3, 4, 5, 6, 7, 8].filter((seq) => {
      const e = emails.find((em: any) => em.sequenceNumber === seq);
      return !e || !e.subject?.trim() || !e.bodyHtml?.trim();
    });
    checks.push({
      name: "8-email sequence complete",
      status: missingOrEmpty.length === 0 ? "pass" : "fail",
      message: missingOrEmpty.length === 0
        ? "All 8 emails have a subject and body"
        : `Missing or empty content for email(s): ${missingOrEmpty.join(", ")}`,
      autoFixable: false,
    });

    // 4. No literal unsubstituted {{...}} tokens
    const tokenIssues: string[] = [];
    for (const e of emails) {
      if (UNSUBSTITUTED_TOKEN_REGEX.test(e.subject || "") || UNSUBSTITUTED_TOKEN_REGEX.test(e.bodyHtml || "")) {
        tokenIssues.push(`Email ${e.sequenceNumber}`);
      }
    }
    const sections = Array.isArray(page?.sections) ? page.sections : [];
    const sectionHasToken = sections.some((s: any) =>
      UNSUBSTITUTED_TOKEN_REGEX.test(s.headline || "") || UNSUBSTITUTED_TOKEN_REGEX.test(s.body || "") || UNSUBSTITUTED_TOKEN_REGEX.test(s.subheadline || "")
    );
    if (sectionHasToken) tokenIssues.push("Landing page sections");
    checks.push({
      name: "No broken personalization tokens",
      status: tokenIssues.length === 0 ? "pass" : "fail",
      message: tokenIssues.length === 0 ? "No unsubstituted {{...}} tokens found" : `Unsubstituted tokens found in: ${tokenIssues.join(", ")}`,
      autoFixable: false,
    });
  } else {
    checks.push({ name: "Landing page published", status: "pass", message: "This campaign has no landing page (classic single-email flow)", autoFixable: false });
  }

  // 5. Sender/SMTP configured -- same three fields campaigns.launch itself requires
  const settings = await db.getUserSettings(campaign.userId);
  const smtpConfigured = !!(settings?.smtpHost && settings?.smtpUsername && settings?.smtpPassword);
  checks.push({
    name: "Sender configured",
    status: smtpConfigured ? "pass" : "fail",
    message: smtpConfigured ? "SMTP sender is configured" : "SMTP host/username/password not fully configured in Settings",
    autoFixable: false,
  });

  return { passed: checks.every((c) => c.status === "pass"), checks };
}
