/**
 * JWT authentication middleware + helpers.
 */
import { createMiddleware } from 'hono/factory';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { AuthContext, UserPublic } from '@guardmail/shared';
import { HTTPException } from 'hono/http-exception';
import { userRepository } from '../db';

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';

/** Resolve the JWT signing secret. Fails hard in production if unset. */
function getSecret(): string {
  if (SECRET) return SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  return 'dev-jwt-secret-change-in-production';
}

/** Hono env binding that exposes the resolved auth context to handlers. */
export interface AuthEnv {
  Variables: { auth: AuthContext };
}

export function signToken(payload: { userId: string }): string {
  const options: SignOptions = { expiresIn: EXPIRES_IN as unknown as number };
  return jwt.sign(payload, getSecret(), options);
}

export function verifyToken(token: string): { userId: string } {
  return jwt.verify(token, getSecret()) as { userId: string };
}

function stripUser(row: {
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

/**
 * Middleware that requires a valid Bearer JWT.
 * Populates `c.set('auth', ...)` with the resolved user.
 * Rejects tokens issued before the user's last password change.
 */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    throw new HTTPException(401, { message: 'Missing or invalid Authorization header' });
  }
  let payload: { userId: string; iat?: number };
  try {
    payload = verifyToken(match[1]) as { userId: string; iat?: number };
  } catch {
    throw new HTTPException(401, { message: 'Invalid or expired token' });
  }
  const user = await userRepository.findById(payload.userId);
  if (!user) throw new HTTPException(401, { message: 'User no longer exists' });
  if (user.disabled) {
    throw new HTTPException(403, { message: 'This account has been disabled. Contact an administrator.' });
  }

  // Invalidate JWTs issued before the last password change.
  if (payload.iat && user.passwordChangedAt) {
    const passwordChangedEpoch = Math.floor(
      new Date(user.passwordChangedAt).getTime() / 1000,
    );
    if (payload.iat < passwordChangedEpoch) {
      throw new HTTPException(401, { message: 'Session expired due to password change' });
    }
  }

  c.set('auth', { user: stripUser(user), token: match[1], isApiKey: false });
  await next();
});

/**
 * Middleware that accepts an `X-API-Key` header for MCP server access.
 * Populates the same `auth` context as `requireAuth`.
 */
export const requireApiKey = createMiddleware<AuthEnv>(async (c, next) => {
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    throw new HTTPException(401, { message: 'Missing X-API-Key header' });
  }
  const user = await userRepository.findByApiKey(apiKey);
  if (!user) throw new HTTPException(401, { message: 'Invalid API key' });
  if (user.disabled) {
    throw new HTTPException(403, { message: 'This account has been disabled. Contact an administrator.' });
  }

  c.set('auth', { user: stripUser(user), token: apiKey, isApiKey: true });
  await next();
});

/** Either JWT or API key (used by endpoints shared by web UI and MCP). */
export const requireAuthOrApiKey = createMiddleware<AuthEnv>(async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const apiKey = c.req.header('x-api-key');
  try {
    if (apiKey) return await requireApiKey(c, next);
    if (/^Bearer\s+/i.test(header)) return await requireAuth(c, next);
  } catch (err) {
    if (err instanceof HTTPException) throw err;
  }
  throw new HTTPException(401, { message: 'Authentication required' });
});

/**
 * Middleware that requires the authenticated user to have the `admin` role.
 * Must run *after* `requireAuth` / `requireAuthOrApiKey` so the auth context
 * is populated.
 */
export const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  const auth = c.get('auth');
  if (!auth || auth.user.role !== 'admin') {
    throw new HTTPException(403, { message: 'Admin access required' });
  }
  await next();
});