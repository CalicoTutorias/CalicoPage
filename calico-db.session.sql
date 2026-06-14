-- Seed base departments and careers using the current Prisma schema.
-- Prisma models:
--   Department(id, code, name) -> departments
--   Career(id, code, name, departmentId) -> careers.department_id




  INSERT INTO courses (id, code, name, complexity, base_price, department_id) VALUES
  (gen_random_uuid(), 'ISIS1001', 'Introducción a la Ingeniería de Sistemas',          'Introductory', 35000, (SELECT id FROM departments WHERE code = 'DISC')),
  (gen_random_uuid(), 'ISIS1221', 'Introducción a la Programación',                    'Introductory', 35000, (SELECT id FROM departments WHERE code = 'DISC')),
  (gen_random_uuid(), 'ISIS1107', 'Fundamentos Matemáticos para Computación',          'Foundational', 45000, (SELECT id FROM departments WHERE code = 'DISC')),
  (gen_random_uuid(), 'ISIS1225', 'Estructuras de datos y algoritmos',                 'Foundational', 45000, (SELECT id FROM departments WHERE code = 'DISC')),
  (gen_random_uuid(), 'ISIS1226', 'Diseño y Programación Orientada a Objetos',         'Foundational', 45000, (SELECT id FROM departments WHERE code = 'DISC')),
  (gen_random_uuid(), 'ISIS1511', 'Fundamentos de Bases de Datos',                     'Foundational', 45000, (SELECT id FROM departments WHERE code = 'DISC')),
  (gen_random_uuid(), 'ISIS1611', 'Inteligencia Artificial',                           'Foundational', 45000, (SELECT id FROM departments WHERE code = 'DISC')),
  (gen_random_uuid(), 'ISIS2111', 'Elementos Esenciales de Lenguajes de Programación', 'Foundational', 45000, (SELECT id FROM departments WHERE code = 'DISC')),
  (gen_random_uuid(), 'ISIS2211', 'Ingeniería de Software Moderna',                    'Foundational', 45000, (SELECT id FROM departments WHERE code = 'DISC')),
  (gen_random_uuid(), 'ISIS1311', 'Tecnologías e Infraestructura de cómputo',          'Introductory', 35000, (SELECT id FROM departments WHERE code = 'DISC')),
  (gen_random_uuid(), 'ISIS2212', 'Arquitecturas de Software Robustas',                'Challenging',  55000, (SELECT id FROM departments WHERE code = 'DISC')),
  (gen_random_uuid(), 'ISIS2311', 'Redes y Servicios de Comunicaciones',               'Foundational', 45000, (SELECT id FROM departments WHERE code = 'DISC')),
  (gen_random_uuid(), 'ISIS2411', 'Ingeniería de Negocios Digitales',                  'Foundational', 45000, (SELECT id FROM departments WHERE code = 'DISC')),
  (gen_random_uuid(), 'ISIS2611', 'Aprendizaje de Máquina',                            'Challenging',  55000, (SELECT id FROM departments WHERE code = 'DISC')),
  (gen_random_uuid(), 'ISIS2011', 'Productos Digitales Innovadores',                   'Challenging',  55000, (SELECT id FROM departments WHERE code = 'DISC')),
  (gen_random_uuid(), 'ISIS2112', 'Diseño de Algoritmos',                              'Challenging',  55000, (SELECT id FROM departments WHERE code = 'DISC')),
  (gen_random_uuid(), 'ISIS2213', 'Diseño de Aplicaciones Complejas',                  'Challenging',  55000, (SELECT id FROM departments WHERE code = 'DISC')),
  (gen_random_uuid(), 'ISIS2214', 'Tecnologías Emergentes',                            'Challenging',  55000, (SELECT id FROM departments WHERE code = 'DISC')),
  (gen_random_uuid(), 'ISIS3311', 'Ciberseguridad',                                    'Challenging',  55000, (SELECT id FROM departments WHERE code = 'DISC')),
  (gen_random_uuid(), 'ISIS3211', 'Fábricas de Software Globales',                     'Challenging',  55000, (SELECT id FROM departments WHERE code = 'DISC'));

-- ─── DMAT (Matemáticas) ───────────────────────────────────────────────────────
INSERT INTO courses (id, code, name, complexity, base_price, department_id) VALUES
  (gen_random_uuid(), 'MATE1201', 'Pre-cálculo',                                     'Introductory', 35000, (SELECT id FROM departments WHERE code = 'DMAT')),
  (gen_random_uuid(), 'MATE1203', 'Cálculo Diferencial',                             'Introductory', 35000, (SELECT id FROM departments WHERE code = 'DMAT')),
  (gen_random_uuid(), 'MATE1214', 'Cálculo Integral y Ecuaciones Diferenciales',     'Foundational', 45000, (SELECT id FROM departments WHERE code = 'DMAT')),
  (gen_random_uuid(), 'MATE1105', 'Algebra Lineal',                                  'Foundational', 45000, (SELECT id FROM departments WHERE code = 'DMAT')),
  (gen_random_uuid(), 'MATE1207', 'Cálculo Vectorial',                               'Foundational', 45000, (SELECT id FROM departments WHERE code = 'DMAT'));

