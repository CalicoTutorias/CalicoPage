"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/SecureAuthContext';
import { PaymentService } from '../../services/core/PaymentService';
import PaymentCard from '../PaymentCard/PaymentCard';
import { useI18n } from '../../../lib/i18n';

export default function PaymentHistory({ courseQuery = '', startDate = null, endDate = null, onCountChange, showEmpty = false }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Loggear claramente el estudiante autenticado cuando cambie el estado de auth
  useEffect(() => {
    if (!user) return;
    try {
      console.log('[Auth] Estudiante autenticado:', {
        isLoggedIn: user?.isLoggedIn,
        uid: user?.uid || null,
        email: user?.email || null,
        name: user?.name || null,
        role: user?.role || 'Student',
        isTutor: !!user?.isTutor,
      });
    } catch (e) {
      // Evitar romper la UI por el log
    }
  }, [user]);

  useEffect(() => {
    // Determinar el email del usuario autenticado con fallback a localStorage (modo dev)
    let source = 'auth';
    let email = user?.email || '';
    if (!email && typeof window !== 'undefined') {
      const lsCandidates = [
        window.localStorage?.getItem?.('userEmail'),
        window.localStorage?.getItem?.('email'),
        window.localStorage?.getItem?.('mail')
      ].filter(Boolean);
      if (lsCandidates.length > 0) {
        email = lsCandidates[0];
        source = 'localStorage';
      }
    }

    if (!email) return;
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        console.log('[PaymentHistory] Fetching payments for:', email, 'source:', source);
        const list = await PaymentService.getPaymentsByStudent(email);
        console.log('[PaymentHistory] Payments fetched:', list.length);
        if (mounted) setPayments(list);
      } catch (e) {
        console.error('[PaymentHistory] Error:', e);
        if (mounted) setError(t('payments.error'));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [user?.email]);

  // Filtrado por materia y rango de fechas en el cliente para sincronizar con los filtros de la vista
  const filtered = useMemo(() => {
    const q = (courseQuery || '').trim().toLowerCase();
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    const out = payments.filter(p => {
      const courseOk = q ? (p.course || '').toLowerCase().includes(q) : true;
      const d = p.date_payment instanceof Date ? p.date_payment : null;
      const startOk = start && d ? d >= start : true;
      const endOk = end && d ? d <= end : true;
      return courseOk && startOk && endOk;
    });
    return out;
  }, [payments, courseQuery, startDate, endDate]);

  useEffect(() => {
    if (typeof onCountChange === 'function') onCountChange(filtered.length);
  }, [filtered.length, onCountChange]);

  if (loading) {
    return (
      <div className="payment-history-loading">
        <div className="loading-spinner" />
        <p>{t('payments.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="payment-history-error">
        <p>{error}</p>
      </div>
    );
  }

  if (!filtered || filtered.length === 0) {
    if (!showEmpty) return null;
    const fallbackEmail = (typeof window !== 'undefined' ? (window.localStorage?.getItem?.('userEmail') || window.localStorage?.getItem?.('email') || window.localStorage?.getItem?.('mail')) : '');
    return (
      <div className="payment-history-empty">
        <p>{t('payments.emptyFor', { email: user?.email || fallbackEmail })}</p>
      </div>
    );
  }

  return (
    <div className="payment-history-grid" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', width: '100%' }}>
      {filtered.map(p => (
        <PaymentCard key={p.id} payment={p} />
      ))}
    </div>
  );
}
