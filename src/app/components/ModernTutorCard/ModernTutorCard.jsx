'use client';

import React from 'react';
import './ModernTutorCard.css';

export default function ModernTutorCard({ tutor, course, onReservar }) {
    const handleBookNow = () => {
        if (onReservar) {
            onReservar(tutor);
        }
    };

    // Use bio from tutorProfile, fallback to description or generated text
    const tutorBio = tutor?.tutorProfile?.bio || tutor?.description ||
        `Experienced tutor specializing in ${course || 'various courses'}. Proven track record of helping students achieve academic success.`;

    // Get initials for avatar
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

    const initials = getInitials(tutor?.name);

    return (
        <div className="modern-tutor-card">
            <div className="tutor-card-layout">
                {/* Avatar - Left */}
                <div className="tutor-avatar-small">
                    {tutor?.avatarUrl || tutor?.profileImage ? (
                        <img src={tutor.avatarUrl || tutor.profileImage} alt={tutor.name} className="avatar-image-small" />
                    ) : (
                        <span className="avatar-initials-small">{initials}</span>
                    )}
                </div>

                {/* Content - Center */}
                <div className="tutor-content-center">
                    <div className="tutor-header-inline">
                        <h3 className="tutor-name-inline">{tutor.name || 'Tutor'}</h3>
                        {(tutor?.tutorProfile?.review !== undefined || tutor?.rating !== undefined) && (
                            <div className="tutor-rating-inline">
                                <span className="rating-value">{parseFloat(tutor?.tutorProfile?.review || tutor?.rating || 4.5).toFixed(1)}</span>
                                <span className="star-symbol">★</span>
                            </div>
                        )}
                    </div>

                    <p className="tutor-description-inline">
                        {tutorBio}
                    </p>
                </div>

                {/* Button - Right */}
                <button className="book-now-btn-inline" onClick={handleBookNow}>
                    Reservar
                </button>
            </div>
        </div>
    );
}
