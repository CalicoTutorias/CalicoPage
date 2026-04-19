'use client';

import React, { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import AvailabilityCalendar from '../../components/AvailabilityCalendar/AvailabilityCalendar';
import PageSectionHeader from '../../components/PageSectionHeader/PageSectionHeader';
import './JointAvailability.css';
import { useI18n } from '../../../lib/i18n';

function JointAvailabilityContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { t } = useI18n();

    const course = searchParams.get('course');

    if (!course) {
        return (
            <div className="joint-availability-container page-container">
                <div className="availability-error-panel">
                    <AlertCircle className="availability-error-panel__icon" />
                    <h3>{t('availability.joint.errorTitle')}</h3>
                    <p>{t('availability.joint.errorText')}</p>
                    <div className="availability-error-panel__actions">
                        <button
                            type="button"
                            className="availability-error-panel__back"
                            onClick={() => router.push('/home/buscar-tutores')}
                        >
                            <ArrowLeft size={20} aria-hidden />
                            {t('availability.joint.back')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="joint-availability-container page-container">
            <PageSectionHeader
                backAction={{
                    onClick: () => router.back(),
                    ariaLabel: t('common.back'),
                }}
                title={t('availability.joint.title')}
                subtitle={course}
            />

            <div className="availability-content">
                <AvailabilityCalendar course={course} mode="joint" />
            </div>
        </div>
    );
}

function LoadingFallback() {
    const { t } = useI18n();
    return (
        <div className="joint-availability-container page-container">
            <div className="availability-loading-panel">
                <div className="availability-loading-panel__spinner" />
                <p>{t('availability.joint.loading')}</p>
            </div>
        </div>
    );
}

export default function JointAvailabilityPage() {
    return (
        <Suspense fallback={<LoadingFallback />}>
            <JointAvailabilityContent />
        </Suspense>
    );
}
