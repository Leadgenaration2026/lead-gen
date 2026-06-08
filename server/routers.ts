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

// Validation schemas
const createLeadSchema = z.object({
  companyName: z.string().min(1),
  ownerName: z.string().min(1),
  email: z.string().email(),
  phoneNumber: z.string().min(1),
  website: z.string().optional(),
  industry: z.string().optional(),
  customData: z.any().optional(),
});

const createCampaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  subject: z.string().min(1),
  emailTemplate: z.string().min(1),
  leadIds: z.array(z.number()),
  templateId: z.number().optional(),
});

const generateLeadsSchema = z.object({
  instruction: z.string().min(10),
  count: z.number().min(1).max(100),
  leadSetName: z.string().optional(), // Optional: assign generated leads to a named set
  source: z.enum(["ai", "seamless"]).optional().default("ai"),
  country: z.string().optional(),
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
  calendlyWebhookSecret: z.string().optional(),
  retellWebhookSecret: z.string().optional(),
  seamlessApiKey: z.string().optional(),
});

export const appRouter = router({
  system: systemRouter,
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
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getLeadsByUserId(ctx.user.id);
    }),

    get: protectedProcedure.input(z.number()).query(async ({ input: leadId, ctx }) => {
      const lead = await db.getLeadById(leadId);
      if (!lead || lead.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return lead;
    }),

    create: protectedProcedure.input(createLeadSchema).mutation(async ({ input, ctx }) => {
      return db.createLead({
        ...input,
        userId: ctx.user.id,
        status: "new",
      });
    }),

    update: protectedProcedure
      .input(z.object({ id: z.number(), data: z.object({
        companyName: z.string().optional(),
        ownerName: z.string().optional(),
        email: z.string().email().optional(),
        phoneNumber: z.string().optional(),
        website: z.string().optional(),
        industry: z.string().optional(),
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

    addManual: protectedProcedure
      .input(z.object({
        companyName: z.string().min(1),
        ownerName: z.string().min(1),
        email: z.string().email(),
        phoneNumber: z.string().min(1),
        industry: z.string().optional(),
        companySize: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.createLead({
          companyName: input.companyName,
          ownerName: input.ownerName,
          email: input.email,
          phoneNumber: input.phoneNumber,
          industry: input.industry,
          website: undefined,
          customData: { companySize: input.companySize },
          userId: ctx.user.id,
          status: "new",
        });
      }),

    // AI-powered lead generation from natural language
    generate: protectedProcedure
      .input(generateLeadsSchema)
      .mutation(async ({ input, ctx }) => {
        const countryHint = input.country ? `\nIMPORTANT: All leads MUST be from ${input.country}. Use phone numbers, timezones, and domains appropriate for ${input.country}.` : "";
        const prompt = `Generate ${input.count} realistic business leads based on this instruction: "${input.instruction}"${countryHint}
        
Return a JSON array with exactly ${input.count} leads. Each lead must have:
- companyName: string
- ownerName: string  
- email: string (valid email format)
- phoneNumber: string (valid phone format with country code, e.g. +1-555-123-4567)
- website: string (optional, valid URL if provided)
- industry: string (the industry/sector of the business)
- timezone: string (IANA timezone of the lead's location, e.g. "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London")

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

        let leadsData;
        try {
          let content = response.choices[0]?.message?.content;
          // Handle array content (some models return content as array)
          if (Array.isArray(content)) {
            content = content.map((c: any) => typeof c === 'string' ? c : c.text || '').join('');
          }
          if (!content) throw new Error("No response from LLM");
          // Strip markdown code fences if present
          content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
          const parsed = JSON.parse(content);
          // Handle both {leads: [...]} and [...] formats
          leadsData = Array.isArray(parsed) ? parsed : (parsed.leads || parsed.data || Object.values(parsed)[0]);
        } catch (error: any) {
          console.error("Lead generation parse error:", error.message, "Raw response:", JSON.stringify(response.choices?.[0]?.message?.content)?.slice(0, 500));
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
              description: `Auto-created from AI generation: ${input.instruction.slice(0, 100)}`,
            });
          }
        }

        // Create leads in database
        const createdLeads = [];
        for (const leadData of leadsData) {
          try {
            const result = await db.createLead({
              companyName: leadData.companyName || "Unknown",
              ownerName: leadData.ownerName || "Unknown",
              email: leadData.email || "",
              phoneNumber: leadData.phoneNumber || "",
              website: leadData.website,
              industry: leadData.industry,
              timezone: leadData.timezone || "America/New_York",
              userId: ctx.user.id,
              status: "new",
              leadSetId,
            });
            createdLeads.push(result);
          } catch (e) {
            console.error("Failed to create lead:", e);
          }
        }

        return {
          success: true,
          count: createdLeads.length,
          leads: leadsData,
        };
      }),

    // CSV Import - bulk upload leads
    csvImport: protectedProcedure
      .input(z.object({
        leads: z.array(z.object({
          companyName: z.string().min(1),
          ownerName: z.string().min(1),
          email: z.string().email(),
          phoneNumber: z.string().min(1),
          website: z.string().optional(),
          industry: z.string().optional(),
          tag: z.enum(["hot", "warm", "cold", "follow_up", "none"]).optional(),
        })),
        leadSetName: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
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
            });
          }
        }
        const createdLeads = [];
        const errors: string[] = [];
        for (let i = 0; i < input.leads.length; i++) {
          const leadData = input.leads[i];
          try {
            const result = await db.createLead({
              companyName: leadData.companyName,
              ownerName: leadData.ownerName,
              email: leadData.email,
              phoneNumber: leadData.phoneNumber,
              website: leadData.website,
              industry: leadData.industry,
              userId: ctx.user.id,
              status: "new",
              leadSetId,
            });
            // Update tag if provided
            if (leadData.tag && leadData.tag !== "none" && result) {
              await db.updateLead(Number(result), { tag: leadData.tag });
            }
            createdLeads.push(result);
          } catch (e: any) {
            errors.push(`Row ${i + 1}: ${e.message || "Failed to import"}`);
          }
        }
        return { success: true, imported: createdLeads.length, errors };
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
          email: z.string().email(),
          phoneNumber: z.string().min(1),
          website: z.string().optional(),
          industry: z.string().optional(),
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
          status: "draft",
          totalLeads: input.leadIds.length,
        });

        // Add leads to campaign
        if (input.leadIds.length > 0 && campaignId) {
          await db.addLeadsToCampaign(campaignId, input.leadIds);
        }

        return { success: true, campaignId };
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

        // Get user's email signature (uses plain text version for correct display)
        const signature = await db.getEmailSignature(ctx.user.id);
        const signatureHtml = getSignatureHtml(signature);

        // Get campaign leads
        const campaignLeads = await db.getCampaignLeads(campaignId);
        if (campaignLeads.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No leads assigned to this campaign. Add leads before launching.",
          });
        }
        let sentCount = 0;

        // Send emails
        for (const campaignLead of campaignLeads) {
          try {
            const lead = await db.getLeadById(campaignLead.leadId);
            if (!lead) continue;

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

            // Determine the base URL for tracking (use request origin or deployed domain)
            const baseUrl = `${ctx.req.protocol}://${ctx.req.get('host')}`;
            const trackingPixel = `<img src="${baseUrl}/api/track/pixel/${trackingToken}" width="1" height="1" alt="" style="display:none" />`;
            
            // Replace CTA links with tracked versions
            const ctaUrl = 'https://calendly.com/nitin-virtualassistant/30min';
            const trackedCtaUrl = `${baseUrl}/api/track/click/${clickTrackingToken}?url=${encodeURIComponent(ctaUrl)}`;
            let emailBody = personalizedTemplate
              .replace(/{{bookingUrl}}/g, trackedCtaUrl)
              .replace(/{{ctaLink}}/g, trackedCtaUrl)
              .replace(/https:\/\/calendly\.com\/nitin-virtualassistant\/30min/g, trackedCtaUrl);

            // Convert plain text to HTML if needed, append tracking pixel
            // Note: signature is already included in the template from AI generation
            emailBody = plainTextToHtml(emailBody) + trackingPixel;

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
            const rotationalEmail = await db.getRotationalEmailForDay(ctx.user.id, mappedDow);

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

            await transporter.sendMail({
              from: `"${senderDisplayName}" <${senderEmail}>`,
              to: lead.email,
              replyTo: "nitin@virtualassistant-group.com",
              subject: campaign.subject,
              html: emailBody,
              headers: {
                'List-Unsubscribe': `<${unsubscribeUrl}>`,
              },
            });

            // Update campaign lead status
            await db.updateCampaignLead(campaignLead.id, {
              emailSent: true,
              emailSentAt: new Date(),
            });

            sentCount++;
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

        // Update campaign status based on results
        if (sentCount === 0 && campaignLeads.length > 0) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to send any emails. Please check your SMTP settings (host, port, username, password) and try again.",
          });
        }

        await db.updateCampaign(campaignId, {
          status: "active",
          launchedAt: new Date(),
          sentCount,
        });

        // Schedule 7 follow-up emails for each lead (async, don't block)
        const { scheduleFollowUpEmails } = await import("./_core/followUpScheduler");
        const ctaLink = "https://calendly.com/nitin-virtualassistant/30min";
        for (const campaignLead of campaignLeads) {
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
          }
        }

        return { success: true, sentCount };
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
          hasCalendlyWebhookSecret: false,
          hasRetellWebhookSecret: false,
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
        hasCalendlyWebhookSecret: !!settings.calendlyWebhookSecret,
        hasRetellWebhookSecret: !!settings.retellWebhookSecret,
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
          if (key === 'calendlyWebhookSecret' && !value) continue;
          if (key === 'retellWebhookSecret' && !value) continue;
          if (key === 'seamlessApiKey' && !value) continue;
          cleanedInput[key] = value;
        }
        
        await db.upsertUserSettings({
          userId: ctx.user.id,
          ...cleanedInput,
        });
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

          // Calculate email stats
          const emailsDone = followUpEmailsList.filter((e: any) => ["sent", "opened", "clicked"].includes(e.status));
          const emailsPending = followUpEmailsList.filter((e: any) => ["draft", "scheduled"].includes(e.status));
          const emailsFailed = followUpEmailsList.filter((e: any) => e.status === "failed");

          // Calculate call stats
          const callsDone = followUpCallsList.filter((c: any) => ["completed", "in_progress", "no_answer", "voicemail", "failed"].includes(c.status));
          const callsPending = followUpCallsList.filter((c: any) => ["scheduled", "initiated", "ringing"].includes(c.status));

          report.push({
            leadId: lead.id,
            leadName: lead.ownerName,
            companyName: lead.companyName,
            email: lead.email,
            phone: lead.phoneNumber,
            // Initial email status
            initialEmail: {
              sent: cl.emailSent,
              sentAt: cl.emailSentAt,
              opened: cl.emailOpened,
              openedAt: cl.emailOpenedAt,
              clicked: cl.emailClicked,
              clickedAt: cl.emailClickedAt,
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
          },
          leads: report,
        };
      }),
  }),

  // Email tracking router - actual tracking handled by Express routes
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
4. If unsubscribe link is missing, add "If you'd like to opt out of future emails, simply reply with 'unsubscribe'." at the end
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

        // Get user signature
        const signature = await db.getEmailSignature(ctx.user.id);
        const settings = await db.getUserSettings(ctx.user.id);
        const ctaLink = input.ctaLink || "https://calendly.com/nitin-virtualassistant/30min";

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
${problemContext}

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

        // Append signature if available
        let fullBody = emailBody;
        const sigHtml = getSignatureHtml(signature);
        if (sigHtml) {
          fullBody += sigHtml;
        }

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

        // Get user's email signature (uses plain text version for correct display)
        const signature = await db.getEmailSignature(ctx.user.id);
        const signatureHtml = getSignatureHtml(signature);

        // Use request origin for tracking URL
        const baseUrl = `${ctx.req.protocol}://${ctx.req.get('host')}`;
        const trackingPixel = `<img src="${baseUrl}/api/track/pixel/${trackingToken}" width="1" height="1" style="display:none" />`;

        // Create click tracking token for CTA links
        const clickTrackingToken = nanoid();
        // Wrap all links in the email body with click tracking
        const linkRegex = /href=["']([^"']*)["']/g;
        const trackedBody = input.body.replace(linkRegex, (match, url) => {
          if (url.startsWith('http')) {
            return `href="${baseUrl}/api/track/click/${clickTrackingToken}?url=${encodeURIComponent(url)}"`;
          }
          return match;
        });

        
        // Convert plain text to HTML if needed, append signature
        const htmlBody = plainTextToHtml(trackedBody) + signatureHtml + trackingPixel;

        try {
          await transporter.sendMail({
            from: `"${fromName || "Lead Gen Pro"}" <${fromEmail}>`,
            to: lead.email,
            subject: input.subject,
            html: htmlBody,
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
                emailSent: true,
                emailSentAt: new Date(),
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

        // Get user's email signature (uses plain text version for correct display)
        const signature = await db.getEmailSignature(ctx.user.id);
        const signatureHtml = getSignatureHtml(signature);

        // Add a [TEST] prefix to subject
        const testSubject = `[TEST PREVIEW] ${input.subject}`;
        const testBanner = `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:12px 16px;margin-bottom:20px;font-family:sans-serif;font-size:14px;color:#92400e;"><strong>\u26A0\uFE0F Test Preview</strong> \u2014 This is a preview of how your email will look. The actual email sent to the lead will not include this banner.</div>`;
        // Convert plain text to HTML if needed, append signature
        const htmlBody = testBanner + plainTextToHtml(input.body) + signatureHtml;

        try {
          await transporter.sendMail({
            from: `"${settings.senderName || "Lead Gen Pro"}" <${settings.senderEmail || settings.smtpUsername}>`,
            to: recipientEmail,
            replyTo: "nitin@virtualassistant-group.com",
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

        const { generateEmailWithClaude } = await import("./claude");

        const result = await generateEmailWithClaude({
          prompt: input.prompt,
          emailType: input.emailType || undefined,
          companyContext: input.companyContext || undefined,
          leadContext: leadContext || undefined,
          includeVariables: input.includeVariables || false,
          problemAnalysis,
        });

        // Append signature to the generated template (same as single email)
        const signature = await db.getEmailSignature(ctx.user.id);
        let fullBody = result.body;
        if (signature) {
          const sigText = signature.signaturePlainText || signature.signatureHtml.replace(/<[^>]*>/g, "");
          fullBody += "\n\nLet me know if you have any questions or concerns.\n\nThank you\n\n" + sigText;
        }

        // Add unsubscribe line for bulk templates
        if (input.includeVariables) {
          fullBody += "\n\n---\nIf you'd like to opt out of future emails, simply reply with 'unsubscribe'.";
        }

        return {
          ...result,
          body: fullBody,
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
        const id = await db.createScheduledEmail({
          userId: ctx.user.id,
          leadId: input.leadId,
          subject: input.subject,
          emailBody: input.emailBody,
          scheduledFor: new Date(input.scheduledFor),
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
        emails: z.array(z.string().email()),
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
      const campaignMetrics: Array<{
        id: number;
        name: string;
        status: string;
        totalLeads: number;
        sent: number;
        opened: number;
        clicked: number;
        calls: number;
        openRate: number;
        clickRate: number;
        createdAt: Date;
      }> = [];

      for (const campaign of allCampaigns) {
        const campaignLeadsList = await db.getCampaignLeads(campaign.id);
        const sent = campaignLeadsList.filter((cl: any) => cl.emailSent).length;
        const opened = campaignLeadsList.filter((cl: any) => cl.emailOpened).length;
        const clicked = campaignLeadsList.filter((cl: any) => cl.emailClicked).length;
        const calls = campaignLeadsList.filter((cl: any) => cl.callTriggered).length;

        totalSent += sent;
        totalOpened += opened;
        totalClicked += clicked;
        totalCalls += calls;

        campaignMetrics.push({
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          totalLeads: campaignLeadsList.length,
          sent,
          opened,
          clicked,
          calls,
          openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
          clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
          createdAt: campaign.createdAt,
        });
      }

      return {
        totals: {
          campaigns: allCampaigns.length,
          leads: allLeads.length,
          emailsSent: totalSent,
          emailsOpened: totalOpened,
          emailsClicked: totalClicked,
          callsMade: totalCalls,
          overallOpenRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
          overallClickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0,
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
          isActive: input.isActive,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.number())
      .mutation(async ({ input: id }) => {
        await db.deleteRotationalEmail(id);
        return { success: true };
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
    generateMessage: protectedProcedure
      .input(z.object({
        leadId: z.number(),
        platform: z.enum(["linkedin", "instagram"]),
        messageType: z.enum(["connection_request", "dm", "follow_up"]),
        tone: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const lead = await db.getLeadById(input.leadId);
        const platformGuide = input.platform === "linkedin"
          ? "LinkedIn: Professional tone, mention mutual connections or industry. Max 300 chars for connection requests."
          : "Instagram: Casual but professional DM. Keep it brief and engaging.";
        const typeGuide = input.messageType === "connection_request"
          ? "This is a connection/follow request note. Be brief, mention why you want to connect."
          : input.messageType === "follow_up"
          ? "This is a follow-up message. Reference previous outreach without being pushy."
          : "This is a direct message. Be personable and include a clear value proposition.";
        const response = await invokeLLM({
          messages: [
            { role: "system", content: `You are a social media outreach expert. Generate a personalized ${input.platform} ${input.messageType.replace("_", " ")} message. ${platformGuide} ${typeGuide} ${input.tone ? "Tone: " + input.tone : ""}. Return ONLY the message text, nothing else.` },
            { role: "user", content: `Generate a ${input.platform} ${input.messageType.replace("_", " ")} for:
Name: ${lead.ownerName}
Company: ${lead.companyName}
Industry: ${lead.industry || "Unknown"}` },
          ],
        });
        const content = response.choices?.[0]?.message?.content;
        const message = typeof content === "string" ? content.trim() : "";
        return { message, platform: input.platform, messageType: input.messageType };
      }),
  }),
  webhooks: router({
    // Get recent webhook events
    list: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
      .query(async ({ ctx, input }) => {
        const userId = ctx.user!.id;
        return db.getWebhookEvents(userId, input?.limit || 50);
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
});
export type AppRouter = typeof appRouter;
