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

// Calls represent OUR business hours (Eastern Time), not the lead's own
// timezone -- confirmed this is the intended behavior (calls only ever run
// 10 AM - 6 PM Eastern regardless of where the lead is).
const CALL_WINDOW_START_HOUR = 10;
const CALL_WINDOW_END_HOUR = 18;
const CALL_TIMEZONE = "America/New_York";

/**
 * Returns the hour-of-day (0-23) for `date` as rendered in `timezone`.
 * Explicitly forces hourCycle "h23" -- `hour12: false` alone can render
 * midnight as "24" instead of "0" depending on the ICU locale data, which
 * would silently break any hour < 10 comparison at midnight.
 */
export function getHourInTimezone(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hourCycle: "h23",
    });
    const parts = formatter.formatToParts(date);
    const hourPart = parts.find((p) => p.type === "hour");
    return parseInt(hourPart?.value || "12", 10);
  } catch {
    // Default to noon if timezone is invalid (safe to call)
    return 12;
  }
}

/**
 * Builds the UTC instant corresponding to `hour`:00 in `timezone` on the
 * calendar date of `baseDate` (in that timezone) plus `daysOffset` days.
 * Tries both plausible UTC hours for that local hour (Eastern is UTC-5
 * standard / UTC-4 daylight) and picks whichever actually renders as `hour`
 * in the target timezone for that specific date, so it's correct across DST
 * transitions rather than assuming a fixed offset.
 */
export function easternDateAtHour(baseDate: Date, daysOffset: number, hour: number): Date {
  const baseDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: CALL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(baseDate);
  const [y, m, d] = baseDateStr.split("-").map(Number);
  for (const utcHour of [hour + 4, hour + 5]) {
    const candidate = new Date(Date.UTC(y, m - 1, d + daysOffset, utcHour, 0, 0, 0));
    if (getHourInTimezone(candidate, CALL_TIMEZONE) === hour) return candidate;
  }
  // Fallback (shouldn't happen): assume standard time (UTC-5)
  return new Date(Date.UTC(y, m - 1, d + daysOffset, hour + 5, 0, 0, 0));
}

/**
 * Rolls `from` forward to the next instant within the 10 AM - 6 PM Eastern
 * call window, if it isn't already inside it. Same Eastern calendar day at
 * 10 AM if `from` is before the window; the next Eastern calendar day at
 * 10 AM if at/after 6 PM.
 */
