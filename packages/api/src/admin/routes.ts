/**
 * Admin routes — platform-level statistics and account management for
 * admin accounts.
 *
 * All routes require `requireAuthOrApiKey` + `requireAdmin` (applied at
 * mount time in index.ts), so handlers can assume `auth.user.role === 'admin'`.
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type {
  ApiResponse,
  AdminStats,
  AdminUserList,
  AdminUserSummary,
  AdminEmailList,
  AdminEmailSummary,
} from '@guardmail/shared';
import type { AuthEnv } from '../middleware/auth';
import { userRepository, emailRepository } from '../db';

export const adminRoutes = new Hono<AuthEnv>();

const PAGE_SIZE = 10;

function parsePage(c: { req: { query: (name: string) => string | undefined } }) {
  const raw = Number(c.req.query('page') ?? '1');
  const page = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
  const limitRaw = Number(c.req.query('limit') ?? String(PAGE_SIZE));
  const limit =
    Number.isFinite(limitRaw) && limitRaw >= 1 && limitRaw <= 100
      ? Math.floor(limitRaw)
      : PAGE_SIZE;
  return { page, limit, offset: (page - 1) * limit };
}

/** Strip secrets from a raw user row. */
function toUserSummary(row: {
  id: string;
  username: string;
  email: string;
  customEmail: string;
  tier: string;
  role: string;
  disabled: boolean | null;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}): AdminUserSummary {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    customEmail: row.customEmail,
    tier: row.tier as AdminUserSummary['tier'],
    role: row.role as AdminUserSummary['role'],
    disabled: !!row.disabled,
    emailVerified: !!row.emailVerifiedAt,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

// GET /api/admin/stats
adminRoutes.get('/stats', async (c) => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    uniqueLogins24h,
    emailsSent,
    emailsReceived,
    emailsSent24h,
    emailsReceived24h,
  ] = await Promise.all([
    userRepository.countAll(),
    userRepository.countLoginsSince(since24h),
    emailRepository.countSent(),
    emailRepository.countReceived(),
    emailRepository.countSent(since24h),
    emailRepository.countReceived(since24h),
  ]);

  const stats: AdminStats = {
    totalUsers,
    uniqueLogins24h,
    emailsSent,
    emailsReceived,
    emailsSent24h,
    emailsReceived24h,
  };
  const body: ApiResponse<AdminStats> = { success: true, data: stats };
  return c.json(body);
});

// GET /api/admin/users?page=1&limit=10
// All user accounts sorted by most recently logged in (nulls last).
adminRoutes.get('/users', async (c) => {
  const { page, limit, offset } = parsePage(c);
  const [rows, total] = await Promise.all([
    userRepository.listRecent(limit, offset),
    userRepository.countAll(),
  ]);
  const users = rows.map(toUserSummary);
  const data: AdminUserList = { users, total, page, limit };
  const body: ApiResponse<AdminUserList> = { success: true, data };
  return c.json(body);
});

// GET /api/admin/logins?page=1&limit=10
// Users who have logged in in the past 24 hours, newest login first.
adminRoutes.get('/logins', async (c) => {
  const { page, limit, offset } = parsePage(c);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [rows, total] = await Promise.all([
    userRepository.listLoginsSince(since24h, limit, offset),
    userRepository.countLoginsSince(since24h),
  ]);
  const users = rows.map(toUserSummary);
  const data: AdminUserList = { users, total, page, limit };
  const body: ApiResponse<AdminUserList> = { success: true, data };
  return c.json(body);
});

function toEmailSummary(
  row: {
    email: {
      id: string;
      userId: string;
      from: string;
      to: string[] | string;
      subject: string;
      status: string;
      createdAt: Date;
    };
    username: string;
    customEmail: string;
  },
): AdminEmailSummary {
  return {
    id: row.email.id,
    userId: row.email.userId,
    username: row.username,
    customEmail: row.customEmail,
    from: row.email.from,
    to: Array.isArray(row.email.to) ? row.email.to : (row.email.to as unknown as string[]),
    subject: row.email.subject,
    status: row.email.status,
    createdAt: row.email.createdAt.toISOString(),
  };
}

// GET /api/admin/emails/sent?page=1&limit=10
// All outbound (sent) emails, newest first.
adminRoutes.get('/emails/sent', async (c) => {
  const { page, limit, offset } = parsePage(c);
  const [rows, total] = await Promise.all([
    emailRepository.listSentWithUser(limit, offset),
    emailRepository.countSent(),
  ]);
  const emails = rows.map(toEmailSummary);
  const data: AdminEmailList = { emails, total, page, limit };
  const body: ApiResponse<AdminEmailList> = { success: true, data };
  return c.json(body);
});

// GET /api/admin/emails/received?page=1&limit=10
// All inbound (inbox + spam + quarantine) emails, newest first.
adminRoutes.get('/emails/received', async (c) => {
  const { page, limit, offset } = parsePage(c);
  const [rows, total] = await Promise.all([
    emailRepository.listReceivedWithUser(limit, offset),
    emailRepository.countReceived(),
  ]);
  const emails = rows.map(toEmailSummary);
  const data: AdminEmailList = { emails, total, page, limit };
  const body: ApiResponse<AdminEmailList> = { success: true, data };
  return c.json(body);
});

// POST /api/admin/users/:id/disable
// Suspend an account — blocks login but preserves data.
adminRoutes.post('/users/:id/disable', async (c) => {
  const targetId = c.req.param('id');
  const auth = c.get('auth');
  if (targetId === auth.user.id) {
    throw new HTTPException(400, { message: 'You cannot disable your own account' });
  }
  const target = await userRepository.findById(targetId);
  if (!target) throw new HTTPException(404, { message: 'User not found' });
  if (target.role === 'admin') {
    throw new HTTPException(400, { message: 'Admin accounts cannot be disabled' });
  }
  await userRepository.setDisabled(targetId, true);
  return c.json({ success: true, data: { message: 'Account disabled' } });
});

// POST /api/admin/users/:id/enable
// Re-enable a previously suspended account.
adminRoutes.post('/users/:id/enable', async (c) => {
  const targetId = c.req.param('id');
  const target = await userRepository.findById(targetId);
  if (!target) throw new HTTPException(404, { message: 'User not found' });
  await userRepository.setDisabled(targetId, false);
  return c.json({ success: true, data: { message: 'Account enabled' } });
});

// DELETE /api/admin/users/:id
// Permanently delete an account and purge all of its emails, attachments,
// scan results, spam config, and reset tokens (all cascaded via FK
// onDelete: cascade). Admins cannot delete themselves or other admins.
adminRoutes.delete('/users/:id', async (c) => {
  const targetId = c.req.param('id');
  const auth = c.get('auth');
  if (targetId === auth.user.id) {
    throw new HTTPException(400, { message: 'You cannot delete your own account' });
  }
  const target = await userRepository.findById(targetId);
  if (!target) throw new HTTPException(404, { message: 'User not found' });
  if (target.role === 'admin') {
    throw new HTTPException(400, { message: 'Admin accounts cannot be deleted' });
  }
  await userRepository.delete(targetId);
  return c.json({
    success: true,
    data: { message: 'Account deleted and all associated emails purged' },
  });
});