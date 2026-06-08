import * as db from "../db";
import { triggerRetellCall } from "./retellAI";
import { nanoid } from "nanoid";

/**
 * Follow-up email schedule:
 * - Email 1: Day 2 (2 days after initial)
 * - Email 2: Day 4 (2 days after email 1)
 * - Email 3: Day 6 (2 days after email 2)
 * - Email 4: Day 11 (5 days after email 3)
 * - Email 5: Day 16 (5 days after email 4)
 * - Email 6: Day 21 (5 days after email 5)
 * - Email 7: Day 26 (5 days after email 6)
 */
const FOLLOW_UP_EMAIL_SCHEDULE = [
  { sequenceNumber: 1, dayOffset: 2, emailType: "discovery" as const },
  { sequenceNumber: 2, dayOffset: 4, emailType: "value_prop" as const },
  { sequenceNumber: 3, dayOffset: 6, emailType: "social_proof" as const },
  { sequenceNumber: 4, dayOffset: 11, emailType: "urgency" as const },
  { sequenceNumber: 5, dayOffset: 16, emailType: "value_prop" as const },
  { sequenceNumber: 6, dayOffset: 21, emailType: "social_proof" as const },
  { sequenceNumber: 7, dayOffset: 26, emailType: "custom" as const },
];

/**
 * Follow-up call schedule:
 * A call is triggered each time a follow-up email is opened.
 * Additionally, scheduled calls happen if emails are not opened:
 * - Call after email 1 (Day 3)
 * - Call after email 2 (Day 5)
 * - Call after email 3 (Day 7)
 * - Call after email 4 (Day 12)
 * - Call after email 5 (Day 17)
 * - Call after email 6 (Day 22)
 * - Call after email 7 (Day 27)
 */
const FOLLOW_UP_CALL_SCHEDULE = [
  { dayOffset: 3, hour: 10 },   // Day after email 1
  { dayOffset: 5, hour: 14 },   // Day after email 2
  { dayOffset: 7, hour: 10 },   // Day after email 3
  { dayOffset: 12, hour: 14 },  // Day after email 4
  { dayOffset: 17, hour: 10 },  // Day after email 5
  { dayOffset: 22, hour: 14 },  // Day after email 6
  { dayOffset: 27, hour: 10 },  // Day after email 7
];

/**
 * Get the current hour in the lead's local timezone.
 * Used to ensure calls are only made between 10 AM - 5 PM lead time.
 */
function getLeadLocalHour(timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const hourPart = parts.find((p) => p.type === "hour");
    return parseInt(hourPart?.value || "12", 10);
  } catch {
    // Default to noon if timezone is invalid (safe to call)
    return 12;
  }
}

/**
 * Normalize phone number to E.164 format for Retell.AI
 * Strips parentheses, dashes, spaces, and ensures +country code prefix
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return phone;
  // Remove all non-digit characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, '');
  // If it starts with +, keep it; otherwise add +1 for US numbers
  if (!cleaned.startsWith('+')) {
    if (cleaned.startsWith('1') && cleaned.length === 11) {
      cleaned = '+' + cleaned;
    } else if (cleaned.length === 10) {
      cleaned = '+1' + cleaned;
    } else {
      cleaned = '+' + cleaned;
    }
  }
  return cleaned;
}

/**
 * Schedule follow-up emails for a campaign lead using Claude for generation.
 * Schedule: 1st 3 emails every 2 days, remaining 4 emails every 5 days after the 3rd.
 */
