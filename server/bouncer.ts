/**
 * Bouncer Email Verification Integration
 * API Docs: https://docs.usebouncer.com/api-reference/real-time/verify-email
 * 
 * Validates email addresses before campaign sends to protect sender reputation.
 * Statuses: deliverable, risky, undeliverable, unknown
 */

const BOUNCER_API_URL = "https://api.usebouncer.com/v1.1";

export interface BouncerDomainInfo {
  name: string;
  acceptAll: "yes" | "no";
  disposable: "yes" | "no";
  free: "yes" | "no";
}

export interface BouncerAccountInfo {
  role: "yes" | "no";
  disabled: "yes" | "no";
  fullMailbox: "yes" | "no";
}

export interface BouncerDnsInfo {
  type: string;
  record: string;
}

export interface BouncerResult {
  email: string;
  status: "deliverable" | "risky" | "undeliverable" | "unknown";
  reason: string;
  domain: BouncerDomainInfo;
  account: BouncerAccountInfo;
  dns: BouncerDnsInfo;
  provider: string;
  score: number;
  toxic: string;
  toxicity: number;
  retryAfter?: string;
}

export interface VerificationSummary {
  total: number;
  deliverable: number;
  risky: number;
  undeliverable: number;
  unknown: number;
  results: BouncerResult[];
}

/**
 * Validate a single email address via Bouncer Real-Time API
 */
export async function validateEmail(apiKey: string, email: string, timeout = 10): Promise<BouncerResult> {
  const url = `${BOUNCER_API_URL}/email/verify?email=${encodeURIComponent(email)}&timeout=${timeout}`;
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
  });
  
  if (response.status === 401 || response.status === 403) {
    throw new Error("BOUNCER_INVALID_API_KEY");
  }
  
  if (response.status === 429) {
    throw new Error("BOUNCER_RATE_LIMIT");
  }

  if (response.status === 402) {
    throw new Error("BOUNCER_NO_CREDITS");
  }
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bouncer API error: ${response.status} - ${text}`);
  }
  
  const data = await response.json();
  return data as BouncerResult;
}

/**
 * Validate multiple emails in batch (sequential with rate limiting)
 * Bouncer allows 1000 requests per minute, so we process in batches
 */
export async function validateEmails(
  apiKey: string, 
  emails: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<VerificationSummary> {
  const results: BouncerResult[] = [];
  const summary: VerificationSummary = {
    total: emails.length,
    deliverable: 0,
    risky: 0,
    undeliverable: 0,
    unknown: 0,
    results: [],
  };

  // Process in batches of 40 concurrently (stay well under 1000/min rate limit)
  const batchSize = 40;
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(email => validateEmail(apiKey, email))
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        const r = result.value;
        results.push(r);
        switch (r.status) {
          case "deliverable": summary.deliverable++; break;
          case "risky": summary.risky++; break;
          case "undeliverable": summary.undeliverable++; break;
          case "unknown": summary.unknown++; break;
        }
      } else {
        // If it's a key/credits error, throw immediately
        if (result.reason?.message === "BOUNCER_INVALID_API_KEY") {
          throw new Error("BOUNCER_INVALID_API_KEY");
        }
        if (result.reason?.message === "BOUNCER_NO_CREDITS") {
          throw new Error("BOUNCER_NO_CREDITS");
        }
        // Otherwise mark as unknown
        summary.unknown++;
      }
    }

    if (onProgress) {
      onProgress(Math.min(i + batchSize, emails.length), emails.length);
    }

    // Delay between batches to respect rate limits (1000 req/min = ~16/sec)
    if (i + batchSize < emails.length) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  summary.results = results;
  return summary;
}

/**
 * Check Bouncer credit balance
 */
export async function getCreditsBalance(apiKey: string): Promise<number> {
  const url = `${BOUNCER_API_URL}/credits`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
    },
  });
  
  if (response.status === 401 || response.status === 403) {
    throw new Error("BOUNCER_INVALID_API_KEY");
  }
  
  if (!response.ok) {
    throw new Error("Failed to check Bouncer credits");
  }
  
  const data = await response.json();
  // Bouncer returns { credits: number } or similar
  return data.credits || 0;
}

/**
 * Determine if an email should be sent based on Bouncer status
 */
export function shouldSendToEmail(result: BouncerResult): { send: boolean; reason: string } {
  switch (result.status) {
    case "deliverable":
      return { send: true, reason: "Email verified as deliverable (score: " + result.score + ")" };
    case "risky":
      // Check specific risk factors
      if (result.domain.disposable === "yes") {
        return { send: false, reason: "Disposable email address — should not email" };
      }
      if (result.account.role === "yes") {
        return { send: true, reason: "Role-based email (e.g. info@) — proceed with caution" };
      }
      if (result.domain.acceptAll === "yes") {
        return { send: true, reason: "Catch-all domain — may bounce but worth trying" };
      }
      if (result.toxicity >= 3) {
        return { send: false, reason: "High toxicity score — likely spam trap or complainer" };
      }
      return { send: true, reason: "Risky but acceptable (score: " + result.score + ")" };
    case "undeliverable":
      return { send: false, reason: `Email is undeliverable: ${result.reason}` };
    case "unknown":
      return { send: true, reason: "Could not verify (timeout or greylisted) — proceed with caution" };
    default:
      return { send: true, reason: "Unknown status" };
  }
}

/**
 * Map Bouncer status to a simple pass/fail for campaign filtering
 */
export function isEmailSendable(status: string, toxicity: number = 0): boolean {
  if (status === "deliverable") return true;
  if (status === "risky" && toxicity < 3) return true;
  if (status === "unknown") return true;
  return false;
}
