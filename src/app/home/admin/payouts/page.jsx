'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Wallet, Users, AlertTriangle, CheckCircle2, Copy, KeyRound,
  X, ArrowRight, FileWarning,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminService } from '../../../services/core/AdminService';
import { useI18n } from '../../../../lib/i18n';
import { CALICO_COMMISSION_PCT } from '../../../../lib/payments/fees';
import { CHIP, TONE } from '../eventos/_components/ui';
import PayoutPaymentsTable from './_components/PayoutPaymentsTable';
import routes from '../../../../routes';

const TABS = ['byTutor', 'flat'];
const TYPE_TONE = { wompi: TONE.info, manual: TONE.warning, courtesy: TONE.neutral };

// ─── Tutoring dates of one tutor ────────────────────────────────────────

const VISIBLE_SESSIONS = 5;

/** What a tutor's transfer pays for, oldest first; long lists fold to keep rows short. */
function TutorSessionDates({ sessions = [] }) {
  const { t, formatDate } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const hidden = sessions.length - VISIBLE_SESSIONS;
  const visible = expanded ? sessions : sessions.slice(0, VISIBLE_SESSIONS);

  return (
    <div className="flex flex-col items-start gap-1">
      <ul className="flex flex-col gap-1">
        {visible.map((session) => (
          <li key={session.paymentId} className="text-xs text-gray-700 whitespace-nowrap">
            {formatDate(session.startTimestamp)}
            {session.course?.code && <span className="font-mono text-gray-500"> · {session.course.code}</span>}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <Button
          type="button"
          size="sm"
          variant="link"
          className="h-auto p-0 text-xs"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? t('admin.payouts.sessions.less') : t('admin.payouts.sessions.more', { count: hidden })}
        </Button>
      )}
    </div>
  );
}

// ─── Manual sessions without a proof ────────────────────────────────────

/**
 * Manual sessions that ended while the student's payment is still pending: they
 * are not owed to the tutor yet, but the admin has to upload the proof for them
 * to be. Kept out of the totals on purpose.
 */