export async function scheduleFollowUpEmails(
  campaignLeadId: number,
  leadId: number,
  leadEmail: string,
  leadPhone: string,
  ownerName: string,
  companyName: string,
  industry: string,
  ctaLink: string,
  userId: number
) {
  try {
    console.log(`[FollowUpScheduler] Scheduling 7 follow-up emails for campaignLead ${campaignLeadId}`);

    // Get lead weak points
    let weakPoints: any = await db.getLeadWeakPoints(leadId);
    if (!weakPoints) {
      const { analyzeLeadWeakPoints } = await import("./emailGeneration");
      const points = await analyzeLeadWeakPoints({
        ownerName,
        companyName,
        email: leadEmail,
        industry,
      });
      await db.upsertLeadWeakPoints(leadId, points, "Auto-analyzed", ["discovery", "value_prop"]);
      weakPoints = await db.getLeadWeakPoints(leadId);
    }

    const weakPointsList = (weakPoints?.weakPoints as string[]) || ["business growth"];

    // Generate all 7 follow-up emails using Claude
    const { generateEmailWithClaude } = await import("../claude");

    for (const schedule of FOLLOW_UP_EMAIL_SCHEDULE) {
      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + schedule.dayOffset);

      // Determine the weak point to focus on for this email
      const weakPointIndex = (schedule.sequenceNumber - 1) % weakPointsList.length;
      const focusWeakPoint = weakPointsList[weakPointIndex] || "business growth";

      // Generate email with Claude
      let subject: string;
      let emailBody: string;

      try {
        const emailTypeDescriptions: Record<string, string> = {
          discovery: `Write a follow-up discovery email (#${schedule.sequenceNumber} of 7) to ${ownerName} at ${companyName} in the ${industry} industry. Focus on their challenge: "${focusWeakPoint}". Ask an insightful question. This is a follow-up, so reference that you reached out before.`,
          value_prop: `Write a follow-up value proposition email (#${schedule.sequenceNumber} of 7) to ${ownerName} at ${companyName} in the ${industry} industry. Focus on solving: "${focusWeakPoint}". Share specific benefits and ROI numbers. Reference your previous email.`,
          social_proof: `Write a follow-up social proof email (#${schedule.sequenceNumber} of 7) to ${ownerName} at ${companyName} in the ${industry} industry. Share a case study about solving "${focusWeakPoint}" for a similar company. Include specific metrics.`,
          urgency: `Write a follow-up email (#${schedule.sequenceNumber} of 7) to ${ownerName} at ${companyName} in the ${industry} industry. Create mild urgency about "${focusWeakPoint}" — mention limited availability or upcoming changes. Don't be pushy.`,
          custom: `Write a final follow-up email (#${schedule.sequenceNumber} of 7) to ${ownerName} at ${companyName} in the ${industry} industry. This is the last email in the sequence. Make it personal, reference previous attempts, and offer one last compelling reason to connect about "${focusWeakPoint}".`,
        };

        const result = await generateEmailWithClaude({
          prompt: emailTypeDescriptions[schedule.emailType] || emailTypeDescriptions["value_prop"],
          emailType: schedule.emailType,
          leadContext: `Name: ${ownerName}, Company: ${companyName}, Industry: ${industry}, Email: ${leadEmail}`,
          includeVariables: false,
        });

        subject = result.subject;
        emailBody = result.body;
      } catch (claudeError) {
        console.error(`[FollowUpScheduler] Claude generation failed for email ${schedule.sequenceNumber}, using fallback:`, claudeError);
        // Fallback subject and body
        subject = `following up - ${companyName}`;
        emailBody = `Hi ${ownerName},\n\nI wanted to follow up on my previous email about how we can help ${companyName} with ${focusWeakPoint} in the ${industry} space.\n\n• 🚀 **50+ qualified leads per week** generated on autopilot\n• 📈 **3x more booked calls** within 30 days\n• 💰 **Zero long-term contracts** — cancel anytime\n\n👉 Click below to schedule your free 30-minute consultation and begin your 2-week free trial:\n🗓️ 30 Min Free Consultation: ${ctaLink}\n\nBest,\nNitin`;
      }

      const trackingToken = nanoid();
      await db.createFollowUpEmail({
        campaignLeadId,
        sequenceNumber: schedule.sequenceNumber,
        emailType: schedule.emailType,
        subject,
        emailBody,
        ctaLink,
        status: "scheduled",
        scheduledFor: scheduledDate,
        trackingToken,
      });

      console.log(`[FollowUpScheduler] Scheduled follow-up email #${schedule.sequenceNumber} for day ${schedule.dayOffset} (${scheduledDate.toISOString()})`);
    }

    return { success: true, emailsScheduled: 7 };
  } catch (error) {
    console.error("[FollowUpScheduler] Error scheduling follow-up emails:", error);
    throw error;
  }
}

