/**
 * Auth routes: register + login.
 */
import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { createHash, randomBytes } from 'node:crypto';
import { HTTPException } from 'hono/http-exception';
import type { ApiResponse, UserPublic } from '@guardmail/shared';
import { userRepository, spamFilterConfigRepository, passwordResetTokenRepository } from '../db';
import { signToken, requireAuth } from '../middleware/auth';
import type { AuthEnv } from '../middleware/auth';
import { loginSchema, registerSchema, forgotPasswordSchema, resetPasswordSchema, verifyEmailSchema, deleteAccountSchema } from './schemas';
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/mail';
import { isReservedUsername } from '../services/reserved-addresses';

export const authRoutes = new Hono();

const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN ?? 'mydomain.com';

function toPublic(row: {
  id: string;
  username: string;
  email: string;
  customEmail: string;
  createdAt: Date;
  updatedAt: Date;
}): UserPublic {
  const { ...rest } = row as Record<string, unknown>;
  delete rest.passwordHash;
  delete rest.apiKey;
  delete rest.emailVerifyTokenHash;
  return rest as unknown as UserPublic;
}

// POST /api/auth/register
authRoutes.post('/register', async (c) => {
  const parsed = registerSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'Invalid input' });
  }
  const { username, email, password } = parsed.data;

  // Reject usernames whose mailbox is reserved for AI Guard service use
  // (e.g. help, support, contact, info, admin, postmaster). The custom
  // email is `<username>@<EMAIL_DOMAIN>`, so claiming `help` would seize
  // help@aiguard.email — a core service address.
  if (isReservedUsername(username)) {
    throw new HTTPException(400, { message: 'That username is reserved and cannot be registered.' });
  }

  if (
    (await userRepository.findByUsername(username)) ||
    (await userRepository.findByEmail(email))
  ) {
    // Generic message to avoid username/email enumeration.
    throw new HTTPException(409, { message: 'Account already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const customEmail = `${username}@${EMAIL_DOMAIN}`;

  // Generate an email-verification token (store only the hash).
  const verifyRawToken = randomBytes(32).toString('hex');
  const verifyTokenHash = createHash('sha256').update(verifyRawToken).digest('hex');

  const user = await userRepository.create({
    username,
    email,
    customEmail,
    passwordHash,
    apiKey: uuid(), // generate MCP API key on registration
    emailVerifyTokenHash: verifyTokenHash,
  });
  await spamFilterConfigRepository.createDefault(user!.id);

  // Registration immediately issues a session token, so treat it as a
  // login for the admin "unique logins past 24h" stat. Without this the
  // first-time signup would never be counted (lastLoginAt stays null).
  await userRepository.setLastLogin(user!.id);

  // Send the verification email (best-effort; flow continues on failure).
  await sendVerificationEmail({
    to: email,
    username,
    verifyToken: verifyRawToken,
  }).catch((e) => console.error('[auth] verification email failed:', e));

  const token = signToken({ userId: user!.id });
  const body: ApiResponse<{ user: UserPublic; token: string; customEmail: string }> = {
    success: true,
    data: { user: toPublic(user!), token, customEmail: user!.customEmail },
  };
  return c.json(body, 201);
});

// POST /api/auth/login
authRoutes.post('/login', async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(400, { message: 'Invalid input' });
  }
  const { username, password } = parsed.data;

  // Accept a username, a custom email address, or the registration email.
  let user =
    (await userRepository.findByUsername(username)) ??
    (await userRepository.findByCustomEmail(username)) ??
    (await userRepository.findByEmail(username));
  if (!user) throw new HTTPException(401, { message: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new HTTPException(401, { message: 'Invalid credentials' });

  if (user.disabled) {
    throw new HTTPException(403, { message: 'This account has been disabled. Contact an administrator.' });
  }

  // Record this login for admin "unique logins past 24h" stats.
  await userRepository.setLastLogin(user.id);

  const token = signToken({ userId: user.id });
  const body: ApiResponse<{ user: UserPublic; token: string }> = {
    success: true,
    data: { user: toPublic(user), token },
  };
  return c.json(body);
});

// DELETE /api/auth/account
// Permanently deletes the authenticated user's account and all associated
// data (emails, spam config, reset tokens cascade on delete). Requires the
// current password to be re-supplied as a confirmation safeguard.
authRoutes.delete('/account', requireAuth, async (c) => {
  const auth = c.get('auth') as AuthEnv['Variables']['auth'];
  const parsed = deleteAccountSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'Invalid input' });
  }
  const user = await userRepository.findById(auth.user.id);
  if (!user) throw new HTTPException(404, { message: 'User not found' });
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) throw new HTTPException(401, { message: 'Password incorrect' });
  await userRepository.delete(user.id);
  const body: ApiResponse<{ message: string }> = {
    success: true,
    data: { message: 'Account deleted successfully' },
  };
  return c.json(body);
});

