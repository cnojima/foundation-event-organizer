PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_duel_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`proposing_user_id` text NOT NULL,
	`opposing_user_id` text NOT NULL,
	`proposed_game_time` text NOT NULL,
	`location` text NOT NULL,
	`win_condition` text NOT NULL,
	`message` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`responded_by_user_id` text,
	`responded_at` text,
	`last_edited_by_user_id` text,
	`result` text,
	`result_notes` text,
	`result_declared_by_user_id` text,
	`result_declared_at` text,
	`proposing_feedback` text,
	`proposing_feedback_at` text,
	`opposing_feedback` text,
	`opposing_feedback_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`proposing_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opposing_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`responded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`last_edited_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`result_declared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_duel_proposals`("id", "proposing_user_id", "opposing_user_id", "proposed_game_time", "location", "win_condition", "message", "status", "responded_by_user_id", "responded_at", "last_edited_by_user_id", "result", "result_notes", "result_declared_by_user_id", "result_declared_at", "proposing_feedback", "proposing_feedback_at", "opposing_feedback", "opposing_feedback_at", "created_at", "updated_at") SELECT "id", "proposing_user_id", "opposing_user_id", "proposed_game_time", "location", "win_condition", "message", "status", "responded_by_user_id", "responded_at", "last_edited_by_user_id", "result", "result_notes", "result_declared_by_user_id", "result_declared_at", "proposing_feedback", "proposing_feedback_at", "opposing_feedback", "opposing_feedback_at", "created_at", "updated_at" FROM `duel_proposals`;--> statement-breakpoint
DROP TABLE `duel_proposals`;--> statement-breakpoint
ALTER TABLE `__new_duel_proposals` RENAME TO `duel_proposals`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_guild_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`code` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`expires_at` text,
	`max_uses` integer,
	`uses_count` integer DEFAULT 0 NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_guild_invites`("id", "guild_id", "code", "created_by_user_id", "expires_at", "max_uses", "uses_count", "revoked_at", "created_at") SELECT "id", "guild_id", "code", "created_by_user_id", "expires_at", "max_uses", "uses_count", "revoked_at", "created_at" FROM `guild_invites`;--> statement-breakpoint
DROP TABLE `guild_invites`;--> statement-breakpoint
ALTER TABLE `__new_guild_invites` RENAME TO `guild_invites`;--> statement-breakpoint
CREATE UNIQUE INDEX `guild_invites_code_unique` ON `guild_invites` (`code`);--> statement-breakpoint
CREATE TABLE `__new_scrim_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`proposing_guild_id` text NOT NULL,
	`opposing_guild_id` text NOT NULL,
	`proposed_by_user_id` text NOT NULL,
	`proposed_game_time` text NOT NULL,
	`location` text NOT NULL,
	`win_condition` text NOT NULL,
	`message` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`responded_by_user_id` text,
	`responded_at` text,
	`proposing_event_id` text,
	`opposing_event_id` text,
	`result` text,
	`result_notes` text,
	`result_declared_by_user_id` text,
	`result_declared_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`proposing_guild_id`) REFERENCES `guilds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opposing_guild_id`) REFERENCES `guilds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`proposed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`responded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`proposing_event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`opposing_event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`result_declared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_scrim_proposals`("id", "proposing_guild_id", "opposing_guild_id", "proposed_by_user_id", "proposed_game_time", "location", "win_condition", "message", "status", "responded_by_user_id", "responded_at", "proposing_event_id", "opposing_event_id", "result", "result_notes", "result_declared_by_user_id", "result_declared_at", "created_at", "updated_at") SELECT "id", "proposing_guild_id", "opposing_guild_id", "proposed_by_user_id", "proposed_game_time", "location", "win_condition", "message", "status", "responded_by_user_id", "responded_at", "proposing_event_id", "opposing_event_id", "result", "result_notes", "result_declared_by_user_id", "result_declared_at", "created_at", "updated_at" FROM `scrim_proposals`;--> statement-breakpoint
DROP TABLE `scrim_proposals`;--> statement-breakpoint
ALTER TABLE `__new_scrim_proposals` RENAME TO `scrim_proposals`;