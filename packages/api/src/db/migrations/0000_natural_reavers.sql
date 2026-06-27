DO $$ BEGIN
 CREATE TYPE "public"."email_status" AS ENUM('inbox', 'spam', 'quarantine', 'sent', 'draft');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."scanner_name" AS ENUM('llm-guard', 'clamav', 'spam-filter');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."spam_sensitivity" AS ENUM('low', 'medium', 'high', 'custom');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_id" uuid NOT NULL,
	"filename" varchar(255) NOT NULL,
	"mime_type" varchar(127) NOT NULL,
	"size" integer NOT NULL,
	"storage_path" varchar(512) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"from_address" varchar(255) NOT NULL,
	"to_addresses" jsonb NOT NULL,
	"subject" varchar(500) DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"body_html" text,
	"status" "email_status" DEFAULT 'inbox' NOT NULL,
	"thread_id" uuid,
	"in_reply_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scan_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_id" uuid NOT NULL,
	"attachment_id" uuid,
	"scanner" "scanner_name" NOT NULL,
	"passed" boolean NOT NULL,
	"risk_score" real NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"scanner_version" varchar(32),
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "spam_filter_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sensitivity" "spam_sensitivity" DEFAULT 'medium' NOT NULL,
	"allowlist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"blocklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"keyword_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"block_content_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(64) NOT NULL,
	"email" varchar(255) NOT NULL,
	"custom_email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"api_key" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attachments" ADD CONSTRAINT "attachments_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "emails" ADD CONSTRAINT "emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scan_results" ADD CONSTRAINT "scan_results_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scan_results" ADD CONSTRAINT "scan_results_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spam_filter_configs" ADD CONSTRAINT "spam_filter_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachments_email_idx" ON "attachments" ("email_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emails_user_status_idx" ON "emails" ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emails_thread_idx" ON "emails" ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emails_created_idx" ON "emails" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scan_results_email_idx" ON "scan_results" ("email_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "spam_config_user_idx" ON "spam_filter_configs" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_idx" ON "users" ("username");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_custom_email_idx" ON "users" ("custom_email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");