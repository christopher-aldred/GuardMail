/**
 * MCP tool definitions for Guardmail.
 *
 * Each tool validates its input with Zod, proxies to the API server via
 * the ApiClient, and returns a JSON string for the LLM agent to consume.
 *
 * Every tool declaration includes, in addition to its input schema:
 *   - per-parameter `description` strings (Smithery "Parameter descriptions"),
 *   - an `outputSchema` describing the JSON envelope returned as
 *     `structuredContent` (Smithery "Output schemas"),
 *   - `annotations` with read-only / destructive / idempotent / open-world
 *     hints and a human-readable `title` (Smithery "Annotations"),
 *   - snake_case `name` and a top-level `title` (Smithery "Naming").
 */
import { z } from 'zod';
import { isEmailScanned, isQuarantined, redactQuarantinedForMcp, type EmailStatus } from '@guardmail/shared';
import type { ApiClient } from '../api-client';
import { isApiError } from '../api-client';

/**
 * Annotations describing a tool's execution characteristics.
 * These are *hints* — clients must not rely on them for safety decisions.
 */
export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolDef {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
  outputSchema?: Record<string, unknown>; // JSON Schema (object)
  annotations?: ToolAnnotations;
  handler: (client: ApiClient, args: unknown) => Promise<string>;
}

const ok = (data: unknown) => JSON.stringify({ success: true, data });

/**
 * Structured error returned in the tool response envelope. Carrying a
 * stable `code` (and the upstream HTTP `status` when the failure came
 * from the API) lets an LLM agent branch on the failure mode instead of
 * pattern-matching prose — e.g. "401" → tell the user to fix their API
 * key, "429" → back off / suggest a plan upgrade, "503" → the upstream
 * service is down.
 */
interface ToolError {
  /** Stable error code (VALIDATION, NETWORK, 401, 403, 429, 503, INTERNAL, …). */
  code: string;
  /** Human-readable error message. */
  message: string;
  /** HTTP status from the API (0 when the request never reached the API). */
  status?: number;
  /** Optional structured details echoed from the API error envelope. */
  details?: unknown;
}

const fail = (error: ToolError) => JSON.stringify({ success: false, error });

