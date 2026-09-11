import * as db from "../db";

// "Lead Gen Head" -- a structured brief instead of the AI Agent chat wizard,
// run fully unattended by the /api/scheduled/process-leadgen-tasks heartbeat
// (server/_core/index.ts). This app has no in-process timers/worker
// (references/periodic-updates.md forbids them -- the instance can be
// killed anytime), so each tick re-reads the task's `status` from the DB and
// advances it by exactly ONE bounded step, then returns -- never a long
// synchronous run that could exceed a request timeout. The next tick (or a
// user-triggered retry) picks up exactly where the last one left off.
//
// Every stage is implemented by calling the SAME tRPC procedures the
// interactive AI Agent wizard already uses (via a server-side caller, not a
// real HTTP round-trip) -- this reuses their exact validation/business logic
// instead of duplicating it, and stays correct if those procedures change.

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function buildCaller(userId: number) {
  const [{ appRouter }, { createCallerFactory }, userRow] = await Promise.all([
    import("../routers"),
    import("./trpc"),
    db.getUserById(userId),
  ]);
  if (!userRow) throw new Error(`User ${userId} not found`);
  const createCaller = createCallerFactory(appRouter);
  // req/res are never touched by any procedure this orchestrator calls (all
  // of them only read ctx.user) -- confirmed by reading each one before
  // writing this file, not assumed.
  return createCaller({ req: {} as any, res: {} as any, user: userRow });
}

function buildInstruction(task: any, industries: string[], jobTitles: string[]): string {
  const parts: string[] = [];
  if (jobTitles.length) parts.push(jobTitles.join(", "));
  parts.push(industries.length ? `in the ${industries.join(", ")} industry` : "in any industry");
  // Seamless has no city filter (confirmed in server/seamlessAI.ts) -- this
  // is a best-effort hint for the free-text LLM parser only, not a
  // guaranteed filter the way country/state/industry/companySize are.
  if (task.city) parts.push(`in or near ${task.city}`);
  return parts.join(" ").trim() || "business decision-makers";
}

async function logEvent(userId: number, eventType: string, task: any, extra?: Record<string, any>) {
  await db.createPipelineEvent({
    userId,
    eventType,
    campaignId: task.campaignId || undefined,
    landingPageId: task.landingPageId || undefined,
    payload: { taskId: task.id, taskName: task.name, ...extra },
  }).catch(() => {});
}

async function flagAttention(taskId: number, reason: string) {
  await db.updateLeadGenTask(taskId, { needsAttention: true, attentionReason: reason, lastError: reason });
}

