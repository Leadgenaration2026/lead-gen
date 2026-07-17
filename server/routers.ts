import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { triggerRetellCall } from "./_core/retellAI";
import { nanoid } from "nanoid";
import nodemailer from "nodemailer";
import { plainTextToHtml } from "@shared/emailFormat";
import { getSignatureHtml, normalizePhoneNumber } from "./_core/followUpScheduler";
// DISABLED: Browser automation for enrichment - using REST API instead
// import { seamlessAIAutomationRouter } from "./seamlessAIAutomationRouter";
import { seamlessAIEnrichmentRouter } from "./seamlessAIEnrichmentRouter";
import { phoneVerificationRouter } from "./phoneVerificationRouter";
import { searchPreviewRouter } from "./searchPreviewRouter";
import { testHardcodedSeamlessSearch } from "./testHardcodedSearch";
import { testIsolatedFilters } from "./testIsolatedFilters";
import { testDiagnosticPayload } from "./testDiagnosticPayload";
import { testCompanySizeFormats } from "./testCompanySizeFormats";
import { searchDiagnosticsRouter } from "./searchDiagnosticsRouter";

// Name of the recurring heartbeat job that processes due follow-up emails,
// follow-up calls, and one-off scheduled emails.
const FOLLOW_UP_HEARTBEAT_NAME = "process-scheduled-emails";

// Name of the recurring heartbeat job that polls the IMAP inbox for replies.
const INBOX_SYNC_HEARTBEAT_NAME = "sync-inbox-replies";

// Validation schemas
const createLeadSchema = z.object({
  companyName: z.string().min(1),
  ownerName: z.string().min(1),
  email: z.string().email(),
  phoneNumber: z.string().min(1),
  website: z.string().optional(),
  industry: z.string().optional(),
  linkedinUrl: z.string().optional(),
  instagramUrl: z.string().optional(),
  facebookUrl: z.string().optional(),
  customData: z.any().optional(),
});

const createCampaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  subject: z.string().min(1),
  emailTemplate: z.string().min(1),
  leadIds: z.array(z.number()),
  templateId: z.number().optional(),
  scheduledAt: z.string().optional(), // ISO date string for scheduled launch
  dailySendLimit: z.number().min(1).max(500).optional(), // Max emails per day (null = send all at once)
});

const generateLeadsSchema = z.object({
  instruction: z.string().min(10),
  count: z.number().min(1).max(1000),
  leadSetName: z.string().optional(), // Optional: assign generated leads to a named set
  source: z.enum(["ai", "seamless"]).optional().default("ai"),
  country: z.string().optional(),
  state: z.string().optional(), // US state for targeted prospecting
});

const updateUserSettingsSchema = z.object({
  retellApiKey: z.string().optional(),
  retellAgentId: z.string().optional(),
  senderPhoneNumber: z.string().optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().optional(),
  smtpUsername: z.string().optional(),
  smtpPassword: z.string().optional(),
  senderEmail: z.union([z.string().email(), z.literal("")]).optional(),
  senderName: z.string().optional(),
  calcomWebhookSecret: z.string().optional(),
  ctaLink: z.string().optional(),
  retellWebhookSecret: z.string().optional(),
  seamlessApiKey: z.string().optional(),
  bouncerApiKey: z.string().optional(),

  // Social profiles
  linkedinUrl: z.string().optional(),
  linkedinType: z.enum(["page", "personal"]).optional(),
  instagramUrl: z.string().optional(),
  instagramType: z.enum(["page", "personal"]).optional(),
  facebookUrl: z.string().optional(),
  facebookType: z.enum(["page", "personal"]).optional(),
  socialDailyLimit: z.number().optional(),
  socialMessageCharLimit: z.number().optional(),
  socialDailyLimits: z.object({
    linkedin: z.object({ connection_request: z.number(), direct_message: z.number() }),
    instagram: z.object({ connection_request: z.number(), direct_message: z.number() }),
    facebook: z.object({ connection_request: z.number(), direct_message: z.number() }),
  }).optional(),
  socialNotificationEmail: z.union([z.string().email(), z.literal("")]).optional(),
  replyToEmail: z.union([z.string().email(), z.literal("")]).optional(),
  notificationEmail: z.union([z.string().email(), z.literal("")]).optional(),
  claudeApiKey: z.string().optional(),

  // IMAP inbox sync
  imapHost: z.string().optional(),
  imapPort: z.number().optional(),
  imapUsername: z.string().optional(),
  imapPassword: z.string().optional(),
});

export const appRouter = router({
  system: systemRouter,
  searchDiagnostics: searchDiagnosticsRouter,
  phoneVerification: phoneVerificationRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Leads router
  leads: router({
    list: protectedProcedure
      .input(z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(10).max(100).default(50),
      }).optional())
      .query(async ({ ctx, input }) => {
        const page = input?.page || 1;
        const pageSize = input?.pageSize || 50;
        // getLeadsByUserId returns a paginated wrapper object ({results, total, ...})
        // when both page and pageSize are given, but the frontend has always expected
        // a plain array here (every leadsQuery.data usage in Leads.tsx does .map/.filter/
        // .forEach directly on it) — unwrap it to avoid crashing the leads list page.
        const result = await db.getLeadsByUserId(ctx.user.id, page, pageSize);
        return Array.isArray(result) ? result : result.results;
      }),

    // Leads not yet assigned to any campaign (for dashboard leads view)
    listUnassigned: protectedProcedure.query(async ({ ctx }) => {
      return db.getUnassignedLeadsByUserId(ctx.user.id);
    }),

    // All leads with engagement status for the unified management page
    listWithStatus: protectedProcedure.query(async ({ ctx }) => {
      const allLeads = await db.getLeadsByUserId(ctx.user.id);
      const allCampaigns = await db.getCampaignsByUserId(ctx.user.id);
      
      // Get engagement data for each lead
      const leadsWithStatus = await Promise.all(allLeads.map(async (lead) => {
        let emailsSent = 0, emailsOpened = 0, emailsClicked = 0, callsMade = 0, replied = false, socialSent = 0;
        
        for (const campaign of allCampaigns) {
          const cls = await db.getCampaignLeads(campaign.id);
          const matchingCL = cls.find(cl => cl.leadId === lead.id);
          if (matchingCL) {
            if (matchingCL.emailSent) emailsSent++;
            if (matchingCL.emailOpened) emailsOpened++;
            if (matchingCL.emailClicked) emailsClicked++;
            if ((matchingCL as any).replied) replied = true;
          }
        }
        
        // Get social outreach count
        const { socialOutreach } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const database = await db.getDb();
        if (database) {
          const socialResults = await database.select().from(socialOutreach).where(
            and(eq(socialOutreach.leadId, lead.id), eq(socialOutreach.status, "sent"))
          );
          socialSent = socialResults.length;
        }
        
        return {
          ...lead,
          engagement: { emailsSent, emailsOpened, emailsClicked, callsMade, replied, socialSent },
        };
      }));
      
      return leadsWithStatus;
    }),

    get: protectedProcedure.input(z.number()).query(async ({ input: leadId, ctx }) => {
      const lead = await db.getLeadById(leadId);
      if (!lead || lead.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return lead;
    }),

    create: protectedProcedure.input(createLeadSchema).mutation(async ({ input, ctx }) => {
      const result = await db.createLead({
        ...input,
        userId: ctx.user.id,
        status: "new",
      });
      // Auto-analyze website in background (non-blocking)
      const leadId = (result as any)[0]?.insertId;
      if (leadId) {
        if (input.website) {
          setImmediate(async () => {
            try {
              const { fullWebsiteAnalysis } = await import("./websiteAnalysis");
              const analysis = await fullWebsiteAnalysis(
                input.website!,
                input.companyName,
                input.industry || "general business"
              );
              await db.upsertWebsiteInsights(leadId, {
                domain: analysis.insights.domain,
                totalVisits: analysis.insights.totalVisits,
                bounceRate: analysis.insights.bounceRate,
                globalRank: analysis.insights.globalRank,
                topKeywords: analysis.insights.topKeywords,
                trafficSources: analysis.insights.trafficSources,
                topLandingPages: analysis.insights.topLandingPages,
                competitors: analysis.competitors,
                competitorGaps: analysis.competitorGaps,
                recentNews: analysis.recentNews,
                industryInsights: analysis.industryInsights,
                insightsSummary: analysis.summary,
              });
              console.log(`[AutoAnalyze] Website analysis complete for lead ${leadId}: ${input.website}`);
            } catch (e: any) {
              console.warn(`[AutoAnalyze] Failed for lead ${leadId}:`, e.message);
            }
          });
        }
        // Auto-score engagement in background (non-blocking) — uses the real
        // engagementScoring.ts scorer (LinkedIn profile signals + website liveness),
        // which sets both engagementScore/engagementData and socialMediaScore
        // together, so this lead never ends up with a placeholder score.
        setImmediate(async () => {
          try {
            const { scoreLeadEngagement } = await import("./engagementScoring");
            await scoreLeadEngagement(leadId);
            console.log(`[Engagement] Lead ${leadId} scored`);
          } catch (e: any) {
            console.warn(`[Engagement] Failed for lead ${leadId}:`, e.message);
          }
        });
      }
      return result;
    }),

    update: protectedProcedure
      .input(z.object({ id: z.number(), data: z.object({
        companyName: z.string().optional(),
        ownerName: z.string().optional(),
        email: z.string().email().optional(),
        phoneNumber: z.string().optional(),
        website: z.string().optional(),
        industry: z.string().optional(),
        linkedinUrl: z.string().optional(),
        instagramUrl: z.string().optional(),
        facebookUrl: z.string().optional(),
        customData: z.any().optional(),
        status: z.enum(["new", "contacted", "qualified", "converted", "rejected"]).optional(),
        tag: z.enum(["hot", "warm", "cold", "follow_up", "none"]).optional(),
        timezone: z.string().optional(),
      }) }))
      .mutation(async ({ input, ctx }) => {
        const lead = await db.getLeadById(input.id);
        if (!lead || lead.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await db.updateLead(input.id, input.data);
        return db.getLeadById(input.id);
      }),

    delete: protectedProcedure.input(z.number()).mutation(async ({ input: leadId, ctx }) => {
      const lead = await db.getLeadById(leadId);
      if (!lead || lead.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return db.deleteLead(leadId);
    }),

    bulkDelete: protectedProcedure
      .input(z.object({ leadIds: z.array(z.number()).min(1) }))
      .mutation(async ({ input, ctx }) => {
        // Verify all leads belong to the user
        const leads = await Promise.all(input.leadIds.map(id => db.getLeadById(id)));
        const validIds = leads.filter(l => l && l.userId === ctx.user.id).map(l => l!.id);
        if (validIds.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "No valid leads found" });
        for (const id of validIds) {
          await db.deleteLead(id);
        }
        return { deleted: validIds.length };
      }),

    deleteByVerificationStatus: protectedProcedure
      .input(z.object({ statuses: z.array(z.enum(["risky", "unknown", "undeliverable"])).min(1) }))
      .mutation(async ({ input, ctx }) => {
        const allLeads = await db.getLeadsByUserId(ctx.user.id);
        const toDelete = allLeads.filter((l: any) => input.statuses.includes(l.emailVerificationStatus));
        if (toDelete.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "No leads found with the specified verification status" });
        for (const lead of toDelete) {
          await db.deleteLead(lead.id);
        }
        return { deleted: toDelete.length };
      }),

    deleteAll: protectedProcedure
      .mutation(async ({ ctx }) => {
        const allLeads = await db.getLeadsByUserId(ctx.user.id);
        if (allLeads.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "No leads to delete" });
        for (const lead of allLeads) {
          await db.deleteLead(lead.id);
        }
        return { deleted: allLeads.length };
      }),

    enrichFromSeamless: protectedProcedure
      .input(z.object({
        leadIds: z.array(z.number()),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getSeamlessLeads } = await import("./seamlessAI");
        const settings = await db.getUserSettings(ctx.user.id);
        const seamlessApiKey = settings?.seamlessApiKey;
        
        if (!seamlessApiKey) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Seamless.AI API key not configured. Please add it in Settings.",
          });
        }

        const leads = await Promise.all(
          input.leadIds.map(id => db.getLeadById(id))
        );

        const validLeads = leads.filter(l => l && l.userId === ctx.user.id);
        if (validLeads.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No valid leads found to enrich.",
          });
        }

        const enrichedResults = [];
        
        for (const lead of validLeads) {
          try {
            // First try: Search by company + job title for precise match
            let result = await getSeamlessLeads(
              seamlessApiKey,
              {
                companyName: lead.companyName ? [lead.companyName] : undefined,
                jobTitle: lead.jobTitle ? [lead.jobTitle] : undefined,
              },
              1
            );

            // Fallback: If no results, search by company name only
            if (!result.contacts || result.contacts.length === 0) {
              result = await getSeamlessLeads(
                seamlessApiKey,
                {
                  companyName: lead.companyName ? [lead.companyName] : undefined,
                },
                1
              );
            }

            if (result.contacts && result.contacts.length > 0) {
              const enrichedContact = result.contacts[0];
              
              // Always update with enriched data - don't use fallback to old data
              await db.updateLead(lead.id, {
                phoneNumber: enrichedContact.phoneNumber,
                phoneType: enrichedContact.phoneType || "unknown",
                secondaryPhone: enrichedContact.secondaryPhone,
                secondaryPhoneType: enrichedContact.secondaryPhoneType,
                personalEmail: enrichedContact.personalEmail,
                workEmail: enrichedContact.workEmail,
                allEmails: enrichedContact.allEmails ? enrichedContact.allEmails : null,
                companySize: enrichedContact.companySize,
                jobTitle: enrichedContact.jobTitle,
                industry: enrichedContact.industry,
                website: enrichedContact.website,
                timezone: enrichedContact.timezone,
              });
              
              enrichedResults.push({
                leadId: lead.id,
                success: true,
                data: enrichedContact,
              });
            } else {
              enrichedResults.push({
                leadId: lead.id,
                success: false,
                error: "No match found on Seamless.AI",
              });
            }
          } catch (error: any) {
            enrichedResults.push({
              leadId: lead.id,
              success: false,
              error: error.message,
            });
          }
        }

        return {
          enriched: enrichedResults.filter(r => r.success).length,
          failed: enrichedResults.filter(r => !r.success).length,
          results: enrichedResults,
        };
      }),

    addManual: protectedProcedure
      .input(z.object({
        companyName: z.string().min(1),
        ownerName: z.string().min(1),
        jobTitle: z.string().optional(),
        email: z.string().email(),
        phoneNumber: z.string().min(1),
        industry: z.string().optional(),
        companySize: z.string().optional(),
        website: z.string().optional(),
        linkedinUrl: z.string().optional(),
        instagramUrl: z.string().optional(),
        facebookUrl: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createLead({
          companyName: input.companyName,
          ownerName: input.ownerName,
          jobTitle: input.jobTitle || undefined,
          email: input.email,
          phoneNumber: input.phoneNumber,
          industry: input.industry,
          website: input.website || undefined,
          linkedinUrl: input.linkedinUrl || undefined,
          instagramUrl: input.instagramUrl || undefined,
          facebookUrl: input.facebookUrl || undefined,
          customData: { companySize: input.companySize },
          userId: ctx.user.id,
          status: "new",
        });
        // Auto-score engagement in background
        const newLeadId = (result as any)[0]?.insertId;
        if (newLeadId) {
          setImmediate(async () => {
            try {
              const { scoreLeadEngagement } = await import("./engagementScoring");
              await scoreLeadEngagement(newLeadId);
              console.log(`[Engagement] Manual lead ${newLeadId} scored`);
            } catch (e: any) {
              console.warn(`[Engagement] Failed for manual lead ${newLeadId}:`, e.message);
            }
          });
          // Auto-verify email via Bouncer in background
          setImmediate(async () => {
            try {
              const settings = await db.getUserSettings(ctx.user.id);
              if (!settings?.bouncerApiKey) return;
              const { validateEmail } = await import("./bouncer");
              const result = await validateEmail(settings.bouncerApiKey, input.email);
              await db.updateLead(newLeadId, {
                emailVerificationStatus: result.status as any,
                emailVerificationData: {
                  score: result.score,
                  reason: result.reason,
                  toxic: result.toxic,
                  toxicity: result.toxicity,
                  shouldSend: result.status !== "undeliverable",
                  verifiedAt: new Date().toISOString(),
                },
              });
              console.log(`[AutoVerify] Manual lead ${newLeadId} verified: ${result.status}`);
            } catch (e: any) {
              console.warn(`[AutoVerify] Failed for manual lead ${newLeadId}:`, e.message);
            }
          });
        }
        return result;
      }),

    // AI-powered lead generation from natural language
    generate: protectedProcedure
      .input(generateLeadsSchema)
      .mutation(async ({ input, ctx }) => {
        let leadsData: Array<{
          companyName: string;
          ownerName: string;
          jobTitle?: string;
          email: string;
          phoneNumber: string;
          website?: string;
          industry?: string;
          companySize?: string;
          timezone?: string;
          linkedinUrl?: string;
          instagramUrl?: string;
          facebookUrl?: string;
        }>;
        // Actual Seamless.AI research credits spent (1 per enrichment attempt),
        // captured before the phone/email completeness filter below so cost
        // reporting reflects real spend, not just the leads that passed the filter.
        let seamlessCreditsSpent = 0;

        // ═══════════════════════════════════════════════
        // SOURCE: SEAMLESS.AI (Real verified contacts)
        // ═══════════════════════════════════════════════
        if (input.source === "seamless") {
          const settings = await db.getUserSettings(ctx.user.id);
          if (!settings?.seamlessApiKey) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Seamless.AI API key not configured. Go to Settings → Seamless.ai to add your API key.",
            });
          }

          const { parseInstructionToFiltersWithLLM, getSeamlessLeads } = await import("./seamlessAI");

          // Parse user instruction into Seamless.AI filters. The LLM is the primary
          // interpreter for job titles and industries (covers any profession/industry,
          // not just the fixed keyword lists), with keyword-based parsing as a
          // fallback if the LLM call fails.
          const filters = await parseInstructionToFiltersWithLLM(input.instruction, input.country);
          
          // ALWAYS enforce country filter when user specifies a country
          if (input.country) {
            filters.contactCountry = [input.country];
          }
          // Enforce state filter when user specifies a US state
          if (input.state) {
            filters.contactState = [input.state];
          }
          console.log("[Seamless.AI] Final filters (country enforced):", JSON.stringify(filters));

          try {
            // getSeamlessLeads now paginates through ALL available search results up to count
            const result = await getSeamlessLeads(settings.seamlessApiKey, filters, input.count);

            // Post-filter: only keep contacts from the specified country
            let candidates = result.contacts;
            if (input.country) {
              const countryLower = input.country.toLowerCase();
              const countryAliases: Record<string, string[]> = {
                "united states": ["united states", "usa", "us", "united states of america"],
                "united kingdom": ["united kingdom", "uk", "great britain", "england"],
                "india": ["india"],
              };
              const matchTerms = countryAliases[countryLower] || [countryLower];

              const beforeCountryFilter = candidates.length;
              candidates = candidates.filter((c: any) => {
                // If contact has country info, check it matches
                if (c.country) {
                  return matchTerms.some(term => c.country!.toLowerCase().includes(term));
                }
                // If no country info, include it (benefit of the doubt since we filtered in search)
                return true;
              });

              console.log(`[Seamless.AI] After country filter: ${candidates.length} of ${beforeCountryFilter} contacts match ${input.country}`);
            }

            // Strict job title filter: Seamless.AI's own search does not reliably
            // restrict results to the requested titles (e.g. asking for "owners and CEO"
            // can still return accountants), so re-check every candidate's actual title
            // client-side against the expanded title list before accepting it.
            if (filters.jobTitle?.length) {
              const titleRegexes = filters.jobTitle.map((t: string) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"));
              const beforeTitleFilter = candidates.length;
              candidates = candidates.filter((c: any) => {
                const title = c.title || c.jobTitle || "";
                if (!title) return false; // Can't verify — exclude rather than risk a mismatch
                return titleRegexes.some((re: RegExp) => re.test(title));
              });
              console.log(`[Seamless.AI] After strict title filter: ${candidates.length} of ${beforeTitleFilter} contacts match requested titles`);
            }

            // Skip candidates already saved as leads (matched by Seamless.AI's own
            // searchResultId) BEFORE spending any enrichment credits on them — the
            // email-based dedup further below only runs after enrichment, which
            // means re-finding the same contacts on a later search was wasting
            // credits on results we were always going to discard anyway.
            const candidateSeamlessIds = candidates.map((c: any) => c.searchResultId).filter(Boolean);
            let skippedAlreadyOwned = 0;
            if (candidateSeamlessIds.length > 0) {
              const alreadyOwned = await db.getLeadsBySeamlessIds(candidateSeamlessIds, ctx.user.id);
              const ownedIds = new Set(alreadyOwned.map((l: any) => l.seamlessId));
              const beforeOwnedFilter = candidates.length;
              candidates = candidates.filter((c: any) => !ownedIds.has(c.searchResultId));
              skippedAlreadyOwned = beforeOwnedFilter - candidates.length;
              if (skippedAlreadyOwned > 0) {
                console.log(`[Seamless.AI] Skipped ${skippedAlreadyOwned} of ${beforeOwnedFilter} candidates already saved as leads (no credits spent on these)`);
              }
            }

            leadsData = candidates.slice(0, input.count);

            if (leadsData.length === 0) {
              if (skippedAlreadyOwned > 0) {
                throw new TRPCError({
                  code: "NOT_FOUND",
                  message: `Found matching contacts on Seamless.AI, but all ${skippedAlreadyOwned} are already saved as leads in your system. Try a different search criteria or location to find new leads.`,
                });
              }
              throw new TRPCError({
                code: "NOT_FOUND",
                message: `No contacts found in ${input.country || "your criteria"} on Seamless.AI. Try broadening your search (e.g., wider state or different job title).`,
              });
            }
            
            // AUTOMATIC ENRICHMENT: Research + Poll for phone number, email, and company size
            // This ensures generated leads come back complete in one action
            console.log(`[Seamless.AI] Starting automatic enrichment for ${leadsData.length} contacts...`);
            const { enrichContacts } = await import("./seamlessAI");
            const enrichmentMap = await enrichContacts(settings.seamlessApiKey, leadsData);
            seamlessCreditsSpent = leadsData.length; // 1 research credit per contact attempted, regardless of outcome

            // Map Seamless.AI API response to expected schema
            leadsData = leadsData.map((contact: any) => {
              const enrichment = enrichmentMap[contact.searchResultId] || {};

              return {
                companyName: contact.company || "Unknown",
                ownerName: `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || contact.name || "",
                jobTitle: contact.title || undefined,
                email: contact.email || enrichment.email || "",
                phoneNumber: enrichment.phoneNumber || "", // From research+poll enrichment
                // Confirmed against Seamless.AI's official API docs (docs.seamless.ai/searchcontacts):
                // website is "domain" (bare string, e.g. "pwc.com"), LinkedIn is "liUrl",
                // industry is a plural array field called "industries" (not "industry"), and
                // company size is "employeeSizeRange" — all available pre-enrichment.
                website: contact.domain ? `https://${contact.domain}` : (contact.website || undefined),
                industry: Array.isArray(contact.industries) ? contact.industries[0] : (contact.industries || contact.industry || enrichment.industry || undefined),
                companySize: contact.employeeSizeRange || enrichment.companySize || "1-10",
                timezone: contact.timezone || undefined,
                linkedinUrl: contact.liUrl || contact.linkedinUrl || undefined,
                instagramUrl: undefined,
                facebookUrl: undefined,
                seamlessId: contact.searchResultId, // Store Seamless.AI search result ID for later phone verification
                enrichmentCreditsUsed: 1, // Option A: 1 credit per lead enriched
              };
            });

            // Only keep leads with a phone number, an email, AND a known owner name —
            // per user requirement, incomplete leads are not useful and should be
            // dropped rather than returned with missing data.
            const beforeContactFilter = leadsData.length;
            leadsData = leadsData.filter((l: any) => l.phoneNumber && l.email && l.ownerName);
            const droppedForMissingContact = beforeContactFilter - leadsData.length;
            if (droppedForMissingContact > 0) {
              console.log(`[Seamless.AI] Dropped ${droppedForMissingContact} of ${beforeContactFilter} leads missing phone number, email, or owner name`);
            }

            if (leadsData.length === 0) {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: `Found ${beforeContactFilter} contact(s) but none had a complete phone number, email, and name after enrichment. Try broadening your search or increasing the requested count.`,
              });
            }

            console.log(`[Seamless.AI] Returning ${leadsData.length} leads, all with phone number, email, and owner name`);
          } catch (error: any) {
            if (error instanceof TRPCError) throw error;
            console.error("[Seamless.AI] Error:", error.message);
            
            // Provide user-friendly error messages for known error types
            const errMsg = error.message || "";
            if (errMsg.includes("SEAMLESS_CREDITS_EXHAUSTED")) {
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: "Your Seamless.AI account has run out of API credits. Please add more credits at seamless.ai/billing to continue generating leads.",
              });
            }
            if (errMsg.includes("SEAMLESS_AUTH_ERROR")) {
              throw new TRPCError({
                code: "UNAUTHORIZED",
                message: "Your Seamless.AI API key is invalid or expired. Please update it in Settings.",
              });
            }
            if (errMsg.includes("SEAMLESS_RATE_LIMITED")) {
              throw new TRPCError({
                code: "TOO_MANY_REQUESTS",
                message: "Too many requests to Seamless.AI. Please wait a moment and try again.",
              });
            }
            
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Seamless.AI error: ${error.message}`,
            });
          }
        }
        // ═══════════════════════════════════════════════
        // SOURCE: AI (LLM-generated placeholder leads)
        // ═══════════════════════════════════════════════
        else {
          const stateHint = input.state ? ` in ${input.state}` : "";
          const countryHint = input.country ? `\nIMPORTANT: All leads MUST be from ${input.country}${stateHint}. Use phone numbers, timezones, and domains appropriate for ${input.country}${stateHint}.` : "";
          const prompt = `Generate ${input.count} realistic business leads based on this instruction: "${input.instruction}"${countryHint}
        
