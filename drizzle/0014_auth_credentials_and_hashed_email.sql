ALTER TABLE `users` ADD `email_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `email_encrypted` text;--> statement-breakpoint
ALTER TABLE `users` ADD `username` text;--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_hash_unique` ON `users` (`email_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);