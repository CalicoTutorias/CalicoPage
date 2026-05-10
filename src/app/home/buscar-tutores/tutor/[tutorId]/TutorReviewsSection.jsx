"use client";

import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import ReviewCard from './ReviewCard';

const PAGE_SIZE = 6;

/**
 * Reviews list with chip-style filter (All / per subject) and pagination.
 *
 * Chip-style was chosen over a dropdown because: (a) most tutors have a
 * handful of subjects, (b) chips are tappable on mobile without a second
 * click, (c) the active filter stays visible at all times. Overflows to
 * horizontal scroll on narrow screens to handle tutors with many subjects.
 */
export default function TutorReviewsSection({ tutorId, subjects, totalReviews }) {
    const [activeCourseId, setActiveCourseId] = useState(null); // null = all
    const [reviews, setReviews] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Reset to page 1 whenever the filter changes.
    useEffect(() => {
        setPage(1);
    }, [activeCourseId]);

    useEffect(() => {
        if (!tutorId) return;
        let cancelled = false;

        const params = new URLSearchParams();
        if (activeCourseId) params.set('courseId', activeCourseId);
        params.set('page', String(page));
        params.set('pageSize', String(PAGE_SIZE));

        setLoading(true);
        setError(null);
        fetch(`/api/tutors/${encodeURIComponent(tutorId)}/reviews?${params.toString()}`)
            .then((res) => res.json())
            .then((data) => {
                if (cancelled) return;
                if (data?.success) {
                    setReviews(data.reviews || []);
                    setPagination(data.pagination || null);
                } else {
                    setError(data?.error || 'No se pudieron cargar las reseñas.');
                }
            })
            .catch((err) => {
                if (cancelled) return;
                console.error('[TutorReviewsSection] fetch error:', err);
                setError('No se pudieron cargar las reseñas.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [tutorId, activeCourseId, page]);

    const filterSubjects = subjects?.filter((s) => s.reviewCount > 0) ?? [];

    return (
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <header className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div>
                    <h2 className="text-lg font-bold text-gray-900">Reseñas</h2>
                    <p className="text-sm text-gray-500">
                        {totalReviews > 0
                            ? `${totalReviews} ${totalReviews === 1 ? 'estudiante ha calificado' : 'estudiantes han calificado'} a este tutor`
                            : 'Aún no hay reseñas para este tutor.'}
                    </p>
                </div>
            </header>

            {/* Filter chips — only render if there are reviews to filter on. */}
            {filterSubjects.length > 0 && (
                <div className="flex gap-2 mb-5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
                    <FilterChip
                        active={activeCourseId === null}
                        onClick={() => setActiveCourseId(null)}
                    >
                        Todas
                    </FilterChip>
                    {filterSubjects.map((s) => (
                        <FilterChip
                            key={s.courseId}
                            active={activeCourseId === s.courseId}
                            onClick={() => setActiveCourseId(s.courseId)}
                        >
                            <span>{s.courseName}</span>
                            <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] opacity-70">
                                <Star className="w-2.5 h-2.5" fill="currentColor" />
                                {s.rating.toFixed(1)}
                            </span>
                        </FilterChip>
                    ))}
                </div>
            )}

            {/* List */}
            {loading ? (
                <div className="py-10 flex justify-center">
                    <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : error ? (
                <p className="text-sm text-red-600 text-center py-6">{error}</p>
            ) : reviews.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6 italic">
                    {activeCourseId
                        ? 'No hay reseñas en esta materia todavía.'
                        : 'Este tutor aún no tiene reseñas.'}
                </p>
            ) : (
                <div className="space-y-3">
                    {reviews.map((review) => (
                        <ReviewCard key={review.id} review={review} />
                    ))}
                </div>
            )}

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
                <nav className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1 || loading}
                        className="text-sm font-medium text-gray-700 hover:text-orange-600 disabled:text-gray-300 disabled:cursor-not-allowed"
                    >
                        ← Anterior
                    </button>
                    <span className="text-xs text-gray-500">
                        Página {pagination.page} de {pagination.totalPages}
                    </span>
                    <button
                        type="button"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={!pagination.hasMore || loading}
                        className="text-sm font-medium text-gray-700 hover:text-orange-600 disabled:text-gray-300 disabled:cursor-not-allowed"
                    >
                        Siguiente →
                    </button>
                </nav>
            )}
        </section>
    );
}

function FilterChip({ active, onClick, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`flex-shrink-0 inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
                active
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-orange-300 hover:text-orange-600'
            }`}
        >
            {children}
        </button>
    );
}
