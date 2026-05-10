'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Wallet, Users, AlertTriangle, CheckCircle2, Copy, KeyRound,
  X, ArrowRight,
} from 'lucide-react';
import { AdminService } from '../../../services/core/AdminService';
import { useI18n } from '../../../../lib/i18n';

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

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await AdminService.listPayouts({ view: 'byTutor' });
      if (!res.success) throw new Error(res.error || t('admin.payouts.loadError'));
      setData({ groups: res.groups || [], totals: res.totals || {} });
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
            {t('admin.payouts.subtitle')}
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
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!loading && !error && groups.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl px-6 py-16 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-sm text-gray-500">{t('admin.payouts.empty')}</p>
        </div>
      )}

      {/* Groups by tutor */}
      {!loading && !error && groups.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  <th className="text-left px-4 py-2">{t('admin.payouts.table.tutor')}</th>
                  <th className="text-left px-4 py-2">{t('admin.payouts.table.llave')}</th>
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
                    <td className="px-4 py-3 align-top text-right text-sm text-gray-700 whitespace-nowrap">
                      {g.paymentsCount}
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
