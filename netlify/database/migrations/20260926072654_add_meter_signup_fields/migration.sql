ALTER TABLE "meters" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "meters" ADD COLUMN "meter_type" text DEFAULT 'single-phase' NOT NULL;--> statement-breakpoint
ALTER TABLE "meters" ADD COLUMN "state" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "meters" ADD COLUMN "source" text DEFAULT 'website' NOT NULL;--> statement-breakpoint
ALTER TABLE "meters" ADD COLUMN "verified_at" timestamp;--> statement-breakpoint
CREATE INDEX "meters_status_idx" ON "meters" ("status");--> statement-breakpoint
UPDATE "meters" SET "meter_number" = regexp_replace("meter_number", '[[:space:]-]', '', 'g') WHERE "meter_number" ~ '[[:space:]-]';--> statement-breakpoint
UPDATE "orders" SET "meter_number" = regexp_replace("meter_number", '[[:space:]-]', '', 'g') WHERE "meter_number" ~ '[[:space:]-]';--> statement-breakpoint
UPDATE "vend_tokens" SET "meter_number" = regexp_replace("meter_number", '[[:space:]-]', '', 'g') WHERE "meter_number" ~ '[[:space:]-]';
