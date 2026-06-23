/**
 * Seed script for initial data (careers + courses)
 * Run: npm run db:seed
 */

require('dotenv').config();
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../src/generated/prisma');

function createClient() {
  const url = new URL(process.env.DATABASE_URL);
  const pool = new Pool({
    host: url.hostname,
    port: parseInt(url.port) || 5432,
    database: url.pathname.slice(1).split('?')[0],
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: { rejectUnauthorized: false },
  });
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

const prisma = createClient();

const careers = [
  // Facultad de Ingeniería
  { code: 'ISIS',  name: 'Ingeniería de Sistemas y Computación' },
  { code: 'IIND',  name: 'Ingeniería Industrial' },
  { code: 'ICYA',  name: 'Ingeniería Civil' },
  { code: 'IAMB',  name: 'Ingeniería Ambiental' },
  { code: 'IMEC',  name: 'Ingeniería Mecánica' },
  { code: 'IELE',  name: 'Ingeniería Eléctrica' },
  { code: 'IELEC', name: 'Ingeniería Electrónica' },
  { code: 'IBIO',  name: 'Ingeniería Biomédica' },
  { code: 'IQUI',  name: 'Ingeniería Química' },
  { code: 'IALI',  name: 'Ingeniería de Alimentos' },

  // Facultad de Ciencias
  { code: 'MATE',  name: 'Matemáticas' },
  { code: 'FISI',  name: 'Física' },
  { code: 'BIOL',  name: 'Biología' },
  { code: 'QUIM',  name: 'Química' },
  { code: 'MBIO',  name: 'Microbiología' },
  { code: 'GEOC',  name: 'Geociencias' },
  { code: 'DACO',  name: 'Ciencia de Datos y Analítica' },

  // Facultad de Ciencias Sociales
  { code: 'ANTR',  name: 'Antropología' },
  { code: 'HIST',  name: 'Historia' },
  { code: 'FILO',  name: 'Filosofía' },
  { code: 'CPOL',  name: 'Ciencia Política' },
  { code: 'EGLO',  name: 'Estudios Globales' },
  { code: 'LENG',  name: 'Lenguas y Cultura' },

  // Facultad de Artes y Humanidades
  { code: 'LITE',  name: 'Literatura' },
  { code: 'ARTE',  name: 'Arte' },
  { code: 'HART',  name: 'Historia del Arte' },
  { code: 'MUSI',  name: 'Música' },
  { code: 'NDIG',  name: 'Narrativas Digitales' },

  // Facultad de Administración y Economía
  { code: 'ADMI',  name: 'Administración de Empresas' },
  { code: 'CONT',  name: 'Contaduría Internacional' },
  { code: 'ECON',  name: 'Economía' },

  // Facultad de Derecho y Gobierno
  { code: 'DERE',  name: 'Derecho' },
  { code: 'GPUB',  name: 'Gobierno y Asuntos Públicos' },

  // Facultad de Educación
  { code: 'LART',  name: 'Licenciatura en Educación en Artes' },
  { code: 'LINI',  name: 'Licenciatura en Educación Inicial' },
  { code: 'LHUM',  name: 'Licenciatura en Educación en Humanidades' },
  { code: 'LMAT',  name: 'Licenciatura en Educación en Matemáticas' },
  { code: 'LCNA',  name: 'Licenciatura en Educación en Ciencias Naturales' },
  { code: 'LCSO',  name: 'Licenciatura en Educación en Ciencias Sociales' },

  // Facultad de Medicina y Ciencias de la Salud
  { code: 'MEDI',  name: 'Medicina' },
  { code: 'ODON',  name: 'Odontología' },
  { code: 'ENFE',  name: 'Enfermería' },
  { code: 'PSIC',  name: 'Psicología' },

  // Facultad de Arquitectura y Diseño
  { code: 'ARQU',  name: 'Arquitectura' },
  { code: 'DISE',  name: 'Diseño' },
];

// ─── COURSES ──────────────────────────────────────────────────────────
// Todos los códigos son los oficiales de Uniandes (DEPT + 4 dígitos).
// Upsert por code → idempotente. Precios en COP/hora.

const courses = [
  // ── MATE — Matemáticas ───────────────────────────────────────────────
  { code: 'MATE1102', name: 'Matemática Estructural',                        basePrice: 50000, complexity: 'Challenging',  aliases: [] },
  { code: 'MATE1201', name: 'Precálculo',                                    basePrice: 35000, complexity: 'Introductory', aliases: ['Pre-cálculo'] },
  { code: 'MATE1203', name: 'Cálculo Diferencial',                           basePrice: 35000, complexity: 'Foundational', aliases: [] },
  { code: 'MATE1207', name: 'Cálculo Vectorial',                             basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'MATE1214', name: 'Cálculo Integral y Ecuaciones Diferenciales',   basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'MATE1252', name: 'Cálculo Integral y Probabilidad',               basePrice: 50000, complexity: 'Foundational', aliases: ['Cálculo integral y probabilidad'] },
  { code: 'MATE1253', name: 'Cálculo 3 y Álgebra Lineal',                   basePrice: 50000, complexity: 'Foundational', aliases: ['Cálculo 3 y álgebra lineal'] },
  { code: 'MATE1105', name: 'Álgebra Lineal',                                basePrice: 45000, complexity: 'Challenging',  aliases: ['Algebra Lineal'] },
  { code: 'MATE1506', name: 'Estadística',                                   basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'MATE2301', name: 'Ecuaciones Diferenciales',                      basePrice: 45000, complexity: 'Foundational', aliases: [] },

  // ── FISI — Física ────────────────────────────────────────────────────
  { code: 'FISI1518', name: 'Física 1',                                      basePrice: 50000, complexity: 'Challenging',  aliases: [] },
  { code: 'FISI1528', name: 'Física 2',                                      basePrice: 50000, complexity: 'Challenging',  aliases: [] },
  { code: 'FISIA',    name: 'Física A (Electromagnetismo)',                  basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'FISIB',    name: 'Física B (Física para Computación Cuántica)',   basePrice: 55000, complexity: 'Challenging',  aliases: [] },

  // ── ISIS — Ingeniería de Sistemas y Computación ──────────────────────
  { code: 'ISIS1001', name: 'Introducción a la Ingeniería de Sistemas',              basePrice: 35000, complexity: 'Introductory', aliases: [] },
  { code: 'ISIS1107', name: 'Fundamentos Matemáticos para Computación',             basePrice: 45000, complexity: 'Foundational', aliases: ['FMC'] },
  { code: 'ISIS1106', name: 'Lenguajes y Máquinas',                                 basePrice: 45000, complexity: 'Foundational', aliases: ['LYM'] },
  { code: 'ISIS1221', name: 'Introducción a la Programación',                       basePrice: 35000, complexity: 'Introductory', aliases: ['IP'] },
  { code: 'ISIS1225', name: 'Estructuras de Datos y Algoritmos',                    basePrice: 45000, complexity: 'Foundational', aliases: ['EDA'] },
  { code: 'ISIS1226', name: 'Diseño y Programación Orientada a Objetos',            basePrice: 45000, complexity: 'Foundational', aliases: ['DPOO'] },
  { code: 'ISIS1311', name: 'Tecnologías e Infraestructura de Cómputo',             basePrice: 35000, complexity: 'Introductory', aliases: ['INFRATEC'] },
  { code: 'ISIS1511', name: 'Fundamentos de Bases de Datos',                        basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'ISIS1611', name: 'Inteligencia Artificial',                              basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'ISIS2011', name: 'Productos Digitales Innovadores',                      basePrice: 55000, complexity: 'Challenging',  aliases: [] },
  { code: 'ISIS2111', name: 'Elementos Esenciales de Lenguajes de Programación',    basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'ISIS2112', name: 'Diseño de Algoritmos',                                 basePrice: 55000, complexity: 'Challenging',  aliases: ['DALGO'] },
  { code: 'ISIS2203', name: 'Infraestructura Computacional',                        basePrice: 50000, complexity: 'Challenging',  aliases: ['InfraComp'] },
  { code: 'ISIS2211', name: 'Ingeniería de Software Moderna',                       basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'ISIS2212', name: 'Arquitecturas de Software Robustas',                   basePrice: 55000, complexity: 'Challenging',  aliases: [] },
  { code: 'ISIS2213', name: 'Diseño de Aplicaciones Complejas',                     basePrice: 55000, complexity: 'Challenging',  aliases: [] },
  { code: 'ISIS2214', name: 'Tecnologías Emergentes',                               basePrice: 55000, complexity: 'Challenging',  aliases: ['TI'] },
  { code: 'ISIS2304', name: 'Sistemas Transaccionales',                             basePrice: 50000, complexity: 'Challenging',  aliases: ['SISTRANS'] },
  { code: 'ISIS2311', name: 'Redes y Servicios de Comunicaciones',                  basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'ISIS2403', name: 'Arquitectura Empresarial',                             basePrice: 45000, complexity: 'Foundational', aliases: ['ArquiEmp'] },
  { code: 'ISIS2411', name: 'Ingeniería de Negocios Digitales',                     basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'ISIS2603', name: 'Desarrollo de Software en Equipo',                     basePrice: 45000, complexity: 'Foundational', aliases: ['Sw en Equipos'] },
  { code: 'ISIS2611', name: 'Aprendizaje de Máquina',                               basePrice: 55000, complexity: 'Challenging',  aliases: [] },
  { code: 'ISIS3204', name: 'Infraestructura de Comunicaciones',                    basePrice: 50000, complexity: 'Challenging',  aliases: [] },
  { code: 'ISIS3211', name: 'Fábricas de Software Globales',                        basePrice: 55000, complexity: 'Challenging',  aliases: [] },
  { code: 'ISIS3301', name: 'Inteligencia de Negocios',                             basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'ISIS3302', name: 'Modelado, Simulación y Optimización',                  basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'ISIS3311', name: 'Ciberseguridad',                                       basePrice: 55000, complexity: 'Challenging',  aliases: [] },
  { code: 'ISIS3425', name: 'Sistemas Empresariales',                               basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'ISIS3710', name: 'Programación con Tecnologías Web',                     basePrice: 45000, complexity: 'Foundational', aliases: [] },

  // ── IIND — Ingeniería Industrial ─────────────────────────────────────
  { code: 'IIND1000', name: 'Introducción a la Ingeniería Industrial',       basePrice: 40000, complexity: 'Introductory', aliases: [] },
  { code: 'IIND2106', name: 'Probabilidad y Estadística',                    basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'IIND2111', name: 'Fundamentos de Analítica de Datos',             basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'IIND2112', name: 'Fundamentos de Modelado Estadístico',           basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'IIND2205', name: 'Ingeniería de Producción',                      basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'IIND2206', name: 'Ingeniería de la Cadena de Suministro',         basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'IIND2304', name: 'Modelado y Simulación Sistémica',               basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'IIND2401', name: 'Análisis de Decisión de Inversión',             basePrice: 45000, complexity: 'Foundational', aliases: ['ANADEC'] },
  { code: 'IIND2405', name: 'Fundamentos de Analítica Financiera',           basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'IIND2501', name: 'Modelado en Optimización',                      basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'IIND2502', name: 'Modelado de Sistemas bajo Incertidumbre',       basePrice: 45000, complexity: 'Foundational', aliases: [] },

  // ── ICYA — Ingeniería Civil y Ambiental ──────────────────────────────
  { code: 'ICYA1114', name: 'Introducción a la Ingeniería Civil y Ambiental', basePrice: 40000, complexity: 'Introductory', aliases: [] },
  { code: 'ICYA1116', name: 'Estática',                                        basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'ICYA1117', name: 'Resistencia de Materiales',                       basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'ICYA1122', name: 'Materiales en Ingeniería Civil',                  basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'ICYA2001', name: 'Cálculo Numérico',                                basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'ICYA2203', name: 'Análisis de Sistemas Estructurales',              basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'ICYA2304', name: 'Fundamentos de Geotecnia',                        basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'ICYA2401', name: 'Mecánica de Fluidos',                             basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'ICYA2402', name: 'Hidráulica',                                      basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'ICYA3016', name: 'Fundamentos de Transporte',                       basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'ICYA3203', name: 'Gerencia de Proyectos',                           basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'ICYA3305', name: 'Estructuras Geotécnicas',                         basePrice: 40000, complexity: 'Challenging',  aliases: [] },
  // Sin código oficial confirmado en catálogo ICYA 2024

  // ── IBIO — Ingeniería Biomédica ──────────────────────────────────────
  { code: 'IBIO1010', name: 'Introducción a la Ingeniería Biomédica',                      basePrice: 40000, complexity: 'Introductory', aliases: [] },
  { code: 'IBIO2099', name: 'Fisiología Cuantitativa para Ingeniería Biomédica I',         basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'IBIO2102', name: 'Fisiología Cuantitativa para Ingeniería Biomédica II',        basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'IBIO2250', name: 'Fenómenos de Transporte Biológico',                           basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'IBIO2340', name: 'Fundamentos de Machine Learning',                             basePrice: 40000, complexity: 'Foundational', aliases: ['Fundamentos ML'] },
  { code: 'IBIO2650', name: 'Biomateriales',                                               basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'IBIO3160', name: 'Biomecánica',                                                 basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'IBIO3260', name: 'Modelado y Simulación de Sistemas Biológicos',                basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'IBIO3270', name: 'Diseño de Experimentos y Bioestadística',                     basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'IBIO3560', name: 'Señales Biomédicas',                                          basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'IBIO3590', name: 'Sensores e Instrumentación Biomédica',                        basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'IBIO3670', name: 'Fundamentos de Reconocimiento Visual',                        basePrice: 40000, complexity: 'Foundational', aliases: [] },

  // ── IMEC — Ingeniería Mecánica ───────────────────────────────────────
  { code: 'IMEC1410', name: 'Ciencia de Materiales',                         basePrice: 40000, complexity: 'Foundational', aliases: [] },

  // ── ADMI — Administración ────────────────────────────────────────────
  { code: 'ADMI1101', name: 'Fundamentos de Administración',                 basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI1190', name: 'Servicios Ecosistémicos',                       basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI1203', name: 'Planeación Financiera',                         basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI1401', name: 'Taller de Habilidades Informáticas',            basePrice: 50000, complexity: 'Introductory', aliases: [] },
  { code: 'ADMI1590', name: 'Taller de Creatividad',                         basePrice: 50000, complexity: 'Introductory', aliases: [] },
  { code: 'ADMI1602', name: 'Taller de Autoconocimiento',                    basePrice: 50000, complexity: 'Introductory', aliases: [] },
  { code: 'ADMI1603', name: 'Comportamiento Organizacional',                 basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI2104', name: 'Historia del Desarrollo Empresarial Colombiano',basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI2106', name: 'Responsabilidad Social',                        basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI2204', name: 'Decisiones de Inversión',                       basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI2207', name: 'Colombia y sus Instituciones',                  basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI2301', name: 'Fundamentos de Mercadeo',                       basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI2302', name: 'Investigación de Mercados',                     basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI2403', name: 'Operaciones y Logística',                       basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI2501', name: 'Análisis del Entorno Colombiano',               basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI2554', name: 'Modelos Multivariados',                         basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI2555', name: 'Visualización de Datos',                        basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI2556', name: 'Herramientas para Toma de Decisiones I',        basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI2557', name: 'Herramientas para Toma de Decisiones II',       basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI2558', name: 'Principios de Optimización y Simulación',       basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI2559', name: 'Minería de Datos',                              basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI2605', name: 'Organizaciones',                                basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI2606', name: 'Proyecto Aplicado en Organizaciones',           basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI2801', name: 'La Gestión de lo Público',                      basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI3107', name: 'Consultoría',                                   basePrice: 50000, complexity: 'Challenging',  aliases: [] },
  { code: 'ADMI3110', name: 'Emprendimiento e Innovación',                   basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI3122', name: 'Juego Gerencial',                               basePrice: 50000, complexity: 'Challenging',  aliases: [] },
  { code: 'ADMI3200', name: 'Opción de Grado',                               basePrice: 50000, complexity: 'Challenging',  aliases: [] },
  { code: 'ADMI3405', name: 'Sistemas de Información Gerencial',             basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'ADMI3502', name: 'Estrategia',                                    basePrice: 50000, complexity: 'Challenging',  aliases: [] },
  { code: 'ADMI3701', name: 'Negocios Internacionales',                      basePrice: 50000, complexity: 'Foundational', aliases: [] },

  // ── ECON — Economía ──────────────────────────────────────────────────
  { code: 'ECON1006', name: 'Pensando Problemas',                            basePrice: 40000, complexity: 'Introductory', aliases: [] },
  { code: 'ECON2101', name: 'Microeconomía 2',                               basePrice: 50000, complexity: 'Challenging',  aliases: [] },
  { code: 'ECON2107', name: 'Introducción a la Microeconomía',               basePrice: 50000, complexity: 'Introductory', aliases: ['Microeconomía 1'] },
  { code: 'ECON2108', name: 'Fundamentos de Economía',                       basePrice: 45000, complexity: 'Foundational', aliases: [] },
  { code: 'ECON2203', name: 'Introducción a la Macroeconomía',               basePrice: 50000, complexity: 'Introductory', aliases: ['Macroeconomía 1'] },

  // ── DERE — Derecho ───────────────────────────────────────────────────
  { code: 'DERE1202', name: 'Fundamentos de Derecho de los Negocios',        basePrice: 50000, complexity: 'Foundational', aliases: [] },
  { code: 'DERE1300', name: 'Constitución y Democracia',                     basePrice: 50000, complexity: 'Foundational', aliases: [] },

  // ── CONT — Contaduría ────────────────────────────────────────────────
  { code: 'CONT1412', name: 'Contabilidad Financiera',                       basePrice: 50000, complexity: 'Foundational', aliases: [] },

  // ── LENG — Lenguas y Cultura ─────────────────────────────────────────
  { code: 'LENG1501', name: 'Español',                                       basePrice: 50000, complexity: 'Foundational', aliases: [] },

  // ── MBIO / QUIM — Ciencias naturales ────────────────────────────────
  { code: 'MBIO2100', name: 'Bioquímica',                                    basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'MBIO2104', name: 'Fundamentos de Biología Celular y Molecular',  basePrice: 40000, complexity: 'Foundational', aliases: [] },
  { code: 'QUIM1303', name: 'Fundamentos de Química Orgánica',               basePrice: 40000, complexity: 'Foundational', aliases: [] },
];

async function main() {
  console.log(' Seeding database...');

  for (const career of careers) {
    await prisma.career.upsert({
      where: { code: career.code },
      update: { name: career.name },
      create: career,
    });
  }
  console.log(` Seeded ${careers.length} careers`);

  // careerId is resolved from the course code's 4-letter prefix against the
  // careers seeded above (same convention enforced by the
  // add_course_career_relation migration's backfill).
  const careerIdByCode = new Map(
    (await prisma.career.findMany({ select: { id: true, code: true } })).map((c) => [c.code, c.id]),
  );

  for (const course of courses) {
    const prefix = course.code.slice(0, 4).toUpperCase();
    const careerId = careerIdByCode.get(prefix);
    if (!careerId) {
      throw new Error(`Seed course "${course.code}" has no matching career for prefix "${prefix}"`);
    }

    await prisma.course.upsert({
      where: { code: course.code },
      update: { name: course.name, basePrice: course.basePrice, complexity: course.complexity, aliases: course.aliases, careerId },
      create: { ...course, careerId },
    });
  }
  console.log(` Seeded ${courses.length} courses`);
}

main()
  .catch((e) => {
    console.error(' Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
