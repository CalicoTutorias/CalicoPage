'use client';

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { TutorSearchService } from '../../services/utils/TutorSearchService';
import { useAuth } from '../../context/SecureAuthContext';
import { useDebounce } from '../../hooks/useDebounce';
import TutorCard from '../../components/TutorCard/TutorCard';
import CourseCard from '../../components/CourseCard/CourseCard';
import { Input } from '../../../components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Search } from 'lucide-react';
import TutorAvailabilityCard from '../../components/TutorAvailabilityCard/TutorAvailabilityCard';
import ModernTutorCard from '../../components/ModernTutorCard/ModernTutorCard';
import AvailabilityCalendar from '../../components/AvailabilityCalendar/AvailabilityCalendar';
import routes from '../../../routes';
import './BuscarTutores.css';
import { useI18n } from '../../../lib/i18n';
import PageSectionHeader from '../../components/PageSectionHeader/PageSectionHeader';

function BuscarTutoresContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const { user } = useAuth(); const userEmail = user?.email;
    const { t } = useI18n();
    
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
    const debouncedSearch = useDebounce(searchTerm, 300);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    // Por defecto mostrar materias en la búsqueda
    const [searchType, setSearchType] = useState('courses'); // 'tutors' or 'courses'
    const [tutorsForCourse, setTutorsForCourse] = useState([]);
    const [loadingTutors, setLoadingTutors] = useState(false);
    const [showTutorView, setShowTutorView] = useState(false); // Vista de listado de tutores
    const [showIndividualCalendar, setShowIndividualCalendar] = useState(false); // Vista de calendario individual
    const [showJointCalendar, setShowJointCalendar] = useState(false); // Vista de calendario conjunto
    const [selectedCourseForTutors, setSelectedCourseForTutors] = useState(null); // Materia seleccionada para vista de tutores
    const [selectedTutorForCalendar, setSelectedTutorForCalendar] = useState(null); // Tutor seleccionado para calendario individual
    
    // Modal de selección de materia
    const [showCourseSelectionModal, setShowCourseSelectionModal] = useState(false);
    const [selectedTutorForBooking, setSelectedTutorForBooking] = useState(null);

    // Por defecto la pestaña activa será 'materias'
    const [activeTab, setActiveTab] = useState('materias'); // 'tutores' | 'materias'
    const currentSearchParams = searchParams.toString();

    const loadDefaultResults = useCallback(async () => {
        try {
            setLoading(true);

            if (activeTab === 'tutores') {
                const tutors = await TutorSearchService.getAllTutors();
                setResults(Array.isArray(tutors) ? tutors : []);
                setSearchType('tutors');
            } else {
                const courses = await TutorSearchService.getMaterias();
                setResults(Array.isArray(courses) ? courses : []);
                setSearchType('courses');
            }
        } catch (error) {
            console.error('Error cargando resultados:', error);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, [activeTab]);

    const performSearch = useCallback(async () => {
        if (!debouncedSearch) {
            return;
        }

        try {
            setLoading(true);

            if (activeTab === 'tutores') {
                const tutors = await TutorSearchService.searchTutors(debouncedSearch);
                setResults(Array.isArray(tutors) ? tutors : []);
                setSearchType('tutors');
            } else {
                const allCourses = await TutorSearchService.getMaterias();
                const coursesArray = Array.isArray(allCourses) ? allCourses : [];
                const filteredCourses = coursesArray.filter(course => {
                    if (typeof course === 'string') {
                        return course.toLowerCase().includes(debouncedSearch.toLowerCase());
                    }
                    const nombre = course?.nombre || '';
                    const codigo = course?.codigo || '';
                    return nombre.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                           codigo.toLowerCase().includes(debouncedSearch.toLowerCase());
                });
                setResults(filteredCourses);
                setSearchType('courses');
            }
        } catch (error) {
            console.error('Error en búsqueda:', error);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, [activeTab, debouncedSearch]);

    // Búsqueda y resultados por defecto según el estado del buscador
    useEffect(() => {
        if (debouncedSearch) {
            performSearch();
        } else if (!searchTerm) {
            loadDefaultResults();
        }
    }, [debouncedSearch, searchTerm, loadDefaultResults, performSearch]);

    // Actualizar query params
    useEffect(() => {
        const params = new URLSearchParams(currentSearchParams);

        if (searchTerm) {
            params.set('search', searchTerm);
        } else {
            params.delete('search');
        }

        const nextQuery = params.toString();

        if (nextQuery === currentSearchParams) {
            return;
        }

        const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
        router.replace(nextUrl, { scroll: false });
    }, [searchTerm, router, pathname, currentSearchParams]);

    const handleFindTutor = async (course) => {
        try {
            setLoadingTutors(true);
            setSelectedCourseForTutors(course);

            // Pasar el curso completo (id/codigo para Firestore users.courses; nombre como respaldo)
            const tutors = await TutorSearchService.getTutorsByCourse(course);
            setTutorsForCourse(tutors);
            setShowTutorView(true); // Cambiar a la vista de tutores con título "Disponibilidad conjunta"
        } catch (error) {
            console.error('Error cargando tutores:', error);
            setTutorsForCourse([]);
        } finally {
            setLoadingTutors(false);
        }
    };

    const handleBackToCourses = () => {
        setTutorsForCourse([]);
        setShowTutorView(false);
        setShowIndividualCalendar(false);
        setShowJointCalendar(false);
        setSelectedCourseForTutors(null);
        setSelectedTutorForCalendar(null);
    };

    const handleReservarTutor = (tutor) => {
        // If we are in "Find Tutor by Course" mode, we already know the course
        if (selectedCourseForTutors) {
            const courseName = typeof selectedCourseForTutors === 'string' 
                ? selectedCourseForTutors 
                : (selectedCourseForTutors.nombre || selectedCourseForTutors.name);
            
            const courseId = typeof selectedCourseForTutors === 'string'
                ? selectedCourseForTutors
                : (selectedCourseForTutors.id || selectedCourseForTutors.codigo || selectedCourseForTutors.nombre);

            setSelectedTutorForCalendar(tutor);
            // Ensure we pass the course to the calendar view state if needed, 
            // though selectedCourseForTutors is already used in render
            setShowIndividualCalendar(true);
            setShowTutorView(false);
        } else {
            // Fallback to standard booking logic if no course selected (shouldn't happen in this view)
            handleTutorBookNow(tutor);
        }
    };

    const handleDisponibilidadConjunta = () => {
        setShowJointCalendar(true);
        setShowTutorView(false);
    };

    const handleBackToTutorList = () => {
        setShowIndividualCalendar(false);
        setShowJointCalendar(false);
        setShowTutorView(true);
        setSelectedTutorForCalendar(null);
    };

    const handleTutorBookNow = (tutor) => {
        // Normalize courses - prefer enriched 'courses' from TutorSearchService, fallback to tutorProfile.tutorCourses
        const courses = [];
        let courseOptions = [];
        
        console.log('[handleTutorBookNow] tutor object:', { 
            hasEnrichedCourses: !!tutor.courses,
            enrichedCoursesCount: tutor.courses?.length || 0,
            hasTutorCourses: !!tutor.tutorProfile?.tutorCourses,
            tutorCoursesCount: tutor.tutorProfile?.tutorCourses?.length || 0,
            tutor 
        });
        
        // Use enriched 'courses' if available (from TutorSearchService), otherwise fallback
        if (Array.isArray(tutor.courses) && tutor.courses.length > 0) {
            // Enriched courses from TutorSearchService - already have full details with id/courseId
            tutor.courses.forEach(course => {
                const name = course.name || course.nombre || '';
                if (name) courses.push(name);
            });
            courseOptions = tutor.courses;
            console.log('[handleTutorBookNow] Using enriched courses:', courseOptions);
        } else if (tutor.tutorProfile?.tutorCourses && Array.isArray(tutor.tutorProfile.tutorCourses)) {
            // Fallback to tutorCourses (might be strings or partial objects)
            tutor.tutorProfile.tutorCourses.forEach(c => {
                if (typeof c === 'string') {
                    courses.push(c);
                } else if (c.course?.name) {
                    courses.push(c.course.name);
                } else if (c.name) {
                    courses.push(c.name);
                }
            });
            courseOptions = tutor.tutorProfile.tutorCourses;
            console.log('[handleTutorBookNow] Using tutorCourses fallback:', courseOptions);
        }

        // Always ask user to select a course before showing availability
        if (courses.length >= 1) {
            setSelectedTutorForBooking({ ...tutor, normalizedCourses: courses, courseOptions });
            setShowCourseSelectionModal(true);
        } else {
            const courseToUse = courses.length === 1 ? courses[0] : null;
            navigateToAvailability(tutor, courseToUse);
        }
    };

    const navigateToAvailability = (tutor, course, courseObj = null) => {
        // Use tutor ID (uid) first, then id, then email as fallback
        const tutorId = tutor.uid || tutor.id || tutor.email;
        
        // Extract course ID from courseObj - try multiple paths since it could be:
        // 1. Enriched course from TutorSearchService: { id, name, ... }
        // 2. TutorCourse object: { tutorId, courseId, course: { id, name }, ... }
        // 3. String (course name/id)
        let courseId = null;
        
        if (courseObj) {
            if (typeof courseObj === 'string') {
                // It's a string - could be course ID or name
                // Try to match it to a known course ID if possible
                courseId = courseObj;
            } else if (typeof courseObj === 'object') {
                // Try direct courseId property first (TutorCourse object structure)
                courseId = courseObj.courseId;
                
                // Try id property (Enriched course or Course object structure)
                if (!courseId) courseId = courseObj.id;
                
                // Try codigo property (fallback)
                if (!courseId) courseId = courseObj.codigo;
                
                // Try nested course.id (TutorCourse with nested course object)
                if (!courseId && courseObj.course && typeof courseObj.course === 'object') {
                    courseId = courseObj.course.id || courseObj.course.courseId || courseObj.course.codigo;
                }
            }
        }
        
        console.log('[navigateToAvailability] CourseId extraction:', {
            courseObjType: typeof courseObj,
            courseObjectKeys: courseObj && typeof courseObj === 'object' ? Object.keys(courseObj) : null,
            extractedCourseId: courseId,
            courseObj: courseObj ? (typeof courseObj === 'string' ? courseObj : JSON.stringify(courseObj).substring(0, 300)) : null
        });
        
        // Navegar directamente a la disponibilidad individual del tutor
        const params = new URLSearchParams({
            tutorId: tutorId,
            tutorName: tutor.name || 'Tutor',
            ...(course && { course: course }),
            ...(courseId && { courseId: courseId }),
            ...(tutor.location && { location: tutor.location }),
            ...(tutor.rating && { rating: tutor.rating.toString() })
        });
        
        console.log('[navigateToAvailability] Final navigation URL params:', params.toString());
        
        router.push(`${routes.INDIVIDUAL_AVAILABILITY}?${params.toString()}`);
    };

    const handleCourseSelectionConfirm = (courseName, courseObj) => {
        console.log('[DEBUG] handleCourseSelectionConfirm:', {
            courseName,
            courseObj,
            courseObjKeys: courseObj ? Object.keys(courseObj) : null,
            courseObjStructure: courseObj ? {
                courseId: courseObj.courseId,
                id: courseObj.id,
                codigo: courseObj.codigo,
                course: courseObj.course ? {
                    id: courseObj.course.id,
                    courseId: courseObj.course.courseId,
                    codigo: courseObj.course.codigo,
                    name: courseObj.course.name
                } : null
            } : null
        });
        
        if (selectedTutorForBooking) {
            // Pass both course name (for display) and courseObj (for ID extraction)
            navigateToAvailability(selectedTutorForBooking, courseName, courseObj);
            setShowCourseSelectionModal(false);
            setSelectedTutorForBooking(null);
        }
    };

    return (
        <div className="min-h-screen">
            {/* Course Selection Modal */}
            {showCourseSelectionModal && selectedTutorForBooking && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 sm:p-6">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-4 sm:p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4 break-words">
                            {t('search.modal.selectCourse', { tutor: selectedTutorForBooking.name })}
                        </h3>
                        <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                            {t('search.modal.selectCourseDesc')}
                        </p>
                        <div className="space-y-3">
                            {selectedTutorForBooking.normalizedCourses.map((courseName, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleCourseSelectionConfirm(courseName, selectedTutorForBooking.courseOptions?.[idx])}
                                    className="w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg border border-gray-200 hover:border-[#FF8C00] hover:bg-[#FFF8F0] transition-colors flex items-center justify-between group"
                                >
                                    <span className="font-medium text-sm sm:text-base text-gray-700 group-hover:text-[#FF8C00] break-words flex-1">{courseName}</span>
                                    <span className="text-gray-400 group-hover:text-[#FF8C00] ml-2 flex-shrink-0">→</span>
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => {
                                setShowCourseSelectionModal(false);
                                setSelectedTutorForBooking(null);
                            }}
                            className="mt-4 sm:mt-6 w-full py-2.5 sm:py-2 text-gray-500 hover:text-gray-700 font-medium text-sm sm:text-base"
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </div>
            )}

                {/* Vista de calendario individual */}
                {showIndividualCalendar ? (
                    <div className="page-container">
                        <PageSectionHeader
                            sticky
                            backAction={{
                                onClick: handleBackToTutorList,
                                ariaLabel: t('common.back'),
                            }}
                            title={t('search.calendar.individualTitle', { tutor: selectedTutorForCalendar?.name })}
                            subtitle={
                                selectedCourseForTutors?.nombre ||
                                selectedCourseForTutors?.name ||
                                undefined
                            }
                        />
                        <AvailabilityCalendar 
                            tutorId={selectedTutorForCalendar?.uid || selectedTutorForCalendar?.id || selectedTutorForCalendar?.email}
                            tutorName={selectedTutorForCalendar?.name}
                            course={selectedCourseForTutors?.nombre || selectedCourseForTutors?.name}
                            courseId={selectedCourseForTutors?.id || selectedCourseForTutors?.codigo || selectedCourseForTutors?.nombre || selectedCourseForTutors?.name}
                            mode="individual"
                        />
                    </div>
                ) : showJointCalendar ? (
                    <div className="page-container">
                        <PageSectionHeader
                            sticky
                            className="page-section-header--sticky-high"
                            backAction={{
                                onClick: handleBackToTutorList,
                                ariaLabel: t('common.back'),
                            }}
                            title={t('search.calendar.jointTitle')}
                            subtitle={
                                [selectedCourseForTutors?.nombre || selectedCourseForTutors?.name, t('common.allTutors')]
                                    .filter(Boolean)
                                    .join(' — ')
                            }
                        />
                        <AvailabilityCalendar 
                            course={selectedCourseForTutors?.nombre || selectedCourseForTutors?.name}
                            courseId={typeof selectedCourseForTutors === 'object' && selectedCourseForTutors
                                ? (selectedCourseForTutors.id || selectedCourseForTutors.codigo)
                                : null}
                            mode="joint"
                        />
                    </div>
                ) : showTutorView ? (
                    <div className="page-container">
                        <PageSectionHeader
                            sticky
                            backAction={{
                                onClick: handleBackToCourses,
                                ariaLabel: t('common.back'),
                            }}
                            title={t('search.calendar.jointTitle')}
                            below={
                                <div className="page-section-header__cta-strip">
                                    <div>
                                        <h3>{t('search.cta.seeCombinedSchedules')}</h3>
                                        <p>
                                            {t('search.cta.availabilityOfAllTutors', {
                                                course:
                                                    selectedCourseForTutors?.nombre ||
                                                    selectedCourseForTutors?.name,
                                            })}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        className="page-section-header__cta-btn"
                                        onClick={handleDisponibilidadConjunta}
                                    >
                                        {t('search.cta.viewJointAvailability')}
                                    </button>
                                </div>
                            }
                        />

                        {/* Lista de tutores */}
                        <div>
                            {loadingTutors ? (
                                <div className="loading-state flex flex-col items-center justify-center py-12 sm:py-16">
                                    <div className="w-10 h-10 sm:w-12 sm:h-12 border-4 border-[#FFF8F0] border-t-[#FDAE1E] rounded-full animate-spin mb-4"></div>
                                    <p className="text-[#101F24] text-base sm:text-lg">{t('search.courses.loadingTutors')}</p>
                                </div>
                            ) : tutorsForCourse.length === 0 ? (
                                <div className="empty-state flex flex-col items-center justify-center py-12 sm:py-16 bg-white rounded-xl border-2 border-[#FDAE1E]/10 px-4">
                                    <div className="text-4xl sm:text-6xl mb-4 sm:mb-6"></div>
                                    <h3 className="text-xl sm:text-2xl font-bold text-[#101F24] mb-3 sm:mb-4 text-center">{t('search.courses.noTutorsShort')}</h3>
                                    <p className="text-[#6B7280] text-sm sm:text-lg max-w-md text-center">
                                        {t('search.courses.noTutors')}
                                    </p>
                                </div>
                            ) : (
                                <div className="tutors-list space-y-4 sm:space-y-6">
                                    {tutorsForCourse.map((tutor, index) => (
                                        <ModernTutorCard
                                            key={`${tutor.email}-${index}`}
                                            tutor={tutor}
                                            course={selectedCourseForTutors?.nombre || selectedCourseForTutors?.name}
                                            onReservar={handleReservarTutor}
                                            onFavorite={(tutor) => console.log('Favorito:', tutor.name)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="page-container">
                        <PageSectionHeader
                            title={t('search.header.title')}
                            subtitle={t('search.header.subtitle')}
                        />
                        {/* Búsqueda */}
                        <div className="search-wrapper">
                            <div className="search-container">
                                <Search className="search-icon" />
                                <Input
                                    type="text"
                                    placeholder={t('search.placeholders.search')}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onFocus={() => setActiveTab('materias')}
                                    className="search-input"
                                />
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="tabs-wrapper">
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="tabs-container">
                                <TabsList className="tabs-list">
                                    <TabsTrigger value="tutores" className="tab-trigger">{t('search.tabs.tutors')}</TabsTrigger>
                                    <TabsTrigger value="materias" className="tab-trigger">{t('search.tabs.courses')}</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>

                        {/* Resultados */}
                        {loading ? (
                            <div className="results-loading">
                                <div className="loading-spinner"></div>
                                <p className="loading-text">{t('search.states.searching')}</p>
                            </div>
                        ) : results.length === 0 ? (
                            <div className="results-empty">
                                <p className="empty-text">{searchTerm ? t('search.states.noResults') : t('search.states.start')}</p>
                            </div>
                        ) : (
                            <div className={searchType === 'courses' ? 'course-cards-grid' : 'results-container'}>
                                {searchType === 'tutors' ? (
                                    results.map((tutor, index) => (
                                        <TutorCard
                                            key={tutor.id || tutor.email || index}
                                            tutor={tutor}
                                            onBookNow={() => handleTutorBookNow(tutor)}
                                        />
                                    ))
                                ) : (
                                    results.map((course, index) => {
                                        const courseKey = typeof course === 'string'
                                            ? course
                                            : (course?.codigo || course?.nombre || course?.name || index);
                                        return (
                                            <CourseCard
                                                key={courseKey}
                                                course={course}
                                                onFindTutor={() => handleFindTutor(course)}
                                            />
                                        );
                                    })
                                )}
                            </div>
                        )}
                        </div>
                    </>
                )}
        </div>
    );
}

export default function BuscarTutores() {
    return (
        <Suspense fallback={
            <div className="min-h-screen">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                    <div className="text-center py-8 sm:py-12">
                        <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-[#FF8C00] mx-auto"></div>
                        <p className="mt-4 text-gray-600 text-sm sm:text-base">Cargando...</p>
                    </div>
                </div>
            </div>
        }>
            <BuscarTutoresContent />
        </Suspense>
    );
}
