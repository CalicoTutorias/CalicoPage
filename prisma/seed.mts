/**
 * Seed script for initial data (majors, courses, etc.)
 * Run: npm run db:seed
 */

import * as PrismaModule from '../src/generated/prisma/client.ts';

const prisma = new PrismaModule.PrismaClient();

const majors = [
  { name: 'Ingeniería de Sistemas y Computación', code: 'ISIS', faculty: 'Ingeniería' },
  { name: 'Ingeniería Industrial', code: 'IIND', faculty: 'Ingeniería' },
  { name: 'Ingeniería Civil', code: 'ICIV', faculty: 'Ingeniería' },
  { name: 'Ingeniería Electrónica', code: 'IELE', faculty: 'Ingeniería' },
  { name: 'Ingeniería Mecánica', code: 'IMEC', faculty: 'Ingeniería' },
  { name: 'Ingeniería Química', code: 'IQUI', faculty: 'Ingeniería' },
  { name: 'Ingeniería Biomédica', code: 'IBIO', faculty: 'Ingeniería' },
  { name: 'Ingeniería Ambiental', code: 'IAMB', faculty: 'Ingeniería' },
  { name: 'Administración de Empresas', code: 'ADMI', faculty: 'Administración' },
  { name: 'Economía', code: 'ECON', faculty: 'Economía' },
  { name: 'Derecho', code: 'DERE', faculty: 'Derecho' },
  { name: 'Medicina', code: 'MEDI', faculty: 'Medicina' },
  { name: 'Psicología', code: 'PSIC', faculty: 'Ciencias Sociales' },
  { name: 'Ciencia Política', code: 'CPOL', faculty: 'Ciencias Sociales' },
  { name: 'Matemáticas', code: 'MATE', faculty: 'Ciencias' },
  { name: 'Física', code: 'FISI', faculty: 'Ciencias' },
  { name: 'Arquitectura', code: 'ARQU', faculty: 'Arquitectura y Diseño' },
  { name: 'Diseño', code: 'DISE', faculty: 'Arquitectura y Diseño' },
];

async function main() {
  console.log(' Seeding database...');

  for (const major of majors) {
    await prisma.major.upsert({
      where: { code: major.code },
      update: { name: major.name, faculty: major.faculty },
      create: major,
    });
  }

  console.log(` Seeded ${majors.length} majors`);
}

main()
  .catch((e: unknown) => {
    console.error(' Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
