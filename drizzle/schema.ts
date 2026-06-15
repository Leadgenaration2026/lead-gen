import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, json } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Leads table - stores generated leads
export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  ownerName: varchar("ownerName", { length: 255 }).notNull(),
  jobTitle: varchar("jobTitle", { length: 255 }),
  email: varchar("email", { length: 320 }).notNull(),
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(),
  secondaryPhone: varchar("secondaryPhone", { length: 20 }),
  website: varchar("website", { length: 255 }),
  industry: varchar("industry", { length: 100 }),
  customData: json("customData"), // For storing additional lead attributes
  status: mysqlEnum("status", ["new", "contacted", "qualified", "converted", "rejected"]).default("new").notNull(),
  tag: mysqlEnum("tag", ["hot", "warm", "cold", "follow_up", "none"]).default("none").notNull(),
  leadSetId: int("leadSetId"),
  timezone: varchar("timezone", { length: 50 }).default("America/New_York"),
  linkedinUrl: varchar("linkedinUrl", { length: 500 }),
  instagramUrl: varchar("instagramUrl", { length: 500 }),
  facebookUrl: varchar("facebookUrl", { length: 500 }),
  country: varchar("country", { length: 100 }),
  engagementScore: int("engagementScore").default(0), // 0-100 score based on social media activity
  engagementData: json("engagementData"), // Stores raw engagement metrics (followers, posts, etc.)
  socialMediaScore: mysqlEnum("socialMediaScore", ["high", "low", "pending"]).default("pending").notNull(),
  emailVerificationStatus: mysqlEnum("emailVerificationStatus", ["deliverable", "undeliverable", "risky", "unknown", "pending"]).default("pending").notNull(),
  emailVerificationData: json("emailVerificationData"), // Stores Bouncer verification result details
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

// Campaigns table - stores email campaigns
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  subject: varchar("subject", { length: 255 }).notNull(),
  emailTemplate: text("emailTemplate").notNull(), // HTML email template with {{variable}} placeholders
  templateId: int("templateId"), // Links to campaignTemplates.id if created from a template
  status: mysqlEnum("status", ["draft", "active", "paused", "completed"]).default("draft").notNull(),
  totalLeads: int("totalLeads").default(0).notNull(),
  sentCount: int("sentCount").default(0).notNull(),
  openCount: int("openCount").default(0).notNull(),
  clickCount: int("clickCount").default(0).notNull(),
  callCount: int("callCount").default(0).notNull(),
  dailySendLimit: int("dailySendLimit"), // Max emails to send per day (null = send all at once)
  scheduledAt: timestamp("scheduledAt"),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  dailySendCronTaskUid: varchar("dailySendCronTaskUid", { length: 65 }), // Cron for daily drip sending
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  launchedAt: timestamp("launchedAt"),
});

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

