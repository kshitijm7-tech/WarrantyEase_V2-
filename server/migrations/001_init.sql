-- WarrantyEase initial schema.
-- Owner ids are TEXT because the stable Clerk user id (`user_...`) is not a UUID.
-- Money is NUMERIC, dates are DATE, timestamps are TIMESTAMPTZ.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS warranties (
  id                       TEXT PRIMARY KEY,
  user_id                  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_name             TEXT NOT NULL,
  brand                    TEXT,
  category                 TEXT,
  model_number             TEXT,
  serial_number            TEXT,
  purchase_date            DATE NOT NULL,
  purchase_price           NUMERIC(12, 2),
  currency                 TEXT NOT NULL DEFAULT 'INR',
  warranty_duration_months INTEGER NOT NULL CHECK (warranty_duration_months > 0),
  expiry_date              DATE NOT NULL,
  seller                   TEXT,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT warranties_expiry_after_purchase CHECK (expiry_date >= purchase_date)
);

CREATE TABLE IF NOT EXISTS documents (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  warranty_id       TEXT REFERENCES warranties(id) ON DELETE SET NULL,
  original_filename TEXT NOT NULL,
  object_key        TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  file_size         INTEGER NOT NULL CHECK (file_size > 0),
  processing_status TEXT NOT NULL DEFAULT 'completed',
  file_data         BYTEA,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  warranty_id       TEXT NOT NULL REFERENCES warranties(id) ON DELETE CASCADE,
  reminder_type     TEXT NOT NULL,
  message           TEXT NOT NULL,
  is_read           BOOLEAN NOT NULL DEFAULT FALSE,
  deduplication_key TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes: every query is scoped by owner; expiry is the dashboard sort/filter.
CREATE INDEX IF NOT EXISTS idx_warranties_user_id      ON warranties (user_id);
CREATE INDEX IF NOT EXISTS idx_warranties_user_expiry  ON warranties (user_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_warranties_expiry_date  ON warranties (expiry_date);
CREATE INDEX IF NOT EXISTS idx_documents_user_id       ON documents (user_id);
CREATE INDEX IF NOT EXISTS idx_documents_warranty_id   ON documents (warranty_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id   ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread    ON notifications (user_id, is_read);

-- One reminder per warranty per trigger window. The unique index is what makes
-- reminder generation idempotent under concurrent cron/manual runs.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedup ON notifications (deduplication_key);
