'use client';

import React, { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import TutorReviewsList from '../TutorReviewsList/TutorReviewsList';
import './ModernTutorCard.css';

export default function ModernTutorCard({ tutor, course, onReservar }) {
    const [showReviews, setShowReviews] = useState(false);

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
    const tutorId = tutor?.uid || tutor?.id;

    // Use bio from tutorProfile, fallback to description or generated text
    const tutorBio = tutor?.tutorProfile?.bio || tutor?.description ||
        `Experienced tutor specializing in ${course || 'various courses'}. Proven track record of helping students achieve academic success.`;

    // Get rating from tutorProfile.review or fallback to tutor.rating
    const tutorRating = tutor?.tutorProfile?.review ? parseFloat(tutor.tutorProfile.review) :
                        tutor?.rating ? parseFloat(tutor.rating) : null;

    const handleReservar = () => {
        if (onReservar) {
            onReservar(tutor);
        }
    };

    return (
        <div className="modern-tutor-card">
            <div className="tutor-card-layout">
                {/* Avatar - Left */}
                <div className="tutor-avatar-small">
                    {tutor?.avatarUrl || tutor?.profileImage || tutor?.profilePictureUrl ? (
                        <img
                            src={tutor.avatarUrl || tutor.profileImage || tutor.profilePictureUrl}
                            alt={tutorName}
                            className="avatar-image-small"
                        />
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
                    <button className="book-now-btn-inline" onClick={handleReservar}>
                        Reservar
                    </button>
                    {tutorId && (
                        <button
                            className="see-reviews-btn"
                            onClick={() => setShowReviews(!showReviews)}
                        >
                            <MessageSquare size={16} />
                            {showReviews ? 'Ocultar reseñas' : 'Ver reseñas'}
                        </button>
                    )}
                </div>
            </div>

            {showReviews && tutorId && (
                <TutorReviewsList tutorId={tutorId} />
            )}
        </div>
    );
}
