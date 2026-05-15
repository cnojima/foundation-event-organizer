ALTER TABLE `users` ADD `stub_created_by_user_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `stub_created_at` text;