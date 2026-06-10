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
  companyName?: string;
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
  leadContext?: RetellLeadContext
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
    if (leadContext?.companyName) {
      retell_llm_dynamic_variables.company_name = leadContext.companyName;
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
        callTriggered: true,
        callTriggeredAt: new Date(),
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
 */
export async function handleRetellWebhook(payload: any) {
  try {
    const { call_id, status, end_reason, call_analysis } = payload;
    console.log(`[RetellAI] Webhook received - call_id: ${call_id}, status: ${status}, end_reason: ${end_reason}`);

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
    const updateData: any = {
      status,
    };

    if (status === "completed" || status === "failed" || status === "ended") {
      updateData.updatedAt = new Date();
    }

    await db.updateCallLog(callLog.id, updateData);
    console.log(`[RetellAI] Updated call log ${callLog.id} status to: ${status}`);

    // If call was answered/completed, cancel remaining follow-ups
    // Retell uses "ended" with end_reason to indicate call completion
    if (status === "ended" && end_reason === "agent_hangup" || status === "ended" && end_reason === "customer_hangup") {
      // Call was answered - this is a positive engagement
      await db.cancelPendingFollowUps(callLog.campaignLeadId);
      console.log(`[RetellAI] Call answered - cancelled pending follow-ups for campaignLead ${callLog.campaignLeadId}`);
    }
  } catch (error) {
    console.error("[RetellAI] Failed to handle webhook:", error);
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
