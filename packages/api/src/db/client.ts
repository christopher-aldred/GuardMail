/**
 * Drizzle client setup.
 *
 * Reads DATABASE_URL from the environment and exports a singleton
 * `db` instance plus the underlying `pool`.
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://postgres:guardmail_dev@localhost:5432/guardmail';

// Max connections tuned for Railway-small deployment.
export const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });

export { schema };

export async function closeDb(): Promise<void> {
  await client.end();
}

/**
 * Lightweight startup migration — creates tables/columns that may not
 * exist yet using idempotent raw SQL. This avoids the need for the
 * drizzle migrations folder at runtime.
 */
export async function ensureSchema(): Promise<void> {
  await client`
    CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL,
      "token_hash" varchar(128) NOT NULL,
      "expires_at" timestamp with time zone NOT NULL,
      "used_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "password_reset_tokens_user_id_users_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
        ON DELETE cascade ON UPDATE no action
    )
  `;
  await client`
    CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_token_hash_idx"
      ON "password_reset_tokens" ("token_hash")
  `;
  await client`
    CREATE INDEX IF NOT EXISTS "password_reset_user_idx"
      ON "password_reset_tokens" ("user_id")
  `;
  // Add password_changed_at column if it doesn't exist yet.
  await client`
    ALTER TABLE "users" 
    ADD COLUMN IF NOT EXISTS "password_changed_at" timestamp with time zone DEFAULT now() NOT NULL
  `;
  // Add 'scanning' status to the email_status enum for the holding space.
  // IF NOT EXISTS requires Postgres 12+.
  await client`
    ALTER TYPE "email_status" ADD VALUE IF NOT EXISTS 'scanning'
  `;
  // Subscription tiers (Free / Hobby / Pro / Custom).
  // First migrate any existing DB from the old enum
  // (free/starter/hobby/pro/custom) to the new enum
  // (free/hobby/pro/custom). Postgres cannot remove or rename enum
  // values, so we rebuild the type with a fresh column + CASE mapping.
  // The DO block is transactional: if any statement fails, all changes
  // roll back and the old enum is left untouched, so this is safe to
  // retry on every startup.
  await client`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'tier' AND e.enumlabel = 'starter'
      ) THEN
        -- Old enum present — migrate to the new value set.
        -- Mapping: free→free, starter→hobby, hobby→pro, pro→custom, custom→custom
        CREATE TYPE "tier_new" AS ENUM ('free', 'hobby', 'pro', 'custom');
        ALTER TABLE "users" ADD COLUMN "tier_new" "tier_new";
        UPDATE "users" SET "tier_new" = CASE "tier"
          WHEN 'free'    THEN 'free'::"tier_new"
          WHEN 'starter' THEN 'hobby'::"tier_new"
          WHEN 'hobby'   THEN 'pro'::"tier_new"
          WHEN 'pro'     THEN 'custom'::"tier_new"
          WHEN 'custom'  THEN 'custom'::"tier_new"
        END;
        ALTER TABLE "users" DROP COLUMN "tier";
        DROP TYPE "tier";
        ALTER TABLE "users" RENAME COLUMN "tier_new" TO "tier";
        ALTER TYPE "tier_new" RENAME TO "tier";
        ALTER TABLE "users" ALTER COLUMN "tier" SET NOT NULL;
        ALTER TABLE "users" ALTER COLUMN "tier" SET DEFAULT 'free';
      END IF;
    END $$
  `;
  await client`
    DO $$ BEGIN
      CREATE TYPE "tier" AS ENUM ('free', 'hobby', 'pro', 'custom');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `;
  await client`
    ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "tier" "tier" NOT NULL DEFAULT 'free'
  `;
  // Email verification + send-limit support.
  await client`
    ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone
  `;
  await client`
    ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "email_verify_token_hash" varchar(128)
  `;
  // User role + last login (admin stats support).
  await client`
    DO $$ BEGIN
      CREATE TYPE "user_role" AS ENUM ('user', 'admin');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `;
  await client`
    ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "role" "user_role" NOT NULL DEFAULT 'user'
  `;
  await client`
    ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone
  `;
  // Admin-disable flag (admin can suspend accounts without deleting them).
  await client`
    ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "disabled" boolean NOT NULL DEFAULT false
  `;
  // Custom domain association (hobby + pro + custom tiers only).
  await client`
    ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "custom_domain" varchar(255)
  `;
  await client`
    ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "custom_domain_status" varchar(16)
  `;
  await client`
    ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "custom_domain_resend_id" varchar(128)
  `;
  await client`
    ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "custom_domain_records" jsonb
  `;
  await client`
    ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "custom_domain_verified_at" timestamp with time zone
  `;
  // Per-user outbound LLM Guard toggle (defaults to true = scan outbound).
  await client`
    ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "llm_guard_outbound_enabled" boolean NOT NULL DEFAULT true
  `;
  // Promote the operator account to admin when ADMIN_EMAIL is set.
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    const updated = await client`
      UPDATE "users" SET "role" = 'admin', "updated_at" = now()
      WHERE "email" = ${adminEmail} AND "role" <> 'admin'
    `;
    if (updated.count > 0) {
      console.log(`[db] Promoted ${adminEmail} to admin role`);
    }
  }
  console.log('[db] Schema ensured (password_reset_tokens, password_changed_at, scanning status, email verification, tier, user_role, last_login_at, disabled, custom_domain, llm_guard_outbound_enabled)');
}