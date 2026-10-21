ALTER TABLE users
  ADD COLUMN IF NOT EXISTS payout_data_consent boolean NOT NULL DEFAULT false;