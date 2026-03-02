'use client';

import React from 'react';
import { Star } from 'lucide-react';
import './ModernTutorCard.css';

export default function ModernTutorCard({ tutor, course, onReservar }) {
    const handleBookNow = () => {
        if (onReservar) {
            onReservar(tutor);
        }
    };

    return (
        <div className="modern-tutor-card">
            <div className="tutor-content">
                <div className="tutor-details">
                    <div className="tutor-header">
                        <h3 className="tutor-name">{tutor.name || 'Tutor'}</h3>
                        <div className="tutor-rating">
                            <Star className="star-icon" fill="currentColor" />
                            <span className="rating-value">{tutor.rating || 4.5}</span>
                            <span className="star-symbol">★</span>
                        </div>
                    </div>

                    <p className="tutor-description">
                        {tutor.description ||
                         `Experienced tutor specializing in ${course || 'various courses'}. Proven track record of helping students achieve academic success.`}
                    </p>

                    <div className="tutor-actions">
                        <button className="book-now-btn" onClick={handleBookNow}>
                            Reservar
                        </button>
                    </div>
                </div>

                <div className="tutor-avatar-section">
                    <div className="tutor-avatar">
                        {tutor.avatarUrl ? (
                            <img src={tutor.avatarUrl} alt={tutor.name} className="avatar-image" />
                        ) : (
                            <div className="avatar-placeholder">
                                <span className="avatar-initials">
                                    {(tutor.name || 'T').charAt(0).toUpperCase()}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
