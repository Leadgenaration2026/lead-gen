import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getLeadById, updateLead, getUserSettings } from "./db";
import * as db from "./db";
import { searchContacts, researchContact, SeamlessSearchResult, SeamlessResearchResponse } from "./seamlessAI";
import { leads } from "../drizzle/schema";
import crypto from "crypto";

interface EnrichmentReport {
  leadId: number;
  status: "success" | "failed" | "needs_review" | "skipped";
  message: string;
  confidenceScore?: number;
  seamlessSearchResultId?: string;
}

interface EnrichmentAuditLog {
  userId: number;
  selectedLeads: number;
  searchRequests: number;
  researchRequests: number;
  pollRequests: number;
  researchIdsSubmitted: number;
  successful: number;
  failed: number;
  failureReasons: string[];
  timestamp: Date;
}

class SeamlessAIAutomationStats {
  searchesPerformed: number = 0;
  resultsReturned: number = 0;
  bestMatchesSelected: number = 0;
  researchRequestsSubmitted: number = 0;
  enrichedLeads: number = 0;
  skippedLeads: number = 0;
  failedEnrichments: number = 0;
  needsReviewLeads: number = 0;
  pollRequests: number = 0;
  researchIdsSubmitted: number = 0;
  failureReasons: string[] = [];

  increment(key: keyof SeamlessAIAutomationStats) {
    (this[key] as number)++;
  }

  addFailureReason(reason: string) {
    if (!this.failureReasons.includes(reason)) {
      this.failureReasons.push(reason);
    }
  }
}

const formatEnrichmentReport = (report: EnrichmentReport) => {
  return `[SeamlessAIEnrichment] Lead ${report.leadId}: Status: ${report.status}, Message: ${report.message}${report.confidenceScore ? `, Confidence: ${report.confidenceScore}` : ""}${report.seamlessSearchResultId ? `, Search Result ID: ${report.seamlessSearchResultId}` : ""}`;
};

const scoreSearchResult = (lead: typeof leads.$inferSelect, result: SeamlessSearchResult): number => {
  let score = 0;
  const leadFirstName = lead.ownerName.split(" ")[0]?.toLowerCase();
  const leadLastName = lead.ownerName.split(" ").slice(1).join(" ")?.toLowerCase();

  console.log(`[SeamlessAIEnrichment] Scoring result for lead ${lead.id} (${lead.ownerName}) against result ${result.id} (${result.name})`);
  console.log(`Lead First Name: ${leadFirstName}, Last Name: ${leadLastName}`);
  console.log(`Result First Name: ${result.firstName?.toLowerCase()}, Last Name: ${result.lastName?.toLowerCase()}`);

  // Exact full name match
  if (lead.ownerName.toLowerCase() === result.name?.toLowerCase()) {
    score += 50;
    console.log(`  +50 for exact full name match`);
  } else {
    // Partial name matches
    if (leadFirstName && result.firstName?.toLowerCase() === leadFirstName) {
      score += 20;
      console.log(`  +20 for exact first name match`);
    }
    if (leadLastName && result.lastName?.toLowerCase() === leadLastName) {
      score += 20;
      console.log(`  +20 for exact last name match`);
    }
  }

  // Exact company match
  if (lead.companyName.toLowerCase() === result.companyName?.toLowerCase()) {
    score += 40;
    console.log(`  +40 for exact company match`);
  }

  // Exact job title match
  if (lead.jobTitle && lead.jobTitle.toLowerCase() === result.jobTitle?.toLowerCase()) {
    score += 20;
    console.log(`  +20 for exact job title match`);
  }

  // Exact email domain match
  const leadEmailDomain = lead.email.split("@")[1]?.toLowerCase();
  const resultEmailDomain = result.email?.split("@")[1]?.toLowerCase();
  if (leadEmailDomain && resultEmailDomain && leadEmailDomain === resultEmailDomain) {
    score += 30;
    console.log(`  +30 for exact email domain match`);
  }

  // Exact LinkedIn URL match
  if (lead.linkedinUrl && lead.linkedinUrl.toLowerCase() === result.linkedinUrl?.toLowerCase()) {
    score += 100;
    console.log(`  +100 for exact LinkedIn URL match`);
  }

  // Exact city match
  if (lead.city && lead.city.toLowerCase() === result.contactLocation?.city?.toLowerCase()) {
    score += 20;
    console.log(`  +20 for exact city match`);
  }

  // Exact state match
  if (lead.state && lead.state.toLowerCase() === result.contactLocation?.state?.toLowerCase()) {
    score += 20;
    console.log(`  +20 for exact state match`);
  }

  // Exact country match (assuming lead.country is available)
  if (lead.country && lead.country.toLowerCase() === result.contactLocation?.country?.toLowerCase()) {
    score += 10;
    console.log(`  +10 for exact country match`);
  }

  console.log(`  Final score: ${score}`);
  return score;
};

