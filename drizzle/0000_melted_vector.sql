CREATE TYPE "public"."channel" AS ENUM('PUSH', 'SMS', 'IVR', 'IN_APP');--> statement-breakpoint
CREATE TYPE "public"."grade" AS ENUM('A', 'B', 'C');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('en', 'hi');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('OPEN', 'BOOKED', 'SOLD', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."load_status" AS ENUM('REQUESTED', 'CONFIRMED', 'PICKED_UP', 'DELIVERED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."notif_type" AS ENUM('PRICE_ALERT', 'POOLING_ALERT', 'BILLING_REMINDER', 'TRIP_UPDATE', 'SPOILAGE_WARNING', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('FARMER', 'OPERATOR', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."trip_status" AS ENUM('OPEN', 'FULL', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."truck_status" AS ENUM('AVAILABLE', 'ON_TRIP', 'OFFLINE');--> statement-breakpoint
CREATE TYPE "public"."txn_kind" AS ENUM('TRANSPORT_CHARGE', 'SALE_PROCEEDS', 'PLATFORM_FEE', 'OPERATOR_SETTLEMENT');--> statement-breakpoint
CREATE TYPE "public"."txn_status" AS ENUM('DUE', 'PAID', 'FAILED', 'WAIVED');--> statement-breakpoint
CREATE TABLE "crops" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_hi" text NOT NULL,
	"shelf_life_hours" integer NOT NULL,
	"spoilage_rate_per_day" double precision NOT NULL,
	"perishability" text NOT NULL,
	"handling_tip" text NOT NULL,
	"handling_tip_hi" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_health" (
	"id" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone NOT NULL,
	"records_ingested" integer DEFAULT 0 NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"message" text
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" text PRIMARY KEY NOT NULL,
	"farmer_id" text NOT NULL,
	"crop_id" text NOT NULL,
	"quantity_kg" integer NOT NULL,
	"grade" "grade" DEFAULT 'B' NOT NULL,
	"harvested_at" timestamp with time zone NOT NULL,
	"dispatch_by" timestamp with time zone NOT NULL,
	"pickup_name" text NOT NULL,
	"pickup_lat" double precision NOT NULL,
	"pickup_lng" double precision NOT NULL,
	"status" "listing_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loads" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"farmer_id" text NOT NULL,
	"listing_id" text,
	"crop_id" text NOT NULL,
	"quantity_kg" integer NOT NULL,
	"grade" "grade" DEFAULT 'B' NOT NULL,
	"pickup_name" text NOT NULL,
	"pickup_lat" double precision NOT NULL,
	"pickup_lng" double precision NOT NULL,
	"detour_km" double precision DEFAULT 0 NOT NULL,
	"cost_share" integer DEFAULT 0 NOT NULL,
	"sale_price_per_quintal" integer,
	"status" "load_status" DEFAULT 'REQUESTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mandis" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_hi" text NOT NULL,
	"district" text NOT NULL,
	"state" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"commission_rate" double precision DEFAULT 0.02 NOT NULL,
	"market_fee_per_quintal" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "notif_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"title_hi" text,
	"body_hi" text,
	"channel" "channel" DEFAULT 'IN_APP' NOT NULL,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"href" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_records" (
	"id" text PRIMARY KEY NOT NULL,
	"mandi_id" text NOT NULL,
	"crop_id" text NOT NULL,
	"min_price" integer NOT NULL,
	"modal_price" integer NOT NULL,
	"max_price" integer NOT NULL,
	"arrivals_quintal" integer,
	"source" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_pings" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"speed_kmph" double precision,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"load_id" text,
	"trip_id" text,
	"kind" "txn_kind" NOT NULL,
	"amount" integer NOT NULL,
	"status" "txn_status" DEFAULT 'DUE' NOT NULL,
	"due_date" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"upi_ref" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" text PRIMARY KEY NOT NULL,
	"truck_id" text NOT NULL,
	"mandi_id" text NOT NULL,
	"origin_name" text NOT NULL,
	"origin_lat" double precision NOT NULL,
	"origin_lng" double precision NOT NULL,
	"depart_at" timestamp with time zone NOT NULL,
	"capacity_kg" integer NOT NULL,
	"used_kg" integer DEFAULT 0 NOT NULL,
	"total_cost" integer NOT NULL,
	"base_distance_km" double precision NOT NULL,
	"status" "trip_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trucks" (
	"id" text PRIMARY KEY NOT NULL,
	"operator_id" text NOT NULL,
	"reg_no" text NOT NULL,
	"vehicle_type" text NOT NULL,
	"capacity_kg" integer NOT NULL,
	"rate_per_km" integer NOT NULL,
	"status" "truck_status" DEFAULT 'AVAILABLE' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"rating_sum" integer DEFAULT 0 NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trucks_reg_no_unique" UNIQUE("reg_no")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"pin_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" DEFAULT 'FARMER' NOT NULL,
	"language" "language" DEFAULT 'hi' NOT NULL,
	"village" text,
	"district" text,
	"state" text,
	"lat" double precision,
	"lng" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_farmer_id_users_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_crop_id_crops_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loads" ADD CONSTRAINT "loads_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loads" ADD CONSTRAINT "loads_farmer_id_users_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loads" ADD CONSTRAINT "loads_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loads" ADD CONSTRAINT "loads_crop_id_crops_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_records" ADD CONSTRAINT "price_records_mandi_id_mandis_id_fk" FOREIGN KEY ("mandi_id") REFERENCES "public"."mandis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_records" ADD CONSTRAINT "price_records_crop_id_crops_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_pings" ADD CONSTRAINT "tracking_pings_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_truck_id_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."trucks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_mandi_id_mandis_id_fk" FOREIGN KEY ("mandi_id") REFERENCES "public"."mandis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listings_farmer_idx" ON "listings" USING btree ("farmer_id","status");--> statement-breakpoint
CREATE INDEX "loads_trip_idx" ON "loads" USING btree ("trip_id","status");--> statement-breakpoint
CREATE INDEX "loads_farmer_idx" ON "loads" USING btree ("farmer_id");--> statement-breakpoint
CREATE INDEX "mandis_district_idx" ON "mandis" USING btree ("district");--> statement-breakpoint
CREATE INDEX "notif_user_idx" ON "notifications" USING btree ("user_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "price_mandi_crop_idx" ON "price_records" USING btree ("mandi_id","crop_id","recorded_at");--> statement-breakpoint
CREATE INDEX "pings_trip_idx" ON "tracking_pings" USING btree ("trip_id","at");--> statement-breakpoint
CREATE INDEX "txn_user_idx" ON "transactions" USING btree ("user_id","status","due_date");--> statement-breakpoint
CREATE INDEX "trips_mandi_status_idx" ON "trips" USING btree ("mandi_id","status","depart_at");--> statement-breakpoint
CREATE INDEX "trucks_operator_idx" ON "trucks" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");