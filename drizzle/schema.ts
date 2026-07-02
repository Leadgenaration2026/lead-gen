import { mysqlTable, mysqlSchema, AnyMySqlColumn, index, int, varchar, mysqlEnum, text, json, timestamp, decimal, tinyint } from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"

export const callLogs = mysqlTable("callLogs", {
	id: int().autoincrement().notNull(),
	campaignLeadId: int().notNull(),
	retellCallId: varchar({ length: 255 }).notNull(),
	phoneNumber: varchar({ length: 20 }).notNull(),
	status: mysqlEnum(['initiated','ringing','in_progress','completed','failed','no_answer']).default('initiated').notNull(),
	duration: int(),
	transcript: text(),
	recordingUrl: varchar({ length: 2048 }),
	callAnalysis: json(),
	triggerType: mysqlEnum(['email_open','email_click','manual']).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("callLogs_retellCallId_unique").on(table.retellCallId),
]);

export const campaignLeads = mysqlTable("campaignLeads", {
	id: int().autoincrement().notNull(),
	campaignId: int().notNull(),
	leadId: int().notNull(),
	emailSent: tinyint().default(0).notNull(),
	emailSentAt: timestamp({ mode: 'string' }),
	emailOpened: tinyint().default(0).notNull(),
	emailOpenedAt: timestamp({ mode: 'string' }),
	emailClicked: tinyint().default(0).notNull(),
	emailClickedAt: timestamp({ mode: 'string' }),
	callTriggered: tinyint().default(0).notNull(),
	callTriggeredAt: timestamp({ mode: 'string' }),
	retellCallId: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	unsubscribed: tinyint().default(0).notNull(),
	unsubscribedAt: timestamp({ mode: 'string' }),
	replied: tinyint().default(0).notNull(),
	repliedAt: timestamp({ mode: 'string' }),
	responseStatus: varchar({ length: 50 }),
	emailBounced: tinyint().default(0).notNull(),
	emailBouncedAt: timestamp({ mode: 'string' }),
	bounceReason: varchar({ length: 500 }),
	senderEmail: varchar({ length: 255 }),
	messageId: varchar({ length: 500 }),
	threadId: varchar({ length: 500 }),
});

export const campaignTemplates = mysqlTable("campaignTemplates", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	subject: varchar({ length: 255 }).notNull(),
	emailTemplate: text().notNull(),
	emailType: mysqlEnum(['discovery','value_prop','social_proof','urgency','custom']).default('custom').notNull(),
	tags: varchar({ length: 255 }),
	usageCount: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const campaigns = mysqlTable("campaigns", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	subject: varchar({ length: 255 }).notNull(),
	emailTemplate: text().notNull(),
	status: mysqlEnum(['draft','active','paused','completed']).default('draft').notNull(),
	totalLeads: int().default(0).notNull(),
	sentCount: int().default(0).notNull(),
	openCount: int().default(0).notNull(),
	clickCount: int().default(0).notNull(),
	callCount: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	launchedAt: timestamp({ mode: 'string' }),
	templateId: int(),
	scheduledAt: timestamp({ mode: 'string' }),
	scheduleCronTaskUid: varchar({ length: 65 }),
	dailySendLimit: int(),
	dailySendCronTaskUid: varchar({ length: 65 }),
	bounceCount: int().default(0).notNull(),
});

