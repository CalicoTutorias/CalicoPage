'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Check, X, AlertOctagon, RotateCcw, Star, Clock,
  Mail, Phone, GraduationCap, KeyRound, Plus, Search,
} from 'lucide-react';
import { AdminService } from '../../../../services/core/AdminService';
import routes from '../../../../../routes';
import { useI18n } from '../../../../../lib/i18n';

function useFormatDateTime() {
  const { locale } = useI18n();
  return (value) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString(locale === 'en' ? 'en-US' : 'es-ES', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return '—';
    }
  };
}

// ─── Modal genérico para acciones que requieren confirmación ────────────

function ActionModal({ open, title, body, confirmLabel, confirmTone, onConfirm, onClose, requireReason, reasonLabel, busy }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setReason('');
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const tone =
    confirmTone === 'danger'
      ? 'bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300'
      : confirmTone === 'success'
        ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300'
        : 'bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300';

  const handleConfirm = async () => {
    if (requireReason && reason.trim().length < 5) {
      setError(t('admin.tutorDetail.modals.common.reasonMin'));
      return;
    }
    await onConfirm(reason.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-4">{body}</p>
        {requireReason && (
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              {reasonLabel}
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
              placeholder={t('admin.tutorDetail.modals.common.reasonPlaceholder')}
            />
            {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
          </div>
        )}
        <div className="flex gap-3 mt-4">
          <button
            type="button"
            disabled={busy}
            onClick={handleConfirm}
            className={`flex-1 ${tone} text-white py-2.5 rounded-xl text-sm font-semibold transition disabled:cursor-not-allowed`}
          >
            {busy ? t('admin.tutorDetail.modals.common.processing') : confirmLabel}
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

// ─── Modal para asignar nuevas materias a un tutor aprobado ─────────────

function AssignCoursesModal({ open, onClose, onConfirm, busy, alreadyAssignedIds }) {
  const { t } = useI18n();
  const [allCourses, setAllCourses] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState(new Set());

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setSearch('');
      setError('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch('/api/courses')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setAllCourses(Array.isArray(data?.courses) ? data.courses : []);
      })
      .catch(() => { if (!cancelled) setError(t('admin.tutorDetail.modals.assign.loadError')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, t]);

  if (!open) return null;

  const lowerSearch = search.trim().toLowerCase();
  const available = allCourses.filter((c) => {
    if (alreadyAssignedIds.has(c.id)) return false;
    if (!lowerSearch) return true;
    return (
      c.name?.toLowerCase().includes(lowerSearch) ||
      c.code?.toLowerCase().includes(lowerSearch)
    );
  });

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl flex flex-col max-h-[80vh]">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">{t('admin.tutorDetail.modals.assign.title')}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('admin.tutorDetail.modals.assign.subtitle')}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.tutorDetail.modals.assign.search')}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-2 px-2">
          {loading ? (
            <div className="py-8 text-center text-sm text-gray-400">
              {t('admin.tutorDetail.modals.assign.loading')}
            </div>
          ) : error ? (
            <div className="py-4 px-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">{error}</div>
          ) : available.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">
              {alreadyAssignedIds.size > 0
                ? t('admin.tutorDetail.modals.assign.emptyAvailable')
                : t('admin.tutorDetail.modals.assign.emptyAll')}
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {available.map((c) => {
                const checked = selected.has(c.id);
                return (
                  <li key={c.id}>
                    <label className={`flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition ${
                      checked ? 'border-emerald-300 bg-emerald-50' : 'border-gray-100 hover:bg-gray-50'
                    }`}>
                      <input
                        type="checkbox"
                        className="accent-emerald-600 w-4 h-4"
                        checked={checked}
                        onChange={() => toggle(c.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                        {c.code && <p className="text-[11px] text-gray-500">{c.code}</p>}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 mt-4">
          <span className="text-xs text-gray-500">
            {t(
              selected.size === 1
                ? 'admin.tutorDetail.modals.assign.selected_one'
                : 'admin.tutorDetail.modals.assign.selected_other',
              { count: selected.size },
            )}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-4 rounded-xl text-sm font-semibold transition"
            >
              {t('admin.tutorDetail.modals.common.cancel')}
            </button>
            <button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => onConfirm(Array.from(selected))}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white py-2 px-4 rounded-xl text-sm font-semibold transition"
            >
              {busy
                ? t('admin.tutorDetail.modals.assign.submitting')
                : selected.size > 0
                  ? t('admin.tutorDetail.modals.assign.submitWithCount', { count: selected.size })
                  : t('admin.tutorDetail.modals.assign.submit')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────

export default function AdminTutorDetailPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params?.userId;
  const { t } = useI18n();
  const formatDate = useFormatDateTime();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedCourseIds, setSelectedCourseIds] = useState(new Set());
  const [modal, setModal] = useState(null);     // 'approve' | 'reject' | 'suspend' | 'reinstate' | 'assign'
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');       // success banner
  const [coursesBusy, setCoursesBusy] = useState(null);  // courseId currently mutating

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await AdminService.getTutorDetail(userId);
      if (!res.success) throw new Error(res.error || t('admin.tutorDetail.errors.loadFailed'));
      setDetail(res);
      // Pre-seleccionar todas las materias de la solicitud (si hay) por default
      const subjectIds = res.latestApplication?.subjects ?? [];
      setSelectedCourseIds(new Set(subjectIds));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

  useEffect(() => { if (userId) load(); }, [userId, load]);

  const toggleCourse = (id) => {
    setSelectedCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Action handlers ────────────────────────────────────────────────

  const handleApprove = async () => {
    setBusy(true);
    try {
      const res = await AdminService.approveTutor(userId, Array.from(selectedCourseIds));
      if (!res.success) throw new Error(res.error || t('admin.tutorDetail.errors.approve'));
      setFlash(t('admin.tutorDetail.flash.approved', { count: res.approvedCourseIds?.length || 0 }));
      setModal(null);
      await load();
    } catch (e) {
      setError(e.message);
      setModal(null);
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (reason) => {
    setBusy(true);
    try {
      const res = await AdminService.rejectTutor(userId, reason);
      if (!res.success) throw new Error(res.error || t('admin.tutorDetail.errors.reject'));
      setFlash(t('admin.tutorDetail.flash.rejected'));
      setModal(null);
      await load();
    } catch (e) {
      setError(e.message);
      setModal(null);
    } finally {
      setBusy(false);
    }
  };

  const handleSuspend = async (reason) => {
    setBusy(true);
    try {
      const res = await AdminService.suspendTutor(userId, reason);
      if (!res.success) throw new Error(res.error || t('admin.tutorDetail.errors.suspend'));
      const cancelled = res.user?.cancelledSessionsCount ?? 0;
      setFlash(
        cancelled > 0
          ? t('admin.tutorDetail.flash.suspendedWithCancellations', { count: cancelled })
          : t('admin.tutorDetail.flash.suspended'),
      );
      setModal(null);
      await load();
    } catch (e) {
      setError(e.message);
      setModal(null);
    } finally {
      setBusy(false);
    }
  };

  const handleReinstate = async () => {
    setBusy(true);
    try {
      const res = await AdminService.reinstateTutor(userId);
      if (!res.success) throw new Error(res.error || t('admin.tutorDetail.errors.reinstate'));
      setFlash(t('admin.tutorDetail.flash.reinstated'));
      setModal(null);
      await load();
    } catch (e) {
      setError(e.message);
      setModal(null);
    } finally {
      setBusy(false);
    }
  };

  const handleAssignCourses = async (courseIds) => {
    setBusy(true);
    try {
      const res = await AdminService.assignCoursesToTutor(userId, courseIds, 'Approved');
      if (!res.success) throw new Error(res.error || t('admin.tutorDetail.errors.assign'));
      setFlash(t('admin.tutorDetail.flash.assigned', { count: res.assignedCourseIds?.length || 0 }));
      setModal(null);
      await load();
    } catch (e) {
      setError(e.message);
      setModal(null);
    } finally {
      setBusy(false);
    }
  };

  const handleSetCourseStatus = async (courseId, newStatus) => {
    setCoursesBusy(courseId);
    setError('');
    try {
      const res = await AdminService.setTutorCourseStatus(userId, courseId, newStatus);
      if (!res.success) throw new Error(res.error || t('admin.tutorDetail.errors.courseStatus'));
      setFlash(t('admin.tutorDetail.flash.courseStatus', { status: newStatus }));
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setCoursesBusy(null);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
        {error}
        <div className="mt-3">
          <Link href={routes.ADMIN_TUTORS} className="text-rose-700 underline">
            {t('admin.tutorDetail.errors.backToList')}
          </Link>
        </div>
      </div>
    );
  }

  const u = detail.user;
  const application = detail.latestApplication;
  const isPendingApplication = application?.status === 'Pending' && !u.isTutorApproved;

  return (
    <div className="flex flex-col gap-5">
      {/* Back link */}
      <div>
        <button
          type="button"
          onClick={() => router.push(routes.ADMIN_TUTORS)}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('admin.tutorDetail.back')}
        </button>
      </div>

      {flash && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-3">
          {flash}
        </div>
      )}
      {error && detail && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* ── User card ─────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-lg">
            {(u.name || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">{u.name || '—'}</h2>
            <div className="flex flex-col gap-0.5 mt-1 text-sm text-gray-600">
              <span className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-gray-400" /> {u.email}</span>
              {u.phoneNumber && (
                <span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-gray-400" /> {u.phoneNumber}</span>
              )}
              {u.career?.name && (
                <span className="inline-flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5 text-gray-400" /> {u.career.name}</span>
              )}
              {u.tutorProfile?.llave && (
                <span className="inline-flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-gray-400" /> Llave: <span className="font-mono">{u.tutorProfile.llave}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            {/* Status pills */}
            {!u.isTutorApproved && application?.status === 'Pending' && (
              <span className="text-[11px] font-medium bg-orange-100 text-orange-700 px-2 py-1 rounded-full inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> {t('admin.tutors.status.pending')}
              </span>
            )}
            {!u.isTutorApproved && application?.status === 'Rejected' && (
              <span className="text-[11px] font-medium bg-rose-100 text-rose-700 px-2 py-1 rounded-full">
                {t('admin.tutors.status.rejected')}
              </span>
            )}
            {u.isTutorApproved && u.isActive && (
              <span className="text-[11px] font-medium bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                {t('admin.tutors.status.tutorActive')}
              </span>
            )}
            {u.isTutorApproved && !u.isActive && (
              <span className="text-[11px] font-medium bg-rose-100 text-rose-700 px-2 py-1 rounded-full inline-flex items-center gap-1">
                <AlertOctagon className="w-3 h-3" /> {t('admin.tutors.status.suspended')}
              </span>
            )}
            {u.tutorProfile?.review && Number(u.tutorProfile.review) > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500 mt-1">
                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                {Number(u.tutorProfile.review).toFixed(2)} ({u.tutorProfile.numReview})
              </span>
            )}
          </div>
        </div>

        {!u.isActive && u.suspendedReason && (
          <div className="mt-4 bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-800">
            <p className="font-semibold mb-0.5">{t('admin.tutorDetail.suspendedReason')}</p>
            <p>{u.suspendedReason}</p>
            <p className="text-xs text-rose-600 mt-1">
              {t('admin.tutorDetail.since', { date: formatDate(u.suspendedAt) })}
            </p>
          </div>
        )}
      </section>

      {/* ── Application section (if pending) ───────────────────────── */}
      {isPendingApplication && (
        <section className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">
            {t('admin.tutorDetail.applicationSection.title')}
          </h3>

          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-1">{t('admin.tutorDetail.applicationSection.reasons')}</p>
            <p className="text-sm text-gray-700 whitespace-pre-line">
              {application.reasonsToTeach}
            </p>
          </div>

          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2">
              {t('admin.tutorDetail.applicationSection.subjectsLabel')}
            </p>
            <div className="flex flex-col gap-2">
              {(application.subjectsResolved || []).map((c) => {
                const checked = selectedCourseIds.has(c.id);
                return (
                  <label
                    key={c.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition ${
                      checked
                        ? 'border-emerald-300 bg-emerald-50'
                        : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-emerald-600 w-4 h-4"
                      checked={checked}
                      onChange={() => toggleCourse(c.id)}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">{c.name}</p>
                      {c.code && <p className="text-[11px] text-gray-500">{c.code}</p>}
                    </div>
                  </label>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              {t('admin.tutorDetail.applicationSection.subjectsHelp')}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={selectedCourseIds.size === 0}
              onClick={() => setModal('approve')}
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-semibold"
            >
              <Check className="w-4 h-4" /> {t('admin.tutorDetail.applicationSection.approveSelected')}
            </button>
            <button
              type="button"
              onClick={() => setModal('reject')}
              className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-sm font-semibold"
            >
              <X className="w-4 h-4" /> {t('admin.tutorDetail.applicationSection.reject')}
            </button>
          </div>
        </section>
      )}

      {/* ── Materias del tutor (per-course status + assign) ──────── */}
      {u.isTutorApproved && (
        <section className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-800">
              {t('admin.tutorDetail.coursesSection.title')}
            </h3>
            <button
              type="button"
              onClick={() => setModal('assign')}
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('admin.tutorDetail.coursesSection.assign')}
            </button>
          </div>

          {detail.tutorCourses.length === 0 ? (
            <p className="text-sm text-gray-500">
              {t('admin.tutorDetail.coursesSection.empty')}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {detail.tutorCourses.map((tc) => {
                const isBusy = coursesBusy === tc.courseId;
                return (
                  <li
                    key={`${tc.tutorId}-${tc.courseId}`}
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 gap-3 flex-wrap"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800">{tc.course.name}</p>
                      {tc.course.code && (
                        <p className="text-[11px] text-gray-500">{tc.course.code}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={`text-[11px] font-medium px-2 py-1 rounded-full ${
                          tc.status === 'Approved'
                            ? 'bg-emerald-100 text-emerald-700'
                            : tc.status === 'Rejected'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {tc.status}
                      </span>
                      {/* Inline action: cambiar entre Approved / Rejected sin recargar */}
                      {tc.status !== 'Approved' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleSetCourseStatus(tc.courseId, 'Approved')}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 px-2 py-1 rounded-lg transition"
                          title={t('admin.tutorDetail.coursesSection.approveTitle')}
                        >
                          <Check className="w-3 h-3" />
                          {t('admin.tutorDetail.coursesSection.approve')}
                        </button>
                      )}
                      {tc.status !== 'Rejected' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleSetCourseStatus(tc.courseId, 'Rejected')}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 px-2 py-1 rounded-lg transition"
                          title={t('admin.tutorDetail.coursesSection.rejectTitle')}
                        >
                          <X className="w-3 h-3" />
                          {t('admin.tutorDetail.coursesSection.reject')}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* ── Moderation actions for approved tutors ────────────────── */}
      {u.isTutorApproved && (
        <section className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">
            {t('admin.tutorDetail.moderationSection.title')}
          </h3>
          {u.isActive ? (
            <button
              type="button"
              onClick={() => setModal('suspend')}
              className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-sm font-semibold"
            >
              <AlertOctagon className="w-4 h-4" /> {t('admin.tutorDetail.moderationSection.suspend')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setModal('reinstate')}
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-semibold"
            >
              <RotateCcw className="w-4 h-4" /> {t('admin.tutorDetail.moderationSection.reinstate')}
            </button>
          )}
        </section>
      )}

      {/* ── Modals ────────────────────────────────────────────────── */}
      <ActionModal
        open={modal === 'approve'}
        title={t('admin.tutorDetail.modals.approve.title')}
        body={t('admin.tutorDetail.modals.approve.body', { count: selectedCourseIds.size })}
        confirmLabel={t('admin.tutorDetail.modals.approve.confirm')}
        confirmTone="success"
        onConfirm={handleApprove}
        onClose={() => setModal(null)}
        busy={busy}
      />
      <ActionModal
        open={modal === 'reject'}
        title={t('admin.tutorDetail.modals.reject.title')}
        body={t('admin.tutorDetail.modals.reject.body')}
        confirmLabel={t('admin.tutorDetail.modals.reject.confirm')}
        confirmTone="danger"
        requireReason
        reasonLabel={t('admin.tutorDetail.modals.reject.reasonLabel')}
        onConfirm={handleReject}
        onClose={() => setModal(null)}
        busy={busy}
      />
      <ActionModal
        open={modal === 'suspend'}
        title={t('admin.tutorDetail.modals.suspend.title')}
        body={t('admin.tutorDetail.modals.suspend.body')}
        confirmLabel={t('admin.tutorDetail.modals.suspend.confirm')}
        confirmTone="danger"
        requireReason
        reasonLabel={t('admin.tutorDetail.modals.suspend.reasonLabel')}
        onConfirm={handleSuspend}
        onClose={() => setModal(null)}
        busy={busy}
      />
      <ActionModal
        open={modal === 'reinstate'}
        title={t('admin.tutorDetail.modals.reinstate.title')}
        body={t('admin.tutorDetail.modals.reinstate.body')}
        confirmLabel={t('admin.tutorDetail.modals.reinstate.confirm')}
        confirmTone="success"
        onConfirm={handleReinstate}
        onClose={() => setModal(null)}
        busy={busy}
      />

      <AssignCoursesModal
        open={modal === 'assign'}
        onClose={() => setModal(null)}
        onConfirm={handleAssignCourses}
        busy={busy}
        alreadyAssignedIds={new Set(detail.tutorCourses.map((tc) => tc.courseId))}
      />
    </div>
  );
}
