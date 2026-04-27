"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Calendar,
  Search,
  Star,
  TrendingUp,
  Clock,
  Users,
  ArrowRight,
  GraduationCap,
  Award,
  History
} from "lucide-react";
import WelcomeBanner from "../Welcome/Welcome";
import BoxCourse from "../BoxCourse/BoxCourse";
import TutoringSummary from "../TutoringSummary/TutoringSummary";
import { TutoringSessionService } from "../../services/core/TutoringSessionService";
import { useI18n } from "../../../lib/i18n";
import routes from "../../../routes";

const SEARCH_TUTORS_URL = `${routes.SEARCH_TUTORS}?tab=tutores`;
const EXPLORE_COURSES_URL = `${routes.SEARCH_TUTORS}?tab=materias`;

function getAchievementMessage(totalCompleted) {
  if (totalCompleted === 0) {
    return {
      title: "Comienza tu viaje",
      description: "Reserva tu primera sesión de tutoría y da el primer paso hacia el éxito académico.",
    };
  }
  if (totalCompleted <= 3) {
    return {
      title: "Buen comienzo",
      description: `Has completado ${totalCompleted} ${totalCompleted === 1 ? 'sesión' : 'sesiones'}. Sigue así, cada sesión cuenta.`,
    };
  }
  if (totalCompleted <= 10) {
    return {
      title: "Vas por buen camino",
      description: `${totalCompleted} sesiones completadas. Estás construyendo un gran hábito de estudio.`,
    };
  }
  if (totalCompleted <= 24) {
    return {
      title: "Sigues mejorando",
      description: `Has completado ${totalCompleted} sesiones. Mantén el excelente trabajo.`,
    };
  }
  if (totalCompleted <= 50) {
    return {
      title: "Estudiante destacado",
      description: `${totalCompleted} sesiones completadas. Tu dedicación al aprendizaje es admirable.`,
    };
  }
  return {
    title: "Referente del aprendizaje",
    description: `${totalCompleted} sesiones completadas. Eres un ejemplo de constancia y compromiso.`,
  };
}

