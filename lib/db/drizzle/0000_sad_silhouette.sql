CREATE TABLE "admin_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"role" varchar(50) DEFAULT 'receptionist' NOT NULL,
	"pin" varchar(255),
	"photo_url" text,
	"permissions" json DEFAULT '[]'::json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"start_time" text NOT NULL,
	"duration" integer NOT NULL,
	"client" text NOT NULL,
	"client_id" integer,
	"phone" text,
	"service" text,
	"services_json" text,
	"staff" text NOT NULL,
	"staff_id" integer,
	"price" double precision NOT NULL,
	"total" double precision NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"loyalty_points_earned" integer DEFAULT 0,
	"loyalty_discount_amount" double precision DEFAULT 0,
	"loyalty_points_redeemed" integer DEFAULT 0,
	"gift_card_discount_amount" double precision DEFAULT 0,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"booking_status" varchar(20) DEFAULT 'pending',
	"private_room" boolean DEFAULT false NOT NULL,
	"paypal_order_id" text
);
--> statement-breakpoint
CREATE TABLE "business_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_name" varchar(255) DEFAULT 'PREGA SQUAD' NOT NULL,
	"logo" text,
	"address" text,
	"maps_link" text,
	"phone" varchar(50),
	"email" varchar(255),
	"currency" varchar(10) DEFAULT 'MAD' NOT NULL,
	"currency_symbol" varchar(10) DEFAULT 'DH' NOT NULL,
	"opening_time" varchar(10) DEFAULT '09:00' NOT NULL,
	"closing_time" varchar(10) DEFAULT '19:00' NOT NULL,
	"working_days" json DEFAULT '[1,2,3,4,5,6]'::json NOT NULL,
	"holidays" json DEFAULT '[]'::json NOT NULL,
	"loyalty_enabled" boolean DEFAULT true NOT NULL,
	"loyalty_points_per_dh" integer DEFAULT 1 NOT NULL,
	"loyalty_points_value" double precision DEFAULT 0.1 NOT NULL,
	"referral_bonus_points" integer DEFAULT 100 NOT NULL,
	"referral_bonus_referee" integer DEFAULT 50 NOT NULL,
	"cancellation_hours" integer DEFAULT 24 NOT NULL,
	"auto_lock_enabled" boolean DEFAULT false NOT NULL,
	"planning_shortcuts" json DEFAULT '["services","clients","salaries","inventory"]'::json NOT NULL,
	"tts_voice" varchar(50) DEFAULT 'Aoede' NOT NULL,
	"tts_enabled" boolean DEFAULT true NOT NULL,
	"lina_personality" text DEFAULT '["warm"]' NOT NULL,
	"bot_enabled" boolean DEFAULT true NOT NULL,
	"bot_filter_mode" varchar(20) DEFAULT 'all' NOT NULL,
	"bot_filter_numbers" text,
	"boss_instructions" text,
	"bot_silence_after_booking" boolean DEFAULT true NOT NULL,
	"owner_phone" varchar(50),
	"daily_summary_enabled" boolean DEFAULT false NOT NULL,
	"daily_summary_time" varchar(10) DEFAULT '20:00' NOT NULL,
	"planning_slot_height" integer DEFAULT 44 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"color" varchar(50),
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "charges" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"amount" double precision NOT NULL,
	"date" text NOT NULL,
	"category_id" integer,
	"attachment" text,
	"attachment_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"birthday" text,
	"notes" text,
	"loyalty_points" integer DEFAULT 0 NOT NULL,
	"loyalty_enrolled" boolean DEFAULT false NOT NULL,
	"use_points" boolean DEFAULT false NOT NULL,
	"gift_card_balance" double precision DEFAULT 0 NOT NULL,
	"use_gift_card_balance" boolean DEFAULT false NOT NULL,
	"total_visits" integer DEFAULT 0 NOT NULL,
	"total_spent" double precision DEFAULT 0 NOT NULL,
	"referred_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"color" varchar(50) DEFAULT '#6b7280' NOT NULL,
	CONSTRAINT "expense_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "gift_card_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"gift_card_id" integer NOT NULL,
	"appointment_id" integer,
	"amount" double precision NOT NULL,
	"type" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"initial_balance" double precision NOT NULL,
	"current_balance" double precision NOT NULL,
	"purchased_by" integer,
	"recipient_name" varchar(255),
	"recipient_phone" varchar(50),
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gift_cards_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "loyalty_redemptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"points_used" integer NOT NULL,
	"reward_description" text NOT NULL,
	"date" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"category" varchar(100) DEFAULT 'general',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"amount" double precision NOT NULL,
	"date" text NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"package_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"appointment_id" integer,
	"purchase_date" text NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"original_price" double precision NOT NULL,
	"discounted_price" double precision NOT NULL,
	"valid_from" text,
	"valid_until" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"max_uses_per_client" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_path" varchar(255) NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "page_views_page_path_unique" UNIQUE("page_path")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 5 NOT NULL,
	"expiry_date" text,
	"expiry_warning_days" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" serial PRIMARY KEY NOT NULL,
	"referrer_id" integer NOT NULL,
	"referee_id" integer NOT NULL,
	"referrer_points_awarded" integer DEFAULT 0 NOT NULL,
	"referee_points_awarded" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salon_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"amount" double precision NOT NULL,
	"note" text,
	"collected_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price" double precision NOT NULL,
	"duration" integer NOT NULL,
	"category" text NOT NULL,
	"linked_product_id" integer,
	"linked_product_ids" jsonb DEFAULT '[]'::jsonb,
	"commission_percent" double precision DEFAULT 50 NOT NULL,
	"loyalty_points_multiplier" integer DEFAULT 1 NOT NULL,
	"is_starting_price" boolean DEFAULT false NOT NULL,
	"max_price" double precision,
	"emoji" varchar(10)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar(255) PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"phone" text,
	"email" text,
	"base_salary" double precision DEFAULT 0 NOT NULL,
	"photo_url" text,
	"categories" text,
	"public_token" text,
	"gender" varchar(10) DEFAULT 'female' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_breaks" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"date" text NOT NULL,
	"start_time" varchar(10) NOT NULL,
	"end_time" varchar(10) NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	"percentage" double precision DEFAULT 50 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_deductions" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_name" text NOT NULL,
	"staff_id" integer,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"amount" double precision NOT NULL,
	"paid_back" double precision DEFAULT 0 NOT NULL,
	"date" text NOT NULL,
	"cleared" boolean DEFAULT false NOT NULL,
	"cleared_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"period" varchar(7) NOT NULL,
	"revenue_target" double precision DEFAULT 0 NOT NULL,
	"appointments_target" integer DEFAULT 0 NOT NULL,
	"commission_target" double precision DEFAULT 0 NOT NULL,
	"actual_revenue" double precision DEFAULT 0 NOT NULL,
	"actual_appointments" integer DEFAULT 0 NOT NULL,
	"actual_commission" double precision DEFAULT 0 NOT NULL,
	"bonus_percentage" double precision DEFAULT 5 NOT NULL,
	"bonus_amount" double precision DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"staff_name" text NOT NULL,
	"amount" double precision NOT NULL,
	"paid_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" varchar(10) NOT NULL,
	"end_time" varchar(10) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_time_off" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"reason" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tombola_spins" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_id" varchar(255) NOT NULL,
	"result" varchar(100) NOT NULL,
	"segment_index" integer NOT NULL,
	"spun_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"email" varchar(255),
	"first_name" varchar(255),
	"last_name" varchar(255),
	"profile_image_url" varchar(500),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer,
	"client_name" text NOT NULL,
	"client_phone" text,
	"requested_date" text NOT NULL,
	"requested_time" text,
	"service_ids" jsonb DEFAULT '[]'::jsonb,
	"services_description" text,
	"staff_id" integer,
	"staff_name" text,
	"status" varchar(20) DEFAULT 'waiting' NOT NULL,
	"notified_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");