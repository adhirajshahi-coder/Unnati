CREATE TYPE "public"."pool_status" AS ENUM('OPEN', 'READY', 'MATCHED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "pool_members" (
	"id" text PRIMARY KEY NOT NULL,
	"pool_id" text NOT NULL,
	"farmer_id" text NOT NULL,
	"listing_id" text,
	"crop_id" text NOT NULL,
	"quantity_kg" integer NOT NULL,
	"grade" "grade" DEFAULT 'B' NOT NULL,
	"pickup_name" text NOT NULL,
	"pickup_lat" double precision NOT NULL,
	"pickup_lng" double precision NOT NULL,
	"detour_km" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pools" (
	"id" text PRIMARY KEY NOT NULL,
	"mandi_id" text NOT NULL,
	"origin_name" text NOT NULL,
	"origin_lat" double precision NOT NULL,
	"origin_lng" double precision NOT NULL,
	"target_depart_at" timestamp with time zone NOT NULL,
	"target_capacity_kg" integer NOT NULL,
	"distance_km" double precision NOT NULL,
	"status" "pool_status" DEFAULT 'OPEN' NOT NULL,
	"created_by" text NOT NULL,
	"trip_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_farmer_id_users_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_crop_id_crops_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_mandi_id_mandis_id_fk" FOREIGN KEY ("mandi_id") REFERENCES "public"."mandis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pool_members_pool_idx" ON "pool_members" USING btree ("pool_id");--> statement-breakpoint
CREATE INDEX "pools_mandi_status_idx" ON "pools" USING btree ("mandi_id","status","target_depart_at");