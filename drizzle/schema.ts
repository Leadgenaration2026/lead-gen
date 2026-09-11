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
	// Retell's disconnection_reason (e.g. "user_hangup", "agent_hangup") --
	// both are currently treated as positive engagement that cancels all
	// future follow-ups, but they aren't the same thing (a quick user hangup
	// is more likely disinterest), so this is surfaced next to the recording
	// to let a human decide whether to override that and resume follow-ups.
	endReason: varchar({ length: 100 }),
	// Guards the answered-vs-voicemail follow-up decision so it's made
	// exactly once per call, and lets it be deferred (see handleRetellWebhook)
	// until call_analysis.in_voicemail is actually known instead of guessing
	// from disconnection_reason alone on a delivery that hasn't gotten
	// analysis yet.
	followUpDecisionMade: tinyint().default(0).notNull(),
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
	// Set only by an actual Cal.com/Calendly booking webhook -- distinct from
	// `replied` (which a positive email reply also sets) so the report can
	// show whether a lead replied vs. actually booked a meeting.
	meetingBooked: tinyint().default(0).notNull(),
	meetingBookedAt: timestamp({ mode: 'string' }),
	// Manual per-lead opt-out of the CALL side of follow-ups only (e.g. the
	// phone number turned out to be unreachable/wrong) -- follow-up emails
	// keep going as normal. Distinct from `unsubscribed`, which stops both
	// and is permanent/lead-initiated; this is a call-only, user-controlled
	// toggle that can be turned back on.
	callsDisabled: tinyint().default(0).notNull(),
	callsDisabledAt: timestamp({ mode: 'string' }),
	// Running count of open-pixel hits (unlike emailOpened, which only marks
	// the first one) -- needed so a call only gets scheduled once the lead
	// has opened 3+ times, not on every single open.
	emailOpenCount: int().default(0).notNull(),
	// Running count of click hits, same reasoning as emailOpenCount above --
	// used by the LinkedIn/social-outreach popup's "3+ clicks" trigger.
	emailClickCount: int().default(0).notNull(),
	// Set the moment triggerCallOnFollowUpOpen schedules a call from
	// engagement (3+ opens or any click) -- checked BEFORE scheduling so
	// repeat opens/clicks after the first qualifying one never schedule a
	// second call. Distinct from callTriggered (set later, only once Retell
	// actually confirms the call was placed) -- this one exists specifically
	// to stop duplicate scheduling before that confirmation ever happens.
	engagementCallScheduled: tinyint().default(0).notNull(),
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
	// How many follow-up emails a campaign created from this template should
	// get (was a hardcoded 7 for every campaign regardless of template).
	followUpCount: int().default(7).notNull(),
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
	// Copied from the template at creation time (or defaults to 7) --
	// scheduleFollowUpEmails uses this instead of a fixed 7 for every campaign.
	followUpCount: int().default(7).notNull(),
	// Set when this campaign was created from a generated landing page + 8-email
	// sequence (landingPages.createCampaignFromSequence) -- NULL for every
	// campaign created the normal way. Read at the same 3 call sites that
	// schedule follow-ups to decide whether to schedule the pre-generated
	// landingPageEmails sequence instead of the generic follow-up scheduler.
	landingPageId: int(),
});

export const landingPages = mysqlTable("landingPages", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	name: varchar({ length: 255 }).notNull(),
	slug: varchar({ length: 255 }),
	status: mysqlEnum(['draft','published']).default('draft').notNull(),
	industry: varchar({ length: 100 }),
	targetAudience: varchar({ length: 500 }),
	offer: text(),
	companyName: varchar({ length: 255 }),
	logoUrl: varchar({ length: 2048 }),
	// Real, user-supplied proof points (verified testimonial quotes, case
	// study facts, stats) -- generation is instructed to use ONLY these and
	// never invent its own; kept alongside the page so a later single-section
	// or single-email regenerate still has them available.
	proofPoints: json(),
	// {primary,secondary,cta,background,text,accent}
	theme: json().notNull(),
	// Ordered array of section objects -- one JSON blob rather than a child
	// table, so add/remove/duplicate/reorder is a single UPDATE.
	sections: json().notNull(),
	// The honest "closed-book synthesis, not a live competitor audit"
	// disclosure sentence, stored so it's always shown, not just generated once.
	researchNote: text(),
	campaignId: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	publishedAt: timestamp({ mode: 'string' }),
},
(table) => [
	index("landingPages_userId").on(table.userId),
	index("landingPages_slug_unique").on(table.slug),
]);