-- ─── IIND (Ingeniería Industrial) ────────────────────────────────────────────
INSERT INTO courses (id, code, name, complexity, base_price, department_id) VALUES
  (gen_random_uuid(), 'IIND2401', 'Análisis de Decisión de Inversión',               'Foundational', 45000, (SELECT id FROM departments WHERE code = 'IIND')),
  (gen_random_uuid(), 'IIND2106', 'Probabilidad y Estadística',                      'Foundational', 45000, (SELECT id FROM departments WHERE code = 'IIND'));

-- ─── DFIS (Física) ───────────────────────────────────────────────────────────
INSERT INTO courses (id, code, name, complexity, base_price, department_id) VALUES
  (gen_random_uuid(), 'FISIA', 'Física A (Electromagnetismo)',                       'Foundational', 45000, (SELECT id FROM departments WHERE code = 'DFIS')),
  (gen_random_uuid(), 'FISIB', 'Física B (Física para Computación Cuántica)',        'Challenging',  55000, (SELECT id FROM departments WHERE code = 'DFIS'));


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TOPICS (Inferidos a modo de estructura base)
-- ─────────────────────────────────────────────────────────────────────────────

-- ISIS1001 — Introducción a la Ingeniería de Sistemas
INSERT INTO topics (id, course_id, name, description) VALUES
  (gen_random_uuid(), (SELECT id FROM courses WHERE code='ISIS1001'), 'Conceptos básicos de sistemas', NULL),
  (gen_random_uuid(), (SELECT id FROM courses WHERE code='ISIS1001'), 'Pensamiento sistémico', NULL);

-- ISIS1221 — Introducción a la Programación
INSERT INTO topics (id, course_id, name, description) VALUES
  (gen_random_uuid(), (SELECT id FROM courses WHERE code='ISIS1221'), 'Variables, condicionales y ciclos', NULL),
  (gen_random_uuid(), (SELECT id FROM courses WHERE code='ISIS1221'), 'Funciones y arreglos', NULL);

-- ISIS1225 — Estructuras de datos y algoritmos
INSERT INTO topics (id, course_id, name, description) VALUES
  (gen_random_uuid(), (SELECT id FROM courses WHERE code='ISIS1225'), 'Listas, pilas y colas', NULL),
  (gen_random_uuid(), (SELECT id FROM courses WHERE code='ISIS1225'), 'Árboles y grafos', NULL);

-- ISIS1511 — Fundamentos de Bases de Datos
INSERT INTO topics (id, course_id, name, description) VALUES
  (gen_random_uuid(), (SELECT id FROM courses WHERE code='ISIS1511'), 'Modelo entidad-relación', NULL),
  (gen_random_uuid(), (SELECT id FROM courses WHERE code='ISIS1511'), 'Lenguaje SQL y normalización', NULL);

-- ISIS1611 — Inteligencia Artificial
INSERT INTO topics (id, course_id, name, description) VALUES
  (gen_random_uuid(), (SELECT id FROM courses WHERE code='ISIS1611'), 'Agentes y algoritmos de búsqueda', NULL),
  (gen_random_uuid(), (SELECT id FROM courses WHERE code='ISIS1611'), 'Representación del conocimiento', NULL);

-- ISIS2211 — Ingeniería de Software Moderna
INSERT INTO topics (id, course_id, name, description) VALUES
  (gen_random_uuid(), (SELECT id FROM courses WHERE code='ISIS2211'), 'Metodologías ágiles (Scrum, Kanban)', NULL),
  (gen_random_uuid(), (SELECT id FROM courses WHERE code='ISIS2211'), 'Integración y despliegue continuo (CI/CD)', NULL);

-- ISIS3311 — Ciberseguridad
INSERT INTO topics (id, course_id, name, description) VALUES
  (gen_random_uuid(), (SELECT id FROM courses WHERE code='ISIS3311'), 'Criptografía y protocolos seguros', NULL),
  (gen_random_uuid(), (SELECT id FROM courses WHERE code='ISIS3311'), 'Análisis de vulnerabilidades', NULL);

-- MATE1214 — Cálculo Integral y Ecuaciones Diferenciales
INSERT INTO topics (id, course_id, name, description) VALUES
  (gen_random_uuid(), (SELECT id FROM courses WHERE code='MATE1214'), 'Técnicas de integración', NULL),
  (gen_random_uuid(), (SELECT id FROM courses WHERE code='MATE1214'), 'Ecuaciones diferenciales de primer orden', NULL);
