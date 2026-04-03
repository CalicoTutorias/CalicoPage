/**
 * /app/payments/confirm
 * Confirmation page after Wompi payment
 * This page handles the flow after user completes payment in Wompi
 */

'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import PaymentService from '@/app/services/core/PaymentService';
import { useI18n } from '@/lib/i18n';

function PaymentConfirmContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useI18n();

  const [state, setState] = useState({
    status: 'loading',
    message: '',
    reference: '',
  });

  useEffect(() => {
    const handleConfirmation = async () => {
      try {
        // Get confirmation from query params
        const confirmation = PaymentService.handlePaymentConfirmation(searchParams);
        
        setState({
          status: confirmation.status,
          message: confirmation.message,
          reference: confirmation.reference,
        });

        // If successful, navigate to history after 3 seconds
        if (confirmation.status === 'success') {
          setTimeout(() => {
            router.push('/home/history');
          }, 3000);
        }
      } catch (error) {
        setState({
          status: 'error',
          message: error.message,
          reference: '',
        });
      }
    };

    handleConfirmation();
  }, [searchParams, router]);

  const renderContent = () => {
    switch (state.status) {
      case 'loading':
        return (
          <div className="confirmation-loading">
            <div className="spinner"></div>
            <p>{t('payments.processingPayment', { defaultValue: 'Procesando tu pago...' })}</p>
          </div>
        );

      case 'success':
        return (
          <div className="confirmation-success">
            <div className="icon">✅</div>
            <h2>{t('payments.paymentSuccessful', { defaultValue: '¡Pago Exitoso!' })}</h2>
            <p>{state.message}</p>
            <p className="reference">
              {t('payments.reference', { defaultValue: 'Referencia' })}: {state.reference}
            </p>
            <p className="redirect-text">
              {t('payments.redirectingToHistory', { 
                defaultValue: 'Redirigiendo a tu historial de sesiones...' 
              })}
            </p>
          </div>
        );

      case 'declined':
        return (
          <div className="confirmation-declined">
            <div className="icon">❌</div>
            <h2>{t('payments.paymentDeclined', { defaultValue: 'Pago Rechazado' })}</h2>
            <p>{state.message}</p>
            <p className="reference">
              {t('payments.reference', { defaultValue: 'Referencia' })}: {state.reference}
            </p>
            <button 
              onClick={() => router.back()}
              className="btn-retry"
            >
              {t('common.tryAgain', { defaultValue: 'Intentar de Nuevo' })}
            </button>
          </div>
        );

      case 'error':
      default:
        return (
          <div className="confirmation-error">
            <div className="icon">⚠️</div>
            <h2>{t('payments.paymentError', { defaultValue: 'Error en el Pago' })}</h2>
            <p>{state.message}</p>
            <button 
              onClick={() => router.back()}
              className="btn-retry"
            >
              {t('common.goBack', { defaultValue: 'Volver Atrás' })}
            </button>
          </div>
        );
    }
  };

  return (
    <div className="payment-confirmation-page">
      <div className="container">
        {renderContent()}
      </div>

      <style jsx>{`
        .payment-confirmation-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
            'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
            sans-serif;
        }

        .container {
          background: white;
          border-radius: 12px;
          padding: 48px 32px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          max-width: 500px;
          width: 90%;
          text-align: center;
        }

        .confirmation-loading,
        .confirmation-success,
        .confirmation-declined,
        .confirmation-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
        }

        .icon {
          font-size: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 80px;
          height: 80px;
          background: #f0f4ff;
          border-radius: 50%;
          margin: 0 auto;
        }

        .confirmation-success .icon {
          background: #ecfdf5;
        }

        .confirmation-declined .icon,
        .confirmation-error .icon {
          background: #fef3c7;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #f3f4f6;
          border-top-color: #667eea;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        h2 {
          font-size: 28px;
          font-weight: 600;
          color: #111827;
          margin: 0;
        }

        p {
          color: #6b7280;
          font-size: 16px;
          margin: 0;
          line-height: 1.5;
        }

        .reference {
          font-family: 'Courier New', monospace;
          font-size: 14px;
          color: #9ca3af;
          background: #f9fafb;
          padding: 8px 12px;
          border-radius: 6px;
          word-break: break-all;
        }

        .redirect-text {
          font-size: 14px;
          color: #9ca3af;
          font-style: italic;
        }

        .btn-retry {
          padding: 12px 24px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-top: 8px;
        }

        .btn-retry:hover {
          background: #5568d3;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        @media (max-width: 640px) {
          .container {
            padding: 32px 20px;
          }

          h2 {
            font-size: 24px;
          }

          p {
            font-size: 14px;
          }

          .icon {
            width: 64px;
            height: 64px;
            font-size: 48px;
          }
        }
      `}</style>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid #f3f4f6',
          borderTopColor: '#667eea',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 16px',
        }} />
        <p>Cargando...</p>
      </div>
    </div>
  );
}

export default function PaymentConfirmPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PaymentConfirmContent />
    </Suspense>
  );
}
