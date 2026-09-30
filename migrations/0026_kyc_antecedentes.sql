-- Agrega campo para foto de antecedentes penales en KYC
ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS antecedentes_path TEXT NOT NULL DEFAULT '';
