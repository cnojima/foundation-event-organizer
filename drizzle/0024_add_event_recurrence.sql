ALTER TABLE `event_templates` ADD `is_recurring` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `event_templates` ADD `recurrence_interval_weeks` integer;--> statement-breakpoint
ALTER TABLE `event_templates` ADD `recurrence_anchor_weekday` integer;--> statement-breakpoint
ALTER TABLE `event_templates` ADD `recurrence_start_time_utc` text;--> statement-breakpoint
ALTER TABLE `event_templates` ADD `recurrence_squad1_time_utc` text;--> statement-breakpoint
ALTER TABLE `event_templates` ADD `recurrence_squad2_time_utc` text;--> statement-breakpoint
ALTER TABLE `event_templates` ADD `recurrence_end_type` text;--> statement-breakpoint
ALTER TABLE `event_templates` ADD `recurrence_count` integer;--> statement-breakpoint
ALTER TABLE `event_templates` ADD `recurrence_until` text;--> statement-breakpoint
ALTER TABLE `event_templates` ADD `recurrence_last_generated_start_at` text;--> statement-breakpoint
ALTER TABLE `event_templates` ADD `recurrence_occurrences_generated` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `event_templates` ADD `series_active` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `series_template_id` text REFERENCES event_templates(id);--> statement-breakpoint
ALTER TABLE `events` ADD `series_modified` integer DEFAULT false NOT NULL;