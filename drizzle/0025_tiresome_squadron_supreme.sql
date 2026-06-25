CREATE TABLE `claudeApiUsage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`purpose` varchar(100) NOT NULL,
	`model` varchar(100),
	`inputTokens` int,
	`outputTokens` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `claudeApiUsage_id` PRIMARY KEY(`id`)
);
