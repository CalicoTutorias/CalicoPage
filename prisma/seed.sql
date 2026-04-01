-- Seed majors
INSERT INTO majors (id, name, code, faculty, created_at, updated_at) VALUES
  (gen_random_uuid(), 'Ingeniería de Sistemas y Computación', 'ISIS', 'Ingeniería', NOW(), NOW()),
  (gen_random_uuid(), 'Ingeniería Industrial', 'IIND', 'Ingeniería', NOW(), NOW()),
  (gen_random_uuid(), 'Ingeniería Civil', 'ICIV', 'Ingeniería', NOW(), NOW()),
  (gen_random_uuid(), 'Ingeniería Electrónica', 'IELE', 'Ingeniería', NOW(), NOW()),
  (gen_random_uuid(), 'Ingeniería Mecánica', 'IMEC', 'Ingeniería', NOW(), NOW()),
  (gen_random_uuid(), 'Ingeniería Química', 'IQUI', 'Ingeniería', NOW(), NOW()),
  (gen_random_uuid(), 'Ingeniería Biomédica', 'IBIO', 'Ingeniería', NOW(), NOW()),
  (gen_random_uuid(), 'Ingeniería Ambiental', 'IAMB', 'Ingeniería', NOW(), NOW()),
  (gen_random_uuid(), 'Administración de Empresas', 'ADMI', 'Administración', NOW(), NOW()),
  (gen_random_uuid(), 'Economía', 'ECON', 'Economía', NOW(), NOW()),
  (gen_random_uuid(), 'Derecho', 'DERE', 'Derecho', NOW(), NOW()),
  (gen_random_uuid(), 'Medicina', 'MEDI', 'Medicina', NOW(), NOW()),
  (gen_random_uuid(), 'Psicología', 'PSIC', 'Ciencias Sociales', NOW(), NOW()),
  (gen_random_uuid(), 'Ciencia Política', 'CPOL', 'Ciencias Sociales', NOW(), NOW()),
  (gen_random_uuid(), 'Matemáticas', 'MATE', 'Ciencias', NOW(), NOW()),
  (gen_random_uuid(), 'Física', 'FISI', 'Ciencias', NOW(), NOW()),
  (gen_random_uuid(), 'Arquitectura', 'ARQU', 'Arquitectura y Diseño', NOW(), NOW()),
  (gen_random_uuid(), 'Diseño', 'DISE', 'Arquitectura y Diseño', NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  faculty = EXCLUDED.faculty,
  updated_at = NOW();
