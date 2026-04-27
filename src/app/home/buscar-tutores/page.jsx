'use client';

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { TutorSearchService } from '../../services/utils/TutorSearchService';
import { useDebounce } from '../../hooks/useDebounce';
import TutorCard from '../../components/TutorCard/TutorCard';
import CourseCard from '../../components/CourseCard/CourseCard';
import { Input } from '../../../components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Search } from 'lucide-react';
import ModernTutorCard from '../../components/ModernTutorCard/ModernTutorCard';
import AvailabilityCalendar from '../../components/AvailabilityCalendar/AvailabilityCalendar';
import './BuscarTutores.css';
import { useI18n } from '../../../lib/i18n';
import PageSectionHeader from '../../components/PageSectionHeader/PageSectionHeader';
import CourseAvailabilitySummary from '../../components/CourseAvailabilitySummary/CourseAvailabilitySummary';

/** Objeto/string materia compatible con getTutorsByCourse y resumen lateral. */
function courseRecordFromModalSelection(courseName, courseObj) {
    if (courseObj && typeof courseObj === 'object') {
        const nested =
            courseObj.course && typeof courseObj.course === 'object' ? courseObj.course : {};
        const id =
            courseObj.id ||
            courseObj.courseId ||
            nested.id ||
            courseObj.codigo ||
            nested.codigo ||
            undefined;
        const nombre =
            (typeof courseName === 'string' && courseName.trim()) ||
            courseObj.name ||
            courseObj.nombre ||
            nested.name ||
            nested.nombre ||
            '';
        const codigo = courseObj.codigo || nested.codigo || id;
        if (id || nombre) {
            return { id, nombre, name: nombre, codigo };
        }
    }
    if (typeof courseName === 'string' && courseName.trim()) {
        return courseName.trim();
    }
    return null;
}

function syncCourseLabelFromEntry(entry) {
    if (entry == null) return '';
    if (typeof entry === 'string') return entry.trim();
    const direct =
        entry.name ||
        entry.nombre ||
        entry.course?.name ||
        entry.course?.nombre ||
        '';
    return typeof direct === 'string' ? direct.trim() : '';
}

function courseIdFromTutorCourseEntry(entry) {
    if (entry == null) return null;
    if (typeof entry === 'string') {
        const s = entry.trim();
        return s || null;
    }
    const id = entry.courseId || entry.course?.id || entry.id || null;
    return typeof id === 'string' && id.trim() ? id.trim() : id || null;
}

