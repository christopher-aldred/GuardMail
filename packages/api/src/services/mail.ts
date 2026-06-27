/**
 * Transactional email sender (password reset, etc.) via the Resend API.
 *
 * Falls back to logging when SMTP_PASS is not configured so the flow
 * remains testable without a live email provider.
 */
import { deliverEmail } from './smtp-relay';

const FROM_ADDRESS = process.env.SMTP_FROM ?? 'help@aiguard.email';
const WEB_BASE_URL = process.env.WEB_URL ?? 'https://aiguard.email';

export interface PasswordResetMailInput {
  to: string;
  username: string;
  resetToken: string;
}

export async function sendPasswordResetEmail(
  input: PasswordResetMailInput,
): Promise<{ sent: boolean; error?: string }> {
  const resetUrl = `${WEB_BASE_URL}/reset-password?token=${input.resetToken}`;

  const text = [
    `Hi ${input.username},`,
    '',
    'You requested a password reset for your AI Guard Mail account.',
    'Click the link below to set a new password:',
    '',
    resetUrl,
    '',
    'This link expires in 1 hour.',
    'If you did not request this, you can safely ignore this email.',
    '',
    '— AI Guard Mail',
  ].join('\n');

  const html = [
    `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">`,
    `<h2 style="color:#1e293b">AI Guard Mail — Password Reset</h2>`,
    `<p>Hi <strong>${input.username}</strong>,</p>`,
    `<p>You requested a password reset for your AI Guard Mail account.`,
    `Click the button below to set a new password:</p>`,
    `<p style="margin:24px 0">`,
    `<a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Reset Password</a>`,
    `</p>`,
    `<p style="color:#64748b;font-size:14px">Or copy this link: ${resetUrl}</p>`,
    `<p style="color:#64748b;font-size:14px">This link expires in 1 hour.</p>`,
    `<p style="color:#64748b;font-size:14px">If you did not request this, you can safely ignore this email.</p>`,
    `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">`,
    `<p style="color:#94a3b8;font-size:12px">AI Guard Mail — Secure AI agent email</p>`,
    `</div>`,
  ].join('');

  const result = await deliverEmail({
    from: FROM_ADDRESS,
    to: input.to,
    subject: 'AI Guard Mail — Reset your password',
    text,
    html,
  });

  if (!result.delivered) {
    console.warn('[mail] Password reset email not delivered:', result.error);
  }
  return { sent: result.delivered, error: result.error };
}

export interface VerificationMailInput {
  to: string;
  username: string;
  verifyToken: string;
}

export async function sendVerificationEmail(
  input: VerificationMailInput,
): Promise<{ sent: boolean; error?: string }> {
  const verifyUrl = `${WEB_BASE_URL}/verify-email?token=${input.verifyToken}`;

  const text = [
    `Hi ${input.username},`,
    '',
    'Welcome to AI Guard Mail! Please verify your email address to unlock',
    'higher sending limits (100 emails/day). Unverified accounts are capped',
    'at 100 sent emails in total.',
    '',
    'Click the link below to verify your email:',
    '',
    verifyUrl,
    '',
    'If you did not create an account, you can safely ignore this email.',
    '',
    '— AI Guard Mail',
  ].join('\n');

  const html = [
    `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">`,
    `<h2 style="color:#1e293b">AI Guard Mail — Verify your email</h2>`,
    `<p>Hi <strong>${input.username}</strong>,</p>`,
    `<p>Welcome to AI Guard Mail! Verify your email address to unlock higher`,
    `sending limits (100 emails/day). Unverified accounts are capped at 100`,
    `sent emails in total.</p>`,
    `<p style="margin:24px 0">`,
    `<a href="${verifyUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Verify Email</a>`,
    `</p>`,
    `<p style="color:#64748b;font-size:14px">Or copy this link: ${verifyUrl}</p>`,
    `<p style="color:#64748b;font-size:14px">If you did not create an account, you can safely ignore this email.</p>`,
    `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">`,
    `<p style="color:#94a3b8;font-size:12px">AI Guard Mail — Secure AI agent email</p>`,
    `</div>`,
  ].join('');

  const result = await deliverEmail({
    from: FROM_ADDRESS,
    to: input.to,
    subject: 'AI Guard Mail — Verify your email',
    text,
    html,
  });

  if (!result.delivered) {
    console.warn('[mail] Verification email not delivered:', result.error);
  }
  return { sent: result.delivered, error: result.error };
}
