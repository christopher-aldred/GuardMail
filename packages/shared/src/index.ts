/**
 * Guardmail Shared Types and Utilities
 *
 * Common TypeScript interfaces and types used across all packages
 * (API server, MCP server, web UI).
 */

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export type UserRole = "user" | "admin";

export interface User {
	id: string; // UUID
	username: string; // Unique username
	email: string; // User's registration email
	customEmail: string; // <username>@<domain>
	passwordHash: string; // bcrypt hash (never returned to clients)
	apiKey?: string; // MCP server API key
	emailVerifiedAt?: Date | null; // When the registration email was verified
	emailVerifyTokenHash?: string | null; // Hash of the current verification token (never returned)
	tier: Tier; // Subscription tier
	role: UserRole; // Authorization role
	disabled: boolean; // Admin-disabled accounts cannot log in
	lastLoginAt?: Date | null; // Last successful login timestamp
	// --- Custom domain (hobby + pro + custom tiers only) ---
	customDomain?: string | null; // Associated custom domain
	customDomainStatus?: CustomDomainStatus | null; // Verification status
	customDomainResendId?: string | null; // Resend domain resource id
	customDomainRecords?: ResendDomainRecord[] | null; // DNS records to publish
	customDomainVerifiedAt?: Date | null; // When the domain was verified
	// --- Outbound LLM Guard toggle (per-user) ---
	// When false, outbound emails skip the LLM Guard prompt-injection /
	// toxicity scan. Inbound scanning is always on. Defaults to true.
	llmGuardOutboundEnabled?: boolean;
	createdAt: Date;
	updatedAt: Date;
}

/** User shape returned by API/MCP (no secrets). */
export type UserPublic = Omit<
	User,
	"passwordHash" | "apiKey" | "emailVerifyTokenHash"
>;

// ---------------------------------------------------------------------------
// Subscription Tiers
// ---------------------------------------------------------------------------
//
// Pricing is a simple per-1,000-email rate (GBP pence), capped at the
// tier's monthly allowance (price ÷ rate). Each tier's allowance is a
// COMBINED inbound + outbound budget: Resend counts every received email
// against the same transactional quota as sent emails, so the per-1,000
// rate below covers both directions.
//
//   - Free:    £0     (3,000 emails/mo combined, 100/day)
//   - Hobby:   £1.40 / 1k emails (cap 18,000/mo, 600/day)   → £25/mo
//   - Pro:     £1.20 / 1k emails (cap 42,000/mo, 2,000/day) → £50/mo
//   - Custom: contact support
//
// Each bump up is slightly cheaper per 1,000 emails (volume discount).
// resendCostCents tracks the real Resend plan cost (USD) for the same
// combined quota: Free $0/3k, Pro $20/50k, Scale $90/100k.

export type Tier = "free" | "hobby" | "pro" | "custom";

export interface TierConfig {
	id: Tier;
	name: string;
	/** Combined inbound + outbound monthly allowance, or null for “unlimited / contact us”. */
	monthlyLimit: number | null;
	/** Daily email cap (combined in + out). */
	dailyLimit: number;
	/** Price in GBP pence per month, or null for “contact us”. */
	priceCents: number | null;
	/** Per-1,000-email rate in GBP pence, for display. null for Free/Custom. */
	ratePerKCents: number | null;
	/** Real Resend plan cost in USD cents per month (for transparency). */
	resendCostCents: number | null;
	/** Whether new sign-ups can select this tier today. */
	available: boolean;
	/** Hidden tiers exist in the enum for legacy accounts but are not shown in the UI. */
	hidden: boolean;
	/** Whether this tier can associate a custom domain with the account. */
	customDomain: boolean;
	/** Whether outbound emails carry the Guardmail branding footer. */
	hasBrandingFooter: boolean;
	blurb: string;
	features: string[];
}

