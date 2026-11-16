/**
 * Removes leftover smoke-test accounts from the database.
 *
 * `scripts/smoke-live.mjs` deletes the accounts it creates, so this is only for
 * rows left by older runs. It is a dry run unless `--apply` is passed.
 *
 *   node --env-file=.env scripts/cleanup-smoke-users.mjs
 *   node --env-file=.env scripts/cleanup-smoke-users.mjs --apply
 *   node --env-file=.env scripts/cleanup-smoke-users.mjs --apply --pattern='livesmoke%@example.com'
 *
 * Patterns are SQL LIKE expressions and default to the smoke-test address shape.
 * Warranties, documents and notifications are removed by the users foreign keys.
 */
import pg from 'pg';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const patterns = args
  .filter((a) => a.startsWith('--pattern='))
  .map((a) => a.slice('--pattern='.length))
  .filter(Boolean);

if (patterns.length === 0) patterns.push('smoke+%@warrantyease.test');

const connectionString = process.env.DATABASE_URL;
if (!connectionString || !/^postgres(ql)?:\/\//.test(connectionString)) {
  console.error('DATABASE_URL must point at the PostgreSQL database (run with --env-file=.env).');
  process.exit(1);
}

const useSsl = !/localhost|127\.0\.0\.1/.test(connectionString);
const client = new pg.Client({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

await client.connect();
try {
  // WarrantyEase keeps its tables in a dedicated schema.
  await client.query('SET search_path TO warrantyease, public');

  const found = await client.query(
    `SELECT id, email, created_at FROM users WHERE email LIKE ANY($1::text[]) ORDER BY created_at`,
    [patterns]
  );

  console.log(`patterns: ${patterns.join(', ')}`);
  console.log(`matched ${found.rowCount} account(s)`);
  for (const row of found.rows) {
    console.log(`  ${row.email}  (${row.id})`);
  }

  if (found.rowCount === 0) {
    console.log('Nothing to remove.');
  } else if (!apply) {
    console.log('\nDry run. Re-run with --apply to delete these accounts and their rows.');
  } else {
    const deleted = await client.query(
      `DELETE FROM users WHERE email LIKE ANY($1::text[]) RETURNING id`,
      [patterns]
    );
    console.log(`\nDeleted ${deleted.rowCount} account(s); owned rows were removed by the foreign keys.`);
  }
} finally {
  await client.end();
}
