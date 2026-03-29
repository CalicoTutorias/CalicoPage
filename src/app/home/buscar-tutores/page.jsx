'use client';

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { TutorSearchService } from '../../services/utils/TutorSearchService';
import { useUser } from '../../hooks/useUser';
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

function BuscarTutoresContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const { email: userEmail } = useUser();
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
    const [activeTab, setActiveTab] = useState('materias'); // 'tutores', 'materias', 'ambos'
    const currentSearchParams = searchParams.toString();

    const loadDefaultResults = useCallback(async () => {
        try {
            setLoading(true);

            if (activeTab === 'tutores') {
                const tutors = await TutorSearchService.getAllTutors();
                setResults(Array.isArray(tutors) ? tutors : []);
                setSearchType('tutors');
            } else if (activeTab === 'materias') {
                const courses = await TutorSearchService.getMaterias();
                setResults(Array.isArray(courses) ? courses : []);
                setSearchType('courses');
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
            } else if (activeTab === 'materias') {
                const allCourses = await TutorSearchService.getMaterias();
                const coursesArray = Array.isArray(allCourses) ? allCourses : [];
                const filteredCourses = coursesArray.filter(course => {
                    // Handle both string and object formats
                    if (typeof course === 'string') {
                        return course.toLowerCase().includes(debouncedSearch.toLowerCase());
                    }
                    // Handle object format (if backend changes in the future)
                    const nombre = course?.nombre || '';
                    const codigo = course?.codigo || '';
                    return nombre.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                           codigo.toLowerCase().includes(debouncedSearch.toLowerCase());
                });
                setResults(filteredCourses);
                setSearchType('courses');
            } else {
                const tutors = await TutorSearchService.searchTutors(debouncedSearch);
                const tutorsArray = Array.isArray(tutors) ? tutors : [];

                if (tutorsArray.length > 0) {
                    setResults(tutorsArray);
                    setSearchType('tutors');
                } else {
                    const allCourses = await TutorSearchService.getMaterias();
                    const coursesArray = Array.isArray(allCourses) ? allCourses : [];
                    const filteredCourses = coursesArray.filter(course => {
                        // Handle both string and object formats
                        if (typeof course === 'string') {
                            return course.toLowerCase().includes(debouncedSearch.toLowerCase());
                        }
                        // Handle object format (if backend changes in the future)
                        const nombre = course?.nombre || '';
                        const codigo = course?.codigo || '';
                        return nombre.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                               codigo.toLowerCase().includes(debouncedSearch.toLowerCase());
                    });
                    setResults(filteredCourses);
                    setSearchType('courses');
                }
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
        // Normalize courses
        const courses = [];
        if (tutor.courses) {
            if (Array.isArray(tutor.courses)) {
                tutor.courses.forEach(c => {
                    // Extract name if object, otherwise use string
                    // If it's an object, prefer 'nombre' or 'name', fallback to 'codigo' or 'id'
                    const name = typeof c === 'object' ? (c.nombre || c.name || c.codigo || c.id) : String(c);
                    if (name) courses.push(name);
                });
            } else if (typeof tutor.courses === 'string') {
                courses.push(tutor.courses);
            }
        }

        // If tutor has multiple courses, ask user to select one
        if (courses.length > 1) {
            // Pass the full course objects if available, or strings
            const courseOptions = Array.isArray(tutor.courses) ? tutor.courses : courses;
            setSelectedTutorForBooking({ ...tutor, normalizedCourses: courses, courseOptions });
            setShowCourseSelectionModal(true);
        } else {
            // If only one course or none, proceed directly
            const courseToUse = courses.length === 1 ? courses[0] : null;
            navigateToAvailability(tutor, courseToUse);
        }
    };

    const navigateToAvailability = (tutor, course) => {
        // Use tutor ID (uid) first, then id, then email as fallback
        const tutorId = tutor.uid || tutor.id || tutor.email;
        
        // Navegar directamente a la disponibilidad individual del tutor
        const params = new URLSearchParams({
            tutorId: tutorId,
            tutorName: tutor.name || 'Tutor',
            ...(course && { course: course }),
            ...(tutor.location && { location: tutor.location }),
            ...(tutor.rating && { rating: tutor.rating.toString() })
        });
        
        router.push(`${routes.INDIVIDUAL_AVAILABILITY}?${params.toString()}`);
    };

    const handleCourseSelectionConfirm = (courseName, courseObj) => {
        if (selectedTutorForBooking) {
            // If we have the full course object, we can pass the ID too if needed
            // But navigateToAvailability mainly takes the name for display
            // We could enhance navigateToAvailability to take an ID
            navigateToAvailability(selectedTutorForBooking, courseName);
            setShowCourseSelectionModal(false);
            setSelectedTutorForBooking(null);
        }
    };

    return (
        <div className="min-h-screen bg-white">
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

            <div className="page-container">
                {/* Vista de calendario individual */}
                {showIndividualCalendar ? (
                    <div className="min-h-screen bg-[#FFF8F0]">
                        {/* Header del calendario individual - Sticky */}
                        <div className="sticky top-0 z-30 bg-white rounded-lg shadow-sm mb-4 sm:mb-6 md:mb-8 p-4 sm:p-5 md:p-6">
                            <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                                <button 
                                    className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg border-2 border-[#FDAE1E] text-[#FF9505] hover:bg-[#FFF8F0] transition-all duration-300 flex-shrink-0"
                                    onClick={handleBackToTutorList}
                                >
                                    ←
                                </button>
                                <div className="flex-1 min-w-0">
                                    <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-[#101F24] leading-tight break-words">
                                        {t('search.calendar.individualTitle', { tutor: selectedTutorForCalendar?.name })}
                                    </h1>
                                    <p className="text-sm sm:text-base text-[#6B7280] mt-1 break-words">
                                        {selectedCourseForTutors?.nombre || selectedCourseForTutors?.name}
                                    </p>
                                </div>
                            </div>
                        </div>
                        
                        {/* Componente de calendario individual */}
                        <AvailabilityCalendar 
                            tutorId={selectedTutorForCalendar?.uid || selectedTutorForCalendar?.id || selectedTutorForCalendar?.email}
                            tutorName={selectedTutorForCalendar?.name}
                            course={selectedCourseForTutors?.nombre || selectedCourseForTutors?.name}
                            courseId={selectedCourseForTutors?.id || selectedCourseForTutors?.codigo || selectedCourseForTutors?.nombre || selectedCourseForTutors?.name}
                            mode="individual"
                        />
                    </div>
                ) : showJointCalendar ? (
                    <div className="min-h-screen bg-[#FFF8F0]">
                        {/* Header del calendario conjunto - Sticky */}
                        <div className="sticky top-0 z-40 bg-white rounded-lg shadow-sm mb-4 sm:mb-6 md:mb-8 p-4 sm:p-5 md:p-6">
                            <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                                <button 
                                    className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg border-2 border-[#FDAE1E] text-[#FF9505] hover:bg-[#FFF8F0] transition-all duration-300 flex-shrink-0"
                                    onClick={handleBackToTutorList}
                                >
                                    ←
                                </button>
                                <div className="flex-1 min-w-0">
                                    <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-[#101F24] leading-tight break-words">
                                        {t('search.calendar.jointTitle')}
                                    </h1>
                                    <p className="text-sm sm:text-base text-[#6B7280] mt-1 break-words">
                                        {selectedCourseForTutors?.nombre || selectedCourseForTutors?.name} - {t('common.allTutors')}
                                    </p>
                                </div>
                            </div>
                        </div>
                        
                        {/* Componente de calendario conjunto */}
                        <AvailabilityCalendar 
                            course={selectedCourseForTutors?.nombre || selectedCourseForTutors?.name}
                            courseId={typeof selectedCourseForTutors === 'object' && selectedCourseForTutors
                                ? (selectedCourseForTutors.id || selectedCourseForTutors.codigo)
                                : null}
                            mode="joint"
                        />
                    </div>
                ) : showTutorView ? (
                    <div className="min-h-screen bg-[#FFF8F0]">
                        {/* Header de disponibilidad conjunta - Sticky */}
                        <div className="sticky top-0 z-30 bg-white rounded-lg shadow-sm mb-4 sm:mb-6 md:mb-8">
                            <div className="p-4 sm:p-5 md:p-6">
                                <div className="flex items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-5 md:mb-6">
                                    <button 
                                        className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg border-2 border-[#FDAE1E] text-[#FF9505] hover:bg-[#FFF8F0] transition-all duration-300 flex-shrink-0"
                                        onClick={handleBackToCourses}
                                    >
                                        ←
                                    </button>
                                    <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-[#101F24] leading-tight break-words flex-1">
                                        {t('search.calendar.jointTitle')}
                                    </h1>
                                </div>
                                
                                {/* Botón de disponibilidad conjunta */}
                                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-[#FFF8F0] p-4 sm:p-5 rounded-lg border-2 border-[#FDAE1E]/20">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-base sm:text-lg font-semibold text-[#101F24] mb-1 sm:mb-0 break-words">
                                            {t('search.cta.seeCombinedSchedules')}
                                        </h3>
                                        <p className="text-sm sm:text-base text-[#6B7280] break-words">
                                            {t('search.cta.availabilityOfAllTutors', { course: selectedCourseForTutors?.nombre || selectedCourseForTutors?.name })}
                                        </p>
                                    </div>
                                    <button 
                                        className="bg-gradient-to-r from-[#FDAE1E] to-[#FF9505] text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-semibold hover:shadow-lg transition-all duration-300 transform hover:scale-105 whitespace-nowrap text-sm sm:text-base flex-shrink-0"
                                        onClick={handleDisponibilidadConjunta}
                                    >
                                        {t('search.cta.viewJointAvailability')}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Lista de tutores */}
                        <div className="px-4 sm:px-6">
                            {loadingTutors ? (
                                <div className="loading-state flex flex-col items-center justify-center py-12 sm:py-16">
                                    <div className="w-10 h-10 sm:w-12 sm:h-12 border-4 border-[#FFF8F0] border-t-[#FDAE1E] rounded-full animate-spin mb-4"></div>
                                    <p className="text-[#101F24] text-base sm:text-lg">{t('search.courses.loadingTutors')}</p>
                                </div>
                            ) : tutorsForCourse.length === 0 ? (
                                <div className="empty-state flex flex-col items-center justify-center py-12 sm:py-16 bg-white rounded-xl border-2 border-[#FDAE1E]/10 px-4">
                                    <div className="text-4xl sm:text-6xl mb-4 sm:mb-6">🔍</div>
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
                                    <TabsTrigger value="ambos" className="tab-trigger">{t('search.tabs.both')}</TabsTrigger>
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
                            <div className="results-container">
                                {searchType === 'tutors' ? (
                                    // Mostrar tutores
                                    results.map((tutor, index) => (
                                        <TutorCard
                                            key={tutor.id || tutor.email || index}
                                            tutor={tutor}
                                            onBookNow={() => handleTutorBookNow(tutor)}
                                        />
                                    ))
                                ) : (
                                    // Mostrar materias
                                    results.map((course, index) => {
                                        // Handle both string and object formats for key
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
                    </>
                )}
            </div>
        </div>
    );
}

export default function BuscarTutores() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-white">
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
