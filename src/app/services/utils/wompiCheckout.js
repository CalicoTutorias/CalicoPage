/**
 * Shared Wompi widget helpers (BookingForm and the event checkout).
 * Browser-only: touches `document` / `window.WidgetCheckout`.
 */

import { sanitizeReturnTo } from '../../../lib/utils/returnTo';

const WOMPI_SCRIPT_ID = 'wompi-widget-script';

/**
 * The last checkout opened in this browser, so /payments/confirm (where Wompi
 * sends the student back with `?id=<transactionId>` after PSE & co.) knows
 * which reference to confirm and where to send them next.
 */
const LAST_CHECKOUT_KEY = 'calico_last_wompi_checkout';
const LAST_CHECKOUT_TTL_MS = 24 * 60 * 60 * 1000;

/** Inject Wompi's widget.js once (idempotent). */
export function loadWompiScript() {
    if (document.getElementById(WOMPI_SCRIPT_ID)) return;
    const script = document.createElement('script');
    script.id = WOMPI_SCRIPT_ID;
    script.src = 'https://checkout.wompi.co/widget.js';
    script.async = true;
    document.body.appendChild(script);
}

/**
 * Build a `WidgetCheckout` from the server-signed checkout data.
 * `customer`: { email, fullName, phoneNumber, legalId? }.
 * `returnTo`: Calico path the return page links to after the payment.
 */
export function createWompiWidget({ amountInCents, reference, publicKey, signature, customer, returnTo }) {
    try {
        window.localStorage.setItem(
            LAST_CHECKOUT_KEY,
            JSON.stringify({ reference, returnTo, savedAt: Date.now() }),
        );
    } catch {
        // Storage unavailable: the return page falls back to a generic message.
    }
    return new window.WidgetCheckout({
        currency: 'COP',
        amountInCents,
        reference,
        publicKey,
        signature: { integrity: signature },
        redirectUrl: `${window.location.origin}/payments/confirm`,
        customerData: {
            email: customer.email,
            fullName: customer.fullName,
            phoneNumber: customer.phoneNumber,
            phoneNumberPrefix: '+57',
            legalId: customer.legalId || '123456789',
            legalIdType: 'CC',
        },
    });
}

/**
 * The checkout remembered by createWompiWidget, or null when there is none,
 * it is older than 24 h or malformed. `returnTo` is sanitized (localStorage is
 * user-writable) and may be null.
 * @returns {{ reference: string, returnTo: string|null, savedAt: number }|null}
 */
export function readLastWompiCheckout() {
    try {
        const { reference, returnTo, savedAt } = JSON.parse(window.localStorage.getItem(LAST_CHECKOUT_KEY));
        if (typeof reference !== 'string' || !reference) return null;
        if (typeof savedAt !== 'number' || Date.now() - savedAt > LAST_CHECKOUT_TTL_MS) return null;
        return { reference, returnTo: sanitizeReturnTo(returnTo), savedAt };
    } catch {
        return null;
    }
}

export function clearLastWompiCheckout() {
    try {
        window.localStorage.removeItem(LAST_CHECKOUT_KEY);
    } catch {
        // Storage unavailable: nothing was remembered.
    }
}

/**
 * Open the Wompi widget and report back what happened.
 *
 * Wompi's WidgetCheckout only invokes checkout.open()'s callback once a
 * transaction is attempted/completed — it has no documented onClose hook, so
 * a user who dismisses the widget's own close (X) button without paying never
 * fires that callback, and any state set to "processing" before open() is
 * left stuck forever. To recover from that, watch the DOM for the iframe the
 * widget injects and treat its removal (with no transaction reported yet) as
 * a cancelled attempt.
 *
 * @param {object} checkout - an instance returned by `new window.WidgetCheckout(...)`
 * @param {(result: object|null) => void} onResult - called with Wompi's result
 *   object on completion, or `null` if the widget was closed without one.
 */
export function openWompiCheckout(checkout, onResult) {
    let settled = false;
    const iframesBefore = new Set(document.querySelectorAll('iframe'));
    let widgetFrame = null;
    let closeObserver = null;

    const openObserver = new MutationObserver(() => {
        if (widgetFrame) return;
        widgetFrame = Array.from(document.querySelectorAll('iframe')).find(
            (frame) => !iframesBefore.has(frame),
        );
        if (!widgetFrame) return;

        openObserver.disconnect();
        closeObserver = new MutationObserver(() => {
            if (settled || document.body.contains(widgetFrame)) return;
            closeObserver.disconnect();
            onResult(null);
        });
        closeObserver.observe(document.body, { childList: true, subtree: true });
    });
    openObserver.observe(document.body, { childList: true, subtree: true });

    checkout.open((result) => {
        settled = true;
        openObserver.disconnect();
        closeObserver?.disconnect();
        onResult(result);
    });
}