export const TIERS: Record<Tier, TierConfig> = {
	free: {
		id: "free",
		name: "Free",
		monthlyLimit: 3000,
		dailyLimit: 100,
		priceCents: 0, // £0 (Resend Free 3k combined)
		ratePerKCents: null,
		resendCostCents: 0,
		available: true,
		hidden: false,
		customDomain: false,
		hasBrandingFooter: true,
		blurb: "Perfect for trying out secure AI-agent email.",
		features: [
			"3,000 emails / month",
			"100 emails / day",
			"LLM Guard prompt-injection scanning",
			"ClamAV virus scanning",
			"Spam filter + quarantine",
			"MCP server access",
		],
	},
	hobby: {
		id: "hobby",
		name: "Hobby",
		monthlyLimit: 18_000,
		dailyLimit: 600,
		priceCents: 2500, // £25/mo (18k × £1.40/1k ≈ £25.20, rounded to £25)
		ratePerKCents: 140, // £1.40 / 1k emails
		resendCostCents: 1000,
		available: true,
		hidden: false,
		customDomain: true,
		hasBrandingFooter: false,
		blurb: "For makers sending and receiving more than the free allowance.",
		features: [
			"18,000 emails / month",
			"600 emails / day",
			"Everything in Free",
			"Custom domain",
			"No branding footer",
			"Priority scan queue",
		],
	},
	pro: {
		id: "pro",
		name: "Pro",
		monthlyLimit: 42_000,
		dailyLimit: 2000,
		priceCents: 5000, // £50/mo (42k × £1.20/1k)
		ratePerKCents: 120, // £1.20 / 1k emails
		resendCostCents: 2000,
		available: true,
		hidden: false,
		customDomain: true,
		hasBrandingFooter: false,
		blurb: "For side-projects and personal automation that sends more.",
		features: [
			"42,000 emails / month",
			"2,000 emails / day",
			"Everything in Hobby",
			"Custom domain",
			"No branding footer",
			"Priority scan queue",
		],
	},
	custom: {
		id: "custom",
		name: "Custom",
		monthlyLimit: null,
		dailyLimit: Infinity,
		priceCents: null,
		ratePerKCents: null,
		resendCostCents: null,
		available: false,
		hidden: false,
		customDomain: true,
		hasBrandingFooter: false,
		blurb: "Volume, SLAs, and custom security policies.",
		features: [
			"Custom monthly volume",
			"Custom daily cap",
			"Everything in Pro",
			"Custom domain",
			"No branding footer",
			"Dedicated support",
			"Custom scan policies",
		],
	},
};

export const TIER_ORDER: Tier[] = ["free", "hobby", "pro", "custom"];

// ---------------------------------------------------------------------------
// Branding footer (Free tier only — removed on hobby + pro + custom)
// ---------------------------------------------------------------------------
//
// Outbound emails sent from Free-tier accounts carry a short Guardmail
// branding footer. Removing the footer is a benefit of the paid tiers.
// The footer is appended at delivery time, AFTER LLM Guard scanning, so
// it never forms part of the user-authored content that is scanned.

export const BRANDING_FOOTER_TEXT =
	"\n\n---\nSent via AI Guard Mail — secure AI-agent email with LLM Guard " +
	"prompt-injection & virus scanning. https://aiguard.email";

export const BRANDING_FOOTER_HTML =
	'<hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0">' +
	'<p style="font-family:sans-serif;color:#94a3b8;font-size:12px;margin:0">' +
	'Sent via <a href="https://aiguard.email" style="color:#2563eb">AI Guard Mail</a> ' +
	'— secure AI-agent email with LLM Guard prompt-injection &amp; virus scanning.' +
	'</p>';

/**
 * Append the Guardmail branding footer to the plain-text and HTML bodies
 * when the sender's tier carries the footer (Free tier). Paid tiers that
 * remove branding receive the bodies unchanged.
 */
export function applyBrandingFooter(
	text: string,
	html: string | null | undefined,
	tier: Tier,
): { text: string; html: string | null | undefined } {
	if (!tierHasBrandingFooter(tier)) return { text, html };
	return {
		text: text + BRANDING_FOOTER_TEXT,
		html: html ? html + BRANDING_FOOTER_HTML : html,
	};
}

export const isTier = (v: unknown): v is Tier =>
	typeof v === "string" && v in TIERS;

/** True when the tier permits associating a custom domain with the account. */
export function tierAllowsCustomDomain(tier: Tier): boolean {
	return TIERS[tier]?.customDomain ?? false;
}

/** True when outbound emails on this tier carry the Guardmail branding footer. */
export function tierHasBrandingFooter(tier: Tier): boolean {
	return TIERS[tier]?.hasBrandingFooter ?? false;
}

