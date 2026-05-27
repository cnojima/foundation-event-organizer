ALTER TABLE `events` DROP COLUMN `game_ends_at`;--> statement-breakpoint
ALTER TABLE `events` ADD `duration_minutes` integer;
