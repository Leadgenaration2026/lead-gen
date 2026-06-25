ALTER TABLE `userSettings` RENAME COLUMN `calendlyWebhookSecret` TO `calcomWebhookSecret`;--> statement-breakpoint
ALTER TABLE `userSettings` ADD `ctaLink` varchar(500);