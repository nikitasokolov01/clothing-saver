CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_url` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`retailer` text NOT NULL,
	`image_url` text DEFAULT '' NOT NULL,
	`price_cents` integer,
	`currency` text DEFAULT 'USD' NOT NULL,
	`category` text DEFAULT 'Other' NOT NULL,
	`selected_size` text DEFAULT '' NOT NULL,
	`selected_color` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`sizes_json` text DEFAULT '[]' NOT NULL,
	`checked_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_canonical_url_unique` ON `products` (`canonical_url`);
--> statement-breakpoint
CREATE INDEX `idx_products_category_status` ON `products` (`category`,`status`);
--> statement-breakpoint
PRAGMA optimize;
