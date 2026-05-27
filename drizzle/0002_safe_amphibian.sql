CREATE TABLE `emailSignatures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`signatureHtml` text NOT NULL,
	`signaturePlainText` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `emailSignatures_id` PRIMARY KEY(`id`),
	CONSTRAINT `emailSignatures_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `emailTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`emailType` enum('discovery','value_prop','social_proof','urgency','custom') NOT NULL,
	`subjectTemplate` varchar(255) NOT NULL,
	`bodyTemplate` text NOT NULL,
	`description` text,
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `emailTemplates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `followUpCalls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignLeadId` int NOT NULL,
	`attemptNumber` int NOT NULL,
	`retellCallId` varchar(255),
	`phoneNumber` varchar(20) NOT NULL,
	`status` enum('scheduled','initiated','ringing','in_progress','completed','failed','no_answer','voicemail') NOT NULL DEFAULT 'scheduled',
	`duration` int,
	`transcript` text,
	`recordingUrl` varchar(2048),
	`callAnalysis` json,
	`scheduledFor` timestamp,
	`initiatedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `followUpCalls_id` PRIMARY KEY(`id`),
	CONSTRAINT `followUpCalls_retellCallId_unique` UNIQUE(`retellCallId`)
);
--> statement-breakpoint
CREATE TABLE `followUpEmails` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignLeadId` int NOT NULL,
	`sequenceNumber` int NOT NULL,
	`emailType` enum('discovery','value_prop','social_proof','urgency','custom') NOT NULL,
	`subject` varchar(255) NOT NULL,
	`emailBody` text NOT NULL,
	`ctaLink` varchar(2048),
	`status` enum('draft','scheduled','sent','opened','clicked','failed') NOT NULL DEFAULT 'draft',
	`scheduledFor` timestamp,
	`sentAt` timestamp,
	`openedAt` timestamp,
	`clickedAt` timestamp,
	`trackingToken` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `followUpEmails_id` PRIMARY KEY(`id`),
	CONSTRAINT `followUpEmails_trackingToken_unique` UNIQUE(`trackingToken`)
);
--> statement-breakpoint
CREATE TABLE `followUpSchedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`emailFollowUpCount` int NOT NULL DEFAULT 7,
	`emailFollowUpIntervalDays` int NOT NULL DEFAULT 7,
	`callFollowUpCount` int NOT NULL DEFAULT 7,
	`callFollowUpIntervalHours` int NOT NULL DEFAULT 24,
	`enableAutoFollowUp` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `followUpSchedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `followUpSchedules_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `leadWeakPoints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int NOT NULL,
	`weakPoints` json NOT NULL,
	`analysis` text,
	`suggestedEmailTypes` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leadWeakPoints_id` PRIMARY KEY(`id`),
	CONSTRAINT `leadWeakPoints_leadId_unique` UNIQUE(`leadId`)
);
