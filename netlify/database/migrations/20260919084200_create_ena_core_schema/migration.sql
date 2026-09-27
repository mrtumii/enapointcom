CREATE TABLE "api_keys" (
	"id" serial PRIMARY KEY,
	"label" text NOT NULL,
	"mode" text DEFAULT 'test' NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" jsonb DEFAULT '["read"]' NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" serial PRIMARY KEY,
	"topic" text DEFAULT 'general' NOT NULL,
	"name" text NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"identifier" text NOT NULL,
	"reading" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'online' NOT NULL,
	"account_ref" text DEFAULT 'ena-demo' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "grid_requests" (
	"id" serial PRIMARY KEY,
	"system_type" text DEFAULT 'mini-grid' NOT NULL,
	"sector" text DEFAULT 'estate' NOT NULL,
	"peak_load_kw" integer DEFAULT 100 NOT NULL,
	"storage_kwh" integer DEFAULT 0 NOT NULL,
	"meter_count" integer DEFAULT 0 NOT NULL,
	"build_window" text DEFAULT '' NOT NULL,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "meters" (
	"id" serial PRIMARY KEY,
	"meter_number" text NOT NULL UNIQUE,
	"imei" text,
	"rfid" text,
	"holder_name" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"disco" text DEFAULT '' NOT NULL,
	"tariff_band" text DEFAULT 'C' NOT NULL,
	"tariff_kobo_per_kwh" integer DEFAULT 28500 NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"auto_topup_floor_kwh" integer DEFAULT 20 NOT NULL,
	"status" text DEFAULT 'linked' NOT NULL,
	"balance_kwh_milli" integer DEFAULT 0 NOT NULL,
	"registered_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY,
	"reference" text NOT NULL UNIQUE,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"meter_number" text DEFAULT '' NOT NULL,
	"purpose" text DEFAULT 'meter-topup' NOT NULL,
	"amount_kobo" integer NOT NULL,
	"service_charge_kobo" integer DEFAULT 0 NOT NULL,
	"units_kwh_milli" integer DEFAULT 0 NOT NULL,
	"provider" text DEFAULT 'simulation' NOT NULL,
	"provider_ref" text,
	"authorization_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"paid_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" serial PRIMARY KEY,
	"order_id" integer,
	"reference" text DEFAULT '' NOT NULL,
	"provider" text DEFAULT 'simulation' NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_updates" (
	"id" serial PRIMARY KEY,
	"product_id" integer,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'release' NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"published_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY,
	"slug" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_kobo" integer,
	"price_note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"specs" jsonb DEFAULT '[]' NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_items" (
	"id" serial PRIMARY KEY,
	"sku" text NOT NULL UNIQUE,
	"product_id" integer,
	"name" text NOT NULL,
	"warehouse" text DEFAULT 'lagos-hub' NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"reorder_level" integer DEFAULT 0 NOT NULL,
	"unit_cost_kobo" integer,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_uploads" (
	"id" serial PRIMARY KEY,
	"filename" text NOT NULL,
	"blob_key" text NOT NULL,
	"rows_total" integer DEFAULT 0 NOT NULL,
	"rows_applied" integer DEFAULT 0 NOT NULL,
	"rows_failed" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'processed' NOT NULL,
	"errors" jsonb DEFAULT '[]' NOT NULL,
	"uploaded_by" text DEFAULT 'console' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vend_tokens" (
	"id" serial PRIMARY KEY,
	"order_id" integer,
	"meter_number" text NOT NULL,
	"token" text NOT NULL,
	"units_kwh_milli" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"delivered_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" serial PRIMARY KEY,
	"url" text NOT NULL,
	"events" jsonb DEFAULT '[]' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_idx" ON "api_keys" ("key_hash");--> statement-breakpoint
CREATE INDEX "meters_imei_idx" ON "meters" ("imei");--> statement-breakpoint
CREATE INDEX "meters_rfid_idx" ON "meters" ("rfid");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" ("status");--> statement-breakpoint
CREATE INDEX "orders_meter_idx" ON "orders" ("meter_number");--> statement-breakpoint
CREATE INDEX "payment_events_reference_idx" ON "payment_events" ("reference");--> statement-breakpoint
CREATE INDEX "product_updates_product_idx" ON "product_updates" ("product_id");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" ("category");--> statement-breakpoint
CREATE INDEX "stock_items_warehouse_idx" ON "stock_items" ("warehouse");--> statement-breakpoint
CREATE INDEX "vend_tokens_meter_idx" ON "vend_tokens" ("meter_number");--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_updates" ADD CONSTRAINT "product_updates_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "vend_tokens" ADD CONSTRAINT "vend_tokens_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;