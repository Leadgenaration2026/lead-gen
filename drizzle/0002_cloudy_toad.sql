ALTER TABLE `leads` ADD `allPhones` json;--> statement-breakpoint
ALTER TABLE `leads` ADD `seamlessId` varchar(255);--> statement-breakpoint
ALTER TABLE `leads` ADD `enrichmentCreditsUsed` int DEFAULT 0;