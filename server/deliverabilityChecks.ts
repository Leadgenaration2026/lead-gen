import dns from "dns";
import { promisify } from "util";

const resolveMx = promisify(dns.resolveMx);
const resolveTxt = promisify(dns.resolveTxt);

export interface DeliverabilityCheck {
  name: string;
  status: "pass" | "fail" | "warning";
  message: string;
}

export interface DeliverabilityResult {
  allPassed: boolean;
  checks: DeliverabilityCheck[];
}

/**
 * Run email deliverability checks before sending.
 * Checks: SPF record, DKIM hint, DMARC, MX records, sender format, content quality.
 */
export async function runDeliverabilityChecks(params: {
  senderEmail: string;
  senderName: string;
  subject: string;
  body: string;
  smtpHost: string;
}): Promise<DeliverabilityResult> {
  const checks: DeliverabilityCheck[] = [];
  const domain = params.senderEmail.split("@")[1];

  // 1. Check sender email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(params.senderEmail)) {
    checks.push({ name: "Sender Email Format", status: "pass", message: "Valid email format" });
  } else {
    checks.push({ name: "Sender Email Format", status: "fail", message: "Invalid sender email format" });
  }

  // 2. Check sender name is set
  if (params.senderName && params.senderName.length > 1) {
    checks.push({ name: "Sender Name", status: "pass", message: `Sender name set: "${params.senderName}"` });
  } else {
    checks.push({ name: "Sender Name", status: "warning", message: "No sender name set — emails may look less professional" });
  }

  // 3. Check MX records for sender domain
  try {
    const mxRecords = await resolveMx(domain);
    if (mxRecords && mxRecords.length > 0) {
      checks.push({ name: "MX Records", status: "pass", message: `Domain has ${mxRecords.length} MX record(s)` });
    } else {
      checks.push({ name: "MX Records", status: "fail", message: "No MX records found for sender domain" });
    }
  } catch {
    checks.push({ name: "MX Records", status: "warning", message: "Could not verify MX records (DNS lookup failed)" });
  }

  // 4. Check SPF record
  try {
    const txtRecords = await resolveTxt(domain);
    const spfRecord = txtRecords.flat().find((r) => r.startsWith("v=spf1"));
    if (spfRecord) {
      checks.push({ name: "SPF Record", status: "pass", message: "SPF record found for sender domain" });
    } else {
      checks.push({ name: "SPF Record", status: "warning", message: "No SPF record found — emails may land in spam" });
    }
  } catch {
    checks.push({ name: "SPF Record", status: "warning", message: "Could not verify SPF record (DNS lookup failed)" });
  }

  // 5. Check DMARC record
  try {
    const dmarcRecords = await resolveTxt(`_dmarc.${domain}`);
    const dmarcRecord = dmarcRecords.flat().find((r) => r.startsWith("v=DMARC1"));
    if (dmarcRecord) {
      checks.push({ name: "DMARC Record", status: "pass", message: "DMARC record found for sender domain" });
    } else {
      checks.push({ name: "DMARC Record", status: "warning", message: "No DMARC record found — recommended for deliverability" });
    }
  } catch {
    checks.push({ name: "DMARC Record", status: "warning", message: "Could not verify DMARC record" });
  }

  // 6. Subject line quality
  const spamTriggers = ["FREE", "ACT NOW", "URGENT", "CLICK HERE", "BUY NOW", "WINNER", "CONGRATULATIONS", "!!!"];
  const subjectUpper = params.subject.toUpperCase();
  const hasSpamTriggers = spamTriggers.some((trigger) => subjectUpper.includes(trigger));
  if (!hasSpamTriggers && params.subject.length >= 5 && params.subject.length <= 80) {
    checks.push({ name: "Subject Line Quality", status: "pass", message: "Subject line looks professional and non-spammy" });
  } else if (hasSpamTriggers) {
    checks.push({ name: "Subject Line Quality", status: "warning", message: "Subject contains spam-trigger words — may reduce deliverability" });
  } else {
    checks.push({ name: "Subject Line Quality", status: "warning", message: "Subject line may be too short or too long" });
  }

  // 7. Body content quality
  const bodyLower = params.body.toLowerCase();
  const spamBodyTriggers = ["click here now", "act immediately", "limited time only", "100% free", "no obligation"];
  const hasBodySpam = spamBodyTriggers.some((t) => bodyLower.includes(t));
  const hasUnsubscribe = bodyLower.includes("unsubscribe");
  
  if (!hasBodySpam && hasUnsubscribe) {
    checks.push({ name: "Email Content Quality", status: "pass", message: "Content is professional with unsubscribe link" });
  } else if (hasBodySpam) {
    checks.push({ name: "Email Content Quality", status: "warning", message: "Body contains spam-trigger phrases — consider rewording" });
  } else if (!hasUnsubscribe) {
    checks.push({ name: "Email Content Quality", status: "warning", message: "No unsubscribe link detected — required by CAN-SPAM" });
  }

  // 8. SMTP host validation
  if (params.smtpHost && params.smtpHost.includes(".")) {
    checks.push({ name: "SMTP Configuration", status: "pass", message: `SMTP host configured: ${params.smtpHost}` });
  } else {
    checks.push({ name: "SMTP Configuration", status: "fail", message: "SMTP host not configured" });
  }

  const allPassed = checks.every((c) => c.status !== "fail");
  return { allPassed, checks };
}
