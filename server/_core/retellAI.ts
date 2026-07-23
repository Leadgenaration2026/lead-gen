import axios from "axios";
import * as db from "../db";

const RETELL_API_BASE = "https://api.retellai.com";

export interface RetellCallResponse {
  call_id: string;
  agent_id: string;
  to_number: string;
  from_number: string;
  call_type: string;
  direction: string;
  status: string;
  created_at?: string;
}

/**
 * Lead context passed to Retell.AI dynamic variables so the AI agent
 * can address the customer by name and confirm their email during the call.
 */
export interface RetellLeadContext {
  customerName?: string;
  customerEmail?: string;
  // The LEAD's/customer's own business (e.g. the plumbing company being
  // called), sent as "customer_company_name" -- NOT the caller's own company.
  // This was previously named `companyName` and sent as the "company_name"
  // variable, which the agent's script reads as "the company I'm calling
  // FROM" -- that caused the agent to introduce itself using the customer's
  // own business name instead of the caller's (see callerCompanyName below).
  customerCompanyName?: string;
}

/**
 * Trigger an outbound call via Retell.AI
 */
export async function triggerRetellCall(
  campaignLeadId: number,
  phoneNumber: string,
  apiKey: string,
  agentId: string,
  senderPhoneNumber: string,
  triggerReason: "email_open" | "email_click",
  leadContext?: RetellLeadContext,
  // The CALLER's own business name (from Settings, e.g. "Virtual Assistant
  // Group") -- this is what the agent's "company_name" variable is meant to
  // represent ("calling from {{company_name}}").
  callerCompanyName?: string
): Promise<string | null> {
  try {
    if (!apiKey || !agentId || !senderPhoneNumber) {
      console.error("Missing Retell.AI configuration");
      return null;
    }

    console.log(`[RetellAI] Creating phone call - to: ${phoneNumber}, from: ${senderPhoneNumber}, agent: ${agentId}, customer: ${leadContext?.customerName || 'unknown'}`);

    // Build dynamic variables to pass customer context to the AI agent
    const retell_llm_dynamic_variables: Record<string, string> = {};
    if (leadContext?.customerName) {
      retell_llm_dynamic_variables.customer_name = leadContext.customerName;
    }
    if (leadContext?.customerEmail) {
      retell_llm_dynamic_variables.customer_email = leadContext.customerEmail;
    }
    if (callerCompanyName) {
      retell_llm_dynamic_variables.company_name = callerCompanyName;
    }
    if (leadContext?.customerCompanyName) {
      retell_llm_dynamic_variables.customer_company_name = leadContext.customerCompanyName;
    }

    // Make API call to Retell.AI (v2 endpoint)
    const response = await axios.post<RetellCallResponse>(
      `${RETELL_API_BASE}/v2/create-phone-call`,
      {
        from_number: senderPhoneNumber,
        to_number: phoneNumber,
        override_agent_id: agentId,
        ...(Object.keys(retell_llm_dynamic_variables).length > 0 && { retell_llm_dynamic_variables }),
        metadata: {
          campaign_lead_id: String(campaignLeadId),
          trigger_reason: triggerReason,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`[RetellAI] Call created successfully:`, JSON.stringify(response.data));
    const callId = response.data.call_id;

    // Log the call in database
    await db.createCallLog({
      campaignLeadId,
      retellCallId: callId,
      phoneNumber,
      status: "initiated",
      triggerType: triggerReason,
    });

    // Update campaign lead to mark call as triggered
    const campaignLead = await db.getCampaignLeadById(campaignLeadId);
    if (campaignLead) {
      await db.updateCampaignLead(campaignLeadId, {
        callTriggered: 1 as any,
        callTriggeredAt: new Date().toISOString(),
      });

      // Update campaign call count
      const campaign = await db.getCampaignById(campaignLead.campaignId);
      if (campaign) {
        await db.updateCampaign(campaignLead.campaignId, {
          callCount: (campaign.callCount || 0) + 1,
        });
      }
    }

    return callId;
  } catch (error: any) {
    if (error.response) {
      console.error(`[RetellAI] API Error ${error.response.status}:`, JSON.stringify(error.response.data));
    } else if (error.request) {
      console.error(`[RetellAI] No response received:`, error.message);
    } else {
      console.error(`[RetellAI] Error:`, error.message);
    }
    return null;
  }
}

/**
 * Handle Retell.AI webhook for call status updates
 * When a call is "completed" (answered), cancel all pending follow-ups for that lead
 * When a call fails (no answer, voicemail, etc.), retry with secondary phone if available
 */
export async function handleRetellWebhook(payload: any) {
  try {
    // Retell's webhook body is { event, call: { call_id, call_status, disconnection_reason, ... } } —
    // the call fields are nested under `call`, not at the top level.
    const call = payload?.call || {};
    const call_id = call.call_id;
    const status = call.call_status;
    const end_reason = call.disconnection_reason;
    console.log(`[RetellAI] Webhook received - event: ${payload?.event}, call_id: ${call_id}, status: ${status}, end_reason: ${end_reason}`);

    if (!call_id) {
      console.error("[RetellAI] Missing call_id in webhook payload");
      return;
    }

    // Find the call log
    const callLog = await db.getCallLogByRetellId(call_id);
    if (!callLog) {
      console.warn(`[RetellAI] Call log not found for call_id: ${call_id}`);
      return;
    }

    // Update call status
    const mappedStatus = mapRetellStatus(status, end_reason);
    const updateData: any = {
      status: mappedStatus,
    };

    if (status === "completed" || status === "failed" || status === "ended") {
      updateData.updatedAt = new Date();
    }

    if (end_reason) {
      updateData.endReason = end_reason;
    }

    // Recording/transcript are usually only present once the call has fully
    // ended (and the recording finishes processing on Retell's side, which
    // can arrive on a later webhook delivery for the same call_id) -- so
    // capture them whenever present rather than only on a specific event,
    // and never overwrite a previously-saved value with an absent one.
    if (call.recording_url) {
      updateData.recordingUrl = call.recording_url;
    }
    if (typeof call.duration_ms === "number") {
      updateData.duration = Math.round(call.duration_ms / 1000);
    }
    if (call.transcript) {
      updateData.transcript = call.transcript;
    }
    if (call.call_analysis) {
      updateData.callAnalysis = call.call_analysis;
    }

    await db.updateCallLog(callLog.id, updateData);
    console.log(`[RetellAI] Updated call log ${callLog.id} status to: ${mappedStatus}${call.recording_url ? " (recording captured)" : ""}`);

    // If call was answered/completed, cancel remaining follow-ups
    // Retell uses "ended" with disconnection_reason to indicate call completion
    if (status === "ended" && (end_reason === "agent_hangup" || end_reason === "user_hangup")) {
      // Call was answered - this is a positive engagement
      await db.cancelPendingFollowUps(callLog.campaignLeadId);
      console.log(`[RetellAI] Call answered - cancelled pending follow-ups for campaignLead ${callLog.campaignLeadId}`);
    }

    if (status === "ended" && end_reason === "voicemail_reached") {
      // A voicemail message was already left on this attempt -- calling
      // again (even from the secondary number) would just leave a second
      // voicemail, which isn't more effective. Stop all remaining scheduled
      // calls for this lead; follow-up emails are unaffected and continue
      // as normal.
      await db.cancelPendingFollowUpCalls(callLog.campaignLeadId);
      console.log(`[RetellAI] Voicemail reached - cancelled remaining scheduled calls for campaignLead ${callLog.campaignLeadId}`);
    } else {
      // FALLBACK: If the call never actually connected (no answer, busy,
      // dial failure), retry once with the secondary phone number.
      const failedReasons = ["dial_no_answer", "dial_busy", "dial_failed", "invalid_destination"];
      if (status === "ended" && failedReasons.includes(end_reason)) {
        await retryWithSecondaryPhone(callLog, end_reason);
      }
    }
  } catch (error) {
    console.error("[RetellAI] Failed to handle webhook:", error);
  }
}

/**
 * Map Retell.AI call_status + disconnection_reason to our internal call status.
 * Retell's call_status enum is: registered, not_connected, ongoing, ended, error.
 */
function mapRetellStatus(status: string, endReason: string): string {
  if (status === "ended") {
    if (endReason === "agent_hangup" || endReason === "user_hangup") return "completed";
    if (endReason === "dial_no_answer") return "no_answer";
    if (endReason === "voicemail_reached") return "no_answer";
    if (endReason === "dial_busy" || endReason === "dial_failed") return "failed";
    return "failed";
  }
  // "ongoing" maps to our "in_progress" so the already-answered/active-call guards
  // (which check for "in_progress") correctly skip re-triggering a call mid-conversation.
  if (status === "ongoing") return "in_progress";
  if (status === "not_connected" || status === "error") return "failed";
  // "registered" (call queued, not yet connected) has no distinct value in our
  // callLogs/followUpCalls status enum — keep it as "initiated".
  return "initiated";
}

/**
 * Retry a failed call with the lead's secondary phone number.
 * Only retries once — if the secondary also fails, no further retries.
 */
async function retryWithSecondaryPhone(callLog: any, endReason: string) {
  try {
    // Get the campaign lead to find the lead
    const campaignLead = await db.getCampaignLeadById(callLog.campaignLeadId);
    if (!campaignLead) {
      console.log(`[RetellAI] Fallback skipped - campaignLead not found: ${callLog.campaignLeadId}`);
      return;
    }

    // Get the lead to check for secondary phone
    const lead = await db.getLeadById(campaignLead.leadId);
    if (!lead || !lead.secondaryPhone) {
      console.log(`[RetellAI] Fallback skipped - no secondary phone for lead ${campaignLead.leadId}`);
      return;
    }

    // Normalize secondary phone
    const secondaryPhone = lead.secondaryPhone.replace(/[^+\d]/g, "");
    const primaryPhone = callLog.phoneNumber.replace(/[^+\d]/g, "");

    // Don't retry if secondary is same as primary
    if (secondaryPhone === primaryPhone) {
      console.log(`[RetellAI] Fallback skipped - secondary phone same as primary for lead ${campaignLead.leadId}`);
      return;
    }

    // Check if we already tried the secondary phone for this campaign lead
    const existingCalls = await db.getCallLogsByCampaignLead(callLog.campaignLeadId);
    const alreadyTriedSecondary = existingCalls.some(
      (c: any) => c.phoneNumber.replace(/[^+\d]/g, "") === secondaryPhone
    );
    if (alreadyTriedSecondary) {
      console.log(`[RetellAI] Fallback skipped - secondary phone already tried for campaignLead ${callLog.campaignLeadId}`);
      return;
    }

    // Get user settings for Retell config
    const campaign = await db.getCampaignById(campaignLead.campaignId);
    if (!campaign) return;
    const settings = await db.getUserSettings(campaign.userId);
    if (!settings?.retellApiKey || !settings?.retellAgentId || !settings?.senderPhoneNumber) {
      console.log(`[RetellAI] Fallback skipped - missing Retell configuration`);
      return;
    }

    console.log(`[RetellAI] ⚡ FALLBACK: Primary (${primaryPhone}) failed (${endReason}). Retrying with secondary: ${secondaryPhone}`);

    // Trigger the fallback call
    const callId = await triggerRetellCall(
      callLog.campaignLeadId,
      secondaryPhone,
      settings.retellApiKey,
      settings.retellAgentId,
      settings.senderPhoneNumber,
      callLog.triggerType || "email_open",
      { customerName: lead.ownerName || undefined, customerEmail: lead.email || undefined, customerCompanyName: lead.companyName || undefined },
      settings.companyName || undefined
    );

    if (callId) {
      console.log(`[RetellAI] ✅ Fallback call created successfully - callId: ${callId}, to: ${secondaryPhone}`);
    } else {
      console.log(`[RetellAI] ❌ Fallback call failed to create for secondary: ${secondaryPhone}`);
    }
  } catch (error) {
    console.error("[RetellAI] Error in retryWithSecondaryPhone:", error);
  }
}

/**
 * Get call status from Retell.AI
 */
export async function getCallStatus(
  callId: string,
  apiKey: string
): Promise<RetellCallResponse | null> {
  try {
    const response = await axios.get<RetellCallResponse>(
      `${RETELL_API_BASE}/v1/get-phone-call/${callId}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error("Failed to get call status:", error);
    return null;
  }
}
