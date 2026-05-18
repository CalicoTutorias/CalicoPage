"use client";

import React from 'react';
import { Star } from 'lucide-react';

/**
 * Single review card. Always shows the course tag — even when the surrounding
 * list is filtered to one course, since visual consistency is more valuable
 * than removing one chip per row.
 *
 * Student name display: first name + last initial (e.g. "María L.") strikes
 * a balance between credibility and privacy. Falls back to "Estudiante" if
 * no name is available.
 */
function getDisplayName(student) {
    const raw = student?.name?.trim();
    if (!raw) return 'Estudiante';
    const parts = raw.split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

function getInitials(name) {
    if (!name) return 'E';
    const parts = String(name).trim().split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
}

export default function ReviewCard({ review }) {
    const displayName = getDisplayName(review.student);
    const courseName = review.course?.name || review.session?.course?.name;

    return (
        <article className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5 space-y-2.5">
            {/* Header: avatar + name on the left, stars on the right */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    {review.student?.profilePictureUrl ? (
                        <img
                            src={review.student.profilePictureUrl}
                            alt={displayName}
                            className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                        />
                    ) : (
                        <div className="w-9 h-9 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                            {getInitials(review.student?.name)}
                        </div>
                    )}
                    <p className="text-sm font-semibold text-gray-900 truncate">
                        {displayName}
                    </p>
                </div>

                <div className="flex items-center gap-0.5 flex-shrink-0">
                    {Array.from({ length: 5 }, (_, i) => (
                        <Star
                            key={i}
                            className={
                                i < (review.rating || 0)
                                    ? 'text-orange-500'
                                    : 'text-gray-200'
                            }
                            fill={i < (review.rating || 0) ? 'currentColor' : 'none'}
                            size={14}
                        />
                    ))}
                </div>
            </div>

            {/* Comment */}
            {review.comment && (
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                    {review.comment}
                </p>
            )}

            {/* Subject tag */}
            {courseName && (
                <div>
                    <span className="inline-flex items-center text-[11px] font-medium text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
                        {courseName}
                    </span>
                </div>
            )}
        </article>
    );
}
