/**
 * Wompi Service - Payment Integration
 * Handles integration with Wompi payment gateway.
 *
 * Environment variables required:
 *   WOMPI_PUBLIC_KEY  – Public key for frontend (publishable key)
 *   WOMPI_PRIVATE_KEY – Public key for transactions (same as above, but used server-side)
 *   WOMPI_INTEGRITY_SECRET         – Secret for webhook signature verification
 */

import crypto from 'crypto';
import * as paymentRepo from '../repositories/payment.repository';
import * as sessionService from './session.service';
import * as notificationService from './notification.service';
import * as calicoCalendar from './calico-calendar.service';
import * as userRepo from '../repositories/user.repository';
import * as emailService from './email.service';
import prisma from '../prisma';

const WOMPI_API_BASE = 'https://api.wompi.co/v1';

// ─────────────────────────────────────────────────────────────────────────
// Configuration & Validation
// ─────────────────────────────────────────────────────────────────────────

function getConfig() {
  const publicKey = process.env.WOMPI_PUBLIC_KEY;
  const privateKey = process.env.WOMPI_PRIVATE_KEY;
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;

  if (!publicKey) {
    throw new Error('WOMPI public key environment variables not configured');
  }
  if (!privateKey) {
    throw new Error('WOMPI private key environment variables not configured');
  }
  if (!integritySecret) {
    throw new Error('WOMPI_INTEGRITY_SECRET environment variable is not configured');
  }

  return { publicKey, integritySecret };
}

/**
 * Generate a unique reference for the transaction
 * Format: session_id-timestamp or similar
 */
