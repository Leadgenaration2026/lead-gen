import * as db from "../db";
import { generateFollowUpSequence } from "./emailGeneration";
import { triggerRetellCall } from "./retellAI";
import { nanoid } from "nanoid";

/**
 * Schedule follow-up emails for a campaign lead
 */
export async function scheduleFollowUpEmails(
  campaignLeadId: number,
  leadId: number,
  leadEmail: string,
  leadPhone: string,
  ownerName: string,
  companyName: string,
  ctaLink: string,
  signature: string,
  emailFollowUpCount: number = 7,
  emailFollowUpIntervalDays: number = 7
) {
  try {
    // Get lead weak points
    let weakPoints: any = await db.getLeadWeakPoints(leadId);
    if (!weakPoints) {
      // Analyze weak points if not already done
      const { analyzeLeadWeakPoints } = await import("./emailGeneration");
      const points = await analyzeLeadWeakPoints({
        ownerName,
        companyName,
        email: leadEmail,
      });
      await db.upsertLeadWeakPoints(leadId, points, "Auto-analyzed", ["discovery", "value_prop"]);
      weakPoints = await db.getLeadWeakPoints(leadId);
    }

    // Generate follow-up sequence
    const sequence = await generateFollowUpSequence(
      {
        ownerName,
        companyName,
        email: leadEmail,
      },
      (weakPoints?.weakPoints as string[]) || [],
      ctaLink,
      signature
    );

    // Schedule each follow-up email
    for (let i = 0; i < Math.min(sequence.length, emailFollowUpCount); i++) {
      const email = sequence[i];
      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + email.dayOffset);

      const trackingToken = nanoid();
      await db.createFollowUpEmail({
        campaignLeadId,
        sequenceNumber: i + 1,
        emailType: email.emailType,
        subject: email.subject,
        emailBody: email.body,
        ctaLink,
        status: "scheduled",
        scheduledFor: scheduledDate,
        trackingToken,
      });
    }

    return { success: true, emailsScheduled: Math.min(sequence.length, emailFollowUpCount) };
  } catch (error) {
    console.error("[FollowUpScheduler] Error scheduling follow-up emails:", error);
    throw error;
  }
}

/**
 * Schedule follow-up calls for a campaign lead
 */
export async function scheduleFollowUpCalls(
  campaignLeadId: number,
  leadPhone: string,
  callFollowUpCount: number = 7,
  callFollowUpIntervalHours: number = 24
) {
  try {
    const now = new Date();

    // Schedule follow-up calls
    for (let i = 0; i < callFollowUpCount; i++) {
      const scheduledDate = new Date(now);
      scheduledDate.setHours(scheduledDate.getHours() + callFollowUpIntervalHours * (i + 1));

      await db.createFollowUpCall({
        campaignLeadId,
        attemptNumber: i + 1,
        phoneNumber: leadPhone,
        status: "scheduled",
        scheduledFor: scheduledDate,
      });
    }

    return { success: true, callsScheduled: callFollowUpCount };
  } catch (error) {
    console.error("[FollowUpScheduler] Error scheduling follow-up calls:", error);
    throw error;
  }
}

/**
 * Process scheduled follow-up emails (called by cron job)
 */
export async function processScheduledFollowUpEmails() {
  try {
    const now = new Date();
    console.log("[FollowUpScheduler] Processing scheduled follow-up emails at", now);
  } catch (error) {
    console.error("[FollowUpScheduler] Error processing scheduled follow-up emails:", error);
  }
}

/**
 * Process scheduled follow-up calls (called by cron job)
 */
export async function processScheduledFollowUpCalls(retellApiKey: string, retellAgentId: string) {
  try {
    const now = new Date();
    console.log("[FollowUpScheduler] Processing scheduled follow-up calls at", now);
  } catch (error) {
    console.error("[FollowUpScheduler] Error processing scheduled follow-up calls:", error);
  }
}

/**
 * Trigger immediate follow-up call if email was opened/clicked
 */
export async function triggerImmediateFollowUpCall(
  campaignLeadId: number,
  leadPhone: string,
  retellApiKey: string,
  retellAgentId: string,
  senderPhoneNumber: string,
  triggerType: "email_open" | "email_click"
) {
  try {
    // Create a follow-up call record
    const followUpCall = await db.createFollowUpCall({
      campaignLeadId,
      attemptNumber: 1,
      phoneNumber: leadPhone,
      status: "initiated",
      initiatedAt: new Date(),
    });

    // Trigger the Retell.AI call
    const callResult = await triggerRetellCall(
      campaignLeadId,
      leadPhone,
      retellApiKey,
      retellAgentId,
      senderPhoneNumber,
      triggerType
    );

    return { success: true, callId: callResult };
  } catch (error) {
    console.error("[FollowUpScheduler] Error triggering immediate follow-up call:", error);
    throw error;
  }
}
