/**
 * Repository layer for Guardmail.
 *
 * Thin data-access functions over the Drizzle client. Each repository
 * owns one domain entity and exposes CRUD operations used by the API
 * routes and email processor.
 */
import 'dotenv/config';
import { and, desc, eq, inArray, lt, gte, count, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db, schema } from './client';
import type {
  EmailStatus,
  ScannerName,
  SpamSensitivity,
  ResendDomainRecord,
  CustomDomainStatus,
} from '@guardmail/shared';

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const userRepository = {
  async create(input: {
    username: string;
    email: string;
    customEmail: string;
    passwordHash: string;
    apiKey?: string;
    emailVerifyTokenHash?: string | null;
    tier?: 'free' | 'hobby' | 'pro' | 'custom';
    role?: 'user' | 'admin';
  }) {
    const [row] = await db
      .insert(schema.users)
      .values({
        id: uuid(),
        username: input.username,
        email: input.email,
        customEmail: input.customEmail,
        passwordHash: input.passwordHash,
        apiKey: input.apiKey,
        emailVerifyTokenHash: input.emailVerifyTokenHash,
        tier: input.tier ?? 'free',
        role: input.role ?? 'user',
      })
      .returning();
    return row;
  },

  async findById(id: string) {
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    return row ?? null;
  },

  async findByUsername(username: string) {
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .limit(1);
    return row ?? null;
  },

  async findByEmail(email: string) {
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    return row ?? null;
  },

  async findByCustomEmail(customEmail: string) {
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.customEmail, customEmail))
      .limit(1);
    return row ?? null;
  },

  async findByApiKey(apiKey: string) {
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.apiKey, apiKey))
      .limit(1);
    return row ?? null;
  },

  /** Find a user by their associated (verified or pending) custom domain. */
  async findByCustomDomain(domain: string) {
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.customDomain, domain))
      .limit(1);
    return row ?? null;
  },

  async findByEmailVerifyToken(tokenHash: string) {
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.emailVerifyTokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  },

  async setEmailVerified(userId: string) {
    const [row] = await db
      .update(schema.users)
      .set({
        emailVerifiedAt: new Date(),
        emailVerifyTokenHash: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId))
      .returning();
    return row;
  },

  async setEmailVerifyToken(userId: string, tokenHash: string) {
    const [row] = await db
      .update(schema.users)
      .set({ emailVerifyTokenHash: tokenHash, updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
      .returning();
    return row;
  },

  async setApiKey(userId: string, apiKey: string) {
    const [row] = await db
      .update(schema.users)
      .set({ apiKey, updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
      .returning();
    return row;
  },

  async updatePassword(userId: string, passwordHash: string) {
    const [row] = await db
      .update(schema.users)
      .set({ passwordHash, passwordChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
      .returning();
    return row;
  },

  async updateTier(userId: string, tier: 'free' | 'hobby' | 'pro' | 'custom') {
    const [row] = await db
      .update(schema.users)
      .set({ tier, updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
      .returning();
    return row;
  },

  /**
   * Associate a custom domain with the account and store the Resend
   * domain resource id + the DNS records the user must publish. The
   * domain starts in `pending` status; `customEmail` is NOT changed yet
   * (it only switches to <username>@<domain> once verified).
   */
  async setCustomDomain(
    userId: string,
    domain: string,
    resendId: string,
    records: ResendDomainRecord[],
  ) {
    const [row] = await db
      .update(schema.users)
      .set({
        customDomain: domain,
        customDomainStatus: 'pending' as CustomDomainStatus,
        customDomainResendId: resendId,
        customDomainRecords: records,
        customDomainVerifiedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId))
      .returning();
    return row;
  },

  /**
   * Mark the account's custom domain as verified and switch the custom
   * email address to <username>@<domain> so inbound mail routes here and
   * outbound mail is sent from the branded address.
   */
  async verifyCustomDomain(userId: string, customEmail: string) {
    const [row] = await db
      .update(schema.users)
      .set({
        customDomainStatus: 'verified' as CustomDomainStatus,
        customDomainVerifiedAt: new Date(),
        customEmail,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId))
      .returning();
    return row;
  },

  /**
   * Update only the stored DNS records / status for a pending domain
   * (e.g. after polling Resend for the latest verification state).
   */
  async updateCustomDomainStatus(
    userId: string,
    status: CustomDomainStatus,
    records?: ResendDomainRecord[],
  ) {
    const [row] = await db
      .update(schema.users)
      .set({
        customDomainStatus: status,
        ...(records ? { customDomainRecords: records } : {}),
        ...(status === 'verified' ? { customDomainVerifiedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId))
      .returning();
    return row;
  },

  /**
   * Remove the custom domain association and revert the custom email to
   * <username>@<defaultDomain>. Used when a user removes their domain or
   * downgrades out of a domain-eligible tier.
   */
  async clearCustomDomain(userId: string, defaultCustomEmail: string) {
    const [row] = await db
      .update(schema.users)
      .set({
        customDomain: null,
        customDomainStatus: null,
        customDomainResendId: null,
        customDomainRecords: null,
        customDomainVerifiedAt: null,
        customEmail: defaultCustomEmail,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId))
      .returning();
    return row;
  },

  async setRole(userId: string, role: 'user' | 'admin') {
    const [row] = await db
      .update(schema.users)
      .set({ role, updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
      .returning();
    return row;
  },

  async setLastLogin(userId: string) {
    const [row] = await db
      .update(schema.users)
      .set({ lastLoginAt: new Date() })
      .where(eq(schema.users.id, userId))
      .returning();
    return row;
  },

  /**
   * Toggle per-user outbound LLM Guard scanning. When false, outbound
   * (sent) emails skip the LLM Guard prompt-injection / toxicity scan.
   * Inbound scanning is always on. Returns the updated user row.
   */
  async setLlmGuardOutboundEnabled(userId: string, enabled: boolean) {
    const [row] = await db
      .update(schema.users)
      .set({ llmGuardOutboundEnabled: enabled, updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
      .returning();
    return row ?? null;
  },


  async delete(userId: string) {
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  },

  /** Disable an account (admin action) — blocks login but preserves data. */
  async setDisabled(userId: string, disabled: boolean) {
    const [row] = await db
      .update(schema.users)
      .set({ disabled, updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
      .returning();
    return row ?? null;
  },

  /** Total number of user accounts (any role). */
  async countAll() {
    const [row] = await db
      .select({ n: count() })
      .from(schema.users);
    return Number(row?.n ?? 0);
  },

  /**
   * Paginated list of all users sorted by most recent login (nulls last).
   * Returns raw rows — callers must strip secrets before returning to
   * clients.
   */
  async listRecent(limit = 10, offset = 0) {
    return db
      .select()
      .from(schema.users)
      .orderBy(
        sql`COALESCE(${schema.users.lastLoginAt}, 'epoch'::timestamptz) DESC NULLS FIRST`,
        desc(schema.users.createdAt),
      )
      .limit(limit)
      .offset(offset);
  },

  /** Count users who have logged in at least once since `since`. Used by the admin logins listing. */
  async listLoginsSince(since: Date, limit = 10, offset = 0) {
    return db
      .select()
      .from(schema.users)
      .where(gte(schema.users.lastLoginAt, since))
      .orderBy(desc(schema.users.lastLoginAt))
      .limit(limit)
      .offset(offset);
  },

  /** Count users who have logged in at least once since `since`. */
  async countLoginsSince(since: Date) {
    const [row] = await db
      .select({ n: count() })
      .from(schema.users)
      .where(gte(schema.users.lastLoginAt, since));
    return Number(row?.n ?? 0);
  },

  /** Promote a user to admin by their registration email. Returns true if a row was updated. */
  async promoteToAdminByEmail(email: string) {
    const [row] = await db
      .update(schema.users)
      .set({ role: 'admin', updatedAt: new Date() })
      .where(eq(schema.users.email, email))
      .returning();
    return !!row;
  },
};

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

export const emailRepository = {
  async create(input: {
    userId: string;
    from: string;
    to: string[];
    subject: string;
    body: string;
    bodyHtml?: string;
    status: EmailStatus;
    threadId?: string;
    inReplyTo?: string;
  }) {
    const [row] = await db
      .insert(schema.emails)
      .values({
        id: uuid(),
        userId: input.userId,
        from: input.from,
        to: input.to,
        subject: input.subject,
        body: input.body,
        bodyHtml: input.bodyHtml,
        status: input.status,
        threadId: input.threadId,
        inReplyTo: input.inReplyTo,
      })
      .returning();
    return row;
  },

  async findById(id: string) {
    const [row] = await db
      .select()
      .from(schema.emails)
      .where(eq(schema.emails.id, id))
      .limit(1);
    return row ?? null;
  },

  async listByUserStatus(userId: string, status: EmailStatus, limit = 50, offset = 0) {
    return db
      .select()
      .from(schema.emails)
      .where(
        and(eq(schema.emails.userId, userId), eq(schema.emails.status, status)),
      )
      .orderBy(desc(schema.emails.createdAt))
      .limit(limit)
      .offset(offset);
  },

  async listByUser(userId: string, limit = 50, offset = 0) {
    return db
      .select()
      .from(schema.emails)
      .where(eq(schema.emails.userId, userId))
      .orderBy(desc(schema.emails.createdAt))
      .limit(limit)
      .offset(offset);
  },

  async updateStatus(id: string, status: EmailStatus) {
    const [row] = await db
      .update(schema.emails)
      .set({ status })
      .where(eq(schema.emails.id, id))
      .returning();
    return row;
  },

  async markRead(id: string) {
    const [row] = await db
      .update(schema.emails)
      .set({ readAt: new Date() })
      .where(eq(schema.emails.id, id))
      .returning();
    return row;
  },

  async delete(id: string) {
    await db.delete(schema.emails).where(eq(schema.emails.id, id));
  },

  /**
   * Count all emails belonging to a user — both inbound (received) and
   * outbound (sent). Resend counts every received email against the same
   * transactional quota as sent emails, so tier limits apply to the
   * combined volume. `since` is optional — when omitted the count is over
   * all time (used for the unverified lifetime cap).
   */
  async countByUser(userId: string, since?: Date) {
    const conditions = [eq(schema.emails.userId, userId)];
    if (since) conditions.push(gte(schema.emails.createdAt, since));
    const [row] = await db
      .select({ n: count() })
      .from(schema.emails)
      .where(and(...conditions));
    return Number(row?.n ?? 0);
  },

  /**
   * Count outbound emails (sent by the user from their custom address).
   * Kept for the unverified-account lifetime cap, which only restricts
   * *sending*.
   */
  async countOutboundByUser(userId: string, since?: Date) {
    const conditions = [
      eq(schema.emails.userId, userId),
      // Outbound mail is addressed from the user's own custom address.
      eq(schema.emails.from, schema.users.customEmail),
    ];
    if (since) conditions.push(gte(schema.emails.createdAt, since));
    const [row] = await db
      .select({ n: count() })
      .from(schema.emails)
      .innerJoin(schema.users, eq(schema.emails.userId, schema.users.id))
      .where(and(...conditions));
    return Number(row?.n ?? 0);
  },

  /** Global count of successfully delivered outbound emails (status 'sent'). */
  async countSent(since?: Date) {
    const conditions = [eq(schema.emails.status, 'sent')];
    if (since) conditions.push(gte(schema.emails.createdAt, since));
    const [row] = await db
      .select({ n: count() })
      .from(schema.emails)
      .where(and(...conditions));
    return Number(row?.n ?? 0);
  },

  /** Global count of inbound emails (inbox + spam + quarantine — i.e. received & processed). */
  async countReceived(since?: Date) {
    const conditions = [
      inArray(schema.emails.status, ['inbox', 'spam', 'quarantine']),
    ];
    if (since) conditions.push(gte(schema.emails.createdAt, since));
    const [row] = await db
      .select({ n: count() })
      .from(schema.emails)
      .where(and(...conditions));
    return Number(row?.n ?? 0);
  },

  /** Paginated list of all outbound (sent) emails, newest first, with the owning username + custom email. */
  async listSentWithUser(limit = 10, offset = 0) {
    return db
      .select({
        email: schema.emails,
        username: schema.users.username,
        customEmail: schema.users.customEmail,
      })
      .from(schema.emails)
      .innerJoin(schema.users, eq(schema.emails.userId, schema.users.id))
      .where(eq(schema.emails.status, 'sent'))
      .orderBy(desc(schema.emails.createdAt))
      .limit(limit)
      .offset(offset);
  },

  /** Paginated list of all inbound (received) emails, newest first, with the owning username + custom email. */
  async listReceivedWithUser(limit = 10, offset = 0) {
    return db
      .select({
        email: schema.emails,
        username: schema.users.username,
        customEmail: schema.users.customEmail,
      })
      .from(schema.emails)
      .innerJoin(schema.users, eq(schema.emails.userId, schema.users.id))
      .where(inArray(schema.emails.status, ['inbox', 'spam', 'quarantine']))
      .orderBy(desc(schema.emails.createdAt))
      .limit(limit)
      .offset(offset);
  },
};

// ---------------------------------------------------------------------------
// Scan Results
// ---------------------------------------------------------------------------

export const scanResultRepository = {
  async create(input: {
    emailId: string;
    attachmentId?: string;
    scanner: ScannerName;
    passed: boolean;
    riskScore: number;
    details: string;
    scannerVersion?: string;
  }) {
    const [row] = await db
      .insert(schema.scanResults)
      .values({
        id: uuid(),
        emailId: input.emailId,
        attachmentId: input.attachmentId,
        scanner: input.scanner,
        passed: input.passed,
        riskScore: input.riskScore,
        details: input.details,
        scannerVersion: input.scannerVersion,
      })
      .returning();
    return row;
  },

  async listByEmail(emailId: string) {
    return db
      .select()
      .from(schema.scanResults)
      .where(eq(schema.scanResults.emailId, emailId))
      .orderBy(desc(schema.scanResults.scannedAt));
  },

  async listByEmails(emailIds: string[]) {
    if (emailIds.length === 0) return [];
    return db
      .select()
      .from(schema.scanResults)
      .where(inArray(schema.scanResults.emailId, emailIds));
  },
};

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export const attachmentRepository = {
  async create(input: {
    emailId: string;
    filename: string;
    mimeType: string;
    size: number;
    storagePath?: string;
    content?: string | null;
  }) {
    const [row] = await db
      .insert(schema.attachments)
      .values({
        id: uuid(),
        emailId: input.emailId,
        filename: input.filename,
        mimeType: input.mimeType,
        size: input.size,
        storagePath: input.storagePath ?? '',
        content: input.content ?? null,
      })
      .returning();
    return row;
  },

  async findById(id: string) {
    const [row] = await db
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.id, id))
      .limit(1);
    return row ?? null;
  },

  async listByEmail(emailId: string) {
    return db
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.emailId, emailId));
  },

  async delete(id: string) {
    await db.delete(schema.attachments).where(eq(schema.attachments.id, id));
  },
};

// ---------------------------------------------------------------------------
// Spam Filter Config
// ---------------------------------------------------------------------------

export const spamFilterConfigRepository = {
  async findByUser(userId: string) {
    const [row] = await db
      .select()
      .from(schema.spamFilterConfigs)
      .where(eq(schema.spamFilterConfigs.userId, userId))
      .limit(1);
    return row ?? null;
  },

  async create(input: {
    userId: string;
    enabled: boolean;
    sensitivity: SpamSensitivity;
    allowlist: string[];
    blocklist: string[];
    keywordRules: { keyword: string; action: 'flag' | 'block'; score: number }[];
    blockContentTypes: string[];
  }) {
    const [row] = await db
      .insert(schema.spamFilterConfigs)
      .values({
        id: uuid(),
        userId: input.userId,
        enabled: input.enabled,
        sensitivity: input.sensitivity,
        allowlist: input.allowlist,
        blocklist: input.blocklist,
        keywordRules: input.keywordRules,
        blockContentTypes: input.blockContentTypes,
      })
      .returning();
    return row;
  },

  /** Create a default config for a newly-registered user. */
  async createDefault(userId: string) {
    return this.create({
      userId,
      enabled: true,
      sensitivity: 'medium',
      allowlist: [],
      blocklist: [],
      keywordRules: [],
      blockContentTypes: [],
    });
  },

  async update(
    userId: string,
    input: {
      enabled?: boolean;
      sensitivity?: SpamSensitivity;
      allowlist?: string[];
      blocklist?: string[];
      keywordRules?: {
        keyword: string;
        action: 'flag' | 'block';
        score: number;
      }[];
      blockContentTypes?: string[];
    },
  ) {
    const [row] = await db
      .update(schema.spamFilterConfigs)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.spamFilterConfigs.userId, userId))
      .returning();
    return row;
  },
};

// ---------------------------------------------------------------------------
// Password Reset Tokens
// ---------------------------------------------------------------------------

export const passwordResetTokenRepository = {
  async create(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    const [row] = await db
      .insert(schema.passwordResetTokens)
      .values({
        id: uuid(),
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      })
      .returning();
    return row;
  },

  async findByToken(tokenHash: string) {
    const [row] = await db
      .select()
      .from(schema.passwordResetTokens)
      .where(eq(schema.passwordResetTokens.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  },

  async markUsed(id: string) {
    const [row] = await db
      .update(schema.passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(schema.passwordResetTokens.id, id))
      .returning();
    return row;
  },

  async deleteExpired() {
    await db
      .delete(schema.passwordResetTokens)
      .where(lt(schema.passwordResetTokens.expiresAt, new Date()));
  },
};