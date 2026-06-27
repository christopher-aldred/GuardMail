/**
 * Seed script — creates a demo user with sensible defaults for local dev.
 * Run via: `npm run db:seed`
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { eq } from 'drizzle-orm';
import { db, closeDb, schema } from './client';

async function main() {
  const username = 'demo';
  const password = 'demo-password-123';
  const email = 'demo@example.com';
  const domain = process.env.EMAIL_DOMAIN ?? 'mydomain.com';

  const passwordHash = await bcrypt.hash(password, 10);
  const customEmail = `${username}@${domain}`;

  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .limit(1);

  if (existing) {
    console.log('[seed] Demo user already exists, skipping.');
    await closeDb();
    return;
  }

  const [user] = await db
    .insert(schema.users)
    .values({
      id: uuid(),
      username,
      email,
      customEmail,
      passwordHash,
    })
    .returning();

  await db.insert(schema.spamFilterConfigs).values({
    userId: user!.id,
    enabled: true,
    sensitivity: 'medium',
    allowlist: [],
    blocklist: [],
    keywordRules: [],
    blockContentTypes: [],
  });

  console.log(`[seed] Created demo user: ${username} / ${password}`);
  console.log(`[seed] Custom email: ${customEmail}`);

  // Optionally seed an admin account from env vars.
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminUsername && adminPassword && adminEmail) {
    const adminCustomEmail = `${adminUsername}@${domain}`;
    const [adminExisting] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, adminEmail))
      .limit(1);
    if (adminExisting) {
      if (adminExisting.role !== 'admin') {
        await db
          .update(schema.users)
          .set({ role: 'admin' })
          .where(eq(schema.users.id, adminExisting.id));
        console.log(`[seed] Promoted existing user ${adminExisting.username} to admin`);
      } else {
        console.log(`[seed] Admin user ${adminExisting.username} already exists, skipping.`);
      }
    } else {
      const adminHash = await bcrypt.hash(adminPassword, 10);
      const [adminUser] = await db
        .insert(schema.users)
        .values({
          id: uuid(),
          username: adminUsername,
          email: adminEmail,
          customEmail: adminCustomEmail,
          passwordHash: adminHash,
          apiKey: uuid(),
          emailVerifiedAt: new Date(),
          role: 'admin',
        })
        .returning();
      await db.insert(schema.spamFilterConfigs).values({
        userId: adminUser!.id,
        enabled: true,
        sensitivity: 'medium',
        allowlist: [],
        blocklist: [],
        keywordRules: [],
        blockContentTypes: [],
      });
      console.log(`[seed] Created admin user: ${adminUsername} / ${adminPassword}`);
      console.log(`[seed] Admin email: ${adminEmail}`);
    }
  }

  await closeDb();
}

main().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});