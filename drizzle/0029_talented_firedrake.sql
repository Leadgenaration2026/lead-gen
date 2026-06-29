ALTER TABLE `leads` ADD `phoneType` enum('cell','office','unknown') DEFAULT 'unknown';--> statement-breakpoint
ALTER TABLE `leads` ADD `secondaryPhoneType` enum('cell','office','unknown');--> statement-breakpoint
ALTER TABLE `leads` ADD `personalEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `leads` ADD `workEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `leads` ADD `allEmails` json;