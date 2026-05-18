"use client";

import React from 'react';
import { Star, Calendar as CalendarIcon, MessageSquare } from 'lucide-react';

function getInitials(name) {
    if (!name) return 'T';
    const parts = String(name).trim().split(' ').filter((p) => p.length > 0);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
}

export default function TutorProfileHeader({ tutor }) {
    const rating = Number(tutor?.rating ?? 0) || 0;
    const numReview = Number(tutor?.numReview ?? 0) || 0;
    const numSessions = Number(tutor?.numSessions ?? 0) || 0;

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Banner */}
            <div className="h-24 sm:h-32 bg-gradient-to-br from-orange-500 via-orange-400 to-amber-300" />

            <div className="px-5 sm:px-8 pb-6">
                {/* Avatar overlapping the banner */}
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 -mt-12 sm:-mt-14 mb-4">
                    <div className="ring-4 ring-white rounded-full bg-white">
                        {tutor?.profilePictureUrl ? (
                            <img
                                src={tutor.profilePictureUrl}
                                alt={tutor.name}
                                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover"
                            />
                        ) : (
                            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-orange-500 flex items-center justify-center text-white text-3xl font-bold">
                                {getInitials(tutor?.name)}
                            </div>
                        )}
                    </div>
                </div>

                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 break-words">
                    {tutor?.name || 'Tutor'}
                </h1>

                {tutor?.bio && (
                    <p className="text-sm text-gray-600 mt-2 leading-relaxed">{tutor.bio}</p>
                )}

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-gray-100">
                    <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-orange-500 mb-1">
                            <Star className="w-4 h-4" fill="currentColor" />
                            <span className="text-lg font-bold">
                                {numReview > 0 ? rating.toFixed(1) : '—'}
                            </span>
                        </div>
                        <p className="text-xs text-gray-500">
                            Calificación general
                        </p>
                    </div>
                    <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-gray-700 mb-1">
                            <CalendarIcon className="w-4 h-4" />
                            <span className="text-lg font-bold">{numSessions}</span>
                        </div>
                        <p className="text-xs text-gray-500">Tutorías dadas</p>
                    </div>
                    <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-gray-700 mb-1">
                            <MessageSquare className="w-4 h-4" />
                            <span className="text-lg font-bold">{numReview}</span>
                        </div>
                        <p className="text-xs text-gray-500">
                            {numReview === 1 ? 'Reseña' : 'Reseñas'}
                        </p>
                    </div>
                </div>

                {tutor?.experienceDescription && (
                    <div className="mt-5 pt-5 border-t border-gray-100">
                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                            Experiencia
                        </h3>
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                            {tutor.experienceDescription}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
