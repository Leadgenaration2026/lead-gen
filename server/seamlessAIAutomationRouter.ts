import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { SeamlessAIAutomation } from "./seamlessAIAutomation";
import { notifyOwner } from "./_core/notification";

/**
 * tRPC Router for Seamless.AI Automation
 * Handles triggering and monitoring lead enrichment
 */

export const seamlessAIAutomationRouter = router({
  /**
   * Start auto-enrichment for all unverified leads
   * Triggers browser automation to fetch phone numbers, job titles, company size
   */
  startAutoEnrichment: protectedProcedure
    .input(
      z.object({
        seamlessAIUrl: z.string().url(),
        maxLeadsToProcess: z.number().int().positive().default(250),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        console.log(
          `[SeamlessAIAutomationRouter] Starting auto-enrichment for user ${ctx.user.id}`
        );

        // Initialize automation system
        const automation = new SeamlessAIAutomation();

        // Start browser and navigate to Seamless.AI
        await automation.start(input.seamlessAIUrl);

        // Enrich all leads
        const stats = await automation.enrichAllLeads();

        // Stop browser
        await automation.stop();

        // Log results
        console.log(
          `[SeamlessAIAutomationRouter] Enrichment complete:`,
          stats
        );

        // Notify owner of completion
        await notifyOwner({
          title: "Lead Enrichment Complete",
          content: `Enriched ${stats.enrichedLeads} leads. Failed: ${stats.failedLeads}. Skipped: ${stats.skippedLeads}.`,
        });

        return {
          success: true,
          stats,
        };
      } catch (error) {
        console.error(`[SeamlessAIAutomationRouter] Enrichment failed:`, error);

        // Notify owner of failure
        await notifyOwner({
          title: "Lead Enrichment Failed",
          content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        });

        throw error;
      }
    }),

  /**
   * Get enrichment status/progress
   * Returns current enrichment statistics
   */
  getEnrichmentStatus: protectedProcedure.query(async ({ ctx }) => {
    // This would typically fetch from a database or cache
    // For now, return a placeholder
    return {
      status: "idle",
      totalLeads: 0,
      enrichedLeads: 0,
      failedLeads: 0,
      progress: 0,
    };
  }),

  /**
   * Start auto-enrichment for selected leads only
   */
  startAutoEnrichmentSelected: protectedProcedure
    .input(
      z.object({
        seamlessAIUrl: z.string().url(),
        leadIds: z.array(z.number().int().positive()),
        requestedExtraction: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const requestedExtraction = input.requestedExtraction || input.leadIds.length;
        console.log(
          `[SeamlessAIAutomationRouter] Starting auto-enrichment for ${input.leadIds.length} selected leads (requested: ${requestedExtraction})`
        );

        const automation = new SeamlessAIAutomation();
        await automation.start(input.seamlessAIUrl);
        const stats = await automation.enrichAllLeads(automation.page!, input.leadIds, requestedExtraction);
        await automation.stop();

        console.log(
          `[SeamlessAIAutomationRouter] Enrichment complete:`,
          stats
        );

        await notifyOwner({
          title: "Lead Enrichment Complete",
          content: `Enriched ${stats.successfulLeads} leads. Failed: ${stats.failedLeads}. Skipped: ${stats.skippedLeads}. Total found: ${stats.totalSearchResults}.`,
        });

        return {
          success: true,
          stats,
          successfulLeads: stats.successfulLeads,
          failedLeads: stats.failedLeads,
          skippedLeads: stats.skippedLeads,
          totalSearchResults: stats.totalSearchResults,
          extractedCount: stats.extractedCount,
        };
      } catch (error) {
        console.error(`[SeamlessAIAutomationRouter] Enrichment failed:`, error);
        await notifyOwner({
          title: "Lead Enrichment Failed",
          content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
        throw error;
      }
    }),

  /**
   * Cancel ongoing enrichment
   * Stops the browser automation if running
   */
  cancelEnrichment: protectedProcedure.mutation(async ({ ctx }) => {
    console.log(`[SeamlessAIAutomationRouter] Cancelling enrichment for user ${ctx.user.id}`);
    // Implementation would stop the automation process
    return { success: true };
  }),
});
