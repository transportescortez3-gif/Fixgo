-- Create subcategories table
CREATE TABLE IF NOT EXISTS subcategories (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 99,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert subcategories for each category
-- Category 1: Mantenciones y Reparaciones
INSERT INTO subcategories (category_id, name, sort_order) VALUES
  (1, 'Servicio de Gasfitería', 1),
  (1, 'Electricidad Domiciliaria e Industrial', 2),
  (1, 'Carpintería y Armado de Muebles', 3),
  (1, 'Cerrajería y Soldaduras', 4),
  (1, 'Albañilería y Pintura', 5),
  (1, 'Aire Acondicionado', 6),
  (1, 'Reparaciones de Electrodomésticos', 7),
  (1, 'Limpieza y Reparación de Techumbre', 8);

-- Category 2: Limpieza y Aseo
INSERT INTO subcategories (category_id, name, sort_order) VALUES
  (2, 'Aseo de Casas', 1),
  (2, 'Aseo de Departamentos', 2),
  (2, 'Aseo de Oficinas y Locales', 3),
  (2, 'Lavado de Alfombras y Tapices', 4),
  (2, 'Aseo Posterior a Construcción', 5),
  (2, 'Mantención a Áreas Comunes', 6);

-- Category 3: Jardinería (ID real en DB = 3)
INSERT INTO subcategories (category_id, name, sort_order) VALUES
  (3, 'Corte de Césped', 1),
  (3, 'Poda de Árboles y Arbustos', 2),
  (3, 'Limpieza General de Basura y Deshierbe', 3),
  (3, 'Mantención de Jardines', 4);

-- Category 4: Servicios Domésticos y Eventos (ID real en DB = 4)
INSERT INTO subcategories (category_id, name, sort_order) VALUES
  (4, 'Asesora del Hogar', 1),
  (4, 'Lavado y Planchado de Ropa', 2),
  (4, 'Cocina y Preparación de Alimentos Domiciliario', 3),
  (4, 'Cocina y Preparación de Alimentos para Eventos', 4),
  (4, 'Garzones para Eventos', 5),
  (4, 'Decoración y Montaje de Fiestas o Reuniones', 6),
  (4, 'Animador y DJ Musical', 7),
  (4, 'Payasos y Fiestas Infantiles', 8);

-- Category 5: Fletes y Mano de Obra (ID real en DB = 5)
INSERT INTO subcategories (category_id, name, sort_order) VALUES
  (5, 'Servicios de Fletes', 1),
  (5, 'Transporte de Carga en General', 2),
  (5, 'Ayudante para Carga y Descarga', 3),
  (5, 'Armado de Muebles', 4),
  (5, 'Personal para Bodega y Logística', 5),
  (5, 'Retiro de Escombros', 6),
  (5, 'Mano de Obra en General (Jornalero)', 7);

-- Category 6: Salud, Bienestar y Cuidados (ID real en DB = 6)
INSERT INTO subcategories (category_id, name, sort_order) VALUES
  (6, 'Cuidados de Adultos Mayores', 1),
  (6, 'Cuidados de Personas con Movilidad Reducida', 2),
  (6, 'Fisioterapia y Rehabilitación', 3),
  (6, 'Acompañamiento Hospitalario y Domiciliario', 4),
  (6, 'Peinados y Pintura de Cabello', 5),
  (6, 'Manicurista y Pedicurista', 6),
  (6, 'Técnico en Depilación', 7),
  (6, 'Peluquero y Barbero', 8);

-- Category 7: Automotriz (ID real en DB = 7)
INSERT INTO subcategories (category_id, name, sort_order) VALUES
  (7, 'Mantenciones y Mecánica en General', 1),
  (7, 'Servicio de Vulcanizado y Neumáticos', 2),
  (7, 'Electricidad Automotriz y Aire Acondicionado', 3),
  (7, 'Lavado y Encerado de Vehículos', 4),
  (7, 'Estética y Pulido de Vehículos', 5),
  (7, 'Lavado de Tapiz, Techo, Asientos y Piso', 6);

-- Category 8: Cámara de Seguridad y Alarmas (ID real en DB = 8)
INSERT INTO subcategories (category_id, name, sort_order) VALUES
  (8, 'Instalación de Cámaras de Vigilancia y DVR', 1),
  (8, 'Instalación y Mantenimiento de Alarmas', 2),
  (8, 'Sensores de Movimiento y Control de Acceso', 3);

-- Category 9: Personal para Mandados y Junior (ID real en DB = 9)
INSERT INTO subcategories (category_id, name, sort_order) VALUES
  (9, 'Trámites en Instituciones Públicas/Privadas', 1),
  (9, 'Compras y Retiro de Encomiendas', 2),
  (9, 'Mensajería y Transporte de Encomiendas', 3),
  (9, 'Gestión Varias', 4),
  (9, 'Asistente Personal y Apoyo Administrativo Básico', 5);

-- Category 10: Cuidado y Estética Canina (Mascotas) (ID real en DB = 10)
INSERT INTO subcategories (category_id, name, sort_order) VALUES
  (10, 'Baño y Peluquería Canina', 1),
  (10, 'Paseo de Perros a Domicilio', 2),
  (10, 'Accesorios para Mascotas', 3),
  (10, 'Entrenamiento Básico y Adiestramiento', 4),
  (10, 'Celebración de Cumpleaños para Mascotas', 5);
