CREATE TABLE `enrichmentJobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` varchar(255) NOT NULL,
	`userId` int NOT NULL,
	`status` enum('pending','in_progress','completed','failed') NOT NULL DEFAULT 'pending',
	`selectedLeads` int NOT NULL,
	`searchRequests` int NOT NULL DEFAULT 0,
	`researchRequests` int NOT NULL DEFAULT 0,
	`pollRequests` int NOT NULL DEFAULT 0,
	`researchIdsSubmitted` int NOT NULL DEFAULT 0,
	`successful` int NOT NULL DEFAULT 0,
	`failed` int NOT NULL DEFAULT 0,
	`failureReasons` json,
	`payloadHash` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completedAt` timestamp,
	CONSTRAINT `enrichmentJobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `enrichmentJobs_jobId_unique` UNIQUE(`jobId`)
);
--> statement-breakpoint
CREATE TABLE `enrichmentSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`maxCreditsPerRun` int NOT NULL DEFAULT 20,
	`requireConfirmationThreshold` int NOT NULL DEFAULT 50,
	`absoluteHardLimit` int NOT NULL DEFAULT 1000,
	`enabled` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `enrichmentSettings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `websiteInsights` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int NOT NULL,
	`domain` varchar(255) NOT NULL,
	`totalVisits` int,
	`bounceRate` decimal(5,2),
	`globalRank` int,
	`topKeywords` json,
	`trafficSources` json,
	`topLandingPages` json,
	`competitors` json,
	`competitorGaps` json,
	`recentNews` json,
	`industryInsights` json,
	`insightsSummary` text,
	`analyzedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
DROP INDEX `users_email_unique` ON `users`;--> statement-breakpoint
ALTER TABLE `callLogs` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `campaignLeads` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `campaignTemplates` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `campaigns` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `claudeApiUsage` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `emailReplies` MODIFY COLUMN `receivedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `emailReplies` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `emailSignatures` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `emailTemplates` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `emailTrackingEvents` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `followUpCalls` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `followUpEmails` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `followUpSchedules` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `leadSets` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `leadWeakPoints` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `leads` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `rotationalEmails` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `scheduledEmails` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `socialOutreach` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `userSettings` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `name` text;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `email` varchar(320);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `webhookEvents` MODIFY COLUMN `webhookType` enum('calendly_booking','email_reply','retell_call') NOT NULL;--> statement-breakpoint
ALTER TABLE `webhookEvents` MODIFY COLUMN `payload` json;--> statement-breakpoint
ALTER TABLE `webhookEvents` MODIFY COLUMN `status` enum('success','failed','ignored') NOT NULL DEFAULT 'success';--> statement-breakpoint
ALTER TABLE `webhookEvents` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` ADD `loginMethod` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `lastSignedIn` timestamp DEFAULT 'CURRENT_TIMESTAMP' NOT NULL;--> statement-breakpoint
ALTER TABLE `webhookEvents` ADD `sourceEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `webhookEvents` ADD `campaignLeadId` int;--> statement-breakpoint
ALTER TABLE `webhookEvents` ADD `errorMessage` text;--> statement-breakpoint
ALTER TABLE `webhookEvents` ADD `ipAddress` varchar(45);--> statement-breakpoint
ALTER TABLE `webhookEvents` ADD `signatureVerified` enum('verified','unverified','bypassed') DEFAULT 'bypassed';--> statement-breakpoint
CREATE INDEX `enrichmentJobs_userId` ON `enrichmentJobs` (`userId`);--> statement-breakpoint
CREATE INDEX `enrichmentJobs_status` ON `enrichmentJobs` (`status`);--> statement-breakpoint
CREATE INDEX `enrichmentJobs_jobId_unique` ON `enrichmentJobs` (`jobId`);--> statement-breakpoint
CREATE INDEX `enrichmentSettings_userId_unique` ON `enrichmentSettings` (`userId`);--> statement-breakpoint
CREATE INDEX `websiteInsights_leadId_unique` ON `websiteInsights` (`leadId`);--> statement-breakpoint
CREATE INDEX `userSettings_userId_unique` ON `userSettings` (`userId`);--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `emailVerified`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `image`;--> statement-breakpoint
ALTER TABLE `webhookEvents` DROP COLUMN `updatedAt`;