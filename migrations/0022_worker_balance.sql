-- Worker balance system + cash payment commission
ALTER TABLE users ADD COLUMN IF NOT EXISTS balance integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS balance_gifted boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS balance_transactions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  type text NOT NULL,
  description text,
  related_service_id integer REFERENCES services(id) ON DELETE SET NULL,
  related_payment_id integer REFERENCES payments(id) ON DELETE SET NULL,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_balance_tx_user ON balance_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_balance_tx_created ON balance_transactions(created_at DESC);

-- Gift 5000 CLP a todos los trabajadores existentes que aún no recibieron el regalo
UPDATE users SET balance = balance + 5000, balance_gifted = true
WHERE role = 'worker' AND balance_gifted = false;

INSERT INTO balance_transactions (user_id, amount, type, description)
SELECT id, 5000, 'gift', 'Bono de bienvenida'
FROM users WHERE role = 'worker' AND balance_gifted = true
  AND NOT EXISTS (SELECT 1 FROM balance_transactions bt WHERE bt.user_id = users.id AND bt.type = 'gift');
