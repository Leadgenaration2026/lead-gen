/**
 * Reply Detection & Classification Module
 * 
 * Monitors incoming replies to the configured reply-to email (from user settings),
 * classifies them (genuine vs spam/newsletter/auto-reply),
 * and stops follow-ups when a genuine reply is detected.
 * Sends notifications to the configured notification email address.
 */

import { eq, and, or, inArray } from "drizzle-orm";
import { emailReplies, campaignLeads, followUpEmails, followUpCalls, leads } from "../drizzle/schema";
import * as db from "./db";
import { notifyOwner } from "./_core/notification";

// ============================================================
// CLASSIFICATION TYPES
// ============================================================

export type ReplyClassification = "genuine" | "auto_reply" | "newsletter" | "spam" | "bounce" | "unsubscribe" | "unknown";

export interface ClassificationResult {
  classification: ReplyClassification;
  reason: string;
  confidence: number; // 0-100
}

// ============================================================
// AUTO-REPLY DETECTION PATTERNS
// ============================================================

const AUTO_REPLY_SUBJECTS = [
  /out of (the )?office/i,
  /automatic reply/i,
  /auto[- ]?reply/i,
  /auto[- ]?response/i,
  /away from (the )?office/i,
  /on vacation/i,
  /on leave/i,
  /currently unavailable/i,
  /i('m| am) (currently )?out/i,
  /will (be )?back/i,
  /limited access to email/i,
  /delayed response/i,
  /thank you for (your )?(email|message|reaching out)/i,
  /acknowledgement/i,
  /received your (email|message)/i,
  /we have received/i,
  /ticket.*(created|opened|received)/i,
  /case.*(created|opened|number)/i,
];

const AUTO_REPLY_HEADERS = [
  "x-auto-response-suppress",
  "x-autoreply",
  "x-autorespond",
  "auto-submitted",
  "x-ms-exchange-generated-message-source",
];

const AUTO_REPLY_BODY_PATTERNS = [
  /i (am|'m) (currently )?(out of|away from) (the )?office/i,
  /i will (be )?(back|return)/i,
  /limited access to email/i,
  /this is an auto(matic|mated)? (reply|response|message)/i,
  /do not reply to this (email|message)/i,
  /this (email|mailbox) is not monitored/i,
  /if (this is )?urgent.*please (call|contact)/i,
  /i('m| am) on (annual |sick )?leave/i,
];

// ============================================================
// NEWSLETTER DETECTION PATTERNS
// ============================================================

const NEWSLETTER_SUBJECTS = [
  /newsletter/i,
  /weekly (digest|update|roundup|recap)/i,
  /monthly (digest|update|roundup|recap)/i,
  /daily (digest|update|roundup|brief)/i,
  /\[.*digest\]/i,
  /issue #?\d+/i,
  /edition #?\d+/i,
  /vol(ume)?\.?\s*\d+/i,
];

const NEWSLETTER_SENDERS = [
  /noreply@/i,
  /no-reply@/i,
  /donotreply@/i,
  /newsletter@/i,
  /news@/i,
  /updates@/i,
  /notifications?@/i,
  /digest@/i,
  /marketing@/i,
  /info@.*\.com$/i,
  /mailer-daemon@/i,
  /postmaster@/i,
];

const NEWSLETTER_BODY_PATTERNS = [
  /unsubscribe from (this|these|all)/i,
  /manage (your )?subscription/i,
  /email preferences/i,
  /you (are )?receiving this (because|email)/i,
  /you('re| are) subscribed to/i,
  /view (this )?(email )?in (your )?browser/i,
  /having trouble viewing/i,
  /©\s*\d{4}/i,
  /all rights reserved/i,
];

// ============================================================
// SPAM DETECTION PATTERNS
// ============================================================

const SPAM_PATTERNS = [
  /\bcongratulations?\b.*\bwon\b/i,
  /\bclaim (your )?prize/i,
  /\bfree (gift|money|offer)/i,
  /\bact now\b/i,
  /\blimited time (only|offer)/i,
  /\b(buy|purchase) now\b.*\bdiscount/i,
  /\bunsubscribe\b.*\bclick here\b/i,
  /\bcasino\b|\bpoker\b|\bgambling\b/i,
  /\bviagra\b|\bcialis\b/i,
  /\binheritance\b.*\b(million|billion)/i,
  /\bnigerian?\b.*\b(prince|minister)/i,
  /\bcryptocurrency\b.*\b(invest|profit|guaranteed)/i,
  /\bbitcoin\b.*\b(double|triple|guaranteed)/i,
];

// ============================================================
// BOUNCE DETECTION PATTERNS
// ============================================================

const BOUNCE_SUBJECTS = [
  /delivery (status )?notification/i,
  /undeliverable/i,
  /undelivered mail/i,
  /mail delivery (failed|failure)/i,
  /returned mail/i,
  /failure notice/i,
  /message not delivered/i,
  /could not (be )?deliver/i,
  /permanent failure/i,
  /mailbox (not found|unavailable|full)/i,
  /user unknown/i,
  /address rejected/i,
];

const BOUNCE_SENDERS = [
  /mailer-daemon@/i,
  /postmaster@/i,
  /mail-daemon@/i,
  /bounce.*@/i,
];

// ============================================================
// UNSUBSCRIBE DETECTION PATTERNS
// ============================================================

const UNSUBSCRIBE_PATTERNS = [
  /\bunsubscribe\b/i,
  /\bremove (me|my email)\b/i,
  /\bstop (sending|emailing)\b/i,
  /\bopt[- ]?out\b/i,
  /\bdo not (contact|email|send)\b/i,
  /\btake me off\b/i,
  /\bno longer (wish|want) to receive/i,
  /\bplease remove\b/i,
];

// ============================================================
// CLASSIFICATION ENGINE
// ============================================================

export function classifyReply(params: {
  fromEmail: string;
  subject: string;
  body: string;
  headers?: Record<string, string>;
}): ClassificationResult {
  const { fromEmail, subject, body, headers = {} } = params;
  const bodyLower = body.toLowerCase();
  const subjectLower = subject.toLowerCase();

  // 1. Check for BOUNCE first (highest priority)
  if (matchesAny(subject, BOUNCE_SUBJECTS) || matchesAny(fromEmail, BOUNCE_SENDERS)) {
    return { classification: "bounce", reason: "Delivery failure notification detected", confidence: 95 };
  }

  // 2. Check for AUTO-REPLY via headers (very reliable)
  const autoReplyHeader = AUTO_REPLY_HEADERS.find(h => headers[h] || headers[h.toLowerCase()]);
  if (autoReplyHeader) {
    return { classification: "auto_reply", reason: `Auto-reply header detected: ${autoReplyHeader}`, confidence: 98 };
  }
  if (headers["auto-submitted"] && headers["auto-submitted"] !== "no") {
    return { classification: "auto_reply", reason: "Auto-Submitted header indicates automated message", confidence: 98 };
  }
  if (headers["precedence"] && ["bulk", "junk", "list"].includes(headers["precedence"].toLowerCase())) {
    const prec = headers["precedence"].toLowerCase();
    if (prec === "bulk" || prec === "list") {
      return { classification: "newsletter", reason: `Precedence header: ${prec}`, confidence: 90 };
    }
    if (prec === "junk") {
      return { classification: "spam", reason: "Precedence: junk header detected", confidence: 85 };
    }
  }

  // 3. Check for AUTO-REPLY via subject patterns
  if (matchesAny(subject, AUTO_REPLY_SUBJECTS)) {
    return { classification: "auto_reply", reason: "Subject line matches auto-reply pattern", confidence: 90 };
  }

  // 4. Check for AUTO-REPLY via body patterns
  if (matchesAny(body, AUTO_REPLY_BODY_PATTERNS)) {
    return { classification: "auto_reply", reason: "Body content matches auto-reply pattern", confidence: 85 };
  }

  // 5. Check for NEWSLETTER
  if (matchesAny(fromEmail, NEWSLETTER_SENDERS)) {
    // But only if the body also looks like a newsletter
    if (matchesAny(body, NEWSLETTER_BODY_PATTERNS) || matchesAny(subject, NEWSLETTER_SUBJECTS)) {
      return { classification: "newsletter", reason: "Sender and content match newsletter pattern", confidence: 90 };
    }
  }
  if (matchesAny(subject, NEWSLETTER_SUBJECTS) && matchesAny(body, NEWSLETTER_BODY_PATTERNS)) {
    return { classification: "newsletter", reason: "Subject and body match newsletter pattern", confidence: 88 };
  }
  if (headers["list-unsubscribe"] || headers["list-id"]) {
    return { classification: "newsletter", reason: "List-Unsubscribe or List-ID header present", confidence: 92 };
  }

  // 6. Check for SPAM
  const spamMatches = SPAM_PATTERNS.filter(p => p.test(body) || p.test(subject));
  if (spamMatches.length >= 2) {
    return { classification: "spam", reason: `Multiple spam indicators detected (${spamMatches.length} patterns)`, confidence: 85 };
  }

  // 7. Check for UNSUBSCRIBE request
  if (matchesAny(body, UNSUBSCRIBE_PATTERNS) && body.length < 200) {
    // Short message with unsubscribe intent = likely a genuine unsubscribe request
    return { classification: "unsubscribe", reason: "Short message with unsubscribe intent", confidence: 88 };
  }

  // 8. If none of the above matched, it's likely a GENUINE reply
  // Additional confidence boosters for genuine replies:
  let genuineConfidence = 70;
  const genuineReasons: string[] = [];

  // Has In-Reply-To header matching our message ID
  if (params.headers?.["in-reply-to"] || params.headers?.["references"]) {
    genuineConfidence += 15;
    genuineReasons.push("Has In-Reply-To/References header");
  }

  // Body is reasonably short (personal replies tend to be shorter)
  if (body.length > 20 && body.length < 2000) {
    genuineConfidence += 5;
    genuineReasons.push("Reply length is typical for personal response");
  }

  // Contains question marks or specific language indicating engagement
  if (body.includes("?") || /\b(interested|let's|schedule|call|meet|discuss|sounds good|great|thanks|thank you)\b/i.test(body)) {
    genuineConfidence += 10;
    genuineReasons.push("Contains engagement language");
  }

  return {
    classification: "genuine",
    reason: genuineReasons.length > 0 ? genuineReasons.join("; ") : "No spam/auto-reply/newsletter patterns detected",
    confidence: Math.min(genuineConfidence, 99),
  };
}

// ============================================================
// FOLLOW-UP CANCELLATION
// ============================================================

export async function stopFollowUpsForLead(params: {
  leadId: number;
  campaignId?: number;
  campaignLeadId?: number;
  userId: number;
  /** What to record the stoppage as on campaignLeads. Defaults to "replied". */
  reason?: "replied" | "unsubscribed";
}): Promise<{ emailsCancelled: number; callsCancelled: number }> {
  const database = await db.getDb();
  let emailsCancelled = 0;
  let callsCancelled = 0;

  if (!database) return { emailsCancelled, callsCancelled };

  // Find all campaign leads for this lead
  let campaignLeadIds: number[] = [];
  
  if (params.campaignLeadId) {
    campaignLeadIds = [params.campaignLeadId];
  } else {
    const cls = await database
      .select({ id: campaignLeads.id })
      .from(campaignLeads)
      .where(
        params.campaignId
          ? and(eq(campaignLeads.leadId, params.leadId), eq(campaignLeads.campaignId, params.campaignId))
          : eq(campaignLeads.leadId, params.leadId)
      );
    campaignLeadIds = cls.map(cl => cl.id);
  }

  if (campaignLeadIds.length === 0) return { emailsCancelled, callsCancelled };

  // Cancel all pending/scheduled follow-up emails
  const emailResult = await database
    .update(followUpEmails)
    .set({ status: "failed" as any }) // Using "failed" to indicate cancelled
    .where(
      and(
        inArray(followUpEmails.campaignLeadId, campaignLeadIds),
        or(
          eq(followUpEmails.status, "draft" as any),
          eq(followUpEmails.status, "scheduled" as any)
        )
      )
    );
  emailsCancelled = (emailResult as any)[0]?.affectedRows || 0;

  // Cancel all pending/scheduled follow-up calls
  const callResult = await database
    .update(followUpCalls)
    .set({ status: "failed" as any })
    .where(
      and(
        inArray(followUpCalls.campaignLeadId, campaignLeadIds),
        or(
          eq(followUpCalls.status, "scheduled" as any),
          eq(followUpCalls.status, "initiated" as any)
        )
      )
    );
  callsCancelled = (callResult as any)[0]?.affectedRows || 0;

  // Update campaign lead status. An unsubscribe request must be recorded as
  // unsubscribed (not "replied") so the lead is correctly suppressed if
  // they're ever added to a future campaign.
  if (params.reason === "unsubscribed") {
    await database
      .update(campaignLeads)
      .set({ unsubscribed: 1 as any, unsubscribedAt: new Date().toISOString() })
      .where(inArray(campaignLeads.id, campaignLeadIds));
  } else {
    await database
      .update(campaignLeads)
      .set({ replied: 1 as any, repliedAt: new Date().toISOString() })
      .where(inArray(campaignLeads.id, campaignLeadIds));
  }

  return { emailsCancelled, callsCancelled };
}

// ============================================================
// PROCESS INCOMING REPLY
// ============================================================

export async function processIncomingReply(params: {
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  headers?: Record<string, string>;
  inReplyToMessageId?: string;
  replyMessageId?: string;
  userId: number;
}): Promise<{
  id: number;
  classification: ReplyClassification;
  reason: string;
  confidence: number;
  followUpsStopped: boolean;
  emailsCancelled: number;
  callsCancelled: number;
  leadId?: number;
  campaignId?: number;
}> {
  const database = await db.getDb();
  if (!database) throw new Error("Database not available");

  // 1. Classify the reply
  const classResult = classifyReply({
    fromEmail: params.fromEmail,
    subject: params.subject,
    body: params.body,
    headers: params.headers,
  });

  // 2. Try to match to a campaign lead by message ID or sender email
  let leadId: number | null = null;
  let campaignLeadId: number | null = null;
  let campaignId: number | null = null;

  // First try: match by In-Reply-To message ID
  if (params.inReplyToMessageId) {
    const matchedCL = await database
      .select()
      .from(campaignLeads)
      .where(eq(campaignLeads.messageId, params.inReplyToMessageId))
      .limit(1);
    
    if (matchedCL.length > 0) {
      campaignLeadId = matchedCL[0].id;
      leadId = matchedCL[0].leadId;
      campaignId = matchedCL[0].campaignId;
    }
  }

  // Second try: match by sender email address against leads
  if (!leadId) {
    const matchedLeads = await database
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.email, params.fromEmail),
          eq(leads.userId, params.userId)
        )
      )
      .limit(1);
    
    if (matchedLeads.length > 0) {
      leadId = matchedLeads[0].id;
      
      // Find the most recent campaign lead for this lead
      const recentCL = await database
        .select()
        .from(campaignLeads)
        .where(eq(campaignLeads.leadId, leadId))
        .orderBy(campaignLeads.id)
        .limit(1);
      
      if (recentCL.length > 0) {
        campaignLeadId = recentCL[0].id;
        campaignId = recentCL[0].campaignId;
      }
    }
  }

  // 3. Store the reply in the database
  const [inserted] = await database.insert(emailReplies).values({
    userId: params.userId,
    leadId,
    campaignLeadId,
    campaignId,
    fromEmail: params.fromEmail,
    toEmail: params.toEmail,
    subject: params.subject || "",
    bodySnippet: params.body.substring(0, 500),
    inReplyToMessageId: params.inReplyToMessageId || null,
    replyMessageId: params.replyMessageId || null,
    classification: classResult.classification,
    classificationReason: classResult.reason,
    confidence: classResult.confidence,
    followUpsStopped: false,
    rawHeaders: params.headers || null,
  });

  const replyId = (inserted as any).insertId;

  // 4. If genuine reply, stop all follow-ups for this lead
  let followUpsStopped = false;
  let emailsCancelled = 0;
  let callsCancelled = 0;

  if (classResult.classification === "genuine" && leadId) {
    const stopResult = await stopFollowUpsForLead({
      leadId,
      campaignId: campaignId || undefined,
      campaignLeadId: campaignLeadId || undefined,
      userId: params.userId,
    });

    emailsCancelled = stopResult.emailsCancelled;
    callsCancelled = stopResult.callsCancelled;
    followUpsStopped = true;

    // Update the reply record
    await database
      .update(emailReplies)
      .set({ followUpsStopped: 1 as any, stoppedAt: new Date().toISOString() })
      .where(eq(emailReplies.id, replyId));

    // Update lead status to "contacted" or "qualified"
    if (leadId) {
      await database
        .update(leads)
        .set({ status: "qualified" })
        .where(eq(leads.id, leadId));
    }

    // Send instant notification to owner (uses notificationEmail from settings if configured)
    try {
      // Try to get lead's actual name from DB
      let leadDisplayName = params.fromEmail;
      if (leadId) {
        const leadRecord = await database.select().from(leads).where(eq(leads.id, leadId)).limit(1);
        if (leadRecord.length > 0 && leadRecord[0].ownerName) {
          leadDisplayName = `${leadRecord[0].ownerName} (${leadRecord[0].companyName || params.fromEmail})`;
        }
      }
      const snippet = params.body.substring(0, 200).replace(/\n/g, " ");
      
      // Fetch user settings for notification email
      const userSettings = await db.getUserSettings(params.userId);
      const notificationTarget = userSettings?.notificationEmail || "project owner";
      
      await notifyOwner({
        title: `\u2709\uFE0F Positive Reply from ${leadDisplayName}`,
        content: `Lead: ${leadDisplayName}\nEmail: ${params.fromEmail}\nSubject: ${params.subject || "(no subject)"}\nNotification target: ${notificationTarget}\n\nReply snippet:\n${snippet}${params.body.length > 200 ? "..." : ""}\n\nAll follow-ups have been automatically stopped. ${emailsCancelled} emails and ${callsCancelled} calls cancelled.`,
      });
    } catch (notifErr) {
      // Notification failure should not break reply processing
      console.error("[ReplyDetection] Failed to send owner notification:", notifErr);
    }
  }

  // 5. If unsubscribe request, also stop follow-ups
  if (classResult.classification === "unsubscribe" && leadId) {
    const stopResult = await stopFollowUpsForLead({
      leadId,
      userId: params.userId,
      reason: "unsubscribed",
    });

    emailsCancelled = stopResult.emailsCancelled;
    callsCancelled = stopResult.callsCancelled;
    followUpsStopped = true;

    await database
      .update(emailReplies)
      .set({ followUpsStopped: 1 as any, stoppedAt: new Date().toISOString() })
      .where(eq(emailReplies.id, replyId));

    // Mark lead as rejected
    if (leadId) {
      await database
        .update(leads)
        .set({ status: "rejected" })
        .where(eq(leads.id, leadId));
    }
  }

  return {
    id: replyId,
    classification: classResult.classification,
    reason: classResult.reason,
    confidence: classResult.confidence,
    followUpsStopped,
    emailsCancelled,
    callsCancelled,
    leadId: leadId || undefined,
    campaignId: campaignId || undefined,
  };
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(text));
}
