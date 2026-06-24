"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { 
  ArrowLeft, 
  BookOpen, 
  Users, 
  Calendar, 
  Clock, 
  Star, 
  DollarSign,
  CheckCircle,
  XCircle,
  Clock3,
  Edit,
  BarChart3
} from "lucide-react";
import PageSectionHeader from "@/app/components/PageSectionHeader/PageSectionHeader";
import { authFetch } from "@/app/services/authFetch";
import { TutoringSessionService } from "@/app/services/core/TutoringSessionService";
import { useAuth } from "@/app/context/SecureAuthContext";
import { useI18n } from "@/lib/i18n";
import routes from "@/routes";

export default function TutorCourseDetail() {
  const { t, formatCurrency, formatDate } = useI18n();
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const courseId = params?.id;

  const [course, setCourse] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseId) return;
    setLoading(true);

    Promise.all([
      authFetch(`/api/tutor/courses/${courseId}`),
      TutoringSessionService.getTutorSessions()
    ])
      .then(([courseRes, allSessions]) => {
        if (courseRes.ok && courseRes.data?.success) {
          setCourse(courseRes.data.course);
        }
        const filtered = allSessions.filter(s => s.courseId === courseId);
        setSessions(filtered);
      })
      .catch(err => console.error('Error loading course:', err))
      .finally(() => setLoading(false));
  }, [courseId]);

  const now = new Date();
  const upcomingSessions = sessions.filter(s => new Date(s.startTimestamp) > now);
  const completedSessions = sessions.filter(s => s.status === "Completed");
  const totalEarnings = completedSessions.reduce((sum, s) => sum + (Number(s.price) || 0), 0);

  if (loading) {
    return (
      <div className="page-container">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="page-container">
        <div className="text-center py-12">
          <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-600 mb-2">{t("tutorCourseDetail.notFound.title")}</h2>
          <p className="text-gray-500 mb-4">{t("tutorCourseDetail.notFound.description")}</p>
          <Link href={routes.TUTOR_COURSES} className="text-blue-600 hover:underline">
            {t("tutorCourseDetail.notFound.backLink")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <Link 
        href={routes.TUTOR_COURSES}
        className="inline-flex items-center gap-2 text-gray-500 hover:text-blue-600 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("common.goBack")}
      </Link>

      <PageSectionHeader
        titleClassName="page-section-title--inline"
        title={
          <>
            <BookOpen className="page-section-header__title-icon" size={26} />
            {course.name}
          </>
        }
        subtitle={course.description || t("tutorCourseDetail.subtitleFallback")}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 shadow-md border border-sky-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/10 rounded-lg">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">{t("tutorCourseDetail.stats.sessions")}</p>
              <p className="text-2xl font-bold text-blue-600">{sessions.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-md border border-sky-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">{t("tutorCourseDetail.stats.completed")}</p>
              <p className="text-2xl font-bold text-emerald-600">{completedSessions.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-md border border-sky-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-100 rounded-lg">
              <Clock3 className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">{t("tutorCourseDetail.stats.upcoming")}</p>
              <p className="text-2xl font-bold text-amber-600">{upcomingSessions.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-md border border-sky-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">{t("tutorCourseDetail.stats.earnings")}</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalEarnings)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-md border border-sky-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[#003d66]">{t("tutorCourseDetail.recentSessions.title")}</h3>
          <Link
            href={routes.TUTOR_MIS_TUTORIAS}
            className="text-blue-600 hover:underline text-sm"
          >
            {t("tutorCourseDetail.recentSessions.viewAll")}
          </Link>
        </div>

        {sessions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>{t("tutorCourseDetail.recentSessions.empty")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-2 font-semibold text-gray-600">{t("tutorCourseDetail.table.date")}</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-600">{t("tutorCourseDetail.table.student")}</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-600">{t("tutorCourseDetail.table.status")}</th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-600">{t("tutorCourseDetail.table.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 10).map((session) => (
                  <tr key={session.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 px-2">
                      {formatDate(session.startTimestamp, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3 px-2">{session.studentName || session.studentEmail}</td>
                    <td className="py-3 px-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        session.status === "Completed"
                          ? "bg-emerald-100 text-emerald-700"
                          : session.status === "Pending"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-gray-100 text-gray-700"
                      }`}>
                        {session.status === "Completed" && <CheckCircle className="w-3 h-3" />}
                        {session.status === "Pending" && <Clock3 className="w-3 h-3" />}
                        {t(`studentHistory.status.${session.status}`)}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right font-medium">
                      {formatCurrency(session.price || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}