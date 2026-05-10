"use client";

import React from 'react';
import { BookOpen, User, Calendar } from 'lucide-react';
import { useI18n } from '../../../lib/i18n';

/**
 * Read-only summary card. Lives in the left column on desktop (sticky) and
 * stacks above the form on mobile. All data comes from URL search params via
 * the parent page — this component is purely presentational.
 */
export default function BookingSummary({ session }) {
    const { t, locale } = useI18n();
    const localeStr = locale === 'en' ? 'en-US' : 'es-ES';

    const start = new Date(session.scheduledDateTime);
    const end = new Date(session.endDateTime);
    const formattedDate = start.toLocaleDateString(localeStr, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
    const timeRange = `${start.toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString(localeStr, { hour: '2-digit', minute: '2-digit' })}`;

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
            <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    {t('availability.confirmationModal.course')}
                </h3>
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-5 h-5 text-orange-500" />
                    </div>
                    <p className="font-semibold text-gray-900 text-sm leading-snug pt-1.5 break-words min-w-0">
                        {session.course || '—'}
                    </p>
                </div>
            </div>

            <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    {t('availability.confirmationModal.tutor')}
                </h3>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-gray-400" />
                    </div>
                    <p className="font-medium text-gray-900 text-sm break-words min-w-0">
                        {session.tutorName || session.tutorEmail || '—'}
                    </p>
                </div>
            </div>

            <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    {t('availability.confirmationModal.sessionDetails')}
                </h3>
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Calendar className="w-5 h-5 text-orange-500" />
                    </div>
                    <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">{timeRange}</p>
                        <p className="text-xs text-[#FF8C00] capitalize mt-0.5">{formattedDate}</p>
                    </div>
                </div>
            </div>

            <div className="pt-4 border-t border-gray-100">
                <div className="flex justify-between items-baseline">
                    <span className="text-sm text-gray-500">
                        {t('availability.confirmationModal.total')}
                    </span>
                    <span className="text-xl font-bold text-gray-900">
                        ${session.price ? session.price.toLocaleString() : '50,000'}
                        <span className="text-xs font-normal text-gray-400 ml-1">COP</span>
                    </span>
                </div>
            </div>
        </div>
    );
}
