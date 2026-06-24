ALTER TABLE `campaignLeads` ADD `emailBounced` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `campaignLeads` ADD `emailBouncedAt` timestamp;--> statement-breakpoint
ALTER TABLE `campaignLeads` ADD `bounceReason` varchar(500);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `bounceCount` int DEFAULT 0 NOT NULL;