"use client";

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../../context/SecureAuthContext';
import { SlotService } from '../../services/utils/SlotService';
import { TutoringSessionService } from '../../services/core/TutoringSessionService';
import SessionBookedModal from '../../components/SessionBookedModal/SessionBookedModal';
import routes from '../../../routes';
import BookingSummary from './BookingSummary';
import BookingForm from './BookingForm';

/** Spinner used by the suspense boundary and the in-page slot check. */
function PageSpinner() {
    return (
        <div className="page-container py-12 flex items-center justify-center min-h-[60vh]">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );
}

/** Inner component — wrapped in Suspense by the default export so
 *  useSearchParams() is safe even under static rendering. */
function AgendarContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, loading: authLoading } = useAuth();

    // 'checking' until SlotService responds; then 'available' or 'unavailable'.
    // 'invalid' covers network/parse errors. Drives which view we render.
    const [slotStatus, setSlotStatus] = useState('checking');
    const [bookingSuccess, setBookingSuccess] = useState(null);

    // Canonical session snapshot from URL params. Memoized so the slot-check
    // effect only fires when params actually change.
    const sessionFromUrl = useMemo(() => {
        const tutorId = searchParams.get('tutorId');
        const start = searchParams.get('start');
        const end = searchParams.get('end');
        if (!tutorId || !start || !end) return null;

        const slotIndexRaw = searchParams.get('slotIndex');
        const priceRaw = searchParams.get('price');

        return {
            tutorId,
            courseId: searchParams.get('courseId') || null,
            tutorName: searchParams.get('tutorName') || '',
            tutorEmail: searchParams.get('tutorEmail') || tutorId,
            course: searchParams.get('course') || '',
            scheduledDateTime: start,
            endDateTime: end,
            slotId: searchParams.get('slotId') || `${tutorId}-${start}`,
            slotIndex: slotIndexRaw !== null ? Number(slotIndexRaw) : 0,
            parentAvailabilityId: searchParams.get('parentAvailabilityId') || null,
            price: priceRaw ? Number(priceRaw) : 50000,
            location: searchParams.get('location') || 'Virtual',
        };
    }, [searchParams]);

    // Defensive redirects: missing params, no session, or unauthenticated.
    useEffect(() => {
        if (authLoading) return;
        if (!sessionFromUrl) {
            router.replace(routes.SEARCH_TUTORS);
            return;
        }
        if (!user || !user.isLoggedIn) {
            router.replace(routes.LOGIN);
        }
    }, [authLoading, sessionFromUrl, user, router]);

    // Re-validate slot availability against the server. Same call the calendar
    // makes before opening the booking flow — guards against the slot getting
    // booked by someone else between selection and confirmation.
    useEffect(() => {
        if (!sessionFromUrl) return;
        let cancelled = false;
        setSlotStatus('checking');

        const slotForCheck = {
            id: sessionFromUrl.slotId,
            tutorId: sessionFromUrl.tutorId,
            courseId: sessionFromUrl.courseId,
            startDateTime: sessionFromUrl.scheduledDateTime,
            endDateTime: sessionFromUrl.endDateTime,
            parentAvailabilityId: sessionFromUrl.parentAvailabilityId,
            slotIndex: sessionFromUrl.slotIndex,
        };

        SlotService.checkSlotAvailabilityRealTime(slotForCheck, TutoringSessionService)
            .then((result) => {
                if (cancelled) return;
                setSlotStatus(result.available ? 'available' : 'unavailable');
            })
            .catch((err) => {
                console.error('[AgendarPage] Error checking slot availability:', err);
                if (!cancelled) setSlotStatus('invalid');
            });

        return () => {
            cancelled = true;
        };
    }, [sessionFromUrl]);

    if (authLoading || !sessionFromUrl || slotStatus === 'checking') {
        return <PageSpinner />;
    }

    if (slotStatus === 'unavailable' || slotStatus === 'invalid') {
        const isUnavailable = slotStatus === 'unavailable';
        return (
            <div className="page-container py-12">
                <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
                    <h1 className="text-xl font-bold text-gray-900 mb-2">
                        {isUnavailable
                            ? 'Este horario ya no está disponible'
                            : 'No pudimos verificar el horario'}
                    </h1>
                    <p className="text-sm text-gray-500 mb-6">
                        {isUnavailable
                            ? 'Otro estudiante reservó este slot mientras lo revisabas. Vuelve a buscar para ver los horarios actualizados.'
                            : 'Hubo un problema al verificar la disponibilidad. Intenta de nuevo en unos momentos.'}
                    </p>
                    <Link
                        href={routes.SEARCH_TUTORS}
                        className="inline-flex items-center gap-2 bg-[#FF8C00] text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-[#e07d00] transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Volver a buscar
                    </Link>
                </div>
            </div>
        );
    }

    // Augment the URL snapshot with student info from the auth context.
    // Keeping student data out of the URL avoids leaking PII into history/logs.
    const fullSession = {
        ...sessionFromUrl,
        studentId: user?.uid || user?.id || null,
        studentName: user?.name || 'Estudiante',
        studentPhone: user?.phone || '3000000000',
        studentEmail: user?.email || '',
    };

    return (
        <main className="page-container py-6 lg:py-10 min-h-[calc(100vh-5rem)]">
            <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-4 flex-wrap">
                <Link
                    href={routes.SEARCH_TUTORS}
                    className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
                >
                    <ChevronLeft className="w-4 h-4" />
                    Buscar tutores
                </Link>
                <span className="text-gray-300">/</span>
                <span className="text-gray-900 font-medium truncate min-w-0">
                    Agendar con {fullSession.tutorName || 'tutor'}
                </span>
            </nav>

            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
                Confirmación de Sesión
            </h1>

            <div className="grid lg:grid-cols-[minmax(280px,1fr)_2fr] gap-6 items-start">
                <aside className="lg:sticky lg:top-24">
                    <BookingSummary session={fullSession} />
                </aside>
                <section>
                    <BookingForm
                        session={fullSession}
                        onSuccess={(result) => setBookingSuccess(result)}
                    />
                </section>
            </div>

            {/* Success overlay — reuses the existing SessionBookedModal so
                the success UX matches what users already see today. */}
            <SessionBookedModal
                isOpen={Boolean(bookingSuccess)}
                onClose={() => router.push(routes.SEARCH_TUTORS)}
                userType="student"
                sessionData={
                    bookingSuccess?.session
                        ? {
                              scheduledDateTime:
                                  bookingSuccess.session.startTimestamp ||
                                  fullSession.scheduledDateTime,
                              tutorName:
                                  bookingSuccess.session.tutor?.name || fullSession.tutorName,
                              course:
                                  bookingSuccess.session.course?.name || fullSession.course,
                              location: bookingSuccess.session.locationType || 'Virtual',
                              googleMeetLink: bookingSuccess.session.googleMeetLink || null,
                          }
                        : {
                              scheduledDateTime: fullSession.scheduledDateTime,
                              tutorName: fullSession.tutorName,
                              course: fullSession.course,
                              location: fullSession.location || 'Virtual',
                              googleMeetLink: null,
                          }
                }
            />
        </main>
    );
}

export default function AgendarPage() {
    return (
        <Suspense fallback={<PageSpinner />}>
            <AgendarContent />
        </Suspense>
    );
}
