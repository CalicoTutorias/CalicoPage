'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Search } from 'lucide-react';
import { TutorSearchService } from '../../services/utils/TutorSearchService';
import ModernTutorCard from '../../components/ModernTutorCard/ModernTutorCard';
import { useI18n } from '../../../lib/i18n';
import './FindTutorView.css';

export default function FindTutorView() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { t } = useI18n();
    const [tutors, setTutors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredTutors, setFilteredTutors] = useState([]);
    
    const course = searchParams.get('course');

    useEffect(() => {
        loadTutors();
    }, [course]);

    useEffect(() => {
        filterTutors();
    }, [searchTerm, tutors]);

    const loadTutors = async () => {
        try {
            setLoading(true);
            let tutorData = [];
            
            if (course) {
                // Buscar tutores por materia específica
                tutorData = await TutorSearchService.searchTutorsByCourse(course);
            } else {
                // Cargar todos los tutores
                tutorData = await TutorSearchService.getAllTutors();
            }
            
            setTutors(tutorData);
            setFilteredTutors(tutorData);
        } catch (error) {
            console.error('Error loading tutors:', error);
            setTutors([]);
            setFilteredTutors([]);
        } finally {
            setLoading(false);
        }
    };

    const filterTutors = () => {
        if (!searchTerm.trim()) {
            setFilteredTutors(tutors);
            return;
        }

        const filtered = tutors.filter(tutor =>
            tutor.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            tutor.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            tutor.tutorProfile?.tutorCourses?.some(sub => 
                sub.toLowerCase().includes(searchTerm.toLowerCase())
            )
        );
        
        setFilteredTutors(filtered);
    };

    const handleBack = () => {
        router.back();
    };

    const handleAutoAssign = () => {
        // Implementar auto-asignación
        console.log('Auto-assign tutor');
    };

    return (
        <div className="find-tutor-container">
            {/* Header */}
            <div className="find-tutor-header">
                <div className="header-content">
                    <button 
                        className="back-button"
                        onClick={handleBack}
                    >
                        <ArrowLeft size={24} />
                    </button>
                    
                    <h1 className="page-title">{t('findTutor.title')}</h1>
                </div>
                
                {/* Auto-Assign Section */}
                <div className="auto-assign-section">
                    <span className="auto-assign-label">{t('findTutor.autoAssign')}</span>
                    <button 
                        className="auto-assign-button"
                        onClick={handleAutoAssign}
                    >
                        <ArrowLeft size={20} className="auto-assign-arrow" />
                    </button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="search-section">
                <div className="search-container">
                    <Search className="search-icon" size={20} />
                    <input
                        type="text"
                        placeholder={t('findTutor.searchPlaceholder')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                    />
                </div>
            </div>

            {/* Content */}
            <div className="tutors-content">
                {loading ? (
                    <div className="loading-state">
                        <div className="loading-spinner"></div>
                        <p>{t('findTutor.loading')}</p>
                    </div>
                ) : filteredTutors.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon"></div>
                        <h3>{t('findTutor.emptyStates.noTutorsFound')}</h3>
                        <p>
                            {searchTerm 
                                ? t('findTutor.emptyStates.noMatch', { term: searchTerm })
                                : course 
                                    ? t('findTutor.emptyStates.noCourse', { course })
                                    : t('findTutor.emptyStates.noAvailable')
                            }
                        </p>
                    </div>
                ) : (
                    <div className="tutors-list">
                        {filteredTutors.map((tutor, index) => (
                            <ModernTutorCard
                                key={tutor.id || tutor.email || index}
                                tutor={tutor}
                                course={course}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}