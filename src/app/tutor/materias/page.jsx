"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useI18n } from "../../../lib/i18n";
import { X } from "lucide-react";
import PageSectionHeader from "../../components/PageSectionHeader/PageSectionHeader";

async function authFetch(url, options = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('calico_auth_token') : null;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

export default function TutorMaterias() {
  const { t } = useI18n();

  const [enrolledCourses, setEnrolledCourses] = useState([]);
  const [allCourses, setAllCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Enrollment form state
  const [formCourseId, setFormCourseId] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formExperience, setFormExperience] = useState('');
  const [formWorkSample, setFormWorkSample] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchEnrolled = useCallback(async () => {
    try {
      const res = await authFetch('/api/tutor/courses');
      const data = await res.json();
      if (data.success) setEnrolledCourses(data.courses);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [enrolledRes, allRes] = await Promise.all([
          authFetch('/api/tutor/courses'),
          fetch('/api/courses'),
        ]);
        const enrolledData = await enrolledRes.json();
        const allData = await allRes.json();

        if (enrolledData.success) setEnrolledCourses(enrolledData.courses);
        if (allData.success) setAllCourses(allData.courses);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const enrolledIds = new Set(enrolledCourses.map((tc) => tc.courseId));
  const availableCourses = allCourses.filter((c) => !enrolledIds.has(c.id));

  const openModal = () => {
    setFormCourseId('');
    setFormPrice('');
    setFormExperience('');
    setFormWorkSample('');
    setFormError('');
    setShowModal(true);
  };

  const handleEnroll = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formCourseId) {
      setFormError(t('tutorCourses.enroll.errorSelectCourse'));
      return;
    }
    const price = parseFloat(formPrice);
    if (!formPrice || isNaN(price) || price <= 0) {
      setFormError(t('tutorCourses.enroll.errorPrice'));
      return;
    }
    if (!formExperience.trim()) {
      setFormError(t('tutorCourses.enroll.errorExperience'));
      return;
    }

    setFormSubmitting(true);
    try {
      const res = await authFetch('/api/tutor/courses', {
        method: 'POST',
        body: JSON.stringify({
          courseId: formCourseId,
          customPrice: price,
          experience: formExperience.trim(),
          workSampleUrl: formWorkSample.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchEnrolled();
        setShowModal(false);
      } else if (data.error === 'COURSE_ALREADY_ADDED') {
        setFormError(t('tutorCourses.enroll.alreadyEnrolled'));
      } else {
        setFormError(data.error || t('tutorCourses.enroll.errorGeneric'));
      }
    } catch {
      setFormError(t('tutorCourses.enroll.errorGeneric'));
    } finally {
      setFormSubmitting(false);
    }
  };

  const avgPrice = enrolledCourses.length
    ? Math.round(
        enrolledCourses.reduce((sum, tc) => sum + Number(tc.customPrice), 0) /
          enrolledCourses.length
      )
    : 0;

  return (
    <div className="page-container">
      <PageSectionHeader
        title={t("tutorCourses.title")}
        subtitle={t("tutorCourses.subtitle")}
        actions={
          <button type="button" onClick={openModal} className="page-section-header__btn-primary">
            {t("tutorCourses.enroll.button")}
          </button>
        }
      />

      {/* Course grid */}
      {loading ? (
        <div className="flex justify-center items-center py-20 text-gray-500">
          {t('tutorCourses.loading')}
        </div>
      ) : enrolledCourses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <p className="text-lg">{t('tutorCourses.noCourses')}</p>
          <button
            onClick={openModal}
            className="mt-4 text-blue-600 underline text-sm"
          >
            {t('tutorCourses.enroll.button')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 md:gap-6">
          {enrolledCourses.map((tc) => (
            <div
              key={tc.courseId}
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-300 p-4 sm:p-5 md:p-6 border border-sky-100/90 ring-1 ring-white/50"
            >
              <div className="flex justify-between items-start mb-3 sm:mb-4 gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-1 break-words">
                    {tc.course?.name}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-500">{tc.course?.code}</p>
                </div>
                <span className="px-2 py-1 rounded-md text-xs font-medium bg-sky-100 text-sky-900 flex-shrink-0">
                  {t('tutorCourses.status.enrolled')}
                </span>
              </div>

              <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-5">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm sm:text-base">
                    {t('tutorCourses.card.ratePerHour')}
                  </span>
                  <span className="font-semibold text-sm sm:text-base">
                    ${Number(tc.customPrice).toLocaleString()}
                  </span>
                </div>
                {tc.experience && (
                  <p className="text-xs text-gray-500 line-clamp-2">{tc.experience}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 md:gap-6 mt-6 sm:mt-8">
        <div className="bg-white rounded-lg p-4 sm:p-5 md:p-6 shadow-md text-center border border-sky-100/80">
          <p className="text-xl sm:text-2xl md:text-3xl font-bold text-blue-600 mb-1">
            {enrolledCourses.length}
          </p>
          <p className="text-xs sm:text-sm text-gray-600">{t('tutorCourses.stats.activeCourses')}</p>
        </div>
        <div className="bg-white rounded-lg p-4 sm:p-5 md:p-6 shadow-md text-center border border-sky-100/80">
          <p className="text-xl sm:text-2xl md:text-3xl font-bold text-blue-600 mb-1">
            {avgPrice > 0 ? `$${avgPrice.toLocaleString()}` : '—'}
          </p>
          <p className="text-xs sm:text-sm text-gray-600">{t('tutorCourses.stats.averageRate')}</p>
        </div>
        <div className="bg-white rounded-lg p-4 sm:p-5 md:p-6 shadow-md text-center border border-sky-100/80 col-span-2 md:col-span-1">
          <p className="text-xl sm:text-2xl md:text-3xl font-bold text-blue-600 mb-1">
            {availableCourses.length}
          </p>
          <p className="text-xs sm:text-sm text-gray-600">{t('tutorCourses.stats.availableCourses')}</p>
        </div>
      </div>

      {/* Enrollment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl border border-gray-100 w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-gray-800">{t('tutorCourses.enroll.modalTitle')}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEnroll} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  {t('tutorCourses.enroll.selectCourse')}
                </label>
                <select
                  value={formCourseId}
                  onChange={(e) => setFormCourseId(e.target.value)}
                  className="w-full border rounded-lg p-2 text-sm"
                >
                  <option value="">{t('tutorCourses.enroll.selectCoursePlaceholder')}</option>
                  {availableCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
                {availableCourses.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">{t('tutorCourses.enroll.noCourses')}</p>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  {t('tutorCourses.enroll.price')}
                </label>
                <input
                  type="number"
                  min="1"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  placeholder={t('tutorCourses.enroll.pricePlaceholder')}
                  className="w-full border rounded-lg p-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  {t('tutorCourses.enroll.experience')}
                </label>
                <textarea
                  rows={3}
                  value={formExperience}
                  onChange={(e) => setFormExperience(e.target.value)}
                  placeholder={t('tutorCourses.enroll.experiencePlaceholder')}
                  className="w-full border rounded-lg p-2 text-sm resize-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  {t('tutorCourses.enroll.workSample')}
                </label>
                <input
                  type="url"
                  value={formWorkSample}
                  onChange={(e) => setFormWorkSample(e.target.value)}
                  placeholder={t('tutorCourses.enroll.workSamplePlaceholder')}
                  className="w-full border rounded-lg p-2 text-sm"
                />
              </div>

              {formError && (
                <p className="text-red-500 text-sm">{formError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  {t('tutorCourses.enroll.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting || availableCourses.length === 0}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {formSubmitting && (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  )}
                  {t('tutorCourses.enroll.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