// Every image ever uploaded through media.uploadImage (logos, hero/section
// images, backgrounds) -- previously each upload just returned a URL and was
// never recorded anywhere, so there was no way to reuse an image uploaded
// earlier from a different landing page or wizard run. This is what backs
// the "Gallery" tab of MediaPickerDialog.
export const mediaAssets = mysqlTable("mediaAssets", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	url: varchar({ length: 2048 }).notNull(),
	// The raw storage key (server/storage.ts's storagePut result) -- kept for
	// a future storage-level delete; today `media.delete` only removes this
	// row, not the underlying S3 object (server/storage.ts has no delete API).
	storageKey: varchar({ length: 1024 }).notNull(),
	filename: varchar({ length: 255 }).notNull(),
	mimeType: varchar({ length: 100 }).notNull(),
	width: int(),
	height: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("mediaAssets_userId").on(table.userId),
]);

export const landingPageEmails = mysqlTable("landingPageEmails", {
	id: int().autoincrement().notNull(),
	landingPageId: int().notNull(),
	// 1-8, matching the user-facing "Email 1"..."Email 8" labeling. Email 1
	// (initial_outreach) becomes the campaign's own subject/emailTemplate at
	// createCampaignFromSequence time; 2-8 are scheduled into the existing
	// followUpEmails table (renumbered 1-7 there) by scheduleCampaignEmailsFromSequence.
	sequenceNumber: int().notNull(),
	slotPurpose: varchar({ length: 50 }).notNull(),
	subject: varchar({ length: 255 }).notNull(),
	bodyHtml: text().notNull(),
	bodyPlainText: text(),
	dayOffset: int().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("landingPageEmails_landingPageId").on(table.landingPageId),
	index("landingPageEmails_lp_seq_unique").on(table.landingPageId, table.sequenceNumber),
]);

// One row per bulk email-verification run (in-house engine -- see
// server/_core/emailVerification.ts). Modeled on enrichmentJobs' shape.
export const emailVerificationJobs = mysqlTable("emailVerificationJobs", {
	id: int().autoincrement().notNull(),
	jobId: varchar({ length: 255 }).notNull(),
	userId: int().notNull(),
	status: mysqlEnum(['pending','in_progress','completed','failed']).default('pending').notNull(),
	// Always "in_house" today -- kept as a free-form string (not an enum)
	// since it previously also recorded "in_house+bouncer" before that
	// integration was removed; old rows may still have that value.
	mode: varchar({ length: 30 }).default('in_house').notNull(),
	totalEmails: int().notNull(),
	processedCount: int().default(0).notNull(),
	validCount: int().default(0).notNull(),
	invalidCount: int().default(0).notNull(),
	catchAllCount: int().default(0).notNull(),
	roleBasedCount: int().default(0).notNull(),
	disposableCount: int().default(0).notNull(),
	unknownCount: int().default(0).notNull(),
	sourceType: mysqlEnum(['campaign','leadIds','emails']).notNull(),
	sourceCampaignId: int(),
	errorMessage: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	completedAt: timestamp({ mode: 'string' }),
},
(table) => [
	index("emailVerificationJobs_userId").on(table.userId),
	index("emailVerificationJobs_jobId_unique").on(table.jobId),
]);

