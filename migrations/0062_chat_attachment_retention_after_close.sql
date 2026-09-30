-- La ventana de soporte empieza al cerrar el servicio, no al subir el archivo.
ALTER TABLE "chat_attachments"
  ALTER COLUMN "support_expires_at" DROP NOT NULL;