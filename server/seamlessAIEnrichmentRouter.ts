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

          stats.increment("searchesPerformed");
          console.log(`[SeamlessAIEnrichment] Searching Seamless.AI for lead ${lead.id} (${lead.ownerName}, ${lead.companyName})`);

          const searchFilters = {
            firstName: lead.ownerName.split(" ")[0],
            lastName: lead.ownerName.split(" ").slice(1).join(" "),
            companyName: [lead.companyName],
            jobTitle: lead.jobTitle ? [lead.jobTitle] : undefined,
            email: lead.email || undefined,
            city: lead.city || undefined,
            state: lead.state || undefined,
            country: lead.country || undefined,
            linkedinUrl: lead.linkedinUrl || undefined,
          };

          const userSettings = await db.getUserSettings(ctx.user.id);
          if (!userSettings?.seamlessApiKey) {
            throw new Error('Seamless.AI API key not configured');
          }
          const searchResults = await searchContacts(userSettings.seamlessApiKey, searchFilters);
          stats.increment("resultsReturned");

          if (!searchResults || searchResults.data.length === 0) {
            reports.push({
              leadId: lead.id,
              status: "needs_review",
              message: "No search results found on Seamless.AI",
            });
            stats.increment("needsReviewLeads");
            continue;
          }

          let bestMatch: { result: SeamlessSearchResult; score: number } | null = null;
          for (const result of searchResults.data) {
            const score = scoreSearchResult(lead, result);
            if (!bestMatch || score > bestMatch.score) {
              bestMatch = { result, score };
            }
          }

          if (!bestMatch || bestMatch.score < confidenceThreshold) {
            reports.push({
              leadId: lead.id,
              status: "needs_review",
              message: `Best match confidence (${bestMatch?.score || 0}) below threshold (${confidenceThreshold})`,
              confidenceScore: bestMatch?.score,
              seamlessSearchResultId: bestMatch?.result.id,
            });
            stats.increment("needsReviewLeads");
            continue;
          }

          // Safety guard: ensure only one result is selected for research
          if (bestMatch.result.id) {
            console.log(`[SeamlessAIEnrichment] Lead: ${lead.ownerName}`);
            console.log(`[SeamlessAIEnrichment] Search Results Returned: ${searchResults.data.length}`);
            console.log(`[SeamlessAIEnrichment] Selected Best Match: 1`);
            console.log(`[SeamlessAIEnrichment] Research IDs Submitted: 1`);
            console.log(`[SeamlessAIEnrichment] Expected Credits: 1`);

            // PHASE 2: HARD SAFETY GUARD - Verify searchResultIds.length <= selectedLeadCount
            const searchResultIds = [bestMatch.result.id];
            if (searchResultIds.length > auditLog.selectedLeads) {
              const errorMsg = `[CREDIT PROTECTION ABORT] Research IDs exceed selected leads. Aborting to prevent credit over-submission.`;
              console.error(errorMsg);
              stats.addFailureReason("Research IDs exceed selected leads");
              throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: errorMsg });
            }

            if (searchResultIds.length !== 1) {
              const errorMsg = `[IDEMPOTENCY] Expected exactly 1 research ID, got ${searchResultIds.length}. Aborting.`;
              console.error(errorMsg);
              stats.addFailureReason("Idempotency violation: multiple research IDs");
              throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: errorMsg });
            }

            stats.increment("researchRequestsSubmitted");
            stats.researchIdsSubmitted += searchResultIds.length;
            const researchResult: SeamlessResearchResponse = await researchContact(userSettings.seamlessApiKey, searchResultIds);

            if (researchResult) {
              await updateLead(lead.id, {
                email: researchResult.email || lead.email,
                phoneNumber: researchResult.phoneNumber || lead.phoneNumber,
                jobTitle: researchResult.jobTitle || lead.jobTitle,
                linkedinUrl: researchResult.linkedinUrl || lead.linkedinUrl,
                companyName: researchResult.companyName || lead.companyName,
                website: researchResult.website || lead.website,
                industry: researchResult.industry || lead.industry,
                city: researchResult.contactLocation?.city || lead.city,
                state: researchResult.contactLocation?.state || lead.state,
                country: researchResult.contactLocation?.country || lead.country,
                companySize: researchResult.companySize || lead.companySize,
                personalEmail: researchResult.personalEmail || lead.personalEmail,
                workEmail: researchResult.workEmail || lead.workEmail,
                allEmails: researchResult.allEmails || lead.allEmails,
              });
              reports.push({
                leadId: lead.id,
                status: "success",
                message: "Lead enriched successfully",
                confidenceScore: bestMatch.score,
                seamlessSearchResultId: bestMatch.result.id,
              });
              stats.increment("enrichedLeads");
            } else {
              reports.push({
                leadId: lead.id,
                status: "failed",
                message: "Failed to research contact on Seamless.AI",
                confidenceScore: bestMatch.score,
                seamlessSearchResultId: bestMatch.result.id,
              });
              stats.increment("failedEnrichments");
            }
          }
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

      return { success: true, stats, auditLog, jobId };
    }),
});

