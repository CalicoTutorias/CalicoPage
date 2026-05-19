/**
 * TutorApplication Service
 * Business logic for tutor application submissions.
 */

import * as tutorApplicationRepository from '../repositories/tutor-application.repository';
import * as userRepository from '../repositories/user.repository';
import { sendTutorApplicationNotification } from './email.service';
import prisma from '../prisma';

const PREFERRED_METHOD_LABELS = { WA: 'WhatsApp', call: 'Llamada', email: 'Email' };

/**
 * Submit a new tutor application for a user.
 * - Rejects if the user already has a Pending application.
 * - Persists the application and creates tutor_courses records with experience.
 * - Fires an admin email notification (email failure does NOT rollback the DB insert).
 *
 * @param {number} userId
 * @param {{ reasonsToTeach: string, courses: {courseId: string, experience?: string}[], contactInfo: object }} data
 * @returns {Promise<Object>} The created application
 * @throws {Error} If a pending application already exists
 */
export async function submitApplication(userId, data) {
  console.log('[submitApplication] Starting with userId:', userId);
  
  const existing = await tutorApplicationRepository.findPendingByUserId(userId);
  if (existing) {
    const err = new Error('Ya tienes una solicitud en revisión.');
    err.code = 'ALREADY_PENDING';
    throw err;
  }

  // Overwrite the user's stored phone with the one provided in the
  // application, so we keep a single source of truth on `users.phone_number`
  // (no separate WA column on the application form).
  if (data.contactInfo?.phone) {
    console.log('[submitApplication] Updating user phone...');
    try {
      await userRepository.update(userId, { phoneNumber: data.contactInfo.phone });
    } catch (err) {
      console.error('[submitApplication] Error updating user phone:', err.message);
      throw new Error(`Error actualizando teléfono del usuario: ${err.message}`);
    }
  }

  // Extract course IDs for the application record
  const courseIds = data.courses.map((c) => c.courseId);
  console.log('[submitApplication] Creating application with courses:', courseIds);

  // Use transaction to ensure atomicity: create application, delete old tutor_courses, insert new ones
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      console.log('[submitApplication] Transaction started');
      
      // 0. Ensure TutorProfile exists (required for tutor_courses foreign key)
      console.log('[submitApplication] Checking/creating TutorProfile...');
      const existingProfile = await tx.tutorProfile.findUnique({
        where: { userId },
      });
      
      if (!existingProfile) {
        console.log('[submitApplication] TutorProfile not found, creating...');
        await tx.tutorProfile.create({
          data: {
            userId,
            schoolEmail: `tutor-${userId}@calico.local`, // Placeholder email
          },
        });
        console.log('[submitApplication] TutorProfile created successfully');
      } else {
        console.log('[submitApplication] TutorProfile already exists');
      }
      
      // 1. Create TutorApplication record
      console.log('[submitApplication] Creating TutorApplication record...');
      const application = await tx.tutorApplication.create({
        data: {
          userId,
          reasonsToTeach: data.reasonsToTeach,
          subjects: courseIds, // Store course IDs in subjects for compatibility
          contactInfo: data.contactInfo, // Store contact info as JSON
          status: 'Pending',
        },
      });
      console.log('[submitApplication] TutorApplication created:', application.id);

      // 2. Delete existing tutor_courses records for this user (replacement behavior)
      console.log('[submitApplication] Deleting existing tutor_courses...');
      await tx.tutorCourse.deleteMany({
        where: { tutorId: userId },
      });
      console.log('[submitApplication] Old tutor_courses deleted');

      // 3. Create new tutor_courses records with experience data
      console.log('[submitApplication] Creating tutor_courses records...');
      const tutorCoursesData = data.courses.map((course) => ({
        tutorId: userId,
        courseId: course.courseId,
        experience: course.experience?.trim() || null,
        status: 'Pending',
      }));
      
      console.log('[submitApplication] tutor_courses data:', tutorCoursesData);
      await tx.tutorCourse.createMany({
        data: tutorCoursesData,
      });
      console.log('[submitApplication] tutor_courses created successfully');

      return application;
    });
  } catch (err) {
    console.error('[submitApplication] Transaction error:', {
      message: err.message,
      code: err.code,
      meta: err.meta,
    });
    throw err;
  }

  // Fire-and-forget: log on failure but do NOT rollback the saved application
  console.log('[submitApplication] Fetching user and course data for email...');
  const [user, courses] = await Promise.all([
    userRepository.findById(userId),
    prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: { name: true },
    }),
  ]);

  console.log('[submitApplication] Sending email notification...');
  const subjectNames = courses.map((c) => c.name).join(', ') || courseIds.join(', ');
  const methodLabel = PREFERRED_METHOD_LABELS[data.contactInfo.preferredMethod] ?? data.contactInfo.preferredMethod;
  const llavePart = data.contactInfo.llave ? ` · Llave: ${data.contactInfo.llave}` : '';
  const contactLabel = `${data.contactInfo.phone} (${methodLabel})${llavePart}`;

  sendTutorApplicationNotification(
    { name: user.name, email: user.email },
    { reasonsToTeach: data.reasonsToTeach, subjects: subjectNames, contactInfo: contactLabel },
  ).catch((err) => {
    console.error('[TutorApplicationService] Admin email notification failed:', err.message);
  });

  console.log('[submitApplication] Completed successfully');
  return result;
}

/**
 * Get the latest application for a user (any status).
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
export async function getLatestApplication(userId) {
  return tutorApplicationRepository.findLatestByUserId(userId);
}