// Append-only verification history -- leads.emailVerificationStatus/Data only
// ever hold the LATEST result and get overwritten on re-verify; this is the
// audit trail across every attempt, per job.
export const emailVerificationResults = mysqlTable("emailVerificationResults", {
	id: int().autoincrement().notNull(),
	jobId: varchar({ length: 255 }).notNull(),
	leadId: int(), // nullable -- ad-hoc emails[] verification has no lead
	email: varchar({ length: 320 }).notNull(),
	provider: varchar({ length: 30 }).notNull(),
	rawStatus: varchar({ length: 50 }).notNull(),
	normalizedStatus: mysqlEnum(['valid','invalid','catch_all','role_based','disposable','unknown']).notNull(),
	score: int(),
	reason: text(),
	shouldSend: tinyint().default(0).notNull(),
	verifiedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("emailVerificationResults_jobId").on(table.jobId),
	index("emailVerificationResults_leadId").on(table.leadId),
	index("emailVerificationResults_email").on(table.email),
]);

// Lightweight audit log for the verify -> tag -> landing page -> emails ->
// pre-flight -> launch pipeline. Shaped after webhookEvents (the closest
// existing generic timestamped-event table).
export const pipelineEvents = mysqlTable("pipelineEvents", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	eventType: mysqlEnum([
		'leads_generated','verification_started','verification_completed',
		'tag_assigned','landing_page_generated','campaign_created_from_sequence',
		'preflight_passed','preflight_failed','campaign_launched',
	]).notNull(),
	campaignId: int(),
	landingPageId: int(),
	payload: json(),
	errorMessage: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("pipelineEvents_userId").on(table.userId),
	index("pipelineEvents_campaignId").on(table.campaignId),
]);

// One row per "Lead Gen Head" autonomous task -- a structured brief (not a
// chat conversation) that the /api/scheduled/process-leadgen-tasks heartbeat
// (server/_core/leadGenTaskOrchestrator.ts) advances one stage at a time,
// re-entrant on every cron tick since this app has no in-process timers/
// worker (see references/periodic-updates.md). `status` doubles as the
// resume point after a restart; `needsAttention`/`attentionReason` is the
// in-app alert surfaced on the monitoring page when a stage can't proceed
// (missing prerequisite, zero leads found, a failed preflight check, etc).
export const leadGenTasks = mysqlTable("leadGenTasks", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	name: varchar({ length: 255 }).notNull(),
	country: varchar({ length: 100 }),
	state: varchar({ length: 100 }),
	// Seamless.AI has no city filter at all -- this is folded into the
	// free-text search instruction as a hint for the LLM parser only, never
	// a guaranteed deterministic filter like country/state/industry are.
	city: varchar({ length: 100 }),
	companySize: varchar({ length: 50 }),
	industries: json(),
	jobTitles: json(),
	targetLeadCount: int().notNull(),
	offer: text().notNull(),
	stylePreference: varchar({ length: 50 }),
	proofPoints: json(),
	logoUrl: varchar({ length: 2048 }),
	landingPageName: varchar({ length: 255 }).notNull(),
	status: mysqlEnum([
		'pending', 'extracting', 'verifying', 'tagging', 'generating',
		'creating_campaign', 'publishing', 'preflight', 'launching',
		'completed', 'failed',
	]).default('pending').notNull(),
	extractedCount: int().default(0).notNull(),
	nextSeamlessToken: text(),
	leadSetId: int(),
	verificationJobId: varchar({ length: 255 }),
	verifiedLeadIds: json(),
	landingPageId: int(),
	campaignId: int(),
	needsAttention: tinyint().default(0).notNull(),
	attentionReason: text(),
	lastError: text(),
	scheduledAt: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	completedAt: timestamp({ mode: 'string' }),
},
(table) => [
	index("leadGenTasks_userId").on(table.userId),
	index("leadGenTasks_status").on(table.status),
]);

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
	// Nullable: campaign-linked emails set this; standalone one-off scheduled
	// emails (no campaign) set leadId instead.
	campaignLeadId: int(),
	leadId: int(),
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
	// Click tracking used a fresh, never-persisted token per send (only the
	// open pixel's token was ever saved back to this row) -- meaning a
	// follow-up email's own openedAt/clickedAt/status could never actually
	// be set from a real open/click, regardless of whether the recipient
	// engaged. Saving this alongside trackingToken lets the click handler
	// resolve a click back to this specific follow-up email.
	clickTrackingToken: varchar({ length: 255 }),
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
	allPhones: json(), // Array of {number, type: 'cell'|'landline'|'office'}
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
		seamlessId: varchar({ length: 255 }), // Seamless.AI contact ID for phone verification
		enrichmentCreditsUsed: int().default(0), // Credits consumed during phone verification enrichment
		unsubscribed: tinyint().default(0).notNull(), // Global opt-out, independent of any single campaign
		unsubscribedAt: timestamp({ mode: 'string' }),
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
	// Recipient response, tracked manually since there's no platform API
	// integration -- the user has to check LinkedIn/Instagram/Facebook
	// themselves and report back what happened.
	responseStatus: mysqlEnum(['none','accepted','replied','declined']).default('none').notNull(),
	respondedAt: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	// A new queued message used to trigger an email to socialNotificationEmail
	// -- now it drives an in-app popup instead (see socialOutreach.listPendingPopups),
	// dismissed independently of the message's own send/skip status below.
	popupDismissedAt: timestamp({ mode: 'string' }),
});

