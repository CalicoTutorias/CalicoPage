"use client";

import React from 'react';
import { BookOpen, Star, Calendar, ChevronRight } from 'lucide-react';
import { useI18n } from '../../../../../lib/i18n';

/**
 * Lists the subjects the tutor is approved to teach. Each card shows:
 *   - Subject name + code
 *   - Per-subject rating + review count (denormalized via Review.courseId)
 *   - Price
 *   - "Ver disponibilidad" CTA which lifts the selection up to the page,
 *     where the AvailabilityCalendar reveals itself for that subject.
 *
 * The currently-selected subject is highlighted so the user always knows
 * which calendar they are looking at below.
 */
export default function TutorSubjectsSection({ subjects, selectedCourseId, onSelectSubject }) {
    const { t, locale } = useI18n();
    const priceLocale = locale === 'en' ? 'en-US' : 'es-CO';

    if (!subjects || subjects.length === 0) {
        return (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-1">{t('tutorProfile.subjects.titleFallback')}</h2>
                <p className="text-sm text-gray-500">
                    {t('tutorProfile.subjects.emptyTutor')}
                </p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-bold text-gray-900">{t('tutorProfile.subjects.title')}</h2>
                <span className="text-sm text-gray-400">({subjects.length})</span>
            </div>
            <p className="text-sm text-gray-500 mb-5">
                {t('tutorProfile.subjects.subtitle')}
            </p>

            <ul className="space-y-3">
                {subjects.map((subject) => {
                    const isSelected = subject.courseId === selectedCourseId;
                    const hasRating = subject.reviewCount > 0;
                    return (
                        <li key={subject.courseId}>
                            <button
                                type="button"
                                onClick={() => onSelectSubject(subject)}
                                aria-pressed={isSelected}
                                className={`w-full text-left rounded-xl border p-4 transition-colors group flex items-start justify-between gap-4 ${
                                    isSelected
                                        ? 'border-orange-300 bg-orange-50/60 ring-1 ring-orange-200'
                                        : 'border-gray-200 hover:border-orange-300 hover:bg-orange-50/30'
                                }`}
                            >
                                <div className="flex items-start gap-3 min-w-0 flex-1">
                                    <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <BookOpen className="w-5 h-5 text-orange-500" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold text-gray-900 text-sm break-words">
                                            {subject.courseName}
                                        </p>
                                        {subject.courseCode && (
                                            <p className="text-xs text-gray-400 mt-0.5">{subject.courseCode}</p>
                                        )}
                                        <div className="flex items-center gap-3 mt-2 text-xs">
                                            <span className="inline-flex items-center gap-1 text-orange-500">
                                                <Star className="w-3.5 h-3.5" fill="currentColor" />
                                                <span className="font-semibold">
                                                    {hasRating ? subject.rating.toFixed(1) : t('tutorProfile.subjects.noReviews')}
                                                </span>
                                                {hasRating && (
                                                    <span className="text-gray-400">
                                                        ({subject.reviewCount})
                                                    </span>
                                                )}
                                            </span>
                                            {subject.price && (
                                                <span className="text-gray-500">
                                                    ${subject.price.toLocaleString(priceLocale)} COP
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div
                                    className={`inline-flex items-center gap-1 text-sm font-semibold flex-shrink-0 transition-colors ${
                                        isSelected
                                            ? 'text-orange-600'
                                            : 'text-orange-500 group-hover:text-orange-600'
                                    }`}
                                >
                                    <Calendar className="w-4 h-4" />
                                    <span className="hidden sm:inline">
                                        {isSelected ? t('tutorProfile.subjects.selected') : t('tutorProfile.subjects.viewAvailability')}
                                    </span>
                                    <ChevronRight className="w-4 h-4" />
                                </div>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
