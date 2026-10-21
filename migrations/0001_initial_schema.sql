-- ============================================================
-- Fixxer - Initial Schema Migration
-- Safe to run multiple times (idempotent)
-- ============================================================

-- ENUMs (safe: DO block ignores if already exists)
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('client', 'worker', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'blocked', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE service_status AS ENUM ('pending', 'accepted', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('card', 'cash', 'transfer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE proposal_status AS ENUM ('pending', 'accepted', 'rejected', 'countered');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'service_request', 'service_accepted', 'service_completed',
    'new_message', 'payment', 'review', 'proposal_received',
    'proposal_accepted', 'proposal_rejected', 'counter_offer'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE kyc_status AS ENUM ('not_submitted', 'pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE kyc_document_type AS ENUM ('cedula', 'licencia');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id                    SERIAL PRIMARY KEY,
  name                  TEXT NOT NULL,
  email                 TEXT NOT NULL UNIQUE,
  password              TEXT NOT NULL,
  role                  user_role NOT NULL DEFAULT 'client',
  status                user_status NOT NULL DEFAULT 'active',
  phone                 TEXT,
  avatar_url            TEXT,
  bio                   TEXT,
  skills                TEXT,
  category_id           INTEGER REFERENCES categories(id),
  rating                REAL,
  total_reviews         INTEGER NOT NULL DEFAULT 0,
  client_rating         REAL,
  client_total_reviews  INTEGER NOT NULL DEFAULT 0,
  kyc_status            TEXT NOT NULL DEFAULT 'not_submitted',
  is_available          BOOLEAN NOT NULL DEFAULT FALSE,
  lat                   REAL,
  lng                   REAL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
  id              SERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  status          service_status NOT NULL DEFAULT 'pending',
  client_id       INTEGER NOT NULL REFERENCES users(id),
  worker_id       INTEGER REFERENCES users(id),
  category_id     INTEGER NOT NULL REFERENCES categories(id),
  estimated_price REAL,
  final_price     REAL,
  address         TEXT,
  lat             REAL,
  lng             REAL,
  image_urls      TEXT[] DEFAULT '{}',
  scheduled_at    TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id           SERIAL PRIMARY KEY,
  service_id   INTEGER NOT NULL REFERENCES services(id),
  sender_id    INTEGER NOT NULL REFERENCES users(id),
  content      TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  image_url    TEXT,
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id                SERIAL PRIMARY KEY,
  service_id        INTEGER NOT NULL REFERENCES services(id),
  client_id         INTEGER NOT NULL REFERENCES users(id),
  worker_id         INTEGER NOT NULL REFERENCES users(id),
  amount            REAL NOT NULL,
  commission_amount REAL NOT NULL,
  worker_amount     REAL NOT NULL,
  commission_rate   REAL NOT NULL,
  status            payment_status NOT NULL DEFAULT 'pending',
  method            payment_method,
  transaction_id    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reviews (
  id                 SERIAL PRIMARY KEY,
  service_id         INTEGER NOT NULL REFERENCES services(id),
  client_id          INTEGER NOT NULL REFERENCES users(id),
  worker_id          INTEGER NOT NULL REFERENCES users(id),
  rating             INTEGER NOT NULL,
  comment            TEXT,
  worker_rating      INTEGER,
  worker_comment     TEXT,
  reviewed_by_worker BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proposals (
  id              SERIAL PRIMARY KEY,
  service_id      INTEGER NOT NULL REFERENCES services(id),
  worker_id       INTEGER NOT NULL REFERENCES users(id),
  proposed_price  REAL NOT NULL,
  message         TEXT,
  status          proposal_status NOT NULL DEFAULT 'pending',
  counter_price   REAL,
  counter_message TEXT,
  last_counter_by TEXT,
  estimated_time  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  type       notification_type NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  related_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commission_config (
  id         SERIAL PRIMARY KEY,
  rate       REAL NOT NULL DEFAULT 0.15,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kyc_documents (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id),
  document_type      kyc_document_type NOT NULL DEFAULT 'cedula',
  rut                TEXT NOT NULL,
  full_name          TEXT NOT NULL,
  cedula_front_path  TEXT NOT NULL,
  cedula_back_path   TEXT NOT NULL,
  selfie_path        TEXT NOT NULL,
  status             kyc_status NOT NULL DEFAULT 'pending',
  rejection_reason   TEXT,
  reviewed_by        INTEGER REFERENCES users(id),
  reviewed_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_settings (
  id         SERIAL PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_role          ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_category_id   ON users(category_id);
CREATE INDEX IF NOT EXISTS idx_users_is_available  ON users(is_available);
CREATE INDEX IF NOT EXISTS idx_users_kyc_status    ON users(kyc_status);

CREATE INDEX IF NOT EXISTS idx_services_client_id   ON services(client_id);
CREATE INDEX IF NOT EXISTS idx_services_worker_id   ON services(worker_id);
CREATE INDEX IF NOT EXISTS idx_services_category_id ON services(category_id);
CREATE INDEX IF NOT EXISTS idx_services_status      ON services(status);

CREATE INDEX IF NOT EXISTS idx_messages_service_id ON messages(service_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id  ON messages(sender_id);

CREATE INDEX IF NOT EXISTS idx_payments_service_id ON payments(service_id);
CREATE INDEX IF NOT EXISTS idx_payments_client_id  ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_worker_id  ON payments(worker_id);
CREATE INDEX IF NOT EXISTS idx_payments_status     ON payments(status);

CREATE INDEX IF NOT EXISTS idx_proposals_service_id ON proposals(service_id);
CREATE INDEX IF NOT EXISTS idx_proposals_worker_id  ON proposals(worker_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status     ON proposals(status);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- ============================================================
-- DEFAULT SEED DATA
-- ============================================================

INSERT INTO commission_config (rate) 
SELECT 0.15 WHERE NOT EXISTS (SELECT 1 FROM commission_config);

INSERT INTO categories (name, description, icon, is_active) VALUES
  ('Plomería',      'Reparación e instalación de tuberías y sistemas de agua',      'Droplets',       TRUE),
  ('Electricidad',  'Instalación y reparación de sistemas eléctricos',              'Zap',            TRUE),
  ('Carpintería',   'Trabajos en madera, muebles y estructuras',                   'Hammer',         TRUE),
  ('Pintura',       'Pintura interior y exterior de espacios',                     'Paintbrush',     TRUE),
  ('Limpieza',      'Servicios de limpieza del hogar y oficinas',                  'Sparkles',       TRUE),
  ('Jardinería',    'Mantenimiento y diseño de jardines',                          'Leaf',           TRUE),
  ('Cerrajería',    'Apertura, cambio y reparación de cerraduras',                 'KeyRound',       TRUE),
  ('Mudanzas',      'Transporte y traslado de muebles y pertenencias',             'Truck',          TRUE),
  ('Climatización', 'Instalación y mantenimiento de aires acondicionados',         'Wind',           TRUE),
  ('Seguridad',     'Instalación de cámaras, alarmas y sistemas de seguridad',     'Shield',         TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO site_settings (key, value) VALUES
  ('app_name',          'Fixxer'),
  ('app_description',   'Marketplace de servicios del hogar'),
  ('commission_rate',   '15'),
  ('min_service_price', '10'),
  ('max_service_price', '10000')
ON CONFLICT (key) DO NOTHING;
