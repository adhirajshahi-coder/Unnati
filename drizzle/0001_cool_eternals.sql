ALTER TABLE "crops" ADD COLUMN "category" text DEFAULT 'VEGETABLE' NOT NULL;--> statement-breakpoint
ALTER TABLE "crops" ADD COLUMN "agmarknet_name" text;--> statement-breakpoint
ALTER TABLE "crops" ADD COLUMN "sane_price_min" integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE "crops" ADD COLUMN "sane_price_max" integer DEFAULT 50000 NOT NULL;--> statement-breakpoint
ALTER TABLE "crops" ADD COLUMN "is_custom" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "crops" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "mandis" ADD COLUMN "region" text DEFAULT 'Other' NOT NULL;--> statement-breakpoint
ALTER TABLE "mandis" ADD COLUMN "agmarknet_market" text;--> statement-breakpoint
ALTER TABLE "mandis" ADD COLUMN "agmarknet_state" text;--> statement-breakpoint
ALTER TABLE "mandis" ADD COLUMN "agmarknet_district" text;