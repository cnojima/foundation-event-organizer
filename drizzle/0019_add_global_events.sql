CREATE TABLE `global_events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`kind` text DEFAULT 'match' NOT NULL,
	`server_number` integer NOT NULL,
	`game_time` text,
	`duration_minutes` integer,
	`squad1_starts_at` text,
	`squad2_starts_at` text,
	`signup_opens` text,
	`signup_closes` text,
	`squad1_name` text DEFAULT 'Squad 1' NOT NULL,
	`squad2_name` text DEFAULT 'Squad 2' NOT NULL,
	`max_players` integer DEFAULT 20 NOT NULL,
	`max_backups` integer DEFAULT 10 NOT NULL,
	`leadership_slots` integer DEFAULT 3 NOT NULL,
	`created_by_user_id` text,
	`created_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `events` ADD `global_event_id` text REFERENCES global_events(id);