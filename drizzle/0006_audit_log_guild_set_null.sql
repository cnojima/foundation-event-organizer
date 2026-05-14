PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_audit_log` (
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
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`flagged_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_audit_log`("id", "guild_id", "actor_user_id", "actor_display", "action", "entity_type", "entity_id", "entity_label", "changes", "flagged_by_user_id", "flagged_at", "flag_note", "created_at") SELECT "id", "guild_id", "actor_user_id", "actor_display", "action", "entity_type", "entity_id", "entity_label", "changes", "flagged_by_user_id", "flagged_at", "flag_note", "created_at" FROM `audit_log`;--> statement-breakpoint
DROP TABLE `audit_log`;--> statement-breakpoint
ALTER TABLE `__new_audit_log` RENAME TO `audit_log`;--> statement-breakpoint
PRAGMA foreign_keys=ON;