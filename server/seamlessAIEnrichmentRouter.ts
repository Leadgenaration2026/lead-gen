/**
 * Seamless.AI Enrichment Router - API-First Approach
 * 
 * This replaces browser automation with direct REST API calls:
 * 1. Search for contacts
 * 2. Submit for research (enrichment)
 * 3. Poll for results
 * 4. Extract and save to database
 * 
 * No browser automation, no DOM scraping, no Playwright.
 */

import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { updateLead, getLeadById } from "./db";
import { searchContacts, researchContacts, pollContactResults } from "./seamlessAI";

export const seamlessAIEnrichmentRouter = router({
  /**
   * Enrich selected leads using Seamless.AI REST API
   * 
   * Flow:
   * 1. Get selected lead IDs and names
   * 2. Search Seamless.AI for each lead
   * 3. Submit for research
   * 4. Poll until complete
   * 5. Extract phone, title, company size, email
   * 6. Save to database
   */
  enrichSelectedLeads: protectedProcedure
    .input(
      z.object({
        leadIds: z.array(z.number()),
        requestedExtraction: z.number().optional().default(20),
      })
    )
    .mutation(async ({ input }) => {
      const { leadIds, requestedExtraction } = input;
      const apiKey = process.env.SEAMLESS_AI_API_KEY;

      if (!apiKey) {
        throw new Error(
          "SEAMLESS_AI_API_KEY not configured. Please add it in Settings."
        );
      }

      const stats = {
        totalLeads: leadIds.length,
        enrichedLeads: 0,
        failedLeads: 0,
        errors: [] as Array<{ leadId: number; error: string }>,
        startTime: new Date(),
        endTime: new Date(),
        totalFound: 0,
        extracted: 0,
      };

      console.log(
        `[SeamlessAIEnrichment] Starting enrichment for ${leadIds.length} leads`
      );

      try {
        // Get lead details from database
        const selectedLeads = [];
        for (const leadId of leadIds) {
          const lead = await getLeadById(leadId);
          if (lead) selectedLeads.push(lead);
        }

        console.log(
          `[SeamlessAIEnrichment] Found ${selectedLeads.length} leads to enrich`
        );

        // Process each lead
        for (const lead of selectedLeads) {
          try {
            console.log(
              `[SeamlessAIEnrichment] Processing lead: ${lead.ownerName}`
            );

            // Step 1: Search for the contact
            const searchResult = await searchContacts(
              apiKey,
              {
                // Search by name and company if available
                jobTitle: lead.jobTitle ? [lead.jobTitle] : undefined,
                limit: 1,
              },
              1
            );

            if (!searchResult.data || searchResult.data.length === 0) {
              console.log(
                `[SeamlessAIEnrichment] No search results for ${lead.ownerName}`
              );
              stats.failedLeads++;
              stats.errors.push({
                leadId: lead.id,
                error: "No search results found",
              });
              continue;
            }

            stats.totalFound += searchResult.data.length;
            const searchResultIds = searchResult.data.map(
              (r) => r.searchResultId
            );

            console.log(
              `[SeamlessAIEnrichment] Found ${searchResultIds.length} search result(s)`
            );

            // Step 2: Submit for research
            const researchResult = await researchContacts(apiKey, searchResultIds);

            if (!researchResult.requestIds || researchResult.requestIds.length === 0) {
              console.log(
                `[SeamlessAIEnrichment] Research submission failed for ${lead.ownerName}`
              );
              stats.failedLeads++;
              stats.errors.push({
                leadId: lead.id,
                error: "Research submission failed",
              });
              continue;
            }

            console.log(
              `[SeamlessAIEnrichment] Submitted ${researchResult.requestIds.length} request(s) for research`
            );

            // Step 3: Poll for results
            const pollResults = await pollContactResults(
              apiKey,
              researchResult.requestIds,
              120, // max attempts
              2000 // poll interval
            );

            if (!pollResults || pollResults.length === 0) {
              console.log(
                `[SeamlessAIEnrichment] No poll results for ${lead.ownerName}`
              );
              stats.failedLeads++;
              stats.errors.push({
                leadId: lead.id,
                error: "Polling timed out",
              });
              continue;
            }

            // Step 4: Extract data from first result
            const result = pollResults[0];
            if (!result.contact) {
              console.log(
                `[SeamlessAIEnrichment] No contact data in result for ${lead.ownerName}`
              );
              stats.failedLeads++;
              stats.errors.push({
                leadId: lead.id,
                error: "No contact data returned",
              });
              continue;
            }

            const contact = result.contact;

            // Extract fields using exact names from API response
            const phoneNumber =
              contact.contactPhone1 ||
              contact.contactPhone2 ||
              contact.contactPhone3 ||
              contact.companyPhone1 ||
              null;

            const jobTitle =
              contact.title || contact.jobTitle || lead.jobTitle || null;

            const companySize =
              contact.companyStaffCountRange ||
              (contact.companyStaffCount ? String(contact.companyStaffCount) : null);

            const email =
              contact.email || contact.personalEmail || lead.email || null;

            const company = contact.company || lead.companyName || null;

            const linkedIn = contact.lIProfileUrl || null;

            console.log(
              `[SeamlessAIEnrichment] Extracted data for ${lead.ownerName}:`,
              {
                phoneNumber,
                jobTitle,
                companySize,
                email,
                company,
                linkedIn,
              }
            );

            // Step 5: Update database
            await updateLead(lead.id, {
              phoneNumber: phoneNumber || lead.phoneNumber,
              jobTitle,
              companySize,
              email: email || lead.email,
              linkedinUrl: linkedIn || lead.linkedinUrl,
            });

            stats.enrichedLeads++;
            stats.extracted++;

            console.log(
              `[SeamlessAIEnrichment] ✅ Successfully enriched ${lead.ownerName}`
            );
          } catch (error: any) {
            console.error(
              `[SeamlessAIEnrichment] Error enriching ${lead.ownerName}:`,
              error.message
            );
            stats.failedLeads++;
            stats.errors.push({
              leadId: lead.id,
              error: error.message,
            });
          }
        }

        stats.endTime = new Date();

        console.log(
          `[SeamlessAIEnrichment] Enrichment complete:`,
          stats
        );

        return {
          success: true,
          stats,
        };
      } catch (error: any) {
        console.error(
          "[SeamlessAIEnrichment] Fatal error:",
          error.message
        );
        stats.endTime = new Date();
        return {
          success: false,
          error: error.message,
          stats,
        };
      }
    }),
});
