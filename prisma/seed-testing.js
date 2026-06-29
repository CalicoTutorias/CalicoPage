/**
 * Testing seed for local development.
 *
 * Run after `pnpm db:push`:
 *   pnpm db:seed:test
 *
 * This file intentionally creates fake local-only users and activity for UI
 * testing. Never run it against production or shared remote databases.
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const bcrypt = require('bcrypt');
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
    ssl: url.hostname === 'localhost' || url.hostname === '127.0.0.1'
      ? false
      : { rejectUnauthorized: false },
  });
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

const prisma = createClient();

const TEST_PASSWORD = 'CalicoTest123!';
const TEST_IDS = {
  admin: '00000000-0000-4000-8000-000000000001',
  student: '00000000-0000-4000-8000-000000000002',
  tutor: '00000000-0000-4000-8000-000000000003',
  pendingTutor: '00000000-0000-4000-8000-000000000004',
  suspendedTutor: '00000000-0000-4000-8000-000000000005',
  completedSession: '00000000-0000-4000-8000-000000000101',
  upcomingSession: '00000000-0000-4000-8000-000000000102',
  pendingSession: '00000000-0000-4000-8000-000000000103',
};

const requiredCareers = [
  { code: 'ISIS', name: 'Ingeniería de Sistemas y Computación' },
  { code: 'MATE', name: 'Matemáticas' },
  { code: 'IIND', name: 'Ingeniería Industrial' },
];

const requiredCourses = [
  {
    code: 'ISIS1221',
    name: 'Introducción a la Programación',
    basePrice: 35000,
    complexity: 'Introductory',
    aliases: ['IP'],
    careerCode: 'ISIS',
  },
  {
    code: 'ISIS1225',
    name: 'Estructuras de Datos y Algoritmos',
    basePrice: 45000,
    complexity: 'Foundational',
    aliases: ['EDA'],
    careerCode: 'ISIS',
  },
  {
    code: 'MATE1203',
    name: 'Cálculo Diferencial',
    basePrice: 35000,
    complexity: 'Foundational',
    aliases: [],
    careerCode: 'MATE',
  },
  {
    code: 'IIND2106',
    name: 'Probabilidad y Estadística',
    basePrice: 45000,
    complexity: 'Foundational',
    aliases: [],
    careerCode: 'IIND',
  },
];

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function timeOnly(hour, minute = 0) {
  return new Date(Date.UTC(1970, 0, 1, hour, minute, 0));
}

async function ensureAcademicData() {
  for (const career of requiredCareers) {
    await prisma.career.upsert({
      where: { code: career.code },
      update: { name: career.name },
      create: career,
    });
  }

  const careers = await prisma.career.findMany({
    where: { code: { in: requiredCareers.map((career) => career.code) } },
    select: { id: true, code: true },
  });
  const careerIdByCode = new Map(careers.map((career) => [career.code, career.id]));

  for (const course of requiredCourses) {
    const { careerCode, ...courseData } = course;
    await prisma.course.upsert({
      where: { code: course.code },
      update: { ...courseData, careerId: careerIdByCode.get(careerCode) },
      create: { ...courseData, careerId: careerIdByCode.get(careerCode) },
    });
  }
}

async function upsertUser({ id, email, name, role = 'STUDENT', careerId, ...data }) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  return prisma.user.upsert({
    where: { email },
    update: {
      id,
      name,
      role,
      careerId,
      passwordHash,
      authProvider: 'Local',
      isActive: true,
      isEmailVerified: true,
      terms: true,
      ...data,
    },
    create: {
      id,
      email,
      name,
      role,
      careerId,
      passwordHash,
      authProvider: 'Local',
      isActive: true,
      isEmailVerified: true,
      terms: true,
      ...data,
    },
  });
}

async function ensureTutorProfile(user, profileData, tutorCourses) {
  await prisma.tutorProfile.upsert({
    where: { userId: user.id },
    update: profileData,
    create: { userId: user.id, ...profileData },
  });

  await prisma.schedule.upsert({
    where: { userId: user.id },
    update: {
      timezone: 'America/Bogota',
      autoAcceptSession: false,
      minBookingNotice: 12,
      maxSessionsPerDay: 4,
      bufferTime: 15,
    },
    create: {
      userId: user.id,
      timezone: 'America/Bogota',
      autoAcceptSession: false,
      minBookingNotice: 12,
      maxSessionsPerDay: 4,
      bufferTime: 15,
    },
  });

  await prisma.availability.deleteMany({ where: { userId: user.id } });
  await prisma.availability.createMany({
    data: [
      { userId: user.id, dayOfWeek: 1, startTime: timeOnly(14), endTime: timeOnly(16), label: 'Testing lunes tarde' },
      { userId: user.id, dayOfWeek: 3, startTime: timeOnly(9), endTime: timeOnly(11), label: 'Testing miércoles mañana' },
      { userId: user.id, dayOfWeek: 5, startTime: timeOnly(15), endTime: timeOnly(18), label: 'Testing viernes tarde' },
    ],
  });

  for (const tutorCourse of tutorCourses) {
    await prisma.tutorCourse.upsert({
      where: { tutorId_courseId: { tutorId: user.id, courseId: tutorCourse.courseId } },
      update: {
        status: tutorCourse.status,
        experience: tutorCourse.experience,
        workSampleUrl: tutorCourse.workSampleUrl,
      },
      create: {
        tutorId: user.id,
        courseId: tutorCourse.courseId,
        status: tutorCourse.status,
        experience: tutorCourse.experience,
        workSampleUrl: tutorCourse.workSampleUrl,
      },
    });
  }
}

async function main() {
  const dbHost = new URL(process.env.DATABASE_URL).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(dbHost)) {
    throw new Error(`Refusing to run testing seed against non-local database host: ${dbHost}`);
  }

  console.log('Seeding local testing data...');
  await ensureAcademicData();

  const [isisCareer, mateCareer] = await Promise.all([
    prisma.career.findUnique({ where: { code: 'ISIS' } }),
    prisma.career.findUnique({ where: { code: 'MATE' } }),
  ]);

  const courses = await prisma.course.findMany({
    where: { code: { in: requiredCourses.map((course) => course.code) } },
  });
  const courseByCode = new Map(courses.map((course) => [course.code, course]));

  const admin = await upsertUser({
    id: TEST_IDS.admin,
    email: 'admin.test@calico.local',
    name: 'Admin Testing Calico',
    role: 'ADMIN',
    careerId: isisCareer.id,
    isTutorRequested: true,
    isTutorApproved: true,
    phoneNumber: '+57 300 000 0001',
    phoneNumberNormalized: '+573000000001',
  });

  const student = await upsertUser({
    id: TEST_IDS.student,
    email: 'student.test@calico.local',
    name: 'Estudiante Testing Calico',
    careerId: isisCareer.id,
    phoneNumber: '+57 300 000 0002',
    phoneNumberNormalized: '+573000000002',
    studentRating: 4.75,
    studentRatingCount: 4,
  });

  const tutor = await upsertUser({
    id: TEST_IDS.tutor,
    email: 'tutor.test@calico.local',
    name: 'Tutor Aprobado Testing',
    careerId: mateCareer.id,
    isTutorRequested: true,
    isTutorApproved: true,
    phoneNumber: '+57 300 000 0003',
    phoneNumberNormalized: '+573000000003',
  });

  const pendingTutor = await upsertUser({
    id: TEST_IDS.pendingTutor,
    email: 'pending.tutor.test@calico.local',
    name: 'Tutor Pendiente Testing',
    careerId: isisCareer.id,
    isTutorRequested: true,
    isTutorApproved: false,
    phoneNumber: '+57 300 000 0004',
    phoneNumberNormalized: '+573000000004',
  });

  const suspendedTutor = await upsertUser({
    id: TEST_IDS.suspendedTutor,
    email: 'suspended.tutor.test@calico.local',
    name: 'Tutor Suspendido Testing',
    careerId: isisCareer.id,
    isTutorRequested: true,
    isTutorApproved: true,
    isActive: false,
    suspendedAt: new Date(),
    suspendedReason: 'Cuenta de testing suspendida para probar estados admin.',
    suspendedById: admin.id,
    phoneNumber: '+57 300 000 0005',
    phoneNumberNormalized: '+573000000005',
  });

  await ensureTutorProfile(admin, {
    schoolEmail: 'admin.test@uniandes.edu.co',
    experienceYears: 5,
    credits: 120,
    experienceDescription: 'Admin local con perfil de tutor para probar privilegios y vistas.',
    bio: 'Cuenta local con rol ADMIN y tutor aprobado.',
    llave: 'admin-testing',
    review: 5,
    numReview: 3,
    numSessions: 8,
    totalEarning: 320000,
    nextPayment: 90000,
  }, [
    { courseId: courseByCode.get('ISIS1221').id, status: 'Approved', experience: 'Ha dictado programación introductoria varias veces.' },
    { courseId: courseByCode.get('MATE1203').id, status: 'Approved', experience: 'Apoyo en cálculo para estudiantes de primer semestre.' },
  ]);

  await ensureTutorProfile(tutor, {
    schoolEmail: 'tutor.test@uniandes.edu.co',
    experienceYears: 3,
    credits: 96,
    experienceDescription: 'Tutor aprobado para probar búsqueda, perfil, disponibilidad y reservas.',
    bio: 'Me gusta explicar con ejercicios paso a paso.',
    llave: 'tutor-testing',
    review: 4.8,
    numReview: 12,
    numSessions: 24,
    totalEarning: 840000,
    nextPayment: 120000,
  }, [
    { courseId: courseByCode.get('ISIS1221').id, status: 'Approved', experience: 'Monitor de IP durante dos semestres.' },
    { courseId: courseByCode.get('ISIS1225').id, status: 'Approved', experience: 'Proyectos de estructuras de datos en Java y Python.' },
    { courseId: courseByCode.get('IIND2106').id, status: 'Pending', experience: 'Solicitud pendiente para probar aprobación de materias.' },
  ]);

  await ensureTutorProfile(pendingTutor, {
    schoolEmail: 'pending.tutor.test@uniandes.edu.co',
    experienceYears: 1,
    credits: 72,
    experienceDescription: 'Aplicación pendiente para probar el flujo de aprobación admin.',
    bio: 'Perfil pendiente de aprobación.',
    llave: 'pending-testing',
  }, [
    { courseId: courseByCode.get('ISIS1221').id, status: 'Pending', experience: 'Quiere dictar programación introductoria.' },
    { courseId: courseByCode.get('MATE1203').id, status: 'Pending', experience: 'Quiere apoyar cálculo diferencial.' },
  ]);

  await ensureTutorProfile(suspendedTutor, {
    schoolEmail: 'suspended.tutor.test@uniandes.edu.co',
    experienceYears: 2,
    credits: 88,
    experienceDescription: 'Tutor suspendido para probar estados de moderación.',
    bio: 'Cuenta suspendida de testing.',
    llave: 'suspended-testing',
  }, [
    { courseId: courseByCode.get('ISIS1225').id, status: 'Approved', experience: 'Curso aprobado antes de suspensión.' },
  ]);

  await prisma.tutorApplication.upsert({
    where: { id: '00000000-0000-4000-8000-000000000201' },
    update: {
      status: 'Pending',
      reviewedById: null,
      reviewedAt: null,
      rejectionReason: null,
    },
    create: {
      id: '00000000-0000-4000-8000-000000000201',
      userId: pendingTutor.id,
      reasonsToTeach: 'Quiero ayudar a otros estudiantes y practicar mis habilidades de explicación.',
      subjects: ['ISIS1221', 'MATE1203'],
      contactInfo: { phone: '+573000000004', preferredChannel: 'whatsapp' },
      status: 'Pending',
    },
  });

  const completedSession = await prisma.session.upsert({
    where: { id: TEST_IDS.completedSession },
    update: {
      status: 'Completed',
      startTimestamp: hoursFromNow(-96),
      endTimestamp: hoursFromNow(-95),
    },
    create: {
      id: TEST_IDS.completedSession,
      courseId: courseByCode.get('ISIS1221').id,
      tutorId: tutor.id,
      sessionType: 'Individual',
      maxCapacity: 1,
      startTimestamp: hoursFromNow(-96),
      endTimestamp: hoursFromNow(-95),
      status: 'Completed',
      locationType: 'Virtual',
      googleMeetLink: 'https://meet.google.com/testing-calico',
      topicsToReview: 'Ciclos, listas y funciones',
      notes: 'Sesión local de testing completada.',
    },
  });

  const upcomingSession = await prisma.session.upsert({
    where: { id: TEST_IDS.upcomingSession },
    update: {
      status: 'Accepted',
      startTimestamp: hoursFromNow(48),
      endTimestamp: hoursFromNow(49),
    },
    create: {
      id: TEST_IDS.upcomingSession,
      courseId: courseByCode.get('ISIS1225').id,
      tutorId: tutor.id,
      sessionType: 'Individual',
      maxCapacity: 1,
      startTimestamp: hoursFromNow(48),
      endTimestamp: hoursFromNow(49),
      status: 'Accepted',
      locationType: 'Virtual',
      googleMeetLink: 'https://meet.google.com/testing-upcoming',
      topicsToReview: 'Árboles binarios y heaps',
      notes: 'Sesión futura local de testing.',
    },
  });

  const pendingSession = await prisma.session.upsert({
    where: { id: TEST_IDS.pendingSession },
    update: {
      status: 'Pending',
      startTimestamp: hoursFromNow(72),
      endTimestamp: hoursFromNow(73),
    },
    create: {
      id: TEST_IDS.pendingSession,
      courseId: courseByCode.get('MATE1203').id,
      tutorId: admin.id,
      sessionType: 'Individual',
      maxCapacity: 1,
      startTimestamp: hoursFromNow(72),
      endTimestamp: hoursFromNow(73),
      status: 'Pending',
      locationType: 'Virtual',
      topicsToReview: 'Límites y derivadas',
      notes: 'Sesión pendiente local de testing.',
    },
  });

  for (const session of [completedSession, upcomingSession, pendingSession]) {
    await prisma.sessionParticipant.upsert({
      where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } },
      update: { participantCount: 1 },
      create: { sessionId: session.id, studentId: student.id, participantCount: 1 },
    });
  }

  await prisma.review.upsert({
    where: {
      sessionId_studentId_tutorId: {
        sessionId: completedSession.id,
        studentId: student.id,
        tutorId: tutor.id,
      },
    },
    update: {
      rating: 5,
      status: 'done',
      comment: 'Explicación muy clara para testing.',
      courseId: completedSession.courseId,
    },
    create: {
      sessionId: completedSession.id,
      studentId: student.id,
      tutorId: tutor.id,
      courseId: completedSession.courseId,
      rating: 5,
      status: 'done',
      comment: 'Explicación muy clara para testing.',
    },
  });

  await prisma.studentReview.upsert({
    where: {
      sessionId_tutorId_studentId: {
        sessionId: completedSession.id,
        tutorId: tutor.id,
        studentId: student.id,
      },
    },
    update: {
      rating: 5,
      status: 'done',
      comment: 'Llegó preparado y con preguntas concretas.',
    },
    create: {
      sessionId: completedSession.id,
      tutorId: tutor.id,
      studentId: student.id,
      rating: 5,
      status: 'done',
      comment: 'Llegó preparado y con preguntas concretas.',
    },
  });

  await prisma.payment.upsert({
    where: { id: '00000000-0000-4000-8000-000000000301' },
    update: {
      status: 'paid',
      tutorPayoutStatus: 'pending',
      amount: 35000,
    },
    create: {
      id: '00000000-0000-4000-8000-000000000301',
      sessionId: completedSession.id,
      studentId: student.id,
      tutorId: tutor.id,
      amount: 35000,
      status: 'paid',
      tutorPayoutStatus: 'pending',
      wompiId: 'test_wompi_paid_001',
    },
  });

  const notifications = [
    {
      id: '00000000-0000-4000-8000-000000000401',
      userId: admin.id,
      type: 'testing_admin',
      message: 'Hay una aplicación de tutor pendiente para revisar.',
      metadata: { seed: 'testing' },
    },
    {
      id: '00000000-0000-4000-8000-000000000402',
      userId: student.id,
      type: 'testing_session',
      message: 'Tu sesión de testing fue aceptada.',
      sessionId: upcomingSession.id,
      metadata: { seed: 'testing' },
    },
    {
      id: '00000000-0000-4000-8000-000000000403',
      userId: tutor.id,
      type: 'testing_payout',
      message: 'Tienes un pago de testing pendiente de liquidación.',
      sessionId: completedSession.id,
      metadata: { seed: 'testing' },
    },
  ];

  for (const notification of notifications) {
    await prisma.notification.upsert({
      where: { id: notification.id },
      update: notification,
      create: notification,
    });
  }

  console.log('');
  console.log('Testing seed complete.');
  console.log('');
  console.log('Test accounts:');
  console.log(`  Admin + approved tutor: admin.test@calico.local / ${TEST_PASSWORD}`);
  console.log(`  Student:                student.test@calico.local / ${TEST_PASSWORD}`);
  console.log(`  Approved tutor:         tutor.test@calico.local / ${TEST_PASSWORD}`);
  console.log(`  Pending tutor:          pending.tutor.test@calico.local / ${TEST_PASSWORD}`);
  console.log('');
}

main()
  .catch((error) => {
    console.error('Testing seed error:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
