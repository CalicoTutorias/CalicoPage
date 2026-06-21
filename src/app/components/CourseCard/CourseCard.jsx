'use client';

import React from 'react';
import { BookOpen, SearchX } from 'lucide-react';
import { useI18n } from '../../../lib/i18n';
import './CourseCard.css';

export default function CourseCard({ course, tutorCount, onFindTutor }) {
    const { t } = useI18n();
    const normalizedCourse = typeof course === 'string'
        ? { nombre: course, codigo: course, name: course }
        : course || {};

    const displayName = normalizedCourse?.nombre || normalizedCourse?.name || normalizedCourse?.codigo || 'Materia';
    const availableTutorCount = Number(tutorCount ?? normalizedCourse?._count?.tutorCourses ?? 0) || 0;
    const hasTutors = availableTutorCount > 0;
    const unavailableLabel = t('courseCard.noTutorsAvailable');

    return (
        <div
            className={`course-card${hasTutors ? '' : ' course-card--unavailable'}`}
            onClick={onFindTutor}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onFindTutor();
                }
            }}
        >
            <div className="course-card-body">
                <div className="course-card-icon" aria-hidden>
                    {hasTutors ? <BookOpen size={22} /> : <SearchX size={22} />}
                </div>
                <h3 className="course-card-name">{displayName}</h3>
                <p className="course-card-desc">
                    {normalizedCourse?.description || t('courseCard.defaultDescription', { course: displayName.toLowerCase() })}
                </p>
                {!hasTutors ? (
                    <p className="course-card-unavailable-note">{unavailableLabel}</p>
                ) : null}
            </div>
            <button
                className="course-card-btn"
                onClick={(e) => { e.stopPropagation(); onFindTutor(); }}
            >
                {t('courseCard.findTutor')}
            </button>
        </div>
    );
}