function wrap<T>(
  schema: z.ZodType<T>,
  run: (client: ApiClient, input: T) => Promise<unknown>,
): ToolDef['handler'] {
  return async (client, args) => {
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION',
        message: parsed.error.issues[0]?.message ?? 'Invalid input',
      });
    }
    try {
      const data = await run(client, parsed.data);
      return ok(data);
    } catch (err) {
      // Preserve the API's structured error (code + HTTP status + details)
      // so the agent can react to the failure mode rather than a flat
      // string. Fall back to a generic INTERNAL error for anything else.
      if (isApiError(err)) {
        return fail({
          code: err.code,
          message: err.message,
          status: err.status,
          ...(err.details !== undefined ? { details: err.details } : {}),
        });
      }
      return fail({
        code: 'INTERNAL',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };
}

/**
 * Defense-in-depth: the API already filters unscanned content for API-key
 * (MCP) callers, but the MCP layer re-checks so that an email can never
 * reach an LLM agent before its security scan is complete. Unscanned
 * emails are dropped from lists; anything without scan results is redacted.
 */
type EmailLike = {
  status?: string;
  subject?: string;
  body?: string;
  bodyHtml?: string | null;
  scanResults?: unknown[];
};

function scanCount(e: EmailLike): number {
  return Array.isArray(e.scanResults) ? e.scanResults.length : 0;
}

function filterUnscannedList(emails: unknown): unknown {
  if (!Array.isArray(emails)) return emails;
  // NEVER expose unscanned email content to an MCP consumer. Drop any
  // email whose scan has not completed (holding status OR no persisted
  // scan results). Subject/sender fields are scanned too, so the whole
  // record is withheld rather than just the body.
  return (emails as EmailLike[]).filter((e) =>
    isEmailScanned(e as { status: EmailStatus }, scanCount(e)),
  );
}

/**
 * Defense-in-depth for the MCP layer: the API already redacts quarantined
 * content for API-key callers, but the MCP layer re-applies the redaction
 * so a quarantined email's prompt-injection payload can never reach an
 * LLM agent's context window even if the API response were to change.
 */
function redactQuarantinedList(emails: unknown): unknown {
  if (!Array.isArray(emails)) return emails;
  return (emails as EmailLike[]).map((e) =>
    isQuarantined(e as { status: EmailStatus })
      ? redactQuarantinedForMcp(e as { subject: string; body: string; bodyHtml?: string | null })
      : e,
  );
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const registerSchema = z.object({
  username: z.string().min(3).max(64),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const listSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

const getEmailSchema = z.object({ emailId: z.string().uuid() });

const sendEmailSchema = z.object({
  to: z.array(z.string().email()).min(1).max(50),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(100_000),
  bodyHtml: z.string().max(500_000).optional(),
});

const updateSpamSchema = z.object({
  enabled: z.boolean(),
  sensitivity: z.enum(['low', 'medium', 'high', 'custom']),
  allowlist: z.array(z.string().email()).max(500),
  blocklist: z.array(z.string().email()).max(500),
  keywordRules: z
    .array(
      z.object({
        keyword: z.string().min(1).max(64),
        action: z.enum(['flag', 'block']),
        score: z.number().min(0).max(1),
      }),
    )
    .max(200),
  blockContentTypes: z.array(z.string().max(127)).max(50),
});

const updateSecuritySchema = z.object({
  llmGuardOutboundEnabled: z.boolean(),
});

// ---------------------------------------------------------------------------
// Output schemas
// ---------------------------------------------------------------------------

/**
 * Build the standard JSON response envelope schema. Every tool handler
 * returns either `{ success: true, data }` or `{ success: false, error }`.
 * `dataSchema` describes the success payload; on failure `error` is a string.
 */
function envelope(dataSchema: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    description: 'Standard response envelope: data on success, error on failure.',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the tool call succeeded.',
      },
      data: {
        ...dataSchema,
        description: 'The result payload. Present only when success is true.',
      },
      error: {
        type: 'object',
        description:
          'Structured error payload. Present only when success is false. ' +
          '`code` is a stable identifier (VALIDATION, NETWORK, 401, 403, 429, 503, INTERNAL, …) ' +
          'so callers can branch on the failure mode; `status` is the upstream HTTP status (0 for network errors).',
        properties: {
          code: {
            type: 'string',
            description:
              'Stable error code. API failures carry the API error code (e.g. "401", "403", "429", "RATE_LIMIT", "INTERNAL"); ' +
              'input failures are "VALIDATION"; unreachable-API failures are "NETWORK".',
          },
          message: {
            type: 'string',
            description: 'Human-readable error message suitable for showing to the user.',
          },
          status: {
            type: 'integer',
            description: 'HTTP status from the Guardmail API (0 when the request never reached the API).',
          },
          details: {
            description: 'Optional structured details echoed from the API error envelope.',
          },
        },
        required: ['code', 'message'],
      },
    },
    required: ['success'],
  };
}

/** JSON Schema fragment describing a single email record. */
const emailItemSchema = {
  type: 'object',
  description: 'A single email with security scan metadata.',
  properties: {
    id: { type: 'string', format: 'uuid', description: 'Unique email identifier.' },
    from: { type: 'string', format: 'email', description: 'Sender address.' },
    to: {
      type: 'array',
      items: { type: 'string', format: 'email' },
      description: 'Recipient addresses.',
    },
    subject: { type: 'string', description: 'Email subject line (redacted for quarantined mail).' },
    body: { type: 'string', description: 'Plaintext body (redacted for quarantined mail).' },
    bodyHtml: { type: ['string', 'null'], description: 'HTML body, if any (null for quarantined mail).' },
    status: {
      type: 'string',
      enum: ['inbox', 'spam', 'quarantine', 'sent', 'draft', 'pending', 'scanning'],
      description: 'Current mailbox/security status.',
    },
    scanResults: {
      type: 'array',
      description: 'Security scan verdicts from LLM Guard, ClamAV, and the spam filter.',
      items: {
        type: 'object',
        properties: {
          scanner: { type: 'string', description: 'Scanner that produced this result.' },
          passed: { type: 'boolean', description: 'Whether the email passed this scanner.' },
          riskScore: { type: 'number', description: 'Risk score from 0.0 (safe) to 1.0 (malicious).' },
          details: { type: 'string', description: 'Human-readable scanner verdict.' },
        },
      },
    },
    createdAt: { type: 'string', format: 'date-time', description: 'When the email was received.' },
  },
};

const emailArraySchema = {
  type: 'array',
  description: 'List of email records (unscanned mail is withheld; quarantined content is redacted).',
  items: emailItemSchema,
};

const registerOutputSchema = envelope({
  type: 'object',
  description: 'The newly registered user and their provisioned credentials.',
  properties: {
    userId: { type: 'string', format: 'uuid', description: 'New user identifier.' },
    username: { type: 'string', description: 'Chosen username.' },
    customEmail: { type: 'string', format: 'email', description: 'Provisioned <username>@<domain> mailbox address.' },
    apiKey: { type: 'string', description: 'API key for MCP / programmatic access.' },
  },
});

const sendEmailOutputSchema = envelope({
  type: 'object',
  description: 'Confirmation of the sent email.',
  properties: {
    id: { type: 'string', format: 'uuid', description: 'Identifier of the sent email.' },
    status: { type: 'string', description: 'Delivery status (e.g. "sent").' },
    to: {
      type: 'array',
      items: { type: 'string', format: 'email' },
      description: 'Recipients the email was sent to.',
    },
    subject: { type: 'string', description: 'Subject line of the sent email.' },
  },
});

const getEmailOutputSchema = envelope(emailItemSchema);

const listOutputSchema = envelope(emailArraySchema);

const spamSettingsOutputSchema = envelope({
  type: 'object',
  description: 'The updated spam filter configuration.',
  properties: {
    enabled: { type: 'boolean', description: 'Whether the spam filter is active.' },
    sensitivity: {
      type: 'string',
      enum: ['low', 'medium', 'high', 'custom'],
      description: 'Spam detection sensitivity level.',
    },
    allowlist: {
      type: 'array',
      items: { type: 'string', format: 'email' },
      description: 'Sender addresses always allowed through.',
    },
    blocklist: {
      type: 'array',
      items: { type: 'string', format: 'email' },
      description: 'Sender addresses always blocked.',
    },
    keywordRules: {
      type: 'array',
      description: 'Custom keyword scoring rules.',
      items: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: 'Keyword to match.' },
          action: { type: 'string', enum: ['flag', 'block'], description: 'Action taken on match.' },
          score: { type: 'number', description: 'Weight contributed to the spam score (0.0–1.0).' },
        },
      },
    },
    blockContentTypes: {
      type: 'array',
      items: { type: 'string' },
      description: 'MIME content types to block.',
    },
  },
});

