-- Live data from ENA Plus prepaid meters, forwarded by the Acrel IoT EMS platform.
-- "meter_sn" is Acrel's device serial; meters.acrel_meter_sn links it to a
-- registered customer meter when the two numbers differ.
ALTER TABLE "meters" ADD COLUMN "acrel_meter_sn" text;--> statement-breakpoint
ALTER TABLE "meters" ADD COLUMN "acrel_gateway_sn" text;--> statement-breakpoint
CREATE UNIQUE INDEX "meters_acrel_meter_sn_idx" ON "meters" ("acrel_meter_sn") WHERE "acrel_meter_sn" IS NOT NULL;--> statement-breakpoint
CREATE TABLE "meter_telemetry" (
	"meter_sn" text PRIMARY KEY,
	"meter_no" text DEFAULT '' NOT NULL,
	"gateway_sn" text DEFAULT '' NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meter_readings" (
	"id" bigserial PRIMARY KEY,
	"meter_sn" text NOT NULL,
	"gateway_sn" text DEFAULT '' NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"read_at" text DEFAULT '' NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "meter_readings_meter_idx" ON "meter_readings" ("meter_sn", "received_at" DESC);--> statement-breakpoint
CREATE TABLE "meter_events" (
	"id" bigserial PRIMARY KEY,
	"meter_sn" text NOT NULL,
	"gateway_sn" text DEFAULT '' NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"level" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" text DEFAULT '' NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "meter_events_meter_idx" ON "meter_events" ("meter_sn", "received_at" DESC);--> statement-breakpoint
CREATE TABLE "meter_commands" (
	"id" bigserial PRIMARY KEY,
	"meter_sn" text NOT NULL,
	"gateway_sn" text NOT NULL,
	"action" text NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ok" boolean NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"actor" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