export function nextEasternBusinessSlot(from: Date): Date {
  const hour = getHourInTimezone(from, CALL_TIMEZONE);
  if (hour >= CALL_WINDOW_START_HOUR && hour < CALL_WINDOW_END_HOUR) return from;
  const daysOffset = hour < CALL_WINDOW_START_HOUR ? 0 : 1;
  return easternDateAtHour(from, daysOffset, CALL_WINDOW_START_HOUR);
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
      // Deliberately built via easternDateAtHour, not Date.setHours() (which
      // operates in the SERVER's own local timezone, not Eastern -- on a
      // server running in UTC, setHours(10, ...) actually landed at 10 AM
      // UTC, i.e. 5-6 AM Eastern, well before business hours).
      const scheduledDate = easternDateAtHour(now, schedule.dayOffset, schedule.hour);

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
 * Manual override: un-cancel a lead's remaining follow-up emails/calls after
 * they were auto-cancelled by a call ending in "agent_hangup" or
 * "user_hangup" (both currently treated as positive engagement -- see
 * handleRetellWebhook in retellAI.ts). After listening to the recording, a
 * human may decide that classification was wrong and the lead should still
 * get their remaining follow-ups.
 *
 * Cancelled items (status "failed") are rescheduled starting tomorrow,
 * preserving their original relative spacing from FOLLOW_UP_EMAIL_SCHEDULE /
 * FOLLOW_UP_CALL_SCHEDULE -- their original scheduledFor dates are almost
 * certainly in the past by now, so they'd otherwise look immediately "due"
 * and all fire at once the next time the cron runs.
 *
 * Never overrides an unsubscribe -- that stays permanent regardless of this
 * override, since it's the lead's own opt-out, not an internal
 * classification we might have gotten wrong.
 */
export async function resumeFollowUps(campaignLeadId: number) {
  const campaignLead = await db.getCampaignLeadById(campaignLeadId);
  if (!campaignLead) {
    return { success: false, reason: "not_found" as const, emailsResumed: 0, callsResumed: 0 };
  }
  if ((campaignLead as any).unsubscribed) {
    return { success: false, reason: "unsubscribed" as const, emailsResumed: 0, callsResumed: 0 };
  }

  const now = new Date();

  const allEmails = await db.getFollowUpEmailsByCampaignLead(campaignLeadId);
  const cancelledEmails = allEmails.filter((e: any) => e.status === "failed");
  let emailsResumed = 0;
  if (cancelledEmails.length > 0) {
    const dayOffsetBySeq = new Map(FOLLOW_UP_EMAIL_SCHEDULE.map((s) => [s.sequenceNumber, s.dayOffset]));
    const minDayOffset = Math.min(...cancelledEmails.map((e: any) => dayOffsetBySeq.get(e.sequenceNumber) ?? 0));
    for (const email of cancelledEmails) {
      const dayOffset = dayOffsetBySeq.get((email as any).sequenceNumber) ?? minDayOffset;
      const relativeOffset = dayOffset - minDayOffset;
      const scheduledFor = new Date(now.getTime() + (1 + relativeOffset) * 24 * 60 * 60 * 1000);
      await db.updateFollowUpEmail((email as any).id, { status: "scheduled", scheduledFor });
      emailsResumed++;
    }
  }

  const allCalls = await db.getFollowUpCallsByCampaignLead(campaignLeadId);
  const cancelledCalls = allCalls.filter((c: any) => c.status === "failed");
  let callsResumed = 0;
  if (cancelledCalls.length > 0) {
    const scheduleByAttempt = new Map(FOLLOW_UP_CALL_SCHEDULE.map((s, i) => [i + 2, s]));
    const minDayOffset = Math.min(
      ...cancelledCalls.map((c: any) => scheduleByAttempt.get(c.attemptNumber)?.dayOffset ?? 0)
    );
    for (const call of cancelledCalls) {
      const schedule = scheduleByAttempt.get((call as any).attemptNumber);
      const dayOffset = schedule?.dayOffset ?? minDayOffset;
      const hour = schedule?.hour ?? CALL_WINDOW_START_HOUR;
      const relativeOffset = dayOffset - minDayOffset;
      const scheduledFor = easternDateAtHour(now, 1 + relativeOffset, hour);
      await db.updateFollowUpCall((call as any).id, { status: "scheduled", scheduledFor });
      callsResumed++;
    }
  }

  console.log(`[FollowUpScheduler] Resumed follow-ups for campaignLead ${campaignLeadId}: ${emailsResumed} emails, ${callsResumed} calls`);
  return { success: true as const, emailsResumed, callsResumed };
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

        // Get lead info
        const lead = await db.getLeadById(campaignLead.leadId);

        // Skip unsubscribed (this campaign, or globally via any other campaign) or replied leads
        if (campaignLead.unsubscribed || campaignLead.replied || (lead as any)?.unsubscribed) {
          await db.updateFollowUpEmail(followUpEmail.id, { status: "failed" });
          console.log(`[FollowUpScheduler] Skipping follow-up for campaignLead ${campaignLead.id} - ${campaignLead.replied ? 'replied' : 'unsubscribed'}`);
          continue;
        }

        // === SOCIAL OUTREACH: Before 2nd follow-up email, send connection requests ===
        if (followUpEmail.sequenceNumber === 2 && lead) {
          try {
            const campaign = await db.getCampaignById(campaignLead.campaignId);
            if (campaign) {
              const settings = await db.getUserSettings(campaign.userId);
              const { socialOutreach } = await import("../../drizzle/schema");
              const { eq, and, inArray } = await import("drizzle-orm");
              const database = await db.getDb();
              if (database && settings) {
                const charLimit = settings.socialMessageCharLimit || 300;

                const platforms: Array<"linkedin" | "instagram" | "facebook"> = [];
                if (lead.linkedinUrl) platforms.push("linkedin");
                if (lead.instagramUrl) platforms.push("instagram");
                if ((lead as any).facebookUrl) platforms.push("facebook");

                for (const platform of platforms) {
                    // Per-platform, per-action-type daily cap
                    const platformDailyLimit = db.getSocialDailyLimit(settings, platform, "connection_request");
                    const todayCount = await db.getSocialCountToday(campaign.userId, platform, "connection_request");
                    if (todayCount >= platformDailyLimit) {
                      console.log(`[FollowUpScheduler] Skipping ${platform} connection request - daily limit reached (${todayCount}/${platformDailyLimit})`);
                      continue;
                    }

                    // Check if a connection request was already queued/sent
                    const existing = await database.select().from(socialOutreach).where(
                      and(
                        eq(socialOutreach.leadId, lead.id),
                        eq(socialOutreach.platform, platform),
                        eq(socialOutreach.messageType, "connection_request"),
                        inArray(socialOutreach.status, ["sent", "pending"])
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
                      // Queued, not sent yet — there's no API integration to actually post
                      // this on the platform, so it waits in the Message Queue for the
                      // user to copy and send it themselves.
                      await database.insert(socialOutreach).values({
                        userId: campaign.userId,
                        leadId: lead.id,
                        campaignLeadId: campaignLead.id,
                        platform,
                        messageType: "connection_request",
                        message,
                        status: "pending",
                        profileUrl: profileUrl || "",
                        characterCount: message.length,
                      });
                      console.log(`[FollowUpScheduler] Queued ${platform} connection request for ${lead.ownerName} (${message.length} chars)`);
                      // Send notification email if configured
                      if (settings.socialNotificationEmail) {
                        try {
                          const nodemailer = await import("nodemailer");
                          const transporter = nodemailer.default.createTransport({
                            host: settings.smtpHost || '',
                            port: settings.smtpPort || 587,
                            secure: (settings.smtpPort || 587) === 465,
                            auth: { user: settings.smtpUsername || '', pass: settings.smtpPassword || '' },
                          });
                          await transporter.sendMail({
                            from: `"Lead Gen System" <${settings.senderEmail || settings.smtpUsername}>`,
                            to: settings.socialNotificationEmail,
                            subject: `Social Message Due: ${lead.ownerName} (${platform})`,
                            html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                              <h2 style="color: #1a1a1a;">Social Message Ready to Send</h2>
                              <p>A <strong>${platform}</strong> message is ready for <strong>${lead.ownerName}</strong> at <strong>${lead.companyName}</strong>.</p>
                              <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
                                <p style="margin: 0; font-style: italic;">"${message}"</p>
                              </div>
                              <p><strong>Profile URL:</strong> <a href="${profileUrl}">${profileUrl}</a></p>
                              <p style="margin-top: 20px;">Go to your <strong>Message Queue</strong> to copy the message and open the profile.</p>
                            </div>`,
                          });
                          console.log(`[FollowUpScheduler] Notification sent to ${settings.socialNotificationEmail} for ${platform} message`);
                        } catch (notifError) {
                          console.error(`[FollowUpScheduler] Failed to send notification email:`, notifError);
                        }
                      }
                    }
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

        // Get user's configured email signature (converted to HTML)
        const signature = await db.getEmailSignature(campaign.userId);

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
        const ctaUrl = followUpEmail.ctaLink || 'https://cal.com/nitin-virtualassistant-group.com/30min';
        const trackedCtaUrl = `${baseUrl}/api/track/click/${clickTrackingToken}?url=${encodeURIComponent(ctaUrl)}`;

        // Convert plain text to HTML
        const { plainTextToHtml } = await import("@shared/emailFormat");
        let htmlBody = followUpEmail.emailBody
          .replace(/https:\/\/calendly\.com\/nitin-virtualassistant\/30min/g, trackedCtaUrl);

        // Wrap any remaining raw URLs that weren't caught by the specific Calendly pattern
        htmlBody = htmlBody.replace(
          /(https?:\/\/[^\s<>"']+)/g,
          (rawUrl) => {
            if (rawUrl.includes('/api/track/click/')) return rawUrl;
            return `${baseUrl}/api/track/click/${clickTrackingToken}?url=${encodeURIComponent(rawUrl)}`;
          }
        );
        // Wrap any existing href="..." links (for HTML content)
        htmlBody = htmlBody.replace(
          /href=["'](https?:\/\/[^"']*)["']/g,
          (match, url) => {
            if (url.includes('/api/track/click/')) return match;
            return `href="${baseUrl}/api/track/click/${clickTrackingToken}?url=${encodeURIComponent(url)}"`;
          }
        );

        const wrapSignatureLink = (url: string) => `${baseUrl}/api/track/click/${clickTrackingToken}?url=${encodeURIComponent(url)}`;
        htmlBody = plainTextToHtml(htmlBody) + getSignatureHtml(signature, wrapSignatureLink) + trackingPixel;

        // Add unsubscribe link
        const unsubscribeUrl = `${baseUrl}/api/track/unsubscribe/${trackingToken}`;
        htmlBody += `<br/><p style="font-size:11px;color:#999;text-align:center;margin-top:24px;"><a href="${unsubscribeUrl}" style="color:#999;text-decoration:underline;">Unsubscribe</a> from future emails</p>`;

        // Send the email
        const followUpSenderEmail = settings.senderEmail || settings.smtpUsername || '';
        const followUpReplyTo = settings.replyToEmail || "nitin@virtualassistant-group.com";
        const sendResult = await transporter.sendMail({
          from: `"${settings.senderName || "Lead Gen Pro"}" <${followUpSenderEmail}>`,
          to: lead.email,
          replyTo: followUpReplyTo,
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

        // Store sender mailbox and message ID on the campaign lead
        if (campaignLead) {
          await db.updateCampaignLead(campaignLead.id, {
            senderEmail: followUpSenderEmail,
            messageId: sendResult.messageId || null,
            threadId: sendResult.messageId || null,
          });
        }

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

        if ((lead as any).unsubscribed) {
          await db.updateScheduledEmail(scheduledEmail.id, { status: "cancelled" });
          console.log(`[ScheduledEmailProcessor] Skipping scheduled email ${scheduledEmail.id} - lead ${lead.id} has unsubscribed`);
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

        // Create tracking tokens -- tied to leadId since one-off scheduled
        // emails have no campaignLeadId to associate with.
        const { nanoid: createId } = await import("nanoid");
        const trackingToken = createId();
        const clickTrackingToken = createId();
        await db.createEmailTrackingEvent({ leadId: lead.id, eventType: "open", trackingToken } as any);
        await db.createEmailTrackingEvent({ leadId: lead.id, eventType: "click", trackingToken: clickTrackingToken } as any);

        // Use the deployed domain for tracking URLs
        const baseUrl = process.env.SITE_URL || `https://${process.env.DOMAIN || 'leadgenoutreach-gkqazghm.manus.space'}`;
        const trackingPixel = `<img src="${baseUrl}/api/track/pixel/${trackingToken}" width="1" height="1" style="display:none" />`;

        // Get user's configured email signature (converted to HTML)
        const signature = await db.getEmailSignature(scheduledEmail.userId);

        // Convert plain text to HTML (preserve line breaks and bullet points)
        const { plainTextToHtml } = await import("@shared/emailFormat");
        let htmlBody = scheduledEmail.emailBody.replace(
          /(https?:\/\/[^\s<>"']+)/g,
          (rawUrl) => {
            if (rawUrl.includes('/api/track/click/')) return rawUrl;
            return `${baseUrl}/api/track/click/${clickTrackingToken}?url=${encodeURIComponent(rawUrl)}`;
          }
        );
        const wrapSignatureLink = (url: string) => `${baseUrl}/api/track/click/${clickTrackingToken}?url=${encodeURIComponent(url)}`;
        htmlBody = plainTextToHtml(htmlBody) + getSignatureHtml(signature, wrapSignatureLink) + trackingPixel;

        // Add unsubscribe link
        const unsubscribeUrl = `${baseUrl}/api/track/unsubscribe/${trackingToken}`;
        const finalHtml = htmlBody + `<br/><p style="font-size:11px;color:#999;text-align:center;margin-top:24px;"><a href="${unsubscribeUrl}" style="color:#999;text-decoration:underline;">Unsubscribe</a> from future emails</p>`;

        // Send the email
        const scheduledSenderEmail = settings.senderEmail || settings.smtpUsername || '';
        const scheduledReplyTo = settings.replyToEmail || "nitin@virtualassistant-group.com";
        const scheduledSendResult = await transporter.sendMail({
          from: `"${settings.senderName || "Lead Gen Pro"}" <${scheduledSenderEmail}>`,
          to: lead.email,
          replyTo: scheduledReplyTo,
          subject: scheduledEmail.subject,
          html: finalHtml,
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
          },
        });

        // Mark as sent
        await db.updateScheduledEmail(scheduledEmail.id, {
          status: "sent",
          sentAt: new Date().toISOString(),
        });

        // Note: sender mailbox and message ID are stored at campaign-level send time.
        // Scheduled emails are standalone and don't have a campaign lead association.
        // The messageId is logged for debugging purposes.
        console.log(`[ScheduledEmailProcessor] Email sent from ${scheduledSenderEmail}, messageId: ${scheduledSendResult.messageId}`);

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
export async function processScheduledFollowUpCalls(retellApiKey: string, retellAgentId: string, senderPhoneNumber: string, callerCompanyName?: string) {
  try {
    const now = new Date();
    console.log("[FollowUpScheduler] Processing scheduled follow-up calls at", now.toISOString());

    const dueCalls = await db.getDueFollowUpCalls();
    console.log(`[FollowUpScheduler] Found ${dueCalls.length} due follow-up calls`);

    for (const call of dueCalls) {
      try {
        // Calls only ever run 10 AM - 6 PM Eastern -- this is a final safety
        // check (the scheduled time should already be inside the window; this
        // only matters if the cron itself was delayed past 6 PM). Reschedule
        // to the next valid Eastern slot rather than silently dropping the
        // call, which the old "just skip" version did -- that could lose the
        // call entirely if the cron missed its window.
        const easternHour = getHourInTimezone(now, CALL_TIMEZONE);
        if (easternHour < CALL_WINDOW_START_HOUR || easternHour >= CALL_WINDOW_END_HOUR) {
          const rescheduledFor = nextEasternBusinessSlot(now);
          await db.updateFollowUpCall(call.id, { scheduledFor: rescheduledFor });
          console.log(`[FollowUpScheduler] Call for campaignLeadId: ${call.campaignLeadId} is due but it's ${easternHour}:00 Eastern (outside 10AM-6PM) -- rescheduled to ${rescheduledFor.toISOString()}`);
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

        // Fetch lead data to pass customer context to the AI agent, and to
        // check unsubscribed/replied status before calling
        const campaignLead = await db.getCampaignLeadById(call.campaignLeadId);
        if (campaignLead?.unsubscribed || campaignLead?.replied) {
          await db.updateFollowUpCall(call.id, { status: "failed" });
          console.log(`[FollowUpScheduler] Skipping call for campaignLeadId: ${call.campaignLeadId} - ${campaignLead.replied ? 'replied' : 'unsubscribed'}`);
          continue;
        }
        let leadContext: { customerName?: string; customerEmail?: string; customerCompanyName?: string } | undefined;
        if (campaignLead) {
          const lead = await db.getLeadById(campaignLead.leadId);
          if ((lead as any)?.unsubscribed) {
            await db.updateFollowUpCall(call.id, { status: "failed" });
            console.log(`[FollowUpScheduler] Skipping call for campaignLeadId: ${call.campaignLeadId} - lead globally unsubscribed`);
            continue;
          }
          if (lead) {
            leadContext = {
              customerName: lead.ownerName,
              customerEmail: lead.email,
              customerCompanyName: lead.companyName,
            };
          }
        }

        // Trigger the Retell.AI call
        await db.updateFollowUpCall(call.id, { status: "initiated", initiatedAt: new Date() });

        await triggerRetellCall(
          call.campaignLeadId,
          normalizedPhone,
          retellApiKey,
          retellAgentId,
          normalizedFromPhone,
          "email_open",
          leadContext,
          callerCompanyName
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
 * Schedule a Retell.AI call for 2 minutes after a follow-up email is opened
 * or clicked, adjusted into the 10 AM - 6 PM Eastern call window if that
 * lands outside it. This is the primary call trigger mechanism -- it does
 * NOT call immediately (the lead needs a moment to actually read the email
 * first) and does NOT call Retell.AI directly; it creates a "scheduled"
 * followUpCalls row that the existing processScheduledFollowUpCalls cron
 * (running every few minutes) picks up and actually places, once due --
 * that cron already re-fetches lead context and settings fresh at call time,
 * so nothing needs to be passed through here beyond what identifies the call.
 */
export async function triggerCallOnFollowUpOpen(
  campaignLeadId: number,
  leadPhone: string,
  triggerType: "email_open" | "email_click"
) {
  try {
    // Skip unsubscribed (this campaign, or globally via any other campaign) or replied leads
    const campaignLead = await db.getCampaignLeadById(campaignLeadId);
    if (campaignLead?.unsubscribed || campaignLead?.replied) {
      console.log(`[FollowUpScheduler] Not scheduling call for campaignLeadId: ${campaignLeadId} - ${campaignLead.replied ? 'replied' : 'unsubscribed'}`);
      return { success: false, reason: campaignLead.replied ? "replied" : "unsubscribed" };
    }
    if (campaignLead) {
      const lead = await db.getLeadById(campaignLead.leadId);
      if ((lead as any)?.unsubscribed) {
        console.log(`[FollowUpScheduler] Not scheduling call for campaignLeadId: ${campaignLeadId} - lead globally unsubscribed`);
        return { success: false, reason: "unsubscribed" };
      }
    }

    // Check if any previous call for this campaign lead was answered
    const allCalls = await db.getFollowUpCallsByCampaignLead(campaignLeadId);
    const wasAnswered = allCalls.some(
      (c: any) => c.status === "completed" || c.status === "in_progress"
    );

    if (wasAnswered) {
      console.log(`[FollowUpScheduler] Lead already answered a call. Not scheduling another for campaignLeadId: ${campaignLeadId}`);
      return { success: false, reason: "already_answered" };
    }

    // Wait 2 minutes to give the lead time to actually read the email, then
    // only within the 10 AM - 6 PM Eastern call window -- if that lands
    // outside it, push to 10 AM Eastern the next day instead of skipping.
    const scheduledFor = nextEasternBusinessSlot(new Date(Date.now() + 2 * 60 * 1000));

    const normalizedPhone = normalizePhoneNumber(leadPhone);
    const existingCalls = allCalls.length;
    await db.createFollowUpCall({
      campaignLeadId,
      attemptNumber: existingCalls + 1,
      phoneNumber: normalizedPhone,
      status: "scheduled",
      scheduledFor,
    });

    console.log(`[FollowUpScheduler] Scheduled call for campaignLeadId: ${campaignLeadId} at ${scheduledFor.toISOString()} (2 min after ${triggerType}, adjusted to 10AM-6PM Eastern)`);

    return { success: true, scheduledFor };
  } catch (error) {
    console.error("[FollowUpScheduler] Error scheduling call on follow-up open:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get the user's signature as HTML.
 * Prioritizes signaturePlainText (user's actual signature) over signatureHtml (template).
 *
 * `wrapLink`, when provided, routes every link this generates (website,
 * LinkedIn, etc.) through the same /api/track/click/ redirect used for the
 * rest of the email body, so signature clicks count in click tracking too
 * -- pass it whenever this is a real send with a real tracking token;
 * omit it for test/preview sends where there's no real lead to attribute a
 * click to.
 */
function getSignatureHtml(signature: any, wrapLink?: (url: string) => string): string {
  if (!signature) return '';
  const wrap = wrapLink || ((url: string) => url);

  // Use the plain text signature (user's actual signature) and convert to HTML
  if (signature.signaturePlainText && signature.signaturePlainText.trim()) {
    const lines = signature.signaturePlainText.split('\n');
    const htmlLines = lines.map((line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return '<br/>';
      let processed = trimmed;
      // Detect full URLs (https:// or http://) and make them clickable
      processed = processed.replace(/(https?:\/\/[^\s]+)/g, (m) => `<a href="${wrap(m)}" style="color:#2563eb;text-decoration:none;">${m}</a>`);
      // Detect www. URLs without protocol and make them clickable
      processed = processed.replace(/(?<!href="https?:\/\/)(?<!\/)\b(www\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s]*)/g, (_m, p1) => `<a href="${wrap('https://' + p1)}" style="color:#2563eb;text-decoration:none;">${p1}</a>`);
      // Detect email addresses (but not ones already in href)
      processed = processed.replace(/(?<!mailto:)(?<!\/)\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '<a href="mailto:$1" style="color:#2563eb;text-decoration:none;">$1</a>');
      // Detect bare domains typed with no http/www prefix -- e.g a website
      // or LinkedIn URL written as "virtualassistant-group.com" or
      // "linkedin.com/in/nitin" -- so these become real clickable links
      // instead of sitting there as plain text. Skipped if the line already
      // got turned into a link above, to avoid re-wrapping text that's
      // already inside an <a> tag.
      if (!/<a /.test(processed)) {
        processed = processed.replace(
          /\b([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.(?:com|net|org|io|co|ai|dev|app|biz|info|me|us|group|agency|tech)\b(?:\/[^\s<]*)?)/gi,
          (m) => `<a href="${wrap('https://' + m)}" style="color:#2563eb;text-decoration:none;">${m}</a>`
        );
      }
      return `<p style="margin:0;padding:0;line-height:1.6;font-family:Arial,Helvetica,sans-serif;font-size:14px;">${processed}</p>`;
    });
    return `<br/><br/><div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#333;padding-top:12px;margin-top:16px;border-top:1px solid #e5e7eb;">${htmlLines.join('')}</div>`;
  }

  // Fallback to signatureHtml if no plain text version
  if (signature.signatureHtml && signature.signatureHtml.trim()) {
    return `<br/><br/>${signature.signatureHtml}`;
  }

  return '';
}

// Export for use in other modules
export { getSignatureHtml };