/**
 * Schedule follow-up calls for a campaign lead.
 * Calls are scheduled 1 day after each follow-up email.
 */
export async function scheduleFollowUpCalls(
  campaignLeadId: number,
  leadPhone: string
) {
  try {
    const now = new Date();
    const normalizedPhone = normalizePhoneNumber(leadPhone);

    for (let i = 0; i < FOLLOW_UP_CALL_SCHEDULE.length; i++) {
      const schedule = FOLLOW_UP_CALL_SCHEDULE[i];
      const scheduledDate = new Date(now);
      scheduledDate.setDate(scheduledDate.getDate() + schedule.dayOffset);
      scheduledDate.setHours(schedule.hour, 0, 0, 0);

      await db.createFollowUpCall({
        campaignLeadId,
        attemptNumber: i + 2, // +2 because attempt #1 is the initial call
        phoneNumber: normalizedPhone,
        status: "scheduled",
        scheduledFor: scheduledDate,
      });
    }

    console.log(`[FollowUpScheduler] Scheduled ${FOLLOW_UP_CALL_SCHEDULE.length} follow-up calls for campaignLead ${campaignLeadId}`);
    return { success: true, callsScheduled: FOLLOW_UP_CALL_SCHEDULE.length };
  } catch (error) {
    console.error("[FollowUpScheduler] Error scheduling follow-up calls:", error);
    throw error;
  }
}

/**
 * Get the follow-up email schedule description for display
 */
export function getFollowUpEmailScheduleDescription() {
  return {
    totalEmails: 7,
    schedule: FOLLOW_UP_EMAIL_SCHEDULE.map((s) => ({
      emailNumber: s.sequenceNumber,
      dayOffset: s.dayOffset,
      emailType: s.emailType,
      label: `Follow-up #${s.sequenceNumber} (Day ${s.dayOffset})`,
    })),
    note: "First 3 emails sent every 2 days. Remaining 4 emails sent every 5 days after the 3rd.",
  };
}

/**
 * Get the follow-up call schedule description for display
 */
export function getFollowUpCallScheduleDescription() {
  return {
    totalCalls: 7,
    schedule: [
      { label: "Initial Call", timing: "Triggered on email open/click", callNumber: 1 },
      ...FOLLOW_UP_CALL_SCHEDULE.map((s, i) => ({
        label: `Follow-up Call #${i + 2} (Day ${s.dayOffset})`,
        timing: `${s.hour}:00`,
        callNumber: i + 2,
      })),
    ],
    note: "Calls also trigger automatically when any follow-up email is opened. Calls stop once the client picks up.",
  };
}

/**
 * Process scheduled follow-up emails (called by cron/heartbeat).
 * Finds all pending follow-up emails whose scheduledFor <= now, sends them via SMTP,
 * and updates their status.
 */
