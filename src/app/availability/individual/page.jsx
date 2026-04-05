'use client';

import React, { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { User, MapPin, Calendar, Star, ArrowLeft, AlertCircle } from 'lucide-react';
import AvailabilityCalendar from '../../components/AvailabilityCalendar/AvailabilityCalendar';
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
    
    // DEBUG: Log incoming params
    console.log('[availability/individual] Received params:', {
      tutorId,
      tutorName,
      course,
      courseId,
      location,
      rating,
      fullSearch: searchParams.toString()
    });
    
    if (!tutorId || !tutorName) {
        return (
            <div className="individual-availability-container">
                <div className="error-state">
                    <AlertCircle className="error-icon" />
                    <h3>{t('availability.individual.errorTitle')}</h3>
                    <p>{t('availability.individual.errorText')}</p>
                    <div className="error-actions">
                        <button 
                            className="back-btn"
                            onClick={() => router.push('/home/buscar-tutores')}
                        >
                            <ArrowLeft size={20} />
                            {t('availability.individual.back')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
    
    return (
        <div className="individual-availability-container">
            {/* Header de la página */}
            <div className="page-header">
                <div className="header-content">
                    {/* Botón de regreso */}
                    <div className="header-actions">
                        <button 
                            className="back-button"
                            onClick={() => router.back()}
                        >
                            <ArrowLeft size={20} />
                            {t('availability.individual.backShort')}
                        </button>
                    </div>
                    
                    {/* Información del tutor */}
                    <div className="tutor-info">
                        <div className="tutor-avatar">
                            <User size={32} />
                        </div>
                        <div className="tutor-details">
                            <h1 className="tutor-name">{tutorName}</h1>
                            <div className="tutor-metadata">
                                {course && (
                                    <div className="metadata-item">
                                        <Calendar size={18} />
                                        <span>{course}</span>
                                    </div>
                                )}
                                {location && (
                                    <div className="metadata-item">
                                        <MapPin size={18} />
                                        <span>{location}</span>
                                    </div>
                                )}
                                {rating && (
                                    <div className="metadata-item">
                                        <Star size={18} />
                                        <span>{rating} </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Contenido del calendario */}
            <div className="availability-content">
                {courseId && console.log('[availability/individual] Passing courseId to AvailabilityCalendar:', courseId)}
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
        <div className="individual-availability-container">
            <div className="loading-state">
                <div className="loading-spinner"></div>
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