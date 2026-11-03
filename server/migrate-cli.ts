import 'dotenv/config';
import pg from 'pg';
import { runMigrations } from './migrate.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set; nothing to migrate.');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
});

try {
  const result = await runMigrations(pool);
  if (result.replacedLegacyTables.length > 0) {
    console.log(`Replaced empty legacy tables: ${result.replacedLegacyTables.join(', ')}`);
  }
  console.log(`Applied: ${result.applied.join(', ') || 'none'}`);
  console.log(`Already applied: ${result.skipped.join(', ') || 'none'}`);
} catch (err) {
  console.error('Migration failed:', (err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
