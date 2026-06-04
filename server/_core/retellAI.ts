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
 * Trigger an outbound call via Retell.AI
 */
export async function triggerRetellCall(
  campaignLeadId: number,
  phoneNumber: string,
  apiKey: string,
  agentId: string,
  senderPhoneNumber: string,
  triggerReason: "email_open" | "email_click"
): Promise<string | null> {
  try {
    if (!apiKey || !agentId || !senderPhoneNumber) {
      console.error("Missing Retell.AI configuration");
      return null;
    }

    console.log(`[RetellAI] Creating phone call - to: ${phoneNumber}, from: ${senderPhoneNumber}, agent: ${agentId}`);
    
    // Make API call to Retell.AI (v2 endpoint)
    const response = await axios.post<RetellCallResponse>(
      `${RETELL_API_BASE}/v2/create-phone-call`,
      {
        from_number: senderPhoneNumber,
        to_number: phoneNumber,
        override_agent_id: agentId,
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
  } catch (error) {
    console.error("Failed to trigger Retell.AI call:", error);
    return null;
  }
}

/**
 * Handle Retell.AI webhook for call status updates
 */
export async function handleRetellWebhook(payload: any) {
  try {
    const { call_id, status, end_reason } = payload;

    if (!call_id) {
      console.error("Missing call_id in webhook payload");
      return;
    }

    // Find the call log
    const callLog = await db.getCallLogByRetellId(call_id);
    if (!callLog) {
      console.warn(`Call log not found for call_id: ${call_id}`);
      return;
    }

    // Update call status
    const updateData: any = {
      status,
    };

    if (status === "completed" || status === "failed") {
      updateData.updatedAt = new Date();
    }

    await db.updateCallLog(callLog.id, updateData);
  } catch (error) {
    console.error("Failed to handle Retell webhook:", error);
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
