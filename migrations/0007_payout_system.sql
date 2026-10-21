DO $$ BEGIN CREATE TYPE payout_method AS ENUM ('paypal', 'bank_transfer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE payout_status AS ENUM ('pending', 'sent', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS payout_method payout_method,
  ADD COLUMN IF NOT EXISTS payout_paypal_email text,
  ADD COLUMN IF NOT EXISTS payout_bank_name text,
  ADD COLUMN IF NOT EXISTS payout_bank_account_type text,
  ADD COLUMN IF NOT EXISTS payout_bank_rut text,
  ADD COLUMN IF NOT EXISTS payout_bank_account_number text;

CREATE TABLE IF NOT EXISTS payouts (
  id serial PRIMARY KEY,
  payment_id integer NOT NULL REFERENCES payments(id),
  worker_id integer NOT NULL REFERENCES users(id),
  amount real NOT NULL,
  method payout_method NOT NULL,
  status payout_status NOT NULL DEFAULT 'pending',
  transaction_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_payouts_worker_id ON payouts(worker_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_payment_id ON payouts(payment_id);
