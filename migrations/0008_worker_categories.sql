-- Create worker_categories junction table for primary and secondary professions
CREATE TABLE IF NOT EXISTS worker_categories (
  id          SERIAL PRIMARY KEY,
  worker_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(worker_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_worker_categories_worker_id ON worker_categories(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_categories_category_id ON worker_categories(category_id);

-- Migrate existing data: insert primary from users.category_id
INSERT INTO worker_categories (worker_id, category_id, is_primary)
SELECT id, category_id, true
FROM users
WHERE role = 'worker' AND category_id IS NOT NULL
ON CONFLICT (worker_id, category_id) DO NOTHING;
