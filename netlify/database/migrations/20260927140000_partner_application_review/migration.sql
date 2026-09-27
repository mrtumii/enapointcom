-- Review trail for partner applications: who looked at it, what they noted, and
-- which test key was issued from the console.
ALTER TABLE "partner_applications" ADD COLUMN "reviewer_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "partner_applications" ADD COLUMN "reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "partner_applications" ADD COLUMN "api_key_id" integer;--> statement-breakpoint
ALTER TABLE "partner_applications" ADD CONSTRAINT "partner_applications_api_key_id_api_keys_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "vend_tokens" ADD CONSTRAINT "vend_tokens_order_id_key" UNIQUE ("order_id");
