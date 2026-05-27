import * as db from "../db";
import { generateFollowUpSequence } from "./emailGeneration";
import { triggerRetellCall } from "./retellAI";
import { nanoid } from "nanoid";

/**
 * Follow-up call schedule configuration:
 * - Day 3: 2 calls (morning + afternoon)
 * - Day 6: 2 calls (morning + afternoon)
 * - Day 12: 2 calls (morning + afternoon)
 * - Plus the initial call on engagement = 7 total calls
 * 
 * Morning call: 10:00 AM
 * Afternoon call: 3:00 PM
 */
const FOLLOW_UP_CALL_SCHEDULE = [
  { dayOffset: 3, timeSlot: "morning", hour: 10 },   // Day 3 - Morning
  { dayOffset: 3, timeSlot: "afternoon", hour: 15 },  // Day 3 - Afternoon
  { dayOffset: 6, timeSlot: "morning", hour: 10 },   // Day 6 - Morning
  { dayOffset: 6, timeSlot: "afternoon", hour: 15 },  // Day 6 - Afternoon
  { dayOffset: 12, timeSlot: "morning", hour: 10 },  // Day 12 - Morning
  { dayOffset: 12, timeSlot: "afternoon", hour: 15 }, // Day 12 - Afternoon
];

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
 * 
 * Schedule: 
 * - Initial call (triggered on email open/click) = Call #1
 * - Day 3: 2 calls (morning 10 AM + afternoon 3 PM) = Calls #2 & #3
 * - Day 6: 2 calls (morning 10 AM + afternoon 3 PM) = Calls #4 & #5
 * - Day 12: 2 calls (morning 10 AM + afternoon 3 PM) = Calls #6 & #7
 * 
 * Total: 7 calls if client never picks up
 */
export async function scheduleFollowUpCalls(
  campaignLeadId: number,
  leadPhone: string,
  callFollowUpCount: number = 7,
  callFollowUpIntervalHours: number = 24
) {
  try {
    const now = new Date();

    // Schedule follow-up calls using the custom schedule
    // (The initial call is Call #1, triggered immediately on email open/click)
    // These are Calls #2 through #7
    for (let i = 0; i < FOLLOW_UP_CALL_SCHEDULE.length; i++) {
      const schedule = FOLLOW_UP_CALL_SCHEDULE[i];
      const scheduledDate = new Date(now);
      
      // Set the day offset
      scheduledDate.setDate(scheduledDate.getDate() + schedule.dayOffset);
      
      // Set the specific time (morning = 10 AM, afternoon = 3 PM)
      scheduledDate.setHours(schedule.hour, 0, 0, 0);

      await db.createFollowUpCall({
        campaignLeadId,
        attemptNumber: i + 2, // +2 because attempt #1 is the initial call
        phoneNumber: leadPhone,
        status: "scheduled",
        scheduledFor: scheduledDate,
      });
    }

    return { success: true, callsScheduled: FOLLOW_UP_CALL_SCHEDULE.length };
  } catch (error) {
    console.error("[FollowUpScheduler] Error scheduling follow-up calls:", error);
    throw error;
  }
}

/**
 * Get the follow-up call schedule description for display
 */
export function getFollowUpCallScheduleDescription() {
  return {
    totalCalls: 7,
    schedule: [
      { label: "Initial Call", timing: "Triggered immediately on email open/click", callNumber: 1 },
      { label: "Day 3 - Morning", timing: "10:00 AM", callNumber: 2 },
      { label: "Day 3 - Afternoon", timing: "3:00 PM", callNumber: 3 },
      { label: "Day 6 - Morning", timing: "10:00 AM", callNumber: 4 },
      { label: "Day 6 - Afternoon", timing: "3:00 PM", callNumber: 5 },
      { label: "Day 12 - Morning", timing: "10:00 AM", callNumber: 6 },
      { label: "Day 12 - Afternoon", timing: "3:00 PM", callNumber: 7 },
    ],
    note: "Calls stop automatically once the client picks up.",
  };
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
 * Checks for calls that are due and triggers them via Retell.AI
 */
export async function processScheduledFollowUpCalls(retellApiKey: string, retellAgentId: string, senderPhoneNumber: string) {
  try {
    const now = new Date();
    console.log("[FollowUpScheduler] Processing scheduled follow-up calls at", now);

    // 1. Get all due follow-up calls
    const dueCalls = await db.getDueFollowUpCalls();
    console.log(`[FollowUpScheduler] Found ${dueCalls.length} due follow-up calls`);

    for (const call of dueCalls) {
      try {
        // 2. Check if any previous call for this campaign lead was answered
        const allCalls = await db.getFollowUpCallsByCampaignLead(call.campaignLeadId);
        const wasAnswered = allCalls.some(
          (c: any) => c.status === "completed" || c.status === "in_progress"
        );

        if (wasAnswered) {
          // Lead already answered - cancel remaining calls
          await db.cancelRemainingFollowUpCalls(call.campaignLeadId);
          console.log(`[FollowUpScheduler] Lead already answered. Cancelled remaining calls for campaignLeadId: ${call.campaignLeadId}`);
          continue;
        }

        // 3. Trigger the Retell.AI call
        await db.updateFollowUpCall(call.id, { status: "initiated", initiatedAt: new Date() });

        const callResult = await triggerRetellCall(
          call.campaignLeadId,
          call.phoneNumber,
          retellApiKey,
          retellAgentId,
          senderPhoneNumber,
          "email_open"
        );

        console.log(`[FollowUpScheduler] Triggered follow-up call #${call.attemptNumber} for campaignLeadId: ${call.campaignLeadId}`);
      } catch (callError) {
        console.error(`[FollowUpScheduler] Failed to process call ${call.id}:`, callError);
        await db.updateFollowUpCall(call.id, { status: "failed" });
      }
    }
  } catch (error) {
    console.error("[FollowUpScheduler] Error processing scheduled follow-up calls:", error);
  }
}

/**
 * Trigger immediate follow-up call if email was opened/clicked
 * This is Call #1 in the sequence
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
    // Create a follow-up call record (this is attempt #1 - the initial call)
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

    // Schedule the remaining 6 follow-up calls (Day 3, Day 6, Day 12 - 2x each)
    await scheduleFollowUpCalls(campaignLeadId, leadPhone);

    return { success: true, callId: callResult, followUpCallsScheduled: 6 };
  } catch (error) {
    console.error("[FollowUpScheduler] Error triggering immediate follow-up call:", error);
    throw error;
  }
}
