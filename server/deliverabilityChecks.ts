import dns from "dns";
import { promisify } from "util";

const resolveMx = promisify(dns.resolveMx);
const resolveTxt = promisify(dns.resolveTxt);

export interface DeliverabilityCheck {
  name: string;
  status: "pass" | "fail" | "warning";
  message: string;
  category: "infrastructure" | "content" | "personalization" | "compliance";
}

export interface DeliverabilityResult {
  allPassed: boolean;
  score: number; // 0-100 deliverability score
  checks: DeliverabilityCheck[];
}

/**
 * Run comprehensive email deliverability checks before sending.
 * Categories: Infrastructure, Content Quality, Personalization, Compliance.
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

  // ═══════════════════════════════════════════════
  // INFRASTRUCTURE CHECKS
  // ═══════════════════════════════════════════════

  // 1. Check sender email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(params.senderEmail)) {
    checks.push({ name: "Sender Email Format", status: "pass", message: "Valid email format", category: "infrastructure" });
  } else {
    checks.push({ name: "Sender Email Format", status: "fail", message: "Invalid sender email format", category: "infrastructure" });
  }

  // 2. Check sender name is set
  if (params.senderName && params.senderName.length > 1) {
    checks.push({ name: "Sender Name", status: "pass", message: `Sender name set: "${params.senderName}"`, category: "infrastructure" });
  } else {
    checks.push({ name: "Sender Name", status: "warning", message: "No sender name set — emails may look less professional", category: "infrastructure" });
  }

  // 3. Check MX records for sender domain
  try {
    const mxRecords = await resolveMx(domain);
    if (mxRecords && mxRecords.length > 0) {
      checks.push({ name: "MX Records", status: "pass", message: `Domain has ${mxRecords.length} MX record(s)`, category: "infrastructure" });
    } else {
      checks.push({ name: "MX Records", status: "fail", message: "No MX records found for sender domain", category: "infrastructure" });
    }
  } catch {
    checks.push({ name: "MX Records", status: "warning", message: "Could not verify MX records (DNS lookup failed)", category: "infrastructure" });
  }

  // 4. Check SPF record
  try {
    const txtRecords = await resolveTxt(domain);
    const spfRecord = txtRecords.flat().find((r) => r.startsWith("v=spf1"));
    if (spfRecord) {
      checks.push({ name: "SPF Record", status: "pass", message: "SPF record found for sender domain", category: "infrastructure" });
    } else {
      checks.push({ name: "SPF Record", status: "warning", message: "No SPF record found — emails may land in spam", category: "infrastructure" });
    }
  } catch {
    checks.push({ name: "SPF Record", status: "warning", message: "Could not verify SPF record (DNS lookup failed)", category: "infrastructure" });
  }

  // 5. Check DMARC record
  try {
    const dmarcRecords = await resolveTxt(`_dmarc.${domain}`);
    const dmarcRecord = dmarcRecords.flat().find((r) => r.startsWith("v=DMARC1"));
    if (dmarcRecord) {
      checks.push({ name: "DMARC Record", status: "pass", message: "DMARC record found for sender domain", category: "infrastructure" });
    } else {
      checks.push({ name: "DMARC Record", status: "warning", message: "No DMARC record found — recommended for deliverability", category: "infrastructure" });
    }
  } catch {
    checks.push({ name: "DMARC Record", status: "warning", message: "Could not verify DMARC record", category: "infrastructure" });
  }

  // 6. SMTP host validation
  if (params.smtpHost && params.smtpHost.includes(".")) {
    checks.push({ name: "SMTP Configuration", status: "pass", message: `SMTP host configured: ${params.smtpHost}`, category: "infrastructure" });
  } else {
    checks.push({ name: "SMTP Configuration", status: "fail", message: "SMTP host not configured", category: "infrastructure" });
  }

  // ═══════════════════════════════════════════════
  // CONTENT QUALITY CHECKS
  // ═══════════════════════════════════════════════

  // 7. Subject line quality
  const spamSubjectTriggers = [
    "FREE", "ACT NOW", "URGENT", "CLICK HERE", "BUY NOW", "WINNER", "CONGRATULATIONS",
    "!!!", "???", "GUARANTEED", "NO COST", "RISK FREE", "DOUBLE YOUR", "EARN MONEY",
    "MAKE MONEY", "CASH BONUS", "MILLION DOLLARS", "ORDER NOW", "SPECIAL PROMOTION",
    "LIMITED TIME", "EXCLUSIVE DEAL", "DON'T DELETE", "NOT SPAM", "OPEN IMMEDIATELY"
  ];
  const subjectUpper = params.subject.toUpperCase();
  const matchedSubjectSpam = spamSubjectTriggers.filter((trigger) => subjectUpper.includes(trigger));
  const allCaps = params.subject === params.subject.toUpperCase() && params.subject.length > 5;

  if (matchedSubjectSpam.length === 0 && !allCaps && params.subject.length >= 5 && params.subject.length <= 60) {
    checks.push({ name: "Subject Line Quality", status: "pass", message: "Subject line looks professional and non-spammy", category: "content" });
  } else if (allCaps) {
    checks.push({ name: "Subject Line Quality", status: "warning", message: "Subject is ALL CAPS — this triggers spam filters", category: "content" });
  } else if (matchedSubjectSpam.length > 0) {
    checks.push({ name: "Subject Line Quality", status: "warning", message: `Subject contains spam triggers: ${matchedSubjectSpam.slice(0, 3).join(", ")}`, category: "content" });
  } else if (params.subject.length > 60) {
    checks.push({ name: "Subject Line Quality", status: "warning", message: `Subject too long (${params.subject.length} chars) — may get truncated in inbox`, category: "content" });
  } else {
    checks.push({ name: "Subject Line Quality", status: "warning", message: "Subject line may be too short", category: "content" });
  }

  // 8. Body spam content check
  const bodyLower = params.body.toLowerCase();
  const spamBodyTriggers = [
    "click here now", "act immediately", "limited time only", "100% free", "no obligation",
    "once in a lifetime", "you have been selected", "this is not spam", "dear friend",
    "congratulations you won", "claim your prize", "double your income", "earn extra cash",
    "fast cash", "get rich quick", "incredible deal", "lowest price", "no catch",
    "no strings attached", "offer expires", "risk-free", "satisfaction guaranteed",
    "while supplies last", "you're a winner"
  ];
  const matchedBodySpam = spamBodyTriggers.filter((t) => bodyLower.includes(t));
  if (matchedBodySpam.length === 0) {
    checks.push({ name: "Spam Word Detection", status: "pass", message: "No spam-trigger phrases detected in email body", category: "content" });
  } else {
    checks.push({ name: "Spam Word Detection", status: "warning", message: `Body contains ${matchedBodySpam.length} spam phrase(s): "${matchedBodySpam[0]}"${matchedBodySpam.length > 1 ? ` +${matchedBodySpam.length - 1} more` : ""}`, category: "content" });
  }

  // 9. Email length check
  const wordCount = params.body.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 50 && wordCount <= 300) {
    checks.push({ name: "Email Length", status: "pass", message: `Good length (${wordCount} words) — optimal for engagement`, category: "content" });
  } else if (wordCount < 50) {
    checks.push({ name: "Email Length", status: "warning", message: `Email is very short (${wordCount} words) — may seem impersonal`, category: "content" });
  } else {
    checks.push({ name: "Email Length", status: "warning", message: `Email is long (${wordCount} words) — consider shortening for better engagement`, category: "content" });
  }

  // 10. Excessive capitalization in body
  const capsWords = params.body.split(/\s+/).filter(w => w.length > 3 && w === w.toUpperCase());
  const capsRatio = capsWords.length / Math.max(wordCount, 1);
  if (capsRatio < 0.1) {
    checks.push({ name: "Capitalization", status: "pass", message: "Normal capitalization — looks professional", category: "content" });
  } else {
    checks.push({ name: "Capitalization", status: "warning", message: `${Math.round(capsRatio * 100)}% of words are ALL CAPS — reduce for better deliverability`, category: "content" });
  }

  // 11. Excessive punctuation
  const exclamationCount = (params.body.match(/!/g) || []).length;
  const questionCount = (params.body.match(/\?/g) || []).length;
  if (exclamationCount <= 2 && questionCount <= 3) {
    checks.push({ name: "Punctuation", status: "pass", message: "Appropriate punctuation usage", category: "content" });
  } else if (exclamationCount > 5) {
    checks.push({ name: "Punctuation", status: "warning", message: `Too many exclamation marks (${exclamationCount}) — triggers spam filters`, category: "content" });
  } else {
    checks.push({ name: "Punctuation", status: "pass", message: "Punctuation within acceptable range", category: "content" });
  }

  // 12. Link safety check
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  const links = params.body.match(urlRegex) || [];
  const suspiciousDomains = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly"];
  const hasShortenedLinks = links.some(link => suspiciousDomains.some(d => link.includes(d)));
  const hasTooManyLinks = links.length > 3;

  if (links.length === 0) {
    checks.push({ name: "Link Safety", status: "pass", message: "No links in email — clean text email", category: "content" });
  } else if (hasShortenedLinks) {
    checks.push({ name: "Link Safety", status: "warning", message: "Contains URL shorteners — use full URLs for better deliverability", category: "content" });
  } else if (hasTooManyLinks) {
    checks.push({ name: "Link Safety", status: "warning", message: `Too many links (${links.length}) — may trigger spam filters`, category: "content" });
  } else {
    checks.push({ name: "Link Safety", status: "pass", message: `${links.length} link(s) found — all using full URLs`, category: "content" });
  }

  // ═══════════════════════════════════════════════
  // PERSONALIZATION CHECKS
  // ═══════════════════════════════════════════════

  // 13. First name personalization
  const hasGreeting = /\b(hi|hello|hey|dear)\s+[A-Z][a-z]+/i.test(params.body);
  const hasNameVariable = params.body.includes("{{") && params.body.includes("}}");
  if (hasGreeting || hasNameVariable) {
    checks.push({ name: "Name Personalization", status: "pass", message: "Email addresses recipient by name — good personalization", category: "personalization" });
  } else {
    checks.push({ name: "Name Personalization", status: "warning", message: "No personal greeting detected — add recipient's name for better engagement", category: "personalization" });
  }

  // 14. Company/industry mention
  const hasCompanyRef = /\b(your company|your team|your business|your organization)\b/i.test(params.body) ||
    /\b(at [A-Z][a-zA-Z]+|with [A-Z][a-zA-Z]+)\b/.test(params.body);
  if (hasCompanyRef) {
    checks.push({ name: "Company Reference", status: "pass", message: "Email references recipient's company — shows research effort", category: "personalization" });
  } else {
    checks.push({ name: "Company Reference", status: "warning", message: "No company/business reference found — personalize for better response rates", category: "personalization" });
  }

  // 15. Call-to-action clarity
  const ctaPatterns = [
    /book a (call|meeting|demo|appointment)/i,
    /schedule a (call|meeting|demo|chat)/i,
    /let's (connect|chat|talk|discuss)/i,
    /calendly|cal\.com|hubspot/i,
    /reply to this email/i,
    /click (here|below|the link)/i,
    /sign up|register|get started/i,
  ];
  const hasCTA = ctaPatterns.some(p => p.test(params.body));
  if (hasCTA) {
    checks.push({ name: "Call-to-Action", status: "pass", message: "Clear call-to-action detected — guides recipient to next step", category: "personalization" });
  } else {
    checks.push({ name: "Call-to-Action", status: "warning", message: "No clear CTA found — add a specific next step for the recipient", category: "personalization" });
  }

  // 16. Signature/sign-off check
  const signOffPatterns = [
    /\b(best regards|kind regards|regards|sincerely|cheers|thanks|thank you|best)\b/i,
    /\b(warm regards|looking forward|talk soon)\b/i,
  ];
  const hasSignOff = signOffPatterns.some(p => p.test(params.body));
  if (hasSignOff) {
    checks.push({ name: "Professional Sign-off", status: "pass", message: "Professional closing detected — looks human and polished", category: "personalization" });
  } else {
    checks.push({ name: "Professional Sign-off", status: "warning", message: "No professional sign-off — add a closing (e.g., 'Best regards') for credibility", category: "personalization" });
  }

  // ═══════════════════════════════════════════════
  // COMPLIANCE CHECKS
  // ═══════════════════════════════════════════════

  // 17. Unsubscribe link (CAN-SPAM compliance)
  const hasUnsubscribe = bodyLower.includes("unsubscribe") || bodyLower.includes("opt out") || bodyLower.includes("opt-out");
  if (hasUnsubscribe) {
    checks.push({ name: "Unsubscribe Link", status: "pass", message: "Unsubscribe/opt-out option detected — CAN-SPAM compliant", category: "compliance" });
  } else {
    checks.push({ name: "Unsubscribe Link", status: "warning", message: "No unsubscribe link — required by CAN-SPAM for commercial emails", category: "compliance" });
  }

  // 18. Physical address (CAN-SPAM)
  const hasAddress = /\d+\s+\w+\s+(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|way|ct|court)/i.test(params.body) ||
    /\b(suite|floor|building)\s+\d+/i.test(params.body) ||
    /\b\d{5}(-\d{4})?\b/.test(params.body); // ZIP code
  if (hasAddress) {
    checks.push({ name: "Physical Address", status: "pass", message: "Physical address detected — CAN-SPAM compliant", category: "compliance" });
  } else {
    checks.push({ name: "Physical Address", status: "warning", message: "No physical address — recommended for CAN-SPAM compliance in bulk emails", category: "compliance" });
  }

  // 19. Reply-to capability
  const noReplyPatterns = ["noreply@", "no-reply@", "donotreply@", "do-not-reply@"];
  const isNoReply = noReplyPatterns.some(p => params.senderEmail.toLowerCase().includes(p));
  if (!isNoReply) {
    checks.push({ name: "Reply-To Address", status: "pass", message: "Sender allows replies — builds trust and engagement", category: "compliance" });
  } else {
    checks.push({ name: "Reply-To Address", status: "warning", message: "Using no-reply address — reduces trust and engagement", category: "compliance" });
  }

  // Calculate score
  const passCount = checks.filter(c => c.status === "pass").length;
  const warningCount = checks.filter(c => c.status === "warning").length;
  const failCount = checks.filter(c => c.status === "fail").length;
  const total = checks.length;
  const score = Math.round(((passCount * 1 + warningCount * 0.5) / total) * 100);

  const allPassed = checks.every((c) => c.status !== "fail");
  return { allPassed, score, checks };
}
