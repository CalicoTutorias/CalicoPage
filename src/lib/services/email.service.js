/**
 * Email Service - Brevo (SendinBlue) Integration
 * Handles all transactional email sending for the application.
 *
 * Environment variables required:
 *   BREVO_API_KEY        – Brevo API key (xkeysib-…)
 *   BREVO_SENDER_EMAIL   – Verified sender address
 *   BREVO_SENDER_NAME    – Display name shown in emails
 */

const BREVO_API_URL = 'https://api.sendinblue.com/v3/smtp/email';

// ---------------------------------------------------------------------------
// Template IDs — update these after creating templates in Brevo dashboard
// ---------------------------------------------------------------------------
const TEMPLATE_IDS = {
  EMAIL_VERIFICATION: 2,         // params: EMAIL, NAME, VERIFICATION_LINK
  PASSWORD_RESET_LINK: 4,        // params: NAME, RESET_LINK
  PASSWORD_CHANGED: 3,           // params: NAME
  TUTOR_APPLICATION_ADMIN: 5,    // params: APPLICANT_NAME, APPLICANT_EMAIL, REASONS, SUBJECTS, CONTACT_INFO
  NEW_SESSION_REQUEST: 8,        // params: TUTOR_NAME, STUDENT_NAME, COURSE_NAME, SESSION_DATE, TOPICS_PREVIEW, DETAIL_LINK, ATTACHMENT_COUNT
  SESSION_CONFIRMED: 7,          // params: RECIPIENT_NAME, TUTOR_NAME, STUDENT_NAME, COURSE_NAME, START_TIME, END_TIME, MEET_LINK
  COURSE_REQUEST_ADMIN: 10,       // params: TUTOR_NAME, TUTOR_ID, TUTOR_EMAIL, IS_EXISTING_TUTOR, COURSES_SUMMARY
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Truncate text to a safe length for email templates.
 * Avoids breaking email layouts on mobile clients (Gmail, Outlook app).
 */
function truncateForEmail(text, maxLength = 150) {
  if (!text) return '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trimEnd() + '...';
}

function getConfig() {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'Calico';

  if (!apiKey) {
    throw new Error('BREVO_API_KEY environment variable is not configured');
  }
  if (!senderEmail) {
    throw new Error('BREVO_SENDER_EMAIL environment variable is not configured');
  }

  return { apiKey, senderEmail, senderName };
}

/**
 * Low-level email sender via Brevo transactional API.
 * All other public functions delegate to this one.
 */
async function sendBrevoEmail({ to, templateId, params }) {
  const { apiKey, senderEmail, senderName } = getConfig();

  const body = {
    sender: { name: senderName, email: senderEmail },
    to: Array.isArray(to) ? to : [to],
    templateId,
    params,
  };

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'api-key': apiKey,
      accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[EmailService] Brevo API error:', response.status, errorText);
    throw new Error(`Brevo email failed (${response.status}): ${errorText}`);
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send email verification link after registration.
 *
 * @param {string} email          Recipient email
 * @param {string} name           Recipient display name
 * @param {string} verificationToken  Hex token embedded in the link
 */
export async function sendVerificationEmail(email, name, verificationToken) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const verificationLink = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(verificationToken)}`;

  return sendBrevoEmail({
    to: [{ email, name }],
    templateId: TEMPLATE_IDS.EMAIL_VERIFICATION,
    params: {
      EMAIL: email,
      NAME: name,
      VERIFICATION_LINK: verificationLink,
    },
  });
}

/**
 * Send a magic link for the "forgot password" flow.
 *
 * @param {string} email      Recipient email
 * @param {string} name       Recipient display name
 * @param {string} resetLink  Full URL with reset token
 */
export async function sendPasswordResetLink(email, name, resetLink) {
  return sendBrevoEmail({
    to: [{ email, name }],
    templateId: TEMPLATE_IDS.PASSWORD_RESET_LINK,
    params: {
      NAME: name,
      RESET_LINK: resetLink,
    },
  });
}

/**
 * Send confirmation that the user's password was changed.
 *
 * @param {string} email  Recipient email
 * @param {string} name   Recipient display name
 */
export async function sendPasswordChangeConfirmation(email, name) {
  return sendBrevoEmail({
    to: [{ email, name }],
    templateId: TEMPLATE_IDS.PASSWORD_CHANGED,
    params: {
      NAME: name,
    },
  });
}

/**
 * Notify the admin that a new tutor application was submitted.
 * Uses ADMIN_NOTIFICATION_EMAIL env var as recipient.
 *
 * @param {Object} applicant - { name, email }
 * @param {Object} application - { reasonsToTeach, subjects, contactInfo }
 */
export async function sendTutorApplicationNotification(applicant, application) {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) {
    throw new Error('ADMIN_NOTIFICATION_EMAIL environment variable is not configured');
  }

  return sendBrevoEmail({
    to: [{ email: adminEmail, name: 'Calico Admin' }],
    templateId: TEMPLATE_IDS.TUTOR_APPLICATION_ADMIN,
    params: {
      APPLICANT_NAME: applicant.name,
      APPLICANT_EMAIL: applicant.email,
      REASONS: application.reasonsToTeach,
      SUBJECTS: application.subjects,
      CONTACT_INFO: application.contactInfo,
    },
  });
}

/**
 * Notify a tutor that a new tutoring session request has been submitted.
 *
 * The email contains a direct link to the session detail page where the tutor
 * can review the student's request, download attachments, and accept/reject.
 *
 * Brevo template variables (configure in Brevo dashboard under template ID 6):
 *   {{params.TUTOR_NAME}}       — Tutor's display name
 *   {{params.STUDENT_NAME}}     — Student who requested the session
 *   {{params.COURSE_NAME}}      — Course/subject name
 *   {{params.SESSION_DATE}}     — Formatted date and time of the session
 *   {{params.TOPICS_PREVIEW}}   — First ~150 chars of what the student wants to review
 *   {{params.DETAIL_LINK}}      — Absolute URL to the session detail page
 *   {{params.ATTACHMENT_COUNT}} — Number of files the student attached (0 if none)
 *
 * @param {string} tutorEmail     Tutor's email address
 * @param {string} tutorName      Tutor's display name
 * @param {Object} params
 * @param {string} params.studentName     Student's display name
 * @param {string} params.courseName      Course name
 * @param {string} params.sessionDate     Formatted date string (e.g., "15 de abril, 2026 — 10:00 AM")
 * @param {string} params.topicsToReview  Full text of what the student wants to review (will be truncated)
 * @param {string} params.sessionId       Session UUID for building the detail link
 * @param {number} params.attachmentCount Number of files attached
 */
export async function sendNewSessionRequestEmail(tutorEmail, tutorName, {
  studentName,
  courseName,
  sessionDate,
  topicsToReview,
  sessionId,
  attachmentCount = 0,
}) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
  const detailLink = `${baseUrl}/sessions/${sessionId}/detail`;

  return sendBrevoEmail({
    to: [{ email: tutorEmail, name: tutorName }],
    templateId: TEMPLATE_IDS.NEW_SESSION_REQUEST,
    params: {
      TUTOR_NAME: tutorName,
      STUDENT_NAME: studentName,
      COURSE_NAME: courseName,
      SESSION_DATE: sessionDate,
      TOPICS_PREVIEW: truncateForEmail(topicsToReview, 150),
      DETAIL_LINK: detailLink,
      ATTACHMENT_COUNT: String(attachmentCount),
    },
  });
}

/**
 * Send session-confirmed email (template 7) to either tutor or student.
 * Same template for both — caller sets RECIPIENT_NAME accordingly.
 */
export async function sendSessionConfirmedEmail(recipientEmail, {
  recipientName,
  tutorName,
  studentName,
  courseName,
  startTime,
  endTime,
  meetLink,
}) {
  return sendBrevoEmail({
    to: [{ email: recipientEmail, name: recipientName }],
    templateId: TEMPLATE_IDS.SESSION_CONFIRMED,
    params: {
      RECIPIENT_NAME: recipientName,
      TUTOR_NAME: tutorName,
      STUDENT_NAME: studentName,
      COURSE_NAME: courseName,
      START_TIME: startTime,
      END_TIME: endTime,
      MEET_LINK: meetLink || '',
    },
  });
}

/**
 * Notify the admin that a tutor has requested approval for new courses.
 * Sent both when a new applicant selects courses and when an existing tutor requests more.
 *
 * Brevo template variables (template ID 9):
 *   {{params.TUTOR_NAME}}         — Tutor display name
 *   {{params.TUTOR_ID}}           — Tutor user ID (for DB lookup)
 *   {{params.TUTOR_EMAIL}}        — Tutor email
 *   {{params.IS_EXISTING_TUTOR}}  — "Sí" or "No"
 *   {{params.COURSES_SUMMARY}}    — Plain-text list: "Cálculo (ID: …, Evidencia: …)\n…"
 *
 * @param {{ id: string, name: string, email: string }} tutor
 * @param {Array<{ courseId: string, courseName: string, workSampleUrl: string|null }>} courseRequests
 * @param {boolean} isExistingTutor
 */
export async function sendCourseRequestNotification(tutor, courseRequests, isExistingTutor = false) {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) {
    throw new Error('ADMIN_NOTIFICATION_EMAIL environment variable is not configured');
  }

  const coursesSummary = courseRequests
    .map((c) => {
      const evidence = c.workSampleUrl ? `Evidencia: ${c.workSampleUrl}` : 'Sin evidencia adjunta';
      return `• ${c.courseName} (ID: ${c.courseId}) — ${evidence}`;
    })
    .join('\n');

  return sendBrevoEmail({
    to: [{ email: adminEmail, name: 'Calico Admin' }],
    templateId: TEMPLATE_IDS.COURSE_REQUEST_ADMIN,
    params: {
      TUTOR_NAME: tutor.name,
      TUTOR_ID: tutor.id,
      TUTOR_EMAIL: tutor.email,
      IS_EXISTING_TUTOR: isExistingTutor ? 'Sí' : 'No',
      COURSES_SUMMARY: coursesSummary,
    },
  });
}

export default {
  sendVerificationEmail,
  sendPasswordResetLink,
  sendPasswordChangeConfirmation,
  sendTutorApplicationNotification,
  sendCourseRequestNotification,
  sendNewSessionRequestEmail,
  sendSessionConfirmedEmail,
};
