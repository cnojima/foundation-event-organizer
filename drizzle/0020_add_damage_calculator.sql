CREATE TABLE `damage_fleets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`element_type` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `damage_fleets_name_unique` ON `damage_fleets` (`name`);--> statement-breakpoint
CREATE TABLE `damage_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`phase` text NOT NULL,
	`fleet_id` text NOT NULL,
	`entity_name` text NOT NULL,
	`entity_role` text NOT NULL,
	`damage_dealt` integer NOT NULL,
	`healing_done` integer DEFAULT 0 NOT NULL,
	`damage_received` integer DEFAULT 0 NOT NULL,
	`source_file_name` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `damage_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fleet_id`) REFERENCES `damage_fleets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `damage_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`event_name` text DEFAULT 'Calamity Befalls' NOT NULL,
	`total_time_seconds` real,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
