/**
 * Seed script for initial data (departments, careers, courses)
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

const departments = [
  { code: 'DISC', name: 'Departamento de Ingeniería de Sistemas y Computación' },
  { code: 'DMAT', name: 'Departamento de Matemáticas' },
  { code: 'DFIS', name: 'Departamento de Física' },
  { code: 'DING', name: 'Departamento de Ingeniería Industrial' },
  { code: 'DICI', name: 'Departamento de Ingeniería Civil y Ambiental' },
  { code: 'DIME', name: 'Departamento de Ingeniería Mecánica' },
  { code: 'DIEL', name: 'Departamento de Ingeniería Eléctrica y Electrónica' },
  { code: 'DADM', name: 'Facultad de Administración' },
  { code: 'DECO', name: 'Facultad de Economía' },
  { code: 'DDER', name: 'Facultad de Derecho' },
  { code: 'DMED', name: 'Facultad de Medicina' },
  { code: 'DCSO', name: 'Facultad de Ciencias Sociales' },
  { code: 'DARQ', name: 'Facultad de Arquitectura y Diseño' },
];

// departmentCode → list of careers
const careers = [
  { code: 'ISIS', name: 'Ingeniería de Sistemas y Computación', departmentCode: 'DISC' },
  { code: 'DACO', name: 'Ciencia de Datos y Analítica', departmentCode: 'DISC' },
  { code: 'MATE', name: 'Matemáticas', departmentCode: 'DMAT' },
  { code: 'FISI', name: 'Física', departmentCode: 'DFIS' },
  { code: 'IIND', name: 'Ingeniería Industrial', departmentCode: 'DING' },
  { code: 'ICIV', name: 'Ingeniería Civil', departmentCode: 'DICI' },
  { code: 'IAMB', name: 'Ingeniería Ambiental', departmentCode: 'DICI' },
  { code: 'IMEC', name: 'Ingeniería Mecánica', departmentCode: 'DIME' },
  { code: 'IELE', name: 'Ingeniería Eléctrica', departmentCode: 'DIEL' },
  { code: 'IBIO', name: 'Ingeniería Biomédica', departmentCode: 'DIEL' },
  { code: 'IQUI', name: 'Ingeniería Química', departmentCode: 'DIEL' },
  { code: 'ADMI', name: 'Administración de Empresas', departmentCode: 'DADM' },
  { code: 'ECON', name: 'Economía', departmentCode: 'DECO' },
  { code: 'DERE', name: 'Derecho', departmentCode: 'DDER' },
  { code: 'MEDI', name: 'Medicina', departmentCode: 'DMED' },
  { code: 'PSIC', name: 'Psicología', departmentCode: 'DCSO' },
  { code: 'CPOL', name: 'Ciencia Política', departmentCode: 'DCSO' },
  { code: 'ARQU', name: 'Arquitectura', departmentCode: 'DARQ' },
  { code: 'DISE', name: 'Diseño', departmentCode: 'DARQ' },
];

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Departments
  for (const dept of departments) {
    await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name },
      create: dept,
    });
  }
  console.log(`✅ Seeded ${departments.length} departments`);

  // 2. Careers (need departmentId FK)
  for (const career of careers) {
    const department = await prisma.department.findUnique({ where: { code: career.departmentCode } });
    await prisma.career.upsert({
      where: { code: career.code },
      update: { name: career.name, departmentId: department.id },
      create: { code: career.code, name: career.name, departmentId: department.id },
    });
  }
  console.log(`✅ Seeded ${careers.length} careers`);
}

main()
  .catch((e) => {
    console.error(' Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
