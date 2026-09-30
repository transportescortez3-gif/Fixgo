-- Agrega tipos de notificación para KYC y reseñas
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'kyc_approved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'kyc_rejected';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_review';
