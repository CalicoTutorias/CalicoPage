'use client';

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { TutorSearchService } from '../../services/utils/TutorSearchService';
import { searchCourses } from '../../services/utils/CourseSearch';
import { useDebounce } from '../../hooks/useDebounce';
import CourseCard from '../../components/CourseCard/CourseCard';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Search } from 'lucide-react';
import ModernTutorCard from '../../components/ModernTutorCard/ModernTutorCard';
import AvailabilityCalendar from '../../components/AvailabilityCalendar/AvailabilityCalendar';
import './BuscarTutores.css';
import { useI18n } from '../../../lib/i18n';
import PageSectionHeader from '../../components/PageSectionHeader/PageSectionHeader';
import CourseAvailabilitySummary from '../../components/CourseAvailabilitySummary/CourseAvailabilitySummary';

function BuscarTutoresContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const { t } = useI18n();
    
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
    const debouncedSearch = useDebounce(searchTerm, 300);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    // Por defecto mostrar materias en la búsqueda
    const [searchType, setSearchType] = useState('courses'); // 'tutors' or 'courses'
    const [tutorsForCourse, setTutorsForCourse] = useState([]);
    const [loadingTutors, setLoadingTutors] = useState(false);
    const [showTutorView, setShowTutorView] = useState(false); // Vista de listado de tutores por materia
    const [showJointCalendar, setShowJointCalendar] = useState(false); // Vista de calendario conjunto (todos los tutores de la materia)
    const [selectedCourseForTutors, setSelectedCourseForTutors] = useState(null); // Materia seleccionada para vista de tutores
    // Por defecto la pestaña activa será 'materias' o según el parámetro tab en la URL
    const [activeTab, setActiveTab] = useState('materias'); // 'tutores' | 'materias'
    const currentSearchParams = searchParams.toString();

    // Leer el parámetro tab de los query params SOLO AL INICIO
    useEffect(() => {
        const tabParam = searchParams.get('tab');
        if (tabParam === 'tutores' || tabParam === 'materias') {
            setActiveTab(tabParam);
        }
    }, []); // Sin dependencias - solo se ejecuta al montar

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
                setResults(searchCourses(coursesArray, debouncedSearch));
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

        // Actualizar parámetro tab - siempre incluirlo
        params.set('tab', activeTab);

        const nextQuery = params.toString();

        if (nextQuery === currentSearchParams) {
            return;
        }

        const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
        router.replace(nextUrl, { scroll: false });
    }, [searchTerm, activeTab, router, pathname, currentSearchParams]);

    const handleFindTutor = async (course) => {
        try {
            setLoadingTutors(true);
            setSelectedCourseForTutors(course);

            // Pasar el curso completo (id/codigo para Firestore users.courses; nombre como respaldo)
            const tutors = await TutorSearchService.getTutorsByCourse(course);
            setTutorsForCourse(tutors);
            setShowTutorView(true);
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
        setShowJointCalendar(false);
        setSelectedCourseForTutors(null);
    };

    const handleDisponibilidadConjunta = () => {
        setShowJointCalendar(true);
        setShowTutorView(false);
    };

    /** Volver desde el calendario conjunto al listado de tutores de esa materia. */
    const handleBackFromEmbeddedCalendar = () => {
        setShowJointCalendar(false);
        setShowTutorView(true);
    };

    const embeddedCourseName =
        typeof selectedCourseForTutors === 'object' && selectedCourseForTutors
            ? selectedCourseForTutors.nombre || selectedCourseForTutors.name || ''
            : typeof selectedCourseForTutors === 'string'
              ? selectedCourseForTutors
              : '';
    const embeddedCourseId =
        typeof selectedCourseForTutors === 'object' && selectedCourseForTutors
            ? selectedCourseForTutors.id || selectedCourseForTutors.codigo || undefined
            : undefined;

    const inCourseAvailabilityFlow =
        showTutorView || showJointCalendar;

    const courseAvailabilitySidebar = (
        <aside
            className="course-availability-shell__sidebar"
            aria-label={t('availability.courseSummary.sectionTitle')}
        >
           
            <CourseAvailabilitySummary
                courseId={embeddedCourseId}
                courseNameFallback={embeddedCourseName || undefined}
            />
        </aside>
    );

    let courseAvailabilityMain = null;
    if (showJointCalendar) {
        courseAvailabilityMain = (
            <>
                <PageSectionHeader
                    sticky
                    className="page-section-header--sticky-high"
                    backAction={{
                        onClick: handleBackFromEmbeddedCalendar,
                        ariaLabel: t('common.back'),
                    }}
                    title={t('availability.joint.title')}
                    subtitle={embeddedCourseName || undefined}
                />
                <AvailabilityCalendar
                    course={embeddedCourseName}
                    courseId={embeddedCourseId || embeddedCourseName || undefined}
                    mode="joint"
                />
            </>
        );
    } else {
        courseAvailabilityMain = (
            <>
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
                            <Button
                                type="button"
                                variant="cta"
                                onClick={handleDisponibilidadConjunta}
                            >
                                {t('search.cta.viewJointAvailability')}
                            </Button>
                        </div>
                    }
                />

                <div className="course-availability-shell__main-body">
                    {loadingTutors ? (
                        <div className="loading-state flex flex-col items-center justify-center py-12 sm:py-16">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 border-4 border-[#FFF8F0] border-t-[#FDAE1E] rounded-full animate-spin mb-4"></div>
                            <p className="text-[#101F24] text-base sm:text-lg">
                                {t('search.courses.loadingTutors')}
                            </p>
                        </div>
                    ) : tutorsForCourse.length === 0 ? (
                        <div className="empty-state flex flex-col items-center justify-center py-12 sm:py-16 bg-white rounded-xl border-2 border-[#FDAE1E]/10 px-4">
                            <div className="text-4xl sm:text-6xl mb-4 sm:mb-6"></div>
                            <h3 className="text-xl sm:text-2xl font-bold text-[#101F24] mb-3 sm:mb-4 text-center">
                                {t('search.courses.noTutorsShort')}
                            </h3>
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
                                    course={
                                        selectedCourseForTutors?.id ||
                                        selectedCourseForTutors?.codigo
                                    }
                                />
                            ))}
                        </div>
                    )}
                </div>
            </>
        );
    }

    return (
        <div className="min-h-screen">
                {inCourseAvailabilityFlow ? (
                    <div className="course-availability-shell course-availability-shell--wide">

                        <div className="course-availability-shell__layout">
                            {courseAvailabilitySidebar}
                            <div className="course-availability-shell__panel course-availability-shell__panel--scroll">
                                {courseAvailabilityMain}
                            </div>
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
                                        <ModernTutorCard
                                            key={tutor.id || tutor.email || index}
                                            tutor={tutor}
                                            course={null}
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
                <div className="page-container !py-6 sm:!py-8">
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
