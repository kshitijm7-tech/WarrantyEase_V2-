import pg from 'pg';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { runMigrations } from './migrate.js';

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface Warranty {
  id: string;
  user_id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  model_number: string | null;
  serial_number: string | null;
  purchase_date: string;
  purchase_price: number | null;
  currency: string;
  warranty_duration_months: number;
  expiry_date: string;
  seller: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRecord {
  id: string;
  user_id: string;
  warranty_id: string | null;
  original_filename: string;
  object_key: string;
  mime_type: string;
  file_size: number;
  processing_status: string;
  file_data?: Buffer | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationRecord {
  id: string;
  user_id: string;
  warranty_id: string;
  reminder_type: string;
  message: string;
  is_read: boolean;
  deduplication_key: string;
  created_at: string;
  // joined warranty info
  product_name?: string;
  expiry_date?: string;
}

// Database client abstraction supporting both PostgreSQL (AntiDeploy DATABASE_URL)
// and SQLite (local dev fallback)
class DatabaseManager {
  private pgPool: pg.Pool | null = null;
  private sqliteDb: Database.Database | null = null;
  public isPostgres = false;

  public async init() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl && process.env.NODE_ENV === 'production') {
      throw new Error(
        'DATABASE_URL is not set. The deployed application requires the platform PostgreSQL database.'
      );
    }
    if (dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))) {
      try {
        console.log('[DB] Connecting to PostgreSQL at DATABASE_URL...');
        // pg turns DATE into a JS Date at local midnight, which breaks the
        // 'YYYY-MM-DD' contract the API and UI rely on (and shifts the day in
        // negative UTC offsets). Keep the raw calendar text instead.
        pg.types.setTypeParser(1082, (value: string) => value);
        // WarrantyEase keeps its tables in a dedicated schema. Another project
        // sharing this database therefore cannot collide with, or drop, them.
        this.pgPool = new pg.Pool({
          connectionString: dbUrl,
          ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false },
          max: 10,
        });

        // The managed pooler rejects the `options` startup parameter with 08P01,
        // so the search path is set on each physical connection instead. pg
        // serialises queries per connection, so this runs before user queries.
        this.pgPool.on('connect', (client) => {
          client.query('SET search_path TO warrantyease, public').catch((err: Error) => {
            console.error('[DB] Could not set search_path:', err.message);
          });
        });

        // Test connection and make sure the schema itself exists
        const client = await this.pgPool.connect();
        try {
          await client.query('CREATE SCHEMA IF NOT EXISTS warrantyease');
        } finally {
          client.release();
        }
        this.isPostgres = true;
        console.log('[DB] Connected to PostgreSQL successfully.');
        const migration = await runMigrations(this.pgPool);
        console.log(
          `[DB] Schema ready (applied: ${migration.applied.length || 'none'}, ` +
            `already applied: ${migration.skipped.length})` +
            (migration.replacedLegacyTables.length
              ? `; replaced empty legacy tables: ${migration.replacedLegacyTables.join(', ')}`
              : '')
        );
        return;
      } catch (err) {
        // A failed connection or migration must never leave the pool flagged as
        // usable: queries would then hit an empty Postgres schema. In production
        // this is fatal, so the deploy reports the real error instead of quietly
        // serving a half-working app.
        this.isPostgres = false;
        if (this.pgPool) {
          try {
            await this.pgPool.end();
          } catch {
            /* closing a broken pool is best effort */
          }
          this.pgPool = null;
        }
        if (process.env.NODE_ENV === 'production') {
          throw err;
        }
        console.error('[DB] PostgreSQL unavailable, falling back to SQLite:', err);
      }
    }

    // Local SQLite fallback
    console.log('[DB] Using local SQLite database (development fallback).');
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'warrantyease.db');
    this.sqliteDb = new Database(dbPath);
    this.sqliteDb.pragma('journal_mode = WAL');
    this.initSqliteSchema();
  }

  private async initPostgresSchema() {
    if (!this.pgPool) return;
    const query = `
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS warranties (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_name VARCHAR(255) NOT NULL,
        brand VARCHAR(255),
        category VARCHAR(100),
        model_number VARCHAR(255),
        serial_number VARCHAR(255),
        purchase_date DATE NOT NULL,
        purchase_price NUMERIC(12, 2),
        currency VARCHAR(10) DEFAULT 'INR',
        warranty_duration_months INTEGER NOT NULL,
        expiry_date DATE NOT NULL,
        seller VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS documents (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        warranty_id VARCHAR(255) REFERENCES warranties(id) ON DELETE SET NULL,
        original_filename VARCHAR(255) NOT NULL,
        object_key VARCHAR(500) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_size INTEGER NOT NULL,
        processing_status VARCHAR(50) DEFAULT 'completed',
        file_data BYTEA,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        warranty_id VARCHAR(255) NOT NULL REFERENCES warranties(id) ON DELETE CASCADE,
        reminder_type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        deduplication_key VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_warranties_user_id ON warranties(user_id);
      CREATE INDEX IF NOT EXISTS idx_warranties_expiry_date ON warranties(expiry_date);
      CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
      CREATE INDEX IF NOT EXISTS idx_documents_warranty_id ON documents(warranty_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
    `;
    await this.pgPool.query(query);
  }

  private initSqliteSchema() {
    if (!this.sqliteDb) return;
    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS warranties (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_name TEXT NOT NULL,
        brand TEXT,
        category TEXT,
        model_number TEXT,
        serial_number TEXT,
        purchase_date TEXT NOT NULL,
        purchase_price REAL,
        currency TEXT DEFAULT 'INR',
        warranty_duration_months INTEGER NOT NULL,
        expiry_date TEXT NOT NULL,
        seller TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        warranty_id TEXT REFERENCES warranties(id) ON DELETE SET NULL,
        original_filename TEXT NOT NULL,
        object_key TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        processing_status TEXT DEFAULT 'completed',
        file_data BLOB,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        warranty_id TEXT NOT NULL REFERENCES warranties(id) ON DELETE CASCADE,
        reminder_type TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        deduplication_key TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_warranties_user_id ON warranties(user_id);
      CREATE INDEX IF NOT EXISTS idx_warranties_expiry_date ON warranties(expiry_date);
      CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
      CREATE INDEX IF NOT EXISTS idx_documents_warranty_id ON documents(warranty_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
    `);
  }

  // --- Users ---
  public async createUser(name: string, email: string, passwordHash: string): Promise<User> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const normalizedEmail = email.trim().toLowerCase();

    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        `INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [id, name, normalizedEmail, passwordHash, now, now]
      );
      return res.rows[0];
    } else if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare(
        `INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      stmt.run(id, name, normalizedEmail, passwordHash, now, now);
      return { id, name, email: normalizedEmail, password_hash: passwordHash, created_at: now, updated_at: now };
    }
    throw new Error('Database not initialized');
  }

  public async getUserByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(`SELECT * FROM users WHERE email = $1`, [normalizedEmail]);
      return res.rows[0] || null;
    } else if (this.sqliteDb) {
      const row = this.sqliteDb.prepare(`SELECT * FROM users WHERE email = ?`).get(normalizedEmail) as User | undefined;
      return row || null;
    }
    return null;
  }

  public async getUserById(id: string): Promise<User | null> {
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(`SELECT * FROM users WHERE id = $1`, [id]);
      return res.rows[0] || null;
    } else if (this.sqliteDb) {
      const row = this.sqliteDb.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as User | undefined;
      return row || null;
    }
    return null;
  }

  public async updateUser(id: string, name: string): Promise<User | null> {
    const now = new Date().toISOString();
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        `UPDATE users SET name = $1, updated_at = $2 WHERE id = $3 RETURNING *`,
        [name, now, id]
      );
      return res.rows[0] || null;
    } else if (this.sqliteDb) {
      this.sqliteDb.prepare(`UPDATE users SET name = ?, updated_at = ? WHERE id = ?`).run(name, now, id);
      return this.getUserById(id);
    }
    return null;
  }

  public async upsertClerkUser(id: string, email: string, name: string): Promise<User> {
    const now = new Date().toISOString();
    const normalizedEmail = (email || `${id}@clerk.user`).trim().toLowerCase();
    const displayName = (name || 'Clerk User').trim();

    // Check if user already exists by ID
    const existingById = await this.getUserById(id);
    if (existingById) {
      if (displayName && existingById.name !== displayName && displayName !== 'Clerk User') {
        return (await this.updateUser(id, displayName)) || existingById;
      }
      return existingById;
    }

    // Insert Clerk authenticated user
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        `INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = EXCLUDED.updated_at
         RETURNING *`,
        [id, displayName, normalizedEmail, 'clerk_authenticated', now, now]
      );
      return res.rows[0];
    } else if (this.sqliteDb) {
      this.sqliteDb.prepare(
        `INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`
      ).run(id, displayName, normalizedEmail, 'clerk_authenticated', now, now);
      return { id, name: displayName, email: normalizedEmail, password_hash: 'clerk_authenticated', created_at: now, updated_at: now };
    }
    throw new Error('Database not initialized');
  }

  public async getAllUserIds(): Promise<string[]> {
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query<{ id: string }>('SELECT id FROM users');
      return res.rows.map((r) => r.id);
    } else if (this.sqliteDb) {
      return (this.sqliteDb.prepare('SELECT id FROM users').all() as { id: string }[]).map((r) => r.id);
    }
    return [];
  }

  // --- Warranties ---
  public async getWarranties(
    userId: string,
    filters?: { search?: string; category?: string; status?: string; sortBy?: string }
  ): Promise<(Warranty & { linked_documents?: DocumentRecord[] })[]> {
    let warranties: Warranty[] = [];

    if (this.isPostgres && this.pgPool) {
      let query = `SELECT * FROM warranties WHERE user_id = $1`;
      const params: any[] = [userId];

      if (filters?.category && filters.category !== 'all') {
        params.push(filters.category);
        query += ` AND category = $${params.length}`;
      }

      if (filters?.search) {
        params.push(`%${filters.search}%`);
        query += ` AND (product_name ILIKE $${params.length} OR brand ILIKE $${params.length} OR model_number ILIKE $${params.length} OR seller ILIKE $${params.length})`;
      }

      query += ` ORDER BY expiry_date ASC`;
      const res = await this.pgPool.query(query, params);
      warranties = res.rows;
    } else if (this.sqliteDb) {
      let query = `SELECT * FROM warranties WHERE user_id = ?`;
      const params: any[] = [userId];

      if (filters?.category && filters.category !== 'all') {
        params.push(filters.category);
        query += ` AND category = ?`;
      }

      if (filters?.search) {
        params.push(`%${filters.search}%`);
        query += ` AND (product_name LIKE ? OR brand LIKE ? OR model_number LIKE ? OR seller LIKE ?)`;
        params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
      }

      query += ` ORDER BY expiry_date ASC`;
      warranties = this.sqliteDb.prepare(query).all(...params) as Warranty[];
    }

    // Attach linked documents
    const result: (Warranty & { linked_documents?: DocumentRecord[] })[] = [];
    for (const w of warranties) {
      const docs = await this.getDocumentsForWarranty(w.id, userId);
      result.push({ ...w, linked_documents: docs });
    }

    return result;
  }

  public async getWarrantyById(id: string, userId: string): Promise<(Warranty & { linked_documents?: DocumentRecord[] }) | null> {
    let warranty: Warranty | null = null;
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(`SELECT * FROM warranties WHERE id = $1 AND user_id = $2`, [id, userId]);
      warranty = res.rows[0] || null;
    } else if (this.sqliteDb) {
      const row = this.sqliteDb.prepare(`SELECT * FROM warranties WHERE id = ? AND user_id = ?`).get(id, userId) as Warranty | undefined;
      warranty = row || null;
    }

    if (!warranty) return null;
    const docs = await this.getDocumentsForWarranty(id, userId);
    return { ...warranty, linked_documents: docs };
  }

  public async createWarranty(
    userId: string,
    data: {
      product_name: string;
      brand?: string | null;
      category?: string | null;
      model_number?: string | null;
      serial_number?: string | null;
      purchase_date: string;
      purchase_price?: number | null;
      currency?: string;
      warranty_duration_months: number;
      expiry_date: string;
      seller?: string | null;
      notes?: string | null;
    }
  ): Promise<Warranty> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const currency = data.currency || 'INR';

    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        `INSERT INTO warranties (
          id, user_id, product_name, brand, category, model_number, serial_number,
          purchase_date, purchase_price, currency, warranty_duration_months,
          expiry_date, seller, notes, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          id, userId, data.product_name, data.brand || null, data.category || null,
          data.model_number || null, data.serial_number || null, data.purchase_date,
          data.purchase_price || null, currency, data.warranty_duration_months,
          data.expiry_date, data.seller || null, data.notes || null, now, now
        ]
      );
      return res.rows[0];
    } else if (this.sqliteDb) {
      this.sqliteDb.prepare(
        `INSERT INTO warranties (
          id, user_id, product_name, brand, category, model_number, serial_number,
          purchase_date, purchase_price, currency, warranty_duration_months,
          expiry_date, seller, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, userId, data.product_name, data.brand || null, data.category || null,
        data.model_number || null, data.serial_number || null, data.purchase_date,
        data.purchase_price || null, currency, data.warranty_duration_months,
        data.expiry_date, data.seller || null, data.notes || null, now, now
      );
      return {
        id,
        user_id: userId,
        product_name: data.product_name,
        brand: data.brand || null,
        category: data.category || null,
        model_number: data.model_number || null,
        serial_number: data.serial_number || null,
        purchase_date: data.purchase_date,
        purchase_price: data.purchase_price || null,
        currency,
        warranty_duration_months: data.warranty_duration_months,
        expiry_date: data.expiry_date,
        seller: data.seller || null,
        notes: data.notes || null,
        created_at: now,
        updated_at: now
      };
    }
    throw new Error('Database not initialized');
  }

  public async updateWarranty(
    id: string,
    userId: string,
    data: Partial<Omit<Warranty, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
  ): Promise<Warranty | null> {
    const existing = await this.getWarrantyById(id, userId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated = {
      product_name: data.product_name ?? existing.product_name,
      brand: data.brand !== undefined ? data.brand : existing.brand,
      category: data.category !== undefined ? data.category : existing.category,
      model_number: data.model_number !== undefined ? data.model_number : existing.model_number,
      serial_number: data.serial_number !== undefined ? data.serial_number : existing.serial_number,
      purchase_date: data.purchase_date ?? existing.purchase_date,
      purchase_price: data.purchase_price !== undefined ? data.purchase_price : existing.purchase_price,
      currency: data.currency ?? existing.currency,
      warranty_duration_months: data.warranty_duration_months ?? existing.warranty_duration_months,
      expiry_date: data.expiry_date ?? existing.expiry_date,
      seller: data.seller !== undefined ? data.seller : existing.seller,
      notes: data.notes !== undefined ? data.notes : existing.notes,
    };

    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        `UPDATE warranties SET
          product_name = $1, brand = $2, category = $3, model_number = $4,
          serial_number = $5, purchase_date = $6, purchase_price = $7,
          currency = $8, warranty_duration_months = $9, expiry_date = $10,
          seller = $11, notes = $12, updated_at = $13
        WHERE id = $14 AND user_id = $15
        RETURNING *`,
        [
          updated.product_name, updated.brand, updated.category, updated.model_number,
          updated.serial_number, updated.purchase_date, updated.purchase_price,
          updated.currency, updated.warranty_duration_months, updated.expiry_date,
          updated.seller, updated.notes, now, id, userId
        ]
      );
      return res.rows[0] || null;
    } else if (this.sqliteDb) {
      this.sqliteDb.prepare(
        `UPDATE warranties SET
          product_name = ?, brand = ?, category = ?, model_number = ?,
          serial_number = ?, purchase_date = ?, purchase_price = ?,
          currency = ?, warranty_duration_months = ?, expiry_date = ?,
          seller = ?, notes = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`
      ).run(
        updated.product_name, updated.brand, updated.category, updated.model_number,
        updated.serial_number, updated.purchase_date, updated.purchase_price,
        updated.currency, updated.warranty_duration_months, updated.expiry_date,
        updated.seller, updated.notes, now, id, userId
      );
      return this.getWarrantyById(id, userId);
    }
    return null;
  }

  public async deleteWarranty(id: string, userId: string): Promise<boolean> {
    if (this.isPostgres && this.pgPool) {
      // Unlink documents first
      await this.pgPool.query(`UPDATE documents SET warranty_id = NULL WHERE warranty_id = $1`, [id]);
      const res = await this.pgPool.query(`DELETE FROM warranties WHERE id = $1 AND user_id = $2`, [id, userId]);
      return (res.rowCount || 0) > 0;
    } else if (this.sqliteDb) {
      this.sqliteDb.prepare(`UPDATE documents SET warranty_id = NULL WHERE warranty_id = ?`).run(id);
      const res = this.sqliteDb.prepare(`DELETE FROM warranties WHERE id = ? AND user_id = ?`).run(id, userId);
      return res.changes > 0;
    }
    return false;
  }

  // --- Documents ---
  public async createDocument(
    userId: string,
    data: {
      original_filename: string;
      object_key: string;
      mime_type: string;
      file_size: number;
      warranty_id?: string | null;
      file_data?: Buffer | null;
    }
  ): Promise<DocumentRecord> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        `INSERT INTO documents (
          id, user_id, warranty_id, original_filename, object_key,
          mime_type, file_size, processing_status, file_data, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, user_id, warranty_id, original_filename, object_key, mime_type, file_size, processing_status, created_at, updated_at`,
        [
          id, userId, data.warranty_id || null, data.original_filename, data.object_key,
          data.mime_type, data.file_size, 'completed', data.file_data || null, now, now
        ]
      );
      return res.rows[0];
    } else if (this.sqliteDb) {
      this.sqliteDb.prepare(
        `INSERT INTO documents (
          id, user_id, warranty_id, original_filename, object_key,
          mime_type, file_size, processing_status, file_data, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, userId, data.warranty_id || null, data.original_filename, data.object_key,
        data.mime_type, data.file_size, 'completed', data.file_data || null, now, now
      );
      return {
        id,
        user_id: userId,
        warranty_id: data.warranty_id || null,
        original_filename: data.original_filename,
        object_key: data.object_key,
        mime_type: data.mime_type,
        file_size: data.file_size,
        processing_status: 'completed',
        created_at: now,
        updated_at: now
      };
    }
    throw new Error('Database not initialized');
  }

  public async getDocuments(userId: string): Promise<(DocumentRecord & { product_name?: string })[]> {
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        `SELECT d.id, d.user_id, d.warranty_id, d.original_filename, d.object_key,
                d.mime_type, d.file_size, d.processing_status, d.created_at, d.updated_at,
                w.product_name
         FROM documents d
         LEFT JOIN warranties w ON d.warranty_id = w.id
         WHERE d.user_id = $1
         ORDER BY d.created_at DESC`,
        [userId]
      );
      return res.rows;
    } else if (this.sqliteDb) {
      return this.sqliteDb.prepare(
        `SELECT d.id, d.user_id, d.warranty_id, d.original_filename, d.object_key,
                d.mime_type, d.file_size, d.processing_status, d.created_at, d.updated_at,
                w.product_name
         FROM documents d
         LEFT JOIN warranties w ON d.warranty_id = w.id
         WHERE d.user_id = ?
         ORDER BY d.created_at DESC`
      ).all(userId) as (DocumentRecord & { product_name?: string })[];
    }
    return [];
  }

  public async getDocumentById(id: string, userId: string, includeData = false): Promise<DocumentRecord | null> {
    const fields = includeData ? '*' : 'id, user_id, warranty_id, original_filename, object_key, mime_type, file_size, processing_status, created_at, updated_at';
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(`SELECT ${fields} FROM documents WHERE id = $1 AND user_id = $2`, [id, userId]);
      return res.rows[0] || null;
    } else if (this.sqliteDb) {
      const row = this.sqliteDb.prepare(`SELECT ${fields} FROM documents WHERE id = ? AND user_id = ?`).get(id, userId) as DocumentRecord | undefined;
      return row || null;
    }
    return null;
  }

  public async getDocumentsForWarranty(warrantyId: string, userId: string): Promise<DocumentRecord[]> {
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        `SELECT id, user_id, warranty_id, original_filename, object_key, mime_type, file_size, processing_status, created_at, updated_at
         FROM documents WHERE warranty_id = $1 AND user_id = $2 ORDER BY created_at DESC`,
        [warrantyId, userId]
      );
      return res.rows;
    } else if (this.sqliteDb) {
      return this.sqliteDb.prepare(
        `SELECT id, user_id, warranty_id, original_filename, object_key, mime_type, file_size, processing_status, created_at, updated_at
         FROM documents WHERE warranty_id = ? AND user_id = ? ORDER BY created_at DESC`
      ).all(warrantyId, userId) as DocumentRecord[];
    }
    return [];
  }

  public async linkDocumentToWarranty(documentId: string, warrantyId: string | null, userId: string): Promise<boolean> {
    const now = new Date().toISOString();
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        `UPDATE documents SET warranty_id = $1, updated_at = $2 WHERE id = $3 AND user_id = $4`,
        [warrantyId, now, documentId, userId]
      );
      return (res.rowCount || 0) > 0;
    } else if (this.sqliteDb) {
      const res = this.sqliteDb.prepare(
        `UPDATE documents SET warranty_id = ?, updated_at = ? WHERE id = ? AND user_id = ?`
      ).run(warrantyId, now, documentId, userId);
      return res.changes > 0;
    }
    return false;
  }

  public async deleteDocument(id: string, userId: string): Promise<DocumentRecord | null> {
    const doc = await this.getDocumentById(id, userId);
    if (!doc) return null;

    if (this.isPostgres && this.pgPool) {
      await this.pgPool.query(`DELETE FROM documents WHERE id = $1 AND user_id = $2`, [id, userId]);
    } else if (this.sqliteDb) {
      this.sqliteDb.prepare(`DELETE FROM documents WHERE id = ? AND user_id = ?`).run(id, userId);
    }
    return doc;
  }

  // --- Notifications ---
  public async getNotifications(userId: string): Promise<{ items: NotificationRecord[]; unreadCount: number }> {
    let items: NotificationRecord[] = [];
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        `SELECT n.*, w.product_name, w.expiry_date
         FROM notifications n
         LEFT JOIN warranties w ON n.warranty_id = w.id
         WHERE n.user_id = $1
         ORDER BY n.created_at DESC`,
        [userId]
      );
      items = res.rows.map(r => ({ ...r, is_read: Boolean(r.is_read) }));
    } else if (this.sqliteDb) {
      const rows = this.sqliteDb.prepare(
        `SELECT n.*, w.product_name, w.expiry_date
         FROM notifications n
         LEFT JOIN warranties w ON n.warranty_id = w.id
         WHERE n.user_id = ?
         ORDER BY n.created_at DESC`
      ).all(userId) as any[];
      items = rows.map(r => ({ ...r, is_read: Boolean(r.is_read) }));
    }

    const unreadCount = items.filter(n => !n.is_read).length;
    return { items, unreadCount };
  }

  public async markNotificationRead(id: string, userId: string): Promise<boolean> {
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(`UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`, [id, userId]);
      return (res.rowCount || 0) > 0;
    } else if (this.sqliteDb) {
      const res = this.sqliteDb.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`).run(id, userId);
      return res.changes > 0;
    }
    return false;
  }

  public async markAllNotificationsRead(userId: string): Promise<number> {
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(`UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`, [userId]);
      return res.rowCount || 0;
    } else if (this.sqliteDb) {
      const res = this.sqliteDb.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`).run(userId);
      return res.changes;
    }
    return 0;
  }

  public async createNotificationIfNotExists(
    userId: string,
    warrantyId: string,
    reminderType: string,
    message: string,
    deduplicationKey: string
  ): Promise<boolean> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    if (this.isPostgres && this.pgPool) {
      try {
        await this.pgPool.query(
          `INSERT INTO notifications (id, user_id, warranty_id, reminder_type, message, is_read, deduplication_key, created_at)
           VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7)
           ON CONFLICT (deduplication_key) DO NOTHING`,
          [id, userId, warrantyId, reminderType, message, deduplicationKey, now]
        );
        return true;
      } catch (err) {
        return false;
      }
    } else if (this.sqliteDb) {
      try {
        const stmt = this.sqliteDb.prepare(
          `INSERT OR IGNORE INTO notifications (id, user_id, warranty_id, reminder_type, message, is_read, deduplication_key, created_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
        );
        const res = stmt.run(id, userId, warrantyId, reminderType, message, deduplicationKey, now);
        return res.changes > 0;
      } catch (err) {
        return false;
      }
    }
    return false;
  }

  // --- Dashboard Summary ---
  public async getDashboardMetrics(userId: string) {
    const warranties = await this.getWarranties(userId);
    const documents = await this.getDocuments(userId);

    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const msPerDay = 24 * 60 * 60 * 1000;

    let total = warranties.length;
    let active = 0;
    let expiringSoon = 0;
    let expired = 0;

    const enrichedWarranties = warranties.map((w) => {
      const parts = w.expiry_date.split('-').map(Number);
      const expiryUtc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
      const remainingDays = Math.round((expiryUtc - todayUtc) / msPerDay);
      let status: 'active' | 'expiring_soon' | 'expiring_today' | 'expired' = 'active';
      if (remainingDays < 0) {
        status = 'expired';
      } else if (remainingDays === 0) {
        status = 'expiring_today';
      } else if (remainingDays <= 30) {
        status = 'expiring_soon';
      }
      return {
        ...w,
        remaining_days: remainingDays,
        status,
      };
    });

    const upcomingList: any[] = [];

    for (const w of enrichedWarranties) {
      if (w.status === 'expired') {
        expired++;
      } else if (w.status === 'expiring_soon' || w.status === 'expiring_today') {
        expiringSoon++;
        active++;
        upcomingList.push(w);
      } else {
        active++;
      }
    }

    upcomingList.sort((a, b) => a.remaining_days - b.remaining_days);

    return {
      total_warranties: total,
      active_warranties: active,
      expiring_soon: expiringSoon,
      expired_warranties: expired,
      upcoming_expiries: upcomingList.slice(0, 5),
      recent_warranties: enrichedWarranties.slice(0, 5),
      recent_documents: documents.slice(0, 5),
      database_type: this.isPostgres ? 'postgresql' : 'sqlite',
    };
  }
}

export const db = new DatabaseManager();
