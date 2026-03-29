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
  PlusCircle
} from "lucide-react";
import WelcomeBanner from "../Welcome/Welcome";
import BoxNewCourse from "../BoxNewCourse/BoxNewCourse";
import GoogleCalendarButton from "../GoogleCalendarButton/GoogleCalendarButton";
import TutoringSummary from "../TutoringSummary/TutoringSummary";
import { getMaterias } from "../../services/utils/HomeService.service";
import { TutoringSessionService } from "../../services/utils/TutoringSessionService";
import { useAuth } from "../../context/SecureAuthContext";
import { useI18n } from "../../../lib/i18n";
import routes from "../../../routes";

export default function TutorHome({ userName }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [materias, setMaterias] = useState([]);
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

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // Run all data fetches in parallel
        const promises = [getMaterias()];
        if (user?.email) {
          promises.push(
            TutoringSessionService.getTutorWeeklyPerformance(user.email),
            TutoringSessionService.getTutorSessionStats(user.email)
          );
        }

        const results = await Promise.all(promises);

        const coursesData = results[0];
        setMaterias(Array.isArray(coursesData) ? coursesData : []);

        if (user?.email && results.length === 3) {
          setWeeklyPerformance(results[1]);
          setTutorStats(results[2]);
        }
      } catch (error) {
        console.error('Error loading tutor home data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user?.email]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <WelcomeBanner usuario={userName} />
      
      <div className="page-container pt-6 sm:pt-8 pb-8 sm:pb-12">
        {/* Performance Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5 md:gap-6 mb-6 sm:mb-8">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 sm:p-5 md:p-6 shadow-lg border border-orange-100 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600">{t('tutorHome.stats.sessions')}</p>
                {loading ? (
                  <div className="w-12 h-8 bg-gray-200 rounded animate-pulse mb-1"></div>
                ) : (
                  <p className="text-xl sm:text-2xl font-bold text-orange-600">{tutorStats.scheduled}</p>
                )}
                <p className="text-xs text-gray-500">{t('tutorHome.stats.scheduled')}</p>
              </div>
              <div className="p-2 sm:p-3 bg-orange-100 rounded-xl flex-shrink-0">
                <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-orange-100 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('tutorHome.stats.sessions')}</p>
                {loading ? (
                  <div className="w-12 h-8 bg-gray-200 rounded animate-pulse mb-1"></div>
                ) : (
                  <p className="text-2xl font-bold text-orange-600">{tutorStats.completed}</p>
                )}
                <p className="text-xs text-gray-500">Completadas</p>
              </div>
              <div className="p-3 bg-orange-100 rounded-xl">
                <Users className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 sm:p-5 md:p-6 shadow-lg border border-yellow-100 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600">{t('tutorHome.stats.earnings')}</p>
                {loading ? (
                  <div className="w-16 h-8 bg-gray-200 rounded animate-pulse mb-1"></div>
                ) : (
                  <p className="text-xl sm:text-2xl font-bold text-orange-600 break-words">
                    ${tutorStats.totalEarnings.toLocaleString('es-CO')}
                  </p>
                )}
                <p className="text-xs text-gray-500">Total</p>
              </div>
              <div className="p-2 sm:p-3 bg-orange-100 rounded-xl flex-shrink-0">
                <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 sm:p-5 md:p-6 shadow-lg border border-orange-100 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600">{t('tutorHome.stats.rating')}</p>
                {loading ? (
                  <div className="w-12 h-8 bg-gray-200 rounded animate-pulse mb-1"></div>
                ) : (
                  <p className="text-xl sm:text-2xl font-bold text-orange-600">
                    {tutorStats.averageRating > 0 ? tutorStats.averageRating.toFixed(1) : 'N/A'}
                  </p>
                )}
                <p className="text-xs text-gray-500">Promedio</p>
              </div>
              <div className="p-2 sm:p-3 bg-orange-100 rounded-xl flex-shrink-0">
                <Star className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
              </div>
            </div>
          </div>
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

        {/* Main Dashboard Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mb-6 sm:mb-8">
        </div>

        {/* Courses Management */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-4 sm:p-6 md:p-8 shadow-lg border border-gray-100 mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6 mb-6 sm:mb-8">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="p-2 sm:p-3 bg-purple-100 rounded-xl flex-shrink-0">
                <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 break-words">
                  {t('tutorHome.coursesTitle')}
                </h2>
                <p className="text-sm sm:text-base text-gray-600 mt-1 break-words">{t('tutorHome.coursesDescription')}</p>
              </div>
            </div>
            <Link 
              href={routes.TUTOR_COURSES}
              className="inline-flex items-center gap-2 bg-purple-500 hover:bg-purple-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-semibold transition-colors duration-300 text-sm sm:text-base whitespace-nowrap flex-shrink-0"
            >
              <PlusCircle className="w-4 h-4 sm:w-5 sm:h-5" />
              {t('tutorHome.addCourse')}
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 md:gap-6">
            {materias.slice(0, 6).map(({ codigo, nombre }) => (
              <BoxNewCourse 
                key={codigo} 
                name={nombre} 
                number={Math.floor(Math.random() * 10) + 1}
              />
            ))}
          </div>

          {materias.length > 6 && (
            <div className="text-center mt-6">
              <Link 
                href={routes.TUTOR_COURSES}
                className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-700 font-semibold transition-colors duration-300"
              >
                {t('tutorHome.viewAll')}
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          )}
        </div>

        {/* Performance Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mb-6 sm:mb-8">
          {/* Weekly Performance */}
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-4 sm:p-6 md:p-8 shadow-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
              <div className="p-2 sm:p-3 bg-blue-100 rounded-xl flex-shrink-0">
                <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-800 break-words">{t('tutorHome.performance.title')}</h3>
            </div>
            
            {loading ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-xl">
                  <span className="font-medium text-gray-700">{t('tutorHome.performance.weeklySessions')}</span>
                  <div className="w-12 h-8 bg-gray-200 rounded animate-pulse"></div>
                </div>
                
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-xl">
                  <span className="font-medium text-gray-700">{t('tutorHome.performance.weeklyEarnings')}</span>
                  <div className="w-16 h-8 bg-gray-200 rounded animate-pulse"></div>
                </div>
                
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-xl">
                  <span className="font-medium text-gray-700">{t('tutorHome.performance.studentRetention')}</span>
                  <div className="w-12 h-8 bg-gray-200 rounded animate-pulse"></div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-blue-50 rounded-xl">
                  <span className="font-medium text-gray-700">{t('tutorHome.performance.weeklySessions')}</span>
                  <span className="text-2xl font-bold text-blue-600">{weeklyPerformance.weeklySessions}</span>
                </div>
                
                <div className="flex justify-between items-center p-4 bg-green-50 rounded-xl">
                  <span className="font-medium text-gray-700">{t('tutorHome.performance.weeklyEarnings')}</span>
                  <span className="text-2xl font-bold text-green-600">
                    ${weeklyPerformance.weeklyEarnings.toLocaleString('es-CO')}
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-4 bg-purple-50 rounded-xl">
                  <span className="font-medium text-gray-700">{t('tutorHome.performance.studentRetention')}</span>
                  <span className="text-2xl font-bold text-purple-600">{weeklyPerformance.studentRetention}%</span>
                </div>
              </div>
            )}
          </div>

          {/* Achievement Badge */}
          <div className="bg-gradient-to-br from-yellow-400 to-orange-500 rounded-3xl p-4 sm:p-6 md:p-8 text-white">
            <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
              <div className="p-2 sm:p-3 bg-white/20 rounded-xl flex-shrink-0">
                <Award className="w-6 h-6 sm:w-8 sm:h-8" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold break-words">{t('tutorHome.achievement.title')}</h3>
            </div>
            {loading ? (
              <div className="space-y-2">
                <div className="w-full h-4 bg-white/20 rounded animate-pulse"></div>
                <div className="w-3/4 h-4 bg-white/20 rounded animate-pulse"></div>
                <div className="w-1/2 h-4 bg-white/20 rounded animate-pulse mt-4"></div>
              </div>
            ) : (
              <>
                <p className="text-white/90 mb-4">
                  {tutorStats.completed > 0 
                    ? `Has completado ${tutorStats.completed} sesiones y mantienes una calificación de ${tutorStats.averageRating > 0 ? tutorStats.averageRating.toFixed(1) : 'N/A'} estrellas.`
                    : 'Comienza a dar tutorías para ver tus logros aquí.'
                  }
                </p>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  <span className="font-semibold">
                    {tutorStats.completed > 0 ? `${tutorStats.completed} sesiones completadas` : '¡Comienza tu primera sesión!'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <footer className="border-t border-indigo-100 bg-indigo-50/40">
        <div className="page-container py-6 text-center text-sm text-gray-600">
          <Link
            href={routes.PRIVACY_POLICY}
            className="text-indigo-600 hover:text-indigo-700 underline underline-offset-2 font-medium"
          >
            {t('landing.footer.links.privacyPolicy')}
          </Link>
        </div>
      </footer>
    </main>
  );
} 