export default function StudentHome({ userName }) {
  const { t } = useI18n();
  const [myCourses, setMyCourses] = useState([]);
  const [coursesLoaded, setCoursesLoaded] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    TutoringSessionService.getMySessions('student').then(sessions => {
      const seen = new Map();
      (Array.isArray(sessions) ? sessions : []).forEach(s => {
        const c = s.course;
        if (c?.id && !seen.has(c.id)) seen.set(c.id, c);
      });
      setMyCourses([...seen.values()]);
      setCoursesLoaded(true);
    });

    TutoringSessionService.getMyStats().then(data => {
      if (data) setStats(data);
    });
  }, []);

  return (
    <main className="min-h-screen">
      <WelcomeBanner usuario={userName} />

      <div className="page-container !pt-8 !pb-16">
        {/* Quick Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {[
            { label: t('studentHome.stats.sessionsThisWeek'), value: stats?.sessionsThisWeek, icon: Calendar },
            { label: t('studentHome.stats.activeCourses'), value: stats?.activeCoursesCount, icon: BookOpen },
            { label: t('studentHome.stats.totalSessions'), value: stats?.totalCompleted, icon: TrendingUp },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white/95 backdrop-blur-sm rounded-2xl p-5 shadow-md shadow-amber-900/5 hover:shadow-lg transition-all duration-300 border border-amber-100/90 ring-1 ring-white/60" style={{ borderTop: '3px solid #ff9505' }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{label}</p>
                  <p className="text-3xl font-bold text-[#ff9505]">
                    {value !== undefined && value !== null ? value : '—'}
                  </p>
                </div>
                <div className="p-2.5 bg-[#ff9505]/10 rounded-xl">
                  <Icon className="w-5 h-5 text-[#ff9505]" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Scheduled Sessions */}
        <div className="mb-8">
          <TutoringSummary
            userType="student"
            title={t('studentHome.scheduledSessions')}
            linkText={t('studentHome.viewHistory')}
            linkHref={routes.HISTORY}
          />
        </div>

        {/* Main Action Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Find Help Card */}
          <div className="rounded-3xl p-7 text-white relative overflow-hidden shadow-xl shadow-amber-900/15 ring-1 ring-white/20" style={{ background: 'linear-gradient(145deg, #ea580c 0%, #ff9505 45%, #faa324 100%)' }}>
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-20 translate-x-20 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-28 h-28 bg-black/10 rounded-full translate-y-14 -translate-x-14 pointer-events-none"></div>

            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-white/20 rounded-xl">
                  <Search className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold">{t('studentHome.needHelpTitle')}</h2>
              </div>

              <p className="text-white/85 mb-6 text-sm leading-relaxed">
                {t('studentHome.needHelpText')}
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href={SEARCH_TUTORS_URL}
                  className="bg-white text-[#e8920a] hover:bg-orange-50 px-5 py-2.5 rounded-xl font-semibold transition-colors duration-200 flex items-center justify-center gap-2 text-sm shadow-md"
                >
                  <Search className="w-4 h-4" />
                  {t('studentHome.searchTutors')}
                </Link>
                <Link
                  href={EXPLORE_COURSES_URL}
                  className="bg-white/20 hover:bg-white/30 text-white border border-white/30 px-5 py-2.5 rounded-xl font-semibold transition-colors duration-200 flex items-center justify-center gap-2 text-sm"
                >
                  <BookOpen className="w-4 h-4" />
                  {t('studentHome.exploreCourses')}
                </Link>
              </div>
            </div>
          </div>

          {/* Quick Access Card */}
          <div className="bg-white/95 backdrop-blur-sm rounded-3xl p-7 shadow-lg shadow-amber-900/5 border border-amber-100/80 ring-1 ring-white/50">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 bg-[#ff9505]/10 rounded-xl">
                <Clock className="w-5 h-5 text-[#ff9505]" />
              </div>
              <h2 className="text-xl font-bold text-[#262528]">{t('studentHome.quickAccess.title')}</h2>
            </div>

            <div className="space-y-3">
              <Link
                href={routes.HISTORY}
                className="flex items-center justify-between p-4 bg-[#f5f0e5] hover:bg-[#ede8d8] rounded-xl transition-colors duration-200 group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#ff9505]/15 rounded-lg">
                    <History className="w-4 h-4 text-[#ff9505]" />
                  </div>
                  <span className="font-medium text-[#262528] text-sm">{t('studentHome.quickAccess.history')}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#ff9505] transition-colors" />
              </Link>

              <Link
                href={routes.PROFILE}
                className="flex items-center justify-between p-4 bg-[#f5f0e5] hover:bg-[#ede8d8] rounded-xl transition-colors duration-200 group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#ff9505]/15 rounded-lg">
                    <Users className="w-4 h-4 text-[#ff9505]" />
                  </div>
                  <span className="font-medium text-[#262528] text-sm">{t('studentHome.quickAccess.profile')}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#ff9505] transition-colors" />
              </Link>
            </div>
          </div>
        </div>

        

        {/* Achievement Banner */}
        {stats !== null && stats.totalCompleted > 0 && (() => {
          const achievement = getAchievementMessage(stats.totalCompleted);
          return (
            <div className="rounded-2xl p-6 text-white shadow-lg shadow-stone-900/20 ring-1 ring-white/10" style={{ background: 'linear-gradient(145deg, #1c1917 0%, #292524 50%, #3f3a36 100%)' }}>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#ff9505]/20 rounded-xl flex-shrink-0">
                  <Award className="w-7 h-7 text-[#faa324]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold mb-0.5">{achievement.title}</h3>
                  <p className="text-white/70 text-sm">{achievement.description}</p>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <footer className="border-t border-amber-200/50 bg-gradient-to-r from-amber-50/90 via-orange-50/70 to-amber-50/90">
        <div className="page-container !py-5 text-center text-sm text-gray-500 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <Link
            href={routes.TERMS_AND_CONDITIONS}
            className="text-[#ff9505] hover:text-[#e8920a] underline underline-offset-2 font-medium"
          >
            {t('landing.footer.links.termsAndConditions')}
          </Link>
          <span className="text-gray-400" aria-hidden>·</span>
          <Link
            href={routes.PRIVACY_POLICY}
            className="text-[#ff9505] hover:text-[#e8920a] underline underline-offset-2 font-medium"
          >
            {t('landing.footer.links.privacyPolicy')}
          </Link>
        </div>
      </footer>
    </main>
  );
} 