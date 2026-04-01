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
  EMAIL_VERIFICATION: 13,        // params: EMAIL, NAME, VERIFICATION_LINK
  PASSWORD_RESET_LINK: 14,       // params: NAME, RESET_LINK
  PASSWORD_CHANGED: 15,          // params: NAME
  TUTOR_APPLICATION_ADMIN: 16,   // params: APPLICANT_NAME, APPLICANT_EMAIL, REASONS, SUBJECTS, CONTACT_INFO
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

export default {
  sendVerificationEmail,
  sendPasswordResetLink,
  sendPasswordChangeConfirmation,
  sendTutorApplicationNotification,
};
