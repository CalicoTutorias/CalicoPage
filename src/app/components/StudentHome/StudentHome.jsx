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
  Sparkles,
  Target,
  Award
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
      title: "¡Comienza tu viaje! 🚀",
      description: "Reserva tu primera sesión de tutoría y da el primer paso hacia el éxito académico.",
    };
  }
  if (totalCompleted <= 3) {
    return {
      title: "¡Buen comienzo! 🌱",
      description: `Has completado ${totalCompleted} ${totalCompleted === 1 ? 'sesión' : 'sesiones'}. ¡Sigue así, cada sesión cuenta!`,
    };
  }
  if (totalCompleted <= 10) {
    return {
      title: "¡Vas por buen camino! ⭐",
      description: `${totalCompleted} sesiones completadas. ¡Estás construyendo un gran hábito de estudio!`,
    };
  }
  if (totalCompleted <= 24) {
    return {
      title: "¡Sigues mejorando! 🎉",
      description: `Has completado ${totalCompleted} sesiones. ¡Mantén el excelente trabajo!`,
    };
  }
  if (totalCompleted <= 50) {
    return {
      title: "¡Estudiante destacado! 🏆",
      description: `${totalCompleted} sesiones completadas. Tu dedicación al aprendizaje es admirable.`,
    };
  }
  return {
    title: "¡Leyenda del aprendizaje! 🌟",
    description: `¡Increíble! ${totalCompleted} sesiones completadas. Eres un ejemplo de constancia.`,
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
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
      <WelcomeBanner usuario={userName} />
      
      <div className="container mx-auto pt-8 px-6 pb-12">
        {/* Quick Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-orange-100 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('studentHome.stats.sessionsThisWeek')}</p>
                <p className="text-2xl font-bold text-orange-600">
                  {stats ? stats.sessionsThisWeek : '—'}
                </p>
              </div>
              <div className="p-3 bg-orange-100 rounded-xl">
                <Calendar className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-orange-100 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('studentHome.stats.activeCourses')}</p>
                <p className="text-2xl font-bold text-orange-600">
                  {stats ? stats.activeCoursesCount : '—'}
                </p>
              </div>
              <div className="p-3 bg-orange-100 rounded-xl">
                <BookOpen className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-green-100 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('studentHome.stats.totalSessions')}</p>
                <p className="text-2xl font-bold text-orange-600">
                  {stats ? stats.totalCompleted : '—'}
                </p>
              </div>
              <div className="p-3 bg-orange-100 rounded-xl">
                <TrendingUp className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-purple-100 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('studentHome.stats.averageRating')}</p>
                <p className="text-2xl font-bold text-orange-600">
                  {stats ? (stats.averageRating !== null ? stats.averageRating : '—') : '—'}
                </p>
              </div>
              <div className="p-3 bg-orange-100 rounded-xl">
                <Star className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Scheduled Sessions */}
        <div className="mb-8">
          <TutoringSummary 
            userType="student"
            title={t('studentHome.scheduledSessions')}
            linkText={t('studentHome.viewHistory')}
            linkHref={routes.SEARCH_TUTORS}
          />
        </div>

        {/* Main Action Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Find Help Card */}
          <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-3xl p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-12 -translate-x-12"></div>
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-white/20 rounded-xl">
                  <Target className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold">{t('studentHome.needHelpTitle')}</h2>
              </div>
              
              <p className="text-white/90 mb-6 text-lg">
                {t('studentHome.needHelpText')}
              </p>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href={SEARCH_TUTORS_URL}
                  className="bg-white text-orange-600 hover:bg-orange-50 px-6 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
                >
                  <Search className="w-5 h-5" />
                  {t('studentHome.searchTutors')}
                </Link>
                <Link
                  href={EXPLORE_COURSES_URL}
                  className="bg-white/20 hover:bg-white/30 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 backdrop-blur-sm"
                >
                  <Sparkles className="w-5 h-5" />
                  {t('studentHome.exploreCourses')}
                </Link>
              </div>
            </div>
          </div>

          {/* Quick Access Card */}
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-orange-100 rounded-xl">
                <Clock className="w-6 h-6 text-orange-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800">{t('studentHome.quickAccess.title')}</h2>
            </div>
            
            <div className="space-y-4">
              <Link 
                href={routes.HISTORY}
                className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors duration-200 group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <BookOpen className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="font-medium text-gray-700">{t('studentHome.quickAccess.history')}</span>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </Link>

              <Link
                href={routes.PROFILE}
                className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors duration-200 group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Users className="w-5 h-5 text-purple-600" />
                  </div>
                  <span className="font-medium text-gray-700">{t('studentHome.quickAccess.profile')}</span>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </Link>
            </div>
          </div>
        </div>

        {/* Your Courses Section */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-lg border border-gray-100">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-orange-100 rounded-xl">
              <BookOpen className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-800">
                {t('studentHome.yourCourses')}
              </h2>
              <p className="text-gray-600 mt-1">{t('studentHome.coursesDescription')}</p>
            </div>
          </div>

          {!coursesLoaded ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
            </div>
          ) : myCourses.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {myCourses.map((course) => (
                <BoxCourse
                  key={course.id}
                  codigo={course.code}
                  nombre={course.name}
                  onCourseClick={() => {
                    window.location.href = `${routes.SEARCH_TUTORS}?tab=materias&search=${encodeURIComponent(course.name)}`;
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="p-4 bg-orange-50 rounded-2xl w-fit mx-auto mb-4">
                <BookOpen className="w-8 h-8 text-orange-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">
                {t('studentHome.noCourses.title')}
              </h3>
              <p className="text-gray-500 mb-6">
                {t('studentHome.noCourses.description')}
              </p>
              <Link
                href={EXPLORE_COURSES_URL}
                className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors duration-300"
              >
                <Sparkles className="w-5 h-5" />
                {t('studentHome.noCourses.exploreCourses')}
              </Link>
            </div>
          )}
        </div>

        {/* Achievement Badge */}
        {stats !== null && (() => {
          const achievement = getAchievementMessage(stats.totalCompleted);
          return (
            <div className="mt-8 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-2xl p-6 text-white">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-xl flex-shrink-0">
                  <Award className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-1">{achievement.title}</h3>
                  <p className="text-white/90">{achievement.description}</p>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <footer className="border-t border-orange-100 bg-orange-50/50">
        <div className="container mx-auto px-6 py-6 text-center text-sm text-gray-600 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <Link
            href={routes.TERMS_AND_CONDITIONS}
            className="text-orange-600 hover:text-orange-700 underline underline-offset-2 font-medium"
          >
            {t('landing.footer.links.termsAndConditions')}
          </Link>
          <span className="text-gray-400" aria-hidden>
            ·
          </span>
          <Link
            href={routes.PRIVACY_POLICY}
            className="text-orange-600 hover:text-orange-700 underline underline-offset-2 font-medium"
          >
            {t('landing.footer.links.privacyPolicy')}
          </Link>
        </div>
      </footer>
    </main>
  );
} 