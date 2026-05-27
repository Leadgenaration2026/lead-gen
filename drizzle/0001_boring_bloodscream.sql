CREATE TABLE `callLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignLeadId` int NOT NULL,
	`retellCallId` varchar(255) NOT NULL,
	`phoneNumber` varchar(20) NOT NULL,
	`status` enum('initiated','ringing','in_progress','completed','failed','no_answer') NOT NULL DEFAULT 'initiated',
	`duration` int,
	`transcript` text,
	`recordingUrl` varchar(2048),
	`callAnalysis` json,
	`triggerType` enum('email_open','email_click','manual') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `callLogs_id` PRIMARY KEY(`id`),
	CONSTRAINT `callLogs_retellCallId_unique` UNIQUE(`retellCallId`)
);
--> statement-breakpoint
CREATE TABLE `campaignLeads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`leadId` int NOT NULL,
	`emailSent` boolean NOT NULL DEFAULT false,
	`emailSentAt` timestamp,
	`emailOpened` boolean NOT NULL DEFAULT false,
	`emailOpenedAt` timestamp,
	`emailClicked` boolean NOT NULL DEFAULT false,
	`emailClickedAt` timestamp,
	`callTriggered` boolean NOT NULL DEFAULT false,
	`callTriggeredAt` timestamp,
	`retellCallId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaignLeads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`subject` varchar(255) NOT NULL,
	`emailTemplate` text NOT NULL,
	`status` enum('draft','active','paused','completed') NOT NULL DEFAULT 'draft',
	`totalLeads` int NOT NULL DEFAULT 0,
	`sentCount` int NOT NULL DEFAULT 0,
	`openCount` int NOT NULL DEFAULT 0,
	`clickCount` int NOT NULL DEFAULT 0,
	`callCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`launchedAt` timestamp,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `emailTrackingEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignLeadId` int NOT NULL,
	`eventType` enum('open','click','bounce','unsubscribe') NOT NULL,
	`trackingToken` varchar(255) NOT NULL,
	`userAgent` text,
	`ipAddress` varchar(45),
	`clickUrl` varchar(2048),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `emailTrackingEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `emailTrackingEvents_trackingToken_unique` UNIQUE(`trackingToken`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyName` varchar(255) NOT NULL,
	`ownerName` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phoneNumber` varchar(20) NOT NULL,
	`website` varchar(255),
	`industry` varchar(100),
	`customData` json,
	`status` enum('new','contacted','qualified','converted','rejected') NOT NULL DEFAULT 'new',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`retellApiKey` varchar(255),
	`retellAgentId` varchar(255),
	`senderPhoneNumber` varchar(20),
	`smtpHost` varchar(255),
	`smtpPort` int,
	`smtpUsername` varchar(255),
	`smtpPassword` varchar(255),
	`senderEmail` varchar(320),
	`senderName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `userSettings_userId_unique` UNIQUE(`userId`)
);
