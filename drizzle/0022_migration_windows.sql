DROP INDEX `migration_destinations_server_number_unique`;--> statement-breakpoint
ALTER TABLE `migration_destinations` ADD `opens_at` text NOT NULL;--> statement-breakpoint
ALTER TABLE `migration_destinations` ADD `closes_at` text NOT NULL;