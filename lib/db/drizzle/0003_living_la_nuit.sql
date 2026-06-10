ALTER TABLE "appointments" ADD COLUMN "reminder_sent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "tags" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "image_url" text;