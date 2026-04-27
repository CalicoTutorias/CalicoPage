'use client';

import React, { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { MapPin, Star, ArrowLeft, AlertCircle } from 'lucide-react';
import AvailabilityCalendar from '../../components/AvailabilityCalendar/AvailabilityCalendar';
import PageSectionHeader from '../../components/PageSectionHeader/PageSectionHeader';
import './IndividualAvailability.css';
import { useI18n } from '../../../lib/i18n';

function IndividualAvailabilityContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { t } = useI18n();
    
    const tutorId = searchParams.get('tutorId');
    const tutorName = searchParams.get('tutorName');
    const course = searchParams.get('course');
    const courseId = searchParams.get('courseId');
    const location = searchParams.get('location');
    const rating = searchParams.get('rating');

    if (!tutorId || !tutorName) {
        return (
            <div className="individual-availability-container page-container">
                <div className="availability-error-panel">
                    <AlertCircle className="availability-error-panel__icon" />
                    <h3>{t('availability.individual.errorTitle')}</h3>
                    <p>{t('availability.individual.errorText')}</p>
                    <div className="availability-error-panel__actions">
                        <button
                            type="button"
                            className="availability-error-panel__back"
                            onClick={() => router.push('/home/buscar-tutores')}
                        >
                            <ArrowLeft size={20} aria-hidden />
                            {t('availability.individual.back')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const metaBelow =
        location || rating ? (
            <div className="page-section-header__meta-row">
                {location ? (
                    <div className="page-section-header__meta-item">
                        <MapPin size={18} aria-hidden />
                        <span>{location}</span>
                    </div>
                ) : null}
                {rating ? (
                    <div className="page-section-header__meta-item">
                        <Star size={18} aria-hidden />
                        <span>{rating}</span>
                    </div>
                ) : null}
            </div>
        ) : null;

    return (
        <div className="individual-availability-container page-container">
            <PageSectionHeader
                backAction={{
                    onClick: () => router.back(),
                    ariaLabel: t('availability.individual.backShort'),
                }}
                title={tutorName}
                subtitle={course || undefined}
                below={metaBelow}
            />

            <div className="availability-content">
                <AvailabilityCalendar
                    tutorId={tutorId}
                    tutorName={tutorName}
                    course={course}
                    courseId={courseId}
                    mode="individual"
                />
            </div>
        </div>
    );
}

function LoadingFallback() {
    const { t } = useI18n();
    return (
        <div className="individual-availability-container page-container">
            <div className="availability-loading-panel">
                <div className="availability-loading-panel__spinner" />
                <p>{t('availability.individual.loading')}</p>
            </div>
        </div>
    );
}

export default function IndividualAvailabilityPage() {
    return (
        <Suspense fallback={<LoadingFallback />}>
            <IndividualAvailabilityContent />
        </Suspense>
    );
}
