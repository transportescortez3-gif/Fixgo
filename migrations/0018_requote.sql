ALTER TABLE services
  ADD COLUMN IF NOT EXISTS requote_price real,
  ADD COLUMN IF NOT EXISTS requote_status text,
  ADD COLUMN IF NOT EXISTS requote_message text,
  ADD COLUMN IF NOT EXISTS already_paid real;
