-- Add security selfie fields to services table
ALTER TABLE services ADD COLUMN IF NOT EXISTS client_selfie_url text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS worker_selfie_url text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS client_selfie_taken_at timestamptz;
ALTER TABLE services ADD COLUMN IF NOT EXISTS worker_selfie_taken_at timestamptz;

-- Add worker selfie to proposals table
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS worker_selfie_url text;