export async function processScheduledFollowUpEmails() {
  const nodemailer = await import("nodemailer");
  try {
    const now = new Date();
    console.log("[FollowUpScheduler] Processing scheduled follow-up emails at", now.toISOString());

    const dueEmails = await db.getDueFollowUpEmails();
    if (!dueEmails || dueEmails.length === 0) {
      console.log("[FollowUpScheduler] No due follow-up emails found");
      return { processed: 0 };
    }

    console.log(`[FollowUpScheduler] Found ${dueEmails.length} due follow-up emails`);
    let sentCount = 0;
    let failCount = 0;

    for (const followUpEmail of dueEmails) {
      try {
        // Get campaign lead info
        const campaignLead = await db.getCampaignLeadById(followUpEmail.campaignLeadId);
        if (!campaignLead) {
          await db.updateFollowUpEmail(followUpEmail.id, { status: "failed" });
          failCount++;
          continue;
        }

        // Skip unsubscribed or replied leads
        if (campaignLead.unsubscribed || campaignLead.replied) {
          await db.updateFollowUpEmail(followUpEmail.id, { status: "cancelled" });
          console.log(`[FollowUpScheduler] Skipping follow-up for campaignLead ${campaignLead.id} - ${campaignLead.unsubscribed ? 'unsubscribed' : 'replied'}`);
          continue;
        }

        // Get lead info
        const lead = await db.getLeadById(campaignLead.leadId);

        // === SOCIAL OUTREACH: Before 2nd follow-up email, send connection requests ===
        if (followUpEmail.sequenceNumber === 2 && lead) {
          try {
            const campaign = await db.getCampaignById(campaignLead.campaignId);
            if (campaign) {
              const settings = await db.getUserSettings(campaign.userId);
              const { socialOutreach } = await import("../../drizzle/schema");
              const { eq, and } = await import("drizzle-orm");
              const database = await db.getDb();
              if (database && settings) {
                const dailyLimit = settings.socialDailyLimit || 20;
                const charLimit = settings.socialMessageCharLimit || 300;
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                const { gte } = await import("drizzle-orm");
                const todaySent = await database.select().from(socialOutreach).where(
                  and(eq(socialOutreach.userId, campaign.userId), eq(socialOutreach.status, "sent"), gte(socialOutreach.sentAt, todayStart))
                );

                // Only send if under daily limit
                if (todaySent.length < dailyLimit) {
                  const platforms: Array<"linkedin" | "instagram" | "facebook"> = [];
                  if (lead.linkedinUrl) platforms.push("linkedin");
                  if (lead.instagramUrl) platforms.push("instagram");
                  if ((lead as any).facebookUrl) platforms.push("facebook");

                  for (const platform of platforms) {
                    // Check if already sent connection request
                    const existing = await database.select().from(socialOutreach).where(
                      and(
                        eq(socialOutreach.leadId, lead.id),
                        eq(socialOutreach.platform, platform),
                        eq(socialOutreach.messageType, "connection_request"),
                        eq(socialOutreach.status, "sent")
                      )
                    );
                    if (existing.length > 0) continue;

                    // Generate message with AI
                    const { invokeLLM } = await import("./llm");
                    const response = await invokeLLM({
                      messages: [
                        { role: "system", content: `You are a social media outreach expert. Generate a brief, personalized ${platform} connection request note. Keep under ${Math.min(charLimit, 200)} characters. Be genuine, mention their industry. Do NOT pitch services. Do NOT use hashtags. Return ONLY the message text.` },
                        { role: "user", content: `Connection request for: ${lead.ownerName} at ${lead.companyName} (${lead.industry || "business"})` },
                      ],
                    });
                    const content = response.choices?.[0]?.message?.content;
                    let message = typeof content === "string" ? content.trim() : "";
                    if (message.length > charLimit) message = message.slice(0, charLimit - 3) + "...";

                    if (message) {
                      const profileUrl = platform === "linkedin" ? lead.linkedinUrl :
                        platform === "instagram" ? lead.instagramUrl : (lead as any).facebookUrl;
                      await database.insert(socialOutreach).values({
                        userId: campaign.userId,
                        leadId: lead.id,
                        campaignLeadId: campaignLead.id,
                        platform,
                        messageType: "connection_request",
                        message,
                        status: "sent",
                        sentAt: new Date(),
                        profileUrl: profileUrl || "",
                        characterCount: message.length,
                      });
                      console.log(`[FollowUpScheduler] Sent ${platform} connection request to ${lead.ownerName} (${message.length} chars)`);
                    }
                  }
                } else {
                  console.log(`[FollowUpScheduler] Skipping social outreach - daily limit reached (${todaySent.length}/${dailyLimit})`);
                }
              }
            }
          } catch (socialError) {
            console.error(`[FollowUpScheduler] Social outreach error for lead ${lead?.id}:`, socialError);
            // Don't fail the follow-up email if social outreach fails
          }
        }
        if (!lead) {
          await db.updateFollowUpEmail(followUpEmail.id, { status: "failed" });
          failCount++;
          continue;
        }

        // Get campaign to find userId
        const campaign = await db.getCampaignById(campaignLead.campaignId);
        if (!campaign) {
          await db.updateFollowUpEmail(followUpEmail.id, { status: "failed" });
          failCount++;
          continue;
        }

        // Get user SMTP settings
        const settings = await db.getUserSettings(campaign.userId);
        if (!settings?.smtpHost || !settings?.smtpUsername || !settings?.smtpPassword) {
          await db.updateFollowUpEmail(followUpEmail.id, { status: "failed" });
          failCount++;
          continue;
        }

        // Get user's email signature (use plain text version, converted to HTML)
        const signature = await db.getEmailSignature(campaign.userId);
        const signatureHtml = getSignatureHtml(signature);

        // Create transporter
        const transporter = nodemailer.default.createTransport({
          host: settings.smtpHost,
          port: settings.smtpPort || 587,
          secure: (settings.smtpPort || 587) === 465,
          auth: {
            user: settings.smtpUsername,
            pass: settings.smtpPassword,
          },
        });

        // Create tracking token for this follow-up email
        const trackingToken = followUpEmail.trackingToken || nanoid();

        // Create tracking event for open detection
        await db.createEmailTrackingEvent({
          campaignLeadId: followUpEmail.campaignLeadId,
          eventType: "open",
          trackingToken,
        });

        // Create click tracking token
        const clickTrackingToken = nanoid();
        await db.createEmailTrackingEvent({
          campaignLeadId: followUpEmail.campaignLeadId,
          eventType: "click",
          trackingToken: clickTrackingToken,
        });

        // Use the deployed domain for tracking URLs
        const baseUrl = process.env.SITE_URL || `https://${process.env.DOMAIN || 'leadgenoutreach-gkqazghm.manus.space'}`;
        const trackingPixel = `<img src="${baseUrl}/api/track/pixel/${trackingToken}" width="1" height="1" style="display:none" />`;

        // Replace CTA links with tracked versions
        const ctaUrl = followUpEmail.ctaLink || 'https://calendly.com/nitin-virtualassistant/30min';
        const trackedCtaUrl = `${baseUrl}/api/track/click/${clickTrackingToken}?url=${encodeURIComponent(ctaUrl)}`;

        // Convert plain text to HTML
        const { plainTextToHtml } = await import("@shared/emailFormat");
        let htmlBody = followUpEmail.emailBody
          .replace(/https:\/\/calendly\.com\/nitin-virtualassistant\/30min/g, trackedCtaUrl);
        htmlBody = plainTextToHtml(htmlBody) + signatureHtml + trackingPixel;

        // Add unsubscribe link
        const unsubscribeUrl = `${baseUrl}/api/track/unsubscribe/${trackingToken}`;
        htmlBody += `<br/><p style="font-size:11px;color:#999;text-align:center;margin-top:24px;"><a href="${unsubscribeUrl}" style="color:#999;text-decoration:underline;">Unsubscribe</a> from future emails</p>`;

        // Send the email
        await transporter.sendMail({
          from: `"${settings.senderName || "Lead Gen Pro"}" <${settings.senderEmail || settings.smtpUsername}>`,
          to: lead.email,
          replyTo: "nitin@virtualassistant-group.com",
          subject: followUpEmail.subject,
          html: htmlBody,
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
          },
        });

        // Mark as sent
        await db.updateFollowUpEmail(followUpEmail.id, {
          status: "sent",
          sentAt: new Date(),
        });

        sentCount++;
        console.log(`[FollowUpScheduler] Sent follow-up email #${followUpEmail.sequenceNumber} to ${lead.email}`);
      } catch (emailError: any) {
        console.error(`[FollowUpScheduler] Failed to send follow-up email ${followUpEmail.id}:`, emailError);
        await db.updateFollowUpEmail(followUpEmail.id, { status: "failed" });
        failCount++;
      }
    }

    console.log(`[FollowUpScheduler] Processed ${dueEmails.length} follow-up emails: ${sentCount} sent, ${failCount} failed`);
    return { processed: dueEmails.length, sent: sentCount, failed: failCount };
  } catch (error) {
    console.error("[FollowUpScheduler] Error processing scheduled follow-up emails:", error);
    return { processed: 0, error: String(error) };
  }
}