function generateReference() {
  return `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create an instance ID for Wompi (usually your merchant ID)
 * In Wompi, the "instance" is your account/merchant ID
 */
function getInstance() {
  // For now, using a fixed instance ID. In production, this might come from env vars
  // or be derived from the tutor's merchant account
  return process.env.WOMPI_INSTANCE_ID || 'default';
}

// ─────────────────────────────────────────────────────────────────────────
// Payment Intent Creation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Create a payment intent in Wompi
 * This prepares a transaction in Wompi's system before redirecting to checkout
 *
 * @param {Object} params
 * @param {number} params.studentId - Student making the payment
 * @param {number} params.tutorId - Tutor receiving payment
 * @param {string} params.courseId - Course being booked
 * @param {number} params.amount - Amount in COP (Colombian Pesos)
 * @param {number} params.durationMinutes - Duration of the session in minutes
 * @param {Date} params.startTimestamp - When the session starts
 * @param {Date} params.endTimestamp - When the session ends
 * @param {string} params.redirectUrl - URL to redirect after payment
 * @returns {Object} Payment intent data including checkout URL
 */
export async function createPaymentIntent({
  studentId,
  tutorId,
  courseId,
  amount,
  durationMinutes,
  startTimestamp,
  endTimestamp,
  redirectUrl,
}) {
  const { publicKey, integritySecret } = getConfig();

  // Validation
  if (!studentId || !tutorId || !courseId || !amount) {
    throw new Error('Missing required payment parameters');
  }

  if (amount <= 0) {
    throw new Error('Invalid payment amount');
  }

  // Validate 6-hour minimum booking notice
  const now = new Date();
  const sixHoursFromNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const startDate = new Date(startTimestamp);
  
  if (startDate < sixHoursFromNow) {
    const hoursUntilSession = (startDate - now) / (1000 * 60 * 60);
    throw new Error(
      `Las sesiones deben reservarse con al menos 6 horas de anticipación. ` +
      `Tiempo disponible: ${hoursUntilSession.toFixed(1)} horas.`
    );
  }

  const reference = generateReference();

  // Build the payment payload
  const paymentPayload = {
    amount_in_cents: Math.round(amount * 100), // Wompi works in cents
    currency: 'COP',
    customer: {
      email: `student_${studentId}@calico.local`, // Placeholder; should be fetched from DB
    },
    reference,
    redirect_url: redirectUrl || `${process.env.NEXT_PUBLIC_APP_URL}/payments/confirm`,
    // Additional metadata to track the session
    metadata: {
      studentId: String(studentId),
      tutorId: String(tutorId),
      courseId,
      durationMinutes,
      startTimestamp: startTimestamp.toISOString(),
      endTimestamp: endTimestamp.toISOString(),
    },
  };

  const amountInCents = Math.round(amount * 100);

  // Integrity signature MUST be generated server-side — never in the browser
  const signatureString = `${reference}${amountInCents}COP${integritySecret}`;
  const signature = crypto.createHash('sha256').update(signatureString).digest('hex');

  const intentData = {
    id: `intent_${reference}`,
    public_key: publicKey,
    reference,
    amount,
    amountInCents,
    currency: 'COP',
    signature,
    checkoutUrl: `${WOMPI_API_BASE}/checkout?reference=${reference}&public_key=${publicKey}`,
    metadata: paymentPayload.metadata,
    createdAt: new Date().toISOString(),
  };

  return intentData;
}

// ─────────────────────────────────────────────────────────────────────────
// Payment Confirmation & Session/Review Creation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Process successful payment and create session + payment + review
 * This is called from the webhook after Wompi confirms payment
 *
 * @param {Object} transactionData - Data from Wompi webhook
 * @returns {Object} Created payment, session, review
 */
export async function processSuccessfulPayment(transactionData) {
  const {
    id: wompiTransactionId,
    reference,
    amount_in_cents,
    status,
    customer_email,
    metadata = {},
  } = transactionData;

  console.log('[Wompi] processSuccessfulPayment called with:', {
    wompiTransactionId,
    reference,
    amount_in_cents,
    status,
    metadata,
  });

  // Extract metadata and convert to proper types (metadata values are strings)
  const { studentId, tutorId, courseId, durationMinutes, startTimestamp, endTimestamp } = metadata;
  
  // Convert string IDs to integers
  const studentIdInt = parseInt(studentId, 10);
  const tutorIdInt = parseInt(tutorId, 10);

  // Validation
  if (!studentIdInt || !tutorIdInt || !courseId || !startTimestamp || !endTimestamp) {
    console.error('[Wompi] Invalid metadata:', { studentId, tutorId, courseId, startTimestamp, endTimestamp });
    throw new Error('Invalid metadata in payment transaction');
  }

  // Validate 6-hour minimum booking notice
  const now = new Date();
  const sixHoursFromNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const startDate = new Date(startTimestamp);
  
  if (startDate < sixHoursFromNow) {
    const hoursUntilSession = (startDate - now) / (1000 * 60 * 60);
    throw new Error(
      `Las sesiones deben reservarse con al menos 6 horas de anticipación. ` +
      `Tiempo disponible: ${hoursUntilSession.toFixed(1)} horas.`
    );
  }

  // 1. Deduplication: skip if this Wompi transaction was already processed
  const existingPayment = await paymentRepo.findByWompiId(wompiTransactionId);
  if (existingPayment) {
    console.warn(`[Wompi] Payment already processed for wompi_id=${wompiTransactionId}`);
    return {
      payment: existingPayment,
      session: null,
      message: 'Payment already processed',
    };
  }

  // 2. Generate session ID and prepare session data
  const sessionId = `sess_${crypto.randomBytes(12).toString('hex')}`;
  const endDate = new Date(endTimestamp);

  console.log('[Wompi] Creating session with:', {
    sessionId,
    courseId,
    tutorId: tutorIdInt,
    studentId: studentIdInt,
    startDate,
    endDate,
  });

  // 3. Create session (required before creating payment and review)
  const session = await prisma.session.create({
    data: {
      id: sessionId,
      courseId,
      tutorId: tutorIdInt,
      sessionType: 'Individual', // Default; could be passed from frontend
      maxCapacity: 1,
      startTimestamp: startDate,
      endTimestamp: endDate,
      status: 'Accepted', // Auto-accepted immediately (no tutor approval needed)
      locationType: 'Virtual', // Default; could be passed from frontend
      notes: `Booked via payment intent ${reference}`,
    },
    include: {
      course: true,
      tutor: { select: { id: true, name: true, email: true } },
    },
  });

  console.log('[Wompi] Session created:', { sessionId, id: session.id });

  // Add student as participant
  await prisma.sessionParticipant.create({
    data: {
      sessionId,
      studentId: studentIdInt,
    },
  });

  console.log('[Wompi] Participant added to session');

  // 4. Create payment record
  const amountInPesos = amount_in_cents / 100;
  const payment = await paymentRepo.create({
    sessionId: session.id,
    studentId: studentIdInt,
    tutorId: tutorIdInt,
    amount: amountInPesos,
    status: 'pending', // Payment confirmed, pending manual approval to 'paid'
    wompiId: wompiTransactionId,
  });

  console.log('[Wompi] Payment created:', { id: payment.id, amount: amountInPesos });

  // 5. Create pending review for the student to fill later
  const review = await prisma.review.create({
    data: {
      sessionId: session.id,
      studentId: studentIdInt,
      tutorId: tutorIdInt,
      rating: null, // Not rated yet
      comment: null, // No comment yet
      status: 'pending',
    },
  });

  console.log('[Wompi] Review created:', { id: review.id, status: 'pending' });
  console.log(`[Wompi] ✓ Payment processed: session=${session.id}, payment=${payment.id}, review=${review.id}`);

  // 6. Notifications (fire-and-forget)
  const student = await userRepo.findById(studentIdInt);
  notificationService.notifyPaymentConfirmed(studentIdInt, session);
  notificationService.notifyPendingSessionRequest(session, student?.name || 'Un estudiante');

  // 7. Create Google Calendar event with Meet link immediately after payment
  try {
    console.log('[Wompi] 📅 Creating Google Calendar event...');
    
    // Get student information
    const student = await userRepo.findById(studentIdInt);
    
    // Prepare attendees: tutor + student
    const attendees = [
      { email: session.tutor.email, displayName: session.tutor.name || session.tutor.email },
      { email: student.email, displayName: student.name || student.email },
    ];

    const calendarResult = await calicoCalendar.createTutoringSessionEvent({
      summary: `Tutoría ${session.course.name}`,
      description: `Sesión de tutoría agendada y pagada a través de Calico.\n\nTutor: ${session.tutor.name}\nEstudiante: ${student.name}\nCurso: ${session.course.name}\n\nNOTA: Este evento fue creado automáticamente después de confirmar el pago.`,
      startDateTime: session.startTimestamp,
      endDateTime: session.endTimestamp,
      attendees,
      tutorEmail: session.tutor.email,
      tutorName: session.tutor.name,
      tutorId: session.tutor.id,
      location: 'Google Meet (enlace adjunto)',
    });

    if (calendarResult.success && calendarResult.eventId) {
      // Update session with calendar event info
      await prisma.session.update({
        where: { id: session.id },
        data: {
          googleCalendarEventId: calendarResult.eventId,
          googleMeetLink: calendarResult.meetLink,
        },
      });

      console.log('[Wompi] ✅ Calendar event created:', {
        eventId: calendarResult.eventId,
        meetLink: calendarResult.meetLink,
      });
    } else if (calendarResult.warning) {
      console.warn('[Wompi] ⚠️ Calendar service not configured:', calendarResult.warning);
    }
  } catch (calendarError) {
    console.error('[Wompi] ❌ Failed to create calendar event:', calendarError.message);
    // Don't fail the entire payment process if calendar creation fails
    // Just log the error and continue
  }

  // 7. Send confirmation emails to tutor and student
  try {
    console.log('[Wompi] 📧 Sending confirmation emails...');
    
    // Fetch updated session with Meet link
    const sessionWithMeetLink = await prisma.session.findUnique({
      where: { id: session.id },
      include: {
        course: true,
        tutor: true,
      },
    });

    // Get student information (already fetched above, but refetch to be safe)
    const student = await userRepo.findById(studentIdInt);

    // Send to tutor
    await emailService.sendSessionConfirmationToTutor({
      tutorEmail: session.tutor.email,
      tutorName: session.tutor.name,
      studentName: student.name,
      courseName: session.course.name,
      startTime: session.startTimestamp,
      endTime: session.endTimestamp,
      meetLink: sessionWithMeetLink.googleMeetLink,
    });

    // Send to student
    await emailService.sendSessionConfirmationToStudent({
      studentEmail: student.email,
      studentName: student.name,
      tutorName: session.tutor.name,
      courseName: session.course.name,
      startTime: session.startTimestamp,
      endTime: session.endTimestamp,
      meetLink: sessionWithMeetLink.googleMeetLink,
    });

    console.log('[Wompi] ✅ Confirmation emails sent successfully');
  } catch (emailError) {
    console.error('[Wompi] ❌ Failed to send confirmation emails:', emailError.message);
    // Don't fail the entire payment process if email sending fails
  }

  return {
    payment,
    session,
    review,
    message: 'Payment processed successfully',
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Webhook Signature Verification
// ─────────────────────────────────────────────────────────────────────────

/**
 * Verify Wompi webhook signature
 * Wompi includes an 'X-Wompi-Signature' header with HMAC-SHA256 of the request body
 *
 * @param {string} body - Raw request body
 * @param {string} signature - Signature from X-Wompi-Signature header
 * @returns {boolean} True if signature is valid
 */
export function verifyWebhookSignature(body, signature) {
  const { integritySecret } = getConfig();

  if (!signature) {
    console.error('[Wompi] Missing X-Wompi-Signature header');
    return false;
  }

  // Compute HMAC-SHA256 of the body
  const computed = crypto
    .createHmac('sha256', integritySecret)
    .update(body)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  const isValid = crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(signature)
  );

  if (!isValid) {
    console.error('[Wompi] Invalid webhook signature');
  }

  return isValid;
}

// ─────────────────────────────────────────────────────────────────────────
// Error Handling
// ─────────────────────────────────────────────────────────────────────────

/**
 * Handle failed payment
 * Currently just logs; in future, might send email notifications
 */
export async function handleFailedPayment({
  wompiTransactionId,
  reference,
  reason,
  studentId,
  tutorId,
}) {
  console.error(`[Wompi] ✗ Payment failed: wompi_id=${wompiTransactionId}, reason=${reason}`);

  // Notify student of payment failure (fire-and-forget)
  const studentIdInt = parseInt(studentId, 10);
  if (studentIdInt) {
    notificationService.notifyPaymentFailed(studentIdInt, reference);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Testing Helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Simulate a Wompi payment for testing
 * In production, this would not be exposed
 */
export async function simulateWompiPayment(intentId, metadata) {
  const mockTransactionData = {
    id: `txn_${Date.now()}`,
    reference: intentId,
    amount_in_cents: Math.round(metadata.amount * 100),
    status: 'APPROVED',
    customer_email: `student_${metadata.studentId}@calico.local`,
    metadata,
  };

  return processSuccessfulPayment(mockTransactionData);
}
