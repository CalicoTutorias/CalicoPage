'use client';

import React from 'react';
import { useI18n } from '../../../lib/i18n';
import './ModernTutorCard.css';

export default function ModernTutorCard({ tutor, course, onReservar }) {
    const { t } = useI18n();

    const handleReserve = () => {
        if (onReservar) {
            onReservar(tutor);
        }
    };

    // Extract tutor information
    const tutorName = tutor?.name || t('tutorCard.tutorFallback');
    const tutorRating = parseFloat(tutor?.tutorProfile?.review) || 0;
    
    // Contextual description logic
    let tutorDescription = '';
    if (course && tutor?.tutorProfile?.tutorCourses) {
        // If course is selected, find experience for this course
        const courseData = tutor.tutorProfile.tutorCourses.find(
            tc => tc.courseId === course || tc.course?.id === course
        );
        tutorDescription = courseData?.experience || tutor?.tutorProfile?.bio || '';
    } else {
        // No course selected, use bio
        tutorDescription = tutor?.tutorProfile?.bio || '';
    }

    // Get initials from name (2 letters)
    const getInitials = (name) => {
        if (!name) return 'T';
        const parts = name.trim().split(' ').filter(p => p.length > 0);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };

    return (
        <div className="modern-tutor-card">
            <div className="tutor-card-container">
                {/* Avatar Section */}
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
                                <span className="avatar-initials">
                                    {getInitials(tutorName)}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Content Section */}
                <div className="tutor-content-wrapper">
                    {/* Header: Name and Rating */}
                    <div className="tutor-header-section">
                        <h3 className="tutor-name">{tutorName}</h3>
                        {tutorRating > 0 && (
                            <div className="tutor-rating-badge">
                                <span className="rating-value">{tutorRating.toFixed(1)}</span>
                                <span className="rating-star">★</span>
                            </div>
                        )}
                    </div>

                    {/* Description */}
                    {tutorDescription && (
                        <p className="tutor-experience">
                            {tutorDescription}
                        </p>
                    )}
                </div>

                {/* Actions - Outside content wrapper, positioned to the right */}
                <div className="tutor-actions">
                    <button 
                        className="reserve-btn"
                        onClick={handleReserve}
                    >
                        {t('availability.tutorCard.reserve')}
                    </button>
                </div>
            </div>
        </div>
    );
}
