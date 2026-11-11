"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Calendar,
  Users,
  DollarSign,
  Star,
  TrendingUp,
  Clock,
  Settings,
  ArrowRight,
  Target,
  Award,
  Zap,
  BarChart3,
  PlusCircle,
  CheckCircle2
} from "lucide-react";
import WelcomeBanner from "../Welcome/Welcome";
import NewsFeed from "../NewsFeed/NewsFeed";
import BoxNewCourse from "../BoxNewCourse/BoxNewCourse";
import GoogleCalendarButton from "../GoogleCalendarButton/GoogleCalendarButton";
import TutorSessionsPanel from "../TutorSessionsPanel/TutorSessionsPanel";
import { TutoringSessionService } from "../../services/core/TutoringSessionService";
import { authFetch } from "../../services/authFetch";
import { useAuth } from "../../context/SecureAuthContext";
import { useI18n } from "../../../lib/i18n";
import routes from "../../../routes";

export default function TutorHome({ userName }) {
  const { t, formatCurrency } = useI18n();
  const { user } = useAuth();
  const [tutorCourses, setTutorCourses] = useState([]);
  // Figures from GET /api/tutor/stats (tutor-dashboard.service): a session
  // counts as held once it is over, and money is the tutor's share of what the
  // students paid.
  const [tutorStats, setTutorStats] = useState({
    scheduled: 0,
    held: 0,
    totalEarnings: 0,
    weeklySessions: 0,
    weeklyEarnings: 0,
    studentRetention: null,
    averageRating: 0,
  });
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Cursos del tutor, con cuántos tutores ven los estudiantes en cada uno
  useEffect(() => {
    authFetch('/api/tutor/courses?withTutorCount=1')
      .then(({ ok, data }) => {
        if (ok && data?.success) setTutorCourses(data.courses || []);
      })
      .catch(err => console.error('Error loading tutor courses:', err));
  }, []);

  // Stats del tutor usando el nuevo TutoringSessionService (JWT-based, /api/sessions)
  useEffect(() => {
    if (!user?.isLoggedIn) return;
    setLoading(true);

    Promise.all([
      TutoringSessionService.getTutorDashboardStats(),
      authFetch('/api/tutor/profile')
    ])
      .then(([stats, { ok, data }]) => {
        // Obtener rating desde tutor_profiles.review
        const averageRating = (ok && data?.profile?.review) ? parseFloat(data.profile.review) : 0;
        setTutorStats((current) => ({ ...current, ...(stats || {}), averageRating }));
      })
      .catch(err => console.error('Error loading tutor stats:', err))
      .finally(() => setLoading(false));
  }, [user?.isLoggedIn, user?.uid]);

  return (
    <main className="min-h-screen">
      <WelcomeBanner usuario={userName} isTutor />

      <div className="page-container !pt-6 sm:!pt-8 !pb-12 sm:!pb-16">

        {/* Setup guide — shown until the tutor has at least one course */}
        {!loading && tutorCourses.length === 0 && (
          <div className="bg-white/95 backdrop-blur-sm rounded-3xl p-5 sm:p-7 shadow-md border border-amber-200/80 border-l-4 border-l-amber-400 mb-6 sm:mb-8">
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2.5 bg-amber-50 rounded-xl flex-shrink-0">
                <Target className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#15251f]">{t("tutorHome.setupCard.title")}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{t("tutorHome.setupCard.subtitle")}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              {/* Step 1 */}
              <div className="flex flex-col gap-2 p-4 bg-amber-50/60 rounded-2xl border border-amber-100">
                <div className="flex items-center gap-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-400 text-white text-xs font-bold flex items-center justify-center">1</span>
                  <span className="font-semibold text-sm text-[#15251f]">{t("tutorHome.setupCard.step1Label")}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{t("tutorHome.setupCard.step1Desc")}</p>
                <Link
                  href={routes.TUTOR_COURSES}
                  className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800 transition-colors"
                >
                  {t("tutorHome.setupCard.step1Action")}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col gap-2 p-4 bg-blue-50/60 rounded-2xl border border-blue-100">
                <div className="flex items-center gap-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-400 text-white text-xs font-bold flex items-center justify-center">2</span>
                  <span className="font-semibold text-sm text-[#15251f]">{t("tutorHome.setupCard.step2Label")}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{t("tutorHome.setupCard.step2Desc")}</p>
                <Link
                  href={routes.TUTOR_DISPONIBILIDAD}
                  className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 transition-colors"
                >
                  {t("tutorHome.setupCard.step2Action")}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col gap-2 p-4 bg-green-50/60 rounded-2xl border border-green-100">
                <div className="flex items-center gap-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500 text-white text-xs font-bold flex items-center justify-center">3</span>
                  <span className="font-semibold text-sm text-[#15251f]">{t("tutorHome.setupCard.step3Label")}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{t("tutorHome.setupCard.step3Desc")}</p>
                <Link
                  href={routes.TUTOR_DISPONIBILIDAD}
                  className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-800 transition-colors"
                >
                  {t("tutorHome.setupCard.step3Action")}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Performance Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 sm:mb-8">
          {[
            { label: t('tutorHome.stats.sessions'), sub: t('tutorHome.stats.scheduled'), value: loading ? null : tutorStats.scheduled, icon: Calendar },
            { label: t('tutorHome.stats.sessions'), sub: t('tutorHome.stats.held'), value: loading ? null : tutorStats.held, icon: Users },
            { label: t('tutorHome.stats.earnings'), sub: t('tutorHome.stats.total'), value: loading ? null : formatCurrency(tutorStats.totalEarnings, 'COP'), icon: DollarSign },
            { label: t('tutorHome.stats.rating'), sub: t('tutorHome.stats.average'), value: loading ? null : (tutorStats.averageRating > 0 ? tutorStats.averageRating.toFixed(1) : t('tutorHome.stats.noRating')), icon: Star },
          ].map(({ label, sub, value, icon: Icon }) => (
            <div key={`${label}-${sub}`} className="bg-white/95 backdrop-blur-sm rounded-2xl p-5 shadow-md shadow-sky-900/5 hover:shadow-lg hover:shadow-sky-900/10 transition-all duration-300 border border-sky-100/80 border-t-[3px] border-t-blue-600 ring-1 ring-white/60">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                  {value === null ? (
                    <div className="w-12 h-8 bg-gray-100 rounded animate-pulse my-1"></div>
                  ) : (
                    <p className="text-3xl font-bold text-blue-600 break-words">{value}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                </div>
                <div className="p-2.5 bg-blue-600/10 rounded-xl flex-shrink-0">
                  <Icon className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Today / upcoming / history, each row opens the session detail */}
        <div className="mb-6 sm:mb-8">
          <TutorSessionsPanel />
        </div>

        {/* News / announcements — after the tutor's own agenda so it informs
            without displacing it. Hidden automatically when there are none. */}
        <div className="mb-6 sm:mb-8">
          <NewsFeed />
        </div>

        {/* Courses Management */}
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl p-5 sm:p-7 shadow-lg shadow-sky-900/5 border border-sky-100/90 mb-6 sm:mb-8 ring-1 ring-white/50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="p-2.5 bg-blue-600/10 rounded-xl flex-shrink-0">
                <BookOpen className="w-5 h-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold text-[#003d66] break-words">
                  {t('tutorHome.coursesTitle')}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5 break-words">{t('tutorHome.coursesDescription')}</p>
              </div>
            </div>
            <Link
              href={routes.TUTOR_COURSES}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-semibold transition-colors duration-200 text-sm whitespace-nowrap flex-shrink-0"
            >
              <PlusCircle className="w-4 h-4" />
              {t('tutorHome.addCourse')}
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {tutorCourses.length === 0 ? (
              <p className="text-sm text-gray-400 col-span-full py-4">
                {t('tutorHome.noCourses')}{" "}
                <Link href={routes.TUTOR_COURSES} className="text-blue-600 underline">
                  {t('tutorHome.addFirstCourse')}
                </Link>
              </p>
            ) : (
              tutorCourses.slice(0, 6).map(({ course, status }) => (
                <Link
                  key={course.id}
                  href={routes.TUTOR_COURSE_DETAIL(course.id)}
                  className="block"
                >
                  <BoxNewCourse
                    name={course.name}
                    number={course.availableTutorCount}
                    tone="tutor"
                    note={status === 'Paused' ? t('tutorCourses.status.paused') : null}
                  />
                </Link>
              ))
            )}
          </div>

          {tutorCourses.length > 6 && (
            <div className="text-center mt-6">
              <Link
                href={routes.TUTOR_COURSES}
                className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold transition-colors duration-200 text-sm"
              >
                {t('tutorHome.viewAll')}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>

        {/* Performance Insights */}
        <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-2">
          {/* Weekly Performance */}
          <div className="bg-white/95 backdrop-blur-sm rounded-3xl p-5 sm:p-7 shadow-md border border-sky-100/80 ring-1 ring-white/50">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 bg-blue-600/10 rounded-xl flex-shrink-0">
                <BarChart3 className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-lg font-bold text-[#003d66]">{t('tutorHome.performance.title')}</h3>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex justify-between items-center p-4 bg-gray-50 rounded-xl">
                    <div className="w-32 h-4 bg-gray-200 rounded animate-pulse"></div>
                    <div className="w-12 h-7 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between items-center p-4 bg-[#e8f4fc] rounded-xl">
                  <span className="font-medium text-gray-700 text-sm">{t('tutorHome.performance.weeklySessions')}</span>
                  <span className="text-xl font-bold text-blue-600">{tutorStats.weeklySessions}</span>
                </div>

                <div className="flex justify-between items-center p-4 bg-[#e8f4fc] rounded-xl">
                  <span className="font-medium text-gray-700 text-sm">{t('tutorHome.performance.weeklyEarnings')}</span>
                  <span className="text-xl font-bold text-blue-600">
                    {formatCurrency(tutorStats.weeklyEarnings, 'COP')}
                  </span>
                </div>

                <div className="flex justify-between items-center p-4 bg-[#e8f4fc] rounded-xl">
                  <span className="font-medium text-gray-700 text-sm">{t('tutorHome.performance.studentRetention')}</span>
                  <span className="text-xl font-bold text-blue-600">
                    {tutorStats.studentRetention == null ? '—' : `${tutorStats.studentRetention}%`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Achievement Banner */}
          <div className="rounded-3xl bg-gradient-to-br from-[#002a47] via-[#003d66] to-blue-600 p-5 sm:p-7 text-white shadow-xl shadow-sky-900/25 ring-1 ring-white/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-white/15 rounded-xl flex-shrink-0">
                <Award className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold">{t('tutorHome.achievement.title')}</h3>
            </div>
            {loading ? (
              <div className="space-y-2">
                <div className="w-full h-3 bg-white/20 rounded animate-pulse"></div>
                <div className="w-3/4 h-3 bg-white/20 rounded animate-pulse"></div>
                <div className="w-1/2 h-3 bg-white/20 rounded animate-pulse mt-4"></div>
              </div>
            ) : (
              <>
                <p className="text-white/80 mb-5 text-sm leading-relaxed">
                  {tutorStats.held > 0
                    ? t(tutorStats.averageRating > 0 ? 'tutorHome.achievement.summary' : 'tutorHome.achievement.summaryNoRating', {
                        count: tutorStats.held,
                        rating: tutorStats.averageRating.toFixed(1),
                      })
                    : t('tutorHome.achievement.empty')}
                </p>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-white/15 rounded-lg">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-sm">
                    {tutorStats.held > 0
                      ? t('tutorHome.achievement.heldCount', { count: tutorStats.held })
                      : t('tutorHome.achievement.firstSession')}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <footer className="border-t border-sky-200/60 bg-gradient-to-r from-sky-50/90 via-blue-50/80 to-sky-50/90">
        <div className="page-container !py-5 text-center text-sm text-gray-500 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <Link
            href={routes.TERMS_AND_CONDITIONS}
            className="text-blue-600 hover:text-blue-700 underline underline-offset-2 font-medium"
          >
            {t('landing.footer.links.termsAndConditions')}
          </Link>
          <span className="text-gray-400" aria-hidden>·</span>
          <Link
            href={routes.PRIVACY_POLICY}
            className="text-blue-600 hover:text-blue-700 underline underline-offset-2 font-medium"
          >
            {t('landing.footer.links.privacyPolicy')}
          </Link>
        </div>
      </footer>
    </main>
  );
} 