// Campaign leads junction table - tracks which leads are in which campaigns
export const campaignLeads = mysqlTable("campaignLeads", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  leadId: int("leadId").notNull(),
  emailSent: boolean("emailSent").default(false).notNull(),
  emailSentAt: timestamp("emailSentAt"),
  emailOpened: boolean("emailOpened").default(false).notNull(),
  emailOpenedAt: timestamp("emailOpenedAt"),
  emailClicked: boolean("emailClicked").default(false).notNull(),
  emailClickedAt: timestamp("emailClickedAt"),
  callTriggered: boolean("callTriggered").default(false).notNull(),
  callTriggeredAt: timestamp("callTriggeredAt"),
  retellCallId: varchar("retellCallId", { length: 255 }),
  unsubscribed: boolean("unsubscribed").default(false).notNull(),
  unsubscribedAt: timestamp("unsubscribedAt"),
  replied: boolean("replied").default(false).notNull(),
  repliedAt: timestamp("repliedAt"),
  responseStatus: varchar("responseStatus", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CampaignLead = typeof campaignLeads.$inferSelect;
export type InsertCampaignLead = typeof campaignLeads.$inferInsert;

// Email tracking events table - detailed log of all email interactions
export const emailTrackingEvents = mysqlTable("emailTrackingEvents", {
  id: int("id").autoincrement().primaryKey(),
  campaignLeadId: int("campaignLeadId").notNull(),
  eventType: mysqlEnum("eventType", ["open", "click", "bounce", "unsubscribe"]).notNull(),
  trackingToken: varchar("trackingToken", { length: 255 }).notNull().unique(),
  userAgent: text("userAgent"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  clickUrl: varchar("clickUrl", { length: 2048 }), // For click events
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EmailTrackingEvent = typeof emailTrackingEvents.$inferSelect;
export type InsertEmailTrackingEvent = typeof emailTrackingEvents.$inferInsert;

// Call logs table - tracks all Retell.AI calls
export const callLogs = mysqlTable("callLogs", {
  id: int("id").autoincrement().primaryKey(),
  campaignLeadId: int("campaignLeadId").notNull(),
  retellCallId: varchar("retellCallId", { length: 255 }).notNull().unique(),
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(),
  status: mysqlEnum("status", ["initiated", "ringing", "in_progress", "completed", "failed", "no_answer"]).default("initiated").notNull(),
  duration: int("duration"), // Duration in seconds
  transcript: text("transcript"),
  recordingUrl: varchar("recordingUrl", { length: 2048 }),
  callAnalysis: json("callAnalysis"), // Stores call summary, sentiment, etc.
  triggerType: mysqlEnum("triggerType", ["email_open", "email_click", "manual"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CallLog = typeof callLogs.$inferSelect;
export type InsertCallLog = typeof callLogs.$inferInsert;

// User settings table - stores API keys and configuration
export const userSettings = mysqlTable("userSettings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  retellApiKey: varchar("retellApiKey", { length: 255 }),
  retellAgentId: varchar("retellAgentId", { length: 255 }),
  senderPhoneNumber: varchar("senderPhoneNumber", { length: 20 }),
  smtpHost: varchar("smtpHost", { length: 255 }),
  smtpPort: int("smtpPort"),
  smtpUsername: varchar("smtpUsername", { length: 255 }),
  smtpPassword: varchar("smtpPassword", { length: 255 }),
  senderEmail: varchar("senderEmail", { length: 320 }),
  senderName: varchar("senderName", { length: 255 }),
  calendlyWebhookSecret: varchar("calendlyWebhookSecret", { length: 255 }), // Calendly signing key for HMAC verification
  retellWebhookSecret: varchar("retellWebhookSecret", { length: 255 }), // Retell API key used for webhook signature verification
  seamlessApiKey: varchar("seamlessApiKey", { length: 500 }), // Seamless.ai API key for lead generation
  // Social profiles for the business
  linkedinUrl: varchar("linkedinUrl", { length: 500 }),
  linkedinType: mysqlEnum("linkedinType", ["page", "personal"]).default("personal"),
  instagramUrl: varchar("instagramUrl", { length: 500 }),
  instagramType: mysqlEnum("instagramType", ["page", "personal"]).default("personal"),
  facebookUrl: varchar("facebookUrl", { length: 500 }),
  facebookType: mysqlEnum("facebookType", ["page", "personal"]).default("personal"),
  // Email verification & deliverability
  bouncerApiKey: varchar("bouncerApiKey", { length: 500 }), // Bouncer API key for email verification
  // Social outreach limits
  socialDailyLimit: int("socialDailyLimit").default(20), // Max connection requests per day across all platforms
  socialMessageCharLimit: int("socialMessageCharLimit").default(300), // Max characters for social messages
  socialNotificationEmail: varchar("socialNotificationEmail", { length: 320 }), // Email to receive notifications when social messages are due
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = typeof userSettings.$inferInsert;


// Email signatures table - stores user email signatures
export const emailSignatures = mysqlTable("emailSignatures", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  signatureHtml: text("signatureHtml").notNull(), // HTML signature
  signaturePlainText: text("signaturePlainText"), // Plain text fallback
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmailSignature = typeof emailSignatures.$inferSelect;
export type InsertEmailSignature = typeof emailSignatures.$inferInsert;

// Follow-up emails table - tracks follow-up emails sent to leads
export const followUpEmails = mysqlTable("followUpEmails", {
  id: int("id").autoincrement().primaryKey(),
  campaignLeadId: int("campaignLeadId").notNull(),
  sequenceNumber: int("sequenceNumber").notNull(), // 1st follow-up, 2nd follow-up, etc.
  emailType: mysqlEnum("emailType", ["discovery", "value_prop", "social_proof", "urgency", "custom"]).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  emailBody: text("emailBody").notNull(), // HTML email body
  ctaLink: varchar("ctaLink", { length: 2048 }), // Call-to-action link
  status: mysqlEnum("status", ["draft", "scheduled", "sent", "opened", "clicked", "failed"]).default("draft").notNull(),
  scheduledFor: timestamp("scheduledFor"),
  sentAt: timestamp("sentAt"),
  openedAt: timestamp("openedAt"),
  clickedAt: timestamp("clickedAt"),
  trackingToken: varchar("trackingToken", { length: 255 }).unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FollowUpEmail = typeof followUpEmails.$inferSelect;
export type InsertFollowUpEmail = typeof followUpEmails.$inferInsert;

// Follow-up calls table - tracks follow-up calls to leads
export const followUpCalls = mysqlTable("followUpCalls", {
  id: int("id").autoincrement().primaryKey(),
  campaignLeadId: int("campaignLeadId").notNull(),
  attemptNumber: int("attemptNumber").notNull(), // 1st call attempt, 2nd attempt, etc.
  retellCallId: varchar("retellCallId", { length: 255 }).unique(),
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(),
  status: mysqlEnum("status", ["scheduled", "initiated", "ringing", "in_progress", "completed", "failed", "no_answer", "voicemail"]).default("scheduled").notNull(),
  duration: int("duration"), // Duration in seconds
  transcript: text("transcript"),
  recordingUrl: varchar("recordingUrl", { length: 2048 }),
  callAnalysis: json("callAnalysis"), // Stores call summary, sentiment, etc.
  scheduledFor: timestamp("scheduledFor"),
  initiatedAt: timestamp("initiatedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FollowUpCall = typeof followUpCalls.$inferSelect;
export type InsertFollowUpCall = typeof followUpCalls.$inferInsert;

// Lead weak points analysis table - stores AI-identified weak points for each lead
export const leadWeakPoints = mysqlTable("leadWeakPoints", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull().unique(),
  weakPoints: json("weakPoints").notNull(), // Array of identified weak points
  analysis: text("analysis"), // Detailed analysis of the lead's weak points
  suggestedEmailTypes: json("suggestedEmailTypes"), // Suggested email types based on weak points
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LeadWeakPoints = typeof leadWeakPoints.$inferSelect;
export type InsertLeadWeakPoints = typeof leadWeakPoints.$inferInsert;

// Email templates library - pre-built professional email templates
export const emailTemplates = mysqlTable("emailTemplates", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  emailType: mysqlEnum("emailType", ["discovery", "value_prop", "social_proof", "urgency", "custom"]).notNull(),
  subjectTemplate: varchar("subjectTemplate", { length: 255 }).notNull(), // Subject with {{variables}}
  bodyTemplate: text("bodyTemplate").notNull(), // HTML body with {{variables}}
  description: text("description"),
  isDefault: boolean("isDefault").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = typeof emailTemplates.$inferInsert;

// Follow-up schedule configuration table
export const followUpSchedules = mysqlTable("followUpSchedules", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  emailFollowUpCount: int("emailFollowUpCount").default(7).notNull(), // Number of follow-up emails
  emailFollowUpIntervalDays: int("emailFollowUpIntervalDays").default(7).notNull(), // Days between follow-ups
  callFollowUpCount: int("callFollowUpCount").default(7).notNull(), // Number of follow-up calls
  callFollowUpIntervalHours: int("callFollowUpIntervalHours").default(24).notNull(), // Hours between call attempts
  enableAutoFollowUp: boolean("enableAutoFollowUp").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FollowUpSchedule = typeof followUpSchedules.$inferSelect;
export type InsertFollowUpSchedule = typeof followUpSchedules.$inferInsert;

// Scheduled emails table - stores emails to be sent at a specific time
export const scheduledEmails = mysqlTable("scheduledEmails", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  leadId: int("leadId").notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  emailBody: text("emailBody").notNull(),
  scheduledFor: timestamp("scheduledFor").notNull(),
  status: mysqlEnum("status", ["pending", "sent", "failed", "cancelled"]).default("pending").notNull(),
  sentAt: timestamp("sentAt"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ScheduledEmail = typeof scheduledEmails.$inferSelect;
export type InsertScheduledEmail = typeof scheduledEmails.$inferInsert;

// Campaign templates table - reusable campaign configurations
export const campaignTemplates = mysqlTable("campaignTemplates", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  subject: varchar("subject", { length: 255 }).notNull(),
  emailTemplate: text("emailTemplate").notNull(),
  emailType: mysqlEnum("emailType", ["discovery", "value_prop", "social_proof", "urgency", "custom"]).default("custom").notNull(),
  tags: varchar("tags", { length: 255 }), // comma-separated tags for categorization
  usageCount: int("usageCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CampaignTemplate = typeof campaignTemplates.$inferSelect;
export type InsertCampaignTemplate = typeof campaignTemplates.$inferInsert;

// Lead sets table - groups leads under named sets
export const leadSets = mysqlTable("leadSets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LeadSet = typeof leadSets.$inferSelect;
export type InsertLeadSet = typeof leadSets.$inferInsert;

// Rotational email accounts table - 5 emails used Mon-Fri
export const rotationalEmails = mysqlTable("rotationalEmails", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  smtpHost: varchar("smtpHost", { length: 255 }).notNull(),
  smtpPort: int("smtpPort").notNull().default(587),
  smtpUsername: varchar("smtpUsername", { length: 255 }).notNull(),
  smtpPassword: varchar("smtpPassword", { length: 255 }).notNull(),
  senderName: varchar("senderName", { length: 255 }),
  dayOfWeek: int("dayOfWeek").notNull(), // 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RotationalEmail = typeof rotationalEmails.$inferSelect;
export type InsertRotationalEmail = typeof rotationalEmails.$inferInsert;

// Webhook events table - logs all incoming webhook events for monitoring
export const webhookEvents = mysqlTable("webhookEvents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  webhookType: mysqlEnum("webhookType", ["calendly_booking", "email_reply", "retell_call"]).notNull(),
  status: mysqlEnum("status", ["success", "failed", "ignored"]).default("success").notNull(),
  sourceEmail: varchar("sourceEmail", { length: 320 }), // Email of the person who triggered the event
  campaignLeadId: int("campaignLeadId"), // Related campaign lead if found
  payload: json("payload"), // Raw webhook payload for debugging
  errorMessage: text("errorMessage"), // Error details if failed
  signatureVerified: mysqlEnum("signatureVerified", ["verified", "unverified", "bypassed"]).default("bypassed"), // HMAC verification status
  ipAddress: varchar("ipAddress", { length: 45 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = typeof webhookEvents.$inferInsert;

// Social outreach table - tracks connection requests and messages sent on social platforms
export const socialOutreach = mysqlTable("socialOutreach", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  leadId: int("leadId").notNull(),
  campaignLeadId: int("campaignLeadId"), // Optional link to campaign
  platform: mysqlEnum("platform", ["linkedin", "instagram", "facebook"]).notNull(),
  messageType: mysqlEnum("messageType", ["connection_request", "direct_message"]).notNull(),
  message: text("message").notNull(), // The generated message content
  status: mysqlEnum("status", ["pending", "sent", "failed", "skipped"]).default("pending").notNull(),
  errorMessage: text("errorMessage"),
  sentAt: timestamp("sentAt"),
  profileUrl: varchar("profileUrl", { length: 500 }), // The target profile URL
  characterCount: int("characterCount"), // Track message length for compliance
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SocialOutreach = typeof socialOutreach.$inferSelect;
export type InsertSocialOutreach = typeof socialOutreach.$inferInsert;


// Website Insights - stores auto-analyzed website data and competitor comparison
export const websiteInsights = mysqlTable("websiteInsights", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull().unique(),
  domain: varchar("domain", { length: 255 }).notNull(),
  totalVisits: int("totalVisits"),
  bounceRate: decimal("bounceRate", { precision: 5, scale: 2 }),
  globalRank: int("globalRank"),
  topKeywords: json("topKeywords"), // Array of keyword objects
  trafficSources: json("trafficSources"), // Traffic source breakdown
  topLandingPages: json("topLandingPages"), // Top pages
  // Competitor comparison data
  competitors: json("competitors"), // Array of competitor domains with their metrics
  competitorGaps: json("competitorGaps"), // What competitors do better (actionable insights)
  // Recent news/industry insights
  recentNews: json("recentNews"), // Array of recent news items relevant to the lead
  industryInsights: json("industryInsights"), // Industry-specific insights from news
  // Summary for email generation
  insightsSummary: text("insightsSummary"), // Pre-generated summary for Claude
  analyzedAt: timestamp("analyzedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WebsiteInsight = typeof websiteInsights.$inferSelect;
export type InsertWebsiteInsight = typeof websiteInsights.$inferInsert;
