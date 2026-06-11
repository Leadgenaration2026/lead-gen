/**
 * Email Validation Utilities
 * Validates recipient email addresses before sending campaigns.
 * Checks: format, MX records, disposable domains.
 */
import dns from "dns";
import { promisify } from "util";

const resolveMx = promisify(dns.resolveMx);

// Common disposable email domains that should be flagged
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "tempmail.com", "throwaway.email",
  "yopmail.com", "sharklasers.com", "guerrillamailblock.com", "grr.la",
  "dispostable.com", "trashmail.com", "10minutemail.com", "tempail.com",
  "fakeinbox.com", "mailnesia.com", "maildrop.cc", "discard.email",
  "temp-mail.org", "getnada.com", "emailondeck.com",
]);

export interface EmailValidationResult {
  email: string;
  valid: boolean;
  reason?: string;
}

/**
 * Validate email format using regex.
 */
function isValidFormat(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Check if the email domain has valid MX records.
 */
async function hasMxRecords(domain: string): Promise<boolean> {
  try {
    const records = await resolveMx(domain);
    return records && records.length > 0;
  } catch {
    return false;
  }
}

/**
 * Validate a single email address.
 */
export async function validateEmail(email: string): Promise<EmailValidationResult> {
  if (!email || !email.trim()) {
    return { email, valid: false, reason: "Empty email address" };
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check format
  if (!isValidFormat(normalizedEmail)) {
    return { email: normalizedEmail, valid: false, reason: "Invalid email format" };
  }

  const domain = normalizedEmail.split("@")[1];

  // Check disposable domains
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { email: normalizedEmail, valid: false, reason: "Disposable email domain" };
  }

  // Check MX records
  const hasMx = await hasMxRecords(domain);
  if (!hasMx) {
    return { email: normalizedEmail, valid: false, reason: `No MX records for domain "${domain}" - email will bounce` };
  }

  return { email: normalizedEmail, valid: true };
}

/**
 * Validate multiple emails in batch (with concurrency limit).
 */
export async function validateEmails(
  emails: string[],
  concurrency = 10
): Promise<EmailValidationResult[]> {
  const results: EmailValidationResult[] = [];
  const domainCache = new Map<string, boolean>(); // Cache MX lookups per domain

  for (let i = 0; i < emails.length; i += concurrency) {
    const batch = emails.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (email) => {
        if (!email || !email.trim()) {
          return { email, valid: false, reason: "Empty email address" } as EmailValidationResult;
        }

        const normalizedEmail = email.trim().toLowerCase();

        if (!isValidFormat(normalizedEmail)) {
          return { email: normalizedEmail, valid: false, reason: "Invalid email format" } as EmailValidationResult;
        }

        const domain = normalizedEmail.split("@")[1];

        if (DISPOSABLE_DOMAINS.has(domain)) {
          return { email: normalizedEmail, valid: false, reason: "Disposable email domain" } as EmailValidationResult;
        }

        // Use cached MX result if available
        let hasMx = domainCache.get(domain);
        if (hasMx === undefined) {
          hasMx = await hasMxRecords(domain);
          domainCache.set(domain, hasMx);
        }

        if (!hasMx) {
          return { email: normalizedEmail, valid: false, reason: `No MX records for domain "${domain}"` } as EmailValidationResult;
        }

        return { email: normalizedEmail, valid: true } as EmailValidationResult;
      })
    );
    results.push(...batchResults);
  }

  return results;
}