function AwaitingProofCard({ items }) {
  const { t, formatDate, formatCurrency } = useI18n();
  if (!items?.length) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
      <div className="flex items-start gap-3 mb-3">
        <FileWarning className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-800">
            {t(items.length === 1 ? 'admin.payouts.awaitingProof.title_one' : 'admin.payouts.awaitingProof.title_other', { count: items.length })}
          </p>
          <p className="text-xs text-amber-700 mt-0.5 max-w-3xl leading-relaxed">
            {t('admin.payouts.awaitingProof.hint')}
          </p>
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-amber-100">
        {items.map((item) => (
          <li key={item.paymentId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{item.tutor.name || item.tutor.email}</p>
              <p className="text-xs text-gray-600">
                {formatDate(item.startTimestamp)}
                {item.course?.code && <span className="font-mono text-gray-500"> · {item.course.code}</span>}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-800">{formatCurrency(item.gross, 'COP')}</p>
              <p className="text-[11px] text-gray-500">
                {t('admin.payouts.awaitingProof.tutorShare', { amount: formatCurrency(item.tutorOwed, 'COP') })}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <Button asChild size="sm" variant="outline" className="mt-3">
        <Link href={routes.ADMIN_MANUAL_SESSIONS}>
          {t('admin.payouts.awaitingProof.upload')}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </Button>
    </div>
  );
}

// ─── Confirm modal ──────────────────────────────────────────────────────

function ConfirmMarkPaidModal({ open, group, busy, onConfirm, onClose }) {
  const { t, formatCurrency } = useI18n();
  const [note, setNote] = useState('');

  useEffect(() => { if (!open) setNote(''); }, [open]);

  if (!open || !group) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">
            {t('admin.payouts.modalTitle', { tutor: group.tutor.name || group.tutor.email })}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          {t('admin.payouts.modalBody', {
            count: group.paymentsCount,
            amount: formatCurrency(group.tutorOwed, 'COP'),
          })}
        </p>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            {t('admin.payouts.markPaidNoteLabel')}
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('admin.payouts.markPaidNotePlaceholder')}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onConfirm(note.trim() || undefined)}
            disabled={busy}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-semibold transition"
          >
            {busy ? t('admin.tutorDetail.modals.common.processing') : t('admin.payouts.confirmMarkPaid')}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-semibold transition"
          >
            {t('admin.tutorDetail.modals.common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────

export default function AdminPayoutsPage() {
  const { t, formatCurrency } = useI18n();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [confirmGroup, setConfirmGroup] = useState(null);
  const [busy, setBusy]       = useState(false);
  const [flash, setFlash]     = useState('');
  const [copiedKey, setCopiedKey] = useState(null);
  const [tab, setTab] = useState('byTutor');
  const [refreshToken, setRefreshToken] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await AdminService.listPayouts({ view: 'byTutor' });
      if (!res.success) throw new Error(res.error || t('admin.payouts.loadError'));
      setData({ groups: res.groups || [], awaitingProof: res.awaitingProof || [], totals: res.totals || {} });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const handleConfirm = async (note) => {
    if (!confirmGroup) return;
    setBusy(true);
    try {
      const res = await AdminService.bulkMarkPayoutsPaid(confirmGroup.paymentIds, note);
      if (!res.success) throw new Error(res.error || t('admin.payouts.loadError'));
      const c = res.count || confirmGroup.paymentIds.length;
      setFlash(t(c === 1 ? 'admin.payouts.flashMarked_one' : 'admin.payouts.flashMarked_other', { count: c }));
      setConfirmGroup(null);
      setRefreshToken((n) => n + 1);
      await load();
    } catch (e) {
      setError(e.message);
      setConfirmGroup(null);
    } finally {
      setBusy(false);
    }
  };

  const copyLlave = async (llave) => {
    if (!llave) return;
    try {
      await navigator.clipboard.writeText(llave);
      setCopiedKey(llave);
      setTimeout(() => setCopiedKey((current) => (current === llave ? null : current)), 1500);
    } catch {
      // Clipboard may be blocked in some contexts; silent fail is OK.
    }
  };

  // One payment goes through the same confirmation as a tutor's whole batch.
  const confirmPayment = (item) => setConfirmGroup({
    tutor: item.tutor,
    paymentsCount: 1,
    tutorOwed: item.tutorOwed,
    paymentIds: [item.id],
  });

  const totals = data?.totals || {};
  const groups = data?.groups || [];

  return (
    <div className="flex flex-col gap-5">

      <div className="flex items-start gap-3">
        <div className="p-2 bg-emerald-100 rounded-xl">
          <Wallet className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-800">{t('admin.payouts.title')}</h2>
          <p className="text-xs text-gray-500 mt-0.5 max-w-3xl leading-relaxed">
            {t('admin.payouts.subtitle', { rate: CALICO_COMMISSION_PCT })}
          </p>
        </div>
      </div>

      {flash && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-3">
          {flash}
        </div>
      )}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Totals banner */}
      {!loading && !error && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              {t('admin.payouts.totals.title')}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500">
                {t('admin.payouts.totals.tutorOwed')}
              </p>
              <p className="text-2xl font-bold text-emerald-700">
                {formatCurrency(totals.tutorOwed || 0, 'COP')}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500">
                {t('admin.payouts.totals.calicoNet')}
              </p>
              <p className={`text-2xl font-bold ${
                (totals.calicoNet || 0) >= 0 ? 'text-orange-600' : 'text-rose-600'
              }`}>
                {formatCurrency(totals.calicoNet || 0, 'COP')}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500">
                {t('admin.payouts.totals.gross')}
              </p>
              <p className="text-lg font-semibold text-gray-700">
                {formatCurrency(totals.gross || 0, 'COP')}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500">
                {t('admin.payouts.totals.wompiFee')}
              </p>
              <p className="text-lg font-semibold text-gray-700">
                {formatCurrency(totals.wompiFee || 0, 'COP')}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500">
                {t('admin.payouts.totals.discount')}
              </p>
              <p className="text-lg font-semibold text-gray-700">
                {formatCurrency(totals.discount || 0, 'COP')}
              </p>
              {(totals.discount || 0) > 0 && (
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {t('admin.payouts.totals.discountSplit', {
                    calico: formatCurrency(totals.discountCalico || 0, 'COP'),
                    shared: formatCurrency(totals.discountShared || 0, 'COP'),
                  })}
                </p>
              )}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500">
                <Users className="inline w-3 h-3 mr-1" />
                {t(
                  (totals.tutorsCount || 0) === 1
                    ? 'admin.payouts.totals.tutorsCount_one'
                    : 'admin.payouts.totals.tutorsCount_other',
                  { count: totals.tutorsCount || 0 },
                )}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {t(
                  (totals.paymentsCount || 0) === 1
                    ? 'admin.payouts.totals.paymentsCount_one'
                    : 'admin.payouts.totals.paymentsCount_other',
                  { count: totals.paymentsCount || 0 },
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && <AwaitingProofCard items={data?.awaitingProof} />}

      <div role="group" aria-label={t('admin.payouts.title')} className="flex items-center gap-1 flex-wrap">
        {TABS.map((name) => (
          <Button
            key={name}
            type="button"
            size="sm"
            variant={tab === name ? 'default' : 'outline'}
            aria-pressed={tab === name}
            onClick={() => setTab(name)}
          >
            {t(`admin.payouts.tabs.${name}`)}
          </Button>
        ))}
      </div>

      {tab === 'flat' && <PayoutPaymentsTable refreshToken={refreshToken} onMarkPaid={confirmPayment} />}

      {/* Loading */}
      {tab === 'byTutor' && loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty */}
      {tab === 'byTutor' && !loading && !error && groups.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl px-6 py-16 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-sm text-gray-500">{t('admin.payouts.empty')}</p>
        </div>
      )}

      {/* Groups by tutor */}
      {tab === 'byTutor' && !loading && !error && groups.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  <th className="text-left px-4 py-2">{t('admin.payouts.table.tutor')}</th>
                  <th className="text-left px-4 py-2">{t('admin.payouts.table.llave')}</th>
                  <th className="text-left px-4 py-2 whitespace-nowrap">{t('admin.payouts.table.sessionDates')}</th>
                  <th className="text-right px-4 py-2 whitespace-nowrap">{t('admin.payouts.table.payments')}</th>
                  <th className="text-right px-4 py-2 whitespace-nowrap">{t('admin.payouts.table.amount')}</th>
                  <th className="text-right px-4 py-2 whitespace-nowrap">{t('admin.payouts.table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.tutor.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 align-top">
                      <p className="text-sm font-medium text-gray-800 truncate max-w-[220px]">
                        {g.tutor.name || '—'}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate max-w-[220px]">
                        {g.tutor.email}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {g.llave ? (
                        <button
                          type="button"
                          onClick={() => copyLlave(g.llave)}
                          className="inline-flex items-center gap-1.5 text-xs font-mono bg-gray-100 hover:bg-gray-200 text-gray-800 px-2 py-1 rounded-lg transition group"
                          title="Copiar"
                        >
                          <KeyRound className="w-3 h-3 text-gray-400" />
                          <span className="break-all max-w-[180px]">{g.llave}</span>
                          {copiedKey === g.llave ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                          ) : (
                            <Copy className="w-3 h-3 text-gray-400 group-hover:text-gray-600 flex-shrink-0" />
                          )}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-50 text-amber-700 px-2 py-1 rounded-full">
                          <AlertTriangle className="w-3 h-3" />
                          {t('admin.payouts.noLlave')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <TutorSessionDates sessions={g.sessions} />
                    </td>
                    <td className="px-4 py-3 align-top text-right text-sm text-gray-700 whitespace-nowrap">
                      {g.paymentsCount}
                      <div className="flex flex-wrap justify-end gap-1 mt-1">
                        {Object.entries(g.typeCounts ?? {}).filter(([, count]) => count > 0).map(([type, count]) => (
                          <span key={type} className={`${CHIP} ${TYPE_TONE[type]}`}>
                            {t(`admin.payouts.paymentType.${type}`)}: {count}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                      <p className="text-sm font-semibold text-emerald-700">
                        {formatCurrency(g.tutorOwed, 'COP')}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {t('admin.payouts.totals.gross')}: {formatCurrency(g.totalGross, 'COP')}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setConfirmGroup(g)}
                        className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition"
                      >
                        {t('admin.payouts.markPaidWithCount', { count: g.paymentsCount })}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmMarkPaidModal
        open={!!confirmGroup}
        group={confirmGroup}
        busy={busy}
        onConfirm={handleConfirm}
        onClose={() => setConfirmGroup(null)}
      />
    </div>
  );
}