Return a JSON array with exactly ${input.count} leads. Each lead must have:
- companyName: string (company name only)
- ownerName: string (person's actual name)
- jobTitle: string (actual job title like CEO, Manager, Developer - NOT the search instruction)
- email: string (valid email format)
- phoneNumber: string (valid phone format with country code, e.g. +1-555-123-4567)
- website: string (optional, valid URL if provided)
- industry: string (the industry/sector of the business)
- companySize: string (REQUIRED - must be one of: "1-10", "11-50", "51-200", "201-500", "500+" - never empty)
- timezone: string (IANA timezone of the lead's location, e.g. "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London")
- linkedinUrl: string (optional, LinkedIn profile URL if available, e.g. "https://linkedin.com/in/john-smith")
- instagramUrl: string (optional, Instagram profile URL if available, e.g. "https://instagram.com/companyname")
- facebookUrl: string (optional, Facebook profile/page URL if available, e.g. "https://facebook.com/companyname")

IMPORTANT: Do NOT include the search instruction in any field. Generate realistic diverse job titles based on industry.

Return ONLY valid JSON array, no other text. No markdown, no code fences.`;

          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content: "You are a lead generation expert. Generate realistic business leads with accurate contact information. Always respond with raw JSON only - no markdown formatting, no code fences, no explanatory text.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            response_format: { type: "json_object" },
          }) as any;

          try {
            let content = response.choices[0]?.message?.content;
            if (Array.isArray(content)) {
              content = content.map((c: any) => typeof c === 'string' ? c : c.text || '').join('');
            }
            if (!content) throw new Error("No response from LLM");
            content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
            const parsed = JSON.parse(content);
            leadsData = Array.isArray(parsed) ? parsed : (parsed.leads || parsed.data || Object.values(parsed)[0]);
            
            // Post-process to ensure all fields are properly populated
            leadsData = leadsData.map((lead: any) => ({
              ...lead,
              companySize: lead.companySize && String(lead.companySize).trim() ? String(lead.companySize).trim() : "1-10",
              jobTitle: lead.jobTitle && String(lead.jobTitle).trim() ? String(lead.jobTitle).trim() : undefined,
              phoneNumber: lead.phoneNumber && String(lead.phoneNumber).trim() ? String(lead.phoneNumber).trim() : "",
            }));
          } catch (error: any) {
            console.error("Lead generation parse error:", error.message);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to parse AI-generated leads. Please try again.",
            });
          }

          if (!Array.isArray(leadsData)) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "AI response was not an array of leads. Please try again.",
            });
          }
        }

        // ═══════════════════════════════════════════════
        // DUPLICATE PREVENTION: Skip leads with emails already in the system
        // But include leads WITHOUT emails (they have phone/LinkedIn)
        // ═══════════════════════════════════════════════
        const emailsToCheck = leadsData.map(l => l.email).filter(Boolean);
        const existingLeads = emailsToCheck.length > 0
          ? await db.getLeadsByEmails(emailsToCheck, ctx.user.id)
          : [];
        const existingEmails = new Set(existingLeads.map((l: any) => l.email.toLowerCase()));
        
        // Keep leads that either: have no email (phone/LinkedIn only) OR have a new email
        const uniqueLeadsData = leadsData.filter(
          (l) => !l.email || !existingEmails.has(l.email.toLowerCase())
        );
        const duplicatesSkipped = leadsData.length - uniqueLeadsData.length;
        if (duplicatesSkipped > 0) {
          console.log(`[LeadGen] Skipped ${duplicatesSkipped} duplicate leads (email already exists)`);
        }
        
        // If ALL leads were duplicates, return a helpful message instead of an error
        if (uniqueLeadsData.length === 0 && leadsData.length > 0) {
          return {
            count: 0,
            duplicatesSkipped,
            message: `Found ${leadsData.length} contacts from Seamless.AI, but all ${duplicatesSkipped} are already in your system. Try a different search criteria or location to find new leads.`,
          };
        }

        // If leadSetName is provided, create or find the lead set
        let leadSetId: number | null = null;
        if (input.leadSetName && input.leadSetName.trim()) {
          const existingSets = await db.getLeadSetsByUserId(ctx.user.id);
          const existing = existingSets.find(s => s.name.toLowerCase() === input.leadSetName!.trim().toLowerCase());
          if (existing) {
            leadSetId = existing.id;
          } else {
            leadSetId = await db.createLeadSet({
              userId: ctx.user.id,
              name: input.leadSetName.trim(),
              description: `Auto-created from ${input.source === "seamless" ? "Seamless.AI" : "AI"} generation: ${input.instruction.slice(0, 100)}`,
              type: "list",
            });
          }
        }

        // Create leads in database (only unique ones)
        const createdLeads = [];
        for (const leadData of uniqueLeadsData) {
          try {
            const result = await db.createLead({
              companyName: leadData.companyName || "Unknown",
              ownerName: leadData.ownerName || "Unknown",
              jobTitle: leadData.jobTitle || undefined,
              email: leadData.email || "",
              phoneNumber: leadData.phoneNumber || "",
              website: leadData.website,
              industry: leadData.industry,
              companySize: leadData.companySize || undefined,
              timezone: leadData.timezone || "America/New_York",
              linkedinUrl: leadData.linkedinUrl || undefined,
              seamlessId: (leadData as any).seamlessId || undefined,
              instagramUrl: leadData.instagramUrl || undefined,
              facebookUrl: leadData.facebookUrl || undefined,
              userId: ctx.user.id,
              status: "new",
              leadSetId,
              sourceListId: leadSetId || undefined,
              seamlessId: (leadData as any).seamlessId || undefined,
              enrichmentCreditsUsed: (leadData as any).enrichmentCreditsUsed || 0,
            });
            createdLeads.push(result);
          } catch (e) {
            console.error("Failed to create lead:", e);
          }
        }

        // Auto-analyze websites for generated leads in background
        setImmediate(async () => {
          try {
            const { fullWebsiteAnalysis } = await import("./websiteAnalysis");
            for (const leadData of uniqueLeadsData) {
              if (leadData.website) {
                const allLeads = await db.getLeadsByUserId(ctx.user.id);
                const matchingLead = allLeads.find(l => l.email === leadData.email && l.website === leadData.website);
                if (matchingLead) {
                  try {
                    const analysis = await fullWebsiteAnalysis(
                      leadData.website,
                      leadData.companyName || "Unknown",
                      leadData.industry || "general business"
                    );
                    await db.upsertWebsiteInsights(matchingLead.id, {
                      domain: analysis.insights.domain,
                      totalVisits: analysis.insights.totalVisits,
                      bounceRate: analysis.insights.bounceRate,
                      globalRank: analysis.insights.globalRank,
                      topKeywords: analysis.insights.topKeywords,
                      trafficSources: analysis.insights.trafficSources,
                      topLandingPages: analysis.insights.topLandingPages,
                      competitors: analysis.competitors,
                      competitorGaps: analysis.competitorGaps,
                      recentNews: analysis.recentNews,
                      industryInsights: analysis.industryInsights,
                      insightsSummary: analysis.summary,
                    });
                    console.log(`[AutoAnalyze] Complete for generated lead: ${leadData.website}`);
                  } catch (e: any) {
                    console.warn(`[AutoAnalyze] Failed for ${leadData.website}:`, e.message);
                  }
                }
              }
            }
          } catch (e: any) {
            console.warn("[AutoAnalyze] Batch analysis failed:", e.message);
          }
        });

        // Auto-score engagement for AI-generated leads in background
        setImmediate(async () => {
          try {
            const { scoreLeadsBatch } = await import("./engagementScoring");
            const allLeads = await db.getLeadsByUserId(ctx.user.id);
            const matchingIds = uniqueLeadsData
              .map((leadData) => allLeads.find((l) => l.email === leadData.email)?.id)
              .filter((id): id is number => !!id);
            await scoreLeadsBatch(matchingIds);
            console.log(`[Engagement] AI-generated leads batch scored`);
          } catch (e: any) {
            console.warn("[Engagement] AI batch scoring failed:", e.message);
          }
        });

        // Auto-verification disabled - only verify when user manually clicks "Verify Emails"
        console.log(`[AutoVerify] AI import auto-verification disabled - user must manually verify emails`);

        // Calculate total enrichment credits used (1 per Seamless.AI contact enriched).
        // Use seamlessCreditsSpent (captured before the phone/email completeness filter),
        // not leadsData.length or uniqueLeadsData.length — credits are spent on every
        // enrichment attempt regardless of whether the result passed the filter or dedup.
        const enrichmentCreditsUsed = input.source === "seamless" ? seamlessCreditsSpent : 0;

        return {
          success: true,
          count: createdLeads.length,
          leads: uniqueLeadsData,
          duplicatesSkipped,
          source: input.source || "ai",
          extractedFromSeamless: input.source === "seamless" ? leadsData.length : 0,
          enrichmentCreditsUsed, // Option A: 1 credit per Seamless.AI lead enriched
        };
      }),

    // ═══════════════════════════════════════════════
    // SEARCH -> SELECT -> ENRICH: search-only preview, no credits spent.
    // The user reviews the raw candidates and picks which ones to enrich via
    // enrichSeamlessSelection below, so credits are only spent on leads actually
    // wanted instead of enriching everything the search returns.
    // ═══════════════════════════════════════════════
    searchSeamlessPreview: protectedProcedure
      .input(z.object({
        instruction: z.string().min(3),
        count: z.number().min(1).max(1000),
        country: z.string().optional(),
        state: z.string().optional(),
        companySize: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const settings = await db.getUserSettings(ctx.user.id);
        if (!settings?.seamlessApiKey) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Seamless.AI API key not configured. Go to Settings → Seamless.ai to add your API key.",
          });
        }

        const { searchAndFilterSeamlessCandidates } = await import("./seamlessAI");
        const { candidates, totalAvailable, estimatedSearchCredits } = await searchAndFilterSeamlessCandidates(
          settings.seamlessApiKey,
          input.instruction,
          input.count,
          input.country,
          input.state,
          input.companySize
        );

        if (candidates.length === 0) {
          return { candidates: [], skippedAlreadyOwned: 0, skippedExcluded: 0, totalAvailable, estimatedSearchCredits };
        }

        // Skip candidates already saved as leads — no point showing them again
        const seamlessIds = candidates.map((c) => c.searchResultId).filter(Boolean);
        const alreadyOwned = seamlessIds.length > 0 ? await db.getLeadsBySeamlessIds(seamlessIds, ctx.user.id) : [];
        const ownedIds = new Set(alreadyOwned.map((l: any) => l.seamlessId));
        let filtered = candidates.filter((c) => !ownedIds.has(c.searchResultId));
        const skippedAlreadyOwned = candidates.length - filtered.length;

        // Skip candidates the user previously deleted/discarded from a search
        // preview — they explicitly said no to these, so never show them again.
        const remainingIds = filtered.map((c) => c.searchResultId).filter(Boolean);
        const excludedIds = remainingIds.length > 0 ? await db.getExcludedSeamlessContactIds(ctx.user.id, remainingIds) : new Set<string>();
        const beforeExcludedFilter = filtered.length;
        filtered = filtered.filter((c) => !excludedIds.has(c.searchResultId));
        const skippedExcluded = beforeExcludedFilter - filtered.length;

        return { candidates: filtered, skippedAlreadyOwned, skippedExcluded, totalAvailable, estimatedSearchCredits };
      }),

    // Permanently mark Seamless.AI contacts as excluded so future searches
    // never show them again (used when the user deletes/discards candidates
    // from a search preview without enriching them).
    excludeSeamlessContacts: protectedProcedure
      .input(z.object({
        searchResultIds: z.array(z.string()).min(1).max(1000),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.excludeSeamlessContacts(ctx.user.id, input.searchResultIds);
        return { success: true };
      }),

    // Enrich only the candidates the user selected from searchSeamlessPreview,
    // then create them as leads.
    enrichSeamlessSelection: protectedProcedure
      .input(z.object({
        leadSetName: z.string().optional(),
        candidates: z.array(z.object({
          searchResultId: z.string(),
          ownerName: z.string(),
          companyName: z.string(),
          jobTitle: z.string().optional(),
          email: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          country: z.string().optional(),
          website: z.string().optional(),
          industry: z.string().optional(),
          linkedinUrl: z.string().optional(),
        })).min(1).max(1000),
      }))
      .mutation(async ({ input, ctx }) => {
        const settings = await db.getUserSettings(ctx.user.id);
        if (!settings?.seamlessApiKey) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Seamless.AI API key not configured. Go to Settings → Seamless.ai to add your API key.",
          });
        }

        const { enrichSeamlessCandidatesToLeadData } = await import("./seamlessAI");
        const { leadsData, seamlessCreditsSpent, droppedForMissingContact } =
          await enrichSeamlessCandidatesToLeadData(settings.seamlessApiKey, input.candidates);

        if (leadsData.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `None of the ${input.candidates.length} selected contact(s) had a complete phone number, email, and name after enrichment.`,
          });
        }

        // Dedup by email against existing leads
        const emailsToCheck = leadsData.map((l) => l.email).filter(Boolean);
        const existingLeads = emailsToCheck.length > 0 ? await db.getLeadsByEmails(emailsToCheck, ctx.user.id) : [];
        const existingEmails = new Set(existingLeads.map((l: any) => l.email.toLowerCase()));
        const uniqueLeadsData = leadsData.filter((l) => !l.email || !existingEmails.has(l.email.toLowerCase()));
        const duplicatesSkipped = leadsData.length - uniqueLeadsData.length;

        if (uniqueLeadsData.length === 0) {
          return {
            success: true,
            count: 0,
            duplicatesSkipped,
            droppedForMissingContact,
            enrichmentCreditsUsed: seamlessCreditsSpent,
            message: `All ${duplicatesSkipped} selected contact(s) are already in your system.`,
          };
        }

        // If leadSetName is provided, create or find the lead set (same pattern as leads.generate)
        let leadSetId: number | null = null;
        if (input.leadSetName && input.leadSetName.trim()) {
          const existingSets = await db.getLeadSetsByUserId(ctx.user.id);
          const existing = existingSets.find((s) => s.name.toLowerCase() === input.leadSetName!.trim().toLowerCase());
          if (existing) {
            leadSetId = existing.id;
          } else {
            leadSetId = await db.createLeadSet({
              userId: ctx.user.id,
              name: input.leadSetName.trim(),
              description: `Manually selected from Seamless.AI search`,
              type: "list",
            });
          }
        }

        const createdLeads = [];
        for (const leadData of uniqueLeadsData) {
          try {
            const result = await db.createLead({
              companyName: leadData.companyName || "Unknown",
              ownerName: leadData.ownerName || "Unknown",
              jobTitle: leadData.jobTitle || undefined,
              email: leadData.email || "",
              phoneNumber: leadData.phoneNumber || "",
              website: leadData.website,
              industry: leadData.industry,
              companySize: leadData.companySize || undefined,
              timezone: leadData.timezone || "America/New_York",
              linkedinUrl: leadData.linkedinUrl || undefined,
              seamlessId: leadData.seamlessId || undefined,
              instagramUrl: leadData.instagramUrl || undefined,
              facebookUrl: leadData.facebookUrl || undefined,
              userId: ctx.user.id,
              status: "new",
              leadSetId,
              sourceListId: leadSetId || undefined,
              enrichmentCreditsUsed: leadData.enrichmentCreditsUsed || 0,
            });
            createdLeads.push(result);
          } catch (e) {
            console.error("Failed to create lead:", e);
          }
        }

        // Auto-score engagement (LinkedIn profile signals + website liveness) in
        // the background so the score is populated on the leads list without
        // needing a separate manual step. Re-query by seamlessId (an already
        // proven, reliable lookup — used for the "already owned" dedup check
        // above) rather than trying to extract an insert ID from db.createLead()'s
        // return value, whose exact shape isn't something this environment can
        // verify without a live database to test against.
        const createdSeamlessIds = uniqueLeadsData.map((l: any) => l.seamlessId).filter(Boolean);
        if (createdSeamlessIds.length > 0) {
          setImmediate(async () => {
            try {
              const justCreated = await db.getLeadsBySeamlessIds(createdSeamlessIds, ctx.user.id);
              const idsToScore = justCreated.map((l: any) => l.id);
              if (idsToScore.length > 0) {
                const { scoreLeadsBatch } = await import("./engagementScoring");
                await scoreLeadsBatch(idsToScore);
                console.log(`[Engagement] Seamless.AI selection batch scored ${idsToScore.length} leads`);
              }
            } catch (e: any) {
              console.warn("[Engagement] Seamless.AI selection batch scoring failed:", e.message);
            }
          });
        }

        return {
          success: true,
          count: createdLeads.length,
          leads: uniqueLeadsData,
          duplicatesSkipped,
          droppedForMissingContact,
          enrichmentCreditsUsed: seamlessCreditsSpent,
        };
      }),

    // Score engagement (LinkedIn profile signals + website liveness) for unsaved
    // Seamless.AI preview candidates, before the user decides whether to enrich/
    // save them. Uses the raw linkedinUrl/website already present pre-enrichment
    // (no Seamless.AI credits involved) — a separate, real LinkedIn + website
    // lookup per candidate, so callers should batch this (e.g. first ~20 visible
    // results) rather than requesting all candidates from a large search at once.
    scoreSeamlessCandidatesEngagement: protectedProcedure
      .input(z.object({
        candidates: z.array(z.object({
          searchResultId: z.string(),
          linkedinUrl: z.string().optional(),
          ownerName: z.string().optional(),
          companyName: z.string().optional(),
          website: z.string().optional(),
        })).min(1).max(50),
      }))
      .mutation(async ({ input }) => {
        const { computeEngagementMetrics } = await import("./engagementScoring");
        const results: Record<string, { score: number; metrics: any }> = {};

        // These are independent I/O-bound lookups (LinkedIn + website fetch per
        // candidate), so higher parallelism is safe from our side — the batch
        // size/delay here is just being polite to the underlying data API, not
        // working around a CPU bottleneck.
        const batchSize = 6;
        for (let i = 0; i < input.candidates.length; i += batchSize) {
          const batch = input.candidates.slice(i, i + batchSize);
          await Promise.all(batch.map(async (c) => {
            try {
              const { score, metrics } = await computeEngagementMetrics(c.linkedinUrl, c.ownerName, c.companyName, c.website);
              results[c.searchResultId] = { score, metrics };
            } catch (e: any) {
              console.warn(`[Engagement] Preview scoring failed for ${c.searchResultId}:`, e.message);
            }
          }));
          if (i + batchSize < input.candidates.length) {
            await new Promise((r) => setTimeout(r, 300));
          }
        }

        return { results };
      }),

    // CSV Import - bulk upload leads
    csvImport: protectedProcedure
      .input(z.object({
        leads: z.array(z.object({
          companyName: z.string().min(1),
          ownerName: z.string().min(1),
          jobTitle: z.string().optional(),
          email: z.string().min(1),
          phoneNumber: z.string().min(1),
          secondaryPhone: z.string().optional().nullable(),
          allEmails: z.array(z.string()).optional(),
          allPhones: z.array(z.object({
            number: z.string(),
            type: z.enum(['cell', 'landline', 'office']),
          })).optional(),
          website: z.string().optional(),
          industry: z.string().optional(),
          companySize: z.string().optional(),
          linkedinUrl: z.string().optional(),
          instagramUrl: z.string().optional(),
          facebookUrl: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          country: z.string().optional(),
          tag: z.enum(["hot", "warm", "cold", "follow_up", "none"]).optional(),
        })),
        leadSetName: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        console.log(`[CSV Import] Starting import for user ${ctx.user.id} with ${input.leads.length} leads`);
        
        // Resolve lead set
        let leadSetId: number | null = null;
        if (input.leadSetName && input.leadSetName.trim()) {
          const existingSets = await db.getLeadSetsByUserId(ctx.user.id);
          const existing = existingSets.find(s => s.name.toLowerCase() === input.leadSetName!.trim().toLowerCase());
          if (existing) {
            leadSetId = existing.id;
          } else {
            leadSetId = await db.createLeadSet({
              userId: ctx.user.id,
              name: input.leadSetName.trim(),
              description: `Auto-created from CSV import`,
              type: "list",
            });
          }
        }
        
        // Get existing leads for duplicate detection
        const existingLeads = await db.getLeadsByUserId(ctx.user.id);
        
        const createdLeads = [];
        const errors: string[] = [];
        const duplicates: Array<{ row: number; name: string; company: string; email: string }> = [];
        
        for (let i = 0; i < input.leads.length; i++) {
          const leadData = input.leads[i];
          
          console.log(`[CSV Import] Processing lead ${i + 1}: ${leadData.ownerName} at ${leadData.companyName}`);
          
          // Check for duplicates: same company + same contact name
          const isDuplicate = existingLeads.some(existing => 
            existing.companyName.toLowerCase().trim() === leadData.companyName.toLowerCase().trim() &&
            existing.ownerName.toLowerCase().trim() === leadData.ownerName.toLowerCase().trim()
          );
          
          if (isDuplicate) {
            console.log(`[CSV Import] Skipping duplicate: ${leadData.ownerName} at ${leadData.companyName}`);
            duplicates.push({
              row: i + 1,
              name: leadData.ownerName,
              company: leadData.companyName,
              email: leadData.email,
            });
            continue; // Skip this lead
          }
          
          try {
            const result = await db.createLead({
              companyName: leadData.companyName,
              ownerName: leadData.ownerName,
              jobTitle: leadData.jobTitle || undefined,
              email: leadData.email,
              phoneNumber: leadData.phoneNumber,
              secondaryPhone: leadData.secondaryPhone || undefined,
              allEmails: leadData.allEmails || undefined,
              allPhones: leadData.allPhones || undefined,
              website: leadData.website,
              industry: leadData.industry,
              companySize: leadData.companySize || undefined,
              linkedinUrl: leadData.linkedinUrl || undefined,
              instagramUrl: leadData.instagramUrl || undefined,
              facebookUrl: leadData.facebookUrl || undefined,
              city: leadData.city || undefined,
              state: leadData.state || undefined,
              country: leadData.country || undefined,
              userId: ctx.user.id,
              status: "new",
              leadSetId,
              sourceListId: leadSetId || undefined,
            });
            // Update tag if provided
            if (leadData.tag && leadData.tag !== "none" && result) {
              await db.updateLead(Number(result), { tag: leadData.tag });
            }
            createdLeads.push(result);
          } catch (e: any) {
            console.error(`[CSV Import] Error on row ${i + 1}:`, e);
            errors.push(`Row ${i + 1}: ${e.message || "Failed to import"}`);
          }
        }
        
        console.log(`[CSV Import] Completed: ${createdLeads.length} imported, ${duplicates.length} duplicates, ${errors.length} errors`);
        
        // Auto-score engagement for imported leads in background
        const importedIds = createdLeads.filter(Boolean).map(Number);
        if (importedIds.length > 0) {
          setImmediate(async () => {
            try {
              const { scoreLeadsBatch } = await import("./engagementScoring");
              await scoreLeadsBatch(importedIds);
              console.log(`[Engagement] CSV import batch scored ${importedIds.length} leads`);
            } catch (e: any) {
              console.warn(`[Engagement] CSV batch scoring failed:`, e.message);
            }
          });

          // Auto-verification disabled - only verify when user manually clicks "Verify Emails"
          console.log(`[AutoVerify] CSV import auto-verification disabled - user must manually verify emails`);
        }
        return { 
          success: true, 
          imported: createdLeads.length, 
          duplicatesSkipped: duplicates.length,
          duplicates: duplicates,
          errors, 
          leadIds: importedIds 
        };
      }),

    // Overwrite existing lead by email (upsert)
    addManualOverwrite: protectedProcedure
      .input(z.object({
        companyName: z.string().min(1),
        ownerName: z.string().min(1),
        email: z.string().email(),
        phoneNumber: z.string().min(1),
        industry: z.string().optional(),
        companySize: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.upsertLeadByEmail({
          companyName: input.companyName,
          ownerName: input.ownerName,
          email: input.email.toLowerCase(),
          phoneNumber: input.phoneNumber,
          industry: input.industry,
          website: undefined,
          customData: { companySize: input.companySize },
          userId: ctx.user.id,
          status: "new",
        });
      }),

    // CSV Import with overwrite (upsert by email)
    csvImportOverwrite: protectedProcedure
      .input(z.object({
        leads: z.array(z.object({
          companyName: z.string().min(1),
          ownerName: z.string().min(1),
          jobTitle: z.string().optional(),
          email: z.string().min(1),
          phoneNumber: z.string().min(1),
          website: z.string().optional(),
          industry: z.string().optional(),
          linkedinUrl: z.string().optional(),
          instagramUrl: z.string().optional(),
          facebookUrl: z.string().optional(),
          tag: z.enum(["hot", "warm", "cold", "follow_up", "none"]).optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const upsertedLeads = [];
        const errors: string[] = [];
        for (let i = 0; i < input.leads.length; i++) {
          const leadData = input.leads[i];
          try {
            const resultId = await db.upsertLeadByEmail({
              companyName: leadData.companyName,
              ownerName: leadData.ownerName,
              jobTitle: leadData.jobTitle || undefined,
              email: leadData.email.toLowerCase(),
              phoneNumber: leadData.phoneNumber,
              website: leadData.website,
              industry: leadData.industry,
              userId: ctx.user.id,
              status: "new",
            });
            // Update tag if provided
            if (leadData.tag && leadData.tag !== "none" && resultId) {
              await db.updateLead(Number(resultId), { tag: leadData.tag });
            }
            upsertedLeads.push(resultId);
          } catch (e: any) {
            errors.push(`Row ${i + 1}: ${e.message || "Failed to import"}`);
          }
        }
        // Auto-score engagement for overwritten leads in background
        const upsertedIds = upsertedLeads.filter(Boolean).map(Number);
        if (upsertedIds.length > 0) {
          setImmediate(async () => {
            try {
              const { scoreLeadsBatch } = await import("./engagementScoring");
              await scoreLeadsBatch(upsertedIds);
              console.log(`[Engagement] CSV overwrite batch scored ${upsertedIds.length} leads`);
            } catch (e: any) {
              console.warn(`[Engagement] CSV overwrite batch scoring failed:`, e.message);
            }
          });

          // Auto-verify emails via Bouncer in background
          setImmediate(async () => {
            try {
              const settings = await db.getUserSettings(ctx.user.id);
              if (!settings?.bouncerApiKey) {
                console.log(`[AutoVerify] Skipping overwrite batch - no Bouncer API key configured`);
                return;
              }
              const { validateEmail } = await import("./bouncer");
              for (let i = 0; i < upsertedIds.length; i++) {
                try {
                  const lead = await db.getLeadById(upsertedIds[i]);
                  if (!lead || !lead.email) continue;
                  const result = await validateEmail(settings.bouncerApiKey, lead.email);
                  await db.updateLead(upsertedIds[i], {
                    emailVerificationStatus: result.status as any,
                    emailVerificationData: {
                      score: result.score,
                      reason: result.reason,
                      toxic: result.toxic,
                      toxicity: result.toxicity,
                      shouldSend: result.status !== "undeliverable",
                      verifiedAt: new Date().toISOString(),
                    },
                  });
                } catch (e: any) {
                  if (e.message === "BOUNCER_NO_CREDITS") {
                    console.warn(`[AutoVerify] Ran out of Bouncer credits at lead index ${i}`);
                    break;
                  }
                  if (e.message === "BOUNCER_INVALID_API_KEY") {
                    console.warn(`[AutoVerify] Invalid Bouncer API key`);
                    break;
                  }
                  if (e.message === "BOUNCER_RATE_LIMIT") {
                    await new Promise(r => setTimeout(r, 5000));
                    i--;
                    continue;
                  }
                }
                if (i < upsertedIds.length - 1) await new Promise(r => setTimeout(r, 100));
              }
              console.log(`[AutoVerify] CSV overwrite batch verified ${upsertedIds.length} leads`);
            } catch (e: any) {
              console.warn(`[AutoVerify] CSV overwrite batch verification failed:`, e.message);
            }
          });
        }
        return { success: true, imported: upsertedLeads.length, errors };
      }),

    // Update lead tag
    updateTag: protectedProcedure
      .input(z.object({
        leadId: z.number(),
        tag: z.enum(["hot", "warm", "cold", "follow_up", "none"]),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.updateLead(input.leadId, { tag: input.tag });
        return { success: true };
      }),

    // Analyze industry/company problems for a lead
    analyzeProblems: protectedProcedure
      .input(z.object({
        leadId: z.number(),
        additionalContext: z.string().optional(), // Optional extra context about the company
      }))
      .mutation(async ({ input, ctx }) => {
        const lead = await db.getLeadById(input.leadId);
        if (!lead || lead.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        // Check if we already have analysis
        const existing = await db.getLeadWeakPoints(lead.id);
        if (existing && existing.weakPoints) {
          return {
            weakPoints: existing.weakPoints as string[],
            analysis: existing.analysis || "",
            suggestedEmailTypes: existing.suggestedEmailTypes as string[] || [],
            cached: true,
          };
        }

        // Run deep analysis with Claude
        const { generateEmailWithClaude } = await import("./claude");
        const analysisResponse = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a senior business consultant and industry analyst. Your job is to deeply analyze a company and its industry to identify the REAL problems that business owners face daily. Be specific, not generic. Think about operational challenges, market pressures, technology gaps, staffing issues, customer acquisition problems, and competitive threats.

Return a JSON object with:
- "painPoints": array of 5-7 specific, detailed pain points (each 1-2 sentences)
- "industryTrends": array of 3-4 current industry trends creating pressure
- "competitiveThreats": array of 2-3 competitive challenges they face
- "analysis": a 2-3 paragraph detailed analysis of their situation
- "suggestedApproach": which email approach would resonate most ("discovery", "value_prop", "social_proof", "urgency")

Be SPECIFIC to their industry and company size. Avoid generic advice.`,
            },
            {
              role: "user",
              content: `Analyze this company and identify their key business problems:

Company: ${lead.companyName}
Owner: ${lead.ownerName}
Industry: ${lead.industry || "Unknown"}
Website: ${lead.website || "Not provided"}
${input.additionalContext ? `Additional Context: ${input.additionalContext}` : ""}

Identify specific, actionable pain points that a virtual assistant / lead generation / business automation service could help solve.`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "problem_analysis",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  painPoints: { type: "array", items: { type: "string" } },
                  industryTrends: { type: "array", items: { type: "string" } },
                  competitiveThreats: { type: "array", items: { type: "string" } },
                  analysis: { type: "string" },
                  suggestedApproach: { type: "string" },
                },
                required: ["painPoints", "industryTrends", "competitiveThreats", "analysis", "suggestedApproach"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = typeof analysisResponse.choices[0]?.message?.content === 'string'
          ? analysisResponse.choices[0].message.content : "{}";
        const parsed = JSON.parse(content);

        // Save to database
        const allWeakPoints = [
          ...(parsed.painPoints || []),
          ...(parsed.industryTrends || []).map((t: string) => `[Trend] ${t}`),
          ...(parsed.competitiveThreats || []).map((t: string) => `[Competitive] ${t}`),
        ];

        await db.upsertLeadWeakPoints(
          lead.id,
          allWeakPoints,
          parsed.analysis || "",
          [parsed.suggestedApproach || "discovery"]
        );

        return {
          weakPoints: allWeakPoints,
          analysis: parsed.analysis || "",
          painPoints: parsed.painPoints || [],
          industryTrends: parsed.industryTrends || [],
          competitiveThreats: parsed.competitiveThreats || [],
          suggestedApproach: parsed.suggestedApproach || "discovery",
          cached: false,
        };
      }),

    // Get existing problem analysis for a lead
    getProblems: protectedProcedure
      .input(z.number())
      .query(async ({ input: leadId, ctx }) => {
        const lead = await db.getLeadById(leadId);
        if (!lead || lead.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const weakPoints = await db.getLeadWeakPoints(leadId);
        if (!weakPoints) return null;
        return {
          weakPoints: weakPoints.weakPoints as string[],
          analysis: weakPoints.analysis || "",
          suggestedEmailTypes: weakPoints.suggestedEmailTypes as string[] || [],
        };
      }),

    // Get full engagement timeline for a lead
    timeline: protectedProcedure
      .input(z.number())
      .query(async ({ input: leadId, ctx }) => {
        const lead = await db.getLeadById(leadId);
        if (!lead || lead.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const { followUpEmails, followUpCalls, socialOutreach, campaignLeads, emailTrackingEvents } = await import("../drizzle/schema");
        const { eq, desc, inArray } = await import("drizzle-orm");
        const { getDb } = await import("./db");
        const database = (await getDb())!;

        // Get all campaign leads for this lead
        const cLeads = await database.select().from(campaignLeads).where(eq(campaignLeads.leadId, leadId));
        const cLeadIds = cLeads.map(cl => cl.id);

        // Get email tracking events
        const trackingEvents = cLeadIds.length > 0
          ? await database.select().from(emailTrackingEvents).where(
              inArray(emailTrackingEvents.campaignLeadId, cLeadIds)
            ).orderBy(desc(emailTrackingEvents.createdAt))
          : [];

        // Get follow-up emails
        const fEmails = cLeadIds.length > 0
          ? await database.select().from(followUpEmails).where(
              inArray(followUpEmails.campaignLeadId, cLeadIds)
            ).orderBy(desc(followUpEmails.createdAt))
          : [];

        // Get follow-up calls
        const fCalls = cLeadIds.length > 0
          ? await database.select().from(followUpCalls).where(
              inArray(followUpCalls.campaignLeadId, cLeadIds)
            ).orderBy(desc(followUpCalls.createdAt))
          : [];

        // Get social outreach
        const socialMessages = await database.select().from(socialOutreach).where(eq(socialOutreach.leadId, leadId)).orderBy(desc(socialOutreach.createdAt));

        // Build unified timeline
        const timeline: Array<{ type: string; date: string; title: string; detail: string; status: string }> = [];

        // Initial emails sent
        for (const cl of cLeads) {
          if (cl.emailSent) {
            timeline.push({
              type: "email_sent",
              date: cl.emailSentAt ? new Date(cl.emailSentAt).toISOString() : new Date(cl.createdAt!).toISOString(),
              title: "Initial Email Sent",
              detail: `Campaign email sent`,
              status: cl.emailOpened ? "opened" : cl.emailClicked ? "clicked" : "sent",
            });
          }
          if (cl.emailOpened && cl.emailOpenedAt) {
            timeline.push({
              type: "email_opened",
              date: new Date(cl.emailOpenedAt).toISOString(),
              title: "Email Opened",
              detail: "Recipient opened the initial email",
              status: "open",
            });
          }
          if (cl.emailClicked && cl.emailClickedAt) {
            timeline.push({
              type: "email_clicked",
              date: new Date(cl.emailClickedAt).toISOString(),
              title: "Link Clicked",
              detail: "Recipient clicked a link in the email",
              status: "click",
            });
          }
        }

        // Email tracking events (opens, clicks)
        for (const ev of trackingEvents) {
          timeline.push({
            type: ev.eventType === "open" ? "email_opened" : "email_clicked",
            date: new Date(ev.createdAt!).toISOString(),
            title: ev.eventType === "open" ? "Email Opened" : "Link Clicked",
            detail: ev.eventType === "click" ? `Clicked: ${ev.clickUrl || "CTA link"}` : "Recipient opened the email",
            status: ev.eventType,
          });
        }

        // Follow-up emails
        for (const fe of fEmails) {
          timeline.push({
            type: "followup_email",
            date: fe.sentAt ? new Date(fe.sentAt).toISOString() : new Date(fe.createdAt!).toISOString(),
            title: `Follow-up Email #${fe.sequenceNumber}`,
            detail: fe.subject || "Follow-up email",
            status: fe.status,
          });
        }

        // Follow-up calls
        for (const fc of fCalls) {
          timeline.push({
            type: "call",
            date: fc.initiatedAt ? new Date(fc.initiatedAt).toISOString() : new Date(fc.createdAt!).toISOString(),
            title: `Call Attempt #${fc.attemptNumber}`,
            detail: fc.status || "Scheduled",
            status: fc.status,
          });
        }

        // Social outreach
        for (const so of socialMessages) {
          timeline.push({
            type: "social_outreach",
            date: so.sentAt ? new Date(so.sentAt).toISOString() : new Date(so.createdAt!).toISOString(),
            title: `${so.platform} ${so.messageType === "connection_request" ? "Connection Request" : "Message"}`,
            detail: so.message?.slice(0, 100) || "",
            status: so.status,
          });
        }

        // Sort by date descending
        timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return {
          lead,
          timeline,
          stats: {
            emailsSent: cLeads.filter(cl => cl.emailSent).length,
            emailsOpened: cLeads.filter(cl => cl.emailOpened).length,
            emailsClicked: cLeads.filter(cl => cl.emailClicked).length,
            followUpsSent: fEmails.filter(fe => fe.status === "sent").length,
            followUpsPending: fEmails.filter(fe => fe.status === "draft" || fe.status === "scheduled").length,
            callsMade: fCalls.filter(fc => fc.status === "completed").length,
            callsPending: fCalls.filter(fc => fc.status === "scheduled" || fc.status === "initiated").length,
            socialSent: socialMessages.filter(s => s.status === "sent").length,
            socialPending: socialMessages.filter(s => s.status === "sent" || s.status === "failed").length === 0 ? socialMessages.length : 0,
          },
        };
      }),

    // Score engagement for a single lead
    scoreEngagement: protectedProcedure
      .input(z.number())
      .mutation(async ({ input: leadId, ctx }) => {
        const lead = await db.getLeadById(leadId);
        if (!lead || lead.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const { scoreLeadEngagement } = await import("./engagementScoring");
        const result = await scoreLeadEngagement(leadId);
        return result;
      }),

    // Score engagement for multiple leads (batch)
    scoreEngagementBatch: protectedProcedure
      .input(z.object({
        leadIds: z.array(z.number()),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verify all leads belong to user
        const userLeads = await db.getLeadsByUserId(ctx.user.id);
        const userLeadIds = new Set(userLeads.map(l => l.id));
        const validIds = input.leadIds.filter(id => userLeadIds.has(id));
        
        if (validIds.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No valid leads to score" });
        }

        // Run scoring in background (non-blocking) — return immediately
        const { scoreLeadsBatch } = await import("./engagementScoring");
        setImmediate(async () => {
          try {
            await scoreLeadsBatch(validIds);
            console.log(`[Engagement] Background batch scoring completed for ${validIds.length} leads`);
          } catch (error: any) {
            console.error(`[Engagement] Background batch scoring failed:`, error.message);
          }
        });

        // Return immediately without waiting
        return { 
          message: `Scoring ${validIds.length} leads in background...`, 
          total: validIds.length,
          status: "started"
        };
      }),

  }),

  // Campaigns router
  campaigns: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getCampaignsByUserId(ctx.user.id);
    }),

    get: protectedProcedure.input(z.number()).query(async ({ input: campaignId, ctx }) => {
      const campaign = await db.getCampaignById(campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return campaign;
    }),

    replies: protectedProcedure.input(z.number()).query(async ({ input: campaignId, ctx }) => {
      const campaign = await db.getCampaignById(campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const replies = await db.getRepliesByCampaignId(campaignId, ctx.user.id);
      // Enrich with lead info
      const enriched = await Promise.all(replies.map(async (reply) => {
        let leadName = reply.fromEmail;
        let companyName = "";
        if (reply.leadId) {
          const lead = await db.getLeadById(reply.leadId);
          if (lead) {
            leadName = lead.ownerName || reply.fromEmail;
            companyName = lead.companyName || "";
          }
        }
        return { ...reply, leadName, companyName };
      }));
      return enriched;
    }),

    create: protectedProcedure
      .input(createCampaignSchema)
      .mutation(async ({ input, ctx }) => {
        // Create campaign
        const campaignId = await db.createCampaign({
          userId: ctx.user.id,
          name: input.name,
          description: input.description,
          subject: input.subject,
          emailTemplate: input.emailTemplate,
          templateId: input.templateId || null,
          status: input.scheduledAt ? "draft" : "draft",
          totalLeads: input.leadIds.length,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt).toISOString() : null,
          dailySendLimit: input.dailySendLimit || null,
        });

        // Add leads to campaign
        if (input.leadIds.length > 0 && campaignId) {
          await db.addLeadsToCampaign(campaignId, input.leadIds);
        }

        // If scheduled, create a heartbeat cron job to auto-launch at the scheduled time
        if (input.scheduledAt && campaignId) {
          try {
            const { parse: parseCookie } = await import("cookie");
            const { COOKIE_NAME } = await import("@shared/const");
            const { createHeartbeatJob } = await import("./_core/heartbeat");
            const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
            const scheduledDate = new Date(input.scheduledAt);
            // Create a one-time cron that fires at the scheduled time (6-field: sec min hour dom mon dow)
            const cronExpression = `0 ${scheduledDate.getUTCMinutes()} ${scheduledDate.getUTCHours()} ${scheduledDate.getUTCDate()} ${scheduledDate.getUTCMonth() + 1} *`;
            const job = await createHeartbeatJob({
              name: `campaign-launch-${campaignId}`,
              cron: cronExpression,
              path: "/api/scheduled/launch-campaign",
              payload: { campaignId },
              description: `Scheduled launch for campaign: ${input.name}`,
            }, sessionToken);
            // Save the task UID on the campaign
            await db.updateCampaign(campaignId, { scheduleCronTaskUid: job.taskUid } as any);
          } catch (err: any) {
            console.error("[Campaign Schedule] Failed to create heartbeat job:", err.message);
            // Campaign is still created, just won't auto-launch
          }
        }

        return { success: true, campaignId, scheduled: !!input.scheduledAt };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({
          name: z.string().optional(),
          description: z.string().optional(),
          subject: z.string().optional(),
          emailTemplate: z.string().optional(),
          status: z.enum(["draft", "active", "paused", "completed"]).optional(),
        }),
      }))
      .mutation(async ({ input, ctx }) => {
        const campaign = await db.getCampaignById(input.id);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return db.updateCampaign(input.id, input.data);
      }),

    // Assign leads to an existing campaign (from leads page)
    assignLeads: protectedProcedure
      .input(z.object({
        campaignId: z.number(),
        leadIds: z.array(z.number()),
      }))
      .mutation(async ({ input, ctx }) => {
        const campaign = await db.getCampaignById(input.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
        }
        // Get existing campaign leads to avoid duplicates
        const existingCLs = await db.getCampaignLeads(input.campaignId);
        const existingLeadIds = new Set(existingCLs.map(cl => cl.leadId));
        const newLeadIds = input.leadIds.filter(id => !existingLeadIds.has(id));
        if (newLeadIds.length === 0) {
          return { added: 0, skipped: input.leadIds.length, message: "All selected leads are already in this campaign" };
        }
        await db.addLeadsToCampaign(input.campaignId, newLeadIds);
        // Update totalLeads count
        await db.updateCampaign(input.campaignId, { totalLeads: (campaign.totalLeads || 0) + newLeadIds.length });
        return { added: newLeadIds.length, skipped: input.leadIds.length - newLeadIds.length };
      }),

    // Cancel a scheduled campaign launch
    cancelSchedule: protectedProcedure
      .input(z.number())
      .mutation(async ({ input: campaignId, ctx }) => {
        const campaign = await db.getCampaignById(campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        if (!campaign.scheduledAt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Campaign is not scheduled" });
        }
        // Cancel the heartbeat cron job if it exists
        if ((campaign as any).scheduleCronTaskUid) {
          try {
            const { deleteHeartbeatJob } = await import("./_core/heartbeat");
            const { parse: parseCookie } = await import("cookie");
            const { COOKIE_NAME } = await import("@shared/const");
            const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
            await deleteHeartbeatJob((campaign as any).scheduleCronTaskUid, sessionToken);
          } catch (e) {
            console.warn("Failed to delete heartbeat job:", e);
          }
        }
        // Clear the scheduled time and keep as draft
        await db.updateCampaign(campaignId, { scheduledAt: null, scheduleCronTaskUid: null } as any);
        return { success: true };
      }),

    // Launch campaign - send emails to all leads
    launch: protectedProcedure
      .input(z.number())
      .mutation(async ({ input: campaignId, ctx }) => {
        const campaign = await db.getCampaignById(campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        // Get user settings for SMTP
        const settings = await db.getUserSettings(ctx.user.id);
        if (!settings?.smtpHost || !settings?.smtpPassword || !settings?.senderEmail) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Please configure SMTP settings first (host, password, and sender email are required). Go to Settings > Email / SMTP.",
          });
        }

        // Run deliverability checks before sending
        const { runDeliverabilityChecks } = await import("./deliverabilityChecks");
        const deliverabilityResult = await runDeliverabilityChecks({
          senderEmail: settings.senderEmail,
          senderName: settings.senderName || "",
          subject: campaign.subject || campaign.name,
          body: campaign.emailTemplate || "",
          smtpHost: settings.smtpHost,
        });
        if (!deliverabilityResult.allPassed) {
          const failedChecks = deliverabilityResult.checks.filter(c => c.status === "fail");
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Email deliverability checks failed: ${failedChecks.map(c => c.message).join("; ")}. Fix these issues in Settings before launching.`,
          });
        }

        // Using Nitin's hardcoded signature

        // Get campaign leads
        const campaignLeads = await db.getCampaignLeads(campaignId);
        if (campaignLeads.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No leads assigned to this campaign. Add leads before launching.",
          });
        }

        // Validate recipient emails (MX record check) before sending
        const { validateEmails } = await import("./emailValidation");
        const leadsForValidation = await Promise.all(
          campaignLeads.map(async (cl) => {
            const lead = await db.getLeadById(cl.leadId);
            return { campaignLeadId: cl.id, email: lead?.email || "", lead };
          })
        );
        const emailsToValidate = leadsForValidation.map(l => l.email).filter(Boolean);
        const validationResults = await validateEmails(emailsToValidate);
        const invalidEmails = new Set(
          validationResults.filter(r => !r.valid).map(r => r.email)
        );
        if (invalidEmails.size > 0) {
          console.log(`[Campaign ${campaignId}] Skipping ${invalidEmails.size} invalid emails (no MX records):`, Array.from(invalidEmails).join(", "));
        }

        let sentCount = 0;
        let skippedInvalid = 0;
        let skippedUndeliverable = 0;
        let skippedUnsubscribed = 0;
        const successfullySentCampaignLeadIds = new Set<number>();

        // Auto-block: collect leads with Bouncer "undeliverable" status
        const undeliverableLeadIds = new Set<number>();
        for (const cl of campaignLeads) {
          const lead = await db.getLeadById(cl.leadId);
          if (lead && lead.emailVerificationStatus === "undeliverable") {
            undeliverableLeadIds.add(lead.id);
          }
        }
        if (undeliverableLeadIds.size > 0) {
          console.log(`[Campaign ${campaignId}] Auto-blocking ${undeliverableLeadIds.size} leads with undeliverable emails`);
        }

        // Determine how many to send today based on dailySendLimit
        const dailyLimit = (campaign as any).dailySendLimit || null;
        const unsent = campaignLeads.filter(cl => !cl.emailSent && !(cl as any).unsubscribed);
        const toSendToday = dailyLimit ? unsent.slice(0, dailyLimit) : unsent;
        const remaining = dailyLimit ? unsent.length - toSendToday.length : 0;

        console.log(`[Campaign ${campaignId}] Daily limit: ${dailyLimit || 'unlimited'}, Unsent: ${unsent.length}, Sending today: ${toSendToday.length}, Remaining for future days: ${remaining}`);

        // Send emails (only today's batch)
        for (const campaignLead of toSendToday) {
          try {
            const lead = await db.getLeadById(campaignLead.leadId);
            if (!lead) continue;

            // Skip leads who have globally unsubscribed (from this or any other campaign)
            if ((lead as any).unsubscribed) {
              skippedUnsubscribed++;
              console.log(`[Campaign ${campaignId}] Skipped unsubscribed lead: ${lead.email}`);
              continue;
            }

            // Skip leads with invalid emails
            if (invalidEmails.has(lead.email.toLowerCase())) {
              skippedInvalid++;
              console.log(`[Campaign ${campaignId}] Skipped invalid email: ${lead.email}`);
              continue;
            }

            // Auto-block: skip leads with Bouncer "undeliverable" verification status
            if (undeliverableLeadIds.has(lead.id)) {
              skippedUndeliverable++;
              console.log(`[Campaign ${campaignId}] Auto-blocked undeliverable email: ${lead.email}`);
              continue;
            }

            // Generate personalized email
            const personalizedTemplate = campaign.emailTemplate
              .replace(/{{companyName}}/g, lead.companyName)
              .replace(/{{ownerName}}/g, lead.ownerName)
              .replace(/{{email}}/g, lead.email)
              .replace(/{{industry}}/g, lead.industry || 'your industry')
              .replace(/{{phoneNumber}}/g, lead.phoneNumber || '');

            // Create tracking pixel
            const trackingToken = nanoid();
            await db.createEmailTrackingEvent({
              campaignLeadId: campaignLead.id,
              eventType: "open",
              trackingToken,
            });

            // Create click tracking token for CTA link
            const clickTrackingToken = nanoid();
            await db.createEmailTrackingEvent({
              campaignLeadId: campaignLead.id,
              eventType: "click",
              trackingToken: clickTrackingToken,
            });

            // Determine the base URL for tracking (respect x-forwarded-proto behind reverse proxy)
            const baseUrl = ctx.req.headers?.['x-forwarded-proto']
              ? `${ctx.req.headers['x-forwarded-proto']}://${ctx.req.headers['x-forwarded-host'] || ctx.req.get?.('host') || 'localhost:3000'}`
              : `${ctx.req.protocol || 'https'}://${ctx.req.get?.('host') || 'localhost:3000'}`;
            const trackingPixel = `<img src="${baseUrl}/api/track/pixel/${trackingToken}" width="1" height="1" alt="" style="display:none" />`;
            
            // Replace CTA links with tracked versions (use dynamic CTA from settings)
            const userSettings = await db.getUserSettings(ctx.user.id);
            const ctaUrl = userSettings?.ctaLink || 'https://cal.com/nitin-virtualassistant-group.com/30min';
            const trackedCtaUrl = `${baseUrl}/api/track/click/${clickTrackingToken}?url=${encodeURIComponent(ctaUrl)}`;
            let emailBody = personalizedTemplate
              .replace(/{{bookingUrl}}/g, trackedCtaUrl)
              .replace(/{{ctaLink}}/g, trackedCtaUrl)
              .replace(/https:\/\/cal\.com\/nitin-virtualassistant-group\.com\/30min/g, trackedCtaUrl);

            // Also wrap any other raw URLs that weren't caught by the specific patterns above
            emailBody = emailBody.replace(
              /(https?:\/\/[^\s<>"']+)/g,
              (rawUrl) => {
                // Don't double-wrap already-tracked URLs
                if (rawUrl.includes('/api/track/click/')) return rawUrl;
                return `${baseUrl}/api/track/click/${clickTrackingToken}?url=${encodeURIComponent(rawUrl)}`;
              }
            );
            // Also wrap any existing href="..." links (for HTML templates)
            emailBody = emailBody.replace(
              /href=["'](https?:\/\/[^"']*)["']/g,
              (match, url) => {
                if (url.includes('/api/track/click/')) return match;
                return `href="${baseUrl}/api/track/click/${clickTrackingToken}?url=${encodeURIComponent(url)}"`;
              }
            );

            // Convert plain text to HTML, append the user's configured signature
            // (Claude is explicitly instructed not to add its own sign-off -- see
            // server/claude.ts -- so this is the only place one gets added) and the
            // tracking pixel.
            const signature = await db.getEmailSignature(ctx.user.id);
            emailBody = plainTextToHtml(emailBody) + getSignatureHtml(signature) + trackingPixel;

            // Add unsubscribe link (replaces the plain text unsubscribe placeholder with a proper tracked link)
            const unsubscribeUrl = `${baseUrl}/api/track/unsubscribe/${trackingToken}`;
            emailBody = emailBody.replace(
              /---<br\/?>[\s\S]*?unsubscribe[\s\S]*?$/i,
              `<br/><p style="font-size:11px;color:#999;text-align:center;margin-top:24px;"><a href="${unsubscribeUrl}" style="color:#999;text-decoration:underline;">Unsubscribe</a> from future emails</p>`
            );
            // If no placeholder was found, append the unsubscribe link
            if (!emailBody.includes(unsubscribeUrl)) {
              emailBody += `<br/><p style="font-size:11px;color:#999;text-align:center;margin-top:24px;"><a href="${unsubscribeUrl}" style="color:#999;text-decoration:underline;">Unsubscribe</a> from future emails</p>`;
            }

            // Get rotational email for today (Mon=1, Tue=2, etc.)
            const todayDow = new Date().getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
            const mappedDow = todayDow === 0 ? 5 : todayDow > 5 ? 5 : todayDow; // Map weekends to Friday
            let rotationalEmail = await db.getRotationalEmailForDay(ctx.user.id, mappedDow);

            // If no rotational email for today, try to find any active one (round-robin by lead index)
            if (!rotationalEmail) {
              const allRotational = await db.getRotationalEmailsByUser(ctx.user.id);
              const activeRotational = allRotational.filter(r => r.isActive);
              if (activeRotational.length > 0) {
                const index = sentCount % activeRotational.length;
                rotationalEmail = activeRotational[index];
              }
            }

            console.log(`[Campaign Launch] Day=${mappedDow}, UserId=${ctx.user.id}, RotationalEmail=${rotationalEmail?.email || 'NONE (using primary)'}, Lead=${lead.email}`);

            // Use rotational email SMTP if available, otherwise fall back to settings
            const smtpConfig = rotationalEmail ? {
              host: rotationalEmail.smtpHost,
              port: rotationalEmail.smtpPort,
              secure: rotationalEmail.smtpPort === 465,
              auth: { user: rotationalEmail.smtpUsername, pass: rotationalEmail.smtpPassword },
            } : {
              host: settings.smtpHost || '',
              port: settings.smtpPort || 587,
              secure: (settings.smtpPort || 587) === 465,
              auth: { user: settings.smtpUsername || '', pass: settings.smtpPassword || '' },
            };
            const senderEmail = rotationalEmail ? rotationalEmail.email : settings.senderEmail;
            const senderDisplayName = rotationalEmail ? (rotationalEmail.senderName || settings.senderName || 'Lead Gen') : (settings.senderName || 'Lead Gen');

            // Send email via SMTP
            const transporter = nodemailer.createTransport(smtpConfig as any);
            const campaignReplyTo = settings.replyToEmail || "nitin@virtualassistant-group.com";

            const sendResult = await transporter.sendMail({
              from: `"${senderDisplayName}" <${senderEmail}>`,
              to: lead.email,
              replyTo: campaignReplyTo,
              subject: campaign.subject,
              html: emailBody,
              headers: {
                'List-Unsubscribe': `<${unsubscribeUrl}>`,
              },
            });

            // Update campaign lead status with sender info and message ID
            await db.updateCampaignLead(campaignLead.id, {
              emailSent: 1 as any,
              emailSentAt: new Date().toISOString(),
              senderEmail: senderEmail || null,
              messageId: sendResult.messageId || null,
              threadId: sendResult.messageId || null,
            });

            sentCount++;
            successfullySentCampaignLeadIds.add(campaignLead.id);
          } catch (error: any) {
            console.error(`[Campaign Launch] Failed to send email to campaignLead ${campaignLead.id}:`, error?.message, error?.code);
            // If it's an auth error, throw immediately to stop the campaign
            if (error?.code === 'EAUTH') {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: `SMTP authentication failed. Please check your SMTP username and password in Settings. Error: ${error.message}`,
              });
            }
          }
        }

        // Update campaign status based on results. Don't treat a batch that was
        // entirely skipped for legitimate reasons (invalid/undeliverable/unsubscribed)
        // as an SMTP failure -- only leads that were actually attempted and failed count.
        const totalSkipped = skippedInvalid + skippedUndeliverable + skippedUnsubscribed;
        if (sentCount === 0 && toSendToday.length > 0 && totalSkipped < toSendToday.length) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to send any emails. Please check your SMTP settings (host, port, username, password) and try again.",
          });
        }

        await db.updateCampaign(campaignId, {
          status: remaining > 0 ? "active" : "active",
          launchedAt: new Date().toISOString(),
          sentCount: (campaign.sentCount || 0) + sentCount,
        });

        // If there are remaining leads and a daily limit is set, schedule a daily cron to continue sending
        if (remaining > 0 && dailyLimit) {
          try {
            const { parse: parseCookie } = await import("cookie");
            const { COOKIE_NAME } = await import("@shared/const");
            const { createHeartbeatJob } = await import("./_core/heartbeat");
            const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
            // Schedule daily at 9:00 AM UTC (adjustable)
            const cronExpression = "0 0 9 * * *";
            const job = await createHeartbeatJob({
              name: `campaign-daily-send-${campaignId}`,
              cron: cronExpression,
              path: "/api/scheduled/daily-campaign-send",
              payload: { campaignId },
              description: `Daily drip send for campaign: ${campaign.name} (${dailyLimit}/day)`,
            }, sessionToken);
            await db.updateCampaign(campaignId, { dailySendCronTaskUid: job.taskUid } as any);
            console.log(`[Campaign ${campaignId}] Daily send cron created: ${job.taskUid}, sending ${dailyLimit}/day`);
          } catch (err: any) {
            console.error(`[Campaign ${campaignId}] Failed to create daily send cron:`, err.message);
            // Campaign still launched, just won't auto-continue
          }
        }

        // Schedule 7 follow-up emails + the fallback follow-up call cadence for each
        // lead that was sent today (async, don't block)
        const { scheduleFollowUpEmails, scheduleFollowUpCalls } = await import("./_core/followUpScheduler");
        const followUpSettings = await db.getUserSettings(ctx.user.id);
        const ctaLink = followUpSettings?.ctaLink || "https://cal.com/nitin-virtualassistant-group.com/30min";
        for (const campaignLead of toSendToday) {
          if (!successfullySentCampaignLeadIds.has(campaignLead.id)) continue; // Only schedule follow-ups for actually sent emails
          const leadForFollowUp = await db.getLeadById(campaignLead.leadId);
          if (leadForFollowUp) {
            scheduleFollowUpEmails(
              campaignLead.id,
              leadForFollowUp.id,
              leadForFollowUp.email,
              leadForFollowUp.phoneNumber || '',
              leadForFollowUp.ownerName,
              leadForFollowUp.companyName,
              leadForFollowUp.industry || 'business services',
              ctaLink,
              ctx.user.id
            ).catch((err: any) => {
              console.error(`[CampaignLaunch] Failed to schedule follow-ups for lead ${leadForFollowUp.id}:`, err);
            });

            // Without this, a lead who never opens/clicks any email would never get a
            // fallback call at all — the open/click-triggered call is the only other
            // call path in the app.
            if (leadForFollowUp.phoneNumber) {
              scheduleFollowUpCalls(campaignLead.id, leadForFollowUp.phoneNumber).catch((err: any) => {
                console.error(`[CampaignLaunch] Failed to schedule follow-up calls for lead ${leadForFollowUp.id}:`, err);
              });
            }
          }
        }

        return { success: true, sentCount, remaining, dailyLimit, skippedUndeliverable, skippedUnsubscribed };
      }),

    // Pause campaign
    pause: protectedProcedure
      .input(z.number())
      .mutation(async ({ input: campaignId, ctx }) => {
        const campaign = await db.getCampaignById(campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return db.updateCampaign(campaignId, { status: "paused" });
      }),

    // Delete campaign
    // Validate emails for a campaign before sending
    validateEmails: protectedProcedure
      .input(z.object({
        campaignId: z.number().optional(),
        leadIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { validateEmails: validateEmailsFn } = await import("./emailValidation");
        let emails: Array<{ leadId: number; email: string; name: string }> = [];

        if (input.campaignId) {
          // Validate all leads in a campaign
          const campaign = await db.getCampaignById(input.campaignId);
          if (!campaign || campaign.userId !== ctx.user.id) {
            throw new TRPCError({ code: "NOT_FOUND" });
          }
          const campaignLeads = await db.getCampaignLeads(input.campaignId);
          for (const cl of campaignLeads) {
            const lead = await db.getLeadById(cl.leadId);
            if (lead) {
              emails.push({ leadId: lead.id, email: lead.email, name: lead.ownerName });
            }
          }
        } else if (input.leadIds?.length) {
          // Validate specific leads (for single email composer)
          for (const leadId of input.leadIds) {
            const lead = await db.getLeadById(leadId);
            if (lead && lead.userId === ctx.user.id) {
              emails.push({ leadId: lead.id, email: lead.email, name: lead.ownerName });
            }
          }
        } else {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Provide campaignId or leadIds" });
        }

        const emailAddresses = emails.map(e => e.email);
        const results = await validateEmailsFn(emailAddresses);

        const validationMap = new Map(results.map(r => [r.email, r]));
        const detailed = emails.map(e => {
          const result = validationMap.get(e.email.toLowerCase()) || validationMap.get(e.email);
          return {
            leadId: e.leadId,
            name: e.name,
            email: e.email,
            valid: result?.valid ?? false,
            reason: result?.reason || "Unknown",
          };
        });

        const validCount = detailed.filter(d => d.valid).length;
        const invalidCount = detailed.filter(d => !d.valid).length;

        return {
          total: detailed.length,
          validCount,
          invalidCount,
          results: detailed,
        };
      }),

    delete: protectedProcedure
      .input(z.number())
      .mutation(async ({ input: campaignId, ctx }) => {
        const campaign = await db.getCampaignById(campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await db.deleteCampaign(campaignId);
        return { success: true };
      }),

    // Get activity feed for campaign
    activity: protectedProcedure
      .input(z.number())
      .query(async ({ input: campaignId, ctx }) => {
        const campaign = await db.getCampaignById(campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        const campaignLeads = await db.getCampaignLeads(campaignId);
        const activities = [];

        for (const cl of campaignLeads) {
          const lead = await db.getLeadById(cl.leadId);
          if (!lead) continue;

          // Get tracking events for this campaign lead (to find clicked URLs)
          const trackingEvents = await db.getEmailTrackingEventsByCampaignLead(cl.id);
          const clickEvents = trackingEvents.filter(e => e.eventType === 'click' && e.clickUrl);
          const clickedUrls = clickEvents.map(e => e.clickUrl).filter(Boolean);

          // Get call logs for this campaign lead
          const callLogs = await db.getCallLogsByCampaignLead(cl.id);
          const latestCall = callLogs.length > 0 ? callLogs[callLogs.length - 1] : null;

          // Get follow-up emails schedule (next 7)
          const followUpEmails = await db.getFollowUpEmailsByCampaignLead(cl.id);
          const pendingFollowUpEmails = followUpEmails
            .filter((e: any) => e.status === 'scheduled' || e.status === 'pending')
            .sort((a: any, b: any) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
            .slice(0, 7)
            .map((e: any) => ({
              sequenceNumber: e.sequenceNumber,
              emailType: e.emailType,
              subject: e.subject,
              scheduledFor: e.scheduledFor,
              status: e.status,
            }));

          // Get follow-up calls schedule (next 7)
          const followUpCalls = await db.getFollowUpCallsByCampaignLead(cl.id);
          const pendingFollowUpCalls = followUpCalls
            .filter((c: any) => c.status === 'scheduled' || c.status === 'pending')
            .sort((a: any, b: any) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
            .slice(0, 7)
            .map((c: any) => ({
              attemptNumber: c.attemptNumber,
              phoneNumber: c.phoneNumber,
              scheduledFor: c.scheduledFor,
              status: c.status,
            }));

          activities.push({
            campaignLeadId: cl.id,
            leadName: lead.ownerName,
            companyName: lead.companyName,
            email: lead.email,
            phoneNumber: lead.phoneNumber,
            industry: lead.industry || null,
            emailSent: cl.emailSent,
            emailSentAt: cl.emailSentAt,
            emailOpened: cl.emailOpened,
            emailOpenedAt: cl.emailOpenedAt,
            emailClicked: cl.emailClicked,
            emailClickedAt: cl.emailClickedAt,
            clickedUrls,
            callTriggered: cl.callTriggered,
            callTriggeredAt: cl.callTriggeredAt,
            callStatus: latestCall?.status || null,
            callId: latestCall?.retellCallId || null,
            totalCalls: callLogs.length,
            replied: (cl as any).replied || false,
            repliedAt: (cl as any).repliedAt || null,
            responseStatus: (cl as any).responseStatus || null,
            unsubscribed: (cl as any).unsubscribed || false,
            unsubscribedAt: (cl as any).unsubscribedAt || null,
            nextFollowUpEmails: pendingFollowUpEmails,
            nextFollowUpCalls: pendingFollowUpCalls,
          });
        }

        return activities;
      }),
  }),

  // Settings router
  settings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const settings = await db.getUserSettings(ctx.user.id);
      if (!settings) {
          return {
          userId: ctx.user.id,
          retellApiKey: "",
          retellAgentId: "",
          senderPhoneNumber: "",
          smtpHost: "",
          smtpPort: 587,
          smtpUsername: "",
          smtpPassword: "",
          senderEmail: "",
          senderName: "",
          hasSmtpPassword: false,
          hasRetellApiKey: false,
          hasCalcomWebhookSecret: false,
          ctaLink: "https://cal.com/nitin-virtualassistant-group.com/30min",
          hasRetellWebhookSecret: false,
          linkedinUrl: "",
          linkedinType: "personal" as const,
          instagramUrl: "",
          instagramType: "personal" as const,
          facebookUrl: "",
          facebookType: "personal" as const,
          socialDailyLimit: 20,
          socialMessageCharLimit: 300,
          socialDailyLimits: db.DEFAULT_SOCIAL_DAILY_LIMITS,
          socialNotificationEmail: "",
          replyToEmail: "",
          notificationEmail: "",
          hasClaudeApiKey: false,
          imapHost: "imap.gmail.com",
          imapPort: 993,
          imapUsername: "",
          hasImapPassword: false,
          imapLastSyncedAt: null,
        };
      }
      // Don't return sensitive data to frontend
      return {
        userId: settings.userId,
        retellAgentId: settings.retellAgentId,
        senderPhoneNumber: settings.senderPhoneNumber,
        smtpHost: settings.smtpHost,
        smtpPort: settings.smtpPort,
        smtpUsername: settings.smtpUsername,
        senderEmail: settings.senderEmail,
        senderName: settings.senderName,
        hasSmtpPassword: !!settings.smtpPassword,
        hasRetellApiKey: !!settings.retellApiKey,
        hasCalcomWebhookSecret: !!settings.calcomWebhookSecret,
        ctaLink: settings.ctaLink || 'https://cal.com/nitin-virtualassistant-group.com/30min',
        hasRetellWebhookSecret: !!settings.retellWebhookSecret,
        linkedinUrl: settings.linkedinUrl || "",
        linkedinType: settings.linkedinType || "personal",
        instagramUrl: settings.instagramUrl || "",
        instagramType: settings.instagramType || "personal",
        facebookUrl: settings.facebookUrl || "",
        facebookType: settings.facebookType || "personal",
        socialDailyLimit: settings.socialDailyLimit || 20,
        socialMessageCharLimit: settings.socialMessageCharLimit || 300,
        socialDailyLimits: {
          linkedin: { connection_request: db.getSocialDailyLimit(settings, "linkedin", "connection_request"), direct_message: db.getSocialDailyLimit(settings, "linkedin", "direct_message") },
          instagram: { connection_request: db.getSocialDailyLimit(settings, "instagram", "connection_request"), direct_message: db.getSocialDailyLimit(settings, "instagram", "direct_message") },
          facebook: { connection_request: db.getSocialDailyLimit(settings, "facebook", "connection_request"), direct_message: db.getSocialDailyLimit(settings, "facebook", "direct_message") },
        },
        socialNotificationEmail: settings.socialNotificationEmail || "",
        replyToEmail: settings.replyToEmail || "",
        notificationEmail: settings.notificationEmail || "",
        hasClaudeApiKey: !!settings.claudeApiKey,
        imapHost: (settings as any).imapHost || "imap.gmail.com",
        imapPort: (settings as any).imapPort || 993,
        imapUsername: (settings as any).imapUsername || "",
        hasImapPassword: !!(settings as any).imapPassword,
        imapLastSyncedAt: (settings as any).imapLastSyncedAt || null,
      };
    }),

    update: protectedProcedure
      .input(updateUserSettingsSchema)
      .mutation(async ({ input, ctx }) => {
        // Only include fields that were explicitly provided (not undefined)
        // and don't overwrite sensitive fields with empty strings
        const cleanedInput: Record<string, any> = {};
        for (const [key, value] of Object.entries(input)) {
          if (value === undefined) continue; // skip fields not sent by the frontend
          // Don't overwrite sensitive fields with empty strings
          if (key === 'smtpPassword' && !value) continue;
          if (key === 'retellApiKey' && !value) continue;
          if (key === 'calcomWebhookSecret' && !value) continue;
          if (key === 'retellWebhookSecret' && !value) continue;
          if (key === 'seamlessApiKey' && !value) continue;
          if (key === 'claudeApiKey' && !value) continue;
          if (key === 'imapPassword' && !value) continue;
          cleanedInput[key] = value;
        }
        
        await db.upsertUserSettings({
          userId: ctx.user.id,
          ...cleanedInput,
        });
        return { success: true };
      }),

    testClaudeConnection: protectedProcedure
      .input(z.object({ apiKey: z.string().min(1) }))
      .mutation(async ({ input }) => {
        try {
          const Anthropic = (await import("@anthropic-ai/sdk")).default;
          const client = new Anthropic({ apiKey: input.apiKey });
          const response = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 10,
            messages: [{ role: "user", content: "Say 'connected' in one word." }],
          });
          const textBlock = response.content.find((b: any) => b.type === "text");
          return { success: true, message: "Connection successful! Claude is responding." };
        } catch (error: any) {
          if (error?.status === 401) {
            return { success: false, message: "Invalid API key. Please check your key and try again." };
          }
          if (error?.status === 403) {
            return { success: false, message: "API key does not have permission. Check your Anthropic account." };
          }
          if (error?.status === 429) {
            return { success: false, message: "Rate limited. The key is valid but you've hit usage limits." };
          }
          return { success: false, message: error?.message || "Failed to connect to Claude API." };
        }
      }),

    getClaudeUsage: protectedProcedure.query(async ({ ctx }) => {
      return await db.getClaudeApiUsageThisMonth(ctx.user.id);
    }),

    // Recurring heartbeat that processes due follow-up emails, follow-up calls,
    // and one-off scheduled emails (POSTs to /api/scheduled/process-emails).
    // Without this job registered, nothing is ever scheduled/sent automatically —
    // campaigns.launch only creates the DB rows describing what's due and when.
    getFollowUpHeartbeatStatus: protectedProcedure.query(async ({ ctx }) => {
      try {
        const { parse: parseCookie } = await import("cookie");
        const { COOKIE_NAME } = await import("@shared/const");
        const { listHeartbeatJobs } = await import("./_core/heartbeat");
        const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
        const { jobs } = await listHeartbeatJobs(sessionToken);
        const job = jobs.find((j) => j.name === FOLLOW_UP_HEARTBEAT_NAME);
        return {
          exists: !!job,
          enabled: !!job?.isEnable,
          cronExpression: job?.cronExpression || null,
          nextExecutionAt: job?.nextExecutionAt || null,
          lastExecutedAt: job?.lastExecutedAt || null,
        };
      } catch (err: any) {
        return { exists: false, enabled: false, cronExpression: null, nextExecutionAt: null, lastExecutedAt: null, error: err.message || "Failed to check heartbeat status" };
      }
    }),

    enableFollowUpHeartbeat: protectedProcedure.mutation(async ({ ctx }) => {
      const { parse: parseCookie } = await import("cookie");
      const { COOKIE_NAME } = await import("@shared/const");
      const { listHeartbeatJobs, createHeartbeatJob, updateHeartbeatJob } = await import("./_core/heartbeat");
      const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      const { jobs } = await listHeartbeatJobs(sessionToken);
      const existing = jobs.find((j) => j.name === FOLLOW_UP_HEARTBEAT_NAME);
      if (existing) {
        if (!existing.isEnable) {
          await updateHeartbeatJob(existing.taskUid, { enable: true }, sessionToken);
        }
        return { success: true };
      }
      await createHeartbeatJob({
        name: FOLLOW_UP_HEARTBEAT_NAME,
        cron: "0 */15 * * * *", // every 15 minutes
        path: "/api/scheduled/process-emails",
        description: "Processes due follow-up emails, follow-up calls, and one-off scheduled emails",
      }, sessionToken);
      return { success: true };
    }),

    disableFollowUpHeartbeat: protectedProcedure.mutation(async ({ ctx }) => {
      const { parse: parseCookie } = await import("cookie");
      const { COOKIE_NAME } = await import("@shared/const");
      const { listHeartbeatJobs, updateHeartbeatJob } = await import("./_core/heartbeat");
      const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      const { jobs } = await listHeartbeatJobs(sessionToken);
      const existing = jobs.find((j) => j.name === FOLLOW_UP_HEARTBEAT_NAME);
      if (existing?.isEnable) {
        await updateHeartbeatJob(existing.taskUid, { enable: false }, sessionToken);
      }
      return { success: true };
    }),
  }),

  // Comprehensive reports router
  reports: router({
    // Get full campaign report with all emails, follow-ups, and calls
    campaignReport: protectedProcedure
      .input(z.number())
      .query(async ({ input: campaignId, ctx }) => {
        const campaign = await db.getCampaignById(campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        const campaignLeadsList = await db.getCampaignLeads(campaignId);
        const report = [];

        for (const cl of campaignLeadsList) {
          const lead = await db.getLeadById(cl.leadId);
          if (!lead) continue;

          // Get follow-up emails for this campaign lead
          const followUpEmailsList = await db.getFollowUpEmailsByCampaignLead(cl.id);
          // Get follow-up calls for this campaign lead
          const followUpCallsList = await db.getFollowUpCallsByCampaignLead(cl.id);
          // Get email tracking events
          const trackingEvents = await db.getEmailTrackingEventsByCampaignLead(cl.id);
          // Get initial call logs
          const initialCallLogs = await db.getCallLogsByCampaignLead(cl.id);

          // Calculate email stats.
          // Follow-ups get cancelled (status set to "failed" — there's no distinct
          // "cancelled" value in the schema) when the lead replies, unsubscribes, or
          // answers a call. Those are good/neutral outcomes, not real send failures,
          // so exclude them from the failure count using the same signals cancelPendingFollowUps
          // is triggered by, or the report would show your best leads as "failed" emails.
          const followUpsWereCancelled = !!(
            cl.replied ||
            cl.unsubscribed ||
            initialCallLogs.some((c: any) => c.status === "completed") ||
            followUpCallsList.some((c: any) => c.status === "completed")
          );
          const emailsDone = followUpEmailsList.filter((e: any) => ["sent", "opened", "clicked"].includes(e.status));
          const emailsPending = followUpEmailsList.filter((e: any) => ["draft", "scheduled"].includes(e.status));
          const emailsFailed = followUpEmailsList.filter((e: any) => e.status === "failed" && !followUpsWereCancelled);
          const emailsCancelled = followUpsWereCancelled ? followUpEmailsList.filter((e: any) => e.status === "failed") : [];

          // Calculate call stats
          const callsDone = followUpCallsList.filter((c: any) => ["completed", "in_progress", "no_answer", "voicemail", "failed"].includes(c.status));
          const callsPending = followUpCallsList.filter((c: any) => ["scheduled", "initiated", "ringing"].includes(c.status));

          // Get lead set name if assigned
          let leadSetName: string | null = null;
          if (lead.leadSetId) {
            const leadSet = await db.getLeadSetById(lead.leadSetId);
            if (leadSet) leadSetName = leadSet.name;
          }

          report.push({
            leadId: lead.id,
            leadName: lead.ownerName,
            companyName: lead.companyName,
            email: lead.email,
            phone: lead.phoneNumber,
            tag: lead.tag || null,
            leadSetName,
            // Initial email status
            initialEmail: {
              sent: cl.emailSent,
              sentAt: cl.emailSentAt,
              opened: cl.emailOpened,
              openedAt: cl.emailOpenedAt,
              clicked: cl.emailClicked,
              clickedAt: cl.emailClickedAt,
              senderEmail: cl.senderEmail || null,
              messageId: cl.messageId || null,
              replied: cl.replied || false,
              repliedAt: cl.repliedAt || null,
              responseStatus: cl.responseStatus || null,
              // Reconstructed email content for preview
              subject: (campaign.subject || "")
                .replace(/{{companyName}}/g, lead.companyName || '')
                .replace(/{{ownerName}}/g, lead.ownerName || '')
                .replace(/{{email}}/g, lead.email || '')
                .replace(/{{industry}}/g, lead.industry || 'your industry'),
              emailBody: (campaign.emailTemplate || "")
                .replace(/{{companyName}}/g, lead.companyName || '')
                .replace(/{{ownerName}}/g, lead.ownerName || '')
                .replace(/{{email}}/g, lead.email || '')
                .replace(/{{industry}}/g, lead.industry || 'your industry')
                .replace(/{{phoneNumber}}/g, lead.phoneNumber || ''),
            },
            // Initial call
            initialCall: {
              triggered: cl.callTriggered,
              triggeredAt: cl.callTriggeredAt,
              status: initialCallLogs.length > 0 ? (initialCallLogs[0] as any).status : (cl.callTriggered ? "initiated" : "not_triggered"),
              duration: initialCallLogs.length > 0 ? (initialCallLogs[0] as any).duration : null,
            },
            // Follow-up emails breakdown
            followUpEmails: followUpEmailsList.map((e: any) => ({
              id: e.id,
              sequenceNumber: e.sequenceNumber,
              emailType: e.emailType,
              subject: e.subject,
              emailBody: e.emailBody || "",
              status: e.status,
              scheduledFor: e.scheduledFor,
              sentAt: e.sentAt,
              openedAt: e.openedAt,
              clickedAt: e.clickedAt,
            })),
            // Follow-up calls breakdown
            followUpCalls: followUpCallsList.map((c: any) => ({
              id: c.id,
              attemptNumber: c.attemptNumber,
              status: c.status,
              scheduledFor: c.scheduledFor,
              initiatedAt: c.initiatedAt,
              completedAt: c.completedAt,
              duration: c.duration,
              outcome: c.outcome,
            })),
            // Summary counts
            summary: {
              totalFollowUpEmails: followUpEmailsList.length,
              emailsSent: emailsDone.length,
              emailsPending: emailsPending.length,
              emailsFailed: emailsFailed.length,
              emailsCancelled: emailsCancelled.length,
              totalFollowUpCalls: followUpCallsList.length,
              callsMade: callsDone.length,
              callsPending: callsPending.length,
            },
            // Tracking events
            trackingEvents: trackingEvents.map((t: any) => ({
              type: t.eventType,
              occurredAt: t.createdAt,
            })),
          });
        }

        // Campaign-level summary
        const totalLeads = report.length;
        const totalEmailsSent = report.reduce((sum, r) => sum + (r.initialEmail.sent ? 1 : 0) + r.summary.emailsSent, 0);
        const totalEmailsOpened = report.reduce((sum, r) => sum + (r.initialEmail.opened ? 1 : 0) + r.followUpEmails.filter((e: any) => e.openedAt).length, 0);
        const totalEmailsClicked = report.reduce((sum, r) => sum + (r.initialEmail.clicked ? 1 : 0) + r.followUpEmails.filter((e: any) => e.clickedAt).length, 0);
        const totalCallsMade = report.reduce((sum, r) => sum + (r.initialCall.triggered ? 1 : 0) + r.summary.callsMade, 0);
        const totalCallsPending = report.reduce((sum, r) => sum + r.summary.callsPending, 0);
        const totalEmailsPending = report.reduce((sum, r) => sum + r.summary.emailsPending, 0);
        const totalBounced = campaignLeadsList.filter((cl: any) => cl.emailBounced).length;
        const totalReplied = campaignLeadsList.filter((cl: any) => cl.replied).length;

        // Social outreach stats for this campaign
        let socialOutreachStats = { totalSent: 0, totalAccepted: 0, totalPending: 0, byPlatform: { linkedin: { sent: 0, accepted: 0, pending: 0 }, instagram: { sent: 0, accepted: 0, pending: 0 }, facebook: { sent: 0, accepted: 0, pending: 0 } } };
        try {
          const { socialOutreach } = await import("../drizzle/schema");
          const { eq, and, inArray } = await import("drizzle-orm");
          const database = await db.getDb();
          if (database && campaignLeadsList.length > 0) {
            const clIds = campaignLeadsList.map((cl: any) => cl.id);
            // Get all social outreach for leads in this campaign
            const leadIds = campaignLeadsList.map((cl: any) => cl.leadId);
            const allSocialOutreach = await database.select().from(socialOutreach).where(
              and(eq(socialOutreach.userId, ctx.user.id), inArray(socialOutreach.leadId, leadIds))
            );
            // "accepted" is reported manually via social.markResponse (there's no
            // platform API to detect it automatically).
            for (const so of allSocialOutreach) {
              const platform = (so as any).platform as "linkedin" | "instagram" | "facebook";
              const status = (so as any).status;
              if (status === "sent") {
                socialOutreachStats.totalSent++;
                if (socialOutreachStats.byPlatform[platform]) {
                  socialOutreachStats.byPlatform[platform].sent++;
                }
                if ((so as any).responseStatus === "accepted") {
                  socialOutreachStats.totalAccepted++;
                  if (socialOutreachStats.byPlatform[platform]) {
                    socialOutreachStats.byPlatform[platform].accepted++;
                  }
                }
              } else if (status === "pending") {
                socialOutreachStats.totalPending++;
                if (socialOutreachStats.byPlatform[platform]) {
                  socialOutreachStats.byPlatform[platform].pending++;
                }
              }
            }
          }
        } catch (e) { /* social outreach stats optional */ }

        return {
          campaign: {
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            createdAt: campaign.createdAt,
          },
          summary: {
            totalLeads,
            totalEmailsSent,
            totalEmailsOpened,
            totalEmailsClicked,
            totalCallsMade,
            totalCallsPending,
            totalEmailsPending,
            totalBounced,
            totalReplied,
            socialOutreach: socialOutreachStats,
          },
          leads: report,
        };
      }),
  }),

  // Email tracking router - actual tracking handled by Express routes
  // Reply inbox — replies detected via IMAP sync (see server/_core/inboxSync.ts)
  inbox: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(100) }).optional())
      .query(async ({ ctx, input }) => {
        const replies = await db.getEmailRepliesByUser(ctx.user.id, input?.limit || 100);
        // Enrich with lead/company name where we matched one
        return Promise.all(
          (replies as any[]).map(async (r) => {
            let leadName: string | null = null;
            let companyName: string | null = null;
            if (r.leadId) {
              const lead = await db.getLeadById(r.leadId);
              if (lead) {
                leadName = lead.ownerName;
                companyName = lead.companyName;
              }
            }
            return { ...r, leadName, companyName };
          })
        );
      }),

    getStats: protectedProcedure.query(async ({ ctx }) => {
      return db.getReplyStatsByUser(ctx.user.id);
    }),

    getSyncStatus: protectedProcedure.query(async ({ ctx }) => {
      try {
        const settings = await db.getUserSettings(ctx.user.id);
        const configured = !!((settings as any)?.imapHost && (settings as any)?.imapUsername && (settings as any)?.imapPassword);
        // Non-sensitive debug snapshot so a "not configured" state can be
        // diagnosed from the UI without server log access.
        const debug = {
          imapHost: (settings as any)?.imapHost || null,
          imapUsername: (settings as any)?.imapUsername || null,
          hasImapPassword: !!(settings as any)?.imapPassword,
        };

        let heartbeatError: string | undefined;
        let enabled = false;
        let nextExecutionAt: string | null = null;
        try {
          const { parse: parseCookie } = await import("cookie");
          const { COOKIE_NAME } = await import("@shared/const");
          const { listHeartbeatJobs } = await import("./_core/heartbeat");
          const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
          const { jobs } = await listHeartbeatJobs(sessionToken);
          const job = jobs.find((j) => j.name === INBOX_SYNC_HEARTBEAT_NAME);
          enabled = !!job?.isEnable;
          nextExecutionAt = job?.nextExecutionAt || null;
        } catch (err: any) {
          heartbeatError = err.message || String(err);
        }

        return {
          configured,
          enabled,
          nextExecutionAt,
          lastSyncedAt: (settings as any)?.imapLastSyncedAt || null,
          heartbeatError,
          debug,
        };
      } catch (err: any) {
        return {
          configured: false,
          enabled: false,
          nextExecutionAt: null,
          lastSyncedAt: null,
          error: err.message || String(err),
          debug: null,
        };
      }
    }),

    testImapConnection: protectedProcedure
      .input(z.object({ host: z.string().min(1), port: z.number(), username: z.string().min(1), password: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        let password = input.password;
        if (!password) {
          // No new password provided — fall back to the already-saved one.
          const settings = await db.getUserSettings(ctx.user.id);
          password = (settings as any)?.imapPassword || undefined;
        }
        if (!password) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a password to test the connection." });
        }
        const { testImapConnection } = await import("./_core/inboxSync");
        return testImapConnection({ host: input.host, port: input.port, username: input.username, password });
      }),

    enableInboxSync: protectedProcedure.mutation(async ({ ctx }) => {
      const settings = await db.getUserSettings(ctx.user.id);
      if (!(settings as any)?.imapHost || !(settings as any)?.imapUsername || !(settings as any)?.imapPassword) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Save your IMAP connection settings first." });
      }
      const { parse: parseCookie } = await import("cookie");
      const { COOKIE_NAME } = await import("@shared/const");
      const { listHeartbeatJobs, createHeartbeatJob, updateHeartbeatJob } = await import("./_core/heartbeat");
      const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      const { jobs } = await listHeartbeatJobs(sessionToken);
      const existing = jobs.find((j) => j.name === INBOX_SYNC_HEARTBEAT_NAME);
      if (existing) {
        if (!existing.isEnable) {
          await updateHeartbeatJob(existing.taskUid, { enable: true }, sessionToken);
        }
        return { success: true };
      }
      await createHeartbeatJob({
        name: INBOX_SYNC_HEARTBEAT_NAME,
        cron: "0 */5 * * * *", // every 5 minutes
        path: "/api/scheduled/sync-inbox",
        description: "Polls the configured IMAP inbox for new lead replies",
      }, sessionToken);
      return { success: true };
    }),

    disableInboxSync: protectedProcedure.mutation(async ({ ctx }) => {
      const { parse: parseCookie } = await import("cookie");
      const { COOKIE_NAME } = await import("@shared/const");
      const { listHeartbeatJobs, updateHeartbeatJob } = await import("./_core/heartbeat");
      const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      const { jobs } = await listHeartbeatJobs(sessionToken);
      const existing = jobs.find((j) => j.name === INBOX_SYNC_HEARTBEAT_NAME);
      if (existing?.isEnable) {
        await updateHeartbeatJob(existing.taskUid, { enable: false }, sessionToken);
      }
      return { success: true };
    }),

    syncNow: protectedProcedure.mutation(async ({ ctx }) => {
      const { syncInboxReplies } = await import("./_core/inboxSync");
      return syncInboxReplies(ctx.user.id);
    }),
  }),

  tracking: router({
    getEvents: protectedProcedure
      .input(z.number())
      .query(async ({ input: campaignLeadId, ctx }) => {
        const campaignLead = await db.getCampaignLeadById(campaignLeadId);
        if (!campaignLead) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        const campaign = await db.getCampaignById(campaignLead.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        return db.getEmailTrackingEventsByCampaignLead(campaignLeadId);
  }),
      }),

  // Email signature router
  signature: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      return db.getEmailSignature(ctx.user.id);
    }),
    update: protectedProcedure
      .input(z.object({
        signatureHtml: z.string(),
        signaturePlainText: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.upsertEmailSignature(ctx.user.id, input.signatureHtml, input.signaturePlainText);
        return { success: true };
      }),
  }),

  // Follow-up emails router
  followUpEmails: router({
    create: protectedProcedure
      .input(z.object({
        campaignLeadId: z.number(),
        sequenceNumber: z.number(),
        emailType: z.enum(["discovery", "value_prop", "social_proof", "urgency", "custom"]),
        subject: z.string(),
        emailBody: z.string(),
        ctaLink: z.string().optional(),
        scheduledFor: z.date().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const campaignLead = await db.getCampaignLeadById(input.campaignLeadId);
        if (!campaignLead) throw new TRPCError({ code: "NOT_FOUND" });
        const campaign = await db.getCampaignById(campaignLead.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        const trackingToken = nanoid();
        return db.createFollowUpEmail({
          ...input,
          trackingToken,
          status: input.scheduledFor ? "scheduled" : "draft",
        });
      }),
    getByCampaignLead: protectedProcedure
      .input(z.number())
      .query(async ({ input: campaignLeadId, ctx }) => {
        const campaignLead = await db.getCampaignLeadById(campaignLeadId);
        if (!campaignLead) throw new TRPCError({ code: "NOT_FOUND" });
        const campaign = await db.getCampaignById(campaignLead.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        return db.getFollowUpEmailsByCampaignLead(campaignLeadId);
      }),
  }),

  // Follow-up calls router
  followUpCalls: router({
    create: protectedProcedure
      .input(z.object({
        campaignLeadId: z.number(),
        attemptNumber: z.number(),
        phoneNumber: z.string(),
        scheduledFor: z.date().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const campaignLead = await db.getCampaignLeadById(input.campaignLeadId);
        if (!campaignLead) throw new TRPCError({ code: "NOT_FOUND" });
        const campaign = await db.getCampaignById(campaignLead.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        return db.createFollowUpCall({
          ...input,
          status: input.scheduledFor ? "scheduled" : "initiated",
        });
      }),
    getByCampaignLead: protectedProcedure
      .input(z.number())
      .query(async ({ input: campaignLeadId, ctx }) => {
        const campaignLead = await db.getCampaignLeadById(campaignLeadId);
        if (!campaignLead) throw new TRPCError({ code: "NOT_FOUND" });
        const campaign = await db.getCampaignById(campaignLead.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        return db.getFollowUpCallsByCampaignLead(campaignLeadId);
      }),
  }),

  // Email templates router
  emailTemplates: router({
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        emailType: z.enum(["discovery", "value_prop", "social_proof", "urgency", "custom"]),
        subjectTemplate: z.string(),
        bodyTemplate: z.string(),
        description: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.createEmailTemplate({
          userId: ctx.user.id,
          ...input,
        });
      }),
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getEmailTemplatesByUser(ctx.user.id);
    }),
  }),

  // AI Email Generation and Individual Sending
  email: router({
    // Run deliverability checks and return results for UI display
    checkDeliverability: protectedProcedure
      .input(z.object({
        subject: z.string().optional(),
        body: z.string().optional(),
      }).optional())
      .mutation(async ({ input, ctx }) => {
        const settings = await db.getUserSettings(ctx.user.id);
        if (!settings?.smtpHost || !settings?.senderEmail) {
          return {
            allPassed: false,
            score: 0,
            checks: [{ name: "SMTP Configuration", status: "fail" as const, message: "SMTP not configured — go to Settings to configure your email", category: "infrastructure" as const }],
          };
        }
        const { runDeliverabilityChecks } = await import("./deliverabilityChecks");
        return runDeliverabilityChecks({
          senderEmail: settings.senderEmail,
          senderName: settings.senderName || "",
          subject: input?.subject || "Test Subject Line",
          body: input?.body || "Test email body with unsubscribe link",
          smtpHost: settings.smtpHost,
        });
      }),

    fixDeliverability: protectedProcedure
      .input(z.object({
        subject: z.string(),
        body: z.string(),
        failedChecks: z.array(z.object({
          name: z.string(),
          status: z.enum(["fail", "warning"]),
          message: z.string(),
          category: z.string(),
        })),
        leadName: z.string().optional(),
        companyName: z.string().optional(),
        industry: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const issuesList = input.failedChecks.map(c => `- [${c.category.toUpperCase()}] ${c.name}: ${c.message}`).join("\n");

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an email deliverability expert. Your job is to rewrite emails to fix deliverability issues while preserving the original intent, tone, and message. Keep the email professional and human-sounding. Output plain text format (not HTML). Always maintain a clear Call to Action.`,
            },
            {
              role: "user",
              content: `Rewrite this email to fix the following deliverability issues:

ISSUES TO FIX:
${issuesList}

CONTEXT:
- Recipient name: ${input.leadName || "the recipient"}
- Company: ${input.companyName || "their company"}
- Industry: ${input.industry || "their industry"}

ORIGINAL SUBJECT: ${input.subject}

ORIGINAL BODY:
${input.body}

Rules for the rewrite:
1. If personalization is missing, add the recipient's first name in the opening and reference their company/industry
2. If spam words are detected, replace them with professional alternatives
3. If subject line has issues, rewrite it to be compelling but not spammy (under 60 chars)
4. Do NOT include any unsubscribe text - it will be appended separately as a clickable link.
5. Keep the email concise (under 200 words for body)
6. Maintain the original CTA and core message
7. Keep plain text format with clear line breaks
8. Do NOT use excessive capitalization, exclamation marks, or urgency words

Return JSON with: { "subject": "...", "body": "..." }`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "fixed_email",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  subject: { type: "string", description: "The fixed subject line" },
                  body: { type: "string", description: "The fixed email body in plain text" },
                },
                required: ["subject", "body"],
                additionalProperties: false,
              },
            },
          },
        }) as any;

        let content = response.choices?.[0]?.message?.content;
        if (Array.isArray(content)) {
          content = content.map((c: any) => typeof c === "string" ? c : c.text || "").join("");
        }
        if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI failed to generate fixed email" });
        content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        const parsed = JSON.parse(content);
        return { subject: parsed.subject, body: parsed.body };
      }),

    generateAI: protectedProcedure
      .input(z.object({
        leadId: z.number(),
        emailType: z.enum(["discovery", "value_prop", "social_proof", "urgency", "custom"]),
        instructions: z.string().optional(),
        ctaLink: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const lead = await db.getLeadById(input.leadId);
        if (!lead || lead.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });

        // Signature is hardcoded (Nitin's)
        const settings = await db.getUserSettings(ctx.user.id);
        const ctaLink = input.ctaLink || settings?.ctaLink || "https://cal.com/nitin-virtualassistant-group.com/30min";

        // Fetch stored problem analysis for this lead (if available)
        let problemContext = "";
        try {
          const weakPoints = await db.getLeadWeakPoints(lead.id);
          if (weakPoints && weakPoints.weakPoints) {
            const wp = weakPoints.weakPoints as any;
            const painPoints = Array.isArray(wp) ? wp : (wp.painPoints || wp.problems || []);
            if (painPoints.length > 0) {
              problemContext = `\n\nRESEARCHED PROBLEMS & PAIN POINTS for this lead's industry/business:\n${painPoints.map((p: any) => `- ${typeof p === 'string' ? p : p.title || p.description || JSON.stringify(p)}`).join('\n')}`;
              if (weakPoints.analysis) {
                problemContext += `\nAnalysis: ${weakPoints.analysis}`;
              }
            }
          }
        } catch (e) {
          // No problem analysis available - continue without it
        }

        // Fetch stored website analysis (competitors, gaps, news)
        let websiteAnalysisContext = "";
        try {
          const storedInsights = await db.getWebsiteInsights(lead.id);
          if (storedInsights) {
            const competitors = (storedInsights.competitors as any[]) || [];
            const gaps = (storedInsights.competitorGaps as any[]) || [];
            const news = (storedInsights.recentNews as any[]) || [];
            const industryInsights = (storedInsights.industryInsights as string[]) || [];
            
            if (competitors.length > 0 || gaps.length > 0 || news.length > 0) {
              websiteAnalysisContext = `\nWEBSITE & COMPETITOR INTELLIGENCE (YOU MUST reference competitor names and specific gaps in the email):`;
              if (competitors.length > 0) {
                websiteAnalysisContext += `\nTop Competitors: ${competitors.map((c: any) => `${c.name || c.domain} (${c.traffic || "N/A"} monthly visits)`).join(", ")}`;
              }
              if (gaps.length > 0) {
                websiteAnalysisContext += `\nWhat Competitors Do Better: ${gaps.map((g: any) => `${g.competitor || g.competitorName}: ${g.gap || g.description}`).join("; ")}`;
              }
              if (news.length > 0) {
                websiteAnalysisContext += `\nRecent Industry News: ${news.map((n: any) => n.title || n.headline || n).join("; ")}`;
              }
              if (industryInsights.length > 0) {
                websiteAnalysisContext += `\nIndustry Insights: ${industryInsights.join("; ")}`;
              }
              if (storedInsights.totalVisits) {
                websiteAnalysisContext += `\nTheir Website Traffic: ~${storedInsights.totalVisits} monthly visits, Bounce Rate: ${storedInsights.bounceRate || "N/A"}%`;
              }
            }
          }
        } catch (e) { /* continue without website analysis */ }

        // Extract first name from ownerName
        const firstName = lead.ownerName?.split(' ')[0] || lead.ownerName || 'there';

        const emailTypePrompts: Record<string, string> = {
          discovery: "Write a discovery email to understand their business challenges and pain points. Ask an insightful question about their specific industry.",
          value_prop: "Write a value proposition email highlighting how our services solve their specific problems. Reference their industry challenges.",
          social_proof: "Write a social proof email sharing relevant case studies, testimonials, or success stories from companies in their industry.",
          urgency: "Write an urgency email with a time-sensitive offer or limited availability. Reference industry-specific timing.",
          custom: "Write a professional outreach email based on the specific instructions provided.",
        };

        const prompt = `You are a professional email copywriter specializing in hyper-personalized cold outreach. Generate a cold outreach email that feels like it was written specifically for this ONE person — not a template.

Lead Information:
- First Name: ${firstName}
- Full Name: ${lead.ownerName || 'Business Owner'}
- Company Name: ${lead.companyName}
- Industry: ${lead.industry || 'business services'}
- Website: ${lead.website || 'Not available'}
- Phone: ${lead.phoneNumber || 'Not available'}
- Email: ${lead.email}
${problemContext}${websiteAnalysisContext}

Email Type: ${input.emailType}
Guidance: ${emailTypePrompts[input.emailType]}
${input.instructions ? `Additional Instructions from sender: ${input.instructions}` : ""}
CTA Link (for booking a meeting): ${ctaLink}

CRITICAL PERSONALIZATION RULES:
1. OPENING LINE: Start with "Hi ${firstName}," then immediately reference something SPECIFIC about ${lead.companyName} — e.g. their recent growth, a challenge common to ${lead.industry || 'their industry'} companies of their size, or something from their website (${lead.website || 'N/A'}). Do NOT use generic openers.
2. COMPANY REFERENCE: Mention "${lead.companyName}" by name at least once in the body. Show you know WHO they are.
3. INDUSTRY SPECIFICITY: Reference the ${lead.industry || 'business services'} industry by name. Mention 1-2 pain points UNIQUE to ${lead.industry || 'this industry'} (e.g. for dental: patient no-shows, insurance verification backlogs; for real estate: transaction coordination, lead follow-up delays; for e-commerce: cart abandonment, inventory management).
4. DYNAMIC CASE STUDY: Invent a realistic but UNIQUE case study for each email. Reference a fictional company IN THE SAME INDUSTRY as ${lead.companyName} (a ${lead.industry || 'similar'} business). Use specific numbers (hours saved, % improvement, deals closed). NEVER repeat the same case study. Make it sound like their direct competitor benefited.
5. VALUE PROPOSITION: You CAN mention pricing like "$6/hour" as a value anchor. Also frame value in terms of OUTCOMES specific to ${lead.industry || 'their business'}: time saved, revenue gained, problems eliminated.
6. Subject line MUST be under 50 characters, conversational, lowercase, NO spam words. Should reference ${lead.companyName} or ${lead.industry || 'their industry'} specifically.
7. Email MUST be under 150 words total.
8. Include 2-3 bullet points with benefits SPECIFIC to ${lead.industry || 'their'} industry challenges.
9. End with clear CTA: "Schedule a quick chat: ${ctaLink}"
10. Tone: Professional but warm, like a knowledgeable peer who understands their specific business.
11. Do NOT include any signature - it will be appended separately.
12. NEVER use these overused phrases: "I noticed that", "I came across", "I hope this finds you well", "I wanted to reach out".
13. Each email must feel UNIQUE — if you generated 10 emails for 10 different leads, none should look similar.

Respond in this exact JSON format:
{
  "subject": "the subject line here",
  "body": "the full email body in plain text format with line breaks. Use dashes (-) for bullet points, NOT HTML tags."
}`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are an expert cold email copywriter who writes emails that land in the primary inbox, not spam or promotions. Always respond with valid JSON." },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "email_output",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  subject: { type: "string", description: "Email subject line" },
                  body: { type: "string", description: "Email body in HTML" },
                },
                required: ["subject", "body"],
                additionalProperties: false,
              },
            },
          },
        });

        const rawContent = response.choices[0]?.message?.content;
        if (!rawContent) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI generation failed" });
        const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

        const parsed = JSON.parse(content);
        let emailBody = parsed.body || "";

        // Validation: Ensure bullet points are present
        if (!emailBody.includes("<li") && !emailBody.includes("<ul")) {
          emailBody += `<ul><li>Save time and resources with our proven approach</li><li>Get measurable results within 30 days</li><li>Join companies already seeing growth</li></ul>`;
        }

        // Validation: Ensure CTA link is present
        if (!emailBody.includes(ctaLink)) {
          emailBody += `<p style="margin-top:16px;"><a href="${ctaLink}" style="color:#2563eb;font-weight:500;">Schedule a quick chat</a></p>`;
        }
        // Append the user's configured signature with clickable links
        const generateAISignature = await db.getEmailSignature(ctx.user.id);
        let fullBody = emailBody + getSignatureHtml(generateAISignature);
        // Add unsubscribe opt-out text for CAN-SPAM compliance
        // Unsubscribe link is now added as a clickable link in the HTML version

        return {
          subject: parsed.subject,
          body: fullBody,
          bodyWithoutSignature: emailBody,
        };
      }),

    sendIndividual: protectedProcedure
      .input(z.object({
        leadId: z.number(),
        subject: z.string().min(1),
        body: z.string().min(1),
        senderAccountId: z.number().optional(),
        
      }))
      .mutation(async ({ input, ctx }) => {
        const lead = await db.getLeadById(input.leadId);
        if (!lead || lead.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
        if ((lead as any).unsubscribed) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This lead has unsubscribed and can no longer be emailed." });
        }

        const settings = await db.getUserSettings(ctx.user.id);
        let smtpHost: string, smtpPort: number, smtpUser: string, smtpPass: string, fromEmail: string, fromName: string;

        if (input.senderAccountId) {
          // Use a specific rotational email account
          const rotationalEmails = await db.getRotationalEmailsByUser(ctx.user.id);
          const account = rotationalEmails.find((e: any) => e.id === input.senderAccountId);
          if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Sender account not found" });
          smtpHost = account.smtpHost;
          smtpPort = account.smtpPort || 587;
          smtpUser = account.smtpUsername;
          smtpPass = account.smtpPassword;
          fromEmail = account.email;
          fromName = account.senderName || "";
        } else {
          // Use primary SMTP settings
          if (!settings?.smtpHost || !settings?.smtpUsername || !settings?.smtpPassword) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Please configure your SMTP settings first in the Settings page." });
          }
          smtpHost = settings.smtpHost;
          smtpPort = settings.smtpPort || 587;
          smtpUser = settings.smtpUsername;
          smtpPass = settings.smtpPassword;
          fromEmail = settings.senderEmail || settings.smtpUsername;
          fromName = settings.senderName || "";
        }

        // Create transporter with selected account
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: smtpUser, pass: smtpPass },
        });

        // Create tracking token
        const trackingToken = nanoid();

        // Use request origin for tracking URL (respect x-forwarded-proto behind reverse proxy)
        const baseUrl = ctx.req.headers?.['x-forwarded-proto']
          ? `${ctx.req.headers['x-forwarded-proto']}://${ctx.req.headers['x-forwarded-host'] || ctx.req.get?.('host') || 'localhost:3000'}`
          : `${ctx.req.protocol || 'https'}://${ctx.req.get?.('host') || 'localhost:3000'}`;
        const trackingPixel = `<img src="${baseUrl}/api/track/pixel/${trackingToken}" width="1" height="1" style="display:none" />`;

        // Create click tracking token for CTA links
        const clickTrackingToken = nanoid();

        // Personalize any template variables left in the body (matches bulk
        // campaign send -- needed when the body came from "Load Template"
        // without going through AI generation, which leaves {{placeholders}} intact)
        const ctaUrl = settings?.ctaLink || 'https://cal.com/nitin-virtualassistant-group.com/30min';
        const trackedCtaUrl = `${baseUrl}/api/track/click/${clickTrackingToken}?url=${encodeURIComponent(ctaUrl)}`;
        const personalizedBody = input.body
          .replace(/{{companyName}}/g, lead.companyName || '')
          .replace(/{{ownerName}}/g, lead.ownerName || '')
          .replace(/{{email}}/g, lead.email || '')
          .replace(/{{industry}}/g, lead.industry || 'your industry')
          .replace(/{{phoneNumber}}/g, lead.phoneNumber || '')
          .replace(/{{bookingUrl}}/g, trackedCtaUrl)
          .replace(/{{ctaLink}}/g, trackedCtaUrl);

        // Wrap all links in the email body with click tracking
        // Step 1: Replace raw URLs in plain text (e.g. https://cal.com/...)
        let trackedBody = personalizedBody.replace(
          /(https?:\/\/[^\s<>"']+)/g,
          (rawUrl) => {
            // Skip if it's already inside an href attribute (already tracked)
            if (rawUrl.includes('/api/track/click/')) return rawUrl;
            return `${baseUrl}/api/track/click/${clickTrackingToken}?url=${encodeURIComponent(rawUrl)}`;
          }
        );
        // Step 2: Also wrap any existing href="..." links (for HTML bodies from AI generation)
        trackedBody = trackedBody.replace(
          /href=["'](https?:\/\/[^"']*)["']/g,
          (match, url) => {
            // Don't double-wrap if already tracked
            if (url.includes('/api/track/click/')) return match;
            return `href="${baseUrl}/api/track/click/${clickTrackingToken}?url=${encodeURIComponent(url)}"`;
          }
        );

        // Convert plain text to HTML, append the user's configured signature and unsubscribe link
        const signature = await db.getEmailSignature(ctx.user.id);
        const unsubscribeUrl = `${baseUrl}/api/track/unsubscribe/${trackingToken}`;
        const unsubscribeHtml = `<br/><p style="font-size:11px;color:#999;text-align:center;margin-top:24px;"><a href="${unsubscribeUrl}" style="color:#999;text-decoration:underline;">Unsubscribe</a> from future emails</p>`;
        const htmlBody = plainTextToHtml(trackedBody) + getSignatureHtml(signature) + unsubscribeHtml + trackingPixel;

        let sendResult: any;
        try {
          sendResult = await transporter.sendMail({
            from: `"${fromName || "Lead Gen Pro"}" <${fromEmail}>`,
            to: lead.email,
            subject: input.subject,
            html: htmlBody,
            headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
          });
        } catch (smtpError: any) {
          console.error("[Email Send] SMTP error:", smtpError.message, smtpError.code);
          const errorMsg = smtpError.code === "EAUTH" 
            ? "SMTP authentication failed. Please check your username and password in Settings."
            : smtpError.code === "ECONNREFUSED"
            ? "Could not connect to SMTP server. Please verify your SMTP host and port in Settings."
            : smtpError.code === "ESOCKET"
            ? "SMTP connection timed out. Check your host/port and try port 587 or 465."
            : `Email sending failed: ${smtpError.message}`;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: errorMsg });
        }

        // Create a campaign record for tracking (only if user opted in)
        let campaignId: number | undefined;
        { // Always create campaign for tracking
          try {
            campaignId = await db.createCampaign({
              userId: ctx.user.id,
              name: `Single Email to ${lead.ownerName || lead.companyName}`,
              subject: input.subject,
              emailTemplate: input.body,
              status: "completed",
              totalLeads: 1,
              sentCount: 1,
            });
            await db.addLeadsToCampaign(campaignId, [lead.id]);
            const campaignLeadsList = await db.getCampaignLeads(campaignId);
            if (campaignLeadsList.length > 0) {
              await db.updateCampaignLead(campaignLeadsList[0].id, {
                emailSent: 1 as any,
                emailSentAt: new Date().toISOString(),
                senderEmail: fromEmail || null,
                messageId: sendResult?.messageId || null,
                threadId: sendResult?.messageId || null,
              });
              await db.createEmailTrackingEvent({
                campaignLeadId: campaignLeadsList[0].id,
                trackingToken,
                eventType: "open",
              });
              // Store click tracking event for link tracking
              await db.createEmailTrackingEvent({
                campaignLeadId: campaignLeadsList[0].id,
                trackingToken: clickTrackingToken,
                eventType: "click",
              });
            }
          } catch (e) {
            console.error('Campaign tracking failed:', e);
          }
        }
        await db.updateLead(lead.id, { status: "contacted" });
        return { success: true, trackingToken, campaignId };
      }),

    // Send test email to yourself
    sendTestEmail: protectedProcedure
      .input(z.object({
        subject: z.string().min(1),
        body: z.string().min(1),
        testEmail: z.string().email().optional(), // If not provided, sends to user's own email
      }))
      .mutation(async ({ input, ctx }) => {
        const settings = await db.getUserSettings(ctx.user.id);
        if (!settings?.smtpHost || !settings?.smtpUsername || !settings?.smtpPassword) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Please configure your SMTP settings first in the Settings page." });
        }
        // Send to user's own email if testEmail not provided
        const recipientEmail = input.testEmail || settings.senderEmail || settings.smtpUsername;

        const transporter = nodemailer.createTransport({
          host: settings.smtpHost,
          port: settings.smtpPort || 587,
          secure: (settings.smtpPort || 587) === 465,
          auth: {
            user: settings.smtpUsername,
            pass: settings.smtpPassword,
          },
        });

        // Get user's configured email signature (converted to HTML)
        const signature = await db.getEmailSignature(ctx.user.id);

        // Add a [TEST] prefix to subject
        const testSubject = `[TEST PREVIEW] ${input.subject}`;
        const testBanner = `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:12px 16px;margin-bottom:20px;font-family:sans-serif;font-size:14px;color:#92400e;"><strong>\u26A0\uFE0F Test Preview</strong> \u2014 This is a preview of how your email will look. The actual email sent to the lead will not include this banner.</div>`;
        // Convert plain text to HTML if needed, append signature
        const htmlBody = testBanner + plainTextToHtml(input.body) + getSignatureHtml(signature);

        try {
          const testReplyTo = settings.replyToEmail || "nitin@virtualassistant-group.com";
          await transporter.sendMail({
            from: `"${settings.senderName || "Lead Gen Pro"}" <${settings.senderEmail || settings.smtpUsername}>`,
            to: recipientEmail,
            replyTo: testReplyTo,
            subject: testSubject,
            html: htmlBody,
          });
        } catch (smtpError: any) {
          console.error("[Test Email] SMTP error:", smtpError.message, smtpError.code);
          const errorMsg = smtpError.code === "EAUTH" 
            ? "SMTP authentication failed. Please check your username and password in Settings."
            : smtpError.code === "ECONNREFUSED"
            ? "Could not connect to SMTP server. Please verify your SMTP host and port in Settings."
            : smtpError.code === "ESOCKET"
            ? "SMTP connection timed out. Check your host/port and try port 587 or 465."
            : `Email sending failed: ${smtpError.message}`;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: errorMsg });
        }

        return { success: true };
      }),

    // Send test email through ALL SMTP accounts (primary + rotational) to verify deliverability
    sendTestToAllAccounts: protectedProcedure
      .input(z.object({
        subject: z.string().min(1),
        body: z.string().min(1),
        testEmail: z.string().email().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const settings = await db.getUserSettings(ctx.user.id);
        if (!settings?.smtpHost || !settings?.smtpUsername || !settings?.smtpPassword) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Please configure your primary SMTP settings first in the Settings page." });
        }
        const recipientEmail = input.testEmail || settings.senderEmail || settings.smtpUsername;
        const signature = await db.getEmailSignature(ctx.user.id);
        const testSubject = `[TEST ALL ACCOUNTS] ${input.subject}`;

        // Collect all SMTP accounts: primary + rotational
        const accounts: Array<{ label: string; host: string; port: number; username: string; password: string; senderName: string; senderEmail: string }> = [];

        // Primary account
        accounts.push({
          label: "Primary",
          host: settings.smtpHost,
          port: settings.smtpPort || 587,
          username: settings.smtpUsername!,
          password: settings.smtpPassword!,
          senderName: settings.senderName || "Lead Gen Pro",
          senderEmail: settings.senderEmail || settings.smtpUsername!,
        });

        // Rotational accounts
        const rotationalAccounts = await db.getRotationalEmailsByUser(ctx.user.id);
        for (const ra of rotationalAccounts) {
          if (ra.isActive) {
            accounts.push({
              label: `${ra.senderName || ra.email} (Day ${ra.dayOfWeek})`,
              host: ra.smtpHost,
              port: ra.smtpPort,
              username: ra.smtpUsername,
              password: ra.smtpPassword,
              senderName: ra.senderName || ra.email,
              senderEmail: ra.email,
            });
          }
        }

        const results: Array<{ account: string; success: boolean; error?: string }> = [];

        for (const account of accounts) {
          try {
            const transporter = nodemailer.createTransport({
              host: account.host,
              port: account.port,
              secure: account.port === 465,
              auth: { user: account.username, pass: account.password },
            });
            const accountBanner = `<div style="background:#dbeafe;border:1px solid #3b82f6;border-radius:6px;padding:12px 16px;margin-bottom:20px;font-family:sans-serif;font-size:14px;color:#1e40af;"><strong>\u2709\uFE0F Sent via: ${account.label}</strong> &mdash; ${account.senderEmail}</div>`;
            const htmlBody = accountBanner + plainTextToHtml(input.body) + getSignatureHtml(signature);
            await transporter.sendMail({
              from: `"${account.senderName}" <${account.senderEmail}>`,
              to: recipientEmail,
              subject: `${testSubject} [via ${account.label}]`,
              html: htmlBody,
            });
            results.push({ account: account.label, success: true });
          } catch (err: any) {
            results.push({ account: account.label, success: false, error: err.message || "Unknown error" });
          }
        }

        const successCount = results.filter(r => r.success).length;
        return { results, totalAccounts: accounts.length, successCount };
      }),

    // AI Write: Generate professional, human-sounding email with problem analysis
    // Format: Services intro → Industry pain points → Solutions with case studies → CTA
    generateAITemplate: protectedProcedure
      .input(z.object({
        prompt: z.string().min(5), // User's description of what they want to say
        emailType: z.enum(["discovery", "value_prop", "social_proof", "urgency", "custom"]).optional(),
        companyContext: z.string().optional(), // Optional company/industry context for personalization
        leadId: z.number().optional(), // Optional: if provided, personalizes for specific lead
        includeVariables: z.boolean().optional(), // If true, uses {{variables}} for bulk templates
        useProblemAnalysis: z.boolean().optional(), // If true, fetches and uses stored problem analysis
      }))
      .mutation(async ({ input, ctx }) => {
        let leadContext = "";
        let problemAnalysis: { painPoints: string[]; industryTrends?: string[]; competitiveThreats?: string[] } | undefined;

        if (input.leadId) {
          const lead = await db.getLeadById(input.leadId);
          if (lead && lead.userId === ctx.user.id) {
            leadContext = `Name: ${lead.ownerName}, Company: ${lead.companyName}, Industry: ${lead.industry || "Not specified"}, Email: ${lead.email}, Website: ${lead.website || "Not provided"}`;

            // Fetch problem analysis if available
            if (input.useProblemAnalysis !== false) {
              const weakPoints = await db.getLeadWeakPoints(lead.id);
              if (weakPoints && weakPoints.weakPoints) {
                const allPoints = weakPoints.weakPoints as string[];
                problemAnalysis = {
                  painPoints: allPoints.filter((p: string) => !p.startsWith("[Trend]") && !p.startsWith("[Competitive]")),
                  industryTrends: allPoints.filter((p: string) => p.startsWith("[Trend]")).map((p: string) => p.replace("[Trend] ", "")),
                  competitiveThreats: allPoints.filter((p: string) => p.startsWith("[Competitive]")).map((p: string) => p.replace("[Competitive] ", "")),
                };
              }
            }
          }
        }

        // Fetch stored website analysis for bulk template
        let websiteAnalysis: any = undefined;
        if (input.leadId) {
          try {
            const storedInsights = await db.getWebsiteInsights(input.leadId);
            if (storedInsights) {
              websiteAnalysis = {
                competitors: storedInsights.competitors as any[] || [],
                competitorGaps: storedInsights.competitorGaps as any[] || [],
                recentNews: storedInsights.recentNews as any[] || [],
                industryInsights: storedInsights.industryInsights as string[] || [],
                insightsSummary: storedInsights.insightsSummary || undefined,
                totalVisits: storedInsights.totalVisits,
                bounceRate: storedInsights.bounceRate,
                topKeywords: storedInsights.topKeywords as any[] || [],
              };
            }
          } catch (e) { /* continue without */ }
        }

        const { generateEmailWithClaude } = await import("./claude");
        const templateSettings = await db.getUserSettings(ctx.user.id);

        const result = await generateEmailWithClaude({
          prompt: input.prompt,
          emailType: input.emailType || undefined,
          companyContext: input.companyContext || undefined,
          leadContext: leadContext || undefined,
          includeVariables: input.includeVariables || false,
          ctaLink: templateSettings?.ctaLink || undefined,
          problemAnalysis,
          websiteAnalysis,
        });

        // Note: the signature and unsubscribe link are appended at send time
        // (using the user's configured signature from Settings), not here --
        // baking a hardcoded signature into the generated body would double up
        // with the real one added when the email is actually sent.
        return {
          ...result,
          bodyWithoutSignature: result.body,
        };
      }),
  }),

  // ============ Scheduled Emails Router ============
  scheduledEmails: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getScheduledEmailsByUserId(ctx.user.id);
    }),

    schedule: protectedProcedure
      .input(z.object({
        leadId: z.number(),
        subject: z.string().min(1),
        emailBody: z.string().min(1),
        scheduledFor: z.string(), // ISO date string
      }))
      .mutation(async ({ input, ctx }) => {
        const lead = await db.getLeadById(input.leadId);
        if (lead && (lead as any).unsubscribed) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This lead has unsubscribed and can't be scheduled for future emails." });
        }
        const id = await db.createScheduledEmail({
          userId: ctx.user.id,
          leadId: input.leadId,
          subject: input.subject,
          emailBody: input.emailBody,
          scheduledFor: new Date(input.scheduledFor).toISOString(),
          status: "pending",
        });
        return { success: true, id };
      }),

    cancel: protectedProcedure
      .input(z.number())
      .mutation(async ({ input: id }) => {
        await db.cancelScheduledEmail(id);
        return { success: true };
      }),
  }),

  // ============ Campaign Templates Router ============
  campaignTemplates: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getCampaignTemplatesByUserId(ctx.user.id);
    }),

    get: protectedProcedure.input(z.number()).query(async ({ input: id }) => {
      return db.getCampaignTemplateById(id);
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        subject: z.string().min(1),
        emailTemplate: z.string().min(1),
        emailType: z.enum(["discovery", "value_prop", "social_proof", "urgency", "custom"]).optional(),
        tags: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const id = await db.createCampaignTemplate({
          userId: ctx.user.id,
          name: input.name,
          description: input.description,
          subject: input.subject,
          emailTemplate: input.emailTemplate,
          emailType: input.emailType || "custom",
          tags: input.tags,
          usageCount: 0,
        });
        return { success: true, id };
      }),

    saveFromCampaign: protectedProcedure
      .input(z.object({
        campaignId: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
        tags: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const campaign = await db.getCampaignById(input.campaignId);
        if (!campaign || campaign.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const id = await db.createCampaignTemplate({
          userId: ctx.user.id,
          name: input.name,
          description: input.description || campaign.description || "",
          subject: campaign.subject,
          emailTemplate: campaign.emailTemplate,
          emailType: "custom",
          tags: input.tags,
          usageCount: 0,
        });
        return { success: true, id };
      }),

    delete: protectedProcedure
      .input(z.number())
      .mutation(async ({ input: id }) => {
        await db.deleteCampaignTemplate(id);
        return { success: true };
      }),

    incrementUsage: protectedProcedure
      .input(z.number())
      .mutation(async ({ input: id }) => {
        await db.incrementTemplateUsage(id);
        return { success: true };
      }),
  }),

  // ============ Lead Deduplication Check ============
  dedup: router({
    check: protectedProcedure
      .input(z.object({
        emails: z.array(z.string().min(1)),
      }))
      .mutation(async ({ input, ctx }) => {
        const existingLeads = await db.getLeadsByEmails(input.emails, ctx.user.id);
        const duplicateEmails = existingLeads.map((l: any) => l.email);
        return { duplicates: duplicateEmails };
      }),
  }),

  // ============ Analytics Router ============
  analytics: router({
    overview: protectedProcedure.query(async ({ ctx }) => {
      const allCampaigns = await db.getCampaignsByUserId(ctx.user.id);
      const allLeads = await db.getLeadsByUserId(ctx.user.id);

      let totalSent = 0;
      let totalOpened = 0;
      let totalClicked = 0;
      let totalCalls = 0;
      let totalReplied = 0;
      const campaignMetrics: Array<{
        id: number;
        name: string;
        status: string;
        totalLeads: number;
        sent: number;
        opened: number;
        clicked: number;
        calls: number;
        bounced: number;
        replied: number;
        openRate: number;
        clickRate: number;
        bounceRate: number;
        replyRate: number;
        createdAt: Date;
      }> = [];

      for (const campaign of allCampaigns) {
        const campaignLeadsList = await db.getCampaignLeads(campaign.id);
        const sent = campaignLeadsList.filter((cl: any) => cl.emailSent).length;
        const opened = campaignLeadsList.filter((cl: any) => cl.emailOpened).length;
        const clicked = campaignLeadsList.filter((cl: any) => cl.emailClicked).length;
        const calls = campaignLeadsList.filter((cl: any) => cl.callTriggered).length;
        const bounced = campaignLeadsList.filter((cl: any) => cl.emailBounced).length;
        const replied = campaignLeadsList.filter((cl: any) => cl.replied).length;

        totalSent += sent;
        totalOpened += opened;
        totalClicked += clicked;
        totalCalls += calls;
        totalReplied += replied;

        campaignMetrics.push({
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          totalLeads: campaignLeadsList.length,
          sent,
          opened,
          clicked,
          calls,
          bounced,
          replied,
          openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
          clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
          bounceRate: sent > 0 ? Math.round((bounced / sent) * 100) : 0,
          replyRate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
          createdAt: campaign.createdAt ? new Date(campaign.createdAt) : new Date(),
        });
      }

      // Social outreach global stats
      let socialTotals = { sent: 0, accepted: 0, pending: 0, linkedin: { sent: 0, accepted: 0 }, instagram: { sent: 0, accepted: 0 }, facebook: { sent: 0, accepted: 0 } };
      try {
        const { socialOutreach } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const database = await db.getDb();
        if (database) {
          const allOutreach = await database.select().from(socialOutreach).where(eq(socialOutreach.userId, ctx.user.id));
          // "accepted" is reported manually via social.markResponse (there's no
          // platform API to detect it automatically).
          for (const so of allOutreach) {
            const platform = (so as any).platform as "linkedin" | "instagram" | "facebook";
            const status = (so as any).status;
            if (status === "sent") {
              socialTotals.sent++;
              if (socialTotals[platform]) socialTotals[platform].sent++;
              if ((so as any).responseStatus === "accepted") {
                socialTotals.accepted++;
                if (socialTotals[platform]) socialTotals[platform].accepted++;
              }
            } else if (status === "pending") {
              socialTotals.pending++;
            }
          }
        }
      } catch (e) { /* optional */ }

      return {
        totals: {
          campaigns: allCampaigns.length,
          leads: allLeads.length,
          emailsSent: totalSent,
          emailsOpened: totalOpened,
          emailsClicked: totalClicked,
          callsMade: totalCalls,
          emailsReplied: totalReplied,
          overallOpenRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
          overallClickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0,
          overallReplyRate: totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0,
          socialOutreach: socialTotals,
        },
        campaigns: campaignMetrics,
      };
    }),

    // Time-series data for charts (aggregated by campaign creation date)
    timeSeries: protectedProcedure.query(async ({ ctx }) => {
      const allCampaigns = await db.getCampaignsByUserId(ctx.user.id);
      const dataPoints: Array<{
        date: string;
        sent: number;
        opened: number;
        clicked: number;
        calls: number;
        openRate: number;
        clickRate: number;
      }> = [];

      // Group campaigns by date and aggregate metrics
      const dateMap = new Map<string, { sent: number; opened: number; clicked: number; calls: number }>();

      for (const campaign of allCampaigns) {
        const campaignLeadsList = await db.getCampaignLeads(campaign.id);
        const dateKey = campaign.createdAt ? new Date(campaign.createdAt).toISOString().split("T")[0] : "unknown";

        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, { sent: 0, opened: 0, clicked: 0, calls: 0 });
        }
        const entry = dateMap.get(dateKey)!;
        for (const cl of campaignLeadsList) {
          if ((cl as any).emailSent) entry.sent++;
          if ((cl as any).emailOpened) entry.opened++;
          if ((cl as any).emailClicked) entry.clicked++;
          if ((cl as any).callTriggered) entry.calls++;
        }
      }

      // Sort by date
      const sortedDates = Array.from(dateMap.keys()).sort();
      for (const date of sortedDates) {
        const entry = dateMap.get(date)!;
        const openRate = entry.sent > 0 ? Math.round((entry.opened / entry.sent) * 100) : 0;
        const clickRate = entry.sent > 0 ? Math.round((entry.clicked / entry.sent) * 100) : 0;
        dataPoints.push({ date, ...entry, openRate, clickRate });
      }

      return dataPoints;
    }),

    // Best-performing templates with computed open/click rates from linked campaigns
    topTemplates: protectedProcedure.query(async ({ ctx }) => {
      const templates = await db.getCampaignTemplatesByUserId(ctx.user.id);
      const allCampaigns = await db.getCampaignsByUserId(ctx.user.id);

      // For each template, find campaigns linked via templateId (primary) or subject match (fallback)
      const enriched = await Promise.all(
        templates.map(async (t: any) => {
          const matchingCampaigns = allCampaigns.filter(
            (c: any) => c.templateId === t.id || (!c.templateId && c.subject === t.subject)
          );
          let totalSent = 0;
          let totalOpened = 0;
          let totalClicked = 0;

          for (const campaign of matchingCampaigns) {
            const cls = await db.getCampaignLeads(campaign.id);
            for (const cl of cls) {
              if ((cl as any).emailSent) totalSent++;
              if ((cl as any).emailOpened) totalOpened++;
              if ((cl as any).emailClicked) totalClicked++;
            }
          }

          return {
            id: t.id,
            name: t.name,
            emailType: t.emailType,
            usageCount: t.usageCount || 0,
            subject: t.subject,
            tags: t.tags,
            totalSent,
            totalOpened,
            totalClicked,
            openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
            clickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0,
          };
        })
      );

      // Sort by open rate descending, then usage count
      return enriched
        .sort((a, b) => b.openRate - a.openRate || b.usageCount - a.usageCount)
        .slice(0, 10);
    }),
  }),

  // ============ Lead Sets ============
  leadSets: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getLeadSetsByUserId(ctx.user.id);
    }),

    listTags: protectedProcedure.query(async ({ ctx }) => {
      const all = await db.getLeadSetsByUserId(ctx.user.id);
      return all.filter((s: any) => s.type === "tag");
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.createLeadSet({
          userId: ctx.user.id,
          name: input.name,
          description: input.description || null,
          type: "tag",
        });
        return { id };
      }),

    rename: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const set = await db.getLeadSetById(input.id);
        if (!set || set.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Lead set not found" });
        }
        await db.updateLeadSet(input.id, { name: input.name });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const set = await db.getLeadSetById(input.id);
        if (!set || set.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Lead set not found" });
        }
        await db.deleteLeadSet(input.id);
        return { success: true };
      }),

    merge: protectedProcedure
      .input(z.object({
        sourceSetId: z.number(),
        targetSetId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const sourceSet = await db.getLeadSetById(input.sourceSetId);
        const targetSet = await db.getLeadSetById(input.targetSetId);
        if (!sourceSet || sourceSet.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Source set not found" });
        }
        if (!targetSet || targetSet.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Target set not found" });
        }
        // Move all leads from source to target
        const sourceLeads = await db.getLeadsBySetId(input.sourceSetId, ctx.user.id);
        if (sourceLeads.length > 0) {
          await db.assignLeadsToSet(sourceLeads.map(l => l.id), input.targetSetId);
        }
        // Delete the source set
        await db.deleteLeadSet(input.sourceSetId);
        return { success: true, mergedCount: sourceLeads.length };
      }),

    assignLeads: protectedProcedure
      .input(z.object({
        leadIds: z.array(z.number()).min(1),
        leadSetId: z.number().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verify the lead set belongs to the user (if not null)
        if (input.leadSetId !== null) {
          const set = await db.getLeadSetById(input.leadSetId);
          if (!set || set.userId !== ctx.user.id) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Lead set not found" });
          }
        }
        await db.assignLeadsToSet(input.leadIds, input.leadSetId);
        return { success: true, count: input.leadIds.length };
      }),
  }),

  // ============ Rotational Emails Router ============
  rotationalEmails: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getRotationalEmailsByUser(ctx.user.id);
    }),

    upsert: protectedProcedure
      .input(z.object({
        email: z.string().email(),
        smtpHost: z.string().min(1),
        smtpPort: z.number().default(587),
        smtpUsername: z.string().min(1),
        smtpPassword: z.string().min(1),
        senderName: z.string().optional(),
        dayOfWeek: z.number().min(1).max(5), // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
        isActive: z.boolean().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.upsertRotationalEmail({
          userId: ctx.user.id,
          email: input.email,
          smtpHost: input.smtpHost,
          smtpPort: input.smtpPort,
          smtpUsername: input.smtpUsername,
          smtpPassword: input.smtpPassword,
          senderName: input.senderName || null,
          dayOfWeek: input.dayOfWeek,
          isActive: input.isActive ? 1 : 0,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.number())
      .mutation(async ({ input: id }) => {
        await db.deleteRotationalEmail(id);
        return { success: true };
      }),

    // Test a specific rotational SMTP account by sending a test email through it
    testAccount: protectedProcedure
      .input(z.object({
        accountId: z.number().optional(), // If provided, test existing account by ID
        // Or test with provided credentials directly (for testing before saving)
        email: z.string().email().optional(),
        smtpHost: z.string().optional(),
        smtpPort: z.number().optional(),
        smtpUsername: z.string().optional(),
        smtpPassword: z.string().optional(),
        senderName: z.string().optional(),
        testEmail: z.string().email().optional(), // Where to send the test
      }))
      .mutation(async ({ input, ctx }) => {
        let host: string, port: number, username: string, password: string, senderEmail: string, senderName: string;

        if (input.accountId) {
          // Test an existing saved rotational account
          const accounts = await db.getRotationalEmailsByUser(ctx.user.id);
          const account = accounts.find(a => a.id === input.accountId);
          if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Rotational account not found" });
          host = account.smtpHost;
          port = account.smtpPort;
          username = account.smtpUsername;
          password = account.smtpPassword;
          senderEmail = account.email;
          senderName = account.senderName || account.email;
        } else {
          // Test with provided credentials
          if (!input.email || !input.smtpHost || !input.smtpUsername || !input.smtpPassword) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Please provide email, SMTP host, username, and password to test." });
          }
          host = input.smtpHost;
          port = input.smtpPort || 587;
          username = input.smtpUsername;
          password = input.smtpPassword;
          senderEmail = input.email;
          senderName = input.senderName || input.email;
        }

        // Determine recipient
        const recipientEmail = input.testEmail || senderEmail;

        try {
          const transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: { user: username, pass: password },
          });

          // Verify connection first
          await transporter.verify();

          // Send test email FROM this specific account
          await transporter.sendMail({
            from: `"${senderName}" <${senderEmail}>`,
            to: recipientEmail,
            subject: `[SMTP Test] Verification from ${senderEmail}`,
            html: `<div style="font-family:sans-serif;padding:20px;"><h3 style="color:#16a34a;">\u2705 SMTP Account Verified</h3><p>This test email was sent <strong>directly from</strong>: <code>${senderEmail}</code></p><p>SMTP Host: <code>${host}:${port}</code></p><p>Username: <code>${username}</code></p><p style="color:#6b7280;font-size:12px;margin-top:20px;">If you received this email, the SMTP credentials for this rotational account are working correctly.</p></div>`,
          });

          return { success: true, message: `Test email sent from ${senderEmail} to ${recipientEmail}` };
        } catch (err: any) {
          console.error(`[Rotational SMTP Test] Failed for ${senderEmail}:`, err.message);
          const errorMsg = err.code === "EAUTH"
            ? `Authentication failed for ${senderEmail}. Check username and password.`
            : err.code === "ECONNREFUSED"
            ? `Could not connect to ${host}:${port}. Check host and port.`
            : err.code === "ESOCKET"
            ? `Connection timed out to ${host}:${port}. Try port 587 or 465.`
            : `SMTP test failed for ${senderEmail}: ${err.message}`;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: errorMsg });
        }
      }),
  }),

  // ============ Lead Response Management ============
  responses: router({
    markReplied: protectedProcedure
      .input(z.object({
        campaignLeadId: z.number(),
        responseStatus: z.enum(["positive", "negative", "neutral"]).default("positive"),
      }))
      .mutation(async ({ input }) => {
        await db.markLeadReplied(input.campaignLeadId, input.responseStatus);
        // Cancel all pending follow-ups when lead replies
        await db.cancelPendingFollowUps(input.campaignLeadId);
        return { success: true };
      }),

    markUnsubscribed: protectedProcedure
      .input(z.object({
        campaignLeadId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await db.markLeadUnsubscribed(input.campaignLeadId);
        // Cancel all pending follow-ups when lead unsubscribes
        await db.cancelPendingFollowUps(input.campaignLeadId);
        return { success: true };
      }),
  }),

  // Social outreach message generation
  social: router({
    // Generate a social outreach message using AI
    generateMessage: protectedProcedure
      .input(z.object({
        leadId: z.number(),
        platform: z.enum(["linkedin", "instagram", "facebook"]),
        messageType: z.enum(["connection_request", "direct_message"]),
        tone: z.string().optional(),
        context: z.string().optional(), // Additional context like "they didn't reply to 1st follow-up"
      }))
      .mutation(async ({ input, ctx }) => {
        const lead = await db.getLeadById(input.leadId);
        if (!lead || lead.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const settings = await db.getUserSettings(ctx.user.id);
        const charLimit = settings?.socialMessageCharLimit || 300;

        const platformGuides: Record<string, string> = {
          linkedin: "LinkedIn: Professional tone, mention mutual connections or industry relevance. Keep connection request notes under 200 chars.",
          instagram: "Instagram: Casual but professional DM. Keep it brief, engaging, and personal.",
          facebook: "Facebook: Friendly and professional. Reference their business page or recent activity.",
        };
        const typeGuides: Record<string, string> = {
          connection_request: "This is a connection/follow request note. Be very brief, mention why you want to connect. Do NOT pitch services directly.",
          direct_message: "This is a direct message after connecting. Be personable, reference their work, and include a subtle value proposition.",
        };

        const response = await invokeLLM({
          messages: [
            { role: "system", content: `You are a social media outreach expert. Generate a personalized ${input.platform} ${input.messageType.replace("_", " ")} message.
${platformGuides[input.platform]}
${typeGuides[input.messageType]}
${input.tone ? "Tone: " + input.tone : ""}
${input.context ? "Context: " + input.context : ""}
IMPORTANT: Keep the message under ${charLimit} characters. Do NOT use hashtags. Do NOT be salesy. Be genuine and human.
Return ONLY the message text, nothing else.` },
            { role: "user", content: `Generate a ${input.platform} ${input.messageType.replace("_", " ")} for:
Name: ${lead.ownerName}
Company: ${lead.companyName}
Industry: ${lead.industry || "Unknown"}
Website: ${lead.website || "N/A"}` },
          ],
        });
        const content = response.choices?.[0]?.message?.content;
        let message = typeof content === "string" ? content.trim() : "";
        // Enforce character limit
        if (message.length > charLimit) {
          message = message.slice(0, charLimit - 3) + "...";
        }
        return { message, platform: input.platform, messageType: input.messageType, characterCount: message.length, charLimit };
      }),

    // Send/queue a social outreach message (records it in DB)
    send: protectedProcedure
      .input(z.object({
        leadId: z.number(),
        platform: z.enum(["linkedin", "instagram", "facebook"]),
        messageType: z.enum(["connection_request", "direct_message"]),
        message: z.string().min(1),
        campaignLeadId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const lead = await db.getLeadById(input.leadId);
        if (!lead || lead.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const settings = await db.getUserSettings(ctx.user.id);
        const charLimit = settings?.socialMessageCharLimit || 300;

        // Anti-spam: per-platform, per-action-type daily limit
        const { socialOutreach } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        const platformDailyLimit = db.getSocialDailyLimit(settings, input.platform, input.messageType);
        const todayCount = await db.getSocialCountToday(ctx.user.id, input.platform, input.messageType);
        if (todayCount >= platformDailyLimit) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Daily limit reached: ${platformDailyLimit} ${input.messageType.replace("_", " ")}(s) on ${input.platform} per day. Try again tomorrow to avoid policy violations.` });
        }

        // Character limit check
        if (input.message.length > charLimit) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Message exceeds ${charLimit} character limit (${input.message.length} chars).` });
        }

        // Determine profile URL
        const profileUrl = input.platform === "linkedin" ? lead.linkedinUrl :
          input.platform === "instagram" ? lead.instagramUrl :
          (lead as any).facebookUrl;

        if (!profileUrl) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `No ${input.platform} profile URL found for this lead. Please add it first.` });
        }

        // Check if we already sent (or auto-queued) a connection request to
        // this lead on this platform -- includes "pending" so this doesn't
        // create a duplicate alongside one already queued by the automated
        // follow-up flow.
        if (input.messageType === "connection_request") {
          const { inArray } = await import("drizzle-orm");
          const existing = await database.select().from(socialOutreach).where(
            and(
              eq(socialOutreach.leadId, input.leadId),
              eq(socialOutreach.platform, input.platform),
              eq(socialOutreach.messageType, "connection_request"),
              inArray(socialOutreach.status, ["sent", "pending"])
            )
          );
          if (existing.length > 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `A connection request is already sent or queued for this lead on ${input.platform}.` });
          }
        }

        // Record the outreach
        await database.insert(socialOutreach).values({
          userId: ctx.user.id,
          leadId: input.leadId,
          campaignLeadId: input.campaignLeadId || null,
          platform: input.platform,
          messageType: input.messageType,
          message: input.message,
          status: "sent",
          sentAt: new Date(),
          profileUrl,
          characterCount: input.message.length,
        });

        return { success: true, profileUrl, message: input.message, characterCount: input.message.length };
      }),

    // Mark a queued (pending) social outreach message as actually sent.
    // Used by the Message Queue page once the user has copied the message and
    // sent it themselves on the platform (there's no direct API integration).
    markSent: protectedProcedure
      .input(z.number())
      .mutation(async ({ input: id, ctx }) => {
        const { socialOutreach } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        const [existing] = await database.select().from(socialOutreach).where(eq(socialOutreach.id, id));
        if (!existing || (existing as any).userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        await database.update(socialOutreach)
          .set({ status: "sent", sentAt: new Date() } as any)
          .where(eq(socialOutreach.id, id));

        return { success: true };
      }),

    // Delete a queued/sent social outreach message from the queue
    delete: protectedProcedure
      .input(z.number())
      .mutation(async ({ input: id, ctx }) => {
        const { socialOutreach } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        const [existing] = await database.select().from(socialOutreach).where(eq(socialOutreach.id, id));
        if (!existing || (existing as any).userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        await database.delete(socialOutreach).where(eq(socialOutreach.id, id));
        return { success: true };
      }),

    // Record what happened after a message was sent -- there's no platform
    // API integration, so the user reports back after checking LinkedIn/
    // Instagram/Facebook themselves (did they accept the connection, reply,
    // or decline).
    markResponse: protectedProcedure
      .input(z.object({
        id: z.number(),
        responseStatus: z.enum(["none", "accepted", "replied", "declined"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const { socialOutreach } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        const [existing] = await database.select().from(socialOutreach).where(eq(socialOutreach.id, input.id));
        if (!existing || (existing as any).userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        await database.update(socialOutreach)
          .set({
            responseStatus: input.responseStatus,
            respondedAt: input.responseStatus === "none" ? null : new Date(),
          } as any)
          .where(eq(socialOutreach.id, input.id));

        return { success: true };
      }),

    // List all social outreach for a lead
    listByLead: protectedProcedure
      .input(z.number())
      .query(async ({ input: leadId, ctx }) => {
        const lead = await db.getLeadById(leadId);
        if (!lead || lead.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const { socialOutreach } = await import("../drizzle/schema");
        const { eq, desc } = await import("drizzle-orm");
        const database = await db.getDb();
        if (!database) return [];
        return database.select().from(socialOutreach).where(eq(socialOutreach.leadId, leadId)).orderBy(desc(socialOutreach.createdAt));
      }),

    // List all social outreach for user (for reporting)
    listAll: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(50) }).optional())
      .query(async ({ ctx, input }) => {
        const { socialOutreach } = await import("../drizzle/schema");
        const { eq, desc } = await import("drizzle-orm");
        const database = await db.getDb();
        if (!database) return [];
        return database.select().from(socialOutreach).where(eq(socialOutreach.userId, ctx.user.id)).orderBy(desc(socialOutreach.createdAt)).limit(input?.limit || 50);
      }),

    // Pre-send checklist validation
    validateOutreach: protectedProcedure
      .input(z.object({
        leadId: z.number(),
        platform: z.enum(["linkedin", "instagram", "facebook"]),
        messageType: z.enum(["connection_request", "direct_message"]),
        message: z.string(),
      }))
      .query(async ({ input, ctx }) => {
        const lead = await db.getLeadById(input.leadId);
        if (!lead || lead.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const settings = await db.getUserSettings(ctx.user.id);
        const charLimit = settings?.socialMessageCharLimit || 300;
        const dailyLimit = db.getSocialDailyLimit(settings, input.platform, input.messageType);

        const checks: { name: string; passed: boolean; message: string }[] = [];

        // Check 1: Profile URL exists
        const profileUrl = input.platform === "linkedin" ? lead.linkedinUrl :
          input.platform === "instagram" ? lead.instagramUrl :
          (lead as any).facebookUrl;
        checks.push({
          name: "Profile URL",
          passed: !!profileUrl,
          message: profileUrl ? `${input.platform} profile found` : `No ${input.platform} profile URL for this lead`,
        });

        // Check 2: Character limit
        checks.push({
          name: "Character Limit",
          passed: input.message.length <= charLimit,
          message: `${input.message.length}/${charLimit} characters`,
        });

        // Check 3: Daily limit (per-platform, per-action-type)
        const { socialOutreach } = await import("../drizzle/schema");
        const { eq, and, inArray } = await import("drizzle-orm");
        const database = await db.getDb();
        const todayCount = await db.getSocialCountToday(ctx.user.id, input.platform, input.messageType);
        checks.push({
          name: "Daily Limit",
          passed: todayCount < dailyLimit,
          message: `${todayCount}/${dailyLimit} ${input.messageType.replace("_", " ")}(s) on ${input.platform} today`,
        });

        // Check 4: No duplicate connection request
        if (input.messageType === "connection_request" && database) {
          const existing = await database.select().from(socialOutreach).where(
            and(
              eq(socialOutreach.leadId, input.leadId),
              eq(socialOutreach.platform, input.platform),
              eq(socialOutreach.messageType, "connection_request"),
              inArray(socialOutreach.status, ["sent", "pending"])
            )
          );
          checks.push({
            name: "No Duplicate",
            passed: existing.length === 0,
            message: existing.length === 0 ? "No previous connection request" : "Connection request already sent",
          });
        }

        // Check 5: Message not too spammy (no excessive caps, links, or emojis)
        const capsRatio = (input.message.match(/[A-Z]/g) || []).length / Math.max(input.message.length, 1);
        const linkCount = (input.message.match(/https?:\/\//g) || []).length;
        checks.push({
          name: "Spam Check",
          passed: capsRatio < 0.5 && linkCount <= 1,
          message: capsRatio >= 0.5 ? "Too many capital letters" : linkCount > 1 ? "Too many links" : "Message looks natural",
        });

        const allPassed = checks.every(c => c.passed);
        return { checks, allPassed };
      }),
  }),
  webhooks: router({
    // Get recent webhook events (with optional date range filter)
    list: protectedProcedure
      .input(z.object({
        limit: z.number().min(1).max(500).default(100),
        startDate: z.string().optional(), // ISO date string
        endDate: z.string().optional(), // ISO date string
      }).optional())
      .query(async ({ ctx, input }) => {
        const userId = ctx.user!.id;
        return db.getWebhookEvents(userId, input?.limit || 100, input?.startDate, input?.endDate);
      }),

    // Clear webhook events for a date range
    clear: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional())
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user!.id;
        await db.clearWebhookEvents(userId, input?.startDate, input?.endDate);
        return { success: true };
      }),

    // Get webhook stats (counts + last event times)
    stats: protectedProcedure
      .query(async ({ ctx }) => {
        const userId = ctx.user!.id;
        return db.getWebhookStats(userId);
      }),

    // Send a test webhook event (for verifying connectivity)
    sendTest: protectedProcedure
      .input(z.object({
        type: z.enum(["calendly_booking", "email_reply"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user!.id;
        await db.createWebhookEvent({
          userId,
          webhookType: input.type,
          status: "success",
          sourceEmail: "test@example.com",
          payload: { test: true, triggeredAt: new Date().toISOString() },
        });
        return { success: true };
      }),
  }),

  // ============ Website Analysis Router (SimilarWeb Integration) ============
  websiteAnalysis: router({
    analyze: protectedProcedure
      .input(z.object({
        domain: z.string().min(3), // Domain or URL to analyze
      }))
      .mutation(async ({ input }) => {
        const { analyzeWebsite, generateInsightsSummary } = await import("./websiteAnalysis");
        const insights = await analyzeWebsite(input.domain);
        const summary = generateInsightsSummary(insights);
        return { insights, summary };
      }),

    // Generate a personalized email using website insights
    generatePersonalizedEmail: protectedProcedure
      .input(z.object({
        leadId: z.number(),
        websiteInsightsSummary: z.string(), // Pre-analyzed summary
        emailType: z.enum(["discovery", "value_prop", "social_proof", "urgency", "custom"]).optional(),
        includeVariables: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const lead = await db.getLeadById(input.leadId);
        if (!lead || lead.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
        }

        const leadContext = `Name: ${lead.ownerName}, Company: ${lead.companyName}, Industry: ${lead.industry || "Not specified"}, Email: ${lead.email}, Website: ${lead.website || "Not provided"}`;

        const { generateEmailWithClaude } = await import("./claude");
        const insightSettings = await db.getUserSettings(ctx.user.id);

        const prompt = `Write a highly personalized cold email to ${lead.ownerName} at ${lead.companyName} based on their ACTUAL website data analysis below. Reference specific metrics and issues from their website to show we've done our homework.

WEBSITE ANALYSIS DATA:
${input.websiteInsightsSummary}

Use the website data to:
1. Reference their actual traffic numbers or ranking
2. Identify specific problems their website has (high bounce rate, low organic traffic, missing keywords, etc.)
3. Explain how Virtual Assistant Group's services (SEO content writing, social media management, lead generation, admin support) can directly solve THEIR specific problems
4. Make it feel like a genuine analysis, not a generic pitch`;

        // Also fetch structured website analysis for richer context
        let websiteAnalysisData: any = undefined;
        try {
          const storedInsights = await db.getWebsiteInsights(lead.id);
          if (storedInsights) {
            websiteAnalysisData = {
              competitors: storedInsights.competitors as any[] || [],
              competitorGaps: storedInsights.competitorGaps as any[] || [],
              recentNews: storedInsights.recentNews as any[] || [],
              industryInsights: storedInsights.industryInsights as string[] || [],
              insightsSummary: storedInsights.insightsSummary || undefined,
              totalVisits: storedInsights.totalVisits,
              bounceRate: storedInsights.bounceRate,
              topKeywords: storedInsights.topKeywords as any[] || [],
            };
          }
        } catch (e) { /* continue without */ }

        const result = await generateEmailWithClaude({
          prompt,
          emailType: input.emailType || "value_prop",
          leadContext,
          includeVariables: input.includeVariables || false,
          ctaLink: insightSettings?.ctaLink || undefined,
          websiteAnalysis: websiteAnalysisData,
        });

        // Note: the signature and unsubscribe link are appended at send time
        // (using the user's configured signature from Settings), not here --
        // baking a hardcoded signature into the generated body would double up
        // with the real one added when the email is actually sent.
        return {
          ...result,
          bodyWithoutSignature: result.body,
        };
      }),
  }),

  // Email Verification via Bouncer API
  verification: router({
    // Verify emails via Bouncer before campaign send
    verifyEmails: protectedProcedure
      .input(z.object({
        campaignId: z.string().optional(),
        leadIds: z.array(z.string()).optional(),
        emails: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { validateEmails, shouldSendToEmail, getCreditsBalance } = await import("./bouncer");
        const settings = await db.getUserSettings(ctx.user.id);
        if (!settings?.bouncerApiKey) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Bouncer API key not configured. Go to Settings → Deliverability to add it." });
        }

        // Get emails to verify
        let emailsToVerify: { email: string; leadId?: string }[] = [];

        if (input.emails && input.emails.length > 0) {
          emailsToVerify = input.emails.map(e => ({ email: e }));
        } else if (input.campaignId) {
          const cls = await db.getCampaignLeads(Number(input.campaignId));
          for (const cl of cls) {
            const lead = await db.getLeadById(cl.leadId);
            if (lead?.email) {
              emailsToVerify.push({ email: lead.email, leadId: String(lead.id) });
            }
          }
        } else if (input.leadIds && input.leadIds.length > 0) {
          for (const leadId of input.leadIds) {
            const lead = await db.getLeadById(Number(leadId));
            if (lead?.email) {
              emailsToVerify.push({ email: lead.email, leadId: String(lead.id) });
            }
          }
        }

        if (emailsToVerify.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No emails to verify" });
        }

        // Check credits first
        try {
          const credits = await getCreditsBalance(settings.bouncerApiKey);
          if (credits < emailsToVerify.length) {
            throw new TRPCError({ 
              code: "BAD_REQUEST", 
              message: `Insufficient Bouncer credits. Need ${emailsToVerify.length}, have ${credits}. Add more credits at usebouncer.com` 
            });
          }
        } catch (e: any) {
          if (e.code === "BAD_REQUEST") throw e;
          // If credit check fails, continue anyway
        }

        // Run verification
        try {
          const summary = await validateEmails(
            settings.bouncerApiKey,
            emailsToVerify.map(e => e.email)
          );

          // Build detailed results with send/don't-send recommendation
          const detailedResults = summary.results.map((r, idx) => {
            const decision = shouldSendToEmail(r);
            return {
              email: r.email,
              leadId: emailsToVerify[idx]?.leadId,
              status: r.status,
              subStatus: r.reason,
              shouldSend: decision.send,
              reason: decision.reason,
              freeEmail: r.domain.free === "yes",
              didYouMean: null as string | null,
              score: r.score,
              toxic: r.toxic,
              toxicity: r.toxicity,
            };
          });

          // Save verification status per lead in the database
          for (const result of detailedResults) {
            if (result.leadId) {
              try {
                await db.updateLead(Number(result.leadId), {
                  emailVerificationStatus: result.status as any,
                  emailVerificationData: {
                    score: result.score,
                    reason: result.subStatus,
                    toxic: result.toxic,
                    toxicity: result.toxicity,
                    shouldSend: result.shouldSend,
                    verifiedAt: new Date().toISOString(),
                  },
                });
              } catch (e: any) {
                console.warn(`[Bouncer] Failed to save verification for lead ${result.leadId}:`, e.message);
              }
            }
          }

          const safeToSend = detailedResults.filter(r => r.shouldSend);
          const doNotSend = detailedResults.filter(r => !r.shouldSend);

          return {
            total: summary.total,
            deliverable: summary.deliverable,
            risky: summary.risky,
            undeliverable: summary.undeliverable,
            unknown: summary.unknown,
            safeToSendCount: safeToSend.length,
            doNotSendCount: doNotSend.length,
            results: detailedResults,
          };
        } catch (e: any) {
          if (e.message === "BOUNCER_INVALID_API_KEY") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Bouncer API key is invalid. Please check your API key in Settings." });
          }
          if (e.message === "BOUNCER_NO_CREDITS") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Bouncer account has no credits remaining. Add more at usebouncer.com" });
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Email verification failed: ${e.message}` });
        }
      }),

    // Get Bouncer credit balance
    getBouncerCredits: protectedProcedure.query(async ({ ctx }) => {
      const { getCreditsBalance } = await import("./bouncer");
      const settings = await db.getUserSettings(ctx.user.id);
      if (!settings?.bouncerApiKey) {
        return { configured: false, credits: 0 };
      }
      try {
        const credits = await getCreditsBalance(settings.bouncerApiKey);
        return { configured: true, credits };
      } catch {
        return { configured: true, credits: -1 };
      }
    }),

    // Inbox test placeholder (no longer uses external service)
    createInboxTest: protectedProcedure
      .input(z.object({
        campaignId: z.string().optional(),
      }))
      .mutation(async ({ ctx }) => {
        const settings = await db.getUserSettings(ctx.user.id);
        if (!settings?.bouncerApiKey) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Bouncer API key not configured. Go to Settings → Deliverability to add it." });
        }
        return {
          testId: "bouncer-verify",
          projectId: 0,
          seedAddresses: [] as string[],
          instructions: "Email verification is handled by Bouncer. Use the 'Verify Emails' button to validate all recipient emails before sending.",
          dashboardUrl: "https://app.usebouncer.com",
          providers: [],
        };
      }),

    // Get inbox test results placeholder
    getInboxTestResults: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        testId: z.string(),
      }))
      .query(async () => {
        return {
          testId: "bouncer-verify",
          status: "completed" as const,
          seedAddresses: [] as string[],
          providers: [],
          overall: {
            inboxRate: 0,
            spamRate: 0,
            promotionsRate: 0,
            recommendation: "review_needed" as const,
            message: "Use Bouncer email verification to validate emails before sending. Visit app.usebouncer.com for your dashboard.",
          },
          dashboardUrl: "https://app.usebouncer.com",
        };
      }),
  }),

  // DISABLED: Browser automation router - using seamlessAIEnrichment (REST API) instead
  // seamlessAIAutomation: seamlessAIAutomationRouter,
  // Seamless.AI Enrichment router (API-first approach)
  seamlessAIEnrichment: seamlessAIEnrichmentRouter,
  // Search Preview router (Search → Preview → Import → Enrich workflow)
  searchPreview: searchPreviewRouter,
  // DEBUG: Hard-coded search test (bypass parser)
  debug: router({
    testHardcodedSearch: publicProcedure.query(async () => {
      return await testHardcodedSeamlessSearch();
    }),
    testIsolatedFilters: publicProcedure.query(async () => {
      return await testIsolatedFilters();
    }),
    testDiagnosticPayload: publicProcedure.query(async () => {
      return await testDiagnosticPayload();
    }),
    testCompanySizeFormats: publicProcedure.query(async () => {
      return await testCompanySizeFormats();
    }),
  }),
});
export type AppRouter = typeof appRouter;
