import { PaymentService } from '../core/PaymentService';

export const POLL_INTERVAL_MS = 5000;
export const POLL_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Poll the payment status of a reference until it is confirmed, failed, or
 * the timeout elapses. Errors from the service are treated as 'pending'.
 *
 * Calls exactly one of `onConfirmed(session)`, `onFailed()` or `onTimeout()`
 * (none if cancelled). Returns a `cancel()` function.
 */
export function pollPaymentStatus(
    reference,
    { onConfirmed, onFailed, onTimeout, intervalMs = POLL_INTERVAL_MS, timeoutMs = POLL_TIMEOUT_MS },
) {
    let cancelled = false;
    let timer = null;
    const startedAt = Date.now();

    const tick = async () => {
        let result;
        try {
            result = await PaymentService.getPaymentStatus(reference);
        } catch {
            result = { state: 'pending' };
        }
        if (cancelled) return;

        if (result?.state === 'confirmed') return onConfirmed?.(result.session);
        if (result?.state === 'failed') return onFailed?.();

        if (Date.now() - startedAt + intervalMs > timeoutMs) return onTimeout?.();
        timer = setTimeout(tick, intervalMs);
    };

    timer = setTimeout(tick, intervalMs);

    return () => {
        cancelled = true;
        clearTimeout(timer);
    };
}
