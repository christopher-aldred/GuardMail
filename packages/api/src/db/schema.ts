/**
 * Guardmail Database Schema (Drizzle ORM + PostgreSQL)
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const emailStatusEnum = pgEnum('email_status', [
  'inbox',
  'spam',
  'quarantine',
  'sent',
  'draft',
  'pending',
  'scanning',
]);

export const spamSensitivityEnum = pgEnum('spam_sensitivity', [
  'low',
  'medium',
  'high',
  'custom',
]);

export const tierEnum = pgEnum('tier', [
  'free',
  'hobby',
  'pro',
  'custom',
]);

export const scannerNameEnum = pgEnum('scanner_name', [
  'llm-guard',
  'clamav',
  'spam-filter',
]);

export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    username: varchar('username', { length: 64 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    customEmail: varchar('custom_email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    apiKey: varchar('api_key', { length: 128 }),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    emailVerifyTokenHash: varchar('email_verify_token_hash', { length: 128 }),
    tier: tierEnum('tier').notNull().default('free'),
    role: userRoleEnum('role').notNull().default('user'),
    disabled: boolean('disabled').notNull().default(false),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    // --- Custom domain association (hobby + pro + custom tiers) ---
    customDomain: varchar('custom_domain', { length: 255 }),
    customDomainStatus: varchar('custom_domain_status', { length: 16 }),
    customDomainResendId: varchar('custom_domain_resend_id', { length: 128 }),
    customDomainRecords: jsonb('custom_domain_records').$type<
      import('@guardmail/shared').ResendDomainRecord[] | null
    >(),
    customDomainVerifiedAt: timestamp('custom_domain_verified_at', {
      withTimezone: true,
    }),
    // --- Outbound LLM Guard toggle (per-user) ---
    // When false, outbound emails skip the LLM Guard prompt-injection /
    // toxicity scan. Inbound scanning is always on. Defaults to true so
    // the safer behaviour is the default.
    llmGuardOutboundEnabled: boolean('llm_guard_outbound_enabled')
      .notNull()
      .default(true),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    usernameIdx: uniqueIndex('users_username_idx').on(t.username),
    customEmailIdx: uniqueIndex('users_custom_email_idx').on(t.customEmail),
    emailIdx: index('users_email_idx').on(t.email),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  emails: many(emails),
  spamConfig: many(spamFilterConfigs),
}));

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

export const emails = pgTable(
  'emails',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    from: varchar('from_address', { length: 255 }).notNull(),
    to: jsonb('to_addresses').notNull().$type<string[]>(),
    subject: varchar('subject', { length: 500 }).notNull().default(''),
    body: text('body').notNull().default(''),
    bodyHtml: text('body_html'),
    status: emailStatusEnum('status').notNull().default('inbox'),
    threadId: uuid('thread_id'),
    inReplyTo: uuid('in_reply_to'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => ({
    userStatusIdx: index('emails_user_status_idx').on(t.userId, t.status),
    threadIdx: index('emails_thread_idx').on(t.threadId),
    createdIdx: index('emails_created_idx').on(t.createdAt),
  }),
);

export const emailsRelations = relations(emails, ({ one, many }) => ({
  user: one(users, { fields: [emails.userId], references: [users.id] }),
  scanResults: many(scanResults),
  attachments: many(attachments),
}));

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    emailId: uuid('email_id')
      .notNull()
      .references(() => emails.id, { onDelete: 'cascade' }),
    filename: varchar('filename', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 127 }).notNull(),
    size: integer('size').notNull(),
    storagePath: varchar('storage_path', { length: 512 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    emailIdx: index('attachments_email_idx').on(t.emailId),
  }),
);

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  email: one(emails, { fields: [attachments.emailId], references: [emails.id] }),
}));

// ---------------------------------------------------------------------------
// Scan Results
// ---------------------------------------------------------------------------

export const scanResults = pgTable(
  'scan_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    emailId: uuid('email_id')
      .notNull()
      .references(() => emails.id, { onDelete: 'cascade' }),
    attachmentId: uuid('attachment_id').references(() => attachments.id, {
      onDelete: 'cascade',
    }),
    scanner: scannerNameEnum('scanner').notNull(),
    passed: boolean('passed').notNull(),
    riskScore: real('risk_score').notNull(),
    details: text('details').notNull().default(''),
    scannerVersion: varchar('scanner_version', { length: 32 }),
    scannedAt: timestamp('scanned_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    emailIdx: index('scan_results_email_idx').on(t.emailId),
  }),
);

export const scanResultsRelations = relations(scanResults, ({ one }) => ({
  email: one(emails, { fields: [scanResults.emailId], references: [emails.id] }),
}));

// ---------------------------------------------------------------------------
// Spam Filter Config (1:1 with user)
// ---------------------------------------------------------------------------

export const spamFilterConfigs = pgTable(
  'spam_filter_configs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull().default(true),
    sensitivity: spamSensitivityEnum('sensitivity').notNull().default('medium'),
    allowlist: jsonb('allowlist').notNull().$type<string[]>().default([]),
    blocklist: jsonb('blocklist').notNull().$type<string[]>().default([]),
    keywordRules: jsonb('keyword_rules')
      .notNull()
      .$type<
        { keyword: string; action: 'flag' | 'block'; score: number }[]
      >()
      .default([]),
    blockContentTypes: jsonb('block_content_types')
      .notNull()
      .$type<string[]>()
      .default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    userUq: uniqueIndex('spam_config_user_idx').on(t.userId),
  }),
);

export const spamFilterConfigsRelations = relations(spamFilterConfigs, ({ one }) => ({
  user: one(users, {
    fields: [spamFilterConfigs.userId],
    references: [users.id],
  }),
}));

// ---------------------------------------------------------------------------
// Password Reset Tokens
// ---------------------------------------------------------------------------

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex('password_reset_token_hash_idx').on(t.tokenHash),
    userIdx: index('password_reset_user_idx').on(t.userId),
  }),
);

export const passwordResetTokensRelations = relations(
  passwordResetTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [passwordResetTokens.userId],
      references: [users.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// Export inferred types for convenience
// ---------------------------------------------------------------------------

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type EmailRow = typeof emails.$inferSelect;
export type NewEmailRow = typeof emails.$inferInsert;
export type AttachmentRow = typeof attachments.$inferSelect;
export type NewAttachmentRow = typeof attachments.$inferInsert;
export type ScanResultRow = typeof scanResults.$inferSelect;
export type NewScanResultRow = typeof scanResults.$inferInsert;
export type SpamFilterConfigRow = typeof spamFilterConfigs.$inferSelect;
export type NewSpamFilterConfigRow = typeof spamFilterConfigs.$inferInsert;
export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetTokenRow = typeof passwordResetTokens.$inferInsert;