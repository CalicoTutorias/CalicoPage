/**
 * POST /api/payments/webhook
 * Webhook endpoint for Wompi payment confirmations
 * 
 * Wompi POSTs transaction status updates here with signature verification
 * 
 * Expected header:
 *   X-Wompi-Signature: HMAC-SHA256 signature of request body
 */

import * as WompiService from '@/lib/services/wompi.service';

/**
 * Helper to read raw body for signature verification
 */
async function getRawBody(request) {
  const buffer = await request.arrayBuffer();
  return buffer;
}

export async function POST(request) {
  try {
    // Get raw body for signature verification
    const rawBody = await getRawBody(request);
    const bodyString = new TextDecoder().decode(rawBody);

    // Get signature from header
    const signature = request.headers.get('x-wompi-signature');
    if (!signature) {
      console.error('[Wompi Webhook] Missing signature header');
      return Response.json(
        { success: false, error: 'Missing signature header' },
        { status: 401 }
      );
    }

    // Verify webhook signature
    const isValid = WompiService.verifyWebhookSignature(bodyString, signature);
    if (!isValid) {
      console.error('[Wompi Webhook] Invalid signature');
      return Response.json(
        { success: false, error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Parse request body
    const data = JSON.parse(bodyString);
    const { data: transactionData, event } = data;

    console.log('[Wompi Webhook] Event received:', event);
    console.log('[Wompi Webhook] Transaction data:', JSON.stringify(transactionData, null, 2));

    // We're mainly interested in payment confirmation events
    if (event !== 'transaction.updated') {
      console.log(`[Wompi Webhook] Unhandled event type: ${event}`);
      return Response.json(
        { success: true, message: 'Event acknowledged but not processed' },
        { status: 200 }
      );
    }

    // Check transaction status
    const { status: transactionStatus } = transactionData;

    if (transactionStatus === 'APPROVED') {
      // ✅ Payment successful: create session, payment, and review
      const result = await WompiService.processSuccessfulPayment(transactionData);

      console.log(
        `[Wompi Webhook] ✓ Payment approved: wompi_id=${transactionData.id}, session=${result.session?.id}`
      );

      return Response.json(
        {
          success: true,
          message: 'Payment processed successfully',
          result,
        },
        { status: 200 }
      );
    } else if (transactionStatus === 'DECLINED' || transactionStatus === 'ERROR') {
      // ❌ Payment failed
      const studentId = transactionData.metadata?.studentId || transactionData.reference?.split('-')[0];
      const tutorId = transactionData.metadata?.tutorId;
      
      await WompiService.handleFailedPayment({
        wompiTransactionId: transactionData.id,
        reference: transactionData.reference,
        reason: transactionStatus,
        studentId,
        tutorId,
      });

      console.log(
        `[Wompi Webhook] ✗ Payment failed: wompi_id=${transactionData.id}, status=${transactionStatus}`
      );

      return Response.json(
        { success: true, message: 'Payment failure acknowledged' },
        { status: 200 }
      );
    } else {
      // Other statuses (PENDING, etc.)
      console.log(
        `[Wompi Webhook] Payment status: ${transactionStatus} for wompi_id=${transactionData.id}`
      );

      return Response.json(
        { success: true, message: `Transaction status updated to ${transactionStatus}` },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error('[Wompi Webhook] Error:', error.message, error.stack);

    // Always return 200 so Wompi doesn't retry
    return Response.json(
      {
        success: false,
        error: error.message,
      },
      { status: 200 }
    );
  }
}