export const userSettings = mysqlTable("userSettings", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	// The user's OWN business name (e.g. "Virtual Assistant Group") -- passed to
	// Retell.AI as the "company_name" dynamic variable so the voice agent says
	// who it's calling FROM. Distinct from leads.companyName, which is the
	// customer/lead's own business being called.
	companyName: varchar({ length: 255 }),
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
	// Per-platform, per-action-type daily caps, e.g.
	// {"linkedin":{"connection_request":20,"direct_message":20}, "instagram":{...}, "facebook":{...}}
	// Kept separate from socialDailyLimit (the old combined-across-everything cap).
	socialDailyLimits: json(),
	socialNotificationEmail: varchar({ length: 320 }),
	ctaLink: varchar({ length: 500 }),
	replyToEmail: varchar({ length: 320 }),
	notificationEmail: varchar({ length: 320 }),
	claudeApiKey: varchar({ length: 500 }),
	imapHost: varchar({ length: 255 }),
	imapPort: int(),
	imapUsername: varchar({ length: 255 }),
	imapPassword: varchar({ length: 255 }),
	imapLastUid: int(),
	imapLastSyncedAt: timestamp({ mode: 'string' }),
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

export type InsertScheduledEmail = typeof scheduledEmails.$inferInsert;
export type ScheduledEmail = typeof scheduledEmails.$inferSelect;

export type InsertCampaignTemplate = typeof campaignTemplates.$inferInsert;
export type CampaignTemplate = typeof campaignTemplates.$inferSelect;

export type InsertFollowUpEmail = typeof followUpEmails.$inferInsert;
export type FollowUpEmail = typeof followUpEmails.$inferSelect;

export type InsertFollowUpCall = typeof followUpCalls.$inferInsert;
export type FollowUpCall = typeof followUpCalls.$inferSelect;

export type InsertEmailTemplate = typeof emailTemplates.$inferInsert;
export type EmailTemplate = typeof emailTemplates.$inferSelect;

export type InsertLeadWeakPoints = typeof leadWeakPoints.$inferInsert;
export type LeadWeakPoints = typeof leadWeakPoints.$inferSelect;

export type InsertFollowUpSchedule = typeof followUpSchedules.$inferInsert;
export type FollowUpSchedule = typeof followUpSchedules.$inferSelect;

export type InsertEmailSignature = typeof emailSignatures.$inferInsert;
export type EmailSignature = typeof emailSignatures.$inferSelect;

export type InsertEmailReply = typeof emailReplies.$inferInsert;
export type EmailReply = typeof emailReplies.$inferSelect;

export type InsertSocialOutreach = typeof socialOutreach.$inferInsert;
export type SocialOutreach = typeof socialOutreach.$inferSelect;


// Enrichment settings and job tracking for credit protection
export const enrichmentSettings = mysqlTable("enrichmentSettings", {
	id: int().autoincrement().notNull().primaryKey(),
	userId: int().notNull(),
	maxCreditsPerRun: int().default(20).notNull(),
	requireConfirmationThreshold: int().default(50).notNull(),
	absoluteHardLimit: int().default(1000).notNull(),
	enabled: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("enrichmentSettings_userId_unique").on(table.userId),
]);

export const enrichmentJobs = mysqlTable("enrichmentJobs", {
	id: int().autoincrement().notNull().primaryKey(),
	jobId: varchar({ length: 255 }).notNull().unique(),
	userId: int().notNull(),
	status: mysqlEnum(['pending', 'in_progress', 'completed', 'failed']).default('pending').notNull(),
	selectedLeads: int().notNull(),
	searchRequests: int().default(0).notNull(),
	researchRequests: int().default(0).notNull(),
	pollRequests: int().default(0).notNull(),
	researchIdsSubmitted: int().default(0).notNull(),
	successful: int().default(0).notNull(),
	failed: int().default(0).notNull(),
	failureReasons: json(),
	payloadHash: varchar({ length: 255 }).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	completedAt: timestamp({ mode: 'string' }),
},
(table) => [
	index("enrichmentJobs_userId").on(table.userId),
	index("enrichmentJobs_status").on(table.status),
	index("enrichmentJobs_jobId_unique").on(table.jobId),
]);

export type InsertEnrichmentSettings = typeof enrichmentSettings.$inferInsert;
export type EnrichmentSettings = typeof enrichmentSettings.$inferSelect;

export type InsertEnrichmentJob = typeof enrichmentJobs.$inferInsert;
export type EnrichmentJob = typeof enrichmentJobs.$inferSelect;

/**
 * Search Preview Mode Tables
 * Implements the Search → Preview → Import → Enrich workflow
 */

export const searchCache = mysqlTable("searchCache", {
	id: int().autoincrement().notNull().primaryKey(),
	userId: int().notNull(),
	searchId: varchar({ length: 255 }).notNull().unique(),
	filters: json().notNull(), // Stored filters: {jobTitle, companySize, industry, country, etc}
	totalResults: int().default(0).notNull(), // Total leads found by Seamless.AI
	resultsRetrieved: int().default(0).notNull(), // How many results we've fetched so far
	nextToken: varchar({ length: 1024 }), // Pagination token for fetching more results
	cachedResults: json(), // First page of results cached
	expiresAt: timestamp({ mode: 'string' }).notNull(), // Cache expiration (24 hours)
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("searchCache_userId").on(table.userId),
	index("searchCache_searchId").on(table.searchId),
	index("searchCache_expiresAt").on(table.expiresAt),
]);

export const leadImports = mysqlTable("leadImports", {
	id: int().autoincrement().notNull().primaryKey(),
	userId: int().notNull(),
	searchId: varchar({ length: 255 }).notNull(), // Link to searchCache
	importId: varchar({ length: 255 }).notNull().unique(),
	importedCount: int().default(0).notNull(), // How many leads were imported
	creditsEstimated: int().default(0).notNull(), // Estimated credits for enrichment
	creditsUsed: int().default(0).notNull(), // Actual credits used (0 until enrichment)
	status: mysqlEnum(['pending', 'completed', 'failed']).default('pending').notNull(),
	failureReason: varchar({ length: 500 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("leadImports_userId").on(table.userId),
	index("leadImports_searchId").on(table.searchId),
	index("leadImports_importId").on(table.importId),
	index("leadImports_status").on(table.status),
]);

export type InsertSearchCache = typeof searchCache.$inferInsert;
export type SearchCache = typeof searchCache.$inferSelect;

export type InsertLeadImport = typeof leadImports.$inferInsert;
export type LeadImport = typeof leadImports.$inferSelect;