// POST /api/auth/forgot-password
authRoutes.post('/forgot-password', async (c) => {
  const parsed = forgotPasswordSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'Invalid input' });
  }
  const { email } = parsed.data;

  // Look up by registration email OR custom email address.
  const user =
    (await userRepository.findByEmail(email)) ??
    (await userRepository.findByCustomEmail(email));

  // Always return success to avoid user enumeration.
  if (!user) {
    return c.json({ success: true, data: { message: 'If that account exists, a reset link has been sent.' } });
  }

  // Generate a random token, store only the hash.
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await passwordResetTokenRepository.create({ userId: user.id, tokenHash, expiresAt });

  // Send the reset email to the user's registered email address.
  await sendPasswordResetEmail({
    to: user.email,
    username: user.username,
    resetToken: rawToken,
  });

  return c.json({ success: true, data: { message: 'If that account exists, a reset link has been sent.' } });
});

// POST /api/auth/reset-password
authRoutes.post('/reset-password', async (c) => {
  const parsed = resetPasswordSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'Invalid input' });
  }
  const { token, password } = parsed.data;

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const resetRecord = await passwordResetTokenRepository.findByToken(tokenHash);
  if (!resetRecord) {
    throw new HTTPException(400, { message: 'Invalid or expired reset token' });
  }
  if (resetRecord.usedAt) {
    throw new HTTPException(400, { message: 'This reset link has already been used' });
  }
  if (resetRecord.expiresAt.getTime() < Date.now()) {
    throw new HTTPException(400, { message: 'This reset link has expired' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await userRepository.updatePassword(resetRecord.userId, passwordHash);
  await passwordResetTokenRepository.markUsed(resetRecord.id);

  return c.json({ success: true, data: { message: 'Password reset successfully. You can now log in.' } });
});

// POST /api/auth/verify-email
authRoutes.post('/verify-email', async (c) => {
  const parsed = verifyEmailSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'Invalid input' });
  }
  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');
  const user = await userRepository.findByEmailVerifyToken(tokenHash);
  if (!user) {
    throw new HTTPException(400, { message: 'Invalid or expired verification token' });
  }
  await userRepository.setEmailVerified(user.id);
  return c.json({
    success: true,
    data: { message: 'Email verified successfully. Your daily sending limit is now 100 emails/day.' },
  });
});

// POST /api/auth/resend-verification
authRoutes.post('/resend-verification', async (c) => {
  const parsed = forgotPasswordSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'Invalid input' });
  }
  const user = await userRepository.findByEmail(parsed.data.email);
  // Always return success to avoid user enumeration.
  if (!user || user.emailVerifiedAt) {
    return c.json({ success: true, data: { message: 'If that account exists and is unverified, a verification link has been sent.' } });
  }
  const verifyRawToken = randomBytes(32).toString('hex');
  const verifyTokenHash = createHash('sha256').update(verifyRawToken).digest('hex');
  await userRepository.setEmailVerifyToken(user.id, verifyTokenHash);
  await sendVerificationEmail({
    to: user.email,
    username: user.username,
    verifyToken: verifyRawToken,
  }).catch((e) => console.error('[auth] resend verification failed:', e));
  return c.json({ success: true, data: { message: 'If that account exists and is unverified, a verification link has been sent.' } });
});

// GET /api/auth/verify-key
// Lightweight endpoint for the MCP server to validate an API key.
authRoutes.get('/verify-key', async (c) => {
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    throw new HTTPException(401, { message: 'Missing X-API-Key header' });
  }
  const user = await userRepository.findByApiKey(apiKey);
  if (!user) {
    throw new HTTPException(401, { message: 'Invalid API key' });
  }
  // Do not echo the userId to avoid amplifying this as a key oracle.
  return c.json({ success: true, data: { valid: true } });
});