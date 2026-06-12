/**
 * GlockApps Inbox Placement Testing Integration
 * API Docs: https://glockapps.com/api-documentation-v2/
 * Swagger: https://docs.spamtest.prod-k8s.glockapps.com/
 * 
 * Tests where emails land (Inbox, Promotions, Spam) across multiple providers.
 * Requires Enterprise plan for API access.
 */

const GLOCKAPPS_API_URL = "https://api.glockapps.com/gateway/spamtest-v2/api";

export interface GlockAppsProject {
  projectId: number;
  name: string;
}

export interface GlockAppsProvider {
  providerGroupId: string;
  name: string;
  seedAccounts: { email: string; provider: string }[];
}

export interface GlockAppsTestResult {
  testId: string;
  status: "pending" | "in_progress" | "completed";
  seedAddresses: string[];
  results?: {
    provider: string;
    inbox: number;
    spam: number;
    promotions: number;
    missing: number;
    total: number;
  }[];
  summary?: {
    totalInbox: number;
    totalSpam: number;
    totalPromotions: number;
    totalMissing: number;
    inboxRate: number;
    spamRate: number;
    promotionsRate: number;
  };
}

export interface InboxPlacementReport {
  testId: string;
  status: "pending" | "in_progress" | "completed" | "error";
  seedAddresses: string[];
  providers: {
    name: string;
    inbox: number;
    spam: number;
    promotions: number;
    missing: number;
    inboxPercent: number;
  }[];
  overall: {
    inboxRate: number;
    spamRate: number;
    promotionsRate: number;
    recommendation: "safe_to_send" | "review_needed" | "do_not_send";
    message: string;
  };
}

/**
 * Get list of projects from GlockApps
 */
export async function getProjects(apiKey: string): Promise<GlockAppsProject[]> {
  const response = await fetch(`${GLOCKAPPS_API_URL}/projects`, {
    headers: { "x-api-key": apiKey },
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new Error("GLOCKAPPS_INVALID_KEY");
    }
    throw new Error(`GlockApps API error: ${response.status} - ${text}`);
  }

  return response.json();
}

/**
 * Get available provider groups (Gmail, Outlook, Yahoo, etc.)
 */
export async function getProviders(apiKey: string): Promise<GlockAppsProvider[]> {
  const response = await fetch(`${GLOCKAPPS_API_URL}/providers`, {
    headers: { "x-api-key": apiKey },
  });

  if (!response.ok) {
    throw new Error(`GlockApps providers error: ${response.status}`);
  }

  return response.json();
}

/**
 * Create a manual inbox placement test
 * Returns seed addresses to send your test email to
 */
export async function createManualTest(
  apiKey: string,
  projectId: number,
  providerGroupIds?: string[]
): Promise<{ testId: string; seedAddresses: string[] }> {
  // If no specific providers, use all available
  if (!providerGroupIds || providerGroupIds.length === 0) {
    const providers = await getProviders(apiKey);
    providerGroupIds = providers.map(p => p.providerGroupId);
  }

  const response = await fetch(`${GLOCKAPPS_API_URL}/projects/${projectId}/manualTest`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      providerGroupIds,
      testType: "ManualTest",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new Error("GLOCKAPPS_INVALID_KEY");
    }
    if (response.status === 402) {
      throw new Error("GLOCKAPPS_NO_CREDITS");
    }
    throw new Error(`GlockApps create test error: ${response.status} - ${text}`);
  }

  const data = await response.json();
  return {
    testId: data.testId || data.id,
    seedAddresses: data.seedAddresses || data.emails || [],
  };
}

/**
 * Get test results from GlockApps
 */
export async function getTestResults(apiKey: string, projectId: number, testId: string): Promise<InboxPlacementReport> {
  const response = await fetch(`${GLOCKAPPS_API_URL}/projects/${projectId}/tests/${testId}`, {
    headers: { "x-api-key": apiKey },
  });

  if (!response.ok) {
    throw new Error(`GlockApps get results error: ${response.status}`);
  }

  const data = await response.json();
  
  // Parse the results into our format
  const providers: InboxPlacementReport["providers"] = [];
  let totalInbox = 0, totalSpam = 0, totalPromo = 0, totalCount = 0;

  if (data.results && Array.isArray(data.results)) {
    for (const r of data.results) {
      const total = (r.inbox || 0) + (r.spam || 0) + (r.promotions || 0) + (r.missing || 0);
      providers.push({
        name: r.provider || r.providerGroup || "Unknown",
        inbox: r.inbox || 0,
        spam: r.spam || 0,
        promotions: r.promotions || 0,
        missing: r.missing || 0,
        inboxPercent: total > 0 ? Math.round(((r.inbox || 0) / total) * 100) : 0,
      });
      totalInbox += r.inbox || 0;
      totalSpam += r.spam || 0;
      totalPromo += r.promotions || 0;
      totalCount += total;
    }
  }

  const inboxRate = totalCount > 0 ? Math.round((totalInbox / totalCount) * 100) : 0;
  const spamRate = totalCount > 0 ? Math.round((totalSpam / totalCount) * 100) : 0;
  const promotionsRate = totalCount > 0 ? Math.round((totalPromo / totalCount) * 100) : 0;

  let recommendation: "safe_to_send" | "review_needed" | "do_not_send";
  let message: string;

  if (inboxRate >= 80) {
    recommendation = "safe_to_send";
    message = `Excellent! ${inboxRate}% inbox placement. Safe to send your campaign.`;
  } else if (inboxRate >= 50) {
    recommendation = "review_needed";
    message = `Warning: Only ${inboxRate}% inbox placement. ${spamRate}% going to spam. Review your email content and sender reputation.`;
  } else {
    recommendation = "do_not_send";
    message = `Critical: Only ${inboxRate}% inbox placement. ${spamRate}% going to spam. Do NOT send this campaign without fixing deliverability issues.`;
  }

  return {
    testId,
    status: data.status === "completed" ? "completed" : data.status === "in_progress" ? "in_progress" : "pending",
    seedAddresses: data.seedAddresses || [],
    providers,
    overall: {
      inboxRate,
      spamRate,
      promotionsRate,
      recommendation,
      message,
    },
  };
}

/**
 * Create or get the default project for our tests
 */
export async function getOrCreateProject(apiKey: string, projectName: string = "Lead Gen Outreach"): Promise<number> {
  const projects = await getProjects(apiKey);
  const existing = projects.find(p => p.name === projectName);
  
  if (existing) {
    return existing.projectId;
  }

  // Create a new project
  const response = await fetch(`${GLOCKAPPS_API_URL}/projects`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: projectName }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create GlockApps project: ${response.status}`);
  }

  const data = await response.json();
  return data.projectId || data.id;
}
