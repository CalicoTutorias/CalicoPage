/**
 * Seed script for initial data (careers)
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
  { code: 'ICIV',  name: 'Ingeniería Civil' },
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
  { code: 'MICR',  name: 'Microbiología' },
  { code: 'GEOC',  name: 'Geociencias' },
  { code: 'DACO',  name: 'Ciencia de Datos y Analítica' },

  // Facultad de Ciencias Sociales
  { code: 'ANTR',  name: 'Antropología' },
  { code: 'HIST',  name: 'Historia' },
  { code: 'FILO',  name: 'Filosofía' },
  { code: 'CPOL',  name: 'Ciencia Política' },
  { code: 'EGLO',  name: 'Estudios Globales' },
  { code: 'LYCU',  name: 'Lenguas y Cultura' },

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
}

main()
  .catch((e) => {
    console.error(' Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
