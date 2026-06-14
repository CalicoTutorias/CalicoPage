'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, CheckCircle2, CreditCard, Loader2 } from 'lucide-react';
import { AdminService } from '../../../services/core/AdminService';
import { useI18n } from '../../../../lib/i18n';

const initialForm = {
  tutorId: '',
  courseId: '',
  studentName: '',
  studentPhone: '',
  studentEmail: '',
  date: '',
  startTime: '',
  durationMinutes: '60',
  amount: '',
  paymentStatus: 'pending',
  notes: '',
};

function toIsoFromLocal(date, time) {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function AdminManualSessionsPage() {
  const { t, formatCurrency } = useI18n();
  const [form, setForm] = useState(initialForm);
  const [tutors, setTutors] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    setError('');
    try {
      const [tutorsRes, coursesRes] = await Promise.all([
        AdminService.listApprovedTutors({ status: 'active', limit: 200 }),
        fetch('/api/courses').then((res) => res.json()),
      ]);
      if (!tutorsRes.success) throw new Error(tutorsRes.error || t('admin.manualSessions.errors.load'));
      if (!coursesRes.success) throw new Error(coursesRes.error || t('admin.manualSessions.errors.load'));
      setTutors(tutorsRes.tutors || []);
      setCourses(coursesRes.courses || []);
    } catch (err) {
      setError(err.message || t('admin.manualSessions.errors.load'));
    } finally {
      setLoadingOptions(false);
    }
  }, [t]);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === form.courseId),
    [courses, form.courseId],
  );

  const update = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setCreated(null);

    const start = toIsoFromLocal(form.date, form.startTime);
    const duration = Number(form.durationMinutes || 60);
    const startDate = start ? new Date(start) : null;
    const endDate = startDate ? new Date(startDate.getTime() + duration * 60_000) : null;

    if (!start || !endDate || Number.isNaN(endDate.getTime())) {
      setSubmitting(false);
      setError(t('admin.manualSessions.errors.invalidTime'));
      return;
    }

    try {
      const res = await AdminService.createManualSession({
        tutorId: form.tutorId,
        courseId: form.courseId,
        student: {
          name: form.studentName,
          phoneNumber: form.studentPhone,
          email: form.studentEmail,
        },
        startTimestamp: start,
        endTimestamp: endDate.toISOString(),
        locationType: 'Virtual',
        notes: form.notes,
        amount: form.amount,
        paymentStatus: form.paymentStatus,
      });
      if (!res.success) throw new Error(res.error || t('admin.manualSessions.errors.create'));
      setCreated(res);
      setForm(initialForm);
    } catch (err) {
      setError(err.message || t('admin.manualSessions.errors.create'));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmPayment = async () => {
    if (!created?.session?.id) return;
    setConfirming(true);
    setError('');
    try {
      const res = await AdminService.confirmManualSessionPayment(created.session.id);
      if (!res.success) throw new Error(res.error || t('admin.manualSessions.errors.confirmPayment'));
      setCreated((current) => ({
        ...current,
        payment: res.payment,
      }));
    } catch (err) {
      setError(err.message || t('admin.manualSessions.errors.confirmPayment'));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-orange-100 rounded-xl">
          <CalendarPlus className="w-5 h-5 text-orange-600" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-800">{t('admin.manualSessions.title')}</h2>
          <p className="text-xs text-gray-500 mt-0.5 max-w-3xl leading-relaxed">
            {t('admin.manualSessions.subtitle')}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-sm font-medium text-gray-700">
          {t('admin.manualSessions.fields.tutor')}
          <select required value={form.tutorId} onChange={update('tutorId')} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
            <option value="">{loadingOptions ? t('common.loading') : t('admin.manualSessions.placeholders.tutor')}</option>
            {tutors.map((tutor) => (
              <option key={tutor.id} value={tutor.id}>{tutor.name || tutor.email}</option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-gray-700">
          {t('admin.manualSessions.fields.course')}
          <select required value={form.courseId} onChange={update('courseId')} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
            <option value="">{loadingOptions ? t('common.loading') : t('admin.manualSessions.placeholders.course')}</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>{course.code ? `${course.code} - ${course.name}` : course.name}</option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-gray-700">
          {t('admin.manualSessions.fields.studentName')}
          <input required value={form.studentName} onChange={update('studentName')} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
        </label>

        <label className="text-sm font-medium text-gray-700">
          {t('admin.manualSessions.fields.studentPhone')}
          <input required value={form.studentPhone} onChange={update('studentPhone')} placeholder="+57 300 123 4567" className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
        </label>

        <label className="text-sm font-medium text-gray-700">
          {t('admin.manualSessions.fields.studentEmail')}
          <input type="email" value={form.studentEmail} onChange={update('studentEmail')} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
        </label>

        <label className="text-sm font-medium text-gray-700">
          {t('admin.manualSessions.fields.date')}
          <input required type="date" value={form.date} onChange={update('date')} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
        </label>

        <label className="text-sm font-medium text-gray-700">
          {t('admin.manualSessions.fields.startTime')}
          <input required type="time" value={form.startTime} onChange={update('startTime')} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
        </label>

        <label className="text-sm font-medium text-gray-700">
          {t('admin.manualSessions.fields.duration')}
          <select value={form.durationMinutes} onChange={update('durationMinutes')} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
            <option value="60">60</option>
            <option value="90">90</option>
            <option value="120">120</option>
          </select>
        </label>

        <label className="text-sm font-medium text-gray-700">
          {t('admin.manualSessions.fields.amount')}
          <input required type="number" min="0" step="1000" value={form.amount} onChange={update('amount')} placeholder={selectedCourse?.basePrice || ''} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
        </label>

        <label className="text-sm font-medium text-gray-700">
          {t('admin.manualSessions.fields.paymentStatus')}
          <select value={form.paymentStatus} onChange={update('paymentStatus')} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
            <option value="pending">{t('admin.manualSessions.payment.pending')}</option>
            <option value="paid">{t('admin.manualSessions.payment.paid')}</option>
          </select>
        </label>

        <label className="md:col-span-2 text-sm font-medium text-gray-700">
          {t('admin.manualSessions.fields.notes')}
          <textarea value={form.notes} onChange={update('notes')} rows={3} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
        </label>

        <div className="md:col-span-2 flex justify-end">
          <button type="submit" disabled={submitting || loadingOptions} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-orange-300">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('admin.manualSessions.create')}
          </button>
        </div>
      </form>

      {created && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-emerald-800">{t('admin.manualSessions.created.title')}</h3>
              <p className="text-sm text-emerald-700 mt-1">
                {t('admin.manualSessions.created.body', {
                  student: created.student?.name || '',
                  amount: formatCurrency(created.payment?.amount || 0, 'COP'),
                })}
              </p>
              {created.calendarWarning && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-3">
                  {t('admin.manualSessions.created.calendarWarning')}
                </p>
              )}
              {created.session?.googleMeetLink && (
                <a className="text-sm text-emerald-800 underline mt-2 inline-block" href={created.session.googleMeetLink} target="_blank" rel="noreferrer">
                  {t('admin.manualSessions.created.meetLink')}
                </a>
              )}
            </div>
            {created.payment?.status !== 'paid' && (
              <button type="button" onClick={confirmPayment} disabled={confirming} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-emerald-300">
                <CreditCard className="w-4 h-4" />
                {confirming ? t('admin.manualSessions.payment.confirming') : t('admin.manualSessions.payment.confirm')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
