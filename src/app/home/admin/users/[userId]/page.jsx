'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Mail, Phone, GraduationCap, KeyRound, Star, ShieldCheck,
  AlertOctagon, BookOpen, CheckCircle2, CalendarDays,
  Users as UsersIcon, DollarSign, Wallet, BadgeCheck, Hourglass,
} from 'lucide-react';
import { AdminService } from '../../../../services/core/AdminService';
import routes from '../../../../../routes';
import { useI18n } from '../../../../../lib/i18n';
import UserActivityChart from '../../_components/UserActivityChart';

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

const STATUS_TONE = {
  Completed: 'bg-emerald-100 text-emerald-700',
  Canceled:  'bg-rose-100 text-rose-700',
  Pending:   'bg-amber-100 text-amber-700',
  Accepted:  'bg-blue-100 text-blue-700',
  Rejected:  'bg-gray-200 text-gray-600',
};

function initials(name) {
  return (name || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function StatItem({ icon: Icon, label, value, tone = 'text-gray-400' }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className={`w-4 h-4 ${tone} flex-shrink-0`} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 leading-tight truncate">{value}</p>
        <p className="text-[11px] text-gray-500 truncate">{label}</p>
      </div>
    </div>
  );
}

function SessionItem({ s, counterpart, formatDate, t }) {
  return (
    <li className="flex items-start justify-between gap-3 px-3 py-2 rounded-xl bg-gray-50">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{s.course?.name || '—'}</p>
        <p className="text-[11px] text-gray-500 truncate">
          {formatDate(s.startTimestamp)}{counterpart ? ` · ${counterpart}` : ''}
        </p>
      </div>
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_TONE[s.status] || 'bg-gray-100 text-gray-600'}`}>
        {t(`admin.users.status.${s.status}`)}
      </span>
    </li>
  );
}

/**
 * One reviews-received list (works for both directions):
 *  - as tutor:   public student→tutor reviews (reviewer = r.student)
 *  - as student: private tutor→student reviews (reviewer = r.tutor)
 */
function ReviewListSection({ title, subtitle, reviews, reviewerOf, starTone, formatDate }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-1">
        {title} <span className="text-gray-400 font-normal">({reviews.length})</span>
      </h3>
      {subtitle && <p className="text-xs text-gray-400 mb-3">{subtitle}</p>}
      <ul className="flex flex-col gap-2">
        {reviews.map((r) => {
          const reviewer = reviewerOf(r);
          return (
            <li key={r.id} className="border border-gray-100 rounded-xl p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-800 truncate">{reviewer?.name || '—'}</span>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900">
                  <Star className={`w-3.5 h-3.5 ${starTone}`} /> {r.rating ?? '—'}
                </span>
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {r.session?.course?.name || r.course?.name || ''}
                {r.session?.startTimestamp ? ` · ${formatDate(r.session.startTimestamp)}` : ''}
              </div>
              {r.comment && <p className="text-sm text-gray-600 mt-1.5 whitespace-pre-line break-words">{r.comment}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function AdminUserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params?.userId;
  const { t, formatCurrency } = useI18n();
  const formatDate = useFormatDateTime();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await AdminService.getUserProfile(userId);
      if (!res.success) throw new Error(res.error || t('admin.users.detail.loadError'));
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

  useEffect(() => { if (userId) load(); }, [userId, load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
        {error}
        <div className="mt-3">
          <Link href={routes.ADMIN_USERS} className="text-rose-700 underline">
            {t('admin.users.detail.backToList')}
          </Link>
        </div>
      </div>
    );
  }

  const u = data.user;
  const tp = u.tutorProfile;
  const { asTutor, asStudent } = data.stats;
  const isTutor = u.isTutorApproved || asTutor.total > 0;
  const approvedCourses = (data.tutorCourses || []).filter((tc) => tc.status === 'Approved');

  return (
    <div className="flex flex-col gap-5">
      {/* Back */}
      <div>
        <button
          type="button"
          onClick={() => router.push(routes.ADMIN_USERS)}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800"
        >
          <ArrowLeft className="w-4 h-4" /> {t('admin.users.detail.back')}
        </button>
      </div>

      {/* ── Info card ─────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-16 h-16 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-xl flex-shrink-0 overflow-hidden">
            {u.profilePictureUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={u.profilePictureUrl} alt="" className="w-full h-full object-cover" />
              : initials(u.name)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-lg font-bold text-gray-900 truncate">{u.name || '—'}</h2>
              {u.role === 'ADMIN' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                  <ShieldCheck className="w-3 h-3" /> {t('admin.users.badge.admin')}
                </span>
              )}
              {u.isTutorApproved ? (
                <span className="text-[11px] font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{t('admin.users.badge.tutor')}</span>
              ) : (
                <span className="text-[11px] font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{t('admin.users.badge.student')}</span>
              )}
              {!u.isActive && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
                  <AlertOctagon className="w-3 h-3" /> {t('admin.users.badge.suspended')}
                </span>
              )}
              {u.isEmailVerified && (
                <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                  <BadgeCheck className="w-3 h-3 text-emerald-500" /> {t('admin.users.detail.emailVerified')}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-2 text-sm text-gray-600">
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> <span className="truncate">{u.email}</span>
              </span>
              {u.phoneNumber && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-gray-400" /> {u.phoneNumber}
                </span>
              )}
              {u.career?.name && (
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <GraduationCap className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> <span className="truncate">{u.career.name}</span>
                </span>
              )}
              {tp?.schoolEmail && (
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> <span className="truncate">{tp.schoolEmail}</span>
                </span>
              )}
              {tp?.llave && (
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <KeyRound className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> {t('admin.users.detail.llave')}: <span className="font-mono truncate">{tp.llave}</span>
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-gray-400" /> {t('admin.users.detail.memberSince', { date: formatDate(u.createdAt) })}
              </span>
            </div>

            {tp?.bio && <p className="text-sm text-gray-600 mt-3 whitespace-pre-line">{tp.bio}</p>}
          </div>

          {/* Ratings on BOTH sides of the marketplace, side by side */}
          {((isTutor && tp?.review != null && Number(tp.review) > 0) || u.studentRatingCount > 0) && (
            <div className="flex sm:flex-col items-start sm:items-end gap-3 sm:gap-2 flex-shrink-0 flex-wrap">
              {isTutor && tp?.review != null && Number(tp.review) > 0 && (
                <div className="flex flex-col items-start sm:items-end gap-0.5">
                  <span className="inline-flex items-center gap-1 text-lg font-bold text-gray-900">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> {Number(tp.review).toFixed(2)}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {t('admin.users.detail.ratingAsTutor')} · {t(asTutor.reviewsReceived === 1 ? 'admin.users.detail.reviews_one' : 'admin.users.detail.reviews_other', { count: asTutor.reviewsReceived })}
                  </span>
                </div>
              )}
              {u.studentRatingCount > 0 && (
                <div className="flex flex-col items-start sm:items-end gap-0.5">
                  <span className="inline-flex items-center gap-1 text-lg font-bold text-gray-900">
                    <Star className="w-4 h-4 text-sky-500 fill-sky-500" /> {Number(u.studentRating).toFixed(2)}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {t('admin.users.detail.ratingAsStudent')} · {t(u.studentRatingCount === 1 ? 'admin.users.detail.reviews_one' : 'admin.users.detail.reviews_other', { count: u.studentRatingCount })}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {!u.isActive && u.suspendedReason && (
          <div className="mt-4 bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-800">
            <p className="font-semibold mb-0.5">{t('admin.users.detail.suspendedReason')}</p>
            <p>{u.suspendedReason}</p>
            {u.suspendedAt && <p className="text-xs text-rose-600 mt-1">{t('admin.users.detail.since', { date: formatDate(u.suspendedAt) })}</p>}
          </div>
        )}
      </section>

      {/* ── Activity chart ────────────────────────────────────────── */}
      <UserActivityChart series={data.activitySeries} loading={false} />

      {/* ── Stats: student + tutor ────────────────────────────────── */}
      <div className={`grid grid-cols-1 ${isTutor ? 'lg:grid-cols-2' : ''} gap-3`}>
        {/* As student */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">{t('admin.users.detail.asStudent.title')}</h3>
          <div className="grid grid-cols-2 gap-y-4 gap-x-3">
            <StatItem icon={CheckCircle2} tone="text-emerald-500" label={t('admin.users.detail.stat.completed')} value={asStudent.completed} />
            <StatItem icon={CalendarDays} tone="text-blue-500" label={t('admin.users.detail.stat.upcoming')} value={asStudent.upcoming} />
            <StatItem icon={AlertOctagon} tone="text-rose-400" label={t('admin.users.detail.stat.canceled')} value={asStudent.canceled} />
            <StatItem icon={UsersIcon} label={t('admin.users.detail.stat.distinctTutors')} value={asStudent.distinctTutors} />
            <StatItem icon={BookOpen} label={t('admin.users.detail.stat.distinctCourses')} value={asStudent.distinctCourses} />
            <StatItem icon={DollarSign} tone="text-orange-500" label={t('admin.users.detail.stat.spent')} value={formatCurrency(asStudent.spent, 'COP')} />
            <StatItem
              icon={Star}
              tone="text-amber-500"
              label={t('admin.users.detail.stat.studentRating')}
              value={asStudent.ratingCount > 0 ? `${Number(asStudent.rating).toFixed(2)} (${asStudent.ratingCount})` : '—'}
            />
          </div>
        </section>

        {/* As tutor */}
        {isTutor && (
          <section className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">{t('admin.users.detail.asTutor.title')}</h3>
            <div className="grid grid-cols-2 gap-y-4 gap-x-3">
              <StatItem icon={CheckCircle2} tone="text-emerald-500" label={t('admin.users.detail.stat.taught')} value={asTutor.completed} />
              <StatItem icon={CalendarDays} tone="text-blue-500" label={t('admin.users.detail.stat.upcoming')} value={asTutor.upcoming} />
              <StatItem icon={AlertOctagon} tone="text-rose-400" label={t('admin.users.detail.stat.canceled')} value={asTutor.canceled} />
              <StatItem icon={UsersIcon} label={t('admin.users.detail.stat.distinctStudents')} value={asTutor.distinctStudents} />
              <StatItem icon={BookOpen} label={t('admin.users.detail.stat.distinctCourses')} value={asTutor.distinctCourses} />
              <StatItem icon={DollarSign} tone="text-emerald-600" label={t('admin.users.detail.stat.earned')} value={formatCurrency(asTutor.earned, 'COP')} />
              <StatItem icon={Hourglass} tone="text-amber-500" label={t('admin.users.detail.stat.earnedPending')} value={formatCurrency(asTutor.earnedPending, 'COP')} />
              <StatItem icon={Wallet} label={t('admin.users.detail.stat.nextPayment')} value={formatCurrency(Number(tp?.nextPayment || 0), 'COP')} />
            </div>
          </section>
        )}
      </div>

      {/* ── "Tutor de" courses ────────────────────────────────────── */}
      {isTutor && (data.tutorCourses?.length > 0) && (
        <section className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">
            {t('admin.users.detail.tutorOf.title')} <span className="text-gray-400 font-normal">({approvedCourses.length})</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {data.tutorCourses.map((tc) => (
              <span
                key={tc.courseId}
                className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full ${
                  tc.status === 'Approved' ? 'bg-emerald-50 text-emerald-700'
                    : tc.status === 'Rejected' ? 'bg-rose-50 text-rose-600'
                    : 'bg-amber-50 text-amber-700'
                }`}
                title={tc.status}
              >
                <BookOpen className="w-3 h-3" /> {tc.course?.name || tc.courseId}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── Reviews received on BOTH sides (behaviour as tutor AND as student) ── */}
      {((data.tutorReviewsReceived?.length || 0) > 0 || (data.studentReviewsReceived?.length || 0) > 0) && (
        <div className={`grid grid-cols-1 ${
          (data.tutorReviewsReceived?.length || 0) > 0 && (data.studentReviewsReceived?.length || 0) > 0
            ? 'lg:grid-cols-2'
            : ''
        } gap-3`}>
          {(data.tutorReviewsReceived?.length || 0) > 0 && (
            <ReviewListSection
              title={t('admin.users.detail.tutorReviews.title')}
              subtitle={t('admin.users.detail.tutorReviews.publicNote')}
              reviews={data.tutorReviewsReceived}
              reviewerOf={(r) => r.student}
              starTone="text-amber-500 fill-amber-500"
              formatDate={formatDate}
            />
          )}
          {(data.studentReviewsReceived?.length || 0) > 0 && (
            <ReviewListSection
              title={t('admin.users.detail.studentReviews.title')}
              subtitle={t('admin.users.detail.studentReviews.privacy')}
              reviews={data.studentReviewsReceived}
              reviewerOf={(r) => r.tutor}
              starTone="text-sky-500 fill-sky-500"
              formatDate={formatDate}
            />
          )}
        </div>
      )}

      {/* ── Recent sessions ───────────────────────────────────────── */}
      <div className={`grid grid-cols-1 ${isTutor ? 'lg:grid-cols-2' : ''} gap-3`}>
        <section className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">{t('admin.users.detail.recentAsStudent')}</h3>
          {(data.sessionsAsStudent?.length || 0) === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">{t('admin.users.detail.noSessions')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.sessionsAsStudent.map((s) => (
                <SessionItem key={s.id} s={s} counterpart={s.tutor?.name} formatDate={formatDate} t={t} />
              ))}
            </ul>
          )}
        </section>

        {isTutor && (
          <section className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">{t('admin.users.detail.recentAsTutor')}</h3>
            {(data.sessionsAsTutor?.length || 0) === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">{t('admin.users.detail.noSessions')}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {data.sessionsAsTutor.map((s) => {
                  const names = (s.participants || []).map((p) => p.student?.name).filter(Boolean);
                  const counterpart = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
                  return <SessionItem key={s.id} s={s} counterpart={counterpart} formatDate={formatDate} t={t} />;
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
