CREATE TABLE `accounts` (
	`userId` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`providerAccountId` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	PRIMARY KEY(`provider`, `providerAccountId`),
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `duel_proposals` (
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
	FOREIGN KEY (`responded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`result_declared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `event_notifications` (
	`event_id` text NOT NULL,
	`squad` integer NOT NULL,
	`kind` text NOT NULL,
	`sent_at` text NOT NULL,
	PRIMARY KEY(`event_id`, `squad`, `kind`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`game_time` text,
	`squad1_starts_at` text,
	`squad2_starts_at` text,
	`signup_opens` text,
	`signup_closes` text,
	`kind` text DEFAULT 'match' NOT NULL,
	`squad1_name` text DEFAULT 'Squad 1' NOT NULL,
	`squad2_name` text DEFAULT 'Squad 2' NOT NULL,
	`max_players` integer DEFAULT 20 NOT NULL,
	`max_backups` integer DEFAULT 10 NOT NULL,
	`leadership_slots` integer DEFAULT 3 NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL,
	`deleted_at` text,
	`scrimmage_id` text,
	`opposing_guild_id` text,
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opposing_guild_id`) REFERENCES `guilds`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `guild_invites` (
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
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guild_invites_code_unique` ON `guild_invites` (`code`);--> statement-breakpoint
CREATE TABLE `guilds` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`is_public` integer DEFAULT true NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text,
	`discord_channel_id` text,
	`discord_guild_id` text,
	`server_number` integer,
	`tag` text,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guilds_slug_unique` ON `guilds` (`slug`);--> statement-breakpoint
CREATE TABLE `scrim_proposals` (
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
	FOREIGN KEY (`proposed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`responded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposing_event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`opposing_event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`result_declared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`sessionToken` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `signups` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`squad1_preference` integer,
	`squad2_preference` integer,
	`willing_backup` integer DEFAULT true,
	`request_leadership` integer DEFAULT false,
	`leadership_note` text,
	`attended` integer,
	`rating` integer,
	`admin_notes` text,
	`assigned_squad` integer,
	`assigned_role` text,
	`created_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text,
	`emailVerified` integer,
	`image` text,
	`in_game_name` text,
	`locale` text,
	`is_super_admin` integer DEFAULT false NOT NULL,
	`guild_id` text,
	`guild_role` text,
	`power_tier` text,
	`discoverable_for_duels` integer DEFAULT true NOT NULL,
	`duel_rating` integer DEFAULT 1000 NOT NULL,
	`duel_wins` integer DEFAULT 0 NOT NULL,
	`duel_losses` integer DEFAULT 0 NOT NULL,
	`duel_draws` integer DEFAULT 0 NOT NULL,
	`last_duel_at` text,
	`feedback_up_count` integer DEFAULT 0 NOT NULL,
	`feedback_down_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verificationTokens` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