async function advanceTask(task: any): Promise<void> {
  const userId = task.userId;
  const industries = parseJsonField<string[]>(task.industries, []);
  const jobTitles = parseJsonField<string[]>(task.jobTitles, []);
  const proofPoints = parseJsonField<string[] | null>(task.proofPoints, null);

  try {
    const caller = await buildCaller(userId);

    switch (task.status) {
      case "pending": {
        const settings = await db.getUserSettings(userId);
        if (!settings?.seamlessApiKey) {
          await flagAttention(task.id, "Seamless.AI API key not configured. Go to Settings → Seamless.ai to add it.");
          return;
        }
        if (!settings?.smtpHost || !settings?.smtpPassword || !settings?.senderEmail) {
          await flagAttention(task.id, "Email sending isn't configured yet. Go to Settings → Email / SMTP (host, password, and sender email are required).");
          return;
        }
        await db.updateLeadGenTask(task.id, { status: "extracting" });
        return;
      }

      case "extracting": {
        // Capped well below the API's own 1000 max -- enrichSeamlessSelection
        // spends a real Seamless credit (and a real HTTP call) per candidate,
        // so a huge page could make a single tick run long enough to risk a
        // timeout on an ephemeral instance. A large targetLeadCount just
        // takes more ticks, not one giant one.
        const MAX_PER_TICK = 50;
        const instruction = buildInstruction(task, industries, jobTitles);
        const pageSize = Math.min(MAX_PER_TICK, Math.max(1, task.targetLeadCount - (task.extractedCount || 0)));
        const preview: any = await caller.leads.searchSeamlessPreview({
          instruction,
          count: pageSize,
          country: task.country || undefined,
          state: task.state || undefined,
          companySize: task.companySize || undefined,
          industryOverride: industries.length ? industries : undefined,
          titlesOverride: jobTitles.length ? jobTitles : undefined,
          nextToken: task.nextSeamlessToken || undefined,
        });

        if (!preview.candidates?.length) {
          if (!task.extractedCount) {
            await flagAttention(task.id, "No candidates found for this search -- try a broader location, company size, or industry.");
          } else {
            await db.updateLeadGenTask(task.id, { status: "verifying" });
          }
          return;
        }

        const enrichResult: any = await caller.leads.enrichSeamlessSelection({
          leadSetName: task.name,
          candidates: preview.candidates,
        });

        const newExtractedCount = (task.extractedCount || 0) + (enrichResult.count || 0);
        const patch: any = {
          extractedCount: newExtractedCount,
          nextSeamlessToken: preview.nextToken || null,
        };
        if (enrichResult.leadSetId) patch.leadSetId = enrichResult.leadSetId;
        await db.updateLeadGenTask(task.id, patch);
        await logEvent(userId, "leads_generated", task, { extractedCount: newExtractedCount });

        if (newExtractedCount >= task.targetLeadCount || !preview.nextToken) {
          if (newExtractedCount === 0) {
            await flagAttention(task.id, "No leads could be saved from this search (missing contact info after enrichment) -- try different criteria.");
          } else {
            await db.updateLeadGenTask(task.id, { status: "verifying" });
          }
        }
        return;
      }

      case "verifying": {
        if (!task.verificationJobId) {
          if (!task.leadSetId) {
            await flagAttention(task.id, "No leads were saved to verify.");
            return;
          }
          const leads = await db.getLeadsBySourceListOrTag(userId, { sourceListId: task.leadSetId });
          if (!leads.length) {
            await flagAttention(task.id, "No leads were saved to verify.");
            return;
          }
          const jobResult: any = await caller.verification.startJob({ leadIds: leads.map((l: any) => String(l.id)) });
          await db.updateLeadGenTask(task.id, { verificationJobId: jobResult.jobId });
          await logEvent(userId, "verification_started", task, { totalToVerify: jobResult.totalToVerify });
          return;
        }

        const job = await db.getEmailVerificationJobByJobId(task.verificationJobId);
        if (!job || job.status === "pending" || job.status === "in_progress") return;
        if (job.status === "failed") {
          await flagAttention(task.id, `Email verification failed: ${job.errorMessage || "unknown error"}`);
          return;
        }

        const results = await db.listEmailVerificationResults({ jobId: task.verificationJobId, limit: 5000 });
        const verifiedLeadIds = results.filter((r: any) => r.shouldSend && r.leadId != null).map((r: any) => r.leadId);
        if (verifiedLeadIds.length === 0) {
          await flagAttention(task.id, `All ${results.length} verified lead(s) came back invalid/disposable/unsendable -- nothing eligible to campaign.`);
          return;
        }
        await db.updateLeadGenTask(task.id, { verifiedLeadIds, status: "tagging" });
        await logEvent(userId, "verification_completed", task, { verifiedCount: verifiedLeadIds.length });
        return;
      }

      case "tagging": {
        const verifiedLeadIds = parseJsonField<number[]>(task.verifiedLeadIds, []);
        const tag: any = await caller.leadSets.create({ name: task.name, description: "Created by Lead Gen Head" });
        await caller.leadSets.assignLeads({ leadIds: verifiedLeadIds, leadSetId: tag.id });
        await db.updateLeadGenTask(task.id, { status: "generating" });
        await logEvent(userId, "tag_assigned", task, { leadSetId: tag.id });
        return;
      }

      case "generating": {
        const targetAudience = jobTitles.length
          ? `${jobTitles.join(", ")} in the ${industries.join(", ") || "target"} industry`
          : "business decision-makers";
        const generated: any = await caller.landingPages.generate({
          name: task.landingPageName,
          industry: industries.join(", ") || "general business",
          targetAudience,
          offer: task.offer,
          proofPoints: proofPoints || undefined,
          logoUrl: task.logoUrl || undefined,
          stylePreference: task.stylePreference || undefined,
        });
        await db.updateLeadGenTask(task.id, { landingPageId: generated.landingPageId, status: "creating_campaign" });
        await logEvent(userId, "landing_page_generated", task, { landingPageId: generated.landingPageId });
        return;
      }

      case "creating_campaign": {
        const verifiedLeadIds = parseJsonField<number[]>(task.verifiedLeadIds, []);
        const result: any = await caller.landingPages.createCampaignFromSequence({
          landingPageId: task.landingPageId,
          campaignName: task.name,
          leadIds: verifiedLeadIds,
        });
        if (!result.campaignId) {
          await flagAttention(task.id, "Campaign creation did not return an id.");
          return;
        }
        await db.updateLeadGenTask(task.id, { campaignId: result.campaignId, status: "publishing" });
        await logEvent(userId, "campaign_created_from_sequence", task, { campaignId: result.campaignId });
        return;
      }

      case "publishing": {
        await caller.landingPages.publish(task.landingPageId);
        await db.updateLeadGenTask(task.id, { status: "preflight" });
        return;
      }

      case "preflight": {
        const { runPreflightCheck } = await import("./preflightCheck");
        const result = await runPreflightCheck(task.campaignId);
        if (!result.passed) {
          const reasons = result.checks.filter((c) => c.status === "fail").map((c) => c.message).join("; ");
          await flagAttention(task.id, `Pre-flight check failed: ${reasons}`);
          await logEvent(userId, "preflight_failed", task, { checks: result.checks });
          return;
        }
        await db.updateLeadGenTask(task.id, { status: "launching" });
        await logEvent(userId, "preflight_passed", task);
        return;
      }

      case "launching": {
        const result: any = await caller.campaigns.launch(task.campaignId);
        await db.updateLeadGenTask(task.id, { status: "completed", completedAt: new Date() });
        await logEvent(userId, "campaign_launched", task, { sentCount: result?.sentCount });
        return;
      }

      default:
        return;
    }
  } catch (error: any) {
    console.error(`[leadGenTaskOrchestrator] Task ${task.id} (${task.status}) failed:`, error);
    await flagAttention(task.id, error?.message || "Unknown error");
  }
}

// Entry point for the heartbeat handler -- processes a bounded batch of due
// tasks (across all users), advancing each by one stage. Per-task errors are
// caught inside advanceTask itself, so one bad task never blocks the rest.
export async function processLeadGenTasks(): Promise<{ processed: number }> {
  const tasks = await db.getDueLeadGenTasks(20);
  for (const task of tasks) {
    await advanceTask(task);
  }
  return { processed: tasks.length };
}