/** Encabezado del modal de selección de materia (evita IIFE en el árbol principal). */
function CourseSelectionModalIntro({ tutorBooking, t }) {
    const n =
        tutorBooking.normalizedCourses?.length ??
        tutorBooking.courseOptions?.length ??
        0;
    const tutorName = tutorBooking.name;

    if (n === 0) {
        return (
            <>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4 break-words">
                    {t('search.modal.noCoursesTitle')}
                </h3>
                <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                    {t('search.modal.noCoursesDesc')}
                </p>
            </>
        );
    }

    return (
        <>
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4 break-words">
                {n === 1
                    ? t('search.modal.selectCourseSingle', { tutor: tutorName })
                    : t('search.modal.selectCourse', { tutor: tutorName })}
            </h3>
            <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                {n === 1
                    ? t('search.modal.selectCourseSingleDesc')
                    : t('search.modal.selectCourseDesc')}
            </p>
        </>
    );
}

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
    const [showTutorView, setShowTutorView] = useState(false); // Vista de listado de tutores
    const [showIndividualCalendar, setShowIndividualCalendar] = useState(false); // Vista de calendario individual
    const [showJointCalendar, setShowJointCalendar] = useState(false); // Vista de calendario conjunto
    const [selectedCourseForTutors, setSelectedCourseForTutors] = useState(null); // Materia seleccionada para vista de tutores
    const [selectedTutorForCalendar, setSelectedTutorForCalendar] = useState(null); // Tutor seleccionado para calendario individual
    
    // Modal de selección de materia
    const [showCourseSelectionModal, setShowCourseSelectionModal] = useState(false);
    const [selectedTutorForBooking, setSelectedTutorForBooking] = useState(null);
    /** Carga al confirmar materia desde el modal (transición al mismo flujo que “Buscar tutor” por materia) */
    const [loadingCourseFlowTransition, setLoadingCourseFlowTransition] = useState(false);
    /** Origen del flujo de disponibilidad: lista por materia vs. tutor elegido desde pestaña tutores + modal */
    const [availabilityEntry, setAvailabilityEntry] = useState(null); // 'materias' | 'tutorModal' | null
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
            setAvailabilityEntry('materias');

            // Pasar el curso completo (id/codigo para Firestore users.courses; nombre como respaldo)
            const tutors = await TutorSearchService.getTutorsByCourse(course);
            setTutorsForCourse(tutors);
            setShowTutorView(true); // Cambiar a la vista de tutores con título "Disponibilidad conjunta"
        } catch (error) {
            console.error('Error cargando tutores:', error);
            setTutorsForCourse([]);
            setAvailabilityEntry(null);
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
        setAvailabilityEntry(null);
    };

    const handleReservarTutor = (tutor) => {
        if (selectedCourseForTutors) {
            setSelectedTutorForCalendar(tutor);
            setShowIndividualCalendar(true);
            setShowTutorView(false);
            return;
        }
        handleTutorBookNow(tutor);
    };

    const handleDisponibilidadConjunta = () => {
        setShowJointCalendar(true);
        setShowTutorView(false);
    };

    /** Desde calendario embebido: volver al listado por materia o salir al buscador si el tutor vino del modal */
    const handleBackFromEmbeddedCalendar = () => {
        setShowIndividualCalendar(false);
        setShowJointCalendar(false);
        if (availabilityEntry === 'tutorModal') {
            handleBackToCourses();
            return;
        }
        setShowTutorView(true);
        setSelectedTutorForCalendar(null);
    };

    const handleTutorBookNow = async (tutor) => {
        let courseOptions = [];
        if (Array.isArray(tutor.courses) && tutor.courses.length > 0) {
            courseOptions = tutor.courses;
        } else if (
            tutor.tutorProfile?.tutorCourses &&
            Array.isArray(tutor.tutorProfile.tutorCourses)
        ) {
            courseOptions = tutor.tutorProfile.tutorCourses;
        }

        const idsToResolve = [
            ...new Set(
                courseOptions
                    .map((entry) => {
                        if (syncCourseLabelFromEntry(entry)) return null;
                        return courseIdFromTutorCourseEntry(entry);
                    })
                    .filter(Boolean)
            ),
        ];

        let catalogById = {};
        if (idsToResolve.length > 0) {
            try {
                const details = await TutorSearchService.getMateriasWithDetails(idsToResolve);
                catalogById = Object.fromEntries(
                    idsToResolve.map((id, i) => [id, details[i]])
                );
            } catch (e) {
                console.error('[handleTutorBookNow] getMateriasWithDetails:', e);
            }
        }

        const normalizedCourses = courseOptions.map((entry) => {
            const direct = syncCourseLabelFromEntry(entry);
            if (direct) return direct;
            const cid = courseIdFromTutorCourseEntry(entry);
            const row = cid ? catalogById[cid] : null;
            if (row && (row.nombre || row.name)) {
                return String(row.nombre || row.name);
            }
            if (cid) return String(cid);
            return t('search.modal.unnamedCourse');
        });

        setSelectedTutorForBooking({
            ...tutor,
            normalizedCourses,
            courseOptions,
        });
        setShowCourseSelectionModal(true);
    };

    const handleCourseSelectionConfirm = (courseName, courseObj) => {
        if (!selectedTutorForBooking) return;

        const courseRecord = courseRecordFromModalSelection(courseName, courseObj);
        if (!courseRecord) {
            return;
        }

        const {
            normalizedCourses: _rm,
            courseOptions: _ro,
            ...tutorForCalendar
        } = selectedTutorForBooking;

        setSelectedCourseForTutors(courseRecord);
        setAvailabilityEntry('tutorModal');
        setSelectedTutorForCalendar(tutorForCalendar);
        setTutorsForCourse([]);
        setShowJointCalendar(false);
        setShowTutorView(false);
        setShowIndividualCalendar(true);
        setShowCourseSelectionModal(false);
        setSelectedTutorForBooking(null);
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
        showTutorView || showIndividualCalendar || showJointCalendar;

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
    if (showIndividualCalendar) {
        courseAvailabilityMain = (
            <>
                <PageSectionHeader
                    sticky
                    backAction={{
                        onClick: handleBackFromEmbeddedCalendar,
                        ariaLabel: t('common.back'),
                    }}
                    title={selectedTutorForCalendar?.name || ''}
                    subtitle={embeddedCourseName || undefined}
                    below={
                        availabilityEntry === 'tutorModal' ? (
                            <p className="course-availability-shell__direct-hint">
                                {t('search.directBooking.hint')}
                            </p>
                        ) : null
                    }
                />
                <AvailabilityCalendar
                    tutorId={
                        selectedTutorForCalendar?.uid ||
                        selectedTutorForCalendar?.id ||
                        selectedTutorForCalendar?.email
                    }
                    tutorName={selectedTutorForCalendar?.name}
                    course={embeddedCourseName}
                    courseId={embeddedCourseId || embeddedCourseName || undefined}
                    mode="individual"
                />
            </>
        );
    } else if (showJointCalendar) {
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
                                        selectedCourseForTutors?.nombre ||
                                        selectedCourseForTutors?.name
                                    }
                                    onReservar={handleReservarTutor}
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
            {/* Course Selection Modal */}
            {showCourseSelectionModal && selectedTutorForBooking && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4 sm:p-6">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-4 sm:p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto relative">
                        {loadingCourseFlowTransition ? (
                            <div
                                className="absolute inset-0 rounded-xl bg-white/70 flex flex-col items-center justify-center z-10"
                                aria-busy="true"
                                aria-live="polite"
                            >
                                <div className="w-10 h-10 border-4 border-[#FFF8F0] border-t-[#FDAE1E] rounded-full animate-spin mb-2" />
                                <p className="text-sm text-gray-600">{t('search.states.loading')}</p>
                            </div>
                        ) : null}
                        {(() => {
                            const n =
                                selectedTutorForBooking.normalizedCourses?.length ??
                                selectedTutorForBooking.courseOptions?.length ??
                                0;
                            const tutorName = selectedTutorForBooking.name;
                            if (n === 0) {
                                return (
                                    <>
                                        <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4 break-words">
                                            {t('search.modal.noCoursesTitle')}
                                        </h3>
                                        <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                                            {t('search.modal.noCoursesDesc')}
                                        </p>
                                    </>
                                );
                            }
                            return (
                                <>
                                    <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4 break-words">
                                        {n === 1
                                            ? t('search.modal.selectCourseSingle', { tutor: tutorName })
                                            : t('search.modal.selectCourse', { tutor: tutorName })}
                                    </h3>
                                    <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                                        {n === 1
                                            ? t('search.modal.selectCourseSingleDesc')
                                            : t('search.modal.selectCourseDesc')}
                                    </p>
                                </>
                            );
                        })()}
                        <div className="space-y-3">
                            {(selectedTutorForBooking.normalizedCourses ?? []).map((label, idx) => {
                                const courseObj = selectedTutorForBooking.courseOptions?.[idx];
                                const displayLabel = String(label ?? '');
                                return (
                                    <button
                                        key={`${idx}-${displayLabel}`}
                                        type="button"
                                        onClick={() =>
                                            handleCourseSelectionConfirm(displayLabel, courseObj)
                                        }
                                        className="w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg border border-gray-200 hover:border-[#FF8C00] hover:bg-[#FFF8F0] transition-colors flex items-center justify-between group"
                                    >
                                        <span className="font-medium text-sm sm:text-base text-gray-700 group-hover:text-[#FF8C00] break-words flex-1">
                                            {displayLabel}
                                        </span>
                                        <span className="text-gray-400 group-hover:text-[#FF8C00] ml-2 flex-shrink-0">
                                            →
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            type="button"
                            disabled={loadingCourseFlowTransition}
                            onClick={() => {
                                setShowCourseSelectionModal(false);
                                setSelectedTutorForBooking(null);
                            }}
                            className="mt-4 sm:mt-6 w-full py-2.5 sm:py-2 text-gray-500 hover:text-gray-700 font-medium text-sm sm:text-base disabled:opacity-50"
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </div>
            )}

                {inCourseAvailabilityFlow ? (
                    <div
                        className={`course-availability-shell course-availability-shell--wide${
                            availabilityEntry === 'tutorModal'
                                ? ' course-availability-shell--direct-tutor'
                                : ''
                        }`}
                    >
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
