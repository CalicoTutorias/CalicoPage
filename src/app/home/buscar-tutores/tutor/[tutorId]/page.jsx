"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import AvailabilityCalendar from '../../../../components/AvailabilityCalendar/AvailabilityCalendar';
import routes from '../../../../../routes';
import { useI18n } from '../../../../../lib/i18n';
import { useScrollReveal } from '../../../../hooks/useScrollReveal';
import TutorProfileHeader from './TutorProfileHeader';
import TutorSubjectsSection from './TutorSubjectsSection';
import TutorReviewsSection from './TutorReviewsSection';

function PageSpinner() {
    return (
        <div className="page-container py-12 flex items-center justify-center min-h-[60vh]">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );
}

function TutorDetailContent() {
    const router = useRouter();
    const { t } = useI18n();
    const params = useParams();
    const searchParams = useSearchParams();
    const tutorId = params?.tutorId
        ? decodeURIComponent(params.tutorId)
        : null;

    // Optional preselection from the URL — when the user clicked through from
    // the search-by-materia view, we deep-link them to the right subject so
    // the calendar appears immediately.
    const initialCourseId = searchParams.get('courseId');

    const [tutor, setTutor] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedSubject, setSelectedSubject] = useState(null);

    const calendarAnchorRef = useRef(null);
    // Re-scan for [data-reveal] children once `tutor` resolves, so the
    // post-fetch content gets observed (initial mount only has the spinner).
    const containerRef = useScrollReveal([tutor]);

    useEffect(() => {
        if (!tutorId) return;
        let cancelled = false;
        setLoading(true);
        setError(null);

        fetch(`/api/tutors/${encodeURIComponent(tutorId)}`)
            .then((res) => res.json())
            .then((data) => {
                if (cancelled) return;
                if (data?.success && data.tutor) {
                    setTutor(data.tutor);
                } else {
                    setError(data?.error || 'No pudimos cargar el perfil del tutor.');
                }
            })
            .catch((err) => {
                if (cancelled) return;
                console.error('[TutorDetail] fetch error:', err);
                setError('No pudimos cargar el perfil del tutor.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [tutorId]);

    // After tutor loads, preselect the course coming from the URL (if any)
    // and the subject exists in this tutor's approved list. We do not auto-
    // scroll on initial load to avoid disorienting users; scroll happens
    // explicitly when the user picks a subject via the UI.
    useEffect(() => {
        if (!tutor?.subjects || !initialCourseId) return;
        const match = tutor.subjects.find((s) => s.courseId === initialCourseId);
        if (match) setSelectedSubject(match);
    }, [tutor, initialCourseId]);

    const handleSelectSubject = (subject) => {
        setSelectedSubject(subject);
        // Defer to next tick so the calendar has mounted before we scroll.
        requestAnimationFrame(() => {
            calendarAnchorRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        });
    };

    const breadcrumb = useMemo(
        () => (
            <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-4 flex-wrap">
                <Link
                    href={routes.SEARCH_TUTORS}
                    className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
                >
                    <ChevronLeft className="w-4 h-4" />
                    {t('tutorProfile.breadcrumb')}
                </Link>
                <span className="text-gray-300">/</span>
                <span className="text-gray-900 font-medium truncate min-w-0">
                    {tutor?.name || t('tutorProfile.tutorFallback')}
                </span>
            </nav>
        ),
        [tutor?.name, t],
    );

    if (loading) return <PageSpinner />;

    if (error || !tutor) {
        return (
            <main className="page-container py-12">
                {breadcrumb}
                <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
                    <h1 className="text-xl font-bold text-gray-900 mb-2">
                        {t('tutorProfile.error.title')}
                    </h1>
                    <p className="text-sm text-gray-500 mb-6">
                        {error || t('tutorProfile.error.body')}
                    </p>
                    <Link
                        href={routes.SEARCH_TUTORS}
                        className="inline-flex items-center gap-2 bg-[#FF8C00] text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-[#e07d00] transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        {t('tutorProfile.error.back')}
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main ref={containerRef} className="page-container py-6 lg:py-10 min-h-[calc(100vh-5rem)]">
            {breadcrumb}

            <div className="grid lg:grid-cols-[minmax(320px,1fr)_2fr] gap-6 items-start">
                {/* Left column on desktop, top stack on mobile.
                    The header is sticky on desktop so the avatar/name stay
                    visible while the user scrolls through subjects + reviews. */}
                <aside data-reveal className="lg:sticky lg:top-24 space-y-6">
                    <TutorProfileHeader tutor={tutor} />
                </aside>

                <div className="space-y-6">
                    <div data-reveal style={{ transitionDelay: '0.08s' }}>
                        <TutorSubjectsSection
                            subjects={tutor.subjects}
                            selectedCourseId={selectedSubject?.courseId || null}
                            onSelectSubject={handleSelectSubject}
                        />
                    </div>

                    {/* Calendar appears once a subject is selected. The scroll
                        anchor sits above the heading so smooth-scroll lands
                        cleanly on the section title, not under it. */}
                    <div
                        ref={calendarAnchorRef}
                        className="scroll-mt-24"
                        data-reveal
                        style={{ transitionDelay: '0.16s' }}
                    >
                        {selectedSubject ? (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                                <h2 className="text-lg font-bold text-gray-900 mb-1">
                                    {t('tutorProfile.availability.title', { course: selectedSubject.courseName })}
                                </h2>
                                <p className="text-sm text-gray-500 mb-4">
                                    {t('tutorProfile.availability.subtitle')}
                                </p>
                                <AvailabilityCalendar
                                    tutorId={tutorId}
                                    tutorName={tutor.name}
                                    course={selectedSubject.courseName}
                                    courseId={selectedSubject.courseId}
                                    mode="individual"
                                />
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                                {t('tutorProfile.availability.selectSubjectHint')}
                            </div>
                        )}
                    </div>

                    <div data-reveal style={{ transitionDelay: '0.24s' }}>
                        <TutorReviewsSection
                            tutorId={tutorId}
                            subjects={tutor.subjects}
                            totalReviews={tutor.numReview}
                        />
                    </div>
                </div>
            </div>
        </main>
    );
}

export default function TutorDetailPage() {
    return (
        <Suspense fallback={<PageSpinner />}>
            <TutorDetailContent />
        </Suspense>
    );
}