/**
 * Process scheduled emails from the scheduledEmails table.
 * Finds all pending emails whose scheduledFor <= now, sends them via SMTP,
 * and updates their status to 'sent' or 'failed'.
 */
export async function processScheduledEmails() {
  const nodemailer = await import("nodemailer");
  try {
    const dueEmails = await db.getDueScheduledEmails();
    if (dueEmails.length === 0) return { processed: 0 };

    console.log(`[ScheduledEmailProcessor] Found ${dueEmails.length} due scheduled emails`);
    let sentCount = 0;
    let failCount = 0;

    for (const scheduledEmail of dueEmails) {
      try {
        // Get the lead info
        const lead = await db.getLeadById(scheduledEmail.leadId);
        if (!lead) {
          await db.updateScheduledEmail(scheduledEmail.id, {
            status: "failed",
            errorMessage: "Lead not found",
          });
          failCount++;
          continue;
        }

        // Get user SMTP settings
        const settings = await db.getUserSettings(scheduledEmail.userId);
        if (!settings?.smtpHost || !settings?.smtpUsername || !settings?.smtpPassword) {
          await db.updateScheduledEmail(scheduledEmail.id, {
            status: "failed",
            errorMessage: "SMTP settings not configured",
          });
          failCount++;
          continue;
        }

        // Create transporter
        const transporter = nodemailer.default.createTransport({
          host: settings.smtpHost,
          port: settings.smtpPort || 587,
          secure: (settings.smtpPort || 587) === 465,
          auth: {
            user: settings.smtpUsername,
            pass: settings.smtpPassword,
          },
        });

        // Create tracking token
        const { nanoid: createId } = await import("nanoid");
        const trackingToken = createId();
        // Use the deployed domain for tracking URLs
        const baseUrl = process.env.SITE_URL || `https://${process.env.DOMAIN || 'leadgenoutreach-gkqazghm.manus.space'}`;
        const trackingPixel = `<img src="${baseUrl}/api/track/pixel/${trackingToken}" width="1" height="1" style="display:none" />`;
        
        // Get user's email signature
        const signature = await db.getEmailSignature(scheduledEmail.userId);
        const signatureHtml = getSignatureHtml(signature);
        
        // Convert plain text to HTML (preserve line breaks and bullet points)
        const { plainTextToHtml } = await import("@shared/emailFormat");
        const htmlBody = plainTextToHtml(scheduledEmail.emailBody) + signatureHtml + trackingPixel;

        // Add unsubscribe link
        const unsubscribeUrl = `${baseUrl}/api/track/unsubscribe/${trackingToken}`;
        const finalHtml = htmlBody + `<br/><p style="font-size:11px;color:#999;text-align:center;margin-top:24px;"><a href="${unsubscribeUrl}" style="color:#999;text-decoration:underline;">Unsubscribe</a> from future emails</p>`;

        // Send the email
        await transporter.sendMail({
          from: `"${settings.senderName || "Lead Gen Pro"}" <${settings.senderEmail || settings.smtpUsername}>`,
          to: lead.email,
          replyTo: "nitin@virtualassistant-group.com",
          subject: scheduledEmail.subject,
          html: finalHtml,
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
          },
        });

        // Mark as sent
        await db.updateScheduledEmail(scheduledEmail.id, {
          status: "sent",
          sentAt: new Date(),
        });

        // Update lead status
        await db.updateLead(lead.id, { status: "contacted" });

        sentCount++;
        console.log(`[ScheduledEmailProcessor] Sent scheduled email ${scheduledEmail.id} to ${lead.email}`);
      } catch (emailError: any) {
        console.error(`[ScheduledEmailProcessor] Failed to send email ${scheduledEmail.id}:`, emailError);
        await db.updateScheduledEmail(scheduledEmail.id, {
          status: "failed",
          errorMessage: emailError.message || "Unknown error",
        });
        failCount++;
      }
    }

    console.log(`[ScheduledEmailProcessor] Processed ${dueEmails.length} emails: ${sentCount} sent, ${failCount} failed`);
    return { processed: dueEmails.length, sent: sentCount, failed: failCount };
  } catch (error) {
    console.error("[ScheduledEmailProcessor] Error processing scheduled emails:", error);
    return { processed: 0, error: String(error) };
  }
}

