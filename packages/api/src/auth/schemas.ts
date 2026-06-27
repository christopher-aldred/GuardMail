/**
 * Validation schemas (Zod) shared by auth + email + settings routes.
 */
import { z } from 'zod';

export const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, digits, . _ -'),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  username: z.string().min(1), // accepts username or custom email
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(255),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(256),
  password: z.string().min(8).max(128),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1).max(256),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(128),
});

// 25 MB raw cap per attachment; Base64 expands ~4/3, so allow ~34 MB B64.
const MAX_ATTACHMENT_BYTES = Number(process.env.MAX_ATTACHMENT_SIZE_MB ?? 25) * 1024 * 1024;
const MAX_ATTACHMENT_B64 = Math.ceil(MAX_ATTACHMENT_BYTES * 1.37);

export const sendEmailAttachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(127).default('application/octet-stream'),
  size: z.number().int().min(0).max(MAX_ATTACHMENT_BYTES),
  content: z.string().max(MAX_ATTACHMENT_B64), // Base64-encoded bytes
});

export const sendEmailSchema = z.object({
  to: z.array(z.string().email()).min(1).max(50),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(100_000),
  bodyHtml: z.string().max(500_000).optional(),
  inReplyTo: z.string().uuid().optional(),
  attachments: z.array(sendEmailAttachmentSchema).max(50).default([]),
});

export const spamSettingsSchema = z.object({
  enabled: z.boolean(),
  sensitivity: z.enum(['low', 'medium', 'high', 'custom']),
  allowlist: z.array(z.string().email()).max(500).default([]),
  blocklist: z.array(z.string().email()).max(500).default([]),
  keywordRules: z
    .array(
      z.object({
        keyword: z.string().min(1).max(64),
        action: z.enum(['flag', 'block']),
        score: z.number().min(0).max(1),
      }),
    )
    .max(200)
    .default([]),
  blockContentTypes: z.array(z.string().max(127)).max(50).default([]),
});

export const securitySettingsSchema = z.object({
  llmGuardOutboundEnabled: z.boolean(),
});

export const customDomainSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(255)
    .toLowerCase()
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
      'Must be a valid domain (e.g. example.com)',
    ),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type SendEmailInput = z.infer<typeof sendEmailSchema>;
export type SpamSettingsInput = z.infer<typeof spamSettingsSchema>;
export type CustomDomainInput = z.infer<typeof customDomainSchema>;
export type SecuritySettingsInput = z.infer<typeof securitySettingsSchema>;