-- Reparación: los mensajes enviados después de aceptar una propuesta se
-- guardaban con worker_id NULL (el POST solo asignaba threadWorkerId en
-- servicios pendientes). El historial GET filtra por worker_id, por lo que
-- esos mensajes quedaban invisibles ("se perdían" al salir del chat).
--
-- Alcance: solo se rellenan mensajes creados DESPUÉS del momento de
-- aceptación (con 1 min de holgura), para no mover al hilo del trabajador
-- aceptado mensajes NULL anómalos de la fase pendiente. El momento de
-- aceptación se estima con el más temprano de dos marcadores:
--   1. El primer mensaje de sistema en el hilo del trabajador asignado
--      ("✅ Cliente eligió a este especialista…", insertado al aceptar).
--   2. updated_at de la propuesta aceptada de ese trabajador.
-- Si ningún marcador existe (flujos sin propuesta, ej. solicitud directa),
-- se rellena igual: en esos servicios no hubo hilos de otros trabajadores.
UPDATE messages m
SET worker_id = s.worker_id
FROM services s
LEFT JOIN LATERAL (
  SELECT LEAST(
    (SELECT MIN(m2.created_at) FROM messages m2
       WHERE m2.service_id = s.id
         AND m2.worker_id = s.worker_id
         AND m2.message_type = 'system'),
    (SELECT MIN(p.updated_at) FROM proposals p
       WHERE p.service_id = s.id
         AND p.worker_id = s.worker_id
         AND p.status = 'accepted')
  ) AS accepted_at
) acc ON TRUE
WHERE m.service_id = s.id
  AND m.worker_id IS NULL
  AND s.worker_id IS NOT NULL
  AND (acc.accepted_at IS NULL OR m.created_at >= acc.accepted_at - interval '1 minute');
