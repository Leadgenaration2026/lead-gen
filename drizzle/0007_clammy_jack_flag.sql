CREATE TABLE `rotationalEmails` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`smtpHost` varchar(255) NOT NULL,
	`smtpPort` int NOT NULL DEFAULT 587,
	`smtpUsername` varchar(255) NOT NULL,
	`smtpPassword` varchar(255) NOT NULL,
	`senderName` varchar(255),
	`dayOfWeek` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rotationalEmails_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhookEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`webhookType` enum('calendly_booking','email_reply','retell_call') NOT NULL,
	`status` enum('success','failed','ignored') NOT NULL DEFAULT 'success',
	`sourceEmail` varchar(320),
	`campaignLeadId` int,
	`payload` json,
	`errorMessage` text,
	`signatureVerified` enum('verified','unverified','bypassed') DEFAULT 'bypassed',
	`ipAddress` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhookEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `campaignLeads` ADD `unsubscribed` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `campaignLeads` ADD `unsubscribedAt` timestamp;--> statement-breakpoint
ALTER TABLE `campaignLeads` ADD `replied` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `campaignLeads` ADD `repliedAt` timestamp;--> statement-breakpoint
ALTER TABLE `campaignLeads` ADD `responseStatus` varchar(50);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `scheduledAt` timestamp;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `scheduleCronTaskUid` varchar(65);--> statement-breakpoint
ALTER TABLE `leads` ADD `timezone` varchar(50) DEFAULT 'America/New_York';--> statement-breakpoint
ALTER TABLE `leads` ADD `linkedinUrl` varchar(500);--> statement-breakpoint
ALTER TABLE `leads` ADD `instagramUrl` varchar(500);--> statement-breakpoint
ALTER TABLE `leads` ADD `country` varchar(100);--> statement-breakpoint
ALTER TABLE `userSettings` ADD `calendlyWebhookSecret` varchar(255);--> statement-breakpoint
ALTER TABLE `userSettings` ADD `retellWebhookSecret` varchar(255);--> statement-breakpoint
ALTER TABLE `userSettings` ADD `seamlessApiKey` varchar(500);