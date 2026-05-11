CREATE TABLE `duel_notifications` (
	`duel_id` text NOT NULL,
	`kind` text NOT NULL,
	`sent_at` text NOT NULL,
	PRIMARY KEY(`duel_id`, `kind`),
	FOREIGN KEY (`duel_id`) REFERENCES `duel_proposals`(`id`) ON UPDATE no action ON DELETE cascade
);
