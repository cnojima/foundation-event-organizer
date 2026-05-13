CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text,
	`actor_user_id` text,
	`actor_display` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`entity_label` text,
	`changes` text,
	`flagged_by_user_id` text,
	`flagged_at` text,
	`flag_note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`flagged_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
