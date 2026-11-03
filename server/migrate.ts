import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * WarrantyEase owns this schema. The platform database can be shared with another
 * project (it was, during development), so every table is created here and never
 * in `public`, where a foreign table of the same name could collide.
 */
export const SCHEMA = 'warrantyease';

const REQUIRED_TABLES = ['users', 'warranties', 'documents', 'notifications'];

/**
 * Migrations live beside this file in development and are copied into
 * dist-server/migrations by the production build.
 */
export function migrationsDir(): string {
  const candidates = [
    path.resolve(__dirname, 'migrations'),
    path.resolve(__dirname, 'server', 'migrations'),
    path.resolve(process.cwd(), 'server', 'migrations'),
  ];
  return candidates.find((dir) => fs.existsSync(dir)) || candidates[0];
}

async function missingTables(pool: pg.Pool): Promise<string[]> {
  const { rows } = await pool.query<{ name: string; present: boolean }>(
    `SELECT t AS name, to_regclass(t) IS NOT NULL AS present
       FROM unnest($1::text[]) AS t`,
    [REQUIRED_TABLES.map((table) => `${SCHEMA}.${table}`)]
  );
  return rows.filter((r) => !r.present).map((r) => r.name.replace(`${SCHEMA}.`, ''));
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
  replacedLegacyTables: string[];
  /** Tables that were missing before this run and are present now. */
  healed: string[];
}

export async function runMigrations(pool: pg.Pool): Promise<MigrationResult> {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const dir = migrationsDir();
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    : [];

  if (files.length === 0) {
    throw new Error(`No migration files found in ${dir}`);
  }

  const { rows } = await pool.query<{ version: string }>(
    `SELECT version FROM ${SCHEMA}.schema_migrations`
  );
  const recorded = new Set(rows.map((r) => r.version));
  const healed = await missingTables(pool);

  const applied: string[] = [];
  const skipped: string[] = [];

  // Every migration is written to be idempotent (CREATE ... IF NOT EXISTS) and is
  // executed on each boot. That heals a schema dropped outside a deploy, while the
  // schema_migrations table still records what has ever run successfully.
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Pin the target schema for this migration regardless of the pool default.
      await client.query(`SET LOCAL search_path TO ${SCHEMA}, public`);
      await client.query(sql);
      await client.query(
        `INSERT INTO ${SCHEMA}.schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING`,
        [file]
      );
      await client.query('COMMIT');
      if (recorded.has(file)) skipped.push(file);
      else applied.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }

  const stillMissing = await missingTables(pool);
  if (stillMissing.length > 0) {
    throw new Error(
      `Schema is incomplete after running migrations; missing: ${stillMissing.join(', ')}.`
    );
  }

  return {
    applied,
    skipped,
    replacedLegacyTables: [],
    healed: healed.filter((table) => !stillMissing.includes(table)),
  };
}
