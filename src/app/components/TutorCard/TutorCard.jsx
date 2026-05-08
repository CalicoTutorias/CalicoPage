'use client';

import React, { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import TutorReviewsList from '../TutorReviewsList/TutorReviewsList';

/**
 * TutorCard - Card de tutor según diseño de Calendly
 * @param {Object} tutor - Datos del tutor
 * @param {Function} onBookNow - Callback al hacer click en "Book Now"
 */
export default function TutorCard({ tutor, onBookNow }) {
    const [showReviews, setShowReviews] = useState(false);
    const tutorId = tutor?.uid || tutor?.id;
    const getInitials = (name) => {
        if (!name || typeof name !== 'string' || name.trim() === '') return 'T';
        const trimmedName = name.trim();
        const parts = trimmedName.split(' ').filter(part => part.length > 0);
        if (parts.length >= 2) {
            const first = parts[0][0]?.toUpperCase() || '';
            const second = parts[1][0]?.toUpperCase() || '';
            return (first + second) || 'T';
        }
        if (trimmedName.length >= 2) {
            return trimmedName.substring(0, 2).toUpperCase();
        }
        return trimmedName.substring(0, 1).toUpperCase() || 'T';
    };

    const normalizeCourses = (courses) => {
        if (!courses) return [];
        if (Array.isArray(courses)) {
            return courses.map(course => {
                if (typeof course === 'object') {
                    return course.nombre || course.name || course.codigo || course.code || String(course);
                }
                return String(course);
            });
        }
        if (typeof courses === 'string') {
            return [courses];
        }
        return [];
    };

    const courses = normalizeCourses(tutor.tutorProfile?.tutorCourses);
    const coursesDescription = courses.length > 0
        ? `Tutor experimentado especializado en ${courses.slice(0, 2).join(' y ')}. Historial comprobado ayudando a estudiantes a alcanzar el éxito académico.`
        : 'Tutor experimentado dedicado a ayudar a estudiantes a alcanzar sus metas académicas.';

    const tutorName = tutor?.name || 'Tutor';
    const initials = getInitials(tutorName);

    return (
        <div className="bg-[#FEF9F6] rounded-xl p-4 sm:p-5 md:p-6 hover:shadow-lg transition-all duration-300 border border-orange-100/50">
            {/* Mobile Layout */}
            <div className="flex flex-col sm:hidden gap-4">
                <div className="flex justify-center sm:justify-start">
                    <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-orange-200 to-pink-200 flex items-center justify-center overflow-hidden shadow-sm">
                        {tutor?.profileImage ? (
                            <img src={tutor.profileImage} alt={tutorName} className="w-full h-full object-cover" />
                        ) : (
                            <div className="text-xl font-bold text-white">{initials}</div>
                        )}
                    </div>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex flex-col gap-1 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 break-words">{tutorName}</h3>
                        {tutor?.rating && (
                            <div className="flex items-center gap-1">
                                <span className="text-base font-medium">{tutor.rating.toFixed(1)}</span>
                                <span className="text-yellow-500 text-base"></span>
                            </div>
                        )}
                    </div>
                    <p className="text-gray-600 text-sm mb-3 leading-relaxed line-clamp-2">
                        {tutor?.description || coursesDescription}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button
                            onClick={onBookNow}
                            className="bg-[#FF8C00] hover:bg-[#FF7A00] text-white px-4 py-2 rounded-full font-medium shadow-sm text-sm whitespace-nowrap flex-shrink-0"
                        >
                            Ver disponibilidad
                        </Button>
                        {tutorId && (
                            <button
                                onClick={() => setShowReviews(!showReviews)}
                                className="flex items-center gap-1 text-gray-500 hover:text-[#FF8C00] border border-gray-300 hover:border-[#FF8C00] px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                            >
                                <MessageSquare size={14} />
                                {showReviews ? 'Ocultar' : 'Reseñas'}
                            </button>
                        )}
                    </div>
                </div>
                {/* Mobile reviews */}
                <TutorReviewsList tutorId={tutorId} isOpen={showReviews} />
            </div>

            {/* Desktop Layout */}
            <div className="hidden sm:flex items-start gap-4 md:gap-5">
                <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-2 sm:mb-3">
                        <h3 className="text-lg sm:text-xl font-semibold text-gray-900 break-words">{tutorName}</h3>
                        {tutor?.rating && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                                <span className="text-base sm:text-lg font-medium">{tutor.rating.toFixed(1)}</span>
                                <span className="text-yellow-500 text-base sm:text-lg"></span>
                            </div>
                        )}
                    </div>
                    <p className="text-gray-600 text-sm mb-3 sm:mb-4 leading-relaxed line-clamp-2">
                        {tutor?.description || coursesDescription}
                    </p>
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                        <Button
                            onClick={onBookNow}
                            className="bg-[#FF8C00] hover:bg-[#FF7A00] text-white px-4 sm:px-6 py-2 rounded-full font-medium shadow-sm text-sm sm:text-base whitespace-nowrap flex-shrink-0"
                        >
                            Ver disponibilidad
                        </Button>
                        {tutorId && (
                            <button
                                onClick={() => setShowReviews(!showReviews)}
                                className="flex items-center gap-1.5 text-gray-500 hover:text-[#FF8C00] border border-gray-300 hover:border-[#FF8C00] px-4 py-2 rounded-full text-sm font-medium transition-colors"
                            >
                                <MessageSquare size={15} />
                                {showReviews ? 'Ocultar reseñas' : 'Ver reseñas'}
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex-shrink-0 flex items-center">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-lg bg-gradient-to-br from-orange-200 to-pink-200 flex items-center justify-center overflow-hidden shadow-sm">
                        {tutor?.profileImage ? (
                            <img src={tutor.profileImage} alt={tutorName} className="w-full h-full object-cover" />
                        ) : (
                            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-white">{initials}</div>
                        )}
                    </div>
                </div>
            </div>
            {/* Desktop reviews */}
            <div className="hidden sm:block">
                <TutorReviewsList tutorId={tutorId} isOpen={showReviews} />
            </div>
        </div>
    );
}
