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
  EMAIL_VERIFICATION: 2,        // params: EMAIL, NAME, VERIFICATION_LINK
  PASSWORD_RESET_LINK: 4,       // params: NAME, RESET_LINK
  PASSWORD_CHANGED: 3,          // params: NAME
  TUTOR_APPLICATION_ADMIN: 5,   // params: APPLICANT_NAME, APPLICANT_EMAIL, REASONS, SUBJECTS, CONTACT_INFO
  SESSION_CONFIRMED: 7,         // params: RECIPIENT_NAME, TUTOR_NAME, STUDENT_NAME, COURSE_NAME, START_TIME, END_TIME, MEET_LINK
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
 * Send session confirmation email to tutor
 * 
 * @param {Object} params
 * @param {string} params.tutorEmail - Tutor's email address
 * @param {string} params.tutorName - Tutor's name
 * @param {string} params.studentName - Student's name
 * @param {string} params.courseName - Course name
 * @param {Date} params.startTime - Session start time
 * @param {Date} params.endTime - Session end time
 * @param {string} params.meetLink - Google Meet link (optional)
 */
export async function sendSessionConfirmationToTutor({
  tutorEmail,
  tutorName,
  studentName,
  courseName,
  startTime,
  endTime,
  meetLink,
}) {
  // Format dates for Colombian timezone
  const formatDate = (date) => {
    return new Date(date).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'full',
      timeStyle: 'short',
    });
  };

  return sendBrevoEmail({
    to: [{ email: tutorEmail, name: tutorName }],
    templateId: TEMPLATE_IDS.SESSION_CONFIRMED,
    params: {
      RECIPIENT_NAME: tutorName,
      TUTOR_NAME: tutorName,
      STUDENT_NAME: studentName,
      COURSE_NAME: courseName,
      START_TIME: formatDate(startTime),
      END_TIME: formatDate(endTime),
      MEET_LINK: meetLink || 'Se compartirá pronto',
    },
  });
}

/**
 * Send session confirmation email to student
 * 
 * @param {Object} params
 * @param {string} params.studentEmail - Student's email address
 * @param {string} params.studentName - Student's name
 * @param {string} params.tutorName - Tutor's name
 * @param {string} params.courseName - Course name
 * @param {Date} params.startTime - Session start time
 * @param {Date} params.endTime - Session end time
 * @param {string} params.meetLink - Google Meet link (optional)
 */
export async function sendSessionConfirmationToStudent({
  studentEmail,
  studentName,
  tutorName,
  courseName,
  startTime,
  endTime,
  meetLink,
}) {
  // Format dates for Colombian timezone
  const formatDate = (date) => {
    return new Date(date).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'full',
      timeStyle: 'short',
    });
  };

  return sendBrevoEmail({
    to: [{ email: studentEmail, name: studentName }],
    templateId: TEMPLATE_IDS.SESSION_CONFIRMED,
    params: {
      RECIPIENT_NAME: studentName,
      TUTOR_NAME: tutorName,
      STUDENT_NAME: studentName,
      COURSE_NAME: courseName,
      START_TIME: formatDate(startTime),
      END_TIME: formatDate(endTime),
      MEET_LINK: meetLink || 'Se compartirá pronto',
    },
  });
}

export default {
  sendVerificationEmail,
  sendPasswordResetLink,
  sendPasswordChangeConfirmation,
  sendTutorApplicationNotification,
  sendSessionConfirmationToTutor,
  sendSessionConfirmationToStudent,
};
