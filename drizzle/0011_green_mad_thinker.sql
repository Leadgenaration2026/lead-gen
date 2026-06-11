ALTER TABLE `campaigns` ADD `dailySendLimit` int;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `dailySendCronTaskUid` varchar(65);--> statement-breakpoint
ALTER TABLE `leads` ADD `engagementScore` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `leads` ADD `engagementData` json;