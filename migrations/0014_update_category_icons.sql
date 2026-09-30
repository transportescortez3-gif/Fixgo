-- Update category icons to better represent each category
UPDATE categories SET icon = 'Car'      WHERE name ILIKE '%automotriz%';
UPDATE categories SET icon = 'Heart'    WHERE name ILIKE '%salud%' OR name ILIKE '%bienestar%';
UPDATE categories SET icon = 'PawPrint' WHERE name ILIKE '%canina%' OR name ILIKE '%mascota%';
