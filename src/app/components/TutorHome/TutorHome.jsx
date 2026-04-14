"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  PlusCircle
} from "lucide-react";
import WelcomeBanner from "../Welcome/Welcome";
import BoxNewCourse from "../BoxNewCourse/BoxNewCourse";
import GoogleCalendarButton from "../GoogleCalendarButton/GoogleCalendarButton";
import TutoringSummary from "../TutoringSummary/TutoringSummary";
import { TutoringSessionService } from "../../services/core/TutoringSessionService";
import { authFetch } from "../../services/authFetch";
import { useAuth } from "../../context/SecureAuthContext";
import { useI18n } from "../../../lib/i18n";
import routes from "../../../routes";

export default function TutorHome({ userName }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [tutorCourses, setTutorCourses] = useState([]);
  const [weeklyPerformance, setWeeklyPerformance] = useState({
    weeklySessions: 0,
    weeklyEarnings: 0,
    studentRetention: 0
  });
  const [tutorStats, setTutorStats] = useState({
    total: 0,
    completed: 0,
    scheduled: 0,
    totalEarnings: 0,
    averageRating: 0
  });
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Números estables por curso — Math.random() en render causaba valores distintos en cada re-render
  const courseNumbers = useMemo(
    () => tutorCourses.slice(0, 6).map(() => Math.floor(Math.random() * 10) + 1),
    [tutorCourses]
  );

  // Cursos del tutor — solo los que este tutor enseña (/api/tutor/courses)
  useEffect(() => {
    authFetch('/api/tutor/courses')
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
      TutoringSessionService.getTutorSessions(),
      authFetch('/api/tutor/profile')
    ])
      .then(([sessions, { ok, data }]) => {
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const completed = sessions.filter(s => s.status === 'Completed');
        const scheduled = sessions.filter(s => s.status === 'Pending' || s.status === 'Accepted');
        const weeklySessions = sessions.filter(s => new Date(s.startTimestamp) >= startOfWeek);

        // Obtener rating desde tutor_profiles.review
        const averageRating = (ok && data?.profile?.review) ? parseFloat(data.profile.review) : 0;

        setTutorStats({
          total: sessions.length,
          completed: completed.length,
          scheduled: scheduled.length,
          totalEarnings: 0,  // Sin campo price en Session — se calculará cuando se integre pagos
          averageRating,
        });
        setWeeklyPerformance({
          weeklySessions: weeklySessions.length,
          weeklyEarnings: 0,
          studentRetention: 0,
        });
      })
      .catch(err => console.error('Error loading tutor stats:', err))
      .finally(() => setLoading(false));
  }, [user?.isLoggedIn, user?.uid]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#e8f4fc] via-[#eff6ff] to-[#f0f9ff]">
      <WelcomeBanner usuario={userName} isTutor />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 pb-12 sm:pb-16">
        {/* Performance Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 sm:mb-8">
          {[
            { label: t('tutorHome.stats.sessions'), sub: t('tutorHome.stats.scheduled'), value: loading ? null : tutorStats.scheduled, icon: Calendar },
            { label: t('tutorHome.stats.sessions'), sub: 'Completadas', value: loading ? null : tutorStats.completed, icon: Users },
            { label: t('tutorHome.stats.earnings'), sub: 'Total', value: loading ? null : `$${tutorStats.totalEarnings.toLocaleString('es-CO')}`, icon: DollarSign },
            { label: t('tutorHome.stats.rating'), sub: 'Promedio', value: loading ? null : (tutorStats.averageRating > 0 ? tutorStats.averageRating.toFixed(1) : 'N/A'), icon: Star },
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

        {/* Upcoming Sessions */}
        <div className="mb-6 sm:mb-8">
          <TutoringSummary
            userType="tutor"
            title={t('tutorHome.upcomingTutorials')}
            linkText={t('tutorHome.viewAllTutorials')}
            linkHref={routes.TUTOR_MIS_TUTORIAS}
          />
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
                Aún no has agregado materias.{" "}
                <Link href={routes.TUTOR_COURSES} className="text-blue-600 underline">
                  Agrega tu primera materia
                </Link>
              </p>
            ) : (
              tutorCourses.slice(0, 6).map(({ course }, i) => (
                <BoxNewCourse
                  key={course.id}
                  name={course.name}
                  number={courseNumbers[i]}
                  tone="tutor"
                />
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
                  <span className="text-xl font-bold text-blue-600">{weeklyPerformance.weeklySessions}</span>
                </div>

                <div className="flex justify-between items-center p-4 bg-[#e8f4fc] rounded-xl">
                  <span className="font-medium text-gray-700 text-sm">{t('tutorHome.performance.weeklyEarnings')}</span>
                  <span className="text-xl font-bold text-blue-600">
                    ${weeklyPerformance.weeklyEarnings.toLocaleString('es-CO')}
                  </span>
                </div>

                <div className="flex justify-between items-center p-4 bg-[#e8f4fc] rounded-xl">
                  <span className="font-medium text-gray-700 text-sm">{t('tutorHome.performance.studentRetention')}</span>
                  <span className="text-xl font-bold text-blue-600">{weeklyPerformance.studentRetention}%</span>
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
                  {tutorStats.completed > 0
                    ? `Has completado ${tutorStats.completed} sesiones y mantienes una calificación de ${tutorStats.averageRating > 0 ? tutorStats.averageRating.toFixed(1) : 'N/A'} estrellas.`
                    : 'Comienza a dar tutorías para ver tus logros aquí.'}
                </p>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-white/15 rounded-lg">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-sm">
                    {tutorStats.completed > 0
                      ? `${tutorStats.completed} sesiones completadas`
                      : 'Comienza tu primera sesión'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <footer className="border-t border-sky-200/60 bg-gradient-to-r from-sky-50/90 via-blue-50/80 to-sky-50/90">
        <div className="max-w-7xl mx-auto px-6 py-5 text-center text-sm text-gray-500 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
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