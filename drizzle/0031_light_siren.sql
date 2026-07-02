ALTER TABLE `callLogs` DROP INDEX `callLogs_retellCallId_unique`;--> statement-breakpoint
ALTER TABLE `emailSignatures` DROP INDEX `emailSignatures_userId_unique`;--> statement-breakpoint
ALTER TABLE `emailTrackingEvents` DROP INDEX `emailTrackingEvents_trackingToken_unique`;--> statement-breakpoint
ALTER TABLE `followUpCalls` DROP INDEX `followUpCalls_retellCallId_unique`;--> statement-breakpoint
ALTER TABLE `followUpEmails` DROP INDEX `followUpEmails_trackingToken_unique`;--> statement-breakpoint
ALTER TABLE `followUpSchedules` DROP INDEX `followUpSchedules_userId_unique`;--> statement-breakpoint
ALTER TABLE `leadWeakPoints` DROP INDEX `leadWeakPoints_leadId_unique`;--> statement-breakpoint
ALTER TABLE `userSettings` DROP INDEX `userSettings_userId_unique`;--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_openId_unique`;--> statement-breakpoint
ALTER TABLE `websiteInsights` DROP INDEX `websiteInsights_leadId_unique`;--> statement-breakpoint
ALTER TABLE `callLogs` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `campaignLeads` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `campaignTemplates` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `campaigns` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `claudeApiUsage` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `emailReplies` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `emailSignatures` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `emailTemplates` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `emailTrackingEvents` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `followUpCalls` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `followUpEmails` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `followUpSchedules` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `leadSets` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `leadWeakPoints` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `leads` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `rotationalEmails` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `scheduledEmails` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `socialOutreach` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `userSettings` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `users` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `webhookEvents` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `websiteInsights` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `callLogs` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `campaignLeads` MODIFY COLUMN `emailSent` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `campaignLeads` MODIFY COLUMN `emailSent` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `campaignLeads` MODIFY COLUMN `emailOpened` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `campaignLeads` MODIFY COLUMN `emailOpened` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `campaignLeads` MODIFY COLUMN `emailClicked` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `campaignLeads` MODIFY COLUMN `emailClicked` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `campaignLeads` MODIFY COLUMN `emailBounced` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `campaignLeads` MODIFY COLUMN `emailBounced` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `campaignLeads` MODIFY COLUMN `callTriggered` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `campaignLeads` MODIFY COLUMN `callTriggered` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `campaignLeads` MODIFY COLUMN `unsubscribed` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `campaignLeads` MODIFY COLUMN `unsubscribed` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `campaignLeads` MODIFY COLUMN `replied` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `campaignLeads` MODIFY COLUMN `replied` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `campaignLeads` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `campaignTemplates` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `campaigns` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `claudeApiUsage` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `emailReplies` MODIFY COLUMN `followUpsStopped` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `emailReplies` MODIFY COLUMN `followUpsStopped` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `emailReplies` MODIFY COLUMN `receivedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `emailReplies` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `emailSignatures` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `emailTemplates` MODIFY COLUMN `isDefault` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `emailTemplates` MODIFY COLUMN `isDefault` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `emailTemplates` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `emailTrackingEvents` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `followUpCalls` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `followUpEmails` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `followUpSchedules` MODIFY COLUMN `enableAutoFollowUp` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `followUpSchedules` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `leadSets` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `leadWeakPoints` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `leads` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `rotationalEmails` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `rotationalEmails` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `scheduledEmails` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `socialOutreach` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `userSettings` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `lastSignedIn` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `webhookEvents` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `websiteInsights` MODIFY COLUMN `analyzedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `websiteInsights` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
CREATE INDEX `callLogs_retellCallId_unique` ON `callLogs` (`retellCallId`);--> statement-breakpoint
CREATE INDEX `emailSignatures_userId_unique` ON `emailSignatures` (`userId`);--> statement-breakpoint
CREATE INDEX `emailTrackingEvents_trackingToken_unique` ON `emailTrackingEvents` (`trackingToken`);--> statement-breakpoint
CREATE INDEX `followUpCalls_retellCallId_unique` ON `followUpCalls` (`retellCallId`);--> statement-breakpoint
CREATE INDEX `followUpEmails_trackingToken_unique` ON `followUpEmails` (`trackingToken`);--> statement-breakpoint
CREATE INDEX `followUpSchedules_userId_unique` ON `followUpSchedules` (`userId`);--> statement-breakpoint
CREATE INDEX `leadWeakPoints_leadId_unique` ON `leadWeakPoints` (`leadId`);--> statement-breakpoint
CREATE INDEX `unique_user_day` ON `rotationalEmails` (`userId`,`dayOfWeek`);--> statement-breakpoint
CREATE INDEX `userSettings_userId_unique` ON `userSettings` (`userId`);--> statement-breakpoint
CREATE INDEX `users_openId_unique` ON `users` (`openId`);--> statement-breakpoint
CREATE INDEX `websiteInsights_leadId_unique` ON `websiteInsights` (`leadId`);--> statement-breakpoint
ALTER TABLE `leads` DROP COLUMN `state`;