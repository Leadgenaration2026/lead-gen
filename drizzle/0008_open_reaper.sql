CREATE TABLE `socialOutreach` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`leadId` int NOT NULL,
	`campaignLeadId` int,
	`platform` enum('linkedin','instagram','facebook') NOT NULL,
	`messageType` enum('connection_request','direct_message') NOT NULL,
	`message` text NOT NULL,
	`status` enum('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`sentAt` timestamp,
	`profileUrl` varchar(500),
	`characterCount` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `socialOutreach_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `leads` ADD `facebookUrl` varchar(500);--> statement-breakpoint
ALTER TABLE `userSettings` ADD `linkedinUrl` varchar(500);--> statement-breakpoint
ALTER TABLE `userSettings` ADD `linkedinType` enum('page','personal') DEFAULT 'personal';--> statement-breakpoint
ALTER TABLE `userSettings` ADD `instagramUrl` varchar(500);--> statement-breakpoint
ALTER TABLE `userSettings` ADD `instagramType` enum('page','personal') DEFAULT 'personal';--> statement-breakpoint
ALTER TABLE `userSettings` ADD `facebookUrl` varchar(500);--> statement-breakpoint
ALTER TABLE `userSettings` ADD `facebookType` enum('page','personal') DEFAULT 'personal';--> statement-breakpoint
ALTER TABLE `userSettings` ADD `socialDailyLimit` int DEFAULT 20;--> statement-breakpoint
ALTER TABLE `userSettings` ADD `socialMessageCharLimit` int DEFAULT 300;