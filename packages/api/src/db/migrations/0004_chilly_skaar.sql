-- Custom domain association (hobby + pro + custom tiers).
-- Idempotent: every statement guards against pre-existence so it is safe
-- to run whether or not `ensureSchema` has already added the columns.
-- Also backfills the user_role enum + role / last_login_at columns that
-- were previously only added by `ensureSchema` (snapshot drift).

DO $$ BEGIN
  CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "public"."tier" ADD VALUE IF NOT EXISTS 'starter';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" "user_role" DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "custom_domain" varchar(255);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "custom_domain_status" varchar(16);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "custom_domain_resend_id" varchar(128);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "custom_domain_records" jsonb;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "custom_domain_verified_at" timestamp with time zone;