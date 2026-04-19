'use client';

import React, { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { UserService } from '../../services/core/UserService';
import './TutorReviewsList.css';

/**
 * TutorReviewsList - Expandable list of reviews for a tutor
 * @param {number} tutorId - Tutor user ID
 * @param {boolean} isOpen - Whether the reviews section is visible
 */
export default function TutorReviewsList({ tutorId, isOpen }) {
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState({ average: 0, count: 0 });
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isOpen || loaded || !tutorId) return;

    async function fetchReviews() {
      setLoading(true);
      const [reviewsRes, statsRes] = await Promise.all([
        UserService.getReviewsReceived(tutorId, 10),
        UserService.getReviewStats(tutorId),
      ]);
      setReviews(reviewsRes.reviews);
      setStats({ average: statsRes.average, count: statsRes.count });
      setLoaded(true);
      setLoading(false);
    }

    fetchReviews();
  }, [isOpen, loaded, tutorId]);

  if (!isOpen) return null;

  if (loading) {
    return (
      <div className="reviews-section">
        <div className="reviews-loading">
          <div className="reviews-spinner" />
          <span>Cargando reseñas...</span>
        </div>
      </div>
    );
  }

  const completedReviews = reviews.filter(r => r.status === 'completed' && r.rating);

  return (
    <div className="reviews-section">
      <div className="reviews-stats">
        <div className="reviews-stats-score">
          <Star className="reviews-star-icon" fill="currentColor" />
          <span className="reviews-avg">{stats.average.toFixed(1)}</span>
        </div>
        <span className="reviews-count">
          {stats.count} {stats.count === 1 ? 'reseña' : 'reseñas'}
        </span>
      </div>

      {completedReviews.length === 0 ? (
        <p className="reviews-empty">Este tutor aún no tiene reseñas.</p>
      ) : (
        <div className="reviews-list">
          {completedReviews.map((review) => (
            <div key={review.id} className="review-item">
              <div className="review-header">
                <div className="review-author">
                  {review.student?.profilePictureUrl ? (
                    <img
                      src={review.student.profilePictureUrl}
                      alt={review.student.name}
                      className="review-avatar"
                    />
                  ) : (
                    <div className="review-avatar-placeholder">
                      {(review.student?.name || 'E').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="review-author-name">{review.student?.name || 'Estudiante'}</span>
                </div>
                <div className="review-rating">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      className={`review-star ${i < review.rating ? 'review-star-filled' : 'review-star-empty'}`}
                      fill={i < review.rating ? 'currentColor' : 'none'}
                      size={14}
                    />
                  ))}
                </div>
              </div>
              {review.comment && (
                <p className="review-comment">{review.comment}</p>
              )}
              {review.session?.course?.name && (
                <span className="review-course">{review.session.course.name}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
