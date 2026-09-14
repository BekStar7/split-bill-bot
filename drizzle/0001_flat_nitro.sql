CREATE TABLE `receipt_cache` (
	`hash` text PRIMARY KEY NOT NULL,
	`parsed` text NOT NULL,
	`created_at` integer NOT NULL
);
