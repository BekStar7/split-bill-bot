CREATE TABLE `bills` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` integer NOT NULL,
	`message_id` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bill_id` text NOT NULL,
	`chat_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`payer_id` text,
	`amount` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE no action
);
