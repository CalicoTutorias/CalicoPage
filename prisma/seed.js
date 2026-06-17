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
  { code: 'ISIS', name: 'Ingeniería de Sistemas y Computación' },
  { code: 'DACO', name: 'Ciencia de Datos y Analítica' },
  { code: 'MATE', name: 'Matemáticas' },
  { code: 'FISI', name: 'Física' },
  { code: 'IIND', name: 'Ingeniería Industrial' },
  { code: 'ICIV', name: 'Ingeniería Civil' },
  { code: 'IAMB', name: 'Ingeniería Ambiental' },
  { code: 'IMEC', name: 'Ingeniería Mecánica' },
  { code: 'IELE', name: 'Ingeniería Eléctrica' },
  { code: 'IBIO', name: 'Ingeniería Biomédica' },
  { code: 'IQUI', name: 'Ingeniería Química' },
  { code: 'ADMI', name: 'Administración de Empresas' },
  { code: 'ECON', name: 'Economía' },
  { code: 'DERE', name: 'Derecho' },
  { code: 'MEDI', name: 'Medicina' },
  { code: 'PSIC', name: 'Psicología' },
  { code: 'CPOL', name: 'Ciencia Política' },
  { code: 'ARQU', name: 'Arquitectura' },
  { code: 'DISE', name: 'Diseño' },
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
