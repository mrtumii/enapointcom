-- Founding 50 home power system reservations from /founding50. Kept apart from
-- meter top-up orders because they can be paid in USD or GBP as well as naira,
-- and mixing currencies would corrupt the console's naira revenue totals.
CREATE TABLE "founding50_reservations" (
	"id" serial PRIMARY KEY,
	"reference" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"plan" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"paid_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "founding50_reservations_status_idx" ON "founding50_reservations" ("status");
