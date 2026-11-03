/**
 * /payments/confirm — where Wompi sends the student back ("Volver al comercio")
 * after paying outside the widget (PSE, Nequi, …). Wompi appends
 * `?id=<transactionId>`; the reference and the page to continue to come from
 * the checkout remembered by createWompiWidget in this browser.
 *
 * Never offers to pay again: whatever happens, the student is told the payment
 * was received (or is in progress) and gets a button back into Calico.
 */

'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Clock, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PaymentService, PENDING_CONFIRM_POLLING } from '@/app/services/core/PaymentService';
import { clearLastWompiCheckout, readLastWompiCheckout } from '@/app/services/utils/wompiCheckout';
import { useI18n } from '@/lib/i18n';
import routes from '@/routes';

const VIEWS = {
  confirmed: {
    Icon: CheckCircle2,
    iconClass: 'text-[var(--calico-green-success)]',
    title: 'payments.return.confirmedTitle',
    body: 'payments.return.confirmedBody',
  },
  pending: {
    Icon: Clock,
    iconClass: 'text-[var(--calico-warning-text)]',
    title: 'payments.return.pendingTitle',
    body: 'payments.return.pendingBody',
  },
  received: {
    Icon: Info,
    iconClass: 'text-[var(--calico-info-text)]',
    title: 'payments.return.receivedTitle',
    body: 'payments.return.receivedBody',
  },
};

/** Confirm the remembered checkout against the transaction Wompi sent back. */
async function confirmReturn(transactionId) {
  const checkout = readLastWompiCheckout();
  // Another device/browser, or no transaction id: nothing safe to confirm.
  if (!transactionId || !checkout) return { status: 'received', returnTo: routes.HISTORY };

  const returnTo = checkout.returnTo || routes.HISTORY;
  try {
    await PaymentService.confirmWompiPayment(
      { reference: checkout.reference, transactionId },
      PENDING_CONFIRM_POLLING,
    );
    clearLastWompiCheckout();
    return { status: 'confirmed', returnTo };
  } catch (err) {
    return { status: err?.code === 'PAYMENT_PENDING' ? 'pending' : 'received', returnTo };
  }
}

function Card({ children }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-[var(--space-4)] bg-[var(--app-body-bg)]">
      <div
        role="status"
        className="w-full max-w-[var(--form-narrow)] flex flex-col items-center gap-[var(--space-3)] text-center bg-card rounded-[var(--radius-xl)] shadow-[var(--elev-2)] p-[var(--space-5)]"
      >
        {children}
      </div>
    </main>
  );
}

function Confirming() {
  const { t } = useI18n();
  return (
    <Card>
      <Loader2 aria-hidden="true" className="size-10 animate-spin text-[var(--calico-orange)]" />
      <p className="text-[length:var(--type-body)] text-[var(--calico-body-muted)]">
        {t('payments.return.confirming')}
      </p>
    </Card>
  );
}

function PaymentConfirmContent() {
  const { t } = useI18n();
  const transactionId = useSearchParams().get('id');
  const [result, setResult] = useState(null);

  useEffect(() => {
    let active = true;
    confirmReturn(transactionId).then((next) => {
      if (active) setResult(next);
    });
    return () => {
      active = false;
    };
  }, [transactionId]);

  if (!result) return <Confirming />;

  const { Icon, iconClass, title, body } = VIEWS[result.status];
  return (
    <Card>
      <Icon aria-hidden="true" className={`size-12 ${iconClass}`} />
      <h1 className="text-[length:var(--type-h3)] font-semibold text-[var(--calico-ink)]">{t(title)}</h1>
      <p className="text-[length:var(--type-body)] text-[var(--calico-body-muted)]">{t(body)}</p>
      <Button asChild variant="cta" size="lg">
        <Link href={result.returnTo}>{t('payments.return.continue')}</Link>
      </Button>
    </Card>
  );
}

export default function PaymentConfirmPage() {
  return (
    <Suspense fallback={<Confirming />}>
      <PaymentConfirmContent />
    </Suspense>
  );
}
