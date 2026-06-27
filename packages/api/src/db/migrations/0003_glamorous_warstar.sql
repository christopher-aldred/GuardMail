-- Subscription tiers (Free / Starter / Hobby / Pro / Custom).
DO $$ BEGIN
 CREATE TYPE "public"."tier" AS ENUM('free', 'starter', 'hobby', 'pro', 'custom');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- If the enum already exists without 'starter', add it (must run before
-- any DEFAULT 'free' is applied; new values append at the end).
DO $$ BEGIN
  ALTER TYPE "public"."tier" ADD VALUE IF NOT EXISTS 'starter';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tier" "tier" DEFAULT 'free' NOT NULL;