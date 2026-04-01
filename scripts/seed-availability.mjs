/**
 * Seed script: borra toda la colección `availabilities` y crea ventanas de
 * disponibilidad (lunes–viernes, 9:00–17:00 en franjas de 1 h) para los
 * próximos 14 días calendario desde hoy, para cada usuario con role=tutor.
 *
 * Uso (desde la raíz del repo):
 *   node scripts/seed-availability.mjs
 *
 * Requiere las mismas variables que Firebase Admin (.env / .env.local).
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const COLLECTION = 'availabilities';
const DAYS_AHEAD = 14;
const TUTOR_LIMIT = 500;

function initAdmin() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  let projectId = process.env.FIREBASE_PROJECT_ID;
  let clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  const saKeyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (saKeyJson) {
    try {
      const sa = JSON.parse(saKeyJson);
      projectId = projectId || sa.project_id;
      clientEmail = clientEmail || sa.client_email;
      privateKey = privateKey || sa.private_key;
    } catch (e) {
      console.warn('GOOGLE_SERVICE_ACCOUNT_KEY parse failed:', e.message);
    }
  }

  if (privateKey) {
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      try {
        privateKey = JSON.parse(privateKey);
      } catch {
        privateKey = privateKey.slice(1, -1).replace(/\\n/g, '\n');
      }
    } else {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }
  }

  if (projectId && clientEmail && privateKey) {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  throw new Error(
    'Faltan FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY (o GOOGLE_SERVICE_ACCOUNT_KEY válido).',
  );
}

function isWeekday(date) {
  const d = date.getDay();
  return d >= 1 && d <= 5;
}

function startOfDayLocal(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Genera fechas de inicio/fin de slots (1 h) entre 9 y 16 inclusive (9:00–17:00).
 */
function* iterateSlotsInRange(startDay, endDay) {
  const cursor = startOfDayLocal(startDay);
  const end = startOfDayLocal(endDay);
  while (cursor <= end) {
    if (isWeekday(cursor)) {
      for (let h = 9; h < 17; h++) {
        const start = new Date(cursor);
        start.setHours(h, 0, 0, 0);
        const endSlot = new Date(cursor);
        endSlot.setHours(h + 1, 0, 0, 0);
        yield { start, end: endSlot };
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
}

async function deleteAllAvailabilities(db) {
  let total = 0;
  const col = db.collection(COLLECTION);
  for (;;) {
    const snap = await col.limit(500).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    total += snap.size;
    process.stdout.write(`\rBorrados ${total} documentos de ${COLLECTION}…`);
  }
  console.log(`\nListo: ${total} documentos eliminados.`);
}

function pickCourseLabel(tutor) {
  const c = tutor.courses;
  if (!c) return 'General';
  if (typeof c === 'string') return c;
  if (Array.isArray(c) && c.length > 0) {
    const first = c[0];
    if (typeof first === 'string') return first;
    return first.nombre || first.name || first.codigo || first.id || 'General';
  }
  return 'General';
}

async function seedForTutor(db, tutor) {
  const tutorId = tutor.id;
  const course = pickCourseLabel(tutor);
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + DAYS_AHEAD - 1);

  let count = 0;
  let batch = db.batch();
  let ops = 0;

  const flush = async () => {
    if (ops === 0) return;
    await batch.commit();
    count += ops;
    ops = 0;
    batch = db.batch();
  };

  for (const { start, end } of iterateSlotsInRange(today, endDate)) {
    const ref = db.collection(COLLECTION).doc();
    batch.set(ref, {
      tutorId,
      title: 'Disponible',
      course,
      startDateTime: admin.firestore.Timestamp.fromDate(start),
      endDateTime: admin.firestore.Timestamp.fromDate(end),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    ops++;
    if (ops >= 450) {
      await flush();
    }
  }
  await flush();
  return count;
}

async function fetchAllTutors(db) {
  const snap = await db
    .collection('users')
    .where('isTutor', '==', true)
    .limit(TUTOR_LIMIT)
    .get();

  const tutors = [];
  snap.forEach((doc) => tutors.push({ id: doc.id, ...doc.data() }));
  return tutors;
}

async function main() {
  initAdmin();
  const db = admin.firestore();

  console.log('Buscando tutores…');
  const tutors = await fetchAllTutors(db);
  console.log(`Encontrados ${tutors.length} tutores (límite ${TUTOR_LIMIT}).`);

  console.log(`Borrando colección "${COLLECTION}"…`);
  await deleteAllAvailabilities(db);

  let totalSlots = 0;
  for (const tutor of tutors) {
    const n = await seedForTutor(db, tutor);
    totalSlots += n;
    console.log(`  ${tutor.email || tutor.id}: ${n} slots`);
  }

  console.log(`\nHecho. ${totalSlots} documentos de disponibilidad creados para ${tutors.length} tutores.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