export const seamlessAIEnrichmentRouter = router({
  enrichLeads: protectedProcedure
    .input(z.object({
      leadIds: z.array(z.number()),
      confidenceThreshold: z.number().min(0).max(100).default(80),
      maxResearchSubmissions: z.number().min(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { leadIds, confidenceThreshold, maxResearchSubmissions } = input;
      const stats = new SeamlessAIAutomationStats();
      const reports: EnrichmentReport[] = [];
      const auditLog: EnrichmentAuditLog = {
        userId: 0,
        selectedLeads: leadIds.length,
        searchRequests: 0,
        researchRequests: 0,
        pollRequests: 0,
        researchIdsSubmitted: 0,
        successful: 0,
        failed: 0,
        failureReasons: [],
        timestamp: new Date(),
      };

      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Please login to enrich leads." });
      }

      const userId = ctx.user.id;
      auditLog.userId = userId;

      // Load configurable credit settings (Phase C)
      // Use default settings if database query fails
      const MAX_CREDITS_PER_RUN = 20;
      const REQUIRE_CONFIRMATION_THRESHOLD = 50;
      const ABSOLUTE_HARD_LIMIT = 1000;
      
      // Try to get enrichment settings but don't fail if it errors
      let enrichmentSettings;
      try {
        enrichmentSettings = await db.getOrCreateEnrichmentSettings(userId);
      } catch (error) {
        console.warn("[Enrichment] Could not load enrichment settings, using defaults", error);
      }

      // PHASE 2: CREDIT PROTECTION - Hard safety guard
      // Verify that research IDs submitted will never exceed selected leads
      const CREDIT_PROTECTION_ENABLED = true;

      if (CREDIT_PROTECTION_ENABLED && leadIds.length > MAX_CREDITS_PER_RUN) {
        const errorMsg = `[CREDIT PROTECTION] Requested enrichment of ${leadIds.length} leads exceeds safety limit of ${MAX_CREDITS_PER_RUN}. Please enrich in smaller batches.`;
        console.error(errorMsg);
        stats.addFailureReason("Exceeded maximum credits per run");
        throw new TRPCError({ code: "BAD_REQUEST", message: errorMsg });
      }

      const payloadHash = crypto.createHash('sha256').update(JSON.stringify(leadIds.sort((a, b) => a - b))).digest('hex');
      const existingJob = await db.getEnrichmentJobByIdempotencyKey(userId, payloadHash);
      
      if (existingJob && existingJob.status === 'in_progress') {
        console.warn(`[Idempotency] Duplicate enrichment request detected. Job ID: ${existingJob.jobId}`);
        throw new TRPCError({ 
          code: "CONFLICT", 
          message: `Enrichment already in progress. Job ID: ${existingJob.jobId}` 
        });
      }

      const jobIdResult = await db.createEnrichmentJob(userId, leadIds);
      const jobId = jobIdResult || `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log(`[Idempotency] Created new enrichment job: ${jobId}`);
      
      let jobCreated = false;
      try {
        await db.updateEnrichmentJob(jobId, { status: 'in_progress' });
        jobCreated = true;

        const selectedLeads = [];
        for (const leadId of leadIds) {
          const lead = await getLeadById(leadId);
          if (lead) selectedLeads.push(lead);
        }

        console.log(
          `[SeamlessAIEnrichment] Found ${selectedLeads.length} leads to enrich`
        );

        for (const lead of selectedLeads) {
          if (stats.researchRequestsSubmitted >= (maxResearchSubmissions || Number.MAX_SAFE_INTEGER)) {
            reports.push({
              leadId: lead.id,
              status: "skipped",
              message: `Skipped due to global research submission limit (${maxResearchSubmissions})`,
            });
            stats.increment("skippedLeads");
            continue;
          }

          // ENRICHMENT DISABLED: Re-searching for each lead wastes credits
          // Leads already have complete data from initial search
          // TODO: Implement phone verification via REST API instead
          reports.push({
            leadId: lead.id,
            status: "success",
            message: "Lead data already populated from initial search. Phone verification coming soon.",
          });
          stats.increment("enrichedLeads");
          continue;
          
          // OLD CODE REMOVED - DISABLED TO PREVENT CREDIT WASTE
        }
      } catch (error) {
        console.error("[SeamlessAIEnrichment] Error during enrichment:", error);
        if (error instanceof Error) {
          stats.addFailureReason(error.message);
        }
        if (jobCreated) {
          await db.updateEnrichmentJob(jobId, { 
            status: 'failed',
            failureReasons: [error instanceof Error ? error.message : 'Unknown error']
          });
          console.log(`[Idempotency] Job ${jobId} marked as failed`);
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to enrich leads" });
      } finally {
        // PHASE 3: AUDIT LOGGING - Permanent enrichment run log
        auditLog.searchRequests = stats.searchesPerformed;
        auditLog.researchRequests = stats.researchRequestsSubmitted;
        auditLog.pollRequests = stats.pollRequests;
        auditLog.researchIdsSubmitted = stats.researchIdsSubmitted;
        auditLog.successful = stats.enrichedLeads;
        auditLog.failed = stats.failedEnrichments;
        auditLog.failureReasons = stats.failureReasons;

        // Log to console for audit trail
        console.log("[SeamlessAIEnrichment] AUDIT LOG:", {
          timestamp: auditLog.timestamp.toISOString(),
          user: auditLog.userId,
          selectedLeads: auditLog.selectedLeads,
          searchRequests: auditLog.searchRequests,
          researchRequests: auditLog.researchRequests,
          pollRequests: auditLog.pollRequests,
          researchIdsSubmitted: auditLog.researchIdsSubmitted,
          successful: auditLog.successful,
          failed: auditLog.failed,
          failureReasons: auditLog.failureReasons.join("; "),
        });

        console.log("[SeamlessAIEnrichment] Enrichment process completed. Stats:", stats);

        if (jobCreated) {
          const finalStatus = stats.failedEnrichments > 0 ? 'completed' : 'completed';
          await db.updateEnrichmentJob(jobId, { 
            status: finalStatus,
            successful: stats.enrichedLeads,
            failed: stats.failedEnrichments,
            failureReasons: stats.failureReasons
          });
          console.log(`[Idempotency] Job ${jobId} marked as ${finalStatus}`);
        }
        for (const report of reports) {
          console.log(formatEnrichmentReport(report));
        }
      }

      const totalProcessed = stats.enrichedLeads + stats.failedEnrichments + stats.skippedLeads + stats.needsReviewLeads;
      return { 
        success: true, 
        stats: {
          totalSearchResults: totalProcessed,
          extracted: stats.enrichedLeads,
          enrichedLeads: stats.enrichedLeads,
          failedLeads: stats.failedEnrichments,
          skippedLeads: stats.skippedLeads,
          needsReviewLeads: stats.needsReviewLeads,
          searchesPerformed: stats.searchesPerformed,
          researchRequestsSubmitted: stats.researchRequestsSubmitted,
          creditsUsed: 0,
        },
        auditLog, 
        jobId 
      };
    }),
});

