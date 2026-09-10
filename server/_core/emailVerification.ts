import * as db from "../db";

export type NormalizedVerificationStatus = "valid" | "invalid" | "catch_all" | "role_based" | "disposable" | "unknown";

export interface VerificationResult {
  email: string;
  status: NormalizedVerificationStatus;
  provider: "in_house" | "bouncer";
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

// The always-available default provider -- no API key, no external
// dependency. Built on the existing (previously unused by any verification
// flow) format+MX/DNS+disposable-domain checker in server/emailValidation.ts,
// with role-based detection added on top. Deliberately does NOT attempt real
// SMTP mailbox probing (the RCPT TO handshake real verification providers
// use) -- most cloud hosts block outbound port 25 entirely, and probing from
// the same IP that sends real campaigns risks that IP's own sender
// reputation. Consequently this provider can never produce "catch_all" (that
// requires probing a fake address at the domain) -- only a Bouncer
// cross-check (below) can.
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

// Optional deeper cross-check -- only used when the user has configured a
// Bouncer key in Settings (existing integration, server/bouncer.ts, left
// completely unmodified). Wraps its actual response shape into the same
// normalized enum the in-house provider uses.
export class BouncerVerificationProvider implements VerificationProvider {
  name = "bouncer" as const;
  constructor(private apiKey: string) {}

  async verifyBatch(emails: string[], onProgress?: (done: number, total: number) => void): Promise<VerificationResult[]> {
    const { validateEmails } = await import("../bouncer");
    const summary = await validateEmails(this.apiKey, emails, onProgress);
    return summary.results.map((r) => normalizeBouncerResult(r));
  }
}

// Bouncer's real API shape (server/bouncer.ts's BouncerResult) has no
// dedicated spamtrap or abuse signal -- status/domain.acceptAll/
// domain.disposable/account.role/toxic/toxicity is everything it exposes.
// Those two statuses from the original spec are not faked here; ambiguous
// "risky" results with no specific sub-signal fall into "unknown" rather
// than an invented label.
export function normalizeBouncerResult(result: any): VerificationResult {
  const base = { email: result.email, provider: "bouncer" as const, score: result.score, raw: result };
  if (result.status === "deliverable") {
    return { ...base, status: "valid", reason: result.reason };
  }
  if (result.status === "undeliverable") {
    return { ...base, status: "invalid", reason: result.reason };
  }
  if (result.status === "risky") {
    if (result.domain?.disposable === "yes") return { ...base, status: "disposable", reason: "Disposable email domain" };
    if (result.domain?.acceptAll === "yes") return { ...base, status: "catch_all", reason: "Catch-all domain -- accepts any address, can't confirm this specific mailbox exists" };
    if (result.account?.role === "yes") return { ...base, status: "role_based", reason: "Role-based address" };
    return { ...base, status: "unknown", reason: result.reason || "Risky, no specific reason identified" };
  }
  return { ...base, status: "unknown", reason: result.reason || "Could not determine" };
}

export interface HybridVerificationResult extends VerificationResult {
  shouldSend: boolean;
}

function computeShouldSend(status: NormalizedVerificationStatus): boolean {
  // Matches the existing default safety rules: never auto-send
  // invalid/disposable; catch-all/unknown/role-based are eligible but
  // flagged for the user to decide, valid is the only unconditional yes.
  return status === "valid" || status === "catch_all" || status === "unknown" || status === "role_based";
}

// Runs the free in-house pass first; invalid/disposable results are final
// (no point spending a Bouncer credit confirming an already-certain bad
// address). If a Bouncer key is available, the remaining valid/role_based/
// unknown emails get a deeper cross-check on top, and Bouncer's result
// overrides the in-house one for those (more authoritative when available --
// can upgrade valid->catch_all, refine unknown, confirm/deny role-based
// deliverability). With no Bouncer key, the in-house results stand as final
// and catch_all simply never appears -- a disclosed limitation, not a bug.
export async function verifyEmailsHybrid(
  emails: string[],
  bouncerApiKey: string | null,
  onProgress?: (done: number, total: number) => void
): Promise<HybridVerificationResult[]> {
  const inHouse = new InHouseVerificationProvider();
  const inHouseResults = await inHouse.verifyBatch(emails);
  if (onProgress) onProgress(Math.ceil(emails.length / 2), emails.length);

  const byEmail = new Map<string, VerificationResult>(inHouseResults.map((r) => [r.email, r]));

  if (bouncerApiKey) {
    const needsDeeperCheck = inHouseResults.filter((r) => r.status === "valid" || r.status === "role_based" || r.status === "unknown").map((r) => r.email);
    if (needsDeeperCheck.length > 0) {
      // bouncer.ts's validateEmails THROWS outright (not a per-email
      // rejection) on BOUNCER_NO_CREDITS/BOUNCER_INVALID_API_KEY -- e.g. the
      // account running out of credits partway through this exact batch.
      // Without this try/catch, that one failure used to propagate all the
      // way up through runVerificationJob and fail the ENTIRE job, discarding
      // every result computed so far -- including the free in-house results
      // for emails that had already been conclusively resolved before
      // Bouncer was even called. A Bouncer failure now degrades gracefully:
      // those emails just keep their in-house-only result instead of losing
      // everything (this is the exact bug behind "87 extracted, only 47
      // verified, what happened to the rest" -- the job silently failed
      // partway and nothing after that point ever got saved).
      try {
        const bouncer = new BouncerVerificationProvider(bouncerApiKey);
        const bouncerResults = await bouncer.verifyBatch(needsDeeperCheck, (done, total) => {
          if (onProgress) onProgress(Math.ceil(emails.length / 2) + Math.ceil((done / total) * (emails.length / 2)), emails.length);
        });
        for (const r of bouncerResults) byEmail.set(r.email, r);
      } catch (error: any) {
        console.error("[emailVerification] Bouncer cross-check failed, keeping in-house results for the affected emails:", error?.message);
      }
    }
  }

  if (onProgress) onProgress(emails.length, emails.length);

  return Array.from(byEmail.values()).map((r) => ({ ...r, shouldSend: computeShouldSend(r.status) }));
}

export interface StartVerificationJobInput {
  userId: number;
  jobId: string;
  emailsToVerify: Array<{ email: string; leadId?: number }>;
  sourceType: "campaign" | "leadIds" | "emails";
  sourceCampaignId?: number;
  bouncerApiKey: string | null;
}

// The actual background worker -- fired unawaited from the tRPC mutation
// (verification.startJob), continues running in this same Node process
// after the response is already sent. No queue/worker infra beyond that;
// justified in the plan (a ~1000-email job is bounded, well within what an
// unawaited async function can carry, and this codebase already trusts this
// exact fire-and-forget shape elsewhere, e.g. scheduleFollowUpEmails(...).catch(...)).
export async function runVerificationJob(input: StartVerificationJobInput): Promise<void> {
  const { userId, jobId, emailsToVerify, bouncerApiKey } = input;
  try {
    await db.updateEmailVerificationJob(jobId, { status: "in_progress" });

    const emailToLeadId = new Map(emailsToVerify.map((e) => [e.email, e.leadId]));
    const counts = { validCount: 0, invalidCount: 0, catchAllCount: 0, roleBasedCount: 0, disposableCount: 0, unknownCount: 0 };

    const results = await verifyEmailsHybrid(
      emailsToVerify.map((e) => e.email),
      bouncerApiKey,
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
