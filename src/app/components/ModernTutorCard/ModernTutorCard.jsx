'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Star, BookOpen, ChevronRight } from 'lucide-react';
import { useI18n } from '../../../lib/i18n';
import { Button } from '../../../components/ui/button';
import routes from '../../../routes';
import './ModernTutorCard.css';

/**
 * Tutor card used in:
 *   - the global "Tutores" tab (no course context)
 *   - the per-materia tutor list (course context provided as a string ID)
 *
 * Booking is no longer triggered from this card. The CTA always navigates to
 * the tutor detail page (/home/buscar-tutores/tutor/[id]). When a course
 * context is provided, we deep-link to the same subject so the user lands
 * directly on the right calendar.
 *
 * For the per-materia view we also surface the tutor's *per-subject* rating
 * alongside the global one, so students can compare candidates at a glance.
 *
 * When `onSelectTutor` is provided, the card acts as an in-place selector
 * for master-detail layouts. Otherwise it keeps the historical navigation
 * behavior and opens the full tutor detail page.
 */
export default function ModernTutorCard({ tutor, course, selected = false, onSelectTutor /* , onReservar */ }) {
    const { t, locale } = useI18n();
    const router = useRouter();

    const tutorId =
        tutor?.id || tutor?.uid || tutor?.userId || tutor?.email;
    const tutorName = tutor?.name || t('tutorCard.tutorFallback');

    // Global rating (precomputed in TutorProfile.review).
    const globalRating = Number(tutor?.tutorProfile?.review ?? tutor?.rating ?? 0) || 0;
    const globalCount = Number(
        tutor?.tutorProfile?.numReview ?? tutor?.numReview ?? tutor?.reviews ?? 0,
    ) || 0;
    const hasGlobalReviews = globalRating > 0 && globalCount > 0;

    // Per-subject rating (from getTutorsByCourse augmentation). Only
    // meaningful when the card is rendered inside a materia-filtered list.
    const subjectRating = Number(tutor?.subjectRating ?? 0) || 0;
    const subjectCount = Number(tutor?.subjectReviewCount ?? 0) || 0;
    const hasSubjectReviews = Boolean(course) && subjectCount > 0;

    const numSessions = Number(
        tutor?.tutorProfile?.numSessions ?? tutor?.numSessions ?? 0,
    ) || 0;

    const reviewWord = (count) =>
        locale === 'en'
            ? count === 1 ? 'review' : 'reviews'
            : count === 1 ? 'reseña' : 'reseñas';

    // Contextual blurb — prefer per-course experience when in materia view.
    let tutorDescription = '';
    if (course && tutor?.tutorProfile?.tutorCourses) {
        const courseData = tutor.tutorProfile.tutorCourses.find(
            (tc) => tc.courseId === course || tc.course?.id === course,
        );
        tutorDescription = courseData?.experience || tutor?.tutorProfile?.bio || '';
    } else {
        tutorDescription = tutor?.tutorProfile?.bio || '';
    }

    const getInitials = (name) => {
        if (!name) return 'T';
        const parts = name.trim().split(' ').filter((p) => p.length > 0);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    };

    const handleViewProfile = () => {
        if (!tutorId) return;
        if (typeof onSelectTutor === 'function') {
            onSelectTutor(tutor);
            return;
        }
        // Passing the course context deep-links to the same subject in detail.
        const url = course
            ? routes.TUTOR_DETAIL(tutorId, { courseId: course })
            : routes.TUTOR_DETAIL(tutorId);
        router.push(url);
    };

    return (
        <div
            className={`modern-tutor-card cursor-pointer${selected ? ' modern-tutor-card--selected' : ''}`}
            onClick={handleViewProfile}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleViewProfile();
                }
            }}
        >
            <div className="tutor-card-container">
                {/* Avatar */}
                <div className="tutor-avatar-wrapper">
                    <div className="tutor-avatar">
                        {tutor?.profilePictureUrl ? (
                            <img
                                src={tutor.profilePictureUrl}
                                alt={tutorName}
                                className="avatar-image"
                            />
                        ) : (
                            <div className="avatar-placeholder">
                                <span className="avatar-initials">{getInitials(tutorName)}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="tutor-content-wrapper">
                    <div className="tutor-header-section">
                        <h3 className="tutor-name">{tutorName}</h3>

                        {/* Rating row — emphasizes subject rating when available,
                            then shows the global one as secondary context. */}
                        {(hasSubjectReviews || hasGlobalReviews) && (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs">
                                {hasSubjectReviews && (
                                    <span className="inline-flex items-center gap-1 text-orange-600 font-semibold">
                                        <Star className="w-3.5 h-3.5" fill="currentColor" />
                                        {subjectRating.toFixed(1)}
                                        <span className="text-gray-500 font-normal">
                                            en esta materia ({subjectCount})
                                        </span>
                                    </span>
                                )}
                                {hasGlobalReviews && (
                                    <span className="inline-flex items-center gap-1 text-gray-700">
                                        <Star className="w-3.5 h-3.5" fill="currentColor" />
                                        {globalRating.toFixed(1)}
                                        <span className="text-gray-400">
                                            general ({globalCount} {reviewWord(globalCount)})
                                        </span>
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Sessions stat — surfaces social proof in the comparative view. */}
                        {numSessions > 0 && (
                            <p className="text-xs text-gray-500 mt-1 inline-flex items-center gap-1">
                                <BookOpen className="w-3 h-3" />
                                {numSessions} {numSessions === 1 ? 'tutoría dada' : 'tutorías dadas'}
                            </p>
                        )}
                    </div>

                    {tutorDescription && (
                        <p className="tutor-experience">{tutorDescription}</p>
                    )}
                </div>

                {/* Action: navigates to the detail page (no booking from list). */}
                <div className="tutor-actions">
                    <Button
                        variant="cta"
                        onClick={(e) => {
                            // Stop propagation so the wrapper click handler doesn't
                            // fire twice; the button has its own handler.
                            e.stopPropagation();
                            handleViewProfile();
                        }}
                        className="reserve-btn inline-flex items-center gap-1"
                    >
                        Ver perfil
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
