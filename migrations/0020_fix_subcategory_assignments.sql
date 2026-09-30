-- Fix subcategory assignments: 0016 inserted some subcategories under the wrong category_id.
-- Original approach (DELETE + re-INSERT) violates FK services_subcategory_id_fkey when
-- production already has services pointing to those subcategories.
-- This rewrite reassigns category_id by NAME instead, keeping subcategory.id stable so
-- the services FK stays valid. Idempotent: rows already in the right category are skipped.

-- Jardinería  → cat 3
UPDATE subcategories SET category_id = 3
WHERE name IN (
  'Corte de Césped',
  'Poda de Árboles y Arbustos',
  'Limpieza General de Basura y Deshierbe',
  'Mantención de Jardines'
) AND category_id <> 3;

-- Servicios Domésticos y Eventos → cat 4
UPDATE subcategories SET category_id = 4
WHERE name IN (
  'Asesora del Hogar',
  'Lavado y Planchado de Ropa',
  'Cocina y Preparación de Alimentos Domiciliario',
  'Cocina y Preparación de Alimentos para Eventos',
  'Garzones para Eventos',
  'Decoración y Montaje de Fiestas o Reuniones',
  'Animador y DJ Musical',
  'Payasos y Fiestas Infantiles'
) AND category_id <> 4;

-- Fletes y Mano de Obra → cat 5
UPDATE subcategories SET category_id = 5
WHERE name IN (
  'Servicios de Fletes',
  'Transporte de Carga en General',
  'Ayudante para Carga y Descarga',
  'Armado de Muebles',
  'Personal para Bodega y Logística',
  'Retiro de Escombros',
  'Mano de Obra en General (Jornalero)'
) AND category_id <> 5;

-- Salud, Bienestar y Cuidados → cat 6
UPDATE subcategories SET category_id = 6
WHERE name IN (
  'Cuidados de Adultos Mayores',
  'Cuidados de Personas con Movilidad Reducida',
  'Fisioterapia y Rehabilitación',
  'Acompañamiento Hospitalario y Domiciliario',
  'Peinados y Pintura de Cabello',
  'Manicurista y Pedicurista',
  'Técnico en Depilación',
  'Peluquero y Barbero'
) AND category_id <> 6;

-- Automotriz → cat 7
UPDATE subcategories SET category_id = 7
WHERE name IN (
  'Mantenciones y Mecánica en General',
  'Servicio de Vulcanizado y Neumáticos',
  'Electricidad Automotriz y Aire Acondicionado',
  'Lavado y Encerado de Vehículos',
  'Estética y Pulido de Vehículos',
  'Lavado de Tapiz, Techo, Asientos y Piso'
) AND category_id <> 7;

-- Personal para Mandados y Junior → cat 9
UPDATE subcategories SET category_id = 9
WHERE name IN (
  'Trámites en Instituciones Públicas/Privadas',
  'Compras y Retiro de Encomiendas',
  'Mensajería y Transporte de Encomiendas',
  'Gestión Varias',
  'Asistente Personal y Apoyo Administrativo Básico'
) AND category_id <> 9;

-- Cuidado y Estética Canina (Mascotas) → cat 10
UPDATE subcategories SET category_id = 10
WHERE name IN (
  'Baño y Peluquería Canina',
  'Paseo de Perros a Domicilio',
  'Accesorios para Mascotas',
  'Entrenamiento Básico y Adiestramiento',
  'Celebración de Cumpleaños para Mascotas'
) AND category_id <> 10;
