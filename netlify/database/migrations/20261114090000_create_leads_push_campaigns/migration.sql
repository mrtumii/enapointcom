-- AI energy advisor sign-ups from /advisor. Each row is one person's answers to the
-- 60-second survey plus the system the advisor sized for them.
CREATE TABLE "advisor_leads" (
	"id" serial PRIMARY KEY,
	"reference" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"place" text DEFAULT '' NOT NULL,
	"appliances" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"backup_hours" integer DEFAULT 0 NOT NULL,
	"pay" text DEFAULT '' NOT NULL,
	"system" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"marketing_ok" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "advisor_leads_created_idx" ON "advisor_leads" ("created_at" DESC);
--> statement-breakpoint
-- Browsers that turned on ENA alerts with the bell in the header.
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY,
	"endpoint" text NOT NULL UNIQUE,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"page" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_sent_at" timestamp
);
--> statement-breakpoint
-- Email addresses that clicked "unsubscribe" in a marketing email.
CREATE TABLE "email_unsubscribes" (
	"email" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Campaigns sent from the marketing console at /marketing.
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY,
	"segment" text NOT NULL,
	"channel" text NOT NULL,
	"subject" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"email_sent" integer DEFAULT 0 NOT NULL,
	"email_failed" integer DEFAULT 0 NOT NULL,
	"push_sent" integer DEFAULT 0 NOT NULL,
	"push_failed" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
