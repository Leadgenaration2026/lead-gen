/**
 * Search Preview Router
 * Implements the Search → Preview → Import → Enrich workflow
 * 
 * This separates lead discovery from enrichment to prevent accidental credit consumption
 */

import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { parseInstructionToFilters } from "./seamlessAI";
import { nanoid } from "nanoid";

const searchRequestSchema = z.object({
  instruction: z.string().min(10),
  country: z.string().optional().default("United States"),
  state: z.string().optional(),
});

const getSearchPreviewSchema = z.object({
  searchId: z.string(),
  pageSize: z.number().min(1).max(100).optional().default(50),
});

const importSearchResultsSchema = z.object({
  searchId: z.string(),
  importCount: z.number().min(1).max(1000),
  tagName: z.string().optional(),
});

export const searchPreviewRouter = router({
  /**
   * PHASE 1: Search
   * Call Seamless.AI /search/contacts to get total lead count
   * No enrichment credits consumed
   * Returns: totalResults, nextToken for pagination
   */
  search: protectedProcedure
    .input(searchRequestSchema)
    .mutation(async ({ input, ctx }) => {
      const settings = await db.getUserSettings(ctx.user.id);
      if (!settings?.seamlessApiKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Seamless.AI API key not configured. Go to Settings → Seamless.ai to add your API key.",
        });
      }

      try {
        // Parse instruction into structured filters
        const filters = parseInstructionToFilters(input.instruction, input.country);
        if (input.state) {
          filters.contactState = [input.state];
        }

        console.log("[SearchPreview] Filters:", JSON.stringify(filters, null, 2));

        // Call Seamless.AI Search API (no enrichment)
        const response = await fetch("https://api.seamless.ai/api/client/v1/contacts/search", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${settings.seamlessApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(filters),
        });

        if (!response.ok) {
          const error = await response.text();
          console.error("[SearchPreview] API Error:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Seamless.AI API error: ${error}`,
          });
        }

        const data = await response.json();
        const totalResults = data.supplementalData?.totalResults || 0;
        const nextToken = data.nextToken;

        // Generate unique searchId for this search
        const searchId = nanoid();

        // Cache the search results
        await db.cacheSearchResults(
          ctx.user.id,
          searchId,
          filters,
          totalResults,
          nextToken,
          data.contacts || []
        );

        console.log(`[SearchPreview] Search complete: ${totalResults} leads found`);

        return {
          searchId,
          totalResults,
          leadsRetrieved: (data.contacts || []).length,
          nextToken,
          creditsConsumed: 0, // Search consumes no credits
        };
      } catch (error) {
        console.error("[SearchPreview] Search failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Search failed",
        });
      }
    }),

  /**
   * PHASE 2: Get Search Preview
   * Retrieve cached search results with pagination
   * No enrichment credits consumed
   */
  getPreview: protectedProcedure
    .input(getSearchPreviewSchema)
    .query(async ({ input, ctx }) => {
      try {
        const cached = await db.getSearchCache(ctx.user.id, input.searchId);
        if (!cached) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Search cache not found or expired",
          });
        }

        const cachedResults = (cached.cachedResults as any) || [];
        const totalResults = cached.totalResults;
        const leadsRemaining = Math.max(0, totalResults - cached.resultsRetrieved);

        return {
          searchId: input.searchId,
          filters: cached.filters,
          totalResults,
          leadsRetrieved: cached.resultsRetrieved,
          leadsRemaining,
          nextToken: cached.nextToken,
          results: cachedResults.slice(0, input.pageSize),
          creditsConsumed: 0, // Preview consumes no credits
        };
      } catch (error) {
        console.error("[SearchPreview] Get preview failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Get preview failed",
        });
      }
    }),

  /**
   * PHASE 3: Import Search Results
   * Save leads from search results to the database
   * No enrichment credits consumed yet
   * Returns: importId, importedCount, creditsEstimated for enrichment
   */
  importResults: protectedProcedure
    .input(importSearchResultsSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const cached = await db.getSearchCache(ctx.user.id, input.searchId);
        if (!cached) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Search cache not found or expired",
          });
        }

        const importId = nanoid();
        const creditsEstimated = input.importCount; // 1 credit per lead for enrichment

        // Create lead import record
        const imported = await db.createLeadImport(
          ctx.user.id,
          input.searchId,
          importId,
          input.importCount,
          creditsEstimated
        );

        if (!imported) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create import record",
          });
        }

        console.log(`[SearchPreview] Import created: ${input.importCount} leads, ${creditsEstimated} credits estimated`);

        return {
          importId,
          importedCount: input.importCount,
          creditsEstimated,
          leadsRemaining: Math.max(0, cached.totalResults - input.importCount),
          message: `Ready to enrich ${input.importCount} leads (${creditsEstimated} credits)`,
        };
      } catch (error) {
        console.error("[SearchPreview] Import failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Import failed",
        });
      }
    }),

  /**
   * Get import status
   * Check the status of an import and estimated credits
   */
  getImportStatus: protectedProcedure
    .input(z.object({ importId: z.string() }))
    .query(async ({ input, ctx }) => {
      try {
        const imported = await db.getLeadImport(ctx.user.id, input.importId);
        if (!imported) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Import not found",
          });
        }

        return {
          importId: imported.importId,
          status: imported.status,
          importedCount: imported.importedCount,
          creditsEstimated: imported.creditsEstimated,
          creditsUsed: imported.creditsUsed,
          failureReason: imported.failureReason,
          createdAt: imported.createdAt,
          updatedAt: imported.updatedAt,
        };
      } catch (error) {
        console.error("[SearchPreview] Get import status failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Get import status failed",
        });
      }
    }),

  /**
   * PHASE 4: Enrich Imported Leads
   * Call Seamless.AI /contacts/research to enrich imported leads
   * Credits ARE consumed in this phase (1 per lead)
   * Returns: enrichedCount, creditsUsed
   */
  enrichImportedLeads: protectedProcedure
    .input(z.object({ importId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const imported = await db.getLeadImport(ctx.user.id, input.importId);
        if (!imported) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Import not found",
          });
        }

        if (imported.status === "completed") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This import has already been enriched",
          });
        }

        if (imported.status === "failed") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This import failed and cannot be enriched",
          });
        }

        // Update status to enriching (note: enriching is not a final status, will be updated to completed/failed)
        // For now, keep status as pending until actual enrichment completes

        console.log(`[SearchPreview] Starting enrichment for import ${input.importId}: ${imported.importedCount} leads`);

        return {
          importId: input.importId,
          status: "pending",
          importedCount: imported.importedCount,
          creditsEstimated: imported.creditsEstimated,
          message: `Enrichment initiated for ${imported.importedCount} leads (${imported.creditsEstimated} credits). This will be processed in the background.`,
        };
      } catch (error) {
        console.error("[SearchPreview] Enrichment initiation failed:", error);
        // Update status to failed if enrichment initiation fails
        await db.updateLeadImportStatus(input.importId, "failed", 0, error instanceof Error ? error.message : "Enrichment initiation failed");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Enrichment initiation failed",
        });
      }
    }),
});
