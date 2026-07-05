/**
 * Phone Verification via Seamless.AI REST API
 * Uses Research → Poll flow to get verified phone numbers
 * Each research request costs 1 credit per contact
 */

import { researchContact, pollContactResults } from "./seamlessAI";

export interface PhoneVerificationResult {
  leadId: number;
  seamlessId: string;
  phone?: string;
  verified: boolean;
  creditsCost: number;
  error?: string;
}

export interface PhoneVerificationStats {
  totalRequested: number;
  verified: number;
  failed: number;
  totalCreditsUsed: number;
  results: PhoneVerificationResult[];
}

/**
 * Verify phone numbers for leads using Seamless.AI REST API
 * @param apiKey Seamless.AI API key
 * @param leads Array of leads with seamlessId
 * @returns Phone verification results with credit tracking
 */
export async function verifyPhoneNumbers(
  apiKey: string,
  leads: Array<{ id: number; seamlessId: string }>
): Promise<PhoneVerificationStats> {
  const stats: PhoneVerificationStats = {
    totalRequested: leads.length,
    verified: 0,
    failed: 0,
    totalCreditsUsed: 0,
    results: [],
  };

  if (leads.length === 0) {
    return stats;
  }

  try {
    console.log(`[PhoneVerification] Starting verification for ${leads.length} leads`);

    // Step 1: Submit research requests (1 credit per contact)
    const seamlessIds = leads.map((l) => l.seamlessId);
    const researchResponse = await researchContact(apiKey, seamlessIds);

    if (!researchResponse.success || !researchResponse.requestIds?.length) {
      throw new Error("Failed to submit research requests to Seamless.AI");
    }

    // Track credits used (1 per research request)
    stats.totalCreditsUsed = researchResponse.requestIds.length;
    console.log(
      `[PhoneVerification] Submitted ${researchResponse.requestIds.length} research requests (${stats.totalCreditsUsed} credits)`
    );

    // Step 2: Poll for results
    const pollResults = await pollContactResults(apiKey, researchResponse.requestIds);

    console.log(`[PhoneVerification] Received ${pollResults.length} poll results`);

    // Step 3: Map results back to leads
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const pollResult = pollResults[i];

      if (pollResult && pollResult.phone) {
        stats.results.push({
          leadId: lead.id,
          seamlessId: lead.seamlessId,
          phone: pollResult.phone,
          verified: true,
          creditsCost: 1,
        });
        stats.verified++;
      } else {
        stats.results.push({
          leadId: lead.id,
          seamlessId: lead.seamlessId,
          verified: false,
          creditsCost: 1,
          error: "No phone number found",
        });
        stats.failed++;
      }
    }

    console.log(
      `[PhoneVerification] Completed: ${stats.verified} verified, ${stats.failed} failed, ${stats.totalCreditsUsed} credits used`
    );
  } catch (error) {
    console.error("[PhoneVerification] Error during verification:", error);
    stats.failed = leads.length;
    stats.results = leads.map((lead) => ({
      leadId: lead.id,
      seamlessId: lead.seamlessId,
      verified: false,
      creditsCost: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    }));
  }

  return stats;
}

/**
 * Estimate credits needed for phone verification
 * @param leadCount Number of leads to verify
 * @returns Estimated credits (1 per lead)
 */
export function estimatePhoneVerificationCredits(leadCount: number): number {
  return leadCount; // 1 credit per contact
}