export const claudeApiUsage = mysqlTable("claudeApiUsage", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	purpose: varchar({ length: 100 }).notNull(),
	model: varchar({ length: 100 }),
	inputTokens: int(),
	outputTokens: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const emailReplies = mysqlTable("emailReplies", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	leadId: int(),
	campaignLeadId: int(),
	campaignId: int(),
	fromEmail: varchar({ length: 320 }).notNull(),
	toEmail: varchar({ length: 320 }).notNull(),
	subject: varchar({ length: 500 }),
	bodySnippet: text(),
	inReplyToMessageId: varchar({ length: 500 }),
	replyMessageId: varchar({ length: 500 }),
	classification: mysqlEnum(['genuine','auto_reply','newsletter','spam','bounce','unsubscribe','unknown']).default('unknown').notNull(),
	classificationReason: text(),
	confidence: int().default(0),
	followUpsStopped: tinyint().default(0).notNull(),
	stoppedAt: timestamp({ mode: 'string' }),
	rawHeaders: json(),
	receivedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const emailSignatures = mysqlTable("emailSignatures", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	signatureHtml: text().notNull(),
	signaturePlainText: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("emailSignatures_userId_unique").on(table.userId),
]);

export const emailTemplates = mysqlTable("emailTemplates", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	name: varchar({ length: 255 }).notNull(),
	emailType: mysqlEnum(['discovery','value_prop','social_proof','urgency','custom']).notNull(),
	subjectTemplate: varchar({ length: 255 }).notNull(),
	bodyTemplate: text().notNull(),
	description: text(),
	isDefault: tinyint().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const emailTrackingEvents = mysqlTable("emailTrackingEvents", {
	id: int().autoincrement().notNull(),
	campaignLeadId: int().notNull(),
	eventType: mysqlEnum(['open','click','bounce','unsubscribe']).notNull(),
	trackingToken: varchar({ length: 255 }).notNull(),
	userAgent: text(),
	ipAddress: varchar({ length: 45 }),
	clickUrl: varchar({ length: 2048 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("emailTrackingEvents_trackingToken_unique").on(table.trackingToken),
]);

export const followUpCalls = mysqlTable("followUpCalls", {
	id: int().autoincrement().notNull(),
	campaignLeadId: int().notNull(),
	attemptNumber: int().notNull(),
	retellCallId: varchar({ length: 255 }),
	phoneNumber: varchar({ length: 20 }).notNull(),
	status: mysqlEnum(['scheduled','initiated','ringing','in_progress','completed','failed','no_answer','voicemail']).default('scheduled').notNull(),
	duration: int(),
	transcript: text(),
	recordingUrl: varchar({ length: 2048 }),
	callAnalysis: json(),
	scheduledFor: timestamp({ mode: 'string' }),
	initiatedAt: timestamp({ mode: 'string' }),
	completedAt: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("followUpCalls_retellCallId_unique").on(table.retellCallId),
]);

export const followUpEmails = mysqlTable("followUpEmails", {
	id: int().autoincrement().notNull(),
	campaignLeadId: int().notNull(),
	sequenceNumber: int().notNull(),
	emailType: mysqlEnum(['discovery','value_prop','social_proof','urgency','custom']).notNull(),
	subject: varchar({ length: 255 }).notNull(),
	emailBody: text().notNull(),
	ctaLink: varchar({ length: 2048 }),
	status: mysqlEnum(['draft','scheduled','sent','opened','clicked','failed']).default('draft').notNull(),
	scheduledFor: timestamp({ mode: 'string' }),
	sentAt: timestamp({ mode: 'string' }),
	openedAt: timestamp({ mode: 'string' }),
	clickedAt: timestamp({ mode: 'string' }),
	trackingToken: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("followUpEmails_trackingToken_unique").on(table.trackingToken),
]);

export const followUpSchedules = mysqlTable("followUpSchedules", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	emailFollowUpCount: int().default(7).notNull(),
	emailFollowUpIntervalDays: int().default(7).notNull(),
	callFollowUpCount: int().default(7).notNull(),
	callFollowUpIntervalHours: int().default(24).notNull(),
	enableAutoFollowUp: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("followUpSchedules_userId_unique").on(table.userId),
]);

export const leadSets = mysqlTable("leadSets", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	type: varchar({ length: 20 }).default('tag').notNull(),
});

export const leadWeakPoints = mysqlTable("leadWeakPoints", {
	id: int().autoincrement().notNull(),
	leadId: int().notNull(),
	weakPoints: json().notNull(),
	analysis: text(),
	suggestedEmailTypes: json(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("leadWeakPoints_leadId_unique").on(table.leadId),
]);

export const leads = mysqlTable("leads", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	companyName: varchar({ length: 255 }).notNull(),
	ownerName: varchar({ length: 255 }).notNull(),
	email: varchar({ length: 320 }).notNull(),
	phoneNumber: varchar({ length: 20 }).notNull(),
	website: varchar({ length: 255 }),
	industry: varchar({ length: 100 }),
	customData: json(),
	status: mysqlEnum(['new','contacted','qualified','converted','rejected']).default('new').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	tag: mysqlEnum(['hot','warm','cold','follow_up','none']).default('none').notNull(),
	leadSetId: int(),
	timezone: varchar({ length: 50 }).default('America/New_York'),
	linkedinUrl: varchar({ length: 500 }),
	instagramUrl: varchar({ length: 500 }),
	country: varchar({ length: 100 }),
	facebookUrl: varchar({ length: 500 }),
	engagementScore: int().default(0),
	engagementData: json(),
	secondaryPhone: varchar({ length: 20 }),
	socialMediaScore: mysqlEnum(['high','low','pending']).default('pending').notNull(),
	emailVerificationStatus: mysqlEnum(['deliverable','undeliverable','risky','unknown','pending']).default('pending').notNull(),
	emailVerificationData: json(),
	jobTitle: varchar({ length: 255 }),
	sourceListId: int(),
	companySize: varchar({ length: 50 }),
	phoneType: mysqlEnum(['cell','office','unknown']).default('unknown'),
	secondaryPhoneType: mysqlEnum(['cell','office','unknown']),
	personalEmail: varchar({ length: 320 }),
	workEmail: varchar({ length: 320 }),
	allEmails: json(),
	city: varchar({ length: 100 }),
	state: varchar({ length: 100 }),
});

export const rotationalEmails = mysqlTable("rotationalEmails", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	email: varchar({ length: 320 }).notNull(),
	smtpHost: varchar({ length: 255 }).notNull(),
	smtpPort: int().default(587).notNull(),
	smtpUsername: varchar({ length: 255 }).notNull(),
	smtpPassword: varchar({ length: 255 }).notNull(),
	senderName: varchar({ length: 255 }),
	dayOfWeek: int().notNull(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("unique_user_day").on(table.userId, table.dayOfWeek),
]);

export const scheduledEmails = mysqlTable("scheduledEmails", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	leadId: int().notNull(),
	subject: varchar({ length: 255 }).notNull(),
	emailBody: text().notNull(),
	scheduledFor: timestamp({ mode: 'string' }).notNull(),
	status: mysqlEnum(['pending','sent','failed','cancelled']).default('pending').notNull(),
	sentAt: timestamp({ mode: 'string' }),
	errorMessage: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const socialOutreach = mysqlTable("socialOutreach", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	leadId: int().notNull(),
	campaignLeadId: int(),
	platform: mysqlEnum(['linkedin','instagram','facebook']).notNull(),
	messageType: mysqlEnum(['connection_request','direct_message']).notNull(),
	message: text().notNull(),
	status: mysqlEnum(['pending','sent','failed','skipped']).default('pending').notNull(),
	errorMessage: text(),
	sentAt: timestamp({ mode: 'string' }),
	profileUrl: varchar({ length: 500 }),
	characterCount: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const userSettings = mysqlTable("userSettings", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	retellApiKey: varchar({ length: 255 }),
	retellAgentId: varchar({ length: 255 }),
	senderPhoneNumber: varchar({ length: 20 }),
	smtpHost: varchar({ length: 255 }),
	smtpPort: int(),
	smtpUsername: varchar({ length: 255 }),
	smtpPassword: varchar({ length: 255 }),
	senderEmail: varchar({ length: 320 }),
	senderName: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	calcomWebhookSecret: varchar({ length: 255 }),
	retellWebhookSecret: varchar({ length: 255 }),
	seamlessApiKey: varchar({ length: 500 }),
	linkedinUrl: varchar({ length: 500 }),
	linkedinType: mysqlEnum(['page','personal']).default('personal'),
	instagramUrl: varchar({ length: 500 }),
	instagramType: mysqlEnum(['page','personal']).default('personal'),
	facebookUrl: varchar({ length: 500 }),
	facebookType: mysqlEnum(['page','personal']).default('personal'),
	socialDailyLimit: int().default(20),
	socialMessageCharLimit: int().default(300),
	socialNotificationEmail: varchar({ length: 320 }),
	bouncerApiKey: varchar({ length: 500 }),
	ctaLink: varchar({ length: 500 }),
	replyToEmail: varchar({ length: 320 }),
	notificationEmail: varchar({ length: 320 }),
	claudeApiKey: varchar({ length: 500 }),
},
(table) => [
	index("userSettings_userId_unique").on(table.userId),
]);

export const users = mysqlTable("users", {
	id: int().autoincrement().notNull(),
	openId: varchar({ length: 64 }).notNull(),
	name: text(),
	email: varchar({ length: 320 }),
	loginMethod: varchar({ length: 64 }),
	role: mysqlEnum(['user','admin']).default('user').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	lastSignedIn: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("users_openId_unique").on(table.openId),
]);

export const webhookEvents = mysqlTable("webhookEvents", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	webhookType: mysqlEnum(['calendly_booking','email_reply','retell_call']).notNull(),
	status: mysqlEnum(['success','failed','ignored']).default('success').notNull(),
	sourceEmail: varchar({ length: 320 }),
	campaignLeadId: int(),
	payload: json(),
	errorMessage: text(),
	ipAddress: varchar({ length: 45 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	signatureVerified: mysqlEnum(['verified','unverified','bypassed']).default('bypassed'),
});

export const websiteInsights = mysqlTable("websiteInsights", {
	id: int().autoincrement().notNull(),
	leadId: int().notNull(),
	domain: varchar({ length: 255 }).notNull(),
	totalVisits: int(),
	bounceRate: decimal({ precision: 5, scale: 2 }),
	globalRank: int(),
	topKeywords: json(),
	trafficSources: json(),
	topLandingPages: json(),
	competitors: json(),
	competitorGaps: json(),
	recentNews: json(),
	industryInsights: json(),
	insightsSummary: text(),
	analyzedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("websiteInsights_leadId_unique").on(table.leadId),
]);


// Type exports for Insert operations
export type InsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export type InsertLead = typeof leads.$inferInsert;
export type Lead = typeof leads.$inferSelect;

export type InsertCampaign = typeof campaigns.$inferInsert;
export type Campaign = typeof campaigns.$inferSelect;

export type InsertCampaignLead = typeof campaignLeads.$inferInsert;
export type CampaignLead = typeof campaignLeads.$inferSelect;

export type InsertEmailTrackingEvent = typeof emailTrackingEvents.$inferInsert;
export type EmailTrackingEvent = typeof emailTrackingEvents.$inferSelect;

export type InsertCallLog = typeof callLogs.$inferInsert;
export type CallLog = typeof callLogs.$inferSelect;

export type InsertUserSettings = typeof userSettings.$inferInsert;
export type UserSettings = typeof userSettings.$inferSelect;

export type InsertLeadSet = typeof leadSets.$inferInsert;
export type LeadSet = typeof leadSets.$inferSelect;

export type InsertRotationalEmail = typeof rotationalEmails.$inferInsert;
export type RotationalEmail = typeof rotationalEmails.$inferSelect;

export type InsertWebhookEvent = typeof webhookEvents.$inferInsert;
export type WebhookEvent = typeof webhookEvents.$inferSelect;

export type InsertClaudeApiUsage = typeof claudeApiUsage.$inferInsert;
export type ClaudeApiUsage = typeof claudeApiUsage.$inferSelect;
