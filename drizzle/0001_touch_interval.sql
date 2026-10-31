CREATE TYPE "public"."touch_interval" AS ENUM('week', 'month', 'quarter', 'year');--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "touch_interval" "touch_interval";--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "touch_interval_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_touch_interval_pair_check" CHECK (("contacts"."touch_interval" is null) = ("contacts"."touch_interval_set_at" is null));