/**
 * Process scheduled follow-up calls (called by cron job).
 * Checks for calls that are due and triggers them via Retell.AI.
 */
export async function processScheduledFollowUpCalls(retellApiKey: string, retellAgentId: string, senderPhoneNumber: string) {
  try {
    const now = new Date();
    console.log("[FollowUpScheduler] Processing scheduled follow-up calls at", now.toISOString());

    const dueCalls = await db.getDueFollowUpCalls();
    console.log(`[FollowUpScheduler] Found ${dueCalls.length} due follow-up calls`);

    for (const call of dueCalls) {
      try {
        // Check if lead's local time is between 10 AM - 5 PM
        const leadTimezone = call.leadTimezone || "America/New_York";
        const leadLocalHour = getLeadLocalHour(leadTimezone);
        if (leadLocalHour < 10 || leadLocalHour >= 17) {
          console.log(`[FollowUpScheduler] Skipping call for campaignLeadId: ${call.campaignLeadId} - lead local time is ${leadLocalHour}:00 (${leadTimezone}), outside 10AM-5PM window`);
          continue;
        }

        // Check if any previous call for this campaign lead was answered
        const allCalls = await db.getFollowUpCallsByCampaignLead(call.campaignLeadId);
        const wasAnswered = allCalls.some(
          (c: any) => c.status === "completed" || c.status === "in_progress"
        );

        if (wasAnswered) {
          await db.cancelRemainingFollowUpCalls(call.campaignLeadId);
          console.log(`[FollowUpScheduler] Lead already answered. Cancelled remaining calls for campaignLeadId: ${call.campaignLeadId}`);
          continue;
        }

        // Normalize phone number for Retell.AI
        const normalizedPhone = normalizePhoneNumber(call.phoneNumber);
        const normalizedFromPhone = normalizePhoneNumber(senderPhoneNumber);

        // Trigger the Retell.AI call
        await db.updateFollowUpCall(call.id, { status: "initiated", initiatedAt: new Date() });

        await triggerRetellCall(
          call.campaignLeadId,
          normalizedPhone,
          retellApiKey,
          retellAgentId,
          normalizedFromPhone,
          "email_open"
        );

        console.log(`[FollowUpScheduler] Triggered follow-up call #${call.attemptNumber} for campaignLeadId: ${call.campaignLeadId}`);
      } catch (callError) {
        console.error(`[FollowUpScheduler] Failed to process call ${call.id}:`, callError);
        await db.updateFollowUpCall(call.id, { status: "failed" });
      }
    }

    return { processed: dueCalls.length };
  } catch (error) {
    console.error("[FollowUpScheduler] Error processing scheduled follow-up calls:", error);
    return { processed: 0, error: String(error) };
  }
}

