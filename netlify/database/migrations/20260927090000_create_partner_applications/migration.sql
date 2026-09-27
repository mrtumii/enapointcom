-- Partner integration requests from the guided setup at /partners/setup. Each row
-- is one organisation asking for API access; the integrations desk reviews it and
-- issues a test key from the staff console.
CREATE TABLE "partner_applications" (
	"id" serial PRIMARY KEY,
	"reference" text NOT NULL UNIQUE,
	"organisation" text NOT NULL,
	"org_type" text NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"integration" text NOT NULL,
	"capabilities" jsonb DEFAULT '[]' NOT NULL,
	"channels" jsonb DEFAULT '[]' NOT NULL,
	"monthly_volume" text DEFAULT '' NOT NULL,
	"go_live" text DEFAULT '' NOT NULL,
	"contact_name" text NOT NULL,
	"contact_role" text DEFAULT '' NOT NULL,
	"contact_email" text NOT NULL,
	"contact_phone" text DEFAULT '' NOT NULL,
	"tech_email" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "partner_applications_status_idx" ON "partner_applications" ("status");
