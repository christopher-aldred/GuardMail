-- Per-user outbound LLM Guard toggle.
-- When false, outbound emails skip the LLM Guard prompt-injection / toxicity
-- scan. Inbound scanning is always on. Defaults to true so the safer
-- behaviour is the default. Idempotent: safe to run whether or not the
-- column already exists (also added by `ensureSchema` at runtime).

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "llm_guard_outbound_enabled" boolean NOT NULL DEFAULT true;
