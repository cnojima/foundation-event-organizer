PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_guilds` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`is_public` integer DEFAULT true NOT NULL,
	`created_by_user_id` text,
	`created_at` text NOT NULL,
	`deleted_at` text,
	`discord_channel_id` text,
	`discord_guild_id` text,
	`squad1_voice_channel_id` text,
	`squad2_voice_channel_id` text,
	`server_number` integer,
	`tag` text,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_guilds`("id", "name", "slug", "description", "is_public", "created_by_user_id", "created_at", "deleted_at", "discord_channel_id", "discord_guild_id", "squad1_voice_channel_id", "squad2_voice_channel_id", "server_number", "tag") SELECT "id", "name", "slug", "description", "is_public", "created_by_user_id", "created_at", "deleted_at", "discord_channel_id", "discord_guild_id", "squad1_voice_channel_id", "squad2_voice_channel_id", "server_number", "tag" FROM `guilds`;--> statement-breakpoint
DROP TABLE `guilds`;--> statement-breakpoint
ALTER TABLE `__new_guilds` RENAME TO `guilds`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `guilds_slug_unique` ON `guilds` (`slug`);