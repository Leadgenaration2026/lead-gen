CREATE TABLE `campaignTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`subject` varchar(255) NOT NULL,
	`emailTemplate` text NOT NULL,
	`emailType` enum('discovery','value_prop','social_proof','urgency','custom') NOT NULL DEFAULT 'custom',
	`tags` varchar(255),
	`usageCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaignTemplates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scheduledEmails` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`leadId` int NOT NULL,
	`subject` varchar(255) NOT NULL,
	`emailBody` text NOT NULL,
	`scheduledFor` timestamp NOT NULL,
	`status` enum('pending','sent','failed','cancelled') NOT NULL DEFAULT 'pending',
	`sentAt` timestamp,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduledEmails_id` PRIMARY KEY(`id`)
);