// ---------------------------------------------------------------------------
// Custom domain association (hobby + pro + custom tiers)
// ---------------------------------------------------------------------------

export type CustomDomainStatus = "pending" | "verified" | "rejected";

export const isCustomDomainStatus = (
	v: unknown,
): v is CustomDomainStatus =>
	typeof v === "string" &&
	["pending", "verified", "rejected"].includes(v);

/** A DNS record the user must publish to verify a custom domain. */
export interface ResendDomainRecord {
	record: string; // e.g. "SPF" | "DKIM" | "MX" | "TRACKING"
	name: string; // Hostname (e.g. "send" or "@")
	type: string; // DNS record type ("TXT" | "CNAME" | "MX")
	value: string; // Record value
	priority?: number; // MX priority
	ttl?: number; // Seconds
}

/** Snapshot of the current custom-domain association for an account. */
export interface CustomDomainInfo {
	domain: string;
	status: CustomDomainStatus;
	resendId?: string | null;
	records?: ResendDomainRecord[] | null;
	verifiedAt?: Date | null;
	createdAt?: Date | null;
}

/** Subscription info returned by the API for the current user. */
export interface SubscriptionInfo {
	tier: Tier;
	name: string;
	monthlyLimit: number | null;
	dailyLimit: number;
	priceCents: number | null;
	available: boolean;
	/** Sent count so far this month (UTC). */
	sentThisMonth: number;
	/** Sent count so far today (UTC). */
	sentToday: number;
	/** Whether the registration email has been verified. */
	emailVerified: boolean;
	/** Registration email address (used for the resend-verification flow). */
	email: string;
	/**
	 * Lifetime outbound sending cap applied to unverified Free accounts
	 * (null when not applicable — i.e. verified users or paid tiers).
	 */
	unverifiedSendLimit: number | null;
	/** Total outbound emails sent (used against `unverifiedSendLimit`). */
	sentLifetimeOutbound: number;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export type EmailStatus =
	| "inbox"
	| "spam"
	| "quarantine"
	| "sent"
	| "draft"
	| "pending"
	| "scanning";

export interface Email {
	id: string; // UUID
	userId: string; // FK to User (owner of mailbox)
	from: string; // Sender email
	to: string[]; // Recipients
	subject: string;
	body: string; // Plaintext body
	bodyHtml?: string; // HTML version
	status: EmailStatus;
	threadId?: string; // Conversation grouping
	inReplyTo?: string; // Original message id for threading
	scanResults: ScanResult[];
	attachments: Attachment[];
	createdAt: Date;
	readAt?: Date;
}

export type EmailPublic = Omit<Email, "userId">;

// ---------------------------------------------------------------------------
// Scan Results
// ---------------------------------------------------------------------------

export type ScannerName = "llm-guard" | "clamav" | "spam-filter";

export interface ScanResult {
	id: string;
	emailId: string;
	scanner: ScannerName;
	passed: boolean;
	riskScore: number; // 0.0 - 1.0
	details: string; // Human-readable result
	scannerVersion?: string;
	scannedAt: Date;
}

/** LLM Guard scan response shape returned by the Python service. */
export interface LlmGuardScanResponse {
	sanitized_text: string;
	is_valid: boolean;
	results: Record<string, boolean>;
	risk_scores: Record<string, number>;
	scanners_used: string[];
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export interface Attachment {
	id: string;
	emailId: string;
	filename: string;
	mimeType: string;
	size: number; // bytes
	storagePath: string; // Path/key in object storage
	scanResult?: ScanResult;
	createdAt: Date;
}

// ---------------------------------------------------------------------------
// Spam Filter
// ---------------------------------------------------------------------------

export type SpamSensitivity = "low" | "medium" | "high" | "custom";

export interface KeywordRule {
	keyword: string;
	action: "flag" | "block";
	score: number; // Weight for this keyword (0.0 - 1.0)
}

export interface SpamFilterConfig {
	userId: string; // FK to User
	enabled: boolean;
	sensitivity: SpamSensitivity;
	allowlist: string[]; // Allowed sender emails
	blocklist: string[]; // Blocked sender emails
	keywordRules: KeywordRule[];
	blockContentTypes: string[]; // e.g. ['text/html']
	updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthTokens {
	token: string; // JWT
	expiresIn: string;
}

export interface AuthContext {
	user: UserPublic;
	token: string;
	/** True when the request authenticated via X-API-Key (MCP consumer). */
	isApiKey: boolean;
}

// ---------------------------------------------------------------------------
// Admin stats
// ---------------------------------------------------------------------------

export interface AdminStats {
	totalUsers: number;
	uniqueLogins24h: number;
	emailsSent: number;
	emailsReceived: number;
	emailsSent24h: number;
	emailsReceived24h: number;
}

/** A single user row in the admin user listing (no secrets). */
export interface AdminUserSummary {
	id: string;
	username: string;
	email: string;
	customEmail: string;
	tier: Tier;
	role: UserRole;
	disabled: boolean;
	emailVerified: boolean;
	lastLoginAt: string | null;
	createdAt: string;
}

export interface AdminUserList {
	users: AdminUserSummary[];
	total: number;
	page: number;
	limit: number;
}

/** A single email row in the admin email listing. */
export interface AdminEmailSummary {
	id: string;
	userId: string;
	username: string;
	customEmail: string;
	from: string;
	to: string[];
	subject: string;
	status: string;
	createdAt: string;
}

export interface AdminEmailList {
	emails: AdminEmailSummary[];
	total: number;
	page: number;
	limit: number;
}

// ---------------------------------------------------------------------------
// API Request / Response envelopes
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
	success: boolean;
	data?: T;
	error?: {
		code: string;
		message: string;
		details?: unknown;
	};
}

// ---------------------------------------------------------------------------
// LLM Guard / ClamAV sensitivity configuration
// ---------------------------------------------------------------------------

export interface ScannerConfig {
	llmGuard: {
		enabled: boolean;
		sensitivity: SpamSensitivity;
		scanners: string[]; // PromptInjection, JailbreakDetection, Toxicity, Anonymize
	};
	clamav: {
		enabled: boolean;
		maxFileSizeMb: number;
		timeoutMs: number;
	};
}

// ---------------------------------------------------------------------------
// Email Processing
// ---------------------------------------------------------------------------

export interface EmailQueueMessage {
	emailId: string;
	userId: string;
	receivedAt: Date;
	source: "smtp" | "api" | "mcp";
}

export type ScanVerdict =
	| "clean"
	| "llm-threat"
	| "virus"
	| "spam"
	| "scan-pending";

export interface EmailProcessingResult {
	emailId: string;
	verdict: ScanVerdict;
	finalStatus: EmailStatus;
	scanResults: ScanResult[];
}

// ---------------------------------------------------------------------------
// Validation helpers (re-exported so packages share schemas)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Security helpers (MCP consumer safety)
// ---------------------------------------------------------------------------
//
// The single most important invariant for the MCP consumer surface:
//
//   NEVER expose unscanned email content to an MCP consumer.
//
// Unscanned content may contain prompt-injection payloads that have not
// yet been evaluated by LLM Guard. Exposing them would let an attacker
// deliver an injection directly into the agent's context window.

/** Statuses that indicate an email has NOT finished security scanning. */
export const UNSCANNED_STATUSES: ReadonlySet<EmailStatus> = new Set([
	"scanning",
	"pending",
]);

/**
 * An email is considered "scanned" (safe to expose to an MCP consumer)
 * only when:
 *   1. Its status is NOT one of the holding/pending statuses, AND
 *   2. It has at least one persisted scan result.
 *
 * The scan-result check is defense-in-depth: the email processor writes
 * scan results *before* flipping the status to a terminal one, so a
 * scanned status should always carry results — but we verify anyway.
 */
export function isEmailScanned(
	email: { status: EmailStatus },
	scanResultCount: number,
): boolean {
	if (UNSCANNED_STATUSES.has(email.status)) return false;
	return scanResultCount > 0;
}

/**
 * Strip the message body (plain + HTML) from an email object.
 * Used to redact any email that slips through without scan results.
 * Returns a shallow copy with `body`/`bodyHtml` replaced by a notice.
 */
export function redactEmailBody<
	T extends { body: string; bodyHtml?: string | null },
>(email: T): T {
	return {
		...email,
		body: "[Content withheld: security scan incomplete.]",
		bodyHtml: null,
	};
}

/**
 * Redact content fields from a quarantined email before exposing it to an
 * MCP consumer (LLM agent).
 *
 * Quarantined emails are quarantined precisely *because* LLM Guard flagged
 * a prompt-injection / jailbreak payload in the subject, body, or HTML.
 * Returning those fields verbatim would hand the attacker a direct path
 * into the agent's context window. For MCP consumers we therefore:
 *   - replace `subject` with a generic "[Quarantined]" label,
 *   - replace `body` with a notice, and
 *   - drop `bodyHtml` entirely.
 *
 * Metadata the agent legitimately needs (sender, date, scan verdict,
 * risk score) is preserved so the user can still see *that* an email was
 * quarantined and why, without reading the payload.
 */
export function redactQuarantinedForMcp<
	T extends { subject: string; body: string; bodyHtml?: string | null },
>(email: T): T {
	return {
		...email,
		subject: "[Quarantined by LLM Guard — content withheld]",
		body: "[Content withheld: email quarantined by LLM Guard security scan.]",
		bodyHtml: null,
	};
}

/**
 * True when an email is quarantined (LLM Guard or ClamAV verdict).
 * Used to decide whether to redact content before MCP exposure.
 */
export function isQuarantined(email: { status: EmailStatus }): boolean {
	return email.status === "quarantine";
}

/**
 * A scan result the MCP redaction logic treats as a *security* failure
 * (i.e. the content itself is dangerous — a prompt-injection / jailbreak
 * payload from LLM Guard, or malware from ClamAV). Spam-filter failures are
 * deliberately excluded: spam is a nuisance verdict, not an injection
 * payload, so spam emails are not redacted for MCP consumers.
 */
const MCP_REDACTING_SCANNERS: ReadonlySet<string> = new Set([
	"llm-guard",
	"clamav",
]);

/**
 * True when any of an email's scan results represent a *security* failure
 * (LLM Guard prompt-injection/jailbreak verdict, or a ClamAV malware
 * verdict). Such emails carry content that must never enter an LLM
 * agent's context window, regardless of the email's current mailbox status.
 *
 * This is the durable signal behind MCP content redaction: an email that
 * was quarantined keeps its scan results forever, so even after a user
 * manually moves it back to the inbox (overriding the quarantine), the
 * redaction still applies and the flagged payload cannot reach an agent.
 */
export function hasSecurityScanFailure(
	scanResults: { scanner: string; passed: boolean }[] | undefined | null,
): boolean {
	if (!scanResults || scanResults.length === 0) return false;
	return scanResults.some(
		(s) => MCP_REDACTING_SCANNERS.has(s.scanner) && s.passed === false,
	);
}

/**
 * True when an email's content must be redacted before exposure to an MCP
 * consumer. This is the case when the email is currently quarantined OR when
 * any of its LLM Guard / ClamAV scan results failed — the latter ensures a
 * manually-released quarantined email (now in the inbox) is still redacted,
 * because its flagged payload is unchanged.
 */
export function shouldRedactForMcp(
	email: { status: EmailStatus },
	scanResults: { scanner: string; passed: boolean }[] | undefined | null,
): boolean {
	return isQuarantined(email) || hasSecurityScanFailure(scanResults);
}

export const isEmailStatus = (v: unknown): v is EmailStatus =>
	typeof v === "string" &&
	[
		"inbox",
		"spam",
		"quarantine",
		"sent",
		"draft",
		"pending",
		"scanning",
	].includes(v);

// ---------------------------------------------------------------------------
// Security settings (per-user outbound LLM Guard toggle)
// ---------------------------------------------------------------------------

/**
 * Per-user security settings exposed via the API / MCP / web UI.
 *
 * `llmGuardOutboundEnabled` controls whether outbound (sent) emails are
 * scanned by LLM Guard for prompt-injection / toxicity before delivery.
 * Inbound scanning is always on regardless of this setting — incoming
 * mail is always checked before it reaches the inbox or an MCP consumer.
 */
export interface SecuritySettings {
	llmGuardOutboundEnabled: boolean;
}

export const isSpamSensitivity = (v: unknown): v is SpamSensitivity =>
	typeof v === "string" && ["low", "medium", "high", "custom"].includes(v);
