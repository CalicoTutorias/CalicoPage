'use client';

import React from 'react';
import './CourseCard.css';

export default function CourseCard({ course, onFindTutor }) {
    const normalizedCourse = typeof course === 'string'
        ? { nombre: course, codigo: course, name: course }
        : course || {};

    const displayName = normalizedCourse?.nombre || normalizedCourse?.name || normalizedCourse?.codigo || 'Materia';

    return (
        <div className="course-card" onClick={onFindTutor}>
            <div className="course-card-body">
                <h3 className="course-card-name">{displayName}</h3>
                <p className="course-card-desc">
                    {normalizedCourse?.description || `Aprende ${displayName.toLowerCase()} con tutores especializados.`}
                </p>
            </div>
            <button
                className="course-card-btn"
                onClick={(e) => { e.stopPropagation(); onFindTutor(); }}
            >
                Buscar tutor
            </button>
        </div>
    );
}