const securitySettingsOutputSchema = envelope({
  type: 'object',
  description: 'The user\u2019s security settings.',
  properties: {
    llmGuardOutboundEnabled: {
      type: 'boolean',
      description: 'Whether outbound emails are scanned by LLM Guard before delivery.',
    },
  },
});

/**
 * Output schema describing the user\u2019s subscription / quota snapshot.
 * Mirrors `SubscriptionInfo` from @guardmail/shared. Lets an agent
 * answer “how much quota do I have left?” and proactively warn before
 * a `send_email` call would hit a daily/monthly tier limit.
 */
const subscriptionOutputSchema = envelope({
  type: 'object',
  description:
    'The authenticated user\u2019s subscription tier and email quota usage (combined sent + received).',
  properties: {
    tier: {
      type: 'string',
      enum: ['free', 'hobby', 'pro', 'custom'],
      description: 'Subscription tier identifier.',
    },
    name: { type: 'string', description: 'Human-readable tier name (e.g. "Free", "Hobby").' },
    monthlyLimit: {
      type: ['integer', 'null'],
      description: 'Combined monthly email allowance, or null for unlimited/Custom.',
    },
    dailyLimit: {
      type: 'integer',
      description: 'Combined daily email cap.',
    },
    priceCents: {
      type: ['integer', 'null'],
      description: 'Monthly price in GBP pence, or null for Free/Custom.',
    },
    available: { type: 'boolean', description: 'Whether the tier is selectable on signup.' },
    sentThisMonth: {
      type: 'integer',
      description: 'Emails sent + received so far this month (UTC).',
    },
    sentToday: {
      type: 'integer',
      description: 'Emails sent + received so far today (UTC).',
    },
    emailVerified: {
      type: 'boolean',
      description: 'Whether the account\u2019s registration email has been verified.',
    },
    email: { type: 'string', format: 'email', description: 'Registration email address.' },
    unverifiedSendLimit: {
      type: ['integer', 'null'],
      description: 'Lifetime outbound cap for unverified Free accounts (null when not applicable).',
    },
    sentLifetimeOutbound: {
      type: 'integer',
      description: 'Lifetime outbound emails sent (used against unverifiedSendLimit).',
    },
  },
});

