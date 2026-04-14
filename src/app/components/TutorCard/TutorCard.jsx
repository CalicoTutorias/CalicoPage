'use client';

import React, { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import TutorReviewsList from '../TutorReviewsList/TutorReviewsList';
import './TutorCard.css';

/**
 * TutorCard - Card de tutor (horizontal layout como en la foto)
 * @param {Object} tutor - Datos del tutor
 * @param {Function} onBookNow - Callback al hacer click en "Reservar"
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

    const tutorName = tutor?.name || 'Tutor';
    const initials = getInitials(tutorName);

    // Use bio from tutorProfile, fallback to description or generated text
    const tutorBio = tutor?.tutorProfile?.bio || tutor?.description ||
        `Experienced tutor specializing in various courses. Proven track record of helping students achieve academic success.`;

    // Use review from tutorProfile, fallback to rating (ensure it's a number)
    const tutorRating = tutor?.tutorProfile?.review ? parseFloat(tutor.tutorProfile.review) :
                        tutor?.rating ? parseFloat(tutor.rating) : null;

    const handleBookNow = () => {
        if (onBookNow) {
            onBookNow(tutor);
        }
    };

    return (
        <div className="modern-tutor-card">
            <div className="tutor-card-layout">
                {/* Avatar - Left */}
                <div className="tutor-avatar-small">
                    {tutor?.avatarUrl || tutor?.profileImage ? (
                        <img src={tutor.avatarUrl || tutor.profileImage} alt={tutorName} className="avatar-image-small" />
                    ) : (
                        <span className="avatar-initials-small">{initials}</span>
                    )}
                </div>

                {/* Content - Center */}
                <div className="tutor-content-center">
                    <div className="tutor-header-inline">
                        <h3 className="tutor-name-inline">{tutorName}</h3>
                        {tutorRating !== null && (
                            <div className="tutor-rating-inline">
                                <span className="rating-value">{tutorRating.toFixed(1)}</span>
                                <span className="star-symbol">★</span>
                            </div>
                        )}
                    </div>

                    <p className="tutor-description-inline">
                        {tutorBio}
                    </p>
                </div>

                {/* Actions - Right */}
                <div className="tutor-actions-inline">
                    <button className="book-now-btn-inline" onClick={handleBookNow}>
                        Reservar
                    </button>
                    {tutorId && (
                        <button
                            className="see-reviews-btn"
                            onClick={() => setShowReviews(!showReviews)}
                        >
                            <MessageSquare size={15} />
                            {showReviews ? 'Ocultar reseñas' : 'Ver reseñas'}
                        </button>
                    )}
                </div>
            </div>

            {showReviews && tutorId && (
                <TutorReviewsList tutorId={tutorId} isOpen={showReviews} />
            )}
        </div>
    );
}
