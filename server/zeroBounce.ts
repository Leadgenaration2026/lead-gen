/**
 * ZeroBounce Email Verification Integration
 * API Docs: https://www.zerobounce.net/docs/email-validation-api-quickstart/v2-validate-emails
 * 
 * Validates email addresses before campaign sends to protect sender reputation.
 * Statuses: valid, invalid, catch-all, unknown, spamtrap, abuse, do_not_mail
 */

const ZEROBOUNCE_API_URL = "https://api.zerobounce.net/v2";

export interface ZeroBounceResult {
  address: string;
  status: "valid" | "invalid" | "catch-all" | "unknown" | "spamtrap" | "abuse" | "do_not_mail";
  sub_status: string;
  free_email: boolean;
  did_you_mean: string | null;
  domain_age_days: string;
  active_in_days: string;
  smtp_provider: string;
  firstname: string | null;
  lastname: string | null;
  processed_at: string;
}

export interface VerificationSummary {
  total: number;
  valid: number;
  invalid: number;
  catchAll: number;
  unknown: number;
  spamtrap: number;
  abuse: number;
  doNotMail: number;
  results: ZeroBounceResult[];
}

/**
 * Validate a single email address via ZeroBounce API
 */
export async function validateEmail(apiKey: string, email: string): Promise<ZeroBounceResult> {
  const url = `${ZEROBOUNCE_API_URL}/validate?api_key=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(email)}&ip_address=`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    const text = await response.text();
    if (text.includes("Invalid API Key") || text.includes("ran out of credits")) {
      throw new Error("ZEROBOUNCE_INVALID_KEY_OR_NO_CREDITS");
    }
    throw new Error(`ZeroBounce API error: ${response.status} - ${text}`);
  }
  
  const data = await response.json();
  
  if (data.error) {
    if (data.error.includes("Invalid API Key") || data.error.includes("ran out of credits")) {
      throw new Error("ZEROBOUNCE_INVALID_KEY_OR_NO_CREDITS");
    }
    throw new Error(`ZeroBounce error: ${data.error}`);
  }
  
  return data as ZeroBounceResult;
}

/**
 * Validate multiple emails in batch (sequential with rate limiting)
 * ZeroBounce allows 80,000 requests per 10 seconds, so we can go fast
 */
export async function validateEmails(
  apiKey: string, 
  emails: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<VerificationSummary> {
  const results: ZeroBounceResult[] = [];
  const summary: VerificationSummary = {
    total: emails.length,
    valid: 0,
    invalid: 0,
    catchAll: 0,
    unknown: 0,
    spamtrap: 0,
    abuse: 0,
    doNotMail: 0,
    results: [],
  };

  // Process in batches of 50 concurrently to be respectful but fast
  const batchSize = 50;
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
          case "valid": summary.valid++; break;
          case "invalid": summary.invalid++; break;
          case "catch-all": summary.catchAll++; break;
          case "unknown": summary.unknown++; break;
          case "spamtrap": summary.spamtrap++; break;
          case "abuse": summary.abuse++; break;
          case "do_not_mail": summary.doNotMail++; break;
        }
      } else {
        // If it's a key/credits error, throw immediately
        if (result.reason?.message === "ZEROBOUNCE_INVALID_KEY_OR_NO_CREDITS") {
          throw new Error("ZEROBOUNCE_INVALID_KEY_OR_NO_CREDITS");
        }
        // Otherwise mark as unknown
        summary.unknown++;
      }
    }

    if (onProgress) {
      onProgress(Math.min(i + batchSize, emails.length), emails.length);
    }

    // Small delay between batches to be respectful
    if (i + batchSize < emails.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  summary.results = results;
  return summary;
}

/**
 * Check ZeroBounce credit balance
 */
export async function getCreditsBalance(apiKey: string): Promise<number> {
  const url = `${ZEROBOUNCE_API_URL}/getcredits?api_key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error("Failed to check ZeroBounce credits");
  }
  
  const data = await response.json();
  return parseInt(data.Credits || "0", 10);
}

/**
 * Determine if an email should be sent based on ZeroBounce status
 */
export function shouldSendToEmail(status: string): { send: boolean; reason: string } {
  switch (status) {
    case "valid":
      return { send: true, reason: "Email verified as valid" };
    case "catch-all":
      return { send: true, reason: "Catch-all domain (may bounce, but worth trying)" };
    case "unknown":
      return { send: true, reason: "Could not verify (greylisted or timeout)" };
    case "invalid":
      return { send: false, reason: "Email address is invalid (will hard bounce)" };
    case "spamtrap":
      return { send: false, reason: "SPAM TRAP — sending will damage reputation" };
    case "abuse":
      return { send: false, reason: "Known complainer — will mark as spam" };
    case "do_not_mail":
      return { send: false, reason: "Disposable/role-based — should not email" };
    default:
      return { send: true, reason: "Unknown status" };
  }
}