/**
 * Trigger a Retell.AI call when a follow-up email is opened.
 * This is the primary call trigger mechanism.
 */
export async function triggerCallOnFollowUpOpen(
  campaignLeadId: number,
  leadPhone: string,
  retellApiKey: string,
  retellAgentId: string,
  senderPhoneNumber: string,
  triggerType: "email_open" | "email_click",
  leadTimezone?: string
) {
  try {
    // Check if lead's local time is between 10 AM - 5 PM
    const timezone = leadTimezone || "America/New_York";
    const leadLocalHour = getLeadLocalHour(timezone);
    if (leadLocalHour < 10 || leadLocalHour >= 17) {
      console.log(`[FollowUpScheduler] Skipping instant call for campaignLeadId: ${campaignLeadId} - lead local time is ${leadLocalHour}:00 (${timezone}), outside 10AM-5PM window`);
      return { success: false, reason: "outside_business_hours" };
    }

    // Check if any previous call for this campaign lead was answered
    const allCalls = await db.getFollowUpCallsByCampaignLead(campaignLeadId);
    const wasAnswered = allCalls.some(
      (c: any) => c.status === "completed" || c.status === "in_progress"
    );

    if (wasAnswered) {
      console.log(`[FollowUpScheduler] Lead already answered a call. Skipping for campaignLeadId: ${campaignLeadId}`);
      return { success: false, reason: "already_answered" };
    }

    // Normalize phone numbers
    const normalizedPhone = normalizePhoneNumber(leadPhone);
    const normalizedFromPhone = normalizePhoneNumber(senderPhoneNumber);

    console.log(`[FollowUpScheduler] Triggering call on follow-up open - to: ${normalizedPhone}, from: ${normalizedFromPhone}`);

    // Create a follow-up call record
    const existingCalls = allCalls.length;
    await db.createFollowUpCall({
      campaignLeadId,
      attemptNumber: existingCalls + 1,
      phoneNumber: normalizedPhone,
      status: "initiated",
      initiatedAt: new Date(),
    });

    // Trigger the Retell.AI call
    const callResult = await triggerRetellCall(
      campaignLeadId,
      normalizedPhone,
      retellApiKey,
      retellAgentId,
      normalizedFromPhone,
      triggerType
    );

    return { success: true, callId: callResult };
  } catch (error) {
    console.error("[FollowUpScheduler] Error triggering call on follow-up open:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get the user's signature as HTML.
 * Prioritizes signaturePlainText (user's actual signature) over signatureHtml (template).
 */
function getSignatureHtml(signature: any): string {
  if (!signature) return '';

  // Use the plain text signature (user's actual signature) and convert to HTML
  if (signature.signaturePlainText && signature.signaturePlainText.trim()) {
    const lines = signature.signaturePlainText.split('\n');
    const htmlLines = lines.map((line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return '<br/>';
      // Detect URLs and make them clickable
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const withLinks = trimmed.replace(urlRegex, '<a href="$1" style="color:#2563eb;text-decoration:none;">$1</a>');
      // Detect email addresses
      const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
      const withEmails = withLinks.replace(emailRegex, '<a href="mailto:$1" style="color:#2563eb;text-decoration:none;">$1</a>');
      return `<p style="margin:0;padding:0;line-height:1.4;">${withEmails}</p>`;
    });
    return `<br/><br/><div style="font-family:inherit;font-size:inherit;color:#333;padding-top:12px;margin-top:16px;">${htmlLines.join('')}</div>`;
  }

  // Fallback to signatureHtml if no plain text version
  if (signature.signatureHtml && signature.signatureHtml.trim()) {
    return `<br/><br/>${signature.signatureHtml}`;
  }

  return '';
}

// Export for use in other modules
export { getSignatureHtml };
