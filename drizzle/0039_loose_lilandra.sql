CREATE TABLE `leadImports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`searchId` varchar(255) NOT NULL,
	`importId` varchar(255) NOT NULL,
	`importedCount` int NOT NULL DEFAULT 0,
	`creditsEstimated` int NOT NULL DEFAULT 0,
	`creditsUsed` int NOT NULL DEFAULT 0,
	`status` enum('pending','completed','failed') NOT NULL DEFAULT 'pending',
	`failureReason` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leadImports_id` PRIMARY KEY(`id`),
	CONSTRAINT `leadImports_importId_unique` UNIQUE(`importId`)
);
--> statement-breakpoint
CREATE TABLE `searchCache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`searchId` varchar(255) NOT NULL,
	`filters` json NOT NULL,
	`totalResults` int NOT NULL DEFAULT 0,
	`resultsRetrieved` int NOT NULL DEFAULT 0,
	`nextToken` varchar(1024),
	`cachedResults` json,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `searchCache_id` PRIMARY KEY(`id`),
	CONSTRAINT `searchCache_searchId_unique` UNIQUE(`searchId`)
);
--> statement-breakpoint
CREATE INDEX `leadImports_userId` ON `leadImports` (`userId`);--> statement-breakpoint
CREATE INDEX `leadImports_searchId` ON `leadImports` (`searchId`);--> statement-breakpoint
CREATE INDEX `leadImports_importId` ON `leadImports` (`importId`);--> statement-breakpoint
CREATE INDEX `leadImports_status` ON `leadImports` (`status`);--> statement-breakpoint
CREATE INDEX `searchCache_userId` ON `searchCache` (`userId`);--> statement-breakpoint
CREATE INDEX `searchCache_searchId` ON `searchCache` (`searchId`);--> statement-breakpoint
CREATE INDEX `searchCache_expiresAt` ON `searchCache` (`expiresAt`);