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
 * - Persists the application, then fires an admin email notification
 *   (email failure does NOT rollback the DB insert).
 *
 * @param {number} userId
 * @param {{ reasonsToTeach: string, subjects: string[], contactInfo: object }} data
 * @returns {Promise<Object>} The created application
 * @throws {Error} If a pending application already exists
 */
export async function submitApplication(userId, data) {
  const existing = await tutorApplicationRepository.findPendingByUserId(userId);
  if (existing) {
    const err = new Error('Ya tienes una solicitud en revisión.');
    err.code = 'ALREADY_PENDING';
    throw err;
  }

  const application = await tutorApplicationRepository.create({
    userId,
    reasonsToTeach: data.reasonsToTeach,
    subjects: data.subjects,
    contactInfo: data.contactInfo,
  });

  // Fire-and-forget: log on failure but do NOT rollback the saved application
  const [user, courses] = await Promise.all([
    userRepository.findById(userId),
    prisma.course.findMany({
      where: { id: { in: data.subjects } },
      select: { name: true },
    }),
  ]);

  const subjectNames = courses.map((c) => c.name).join(', ') || data.subjects.join(', ');
  const contactLabel = `${data.contactInfo.phone} (${PREFERRED_METHOD_LABELS[data.contactInfo.preferredMethod] ?? data.contactInfo.preferredMethod})`;

  sendTutorApplicationNotification(
    { name: user.name, email: user.email },
    { reasonsToTeach: data.reasonsToTeach, subjects: subjectNames, contactInfo: contactLabel },
  ).catch((err) => {
    console.error('[TutorApplicationService] Admin email notification failed:', err.message);
  });

  return application;
}

/**
 * Get the latest application for a user (any status).
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
export async function getLatestApplication(userId) {
  return tutorApplicationRepository.findLatestByUserId(userId);
}
