/**
 * Apply pending database migrations.
 * Run via: `npm run db:migrate`
 */
import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, closeDb } from './client';

async function main() {
  console.log('[db] Running migrations...');
  await migrate(db, { migrationsFolder: './src/db/migrations' });
  console.log('[db] Migrations applied successfully.');
  await closeDb();
}

main().catch((err) => {
  console.error('[db] Migration failed:', err);
  process.exit(1);
});