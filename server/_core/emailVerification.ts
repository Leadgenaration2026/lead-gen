import * as db from "../db";

export type NormalizedVerificationStatus = "valid" | "invalid" | "catch_all" | "role_based" | "disposable" | "unknown";

export interface VerificationResult {
  email: string;
  status: NormalizedVerificationStatus;
  provider: "in_house";
  score?: number;
  reason?: string;
  raw?: any;
}

export interface VerificationProvider {
  name: string;
  verifyBatch(emails: string[], onProgress?: (done: number, total: number) => void): Promise<VerificationResult[]>;
}

// Local-part prefixes commonly used for shared/departmental mailboxes rather
// than a real individual -- these are still often legitimately deliverable,
// just a worse cold-outreach target (nobody personally reads "info@").
const ROLE_BASED_LOCAL_PARTS = new Set([
  "info", "admin", "support", "sales", "contact", "help", "hello", "team",
  "billing", "noreply", "no-reply", "webmaster", "postmaster", "hr",
  "careers", "jobs", "office", "abuse", "marketing", "accounts", "enquiries",
  "inquiries", "service", "media", "press", "feedback",
]);

function isRoleBasedEmail(email: string): boolean {
  const localPart = email.split("@")[0]?.toLowerCase().trim();
  return !!localPart && ROLE_BASED_LOCAL_PARTS.has(localPart);
}

// The only provider -- no API key, no external dependency. Built on the
// existing format+MX/DNS+disposable-domain checker in
// server/emailValidation.ts, with role-based detection added on top.
// Deliberately does NOT attempt real SMTP mailbox probing (the RCPT TO
// handshake paid verification providers use) -- most cloud hosts block
// outbound port 25 entirely, and probing from the same IP that sends real
// campaigns risks that IP's own sender reputation. Consequently this
// provider can never produce "catch_all" (that requires probing a fake
// address at the domain) -- a disclosed limitation, not a bug. A prior
// version of this file optionally cross-checked results through Bouncer
// (a paid API) when the user had a key configured; that integration has
// been removed at the user's request in favor of this in-house-only engine.
export class InHouseVerificationProvider implements VerificationProvider {
  name = "in_house" as const;

  async verifyBatch(emails: string[]): Promise<VerificationResult[]> {
    const { validateEmails } = await import("../emailValidation");
    const results = await validateEmails(emails);
    return results.map((r): VerificationResult => {
      if (!r.valid) {
        const status: NormalizedVerificationStatus = r.reason?.toLowerCase().includes("disposable") ? "disposable" : "invalid";
        return { email: r.email, status, provider: "in_house", reason: r.reason };
      }
      if (isRoleBasedEmail(r.email)) {
        return { email: r.email, status: "role_based", provider: "in_house", reason: "Role-based address (e.g. info@, support@)" };
      }
      return { email: r.email, status: "valid", provider: "in_house", reason: "Valid format, domain has a mail server, not a known disposable/role address" };
    });
  }
}

export interface VerificationResultWithDecision extends VerificationResult {
  shouldSend: boolean;
}

function computeShouldSend(status: NormalizedVerificationStatus): boolean {
  // Matches the existing default safety rules: never auto-send
  // invalid/disposable; catch-all/unknown/role-based are eligible but
  // flagged for the user to decide, valid is the only unconditional yes.
  return status === "valid" || status === "catch_all" || status === "unknown" || status === "role_based";
}

export async function verifyEmailsInHouse(
  emails: string[],
  onProgress?: (done: number, total: number) => void
): Promise<VerificationResultWithDecision[]> {
  const inHouse = new InHouseVerificationProvider();
  const results = await inHouse.verifyBatch(emails);
  if (onProgress) onProgress(emails.length, emails.length);
  return results.map((r) => ({ ...r, shouldSend: computeShouldSend(r.status) }));
}

export interface StartVerificationJobInput {
  userId: number;
  jobId: string;
  emailsToVerify: Array<{ email: string; leadId?: number }>;
  sourceType: "campaign" | "leadIds" | "emails";
  sourceCampaignId?: number;
}

// The actual background worker -- fired unawaited from the tRPC mutation
// (verification.startJob), continues running in this same Node process
// after the response is already sent. No queue/worker infra beyond that;
// justified in the plan (a ~1000-email job is bounded, well within what an
// unawaited async function can carry, and this codebase already trusts this
// exact fire-and-forget shape elsewhere, e.g. scheduleFollowUpEmails(...).catch(...)).
export async function runVerificationJob(input: StartVerificationJobInput): Promise<void> {
  const { userId, jobId, emailsToVerify } = input;
  try {
    await db.updateEmailVerificationJob(jobId, { status: "in_progress" });

    const emailToLeadId = new Map(emailsToVerify.map((e) => [e.email, e.leadId]));
    const counts = { validCount: 0, invalidCount: 0, catchAllCount: 0, roleBasedCount: 0, disposableCount: 0, unknownCount: 0 };

    const results = await verifyEmailsInHouse(
      emailsToVerify.map((e) => e.email),
      (done, total) => {
        db.updateEmailVerificationJob(jobId, { processedCount: Math.min(done, total) }).catch(() => {});
      }
    );

    // Per-result try/catch -- one bad insert (or a transient DB hiccup)
    // shouldn't lose every other result already computed in memory for this
    // batch. Each result is independent, so failures here are logged and
    // skipped rather than aborting the rest of the loop.
    for (const result of results) {
      try {
        const leadId = emailToLeadId.get(result.email);
        const countKey = `${result.status === "catch_all" ? "catchAll" : result.status === "role_based" ? "roleBased" : result.status}Count` as keyof typeof counts;
        if (countKey in counts) counts[countKey]++;

        await db.insertEmailVerificationResult({
          jobId,
          leadId: leadId ?? null,
          email: result.email,
          provider: result.provider,
          rawStatus: result.raw?.status || result.status,
          normalizedStatus: result.status,
          score: result.score ?? null,
          reason: result.reason,
          shouldSend: result.shouldSend,
        });

        if (leadId) {
          // Same status vocabulary/shape leads.emailVerificationStatus already
          // used (deliverable/undeliverable/risky/unknown/pending) -- mapped
          // from the richer normalized status so campaigns.launch's existing
          // undeliverable-skip check keeps working completely unchanged.
          const legacyStatus = result.status === "valid" ? "deliverable"
            : result.status === "invalid" || result.status === "disposable" ? "undeliverable"
            : result.status === "catch_all" || result.status === "role_based" ? "risky"
            : "unknown";
          await db.updateLead(leadId, {
            emailVerificationStatus: legacyStatus as any,
            emailVerificationData: {
              normalizedStatus: result.status,
              provider: result.provider,
              score: result.score,
              reason: result.reason,
              shouldSend: result.shouldSend,
              verifiedAt: new Date().toISOString(),
            },
          }).catch((error: any) => console.warn(`[emailVerification] Failed to update lead ${leadId}:`, error.message));
        }
      } catch (error: any) {
        console.error(`[emailVerification] Failed to persist result for ${result.email}:`, error?.message);
      }
    }

    await db.updateEmailVerificationJob(jobId, {
      status: "completed",
      processedCount: emailsToVerify.length,
      completedAt: new Date(),
      ...counts,
    });

    await db.createPipelineEvent({
      userId,
      eventType: "verification_completed",
      payload: { jobId, total: emailsToVerify.length, ...counts },
    });
  } catch (error: any) {
    console.error(`[emailVerification] Job ${jobId} failed:`, error);
    await db.updateEmailVerificationJob(jobId, { status: "failed", errorMessage: error?.message || "Unknown error" }).catch(() => {});
  }
}
