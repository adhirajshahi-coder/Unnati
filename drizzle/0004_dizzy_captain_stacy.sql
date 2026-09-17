CREATE TYPE "public"."wa_direction" AS ENUM('OUTBOUND', 'INBOUND');--> statement-breakpoint
CREATE TYPE "public"."wa_status" AS ENUM('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED');--> statement-breakpoint
ALTER TYPE "public"."channel" ADD VALUE 'WHATSAPP';--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"notification_id" text,
	"direction" "wa_direction" DEFAULT 'OUTBOUND' NOT NULL,
	"template_name" text,
	"body" text NOT NULL,
	"status" "wa_status" DEFAULT 'QUEUED' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_opt_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_number" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_last_inbound_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wa_user_idx" ON "whatsapp_messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "wa_provider_idx" ON "whatsapp_messages" USING btree ("provider_message_id");