// Input schema for the quota tool — takes no arguments.
const getQuotaSchema = z.object({}).strict();

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const tools: ToolDef[] = [
  {
    name: 'register_user',
    title: 'Register User',
    description: 'Register a new Guardmail user and provision a custom email address.',
    inputSchema: {
      type: 'object',
      properties: {
        username: {
          type: 'string',
          minLength: 3,
          maxLength: 64,
          description: 'Unique username for the new account (3–64 characters).',
        },
        email: {
          type: 'string',
          format: 'email',
          description: 'Recovery/contact email address for the account owner.',
        },
        password: {
          type: 'string',
          minLength: 8,
          maxLength: 128,
          description: 'Account password (8–128 characters).',
        },
      },
      required: ['username', 'email', 'password'],
    },
    outputSchema: registerOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    handler: wrap(registerSchema, (c, i) => c.register(i)),
  },
  {
    name: 'send_email',
    title: 'Send Email',
    description: 'Send an email from the user\'s custom Guardmail address with automatic LLM Guard scanning.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'array',
          items: { type: 'string', format: 'email' },
          description: 'Recipient email addresses (1–50).',
        },
        subject: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          description: 'Email subject line (1–500 characters).',
        },
        body: {
          type: 'string',
          minLength: 1,
          maxLength: 100000,
          description: 'Plaintext email body (1–100,000 characters).',
        },
        bodyHtml: {
          type: 'string',
          maxLength: 500000,
          description: 'Optional HTML version of the body (max 500,000 characters).',
        },
      },
      required: ['to', 'subject', 'body'],
    },
    outputSchema: sendEmailOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: wrap(sendEmailSchema, (c, i) => c.sendEmail(i)),
  },
  {
    name: 'list_inbox',
    title: 'List Inbox',
    description: 'List inbox emails with security scan results.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description: 'Maximum number of emails to return (default 50, max 200).',
        },
        offset: {
          type: 'integer',
          minimum: 0,
          description: 'Number of emails to skip for pagination (default 0).',
        },
      },
    },
    outputSchema: listOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: wrap(listSchema, async (c, i) =>
      redactQuarantinedList(
        filterUnscannedList(await c.listInbox(i.limit ?? 50, i.offset ?? 0)),
      ),
    ),
  },
  {
    name: 'list_spam',
    title: 'List Spam',
    description: 'List emails flagged as spam by the spam filter.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description: 'Maximum number of emails to return (default 50, max 200).',
        },
        offset: {
          type: 'integer',
          minimum: 0,
          description: 'Number of emails to skip for pagination (default 0).',
        },
      },
    },
    outputSchema: listOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: wrap(listSchema, async (c, i) =>
      redactQuarantinedList(
        filterUnscannedList(await c.listSpam(i.limit ?? 50, i.offset ?? 0)),
      ),
    ),
  },
  {
    name: 'list_quarantine',
    title: 'List Quarantine',
    description: 'List emails quarantined by LLM Guard or ClamAV.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description: 'Maximum number of emails to return (default 50, max 200).',
        },
        offset: {
          type: 'integer',
          minimum: 0,
          description: 'Number of emails to skip for pagination (default 0).',
        },
      },
    },
    outputSchema: listOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: wrap(listSchema, async (c, i) =>
      redactQuarantinedList(
        filterUnscannedList(await c.listQuarantine(i.limit ?? 50, i.offset ?? 0)),
      ),
    ),
  },
  {
    name: 'get_email',
    title: 'Get Email',
    description: 'Get full email details including the complete security scan report.',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: {
          type: 'string',
          format: 'uuid',
          description: 'Unique identifier of the email to retrieve.',
        },
      },
      required: ['emailId'],
    },
    outputSchema: getEmailOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: wrap(getEmailSchema, async (c, i) => {
      const email = (await c.getEmail(i.emailId)) as EmailLike;
      // NEVER expose unscanned content to an MCP consumer. Unscanned
      // bodies may contain prompt-injection payloads that have not yet
      // been evaluated by LLM Guard.
      const scanned = isEmailScanned(
        email as { status: EmailStatus },
        scanCount(email),
      );
      if (!scanned) {
        throw new Error(
          'Email is still being scanned and is not yet available. Please try again once scanning completes.',
        );
      }
      // Defense-in-depth: redact quarantined content even though the API
      // already does so for API-key callers. A quarantined email's
      // subject/body carry the very injection payload LLM Guard flagged.
      if (isQuarantined(email as { status: EmailStatus })) {
        return redactQuarantinedForMcp(
          email as { subject: string; body: string; bodyHtml?: string | null },
        );
      }
      return email;
    }),
  },
  {
    name: 'update_spam_settings',
    title: 'Update Spam Settings',
    description: 'Update the user\'s spam filter configuration (rules, allow/block lists, sensitivity).',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          description: 'Whether the spam filter should be active.',
        },
        sensitivity: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'custom'],
          description: 'Spam detection sensitivity level.',
        },
        allowlist: {
          type: 'array',
          items: { type: 'string', format: 'email' },
          description: 'Sender addresses always allowed through (max 500).',
        },
        blocklist: {
          type: 'array',
          items: { type: 'string', format: 'email' },
          description: 'Sender addresses always blocked (max 500).',
        },
        keywordRules: {
          type: 'array',
          description: 'Custom keyword scoring rules (max 200).',
          items: {
            type: 'object',
            properties: {
              keyword: {
                type: 'string',
                minLength: 1,
                maxLength: 64,
                description: 'Keyword to match in message content.',
              },
              action: {
                type: 'string',
                enum: ['flag', 'block'],
                description: 'Action taken when the keyword matches.',
              },
              score: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description: 'Weight contributed to the spam score (0.0–1.0).',
              },
            },
            required: ['keyword', 'action', 'score'],
          },
        },
        blockContentTypes: {
          type: 'array',
          items: { type: 'string', maxLength: 127 },
          description: 'MIME content types to block (max 50).',
        },
      },
      required: ['enabled', 'sensitivity'],
    },
    outputSchema: spamSettingsOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: wrap(updateSpamSchema, (c, i) => c.updateSpamSettings(i)),
  },
  {
    name: 'update_security_settings',
    title: 'Update Security Settings',
    description:
      'Update the user\u2019s security settings. Currently controls whether outbound (sent) emails are scanned by LLM Guard for prompt injection and toxicity before delivery. Inbound scanning is always on regardless of this setting.',
    inputSchema: {
      type: 'object',
      properties: {
        llmGuardOutboundEnabled: {
          type: 'boolean',
          description:
            'Whether outbound emails are scanned by LLM Guard before being sent. Set false to disable outbound LLM Guard scanning. Defaults to true; inbound scanning is always enabled.',
        },
      },
      required: ['llmGuardOutboundEnabled'],
    },
    outputSchema: securitySettingsOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: wrap(updateSecuritySchema, (c, i) => c.updateSecuritySettings(i)),
  },
  {
    name: 'get_quota',
    title: 'Get Quota & Tier',
    description:
      'Get the authenticated user\u2019s subscription tier and email quota usage: monthly/daily limits, ' +
      'how many emails (sent + received) have been used this month and today, and whether the account email is verified. ' +
      'Use this before sending a batch of emails to check remaining quota, or to tell the user which plan they are on and whether they need to verify their email or upgrade to send more.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      description: 'Takes no arguments. Returns the quota snapshot for the authenticated API key.',
    },
    outputSchema: subscriptionOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: wrap(getQuotaSchema, (c) => c.getSubscription()),
  },
];