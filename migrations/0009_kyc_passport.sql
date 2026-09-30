-- Add passport to KYC document type enum
ALTER TYPE kyc_document_type ADD VALUE IF NOT EXISTS 'pasaporte';
