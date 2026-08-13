CREATE TABLE `classification_default_allocations` (
	`classification` text NOT NULL,
	`tier` text NOT NULL,
	`max_slots` integer NOT NULL,
	PRIMARY KEY(`classification`, `tier`)
);
--> statement-breakpoint
CREATE TABLE `migration_allocations` (
	`destination_id` text NOT NULL,
	`tier` text NOT NULL,
	`max_slots` integer NOT NULL,
	PRIMARY KEY(`destination_id`, `tier`),
	FOREIGN KEY (`destination_id`) REFERENCES `migration_destinations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `migration_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`destination_id` text NOT NULL,
	`player_name` text NOT NULL,
	`source_server` text NOT NULL,
	`power` integer NOT NULL,
	`tier` text NOT NULL,
	`contact` text,
	`status` text DEFAULT 'applied' NOT NULL,
	`reviewed_by_user_id` text,
	`reviewed_at` text,
	`review_note` text,
	`edit_token` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`destination_id`) REFERENCES `migration_destinations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `migration_applications_edit_token_unique` ON `migration_applications` (`edit_token`);--> statement-breakpoint
CREATE TABLE `migration_destinations` (
	`id` text PRIMARY KEY NOT NULL,
	`server_number` integer NOT NULL,
	`classification` text DEFAULT 'mid' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `migration_destinations_server_number_unique` ON `migration_destinations` (`server_number`);--> statement-breakpoint
CREATE TABLE `migration_officers` (
	`destination_id` text NOT NULL,
	`user_id` text NOT NULL,
	`assigned_by_user_id` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`destination_id`, `user_id`),
	FOREIGN KEY (`destination_id`) REFERENCES `migration_destinations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `power_tier_thresholds` (
	`tier` text PRIMARY KEY NOT NULL,
	`flavor_name` text NOT NULL,
	`min_power` integer
);
